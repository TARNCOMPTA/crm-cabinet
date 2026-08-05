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

import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

/** Rôle Postgres endossé par les requêtes du front via PostgREST. */
export const ROLE_POSTGREST = 'authenticated';

export interface Revendications {
  /** Identifiant du profil. `sub` est le nom attendu par PostgREST. */
  sub: string;
  /** Rôle Postgres, pas rôle applicatif. */
  role: string;
  /** Rôle applicatif : 'admin' ou 'user'. */
  roleApp: string;
  email: string;
  exp?: number;
}

export function signerJeton(profil: { id: string; email: string; role: string }): string {
  const revendications: Revendications = {
    sub: profil.id,
    role: ROLE_POSTGREST,
    roleApp: profil.role,
    email: profil.email,
  };
  return jwt.sign(revendications, config.session.secret, {
    expiresIn: config.session.dureeSecondes,
  });
}

export function verifierJeton(jeton: string): Revendications | null {
  try {
    return jwt.verify(jeton, config.session.secret) as Revendications;
  } catch {
    return null;
  }
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
