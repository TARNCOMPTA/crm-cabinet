/**
 * Lire une répartition des parts depuis un tableau.
 * ---------------------------------------------------------------------------
 * Ce module ne touche ni au fichier, ni au réseau, ni à la base : il prend des
 * LIGNES BRUTES et rend ce qu'on peut en écrire, plus la liste de ce qu'on ne
 * peut pas. C'est ce qui le rend testable, et c'est la raison de sa séparation
 * d'avec la fenêtre qui l'appelle.
 *
 * ⚠️ IL VALIDE POUR MONTRER, PAS POUR CORRIGER. Aucune ligne n'est réparée en
 * silence : une date illisible, un nombre de parts vide ou un démembrement
 * inconnu deviennent une ligne EN ERREUR, affichée telle quelle avant tout
 * enregistrement. Deviner ici — lire « 1 000 » comme 1, prendre une date
 * ambiguë pour ce qu'elle n'est pas — poserait un chiffre faux dans un dossier
 * client, et personne ne reviendrait le vérifier.
 *
 * Le doublon interne au fichier est traité comme une erreur, et ce n'est pas du
 * zèle : `client_associes` porte `UNIQUE (client_id, officer_id, demembrement)`.
 * Deux lignes pour la même personne dans le même démembrement ne créeraient pas
 * un doublon, elles feraient ÉCHOUER l'insertion ENTIÈRE en 23505 — emportant
 * les associés qui n'y étaient pour rien. La leçon est celle de
 * `affectationCollaborateurs.ts`, apprise sur les collaborateurs.
 */

/** L'en-tête du modèle, dans l'ordre. Le fichier doit suivre ces colonnes. */
export const COLONNES_MODELE = [
  'Prenom',
  'Nom ou denomination',
  'Personne morale (oui/non)',
  'Nombre de parts',
  'Detention',
  "Date d'effet",
  'Acte source',
] as const;

export interface LigneImportee {
  /** Le numéro de ligne DANS LE FICHIER, en-tête comprise : celui qu'on montre. */
  ligne: number;
  prenom: string;
  nom: string;
  denomination: string | null;
  personneMorale: boolean;
  nbParts: number;
  demembrement: string;
  dateEffet: string | null;
  acteSource: string | null;
  etat: 'valide' | 'erreur';
  erreur?: string;
}

export interface ResultatImport {
  lignes: LigneImportee[];
  total: number;
  valides: number;
  erreurs: number;
  /** Somme des parts VALIDES, usufruit exclu — voir `repartitionParts.ts`. */
  sommeParts: number;
}

