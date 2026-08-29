import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Calendar, User, Tag, Clock, MessageSquare, Trash2, CreditCard as Edit2, Save, Archive, ArchiveRestore, Paperclip, Upload, Download, Image, FileText, File } from 'lucide-react';
import { TaskChecklistSection } from './TaskChecklistSection';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Badge } from '../ui/Badge';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CollaboratorAvatar } from '../ui/CollaboratorAvatar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  TaskWithRelations,
  TaskCommentWithUser,
  TaskAttachment,
  loadTaskComments,
  createTaskComment,
  deleteTaskComment,
  updateTask,
  deleteTask,
  loadTaskAttachments,
  uploadTaskAttachment,
  deleteTaskAttachment,
  getTaskAttachmentSignedUrl,
} from '../../lib/taskService';
import { createNotification } from '../../lib/notificationService';

interface TaskDetailPanelProps {
  task: TaskWithRelations | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  onArchive: (taskId: string) => void;
  onUnarchive: (taskId: string) => void;
  clients: Array<{ id: string; nom_entreprise: string }>;
  users: Array<{ id: string; prenom: string | null; nom: string | null; avatar_url: string | null; avatar_color: string | null }>;
  categories: Array<{ id: string; nom: string; couleur: string | null; icone: string | null }>;
}

const STATUT_WORKFLOW = ['todo', 'in_progress', 'review', 'done'];
const STATUT_LABELS: Record<string, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  review: 'En révision',
  done: 'Terminé',
};

const STATUT_COLORS: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'blue' | 'orange' | 'green' | 'gray'> = {
  todo: 'gray',
  in_progress: 'blue',
  review: 'orange',
  done: 'green',
};

