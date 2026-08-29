/**
 * Encoder une image brute en PNG, sans la moindre dépendance.
 * ---------------------------------------------------------------------------
 * Un statut scanné n'a pas de couche texte : son contenu est une IMAGE
 * embarquée par page. Pour qu'un modèle puisse la lire, il faut la lui rendre
 * dans un format qu'il affiche — donc encoder les pixels bruts que pdf.js
 * restitue.
 *
 * ⚠️ POURQUOI PAS UNE BIBLIOTHÈQUE. Les encodeurs disponibles passent par
 * `@napi-rs/canvas` ou `sharp`, tous deux NATIFS. Le dossier tient à rester
 * sans natif — `npm audit` à zéro, aucun script d'installation, aucune
 * compilation — et une image Alpine multi-arch ne se débogue pas à distance
 * chez un cabinet. Un PNG non compressé n'est pas un format
 * compliqué : une signature, trois blocs, un CRC32. Node fournit déjà `zlib`,
 * qui fait tout le travail difficile.
 *
 * Le format est écrit tel que la spécification le décrit (RFC 2083) : chaque
 * ligne de pixels est précédée d'un octet de filtre, ici toujours 0 (« aucun
 * filtre »). Un filtre plus malin compresserait mieux ; il compliquerait le
 * code pour un gain que la déflation absorbe déjà en grande partie.
 */

import { deflateSync } from 'node:zlib';

/**
 * La table CRC32 de la spécification PNG.
 *
 * Calculée une fois : 256 entrées, et chaque bloc du fichier en a besoin.
 */
const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Un bloc PNG : longueur, type, données, CRC du type ET des données. */
function bloc(type: string, donnees: Buffer): Buffer {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length, 0);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps), 0);
  return Buffer.concat([longueur, corps, crc]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Les seules dispositions de pixels que pdf.js restitue et qu'on encode. */
export type Canaux = 1 | 3 | 4;

/**
 * Encode des pixels bruts en PNG.
 *
 * `pixels` est lu ligne par ligne, sans remplissage : `largeur * canaux` octets
 * par ligne. Une longueur qui ne tombe pas juste est une erreur de l'appelant,
 * et mieux vaut le lui dire que produire un fichier tordu.
 */
export function encoderPng(
  pixels: Uint8Array | Uint8ClampedArray,
  largeur: number,
  hauteur: number,
  canaux: Canaux
): Buffer {
  const attendu = largeur * hauteur * canaux;
  if (pixels.length !== attendu) {
    throw new Error(
      `PNG : ${pixels.length} octets pour ${largeur}x${hauteur}x${canaux}, ${attendu} attendus.`
    );
  }

  // Type de couleur PNG : 0 = gris, 2 = RVB, 6 = RVB + alpha.
  const typeCouleur = canaux === 1 ? 0 : canaux === 3 ? 2 : 6;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr.writeUInt8(8, 8); // 8 bits par canal
  ihdr.writeUInt8(typeCouleur, 9);
  // Compression 0, filtrage 0, entrelacement 0 : les seules valeurs admises
  // pour les deux premiers, et pas d'entrelacement.

  // Chaque ligne est précédée de son octet de filtre.
  const parLigne = largeur * canaux;
  const brut = Buffer.alloc(hauteur * (parLigne + 1));
  for (let y = 0; y < hauteur; y++) {
    brut[y * (parLigne + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * parLigne, parLigne).copy(
      brut,
      y * (parLigne + 1) + 1
    );
  }

  return Buffer.concat([
    SIGNATURE,
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(brut, { level: 6 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Réduit une image d'un facteur entier, en moyennant les blocs.
 *
 * ⚠️ LA RÉDUCTION N'EST PAS UNE COQUETTERIE : une page A4 scannée à 300 ppp
 * fait 2480 x 3508 pixels, soit 26 Mo de RVB brut AVANT compression. Envoyée
 * telle quelle à un modèle, page après page, elle épuiserait le contexte bien
 * avant la fin du document. On la ramène à une largeur où un texte imprimé
 * reste lisible.
 *
 * Moyenne de bloc et non prélèvement d'un pixel sur N : sur du texte scanné, le
 * prélèvement fait disparaître les traits fins d'une lettre sur deux, et rend
 * un document que plus personne ne peut lire — ni un modèle, ni un humain.
 */
export function reduire(
  pixels: Uint8Array | Uint8ClampedArray,
  largeur: number,
  hauteur: number,
  canaux: Canaux,
  facteur: number
): { pixels: Uint8Array; largeur: number; hauteur: number } {
  if (facteur <= 1) {
    return { pixels: Uint8Array.from(pixels), largeur, hauteur };
  }
  const nouvelleLargeur = Math.max(1, Math.floor(largeur / facteur));
  const nouvelleHauteur = Math.max(1, Math.floor(hauteur / facteur));
  const sortie = new Uint8Array(nouvelleLargeur * nouvelleHauteur * canaux);

  for (let y = 0; y < nouvelleHauteur; y++) {
    for (let x = 0; x < nouvelleLargeur; x++) {
      for (let c = 0; c < canaux; c++) {
        let somme = 0;
        let n = 0;
        for (let dy = 0; dy < facteur; dy++) {
          const sy = y * facteur + dy;
          if (sy >= hauteur) break;
          for (let dx = 0; dx < facteur; dx++) {
            const sx = x * facteur + dx;
            if (sx >= largeur) break;
            somme += pixels[(sy * largeur + sx) * canaux + c]!;
            n++;
          }
        }
        sortie[(y * nouvelleLargeur + x) * canaux + c] = n > 0 ? Math.round(somme / n) : 0;
      }
    }
  }
  return { pixels: sortie, largeur: nouvelleLargeur, hauteur: nouvelleHauteur };
}

/** Le facteur entier qui ramène une largeur sous la borne demandée. */
export function facteurPour(largeur: number, largeurMax: number): number {
  if (largeur <= largeurMax) return 1;
  return Math.ceil(largeur / largeurMax);
}
