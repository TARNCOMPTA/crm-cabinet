import { twMerge } from 'tailwind-merge';

/**
 * Assemble des classes Tailwind en laissant la DERNIÈRE gagner en cas de conflit.
 * ---------------------------------------------------------------------------
 * ⚠️ LES COMPOSANTS DE BASE POSENT LEURS CLASSES, PUIS AJOUTENT CELLES DE
 * L'APPELANT : `CardContent` écrit `px-6 py-4`, l'état vide d'une page lui
 * passe `py-16`. Deux paddings verticaux, même spécificité — et c'est l'ORDRE
 * DES RÈGLES DANS LA FEUILLE GÉNÉRÉE qui tranchait, pas l'ordre écrit.
 *
 * Tailwind 3 faisait gagner `py-4` : l'état vide des Bilans et des
 * Opportunités, écrit pour respirer, s'affichait tassé. Tailwind 4 range ses
 * règles autrement et fait gagner `py-16`. Constaté le 2026-09-23 en comparant
 * les captures de dix écrans avant et après la migration : trois écarts,
 * trois conflits de ce genre — le bouton « Déconnexion » (`justify-center`
 * contre `justify-start`) et le bandeau du tableau de bord en étaient deux.
 *
 * Le rendu dépendait donc d'un détail d'implémentation qui venait de changer,
 * et qui peut changer encore. `twMerge` le rend DÉTERMINISTE : la classe de
 * l'appelant, placée en dernier, l'emporte toujours.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
