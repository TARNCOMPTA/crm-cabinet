-- Surcharge du jour d'échéance TVA, par client.
-- ===========================================================================
-- Le suivi des échéances affiche désormais, pour chaque société en TVA
-- mensuelle ou trimestrielle, le jour du calendrier CA3 auquel sa déclaration
-- est due : le 16 ou le 19 pour un entrepreneur individuel selon l'initiale de
-- son nom, le 21 pour les sociétés autres que par actions, le 24 pour les SA et
-- assimilées.
--
-- ---------------------------------------------------------------------------
-- POURQUOI UNE SURCHARGE, ET PAS SEULEMENT LA RÈGLE
--
-- La règle se déduit de la forme juridique, et la forme juridique est une
-- donnée DÉCLARATIVE du CRM :
--
--   · `clients.forme_juridique` porte tantôt le code INSEE, tantôt le libellé —
--     `legal_forms` est créée vide et se peuple ou non selon l'instance ;
--   · elle peut être absente ; environ un dossier sur dix n'a jamais été
--     renseigné ;
--   · rien ne la corrige après une transformation : une SARL passée en SAS
--     reste SARL au CRM tant que personne n'a repris la fiche.
--
-- Une règle appliquée à 940 clients sans échappatoire produirait donc des
-- échéances fausses, affichées avec le même aplomb que les justes. Cette
-- colonne est l'échappatoire : ce qu'elle contient PRIME SUR LA RÈGLE.
--
-- ---------------------------------------------------------------------------
-- NULL EST LA VALEUR NORMALE
--
-- `NULL` ne veut pas dire « pas encore calculé » mais « applique la règle ».
-- Aucun remplissage initial n'est fait, et c'est délibéré : figer aujourd'hui
-- le résultat de la règle dans 940 lignes transformerait une déduction, qui se
-- corrige en un point, en 940 valeurs saisies qu'il faudrait ensuite maintenir
-- une par une. La colonne ne se remplit qu'à la main, dossier par dossier,
-- quand quelqu'un constate que la déduction se trompe.
--
-- C'est aussi ce qui rend cet incrément intégralement réversible : le supprimer
-- ne perd que des arbitrages explicites, jamais une donnée calculée.
--
-- ---------------------------------------------------------------------------
-- LES TROIS RÈGLES DU DOSSIER
--
--   1. Aucun BEGIN/COMMIT : docker/entree.sh possède la transaction.
--   2. Aucun ordre non transactionnel.
--   3. Idempotence dans le fichier — `IF NOT EXISTS` sur la colonne, et la
--      contrainte posée dans un bloc qui avale le doublon.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS "tva_jour_echeance" smallint;

-- Le CHECK borne au calendrier civil, pas aux quatre valeurs du calendrier CA3 :
-- la surcharge existe précisément pour les cas que la règle ne couvre pas, et
-- la brider à {16, 19, 21, 24} lui retirerait sa raison d'être — une TVA
-- annuelle, par exemple, n'a aucune raison de tomber sur l'un de ces quatre
-- jours.
DO $$
BEGIN
  ALTER TABLE clients ADD CONSTRAINT "clients_tva_jour_echeance_check"
    CHECK (tva_jour_echeance IS NULL OR (tva_jour_echeance BETWEEN 1 AND 31));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
