import { supabase } from './supabase';
import { parLots } from './lots';
import type { BilanCardWithDetails } from '../types/database';

export async function initializeDefaults(regime: string) {
  const { error } = await supabase.rpc('initialize_bilan_defaults', {
    p_regime: regime,
  });
  if (error) throw error;
}

export async function fetchColumns(regime: string) {
  const { data, error } = await supabase
    .from('bilan_columns')
    .select('id, regime_fiscal, name, color, position, created_at, updated_at')
    .eq('regime_fiscal', regime)
    .order('position');

  if (error) throw error;
  return data || [];
}

export async function fetchTemplates(regime: string) {
  const { data, error } = await supabase
    .from('bilan_checklist_templates')
    .select('id, regime_fiscal, name, position, created_at, updated_at')
    .eq('regime_fiscal', regime)
    .order('position');

  if (error) throw error;
  return data || [];
}

/**
 * Le `select` est construit en chaine (deux variantes, avec et sans pieces
 * jointes) : postgrest-js ne peut pas en deduire la forme du resultat et retombe
 * sur son type d'erreur. La forme est donc annoncee ici, en un seul endroit, au
 * lieu d'etre subie par tous les appelants.
 */
export async function fetchCards(
  regime: string,
  year: number,
  options: { showInactive?: boolean; assigneeId?: string | null } = {}
): Promise<BilanCardWithDetails[]> {
  const selectWithAttachments = `
    *,
    clients!inner(
      nom_entreprise, numero_dossier, siren, siret, forme_juridique, statut, date_cloture,
      collaborators:client_collaborators(user_id, role, user:profiles(prenom, nom, display_name, avatar_color))
    ),
    assignee:profiles!bilan_cards_assignee_id_fkey(prenom, nom, display_name, avatar_color),
    checklist_items:bilan_checklist_items(
      id, card_id, template_id, is_checked, checked_by, checked_at, created_at,
      template:bilan_checklist_templates(name, position),
      attachments:bilan_checklist_attachments(id, file_name, file_size, mime_type, storage_path, uploaded_by, created_at)
    )
  `;

  const selectWithoutAttachments = `
    *,
    clients!inner(
      nom_entreprise, numero_dossier, siren, siret, forme_juridique, statut, date_cloture,
      collaborators:client_collaborators(user_id, role, user:profiles(prenom, nom, display_name, avatar_color))
    ),
    assignee:profiles!bilan_cards_assignee_id_fkey(prenom, nom, display_name, avatar_color),
    checklist_items:bilan_checklist_items(
      id, card_id, template_id, is_checked, checked_by, checked_at, created_at,
      template:bilan_checklist_templates(name, position)
    )
  `;

  async function buildAndExecute(selectStr: string) {
    let query = supabase
      .from('bilan_cards')
      .select(selectStr)
      .eq('regime_fiscal', regime)
      .eq('year', year);

    if (!options.showInactive) {
      query = query.neq('clients.statut', 'inactif');
    }

    if (options.assigneeId) {
      const { data: collabClients } = await supabase
        .from('client_collaborators')
        .select('client_id')
        .eq('user_id', options.assigneeId);

      const collabClientIds = (collabClients || []).map(c => c.client_id);

      if (collabClientIds.length > 0) {
        query = query.or(
          `assignee_id.eq.${options.assigneeId},client_id.in.(${collabClientIds.join(',')})`
        );
      } else {
        query = query.eq('assignee_id', options.assigneeId);
      }
    }

    return query.order('clients(nom_entreprise)', { ascending: true });
  }

  const { data, error } = await buildAndExecute(selectWithAttachments);

  if (error) {
    const { data: fallbackData, error: fallbackError } = await buildAndExecute(selectWithoutAttachments);
    if (fallbackError) throw fallbackError;
    return (fallbackData || []) as unknown as BilanCardWithDetails[];
  }

  return (data || []) as unknown as BilanCardWithDetails[];
}

