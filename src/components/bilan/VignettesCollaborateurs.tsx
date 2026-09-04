import { memo } from 'react';
import { getContrastColor } from '../../lib/collaboratorUtils';
import type { Vignette } from '../../lib/collaborateursBilan';

/**
 * Les vignettes des personnes affectées au dossier — AH pour Aymeric Hébrard,
 * VS pour Vanessa Sirven.
 * ---------------------------------------------------------------------------
 * Qui est dans la liste, dans quel ordre et pourquoi : voir
 * `src/lib/collaborateursBilan.ts`, qui porte le raisonnement et les tests.
 * Ce fichier ne fait que peindre.
 *
 * ⚠️ L'INFOBULLE EST UN `title`, PAS UN PANNEAU EN `absolute`. Les autres
 * avatars du dossier (`CollaboratorAvatar`) ouvrent au survol un panneau
 * positionné en absolu ; sur le tableau des bilans, la carte est dans une
 * colonne qui défile, et un tel panneau s'y trouve rogné. Le `title` du
 * navigateur ne se rogne jamais, et il survit à l'impression du tableau.
 *
 * ⚠️ `role="img"` AVEC `aria-label`. Sans lui, un lecteur d'écran annonce
 * « AH » — deux lettres, sans indice qu'il s'agit d'une personne. Le nom
 * complet, le rôle et la mention du responsable y sont donc écrits en clair.
 */

interface Props {
  vignettes: Vignette[];
  taille?: 'sm' | 'md';
  /** Au-delà, les suivantes sont repliées derrière un « +N ». */
  max?: number;
}

const TAILLES = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
} as const;

/** « Aymeric Hébrard (principal) — responsable du bilan » */
function legende(v: Vignette): string {
  const morceaux = [v.nomComplet];
  if (v.role) morceaux.push(`(${v.role})`);
  const nom = morceaux.join(' ');
  return v.responsableBilan ? `${nom} — responsable du bilan` : nom;
}

export const VignettesCollaborateurs = memo(function VignettesCollaborateurs({
  vignettes,
  taille = 'sm',
  max = 5,
}: Props) {
  if (vignettes.length === 0) return null;

  const visibles = vignettes.slice(0, max);
  const restantes = vignettes.slice(max);

  return (
    <div className="flex items-center gap-1">
      {visibles.map((v) => (
        <div
          key={v.userId}
          role="img"
          aria-label={legende(v)}
          title={legende(v)}
          className={`${TAILLES[taille]} rounded-full flex items-center justify-center font-semibold shrink-0 ${
            // Le cercle sarcelle designe le responsable du bilan. Les vignettes
            // ne se chevauchent PAS : superposees, la premiere perd une de ses
            // deux lettres, et deux initiales sur trois ne nomment plus
            // personne. Constate a l'ecran sur « RP » masque par « SB ».
            v.responsableBilan ? 'ring-2 ring-offset-1 ring-teal-500 dark:ring-teal-400 dark:ring-offset-gray-900' : ''
          }`}
          style={{ backgroundColor: v.couleur, color: getContrastColor(v.couleur) }}
        >
          {v.initiales}
        </div>
      ))}
      {restantes.length > 0 && (
        <div
          role="img"
          aria-label={`${restantes.length} de plus : ${restantes.map(legende).join(', ')}`}
          title={restantes.map(legende).join('\n')}
          className={`${TAILLES[taille]} rounded-full flex items-center justify-center font-semibold shrink-0 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300`}
        >
          +{restantes.length}
        </div>
      )}
    </div>
  );
});
