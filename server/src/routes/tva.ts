/**
 * Vérification d'un numéro de TVA intracommunautaire auprès de VIES.
 * ---------------------------------------------------------------------------
 * Le calcul du numéro, lui, n'est PAS ici : il est fait par le déclencheur
 * `clients_calculer_tva_intracom` en base, parce que `siren` est écrit par
 * quatre chemins dont trois n'ont aucun JavaScript dans la boucle. Cette route
 * ne fait qu'une chose : demander à VIES ce qu'il en pense, et retenir sa
 * réponse quand elle en est une.
 *
 * `exigerSession` ET NON `exigerAdmin` : vérifier un numéro est un geste de
 * collaborateur, au même titre que synchroniser une fiche avec l'INPI — seul
 * `auto-sync-cabinet` y exige un administrateur, parce qu'il touche tout le
 * portefeuille. Ici on interroge un service public sur un numéro, sans rien lui
 * révéler d'autre.
 *
 * AUCUNE TÂCHE PLANIFIÉE, et c'est ce qui rend tenable la promesse du README.
 * `planificateur.ts` n'est pas touché : pas de vérification nocturne, pas de
 * balayage du portefeuille. Un numéro n'est envoyé à Bruxelles que parce que
 * quelqu'un a cliqué. Ne pas ajouter de tâche « pour tenir les statuts à jour » :
 * un statut périmé est visible et sans conséquence, un appel sortant que personne
 * n'a demandé ne l'est pas.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { requete, requeteUne } from '../db.js';
import { exigerSession } from '../gardes.js';
import { etatService, verifier, type Verdict } from '../vies.js';

function desactivee(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    message:
      'La verification VIES est desactivee sur cette instance (VIES_DISABLED=1). ' +
      'Le numero de TVA reste calcule depuis le SIREN.',
  });
}

export function enregistrerRoutesTva(app: FastifyInstance): void {
  /**
   * Vérifie un numéro, et l'enregistre si un `clientId` est fourni.
   *
   * Deux usages dans une seule route : `{ clientId }` vérifie le numéro de la
   * fiche et retient le verdict, `{ numero }` fait un contrôle ponctuel sans
   * rien écrire — utile pour éprouver un numéro avant de le saisir.
   */
  app.post<{ Body: { clientId?: string; numero?: string } }>(
    '/api/tva/verifier',
    async (request, reply) => {
      const session = await exigerSession(request, reply);
      if (!session) return;
      if (config.vies.desactivee) return desactivee(reply);

      const { clientId } = request.body ?? {};
      let numero = String(request.body?.numero ?? '').trim();

      if (clientId) {
        const client = await requeteUne<{ tva_intracom: string | null }>(
          'SELECT tva_intracom FROM clients WHERE id = $1',
          [clientId]
        );
        if (!client) return reply.code(404).send({ message: 'Client introuvable.' });
        numero = String(client.tva_intracom ?? '').trim();
      }

      if (!numero) {
        return reply.code(400).send({
          message: 'Aucun numero de TVA a verifier. Renseignez-le, ou saisissez un SIREN.',
        });
      }

      const verdict: Verdict = await verifier(numero);

      /**
       * ⚠️ ON N'ÉCRIT QUE SUR UN VERDICT.
       *
       * `indisponible` signifie que VIES n'a rien vérifié — le persister
       * écraserait un « valide » obtenu hier par une non-information. C'est le
       * corollaire de la colonne `tva_verif_statut`, qui n'a que trois valeurs :
       * l'indisponibilité est un état de l'APPEL, pas du numéro.
       */
      let verifieLe: string | null = null;
      if (verdict.statut === 'valide' || verdict.statut === 'invalide') {
        if (clientId) {
          const lignes = await requete<{ tva_verif_le: string }>(
            `UPDATE clients
                SET tva_verif_statut  = $2,
                    tva_verif_le      = now(),
                    tva_verif_code    = $3,
                    tva_verif_nom     = $4,
                    tva_verif_adresse = $5
              WHERE id = $1
              RETURNING tva_verif_le`,
            [clientId, verdict.statut, verdict.code, verdict.nom, verdict.adresse]
          );
          verifieLe = lignes[0]?.tva_verif_le ?? null;
        }
      }

      /**
       * `success: true` MÊME SUR « indisponible » : l'appel a réussi, c'est le
       * verdict qui est indéterminé. Un `success: false` ferait afficher une
       * erreur technique là où il faut afficher un état métier — et pousserait
       * l'utilisateur à croire que le CRM est en panne.
       */
      return {
        success: true,
        statut: verdict.statut,
        code: verdict.code,
        nom: verdict.nom,
        adresse: verdict.adresse,
        message: verdict.message,
        numero,
        verifieLe,
      };
    }
  );

  /**
   * État annoncé du service, pour griser le bouton plutôt que de proposer une
   * action dont on sait qu'elle échouera.
   */
  app.get('/api/tva/etat-vies', async (request, reply) => {
    const session = await exigerSession(request, reply);
    if (!session) return;
    if (config.vies.desactivee) {
      return { disponible: false, france: null, desactivee: true };
    }
    return { ...(await etatService()), desactivee: false };
  });
}
