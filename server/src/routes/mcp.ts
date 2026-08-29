/**
 * Connecteur MCP.
 * ---------------------------------------------------------------------------
 * Remplace l'Edge Function `mcp-connector`, en enlevant tout l'appareillage
 * OAuth : enregistrement dynamique de client, écran d'autorisation, PKCE,
 * échange de jeton, points `.well-known`. Environ 400 lignes disparaissent.
 *
 * Pourquoi : OAuth sert à ce qu'un utilisateur délègue à une application tierce
 * l'accès à ses données chez un fournisseur. Ici l'administrateur du cabinet
 * branche lui-même son propre client sur sa propre instance. Il n'y a personne à
 * qui demander son consentement, et le parcours à trois acteurs n'ajoute qu'un
 * enrôlement à faire et une surface à défendre.
 *
 * À la place : `Authorization: Bearer <client_id>:<client_secret>`, forme que
 * l'Edge Function acceptait déjà en second recours. Les clés se créent dans
 * Paramètres → Connecteur MCP.
 *
 * CONSÉQUENCE À CONNAÎTRE : un client MCP configuré en OAuth sur l'ancienne
 * installation ne se connectera plus. Il faut le reconfigurer avec une clé.
 *
 * Le protocole est servi à la main plutôt qu'avec le SDK officiel : trois
 * méthodes JSON-RPC — `initialize`, `tools/list`, `tools/call` — suffisent à un
 * serveur en lecture seule, et cela évite d'embarquer le SDK et sa dépendance à
 * zod dans l'image.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { requete, requeteUne } from '../db.js';
import { OUTILS, OUTILS_PAR_NOM } from '../mcp/outils.js';
import { acquitter, souscontrole } from '../limiteur.js';
import { validerJetonAcces } from './mcp-oauth.js';

/** Version du protocole annoncée. Celle que les clients actuels demandent. */
const VERSION_PROTOCOLE = '2024-11-05';

/**
 * Vingt cles refusees par quart d'heure et par adresse.
 *
 * Un client MCP legitime presente une cle valide, qui remet le compteur a zero :
 * il ne rencontre jamais cette limite, quel que soit son debit d'appels. Seules
 * les tentatives INFRUCTUEUSES sont comptees, ce qui est exactement la chose a
 * ralentir.
 */
const BORNES_CLE_MCP = { max: 20, fenetreMs: 15 * 60_000 };

/**
 * Le défi renvoyé avec chaque 401.
 *
 * Le pointeur `resource_metadata` est ce qui permet à un client MCP de DÉCOUVRIR
 * OAuth (RFC 9728) : il y lit quel serveur d'autorisation interroger. Sans lui,
 * un client qui exige OAuth — le connecteur de claude.ai, par exemple — ne sait
 * pas où chercher. Il devine, échoue, et l'utilisateur n'a qu'« erreur » pour
 * seule explication.
 */
const DEFI_AUTH =
  `Bearer realm="CRM Cabinet", ` +
  `resource_metadata="${config.publicUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource"`;

