-- Schéma CIBLE mono-cabinet — dérivé le 2026-07-31 de schema/actuel.sql.
--
-- Une instance = un cabinet. Il n'y a plus de colonne cabinet_id, et plus
-- une seule policy RLS : les droits sont portés par l'API, pas par la base.
--
-- La table « cabinets » subsiste en revanche, réduite à une seule ligne : elle
-- porte la raison sociale, le logo et les mentions qu'impriment les en-têtes de
-- PDF et la barre latérale. Le script de migration vérifie d'ailleurs qu'elle
-- en contient exactement une.
--
-- 96 tables -> 74

-- ============ REGISTRE DES INCRÉMENTS ============
--
-- Ce que ce registre résout : `cible.sql` n'est appliqué qu'à la PREMIÈRE
-- initialisation (témoin `public.profiles` dans docker/entree.sh), et
-- installation/maj.sh ne fait que sauvegarder puis reconstruire l'image. Une
-- colonne ajoutée ici n'atteindrait donc jamais une instance déjà en service :
-- c'est le rôle de schema/increments/, et de cette table qui retient ce qui a
-- déjà été appliqué.
--
-- POURQUOI UN SCHÉMA À PART, ET PAS `public`. Trois raisons, chacune suffisante :
--
--   · schema/auth-interne.sql porte un ALTER DEFAULT PRIVILEGES qui accorde
--     SELECT/INSERT/UPDATE/DELETE à `authenticated` sur TOUTE table créée
--     ensuite dans `public`. Le registre y serait modifiable depuis le
--     navigateur — or effacer une ligne suffit à faire rejouer une migration ;
--   · PGRST_DB_SCHEMAS vaut `public` (docker-compose.yml) : hors de `public`,
--     la table est hors de portée de PostgREST, sans avoir à révoquer quoi que
--     ce soit ;
--   · scripts/generer-types.mjs filtre `nspname='public'` : le registre
--     n'apparaît pas dans src/types/database.ts, où il n'a rien à faire.
--
-- `crm_meta` ET NON `crm` : le rôle de la base s'appelle `crm` et le search_path
-- vaut "$user", public. Un schéma homonyme du rôle passerait DEVANT `public` et
-- capterait tout DDL non qualifié — un CREATE TABLE sans préfixe atterrirait
-- silencieusement au mauvais endroit.
--
-- Le compte de tables de tests/schema.test.ts ne bouge pas : il ne regarde que
-- `public`.
CREATE SCHEMA IF NOT EXISTS crm_meta;

CREATE TABLE IF NOT EXISTS crm_meta.schema_migrations (
  "nom"         text NOT NULL,
  "applique_le" timestamptz NOT NULL DEFAULT now(),
  -- sha256 du fichier. Comparée au démarrage et signalée en AVERTISSEMENT
  -- seulement : un incrément édité après publication est une erreur d'auteur,
  -- pas une raison d'empêcher un cabinet de démarrer.
  "empreinte"   text,
  -- 'increment'  : le fichier a réellement été joué sur cette base ;
  -- 'cible.sql'  : base neuve, cible.sql avait déjà tout créé — marqué sans
  --                être joué, sinon chaque installation rejouerait l'histoire.
  "origine"     text NOT NULL DEFAULT 'increment',
  CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (nom)
);

-- ============ TABLES ============

CREATE TABLE "ago_avancement_statuses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "label" text NOT NULL,
  "color" text DEFAULT 'gray'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ago_avancement_statuses_pkey" PRIMARY KEY (id)
);

CREATE TABLE "app_config" (
  "key" text NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "app_config_pkey" PRIMARY KEY (key)
);

CREATE TABLE "audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id)
);

CREATE TABLE "balance_sheets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "exercice" text NOT NULL,
  "statut" text DEFAULT 'a_preparer'::text,
  "assignee_id" uuid,
  "date_echeance" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "balance_sheets_pkey" PRIMARY KEY (id),
  CONSTRAINT "balance_sheets_statut_check" CHECK ((statut = ANY (ARRAY['a_preparer'::text, 'en_cours'::text, 'en_revision'::text, 'valide'::text])))
);

CREATE TABLE "bilan_cabinet_options" (
  -- Table de reglages a UNE SEULE ligne. Sa cle d'origine etait (cabinet_id) ;
  -- en mono-cabinet il ne reste aucune cle naturelle, et la transformation a
  -- donc laisse la table sans contrainte du tout. Consequence : bilanService.ts
  -- fait un « .upsert(...) » sans cle sur quoi retomber, qui INSERE une ligne a
  -- chaque bascule du reglage au lieu de modifier celle qui existe — apres quoi
  -- « lire la premiere » ne veut plus rien dire.
  --
  -- D'ou cette colonne temoin : toujours vraie, cle primaire, et un CHECK qui
  -- interdit toute autre valeur. La table ne peut alors contenir qu'une ligne,
  -- et l'upsert de l'application retombe dessus.
  "ligne_unique" boolean DEFAULT true NOT NULL,
  "das2_inpi_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bilan_cabinet_options_pkey" PRIMARY KEY (ligne_unique),
  CONSTRAINT "bilan_cabinet_options_ligne_unique" CHECK (ligne_unique)
);

CREATE TABLE "bilan_cards" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "regime_fiscal" text NOT NULL,
  "year" integer NOT NULL,
  "column_id" uuid NOT NULL,
  "assignee_id" uuid,
  "notes" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "mois_traites" integer[] DEFAULT '{}'::integer[] NOT NULL,
  "das2_checked" boolean DEFAULT false NOT NULL,
  "das2_company_name" text,
  "das2_company_siren" text,
  CONSTRAINT "bilan_cards_pkey" PRIMARY KEY (id),
  CONSTRAINT "bilan_cards_client_id_year_key" UNIQUE (client_id, year)
);

CREATE TABLE "bilan_checklist_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "checklist_item_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint DEFAULT 0 NOT NULL,
  "mime_type" text NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bilan_checklist_attachments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "bilan_checklist_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "is_checked" boolean DEFAULT false NOT NULL,
  "checked_by" uuid,
  "checked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "bilan_checklist_items_pkey" PRIMARY KEY (id)
);

CREATE TABLE "bilan_checklist_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "regime_fiscal" text NOT NULL,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "bilan_checklist_templates_pkey" PRIMARY KEY (id)
);

CREATE TABLE "bilan_columns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "regime_fiscal" text NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT 'gray'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "bilan_columns_pkey" PRIMARY KEY (id)
);

CREATE TABLE "bilan_das2_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL,
  "company_name" text NOT NULL,
  "company_siren" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "address_line" text,
  "address_postal_code" text,
  "address_city" text,
  "code_ape" text,
  "libelle_ape" text,
  "company_siret" text,
  CONSTRAINT "bilan_das2_entries_pkey" PRIMARY KEY (id)
);

CREATE TABLE "bodacc_depot_comptes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "siren" text NOT NULL,
  "date_cloture" date,
  "date_parution" date,
  "type_depot" text DEFAULT ''::text,
  "tribunal" text DEFAULT ''::text,
  "numero_annonce" integer,
  "bodacc_id" text NOT NULL,
  "commercant" text DEFAULT ''::text,
  "raw_data" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "bodacc_depot_comptes_pkey" PRIMARY KEY (id)
);

CREATE TABLE "cabinet_collaborator_roles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "color" text DEFAULT 'teal'::text NOT NULL,
  "description" text,
  "position" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cabinet_collaborator_roles_pkey" PRIMARY KEY (id)
);

CREATE TABLE "cabinet_smtp_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "smtp_host" text DEFAULT ''::text NOT NULL,
  "smtp_port" integer DEFAULT 587 NOT NULL,
  "smtp_user" text DEFAULT ''::text NOT NULL,
  "smtp_password" text DEFAULT ''::text NOT NULL,
  "smtp_from_email" text DEFAULT ''::text NOT NULL,
  "smtp_from_name" text,
  "use_tls" boolean DEFAULT true NOT NULL,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "last_test_at" timestamp with time zone,
  "last_test_status" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "cabinet_smtp_config_pkey" PRIMARY KEY (id)
);

CREATE TABLE "cabinets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nom" text NOT NULL,
  "adresse" text,
  "siret" text,
  "email" text,
  "telephone" text,
  "logo_url" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "is_active" boolean DEFAULT true NOT NULL,
  "chat_enabled" boolean DEFAULT false NOT NULL,
  CONSTRAINT "cabinets_pkey" PRIMARY KEY (id)
);

CREATE TABLE "checklist_item_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint DEFAULT 0 NOT NULL,
  "mime_type" text NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "checklist_item_attachments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "checklist_item_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "checklist_item_comments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "checklist_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "checklist_id" uuid NOT NULL,
  "label" text NOT NULL,
  "is_checked" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "checklist_items_pkey" PRIMARY KEY (id)
);

CREATE TABLE "checklist_template_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "template_id" uuid NOT NULL,
  "label" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY (id)
);

CREATE TABLE "checklist_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "is_shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "checklist_templates_pkey" PRIMARY KEY (id)
);

CREATE TABLE "checklists" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "is_shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "client_id" uuid,
  "opportunity_card_id" uuid,
  "task_id" uuid,
  CONSTRAINT "checklists_pkey" PRIMARY KEY (id)
);

CREATE TABLE "client_ago_avancements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "exercice_year" integer NOT NULL,
  "status_id" uuid,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "client_ago_avancements_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_ago_avancements_client_id_exercice_year_key" UNIQUE (client_id, exercice_year)
);

CREATE TABLE "client_ard_calculations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "annee" integer NOT NULL,
  "ca" numeric DEFAULT 0 NOT NULL,
  "charges_totales" numeric DEFAULT 0 NOT NULL,
  "frais_compta" numeric DEFAULT 0 NOT NULL,
  "adhesion_cga" numeric DEFAULT 0 NOT NULL,
  "cfe" numeric DEFAULT 0 NOT NULL,
  "autres_charges" numeric DEFAULT 0 NOT NULL,
  "amort_immeuble" numeric DEFAULT 0 NOT NULL,
  "amort_mobilier" numeric DEFAULT 0 NOT NULL,
  "amort_derogatoires" numeric DEFAULT 0 NOT NULL,
  "amort_reintegres" numeric,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "deficit_anterieur" numeric DEFAULT 0,
  CONSTRAINT "client_ard_calculations_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_ard_unique_year" UNIQUE (client_id, annee)
);

CREATE TABLE "client_collaborators" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'assistant'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "client_collaborators_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_collaborators_client_id_user_id_key" UNIQUE (client_id, user_id)
);

CREATE TABLE "client_meeting_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "created_by" uuid,
  "date_rdv" date DEFAULT CURRENT_DATE NOT NULL,
  "objet" text NOT NULL,
  "participants" text DEFAULT ''::text,
  "contenu" text NOT NULL,
  "actions_a_suivre" text DEFAULT ''::text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "type_rdv" text,
  CONSTRAINT "client_meeting_notes_pkey" PRIMARY KEY (id)
);

CREATE TABLE "client_software" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "software_id" uuid NOT NULL,
  "start_date" date,
  "end_date" date,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_software_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_software_client_id_software_id_key" UNIQUE (client_id, software_id)
);

