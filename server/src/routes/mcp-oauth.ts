/**
 * OAuth 2.1 pour le connecteur MCP — le strict necessaire, et rien de plus.
 * ---------------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE, APRES QUE LA REFONTE A RETIRE OAUTH.
 *
 * Le raisonnement du retrait tenait : OAuth sert a ce qu'un utilisateur delegue
 * l'acces a une application tierce, alors qu'ici l'administrateur branche son
 * propre client sur sa propre instance. Une cle suffit — et suffit toujours pour
 * Claude Code ou Cursor, qui acceptent un en-tete `Authorization` fixe.
 *
 * Mais le connecteur de claude.ai n'offre aucun champ pour un en-tete : il fait
 * OAuth ou rien. Constate le 2026-08-06. `mcp_api_keys` reste donc en place,
 * inchangee, et les deux voies coexistent.
 *
 * CE QUI EST DELIBEREMENT ABSENT : les `client_credentials`, les jetons
 * d'identite, les scopes multiples, la revocation par point d'API. Ce serveur
 * n'a qu'une ressource et qu'un droit — lire les donnees du cabinet. Chaque
 * mecanisme ajoute serait une surface a defendre sans usage.
 *
 * ⚠️ LES CINQ POINTS OU CES IMPLEMENTATIONS SE CASSENT, et ce qui les couvre :
 *
 *   1. `redirect_uri` — comparee au CARACTERE PRES a la liste enregistree. Une
 *      correspondance par prefixe transforme ce point en redirection ouverte,
 *      donc en vol de code d'autorisation.
 *   2. PKCE — obligatoire, `S256` seul. `plain` est refuse : il ne prouve rien.
 *   3. Les codes — soixante secondes, un seul usage, lies au client, a l'URI ET
 *      au defi. Un code rejoue revoque toute la chaine, parce qu'un code presente
 *      deux fois est le signe d'une interception.
 *   4. `state` — reemis tel quel, sans quoi le client ne peut pas se defendre.
 *   5. Les secrets — jamais stockes en clair, compares en temps constant.
 *
 * SUR LE CSRF DU CONSENTEMENT : le cookie de session est en `SameSite=Lax`, ce
 * qui interdit au navigateur de l'envoyer sur une requete POST inter-site. Un
 * formulaire heberge ailleurs ne peut donc pas valider un consentement a la
 * place de l'utilisateur. C'est le navigateur qui tient cette garantie, pas une
 * astuce applicative — et c'est aussi ce qui permet a `Lax` de laisser passer la
 * NAVIGATION venue de claude.ai vers `/authorize`, qui est un GET.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { requete, requeteUne } from '../db.js';
import { lireSession } from '../auth/session.js';
import { exigerAdmin } from '../gardes.js';
import { acquitter, souscontrole } from '../limiteur.js';
import {
  echapperHtml,
  redirectionAutorisee,
  uriRedirectionValide,
  verifierPkce,
} from '../mcp/oauth-regles.js';

/** Un seul droit : lire. Le connecteur MCP n'ecrit rien. */
const SCOPE = 'mcp:read';

const VIE_ACCES_S = 3600;
const VIE_RAFRAICHIR_MS = 30 * 24 * 3600 * 1000;
/** Une minute : le code ne fait qu'un aller-retour de navigateur. */
const VIE_CODE_MS = 60_000;

/**
 * Plafond de clients enregistres. `/register` est PUBLIC par specification —
 * c'est la seule porte non authentifiee de ce fichier. Le debit est borne, et ce
 * plafond evite qu'un enregistrement en boucle ne remplisse la table.
 */
const MAX_CLIENTS = 20;

const BORNES_REGISTER = { max: 5, fenetreMs: 60 * 60_000 };
const BORNES_TOKEN = { max: 60, fenetreMs: 15 * 60_000 };

function hacher(valeur: string): string {
  return createHash('sha256').update(valeur).digest('hex');
}

