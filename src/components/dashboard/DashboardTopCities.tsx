import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { MapPin, ChevronRight } from 'lucide-react';
import type { TopCityItem } from '../../lib/dashboardService';

interface DashboardTopCitiesProps {
  cities: TopCityItem[];
  loading?: boolean;
}

export function DashboardTopCities({ cities, loading }: DashboardTopCitiesProps) {
  const navigate = useNavigate();
  const maxCount = cities.length > 0 ? cities[0].count : 1;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-16 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="w-6 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
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
          <MapPin className="w-5 h-5 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Top villes clients
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
        {cities.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucune ville renseignee</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {cities.map((item, i) => (
              <div key={item.city} className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 w-4 text-right">
                  {i + 1}.
                </span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-28 flex-shrink-0 truncate capitalize">
                  {item.city.toLowerCase()}
                </span>
                <div className="flex-1 h-3.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-500/70 dark:bg-teal-600/60 transition-all duration-500"
                    style={{ width: `${(item.count / maxCount) * 100}%`, minWidth: '8px' }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 w-6 text-right">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
