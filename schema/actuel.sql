-- Schéma réel de la base, extrait le 2026-07-31.
--
-- Généré depuis le catalogue Postgres, pas depuis les migrations : celles-ci
-- ne décrivent plus la base (96 tables contre 88 créées, 11 tables absentes
-- des migrations, 420 policies contre 723 déclarées).
--
-- 96 tables · 341 contraintes · 180 index
-- 53 fonctions · 32 triggers · 420 policies

-- ============ TABLES ============

CREATE TABLE "ago_avancement_statuses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "label" text NOT NULL,
  "color" text DEFAULT 'gray'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ago_avancement_statuses_pkey" PRIMARY KEY (id),
  CONSTRAINT "ago_avancement_statuses_cabinet_id_label_key" UNIQUE (cabinet_id, label)
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
  "cabinet_id" uuid NOT NULL,
  "das2_inpi_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bilan_cabinet_options_pkey" PRIMARY KEY (cabinet_id)
);

CREATE TABLE "bilan_cards" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
  "regime_fiscal" text NOT NULL,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "bilan_checklist_templates_pkey" PRIMARY KEY (id)
);

CREATE TABLE "bilan_columns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "color" text DEFAULT 'teal'::text NOT NULL,
  "description" text,
  "position" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cabinet_collaborator_roles_pkey" PRIMARY KEY (id),
  CONSTRAINT "cabinet_collaborator_roles_cabinet_key_unique" UNIQUE (cabinet_id, key)
);

CREATE TABLE "cabinet_lifecycle_warnings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "warning_type" text NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cabinet_lifecycle_warnings_pkey" PRIMARY KEY (id),
  CONSTRAINT "cabinet_lifecycle_warnings_cabinet_id_warning_type_key" UNIQUE (cabinet_id, warning_type),
  CONSTRAINT "cabinet_lifecycle_warnings_warning_type_check" CHECK ((warning_type = ANY (ARRAY['deletion_warning'::text, 'deactivation_warning'::text])))
);

CREATE TABLE "cabinet_smtp_config" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  CONSTRAINT "cabinet_smtp_config_pkey" PRIMARY KEY (id),
  CONSTRAINT "cabinet_smtp_config_cabinet_id_key" UNIQUE (cabinet_id)
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
  "openai_api_key" text,
  CONSTRAINT "cabinets_pkey" PRIMARY KEY (id)
);

CREATE TABLE "changelog_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "category" text DEFAULT 'nouveaute'::text NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "published_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "changelog_entries_pkey" PRIMARY KEY (id),
  CONSTRAINT "changelog_entries_category_check" CHECK ((category = ANY (ARRAY['nouveaute'::text, 'amelioration'::text, 'correction'::text, 'annonce'::text])))
);

CREATE TABLE "changelog_read_status" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "changelog_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "changelog_read_status_pkey" PRIMARY KEY (id),
  CONSTRAINT "changelog_read_status_unique" UNIQUE (user_id, changelog_id)
);

CREATE TABLE "chat_conversations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY (id)
);

CREATE TABLE "chat_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "role" text NOT NULL,
  "content" text DEFAULT ''::text NOT NULL,
  "tokens_used" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "chat_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

CREATE TABLE "chat_rate_limits" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chat_rate_limits_pkey" PRIMARY KEY (id)
);

CREATE TABLE "checklist_item_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
  "title" text NOT NULL,
  "is_shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "checklist_templates_pkey" PRIMARY KEY (id)
);

CREATE TABLE "checklists" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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

CREATE TABLE "client_fiscal_tax_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "tax_type_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "jour_echeance" integer,
  CONSTRAINT "client_fiscal_tax_types_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_fiscal_tax_types_client_id_tax_type_id_key" UNIQUE (client_id, tax_type_id),
  CONSTRAINT "client_fiscal_tax_types_jour_echeance_check" CHECK (((jour_echeance IS NULL) OR ((jour_echeance >= 1) AND (jour_echeance <= 28))))
);

CREATE TABLE "client_meeting_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  CONSTRAINT "clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "clients_habilitation_avancement_check" CHECK ((habilitation_avancement = ANY (ARRAY['a_faire'::text, 'demande'::text, 'complet'::text]))),
  CONSTRAINT "clients_sortie_after_entree" CHECK (((date_sortie_cabinet IS NULL) OR (date_entree_cabinet IS NULL) OR (date_sortie_cabinet >= date_entree_cabinet))),
  CONSTRAINT "clients_statut_check" CHECK ((statut = ANY (ARRAY['actif'::text, 'inactif'::text, 'prospect'::text, 'archive'::text])))
);

CREATE TABLE "company_officers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  -- Corrige le 2026-07-31 : c'est une colonne GENEREE, pas un DEFAULT. Le bug
  -- est dans l'outil qui a produit ce fichier (pg_attrdef lu sans attgenerated).
  -- Corrige ici aussi pour que toute re-derivation de cible.sql ne le reintroduise pas.
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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

CREATE TABLE "document_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "name" text NOT NULL,
  "category" text DEFAULT ''::text NOT NULL,
  "category_color" text DEFAULT 'teal'::text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "html_content" text DEFAULT ''::text NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "icon_name" text DEFAULT 'FileText'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "document_templates_pkey" PRIMARY KEY (id)
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
  "cabinet_id" uuid,
  CONSTRAINT "email_queue_pkey" PRIMARY KEY (id),
  CONSTRAINT "email_queue_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'error'::text])))
);

CREATE TABLE "fiscal_deadline_cards" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "tax_type_id" uuid NOT NULL,
  "column_id" uuid NOT NULL,
  "year" integer NOT NULL,
  "period" integer NOT NULL,
  "period_label" text DEFAULT ''::text NOT NULL,
  "date_echeance" date NOT NULL,
  "assignee_id" uuid,
  "montant" numeric,
  "notes" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fiscal_deadline_cards_pkey" PRIMARY KEY (id),
  CONSTRAINT "fiscal_deadline_cards_unique" UNIQUE (cabinet_id, client_id, tax_type_id, year, period)
);

CREATE TABLE "fiscal_deadline_columns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "tax_type_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT 'gray'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fiscal_deadline_columns_pkey" PRIMARY KEY (id)
);

CREATE TABLE "fiscal_tax_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "periodicite" text DEFAULT 'mensuelle'::text NOT NULL,
  "jour_echeance" integer DEFAULT 15 NOT NULL,
  "mois_echeances" integer[] DEFAULT '{1,2,3,4,5,6,7,8,9,10,11,12}'::integer[] NOT NULL,
  "couleur" text DEFAULT 'blue'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fiscal_tax_types_pkey" PRIMARY KEY (id),
  CONSTRAINT "fiscal_tax_types_cabinet_code_unique" UNIQUE (cabinet_id, code),
  CONSTRAINT "fiscal_tax_types_jour_check" CHECK (((jour_echeance >= 1) AND (jour_echeance <= 28))),
  CONSTRAINT "fiscal_tax_types_periodicite_check" CHECK ((periodicite = ANY (ARRAY['mensuelle'::text, 'trimestrielle'::text, 'semestrielle'::text, 'annuelle'::text])))
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

CREATE TABLE "generated_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "user_id" uuid,
  "template_id" uuid,
  "client_id" uuid,
  "name" text DEFAULT ''::text NOT NULL,
  "html_content" text DEFAULT ''::text NOT NULL,
  "manual_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "generated_documents_pkey" PRIMARY KEY (id)
);

CREATE TABLE "gov_chat_conversations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gov_chat_conversations_pkey" PRIMARY KEY (id)
);

CREATE TABLE "gov_chat_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "role" text NOT NULL,
  "content" text DEFAULT ''::text NOT NULL,
  "tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tokens_used" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gov_chat_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "gov_chat_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

CREATE TABLE "gov_chat_rate_limits" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gov_chat_rate_limits_pkey" PRIMARY KEY (id)
);

CREATE TABLE "habilitations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "siren" text NOT NULL,
  "service" text NOT NULL,
  "client_id" uuid,
  "date_creation_habilitation" text,
  "role" text,
  "etat" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "habilitations_pkey" PRIMARY KEY (id),
  CONSTRAINT "habilitations_cabinet_siren_service_unique" UNIQUE (cabinet_id, siren, service)
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
  "cabinet_id" uuid NOT NULL,
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

CREATE TABLE "llm_generations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text DEFAULT ''::text NOT NULL,
  "prompt" text NOT NULL,
  "response" text DEFAULT ''::text NOT NULL,
  "generation_type" text DEFAULT 'autre'::text NOT NULL,
  "client_id" uuid,
  "tokens_used" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "llm_generations_pkey" PRIMARY KEY (id)
);

CREATE TABLE "llm_prompt_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "category" text DEFAULT ''::text NOT NULL,
  "category_color" text DEFAULT 'teal'::text NOT NULL,
  "label" text NOT NULL,
  "prompt_text" text DEFAULT ''::text NOT NULL,
  "generation_type" text DEFAULT 'autre'::text NOT NULL,
  "needs_client" boolean DEFAULT false NOT NULL,
  "icon_name" text DEFAULT 'FileText'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "llm_prompt_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "llm_prompt_templates_generation_type_check" CHECK ((generation_type = ANY (ARRAY['document'::text, 'statistique'::text, 'analyse'::text, 'autre'::text])))
);

CREATE TABLE "mcp_api_keys" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "client_id" text NOT NULL,
  "client_secret_hash" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "mcp_api_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_api_keys_client_id_key" UNIQUE (client_id)
);

CREATE TABLE "mcp_oauth_codes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "mcp_key_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "code_challenge" text NOT NULL,
  "code_challenge_method" text DEFAULT 'S256'::text NOT NULL,
  "redirect_uri" text NOT NULL,
  "state" text DEFAULT ''::text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_oauth_codes_pkey" PRIMARY KEY (id)
);

CREATE TABLE "mcp_oauth_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "access_token" text NOT NULL,
  "mcp_key_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_oauth_tokens_pkey" PRIMARY KEY (id)
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT 'gray'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "opportunity_columns_pkey" PRIMARY KEY (id)
);

CREATE TABLE "profiles" (
  "id" uuid NOT NULL,
  "cabinet_id" uuid,
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
  CONSTRAINT "profiles_cabinet_id_required" CHECK (((role = 'super_admin'::text) OR (cabinet_id IS NOT NULL))) NOT VALID,
  CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text, 'super_admin'::text])))
);

CREATE TABLE "regimes_fiscaux" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "value" text NOT NULL,
  "label" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "regimes_fiscaux_pkey" PRIMARY KEY (id),
  CONSTRAINT "regimes_fiscaux_cabinet_id_value_key" UNIQUE (cabinet_id, value)
);

CREATE TABLE "relance_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "relance_invoice_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
  "siren" text NOT NULL,
  "denomination" text NOT NULL,
  "resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "siren_denominations_pkey" PRIMARY KEY (cabinet_id, siren)
);

CREATE TABLE "software" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "software_pkey" PRIMARY KEY (id),
  CONSTRAINT "software_category_check" CHECK ((category = ANY (ARRAY['comptabilite'::text, 'paie'::text, 'facturation'::text, 'gestion'::text, 'crm'::text, 'autre'::text])))
);

CREATE TABLE "support_tickets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "cabinet_id" uuid NOT NULL,
  "subject" text NOT NULL,
  "category" text DEFAULT 'question'::text NOT NULL,
  "priority" text DEFAULT 'normale'::text NOT NULL,
  "status" text DEFAULT 'ouvert'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_tickets_category_check" CHECK ((category = ANY (ARRAY['bug'::text, 'question'::text, 'fonctionnalite'::text, 'autre'::text]))),
  CONSTRAINT "support_tickets_priority_check" CHECK ((priority = ANY (ARRAY['basse'::text, 'normale'::text, 'haute'::text, 'urgente'::text]))),
  CONSTRAINT "support_tickets_status_check" CHECK ((status = ANY (ARRAY['ouvert'::text, 'en_cours'::text, 'resolu'::text, 'ferme'::text])))
);

CREATE TABLE "sync_jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  CONSTRAINT "sync_settings_cabinet_id_sync_type_key" UNIQUE (cabinet_id, sync_type),
  CONSTRAINT "sync_settings_frequency_check" CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "sync_settings_last_sync_status_check" CHECK ((last_sync_status = ANY (ARRAY['never'::text, 'success'::text, 'error'::text, 'running'::text, 'partial'::text]))),
  CONSTRAINT "sync_settings_sync_hour_check" CHECK (((sync_hour >= 0) AND (sync_hour <= 23)))
);

CREATE TABLE "task_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
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

CREATE TABLE "ticket_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_size" bigint DEFAULT 0 NOT NULL,
  "mime_type" text DEFAULT ''::text NOT NULL,
  "storage_path" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "ticket_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "sender_id" uuid,
  "content" text NOT NULL,
  "is_internal" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ticket_messages_pkey" PRIMARY KEY (id)
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
  "cabinet_id" uuid NOT NULL,
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
  "cabinet_id" uuid NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "description" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "web_directory_links_pkey" PRIMARY KEY (id)
);

