import { describe, it, expect } from 'vitest';
import { verdictEnvoiEmails, estRefusIdentifiants, type EtatEnvoiEmails } from './etatEmails';

/**
 * Le test que la panne du 15 aout aurait du rencontrer.
 *
 * Vingt-quatre jours sans qu'un seul courriel parte, et rien a l'ecran. Ce
 * fichier fige ce que le produit doit DIRE dans cette situation.
 */

const RIEN: EtatEnvoiEmails = {
  enEchec: 0,
  depuis: null,
  dernierEnvoi: '2026-09-08T10:00:00Z',
  derniereErreur: null,
};

/** L'etat reel du cabinet le 2026-09-08, tel que la base le portait. */
const PANNE_REELLE: EtatEnvoiEmails = {
  enEchec: 10,
  depuis: '2026-08-15T09:58:39Z',
  dernierEnvoi: null,
  derniereErreur:
    'Invalid login: 535 5.7.139 Authentication unsuccessful, the user credentials were incorrect.',
};

const LE_8_SEPTEMBRE = new Date('2026-09-08T12:00:00Z');

describe('verdictEnvoiEmails', () => {
  it('ne dit RIEN quand tout part', () => {
    expect(verdictEnvoiEmails(RIEN, LE_8_SEPTEMBRE)).toEqual({ enPanne: false });
  });

  it('annonce la panne reelle du cabinet, avec sa date', () => {
    const v = verdictEnvoiEmails(PANNE_REELLE, LE_8_SEPTEMBRE);
    expect(v.enPanne).toBe(true);
    if (!v.enPanne) return;
    expect(v.authentification).toBe(true);
    expect(v.jours).toBe(24);
    expect(v.titre).toContain('refuse les identifiants');
    expect(v.titre).toContain('15/08/2026');
    // Le detail doit dire ce qu'on perd, pas seulement qu'il y a une erreur.
    expect(v.detail).toContain('Paramètres');
  });

  it('distingue un refus d identifiants d une panne de relais', () => {
    // Ce qui change a l'ecran : « corrigez » contre « patientez ».
    const reseau = verdictEnvoiEmails(
      { ...PANNE_REELLE, derniereErreur: 'connect ETIMEDOUT 10.0.0.4:587' },
      LE_8_SEPTEMBRE
    );
    expect(reseau.enPanne).toBe(true);
    if (!reseau.enPanne) return;
    expect(reseau.authentification).toBe(false);
    expect(reseau.titre).not.toContain('identifiants');
  });

  it('accorde le singulier', () => {
    const un = verdictEnvoiEmails(
      { enEchec: 1, depuis: '2026-09-07T08:00:00Z', dernierEnvoi: null, derniereErreur: 'mailbox unavailable' },
      LE_8_SEPTEMBRE
    );
    if (!un.enPanne) throw new Error('attendu en panne');
    expect(un.titre).toContain("Un courriel n'est pas parti");
    expect(un.titre).not.toContain('1 courriels');
  });

  it('S EFFACE des qu un envoi repart', () => {
    // La propriete qui evite le bandeau permanent : le verdict porte sur les
    // echecs DEPUIS le dernier succes, pas sur tout l'historique. Une adresse
    // invalide d'il y a six mois ne doit pas alarmer aujourd'hui.
    expect(verdictEnvoiEmails({ ...PANNE_REELLE, enEchec: 0 }, LE_8_SEPTEMBRE)).toEqual({
      enPanne: false,
    });
  });

  it('tient sans date de debut ni dernier envoi', () => {
    const v = verdictEnvoiEmails(
      { enEchec: 3, depuis: null, dernierEnvoi: null, derniereErreur: null },
      LE_8_SEPTEMBRE
    );
    if (!v.enPanne) throw new Error('attendu en panne');
    expect(v.jours).toBe(0);
    expect(v.titre).toBe('3 courriels ne sont pas partis');
    expect(v.detail).toContain("Aucun courriel n'a jamais été envoyé");
  });

  it('ne rend pas une date illisible quand l horodatage est invalide', () => {
    const v = verdictEnvoiEmails({ ...PANNE_REELLE, depuis: 'pas-une-date' }, LE_8_SEPTEMBRE);
    if (!v.enPanne) throw new Error('attendu en panne');
    expect(v.jours).toBe(0);
    expect(v.titre).toContain('pas-une-date');
  });
});

describe('estRefusIdentifiants', () => {
  it('reconnait les refus des serveurs courants', () => {
    for (const m of [
      'Invalid login: 535 5.7.139 Authentication unsuccessful',
      '535 5.7.8 Username and password not accepted',
      'Error: EAUTH',
      '534 5.7.9 Application-specific password required',
      'authentication failed',
    ]) {
      expect(estRefusIdentifiants(m), m).toBe(true);
    }
  });

  it('ne prend pas une panne reseau pour un refus', () => {
    for (const m of [
      'connect ETIMEDOUT 10.0.0.4:587',
      'getaddrinfo ENOTFOUND smtp.example.test',
      '450 4.7.1 Try again later',
      'Connection closed unexpectedly',
      null,
    ]) {
      expect(estRefusIdentifiants(m), String(m)).toBe(false);
    }
  });
});
