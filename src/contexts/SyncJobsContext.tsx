import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  type SyncJob,
  type SyncJobType,
  createSyncJob,
  dismissSyncJob,
  finalizeSyncJob,
  listRecentSyncJobs,
  subscribeToCabinetSyncJobs,
  updateSyncJob,
  JOB_TYPE_LABELS,
} from '../lib/syncJobsService';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface SyncJobsContextValue {
  jobs: SyncJob[];
  activeJobs: SyncJob[];
  hasActiveJob: (predicate: (job: SyncJob) => boolean) => boolean;
  startJob: (input: {
    jobType: SyncJobType;
    total?: number;
    payload?: Record<string, unknown>;
    message?: string;
  }) => Promise<SyncJob | null>;
  updateJob: typeof updateSyncJob;
  finishJob: typeof finalizeSyncJob;
  dismissJob: (jobId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const SyncJobsContext = createContext<SyncJobsContextValue | undefined>(undefined);

const JOB_LIST_LIMIT = 12;

export function SyncJobsProvider({ children }: { children: React.ReactNode }) {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const previousStatusRef = useRef<Map<string, string>>(new Map());

  /**
   * ⚠️ `[profile]`, et non `[]`.
   *
   * Avec un tableau vide, cette fonction capturait le `profile` du PREMIER
   * rendu — c'est-à-dire `null`, la session n'étant pas encore chargée. Elle
   * repartait donc systématiquement sur la branche du haut : la liste des
   * travaux n'était JAMAIS lue en base, quelle que soit la suite. Le seul
   * contenu que l'indicateur ait jamais affiché venait de `startJob`.
   */
  const refresh = useCallback(async () => {
    if (!profile) {
      setJobs([]);
      previousStatusRef.current = new Map();
      return;
    }
    const recent = await listRecentSyncJobs(JOB_LIST_LIMIT);
    setJobs(recent);
    previousStatusRef.current = new Map(recent.map((j) => [j.id, j.status]));
  }, [profile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!profile) return;
    const unsubscribe = subscribeToCabinetSyncJobs((job, eventType) => {
      if (eventType === 'DELETE') {
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
        previousStatusRef.current.delete(job.id);
        return;
      }

      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx === -1) {
          return [job, ...prev].slice(0, JOB_LIST_LIMIT);
        }
        const next = [...prev];
        next[idx] = job;
        return next;
      });

      const previousStatus = previousStatusRef.current.get(job.id);
      previousStatusRef.current.set(job.id, job.status);

      if (
        previousStatus &&
        previousStatus !== job.status &&
        ['success', 'partial', 'error'].includes(job.status)
      ) {
        const label = JOB_TYPE_LABELS[job.job_type as SyncJobType] ?? 'Synchronisation';
        if (job.status === 'success') {
          showToast(`${label} terminée${job.message ? ` — ${job.message}` : ''}`, 'success');
        } else if (job.status === 'partial') {
          showToast(`${label} partielle${job.message ? ` — ${job.message}` : ''}`, 'warning');
        } else {
          showToast(`${label} en erreur${job.message ? ` — ${job.message}` : ''}`, 'error');
        }
      }
    });

    return unsubscribe;
  }, [showToast]);

  const startJob = useCallback<SyncJobsContextValue['startJob']>(
    async (input) => {
      if (!user?.id) return null;
      const job = await createSyncJob({
        userId: user.id,
        jobType: input.jobType,
        total: input.total,
        payload: input.payload,
        message: input.message,
      });
      if (job) {
        setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)].slice(0, JOB_LIST_LIMIT));
        previousStatusRef.current.set(job.id, job.status);
      }
      return job;
    },
    [user?.id]
  );

  const dismissJob = useCallback(async (jobId: string) => {
    await dismissSyncJob(jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    previousStatusRef.current.delete(jobId);
  }, []);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status === 'pending' || j.status === 'running'),
    [jobs]
  );

  /**
   * Interrogation périodique tant qu'un travail est en cours.
   *
   * L'abonnement temps réel ci-dessus est un TALON INERTE depuis la refonte
   * (voir `channel()` dans lib/supabase.ts) : il n'appelle jamais son rappel.
   * Une synchronisation terminée côté serveur restait donc « en cours » à
   * l'écran, et la roue de l'en-tête tournait jusqu'au prochain rechargement
   * complet de la page — sans que rien n'indique que le travail était fini.
   *
   * Cinq secondes, et seulement quand il y a quelque chose à suivre : sur un
   * écran au repos, aucune requête n'est émise. Onglet en arrière-plan, on
   * s'abstient aussi — le navigateur bride les minuteurs, et personne ne
   * regarde.
   */
  useEffect(() => {
    if (activeJobs.length === 0) return;
    const battement = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5_000);
    return () => clearInterval(battement);
  }, [activeJobs.length, refresh]);

  const hasActiveJob = useCallback(
    (predicate: (job: SyncJob) => boolean) => activeJobs.some(predicate),
    [activeJobs]
  );

  const value = useMemo<SyncJobsContextValue>(
    () => ({
      jobs,
      activeJobs,
      hasActiveJob,
      startJob,
      updateJob: updateSyncJob,
      finishJob: finalizeSyncJob,
      dismissJob,
      refresh,
    }),
    [jobs, activeJobs, hasActiveJob, startJob, dismissJob, refresh]
  );

  return <SyncJobsContext.Provider value={value}>{children}</SyncJobsContext.Provider>;
}

export function useSyncJobs(): SyncJobsContextValue {
  const ctx = useContext(SyncJobsContext);
  if (!ctx) {
    throw new Error('useSyncJobs must be used within SyncJobsProvider');
  }
  return ctx;
}
