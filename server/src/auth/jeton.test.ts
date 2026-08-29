import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signerAvec, verifierAvec, ALGORITHME, ROLE_POSTGREST } from './jeton.js';

/**
 * Chaque cas correspond a une attaque documentee contre les jetons JWT, ou a un
 * defaut reel du code d'origine. Aucun n'est hypothetique.
 */

const SECRET = 'secret-de-test-sans-valeur-aucune-32c';
const PROFIL = { id: 'a3f1c2d4-0000-4000-8000-000000000001', email: 'zz@example.test', role: 'admin' };

describe('signerAvec', () => {
  it('signe en HS256, nomme et non deduit', () => {
    const entete = JSON.parse(
      Buffer.from(signerAvec(PROFIL, SECRET, 3600).split('.')[0], 'base64url').toString()
    );
    expect(entete.alg).toBe(ALGORITHME);
  });

  it('porte ce que PostgREST attend', () => {
    const c = verifierAvec(signerAvec(PROFIL, SECRET, 3600), SECRET);
    expect(c).toMatchObject({ sub: PROFIL.id, role: ROLE_POSTGREST, roleApp: 'admin', email: PROFIL.email });
    expect(c?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe('verifierAvec — ce qui doit passer', () => {
  it('accepte un jeton qu il vient de signer', () => {
    expect(verifierAvec(signerAvec(PROFIL, SECRET, 3600), SECRET)?.sub).toBe(PROFIL.id);
  });
});

describe('verifierAvec — ce qui doit tomber', () => {
  it('refuse une signature faite avec un autre secret', () => {
    expect(verifierAvec(signerAvec(PROFIL, 'un-autre-secret-tout-aussi-faux', 3600), SECRET)).toBeNull();
  });

  /** ⚠️ L'attaque classique : l'en-tete annonce `none`, il n'y a plus de signature. */
  it('refuse un jeton sans algorithme', () => {
    const nu = jwt.sign({ sub: 'x', role: ROLE_POSTGREST, roleApp: 'admin', email: 'x@y.z' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      null as any, { algorithm: 'none' });
    expect(verifierAvec(nu, SECRET)).toBeNull();
  });

  it('refuse un algorithme HMAC autre que celui annonce', () => {
    const hs512 = jwt.sign({ sub: 'x', role: ROLE_POSTGREST, roleApp: 'admin', email: 'x@y.z' },
      SECRET, { algorithm: 'HS512' });
    // Signature parfaitement valide, secret correct — seul l'algorithme change.
    expect(jwt.verify(hs512, SECRET)).toBeTruthy();
    expect(verifierAvec(hs512, SECRET)).toBeNull();
  });

  it('refuse un jeton expire', () => {
    expect(verifierAvec(signerAvec(PROFIL, SECRET, -10), SECRET)).toBeNull();
  });

  it('refuse une chaine qui n est pas un jeton', () => {
    for (const bidon of ['', 'a.b.c', 'pas-un-jeton', '....']) {
      expect(verifierAvec(bidon, SECRET)).toBeNull();
    }
  });

  /**
   * ⚠️ LE DEFAUT DU CODE D'ORIGINE. `jwt.verify(...) as Revendications` est une
   * assertion de type : elle ne verifie RIEN a l'execution. Un jeton
   * correctement signe mais de forme differente traversait, et `roleApp`
   * valait `undefined` en aval.
   */
  it('refuse un jeton bien signe mais de forme etrangere', () => {
    for (const charge of [
      { sub: 'x' },                                             // il manque tout le reste
      { sub: '', role: 'a', roleApp: 'b', email: 'c' },          // sujet vide
      { sub: 'x', role: 'a', roleApp: 'b' },                     // pas d'email
      { sub: 'x', role: 'a', roleApp: 42, email: 'c' },          // roleApp n'est pas un texte
      { sub: 42, role: 'a', roleApp: 'b', email: 'c' },          // sujet numerique
    ]) {
      const jeton = jwt.sign(charge, SECRET, { algorithm: ALGORITHME });
      expect(verifierAvec(jeton, SECRET), JSON.stringify(charge)).toBeNull();
    }
  });
});
