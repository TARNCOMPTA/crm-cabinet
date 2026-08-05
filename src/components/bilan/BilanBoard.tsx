import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  rectIntersection,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { BilanColumn } from './BilanColumn';
import { BilanCard, BilanCardOverlay } from './BilanCard';
import { BilanCardDetailModal } from './BilanCardDetailModal';
import { moveCard, toggleChecklistItem, updateCardNotes } from '../../lib/bilanService';
import { useAuth } from '../../contexts/AuthContext';
import { createNotification } from '../../lib/notificationService';
import type {
  BilanColumn as BilanColumnType,
  BilanCardWithDetails,
} from '../../types/database';

interface Props {
  columns: BilanColumnType[];
  cards: BilanCardWithDetails[];
  sortAlpha?: boolean;
  onCardsChanged: () => void;
  das2Enabled?: boolean;
}

export function BilanBoard({ columns, cards, sortAlpha, onCardsChanged, das2Enabled }: Props) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<BilanCardWithDetails | null>(null);
  const [localCards, setLocalCards] = useState<BilanCardWithDetails[]>(cards);

  useEffect(() => {
    setLocalCards(cards);
  }, [cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const cardId = active.id as string;
      const newColumnId = over.id as string;

      const isValidColumn = columns.some((col) => col.id === newColumnId);
      if (!isValidColumn) return;

      const card = localCards.find((c) => c.id === cardId);
      if (!card || card.column_id === newColumnId) return;

      setLocalCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, column_id: newColumnId } : c))
      );

      try {
        await moveCard(cardId, newColumnId, card.position);
        if (card.assignee_id && card.assignee_id !== user?.id) {
          const colName = columns.find((c) => c.id === newColumnId)?.name || '';
          const clientName = card.clients?.nom_entreprise || 'Client';
          createNotification(
            card.assignee_id,
            'bilan_moved',
            'Bilan deplace',
            `Le bilan de "${clientName}" a ete deplace vers "${colName}"`,
            '/bilans'
          );
        }
        onCardsChanged();
      } catch {
        setLocalCards(cards);
      }
    },
    [columns, localCards, cards, onCardsChanged, user]
  );

  const handleChecklistToggle = useCallback(
    async (itemId: string, checked: boolean) => {
      if (!user) return;

      setLocalCards((prev) =>
        prev.map((c) => ({
          ...c,
          checklist_items: c.checklist_items?.map((item) =>
            item.id === itemId ? { ...item, is_checked: checked } : item
          ),
        }))
      );

      try {
        await toggleChecklistItem(itemId, checked, user.id);
        onCardsChanged();
      } catch {
        setLocalCards(cards);
      }
    },
    [user, cards, onCardsChanged]
  );

  const handleNotesChange = useCallback(
    async (cardId: string, notes: string) => {
      try {
        await updateCardNotes(cardId, notes);
        onCardsChanged();
      } catch {
        // silent
      }
    },
    [onCardsChanged]
  );

  const activeCard = localCards.find((c) => c.id === activeId) || null;

  const totalCards = localCards.length;
  const totalChecked = localCards.reduce(
    (sum, c) => sum + (c.checklist_items?.filter((i) => i.is_checked).length || 0),
    0
  );
  const totalItems = localCards.reduce(
    (sum, c) => sum + (c.checklist_items?.length || 0),
    0
  );
  const overallProgress = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;
  const completedCards = localCards.filter(
    (c) => c.checklist_items && c.checklist_items.length > 0 && c.checklist_items.every((i) => i.is_checked)
  ).length;

  return (
    <>
      {/* Summary stats strip */}
      <div className="flex items-center gap-4 mb-4 px-1">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-white">{totalCards}</span> fiche{totalCards > 1 ? 's' : ''}
        </div>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{completedCards}</span>
          <span className="text-gray-500 dark:text-gray-400">terminee{completedCards > 1 ? 's' : ''}</span>
        </div>
        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-semibold ${
            overallProgress >= 75 ? 'text-emerald-600 dark:text-emerald-400' :
            overallProgress >= 50 ? 'text-amber-600 dark:text-amber-400' :
            'text-red-600 dark:text-red-400'
          }`}>{overallProgress}%</span>
          <span className="text-gray-500 dark:text-gray-400">global</span>
        </div>
        <div className="flex-1" />
        <div className="w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${
              overallProgress >= 75 ? 'bg-emerald-500' :
              overallProgress >= 50 ? 'bg-amber-400' :
              'bg-red-400'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
          {columns.map((column) => {
            const columnCards = localCards
              .filter((c) => c.column_id === column.id)
              .sort((a, b) =>
                sortAlpha
                  ? (a.clients?.nom_entreprise || '').localeCompare(
                      b.clients?.nom_entreprise || '',
                      'fr',
                      { sensitivity: 'base' }
                    )
                  : a.position - b.position
              );

            return (
              <BilanColumn key={column.id} column={column} count={columnCards.length}>
                {columnCards.map((card) => (
                  <BilanCard
                    key={card.id}
                    card={card}
                    onClick={() => setSelectedCard(card)}
                    onChecklistToggle={handleChecklistToggle}
                    onNotesChange={handleNotesChange}
                  />
                ))}
              </BilanColumn>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCard ? <BilanCardOverlay card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      <BilanCardDetailModal
        card={selectedCard ? localCards.find((c) => c.id === selectedCard.id) || selectedCard : null}
        columns={columns}
        isOpen={selectedCard !== null}
        onClose={() => setSelectedCard(null)}
        onUpdated={onCardsChanged}
        das2Enabled={das2Enabled}
      />
    </>
  );
}
