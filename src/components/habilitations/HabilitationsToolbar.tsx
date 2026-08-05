import { Search, Globe, Loader2, CheckCircle, RotateCcw, Filter } from 'lucide-react';
import { FILTER_PILLS } from '../../lib/habilitationsConstants';
import type { CompletenessFilter } from '../../types/habilitations';

const AVANCEMENT_OPTIONS = [
  { value: 'all', label: 'Tous les avancements' },
  { value: 'a_faire', label: 'A faire' },
  { value: 'demande', label: 'Demandé' },
  { value: 'complet', label: 'Complet' },
];

interface HabilitationsToolbarProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  filter: CompletenessFilter;
  onFilterChange: (f: CompletenessFilter) => void;
  pillCounts: Record<CompletenessFilter, number>;
  showSyncButton: boolean;
  isLookingUp: boolean;
  lookupDone: boolean;
  lookupProgress: { current: number; total: number };
  onLookupNames: () => void;
  isCustomOrder: boolean;
  isColumnSorted: boolean;
  onResetOrder: () => void;
  displayCount: number;
  totalCount: number;
  avancementFilter: string;
  onAvancementFilterChange: (v: string) => void;
}

export function HabilitationsToolbar({
  searchTerm,
  onSearchChange,
  filter,
  onFilterChange,
  pillCounts,
  showSyncButton,
  isLookingUp,
  lookupDone,
  lookupProgress,
  onLookupNames,
  isCustomOrder,
  isColumnSorted,
  onResetOrder,
  displayCount,
  totalCount,
  avancementFilter,
  onAvancementFilterChange,
}: HabilitationsToolbarProps) {
  return (
    <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Rechercher par nom ou SIREN..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {displayCount}/{totalCount}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill.key}
            onClick={() => onFilterChange(pill.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === pill.key ? pill.activeClass : pill.inactiveClass
            }`}
          >
            {pill.label}
            <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              filter === pill.key ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'
            }`}>
              {pillCounts[pill.key]}
            </span>
          </button>
        ))
        }
        <div className="relative inline-flex items-center">
          <Filter className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <select
            value={avancementFilter}
            onChange={(e) => onAvancementFilterChange(e.target.value)}
            className={`appearance-none pl-8 pr-7 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/30 ${
              avancementFilter !== 'all'
                ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
            }`}
          >
            {AVANCEMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <svg className="absolute right-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {showSyncButton && !lookupDone && (
          <button
            onClick={onLookupNames}
            disabled={isLookingUp}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-all disabled:opacity-60 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700 dark:hover:bg-teal-900/50"
          >
            {isLookingUp ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {lookupProgress.current}/{lookupProgress.total}
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5" />
                Synchroniser les noms (INPI)
              </>
            )}
          </button>
        )}
        {showSyncButton && lookupDone && (
          <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">
            <CheckCircle className="w-3.5 h-3.5" />
            Noms synchronises
          </span>
        )}
      </div>

      {isLookingUp && (
        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-300"
            style={{ width: `${lookupProgress.total > 0 ? Math.round((lookupProgress.current / lookupProgress.total) * 100) : 0}%` }}
          />
        </div>
      )}

      {(isCustomOrder || isColumnSorted) && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">
            {isColumnSorted ? 'Tri par colonne actif' : 'Ordre personnalise actif'}
          </span>
          <button
            onClick={onResetOrder}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reinitialiser
          </button>
        </div>
      )}
    </div>
  );
}
