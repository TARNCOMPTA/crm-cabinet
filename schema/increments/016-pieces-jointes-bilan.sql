-- Les pièces jointes qui ne relèvent d'aucun point de checklist.
-- ===========================================================================
--
-- `bilan_checklist_attachments` rattache chaque fichier à un POINT de la
-- checklist : le bail va sous « Vérifier les baux », l'inventaire sous
-- « Inventaire signé ». C'est juste pour ce qui répond à une question de la
-- liste, et inutilisable pour tout le reste — le courrier de la banque, la
-- balance de l'expert précédent, le PV d'AG que le client envoie en vrac. Ces
-- pièces-là arrivent AVANT qu'on sache à quel point elles se rattachent, et
-- souvent elles ne s'y rattachent jamais.
--
-- ⚠️ POURQUOI UNE TABLE SÉPARÉE, ET NON UN `checklist_item_id` NULLABLE.
--
-- Rendre la colonne nullable aurait été plus court d'une ligne, et faux sur
-- trois points :
--
--   · la clé étrangère cascade depuis `bilan_checklist_items`. Une pièce sans
--     point de checklist n'aurait plus rien pour la supprimer avec sa carte :
--     elle survivrait au bilan, orpheline, invisible et jamais nettoyée ;
--   · `checklist_item_id NOT NULL` est une garantie que du code existant lit
--     déjà — l'assouplir demande de relire chaque appel pour savoir lesquels
--     supposent la valeur présente ;
--   · les deux jeux ne se listent jamais ensemble. Un `WHERE ... IS NULL`
--     partout serait la trace permanente d'un modèle qui mélange deux choses.
--
-- Ici la cascade part de `bilan_cards` : la pièce disparaît avec le bilan
-- auquel elle appartient, ce qui est exactement sa durée de vie.
--
-- Le stockage reste le bucket `bilan-checklist-attachments`, sous le préfixe
-- `<carte>/divers/` : un seul bucket à déclarer côté serveur, et le chemin dit
-- déjà de quoi il s'agit.
--
-- Les trois règles du dossier : pas de BEGIN/COMMIT, rien de non transactionnel,
-- idempotence.

CREATE TABLE IF NOT EXISTS "bilan_card_attachments" (
  "id"           uuid DEFAULT gen_random_uuid() NOT NULL,
  "card_id"      uuid NOT NULL,
  "file_name"    text NOT NULL,
  "file_size"    bigint NOT NULL,
  "mime_type"    text NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_by"  uuid,
  "created_at"   timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bilan_card_attachments_pkey" PRIMARY KEY (id),
  CONSTRAINT "bilan_card_attachments_card_id_fkey"
    FOREIGN KEY (card_id) REFERENCES bilan_cards(id) ON DELETE CASCADE,
  CONSTRAINT "bilan_card_attachments_uploaded_by_fkey"
    FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Les deux index que réclame la garde de `tests/schema.test.ts` : PostgreSQL
-- n'indexe jamais la colonne SOURCE d'une clé étrangère (voir l'incrément 015).
CREATE INDEX IF NOT EXISTS "idx_bilan_card_attachments_card"
  ON "bilan_card_attachments" (card_id);
CREATE INDEX IF NOT EXISTS "idx_bilan_card_attachments_uploaded_by"
  ON "bilan_card_attachments" (uploaded_by);
