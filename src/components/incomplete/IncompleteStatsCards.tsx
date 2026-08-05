import {
  AlertTriangle, FileText, Hash, Scale, Receipt,
  Calendar, Package, MoreHorizontal, Flame,
} from 'lucide-react';
import type { TrackedFieldKey } from '../../lib/incompleteFieldsConfig';
import { SECONDARY_STAT_FIELDS } from '../../lib/incompleteFieldsConfig';

interface StatCardDef {
  key: TrackedFieldKey | 'all' | 'others' | 'critical';
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bgColor: string;
}

const STAT_CARDS: StatCardDef[] = [
  { key: 'all', label: 'Total incomplets', icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  { key: 'critical', label: 'Clients critiques', icon: Flame, color: 'text-red-600', bgColor: 'bg-red-100' },
  { key: 'numero_dossier', label: 'Sans N\u00b0 Dossier', icon: FileText, color: 'text-rose-600', bgColor: 'bg-rose-100' },
  { key: 'siren', label: 'Sans SIREN', icon: Hash, color: 'text-sky-600', bgColor: 'bg-sky-100' },
  { key: 'forme_juridique', label: 'Sans Forme juridique', icon: Scale, color: 'text-teal-600', bgColor: 'bg-teal-100' },
  { key: 'regime_fiscal', label: 'Sans Regime fiscal', icon: Receipt, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  { key: 'date_cloture', label: 'Sans Date cloture', icon: Calendar, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  { key: 'software', label: 'Sans Logiciel', icon: Package, color: 'text-gray-600', bgColor: 'bg-gray-200' },
  { key: 'others', label: 'Autres champs', icon: MoreHorizontal, color: 'text-slate-600', bgColor: 'bg-slate-100' },
];

interface IncompleteStatsCardsProps {
  totalIncomplete: number;
  criticalCount: number;
  fieldCounts: Map<TrackedFieldKey, number>;
  othersCount: number;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export function IncompleteStatsCards({
  totalIncomplete,
  criticalCount,
  fieldCounts,
  othersCount,
  activeFilter,
  onFilterChange,
}: IncompleteStatsCardsProps) {
  function getCount(key: string): number {
    if (key === 'all') return totalIncomplete;
    if (key === 'critical') return criticalCount;
    if (key === 'others') return othersCount;
    return fieldCounts.get(key as TrackedFieldKey) || 0;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {STAT_CARDS.map(card => {
        const count = getCount(card.key);
        const isActive = activeFilter === card.key;
        const Icon = card.icon;
        return (
          <button
            key={card.key}
            onClick={() => onFilterChange(isActive ? 'all' : card.key)}
            className={`bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-all text-left ${
              isActive && card.key !== 'all'
                ? 'ring-2 ring-teal-500 border-teal-300'
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">{card.label}</p>
                <p className={`text-2xl font-semibold ${count > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                  {count}
                </p>
              </div>
              <div className={`w-10 h-10 ${card.bgColor} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export { SECONDARY_STAT_FIELDS };
