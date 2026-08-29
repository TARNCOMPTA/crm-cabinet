import { describe, it, expect } from 'vitest';
import {
  construireRequeteListe,
  echapperLike,
  estChampTri,
  type FiltresListe,
} from './requeteListe.js';

/**
 * Le portage du filtrage de la liste clients vers SQL.
 * ---------------------------------------------------------------------------
 * ⚠️ CE QUI EST TESTE ICI N'EST PAS « EST-CE QUE SQL MARCHE » MAIS « EST-CE QUE
 * SQL DIT LA MEME CHOSE QUE L'ECRAN ». Les regles viennent de
 * `useClientFilters.ts`, ou elles etaient ecrites en JavaScript ; les porter,
 * c'est risquer de les trahir sur des details que personne ne remarque avant
 * qu'un dossier ne disparaisse d'une liste.
 */

const base: FiltresListe = {
  recherche: '', statut: 'all', regime: 'all', cloture: 'all',
  collaborateurs: [], archives: false, mesDossiers: false, utilisateurId: null,
  tri: 'nom_entreprise', sens: 'asc', limite: 50, decalage: 0,
};
const q = (p: Partial<FiltresListe>, collation: string | null = 'und-x-icu') =>
  construireRequeteListe({ ...base, ...p }, collation);

describe('echapperLike', () => {
  /**
   * ⚠️ SANS ECHAPPEMENT, TAPER « % » REMONTE TOUT LE PORTEFEUILLE. Cote ecran
   * la recherche est un `includes` : ces caracteres y sont litteraux.
   */
  it('neutralise les jokers de LIKE', () => {
    expect(echapperLike('100%')).toBe('100\\%');
    expect(echapperLike('a_b')).toBe('a\\_b');
    expect(echapperLike('c:\\x')).toBe('c:\\\\x');
  });

  it('laisse un terme ordinaire intact', () => {
    expect(echapperLike('SARL Dupont')).toBe('SARL Dupont');
  });
});

describe('estChampTri', () => {
  it('accepte les colonnes de l ecran et rejette le reste', () => {
    expect(estChampTri('nom_entreprise')).toBe(true);
    expect(estChampTri('collaborators')).toBe(true);
    // Le garde-fou qui empeche d'interpoler n'importe quoi dans l'ORDER BY.
    expect(estChampTri('resume_ia')).toBe(false);
    expect(estChampTri('id; DROP TABLE clients')).toBe(false);
    expect(estChampTri(undefined)).toBe(false);
  });
});

describe('construireRequeteListe — les filtres', () => {
  it('sans filtre, n ecarte que les archives', () => {
    const r = q({});
    expect(r.where).toBe(`WHERE c.statut IS DISTINCT FROM 'archive'`);
    expect(r.valeurs).toEqual([]);
  });

  /**
   * Un statut nul doit rester visible : l'ecran teste `statut !== 'archive'`,
   * ce qu'un `<> 'archive'` en SQL ne reproduit PAS (nul ne compare a rien).
   */
  it('ecarte les archives sans faire disparaitre les statuts nuls', () => {
    expect(q({}).where).toContain('IS DISTINCT FROM');
    expect(q({}).where).not.toContain(`c.statut <> 'archive'`);
  });

  it('n ecarte plus rien quand les archives sont demandees', () => {
    expect(q({ archives: true }).where).toBe('');
  });

  it('balaie les six colonnes de la recherche avec UN seul parametre', () => {
    const r = q({ recherche: 'dupont' });
    for (const col of ['nom_entreprise','siret','numero_dossier','contact_principal','dirigeant','ville']) {
      expect(r.where, col).toContain(`c.${col} ILIKE $1`);
    }
    expect(r.valeurs[0]).toBe('%dupont%');
  });

  it('ignore une recherche faite d espaces', () => {
    expect(q({ recherche: '   ' }).valeurs).toEqual([]);
  });

  it('echappe le terme recherche avant de le poser en parametre', () => {
    expect(q({ recherche: '50%' }).valeurs[0]).toBe('%50\\%%');
  });

  it('filtre le mois de cloture, toutes annees confondues', () => {
    const r = q({ cloture: '06' });
    expect(r.where).toContain(`to_char(c.date_cloture, 'MM') = $`);
    expect(r.valeurs).toContain('06');
  });

  /**
   * ⚠️ TOUS LES COLLABORATEURS DEMANDES, PAS N'IMPORTE LEQUEL. L'ecran fait un
   * `.every` ; un `IN` rendrait les dossiers portant l'UN d'eux, soit beaucoup
   * plus de monde que ce que le cabinet a demande.
   */
  it('exige TOUS les collaborateurs demandes', () => {
    const r = q({ collaborateurs: ['a1', 'b2'] });
    expect(r.where).toContain('count(DISTINCT cc.user_id)');
    expect(r.where).toMatch(/= \$\d+$/);
    expect(r.valeurs).toEqual(expect.arrayContaining([['a1', 'b2'], 2]));
  });

  it('ne filtre pas sur « Mes dossiers » quand l utilisateur est inconnu', () => {
    expect(q({ mesDossiers: true, utilisateurId: null }).where).not.toContain('EXISTS');
    expect(q({ mesDossiers: true, utilisateurId: 'u1' }).where).toContain('EXISTS');
  });

  it('combine les filtres par ET, avec des parametres distincts', () => {
    const r = q({ recherche: 'x', statut: 'actif', regime: 'IS_REEL', cloture: '12' });
    expect(r.where.split(' AND ').length).toBe(5);
    expect(r.valeurs).toEqual(['%x%', 'actif', 'IS_REEL', '12']);
  });
});

