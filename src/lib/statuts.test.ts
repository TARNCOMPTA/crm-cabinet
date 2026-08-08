import { describe, it, expect } from 'vitest';
import { estStatuts, resumerStatuts, type ActeDepose } from './statuts';

/**
 * Reconnaître les statuts parmi les pièces du greffe.
 * ---------------------------------------------------------------------------
 * Ce que ces tests protègent tient en une phrase : `act_category` ne dit pas ce
 * qu'on croit. `categoriser()`, côté serveur, teste `constitutif` avant
 * `statuts`, si bien que « Statuts constitutifs » sort en `creation` tandis que
 * `modification_statuts` ramasse aussi les augmentations de capital et les
 * traités de fusion — qui ne sont pas des statuts.
 *
 * Les libellés employés ici ne sont pas inventés : ce sont ceux du catalogue
 * `server/src/inpi/libelles.ts`, tel que l'INPI les rend.
 */

function acte(p: Partial<ActeDepose> & { id: string; act_type: string }): ActeDepose {
  return { act_date: '2020-01-01', ...p };
}

describe('estStatuts', () => {
  it('reconnait les trois pieces qui sont des statuts', () => {
    for (const libelle of ['Statuts', 'Statuts constitutifs', 'Statuts mis a jour']) {
      expect(estStatuts(libelle), libelle).toBe(true);
    }
  });

  /** L'INPI accentue parfois, jamais de facon previsible. */
  it('ignore la casse et les accents', () => {
    expect(estStatuts('STATUTS MIS À JOUR')).toBe(true);
    expect(estStatuts('statuts')).toBe(true);
  });

  /**
   * ⭐ LE PIEGE. Ces quatre libelles portent TOUS `act_category` =
   * `modification_statuts`. Un filtre sur la categorie les ferait passer pour
   * des statuts, et la fiche annoncerait « 4 modifications des statuts » a un
   * client qui n'en a jamais modifie un seul.
   */
  it('ecarte ce que la categorie « modification_statuts » ramasse a tort', () => {
    for (const libelle of [
      'Augmentation de capital',
      'Reduction de capital',
      'Traite de fusion',
      'Transmission universelle de patrimoine',
    ]) {
      expect(estStatuts(libelle), libelle).toBe(false);
    }
  });

  /**
   * ⭐ LE SECOND PIEGE, plus discret que la categorie. `resolveLibelle` (serveur)
   * compose « Type - description » des que la piece porte une decision : un PV
   * qui DECIDE une modification des statuts porte donc le mot dans son libelle.
   * Le compter ferait annoncer « 3 mises a jour » a une societe qui n'en a fait
   * qu'une, et pourrait presenter un proces-verbal comme la derniere version des
   * statuts.
   */
  it('ecarte un libelle dont seule la description parle de statuts', () => {
    expect(estStatuts("PV d'assemblee generale extraordinaire - Modification des statuts")).toBe(false);
    expect(estStatuts("Decision de l'associe unique - Refonte des statuts")).toBe(false);
    // Mais le libelle compose dont le TYPE est des statuts reste reconnu.
    expect(estStatuts('Statuts mis a jour - Transfert du siege social')).toBe(true);
  });

  it('ecarte les autres pieces du registre', () => {
    for (const libelle of [
      "PV d'assemblee generale extraordinaire",
      'Acte sous seing prive',
      'Comptes annuels',
      'Extrait RCS',
      '',
    ]) {
      expect(estStatuts(libelle), libelle).toBe(false);
    }
    expect(estStatuts(null)).toBe(false);
    expect(estStatuts(undefined)).toBe(false);
  });
});

