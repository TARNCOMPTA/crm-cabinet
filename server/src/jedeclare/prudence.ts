/**
 * A-T-ON LE DROIT DE LIRE CET ACCUSÉ ?
 * ---------------------------------------------------------------------------
 * La seule décision du suivi dont une erreur est IRRÉVERSIBLE : lire un accusé
 * le marque « récupéré » chez jedeclare, et le logiciel de production du
 * cabinet, qui filtre sur « non récupérés », ne le reverra jamais comme nouveau.
 * Rien ne défait un marquage.
 *
 * LA PRUDENCE SE DÉCIDE COMPTE PAR COMPTE, et non pour le cabinet entier. Le
 * mode prudent n'ouvre que les accusés déjà marqués récupérés : les lire ne
 * retire alors rien au logiciel de production, qui les a déjà vus. C'est la
 * bonne règle — tant qu'un logiciel relève effectivement le compte.
 *
 * Sur un compte que PERSONNE ne relève, aucun accusé n'est jamais marqué, et la
 * règle se retourne : 100 % des pièces sont écartées, à chaque analyse, et le
 * compte n'entre jamais dans le suivi. Mesuré le 2026-08-09 sur un cabinet à
 * deux comptes — 235 pièces analysées d'un côté, 204 écartées de l'autre, dont
 * pas une seule n'aurait pu passer un jour. Le total, lui, avait seulement l'air
 * partiel.
 *
 * D'où le réglage, et d'où sa granularité : le cabinet répond compte par compte
 * parce que la réalité est différente compte par compte. Il ne s'active que dans
 * le `.env` du serveur (`JEDECLARE_MARQUAGE_AUTORISE{suffixe}`), jamais depuis
 * l'application — voir `CompteJedeclare.marquageAutorise`.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE MODULE N'IMPORTE RIEN
 *
 * Ni `config`, ni la base : les comptes arrivent en argument. C'est la même
 * raison que pour `rest-droits.ts` — un module sans dépendance est exécutable
 * par vitest, et cette règle-ci mérite plus que tout d'être vérifiable sans
 * monter une instance. `suivi.ts` lui passe `config.jedeclare.comptes`.
 */

/** Le seul champ que la règle regarde d'un compte de flux. */
export interface ComptePrudence {
  marquageAutorise: boolean;
}

export function pieceLisible(
  piece: { compte: number; recuperee: boolean },
  prudent: boolean,
  comptes: readonly ComptePrudence[]
): boolean {
  if (!prudent) return true;
  if (piece.recuperee) return true;
  // Un rang hors liste — numérotation trouée, configuration changée entre deux
  // analyses — n'ouvre RIEN : l'inconnu se traite en prudent.
  return comptes[piece.compte]?.marquageAutorise === true;
}
