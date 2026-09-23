-- ============================================================================
-- 023 — Les modifications de fiche faites depuis l'écran sont journalisées.
-- ============================================================================
--
-- ⚠️ DEUX RÉGIMES POUR LA MÊME DONNÉE. Une fiche modifiée par le connecteur MCP
-- laisse dans `audit_logs` l'avant et l'après de chaque champ, imputés à la
-- personne qui a créé l'accès (`set_client_fiche`). La MÊME fiche modifiée à
-- l'écran ne laissait rien. Le jour où l'on se demande qui a changé le SIRET, le
-- régime ou l'adresse de facturation d'un client, la réponse dépendait donc du
-- chemin emprunté — et le chemin le plus fréquent n'en donnait aucune. Relevé à
-- l'audit du 2026-09-11, fermé ici.
--
-- ⚠️ UN DÉCLENCHEUR, ET NON UN AJOUT DANS CHAQUE ÉCRAN. La fiche s'écrit depuis
-- la fiche elle-même, la liste des clients (saisie en ligne), la barre d'actions
-- groupées, l'import… Une trace posée écran par écran manquerait au premier
-- écran oublié. Posée sur la table, elle ne peut pas être oubliée.
--
-- ⚠️ QUI ? PostgREST pose les revendications du jeton de session dans
-- `request.jwt.claims` pour chaque requête. C'est ce qui impute la trace à la
-- personne connectée — sans rien demander au navigateur, qui pourrait mentir.
--
-- ⚠️ SANS REVENDICATIONS, RIEN — ET C'EST VOULU. Les écritures du serveur (le
-- connecteur MCP, les synchronisations INPI et BODACC, la désinscription d'une
-- campagne) passent par une connexion directe, sans jeton. Le connecteur trace
-- déjà lui-même, avec l'accès utilisé ; le journaliser ici aussi ferait deux
-- lignes pour un geste, dont une sans auteur. Les synchronisations, elles, ne
-- sont le geste de personne.
--
-- ⚠️ LES COLONNES RECOMPOSÉES PAR LA BASE APPARAISSENT, ET C'EST EXACT. Le
-- déclencheur est `AFTER` : il voit la ligne après `clients_adresse_trigger` et
-- les autres. Changer la ville change aussi `adresse` ; les deux figurent dans
-- la trace, parce que les deux ont changé. Seul `updated_at` est écarté — il
-- change à chaque écriture et ne dit rien.
--
-- LA FORME DES DÉTAILS EST CELLE DU CONNECTEUR : `{ champs: [{ champ, ancienne,
-- nouvelle }] }`, plus `via`. Un lecteur du journal lit les deux sans les
-- distinguer.
-- ============================================================================

CREATE OR REPLACE FUNCTION journaliser_fiche_client() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  revendications jsonb;
  auteur uuid;
  avant jsonb := to_jsonb(OLD);
  apres jsonb := to_jsonb(NEW);
  champs jsonb := '[]'::jsonb;
  cle text;
BEGIN
  -- Un GUC absent, vide ou mal formé ne doit jamais faire échouer l'écriture
  -- de la fiche : la trace est un témoin, pas une condition.
  BEGIN
    revendications := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    auteur := nullif(revendications ->> 'sub', '')::uuid;
  EXCEPTION WHEN others THEN
    auteur := NULL;
  END;
  IF auteur IS NULL THEN
    RETURN NEW;
  END IF;

  FOR cle IN SELECT jsonb_object_keys(apres) LOOP
    CONTINUE WHEN cle = 'updated_at';
    IF (avant -> cle) IS DISTINCT FROM (apres -> cle) THEN
      champs := champs || jsonb_build_array(jsonb_build_object(
        'champ', cle, 'ancienne', avant -> cle, 'nouvelle', apres -> cle));
    END IF;
  END LOOP;

  -- Un enregistrement qui ne change rien — l'écran renvoie souvent la fiche
  -- entière — ne laisse rien : le journal dit ce qui a bougé, pas ce qui a été
  -- cliqué.
  IF jsonb_array_length(champs) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auteur, 'modification_fiche', 'client', NEW.id,
          jsonb_build_object('via', 'ecran', 'champs', champs));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION journaliser_fiche_client() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_journal_fiche_client ON clients;
CREATE TRIGGER trg_journal_fiche_client
  AFTER UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION journaliser_fiche_client();

-- ============================================================================
-- ⚠️ SUPPRIMER UN PROFIL EFFAÇAIT SON JOURNAL. `audit_logs.user_id` référençait
-- `profiles` en `ON DELETE CASCADE` : un `DELETE` sur un profil — possible pour
-- un administrateur, par le proxy — emportait en silence toutes les traces de
-- ce collaborateur. C'est l'effacement que `TABLES_JOURNAL` (rest-droits.ts)
-- refuse depuis le 2026-09-22 aux administrateurs AUSSI, rouvert par une autre
-- porte : on ne touchait pas au journal, on supprimait la personne.
--
-- `RESTRICT` : un profil qui a laissé des traces ne se supprime plus, il se
-- DÉSACTIVE — ce que l'écran des utilisateurs fait déjà ; le produit ne
-- supprime jamais un profil. Un profil sans aucune trace reste supprimable.
-- ============================================================================
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
