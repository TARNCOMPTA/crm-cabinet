import { supabase } from './supabase';
import { Database, NotificationType } from '../types/database';

type NotificationPreference = Database['public']['Tables']['notification_preferences']['Row'];
type NotificationPreferenceInsert =
  Database['public']['Tables']['notification_preferences']['Insert'];

/**
 * Une cle calculee (`[field]: value`) elargit l'objet a un index signature, que
 * `.upsert()` refuse : il n'accepte que les colonnes qu'il connait. Choisir
 * explicitement entre les deux colonnes possibles garde le type exact.
 */
function bascule(
  field: 'email_enabled' | 'digest_enabled',
  value: boolean
): Pick<NotificationPreferenceInsert, 'email_enabled'> | Pick<NotificationPreferenceInsert, 'digest_enabled'> {
  return field === 'email_enabled' ? { email_enabled: value } : { digest_enabled: value };
}
type EmailDigest = Database['public']['Tables']['email_digests']['Row'];

export const NOTIFICATION_TYPES: {
  type: NotificationType;
  label: string;
  description: string;
  category: string;
}[] = [
  { type: 'task_assigned', label: 'Attribution de tâche', description: 'Quand une tâche vous est attribuée', category: 'Tâches' },
  { type: 'task_commented', label: 'Commentaire sur tâche', description: 'Quand un commentaire est ajouté à une tâche', category: 'Tâches' },
  { type: 'task_status_changed', label: 'Changement de statut', description: 'Quand le statut d\'une tâche change', category: 'Tâches' },
  { type: 'bilan_moved', label: 'Deplacement de carte bilan', description: 'Quand une carte bilan change de colonne', category: 'Bilans' },
  { type: 'ticket_message', label: 'Message support', description: 'Quand un nouveau message est ajoute a un ticket', category: 'Support' },
  { type: 'user_deactivated', label: 'Desactivation de compte', description: 'Quand un compte utilisateur est desactive', category: 'Systeme' },
];

export async function loadPreferences(userId: string): Promise<NotificationPreference[]> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('id, user_id, notification_type, email_enabled, digest_enabled, created_at, updated_at')
    .eq('user_id', userId);

  if (error) throw error;
  return data || [];
}

export async function updatePreference(
  userId: string,
  notificationType: NotificationType,
  field: 'email_enabled' | 'digest_enabled',
  value: boolean
): Promise<void> {
  const updates: NotificationPreferenceInsert = {
    user_id: userId,
    notification_type: notificationType,
    updated_at: new Date().toISOString(),
    ...bascule(field, value),
  };

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(updates, { onConflict: 'user_id,notification_type' });

  if (error) throw error;
}

export async function bulkUpdatePreferences(
  userId: string,
  field: 'email_enabled' | 'digest_enabled',
  value: boolean
): Promise<void> {
  const rows: NotificationPreferenceInsert[] = NOTIFICATION_TYPES.map((nt) => ({
    user_id: userId,
    notification_type: nt.type,
    updated_at: new Date().toISOString(),
    ...bascule(field, value),
  }));

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(rows, { onConflict: 'user_id,notification_type' });

  if (error) throw error;
}

export async function loadDigestSettings(userId: string): Promise<EmailDigest | null> {
  const { data, error } = await supabase
    .from('email_digests')
    .select('id, user_id, digest_type, is_active, next_send_at, last_sent_at, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateDigestSettings(
  userId: string,
  digestType: 'daily' | 'weekly' | null
): Promise<void> {
  if (digestType === null) {
    const { error } = await supabase
      .from('email_digests')
      .upsert({
        user_id: userId,
        is_active: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error) throw error;
  } else {
    const nextSend = new Date();
    if (digestType === 'daily') {
      nextSend.setDate(nextSend.getDate() + 1);
    } else {
      nextSend.setDate(nextSend.getDate() + 7);
    }
    nextSend.setHours(7, 0, 0, 0);

    const { error } = await supabase
      .from('email_digests')
      .upsert({
        user_id: userId,
        digest_type: digestType,
        is_active: true,
        next_send_at: nextSend.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error) throw error;
  }
}
