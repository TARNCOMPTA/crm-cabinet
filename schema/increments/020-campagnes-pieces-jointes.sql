-- ============================================================================
-- Les pieces jointes d'une campagne.
-- ============================================================================
--
-- Le cabinet pouvait ecrire a une liste de clients, jamais leur JOINDRE quelque
-- chose. Une lettre de mission, une plaquette tarifaire, un modele de tableau a
-- remplir : tout cela repartait par un mail individuel, hors de l'outil, sans
-- trace — c'est-a-dire exactement le probleme que les campagnes existaient pour
-- resoudre.
--
-- ⚠️ ON STOCKE UNE REFERENCE, PAS LE FICHIER. Le contenu vit dans le bucket
-- `campagne-attachments`, sous STORAGE_DIR. Mettre un PDF de 3 Mo en base le
-- ferait recopier dans CHAQUE ligne de `email_queue` — trois cents destinataires
-- font neuf cents megaoctets — puis dans chaque sauvegarde, chaque restauration,
-- chaque replication. La base porte le nom, le chemin, le type et la taille ;
-- le disque porte les octets.
--
-- ⚠️ DEUX COLONNES, ET CE N'EST PAS UNE REDONDANCE OUBLIEE.
--
--   · `email_queue.pieces_jointes` est ce qui PART. L'ouvrier d'envoi
--     (server/src/file-emails.ts) lit la file seule, sans jointure : il doit y
--     trouver tout ce qu'il expedie. C'est aussi ce qui fige l'envoi — modifier
--     la campagne apres coup ne doit pas changer ce qui est deja en file.
--
--   · `mailing_campagnes.pieces_jointes` est ce qui RESTE. La tache
--     `purge-file-emails` supprime chaque dimanche les lignes d'`email_queue`
--     traitees depuis plus de 30 jours ; sans cette seconde colonne,
--     l'historique d'une campagne perdrait, un mois plus tard, la reponse a
--     « qu'est-ce que je leur ai envoye, au juste ? ». Meme raisonnement que
--     l'adresse figee dans `mailing_destinataires`, pour la meme raison.
--
-- ⚠️ `jsonb` PLUTOT QU'UNE TABLE FILLE, ET PLUTOT QU'UN `campagne_id` SUR LA
-- FILE. Une table fille imposerait une jointure a l'ouvrier, qui lit la file par
-- lots de cinquante sous verrou : la garder plate garde le verrou court. Et un
-- `campagne_id` sur `email_queue` lierait la file — generique, utilisee aussi
-- par les notifications — a une seule de ses sources. Une liste de pieces se
-- porte de la meme facon quelle que soit l'origine du courriel, et le jour ou un
-- mail depuis une fiche client devra en porter une, rien ne sera a migrer.
--
-- Forme attendue de chaque element, produite par server/src/routes/campagnes.ts
-- et relue par server/src/mail.ts :
--
--   { "nom": "lettre-de-mission.pdf",
--     "bucket": "campagne-attachments",
--     "chemin": "2026/09/ab12….pdf",
--     "type": "application/pdf",
--     "taille": 184320 }
--
-- ⚠️ LE CHEMIN LU ICI EST REVALIDE A L'ENVOI, par `stockage-chemin.ts`. Une
-- colonne `jsonb` est de la donnee : rien dans PostgreSQL n'empeche d'y ecrire
-- « ../../../etc/passwd ». Le controle au depot a eu lieu des jours plus tot, sur
-- une autre valeur ; il ne protege pas la lecture. La garde est donc du cote de
-- celui qui ouvre le fichier, pas seulement de celui qui l'enregistre.
-- ============================================================================

ALTER TABLE email_queue
  ADD COLUMN IF NOT EXISTS pieces_jointes jsonb DEFAULT '[]'::jsonb NOT NULL;

COMMENT ON COLUMN email_queue.pieces_jointes IS
  'Pieces a joindre a CE courriel : [{nom, bucket, chemin, type, taille}]. '
  'Reference le fichier dans le stockage, jamais son contenu. '
  'Le chemin est revalide a l''envoi par stockage-chemin.ts.';

ALTER TABLE mailing_campagnes
  ADD COLUMN IF NOT EXISTS pieces_jointes jsonb DEFAULT '[]'::jsonb NOT NULL;

COMMENT ON COLUMN mailing_campagnes.pieces_jointes IS
  'Trace des pieces envoyees avec la campagne. Survit a la purge d''email_queue, '
  'qui efface les lignes traitees depuis plus de 30 jours.';
