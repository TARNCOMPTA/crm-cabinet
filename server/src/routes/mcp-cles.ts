/**
 * Clés d'accès du connecteur MCP.
 * ---------------------------------------------------------------------------
 * Remplace l'Edge Function `mcp-keys`. Mêmes chemins, mêmes formes de réponse
 * que celles attendues par l'écran de paramètres.
 *
 * Une correction de fond : l'original tirait le secret avec `Math.random()`.
 * Ce générateur est prévisible — connaître quelques valeurs suffit à retrouver
 * son état interne — et il s'agit ici d'un secret qui ouvre l'accès en lecture à
 * toute la base du cabinet. `randomBytes` est le générateur du système.
 *
 * Le secret n'est stocké que haché : le montrer une fois à la création, puis ne
 * plus jamais pouvoir le relire, est le comportement attendu d'une clé d'API.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { requete, requeteUne } from '../db.js';
import { exigerAdmin } from '../gardes.js';

/** Le préfixe `mcp_` rend la clé reconnaissable dans un fichier de config. */
function genererClientId(): string {
  return `mcp_${randomBytes(12).toString('hex')}`;
}

function genererSecret(): string {
  // base64url : 48 octets bruts, sans caractère à échapper dans une en-tête HTTP.
  return randomBytes(36).toString('base64url');
}

export function hacherSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function enregistrerRoutesMcpCles(app: FastifyInstance): void {
  app.get('/api/mcp-keys/list', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;

    const keys = await requete(
      `SELECT id, name, client_id, is_active, last_used_at, created_at, revoked_at
         FROM mcp_api_keys
        ORDER BY created_at DESC`
    );
    return { keys };
  });

  app.post<{ Body: { name?: string } }>('/api/mcp-keys/generate', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;

    const nom = request.body?.name?.trim() || 'Cle MCP';
    const clientId = genererClientId();
    const secret = genererSecret();

    const key = await requeteUne(
      `INSERT INTO mcp_api_keys (name, client_id, client_secret_hash, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, client_id, created_at`,
      [nom, clientId, hacherSecret(secret), session.sub]
    );

    // Seule occasion de voir le secret en clair. L'interface prévient l'utilisateur.
    return reply.code(201).send({ key: { ...key, client_secret: secret } });
  });

  app.post<{ Body: { key_id?: string } }>('/api/mcp-keys/revoke', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;

    const id = request.body?.key_id;
    if (!id) return reply.code(400).send({ error: 'key_id requis.' });

    // Révocation et non suppression : la ligne garde la trace de ce qui a existé
    // et de sa dernière utilisation, ce qui compte le jour où on se demande par
    // où une donnée est sortie.
    const r = await requeteUne<{ id: string }>(
      `UPDATE mcp_api_keys
          SET is_active = false, revoked_at = now()
        WHERE id = $1 AND is_active
        RETURNING id`,
      [id]
    );
    if (!r) return reply.code(404).send({ error: 'Cle introuvable ou deja revoquee.' });
    return { success: true };
  });
}
