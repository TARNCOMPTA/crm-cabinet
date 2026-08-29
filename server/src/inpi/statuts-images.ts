/**
 * Un statut scanné, rendu lisible : les pages en images.
 * ---------------------------------------------------------------------------
 * `statuts-texte.ts` refuse de deviner quand le document n'a pas de couche
 * texte, et il a raison. Mais l'état `scanne` était un cul-de-sac : l'outil
 * répondait « c'est une image, ouvrez-la vous-même », et le modèle ne pouvait
 * rien faire de plus. Or les statuts scannés sont ceux des SOCIÉTÉS LES PLUS
 * ANCIENNES — précisément celles dont personne ne se rappelle la répartition.
 *
 * Ce module rend les pages en PNG pour que le modèle les LISE. Ce n'est pas de
 * l'OCR : on ne devine rien, on montre le document.
 *
 * ⚠️ LE DÉCODEUR DES SCANS EST DANS `pdfjs.ts`, ET C'EST TOUT LE SUJET. Un
 * dépôt de greffe est encodé en CCITTFax ou en JBIG2, que `unpdf` ne savait pas
 * décoder — l'objet image se résolvait à `null` et la page paraissait vide. Ce
 * module n'a jamais eu de défaut de ce côté-là ; il lui manquait un décodeur.
 *
 * ⚠️ ON EXTRAIT L'IMAGE EMBARQUÉE, ON NE REND PAS LA PAGE. Rasteriser
 * demanderait un canevas, donc `@napi-rs/canvas` — une dépendance NATIVE, que
 * le dossier refuse. Un scan n'en a pas besoin : sa
 * page EST une image, déjà là, qu'il suffit de sortir. Le jour où un document
 * mélange du texte et des images, ce module ne rendra que les images — et c'est
 * assumé : ces documents-là ont une couche texte, donc ne passent pas par ici.
 */

import { chargerPdfjs, fermerPdf, ouvrirPdf } from './pdfjs.js';
import { encoderPng, facteurPour, reduire, type Canaux } from './png.js';

export interface PageImage {
  page: number;
  png: Buffer;
  largeur: number;
  hauteur: number;
}

/** Ce qu'on a observé sur une page qui n'a produit aucune image. */
export interface Diagnostic {
  page: number;
  /** Les opérateurs d'image rencontrés, par leur nom pdf.js. */
  operateurs: string[];
  /** Les clés d'objet retenues. */
  cles: string[];
  /**
   * Ce que pdf.js a signalé pendant le dépouillement de la page.
   *
   * ⚠️ C'EST LE SEUL ENDROIT OÙ UN ÉCHEC DE DÉCODAGE SE VOIT. pdf.js n'échoue
   * pas quand il ne sait pas décoder une image : il écrit un avertissement,
   * résout l'objet à `null`, et continue. Sans cette capture, une page
   * indéchiffrable est indistinguable d'une page sans image — c'est ce qui a
   * coûté trois tours de correctifs à l'aveugle sur les statuts scannés.
   */
  avertissements: string[];
  objets: {
    cle: string;
    /** pdf.js connaît la clé — même s'il a rendu un objet vide. */
    annonce: boolean;
    trouve: boolean;
    aDesDonnees: boolean;
    kind: number | null;
    largeur: number | null;
    hauteur: number | null;
    octets: number | null;
  }[];
}

/**
 * Retient une clé si elle en a l'air.
 *
 * Le filtre est LARGE à dessein : `img_p0_1`, `mask_p3_2`, mais aussi
 * `g_d0_img_p0_1` que le cache global de pdf.js produit. Retenir une clé de
 * trop ne coûte qu'une lecture qui rendra `null` ; en manquer une coûte une
 * page illisible.
 */
function retenirCle(cles: Set<string>, valeur: string): void {
  if (/(^|_)(img|mask)_/.test(valeur)) cles.add(valeur);
}

type ObjetImage = {
  data?: Uint8Array | Uint8ClampedArray;
  width?: number;
  height?: number;
  kind?: number;
};

interface MagasinPdfjs {
  get: (cle: string, rappel: (o: unknown) => void) => void;
  has?: (c: string) => boolean;
}

