import { Search, Filter, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

interface CabinetUser {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
}

interface RegimeOption {
  value: string;
  label: string;
}

const FILTER_MONTHS = [
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Fevrier' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Aout' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Decembre' },
];

interface Props {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  onReset: () => void;
  filterStatus: string;
  onFilterStatusChange: (v: string) => void;
  filterRegime: string;
  onFilterRegimeChange: (v: string) => void;
  filterCloture: string;
  onFilterClotureChange: (v: string) => void;
  filterCollaboratorIds: string[];
  onToggleCollaborator: (uid: string) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  cabinetUsers: CabinetUser[];
  regimes: RegimeOption[];
}

export function ClientsToolbar({
  searchTerm,
  onSearchChange,
  showFilters,
  onToggleFilters,
  activeFilterCount,
  onReset,
  filterStatus,
  onFilterStatusChange,
  filterRegime,
  onFilterRegimeChange,
  filterCloture,
  onFilterClotureChange,
  filterCollaboratorIds,
  onToggleCollaborator,
  showArchived,
  onShowArchivedChange,
  cabinetUsers,
  regimes,
}: Props) {
  return (
    <Card className="mb-6">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Rechercher par nom, SIRET, numero de dossier..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            onClick={onToggleFilters}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtres
            {activeFilterCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[11px] font-semibold rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {(activeFilterCount > 0 || searchTerm) && (
            <Button variant="ghost" onClick={onReset} size="sm">
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Effacer
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Statut
                </label>
                <Select value={filterStatus} onChange={(e) => onFilterStatusChange(e.target.value)}>
                  <option value="all">Tous les statuts</option>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                  <option value="prospect">Prospect</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Regime fiscal
                </label>
                <Select value={filterRegime} onChange={(e) => onFilterRegimeChange(e.target.value)}>
                  <option value="all">Tous les regimes</option>
                  {regimes.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mois de cloture
                </label>
                <Select value={filterCloture} onChange={(e) => onFilterClotureChange(e.target.value)}>
                  <option value="all">Tous les mois</option>
                  {FILTER_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
              </div>
            </div>

            {cabinetUsers.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Collaborateurs
                </label>
                <div className="flex flex-wrap gap-2">
                  {cabinetUsers.map((user) => {
                    const isSelected = filterCollaboratorIds.includes(user.id);
                    const initials = `${user.prenom?.[0] || ''}${user.nom?.[0] || ''}`.toUpperCase();
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => onToggleCollaborator(user.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                          isSelected
                            ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-400 border-teal-300 dark:border-teal-700 shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isSelected ? 'bg-teal-200 dark:bg-teal-800 text-teal-900 dark:text-teal-200' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {initials}
                        </span>
                        {user.prenom} {user.nom}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => onShowArchivedChange(e.target.checked)}
                  className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Afficher les archives</span>
              </label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
