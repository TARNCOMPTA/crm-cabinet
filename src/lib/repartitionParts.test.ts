import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  etatRepartition,
  motTitre,
  pourcentage,
  valeurNominale,
} from './repartitionParts';

/**
 * Ce qu'une répartition permet d'affirmer.
 * ---------------------------------------------------------------------------
 * Ces cas ne protègent pas une division : ils protègent un CHIFFRE QUI IRA DANS
 * UNE ATTESTATION SIGNÉE. Un `null` s'y voit et se corrige ; un pourcentage
 * plausible mais faux, non — personne ne va vérifier un « 40 % » qui a l'air
 * normal.
 *
 * Le défaut que la moitié de ces cas existe pour empêcher tient en une phrase :
 * calculer les pourcentages sur la SOMME des parts saisies plutôt que sur le
 * total déclaré les fait toujours tomber juste, y compris quand trois associés
 * sur cinq manquent.
 */

/** Des lignes en pleine propriete, le cas ordinaire. */
const l = (...parts: number[]) =>
  parts.map((nb_parts) => ({ nb_parts, demembrement: 'pleine-propriete' }));

/** Une ligne dans un demembrement donne. */
const d = (nb_parts: number, demembrement: string) => ({ nb_parts, demembrement });

describe('etatRepartition', () => {
  /** « Pas saisie » n'est pas « pas d'associés » : toute société en a. */
  it('distingue l’absence de saisie du reste', () => {
    expect(etatRepartition([], 1000)).toEqual({ etat: 'non-saisie' });
    // Et l'absence de saisie l'emporte, même sans total connu : il n'y a rien
    // à dire d'une liste vide.
    expect(etatRepartition([], null)).toEqual({ etat: 'non-saisie' });
  });

  it('reconnaît une répartition complète', () => {
    expect(etatRepartition(l(250, 750), 1000)).toEqual({
      etat: 'complete',
      somme: 1000,
      total: 1000,
    });
  });

  /**
   * ⭐ LE CAS QUI JUSTIFIE LE TOTAL DÉCLARÉ. Deux associés saisis sur cinq : la
   * somme fait 400, le total 1 000. Sans `parts_totales`, on aurait divisé par
   * 400 et affiché 60 % / 40 % — deux chiffres faux, et rien pour le dire.
   */
  it('voit qu’il manque des associés', () => {
    expect(etatRepartition(l(240, 160), 1000)).toEqual({
      etat: 'incomplete',
      somme: 400,
      total: 1000,
      manquant: 600,
    });
  });

  it('voit une somme qui dépasse le total déclaré', () => {
    expect(etatRepartition(l(600, 600), 1000)).toEqual({
      etat: 'incoherente',
      somme: 1200,
      total: 1000,
      excedent: 200,
    });
  });

  /** Des lignes sans total : on ne sait pas, et on le dit. Pas « incomplète ». */
  it('rend « total inconnu » quand la fiche ne porte pas le nombre de parts', () => {
    expect(etatRepartition(l(250, 750), null)).toEqual({ etat: 'total-inconnu', somme: 1000 });
    expect(etatRepartition(l(250), undefined)).toEqual({ etat: 'total-inconnu', somme: 250 });
  });

  /**
   * Un total à zéro ne vaut pas mieux qu'un total absent : il ferait diviser
   * par zéro, et ne peut venir que d'une saisie erronée.
   */
  it('traite un total nul comme un total inconnu', () => {
    expect(etatRepartition(l(250), 0)).toEqual({ etat: 'total-inconnu', somme: 250 });
  });

  /**
   * ⭐ LE PIÈGE DE L'ARRONDI. Trois associés à un tiers chacun : en
   * pourcentages arrondis, 33,33 × 3 = 99,99 et la répartition passerait pour
   * incomplète. Ce sont les PARTS qui se somment, et 333⅓ × 3 fait bien 1 000.
   */
  it('ne se trompe pas sur trois tiers', () => {
    const tiers = 1000 / 3;
    expect(etatRepartition(l(tiers, tiers, tiers), 1000).etat).toBe('complete');
    // Et la démonstration par l'absurde : les pourcentages, eux, ne tombent pas
    // ronds. C'est précisément pourquoi on ne s'en sert pas pour décider.
    const p = pourcentage(tiers, 1000)!;
    expect(Number(p.toFixed(2)) * 3).toBeCloseTo(99.99, 5);
  });

  /** Le flottant ne doit pas faire mentir une répartition en parts décimales. */
  it('tolère l’erreur d’arrondi du flottant', () => {
    expect(etatRepartition(l(0.1, 0.2), 0.3).etat).toBe('complete');
  });

  /**
   * La nue-propriété compose le capital au même titre que la pleine propriété :
   * 250 en nue-propriété et 750 en pleine propriété font bien les 1 000 parts.
   */
  it('somme la nue-propriété avec la pleine propriété', () => {
    expect(
      etatRepartition([d(750, 'pleine-propriete'), d(250, 'nue-propriete')], 1000).etat
    ).toBe('complete');
  });

  /**
   * ⭐ L'USUFRUIT NE SE SOMME PAS, et c'est le cas de toute SCI familiale apres
   * donation : le pere donne la nue-propriete de 250 parts a son fils et garde
   * l'usufruit. Les additionner donnerait 250 + 250 = 500 pour 250 parts
   * REELLES, et une repartition parfaitement reguliere s'annoncerait
   * « incoherente ». Le bandeau perdrait son credit exactement la ou il compte.
   */
  it('ne compte pas l’usufruit dans le capital', () => {
    const repartition = [
      d(750, 'pleine-propriete'), // la mere
      d(250, 'nue-propriete'), // le fils
      d(250, 'usufruit'), // le pere, sur LES MEMES 250 parts
    ];
    expect(etatRepartition(repartition, 1000)).toEqual({
      etat: 'complete',
      somme: 1000,
      total: 1000,
    });
  });

  /**
   * Le corollaire : une repartition qui ne connaitrait QUE des usufruits ne dit
   * rien de la propriete du capital. Elle est incomplete, et pas complete a
   * zero — la nuance decide de ce que l'ecran affiche.
   */
  it('voit qu’une repartition faite d’usufruits seuls ne couvre rien', () => {
    expect(etatRepartition([d(1000, 'usufruit')], 1000)).toEqual({
      etat: 'incomplete',
      somme: 0,
      total: 1000,
      manquant: 1000,
    });
  });

  it('gère une seule ligne qui porte tout le capital', () => {
    expect(etatRepartition(l(1000), 1000)).toEqual({ etat: 'complete', somme: 1000, total: 1000 });
  });
});