/** Voir `memeHache` de mcp.ts : une comparaison `===` fuit par son temps. */
function memeHache(a: string, b: string): boolean {
  const ta = Buffer.from(a, 'hex');
  const tb = Buffer.from(b, 'hex');
  return ta.length === tb.length && timingSafeEqual(ta, tb);
}

/** 32 octets d'alea : ni deviner ni enumerer. */
function secretAleatoire(prefixe: string): string {
  return `${prefixe}_${randomBytes(32).toString('base64url')}`;
}

function base(): string {
  return config.publicUrl.replace(/\/$/, '');
}

// ------------------------------------------------------------------ validation
// du jeton d'acces, appelee par mcp.ts a chaque requete du protocole.

export interface JetonValide {
  tokenId: string;
  clientId: string;
  userId: string;
}

/**
 * Valide un jeton d'acces opaque.
 *
 * Rend `null` sans distinguer les causes : « inconnu », « expire » et « revoque »
 * n'ont pas a etre discernables de l'exterieur.
 */
export async function validerJetonAcces(valeur: string): Promise<JetonValide | null> {
  const ligne = await requeteUne<{
    id: string;
    client_id: string;
    user_id: string;
    acces_hash: string;
  }>(
    `SELECT id, client_id, user_id, acces_hash
       FROM mcp_oauth_tokens
      WHERE acces_hash = $1
        AND revoque_le IS NULL
        AND acces_expire_le > now()`,
    [hacher(valeur)]
  );
  if (!ligne) return null;
  // La comparaison a temps constant ne protege rien ici — la recherche s'est
  // faite sur le hache, qui est l'index — mais elle coute une ligne et ferme la
  // porte si cette requete devenait un jour un `LIKE` ou une jointure.
  if (!memeHache(hacher(valeur), ligne.acces_hash)) return null;

  void requete('UPDATE mcp_oauth_tokens SET last_used_at = now() WHERE id = $1', [ligne.id]).catch(
    () => undefined
  );

  return { tokenId: ligne.id, clientId: ligne.client_id, userId: ligne.user_id };
}

// -------------------------------------------------------------------- affichage

function page(titre: string, corps: string, code = 200): { code: number; html: string } {
  return {
    code,
    html: `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapperHtml(titre)} — CRM Cabinet</title>
<style>
  :root { color-scheme: light dark }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#faf8f7; color:#1c1917;
         font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:24px }
  main { max-width:32rem; width:100%; background:#fff; border:1px solid #e7e5e4;
         border-radius:16px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,.06) }
  h1 { margin:0 0 12px; font-size:1.35rem; color:#7c2d5e }
  p { margin:0 0 14px; color:#44403c }
  ul { margin:0 0 18px; padding-left:20px; color:#44403c }
  .boutons { display:flex; gap:12px; flex-wrap:wrap; margin-top:22px }
  button, a.bouton { min-height:44px; padding:0 20px; border-radius:10px; border:0;
        font:inherit; font-weight:600; cursor:pointer; display:inline-flex;
        align-items:center; justify-content:center; text-decoration:none }
  .oui { background:#7c2d5e; color:#fff }
  .non { background:#f5f5f4; color:#44403c; border:1px solid #e7e5e4 }
  code { background:#f5f5f4; padding:2px 6px; border-radius:6px; font-size:.9em }
  @media (prefers-color-scheme: dark) {
    body { background:#1c1917; color:#f5f5f4 }
    main { background:#292524; border-color:#44403c }
    p, ul { color:#d6d3d1 } .non { background:#44403c; color:#f5f5f4; border-color:#57534e }
    code { background:#44403c }
  }
</style></head><body><main>${corps}</main></body></html>`,
  };
}

function rendre(reply: FastifyReply, r: { code: number; html: string }): FastifyReply {
  return reply.code(r.code).type('text/html; charset=utf-8').send(r.html);
}

// ------------------------------------------------------------------- les routes

