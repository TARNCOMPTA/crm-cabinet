import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { BarChart3, ChevronRight } from 'lucide-react';
import type { BilanProgressData } from '../../lib/dashboardService';

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  gray: { bg: 'bg-gray-400', text: 'text-gray-600' },
  blue: { bg: 'bg-sky-500', text: 'text-sky-600' },
  yellow: { bg: 'bg-amber-400', text: 'text-amber-600' },
  green: { bg: 'bg-emerald-500', text: 'text-emerald-600' },
  red: { bg: 'bg-red-500', text: 'text-red-600' },
  orange: { bg: 'bg-orange-500', text: 'text-orange-600' },
  teal: { bg: 'bg-teal-500', text: 'text-teal-600' },
  cyan: { bg: 'bg-cyan-500', text: 'text-cyan-600' },
  pink: { bg: 'bg-pink-500', text: 'text-pink-600' },
  lime: { bg: 'bg-lime-500', text: 'text-lime-600' },
};

function getColorClass(color: string): { bg: string; text: string } {
  return COLOR_MAP[color] || COLOR_MAP.gray;
}

interface DashboardBilanProgressProps {
  data: BilanProgressData[];
  loading?: boolean;
}

export function DashboardBilanProgress({ data, loading }: DashboardBilanProgressProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-6 animate-pulse">
            {[1, 2].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Progression des bilans
          </h3>
        </div>
        <button
          onClick={() => navigate('/balance-sheets')}
          className="flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
        >
          Voir tout <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-8">
            <BarChart3 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucun bilan en cours</p>
            <button
              onClick={() => navigate('/balance-sheets')}
              className="mt-2 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              Creer un bilan
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {data.map(regime => {
              const lastCol = regime.columns[regime.columns.length - 1];
              const doneCount = lastCol?.count || 0;
              return (
                <div key={regime.regime_fiscal}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {regime.regime_fiscal}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {doneCount}/{regime.total} termines
                    </span>
                  </div>

                  <div className="flex h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {regime.columns.map(col => {
                      if (col.count === 0) return null;
                      const pct = (col.count / regime.total) * 100;
                      const colors = getColorClass(col.color);
                      return (
                        <div
                          key={col.id}
                          className={`${colors.bg} relative group transition-all duration-300`}
                          style={{ width: `${pct}%`, minWidth: col.count > 0 ? '8px' : '0' }}
                          title={`${col.name}: ${col.count}`}
                        >
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {pct > 12 && (
                              <span className="text-[10px] font-bold text-white drop-shadow-sm">
                                {col.count}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                    {regime.columns.filter(c => c.count > 0).map(col => {
                      const colors = getColorClass(col.color);
                      return (
                        <div key={col.id} className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            {col.name} ({col.count})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
