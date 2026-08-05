import { useState, useEffect, useCallback, useRef } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { DragEndEvent } from '@dnd-kit/core';
import { useAuth } from '../contexts/AuthContext';
import { fetchRowOrder, saveRowOrder, deleteRowOrder } from '../lib/rowOrderService';

interface UseSortableTableOptions<T> {
  context: string;
  items: T[];
  getId: (item: T) => string;
  enabled?: boolean;
}

interface UseSortableTableResult<T> {
  sortedItems: T[];
  orderedIds: string[];
  handleDragEnd: (event: DragEndEvent) => void;
  isCustomOrder: boolean;
  resetOrder: () => Promise<void>;
  isLoading: boolean;
}

export function useSortableTable<T>({
  context,
  items,
  getId,
  enabled = true,
}: UseSortableTableOptions<T>): UseSortableTableResult<T> {
  const { profile } = useAuth();
  const [savedOrder, setSavedOrder] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profile?.id || !enabled) return;

    let cancelled = false;
    setIsLoading(true);

    fetchRowOrder(profile.id, context)
      .then((order) => {
        if (!cancelled) {
          setSavedOrder(order.length > 0 ? order : null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile?.id, context, enabled]);

  const applyOrder = useCallback(
    (sourceItems: T[], order: string[] | null): T[] => {
      if (!order || order.length === 0) return sourceItems;

      const itemMap = new Map<string, T>();
      sourceItems.forEach((item) => itemMap.set(getId(item), item));

      const ordered: T[] = [];
      order.forEach((id) => {
        const item = itemMap.get(id);
        if (item) {
          ordered.push(item);
          itemMap.delete(id);
        }
      });

      itemMap.forEach((item) => ordered.push(item));
      return ordered;
    },
    [getId]
  );

  const sortedItems = applyOrder(items, savedOrder);
  const orderedIds = sortedItems.map(getId);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !profile?.id) return;

      const currentIds = sortedItems.map(getId);
      const oldIndex = currentIds.indexOf(String(active.id));
      const newIndex = currentIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(currentIds, oldIndex, newIndex);
      setSavedOrder(newOrder);

      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        saveRowOrder(profile.id, context, newOrder).catch(() => {});
      }, 300);
    },
    [sortedItems, getId, profile?.id, context]
  );

  const resetOrder = useCallback(async () => {
    if (!profile?.id) return;
    setSavedOrder(null);
    await deleteRowOrder(profile.id, context).catch(() => {});
  }, [profile?.id, context]);

  return {
    sortedItems,
    orderedIds,
    handleDragEnd,
    isCustomOrder: savedOrder !== null && savedOrder.length > 0,
    resetOrder,
    isLoading,
  };
}