-- ============ CLÉS ÉTRANGÈRES ============
ALTER TABLE "ago_avancement_statuses" ADD CONSTRAINT "ago_avancement_statuses_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "balance_sheets" ADD CONSTRAINT "balance_sheets_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "balance_sheets" ADD CONSTRAINT "balance_sheets_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "bilan_cabinet_options" ADD CONSTRAINT "bilan_cabinet_options_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "bilan_cards" ADD CONSTRAINT "bilan_cards_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "bilan_cards" ADD CONSTRAINT "bilan_cards_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "bilan_cards" ADD CONSTRAINT "bilan_cards_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "bilan_cards" ADD CONSTRAINT "bilan_cards_column_id_fkey" FOREIGN KEY (column_id) REFERENCES bilan_columns(id) ON DELETE CASCADE;
ALTER TABLE "bilan_checklist_attachments" ADD CONSTRAINT "bilan_checklist_attachments_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "bilan_checklist_attachments" ADD CONSTRAINT "bilan_checklist_attachments_checklist_item_id_fkey" FOREIGN KEY (checklist_item_id) REFERENCES bilan_checklist_items(id) ON DELETE CASCADE;
ALTER TABLE "bilan_checklist_attachments" ADD CONSTRAINT "bilan_checklist_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "bilan_checklist_items" ADD CONSTRAINT "bilan_checklist_items_card_id_fkey" FOREIGN KEY (card_id) REFERENCES bilan_cards(id) ON DELETE CASCADE;
ALTER TABLE "bilan_checklist_items" ADD CONSTRAINT "bilan_checklist_items_checked_by_fkey" FOREIGN KEY (checked_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "bilan_checklist_items" ADD CONSTRAINT "bilan_checklist_items_template_id_fkey" FOREIGN KEY (template_id) REFERENCES bilan_checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE "bilan_checklist_templates" ADD CONSTRAINT "bilan_checklist_templates_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "bilan_columns" ADD CONSTRAINT "bilan_columns_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "bilan_das2_entries" ADD CONSTRAINT "bilan_das2_entries_card_id_fkey" FOREIGN KEY (card_id) REFERENCES bilan_cards(id) ON DELETE CASCADE;
ALTER TABLE "bodacc_depot_comptes" ADD CONSTRAINT "bodacc_depot_comptes_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "cabinet_collaborator_roles" ADD CONSTRAINT "cabinet_collaborator_roles_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "cabinet_lifecycle_warnings" ADD CONSTRAINT "cabinet_lifecycle_warnings_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "cabinet_smtp_config" ADD CONSTRAINT "cabinet_smtp_config_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "changelog_read_status" ADD CONSTRAINT "changelog_read_status_changelog_id_fkey" FOREIGN KEY (changelog_id) REFERENCES changelog_entries(id) ON DELETE CASCADE;
ALTER TABLE "changelog_read_status" ADD CONSTRAINT "changelog_read_status_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
ALTER TABLE "checklist_item_attachments" ADD CONSTRAINT "checklist_item_attachments_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "checklist_item_attachments" ADD CONSTRAINT "checklist_item_attachments_item_id_fkey" FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE;
ALTER TABLE "checklist_item_attachments" ADD CONSTRAINT "checklist_item_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "checklist_item_comments" ADD CONSTRAINT "checklist_item_comments_item_id_fkey" FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE;
ALTER TABLE "checklist_item_comments" ADD CONSTRAINT "checklist_item_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_fkey" FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE;
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_fkey" FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_opportunity_card_id_fkey" FOREIGN KEY (opportunity_card_id) REFERENCES opportunity_cards(id) ON DELETE SET NULL;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "client_ago_avancements" ADD CONSTRAINT "client_ago_avancements_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "client_ago_avancements" ADD CONSTRAINT "client_ago_avancements_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_ago_avancements" ADD CONSTRAINT "client_ago_avancements_status_id_fkey" FOREIGN KEY (status_id) REFERENCES ago_avancement_statuses(id) ON DELETE SET NULL;
ALTER TABLE "client_ago_avancements" ADD CONSTRAINT "client_ago_avancements_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "client_ard_calculations" ADD CONSTRAINT "client_ard_calculations_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "client_ard_calculations" ADD CONSTRAINT "client_ard_calculations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_collaborators" ADD CONSTRAINT "client_collaborators_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_collaborators" ADD CONSTRAINT "client_collaborators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "client_fiscal_tax_types" ADD CONSTRAINT "client_fiscal_tax_types_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "client_fiscal_tax_types" ADD CONSTRAINT "client_fiscal_tax_types_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_fiscal_tax_types" ADD CONSTRAINT "client_fiscal_tax_types_tax_type_id_fkey" FOREIGN KEY (tax_type_id) REFERENCES fiscal_tax_types(id) ON DELETE CASCADE;
ALTER TABLE "client_meeting_notes" ADD CONSTRAINT "client_meeting_notes_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "client_meeting_notes" ADD CONSTRAINT "client_meeting_notes_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_meeting_notes" ADD CONSTRAINT "client_meeting_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "client_software" ADD CONSTRAINT "client_software_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "client_software" ADD CONSTRAINT "client_software_software_id_fkey" FOREIGN KEY (software_id) REFERENCES software(id) ON DELETE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_resume_ia_generated_by_fkey" FOREIGN KEY (resume_ia_generated_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "directory_companies" ADD CONSTRAINT "directory_companies_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "directory_companies" ADD CONSTRAINT "directory_companies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE "directory_contact_companies" ADD CONSTRAINT "directory_contact_companies_company_id_fkey" FOREIGN KEY (company_id) REFERENCES directory_companies(id) ON DELETE CASCADE;
ALTER TABLE "directory_contact_companies" ADD CONSTRAINT "directory_contact_companies_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES directory_contacts(id) ON DELETE CASCADE;
ALTER TABLE "directory_contacts" ADD CONSTRAINT "directory_contacts_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "directory_contacts" ADD CONSTRAINT "directory_contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "email_digests" ADD CONSTRAINT "email_digests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE SET NULL;
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL;
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "fiscal_deadline_cards" ADD CONSTRAINT "fiscal_deadline_cards_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "fiscal_deadline_cards" ADD CONSTRAINT "fiscal_deadline_cards_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "fiscal_deadline_cards" ADD CONSTRAINT "fiscal_deadline_cards_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "fiscal_deadline_cards" ADD CONSTRAINT "fiscal_deadline_cards_column_id_fkey" FOREIGN KEY (column_id) REFERENCES fiscal_deadline_columns(id) ON DELETE CASCADE;
ALTER TABLE "fiscal_deadline_cards" ADD CONSTRAINT "fiscal_deadline_cards_tax_type_id_fkey" FOREIGN KEY (tax_type_id) REFERENCES fiscal_tax_types(id) ON DELETE CASCADE;
ALTER TABLE "fiscal_deadline_columns" ADD CONSTRAINT "fiscal_deadline_columns_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "fiscal_deadline_columns" ADD CONSTRAINT "fiscal_deadline_columns_tax_type_id_fkey" FOREIGN KEY (tax_type_id) REFERENCES fiscal_tax_types(id) ON DELETE CASCADE;
ALTER TABLE "fiscal_tax_types" ADD CONSTRAINT "fiscal_tax_types_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "general_assemblies" ADD CONSTRAINT "general_assemblies_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_template_id_fkey" FOREIGN KEY (template_id) REFERENCES document_templates(id) ON DELETE SET NULL;
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "gov_chat_conversations" ADD CONSTRAINT "gov_chat_conversations_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "gov_chat_conversations" ADD CONSTRAINT "gov_chat_conversations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "gov_chat_messages" ADD CONSTRAINT "gov_chat_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES gov_chat_conversations(id) ON DELETE CASCADE;
ALTER TABLE "gov_chat_rate_limits" ADD CONSTRAINT "gov_chat_rate_limits_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "gov_chat_rate_limits" ADD CONSTRAINT "gov_chat_rate_limits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "habilitations" ADD CONSTRAINT "habilitations_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "habilitations" ADD CONSTRAINT "habilitations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "inpi_search_history" ADD CONSTRAINT "inpi_search_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "inpi_sync_history" ADD CONSTRAINT "inpi_sync_history_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "legal_acts" ADD CONSTRAINT "legal_acts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_related_act_id_fkey" FOREIGN KEY (related_act_id) REFERENCES legal_acts(id) ON DELETE SET NULL;
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_related_assembly_id_fkey" FOREIGN KEY (related_assembly_id) REFERENCES general_assemblies(id) ON DELETE SET NULL;
ALTER TABLE "legal_sync_log" ADD CONSTRAINT "legal_sync_log_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "llm_generations" ADD CONSTRAINT "llm_generations_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "llm_generations" ADD CONSTRAINT "llm_generations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "llm_generations" ADD CONSTRAINT "llm_generations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "llm_prompt_templates" ADD CONSTRAINT "llm_prompt_templates_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "llm_prompt_templates" ADD CONSTRAINT "llm_prompt_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "mcp_api_keys" ADD CONSTRAINT "mcp_api_keys_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_mcp_key_id_fkey" FOREIGN KEY (mcp_key_id) REFERENCES mcp_api_keys(id) ON DELETE CASCADE;
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "mcp_oauth_tokens" ADD CONSTRAINT "mcp_oauth_tokens_mcp_key_id_fkey" FOREIGN KEY (mcp_key_id) REFERENCES mcp_api_keys(id) ON DELETE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "officer_companies" ADD CONSTRAINT "officer_companies_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "officer_companies" ADD CONSTRAINT "officer_companies_legal_act_id_fkey" FOREIGN KEY (legal_act_id) REFERENCES legal_acts(id) ON DELETE SET NULL;
ALTER TABLE "officer_companies" ADD CONSTRAINT "officer_companies_officer_id_fkey" FOREIGN KEY (officer_id) REFERENCES company_officers(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_card_id_fkey" FOREIGN KEY (card_id) REFERENCES opportunity_cards(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_column_id_fkey" FOREIGN KEY (column_id) REFERENCES opportunity_columns(id) ON DELETE CASCADE;
ALTER TABLE "opportunity_cards" ADD CONSTRAINT "opportunity_cards_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "opportunity_columns" ADD CONSTRAINT "opportunity_columns_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_deactivated_by_fkey" FOREIGN KEY (deactivated_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "regimes_fiscaux" ADD CONSTRAINT "regimes_fiscaux_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "relance_history" ADD CONSTRAINT "relance_history_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "relance_history" ADD CONSTRAINT "relance_history_effectuee_par_fkey" FOREIGN KEY (effectuee_par) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "relance_history" ADD CONSTRAINT "relance_history_relance_invoice_id_fkey" FOREIGN KEY (relance_invoice_id) REFERENCES relance_invoices(id) ON DELETE CASCADE;
ALTER TABLE "relance_invoices" ADD CONSTRAINT "relance_invoices_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "relance_invoices" ADD CONSTRAINT "relance_invoices_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declaration_attachments" ADD CONSTRAINT "revenue_declaration_attachments_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declaration_attachments" ADD CONSTRAINT "revenue_declaration_attachments_revenue_declaration_id_fkey" FOREIGN KEY (revenue_declaration_id) REFERENCES revenue_declarations(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declaration_attachments" ADD CONSTRAINT "revenue_declaration_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "revenue_declaration_collaborators" ADD CONSTRAINT "revenue_declaration_collaborators_declaration_id_fkey" FOREIGN KEY (declaration_id) REFERENCES revenue_declarations(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declaration_collaborators" ADD CONSTRAINT "revenue_declaration_collaborators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declarations" ADD CONSTRAINT "revenue_declarations_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "revenue_declarations" ADD CONSTRAINT "revenue_declarations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "revenue_declarations" ADD CONSTRAINT "revenue_declarations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "siren_denominations" ADD CONSTRAINT "siren_denominations_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "software" ADD CONSTRAINT "software_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "sync_settings" ADD CONSTRAINT "sync_settings_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_category_id_fkey" FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_id_fkey" FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE SET NULL;
ALTER TABLE "tax_authorizations" ADD CONSTRAINT "tax_authorizations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "tax_exemption_results" ADD CONSTRAINT "tax_exemption_results_tax_exemption_id_fkey" FOREIGN KEY (tax_exemption_id) REFERENCES tax_exemptions(id) ON DELETE CASCADE;
ALTER TABLE "tax_exemptions" ADD CONSTRAINT "tax_exemptions_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_message_id_fkey" FOREIGN KEY (message_id) REFERENCES ticket_messages(id) ON DELETE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "user_row_orders" ADD CONSTRAINT "user_row_orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "web_directory_categories" ADD CONSTRAINT "web_directory_categories_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "web_directory_default_links" ADD CONSTRAINT "web_directory_default_links_default_category_id_fkey" FOREIGN KEY (default_category_id) REFERENCES web_directory_default_categories(id) ON DELETE CASCADE;
ALTER TABLE "web_directory_links" ADD CONSTRAINT "web_directory_links_cabinet_id_fkey" FOREIGN KEY (cabinet_id) REFERENCES cabinets(id) ON DELETE CASCADE;
ALTER TABLE "web_directory_links" ADD CONSTRAINT "web_directory_links_category_id_fkey" FOREIGN KEY (category_id) REFERENCES web_directory_categories(id) ON DELETE CASCADE;

-- ============ INDEX ============
CREATE INDEX idx_ago_avancement_statuses_cabinet ON public.ago_avancement_statuses USING btree (cabinet_id, "position");
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_balance_sheets_assignee_id ON public.balance_sheets USING btree (assignee_id);
CREATE INDEX idx_balance_sheets_client_id ON public.balance_sheets USING btree (client_id);
CREATE INDEX bilan_cards_cabinet_regime_year_idx ON public.bilan_cards USING btree (cabinet_id, regime_fiscal, year);
CREATE INDEX bilan_cards_column_id_idx ON public.bilan_cards USING btree (column_id);
CREATE INDEX idx_bilan_cards_assignee_id ON public.bilan_cards USING btree (assignee_id);
CREATE INDEX idx_bilan_checklist_attach_cabinet ON public.bilan_checklist_attachments USING btree (cabinet_id);
CREATE INDEX idx_bilan_checklist_attach_item ON public.bilan_checklist_attachments USING btree (checklist_item_id);
CREATE INDEX bilan_checklist_items_card_id_idx ON public.bilan_checklist_items USING btree (card_id);
CREATE INDEX idx_bilan_checklist_items_checked_by ON public.bilan_checklist_items USING btree (checked_by);
CREATE INDEX idx_bilan_checklist_items_template_id ON public.bilan_checklist_items USING btree (template_id);
CREATE UNIQUE INDEX bilan_checklist_templates_cabinet_regime_position_idx ON public.bilan_checklist_templates USING btree (cabinet_id, regime_fiscal, "position");
CREATE UNIQUE INDEX bilan_columns_cabinet_regime_position_idx ON public.bilan_columns USING btree (cabinet_id, regime_fiscal, "position");
CREATE INDEX idx_bilan_das2_entries_card_id ON public.bilan_das2_entries USING btree (card_id);
CREATE UNIQUE INDEX bodacc_depot_comptes_bodacc_id_key ON public.bodacc_depot_comptes USING btree (bodacc_id);
CREATE INDEX bodacc_depot_comptes_client_id_idx ON public.bodacc_depot_comptes USING btree (client_id);
CREATE INDEX idx_cabinet_collaborator_roles_cabinet ON public.cabinet_collaborator_roles USING btree (cabinet_id, "position");
CREATE UNIQUE INDEX idx_cabinet_collaborator_roles_default ON public.cabinet_collaborator_roles USING btree (cabinet_id) WHERE (is_default = true);
CREATE INDEX idx_cabinet_lifecycle_warnings_cabinet ON public.cabinet_lifecycle_warnings USING btree (cabinet_id);
CREATE INDEX idx_cabinets_is_active ON public.cabinets USING btree (is_active);
CREATE INDEX idx_changelog_entries_created_by ON public.changelog_entries USING btree (created_by);
CREATE INDEX idx_changelog_entries_published ON public.changelog_entries USING btree (is_published, published_at DESC);
CREATE INDEX idx_changelog_read_status_changelog_id ON public.changelog_read_status USING btree (changelog_id);
CREATE INDEX idx_changelog_read_status_user_id ON public.changelog_read_status USING btree (user_id);
CREATE INDEX idx_chat_conversations_cabinet_user ON public.chat_conversations USING btree (cabinet_id, user_id);
CREATE INDEX idx_chat_conversations_user_id ON public.chat_conversations USING btree (user_id);
CREATE INDEX idx_chat_messages_conversation_created ON public.chat_messages USING btree (conversation_id, created_at);
CREATE INDEX idx_chat_rate_limits_cabinet_created ON public.chat_rate_limits USING btree (cabinet_id, created_at);
CREATE INDEX idx_chat_rate_limits_user_created ON public.chat_rate_limits USING btree (user_id, created_at);
CREATE INDEX idx_checklist_item_attachments_cabinet ON public.checklist_item_attachments USING btree (cabinet_id);
CREATE INDEX idx_checklist_item_attachments_item ON public.checklist_item_attachments USING btree (item_id);
CREATE INDEX idx_checklist_item_comments_item ON public.checklist_item_comments USING btree (item_id);
CREATE INDEX idx_checklist_item_comments_user ON public.checklist_item_comments USING btree (user_id);
CREATE INDEX idx_checklist_items_checklist_id ON public.checklist_items USING btree (checklist_id);
CREATE INDEX idx_checklist_template_items_template_id ON public.checklist_template_items USING btree (template_id);
CREATE INDEX idx_checklist_templates_cabinet_id ON public.checklist_templates USING btree (cabinet_id);
CREATE INDEX idx_checklist_templates_user_id ON public.checklist_templates USING btree (user_id);
CREATE INDEX idx_checklists_cabinet_id ON public.checklists USING btree (cabinet_id);
CREATE INDEX idx_checklists_client_id ON public.checklists USING btree (client_id);
CREATE INDEX idx_checklists_opportunity_card_id ON public.checklists USING btree (opportunity_card_id);
CREATE INDEX idx_checklists_task_id ON public.checklists USING btree (task_id);
CREATE INDEX idx_checklists_user_id ON public.checklists USING btree (user_id);
CREATE INDEX idx_client_ago_avancements_cabinet ON public.client_ago_avancements USING btree (cabinet_id);
CREATE INDEX idx_client_ard_cabinet_id ON public.client_ard_calculations USING btree (cabinet_id);
CREATE INDEX idx_client_ard_client_id ON public.client_ard_calculations USING btree (client_id);
CREATE INDEX idx_client_collaborators_client_id ON public.client_collaborators USING btree (client_id);
CREATE INDEX idx_client_collaborators_user_id ON public.client_collaborators USING btree (user_id);
CREATE INDEX idx_client_fiscal_tax_types_cabinet_id ON public.client_fiscal_tax_types USING btree (cabinet_id);
CREATE INDEX idx_client_fiscal_tax_types_client_id ON public.client_fiscal_tax_types USING btree (client_id);
CREATE INDEX idx_client_fiscal_tax_types_tax_type_id ON public.client_fiscal_tax_types USING btree (tax_type_id);
CREATE INDEX idx_meeting_notes_cabinet_id ON public.client_meeting_notes USING btree (cabinet_id);
CREATE INDEX idx_meeting_notes_client_date ON public.client_meeting_notes USING btree (client_id, date_rdv DESC);
CREATE INDEX idx_meeting_notes_created_by ON public.client_meeting_notes USING btree (created_by);
CREATE INDEX idx_client_software_client_id ON public.client_software USING btree (client_id);
CREATE INDEX idx_client_software_software_id ON public.client_software USING btree (software_id);
CREATE INDEX idx_clients_cabinet_id ON public.clients USING btree (cabinet_id);
CREATE INDEX idx_clients_resume_ia_generated_by ON public.clients USING btree (resume_ia_generated_by);
CREATE INDEX idx_company_officers_dedup ON public.company_officers USING btree (first_name, last_name, birth_date);
CREATE UNIQUE INDEX idx_company_officers_unique_person ON public.company_officers USING btree (lower(TRIM(BOTH FROM first_name)), lower(TRIM(BOTH FROM last_name)), person_type, COALESCE(birth_date, '1900-01-01'::date));
CREATE INDEX idx_directory_companies_cabinet_id ON public.directory_companies USING btree (cabinet_id);
CREATE INDEX idx_directory_companies_created_by ON public.directory_companies USING btree (created_by);
CREATE INDEX idx_directory_contact_companies_company ON public.directory_contact_companies USING btree (company_id);
CREATE INDEX idx_directory_contact_companies_contact ON public.directory_contact_companies USING btree (contact_id);
CREATE UNIQUE INDEX idx_directory_contact_companies_one_primary ON public.directory_contact_companies USING btree (company_id) WHERE (is_primary_contact = true);
CREATE INDEX idx_directory_contacts_cabinet_id ON public.directory_contacts USING btree (cabinet_id);
CREATE INDEX idx_directory_contacts_created_by ON public.directory_contacts USING btree (created_by);
CREATE INDEX idx_document_templates_cabinet_active_pos ON public.document_templates USING btree (cabinet_id, is_active, "position");
CREATE INDEX idx_document_templates_created_by ON public.document_templates USING btree (created_by);
CREATE INDEX idx_email_queue_cabinet_id ON public.email_queue USING btree (cabinet_id);
CREATE INDEX idx_email_queue_created ON public.email_queue USING btree (created_at);
CREATE INDEX idx_email_queue_notification_id ON public.email_queue USING btree (notification_id);
CREATE INDEX idx_email_queue_status ON public.email_queue USING btree (status) WHERE (status = 'pending'::text);
CREATE INDEX idx_email_queue_user_id ON public.email_queue USING btree (user_id);
CREATE INDEX idx_fiscal_deadline_cards_assignee ON public.fiscal_deadline_cards USING btree (assignee_id);
CREATE INDEX idx_fiscal_deadline_cards_cabinet ON public.fiscal_deadline_cards USING btree (cabinet_id);
CREATE INDEX idx_fiscal_deadline_cards_client_id ON public.fiscal_deadline_cards USING btree (client_id);
CREATE INDEX idx_fiscal_deadline_cards_column ON public.fiscal_deadline_cards USING btree (column_id);
CREATE INDEX idx_fiscal_deadline_cards_tax_type ON public.fiscal_deadline_cards USING btree (tax_type_id);
CREATE INDEX idx_fiscal_deadline_cards_year ON public.fiscal_deadline_cards USING btree (year);
CREATE INDEX idx_fiscal_deadline_columns_cabinet ON public.fiscal_deadline_columns USING btree (cabinet_id);
CREATE INDEX idx_fiscal_deadline_columns_tax_type ON public.fiscal_deadline_columns USING btree (tax_type_id);
CREATE INDEX idx_fiscal_tax_types_cabinet ON public.fiscal_tax_types USING btree (cabinet_id);
CREATE INDEX idx_general_assemblies_client_id ON public.general_assemblies USING btree (client_id);
CREATE INDEX idx_generated_documents_cabinet_created ON public.generated_documents USING btree (cabinet_id, created_at DESC);
CREATE INDEX idx_generated_documents_client_id ON public.generated_documents USING btree (client_id);
CREATE INDEX idx_generated_documents_user_id ON public.generated_documents USING btree (user_id);
CREATE INDEX gov_chat_conversations_cabinet_id_idx ON public.gov_chat_conversations USING btree (cabinet_id);
CREATE INDEX gov_chat_conversations_updated_at_idx ON public.gov_chat_conversations USING btree (updated_at DESC);
CREATE INDEX gov_chat_conversations_user_id_idx ON public.gov_chat_conversations USING btree (user_id);
CREATE INDEX gov_chat_messages_conversation_id_idx ON public.gov_chat_messages USING btree (conversation_id, created_at);
CREATE INDEX gov_chat_rate_limits_cabinet_idx ON public.gov_chat_rate_limits USING btree (cabinet_id, created_at DESC);
CREATE INDEX gov_chat_rate_limits_user_idx ON public.gov_chat_rate_limits USING btree (user_id, created_at DESC);
CREATE INDEX idx_habilitations_cabinet_siren ON public.habilitations USING btree (cabinet_id, siren);
CREATE INDEX idx_habilitations_client_id ON public.habilitations USING btree (client_id);
CREATE INDEX idx_inpi_search_history_user_created ON public.inpi_search_history USING btree (user_id, created_at DESC);
CREATE INDEX idx_inpi_sync_history_client_id ON public.inpi_sync_history USING btree (client_id);
CREATE INDEX idx_inpi_sync_history_sync_date ON public.inpi_sync_history USING btree (sync_date DESC);
CREATE INDEX idx_legal_acts_act_date ON public.legal_acts USING btree (act_date DESC);
CREATE INDEX idx_legal_acts_client_id ON public.legal_acts USING btree (client_id);
CREATE INDEX idx_legal_documents_client_id ON public.legal_documents USING btree (client_id);
CREATE INDEX idx_legal_documents_related_act_id ON public.legal_documents USING btree (related_act_id);
CREATE INDEX idx_legal_documents_related_assembly_id ON public.legal_documents USING btree (related_assembly_id);
CREATE INDEX idx_legal_forms_level ON public.legal_forms USING btree (level);
CREATE INDEX idx_legal_sync_log_cabinet_id ON public.legal_sync_log USING btree (cabinet_id);
CREATE INDEX idx_legal_sync_log_started_at ON public.legal_sync_log USING btree (started_at DESC);
CREATE INDEX idx_llm_generations_cabinet_created ON public.llm_generations USING btree (cabinet_id, created_at DESC);
CREATE INDEX idx_llm_generations_client_id ON public.llm_generations USING btree (client_id) WHERE (client_id IS NOT NULL);
CREATE INDEX idx_llm_generations_user_id ON public.llm_generations USING btree (user_id);
CREATE INDEX idx_llm_prompt_templates_cabinet_active_pos ON public.llm_prompt_templates USING btree (cabinet_id, is_active, "position");
CREATE INDEX idx_llm_prompt_templates_created_by ON public.llm_prompt_templates USING btree (created_by);
CREATE INDEX idx_mcp_api_keys_cabinet_id ON public.mcp_api_keys USING btree (cabinet_id);
CREATE UNIQUE INDEX idx_mcp_oauth_codes_code ON public.mcp_oauth_codes USING btree (code);
CREATE INDEX idx_mcp_oauth_codes_expires_at ON public.mcp_oauth_codes USING btree (expires_at);
CREATE UNIQUE INDEX idx_mcp_oauth_tokens_access_token ON public.mcp_oauth_tokens USING btree (access_token);
CREATE INDEX idx_mcp_oauth_tokens_expires_at ON public.mcp_oauth_tokens USING btree (expires_at);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_officer_companies_client_id ON public.officer_companies USING btree (client_id);
CREATE INDEX idx_officer_companies_legal_act_id ON public.officer_companies USING btree (legal_act_id);
CREATE INDEX idx_opportunity_attachments_cabinet ON public.opportunity_attachments USING btree (cabinet_id);
CREATE INDEX idx_opportunity_attachments_card ON public.opportunity_attachments USING btree (card_id);
CREATE INDEX idx_opportunity_cards_created_by ON public.opportunity_cards USING btree (created_by);
CREATE INDEX opportunity_cards_assignee_id_idx ON public.opportunity_cards USING btree (assignee_id);
CREATE INDEX opportunity_cards_cabinet_column_idx ON public.opportunity_cards USING btree (cabinet_id, column_id, "position");
CREATE INDEX opportunity_cards_client_id_idx ON public.opportunity_cards USING btree (client_id);
CREATE INDEX opportunity_cards_column_id_idx ON public.opportunity_cards USING btree (column_id);
CREATE UNIQUE INDEX opportunity_columns_cabinet_name_uniq ON public.opportunity_columns USING btree (cabinet_id, name);
CREATE INDEX opportunity_columns_cabinet_position_idx ON public.opportunity_columns USING btree (cabinet_id, "position");
CREATE INDEX idx_profiles_cabinet_id ON public.profiles USING btree (cabinet_id);
CREATE INDEX idx_profiles_deactivated_by ON public.profiles USING btree (deactivated_by);
CREATE INDEX idx_regimes_fiscaux_cabinet_active ON public.regimes_fiscaux USING btree (cabinet_id, is_active);
CREATE INDEX idx_regimes_fiscaux_cabinet_id ON public.regimes_fiscaux USING btree (cabinet_id);
CREATE INDEX idx_relance_history_cabinet_id ON public.relance_history USING btree (cabinet_id);
CREATE INDEX idx_relance_history_invoice_id ON public.relance_history USING btree (relance_invoice_id);
CREATE INDEX idx_relance_invoices_cabinet_id ON public.relance_invoices USING btree (cabinet_id);
CREATE INDEX idx_relance_invoices_client_id ON public.relance_invoices USING btree (client_id);
CREATE INDEX idx_relance_invoices_statut ON public.relance_invoices USING btree (statut);
CREATE INDEX idx_rev_decl_attach_cabinet ON public.revenue_declaration_attachments USING btree (cabinet_id);
CREATE INDEX idx_rev_decl_attach_declaration ON public.revenue_declaration_attachments USING btree (revenue_declaration_id);
CREATE INDEX idx_rev_decl_attach_uploaded_by ON public.revenue_declaration_attachments USING btree (uploaded_by);
CREATE INDEX idx_rev_decl_collabs_declaration ON public.revenue_declaration_collaborators USING btree (declaration_id);
CREATE INDEX idx_rev_decl_collabs_user ON public.revenue_declaration_collaborators USING btree (user_id);
CREATE INDEX idx_revenue_declaration_deadlines_annee ON public.revenue_declaration_deadlines USING btree (annee);
CREATE INDEX idx_revenue_declarations_cabinet ON public.revenue_declarations USING btree (cabinet_id);
CREATE INDEX idx_revenue_declarations_cabinet_annee ON public.revenue_declarations USING btree (cabinet_id, annee);
CREATE INDEX idx_revenue_declarations_client ON public.revenue_declarations USING btree (client_id);
CREATE INDEX idx_revenue_declarations_created_by ON public.revenue_declarations USING btree (created_by);
CREATE INDEX idx_revenue_declarations_statut ON public.revenue_declarations USING btree (cabinet_id, statut);
CREATE INDEX idx_siren_denominations_cabinet_id ON public.siren_denominations USING btree (cabinet_id);
CREATE INDEX idx_software_cabinet_id ON public.software USING btree (cabinet_id);
CREATE INDEX idx_support_tickets_cabinet_status ON public.support_tickets USING btree (cabinet_id, status);
CREATE INDEX idx_support_tickets_user_id ON public.support_tickets USING btree (user_id);
CREATE INDEX idx_sync_jobs_cabinet_status ON public.sync_jobs USING btree (cabinet_id, status);
CREATE INDEX idx_sync_jobs_created_at ON public.sync_jobs USING btree (created_at DESC);
CREATE INDEX idx_sync_jobs_user_id ON public.sync_jobs USING btree (user_id);
CREATE INDEX idx_task_attachments_cabinet ON public.task_attachments USING btree (cabinet_id);
CREATE INDEX idx_task_attachments_task ON public.task_attachments USING btree (task_id);
CREATE INDEX idx_task_categories_cabinet_id ON public.task_categories USING btree (cabinet_id);
CREATE INDEX idx_task_comments_task_id ON public.task_comments USING btree (task_id);
CREATE INDEX idx_task_comments_user_id ON public.task_comments USING btree (user_id);
CREATE INDEX idx_task_templates_cabinet_id ON public.task_templates USING btree (cabinet_id);
CREATE INDEX idx_task_templates_category_id ON public.task_templates USING btree (category_id);
CREATE INDEX idx_tasks_assignee_id ON public.tasks USING btree (assignee_id);
CREATE INDEX idx_tasks_cabinet_archived ON public.tasks USING btree (cabinet_id, is_archived);
CREATE INDEX idx_tasks_cabinet_id ON public.tasks USING btree (cabinet_id);
CREATE INDEX idx_tasks_category_id ON public.tasks USING btree (category_id);
CREATE INDEX idx_tasks_client_id ON public.tasks USING btree (client_id);
CREATE INDEX idx_tasks_created_by ON public.tasks USING btree (created_by);
CREATE INDEX idx_tasks_template_id ON public.tasks USING btree (template_id);
CREATE INDEX idx_tax_authorizations_client_id ON public.tax_authorizations USING btree (client_id);
CREATE UNIQUE INDEX idx_tax_exemption_results_unique ON public.tax_exemption_results USING btree (tax_exemption_id, calendar_year);
CREATE INDEX idx_tax_exemptions_client_id ON public.tax_exemptions USING btree (client_id);
CREATE INDEX idx_ticket_attachments_message_id ON public.ticket_attachments USING btree (message_id);
CREATE INDEX idx_ticket_messages_sender_id ON public.ticket_messages USING btree (sender_id);
CREATE INDEX idx_ticket_messages_ticket ON public.ticket_messages USING btree (ticket_id);
CREATE INDEX idx_user_row_orders_user_context ON public.user_row_orders USING btree (user_id, context);
CREATE INDEX idx_web_directory_categories_cabinet ON public.web_directory_categories USING btree (cabinet_id);
CREATE INDEX idx_web_directory_default_links_category ON public.web_directory_default_links USING btree (default_category_id);
CREATE INDEX idx_web_directory_links_cabinet_id ON public.web_directory_links USING btree (cabinet_id);
CREATE INDEX idx_web_directory_links_category ON public.web_directory_links USING btree (category_id);

-- ============ FONCTIONS ============

CREATE OR REPLACE FUNCTION public.admin_reassign_user_cabinet(target_user_id uuid, new_cabinet_id uuid, new_role text DEFAULT 'user'::text, new_prenom text DEFAULT NULL::text, new_nom text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
v_caller_role text;
v_target_role text;
v_cabinet_exists boolean;
v_db_role text;
BEGIN
v_db_role := current_user;
IF v_db_role NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
v_caller_role := (auth.jwt() -> 'app_metadata' ->> 'role');
IF v_caller_role <> 'super_admin' THEN
RETURN jsonb_build_object('error', 'forbidden', 'message', 'Only super_admin can reassign users');
END IF;
END IF;

IF new_role NOT IN ('admin', 'user') THEN
RETURN jsonb_build_object('error', 'invalid_role', 'message', 'Role must be admin or user');
END IF;

SELECT role INTO v_target_role FROM public.profiles WHERE id = target_user_id;
IF v_target_role IS NULL THEN
RETURN jsonb_build_object('error', 'user_not_found');
END IF;
IF v_target_role = 'super_admin' THEN
RETURN jsonb_build_object('error', 'forbidden', 'message', 'Cannot reassign a super_admin');
END IF;

SELECT EXISTS (SELECT 1 FROM public.cabinets WHERE id = new_cabinet_id) INTO v_cabinet_exists;
IF NOT v_cabinet_exists THEN
RETURN jsonb_build_object('error', 'cabinet_not_found');
END IF;

UPDATE public.profiles
SET
cabinet_id = new_cabinet_id,
role = new_role,
prenom = COALESCE(new_prenom, prenom),
nom = COALESCE(new_nom, nom),
is_active = true,
deactivated_at = NULL,
deactivated_by = NULL,
updated_at = now()
WHERE id = target_user_id;

UPDATE auth.users
SET
raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', new_role, 'cabinet_id', new_cabinet_id),
raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', new_role, 'cabinet_id', new_cabinet_id)
WHERE id = target_user_id;

RETURN jsonb_build_object('status', 'success', 'cabinet_id', new_cabinet_id, 'role', new_role);
END;
$function$
;

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

CREATE OR REPLACE FUNCTION public.build_cabinet_warning_email_html(p_cabinet_name text, p_warning_type text, p_days_remaining integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
header_color text;
header_label text;
title_text text;
body_text text;
action_text text;
login_url text := 'https://crmcabinet.com/login';
BEGIN
IF p_warning_type = 'deletion' THEN
header_color := '#dc2626';
header_label := 'AVERTISSEMENT - SUPPRESSION IMMINENTE';
title_text := 'Votre cabinet sera supprime dans ' || p_days_remaining || ' jour(s)';
body_text := 'Le cabinet <strong>' || p_cabinet_name || '</strong> n''a jamais ete utilise depuis sa creation. '
|| 'Sans connexion dans les <strong>' || p_days_remaining || ' prochains jours</strong>, '
|| 'le cabinet et toutes ses donnees seront definitivement supprimes.';
action_text := 'Se connecter maintenant';
ELSE
header_color := '#d97706';
header_label := 'AVERTISSEMENT - DESACTIVATION IMMINENTE';
title_text := 'Votre cabinet sera desactive dans ' || p_days_remaining || ' jour(s)';
body_text := 'Le cabinet <strong>' || p_cabinet_name || '</strong> n''a pas eu de connexion depuis plus de 83 jours. '
|| 'Sans connexion dans les <strong>' || p_days_remaining || ' prochains jours</strong>, '
|| 'le cabinet sera automatiquement desactive et ses utilisateurs ne pourront plus se connecter.';
action_text := 'Se connecter pour eviter la desactivation';
END IF;

RETURN '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
|| '<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">'
|| '<tr><td align="center">'
|| '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">'
|| '<tr><td style="background-color:#111827;padding:16px 32px;text-align:center;">'
|| '<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">CRM CABINET</span>'
|| '</td></tr>'
|| '<tr><td style="background-color:' || header_color || ';padding:14px 32px;">'
|| '<span style="color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">' || header_label || '</span>'
|| '</td></tr>'
|| '<tr><td style="padding:32px;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
|| '<tr><td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:16px;">' || title_text || '</td></tr>'
|| '<tr><td style="font-size:15px;color:#4b5563;line-height:1.6;padding-bottom:24px;">' || body_text || '</td></tr>'
|| '<tr><td style="padding:16px;background-color:#fef3c7;border-radius:8px;border-left:4px solid ' || header_color || ';margin-bottom:24px;">'
|| '<span style="font-size:14px;color:#92400e;font-weight:600;">Action requise : Connectez-vous a votre espace pour maintenir votre cabinet actif.</span>'
|| '</td></tr>'
|| '<tr><td style="padding:24px 0 0 0;text-align:center;">'
|| '<a href="' || login_url || '" style="display:inline-block;padding:14px 32px;background-color:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">' || action_text || '</a>'
|| '</td></tr>'
|| '</table></td></tr>'
|| '<tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">'
|| '<span style="font-size:12px;color:#9ca3af;">CRM CABINET - Cet email a ete envoye automatiquement.</span>'
|| '</td></tr></table>'
|| '</td></tr></table></body></html>';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.build_notification_email_html(p_type text, p_title text, p_message text, p_link text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
type_label text;
type_color text;
btn_html text := '';
BEGIN
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

IF p_link IS NOT NULL THEN
btn_html := '<tr><td style="padding:24px 0 0 0;"><a href="' || p_link || '" style="display:inline-block;padding:12px 28px;background-color:' || type_color || ';color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Voir le detail</a></td></tr>';
END IF;

RETURN '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
|| '<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">'
|| '<tr><td align="center">'
|| '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">'
|| '<tr><td style="background-color:' || type_color || ';padding:20px 32px;"><span style="color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">' || type_label || '</span></td></tr>'
|| '<tr><td style="padding:32px;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
|| '<tr><td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:12px;">' || p_title || '</td></tr>'
|| '<tr><td style="font-size:15px;color:#4b5563;line-height:1.6;">' || p_message || '</td></tr>'
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

CREATE OR REPLACE FUNCTION public.complete_signup(cabinet_name text, user_prenom text, user_nom text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_user_id uuid;
v_existing_cabinet_id uuid;
v_new_cabinet_id uuid;
BEGIN
v_user_id := auth.uid();

IF v_user_id IS NULL THEN
RAISE EXCEPTION 'Not authenticated';
END IF;

SELECT cabinet_id INTO v_existing_cabinet_id
FROM profiles
WHERE id = v_user_id;

IF v_existing_cabinet_id IS NOT NULL THEN
RAISE EXCEPTION 'User already belongs to a cabinet';
END IF;

INSERT INTO cabinets (nom)
VALUES (cabinet_name)
RETURNING id INTO v_new_cabinet_id;

UPDATE profiles
SET
cabinet_id = v_new_cabinet_id,
role = 'admin',
prenom = user_prenom,
nom = user_nom,
updated_at = now()
WHERE id = v_user_id;

UPDATE auth.users
SET
raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', 'admin', 'cabinet_id', v_new_cabinet_id),
raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', 'admin', 'cabinet_id', v_new_cabinet_id, 'prenom', user_prenom, 'nom', user_nom)
WHERE id = v_user_id;

RETURN json_build_object('id', v_new_cabinet_id, 'nom', cabinet_name);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_link text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_notification_id uuid;
v_caller_cabinet uuid;
v_target_cabinet uuid;
BEGIN
SELECT cabinet_id INTO v_caller_cabinet
FROM public.profiles
WHERE id = auth.uid();

IF v_caller_cabinet IS NULL THEN
RAISE EXCEPTION 'Unauthorized: caller has no cabinet';
END IF;

SELECT cabinet_id INTO v_target_cabinet
FROM public.profiles
WHERE id = p_user_id;

IF v_target_cabinet IS NULL OR v_target_cabinet != v_caller_cabinet THEN
IF NOT (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin') THEN
RAISE EXCEPTION 'Unauthorized: cannot notify user outside your cabinet';
END IF;
END IF;

INSERT INTO public.notifications (user_id, type, title, message, link)
VALUES (p_user_id, p_type, p_title, p_message, p_link)
RETURNING id INTO v_notification_id;

RETURN v_notification_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_profile_exists()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
v_user_id uuid;
v_email text;
v_cabinet_name text;
v_prenom text;
v_nom text;
v_cabinet_id uuid;
v_profile_exists boolean;
BEGIN
v_user_id := auth.uid();
IF v_user_id IS NULL THEN
RETURN jsonb_build_object('error', 'not_authenticated');
END IF;

SELECT EXISTS (
SELECT 1 FROM public.profiles WHERE id = v_user_id
) INTO v_profile_exists;

IF v_profile_exists THEN
RETURN jsonb_build_object('status', 'already_exists');
END IF;

SELECT
email,
raw_user_meta_data->>'cabinet_name',
raw_user_meta_data->>'prenom',
raw_user_meta_data->>'nom'
INTO v_email, v_cabinet_name, v_prenom, v_nom
FROM auth.users
WHERE id = v_user_id;

IF v_email IS NULL THEN
RETURN jsonb_build_object('error', 'user_not_found');
END IF;

IF v_cabinet_name IS NULL OR v_cabinet_name = '' THEN
RETURN jsonb_build_object('error', 'missing_cabinet_name');
END IF;

INSERT INTO public.cabinets (nom)
VALUES (v_cabinet_name)
RETURNING id INTO v_cabinet_id;

INSERT INTO public.profiles (id, email, cabinet_id, role, prenom, nom, created_at)
VALUES (v_user_id, v_email, v_cabinet_id, 'admin', COALESCE(v_prenom, ''), COALESCE(v_nom, ''), now());

UPDATE auth.users
SET
raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', 'admin', 'cabinet_id', v_cabinet_id),
raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', 'admin', 'cabinet_id', v_cabinet_id)
WHERE id = v_user_id;

RETURN jsonb_build_object('status', 'created', 'cabinet_id', v_cabinet_id);

EXCEPTION WHEN OTHERS THEN
RETURN jsonb_build_object('error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_profile_exists_for(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
v_email text;
v_cabinet_name text;
v_prenom text;
v_nom text;
v_cabinet_id uuid;
v_profile_exists boolean;
BEGIN
IF target_user_id IS NULL THEN
RETURN jsonb_build_object('error', 'missing_user_id');
END IF;

SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id)
INTO v_profile_exists;

IF v_profile_exists THEN
RETURN jsonb_build_object('status', 'already_exists');
END IF;

SELECT
email,
raw_user_meta_data->>'cabinet_name',
raw_user_meta_data->>'prenom',
raw_user_meta_data->>'nom'
INTO v_email, v_cabinet_name, v_prenom, v_nom
FROM auth.users
WHERE id = target_user_id;

IF v_email IS NULL THEN
RETURN jsonb_build_object('error', 'user_not_found');
END IF;

IF v_cabinet_name IS NULL OR v_cabinet_name = '' THEN
RETURN jsonb_build_object('error', 'missing_cabinet_name');
END IF;

INSERT INTO public.cabinets (nom)
VALUES (v_cabinet_name)
RETURNING id INTO v_cabinet_id;

INSERT INTO public.profiles (id, email, cabinet_id, role, prenom, nom, created_at)
VALUES (target_user_id, v_email, v_cabinet_id, 'admin', COALESCE(v_prenom, ''), COALESCE(v_nom, ''), now());

UPDATE auth.users
SET
raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', 'admin', 'cabinet_id', v_cabinet_id),
raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', 'admin', 'cabinet_id', v_cabinet_id)
WHERE id = target_user_id;

RETURN jsonb_build_object('status', 'created', 'cabinet_id', v_cabinet_id);

EXCEPTION WHEN OTHERS THEN
RETURN jsonb_build_object('error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cabinets_last_sign_in()
 RETURNS TABLE(cabinet_id uuid, last_sign_in_at timestamp with time zone, last_user_name text, last_user_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
RETURN;
END IF;
END IF;

RETURN QUERY
SELECT DISTINCT ON (p.cabinet_id)
p.cabinet_id,
au.last_sign_in_at,
concat_ws(' ', p.prenom, p.nom) AS last_user_name,
au.email::text AS last_user_email
FROM auth.users au
JOIN public.profiles p ON p.id = au.id
WHERE p.cabinet_id IS NOT NULL
AND au.last_sign_in_at IS NOT NULL
ORDER BY p.cabinet_id, au.last_sign_in_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_cabinet_id uuid, p_user_id uuid)
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
-- Verify the caller is the user they claim to be
IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
RETURN '{}'::jsonb;
END IF;

-- Verify the user belongs to this cabinet
IF NOT EXISTS (
SELECT 1 FROM profiles WHERE id = p_user_id AND cabinet_id = p_cabinet_id
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
FROM clients WHERE cabinet_id = p_cabinet_id;

-- Tasks assigned to user (not done, not archived)
SELECT COUNT(*) INTO v_tasks_en_cours
FROM tasks
WHERE cabinet_id = p_cabinet_id
AND assignee_id = p_user_id
AND is_archived = false
AND statut != 'done';

-- Overdue tasks
SELECT COUNT(*) INTO v_overdue_tasks
FROM tasks
WHERE cabinet_id = p_cabinet_id
AND is_archived = false
AND statut != 'done'
AND date_echeance IS NOT NULL
AND date_echeance < CURRENT_DATE;

-- Habilitations actives
SELECT COUNT(*) INTO v_habilitations_actives
FROM habilitations
WHERE cabinet_id = p_cabinet_id
AND (etat = 'Actif' OR etat = 'actif');

-- Assemblees planifiees
SELECT COUNT(*) INTO v_assemblees_planifiees
FROM general_assemblies ga
JOIN clients c ON c.id = ga.client_id
WHERE c.cabinet_id = p_cabinet_id
AND ga.statut IN ('planifiee', 'en_cours');

-- Opportunites
SELECT COUNT(*) INTO v_opportunites
FROM opportunity_cards
WHERE cabinet_id = p_cabinet_id;

-- Clients without SIRET
SELECT COUNT(*) INTO v_no_siret
FROM clients
WHERE cabinet_id = p_cabinet_id
AND statut = 'actif'
AND (siret IS NULL OR siret = '')
AND (siren IS NULL OR siren = '');

-- Clients without cloture
SELECT COUNT(*) INTO v_no_cloture
FROM clients
WHERE cabinet_id = p_cabinet_id
AND statut = 'actif'
AND (date_cloture_exercice_social IS NULL OR date_cloture_exercice_social = '');

-- Legal acts in last 30 days
SELECT COUNT(*) INTO v_legal_recent
FROM legal_acts la
JOIN clients c ON c.id = la.client_id
WHERE c.cabinet_id = p_cabinet_id
AND la.created_at >= NOW() - INTERVAL '30 days';

-- Top 5 cities
SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_top_cities
FROM (
SELECT
UPPER(TRIM(
CASE
WHEN adresse ~ ',\s*\d{5}\s+(.+)$' THEN regexp_replace(adresse, '.*,\s*\d{5}\s+', '')
WHEN adresse ~ '\d{5}\s+(.+)$' THEN regexp_replace(adresse, '.*\d{5}\s+', '')
ELSE NULL
END
)) AS city,
COUNT(*) AS count
FROM clients
WHERE cabinet_id = p_cabinet_id
AND statut != 'archive'
AND adresse IS NOT NULL
GROUP BY 1
HAVING UPPER(TRIM(
CASE
WHEN adresse ~ ',\s*\d{5}\s+(.+)$' THEN regexp_replace(adresse, '.*,\s*\d{5}\s+', '')
WHEN adresse ~ '\d{5}\s+(.+)$' THEN regexp_replace(adresse, '.*\d{5}\s+', '')
ELSE NULL
END
)) IS NOT NULL
ORDER BY count DESC
LIMIT 5
) t;

-- Regime fiscal counts
SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_regime_counts
FROM (
SELECT regime_fiscal AS regime, COUNT(*) AS count
FROM clients
WHERE cabinet_id = p_cabinet_id AND statut = 'actif' AND regime_fiscal IS NOT NULL AND regime_fiscal != ''
GROUP BY regime_fiscal
ORDER BY count DESC
) t;

-- Forme juridique counts
SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_forme_counts
FROM (
SELECT forme_juridique AS forme, COUNT(*) AS count
FROM clients
WHERE cabinet_id = p_cabinet_id AND statut = 'actif' AND forme_juridique IS NOT NULL AND forme_juridique != ''
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

CREATE OR REPLACE FUNCTION public.get_unanswered_ticket_count(p_cabinet_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
result integer;
v_user_cabinet_id uuid;
BEGIN
IF auth.uid() IS NULL THEN
RAISE EXCEPTION 'Authentication required';
END IF;

IF NOT public.is_super_admin() THEN
SELECT cabinet_id INTO v_user_cabinet_id
FROM profiles WHERE id = auth.uid();

IF p_cabinet_id IS NOT NULL AND p_cabinet_id != v_user_cabinet_id THEN
RAISE EXCEPTION 'Access denied: cannot access other cabinet tickets';
END IF;
p_cabinet_id := v_user_cabinet_id;
END IF;

SELECT count(*)::integer INTO result
FROM support_tickets t
WHERE t.status != 'ferme'
AND (p_cabinet_id IS NULL OR t.cabinet_id = p_cabinet_id)
AND NOT EXISTS (
SELECT 1 FROM ticket_messages m
WHERE m.ticket_id = t.id
AND m.sender_id != t.user_id
AND m.is_internal = false
);

RETURN COALESCE(result, 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_cabinet_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
SELECT COALESCE(
(auth.jwt() -> 'app_metadata' ->> 'cabinet_id')::uuid,
(auth.jwt() -> 'user_metadata' ->> 'cabinet_id')::uuid
);
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
SELECT COALESCE(
auth.jwt() -> 'app_metadata' ->> 'role',
auth.jwt() -> 'user_metadata' ->> 'role'
);
$function$
;

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

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
v_cabinet_name text;
v_cabinet_id uuid;
v_prenom text;
v_nom text;
v_role text;
BEGIN
v_cabinet_id := (new.raw_user_meta_data->>'cabinet_id')::uuid;
v_cabinet_name := new.raw_user_meta_data->>'cabinet_name';
v_prenom := new.raw_user_meta_data->>'prenom';
v_nom := new.raw_user_meta_data->>'nom';
v_role := COALESCE(new.raw_user_meta_data->>'role', 'user');

IF v_cabinet_id IS NOT NULL THEN
INSERT INTO public.profiles (id, email, cabinet_id, role, prenom, nom, created_at)
VALUES (
new.id,
new.email,
v_cabinet_id,
v_role,
COALESCE(v_prenom, ''),
COALESCE(v_nom, ''),
now()
);

UPDATE auth.users
SET
raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', v_role, 'cabinet_id', v_cabinet_id),
raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', v_role, 'cabinet_id', v_cabinet_id)
WHERE id = new.id;

ELSIF v_cabinet_name IS NOT NULL AND v_cabinet_name <> '' THEN
INSERT INTO public.cabinets (nom)
VALUES (v_cabinet_name)
RETURNING id INTO v_cabinet_id;

INSERT INTO public.profiles (id, email, cabinet_id, role, prenom, nom, created_at)
VALUES (new.id, new.email, v_cabinet_id, 'admin', COALESCE(v_prenom, ''), COALESCE(v_nom, ''), now());

UPDATE auth.users
SET
raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', 'admin', 'cabinet_id', v_cabinet_id),
raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object('role', 'admin', 'cabinet_id', v_cabinet_id)
WHERE id = new.id;

ELSE
INSERT INTO public.profiles (id, email, created_at)
VALUES (new.id, new.email, now())
ON CONFLICT (id) DO NOTHING;
END IF;

RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_bilan_defaults(p_cabinet_id uuid, p_regime text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
v_col_count integer;
v_tpl_count integer;
v_caller_cabinet uuid;
BEGIN
SELECT cabinet_id INTO v_caller_cabinet
FROM profiles WHERE id = auth.uid();

IF v_caller_cabinet != p_cabinet_id THEN
IF NOT (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin') THEN
RAISE EXCEPTION 'Unauthorized: can only initialize defaults for your own cabinet';
END IF;
END IF;

SELECT count(*) INTO v_col_count
FROM bilan_columns
WHERE cabinet_id = p_cabinet_id AND regime_fiscal = p_regime;

IF v_col_count = 0 THEN
INSERT INTO bilan_columns (cabinet_id, regime_fiscal, name, color, position) VALUES
(p_cabinet_id, p_regime, 'A préparer', 'gray', 0),
(p_cabinet_id, p_regime, 'En cours', 'blue', 1),
(p_cabinet_id, p_regime, 'En révision', 'amber', 2),
(p_cabinet_id, p_regime, 'Terminé', 'green', 3);
END IF;

SELECT count(*) INTO v_tpl_count
FROM bilan_checklist_templates
WHERE cabinet_id = p_cabinet_id AND regime_fiscal = p_regime;

IF v_tpl_count = 0 THEN
IF p_regime = 'BIC' THEN
INSERT INTO bilan_checklist_templates (cabinet_id, regime_fiscal, name, position) VALUES
(p_cabinet_id, p_regime, 'Rapprochement bancaire', 0),
(p_cabinet_id, p_regime, 'Contrôle TVA', 1),
(p_cabinet_id, p_regime, 'Révision des comptes', 2),
(p_cabinet_id, p_regime, 'Liasse fiscale', 3),
(p_cabinet_id, p_regime, 'PV AG', 4);
ELSIF p_regime = 'BNC' THEN
INSERT INTO bilan_checklist_templates (cabinet_id, regime_fiscal, name, position) VALUES
(p_cabinet_id, p_regime, 'Rapprochement bancaire', 0),
(p_cabinet_id, p_regime, 'Contrôle recettes/dépenses', 1),
(p_cabinet_id, p_regime, 'Déclaration 2035', 2),
(p_cabinet_id, p_regime, 'AGA / Visa fiscal', 3);
ELSIF p_regime = 'BA' THEN
INSERT INTO bilan_checklist_templates (cabinet_id, regime_fiscal, name, position) VALUES
(p_cabinet_id, p_regime, 'Rapprochement bancaire', 0),
(p_cabinet_id, p_regime, 'Contrôle stocks', 1),
(p_cabinet_id, p_regime, 'Révision des comptes', 2),
(p_cabinet_id, p_regime, 'Liasse fiscale BA', 3);
ELSIF p_regime = 'SCI' THEN
INSERT INTO bilan_checklist_templates (cabinet_id, regime_fiscal, name, position) VALUES
(p_cabinet_id, p_regime, 'Rapprochement bancaire', 0),
(p_cabinet_id, p_regime, 'Contrôle loyers', 1),
(p_cabinet_id, p_regime, 'Déclaration 2072', 2),
(p_cabinet_id, p_regime, 'PV AG', 3);
ELSIF p_regime = 'LMNP' THEN
INSERT INTO bilan_checklist_templates (cabinet_id, regime_fiscal, name, position) VALUES
(p_cabinet_id, p_regime, 'Rapprochement bancaire', 0),
(p_cabinet_id, p_regime, 'Contrôle loyers', 1),
(p_cabinet_id, p_regime, 'Amortissements', 2),
(p_cabinet_id, p_regime, 'Liasse fiscale', 3);
END IF;
END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_fiscal_defaults(p_cabinet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
v_type_id uuid;
v_has_types boolean;
v_user_cabinet_id uuid;
BEGIN
IF auth.uid() IS NULL THEN
RAISE EXCEPTION 'Authentication required';
END IF;

SELECT cabinet_id INTO v_user_cabinet_id
FROM profiles WHERE id = auth.uid();

IF v_user_cabinet_id != p_cabinet_id AND NOT public.is_super_admin() THEN
RAISE EXCEPTION 'Access denied: cannot initialize defaults for another cabinet';
END IF;

SELECT EXISTS (
SELECT 1 FROM fiscal_tax_types WHERE cabinet_id = p_cabinet_id
) INTO v_has_types;

IF v_has_types THEN
RETURN;
END IF;

INSERT INTO fiscal_tax_types (cabinet_id, code, label, description, periodicite, jour_echeance, mois_echeances, couleur, position)
VALUES (p_cabinet_id, 'TVA_M', 'TVA Mensuelle', 'Taxe sur la valeur ajoutee - declaration mensuelle', 'mensuelle', 15, '{1,2,3,4,5,6,7,8,9,10,11,12}', 'blue', 0)
RETURNING id INTO v_type_id;
INSERT INTO fiscal_deadline_columns (cabinet_id, tax_type_id, name, color, position) VALUES
(p_cabinet_id, v_type_id, 'A traiter', 'gray', 0),
(p_cabinet_id, v_type_id, 'En cours', 'blue', 1),
(p_cabinet_id, v_type_id, 'Depose', 'amber', 2),
(p_cabinet_id, v_type_id, 'Valide', 'green', 3);

INSERT INTO fiscal_tax_types (cabinet_id, code, label, description, periodicite, jour_echeance, mois_echeances, couleur, position)
VALUES (p_cabinet_id, 'TVA_T', 'TVA Trimestrielle', 'Taxe sur la valeur ajoutee - declaration trimestrielle', 'trimestrielle', 15, '{1,4,7,10}', 'teal', 1)
RETURNING id INTO v_type_id;
INSERT INTO fiscal_deadline_columns (cabinet_id, tax_type_id, name, color, position) VALUES
(p_cabinet_id, v_type_id, 'A traiter', 'gray', 0),
(p_cabinet_id, v_type_id, 'En cours', 'blue', 1),
(p_cabinet_id, v_type_id, 'Depose', 'amber', 2),
(p_cabinet_id, v_type_id, 'Valide', 'green', 3);

INSERT INTO fiscal_tax_types (cabinet_id, code, label, description, periodicite, jour_echeance, mois_echeances, couleur, position)
VALUES (p_cabinet_id, 'IS', 'Impot sur les Societes', 'Declaration annuelle IS', 'annuelle', 15, '{5}', 'red', 2)
RETURNING id INTO v_type_id;
INSERT INTO fiscal_deadline_columns (cabinet_id, tax_type_id, name, color, position) VALUES
(p_cabinet_id, v_type_id, 'A traiter', 'gray', 0),
(p_cabinet_id, v_type_id, 'En cours', 'blue', 1),
(p_cabinet_id, v_type_id, 'Depose', 'amber', 2),
(p_cabinet_id, v_type_id, 'Valide', 'green', 3);

INSERT INTO fiscal_tax_types (cabinet_id, code, label, description, periodicite, jour_echeance, mois_echeances, couleur, position)
VALUES (p_cabinet_id, 'IS_AC', 'IS - Acomptes', 'Acomptes trimestriels IS', 'trimestrielle', 15, '{3,6,9,12}', 'amber', 3)
RETURNING id INTO v_type_id;
INSERT INTO fiscal_deadline_columns (cabinet_id, tax_type_id, name, color, position) VALUES
(p_cabinet_id, v_type_id, 'A traiter', 'gray', 0),
(p_cabinet_id, v_type_id, 'En cours', 'blue', 1),
(p_cabinet_id, v_type_id, 'Depose', 'amber', 2),
(p_cabinet_id, v_type_id, 'Valide', 'green', 3);

INSERT INTO fiscal_tax_types (cabinet_id, code, label, description, periodicite, jour_echeance, mois_echeances, couleur, position)
VALUES (p_cabinet_id, 'CFE', 'CFE', 'Cotisation Fonciere des Entreprises', 'annuelle', 15, '{12}', 'green', 4)
RETURNING id INTO v_type_id;
INSERT INTO fiscal_deadline_columns (cabinet_id, tax_type_id, name, color, position) VALUES
(p_cabinet_id, v_type_id, 'A traiter', 'gray', 0),
(p_cabinet_id, v_type_id, 'En cours', 'blue', 1),
(p_cabinet_id, v_type_id, 'Depose', 'amber', 2),
(p_cabinet_id, v_type_id, 'Valide', 'green', 3);

INSERT INTO fiscal_tax_types (cabinet_id, code, label, description, periodicite, jour_echeance, mois_echeances, couleur, position)
VALUES (p_cabinet_id, 'CVAE', 'CVAE', 'Cotisation sur la Valeur Ajoutee des Entreprises', 'annuelle', 1, '{5}', 'teal', 5)
RETURNING id INTO v_type_id;
INSERT INTO fiscal_deadline_columns (cabinet_id, tax_type_id, name, color, position) VALUES
(p_cabinet_id, v_type_id, 'A traiter', 'gray', 0),
(p_cabinet_id, v_type_id, 'En cours', 'blue', 1),
(p_cabinet_id, v_type_id, 'Depose', 'amber', 2),
(p_cabinet_id, v_type_id, 'Valide', 'green', 3);

INSERT INTO fiscal_tax_types (cabinet_id, code, label, description, periodicite, jour_echeance, mois_echeances, couleur, position)
VALUES (p_cabinet_id, 'TS', 'Taxe sur les salaires', 'Taxe sur les salaires - declaration mensuelle', 'mensuelle', 15, '{1,2,3,4,5,6,7,8,9,10,11,12}', 'gray', 6)
RETURNING id INTO v_type_id;
INSERT INTO fiscal_deadline_columns (cabinet_id, tax_type_id, name, color, position) VALUES
(p_cabinet_id, v_type_id, 'A traiter', 'gray', 0),
(p_cabinet_id, v_type_id, 'En cours', 'blue', 1),
(p_cabinet_id, v_type_id, 'Depose', 'amber', 2),
(p_cabinet_id, v_type_id, 'Valide', 'green', 3);

INSERT INTO fiscal_tax_types (cabinet_id, code, label, description, periodicite, jour_echeance, mois_echeances, couleur, position)
VALUES (p_cabinet_id, 'TA', 'Taxe d''apprentissage', 'Taxe d''apprentissage - declaration annuelle', 'annuelle', 1, '{3}', 'amber', 7)
RETURNING id INTO v_type_id;
INSERT INTO fiscal_deadline_columns (cabinet_id, tax_type_id, name, color, position) VALUES
(p_cabinet_id, v_type_id, 'A traiter', 'gray', 0),
(p_cabinet_id, v_type_id, 'En cours', 'blue', 1),
(p_cabinet_id, v_type_id, 'Depose', 'amber', 2),
(p_cabinet_id, v_type_id, 'Valide', 'green', 3);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_opportunity_defaults(p_cabinet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
v_col_count integer;
v_lock_key bigint;
v_user_cabinet_id uuid;
BEGIN
IF auth.uid() IS NULL THEN
RAISE EXCEPTION 'Authentication required';
END IF;

SELECT cabinet_id INTO v_user_cabinet_id
FROM profiles WHERE id = auth.uid();

IF v_user_cabinet_id != p_cabinet_id AND NOT public.is_super_admin() THEN
RAISE EXCEPTION 'Access denied: cannot initialize defaults for another cabinet';
END IF;

v_lock_key := ('x' || left(replace(p_cabinet_id::text, '-', ''), 15))::bit(60)::bigint;
PERFORM pg_advisory_xact_lock(v_lock_key);

SELECT count(*) INTO v_col_count
FROM opportunity_columns
WHERE cabinet_id = p_cabinet_id;

IF v_col_count = 0 THEN
INSERT INTO opportunity_columns (cabinet_id, name, color, position) VALUES
(p_cabinet_id, 'A contacter', 'blue', 0),
(p_cabinet_id, 'RDV pris', 'amber', 1),
(p_cabinet_id, 'Proposition envoyee', 'teal', 2),
(p_cabinet_id, 'En negociation', 'amber', 3),
(p_cabinet_id, 'Signe', 'green', 4),
(p_cabinet_id, 'Perdu', 'red', 5);
END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
SELECT COALESCE(
(auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin',
false
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin_for_legal_alerts()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT COALESCE(
(SELECT (raw_app_meta_data ->> 'role') = 'super_admin'
FROM auth.users
WHERE id = auth.uid()),
false
);
$function$
;

CREATE OR REPLACE FUNCTION public.notify_legal_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
v_user_id uuid;
v_client_name text;
v_notif_type text;
BEGIN
IF NEW.severity = 'critical' THEN
v_notif_type := 'legal_alert_critical';
ELSIF NEW.severity = 'warning' THEN
v_notif_type := 'legal_alert_warning';
ELSE
v_notif_type := 'legal_alert_info';
END IF;

SELECT nom_entreprise INTO v_client_name
FROM clients WHERE id = NEW.client_id;

FOR v_user_id IN
SELECT DISTINCT p.id
FROM profiles p
LEFT JOIN client_collaborators cc ON cc.user_id = p.id AND cc.client_id = NEW.client_id
WHERE p.cabinet_id = NEW.cabinet_id
AND p.is_active = true
AND (cc.id IS NOT NULL OR p.role = 'admin')
LOOP
PERFORM create_notification(
v_user_id,
v_notif_type,
NEW.title,
COALESCE(v_client_name, '') || ' - ' || NEW.description,
'/legal-alerts'
);
END LOOP;

RETURN NEW;
END;
$function$
;

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

CREATE OR REPLACE FUNCTION public.notify_ticket_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_ticket RECORD;
v_sender_name text;
v_admin RECORD;
v_ticket_subject text;
v_message_content text;
v_admin_message text;
v_user_message text;
v_category_label text;
v_priority_label text;
BEGIN
IF NEW.is_internal = true THEN
RETURN NEW;
END IF;

SELECT id, user_id, subject, category, priority
INTO v_ticket
FROM support_tickets
WHERE id = NEW.ticket_id;

IF NOT FOUND THEN
RETURN NEW;
END IF;

v_ticket_subject := v_ticket.subject;
v_message_content := NEW.content;

SELECT COALESCE(display_name, prenom || ' ' || nom, email)
INTO v_sender_name
FROM profiles
WHERE id = NEW.sender_id;

IF v_sender_name IS NULL THEN
v_sender_name := 'Un utilisateur';
END IF;

CASE v_ticket.category
WHEN 'bug' THEN v_category_label := 'Bug';
WHEN 'feature' THEN v_category_label := 'Amelioration';
WHEN 'question' THEN v_category_label := 'Question';
WHEN 'other' THEN v_category_label := 'Autre';
ELSE v_category_label := COALESCE(v_ticket.category, 'Non defini');
END CASE;

CASE v_ticket.priority
WHEN 'low' THEN v_priority_label := 'Basse';
WHEN 'medium' THEN v_priority_label := 'Moyenne';
WHEN 'high' THEN v_priority_label := 'Haute';
WHEN 'urgent' THEN v_priority_label := 'Urgente';
ELSE v_priority_label := COALESCE(v_ticket.priority, 'Non definie');
END CASE;

IF NEW.sender_id = v_ticket.user_id THEN
v_admin_message := v_sender_name || ' - ' || v_category_label || ' / Priorite ' || v_priority_label
|| E'\n\n' || v_message_content;

FOR v_admin IN
SELECT id FROM profiles
WHERE role = 'super_admin' AND is_active = true AND id != NEW.sender_id
LOOP
INSERT INTO notifications (user_id, type, title, message, link)
VALUES (
v_admin.id,
'ticket_message',
'Nouveau message : ' || v_ticket_subject,
v_admin_message,
'/support?ticket=' || v_ticket.id
);
END LOOP;
ELSE
IF v_ticket.user_id != NEW.sender_id THEN
v_user_message := v_sender_name || ' a repondu :' || E'\n\n' || v_message_content;

INSERT INTO notifications (user_id, type, title, message, link)
VALUES (
v_ticket.user_id,
'ticket_message',
'Reponse sur : ' || v_ticket_subject,
v_user_message,
'/support?ticket=' || v_ticket.id
);
END IF;
END IF;

RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_cabinet_lifecycle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
rec RECORD;
admin_rec RECORD;
days_since integer;
days_remaining integer;
email_html text;
email_subj text;
deleted_count integer := 0;
deactivated_count integer := 0;
warned_deletion_count integer := 0;
warned_deactivation_count integer := 0;
last_sign_in_map jsonb;
v_caller text;
BEGIN
v_caller := current_user;
IF v_caller NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
RETURN jsonb_build_object('error', 'forbidden', 'message', 'Only super_admin can run cabinet lifecycle');
END IF;
END IF;

SELECT jsonb_object_agg(sub.cabinet_id, sub.last_sign_in_at)
INTO last_sign_in_map
FROM (
SELECT DISTINCT ON (p.cabinet_id)
p.cabinet_id,
au.last_sign_in_at
FROM auth.users au
JOIN profiles p ON p.id = au.id
WHERE p.cabinet_id IS NOT NULL
AND au.last_sign_in_at IS NOT NULL
ORDER BY p.cabinet_id, au.last_sign_in_at DESC
) sub;

IF last_sign_in_map IS NULL THEN
last_sign_in_map := '{}'::jsonb;
END IF;

FOR rec IN
SELECT c.id, c.nom, c.created_at, c.email
FROM cabinets c
WHERE NOT EXISTS (
SELECT 1 FROM (
SELECT p.cabinet_id
FROM auth.users au
JOIN profiles p ON p.id = au.id
WHERE au.last_sign_in_at IS NOT NULL
AND p.cabinet_id = c.id
LIMIT 1
) x
)
LOOP
days_since := EXTRACT(DAY FROM (now() - rec.created_at))::integer;

IF days_since >= 15 THEN
DELETE FROM cabinets WHERE id = rec.id;
deleted_count := deleted_count + 1;
CONTINUE;
END IF;

IF days_since >= 8 THEN
IF NOT EXISTS (
SELECT 1 FROM cabinet_lifecycle_warnings
WHERE cabinet_id = rec.id AND warning_type = 'deletion_warning'
) THEN
SELECT p.id as user_id, COALESCE(p.email, rec.email) as target_email
INTO admin_rec
FROM profiles p
WHERE p.cabinet_id = rec.id AND p.is_active = true
ORDER BY (p.role = 'admin') DESC, p.created_at ASC
LIMIT 1;

IF admin_rec IS NOT NULL AND admin_rec.target_email IS NOT NULL THEN
days_remaining := 15 - days_since;
IF days_remaining < 1 THEN days_remaining := 1; END IF;

email_html := build_cabinet_warning_email_html(rec.nom, 'deletion', days_remaining);
email_subj := 'URGENT : Votre cabinet ' || rec.nom || ' sera supprime dans ' || days_remaining || ' jour(s)';

INSERT INTO email_queue (user_id, to_email, subject, html_body, status)
VALUES (admin_rec.user_id, admin_rec.target_email, email_subj, email_html, 'pending');

INSERT INTO cabinet_lifecycle_warnings (cabinet_id, warning_type)
VALUES (rec.id, 'deletion_warning')
ON CONFLICT (cabinet_id, warning_type) DO NOTHING;

warned_deletion_count := warned_deletion_count + 1;
END IF;
END IF;
END IF;
END LOOP;

FOR rec IN
SELECT c.id, c.nom, c.email,
(last_sign_in_map ->> c.id::text)::timestamptz as last_sign_in
FROM cabinets c
WHERE c.is_active = true
AND last_sign_in_map ? c.id::text
LOOP
IF rec.last_sign_in IS NULL THEN
CONTINUE;
END IF;

days_since := EXTRACT(DAY FROM (now() - rec.last_sign_in))::integer;

IF days_since >= 90 THEN
UPDATE cabinets SET is_active = false WHERE id = rec.id;
deactivated_count := deactivated_count + 1;
DELETE FROM cabinet_lifecycle_warnings
WHERE cabinet_id = rec.id AND warning_type = 'deactivation_warning';
CONTINUE;
END IF;

IF days_since >= 83 THEN
IF NOT EXISTS (
SELECT 1 FROM cabinet_lifecycle_warnings
WHERE cabinet_id = rec.id AND warning_type = 'deactivation_warning'
) THEN
SELECT p.id as user_id, COALESCE(p.email, rec.email) as target_email
INTO admin_rec
FROM profiles p
WHERE p.cabinet_id = rec.id AND p.is_active = true
ORDER BY (p.role = 'admin') DESC, p.created_at ASC
LIMIT 1;

IF admin_rec IS NOT NULL AND admin_rec.target_email IS NOT NULL THEN
days_remaining := 90 - days_since;
IF days_remaining < 1 THEN days_remaining := 1; END IF;

email_html := build_cabinet_warning_email_html(rec.nom, 'deactivation', days_remaining);
email_subj := 'ATTENTION : Votre cabinet ' || rec.nom || ' sera desactive dans ' || days_remaining || ' jour(s)';

INSERT INTO email_queue (user_id, to_email, subject, html_body, status)
VALUES (admin_rec.user_id, admin_rec.target_email, email_subj, email_html, 'pending');

INSERT INTO cabinet_lifecycle_warnings (cabinet_id, warning_type)
VALUES (rec.id, 'deactivation_warning')
ON CONFLICT (cabinet_id, warning_type) DO NOTHING;

warned_deactivation_count := warned_deactivation_count + 1;
END IF;
END IF;
END IF;
END LOOP;

IF warned_deletion_count > 0 OR warned_deactivation_count > 0 THEN
PERFORM trigger_send_pending_emails();
END IF;

RETURN jsonb_build_object(
'deleted', deleted_count,
'deactivated', deactivated_count,
'warned_deletion', warned_deletion_count,
'warned_deactivation', warned_deactivation_count,
'processed_at', now()
);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_email_digest()
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
base_url text := 'https://crmcabinet.com';
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

CREATE OR REPLACE FUNCTION public.seed_default_collaborator_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
INSERT INTO cabinet_collaborator_roles (cabinet_id, key, label, color, position, is_default)
VALUES
(NEW.id, 'responsable', 'Responsable', 'blue', 0, false),
(NEW.id, 'assistant', 'Assistant', 'green', 1, true),
(NEW.id, 'consultant', 'Consultant', 'teal', 2, false)
ON CONFLICT (cabinet_id, key) DO NOTHING;
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_default_regimes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
INSERT INTO regimes_fiscaux (cabinet_id, value, label, description, position)
VALUES
(NEW.id, 'BIC', 'BIC', 'Bénéfices Industriels et Commerciaux', 0),
(NEW.id, 'BNC', 'BNC', 'Bénéfices Non Commerciaux', 1),
(NEW.id, 'BA', 'BA', 'Bénéfices Agricoles', 2),
(NEW.id, 'SCI', 'SCI', 'Société Civile Immobilière', 3),
(NEW.id, 'LMNP', 'LMNP', 'Loueur Meublé Non Professionnel', 4)
ON CONFLICT (cabinet_id, value) DO NOTHING;
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_web_directory_for_cabinet(p_cabinet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
v_existing_count integer;
v_default_cat RECORD;
v_new_cat_id uuid;
v_user_cabinet_id uuid;
BEGIN
IF auth.uid() IS NOT NULL THEN
SELECT cabinet_id INTO v_user_cabinet_id
FROM public.profiles WHERE id = auth.uid();

IF v_user_cabinet_id != p_cabinet_id AND NOT public.is_super_admin() THEN
RAISE EXCEPTION 'Access denied: cannot seed directory for another cabinet';
END IF;
END IF;

SELECT COUNT(*) INTO v_existing_count
FROM public.web_directory_categories
WHERE cabinet_id = p_cabinet_id;

IF v_existing_count > 0 THEN
RETURN;
END IF;

FOR v_default_cat IN
SELECT id, name, description, icon, color, position
FROM public.web_directory_default_categories
ORDER BY position
LOOP
INSERT INTO public.web_directory_categories (cabinet_id, name, description, icon, color, position)
VALUES (p_cabinet_id, v_default_cat.name, v_default_cat.description, v_default_cat.icon, v_default_cat.color, v_default_cat.position)
RETURNING id INTO v_new_cat_id;

INSERT INTO public.web_directory_links (category_id, cabinet_id, title, url, description, position)
SELECT v_new_cat_id, p_cabinet_id, dl.title, dl.url, dl.description, dl.position
FROM public.web_directory_default_links dl
WHERE dl.default_category_id = v_default_cat.id
ORDER BY dl.position;
END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_email_queue_cabinet_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
IF NEW.cabinet_id IS NULL AND NEW.user_id IS NOT NULL THEN
SELECT cabinet_id INTO NEW.cabinet_id
FROM profiles
WHERE id = NEW.user_id;
END IF;
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_all_users_metadata()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
profile_record RECORD;
count integer := 0;
BEGIN
IF NOT (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'super_admin') THEN
RAISE EXCEPTION 'Unauthorized: only super_admin can sync all metadata';
END IF;

FOR profile_record IN SELECT id, role, cabinet_id, email, prenom, nom FROM profiles
LOOP
UPDATE auth.users
SET raw_user_meta_data =
COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object(
'role', profile_record.role,
'cabinet_id', profile_record.cabinet_id,
'email', profile_record.email,
'prenom', profile_record.prenom,
'nom', profile_record.nom
)
WHERE id = profile_record.id;

count := count + 1;
END LOOP;

RAISE NOTICE 'Synced metadata for % users', count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_profile_to_auth_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
UPDATE auth.users
SET
raw_app_meta_data =
COALESCE(raw_app_meta_data, '{}'::jsonb) ||
jsonb_build_object(
'role', NEW.role,
'cabinet_id', NEW.cabinet_id
),
raw_user_meta_data =
COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object(
'role', NEW.role,
'cabinet_id', NEW.cabinet_id
)
WHERE id = NEW.id;

RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_user_metadata_manually(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
profile_record RECORD;
v_caller_role text;
v_caller_cabinet uuid;
v_target_cabinet uuid;
BEGIN
v_caller_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');

IF v_caller_role = 'super_admin' THEN
NULL;
ELSIF v_caller_role = 'admin' THEN
SELECT cabinet_id INTO v_caller_cabinet
FROM profiles WHERE id = auth.uid();

SELECT cabinet_id INTO v_target_cabinet
FROM profiles WHERE id = target_user_id;

IF v_caller_cabinet IS NULL OR v_caller_cabinet != v_target_cabinet THEN
RAISE EXCEPTION 'Unauthorized: can only sync metadata for users in your cabinet';
END IF;
ELSE
IF auth.uid() != target_user_id THEN
RAISE EXCEPTION 'Unauthorized: can only sync your own metadata';
END IF;
END IF;

SELECT id, role, cabinet_id, email, prenom, nom
INTO profile_record
FROM profiles
WHERE id = target_user_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'Profile not found for user %', target_user_id;
END IF;

UPDATE auth.users
SET raw_user_meta_data =
COALESCE(raw_user_meta_data, '{}'::jsonb) ||
jsonb_build_object(
'role', profile_record.role,
'cabinet_id', profile_record.cabinet_id,
'email', profile_record.email,
'prenom', profile_record.prenom,
'nom', profile_record.nom
)
WHERE id = target_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_users_with_cabinet_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
IF NEW.is_active = false AND OLD.is_active = true THEN
UPDATE profiles
SET is_active = false, updated_at = now()
WHERE cabinet_id = NEW.id
AND role != 'super_admin';
END IF;

IF NEW.is_active = true AND OLD.is_active = false THEN
UPDATE profiles
SET is_active = true, updated_at = now()
WHERE cabinet_id = NEW.id;
END IF;

RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_inpi_auto_sync()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
setting_record RECORD;
supabase_url text;
cron_secret_value text;
BEGIN
supabase_url := current_setting('app.settings.supabase_url', true);

IF supabase_url IS NULL THEN
SELECT decrypted_secret INTO supabase_url
FROM vault.decrypted_secrets
WHERE name = 'supabase_url'
LIMIT 1;
END IF;

IF supabase_url IS NULL THEN
RAISE WARNING 'trigger_inpi_auto_sync: supabase_url not found';
RETURN;
END IF;

SELECT value INTO cron_secret_value
FROM app_config
WHERE key = 'cron_secret';

FOR setting_record IN
SELECT ss.id, ss.cabinet_id, ss.batch_offset, ss.batch_size,
ss.last_batch_completed_at, ss.last_sync_at
FROM sync_settings ss
WHERE ss.is_enabled = true
AND ss.sync_type = 'inpi_officers'
AND ss.last_sync_status IS DISTINCT FROM 'running'
AND (
ss.last_batch_completed_at IS NULL
OR ss.last_batch_completed_at < now() - interval '20 hours'
)
LOOP
IF setting_record.last_batch_completed_at IS NOT NULL
AND setting_record.last_batch_completed_at < now() - interval '24 hours'
AND setting_record.batch_offset > 0
AND (setting_record.last_sync_at IS NULL OR setting_record.last_sync_at < now() - interval '2 hours')
THEN
UPDATE sync_settings
SET batch_offset = 0, updated_at = now()
WHERE id = setting_record.id;
setting_record.batch_offset := 0;
END IF;

UPDATE sync_settings
SET last_sync_status = 'running',
updated_at = now()
WHERE id = setting_record.id;

PERFORM net.http_post(
url := supabase_url || '/functions/v1/inpi-sync',
headers := jsonb_build_object(
'Content-Type', 'application/json',
'X-Cron-Secret', COALESCE(cron_secret_value, '')
),
body := jsonb_build_object(
'action', 'auto-sync-cabinet',
'cabinetId', setting_record.cabinet_id::text,
'batchOffset', setting_record.batch_offset,
'batchSize', setting_record.batch_size
)
);
END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_legal_acts_sync()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
setting_record RECORD;
supabase_url text;
BEGIN
supabase_url := current_setting('app.settings.supabase_url', true);

IF supabase_url IS NULL THEN
SELECT decrypted_secret INTO supabase_url
FROM vault.decrypted_secrets
WHERE name = 'supabase_url'
LIMIT 1;
END IF;

IF supabase_url IS NULL THEN
RAISE WARNING 'trigger_legal_acts_sync: supabase_url not found';
RETURN;
END IF;

FOR setting_record IN
SELECT ss.id, ss.cabinet_id, ss.batch_offset, ss.batch_size,
ss.last_batch_completed_at, ss.last_sync_at
FROM sync_settings ss
WHERE ss.is_enabled = true
AND ss.sync_type = 'legal_acts'
AND ss.last_sync_status IS DISTINCT FROM 'running'
-- Weekly: skip if cycle completed less than 6 days ago
AND (
ss.last_batch_completed_at IS NULL
OR ss.last_batch_completed_at < now() - interval '6 days'
)
LOOP
-- Force reset if stuck for over 48h
IF setting_record.last_batch_completed_at IS NOT NULL
AND setting_record.batch_offset > 0
AND (setting_record.last_sync_at IS NULL OR setting_record.last_sync_at < now() - interval '48 hours')
THEN
UPDATE sync_settings
SET batch_offset = 0, updated_at = now()
WHERE id = setting_record.id;
setting_record.batch_offset := 0;
END IF;

UPDATE sync_settings
SET last_sync_status = 'running',
sync_progress = jsonb_build_object(
'batch_offset', setting_record.batch_offset,
'batch_size', setting_record.batch_size,
'phase', 'dispatching'
),
updated_at = now()
WHERE id = setting_record.id;

PERFORM net.http_post(
url := supabase_url || '/functions/v1/inpi-sync',
headers := jsonb_build_object('Content-Type', 'application/json'),
body := jsonb_build_object(
'action', 'sync-acts-batch',
'cabinetId', setting_record.cabinet_id::text,
'batchOffset', setting_record.batch_offset,
'batchSize', setting_record.batch_size
)
);
END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_legal_full_sync()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
setting_record RECORD;
supabase_url text;
cron_secret_value text;
BEGIN
supabase_url := current_setting('app.settings.supabase_url', true);

IF supabase_url IS NULL THEN
SELECT decrypted_secret INTO supabase_url
FROM vault.decrypted_secrets
WHERE name = 'supabase_url'
LIMIT 1;
END IF;

IF supabase_url IS NULL THEN
RAISE WARNING 'trigger_legal_full_sync: supabase_url not found';
RETURN;
END IF;

SELECT value INTO cron_secret_value
FROM app_config
WHERE key = 'cron_secret';

FOR setting_record IN
SELECT ss.id, ss.cabinet_id, ss.batch_offset, ss.batch_size,
ss.last_batch_completed_at, ss.last_sync_at
FROM sync_settings ss
WHERE ss.is_enabled = true
AND ss.sync_type = 'legal_full'
AND ss.last_sync_status IS DISTINCT FROM 'running'
AND (
ss.last_batch_completed_at IS NULL
OR ss.last_batch_completed_at < now() - interval '20 hours'
)
LOOP
IF setting_record.last_batch_completed_at IS NOT NULL
AND setting_record.last_batch_completed_at < now() - interval '24 hours'
AND setting_record.batch_offset > 0
AND (setting_record.last_sync_at IS NULL OR setting_record.last_sync_at < now() - interval '2 hours')
THEN
UPDATE sync_settings
SET batch_offset = 0, updated_at = now()
WHERE id = setting_record.id;
setting_record.batch_offset := 0;
END IF;

UPDATE sync_settings
SET last_sync_status = 'running',
sync_progress = jsonb_build_object(
'batch_offset', setting_record.batch_offset,
'batch_size', setting_record.batch_size,
'phase', 'dispatching'
),
updated_at = now()
WHERE id = setting_record.id;

PERFORM net.http_post(
url := supabase_url || '/functions/v1/legal-sync-all',
headers := jsonb_build_object(
'Content-Type', 'application/json',
'X-Cron-Secret', COALESCE(cron_secret_value, '')
),
body := jsonb_build_object(
'cabinetId', setting_record.cabinet_id::text,
'batchOffset', setting_record.batch_offset,
'batchSize', setting_record.batch_size
)
);
END LOOP;
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

CREATE OR REPLACE FUNCTION public.trigger_send_pending_emails()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault'
AS $function$
DECLARE
pending_count integer;
supabase_url text;
cron_secret_value text;
BEGIN
SELECT count(*) INTO pending_count
FROM email_queue
WHERE status = 'pending' AND retry_count < 3;

IF pending_count = 0 THEN
RETURN;
END IF;

supabase_url := current_setting('app.settings.supabase_url', true);

IF supabase_url IS NULL THEN
SELECT decrypted_secret INTO supabase_url
FROM vault.decrypted_secrets
WHERE name = 'supabase_url'
LIMIT 1;
END IF;

IF supabase_url IS NULL THEN
RAISE WARNING 'trigger_send_pending_emails: supabase_url not found in settings or vault';
RETURN;
END IF;

SELECT value INTO cron_secret_value
FROM app_config
WHERE key = 'cron_secret';

PERFORM net.http_post(
url := supabase_url || '/functions/v1/send-emails',
headers := jsonb_build_object(
'Content-Type', 'application/json',
'X-Cron-Secret', COALESCE(cron_secret_value, '')
),
body := jsonb_build_object('action', 'process-queue')
);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_cabinet_collaborator_roles_updated_at()
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

CREATE OR REPLACE FUNCTION public.update_support_ticket_updated_at()
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
CREATE TRIGGER trg_cabinet_collaborator_roles_updated_at BEFORE UPDATE ON public.cabinet_collaborator_roles FOR EACH ROW EXECUTE FUNCTION update_cabinet_collaborator_roles_updated_at();
CREATE TRIGGER trg_seed_default_collaborator_roles AFTER INSERT ON public.cabinets FOR EACH ROW EXECUTE FUNCTION seed_default_collaborator_roles();
CREATE TRIGGER trg_seed_default_regimes AFTER INSERT ON public.cabinets FOR EACH ROW EXECUTE FUNCTION seed_default_regimes();
CREATE TRIGGER trigger_sync_users_with_cabinet AFTER UPDATE OF is_active ON public.cabinets FOR EACH ROW WHEN ((old.is_active IS DISTINCT FROM new.is_active)) EXECUTE FUNCTION sync_users_with_cabinet_status();
CREATE TRIGGER trg_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION update_chat_conversation_updated_at();
CREATE TRIGGER update_client_collaborators_updated_at BEFORE UPDATE ON public.client_collaborators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_meeting_notes_updated_at BEFORE UPDATE ON public.client_meeting_notes FOR EACH ROW EXECUTE FUNCTION update_meeting_notes_updated_at();
CREATE TRIGGER calculate_siren_trigger BEFORE INSERT OR UPDATE OF siret ON public.clients FOR EACH ROW EXECUTE FUNCTION calculate_siren_from_siret();
CREATE TRIGGER update_company_officers_updated_at BEFORE UPDATE ON public.company_officers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_update_directory_companies_updated_at BEFORE UPDATE ON public.directory_companies FOR EACH ROW EXECUTE FUNCTION update_directory_companies_updated_at();
CREATE TRIGGER trigger_update_directory_contacts_updated_at BEFORE UPDATE ON public.directory_contacts FOR EACH ROW EXECUTE FUNCTION update_directory_contacts_updated_at();
CREATE TRIGGER trg_set_email_queue_cabinet_id BEFORE INSERT ON public.email_queue FOR EACH ROW EXECUTE FUNCTION set_email_queue_cabinet_id();
CREATE TRIGGER update_legal_acts_updated_at BEFORE UPDATE ON public.legal_acts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_legal_documents_updated_at BEFORE UPDATE ON public.legal_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_notification_email_queue AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION handle_new_notification();
CREATE TRIGGER update_officer_companies_updated_at BEFORE UPDATE ON public.officer_companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER sync_profile_on_change AFTER INSERT OR UPDATE OF role, cabinet_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION sync_profile_to_auth_metadata();
CREATE TRIGGER set_relance_invoices_updated_at BEFORE UPDATE ON public.relance_invoices FOR EACH ROW EXECUTE FUNCTION update_relance_invoices_updated_at();
CREATE TRIGGER set_revenue_declaration_deadlines_updated_at BEFORE UPDATE ON public.revenue_declaration_deadlines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_revenue_declarations_updated_at BEFORE UPDATE ON public.revenue_declarations FOR EACH ROW EXECUTE FUNCTION update_revenue_declarations_updated_at();
CREATE TRIGGER trigger_update_support_ticket_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_support_ticket_updated_at();
CREATE TRIGGER sync_jobs_updated_at BEFORE UPDATE ON public.sync_jobs FOR EACH ROW EXECUTE FUNCTION update_sync_jobs_updated_at();
CREATE TRIGGER update_task_categories_updated_at BEFORE UPDATE ON public.task_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_comments_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_task_templates_updated_at BEFORE UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_notify_task_assigned AFTER INSERT OR UPDATE OF assignee_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();
CREATE TRIGGER trg_tax_exemption_results_updated_at BEFORE UPDATE ON public.tax_exemption_results FOR EACH ROW EXECUTE FUNCTION update_tax_exemption_results_updated_at();
CREATE TRIGGER trigger_notify_ticket_message AFTER INSERT ON public.ticket_messages FOR EACH ROW EXECUTE FUNCTION notify_ticket_message();
CREATE TRIGGER set_web_directory_categories_updated_at BEFORE UPDATE ON public.web_directory_categories FOR EACH ROW EXECUTE FUNCTION update_web_directory_updated_at();
CREATE TRIGGER set_web_directory_default_categories_updated_at BEFORE UPDATE ON public.web_directory_default_categories FOR EACH ROW EXECUTE FUNCTION update_web_directory_updated_at();
CREATE TRIGGER set_web_directory_default_links_updated_at BEFORE UPDATE ON public.web_directory_default_links FOR EACH ROW EXECUTE FUNCTION update_web_directory_updated_at();
CREATE TRIGGER set_web_directory_links_updated_at BEFORE UPDATE ON public.web_directory_links FOR EACH ROW EXECUTE FUNCTION update_web_directory_updated_at();

-- ============ RLS ET POLICIES ============
-- Ce bloc entier disparaît en mono-cabinet : les droits passent dans l'API.
ALTER TABLE "ago_avancement_statuses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_ago_statuses" ON "ago_avancement_statuses" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
CREATE POLICY "insert_ago_statuses" ON "ago_avancement_statuses" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
CREATE POLICY "select_ago_statuses" ON "ago_avancement_statuses" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'super_admin'::text) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)))))));
CREATE POLICY "update_ago_statuses" ON "ago_avancement_statuses" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)))))) WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
ALTER TABLE "app_config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_delete_app_config" ON "app_config" AS PERMISSIVE FOR DELETE TO authenticated USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text));
CREATE POLICY "super_admin_insert_app_config" ON "app_config" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text));
CREATE POLICY "super_admin_select_app_config" ON "app_config" AS PERMISSIVE FOR SELECT TO authenticated USING (((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR true));
CREATE POLICY "super_admin_update_app_config" ON "app_config" AS PERMISSIVE FOR UPDATE TO authenticated USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)) WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text));
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can insert audit logs" ON "audit_logs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Super admins can view audit logs" ON "audit_logs" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "balance_sheets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all balance sheets" ON "balance_sheets" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete balance sheets of their cabinet's clients" ON "balance_sheets" AS PERMISSIVE FOR DELETE TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can insert balance sheets for their cabinet's clients" ON "balance_sheets" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can update balance sheets of their cabinet's clients" ON "balance_sheets" AS PERMISSIVE FOR UPDATE TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can view balance sheets of their cabinet's clients" ON "balance_sheets" AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER TABLE "bilan_cabinet_options" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_own_cabinet_bilan_options" ON "bilan_cabinet_options" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id = ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "insert_own_cabinet_bilan_options" ON "bilan_cabinet_options" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id = ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "select_own_cabinet_bilan_options" ON "bilan_cabinet_options" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
CREATE POLICY "update_own_cabinet_bilan_options" ON "bilan_cabinet_options" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id = ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((cabinet_id = ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
ALTER TABLE "bilan_cards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete bilan cards" ON "bilan_cards" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can insert bilan cards" ON "bilan_cards" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can update bilan cards" ON "bilan_cards" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin())) WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can view bilan cards" ON "bilan_cards" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
ALTER TABLE "bilan_checklist_attachments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete bilan checklist attachments" ON "bilan_checklist_attachments" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can insert bilan checklist attachments" ON "bilan_checklist_attachments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can view bilan checklist attachments" ON "bilan_checklist_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Super admins can view all bilan checklist attachments" ON "bilan_checklist_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "bilan_checklist_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete checklist items" ON "bilan_checklist_items" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM bilan_cards bc
  WHERE ((bc.id = bilan_checklist_items.card_id) AND ((bc.cabinet_id = get_user_cabinet_id()) OR is_super_admin())))));
