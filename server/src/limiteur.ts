/**
 * Limitation de débit sur les points d'entrée d'authentification.
 * ---------------------------------------------------------------------------
 * Rien ne freinait les tentatives. Trois portes s'ouvrent avec un secret, et
 * toutes trois acceptaient un nombre illimité d'essais :
 *
 *   - la connexion par passkey ;
 *   - la saisie d'un code d'enrôlement — dix caractères sur un alphabet de 32,
 *     soit 2^50 possibilités. Beaucoup, mais un code vaut une identité, et le
 *     laisser essayer sans compter est un choix qu'on ne prend pas exprès ;
 *   - le connecteur MCP, dont la clé ouvre la lecture de toute la base.
 *
 * Écrit à la main plutôt qu'ajouté en dépendance : le besoin tient en quarante
 * lignes, l'instance est mono-processus, et le projet a déjà fait ce choix pour
 * le protocole MCP — « cela évite d'embarquer le SDK et sa dépendance à zod dans
 * l'image ». Une dépendance de plus est une surface de plus, et une image plus
 * lourde à tirer chez chaque cabinet.
 *
 * SUR LES ADRESSES IP. Le produit ne les conserve pas dans ses journaux d'accès,
 * et c'est délibéré (voir le Caddyfile). Ce compteur ne les conserve pas
 * davantage : elles vivent en mémoire, le temps d'une fenêtre, et rien ne les
 * écrit sur disque. Un redémarrage remet tout à zéro — sans importance, la
 * limitation vise l'essai en rafale, pas la campagne étalée sur des mois.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

interface Compteur {
  essais: number;
  /** Fin de la fenêtre courante, en millisecondes. */
  fin: number;
}

export interface Bornes {
  /** Nombre d'essais tolérés par fenêtre. */
  max: number;
  /** Durée de la fenêtre, en millisecondes. */
  fenetreMs: number;
}

const compteurs = new Map<string, Compteur>();

/**
 * Consomme un essai. Rend `true` s'il reste du crédit, `false` s'il faut refuser.
 *
 * La fenêtre est glissante par blocs : au premier essai d'un bloc on ouvre une
 * fenêtre, et tout ce qui arrive dedans s'y ajoute. C'est plus grossier qu'une
 * vraie fenêtre glissante, et suffisant — on cherche à casser la cadence d'un
 * automate, pas à compter juste.
 */
export function consommer(cle: string, bornes: Bornes): boolean {
  const maintenant = Date.now();
  const c = compteurs.get(cle);

  if (!c || c.fin <= maintenant) {
    compteurs.set(cle, { essais: 1, fin: maintenant + bornes.fenetreMs });
    return true;
  }

  c.essais += 1;
  return c.essais <= bornes.max;
}

/** Remet un compteur à zéro. Appelé après une authentification réussie. */
export function acquitter(cle: string): void {
  compteurs.delete(cle);
}

/**
 * Garde prête à poser sur une route. Rend `false` quand elle a déjà répondu.
 *
 * `request.ip` est l'adresse réelle du client : Fastify tourne avec
 * `trustProxy`, et Caddy renseigne `X-Forwarded-For`.
 */
export function souscontrole(
  request: FastifyRequest,
  reply: FastifyReply,
  nom: string,
  bornes: Bornes
): boolean {
  if (consommer(`${nom}:${request.ip}`, bornes)) return true;

  const secondes = Math.ceil(bornes.fenetreMs / 1000);
  reply
    .code(429)
    .header('retry-after', String(secondes))
    .send({ message: 'Trop de tentatives. Reessayez dans un instant.' });
  return false;
}

/** Purge des fenêtres closes : la Map ne doit pas croître indéfiniment. */
setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, c] of compteurs) if (c.fin <= maintenant) compteurs.delete(cle);
}, 60_000).unref();
