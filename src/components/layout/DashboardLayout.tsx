import { useState, useEffect, useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { CommandPalette } from '../CommandPalette';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp';
import { NotificationCenter } from '../NotificationCenter';
import { SyncJobsIndicator } from '../SyncJobsIndicator';
import {
  LayoutDashboard,
  Briefcase,
  Scale,
  CheckSquare,
  ClipboardList,
  BarChart3,
  Shield,
  Monitor,
  FileWarning,
  Globe,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Building2,
  Moon,
  Sun,
  Keyboard,
  Wrench,
  BookUser,
  Target,
  Receipt,
  CalendarClock,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { VERSION_FRONT } from '../../lib/versionService';
import { supabase } from '../../lib/supabase';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';

const navSections = [
  {
    label: null,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
    ],
  },
  {
    label: 'Gestion',
    items: [
      { to: '/clients', icon: Briefcase, label: 'Clients' },
      { to: '/opportunities', icon: Target, label: 'Opportunités' },
      { to: '/tasks', icon: CheckSquare, label: 'Tâches' },
      { to: '/checklists', icon: ClipboardList, label: 'Checklists' },
      { to: '/relances', icon: Receipt, label: 'Relances' },
    ],
  },
  {
    label: 'Fiscal & Juridique',
    items: [
      { to: '/balance-sheets', icon: BarChart3, label: 'Bilans' },
      { to: '/revenue-declarations', icon: FileSpreadsheet, label: 'Déclarations revenus' },
      { to: '/suivi-echeances', icon: CalendarClock, label: 'Suivi échéances' },
      { to: '/legal', icon: Scale, label: 'Juridique' },
      { to: '/exemptions', icon: FileWarning, label: 'Exonérations' },
      { to: '/tax-authorizations', icon: Shield, label: 'Habilitations' },
    ],
  },
  {
    label: 'Ressources',
    items: [
      { to: '/annuaire', icon: BookUser, label: 'Annuaire' },
      { to: '/directory', icon: Globe, label: 'Liens utiles' },
      { to: '/software', icon: Monitor, label: 'Logiciels' },
      { to: '/outils', icon: Wrench, label: 'Outils' },
    ],
  },
  {
    label: null,
    items: [
      { to: '/settings', icon: Settings, label: 'Paramètres' },
    ],
  },
];

const SIDEBAR_COLLAPSED_KEY = 'crm.sidebar.collapsed';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  const [cabinetLogoUrl, setCabinetLogoUrl] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  };
  const { signOut, profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { getPreference } = useUserPreferences();
  const hiddenNavItems = getPreference('navigation.hiddenItems', []) as string[];
  const visibleNavSections = useMemo(
    () => navSections.map(section => ({
      ...section,
      items: section.items.filter((item) => !hiddenNavItems.includes(item.to)),
    })).filter(section => section.items.length > 0),
    [hiddenNavItems]
  );

  useEffect(() => {
    if (profile) {
      supabase
        .from('cabinets')
        .select('logo_url')
        .order('created_at')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setCabinetLogoUrl(data?.logo_url ?? null));
    }
  }, [profile]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isModK) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      const isModB = (e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B');
      if (isModB) {
        e.preventDefault();
        toggleSidebarCollapsed();
        return;
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const isEditable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (target?.isContentEditable ?? false);
        if (isEditable) return;
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-transparent">
      <div
        className={`fixed inset-0 bg-black/50 dark:bg-black/70 dark:backdrop-blur-sm z-20 lg:hidden ${
          sidebarOpen ? 'block' : 'hidden'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-white/95 backdrop-blur-lg dark:bg-ink-900/80 dark:backdrop-blur-xl border-r border-gray-200/60 dark:border-white/[0.06] transform transition-transform duration-200 ease-in-out shadow-sm dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)] ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'lg:-translate-x-full' : 'lg:translate-x-0'}`}
        aria-hidden={sidebarCollapsed ? 'true' : undefined}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              {cabinetLogoUrl ? (
                <img
                  src={cabinetLogoUrl}
                  alt="Logo cabinet"
                  className="w-10 h-10 rounded-lg object-contain border border-gray-200 dark:border-white/10 bg-white dark:bg-ink-800"
                  onError={() => setCabinetLogoUrl(null)}
                />
              ) : (
                <div className="flex items-center justify-center w-10 h-10 bg-teal-600 dark:bg-gradient-to-br dark:from-cyan-400 dark:to-teal-500 rounded-lg dark:shadow-glow-cyan-sm">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
              )}
              <span className="font-bold text-xl text-gray-900 dark:text-white">
                CRM Cabinet
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <nav className="flex-1 px-4 py-3 overflow-y-auto">
            {visibleNavSections.map((section, sIdx) => (
              <div key={sIdx} className={sIdx > 0 ? 'mt-5' : ''}>
                {section.label && (
                  <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {section.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? 'bg-teal-50 text-teal-700 shadow-sm dark:bg-cyan-400/10 dark:text-cyan-200 dark:shadow-[inset_2px_0_0_0_rgb(34,211,238)]'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-white'
                          }`
                        }
                        onClick={() => setSidebarOpen(false)}
                      >
                        <Icon className="w-[18px] h-[18px]" />
                        <span className="flex-1">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="px-4 py-4 border-t border-gray-200 dark:border-white/[0.06]">
            <div className="px-3 py-2 bg-gray-50 dark:bg-white/[0.03] dark:ring-1 dark:ring-white/[0.06] rounded-lg mb-2">
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                {profile?.prenom} {profile?.nom}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{profile?.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-teal-100 text-teal-800 dark:bg-cyan-400/10 dark:text-cyan-200 dark:ring-1 dark:ring-cyan-400/20">
                {profile?.role === 'admin' ? 'Administrateur' : 'Utilisateur'}
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="flex-1 justify-start text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Deconnexion
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="text-gray-500 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-cyan-200"
                aria-label="Basculer le theme"
              >
                <span key={theme} className="inline-flex animate-icon-spin">
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </span>
              </Button>
            </div>

            {/*
              La version, en clair et en permanence.

              Elle n'etait affichee NULLE PART : impossible de savoir ce qu'une
              instance execute sans ouvrir un terminal, ni de dire au telephone
              « je suis en 2.0.1 » quand quelque chose ne va pas. Elle vient du
              bundle, figee a la construction : c'est le code que CE navigateur
              execute, ce qu'aucune requete au serveur ne saurait dire.
            */}
            <p className="mt-2 px-3 text-[11px] text-gray-400 dark:text-slate-500 font-mono">
              v{VERSION_FRONT}
            </p>
          </div>
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ease-in-out ${sidebarCollapsed ? 'lg:pl-0' : 'lg:pl-64'}`}>        <header className="sticky top-0 z-10 bg-white/85 dark:bg-ink-900/60 backdrop-blur-xl dark:backdrop-saturate-150 border-b border-gray-200/60 dark:border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-6 h-6" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebarCollapsed}
              className="hidden lg:inline-flex text-gray-500 dark:text-slate-300 dark:hover:text-cyan-200"
              aria-label={sidebarCollapsed ? 'Afficher la barre laterale' : 'Masquer la barre laterale'}
              title={`${sidebarCollapsed ? 'Afficher' : 'Masquer'} la barre laterale (Ctrl+B)`}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-5 h-5" />
              ) : (
                <PanelLeftClose className="w-5 h-5" />
              )}
            </Button>
            {/*
              La barre de recherche de l'en-tete a ete retiree : large, au centre
              et en tete de page, elle se lisait comme la fonction principale de
              l'ecran alors qu'elle n'en est qu'un raccourci.

              La palette reste ouverte par Ctrl+K — le raccourci vit dans le
              gestionnaire de touches plus haut, pas ici — et l'aide des
              raccourcis (l'icone clavier, ou « ? ») continue de l'annoncer. Ne
              pas remplacer ce vide par un bouton discret sans le demander : ce
              qui derangeait, c'etait sa presence, pas sa taille.
            */}
            <div className="flex-1" />
            <SyncJobsIndicator />
            <NotificationCenter />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShortcutsOpen(true)}
              className="hidden sm:inline-flex text-gray-500 dark:text-slate-300 dark:hover:text-cyan-200"
              aria-label="Raccourcis clavier"
              title="Raccourcis clavier (?)"
            >
              <Keyboard className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="lg:hidden text-gray-500 dark:text-slate-300 dark:hover:text-cyan-200"
              aria-label="Basculer le theme"
            >
              <span key={theme} className="inline-flex animate-icon-spin">
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </span>
            </Button>
          </div>
        </header>

        <main className="p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <KeyboardShortcutsHelp
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
