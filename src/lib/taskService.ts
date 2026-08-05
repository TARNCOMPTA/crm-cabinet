import { supabase } from './supabase';
import { Database } from '../types/database';

type Task = Database['public']['Tables']['tasks']['Row'];
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type TaskTemplate = Database['public']['Tables']['task_templates']['Row'];
type TaskTemplateInsert = Database['public']['Tables']['task_templates']['Insert'];
type TaskTemplateUpdate = Database['public']['Tables']['task_templates']['Update'];
type TaskCategory = Database['public']['Tables']['task_categories']['Row'];
type TaskCategoryInsert = Database['public']['Tables']['task_categories']['Insert'];
type TaskCategoryUpdate = Database['public']['Tables']['task_categories']['Update'];
type TaskComment = Database['public']['Tables']['task_comments']['Row'];
type TaskCommentInsert = Database['public']['Tables']['task_comments']['Insert'];
type Notification = Database['public']['Tables']['notifications']['Row'];

export interface TaskWithRelations extends Task {
  clients?: { nom_entreprise: string } | null;
  // `avatar_color` figure dans les requetes et est lue par les trois vues de
  // taches ; elle manquait ici, d'ou les TS2339. Une des cinq requetes ne la
  // demandait pas non plus : la pastille du responsable y perdait sa couleur.
  profiles?: {
    prenom: string | null;
    nom: string | null;
    avatar_url: string | null;
    avatar_color?: string | null;
  } | null;
  task_categories?: { nom: string; couleur: string; icone: string } | null;
  creator?: { prenom: string | null; nom: string | null } | null;
  task_templates?: { titre: string } | null;
  archiver?: { prenom: string | null; nom: string | null } | null;
}

export interface TaskCommentWithUser extends TaskComment {
  profiles: {
    prenom: string | null;
    nom: string | null;
    avatar_url: string | null;
    avatar_color?: string | null;
    display_name: string | null;
  };
}

export interface TaskTemplateWithCategory extends TaskTemplate {
  task_categories?: { nom: string; couleur: string; icone: string } | null;
}

export async function loadTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      clients(nom_entreprise),
      profiles:profiles!tasks_assignee_id_fkey(prenom, nom, avatar_url, avatar_color),
      task_categories(nom, couleur, icone),
      creator:profiles!tasks_created_by_fkey(prenom, nom),
      task_templates(titre)
    `)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as TaskWithRelations[];
}

export async function loadArchivedTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      clients(nom_entreprise),
      profiles:profiles!tasks_assignee_id_fkey(prenom, nom, avatar_url, avatar_color),
      task_categories(nom, couleur, icone),
      creator:profiles!tasks_created_by_fkey(prenom, nom),
      task_templates(titre),
      archiver:profiles!tasks_archived_by_fkey(prenom, nom)
    `)
    .eq('is_archived', true)
    .order('archived_at', { ascending: false });

  if (error) throw error;
  return data as TaskWithRelations[];
}

export async function getArchivedTaskCount() {
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('is_archived', true);

  if (error) throw error;
  return count || 0;
}