interface ParamsAutorisation {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

interface ClientEnregistre {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

/**
 * Le verdict de la validation, en union ETIQUETEE.
 *
 * L'etiquette n'est pas cosmetique : elle force chaque appelant à traiter les
 * trois cas, et surtout à ne pas confondre « erreur affichable ici » et « erreur
 * renvoyable au client ». C'est exactement la distinction dont dépend la sûreté
 * du point d'autorisation — rediriger une erreur vers une URI non encore
 * vérifiée serait la faille que la comparaison exacte existe pour fermer.
 */
type Validation =
  | { type: 'page'; page: { code: number; html: string } }
  | { type: 'erreur'; uri: string; erreur: string; description: string }
  | { type: 'ok'; client: ClientEnregistre; uri: string };

async function lireClient(clientId: string | undefined): Promise<ClientEnregistre | null> {
  if (!clientId) return null;
  return requeteUne<ClientEnregistre>(
    `SELECT client_id, client_name, redirect_uris
       FROM mcp_oauth_clients
      WHERE client_id = $1 AND is_active`,
    [clientId]
  );
}

/**
 * Redirige vers le client avec une erreur OAuth.
 *
 * N'est appelee QU'APRES validation de l'URI : avant, une erreur doit s'afficher
 * ici meme. Rediriger vers une URI non verifiee serait exactement la faille que
 * la comparaison exacte existe pour fermer.
 */
function redirigerErreur(
  reply: FastifyReply,
  redirectUri: string,
  erreur: string,
  description: string,
  state?: string
): FastifyReply {
  const u = new URL(redirectUri);
  u.searchParams.set('error', erreur);
  u.searchParams.set('error_description', description);
  if (state) u.searchParams.set('state', state);
  return reply.redirect(u.toString(), 302);
}

export function enregistrerRoutesMcpOauth(app: FastifyInstance): void {
  /**
   * `/token` recoit du `application/x-www-form-urlencoded` (RFC 6749 §4.1.3), que
   * Fastify refuse par defaut en 415. Six lignes suffisent a le lire : ajouter
   * `@fastify/formbody` pour cela seul serait une dependance de plus a suivre.
   */
  app.addContentTypeParser<string>(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_requete, corps, fait) => {
      try {
        fait(null, Object.fromEntries(new URLSearchParams(corps)));
      } catch {
        fait(Object.assign(new Error('Corps de formulaire invalide.'), { statusCode: 400 }), undefined);
      }
    }
  );

  // ------------------------------------------- autorisations accordees (ecran)

  /**
   * Les autorisations OAuth en cours, pour l'ecran Parametres.
   *
   * Passe par une route d'API et non par PostgREST : les trois tables OAuth sont
   * volontairement HORS de portee du navigateur (voir le REVOKE de
   * schema/auth-interne.sql). Ce qui sort ici est donc choisi ligne par ligne —
   * aucun hache, aucun jeton, aucune URI de redirection compromettante.
   */
  app.get('/api/mcp/autorisations', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;

    const lignes = await requete<{
      client_id: string;
      client_name: string;
      created_at: string;
      last_used_at: string | null;
      jetons_actifs: string;
      dernier_appel: string | null;
    }>(
      `SELECT c.client_id, c.client_name, c.created_at, c.last_used_at,
              count(t.id) FILTER (
                WHERE t.revoque_le IS NULL AND t.acces_expire_le > now()
              )::text AS jetons_actifs,
              max(t.last_used_at) AS dernier_appel
         FROM mcp_oauth_clients c
         LEFT JOIN mcp_oauth_tokens t ON t.client_id = c.client_id
        WHERE c.is_active
        GROUP BY c.client_id, c.client_name, c.created_at, c.last_used_at
        ORDER BY c.created_at DESC`
    );

    return {
      autorisations: lignes.map((l) => ({
        clientId: l.client_id,
        nom: l.client_name,
        creeLe: l.created_at,
        dernierAcces: l.dernier_appel ?? l.last_used_at,
        jetonsActifs: Number(l.jetons_actifs),
      })),
    };
  });

