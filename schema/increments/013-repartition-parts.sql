-- Répartition des parts sociales : qui détient quoi, et depuis quel acte.
-- ===========================================================================
--
-- Le CRM savait déjà NOMMER les associés — `officer_companies.role_type`
-- accepte la valeur `'associe'` — mais pas dire COMBIEN chacun détient. La
-- seule donnée capitalistique de la base était `clients.capital_social`, un
-- montant. Pour répondre à « M. X détient-il 250 parts sur 1 000 ? », il
-- fallait rouvrir les statuts.
--
-- ---------------------------------------------------------------------------
-- POURQUOI CETTE TABLE EXISTE, ET CE QU'ELLE CORRIGE
--
-- Le connecteur MCP sait lire les statuts déposés au greffe et en rendre le
-- texte (`server/src/inpi/statuts-texte.ts`). Ce travail porte une réserve
-- écrite en toutes lettres, et cette table est sa réponse :
--
--     les statuts déposés ne reflètent PAS les cessions de parts postérieures
--     au dépôt.
--
-- Les cessions se font par acte séparé, le plus souvent notarié, et les statuts
-- ne sont pas systématiquement mis à jour — leur redépôt au greffe encore
-- moins. Un statut de 2004 peut donc annoncer avec assurance une répartition
-- qui a changé trois fois depuis.
--
-- Ce que cette table apporte n'est donc pas une commodité d'affichage : c'est
-- la SEULE version du chiffre qui puisse figurer dans une attestation signée
-- sans qu'un humain rouvre le PDF. Elle est saisie par le cabinet, qui sait ce
-- que le greffe ignore.
--
-- ---------------------------------------------------------------------------
-- UN ÉTAT COURANT, PAS UN JOURNAL DES MOUVEMENTS
--
-- Une ligne = ce qu'un associé détient AUJOURD'HUI, avec depuis quand
-- (`date_effet`) et par quel acte (`legal_act_id` ou `acte_source`). Une
-- cession se saisit en corrigeant les deux lignes concernées.
--
-- Un journal des mouvements — une ligne par cession, l'état reconstruit par
-- accumulation — a été écarté délibérément. Il demanderait une reconstruction
-- par date à chaque lecture, et le besoin qui a motivé cette table porte sur le
-- PRÉSENT. L'historique reste dans les actes, qui sont sa place.
--
-- ---------------------------------------------------------------------------
-- LES QUATRE CHOIX DE COLONNES QUI SE DÉFENDENT
--
--   · `officer_id` NOT NULL VERS `company_officers`, ET NON UN NOM LIBRE.
--     Un nom en texte libre serait une seconde source de vérité sur l'identité
--     d'une personne déjà présente en base — et deux orthographes du même
--     associé ne se rapprocheraient jamais. `company_officers` porte déjà
--     `person_type` physique/morale et `denomination` : une SCI détenue par une
--     holding y entre sans rien forcer.
--
--   · `demembrement` DANS LA CLÉ D'UNICITÉ. « M. X détient 250 parts en
--     nue-propriété et 100 en pleine propriété » est le cas ordinaire d'une SCI
--     familiale après donation. Sans cette colonne dans l'UNIQUE, la seconde
--     ligne serait refusée en 23505 — et une attestation qui confond
--     nue-propriété et pleine propriété est fausse, pas imprécise.
--
--   · `acte_source` EN TEXTE, À CÔTÉ DE `legal_act_id` ET NON À SA PLACE.
--     `legal_acts` ne contient que ce qui est déposé au greffe. La plupart des
--     cessions de parts n'y sont pas : elles vivent chez le notaire. Sans champ
--     libre, l'origine resterait vide dans la majorité des cas — c'est-à-dire
--     précisément là où elle compte le plus.
--
--   · `date_effet` NULLABLE. Une reprise de portefeuille connaît souvent la
--     détention sans la date. La rendre obligatoire ferait inventer une date,
--     ce qui est pire que de ne pas en avoir : une date fausse ne se voit pas.
--
-- ---------------------------------------------------------------------------
-- `clients.parts_totales` : LE DÉNOMINATEUR, ET LE DÉTECTEUR D'INCOMPLÉTUDE
--
-- `capital_social` est un montant, pas un nombre de titres. « N parts sur T »
-- a besoin de T, et T ne se déduit pas du capital sans connaître la valeur
-- nominale.
--
-- ⚠️ LE STOCKER PLUTÔT QUE DE SOMMER `nb_parts` EST TOUT L'INTÉRÊT DE LA
-- COLONNE. Une répartition à moitié saisie, si on la sommait pour obtenir le
-- total, donnerait des pourcentages qui tombent juste — 100 % répartis entre
-- deux associés sur les cinq que compte la société. Le chiffre serait faux et
-- rien ne le signalerait. Avec un total DÉCLARÉ, l'écart se voit, et c'est lui
-- qu'affiche l'écran.
--
-- La valeur nominale (`capital_social / parts_totales`) n'est pas stockée : on
-- ne garde pas ce qui se déduit, sous peine d'avoir un jour deux réponses.
--
-- ---------------------------------------------------------------------------
-- LES RÈGLES DU DOSSIER, ET CE QU'ELLES DONNENT ICI
--
--   1. Aucun BEGIN/COMMIT : docker/entree.sh possède la transaction ;
--   2. aucun ordre non transactionnel ;
--   3. idempotence dans le fichier, en ceinture du registre
--      crm_meta.schema_migrations.
--
-- Le trigger passe par DROP puis CREATE : `CREATE TRIGGER IF NOT EXISTS`
-- n'existe qu'à partir de PostgreSQL 18, et l'instance tourne en 17. Le retrait
-- suivi de la repose est atomique dans la transaction du point d'entrée.
--
-- AUCUN GRANT, contrairement à l'incrément 011 qui en posait un par prudence.
-- Vérifié : `schema/auth-interne.sql` pose un `ALTER DEFAULT PRIVILEGES IN
-- SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO
-- authenticated`, qui couvre les tables FUTURES créées par le même rôle. Une
-- table de répartition des parts n'a par ailleurs aucune raison d'être fermée :
-- c'est du contenu de travail, comme les clients et les tâches, et c'est
-- `server/src/rest-droits.ts` qui décide qui peut quoi.

