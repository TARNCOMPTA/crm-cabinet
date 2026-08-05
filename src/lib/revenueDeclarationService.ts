import { supabase } from './supabase';
import type { Database } from '../types/database';

export type RevenueDeclarationStatus =
  | 'a_faire'
  | 'donnees_a_transmettre'
  | 'donnees_transmises'
  | 'fait';

export interface DeclarationCollaborator {
  user_id: string;
  full_name: string;
  avatar_color?: string | null;
}

export type RevenueDeclarationZone = '1' | '2' | '3';

export interface RevenueDeclarationDeadline {
  id: string;
  annee: number;
  zone: RevenueDeclarationZone;
  date_echeance: string;
}

export interface RevenueDeclaration {
  id: string;
  client_id: string | null;
  person_name: string;
  annee: number;
  zone: RevenueDeclarationZone | null;
  derniere_annee: boolean;
  statut: RevenueDeclarationStatus;
  commentaire: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  clients?: { id: string; nom_entreprise: string | null; numero_dossier: string | null } | null;
  collaborators?: DeclarationCollaborator[];
}

export interface RevenueDeclarationInput {
  client_id: string | null;
  person_name: string;
  annee: number;
  zone?: RevenueDeclarationZone | null;
  derniere_annee?: boolean;
  statut?: RevenueDeclarationStatus;
  commentaire?: string;
}

export const STATUS_LABELS: Record<RevenueDeclarationStatus, string> = {
  a_faire: 'A faire',
  donnees_a_transmettre: 'Donnees a transmettre',
  donnees_transmises: 'Donnees transmises',
  fait: 'Fait',
};

export const STATUS_ORDER: RevenueDeclarationStatus[] = [
  'a_faire',
  'donnees_a_transmettre',
  'donnees_transmises',
  'fait',
];

export const STATUS_COLORS: Record<
  RevenueDeclarationStatus,
  { bg: string; border: string; dot: string; badge: string; text: string }
> = {
  a_faire: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-300 dark:border-gray-600',
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    text: 'text-gray-700 dark:text-gray-300',
  },
  donnees_a_transmettre: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-300 dark:border-amber-600',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-300',
  },
  donnees_transmises: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-300 dark:border-blue-600',
    dot: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    text: 'text-blue-700 dark:text-blue-300',
  },
  fait: {
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    border: 'border-teal-300 dark:border-teal-600',
    dot: 'bg-teal-500',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    text: 'text-teal-700 dark:text-teal-300',
  },
};

