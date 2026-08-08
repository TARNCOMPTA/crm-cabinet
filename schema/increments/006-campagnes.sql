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
-- cas — le cabinet leur ecrit deja individuellement. Ce drapeau ne dit pas
-- « a accepte une newsletter », il dit « n'a pas demande a ne plus recevoir ».
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
-- mois de cloture, collaborateurs). Pas pour la rejouer automatiquement — le
-- portefeuille bouge — mais pour repondre a « a qui ai-je ecrit, au fait ? » six
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
-- ⚠️ PAS DE CLE ETRANGERE SUR `email_queue_id`, ET C'EST DELIBERE. La tache
-- `purge-file-emails` supprime chaque dimanche les lignes de `email_queue`
-- traitees depuis plus de 30 jours. Une cle etrangere ferait echouer cette purge,
-- ou — pire avec ON DELETE CASCADE — emporterait la tracabilite qui est la raison
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
