import { describe, it, expect } from 'vitest';
import {
  analyserLignes,
  dateEffet,
  nombreDeParts,
  COLONNES_MODELE,
} from './repartitionImport';

/**
 * Ce qu'un fichier de répartition permet d'écrire.
 * ---------------------------------------------------------------------------
 * Ces cas ne protègent pas une lecture de tableur : ils protègent les CHIFFRES
 * QUI VONT ENTRER DANS UN DOSSIER CLIENT. Une ligne refusée s'affiche et se
 * corrige ; une ligne mal lue mais plausible s'enregistre et ne se revoit
 * jamais.
 *
 * Deux pièges dominent, et ils sont français tous les deux : « 1 000 » écrit
 * avec une espace, et « 12/03/2019 » écrit à l'envers de l'ISO.
 */

const ENTETE = [...COLONNES_MODELE];
const t = (...lignes: unknown[][]) => analyserLignes([ENTETE, ...lignes]);

describe('nombreDeParts', () => {
  it('lit un nombre tel quel', () => {
    expect(nombreDeParts(750)).toBe(750);
  });

  /**
   * ⭐ LE PIÈGE LE PLUS COÛTEUX. Un tableur français écrit les milliers avec une
   * espace, insécable une fois sur deux. Lire « 1 000 » comme 1 ne se verrait
   * pas : le chiffre reste plausible, et 1 part sur 1 000 s'atteste aussi bien
   * que 1 000.
   */
  it('lit les milliers separes par une espace, insecable comprise', () => {
    expect(nombreDeParts('1 000')).toBe(1000);
    expect(nombreDeParts('1 000')).toBe(1000);
    expect(nombreDeParts('1 500')).toBe(1500);
  });

  it('prend la virgule pour une decimale', () => {
    expect(nombreDeParts('1,5')).toBe(1.5);
  });

  it('rend null sur une cellule vide ou illisible', () => {
    expect(nombreDeParts('')).toBeNull();
    expect(nombreDeParts(null)).toBeNull();
    expect(nombreDeParts('beaucoup')).toBeNull();
  });
});

describe('dateEffet', () => {
  it('lit le format francais', () => {
    expect(dateEffet('12/03/2019')).toBe('2019-03-12');
    expect(dateEffet('1/3/2019')).toBe('2019-03-01');
  });

  it('lit aussi l’ISO', () => {
    expect(dateEffet('2019-03-12')).toBe('2019-03-12');
  });

  /**
   * ⭐ LA DATE DU TABLEUR SE LIT EN COMPOSANTES LOCALES. `toISOString` la
   * ramènerait en UTC et reculerait d'un jour tout ce qui est à l'est de
   * Greenwich — exactement le défaut trouvé sur la colonne « Mois de cloture »
   * de la liste clients, où une clôture au 1er juin s'affichait en mai.
   */
  it('lit un objet Date sans reculer d’un jour', () => {
    // Minuit LOCAL le 12 mars : c'est ce que produit une cellule au format date.
    expect(dateEffet(new Date(2019, 2, 12))).toBe('2019-03-12');
    // Et le cas qui piège : le 1er du mois, à une heure qui bascule en UTC.
    expect(dateEffet(new Date(2019, 5, 1))).toBe('2019-06-01');
  });

  it('rend null plutot que de deviner', () => {
    expect(dateEffet('mars 2019')).toBeNull();
    expect(dateEffet('12-03-19')).toBeNull();
  });
});

