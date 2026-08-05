import { supabase } from './supabase';

export async function fetchRowOrder(userId: string, context: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_row_orders')
    .select('row_id')
    .eq('user_id', userId)
    .eq('context', context)
    .order('position', { ascending: true });

  if (error) throw error;
  return (data || []).map((r) => r.row_id);
}

export async function saveRowOrder(userId: string, context: string, orderedIds: string[]): Promise<void> {
  const rows = orderedIds.map((rowId, index) => ({
    user_id: userId,
    context,
    row_id: rowId,
    position: index,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('user_row_orders')
    .upsert(rows, { onConflict: 'user_id,context,row_id' });

  if (error) throw error;
}

export async function deleteRowOrder(userId: string, context: string): Promise<void> {
  const { error } = await supabase
    .from('user_row_orders')
    .delete()
    .eq('user_id', userId)
    .eq('context', context);

  if (error) throw error;
}
