import { supabase } from './supabase';
import type { Json } from '../types/database';

/**
 * Le client typé, sans détour.
 *
 * Ce fichier portait « sync_jobs n'est pas encore dans les types générés » et
 * castait le client en conséquence. La table y est maintenant : le commentaire
 * était devenu faux, et le cast ne faisait plus que désarmer le compilateur.
 */
const db = supabase;

export type SyncJobType =
  | 'inpi_single'
  | 'inpi_bulk'
  | 'legal_full'
  | 'bodacc_sync';

export type SyncJobStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'partial'
  | 'error';

export interface SyncJob {
  id: string;
  user_id: string | null;
  job_type: SyncJobType;
  status: SyncJobStatus;
  total: number;
  processed: number;
  success_count: number;
  error_count: number;
  payload: Json;
  result: Record<string, unknown>;
  message: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export const JOB_TYPE_LABELS: Record<SyncJobType, string> = {
  inpi_single: 'Synchronisation INPI',
  inpi_bulk: 'Synchronisation INPI groupée',
  legal_full: 'Synchronisation juridique complète',
  bodacc_sync: 'Synchronisation BODACC',
};

interface CreateSyncJobInput {
  userId: string;
  jobType: SyncJobType;
  total?: number;
  payload?: Json;
  message?: string;
}

export async function createSyncJob(input: CreateSyncJobInput): Promise<SyncJob | null> {
  const { data, error } = await db
    .from('sync_jobs')
    .insert({
      user_id: input.userId,
      job_type: input.jobType,
      status: 'running',
      total: input.total ?? 0,
      payload: input.payload ?? {},
      message: input.message ?? '',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    return null;
  }
  return data as SyncJob;
}

interface UpdateSyncJobInput {
  processed?: number;
  total?: number;
  success_count?: number;
  error_count?: number;
  message?: string;
  result?: Json;
  status?: SyncJobStatus;
}

export async function updateSyncJob(jobId: string, patch: UpdateSyncJobInput): Promise<void> {
  await db.from('sync_jobs').update(patch).eq('id', jobId);
}

interface FinalizeSyncJobInput {
  status: SyncJobStatus;
  message?: string;
  result?: Json;
  successCount?: number;
  errorCount?: number;
  processed?: number;
  total?: number;
}

export async function finalizeSyncJob(jobId: string, input: FinalizeSyncJobInput): Promise<void> {
  const patch: UpdateSyncJobInput & { finished_at: string } = {
    status: input.status,
    finished_at: new Date().toISOString(),
  };
  if (input.message !== undefined) patch.message = input.message;
  if (input.result !== undefined) patch.result = input.result;
  if (input.successCount !== undefined) patch.success_count = input.successCount;
  if (input.errorCount !== undefined) patch.error_count = input.errorCount;
  if (input.processed !== undefined) patch.processed = input.processed;
  if (input.total !== undefined) patch.total = input.total;
  await db.from('sync_jobs').update(patch).eq('id', jobId);
}

export async function listActiveSyncJobs(): Promise<SyncJob[]> {
  const { data } = await db
    .from('sync_jobs')
    .select('*')
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: false });
  return (data ?? []) as SyncJob[];
}

export async function listRecentSyncJobs(limit = 10): Promise<SyncJob[]> {
  const { data } = await db
    .from('sync_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as SyncJob[];
}

export async function dismissSyncJob(jobId: string): Promise<void> {
  await db.from('sync_jobs').delete().eq('id', jobId);
}

export function subscribeToCabinetSyncJobs(
  onChange: (job: SyncJob, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
): () => void {
  const channel = db
    .channel('sync_jobs')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sync_jobs',
      },
      (payload: { new?: SyncJob; old?: SyncJob; eventType: string }) => {
        const job = (payload.new ?? payload.old) as SyncJob;
        onChange(job, payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE');
      }
    )
    .subscribe();

  return () => {
    db.removeChannel(channel);
  };
}