CREATE POLICY "Cabinet members can insert checklist items" ON "bilan_checklist_items" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM bilan_cards bc
  WHERE ((bc.id = bilan_checklist_items.card_id) AND ((bc.cabinet_id = get_user_cabinet_id()) OR is_super_admin())))));
CREATE POLICY "Cabinet members can update checklist items" ON "bilan_checklist_items" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM bilan_cards bc
  WHERE ((bc.id = bilan_checklist_items.card_id) AND ((bc.cabinet_id = get_user_cabinet_id()) OR is_super_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM bilan_cards bc
  WHERE ((bc.id = bilan_checklist_items.card_id) AND ((bc.cabinet_id = get_user_cabinet_id()) OR is_super_admin())))));
CREATE POLICY "Cabinet members can view checklist items" ON "bilan_checklist_items" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM bilan_cards bc
  WHERE ((bc.id = bilan_checklist_items.card_id) AND ((bc.cabinet_id = get_user_cabinet_id()) OR is_super_admin())))));
ALTER TABLE "bilan_checklist_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete checklist templates" ON "bilan_checklist_templates" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Admins can insert checklist templates" ON "bilan_checklist_templates" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Admins can update checklist templates" ON "bilan_checklist_templates" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin())) WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can view checklist templates" ON "bilan_checklist_templates" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
ALTER TABLE "bilan_columns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete bilan columns" ON "bilan_columns" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Admins can insert bilan columns" ON "bilan_columns" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Admins can update bilan columns" ON "bilan_columns" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin())) WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can view bilan columns" ON "bilan_columns" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
ALTER TABLE "bilan_das2_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_das2_entries" ON "bilan_das2_entries" AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (bilan_cards bc
     JOIN profiles p ON ((p.cabinet_id = bc.cabinet_id)))
  WHERE ((bc.id = bilan_das2_entries.card_id) AND (p.id = auth.uid())))) OR is_super_admin()));
