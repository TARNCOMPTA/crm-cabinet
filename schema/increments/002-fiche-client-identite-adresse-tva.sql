-- Fiche client : identité éclatée, adresse en composants, TVA intracommunautaire.
-- ===========================================================================
--
-- Ce que cet incrément corrige. La fiche client écrasait trois informations
-- dans deux colonnes de texte :
--
--   · `nom_entreprise` portait tout, y compris « prénom nom » d'un entrepreneur
--     individuel — impossible d'adresser un courrier, de trier par nom de
--     famille, ou de distinguer une personne physique d'une SARL ;
--   · `adresse` était une chaîne « ligne1, CP VILLE » que CINQ parseurs
--     concurrents redécoupaient à la lecture, chacun avec ses angles morts ;
--   · le numéro de TVA intracommunautaire n'existait nulle part.
--
-- ---------------------------------------------------------------------------
-- LES TROIS RÈGLES DU DOSSIER, ET POURQUOI ELLES S'APPLIQUENT ICI
--
--   1. Aucun BEGIN/COMMIT : docker/entree.sh possède la transaction
--      (--single-transaction). Divergence assumée avec
--      scripts/normaliser-adresses.sql, qui s'exécute seul.
--   2. Aucun ordre non transactionnel.
--   3. Idempotence dans le fichier. Le registre crm_meta.schema_migrations
--      garantit une seule application, mais l'idempotence reste la ceinture :
--      registre effacé, base restaurée d'un instantané antérieur, et le fichier
--      repasse. Concrètement, chaque UPDATE du remplissage ne touche QUE les
--      lignes encore vides — un second passage ne défait aucune correction
--      faite à la main entre-temps.
--
-- ---------------------------------------------------------------------------
-- ⚠️ AUCUNE COLONNE GÉNÉRÉE, ET C'EST UNE CONTRAINTE ABSOLUE
--
-- src/pages/ClientDetail.tsx fait `supabase.from('clients').update(formData)`
-- avec TOUTES les colonnes du Row. Une colonne générée ferait échouer chaque
-- enregistrement de fiche avec 428C9 (« cannot insert a non-DEFAULT value into
-- column »). D'où des déclencheurs, et non des colonnes calculées.
--
-- Corollaire : un déclencheur `BEFORE UPDATE OF colonnes…` se déclencherait à
-- CHAQUE enregistrement, la liste de colonnes ne filtrant rien puisque toutes
-- sont envoyées. La sélectivité se fait donc par comparaison NEW/OLD.


-- ============ 1. COLONNES ============
--
-- 23 colonnes. `type_personne` reste NULLABLE et SANS DÉFAUT : « on ne sait
-- pas » est un état légitime pour les 649 fiches existantes. Un
-- DEFAULT 'morale' mentirait sur les clients sans forme juridique (LMNP,
-- particuliers), et cette information fausse ne se distinguerait plus jamais
-- d'une saisie. Nullable, elles remontent d'elles-mêmes dans « Fiches
-- incomplètes ». Un CHECK … IN (…) est satisfait par NULL.

