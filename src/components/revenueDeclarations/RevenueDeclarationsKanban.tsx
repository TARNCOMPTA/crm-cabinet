import { useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { MessageSquare, Building2, User, Paperclip, Calendar } from 'lucide-react';
import {
  STATUS_ORDER,
  STATUS_LABELS,
  STATUS_COLORS,
  updateStatut,
  type RevenueDeclaration,
  type RevenueDeclarationStatus,
} from '../../lib/revenueDeclarationService';
import { useToast } from '../../contexts/ToastContext';
import { CollaboratorAvatarGroup } from '../ui/CollaboratorAvatarGroup';

interface Props {
  declarations: RevenueDeclaration[];
  attachmentsCounts?: Record<string, number>;
  deadlinesMap?: Record<string, string>;
  onCardClick: (d: RevenueDeclaration) => void;
  onChanged: () => void;
}

export function RevenueDeclarationsKanban({
  declarations,
  attachmentsCounts = {},
  deadlinesMap = {},
  onCardClick,
  onChanged,
}: Props) {
  const { showToast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localDeclarations, setLocalDeclarations] = useState<RevenueDeclaration[]>(declarations);
  const [prevDeclarations, setPrevDeclarations] = useState(declarations);

  if (declarations !== prevDeclarations) {
    setPrevDeclarations(declarations);
    setLocalDeclarations(declarations);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over) return;

      const id = active.id as string;
      const newStatut = over.id as RevenueDeclarationStatus;
      if (!STATUS_ORDER.includes(newStatut)) return;

      const d = localDeclarations.find((x) => x.id === id);
      if (!d || d.statut === newStatut) return;

      setLocalDeclarations((prev) =>
        prev.map((x) => (x.id === id ? { ...x, statut: newStatut } : x))
      );

      try {
        await updateStatut(id, newStatut);
        onChanged();
      } catch {
        setLocalDeclarations(declarations);
        showToast('Impossible de mettre a jour le statut', 'error');
      }
    },
    [localDeclarations, declarations, onChanged, showToast]
  );

  const activeCard = localDeclarations.find((d) => d.id === activeId) || null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {STATUS_ORDER.map((statut) => {
          const items = localDeclarations.filter((d) => d.statut === statut);
          return (
            <KanbanColumn key={statut} statut={statut} count={items.length}>
              {items.map((d) => (
                <KanbanCard
                  key={d.id}
                  declaration={d}
                  attachmentsCount={attachmentsCounts[d.id] ?? 0}
                  deadlinesMap={deadlinesMap}
                  onClick={() => onCardClick(d)}
                />
              ))}
            </KanbanColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeCard ? <KanbanCardOverlay declaration={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  statut,
  count,
  children,
}: {
  statut: RevenueDeclarationStatus;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: statut });
  const colors = STATUS_COLORS[statut];

  return (
    <div className="flex flex-col min-w-[280px] w-[280px]">
      <div
        className={`rounded-t-lg border-t-2 ${colors.border} px-4 py-3 ${colors.bg}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
              {STATUS_LABELS[statut]}
            </h3>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
            {count}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-b-lg border border-t-0 border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-2 space-y-2 min-h-[220px] transition-colors ${
          isOver ? 'bg-teal-50/60 dark:bg-teal-900/20 border-teal-200 dark:border-teal-700' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function KanbanCard({
  declaration,
  attachmentsCount,
  deadlinesMap,
  onClick,
}: {
  declaration: RevenueDeclaration;
  attachmentsCount: number;
  deadlinesMap: Record<string, string>;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: declaration.id,
  });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const isClient = !!declaration.client_id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing transition-all select-none ${
        isDragging ? 'opacity-40 shadow-lg' : 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight line-clamp-2 flex-1">
          {declaration.person_name}
        </h4>
        <div className="flex items-center gap-1 shrink-0">
          {attachmentsCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 px-1.5 py-0.5 rounded"
              title={`${attachmentsCount} piece(s) jointe(s)`}
            >
              <Paperclip className="w-3 h-3" />
              {attachmentsCount}
            </span>
          )}
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
            {declaration.annee}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1.5">
        {isClient ? (
          <>
            <Building2 className="w-3 h-3" />
            <span className="truncate">
              {declaration.clients?.nom_entreprise || 'Client'}
            </span>
          </>
        ) : (
          <>
            <User className="w-3 h-3" />
            <span>Personne libre</span>
          </>
        )}
      </div>

      {declaration.zone && (
        <div className="flex items-center gap-1.5 text-xs mt-1.5">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium ${
            declaration.zone === '1' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' :
            declaration.zone === '2' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
            'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
          }`}>
            Z{declaration.zone}
          </span>
          {deadlinesMap[declaration.zone] && (
            <span className={`flex items-center gap-0.5 ${
              new Date(deadlinesMap[declaration.zone] + 'T00:00:00') < new Date() && declaration.statut !== 'fait'
                ? 'text-red-600 dark:text-red-400 font-medium'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              <Calendar className="w-3 h-3" />
              {new Date(deadlinesMap[declaration.zone] + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      )}

      {declaration.commentaire && (
        <div className="mt-2 flex items-start gap-1 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700">
          <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{declaration.commentaire}</span>
        </div>
      )}

      {declaration.collaborators && declaration.collaborators.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <CollaboratorAvatarGroup
            collaborators={declaration.collaborators.map((c) => ({
              user_id: c.user_id,
              full_name: c.full_name,
              avatar_color: c.avatar_color,
            }))}
            size="small"
            maxDisplay={3}
          />
        </div>
      )}
    </div>
  );
}

function KanbanCardOverlay({ declaration }: { declaration: RevenueDeclaration }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-teal-300 dark:border-teal-600 p-3 shadow-xl w-[264px] opacity-95">
      <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-1">
        {declaration.person_name}
      </h4>
      <p className="text-xs text-gray-500 dark:text-gray-400">{declaration.annee}</p>
    </div>
  );
}
