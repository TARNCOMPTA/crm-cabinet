import { CheckCircle2, AlertTriangle, ShieldOff, Ban } from 'lucide-react';
import { getProgressColor } from '../../lib/habilitationsConstants';
import type { CompletenessResult } from '../../types/habilitations';

interface HabilitationsProgressCellProps {
  isNonConcerne: boolean;
  isWithout: boolean;
  completeness: CompletenessResult;
}

export function HabilitationsProgressCell({ isNonConcerne, isWithout, completeness }: HabilitationsProgressCellProps) {
  if (isNonConcerne) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
        <Ban className="w-3 h-3" />
        Non concerne
      </span>
    );
  }

  if (isWithout) {
    return (
      <div className="w-36">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">0%</span>
          <span className="text-xs text-gray-400">0/{completeness.total}</span>
        </div>
        <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-red-400" style={{ width: '0%' }} />
        </div>
        <div className="flex items-center gap-1 mt-1">
          <ShieldOff className="w-3 h-3 text-red-500" />
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400">Non couvert</span>
        </div>
      </div>
    );
  }

  const { percentage, count, total, missing } = completeness;
  const colors = getProgressColor(percentage);

  return (
    <div className="w-36">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold ${colors.text}`}>{percentage}%</span>
        <span className="text-xs text-gray-400">{count}/{total}</span>
      </div>
      <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {percentage === 100 && (
        <div className="flex items-center gap-1 mt-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Complet</span>
        </div>
      )}
      {percentage < 40 && (
        <div className="flex items-center gap-1 mt-1">
          <AlertTriangle className="w-3 h-3 text-red-500" />
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
            {missing.length} manquant{missing.length > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
