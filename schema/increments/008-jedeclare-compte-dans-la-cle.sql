-- Le compte de flux entre dans l'identite d'un accuse.
-- ===========================================================================
-- `jedeclare_teletransmissions` identifiait une piece par (numero, type_piece,
-- ligne). Cette cle suppose que les numeros d'accuse sont uniques a l'echelle du
-- cabinet. ILS NE LE SONT PAS : chaque compte de flux numerote les siens de son
-- cote, et rien chez jedeclare ne garantit qu'un numero du second compte ne
-- coincide pas avec un numero du premier.
--
-- Consequence : la piece du second compte etait vue comme « deja analysee » des
-- qu'un numero se telescopait, et n'etait jamais lue. Silencieusement — le
-- compteur « deja en cache » l'absorbait sans rien dire.
--
-- Le defaut est reste sans effet visible tant que le mode prudent ecartait de
-- toute facon 100 % des pieces du second compte (mesure du 2026-08-09 : 204
-- ecartees sur 204). Il se serait reveille le jour meme ou l'on ouvre la
-- prudence sur ce compte, en donnant l'impression que l'ouverture n'a servi a
-- rien. D'ou l'ordre : LA COLONNE D'ABORD, la levee de prudence ensuite.
--
-- ---------------------------------------------------------------------------
-- CE QUE VAUT LE `DEFAULT 0` SUR LES LIGNES DEJA EN BASE
--
-- Les lignes ecrites avant cet increment n'ont pas garde le compte qui les a
-- fournies : l'information n'existe plus. Elles sont donc attribuees au premier
-- compte declare (rang 0), ce qui est exact dans le cas courant — sous mode
-- prudent, seul un compte effectivement releve par un logiciel de production
-- alimente le cache.
--
-- Une ligne mal attribuee ne corrompt rien : au pire sa piece est relue une fois
-- sur le compte auquel elle appartient vraiment. Et cette relecture ne marque
-- rien de neuf, puisque le mode prudent n'ouvre que des accuses DEJA marques
-- recuperes.

ALTER TABLE jedeclare_teletransmissions
  ADD COLUMN IF NOT EXISTS "compte" integer DEFAULT 0 NOT NULL;

-- L'index unique porte la cle : c'est lui que vise le `ON CONFLICT` de
-- `server/src/jedeclare/suivi.ts`, et PostgreSQL exige qu'un index couvre
-- exactement les colonnes nommees. Tant qu'il n'est pas remplace, l'insertion
-- echoue en « no unique or exclusion constraint matching the ON CONFLICT
-- specification » — le serveur ne peut donc pas ecrire avec l'ancien index en
-- place, ce qui rend l'ordre des deux ordres ci-dessous non negociable.
--
-- L'ajout d'une colonne a un index unique ne peut pas echouer sur des doublons :
-- il elargit la contrainte, il ne la resserre pas.
DROP INDEX IF EXISTS jedeclare_teletransmissions_piece_key;
CREATE UNIQUE INDEX IF NOT EXISTS jedeclare_teletransmissions_piece_key
  ON public.jedeclare_teletransmissions USING btree (compte, numero, type_piece, ligne);

-- Filet : sans index conforme, l'application ecrirait dans le vide a chaque
-- analyse — et une analyse coute des accuses. Mieux vaut refuser de demarrer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'jedeclare_teletransmissions_piece_key'
       AND i.indisunique
       AND (SELECT count(*) FROM unnest(i.indkey)) = 4
  ) THEN
    RAISE EXCEPTION 'jedeclare_teletransmissions_piece_key ne couvre pas le compte : le ON CONFLICT echouerait.';
  END IF;
END $$;
