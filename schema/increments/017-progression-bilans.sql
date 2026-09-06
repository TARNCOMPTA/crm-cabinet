-- ============================================================================
-- Le tableau de bord comptait des cartes en les téléchargeant toutes.
-- ============================================================================
--
-- `dashboardService.ts` lisait `bilan_cards` EN ENTIER — sans filtre d'année,
-- sans filtre de régime — pour n'en faire qu'un comptage par colonne :
--
--     cardsForRegime.filter(c => c.column_id === col.id).length
--
-- Mesuré le 2026-09-05 sur un portefeuille de 940 fiches : 537 cartes, 93 Ko
-- transférés, 39 ms. Ce n'est pas un problème aujourd'hui. Ce qui en fait un,
-- c'est que RIEN NE BORNE CETTE LECTURE : une carte naît par client et par
-- exercice, et aucune ne disparaît. À cinq ans, ce sont 4 400 lignes ; à dix,
-- 8 800. La charge grandit toute seule, chaque année, pour produire les mêmes
-- vingt nombres.
--
-- Cette fonction rend exactement ces vingt nombres. Son résultat est BORNÉ par
-- le nombre de colonnes de bilan (une poignée par régime), pas par le nombre de
-- cartes : il ne grandira jamais.
--
-- ⚠️ LA SÉMANTIQUE NE CHANGE PAS, ET C'EST DÉLIBÉRÉ. Elle agrège TOUTES les
-- années, comme le faisait le code qu'elle remplace. Le tableau de bord empile
-- donc les bilans 2025 terminés avec les 2026 en cours — ce qui se discute,
-- mais se discute AILLEURS : un audit de performance qui change en passant les
-- chiffres affichés n'est plus un audit, c'est une modification déguisée. Si
-- l'on veut un jour restreindre à l'exercice courant, la colonne `year` est là
-- pour ça, et ce sera une décision prise pour elle-même.
--
-- AUCUN GRANT ICI : une fonction est exécutable par PUBLIC par défaut, et
-- celle-ci ne rend rien de plus que ce que `bilan_cards` rendait déjà — en
-- moins. Elle reste donc ouverte à tout collaborateur, comme la table.
-- ============================================================================

-- ⚠️ UNE FONCTION, ET NON UNE VUE. La vue serait plus naturelle à lire ; elle
-- est inutilisable ici. `scripts/generer-types.mjs` lit la base réelle et
-- n'engendre des types que pour les TABLES et les FONCTIONS — une vue ne serait
-- typée nulle part, et `supabase.from('...')` sur elle ne compilerait pas. Le
-- tableau de bord appelle déjà `get_dashboard_stats` : c'est le motif du
-- dossier, on le suit.

CREATE OR REPLACE FUNCTION public.get_bilan_progression()
 RETURNS TABLE (regime_fiscal text, column_id uuid, cartes integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT bc.regime_fiscal, bc.column_id, count(*)::int
    FROM bilan_cards bc
   GROUP BY bc.regime_fiscal, bc.column_id;
$function$;

COMMENT ON FUNCTION public.get_bilan_progression() IS
  'Comptage des cartes de bilan par regime et par colonne, pour le tableau de '
  'bord. Remplace une lecture integrale de bilan_cards qui grossissait d''un '
  'exercice par an. Voir schema/increments/017-progression-bilans.sql.';
