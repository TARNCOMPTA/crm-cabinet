import { supabase } from './supabase';
import type { Database } from '../types/database';

/**
 * Les deux formes viennent de la base plutot que d'une copie manuelle : elles
 * declaraient `created_at` et `updated_at` non nullables, alors que ces colonnes
 * portent un DEFAULT sans NOT NULL. Rien de ce que rend PostgREST ne pouvait
 * donc correspondre.
 */
export type DirectoryLink = Database['public']['Tables']['web_directory_links']['Row'];

export type DirectoryCategory =
  Database['public']['Tables']['web_directory_categories']['Row'] & {
    web_directory_links: DirectoryLink[];
  };

export async function fetchCategoriesWithLinks(): Promise<DirectoryCategory[]> {
  const { data, error } = await supabase
    .from('web_directory_categories')
    .select('*, web_directory_links(*)')
    .order('position', { ascending: true });

  if (error) throw error;

  return (data || []).map((cat) => ({
    ...cat,
    web_directory_links: (cat.web_directory_links || []).sort(
      (a: DirectoryLink, b: DirectoryLink) => a.position - b.position
    ),
  }));
}

export async function createCategory(
  data: { name: string; description?: string; icon?: string; color?: string }
) {
  const { data: maxPos } = await supabase
    .from('web_directory_categories')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = maxPos ? maxPos.position + 1 : 0;

  const { data: category, error } = await supabase
    .from('web_directory_categories')
    .insert({
      name: data.name,
      description: data.description || null,
      icon: data.icon || null,
      color: data.color || null,
      position: nextPosition,
    })
    .select()
    .single();

  if (error) throw error;
  return category;
}

export async function updateCategory(
  id: string,
  data: { name?: string; description?: string; icon?: string; color?: string }
) {
  const { error } = await supabase
    .from('web_directory_categories')
    .update(data)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase
    .from('web_directory_categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function createLink(
  categoryId: string,
  data: { title: string; url: string; description?: string }
) {
  const { data: maxPos } = await supabase
    .from('web_directory_links')
    .select('position')
    .eq('category_id', categoryId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = maxPos ? maxPos.position + 1 : 0;

  const { data: link, error } = await supabase
    .from('web_directory_links')
    .insert({
      category_id: categoryId,
      title: data.title,
      url: data.url,
      description: data.description || null,
      position: nextPosition,
    })
    .select()
    .single();

  if (error) throw error;
  return link;
}

export async function updateLink(
  id: string,
  data: { title?: string; url?: string; description?: string; category_id?: string }
) {
  const { error } = await supabase
    .from('web_directory_links')
    .update(data)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteLink(id: string) {
  const { error } = await supabase
    .from('web_directory_links')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function reorderCategories(orderedIds: string[]) {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('web_directory_categories')
      .update({ position: index })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function reorderLinks(orderedIds: string[]) {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('web_directory_links')
      .update({ position: index })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
