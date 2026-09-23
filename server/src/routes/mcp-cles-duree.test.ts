import { describe, it, expect } from 'vitest';
import { DUREES_MOIS, dureeMois } from './mcp-cles-duree';

/**
 * La durée de validité d'une clé MCP statique.
 *
 * ⚠️ UNE CLÉ STATIQUE N'EXPIRAIT JAMAIS (incrément 022). La règle ici garde la
 * porte fermée : aucune valeur envoyée par l'écran — ni `0`, ni `null` écrit
 * exprès, ni `9999` — ne doit rouvrir la clé sans échéance.
 */
describe('dureeMois', () => {
  it('prend douze mois quand rien n est demande', () => {
    expect(dureeMois(undefined)).toBe(12);
    expect(dureeMois(null)).toBe(12);
  });

  it('accepte les trois durees proposees', () => {
    for (const d of DUREES_MOIS) expect(dureeMois(d)).toBe(d);
  });

  it('REFUSE toute autre duree, et d abord celles qui vaudraient « jamais »', () => {
    for (const d of [0, -1, 24, 9999, 1200, '12', 12.5, true, 'jamais', Infinity]) {
      expect(dureeMois(d), String(d)).toBeNull();
    }
  });

  it('ne propose rien au-dela d un an', () => {
    expect(Math.max(...DUREES_MOIS)).toBeLessThanOrEqual(12);
  });
});
