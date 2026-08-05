/**
 * Accès Postgres. Un seul pool pour tout le serveur.
 *
 * Le serveur ne fait ici que ce que PostgREST ne peut pas faire : authentification,
 * tâches planifiées, et les routes reprises des Edge Functions. Les requêtes
 * métier du front passent par le proxy PostgREST.
 */

import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.db.url,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] erreur inattendue sur un client au repos :', err.message);
});

export async function requete<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}

export async function requeteUne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await requete<T>(sql, params);
  return rows[0] ?? null;
}

/** Exécute une suite d'ordres dans une transaction, annulée à la moindre erreur. */
export async function transaction<T>(
  travail: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await travail(client);
    await client.query('COMMIT');
    return resultat;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function verifierConnexion(): Promise<void> {
  const r = await requeteUne<{ v: string }>('SELECT version() AS v');
  console.log(`[db] connecte — ${String(r?.v).split(',')[0]}`);
}
