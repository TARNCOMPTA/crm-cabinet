import { Search, ArrowUpDown } from 'lucide-react';

export type ViewMode = 'all' | 'mine' | 'shared';
export type SortMode = 'recent' | 'alpha' | 'progress_asc' | 'progress_desc';

interface Props {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  counts: { all: number; mine: number; shared: number };
}

const viewModeOptions: Array<{ key: ViewMode; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'mine', label: 'Personnelles' },
  { key: 'shared', label: 'Partagees' },
];

const sortOptions: Array<{ key: SortMode; label: string }> = [
  { key: 'recent', label: 'Plus recentes' },
  { key: 'alpha', label: 'Alphabetique' },
  { key: 'progress_asc', label: 'Progression croissante' },
  { key: 'progress_desc', label: 'Progression decroissante' },
];

export function ChecklistFiltersBar({
  viewMode,
  onViewModeChange,
  sortMode,
  onSortModeChange,
  searchQuery,
  onSearchChange,
  counts,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      {/* View mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {viewModeOptions.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onViewModeChange(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150 ${
              viewMode === key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
            <span className={`ml-1.5 text-[11px] ${
              viewMode === key ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'
            }`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher..."
          className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-shadow"
        />
      </div>

      {/* Sort */}
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value as SortMode)}
            className="text-sm bg-transparent border-none outline-none text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-white pr-4"
          >
            {sortOptions.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
