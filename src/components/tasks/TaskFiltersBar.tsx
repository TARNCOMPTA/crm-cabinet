import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Search, UserCheck, ArchiveRestore } from 'lucide-react';
import { Database } from '../../types/database';

type TaskCategory = Database['public']['Tables']['task_categories']['Row'];

export interface TaskFiltersBarProps {
  filters: {
    search: string;
    assignee: string;
    client: string;
    priority: string;
    category: string;
    status: string;
    myTasks: boolean;
  };
  onFiltersChange: (filters: TaskFiltersBarProps['filters']) => void;
  statusCounts: { id: string; title: string; count: number }[];
  columns: { id: string; title: string }[];
  users: Array<{ id: string; prenom: string | null; nom: string | null; avatar_url: string | null; avatar_color: string | null }>;
  clients: Array<{ id: string; nom_entreprise: string }>;
  categories: TaskCategory[];
  showArchived: boolean;
  onArchiveCompleted: () => void;
}

export function TaskFiltersBar({
  filters,
  onFiltersChange,
  statusCounts,
  columns,
  users,
  clients,
  categories,
  showArchived,
  onArchiveCompleted,
}: TaskFiltersBarProps) {
  return (
    <div className="mb-6 space-y-4">
      {!showArchived && (
        <div className="flex gap-4 flex-wrap">
          {statusCounts.map((status) => (
            <Card key={status.id} className="flex-1 min-w-[200px] dark:!bg-ink-850/80">
              <CardContent className="py-4 text-center">
                <div className="text-3xl font-bold text-teal-600 dark:text-cyan-300">{status.count}</div>
                <div className="text-sm text-gray-600 dark:text-slate-300 mt-1">{status.title}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              placeholder="Rechercher..."
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              icon={<Search className="w-4 h-4" />}
            />

            <Select
              value={filters.assignee}
              onChange={(e) => onFiltersChange({ ...filters, assignee: e.target.value, myTasks: false })}
              options={[
                { value: '', label: 'Tous les assignés' },
                ...users.map((u) => ({
                  value: u.id,
                  label: `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Sans nom',
                })),
              ]}
            />

            <SearchableSelect
              value={filters.client}
              onChange={(val) => onFiltersChange({ ...filters, client: val })}
              placeholder="Tous les clients"
              options={clients.map((c) => ({ value: c.id, label: c.nom_entreprise }))}
            />

            <Select
              value={filters.priority}
              onChange={(e) => onFiltersChange({ ...filters, priority: e.target.value })}
              options={[
                { value: '', label: 'Toutes les priorités' },
                { value: 'basse', label: 'Basse' },
                { value: 'moyenne', label: 'Moyenne' },
                { value: 'haute', label: 'Haute' },
                { value: 'urgente', label: 'Urgente' },
              ]}
            />

            <Select
              value={filters.category}
              onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
              options={[
                { value: '', label: 'Toutes les catégories' },
                ...categories.map((c) => ({ value: c.id, label: c.nom })),
              ]}
            />

            <Select
              value={filters.status}
              onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
              options={[
                { value: '', label: 'Tous les statuts' },
                ...columns.map((c) => ({ value: c.id, label: c.title })),
              ]}
            />

            <Button
              variant={filters.myTasks ? 'primary' : 'outline'}
              onClick={() => onFiltersChange({ ...filters, myTasks: !filters.myTasks, assignee: '' })}
            >
              <UserCheck className="w-4 h-4 mr-2" />
              Mes taches
            </Button>

            {/* `flex-wrap` : dans une cellule de grille a quatre colonnes, ces
                deux boutons demandent 240 px pour 180 px disponibles a 1 024 px
                de large — et faisaient deborder la PAGE de 29 px. */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  onFiltersChange({
                    search: '',
                    assignee: '',
                    client: '',
                    priority: '',
                    category: '',
                    status: '',
                    myTasks: false,
                  })
                }
              >
                Réinitialiser
              </Button>

              {!showArchived && (
                <Button
                  variant="outline"
                  onClick={onArchiveCompleted}
                >
                  <ArchiveRestore className="w-4 h-4 mr-2" />
                  Archiver terminees
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
