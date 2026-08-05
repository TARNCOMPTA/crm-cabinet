import { useState } from 'react';
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
} from '@dnd-kit/sortable';
import {
  Plus,
  Pencil,
  X,
  Users,
  Lock,
  MoreVertical,
  Eye,
  EyeOff,
  Trash2,
  Building2,
  CheckSquare,
  Copy,
  Square,
} from 'lucide-react';
import { ChecklistCardItem } from './ChecklistCardItem';
import type { ChecklistWithItems } from '../../lib/checklistService';
import type { ChecklistItem } from '../../types/database';

interface Props {
  checklist: ChecklistWithItems;
  userId: string;
  metaCounts: Record<string, { comments: number; attachments: number }>;
  onToggleItem: (itemId: string, currentValue: boolean) => void;
  onAddItem: (checklistId: string, text: string) => void;
  onDeleteItem: (checklistId: string, itemId: string) => void;
  onReorderItems: (checklistId: string, items: ChecklistItem[]) => void;
  onDelete: (id: string) => void;
  onToggleShared: (id: string, currentShared: boolean) => void;
  onRename: (id: string, newTitle: string) => void;
  onCheckAll: (checklistId: string, checked: boolean) => void;
  onDuplicate: (checklistId: string) => void;
  onOpenItemDetail: (itemId: string) => void;
}

function getProgressColor(progress: number) {
  if (progress === 100) return 'bg-emerald-500';
  if (progress >= 75) return 'bg-emerald-400';
  if (progress >= 50) return 'bg-amber-400';
  if (progress >= 25) return 'bg-orange-400';
  return 'bg-red-400';
}

function getProgressTextColor(progress: number) {
  if (progress === 100) return 'text-emerald-600 dark:text-emerald-400';
  if (progress >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (progress >= 50) return 'text-amber-600 dark:text-amber-400';
  if (progress >= 25) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

export function ChecklistCard({
  checklist,
  userId,
  metaCounts,
  onToggleItem,
  onAddItem,
  onDeleteItem,
  onReorderItems,
  onDelete,
  onToggleShared,
  onRename,
  onCheckAll,
  onDuplicate,
  onOpenItemDetail,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [newItemText, setNewItemText] = useState('');

  const isOwner = checklist.user_id === userId;
  const totalItems = checklist.items.length;
  const checkedItems = checklist.items.filter((it) => it.is_checked).length;
  const progress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
  const allChecked = totalItems > 0 && checkedItems === totalItems;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = checklist.items.findIndex((it) => it.id === active.id);
    const newIndex = checklist.items.findIndex((it) => it.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(checklist.items, oldIndex, newIndex);
    onReorderItems(checklist.id, reordered);
  };

  const handleSubmitItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;
    onAddItem(checklist.id, newItemText.trim());
    setNewItemText('');
  };

  const startEdit = () => {
    setEditTitle(checklist.title);
    setEditing(true);
    setMenuOpen(false);
  };

  const saveTitle = () => {
    if (editTitle.trim() && editTitle.trim() !== checklist.title) {
      onRename(checklist.id, editTitle.trim());
    }
    setEditing(false);
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  onBlur={saveTitle}
                  className="flex-1 text-sm font-semibold bg-transparent border-b-2 border-teal-500 outline-none text-gray-900 dark:text-white"
                  autoFocus
                />
                <button onClick={saveTitle} className="text-teal-600 hover:text-teal-700">
                  <CheckSquare className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {checklist.title}
              </h3>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {checklist.is_shared ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  <Users className="w-3 h-3" />
                  Partagee
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  <Lock className="w-3 h-3" />
                  Privee
                </span>
              )}
              {checklist.client && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  <Building2 className="w-3 h-3" />
                  {checklist.client.nom_entreprise}
                </span>
              )}
              {!isOwner && checklist.owner && (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  par {checklist.owner.prenom} {checklist.owner.nom}
                </span>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-8 z-20 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    <button
                      onClick={startEdit}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Renommer
                    </button>
                    <button
                      onClick={() => {
                        onToggleShared(checklist.id, checklist.is_shared);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {checklist.is_shared ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          Rendre privee
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          Partager au cabinet
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        onCheckAll(checklist.id, !allChecked);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {allChecked ? (
                        <>
                          <Square className="w-3.5 h-3.5" />
                          Tout decocher
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-3.5 h-3.5" />
                          Tout cocher
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        onDuplicate(checklist.id);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Dupliquer
                    </button>
                    <hr className="my-1 border-gray-100 dark:border-gray-700" />
                    <button
                      onClick={() => {
                        onDelete(checklist.id);
                        setMenuOpen(false);
                      }}
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

        {/* Progress bar */}
        {totalItems > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-gray-500 dark:text-gray-400">
                {checkedItems}/{totalItems} terminee{checkedItems > 1 ? 's' : ''}
              </span>
              <span className={`font-semibold ${getProgressTextColor(progress)}`}>
                {progress}%
              </span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${getProgressColor(progress)}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 px-3 py-2 space-y-0.5 max-h-[280px] overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={checklist.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
            {checklist.items.map((item) => (
              <ChecklistCardItem
                key={item.id}
                item={item}
                isOwner={isOwner}
                metaCounts={metaCounts[item.id]}
                onToggle={onToggleItem}
                onDelete={(itemId) => onDeleteItem(checklist.id, itemId)}
                onOpenDetail={onOpenItemDetail}
              />
            ))}
          </SortableContext>
        </DndContext>
        {totalItems === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
            Aucun element. Ajoutez-en un ci-dessous.
          </p>
        )}
      </div>

      {/* Add item input */}
      {isOwner && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <form onSubmit={handleSubmitItem} className="flex items-center gap-2">
            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Ajouter un element..."
              className="flex-1 text-sm bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={!newItemText.trim()}
              className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
