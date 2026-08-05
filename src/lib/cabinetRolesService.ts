import { supabase } from './supabase';
import { parLots } from './lots';

const db = supabase as unknown as {
  from: (table: string) => any;
};

export type RoleColor =
  | 'teal'
  | 'blue'
  | 'green'
  | 'amber'
  | 'rose'
  | 'slate'
  | 'orange'
  | 'gray';

export interface CabinetCollaboratorRole {
  id: string;
  key: string;
  label: string;
  color: RoleColor;
  description: string | null;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const ROLE_COLORS: { value: RoleColor; label: string; badgeClass: string; dotClass: string }[] = [
  { value: 'teal', label: 'Teal', badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-400', dotClass: 'bg-teal-500' },
  { value: 'blue', label: 'Bleu', badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-400', dotClass: 'bg-sky-500' },
  { value: 'green', label: 'Vert', badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400', dotClass: 'bg-green-500' },
  { value: 'amber', label: 'Ambre', badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', dotClass: 'bg-amber-500' },
  { value: 'rose', label: 'Rose', badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400', dotClass: 'bg-rose-500' },
  { value: 'orange', label: 'Orange', badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400', dotClass: 'bg-orange-500' },
  { value: 'slate', label: 'Ardoise', badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300', dotClass: 'bg-slate-500' },
  { value: 'gray', label: 'Gris', badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', dotClass: 'bg-gray-500' },
];

export function getRoleColorClasses(color: string | undefined | null): string {
  const found = ROLE_COLORS.find((c) => c.value === color);
  return found?.badgeClass ?? ROLE_COLORS[0].badgeClass;
}

export function getRoleDotClass(color: string | undefined | null): string {
  const found = ROLE_COLORS.find((c) => c.value === color);
  return found?.dotClass ?? ROLE_COLORS[0].dotClass;
}

export function slugifyRoleKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export async function listCabinetRoles(): Promise<CabinetCollaboratorRole[]> {
  const { data, error } = await db
    .from('cabinet_collaborator_roles')
    .select('*')
    .order('position', { ascending: true });
  if (error) return [];
  return (data ?? []) as CabinetCollaboratorRole[];
}

export interface CreateRoleInput {
  key: string;
  label: string;
  color: RoleColor;
  description?: string | null;
  position: number;
  is_default?: boolean;
}

export async function createCabinetRole(input: CreateRoleInput): Promise<CabinetCollaboratorRole | null> {
  if (input.is_default) {
    await db
      .from('cabinet_collaborator_roles')
      .update({ is_default: false });
  }
  const { data, error } = await db
    .from('cabinet_collaborator_roles')
    .insert({
      key: input.key,
      label: input.label,
      color: input.color,
      description: input.description ?? null,
      position: input.position,
      is_default: input.is_default ?? false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as CabinetCollaboratorRole;
}

export interface UpdateRoleInput {
  label?: string;
  color?: RoleColor;
  description?: string | null;
  position?: number;
}

export async function updateCabinetRole(
  roleId: string,
  patch: UpdateRoleInput
): Promise<void> {
  const { error } = await db
    .from('cabinet_collaborator_roles')
    .update(patch)
    .eq('id', roleId);
  if (error) throw error;
}

export async function setDefaultCabinetRole(roleId: string): Promise<void> {
  await db
    .from('cabinet_collaborator_roles')
    .update({ is_default: false });
  const { error } = await db
    .from('cabinet_collaborator_roles')
    .update({ is_default: true })
    .eq('id', roleId);
  if (error) throw error;
}

export async function deleteCabinetRole(roleId: string): Promise<void> {
  const { error } = await db
    .from('cabinet_collaborator_roles')
    .delete()
    .eq('id', roleId);
  if (error) throw error;
}

export async function countRoleUsage(roleKey: string): Promise<number> {
  const { count } = await db
    .from('client_collaborators')
    .select('id', { count: 'exact', head: true })
    .eq('role', roleKey);
  return count ?? 0;
}

export async function reassignRoleUsage(
  fromKey: string,
  toKey: string
): Promise<void> {
  const { data: clients } = await db
    .from('clients')
    .select('id');
  const clientIds = (clients ?? []).map((c: { id: string }) => c.id);
  if (clientIds.length === 0) return;
  // `clientIds` vaut ici TOUS les clients : le filtre ne restreint rien mais
  // gonfle l'URL jusqu'au HTTP 431. On le decoupe plutot que de le supprimer,
  // pour que la mise a jour reste bornee aux clients si la table venait a en
  // contenir d'autres.
  await parLots(clientIds, (lot) =>
    db
      .from('client_collaborators')
      .update({ role: toKey })
      .eq('role', fromKey)
      .in('client_id', lot)
      .select('id')
  );
}