/** Minuscules, sans accents, sans espaces de bord : ce qui se compare. */
function reduire(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function chaine(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

const DEMEMBREMENTS: Record<string, string> = {
  '': 'pleine-propriete',
  'pleine propriete': 'pleine-propriete',
  'pleine-propriete': 'pleine-propriete',
  pp: 'pleine-propriete',
  'nue propriete': 'nue-propriete',
  'nue-propriete': 'nue-propriete',
  np: 'nue-propriete',
  usufruit: 'usufruit',
  us: 'usufruit',
  uf: 'usufruit',
};

/**
 * Un nombre de parts.
 *
 * ⚠️ LES SÉPARATEURS DE MILLIERS SONT RETIRÉS, LA VIRGULE EST UNE DÉCIMALE.
 * Un tableur français écrit « 1 000 » avec une espace — insécable la moitié du
 * temps — et « 1,5 » avec une virgule. Lire « 1 000 » comme 1 est le genre
 * d'erreur qui ne se voit pas : le chiffre reste plausible.
 */
export function nombreDeParts(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const brut = String(v ?? '')
    // Espace, insecable (00a0), fine insecable (202f), apostrophe suisse.
    .replace(/[\s\u00a0\u202f\u2009']/g, '')
    .replace(',', '.');
  if (brut === '') return null;
  const n = Number(brut);
  return Number.isFinite(n) ? n : null;
}

/**
 * Une date d'effet, ramenée à `AAAA-MM-JJ`.
 *
 * Trois formes arrivent réellement : l'objet `Date` que le tableur produit pour
 * une cellule au format date, le `JJ/MM/AAAA` qu'on tape, et le `AAAA-MM-JJ`
 * qu'un export recrache. Tout le reste rend `null` — et l'appelant en fait une
 * erreur plutôt que d'inventer.
 *
 * ⚠️ LA DATE DU TABLEUR EST LUE EN COMPOSANTES LOCALES, jamais par `toISOString`
 * qui la ramènerait en UTC et reculerait d'un jour tout ce qui est à l'est de
 * Greenwich — le défaut constaté sur la colonne « Mois de cloture ».
 */
export function dateEffet(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const a = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const j = String(v.getDate()).padStart(2, '0');
    return `${a}-${m}-${j}`;
  }
  const s = chaine(v);
  if (s === '') return null;

  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (fr) {
    const [, j, m, a] = fr;
    return `${a}-${m!.padStart(2, '0')}-${j!.padStart(2, '0')}`;
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const [, a, m, j] = iso;
    return `${a}-${m!.padStart(2, '0')}-${j!.padStart(2, '0')}`;
  }
  return null;
}

/**
 * Analyse les lignes d'un tableau, en-tête comprise.
 *
 * `lignes[0]` est l'en-tête et n'est pas lue : sa présence est ce qui permet
 * d'afficher « ligne 7 » et de retrouver la bonne ligne dans le tableur.
 */
export function analyserLignes(brutes: readonly unknown[][]): ResultatImport {
  const lignes: LigneImportee[] = [];
  // (nom réduit + démembrement) → première ligne où le couple est apparu.
  const vues = new Map<string, number>();

  for (let i = 1; i < brutes.length; i++) {
    const cellules = brutes[i] ?? [];
    // Une ligne entièrement vide n'est pas une erreur : les tableurs en
    // produisent des dizaines sous les données. On l'ignore.
    if (cellules.every((c) => chaine(c) === '')) continue;

    const numero = i + 1;
    const prenom = chaine(cellules[0]);
    const nom = chaine(cellules[1]);
    const morale = ['oui', 'o', 'x', 'true', '1'].includes(reduire(cellules[2]));
    const parts = nombreDeParts(cellules[3]);
    const dem = DEMEMBREMENTS[reduire(cellules[4])];
    const date = chaine(cellules[5]) === '' ? null : dateEffet(cellules[5]);
    const acte = chaine(cellules[6]) || null;

    const base: LigneImportee = {
      ligne: numero,
      prenom: morale ? '' : prenom,
      nom,
      denomination: morale ? nom : null,
      personneMorale: morale,
      nbParts: parts ?? 0,
      demembrement: dem ?? 'pleine-propriete',
      dateEffet: date,
      acteSource: acte,
      etat: 'valide',
    };

    const refuser = (erreur: string) => lignes.push({ ...base, etat: 'erreur', erreur });

    if (nom === '') {
      refuser('Le nom (ou la denomination) est obligatoire.');
      continue;
    }
    if (parts === null) {
      refuser('Nombre de parts absent ou illisible.');
      continue;
    }
    if (parts <= 0) {
      refuser('Le nombre de parts doit etre superieur a zero.');
      continue;
    }
    if (dem === undefined) {
      refuser(
        `Detention inconnue « ${chaine(cellules[4])} ». Attendu : pleine propriete, nue-propriete ou usufruit.`
      );
      continue;
    }
    if (chaine(cellules[5]) !== '' && date === null) {
      refuser("Date d'effet illisible. Attendu : JJ/MM/AAAA.");
      continue;
    }

    const cle = `${reduire(prenom)}|${reduire(nom)}|${morale}|${dem}`;
    const deja = vues.get(cle);
    if (deja !== undefined) {
      refuser(
        `Cette personne figure deja ligne ${deja} dans la meme detention. La base refuserait ` +
          "l'import entier."
      );
      continue;
    }
    vues.set(cle, numero);
    lignes.push(base);
  }

  const valides = lignes.filter((l) => l.etat === 'valide');
  return {
    lignes,
    total: lignes.length,
    valides: valides.length,
    erreurs: lignes.length - valides.length,
    sommeParts: valides
      .filter((l) => l.demembrement !== 'usufruit')
      .reduce((acc, l) => acc + l.nbParts, 0),
  };
}
