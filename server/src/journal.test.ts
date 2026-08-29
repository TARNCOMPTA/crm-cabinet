import { describe, it, expect } from 'vitest';
import { cheminJournalisable, serialiserRequete } from './journal.js';

/**
 * Chaque cas est une URL que l'application produit reellement, relevee dans les
 * journaux du harnais. Ce ne sont pas des exemples inventes.
 */
describe('cheminJournalisable', () => {
  it('garde le chemin intact quand il n y a pas de requete', () => {
    expect(cheminJournalisable('/api/sante')).toBe('/api/sante');
    expect(cheminJournalisable('/rest/v1/clients')).toBe('/rest/v1/clients');
  });

  it('jette la valeur des filtres PostgREST et garde leurs noms', () => {
    expect(cheminJournalisable('/rest/v1/clients?email=eq.jean.dupont%40exemple.fr&select=*'))
      .toBe('/rest/v1/clients?email&select');
  });

  it('ne laisse passer aucune adresse ni aucun nom propre', () => {
    const sale = '/rest/v1/company_officers?last_name=eq.DUPONT&first_name=eq.Jean&select=id,nom';
    const propre = cheminJournalisable(sale);
    expect(propre).toBe('/rest/v1/company_officers?last_name&first_name&select');
    for (const fuite of ['DUPONT', 'Jean', 'eq.']) expect(propre).not.toContain(fuite);
  });

  /** ⚠️ La signature d'une URL signee est un SECRET D'ACCES, pas une donnee. */
  it('jette la signature des URL de telechargement', () => {
    const propre = cheminJournalisable('/api/storage/pieces/2026/bilan.pdf?expire=1787&signature=abcd1234');
    expect(propre).not.toContain('abcd1234');
    expect(propre).toContain('signature');
  });

  it('masque le nom du fichier depose, qui porte celui du client', () => {
    expect(cheminJournalisable('/api/storage/pieces/2026/bilan-DUPONT-2025.pdf'))
      .toBe('/api/storage/pieces/(masque)');
    // Le bucket est conserve : c'est une valeur fermee, elle ne designe personne.
    expect(cheminJournalisable('/api/storage/avatars/u/photo.png'))
      .toBe('/api/storage/avatars/(masque)');
  });

  it('laisse tranquille un chemin de stockage sans partie variable', () => {
    expect(cheminJournalisable('/api/storage/pieces')).toBe('/api/storage/pieces');
  });

  it('ne masque pas les routes qui ressemblent sans en etre', () => {
    expect(cheminJournalisable('/api/storages/pieces/x.pdf')).toBe('/api/storages/pieces/x.pdf');
    expect(cheminJournalisable('/api/clients/0fca9627-4ab7-4d4a-937c-bd9aea0d5f37'))
      .toBe('/api/clients/0fca9627-4ab7-4d4a-937c-bd9aea0d5f37');
  });

  it('tient les formes degenerees sans lever', () => {
    expect(cheminJournalisable('')).toBe('');
    expect(cheminJournalisable('/x?')).toBe('/x');
    expect(cheminJournalisable('/x?&&')).toBe('/x');
    expect(cheminJournalisable('/x?nu')).toBe('/x?nu');
    expect(cheminJournalisable('/x?a=1&a=2')).toBe('/x?a&a');
    expect(cheminJournalisable('/x?=vide')).toBe('/x?');
  });
});

describe('serialiserRequete', () => {
  it('ne retient que la methode et le chemin nettoye', () => {
    expect(serialiserRequete({ method: 'GET', url: '/rest/v1/clients?email=eq.a%40b.c' }))
      .toEqual({ method: 'GET', url: '/rest/v1/clients?email' });
  });

  /**
   * ⚠️ L'ADRESSE IP N'Y EST PAS, volontairement : le `Caddyfile` la supprime
   * deja de son propre journal, au motif que c'est une donnee personnelle qui
   * n'apprend rien sur un outil interne. Un journal sur deux ne protege rien.
   */
  it('ne retient ni adresse, ni en-tete, ni hote', () => {
    const sortie = serialiserRequete({
      method: 'POST',
      url: '/api/auth/session',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ ip: '81.12.34.56', hostname: 'crmcabinet.tarncompta.fr',
            headers: { cookie: 'crm_session=jeton-valide' } } as any),
    });
    expect(Object.keys(sortie).sort()).toEqual(['method', 'url']);
    expect(JSON.stringify(sortie)).not.toContain('81.12.34.56');
    expect(JSON.stringify(sortie)).not.toContain('jeton-valide');
  });

  it('se rabat sur la requete brute quand Fastify ne fournit pas les champs', () => {
    expect(serialiserRequete({ raw: { method: 'DELETE', url: '/rest/v1/x?id=eq.1' } }))
      .toEqual({ method: 'DELETE', url: '/rest/v1/x?id' });
  });
});
