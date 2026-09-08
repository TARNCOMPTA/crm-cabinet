/**
 * Vidage de la file d'attente des emails.
 * ---------------------------------------------------------------------------
 * Reprend l'Edge Function `send-emails`, avec deux différences.
 *
 * Avant : pg_cron appelait `trigger_send_pending_emails()`, qui faisait un
 * `net.http_post` vers l'Edge Function, qui rouvrait une connexion à la base
 * pour lire la file. Trois sauts pour lire une table. Maintenant l'ordonnanceur
 * est dans ce processus : il lit la file directement.
 *
 * Avant : Resend. Maintenant : le SMTP du cabinet (voir mail.ts).
 *
 * `SELECT ... FOR UPDATE SKIP LOCKED` remplace le simple `SELECT` de l'Edge
 * Function : deux passes concurrentes — l'ordonnanceur et un déclenchement
 * manuel depuis l'interface — enverraient sinon le même mail deux fois.
 */

import { transaction } from './db.js';
import { envoyer } from './mail.js';

const TAILLE_LOT = 50;
const TENTATIVES_MAX = 3;

export interface BilanEnvoi {
  envoyes: number;
  echecs: number;
  total: number;
  /**
   * Le lot a été interrompu parce que le serveur refuse nos identifiants.
   * Les lignes non traitées restent `pending` et repartiront telles quelles une
   * fois les réglages corrigés.
   */
  interrompu: boolean;
}

interface LigneFile {
  id: string;
  to_email: string;
  subject: string;
  html_body: string;
  retry_count: number;
}

export async function viderFile(): Promise<BilanEnvoi> {
  // Les lignes sont verrouillées pendant tout le traitement du lot. Un lot de 50
  // mails vers un relais lent peut prendre une minute : acceptable, la file
  // n'est lue que par ce processus.
  return transaction(async (client) => {
    const { rows } = await client.query<LigneFile>(
      `SELECT id, to_email, subject, html_body, retry_count
         FROM email_queue
        WHERE status = 'pending' AND retry_count < $1
        ORDER BY created_at
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [TENTATIVES_MAX, TAILLE_LOT]
    );

    let envoyes = 0;
    let echecs = 0;

    for (const ligne of rows) {
      const r = await envoyer({
        destinataire: ligne.to_email,
        sujet: ligne.subject,
        html: ligne.html_body,
      });

      if (r.ok) {
        await client.query(
          `UPDATE email_queue SET status = 'sent', sent_at = now(), error_message = NULL WHERE id = $1`,
          [ligne.id]
        );
        envoyes++;
        continue;
      }

      // Un refus définitif ne mérite pas trois tentatives : on classe l'envoi en
      // erreur tout de suite, avec la raison, plutôt que de laisser la ligne
      // repasser deux fois pour rien.
      const abandonner = r.definitif || ligne.retry_count + 1 >= TENTATIVES_MAX;
      await client.query(
        `UPDATE email_queue
            SET status = $2, retry_count = $3, error_message = $4
          WHERE id = $1`,
        [ligne.id, abandonner ? 'error' : 'pending', ligne.retry_count + 1, r.raison.slice(0, 500)]
      );
      echecs++;

      /**
       * ⚠️ ON ARRÊTE LE LOT, ET C'EST POUR PROTÉGER LA BOÎTE DU CABINET.
       *
       * Un refus d'identifiants ne concerne pas CE message : il concerne la
       * connexion. Poursuivre le lot enverrait quarante-neuf demandes
       * d'authentification de plus, toutes vouées au même refus — et c'est
       * exactement ce qui fait verrouiller un compte Microsoft 365. Constaté en
       * production le 2026-09-08 : « account locked. Contact your
       * administrator. »
       *
       * Les lignes non traitées restent `pending`, donc rien n'est perdu :
       * elles repartiront au prochain tour, une fois les réglages corrigés.
       * Et le tour suivant ne coûtera qu'UNE tentative, puisqu'il s'arrêtera
       * de la même façon.
       */
      if (r.authentification) return { envoyes, echecs, total: rows.length, interrompu: true };
    }

    return { envoyes, echecs, total: rows.length, interrompu: false };
  });
}
