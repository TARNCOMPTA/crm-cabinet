-- ============================================================================
-- 022 — Les clés MCP statiques expirent.
-- ============================================================================
--
-- ⚠️ UNE CLÉ STATIQUE N'EXPIRAIT JAMAIS. C'est un porteur : qui la détient lit
-- le portefeuille du cabinet — et l'écrit, si l'écriture lui a été accordée
-- (incrément 014). Une clé collée un jour dans la configuration d'un poste,
-- d'un outil ou d'un fichier restait valable indéfiniment, bien après qu'on ait
-- oublié où elle se trouvait. Les jetons OAuth, eux, expirent déjà
-- (`mcp_oauth_tokens.acces_expire_le`) : les deux portes n'obéissaient pas à la
-- même règle. Relevé à l'audit du 2026-09-11, fermé ici.
--
-- ⚠️ `NOT NULL`, ET C'EST TOUT LE SUJET. Une colonne nullable où NULL voudrait
-- dire « jamais » reproduirait le défaut à l'identique, pour toute clé créée par
-- un chemin qui oublierait de la renseigner. Toute clé a une échéance.
--
-- ⚠️ LES CLÉS DÉJÀ ÉMISES REÇOIVENT DOUZE MOIS, PAS UNE EXPIRATION IMMÉDIATE. Le
-- défaut est évalué ligne par ligne au moment de l'`ALTER` : chaque clé
-- existante vaut donc jusqu'à un an après ce déploiement. Aucun connecteur en
-- service ne tombe aujourd'hui, et l'échéance s'affiche à l'écran dès maintenant
-- — de quoi la voir venir. La prolonger est un geste, depuis le même écran.
--
-- Idempotent : `ADD COLUMN IF NOT EXISTS` ne réévalue pas le défaut au second
-- passage, donc une clé déjà dotée d'une échéance la garde.
-- ============================================================================

ALTER TABLE mcp_api_keys
  ADD COLUMN IF NOT EXISTS expires_at timestamptz
  DEFAULT (now() + interval '12 months') NOT NULL;

-- La vérification de chaque appel lit `client_id` puis l'échéance : l'index
-- unique sur `client_id` suffit, rien à ajouter.
