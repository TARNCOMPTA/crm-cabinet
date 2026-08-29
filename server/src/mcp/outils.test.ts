import { describe, it, expect } from 'vitest';

// `outils.ts` importe `../db.js`, qui exige DATABASE_URL et SESSION_SECRET au
// chargement (config.ts). Ce test ne touche jamais la base — `pg.Pool` ne se
// connecte qu'a la premiere requete — mais l'import doit tout de meme trouver
// ces deux variables. Posees ici plutot que dans la configuration globale de
// vitest : ce test est le seul, dans tout `server/src/mcp`, a en avoir besoin.
process.env.DATABASE_URL ??= 'postgres://test-sans-connexion-reelle/test';
process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';

const { compareParJourEcheance } = await import('./outils.js');

/**
 * Le tri de `list_fiscal_deadlines`.
 * ---------------------------------------------------------------------------
 * Seule piece de logique nouvelle de l'outil : le reste reprend, a l'identique,
 * `construireSuivi()` et `echeanceTva()` — deja testes ailleurs, et verifies a
 * nouveau ici sur un vrai PostgreSQL (mensuelle, trimestrielle, surcharge,
 * societe non rattachee, exclusion des archives et des declarations hors TVA).
 *
 * Une inversion dans ce comparateur ne casse rien visiblement : elle place les
 * echeances INDETERMINEES en tete d'une reponse d'assistant, devant les vraies
 * dates — l'ordre le plus trompeur possible pour un cabinet qui demande
 * « quelles sont mes prochaines echeances ».
 */
describe('compareParJourEcheance', () => {
  const j = (jour_echeance: number | null) => ({ jour_echeance });

  it('trie les jours connus du plus tot au plus tard', () => {
    const lignes = [j(24), j(16), j(21), j(19)];
    lignes.sort(compareParJourEcheance);
    expect(lignes.map((l) => l.jour_echeance)).toEqual([16, 19, 21, 24]);
  });

  it('place les jours inconnus en queue, jamais en tete', () => {
    const lignes = [j(null), j(21), j(null), j(16)];
    lignes.sort(compareParJourEcheance);
    expect(lignes.map((l) => l.jour_echeance)).toEqual([16, 21, null, null]);
  });

  it('ne reordonne pas deux jours inconnus entre eux', () => {
    expect(compareParJourEcheance(j(null), j(null))).toBe(0);
  });

  it('est symetrique', () => {
    expect(compareParJourEcheance(j(16), j(24))).toBeLessThan(0);
    expect(compareParJourEcheance(j(24), j(16))).toBeGreaterThan(0);
  });
});
