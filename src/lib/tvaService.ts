/**
 * Appels de vérification TVA.
 *
 * Passe par `appelerFonction`, donc par le cookie de session : le navigateur
 * n'appelle jamais VIES directement — c'est le serveur qui sort, et lui seul
 * décide ce qu'il persiste.
 */

import { appelerFonction } from './api/fonctions';
import type { StatutTvaAffiche } from '../components/clients/tvaStatut';

export interface ResultatVerification {
  success: true;
  statut: StatutTvaAffiche;
  code: string;
  nom: string | null;
  adresse: string | null;
  message: string;
  numero: string;
  /** Renseigné seulement si le verdict a été enregistré. */
  verifieLe: string | null;
}

/**
 * Vérifie le numéro d'une fiche et enregistre le verdict.
 *
 * ⚠️ NE PAS TRAITER `indisponible` COMME UNE ERREUR. La route rend
 * `success: true` même dans ce cas : l'appel a réussi, c'est le verdict qui est
 * indéterminé. Lever une exception ici ferait afficher une panne technique là où
 * il faut afficher un état métier — et laisserait croire que le CRM est cassé
 * alors que c'est Bruxelles qui est saturé.
 */
export async function verifierTvaIntracom(clientId: string): Promise<ResultatVerification> {
  const rep = await appelerFonction<ResultatVerification>('tva/verifier', { clientId });
  if (!rep.ok || !rep.data) {
    throw new Error(rep.message ?? 'Verification impossible.');
  }
  return rep.data;
}

/** Contrôle ponctuel d'un numéro, sans rien écrire en base. */
export async function verifierNumeroTva(numero: string): Promise<ResultatVerification> {
  const rep = await appelerFonction<ResultatVerification>('tva/verifier', { numero });
  if (!rep.ok || !rep.data) {
    throw new Error(rep.message ?? 'Verification impossible.');
  }
  return rep.data;
}
