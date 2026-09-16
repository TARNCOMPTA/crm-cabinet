/**
 * Ce que le connecteur MCP a le droit d'écrire dans une fiche client.
 * ---------------------------------------------------------------------------
 * ⚠️ UNE LISTE BLANCHE, JAMAIS UNE LISTE NOIRE. La table `clients` porte
 * soixante-trois colonnes, et elle en gagnera d'autres. Une liste de ce qui est
 * INTERDIT laisserait chaque colonne future écrivable par défaut, y compris
 * celle qu'on ajoutera un dimanche pour une synchronisation. Ici, ce qui n'est
 * pas nommé est refusé.
 *
 * ⚠️ QUATRE DÉCLENCHEURS MAINTIENNENT DES COLONNES, ET AUCUNE N'EST ICI.
 * `calculate_siren_trigger` déduit `siren` du SIRET ; `clients_adresse_trigger`
 * recompose `adresse` depuis ses composants ; `clients_nom_entreprise_trigger`
 * recompose `nom_entreprise` en « NOM Prénom » pour une personne physique ;
 * `clients_tva_intracom_trigger` calcule le numéro de TVA. Les écrire
 * directement, c'est écrire une valeur que la base remplacera au prochain
 * `UPDATE` — ou pire, qu'elle gardera jusqu'à ce qu'un autre champ bouge, en
 * laissant deux vérités dans la fiche. On écrit les SOURCES, la base recompose.
 *
 * ⚠️ CE QUE LES SYNCHRONISATIONS ÉCRIVENT N'EST PAS ÉCRIVABLE NON PLUS.
 * `etat_administratif`, `date_radiation`, `date_immatriculation`, `greffe` et
 * les `last_*_sync` viennent de l'INPI et du BODACC ; les `tva_verif_*` de
 * VIES. Une valeur posée à la main y serait écrasée à la synchronisation
 * suivante, sans que personne comprenne pourquoi.
 *
 * ⚠️ `adresse_facturation_electronique` A DÉJÀ SON OUTIL, et n'est pas ici. Ce
 * champ porte une garde qui lui est propre — refus par défaut de remplacer,
 * parce qu'une facture partie ailleurs ne se voit qu'à la réclamation — et une
 * normalisation jumelée. Le rendre écrivable par deux portes ferait deux règles.
 * Même chose pour `parts_totales`, qui appartient à la répartition des parts.
 *
 * ⚠️ `resume_ia` NON PLUS : c'est une production du modèle, pas une donnée du
 * cabinet, et elle porte ses propres colonnes d'attribution.
 */

/** Ce qu'une colonne accepte, et comment on la lit depuis du JSON. */
export type TypeChamp = 'texte' | 'nombre' | 'date' | 'booleen';

export interface ChampFiche {
  /** Le nom de la colonne, tel quel. */
  colonne: string;
  type: TypeChamp;
  /** Ce que l'écran affiche en face, pour que les messages se ressemblent. */
  libelle: string;
}

/**
 * Les colonnes écrivables, dans l'ordre où la fiche les présente.
 *
 * ⚠️ CETTE LISTE EST TENUE AVEC L'ÉCRAN par `tests/champs-fiche-jumelles.test.ts`,
 * qui lit `src/pages/clientDetail/lignes.tsx` et tombe si l'écran se met à
 * éditer un champ que le connecteur ignore. Sans cette garde, la liste se
 * périmerait en silence : un champ ajouté à la fiche resterait inaccessible au
 * connecteur, et personne ne s'en apercevrait avant de le chercher.
 */
