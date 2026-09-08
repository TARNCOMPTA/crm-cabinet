import { describe, it, expect } from 'vitest';
import { champsManquants, type SaisieSmtp } from './reglagesSmtp';

const MOTDEPASSE: SaisieSmtp = {
  smtp_host: 'smtp.office365.com',
  smtp_user: 'compta@cabinet.test',
  smtp_password: 'secret',
  smtp_from_email: 'compta@cabinet.test',
  auth_mode: 'motdepasse',
  oauth_tenant_id: '',
  oauth_client_id: '',
  oauth_client_secret: '',
};

const OAUTH: SaisieSmtp = {
  ...MOTDEPASSE,
  smtp_password: '',
  auth_mode: 'oauth2',
  oauth_tenant_id: 'contoso.onmicrosoft.com',
  oauth_client_id: '11111111-2222-3333-4444-555555555555',
  oauth_client_secret: 'secret-azure',
};

describe('champsManquants', () => {
  it('ne reclame rien sur une configuration par mot de passe complete', () => {
    expect(champsManquants(MOTDEPASSE)).toEqual([]);
  });

  it('ne reclame rien sur une configuration OAuth complete', () => {
    expect(champsManquants(OAUTH)).toEqual([]);
  });

  it('N EXIGE PAS de mot de passe en OAuth', () => {
    // L'ancienne condition en ligne l'exigeait : une configuration OAuth
    // parfaitement valable etait refusee a l'activation.
    expect(champsManquants({ ...OAUTH, smtp_password: '' })).toEqual([]);
  });

  it('EXIGE les trois identifiants Azure en OAuth', () => {
    // L'ancienne condition ne les regardait pas : on pouvait activer l'envoi
    // avec une configuration OAuth vide, et l'echec n'arrivait qu'a la
    // premiere tache, la nuit.
    expect(champsManquants({ ...OAUTH, oauth_tenant_id: '' })).toContain('Identifiant de locataire (tenant)');
    expect(champsManquants({ ...OAUTH, oauth_client_id: '' })).toContain("Identifiant d'application (client)");
    expect(champsManquants({ ...OAUTH, oauth_client_secret: '' })).toContain("Secret d'application");
  });

  it('exige l identifiant SMTP dans les DEUX modes', () => {
    // En OAuth, c'est la boite au nom de laquelle l'application envoie :
    // Exchange refuse sans elle.
    expect(champsManquants({ ...MOTDEPASSE, smtp_user: '' })).toContain('Identifiant SMTP');
    expect(champsManquants({ ...OAUTH, smtp_user: '' })).toContain('Identifiant SMTP');
  });

  it('ne rogne PAS le mot de passe', () => {
    // Un mot de passe peut commencer par une espace. Le `trim()` le declarerait
    // manquant, ou pire, l'enregistrerait ampute.
    expect(champsManquants({ ...MOTDEPASSE, smtp_password: ' ' })).toEqual([]);
  });

  it('nomme TOUS les champs manquants, pas seulement le premier', () => {
    // Un message qui n'en nomme qu'un fait recommencer autant de fois qu'il en
    // manque.
    const vide = champsManquants({
      smtp_host: '', smtp_user: '', smtp_password: '', smtp_from_email: '',
      auth_mode: 'oauth2', oauth_tenant_id: '', oauth_client_id: '', oauth_client_secret: '',
    });
    expect(vide).toHaveLength(6);
  });
});
