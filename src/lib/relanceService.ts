import { supabase } from './supabase';
import { Database } from '../types/database';

type RelanceUpdate = Database['public']['Tables']['relance_invoices']['Update'];

type RelanceInvoice = Database['public']['Tables']['relance_invoices']['Row'];
type RelanceInvoiceInsert = Database['public']['Tables']['relance_invoices']['Insert'];
type RelanceInvoiceUpdate = Database['public']['Tables']['relance_invoices']['Update'];
type RelanceHistoryRow = Database['public']['Tables']['relance_history']['Row'];
type RelanceHistoryInsert = Database['public']['Tables']['relance_history']['Insert'];

export interface RelanceInvoiceWithClient extends RelanceInvoice {
  clients: {
    nom_entreprise: string;
    numero_dossier: string | null;
    siren: string | null;
  };
}

export interface RelanceHistoryWithUser extends RelanceHistoryRow {
  profiles: {
    prenom: string | null;
    nom: string | null;
  } | null;
}

export async function loadRelances() {
  const { data, error } = await supabase
    .from('relance_invoices')
    .select(`
      *,
      clients(nom_entreprise, numero_dossier, siren)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((d) => ({
    ...d,
    montant: Number(d.montant) || 0,
    montant_regle: Number(d.montant_regle) || 0,
  })) as RelanceInvoiceWithClient[];
}

export async function createRelance(data: RelanceInvoiceInsert) {
  const { data: result, error } = await supabase
    .from('relance_invoices')
    .insert(data)
    .select(`
      *,
      clients(nom_entreprise, numero_dossier, siren)
    `)
    .single();

  if (error) throw error;
  return result as RelanceInvoiceWithClient;
}

export async function updateRelance(id: string, data: RelanceInvoiceUpdate) {
  const { data: result, error } = await supabase
    .from('relance_invoices')
    .update(data)
    .eq('id', id)
    .select(`
      *,
      clients(nom_entreprise, numero_dossier, siren)
    `)
    .single();

  if (error) throw error;
  return result as RelanceInvoiceWithClient;
}

export async function deleteRelance(id: string) {
  const { error } = await supabase
    .from('relance_invoices')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function enregistrerRelance(
  invoiceId: string,
  userId: string,
  typeRelance: string,
  commentaire: string
) {
  const historyEntry: RelanceHistoryInsert = {
    relance_invoice_id: invoiceId,
    type_relance: typeRelance,
    commentaire,
    effectuee_par: userId,
  };

  const { error: historyError } = await supabase
    .from('relance_history')
    .insert(historyEntry);

  if (historyError) throw historyError;

  const { error: updateError } = await supabase
    .from('relance_invoices')
    .update({
      nombre_relances: undefined,
      derniere_relance: new Date().toISOString(),
      statut: 'relancee',
    })
    .eq('id', invoiceId);

  if (updateError) throw updateError;

  const { data: invoice } = await supabase
    .from('relance_invoices')
    .select('nombre_relances')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invoice) {
    await supabase
      .from('relance_invoices')
      .update({ nombre_relances: (invoice.nombre_relances || 0) + 1 })
      .eq('id', invoiceId);
  }
}

export interface ReglementData {
  date_reglement: string;
  montant_regle: number;
  mode_reglement: string;
}

export async function marquerPayee(id: string, reglement?: ReglementData) {
  const updateData: RelanceUpdate = { statut: 'payee' };

  if (reglement) {
    updateData.date_reglement = reglement.date_reglement;
    updateData.montant_regle = reglement.montant_regle;
    updateData.mode_reglement = reglement.mode_reglement;
  }

  const { error } = await supabase
    .from('relance_invoices')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;
}

export async function enregistrerReglement(id: string, reglement: ReglementData) {
  const { data: invoice } = await supabase
    .from('relance_invoices')
    .select('montant')
    .eq('id', id)
    .maybeSingle();

  const montantTotal = Number(invoice?.montant) || 0;
  const isFullyPaid = reglement.montant_regle >= montantTotal;

  // `Record<string, unknown>` n'apprend rien a `.update()`, qui refuse ce qu'il
  // ne reconnait pas. Le type de la table dit exactement ce qui est ecrivable.
  const updateData: RelanceUpdate = {
    date_reglement: reglement.date_reglement,
    montant_regle: reglement.montant_regle,
    mode_reglement: reglement.mode_reglement,
  };

  if (isFullyPaid) {
    updateData.statut = 'payee';
  }

  const { error } = await supabase
    .from('relance_invoices')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;
}

export async function loadRelanceHistory(invoiceId: string) {
  const { data, error } = await supabase
    .from('relance_history')
    .select(`
      *,
      profiles:profiles!relance_history_effectuee_par_fkey(prenom, nom)
    `)
    .eq('relance_invoice_id', invoiceId)
    .order('date_relance', { ascending: false });

  if (error) throw error;
  return data as RelanceHistoryWithUser[];
}

export async function deleteRelanceHistory(id: string) {
  const { error } = await supabase
    .from('relance_history')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