CREATE POLICY "insert_das2_entries" ON "bilan_das2_entries" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM (bilan_cards bc
     JOIN profiles p ON ((p.cabinet_id = bc.cabinet_id)))
  WHERE ((bc.id = bilan_das2_entries.card_id) AND (p.id = auth.uid())))) OR is_super_admin()));
CREATE POLICY "select_das2_entries" ON "bilan_das2_entries" AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (bilan_cards bc
     JOIN profiles p ON ((p.cabinet_id = bc.cabinet_id)))
  WHERE ((bc.id = bilan_das2_entries.card_id) AND (p.id = auth.uid())))) OR is_super_admin()));
ALTER TABLE "bodacc_depot_comptes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all bodacc depot comptes" ON "bodacc_depot_comptes" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete depot comptes for their cabinet clients" ON "bodacc_depot_comptes" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = bodacc_depot_comptes.client_id) AND (p.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can insert depot comptes for their cabinet clients" ON "bodacc_depot_comptes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = bodacc_depot_comptes.client_id) AND (p.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view depot comptes for their cabinet clients" ON "bodacc_depot_comptes" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = bodacc_depot_comptes.client_id) AND (p.id = ( SELECT auth.uid() AS uid))))));
ALTER TABLE "cabinet_collaborator_roles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet admins delete collaborator roles" ON "cabinet_collaborator_roles" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_active = true) AND (profiles.role = 'admin'::text)))) OR is_super_admin()));
CREATE POLICY "Cabinet admins insert collaborator roles" ON "cabinet_collaborator_roles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_active = true) AND (profiles.role = 'admin'::text)))) OR is_super_admin()));
CREATE POLICY "Cabinet admins update collaborator roles" ON "cabinet_collaborator_roles" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_active = true) AND (profiles.role = 'admin'::text)))) OR is_super_admin())) WITH CHECK (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_active = true) AND (profiles.role = 'admin'::text)))) OR is_super_admin()));
CREATE POLICY "Cabinet members read collaborator roles" ON "cabinet_collaborator_roles" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_active = true)))) OR is_super_admin()));
ALTER TABLE "cabinet_lifecycle_warnings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can delete lifecycle warnings" ON "cabinet_lifecycle_warnings" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can insert lifecycle warnings" ON "cabinet_lifecycle_warnings" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT (auth.jwt() ->> 'role'::text)) = 'super_admin'::text) OR (( SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text)) = 'super_admin'::text)));
CREATE POLICY "Super admins can view lifecycle warnings" ON "cabinet_lifecycle_warnings" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "cabinet_smtp_config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_own_cabinet_smtp" ON "cabinet_smtp_config" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((( SELECT p.role
   FROM profiles p
  WHERE (p.id = auth.uid())) = 'admin'::text) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))));
