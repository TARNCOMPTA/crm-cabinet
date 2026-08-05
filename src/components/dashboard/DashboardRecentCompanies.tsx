import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Building, ChevronRight, MapPin } from 'lucide-react';
import type { RecentCompanyItem } from '../../lib/dashboardService';

function formatDateFR(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface DashboardRecentCompaniesProps {
  companies: RecentCompanyItem[];
  loading?: boolean;
}

export function DashboardRecentCompanies({ companies, loading }: DashboardRecentCompaniesProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-52 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
                <div className="w-16 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
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
          <Building className="w-5 h-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Dernieres entreprises creees
          </h3>
        </div>
        <button
          onClick={() => navigate('/clients')}
          className="flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
        >
          Voir tout <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <div className="text-center py-8">
            <Building className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucune entreprise recente</p>
          </div>
        ) : (
          <div className="space-y-1">
            {companies.map(company => (
              <button
                key={company.id}
                onClick={() => navigate(`/clients/${company.id}`)}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
              >
                <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 flex-shrink-0">
                  <Building className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {company.name}
                  </p>
                  {company.city && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate capitalize">
                        {company.city.toLowerCase()}
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 whitespace-nowrap">
                  {formatDateFR(company.dateCreation)}
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
