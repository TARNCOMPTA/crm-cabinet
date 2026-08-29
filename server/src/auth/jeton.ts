import jwt from 'jsonwebtoken';

/**
 * Signer et vérifier un jeton de session, sans rien laisser d'implicite.
 * ---------------------------------------------------------------------------
 * Séparé de `session.ts` pour être exerçable sans monter la configuration :
 * ces deux fonctions portent seules la décision « ce jeton est-il recevable »,
 * et une décision qu'aucun test n'atteint est une décision que personne ne
 * vérifie. Même parti pris que `mcp/oauth-regles.ts`.
 *
 * ⚠️ CE QUI EST CORRIGÉ ICI N'ÉTAIT PAS UNE FAILLE OUVERTE, ET LE DIRE COMPTE.
 * `jwt.verify(jeton, secret)` sans option `algorithms` a longtemps été LA
 * vulnérabilité classique des bibliothèques JWT : l'attaquant remplace
 * l'en-tête par `alg: none` et le jeton passe sans signature, ou par `HS256`
 * contre une clé publique RSA, qui devient alors le secret partagé. Depuis
 * `jsonwebtoken@9`, la bibliothèque déduit la famille d'algorithmes du TYPE de
 * la clé : un secret symétrique n'autorise que `HS256`/`HS384`/`HS512`
 * (`node_modules/jsonwebtoken/verify.js`, lignes 132-142). Les deux attaques
 * sont donc déjà bloquées, et l'exposition réelle se limitait à un changement
 * d'algorithme À L'INTÉRIEUR de la famille HMAC — sans conséquence pratique.
 *
 * Ce qui reste, et qui justifie de l'écrire : la protection vient d'une
 * DÉDUCTION de la bibliothèque, pas d'une intention de ce dépôt. Elle survit à
 * une montée de version par chance, et disparaît sans bruit le jour où le
 * secret devient une paire de clés — le passage à RS256 est une évolution
 * banale, et il rouvrirait la confusion d'algorithme sur un code qui n'a pas
 * changé. Un algorithme nommé refuse alors le jeton au lieu de l'accepter.
 */

/** Le seul algorithme accepté, à la signature comme à la vérification. */
export const ALGORITHME = 'HS256' as const;

/** Rôle Postgres endossé par les requêtes du front via PostgREST. */
export const ROLE_POSTGREST = 'authenticated';

export interface Revendications {
  /** Identifiant du profil. `sub` est le nom attendu par PostgREST. */
  sub: string;
  /** Rôle Postgres, pas rôle applicatif. */
  role: string;
  /** Rôle applicatif : 'admin' ou 'user'. */
  roleApp: string;
  email: string;
  exp?: number;
}

export function signerAvec(
  profil: { id: string; email: string; role: string },
  secret: string,
  dureeSecondes: number
): string {
  const revendications: Revendications = {
    sub: profil.id,
    role: ROLE_POSTGREST,
    roleApp: profil.role,
    email: profil.email,
  };
  return jwt.sign(revendications, secret, {
    algorithm: ALGORITHME,
    expiresIn: dureeSecondes,
  });
}

/**
 * La forme du contenu, vérifiée au lieu d'être affirmée.
 *
 * ⚠️ LE CODE FAISAIT `jwt.verify(...) as Revendications`. Une assertion de type
 * ne vérifie rien à l'exécution : un jeton correctement signé mais de forme
 * différente traversait, et `roleApp` valait `undefined` en aval. La garde
 * `exigerAdmin` le refuse — `undefined !== 'admin'` — mais elle le refuse par
 * accident, pas par contrat. Le même secret signe les jetons que PostgREST
 * lit ; le jour où un autre émetteur le partagerait, ce contrôle serait la
 * seule chose entre lui et une session.
 */
function estRevendications(charge: unknown): charge is Revendications {
  if (typeof charge !== 'object' || charge === null) return false;
  const c = charge as Record<string, unknown>;
  return (
    typeof c.sub === 'string' && c.sub !== '' &&
    typeof c.role === 'string' &&
    typeof c.roleApp === 'string' &&
    typeof c.email === 'string'
  );
}

/** Le contenu du jeton, ou `null` — jamais d'exception, jamais de demi-jeton. */
export function verifierAvec(jeton: string, secret: string): Revendications | null {
  try {
    const charge = jwt.verify(jeton, secret, { algorithms: [ALGORITHME] });
    return estRevendications(charge) ? charge : null;
  } catch {
    return null;
  }
}