CREATE POLICY "insert_own_cabinet_smtp" ON "cabinet_smtp_config" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((( SELECT p.role
   FROM profiles p
  WHERE (p.id = auth.uid())) = 'admin'::text) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))));
CREATE POLICY "select_own_cabinet_smtp" ON "cabinet_smtp_config" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
CREATE POLICY "update_own_cabinet_smtp" ON "cabinet_smtp_config" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((( SELECT p.role
   FROM profiles p
  WHERE (p.id = auth.uid())) = 'admin'::text) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)))) WITH CHECK (((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND ((( SELECT p.role
   FROM profiles p
  WHERE (p.id = auth.uid())) = 'admin'::text) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))));
ALTER TABLE "cabinets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can update their cabinet" ON "cabinets" AS PERMISSIVE FOR UPDATE TO authenticated USING ((id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::text))))) WITH CHECK ((id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::text)))));
CREATE POLICY "Super admins can delete cabinets" ON "cabinets" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can insert cabinets" ON "cabinets" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can update cabinets" ON "cabinets" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can view all cabinets" ON "cabinets" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can view their own cabinet" ON "cabinets" AS PERMISSIVE FOR SELECT TO authenticated USING ((id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "changelog_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view published changelog entries" ON "changelog_entries" AS PERMISSIVE FOR SELECT TO authenticated USING (((is_published = true) OR is_super_admin()));
CREATE POLICY "Super admin can create changelog entries" ON "changelog_entries" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Super admin can delete changelog entries" ON "changelog_entries" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admin can update changelog entries" ON "changelog_entries" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
ALTER TABLE "changelog_read_status" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can delete own read status" ON "changelog_read_status" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can mark entries as read" ON "changelog_read_status" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own read status" ON "changelog_read_status" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER TABLE "chat_conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete cabinet conversations" ON "chat_conversations" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.cabinet_id = chat_conversations.cabinet_id) AND (p.role = 'admin'::text)))));
CREATE POLICY "Users can create own conversations" ON "chat_conversations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can update own conversations" ON "chat_conversations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own conversations" ON "chat_conversations" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.cabinet_id = chat_conversations.cabinet_id) AND (p.role = 'admin'::text)))) OR is_super_admin()));
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete messages in cabinet conversations" ON "chat_messages" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (chat_conversations cc
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((cc.id = chat_messages.conversation_id) AND (p.cabinet_id = cc.cabinet_id) AND (p.role = 'admin'::text)))));
CREATE POLICY "Users can insert messages in own conversations" ON "chat_messages" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM chat_conversations cc
  WHERE ((cc.id = chat_messages.conversation_id) AND (cc.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view messages of accessible conversations" ON "chat_messages" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM chat_conversations cc
  WHERE ((cc.id = chat_messages.conversation_id) AND ((cc.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = auth.uid()) AND (p.cabinet_id = cc.cabinet_id) AND (p.role = 'admin'::text)))) OR is_super_admin())))));
