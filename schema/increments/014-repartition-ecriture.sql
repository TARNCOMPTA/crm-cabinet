-- Répartition des parts : d'où vient une ligne, et qui a le droit d'en poser.
-- ===========================================================================
--
-- Deux colonnes, pour une même bascule : le connecteur MCP peut désormais
-- ÉCRIRE la répartition des parts. C'était jusqu'ici impossible par
-- construction, et le fichier des outils le disait — « si une écriture devient
-- nécessaire un jour, ce sera une décision à prendre explicitement, pas un
-- effet de bord ». La décision est prise ; ces colonnes sont ce qui l'encadre.
--
-- ---------------------------------------------------------------------------
-- `client_associes.source` : CE QUE VAUT LE CHIFFRE
--
-- Une ligne peut désormais arriver de deux façons, et elles n'ont PAS la même
-- autorité :
--
--   manual   quelqu'un du cabinet l'a saisie ou relue. Elle engage.
--   statuts  elle a été déduite du document déposé au greffe, sans relecture.
--            Elle date du dépôt et reste à confirmer.
--
-- ⚠️ SANS CETTE COLONNE, LES DEUX SERAIENT INDISCERNABLES, et c'est le défaut
-- que toute cette table existe pour empêcher. Les statuts donnent la
-- répartition À LA CONSTITUTION ; les cessions se font par acte notarié séparé
-- et n'y figurent pas. Un chiffre de 2004 rangé à côté d'un chiffre vérifié
-- hier, sans rien pour les distinguer, finirait dans une attestation signée.
--
-- `acte_source` ne suffit pas : c'est un champ libre, où l'on écrit ce qu'on
-- veut. La provenance doit être une valeur contrainte, pas une phrase.
--
-- DÉFAUT `manual`, et c'est le bon sens de marche : les lignes déjà en base ont
-- toutes été saisies à la main dans la fiche. Les déclarer `statuts` par défaut
-- déprécierait à tort du travail humain.
--
-- ---------------------------------------------------------------------------
-- `mcp_api_keys.peut_ecrire` : QUI A LE DROIT
--
-- Une clé MCP statique (Claude Code, Cursor) est un porteur : qui la détient
-- fait ce qu'elle permet. Jusqu'ici elle ne permettait que lire, donc la
-- question ne se posait pas.
--
-- ⚠️ `DEFAULT false` EST LE POINT ENTIER DE LA COLONNE. Toutes les clés déjà
-- émises restent en lecture seule, sans exception et sans intervention. Une clé
-- qui gagnerait l'écriture parce qu'on a déployé une version est exactement
-- l'effet de bord contre lequel le connecteur se prémunit. Accorder l'écriture
-- devient un geste explicite, clé par clé.
--
-- Les jetons OAuth ne sont pas concernés ici : ils portent déjà un `scope`, et
-- c'est lui qui décide — voir `server/src/routes/mcp-oauth.ts`. Les jetons émis
-- jusqu'à présent portent `mcp:read` seul et restent donc en lecture, par le
-- même sens de marche.
--
-- ---------------------------------------------------------------------------
-- LES RÈGLES DU DOSSIER
--
--   1. Aucun BEGIN/COMMIT : docker/entree.sh possède la transaction ;
--   2. aucun ordre non transactionnel ;
--   3. idempotence dans le fichier, en ceinture du registre.
--
-- `ALTER TABLE ... ADD CONSTRAINT` n'accepte pas `IF NOT EXISTS` : la contrainte
-- passe par un bloc qui avale `duplicate_object`, comme dans l'incrément 001.
-- Aucun GRANT : `ALTER DEFAULT PRIVILEGES` (auth-interne.sql) couvre les tables
-- futures, et une colonne hérite des droits de sa table.

ALTER TABLE client_associes
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'::text NOT NULL;

DO $$
BEGIN
  ALTER TABLE client_associes ADD CONSTRAINT client_associes_source_check
    CHECK ((source = ANY (ARRAY['manual'::text, 'statuts'::text])));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE mcp_api_keys
  ADD COLUMN IF NOT EXISTS peut_ecrire boolean DEFAULT false NOT NULL;

-- ---------------------------------------------------------------------------
-- Remplacer une répartition d'un seul coup, depuis le navigateur.
--
-- ⚠️ POURQUOI UNE FONCTION, ET NON DEUX APPELS POSTGREST. L'import de fichier
-- doit effacer la répartition en place puis poser la nouvelle. Par PostgREST
-- cela fait DEUX requêtes, donc DEUX transactions : si la seconde échoue — une
-- coupure réseau, un refus de contrainte sur la troisième ligne — le client se
-- retrouve avec AUCUN associé. Une répartition à moitié remplacée est pire que
-- pas de répartition du tout : elle a l'air d'en être une, et la somme des
-- parts semblera simplement incomplète.
--
-- La fonction fait les deux dans la même transaction. C'est exactement ce que
-- `replace_client_collaborators` fait pour les collaborateurs, et pour la même
-- raison.
--
-- ⚠️ ELLE N'EST PAS `SECURITY DEFINER`. Elle s'exécute donc avec les droits de
-- l'appelant — `authenticated` — qui a déjà ces droits sur la table. Lui donner
-- ceux du propriétaire n'apporterait rien et ouvrirait un chemin privilégié là
-- où il n'en faut pas. Elle doit par ailleurs être inscrite dans `RPC_OUVERTES`
-- (`server/src/rest-droits.ts`) pour être appelable : le proxy refuse par
-- défaut toute fonction qu'on n'y a pas mise.
--
-- `source` est passé par l'appelant plutôt que figé à 'manual' : un fichier
-- produit à partir des statuts doit pouvoir se déclarer comme tel.
CREATE OR REPLACE FUNCTION public.replace_client_associes(
  p_client_id uuid,
  p_lignes jsonb,
  p_source text DEFAULT 'manual'
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'p_client_id is required';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual', 'statuts') THEN
    RAISE EXCEPTION 'p_source doit valoir manual ou statuts';
  END IF;

  DELETE FROM client_associes WHERE client_id = p_client_id;

  IF p_lignes IS NOT NULL AND jsonb_array_length(p_lignes) > 0 THEN
    INSERT INTO client_associes
      (client_id, officer_id, nb_parts, demembrement, date_effet, acte_source, notes, source)
    SELECT
      p_client_id,
      (item->>'officer_id')::uuid,
      (item->>'nb_parts')::numeric,
      COALESCE(item->>'demembrement', 'pleine-propriete'),
      NULLIF(item->>'date_effet', '')::date,
      NULLIF(item->>'acte_source', ''),
      NULLIF(item->>'notes', ''),
      p_source
    FROM jsonb_array_elements(p_lignes) AS item;
  END IF;
END;
$function$
;
