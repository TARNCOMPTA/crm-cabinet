/**
 * Proxy vers PostgREST.
 * ---------------------------------------------------------------------------
 * C'est la pièce qui évite de réécrire la couche données du front. Celui-ci
 * compte 70 appels `.from()` qui reposent sur la sémantique PostgREST : 22
 * sélections imbriquées dont 10 en `!inner`, 11 filtres `.or()`, 34 comptages
 * exacts avec en-tête Content-Range. Réimplémenter tout cela fidèlement serait
 * long et truffé de pièges ; PostgREST est un binaire unique et sans état, on le
 * garde.
 *
 * Ce que le proxy ajoute, et qui justifie de ne pas exposer PostgREST
 * directement :
 *   - il exige une session valide, refusant tout accès anonyme ;
 *   - il transmet le jeton de session, que PostgREST valide avec le même secret ;
 *   - il applique les droits applicatifs (voir rest-droits.ts) ;
 *   - il donne un point d'ancrage pour migrer plus tard, table par table, vers
 *     de vraies routes Node.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { lireJetonBrut } from './auth/session.js';
import { exigerSession } from './gardes.js';
import { oublierComptes } from './auth/compte.js';
import { deciderAcces, nomTable } from './rest-droits.js';

/** En-têtes qui ne doivent pas être recopiés tels quels vers l'amont. */
const ENTETES_A_NE_PAS_TRANSMETTRE = new Set([
  'host', 'connection', 'content-length', 'cookie', 'authorization',
  'apikey', 'accept-encoding',
]);

export function enregistrerProxyRest(app: FastifyInstance): void {
  app.route({
    method: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    url: '/rest/v1/*',
    // Le corps est transmis brut : PostgREST attend le JSON tel que le client
    // l'a écrit, et le re-sérialiser risquerait d'en altérer les nombres.
    config: {},
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // `exigerSession` confronte le jeton à la base : un compte fermé depuis
      // l'émission du jeton n'entre pas, et le rôle appliqué ci-dessous est
      // celui d'aujourd'hui, pas celui d'il y a six jours.
      const session = await exigerSession(request, reply);
      if (!session) return;

      const verdict = deciderAcces({
        methode: request.method,
        url: request.url,
        roleApp: session.roleApp,
        sub: session.sub,
        corps: request.body,
      });
      if (!verdict.autorise) {
        return reply.code(verdict.code).send({ message: verdict.message });
      }

      const cible = config.postgrest.url + request.url.replace(/^\/rest\/v1/, '');

      const entetes: Record<string, string> = {};
      for (const [cle, valeur] of Object.entries(request.headers)) {
        if (ENTETES_A_NE_PAS_TRANSMETTRE.has(cle)) continue;
        if (typeof valeur === 'string') entetes[cle] = valeur;
        else if (Array.isArray(valeur)) entetes[cle] = valeur.join(', ');
      }
      // PostgREST valide ce jeton avec le même secret que le serveur : c'est ce
      // qui rend `auth.uid()` et le rôle disponibles côté base.
      const jeton = lireJetonBrut(request);
      if (jeton) entetes['authorization'] = `Bearer ${jeton}`;

      let corps: string | undefined;
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined) {
        corps = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        entetes['content-type'] ??= 'application/json';
      }

      let amont: Response;
      try {
        amont = await fetch(cible, { method: request.method, headers: entetes, body: corps });
      } catch (e) {
        request.log.error({ err: e, cible }, 'PostgREST injoignable');
        return reply.code(502).send({ message: 'Service de donnees injoignable.' });
      }

      // Une écriture sur `profiles` change peut-être un rôle ou ferme un compte.
      // Vider le cache d'état ici rend la révocation immédiate : l'administrateur
      // qui désactive un collaborateur n'a pas à attendre l'expiration du cache
      // pour que la session de l'intéressé cesse d'être acceptée.
      if (amont.ok && request.method !== 'GET' && nomTable(request.url) === 'profiles') {
        oublierComptes();
      }

      // Content-Range porte les comptages exacts : le front en dépend pour la
      // pagination, il doit être transmis.
      amont.headers.forEach((valeur, cle) => {
        if (cle === 'content-encoding' || cle === 'content-length' || cle === 'transfer-encoding') return;
        reply.header(cle, valeur);
      });

      const texte = await amont.text();
      return reply.code(amont.status).send(texte);
    },
  });
}