ALTER TABLE "chat_rate_limits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage rate limits" ON "chat_rate_limits" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE "checklist_item_attachments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_checklist_item_attachments" ON "checklist_item_attachments" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "insert_checklist_item_attachments" ON "checklist_item_attachments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "select_checklist_item_attachments" ON "checklist_item_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "super_admin_select_checklist_item_attachments" ON "checklist_item_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "checklist_item_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_checklist_item_comments" ON "checklist_item_comments" AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR (item_id IN ( SELECT ci.id
   FROM (checklist_items ci
     JOIN checklists c ON ((c.id = ci.checklist_id)))
  WHERE (c.user_id = auth.uid())))));
CREATE POLICY "insert_checklist_item_comments" ON "checklist_item_comments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (item_id IN ( SELECT ci.id
   FROM (checklist_items ci
     JOIN checklists c ON ((c.id = ci.checklist_id)))
  WHERE (c.user_id = auth.uid())))));
CREATE POLICY "select_checklist_item_comments" ON "checklist_item_comments" AS PERMISSIVE FOR SELECT TO authenticated USING ((item_id IN ( SELECT ci.id
   FROM (checklist_items ci
     JOIN checklists c ON ((c.id = ci.checklist_id)))
  WHERE ((c.user_id = auth.uid()) OR ((c.is_shared = true) AND (c.cabinet_id IN ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = auth.uid()))))))));
