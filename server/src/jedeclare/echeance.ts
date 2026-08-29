/**
 * Le jour d'échéance d'une TVA, et la surcharge qui prime dessus.
 * ---------------------------------------------------------------------------
 * Le calendrier CA3 ne donne pas une date unique : il échelonne les dépôts sur
 * quatre jours du mois selon QUI déclare — le 16, le 19, le 21 ou le 24. Le
 * cabinet le connaît par cœur, l'écran ne le connaissait pas, et chaque
 * collaborateur le recalculait de tête dossier par dossier.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ CE QUE CE MODULE NE DÉCIDE PAS
 *
 * Une règle fiscale appliquée à 940 clients par un programme n'a pas droit à
 * l'à-peu-près, et deux choses lui manquent structurellement :
 *
 *   · LA FORME JURIDIQUE EST DÉCLARATIVE. `clients.forme_juridique` porte
 *     tantôt le CODE INSEE, tantôt le LIBELLÉ — `legal_forms` est créée vide,
 *     et se peuple ou non selon l'instance (voir `legalFormsUtils.ts`). Les
 *     deux formes sont donc reconnues ici, et aucune n'est garantie present.
 *   · RIEN NE GARANTIT QUE LA FICHE EST À JOUR. Une SARL passée en SAS reste
 *     SARL au CRM tant que personne n'a corrigé.
 *
 * D'où `surchargeDe` : le cabinet peut fixer le jour sur une fiche, et cette
 * valeur PRIME SUR TOUT le reste. La règle est un défaut utile, pas un verdict.
 * Un jour faux affiché sans recours vaudrait moins que pas de jour du tout.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ LA TVA ANNUELLE N'EST PAS DANS CE CALENDRIER
 *
 * Le 16/19/21/24 est le calendrier de la CA3 — mensuelle et trimestrielle. La
 * CA12 du régime simplifié ne s'y range pas : son échéance n'est pas un jour du
 * mois mais une date de l'année, liée à la clôture de l'exercice. Lui appliquer
 * la règle CA3 produirait une échéance fausse tous les mois. Le tableau annuel
 * n'affiche donc AUCUN jour déduit — seule une surcharge y met une valeur.
 */

import type { Periodicite } from './etat.js';

/**
 * Les quatre rangs du calendrier CA3, tels que le cabinet les a confirmés.
 *
 * Nommés plutôt que codés en dur au point d'usage : le jour se lit alors dans
 * la catégorie, et une correction de calendrier se fait ici, à un seul endroit.
 */
export const JOUR_CA3 = {
  /** Entrepreneur individuel, nom de famille en A–H. */
  personne_physique_ah: 16,
  /** Entrepreneur individuel, nom de famille en I–Z. */
  personne_physique_iz: 19,
  /** Sociétés autres que les sociétés par actions : SARL, EURL, SNC, civiles… */
  societe_autre: 21,
  /** SA et assimilées (SAS, SASU, commandite par actions), associations, reste. */
  societe_actions: 24,
} as const;

export type CategorieCa3 =
  | 'personne_physique'
  | 'societe_actions'
  | 'societe_autre'
  | 'autre_redevable';

export type OrigineEcheance = 'surcharge' | 'regle' | 'inconnue';

export interface Echeance {
  /** Le jour du mois, ou `null` quand rien de sûr ne peut être dit. */
  jour: number | null;
  origine: OrigineEcheance;
  /** Ce qui justifie la valeur — porté en infobulle, pour que le jour soit vérifiable. */
  motif: string;
  /**
   * Ce que la règle seule donnerait, MÊME QUAND UNE SURCHARGE LA COUVRE.
   *
   * Sans cela, poser une surcharge est un aller sans retour visible : l'écran
   * n'a plus aucun moyen de dire « la règle disait 21, vous avez mis 24 », ni
   * de proposer de revenir au défaut en le nommant.
   */
  jourRegle: number | null;
}

/** Ce que la fiche client apporte au calcul. Rien d'autre n'est lu. */
export interface ClientEcheance {
  type_personne: string | null;
  forme_juridique: string | null;
  nom: string | null;
  nom_entreprise: string | null;
  tva_jour_echeance: number | null;
}

