/**
 * Les statuts déposés au greffe, résumés.
 * ---------------------------------------------------------------------------
 * Module PUR : il ne connaît ni la base, ni le réseau, ni React. Il ne porte
 * qu'une chose, mais elle décide de tout l'écran — reconnaître, parmi les pièces
 * déposées au registre, celles qui sont les statuts.
 *
 * ⚠️ POURQUOI PAS `act_category`, QUI SEMBLERAIT FAIT POUR ÇA.
 *
 * `categoriser()` (server/src/inpi/service.ts) teste `constitutif` AVANT
 * `statuts`. La catégorie ne dit donc pas ce qu'on croit :
 *
 *   « Statuts constitutifs »   → creation              (c'est un statut)
 *   « Statuts mis a jour »     → modification_statuts  (c'en est un)
 *   « Augmentation de capital »→ modification_statuts  (ce n'en est PAS un)
 *   « Traite de fusion »       → modification_statuts  (ni celui-la)
 *
 * Filtrer sur la catégorie donnerait donc à la fois des manques et des intrus.
 * Le libellé, lui, est net : le catalogue des pièces INPI
 * (server/src/inpi/libelles.ts) ne contient que trois entrées portant le mot
 * « statuts » — STA, STAC, STAM — et ce sont exactement les trois qu'on veut.
 *
 * ⚠️ CETTE RÈGLE A UNE JUMELLE, et les deux doivent rester identiques :
 * `server/src/inpi/statuts.ts` choisit avec elle la pièce à TÉLÉCHARGER, quand
 * celle-ci décide de ce qui est AFFICHÉ. Si elles divergent, l'écran annonce des
 * statuts que le bouton déclare ensuite inexistants — le pire des deux mondes,
 * puisque c'est l'écran qu'on croit. Les deux fichiers portent les mêmes cas de
 * test, pour que la divergence se voie avant l'utilisateur.
 */

/** Ce qu'une ligne de `legal_acts` doit porter pour être résumée ici. */
export interface ActeDepose {
  id: string;
  act_type: string;
  act_category?: string | null;
  act_date: string;
  deposit_date?: string | null;
  inpi_reference?: string | null;
}

export interface DepotStatuts {
  id: string;
  libelle: string;
  /** Date du dépôt au greffe, à défaut date de l'acte. Jamais nulle. */
  date: string;
  constitutif: boolean;
  reference: string | null;
}

export interface ResumeStatuts {
  /** Le dépôt d'origine. Toujours présent dès qu'un statut existe. */
  constitutifs: DepotStatuts;
  /** Le plus récent — le même que `constitutifs` si rien n'a bougé depuis. */
  derniereVersion: DepotStatuts;
  /** Dépôts de statuts postérieurs à la création. */
  nbModifications: number;
  /** Tous les dépôts de statuts, du plus récent au plus ancien. */
  depots: DepotStatuts[];
}

/** Sans accent ni casse : l'INPI écrit « Statuts mis a jour », parfois accentué. */
function normaliser(libelle: string): string {
  return (libelle ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * La partie « type » d'un libellé, sans sa description.
 *
 * ⚠️ `act_type` EST UN LIBELLÉ COMPOSÉ. `resolveLibelle` (server/src/inpi/
 * libelles.ts) rend `"${displayType} - ${description}"` dès que la pièce porte
 * une décision ou un objet. « PV d'assemblee generale extraordinaire -
 * Modification des statuts » est donc un `act_type` parfaitement ordinaire.
 *
 * Chercher « statuts » dans le libellé ENTIER le prend alors pour des statuts,
 * alors que c'est un procès-verbal qui en DÉCIDE une modification. La fiche
 * compterait des mises à jour qui n'ont pas eu lieu, et pourrait présenter un PV
 * comme la dernière version des statuts.
 */
function typeSeul(libelle: string): string {
  return libelle.split(' - ')[0] ?? libelle;
}

/**
 * Cette pièce est-elle les statuts ?
 *
 * Volontairement la MÊME règle que le serveur, au même endroit de la décision.
 * Voir l'avertissement en tête de fichier.
 */
export function estStatuts(libelle: string | null | undefined): boolean {
  // `\bstatuts?\b` et non `^statuts` : le type peut se lire « Depot des statuts
  // mis a jour » quand l'INPI n'a pas de code et retombe sur un intitulé libre.
  return /\bstatuts?\b/.test(normaliser(typeSeul(libelle ?? '')));
}

/**
 * Le résumé, ou `null` quand ce client n'a aucun statut déposé.
 *
 * `null` N'EST PAS UN CAS D'ERREUR, c'est le signal de masquage de la section :
 * une fiche sans statuts au registre ne doit pas afficher d'encart vide. La
 * distinction entre « il n'y en a pas » et « on n'a pas pu savoir » se fait un
 * cran au-dessus, dans `statutsService.ts` — ici, on ne voit que des données.
 */
export function resumerStatuts(actes: readonly ActeDepose[]): ResumeStatuts | null {
  const depots = (actes ?? [])
    .filter((a) => estStatuts(a.act_type))
    .map(
      (a): DepotStatuts => ({
        id: a.id,
        libelle: a.act_type,
        // Le dépôt fait foi ; l'acte peut être signé des semaines avant d'être
        // déposé, et c'est la date de dépôt qui figure au registre.
        date: a.deposit_date || a.act_date,
        constitutif: a.act_category === 'creation',
        reference: a.inpi_reference ?? null,
      })
    )
    // Tri décroissant. Le libellé départage les dates identiques : sans cela
    // l'ordre dépendrait de celui de la base, donc changerait d'un affichage a
    // l'autre pour les sociétés qui déposent tout le même jour.
    .sort((a, b) => b.date.localeCompare(a.date) || a.libelle.localeCompare(b.libelle));

  if (depots.length === 0) return null;

  /**
   * Un même dépôt ne compte qu'une fois.
   *
   * `legal_acts.inpi_reference` est UNIQUE mais NULLABLE, et deux NULL ne sont
   * jamais en conflit dans un index PostgreSQL : l'upsert
   * `onConflict: 'inpi_reference'` ne dédoublonne donc PAS les pièces sans
   * référence. Une resynchronisation depuis la page Juridique — qui est offerte
   * client par client et en masse — les réinsère, et le compte de mises à jour
   * grimperait à chaque passage.
   */
  const uniques: DepotStatuts[] = [];
  const vus = new Set<string>();
  for (const d of depots) {
    const cle = d.reference ?? `${d.libelle}|${d.date}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    uniques.push(d);
  }

  // Le PLUS ANCIEN dépôt classé « creation », et non le premier trouvé : la
  // liste est triée du plus récent au plus ancien, et des statuts constitutifs
  // redéposés donneraient sinon une date de création postérieure à la vraie.
  // À défaut de classement, le plus ancien dépôt fait foi.
  const constitutifs =
    uniques.filter((d) => d.constitutif).at(-1) ?? uniques[uniques.length - 1];

  return {
    constitutifs,
    derniereVersion: uniques[0],
    nbModifications: uniques.length - 1,
    depots: uniques,
  };
}
