/**
 * Un tableau large, et son ascenseur là où la main le cherche.
 * ---------------------------------------------------------------------------
 * LE DÉFAUT QUE CE COMPOSANT CORRIGE. Un `overflow-x-auto` pose sa barre de
 * défilement au BAS DE SON CONTENU, pas au bas de l'écran. Sur la liste
 * clients — cinquante lignes par page — le conteneur mesure 5 266 px de haut :
 * sa barre se trouve donc 4 700 px sous la fenêtre, et il faut faire défiler
 * toute la page pour l'atteindre. Les colonnes de droite — Ville, Régime,
 * Clôture, 663 px sur 1 797 — restaient inaccessibles autrement qu'à la
 * molette horizontale, que personne ne pense à essayer.
 *
 * Le symptôme trompeur, et celui qui a été signalé : EN FILTRANT, ÇA MARCHE.
 * Une liste réduite à quelques lignes ramène le bas du conteneur dans la
 * fenêtre, donc sa barre avec. L'écran donnait ainsi l'impression d'un défaut
 * intermittent, alors que la géométrie est parfaitement régulière.
 *
 * CE QU'IL FAIT. Un ascenseur `sticky bottom-0` : il reste collé au bas de la
 * fenêtre tant que la carte est visible, et se pose de lui-même à sa place
 * naturelle quand on atteint la fin du tableau.
 *
 * ⚠️ LE CURSEUR EST DESSINÉ, PAS EMPRUNTÉ AU SYSTÈME. Une seconde zone de
 * défilement native aurait été plus courte à écrire, mais sa barre ne réserve
 * de place que si le système est réglé sur des barres classiques : mesuré à
 * 2 px de haut sur un système à barres en superposition, où le curseur
 * s'efface au repos. Ce serait reproduire le défaut qu'on corrige — un
 * ascenseur qu'on ne voit pas. Celui-ci fait la même épaisseur partout.
 *
 * La barre native du conteneur est masquée (`sans-ascenseur`, index.css) pour
 * qu'il n'y en ait pas deux empilées une fois le bas de la carte atteint. Le
 * conteneur reste une vraie zone de défilement : molette, pavé tactile et
 * clavier continuent d'y fonctionner.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { geometrieAscenseur, type Mesures } from './ascenseur';

const VIDE: Mesures = { visible: 0, total: 0, position: 0 };

interface Props {
  children: ReactNode;
  /** Ajouté au conteneur qui défile réellement. */
  className?: string;
}

export function DefilementHorizontal({ children, className = '' }: Props) {
  const contenu = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Mesures>(VIDE);

  const mesurer = useCallback(() => {
    const el = contenu.current;
    if (!el) return;
    setM((avant) =>
      avant.visible === el.clientWidth &&
      avant.total === el.scrollWidth &&
      avant.position === el.scrollLeft
        ? avant
        : { visible: el.clientWidth, total: el.scrollWidth, position: el.scrollLeft }
    );
  }, []);

  // `useLayoutEffect` : la première mesure doit précéder la peinture, sinon
  // l'ascenseur apparaît une image après le tableau, avec un sursaut.
  useLayoutEffect(() => {
    const el = contenu.current;
    if (!el) return;
    mesurer();

    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    /**
     * Le TABLEAU est observé en plus du conteneur.
     *
     * Filtrer ne change pas la taille du conteneur — il occupe toute la largeur
     * disponible dans les deux cas — mais change celle du tableau : moins de
     * lignes, donc des colonnes plus étroites, donc un débordement différent.
     * N'observer que le conteneur laisserait un curseur calibré sur la liste
     * précédente.
     */
    if (el.firstElementChild) observateur.observe(el.firstElementChild);
    return () => observateur.disconnect();
  }, [mesurer, children]);

  const { debordement, largeurCurseur, courseCurseur, gaucheCurseur } = geometrieAscenseur(m);

  /** Déplace le contenu ; l'événement `scroll` remet le curseur à jour. */
  const allerA = useCallback(
    (x: number) => {
      const el = contenu.current;
      if (el) el.scrollLeft = Math.min(debordement, Math.max(0, x));
    },
    [debordement]
  );

  /**
   * Le glissé du curseur.
   *
   * `setPointerCapture` est ce qui permet de sortir du rail sans lâcher : sans
   * lui, un mouvement rapide vers la droite perd le pointeur dès qu'il quitte
   * la barre de dix pixels, et le curseur reste planté en chemin.
   */
  const saisir = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!debordement || !courseCurseur) return;
    e.preventDefault();
    const depart = e.clientX;
    const positionDepart = m.position;
    const cible = e.currentTarget;
    cible.setPointerCapture(e.pointerId);

    const bouger = (ev: PointerEvent) => {
      allerA(positionDepart + ((ev.clientX - depart) * debordement) / courseCurseur);
    };
    const lacher = () => {
      cible.releasePointerCapture(e.pointerId);
      cible.removeEventListener('pointermove', bouger);
      cible.removeEventListener('pointerup', lacher);
      cible.removeEventListener('pointercancel', lacher);
    };
    cible.addEventListener('pointermove', bouger);
    cible.addEventListener('pointerup', lacher);
    cible.addEventListener('pointercancel', lacher);
  };

  /** Un clic dans le rail amène le curseur sous le doigt, centré. */
  const sauter = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!debordement || e.target !== e.currentTarget || !courseCurseur) return;
    const r = e.currentTarget.getBoundingClientRect();
    const vise = e.clientX - r.left - largeurCurseur / 2;
    allerA((Math.min(courseCurseur, Math.max(0, vise)) * debordement) / courseCurseur);
  };

  // La molette au-dessus de l'ascenseur défile le tableau, comme au-dessus
  // d'une vraie barre. `passive: false` parce qu'on annule le geste par défaut.
  useEffect(() => {
    const el = rail.current;
    if (!el || !debordement) return;
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      allerA(m.position + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
    };
    el.addEventListener('wheel', molette, { passive: false });
    return () => el.removeEventListener('wheel', molette);
  }, [allerA, debordement, m.position]);

  return (
    <>
      <div
        ref={contenu}
        onScroll={mesurer}
        className={`overflow-x-auto ${debordement ? 'sans-ascenseur' : ''} ${className}`}
      >
        {children}
      </div>

      {debordement > 0 && (
        <div
          className="sticky bottom-0 z-20 rounded-b-xl border-t border-gray-200/80 bg-white/85 px-1 py-1.5 backdrop-blur-sm dark:border-white/[0.07] dark:bg-ink-900/85"
          /*
            `aria-hidden` : ce rail ne dit rien qu'un lecteur d'écran doive
            entendre. La zone de défilement qui compte reste le conteneur du
            tableau, où vivent les liens et les champs — elle garde son clavier
            et sa sémantique.
          */
          aria-hidden
        >
          <div
            ref={rail}
            onPointerDown={sauter}
            /* Repere stable pour les tests : une classe utilitaire changerait
               au premier ajustement de style, et le test partirait avec. */
            data-ascenseur="horizontal"
            className="relative h-2.5 cursor-pointer rounded-full bg-gray-200/70 dark:bg-white/[0.08]"
          >
            <div
              onPointerDown={saisir}
              style={{ width: largeurCurseur, transform: `translateX(${gaucheCurseur}px)` }}
              className="absolute inset-y-0 left-0 cursor-grab rounded-full bg-gray-400/80 transition-colors hover:bg-teal-500/70 active:cursor-grabbing dark:bg-white/25 dark:hover:bg-teal-400/60"
            />
          </div>
        </div>
      )}
    </>
  );
}
