/**
 * Choisir, parmi les pièces du greffe, celle qui est LES STATUTS.
 * ---------------------------------------------------------------------------
 * Module sans dépendance — ni `config`, ni réseau — pour la même raison que
 * `dates.ts` : une règle qu'on ne peut pas tester est une règle qu'on ne
 * vérifie pas.
 *
 * ⚠️ CETTE RÈGLE A UNE JUMELLE CÔTÉ FRONT, `src/lib/statuts.ts`, et les deux
 * doivent rester identiques. L'une décide de ce que la fiche client AFFICHE,
 * l'autre de ce que le bouton TÉLÉCHARGE. Si elles divergent, l'écran annonce
 * des statuts que le téléchargement déclare ensuite inexistants — et c'est
 * l'écran qu'on croit.
 *
 * ⚠️ POURQUOI PAS UN SIMPLE `/statuts/i` SUR LE LIBELLÉ, qui était la règle
 * précédente. `resolveLibelle` (libelles.ts) compose `"${type} - ${description}"`
 * dès que la pièce porte une décision. « PV d'assemblee generale extraordinaire
 * - Modification des statuts » est donc un libellé ordinaire, et l'ancienne
 * règle le retenait : le bouton « Télécharger les statuts » livrait alors un
 * procès-verbal. On ne cherche donc le mot que dans le segment de TYPE.
 */

/** Le strict nécessaire d'une `Piece` pour être choisie. */
export interface PieceChoisissable {
  id: string | null;
  type: string;
  category: string;
  date: string | null;
  depositDate: string | null;
}

function normaliser(libelle: string): string {
  return (libelle ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Le segment de type, avant la description que `resolveLibelle` accole. */
function typeSeul(libelle: string): string {
  return libelle.split(' - ')[0] ?? libelle;
}

export function estStatuts(libelle: string | null | undefined): boolean {
  return /\bstatuts?\b/.test(normaliser(typeSeul(libelle ?? '')));
}

/**
 * Les statuts les PLUS RÉCENTS, à défaut l'acte de création.
 *
 * Le plus récent, et non le premier venu : la fiche client met en avant « la
 * dernière version déposée », et livrer les statuts d'origine sous ce libellé
 * serait un mensonge silencieux — le fichier est un PDF, personne ne vérifie sa
 * date avant de le transmettre à une banque.
 *
 * Le repli sur `category === 'creation'` est conservé : une société dont l'INPI
 * n'étiquette aucune pièce « statuts » a tout de même un acte constitutif, et
 * c'est celui-là qu'on veut plutôt qu'un 404.
 */
export function choisirStatuts<T extends PieceChoisissable>(
  pieces: readonly T[]
): T | undefined {
  const candidats = (pieces ?? [])
    .filter((p) => estStatuts(p.type))
    // Le dépôt fait foi ; l'acte peut être signé des semaines plus tôt.
    .sort((a, b) =>
      (b.depositDate ?? b.date ?? '').localeCompare(a.depositDate ?? a.date ?? '')
    );

  return candidats[0] ?? (pieces ?? []).find((p) => p.category === 'creation');
}
