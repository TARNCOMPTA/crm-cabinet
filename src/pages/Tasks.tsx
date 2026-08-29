import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { NoCabinetState } from '../components/ui/NoCabinetState';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { TaskKanbanView } from '../components/tasks/TaskKanbanView';
import { TaskListView } from '../components/tasks/TaskListView';
import { TaskCreateModal, TaskCreateFormData } from '../components/tasks/TaskCreateModal';
import { TaskFiltersBar } from '../components/tasks/TaskFiltersBar';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  Plus,
  LayoutGrid,
  List,
  Archive,
  ArrowLeft,
} from 'lucide-react';
import {
  TaskWithRelations,
  loadTasks,
  loadArchivedTasks,
  getArchivedTaskCount,
  createTask,
  updateTask,
  archiveTask,
  unarchiveTask,
  archiveCompletedTasks,
  loadTaskTemplates,
  loadTaskCategories,
  TaskTemplateWithCategory,
  countTaskAttachments,
} from '../lib/taskService';
import { loadTaskChecklistCounts } from '../lib/checklistService';
import { Database } from '../types/database';
import { supabase } from '../lib/supabase';
import { createNotification } from '../lib/notificationService';

type TaskCategory = Database['public']['Tables']['task_categories']['Row'];

const columns = [
  { id: 'todo', title: 'À faire' },
  { id: 'in_progress', title: 'En cours' },
  { id: 'review', title: 'En révision' },
  { id: 'done', title: 'Terminé' },
];