-- ---------------------------------------------------------------------------
-- Le nombre total de parts composant le capital, sur la fiche.
-- Ni NOT NULL ni défaut : une fiche qui ne le connaît pas ne le connaît pas, et
-- un `0` par défaut mentirait — il rendrait toute division impossible tout en
-- ayant l'air d'une valeur saisie.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS parts_totales numeric;

-- ---------------------------------------------------------------------------
-- La répartition elle-même.
CREATE TABLE IF NOT EXISTS "client_associes" (
  "id"           uuid DEFAULT gen_random_uuid() NOT NULL,
  "client_id"    uuid NOT NULL,
  "officer_id"   uuid NOT NULL,
  "nb_parts"     numeric NOT NULL,
  "demembrement" text DEFAULT 'pleine-propriete'::text NOT NULL,
  "date_effet"   date,
  "legal_act_id" uuid,
  "acte_source"  text,
  "notes"        text,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_associes_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_associes_client_id_fkey"
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  -- CASCADE aussi sur la personne, comme `officer_companies` : supprimer un
  -- dirigeant du référentiel emporte ses mandats, il doit emporter ses
  -- détentions. Une détention orpheline désignerait un associé sans nom.
  CONSTRAINT "client_associes_officer_id_fkey"
    FOREIGN KEY (officer_id) REFERENCES company_officers(id) ON DELETE CASCADE,
  -- SET NULL, et non CASCADE : purger un acte du registre ne doit pas effacer
  -- la détention qu'il justifiait. `acte_source` reste, en texte.
  CONSTRAINT "client_associes_legal_act_id_fkey"
    FOREIGN KEY (legal_act_id) REFERENCES legal_acts(id) ON DELETE SET NULL,
  CONSTRAINT "client_associes_client_officer_demembrement_key"
    UNIQUE (client_id, officer_id, demembrement),
  -- Une détention nulle ou négative n'existe pas : c'est une ligne à supprimer,
  -- pas une ligne à zéro. La contrainte double la validation de l'écran.
  CONSTRAINT "client_associes_nb_parts_check" CHECK ((nb_parts > (0)::numeric)),
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
