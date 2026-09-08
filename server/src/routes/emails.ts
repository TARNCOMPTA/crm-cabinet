/**
 * Routes de courrier électronique.
 * ---------------------------------------------------------------------------
 * Remplacent l'Edge Function `send-emails`. Le vidage de la file est désormais
 * fait par l'ordonnanceur (voir planificateur.ts) ; ces routes servent à le
 * déclencher à la main et à régler le SMTP depuis l'interface.
 *
 * `/api/send-emails` garde son nom : c'est celui que le front appelle déjà, et
 * le renommer n'apporterait qu'un diff.
 */

import type { FastifyInstance } from 'fastify';
import { requete, requeteUne } from '../db.js';
import { exigerAdmin, exigerSession } from '../gardes.js';
import { viderFile } from '../file-emails.js';
import { envoyer, lireReglages, tester } from '../mail.js';

export function enregistrerRoutesEmails(app: FastifyInstance): void {
  /** Vidage à la demande. Utile après avoir corrigé un réglage SMTP. */
  app.post('/api/send-emails', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;

    const b = await viderFile();
    return {
      message: b.total === 0 ? 'Aucun email en attente.' : 'File traitee.',
      sent: b.envoyes,
      failed: b.echecs,
      total: b.total,
    };
  });

  /**
   * État du courrier : d'où vient la configuration et ce qu'il reste en file.
   * Le mot de passe n'est jamais rendu — l'interface affiche des points.
   */
  app.get('/api/emails/etat', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;

    const reglages = await lireReglages();
    const compteurs = await requeteUne<{
      en_attente: string;
      envoyes: string;
      en_erreur: string;
    }>(
      `SELECT count(*) FILTER (WHERE status = 'pending')::text AS en_attente,
              count(*) FILTER (WHERE status = 'sent')::text    AS envoyes,
              count(*) FILTER (WHERE status = 'error')::text   AS en_erreur
         FROM email_queue`
    );

    /**
     * DE QUOI DIRE « LES COURRIELS NE PARTENT PLUS DEPUIS LE … ».
     * -----------------------------------------------------------------------
     * Les compteurs ci-dessus portent tout l'historique : ils disent combien
     * d'envois ont echoue un jour, jamais si l'envoi marche AUJOURD'HUI. C'est
     * ce qui a permis a une panne de durer vingt-quatre jours sans que rien ne
     * la signale (voir `src/lib/etatEmails.ts`).
     *
     * ⚠️ ON NE COMPTE QUE LES ECHECS POSTERIEURS AU DERNIER ENVOI REUSSI. Une
     * adresse invalide d'il y a six mois est un incident clos ; la compter
     * afficherait une alarme permanente, que plus personne ne lirait. Et c'est
     * ce qui fait que le bandeau s'efface tout seul des qu'un courriel repart,
     * sans qu'aucun code n'ait a l'effacer.
     */
    const panne = await requeteUne<{
      dernier_envoi: string | null;
      en_echec: string;
      depuis: string | null;
      derniere_erreur: string | null;
    }>(
      `WITH dernier AS (
         SELECT max(sent_at) AS le FROM email_queue WHERE status = 'sent'
       ),
       echecs AS (
         SELECT eq.created_at, eq.error_message
           FROM email_queue eq, dernier d
          WHERE eq.status = 'error'
            AND (d.le IS NULL OR eq.created_at > d.le)
       )
       SELECT (SELECT le FROM dernier)                            AS dernier_envoi,
              (SELECT count(*) FROM echecs)::text                 AS en_echec,
              (SELECT min(created_at) FROM echecs)                AS depuis,
              (SELECT error_message FROM echecs
                ORDER BY created_at DESC LIMIT 1)                 AS derniere_erreur`
    );

    return {
      configure: Boolean(reglages),
      origine: reglages?.origine ?? null,
      host: reglages?.host ?? null,
      port: reglages?.port ?? null,
      from: reglages?.from ?? null,
      file: {
        enAttente: Number(compteurs?.en_attente ?? 0),
        envoyes: Number(compteurs?.envoyes ?? 0),
        enErreur: Number(compteurs?.en_erreur ?? 0),
      },
      panne: {
        enEchec: Number(panne?.en_echec ?? 0),
        depuis: panne?.depuis ?? null,
        dernierEnvoi: panne?.dernier_envoi ?? null,
        derniereErreur: panne?.derniere_erreur ?? null,
      },
    };
  });

  /** Vérifie la connexion SMTP sans envoyer de message. */
  app.post('/api/emails/tester', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;
    return tester();
  });

  /**
   * Envoi d'un message de contrôle à sa propre adresse.
   *
   * `tester()` ne prouve que la connexion et l'authentification. Un relais peut
   * accepter la session puis refuser l'expéditeur — c'est le cas le plus courant
   * quand `SMTP_FROM` n'appartient pas au domaine autorisé. Seul un envoi réel
   * le montre.
   */
  app.post('/api/emails/essai', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;

    const r = await envoyer({
      destinataire: session.email,
      sujet: 'Essai de configuration SMTP — CRM Cabinet',
      html: `<p>Si vous lisez ce message, l'envoi de courrier fonctionne.</p>
             <p style="color:#666;font-size:14px">Message d'essai envoye depuis
             les parametres du CRM.</p>`,
    });

    if (!r.ok) return reply.code(502).send({ ok: false, message: r.raison });
    return { ok: true, message: `Message envoye a ${session.email}.` };
  });

  /**
   * Réémission des envois en erreur.
   *
   * Sans cela, un incident SMTP d'une heure laisse définitivement de côté les
   * notifications de la période : les lignes sont en `error`, et rien ne les
   * reprend.
   */
  app.post('/api/emails/reessayer', async (request, reply) => {
    const session = await exigerAdmin(request, reply);
    if (!session) return;

    const r = await requete<{ n: string }>(
      `WITH s AS (
         UPDATE email_queue
            SET status = 'pending', retry_count = 0, error_message = NULL
          WHERE status = 'error'
            AND created_at > now() - interval '7 days'
          RETURNING 1
       )
       SELECT count(*)::text AS n FROM s`
    );
    const remis = Number(r[0]?.n ?? 0);
    const b = remis > 0 ? await viderFile() : { envoyes: 0, echecs: 0, total: 0, interrompu: false };
    return { remisEnFile: remis, sent: b.envoyes, failed: b.echecs };
  });
}
