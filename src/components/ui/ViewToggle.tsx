import { LayoutGrid, List, Table2 } from 'lucide-react';

export type ViewMode = 'grid' | 'list' | 'table';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const modes: { key: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { key: 'grid', icon: LayoutGrid, label: 'Grille' },
  { key: 'list', icon: List, label: 'Liste' },
  { key: 'table', icon: Table2, label: 'Tableau' },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5">
      {modes.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={label}
          className={`p-1.5 rounded-md transition-colors ${
            value === key
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
