import { useDroppable } from '@dnd-kit/core';
import { getColumnColor } from '../../lib/bilanService';
import type { BilanColumn as BilanColumnType } from '../../types/database';

interface BilanColumnProps {
  column: BilanColumnType;
  count: number;
  children: React.ReactNode;
}

export function BilanColumn({ column, count, children }: BilanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const colors = getColumnColor(column.color);

  return (
    <div className="flex flex-col min-w-[280px] w-[300px] shrink-0">
      <div className={`rounded-t-xl border-t-[3px] ${colors.border} px-4 py-3 ${colors.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} ring-2 ring-white dark:ring-gray-900`} />
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{column.name}</h3>
          </div>
          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
            {count}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-b-xl border border-t-0 p-2.5 space-y-2.5 min-h-[250px] transition-all duration-200 ${
          isOver
            ? 'bg-teal-50/80 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700 ring-2 ring-teal-200 dark:ring-teal-800 ring-inset'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