export async function listDeclarations(
  annee?: number
): Promise<RevenueDeclaration[]> {
  let query = supabase
    .from('revenue_declarations')
    .select('*, clients (id, nom_entreprise, numero_dossier), revenue_declaration_collaborators (user_id)')
    .order('annee', { ascending: false })
    .order('person_name', { ascending: true });

  if (annee !== undefined) {
    query = query.eq('annee', annee);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Collect all unique user_ids from collaborators to resolve names
  const allUserIds = new Set<string>();
  for (const row of (data || []) as any[]) {
    for (const c of row.revenue_declaration_collaborators || []) {
      allUserIds.add(c.user_id);
    }
  }

  // Fetch profile names in one query
  let profilesMap: Record<string, { full_name: string; avatar_color: string | null }> = {};
  if (allUserIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, prenom, nom, avatar_color')
      .in('id', Array.from(allUserIds));
    if (profiles) {
      for (const p of profiles) {
        profilesMap[p.id] = {
          full_name: `${p.prenom || ''} ${p.nom || ''}`.trim() || 'Utilisateur',
          avatar_color: p.avatar_color || null,
        };
      }
    }
  }

  const rows = (data || []).map((row: any) => {
    const collabs: DeclarationCollaborator[] = (row.revenue_declaration_collaborators || []).map((c: any) => ({
      user_id: c.user_id,
      full_name: profilesMap[c.user_id]?.full_name || 'Utilisateur',
      avatar_color: profilesMap[c.user_id]?.avatar_color || null,
    }));
    const { revenue_declaration_collaborators: _, ...rest } = row;
    return { ...rest, collaborators: collabs } as RevenueDeclaration;
  });

  return rows.sort((a, b) => {
    if (a.annee !== b.annee) return b.annee - a.annee;
    return a.person_name.localeCompare(b.person_name, 'fr', { sensitivity: 'base' });
  });
}

export async function listAvailableYears(): Promise<number[]> {
  const { data, error } = await supabase
    .from('revenue_declarations')
    .select('annee');
  if (error) throw error;
  const set = new Set<number>((data || []).map((r) => r.annee as number));
  return Array.from(set).sort((a, b) => b - a);
}

export async function createDeclaration(
  userId: string,
  input: RevenueDeclarationInput
): Promise<RevenueDeclaration> {
  const derniere = input.derniere_annee ?? false;
  const { data, error } = await supabase
    .from('revenue_declarations')
    .insert({
      created_by: userId,
      client_id: input.client_id,
      person_name: input.person_name.trim(),
      annee: input.annee,
      zone: input.zone ?? null,
      derniere_annee: derniere,
      statut: input.statut ?? 'a_faire',
      commentaire: input.commentaire ?? '',
    })
    .select()
    .maybeSingle();
  if (error) {
    console.error('createDeclaration error:', error);
    throw error;
  }

  if (!derniere) {
    const nextAnnee = input.annee + 1;
    const { data: existing } = await supabase
      .from('revenue_declarations')
      .select('id')
      .eq('person_name', input.person_name.trim())
      .eq('annee', nextAnnee)
      .maybeSingle();

    if (!existing) {
      await supabase.from('revenue_declarations').insert({
        created_by: userId,
        client_id: input.client_id,
        person_name: input.person_name.trim(),
        annee: nextAnnee,
        zone: input.zone ?? null,
        derniere_annee: false,
        statut: 'a_faire',
        commentaire: '',
      });
    }
  }

  return data as RevenueDeclaration;
}

export async function updateDeclaration(
  id: string,
  patch: Partial<RevenueDeclarationInput>
): Promise<void> {
  // `Record<string, unknown>` n'apprend rien a `.update()`, qui refuse ce qu'il
  // ne reconnait pas. Le type de la table dit exactement ce qui est ecrivable.
  const payload: Database['public']['Tables']['revenue_declarations']['Update'] = {};
  if (patch.client_id !== undefined) payload.client_id = patch.client_id;
  if (patch.person_name !== undefined) payload.person_name = patch.person_name.trim();
  if (patch.annee !== undefined) payload.annee = patch.annee;
  if (patch.statut !== undefined) payload.statut = patch.statut;
  if (patch.zone !== undefined) payload.zone = patch.zone;
  if (patch.derniere_annee !== undefined) payload.derniere_annee = patch.derniere_annee;
  if (patch.commentaire !== undefined) payload.commentaire = patch.commentaire;

  const { error } = await supabase
    .from('revenue_declarations')
    .update(payload)
    .eq('id', id);
  if (error) {
    console.error('updateDeclaration error:', error);
    throw error;
  }
}

export async function updateStatut(
  id: string,
  statut: RevenueDeclarationStatus
): Promise<void> {
  const { error } = await supabase
    .from('revenue_declarations')
    .update({ statut })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteDeclaration(id: string): Promise<void> {
  const { error } = await supabase
    .from('revenue_declarations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export interface CabinetClientOption {
  id: string;
  nom_entreprise: string | null;
  numero_dossier: string | null;
}

export async function listCabinetClients(): Promise<CabinetClientOption[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, numero_dossier')
    .order('nom_entreprise', { ascending: true });
  if (error) throw error;
  return (data || []) as CabinetClientOption[];
}

export interface OfficerOption {
  id: string;
  full_name: string;
  client_names: string[];
}

export async function listCabinetOfficers(): Promise<OfficerOption[]> {
  const { data, error } = await supabase
    .from('officer_companies')
    .select(
      'officer_id, company_officers (id, full_name), clients!inner (id, nom_entreprise)'
    )
    .eq('is_active', true);

  if (error) throw error;

  const map = new Map<string, OfficerOption>();
  for (const row of (data || []) as Array<{
    officer_id: string;
    company_officers: { id: string; full_name: string } | null;
    clients: { id: string; nom_entreprise: string | null } | null;
  }>) {
    const officer = row.company_officers;
    if (!officer) continue;
    const clientName = row.clients?.nom_entreprise ?? '';
    const existing = map.get(officer.id);
    if (existing) {
      if (clientName && !existing.client_names.includes(clientName)) {
        existing.client_names.push(clientName);
      }
    } else {
      map.set(officer.id, {
        id: officer.id,
        full_name: officer.full_name,
        client_names: clientName ? [clientName] : [],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'fr')
  );
}

export interface RevenueDeclarationAttachment {
  id: string;
  revenue_declaration_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

const ATTACHMENTS_BUCKET = 'revenue-declaration-attachments';
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export async function listAttachments(
  declarationId: string
): Promise<RevenueDeclarationAttachment[]> {
  const { data, error } = await supabase
    .from('revenue_declaration_attachments')
    .select('*')
    .eq('revenue_declaration_id', declarationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as RevenueDeclarationAttachment[];
}

export async function listAttachmentsCounts(
  declarationIds: string[]
): Promise<Record<string, number>> {
  if (declarationIds.length === 0) return {};
  const { data, error } = await supabase
    .from('revenue_declaration_attachments')
    .select('revenue_declaration_id')
    .in('revenue_declaration_id', declarationIds);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data || []) as Array<{ revenue_declaration_id: string }>) {
    counts[row.revenue_declaration_id] =
      (counts[row.revenue_declaration_id] ?? 0) + 1;
  }
  return counts;
}

export async function uploadAttachment(
  declarationId: string,
  userId: string,
  file: File
): Promise<RevenueDeclarationAttachment> {
  const isPdfByExt = file.name.toLowerCase().endsWith('.pdf');
  const isPdfByType = file.type === 'application/pdf';
  if (!isPdfByExt && !isPdfByType) {
    throw new Error('Seuls les fichiers PDF sont acceptes');
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('Le fichier ne doit pas depasser 10 Mo');
  }

  const storagePath = `${declarationId}/${crypto.randomUUID()}.pdf`;

  const pdfBlob =
    file.type === 'application/pdf'
      ? file
      : new Blob([file], { type: 'application/pdf' });

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: false });
  if (uploadError) {
    console.error('uploadAttachment storage error:', uploadError);
    const anyErr = uploadError as { message?: string; error?: string; statusCode?: number };
    const detail =
      anyErr.message || anyErr.error || (anyErr.statusCode ? `HTTP ${anyErr.statusCode}` : 'Upload refuse');
    throw new Error(`Stockage: ${detail}`);
  }

  const { data, error } = await supabase
    .from('revenue_declaration_attachments')
    .insert({
      revenue_declaration_id: declarationId,
      file_name: file.name,
      file_size: file.size,
      mime_type: 'application/pdf',
      storage_path: storagePath,
      uploaded_by: userId,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('uploadAttachment DB error:', error);
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
    throw new Error(error.message || 'Echec de l\'enregistrement');
  }
  return data as RevenueDeclarationAttachment;
}

export async function deleteAttachment(
  attachmentId: string,
  storagePath: string
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .remove([storagePath]);
  if (storageError) throw storageError;

  const { error } = await supabase
    .from('revenue_declaration_attachments')
    .delete()
    .eq('id', attachmentId);
  if (error) throw error;
}

export async function getAttachmentSignedUrl(
  storagePath: string,
  expiresInSeconds = 60
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function openAttachmentInNewTab(storagePath: string): Promise<void> {
  const url = await getAttachmentSignedUrl(storagePath, 60);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function downloadAttachment(
  storagePath: string,
  fileName: string
): Promise<void> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .download(storagePath);
  if (error) throw error;

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Collaborators ---

export async function assignCollaborators(
  declarationId: string,
  userIds: string[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('revenue_declaration_collaborators')
    .delete()
    .eq('declaration_id', declarationId);
  if (deleteError) throw deleteError;

  if (userIds.length === 0) return;

  const rows = userIds.map((uid) => ({
    declaration_id: declarationId,
    user_id: uid,
  }));

  const { error: insertError } = await supabase
    .from('revenue_declaration_collaborators')
    .insert(rows);
  if (insertError) throw insertError;
}

export async function bulkAssignCollaborators(
  declarationIds: string[],
  userIds: string[],
  mode: 'add' | 'replace'
): Promise<void> {
  if (mode === 'replace') {
    // Chaque déclaration a son propre lot à remplacer : les remplacements
    // partent ensemble plutôt qu'à la queue leu leu.
    await Promise.all(declarationIds.map((declId) => assignCollaborators(declId, userIds)));
    return;
  }

  // Ajout : un seul appel pour tout le produit cartésien.
  // ---------------------------------------------------------------------------
  // La version précédente insérait ligne par ligne — vingt déclarations et trois
  // collaborateurs faisaient soixante allers-retours séquentiels — et rattrapait
  // les doublons en lisant le TEXTE de l'erreur (`message.includes('duplicate')`),
  // qui dépend de la langue du serveur PostgreSQL. La contrainte d'unicité
  // (declaration_id, user_id) permet de le dire à la base : `ignoreDuplicates`
  // pose `Prefer: resolution=ignore-duplicates`, et les lignes déjà présentes
  // sont simplement laissées en place.
  const rows = declarationIds.flatMap((declId) =>
    userIds.map((uid) => ({ declaration_id: declId, user_id: uid }))
  );
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('revenue_declaration_collaborators')
    .upsert(rows, { onConflict: 'declaration_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function bulkUpdateZone(
  declarationIds: string[],
  zone: RevenueDeclarationZone | null
): Promise<void> {
  const { error } = await supabase
    .from('revenue_declarations')
    .update({ zone })
    .in('id', declarationIds);
  if (error) throw error;
}

export interface CabinetUserOption {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  full_name: string;
}

export async function listCabinetUsers(): Promise<CabinetUserOption[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, prenom, nom, email')
    .eq('is_active', true)
    .order('nom');
  if (error) throw error;
  return (data || []).map((u: any) => ({
    ...u,
    full_name: `${u.prenom || ''} ${u.nom || ''}`.trim() || u.email,
  }));
}

// --- Deadlines ---

export const ZONE_LABELS: Record<RevenueDeclarationZone, string> = {
  '1': 'Zone 1',
  '2': 'Zone 2',
  '3': 'Zone 3',
};

export async function listDeadlines(annee?: number): Promise<RevenueDeclarationDeadline[]> {
  let query = supabase
    .from('revenue_declaration_deadlines')
    .select('*')
    .order('annee', { ascending: false })
    .order('zone', { ascending: true });

  if (annee !== undefined) {
    query = query.eq('annee', annee);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as RevenueDeclarationDeadline[];
}

export async function getDeadlinesMap(annee: number): Promise<Record<string, string>> {
  const deadlines = await listDeadlines(annee);
  const map: Record<string, string> = {};
  for (const d of deadlines) {
    map[d.zone] = d.date_echeance;
  }
  return map;
}

export async function upsertDeadline(
  annee: number,
  zone: RevenueDeclarationZone,
  date_echeance: string
): Promise<void> {
  const { error } = await supabase
    .from('revenue_declaration_deadlines')
    .upsert(
      { annee, zone, date_echeance },
      { onConflict: 'annee,zone' }
    );
  if (error) throw error;
}

export async function deleteDeadline(id: string): Promise<void> {
  const { error } = await supabase
    .from('revenue_declaration_deadlines')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
