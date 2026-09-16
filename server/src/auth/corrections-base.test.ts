// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { prendreVerrou, rendreVerrou } from '../../../tests/verrou-base';

// Seule la preuve cryptographique est simulée. Les insertions, contraintes,
// verrous, consommations de code et annulations passent par PostgreSQL.
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: 'defi-test' })),
  verifyRegistrationResponse: vi.fn(async () => ({ verified: true, registrationInfo: {
    credential: { id: 'credential-test', publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
  } })),
  generateAuthenticationOptions: vi.fn(), verifyAuthenticationResponse: vi.fn(),
}));
const suite = process.env.DATABASE_URL_TEST ? describe : describe.skip;
suite('corrections : transactions et historique sur PostgreSQL', () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  let db: typeof import('../db');
  let supprimerClient: typeof import('../clients/suppression')['supprimerClient'];
  let passkeys: typeof import('../auth/passkeys');
  const userId = randomUUID();
  let clientId: string;
  const code = 'ABCDE-FGHJK';
  const codeHash = createHash('sha256').update(code.replace(/-/g, '')).digest('hex');

  beforeAll(async () => {
    await client.connect();
    await prendreVerrou(client);
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
    process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public');
    await client.query(readFileSync('schema/cible.sql', 'utf8'));
    await client.query(readFileSync('schema/auth-interne.sql', 'utf8'));
    db = await import('../db');
    ({ supprimerClient } = await import('../clients/suppression'));
    passkeys = await import('../auth/passkeys');
    await client.query(`INSERT INTO profiles (id, email, role, is_active) VALUES ($1, 'recette@example.invalid', 'admin', true)`, [userId]);
  }, 120_000);
  afterAll(async () => { await db?.pool.end(); await rendreVerrou(client); await client.end(); });
  beforeEach(async () => {
    await client.query('DROP TABLE IF EXISTS blocage_suppression');
    await client.query('DELETE FROM passkeys; DELETE FROM enrolment_codes; DELETE FROM audit_logs; DELETE FROM clients');
    clientId = randomUUID();
    await client.query(`INSERT INTO clients (id, nom_entreprise) VALUES ($1, 'Recette suppression')`, [clientId]);
    await client.query('INSERT INTO client_collaborators (client_id, user_id) VALUES ($1, $2)', [clientId, userId]);
  });

  it('annule toutes les suppressions si une référence bloque le client', async () => {
    await client.query('CREATE TABLE blocage_suppression (client_id uuid REFERENCES clients(id))');
    await client.query('INSERT INTO blocage_suppression VALUES ($1)', [clientId]);
    await expect(supprimerClient(clientId, userId)).rejects.toThrow();
    expect((await client.query('SELECT id FROM client_collaborators WHERE client_id = $1', [clientId])).rows).toHaveLength(1);
    expect((await client.query('SELECT id FROM clients WHERE id = $1', [clientId])).rows).toHaveLength(1);
    expect((await client.query("SELECT id FROM audit_logs WHERE action = 'delete_client'")).rows).toHaveLength(0);
  });
  it('annule la suppression si le journal ne peut pas être écrit', async () => {
    await expect(supprimerClient(clientId, randomUUID())).rejects.toThrow();
    expect((await client.query('SELECT id FROM client_collaborators WHERE client_id = $1', [clientId])).rows).toHaveLength(1);
  });
  it('supprime le client et journalise les statistiques réelles', async () => {
    expect(await supprimerClient(clientId, userId)).toBe(true);
    expect((await client.query('SELECT id FROM clients WHERE id = $1', [clientId])).rows).toHaveLength(0);
    const audit = await client.query("SELECT user_id, details FROM audit_logs WHERE action = 'delete_client' AND entity_id = $1", [clientId]);
    expect(audit.rows[0].user_id).toBe(userId);
    expect(audit.rows[0].details.stats.client_collaborators).toBe(1);
  });

  async function enregistrer() {
    const cle = randomUUID();
    await passkeys.optionsEnrolement({ id: userId, email: 'recette@example.invalid', prenom: null, nom: null }, cle);
    return passkeys.verifierEnrolement(userId, {} as Parameters<typeof passkeys.verifierEnrolement>[1], null, cle, code);
  }
  async function poserCode() {
    await client.query("INSERT INTO enrolment_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [userId, codeHash]);
  }
  it('consomme le code une seule fois avec la passkey', async () => {
    await poserCode();
    expect(await enregistrer()).toBe(true);
    expect(await enregistrer()).toBe(false);
    expect((await client.query('SELECT id FROM passkeys')).rows).toHaveLength(1);
    expect((await client.query('SELECT used_at FROM enrolment_codes')).rows[0].used_at).not.toBeNull();
  });
  it('annule la consommation si l’enregistrement de la passkey échoue', async () => {
    await poserCode();
    await client.query("INSERT INTO passkeys (user_id, credential_id, public_key) VALUES ($1, 'credential-test', 'AQID')", [userId]);
    await expect(enregistrer()).rejects.toMatchObject({ code: '23505' });
    expect((await client.query('SELECT used_at FROM enrolment_codes')).rows[0].used_at).toBeNull();
  });
  it('refuse un code expiré sans créer de passkey', async () => {
    await poserCode();
    await client.query("UPDATE enrolment_codes SET expires_at = now() - interval '1 minute'");
    expect(await enregistrer()).toBe(false);
    expect((await client.query('SELECT id FROM passkeys')).rows).toHaveLength(0);
  });

  it('conserve les succès et erreurs après purge et marque les anciens inconnus', async () => {
    const campagne = randomUUID();
    await client.query("INSERT INTO mailing_campagnes (id, sujet, corps) VALUES ($1, 'Recette', 'Texte')", [campagne]);
    for (const status of ['sent', 'error']) {
      const queue = randomUUID();
      await client.query("INSERT INTO email_queue (id, user_id, to_email, subject, html_body) VALUES ($1, $2, 'a@example.invalid', 'Test', 'Texte')", [queue, userId]);
      await client.query('INSERT INTO mailing_destinataires (campagne_id, email, email_queue_id) VALUES ($1, $2, $3)', [campagne, `${status}@example.invalid`, queue]);
      await client.query('UPDATE email_queue SET status = $1 WHERE id = $2', [status, queue]);
      await client.query('DELETE FROM email_queue WHERE id = $1', [queue]);
    }
    await client.query("INSERT INTO mailing_destinataires (campagne_id, email, email_queue_id) VALUES ($1, 'ancien@example.invalid', $2)", [campagne, randomUUID()]);
    const { rows } = await client.query('SELECT statut_envoi FROM mailing_destinataires WHERE campagne_id = $1 ORDER BY email', [campagne]);
    expect(rows.map(r => r.statut_envoi)).toEqual([null, 'error', 'sent']);
    // La migration se rejoue sans effacer les résultats déjà préservés.
    await client.query(readFileSync('schema/increments/021-campagnes-resultats-durables.sql', 'utf8'));
    expect((await client.query("SELECT id FROM mailing_destinataires WHERE campagne_id = $1 AND statut_envoi = 'sent'", [campagne])).rows).toHaveLength(1);
  });
});
