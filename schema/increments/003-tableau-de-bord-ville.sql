-- Le tableau de bord lit `clients.ville` au lieu de redecouper l'adresse.
-- ===========================================================================
--
-- `get_dashboard_stats` portait le CINQUIEME parseur d'adresse du depot, et le
-- seul en SQL : deux expressions regulieres, dupliquees entre le SELECT et le
-- HAVING, qui redecoupaient la chaine a chaque affichage du tableau de bord.
--
-- Les quatre autres — `src/lib/adresse.ts`, `contactsDirectoryService`,
-- `dashboardService`, `CompanyFormModal` — ont ete retires dans le meme
-- mouvement. La connaissance qu'ils portaient vit desormais dans
-- `src/lib/adresseHeritee.ts`, teste, et les composants sont en base.
--
-- Effet de bord souhaitable : le regroupement devient exact. « Villeneuve » et
-- « VILLENEUVE, France » ne comptaient pas ensemble, et une adresse sans code
-- postal ne comptait pas du tout.
--
-- Regle du dossier : aucun BEGIN/COMMIT, l'applicateur possede la transaction.
-- Idempotent par construction — CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
result jsonb;
v_status_counts jsonb;
v_tasks_en_cours bigint;
v_habilitations_actives bigint;
v_assemblees_planifiees bigint;
v_opportunites bigint;
v_overdue_tasks bigint;
v_no_siret bigint;
v_no_cloture bigint;
v_legal_recent bigint;
v_top_cities jsonb;
v_regime_counts jsonb;
v_forme_counts jsonb;
BEGIN
-- La garde « auth.uid() = p_user_id » a ete retiree : auth.uid() est une
-- fonction de Supabase, absente ici, et elle aurait fait echouer chaque appel
-- du tableau de bord a l'execution — la creation de la fonction, elle, passait
-- sans rien dire, un corps plpgsql n'etant pas resolu a la creation.
--
-- Rien n'est perdu cote securite : l'identite de l'appelant est etablie par le
-- proxy Node devant PostgREST, qui seul emet le jeton de session. La base ne
-- voit plus qu'un role « authenticated » et n'a aucun moyen — ni aucune raison
-- — de re-verifier ce que le proxy a deja verifie.
IF NOT EXISTS (
SELECT 1 FROM profiles WHERE id = p_user_id
) THEN
RETURN '{}'::jsonb;
END IF;

-- Client status counts
SELECT jsonb_build_object(
'actif', COALESCE(SUM(CASE WHEN statut = 'actif' THEN 1 ELSE 0 END), 0),
'inactif', COALESCE(SUM(CASE WHEN statut = 'inactif' THEN 1 ELSE 0 END), 0),
'prospect', COALESCE(SUM(CASE WHEN statut = 'prospect' THEN 1 ELSE 0 END), 0),
'archive', COALESCE(SUM(CASE WHEN statut = 'archive' THEN 1 ELSE 0 END), 0)
) INTO v_status_counts
FROM clients;

-- Tasks assigned to user (not done, not archived)
SELECT COUNT(*) INTO v_tasks_en_cours
FROM tasks
WHERE assignee_id = p_user_id
AND is_archived = false
AND statut != 'done';

-- Overdue tasks
SELECT COUNT(*) INTO v_overdue_tasks
FROM tasks
WHERE is_archived = false
AND statut != 'done'
AND date_echeance IS NOT NULL
AND date_echeance < CURRENT_DATE;

-- Habilitations actives
SELECT COUNT(*) INTO v_habilitations_actives
FROM habilitations
WHERE (etat = 'Actif' OR etat = 'actif');

-- Assemblees planifiees
SELECT COUNT(*) INTO v_assemblees_planifiees
FROM general_assemblies ga
JOIN clients c ON c.id = ga.client_id
WHERE ga.statut IN ('planifiee', 'en_cours');

-- Opportunites
SELECT COUNT(*) INTO v_opportunites
FROM opportunity_cards;

-- Clients without SIRET
SELECT COUNT(*) INTO v_no_siret
FROM clients
WHERE statut = 'actif'
AND (siret IS NULL OR siret = '')
AND (siren IS NULL OR siren = '');

-- Clients without cloture
SELECT COUNT(*) INTO v_no_cloture
FROM clients
WHERE statut = 'actif'
AND (date_cloture_exercice_social IS NULL OR date_cloture_exercice_social = '');

-- Legal acts in last 30 days
SELECT COUNT(*) INTO v_legal_recent
FROM legal_acts la
JOIN clients c ON c.id = la.client_id
WHERE la.created_at >= NOW() - INTERVAL '30 days';

-- Top 5 cities
--
-- `clients.ville` remplace le decoupage par expression reguliere qui vivait ici :
-- c'etait le CINQUIEME parseur d'adresse du depot, et le seul en SQL. Il
-- redecoupait la chaine a chaque appel du tableau de bord, avec les memes angles
-- morts que les quatre autres — une rue contenant une virgule, une adresse sans
-- code postal.
SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_top_cities
FROM (
SELECT UPPER(TRIM(ville)) AS city, COUNT(*) AS count
FROM clients
WHERE statut != 'archive'
AND NULLIF(TRIM(COALESCE(ville, '')), '') IS NOT NULL
GROUP BY 1
ORDER BY count DESC
LIMIT 5
) t;

-- Regime fiscal counts
SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_regime_counts
FROM (
SELECT regime_fiscal AS regime, COUNT(*) AS count
FROM clients
WHERE statut = 'actif' AND regime_fiscal IS NOT NULL AND regime_fiscal != ''
GROUP BY regime_fiscal
ORDER BY count DESC
) t;

-- Forme juridique counts
SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_forme_counts
FROM (
SELECT forme_juridique AS forme, COUNT(*) AS count
FROM clients
WHERE statut = 'actif' AND forme_juridique IS NOT NULL AND forme_juridique != ''
GROUP BY forme_juridique
ORDER BY count DESC
LIMIT 5
) t;

-- Assemble result
result := jsonb_build_object(
'client_status_counts', v_status_counts,
'tasks_en_cours', v_tasks_en_cours,
'overdue_tasks_count', v_overdue_tasks,
'habilitations_actives', v_habilitations_actives,
'assemblees_planifiees', v_assemblees_planifiees,
'opportunites_en_cours', v_opportunites,
'clients_without_siret', v_no_siret,
'clients_without_cloture', v_no_cloture,
'legal_acts_recent', v_legal_recent,
'top_cities', v_top_cities,
'regime_fiscal_counts', v_regime_counts,
'forme_juridique_counts', v_forme_counts
);

RETURN result;
END;
$function$
;
