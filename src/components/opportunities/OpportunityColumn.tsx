import { useDroppable } from '@dnd-kit/core';
import { Badge } from '../ui/Badge';
import { getColumnColor, formatEuros } from '../../lib/opportunityService';
import type { OpportunityColumn as OpportunityColumnType } from '../../types/database';

interface Props {
  column: OpportunityColumnType;
  count: number;
  totalAmount: number;
  children: React.ReactNode;
}

export function OpportunityColumn({ column, count, totalAmount, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const colors = getColumnColor(column.color);

  return (
    <div className="flex flex-col min-w-[300px] w-[300px]">
      <div className={`rounded-t-lg border-t-2 ${colors.border} px-4 py-3 ${colors.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{column.name}</h3>
          </div>
          <Badge variant="default" className="text-xs">{count}</Badge>
        </div>
        {totalAmount > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-[18px]">
            {formatEuros(totalAmount)}
          </p>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-b-lg border border-t-0 border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-2 space-y-2 min-h-[200px] transition-colors ${
          isOver ? 'bg-teal-50/60 dark:bg-teal-900/20 border-teal-200 dark:border-teal-700' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}
