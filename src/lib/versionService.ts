/**
 * Version de l'instance et détection de mise à jour.
 * ---------------------------------------------------------------------------
 * Deux numéros, qui ne disent pas la même chose et qu'il ne faut pas confondre :
 *
 *   · `VERSION_FRONT` est figée dans le bundle à la construction. C'est le code
 *     que CE navigateur exécute ;
 *   · `etatVersion()` interroge l'instance, qui compare SA version au manifeste
 *     publié. C'est le code que le serveur exécute.
 *
 * Les deux divergent le temps qu'un navigateur recharge après une mise à jour,
 * et durablement si un cache s'accroche. C'est précisément pourquoi l'écran les
 * montre séparément au lieu d'en afficher un seul.
 *
 * Le contrôle de mise à jour est réservé aux administrateurs côté serveur : ce
 * sont eux qui l'appliquent.
 */

import { appelerFonction } from './api/fonctions';

/** Version du bundle chargé par ce navigateur. Voir `define` dans vite.config.ts. */
export const VERSION_FRONT: string = __VERSION_APP__;

export interface EtatVersion {
  /** Version de l'instance, posée par l'image Docker. */
  locale: string;
  /** Version publiée, ou null si la vérification est coupée ou a échoué. */
  distante: string | null;
  aJour: boolean;
  notes: string | null;
  /** Renseigné quand la vérification n'a pas abouti. */
  erreur: string | null;
}

export async function etatVersion(forcer = false): Promise<EtatVersion> {
  const rep = await appelerFonction<EtatVersion>(
    `version${forcer ? '?forcer=1' : ''}`,
    undefined,
    { methode: 'GET' }
  );
  if (!rep.ok || !rep.data) {
    throw new Error(rep.message ?? 'Verification de version impossible.');
  }
  return rep.data;
}