describe('analyserLignes', () => {
  it('lit une repartition ordinaire', () => {
    const r = t(
      ['Jean', 'DUPONT', '', '750', 'Pleine propriete', '12/05/2004', 'Statuts'],
      ['Marie', 'LEROY', '', '250', 'Nue-propriete', '', '']
    );
    expect(r.valides).toBe(2);
    expect(r.erreurs).toBe(0);
    expect(r.sommeParts).toBe(1000);
    expect(r.lignes[0]).toMatchObject({
      ligne: 2,
      prenom: 'Jean',
      nom: 'DUPONT',
      nbParts: 750,
      demembrement: 'pleine-propriete',
      dateEffet: '2004-05-12',
      acteSource: 'Statuts',
      etat: 'valide',
    });
  });

  it('reconnait les libelles de detention, accents et abreges compris', () => {
    const r = t(
      ['', 'A', '', '1', 'Nue-propriété', '', ''],
      ['', 'B', '', '1', 'USUFRUIT', '', ''],
      ['', 'C', '', '1', 'NP', '', ''],
      ['', 'D', '', '1', '', '', '']
    );
    expect(r.lignes.map((l) => l.demembrement)).toEqual([
      'nue-propriete',
      'usufruit',
      'nue-propriete',
      // Colonne vide : la pleine propriete est le cas ordinaire.
      'pleine-propriete',
    ]);
  });

  /** L'usufruit ne compose pas le capital : il ne se somme pas. */
  it('ne compte pas l’usufruit dans la somme', () => {
    const r = t(
      ['', 'MERE', '', '750', 'Pleine propriete', '', ''],
      ['', 'FILS', '', '250', 'Nue-propriete', '', ''],
      ['', 'PERE', '', '250', 'Usufruit', '', '']
    );
    expect(r.valides).toBe(3);
    expect(r.sommeParts).toBe(1000);
  });

  it('marque une personne morale', () => {
    const r = t(['', 'HOLDING DU PONT', 'oui', '100', '', '', '']);
    expect(r.lignes[0]).toMatchObject({
      personneMorale: true,
      denomination: 'HOLDING DU PONT',
      prenom: '',
    });
  });

  it('ignore les lignes vides que laissent les tableurs', () => {
    const r = t(['', 'A', '', '1', '', '', ''], ['', '', '', '', '', '', ''], []);
    expect(r.total).toBe(1);
  });

  describe('ce qu’il refuse, et ne repare jamais', () => {
    it('refuse une ligne sans nom', () => {
      const r = t(['Jean', '', '', '100', '', '', '']);
      expect(r.lignes[0]!.etat).toBe('erreur');
      expect(r.lignes[0]!.erreur).toMatch(/nom/i);
    });

    it('refuse un nombre de parts absent ou illisible', () => {
      const r = t(['', 'A', '', '', '', '', ''], ['', 'B', '', 'beaucoup', '', '', '']);
      expect(r.erreurs).toBe(2);
      expect(r.valides).toBe(0);
    });

    it('refuse zero et les nombres negatifs', () => {
      const r = t(['', 'A', '', '0', '', '', ''], ['', 'B', '', '-5', '', '', '']);
      expect(r.erreurs).toBe(2);
    });

    it('refuse une detention inventee, en la citant', () => {
      const r = t(['', 'A', '', '10', 'usufruit partiel', '', '']);
      expect(r.lignes[0]!.etat).toBe('erreur');
      expect(r.lignes[0]!.erreur).toContain('usufruit partiel');
    });

    /** Une date illisible est refusee ; une date ABSENTE est admise. */
    it('refuse une date illisible mais accepte une date absente', () => {
      const r = t(['', 'A', '', '10', '', 'mars 2019', ''], ['', 'B', '', '10', '', '', '']);
      expect(r.lignes[0]!.etat).toBe('erreur');
      expect(r.lignes[1]!.etat).toBe('valide');
      expect(r.lignes[1]!.dateEffet).toBeNull();
    });

    /**
     * ⭐ LE DOUBLON INTERNE AU FICHIER. `client_associes` porte
     * `UNIQUE (client_id, officer_id, demembrement)` : deux lignes pour la meme
     * personne dans la meme detention ne feraient pas un doublon, elles
     * feraient echouer l'insertion ENTIERE en 23505 — emportant les associes
     * qui n'y etaient pour rien. Le refus est donc porte ici, avant d'ecrire.
     */
    it('refuse un doublon du fichier, en citant la premiere ligne', () => {
      const r = t(
        ['Jean', 'DUPONT', '', '500', 'Pleine propriete', '', ''],
        ['Jean', 'DUPONT', '', '250', 'Pleine propriete', '', '']
      );
      expect(r.valides).toBe(1);
      expect(r.lignes[1]!.etat).toBe('erreur');
      expect(r.lignes[1]!.erreur).toContain('ligne 2');
    });

    /** La meme personne dans DEUX detentions differentes reste legitime. */
    it('n’y voit pas un doublon quand la detention differe', () => {
      const r = t(
        ['Jean', 'DUPONT', '', '500', 'Pleine propriete', '', ''],
        ['Jean', 'DUPONT', '', '250', 'Nue-propriete', '', '']
      );
      expect(r.valides).toBe(2);
      expect(r.erreurs).toBe(0);
    });

    /** La casse et les accents ne doivent pas faire passer un doublon. */
    it('rapproche les doublons malgre la casse et les accents', () => {
      const r = t(
        ['Jean', 'MULLER', '', '500', '', '', ''],
        ['jean', 'müller', '', '250', '', '', '']
      );
      expect(r.erreurs).toBe(1);
    });
  });

  it('numerote les lignes comme le tableur, en-tete comprise', () => {
    const r = t(['', 'A', '', '1', '', '', ''], ['', 'B', '', '1', '', '', '']);
    expect(r.lignes.map((l) => l.ligne)).toEqual([2, 3]);
  });
});
