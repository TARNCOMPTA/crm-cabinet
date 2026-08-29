import { describe, it, expect } from 'vitest';
import {
  colonnesDe,
  grouperParFamille,
  resoudreCellule,
  type CelluleSuivi,
  type Famille,
  type SocieteSuivie,
  type TableSuivi,
} from './jedeclareService';

/**
 * Le regroupement des tableaux en onglets.
 * ---------------------------------------------------------------------------
 * Il porte toute la logique d'onglets de l'ecran de suivi, et il est teste ici
 * plutot que dans un test de composant parce qu'il est PUR : meme partage que
 * `tvaStatut.ts` a cote de sa cellule, ou `etat.ts` a cote du pivot serveur.
 *
 * Ce qui compte n'est pas qu'il regroupe — c'est qu'il ne REORDONNE pas, qu'il
 * n'invente pas d'onglet vide, et qu'il ne compte pas deux fois une societe
 * presente dans deux tableaux.
 */

const societe = (p: Partial<SocieteSuivie>): SocieteSuivie => ({
  societe: 'SOCIETE', siren: '', siret: '', dossier: '',
  clientId: null, clientNom: null, rapprochement: 'aucun', monDossier: false,
  echeance: null, cellules: {}, ...p,
});

const table = (cle: string, famille: Famille, societes: SocieteSuivie[] = []): TableSuivi => ({
  famille,
  cle,
  typeDeclaration: cle,
  estTva: famille === 'tva',
  decoupage: famille === 'bilan' ? 'annee' : 'mois',
  libelle: cle,
  societes,
  destinataires: [],
  nbLignes: societes.length,
});

describe('grouperParFamille — les trois onglets du suivi', () => {
  it('rend les trois familles dans l ordre TVA, Bilan, Autres', () => {
    const groupes = grouperParFamille([
      table('IDT|mensuelle', 'tva'),
      table('IDF', 'bilan'),
      table('DSN', 'autres'),
    ]);
    expect(groupes.map((g) => g.famille)).toEqual(['tva', 'bilan', 'autres']);
    expect(groupes.map((g) => g.libelle)).toEqual(['TVA', 'Bilan', 'Autres']);
  });

  /**
   * ⚠️ AUCUN TRI ICI. Le serveur rend `tables` deja trie — famille, rythme,
   * volume, alphabet — et le retrier cote ecran creerait une seconde regle
   * d'ordre qui divergerait de la premiere. Les pastilles doivent donc sortir
   * exactement dans l'ordre recu, meme quand cet ordre n'a rien d'alphabetique.
   */
  it('preserve l ordre du serveur a l interieur d une famille', () => {
    const groupes = grouperParFamille([
      table('IDT|mensuelle', 'tva'),
      table('IDT|trimestrielle', 'tva'),
      table('IDT|annuelle', 'tva'),
      table('RBT', 'tva'),
    ]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]?.tables.map((t) => t.cle)).toEqual([
      'IDT|mensuelle',
      'IDT|trimestrielle',
      'IDT|annuelle',
      'RBT',
    ]);
  });

  /**
   * Un cabinet qui ne depose aucune liasse sur la periode ne doit pas voir un
   * onglet « Bilan » qui n'ouvre rien : c'est la meme regle qu'avant le
   * regroupement, ou un onglet n'existait que si son type existait.
   */
  it('omet les familles vides', () => {
    const groupes = grouperParFamille([table('DSN', 'autres')]);
    expect(groupes.map((g) => g.famille)).toEqual(['autres']);
  });

  it('rend une liste vide quand il n y a aucun tableau', () => {
    expect(grouperParFamille([])).toEqual([]);
  });

  /**
   * ⚠️ LE POINT DE CE COMPTEUR. Une societe apparait dans autant de tableaux
   * qu'elle a de types declares. Additionner les `societes.length` la
   * compterait une fois par tableau, et l'onglet annoncerait plus de dossiers
   * que le cabinet n'en a.
   */
  it('compte une societe presente dans deux tableaux UNE seule fois', () => {
    const alpha = societe({ societe: 'ALPHA', siren: '111111111' });
    const beta = societe({ societe: 'BETA', siren: '222222222' });
    const groupes = grouperParFamille([
      table('IDT|mensuelle', 'tva', [alpha, beta]),
      table('RBT', 'tva', [alpha]),
    ]);
    expect(groupes[0]?.nbSocietes).toBe(2);
  });

  /**
   * La cle est celle du pivot serveur : SIREN, puis dossier, puis nom. Une cle
   * differente d'ici a la dedoublonnerait autrement, donc mal.
   */
  it('retombe sur le dossier puis sur le nom quand le SIREN manque', () => {
    const groupes = grouperParFamille([
      table('IDF', 'bilan', [
        societe({ societe: 'SANS SIREN', dossier: 'D1' }),
        // Meme dossier, nom different : c'est la meme societe pour le pivot.
        societe({ societe: 'SANS SIREN (BIS)', dossier: 'D1' }),
        societe({ societe: 'NI SIREN NI DOSSIER' }),
      ]),
    ]);
    expect(groupes[0]?.nbSocietes).toBe(2);
  });
});

