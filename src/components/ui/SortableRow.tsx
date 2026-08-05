import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableRowProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function SortableRow({ id, children, className = '', disabled = false }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <tr ref={setNodeRef} style={style} className={className} {...attributes}>
      {!disabled && (
        <td className="w-8 px-1 py-0">
          <button
            {...listeners}
            className="p-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 cursor-grab active:cursor-grabbing transition-colors"
            tabIndex={-1}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        </td>
      )}
      {children}
    </tr>
  );
}

interface SortableCardRowProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

export function SortableCardRow({ id, children, className = '' }: SortableCardRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative ${className}`} {...attributes}>
      <div
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 cursor-grab active:cursor-grabbing transition-colors"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      {children}
    </div>
  );
}

interface SortableListItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

export function SortableListItem({ id, children, className = '' }: SortableListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes}>
      <div className="flex items-center gap-3">
        <button
          {...listeners}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-grab active:cursor-grabbing transition-colors flex-shrink-0"
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