CREATE TABLE "clients" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nom_entreprise" text NOT NULL,
  "siret" text,
  "forme_juridique" text,
  "adresse" text,
  "email" text,
  "telephone" text,
  "contact_principal" text,
  "statut" text DEFAULT 'actif'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "numero_dossier" text,
  "date_cloture" date,
  "regime_fiscal" text,
  "date_creation_entreprise" date,
  "code_ape" text,
  "capital_social" numeric,
  "dirigeant" text,
  "last_inpi_sync" timestamp with time zone,
  "siren" text,
  "last_legal_sync" timestamp with time zone,
  "date_cloture_exercice_social" text,
  "date_premiere_cloture" date,
  "description_activite" text,
  "last_bodacc_sync" timestamp with time zone,
  "date_entree_cabinet" date,
  "date_sortie_cabinet" date,
  "habilitation_non_concerne" boolean DEFAULT false NOT NULL,
  "habilitation_avancement" text DEFAULT 'a_faire'::text,
  "habilitation_commentaire" text,
  "resume_ia" text,
  "resume_ia_generated_at" timestamp with time zone,
  "resume_ia_generated_by" uuid,
  "is_lmnp" boolean DEFAULT false NOT NULL,
  "telephone_2" text,
  -- ---- Identité éclatée, adresse en composants, TVA (increments/002) --------
  --
  -- Reporté depuis schema/increments/002 : ce fichier vaut pour une base NEUVE,
  -- l'incrément pour une base en service. Le double entretien est tenable
  -- uniquement parce que tests/schema.test.ts vérifie la parité à chaque
  -- poussée, sur `cible.sql` SEUL.
  --
  -- ⚠️ AUCUNE COLONNE GÉNÉRÉE ICI. ClientDetail.tsx envoie tout le Row à chaque
  -- enregistrement : une colonne générée ferait échouer chaque sauvegarde en
  -- 428C9. `adresse` et `nom_entreprise` sont donc recomposées par déclencheur.
  --
  -- `type_personne` NULLABLE et sans défaut : « on ne sait pas » est un état
  -- légitime, et un DEFAULT mentirait sur les LMNP et les particuliers.
  "type_personne" text,
  "civilite" text,
  "nom" text,
  "prenom" text,
  "prenoms" text,
  "adresse_ligne1" text,
  "adresse_complement" text,
  -- `text` et non `integer` : 01000 perdrait son zéro, 2A004 n'est pas numérique.
  "code_postal" text,
  "ville" text,
  "pays" text,
  "code_insee" text,
  -- Longueur libre : un numéro allemand fait 11 caractères, un français 13.
  "tva_intracom" text,
  "tva_intracom_source" text DEFAULT 'calcule'::text NOT NULL,
  "tva_verif_statut" text DEFAULT 'non_verifie'::text NOT NULL,
  "tva_verif_le" timestamp with time zone,
  "tva_verif_code" text,
  "tva_verif_nom" text,
  "tva_verif_adresse" text,
  "etat_administratif" text,
  "date_radiation" date,
  "nom_commercial" text,
  "date_immatriculation" date,
  "greffe" text,
  -- ---- Surcharge du jour d'échéance TVA (increments/009) -------------------
  --
  -- Reporté depuis schema/increments/009 : même contrat de parité que ci-dessus.
  --
  -- NULL est la valeur NORMALE, et veut dire « applique la règle CA3 » — 16 ou
  -- 19 selon l'initiale pour un entrepreneur individuel, 21 pour les sociétés
  -- autres que par actions, 24 pour les SA et assimilées. La colonne n'existe
  -- que pour les cas où cette déduction se trompe : forme juridique absente de
  -- la fiche, fiche pas à jour, ou situation connue du seul cabinet.
  --
  -- Une valeur ici PRIME SUR LA RÈGLE et n'est jamais recalculée : c'est un
  -- arbitrage humain, pas un cache. Rien ne la réécrit automatiquement.
  "tva_jour_echeance" smallint,
  -- ---- Seconde adresse électronique (increments/012) -----------------------
  --
  -- Reporté depuis schema/increments/012 : même contrat de parité que ci-dessus.
  --
  -- Le pendant de `telephone_2`, pour la même raison : l'adresse du dirigeant
  -- n'est pas celle du secrétariat. Elle N'ÉLARGIT AUCUN ENVOI — les campagnes
  -- lisent `email` seul, et un second destinataire est une décision d'envoi,
  -- pas un champ de saisie.
  --
  -- Ni CHECK de format ni défaut, comme `email` : refuser à la seconde adresse
  -- ce que la première accepte, sur la même fiche, ne se défendrait pas.
  "email_2" text,
  -- ---- Nombre total de parts (increments/013) ------------------------------
  --
  -- Reporté depuis schema/increments/013 : même contrat de parité que ci-dessus.
  --
  -- Le dénominateur de la répartition des parts (`client_associes`).
  -- `capital_social` est un montant, pas un nombre de titres : « N parts sur T »
  -- a besoin de T, et T ne se déduit pas du capital sans la valeur nominale.
  --
  -- ⚠️ IL EST DÉCLARÉ, ET NON DÉDUIT DE LA SOMME DES PARTS SAISIES, et c'est
  -- tout son intérêt. Sommer `client_associes.nb_parts` pour obtenir le total
  -- ferait tomber juste une répartition à moitié saisie — 100 % répartis entre
  -- deux associés sur les cinq que compte la société. Avec un total déclaré,
  -- l'écart se voit.
  --
  -- Ni NOT NULL ni défaut : un `0` mentirait, en ayant l'air d'une saisie.
  "parts_totales" numeric,
  CONSTRAINT "clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "clients_tva_jour_echeance_check"
    CHECK (tva_jour_echeance IS NULL OR (tva_jour_echeance BETWEEN 1 AND 31)),
  CONSTRAINT "clients_habilitation_avancement_check" CHECK ((habilitation_avancement = ANY (ARRAY['a_faire'::text, 'demande'::text, 'complet'::text]))),
  CONSTRAINT "clients_sortie_after_entree" CHECK (((date_sortie_cabinet IS NULL) OR (date_entree_cabinet IS NULL) OR (date_sortie_cabinet >= date_entree_cabinet))),
  CONSTRAINT "clients_statut_check" CHECK ((statut = ANY (ARRAY['actif'::text, 'inactif'::text, 'prospect'::text, 'archive'::text]))),
  CONSTRAINT "clients_type_personne_check" CHECK (type_personne IN ('physique', 'morale')),
  CONSTRAINT "clients_tva_intracom_source_check" CHECK (tva_intracom_source IN ('calcule', 'manuel')),
  -- Trois valeurs et non quatre : une indisponibilité de VIES n'est pas un
  -- jugement sur le numéro et ne doit jamais écraser un verdict antérieur.
  CONSTRAINT "clients_tva_verif_statut_check" CHECK (tva_verif_statut IN ('non_verifie', 'valide', 'invalide')),
  CONSTRAINT "clients_etat_administratif_check" CHECK (etat_administratif IN ('A', 'C')),
  CONSTRAINT "clients_tva_intracom_format_check" CHECK (tva_intracom ~ '^[A-Z]{2}[0-9A-Z]{2,13}$')
);

CREATE TABLE "company_officers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  -- Colonne GENEREE, et non pas une valeur par defaut : PostgreSQL interdit
  -- toute reference de colonne dans un DEFAULT. La derivation du schema avait
  -- lu pg_attrdef sans regarder pg_attribute.attgenerated, qui seul distingue
  -- les deux — l'expression y est stockee au meme endroit. Verifie contre la
  -- base reelle le 2026-07-31 : attgenerated = 's' (stored).
  "full_name" text GENERATED ALWAYS AS ((first_name || ' '::text) || last_name) STORED,
  "birth_date" date,
  "nationality" text,
  "address" text,
  "source" text DEFAULT 'manual'::text,
  "inpi_reference" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "person_type" text DEFAULT 'physique'::text,
  "denomination" text,
  CONSTRAINT "company_officers_pkey" PRIMARY KEY (id),
  CONSTRAINT "company_officers_person_type_check" CHECK ((person_type = ANY (ARRAY['physique'::text, 'morale'::text]))),
  CONSTRAINT "company_officers_source_check" CHECK ((source = ANY (ARRAY['inpi'::text, 'manual'::text])))
);

CREATE TABLE "directory_companies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "siren" text DEFAULT ''::text,
  "siret" text DEFAULT ''::text,
  "legal_form" text DEFAULT ''::text,
  "address" text DEFAULT ''::text,
  "postal_code" text DEFAULT ''::text,
  "city" text DEFAULT ''::text,
  "phone" text DEFAULT ''::text,
  "email" text DEFAULT ''::text,
  "website" text DEFAULT ''::text,
  "notes" text DEFAULT ''::text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "directory_companies_pkey" PRIMARY KEY (id)
);

CREATE TABLE "directory_contact_companies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "role_in_company" text DEFAULT ''::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "is_primary_contact" boolean DEFAULT false NOT NULL,
  CONSTRAINT "directory_contact_companies_pkey" PRIMARY KEY (id),
  CONSTRAINT "directory_contact_companies_contact_id_company_id_key" UNIQUE (contact_id, company_id)
);

CREATE TABLE "directory_contacts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "role" text DEFAULT ''::text,
  "phone" text DEFAULT ''::text,
  "mobile" text DEFAULT ''::text,
  "email" text DEFAULT ''::text,
  "notes" text DEFAULT ''::text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "directory_contacts_pkey" PRIMARY KEY (id)
);

CREATE TABLE "email_digests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "digest_type" text DEFAULT 'daily'::text NOT NULL,
  "last_sent_at" timestamp with time zone,
  "next_send_at" timestamp with time zone DEFAULT (now() + '1 day'::interval) NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "email_digests_pkey" PRIMARY KEY (id),
  CONSTRAINT "email_digests_digest_type_check" CHECK ((digest_type = ANY (ARRAY['daily'::text, 'weekly'::text]))),
  CONSTRAINT "email_digests_user_id_key" UNIQUE (user_id)
);

CREATE TABLE "email_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "notification_id" uuid,
  "to_email" text NOT NULL,
  "subject" text NOT NULL,
  "html_body" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  CONSTRAINT "email_queue_pkey" PRIMARY KEY (id),
  CONSTRAINT "email_queue_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'error'::text])))
);

CREATE TABLE "general_assemblies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "type_ag" text NOT NULL,
  "date_prevue" date NOT NULL,
  "date_realisee" date,
  "lieu" text,
  "statut" text DEFAULT 'planifiee'::text,
  "notes" text,
  "document_url" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "general_assemblies_pkey" PRIMARY KEY (id),
  CONSTRAINT "general_assemblies_statut_check" CHECK ((statut = ANY (ARRAY['planifiee'::text, 'en_cours'::text, 'realisee'::text, 'annulee'::text]))),
  CONSTRAINT "general_assemblies_type_ag_check" CHECK ((type_ag = ANY (ARRAY['ordinaire'::text, 'extraordinaire'::text])))
);

CREATE TABLE "habilitations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "siren" text NOT NULL,
  "service" text NOT NULL,
  "client_id" uuid,
  "date_creation_habilitation" text,
  "role" text,
  "etat" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "habilitations_pkey" PRIMARY KEY (id)
);

CREATE TABLE "inpi_search_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "query" text NOT NULL,
  "results_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inpi_search_history_pkey" PRIMARY KEY (id)
);

CREATE TABLE "inpi_sync_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "sync_date" timestamp with time zone DEFAULT now(),
  "status" text NOT NULL,
  "data_received" jsonb,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "inpi_sync_history_pkey" PRIMARY KEY (id),
  CONSTRAINT "inpi_sync_history_status_check" CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'partial'::text])))
);

CREATE TABLE "jedeclare_suivi_interne" (
  -- Suivi PROPRE AU CABINET d'une cellule du tableau des echeances. Il ne
  -- remplace pas l'etat rendu par jedeclare, il vit a cote : l'un dit ce que
  -- l'administration a repondu, l'autre ou en est le collaborateur.
  --
  -- Aucune ligne n'est creee d'avance. Une cellule sans ligne vaut « a faire » :
  -- pre-remplir la matrice societe x mois pour 600 societes sur 12 mois
  -- ecrirait 7 200 lignes dont la quasi-totalite ne dirait rien.
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,

  -- LA CLE DE CELLULE, portee par l'index unique plus bas.
  --
  -- `siren` et non `siret` : le SIREN survit au transfert d'etablissement, au
  -- changement de denomination et a la recreation d'une fiche. Le SIRET, lui,
  -- change des que l'etablissement bouge — et la synchronisation INPI ne le
  -- rafraichit meme pas (voir CHAMPS_SYNCHRONISABLES dans routes/inpi.ts).
  --
  -- `client_id` n'entre PAS dans la cle, et ce n'est pas un oubli : il est
  -- nullable, et PostgreSQL tient deux NULL pour distincts. Toutes les societes
  -- sans client correspondant seraient alors dupliquables a l'infini sans que
  -- la contrainte ne dise rien.
  "siren" text NOT NULL,
  "type_declaration" text NOT NULL,
  "mois" text NOT NULL,
  -- Le meme mois ne designe pas la meme chose selon l'axe : periode declaree
  -- ou mois de depot.
  "axe" text DEFAULT 'periode'::text NOT NULL,

  -- Identite vue par jedeclare, conservee telle quelle. Elle sert a reafficher
  -- une ligne dont la societe a disparu du cache, et a rejouer le rapprochement
  -- si la regle evolue.
  "societe" text DEFAULT ''::text NOT NULL,
  "siret" text,
  "dossier" text,

  -- Rapprochement avec le portefeuille. NULLABLE et ON DELETE SET NULL, a la
  -- difference de bodacc_depot_comptes.client_id (NOT NULL, CASCADE) : une
  -- societe qui teledeclare n'est pas forcement un client du cabinet, et perdre
  -- le rapprochement ne doit pas effacer le travail de suivi.
  "client_id" uuid,
  -- Vrai quand un humain a rattache la ligne a la main : le rapprochement
  -- automatique ne doit alors plus jamais l'ecraser.
  "rapprochement_manuel" boolean DEFAULT false NOT NULL,

  "statut" text DEFAULT 'a_faire'::text NOT NULL,
  "commentaire" text DEFAULT ''::text NOT NULL,
  "assignee_id" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jedeclare_suivi_interne_pkey" PRIMARY KEY (id),
  CONSTRAINT "jedeclare_suivi_interne_axe_check" CHECK ((axe = ANY (ARRAY['periode'::text, 'depot'::text]))),
  CONSTRAINT "jedeclare_suivi_interne_mois_check" CHECK ((mois ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text)),
  CONSTRAINT "jedeclare_suivi_interne_siren_check" CHECK ((siren <> ''::text)),
  CONSTRAINT "jedeclare_suivi_interne_statut_check" CHECK ((statut = ANY (ARRAY['a_faire'::text, 'en_cours'::text, 'a_controler'::text, 'valide'::text, 'sans_objet'::text])))
);

