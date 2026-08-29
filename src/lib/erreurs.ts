/**
 * Lire une erreur attrapée, sans mentir sur ce qu'on en sait.
 * ---------------------------------------------------------------------------
 * `catch (e)` donne `unknown` sous `strict`, et c'est la vérité : ce qui est
 * lancé peut être une `Error`, une réponse Supabase, une chaîne, `undefined`.
 * Le code annotait la variable attrapée en `any` puis lisait `.message`, ce qui
 * rendait le compilateur muet sur exactement le cas qui casse — une erreur qui
 * n'est pas une `Error`, et un message affiché « undefined ».
 *
 * Ces deux fonctions ne devinent rien : elles regardent la forme reçue et
 * rendent la valeur de repli quand elle n'y est pas.
 */

/** Un objet qui porte un champ, sans rien affirmer de plus. */
function champ(e: unknown, nom: string): unknown {
  return typeof e === 'object' && e !== null && nom in e
    ? (e as Record<string, unknown>)[nom]
    : undefined;
}

/**
 * Le message d'une erreur, ou `defaut` si elle n'en porte pas d'exploitable.
 *
 * Une chaîne vide est traitée COMME UNE ABSENCE, et c'est délibéré : elle
 * s'affichait telle quelle, laissant l'utilisateur devant un bandeau d'erreur
 * sans texte. `error.message || 'defaut'`, la forme d'origine, faisait déjà ce
 * choix — il est conservé, cette fois en le disant.
 */
export function messageErreur(e: unknown, defaut: string): string {
  if (e instanceof Error && e.message) return e.message;
  const m = champ(e, 'message');
  return typeof m === 'string' && m ? m : defaut;
}

/**
 * Le code d'erreur PostgreSQL remonté par Supabase (`23505` pour une violation
 * d'unicité, par exemple), ou `null`.
 *
 * Le distinguer du message a une raison : un code se COMPARE, un message
 * s'affiche. Les confondre revient à tester une chaîne susceptible de changer
 * de langue ou de formulation.
 */
export function codeErreur(e: unknown): string | null {
  const c = champ(e, 'code');
  return typeof c === 'string' ? c : null;
}

/**
 * Le statut HTTP porté par une erreur, ou `null`.
 *
 * DEUX FORMES COEXISTENT, et il faut les deux : `error.status` (ce que pose
 * `fetch` enveloppé, et Supabase) et `error.response.status` (la convention
 * d'axios et de ce qui l'imite). Le code d'origine testait déjà les deux ; ne
 * lire que la première ferait silencieusement réessayer une requête sur un 404.
 */
export function statutHttp(e: unknown): number | null {
  const direct = champ(e, 'status');
  if (typeof direct === 'number') return direct;
  const imbrique = champ(champ(e, 'response'), 'status');
  return typeof imbrique === 'number' ? imbrique : null;
}