export const CHAMPS_ECRIVABLES: readonly ChampFiche[] = [
  // Identité
  { colonne: 'type_personne', type: 'texte', libelle: 'Type de personne' },
  { colonne: 'civilite', type: 'texte', libelle: 'Civilite' },
  { colonne: 'nom', type: 'texte', libelle: 'Nom' },
  { colonne: 'prenom', type: 'texte', libelle: 'Prenom' },
  // ⚠️ ÉCRIVABLE, MAIS RECOMPOSÉE POUR UNE PERSONNE PHYSIQUE. Le déclencheur
  // `clients_nom_entreprise_trigger` la réécrit en « NOM Prénom » quand
  // `type_personne` vaut « physique ». Sur une personne morale, elle tient.
  { colonne: 'nom_entreprise', type: 'texte', libelle: 'Raison sociale' },
  { colonne: 'nom_commercial', type: 'texte', libelle: 'Nom commercial' },
  { colonne: 'siret', type: 'texte', libelle: 'SIRET' },
  { colonne: 'forme_juridique', type: 'texte', libelle: 'Forme juridique' },
  { colonne: 'code_ape', type: 'texte', libelle: 'Code APE' },
  { colonne: 'capital_social', type: 'nombre', libelle: 'Capital social' },
  { colonne: 'date_creation_entreprise', type: 'date', libelle: 'Date de creation' },
  { colonne: 'description_activite', type: 'texte', libelle: 'Description de l activite' },
  { colonne: 'is_lmnp', type: 'booleen', libelle: 'LMNP' },

  // Adresse, par composants — la colonne `adresse` est recomposee par la base
  { colonne: 'adresse_ligne1', type: 'texte', libelle: 'Adresse' },
  { colonne: 'adresse_complement', type: 'texte', libelle: 'Complement d adresse' },
  { colonne: 'code_postal', type: 'texte', libelle: 'Code postal' },
  { colonne: 'ville', type: 'texte', libelle: 'Ville' },
  { colonne: 'pays', type: 'texte', libelle: 'Pays' },

  // Coordonnées
  { colonne: 'email', type: 'texte', libelle: 'Email' },
  { colonne: 'email_2', type: 'texte', libelle: 'Email 2' },
  { colonne: 'telephone', type: 'texte', libelle: 'Telephone' },
  { colonne: 'telephone_2', type: 'texte', libelle: 'Telephone 2' },
  { colonne: 'contact_principal', type: 'texte', libelle: 'Contact principal' },
  { colonne: 'dirigeant', type: 'texte', libelle: 'Dirigeant' },

  // Suivi du cabinet
  { colonne: 'numero_dossier', type: 'texte', libelle: 'Numero de dossier' },
  { colonne: 'statut', type: 'texte', libelle: 'Statut' },
  { colonne: 'regime_fiscal', type: 'texte', libelle: 'Regime fiscal' },
  { colonne: 'date_cloture', type: 'date', libelle: 'Mois de cloture' },
  { colonne: 'date_entree_cabinet', type: 'date', libelle: 'Date d entree au cabinet' },
  { colonne: 'date_sortie_cabinet', type: 'date', libelle: 'Date de sortie du cabinet' },
];

export const CHAMPS_PAR_COLONNE = new Map(CHAMPS_ECRIVABLES.map((c) => [c.colonne, c]));

/**
 * Les colonnes qu'on refuse NOMMÉMENT, avec la raison.
 *
 * ⚠️ ELLES SERAIENT DÉJÀ REFUSÉES par la liste blanche : ce n'est pas une
 * seconde barrière. C'est un message. « Colonne inconnue » sur `siren` ferait
 * chercher une faute de frappe ; « recomposée par la base depuis le SIRET » dit
 * quoi écrire à la place. Un refus qui n'explique pas se contourne mal.
 */
export const REFUS_EXPLIQUES: Record<string, string> = {
  siren: "calcule par la base depuis le SIRET — ecrivez `siret`.",
  adresse:
    'recomposee par la base depuis ses composants — ecrivez `adresse_ligne1`, `code_postal`, `ville`.',
  tva_intracom: 'calcule par la base depuis le SIREN.',
  numero_tva: 'calcule par la base depuis le SIREN.',
  adresse_facturation_electronique:
    "porte sa propre garde : utilisez l'outil `set_client_facturation_electronique`.",
  parts_totales: "appartient a la repartition des parts : utilisez l'outil `set_client_repartition`.",
  resume_ia: "produit par un modele, pas une donnee du cabinet.",
  etat_administratif: "vient de la synchronisation INPI, une saisie y serait ecrasee.",
  date_radiation: "vient de la synchronisation INPI, une saisie y serait ecrasee.",
  date_immatriculation: "vient de la synchronisation INPI, une saisie y serait ecrasee.",
  greffe: "vient de la synchronisation INPI, une saisie y serait ecrasee.",
  code_insee: "pose par la recherche d'adresse, pas a la main.",
  tva_verif_statut: 'vient de la verification VIES.',
  id: "identifiant de la fiche, jamais modifiable.",
  created_at: 'pose par la base.',
  updated_at: 'pose par la base.',
};

