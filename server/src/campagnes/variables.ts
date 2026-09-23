/**
 * Les variables qu'une campagne peut insérer, et la façon de les écrire.
 * ---------------------------------------------------------------------------
 * Une variable, c'est une colonne de la fiche client ET un format. Les deux
 * vivent ici, ensemble, parce que c'est leur séparation qui a produit les trois
 * défauts corrigés le 2026-09-23 — tous trois en production, tous trois
 * silencieux jusqu'à ce qu'on les regarde :
 *
 *   · `{{date_cloture}}` LEVAIT UNE EXCEPTION. La colonne est de type `date`,
 *     node-pg la rend en objet `Date`, et l'échappement appelait `.replace`
 *     dessus : « v.replace is not a function ». Une campagne qui l'employait
 *     plantait à l'aperçu comme à l'envoi.
 *   · `{{regime_fiscal}}` imprimait `IS_REEL` — le code stocké, pas le libellé
 *     que le cabinet a écrit dans ses réglages. Même défaut que celui corrigé la
 *     veille dans le PDF de synthèse.
 *   · Le SUJET passait par l'échappement HTML : « L'Atelier Dupont & Fils »
 *     arrivait dans la boîte de réception écrit `L&#39;Atelier Dupont &amp;
 *     Fils`. Un sujet est un en-tête, pas du HTML.
 *
 * SANS DÉPENDANCE, comme `gabarit.ts` : ce qui décide du texte envoyé à un
 * client doit pouvoir se tester sans base ni `.env`.
 *
 * ⚠️ UNE LISTE BLANCHE, PAS LA TABLE ENTIÈRE. La fiche porte soixante colonnes,
 * dont `resume_ia`, les journaux de synchronisation, les vérifications TVA.
 * N'est insérable que ce qui a un sens dans une lettre adressée AU client, sur
 * lui-même. Le statut (« prospect »), l'indicateur LMNP ou la date de sortie du
 * cabinet n'y figurent pas : personne n'écrit « Cher client, votre statut est
 * prospect ».
 */

export type FormatVariable = 'texte' | 'date' | 'mois' | 'euros' | 'regime';

export type GroupeVariable = 'Identité' | 'Coordonnées' | 'Dossier';

export interface VariableCampagne {
  /** Ce qui s'écrit entre les accolades : `{{nom}}`. */
  nom: string;
  /** Ce que l'écran affiche sur le bouton d'insertion. */
  libelle: string;
  groupe: GroupeVariable;
  /** La colonne de `clients` d'où vient la valeur. */
  colonne: string;
  format: FormatVariable;
}

/**
 * Le catalogue, dans l'ordre où l'écran le présente.
 *
 * ⚠️ LES CINQ NOMS HISTORIQUES SONT CONSERVÉS À L'IDENTIQUE — `nom_entreprise`,
 * `dirigeant`, `numero_dossier`, `date_cloture`, `regime_fiscal`. Des modèles de
 * courriel les emploient déjà ; les renommer ferait apparaître `{{dirigeant}}` en
 * clair dans le prochain envoi. Seul leur RENDU change, pour devenir correct.
 */
