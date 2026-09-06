/**
 * Ce que la fiche client envoie à la base — à la création comme à la
 * modification.
 * ---------------------------------------------------------------------------
 * ⚠️ CE MODULE EXISTE À CAUSE D'UN DÉFAUT QUI RENDAIT LA CRÉATION IMPOSSIBLE,
 * ET IL A GRANDI PARCE QUE LE MÊME DÉFAUT VIVAIT AUSSI DANS L'ÉDITION.
 *
 * Un `<input type="date">` vide rend `''`, pas `null`. La fenêtre de création
 * envoyait `{...formData}` tel quel, donc `date_cloture: ''` et
 * `date_creation_entreprise: ''` dès qu'on ne les renseignait pas — et
 * PostgreSQL refusait :
 *
 *     invalid input syntax for type date: ""      (SQLSTATE 22007)
 *
 * La fiche n'était pas créée, et le message affiché parlait d'une syntaxe de
 * date à quelqu'un qui venait de saisir un nom d'entreprise. Constaté le
 * 2026-09-05 en voulant vérifier tout autre chose.
 *
 * LA MÊME CHOSE ARRIVAIT À L'ENREGISTREMENT D'UNE FICHE EXISTANTE, et personne
 * ne l'avait vu parce que la parade n'était pas une règle : c'était un
 * `|| null` recopié à la main dans chaque gestionnaire de `ClientDetail`. Deux
 * dates sur trois le portaient. La troisième — « Date de création » — ne l'avait
 * pas, et vider ce champ faisait échouer l'enregistrement de toute la fiche.
 * Reproduit contre la vraie base le 2026-09-05 :
 *
 *     PATCH /clients  {"date_creation_entreprise":""}
 *       -> 400  22007  invalid input syntax for type date: ""
 *
 * Un garde-fou recopié n'est pas un garde-fou : il compte sur le fait qu'on
 * pense à le recopier. Celui-ci est posé UNE fois, ici, et les deux écrans y
 * passent. Rien à recopier, donc rien à oublier.
 *
 * ⚠️ LES DATES, LES NOMBRES ET LES DEUX LISTES — PAS UN BALAYAGE GÉNÉRAL DES
 * CHAÎNES VIDES. Vider un champ texte est un geste : « il n'y a pas de
 * complément d'adresse » se distingue de « on ne sait pas ». Sur une date, ce
 * choix n'existe pas — la colonne est nullable et le format ne laisse pas de
 * place au vide.
 *
 * ⚠️ ET SEULEMENT LE VIDE. Une valeur mal formée n'est PAS convertie en `null` :
 * elle continue jusqu'à la base, qui la refuse bruyamment. C'est délibéré. Une
 * date malformée ne peut venir que d'un défaut du code — aucun `<input
 * type="date">` n'en produit — et l'effacer en silence remplacerait une erreur
 * visible par une perte de donnée invisible. Le cas s'est présenté : voir
 * `MonthPicker`, qui fabriquait `2026--01` en choisissant « Sélectionner un
 * mois ». Il a été corrigé là où il naissait, pas masqué ici.
 */

/** Les colonnes `date` de la fiche client, telles que le formulaire les nomme. */
const CHAMPS_DATE = ['date_cloture', 'date_creation_entreprise', 'date_entree_cabinet', 'date_sortie_cabinet'] as const;

/** Les colonnes numériques saisies en texte. */
const CHAMPS_NOMBRE = ['capital_social', 'parts_totales'] as const;

/** Les listes déroulantes qui portent « aucun choix » comme valeur vide. */
const CHAMPS_CHOIX = ['type_personne', 'civilite'] as const;

type Saisie = Record<string, unknown>;

/**
 * Ce que la transformation change, et donc ce que le type doit annoncer À LA
 * CRÉATION — là où l'on part d'un formulaire dont tous les champs existent.
 *
 * Sans cette déclaration, la fonction rendrait un `Record<string, unknown>` et
 * l'appelant perdrait TOUTES les garanties de type sur la charge envoyée à la
 * base — au moment précis où l'on corrige un défaut de type de colonne.
 */
export interface ChampsNormalises {
  date_cloture: string | null;
  date_creation_entreprise: string | null;
  date_entree_cabinet: string | null;
  date_sortie_cabinet: string | null;
  capital_social: number | null;
  parts_totales: number | null;
  type_personne: string | null;
  civilite: string | null;
}

/**
 * La règle, une fois : les champs vides deviennent `null`, le reste passe tel
 * quel. Ne modifie pas l'objet reçu.
 *
 * `T` entre et `T` sort : à l'édition on part d'un `Partial<Client>` où les
 * colonnes absentes doivent le RESTER — un type qui les déclarerait présentes
 * mentirait sur le contenu du PATCH.
 */
export function normaliserChampsClient<T extends Saisie>(saisie: T): T {
  const sortie: Saisie = { ...saisie };

  for (const champ of CHAMPS_DATE) {
    const v = sortie[champ];
    if (typeof v === 'string' && v.trim() === '') sortie[champ] = null;
  }

  for (const champ of CHAMPS_NOMBRE) {
    const v = sortie[champ];
    if (typeof v === 'string') sortie[champ] = nombreSaisi(v);
  }

  for (const champ of CHAMPS_CHOIX) {
    if (sortie[champ] === '') sortie[champ] = null;
  }

  return sortie as T;
}

