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
    const b = remis > 0 ? await viderFile() : { envoyes: 0, echecs: 0, total: 0 };
    return { remisEnFile: remis, sent: b.envoyes, failed: b.echecs };
  });
}
