/**
 * Routes d'authentification.
 *
 * Parcours de connexion :        POST /api/auth/connexion/options → /verifier
 * Parcours d'enrôlement :        POST /api/auth/enrolement/options → /verifier
 * Session courante :             GET  /api/auth/session
 * Déconnexion :                  POST /api/auth/deconnexion
 *
 * La clé de défi est l'identifiant de session anonyme du navigateur, posé en
 * cookie court le temps de l'échange : sans elle, deux connexions simultanées
 * depuis le même serveur se mélangeraient les défis.
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  optionsConnexion,
  optionsEnrolement,
  verifierConnexion,
  verifierEnrolement,
  listerPasskeys,
  supprimerPasskey,
} from '../auth/passkeys.js';
import { consommerCode, profilPourCode } from '../auth/enrolement.js';
import { effacerCookie, lireSession, poserCookie, signerJeton } from '../auth/session.js';
import { exigerSession } from '../gardes.js';
import { requeteUne } from '../db.js';
import { acquitter, souscontrole } from '../limiteur.js';

const COOKIE_DEFI = 'crm_defi';

/**
 * Dix tentatives de connexion par quart d'heure et par adresse.
 *
 * Large pour un humain — une passkey se presente en un geste, et l'echec y est
 * rare — mais assez etroit pour qu'un automate n'enchaine pas. Un essai reussi
 * remet le compteur a zero : le cabinet qui travaille derriere une seule adresse
 * publique ne doit pas s'auto-bloquer.
 */
const BORNES_CONNEXION = { max: 10, fenetreMs: 15 * 60_000 };

/**
 * Cinq essais de code d'enrolement par quart d'heure. Plus severe : le code est
 * saisi une fois, au calme, depuis un mail ou une note de l'administrateur.
 */
const BORNES_ENROLEMENT = { max: 5, fenetreMs: 15 * 60_000 };

function cleDefi(request: FastifyRequest, reply: FastifyReply): string {
  const existante = request.cookies[COOKIE_DEFI];
  if (existante) return existante;
  const nouvelle = randomUUID();
  reply.setCookie(COOKIE_DEFI, nouvelle, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 300,
  });
  return nouvelle;
}

