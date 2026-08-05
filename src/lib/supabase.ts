/**
 * Client de données de l'application.
 * ---------------------------------------------------------------------------
 * Ce fichier gardait un client Supabase ; il compose désormais trois morceaux
 * qui parlent au serveur de l'instance. Le nom `supabase` est conservé à dessein :
 * il est importé par une cinquantaine de fichiers, et le renommer n'apporterait
 * rien de plus qu'un diff massif.
 *
 * Pourquoi `postgrest-js` et pas une API maison : le front compte 70 appels
 * `.from()` reposant sur la sémantique PostgREST — 22 sélections imbriquées dont
 * 10 en `!inner`, 11 filtres `.or()`, 34 comptages exacts. On garde donc
 * exactement la bibliothèque qui les produit, et le serveur relaie vers un
 * PostgREST réel. Résultat : aucune de ces 70 requêtes n'est à réécrire.
 *
 * Ce qui change, en revanche :
 *   - `auth`    → passkeys, session en cookie httpOnly (src/lib/api/auth.ts)
 *   - `storage` → fichiers sur disque (src/lib/api/storage.ts)
 *   - `channel` → plus de websocket ; voir la note en bas de fichier.
 */

import { PostgrestClient } from '@supabase/postgrest-js';
import type { Database } from '../types/database';
import { auth } from './api/auth';
import { storage } from './api/storage';

/**
 * Même origine que le front : le cookie de session accompagne naturellement
 * chaque requête, et il n'y a aucun CORS à configurer. Plus de
 * VITE_SUPABASE_URL ni de clé publiée dans le bundle.
 *
 * L'origine est construite explicitement, et non laissée en chemin relatif
 * (« /rest/v1 »), parce que `postgrest-js` fait `new URL()` sur cette base : à
 * partir de la 2.111.0, un chemin relatif y lève `TypeError: Invalid URL`.
 * L'exception part **avant** tout appel réseau, donc chaque `supabase.from()`
 * échouait sans laisser la moindre trace côté serveur — et celle levée dans le
 * chargement du profil empêchait `setLoading(false)`, laissant l'application
 * sur une roue qui tourne indéfiniment.
 *
 * Le défaut était latent : le verrou épinglait la 2.110.2, tolérante, pendant
 * que `package.json` réclamait `^2.111.0`. Il s'est révélé en resynchronisant
 * le verrou. Passer par une origine absolue rend le point insensible à la
 * version.
 */
const ORIGINE = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';

const rest = new PostgrestClient<Database>(`${ORIGINE}/rest/v1`, {
  fetch: (entree, init) =>
    fetch(entree, { ...init, credentials: 'same-origin' }),
});

export const supabase = {
  from: rest.from.bind(rest),
  rpc: rest.rpc.bind(rest),
  auth,
  storage,

  /**
   * Temps réel : non implémenté.
   *
   * Trois écrans s'y abonnaient (notifications, régimes fiscaux, travaux de
   * synchronisation). Plutôt qu'un websocket, ils passeront à du SSE ou à une
   * interrogation ciblée. En attendant, ce talon rend un objet inerte : les
   * écrans concernés fonctionnent, ils ne se rafraîchissent simplement plus
   * d'eux-mêmes.
   */
  channel(_nom: string) {
    const inerte = {
      // Signature permissive à dessein : les appelants passent (evenement,
      // filtre, rappel) et le talon doit les accepter sans les exécuter.
      on(..._args: unknown[]) {
        return inerte;
      },
      subscribe(..._args: unknown[]) {
        return inerte;
      },
      unsubscribe() {
        return Promise.resolve('ok' as const);
      },
    };
    return inerte;
  },

  removeChannel(_canal: unknown) {
    return Promise.resolve('ok' as const);
  },
};

export type { Profil } from './api/auth';