describe('construireRequeteListe — le tri', () => {
  /**
   * ⚠️ LES VIDES EN DERNIER DANS LES DEUX SENS. Le tri de l'ecran l'impose
   * avant meme de regarder le sens (`if (!aVal) return 1`). Un `NULLS LAST`
   * oublie ferait remonter en tete, au tri descendant, tous les dossiers dont
   * la colonne est vide.
   */
  it('range les valeurs vides en dernier, a l endroit comme a l envers', () => {
    expect(q({ sens: 'asc' }).ordre).toContain('ASC NULLS LAST');
    expect(q({ sens: 'desc' }).ordre).toContain('DESC NULLS LAST');
  });

  /** La chaine vide doit compter comme un vide, pas se trier avant « A ». */
  it('traite la chaine vide comme un vide', () => {
    expect(q({ tri: 'ville' }).ordre).toContain(`NULLIF(c.ville, '')`);
  });

  it('trie les collaborateurs par NOMBRE, sans NULLS LAST', () => {
    const o = q({ tri: 'collaborators' }).ordre;
    expect(o).toContain('SELECT count(*) FROM client_collaborators');
    expect(o).not.toContain('NULLS LAST');
  });

  /** Une date n'a pas de collation, et ne doit pas etre passee au NULLIF texte. */
  it('trie la cloture comme une date', () => {
    const o = q({ tri: 'date_cloture' }).ordre;
    expect(o).toContain('c.date_cloture ASC NULLS LAST');
    expect(o).not.toContain('NULLIF');
    expect(o).not.toContain('COLLATE');
  });

  it('applique la collation sur les colonnes texte', () => {
    expect(q({ tri: 'nom_entreprise' }).ordre).toContain('COLLATE "und-x-icu"');
  });

  /** La collation n'est pas supposee presente : sans elle, on trie quand meme. */
  it('se passe de collation quand la base n en a pas', () => {
    const o = q({ tri: 'nom_entreprise' }, null).ordre;
    expect(o).not.toContain('COLLATE');
    expect(o).toContain('ASC NULLS LAST');
  });

  /**
   * ⚠️ SANS DEPARTAGE, LA PAGINATION MENT : deux clients de meme nom se rangent
   * dans un ordre que PostgreSQL ne garantit pas d'une requete a l'autre, si
   * bien qu'un dossier peut paraitre sur deux pages et un autre sur aucune.
   */
  it('departage toujours par un critere unique', () => {
    for (const tri of ['nom_entreprise', 'date_cloture', 'collaborators'] as const) {
      expect(q({ tri }).ordre, tri).toMatch(/, c\.created_at DESC, c\.id$/);
    }
  });
});