/**
 * Lit un objet d'un magasin pdf.js.
 *
 * Rend `{ annonce, objet }` et non le seul objet, parce que les deux zéros ne
 * disent pas la même chose : `annonce: false` veut dire que pdf.js n'a jamais
 * entendu parler de cette clé — on a retenu une clé de trop, sans gravité —,
 * tandis qu'`annonce: true` avec `objet: null` veut dire qu'il l'a produite ET
 * VIDÉE, c'est-à-dire qu'il n'a pas su la décoder. Le second cas est un défaut,
 * le premier n'en est pas un ; les confondre a coûté trois tours.
 */
async function lireObjet(
  magasin: MagasinPdfjs,
  cle: string
): Promise<{ annonce: boolean; objet: ObjetImage | null }> {
  // Chemin courant : à la fin de `getOperatorList()`, l'objet est déjà résolu.
  // `has()` le dit, et `get()` sans rappel le rend alors tout de suite — y
  // compris quand il vaut `null`.
  try {
    if (magasin.has?.(cle)) {
      const direct = (magasin as unknown as { get: (c: string) => unknown }).get(cle);
      return { annonce: true, objet: (direct ?? null) as ObjetImage | null };
    }
  } catch {
    // `get()` sans rappel lève si l'objet n'est pas résolu : on repasse par le
    // chemin à rappel plutôt que d'abandonner.
  }

  return new Promise((resoudre) => {
    try {
      // ⚠️ LA FORME À RAPPEL EST OBLIGATOIRE ICI. pdf.js remplit ses magasins
      // au fil du dépouillement, et une lecture directe rendait « objet non
      // résolu » sur un PDF parfaitement valide. Constaté, pas supposé.
      //
      // Une minuterie borne l'attente : `get()` à rappel CRÉE l'entrée
      // manquante et attend qu'elle vienne, donc sur une clé que le document ne
      // contient pas le rappel n'arrive JAMAIS et l'outil entier reste pendu.
      // Deux secondes : au-delà, on a déjà la réponse — l'objet n'existe pas.
      const minuterie = setTimeout(() => resoudre({ annonce: false, objet: null }), 2_000);
      magasin.get(cle, (o) => {
        clearTimeout(minuterie);
        resoudre({ annonce: true, objet: (o ?? null) as ObjetImage | null });
      });
    } catch {
      resoudre({ annonce: false, objet: null });
    }
  });
}

export interface OptionsImages {
  /** Numéros de page, à partir de 1. */
  pages: number[];
  /** Au-delà, l'image est réduite. 1400 px : un texte imprimé y reste lisible. */
  largeurMax?: number;
  /**
   * Plafond de la charge utile, images encodées.
   *
   * ⚠️ LE BASE64 GONFLE D'UN TIERS : ce plafond est en octets binaires, la
   * réponse JSON en fera un tiers de plus. 5 Mo d'images font donc près de
   * 7 Mo de JSON-RPC, ce qui est déjà beaucoup à faire traverser à un client.
   */
  octetsMax?: number;
}

/**
 * Les images d'une page, dépaquetées vers un tableau de canaux entiers.
 *
 * pdf.js rend trois dispositions, et la première est celle des scans les plus
 * courants — le noir et blanc pur d'un fax ou d'une numérisation bitonale, à UN
 * BIT par pixel. La dépaqueter est indispensable : un octet y porte huit
 * pixels, et chaque ligne est complétée jusqu'à l'octet suivant.
 */
