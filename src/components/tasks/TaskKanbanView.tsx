import React from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { CollaboratorAvatar } from '../ui/CollaboratorAvatar';
import { Calendar, Clock, AlertCircle, ClipboardList, Paperclip } from 'lucide-react';
import { TaskWithRelations } from '../../lib/taskService';

export interface TaskKanbanViewProps {
  columns: { id: string; title: string }[];
  filteredTasks: TaskWithRelations[];
  sensors: ReturnType<typeof useSensors>;
  activeTask: TaskWithRelations | undefined;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onTaskClick: (task: TaskWithRelations) => void;
  getPriorityBadge: (priorite: string | null) => 'default' | 'success' | 'warning' | 'danger' | 'info';
  isOverdue: (dateEcheance: string | null, statut: string | null) => boolean;
  attachmentCounts: Record<string, number>;
  checklistCounts: Record<string, { total: number; checked: number }>;
}

export function TaskKanbanView({
  columns,
  filteredTasks,
  sensors,
  activeTask,
  onDragStart,
  onDragEnd,
  onTaskClick,
  getPriorityBadge,
  isOverdue,
  attachmentCounts,
  checklistCounts,
}: TaskKanbanViewProps) {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {columns.map((column) => {
          const columnTasks = filteredTasks.filter((task) => task.statut === column.id);

          return (
            <div key={column.id} className="flex flex-col">
              <Card className="flex-1 dark:!bg-ink-900/70 dark:!border-white/[0.08]">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-slate-100">{column.title}</h3>
                    <Badge variant="default">{columnTasks.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DroppableColumn id={column.id}>
                    <div className="space-y-3">
                      {columnTasks.map((task) => (
                        <DraggableTask
                          key={task.id}
                          task={task}
                          getPriorityBadge={getPriorityBadge}
                          isOverdue={isOverdue}
                          onClick={() => onTaskClick(task)}
                          attachmentCount={attachmentCounts[task.id]}
                          checklistCount={checklistCounts[task.id]}
                        />
                      ))}
                    </div>
                  </DroppableColumn>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? (
          <Card className="opacity-95 shadow-lg dark:!bg-ink-750 dark:!border-cyan-400/40 dark:shadow-glow-cyan">
            <CardContent className="py-3">
              <TaskCardContent
                task={activeTask}
                getPriorityBadge={getPriorityBadge}
                isOverdue={isOverdue}
                attachmentCount={attachmentCounts[activeTask.id]}
                checklistCount={checklistCounts[activeTask.id]}
              />
            </CardContent>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DraggableTask({
  task,
  getPriorityBadge,
  isOverdue,
  onClick,
  attachmentCount,
  checklistCount,
}: {
  task: TaskWithRelations;
  getPriorityBadge: (p: string | null) => 'default' | 'success' | 'warning' | 'danger' | 'info';
  isOverdue: (date: string | null, status: string | null) => boolean;
  onClick: () => void;
  attachmentCount?: number;
  checklistCount?: { total: number; checked: number };
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  const handleClick = () => {
    if (!isDragging) {
      onClick();
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="cursor-move hover:shadow-md dark:!bg-ink-800 dark:!border-white/10 dark:hover:!border-cyan-400/40 dark:hover:shadow-glow-cyan-sm transition-all duration-200"
        onClick={handleClick}
      >
        <CardContent className="py-3">
          <TaskCardContent task={task} getPriorityBadge={getPriorityBadge} isOverdue={isOverdue} attachmentCount={attachmentCount} checklistCount={checklistCount} />
        </CardContent>
      </Card>
    </div>
  );
}

function DroppableColumn({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] rounded-lg transition-colors ${
        isOver ? 'bg-teal-50 dark:bg-cyan-400/10 dark:ring-1 dark:ring-cyan-400/30' : ''
      }`}
    >
      {children}
    </div>
  );
}

export interface TaskCardContentProps {
  task: TaskWithRelations;
  getPriorityBadge: (p: string | null) => 'default' | 'success' | 'warning' | 'danger' | 'info';
  isOverdue: (date: string | null, status: string | null) => boolean;
  attachmentCount?: number;
  checklistCount?: { total: number; checked: number };
}

export const TaskCardContent = React.memo(function TaskCardContent({
  task,
  getPriorityBadge,
  isOverdue,
  attachmentCount,
  checklistCount,
}: TaskCardContentProps) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-gray-900 dark:text-slate-100 text-sm">{task.titre}</h4>
        <Badge variant={getPriorityBadge(task.priorite)} className="text-xs">
          {task.priorite}
        </Badge>
      </div>

      {task.description && (
        <p className="text-xs text-gray-600 dark:text-slate-400 mb-2 line-clamp-2">{task.description}</p>
      )}

      {task.task_categories && (
        <Badge
          className="text-xs mb-2"
          style={{ backgroundColor: task.task_categories.couleur, color: '#fff' }}
        >
          {task.task_categories.nom}
        </Badge>
      )}

      {task.clients && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">{task.clients.nom_entreprise}</p>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 flex-wrap">
        {task.profiles && (
          <div className="flex items-center gap-1">
            <CollaboratorAvatar
              name={`${task.profiles.prenom || ''} ${task.profiles.nom || ''}`.trim()}
              avatarUrl={task.profiles.avatar_url}
              size="sm"
            />
            <span>{task.profiles.prenom}</span>
          </div>
        )}
        {task.date_echeance && (
          <div
            className={`flex items-center ${
              isOverdue(task.date_echeance, task.statut) ? 'text-red-600 dark:text-red-400 font-medium' : ''
            }`}
          >
            <Calendar className="w-3 h-3 mr-1" />
            {new Date(task.date_echeance).toLocaleDateString('fr-FR')}
            {isOverdue(task.date_echeance, task.statut) && (
              <AlertCircle className="w-3 h-3 ml-1" />
            )}
          </div>
        )}
        {task.estimated_hours && (
          <div className="flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            {task.estimated_hours}h
          </div>
        )}
        {checklistCount && checklistCount.total > 0 && (
          <div className={`flex items-center ${checklistCount.checked === checklistCount.total ? 'text-teal-600 dark:text-teal-400' : ''}`}>
            <ClipboardList className="w-3 h-3 mr-1" />
            {checklistCount.checked}/{checklistCount.total}
          </div>
        )}
        {attachmentCount && attachmentCount > 0 && (
          <div className="flex items-center">
            <Paperclip className="w-3 h-3 mr-1" />
            {attachmentCount}
          </div>
        )}
      </div>

      {(task.progress ?? 0) > 0 && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 dark:bg-white/10 rounded-full h-1">
            <div
              className="bg-teal-600 dark:bg-gradient-to-r dark:from-cyan-400 dark:to-teal-400 h-1 rounded-full transition-all"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});
