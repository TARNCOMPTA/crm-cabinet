import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import type { AlertItem } from '../../lib/dashboardService';

interface DashboardAlertsProps {
  alerts: AlertItem[];
  loading?: boolean;
}

const severityConfig = {
  danger: {
    icon: AlertTriangle,
    containerClass: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50',
    iconClass: 'text-red-500 dark:text-red-400',
    textClass: 'text-red-800 dark:text-red-300',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  },
  warning: {
    icon: AlertCircle,
    containerClass: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50',
    iconClass: 'text-amber-500 dark:text-amber-400',
    textClass: 'text-amber-800 dark:text-amber-300',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  },
  info: {
    icon: Info,
    containerClass: 'bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-900/50',
    iconClass: 'text-sky-500 dark:text-sky-400',
    textClass: 'text-sky-800 dark:text-sky-300',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  },
};

export function DashboardAlerts({ alerts, loading }: DashboardAlertsProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-900/50">
        <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0" />
        <span className="text-sm font-medium text-green-800 dark:text-green-300">
          Tout est en ordre -- aucune alerte
        </span>
      </div>
    );
  }

  const displayed = expanded ? alerts : alerts.slice(0, 3);
  const hasMore = alerts.length > 3;

  return (
    <div className="space-y-2">
      {displayed.map(alert => {
        const config = severityConfig[alert.severity];
        const Icon = config.icon;
        return (
          <button
            key={alert.id}
            onClick={() => navigate(alert.link)}
            className={`group w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5 ${config.containerClass}`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 ${config.iconClass}`} />
            <span className={`text-sm font-medium flex-1 text-left ${config.textClass}`}>
              {alert.message}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${config.badgeClass}`}>
              {alert.count}
            </span>
            <ArrowRight className={`w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${config.iconClass}`} />
          </button>
        );
      })}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mx-auto py-1 transition-colors"
        >
          {expanded ? (
            <>Reduire <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>Afficher tout ({alerts.length}) <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}
    </div>
  );
}