ALTER TABLE clients
  -- Identité
  ADD COLUMN IF NOT EXISTS type_personne        text,
  ADD COLUMN IF NOT EXISTS civilite             text,
  ADD COLUMN IF NOT EXISTS nom                  text,
  ADD COLUMN IF NOT EXISTS prenom               text,
  -- État civil complet, tel que l'INPI le publie : « Jean Pierre Marie ».
  -- Seul endroit où les prénoms secondaires existent.
  ADD COLUMN IF NOT EXISTS prenoms              text,
  -- Adresse
  ADD COLUMN IF NOT EXISTS adresse_ligne1       text,
  ADD COLUMN IF NOT EXISTS adresse_complement   text,
  -- `text` et jamais `integer` : 01000 perdrait son zéro de tête.
  ADD COLUMN IF NOT EXISTS code_postal          text,
  ADD COLUMN IF NOT EXISTS ville                text,
  ADD COLUMN IF NOT EXISTS pays                 text,
  -- 2A004 (Ajaccio) n'est pas numérique non plus.
  ADD COLUMN IF NOT EXISTS code_insee           text,
  -- TVA. Longueur libre : un numéro allemand fait 11 caractères, un français 13.
  ADD COLUMN IF NOT EXISTS tva_intracom         text,
  ADD COLUMN IF NOT EXISTS tva_intracom_source  text NOT NULL DEFAULT 'calcule',
  ADD COLUMN IF NOT EXISTS tva_verif_statut     text NOT NULL DEFAULT 'non_verifie',
  ADD COLUMN IF NOT EXISTS tva_verif_le         timestamptz,
  -- `userError` renvoyé par VIES : c'est le seul discriminant entre un verdict
  -- et une panne du service, qui répondent tous deux isValid=false en HTTP 200.
  ADD COLUMN IF NOT EXISTS tva_verif_code       text,
  ADD COLUMN IF NOT EXISTS tva_verif_nom        text,
  ADD COLUMN IF NOT EXISTS tva_verif_adresse    text,
  -- INPI : les extracteurs viennent plus tard, les colonnes d'abord.
  ADD COLUMN IF NOT EXISTS etat_administratif   text,
  ADD COLUMN IF NOT EXISTS date_radiation       date,
  ADD COLUMN IF NOT EXISTS nom_commercial       text,
  ADD COLUMN IF NOT EXISTS date_immatriculation date,
  ADD COLUMN IF NOT EXISTS greffe               text;


-- ============ 2. CONTRAINTES ============
--
-- `ADD CONSTRAINT IF NOT EXISTS` n'existe pas : on interroge pg_constraint.
--
-- `tva_verif_statut` n'a que TROIS valeurs, pas quatre. Une indisponibilité de
-- VIES n'est pas un jugement sur le numéro et ne doit JAMAIS écraser un verdict
-- antérieur : la route ne persiste rien dans ce cas.

DO $bloc$
DECLARE
  contrainte record;
BEGIN
  FOR contrainte IN
    SELECT * FROM (VALUES
      ('clients_type_personne_check',       $c$type_personne IN ('physique','morale')$c$),
      ('clients_tva_intracom_source_check', $c$tva_intracom_source IN ('calcule','manuel')$c$),
      ('clients_tva_verif_statut_check',    $c$tva_verif_statut IN ('non_verifie','valide','invalide')$c$),
      ('clients_etat_administratif_check',  $c$etat_administratif IN ('A','C')$c$),
      ('clients_tva_intracom_format_check', $c$tva_intracom ~ '^[A-Z]{2}[0-9A-Z]{2,13}$'$c$)
    ) AS v(nom, corps)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = contrainte.nom
        AND conrelid = 'public.clients'::regclass
    ) THEN
      EXECUTE format('ALTER TABLE clients ADD CONSTRAINT %I CHECK (%s)',
                     contrainte.nom, contrainte.corps);
    END IF;
  END LOOP;
END $bloc$;


-- ============ 3. FONCTIONS ============
--
-- Dans `crm_meta` et non `public` : ce sont des outils du schéma, pas des
-- fonctions métier, et `public` est exposé à PostgREST.
-- Le CREATE SCHEMA est en ceinture — cible.sql le crée déjà, mais cet incrément
-- doit pouvoir s'appliquer seul sur une base installée avant le registre.

CREATE SCHEMA IF NOT EXISTS crm_meta;