export function Tasks() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; nom_entreprise: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; prenom: string | null; nom: string | null; avatar_url: string | null; avatar_color: string | null }>>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [templates, setTemplates] = useState<TaskTemplateWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [createMode, setCreateMode] = useState<'free' | 'template'>('free');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archivingAll, setArchivingAll] = useState(false);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({});
  const [checklistCounts, setChecklistCounts] = useState<Record<string, { total: number; checked: number }>>({});

  const [filters, setFilters] = useState({
    search: '',
    assignee: '',
    client: '',
    priority: '',
    category: '',
    status: '',
    myTasks: false,
  });

  const [formData, setFormData] = useState<TaskCreateFormData>({
    titre: '',
    description: '',
    client_id: '',
    assignee_id: '',
    priorite: 'moyenne',
    category_id: '',
    date_echeance: '',
    estimated_hours: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Memoized filtered tasks
  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.titre.toLowerCase().includes(search) ||
          t.description?.toLowerCase().includes(search) ||
          t.clients?.nom_entreprise.toLowerCase().includes(search)
      );
    }

    if (filters.myTasks && profile) {
      filtered = filtered.filter((t) => t.assignee_id === profile.id);
    }

    if (filters.assignee) {
      filtered = filtered.filter((t) => t.assignee_id === filters.assignee);
    }

    if (filters.client) {
      filtered = filtered.filter((t) => t.client_id === filters.client);
    }

    if (filters.priority) {
      filtered = filtered.filter((t) => t.priorite === filters.priority);
    }

    if (filters.category) {
      filtered = filtered.filter((t) => t.category_id === filters.category);
    }

    if (filters.status) {
      filtered = filtered.filter((t) => t.statut === filters.status);
    }

    return filtered;
  }, [tasks, filters, profile]);

  // Memoized status counts
  const statusCounts = useMemo(() => {
    return columns.map((col) => ({
      id: col.id,
      title: col.title,
      count: filteredTasks.filter((t) => t.statut === col.id).length,
    }));
  }, [filteredTasks]);

  // Memoized active task for drag overlay
  const activeTask = useMemo(() => {
    return tasks.find((task) => task.id === activeId);
  }, [tasks, activeId]);

  useEffect(() => {
    loadData();
  }, [profile, showArchived]);

  async function loadData() {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      const taskLoader = showArchived
        ? loadArchivedTasks()
        : loadTasks();

      const [tasksData, clientsRes, usersRes, categoriesData, templatesData, archCount] = await Promise.all([
        taskLoader,
        supabase
          .from('clients')
          .select('id, nom_entreprise')
          .eq('statut', 'actif')
          .order('nom_entreprise'),
        supabase
          .from('profiles')
          .select('id, prenom, nom, avatar_url, avatar_color')
          .order('prenom'),
        loadTaskCategories(true),
        loadTaskTemplates(true),
        getArchivedTaskCount(),
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (usersRes.error) throw usersRes.error;

      setTasks(tasksData);
      setClients(clientsRes.data || []);
      setUsers(usersRes.data || []);
      setCategories(categoriesData);
      setTemplates(templatesData);
      setArchivedCount(archCount);

      const taskIds = tasksData.map((t) => t.id);
      const [attCounts, clCounts] = await Promise.all([
        countTaskAttachments(taskIds),
        loadTaskChecklistCounts(taskIds),
      ]);
      setAttachmentCounts(attCounts);
      setChecklistCounts(clCounts);
    } catch {
      showToast('Erreur lors du chargement des données', 'error');
      setTasks([]);
      setClients([]);
      setUsers([]);
      setCategories([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  // `priorite` et `statut` sont nullables en base (DEFAULT sans NOT NULL). Les
  // deux fonctions le geraient deja ; leurs signatures ne le disaient pas.
  const getPriorityBadge = useCallback((priorite: string | null): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
      basse: 'default',
      moyenne: 'info',
      haute: 'warning',
      urgente: 'danger',
    };
    return (priorite ? variants[priorite] : undefined) || 'default';
  }, []);

  const isOverdue = useCallback((dateEcheance: string | null, statut: string | null): boolean => {
    if (!dateEcheance || statut === 'done') return false;
    return new Date(dateEcheance) < new Date();
  }, []);

  const handleOpenModal = useCallback(() => {
    setCreateMode('free');
    setSelectedTemplateId('');
    setFormData({
      titre: '',
      description: '',
      client_id: '',
      assignee_id: '',
      priorite: 'moyenne',
      category_id: '',
      date_echeance: '',
      estimated_hours: '',
    });
    setShowModal(true);
  }, []);

  const handleTemplateSelect = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setFormData((prev) => ({
        ...prev,
        titre: template.titre,
        description: template.description || '',
        priorite: template.priorite ?? 'moyenne',
        category_id: template.category_id || '',
        estimated_hours: template.estimated_hours?.toString() || '',
      }));
    }
  }, [templates]);

  const handleAssignToMe = useCallback(() => {
    if (profile) {
      setFormData((prev) => ({ ...prev, assignee_id: profile.id }));
    }
  }, [profile]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    try {
      await createTask({
        created_by: profile.id,
        titre: formData.titre.trim(),
        description: formData.description.trim() || null,
        client_id: formData.client_id || null,
        assignee_id: formData.assignee_id || null,
        priorite: formData.priorite,
        category_id: formData.category_id || null,
        date_echeance: formData.date_echeance || null,
        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        template_id: selectedTemplateId || null,
        statut: 'todo',
        progress: 0,
      });

      showToast('Tache créée', 'success');
      setShowModal(false);
      loadData();
    } catch {
      showToast('Erreur lors de la création', 'error');
    }
  }, [profile, formData, selectedTemplateId, showToast]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const taskId = active.id as string;
    const newStatus = over.id as string;

    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === taskId ? { ...task, statut: newStatus } : task
      )
    );

    try {
      await updateTask(taskId, { statut: newStatus });
      const task = tasks.find((t) => t.id === taskId);
      if (task?.assignee_id && task.assignee_id !== profile?.id) {
        const statusLabel = columns.find((c) => c.id === newStatus)?.title || newStatus;
        createNotification(
          task.assignee_id,
          'task_status_changed',
          'Statut de tache modifie',
          `La tache "${task.titre}" est passee en "${statusLabel}"`,
          '/tasks'
        );
      }
    } catch {
      showToast('Erreur lors du changement de statut', 'error');
      loadData();
    }

    setActiveId(null);
  }, [tasks, profile, showToast]);

  const handleTaskClick = useCallback((task: TaskWithRelations) => {
    setSelectedTask(task);
    setShowDetailPanel(true);
  }, []);

  const handleDetailPanelClose = useCallback(() => {
    setShowDetailPanel(false);
    setSelectedTask(null);
    loadData();
  }, []);

  const handleDetailPanelUpdate = useCallback(() => {
    loadData();
  }, []);

  const handleDetailPanelDelete = useCallback(() => {
    loadData();
  }, []);

  const handleArchiveTask = useCallback(async (taskId: string) => {
    if (!profile) return;
    try {
      await archiveTask(taskId, profile.id);
      showToast('Tache archivee', 'success');
      setShowDetailPanel(false);
      setSelectedTask(null);
      loadData();
    } catch {
      showToast('Erreur lors de l\'archivage', 'error');
    }
  }, [profile, showToast]);

  const handleUnarchiveTask = useCallback(async (taskId: string) => {
    try {
      await unarchiveTask(taskId);
      showToast('Tache desarchivee', 'success');
      setShowDetailPanel(false);
      setSelectedTask(null);
      loadData();
    } catch {
      showToast('Erreur lors du desarchivage', 'error');
    }
  }, [showToast]);

  const handleArchiveAllCompleted = useCallback(async () => {
    if (!profile) return;
    setArchivingAll(true);
    try {
      const count = await archiveCompletedTasks(profile.id);
      showToast(`${count} tache(s) archivee(s)`, 'success');
      setShowArchiveConfirm(false);
      loadData();
    } catch {
      showToast('Erreur lors de l\'archivage en masse', 'error');
    } finally {
      setArchivingAll(false);
    }
  }, [profile, showToast]);

  const handleFiltersChange = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters);
  }, []);

  const handleFormDataChange = useCallback((data: TaskCreateFormData) => {
    setFormData(data);
  }, []);

  const handleCreateModeChange = useCallback((mode: 'free' | 'template') => {
    setCreateMode(mode);
  }, []);

  const handleShowArchiveConfirm = useCallback(() => {
    setShowArchiveConfirm(true);
  }, []);

  if (loading) {
    return <PageSkeleton variant="kanban" />;
  }

  if (!profile) {
    return <NoCabinetState />;
  }

  return (
    <div>
      {/* Même en-tête que la liste clients, même débordement : 37 px sur un
          téléphone. Voir le commentaire de `Clients.tsx`. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          {showArchived ? (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowArchived(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-cyan-300 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Archives</h1>
              </div>
              <p className="text-gray-600 dark:text-slate-400 mt-1">
                {filteredTasks.length} tache(s) archivee(s)
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Tâches</h1>
              <p className="text-gray-600 dark:text-slate-400 mt-1">
                Organisez et suivez vos taches en mode Kanban ou Liste
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!showArchived && (
            <>
              <div className="flex bg-gray-100 dark:bg-white/[0.04] dark:ring-1 dark:ring-white/10 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    viewMode === 'kanban'
                      ? 'bg-white text-teal-600 shadow-sm dark:bg-cyan-400/15 dark:text-cyan-200 dark:shadow-none'
                      : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-teal-600 shadow-sm dark:bg-cyan-400/15 dark:text-cyan-200 dark:shadow-none'
                      : 'text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <Button onClick={handleOpenModal} >
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle tache
              </Button>
            </>
          )}
          <Button
            variant={showArchived ? 'primary' : 'outline'}
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="w-4 h-4 mr-2" />
            Archives
            {archivedCount > 0 && (
              <span className="ml-1.5 bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-slate-200 text-xs font-medium px-1.5 py-0.5 rounded-full">
                {archivedCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {showArchived && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <Archive className="w-5 h-5 text-amber-600 dark:text-amber-300 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Mode Archives -- Les taches archivees sont en lecture seule. Les taches terminees depuis plus de 30 jours sont archivees automatiquement chaque nuit.
          </p>
        </div>
      )}

      <TaskFiltersBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        statusCounts={statusCounts}
        columns={columns}
        users={users}
        clients={clients}
        categories={categories}
        showArchived={showArchived}
        onArchiveCompleted={handleShowArchiveConfirm}
      />

      {viewMode === 'kanban' && !showArchived ? (
        <TaskKanbanView
          columns={columns}
          filteredTasks={filteredTasks}
          sensors={sensors}
          activeTask={activeTask}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onTaskClick={handleTaskClick}
          getPriorityBadge={getPriorityBadge}
          isOverdue={isOverdue}
          attachmentCounts={attachmentCounts}
          checklistCounts={checklistCounts}
        />
      ) : (
        <TaskListView
          columns={columns}
          filteredTasks={filteredTasks}
          onTaskClick={handleTaskClick}
          getPriorityBadge={getPriorityBadge}
          isOverdue={isOverdue}
          attachmentCounts={attachmentCounts}
          checklistCounts={checklistCounts}
        />
      )}

      <TaskCreateModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
        formData={formData}
        onFormDataChange={handleFormDataChange}
        createMode={createMode}
        onCreateModeChange={handleCreateModeChange}
        selectedTemplateId={selectedTemplateId}
        onTemplateSelect={handleTemplateSelect}
        onAssignToMe={handleAssignToMe}
        clients={clients}
        users={users}
        categories={categories}
        templates={templates}
      />

      <TaskDetailPanel
        task={selectedTask}
        isOpen={showDetailPanel}
        onClose={handleDetailPanelClose}
        onUpdate={handleDetailPanelUpdate}
        onDelete={handleDetailPanelDelete}
        onArchive={handleArchiveTask}
        onUnarchive={handleUnarchiveTask}
        clients={clients}
        users={users}
        categories={categories}
      />

      <ConfirmDialog
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchiveAllCompleted}
        title="Archiver les taches terminees"
        message="Toutes les taches au statut 'Termine' seront archivees. Elles resteront accessibles dans les archives. Continuer ?"
        variant="warning"
        confirmText={archivingAll ? 'Archivage...' : 'Archiver'}
      />
    </div>
  );
}
