/**
 * Serveur de l'instance.
 *
 * Une instance = un cabinet. Ce processus sert :
 *   - le front statique ;
 *   - /api/auth/*     l'authentification par passkey ;
 *   - /api/config     la configuration publique, au runtime ;
 *   - /rest/v1/*      un proxy vers PostgREST, apres controle de session ;
 *   - /api/*          les routes reprises des Edge Functions (phase 3).
 *
 * PostgREST est garde parce que le front repose sur sa semantique : sélections
 * imbriquees, filtres `or`, comptages exacts. Le proxy ajoute ce qui manque —
 * session obligatoire et droits applicatifs — et donne un point d'ancrage pour
 * migrer plus tard, table par table, vers de vraies routes Node.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import statique from '@fastify/static';
import { config, configPublique } from './config.js';
import { verifierConnexion as verifierBase } from './db.js';
import { enregistrerProxyRest } from './rest-proxy.js';
import { enregistrerRoutesAuth } from './routes/auth.js';
import { enregistrerRoutesStorage, preparerStockage } from './routes/storage.js';
import { enregistrerRoutesUtilisateurs } from './routes/utilisateurs.js';
import { enregistrerRoutesEmails } from './routes/emails.js';
import { enregistrerRoutesInpi } from './routes/inpi.js';
import { enregistrerRoutesJedeclare } from './routes/jedeclare.js';
import { enregistrerRoutesTva } from './routes/tva.js';
import { enregistrerRoutesPdf } from './routes/pdf.js';
import { enregistrerRoutesMcpCles } from './routes/mcp-cles.js';
import { enregistrerRoutesMcp } from './routes/mcp.js';
import { enregistrerRoutesMcpOauth } from './routes/mcp-oauth.js';
import { enregistrerRoutesCampagnes } from './routes/campagnes.js';
import { enregistrerRoutesClients } from './routes/clients.js';
import { demarrerPlanificateur, arreterPlanificateur, listerTaches, declencher } from './planificateur.js';
import { etatVersion, versionLocale } from './version.js';
import { exigerAdmin } from './gardes.js';
import { fermer as fermerSmtp } from './mail.js';
import { serialiserRequete } from './journal.js';

const ICI = dirname(fileURLToPath(import.meta.url));

async function demarrer() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      transport: config.env === 'production' ? undefined : { target: 'pino-pretty' },
      // Ce que le journal a le droit de retenir d'une requete : voir
      // `journal.ts`, qui porte le raisonnement. En deux mots : l'URL complete
      // y ecrivait les donnees des clients du cabinet, parce que le front
      // interroge PostgREST par l'URL.
      serializers: { req: serialiserRequete },
      // Ceinture, en plus du serialiseur : `redact` couvre les endroits ou un
      // objet requete serait journalise a la main, hors du chemin ci-dessus.
      // Le cookie de session EST le jeton — le journaliser reviendrait a
      // deposer des sessions valides dans un fichier.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
    },
    // Le front peut deposer des fichiers de 10 Mo : la limite par defaut de
    // Fastify (1 Mo) les refuserait.
    bodyLimit: config.storage.tailleMaxOctets + 1024 * 1024,
    trustProxy: true,
  });

  // Un corps vide annonce comme du JSON est legitime.
  // ---------------------------------------------------------------------------
  // Le parseur par defaut de Fastify repond 400 « Body cannot be empty when
  // content-type is set to 'application/json' » des que l'en-tete annonce du
  // JSON sans corps. Or `postgrest-js` pose `Content-Type: application/json` sur
  // TOUTES ses requetes, y compris les DELETE, qui n'ont evidemment pas de corps.
  // Tous les `.delete()` du front partaient donc en 400, refuses par le proxy
  // avant meme d'atteindre PostgREST.
  //
  // Constate le 2026-08-01 sur l'ecran des declarations de revenus : le PATCH de
  // la declaration passait en 204, puis la suppression des collaborateurs
  // echouait en 400. L'ecriture etait donc bien enregistree, mais l'erreur
  // laissait la modale ouverte — l'utilisateur en concluait, raisonnablement,
  // que rien ne s'etait enregistre.
  //
  // Un corps vide devient `undefined` ; le proxy sait deja ne rien transmettre
  // dans ce cas. Un corps present reste parse comme avant.
  app.addContentTypeParser<string>(
    'application/json',
    { parseAs: 'string' },
    (_requete, corps, fait) => {
      if (corps.length === 0) return fait(null, undefined);
      try {
        fait(null, JSON.parse(corps));
      } catch {
        const erreur = Object.assign(new Error('Corps JSON invalide.'), { statusCode: 400 });
        fait(erreur, undefined);
      }
    }
  );

  await app.register(cookie);

  app.get('/api/config', async () => configPublique());

  // Meme source que l'ecran « Version et mise a jour » : `version.json` de
  // l'image, et non `APP_VERSION` que rien ne met a jour apres l'installation.
  // Deux reponses divergentes sur la meme question seraient pires qu'une seule
  // fausse — c'est ce controle que `maj.sh` interroge pour valider un
  // deploiement.
  app.get('/api/sante', async () => ({
    ok: true,
    version: versionLocale(),
  }));

  // Etat de version : une mise a jour existe-t-elle ? Reserve aux
  // administrateurs, ce sont eux qui decident de l'appliquer.
  app.get<{ Querystring: { forcer?: string } }>('/api/version', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;
    return etatVersion(request.query.forcer === '1');
  });

  // Taches planifiees : etat et declenchement manuel. Utile pour verifier un
  // reglage SMTP ou relancer une synchronisation sans attendre l'heure.
  app.get('/api/taches', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;
    return { taches: await listerTaches() };
  });

  app.post<{ Params: { nom: string } }>('/api/taches/:nom', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;
    const fait = await declencher(request.params.nom, app.log);
    if (!fait) return reply.code(404).send({ message: 'Tache inconnue.' });
    return { ok: true };
  });

  enregistrerRoutesAuth(app);
  enregistrerRoutesUtilisateurs(app);
  enregistrerRoutesEmails(app);
  enregistrerRoutesInpi(app);
  enregistrerRoutesJedeclare(app);
  enregistrerRoutesTva(app);
  enregistrerRoutesPdf(app);
  enregistrerRoutesMcpCles(app);
  enregistrerRoutesMcp(app);
  // Avant le service des fichiers statiques : ces routes ont des chemins racine
  // (`/authorize`, `/token`, `/register`, `/.well-known/…`) et doivent primer sur
  // le repli SPA, qui rendrait index.html a leur place.
  enregistrerRoutesMcpOauth(app);
  // Avant le service statique : /desinscription est un chemin racine, il doit
  // primer sur le repli SPA.
  enregistrerRoutesCampagnes(app);
  enregistrerRoutesClients(app);
  await enregistrerRoutesStorage(app);
  enregistrerProxyRest(app);

  // Le front construit est servi par le meme processus : une seule origine, donc
  // pas de CORS, et le cookie de session est naturellement transmis.
  //
  // FRONT_DIR est pose par l'image Docker, ou le front est copie dans ./public.
  // Sans cette variable on retombe sur la disposition de developpement, ou
  // `npm run build` ecrit dans ../dist depuis server/.
  const front = process.env.FRONT_DIR ?? resolve(ICI, '../../dist');
  if (existsSync(front)) {
    await app.register(statique, {
      root: front,
      prefix: '/',
      /**
       * ⚠️ DEUX POLITIQUES DE CACHE, SELON LE NOM DU FICHIER.
       *
       * Vite nomme tout ce qu'il ecrit dans `assets/` avec l'empreinte de son
       * contenu (`index-DBE8c0e9.js`) : un fichier de ce dossier ne change
       * JAMAIS sous le meme nom. Le navigateur peut donc le garder un an sans
       * jamais redemander — c'est ce que dit `immutable`.
       *
       * Tout le reste — `index.html`, `sw.js`, `manifest.webmanifest`, les
       * icones — porte un nom FIXE et change a chaque version : il doit etre
       * revalide a chaque chargement (`max-age=0`), et l'ETag rend cette
       * revalidation quasi gratuite (304).
       *
       * Avant : `max-age=0` sur tout, y compris les 155 fichiers d'`assets/`.
       * Chaque navigation revalidait chacun d'eux — 155 allers-retours pour
       * apprendre 155 fois « rien n'a change ». Caddy, en production, compresse
       * mais ne touche pas a ces en-tetes : ce que le serveur dit ici est ce
       * que le navigateur recoit. Mesure le 2026-09-03 sur le harnais local.
       */
      setHeaders(reply, chemin) {
        reply.header(
          'Cache-Control',
          chemin.includes('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate'
        );
      },
    });
    /**
     * Repli SPA : toute route inconnue rend index.html — sauf celles où une 404
     * doit rester une 404.
     *
     * `/api` et `/rest` étaient exclus depuis le début. Les chemins OAuth le sont
     * désormais aussi, et pour une raison mesurée : ce serveur N'IMPLÉMENTE PAS
     * OAuth (voir l'en-tête de routes/mcp.ts, l'authentification MCP se fait par
     * clé). Or le repli répondait **200 avec du HTML** à
     * `/.well-known/oauth-authorization-server`, `/register`, `/authorize` et
     * `/token`.
     *
     * Un client MCP qui tente la découverte OAuth — claude.ai le fait dès qu'il
     * reçoit notre 401 sur `/mcp` — lisait donc une page HTML là où il attendait
     * du JSON, sans jamais apprendre que le service n'existe pas. Il poursuivait
     * le parcours jusqu'à envoyer l'utilisateur sur `/authorize`, qui affichait
     * l'application au lieu d'un écran de consentement. Constaté le 2026-08-06.
     *
     * Répondre 404 ne rétablit pas OAuth : cela rend son absence LISIBLE, au
     * premier appel, au lieu de la déguiser en succès.
     */
    const CHEMINS_NON_SPA = [
      '/api',
      '/rest',
      '/.well-known',
      '/authorize',
      '/token',
      '/register',
      '/oauth',
      '/desinscription',
    ];
    app.setNotFoundHandler((request, reply) => {
      const chemin = request.url.split('?')[0] ?? '';
      if (CHEMINS_NON_SPA.some((p) => chemin === p || chemin.startsWith(`${p}/`))) {
        return reply.code(404).send({ message: 'Route inconnue.' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.log.warn(`Front introuvable dans ${front} — seule l'API est servie.`);
  }

  await verifierBase();
  await preparerStockage();

  demarrerPlanificateur(app.log);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`CRM Cabinet — ${config.publicUrl}`);
  app.log.info(`RP ID WebAuthn : ${config.webauthn.rpId}`);
  if (!config.smtp.configure) app.log.warn('SMTP non configure : aucun email ne sera envoye.');
  if (!config.inpi.configure) app.log.warn('INPI non configure : les synchronisations sont inactives.');
  if (config.vies.desactivee) app.log.warn('VIES desactive : les numeros de TVA ne seront pas verifies.');

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      app.log.info(`${signal} recu, arret.`);
      arreterPlanificateur();
      fermerSmtp();
      void app.close().then(() => process.exit(0));
    });
  }
}

demarrer().catch((e) => {
  console.error('Demarrage impossible :', e instanceof Error ? e.message : e);
  process.exit(1);
});
