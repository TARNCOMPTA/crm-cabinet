import { CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

interface Period {
  dateCloture: string;
  dateLimite: string;
  status: 'deposee' | 'en_retard' | 'a_faire';
}

interface PeriodesTooltipProps {
  periods: Period[];
  children: React.ReactNode;
}

function formatDateFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function PeriodesTooltip({ periods, children }: PeriodesTooltipProps) {
  if (periods.length === 0) return <>{children}</>;

  return (
    <div className="relative group inline-block">
      {children}
      <div className="absolute z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 pointer-events-none">
        <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3">
          <div className="font-semibold mb-2 pb-2 border-b border-gray-700">
            Détail des périodes (3 dernières années)
          </div>
          <div className="space-y-2">
            {periods.map((period, idx) => {
              const Icon = period.status === 'deposee' ? CheckCircle2 : period.status === 'en_retard' ? AlertCircle : AlertTriangle;
              const colorClass = period.status === 'deposee' ? 'text-green-400' : period.status === 'en_retard' ? 'text-red-400' : 'text-amber-400';
              const statusLabel = period.status === 'deposee' ? 'Déposée' : period.status === 'en_retard' ? 'En retard' : 'À faire';

              return (
                <div key={idx} className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{formatDateFR(period.dateCloture)}</div>
                    <div className={`text-xs ${colorClass}`}>
                      {statusLabel}
                      {period.status !== 'deposee' && (
                        <span className="text-gray-400"> (limite {formatDateFR(period.dateLimite)})</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="w-2 h-2 bg-gray-900 transform rotate-45"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
