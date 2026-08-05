import { useEffect, useState, useCallback, useMemo } from 'react';
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
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, ClipboardList, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  loadChecklists,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderChecklistItems,
  createChecklistFromTemplate,
  loadItemMetaCounts,
  type ChecklistWithItems,
  type ChecklistTemplateWithItems,
} from '../lib/checklistService';
import { ChecklistCard } from '../components/checklists/ChecklistCard';
import { ChecklistFiltersBar, type ViewMode, type SortMode } from '../components/checklists/ChecklistFiltersBar';
import { ChecklistStatsBar } from '../components/checklists/ChecklistStatsBar';
import { ChecklistItemDrawer } from '../components/checklists/ChecklistItemDrawer';
import { ChecklistTemplatesPanel } from '../components/checklists/ChecklistTemplatesPanel';
import { CreateChecklistModal } from '../components/checklists/CreateChecklistModal';
import type { ChecklistItem } from '../types/database';

type MainTab = 'checklists' | 'templates';

/** Le champ vise-t-il une saisie de texte ? */
function estZoneDeSaisie(cible: EventTarget | null): boolean {
  const element = cible as HTMLElement | null;
  if (!element) return false;
  const balise = element.tagName;
  return (
    balise === 'INPUT' ||
    balise === 'TEXTAREA' ||
    balise === 'SELECT' ||
    element.isContentEditable
  );
}

function SortableChecklistCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  // La carte entiere est la zone de prise : pratique a la souris, mais le
  // capteur clavier de dnd-kit tient Espace et Entree pour des touches
  // d'activation et appelle `preventDefault()` dessus. Ces evenements remontent
  // depuis les champs que la carte contient — renommer une checklist devenait
  // donc impossible des que le titre comportait une espace, les lettres et les
  // chiffres passant, eux, sans encombre. Signale le 2026-08-01.
  //
  // On laisse le glisser-deposer au clavier fonctionner depuis la carte, mais
  // pas depuis une saisie : la ou l'utilisateur tape, les touches lui
  // appartiennent.
  const ecouteurs = {
    ...listeners,
    onKeyDown: (evenement: React.KeyboardEvent) => {
      if (estZoneDeSaisie(evenement.target)) return;
      listeners?.onKeyDown?.(evenement);
    },
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...ecouteurs}>
      {children}
    </div>
  );
}

