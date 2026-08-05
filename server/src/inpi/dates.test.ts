import { describe, it, expect } from 'vitest';
import { convertirJJMMEnDate } from './dates.js';

/**
 * La conversion « JJMM » de l'INPI.
 *
 * Onze lignes, portées depuis le front pour que le serveur devienne le seul
 * écrivain de `clients` sur le chemin INPI. Le test vient avec elles : la
 * fonction n'en avait aucun côté navigateur, et une erreur ici écrit une
 * mauvaise date de clôture sur une fiche.
 */
describe('convertirJJMMEnDate', () => {
  const annee = new Date().getFullYear();

  it('convertit une cloture de fin d annee', () => {
    expect(convertirJJMMEnDate('3112')).toBe(`${annee}-12-31`);
  });

  it('convertit une cloture en cours d annee', () => {
    expect(convertirJJMMEnDate('3006')).toBe(`${annee}-06-30`);
    expect(convertirJJMMEnDate('0101')).toBe(`${annee}-01-01`);
  });

  /**
   * ⭐ `new Date('2026-02-30')` NE LEVE PAS : elle glisse au 2 mars. Sans le
   * controle de coherence, une cloture au 30 fevrier serait enregistree comme
   * une cloture au 2 mars — une date fausse, et parfaitement plausible a l'œil.
   */
  it('refuse une date qui n existe pas', () => {
    expect(convertirJJMMEnDate('3002')).toBeNull();
    expect(convertirJJMMEnDate('3104')).toBeNull();
    expect(convertirJJMMEnDate('3213')).toBeNull();
  });

  it('rend null sur une entree absente ou mal formee', () => {
    for (const mauvais of [null, undefined, '', '31', '31122', 'abcd']) {
      expect(convertirJJMMEnDate(mauvais), `« ${mauvais} »`).toBeNull();
    }
  });

  /**
   * L'annee est une CONVENTION : `date_cloture` ne se lit que par son jour et
   * son mois. Ce test le dit, pour qu'on ne s'etonne pas de la voir bouger d'un
   * exercice a l'autre.
   */
  it('emploie l annee courante, qui n est pas une information', () => {
    expect(convertirJJMMEnDate('3112')?.slice(0, 4)).toBe(String(annee));
  });
});
