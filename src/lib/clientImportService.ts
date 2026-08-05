import { supabase } from './supabase';
import { ParsedClient } from './clientImportParser';

const DUPLICATE_CHECK_BATCH_SIZE = 100;
const BULK_INSERT_BATCH_SIZE = 50;

export interface DuplicateCheckResult {
  duplicates: Set<number>;
  uniqueClients: ParsedClient[];
}

export interface ImportResult {
  created: number;
  duplicatesIgnored: number;
  errors: Array<{ lineNumber: number; message: string }>;
  createdClients: Array<{ id: string; nom_entreprise: string; siret: string | null }>;
}

async function checkDuplicatesInBatches(
  sirets: string[]): Promise<Set<string>> {
  const existingSirets = new Set<string>();

  const promises = [];
  for (let i = 0; i < sirets.length; i += DUPLICATE_CHECK_BATCH_SIZE) {
    const batch = sirets.slice(i, i + DUPLICATE_CHECK_BATCH_SIZE);
    promises.push(
      supabase
        .from('clients')
        .select('siret')
        .in('siret', batch)
    );
  }

  const results = await Promise.all(promises);

  results.forEach(({ data, error }) => {
    if (!error && data) {
      data.forEach(c => c.siret && existingSirets.add(c.siret));
    }
  });

  return existingSirets;
}

export async function checkDuplicates(
  clients: ParsedClient[]): Promise<DuplicateCheckResult> {
  const validClients = clients.filter(c => c.status === 'valid');

  if (validClients.length === 0) {
    return { duplicates: new Set(), uniqueClients: [] };
  }

  const sirets = validClients.map(c => c.siret).filter(Boolean) as string[];

  const existingSirets = await checkDuplicatesInBatches(sirets);

  const duplicates = new Set<number>();
  const uniqueClients: ParsedClient[] = [];

  for (const client of validClients) {
    if (client.siret && existingSirets.has(client.siret)) {
      duplicates.add(client.lineNumber);
      client.status = 'duplicate';
      client.errorMessage = 'Client déjà existant';
    } else {
      uniqueClients.push(client);
    }
  }

  return { duplicates, uniqueClients };
}

export async function bulkCreateClients(
  clients: ParsedClient[],
  onProgress?: (current: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    duplicatesIgnored: 0,
    errors: [],
    createdClients: [],
  };

  const duplicateCheck = await checkDuplicates(clients);
  result.duplicatesIgnored = duplicateCheck.duplicates.size;

  const clientsToInsert = duplicateCheck.uniqueClients.map(client => ({
    nom_entreprise: client.nom_entreprise,
    siret: client.siret,
    statut: 'actif' as const,
  }));

  if (clientsToInsert.length === 0) {
    return result;
  }

  let processedCount = 0;

  for (let i = 0; i < clientsToInsert.length; i += BULK_INSERT_BATCH_SIZE) {
    const batch = clientsToInsert.slice(i, i + BULK_INSERT_BATCH_SIZE);
    const batchClients = duplicateCheck.uniqueClients.slice(i, i + BULK_INSERT_BATCH_SIZE);

    const { data: insertedClients, error: insertError } = await supabase
      .from('clients')
      .insert(batch)
      .select('id, nom_entreprise, siret');

    if (insertError) {
      for (const client of batchClients) {
        result.errors.push({
          lineNumber: client.lineNumber,
          message: insertError.message,
        });
      }
    } else if (insertedClients) {
      result.created += insertedClients.length;
      result.createdClients.push(...insertedClients);
    }

    processedCount += batch.length;

    if (onProgress) {
      onProgress(processedCount, clientsToInsert.length);
    }
  }

  return result;
}
