import { supabase } from './supabase';
import type { Checklist, ChecklistItem, ChecklistTemplate, ChecklistTemplateItem, ChecklistItemComment, ChecklistItemAttachment } from '../types/database';

export interface ChecklistWithItems extends Checklist {
  items: ChecklistItem[];
  owner?: { prenom: string | null; nom: string | null } | null;
  client?: { id: string; nom_entreprise: string } | null;
}

export async function loadChecklists(
  userId: string): Promise<ChecklistWithItems[]> {
  const { data, error } = await supabase
    .from('checklists')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const checklists = (data || []) as Checklist[];
  if (checklists.length === 0) return [];

  const ids = checklists.map((c) => c.id);
  const { data: items, error: itemsError } = await supabase
    .from('checklist_items')
    .select('*')
    .in('checklist_id', ids)
    .order('position', { ascending: true });

  if (itemsError) throw itemsError;

  const ownerIds = [...new Set(checklists.filter((c) => c.user_id !== userId).map((c) => c.user_id))];
  let ownerMap: Record<string, { prenom: string | null; nom: string | null }> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, prenom, nom')
      .in('id', ownerIds);
    if (profiles) {
      ownerMap = Object.fromEntries(profiles.map((p) => [p.id, { prenom: p.prenom, nom: p.nom }]));
    }
  }

  const itemsByChecklist = (items || []).reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.checklist_id] ??= []).push(item as ChecklistItem);
    return acc;
  }, {});

  const clientIds = [...new Set(checklists.filter((c) => c.client_id).map((c) => c.client_id!))];
  let clientMap: Record<string, { id: string; nom_entreprise: string }> = {};
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, nom_entreprise')
      .in('id', clientIds);
    if (clients) {
      clientMap = Object.fromEntries(clients.map((cl) => [cl.id, { id: cl.id, nom_entreprise: cl.nom_entreprise }]));
    }
  }

  return checklists.map((c) => ({
    ...c,
    items: itemsByChecklist[c.id] || [],
    owner: c.user_id !== userId ? ownerMap[c.user_id] || null : null,
    client: c.client_id ? clientMap[c.client_id] || null : null,
  }));
}

export async function createChecklist(
  userId: string,
  title: string,
  isShared: boolean,
  clientId?: string | null
): Promise<Checklist> {
  const { data, error } = await supabase
    .from('checklists')
    .insert({
      user_id: userId,
      title,
      is_shared: isShared,
      ...(clientId ? { client_id: clientId } : {}),
    })
    .select()
    .single();

  if (error) throw error;
  return data as Checklist;
}

