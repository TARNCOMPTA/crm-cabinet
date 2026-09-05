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
 * ⚠️ IL Y A DÉSORMAIS UNE TÂCHE PLANIFIÉE, ET CE COMMENTAIRE DISAIT LE
 * CONTRAIRE. Jusqu'au 2026-09-05 on lisait ici : « un numéro n'est envoyé à
 * Bruxelles que parce que quelqu'un a cliqué ; ne pas ajouter de tâche pour
 * tenir les statuts à jour — un statut périmé est visible et sans conséquence ».
 * Le cabinet a tranché l'inverse, et son argument est meilleur : un numéro
 * intracommunautaire se DÉSACTIVE sans prévenir personne, et facturer sans TVA
 * sur un numéro devenu inactif se paie au contrôle. Un statut périmé n'est
 * visible que si quelqu'un ouvre la fiche — c'est-à-dire jamais, sur les fiches
 * qu'on ne touche pas.
 *
 * La tâche vit dans `planificateur.ts` (`verification-tva-vies`), son rythme
 * dans `tva-lot.ts`, et `VIES_PERIODIQUE_DISABLED=1` la coupe sans couper le
 * bouton. Cette route, elle, ne change pas : elle reste le chemin du clic.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { requeteUne } from '../db.js';
import { exigerSession } from '../gardes.js';
import { etatService } from '../vies.js';
import { verifierEtRetenir } from '../tva-verification.js';

function desactivee(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    message:
      'La vérification VIES est désactivée sur cette instance (VIES_DISABLED=1). ' +
      'Le numéro de TVA reste calculé depuis le SIREN.',
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
          message: 'Aucun numéro de TVA à vérifier. Renseignez-le, ou saisissez un SIREN.',
        });
      }

      /*
        L'appel ET la règle d'écriture vivent dans `tva-verification.ts` : la
        tâche périodique doit écrire exactement comme ce bouton, et deux copies
        de cette règle divergeraient — celle qui tourne la nuit étant celle que
        personne ne relit.
      */
      const { verdict, verifieLe } = await verifierEtRetenir(clientId ?? null, numero);

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
