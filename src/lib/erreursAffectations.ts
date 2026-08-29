import { codeErreur, messageErreur, statutHttp } from './erreurs';

/**
 * Ce qu'un échec d'affectation veut dire, en français.
 * ---------------------------------------------------------------------------
 * ⚠️ L'ÉCRAN DISAIT « Erreur lors de la sauvegarde », ET RIEN D'AUTRE. Une base
 * injoignable, une session expirée, un droit refusé par PostgREST et une
 * affectation déjà posée par un collègue donnaient tous le même mot — celui qui
 * n'apprend rien, et devant lequel la seule conduite possible est de réessayer
 * à l'identique. Le message le plus coûteux d'une interface n'est pas celui qui
 * manque : c'est celui qui recouvre quatre causes qui appellent quatre gestes
 * différents.
 *
 * Les codes sont ceux de PostgreSQL, relayés tels quels par PostgREST. Ils se
 * COMPARENT, là où un message s'affiche : c'est la raison d'être de
 * `codeErreur`, et pourquoi rien ici ne teste le texte d'une erreur.
 *
 * ⚠️ AUCUN DE CES MESSAGES NE DIT CE QUI A ÉTÉ ENREGISTRÉ. Une sauvegarde part
 * en deux requêtes — les retraits, puis les ajouts — et seul l'appelant sait où
 * elle s'est arrêtée. Il le préfixe lui-même (« Ajout impossible (les retraits,
 * eux, sont enregistrés) »), et un « rien n'a été enregistré » ajouté ici le
 * contredirait mot pour mot.
 *
 * Ce module est séparé du composant pour pouvoir être exercé sans monter la
 * fenêtre : c'est une table de correspondance, elle n'a besoin d'aucun DOM.
 */
export function messageEchecAffectation(e: unknown, defaut: string): string {
  switch (codeErreur(e)) {
    // UNIQUE (client_id, user_id) — `schema/cible.sql`. L'affectation existe
    // déjà : un collègue l'a posée pendant que la fenêtre était ouverte, ou une
    // sauvegarde précédente s'est arrêtée au milieu.
    case '23505':
      return 'Une de ces affectations existe déjà : rouvrez la fenêtre pour repartir de l\'état réel';
    // Clé étrangère vers `clients` ou `profiles` : le client ou le
    // collaborateur a été supprimé entre le chargement de la liste et
    // l'enregistrement.
    case '23503':
      return 'Un client ou le collaborateur a été supprimé entre-temps : rouvrez la fenêtre';
    // PostgREST refuse l'écriture. Ce n'est pas une panne, c'est un refus, et
    // réessayer ne changera rien.
    case '42501':
      return 'Droits insuffisants pour modifier les affectations';
    default:
      break;
  }

  // Le statut HTTP ne vient qu'après le code : une erreur PostgreSQL arrive
  // dans une réponse 400 ou 409, et lire le statut d'abord écraserait le
  // diagnostic précis par un générique.
  //
  // ⚠️ Ce statut n'existe QUE si l'appelant l'a joint à l'erreur. `postgrest-js`
  // le rend à côté (`{ data, error, status }`) et non dedans : une erreur levée
  // par un simple `throw error` l'a déjà perdu, et les deux cas ci-dessous ne se
  // déclenchent jamais. Vérifié dans Chromium : une session expirée affichait
  // « JWT expired ». Voir `AssignmentsManagementModal.lever()`.
  const statut = statutHttp(e);
  if (statut === 401) return 'Session expirée : reconnectez-vous';
  if (statut === 403) return 'Droits insuffisants pour modifier les affectations';

  // ⚠️ AUCUNE RÉPONSE DU TOUT — serveur arrêté, réseau coupé, requête bloquée.
  // `postgrest-js` marque ce cas par `status: 0`, et remplit `message` avec le
  // texte du navigateur : « TypeError: Failed to fetch ». Vérifié dans
  // Chromium, il s'affichait tel quel dans le bandeau, en anglais et avec le
  // nom de la classe d'exception, devant un expert-comptable.
  //
  // Le repère est le STATUT ZÉRO, pas le texte : celui-ci change d'un
  // navigateur à l'autre (« NetworkError when attempting to fetch resource »
  // sous Firefox). Le `instanceof` couvre la même panne sur un appel qui ne
  // passe pas par `postgrest-js`.
  if (statut === 0 || e instanceof TypeError) return 'Serveur injoignable : vérifiez votre connexion';

  // Partout ailleurs, le message porté est affiché tel quel plutôt que
  // remplacé — il est le seul indice qui reste, et le masquer nous ramènerait
  // exactement au défaut corrigé ici.
  return messageErreur(e, defaut);
}
