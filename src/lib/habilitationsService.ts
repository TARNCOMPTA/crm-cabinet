import { supabase } from './supabase';
import { getCompleteness } from './habilitationsReference';
import { parseHabilitationsFile, HabilitationRow } from './habilitationsParser';
import type { GroupedClient, GroupedUnknown, HabilitationStats, EnrichedClient } from '../types/habilitations';

/**
 * Taille de page.
 *
 * Elle valait 1 000, ce qui faisait QUATORZE allers-retours pour les 13 025
 * habilitations du cabinet, enchaînés en série : mesuré à 2 533 ms, alors
 * qu'aucune requête ne dépasse 30 ms côté base. La lenteur n'était pas dans les
 * données, elle était dans le nombre de voyages.
 *
 * 5 000 et non 10 000 : PostgREST est configuré avec `PGRST_DB_MAX_ROWS: 10000`
 * et tronque SILENCIEUSEMENT au-delà. Une page demandée plus grande que ce
 * plafond reviendrait courte, la boucle croirait avoir fini, et il manquerait
 * des lignes sans le moindre message. Rester à la moitié du plafond laisse de la
 * marge si quelqu'un l'abaisse.
 */
const PAGE_SIZE = 5000;

/** Pages demandées de front. Trois suffisent à couvrir 15 000 lignes. */
const PAGES_SIMULTANEES = 3;

/**
 * Récupère toutes les pages, par lots concurrents.
 *
 * Les pages ne dépendent pas les unes des autres : les attendre à la file ne
 * faisait qu'additionner des latences. Par lots de trois, la même charge passe
 * de 2 533 ms à 296 ms.
 *
 * On s'arrête dès qu'un lot rend une page incomplète. Demander une ou deux
 * pages vides en trop coûte quelques millisecondes ; se tromper sur la fin
 * coûterait des lignes.
 */
async function fetchAllPaginated<T>(
  queryFn: (offset: number, limit: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const tout: T[] = [];
  let page = 0;

  for (;;) {
    const lot = await Promise.all(
      Array.from({ length: PAGES_SIMULTANEES }, (_, i) => {
        const debut = (page + i) * PAGE_SIZE;
        return queryFn(debut, debut + PAGE_SIZE - 1);
      })
    );

    let fini = false;
    for (const { data, error } of lot) {
      if (error) throw error;
      if (data?.length) tout.push(...data);
      if (!data || data.length < PAGE_SIZE) fini = true;
    }

    if (fini) return tout;
    page += PAGES_SIMULTANEES;
  }
}

export async function fetchCabinetHabilitations() {
  return fetchAllPaginated(async (from, to) => {
    return supabase
      .from('habilitations')
      .select('*, client:clients(id, nom_entreprise, siren)')
      // `id` en second critere : `siren` seul n'est pas un ordre TOTAL — il y a
      // des doublons et des valeurs nulles parmi les 13 025 lignes. Or une
      // pagination par OFFSET sur un ordre ambigu peut rendre deux fois la meme
      // ligne et en omettre une autre, PostgreSQL ne garantissant pas de
      // departager les ex aequo de la meme facon d'une requete a l'autre. Le
      // risque existait deja en serie ; le paralleliser sans le corriger aurait
      // ete imprudent.
      .order('siren')
      .order('id')
      .range(from, to);
  });
}

export async function fetchCabinetClients(includeInactive: boolean) {
  return fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from('clients')
      .select('id, nom_entreprise, siren, habilitation_non_concerne, habilitation_avancement, habilitation_commentaire, statut');

    if (!includeInactive) {
      query = query.eq('statut', 'actif');
    }

    return query.order('nom_entreprise').range(from, to);
  });
}

