import { supabase } from './supabase';

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

/**
 * Cree une notification, et DIT si elle a ete creee.
 *
 * ⚠️ ELLE NE LEVE TOUJOURS PAS, ET C'EST VOLONTAIRE : prevenir quelqu'un ne doit
 * jamais faire echouer le geste metier. Un bilan deplace reste deplace meme si
 * la notification n'est pas partie.
 *
 * ⚠️ MAIS ELLE NE SE TAIT PLUS. Elle rendait `void` et avalait tout : l'appelant
 * ne pouvait qu'esperer. Depuis qu'un ecran annonce « untel a ete prevenu »,
 * ce silence deviendrait un mensonge — l'ecriture echoue, le message s'affiche
 * quand meme, et personne ne saura jamais que le collegue n'a rien recu.
 *
 * ⚠️ ON LIT `error`, PAS SEULEMENT LE `catch`. PostgREST rend un refus de droits
 * dans la reponse, sans lever : un `try/catch` seul verrait passer un 403 pour
 * un succes. C'est le defaut corrige en 96c9896, au meme endroit du raisonnement.
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string
): Promise<boolean> {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchNotifications(userId: string, limit = 30): Promise<Notification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as Notification[]) ?? [];
}

export async function fetchUnreadNotificationCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}

export async function deleteNotification(id: string): Promise<void> {
  await supabase.from('notifications').delete().eq('id', id);
}

/**
 * Ce qui arrivera vraiment a la personne prevenue.
 *
 * ⚠️ POURQUOI INTERROGER PLUTOT QUE SUPPOSER. L'ecran annonce « untel est
 * prevenu par courriel ». C'est faux si la personne a coupe ce type de
 * notification, ou si elle est en mode resume — le declencheur
 * `handle_new_notification` s'arrete alors avant d'ecrire dans `email_queue`.
 * Une phrase affirmative sur un envoi qui n'aura pas lieu est exactement ce que
 * ce depot refuse ailleurs : on lit la preference, ce n'est qu'une requete.
 *
 * ⚠️ L'ABSENCE DE LIGNE VAUT « OUI ». C'est la regle du declencheur lui-meme
 * (`IF NOT FOUND THEN email_enabled := true`), et la recopier ici est la seule
 * facon que l'ecran dise la meme chose que la base.
 *
 * ⚠️ ET `null` N'EST PAS `false`. Si la lecture echoue, on ne sait pas : on rend
 * `null`, et l'appelant dit « est prevenu » sans promettre de courriel. Ne
 * jamais confondre « absent » et « on n'a pas pu savoir ».
 */
export async function courrielPrevu(
  userId: string,
  type: string
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('email_enabled, digest_enabled')
      .eq('user_id', userId)
      .eq('notification_type', type)
      .maybeSingle();

    if (error) return null;
    if (!data) return true;
    // Le resume differe l'envoi : le courriel partira, mais pas maintenant, et
    // l'annoncer comme immediat ferait chercher un message qui n'arrive pas.
    if (data.digest_enabled) return false;
    return data.email_enabled !== false;
  } catch {
    return null;
  }
}

/**
 * La phrase affichee apres avoir prevenu quelqu'un.
 *
 * Une seule formulation pour les trois ecrans qui l'utilisent — le tableau des
 * bilans, la fiche d'un bilan, la liste des taches. Trois libelles auraient
 * diverge au premier changement de mot.
 */
export function messagePrevenu(nom: string, courriel: boolean | null): string {
  if (courriel === true) return `${nom} est prevenu(e) par courriel.`;
  if (courriel === false) return `${nom} est prevenu(e) dans l'application (courriel desactive de son cote).`;
  return `${nom} est prevenu(e).`;
}

