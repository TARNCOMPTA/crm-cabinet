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
  /**
   * Fourni, chaque vignette devient un bouton qui désigne — ou retire — le
   * responsable du bilan. Absent, elles restent de simples images.
   *
   * ⚠️ NE PAS LE FOURNIR SUR LA CARTE DU TABLEAU : la carte entière est déjà
   * cliquable et ouvre le bilan ; un bouton par-dessus volerait ce clic, et
   * désigner un responsable en croyant ouvrir un dossier est exactement le
   * genre d'écriture involontaire qu'on ne remarque pas.
   */
  onDesigner?: (userId: string) => void;
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

/** La même, plus ce que le clic va faire — le bouton doit annoncer son effet. */
function legendeCliquable(v: Vignette): string {
  return v.responsableBilan
    ? `${legende(v)} · cliquer pour ne plus le désigner`
    : `${legende(v)} · cliquer pour le désigner responsable du bilan`;
}

export const VignettesCollaborateurs = memo(function VignettesCollaborateurs({
  vignettes,
  taille = 'sm',
  max = 5,
  onDesigner,
}: Props) {
  if (vignettes.length === 0) return null;

  const visibles = vignettes.slice(0, max);
  const restantes = vignettes.slice(max);

  return (
    <div className="flex items-center gap-1">
      {visibles.map((v) => {
        // Le cercle sarcelle designe le responsable du bilan. Les vignettes ne
        // se chevauchent PAS : superposees, la premiere perd une de ses deux
        // lettres, et deux initiales sur trois ne nomment plus personne.
        // Constate a l'ecran sur « RP » masque par « SB ».
        const pastille = `${TAILLES[taille]} rounded-full flex items-center justify-center font-semibold shrink-0 ${
          v.responsableBilan
            ? 'ring-2 ring-offset-1 ring-teal-500 dark:ring-teal-400 dark:ring-offset-gray-900'
            : ''
        }`;
        const teinte = { backgroundColor: v.couleur, color: getContrastColor(v.couleur) };

        if (!onDesigner) {
          return (
            <div key={v.userId} role="img" aria-label={legende(v)} title={legende(v)}
                 className={pastille} style={teinte}>
              {v.initiales}
            </div>
          );
        }

        return (
          <button
            key={v.userId}
            type="button"
            onClick={() => onDesigner(v.userId)}
            // `aria-pressed` plutot qu'un simple bouton : l'etat « c'est lui le
            // responsable » est ce que le clic bascule, et c'est la seule facon
            // de l'annoncer sans le repeter dans le libelle a chaque rendu.
            aria-pressed={v.responsableBilan}
            aria-label={legendeCliquable(v)}
            title={legendeCliquable(v)}
            className={`${pastille} transition-shadow cursor-pointer ${
              v.responsableBilan
                ? 'hover:ring-teal-400'
                : 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 dark:hover:ring-gray-600 dark:hover:ring-offset-gray-900'
            }`}
            style={teinte}
          >
            {v.initiales}
          </button>
        );
      })}
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