  /**
   * Revoque une autorisation : le client ET tous ses jetons.
   *
   * Les deux, et pas seulement le client : desactiver l'enregistrement empeche
   * d'obtenir un NOUVEAU jeton, mais laisserait vivre ceux deja emis jusqu'a leur
   * expiration. Revoquer doit couper l'acces maintenant.
   */
  app.delete<{ Params: { clientId: string } }>(
    '/api/mcp/autorisations/:clientId',
    async (request, reply) => {
      const session = await exigerAdmin(request, reply);
      if (!session) return;

      const { clientId } = request.params;
      const maj = await requete(
        `UPDATE mcp_oauth_clients SET is_active = false, revoked_at = now()
          WHERE client_id = $1 AND is_active RETURNING client_id`,
        [clientId]
      );
      if (maj.length === 0) {
        return reply.code(404).send({ message: 'Autorisation inconnue ou deja revoquee.' });
      }

      const jetons = await requete(
        `UPDATE mcp_oauth_tokens SET revoque_le = now()
          WHERE client_id = $1 AND revoque_le IS NULL RETURNING id`,
        [clientId]
      );
      // Les codes non encore echanges aussi : un code en vol resterait valable
      // une minute, ce qui suffirait a obtenir un jeton apres la revocation.
      await requete(
        `UPDATE mcp_oauth_codes SET utilise_le = now()
          WHERE client_id = $1 AND utilise_le IS NULL`,
        [clientId]
      );

      request.log.info({ clientId, jetons: jetons.length }, '[oauth] autorisation revoquee');
      return { ok: true, jetonsRevoques: jetons.length };
    }
  );

  // ---------------------------------------------------------- decouverte