/**
 * Un nombre saisi au clavier, ou `null` quand il n'y en a pas.
 *
 * ⚠️ `parseFloat(v) || null` — ce que faisaient les champs « Capital social » et
 * « Nombre total de parts » — REND `null` POUR ZÉRO, parce que `0` est faux en
 * JavaScript. Un capital de 0 € existe (associations, sociétés en cours de
 * libération) et se saisissait sans être enregistré : le champ redevenait vide
 * au rechargement, sans message. Ici, seul le vide et le non-nombre donnent
 * `null`.
 */
export function nombreSaisi(valeur: string): number | null {
  const t = valeur.trim();
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

/**
 * La charge envoyée à `clients` à la création d'une fiche.
 *
 * Même règle que ci-dessus, avec le type que la création permet d'annoncer :
 * tous les champs normalisés sont présents dans le formulaire de création, donc
 * présents en sortie.
 */
export function payloadCreationClient<T extends Saisie>(
  formulaire: T
): Omit<T, keyof ChampsNormalises> & ChampsNormalises {
  return normaliserChampsClient(formulaire) as unknown as Omit<T, keyof ChampsNormalises> & ChampsNormalises;
}

/**
 * Colonnes que l'enregistrement de la fiche n'envoie JAMAIS.
 * ---------------------------------------------------------------------------
 * Trois familles, et chacune pour une raison differente :
 *
 *   · CE QUE LA BASE POSSEDE — `id`, `created_at`, `updated_at`. Les renvoyer
 *     n'echoue pas, mais c'est du bruit qui masque le vrai contenu du PATCH ;
 *
 *   · CE QUE LES DECLENCHEURS RECOMPOSENT — `adresse` et `nom_entreprise`. Les
 *     envoyer serait au mieux inutile, au pire destructeur : le declencheur les
 *     recompose depuis les composants, et une valeur venue du formulaire les
 *     combattrait a chaque enregistrement.
 *
 *     Historiquement, `loadClient` mettait dans `formData.adresse` une version
 *     NORMALISEE, differente de la base pour les lignes restees au format JSON :
 *     ouvrir puis enregistrer une fiche sans rien toucher REECRIVAIT son
 *     adresse. Cette normalisation a disparu, mais la regle demeure ;
 *
 *   · CE QU'UNE ROUTE SERVEUR ECRIT SEULE — les `tva_verif_*`, poses par la
 *     verification VIES. Un formulaire qui les renvoie ecraserait un verdict que
 *     le serveur vient d'obtenir, avec la valeur qu'avait la page a son
 *     chargement.
 *
 * `tva_intracom` n'y est PAS, et c'est voulu : le numero est surchargeable a la
 * main, c'est la seule des colonnes de TVA que l'utilisateur pilote.
 */
const COLONNES_NON_ENVOYEES = new Set([
  'id',
  'created_at',
  'updated_at',
  'adresse',
  'nom_entreprise',
  'last_inpi_sync',
  'last_legal_sync',
  'last_bodacc_sync',
  'resume_ia',
  'resume_ia_generated_at',
  'resume_ia_generated_by',
  'tva_verif_statut',
  'tva_verif_le',
  'tva_verif_code',
  'tva_verif_nom',
  'tva_verif_adresse',
]);

/**
 * Ce que l'enregistrement d'une fiche existante envoie réellement : la saisie,
 * normalisée, moins ce qui n'a pas changé, moins ce qui ne nous appartient pas.
 * ---------------------------------------------------------------------------
 * TROIS RÈGLES QUI DOIVENT S'APPLIQUER DANS CET ORDRE, et c'est pour tenir cet
 * ordre que la fonction existe plutôt que trois expressions dans un composant :
 *
 *   1. NORMALISER. Un champ date vide vaut `''` dans le formulaire et `null` en
 *      base. Sans cette étape, PostgreSQL refuse la chaîne vide (22007) et
 *      l'enregistrement de toute la fiche échoue.
 *   2. DIFFÉRENCIER. N'envoyer que ce qui a bougé. Si l'on inversait 1 et 2, un
 *      champ déjà nul en base entrerait dans le PATCH — `'' !== null` — et l'on
 *      réécrirait `null` sur `null` à chaque enregistrement.
 *   3. ÉCARTER `COLONNES_NON_ENVOYEES`.
 *
 * ⚠️ LES ÉTAPES 2 ET 3 SONT TOUTES DEUX NÉCESSAIRES, et c'est le point à ne pas
 * simplifier : le diff seul n'écarterait pas `adresse` — justement parce qu'elle
 * diffère — et la liste noire seule laisserait passer l'écho de tout le reste.
 */
export function patchFicheClient<T extends Saisie>(saisie: T, enBase: Saisie | null): Partial<T> {
  const normalisee = normaliserChampsClient(saisie);
  return Object.fromEntries(
    Object.entries(normalisee).filter(
      ([cle, valeur]) => !COLONNES_NON_ENVOYEES.has(cle) && valeur !== enBase?.[cle]
    )
  ) as Partial<T>;
}
