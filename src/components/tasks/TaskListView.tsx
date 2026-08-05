import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { CollaboratorAvatar } from '../ui/CollaboratorAvatar';
import { AlertCircle, ClipboardList, Paperclip } from 'lucide-react';
import { TaskWithRelations } from '../../lib/taskService';

export interface TaskListViewProps {
  columns: { id: string; title: string }[];
  filteredTasks: TaskWithRelations[];
  onTaskClick: (task: TaskWithRelations) => void;
  getPriorityBadge: (priorite: string | null) => 'default' | 'success' | 'warning' | 'danger' | 'info';
  isOverdue: (dateEcheance: string | null, statut: string | null) => boolean;
  attachmentCounts: Record<string, number>;
  checklistCounts: Record<string, { total: number; checked: number }>;
}

export function TaskListView({
  columns,
  filteredTasks,
  onTaskClick,
  getPriorityBadge,
  isOverdue,
  attachmentCounts,
  checklistCounts,
}: TaskListViewProps) {
  return (
    <Card>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/10">
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-slate-300">Titre</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-slate-300">Client</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-slate-300">Assigné</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-slate-300">Priorité</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-slate-300">Catégorie</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-slate-300">Échéance</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-slate-300">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  className="border-b border-gray-100 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-white/[0.04] cursor-pointer transition-colors"
                  onClick={() => onTaskClick(task)}
                >
                  <td className="py-3 px-4">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-slate-100">{task.titre}</div>
                      {task.description && (
                        <div className="text-sm text-gray-600 dark:text-slate-400 line-clamp-1">
                          {task.description}
                        </div>
                      )}
                      {(checklistCounts[task.id] || attachmentCounts[task.id]) && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-slate-500">
                          {checklistCounts[task.id] && checklistCounts[task.id].total > 0 && (
                            <span className={`flex items-center gap-1 ${checklistCounts[task.id].checked === checklistCounts[task.id].total ? 'text-teal-600 dark:text-teal-400' : ''}`}>
                              <ClipboardList className="w-3 h-3" />
                              {checklistCounts[task.id].checked}/{checklistCounts[task.id].total}
                            </span>
                          )}
                          {attachmentCounts[task.id] > 0 && (
                            <span className="flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              {attachmentCounts[task.id]}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {task.clients ? (
                      <span className="text-sm text-gray-900 dark:text-slate-200">{task.clients.nom_entreprise}</span>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {task.profiles ? (
                      <div className="flex items-center gap-2">
                        <CollaboratorAvatar
                          name={`${task.profiles.prenom || ''} ${task.profiles.nom || ''}`.trim()}
                          avatarUrl={task.profiles.avatar_url}
                          avatarColor={task.profiles.avatar_color}
                          size="sm"
                        />
                        <span className="text-sm text-gray-900 dark:text-slate-200">
                          {task.profiles.prenom} {task.profiles.nom}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={getPriorityBadge(task.priorite)}>{task.priorite}</Badge>
                  </td>
                  <td className="py-3 px-4">
                    {task.task_categories ? (
                      <Badge
                        style={{
                          backgroundColor: task.task_categories.couleur,
                          color: '#fff',
                        }}
                      >
                        {task.task_categories.nom}
                      </Badge>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {task.date_echeance ? (
                      <div
                        className={`text-sm ${
                          isOverdue(task.date_echeance, task.statut)
                            ? 'text-red-600 dark:text-red-400 font-medium flex items-center gap-1'
                            : 'text-gray-900 dark:text-slate-200'
                        }`}
                      >
                        {isOverdue(task.date_echeance, task.statut) && (
                          <AlertCircle className="w-4 h-4" />
                        )}
                        {new Date(task.date_echeance).toLocaleDateString('fr-FR')}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="default">
                      {columns.find((c) => c.id === task.statut)?.title}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
