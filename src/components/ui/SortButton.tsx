import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

interface SortButtonProps {
  label: string;
  field: string;
  activeField: string;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
}

export function SortButton({ label, field, activeField, direction, onSort }: SortButtonProps) {
  const isActive = activeField === field;

  return (
    <button
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all select-none ${
        isActive
          ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-700'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
      }`}
    >
      {label}
      {isActive ? (
        direction === 'asc' ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )
      ) : (
        <ChevronsUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

interface SortSelectProps {
  options: { value: string; label: string }[];
  activeField: string;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
}

export function SortSelect({ options, activeField, direction, onSort }: SortSelectProps) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">Trier par</span>
      <select
        value={activeField}
        onChange={(e) => onSort(e.target.value)}
        className="text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        onClick={() => onSort(activeField)}
        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        title={direction === 'asc' ? 'Croissant' : 'Decroissant'}
      >
        {direction === 'asc' ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

interface SortableThProps {
  label: string;
  field: string;
  activeField: string;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
}

export function SortableTh({ label, field, activeField, direction, onSort, className = '' }: SortableThProps) {
  const isActive = activeField === field;

  return (
    <th
      className={`text-left px-4 py-2.5 font-medium cursor-pointer select-none transition-colors ${
        isActive ? 'text-teal-700 dark:text-teal-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
      } ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}
