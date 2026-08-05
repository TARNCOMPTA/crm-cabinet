-- 001 — Suivi des échéances : cache des télétransmissions et suivi interne.
--
-- POURQUOI CE FICHIER EXISTE.
-- `schema/cible.sql` n'est appliqué qu'à la PREMIÈRE initialisation
-- (docker/entree.sh, témoin `to_regclass('public.profiles')`), et `maj.sh` ne
-- fait que sauvegarder puis tirer l'image. Une table ajoutée à `cible.sql`
-- n'apparaît donc sur aucune instance déjà en service. Sans ce fichier, la page
-- « Suivi échéances » ne fonctionnerait que sur une installation neuve.
--
-- CE QU'IL EST, ET CE QU'IL N'EST PAS.
-- Ce n'est pas un système de migrations : pas de table de suivi, pas de sens de
-- marche, pas de retour arrière. C'est un fichier REJOUÉ À CHAQUE DÉMARRAGE,
-- donc entièrement idempotent. La contrepartie est qu'il duplique une partie de
-- `cible.sql` ; `tests/schema.test.ts` rejoue les deux sur une base fraîche, et
-- échoue s'ils divergent.
--
-- Le contenu doit rester STRICTEMENT identique à celui de `cible.sql`. La
-- justification de chaque choix (le SIREN plutôt que le SIRET dans la clé,
-- `client_id` hors de la clé, le cache) est écrite là-bas et n'est pas répétée
-- ici : deux copies d'un même raisonnement divergent toujours.

CREATE TABLE IF NOT EXISTS "jedeclare_suivi_interne" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "siren" text NOT NULL,
  "type_declaration" text NOT NULL,
  "mois" text NOT NULL,
  "axe" text DEFAULT 'periode'::text NOT NULL,
  "societe" text DEFAULT ''::text NOT NULL,
  "siret" text,
  "dossier" text,
  "client_id" uuid,
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

CREATE TABLE IF NOT EXISTS "jedeclare_teletransmissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "numero" text NOT NULL,
  "type_piece" text NOT NULL,
  "ligne" integer DEFAULT 0 NOT NULL,
  "procedure" text DEFAULT ''::text NOT NULL,
  "nature" text DEFAULT ''::text NOT NULL,
  "numero_ads" text DEFAULT ''::text NOT NULL,
  "date_avis" text DEFAULT ''::text NOT NULL,
  "siret" text DEFAULT ''::text NOT NULL,
  "siren" text DEFAULT ''::text NOT NULL,
  "societe" text DEFAULT ''::text NOT NULL,
  "dossier" text DEFAULT ''::text NOT NULL,
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

-- Les clés étrangères n'ont pas de `IF NOT EXISTS` en PostgreSQL : le bloc
-- avale l'erreur de doublon, et elle seule.
DO $$
BEGIN
  ALTER TABLE "jedeclare_suivi_interne" ADD CONSTRAINT "jedeclare_suivi_interne_client_id_fkey"
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "jedeclare_suivi_interne" ADD CONSTRAINT "jedeclare_suivi_interne_assignee_id_fkey"
    FOREIGN KEY (assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "jedeclare_suivi_interne" ADD CONSTRAINT "jedeclare_suivi_interne_updated_by_fkey"
    FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS jedeclare_suivi_interne_cellule_key
  ON public.jedeclare_suivi_interne USING btree (siren, type_declaration, mois, axe);
CREATE INDEX IF NOT EXISTS idx_jedeclare_suivi_interne_client_id
  ON public.jedeclare_suivi_interne USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_jedeclare_suivi_interne_mois
  ON public.jedeclare_suivi_interne USING btree (mois);
CREATE UNIQUE INDEX IF NOT EXISTS jedeclare_teletransmissions_piece_key
  ON public.jedeclare_teletransmissions USING btree (numero, type_piece, ligne);
CREATE INDEX IF NOT EXISTS idx_jedeclare_teletransmissions_periode_fin
  ON public.jedeclare_teletransmissions USING btree (periode_fin);
CREATE INDEX IF NOT EXISTS idx_jedeclare_teletransmissions_siren
  ON public.jedeclare_teletransmissions USING btree (siren);

-- `CREATE TRIGGER` n'accepte `IF NOT EXISTS` qu'à partir de PostgreSQL 18 ;
-- l'instance tourne en 17. On le retire puis on le repose : c'est atomique dans
-- la transaction du point d'entrée.
DROP TRIGGER IF EXISTS set_jedeclare_suivi_interne_updated_at ON public.jedeclare_suivi_interne;
CREATE TRIGGER set_jedeclare_suivi_interne_updated_at
  BEFORE UPDATE ON public.jedeclare_suivi_interne
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
