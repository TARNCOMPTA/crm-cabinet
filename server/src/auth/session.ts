/**
 * Sessions et jetons.
 *
 * Un seul jeton sert deux usages, ce qui est délibéré :
 *   - il identifie l'utilisateur pour les routes du serveur ;
 *   - il est transmis tel quel à PostgREST, qui le valide avec le MÊME secret.
 *
 * D'où la forme des revendications : `role` et `sub` sont ce que PostgREST
 * attend. Le jeton voyage dans un cookie httpOnly, jamais accessible au
 * JavaScript de la page — c'est ce qui protège d'un vol par XSS.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { signerAvec, verifierAvec, type Revendications } from './jeton.js';

// La signature et la vérification vivent dans `jeton.ts`, sans configuration :
// c'est ce qui les rend exerçables. Ici on ne fait que leur passer le secret.
export { ROLE_POSTGREST } from './jeton.js';
export type { Revendications } from './jeton.js';

export function signerJeton(profil: { id: string; email: string; role: string }): string {
  return signerAvec(profil, config.session.secret, config.session.dureeSecondes);
}

export function verifierJeton(jeton: string): Revendications | null {
  return verifierAvec(jeton, config.session.secret);
}

export function poserCookie(reply: FastifyReply, jeton: string): void {
  reply.setCookie(config.session.nomCookie, jeton, {
    httpOnly: true,
    // En production l'instance est toujours en HTTPS (Caddy) : le cookie ne doit
    // pas voyager en clair. En développement sur localhost, secure l'empêcherait
    // d'être posé du tout.
    secure: config.env === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: config.session.dureeSecondes,
  });
}

export function effacerCookie(reply: FastifyReply): void {
  reply.clearCookie(config.session.nomCookie, { path: '/' });
}

export function lireSession(request: FastifyRequest): Revendications | null {
  const jeton = request.cookies[config.session.nomCookie];
  if (!jeton) return null;
  return verifierJeton(jeton);
}

export function lireJetonBrut(request: FastifyRequest): string | null {
  return request.cookies[config.session.nomCookie] ?? null;
}
