-- Un index sur chaque clé étrangère qui n'en avait pas.
-- ===========================================================================
--
-- PostgreSQL indexe la colonne CIBLE d'une clé étrangère (c'est la clé
-- primaire de l'autre table) mais JAMAIS la colonne SOURCE. Or c'est la source
-- qui travaille : à chaque jointure, et surtout à chaque suppression ou mise à
-- jour de la ligne référencée, la base doit vérifier qu'aucune ligne ne pointe
-- encore vers elle — et sans index, cette vérification parcourt la table
-- entière.
--
-- Treize colonnes étaient dans ce cas, et toutes désignent `profiles` sauf une :
-- `uploaded_by`, `created_by`, `archived_by`, `effectuee_par`, `cree_par`… les
-- colonnes qui disent QUI a fait quelque chose. Le jour où l'on désactive ou
-- supprime un compte, ce sont ces treize tables que PostgreSQL relit en entier,
-- une par une. Sur un cabinet de dix personnes cela ne se voit pas ; sur un
-- historique de quelques années de pièces jointes et de relances, cela se
-- voit au moment où l'on s'y attend le moins.
--
-- Relevé le 2026-09-03 par la requête ci-dessous, reprise en garde permanente
-- dans `tests/schema.test.ts` : toute clé étrangère future sans index fera
-- échouer la CI.
--
--   SELECT c.conrelid::regclass, a.attname
--     FROM pg_constraint c
--     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
--    WHERE c.contype = 'f'
--      AND NOT EXISTS (SELECT 1 FROM pg_index i
--                       WHERE i.indrelid = c.conrelid AND i.indkey[0] = a.attnum);
--
-- Les trois règles du dossier : pas de BEGIN/COMMIT (l'appelant ouvre la
-- transaction), rien de non transactionnel, idempotence par IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS "idx_bilan_checklist_attachments_uploaded_by"
  ON "bilan_checklist_attachments" (uploaded_by);
CREATE INDEX IF NOT EXISTS "idx_checklist_item_attachments_uploaded_by"
  ON "checklist_item_attachments" (uploaded_by);
CREATE INDEX IF NOT EXISTS "idx_client_ago_avancements_status"
  ON "client_ago_avancements" (status_id);
CREATE INDEX IF NOT EXISTS "idx_jedeclare_suivi_interne_assignee"
  ON "jedeclare_suivi_interne" (assignee_id);
CREATE INDEX IF NOT EXISTS "idx_jedeclare_suivi_interne_updated_by"
  ON "jedeclare_suivi_interne" (updated_by);
CREATE INDEX IF NOT EXISTS "idx_mailing_campagnes_cree_par"
  ON "mailing_campagnes" (cree_par);
CREATE INDEX IF NOT EXISTS "idx_mcp_api_keys_created_by"
  ON "mcp_api_keys" (created_by);
CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_codes_user"
  ON "mcp_oauth_codes" (user_id);
CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_tokens_user"
  ON "mcp_oauth_tokens" (user_id);
CREATE INDEX IF NOT EXISTS "idx_opportunity_attachments_uploaded_by"
  ON "opportunity_attachments" (uploaded_by);
CREATE INDEX IF NOT EXISTS "idx_relance_history_effectuee_par"
  ON "relance_history" (effectuee_par);
CREATE INDEX IF NOT EXISTS "idx_task_attachments_uploaded_by"
  ON "task_attachments" (uploaded_by);
CREATE INDEX IF NOT EXISTS "idx_tasks_archived_by"
  ON "tasks" (archived_by);