CREATE TABLE "jedeclare_teletransmissions" (
  -- Cache des accuses de teletransmission analyses, une ligne par declaration
  -- contenue dans un accuse. Calquee sur bodacc_depot_comptes : identifiant de
  -- la source, et pas d'`updated_at` — une ligne est ecrite une fois et ne
  -- bouge plus.
  --
  -- Pourquoi un cache, et pas un appel a la demande : ANALYSER UN ACCUSE LE
  -- MARQUE « RECUPERE » CHEZ JEDECLARE, ce qui peut priver le logiciel de
  -- production du cabinet du sien. Chaque piece n'est donc lue qu'UNE fois,
  -- puis conservee ici.
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,

  -- Identite de la piece chez jedeclare. `ligne` distingue les declarations
  -- d'un meme accuse : un ACS en porte souvent plusieurs.
  --
  -- `compte` est le RANG du compte de flux qui a liste la piece, dans l'ordre
  -- ou le `.env` les declare (0 = sans suffixe, 1 = `_2`...). Il fait partie de
  -- l'identite, et pas seulement de la tracabilite : deux comptes numerotent
  -- leurs pieces chacun de leur cote, et rien n'empeche deux accuses distincts
  -- de porter le meme `numero`. Sans cette colonne dans la cle, la piece du
  -- second compte passait pour deja analysee et n'etait jamais lue.
  "compte" integer DEFAULT 0 NOT NULL,
  "numero" text NOT NULL,
  "type_piece" text NOT NULL,
  "ligne" integer DEFAULT 0 NOT NULL,

  "procedure" text DEFAULT ''::text NOT NULL,
  -- ACS (conformite) ou ARS (reponse du destinataire). Seul l'ARS fait foi.
  "nature" text DEFAULT ''::text NOT NULL,
  "numero_ads" text DEFAULT ''::text NOT NULL,
  "date_avis" text DEFAULT ''::text NOT NULL,

  "siret" text DEFAULT ''::text NOT NULL,
  "siren" text DEFAULT ''::text NOT NULL,
  "societe" text DEFAULT ''::text NOT NULL,
  "dossier" text DEFAULT ''::text NOT NULL,

  -- Le code technique est le seul identifiant stable du type de declaration :
  -- l'ACS ne porte que lui, l'ARS y ajoute un libelle lisible. Les deux sont
  -- conserves, et c'est le CODE qui identifie un onglet.
  "type_declaration" text DEFAULT ''::text NOT NULL,
  "type_libelle" text DEFAULT ''::text NOT NULL,
  "destinataire" text DEFAULT ''::text NOT NULL,

  "periode_debut" text DEFAULT ''::text NOT NULL,
  "periode_fin" text DEFAULT ''::text NOT NULL,
  "resultat" text DEFAULT ''::text NOT NULL,
  "bloquee" boolean DEFAULT false NOT NULL,
  "montant" numeric,
  "rof" text DEFAULT ''::text NOT NULL,
  "lien" text DEFAULT ''::text NOT NULL,
  "analyse_le" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jedeclare_teletransmissions_pkey" PRIMARY KEY (id)
);

CREATE TABLE "legal_acts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "act_type" text NOT NULL,
  "act_category" text,
  "act_date" date NOT NULL,
  "deposit_date" date,
  "inpi_reference" text,
  "document_url" text,
  "storage_path" text,
  "download_status" text DEFAULT 'pending'::text,
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "downloaded_at" timestamp with time zone,
  "download_error" text,
  "file_size" bigint,
  "content_type" text,
  CONSTRAINT "legal_acts_pkey" PRIMARY KEY (id),
  CONSTRAINT "legal_acts_act_category_check" CHECK ((act_category = ANY (ARRAY['creation'::text, 'modification_statuts'::text, 'nomination'::text, 'demission'::text, 'transfert_siege'::text, 'dissolution'::text, 'autre'::text]))),
  CONSTRAINT "legal_acts_download_status_check" CHECK ((download_status = ANY (ARRAY['pending'::text, 'downloading'::text, 'completed'::text, 'error'::text]))),
  CONSTRAINT "legal_acts_inpi_reference_unique" UNIQUE (inpi_reference)
);

CREATE TABLE "legal_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "document_type" text NOT NULL,
  "title" text NOT NULL,
  "document_date" date NOT NULL,
  "storage_path" text,
  "file_url" text,
  "file_size" bigint,
  "mime_type" text,
  "related_act_id" uuid,
  "related_assembly_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "legal_documents_pkey" PRIMARY KEY (id),
  CONSTRAINT "legal_documents_document_type_check" CHECK ((document_type = ANY (ARRAY['statuts'::text, 'acte'::text, 'pv_ag'::text, 'kbis'::text, 'autre'::text])))
);

CREATE TABLE "legal_forms" (
  "code" text NOT NULL,
  "label" text NOT NULL,
  "level" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "legal_forms_pkey" PRIMARY KEY (code),
  CONSTRAINT "legal_forms_level_check" CHECK ((level = ANY (ARRAY[1, 2, 3])))
);

CREATE TABLE "legal_sync_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sync_type" text DEFAULT 'legal_full'::text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "status" text DEFAULT 'running'::text NOT NULL,
  "phases_completed" jsonb DEFAULT '{}'::jsonb,
  "clients_processed" integer DEFAULT 0,
  "clients_errored" integer DEFAULT 0,
  "total_clients" integer DEFAULT 0,
  "error_details" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "legal_sync_log_pkey" PRIMARY KEY (id),
  CONSTRAINT "legal_sync_log_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text, 'partial'::text])))
);

CREATE TABLE "mcp_api_keys" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "client_id" text NOT NULL,
  "client_secret_hash" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  -- ---- Droit d'ecriture (increments/014) -----------------------------------
  --
  -- Reporte depuis schema/increments/014, qui porte le raisonnement complet.
  --
  -- Une cle statique est un PORTEUR : qui la detient fait ce qu'elle permet.
  -- Jusqu'a l'ouverture de l'ecriture au connecteur, elle ne permettait que
  -- lire, et la question ne se posait pas.
  --
  -- ⚠️ `DEFAULT false` EST LE POINT ENTIER DE LA COLONNE. Une cle qui gagnerait
  -- l'ecriture parce qu'on a deploye une version serait exactement l'effet de
  -- bord contre lequel le connecteur se premunit. L'accorder est un geste
  -- explicite, cle par cle.
  "peut_ecrire" boolean DEFAULT false NOT NULL,
  CONSTRAINT "mcp_api_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_api_keys_client_id_key" UNIQUE (client_id)
);

CREATE TABLE "notification_preferences" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "notification_type" text NOT NULL,
  "email_enabled" boolean DEFAULT true NOT NULL,
  "digest_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY (id),
  CONSTRAINT "notification_preferences_user_id_notification_type_key" UNIQUE (user_id, notification_type)
);

CREATE TABLE "notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "link" text,
  "is_read" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id)
);

CREATE TABLE "officer_companies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "officer_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "role" text NOT NULL,
  "role_type" text,
  "start_date" date NOT NULL,
  "end_date" date,
  "is_active" boolean DEFAULT true,
  "power_type" text,
  "source" text DEFAULT 'manual'::text,
  "legal_act_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "officer_companies_pkey" PRIMARY KEY (id),
  CONSTRAINT "officer_companies_officer_id_client_id_role_key" UNIQUE (officer_id, client_id, role),
  CONSTRAINT "officer_companies_role_type_check" CHECK ((role_type = ANY (ARRAY['dirigeant'::text, 'administrateur'::text, 'commissaire'::text, 'associe'::text, 'autre'::text]))),
  CONSTRAINT "officer_companies_source_check" CHECK ((source = ANY (ARRAY['inpi'::text, 'manual'::text])))
);

CREATE TABLE "opportunity_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint DEFAULT 0 NOT NULL,
  "mime_type" text NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "opportunity_attachments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "opportunity_cards" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid,
  "column_id" uuid NOT NULL,
  "assignee_id" uuid,
  "montant_estime" numeric(12,2),
  "notes" text,
  "comment" text,
  "source" text,
  "date_relance" date,
  "position" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "prospect_name" text,
  CONSTRAINT "opportunity_cards_pkey" PRIMARY KEY (id),
  CONSTRAINT "opportunity_cards_client_or_prospect" CHECK (((client_id IS NOT NULL) OR (prospect_name IS NOT NULL)))
);

CREATE TABLE "opportunity_columns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT 'gray'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "opportunity_columns_pkey" PRIMARY KEY (id)
);

CREATE TABLE "profiles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "role" text DEFAULT 'user'::text NOT NULL,
  "prenom" text,
  "nom" text,
  "email" text NOT NULL,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "is_active" boolean DEFAULT true NOT NULL,
  "job_role" text,
  "display_name" text,
  "telephone" text,
  "adresse" text,
  "deactivated_at" timestamp with time zone,
  "deactivated_by" uuid,
  "show_my_dossiers" boolean DEFAULT true NOT NULL,
  "default_collaborator_role_key" text,
  "avatar_color" text,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  -- « super_admin » retire de la liste : le role a disparu du produit en phase 1
  -- et n'apparait plus une seule fois dans le code. Le laisser accepte par la
  -- base etait un piege — le compte repris depuis Bolt le portait, et le serveur
  -- n'ouvre les droits d'administration que sur roleApp === 'admin'. Son
  -- proprietaire entrait donc dans son propre CRM sans ses droits.
  CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text])))
);

CREATE TABLE "regimes_fiscaux" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "value" text NOT NULL,
  "label" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "regimes_fiscaux_pkey" PRIMARY KEY (id)
);

CREATE TABLE "relance_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "relance_invoice_id" uuid NOT NULL,
  "date_relance" timestamp with time zone DEFAULT now() NOT NULL,
  "type_relance" text DEFAULT 'email'::text NOT NULL,
  "commentaire" text DEFAULT ''::text,
  "effectuee_par" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "relance_history_pkey" PRIMARY KEY (id),
  CONSTRAINT "relance_history_type_check" CHECK ((type_relance = ANY (ARRAY['email'::text, 'telephone'::text, 'courrier'::text, 'autre'::text])))
);

CREATE TABLE "relance_invoices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "date_facture" date DEFAULT CURRENT_DATE NOT NULL,
  "date_echeance" date,
  "numero_facture" text DEFAULT ''::text,
  "libelle" text DEFAULT ''::text,
  "montant" numeric DEFAULT 0 NOT NULL,
  "statut" text DEFAULT 'en_attente'::text NOT NULL,
  "nombre_relances" integer DEFAULT 0 NOT NULL,
  "derniere_relance" timestamp with time zone,
  "notes" text DEFAULT ''::text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "date_reglement" date,
  "montant_regle" numeric DEFAULT 0 NOT NULL,
  "mode_reglement" text DEFAULT ''::text NOT NULL,
  CONSTRAINT "relance_invoices_pkey" PRIMARY KEY (id),
  CONSTRAINT "relance_invoices_statut_check" CHECK ((statut = ANY (ARRAY['en_attente'::text, 'relancee'::text, 'payee'::text, 'contentieux'::text])))
);

CREATE TABLE "revenue_declaration_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "revenue_declaration_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint DEFAULT 0 NOT NULL,
  "mime_type" text DEFAULT 'application/pdf'::text NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revenue_declaration_attachments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "revenue_declaration_collaborators" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "declaration_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "revenue_declaration_collaborators_pkey" PRIMARY KEY (id),
  CONSTRAINT "revenue_declaration_collaborators_declaration_id_user_id_key" UNIQUE (declaration_id, user_id)
);

CREATE TABLE "revenue_declaration_deadlines" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "annee" integer NOT NULL,
  "zone" text NOT NULL,
  "date_echeance" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "revenue_declaration_deadlines_pkey" PRIMARY KEY (id),
  CONSTRAINT "revenue_declaration_deadlines_annee_zone_key" UNIQUE (annee, zone),
  CONSTRAINT "revenue_declaration_deadlines_zone_check" CHECK ((zone = ANY (ARRAY['1'::text, '2'::text, '3'::text])))
);

CREATE TABLE "revenue_declarations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid,
  "person_name" text NOT NULL,
  "annee" integer NOT NULL,
  "statut" text DEFAULT 'a_faire'::text NOT NULL,
  "commentaire" text DEFAULT ''::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "zone" text,
  "derniere_annee" boolean DEFAULT false NOT NULL,
  CONSTRAINT "revenue_declarations_pkey" PRIMARY KEY (id),
  CONSTRAINT "revenue_declarations_statut_check" CHECK ((statut = ANY (ARRAY['a_faire'::text, 'donnees_a_transmettre'::text, 'donnees_transmises'::text, 'fait'::text]))),
  CONSTRAINT "revenue_declarations_zone_check" CHECK ((zone = ANY (ARRAY['1'::text, '2'::text, '3'::text])))
);

CREATE TABLE "siren_denominations" (
  "siren" text NOT NULL,
  "denomination" text NOT NULL,
  "resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- La cle d'origine etait (cabinet_id, siren). En mono-cabinet elle se reduit a
  -- (siren) — la transformation avait supprime la contrainte entiere au lieu de
  -- la reduire, laissant la table sans aucune cle.
  --
  -- Ce n'est pas cosmetique : habilitationsService.ts fait
  -- « .upsert(rows, { onConflict: 'siren' }) », et PostgreSQL refuse un
  -- ON CONFLICT qui ne correspond a aucune contrainte unique. Sans cette ligne,
  -- le cache des denominations SIREN n'ecrit jamais.
  CONSTRAINT "siren_denominations_pkey" PRIMARY KEY (siren)
);

CREATE TABLE "software" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "software_pkey" PRIMARY KEY (id),
  CONSTRAINT "software_category_check" CHECK ((category = ANY (ARRAY['comptabilite'::text, 'paie'::text, 'facturation'::text, 'gestion'::text, 'crm'::text, 'autre'::text])))
);

CREATE TABLE "sync_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "job_type" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "processed" integer DEFAULT 0 NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "message" text DEFAULT ''::text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sync_jobs_pkey" PRIMARY KEY (id)
);

CREATE TABLE "sync_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sync_type" text DEFAULT 'inpi_officers'::text NOT NULL,
  "frequency" text DEFAULT 'daily'::text NOT NULL,
  "sync_hour" integer DEFAULT 3 NOT NULL,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "last_sync_at" timestamp with time zone,
  "last_sync_status" text DEFAULT 'never'::text,
  "last_sync_message" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "sync_progress" jsonb,
  "error_details" jsonb,
  "batch_offset" integer DEFAULT 0 NOT NULL,
  "batch_size" integer DEFAULT 50 NOT NULL,
  "last_batch_completed_at" timestamp with time zone,
  CONSTRAINT "sync_settings_pkey" PRIMARY KEY (id),
  CONSTRAINT "sync_settings_frequency_check" CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "sync_settings_last_sync_status_check" CHECK ((last_sync_status = ANY (ARRAY['never'::text, 'success'::text, 'error'::text, 'running'::text, 'partial'::text]))),
  CONSTRAINT "sync_settings_sync_hour_check" CHECK (((sync_hour >= 0) AND (sync_hour <= 23)))
);

