-- OAuth pour le connecteur MCP.
-- ===========================================================================
-- POURQUOI CELA REVIENT, APRES AVOIR ETE RETIRE.
--
-- La refonte avait supprime tout l'appareillage OAuth du connecteur MCP, avec
-- un raisonnement juste : OAuth sert a ce qu'un utilisateur delegue l'acces a
-- une application tierce, alors qu'ici l'administrateur branche son propre
-- client sur sa propre instance. Une cle suffisait, et suffit toujours pour
-- Claude Code ou Cursor, qui acceptent un en-tete `Authorization` fixe.
--
-- Mais le connecteur de claude.ai n'offre aucun champ pour un en-tete : il fait
-- OAuth ou rien. Constate le 2026-08-06 — il lit notre 401 sur `/mcp`, lance la
-- decouverte, et echoue. Ces tables sont le prix d'entree de ce client-la.
--
-- `mcp_api_keys` reste en place et inchangee. Les deux voies coexistent : la
-- cle pour ce qui accepte un en-tete, OAuth pour ce qui l'exige.
--
-- CE QUI N'EST JAMAIS STOCKE EN CLAIR : ni les secrets de client, ni les
-- jetons, ni les codes. Seuls leurs haches SHA-256, comme pour `mcp_api_keys`.
-- Une lecture de la base ne donne donc aucun acces.

-- ---------------------------------------------------------------------------
-- Les clients enregistres dynamiquement (RFC 7591).
--
-- `/register` est public par specification : c'est la seule porte non
-- authentifiee de l'ensemble. Elle est donc bornee en debit cote serveur, et
-- chaque ligne reste revocable depuis les Parametres.
--
-- `redirect_uris` est un TABLEAU et la comparaison sera EXACTE. Une correspondance
-- par prefixe ou par jokers est le defaut classique de ces implementations : elle
-- transforme le point d'autorisation en redirection ouverte, donc en vol de code.
CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
  "id"                  uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id"           text NOT NULL,
  -- Nul pour un client public (PKCE seul), ce qu'est claude.ai.
  "client_secret_hash"  text,
  "client_name"         text DEFAULT ''::text NOT NULL,
  "redirect_uris"       text[] DEFAULT '{}'::text[] NOT NULL,
  "is_active"           boolean DEFAULT true NOT NULL,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at"        timestamp with time zone,
  "revoked_at"          timestamp with time zone,
  CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_clients_client_id_key" UNIQUE (client_id)
);

-- ---------------------------------------------------------------------------
-- Les codes d'autorisation : une minute de vie, un seul usage.
--
-- Le code est lie au client, a l'URI de redirection ET au defi PKCE. Les trois
-- sont re-verifies a l'echange : un code intercepte ne sert a rien sans le
-- verifieur, qui n'a jamais transite.
--
-- `utilise_le` plutot qu'un DELETE : rejouer un code doit etre DETECTABLE, pas
-- seulement impossible. Un code presente deux fois est le signe d'une
-- interception, et le serveur revoque alors ce qui en decoule.
CREATE TABLE IF NOT EXISTS "mcp_oauth_codes" (
  "id"                    uuid DEFAULT gen_random_uuid() NOT NULL,
  "code_hash"             text NOT NULL,
  "client_id"             text NOT NULL,
  "redirect_uri"          text NOT NULL,
  "code_challenge"        text NOT NULL,
  "code_challenge_method" text DEFAULT 'S256'::text NOT NULL,
  "scope"                 text DEFAULT 'mcp:read'::text NOT NULL,
  -- L'administrateur qui a consenti. Le jeton emis agira en son nom.
  "user_id"               uuid NOT NULL,
  "expire_le"             timestamp with time zone NOT NULL,
  "utilise_le"            timestamp with time zone,
  "created_at"            timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_oauth_codes_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_codes_code_hash_key" UNIQUE (code_hash),
  CONSTRAINT "mcp_oauth_codes_user_id_fkey"
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Les jetons : acces d'une heure, rafraichissement a fenetre glissante.
--
-- LE RAFRAICHISSEMENT TOURNE. Chaque usage emet un jeton neuf et invalide
-- l'ancien, avec trente jours devant lui. Tant que le connecteur sert, la
-- connexion ne s'interrompt jamais et l'utilisateur n'a rien a faire ; un acces
-- oublie pendant trente jours se referme de lui-meme.
--
-- La rotation n'est pas qu'un confort : elle rend une fuite DETECTABLE. Deux
-- parties ne peuvent pas se servir du meme jeton, la seconde echoue — et cet
-- echec-la est un signal, sur lequel on revoque toute la chaine.
--
-- `chaine` porte cette chaine : tous les jetons issus d'un meme consentement la
-- partagent, ce qui permet de les revoquer d'un coup.
CREATE TABLE IF NOT EXISTS "mcp_oauth_tokens" (
  "id"                 uuid DEFAULT gen_random_uuid() NOT NULL,
  "chaine"             uuid NOT NULL,
  "acces_hash"         text NOT NULL,
  "rafraichir_hash"    text,
  "client_id"          text NOT NULL,
  "user_id"            uuid NOT NULL,
  "scope"              text DEFAULT 'mcp:read'::text NOT NULL,
  -- L'audience : le jeton ne vaut que pour CETTE ressource (RFC 8707).
  "resource"           text DEFAULT ''::text NOT NULL,
  "acces_expire_le"    timestamp with time zone NOT NULL,
  "rafraichir_expire_le" timestamp with time zone,
  -- Pose des que le jeton de rafraichissement est echange : il ne resservira pas.
  "remplace_le"        timestamp with time zone,
  "revoque_le"         timestamp with time zone,
  "created_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at"       timestamp with time zone,
  CONSTRAINT "mcp_oauth_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_tokens_acces_hash_key" UNIQUE (acces_hash),
  CONSTRAINT "mcp_oauth_tokens_rafraichir_hash_key" UNIQUE (rafraichir_hash),
  CONSTRAINT "mcp_oauth_tokens_user_id_fkey"
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Les deux lectures du chemin chaud : valider un jeton d'acces a chaque appel
-- MCP, et retrouver une chaine pour la revoquer.
CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_tokens_acces" ON "mcp_oauth_tokens" (acces_hash);
CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_tokens_chaine" ON "mcp_oauth_tokens" (chaine);
CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_codes_expire" ON "mcp_oauth_codes" (expire_le);

-- ---------------------------------------------------------------------------
-- Ces tables ne sont JAMAIS lues par le navigateur.
--
-- Le proxy PostgREST n'expose que ce que le front demande, et rien ici ne doit
-- l'etre : un jeton, meme hache, n'a pas a sortir. Aucun GRANT a
-- `authenticated` — seul le role serveur y accede, par le pool Node.
REVOKE ALL ON "mcp_oauth_clients" FROM authenticated;
REVOKE ALL ON "mcp_oauth_codes" FROM authenticated;
REVOKE ALL ON "mcp_oauth_tokens" FROM authenticated;