export function enregistrerRoutesAuth(app: FastifyInstance): void {
  // ---- Connexion ----------------------------------------------------------
  app.post('/api/auth/connexion/options', async (request, reply) => {
    const cle = cleDefi(request, reply);
    return optionsConnexion(cle);
  });

  app.post<{ Body: { reponse: AuthenticationResponseJSON } }>(
    '/api/auth/connexion/verifier',
    async (request, reply) => {
      if (!souscontrole(request, reply, 'connexion', BORNES_CONNEXION)) return;

      const cle = request.cookies[COOKIE_DEFI];
      if (!cle) return reply.code(400).send({ message: 'Defi absent ou expire.' });

      const profil = await verifierConnexion(cle, request.body.reponse);
      if (!profil) {
        // Message volontairement identique dans tous les cas d'échec : ne pas
        // révéler si la passkey est inconnue, le compte désactivé, ou le défi
        // expiré.
        return reply.code(401).send({ message: 'Connexion refusee.' });
      }

      acquitter(`connexion:${request.ip}`);
      poserCookie(reply, signerJeton(profil));
      reply.clearCookie(COOKIE_DEFI, { path: '/' });
      return {
        profil: {
          id: profil.id,
          email: profil.email,
          role: profil.role,
          prenom: profil.prenom,
          nom: profil.nom,
        },
      };
    }
  );

  // ---- Enrôlement d'une passkey -------------------------------------------
  // Deux entrées : avec un code (premier enrôlement, hors session) ou depuis une
  // session ouverte (ajout d'un appareil).
  app.post<{ Body: { code?: string } }>(
    '/api/auth/enrolement/options',
    async (request, reply) => {
      const session = lireSession(request);
      // Seule la voie « par code » est comptee : ajouter un appareil depuis une
      // session deja ouverte n'essaie aucun secret.
      if (!session && !souscontrole(request, reply, 'enrolement', BORNES_ENROLEMENT)) return;

      let profil: { id: string; email: string; prenom: string | null; nom: string | null } | null =
        null;

      if (session) {
        profil = await requeteUne(
          'SELECT id, email, prenom, nom FROM profiles WHERE id = $1 AND is_active',
          [session.sub]
        );
      } else if (request.body?.code) {
        profil = await profilPourCode(request.body.code);
      }

      if (!profil) {
        return reply.code(401).send({ message: 'Code d\'enrolement invalide ou expire.' });
      }

      // Un code VALIDE rend son credit a l'adresse, comme le fait la connexion
      // reussie. Sans cela, seules les tentatives etaient comptees mais les
      // reussites aussi : un cabinet qui enrole six collaborateurs le meme matin,
      // depuis la meme adresse publique, voyait le sixieme refuse un quart
      // d'heure durant. Constate en enchainant les parcours de bout en bout.
      // Ce qu'on cherche a ralentir, c'est la recherche d'un code par essais —
      // et elle, par construction, n'acquitte jamais.
      if (!session) acquitter(`enrolement:${request.ip}`);

      const cle = cleDefi(request, reply);
      reply.setCookie('crm_enrolement', profil.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 300,
      });
      void cle;
      return optionsEnrolement(profil);
    }
  );

  app.post<{ Body: { reponse: RegistrationResponseJSON; libelle?: string; code?: string } }>(
    '/api/auth/enrolement/verifier',
    async (request, reply) => {
      const userId = request.cookies['crm_enrolement'];
      if (!userId) return reply.code(400).send({ message: 'Enrolement non commence.' });

      const ok = await verifierEnrolement(
        userId,
        request.body.reponse,
        request.body.libelle ?? null
      );
      if (!ok) return reply.code(400).send({ message: 'Enrolement refuse.' });

      // Le code n'est brûlé qu'ici : un enrôlement interrompu ne le consomme pas.
      if (request.body.code) await consommerCode(request.body.code);
      reply.clearCookie('crm_enrolement', { path: '/' });
      reply.clearCookie(COOKIE_DEFI, { path: '/' });

      // L'enrôlement vaut connexion : l'utilisateur vient de prouver qu'il
      // détient l'appareil.
      const profil = await requeteUne<{
        id: string;
        email: string;
        role: string;
        prenom: string | null;
        nom: string | null;
      }>('SELECT id, email, role, prenom, nom FROM profiles WHERE id = $1', [userId]);
      if (profil) poserCookie(reply, signerJeton(profil));

      return { profil };
    }
  );

  // ---- Session ------------------------------------------------------------
  app.get('/api/auth/session', async (request, reply) => {
    // `exigerSession` refuse aussi les comptes fermes depuis l'emission du
    // jeton, et efface le cookie au passage.
    const session = await exigerSession(request, reply);
    if (!session) return;

    const profil = await requeteUne(
      `SELECT id, email, role, prenom, nom, avatar_url, display_name, job_role,
              is_active, show_my_dossiers
         FROM profiles WHERE id = $1`,
      [session.sub]
    );
    if (!profil) return reply.code(401).send({ message: 'Profil introuvable.' });
    return { profil };
  });

  app.post('/api/auth/deconnexion', async (_request, reply) => {
    effacerCookie(reply);
    return { ok: true };
  });

  // ---- Gestion de ses passkeys -------------------------------------------
  app.get('/api/auth/passkeys', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;
    return { passkeys: await listerPasskeys(session.sub) };
  });

  app.delete<{ Params: { id: string } }>(
    '/api/auth/passkeys/:id',
    async (request, reply) => {
      const session = await exigerSession(request, reply);
      if (!session) return;

      const r = await supprimerPasskey(session.sub, request.params.id);
      if (!r.ok) return reply.code(409).send({ message: r.raison });
      return { ok: true };
    }
  );
}
