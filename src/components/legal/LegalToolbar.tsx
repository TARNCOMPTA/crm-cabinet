import {
  FileText,
  Calendar as CalendarIcon,
  Users,
  Building2,
  FileCheck,
  Eye,
  EyeOff,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { TabType } from './legalTypes';

const TABS: { id: TabType; label: string; icon: typeof FileText }[] = [
  { id: 'acts', label: 'Statuts / Actes', icon: FileText },
  { id: 'assemblies', label: 'AGO', icon: CalendarIcon },
  { id: 'depot-comptes', label: 'Depot des comptes', icon: FileCheck },
  { id: 'officer-to-company', label: 'Dirigeant', icon: Users },
  { id: 'company-to-officer', label: 'Societe', icon: Building2 },
];

interface LegalToolbarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  showMyDossiers: boolean;
  onToggleMyDossiers: () => void;
  cabinetUsers: Array<{ id: string; prenom: string | null; nom: string | null; email: string }>;
  filterCollaboratorIds: string[];
  onToggleCollaborator: (userId: string) => void;
  showNonCommercial: boolean;
  onToggleNonCommercial: () => void;
  excludedCount: number;
}

export function LegalToolbar({
  activeTab,
  onTabChange,
  showMyDossiers,
  onToggleMyDossiers,
  cabinetUsers,
  filterCollaboratorIds,
  onToggleCollaborator,
  showNonCommercial,
  onToggleNonCommercial,
  excludedCount,
}: LegalToolbarProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Juridique</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Actes, assemblees et dirigeants de vos clients
          </p>
        </div>
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={showMyDossiers}
            onChange={onToggleMyDossiers}
            className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 dark:border-gray-600 rounded"
          />
          <FolderOpen className="w-4 h-4 ml-2 mr-1.5 text-gray-500 dark:text-gray-400" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Voir mes dossiers</span>
        </label>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center ${
                isActive
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {showMyDossiers && cabinetUsers.length > 0 && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Filtrer par collaborateur
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
                        ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 border-teal-300 dark:border-teal-700 shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isSelected
                        ? 'bg-teal-200 dark:bg-teal-800 text-teal-900 dark:text-teal-100'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                    }`}>
                      {initials}
                    </span>
                    {user.prenom} {user.nom}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {excludedCount > 0 && (
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={onToggleNonCommercial}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              showNonCommercial
                ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {showNonCommercial ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {showNonCommercial ? 'Masquer' : 'Afficher'} les non-societes commerciales
            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold ${
              showNonCommercial
                ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-100'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
            }`}>
              {excludedCount}
            </span>
          </button>
          {showNonCommercial && (
            <span className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Les lignes en rouge ne sont pas des societes commerciales
            </span>
          )}
        </div>
      )}
    </>
  );
}
