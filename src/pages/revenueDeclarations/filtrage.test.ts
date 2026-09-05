import { describe, it, expect } from 'vitest';
import type { RevenueDeclaration } from '../../lib/revenueDeclarationService';
import {
  filtrerDeclarations,
  restreindreSelection,
  toutesSelectionnees,
  type Filtres,
} from './filtrage';

function declaration(p: Partial<RevenueDeclaration> & { id: string }): RevenueDeclaration {
  return {
    annee: 2025,
    statut: 'a_faire',
    zone: '1',
    person_name: 'DUPONT Jean',
    commentaire: '',
    collaborators: [],
    clients: null,
    ...p,
  } as RevenueDeclaration;
}

const AUCUN_FILTRE: Filtres = {
  recherche: '',
  annee: 'all',
  statut: 'all',
  zone: 'all',
  mesDossiers: false,
  utilisateurId: 'u-1',
};

const A = declaration({ id: 'a', annee: 2025, statut: 'a_faire', zone: '1', person_name: 'DUPONT Jean' });
const B = declaration({
  id: 'b', annee: 2024, statut: 'fait', zone: '2', person_name: 'MARTIN Sophie',
  commentaire: 'relance envoyee',
  clients: { nom_entreprise: 'BOULANGERIE DU PONT', numero_dossier: 'A-003' },
  collaborators: [{ user_id: 'u-1', full_name: 'Aymeric' }],
} as Partial<RevenueDeclaration> & { id: string });
const C = declaration({ id: 'c', annee: 2025, statut: 'fait', zone: '3', person_name: 'ZUNINO Zoe' });

const TOUTES = [A, B, C];
const ids = (l: RevenueDeclaration[]) => l.map((d) => d.id);

describe('filtrerDeclarations', () => {
  it('rend tout quand aucun filtre n est pose', () => {
    expect(ids(filtrerDeclarations(TOUTES, AUCUN_FILTRE))).toEqual(['a', 'b', 'c']);
  });

  it('filtre par annee, statut et zone', () => {
    expect(ids(filtrerDeclarations(TOUTES, { ...AUCUN_FILTRE, annee: 2025 }))).toEqual(['a', 'c']);
    expect(ids(filtrerDeclarations(TOUTES, { ...AUCUN_FILTRE, statut: 'fait' }))).toEqual(['b', 'c']);
    expect(ids(filtrerDeclarations(TOUTES, { ...AUCUN_FILTRE, zone: '2' }))).toEqual(['b']);
  });

  it('cherche dans le nom, l entreprise, le numero de dossier et le commentaire', () => {
    for (const requete of ['martin', 'BOULANGERIE', 'a-003', 'relance']) {
      expect(
        ids(filtrerDeclarations(TOUTES, { ...AUCUN_FILTRE, recherche: requete })),
        `« ${requete} » ne trouve pas la declaration attendue`
      ).toEqual(['b']);
    }
  });

  it('ignore la casse et les espaces autour de la recherche', () => {
    expect(ids(filtrerDeclarations(TOUTES, { ...AUCUN_FILTRE, recherche: '  DuPont  ' }))).toEqual(['a']);
  });

  it('ne garde que mes dossiers quand le filtre est actif', () => {
    expect(ids(filtrerDeclarations(TOUTES, { ...AUCUN_FILTRE, mesDossiers: true }))).toEqual(['b']);
  });

  it('ne montre RIEN plutot que TOUT quand « mes dossiers » n a pas d utilisateur', () => {
    // Un filtre qui s'annule en silence ferait croire a un portefeuille entier
    // alors qu'on a demande le sien.
    const v = filtrerDeclarations(TOUTES, { ...AUCUN_FILTRE, mesDossiers: true, utilisateurId: null });
    expect(v).toEqual([]);
  });

  it('combine les filtres', () => {
    expect(ids(filtrerDeclarations(TOUTES, { ...AUCUN_FILTRE, annee: 2025, statut: 'fait' }))).toEqual(['c']);
  });
});

describe('restreindreSelection', () => {
  it('laisse tomber ce qui n est plus visible', () => {
    // Le defaut qui motive ce module : on coche, on change de filtre, et
    // l'action en lot portait sur des lignes devenues invisibles.
    const selection = new Set(['a', 'b', 'c']);
    expect([...restreindreSelection(selection, [B])]).toEqual(['b']);
  });

  it('rend le MEME ensemble quand rien ne change', () => {
    // Un nouvel objet a chaque rendu relancerait sans fin les effets qui en
    // dependent.
    const selection = new Set(['a', 'b']);
    expect(restreindreSelection(selection, [A, B])).toBe(selection);
  });

  it('ne touche pas a une selection vide', () => {
    const vide = new Set<string>();
    expect(restreindreSelection(vide, TOUTES)).toBe(vide);
  });
});

describe('toutesSelectionnees', () => {
  it('compare les ENSEMBLES, pas les tailles', () => {
    // `selection.size === visibles.length` etait vrai ici, et faisait
    // deselectionner le bouton « tout selectionner ».
    expect(toutesSelectionnees(new Set(['a', 'b']), [B, C])).toBe(false);
    expect(toutesSelectionnees(new Set(['b', 'c']), [B, C])).toBe(true);
  });

  it('est faux sur une liste vide, sinon le bouton se coche tout seul', () => {
    expect(toutesSelectionnees(new Set(), [])).toBe(false);
  });
});