export type ValeurChamp = string | number | boolean | null;

export type LectureChamp =
  | { ok: true; valeur: ValeurChamp }
  | { ok: false; raison: string };

/**
 * Lit une valeur JSON pour la colonne demandée.
 *
 * ⚠️ `null` EFFACE, ET C'EST UN GESTE. « Ce client n'a pas de second courriel »
 * se dit en écrivant `null` ; ce n'est pas la même chose que ne pas mentionner
 * le champ, qui le laisse tel quel. La chaîne vide est traitée comme `null` —
 * un champ texte vidé est vidé — SAUF que rien ne la devine : il faut l'avoir
 * passée.
 *
 * ⚠️ UNE VALEUR MAL FORMÉE EST REFUSÉE, PAS CORRIGÉE. Une date « 12/03/2026 »
 * n'est pas convertie en silence : le modèle a peut-être lu un document
 * américain, et deviner ferait écrire le 3 décembre pour le 12 mars. Le refus
 * dit quel format attendre. Même raison que la règle de l'écran, qui laisse une
 * date malformée descendre jusqu'à PostgreSQL plutôt que de l'effacer.
 */
export function lireValeur(champ: ChampFiche, brute: unknown): LectureChamp {
  if (brute === null || brute === undefined) return { ok: true, valeur: null };

  switch (champ.type) {
    case 'texte': {
      if (typeof brute !== 'string') {
        return { ok: false, raison: `${champ.colonne} attend du texte.` };
      }
      const t = brute.trim();
      return { ok: true, valeur: t === '' ? null : t };
    }

    case 'nombre': {
      if (typeof brute === 'number') {
        if (!Number.isFinite(brute)) {
          return { ok: false, raison: `${champ.colonne} attend un nombre fini.` };
        }
        return { ok: true, valeur: brute };
      }
      // Un nombre transmis en texte reste lisible — « 10000 » — mais « 10 000 EUR »
      // ne l'est pas, et l'interpreter ferait ecrire 10.
      if (typeof brute === 'string') {
        const t = brute.trim();
        if (t === '') return { ok: true, valeur: null };
        if (!/^-?\d+(\.\d+)?$/.test(t)) {
          return {
            ok: false,
            raison: `${champ.colonne} attend un nombre, sans unite ni separateur de milliers.`,
          };
        }
        return { ok: true, valeur: Number(t) };
      }
      return { ok: false, raison: `${champ.colonne} attend un nombre.` };
    }

    case 'date': {
      if (typeof brute !== 'string') {
        return { ok: false, raison: `${champ.colonne} attend une date au format AAAA-MM-JJ.` };
      }
      const t = brute.trim();
      if (t === '') return { ok: true, valeur: null };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        return {
          ok: false,
          raison: `${champ.colonne} attend une date au format AAAA-MM-JJ (recu : « ${t} »).`,
        };
      }
      // Le format seul ne suffit pas : « 2026-02-31 » le respecte.
      const [a, m, j] = t.split('-').map(Number);
      const d = new Date(Date.UTC(a!, m! - 1, j!));
      if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m! - 1 || d.getUTCDate() !== j) {
        return { ok: false, raison: `${champ.colonne} : « ${t} » n'est pas une date reelle.` };
      }
      return { ok: true, valeur: t };
    }

    case 'booleen': {
      if (typeof brute !== 'boolean') {
        return { ok: false, raison: `${champ.colonne} attend true ou false.` };
      }
      return { ok: true, valeur: brute };
    }
  }
}

/** Vrai quand la fiche porte déjà quelque chose dans cette colonne. */
export function dejaRenseigne(valeur: unknown): boolean {
  if (valeur === null || valeur === undefined) return false;
  if (typeof valeur === 'string') return valeur.trim() !== '';
  return true;
}

