import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { OpportunityColumn } from './OpportunityColumn';
import { OpportunityCard, OpportunityCardOverlay } from './OpportunityCard';
import { OpportunityCardDetailModal } from './OpportunityCardDetailModal';
import { moveCard, fetchAttachmentCounts } from '../../lib/opportunityService';
import { loadOpportunityChecklistCounts } from '../../lib/checklistService';
import type {
  OpportunityColumn as OpportunityColumnType,
  OpportunityCardWithDetails,
} from '../../types/database';

interface Props {
  columns: OpportunityColumnType[];
  cards: OpportunityCardWithDetails[];
  onCardsChanged: () => void;
}

export function OpportunityBoard({ columns, cards, onCardsChanged }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<OpportunityCardWithDetails | null>(null);
  const [localCards, setLocalCards] = useState<OpportunityCardWithDetails[]>(cards);
  const [prevCards, setPrevCards] = useState(cards);

  if (cards !== prevCards) {
    setPrevCards(cards);
    setLocalCards(cards);
  }

  const [checklistCounts, setChecklistCounts] = useState<Record<string, { total: number; checked: number }>>({});
  const [attachCounts, setAttachCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const cardIds = cards.map((c) => c.id);
    if (cardIds.length === 0) { setChecklistCounts({}); return; }
    loadOpportunityChecklistCounts(cardIds).then(setChecklistCounts).catch(() => {});
  }, [cards]);

  useEffect(() => {
    fetchAttachmentCounts().then(setAttachCounts).catch(() => {});
  }, [cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
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
        onCardsChanged();
      } catch {
        setLocalCards(cards);
      }
    },
    [columns, localCards, cards, onCardsChanged]
  );

  const activeCard = localCards.find((c) => c.id === activeId) || null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
          {columns.map((column) => {
            const columnCards = localCards
              .filter((c) => c.column_id === column.id)
              .sort((a, b) => a.position - b.position);

            const totalAmount = columnCards.reduce(
              (sum, c) => sum + (c.montant_estime ? Number(c.montant_estime) : 0),
              0
            );

            return (
              <OpportunityColumn
                key={column.id}
                column={column}
                count={columnCards.length}
                totalAmount={totalAmount}
              >
                {columnCards.map((card) => (
                  <OpportunityCard
                    key={card.id}
                    card={card}
                    checklistProgress={checklistCounts[card.id]}
                    attachmentCount={attachCounts[card.id]}
                    onClick={() => setSelectedCard(card)}
                  />
                ))}
              </OpportunityColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeCard ? <OpportunityCardOverlay card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      <OpportunityCardDetailModal
        card={selectedCard ? (localCards.find((c) => c.id === selectedCard.id) || selectedCard) : null}
        columns={columns}
        isOpen={selectedCard !== null}
        onClose={() => setSelectedCard(null)}
        onUpdated={onCardsChanged}
      />
    </>
  );
}
