import { supabase } from './supabase';

/**
 * Départ d'un collaborateur : reprise de ses dossiers, puis fermeture du compte.
 *
 * Les neuf filtres de ce fichier visaient une colonne `status` qui n'existe sur
 * aucune des trois tables, pour une valeur `'completed'` qui n'appartient à
 * aucune des énumérations. PostgREST refusait donc ces requêtes — et comme
 * aucune n'était contrôlée, la réattribution échouait en silence : les tâches et
 * les bilans du partant restaient à son nom, alors que l'écran annonçait le
 * transfert.
 *
 * Ce que dit la base (schema/cible.sql) :
 *   · tasks.statut          → 'todo' | 'in_progress' | 'review' | 'done'
 *   · balance_sheets.statut → 'a_preparer' | 'en_cours' | 'en_revision' | 'valide'
 *   · bilan_cards           → aucune colonne de statut : l'avancement est porté
 *                             par la colonne du tableau (`column_id`). Le filtre
 *                             y a donc été retiré plutôt que traduit, et toutes
 *                             les fiches du partant sont reprises.
 */
export interface UserDependencies {
  clientsCount: number;
  tasksCount: number;
  balanceSheetsCount: number;
  bilanCardsCount: number;
}

export async function checkUserDependencies(userId: string): Promise<UserDependencies> {
  const [clientsResult, tasksResult, balanceSheetsResult, bilanCardsResult] = await Promise.all([
    supabase
      .from('client_collaborators')
      .select('client_id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', userId)
      .eq('is_archived', false)
      .neq('statut', 'done'),
    supabase
      .from('balance_sheets')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', userId)
      .neq('statut', 'valide'),
    supabase
      .from('bilan_cards')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', userId),
  ]);

  return {
    clientsCount: clientsResult.count || 0,
    tasksCount: tasksResult.count || 0,
    balanceSheetsCount: balanceSheetsResult.count || 0,
    bilanCardsCount: bilanCardsResult.count || 0,
  };
}

export async function deactivateUser(
  userId: string,
  deactivatedBy: string,
  replacementUserId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (replacementUserId) {
      const { data: existingClients } = await supabase
        .from('client_collaborators')
        .select('client_id')
        .eq('user_id', userId);

      if (existingClients && existingClients.length > 0) {
        const clientIds = existingClients.map((c) => c.client_id);

        await supabase
          .from('client_collaborators')
          .delete()
          .eq('user_id', userId);

        const newAssignments = clientIds.map((clientId) => ({
          client_id: clientId,
          user_id: replacementUserId,
        }));

        await supabase.from('client_collaborators').insert(newAssignments);
      }

      await supabase
        .from('tasks')
        .update({ assignee_id: replacementUserId })
        .eq('assignee_id', userId)
        .eq('is_archived', false)
        .neq('statut', 'done');

      await supabase
        .from('balance_sheets')
        .update({ assignee_id: replacementUserId })
        .eq('assignee_id', userId)
        .neq('statut', 'valide');

      await supabase
        .from('bilan_cards')
        .update({ assignee_id: replacementUserId })
        .eq('assignee_id', userId);
    } else {
      await supabase
        .from('client_collaborators')
        .delete()
        .eq('user_id', userId);

      await supabase
        .from('tasks')
        .update({ assignee_id: null })
        .eq('assignee_id', userId)
        .eq('is_archived', false)
        .neq('statut', 'done');

      await supabase
        .from('balance_sheets')
        .update({ assignee_id: null })
        .eq('assignee_id', userId)
        .neq('statut', 'valide');

      await supabase
        .from('bilan_cards')
        .update({ assignee_id: null })
        .eq('assignee_id', userId);
    }

    const { error: deactivationError } = await supabase
      .from('profiles')
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: deactivatedBy,
      })
      .eq('id', userId);

    if (deactivationError) {
      throw deactivationError;
    }

    const { data: deactivatedUser } = await supabase
      .from('profiles')
      .select('prenom, nom')
      .eq('id', userId)
      .maybeSingle();

    const { data: deactivatedByUser } = await supabase
      .from('profiles')
      .select('prenom, nom')
      .eq('id', deactivatedBy)
      .maybeSingle();

    if (deactivatedUser) {
      const { data: adminUsers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true);

      if (adminUsers && adminUsers.length > 0) {
        const userName = `${deactivatedUser.prenom || ''} ${deactivatedUser.nom || ''}`.trim() || 'Utilisateur';
        const adminName = `${deactivatedByUser?.prenom || ''} ${deactivatedByUser?.nom || ''}`.trim() || 'Un administrateur';

        const notifications = adminUsers.map((admin) => ({
          user_id: admin.id,
          title: 'Utilisateur desactive',
          message: `${adminName} a desactive le compte de ${userName}${replacementUserId ? ' et reassigne ses taches' : ''}.`,
          type: 'user_deactivated' as const,
          is_read: false,
        }));

        await supabase.from('notifications').insert(notifications);
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue',
    };
  }
}

export async function reactivateUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
      })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue',
    };
  }
}