export async function generateCards(
  regime: string,
  year: number
) {
  const columns = await fetchColumns(regime);
  if (columns.length === 0) return 0;

  const firstColumn = columns[0];

  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, regime_fiscal')
    .eq('regime_fiscal', regime)
    .in('statut', ['actif', 'prospect']);

  if (clientsError) throw clientsError;
  if (!clients || clients.length === 0) return 0;

  const existingCards = await parLots<{ client_id: string }>(
    clients.map((c) => c.id),
    (lot) =>
      supabase
        .from('bilan_cards')
        .select('client_id')
        .eq('year', year)
        .in('client_id', lot)
  );

  const existingClientIds = new Set(existingCards.map((c) => c.client_id));
  const newClients = clients.filter((c) => !existingClientIds.has(c.id));

  if (newClients.length === 0) return 0;

  const { data: maxPosData } = await supabase
    .from('bilan_cards')
    .select('position')
    .eq('column_id', firstColumn.id)
    .eq('year', year)
    .order('position', { ascending: false })
    .limit(1);

  let nextPos = ((maxPosData?.[0]?.position ?? -1000) + 1000);

  const cardsToInsert = newClients.map((client) => {
    const card = {
      client_id: client.id,
      regime_fiscal: regime,
      year,
      column_id: firstColumn.id,
      position: nextPos,
    };
    nextPos += 1000;
    return card;
  });

  const { data: insertedCards, error: insertError } = await supabase
    .from('bilan_cards')
    .insert(cardsToInsert)
    .select('id');

  if (insertError) throw insertError;

  const templates = await fetchTemplates(regime);
  if (templates.length > 0 && insertedCards && insertedCards.length > 0) {
    const checklistItems = insertedCards.flatMap((card) =>
      templates.map((tpl) => ({
        card_id: card.id,
        template_id: tpl.id,
      }))
    );

    const batchSize = 500;
    for (let i = 0; i < checklistItems.length; i += batchSize) {
      const batch = checklistItems.slice(i, i + batchSize);
      const { error: clError } = await supabase
        .from('bilan_checklist_items')
        .insert(batch);
      if (clError) throw clError;
    }
  }

  return insertedCards?.length || 0;
}