export async function updateChecklist(
  id: string,
  updates: { title?: string; is_shared?: boolean }
): Promise<void> {
  const { error } = await supabase
    .from('checklists')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteChecklist(id: string): Promise<void> {
  const { error } = await supabase.from('checklists').delete().eq('id', id);
  if (error) throw error;
}

export async function addChecklistItem(
  checklistId: string,
  label: string,
  position: number
): Promise<ChecklistItem> {
  const { data, error } = await supabase
    .from('checklist_items')
    .insert({ checklist_id: checklistId, label, position })
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from('checklists')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', checklistId);

  return data as ChecklistItem;
}

export async function updateChecklistItem(
  id: string,
  updates: { label?: string; is_checked?: boolean; position?: number }
): Promise<void> {
  const { error } = await supabase
    .from('checklist_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from('checklist_items').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Réordonne les lignes d'une checklist.
 *
 * Les mises à jour partent ENSEMBLE, pas l'une après l'autre. Le glisser-déposer
 * renumérote toute la liste : à vingt lignes, la boucle séquentielle enchaînait
 * vingt allers-retours, chacun payant la latence du serveur — une à deux
 * secondes de décalage entre le lâcher de la souris et l'état enregistré. En
 * parallèle, l'attente ne coûte plus qu'un aller-retour.
 *
 * Pourquoi pas un seul `upsert` : `checklist_items` a des colonnes NOT NULL sans
 * valeur par défaut (`checklist_id`, `label`), que PostgreSQL vérifie sur la
 * ligne proposée AVANT de résoudre le conflit. Un upsert portant les seules
 * `id`/`position` échouerait donc, alors même qu'aucune ligne ne serait insérée.
 */
export async function reorderChecklistItems(
  items: Array<{ id: string; position: number }>
): Promise<void> {
  const horodatage = new Date().toISOString();

  const resultats = await Promise.all(
    items.map((item) =>
      supabase
        .from('checklist_items')
        .update({ position: item.position, updated_at: horodatage })
        .eq('id', item.id)
    )
  );

  // Une erreur passée sous silence laisserait l'ordre affiché diverger de l'ordre
  // enregistré, ce que l'utilisateur ne découvrirait qu'au rechargement.
  const echec = resultats.find((r) => r.error);
  if (echec?.error) throw echec.error;
}

// --- Template functions ---

export interface ChecklistTemplateWithItems extends ChecklistTemplate {
  items: ChecklistTemplateItem[];
  owner?: { prenom: string | null; nom: string | null } | null;
}

export async function loadTemplates(
  userId: string): Promise<ChecklistTemplateWithItems[]> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const templates = (data || []) as ChecklistTemplate[];
  if (templates.length === 0) return [];

  const ids = templates.map((t) => t.id);
  const { data: items, error: itemsError } = await supabase
    .from('checklist_template_items')
    .select('*')
    .in('template_id', ids)
    .order('position', { ascending: true });

  if (itemsError) throw itemsError;

  const ownerIds = [...new Set(templates.filter((t) => t.user_id !== userId).map((t) => t.user_id))];
  let ownerMap: Record<string, { prenom: string | null; nom: string | null }> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, prenom, nom')
      .in('id', ownerIds);
    if (profiles) {
      ownerMap = Object.fromEntries(profiles.map((p) => [p.id, { prenom: p.prenom, nom: p.nom }]));
    }
  }

  const itemsByTemplate = (items || []).reduce<Record<string, ChecklistTemplateItem[]>>((acc, item) => {
    (acc[item.template_id] ??= []).push(item as ChecklistTemplateItem);
    return acc;
  }, {});

  return templates.map((t) => ({
    ...t,
    items: itemsByTemplate[t.id] || [],
    owner: t.user_id !== userId ? ownerMap[t.user_id] || null : null,
  }));
}

export async function createTemplate(
  userId: string,
  title: string,
  isShared: boolean,
  items: string[]
): Promise<ChecklistTemplate> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .insert({ user_id: userId, title, is_shared: isShared })
    .select()
    .single();

  if (error) throw error;
  const template = data as ChecklistTemplate;

  if (items.length > 0) {
    const rows = items.map((label, i) => ({
      template_id: template.id,
      label,
      position: i,
    }));
    await supabase.from('checklist_template_items').insert(rows);
  }

  return template;
}

