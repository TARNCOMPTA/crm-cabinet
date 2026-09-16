-- Les résultats restent disponibles après la purge de la file d'envoi.
-- NULL signifie inconnu : ne pas inventer le résultat des emails déjà purgés.
ALTER TABLE mailing_destinataires ADD COLUMN IF NOT EXISTS statut_envoi text;
ALTER TABLE mailing_destinataires ADD COLUMN IF NOT EXISTS envoye_le timestamptz;
ALTER TABLE mailing_destinataires ADD COLUMN IF NOT EXISTS erreur_envoi text;
CREATE INDEX IF NOT EXISTS idx_mailing_destinataires_file ON mailing_destinataires(email_queue_id);

CREATE OR REPLACE FUNCTION conserver_resultat_campagne() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE mailing_destinataires
       SET statut_envoi = OLD.status, envoye_le = OLD.sent_at, erreur_envoi = OLD.error_message
     WHERE email_queue_id = OLD.id;
    RETURN OLD;
  END IF;
  UPDATE mailing_destinataires
     SET statut_envoi = NEW.status, envoye_le = NEW.sent_at, erreur_envoi = NEW.error_message
   WHERE email_queue_id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION conserver_resultat_campagne() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_conserver_resultat_campagne ON email_queue;
CREATE TRIGGER trg_conserver_resultat_campagne
  AFTER UPDATE OF status, sent_at, error_message OR DELETE ON email_queue
  FOR EACH ROW EXECUTE FUNCTION conserver_resultat_campagne();

-- Reprise des résultats encore présents au moment de la mise à jour.
UPDATE mailing_destinataires d
   SET statut_envoi = q.status, envoye_le = q.sent_at, erreur_envoi = q.error_message
  FROM email_queue q WHERE q.id = d.email_queue_id;
