/**
 * La charge envoyée à `clients` à la création d'une fiche.
 * ---------------------------------------------------------------------------
 * ⚠️ CE MODULE EXISTE À CAUSE D'UN DÉFAUT QUI RENDAIT LA CRÉATION IMPOSSIBLE.
 *
 * Un `<input type="date">` vide rend `''`, pas `null`. La fenêtre de création
 * envoyait `{...formData}` tel quel, donc `date_cloture: ''` et
 * `date_creation_entreprise: ''` dès qu'on ne les renseignait pas — et
 * PostgreSQL refusait :
 *
 *     invalid input syntax for type date: ""
 *
 * La fiche n'était pas créée, et le message affiché parlait d'une syntaxe de
 * date à quelqu'un qui venait de saisir un nom d'entreprise. Constaté le
 * 2026-09-05 en voulant vérifier tout autre chose.
 *
 * La transformation vit ici, pure et testée, parce qu'elle est invisible dans du
 * JSX : rien ne distingue à l'œil un champ que la base accepte vide d'un champ
 * qui la fera échouer.
 *
 * ⚠️ LES DATES SEULEMENT, ET PAS UN BALAYAGE GÉNÉRAL DES CHAÎNES VIDES. Vider
 * un champ texte est un geste : « il n'y a pas de complément d'adresse » se
 * distingue de « on ne sait pas ». Sur une date, ce choix n'existe pas — la
 * colonne est nullable et le format ne laisse pas de place au vide.
 */

/** Les colonnes `date` de la fiche client, telles que le formulaire les nomme. */
const CHAMPS_DATE = ['date_cloture', 'date_creation_entreprise', 'date_entree_cabinet'] as const;

/** Les colonnes numériques saisies en texte. */
const CHAMPS_NOMBRE = ['capital_social'] as const;

type Saisie = Record<string, unknown>;

/**
 * Ce que la transformation change, et donc ce que le type doit annoncer.
 *
 * Sans cette déclaration, la fonction rendrait un `Record<string, unknown>` et
 * l'appelant perdrait TOUTES les garanties de type sur la charge envoyée à la
 * base — au moment précis où l'on corrige un défaut de type de colonne.
 */
export interface ChampsNormalises {
  date_cloture: string | null;
  date_creation_entreprise: string | null;
  date_entree_cabinet: string | null;
  capital_social: number | null;
  type_personne: string | null;
  civilite: string | null;
}

/**
 * Transforme la saisie en ce que la base accepte : les dates vides deviennent
 * `null`, les nombres vides aussi, le reste passe tel quel.
 */
export function payloadCreationClient<T extends Saisie>(
  formulaire: T
): Omit<T, keyof ChampsNormalises> & ChampsNormalises {
  const sortie: Saisie = { ...formulaire };

  for (const champ of CHAMPS_DATE) {
    const v = sortie[champ];
    if (typeof v === 'string' && v.trim() === '') sortie[champ] = null;
  }

  for (const champ of CHAMPS_NOMBRE) {
    const v = sortie[champ];
    if (typeof v === 'string') {
      const t = v.trim();
      sortie[champ] = t === '' ? null : Number.parseFloat(t);
    }
  }

  // Deux listes déroulantes qui portent « aucun choix » comme valeur vide.
  for (const champ of ['type_personne', 'civilite'] as const) {
    if (sortie[champ] === '') sortie[champ] = null;
  }

  return sortie as Omit<T, keyof ChampsNormalises> & ChampsNormalises;
}