export async function updateTemplate(
  id: string,
  updates: { title?: string; is_shared?: boolean }
): Promise<void> {
  const { error } = await supabase
    .from('checklist_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('checklist_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function addTemplateItem(
  templateId: string,
  label: string,
  position: number
): Promise<ChecklistTemplateItem> {
  const { data, error } = await supabase
    .from('checklist_template_items')
    .insert({ template_id: templateId, label, position })
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from('checklist_templates')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', templateId);

  return data as ChecklistTemplateItem;
}

export async function updateTemplateItem(
  id: string,
  updates: { label?: string; position?: number }
): Promise<void> {
  const { error } = await supabase
    .from('checklist_template_items')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteTemplateItem(id: string): Promise<void> {
  const { error } = await supabase.from('checklist_template_items').delete().eq('id', id);
  if (error) throw error;
}

/** Même chose pour les modèles : voir reorderChecklistItems. */
export async function reorderTemplateItems(
  items: Array<{ id: string; position: number }>
): Promise<void> {
  const resultats = await Promise.all(
    items.map((item) =>
      supabase
        .from('checklist_template_items')
        .update({ position: item.position })
        .eq('id', item.id)
    )
  );

  const echec = resultats.find((r) => r.error);
  if (echec?.error) throw echec.error;
}

export async function createChecklistFromTemplate(
  userId: string,
  template: ChecklistTemplateWithItems,
  isShared: boolean,
  clientId?: string | null
): Promise<Checklist> {
  const { data, error } = await supabase
    .from('checklists')
    .insert({
      user_id: userId,
      title: template.title,
      is_shared: isShared,
      ...(clientId ? { client_id: clientId } : {}),
    })
    .select()
    .single();

  if (error) throw error;
  const checklist = data as Checklist;

  if (template.items.length > 0) {
    const rows = template.items.map((item, i) => ({
      checklist_id: checklist.id,
      label: item.label,
      position: i,
      is_checked: false,
    }));
    await supabase.from('checklist_items').insert(rows);
  }

  return checklist;
}

export async function searchClients(
  query: string
): Promise<Array<{ id: string; nom_entreprise: string; numero_dossier: string | null }>> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, numero_dossier')
    .ilike('nom_entreprise', `%${query}%`)
    .limit(10);

  if (error) throw error;
  return data || [];
}

// --- Item Comments ---

export async function loadItemComments(itemId: string): Promise<ChecklistItemComment[]> {
  const { data, error } = await supabase
    .from('checklist_item_comments')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const comments = (data || []) as ChecklistItemComment[];
  if (comments.length === 0) return [];

  const userIds = [...new Set(comments.map((c) => c.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, prenom, nom')
    .in('id', userIds);

  const profileMap = Object.fromEntries(
    (profiles || []).map((p) => [p.id, { prenom: p.prenom, nom: p.nom }])
  );

  return comments.map((c) => ({
    ...c,
    author: profileMap[c.user_id] || null,
  }));
}

export async function addItemComment(
  itemId: string,
  userId: string,
  content: string
): Promise<ChecklistItemComment> {
  const { data, error } = await supabase
    .from('checklist_item_comments')
    .insert({ item_id: itemId, user_id: userId, content })
    .select()
    .single();

  if (error) throw error;
  return data as ChecklistItemComment;
}

export async function deleteItemComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('checklist_item_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw error;
}

// --- Item Attachments ---

export async function loadItemAttachments(itemId: string): Promise<ChecklistItemAttachment[]> {
  const { data, error } = await supabase
    .from('checklist_item_attachments')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as ChecklistItemAttachment[];
}

export async function uploadItemAttachment(
  itemId: string,
  file: File,
  userId: string
): Promise<ChecklistItemAttachment> {
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${itemId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('checklist-item-attachments')
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('checklist_item_attachments')
    .insert({
      item_id: itemId,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ChecklistItemAttachment;
}

export async function deleteItemAttachment(
  attachmentId: string,
  storagePath: string
): Promise<void> {
  await supabase.storage
    .from('checklist-item-attachments')
    .remove([storagePath]);

  const { error } = await supabase
    .from('checklist_item_attachments')
    .delete()
    .eq('id', attachmentId);

  if (error) throw error;
}

export function getAttachmentUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from('checklist-item-attachments')
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function getAttachmentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('checklist-item-attachments')
    .createSignedUrl(storagePath, 3600);

  if (error) throw error;
  return data.signedUrl;
}

export async function loadItemMetaCounts(
  itemIds: string[]
): Promise<Record<string, { comments: number; attachments: number }>> {
  if (itemIds.length === 0) return {};

  const [commentsRes, attachmentsRes] = await Promise.all([
    supabase
      .from('checklist_item_comments')
      .select('item_id')
      .in('item_id', itemIds),
    supabase
      .from('checklist_item_attachments')
      .select('item_id')
      .in('item_id', itemIds),
  ]);

  const counts: Record<string, { comments: number; attachments: number }> = {};
  for (const id of itemIds) {
    counts[id] = { comments: 0, attachments: 0 };
  }

  if (commentsRes.data) {
    for (const row of commentsRes.data) {
      if (counts[row.item_id]) counts[row.item_id].comments++;
    }
  }

  if (attachmentsRes.data) {
    for (const row of attachmentsRes.data) {
      if (counts[row.item_id]) counts[row.item_id].attachments++;
    }
  }

  return counts;
}

// --- Opportunity Checklists ---

export async function loadChecklistsForOpportunity(
  opportunityCardId: string
): Promise<ChecklistWithItems[]> {
  const { data, error } = await supabase
    .from('checklists')
    .select('*')
    .eq('opportunity_card_id', opportunityCardId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const checklists = (data || []) as Checklist[];
  if (checklists.length === 0) return [];

  const ids = checklists.map((c) => c.id);
  const { data: items, error: itemsError } = await supabase
    .from('checklist_items')
    .select('*')
    .in('checklist_id', ids)
    .order('position', { ascending: true });

  if (itemsError) throw itemsError;

  const itemsByChecklist = (items || []).reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.checklist_id] ??= []).push(item as ChecklistItem);
    return acc;
  }, {});

  return checklists.map((c) => ({
    ...c,
    items: itemsByChecklist[c.id] || [],
  }));
}

export async function createChecklistForOpportunity(
  userId: string,
  opportunityCardId: string,
  title: string
): Promise<Checklist> {
  const { data, error } = await supabase
    .from('checklists')
    .insert({
      user_id: userId,
      title,
      is_shared: true,
      opportunity_card_id: opportunityCardId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Checklist;
}

export async function createChecklistFromTemplateForOpportunity(
  userId: string,
  opportunityCardId: string,
  template: ChecklistTemplateWithItems
): Promise<Checklist> {
  const { data, error } = await supabase
    .from('checklists')
    .insert({
      user_id: userId,
      title: template.title,
      is_shared: true,
      opportunity_card_id: opportunityCardId,
    })
    .select()
    .single();

  if (error) throw error;
  const checklist = data as Checklist;

  if (template.items.length > 0) {
    const rows = template.items.map((item, i) => ({
      checklist_id: checklist.id,
      label: item.label,
      position: i,
      is_checked: false,
    }));
    await supabase.from('checklist_items').insert(rows);
  }

  return checklist;
}

export async function loadOpportunityChecklistCounts(
  cardIds: string[]
): Promise<Record<string, { total: number; checked: number }>> {
  if (cardIds.length === 0) return {};

  const { data: checklists, error } = await supabase
    .from('checklists')
    .select('id, opportunity_card_id')
    .in('opportunity_card_id', cardIds);

  if (error || !checklists || checklists.length === 0) return {};

  const checklistIds = checklists.map((c) => c.id);
  const { data: items } = await supabase
    .from('checklist_items')
    .select('checklist_id, is_checked')
    .in('checklist_id', checklistIds);

  const checklistToCard: Record<string, string> = {};
  for (const c of checklists) {
    if (c.opportunity_card_id) checklistToCard[c.id] = c.opportunity_card_id;
  }

  const counts: Record<string, { total: number; checked: number }> = {};
  if (items) {
    for (const item of items) {
      const cardId = checklistToCard[item.checklist_id];
      if (!cardId) continue;
      if (!counts[cardId]) counts[cardId] = { total: 0, checked: 0 };
      counts[cardId].total++;
      if (item.is_checked) counts[cardId].checked++;
    }
  }

  return counts;
}

// --- Task Checklists ---

export async function loadChecklistsForTask(
  taskId: string
): Promise<ChecklistWithItems[]> {
  const { data, error } = await supabase
    .from('checklists')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const checklists = (data || []) as Checklist[];
  if (checklists.length === 0) return [];

  const ids = checklists.map((c) => c.id);
  const { data: items, error: itemsError } = await supabase
    .from('checklist_items')
    .select('*')
    .in('checklist_id', ids)
    .order('position', { ascending: true });

  if (itemsError) throw itemsError;

  const itemsByChecklist = (items || []).reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.checklist_id] ??= []).push(item as ChecklistItem);
    return acc;
  }, {});

  return checklists.map((c) => ({
    ...c,
    items: itemsByChecklist[c.id] || [],
  }));
}

export async function createChecklistForTask(
  userId: string,
  taskId: string,
  title: string
): Promise<Checklist> {
  const { data, error } = await supabase
    .from('checklists')
    .insert({
      user_id: userId,
      title,
      is_shared: true,
      task_id: taskId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Checklist;
}

export async function createChecklistFromTemplateForTask(
  userId: string,
  taskId: string,
  template: ChecklistTemplateWithItems
): Promise<Checklist> {
  const { data, error } = await supabase
    .from('checklists')
    .insert({
      user_id: userId,
      title: template.title,
      is_shared: true,
      task_id: taskId,
    })
    .select()
    .single();

  if (error) throw error;
  const checklist = data as Checklist;

  if (template.items.length > 0) {
    const rows = template.items.map((item, i) => ({
      checklist_id: checklist.id,
      label: item.label,
      position: i,
      is_checked: false,
    }));
    await supabase.from('checklist_items').insert(rows);
  }

  return checklist;
}

export async function loadTaskChecklistCounts(
  taskIds: string[]
): Promise<Record<string, { total: number; checked: number }>> {
  if (taskIds.length === 0) return {};

  const { data: checklists, error } = await supabase
    .from('checklists')
    .select('id, task_id')
    .in('task_id', taskIds);

  if (error || !checklists || checklists.length === 0) return {};

  const checklistIds = checklists.map((c) => c.id);
  const { data: items } = await supabase
    .from('checklist_items')
    .select('checklist_id, is_checked')
    .in('checklist_id', checklistIds);

  const checklistToTask: Record<string, string> = {};
  for (const c of checklists) {
    if (c.task_id) checklistToTask[c.id] = c.task_id;
  }

  const counts: Record<string, { total: number; checked: number }> = {};
  if (items) {
    for (const item of items) {
      const taskId = checklistToTask[item.checklist_id];
      if (!taskId) continue;
      if (!counts[taskId]) counts[taskId] = { total: 0, checked: 0 };
      counts[taskId].total++;
      if (item.is_checked) counts[taskId].checked++;
    }
  }

  return counts;
}
