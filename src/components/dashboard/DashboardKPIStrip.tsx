import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../ui/Card';
import { KPIConfigModal, KPIConfig } from './KPIConfigModal';
import { Briefcase, BarChart3, Calendar, Clock, Shield, FileText, Settings2, Target, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface KPIData {
  clientsActifs: number;
  bilansEnCours: number;
  assemblesPlanifiees: number;
  echeancesProches: number;
  habilitationsActives: number;
  legalActsRecent: number;
  tasksEnCours: number;
  opportunitesEnCours: number;
}

interface KPICardDef {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  darkBg: string;
  link: string;
  getValue: (data: KPIData) => number;
}

const ALL_KPIS: KPICardDef[] = [
  {
    id: 'clients',
    label: 'Clients actifs',
    icon: Briefcase,
    color: 'text-teal-600 dark:text-teal-400',
    bg: 'bg-teal-50',
    darkBg: 'dark:bg-teal-950/40',
    link: '/clients',
    getValue: d => d.clientsActifs,
  },
  {
    id: 'bilans',
    label: 'Bilans en cours',
    icon: BarChart3,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50',
    darkBg: 'dark:bg-amber-950/40',
    link: '/balance-sheets',
    getValue: d => d.bilansEnCours,
  },
  {
    id: 'assemblies',
    label: 'AG planifiees',
    icon: Calendar,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50',
    darkBg: 'dark:bg-green-950/40',
    link: '/legal',
    getValue: d => d.assemblesPlanifiees,
  },
  {
    id: 'deadlines',
    label: 'Échéances proches',
    icon: Clock,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50',
    darkBg: 'dark:bg-red-950/40',
    link: '/fiscal-deadlines?filter=proche',
    getValue: d => d.echeancesProches,
  },
  {
    id: 'habilitations',
    label: 'Habilitations actives',
    icon: Shield,
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-50',
    darkBg: 'dark:bg-sky-950/40',
    link: '/tax-authorizations',
    getValue: d => d.habilitationsActives,
  },
  {
    id: 'legal',
    label: 'Actes recents',
    icon: FileText,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50',
    darkBg: 'dark:bg-slate-800/40',
    link: '/legal',
    getValue: d => d.legalActsRecent,
  },
  {
    id: 'opportunities',
    label: 'Opportunités',
    icon: Target,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50',
    darkBg: 'dark:bg-orange-950/40',
    link: '/opportunities',
    getValue: d => d.opportunitesEnCours,
  },
];

const STORAGE_KEY_PREFIX = 'dashboard_kpi_config_';

function loadConfig(userId: string): KPIConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (raw) {
      const parsed = JSON.parse(raw) as KPIConfig[];
      const existingIds = new Set(ALL_KPIS.map(k => k.id));
      const filtered = parsed.filter(p => existingIds.has(p.id));
      for (const kpi of ALL_KPIS) {
        if (!filtered.find(f => f.id === kpi.id)) {
          filtered.push({ id: kpi.id, label: kpi.label, visible: true });
        }
      }
      return filtered;
    }
  } catch { /* ignore */ }
  return ALL_KPIS.map(k => ({ id: k.id, label: k.label, visible: true }));
}

function saveConfig(userId: string, config: KPIConfig[]) {
  localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(config));
}

interface DashboardKPIStripProps {
  data: KPIData;
  userId: string;
  loading?: boolean;
}

export function DashboardKPIStrip({ data, userId, loading }: DashboardKPIStripProps) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<KPIConfig[]>(() => loadConfig(userId));
  const [configOpen, setConfigOpen] = useState(false);

  const visibleKPIs = config
    .filter(c => c.visible)
    .map(c => ALL_KPIS.find(k => k.id === c.id))
    .filter(Boolean) as KPICardDef[];

  function handleSaveConfig(newConfig: KPIConfig[]) {
    setConfig(newConfig);
    saveConfig(userId, newConfig);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-5">
              <div className="animate-pulse space-y-3">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div />
        <button
          onClick={() => setConfigOpen(true)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          title="Configurer les indicateurs"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      <div className={`grid gap-4 ${
        visibleKPIs.length <= 3
          ? 'grid-cols-1 md:grid-cols-3'
          : visibleKPIs.length <= 4
          ? 'grid-cols-2 md:grid-cols-4'
          : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
      }`}>
        {visibleKPIs.map(kpi => {
          const Icon = kpi.icon;
          const value = kpi.getValue(data);
          return (
            <Card
              key={kpi.id}
              className="group cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <CardContent className="py-5">
                <button
                  onClick={() => navigate(kpi.link)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 truncate">
                        {kpi.label}
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {value}
                      </p>
                    </div>
                    <div className={`p-2.5 rounded-xl ${kpi.bg} ${kpi.darkBg} group-hover:scale-110 transition-transform duration-200`}>
                      <Icon className={`w-5 h-5 ${kpi.color}`} />
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                  </div>
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <KPIConfigModal
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        config={config}
        onSave={handleSaveConfig}
      />
    </>
  );
}
