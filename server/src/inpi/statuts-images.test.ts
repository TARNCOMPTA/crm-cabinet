import { describe, it, expect } from 'vitest';
import { pagesDemandees } from './statuts-images.js';
import { crc32, encoderPng, facteurPour, reduire } from './png.js';

/**
 * Ce qui se teste sans PDF : le choix des pages, et l'encodage.
 *
 * L'extraction elle-meme demande un vrai document et se verifie sur le harnais.
 * Ici on fige les deux calculs qui decident du volume de la reponse — un modele
 * noye sous seize pages pleine resolution ne lit plus rien.
 */

describe('pagesDemandees', () => {
  it('rend les premieres pages quand rien n’est demande', () => {
    expect(pagesDemandees(undefined, 20)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pagesDemandees('', 3)).toEqual([1, 2, 3]);
  });

  it('lit un intervalle', () => {
    expect(pagesDemandees('9-12', 20)).toEqual([9, 10, 11, 12]);
  });

  it('lit une enumeration, triee et dedoublonnee', () => {
    expect(pagesDemandees('5,1,5,3', 20)).toEqual([1, 3, 5]);
  });

  it('melange intervalles et pages seules', () => {
    expect(pagesDemandees('1-3, 8', 20)).toEqual([1, 2, 3, 8]);
  });

  /** Une page hors du document n'est pas une erreur : elle est ignoree. */
  it('ecarte ce qui deborde du document', () => {
    expect(pagesDemandees('1-99', 3)).toEqual([1, 2, 3]);
    expect(pagesDemandees('42', 3)).toEqual([1, 2, 3]);
  });

  /**
   * ⚠️ LE PLAFOND EST LA POUR LE CONTEXTE DU MODELE, pas pour le serveur. Trente
   * pages en image saturent une conversation ; au-dela, mieux vaut que l'appelant
   * redemande.
   */
  it('borne le nombre de pages', () => {
    expect(pagesDemandees('1-500', 500).length).toBe(30);
  });

  it('ne rend jamais une liste vide sur un document non vide', () => {
    expect(pagesDemandees('n’importe quoi', 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('encodage PNG', () => {
  /** La valeur canonique de la specification : sans elle, aucun bloc n'est lu. */
  it('calcule le CRC32 de reference', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('produit un fichier qui commence par la signature PNG', () => {
    const png = encoderPng(new Uint8Array(3 * 2 * 3), 3, 2, 3);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.subarray(-8, -4).toString('ascii')).toBe('IEND');
  });

  /** Une longueur qui ne tombe pas juste est une erreur d'appel, pas un fichier tordu. */
  it('refuse un tampon de la mauvaise taille', () => {
    expect(() => encoderPng(new Uint8Array(10), 3, 2, 3)).toThrow(/octets/);
  });

  it('choisit le facteur de reduction', () => {
    expect(facteurPour(1000, 1400)).toBe(1);
    expect(facteurPour(2480, 1400)).toBe(2);
    expect(facteurPour(4961, 1400)).toBe(4);
  });

  /**
   * ⚠️ MOYENNE DE BLOC ET NON PRELEVEMENT. Sur du texte scanne, prendre un pixel
   * sur N fait disparaitre les traits fins : une image de la bonne taille, et
   * illisible. La moyenne les conserve en gris.
   */
  it('moyenne les blocs au lieu de prelever', () => {
    // Deux colonnes : l'une noire, l'autre blanche. Le prelevement rendrait 0
    // ou 255 ; la moyenne rend le gris intermediaire.
    const px = new Uint8Array([0, 255, 0, 255]);
    const r = reduire(px, 2, 2, 1, 2);
    expect(r.largeur).toBe(1);
    expect(r.hauteur).toBe(1);
    expect(r.pixels[0]).toBe(128);
  });

  it('ne touche a rien quand le facteur vaut 1', () => {
    const px = new Uint8Array([1, 2, 3, 4]);
    const r = reduire(px, 2, 2, 1, 1);
    expect([...r.pixels]).toEqual([1, 2, 3, 4]);
    expect(r.largeur).toBe(2);
  });
});

/**
 * Le décodeur des scans, sur un PDF fabriqué ici.
 * ---------------------------------------------------------------------------
 * ⚠️ CE BLOC EXISTE PARCE QU'IL A MANQUÉ. Les statuts déposés au greffe sont
 * scannés en CCITTFax ou en JBIG2, et la bibliothèque PDF retenue au départ
 * (`unpdf`) n'embarquait aucun de ces deux décodeurs : pdf.js journalisait
 * « Jbig2Error: JBig2 failed to initialize », résolvait l'objet image à `null`,
 * et l'outil rendait une page vide sans rien dire. Trois tours de correctifs à
 * l'aveugle — opérateurs, clés, format des pixels — avant de trouver que la
 * cause était l'absence pure et simple du décodeur.
 *
 * Ces tests fabriquent le document minimal qui exerce chaque codec. Sans vrai
 * dépôt sous la main — le harnais n'a pas d'accès INPI — c'est la seule façon
 * de faire échouer la régression avant la production plutôt qu'après.
 */
describe('decodage des scans', () => {
  /** Un PDF d'une page, dont le contenu est une seule image. */
  function pdfUneImage(dictImage: string, donnees: Buffer): Buffer {
    const flux = 'q 200 0 0 200 0 0 cm /Im0 Do Q';
    const corps: Record<number, string> = {
      1: '<</Type/Catalog/Pages 2 0 R>>',
      2: '<</Type/Pages/Kids[3 0 R]/Count 1>>',
      3: '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]'
        + '/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>',
    };

    const morceaux: Buffer[] = [];
    const decalages: number[] = [];
    let position = 0;
    const pousser = (v: string | Buffer) => {
      // `latin1` et non `utf8` : un PDF se compte en OCTETS, et les décalages
      // de la table xref seraient faux au premier caractère non ASCII.
      const b = Buffer.isBuffer(v) ? v : Buffer.from(v, 'latin1');
      morceaux.push(b);
      position += b.length;
    };

    pousser('%PDF-1.7\n');
    for (const n of [1, 2, 3]) {
      decalages[n] = position;
      pousser(`${n} 0 obj\n${corps[n]}\nendobj\n`);
    }
    decalages[4] = position;
    pousser(`4 0 obj\n<<${dictImage}/Length ${donnees.length}>>\nstream\n`);
    pousser(donnees);
    pousser('\nendstream\nendobj\n');
    decalages[5] = position;
    pousser(`5 0 obj\n<</Length ${flux.length}>>\nstream\n${flux}\nendstream\nendobj\n`);

    const debutXref = position;
    let xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (const n of [1, 2, 3, 4, 5]) {
      xref += `${String(decalages[n]!).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${debutXref}\n%%EOF\n`;
    pousser(xref);
    return Buffer.concat(morceaux);
  }

  const LARGEUR = 64;
  const HAUTEUR = 64;

  /**
   * Un flux CCITT groupe 4 valide, pour une image entièrement d'une couleur.
   *
   * En G4, une ligne identique à la ligne de référence — toutes deux sans
   * changement de couleur — se code par un unique bit de mode vertical V(0),
   * donc « 1 ». D'où un octet plein par huit lignes, suivi de l'EOFB
   * (`000000000001` deux fois) que la spécification place en fin de bloc.
   */
  function ccittUni(hauteur: number): Buffer {
    const bits: number[] = [];
    for (let i = 0; i < hauteur; i++) bits.push(1);
    for (const c of '000000000001000000000001') bits.push(c === '1' ? 1 : 0);
    while (bits.length % 8 !== 0) bits.push(0);
    const octets = Buffer.alloc(bits.length / 8);
    bits.forEach((b, i) => {
      if (b) octets[i >> 3] |= 0x80 >> (i & 7);
    });
    return octets;
  }

  function pdfCcitt(blackIs1: boolean): Buffer {
    return pdfUneImage(
      `/Type/XObject/Subtype/Image/Width ${LARGEUR}/Height ${HAUTEUR}`
        + '/ColorSpace/DeviceGray/BitsPerComponent 1/Filter/CCITTFaxDecode'
        + `/DecodeParms<</K -1/Columns ${LARGEUR}/Rows ${HAUTEUR}`
        + `/BlackIs1 ${blackIs1}>>`,
      ccittUni(HAUTEUR)
    );
  }

  /**
   * ⚠️ LA RÉGRESSION EXACTE : zéro image, et un diagnostic muet sur la cause.
   *
   * ⚠️ ET UN DÉLAI EXPLICITE, PARCE QUE LES 5 SECONDES PAR DÉFAUT NE SUFFISENT
   * PAS TOUJOURS. Ce cas décode réellement une page CCITTFax : ~300 ms de
   * calcul quand la machine est libre, davantage quand les 758 tests de la
   * suite et le navigateur de bout en bout se partagent les cœurs. Il a expiré
   * le 2026-09-04 dans `npm run test:tout`, et passait seul dans la seconde —
   * la signature exacte d'un délai trop court, pas d'une régression.
   *
   * Le délai par défaut de vitest n'est pas un choix, c'est une valeur qu'on
   * subit. Ici on en fait un : large pour la contention, assez court pour
   * qu'un vrai blocage se voie encore.
   */
  it('rend une image sur une page CCITTFax', async () => {
    const { imagesDesPages } = await import('./statuts-images.js');
    const sortie = await imagesDesPages(pdfCcitt(false), { pages: [1] });

    expect(sortie.diagnostic).toEqual([]);
    expect(sortie.images).toHaveLength(1);
    expect(sortie.images[0]).toMatchObject({ page: 1, largeur: LARGEUR, hauteur: HAUTEUR });
  }, 30_000);

  /**
   * Le décodeur tourne VRAIMENT, il ne rend pas un tampon vide.
   *
   * `BlackIs1` inverse la convention de couleur du flux : à données
   * identiques, l'image doit changer. Un décodeur en panne qui rendrait des
   * zéros produirait deux PNG identiques et passerait le test précédent.
   */
  it('honore BlackIs1, donc decode reellement les donnees', async () => {
    const { imagesDesPages } = await import('./statuts-images.js');
    const clair = await imagesDesPages(pdfCcitt(false), { pages: [1] });
    const sombre = await imagesDesPages(pdfCcitt(true), { pages: [1] });

    expect(clair.images).toHaveLength(1);
    expect(sombre.images).toHaveLength(1);
    expect(clair.images[0]!.png.equals(sombre.images[0]!.png)).toBe(false);
  });

  /**
   * JBIG2 : on ne fabrique pas un flux valide — le format est trop lourd pour
   * une donnée de test honnête. Ce qui se vérifie, et qui est LE défaut vécu,
   * c'est que le décodeur soit ATTEIGNABLE : un « failed to initialize » veut
   * dire qu'aucune image JBIG2 ne sortira jamais, quel que soit le document.
   */
  it('atteint le decodeur JBIG2', async () => {
    const { imagesDesPages } = await import('./statuts-images.js');
    const sortie = await imagesDesPages(
      pdfUneImage(
        `/Type/XObject/Subtype/Image/Width ${LARGEUR}/Height ${HAUTEUR}`
          + '/ColorSpace/DeviceGray/BitsPerComponent 1/Filter/JBIG2Decode',
        Buffer.from([0x00, 0x00, 0x00, 0x01, 0x30, 0x00, 0x01, 0x00])
      ),
      { pages: [1] }
    );

    const dits = sortie.diagnostic.flatMap((d) => d.avertissements).join(' ');
    expect(dits).not.toMatch(/failed to initialize/i);
  });
});