CREATE POLICY "super_admin_select_checklist_item_comments" ON "checklist_item_comments" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_checklist_items" ON "checklist_items" AS PERMISSIVE FOR DELETE TO authenticated USING ((checklist_id IN ( SELECT c.id
   FROM checklists c
  WHERE (c.user_id = auth.uid()))));
CREATE POLICY "insert_checklist_items" ON "checklist_items" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((checklist_id IN ( SELECT c.id
   FROM checklists c
  WHERE (c.user_id = auth.uid()))));
CREATE POLICY "select_checklist_items" ON "checklist_items" AS PERMISSIVE FOR SELECT TO authenticated USING ((checklist_id IN ( SELECT c.id
   FROM checklists c
  WHERE ((c.user_id = auth.uid()) OR ((c.is_shared = true) AND (c.cabinet_id IN ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = auth.uid()))))))));
CREATE POLICY "update_checklist_items" ON "checklist_items" AS PERMISSIVE FOR UPDATE TO authenticated USING ((checklist_id IN ( SELECT c.id
   FROM checklists c
  WHERE (c.user_id = auth.uid())))) WITH CHECK ((checklist_id IN ( SELECT c.id
   FROM checklists c
  WHERE (c.user_id = auth.uid()))));
ALTER TABLE "checklist_template_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_checklist_template_items" ON "checklist_template_items" AS PERMISSIVE FOR DELETE TO authenticated USING ((template_id IN ( SELECT t.id
   FROM checklist_templates t
  WHERE (t.user_id = auth.uid()))));
CREATE POLICY "insert_checklist_template_items" ON "checklist_template_items" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((template_id IN ( SELECT t.id
   FROM checklist_templates t
  WHERE (t.user_id = auth.uid()))));
CREATE POLICY "select_checklist_template_items" ON "checklist_template_items" AS PERMISSIVE FOR SELECT TO authenticated USING ((template_id IN ( SELECT t.id
   FROM checklist_templates t
  WHERE ((t.user_id = auth.uid()) OR ((t.is_shared = true) AND (t.cabinet_id IN ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = auth.uid()))))))));
CREATE POLICY "update_checklist_template_items" ON "checklist_template_items" AS PERMISSIVE FOR UPDATE TO authenticated USING ((template_id IN ( SELECT t.id
   FROM checklist_templates t
  WHERE (t.user_id = auth.uid())))) WITH CHECK ((template_id IN ( SELECT t.id
   FROM checklist_templates t
  WHERE (t.user_id = auth.uid()))));
ALTER TABLE "checklist_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_own_checklist_templates" ON "checklist_templates" AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "insert_own_checklist_templates" ON "checklist_templates" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "select_own_and_shared_checklist_templates" ON "checklist_templates" AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR ((is_shared = true) AND (cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))))));
CREATE POLICY "update_own_checklist_templates" ON "checklist_templates" AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
ALTER TABLE "checklists" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_own_checklists" ON "checklists" AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "insert_own_checklists" ON "checklists" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "select_own_and_shared_checklists" ON "checklists" AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR ((is_shared = true) AND (cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))))));
CREATE POLICY "update_own_checklists" ON "checklists" AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
ALTER TABLE "client_ago_avancements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_client_ago_avancements" ON "client_ago_avancements" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
CREATE POLICY "insert_client_ago_avancements" ON "client_ago_avancements" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
CREATE POLICY "select_client_ago_avancements" ON "client_ago_avancements" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
CREATE POLICY "update_client_ago_avancements" ON "client_ago_avancements" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)))))) WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
ALTER TABLE "client_ard_calculations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet users can delete their ARD calculations" ON "client_ard_calculations" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet users can insert ARD calculations" ON "client_ard_calculations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet users can update their ARD calculations" ON "client_ard_calculations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid())))) WITH CHECK ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet users can view their ARD calculations" ON "client_ard_calculations" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Super admins can view all ARD calculations" ON "client_ard_calculations" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));
ALTER TABLE "client_collaborators" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete collaborators for their cabinet clients" ON "client_collaborators" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = client_collaborators.client_id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Admins can insert collaborators for their cabinet clients" ON "client_collaborators" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = client_collaborators.client_id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Admins can update collaborators for their cabinet clients" ON "client_collaborators" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = client_collaborators.client_id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = client_collaborators.client_id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Cabinet users can delete collaborators for their cabinet client" ON "client_collaborators" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = client_collaborators.client_id) AND (p.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Cabinet users can insert collaborators for their cabinet client" ON "client_collaborators" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = client_collaborators.client_id) AND (p.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Super admins can view all client collaborators" ON "client_collaborators" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can self-assign to cabinet clients" ON "client_collaborators" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = client_collaborators.client_id) AND (p.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can unassign themselves from clients" ON "client_collaborators" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view collaborators for their cabinet clients" ON "client_collaborators" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = client_collaborators.client_id) AND (p.id = ( SELECT auth.uid() AS uid))))));
ALTER TABLE "client_fiscal_tax_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all client fiscal tax types" ON "client_fiscal_tax_types" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can assign tax types to clients in their cabinet" ON "client_fiscal_tax_types" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can remove tax types from clients in their cabinet" ON "client_fiscal_tax_types" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view client tax types in their cabinet" ON "client_fiscal_tax_types" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "client_meeting_notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete their meeting notes" ON "client_meeting_notes" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id = get_user_cabinet_id()));
CREATE POLICY "Cabinet members can insert meeting notes" ON "client_meeting_notes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id = get_user_cabinet_id()));
CREATE POLICY "Cabinet members can update their meeting notes" ON "client_meeting_notes" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id = get_user_cabinet_id())) WITH CHECK ((cabinet_id = get_user_cabinet_id()));
CREATE POLICY "Cabinet members can view their meeting notes" ON "client_meeting_notes" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id = get_user_cabinet_id()));
CREATE POLICY "Super admins can view all meeting notes" ON "client_meeting_notes" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "client_software" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can assign software to clients in their cabinet" ON "client_software" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))) OR ((((( SELECT auth.jwt() AS jwt) ->> 'app_metadata'::text))::jsonb ->> 'role'::text) = 'super_admin'::text)));
CREATE POLICY "Users can remove client software in their cabinet" ON "client_software" AS PERMISSIVE FOR DELETE TO authenticated USING (((client_id IN ( SELECT c.id
   FROM clients c
  WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = auth.uid()))))) OR is_super_admin()));
CREATE POLICY "Users can update client software in their cabinet" ON "client_software" AS PERMISSIVE FOR UPDATE TO authenticated USING (((client_id IN ( SELECT c.id
   FROM clients c
  WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = auth.uid()))))) OR is_super_admin())) WITH CHECK (((client_id IN ( SELECT c.id
   FROM clients c
  WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = auth.uid()))))) OR is_super_admin()));
CREATE POLICY "Users can view client software in their cabinet" ON "client_software" AS PERMISSIVE FOR SELECT TO authenticated USING (((client_id IN ( SELECT c.id
   FROM clients c
  WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = auth.uid()))))) OR is_super_admin()));
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can delete all clients" ON "clients" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can insert clients" ON "clients" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can update all clients" ON "clients" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can view all clients" ON "clients" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete clients in their cabinet" ON "clients" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert clients in their cabinet" ON "clients" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update clients in their cabinet" ON "clients" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view clients in their cabinet" ON "clients" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "company_officers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet users can delete company officers" ON "company_officers" AS PERMISSIVE FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (officer_companies oc
     JOIN clients c ON ((c.id = oc.client_id)))
  WHERE ((oc.officer_id = company_officers.id) AND (c.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))) OR is_super_admin()));
CREATE POLICY "Cabinet users can insert company officers" ON "company_officers" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.cabinet_id IS NOT NULL)))) OR is_super_admin()));
CREATE POLICY "Cabinet users can update company officers" ON "company_officers" AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM (officer_companies oc
     JOIN clients c ON ((c.id = oc.client_id)))
  WHERE ((oc.officer_id = company_officers.id) AND (c.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))) OR is_super_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM (officer_companies oc
     JOIN clients c ON ((c.id = oc.client_id)))
  WHERE ((oc.officer_id = company_officers.id) AND (c.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))) OR is_super_admin()));
CREATE POLICY "Cabinet users can view company officers" ON "company_officers" AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (officer_companies oc
     JOIN clients c ON ((c.id = oc.client_id)))
  WHERE ((oc.officer_id = company_officers.id) AND (c.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))) OR is_super_admin()));
ALTER TABLE "directory_companies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all directory companies" ON "directory_companies" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete companies in their cabinet" ON "directory_companies" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert companies in their cabinet" ON "directory_companies" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update companies in their cabinet" ON "directory_companies" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view companies in their cabinet" ON "directory_companies" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "directory_contact_companies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all directory contact companies" ON "directory_contact_companies" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete contact-company links in their cabinet" ON "directory_contact_companies" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM directory_contacts
  WHERE ((directory_contacts.id = directory_contact_companies.contact_id) AND (directory_contacts.cabinet_id = ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "Users can insert contact-company links in their cabinet" ON "directory_contact_companies" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM directory_contacts
  WHERE ((directory_contacts.id = directory_contact_companies.contact_id) AND (directory_contacts.cabinet_id = ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "Users can update contact-company links in their cabinet" ON "directory_contact_companies" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM directory_contacts
  WHERE ((directory_contacts.id = directory_contact_companies.contact_id) AND (directory_contacts.cabinet_id = ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM directory_contacts
  WHERE ((directory_contacts.id = directory_contact_companies.contact_id) AND (directory_contacts.cabinet_id = ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "Users can view contact-company links in their cabinet" ON "directory_contact_companies" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM directory_contacts
  WHERE ((directory_contacts.id = directory_contact_companies.contact_id) AND (directory_contacts.cabinet_id = ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid))))))));
ALTER TABLE "directory_contacts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all directory contacts" ON "directory_contacts" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete contacts in their cabinet" ON "directory_contacts" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert contacts in their cabinet" ON "directory_contacts" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update contacts in their cabinet" ON "directory_contacts" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view contacts in their cabinet" ON "directory_contacts" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "document_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete templates" ON "document_templates" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Admins can insert templates" ON "document_templates" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Admins can update templates" ON "document_templates" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Cabinet members can view active templates" ON "document_templates" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Super admins can view all document templates" ON "document_templates" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "email_digests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can delete own digest settings" ON "email_digests" AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own digest settings" ON "email_digests" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own digest settings" ON "email_digests" AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own digest settings" ON "email_digests" AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER TABLE "email_queue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can delete email queue" ON "email_queue" AS PERMISSIVE FOR DELETE TO service_role USING (true);
CREATE POLICY "Service role can insert email queue" ON "email_queue" AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can select email queue" ON "email_queue" AS PERMISSIVE FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can update email queue" ON "email_queue" AS PERMISSIVE FOR UPDATE TO service_role USING (true) WITH CHECK (true);
ALTER TABLE "fiscal_deadline_cards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete deadline cards" ON "fiscal_deadline_cards" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR is_super_admin())))));
CREATE POLICY "Super admins can view all fiscal deadline cards" ON "fiscal_deadline_cards" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can insert deadline cards" ON "fiscal_deadline_cards" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update deadline cards" ON "fiscal_deadline_cards" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view their cabinet deadline cards" ON "fiscal_deadline_cards" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "fiscal_deadline_columns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete deadline columns" ON "fiscal_deadline_columns" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR is_super_admin())))));
CREATE POLICY "Admins can insert deadline columns" ON "fiscal_deadline_columns" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'admin'::text) OR (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
CREATE POLICY "Admins can update deadline columns" ON "fiscal_deadline_columns" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR is_super_admin()))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR is_super_admin())))));
CREATE POLICY "Super admins can view all fiscal deadline columns" ON "fiscal_deadline_columns" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can view their cabinet deadline columns" ON "fiscal_deadline_columns" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "fiscal_tax_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete tax types" ON "fiscal_tax_types" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR is_super_admin())))));
CREATE POLICY "Admins can insert tax types" ON "fiscal_tax_types" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'admin'::text) OR (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))))));
CREATE POLICY "Admins can update tax types" ON "fiscal_tax_types" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR is_super_admin()))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'admin'::text) OR is_super_admin())))));
CREATE POLICY "Super admins can view all fiscal tax types" ON "fiscal_tax_types" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can view their cabinet tax types" ON "fiscal_tax_types" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "general_assemblies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all assemblies" ON "general_assemblies" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete assemblies of their cabinet's clients" ON "general_assemblies" AS PERMISSIVE FOR DELETE TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can insert assemblies for their cabinet's clients" ON "general_assemblies" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can update assemblies of their cabinet's clients" ON "general_assemblies" AS PERMISSIVE FOR UPDATE TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can view assemblies of their cabinet's clients" ON "general_assemblies" AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER TABLE "generated_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can create generated documents" ON "generated_documents" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) AND (user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Cabinet members can view generated documents" ON "generated_documents" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Super admins can view all generated documents" ON "generated_documents" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete own generated documents or admins can delete a" ON "generated_documents" AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));
ALTER TABLE "gov_chat_conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users delete own gov chat conversations" ON "gov_chat_conversations" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users insert own gov chat conversations" ON "gov_chat_conversations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users read own gov chat conversations" ON "gov_chat_conversations" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_super_admin()));
CREATE POLICY "Users update own gov chat conversations" ON "gov_chat_conversations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER TABLE "gov_chat_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users delete messages of own gov conversations" ON "gov_chat_messages" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gov_chat_conversations c
  WHERE ((c.id = gov_chat_messages.conversation_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users insert messages in own gov conversations" ON "gov_chat_messages" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM gov_chat_conversations c
  WHERE ((c.id = gov_chat_messages.conversation_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users read messages of own gov conversations" ON "gov_chat_messages" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM gov_chat_conversations c
  WHERE ((c.id = gov_chat_messages.conversation_id) AND ((c.user_id = ( SELECT auth.uid() AS uid)) OR is_super_admin())))));
ALTER TABLE "gov_chat_rate_limits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own gov rate limit rows" ON "gov_chat_rate_limits" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users read own gov rate limit rows" ON "gov_chat_rate_limits" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_super_admin()));
ALTER TABLE "habilitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all habilitations" ON "habilitations" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete their cabinet habilitations" ON "habilitations" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert habilitations for their cabinet" ON "habilitations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update their cabinet habilitations" ON "habilitations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view their cabinet habilitations" ON "habilitations" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "inpi_search_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users delete own INPI search history" ON "inpi_search_history" AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users insert own INPI search history" ON "inpi_search_history" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users view own INPI search history" ON "inpi_search_history" AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
ALTER TABLE "inpi_sync_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all inpi sync history" ON "inpi_sync_history" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "System can insert INPI sync history" ON "inpi_sync_history" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = inpi_sync_history.client_id) AND (p.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view INPI sync history for their cabinet clients" ON "inpi_sync_history" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (clients c
     JOIN profiles p ON ((p.cabinet_id = c.cabinet_id)))
  WHERE ((c.id = inpi_sync_history.client_id) AND (p.id = ( SELECT auth.uid() AS uid))))));