export const VARIABLES_CAMPAGNE: readonly VariableCampagne[] = [
  // Identité
  { nom: 'nom_entreprise', libelle: 'Raison sociale', groupe: 'Identité', colonne: 'nom_entreprise', format: 'texte' },
  { nom: 'nom_commercial', libelle: 'Nom commercial', groupe: 'Identité', colonne: 'nom_commercial', format: 'texte' },
  { nom: 'forme_juridique', libelle: 'Forme juridique', groupe: 'Identité', colonne: 'forme_juridique', format: 'texte' },
  { nom: 'siren', libelle: 'SIREN', groupe: 'Identité', colonne: 'siren', format: 'texte' },
  { nom: 'siret', libelle: 'SIRET', groupe: 'Identité', colonne: 'siret', format: 'texte' },
  { nom: 'tva_intracom', libelle: 'N° de TVA', groupe: 'Identité', colonne: 'tva_intracom', format: 'texte' },
  { nom: 'code_ape', libelle: 'Code APE', groupe: 'Identité', colonne: 'code_ape', format: 'texte' },
  { nom: 'capital_social', libelle: 'Capital social', groupe: 'Identité', colonne: 'capital_social', format: 'euros' },
  { nom: 'date_creation', libelle: 'Date de création', groupe: 'Identité', colonne: 'date_creation_entreprise', format: 'date' },
  { nom: 'activite', libelle: 'Activité', groupe: 'Identité', colonne: 'description_activite', format: 'texte' },

  // Coordonnées
  { nom: 'civilite', libelle: 'Civilité', groupe: 'Coordonnées', colonne: 'civilite', format: 'texte' },
  { nom: 'prenom', libelle: 'Prénom', groupe: 'Coordonnées', colonne: 'prenom', format: 'texte' },
  { nom: 'nom', libelle: 'Nom', groupe: 'Coordonnées', colonne: 'nom', format: 'texte' },
  { nom: 'dirigeant', libelle: 'Dirigeant', groupe: 'Coordonnées', colonne: 'dirigeant', format: 'texte' },
  { nom: 'contact_principal', libelle: 'Contact principal', groupe: 'Coordonnées', colonne: 'contact_principal', format: 'texte' },
  { nom: 'email', libelle: 'Email', groupe: 'Coordonnées', colonne: 'email', format: 'texte' },
  { nom: 'telephone', libelle: 'Téléphone', groupe: 'Coordonnées', colonne: 'telephone', format: 'texte' },
  // `adresse` est recomposée par la base depuis ses composants : c'est la forme
  // complète, celle qu'on recopie sur une enveloppe.
  { nom: 'adresse', libelle: 'Adresse complète', groupe: 'Coordonnées', colonne: 'adresse', format: 'texte' },
  { nom: 'rue', libelle: 'Rue', groupe: 'Coordonnées', colonne: 'adresse_ligne1', format: 'texte' },
  { nom: 'complement_adresse', libelle: "Complément d'adresse", groupe: 'Coordonnées', colonne: 'adresse_complement', format: 'texte' },
  { nom: 'code_postal', libelle: 'Code postal', groupe: 'Coordonnées', colonne: 'code_postal', format: 'texte' },
  { nom: 'ville', libelle: 'Ville', groupe: 'Coordonnées', colonne: 'ville', format: 'texte' },

  // Dossier
  { nom: 'numero_dossier', libelle: 'N° de dossier', groupe: 'Dossier', colonne: 'numero_dossier', format: 'texte' },
  { nom: 'regime_fiscal', libelle: 'Régime fiscal', groupe: 'Dossier', colonne: 'regime_fiscal', format: 'regime' },
  { nom: 'date_cloture', libelle: 'Date de clôture', groupe: 'Dossier', colonne: 'date_cloture', format: 'date' },
  // Le même champ, dit autrement : « votre exercice clos en décembre » se lit
  // mieux que « clos le 31/12/2026 » dans une relance annuelle.
  { nom: 'mois_cloture', libelle: 'Mois de clôture', groupe: 'Dossier', colonne: 'date_cloture', format: 'mois' },
  { nom: 'client_depuis', libelle: 'Client depuis le', groupe: 'Dossier', colonne: 'date_entree_cabinet', format: 'date' },
  // Utile pour la campagne de la réforme de la facture électronique : dire au
  // client quelle adresse le cabinet a enregistrée pour lui.
  {
    nom: 'adresse_facturation_electronique',
    libelle: 'Adresse de facturation électronique',
    groupe: 'Dossier',
    colonne: 'adresse_facturation_electronique',
    format: 'texte',
  },
];

const PAR_NOM = new Map(VARIABLES_CAMPAGNE.map((v) => [v.nom, v]));

