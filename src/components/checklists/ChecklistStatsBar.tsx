import { CheckSquare, Square, ClipboardList, TrendingUp } from 'lucide-react';
import type { ChecklistWithItems } from '../../lib/checklistService';

interface Props {
  checklists: ChecklistWithItems[];
}

export function ChecklistStatsBar({ checklists }: Props) {
  const totalChecklists = checklists.length;
  const totalItems = checklists.reduce((sum, c) => sum + c.items.length, 0);
  const checkedItems = checklists.reduce(
    (sum, c) => sum + c.items.filter((it) => it.is_checked).length,
    0
  );
  const pendingItems = totalItems - checkedItems;
  const overallProgress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
  const completedChecklists = checklists.filter(
    (c) => c.items.length > 0 && c.items.every((it) => it.is_checked)
  ).length;

  const stats = [
    {
      label: 'Checklists',
      value: totalChecklists,
      icon: ClipboardList,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Terminees',
      value: completedChecklists,
      icon: CheckSquare,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    {
      label: 'En attente',
      value: pendingItems,
      icon: Square,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
    },
    {
      label: 'Progression',
      value: `${overallProgress}%`,
      icon: TrendingUp,
      color: overallProgress >= 75
        ? 'text-emerald-600 dark:text-emerald-400'
        : overallProgress >= 50
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400',
      bg: overallProgress >= 75
        ? 'bg-emerald-50 dark:bg-emerald-950/30'
        : overallProgress >= 50
        ? 'bg-amber-50 dark:bg-amber-950/30'
        : 'bg-red-50 dark:bg-red-950/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl"
        >
          <div className={`p-2 rounded-lg ${stat.bg}`}>
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">
              {stat.value}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {stat.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
