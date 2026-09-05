import type {
  RevenueDeclaration,
  RevenueDeclarationStatus,
  RevenueDeclarationZone,
} from '../../lib/revenueDeclarationService';

/**
 * Ce que l'écran des déclarations de revenus montre, et ce qu'il a le droit de
 * modifier en lot.
 * ---------------------------------------------------------------------------
 * Ces règles vivaient dans le corps du composant, en `useMemo` et en fonctions
 * anonymes — 607 lignes de JSX sans un commentaire, et deux défauts au milieu
 * que personne ne pouvait voir en les relisant :
 *
 *   · LA SÉLECTION NE SUIVAIT PAS LES FILTRES. On cochait vingt déclarations,
 *     on changeait l'année, et « Attribuer collaborateurs » s'appliquait aux
 *     vingt d'AVANT — devenues invisibles. Une modification en lot sur des
 *     lignes qu'on ne voit plus est le pire de ce qu'un écran peut faire :
 *     elle réussit, elle annonce « 20 déclarations mises à jour », et rien à
 *     l'écran ne montre ce qui a changé.
 *   · « TOUT SÉLECTIONNER » COMPARAIT DES TAILLES. `selection.size ===
 *     visibles.length` est vrai dès que les deux comptes coïncident, même sur
 *     des ensembles différents : après un changement de filtre, le bouton
 *     désélectionnait au lieu de sélectionner.
 *
 * Sorties d'ici, ces règles se lisent et se prouvent.
 */

export interface Filtres {
  recherche: string;
  annee: number | 'all';
  statut: RevenueDeclarationStatus | 'all';
  zone: RevenueDeclarationZone | 'all';
  /** Ne garder que les déclarations où cet utilisateur est collaborateur. */
  mesDossiers: boolean;
  utilisateurId: string | null;
}

/** Les quatre champs sur lesquels la recherche porte, et rien d'autre. */
function correspondALaRecherche(d: RevenueDeclaration, requete: string): boolean {
  const q = requete.trim().toLowerCase();
  if (!q) return true;
  return (
    d.person_name.toLowerCase().includes(q) ||
    (d.clients?.nom_entreprise ?? '').toLowerCase().includes(q) ||
    (d.clients?.numero_dossier ?? '').toLowerCase().includes(q) ||
    (d.commentaire ?? '').toLowerCase().includes(q)
  );
}

export function filtrerDeclarations(
  declarations: RevenueDeclaration[],
  f: Filtres
): RevenueDeclaration[] {
  return declarations.filter((d) => {
    if (f.annee !== 'all' && d.annee !== f.annee) return false;
    if (f.statut !== 'all' && d.statut !== f.statut) return false;
    if (f.zone !== 'all' && d.zone !== f.zone) return false;
    if (f.mesDossiers) {
      // Sans utilisateur connu, « mes dossiers » ne peut désigner personne : on
      // ne montre rien plutôt que de montrer tout. Un filtre qui s'annule en
      // silence ferait croire à un portefeuille vide.
      if (!f.utilisateurId) return false;
      if (!(d.collaborators ?? []).some((c) => c.user_id === f.utilisateurId)) return false;
    }
    return correspondALaRecherche(d, f.recherche);
  });
}

/**
 * La sélection, ramenée à ce qui est visible.
 *
 * Appelée à chaque rendu : c'est ce qui garantit qu'une action en lot ne porte
 * QUE sur des lignes que la personne a sous les yeux.
 */
export function restreindreSelection(
  selection: Set<string>,
  visibles: RevenueDeclaration[]
): Set<string> {
  if (selection.size === 0) return selection;
  const vus = new Set(visibles.map((d) => d.id));
  const gardes = [...selection].filter((id) => vus.has(id));
  // Rendre le MÊME ensemble quand rien ne change : un nouvel objet à chaque
  // rendu relancerait sans fin les effets qui en dépendent.
  return gardes.length === selection.size ? selection : new Set(gardes);
}

/** Vrai quand toutes les lignes visibles sont sélectionnées — et pas « autant ». */
export function toutesSelectionnees(
  selection: Set<string>,
  visibles: RevenueDeclaration[]
): boolean {
  if (visibles.length === 0) return false;
  return visibles.every((d) => selection.has(d.id));
}
