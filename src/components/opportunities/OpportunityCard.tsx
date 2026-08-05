import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { User, UserPlus, AlertCircle, MessageSquare, Calendar, Euro, CheckSquare, Paperclip } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { formatEuros } from '../../lib/opportunityService';
import type { OpportunityCardWithDetails } from '../../types/database';

interface Props {
  card: OpportunityCardWithDetails;
  checklistProgress?: { total: number; checked: number };
  attachmentCount?: number;
  onClick: () => void;
}

function getRelanceBadge(dateStr: string | null) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const relance = new Date(dateStr + 'T00:00:00');
  const diff = Math.ceil((relance.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { label: 'En retard', variant: 'danger' as const };
  if (diff <= 3) return { label: `J-${diff}`, variant: 'warning' as const };
  return { label: new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), variant: 'default' as const };
}

export const OpportunityCard = memo(function OpportunityCard({ card, checklistProgress, attachmentCount, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { columnId: card.column_id },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const isProspect = !card.client_id;
  const isInactive = card.clients?.statut === 'inactif';
  const displayName = card.clients?.nom_entreprise || card.prospect_name || 'Sans nom';
  const relanceBadge = getRelanceBadge(card.date_relance);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing transition-all select-none
        ${isDragging ? 'opacity-40 shadow-lg' : 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight line-clamp-2">
          {displayName}
        </h4>
        {isProspect ? (
          <Badge variant="warning" className="text-[10px] shrink-0">
            <UserPlus className="w-3 h-3 mr-0.5" />
            Prospect
          </Badge>
        ) : isInactive ? (
          <Badge variant="default" className="text-[10px] shrink-0">
            <AlertCircle className="w-3 h-3 mr-0.5" />
            Inactif
          </Badge>
        ) : null}
      </div>

      {!isProspect && card.clients?.numero_dossier && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{card.clients.numero_dossier}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {card.montant_estime != null && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
            <Euro className="w-3 h-3" />
            {formatEuros(card.montant_estime)}
          </span>
        )}

        {relanceBadge && (
          <Badge variant={relanceBadge.variant} className="text-[10px]">
            <Calendar className="w-3 h-3 mr-0.5" />
            {relanceBadge.label}
          </Badge>
        )}

        {card.source && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[100px]">
            {card.source}
          </span>
        )}

        {checklistProgress && checklistProgress.total > 0 && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
            checklistProgress.checked === checklistProgress.total
              ? 'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
              : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50'
          }`}>
            <CheckSquare className="w-3 h-3" />
            {checklistProgress.checked}/{checklistProgress.total}
          </span>
        )}

        {attachmentCount != null && attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-1.5 py-0.5 rounded">
            <Paperclip className="w-3 h-3" />
            {attachmentCount}
          </span>
        )}
      </div>

      {card.comment && (
        <div className="mt-2 flex items-start gap-1 text-xs text-gray-500 dark:text-gray-400">
          <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{card.comment}</span>
        </div>
      )}

      {card.assignee && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="w-5 h-5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 flex items-center justify-center">
            <User className="w-3 h-3" />
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
            {card.assignee.prenom} {card.assignee.nom}
          </span>
        </div>
      )}
    </div>
  );
});

export function OpportunityCardOverlay({ card }: { card: OpportunityCardWithDetails }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-teal-300 dark:border-teal-600 p-3 shadow-xl w-[284px] opacity-95">
      <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">
        {card.clients?.nom_entreprise || card.prospect_name || 'Sans nom'}
      </h4>
      {card.montant_estime != null && (
        <span className="text-xs font-semibold text-green-700 dark:text-green-400">
          {formatEuros(card.montant_estime)}
        </span>
      )}
    </div>
  );
}