  /**
   * RFC 9728. C'est le document vers lequel pointe le `WWW-Authenticate` du 401
   * de `/mcp` : il dit au client quel serveur d'autorisation interroger.
   *
   * Les deux chemins repondent : la specification a change d'avis en cours de
   * route sur l'inclusion du chemin de la ressource, et les clients n'essaient
   * pas tous le meme.
   */
  const metadonneesRessource = async () => ({
    resource: `${base()}/mcp`,
    authorization_servers: [base()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
  });
  app.get('/.well-known/oauth-protected-resource', metadonneesRessource);
  app.get('/.well-known/oauth-protected-resource/mcp', metadonneesRessource);

  /** RFC 8414. `token_endpoint_auth_methods_supported: ['none']` : les clients
   *  sont publics, c'est PKCE qui tient lieu de preuve, pas un secret que
   *  claude.ai ne pourrait de toute facon pas garder. */
  app.get('/.well-known/oauth-authorization-server', async () => ({
    issuer: base(),
    authorization_endpoint: `${base()}/oauth/authorize`,
    token_endpoint: `${base()}/oauth/token`,
    registration_endpoint: `${base()}/oauth/register`,
    scopes_supported: [SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    service_documentation: `${base()}/settings`,
  }));

  // ------------------------------------------------ enregistrement dynamique

  app.post('/oauth/register', async (request, reply) => {
    if (!souscontrole(request, reply, 'oauth-register', BORNES_REGISTER)) return;

    const corps = (request.body ?? {}) as { client_name?: unknown; redirect_uris?: unknown };
    const uris = Array.isArray(corps.redirect_uris) ? corps.redirect_uris : [];

    if (uris.length === 0 || uris.length > 5 || !uris.every(uriRedirectionValide)) {
      return reply.code(400).send({
        error: 'invalid_redirect_uri',
        error_description:
          'redirect_uris est obligatoire : une a cinq URI absolues en https (http autorise sur localhost), sans fragment.',
      });
    }

    const { n } = (await requeteUne<{ n: string }>(
      'SELECT count(*)::text AS n FROM mcp_oauth_clients WHERE is_active'
    )) ?? { n: '0' };
    if (Number(n) >= MAX_CLIENTS) {
      return reply.code(400).send({
        error: 'invalid_client_metadata',
        error_description: `Trop de clients enregistres (${MAX_CLIENTS}). Revoquez-en un dans Parametres.`,
      });
    }

    const clientId = secretAleatoire('mcpo');
    const nom =
      typeof corps.client_name === 'string' && corps.client_name.trim()
        ? corps.client_name.trim().slice(0, 120)
        : 'Client MCP';

    await requete(
      `INSERT INTO mcp_oauth_clients (client_id, client_name, redirect_uris)
       VALUES ($1, $2, $3)`,
      [clientId, nom, uris]
    );

    acquitter(`oauth-register:${request.ip}`);

    return reply.code(201).send({
      client_id: clientId,
      client_name: nom,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_id_issued_at: Math.floor(Date.now() / 1000),
    });
  });

  // ----------------------------------------------------------- autorisation

  /**
   * Valide les parametres. Rend soit une page a afficher, soit de quoi rediriger
   * une erreur, soit le client et l'URI verifies.
   *
   * L'ORDRE EST LA SECURITE : tant que `client_id` et `redirect_uri` ne sont pas
   * verifies, aucune erreur ne part en redirection.
   */
  async function valider(p: ParamsAutorisation): Promise<Validation> {
    const client = await lireClient(p.client_id);
    if (!client) {
      return {
        type: 'page',
        page: page(
          'Client inconnu',
          `<h1>Client inconnu</h1><p>Ce client n'est pas enregistre sur cette instance, ou il a ete revoque.</p>
           <p>Relance la connexion depuis ton client MCP : il s'enregistrera a nouveau.</p>`,
          400
        ),
      };
    }

    const uri = p.redirect_uri ?? '';
    if (!redirectionAutorisee(uri, client.redirect_uris)) {
      return {
        type: 'page',
        page: page(
          'Adresse de retour refusee',
          `<h1>Adresse de retour refusee</h1>
           <p>L'adresse demandee ne figure pas parmi celles enregistrees par ce client.</p>
           <p>Aucune redirection n'a lieu : c'est precisement ce controle qui empeche
              qu'un code d'autorisation soit detourne ailleurs.</p>`,
          400
        ),
      };
    }

    // A partir d'ici l'URI est de confiance : les erreurs peuvent y retourner.
    const refus = (erreur: string, description: string): Validation => ({
      type: 'erreur',
      uri,
      erreur,
      description,
    });

    if (p.response_type !== 'code') {
      return refus('unsupported_response_type', 'Seul response_type=code est accepte.');
    }
    if (!p.code_challenge) {
      return refus('invalid_request', 'code_challenge est obligatoire (PKCE).');
    }
    if ((p.code_challenge_method ?? '') !== 'S256') {
      return refus('invalid_request', 'code_challenge_method doit valoir S256.');
    }
    if (p.scope && p.scope.split(/\s+/).some((s) => s && s !== SCOPE)) {
      return refus('invalid_scope', `Seul le scope ${SCOPE} existe.`);
    }

    return { type: 'ok', client, uri };
  }

  /** Le formulaire de consentement, et la reponse a « pas connecte ». */
  app.get<{ Querystring: ParamsAutorisation }>('/oauth/authorize', async (request, reply) => {
    const p = request.query;
    const v = await valider(p);
    if (v.type === 'page') return rendre(reply, v.page);
    if (v.type === 'erreur') return redirigerErreur(reply, v.uri, v.erreur, v.description, p.state);

    const session = lireSession(request);
    if (!session) {
      // Pas de 401 JSON : c'est un navigateur, avec un humain derriere. Et pas de
      // redirection automatique vers /login non plus — le front n'a pas de
      // parametre de retour, l'inventer ici donnerait un aller sans retour.
      return rendre(
        reply,
        page(
          'Connexion requise',
          `<h1>Connecte-toi d'abord</h1>
           <p>Cette instance ne te reconnait pas sur ce navigateur. Ouvre le CRM, connecte-toi
              avec ta passkey, puis relance la connexion depuis ton client MCP.</p>
           <div class="boutons"><a class="bouton oui" href="${echapperHtml(base())}/login">Ouvrir le CRM</a></div>`,
          401
        )
      );
    }
    if (session.roleApp !== 'admin') {
      return rendre(
        reply,
        page(
          'Reserve aux administrateurs',
          `<h1>Reserve aux administrateurs</h1>
           <p>Le connecteur MCP donne acces en lecture a l'ensemble du portefeuille du cabinet.
              Seul un administrateur peut l'autoriser, comme pour les cles.</p>`,
          403
        )
      );
    }

    const champs = [
      ['client_id', p.client_id],
      ['redirect_uri', p.redirect_uri],
      ['code_challenge', p.code_challenge],
      ['code_challenge_method', p.code_challenge_method],
      ['state', p.state],
      ['scope', p.scope],
      ['resource', p.resource],
      ['response_type', p.response_type],
    ]
      .filter(([, valeur]) => typeof valeur === 'string' && valeur !== '')
      .map(
        ([nom, valeur]) =>
          `<input type="hidden" name="${echapperHtml(String(nom))}" value="${echapperHtml(String(valeur))}" />`
      )
      .join('');

    return rendre(
      reply,
      page(
        'Autoriser le connecteur',
        `<h1>Autoriser ${echapperHtml(v.client.client_name)} ?</h1>
         <p><strong>${echapperHtml(v.client.client_name)}</strong> demande a lire les donnees de ton cabinet
            via le connecteur MCP.</p>
         <ul>
           <li>Lecture seule : ce connecteur n'ecrit rien, ne supprime rien.</li>
           <li>Portee : clients, dossiers, taches, echeances — tout ce que le connecteur expose.</li>
           <li>Revocable a tout moment dans <code>Parametres → Connecteur MCP</code>.</li>
         </ul>
         <p>Retour vers <code>${echapperHtml(v.uri)}</code></p>
         <form method="post" action="${echapperHtml(base())}/oauth/authorize">
           ${champs}
           <div class="boutons">
             <button class="oui" name="accord" value="oui" type="submit">Autoriser</button>
             <button class="non" name="accord" value="non" type="submit">Refuser</button>
           </div>
         </form>`
      )
    );
  });

  /** La decision. Tout est REVALIDE : les champs caches ne sont pas de confiance. */
  app.post<{ Body: ParamsAutorisation & { accord?: string } }>(
    '/oauth/authorize',
    async (request, reply) => {
      const p = (request.body ?? {}) as ParamsAutorisation & { accord?: string };
      const v = await valider(p);
      if (v.type === 'page') return rendre(reply, v.page);
      if (v.type === 'erreur') return redirigerErreur(reply, v.uri, v.erreur, v.description, p.state);

      const session = lireSession(request);
      if (!session || session.roleApp !== 'admin') {
        return redirigerErreur(reply, v.uri, 'access_denied', 'Session absente ou non administrateur.', p.state);
      }
      if (p.accord !== 'oui') {
        return redirigerErreur(reply, v.uri, 'access_denied', 'Autorisation refusee par l utilisateur.', p.state);
      }

      const code = secretAleatoire('mcpc');
      await requete(
        `INSERT INTO mcp_oauth_codes
           (code_hash, client_id, redirect_uri, code_challenge, code_challenge_method, scope, user_id, expire_le)
         VALUES ($1, $2, $3, $4, 'S256', $5, $6, now() + ($7 || ' milliseconds')::interval)`,
        [
          hacher(code),
          v.client.client_id,
          v.uri,
          p.code_challenge,
          SCOPE,
          session.sub,
          String(VIE_CODE_MS),
        ]
      );
      void requete('UPDATE mcp_oauth_clients SET last_used_at = now() WHERE client_id = $1', [
        v.client.client_id,
      ]).catch(() => undefined);

      const u = new URL(v.uri);
      u.searchParams.set('code', code);
      if (p.state) u.searchParams.set('state', p.state);
      return reply.redirect(u.toString(), 302);
    }
  );

  // ------------------------------------------------------------------ jetons

  function erreurToken(reply: FastifyReply, code: number, erreur: string, description: string) {
    return reply.code(code).header('Cache-Control', 'no-store').send({
      error: erreur,
      error_description: description,
    });
  }

  /** Emet un couple acces + rafraichissement dans une chaine donnee. */
  async function emettre(opts: {
    chaine: string;
    clientId: string;
    userId: string;
    resource: string;
  }) {
    const acces = secretAleatoire('mcpa');
    const rafraichir = secretAleatoire('mcpr');
    await requete(
      `INSERT INTO mcp_oauth_tokens
         (chaine, acces_hash, rafraichir_hash, client_id, user_id, scope, resource,
          acces_expire_le, rafraichir_expire_le)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               now() + ($8 || ' seconds')::interval,
               now() + ($9 || ' milliseconds')::interval)`,
      [
        opts.chaine,
        hacher(acces),
        hacher(rafraichir),
        opts.clientId,
        opts.userId,
        SCOPE,
        opts.resource,
        String(VIE_ACCES_S),
        String(VIE_RAFRAICHIR_MS),
      ]
    );
    return {
      access_token: acces,
      token_type: 'Bearer',
      expires_in: VIE_ACCES_S,
      refresh_token: rafraichir,
      scope: SCOPE,
    };
  }

  /** Revoque toute une chaine. Appelee sur reutilisation — donc sur suspicion. */
  async function revoquerChaine(chaine: string, raison: string, log: FastifyRequest['log']) {
    await requete(
      'UPDATE mcp_oauth_tokens SET revoque_le = now() WHERE chaine = $1 AND revoque_le IS NULL',
      [chaine]
    );
    log.warn({ chaine, raison }, '[oauth] chaine de jetons revoquee');
  }

  app.post<{
    Body: {
      grant_type?: string;
      code?: string;
      redirect_uri?: string;
      client_id?: string;
      code_verifier?: string;
      refresh_token?: string;
      resource?: string;
    };
  }>('/oauth/token', async (request, reply) => {
    if (!souscontrole(request, reply, 'oauth-token', BORNES_TOKEN)) return;
    const b = (request.body ?? {}) as Record<string, string | undefined>;

    // ---- code d'autorisation
    if (b.grant_type === 'authorization_code') {
      if (!b.code || !b.client_id || !b.redirect_uri || !b.code_verifier) {
        return erreurToken(reply, 400, 'invalid_request', 'code, client_id, redirect_uri et code_verifier sont obligatoires.');
      }

      const ligne = await requeteUne<{
        id: string;
        client_id: string;
        redirect_uri: string;
        code_challenge: string;
        code_challenge_method: string;
        user_id: string;
        expire_le: string;
        utilise_le: string | null;
      }>(
        `SELECT id, client_id, redirect_uri, code_challenge, code_challenge_method,
                user_id, expire_le, utilise_le
           FROM mcp_oauth_codes WHERE code_hash = $1`,
        [hacher(b.code)]
      );
      if (!ligne) return erreurToken(reply, 400, 'invalid_grant', 'Code inconnu.');

      // REJEU : le code a deja servi. Ce n'est pas une maladresse, c'est le
      // symptome d'une interception — on coupe tout ce qui en decoule.
      if (ligne.utilise_le) {
        const chaines = await requete<{ chaine: string }>(
          'SELECT DISTINCT chaine FROM mcp_oauth_tokens WHERE client_id = $1 AND user_id = $2',
          [ligne.client_id, ligne.user_id]
        );
        for (const c of chaines) await revoquerChaine(c.chaine, 'code rejoue', request.log);
        return erreurToken(reply, 400, 'invalid_grant', 'Code deja utilise.');
      }
      if (new Date(ligne.expire_le).getTime() <= Date.now()) {
        return erreurToken(reply, 400, 'invalid_grant', 'Code expire.');
      }
      if (ligne.client_id !== b.client_id || ligne.redirect_uri !== b.redirect_uri) {
        return erreurToken(reply, 400, 'invalid_grant', 'Code emis pour un autre client ou une autre adresse de retour.');
      }
      if (!verifierPkce(b.code_verifier, ligne.code_challenge, ligne.code_challenge_method)) {
        return erreurToken(reply, 400, 'invalid_grant', 'code_verifier ne correspond pas au defi.');
      }

      // Marque AVANT d'emettre, et de facon conditionnelle : deux echanges
      // simultanes du meme code ne doivent pas produire deux jetons. Celui qui
      // ne met a jour aucune ligne a perdu la course.
      const marque = await requete(
        'UPDATE mcp_oauth_codes SET utilise_le = now() WHERE id = $1 AND utilise_le IS NULL RETURNING id',
        [ligne.id]
      );
      if (marque.length === 0) {
        return erreurToken(reply, 400, 'invalid_grant', 'Code deja utilise.');
      }

      acquitter(`oauth-token:${request.ip}`);
      const jetons = await emettre({
        chaine: randomUUID(),
        clientId: ligne.client_id,
        userId: ligne.user_id,
        resource: b.resource ?? `${base()}/mcp`,
      });
      return reply.header('Cache-Control', 'no-store').send(jetons);
    }

    // ---- rafraichissement, a fenetre glissante
    if (b.grant_type === 'refresh_token') {
      if (!b.refresh_token) {
        return erreurToken(reply, 400, 'invalid_request', 'refresh_token est obligatoire.');
      }
      const ligne = await requeteUne<{
        id: string;
        chaine: string;
        client_id: string;
        user_id: string;
        resource: string;
        rafraichir_expire_le: string | null;
        remplace_le: string | null;
        revoque_le: string | null;
      }>(
        `SELECT id, chaine, client_id, user_id, resource,
                rafraichir_expire_le, remplace_le, revoque_le
           FROM mcp_oauth_tokens WHERE rafraichir_hash = $1`,
        [hacher(b.refresh_token)]
      );
      if (!ligne) return erreurToken(reply, 400, 'invalid_grant', 'Jeton de rafraichissement inconnu.');

      // REUTILISATION : ce jeton a deja ete echange. Deux parties ne peuvent pas
      // detenir le meme — l'une des deux ne devrait pas l'avoir.
      if (ligne.remplace_le) {
        await revoquerChaine(ligne.chaine, 'jeton de rafraichissement reutilise', request.log);
        return erreurToken(reply, 400, 'invalid_grant', 'Jeton de rafraichissement deja utilise.');
      }
      if (ligne.revoque_le) return erreurToken(reply, 400, 'invalid_grant', 'Autorisation revoquee.');
      if (ligne.rafraichir_expire_le && new Date(ligne.rafraichir_expire_le).getTime() <= Date.now()) {
        return erreurToken(reply, 400, 'invalid_grant', 'Jeton de rafraichissement expire.');
      }
      if (b.client_id && b.client_id !== ligne.client_id) {
        return erreurToken(reply, 400, 'invalid_grant', 'Jeton emis pour un autre client.');
      }

      const marque = await requete(
        'UPDATE mcp_oauth_tokens SET remplace_le = now() WHERE id = $1 AND remplace_le IS NULL RETURNING id',
        [ligne.id]
      );
      if (marque.length === 0) {
        await revoquerChaine(ligne.chaine, 'course sur le rafraichissement', request.log);
        return erreurToken(reply, 400, 'invalid_grant', 'Jeton de rafraichissement deja utilise.');
      }

      acquitter(`oauth-token:${request.ip}`);
      const jetons = await emettre({
        chaine: ligne.chaine,
        clientId: ligne.client_id,
        userId: ligne.user_id,
        resource: ligne.resource,
      });
      return reply.header('Cache-Control', 'no-store').send(jetons);
    }

    return erreurToken(
      reply,
      400,
      'unsupported_grant_type',
      'Seuls authorization_code et refresh_token sont acceptes.'
    );
  });
}