function depaqueter(
  image: {
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    kind?: number;
  }
): { pixels: Uint8Array; canaux: Canaux } | null {
  const { data, width, height, kind } = image;

  // 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP (pdf.js ImageKind).
  if (kind === 2) return { pixels: Uint8Array.from(data), canaux: 3 };
  if (kind === 3) return { pixels: Uint8Array.from(data), canaux: 4 };

  /**
   * ⚠️ `kind` ABSENT SIGNIFIE « MASQUE », ET C'EST LE CAS QUI MANQUAIT.
   *
   * Un `/ImageMask` est la forme des scans bitonaux CCITT et JBIG2 — donc de la
   * plupart des documents juridiques numerises. Il n'a pas de `kind`, il est
   * peint par un AUTRE operateur (`paintImageMaskXObject`), et l'ancienne
   * version ne cherchait que `paintImageXObject` : elle rendait ZERO image sur
   * ces pages. Constate a l'usage — un statut de 22 pages dont seule la page de
   * garde, d'un autre format, ressortait.
   *
   * Sa disposition est la meme qu'un gris a 1 bit : bits empaquetes, lignes
   * completees a l'octet. On le traite donc comme tel.
   */
  const estMasque = kind === undefined || kind === null;
  if (kind !== 1 && !estMasque) return null;

  const parLigne = Math.ceil(width / 8);
  const sortie = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const octet = data[y * parLigne + (x >> 3)] ?? 0;
      // ⚠️ LE BIT À 1 EST BLANC, ET J'AVAIS ÉCRIT LE CONTRAIRE. La première
      // version rendait `allume ? 0 : 255`, en supposant que pdf.js livrait un
      // masque inversé. Vérifié dans un navigateur sur un PDF bitonal : le fond
      // sortait NOIR et le texte BLANC — un négatif, que personne ne lit et
      // qu'un modèle déchiffre encore moins. pdf.js conserve ici la convention
      // de `DeviceGray` : 0 est le noir, 1 le blanc.
      const allume = (octet >> (7 - (x & 7))) & 1;
      sortie[y * width + x] = allume ? 255 : 0;
    }
  }
  return { pixels: sortie, canaux: 1 };
}

/**
 * Une seule extraction à la fois.
 *
 * La capture des avertissements de pdf.js remplace `console.warn` le temps du
 * dépouillement. Deux extractions simultanées se voleraient donc leurs
 * messages, et le diagnostic d'une page accuserait le document d'à côté. Un
 * diagnostic qui ment est pire que pas de diagnostic. La sérialisation borne
 * aussi la mémoire : un scan de vingt pages en pleine résolution n'est pas
 * léger, et le serveur n'a pas de raison d'en décoder deux à la fois.
 */
let file: Promise<unknown> = Promise.resolve();
function enFileIndienne<T>(travail: () => Promise<T>): Promise<T> {
  const suite = file.then(travail, travail);
  file = suite.catch(() => undefined);
  return suite;
}

/**
 * Rend en PNG les images embarquées des pages demandées.
 *
 * Une page sans image embarquée n'est pas une erreur : elle est simplement
 * absente du résultat, et l'appelant le voit au numéro qui manque.
 */
export function imagesDesPages(
  pdf: Buffer,
  options: OptionsImages
): Promise<{
  images: PageImage[];
  pagesTotal: number;
  tronque: boolean;
  /** Ce qu'on a trouvé sur les pages qui n'ont rien donné. Voir `Diagnostic`. */
  diagnostic: Diagnostic[];
}> {
  return enFileIndienne(() => extraire(pdf, options));
}

type Sortie = {
  images: PageImage[];
  pagesTotal: number;
  tronque: boolean;
  diagnostic: Diagnostic[];
};

async function extraire(pdf: Buffer, options: OptionsImages): Promise<Sortie> {
  /**
   * ⚠️ ON DÉTOURNE `console.warn`, PARCE QUE pdf.js N'OFFRE RIEN D'AUTRE.
   *
   * Sur une image qu'il ne sait pas décoder, pdf.js n'échoue pas : il écrit
   * « Unable to decode image "img_p1_1": … », résout l'objet à `null` et
   * continue. Aucune exception, aucun code de retour, rien dans l'objet — la
   * cause de trois tours de correctifs à l'aveugle tenait entière dans une
   * ligne de journal que personne ne lisait.
   */
  const avertissements: string[] = [];
  const warnOriginal = console.warn;
  console.warn = (...args: unknown[]) => {
    avertissements.push(args.map((a) => String(a)).join(' '));
  };
  // ⚠️ L'OUVERTURE EST DANS LE `try`. Un PDF tronqué la fait échouer, et
  // `console.warn` resterait alors détourné pour tout le processus.
  let doc: Awaited<ReturnType<typeof ouvrirPdf>> | null = null;
  try {
    doc = await ouvrirPdf(pdf);
    return await depouiller(doc, options, avertissements);
  } finally {
    // Un document laissé ouvert laisse un worker pdf.js vivant, et le serveur
    // ne redémarre pas entre deux appels : la fuite s'accumulerait.
    if (doc) await fermerPdf(doc);
    console.warn = warnOriginal;
    // Recopiés dans le diagnostic, mais leur place est AUSSI dans le journal du
    // serveur : c'est là que l'exploitant les cherchera.
    for (const a of avertissements) warnOriginal(a);
  }
}

