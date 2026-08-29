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
 *
 * ---------------------------------------------------------------------------
 * CHACUN SA CLÉ, ET CHACUN NE VOIT QUE LES SIENNES
 *
 * Ces trois routes exigeaient un administrateur. Le connecteur MCP n'expose
 * pourtant que treize outils en LECTURE SEULE, sur des tables qu'un
 * collaborateur lit déjà dans l'application — clients, tâches, bilans,
 * opportunités, comptes rendus, dirigeants. Aucun outil ne touche les trois
 * tables d'identifiants fermées par `TABLES_LECTURE_ADMIN`
 * (`cabinet_smtp_config`, `mcp_api_keys`, `app_config`). Réserver le connecteur
 * aux administrateurs ne protégeait donc aucune donnée : cela privait
 * simplement le reste du cabinet d'un accès qu'il a déjà par l'écran.
 *
 * ⚠️ CE QUI RESTE FERMÉ, ET QUI COMPTE : UNE CLÉ EST UN IDENTIFIANT. Un
 * collaborateur ne voit et ne révoque QUE les siennes — `created_by` porte cette
 * appartenance. Ouvrir la liste à tous aurait transformé un écran de confort en
 * inventaire des accès du cabinet, et permis à quiconque de couper l'accès d'un
 * collègue.
 *
 * L'administrateur, lui, continue de tout voir et de tout révoquer : le jour où
 * un collaborateur s'en va, il faut pouvoir fermer sa clé sans son concours.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { requete, requeteUne } from '../db.js';
import { exigerSession } from '../gardes.js';

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
    const session = await exigerSession(request, reply);
    if (!session) return;

    // `$1 IS NULL` plutot que deux requetes : l'administrateur passe `null` et
    // le filtre s'efface, sans dupliquer le SELECT ni sa liste de colonnes.
    const keys = await requete(
      `SELECT id, name, client_id, is_active, last_used_at, created_at, revoked_at,
              peut_ecrire
         FROM mcp_api_keys
        WHERE $1::uuid IS NULL OR created_by = $1
        ORDER BY created_at DESC`,
      [session.roleApp === 'admin' ? null : session.sub]
    );
    return { keys };
  });

  app.post<{ Body: { name?: string } }>('/api/mcp-keys/generate', async (request, reply) => {
    const session = await exigerSession(request, reply);
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

  /**
   * Le droit d'ecriture d'une clé statique.
   *
   * ⚠️ CETTE ROUTE MANQUAIT, ET LA COLONNE ÉTAIT DONC MORTE. `peut_ecrire` est
   * arrivée avec `set_client_repartition`, à faux par défaut — pour qu'aucune
   * clé déjà émise ne gagne l'écriture le jour du déploiement. Mais rien n'a
   * jamais été écrit pour la passer à vrai : la création l'omet, aucun écran ne
   * l'affiche. Une clé Claude Code ou Cursor ne pouvait donc PAS obtenir
   * l'écriture, et le message d'erreur de l'outil affirmait pourtant que « le
   * droit se donne clé par clé sur la même page ». Il désignait un réglage
   * inexistant.
   *
   * Le droit se donne clé par clé, jamais globalement : une clé qui n'en a pas
   * besoin ne doit pas l'avoir parce qu'une autre l'a.
   */
  app.post<{ Body: { key_id?: string; peut_ecrire?: unknown } }>(
    '/api/mcp-keys/ecriture',
    async (request, reply) => {
      const session = await exigerSession(request, reply);
      if (!session) return;

      const id = request.body?.key_id;
      const voulu = request.body?.peut_ecrire;
      if (!id) return reply.code(400).send({ error: 'key_id requis.' });
      if (typeof voulu !== 'boolean') {
        return reply.code(400).send({ error: 'peut_ecrire (booleen) requis.' });
      }

      /**
       * ⚠️ ACCORDER RESTE AU PROPRIÉTAIRE DE LA CLÉ, MÊME POUR UN
       * ADMINISTRATEUR. Une clé est un identifiant : lui ajouter un droit à
       * l'insu de celui qui s'en sert reviendrait à agir en son nom. Le
       * RETRAIT, lui, est ouvert à l'administrateur — refermer une porte ne
       * demande l'accord de personne. Même raisonnement que pour les
       * autorisations OAuth, et même forme.
       */
      const cible = !voulu && session.roleApp === 'admin' ? null : session.sub;

      const r = await requeteUne<{ id: string; peut_ecrire: boolean }>(
        `UPDATE mcp_api_keys
            SET peut_ecrire = $3
          WHERE id = $1 AND is_active
            AND ($2::uuid IS NULL OR created_by = $2)
          RETURNING id, peut_ecrire`,
        [id, cible, voulu]
      );
      if (!r) return reply.code(404).send({ error: 'Cle introuvable ou revoquee.' });
      return { success: true, peut_ecrire: r.peut_ecrire };
    }
  );

  app.post<{ Body: { key_id?: string } }>('/api/mcp-keys/revoke', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const id = request.body?.key_id;
    if (!id) return reply.code(400).send({ error: 'key_id requis.' });

    // Révocation et non suppression : la ligne garde la trace de ce qui a existé
    // et de sa dernière utilisation, ce qui compte le jour où on se demande par
    // où une donnée est sortie.
    //
    // ⚠️ L'APPARTENANCE EST VERIFIEE DANS LE `WHERE`, pas avant. Un contrôle en
    // deux temps — lire la clé, comparer, écrire — laisserait la fenêtre entre
    // les deux, et surtout distinguerait « pas à vous » de « inexistante » par
    // le message : de quoi énumérer les clés des collègues. Ici les deux cas
    // rendent le même 404.
    const r = await requeteUne<{ id: string }>(
      `UPDATE mcp_api_keys
          SET is_active = false, revoked_at = now()
        WHERE id = $1 AND is_active
          AND ($2::uuid IS NULL OR created_by = $2)
        RETURNING id`,
      [id, session.roleApp === 'admin' ? null : session.sub]
    );
    if (!r) return reply.code(404).send({ error: 'Cle introuvable ou deja revoquee.' });
    return { success: true };
  });
}