/** Les colonnes de `clients` à lire pour servir le catalogue, sans doublon. */
export function colonnesVariables(): { colonne: string; format: FormatVariable }[] {
  const vues = new Map<string, FormatVariable>();
  for (const v of VARIABLES_CAMPAGNE) {
    // `date_cloture` sert deux formats ; ce qui compte pour la lecture, c'est
    // qu'une colonne `date` soit lue en texte — `date` et `mois` le sont tous deux.
    if (!vues.has(v.colonne)) vues.set(v.colonne, v.format);
  }
  return [...vues].map(([colonne, format]) => ({ colonne, format }));
}

/** Ce qu'il faut savoir en plus de la fiche pour écrire une valeur. */
export interface ContexteVariables {
  /** `regimes_fiscaux` : code → libellé, tel que le cabinet l'a écrit. */
  libellesRegimes?: ReadonlyMap<string, string>;
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/**
 * Année, mois et jour d'une date, qu'elle arrive en texte ou en objet.
 *
 * ⚠️ LE TEXTE EST LU TEL QUEL, JAMAIS PAR `new Date()`. `new Date('2026-12-31')`
 * désigne minuit UTC, qui est encore le 30 décembre à Papeete et le devient à
 * Paris selon l'heure d'été : lire la chaîne évite toute question de fuseau.
 * L'objet `Date` n'arrive que si un appelant a oublié de lire la colonne en
 * texte ; node-pg le pose à minuit LOCAL, donc ce sont les accesseurs locaux
 * qui rendent le bon jour.
 */
function lireDate(v: unknown): { a: number; m: number; j: number } | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return { a: v.getFullYear(), m: v.getMonth() + 1, j: v.getDate() };
  }
  if (typeof v !== 'string') return null;
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!r) return null;
  const a = Number(r[1]);
  const m = Number(r[2]);
  const j = Number(r[3]);
  if (m < 1 || m > 12 || j < 1 || j > 31) return null;
  return { a, m, j };
}

/**
 * La valeur d'une variable pour ce client, en TEXTE BRUT — ni échappée, ni
 * coupée. C'est à l'appelant de la protéger selon l'endroit où elle va : le
 * corps l'échappe pour le HTML, le sujet la nettoie pour l'en-tête SMTP.
 *
 * Rend `null` pour un nom INCONNU, et la chaîne vide pour une valeur ABSENTE.
 * La différence compte : un inconnu reste écrit `{{…}}` dans le courriel, pour
 * se voir à l'aperçu ; un absent disparaît, pour qu'un client sans dirigeant
 * renseigné ne reçoive pas « Bonjour {{dirigeant}} ».
 *
 * ⚠️ UNE VALEUR QU'ON NE SAIT PAS LIRE DEVIENT VIDE, ELLE N'EST PAS DEVINÉE. Une
 * date malformée ne s'imprime pas « 31/02/2026 » ; un capital non numérique ne
 * s'imprime pas « NaN € ». Mieux vaut un blanc dans une phrase qu'une valeur
 * fausse dans une lettre du cabinet.
 */
export function valeurVariable(
  nom: string,
  client: Record<string, unknown>,
  contexte: ContexteVariables = {}
): string | null {
  const v = PAR_NOM.get(nom.toLowerCase());
  if (!v) return null;

  const brute = client[v.colonne];
  if (brute === null || brute === undefined || brute === '') return '';

  switch (v.format) {
    case 'texte':
      return String(brute).trim();

    case 'date': {
      const d = lireDate(brute);
      if (!d) return '';
      return `${String(d.j).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.a}`;
    }

    case 'mois': {
      const d = lireDate(brute);
      return d ? MOIS[d.m - 1]! : '';
    }

    case 'euros': {
      const n = Number(brute);
      if (!Number.isFinite(n)) return '';
      return n.toLocaleString('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        // « 10 000 € » pour un capital rond, « 1 500,50 € » sinon : les
        // centimes inutiles alourdissent une phrase.
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
      });
    }

    case 'regime': {
      const code = String(brute).trim();
      // Un code absent de la table s'imprime brut : visiblement technique, il
      // signale à l'aperçu qu'un régime manque dans les réglages.
      return contexte.libellesRegimes?.get(code) ?? code;
    }
  }
}
