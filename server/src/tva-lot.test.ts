import { describe, it, expect } from 'vitest';
import { JOURS_DU_CYCLE, cycleTenu, doitInterrompre, tailleDuLot } from './tva-lot.js';

describe('tailleDuLot', () => {
  it('couvre tout le portefeuille en trente jours', () => {
    // La promesse faite au cabinet : « au moins une fois par mois ». Elle se
    // verifie par le calcul, pas par l'intention.
    for (const eligibles of [1, 12, 150, 940, 3_600]) {
      expect(
        tailleDuLot(eligibles) * JOURS_DU_CYCLE,
        `${eligibles} fiches ne sont pas couvertes en ${JOURS_DU_CYCLE} jours`
      ).toBeGreaterThanOrEqual(eligibles);
      expect(cycleTenu(eligibles)).toBe(true);
    }
  });

  it('ne descend pas sous un plancher, sinon un petit cabinet tourne en rond', () => {
    // Douze fiches donneraient un lot de 1 : le cycle serait tenu, mais la
    // tache passerait vingt-neuf jours a ne rien faire d'utile.
    expect(tailleDuLot(3)).toBe(5);
    expect(tailleDuLot(12)).toBe(5);
  });

  it('refuse d accelerer au-dela du plafond, meme au prix du cycle', () => {
    // C'est le seul endroit ou la promesse cede : mieux vaut un cycle plus long
    // qu'un lot qui ferait de nous le client bruyant d'un service gratuit.
    expect(tailleDuLot(100_000)).toBe(120);
    expect(cycleTenu(100_000)).toBe(false);
  });

  it('ne demande rien quand il n y a rien a verifier', () => {
    expect(tailleDuLot(0)).toBe(0);
    expect(tailleDuLot(-1)).toBe(0);
  });
});

describe('doitInterrompre', () => {
  it('laisse passer les indisponibilites isolees', () => {
    // VIES sature ponctuellement : c'est ordinaire, et la reprise integree a
    // `verifier()` le rattrape le plus souvent.
    for (const n of [0, 1, 2, 3, 4]) expect(doitInterrompre(n)).toBe(false);
  });

  it('arrete le lot apres cinq echecs d affilee', () => {
    // Cinq d'affilee ne disent plus « sature » mais « en panne », ou « c'est
    // nous qu'il refuse ». Continuer a derouler le lot est precisement ce qui
    // fait passer d'une saturation a un blocage.
    expect(doitInterrompre(5)).toBe(true);
    expect(doitInterrompre(9)).toBe(true);
  });
});