CREATE TABLE "taches_planifiees" (
  -- Le NOM est la cle : une ligne par tache, pas un historique. La question a
  -- laquelle cette table repond est « la tache de 2 h a-t-elle tourne cette
  -- nuit, et bien ? » — un journal complet demanderait une purge, et personne
  -- ne relit la 400e execution de la file d'emails.
  "nom" text NOT NULL,
  "derniere_execution" timestamp with time zone NOT NULL,
  -- Distinct de `derniere_execution` A DESSEIN : pour une tache nocturne, savoir
  -- QUAND elle a fonctionne pour la derniere fois vaut souvent plus que de
  -- savoir qu'elle vient d'echouer. Les confondre effacerait le dernier succes
  -- au premier echec.
  "dernier_succes" timestamp with time zone,
  "duree_ms" integer NOT NULL,
  "statut" text NOT NULL,
  -- Le compte rendu de la tache, ou le message d'erreur. Beaucoup de tours ne
  -- rendent rien a dire : la colonne est alors nulle, et l'ecran affiche
  -- simplement l'heure.
  "detail" text,
  CONSTRAINT "taches_planifiees_pkey" PRIMARY KEY (nom),
  CONSTRAINT "taches_planifiees_statut_check" CHECK ((statut = ANY (ARRAY['succes'::text, 'echec'::text])))
);

CREATE TABLE "task_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint DEFAULT 0 NOT NULL,
  "mime_type" text NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "task_categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nom" text NOT NULL,
  "couleur" text DEFAULT '#3B82F6'::text,
  "icone" text DEFAULT 'Tag'::text,
  "position" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "task_categories_pkey" PRIMARY KEY (id)
);

CREATE TABLE "task_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "task_comments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "task_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "titre" text NOT NULL,
  "description" text,
  "priorite" text DEFAULT 'moyenne'::text,
  "category_id" uuid,
  "estimated_hours" numeric,
  "is_active" boolean DEFAULT true,
  "position" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "task_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "task_templates_priorite_check" CHECK ((priorite = ANY (ARRAY['basse'::text, 'moyenne'::text, 'haute'::text, 'urgente'::text])))
);

CREATE TABLE "tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid,
  "titre" text NOT NULL,
  "description" text,
  "assignee_id" uuid,
  "statut" text DEFAULT 'todo'::text,
  "priorite" text DEFAULT 'moyenne'::text,
  "date_echeance" date,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "template_id" uuid,
  "created_by" uuid,
  "category_id" uuid,
  "progress" integer DEFAULT 0,
  "estimated_hours" numeric,
  "is_archived" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  CONSTRAINT "tasks_pkey" PRIMARY KEY (id),
  CONSTRAINT "tasks_priorite_check" CHECK ((priorite = ANY (ARRAY['basse'::text, 'moyenne'::text, 'haute'::text, 'urgente'::text]))),
  CONSTRAINT "tasks_progress_check" CHECK (((progress >= 0) AND (progress <= 100))),
  CONSTRAINT "tasks_statut_check" CHECK ((statut = ANY (ARRAY['todo'::text, 'in_progress'::text, 'review'::text, 'done'::text])))
);

CREATE TABLE "tax_authorizations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "type_habilitation" text NOT NULL,
  "numero" text,
  "date_debut" date NOT NULL,
  "date_fin" date NOT NULL,
  "statut" text DEFAULT 'actif'::text,
  "document_url" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "tax_authorizations_pkey" PRIMARY KEY (id),
  CONSTRAINT "tax_authorizations_statut_check" CHECK ((statut = ANY (ARRAY['actif'::text, 'expire'::text, 'en_renouvellement'::text])))
);

CREATE TABLE "tax_exemption_results" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tax_exemption_id" uuid NOT NULL,
  "calendar_year" integer NOT NULL,
  "resultat_exercice" numeric(12,2) DEFAULT 0 NOT NULL,
  "resultat_exonere" numeric(12,2) DEFAULT 0 NOT NULL,
  "resultat_impose" numeric(12,2) DEFAULT 0 NOT NULL,
  "detail_calcul" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "tax_exemption_results_pkey" PRIMARY KEY (id)
);

CREATE TABLE "tax_exemptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "type_exoneration" text NOT NULL,
  "date_debut" date NOT NULL,
  "date_fin" date NOT NULL,
  "montant" numeric(12,2),
  "statut" text DEFAULT 'actif'::text,
  "justificatif_url" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "tax_exemptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "tax_exemptions_statut_check" CHECK ((statut = ANY (ARRAY['actif'::text, 'expire'::text, 'suspendu'::text])))
);

CREATE TABLE "user_preferences" (
  "user_id" uuid NOT NULL,
  "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_preferences_pkey" PRIMARY KEY (user_id)
);

CREATE TABLE "user_row_orders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "context" text NOT NULL,
  "row_id" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_row_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_row_orders_unique" UNIQUE (user_id, context, row_id)
);

CREATE TABLE "web_directory_categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "icon" text,
  "color" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "web_directory_categories_pkey" PRIMARY KEY (id)
);

CREATE TABLE "web_directory_default_categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "icon" text,
  "color" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "web_directory_default_categories_pkey" PRIMARY KEY (id)
);

CREATE TABLE "web_directory_default_links" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "default_category_id" uuid NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "description" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "web_directory_default_links_pkey" PRIMARY KEY (id)
);

CREATE TABLE "web_directory_links" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "category_id" uuid NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "description" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "web_directory_links_pkey" PRIMARY KEY (id)
);

