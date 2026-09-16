// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  requeteUne: vi.fn(), requete: vi.fn(), transaction: vi.fn(),
  exigerSession: vi.fn(), exigerAdmin: vi.fn(),
  verifierEnrolement: vi.fn(), optionsEnrolement: vi.fn(), profilPourCode: vi.fn(),
  lireSession: vi.fn(), supprimerClient: vi.fn(),
}));
vi.mock('../db.js', () => mocks);
vi.mock('../gardes.js', () => mocks);
vi.mock('../auth/passkeys.js', () => ({ ...mocks,
  optionsConnexion: vi.fn(), verifierConnexion: vi.fn(), listerPasskeys: vi.fn(), supprimerPasskey: vi.fn(),
}));
vi.mock('../auth/enrolement.js', () => mocks);
vi.mock('../auth/session.js', () => ({ ...mocks, poserCookie: vi.fn(), signerJeton: vi.fn(), effacerCookie: vi.fn() }));
vi.mock('../clients/suppression.js', () => mocks);
process.env.DATABASE_URL ??= 'postgres://test-sans-connexion-reelle/test';
process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';
const { config } = await import('../config.js');
const { enregistrerRoutesAuth } = await import('./auth.js');
const { enregistrerRoutesStorage } = await import('./storage.js');
const { enregistrerRoutesCampagnes } = await import('./campagnes.js');
const { enregistrerRoutesClients } = await import('./clients.js');
const { signerDesinscription } = await import('../campagnes/gabarit.js');
let app: FastifyInstance;
let racine: string;
const profil = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.invalid', role: 'admin' };

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.exigerSession.mockResolvedValue({ sub: profil.id, roleApp: 'admin' });
  mocks.exigerAdmin.mockResolvedValue({ sub: profil.id, roleApp: 'admin' });
  mocks.profilPourCode.mockResolvedValue(profil);
  mocks.requeteUne.mockResolvedValue(profil);
  mocks.verifierEnrolement.mockResolvedValue(true);
  mocks.optionsEnrolement.mockResolvedValue({ challenge: 'défi' });
  racine = await mkdtemp(join(tmpdir(), 'crm-storage-'));
  config.storage.racine = racine;
  app = Fastify();
  await app.register(cookie);
  enregistrerRoutesAuth(app);
  enregistrerRoutesCampagnes(app);
  enregistrerRoutesClients(app);
  await enregistrerRoutesStorage(app);
});
afterEach(async () => { await app.close(); await rm(racine, { recursive: true, force: true }); });

async function commencer(code = 'ABCDE-FGHJK') {
  const r = await app.inject({ method: 'POST', url: '/api/auth/enrolement/options', payload: { code } });
  expect(r.statusCode).toBe(200);
  const c = r.cookies.find(c => c.name === 'crm_enrolement')!;
  return { crm_enrolement: c.value };
}

describe('enrôlement lié au navigateur et au code initial', () => {
  it.each([undefined, 'AUTRE-CODEX'])('ignore le code final %s et utilise le code initial', async (code) => {
    const cookies = await commencer();
    const r = await app.inject({ method: 'POST', url: '/api/auth/enrolement/verifier', cookies, payload: { reponse: {}, code } });
    expect(r.statusCode).toBe(200);
    expect(mocks.verifierEnrolement).toHaveBeenCalledWith(profil.id, {}, null, cookies.crm_enrolement, 'ABCDE-FGHJK');
    expect(cookies.crm_enrolement).not.toBe(profil.id);
  });
  it('refuse le rejeu du même parcours', async () => {
    const cookies = await commencer();
    const req = { method: 'POST' as const, url: '/api/auth/enrolement/verifier', cookies, payload: { reponse: {} } };
    expect((await app.inject(req)).statusCode).toBe(200);
    expect((await app.inject(req)).statusCode).toBe(400);
    expect(mocks.verifierEnrolement).toHaveBeenCalledTimes(1);
  });
  it('refuse un cookie contenant seulement un identifiant de profil', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/enrolement/verifier', cookies: { crm_enrolement: profil.id }, payload: { reponse: {} } });
    expect(r.statusCode).toBe(400);
    expect(mocks.verifierEnrolement).not.toHaveBeenCalled();
  });
  it('refuse un parcours expiré', async () => {
    const cookies = await commencer();
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 121_000);
    try {
      expect((await app.inject({ method: 'POST', url: '/api/auth/enrolement/verifier', cookies, payload: { reponse: {} } })).statusCode).toBe(400);
      expect(mocks.verifierEnrolement).not.toHaveBeenCalled();
    } finally { now.mockRestore(); }
  });
});

it.each(['bilan#2026.pdf', 'bilan?2026.pdf', 'été % 2026.pdf'])('ouvre une URL signée pour %s sans session', async (nom) => {
  const chemin = `dossier/${nom}`;
  await mkdir(join(racine, 'task-attachments', 'dossier'), { recursive: true });
  await writeFile(join(racine, 'task-attachments', chemin), 'document-test');
  const signed = await app.inject({ method: 'POST', url: `/api/storage/signer/task-attachments/${chemin.split('/').map(encodeURIComponent).join('/')}`, payload: {} });
  expect(signed.statusCode).toBe(200);
  mocks.exigerSession.mockImplementation(async (_req, reply) => { reply.code(401).send(); return null; });
  const opened = await app.inject({ method: 'GET', url: signed.json().url });
  expect(opened.statusCode).toBe(200);
  expect(opened.body).toBe('document-test');
});

describe('désinscription', () => {
  const lien = () => `/desinscription?c=${profil.id}&s=${signerDesinscription(config.session.secret, profil.id)}`;
  it.each(['GET', 'HEAD'] as const)('%s ne modifie rien', async (method) => {
    const r = await app.inject({ method, url: lien() });
    expect(r.statusCode).toBe(200);
    expect(mocks.requeteUne).not.toHaveBeenCalled();
    if (method === 'GET') expect(r.body).toContain('method="post"');
  });
  it('le formulaire POST confirme le retrait', async () => {
    mocks.requeteUne.mockResolvedValue({ nom_entreprise: 'Test' });
    const r = await app.inject({ method: 'POST', url: lien(), headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    expect(r.statusCode).toBe(200);
    expect(mocks.requeteUne).toHaveBeenCalledWith(expect.stringContaining('UPDATE clients SET accepte_mailings = false'), [profil.id]);
  });
  it('refuse une signature invalide même en POST', async () => {
    expect((await app.inject({ method: 'POST', url: `/desinscription?c=${profil.id}&s=faux` })).statusCode).toBe(400);
    expect(mocks.requeteUne).not.toHaveBeenCalled();
  });
});

it('refuse la suppression à un non-administrateur sans accéder aux données', async () => {
  mocks.exigerAdmin.mockImplementation(async (_req, reply) => { reply.code(403).send(); return null; });
  const r = await app.inject({ method: 'DELETE', url: `/api/clients/${profil.id}` });
  expect(r.statusCode).toBe(403);
  expect(mocks.supprimerClient).not.toHaveBeenCalled();
});