-- Numéro de TVA intracommunautaire français : FR + clé + SIREN.
-- clé = (12 + 3 × (SIREN mod 97)) mod 97
--
-- Vérifié contre VIES le 2026-08-03 :
--   303265045 → clé 40 → FR40303265045
--   732829320 → clé 44 → FR44732829320
--
-- POURQUOI EN SQL ET PAS EN TYPESCRIPT. `siren` est écrit par quatre chemins
-- dont trois n'ont aucun JavaScript dans la boucle : le déclencheur
-- calculate_siren_from_siret, `appliquerAuClient` du serveur, le cron
-- synchro-inpi, et ce remplissage. Un calcul en TS laisserait `tva_intracom`
-- vide sur tous les clients synchronisés la nuit.
--
-- `::bigint` et non `::integer` : un SIREN commençant par 9 dépasse int4.
CREATE OR REPLACE FUNCTION crm_meta.numero_tva_fr(siren text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $fn$
  SELECT CASE WHEN siren ~ '^\d{9}$'
    THEN 'FR' || lpad((((12 + 3 * (siren::bigint % 97)) % 97))::text, 2, '0') || siren
    ELSE NULL END;
$fn$;

-- Miroir EXACT de `isEntrepreneurIndividuel` (src/lib/legalFormsUtils.ts).
--
-- ⚠️ Tester `forme_juridique = '1000'` ne suffirait pas. `legal_forms` est créée
-- VIDE par cible.sql — aucun INSERT nulle part — donc `getLegalFormLabel` rend
-- le CODE brut sur une instance neuve et le LIBELLÉ sur une instance peuplée :
-- la colonne contient les deux formes selon l'âge de la fiche.
CREATE OR REPLACE FUNCTION crm_meta.est_entrepreneur_individuel(valeur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $fn$
  SELECT coalesce(
    btrim(valeur) IN ('0', '1', '10', '1000', 'EI', 'ei')
      OR lower(btrim(valeur)) = 'entrepreneur individuel',
    false);
$fn$;


-- ============ 4. DÉCLENCHEURS ============
--
-- Style calqué sur `calculate_siren_from_siret` : plpgsql, SECURITY DEFINER,
-- search_path figé. Aucune référence à auth./vault./net., que le test
-- « n'invoque aucun schéma absent » interdit.
--
-- `BEFORE INSERT OR UPDATE` sans liste de colonnes, et sélectivité par
-- comparaison NEW/OLD : voir l'avertissement en tête de fichier.
--
-- Un déclencheur BEFORE … FOR EACH ROW qui affecte NEW.* n'émet aucun ordre
-- SQL : aucune récursion possible.

-- ---- Adresse ----
--
-- Trois garanties, chacune figée par un test :
--
--   · SI LES COMPOSANTS N'ONT PAS CHANGÉ, ON NE TOUCHE À RIEN. Une saisie
--     manuelle de `adresse` est conservée. Les composants deviennent périmés —
--     visible et rattrapable — alors qu'écraser la saisie ne l'est pas ;
--   · ON NE VIDE JAMAIS `adresse`. Des composants effacés ne doivent pas
--     effacer le texte, seule source pour les fiches que le remplissage n'a pas
--     su découper ;
--   · « FRANCE » N'EST PAS AJOUTÉ. Le format « ligne1, 81120 Villeneuve » est celui
--     que lisent une trentaine d'endroits, et `get_dashboard_stats` extrait la
--     ville par regexp_replace(adresse, '.*\s*\d{5}\s+', '') — un « , France »
--     final ferait de la ville « Villeneuve, France » dans le top 5.
--
-- Le séparateur ' - ' entre ligne1 et complément reprend exactement ce que fait
-- `buildAddress` côté INPI : format en base et format extrait restent
-- identiques.
CREATE OR REPLACE FUNCTION public.clients_composer_adresse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  ligne    text;
  cp_ville text;
  compose  text;
  pays_txt text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.adresse_ligne1     IS NOT DISTINCT FROM OLD.adresse_ligne1
     AND NEW.adresse_complement IS NOT DISTINCT FROM OLD.adresse_complement
     AND NEW.code_postal        IS NOT DISTINCT FROM OLD.code_postal
     AND NEW.ville              IS NOT DISTINCT FROM OLD.ville
     AND NEW.pays               IS NOT DISTINCT FROM OLD.pays
  THEN
    RETURN NEW;
  END IF;

  ligne := btrim(coalesce(NEW.adresse_ligne1, ''));
  IF nullif(btrim(coalesce(NEW.adresse_complement, '')), '') IS NOT NULL THEN
    ligne := btrim(ligne || ' - ' || btrim(NEW.adresse_complement));
  END IF;

  cp_ville := btrim(concat_ws(' ',
    nullif(btrim(coalesce(NEW.code_postal, '')), ''),
    nullif(btrim(coalesce(NEW.ville, '')), '')));

  compose := concat_ws(', ', nullif(ligne, ''), nullif(cp_ville, ''));

  pays_txt := btrim(coalesce(NEW.pays, ''));
  IF pays_txt <> '' AND upper(pays_txt) <> 'FRANCE' THEN
    compose := concat_ws(', ', nullif(compose, ''), pays_txt);
  END IF;

  IF nullif(compose, '') IS NOT NULL THEN
    NEW.adresse := compose;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---- Nom affiché ----
--
-- « NOM Prénom », et sans civilité. `nom_entreprise` est la colonne de tri
-- PARTOUT (ORDER BY nom_entreprise dans le serveur, dans le MCP, dans toutes
-- les listes) : une personne physique triée sur son prénom est introuvable dans
-- 649 clients, et « M. » devant agglutinerait tous les hommes du cabinet en
-- tête de liste. La civilité sert au courrier, pas au libellé.
--
-- ⚠️ Cela INVERSE l'ordre actuel : l'extraction INPI produisait « prénom nom ».
-- Choix confirmé, annoncé au CHANGELOG.
--
-- LA COMPOSITION N'EST APPLIQUÉE QUE SI ELLE EST NON VIDE. `nom_entreprise` est
-- NOT NULL : un client basculé en `physique` avec nom et prénom encore vides
-- garde son libellé d'origine. Sans cette garde, l'enregistrement de la fiche
-- échouerait sur la contrainte — c'est le test le plus important du lot.
CREATE OR REPLACE FUNCTION public.clients_composer_nom_entreprise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  compose text;
BEGIN
  IF NEW.type_personne IS DISTINCT FROM 'physique' THEN
    RETURN NEW;
  END IF;

  compose := btrim(concat_ws(' ',
    nullif(btrim(coalesce(NEW.nom, '')), ''),
    nullif(btrim(coalesce(NEW.prenom, '')), '')));

  IF nullif(compose, '') IS NOT NULL THEN
    NEW.nom_entreprise := compose;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---- TVA intracommunautaire ----
--
-- Le nom `clients_tva_intracom_trigger` le place APRÈS `calculate_siren_trigger`
-- dans l'ordre alphabétique (« ca… » < « cl… »), et PostgreSQL déclenche ses
-- triggers BEFORE dans cet ordre. Conséquence utile : quand on saisit un SIRET
-- sans SIREN, `NEW.siren` est déjà dérivé au moment du calcul.
-- DÉPENDANCE RÉELLE, figée par un test.
CREATE OR REPLACE FUNCTION public.clients_calculer_tva_intracom()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  calcule text;
  ancien  text;
BEGIN
  -- Normalisation : majuscules, ni espaces ni points. « fr 40 303 265 045 »
  -- et « FR40303265045 » sont le même numéro.
  NEW.tva_intracom := nullif(
    upper(regexp_replace(coalesce(NEW.tva_intracom, ''), '[^A-Za-z0-9]', '', 'g')), '');

  calcule := crm_meta.numero_tva_fr(NEW.siren);
  ancien  := CASE WHEN TG_OP = 'UPDATE' THEN OLD.tva_intracom ELSE NULL END;

  IF NEW.tva_intracom IS NULL THEN
    -- Numéro effacé : retour au calcul. Sans cela la fiche resterait vide à vie
    -- après une saisie annulée.
    NEW.tva_intracom_source := 'calcule';
    NEW.tva_intracom := calcule;

  ELSIF NEW.tva_intracom IS DISTINCT FROM ancien
    AND NEW.tva_intracom IS DISTINCT FROM calcule THEN
    -- Posé par cet ordre, et différent de ce que le SIREN produit : c'est une
    -- surcharge assumée.
    NEW.tva_intracom_source := 'manuel';

  ELSIF NEW.tva_intracom_source = 'calcule' THEN
    -- Le calcul ne s'applique JAMAIS à un numéro saisi : un changement de SIREN
    -- ne défait pas une surcharge manuelle.
    NEW.tva_intracom := calcule;
  END IF;

  -- Le numéro a changé : la vérification précédente ne dit plus rien de
  -- celui-ci. Corollaire important — la route VIES n'écrit QUE les tva_verif_*,
  -- sans toucher au numéro, donc elle n'est pas défaite par cette remise à
  -- zéro. Interaction figée par un test : c'est le genre de chose qui casse au
  -- premier remaniement.
  IF TG_OP = 'UPDATE' AND NEW.tva_intracom IS DISTINCT FROM OLD.tva_intracom THEN
    NEW.tva_verif_statut  := 'non_verifie';
    NEW.tva_verif_le      := NULL;
    NEW.tva_verif_code    := NULL;
    NEW.tva_verif_nom     := NULL;
    NEW.tva_verif_adresse := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS clients_adresse_trigger ON public.clients;
CREATE TRIGGER clients_adresse_trigger
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION clients_composer_adresse();

DROP TRIGGER IF EXISTS clients_nom_entreprise_trigger ON public.clients;
CREATE TRIGGER clients_nom_entreprise_trigger
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION clients_composer_nom_entreprise();

DROP TRIGGER IF EXISTS clients_tva_intracom_trigger ON public.clients;
CREATE TRIGGER clients_tva_intracom_trigger
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION clients_calculer_tva_intracom();


-- ============ 5. REMPLISSAGE ============
--
-- Table de trace, sur le modèle de `_adresses_avant_normalisation` : de quoi
-- revenir en arrière sans dépendre d'une sauvegarde complète.
CREATE TABLE IF NOT EXISTS crm_meta._clients_avant_002 (
  client_id       uuid PRIMARY KEY,
  nom_entreprise  text,
  adresse         text,
  forme_juridique text,
  copie_le        timestamptz NOT NULL DEFAULT now()
);

-- Signalement de qualité de donnée, PAS d'erreur : voir l'arbitrage plus bas.
CREATE TABLE IF NOT EXISTS crm_meta._002_a_reprendre (
  client_id uuid NOT NULL,
  motif     text NOT NULL,
  releve_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT _002_a_reprendre_pkey PRIMARY KEY (client_id, motif)
);

INSERT INTO crm_meta._clients_avant_002 (client_id, nom_entreprise, adresse, forme_juridique)
SELECT id, nom_entreprise, adresse, forme_juridique FROM clients
ON CONFLICT (client_id) DO NOTHING;

-- ⚠️ DEUX INSTANTANÉS, ET ILS NE SERVENT PAS À LA MÊME CHOSE.
--
-- `_clients_avant_002` est durable et garde l'état du PREMIER passage : c'est le
-- filet pour revenir en arrière sans sauvegarde complète, et le `ON CONFLICT DO
-- NOTHING` est là pour qu'un rejeu ne l'écrase pas.
--
-- Celui-ci est temporaire et vaut pour CE passage. Les garde-fous plus bas
-- comparent à lui, et c'est indispensable : comparer à l'instantané durable
-- ferait échouer tout second passage dès qu'un libellé a légitimement changé
-- entre-temps — un collaborateur renseigne nom et prénom, le déclencheur
-- recompose `nom_entreprise`, et le rejeu crierait à la violation. Ce qu'on
-- vérifie est « ce passage n'a rien cassé », pas « rien n'a bougé depuis 2026 ».
--
-- Le DROP préalable est nécessaire : dans les tests, le fichier est appliqué
-- deux fois de suite sur la MÊME session, où une table temporaire survit.
DROP TABLE IF EXISTS _002_avant_ce_passage;
CREATE TEMP TABLE _002_avant_ce_passage AS
SELECT id, nom_entreprise, adresse FROM clients;

-- ---- 5.1 Adresses restées au format JSON ----
--
-- `scripts/normaliser-adresses.sql` est passé le 2026-08-01, mais
-- `adresseEnTexte` côté serveur en fabriquait de nouvelles : on repasse ici, en
-- ceinture, avec exactement la même expression.
UPDATE clients
SET adresse = concat_ws(', ',
      nullif(adresse::jsonb ->> 'ligne1', ''),
      nullif(concat_ws(' ',
        nullif(adresse::jsonb ->> 'codePostal', ''),
        nullif(adresse::jsonb ->> 'ville', '')), ''))
WHERE adresse LIKE '{%'
  AND adresse::jsonb ?& array['ligne1', 'codePostal', 'ville'];

-- ---- 5.2 type_personne ----
--
-- 'physique' si entrepreneur individuel, 'morale' si une forme juridique est
-- renseignée, NULL sinon. Le NULL est voulu : voir le commentaire des colonnes.
UPDATE clients
SET type_personne = CASE
      WHEN crm_meta.est_entrepreneur_individuel(forme_juridique) THEN 'physique'
      ELSE 'morale' END
WHERE type_personne IS NULL
  AND nullif(btrim(coalesce(forme_juridique, '')), '') IS NOT NULL;

-- ---- 5.3 nom / prenom : DÉLIBÉRÉMENT VIDES ----
--
-- Découper « MARTIN DUPOND » est indécidable en français : « DE LA TOUR Jean »,
-- « Jean Pierre MARTIN », un nom d'usage accolé au nom de naissance. Et une
-- erreur ici serait RÉÉCRITE DANS `nom_entreprise` par le déclencheur, donc
-- destructrice.
--
-- La source qui sait est l'INPI. En attendant, les deux colonnes restent vides,
-- le déclencheur ne touche à rien (garde « composition non vide »), et l'écran
-- des fiches incomplètes les fait remonter.

-- ---- 5.4 Composants d'adresse ----
--
-- Transcription fidèle de `parseClientAddress`
-- (src/components/annuaire/CompanyFormModal.tsx), retenu comme parseur de
-- référence parmi les cinq : c'est le seul qui traite le cas SANS virgule en
-- plus de la virgule la plus à droite.
--
-- `pays = 'France'` SEULEMENT si un code postal français a été reconnu : on
-- n'affirme pas un pays sur une adresse qu'on n'a pas su lire. Une adresse
-- belge (code postal à 4 chiffres) part donc entièrement dans `ligne1` avec
-- `pays` à NULL, ce qui est correct.
--
-- `adresse_complement` et `code_insee` restent NULL : aucun parseur ne les rend,
-- seule la synchronisation INPI les remplira.
--
-- Le WHERE ne touche que les lignes encore vides : c'est ce qui rend ce
-- remplissage rejouable sans défaire une correction manuelle.
WITH decoupe AS (
  SELECT
    c.id,
    -- Dernière virgule gagnante : `^(.*),` est gourmand.
    CASE
      WHEN c.adresse ~ ',' THEN
        CASE
          WHEN btrim(regexp_replace(c.adresse, '^.*,([^,]*)$', '\1')) ~ '^\d{5}\s+.+$'
            THEN btrim(regexp_replace(c.adresse, '^(.*),[^,]*$', '\1'))
          ELSE btrim(c.adresse)
        END
      WHEN btrim(c.adresse) ~ '^.*\s+\d{5}\s+.+$'
        THEN btrim(regexp_replace(btrim(c.adresse), '^(.*?)\s+\d{5}\s+.+$', '\1'))
      ELSE btrim(c.adresse)
    END AS ligne1,
    CASE
      WHEN c.adresse ~ ','
        AND btrim(regexp_replace(c.adresse, '^.*,([^,]*)$', '\1')) ~ '^\d{5}\s+.+$'
        THEN regexp_replace(btrim(regexp_replace(c.adresse, '^.*,([^,]*)$', '\1')),
                            '^(\d{5})\s+.+$', '\1')
      WHEN c.adresse !~ ',' AND btrim(c.adresse) ~ '^.*\s+\d{5}\s+.+$'
        THEN regexp_replace(btrim(c.adresse), '^.*?\s+(\d{5})\s+.+$', '\1')
      ELSE NULL
    END AS code_postal,
    CASE
      WHEN c.adresse ~ ','
        AND btrim(regexp_replace(c.adresse, '^.*,([^,]*)$', '\1')) ~ '^\d{5}\s+.+$'
        THEN btrim(regexp_replace(btrim(regexp_replace(c.adresse, '^.*,([^,]*)$', '\1')),
                                  '^\d{5}\s+(.+)$', '\1'))
      WHEN c.adresse !~ ',' AND btrim(c.adresse) ~ '^.*\s+\d{5}\s+.+$'
        THEN btrim(regexp_replace(btrim(c.adresse), '^.*?\s+\d{5}\s+(.+)$', '\1'))
      ELSE NULL
    END AS ville
  FROM clients c
  WHERE nullif(btrim(coalesce(c.adresse, '')), '') IS NOT NULL
    AND c.adresse_ligne1 IS NULL
    AND c.code_postal IS NULL
    AND c.ville IS NULL
)
UPDATE clients c
SET adresse_ligne1 = nullif(d.ligne1, ''),
    code_postal    = d.code_postal,
    ville          = d.ville,
    pays           = CASE WHEN d.code_postal IS NOT NULL THEN 'France' ELSE NULL END
FROM decoupe d
WHERE c.id = d.id;

-- ---- 5.5 Numéro de TVA ----
--
-- Le déclencheur le calcule aussi, mais il ne se déclenche que sur un ordre
-- touchant la ligne : sans cet UPDATE, une fiche dont l'adresse n'était pas
-- découpable n'aurait jamais son numéro.
UPDATE clients
SET tva_intracom = crm_meta.numero_tva_fr(siren)
WHERE tva_intracom IS NULL
  AND siren ~ '^\d{9}$';


-- ============ 6. GARDE-FOUS ============
--
-- ARBITRAGE IMPORTANT, et il diverge volontairement de
-- scripts/normaliser-adresses.sql, qui finit par un RAISE EXCEPTION dur.
--
-- Ce fichier-ci s'exécute dans docker/entree.sh sous `set -e` : un garde-fou
-- trop exigeant transformerait une amélioration de fiche client en PANNE TOTALE
-- sur une instance tierce dont nous n'avons jamais vu les données — et l'auteur
-- n'a aucun accès distant pour la dépanner. D'où deux niveaux :
--
--   · RAISE EXCEPTION sur une VIOLATION LOGIQUE — le remplissage a fait quelque
--     chose qu'il n'avait pas le droit de faire. Là, tout annuler est juste :
--     c'est un défaut de cet incrément, pas une donnée douteuse ;
--   · RAISE NOTICE + crm_meta._002_a_reprendre sur la QUALITÉ DE DONNÉE. C'est
--     du signalement, remonté à l'écran des fiches incomplètes.
--
-- Le garde-fou dur complet vit dans scripts/verifier-002.sql, lancé à la main.

DO $bloc$
DECLARE
  perdues integer;
  renommes integer;
BEGIN
  -- Violation 1 : une adresse renseignée est devenue vide pendant CE passage.
  SELECT count(*) INTO perdues
    FROM clients c JOIN _002_avant_ce_passage a ON a.id = c.id
   WHERE nullif(btrim(coalesce(a.adresse, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(c.adresse, '')), '') IS NULL;
  IF perdues > 0 THEN
    RAISE EXCEPTION '% adresse(s) perdue(s) par le remplissage 002.', perdues;
  END IF;

  -- Violation 2 : le remplissage ne touche pas à `nom_entreprise`. S'il l'a
  -- fait, c'est que le déclencheur a composé alors qu'il n'aurait pas dû —
  -- exactement le défaut que la garde « composition non vide » prévient.
  SELECT count(*) INTO renommes
    FROM clients c JOIN _002_avant_ce_passage a ON a.id = c.id
   WHERE c.nom_entreprise IS DISTINCT FROM a.nom_entreprise;
  IF renommes > 0 THEN
    RAISE EXCEPTION '% libelle(s) client modifie(s) par le remplissage 002.', renommes;
  END IF;
END $bloc$;

-- Signalement, sans blocage.
INSERT INTO crm_meta._002_a_reprendre (client_id, motif)
SELECT id, 'adresse non decoupee malgre un code postal'
  FROM clients
 WHERE adresse ~ '\d{5}' AND code_postal IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO crm_meta._002_a_reprendre (client_id, motif)
SELECT id, 'type de personne indeterminable : aucune forme juridique'
  FROM clients WHERE type_personne IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO crm_meta._002_a_reprendre (client_id, motif)
SELECT id, 'personne physique sans nom ni prenom'
  FROM clients
 WHERE type_personne = 'physique'
   AND nullif(btrim(coalesce(nom, '')), '') IS NULL
   AND nullif(btrim(coalesce(prenom, '')), '') IS NULL
ON CONFLICT DO NOTHING;

DO $bloc$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM crm_meta._002_a_reprendre;
  IF n > 0 THEN
    RAISE NOTICE '% fiche(s) a reprendre : voir crm_meta._002_a_reprendre.', n;
  END IF;
END $bloc$;