-- ============ CLÉS ÉTRANGÈRES ============
-- Celles vers auth.users disparaissent aussi : l'authentification devient
-- interne (passkeys), il n'y a plus de schéma auth de Supabase.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "balance_sheets" ADD CONSTRAINT "balance_sheets_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "balance_sheets" ADD CONSTRAINT "balance_sheets_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "bilan_cards" ADD CONSTRAINT "bilan_cards_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "bilan_cards" ADD CONSTRAINT "bilan_cards_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "bilan_cards" ADD CONSTRAINT "bilan_cards_column_id_fkey" FOREIGN KEY (column_id) REFERENCES bilan_columns(id) ON DELETE CASCADE;
ALTER TABLE "bilan_checklist_attachments" ADD CONSTRAINT "bilan_checklist_attachments_checklist_item_id_fkey" FOREIGN KEY (checklist_item_id) REFERENCES bilan_checklist_items(id) ON DELETE CASCADE;
ALTER TABLE "bilan_checklist_attachments" ADD CONSTRAINT "bilan_checklist_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "bilan_checklist_items" ADD CONSTRAINT "bilan_checklist_items_card_id_fkey" FOREIGN KEY (card_id) REFERENCES bilan_cards(id) ON DELETE CASCADE;
ALTER TABLE "bilan_checklist_items" ADD CONSTRAINT "bilan_checklist_items_checked_by_fkey" FOREIGN KEY (checked_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "bilan_checklist_items" ADD CONSTRAINT "bilan_checklist_items_template_id_fkey" FOREIGN KEY (template_id) REFERENCES bilan_checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE "bilan_das2_entries" ADD CONSTRAINT "bilan_das2_entries_card_id_fkey" FOREIGN KEY (card_id) REFERENCES bilan_cards(id) ON DELETE CASCADE;
ALTER TABLE "bodacc_depot_comptes" ADD CONSTRAINT "bodacc_depot_comptes_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "checklist_item_attachments" ADD CONSTRAINT "checklist_item_attachments_item_id_fkey" FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE;
ALTER TABLE "checklist_item_attachments" ADD CONSTRAINT "checklist_item_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "checklist_item_comments" ADD CONSTRAINT "checklist_item_comments_item_id_fkey" FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE;
ALTER TABLE "checklist_item_comments" ADD CONSTRAINT "checklist_item_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_fkey" FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE;
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_fkey" FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_opportunity_card_id_fkey" FOREIGN KEY (opportunity_card_id) REFERENCES opportunity_cards(id) ON DELETE SET NULL;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE "client_ago_avancements" ADD CONSTRAINT "client_ago_avancements_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_ago_avancements" ADD CONSTRAINT "client_ago_avancements_status_id_fkey" FOREIGN KEY (status_id) REFERENCES ago_avancement_statuses(id) ON DELETE SET NULL;
ALTER TABLE "client_ard_calculations" ADD CONSTRAINT "client_ard_calculations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_collaborators" ADD CONSTRAINT "client_collaborators_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_collaborators" ADD CONSTRAINT "client_collaborators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "client_meeting_notes" ADD CONSTRAINT "client_meeting_notes_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_meeting_notes" ADD CONSTRAINT "client_meeting_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "client_software" ADD CONSTRAINT "client_software_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_software" ADD CONSTRAINT "client_software_software_id_fkey" FOREIGN KEY (software_id) REFERENCES software(id) ON DELETE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_resume_ia_generated_by_fkey" FOREIGN KEY (resume_ia_generated_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "directory_contact_companies" ADD CONSTRAINT "directory_contact_companies_company_id_fkey" FOREIGN KEY (company_id) REFERENCES directory_companies(id) ON DELETE CASCADE;
ALTER TABLE "directory_contact_companies" ADD CONSTRAINT "directory_contact_companies_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES directory_contacts(id) ON DELETE CASCADE;
ALTER TABLE "email_digests" ADD CONSTRAINT "email_digests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL;
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "general_assemblies" ADD CONSTRAINT "general_assemblies_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "habilitations" ADD CONSTRAINT "habilitations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "inpi_sync_history" ADD CONSTRAINT "inpi_sync_history_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "jedeclare_suivi_interne" ADD CONSTRAINT "jedeclare_suivi_interne_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "jedeclare_suivi_interne" ADD CONSTRAINT "jedeclare_suivi_interne_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "jedeclare_suivi_interne" ADD CONSTRAINT "jedeclare_suivi_interne_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "legal_acts" ADD CONSTRAINT "legal_acts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_related_act_id_fkey" FOREIGN KEY (related_act_id) REFERENCES legal_acts(id) ON DELETE SET NULL;
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_related_assembly_id_fkey" FOREIGN KEY (related_assembly_id) REFERENCES general_assemblies(id) ON DELETE SET NULL;
ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "officer_companies" ADD CONSTRAINT "officer_companies_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "officer_companies" ADD CONSTRAINT "officer_companies_legal_act_id_fkey" FOREIGN KEY (legal_act_id) REFERENCES legal_acts(id) ON DELETE SET NULL;
ALTER TABLE "officer_companies" ADD CONSTRAINT "officer_companies_officer_id_fkey" FOREIGN KEY (officer_id) REFERENCES company_officers(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_card_id_fkey" FOREIGN KEY (card_id) REFERENCES opportunity_cards(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_column_id_fkey" FOREIGN KEY (column_id) REFERENCES opportunity_columns(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_deactivated_by_fkey" FOREIGN KEY (deactivated_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "relance_history" ADD CONSTRAINT "relance_history_effectuee_par_fkey" FOREIGN KEY (effectuee_par) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "relance_history" ADD CONSTRAINT "relance_history_relance_invoice_id_fkey" FOREIGN KEY (relance_invoice_id) REFERENCES relance_invoices(id) ON DELETE CASCADE;
ALTER TABLE "relance_invoices" ADD CONSTRAINT "relance_invoices_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declaration_attachments" ADD CONSTRAINT "revenue_declaration_attachments_revenue_declaration_id_fkey" FOREIGN KEY (revenue_declaration_id) REFERENCES revenue_declarations(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declaration_attachments" ADD CONSTRAINT "revenue_declaration_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "revenue_declaration_collaborators" ADD CONSTRAINT "revenue_declaration_collaborators_declaration_id_fkey" FOREIGN KEY (declaration_id) REFERENCES revenue_declarations(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declaration_collaborators" ADD CONSTRAINT "revenue_declaration_collaborators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declarations" ADD CONSTRAINT "revenue_declarations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "revenue_declarations" ADD CONSTRAINT "revenue_declarations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_category_id_fkey" FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_fkey" FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE SET NULL;
ALTER TABLE "tax_authorizations" ADD CONSTRAINT "tax_authorizations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "tax_exemption_results" ADD CONSTRAINT "tax_exemption_results_tax_exemption_id_fkey" FOREIGN KEY (tax_exemption_id) REFERENCES tax_exemptions(id) ON DELETE CASCADE;
ALTER TABLE "tax_exemptions" ADD CONSTRAINT "tax_exemptions_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "user_row_orders" ADD CONSTRAINT "user_row_orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "web_directory_default_links" ADD CONSTRAINT "web_directory_default_links_default_category_id_fkey" FOREIGN KEY (default_category_id) REFERENCES web_directory_default_categories(id) ON DELETE CASCADE;
ALTER TABLE "web_directory_links" ADD CONSTRAINT "web_directory_links_category_id_fkey" FOREIGN KEY (category_id) REFERENCES web_directory_categories(id) ON DELETE CASCADE;

-- ============ INDEX ============
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_balance_sheets_assignee_id ON public.balance_sheets USING btree (assignee_id);
CREATE INDEX idx_balance_sheets_client_id ON public.balance_sheets USING btree (client_id);
CREATE INDEX bilan_cards_column_id_idx ON public.bilan_cards USING btree (column_id);
CREATE INDEX idx_bilan_cards_assignee_id ON public.bilan_cards USING btree (assignee_id);
CREATE INDEX idx_bilan_checklist_attach_item ON public.bilan_checklist_attachments USING btree (checklist_item_id);
CREATE INDEX bilan_checklist_items_card_id_idx ON public.bilan_checklist_items USING btree (card_id);
CREATE INDEX idx_bilan_checklist_items_checked_by ON public.bilan_checklist_items USING btree (checked_by);
CREATE INDEX idx_bilan_checklist_items_template_id ON public.bilan_checklist_items USING btree (template_id);
CREATE INDEX idx_bilan_das2_entries_card_id ON public.bilan_das2_entries USING btree (card_id);
CREATE UNIQUE INDEX bodacc_depot_comptes_bodacc_id_key ON public.bodacc_depot_comptes USING btree (bodacc_id);
CREATE INDEX bodacc_depot_comptes_client_id_idx ON public.bodacc_depot_comptes USING btree (client_id);
CREATE INDEX idx_cabinets_is_active ON public.cabinets USING btree (is_active);
CREATE INDEX idx_checklist_item_attachments_item ON public.checklist_item_attachments USING btree (item_id);
CREATE INDEX idx_checklist_item_comments_item ON public.checklist_item_comments USING btree (item_id);
CREATE INDEX idx_checklist_item_comments_user ON public.checklist_item_comments USING btree (user_id);
CREATE INDEX idx_checklist_items_checklist_id ON public.checklist_items USING btree (checklist_id);
CREATE INDEX idx_checklist_template_items_template_id ON public.checklist_template_items USING btree (template_id);
CREATE INDEX idx_checklist_templates_user_id ON public.checklist_templates USING btree (user_id);
CREATE INDEX idx_checklists_client_id ON public.checklists USING btree (client_id);
CREATE INDEX idx_checklists_opportunity_card_id ON public.checklists USING btree (opportunity_card_id);
CREATE INDEX idx_checklists_task_id ON public.checklists USING btree (task_id);
CREATE INDEX idx_checklists_user_id ON public.checklists USING btree (user_id);
CREATE INDEX idx_client_ard_client_id ON public.client_ard_calculations USING btree (client_id);
CREATE INDEX idx_client_collaborators_client_id ON public.client_collaborators USING btree (client_id);
CREATE INDEX idx_client_collaborators_user_id ON public.client_collaborators USING btree (user_id);
CREATE INDEX idx_meeting_notes_client_date ON public.client_meeting_notes USING btree (client_id, date_rdv DESC);
CREATE INDEX idx_meeting_notes_created_by ON public.client_meeting_notes USING btree (created_by);
CREATE INDEX idx_client_software_client_id ON public.client_software USING btree (client_id);
CREATE INDEX idx_client_software_software_id ON public.client_software USING btree (software_id);
CREATE INDEX idx_clients_resume_ia_generated_by ON public.clients USING btree (resume_ia_generated_by);
CREATE INDEX idx_company_officers_dedup ON public.company_officers USING btree (first_name, last_name, birth_date);
CREATE UNIQUE INDEX idx_company_officers_unique_person ON public.company_officers USING btree (lower(TRIM(BOTH FROM first_name)), lower(TRIM(BOTH FROM last_name)), person_type, COALESCE(birth_date, '1900-01-01'::date));
CREATE INDEX idx_directory_companies_created_by ON public.directory_companies USING btree (created_by);
CREATE INDEX idx_directory_contact_companies_company ON public.directory_contact_companies USING btree (company_id);
CREATE INDEX idx_directory_contact_companies_contact ON public.directory_contact_companies USING btree (contact_id);
CREATE UNIQUE INDEX idx_directory_contact_companies_one_primary ON public.directory_contact_companies USING btree (company_id) WHERE (is_primary_contact = true);
CREATE INDEX idx_directory_contacts_created_by ON public.directory_contacts USING btree (created_by);
CREATE INDEX idx_email_queue_created ON public.email_queue USING btree (created_at);
CREATE INDEX idx_email_queue_notification_id ON public.email_queue USING btree (notification_id);
CREATE INDEX idx_email_queue_status ON public.email_queue USING btree (status) WHERE (status = 'pending'::text);
CREATE INDEX idx_email_queue_user_id ON public.email_queue USING btree (user_id);
CREATE INDEX idx_general_assemblies_client_id ON public.general_assemblies USING btree (client_id);
CREATE INDEX idx_habilitations_client_id ON public.habilitations USING btree (client_id);
CREATE INDEX idx_inpi_search_history_user_created ON public.inpi_search_history USING btree (user_id, created_at DESC);
CREATE INDEX idx_inpi_sync_history_client_id ON public.inpi_sync_history USING btree (client_id);
CREATE INDEX idx_inpi_sync_history_sync_date ON public.inpi_sync_history USING btree (sync_date DESC);
-- C'est cet index unique qui rend l'upsert possible : le ON CONFLICT s'y accroche.
CREATE UNIQUE INDEX jedeclare_suivi_interne_cellule_key ON public.jedeclare_suivi_interne USING btree (siren, type_declaration, mois, axe);
CREATE INDEX idx_jedeclare_suivi_interne_client_id ON public.jedeclare_suivi_interne USING btree (client_id);
CREATE INDEX idx_jedeclare_suivi_interne_mois ON public.jedeclare_suivi_interne USING btree (mois);
-- Idem cote cache : l'ecriture incrementale s'appuie sur cette unicite.
CREATE UNIQUE INDEX jedeclare_teletransmissions_piece_key ON public.jedeclare_teletransmissions USING btree (compte, numero, type_piece, ligne);
CREATE INDEX idx_jedeclare_teletransmissions_periode_fin ON public.jedeclare_teletransmissions USING btree (periode_fin);
CREATE INDEX idx_jedeclare_teletransmissions_siren ON public.jedeclare_teletransmissions USING btree (siren);
CREATE INDEX idx_legal_acts_act_date ON public.legal_acts USING btree (act_date DESC);
CREATE INDEX idx_legal_acts_client_id ON public.legal_acts USING btree (client_id);
CREATE INDEX idx_legal_documents_client_id ON public.legal_documents USING btree (client_id);
CREATE INDEX idx_legal_documents_related_act_id ON public.legal_documents USING btree (related_act_id);
CREATE INDEX idx_legal_documents_related_assembly_id ON public.legal_documents USING btree (related_assembly_id);
CREATE INDEX idx_legal_forms_level ON public.legal_forms USING btree (level);
CREATE INDEX idx_legal_sync_log_started_at ON public.legal_sync_log USING btree (started_at DESC);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_officer_companies_client_id ON public.officer_companies USING btree (client_id);
CREATE INDEX idx_officer_companies_legal_act_id ON public.officer_companies USING btree (legal_act_id);
CREATE INDEX idx_opportunity_attachments_card ON public.opportunity_attachments USING btree (card_id);
CREATE INDEX idx_opportunity_cards_created_by ON public.opportunity_cards USING btree (created_by);
CREATE INDEX opportunity_cards_assignee_id_idx ON public.opportunity_cards USING btree (assignee_id);
CREATE INDEX opportunity_cards_client_id_idx ON public.opportunity_cards USING btree (client_id);
CREATE INDEX opportunity_cards_column_id_idx ON public.opportunity_cards USING btree (column_id);
CREATE INDEX idx_profiles_deactivated_by ON public.profiles USING btree (deactivated_by);
CREATE INDEX idx_relance_history_invoice_id ON public.relance_history USING btree (relance_invoice_id);
CREATE INDEX idx_relance_invoices_client_id ON public.relance_invoices USING btree (client_id);
CREATE INDEX idx_relance_invoices_statut ON public.relance_invoices USING btree (statut);
CREATE INDEX idx_rev_decl_attach_declaration ON public.revenue_declaration_attachments USING btree (revenue_declaration_id);
CREATE INDEX idx_rev_decl_attach_uploaded_by ON public.revenue_declaration_attachments USING btree (uploaded_by);
CREATE INDEX idx_rev_decl_collabs_declaration ON public.revenue_declaration_collaborators USING btree (declaration_id);
CREATE INDEX idx_rev_decl_collabs_user ON public.revenue_declaration_collaborators USING btree (user_id);
CREATE INDEX idx_revenue_declaration_deadlines_annee ON public.revenue_declaration_deadlines USING btree (annee);
CREATE INDEX idx_revenue_declarations_client ON public.revenue_declarations USING btree (client_id);
CREATE INDEX idx_revenue_declarations_created_by ON public.revenue_declarations USING btree (created_by);
CREATE INDEX idx_sync_jobs_created_at ON public.sync_jobs USING btree (created_at DESC);
CREATE INDEX idx_sync_jobs_user_id ON public.sync_jobs USING btree (user_id);
CREATE INDEX idx_task_attachments_task ON public.task_attachments USING btree (task_id);
CREATE INDEX idx_task_comments_task_id ON public.task_comments USING btree (task_id);
CREATE INDEX idx_task_comments_user_id ON public.task_comments USING btree (user_id);
CREATE INDEX idx_task_templates_category_id ON public.task_templates USING btree (category_id);
CREATE INDEX idx_tasks_assignee_id ON public.tasks USING btree (assignee_id);
CREATE INDEX idx_tasks_category_id ON public.tasks USING btree (category_id);
CREATE INDEX idx_tasks_client_id ON public.tasks USING btree (client_id);
CREATE INDEX idx_tasks_created_by ON public.tasks USING btree (created_by);
CREATE INDEX idx_tasks_template_id ON public.tasks USING btree (template_id);
CREATE INDEX idx_tax_authorizations_client_id ON public.tax_authorizations USING btree (client_id);
CREATE UNIQUE INDEX idx_tax_exemption_results_unique ON public.tax_exemption_results USING btree (tax_exemption_id, calendar_year);
CREATE INDEX idx_tax_exemptions_client_id ON public.tax_exemptions USING btree (client_id);
CREATE INDEX idx_user_row_orders_user_context ON public.user_row_orders USING btree (user_id, context);
CREATE INDEX idx_web_directory_default_links_category ON public.web_directory_default_links USING btree (default_category_id);
CREATE INDEX idx_web_directory_links_category ON public.web_directory_links USING btree (category_id);

-- ============ FONCTIONS ============

CREATE OR REPLACE FUNCTION public.auto_archive_done_tasks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
UPDATE public.tasks
SET
is_archived = true,
archived_at = now(),
archived_by = NULL
WHERE
statut = 'done'
AND is_archived = false
AND updated_at < (now() - interval '30 days');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.build_notification_email_html(p_type text, p_title text, p_message text, p_link text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ⚠️ TITRE, MESSAGE ET LIEN SONT DU TEXTE, PAS DU HTML.
--
-- Les trois etaient concatenes tels quels dans le corps du courriel, et le lien
-- directement dans un attribut `href`. Deux chemins y menaient :
--
--   · le plus discret : `notify_task_assigned` compose le message avec le TITRE
--     DE LA TACHE et le nom de son auteur. Nommer une tache « <img src=x
--     onerror=...> » suffisait donc a injecter du balisage dans le courriel de
--     son collegue, sans aucun outil ;
--   · le plus grave : `create_notification` etait appelable par tout
--     collaborateur via le proxy PostgREST (corrige dans rest-droits.ts), avec
--     titre, message et lien libres.
--
-- Les trois valeurs sont donc echappees. L'ordre compte : `&` EN PREMIER, sinon
-- les entites produites par les remplacements suivants seraient re-echappees.
--
-- LE LIEN EST EN OUTRE RESTREINT AUX SCHEMAS SURS. Echapper ne suffit pas pour
-- un `href` : `javascript:` ou `data:` restent des liens vivants une fois
-- echappes. Seuls sont acceptes http(s) et les chemins relatifs — ces derniers
-- parce que les notifications reelles en posent (« /tasks?id=... »). `//hote`
-- est refuse : il est relatif au protocole, donc il sort du domaine.
DECLARE
type_label text;
type_color text;
btn_html text := '';
titre_sur text;
message_sur text;
lien_sur text;
BEGIN
titre_sur := replace(replace(replace(replace(replace(coalesce(p_title, ''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');
message_sur := replace(replace(replace(replace(replace(coalesce(p_message, ''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');

CASE p_type
WHEN 'task_assigned' THEN type_label := 'Tache attribuee'; type_color := '#0d9488';
WHEN 'task_commented' THEN type_label := 'Nouveau commentaire'; type_color := '#0891b2';
WHEN 'task_status_changed' THEN type_label := 'Statut modifie'; type_color := '#0d9488';
WHEN 'bilan_moved' THEN type_label := 'Bilan deplace'; type_color := '#059669';
WHEN 'ticket_message' THEN type_label := 'Message support'; type_color := '#d97706';
WHEN 'user_deactivated' THEN type_label := 'Compte desactive'; type_color := '#dc2626';
WHEN 'legal_alert_critical' THEN type_label := 'Alerte juridique critique'; type_color := '#dc2626';
ELSE type_label := 'Notification'; type_color := '#0d9488';
END CASE;

IF p_link IS NOT NULL AND (p_link ~ '^https?://' OR (p_link ~ '^/' AND p_link !~ '^//')) THEN
lien_sur := replace(replace(replace(replace(replace(coalesce(p_link, ''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');
btn_html := '<tr><td style="padding:24px 0 0 0;"><a href="' || lien_sur || '" style="display:inline-block;padding:12px 28px;background-color:' || type_color || ';color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Voir le detail</a></td></tr>';
END IF;

RETURN '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
|| '<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">'
|| '<tr><td align="center">'
|| '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">'
|| '<tr><td style="background-color:' || type_color || ';padding:20px 32px;"><span style="color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">' || type_label || '</span></td></tr>'
|| '<tr><td style="padding:32px;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
|| '<tr><td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:12px;">' || titre_sur || '</td></tr>'
|| '<tr><td style="font-size:15px;color:#4b5563;line-height:1.6;">' || message_sur || '</td></tr>'
|| btn_html
|| '</table></td></tr>'
|| '<tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">'
|| '<span style="font-size:12px;color:#9ca3af;">Cet email a ete envoye automatiquement. Vous pouvez gerer vos preferences de notification dans les parametres.</span>'
|| '</td></tr></table>'
|| '</td></tr></table></body></html>';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_siren_from_siret()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
IF NEW.siret IS NOT NULL AND LENGTH(NEW.siret) = 14 THEN
NEW.siren := LEFT(NEW.siret, 9);
END IF;
RETURN NEW;
END;
$function$
;

-- ---- Fiche client : recomposition et TVA (increments/002) -------------------
--
-- Reporté depuis schema/increments/002. Les corps sont identiques : les tests de
-- parité de tests/schema.test.ts s'exécutent sur ce fichier SEUL et vérifient le
-- comportement, pas seulement la présence.
--
-- Ces trois déclencheurs sont `BEFORE INSERT OR UPDATE` SANS liste de colonnes,
-- et leur sélectivité se fait par comparaison NEW/OLD : une liste de colonnes ne
-- filtrerait rien, ClientDetail.tsx les envoyant toutes à chaque enregistrement.

CREATE OR REPLACE FUNCTION crm_meta.numero_tva_fr(siren text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- FR + clé + SIREN, clé = (12 + 3 × (SIREN mod 97)) mod 97.
  -- Vérifié contre VIES le 2026-08-03 : 303265045 → FR40303265045.
  -- `::bigint` et non `::integer` : un SIREN commençant par 9 dépasse int4.
  SELECT CASE WHEN siren ~ '^\d{9}$'
    THEN 'FR' || lpad((((12 + 3 * (siren::bigint % 97)) % 97))::text, 2, '0') || siren
    ELSE NULL END;
$function$
;

CREATE OR REPLACE FUNCTION crm_meta.est_entrepreneur_individuel(valeur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Miroir exact de isEntrepreneurIndividuel (src/lib/legalFormsUtils.ts).
  -- `legal_forms` est créée VIDE : la colonne forme_juridique contient donc le
  -- CODE sur une instance neuve et le LIBELLÉ sur une instance peuplée.
  SELECT coalesce(
    btrim(valeur) IN ('0', '1', '10', '1000', 'EI', 'ei')
      OR lower(btrim(valeur)) = 'entrepreneur individuel',
    false);
$function$
;

CREATE OR REPLACE FUNCTION public.clients_composer_adresse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  ligne    text;
  cp_ville text;
  compose  text;
  pays_txt text;
BEGIN
  -- Composants inchangés : on ne touche à rien, une saisie manuelle de `adresse`
  -- est conservée.
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

  -- « France » n'est jamais ajouté : get_dashboard_stats extrait la ville par
  -- regexp sur la fin de chaîne, un « , France » final la fausserait.
  pays_txt := btrim(coalesce(NEW.pays, ''));
  IF pays_txt <> '' AND upper(pays_txt) <> 'FRANCE' THEN
    compose := concat_ws(', ', nullif(compose, ''), pays_txt);
  END IF;

  -- On ne vide JAMAIS `adresse` : c'est la seule source pour les fiches que le
  -- remplissage n'a pas su découper.
  IF nullif(compose, '') IS NOT NULL THEN
    NEW.adresse := compose;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clients_composer_nom_entreprise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  compose text;
BEGIN
  IF NEW.type_personne IS DISTINCT FROM 'physique' THEN
    RETURN NEW;
  END IF;

  -- « NOM Prénom », sans civilité : `nom_entreprise` est la colonne de tri
  -- partout, et « M. » agglutinerait tous les hommes du cabinet en tête.
  compose := btrim(concat_ws(' ',
    nullif(btrim(coalesce(NEW.nom, '')), ''),
    nullif(btrim(coalesce(NEW.prenom, '')), '')));

  -- Seulement si non vide : `nom_entreprise` est NOT NULL, et un client basculé
  -- en `physique` sans nom encore saisi doit garder son libellé.
  IF nullif(compose, '') IS NOT NULL THEN
    NEW.nom_entreprise := compose;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clients_calculer_tva_intracom()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  calcule text;
  ancien  text;
BEGIN
  NEW.tva_intracom := nullif(
    upper(regexp_replace(coalesce(NEW.tva_intracom, ''), '[^A-Za-z0-9]', '', 'g')), '');

  calcule := crm_meta.numero_tva_fr(NEW.siren);
  ancien  := CASE WHEN TG_OP = 'UPDATE' THEN OLD.tva_intracom ELSE NULL END;

  IF NEW.tva_intracom IS NULL THEN
    NEW.tva_intracom_source := 'calcule';
    NEW.tva_intracom := calcule;
  ELSIF NEW.tva_intracom IS DISTINCT FROM ancien
    AND NEW.tva_intracom IS DISTINCT FROM calcule THEN
    NEW.tva_intracom_source := 'manuel';
  ELSIF NEW.tva_intracom_source = 'calcule' THEN
    NEW.tva_intracom := calcule;
  END IF;

  -- Le numéro a changé : la vérification précédente ne dit plus rien de
  -- celui-ci. La route VIES n'écrit que les tva_verif_*, donc elle n'est pas
  -- défaite par cette remise à zéro.
  IF TG_OP = 'UPDATE' AND NEW.tva_intracom IS DISTINCT FROM OLD.tva_intracom THEN
    NEW.tva_verif_statut  := 'non_verifie';
    NEW.tva_verif_le      := NULL;
    NEW.tva_verif_code    := NULL;
    NEW.tva_verif_nom     := NULL;
    NEW.tva_verif_adresse := NULL;
  END IF;

  RETURN NEW;
END;
$function$
;

-- Réécrite pour le mono-cabinet (contrôle d'appartenance et filtre retirés).
CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_link text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (p_user_id, p_type, p_title, p_message, p_link)
  RETURNING id INTO v_notification_id;
  RETURN v_notification_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
user_email text;
pref_record RECORD;
email_subject text;
email_html text;
BEGIN
IF NEW.type LIKE 'legal_alert%' THEN
RETURN NEW;
END IF;

SELECT email INTO user_email
FROM profiles
WHERE id = NEW.user_id;

IF user_email IS NULL THEN
RETURN NEW;
END IF;

SELECT email_enabled, digest_enabled INTO pref_record
FROM notification_preferences
WHERE user_id = NEW.user_id AND notification_type = NEW.type;

IF NOT FOUND THEN
pref_record.email_enabled := true;
pref_record.digest_enabled := false;
END IF;

IF pref_record.digest_enabled = true THEN
RETURN NEW;
END IF;

IF pref_record.email_enabled = false THEN
RETURN NEW;
END IF;

email_subject := NEW.title;
email_html := build_notification_email_html(NEW.type, NEW.title, NEW.message, NEW.link);

INSERT INTO email_queue (user_id, notification_id, to_email, subject, html_body, status)
VALUES (NEW.user_id, NEW.id, user_email, email_subject, email_html, 'pending');

RETURN NEW;
END;
$function$
;

-- Réécrite pour le mono-cabinet (contrôle d'appartenance et filtre retirés).
CREATE OR REPLACE FUNCTION public.initialize_bilan_defaults(p_regime text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_col_count integer;
  v_tpl_count integer;
BEGIN
  SELECT count(*) INTO v_col_count FROM bilan_columns WHERE regime_fiscal = p_regime;
  IF v_col_count = 0 THEN
    INSERT INTO bilan_columns (regime_fiscal, name, color, position) VALUES
      (p_regime, 'A préparer', 'gray', 0),
      (p_regime, 'En cours', 'blue', 1),
      (p_regime, 'En révision', 'amber', 2),
      (p_regime, 'Terminé', 'green', 3);
  END IF;

  SELECT count(*) INTO v_tpl_count FROM bilan_checklist_templates WHERE regime_fiscal = p_regime;
  IF v_tpl_count = 0 THEN
    IF p_regime = 'BIC' THEN
      INSERT INTO bilan_checklist_templates (regime_fiscal, name, position) VALUES
        (p_regime, 'Rapprochement bancaire', 0),
        (p_regime, 'Contrôle TVA', 1),
        (p_regime, 'Révision des comptes', 2),
        (p_regime, 'Liasse fiscale', 3),
        (p_regime, 'PV AG', 4);
    ELSIF p_regime = 'BNC' THEN
      INSERT INTO bilan_checklist_templates (regime_fiscal, name, position) VALUES
        (p_regime, 'Rapprochement bancaire', 0),
        (p_regime, 'Contrôle recettes/dépenses', 1),
        (p_regime, 'Déclaration 2035', 2),
        (p_regime, 'AGA / Visa fiscal', 3);
    ELSIF p_regime = 'BA' THEN
      INSERT INTO bilan_checklist_templates (regime_fiscal, name, position) VALUES
        (p_regime, 'Rapprochement bancaire', 0),
        (p_regime, 'Contrôle stocks', 1),
        (p_regime, 'Révision des comptes', 2),
        (p_regime, 'Liasse fiscale BA', 3);
    ELSIF p_regime = 'SCI' THEN
      INSERT INTO bilan_checklist_templates (regime_fiscal, name, position) VALUES
        (p_regime, 'Rapprochement bancaire', 0),
        (p_regime, 'Contrôle loyers', 1),
        (p_regime, 'Déclaration 2072', 2),
        (p_regime, 'PV AG', 3);
    ELSIF p_regime = 'LMNP' THEN
      INSERT INTO bilan_checklist_templates (regime_fiscal, name, position) VALUES
        (p_regime, 'Rapprochement bancaire', 0),
        (p_regime, 'Contrôle loyers', 1),
        (p_regime, 'Amortissements', 2),
        (p_regime, 'Liasse fiscale', 3);
    END IF;
  END IF;
END;
$function$;

-- Réécrite pour le mono-cabinet (contrôle d'appartenance et filtre retirés).
CREATE OR REPLACE FUNCTION public.initialize_opportunity_defaults()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_col_count integer;
BEGIN
  -- Le verrou consultatif protège d'une double initialisation concurrente.
  -- Sa clé dérivait du cabinet_id ; en mono-cabinet une constante suffit.
  PERFORM pg_advisory_xact_lock(hashtext('initialize_opportunity_defaults'));

  SELECT count(*) INTO v_col_count FROM opportunity_columns;
  IF v_col_count = 0 THEN
    INSERT INTO opportunity_columns (name, color, position) VALUES
      ('A contacter', 'blue', 0),
      ('RDV pris', 'amber', 1),
      ('Proposition envoyee', 'teal', 2),
      ('En negociation', 'amber', 3),
      ('Signe', 'green', 4),
      ('Perdu', 'red', 5);
  END IF;
END;
$function$;

-- is_super_admin_for_legal_alerts() RETIREE.
--
-- Deux raisons, dont une bloquante :
--
-- 1. Elle interrogeait auth.users et auth.uid(), le schema d'authentification
--    de Supabase, qui n'existe pas ici. Et elle etait la SEULE fonction du
--    schema en LANGUAGE sql : un corps sql est resolu des la creation, quand un
--    corps plpgsql ne l'est pas. Elle faisait donc echouer l'application de ce
--    fichier — donc le premier demarrage du conteneur, entree.sh s'arretant sur
--    ON_ERROR_STOP.
-- 2. Le super-administrateur a disparu en phase 1. Aucun appelant ne subsiste,
--    ni dans ce schema, ni dans le front, ni dans le serveur.

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_task_title text;
v_assigner_name text;
BEGIN
IF (TG_OP = 'INSERT' AND NEW.assignee_id IS NOT NULL) OR
(TG_OP = 'UPDATE' AND OLD.assignee_id IS DISTINCT FROM NEW.assignee_id AND NEW.assignee_id IS NOT NULL) THEN

IF NEW.assignee_id = NEW.created_by THEN
RETURN NEW;
END IF;

v_task_title := NEW.titre;

SELECT COALESCE(display_name, prenom || ' ' || nom, email)
INTO v_assigner_name
FROM public.profiles
WHERE id = NEW.created_by;

PERFORM public.create_notification(
NEW.assignee_id,
'task_assigned',
'Nouvelle tache assignee',
v_assigner_name || ' vous a assigne la tache : ' || v_task_title,
'/tasks?id=' || NEW.id
);
END IF;

RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_email_digest(p_base_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
digest_record RECORD;
notif_record RECORD;
notif_count integer;
digest_html text;
notif_rows text;
next_send timestamptz;
type_label text;
type_color text;
base_url text := p_base_url;
BEGIN
FOR digest_record IN
SELECT ed.id, ed.user_id, ed.digest_type, ed.last_sent_at,
p.email as user_email, COALESCE(p.prenom, '') as prenom
FROM email_digests ed
JOIN profiles p ON p.id = ed.user_id
WHERE ed.is_active = true
AND ed.next_send_at <= now()
AND p.is_active = true
LOOP
notif_rows := '';
notif_count := 0;

FOR notif_record IN
SELECT n.type, n.title, n.message, n.link, n.created_at
FROM notifications n
WHERE n.user_id = digest_record.user_id
AND n.created_at > COALESCE(digest_record.last_sent_at, now() - interval '7 days')
ORDER BY n.created_at DESC
LIMIT 50
LOOP
notif_count := notif_count + 1;

CASE notif_record.type
WHEN 'task_assigned'       THEN type_color := '#0d9488'; type_label := 'Tache';
WHEN 'task_commented'      THEN type_color := '#0891b2'; type_label := 'Commentaire';
WHEN 'task_status_changed' THEN type_color := '#0d9488'; type_label := 'Statut';
WHEN 'bilan_moved'         THEN type_color := '#059669'; type_label := 'Bilan';
WHEN 'ticket_message'      THEN type_color := '#d97706'; type_label := 'Support';
WHEN 'user_deactivated'    THEN type_color := '#dc2626'; type_label := 'Compte';
ELSE                            type_color := '#6b7280'; type_label := 'Info';
END CASE;

notif_rows := notif_rows
|| '<tr><td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
|| '<td width="8" valign="top" style="padding-top:4px;"><div style="width:8px;height:8px;border-radius:50%;background-color:' || type_color || ';"></div></td>'
|| '<td style="padding-left:12px;">'
|| '<div style="font-size:11px;font-weight:600;color:' || type_color || ';text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">' || type_label || '</div>'
|| '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.4;">' || notif_record.title || '</div>'
|| '<div style="font-size:13px;color:#6b7280;margin-top:2px;line-height:1.4;">'
|| left(notif_record.message, 200)
|| CASE WHEN length(notif_record.message) > 200 THEN '...' ELSE '' END
|| '</div>'
|| '</td></tr></table></td></tr>';
END LOOP;

IF notif_count = 0 THEN
CONTINUE;
END IF;

digest_html := '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
|| '<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 16px;">'
|| '<tr><td align="center">'

|| '<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'

-- Header: brand
|| '<tr><td style="background-color:#111827;padding:24px 32px;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
|| '<tr>'
|| '<td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">CRM CABINET</td>'
|| '<td align="right" style="font-size:12px;color:#9ca3af;font-weight:500;text-transform:uppercase;letter-spacing:0.8px;">Resume</td>'
|| '</tr></table>'
|| '</td></tr>'

-- Accent bar
|| '<tr><td style="height:4px;background-color:#0d9488;font-size:0;line-height:0;">&nbsp;</td></tr>'

-- Greeting
|| '<tr><td style="padding:28px 32px 8px 32px;"><span style="font-size:20px;font-weight:700;color:#111827;">Bonjour ' || digest_record.prenom || ',</span></td></tr>'
|| '<tr><td style="padding:4px 32px 20px 32px;"><span style="font-size:15px;color:#6b7280;">Vous avez ' || notif_count || ' notification'
|| CASE WHEN notif_count > 1 THEN 's' ELSE '' END
|| ' depuis votre dernier resume.</span></td></tr>'

-- Notification list
|| '<tr><td style="padding:0 16px 28px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">'
|| notif_rows
|| '</table></td></tr>'

-- CTA button
|| '<tr><td align="center" style="padding:0 32px 28px 32px;"><a href="' || base_url || '/dashboard" style="display:inline-block;padding:14px 32px;background-color:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:0.2px;">Acceder a mon espace</a></td></tr>'

-- Footer
|| '<tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
|| '<tr><td style="font-size:12px;color:#9ca3af;line-height:1.5;">'
|| '<span style="font-weight:600;color:#6b7280;">CRM CABINET</span><br>'
|| 'Email automatique &mdash; <a href="' || base_url || '/settings" style="color:#0d9488;text-decoration:underline;">Gerer mes preferences</a>'
|| '</td></tr></table>'
|| '</td></tr>'

|| '</table>'
|| '</td></tr></table></body></html>';

INSERT INTO email_queue (user_id, to_email, subject, html_body, status)
VALUES (
digest_record.user_id,
digest_record.user_email,
'Resume de vos notifications (' || notif_count || ')',
digest_html,
'pending'
);

IF digest_record.digest_type = 'daily' THEN
next_send := (now() AT TIME ZONE 'Europe/Paris' + interval '1 day')::date + time '07:00:00';
next_send := next_send AT TIME ZONE 'Europe/Paris';
ELSE
next_send := (now() AT TIME ZONE 'Europe/Paris' + interval '7 days')::date + time '07:00:00';
next_send := next_send AT TIME ZONE 'Europe/Paris';
END IF;

UPDATE email_digests
SET last_sent_at = now(), next_send_at = next_send, updated_at = now()
WHERE id = digest_record.id;
END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_client_collaborators(p_client_id uuid, p_collaborators jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
IF p_client_id IS NULL THEN
RAISE EXCEPTION 'p_client_id is required';
END IF;

DELETE FROM client_collaborators
WHERE client_id = p_client_id;

IF p_collaborators IS NOT NULL AND jsonb_array_length(p_collaborators) > 0 THEN
INSERT INTO client_collaborators (client_id, user_id, role)
SELECT
p_client_id,
(item->>'user_id')::uuid,
item->>'role'
FROM jsonb_array_elements(p_collaborators) AS item;
END IF;
END;
$function$
;

-- Remplacer une repartition d'un seul coup. Repris de
-- schema/increments/014-repartition-ecriture.sql, qui porte le raisonnement.
--
-- ⚠️ DEUX APPELS POSTGREST FERAIENT DEUX TRANSACTIONS : si la seconde echoue,
-- le client se retrouve sans aucun associe. Une repartition a moitie remplacee
-- est pire que pas de repartition — elle a l'air d'en etre une. Meme motif que
-- `replace_client_collaborators`, et pour la meme raison.
--
-- Pas de SECURITY DEFINER : `authenticated` a deja ces droits sur la table.
-- A inscrire dans RPC_OUVERTES (server/src/rest-droits.ts) pour etre appelable.
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

CREATE OR REPLACE FUNCTION public.trigger_seed_web_directory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
PERFORM public.seed_web_directory_for_cabinet(NEW.id);
RETURN NEW;
EXCEPTION WHEN OTHERS THEN
RETURN NEW;
END;
$function$
;

-- trigger_send_pending_emails() RETIREE.
--
-- C'etait la moitie « base de donnees » de l'ancien envoi de courriels :
-- pg_cron l'appelait, elle lisait l'URL du projet dans vault.decrypted_secrets
-- puis appelait l'Edge Function send-emails par pg_net. Les trois briques ont
-- disparu — vault, pg_net, et l'Edge Function — et l'ordonnanceur interne du
-- serveur (server/src/file-emails.ts) fait ce travail depuis la phase 3.
--
-- Contrairement a is_super_admin_for_legal_alerts ci-dessus, elle ne bloquait
-- pas l'application du schema : un corps plpgsql n'est pas resolu a la
-- creation. Elle aurait echoue au premier appel — sauf qu'il n'y a plus
-- personne pour l'appeler. Retiree pour ne pas laisser croire le contraire.

CREATE OR REPLACE FUNCTION public.update_chat_conversation_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_directory_companies_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_directory_contacts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_legal_alerts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_meeting_notes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_relance_invoices_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_revenue_declarations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_sync_jobs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tax_exemption_results_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_web_directory_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
;

-- ============ TRIGGERS ============
CREATE TRIGGER set_jedeclare_suivi_interne_updated_at BEFORE UPDATE ON public.jedeclare_suivi_interne FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_collaborators_updated_at BEFORE UPDATE ON public.client_collaborators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_meeting_notes_updated_at BEFORE UPDATE ON public.client_meeting_notes FOR EACH ROW EXECUTE FUNCTION update_meeting_notes_updated_at();
CREATE TRIGGER calculate_siren_trigger BEFORE INSERT OR UPDATE OF siret ON public.clients FOR EACH ROW EXECUTE FUNCTION calculate_siren_from_siret();
-- ⚠️ L'ORDRE DE CES TROIS-CI COMPTE, et il vient de leur NOM : PostgreSQL
-- déclenche ses triggers BEFORE par ordre alphabétique. « ca… » < « cl… », donc
-- `calculate_siren_trigger` passe avant `clients_tva_intracom_trigger` — c'est
-- ce qui fait que `NEW.siren`, dérivé du SIRET, est déjà là quand le numéro de
-- TVA se calcule. Renommer l'un des deux casserait ce cas en silence ; un test
-- le fige (INSERT d'un SIRET sans SIREN).
CREATE TRIGGER clients_adresse_trigger BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION clients_composer_adresse();
CREATE TRIGGER clients_nom_entreprise_trigger BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION clients_composer_nom_entreprise();
CREATE TRIGGER clients_tva_intracom_trigger BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION clients_calculer_tva_intracom();
CREATE TRIGGER update_company_officers_updated_at BEFORE UPDATE ON public.company_officers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_update_directory_companies_updated_at BEFORE UPDATE ON public.directory_companies FOR EACH ROW EXECUTE FUNCTION update_directory_companies_updated_at();
CREATE TRIGGER trigger_update_directory_contacts_updated_at BEFORE UPDATE ON public.directory_contacts FOR EACH ROW EXECUTE FUNCTION update_directory_contacts_updated_at();
CREATE TRIGGER update_legal_acts_updated_at BEFORE UPDATE ON public.legal_acts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_legal_documents_updated_at BEFORE UPDATE ON public.legal_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_notification_email_queue AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION handle_new_notification();
CREATE TRIGGER update_officer_companies_updated_at BEFORE UPDATE ON public.officer_companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_relance_invoices_updated_at BEFORE UPDATE ON public.relance_invoices FOR EACH ROW EXECUTE FUNCTION update_relance_invoices_updated_at();
CREATE TRIGGER set_revenue_declaration_deadlines_updated_at BEFORE UPDATE ON public.revenue_declaration_deadlines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_revenue_declarations_updated_at BEFORE UPDATE ON public.revenue_declarations FOR EACH ROW EXECUTE FUNCTION update_revenue_declarations_updated_at();
CREATE TRIGGER sync_jobs_updated_at BEFORE UPDATE ON public.sync_jobs FOR EACH ROW EXECUTE FUNCTION update_sync_jobs_updated_at();
CREATE TRIGGER update_task_categories_updated_at BEFORE UPDATE ON public.task_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_comments_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_templates_updated_at BEFORE UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_notify_task_assigned AFTER INSERT OR UPDATE OF assignee_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();
CREATE TRIGGER trg_tax_exemption_results_updated_at BEFORE UPDATE ON public.tax_exemption_results FOR EACH ROW EXECUTE FUNCTION update_tax_exemption_results_updated_at();
CREATE TRIGGER set_web_directory_categories_updated_at BEFORE UPDATE ON public.web_directory_categories FOR EACH ROW EXECUTE FUNCTION update_web_directory_updated_at();
CREATE TRIGGER set_web_directory_default_categories_updated_at BEFORE UPDATE ON public.web_directory_default_categories FOR EACH ROW EXECUTE FUNCTION update_web_directory_updated_at();
CREATE TRIGGER set_web_directory_default_links_updated_at BEFORE UPDATE ON public.web_directory_default_links FOR EACH ROW EXECUTE FUNCTION update_web_directory_updated_at();
CREATE TRIGGER set_web_directory_links_updated_at BEFORE UPDATE ON public.web_directory_links FOR EACH ROW EXECUTE FUNCTION update_web_directory_updated_at();

-- ============ RLS ============
-- Aucune. Les 420 policies de la base multi-cabinets sont retirées :
-- elles servaient à isoler les cabinets entre eux. En mono-cabinet, cette
-- classe de risque n'existe plus, et les droits entre collaborateurs sont
-- portés par l'API.

-- Statistiques du tableau de bord.
--
-- Reintegree apres coup : l'analyse de dependances l'avait classee morte,
-- ce qui etait vrai de la copie du 3 juillet et faux depuis le 25, ou la
-- fonction et son appelant ont ete ajoutes ensemble. p_cabinet_id retire.
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
$function$;


-- ===========================================================================
-- OAuth du connecteur MCP. Repris de schema/increments/005-oauth-mcp.sql, qui
-- porte le raisonnement complet.
--
-- ⚠️ Les droits de ces trois tables sont retires dans schema/auth-interne.sql,
-- et non ici : ce fichier est suivi d'un « GRANT ON ALL TABLES TO authenticated »
-- qui annulerait tout REVOKE ecrit a cet endroit.
-- ===========================================================================
-- OAuth pour le connecteur MCP.
-- ===========================================================================
-- POURQUOI CELA REVIENT, APRES AVOIR ETE RETIRE.
--
-- La refonte avait supprime tout l'appareillage OAuth du connecteur MCP, avec
-- un raisonnement juste : OAuth sert a ce qu'un utilisateur delegue l'acces a
-- une application tierce, alors qu'ici l'administrateur branche son propre
-- client sur sa propre instance. Une cle suffisait, et suffit toujours pour
-- Claude Code ou Cursor, qui acceptent un en-tete `Authorization` fixe.
--
-- Mais le connecteur de claude.ai n'offre aucun champ pour un en-tete : il fait
-- OAuth ou rien. Constate le 2026-08-06 — il lit notre 401 sur `/mcp`, lance la
-- decouverte, et echoue. Ces tables sont le prix d'entree de ce client-la.
--
-- `mcp_api_keys` reste en place et inchangee. Les deux voies coexistent : la
-- cle pour ce qui accepte un en-tete, OAuth pour ce qui l'exige.
--
-- CE QUI N'EST JAMAIS STOCKE EN CLAIR : ni les secrets de client, ni les
-- jetons, ni les codes. Seuls leurs haches SHA-256, comme pour `mcp_api_keys`.
-- Une lecture de la base ne donne donc aucun acces.

-- ---------------------------------------------------------------------------
-- Les clients enregistres dynamiquement (RFC 7591).
--
-- `/register` est public par specification : c'est la seule porte non
-- authentifiee de l'ensemble. Elle est donc bornee en debit cote serveur, et
-- chaque ligne reste revocable depuis les Parametres.
--
-- `redirect_uris` est un TABLEAU et la comparaison sera EXACTE. Une correspondance
-- par prefixe ou par jokers est le defaut classique de ces implementations : elle
-- transforme le point d'autorisation en redirection ouverte, donc en vol de code.
CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
  "id"                  uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id"           text NOT NULL,
  -- Nul pour un client public (PKCE seul), ce qu'est claude.ai.
  "client_secret_hash"  text,
  "client_name"         text DEFAULT ''::text NOT NULL,
  "redirect_uris"       text[] DEFAULT '{}'::text[] NOT NULL,
  "is_active"           boolean DEFAULT true NOT NULL,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at"        timestamp with time zone,
  "revoked_at"          timestamp with time zone,
  CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_clients_client_id_key" UNIQUE (client_id)
);

-- ---------------------------------------------------------------------------
-- Les codes d'autorisation : une minute de vie, un seul usage.
--
-- Le code est lie au client, a l'URI de redirection ET au defi PKCE. Les trois
-- sont re-verifies a l'echange : un code intercepte ne sert a rien sans le
-- verifieur, qui n'a jamais transite.
--
-- `utilise_le` plutot qu'un DELETE : rejouer un code doit etre DETECTABLE, pas
-- seulement impossible. Un code presente deux fois est le signe d'une
-- interception, et le serveur revoque alors ce qui en decoule.
CREATE TABLE IF NOT EXISTS "mcp_oauth_codes" (
  "id"                    uuid DEFAULT gen_random_uuid() NOT NULL,
  "code_hash"             text NOT NULL,
  "client_id"             text NOT NULL,
  "redirect_uri"          text NOT NULL,
  "code_challenge"        text NOT NULL,
  "code_challenge_method" text DEFAULT 'S256'::text NOT NULL,
  "scope"                 text DEFAULT 'mcp:read'::text NOT NULL,
  -- L'administrateur qui a consenti. Le jeton emis agira en son nom.
  "user_id"               uuid NOT NULL,
  "expire_le"             timestamp with time zone NOT NULL,
  "utilise_le"            timestamp with time zone,
  "created_at"            timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_oauth_codes_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_codes_code_hash_key" UNIQUE (code_hash),
  CONSTRAINT "mcp_oauth_codes_user_id_fkey"
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Les jetons : acces d'une heure, rafraichissement a fenetre glissante.
--
-- LE RAFRAICHISSEMENT TOURNE. Chaque usage emet un jeton neuf et invalide
-- l'ancien, avec trente jours devant lui. Tant que le connecteur sert, la
-- connexion ne s'interrompt jamais et l'utilisateur n'a rien a faire ; un acces
-- oublie pendant trente jours se referme de lui-meme.
--
-- La rotation n'est pas qu'un confort : elle rend une fuite DETECTABLE. Deux
-- parties ne peuvent pas se servir du meme jeton, la seconde echoue — et cet
-- echec-la est un signal, sur lequel on revoque toute la chaine.
--
-- `chaine` porte cette chaine : tous les jetons issus d'un meme consentement la
-- partagent, ce qui permet de les revoquer d'un coup.
CREATE TABLE IF NOT EXISTS "mcp_oauth_tokens" (
  "id"                 uuid DEFAULT gen_random_uuid() NOT NULL,
  "chaine"             uuid NOT NULL,
  "acces_hash"         text NOT NULL,
  "rafraichir_hash"    text,
  "client_id"          text NOT NULL,
  "user_id"            uuid NOT NULL,
  "scope"              text DEFAULT 'mcp:read'::text NOT NULL,
  -- L'audience : le jeton ne vaut que pour CETTE ressource (RFC 8707).
  "resource"           text DEFAULT ''::text NOT NULL,
  "acces_expire_le"    timestamp with time zone NOT NULL,
  "rafraichir_expire_le" timestamp with time zone,
  -- Pose des que le jeton de rafraichissement est echange : il ne resservira pas.
  "remplace_le"        timestamp with time zone,
  "revoque_le"         timestamp with time zone,
  "created_at"         timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at"       timestamp with time zone,
  CONSTRAINT "mcp_oauth_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_tokens_acces_hash_key" UNIQUE (acces_hash),
  CONSTRAINT "mcp_oauth_tokens_rafraichir_hash_key" UNIQUE (rafraichir_hash),
  CONSTRAINT "mcp_oauth_tokens_user_id_fkey"
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Les deux lectures du chemin chaud : valider un jeton d'acces a chaque appel
-- MCP, et retrouver une chaine pour la revoquer.
CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_tokens_acces" ON "mcp_oauth_tokens" (acces_hash);
CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_tokens_chaine" ON "mcp_oauth_tokens" (chaine);
CREATE INDEX IF NOT EXISTS "idx_mcp_oauth_codes_expire" ON "mcp_oauth_codes" (expire_le);


-- ===========================================================================
-- Campagnes. Repris de schema/increments/006-campagnes.sql, qui porte le
-- raisonnement complet. Tout y est idempotent (IF NOT EXISTS), donc rejouable.
-- ===========================================================================
-- Campagnes : ecrire a une liste de clients, et savoir qui a recu quoi.
-- ===========================================================================
-- Le cabinet pouvait ecrire a UN client depuis sa fiche, jamais a un groupe. Les
-- rappels d'echeance et les demandes de pieces partaient donc hors de l'outil,
-- sans trace.
--
-- Ces tables ne portent aucun secret, contrairement a celles d'OAuth : elles
-- restent exposees a PostgREST en lecture, l'ecriture etant reservee aux
-- administrateurs par server/src/rest-droits.ts.

-- ---------------------------------------------------------------------------
-- L'OPT-OUT, sur les clients.
--
-- `DEFAULT true` : les clients existants sont reputes joignables, ce qui est le
-- cas â€” le cabinet leur ecrit deja individuellement. Ce drapeau ne dit pas
-- Â« a accepte une newsletter Â», il dit Â« n'a pas demande a ne plus recevoir Â».
-- C'est un opt-OUT, et le lien de desinscription de chaque courriel est ce qui le
-- rend honnete.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS accepte_mailings boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN clients.accepte_mailings IS
  'Faux si le client s''est desinscrit via le lien d''un courriel de campagne.';

-- ---------------------------------------------------------------------------
-- Les campagnes.
--
-- `filtres` conserve la selection telle qu'elle a ete demandee (statut, regime,
-- mois de cloture, collaborateurs). Pas pour la rejouer automatiquement â€” le
-- portefeuille bouge â€” mais pour repondre a Â« a qui ai-je ecrit, au fait ? Â» six
-- mois plus tard.
CREATE TABLE IF NOT EXISTS "mailing_campagnes" (
  "id"               uuid DEFAULT gen_random_uuid() NOT NULL,
  "sujet"            text NOT NULL,
  "corps"            text NOT NULL,
  "filtres"          jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cree_par"         uuid,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "envoye_le"        timestamp with time zone,
  "nb_destinataires" integer DEFAULT 0 NOT NULL,
  "nb_exclus"        integer DEFAULT 0 NOT NULL,
  CONSTRAINT "mailing_campagnes_pkey" PRIMARY KEY (id),
  CONSTRAINT "mailing_campagnes_cree_par_fkey"
    FOREIGN KEY (cree_par) REFERENCES profiles(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Les destinataires reels d'une campagne.
--
-- L'ADRESSE EST FIGEE ICI, et non lue depuis `clients` a l'affichage : c'est a
-- celle-la que le courriel est parti. Un client qui change d'adresse ensuite ne
-- doit pas reecrire l'histoire.
--
-- âš ï¸ PAS DE CLE ETRANGERE SUR `email_queue_id`, ET C'EST DELIBERE. La tache
-- `purge-file-emails` supprime chaque dimanche les lignes de `email_queue`
-- traitees depuis plus de 30 jours. Une cle etrangere ferait echouer cette purge,
-- ou â€” pire avec ON DELETE CASCADE â€” emporterait la tracabilite qui est la raison
-- d'etre de cette table. On garde donc l'identifiant sans contrainte : il sert a
-- rapprocher les deux tant que la file existe, et devient un simple souvenir
-- ensuite.
CREATE TABLE IF NOT EXISTS "mailing_destinataires" (
  "id"             uuid DEFAULT gen_random_uuid() NOT NULL,
  "campagne_id"    uuid NOT NULL,
  "client_id"      uuid,
  "email"          text NOT NULL,
  "email_queue_id" uuid,
  "created_at"     timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mailing_destinataires_pkey" PRIMARY KEY (id),
  CONSTRAINT "mailing_destinataires_campagne_id_fkey"
    FOREIGN KEY (campagne_id) REFERENCES mailing_campagnes(id) ON DELETE CASCADE,
  CONSTRAINT "mailing_destinataires_client_id_fkey"
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  -- Une adresse, un envoi par campagne. La contrainte double le dedoublonnage
  -- applicatif : si un jour le code se trompe, la base refuse.
  CONSTRAINT "mailing_destinataires_campagne_email_key" UNIQUE (campagne_id, email)
);

CREATE INDEX IF NOT EXISTS "idx_mailing_destinataires_campagne"
  ON "mailing_destinataires" (campagne_id);
CREATE INDEX IF NOT EXISTS "idx_mailing_destinataires_client"
  ON "mailing_destinataires" (client_id);



-- ===========================================================================
-- Répartition des parts sociales. Repris de
-- schema/increments/013-repartition-parts.sql, qui porte le raisonnement
-- complet. Tout y est idempotent (IF NOT EXISTS), donc rejouable.
--
-- La colonne `clients.parts_totales` du même incrément est, elle, déclarée
-- directement dans le CREATE TABLE des clients plus haut — comme `email_2` et
-- `tva_jour_echeance` avant elle.
-- ===========================================================================

-- Une ligne = ce qu'un associé détient AUJOURD'HUI, avec depuis quand et par
-- quel acte. Pas un journal des mouvements : l'historique reste dans les actes.
--
-- Cette table est la réponse à la réserve que porte le lecteur de statuts
-- (`server/src/inpi/statuts-texte.ts`) : les statuts déposés ne reflètent pas
-- les cessions postérieures au dépôt. Ce qui est saisi ici fait autorité là où
-- le greffe ne fait que témoigner d'une date.
CREATE TABLE IF NOT EXISTS "client_associes" (
  "id"           uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id"    uuid NOT NULL,
  -- L'identité passe par `company_officers` et jamais par un nom libre : deux
  -- orthographes du même associé ne se rapprocheraient jamais.
  "officer_id"   uuid NOT NULL,
  "nb_parts"     numeric NOT NULL,
  -- « 250 parts en nue-propriété et 100 en pleine propriété » est le cas
  -- ordinaire d'une SCI familiale après donation, d'où la présence de cette
  -- colonne dans la clé d'unicité.
  "demembrement" text DEFAULT 'pleine-propriete'::text NOT NULL,
  -- Nullable : une reprise de portefeuille connaît souvent la détention sans la
  -- date, et une date inventée ne se voit pas.
  "date_effet"   date,
  "legal_act_id" uuid,
  -- En texte, À CÔTÉ de `legal_act_id` et non à sa place : la plupart des
  -- cessions de parts sont notariées et ne sont jamais déposées au greffe,
  -- donc absentes de `legal_acts`.
  "acte_source"  text,
  -- ---- Origine de la ligne (increments/014) --------------------------------
  --
  -- `manual`  : saisie ou relue par le cabinet. Elle engage.
  -- `statuts` : deduite du document depose au greffe, sans relecture. Elle date
  --             du depot et reste a confirmer.
  --
  -- ⚠️ Sans cette colonne les deux seraient indiscernables, et un chiffre de
  -- 2004 se rangerait a cote d'un chiffre verifie hier. `acte_source` ne suffit
  -- pas : c'est un champ libre. Une provenance doit etre contrainte.
  "source"       text DEFAULT 'manual'::text NOT NULL,
  "notes"        text,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_associes_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_associes_client_id_fkey"
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  -- CASCADE aussi sur la personne, comme `officer_companies` : une détention
  -- orpheline désignerait un associé sans nom.
  CONSTRAINT "client_associes_officer_id_fkey"
    FOREIGN KEY (officer_id) REFERENCES company_officers(id) ON DELETE CASCADE,
  -- SET NULL, et non CASCADE : purger un acte ne doit pas effacer la détention
  -- qu'il justifiait. `acte_source` reste, en texte.
  CONSTRAINT "client_associes_legal_act_id_fkey"
    FOREIGN KEY (legal_act_id) REFERENCES legal_acts(id) ON DELETE SET NULL,
  CONSTRAINT "client_associes_client_officer_demembrement_key"
    UNIQUE (client_id, officer_id, demembrement),
  -- Une détention nulle n'existe pas : c'est une ligne à supprimer, pas une
  -- ligne à zéro.
  CONSTRAINT "client_associes_nb_parts_check" CHECK ((nb_parts > (0)::numeric)),
  CONSTRAINT "client_associes_source_check"
    CHECK ((source = ANY (ARRAY['manual'::text, 'statuts'::text]))),
  CONSTRAINT "client_associes_demembrement_check"
    CHECK ((demembrement = ANY (ARRAY['pleine-propriete'::text, 'nue-propriete'::text, 'usufruit'::text])))
);

CREATE INDEX IF NOT EXISTS "idx_client_associes_client"
  ON "client_associes" (client_id);
CREATE INDEX IF NOT EXISTS "idx_client_associes_officer"
  ON "client_associes" (officer_id);
CREATE INDEX IF NOT EXISTS "idx_client_associes_legal_act"
  ON "client_associes" (legal_act_id);

DROP TRIGGER IF EXISTS update_client_associes_updated_at ON public.client_associes;
CREATE TRIGGER update_client_associes_updated_at
  BEFORE UPDATE ON public.client_associes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
