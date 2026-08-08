/**
 * Les règles de sûreté d'OAuth, sans aucune dépendance.
 * ---------------------------------------------------------------------------
 * Ces quatre fonctions portent seules ce qui distingue une implémentation
 * correcte d'une passoire : la comparaison des URI de redirection, PKCE, la
 * recevabilité d'une URI à l'enregistrement, et l'échappement du seul texte
 * d'origine externe qui s'affiche à l'écran.
 *
 * POURQUOI DANS UN FICHIER À PART, et pas dans routes/mcp-oauth.ts avec le
 * reste : `config.ts` LÈVE à l'import quand les variables d'environnement
 * manquent, ce qui est le bon comportement pour un serveur qui démarre. Mais un
 * test unitaire n'a ni base ni `.env` — et une règle de sécurité non testable
 * est une règle qu'on ne vérifie pas.
 *
 * Le dépôt a déjà tranché ce compromis une fois, pour `rest-droits.ts` : la
 * règle d'accès du proxy PostgREST y vit seule, précisément pour être couverte.
 * Même raisonnement ici. Ce fichier n'importe que `node:crypto`.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * PKCE, méthode S256 : le défi est le SHA-256 du vérifieur, en base64url.
 *
 * Le vérifieur ne transite JAMAIS avant l'échange de jeton. Un code intercepté
 * dans l'URL de redirection est donc inexploitable sans lui — c'est tout l'objet
 * de PKCE, et la raison pour laquelle un client public peut se passer de secret.
 *
 * ⚠️ `plain` EST REFUSÉ. La RFC 7636 le prévoit pour des raisons historiques,
 * mais le défi y est le vérifieur lui-même : quiconque a vu l'URL d'autorisation
 * peut le rejouer. L'accepter annulerait la protection tout en donnant
 * l'apparence de l'appliquer.
 */
export function verifierPkce(verifieur: string, defi: string, methode: string): boolean {
  if (methode !== 'S256') return false;
  // 43 à 128 caractères, imposé par la RFC : plus court devient devinable.
  if (typeof verifieur !== 'string' || verifieur.length < 43 || verifieur.length > 128) return false;
  const calcule = createHash('sha256').update(verifieur).digest('base64url');
  const a = Buffer.from(calcule);
  const b = Buffer.from(defi);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * L'URI de redirection doit figurer TELLE QUELLE dans la liste enregistrée.
 *
 * Pas de préfixe, pas de joker, pas de tolérance sur la barre finale ni sur la
 * casse du domaine : chacune de ces facilités a déjà servi à détourner un code
 * d'autorisation vers un serveur tiers. Le test en fige sept variantes.
 */
export function redirectionAutorisee(uri: string, autorisees: string[]): boolean {
  if (!uri) return false;
  return autorisees.some((a) => a === uri);
}

/**
 * Une URI recevable à l'enregistrement dynamique.
 *
 * HTTPS exigé, sauf sur la boucle locale — un poste de développement n'a pas de
 * certificat. Aucun fragment : il ne survit pas à une redirection, et sa présence
 * signale un client qui se trompe. Tout ce qui n'est pas une URL absolue est
 * écarté, ce qui ferme au passage `javascript:` et `data:`.
 */
export function uriRedirectionValide(brut: unknown): boolean {
  if (typeof brut !== 'string' || !brut) return false;
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

/**
 * Échappement HTML — réexporté depuis `../html.js`.
 *
 * `client_name` vient de l'enregistrement dynamique, donc du dehors, et il
 * s'affiche sur l'écran de consentement — la page même où l'utilisateur accorde
 * un accès. Une injection y serait au pire endroit possible.
 *
 * La fonction a déménagé le jour où les campagnes en ont eu besoin : deux copies
 * d'une fonction de sécurité divergent, et c'est toujours la copie oubliée qui
 * sert. Le réexport garde les appelants et le test d'origine intacts.
 */
export { echapperHtml } from '../html.js';
