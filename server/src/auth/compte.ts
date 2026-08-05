/**
 * État réel d'un compte, relu depuis la base.
 * ---------------------------------------------------------------------------
 * Le jeton de session porte le rôle applicatif et l'identifiant du profil, et il
 * vit sept jours par défaut (SESSION_TTL). Tant que rien ne relisait la base,
 * ces sept jours étaient la durée pendant laquelle le jeton disait la vérité
 * d'AVANT :
 *
 *   - désactiver un collaborateur qui quitte le cabinet ne coupait pas son
 *     accès. `userDeactivationService` pose `is_active = false` sur son profil,
 *     et l'interface le déconnecte bien — mais cette déconnexion est un geste du
 *     navigateur. Le cookie, lui, restait valable : la même session rejouée avec
 *     n'importe quel client HTTP gardait l'accès complet au CRM, en lecture
 *     comme en écriture, jusqu'à une semaine après le départ ;
 *   - rétrograder un administrateur ne lui retirait ses droits qu'à l'expiration
 *     de son jeton.
 *
 * D'où ce module. Le coût — une requête par session — est ramené à presque rien
 * par un cache très court : la fenêtre pendant laquelle un compte fermé reste
 * ouvert passe de sept jours à trente secondes, et une écriture sur `profiles`
 * vide le cache aussitôt (voir rest-proxy.ts), ce qui rend la révocation
 * immédiate dans le cas qui compte — l'administrateur qui ferme un compte depuis
 * l'application.
 */

import { requeteUne } from '../db.js';

export interface EtatCompte {
  actif: boolean;
  /** Rôle applicatif tel qu'il est EN BASE, pas tel que le jeton l'annonce. */
  roleApp: string;
}

/**
 * Trente secondes. Assez court pour qu'une révocation ne traîne pas, assez long
 * pour qu'une session active ne fasse pas une requête de plus par appel — un
 * écran qui charge quinze listes n'en déclenche qu'une seule.
 */
const DUREE_CACHE_MS = 30_000;

const cache = new Map<string, { etat: EtatCompte | null; expire: number }>();

/**
 * Rend l'état du compte, ou null s'il n'existe plus.
 *
 * Un profil supprimé rend null et non `{ actif: false }` : les deux se traitent
 * pareil côté appelant, mais la distinction évite de faire croire à un compte
 * qui existerait encore.
 */
export async function etatCompte(id: string): Promise<EtatCompte | null> {
  const connu = cache.get(id);
  if (connu && connu.expire > Date.now()) return connu.etat;

  const ligne = await requeteUne<{ is_active: boolean; role: string }>(
    'SELECT is_active, role FROM profiles WHERE id = $1',
    [id]
  );

  const etat: EtatCompte | null = ligne
    ? { actif: ligne.is_active, roleApp: ligne.role }
    : null;

  cache.set(id, { etat, expire: Date.now() + DUREE_CACHE_MS });
  return etat;
}

/**
 * Vide le cache. Appelé après toute écriture sur `profiles` : c'est par là que
 * passent la désactivation d'un compte et le changement de rôle, et attendre
 * trente secondes pour en tenir compte n'aurait aucune raison d'être quand on
 * vient soi-même de faire la modification.
 */
export function oublierComptes(): void {
  cache.clear();
}

/**
 * Purge des entrées périmées. La Map ne doit pas croître indéfiniment sur une
 * instance qui tourne des mois — même si, à un cabinet par instance, elle
 * compterait au pire quelques dizaines d'entrées.
 */
setInterval(() => {
  const maintenant = Date.now();
  for (const [id, v] of cache) if (v.expire < maintenant) cache.delete(id);
}, 60_000).unref();
