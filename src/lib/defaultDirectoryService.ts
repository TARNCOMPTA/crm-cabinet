import { supabase } from './supabase';

export interface DefaultDirectoryLink {
  id: string;
  default_category_id: string;
  title: string;
  url: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DefaultDirectoryCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  web_directory_default_links: DefaultDirectoryLink[];
}

export async function fetchDefaultCategories(): Promise<DefaultDirectoryCategory[]> {
  const { data, error } = await supabase
    .from('web_directory_default_categories')
    .select('*, web_directory_default_links(*)')
    .order('position', { ascending: true });

  if (error) throw error;

  return (data || []).map((cat: any) => ({
    ...cat,
    web_directory_default_links: (cat.web_directory_default_links || []).sort(
      (a: DefaultDirectoryLink, b: DefaultDirectoryLink) => a.position - b.position
    ),
  }));
}

export async function createDefaultCategory(
  data: { name: string; description?: string; icon?: string; color?: string }
) {
  const { data: maxPos } = await supabase
    .from('web_directory_default_categories')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = maxPos ? maxPos.position + 1 : 0;

  const { data: category, error } = await supabase
    .from('web_directory_default_categories')
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

export async function updateDefaultCategory(
  id: string,
  data: { name?: string; description?: string; icon?: string; color?: string }
) {
  const { error } = await supabase
    .from('web_directory_default_categories')
    .update(data)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteDefaultCategory(id: string) {
  const { error } = await supabase
    .from('web_directory_default_categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function reorderDefaultCategories(orderedIds: string[]) {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('web_directory_default_categories')
      .update({ position: index })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function createDefaultLink(
  categoryId: string,
  data: { title: string; url: string; description?: string }
) {
  const { data: maxPos } = await supabase
    .from('web_directory_default_links')
    .select('position')
    .eq('default_category_id', categoryId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = maxPos ? maxPos.position + 1 : 0;

  const { data: link, error } = await supabase
    .from('web_directory_default_links')
    .insert({
      default_category_id: categoryId,
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

export async function updateDefaultLink(
  id: string,
  data: { title?: string; url?: string; description?: string; default_category_id?: string }
) {
  const { error } = await supabase
    .from('web_directory_default_links')
    .update(data)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteDefaultLink(id: string) {
  const { error } = await supabase
    .from('web_directory_default_links')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function reorderDefaultLinks(orderedIds: string[]) {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('web_directory_default_links')
      .update({ position: index })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