export function TaskDetailPanel({
  task,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onArchive,
  onUnarchive,
  clients,
  users,
  categories,
}: TaskDetailPanelProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [comments, setComments] = useState<TaskCommentWithUser[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    titre: '',
    description: '',
    priorite: 'moyenne',
    assignee_id: '',
    client_id: '',
    category_id: '',
    date_echeance: '',
    progress: 0,
    estimated_hours: '',
  });

  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (task) {
      setEditData({
        titre: task.titre,
        description: task.description || '',
        priorite: task.priorite ?? 'moyenne',
        assignee_id: task.assignee_id || '',
        client_id: task.client_id || '',
        category_id: task.category_id || '',
        date_echeance: task.date_echeance || '',
        progress: task.progress || 0,
        estimated_hours: task.estimated_hours?.toString() || '',
      });
      loadComments();
      loadAttachments();
    }
  }, [task]);

  async function loadComments() {
    if (!task) return;
    try {
      const data = await loadTaskComments(task.id);
      setComments(data);
    } catch {
      showToast('Erreur lors du chargement des commentaires', 'error');
    }
  }

  async function loadAttachments() {
    if (!task) return;
    try {
      const data = await loadTaskAttachments(task.id);
      setAttachments(data);
    } catch {
      setAttachments([]);
    }
  }

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    if (!task || !profile) return;

    const MAX_SIZE = 10 * 1024 * 1024;
    const validFiles = Array.from(files).filter((f) => f.size <= MAX_SIZE);

    if (validFiles.length === 0) {
      showToast('Fichier trop volumineux (max 10 Mo)', 'error');
      return;
    }

    setIsUploading(true);
    try {
      for (const file of validFiles) {
        const attachment = await uploadTaskAttachment(task.id, file, profile.id);
        setAttachments((prev) => [...prev, attachment]);
      }
      showToast(`${validFiles.length} fichier(s) ajoute(s)`, 'success');
    } catch {
      showToast('Erreur lors de l\'upload', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [task, profile, showToast]);

  async function handleDeleteAttachment() {
    if (!deleteAttachmentId) return;
    const att = attachments.find((a) => a.id === deleteAttachmentId);
    if (!att) return;

    try {
      await deleteTaskAttachment(att.id, att.storage_path);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      setDeleteAttachmentId(null);
      showToast('Piece jointe supprimee', 'success');
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  async function handleDownloadAttachment(att: TaskAttachment) {
    try {
      const url = await getTaskAttachmentSignedUrl(att.storage_path);
      window.open(url, '_blank');
    } catch {
      showToast('Erreur lors du telechargement', 'error');
    }
  }

  function getFileIcon(mimeType: string) {
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType === 'application/pdf') return FileText;
    return File;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  async function handleAddComment() {
    if (!task || !profile || !newComment.trim()) return;

    try {
      const comment = await createTaskComment({
        task_id: task.id,
        user_id: profile.id,
        content: newComment.trim(),
      });
      setComments([...comments, comment]);
      setNewComment('');
      showToast('Commentaire ajouté', 'success');

      const commenterName = [profile.prenom, profile.nom].filter(Boolean).join(' ') || 'Un collaborateur';
      const usersToNotify = new Set<string>();
      if (task.assignee_id && task.assignee_id !== profile.id) usersToNotify.add(task.assignee_id);
      if (task.created_by && task.created_by !== profile.id) usersToNotify.add(task.created_by);
      usersToNotify.forEach((uid) => {
        createNotification(uid, 'task_commented', 'Nouveau commentaire', `${commenterName} a commente la tache "${task.titre}"`, '/tasks');
      });
    } catch {
      showToast('Erreur lors de l\'ajout du commentaire', 'error');
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await deleteTaskComment(commentId);
      setComments(comments.filter((c) => c.id !== commentId));
      setDeleteCommentId(null);
      showToast('Commentaire supprimé', 'success');
    } catch {
      showToast('Erreur lors de la suppression du commentaire', 'error');
    }
  }

  async function handleSave() {
    if (!task || !editData.titre.trim()) return;

    setIsSaving(true);
    try {
      const newAssignee = editData.assignee_id || null;
      await updateTask(task.id, {
        titre: editData.titre.trim(),
        description: editData.description.trim() || null,
        priorite: editData.priorite,
        assignee_id: newAssignee,
        client_id: editData.client_id || null,
        category_id: editData.category_id || null,
        date_echeance: editData.date_echeance || null,
        progress: editData.progress,
        estimated_hours: editData.estimated_hours ? parseFloat(editData.estimated_hours) : null,
      });

      setIsEditing(false);
      showToast('Tache mise à jour', 'success');
      onUpdate();
    } catch {
      showToast('Erreur lors de la mise à jour', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!task || newStatus === task.statut) return;

    try {
      await updateTask(task.id, { statut: newStatus });

      if (task.assignee_id && task.assignee_id !== profile?.id) {
        createNotification(task.assignee_id, 'task_status_changed', 'Statut de tache modifie', `La tache "${task.titre}" est passee en "${STATUT_LABELS[newStatus]}"`, '/tasks');
      }

      showToast(`Statut changé : ${STATUT_LABELS[newStatus]}`, 'success');
      onUpdate();
    } catch {
      showToast('Erreur lors du changement de statut', 'error');
    }
  }

  async function handleDelete() {
    if (!task) return;

    try {
      await deleteTask(task.id);
      showToast('Tache supprimée', 'success');
      setShowDeleteConfirm(false);
      onDelete();
      onClose();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  // `tasks.priorite` est nullable en base (DEFAULT 'moyenne', pas de NOT NULL).
function getPriorityVariant(priorite: string | null) {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
      basse: 'default',
      moyenne: 'info',
      haute: 'warning',
      urgente: 'danger',
    };
    return (priorite ? variants[priorite] : undefined) || 'default';
  }

  function isOverdue(dateEcheance: string | null) {
    if (!dateEcheance) return false;
    return new Date(dateEcheance) < new Date() && task?.statut !== 'done';
  }

  if (!isOpen || !task) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Détails de la tâche</h2>
          <div className="flex items-center gap-2">
            {!task.is_archived && !isEditing && (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                <Edit2 className="w-4 h-4 mr-2" />
                Modifier
              </Button>
            )}
            {isEditing && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
                  Annuler
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {task.is_archived && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <Archive className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <span className="font-medium">Tache archivee</span>
                {task.archived_at && (
                  <span> le {new Date(task.archived_at).toLocaleDateString('fr-FR')}</span>
                )}
                {task.archiver ? (
                  <span> par {task.archiver.prenom} {task.archiver.nom}</span>
                ) : task.archived_at ? (
                  <span> (archivage automatique)</span>
                ) : null}
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-4">
              <Input
                label="Titre"
                value={editData.titre}
                onChange={(e) => setEditData({ ...editData, titre: e.target.value })}
                required
              />

              <Textarea
                label="Description"
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                rows={4}
              />

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Priorité"
                  value={editData.priorite}
                  onChange={(e) => setEditData({ ...editData, priorite: e.target.value })}
                  options={[
                    { value: 'basse', label: 'Basse' },
                    { value: 'moyenne', label: 'Moyenne' },
                    { value: 'haute', label: 'Haute' },
                    { value: 'urgente', label: 'Urgente' },
                  ]}
                />

                <Select
                  label="Catégorie"
                  value={editData.category_id}
                  onChange={(e) => setEditData({ ...editData, category_id: e.target.value })}
                  options={[
                    { value: '', label: 'Aucune catégorie' },
                    ...categories.map((c) => ({ value: c.id, label: c.nom })),
                  ]}
                />
              </div>

              <Select
                label="Assigné à"
                value={editData.assignee_id}
                onChange={(e) => setEditData({ ...editData, assignee_id: e.target.value })}
                options={[
                  { value: '', label: 'Non assigné' },
                  ...users.map((u) => ({
                    value: u.id,
                    label: `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Sans nom',
                  })),
                ]}
              />

              <SearchableSelect
                label="Client"
                value={editData.client_id}
                onChange={(val) => setEditData({ ...editData, client_id: val })}
                placeholder="Rechercher un client..."
                options={clients.map((c) => ({ value: c.id, label: c.nom_entreprise }))}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Date d'échéance"
                  type="date"
                  value={editData.date_echeance}
                  onChange={(e) => setEditData({ ...editData, date_echeance: e.target.value })}
                />

                <Input
                  label="Heures estimées"
                  type="number"
                  step="0.5"
                  min="0"
                  value={editData.estimated_hours}
                  onChange={(e) => setEditData({ ...editData, estimated_hours: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Avancement : {editData.progress}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={editData.progress}
                  onChange={(e) => setEditData({ ...editData, progress: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{task.titre}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={getPriorityVariant(task.priorite)}>{task.priorite}</Badge>
                  <Badge variant="default">{STATUT_LABELS[task.statut ?? 'todo']}</Badge>
                  {task.task_categories && (
                    <Badge
                      variant="default"
                      style={{ backgroundColor: task.task_categories.couleur, color: '#fff' }}
                    >
                      {task.task_categories.nom}
                    </Badge>
                  )}
                  {isOverdue(task.date_echeance) && (
                    <Badge variant="danger">En retard</Badge>
                  )}
                </div>
              </div>

              {task.description && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Description</h4>
                  <p className="text-gray-600 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <User className="w-4 h-4 mr-1" />
                    Assigné à
                  </h4>
                  {task.profiles ? (
                    <div className="flex items-center gap-2">
                      <CollaboratorAvatar
                        name={`${task.profiles.prenom || ''} ${task.profiles.nom || ''}`.trim()}
                        avatarUrl={task.profiles.avatar_url}
                        avatarColor={task.profiles.avatar_color}
                        size="sm"
                      />
                      <span className="text-gray-900">
                        {task.profiles.prenom} {task.profiles.nom}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-500 text-sm">Non assigné</span>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Tag className="w-4 h-4 mr-1" />
                    Client
                  </h4>
                  {task.clients ? (
                    <span className="text-gray-900">{task.clients.nom_entreprise}</span>
                  ) : (
                    <span className="text-gray-500 text-sm">Aucun client</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    Échéance
                  </h4>
                  {task.date_echeance ? (
                    <span className={isOverdue(task.date_echeance) ? 'text-red-600 font-medium' : 'text-gray-900'}>
                      {new Date(task.date_echeance).toLocaleDateString('fr-FR')}
                    </span>
                  ) : (
                    <span className="text-gray-500 text-sm">Aucune échéance</span>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    Temps estimé
                  </h4>
                  {task.estimated_hours ? (
                    <span className="text-gray-900">{task.estimated_hours}h</span>
                  ) : (
                    <span className="text-gray-500 text-sm">Non défini</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Avancement : {task.progress}%</h4>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-teal-600 h-2 rounded-full transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>

              {task.creator && (
                <div className="text-sm text-gray-500">
                  Créée par {task.creator.prenom} {task.creator.nom} le{' '}
                  {task.created_at && new Date(task.created_at).toLocaleDateString('fr-FR')}
                </div>
              )}
            </div>
          )}

          {!task.is_archived && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Changer le statut</h4>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Select
                    value={task.statut ?? 'todo'}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    options={STATUT_WORKFLOW.map((status) => ({
                      value: status,
                      label: STATUT_LABELS[status],
                    }))}
                  />
                </div>
                <Badge variant={STATUT_COLORS[task.statut ?? 'todo']}>
                  {STATUT_LABELS[task.statut ?? 'todo']}
                </Badge>
              </div>
            </div>
          )}

          {!task.is_archived && profile && (
            <div className="border-t pt-4">
              <TaskChecklistSection
                taskId={task.id}
                userId={profile.id}
              />
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
              <MessageSquare className="w-4 h-4 mr-2" />
              Commentaires ({comments.length})
            </h4>

            <div className="space-y-3 mb-4">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CollaboratorAvatar
                        name={comment.profiles.display_name || `${comment.profiles.prenom || ''} ${comment.profiles.nom || ''}`.trim()}
                        avatarUrl={comment.profiles.avatar_url}
                        avatarColor={comment.profiles.avatar_color}
                        size="sm"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {comment.profiles.display_name || `${comment.profiles.prenom} ${comment.profiles.nom}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {comment.created_at && new Date(comment.created_at).toLocaleString('fr-FR')}
                        </div>
                      </div>
                    </div>
                    {comment.user_id === profile?.id && !task.is_archived && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteCommentId(comment.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                </div>
              ))}
            </div>

            {!task.is_archived && (
              <div className="flex gap-2">
                <Textarea
                  placeholder="Ajouter un commentaire..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                />
                <Button onClick={handleAddComment} disabled={!newComment.trim()}>
                  Envoyer
                </Button>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center">
              <Paperclip className="w-4 h-4 mr-2" />
              Pieces jointes ({attachments.length})
            </h4>

            {attachments.length > 0 && (
              <div className="space-y-2 mb-3">
                {attachments.map((att) => {
                  const Icon = getFileIcon(att.mime_type);
                  return (
                    <div
                      key={att.id}
                      className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg group"
                    >
                      <Icon className="w-5 h-5 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(att)}
                          className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-teal-600 dark:hover:text-teal-400 truncate block max-w-full text-left transition-colors"
                        >
                          {att.file_name}
                        </button>
                        <p className="text-xs text-gray-400">
                          {formatFileSize(att.file_size)} - {new Date(att.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="p-1.5 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Telecharger"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {!task.is_archived && (
                        <button
                          type="button"
                          onClick={() => setDeleteAttachmentId(att.id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!task.is_archived && (
              <div
                className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                  dragOver
                    ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files);
                  }}
                />
                <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isUploading ? (
                    <span className="text-teal-600">Upload en cours...</span>
                  ) : (
                    <>
                      Glissez un fichier ou{' '}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-teal-600 dark:text-teal-400 hover:underline font-medium"
                      >
                        parcourir
                      </button>
                    </>
                  )}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">PDF, images, Word, Excel - 10 Mo max</p>
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            {task.is_archived ? (
              <Button variant="outline" onClick={() => onUnarchive(task.id)} className="w-full">
                <ArchiveRestore className="w-4 h-4 mr-2" />
                Desarchiver
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setShowArchiveConfirm(true)} className="w-full">
                <Archive className="w-4 h-4 mr-2" />
                Archiver
              </Button>
            )}
            <Button variant="danger" onClick={() => setShowDeleteConfirm(true)} className="w-full">
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer la tâche
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Supprimer la tâche"
        message="Êtes-vous sûr de vouloir supprimer cette tâche ? Cette action est irréversible."
        variant="danger"
        confirmText="Supprimer"
      />

      <ConfirmDialog
        isOpen={deleteCommentId !== null}
        onClose={() => setDeleteCommentId(null)}
        onConfirm={() => deleteCommentId && handleDeleteComment(deleteCommentId)}
        title="Supprimer le commentaire"
        message="Êtes-vous sûr de vouloir supprimer ce commentaire ?"
        variant="danger"
        confirmText="Supprimer"
      />

      <ConfirmDialog
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={() => {
          setShowArchiveConfirm(false);
          onArchive(task.id);
        }}
        title="Archiver la tache"
        message="Cette tache n'apparaitra plus dans la vue principale mais restera accessible dans les archives. Continuer ?"
        variant="warning"
        confirmText="Archiver"
      />

      <ConfirmDialog
        isOpen={deleteAttachmentId !== null}
        onClose={() => setDeleteAttachmentId(null)}
        onConfirm={handleDeleteAttachment}
        title="Supprimer la piece jointe"
        message="Ce fichier sera definitivement supprime. Continuer ?"
        variant="danger"
        confirmText="Supprimer"
      />
    </>
  );
}
