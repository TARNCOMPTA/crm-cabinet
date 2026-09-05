import { useState, useRef, useEffect, memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { AlertCircle, ChevronDown, ChevronUp, Check, MessageSquare, Paperclip } from 'lucide-react';
import { VignettesCollaborateurs } from './VignettesCollaborateurs';
import { vignettesDuBilan } from '../../lib/collaborateursBilan';
import type { BilanCardWithDetails } from '../../types/database';

const MOIS_LABELS_SHORT = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];

function getProgressColor(progress: number) {
  if (progress === 100) return 'bg-emerald-500';
  if (progress >= 75) return 'bg-emerald-400';
  if (progress >= 50) return 'bg-amber-400';
  if (progress >= 25) return 'bg-orange-400';
  return 'bg-red-400';
}

function getProgressTextColor(progress: number) {
  if (progress >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (progress >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

interface BilanCardProps {
  card: BilanCardWithDetails;
  onClick: () => void;
  onChecklistToggle?: (itemId: string, checked: boolean) => void;
  onNotesChange?: (cardId: string, notes: string) => void;
}

export const BilanCard = memo(function BilanCard({ card, onClick, onChecklistToggle, onNotesChange }: BilanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [localNotes, setLocalNotes] = useState(card.notes || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { columnId: card.column_id },
  });

  useEffect(() => {
    setLocalNotes(card.notes || '');
  }, [card.notes]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const total = card.checklist_items?.length || 0;
  const checked = card.checklist_items?.filter((i) => i.is_checked).length || 0;
  const progress = total > 0 ? Math.round((checked / total) * 100) : 0;
  const isInactive = card.clients?.statut === 'inactif';
  const moisTraites = (card.mois_traites || []).slice().sort((a, b) => a - b);

  const vignettes = vignettesDuBilan(
    card.clients?.collaborators,
    card.assignee_id ? { id: card.assignee_id, ...(card.assignee || {}) } : null
  );

  const sortedItems = card.checklist_items?.slice().sort((a, b) => {
    const posA = a.template?.position ?? 0;
    const posB = b.template?.position ?? 0;
    return posA - posB;
  });

  const handleNotesChange = (val: string) => {
    setLocalNotes(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onNotesChange?.(card.id, val);
    }, 600);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-gray-900 rounded-xl border transition-all select-none ${
        isDragging
          ? 'opacity-40 shadow-lg border-teal-300 dark:border-teal-600'
          : 'border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div
        {...listeners}
        {...attributes}
        onClick={onClick}
        className="p-3.5 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h4 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2">
            {card.clients?.nom_entreprise}
          </h4>
          {isInactive && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 shrink-0">
              <AlertCircle className="w-3 h-3" />
              Inactif
            </span>
          )}
        </div>

        {moisTraites.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mb-2">
            {moisTraites.map((m) => (
              <span
                key={m}
                className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 leading-none"
              >
                {MOIS_LABELS_SHORT[m - 1]}
              </span>
            ))}
          </div>
        )}

        {card.clients?.numero_dossier && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{card.clients.numero_dossier}</p>
        )}

        {total > 0 && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{checked}/{total}</span>
              <span className={`text-[11px] font-semibold ${getProgressTextColor(progress)}`}>{progress}%</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ease-out ${getProgressColor(progress)}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/*
          TOUTE L'EQUIPE DU DOSSIER, PAS SEULEMENT LE RESPONSABLE DU BILAN.
          La carte n'affichait que `assignee` — un nom en toutes lettres, une
          personne. Or un dossier est tenu par plusieurs collaborateurs, et
          savoir a qui s'adresser demandait d'ouvrir la fiche client. Les
          vignettes tiennent la meme largeur pour cinq personnes que le nom
          d'une seule, et le cercle sarcelle designe le responsable du bilan.
          Aucun nom en clair : chaque pastille porte le sien dans son infobulle
          et son nom accessible, et l'ecrire en plus alourdissait la carte.
        */}
        {vignettes.length > 0 && <VignettesCollaborateurs vignettes={vignettes} taille="sm" />}
      </div>

      {total > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className="w-full flex items-center justify-between px-3.5 py-2 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-b-xl"
          >
            <span className="font-medium">Checklist {checked}/{total}</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="px-3 pb-3 animate-in slide-in-from-top-1 duration-150">
              <div className="space-y-0.5">
                {sortedItems?.map((item) => (
                  <div
                    key={item.id}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer group"
                  >
                    <button
                      type="button"
                      onClick={() => onChecklistToggle?.(item.id, !item.is_checked)}
                      className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        item.is_checked
                          ? 'bg-teal-600 border-teal-600'
                          : 'border-gray-300 dark:border-gray-600 group-hover:border-teal-400'
                      }`}
                      aria-label={`Marquer "${item.template?.name}" comme ${item.is_checked ? 'non termine' : 'termine'}`}
                    >
                      {item.is_checked && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span
                      className={`text-xs leading-tight truncate ${
                        item.is_checked ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {item.template?.name || 'Element'}
                    </span>
                    {(item.attachments?.length || 0) > 0 && (
                      <Paperclip className="w-3 h-3 text-gray-400 shrink-0 ml-auto" />
                    )}
                  </div>
                ))}
              </div>

              <div
                className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1 mb-1 text-[11px] text-gray-400 dark:text-gray-500">
                  <MessageSquare className="w-3 h-3" />
                  <span>Commentaire</span>
                </div>
                <textarea
                  value={localNotes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Ajouter un commentaire..."
                  rows={2}
                  className="w-full text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400 transition-shadow"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export function BilanCardOverlay({ card }: { card: BilanCardWithDetails }) {
  const total = card.checklist_items?.length || 0;
  const checked = card.checklist_items?.filter((i) => i.is_checked).length || 0;
  const progress = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-teal-400 p-3.5 shadow-2xl w-[284px] opacity-95">
      <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
        {card.clients?.nom_entreprise}
      </h4>
      {card.clients?.numero_dossier && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{card.clients.numero_dossier}</p>
      )}
      {total > 0 && (
        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full ${getProgressColor(progress)}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
