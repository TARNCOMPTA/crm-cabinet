/**
 * Gardes de session, partagées par les routes.
 *
 * Les Edge Functions refaisaient chacune le même contrôle : lire l'en-tête
 * Authorization, appeler `auth.getUser()`, relire le profil pour connaître le
 * rôle. Trois allers-retours réseau par appel, dupliqués huit fois.
 *
 * Ici le jeton porte déjà l'identité et le rôle, signés : le contrôle est local.
 * Mais un jeton dit ce qui était vrai au moment de la connexion, et une session
 * dure sept jours. Les gardes confrontent donc la revendication à la base — via
 * un cache de trente secondes, pour que cela ne coûte pas une requête par appel
 * (voir auth/compte.ts). Sans cette confrontation, fermer un compte ne fermait
 * rien : seul le navigateur de l'intéressé s'en apercevait.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { effacerCookie, lireSession, type Revendications } from './auth/session.js';
import { etatCompte } from './auth/compte.js';

/**
 * Rend les revendications À JOUR, ou répond 401 et rend null.
 *
 * Le `roleApp` rendu est celui de la BASE, pas celui du jeton : c'est ce qui
 * fait qu'une rétrogradation prend effet sans attendre l'expiration.
 *
 * L'appelant doit tester le retour : `if (!session) return;`. Fastify a déjà
 * envoyé la réponse à ce stade, il n'y a rien à ajouter.
 */
export async function exigerSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Revendications | null> {
  const session = lireSession(request);
  if (!session) {
    reply.code(401).send({ message: 'Session requise.' });
    return null;
  }

  const etat = await etatCompte(session.sub);
  if (!etat || !etat.actif) {
    // Le cookie est effacé au passage : sans cela le navigateur continuerait de
    // le présenter à chaque appel, et l'utilisateur resterait sur une interface
    // qui échoue partout sans lui dire pourquoi.
    effacerCookie(reply);
    reply.code(401).send({ message: 'Compte desactive ou supprime.' });
    return null;
  }

  return { ...session, roleApp: etat.roleApp };
}

/** Même contrat, avec en plus le rôle applicatif « admin ». */
export async function exigerAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Revendications | null> {
  const session = await exigerSession(request, reply);
  if (!session) return null;
  if (session.roleApp !== 'admin') {
    reply.code(403).send({ message: 'Reserve aux administrateurs.' });
    return null;
  }
  return session;
}
