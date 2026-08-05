import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Users, ChevronRight } from 'lucide-react';
import type { ClientStatusCounts, RegimeFiscalCount, FormeJuridiqueCount } from '../../lib/dashboardService';

const STATUS_CONFIG: { key: keyof ClientStatusCounts; label: string; color: string; bg: string }[] = [
  { key: 'actif', label: 'Actifs', color: 'bg-teal-500', bg: 'bg-teal-50 dark:bg-teal-950/30' },
  { key: 'prospect', label: 'Prospects', color: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' },
  { key: 'inactif', label: 'Inactifs', color: 'bg-gray-400', bg: 'bg-gray-50 dark:bg-gray-800' },
  { key: 'archive', label: 'Archives', color: 'bg-slate-300', bg: 'bg-slate-50 dark:bg-slate-800/50' },
];

interface DashboardClientOverviewProps {
  statusCounts: ClientStatusCounts;
  regimeFiscalCounts: RegimeFiscalCount[];
  formeJuridiqueCounts: FormeJuridiqueCount[];
  loading?: boolean;
}

export function DashboardClientOverview({
  statusCounts,
  regimeFiscalCounts,
  formeJuridiqueCounts,
  loading,
}: DashboardClientOverviewProps) {
  const navigate = useNavigate();
  const total = Object.values(statusCounts).reduce((sum, v) => sum + v, 0);
  const maxRegime = regimeFiscalCounts.length > 0 ? regimeFiscalCounts[0].count : 1;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Portefeuille clients
          </h3>
        </div>
        <button
          onClick={() => navigate('/clients')}
          className="flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
        >
          Voir tout <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Par statut
          </p>
          {total > 0 ? (
            <>
              <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 mb-2">
                {STATUS_CONFIG.map(s => {
                  const count = statusCounts[s.key];
                  if (count === 0) return null;
                  const pct = (count / total) * 100;
                  return (
                    <div
                      key={s.key}
                      className={`${s.color} transition-all duration-500`}
                      style={{ width: `${pct}%`, minWidth: count > 0 ? '6px' : '0' }}
                      title={`${s.label}: ${count}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {STATUS_CONFIG.map(s => {
                  const count = statusCounts[s.key];
                  if (count === 0) return null;
                  return (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${s.color}`} />
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {s.label}
                      </span>
                      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">Aucun client</p>
          )}
        </div>

        {regimeFiscalCounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Par regime fiscal
            </p>
            <div className="space-y-1.5">
              {regimeFiscalCounts.map(r => (
                <div key={r.regime} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-12 flex-shrink-0">
                    {r.regime}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-500/70 dark:bg-teal-600/60 transition-all duration-500"
                      style={{ width: `${(r.count / maxRegime) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 w-6 text-right">
                    {r.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {formeJuridiqueCounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Top formes juridiques
            </p>
            <div className="space-y-1">
              {formeJuridiqueCounts.map((f, i) => (
                <div key={f.forme} className="flex items-center gap-2 py-1">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 w-4 text-right">
                    {i + 1}.
                  </span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">
                    {f.forme}
                  </span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                    {f.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
