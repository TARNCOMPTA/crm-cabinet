import { createContext, useContext, useEffect, useId, useRef, useState, ReactNode } from 'react';

/**
 * Les onglets du CRM.
 * ---------------------------------------------------------------------------
 * ⚠️ CE COMPOSANT N'AVAIT AUCUN RÔLE ARIA. Les déclencheurs étaient des
 * `<button>` nus dans un `<div>` : à la souris tout fonctionnait, mais un
 * lecteur d'écran annonçait « bouton Parts » — pas « onglet Parts, 3 sur 7,
 * sélectionné ». Rien ne disait qu'il s'agissait d'un groupe, combien il en
 * comptait, ni lequel était actif. Les tests de bout en bout ne pouvaient pas
 * non plus viser un onglet par son rôle, et se rabattaient sur le texte.
 *
 * Le motif implémenté est celui du WAI-ARIA « Tabs » avec ACTIVATION
 * AUTOMATIQUE : la flèche déplace le focus ET sélectionne. C'est le choix
 * recommandé quand l'affichage d'un panneau ne coûte rien — ici il ne fait que
 * monter des composants déjà chargés. L'activation manuelle (flèche pour se
 * déplacer, Entrée pour choisir) ne se justifie que si chaque changement
 * déclenche un appel réseau.
 */

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  /** Racine des identifiants, pour lier chaque onglet à son panneau. */
  base: string;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

const useTabsContext = () => {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
};

const idOnglet = (base: string, value: string) => `${base}-onglet-${value}`;
const idPanneau = (base: string, value: string) => `${base}-panneau-${value}`;

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, children, className = '' }: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultValue);
  const activeTab = value ?? internalTab;
  // `useId` et non un compteur maison : deux jeux d'onglets peuvent coexister
  // sur une page (une fiche client derrière une modale de configuration), et
  // des identifiants identiques feraient pointer `aria-controls` sur le
  // panneau de l'autre.
  const base = useId();

  const setActiveTab = (val: string) => {
    if (onValueChange) onValueChange(val);
    else setInternalTab(val);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, base }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
  /** Nom du groupe pour les technologies d'assistance (« Onglets de la fiche »). */
  'aria-label'?: string;
}

export function TabsList({ children, className = '', 'aria-label': ariaLabel }: TabsListProps) {
  const { setActiveTab } = useTabsContext();
  const liste = useRef<HTMLDivElement>(null);

  const onglets = () =>
    liste.current ? Array.from(liste.current.querySelectorAll<HTMLElement>('[role="tab"]')) : [];

  /**
   * ⚠️ FILET : IL DOIT TOUJOURS RESTER UN ONGLET ATTEIGNABLE AU CLAVIER.
   *
   * Le `tabIndex` roulant ne laisse dans l'ordre de tabulation que l'onglet
   * actif. Si `activeTab` ne correspond à AUCUN déclencheur — un onglet rendu
   * sous condition qui disparaît alors qu'il est ouvert, comme « Outils » sur
   * une fiche dont `is_lmnp` repasse à faux — plus aucun n'est atteignable, et
   * le groupe entier devient inaccessible au clavier. C'était le seul moyen que
   * cette correction rende les choses PIRES qu'avant.
   *
   * L'effet tourne après chaque rendu, sans tableau de dépendances : React
   * réécrit `tabindex` à chaque fois, la reprise doit passer après lui.
   */
  useEffect(() => {
    const tabs = onglets();
    if (tabs.length > 0 && !tabs.some((t) => t.tabIndex === 0)) {
      tabs[0].tabIndex = 0;
    }
  });

  const auClavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = onglets();
    // La cible peut être l'icône à l'intérieur du bouton.
    const courant = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (!courant) return;
    const index = tabs.indexOf(courant);
    if (index === -1) return;

    let cible: number;
    switch (e.key) {
      // Le bouclage est voulu : le motif ARIA le recommande, et il évite le
      // cul-de-sac silencieux au bout de la rangée.
      case 'ArrowRight': cible = (index + 1) % tabs.length; break;
      case 'ArrowLeft': cible = (index - 1 + tabs.length) % tabs.length; break;
      case 'Home': cible = 0; break;
      case 'End': cible = tabs.length - 1; break;
      default: return;
    }

    e.preventDefault();
    const valeur = tabs[cible].dataset.onglet;
    if (valeur === undefined) return;
    // Le focus AVANT la sélection : le rendu qui suit remet `tabIndex` à -1 sur
    // l'ancien onglet, et un élément qui perd son tabindex pendant qu'il a le
    // focus le garde — l'inverse ferait sauter le focus sur le `<body>`.
    tabs[cible].focus();
    setActiveTab(valeur);
  };

  return (
    <div
      ref={liste}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={auClavier}
      className={`flex space-x-1 border-b border-gray-200 dark:border-gray-700 ${className}`}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className = '' }: TabsTriggerProps) {
  const { activeTab, setActiveTab, base } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      id={idOnglet(base, value)}
      // `aria-controls` SEULEMENT quand l'onglet est actif : `TabsContent`
      // démonte les panneaux inactifs, et une référence vers un identifiant
      // absent du document est une erreur d'accessibilité à part entière — le
      // lecteur d'écran annonce une relation qui ne mène nulle part.
      aria-controls={isActive ? idPanneau(base, value) : undefined}
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      // Lu par la navigation aux flèches, qui travaille sur le DOM : la liste
      // des onglets varie d'un rendu à l'autre (onglets conditionnels), et
      // l'interroger au moment de la frappe évite tout registre à tenir à jour.
      data-onglet={value}
      onClick={() => setActiveTab(value)}
      className={`
        px-4 py-3 font-medium text-sm transition-colors relative
        ${isActive
          ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className = '' }: TabsContentProps) {
  const { activeTab, base } = useTabsContext();

  if (activeTab !== value) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={idPanneau(base, value)}
      aria-labelledby={idOnglet(base, value)}
      // Le panneau est focalisable : après avoir choisi un onglet, la touche
      // Tab doit mener DANS le contenu. Sans cela, un panneau sans élément
      // focalisable — une synthèse en lecture seule — n'est atteignable par
      // aucun moyen clavier.
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
