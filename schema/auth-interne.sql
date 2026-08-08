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

-- ---------------------------------------------------------------------------
-- ⚠️ LA CLE OPENAI ETAIT LISIBLE PAR TOUT COLLABORATEUR CONNECTE.
--
-- Trouve le 2026-08-06 par audit. `cabinets.openai_api_key` contenait une cle
-- vivante de 164 caracteres, `sk-proj-…`, et il suffisait d'un
-- `GET /rest/v1/cabinets?select=openai_api_key` avec n'importe quelle session
-- pour la lire. Huit comptes actifs y avaient acces.
--
-- Le CHANGELOG 2.0 et le commentaire de `TABLES_LECTURE_ADMIN` annoncaient tous
-- deux ce defaut comme « traite en retirant la colonne ». LA COLONNE N'A PAS ETE
-- RETIREE. C'est le piege des corrections annoncees : le commentaire a fait
-- foi pendant des semaines a la place de la verification.
--
-- Pourquoi un REVOKE de COLONNE et non l'ajout de `cabinets` a
-- `TABLES_LECTURE_ADMIN` : le front lit legitimement `nom`, `adresse`, `siret`,
-- `logo_url` sur cette table, y compris pour un collaborateur — fermer la table
-- entiere casserait l'en-tete de l'application et l'export PDF. Aucune requete
-- ne demande `openai_api_key`, et aucune ne fait `select=*` : verifie.
--
-- ⚠️ CE BLOC NE SUFFIT PAS SUR UNE BASE EXISTANTE, et j'ai d'abord cru le
-- contraire. `docker/entree.sh` n'applique CE FICHIER que sur une base neuve, ou
-- sur une base ou `passkeys` est absente. Sur une instance en service il ne
-- repasse jamais — le correctif ecrit ici seul a donc ete deploye sans rien
-- changer, et c'est la verification d'apres deploiement qui l'a montre.
--
-- Ce bloc couvre les installations NEUVES. Les bases existantes sont traitees par
-- schema/increments/007-cle-openai-fermee.sql, qui porte le meme code et un
-- controle final qui echoue bruyamment si la cle reste lisible.
--
-- LA CLE DOIT ETRE CONSIDEREE COMME DIVULGUEE et renouvelee chez OpenAI. Ce
-- REVOKE ferme la porte, il ne rattrape pas ce qui a pu passer.
-- ⚠️ UN « REVOKE SELECT (colonne) » NE SUFFIT PAS, ET NE PREVIENT PAS.
--
-- PostgreSQL accepte l'ordre sans broncher, et il reste sans effet : un GRANT au
-- niveau TABLE couvre toutes les colonnes, presentes et futures, et une
-- restriction de colonne ne peut pas le contredire. Premiere tentative faite
-- ainsi, verifiee en transaction annulee : `has_column_privilege` repondait
-- encore « vrai » apres le revoke. Sans cette verification, le correctif aurait
-- ete deploye et documente comme fait.
--
-- Le seul chemin qui marche : retirer le droit de TABLE, puis le rendre colonne
-- par colonne, en omettant celle qu'on ferme.
--
-- La liste est construite dynamiquement plutot qu'ecrite en dur : une colonne
-- ajoutee plus tard a `cabinets` reste ainsi lisible sans qu'on ait a penser a ce
-- fichier. Le revers est assume — une future colonne secrete devrait etre ajoutee
-- ici explicitement, comme celle-ci l'a ete.
DO $$
DECLARE colonnes text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cabinets'
       AND column_name = 'openai_api_key'
  ) THEN
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO colonnes
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cabinets'
       AND column_name <> 'openai_api_key';

    REVOKE SELECT, UPDATE ON cabinets FROM authenticated;
    EXECUTE format('GRANT SELECT (%s) ON cabinets TO authenticated', colonnes);
    EXECUTE format('GRANT UPDATE (%s) ON cabinets TO authenticated', colonnes);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ⚠️ LE REVOKE OAUTH DOIT VIVRE ICI, ET NULLE PART AILLEURS.
--
-- Les trois tables OAuth du connecteur MCP portent des haches de jetons, des
-- codes d'autorisation et des URI de redirection enregistrees. Aucune n'a a etre
-- lue par le navigateur — et surtout aucune n'a a etre ECRITE par lui.
--
-- Le danger n'est pas theorique. Le `GRANT` de la ligne 78 et l'`ALTER DEFAULT
-- PRIVILEGES` de la ligne 80 donnent SELECT, INSERT, UPDATE et DELETE a
-- `authenticated` sur toute table de `public`, presente ou future. Un
-- collaborateur connecte pourrait donc, par le proxy PostgREST, INSERER dans
-- `mcp_oauth_tokens` une ligne dont il choisit le hache — c'est-a-dire se
-- fabriquer un jeton d'acces valide. Ou reculer une expiration. Ou enregistrer
-- un client avec sa propre URI de redirection.
--
-- ⚠️ CORRECTION D'UN RAISONNEMENT FAUX QUE J'AI ECRIT ICI. J'avais affirme que
-- l'increment 005 ne suffisait pas, ce fichier etant « rejoue a chaque
-- demarrage » et refaisant le `GRANT ON ALL TABLES`. C'EST INEXACT :
-- `docker/entree.sh` ne l'applique que sur une base neuve, ou sans `passkeys`.
--
-- La consequence est heureuse mais fortuite : ce sont bien les REVOKE de
-- l'increment 005 qui protegent ces tables en production — verifie, elles
-- n'accordent aucun droit a `authenticated`. Le bloc ci-dessous ne sert donc
-- qu'aux installations neuves, ou il reste necessaire puisque le GRANT global le
-- precede dans ce meme fichier.
--
-- `IF EXISTS` implicite impossible sur REVOKE : on passe par un bloc, pour que
-- ce fichier reste applicable sur une base qui n'a pas encore recu l'increment.
DO $$
BEGIN
  IF to_regclass('public.mcp_oauth_clients') IS NOT NULL THEN
    REVOKE ALL ON mcp_oauth_clients FROM authenticated;
  END IF;
  IF to_regclass('public.mcp_oauth_codes') IS NOT NULL THEN
    REVOKE ALL ON mcp_oauth_codes FROM authenticated;
  END IF;
  IF to_regclass('public.mcp_oauth_tokens') IS NOT NULL THEN
    REVOKE ALL ON mcp_oauth_tokens FROM authenticated;
  END IF;
END $$;
