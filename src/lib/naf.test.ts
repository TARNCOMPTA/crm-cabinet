import { describe, it, expect } from 'vitest';
import { libelleSection, lettreSection, optionsNaf } from './naf';

/**
 * Le code NAF rendu lisible, pour cibler une campagne.
 * ---------------------------------------------------------------------------
 * Ce que ces tests protègent : le rattachement d'un code à sa section. C'est la
 * seule chose que ce module affirme, et une erreur y serait invisible — une
 * étiquette fausse se lit aussi bien qu'une vraie, et c'est sur elle que
 * l'utilisateur choisit à qui il écrit.
 *
 * Les plages de la NAF rév. 2 ont des trous (04, 34, 89 n'existent pas) : un
 * code qui y tombe doit rester sans libellé, pas recevoir celui du voisin.
 */
describe('sections de la NAF', () => {
  it('situe un code dans sa section', () => {
    expect(libelleSection('6201Z')).toBe('Information et communication');
    expect(libelleSection('4120A')).toBe('Construction');
    expect(libelleSection('6820A')).toBe('Activités immobilières');
    expect(libelleSection('8690D')).toBe('Santé humaine et action sociale');
  });

  /** La division seule doit se situer comme le code entier : c'est un préfixe. */
  it('situe une division comme le code entier', () => {
    expect(libelleSection('62')).toBe(libelleSection('6201Z'));
    expect(lettreSection('62')).toBe('J');
    expect(lettreSection('41')).toBe('F');
  });

  it('reste muet sur ce que la nomenclature ne couvre pas', () => {
    // 04, 34 et 89 sont des trous de la nomenclature, pas des divisions.
    for (const absent of ['0400A', '3400Z', '8900A', '', 'ABCDE']) {
      expect(libelleSection(absent), absent).toBe('');
      expect(lettreSection(absent), absent).toBe('');
    }
  });
});

describe('optionsNaf', () => {
  const presents = [
    { code: '4120A', nb: 7 },
    { code: '4399C', nb: 2 },
    { code: '6201Z', nb: 5 },
    { code: '4321A', nb: 3 },
  ];

  /**
   * ⭐ LA DIVISION NE S'AJOUTE QUE SI ELLE REGROUPE. `62` ne contient ici qu'une
   * classe : la proposer viserait exactement les mêmes clients que `6201Z`, soit
   * deux entrées pour un seul résultat — de quoi hésiter sans rien gagner.
   */
  it('ne propose une division que lorsqu elle regroupe plusieurs classes', () => {
    const valeurs = optionsNaf(presents).map((o) => o.valeur);
    expect(valeurs).toContain('43');
    expect(valeurs).not.toContain('62');
    expect(valeurs).not.toContain('41');
  });

  it('additionne l effectif d une division', () => {
    const division = optionsNaf(presents).find((o) => o.valeur === '43');
    expect(division?.groupe).toBe(true);
    // 4321A (3) + 4399C (2)
    expect(division?.detail).toContain('5 clients');
    expect(division?.detail).toContain('Construction');
  });

  /** On descend d'un métier vers ses spécialités : la division précède ses classes. */
  it('ordonne par division, la division avant ses classes', () => {
    expect(optionsNaf(presents).map((o) => o.valeur)).toEqual([
      '4120A',
      '43',
      '4321A',
      '4399C',
      '6201Z',
    ]);
  });

  it('accorde le singulier', () => {
    expect(optionsNaf([{ code: '6201Z', nb: 1 }])[0]?.detail).toContain('1 client');
    expect(optionsNaf([{ code: '6201Z', nb: 1 }])[0]?.detail).not.toContain('1 clients');
  });

  it('ne tombe pas sur un portefeuille sans aucun code', () => {
    expect(optionsNaf([])).toEqual([]);
  });
});
