import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../ui/Card';
import {
  Activity,
  UserPlus,
  RefreshCw,
  FileText,
  Building,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { ActivityItem } from '../../lib/dashboardService';

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return "A l'instant";
  if (diffMin < 60) return `Il y a ${diffMin}min`;
  if (diffH < 24) return `Il y a ${diffH}h`;
  if (diffD === 1) return 'Hier';
  if (diffD < 7) return `Il y a ${diffD}j`;
  if (diffD < 30) return `Il y a ${Math.floor(diffD / 7)}sem`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const typeConfig = {
  client_created: {
    icon: UserPlus,
    iconClass: 'text-teal-500 dark:text-teal-400',
    bgClass: 'bg-teal-50 dark:bg-teal-950/40',
  },
  inpi_sync: {
    icon: RefreshCw,
    iconClass: 'text-sky-500 dark:text-sky-400',
    bgClass: 'bg-sky-50 dark:bg-sky-950/40',
  },
  legal_act: {
    icon: FileText,
    iconClass: 'text-amber-500 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-950/40',
  },
  bodacc: {
    icon: Building,
    iconClass: 'text-slate-500 dark:text-slate-400',
    bgClass: 'bg-slate-50 dark:bg-slate-800/40',
  },
};

interface DashboardActivityFeedProps {
  activities: ActivityItem[];
  loading?: boolean;
}

export function DashboardActivityFeed({ activities, loading }: DashboardActivityFeedProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-36 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
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
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Activite recente
          </h3>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucune activite recente</p>
          </div>
        ) : (
          <div className="max-h-[350px] overflow-y-auto space-y-1 -mx-1 px-1 scrollbar-thin">
            {activities.map(item => {
              const config = typeConfig[item.type];
              const Icon = config.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => item.clientId && navigate(`/clients/${item.clientId}`)}
                  className="w-full flex items-start gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
                >
                  <div className={`p-1.5 rounded-lg ${config.bgClass} flex-shrink-0 mt-0.5`}>
                    <Icon className={`w-4 h-4 ${config.iconClass}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {item.description}
                      </span>
                      {item.type === 'inpi_sync' && item.status && (
                        item.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        )
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {item.clientName}
                      </span>
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5 whitespace-nowrap">
                    {relativeTime(item.date)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
