import { describe, it, expect } from 'vitest';

// `mail.ts` importe `config.js`, qui exige DATABASE_URL et SESSION_SECRET au
// chargement. Ce test ne touche ni la base ni le reseau — il n'eprouve qu'une
// fonction pure — mais l'import doit tout de meme les trouver. Meme preambule
// que `tests/outils-mcp.test.ts`.
process.env.DATABASE_URL ??= 'postgres://test-sans-connexion-reelle/test';
process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';

const { estRefusAuthentification } = await import('./mail.js');

/**
 * Ce que cette garde protege : la boite du cabinet.
 *
 * Un refus d'identifiants ne se repare pas en reessayant. Chaque tentative est
 * un echec d'authentification de plus, et Microsoft 365 verrouille le compte au
 * bout de quelques-uns. Constate en production le 2026-09-08 :
 * « 535 5.7.139 Authentication unsuccessful, account locked. »
 *
 * On lit le CODE et non le texte : le message change avec le fournisseur, sa
 * langue et sa version.
 */
describe('estRefusAuthentification', () => {
  it('reconnait le code que nodemailer pose sur un refus', () => {
    expect(estRefusAuthentification({ code: 'EAUTH' })).toBe(true);
  });

  it('reconnait les trois codes SMTP d authentification', () => {
    for (const responseCode of [530, 534, 535]) {
      expect(estRefusAuthentification({ responseCode }), String(responseCode)).toBe(true);
    }
  });

  it('reconnait le refus reel de Microsoft 365', () => {
    const e = Object.assign(
      new Error('Invalid login: 535 5.7.139 Authentication unsuccessful, the user credentials were incorrect.'),
      { code: 'EAUTH', responseCode: 535 }
    );
    expect(estRefusAuthentification(e)).toBe(true);
  });

  it('NE prend PAS un refus de destinataire pour un refus d identifiants', () => {
    // 550 est un 5xx : definitif, donc pas de reprise pour CE message. Mais la
    // connexion, elle, est bonne — interrompre le lot priverait d'envoi tous
    // les courriels suivants a cause d'une seule adresse invalide.
    expect(estRefusAuthentification({ responseCode: 550 })).toBe(false);
    expect(estRefusAuthentification({ responseCode: 553 })).toBe(false);
  });

  it('NE prend PAS une panne reseau pour un refus d identifiants', () => {
    expect(estRefusAuthentification({ code: 'ETIMEDOUT' })).toBe(false);
    expect(estRefusAuthentification({ code: 'ECONNECTION' })).toBe(false);
    expect(estRefusAuthentification({ responseCode: 451 })).toBe(false);
    expect(estRefusAuthentification(new Error('boom'))).toBe(false);
    expect(estRefusAuthentification(null)).toBe(false);
    expect(estRefusAuthentification(undefined)).toBe(false);
  });
});
