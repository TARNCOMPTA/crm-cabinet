/**
 * Lecture XML minimale, suffisante pour les réponses SOAP et REST de
 * jedeclare.com.
 *
 * Pourquoi pas une bibliothèque : le produit s'installe chez des cabinets et
 * chaque dépendance est une surface de plus à auditer et à mettre à jour. Trois
 * expressions régulières couvrent le besoin — les réponses de jedeclare sont
 * plates, sans attributs signifiants, sans espaces de noms à résoudre.
 *
 * Les préfixes d'espace de noms sont ignorés à dessein : `<ns2:codeRetour>` et
 * `<codeRetour>` se lisent pareil, et jedeclare alterne les deux formes selon
 * l'opération.
 *
 * Porté depuis `ecritures-api` (`src/xml.js`), où il est en service.
 */

const balise = (nom: string) => `(?:[A-Za-z0-9_.-]+:)?${nom}`;

/** Contenu de la première balise portant ce nom, déjà déséchappé. */
export function extraire(xml: string | null | undefined, nom: string): string | null {
  const m = new RegExp(`<${balise(nom)}(?:\\s[^>]*)?>([\\s\\S]*?)</${balise(nom)}>`).exec(xml ?? '');
  return m ? dechapper(m[1]) : null;
}

/**
 * Contenu de TOUTES les balises portant ce nom, brut.
 *
 * Volontairement non déséchappé : l'appelant y relance `extraire()` pour lire
 * les sous-balises, et un déséchappement prématuré casserait ce second passage.
 */
export function extraireTous(xml: string | null | undefined, nom: string): string[] {
  const motif = new RegExp(`<${balise(nom)}(?:\\s[^>]*)?>([\\s\\S]*?)</${balise(nom)}>`, 'g');
  const resultats: string[] = [];
  for (const m of String(xml ?? '').matchAll(motif)) resultats.push(m[1] ?? '');
  return resultats;
}

/** Descente par un chemin simple : `chemin(bloc, 'siretPrincipal', 'siren')`. */
export function chemin(xml: string | null | undefined, ...noms: string[]): string | null {
  let courant = xml ?? '';
  for (const nom of noms) {
    const m = new RegExp(`<${balise(nom)}(?:\\s[^>]*)?>([\\s\\S]*?)</${balise(nom)}>`).exec(courant);
    if (!m) return null;
    courant = m[1] ?? '';
  }
  return dechapper(courant);
}

export function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function dechapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    // `&amp;` en DERNIER : le faire plus tôt transformerait `&amp;lt;` en `<`
    // au lieu de `&lt;`.
    .replace(/&amp;/g, '&')
    .trim();
}