interface RequeteRpc {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function erreurRpc(id: RequeteRpc['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function resultatRpc(id: RequeteRpc['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

/**
 * Comparaison de hachés à temps constant.
 *
 * Une comparaison `===` sur des chaînes s'arrête au premier octet différent ; le
 * temps de réponse renseigne alors sur le nombre d'octets corrects. Sur un
 * secret devinable octet par octet, cela change tout.
 */
function memeHache(a: string, b: string): boolean {
  const ta = Buffer.from(a, 'hex');
  const tb = Buffer.from(b, 'hex');
  return ta.length === tb.length && timingSafeEqual(ta, tb);
}

interface CleValide {
  id: string;
  nom: string;
  /**
   * Le droit d'ecrire, et il ne se deduit de rien d'autre : la case cochee au
   * consentement pour un jeton OAuth, la colonne `peut_ecrire` pour une cle
   * statique. Faux par defaut dans les deux cas.
   */
  peutEcrire: boolean;
  /**
   * A qui attribuer une ecriture. L'utilisateur du jeton OAuth, ou le createur
   * de la cle statique. `null` quand la cle n'a pas de createur connu — une
   * ecriture non attribuable est alors refusee plutot que journalisee a vide.
   */
  userId: string | null;
}

/**
 * Valide l'en-tête d'autorisation et rend la clé correspondante.
 *
 * Aucun message ne distingue « client_id inconnu » de « secret faux » : cela
 * n'aide que celui qui essaie des identifiants.
 */
async function validerCle(request: FastifyRequest): Promise<CleValide | null> {
  const entete = request.headers.authorization;
  if (!entete?.startsWith('Bearer ')) return null;

  const valeur = entete.slice('Bearer '.length).trim();

  /**
   * DEUX FORMES, ET LE SEPARATEUR LES DISTINGUE.
   *
   * `client_id:client_secret` est la cle du cabinet, creee dans les Parametres :
   * c'est la voie des clients qui acceptent un en-tete fixe (Claude Code, Cursor).
   * Un jeton OAuth opaque, lui, ne contient pas de deux-points — il est en
   * base64url. L'absence de separateur suffit donc a router, sans champ
   * supplementaire ni ambiguite : aucune des deux formes ne peut se faire passer
   * pour l'autre.
   */
  const separateur = valeur.indexOf(':');
  if (separateur < 0) {
    const jeton = await validerJetonAcces(valeur);
    return jeton
      ? {
          id: jeton.tokenId,
          nom: `OAuth ${jeton.clientId}`,
          peutEcrire: jeton.peutEcrire,
          userId: jeton.userId,
        }
      : null;
  }
  if (separateur === 0) return null;

  const clientId = valeur.slice(0, separateur);
  const secret = valeur.slice(separateur + 1);
  if (!secret) return null;

  const ligne = await requeteUne<{
    id: string;
    name: string;
    client_secret_hash: string;
    peut_ecrire: boolean;
    created_by: string | null;
  }>(
    `SELECT id, name, client_secret_hash, peut_ecrire, created_by
       FROM mcp_api_keys
      WHERE client_id = $1 AND is_active`,
    [clientId]
  );
  if (!ligne) return null;

  const hache = createHash('sha256').update(secret).digest('hex');
  if (!memeHache(hache, ligne.client_secret_hash)) return null;

  // Trace de dernière utilisation, sans attendre : elle sert au diagnostic, pas
  // à la réponse, et une écriture ne doit pas ralentir chaque appel.
  void requete('UPDATE mcp_api_keys SET last_used_at = now() WHERE id = $1', [ligne.id]).catch(
    () => undefined
  );

  /**
   * ⚠️ UNE CLE STATIQUE N'ECRIT QUE SI ON LE LUI A ACCORDE, cle par cle. La
   * colonne vaut `false` par defaut (increment 014) : le deploiement de cette
   * version n'a donc donne l'ecriture a aucune cle deja emise.
   *
   * `created_by` sert a attribuer l'ecriture dans `audit_logs` : une cle est un
   * porteur, mais quelqu'un l'a creee, et c'est la seule personne qu'on puisse
   * honnetement designer.
   */
  return {
    id: ligne.id,
    nom: ligne.name,
    peutEcrire: ligne.peut_ecrire,
    userId: ligne.created_by,
  };
}

/**
 * Ce qu'un outil rend, mis dans l'enveloppe du protocole.
 *
 * ⚠️ UN OUTIL PEUT RENDRE AUTRE CHOSE QUE DU TEXTE, et un seul s'en sert :
 * `get_client_statuts` sur un document SCANNE. Sa page n'a pas de couche texte
 * — c'est une image — et le seul moyen pour un modele de la lire est de la
 * VOIR.
 *
 * La convention est etroite EXPRES. Un outil qui rend un objet muni de
 * `blocsMcp` en prend la responsabilite entiere ; tout le reste continue d'etre
 * serialise en un unique bloc de texte, comme depuis l'origine. Laisser chaque
 * outil composer son enveloppe aurait ete le meilleur moyen d'en voir un rendre
 * au client un contenu que le protocole refuse.
 *
 * Extraite et exportee pour etre testee seule : c'est une decision, et une
 * decision qu'aucun test ne peut atteindre est une decision que personne ne
 * verifie.
 */
export function enveloppeMcp(donnees: unknown): Record<string, unknown>[] {
  if (
    donnees !== null &&
    typeof donnees === 'object' &&
    Array.isArray((donnees as { blocsMcp?: unknown }).blocsMcp)
  ) {
    const blocs = (donnees as { blocsMcp: unknown[] }).blocsMcp;
    // Un tableau vide rendrait une reponse sans contenu, que le client affiche
    // comme un silence. Mieux vaut retomber sur le texte.
    if (blocs.length > 0) return blocs as Record<string, unknown>[];
  }
  return [{ type: 'text', text: JSON.stringify(donnees, null, 2) }];
}

export function enregistrerRoutesMcp(app: FastifyInstance): void {
  /**
   * Point d'entrée du protocole.
   *
   * `/mcp` et `/api/mcp` répondent tous les deux : le premier est l'adresse
   * publique donnée aux clients, le second suit la convention des autres routes.
   */
  const traiter = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!souscontrole(request, reply, 'mcp', BORNES_CLE_MCP)) return;

    const cle = await validerCle(request);
    if (!cle) {
      return reply
        .code(401)
        .header('WWW-Authenticate', DEFI_AUTH)
        .send(erreurRpc(null, -32000, 'Cle MCP absente ou invalide.'));
    }

    acquitter(`mcp:${request.ip}`);

    const corps = (request.body ?? {}) as RequeteRpc;
    const { id, method, params } = corps;

    switch (method) {
      case 'initialize':
        return resultatRpc(id, {
          protocolVersion: VERSION_PROTOCOLE,
          capabilities: { tools: {} },
          serverInfo: { name: 'crm-cabinet', version: process.env.APP_VERSION ?? 'dev' },
        });

      // Notification d'initialisation terminée : le protocole n'attend pas de
      // réponse, mais un corps vide vaut mieux qu'une erreur « méthode inconnue ».
      case 'notifications/initialized':
        return reply.code(204).send();

      case 'ping':
        return resultatRpc(id, {});

      case 'tools/list':
        return resultatRpc(id, {
          tools: OUTILS.map((o) => ({
            name: o.nom,
            title: o.titre,
            description: o.description,
            inputSchema: o.parametres,
          })),
        });

      case 'tools/call': {
        const nom = typeof params?.name === 'string' ? params.name : '';
        const outil = OUTILS_PAR_NOM.get(nom);
        if (!outil) {
          return erreurRpc(id, -32602, `Outil inconnu : ${nom}.`);
        }

        const args = (params?.arguments ?? {}) as Record<string, unknown>;
        for (const requis of outil.parametres.required ?? []) {
          if (args[requis] === undefined || args[requis] === null) {
            return erreurRpc(id, -32602, `Parametre requis manquant : ${requis}.`);
          }
        }

        try {
          // Le contexte de l'appelant descend jusqu'a l'outil : c'est la seule
          // facon qu'un outil d'ecriture a de savoir s'il a le droit d'ecrire,
          // et a qui attribuer ce qu'il ecrit.
          const donnees = await outil.executer(args, {
            peutEcrire: cle.peutEcrire,
            userId: cle.userId,
            cle: cle.nom,
          });
          /**
           * ⚠️ UN OUTIL PEUT DÉSORMAIS RENDRE AUTRE CHOSE QUE DU TEXTE, et un
           * seul s'en sert : `get_client_statuts` sur un document SCANNÉ. Sa
           * page n'a pas de couche texte — c'est une image — et le seul moyen
           * pour un modèle de la lire est de la VOIR.
           *
           * La convention est étroite exprès : un outil qui rend un objet muni
           * de `blocsMcp` en prend la responsabilité entière, tout le reste
           * continue d'être sérialisé en un unique bloc de texte. Laisser
           * chaque outil composer son enveloppe aurait été le meilleur moyen
           * d'en voir un rendre du JSON mal formé au client.
           */
          return resultatRpc(id, { content: enveloppeMcp(donnees) });
        } catch (e) {
          // L'erreur est rendue dans le contenu et non en erreur JSON-RPC : le
          // client peut alors l'afficher à l'utilisateur au lieu d'interrompre
          // la conversation. C'est ce que faisait l'original.
          request.log.error(`[mcp] ${nom} : ${e instanceof Error ? e.message : String(e)}`);
          return resultatRpc(id, {
            content: [
              {
                type: 'text',
                text: `Erreur lors de l'execution de ${nom} : ${
                  e instanceof Error ? e.message : 'erreur interne'
                }`,
              },
            ],
            isError: true,
          });
        }
      }

      default:
        return erreurRpc(id, -32601, `Methode non prise en charge : ${method ?? '(vide)'}.`);
    }
  };

  app.post('/mcp', traiter);
  app.post('/api/mcp', traiter);

  /** Fiche de présentation, utile pour vérifier qu'une clé fonctionne. */
  app.get('/mcp', async (request, reply) => {
    if (!souscontrole(request, reply, 'mcp', BORNES_CLE_MCP)) return;

    const cle = await validerCle(request);
    if (!cle) {
      return reply
        .code(401)
        .header('WWW-Authenticate', DEFI_AUTH)
        .send({ error: 'Cle MCP absente ou invalide.' });
    }
    acquitter(`mcp:${request.ip}`);
    return {
      name: 'crm-cabinet',
      version: process.env.APP_VERSION ?? 'dev',
      protocolVersion: VERSION_PROTOCOLE,
      authentification: 'Bearer <client_id>:<client_secret>',
      cle: cle.nom,
      outils: OUTILS.map((o) => o.nom),
    };
  });
}
