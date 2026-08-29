/**
 * L'état des tâches planifiées, pour l'écran d'administration.
 * ---------------------------------------------------------------------------
 * `GET /api/taches` existait depuis la refonte de l'ordonnanceur, et AUCUN écran
 * ne l'appelait : pour savoir si la récupération jedeclare de 2 h avait
 * fonctionné, il fallait ouvrir un terminal sur le serveur et lire le journal.
 *
 * Tout passe par `appelerFonction`, donc par le cookie de session : ces deux
 * routes sont réservées aux administrateurs côté serveur.
 */

import { appelerFonction } from './api/fonctions';

export interface EtatTache {
  nom: string;
  /** L'intention en clair, telle que l'ordonnanceur la déclare. */
  quand: string;
  /**
   * En cours DANS LE PROCESSUS COURANT. Après un redémarrage, une tâche qui
   * tournait n'est en cours nulle part : c'est pour cela que le serveur lit
   * cet état en mémoire et non en base.
   */
  enCours: boolean;
  derniereExecution: string | null;
  /**
   * Distinct de `derniereExecution` : pour une tâche nocturne, savoir quand elle
   * a fonctionné pour la dernière fois vaut souvent plus que de savoir qu'elle
   * vient d'échouer.
   */
  dernierSucces: string | null;
  dureeMs: number | null;
  statut: 'succes' | 'echec' | null;
  detail: string | null;
}

export async function listerTachesPlanifiees(): Promise<EtatTache[]> {
  const rep = await appelerFonction<{ taches: EtatTache[] }>('taches', undefined, {
    methode: 'GET',
  });
  if (!rep.ok || !rep.data) {
    throw new Error(rep.message ?? 'Etat des taches indisponible.');
  }
  return rep.data.taches;
}

/**
 * Lance une tâche sans attendre son heure.
 *
 * ⚠️ LA RÉPONSE N'ARRIVE QU'À LA FIN DE LA TÂCHE : le serveur l'exécute avant de
 * répondre. Une synchronisation INPI peut donc tenir la requête plusieurs
 * minutes — l'écran doit le dire plutôt que de laisser croire à un blocage.
 */
export async function declencherTache(nom: string): Promise<void> {
  const rep = await appelerFonction(`taches/${encodeURIComponent(nom)}`, undefined, {
    methode: 'POST',
  });
  if (!rep.ok) {
    throw new Error(rep.message ?? 'Declenchement impossible.');
  }
}