export function buildGroupedData(
  allHabilitations: any[],
  allCabClients: any[]
): { clientGroups: GroupedClient[]; unknownGroups: GroupedUnknown[]; allServices: string[]; lastImportDate: string | null } {
  if (allHabilitations.length === 0) {
    const clientsWithoutHab: GroupedClient[] = allCabClients.map((c) => ({
      clientId: c.id,
      clientName: c.nom_entreprise,
      siren: c.siren || '',
      hasHabilitations: false,
      nonConcerne: c.habilitation_non_concerne || false,
      isNonClient: false,
      avancement: c.habilitation_avancement || 'a_faire',
      commentaire: c.habilitation_commentaire || '',
      services: [],
    }));
    return { clientGroups: clientsWithoutHab, unknownGroups: [], allServices: [], lastImportDate: null };
  }

  const mostRecent = allHabilitations.reduce((latest, row) => {
    if (!latest || row.created_at > latest) return row.created_at;
    return latest;
  }, '');

  const servicesSet = new Set<string>();
  const clientMap = new Map<string, GroupedClient>();
  const unknownMap = new Map<string, GroupedUnknown>();
  const cabClientMap = new Map<string, any>();

  for (const c of allCabClients) {
    cabClientMap.set(c.id, c);
  }

  for (const row of allHabilitations) {
    servicesSet.add(row.service);
    const serviceEntry = {
      service: row.service,
      role: row.role,
      etat: row.etat,
      dateCreation: row.date_creation_habilitation,
    };

    if (row.client_id && row.client) {
      const client = row.client as { id: string; nom_entreprise: string; siren: string };
      const cabClient = cabClientMap.get(client.id);
      if (!clientMap.has(client.id)) {
        clientMap.set(client.id, {
          clientId: client.id,
          clientName: client.nom_entreprise,
          siren: row.siren,
          hasHabilitations: true,
          nonConcerne: cabClient?.habilitation_non_concerne || false,
          isNonClient: false,
          avancement: cabClient?.habilitation_avancement || 'a_faire',
          commentaire: cabClient?.habilitation_commentaire || '',
          services: [],
        });
      }
      clientMap.get(client.id)!.services.push(serviceEntry);
    } else {
      if (!unknownMap.has(row.siren)) {
        unknownMap.set(row.siren, { siren: row.siren, services: [] });
      }
      unknownMap.get(row.siren)!.services.push(serviceEntry);
    }
  }

  for (const cabClient of allCabClients) {
    if (!clientMap.has(cabClient.id)) {
      clientMap.set(cabClient.id, {
        clientId: cabClient.id,
        clientName: cabClient.nom_entreprise,
        siren: cabClient.siren || '',
        hasHabilitations: false,
        nonConcerne: cabClient.habilitation_non_concerne || false,
        isNonClient: false,
        avancement: cabClient.habilitation_avancement || 'a_faire',
        commentaire: cabClient.habilitation_commentaire || '',
        services: [],
      });
    }
  }

  const unknownAsClients: GroupedClient[] = Array.from(unknownMap.values()).map((u) => ({
    clientId: `unknown-${u.siren}`,
    clientName: `SIREN ${u.siren}`,
    siren: u.siren,
    hasHabilitations: true,
    nonConcerne: false,
    isNonClient: true,
    avancement: 'a_faire',
    commentaire: '',
    services: u.services,
  }));

  const clientGroups = [...Array.from(clientMap.values()), ...unknownAsClients].sort((a, b) =>
    a.clientName.localeCompare(b.clientName, 'fr')
  );

  const unknownGroups = Array.from(unknownMap.values()).sort((a, b) => a.siren.localeCompare(b.siren));
  const allServices = Array.from(servicesSet).sort((a, b) => a.localeCompare(b, 'fr'));

  return { clientGroups, unknownGroups, allServices, lastImportDate: mostRecent };
}

