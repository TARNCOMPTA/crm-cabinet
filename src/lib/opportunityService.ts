import { supabase } from './supabase';
import type { OpportunityColumn } from '../types/database';

export async function initializeDefaults() {
  // initialize_opportunity_defaults() ne prend plus d'argument : son seul
  // parametre etait p_cabinet_id.
  const { error } = await supabase.rpc('initialize_opportunity_defaults');
  if (error) throw error;
}

export async function fetchColumns(): Promise<OpportunityColumn[]> {
  const { data, error } = await supabase
    .from('opportunity_columns')
    .select('id, name, color, position, created_at, updated_at')
    .order('position');

  if (error) throw error;
  return data || [];
}

export async function fetchCards(
  options: { showInactive?: boolean; assigneeId?: string | null } = {}
) {
  let query = supabase
    .from('opportunity_cards')
    .select(`
      *,
      clients(nom_entreprise, numero_dossier, siren, forme_juridique, statut),
      assignee:profiles!opportunity_cards_assignee_id_fkey(prenom, nom)
    `);

  if (options.assigneeId) {
    query = query.eq('assignee_id', options.assigneeId);
  }

  const { data, error } = await query.order('position');

  if (error) throw error;

  let results = data || [];
  if (!options.showInactive) {
    results = results.filter((c) => !c.clients || c.clients.statut !== 'inactif');
  }

  return results;
}

export async function moveCard(
  cardId: string,
  newColumnId: string,
  newPosition: number
) {
  const { error } = await supabase
    .from('opportunity_cards')
    .update({
      column_id: newColumnId,
      position: newPosition,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardId);

  if (error) throw error;
}

export async function createCard(data: {
  client_id?: string | null;
  column_id: string;
  assignee_id?: string | null;
  prospect_name?: string | null;
  montant_estime?: number | null;
  notes?: string | null;
  comment?: string | null;
  source?: string | null;
  date_relance?: string | null;
  created_by?: string | null;
  position?: number;
}) {
  const { error } = await supabase
    .from('opportunity_cards')
    .insert(data);

  if (error) throw error;
}

export async function updateCard(
  cardId: string,
  data: {
    column_id?: string;
    client_id?: string | null;
    assignee_id?: string | null;
    prospect_name?: string | null;
    montant_estime?: number | null;
    notes?: string | null;
    comment?: string | null;
    source?: string | null;
    date_relance?: string | null;
  }
) {
  const { error } = await supabase
    .from('opportunity_cards')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', cardId);

  if (error) throw error;
}

export async function deleteCard(cardId: string) {
  const { error } = await supabase
    .from('opportunity_cards')
    .delete()
    .eq('id', cardId);

  if (error) throw error;
}

export async function saveColumns(
  columns: Array<{ id?: string; name: string; color: string; position: number }>
) {
  const { data: existing, error: fetchErr } = await supabase
    .from('opportunity_columns')
    .select('id');

  if (fetchErr) throw fetchErr;

  const existingIds = new Set((existing || []).map((c) => c.id));
  const newColumnIds = new Set(columns.filter((c) => c.id).map((c) => c.id!));
  const toDelete = [...existingIds].filter((id) => !newColumnIds.has(id));

  if (toDelete.length > 0 && columns.length > 0) {
    const firstRemainingId = columns.find((c) => c.id)?.id || columns[0].id;

    // `.in()` dit en une requête ce que la boucle disait en autant de requêtes
    // qu'il y a de colonnes retirées. Le rapatriement des cartes doit rester
    // AVANT la suppression : une carte orpheline serait invisible dans le tableau.
    if (firstRemainingId) {
      const { error } = await supabase
        .from('opportunity_cards')
        .update({ column_id: firstRemainingId })
        .in('column_id', toDelete);
      if (error) throw error;
    }

    const { error: deleteErr } = await supabase
      .from('opportunity_columns')
      .delete()
      .in('id', toDelete);
    if (deleteErr) throw deleteErr;
  }

  // Les colonnes existantes se modifient en parallèle, et les nouvelles partent
  // en une seule insertion : l'enregistrement d'un tableau de six colonnes ne
  // fait plus six allers-retours à la suite.
  const aModifier = columns.filter((col) => col.id && existingIds.has(col.id));
  const aCreer = columns.filter((col) => !col.id || !existingIds.has(col.id));

  const resultats = await Promise.all(
    aModifier.map((col) =>
      supabase
        .from('opportunity_columns')
        .update({
          name: col.name,
          color: col.color,
          position: col.position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', col.id!)
    )
  );
  const echec = resultats.find((r) => r.error);
  if (echec?.error) throw echec.error;

  if (aCreer.length > 0) {
    const { error } = await supabase.from('opportunity_columns').insert(
      aCreer.map((col) => ({
        name: col.name,
        color: col.color,
        position: col.position,
      }))
    );
    if (error) throw error;
  }
}

export function getColumnColor(color: string) {
  const colors: Record<string, { bg: string; border: string; dot: string }> = {
    gray: { bg: 'bg-gray-50 dark:bg-gray-800/50', border: 'border-gray-200 dark:border-gray-700', dot: 'bg-gray-400' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
    green: { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-200 dark:border-green-800', dot: 'bg-green-500' },
    red: { bg: 'bg-red-50 dark:bg-red-950/40', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-500' },
    teal: { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800', dot: 'bg-teal-500' },
  };
  return colors[color] || colors.gray;
}

export const COLUMN_COLORS = [
  { value: 'gray', label: 'Gris' },
  { value: 'blue', label: 'Bleu' },
  { value: 'amber', label: 'Jaune' },
  { value: 'green', label: 'Vert' },
  { value: 'red', label: 'Rouge' },
  { value: 'teal', label: 'Turquoise' },
];

export function formatEuros(value: number | null | undefined): string {
  if (value == null) return '';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// --- Attachments ---

export interface OpportunityAttachment {
  id: string;
  card_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

export async function fetchAttachments(cardId: string): Promise<OpportunityAttachment[]> {
  const { data, error } = await supabase
    .from('opportunity_attachments')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function uploadAttachment(
  cardId: string,
  file: File,
  userId: string
): Promise<OpportunityAttachment> {
  const fileExt = file.name.split('.').pop() || 'bin';
  const storagePath = `${cardId}/${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('opportunity-attachments')
    .upload(storagePath, file);

  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from('opportunity_attachments')
    .insert({
      card_id: cardId,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (insertError) {
    await supabase.storage.from('opportunity-attachments').remove([storagePath]);
    throw insertError;
  }

  return data;
}

export async function deleteAttachment(attachmentId: string, storagePath: string) {
  const { error } = await supabase
    .from('opportunity_attachments')
    .delete()
    .eq('id', attachmentId);

  if (error) throw error;

  await supabase.storage.from('opportunity-attachments').remove([storagePath]);
}

export async function getAttachmentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('opportunity-attachments')
    .createSignedUrl(storagePath, 3600);

  if (error) throw error;
  return data.signedUrl;
}

export async function fetchAttachmentCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('opportunity_attachments')
    .select('card_id');

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.card_id] = (counts[row.card_id] || 0) + 1;
  }
  return counts;
}
