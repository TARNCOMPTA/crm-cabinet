import { describe, it, expect } from 'vitest';
import {
  urlJeton,
  corpsDemandeJeton,
  analyserReponseJeton,
  estPerime,
  MARGE_PEREMPTION_MS,
  PORTEE_SMTP,
} from './oauth-microsoft.js';

/**
 * Ce module ne peut PAS etre eprouve contre Microsoft depuis cet
 * environnement — le mandataire refuse `login.microsoftonline.com`. Ce qui est
 * eprouvable l'est donc entierement : c'est la ou se logent les erreurs qu'un
 * essai manuel ne rattraperait pas.
 */

const MAINTENANT = Date.UTC(2026, 8, 8, 12, 0, 0);

describe('urlJeton', () => {
  it('vise le locataire demande', () => {
    expect(urlJeton('contoso.onmicrosoft.com')).toBe(
      'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token'
    );
  });

  it('echappe ce qui viendrait d une saisie', () => {
    // Le locataire est saisi a la main dans un formulaire : une barre oblique
    // ou un espace ne doit pas pouvoir rediriger la demande ailleurs.
    expect(urlJeton('a/b')).toContain('a%2Fb');
    expect(urlJeton('a b')).not.toContain(' ');
  });
});

describe('corpsDemandeJeton', () => {
  it('porte les quatre champs du flux client_credentials', () => {
    const c = corpsDemandeJeton('id-client', 'secret');
    expect(c.get('grant_type')).toBe('client_credentials');
    expect(c.get('client_id')).toBe('id-client');
    expect(c.get('client_secret')).toBe('secret');
    expect(c.get('scope')).toBe(PORTEE_SMTP);
  });

  it('demande la portee SMTP d Exchange, en .default', () => {
    // `.default` est impose par le flux : on ne peut pas y demander une portee
    // a la carte. Une portee delegue (SMTP.Send) ferait echouer la demande.
    expect(PORTEE_SMTP).toBe('https://outlook.office365.com/.default');
  });
});

describe('analyserReponseJeton', () => {
  it('lit un jeton et calcule sa peremption A PARTIR DE SECONDES', () => {
    // `expires_in` est en secondes. Le prendre pour des millisecondes ferait
    // redemander un jeton a chaque envoi ; l'inverse ferait presenter un jeton
    // mort pendant cinquante-neuf minutes.
    const j = analyserReponseJeton({ access_token: 'abc', expires_in: 3599 }, MAINTENANT);
    expect(j.valeur).toBe('abc');
    expect(j.expireLe).toBe(MAINTENANT + 3_599_000);
  });

  it('retient une heure quand la duree manque', () => {
    const j = analyserReponseJeton({ access_token: 'abc' }, MAINTENANT);
    expect(j.expireLe).toBe(MAINTENANT + 3_600_000);
  });

  it('REND LE DIAGNOSTIC DE MICROSOFT, et non un message a nous', () => {
    // AADSTS7000215 dit « secret invalide » ; le remplacer par « echec de
    // l'authentification » ferait perdre la seule information exploitable.
    expect(() =>
      analyserReponseJeton(
        { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' },
        MAINTENANT
      )
    ).toThrow(/AADSTS7000215/);
  });

  it('leve plutot que de rendre un jeton vide', () => {
    expect(() => analyserReponseJeton({ access_token: '' }, MAINTENANT)).toThrow(/n a pas rendu de jeton/);
    expect(() => analyserReponseJeton({}, MAINTENANT)).toThrow(/n a pas rendu de jeton/);
    expect(() => analyserReponseJeton(null, MAINTENANT)).toThrow(/Reponse inattendue/);
    expect(() => analyserReponseJeton('pas du json', MAINTENANT)).toThrow(/Reponse inattendue/);
  });
});

describe('estPerime', () => {
  const jeton = { valeur: 'abc', expireLe: MAINTENANT + 3_600_000 };

  it('accepte un jeton frais', () => {
    expect(estPerime(jeton, MAINTENANT)).toBe(false);
  });

  it('renouvelle AVANT la peremption, pas apres', () => {
    // Un jeton qui expire pendant l'envoi d'un lot fait echouer les courriels
    // restants. La marge existe pour que cela n'arrive pas.
    expect(estPerime(jeton, jeton.expireLe - MARGE_PEREMPTION_MS - 1)).toBe(false);
    expect(estPerime(jeton, jeton.expireLe - MARGE_PEREMPTION_MS)).toBe(true);
    expect(estPerime(jeton, jeton.expireLe)).toBe(true);
  });

  it('traite l absence de jeton comme un jeton perime', () => {
    expect(estPerime(null, MAINTENANT)).toBe(true);
  });
});
