import { supabase } from './supabase';
import type { Json } from '../types/database';

export interface DeletionStats {
  habilitations: number;
  legal_acts: number;
  client_collaborators: number;
  tasks: number;
  tax_authorizations: number;
  tax_exemptions: number;
  balance_sheets: number;
  general_assemblies: number;
  inpi_sync_history: number;
  officer_companies: number;
  legal_documents: number;
  client_software: number;
}

export async function getClientDeletionStats(clientId: string): Promise<DeletionStats> {
  const stats: DeletionStats = {
    habilitations: 0,
    legal_acts: 0,
    client_collaborators: 0,
    tasks: 0,
    tax_authorizations: 0,
    tax_exemptions: 0,
    balance_sheets: 0,
    general_assemblies: 0,
    inpi_sync_history: 0,
    officer_companies: 0,
    legal_documents: 0,
    client_software: 0,
  };

  const counts = await Promise.all([
    supabase.from('habilitations').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('legal_acts').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('client_collaborators').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('tax_authorizations').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('tax_exemptions').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('balance_sheets').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('general_assemblies').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('inpi_sync_history').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('officer_companies').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('legal_documents').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('client_software').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
  ]);

  stats.habilitations = counts[0].count || 0;
  stats.legal_acts = counts[1].count || 0;
  stats.client_collaborators = counts[2].count || 0;
  stats.tasks = counts[3].count || 0;
  stats.tax_authorizations = counts[4].count || 0;
  stats.tax_exemptions = counts[5].count || 0;
  stats.balance_sheets = counts[6].count || 0;
  stats.general_assemblies = counts[7].count || 0;
  stats.inpi_sync_history = counts[8].count || 0;
  stats.officer_companies = counts[9].count || 0;
  stats.legal_documents = counts[10].count || 0;
  stats.client_software = counts[11].count || 0;

  return stats;
}

async function verifyClientOwnership(clientId: string): Promise<void> {
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Client introuvable ou acces non autorise');
}

export async function archiveClient(clientId: string, userId: string): Promise<void> {
  await verifyClientOwnership(clientId);

  const { error: clientError } = await supabase
    .from('clients')
    .update({ statut: 'archive' })
    .eq('id', clientId);

  if (clientError) throw clientError;

  await supabase
    .from('audit_logs')
    .insert({
      user_id: userId,
      action: 'archive_client',
      entity_type: 'client',
      entity_id: clientId,
      details: { archived_at: new Date().toISOString() }
    });
}

export async function restoreClient(clientId: string, userId: string): Promise<void> {
  await verifyClientOwnership(clientId);

  const { error: clientError } = await supabase
    .from('clients')
    .update({ statut: 'actif' })
    .eq('id', clientId);

  if (clientError) throw clientError;

  await supabase
    .from('audit_logs')
    .insert({
      user_id: userId,
      action: 'restore_client',
      entity_type: 'client',
      entity_id: clientId,
      details: { restored_at: new Date().toISOString() }
    });
}

export async function deleteClientPermanently(clientId: string, userId: string, stats: DeletionStats): Promise<void> {
  await verifyClientOwnership(clientId);

  await supabase
    .from('audit_logs')
    .insert({
      user_id: userId,
      action: 'delete_client',
      entity_type: 'client',
      entity_id: clientId,
      details: {
        deleted_at: new Date().toISOString(),
        stats,
      } as unknown as Json
    });

  // Le module support a disparu du produit : plus de tables support_tickets,
  // ticket_messages ni ticket_attachments, donc plus rien a supprimer en
  // cascade ici.

  await supabase.from('legal_documents').delete().eq('client_id', clientId);
  await supabase.from('officer_companies').delete().eq('client_id', clientId);
  await supabase.from('legal_acts').delete().eq('client_id', clientId);
  await supabase.from('client_software').delete().eq('client_id', clientId);
  await supabase.from('habilitations').delete().eq('client_id', clientId);
  await supabase.from('inpi_sync_history').delete().eq('client_id', clientId);
  await supabase.from('client_collaborators').delete().eq('client_id', clientId);
  await supabase.from('tax_exemptions').delete().eq('client_id', clientId);
  await supabase.from('tax_authorizations').delete().eq('client_id', clientId);
  await supabase.from('balance_sheets').delete().eq('client_id', clientId);
  await supabase.from('general_assemblies').delete().eq('client_id', clientId);
  await supabase.from('tasks').delete().eq('client_id', clientId);

  const { error: deleteError } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId);

  if (deleteError) throw deleteError;
}

export interface ClientDeletionPermissions {
  canArchive: boolean;
  canRestore: boolean;
  canDelete: boolean;
}

/**
 * Les deux parametres de cabinet ont ete retires : l'instance n'en contient
 * qu'un, donc « l'utilisateur et le client appartiennent au meme cabinet » est
 * vrai par construction. La transformation mono-cabinet avait mutile l'appel
 * sans toucher a cette signature — voir ClientDetail.
 */
export function getClientDeletionPermissions(
  userRole: string | undefined,
  clientStatut: string | undefined
): ClientDeletionPermissions {
  const isAdmin = userRole === 'admin';
  const isArchived = clientStatut === 'archive';

  return {
    canArchive: !isArchived,
    canRestore: isArchived,
    canDelete: isAdmin,
  };
}