ALTER TABLE "legal_acts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet users can delete legal acts" ON "legal_acts" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_acts.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can insert legal acts" ON "legal_acts" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_acts.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can update legal acts" ON "legal_acts" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_acts.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_acts.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can view legal acts" ON "legal_acts" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_acts.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
ALTER TABLE "legal_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet users can delete legal documents" ON "legal_documents" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_documents.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can insert legal documents" ON "legal_documents" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_documents.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can update legal documents" ON "legal_documents" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_documents.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_documents.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can view legal documents" ON "legal_documents" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = legal_documents.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
ALTER TABLE "legal_forms" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can delete legal forms" ON "legal_forms" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can insert legal forms" ON "legal_forms" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can update legal forms" ON "legal_forms" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Tous peuvent lire les formes juridiques" ON "legal_forms" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
ALTER TABLE "legal_sync_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view sync logs for their cabinet" ON "legal_sync_log" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.cabinet_id IS NOT NULL)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role = 'super_admin'::text) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)))))));
ALTER TABLE "llm_generations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all llm generations" ON "llm_generations" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete own generations" ON "llm_generations" AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((( SELECT p.role
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))) = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can insert generations for own cabinet" ON "llm_generations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view own cabinet generations" ON "llm_generations" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id = ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "llm_prompt_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet admins can delete prompt templates" ON "llm_prompt_templates" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Cabinet admins can insert prompt templates" ON "llm_prompt_templates" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Cabinet admins can update prompt templates" ON "llm_prompt_templates" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Cabinet members can view prompt templates" ON "llm_prompt_templates" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Super admins can view all llm prompt templates" ON "llm_prompt_templates" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "mcp_api_keys" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet admins can create MCP keys" ON "mcp_api_keys" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))) AND (created_by = auth.uid())));
CREATE POLICY "Cabinet admins can delete MCP keys" ON "mcp_api_keys" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "Cabinet admins can update MCP keys" ON "mcp_api_keys" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "Cabinet admins can view MCP keys" ON "mcp_api_keys" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY "Super admins can view all MCP keys" ON "mcp_api_keys" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));
ALTER TABLE "mcp_oauth_codes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can delete oauth codes" ON "mcp_oauth_codes" AS PERMISSIVE FOR DELETE TO service_role USING (true);
CREATE POLICY "Service role can insert oauth codes" ON "mcp_oauth_codes" AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update oauth codes" ON "mcp_oauth_codes" AS PERMISSIVE FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Super admins can view oauth codes" ON "mcp_oauth_codes" AS PERMISSIVE FOR SELECT TO authenticated USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text));
ALTER TABLE "mcp_oauth_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can delete oauth tokens" ON "mcp_oauth_tokens" AS PERMISSIVE FOR DELETE TO service_role USING (true);
CREATE POLICY "Service role can insert oauth tokens" ON "mcp_oauth_tokens" AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update oauth tokens" ON "mcp_oauth_tokens" AS PERMISSIVE FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Super admins can view oauth tokens" ON "mcp_oauth_tokens" AS PERMISSIVE FOR SELECT TO authenticated USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text));
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all notification preferences" ON "notification_preferences" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete own notification preferences" ON "notification_preferences" AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own notification preferences" ON "notification_preferences" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own notification preferences" ON "notification_preferences" AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own notification preferences" ON "notification_preferences" AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all notifications" ON "notifications" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete their own notifications" ON "notifications" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert notifications for cabinet members" ON "notifications" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (profiles p1
     JOIN profiles p2 ON ((p1.cabinet_id = p2.cabinet_id)))
  WHERE ((p1.id = ( SELECT auth.uid() AS uid)) AND (p2.id = notifications.user_id)))));
CREATE POLICY "Users can update their own notifications" ON "notifications" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view their own notifications" ON "notifications" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER TABLE "officer_companies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet users can delete officer companies" ON "officer_companies" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = officer_companies.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can insert officer companies" ON "officer_companies" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = officer_companies.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can update officer companies" ON "officer_companies" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = officer_companies.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = officer_companies.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
CREATE POLICY "Cabinet users can view officer companies" ON "officer_companies" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = officer_companies.client_id) AND ((clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR is_super_admin())))));
ALTER TABLE "opportunity_attachments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_opportunity_attachments" ON "opportunity_attachments" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "insert_opportunity_attachments" ON "opportunity_attachments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "select_opportunity_attachments" ON "opportunity_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
ALTER TABLE "opportunity_cards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete opportunity cards" ON "opportunity_cards" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can insert opportunity cards" ON "opportunity_cards" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can update opportunity cards" ON "opportunity_cards" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin())) WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can view opportunity cards" ON "opportunity_cards" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
ALTER TABLE "opportunity_columns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete opportunity columns" ON "opportunity_columns" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can insert opportunity columns" ON "opportunity_columns" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can update opportunity columns" ON "opportunity_columns" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin())) WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "Cabinet members can view opportunity columns" ON "opportunity_columns" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can insert profiles in their cabinet" ON "profiles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((get_user_role() = 'admin'::text) AND (cabinet_id IS NOT NULL) AND (cabinet_id = get_user_cabinet_id())));
CREATE POLICY "Admins can update profiles in their cabinet" ON "profiles" AS PERMISSIVE FOR UPDATE TO authenticated USING (((get_user_role() = 'admin'::text) AND (cabinet_id IS NOT NULL) AND (cabinet_id = get_user_cabinet_id()))) WITH CHECK (((get_user_role() = 'admin'::text) AND (cabinet_id IS NOT NULL) AND (cabinet_id = get_user_cabinet_id())));
CREATE POLICY "Super admins can delete profiles" ON "profiles" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can insert profiles" ON "profiles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can update all profiles" ON "profiles" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can view all profiles" ON "profiles" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can update own profile" ON "profiles" AS PERMISSIVE FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = id) AND (is_active = true))) WITH CHECK (((( SELECT auth.uid() AS uid) = id) AND (is_active = true)));
CREATE POLICY "Users can view own profile" ON "profiles" AS PERMISSIVE FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view profiles in their cabinet" ON "profiles" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IS NOT NULL) AND (cabinet_id = get_user_cabinet_id())));
ALTER TABLE "regimes_fiscaux" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can create regimes in their cabinet" ON "regimes_fiscaux" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))) OR (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
CREATE POLICY "Admins can delete regimes in their cabinet" ON "regimes_fiscaux" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))) OR is_super_admin()));
CREATE POLICY "Admins can update regimes in their cabinet" ON "regimes_fiscaux" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))) OR is_super_admin())) WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))) OR is_super_admin()));
CREATE POLICY "Users can read regimes of their cabinet" ON "regimes_fiscaux" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR is_super_admin()));
ALTER TABLE "relance_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete their relance history" ON "relance_history" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can insert relance history" ON "relance_history" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can update their relance history" ON "relance_history" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid())))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can view their relance history" ON "relance_history" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Super admins can view all relance history" ON "relance_history" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "relance_invoices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete their relance invoices" ON "relance_invoices" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can insert relance invoices" ON "relance_invoices" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can update their relance invoices" ON "relance_invoices" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid())))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can view their relance invoices" ON "relance_invoices" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Super admins can view all relance invoices" ON "relance_invoices" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "revenue_declaration_attachments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete revenue declaration attachments" ON "revenue_declaration_attachments" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can insert revenue declaration attachments" ON "revenue_declaration_attachments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can view revenue declaration attachments" ON "revenue_declaration_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Super admins can view all revenue declaration attachments" ON "revenue_declaration_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "revenue_declaration_collaborators" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can assign declaration collaborators" ON "revenue_declaration_collaborators" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (revenue_declarations rd
     JOIN profiles p ON ((p.cabinet_id = rd.cabinet_id)))
  WHERE ((rd.id = revenue_declaration_collaborators.declaration_id) AND (p.id = auth.uid())))));
CREATE POLICY "Cabinet members can remove declaration collaborators" ON "revenue_declaration_collaborators" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (revenue_declarations rd
     JOIN profiles p ON ((p.cabinet_id = rd.cabinet_id)))
  WHERE ((rd.id = revenue_declaration_collaborators.declaration_id) AND (p.id = auth.uid())))));
CREATE POLICY "Cabinet members can view declaration collaborators" ON "revenue_declaration_collaborators" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (revenue_declarations rd
     JOIN profiles p ON ((p.cabinet_id = rd.cabinet_id)))
  WHERE ((rd.id = revenue_declaration_collaborators.declaration_id) AND (p.id = auth.uid())))));
CREATE POLICY "Super admins can view all declaration collaborators" ON "revenue_declaration_collaborators" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "revenue_declaration_deadlines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view deadlines" ON "revenue_declaration_deadlines" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins can delete deadlines" ON "revenue_declaration_deadlines" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can insert deadlines" ON "revenue_declaration_deadlines" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can update deadlines" ON "revenue_declaration_deadlines" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
ALTER TABLE "revenue_declarations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can delete revenue declarations" ON "revenue_declarations" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can insert revenue declarations" ON "revenue_declarations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can update revenue declarations" ON "revenue_declarations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid())))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Cabinet members can view revenue declarations" ON "revenue_declarations" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Super admins can delete revenue declarations" ON "revenue_declarations" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can insert revenue declarations" ON "revenue_declarations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can update revenue declarations" ON "revenue_declarations" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can view all revenue declarations" ON "revenue_declarations" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "siren_denominations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all siren denominations" ON "siren_denominations" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete their cabinet denominations" ON "siren_denominations" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert denominations for their cabinet" ON "siren_denominations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update their cabinet denominations" ON "siren_denominations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view their cabinet denominations" ON "siren_denominations" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "software" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can delete their cabinet's software" ON "software" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR is_super_admin()));
CREATE POLICY "Users can insert software in their cabinet" ON "software" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ((((( SELECT auth.jwt() AS jwt) ->> 'app_metadata'::text))::jsonb ->> 'role'::text) = 'super_admin'::text)));
CREATE POLICY "Users can update their cabinet's software" ON "software" AS PERMISSIVE FOR UPDATE TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR is_super_admin())) WITH CHECK (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR is_super_admin()));
CREATE POLICY "Users can view their cabinet's software" ON "software" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR is_super_admin()));
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet admins can update tickets from their cabinet" ON "support_tickets" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles admin_profile
  WHERE ((admin_profile.id = auth.uid()) AND (admin_profile.role = 'admin'::text) AND (admin_profile.cabinet_id = ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = support_tickets.user_id))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles admin_profile
  WHERE ((admin_profile.id = auth.uid()) AND (admin_profile.role = 'admin'::text) AND (admin_profile.cabinet_id = ( SELECT p.cabinet_id
           FROM profiles p
          WHERE (p.id = support_tickets.user_id)))))));
CREATE POLICY "Cabinet members can view own cabinet tickets" ON "support_tickets" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id = ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Super admins can delete any ticket" ON "support_tickets" AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'super_admin'::text));
CREATE POLICY "Super admins can update any ticket" ON "support_tickets" AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'super_admin'::text)) WITH CHECK ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'super_admin'::text));
CREATE POLICY "Super admins can view all support tickets" ON "support_tickets" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can view all tickets" ON "support_tickets" AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'super_admin'::text));
CREATE POLICY "Users can create tickets for own cabinet" ON "support_tickets" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (cabinet_id = ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can delete own tickets" ON "support_tickets" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update own tickets" ON "support_tickets" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER TABLE "sync_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can create sync jobs" ON "sync_jobs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (user_id = auth.uid())));
CREATE POLICY "Cabinet members can delete their sync jobs" ON "sync_jobs" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR is_super_admin()));
CREATE POLICY "Cabinet members can update their sync jobs" ON "sync_jobs" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Cabinet members can view their sync jobs" ON "sync_jobs" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR is_super_admin()));
ALTER TABLE "sync_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can delete sync settings for their cabinet" ON "sync_settings" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Admins can insert sync settings for their cabinet" ON "sync_settings" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Admins can update sync settings for their cabinet" ON "sync_settings" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))) WITH CHECK ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Super admins can view all sync settings" ON "sync_settings" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can view sync settings for their cabinet" ON "sync_settings" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.cabinet_id IS NOT NULL)))));
ALTER TABLE "task_attachments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delete_task_attachments" ON "task_attachments" AS PERMISSIVE FOR DELETE TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "insert_task_attachments" ON "task_attachments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
CREATE POLICY "select_task_attachments" ON "task_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id = get_user_cabinet_id()) OR is_super_admin()));
ALTER TABLE "task_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all task categories" ON "task_categories" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete categories in their cabinet" ON "task_categories" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert categories in their cabinet" ON "task_categories" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update categories in their cabinet" ON "task_categories" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view categories in their cabinet" ON "task_categories" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "task_comments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all task comments" ON "task_comments" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete their own comments" ON "task_comments" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert comments on tasks in their cabinet" ON "task_comments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_comments.task_id) AND (tasks.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "Users can update their own comments" ON "task_comments" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view comments on tasks in their cabinet" ON "task_comments" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tasks
  WHERE ((tasks.id = task_comments.task_id) AND (tasks.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))));
ALTER TABLE "task_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all task templates" ON "task_templates" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete templates in their cabinet" ON "task_templates" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert templates in their cabinet" ON "task_templates" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update templates in their cabinet" ON "task_templates" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view templates in their cabinet" ON "task_templates" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all tasks" ON "tasks" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete tasks in their cabinet" ON "tasks" AS PERMISSIVE FOR DELETE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert tasks in their cabinet" ON "tasks" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can update tasks in their cabinet" ON "tasks" AS PERMISSIVE FOR UPDATE TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view tasks in their cabinet" ON "tasks" AS PERMISSIVE FOR SELECT TO authenticated USING ((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER TABLE "tax_authorizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all tax authorizations" ON "tax_authorizations" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete tax authorizations of their cabinet's clients" ON "tax_authorizations" AS PERMISSIVE FOR DELETE TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can insert tax authorizations for their cabinet's clients" ON "tax_authorizations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can update tax authorizations of their cabinet's clients" ON "tax_authorizations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can view tax authorizations of their cabinet's clients" ON "tax_authorizations" AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER TABLE "tax_exemption_results" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all tax exemption results" ON "tax_exemption_results" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete results for their cabinet exemptions" ON "tax_exemption_results" AS PERMISSIVE FOR DELETE TO authenticated USING ((tax_exemption_id IN ( SELECT te.id
   FROM tax_exemptions te
  WHERE (te.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
                   FROM profiles p
                  WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "Users can insert results for their cabinet exemptions" ON "tax_exemption_results" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((tax_exemption_id IN ( SELECT te.id
   FROM tax_exemptions te
  WHERE (te.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
                   FROM profiles p
                  WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "Users can update results for their cabinet exemptions" ON "tax_exemption_results" AS PERMISSIVE FOR UPDATE TO authenticated USING ((tax_exemption_id IN ( SELECT te.id
   FROM tax_exemptions te
  WHERE (te.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
                   FROM profiles p
                  WHERE (p.id = ( SELECT auth.uid() AS uid))))))))) WITH CHECK ((tax_exemption_id IN ( SELECT te.id
   FROM tax_exemptions te
  WHERE (te.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
                   FROM profiles p
                  WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "Users can view results for their cabinet exemptions" ON "tax_exemption_results" AS PERMISSIVE FOR SELECT TO authenticated USING ((tax_exemption_id IN ( SELECT te.id
   FROM tax_exemptions te
  WHERE (te.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.cabinet_id IN ( SELECT p.cabinet_id
                   FROM profiles p
                  WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
ALTER TABLE "tax_exemptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all tax exemptions" ON "tax_exemptions" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete tax exemptions of their cabinet's clients" ON "tax_exemptions" AS PERMISSIVE FOR DELETE TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can insert tax exemptions for their cabinet's clients" ON "tax_exemptions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can update tax exemptions of their cabinet's clients" ON "tax_exemptions" AS PERMISSIVE FOR UPDATE TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can view tax exemptions of their cabinet's clients" ON "tax_exemptions" AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.cabinet_id IN ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER TABLE "ticket_attachments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can add attachments" ON "ticket_attachments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (ticket_messages tm
     JOIN support_tickets st ON ((st.id = tm.ticket_id)))
  WHERE ((tm.id = ticket_attachments.message_id) AND (tm.sender_id = ( SELECT auth.uid() AS uid)) AND (st.cabinet_id = ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "Cabinet members can view attachments" ON "ticket_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (ticket_messages tm
     JOIN support_tickets st ON ((st.id = tm.ticket_id)))
  WHERE ((tm.id = ticket_attachments.message_id) AND (tm.is_internal = false) AND (st.cabinet_id = ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY "Super admins can add any attachment" ON "ticket_attachments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'super_admin'::text));
CREATE POLICY "Super admins can view all attachments" ON "ticket_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'super_admin'::text));
CREATE POLICY "Super admins can view all ticket attachments" ON "ticket_attachments" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "ticket_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet members can send messages" ON "ticket_messages" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (is_internal = false) AND (EXISTS ( SELECT 1
   FROM support_tickets st
  WHERE ((st.id = ticket_messages.ticket_id) AND (st.cabinet_id = ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "Cabinet members can view ticket messages" ON "ticket_messages" AS PERMISSIVE FOR SELECT TO authenticated USING (((is_internal = false) AND (EXISTS ( SELECT 1
   FROM support_tickets st
  WHERE ((st.id = ticket_messages.ticket_id) AND (st.cabinet_id = ( SELECT profiles.cabinet_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))))));
CREATE POLICY "Super admins can send any message" ON "ticket_messages" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'super_admin'::text)));
CREATE POLICY "Super admins can view all messages" ON "ticket_messages" AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = 'super_admin'::text));
CREATE POLICY "Super admins can view all ticket messages" ON "ticket_messages" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can delete own preferences" ON "user_preferences" AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own preferences" ON "user_preferences" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own preferences" ON "user_preferences" AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own preferences" ON "user_preferences" AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
ALTER TABLE "user_row_orders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all user row orders" ON "user_row_orders" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY "Users can delete own row orders" ON "user_row_orders" AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own row orders" ON "user_row_orders" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own row orders" ON "user_row_orders" AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own row orders" ON "user_row_orders" AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
ALTER TABLE "web_directory_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet admins can create directory categories" ON "web_directory_categories" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::text))))) OR (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
CREATE POLICY "Cabinet admins can delete directory categories" ON "web_directory_categories" AS PERMISSIVE FOR DELETE TO authenticated USING ((((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) OR is_super_admin()));
CREATE POLICY "Cabinet admins can update directory categories" ON "web_directory_categories" AS PERMISSIVE FOR UPDATE TO authenticated USING ((((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) OR is_super_admin())) WITH CHECK ((((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) OR is_super_admin()));
CREATE POLICY "Cabinet members can view their directory categories" ON "web_directory_categories" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR is_super_admin()));
ALTER TABLE "web_directory_default_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can create default categories" ON "web_directory_default_categories" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text));
CREATE POLICY "Super admins can delete default categories" ON "web_directory_default_categories" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can update default categories" ON "web_directory_default_categories" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can view default categories" ON "web_directory_default_categories" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "web_directory_default_links" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can create default links" ON "web_directory_default_links" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text));
CREATE POLICY "Super admins can delete default links" ON "web_directory_default_links" AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
CREATE POLICY "Super admins can update default links" ON "web_directory_default_links" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Super admins can view default links" ON "web_directory_default_links" AS PERMISSIVE FOR SELECT TO authenticated USING (is_super_admin());
ALTER TABLE "web_directory_links" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cabinet admins can create directory links" ON "web_directory_links" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((cabinet_id IN ( SELECT profiles.cabinet_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::text))))) OR (((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
CREATE POLICY "Cabinet admins can delete directory links" ON "web_directory_links" AS PERMISSIVE FOR DELETE TO authenticated USING ((((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) OR is_super_admin()));
CREATE POLICY "Cabinet admins can update directory links" ON "web_directory_links" AS PERMISSIVE FOR UPDATE TO authenticated USING ((((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) OR is_super_admin())) WITH CHECK ((((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) OR is_super_admin()));
CREATE POLICY "Cabinet members can view their directory links" ON "web_directory_links" AS PERMISSIVE FOR SELECT TO authenticated USING (((cabinet_id IN ( SELECT p.cabinet_id
   FROM profiles p
  WHERE (p.id = auth.uid()))) OR is_super_admin()));
