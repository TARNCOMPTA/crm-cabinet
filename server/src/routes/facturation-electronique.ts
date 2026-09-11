/**
 * Recherche d'une adresse de facturation électronique dans l'annuaire.
 * ---------------------------------------------------------------------------
 * Le CRM porte déjà la colonne `clients.adresse_facturation_electronique`,
 * saisissable à l'écran et par le connecteur MCP. Cette route sert le troisième
 * chemin : aller la chercher là où elle est publiée, plutôt que de la recopier
 * d'un courrier.
 *
 * ⚠️ CETTE ROUTE N'ÉCRIT RIEN, ET C'EST DÉLIBÉRÉ. Elle rend ce que l'annuaire
 * dit ; c'est l'utilisateur qui décide d'en faire l'adresse de la fiche. La
 * raison est la même que pour l'outil MCP d'écriture : une adresse déjà en
 * place a été saisie d'après un courrier du client, et la remplacer par une
 * autre à tort ferait partir les factures suivantes ailleurs — sans que
 * personne ne le voie avant une réclamation. Un remplissage automatique et
 * silencieux ferait exactement cela, à l'échelle du portefeuille.
 *
 * `exigerSession` ET NON `exigerAdmin`, comme pour la vérification VIES :
 * chercher une adresse dans un annuaire public est un geste de collaborateur.
 * Ce qui sort du cabinet est un SIREN, donnée publique, et rien d'autre.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { requeteUne } from '../db.js';
import { exigerSession } from '../gardes.js';
import { normaliserSiren, rechercher, sirenValide } from '../annuaire-facturation.js';

function desactivee(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    message:
      "La recherche dans l’annuaire est désactivée sur cette instance " +
      '(ANNUAIRE_FACTURATION_DISABLED=1). L’adresse reste saisissable à la main.',
  });
}

export function enregistrerRoutesFacturationElectronique(app: FastifyInstance): void {
  /**
   * Cherche les adresses publiées pour un client, ou pour un SIREN nu.
   *
   * Deux usages dans une seule route, comme `tva/verifier` : `{ clientId }`
   * cherche d'après le SIREN de la fiche et rend au passage l'adresse déjà
   * enregistrée — sans quoi l'écran ne pourrait pas dire « c'est déjà celle-là »
   * — et `{ siren }` fait une recherche nue.
   */
  app.post<{ Body: { clientId?: string; siren?: string } }>(
    '/api/facturation-electronique/annuaire',
    async (request, reply) => {
      const session = await exigerSession(request, reply);
      if (!session) return;
      if (config.annuaireFacturation.desactive) return desactivee(reply);

      const { clientId } = request.body ?? {};
      let siren = normaliserSiren(request.body?.siren);
      let adresseEnregistree: string | null = null;

      if (clientId) {
        const client = await requeteUne<{ siren: string | null; adresse: string | null }>(
          `SELECT siren, adresse_facturation_electronique AS adresse
             FROM clients WHERE id = $1`,
          [clientId]
        );
        if (!client) return reply.code(404).send({ message: 'Client introuvable.' });
        siren = normaliserSiren(client.siren);
        adresseEnregistree = client.adresse ?? null;
      }

      if (!siren) {
        return reply.code(400).send({
          message:
            'Aucun SIREN à chercher. L’annuaire s’interroge par SIREN : renseignez-le sur la fiche.',
        });
      }
      if (!sirenValide(siren)) {
        return reply.code(400).send({
          message: `« ${siren} » ne fait pas neuf chiffres. L’annuaire s’interroge par SIREN, pas par SIRET.`,
        });
      }

      /**
       * `success: true` MÊME SUR « indisponible » et « aucune », pour la raison
       * écrite dans `tva.ts` : l'appel a réussi, c'est le résultat qui est
       * négatif ou indéterminé. Un `success: false` ferait afficher une panne
       * technique là où il faut afficher un état métier — et « pas encore
       * inscrit à l'annuaire » est l'état le plus fréquent en 2026.
       */
      const resultat = await rechercher(siren);
      return { success: true, siren, adresseEnregistree, ...resultat };
    }
  );
}