describe('pourcentage', () => {
  it('divise par le total déclaré', () => {
    expect(pourcentage(250, 1000)).toBe(25);
  });

  /**
   * ⭐ `null`, ET SURTOUT PAS `0`. Un associé dont la part n'est pas calculable
   * n'en détient pas zéro. Affiché, un « 0 % » se lirait comme un fait établi.
   */
  it('rend null plutôt que zéro quand le total manque', () => {
    expect(pourcentage(250, null)).toBeNull();
    expect(pourcentage(250, undefined)).toBeNull();
    expect(pourcentage(250, 0)).toBeNull();
  });

  it('n’arrondit pas : l’affichage décide du format', () => {
    expect(pourcentage(1, 3)).toBeCloseTo(33.3333333, 6);
  });
});

describe('valeurNominale', () => {
  it('divise le capital par le nombre de parts', () => {
    expect(valeurNominale(10000, 1000)).toBe(10);
  });

  it('rend null dès qu’un des deux termes manque', () => {
    expect(valeurNominale(null, 1000)).toBeNull();
    expect(valeurNominale(10000, null)).toBeNull();
    expect(valeurNominale(10000, 0)).toBeNull();
  });

  /** Une valeur nominale non ronde est parfaitement légale : 7 622,45 / 500. */
  it('n’exige pas un résultat rond', () => {
    expect(valeurNominale(7622.45, 500)).toBeCloseTo(15.2449, 4);
  });
});

/**
 * Le vocabulaire, elision comprise.
 * ---------------------------------------------------------------------------
 * ⚠️ « NOMBRE TOTAL DE ACTIONS » S'EST LU EN TETE DE FICHE, en gras, au-dessus
 * du capital d'une SAS. L'ecran accordait bien son vocabulaire a la forme
 * juridique, mais recomposait « de » + pluriel sur quatre libelles distincts,
 * sans elider devant la voyelle.
 *
 * Le piege de la correction etait l'exces inverse — « d'parts » — d'ou les deux
 * sens verifies ici plutot qu'un seul.
 */
describe('motTitre', () => {
  it('dit « actions » pour les societes par actions', () => {
    for (const forme of ['SAS', 'SASU', 'SA', 'Societe anonyme', 'Societe par actions simplifiee']) {
      expect(motTitre(forme).pluriel, forme).toBe('actions');
    }
  });

  it('dit « parts » pour les autres, et pour une forme absente', () => {
    for (const forme of ['SARL', 'EURL', 'SCI', 'SNC', 'SELARL', '', null]) {
      expect(motTitre(forme).pluriel, String(forme)).toBe('parts');
    }
  });

  /** L'invariant, plutot que deux litteraux recopies : elide devant voyelle. */
  it('elide devant une voyelle, et seulement devant une voyelle', () => {
    for (const forme of ['SAS', 'SARL', 'SCI', null]) {
      const m = motTitre(forme);
      const voyelle = /^[aeiouy]/i.test(m.pluriel);
      expect(m.de, String(forme)).toBe(voyelle ? `d'${m.pluriel}` : `de ${m.pluriel}`);
    }
  });

  /**
   * ⚠️ LA GARDE QUI COMPTE VRAIMENT. Les trois cas ci-dessus verifient la
   * DONNEE ; le defaut, lui, etait dans les APPELANTS, qui ecrivaient
   * « de ${mots.pluriel} » au lieu d'employer la forme elidee. Rien ne les en
   * empeche — sinon ceci.
   */
  it("n'est recompose nulle part dans l'ecran", () => {
    // Chemin relatif a la racine et non `import.meta.url` : la suite tourne en
    // jsdom, ou `import.meta.url` n'est pas une URL `file:` et `readFileSync`
    // la refuse. Vitest, lui, s'execute depuis la racine du depot.
    const src = readFileSync('src/components/clients/ClientPartsTab.tsx', 'utf8');
    const fautifs = src
      .split('\n')
      .map((ligne, i) => ({ n: i + 1, ligne }))
      .filter(({ ligne }) => /\bde \$?\{mots\.pluriel\}/.test(ligne));
    expect(fautifs.map((f) => `l.${f.n} ${f.ligne.trim()}`)).toEqual([]);
  });
});
