import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { prendreVerrou, rendreVerrou } from './verrou-base';

/**
 * Chaque requête du connecteur MCP, soumise à un vrai PostgreSQL.
 * ---------------------------------------------------------------------------
 * ⚠️ CINQ OUTILS SUR SEIZE NE S'EXÉCUTAIENT PAS, ET RIEN NE LE DISAIT.
 *
 * `list_tasks`, `list_balance_sheets`, `list_opportunities`, `list_software`,
 * `list_meeting_notes` et les deux branches de `search` demandaient des colonnes
 * ANGLAISES à des tables qui les nomment en français : `title` pour `titre`,
 * `status` pour `statut`, `meeting_date` pour `date_rdv`, `amount` pour
 * `montant_estime`, `license_type` pour une colonne qui n'existe pas du tout.
 * PostgreSQL rendait « column "title" does not exist » à chaque appel, et
 * chacun de ces outils échouait depuis sa mise en service.
 *
 * `search` était le pire : ses quatre branches tournent dans un `Promise.all`,
 * qui rejette dès qu'une seule lève. Deux branches cassées suffisaient donc à
 * rendre inutile la recherche de clients, qui, elle, était juste.
 *
 * Aucun test ne pouvait le voir : les outils MCP tapent la base en SQL direct,
 * et une chaîne SQL n'est vérifiée par rien avant son exécution. TypeScript la
 * voit comme du texte, la CI ne les appelle pas.
 *
 * D'où ce test. Il n'exécute rien — il fait PRÉPARER chaque requête, ce qui
 * suffit à faire analyser tables, colonnes et types par PostgreSQL, sans
 * toucher une ligne de données. Le fichier reste la seule source : ajouter un
 * outil le fait entrer dans la suite sans qu'on ait à l'y déclarer.
 *
 * Sans `DATABASE_URL_TEST`, la suite est ignorée plutôt qu'en échec — même
 * convention que `tests/schema.test.ts`.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL_TEST = process.env.DATABASE_URL_TEST;
const suite = URL_TEST ? describe : describe.skip;

/** Le source, débarrassé de ses commentaires : ils contiennent du SQL d'exemple. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export interface RequeteTrouvee {
  ligne: number;
  sql: string;
}

/**
 * Les littéraux SQL d'un fichier TypeScript.
 *
 * On ne retient que ce qui commence par un verbe SQL ET contient un `FROM`, un
 * `INTO` ou un `SET` : sans cette seconde condition, un `SELECT *` cité dans une
 * chaîne de documentation entrerait dans la liste et ferait échouer la suite
 * pour rien.
 */
export function requetesDe(source: string): RequeteTrouvee[] {
  const propre = sansCommentaires(source);
  const trouvees: RequeteTrouvee[] = [];
  const motif = /(`|')(\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH)\b[\s\S]*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(propre))) {
    const sql = m[2]!.trim();
    if (!/\b(FROM|INTO|SET)\b/i.test(sql)) continue;
    trouvees.push({ ligne: propre.slice(0, m.index).split('\n').length, sql });
  }
  return trouvees;
}

suite('les requetes SQL du connecteur MCP', () => {
  const client = new pg.Client({ connectionString: URL_TEST });
  let compteur = 0;
  const fichiers =['server/src/mcp/outils.ts', 'server/src/routes/mcp-oauth.ts', 'server/src/routes/mcp-cles.ts'];

  /**
   * ⚠️ LA SUITE MONTE SON PROPRE SCHEMA, elle ne se pose pas sur celui d'une
   * autre. `tests/schema.test.ts` partage la même base et commence par
   * `DROP SCHEMA public CASCADE` : compter sur ce qu'il laisse rendrait ce test
   * dépendant de l'ordre d'exécution, et vert ou rouge selon le hasard. La CI
   * les lance donc en deux étapes, et celle-ci reconstruit ce dont elle a
   * besoin.
   */
  beforeAll(async () => {
    await client.connect();
    // Le verrou AVANT le premier geste : `tests/schema.test.ts` rase la même
    // base, et vitest lance les deux fichiers en parallèle. Voir verrou-base.ts.
    await prendreVerrou(client);
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await client.query('BEGIN');
    await client.query(readFileSync(resolve(RACINE, 'schema/cible.sql'), 'utf8'));
    await client.query(readFileSync(resolve(RACINE, 'schema/auth-interne.sql'), 'utf8'));
    await client.query('COMMIT');
  }, 120_000);
  afterAll(async () => {
    await rendreVerrou(client);
    await client.end();
  });

  for (const fichier of fichiers) {
    const source = readFileSync(resolve(RACINE, fichier), 'utf8');
    const requetes = requetesDe(source);

    it(`${fichier} : on en trouve a analyser`, () => {
      // Une extraction qui ne trouve plus rien passerait tous les cas suivants
      // sans rien prouver. C'est arrive a d'autres gardes de ce depot.
      expect(requetes.length).toBeGreaterThan(0);
    });

    for (const { ligne, sql } of requetes) {
      const apercu = sql.replace(/\s+/g, ' ').slice(0, 70);

      it(`${fichier}:${ligne} — ${apercu}`, async () => {
        // Une requête à trous (`${...}`) n'est pas analysable telle quelle ;
        // il n'y en a aucune aujourd'hui, et le cas échoue plutôt que de se
        // taire, pour qu'on décide au lieu de laisser passer.
        expect(sql, 'requete interpolee, non verifiable').not.toMatch(/\$\{/);

        const nb = [...sql.matchAll(/\$(\d+)/g)].map((x) => Number(x[1]!));
        const max = nb.length > 0 ? Math.max(...nb) : 0;
        // `unknown` laisse PostgreSQL déduire le type de chaque paramètre :
        // c'est ce que fait le pilote à l'exécution.
        const types = max > 0 ? `(${Array.from({ length: max }, () => 'unknown').join(',')})` : '';

        /**
         * ⚠️ UN `PREPARE` NE SE DEFAIT PAS PAR UN `ROLLBACK` — la première
         * version enveloppait chaque cas dans une transaction annulée, et les
         * cinquante-cinq suivants échouaient sur « prepared statement
         * "zz_verif" already exists ». Les instructions préparées vivent avec la
         * SESSION, pas avec la transaction. On leur donne donc un nom unique et
         * on les libère soi-même.
         */
        const nom = `zz_verif_${compteur++}`;
        try {
          await client.query(`PREPARE ${nom} ${types} AS ${sql}`);
        } finally {
          await client.query(`DEALLOCATE PREPARE ${nom}`).catch(() => undefined);
        }
      });
    }
  }
});
