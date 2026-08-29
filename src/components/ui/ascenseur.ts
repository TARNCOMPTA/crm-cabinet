/**
 * La géométrie d'un ascenseur horizontal dessiné à la main.
 * ---------------------------------------------------------------------------
 * Séparé de `DefilementHorizontal.tsx` pour la même raison qu'`etat.ts` l'est
 * de `suivi.ts` : c'est une règle de trois, elle se relit mal au milieu du JSX,
 * et surtout elle s'exerce sans navigateur. Les cas qui cassent sont tous des
 * divisions — contenu plus étroit que son conteneur, curseur occupant tout le
 * rail — et aucun ne se voit à l'œil sur une capture d'écran.
 */

/** En deçà, le curseur n'est plus saisissable à la souris. */
const CURSEUR_MINIMUM = 48;

export interface Mesures {
  /** Largeur visible du conteneur — c'est aussi celle du rail. */
  visible: number;
  /** Largeur totale du contenu. */
  total: number;
  position: number;
}

export interface Geometrie {
  /** Ce qui dépasse. À zéro, il n'y a pas d'ascenseur à montrer. */
  debordement: number;
  largeurCurseur: number;
  /** La distance que le curseur peut parcourir sur le rail. */
  courseCurseur: number;
  gaucheCurseur: number;
}

/**
 * Où poser le curseur, et quelle largeur lui donner.
 *
 * ⚠️ LE PLANCHER DE `CURSEUR_MINIMUM` CHANGE LA COURSE, pas seulement l'aspect.
 * Un tableau six fois plus large que la fenêtre donnerait un curseur de dix-huit
 * pixels, impossible à saisir. En l'élargissant de force, on raccourcit d'autant
 * ce qu'il peut parcourir : la conversion course → défilement doit donc partir
 * de la largeur RETENUE, jamais de la largeur théorique.
 */
export function geometrieAscenseur({ visible, total, position }: Mesures): Geometrie {
  const debordement = Math.max(0, total - visible);
  if (!debordement || visible <= 0) {
    return { debordement: 0, largeurCurseur: 0, courseCurseur: 0, gaucheCurseur: 0 };
  }
  const largeurCurseur = Math.min(
    visible,
    Math.max(CURSEUR_MINIMUM, (visible / total) * visible)
  );
  const courseCurseur = Math.max(0, visible - largeurCurseur);
  // `position` est bornée : un défilement élastique (pavé tactile) la fait
  // sortir des bornes, et le curseur dépasserait le rail.
  const bornee = Math.min(debordement, Math.max(0, position));
  return {
    debordement,
    largeurCurseur,
    courseCurseur,
    gaucheCurseur: (bornee / debordement) * courseCurseur,
  };
}
