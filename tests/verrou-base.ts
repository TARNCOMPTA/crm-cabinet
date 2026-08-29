import type pg from 'pg';

/**
 * Le verrou qui empêche deux suites de se détruire la base de test.
 * ---------------------------------------------------------------------------
 * ⚠️ `tests/schema.test.ts` ET `tests/mcp-sql.test.ts` PARTENT DU MÊME GESTE :
 * `DROP SCHEMA public CASCADE`, sur la même `DATABASE_URL_TEST`. Vitest exécute
 * les fichiers en parallèle : la seconde suite rasait le schéma pendant que la
 * première interrogeait ses tables.
 *
 * Le symptôme est trompeur — les deux fichiers passent quand on les lance
 * séparément, et l'un des deux échoue quand on les lance ensemble, pas toujours
 * le même. Constaté le 2026-08-28 : `mcp-sql` en échec dans un lot de trois,
 * vert seul, vert avec `--no-file-parallelism`.
 *
 * ⚠️ POURQUOI UN VERROU ET NON `--no-file-parallelism`. Ce drapeau sérialise
 * les QUARANTE-QUATRE fichiers de la suite pour le compte de deux : le temps
 * d'exécution complet passerait de 27 secondes à plusieurs minutes, sur chaque
 * poussée. Le verrou ne sérialise que ce qui doit l'être, et il tient quel que
 * soit l'ordonnancement — y compris deux exécutions de `npm test` lancées en
 * même temps sur le même poste.
 *
 * Le verrou est pris pour toute la durée de la suite, pas seulement pendant le
 * `DROP` : les assertions qui suivent lisent le schéma, et le libérer avant
 * elles ne réglerait rien.
 *
 * Un verrou consultatif de SESSION se libère tout seul à la déconnexion. Le
 * `client.end()` des `afterAll` suffit donc même si une suite meurt en cours de
 * route — c'est ce qui évite qu'un plantage bloque toutes les exécutions
 * suivantes.
 */

/**
 * La clé. Arbitraire, mais commune aux deux suites : c'est tout ce qui compte.
 * Choisie lisible plutôt que hachée, pour qu'un `pg_locks` en dise quelque
 * chose à qui enquête.
 */
export const CLE_VERROU_BASE_TEST = 20260828;

/** Attend son tour. Bloque tant que l'autre suite tient le verrou. */
export async function prendreVerrou(client: pg.Client): Promise<void> {
  await client.query('SELECT pg_advisory_lock($1)', [CLE_VERROU_BASE_TEST]);
}

/**
 * Rend la main. Ne lève jamais : appelé depuis un `afterAll`, où une erreur
 * masquerait l'échec réel du test.
 */
export async function rendreVerrou(client: pg.Client): Promise<void> {
  await client.query('SELECT pg_advisory_unlock($1)', [CLE_VERROU_BASE_TEST]).catch(() => {});
}
