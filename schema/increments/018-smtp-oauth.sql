-- ============================================================================
-- L'authentification moderne pour l'envoi de courrier.
-- ============================================================================
--
-- POURQUOI CE CHANTIER EXISTE. Le 2026-09-08, un cabinet decouvre que plus
-- aucun courriel ne part depuis vingt-quatre jours. La cause :
--
--     535 5.7.139 Authentication unsuccessful, the user credentials were incorrect
--
-- Microsoft 365 refuse desormais l'authentification par mot de passe sur SMTP
-- (« authentification de base ») : elle est coupee par defaut depuis 2023, elle
-- s'active boite par boite, et Microsoft la retire progressivement. Les mots de
-- passe d'application, la parade habituelle, suivent le meme chemin.
--
-- La voie qui reste ouverte est OAuth 2.0. Ces quatre colonnes la portent.
--
-- ⚠️ `auth_mode` VAUT « motdepasse » PAR DEFAUT, ET C'EST LA SEULE VALEUR
-- ACCEPTABLE ICI. Une instance qui applique cet increment ne doit RIEN changer
-- a son comportement : celles qui envoient par mot de passe — la majorite, chez
-- les hebergeurs qui l'acceptent encore — continuent exactement comme avant. Le
-- passage a OAuth est une decision d'administrateur, prise dans l'ecran des
-- reglages, jamais un effet de bord de mise a jour.
--
-- ⚠️ LE FLUX RETENU EST « CLIENT CREDENTIALS », c'est-a-dire une application
-- Azure qui s'authentifie seule, sans utilisateur derriere. C'est le seul qui
-- convienne a un serveur : le flux delegue exige qu'une personne ouvre un
-- navigateur et consente, puis produit un jeton de rafraichissement qui expire
-- et qu'il faut renouveler — donc une panne differee, un dimanche, sans
-- personne pour la voir. Exactement la famille de defaut que ce depot passe son
-- temps a corriger.
--
-- Ce que cela demande du cote Microsoft, et qui n'est PAS du ressort du code :
--   1. une application enregistree dans Azure (identifiants de locataire, de
--      client, et un secret) ;
--   2. la permission d'application `SMTP.SendAsApp` sur Office 365 Exchange
--      Online, avec consentement administrateur ;
--   3. le principal de service enregistre dans Exchange, et le droit d'envoi
--      accorde sur LA boite concernee — sans quoi l'application pourrait
--      ecrire au nom de n'importe quelle boite du locataire.
--
-- LE SECRET EST STOCKE EN CLAIR, comme `smtp_password` a cote. Ce n'est pas un
-- oubli : la table entiere est fermee aux non-administrateurs par
-- `TABLES_LECTURE_ADMIN` (`server/src/rest-droits.ts`), et le serveur doit
-- pouvoir le relire pour demander un jeton. Le chiffrer avec une clef posee sur
-- la meme machine ne protegerait de rien — il faut une sauvegarde chiffree et
-- un disque chiffre, ce qui est du ressort de l'hebergement.
-- ============================================================================

ALTER TABLE "cabinet_smtp_config"
  ADD COLUMN IF NOT EXISTS "auth_mode"           text DEFAULT 'motdepasse'::text NOT NULL,
  ADD COLUMN IF NOT EXISTS "oauth_tenant_id"     text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS "oauth_client_id"     text DEFAULT ''::text NOT NULL,
  ADD COLUMN IF NOT EXISTS "oauth_client_secret" text DEFAULT ''::text NOT NULL;

-- La contrainte se pose a part et sans `IF NOT EXISTS` (qui n'existe pas pour
-- ADD CONSTRAINT) : on la retire d'abord, pour que l'increment reste rejouable.
ALTER TABLE "cabinet_smtp_config" DROP CONSTRAINT IF EXISTS "cabinet_smtp_config_auth_mode_check";
ALTER TABLE "cabinet_smtp_config"
  ADD CONSTRAINT "cabinet_smtp_config_auth_mode_check"
  CHECK (auth_mode = ANY (ARRAY['motdepasse'::text, 'oauth2'::text]));

COMMENT ON COLUMN "cabinet_smtp_config"."auth_mode" IS
  'motdepasse (defaut, inchange pour les instances existantes) ou oauth2 '
  '(flux client_credentials Microsoft). Voir schema/increments/018-smtp-oauth.sql.';
