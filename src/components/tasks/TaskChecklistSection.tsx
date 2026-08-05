import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square, Plus, Trash2, ClipboardList, FileText } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import {
  loadChecklistsForTask,
  createChecklistForTask,
  createChecklistFromTemplateForTask,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  loadTemplates,
  type ChecklistWithItems,
  type ChecklistTemplateWithItems,
} from '../../lib/checklistService';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface Props {
  taskId: string;
  userId: string;
}

export function TaskChecklistSection({ taskId, userId }: Props) {
  const { showToast } = useToast();
  const [checklists, setChecklists] = useState<ChecklistWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [templates, setTemplates] = useState<ChecklistTemplateWithItems[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await loadChecklistsForTask(taskId);
      setChecklists(data);
    } catch {
      showToast('Erreur chargement checklists', 'error');
    } finally {
      setLoading(false);
    }
  }, [taskId, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await createChecklistForTask(userId, taskId, title);
      setNewTitle('');
      setShowCreateForm(false);
      refresh();
    } catch {
      showToast('Erreur creation checklist', 'error');
    }
  }

  async function handleCreateFromTemplate(template: ChecklistTemplateWithItems) {
    try {
      await createChecklistFromTemplateForTask(userId, taskId, template);
      setShowTemplates(false);
      refresh();
    } catch {
      showToast('Erreur creation depuis template', 'error');
    }
  }

  async function handleLoadTemplates() {
    try {
      const data = await loadTemplates(userId);
      setTemplates(data);
      setShowTemplates(true);
    } catch {
      showToast('Erreur chargement templates', 'error');
    }
  }

  async function handleDelete(checklistId: string) {
    try {
      await deleteChecklist(checklistId);
      setDeleteConfirmId(null);
      refresh();
    } catch {
      showToast('Erreur suppression', 'error');
    }
  }

  async function handleToggleItem(itemId: string, currentState: boolean) {
    try {
      await updateChecklistItem(itemId, { is_checked: !currentState });
      setChecklists((prev) =>
        prev.map((cl) => ({
          ...cl,
          items: cl.items.map((it) =>
            it.id === itemId ? { ...it, is_checked: !currentState } : it
          ),
        }))
      );
    } catch {
      showToast('Erreur mise a jour', 'error');
    }
  }

  async function handleAddItem(checklistId: string) {
    const label = (newItemTexts[checklistId] || '').trim();
    if (!label) return;
    const checklist = checklists.find((c) => c.id === checklistId);
    const position = checklist ? checklist.items.length : 0;
    try {
      await addChecklistItem(checklistId, label, position);
      setNewItemTexts((prev) => ({ ...prev, [checklistId]: '' }));
      refresh();
    } catch {
      showToast('Erreur ajout item', 'error');
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      await deleteChecklistItem(itemId);
      setChecklists((prev) =>
        prev.map((cl) => ({
          ...cl,
          items: cl.items.filter((it) => it.id !== itemId),
        }))
      );
    } catch {
      showToast('Erreur suppression item', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-500" />
        Chargement...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Checklists
          </span>
          {checklists.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              ({checklists.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleLoadTemplates}
            className="p-1.5 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Depuis un template"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="p-1.5 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Nouvelle checklist"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showTemplates && templates.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Choisir un template :</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleCreateFromTemplate(t)}
                className="w-full text-left px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-md transition-colors flex items-center justify-between"
              >
                <span className="truncate">{t.title}</span>
                <span className="text-xs text-gray-400 ml-2 shrink-0">{t.items.length} items</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTemplates(false)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Annuler
          </button>
        </div>
      )}

      {showTemplates && templates.length === 0 && (
        <p className="text-xs text-gray-400 italic py-1">Aucun template disponible.</p>
      )}

      {showCreateForm && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Titre de la checklist..."
            className="flex-1 text-sm px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            autoFocus
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newTitle.trim()}
            className="px-2.5 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-40 transition-colors"
          >
            Creer
          </button>
          <button
            type="button"
            onClick={() => { setShowCreateForm(false); setNewTitle(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Annuler
          </button>
        </div>
      )}

      {checklists.length === 0 && !showCreateForm && !showTemplates && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">
          Aucune checklist. Cliquez + pour en creer une.
        </p>
      )}

      {checklists.map((checklist) => {
        const total = checklist.items.length;
        const checked = checklist.items.filter((it) => it.is_checked).length;
        const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

        return (
          <div
            key={checklist.id}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {checklist.title}
              </span>
              <div className="flex items-center gap-2">
                {total > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {checked}/{total}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(checklist.id)}
                  className="p-1 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {total > 0 && (
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-2 overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}

            <div className="space-y-1">
              {checklist.items.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 py-0.5"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleItem(item.id, item.is_checked)}
                    className="shrink-0 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400"
                  >
                    {item.is_checked ? (
                      <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <span
                    className={`text-sm flex-1 ${
                      item.is_checked
                        ? 'line-through text-gray-400 dark:text-gray-500'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {item.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2">
              <input
                type="text"
                value={newItemTexts[checklist.id] || ''}
                onChange={(e) =>
                  setNewItemTexts((prev) => ({ ...prev, [checklist.id]: e.target.value }))
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAddItem(checklist.id)}
                placeholder="Ajouter un element..."
                className="w-full text-xs px-2 py-1.5 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-teal-400 bg-transparent text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-colors"
              />
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        title="Supprimer la checklist"
        message="Cette checklist et tous ses elements seront supprimes. Cette action est irreversible."
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  );
}