export async function archiveTask(taskId: string, userId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: userId,
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function unarchiveTask(taskId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_archived: false,
      archived_at: null,
      archived_by: null,
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function archiveCompletedTasks(userId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: userId,
    })
    .eq('statut', 'done')
    .eq('is_archived', false)
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

export async function loadTaskById(taskId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      clients(nom_entreprise),
      profiles:profiles!tasks_assignee_id_fkey(prenom, nom, avatar_url, avatar_color),
      task_categories(nom, couleur, icone),
      creator:profiles!tasks_created_by_fkey(prenom, nom),
      task_templates(titre)
    `)
    .eq('id', taskId)
    .maybeSingle();

  if (error) throw error;
  return data as TaskWithRelations | null;
}

export async function createTask(task: TaskInsert) {
  const { data, error } = await supabase
    .from('tasks')
    .insert([task])
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function updateTask(taskId: string, updates: TaskUpdate) {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function deleteTask(taskId: string) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw error;
}

export async function loadTaskTemplates(activeOnly = false) {
  let query = supabase
    .from('task_templates')
    .select('*, task_categories(nom, couleur, icone)');

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('position');

  if (error) throw error;
  return data as TaskTemplateWithCategory[];
}

export async function createTaskTemplate(template: TaskTemplateInsert) {
  const { data, error } = await supabase
    .from('task_templates')
    .insert([template])
    .select()
    .single();

  if (error) throw error;
  return data as TaskTemplate;
}

export async function updateTaskTemplate(templateId: string, updates: TaskTemplateUpdate) {
  const { data, error } = await supabase
    .from('task_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single();

  if (error) throw error;
  return data as TaskTemplate;
}

export async function deleteTaskTemplate(templateId: string) {
  const { error } = await supabase
    .from('task_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw error;
}

export async function loadTaskCategories(activeOnly = false) {
  let query = supabase
    .from('task_categories')
    .select('id, nom, couleur, icone, position, is_active, created_at');

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('position');

  if (error) throw error;
  return data as TaskCategory[];
}

export async function createTaskCategory(category: TaskCategoryInsert) {
  const { data, error } = await supabase
    .from('task_categories')
    .insert([category])
    .select()
    .single();

  if (error) throw error;
  return data as TaskCategory;
}

export async function updateTaskCategory(categoryId: string, updates: TaskCategoryUpdate) {
  const { data, error } = await supabase
    .from('task_categories')
    .update(updates)
    .eq('id', categoryId)
    .select()
    .single();

  if (error) throw error;
  return data as TaskCategory;
}

export async function deleteTaskCategory(categoryId: string) {
  const { error } = await supabase
    .from('task_categories')
    .delete()
    .eq('id', categoryId);

  if (error) throw error;
}

export async function loadTaskComments(taskId: string) {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*, profiles(prenom, nom, avatar_url, avatar_color, display_name)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as TaskCommentWithUser[];
}

export async function createTaskComment(comment: TaskCommentInsert) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert([comment])
    .select('*, profiles(prenom, nom, avatar_url, avatar_color, display_name)')
    .single();

  if (error) throw error;
  return data as TaskCommentWithUser;
}

export async function deleteTaskComment(commentId: string) {
  const { error } = await supabase
    .from('task_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
}

export async function loadNotifications(userId: string, unreadOnly = false) {
  let query = supabase
    .from('notifications')
    .select('id, user_id, type, title, message, link, is_read, created_at')
    .eq('user_id', userId);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationAsRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function markAllNotificationsAsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}

export async function deleteNotification(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) throw error;
}

export async function getUnreadNotificationCount(userId: string) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return count || 0;
}

// --- Task Attachments ---

export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

export async function loadTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data, error } = await supabase
    .from('task_attachments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as TaskAttachment[];
}

export async function uploadTaskAttachment(
  taskId: string,
  file: File,
  userId: string
): Promise<TaskAttachment> {
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${taskId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('task-attachments')
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('task_attachments')
    .insert({
      task_id: taskId,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TaskAttachment;
}

export async function deleteTaskAttachment(
  attachmentId: string,
  storagePath: string
): Promise<void> {
  await supabase.storage
    .from('task-attachments')
    .remove([storagePath]);

  const { error } = await supabase
    .from('task_attachments')
    .delete()
    .eq('id', attachmentId);

  if (error) throw error;
}

export async function getTaskAttachmentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('task-attachments')
    .createSignedUrl(storagePath, 3600);

  if (error) throw error;
  return data.signedUrl;
}

export async function countTaskAttachments(
  taskIds: string[]
): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};

  const { data, error } = await supabase
    .from('task_attachments')
    .select('task_id')
    .in('task_id', taskIds);

  if (error) return {};

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.task_id] = (counts[row.task_id] || 0) + 1;
  }
  return counts;
}