describe('resumerStatuts', () => {
  it('rend null quand il n y a aucune piece', () => {
    expect(resumerStatuts([])).toBeNull();
  });

  /**
   * Un client peut avoir des pieces au registre SANS avoir de statuts : une
   * entreprise individuelle depose des comptes, pas des statuts. La section doit
   * disparaitre dans ce cas, pas afficher un encart vide.
   */
  it('rend null quand aucune piece n est un statut', () => {
    const actes = [
      acte({ id: '1', act_type: "PV d'assemblee generale ordinaire" }),
      acte({ id: '2', act_type: 'Comptes annuels' }),
      acte({ id: '3', act_type: 'Augmentation de capital', act_category: 'modification_statuts' }),
    ];
    expect(resumerStatuts(actes)).toBeNull();
  });

  it('resume une societe qui n a jamais modifie ses statuts', () => {
    const r = resumerStatuts([
      acte({ id: '1', act_type: 'Statuts constitutifs', act_category: 'creation', deposit_date: '2019-03-12' }),
      acte({ id: '2', act_type: 'Comptes annuels', act_date: '2023-06-30' }),
    ]);
    expect(r).not.toBeNull();
    expect(r!.constitutifs.id).toBe('1');
    // Rien n'a bouge : la derniere version EST le depot d'origine.
    expect(r!.derniereVersion.id).toBe('1');
    expect(r!.nbModifications).toBe(0);
    expect(r!.depots).toHaveLength(1);
  });

  it('compte les mises a jour et retient la plus recente', () => {
    const r = resumerStatuts([
      acte({ id: '1', act_type: 'Statuts constitutifs', act_category: 'creation', deposit_date: '2015-01-20' }),
      acte({ id: '2', act_type: 'Statuts mis a jour', act_category: 'modification_statuts', deposit_date: '2021-09-02' }),
      acte({ id: '3', act_type: 'Statuts mis a jour', act_category: 'modification_statuts', deposit_date: '2018-04-15' }),
      // Presente pour verifier qu'elle ne gonfle pas le compte.
      acte({ id: '4', act_type: 'Augmentation de capital', act_category: 'modification_statuts', deposit_date: '2022-11-30' }),
    ]);
    expect(r!.constitutifs.id).toBe('1');
    expect(r!.derniereVersion.id).toBe('2');
    expect(r!.nbModifications).toBe(2);
    expect(r!.depots.map((d) => d.id)).toEqual(['2', '3', '1']);
  });

  /** L'acte est signe, puis depose des semaines plus tard : c'est le depot qui fait foi. */
  it('date par le depot, et retombe sur la date d acte quand il manque', () => {
    const r = resumerStatuts([
      acte({ id: '1', act_type: 'Statuts', act_date: '2020-01-05', deposit_date: '2020-02-28' }),
      acte({ id: '2', act_type: 'Statuts mis a jour', act_date: '2020-03-10', deposit_date: null }),
    ]);
    expect(r!.depots.map((d) => d.date)).toEqual(['2020-03-10', '2020-02-28']);
    expect(r!.derniereVersion.id).toBe('2');
  });

  /**
   * L'INPI ne classe pas toujours la piece d'origine en `creation`. Sans repli,
   * la fiche n'aurait pas de statuts constitutifs a montrer alors qu'ils sont la.
   */
  it('prend le plus ancien depot pour constitutifs quand aucun n est classe creation', () => {
    const r = resumerStatuts([
      acte({ id: '1', act_type: 'Statuts mis a jour', deposit_date: '2022-05-04' }),
      acte({ id: '2', act_type: 'Statuts', deposit_date: '2016-07-19' }),
    ]);
    expect(r!.constitutifs.id).toBe('2');
    expect(r!.derniereVersion.id).toBe('1');
    expect(r!.nbModifications).toBe(1);
  });

  /**
   * `inpi_reference` est UNIQUE mais NULLABLE, et deux NULL ne sont jamais en
   * conflit dans un index PostgreSQL : l'upsert `onConflict: 'inpi_reference'`
   * ne dedoublonne donc pas les pieces sans reference. La page Juridique offre
   * la resynchronisation, client par client et en masse — sans ce filtre, le
   * compte de mises a jour grimperait a chaque passage.
   */
  it('ne compte qu une fois un depot reinsere par une resynchronisation', () => {
    const r = resumerStatuts([
      acte({ id: '1', act_type: 'Statuts', deposit_date: '2015-01-01' }),
      acte({ id: '2', act_type: 'Statuts', deposit_date: '2015-01-01' }),
      acte({ id: '3', act_type: 'Statuts mis a jour', inpi_reference: 'REF-9', deposit_date: '2020-01-01' }),
      acte({ id: '4', act_type: 'Statuts mis a jour', inpi_reference: 'REF-9', deposit_date: '2020-01-01' }),
    ]);
    expect(r!.depots).toHaveLength(2);
    expect(r!.nbModifications).toBe(1);
  });

  /** Des statuts constitutifs redeposes ne doivent pas rajeunir la creation. */
  it('prend le plus ancien depot classe creation', () => {
    const r = resumerStatuts([
      acte({ id: 'origine', act_type: 'Statuts constitutifs', act_category: 'creation', deposit_date: '2011-02-03' }),
      acte({ id: 'redepot', act_type: 'Statuts constitutifs', act_category: 'creation', deposit_date: '2023-08-01' }),
    ]);
    expect(r!.constitutifs.id).toBe('origine');
  });

  /** Deux depots le meme jour : l'ordre ne doit pas dependre de celui de la base. */
  it('departage les dates identiques de facon stable', () => {
    const memeJour = [
      acte({ id: 'b', act_type: 'Statuts mis a jour', deposit_date: '2021-01-01' }),
      acte({ id: 'a', act_type: 'Statuts', deposit_date: '2021-01-01' }),
    ];
    const ordre = resumerStatuts(memeJour)!.depots.map((d) => d.id);
    expect(resumerStatuts([...memeJour].reverse())!.depots.map((d) => d.id)).toEqual(ordre);
  });
});
