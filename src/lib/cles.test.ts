import { describe, it, expect } from 'vitest';
import { cleLuhn, luhnLikeSirenChecksum, luhnLikeSiretChecksum } from './cles';

/**
 * Les clés de contrôle SIREN / SIRET.
 * ---------------------------------------------------------------------------
 * Ces deux fonctions vivaient en deux corps identiques dans
 * `incompleteFieldsConfig.ts`, sans aucun test — et on vient de les
 * refactoriser. C'est exactement le moment de les figer.
 *
 * Les numéros employés ici sont réels et vérifiables :
 *   · 303 265 045 — SA SODIMAS, SIREN valide
 *   · 732 829 320 — SIREN valide
 *   · 35600000009075 — un établissement de La Poste, SIRET valide dont la clé de
 *     Luhn échoue LÉGITIMEMENT (voir le commentaire de `luhnLikeSiretChecksum`)
 */
describe('cleLuhn', () => {
  it('valide un SIREN correct', () => {
    expect(luhnLikeSirenChecksum('303265045')).toBe(true);
    expect(luhnLikeSirenChecksum('732829320')).toBe(true);
  });

  it('rejette un SIREN dont un chiffre a été mal saisi', () => {
    expect(luhnLikeSirenChecksum('303265046')).toBe(false);
    expect(luhnLikeSirenChecksum('403265045')).toBe(false);
  });

  /** L'erreur de frappe la plus courante : deux chiffres échangés. */
  it('rejette une transposition de deux chiffres', () => {
    expect(luhnLikeSirenChecksum('303256045')).toBe(false);
  });

  it('valide un SIRET correct', () => {
    expect(luhnLikeSiretChecksum('30326504500003')).toBe(true);
    expect(luhnLikeSiretChecksum('30326504500011')).toBe(true);
  });

  /**
   * ⚠️ LE PIÈGE À NE PAS « CORRIGER ».
   *
   * Les établissements de La Poste (SIREN 356 000 000) vérifient leur clé par la
   * divisibilité par 5 de la somme des chiffres, pas par Luhn.
   * `35600000009075` est un SIRET valide qui échoue ici — et c'est pour cela que
   * `validateField` rend un `warning` et non un `invalid` sur un SIRET.
   *
   * Ce test existe pour qu'un futur lecteur qui trouverait le `warning` trop
   * timide et voudrait le durcir en `invalid` casse la CI avant de casser la
   * saisie d'un cabinet ayant La Poste parmi ses clients.
   */
  it('échoue sur un SIRET La Poste, qui est pourtant valide', () => {
    expect(luhnLikeSiretChecksum('35600000009075')).toBe(false);
    // La règle qui s'applique réellement à ces numéros, pour mémoire.
    const sommeDesChiffres = [...'35600000009075'].reduce((a, c) => a + Number(c), 0);
    expect(sommeDesChiffres % 5).toBe(0);
  });

  it('exige la bonne longueur', () => {
    // 8 chiffres, clé de Luhn satisfaite malgré tout : ce n'est pas un SIREN.
    expect(cleLuhn('00000000', 8)).toBe(true);
    expect(luhnLikeSirenChecksum('00000000')).toBe(false);
    expect(luhnLikeSirenChecksum('3032650450')).toBe(false);
    expect(luhnLikeSiretChecksum('303265045')).toBe(false);
  });

  it('refuse tout ce qui n est pas uniquement des chiffres', () => {
    for (const entree of ['', '   ', '303 265 045', '30326504A', 'abcdefghi', '-03265045']) {
      expect(luhnLikeSirenChecksum(entree), `« ${entree} » a passé le contrôle`).toBe(false);
    }
  });
});
