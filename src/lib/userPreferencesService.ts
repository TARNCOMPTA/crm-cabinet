import { supabase } from './supabase';
import type { Json } from '../types/database';

export type UserPreferences = Record<string, unknown>;

export async function fetchUserPreferences(userId: string): Promise<UserPreferences> {
  const { data } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  return ((data?.preferences as UserPreferences) ?? {}) as UserPreferences;
}

export async function saveUserPreferences(
  userId: string,
  preferences: UserPreferences
): Promise<void> {
  await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        preferences: preferences as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
}

export function getAtPath(prefs: UserPreferences, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, prefs);
}

export function setAtPath(
  prefs: UserPreferences,
  path: string,
  value: unknown
): UserPreferences {
  const keys = path.split('.');
  const next: UserPreferences = { ...prefs };
  let cursor: Record<string, unknown> = next as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const existing = cursor[k];
    const nested: Record<string, unknown> =
      existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
    cursor[k] = nested;
    cursor = nested;
  }
  cursor[keys[keys.length - 1]] = value;
  return next;
}
