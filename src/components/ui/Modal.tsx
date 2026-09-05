import { ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

/**
 * Les fenêtres du CRM.
 * ---------------------------------------------------------------------------
 * ⚠️ CE COMPOSANT N'ÉTAIT PAS UN DIALOGUE, il en avait seulement l'apparence.
 * Deux `<div>` empilés, sans `role`, sans nom, sans piège à focus. Ce qu'un
 * clavier ou un lecteur d'écran en faisait :
 *
 *   · rien n'annonçait qu'une fenêtre s'était ouverte, ni ce qu'elle voulait ;
 *   · le focus restait DERRIÈRE, sur le bouton qui l'avait ouverte. Tabuler
 *     promenait dans la page masquée — invisible sous le voile, mais bien là et
 *     bien focalisable ;
 *   · Échap ne fermait rien. La seule sortie était de viser la croix ou le
 *     voile à la souris ;
 *   · à la fermeture, le focus repartait sur le `<body>` : la tabulation
 *     suivante recommençait au tout début de la page.
 *
 * Le motif WAI-ARIA « Modal Dialog » est posé ici, une fois, pour les
 * quarante-cinq écrans qui s'en servent.
 *
 * ⚠️ ÉCHAP ET TABULATION SONT TRAITÉS SUR LE CONTENEUR, pas sur `document`.
 * C'est délibéré, et ça règle deux choses d'un coup :
 *   · un `SearchableSelect` ouvert dans la fenêtre traite Échap pour se
 *     refermer et appelle `preventDefault()`. Un écouteur sur `document`
 *     recevrait la touche de toute façon et fermerait la fenêtre entière — on
 *     regarde donc `defaultPrevented`, ce que seul un gestionnaire en aval
 *     permet ;
 *   · deux fenêtres ouvertes l'une par-dessus l'autre (une confirmation
 *     par-dessus un formulaire) : le focus est dans la plus haute, c'est elle
 *     qui reçoit la touche, et `stopPropagation` empêche l'autre de fermer
 *     aussi.
 */

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /**
   * Ce qui accompagne le titre sur la meme ligne : identifiants, raccourcis.
   *
   * ⚠️ JAMAIS LE NOM LUI-MEME. `aria-labelledby` ne designe que le `<h2>` :
   * ce qui passe par ici n'entre pas dans le nom accessible de la fenetre, et
   * un lecteur d'ecran ne l'annoncerait pas a l'ouverture.
   */
  complementTitre?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * ⚠️ UN COMPTEUR, PAS UN BOOLÉEN, pour le verrouillage du défilement.
 *
 * L'ancienne version posait `overflow: hidden` à l'ouverture et `unset` à la
 * fermeture. Avec une confirmation par-dessus un formulaire, fermer la
 * confirmation RENDAIT LE DÉFILEMENT à la page alors que le formulaire était
 * toujours ouvert : l'arrière-plan se remettait à défiler sous le voile.
 */
let fenetresOuvertes = 0;

/** Ce qui peut recevoir le focus, dans l'ordre du document. */
const FOCALISABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

export function Modal({ isOpen, onClose, title, complementTitre, children, size = 'md' }: ModalProps) {
  const boite = useRef<HTMLDivElement>(null);
  const idTitre = useId();

  useEffect(() => {
    if (!isOpen) return;

    fenetresOuvertes += 1;
    document.body.style.overflow = 'hidden';

    // Où rendre le focus en partant. Lu MAINTENANT : à la fermeture, le bouton
    // d'origine peut avoir disparu, mais on saura au moins qu'il faut essayer.
    const origine = document.activeElement as HTMLElement | null;

    // Le focus va sur la BOÎTE, pas sur son premier élément focalisable — qui
    // est la croix de fermeture. Ouvrir une fenêtre en plaçant le curseur sur
    // « fermer » est une invitation malheureuse ; poser le focus sur le
    // conteneur fait lire son titre, puis laisse la tabulation entrer.
    boite.current?.focus();

    return () => {
      fenetresOuvertes = Math.max(0, fenetresOuvertes - 1);
      if (fenetresOuvertes === 0) document.body.style.overflow = 'unset';
      // `isConnected` : la ligne de tableau qui portait le bouton a pu être
      // supprimée par l'action même que la fenêtre servait à confirmer.
      if (origine?.isConnected) origine.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const auClavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Une touche déjà traitée en dessous ne nous appartient pas : un menu
    // déroulant ouvert dans la fenêtre se ferme sur Échap avant nous.
    if (e.defaultPrevented) return;

    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key !== 'Tab' || !boite.current) return;

    // Le piège à focus. La liste est relue à chaque frappe : le contenu d'une
    // fenêtre change (champs ajoutés, boutons désactivés pendant un
    // enregistrement), et une liste figée à l'ouverture enverrait le focus sur
    // un élément devenu inatteignable.
    //
    // ⚠️ AUCUN FILTRE DE VISIBILITÉ GÉOMÉTRIQUE ICI, et ce n'est pas un oubli.
    // `offsetParent` vaut `null` pour TOUT élément placé sous un ancêtre
    // `position: fixed` — c'est-à-dire pour le contenu entier de cette
    // fenêtre. Filtrer là-dessus viderait la liste dans un vrai navigateur, et
    // le piège se refermerait sur la boîte vide. `getClientRects()` fonctionne
    // en navigateur mais rend zéro sous jsdom, qui ne calcule aucune mise en
    // page : le test ne verrait plus rien non plus.
    //
    // On s'en tient donc à ce qui est structurel et vrai partout. Les écrans du
    // dossier démontent ce qu'ils cachent au lieu de le masquer en CSS, ce qui
    // rend le cas géométrique théorique.
    const cibles = Array.from(
      boite.current.querySelectorAll<HTMLElement>(FOCALISABLES)
    ).filter((el) => !el.closest('[hidden],[aria-hidden="true"]'));
    if (cibles.length === 0) {
      // Rien à atteindre : on garde le focus sur la boîte plutôt que de le
      // laisser filer derrière le voile.
      e.preventDefault();
      boite.current.focus();
      return;
    }

    const premier = cibles[0];
    const dernier = cibles[cibles.length - 1];
    const actif = document.activeElement;

    if (e.shiftKey && (actif === premier || actif === boite.current)) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && actif === dernier) {
      e.preventDefault();
      premier.focus();
    } else if (actif === boite.current) {
      e.preventDefault();
      premier.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={auClavier}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={boite}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
        className={`relative bg-white dark:bg-ink-900/95 dark:backdrop-blur-xl rounded-2xl shadow-elevated dark:shadow-dark-card border border-gray-200/60 dark:border-white/[0.08] w-full ${sizes[size]} mx-4 max-h-[90vh] flex flex-col animate-slide-in-up outline-none`}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h2 id={idTitre} className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {complementTitre}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
