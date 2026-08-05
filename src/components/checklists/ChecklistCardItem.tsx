import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckSquare,
  Square,
  GripVertical,
  MessageSquare,
  Paperclip,
  X,
} from 'lucide-react';
import type { ChecklistItem } from '../../types/database';

interface Props {
  item: ChecklistItem;
  isOwner: boolean;
  metaCounts?: { comments: number; attachments: number };
  onToggle: (itemId: string, currentValue: boolean) => void;
  onDelete: (itemId: string) => void;
  onOpenDetail: (itemId: string) => void;
}

export function ChecklistCardItem({
  item,
  isOwner,
  metaCounts,
  onToggle,
  onDelete,
  onOpenDetail,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isOwner });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const hasComments = metaCounts && metaCounts.comments > 0;
  const hasAttachments = metaCounts && metaCounts.attachments > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 py-1.5 px-1 rounded-md transition-colors ${
        isDragging ? 'bg-teal-50 dark:bg-teal-950/30 shadow-sm' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      {isOwner && (
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-opacity touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        onClick={() => isOwner && onToggle(item.id, item.is_checked)}
        disabled={!isOwner}
        className={`flex-shrink-0 ${isOwner ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {item.is_checked ? (
          <CheckSquare className="w-4 h-4 text-emerald-500" />
        ) : (
          <Square className="w-4 h-4 text-gray-300 dark:text-gray-600" />
        )}
      </button>

      <button
        onClick={() => onOpenDetail(item.id)}
        className={`flex-1 text-left text-sm truncate transition-colors ${
          item.is_checked
            ? 'line-through text-gray-400 dark:text-gray-500'
            : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {item.label}
      </button>

      <div className="flex items-center gap-1 flex-shrink-0">
        {hasComments && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500">
            <MessageSquare className="w-3 h-3" />
            {metaCounts!.comments}
          </span>
        )}
        {hasAttachments && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500">
            <Paperclip className="w-3 h-3" />
            {metaCounts!.attachments}
          </span>
        )}
        {isOwner && (
          <button
            onClick={() => onDelete(item.id)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