async function depouiller(
  doc: Awaited<ReturnType<typeof ouvrirPdf>>,
  options: OptionsImages,
  avertissements: string[]
): Promise<Sortie> {
  const largeurMax = options.largeurMax ?? 1400;
  const octetsMax = options.octetsMax ?? 5 * 1024 * 1024;

  const pdfjs = await chargerPdfjs();
  const DEPENDANCE = pdfjs.OPS.dependency;
  const nomOperateur = new Map<number, string>(
    Object.entries(pdfjs.OPS).map(([nom, code]) => [code as number, nom])
  );

  const images: PageImage[] = [];
  const diagnostic: Diagnostic[] = [];
  let octets = 0;
  let tronque = false;

  for (const numero of options.pages) {
    if (numero < 1 || numero > doc.numPages) continue;
    const avantAvertissements = avertissements.length;
    const page = await doc.getPage(numero);
    const ops = await page.getOperatorList();

    /**
     * ⚠️ LES CLÉS VIENNENT DES DÉPENDANCES, PAS D'UN OPÉRATEUR DE PEINTURE.
     *
     * pdf.js émet ONZE opérateurs d'image différents — `paintImageXObject`,
     * `paintImageMaskXObject`, leurs variantes « Repeat » et « Group », les
     * images en ligne… La première version n'en connaissait qu'un, et rendait
     * donc zéro image sur toutes les pages peintes autrement. Les énumérer tous
     * serait un jeu de piste sans fin : leurs arguments n'ont même pas la même
     * forme — une clé pour l'un, un objet dont le champ `data` PORTE la clé
     * pour un masque.
     *
     * L'opérateur `dependency`, lui, liste ce dont la page a besoin, quelle que
     * soit la façon dont c'est peint. C'est une seule source, et elle ne
     * dépendra pas du prochain format de scan rencontré.
     */
    const cles = new Set<string>();
    const operateursVus = new Set<string>();

    for (let i = 0; i < ops.fnArray.length; i++) {
      const code = ops.fnArray[i]!;
      const nom = nomOperateur.get(code) ?? String(code);
      if (/image|Image/.test(nom)) operateursVus.add(nom);

      const args = ops.argsArray[i];
      if (!args) continue;

      // Les dépendances d'abord : c'est la source la plus fiable.
      if (code === DEPENDANCE) {
        for (const arg of args) if (typeof arg === 'string') retenirCle(cles, arg);
        continue;
      }

      /**
       * ⚠️ ET AUSSI LES ARGUMENTS DES OPÉRATEURS, parce que la dépendance ne
       * suffit pas toujours. pdf.js promeut une image vue sur plusieurs pages
       * vers son cache GLOBAL : la clé prend alors un préfixe `g_`, l'objet
       * vit dans `commonObjs` et non dans `objs`, et la dépendance n'est plus
       * réémise page après page.
       *
       * Les formes d'arguments diffèrent selon l'opérateur : une clé nue, un
       * objet dont `data` porte la clé (les masques), ou un TABLEAU de tels
       * objets (les variantes « Group »). On les couvre toutes plutôt que
       * d'énumérer les opérateurs — c'est ce jeu de piste qui a déjà coûté
       * deux tours.
       */
      for (const arg of args) {
        if (typeof arg === 'string') retenirCle(cles, arg);
        else if (Array.isArray(arg)) {
          for (const e of arg) {
            if (typeof e === 'string') retenirCle(cles, e);
            else if (e && typeof (e as { data?: unknown }).data === 'string') {
              retenirCle(cles, (e as { data: string }).data);
            }
          }
        } else if (arg && typeof (arg as { data?: unknown }).data === 'string') {
          retenirCle(cles, (arg as { data: string }).data);
        }
      }
    }

    const avant = images.length;
    const objetsVus: Diagnostic['objets'] = [];

    for (const cle of cles) {

      // ⚠️ LA FORME À RAPPEL EST OBLIGATOIRE. `objs.get(cle)` seul rend
      // l'objet UNIQUEMENT s'il est déjà résolu ; pdf.js les remplit au fil du
      // dépouillement, et la lecture directe rendait « objet non résolu » sur
      // un PDF parfaitement valide. Constaté, pas supposé.
      // ⚠️ `objs` PUIS `commonObjs` : une image promue au cache global de
      // pdf.js ne vit plus dans le magasin de la page.
      const dansLaPage = await lireObjet(page.objs, cle);
      const lu = dansLaPage.objet ? dansLaPage : await lireObjet(page.commonObjs, cle);
      const brute = lu.objet;

      objetsVus.push({
        cle,
        annonce: dansLaPage.annonce || lu.annonce,
        trouve: brute !== null,
        aDesDonnees: !!brute?.data,
        kind: brute?.kind ?? null,
        largeur: brute?.width ?? null,
        hauteur: brute?.height ?? null,
        octets: brute?.data?.length ?? null,
      });

      // ⚠️ PAS DE TEST SUR `kind` ICI : un masque n'en a pas, et l'exiger
      // écartait précisément les pages qu'on cherche à lire.
      if (!brute?.data || !brute.width || !brute.height) continue;

      const depaquetee = depaqueter({
        data: brute.data,
        width: brute.width,
        height: brute.height,
        kind: brute.kind,
      });
      if (!depaquetee) continue;

      const facteur = facteurPour(brute.width, largeurMax);
      const reduite = reduire(
        depaquetee.pixels,
        brute.width,
        brute.height,
        depaquetee.canaux,
        facteur
      );
      const png = encoderPng(reduite.pixels, reduite.largeur, reduite.hauteur, depaquetee.canaux);

      // Le plafond s'applique AVANT d'ajouter : mieux vaut une page de moins
      // qu'une réponse que le client refusera en bloc.
      if (octets + png.length > octetsMax) {
        tronque = true;
        break;
      }
      octets += png.length;
      images.push({ page: numero, png, largeur: reduite.largeur, hauteur: reduite.hauteur });
    }
    // ⚠️ ON CONSIGNE CE QU'ON A VU QUAND UNE PAGE NE DONNE RIEN. Trois tours
    // de correctifs à l'aveugle ont suffi : sans les documents réels, la seule
    // façon de savoir ce que contient une page est de le faire dire à l'outil.
    if (images.length === avant) {
      diagnostic.push({
        page: numero,
        operateurs: [...operateursVus],
        cles: [...cles],
        avertissements: avertissements.slice(avantAvertissements),
        objets: objetsVus,
      });
    }
    if (tronque) break;
  }

  return { images, pagesTotal: doc.numPages, tronque, diagnostic };
}

