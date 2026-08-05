import { describe, it, expect } from 'vitest';
import { parLots, TAILLE_LOT } from './lots';

/**
 * Le decoupage des filtres par identifiants.
 * ---------------------------------------------------------------------------
 * Ces tests rejouent la panne du 2026-08-01 : l'ecran « donnees manquantes »
 * repondait « Exceeded maximum allowed HTTP header size ». Un `.in('client_id',
 * [...])` sur 649 clients produisait une URL de 23 114 caracteres, au-dela du
 * plafond d'en-tetes de Node, d'ou un HTTP 431.
 *
 * Le defaut dependait du VOLUME : invisible sur une base de developpement vide,
 * fatal chez un cabinet de six cents clients. C'est exactement le genre de
 * regression qu'un test doit tenir, parce que le developpement ne la verra pas.
 */
describe('parLots', () => {
  it('ne lance aucune requete sur une liste vide', async () => {
    let appels = 0;
    const resultat = await parLots([], () => {
      appels++;
      return Promise.resolve({ data: [], error: null });
    });
    expect(appels).toBe(0);
    expect(resultat).toEqual([]);
  });

  it('passe en une seule fois sous la taille de lot', async () => {
    const lotsVus: string[][] = [];
    const ids = Array.from({ length: TAILLE_LOT }, (_, i) => `id-${i}`);
    await parLots(ids, (lot) => {
      lotsVus.push(lot);
      return Promise.resolve({ data: [], error: null });
    });
    expect(lotsVus).toHaveLength(1);
    expect(lotsVus[0]).toHaveLength(TAILLE_LOT);
  });

  it('decoupe au-dela et ne perd aucun identifiant', async () => {
    const ids = Array.from({ length: 649 }, (_, i) => `id-${i}`);
    const lotsVus: string[][] = [];
    await parLots(ids, (lot) => {
      lotsVus.push(lot);
      return Promise.resolve({ data: [], error: null });
    });

    expect(lotsVus).toHaveLength(Math.ceil(649 / TAILLE_LOT));
    expect(lotsVus.every((lot) => lot.length <= TAILLE_LOT)).toBe(true);
    expect(lotsVus.flat()).toEqual(ids);
  });

  it('concatene les lignes de tous les lots', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const resultat = await parLots(ids, (lot) =>
      Promise.resolve({ data: lot.map((id) => ({ id })), error: null })
    );
    expect(resultat).toHaveLength(250);
    expect(resultat[0]).toEqual({ id: 'id-0' });
    expect(resultat[249]).toEqual({ id: 'id-249' });
  });

  it('remonte l erreur d un lot au lieu de rendre un resultat partiel', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    await expect(
      parLots(ids, (lot) =>
        Promise.resolve(
          lot[0] === 'id-100'
            ? { data: null, error: new Error('boum') }
            : { data: [{ id: lot[0] }], error: null }
        )
      )
    ).rejects.toThrow('boum');
  });

  it('garde une URL courte : un lot tient loin sous le plafond de 16 Ko', () => {
    // Un identifiant UUID et son separateur pesent 37 caracteres.
    expect(TAILLE_LOT * 37).toBeLessThan(8000);
  });
});
