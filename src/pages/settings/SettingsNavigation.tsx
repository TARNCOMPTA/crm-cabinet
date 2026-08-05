import { useUserPreferences } from '../../contexts/UserPreferencesContext';
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
  Wrench,
  BookUser,
  Target,
  Receipt,
  CalendarClock,
  FileSpreadsheet,
  Eye,
  EyeOff,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord', locked: true },
  { to: '/directory', icon: Globe, label: 'Liens utiles' },
  { to: '/annuaire', icon: BookUser, label: 'Annuaire' },
  { to: '/clients', icon: Briefcase, label: 'Clients' },
  { to: '/opportunities', icon: Target, label: 'Opportunités' },
  { to: '/tasks', icon: CheckSquare, label: 'Tâches' },
  { to: '/checklists', icon: ClipboardList, label: 'Checklists' },
  { to: '/balance-sheets', icon: BarChart3, label: 'Bilans' },
  { to: '/revenue-declarations', icon: FileSpreadsheet, label: 'Déclarations de revenus' },
  { to: '/suivi-echeances', icon: CalendarClock, label: 'Suivi échéances' },
  { to: '/relances', icon: Receipt, label: 'Relances' },
  { to: '/legal', icon: Scale, label: 'Juridique' },
  { to: '/exemptions', icon: FileWarning, label: 'Exonérations' },
  { to: '/tax-authorizations', icon: Shield, label: 'Habilitations' },
  { to: '/software', icon: Monitor, label: 'Logiciels' },
  { to: '/outils', icon: Wrench, label: 'Outils' },
  { to: '/settings', icon: Settings, label: 'Paramètres', locked: true },
];

export function SettingsNavigation() {
  const { getPreference, setPreference } = useUserPreferences();
  const hiddenItems = (getPreference('navigation.hiddenItems', []) as string[]);

  const toggleItem = (to: string) => {
    const isHidden = hiddenItems.includes(to);
    const next = isHidden
      ? hiddenItems.filter((item) => item !== to)
      : [...hiddenItems, to];
    setPreference('navigation.hiddenItems', next);
  };

  const showAll = () => setPreference('navigation.hiddenItems', []);
  const hideAllOptional = () => {
    const optional = NAV_ITEMS.filter((i) => !i.locked).map((i) => i.to);
    setPreference('navigation.hiddenItems', optional);
  };

  const visibleCount = NAV_ITEMS.length - hiddenItems.length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Menu de navigation
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Choisissez les éléments à afficher dans la barre latérale.
          Les éléments masqués restent accessibles via la recherche.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600 dark:text-slate-300">
          {visibleCount} / {NAV_ITEMS.length} éléments visibles
        </span>
        <div className="flex gap-2">
          <button
            onClick={showAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-white/10 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Tout afficher
          </button>
          <button
            onClick={hideAllOptional}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-white/10 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <EyeOff className="w-3.5 h-3.5" />
            Tout masquer
          </button>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-white/[0.08] rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-white/[0.06]">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isHidden = hiddenItems.includes(item.to);
          const isLocked = item.locked;

          return (
            <div
              key={item.to}
              className={`flex items-center justify-between px-4 py-3 transition-colors ${
                isHidden
                  ? 'bg-gray-50/50 dark:bg-white/[0.02]'
                  : 'bg-white dark:bg-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-5 h-5 ${
                    isHidden
                      ? 'text-gray-300 dark:text-slate-600'
                      : 'text-teal-600 dark:text-cyan-400'
                  }`}
                />
                <span
                  className={`text-sm font-medium ${
                    isHidden
                      ? 'text-gray-400 dark:text-slate-500'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {item.label}
                </span>
                {isLocked && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
                    requis
                  </span>
                )}
              </div>

              {!isLocked && (
                <button
                  onClick={() => toggleItem(item.to)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:focus:ring-cyan-400/30 ${
                    isHidden
                      ? 'bg-gray-200 dark:bg-white/10'
                      : 'bg-teal-600 dark:bg-cyan-500'
                  }`}
                  aria-label={isHidden ? `Afficher ${item.label}` : `Masquer ${item.label}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                      isHidden ? 'translate-x-1' : 'translate-x-6'
                    }`}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