/**
 * Les pages demandées, à partir d'une expression du genre « 1-6 » ou « 1,3,8 ».
 *
 * Rend une liste bornée et ordonnée, sans doublon. Une expression vide ou
 * illisible rend les `defaut` premières pages : l'appelant ne doit pas avoir à
 * connaître la syntaxe pour obtenir quelque chose d'utile.
 */
export function pagesDemandees(expression: unknown, pagesTotal: number, defaut = 8): number[] {
  const brut = typeof expression === 'string' ? expression.trim() : '';
  const borne = (n: number) => n >= 1 && n <= pagesTotal;

  if (brut !== '') {
    const retenues = new Set<number>();
    for (const morceau of brut.split(',')) {
      const intervalle = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(morceau);
      if (intervalle) {
        const debut = Number(intervalle[1]);
        const fin = Number(intervalle[2]);
        for (let n = debut; n <= fin && retenues.size < 30; n++) if (borne(n)) retenues.add(n);
        continue;
      }
      const seule = Number(morceau.trim());
      if (Number.isInteger(seule) && borne(seule) && retenues.size < 30) retenues.add(seule);
    }
    if (retenues.size > 0) return [...retenues].sort((a, b) => a - b);
  }

  const combien = Math.min(defaut, pagesTotal);
  return Array.from({ length: combien }, (_, i) => i + 1);
}
