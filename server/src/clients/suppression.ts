import { transaction } from '../db.js';

// Noms internes constants, jamais issus de la requête HTTP.
const TABLES = [
  'client_associes', 'legal_documents', 'officer_companies', 'legal_acts',
  'client_software', 'habilitations', 'inpi_sync_history', 'client_collaborators',
  'tax_exemptions', 'tax_authorizations', 'balance_sheets', 'general_assemblies', 'tasks',
] as const;

export async function supprimerClient(clientId: string, userId: string): Promise<boolean> {
  return transaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM clients WHERE id = $1 FOR UPDATE', [clientId]);
    if (!rows.length) return false;
    const stats: Record<string, number> = {};
    for (const table of TABLES) {
      const { rows: comptes } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${table} WHERE client_id = $1`, [clientId]
      );
      stats[table] = Number(comptes[0]?.n ?? 0);
    }
    for (const table of TABLES) {
      await client.query(`DELETE FROM ${table} WHERE client_id = $1`, [clientId]);
    }
    await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'delete_client', 'client', $2, $3::jsonb)`,
      [userId, clientId, JSON.stringify({ deleted_at: new Date().toISOString(), stats })]
    );
    return true;
  });
}