/**
 * Les catégories juridiques INSEE, réduites à ce que le calendrier distingue.
 *
 * Le premier chiffre porte la nature, les deux premiers la famille :
 *   1…  personne physique          52.. SNC        54.. SARL      65.. civiles
 *   55.. SA à conseil d'adm.       56.. SA à directoire           57.. SAS
 *   5385/5386 commandite PAR ACTIONS — assimilées SA, à la différence des
 *   autres 53.. (commandite simple), qui restent des sociétés ordinaires.
 */
const CODES_ACTIONS = /^(55|56|57)/;
const CODES_COMMANDITE_ACTIONS = new Set(['5385', '5386']);
const CODES_SOCIETE = /^(52|53|54|58|59|6)/;

/** Les libellés, quand `legal_forms` est peuplée. Ordre significatif : voir plus bas. */
const MOTS_ACTIONS =
  /(societe anonyme|par actions simplifiee|\bsas\b|\bsasu\b|\bsa\b|commandite par actions|\bsca\b)/;
const MOTS_AUTRE_REDEVABLE =
  /(association|fondation|syndicat|comite|mutuelle|collectivite|commune|etablissement public)/;
const MOTS_SOCIETE =
  /(societe|\bsarl\b|\beurl\b|\bsnc\b|\bsci\b|\bscp\b|\bscm\b|\bselarl\b|\bselas\b|\bgie\b|civile|cooperative|groupement)/;