export async function importHabilitationsFile(
  file: File,
  includeInactive: boolean
): Promise<{ imported: number; matched: number; unmatchedCount: number; duplicatesRemoved: number; promotedCount: number }> {
  const rawRows: HabilitationRow[] = await parseHabilitationsFile(file);

  if (rawRows.length === 0) {
    throw new Error('Le fichier ne contient aucune donnée exploitable');
  }

  const deduped = new Map<string, HabilitationRow>();
  for (const row of rawRows) {
    deduped.set(`${row.siren}::${row.service}`, row);
  }
  const rows = Array.from(deduped.values());
  const duplicatesRemoved = rawRows.length - rows.length;

  const clients = await fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from('clients')
      .select('id, nom_entreprise, siren');
    if (!includeInactive) {
      query = query.eq('statut', 'actif');
    }
    return query.range(from, to);
  });

  const clientBySiren: Record<string, { id: string; nom_entreprise: string }> = {};
  for (const client of clients) {
    if (client.siren) {
      clientBySiren[client.siren] = { id: client.id, nom_entreprise: client.nom_entreprise };
    }
  }

  const { error: deleteError } = await supabase
    .from('habilitations')
    .delete();
  if (deleteError) throw deleteError;

  const batchSize = 200;
  let matchedCount = 0;
  const unmatchedSirens = new Set<string>();

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const insertRows = batch.map((row) => {
      const match = clientBySiren[row.siren];
      if (match) matchedCount++;
      else unmatchedSirens.add(row.siren);
      return {
        siren: row.siren,
        service: row.service,
        client_id: match?.id || null,
        date_creation_habilitation: row.dateCreation,
        role: row.role,
        etat: row.etat,
      };
    });

    const { error: insertError } = await supabase
      .from('habilitations')
      .upsert(insertRows, { onConflict: 'siren,service' });
    if (insertError) throw insertError;
  }

  const servicesByClientId: Record<string, string[]> = {};
  for (const row of rows) {
    const match = clientBySiren[row.siren];
    if (match) {
      if (!servicesByClientId[match.id]) servicesByClientId[match.id] = [];
      servicesByClientId[match.id].push(row.service);
    }
  }

  const clientIdsToComplete: string[] = [];
  for (const [clientId, services] of Object.entries(servicesByClientId)) {
    const { percentage } = getCompleteness(services);
    if (percentage >= 90) clientIdsToComplete.push(clientId);
  }

  let promotedCount = 0;
  if (clientIdsToComplete.length > 0) {
    const { data: promoted } = await supabase
      .from('clients')
      .update({ habilitation_avancement: 'complet' })
      .in('id', clientIdsToComplete)
      .neq('habilitation_avancement', 'complet')
      .select('id');
    promotedCount = promoted?.length ?? 0;
  }

  return { imported: rows.length, matched: matchedCount, unmatchedCount: unmatchedSirens.size, duplicatesRemoved, promotedCount };
}

export async function clearAllHabilitations() {
  const { error } = await supabase
    .from('habilitations')
    .delete();
  if (error) throw error;
}

export async function updateClientAvancement(clientId: string, value: string) {
  const { error } = await supabase
    .from('clients')
    .update({ habilitation_avancement: value })
    .eq('id', clientId);
  if (error) throw error;
}

export async function updateClientCommentaire(clientId: string, value: string) {
  const { error } = await supabase
    .from('clients')
    .update({ habilitation_commentaire: value })
    .eq('id', clientId);
  if (error) throw error;
}

export async function toggleClientNonConcerne(clientId: string, value: boolean) {
  const { error } = await supabase
    .from('clients')
    .update({ habilitation_non_concerne: value })
    .eq('id', clientId);
  if (error) throw error;
}

export async function bulkUpdateAvancement(clientIds: string[], value: string) {
  const { error } = await supabase
    .from('clients')
    .update({ habilitation_avancement: value })
    .in('id', clientIds);
  if (error) throw error;
}

export async function bulkToggleNonConcerne(clientIds: string[], value: boolean) {
  const { error } = await supabase
    .from('clients')
    .update({ habilitation_non_concerne: value })
    .in('id', clientIds);
  if (error) throw error;
}

export function computeStats(clientGroups: EnrichedClient[]): HabilitationStats {
  return clientGroups.reduce(
    (acc, client) => {
      if (client.nonConcerne) {
        acc.nonConcerne++;
        return acc;
      }
      if (client.isNonClient) return acc;
      if (!client.hasHabilitations) {
        acc.noHabilitations++;
        acc.applicableCount++;
        return acc;
      }
      if (client.completeness.percentage > 92) acc.complete++;
      else acc.incomplete++;
      acc.totalPercentage += client.completeness.percentage;
      acc.applicableCount++;
      return acc;
    },
    { complete: 0, incomplete: 0, noHabilitations: 0, nonConcerne: 0, totalPercentage: 0, applicableCount: 0 }
  );
}

export async function loadSirenDenominations(sirens: string[]): Promise<Map<string, string>> {
  if (sirens.length === 0) return new Map();
  const { data } = await supabase
    .from('siren_denominations')
    .select('siren, denomination')
    .in('siren', sirens);

  const map = new Map<string, string>();
  if (data) {
    for (const row of data) {
      map.set(row.siren, row.denomination);
    }
  }
  return map;
}

export async function saveSirenDenominations(names: Map<string, string>) {
  const rows = Array.from(names.entries())
    .filter(([key]) => key.length === 9)
    .map(([siren, denomination]) => ({
      siren,
      denomination,
      resolved_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return;
  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    await supabase
      .from('siren_denominations')
      .upsert(rows.slice(i, i + batchSize), { onConflict: 'siren' });
  }
}
