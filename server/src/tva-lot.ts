/**
 * Le rythme de la vérification périodique des numéros de TVA.
 * ---------------------------------------------------------------------------
 * Deux décisions, et aucune des deux ne se voit dans le corps de la tâche : la
 * taille du lot quotidien, et le moment où l'on renonce. Elles vivent ici,
 * pures et testées, parce qu'elles gouvernent la charge qu'on met sur un
 * service public gratuit — et qu'une erreur de calcul s'y traduit soit par un
 * portefeuille jamais couvert, soit par un blocage.
 *
 * ⚠️ CE MODULE EXISTE PARCE QUE LE PRODUIT A CHANGÉ D'AVIS. Jusqu'au
 * 2026-09-05, la règle était « rien ne part vers VIES sans un clic », écrite
 * dans `config.ts` et dans le README. Le cabinet a demandé l'inverse : une
 * vérification au moins mensuelle de tout le portefeuille. La demande est
 * légitime — un numéro intracommunautaire se désactive sans prévenir, et une
 * facture émise sans TVA sur un numéro devenu inactif est un redressement — mais
 * elle transforme un appel à la demande en flux périodique. D'où la prudence
 * qui suit, et d'où `VIES_PERIODIQUE_DISABLED` pour le cabinet qui n'en veut
 * pas.
 */

/** Sous ce seuil, un tout petit portefeuille tournerait en rond. */
const LOT_MIN = 5;

/**
 * Au-delà, on refuse d'accélérer, même si le cycle mensuel en pâtit.
 *
 * À cinq secondes d'espacement, 120 numéros font dix minutes d'appels : c'est
 * déjà beaucoup pour un service que la Commission offre gratuitement, et qui
 * répond `MS_MAX_CONCURRENT_REQ` bien avant d'aller jusqu'au blocage. Un
 * cabinet de plus de 3 600 fiches cyclera donc en plus d'un mois — et la tâche
 * le DIT dans son compte rendu, plutôt que de forcer le passage.
 */
const LOT_MAX = 120;

/** L'horizon promis : tout le portefeuille vu au moins une fois par mois. */
export const JOURS_DU_CYCLE = 30;

/**
 * Combien de numéros vérifier à ce passage, pour couvrir `eligibles` fiches en
 * un cycle de trente jours à raison d'un passage par jour.
 */
export function tailleDuLot(eligibles: number): number {
  if (eligibles <= 0) return 0;
  const parJour = Math.ceil(eligibles / JOURS_DU_CYCLE);
  return Math.min(LOT_MAX, Math.max(LOT_MIN, parJour));
}

/** Vrai quand le lot demandé ne suffira pas à tenir le cycle de trente jours. */
export function cycleTenu(eligibles: number): boolean {
  return tailleDuLot(eligibles) * JOURS_DU_CYCLE >= eligibles;
}

/**
 * Le nombre d'indisponibilités d'affilée au-delà duquel on arrête le lot.
 *
 * Une indisponibilité isolée est ordinaire — VIES sature, la reprise intégrée à
 * `verifier()` la rattrape le plus souvent. Cinq d'affilée disent autre chose :
 * le service est en panne, ou c'est NOUS qu'il refuse. Continuer à dérouler le
 * lot dans ce cas, c'est exactement le comportement qui fait passer d'une
 * saturation à un blocage.
 */
const ECHECS_AVANT_ARRET = 5;

export function doitInterrompre(echecsConsecutifs: number): boolean {
  return echecsConsecutifs >= ECHECS_AVANT_ARRET;
}

/**
 * L'espacement entre deux appels d'un même lot.
 *
 * Rien à voir avec la pause de reprise de `vies.ts`, qui rattrape un échec.
 * Celle-ci existe pour n'être jamais le client bruyant d'un service partagé :
 * un lot de trente numéros s'étale sur deux minutes et demie au lieu de partir
 * en rafale.
 */
export const ESPACEMENT_MS = 5_000;
