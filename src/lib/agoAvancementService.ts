import { supabase } from './supabase';

const db = supabase as unknown as { from: (table: string) => any };

export type AgoStatusColor = 'gray' | 'blue' | 'amber' | 'teal' | 'green' | 'emerald' | 'red' | 'rose' | 'orange' | 'slate';

export interface AgoAvancementStatus {
  id: string;
  label: string;
  color: AgoStatusColor;
  position: number;
  is_default: boolean;
  created_at: string;
}

export interface ClientAgoAvancement {
  id: string;
  client_id: string;
  exercice_year: number;
  status_id: string | null;
  updated_by: string | null;
  updated_at: string;
}

export const AGO_STATUS_COLORS: { value: AgoStatusColor; label: string; badgeClass: string; dotClass: string }[] = [
  { value: 'gray', label: 'Gris', badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', dotClass: 'bg-gray-400' },
  { value: 'blue', label: 'Bleu', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400', dotClass: 'bg-blue-500' },
  { value: 'amber', label: 'Ambre', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', dotClass: 'bg-amber-500' },
  { value: 'teal', label: 'Teal', badgeClass: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400', dotClass: 'bg-teal-500' },
  { value: 'green', label: 'Vert', badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', dotClass: 'bg-green-500' },
  { value: 'emerald', label: 'Emeraude', badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', dotClass: 'bg-emerald-500' },
  { value: 'red', label: 'Rouge', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', dotClass: 'bg-red-500' },
  { value: 'rose', label: 'Rose', badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400', dotClass: 'bg-rose-500' },
  { value: 'orange', label: 'Orange', badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400', dotClass: 'bg-orange-500' },
  { value: 'slate', label: 'Ardoise', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', dotClass: 'bg-slate-500' },
];

export function getAgoStatusBadgeClass(color: string | null | undefined): string {
  return AGO_STATUS_COLORS.find(c => c.value === color)?.badgeClass ?? AGO_STATUS_COLORS[0].badgeClass;
}

export function getAgoStatusDotClass(color: string | null | undefined): string {
  return AGO_STATUS_COLORS.find(c => c.value === color)?.dotClass ?? AGO_STATUS_COLORS[0].dotClass;
}

export async function listAgoStatuses(): Promise<AgoAvancementStatus[]> {
  const { data, error } = await db
    .from('ago_avancement_statuses')
    .select('*')
    .order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createAgoStatus(payload: { label: string; color: AgoStatusColor; position: number; is_default?: boolean }): Promise<AgoAvancementStatus> {
  if (payload.is_default) {
    await db
      .from('ago_avancement_statuses')
      .update({ is_default: false })
      .eq('is_default', true);
  }
  const { data, error } = await db
    .from('ago_avancement_statuses')
    .insert({ ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAgoStatus(id: string, payload: { label?: string; color?: AgoStatusColor; position?: number; is_default?: boolean }): Promise<void> {
  if (payload.is_default) {
    await db
      .from('ago_avancement_statuses')
      .update({ is_default: false })
      .eq('is_default', true);
  }
  const { error } = await db
    .from('ago_avancement_statuses')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAgoStatus(id: string): Promise<void> {
  const { error } = await db
    .from('ago_avancement_statuses')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function listClientAgoAvancements(exerciceYear?: number): Promise<ClientAgoAvancement[]> {
  let query = db
    .from('client_ago_avancements')
    .select('*');
  if (exerciceYear !== undefined) {
    query = query.eq('exercice_year', exerciceYear);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function upsertClientAgoAvancement(
  clientId: string,
  exerciceYear: number,
  statusId: string | null,
  userId: string | null
): Promise<void> {
  const { error } = await db
    .from('client_ago_avancements')
    .upsert(
      {
        client_id: clientId,
        exercice_year: exerciceYear,
        status_id: statusId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,exercice_year' }
    );
  if (error) throw error;
}