/**
 * Les colonnes de la grille.
 * ---------------------------------------------------------------------------
 * Ce qui compte n'est pas qu'elles regroupent, mais qu'elles ne PERDENT aucun
 * mois de la fenetre et qu'elles restent dans l'ordre : une colonne oubliee,
 * c'est une declaration invisible a l'ecran.
 */
describe('colonnesDe — le pas des colonnes', () => {
  it('laisse une colonne par mois quand le pas est mensuel', () => {
    const c = colonnesDe(['2026-01', '2026-02'], 'mois');
    expect(c.map((x) => x.cle)).toEqual(['2026-01', '2026-02']);
    expect(c[0].mois).toEqual(['2026-01']);
  });

  it('regroupe par trimestre, et nomme « 1er T »', () => {
    const c = colonnesDe(
      ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
      'trimestre'
    );
    expect(c.map((x) => x.cle)).toEqual(['2026-T1', '2026-T2']);
    expect(c.map((x) => x.libelle)).toEqual(['1er T 26', '2e T 26']);
    expect(c[0].mois).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('place chaque mois dans le bon trimestre sur les bornes', () => {
    const c = colonnesDe(['2026-03', '2026-04', '2026-09', '2026-10'], 'trimestre');
    expect(c.map((x) => x.cle)).toEqual(['2026-T1', '2026-T2', '2026-T3', '2026-T4']);
  });

  it('regroupe par annee, une seule colonne par millesime', () => {
    const c = colonnesDe(['2025-11', '2025-12', '2026-01', '2026-07'], 'annee');
    expect(c.map((x) => x.cle)).toEqual(['2025', '2026']);
    expect(c.map((x) => x.libelle)).toEqual(['2025', '2026']);
    expect(c[1].mois).toEqual(['2026-01', '2026-07']);
  });

  /**
   * ⚠️ LE CAS DE BORD QUI COMPTE. La fenetre par defaut part de six mois en
   * arriere : elle coupe donc un trimestre en son milieu. La colonne doit
   * exister avec les seuls mois demandes — inventer les manquants afficherait
   * un trimestre entier la ou l'utilisateur n'a demande qu'une partie.
   */
  it('ne recouvre que les mois presents dans la fenetre', () => {
    const c = colonnesDe(['2026-02', '2026-03'], 'trimestre');
    expect(c).toHaveLength(1);
    expect(c[0].cle).toBe('2026-T1');
    expect(c[0].mois).toEqual(['2026-02', '2026-03']);
  });

  it('traverse les annees sans melanger deux premiers trimestres', () => {
    const c = colonnesDe(['2025-02', '2026-02'], 'trimestre');
    expect(c.map((x) => x.cle)).toEqual(['2025-T1', '2026-T1']);
    expect(c.map((x) => x.libelle)).toEqual(['1er T 25', '1er T 26']);
  });

  it('garde sa colonne a un mois illisible plutot que de le perdre', () => {
    const c = colonnesDe(['2026-01', 'n importe quoi'], 'annee');
    expect(c.map((x) => x.cle)).toEqual(['2026', 'n importe quoi']);
  });

  it('rend une liste vide sur une fenetre vide', () => {
    expect(colonnesDe([], 'trimestre')).toEqual([]);
  });
});

const avecDeclaration = (): CelluleSuivi => ({
  jedeclare: {
    etat: 'vert', anomalie: false, libelle: 'Acceptee', etapes: [],
    montant: null, lien: null, destinataires: [],
  },
  interne: null,
});

const avecStatut = (): CelluleSuivi => ({
  jedeclare: null,
  interne: { statut: 'en_cours', commentaire: '', assigneeId: null, majLe: '' },
});

/**
 * Le mois REEL vise par une colonne groupee.
 * ---------------------------------------------------------------------------
 * C'est le point dur du regroupement : `jedeclare_suivi_interne` est indexee
 * sur `(siren, type_declaration, mois, axe)` avec une contrainte de format sur
 * `mois`. Une colonne « 1er T » n'est pas ecrivable ; elle doit viser un mois,
 * et toujours le meme, sinon un meme statut s'ecrit a deux endroits.
 */
describe('resoudreCellule — ou s ecrit le statut d une colonne groupee', () => {
  const colonne = { cle: '2026-T1', libelle: '1er T 26', mois: ['2026-01', '2026-02', '2026-03'] };

  it('vise le mois qui porte la declaration', () => {
    const s = societe({ cellules: { '2026-03': avecDeclaration() } });
    const r = resoudreCellule(s, colonne);
    expect(r.moisDeclaration).toBe('2026-03');
    expect(r.moisStatut).toBe('2026-03');
    expect(r.cellule.jedeclare).not.toBeNull();
    expect(r.nbDeclarations).toBe(1);
  });

  it('vise la declaration meme si elle n est pas au dernier mois', () => {
    const s = societe({ cellules: { '2026-01': avecDeclaration() } });
    expect(resoudreCellule(s, colonne).moisDeclaration).toBe('2026-01');
  });

  /**
   * ⚠️ LA RETROCOMPATIBILITE. Rien n'est migre en base : un statut pose du
   * temps de la grille mensuelle doit rester lu ET reecrit au meme endroit.
   * Sans ce repli, il deviendrait invisible, puis serait reecrit ailleurs — et
   * la periode en porterait deux.
   */
  it('retombe sur un statut deja pose quand aucune declaration n existe', () => {
    const s = societe({ cellules: { '2026-02': avecStatut() } });
    const r = resoudreCellule(s, colonne);
    expect(r.moisStatut).toBe('2026-02');
    expect(r.cellule.interne?.statut).toBe('en_cours');
    expect(r.nbDeclarations).toBe(0);
  });

  /**
   * ⚠️ LE CAS QUI A FAIT REECRIRE CETTE FONCTION. Sur le bilan, un « a faire »
   * pose en mars voisine avec une liasse deposee en mai, dans la meme annee.
   * Ne resoudre qu'un seul mois faisait disparaitre l'un des deux de l'ecran.
   * Les deux doivent etre montres, et le statut reecrit LA OU IL EST DEJA.
   */
  it('montre la declaration ET le statut quand ils sont a deux mois differents', () => {
    const s = societe({
      cellules: { '2026-01': avecStatut(), '2026-03': avecDeclaration() },
    });
    const r = resoudreCellule(s, colonne);
    expect(r.moisDeclaration).toBe('2026-03');
    expect(r.moisStatut).toBe('2026-01');
    expect(r.cellule.jedeclare).not.toBeNull();
    expect(r.cellule.interne?.statut).toBe('en_cours');
  });

  it('vise le dernier mois de la colonne quand la cellule est vierge', () => {
    const r = resoudreCellule(societe({}), colonne);
    expect(r.moisStatut).toBe('2026-03');
    expect(r.moisDeclaration).toBe('2026-03');
    expect(r.cellule).toEqual({ jedeclare: null, interne: null });
    expect(r.nbDeclarations).toBe(0);
  });

  /**
   * Une colonne annuelle peut cumuler deux depots — une liasse et sa
   * rectificative. On n'en montre qu'un ; `nbDeclarations` est ce qui permet a
   * l'ecran de le dire, plutot que de laisser croire qu'il n'y en a eu qu'un.
   */
  it('compte les declarations cumulees dans une meme colonne', () => {
    const s = societe({
      cellules: { '2026-01': avecDeclaration(), '2026-03': avecDeclaration() },
    });
    const r = resoudreCellule(s, colonne);
    expect(r.nbDeclarations).toBe(2);
    expect(r.moisDeclaration).toBe('2026-03');
  });

  it('vise le mois lui-meme sur une colonne mensuelle', () => {
    const s = societe({ cellules: { '2026-05': avecDeclaration() } });
    const col = { cle: '2026-05', libelle: 'mai 26', mois: ['2026-05'] };
    const r = resoudreCellule(s, col);
    expect(r.moisStatut).toBe('2026-05');
    expect(r.moisDeclaration).toBe('2026-05');
  });
});

/**
 * L'invariant qui evite qu'un statut se dedouble.
 * ---------------------------------------------------------------------------
 * `resoudreCellule` designe le mois ou l'ecran ECRIT. Si, une fois ce statut
 * ecrit, elle designait un AUTRE mois, le clic suivant ecrirait ailleurs : la
 * meme periode porterait deux statuts en base, et l'ecran en montrerait un au
 * hasard de l'ordre des mois. La resolution doit donc etre un POINT FIXE.
 *
 * C'est verifie ici sur les quatre configurations possibles, en simulant
 * l'ecriture exactement comme le fait l'ecriture optimiste de `SuiviEcheances`.
 */
describe('resoudreCellule — le mois vise est stable apres ecriture', () => {
  const colonne = { cle: '2026-T1', libelle: '1er T 26', mois: ['2026-01', '2026-02', '2026-03'] };

  const cas: [string, SocieteSuivie][] = [
    ['cellule vierge', societe({})],
    ['une declaration seule', societe({ cellules: { '2026-01': avecDeclaration() } })],
    ['un statut seul', societe({ cellules: { '2026-02': avecStatut() } })],
    [
      'declaration et statut a deux mois differents',
      societe({ cellules: { '2026-01': avecStatut(), '2026-03': avecDeclaration() } }),
    ],
  ];

  it.each(cas)('reste sur le meme mois — %s', (_nom, depart) => {
    const premier = resoudreCellule(depart, colonne);

    // L'ecriture optimiste, telle quelle : le statut atterrit sur `moisStatut`.
    const apres: SocieteSuivie = {
      ...depart,
      cellules: {
        ...depart.cellules,
        [premier.moisStatut]: {
          ...depart.cellules[premier.moisStatut],
          jedeclare: depart.cellules[premier.moisStatut]?.jedeclare ?? null,
          interne: { statut: 'valide', commentaire: '', assigneeId: null, majLe: '' },
        },
      },
    };

    const second = resoudreCellule(apres, colonne);
    expect(second.moisStatut).toBe(premier.moisStatut);
    expect(second.moisDeclaration).toBe(premier.moisDeclaration);
    expect(second.cellule.interne?.statut).toBe('valide');
  });
});
