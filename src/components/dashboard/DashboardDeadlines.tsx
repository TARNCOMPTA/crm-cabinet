import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Clock, CalendarDays, ChevronRight } from 'lucide-react';
import type { DeadlineItem } from '../../lib/dashboardService';

function formatDateFR(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getDaysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getDotColor(date: Date): string {
  const days = getDaysUntil(date);
  if (days < 0) return 'bg-red-500';
  if (days <= 7) return 'bg-red-500';
  if (days <= 30) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getTypeLabel(type: DeadlineItem['type']): { text: string; className: string } {
  switch (type) {
    case 'cloture':
      return { text: 'Cloture', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' };
    case 'ag':
      return { text: 'AG', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' };
    case 'tache':
      return { text: 'Tache', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' };
  }
}

interface DashboardDeadlinesProps {
  deadlines: DeadlineItem[];
  loading?: boolean;
}

export function DashboardDeadlines({ deadlines, loading }: DashboardDeadlinesProps) {
  const navigate = useNavigate();
  const displayed = deadlines.slice(0, 8);
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const countNext30 = deadlines.filter(d => d.date <= thirtyDaysFromNow).length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-44 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
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
          <CalendarDays className="w-5 h-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Echeances a venir
          </h3>
          {countNext30 > 0 && (
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              {countNext30} sous 30j
            </span>
          )}
        </div>
        <button
          onClick={() => navigate('/clients')}
          className="flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
        >
          Voir tout <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </CardHeader>
      <CardContent>
        {displayed.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucune echeance prochaine</p>
          </div>
        ) : (
          <div className="space-y-1">
            {displayed.map(item => {
              const dotColor = getDotColor(item.date);
              const typeInfo = getTypeLabel(item.type);
              const daysUntil = getDaysUntil(item.date);
              const isPast = daysUntil < 0;

              return (
                <button
                  key={item.id}
                  onClick={() => item.clientId && navigate(`/clients/${item.clientId}`)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
                >
                  <div className="flex flex-col items-center w-10 flex-shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {item.clientName}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeInfo.className}`}>
                        {typeInfo.text}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {item.label}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-medium ${isPast ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
                      {formatDateFR(item.date)}
                    </span>
                    <p className={`text-[10px] ${isPast ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {isPast ? `${Math.abs(daysUntil)}j en retard` : daysUntil === 0 ? "Aujourd'hui" : `dans ${daysUntil}j`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
