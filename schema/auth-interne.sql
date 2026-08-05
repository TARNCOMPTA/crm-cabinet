-- Authentification interne : passkeys et codes d'enrôlement.
--
-- Ces deux tables remplacent le schéma `auth` de Supabase. Il n'y a plus de mot
-- de passe : `profiles` porte l'identité, `passkeys` les moyens de connexion.
--
-- À appliquer sur le schéma cible, après schema/cible.sql.

CREATE TABLE IF NOT EXISTS passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Identifiant de la clé, tel que le navigateur le renvoie (base64url).
  credential_id text NOT NULL,
  -- Clé publique de l'authentificateur, en base64url.
  public_key text NOT NULL,

  -- Compteur monotone de l'authentificateur. Il ne doit jamais reculer : une
  -- régression signale un clonage de la clé.
  compteur bigint NOT NULL DEFAULT 0,

  -- Transports annoncés par le navigateur (usb, nfc, internal…), en JSON.
  transports text,

  -- Libellé donné par l'utilisateur, pour reconnaître ses appareils.
  libelle text,

  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,

  CONSTRAINT passkeys_credential_id_key UNIQUE (credential_id)
);

CREATE INDEX IF NOT EXISTS passkeys_user_id_idx ON passkeys (user_id);

COMMENT ON TABLE passkeys IS
  'Moyens de connexion WebAuthn. Lies au domaine de l''instance : changer le '
  'domaine (RP ID) invalide toutes les passkeys enrolees.';


CREATE TABLE IF NOT EXISTS enrolment_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Le code est stocke HACHE (sha256) : un code vaut une identite, le lire en
  -- base ne doit pas suffire a prendre la main sur un compte.
  code_hash text NOT NULL,

  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enrolment_codes_code_hash_key UNIQUE (code_hash)
);

CREATE INDEX IF NOT EXISTS enrolment_codes_user_id_idx ON enrolment_codes (user_id);

COMMENT ON TABLE enrolment_codes IS
  'Codes a duree de vie courte permettant d''enroler une premiere passkey. '
  'Remplace le parcours mot de passe oublie, sans objet sans mot de passe.';


-- PostgREST a besoin d'un role pour les requetes du front. Le jeton de session
-- emis par le serveur porte role='authenticated' et est valide par PostgREST
-- avec le meme secret.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- Il n'y a plus de RLS : l'isolation entre cabinets n'a plus d'objet, une
-- instance ne contient qu'un cabinet. Les droits applicatifs (lecture ouverte
-- aux collaborateurs, ecriture des reglages reservee aux administrateurs) sont
-- portes par le proxy Node devant PostgREST.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Les tables d'authentification, elles, ne sont JAMAIS exposees par PostgREST :
-- seul le serveur Node y touche, avec son propre role.
REVOKE ALL ON passkeys, enrolment_codes FROM authenticated;
