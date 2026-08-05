import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../../contexts/ToastContext';
import {
  Plus,
  Trash2,
  X,
  Users,
  Lock,
  MoreVertical,
  Pencil,
  Eye,
  EyeOff,
  Copy,
  FileText,
  GripVertical,
} from 'lucide-react';
import {
  loadTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addTemplateItem,
  deleteTemplateItem,
  reorderTemplateItems,
  createChecklistFromTemplate,
  type ChecklistTemplateWithItems,
} from '../../lib/checklistService';

interface Props {
  userId: string;
  onChecklistCreated: () => void;
}

function SortableTemplateItem({
  id,
  label,
  index,
  isOwner,
  onDelete,
}: {
  id: string;
  label: string;
  index: number;
  isOwner: boolean;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !isOwner,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 py-1 px-1 rounded transition-colors ${
        isDragging ? 'bg-amber-50 dark:bg-amber-950/30' : ''
      }`}
    >
      {isOwner && (
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-opacity touch-none"
        >
          <GripVertical className="w-3 h-3" />
        </button>
      )}
      <span className="w-5 h-5 flex items-center justify-center text-[11px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
        {index + 1}
      </span>
      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{label}</span>
      {isOwner && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-opacity"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export function ChecklistTemplatesPanel({ userId, onChecklistCreated }: Props) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<ChecklistTemplateWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await loadTemplates(userId);
      setTemplates(data);
    } catch {
      showToast('Erreur lors du chargement des modeles', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAddItem = async (templateId: string) => {
    const text = (newItemTexts[templateId] || '').trim();
    if (!text) return;
    try {
      const template = templates.find((t) => t.id === templateId);
      const position = template ? template.items.length : 0;
      const newItem = await addTemplateItem(templateId, text, position);
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId ? { ...t, items: [...t.items, newItem] } : t
        )
      );
      setNewItemTexts((prev) => ({ ...prev, [templateId]: '' }));
    } catch {
      showToast("Erreur lors de l'ajout", 'error');
    }
  };

  const handleDeleteItem = async (templateId: string, itemId: string) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId
          ? { ...t, items: t.items.filter((it) => it.id !== itemId) }
          : t
      )
    );
    try {
      await deleteTemplateItem(itemId);
    } catch {
      showToast('Erreur lors de la suppression', 'error');
      refresh();
    }
  };

  const handleReorderItems = async (templateId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const oldIndex = template.items.findIndex((it) => it.id === active.id);
    const newIndex = template.items.findIndex((it) => it.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(template.items, oldIndex, newIndex);
    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, items: reordered } : t))
    );
    try {
      await reorderTemplateItems(reordered.map((it, idx) => ({ id: it.id, position: idx })));
    } catch {
      refresh();
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setMenuOpen(null);
    try {
      await deleteTemplate(id);
      showToast('Modele supprime', 'success');
    } catch {
      showToast('Erreur lors de la suppression', 'error');
      refresh();
    }
  };

  const handleToggleShared = async (id: string, currentShared: boolean) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_shared: !currentShared } : t))
    );
    setMenuOpen(null);
    try {
      await updateTemplate(id, { is_shared: !currentShared });
      showToast(
        !currentShared ? 'Modele partage avec le cabinet' : 'Modele rendu prive',
        'success'
      );
    } catch {
      showToast('Erreur lors de la mise a jour', 'error');
      refresh();
    }
  };

  const handleSaveTitle = async (id: string) => {
    if (!editTitle.trim()) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: editTitle.trim() } : t))
    );
    setEditingTemplate(null);
    try {
      await updateTemplate(id, { title: editTitle.trim() });
    } catch {
      showToast('Erreur lors du renommage', 'error');
      refresh();
    }
  };

  const handleUseTemplate = async (template: ChecklistTemplateWithItems) => {
    try {
      await createChecklistFromTemplate(userId, template, false);
      showToast(`Checklist "${template.title}" creee depuis le modele`, 'success');
      onChecklistCreated();
    } catch {
      showToast('Erreur lors de la creation', 'error');
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Creez des modeles reutilisables pour generer rapidement des checklists pre-remplies.
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nouveau modele
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">
            Aucun modele
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Les modeles permettent de creer des checklists avec des elements pre-definis
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Creer un modele
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {templates.map((template) => {
            const isOwner = template.user_id === userId;
            return (
              <div
                key={template.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {editingTemplate === template.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveTitle(template.id);
                              if (e.key === 'Escape') setEditingTemplate(null);
                            }}
                            className="flex-1 text-sm font-semibold bg-transparent border-b-2 border-teal-500 outline-none text-gray-900 dark:text-white"
                            autoFocus
                          />
                          <button onClick={() => handleSaveTitle(template.id)} className="text-teal-600">
                            <Plus className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingTemplate(null)} className="text-gray-400">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {template.title}
                        </h3>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {template.items.length} element{template.items.length > 1 ? 's' : ''}
                        </span>
                        {template.is_shared ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                            <Users className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                            <Lock className="w-3 h-3" />
                          </span>
                        )}
                        {!isOwner && template.owner && (
                          <span className="text-[11px] text-gray-400">
                            par {template.owner.prenom} {template.owner.nom}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleUseTemplate(template)}
                        className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-950/50 transition-colors"
                        title="Utiliser ce modele"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {isOwner && (
                        <div className="relative">
                          <button
                            onClick={() => setMenuOpen(menuOpen === template.id ? null : template.id)}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {menuOpen === template.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                              <div className="absolute right-0 top-8 z-20 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                                <button
                                  onClick={() => {
                                    setEditTitle(template.title);
                                    setEditingTemplate(template.id);
                                    setMenuOpen(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  Renommer
                                </button>
                                <button
                                  onClick={() => handleToggleShared(template.id, template.is_shared)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                  {template.is_shared ? (
                                    <>
                                      <EyeOff className="w-3.5 h-3.5" />
                                      Rendre prive
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-3.5 h-3.5" />
                                      Partager au cabinet
                                    </>
                                  )}
                                </button>
                                <hr className="my-1 border-gray-100 dark:border-gray-700" />
                                <button
                                  onClick={() => handleDeleteTemplate(template.id)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Supprimer
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sortable items */}
                <div className="flex-1 px-3 py-2 space-y-0.5 max-h-[200px] overflow-y-auto">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => handleReorderItems(template.id, event)}
                  >
                    <SortableContext
                      items={template.items.map((it) => it.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {template.items.map((item, idx) => (
                        <SortableTemplateItem
                          key={item.id}
                          id={item.id}
                          label={item.label}
                          index={idx}
                          isOwner={isOwner}
                          onDelete={() => handleDeleteItem(template.id, item.id)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>

                {isOwner && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddItem(template.id);
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={newItemTexts[template.id] || ''}
                        onChange={(e) =>
                          setNewItemTexts((prev) => ({
                            ...prev,
                            [template.id]: e.target.value,
                          }))
                        }
                        placeholder="Ajouter un element au modele..."
                        className="flex-1 text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
                      />
                      <button
                        type="submit"
                        disabled={!(newItemTexts[template.id] || '').trim()}
                        className="p-1 rounded text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onCreate={async (title, isShared, items) => {
            try {
              await createTemplate(userId, title, isShared, items);
              setShowCreateModal(false);
              showToast('Modele enregistre', 'success');
              refresh();
            } catch {
              showToast('Erreur lors de la creation', 'error');
            }
          }}
        />
      )}
    </div>
  );
}

function CreateTemplateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, isShared: boolean, items: string[]) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    setItems((prev) => [...prev, newItem.trim()]);
    setNewItem('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await onCreate(title.trim(), isShared, items);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Nouveau modele de checklist
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Titre du modele
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Cloture annuelle, Onboarding client..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Elements du modele
            </label>
            <div className="space-y-1 mb-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 py-1.5 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="w-5 h-5 flex items-center justify-center text-[11px] font-medium text-gray-400 bg-white dark:bg-gray-700 rounded">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{item}</span>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-0.5 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
                placeholder="Ajouter un element et appuyer sur Entree..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
              />
              <button
                type="button"
                onClick={handleAddItem}
                disabled={!newItem.trim()}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-teal-500 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Partager avec le cabinet
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Les autres membres pourront utiliser ce modele
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer le modele'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
