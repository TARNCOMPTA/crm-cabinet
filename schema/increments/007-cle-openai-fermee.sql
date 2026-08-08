-- La cle OpenAI etait lisible par tout collaborateur connecte.
-- ===========================================================================
-- Trouve par audit le 2026-08-06. `cabinets.openai_api_key` contient une cle
-- vivante de 164 caracteres, prefixe `sk-proj-`. La table est lisible par
-- `authenticated` et ne figure pas dans `TABLES_LECTURE_ADMIN` : un
--
--     GET /rest/v1/cabinets?select=openai_api_key
--
-- avec n'importe quelle session la rendait en clair. Huit comptes actifs y
-- avaient acces.
--
-- Le CHANGELOG 2.0 et le commentaire de `TABLES_LECTURE_ADMIN` annoncaient tous
-- deux ce defaut comme « traite en retirant la colonne ». LA COLONNE N'AVAIT PAS
-- ETE RETIREE. Le commentaire a fait foi a la place de la verification.
--
-- ---------------------------------------------------------------------------
-- POURQUOI CE CORRECTIF EST UN INCREMENT, ET NON UNE LIGNE DANS auth-interne.sql
--
-- Premiere tentative : placer le bloc dans `auth-interne.sql`, en tenant pour
-- acquis que ce fichier est rejoue a chaque demarrage. IL NE L'EST PAS.
-- `docker/entree.sh` ne l'applique que sur une base neuve, ou sur une base ou la
-- table `passkeys` est absente — un garde-fou pour les restaurations anciennes.
-- Sur une instance en service, il ne repasse jamais.
--
-- Le correctif a donc ete deploye sans rien changer, et seule une verification
-- apres deploiement l'a montre : `has_column_privilege` repondait encore
-- « vrai ». Le bloc reste dans `auth-interne.sql` pour les installations neuves,
-- mais c'est CET increment qui ferme la porte sur les bases existantes.
--
-- ---------------------------------------------------------------------------
-- POURQUOI UN « REVOKE SELECT (colonne) » NE SUFFIT PAS
--
-- PostgreSQL accepte l'ordre sans broncher, et il reste sans effet : un GRANT au
-- niveau TABLE couvre toutes les colonnes, presentes et futures, et une
-- restriction de colonne ne peut pas le contredire. Verifie en transaction
-- annulee avant d'ecrire ceci.
--
-- Le seul chemin qui marche : retirer le droit de TABLE, puis le rendre colonne
-- par colonne en omettant celle qu'on ferme.
--
-- Fermer la table entiere n'etait pas une option : le front lit `nom`, `adresse`,
-- `siret` et `logo_url` sur `cabinets`, y compris pour un collaborateur —
-- l'en-tete de l'application et l'export PDF en dependent. Aucune requete ne
-- demande la cle, et aucune ne fait `select=*` : verifie.
--
-- ⚠️ CE REVOKE NE RATTRAPE PAS LE PASSE. La cle doit etre consideree comme
-- divulguee et renouvelee chez OpenAI.

DO $$
DECLARE colonnes text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cabinets'
       AND column_name = 'openai_api_key'
  ) THEN
    -- La liste est construite dynamiquement : une colonne ajoutee plus tard a
    -- `cabinets` reste lisible sans qu'on ait a penser a ce fichier. Le revers est
    -- assume — une future colonne secrete devra etre exclue explicitement.
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO colonnes
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cabinets'
       AND column_name <> 'openai_api_key';

    REVOKE SELECT, UPDATE ON cabinets FROM authenticated;
    EXECUTE format('GRANT SELECT (%s) ON cabinets TO authenticated', colonnes);
    EXECUTE format('GRANT UPDATE (%s) ON cabinets TO authenticated', colonnes);

    RAISE NOTICE 'cle OpenAI fermee a authenticated (% colonnes rouvertes)',
      array_length(string_to_array(colonnes, ', '), 1);
  END IF;
END $$;

-- Filet : si la cle reste lisible, l'increment doit echouer bruyamment plutot
-- que de passer pour applique. C'est ce controle qui a rattrape la premiere
-- version de ce correctif.
--
-- ⚠️ IL EST GARDE PAR LA MEME CONDITION QUE LE BLOC CI-DESSUS, et il ne l'etait
-- pas. `has_column_privilege` LEVE quand la colonne n'existe pas — elle ne
-- repond pas « faux ». Or `cible.sql` ne cree plus `cabinets.openai_api_key` :
-- sur une base neuve, ce filet echouait donc avec
--
--     column "openai_api_key" of relation "cabinets" does not exist
--
-- c'est-a-dire exactement dans le cas ou il n'y a plus rien a proteger. La
-- colonne absente est le resultat recherche, pas un echec. L'increment devenait
-- non rejouable, et le job `schema` de la CI rouge en permanence — sur `main`
-- depuis le 2026-08-07.
--
-- On ne verifie donc le privilege que lorsqu'il existe une colonne pour le
-- porter. Sur une instance en service, ou la colonne est encore la, le filet
-- garde exactement la meme force.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'cabinets'
       AND column_name = 'openai_api_key'
  ) AND has_column_privilege('authenticated', 'cabinets', 'openai_api_key', 'SELECT') THEN
    RAISE EXCEPTION 'La cle OpenAI est ENCORE lisible par authenticated : increment inefficace.';
  END IF;
END $$;
