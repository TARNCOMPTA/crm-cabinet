/**
 * pdf.js, ouvert avec les décodeurs d'images BRANCHÉS.
 * ---------------------------------------------------------------------------
 * ⚠️ POURQUOI CE MODULE EXISTE, ET POURQUOI `unpdf` A ÉTÉ REMPLACÉ.
 *
 * Les statuts scannés d'un dépôt de greffe sont des images BITONALES, encodées
 * en CCITTFax (le codec du fax) ou en JBIG2. Dans pdf.js 5+, ces deux codecs ne
 * sont plus décodés en JavaScript de bout en bout : une seule classe,
 * `JBig2CCITTFaxImage`, les traite, et elle charge un module WebAssembly
 * (`jbig2.wasm`) ou, à défaut, sa traduction JavaScript
 * (`jbig2_nowasm_fallback.js`).
 *
 * `unpdf` embarque pdf.js mais AUCUN de ces deux fichiers, et son empaquetage
 * avait réduit le chargeur à `return this.#module` — un champ jamais renseigné.
 * Conséquence : sur toute image CCITT ou JBIG2, pdf.js journalisait
 *
 *     Unable to decode image "img_p1_1": "Jbig2Error: JBig2 failed to initialize"
 *
 * puis résolvait l'objet image à `null`. Côté appelant, la page paraissait
 * simplement vide. C'est ce qu'a montré le diagnostic posé en production sur un
 * dépôt de 22 pages : la page 1 (couverture du greffe, en Flate) sortait, les
 * 21 autres — le scan — ne sortaient jamais. Trois tours de correctifs à
 * l'aveugle avant d'avoir la cause : ni les opérateurs, ni les clés, ni le
 * format des pixels n'étaient en jeu. Le décodeur n'existait pas.
 *
 * Reproduit hors production avec deux PDF fabriqués pour l'occasion, un par
 * codec : même message, même signature de diagnostic. Voir
 * `statuts-images.test.ts`, section « decodage des scans ».
 *
 * `pdfjs-dist` livre, lui, les deux formes du décodeur.
 */

import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type * as Pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const exiger = createRequire(import.meta.url);

/**
 * Un dossier de ressources livré par `pdfjs-dist`, en CHEMIN et non en URL.
 *
 * ⚠️ UN `file:` ICI CASSE TOUT EN SILENCE. pdf.js lit ces fichiers par
 * `fs.readFile(url)`, à qui une chaîne `file:///…` ne dit rien : il la prend
 * pour un chemin relatif, échoue, et se rabat — pour le décodeur, sur sa
 * traduction JavaScript ; pour les polices et les tables de caractères, sur
 * rien du tout. Tout continue de fonctionner, en moins bien, sans erreur.
 * La barre oblique finale est indispensable : pdf.js concatène directement le
 * nom de fichier.
 */
function racinePdfjs(sous: string): string {
  return `${dirname(exiger.resolve('pdfjs-dist/package.json'))}/${sous}/`;
}

/**
 * ⚠️ DEUX CLASSES VIDES QUI ÉVITENT UNE DÉPENDANCE NATIVE.
 *
 * `pdfjs-dist` déclare `@napi-rs/canvas` en dépendance OPTIONNELLE, et s'en
 * sert sous Node pour se donner `DOMMatrix` et `Path2D`. Sans elle, le module
 * ne s'importe même pas : sa couche de rendu construit un `new DOMMatrix()` au
 * chargement, et l'import échoue sur `DOMMatrix is not defined`.
 *
 * Or ce dossier refuse le natif — un binaire précompilé de plus, par
 * architecture et par libc, dans une image Alpine qu'un cabinet ne débogue pas
 * à distance. Et ce module ne DESSINE rien : il lit une liste d'opérateurs et
 * des objets image. Les deux classes ne servent qu'à exister.
 *
 * Elles sont volontairement VIDES plutôt que fonctionnelles. Un jour où pdf.js
 * en appellera vraiment une méthode, l'erreur sera immédiate et nommera le
 * coupable, au lieu d'une géométrie fausse rendue sans un mot.
 */
function installerSubstituts(): void {
  const global = globalThis as unknown as Record<string, unknown>;
  global.DOMMatrix ??= class DOMMatrixAbsente {};
  global.Path2D ??= class Path2DAbsente {};
}

let chargement: Promise<typeof Pdfjs> | null = null;

/**
 * Charge pdf.js, une seule fois.
 *
 * ⚠️ L'IMPORT EST DYNAMIQUE PARCE QUE L'ORDRE COMPTE : les substituts doivent
 * être en place AVANT que le module s'évalue. Un `import` statique les aurait
 * fait poser trop tard, et le chargement aurait échoué.
 */
export function chargerPdfjs(): Promise<typeof Pdfjs> {
  chargement ??= (async () => {
    installerSubstituts();
    // pdf.js tente `require('@napi-rs/canvas')` à l'évaluation et journalise un
    // échec de chargement quand le paquet n'est pas là. C'est le cas VOULU (voir
    // `installerSubstituts`), et laisser passer ce cri d'alarme ferait chercher
    // une panne à l'exploitant. On le remplace par ce qu'il faut vraiment
    // savoir, sans rien avaler d'autre.
    const warnOriginal = console.warn;
    console.warn = (...args: unknown[]) => {
      const ligne = args.map((a) => String(a)).join(' ');
      if (ligne.includes('@napi-rs/canvas')) return;
      warnOriginal(...args);
    };
    try {
      return await import('pdfjs-dist/legacy/build/pdf.mjs');
    } finally {
      console.warn = warnOriginal;
    }
  })();
  return chargement;
}

/**
 * Ouvre un PDF pour lecture.
 *
 * `useWorkerFetch: false` bascule le chargement des ressources sur la fabrique
 * Node de pdf.js, qui lit le disque. Le défaut passe par `fetch()`, incapable
 * d'ouvrir un fichier local : c'est cette bascule qui rend le décodeur
 * WebAssembly, les polices standard et les tables de caractères réellement
 * accessibles au lieu d'échouer chacun dans son coin.
 */
export async function ouvrirPdf(pdf: Buffer | Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await chargerPdfjs();
  return pdfjs.getDocument({
    // Une copie : pdf.js prend possession du tampon qu'on lui passe et le vide.
    // Rendre le Buffer de l'appelant inutilisable après lecture serait un piège.
    data: new Uint8Array(pdf),
    useWorkerFetch: false,
    wasmUrl: racinePdfjs('wasm'),
    // Sans elles, l'extraction de texte d'un PDF à polices CID rend des
    // caractères vides — et un statut « sans couche texte » qui en avait une.
    standardFontDataUrl: racinePdfjs('standard_fonts'),
    cMapUrl: racinePdfjs('cmaps'),
    cMapPacked: true,
    // On lit sans navigateur : aucune police à installer dans un document.
    disableFontFace: true,
  }).promise;
}

/**
 * Referme un document et libère le worker pdf.js.
 *
 * ⚠️ `doc.destroy()` N'EXISTE PAS : la destruction appartient à la tâche de
 * chargement, pas au document. Un oubli laisse un worker vivant par appel, et
 * le serveur est un processus long — c'est une fuite, pas un détail de style.
 */
export async function fermerPdf(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.loadingTask.destroy();
  } catch {
    // Refermer ne doit jamais faire échouer une lecture qui a réussi.
  }
}
