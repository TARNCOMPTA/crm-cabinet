import { useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { lazyRetryNamed } from '../lib/lazyRetry';
import { PageSkeleton } from '../components/ui/Skeleton';
import {
  User,
  Users,
  Briefcase,
  Lock,
  AlertTriangle,
  Bell,
  PanelLeft,
  Building2,
  Tag,
  FileText,
  Package,
  Landmark,
  Search,
  ChevronRight,
  UserCog,
  ArrowUpCircle,
  Timer,
  Plug,
  ClipboardList,
  Mail,
} from 'lucide-react';

/**
 * Les seize sections, chargees a la demande.
 * ---------------------------------------------------------------------------
 * Elles etaient toutes importees statiquement : ouvrir « Parametres » — ne
 * serait-ce que pour changer son avatar — telechargeait les seize ecrans, dont
 * la gestion des clients incomplets et celle des utilisateurs, les deux plus
 * gros du produit. Un seul est affiche a la fois ; les autres n'ont aucune
 * raison d'etre la.
 *
 * `lazyRetryNamed` plutot que `lazy` : c'est ce que fait deja App.tsx pour les
 * routes, et il rattrape le morceau devenu introuvable apres un deploiement —
 * cas frequent sur une application ouverte toute la journee.
 */
const SettingsProfile = lazyRetryNamed(() => import('./settings/SettingsProfile'), 'SettingsProfile');
const SettingsSecurite = lazyRetryNamed(() => import('./settings/SettingsSecurite'), 'SettingsSecurite');
const SettingsUsers = lazyRetryNamed(() => import('./settings/SettingsUsers'), 'SettingsUsers');
const SettingsMyClients = lazyRetryNamed(() => import('./settings/SettingsMyClients'), 'SettingsMyClients');
const SettingsIncompleteClients = lazyRetryNamed(() => import('./settings/SettingsIncompleteClients'), 'SettingsIncompleteClients');
const SettingsNotifications = lazyRetryNamed(() => import('./settings/SettingsNotifications'), 'SettingsNotifications');
const SettingsMonCabinet = lazyRetryNamed(() => import('./settings/SettingsMonCabinet'), 'SettingsMonCabinet');
const SettingsTaskCategories = lazyRetryNamed(() => import('./settings/SettingsTaskCategories'), 'SettingsTaskCategories');
const SettingsTaskTemplates = lazyRetryNamed(() => import('./settings/SettingsTaskTemplates'), 'SettingsTaskTemplates');
const SettingsSoftware = lazyRetryNamed(() => import('./settings/SettingsSoftware'), 'SettingsSoftware');
const SettingsRegimesFiscaux = lazyRetryNamed(() => import('./settings/SettingsRegimesFiscaux'), 'SettingsRegimesFiscaux');
const SettingsCollaboratorRoles = lazyRetryNamed(() => import('./settings/SettingsCollaboratorRoles'), 'SettingsCollaboratorRoles');
const SettingsMCPConnector = lazyRetryNamed(() => import('./settings/SettingsMCPConnector'), 'SettingsMCPConnector');
const SettingsAGOStatuses = lazyRetryNamed(() => import('./settings/SettingsAGOStatuses'), 'SettingsAGOStatuses');
const SettingsSmtp = lazyRetryNamed(() => import('./settings/SettingsSmtp'), 'SettingsSmtp');
const SettingsNavigation = lazyRetryNamed(() => import('./settings/SettingsNavigation'), 'SettingsNavigation');
const SettingsMiseAJour = lazyRetryNamed(() => import('./settings/SettingsMiseAJour'), 'SettingsMiseAJour');
const SettingsTachesPlanifiees = lazyRetryNamed(() => import('./settings/SettingsTachesPlanifiees'), 'SettingsTachesPlanifiees');


type SettingsItem = {
  key: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
  requiresAdmin?: boolean;
  keywords?: string;
};

type SettingsGroup = {
  key: string;
  title: string;
  description?: string;
  items: SettingsItem[];
};

const GROUPS: SettingsGroup[] = [
  {
    key: 'account',
    title: 'Mon compte',
    description: 'Vos informations personnelles',
    items: [
      {
        key: 'profile',
        label: 'Profil',
        description: 'Nom, email, fonction',
        icon: User,
        component: SettingsProfile,
        keywords: 'profil identite nom prenom email',
      },
      {
        key: 'securite',
        label: 'Securite',
        description: 'Passkeys et appareils autorises',
        icon: Lock,
        component: SettingsSecurite,
        keywords: 'securite passkey appareil authentification connexion',
      },
      {
        key: 'notifications',
        label: 'Notifications',
        description: 'Preferences email et alertes',
        icon: Bell,
        component: SettingsNotifications,
        keywords: 'notifications emails alertes',
      },
      {
        key: 'my-clients',
        label: 'Mes dossiers',
        description: 'Filtres et preferences clients',
        icon: Briefcase,
        component: SettingsMyClients,
        keywords: 'dossiers clients filtre',
      },
      {
        key: 'navigation',
        label: 'Menu de navigation',
        description: 'Afficher ou masquer des menus',
        icon: PanelLeft,
        component: SettingsNavigation,
        keywords: 'menu navigation sidebar barre laterale afficher masquer',
      },
    ],
  },
  {
    key: 'cabinet',
    title: 'Cabinet',
    description: 'Gestion de votre structure',
    items: [
      {
        key: 'mon-cabinet',
        label: 'Informations cabinet',
        description: 'Raison sociale, logo, branding',
        icon: Building2,
        component: SettingsMonCabinet,
        requiresAdmin: true,
        keywords: 'cabinet logo raison sociale adresse',
      },
      {
        key: 'users',
        label: 'Utilisateurs',
        description: 'Collaborateurs et acces',
        icon: Users,
        component: SettingsUsers,
        keywords: 'utilisateurs collaborateurs equipe roles',
      },
      {
        key: 'collaborator-roles',
        label: 'Roles des collaborateurs',
        description: 'Personnaliser les roles assignables sur les dossiers',
        icon: UserCog,
        component: SettingsCollaboratorRoles,
        requiresAdmin: true,
        keywords: 'roles collaborateurs assistant responsable consultant',
      },
      {
        key: 'incomplete-data',
        label: 'Donnees manquantes',
        description: 'Clients avec informations incompletes',
        icon: AlertTriangle,
        component: SettingsIncompleteClients,
        keywords: 'donnees incompletes manquantes clients',
      },
    ],
  },
  {
    key: 'configuration',
    title: 'Configuration',
    description: 'Parametrage du cabinet',
    items: [
      {
        key: 'categories',
        label: 'Categories de taches',
        description: 'Taxonomie des taches',
        icon: Tag,
        component: SettingsTaskCategories,
        keywords: 'categories taches taxonomie',
      },
      {
        key: 'templates',
        label: 'Modèles de tâches',
        description: 'Tâches récurrentes pré-configurées',
        icon: FileText,
        component: SettingsTaskTemplates,
        keywords: 'modeles templates taches',
      },
      {
        key: 'regimes',
        label: 'Regimes fiscaux',
        description: 'Liste personnalisee des regimes',
        icon: Landmark,
        component: SettingsRegimesFiscaux,
        keywords: 'regimes fiscaux impots',
      },
      {
        key: 'ago-statuses',
        label: 'Statuts AGO',
        description: 'Etats d\'avancement des assemblees',
        icon: ClipboardList,
        component: SettingsAGOStatuses,
        requiresAdmin: true,
        keywords: 'ago assemblees avancement statuts juridique',
      },
      {
        key: 'software',
        label: 'Logiciels',
        description: 'Logiciels utilises par le cabinet',
        icon: Package,
        component: SettingsSoftware,
        keywords: 'logiciels software outils',
      },
      {
        key: 'smtp',
        label: 'Serveur email (SMTP)',
        description: 'Configurer l\'envoi d\'emails du cabinet',
        icon: Mail,
        component: SettingsSmtp,
        requiresAdmin: true,
        keywords: 'smtp email serveur envoi configuration mail',
      },
      {
        key: 'mcp-connector',
        label: 'Connecteur IA (MCP)',
        description: 'Connecter un LLM a vos donnees',
        icon: Plug,
        component: SettingsMCPConnector,
        // Ouvert a tout collaborateur : le connecteur n'expose que des outils en
        // LECTURE SEULE, sur des donnees que chacun consulte deja a l'ecran.
        // Chacun n'y gere que SES cles et SES autorisations — c'est le serveur
        // qui le garantit (routes/mcp-cles.ts, routes/mcp-oauth.ts), pas cette
        // ligne : un menu masque n'a jamais ete un controle d'acces.
        keywords: 'mcp connecteur ia llm api cles claude cursor',
      },
      {
        key: 'mise-a-jour',
        label: 'Version et mise a jour',
        description: 'Version de l\'instance et versions publiees',
        icon: ArrowUpCircle,
        component: SettingsMiseAJour,
        requiresAdmin: true,
        keywords: 'version mise a jour maj update changelog nouveautes',
      },
      {
        key: 'taches-planifiees',
        label: 'Taches planifiees',
        description: 'Ce que l\'instance fait toute seule, et son dernier tour',
        icon: Timer,
        component: SettingsTachesPlanifiees,
        // Reserve aux administrateurs, comme les routes qui l'alimentent : le
        // bouton « lancer maintenant » declenche une synchronisation INPI ou un
        // envoi de digests, ce qui sort de la consultation.
        requiresAdmin: true,
        keywords: 'taches planifiees cron ordonnanceur jedeclare digests synchro nocturne',
      },
    ],
  },
];

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const [query, setQuery] = useState('');

  const visibleGroups = useMemo<SettingsGroup[]>(() => {
    const normalized = query.trim().toLowerCase();
    return GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.requiresAdmin && !isAdmin) return false;
        if (!normalized) return true;
        const haystack = `${item.label} ${item.description ?? ''} ${item.keywords ?? ''}`.toLowerCase();
        return haystack.includes(normalized);
      }),
    })).filter((group) => group.items.length > 0);
  }, [isAdmin, query]);

  const allVisibleKeys = useMemo(
    () => visibleGroups.flatMap((g) => g.items.map((i) => i.key)),
    [visibleGroups]
  );

  const tabParam = searchParams.get('tab');
  const activeKey = useMemo(() => {
    if (tabParam && allVisibleKeys.includes(tabParam)) return tabParam;
    return allVisibleKeys[0] ?? 'profile';
  }, [tabParam, allVisibleKeys]);

  function selectItem(key: string) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  }

  const activeItem = useMemo(
    () =>
      GROUPS.flatMap((g) => g.items).find((item) => item.key === activeKey),
    [activeKey]
  );

  const ActiveComponent = activeItem?.component;
  const ActiveIcon = activeItem?.icon;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Paramètres</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Gerez votre compte, votre cabinet et la configuration
        </p>
      </div>

      <div className="lg:hidden mb-4">
        <label htmlFor="settings-mobile-select" className="sr-only">
          Section des parametres
        </label>
        <select
          id="settings-mobile-select"
          value={activeKey}
          onChange={(e) => selectItem(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {visibleGroups.map((group) => (
            <optgroup key={group.key} label={group.title}>
              {group.items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex gap-6">
        <aside className="hidden lg:block w-72 flex-shrink-0">
          <div className="sticky top-20 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un parametre..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <nav className="space-y-5" aria-label="Navigation des parametres">
              {visibleGroups.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 px-2">
                  Aucun parametre ne correspond a votre recherche.
                </p>
              )}
              {visibleGroups.map((group) => (
                <div key={group.key}>
                  <h2 className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {group.title}
                  </h2>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.key === activeKey;
                      return (
                        <li key={item.key}>
                          <button
                            type="button"
                            onClick={() => selectItem(item.key)}
                            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                              isActive
                                ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80'
                            }`}
                            aria-current={isActive ? 'page' : undefined}
                          >
                            <Icon
                              className={`w-4 h-4 flex-shrink-0 ${
                                isActive
                                  ? 'text-teal-600 dark:text-teal-400'
                                  : 'text-gray-400 dark:text-gray-500'
                              }`}
                            />
                            <span className="flex-1 truncate">{item.label}</span>
                            {isActive && (
                              <ChevronRight className="w-3.5 h-3.5 text-teal-500" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          {activeItem && (
            <div className="mb-5 pb-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                {ActiveIcon && (
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex-shrink-0">
                    <ActiveIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {activeItem.label}
                  </h2>
                  {activeItem.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {activeItem.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          {ActiveComponent ? (
            <Suspense fallback={<PageSkeleton />}>
              <ActiveComponent />
            </Suspense>
          ) : null}
        </main>
      </div>
    </div>
  );
}