export async function moveCard(
  cardId: string,
  newColumnId: string,
  newPosition: number
) {
  const { error } = await supabase
    .from('bilan_cards')
    .update({
      column_id: newColumnId,
      position: newPosition,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardId);

  if (error) throw error;
}

export async function toggleChecklistItem(
  itemId: string,
  isChecked: boolean,
  userId: string
) {
  const { error } = await supabase
    .from('bilan_checklist_items')
    .update({
      is_checked: isChecked,
      checked_by: isChecked ? userId : null,
      checked_at: isChecked ? new Date().toISOString() : null,
    })
    .eq('id', itemId);

  if (error) throw error;
}

export async function updateCardNotes(cardId: string, notes: string) {
  const { error } = await supabase
    .from('bilan_cards')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', cardId);

  if (error) throw error;
}

/**
 * Ecrit le responsable du bilan. L'appelant est le clic sur une pastille de
 * l'equipe, dans la fenetre de detail — le menu deroulant qui tenait ce role
 * a ete retire, puis remplace par ce geste-la le meme jour.
 */
export async function updateCardAssignee(
  cardId: string,
  assigneeId: string | null
) {
  const { error } = await supabase
    .from('bilan_cards')
    .update({
      assignee_id: assigneeId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardId);

  if (error) throw error;
}

export async function updateCardMoisTraites(
  cardId: string,
  moisTraites: number[]
) {
  const { error } = await supabase
    .from('bilan_cards')
    .update({
      mois_traites: moisTraites,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardId);

  if (error) throw error;
}

export async function syncCardRegimeForClient(
  clientId: string,
  newRegime: string
) {
  const { data: cards } = await supabase
    .from('bilan_cards')
    .select('id, regime_fiscal, year')
    .eq('client_id', clientId)
    .neq('regime_fiscal', newRegime);

  if (!cards || cards.length === 0) return 0;

  // La première colonne du nouveau régime ne dépend pas de la fiche traitée : la
  // boucle reposait la MÊME question à la base une fois par bilan, puis lançait
  // une mise à jour par bilan. Un client suivi sur huit exercices coûtait seize
  // allers-retours là où deux suffisent.
  const { data: cols } = await supabase
    .from('bilan_columns')
    .select('id')
    .eq('regime_fiscal', newRegime)
    .order('position')
    .limit(1);

  const firstColId = cols?.[0]?.id;
  if (!firstColId) return 0;

  const { error } = await supabase
    .from('bilan_cards')
    .update({
      regime_fiscal: newRegime,
      column_id: firstColId,
      updated_at: new Date().toISOString(),
    })
    .in(
      'id',
      cards.map((card) => card.id)
    );
  if (error) throw error;

  return cards.length;
}

export async function saveColumns(
  regime: string,
  columns: Array<{ id?: string; name: string; color: string; position: number }>
) {
  const { data: existing, error: fetchErr } = await supabase
    .from('bilan_columns')
    .select('id')
    .eq('regime_fiscal', regime);

  if (fetchErr) throw fetchErr;

  const existingIds = new Set((existing || []).map((c) => c.id));
  const newColumnIds = new Set(columns.filter((c) => c.id).map((c) => c.id!));
  const toDelete = [...existingIds].filter((id) => !newColumnIds.has(id));

  if (toDelete.length > 0 && columns.length > 0) {
    const firstRemainingId = columns.find((c) => c.id)?.id || columns[0].id;

    // Voir opportunityService.saveColumns : même forme, même correction. Le
    // rapatriement des bilans passe AVANT la suppression des colonnes.
    if (firstRemainingId) {
      const { error } = await supabase
        .from('bilan_cards')
        .update({ column_id: firstRemainingId })
        .in('column_id', toDelete);
      if (error) throw error;
    }

    const { error: deleteErr } = await supabase
      .from('bilan_columns')
      .delete()
      .in('id', toDelete);
    if (deleteErr) throw deleteErr;
  }

  const aModifier = columns.filter((col) => col.id && existingIds.has(col.id));
  const aCreer = columns.filter((col) => !col.id || !existingIds.has(col.id));

  const resultats = await Promise.all(
    aModifier.map((col) =>
      supabase
        .from('bilan_columns')
        .update({
          name: col.name,
          color: col.color,
          position: col.position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', col.id!)
    )
  );
  const echec = resultats.find((r) => r.error);
  if (echec?.error) throw echec.error;

  if (aCreer.length > 0) {
    const { error } = await supabase.from('bilan_columns').insert(
      aCreer.map((col) => ({
        regime_fiscal: regime,
        name: col.name,
        color: col.color,
        position: col.position,
      }))
    );
    if (error) throw error;
  }
}

export async function saveChecklistTemplates(
  regime: string,
  year: number,
  templates: Array<{ id?: string; name: string; position: number }>
) {
  const { data: existing, error: fetchErr } = await supabase
    .from('bilan_checklist_templates')
    .select('id')
    .eq('regime_fiscal', regime);

  if (fetchErr) throw fetchErr;

  const existingIds = new Set((existing || []).map((t) => t.id));
  const newTplIds = new Set(templates.filter((t) => t.id).map((t) => t.id!));
  const toDelete = [...existingIds].filter((id) => !newTplIds.has(id));

  for (const delId of toDelete) {
    await supabase.from('bilan_checklist_items').delete().eq('template_id', delId);
    await supabase.from('bilan_checklist_templates').delete().eq('id', delId);
  }

  for (const tpl of templates) {
    if (tpl.id && existingIds.has(tpl.id)) {
      await supabase
        .from('bilan_checklist_templates')
        .update({
          name: tpl.name,
          position: tpl.position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tpl.id);
    } else {
      const { data: newTpl, error: insertErr } = await supabase
        .from('bilan_checklist_templates')
        .insert({
          regime_fiscal: regime,
          name: tpl.name,
          position: tpl.position,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      if (newTpl) {
        const { data: cards } = await supabase
          .from('bilan_cards')
          .select('id')
          .eq('regime_fiscal', regime)
          .eq('year', year);

        if (cards && cards.length > 0) {
          const items = cards.map((card) => ({
            card_id: card.id,
            template_id: newTpl.id,
          }));

          const batchSize = 500;
          for (let i = 0; i < items.length; i += batchSize) {
            await supabase
              .from('bilan_checklist_items')
              .insert(items.slice(i, i + batchSize));
          }
        }
      }
    }
  }
}

export function getColumnColor(color: string) {
  const colors: Record<string, { bg: string; border: string; dot: string }> = {
    gray: { bg: 'bg-gray-50 dark:bg-gray-800/50', border: 'border-gray-300 dark:border-gray-600', dot: 'bg-gray-400' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-300 dark:border-blue-700', dot: 'bg-blue-500' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
    green: { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-300 dark:border-green-700', dot: 'bg-green-500' },
    red: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-300 dark:border-red-700', dot: 'bg-red-500' },
    teal: { bg: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-300 dark:border-teal-700', dot: 'bg-teal-500' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-300 dark:border-purple-700', dot: 'bg-purple-500' },
  };
  return colors[color] || colors.gray;
}

export const COLUMN_COLORS = [
  { value: 'gray', label: 'Gris' },
  { value: 'blue', label: 'Bleu' },
  { value: 'amber', label: 'Jaune' },
  { value: 'green', label: 'Vert' },
  { value: 'red', label: 'Rouge' },
  { value: 'teal', label: 'Turquoise' },
  { value: 'purple', label: 'Violet' },
];

export async function uploadChecklistAttachment(
  checklistItemId: string,
  cardId: string,
  file: File,
  userId: string
) {
  const fileExt = file.name.split('.').pop();
  const filePath = `${cardId}/${checklistItemId}/${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('bilan-checklist-attachments')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from('bilan_checklist_attachments')
    .insert({
      checklist_item_id: checklistItemId,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: filePath,
      uploaded_by: userId,
    })
    .select('id, file_name, file_size, mime_type, storage_path, uploaded_by, created_at')
    .single();

  if (insertError) throw insertError;
  return data;
}

export async function deleteChecklistAttachment(attachmentId: string, storagePath: string) {
  const { error: storageError } = await supabase.storage
    .from('bilan-checklist-attachments')
    .remove([storagePath]);

  if (storageError) throw storageError;

  const { error: dbError } = await supabase
    .from('bilan_checklist_attachments')
    .delete()
    .eq('id', attachmentId);

  if (dbError) throw dbError;
}

export async function downloadChecklistAttachment(storagePath: string, fileName: string) {
  const { data, error } = await supabase.storage
    .from('bilan-checklist-attachments')
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

// --- Pieces jointes diverses d'un bilan -------------------------------------
//
// Celles qui ne relevent d'aucun point de checklist : courrier de la banque,
// balance du confrere precedent, PV recu en vrac. Table `bilan_card_attachments`
// (increment 016), meme bucket que les pieces de checklist, sous le prefixe
// `<carte>/divers/` — le chemin dit deja de quoi il s'agit.

const BUCKET_BILAN = 'bilan-checklist-attachments';

export async function fetchCardAttachments(cardId: string) {
  const { data, error } = await supabase
    .from('bilan_card_attachments')
    .select('id, file_name, file_size, mime_type, storage_path, uploaded_by, created_at')
    .eq('card_id', cardId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function uploadCardAttachment(cardId: string, file: File, userId: string) {
  const extension = file.name.split('.').pop();
  const chemin = `${cardId}/divers/${crypto.randomUUID()}.${extension}`;

  const { error: erreurDepot } = await supabase.storage.from(BUCKET_BILAN).upload(chemin, file);
  if (erreurDepot) throw erreurDepot;

  const { data, error } = await supabase
    .from('bilan_card_attachments')
    .insert({
      card_id: cardId,
      file_name: file.name,
      file_size: file.size,
      // ⚠️ Un fichier depose par glisser-deposer depuis certains clients de
      // messagerie arrive avec un `type` VIDE. La colonne est NOT NULL, et
      // l'insertion echouait sur une piece pourtant valable : on retombe sur
      // le type generique plutot que de refuser le depot.
      mime_type: file.type || 'application/octet-stream',
      storage_path: chemin,
      uploaded_by: userId,
    })
    .select('id, file_name, file_size, mime_type, storage_path, uploaded_by, created_at')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCardAttachment(attachmentId: string, storagePath: string) {
  const { error: erreurStockage } = await supabase.storage.from(BUCKET_BILAN).remove([storagePath]);
  if (erreurStockage) throw erreurStockage;

  const { error } = await supabase.from('bilan_card_attachments').delete().eq('id', attachmentId);
  if (error) throw error;
}

// --- Bilan Cabinet Options (DAS2 INPI toggle) ---

export async function getBilanCabinetOptions() {
  const { data } = await supabase
    .from('bilan_cabinet_options')
    .select('*')
    .maybeSingle();
  return data;
}

export async function setBilanDas2Enabled(enabled: boolean) {
  const { error } = await supabase
    .from('bilan_cabinet_options')
    .upsert(
      { das2_inpi_enabled: enabled, updated_at: new Date().toISOString() },
      {}
    );
  if (error) throw error;
}

export interface Das2Entry {
  id: string;
  card_id: string;
  company_name: string;
  company_siren: string;
  company_siret: string | null;
  address_line: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  code_ape: string | null;
  libelle_ape: string | null;
  created_at: string;
}

export async function getDas2Entries(cardId: string): Promise<Das2Entry[]> {
  const { data, error } = await supabase
    .from('bilan_das2_entries')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addDas2Entry(
  cardId: string,
  company: { denomination: string; siren: string; siret?: string; adresse?: { ligne1: string; complement?: string; codePostal: string; ville: string }; codeAPE?: string; libelleAPE?: string }
): Promise<Das2Entry> {
  const { data, error } = await supabase
    .from('bilan_das2_entries')
    .insert({
      card_id: cardId,
      company_name: company.denomination,
      company_siren: company.siren,
      company_siret: company.siret || null,
      address_line: [company.adresse?.ligne1, company.adresse?.complement].filter(Boolean).join(' - ') || null,
      address_postal_code: company.adresse?.codePostal || null,
      address_city: company.adresse?.ville || null,
      code_ape: company.codeAPE || null,
      libelle_ape: company.libelleAPE || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeDas2Entry(entryId: string) {
  const { error } = await supabase
    .from('bilan_das2_entries')
    .delete()
    .eq('id', entryId);
  if (error) throw error;
}