export function Checklists() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [checklists, setChecklists] = useState<ChecklistWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>('checklists');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [metaCounts, setMetaCounts] = useState<Record<string, { comments: number; attachments: number }>>({});

  // Filters
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);

  const userId = user?.id || '';

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await loadChecklists(userId);
      setChecklists(data);
      const allItemIds = data.flatMap((c) => c.items.map((it) => it.id));
      if (allItemIds.length > 0) {
        loadItemMetaCounts(allItemIds).then(setMetaCounts).catch(() => {});
      }
    } catch {
      showToast('Erreur lors du chargement des checklists', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filtering + sorting
  const filteredChecklists = useMemo(() => {
    let result = checklists.filter((c) => {
      if (viewMode === 'mine') return c.user_id === userId;
      if (viewMode === 'shared') return c.is_shared && c.user_id !== userId;
      return true;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.client?.nom_entreprise.toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => {
      switch (sortMode) {
        case 'alpha':
          return a.title.localeCompare(b.title, 'fr');
        case 'progress_asc': {
          const pa = a.items.length > 0 ? a.items.filter((it) => it.is_checked).length / a.items.length : 0;
          const pb = b.items.length > 0 ? b.items.filter((it) => it.is_checked).length / b.items.length : 0;
          return pa - pb;
        }
        case 'progress_desc': {
          const pa2 = a.items.length > 0 ? a.items.filter((it) => it.is_checked).length / a.items.length : 0;
          const pb2 = b.items.length > 0 ? b.items.filter((it) => it.is_checked).length / b.items.length : 0;
          return pb2 - pa2;
        }
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

    return result;
  }, [checklists, viewMode, searchQuery, sortMode, userId]);

  const counts = useMemo(() => ({
    all: checklists.length,
    mine: checklists.filter((c) => c.user_id === userId).length,
    shared: checklists.filter((c) => c.is_shared && c.user_id !== userId).length,
  }), [checklists, userId]);

  // Find the item for the drawer
  const drawerItem = useMemo(() => {
    if (!drawerItemId) return null;
    for (const c of checklists) {
      const found = c.items.find((it) => it.id === drawerItemId);
      if (found) return found;
    }
    return null;
  }, [drawerItemId, checklists]);

  const drawerChecklist = useMemo(() => {
    if (!drawerItemId) return null;
    return checklists.find((c) => c.items.some((it) => it.id === drawerItemId)) || null;
  }, [drawerItemId, checklists]);

  // Handlers
  const handleToggleItem = async (itemId: string, currentValue: boolean) => {
    setChecklists((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((it) =>
          it.id === itemId ? { ...it, is_checked: !currentValue } : it
        ),
      }))
    );
    try {
      await updateChecklistItem(itemId, { is_checked: !currentValue });
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
      refresh();
    }
  };

  const handleAddItem = async (checklistId: string, text: string) => {
    try {
      const checklist = checklists.find((c) => c.id === checklistId);
      const position = checklist ? checklist.items.length : 0;
      const newItem = await addChecklistItem(checklistId, text, position);
      setChecklists((prev) =>
        prev.map((c) =>
          c.id === checklistId ? { ...c, items: [...c.items, newItem] } : c
        )
      );
    } catch {
      showToast("Erreur lors de l'ajout", 'error');
    }
  };

  const handleDeleteItem = async (checklistId: string, itemId: string) => {
    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId ? { ...c, items: c.items.filter((it) => it.id !== itemId) } : c
      )
    );
    try {
      await deleteChecklistItem(itemId);
    } catch {
      showToast('Erreur lors de la suppression', 'error');
      refresh();
    }
  };

  const handleReorderItems = async (checklistId: string, newItems: ChecklistItem[]) => {
    setChecklists((prev) =>
      prev.map((c) => (c.id === checklistId ? { ...c, items: newItems } : c))
    );
    try {
      await reorderChecklistItems(newItems.map((it, idx) => ({ id: it.id, position: idx })));
    } catch {
      showToast('Erreur lors du reordonnancement', 'error');
      refresh();
    }
  };

  const handleDeleteChecklist = async (id: string) => {
    setChecklists((prev) => prev.filter((c) => c.id !== id));
    try {
      await deleteChecklist(id);
      showToast('Checklist supprimee', 'success');
    } catch {
      showToast('Erreur lors de la suppression', 'error');
      refresh();
    }
  };

  const handleToggleShared = async (id: string, currentShared: boolean) => {
    setChecklists((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_shared: !currentShared } : c))
    );
    try {
      await updateChecklist(id, { is_shared: !currentShared });
      showToast(!currentShared ? 'Checklist partagee' : 'Checklist rendue privee', 'success');
    } catch {
      showToast('Erreur lors de la mise a jour', 'error');
      refresh();
    }
  };

  const handleRename = async (id: string, newTitle: string) => {
    setChecklists((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
    try {
      await updateChecklist(id, { title: newTitle });
      showToast('Checklist renommee', 'success');
    } catch {
      showToast('Erreur lors du renommage', 'error');
      refresh();
    }
  };

  const handleCheckAll = async (checklistId: string, checked: boolean) => {
    const checklist = checklists.find((c) => c.id === checklistId);
    if (!checklist) return;
    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.map((it) => ({ ...it, is_checked: checked })) }
          : c
      )
    );
    try {
      await Promise.all(
        checklist.items.map((it) => updateChecklistItem(it.id, { is_checked: checked }))
      );
    } catch {
      showToast('Erreur', 'error');
      refresh();
    }
  };

  const handleDuplicate = async (checklistId: string) => {
    const checklist = checklists.find((c) => c.id === checklistId);
    if (!checklist) return;
    try {
      const newCl = await createChecklist(userId, `${checklist.title} (copie)`, checklist.is_shared, checklist.client_id);
      for (let i = 0; i < checklist.items.length; i++) {
        await addChecklistItem(newCl.id, checklist.items[i].label, i);
      }
      showToast('Checklist dupliquee', 'success');
      refresh();
    } catch {
      showToast('Erreur lors de la duplication', 'error');
    }
  };

  const handleUpdateItemLabel = async (itemId: string, label: string) => {
    setChecklists((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((it) => (it.id === itemId ? { ...it, label } : it)),
      }))
    );
    try {
      await updateChecklistItem(itemId, { label });
    } catch {
      showToast('Erreur lors de la mise a jour', 'error');
      refresh();
    }
  };

  const handleCreateChecklist = async (
    title: string,
    isShared: boolean,
    template: ChecklistTemplateWithItems | null,
    clientId: string | null
  ) => {
    try {
      if (template) {
        await createChecklistFromTemplate(userId, template, isShared, clientId);
      } else {
        await createChecklist(userId, title, isShared, clientId);
      }
      setShowCreateModal(false);
      showToast('Checklist creee', 'success');
      refresh();
    } catch {
      showToast('Erreur lors de la creation', 'error');
    }
  };

  // DnD for card reorder
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCardDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = filteredChecklists.findIndex((c) => c.id === active.id);
    const newIndex = filteredChecklists.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(filteredChecklists, oldIndex, newIndex);
    // Reflect in full list maintaining non-filtered items
    const reorderedIds = reordered.map((c) => c.id);
    setChecklists((prev) => {
      const nonFiltered = prev.filter((c) => !reorderedIds.includes(c.id));
      return [...reordered, ...nonFiltered];
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-10 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Checklists</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gerez vos listes de controle personnelles ou partagees avec le cabinet
          </p>
        </div>
        {mainTab === 'checklists' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouvelle checklist
          </button>
        )}
      </div>

      {/* Main tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setMainTab('checklists')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            mainTab === 'checklists'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4" />
            Mes checklists
          </span>
        </button>
        <button
          onClick={() => setMainTab('templates')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            mainTab === 'templates'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            Modeles
          </span>
        </button>
      </div>

      {mainTab === 'templates' ? (
        <ChecklistTemplatesPanel
          userId={userId}
          onChecklistCreated={() => {
            setMainTab('checklists');
            refresh();
          }}
        />
      ) : (
        <>
          {/* Stats */}
          <ChecklistStatsBar checklists={checklists} />

          {/* Filters */}
          <ChecklistFiltersBar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            counts={counts}
          />

          {/* Grid */}
          {filteredChecklists.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                {searchQuery
                  ? 'Aucun resultat'
                  : viewMode === 'shared'
                  ? 'Aucune checklist partagee'
                  : 'Aucune checklist'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {searchQuery
                  ? 'Essayez avec un autre terme de recherche'
                  : viewMode === 'shared'
                  ? "Aucun collaborateur n'a encore partage de checklist"
                  : 'Creez votre premiere checklist pour commencer'}
              </p>
              {!searchQuery && viewMode !== 'shared' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Creer une checklist
                </button>
              )}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCardDragEnd}>
              <SortableContext items={filteredChecklists.map((c) => c.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredChecklists.map((checklist) => (
                    <SortableChecklistCard key={checklist.id} id={checklist.id}>
                      <ChecklistCard
                        checklist={checklist}
                        userId={userId}
                        metaCounts={metaCounts}
                        onToggleItem={handleToggleItem}
                        onAddItem={handleAddItem}
                        onDeleteItem={handleDeleteItem}
                        onReorderItems={handleReorderItems}
                        onDelete={handleDeleteChecklist}
                        onToggleShared={handleToggleShared}
                        onRename={handleRename}
                        onCheckAll={handleCheckAll}
                        onDuplicate={handleDuplicate}
                        onOpenItemDetail={setDrawerItemId}
                      />
                    </SortableChecklistCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateChecklistModal
          userId={userId}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateChecklist}
        />
      )}

      {/* Item drawer */}
      {drawerItemId && drawerItem && (
        <ChecklistItemDrawer
          item={drawerItem}
          isOwner={drawerChecklist ? drawerChecklist.user_id === userId : false}
          userId={userId}
          onClose={() => setDrawerItemId(null)}
          onToggle={handleToggleItem}
          onUpdateLabel={handleUpdateItemLabel}
        />
      )}
    </div>
  );
}