/** Casse, accents et ponctuation écartés : les libellés saisis n'ont aucune régularité. */
function normaliser(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * La catégorie d'un redevable, depuis ce que porte sa fiche.
 *
 * `typePersonne` passe AVANT la forme juridique : c'est le champ que la fiche
 * client tient à jour et sur lequel elle bascule son propre affichage, là où
 * `forme_juridique` peut être vide, codée ou libellée. Une personne physique
 * reconnue comme telle n'a pas besoin qu'on interprète son code INSEE.
 *
 * Rend `null` quand rien n'est exploitable : l'appelant affichera l'inconnu
 * plutôt qu'un jour au hasard.
 */
export function categoriserCa3(
  typePersonne: string | null | undefined,
  formeJuridique: string | null | undefined
): CategorieCa3 | null {
  if (String(typePersonne ?? '').trim().toLowerCase() === 'physique') return 'personne_physique';

  const brut = String(formeJuridique ?? '').trim();
  if (!brut) return null;

  // Les codes hérités de l'ancienne saisie ('0', '1', '10', 'EI') vivent dans
  // `isEntrepreneurIndividuel` côté front ; on reconnaît les mêmes ici.
  if (/^(0|1|10|1000)$/.test(brut) || brut.toLowerCase() === 'ei') return 'personne_physique';

  if (/^\d{4}$/.test(brut)) {
    if (CODES_COMMANDITE_ACTIONS.has(brut)) return 'societe_actions';
    if (CODES_ACTIONS.test(brut)) return 'societe_actions';
    if (CODES_SOCIETE.test(brut)) return 'societe_autre';
    if (brut.startsWith('1')) return 'personne_physique';
    return 'autre_redevable';
  }

  const t = normaliser(brut);
  if (!t) return null;
  if (/entrepreneur individuel|personne physique/.test(t)) return 'personne_physique';
  // ⚠️ L'ORDRE COMPTE. « Société anonyme » contient « société » : tester
  // MOTS_SOCIETE d'abord rangerait toutes les SA en 21. De même, une
  // « association » n'est pas une société mais contient « ciation »… et
  // surtout, beaucoup de libellés d'associations mentionnent « groupement ».
  if (MOTS_ACTIONS.test(t)) return 'societe_actions';
  if (MOTS_AUTRE_REDEVABLE.test(t)) return 'autre_redevable';
  if (MOTS_SOCIETE.test(t)) return 'societe_autre';
  return null;
}

/**
 * L'initiale qui départage le 16 du 19, prise sur le NOM DE FAMILLE.
 *
 * `nom` est la colonne dédiée depuis l'éclatement de l'identité (increments/002).
 * À défaut, `nom_entreprise` fait l'affaire : le déclencheur le compose en
 * « NOM Prénom » pour une personne physique — surname en tête, donc la bonne
 * initiale. Prendre le prénom donnerait un jour faux une fois sur deux.
 */
function initiale(client: ClientEcheance): string | null {
  const source = String(client.nom ?? '').trim() || String(client.nom_entreprise ?? '').trim();
  const lettre = normaliser(source).toUpperCase().replace(/[^A-Z]/g, '').charAt(0);
  return lettre || null;
}

/**
 * Ce que la règle CA3 déduit, SANS regarder la surcharge.
 *
 * Isolée de `echeanceTva` pour rester calculable même quand une surcharge la
 * recouvre : c'est ce qui permet à l'écran de nommer le défaut auquel on
 * reviendrait en retirant l'arbitrage.
 */
function parLaRegle(
  client: ClientEcheance | null,
  periodicite: Periodicite | null | undefined
): { jour: number | null; motif: string } {
  if (periodicite === 'annuelle') {
    return {
      jour: null,
      motif:
        "La TVA annuelle (CA12) ne suit pas le calendrier CA3 : son échéance dépend de la date de clôture, ce n'est pas un jour du mois.",
    };
  }

  // La périodicité inconnue est traitée comme l'annuelle : sans savoir si la
  // déclaration relève de la CA3, lui appliquer le calendrier CA3 serait un pari.
  if (!periodicite) {
    return {
      jour: null,
      motif: "Périodicité indéterminée : le calendrier CA3 ne s'applique pas à coup sûr.",
    };
  }

  if (!client) {
    return {
      jour: null,
      motif: 'Société non rattachée à une fiche client : forme juridique inconnue.',
    };
  }

  const categorie = categoriserCa3(client.type_personne, client.forme_juridique);
  if (!categorie) {
    return { jour: null, motif: 'Forme juridique absente ou non reconnue sur la fiche client.' };
  }

  if (categorie === 'personne_physique') {
    const lettre = initiale(client);
    if (!lettre) {
      return { jour: null, motif: 'Entrepreneur individuel sans nom de famille exploitable.' };
    }
    const avantI = lettre <= 'H';
    return {
      jour: avantI ? JOUR_CA3.personne_physique_ah : JOUR_CA3.personne_physique_iz,
      motif: `Entrepreneur individuel, nom en ${lettre} (${avantI ? 'A–H' : 'I–Z'}).`,
    };
  }

  if (categorie === 'societe_autre') {
    return { jour: JOUR_CA3.societe_autre, motif: 'Société autre qu’une société par actions.' };
  }

  return {
    jour: JOUR_CA3.societe_actions,
    motif:
      categorie === 'societe_actions'
        ? 'Société par actions : SA, SAS et assimilées.'
        : 'Association ou autre redevable.',
  };
}

/** Une surcharge n'est retenue que si elle tient dans un mois. */
function surchargeValide(valeur: number | null | undefined): number | null {
  return valeur != null && Number.isInteger(valeur) && valeur >= 1 && valeur <= 31 ? valeur : null;
}

/**
 * Le jour d'échéance d'une société, pour une périodicité donnée.
 *
 * LA SURCHARGE PRIME SUR TOUT, y compris sur l'annuelle où la règle se tait :
 * quelqu'un a tranché en connaissance de cause, et le programme n'a pas à le
 * contredire à chaque lecture.
 */
export function echeanceTva(
  client: ClientEcheance | null,
  periodicite: Periodicite | null | undefined
): Echeance {
  const regle = parLaRegle(client, periodicite);
  const surcharge = surchargeValide(client?.tva_jour_echeance);

  if (surcharge !== null) {
    return {
      jour: surcharge,
      origine: 'surcharge',
      jourRegle: regle.jour,
      motif:
        regle.jour === null
          ? 'Jour fixé sur la fiche client.'
          : `Jour fixé sur la fiche client. La règle donnerait le ${regle.jour} — ${regle.motif}`,
    };
  }

  return {
    jour: regle.jour,
    origine: regle.jour === null ? 'inconnue' : 'regle',
    jourRegle: regle.jour,
    motif: regle.motif,
  };
}
