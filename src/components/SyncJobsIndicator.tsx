import { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';
import { useSyncJobs } from '../contexts/SyncJobsContext';
import { JOB_TYPE_LABELS, type SyncJob, type SyncJobType } from '../lib/syncJobsService';

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso) return '';
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m${rem.toString().padStart(2, '0')}s`;
}

function StatusIcon({ status }: { status: SyncJob['status'] }) {
  if (status === 'running' || status === 'pending') {
    return <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />;
  }
  if (status === 'success') {
    return <CheckCircle2 className="w-4 h-4 text-green-600" />;
  }
  if (status === 'partial') {
    return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  }
  return <AlertTriangle className="w-4 h-4 text-red-500" />;
}

function JobRow({ job, onDismiss }: { job: SyncJob; onDismiss: (id: string) => void }) {
  const label = JOB_TYPE_LABELS[job.job_type as SyncJobType] ?? 'Synchronisation';
  const isActive = job.status === 'running' || job.status === 'pending';
  const progress = job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : null;

  return (
    <div className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-2.5">
        <StatusIcon status={job.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
            {/*
              Le bouton s'affiche AUSSI quand la tâche est active, et c'est le
              correctif : il était masqué exactement dans le cas où il sert.
              Une synchronisation est pilotée par le navigateur qui l'a lancée ;
              si cet onglet a disparu, plus personne ne la clôt, et la ligne
              restait « en cours » sans aucune sortie depuis l'interface — roue
              de l'en-tête comprise.

              Retirer n'interrompt rien : le CRM ne pilote pas la
              synchronisation, il l'observe. Le libellé le dit, pour que
              personne ne croie avoir annulé un traitement en cours.
            */}
            <button
              type="button"
              onClick={() => onDismiss(job.id)}
              className="p-1 -m-1 text-gray-400 hover:text-gray-600 rounded"
              aria-label={isActive ? 'Retirer de la liste' : 'Retirer'}
              title={
                isActive
                  ? 'Retirer de la liste. N’interrompt pas la synchronisation : le CRM l’observe, il ne la pilote pas.'
                  : 'Retirer'
              }
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {job.message && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{job.message}</p>
          )}
          {job.total > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>
                  {job.processed}/{job.total}
                  {job.error_count > 0 && (
                    <span className="text-red-500"> · {job.error_count} erreur(s)</span>
                  )}
                </span>
                <span>{formatDuration(job.started_at, job.finished_at)}</span>
              </div>
              {progress !== null && (
                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      job.status === 'error'
                        ? 'bg-red-500'
                        : job.status === 'partial'
                        ? 'bg-amber-500'
                        : isActive
                        ? 'bg-teal-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SyncJobsIndicator() {
  const { jobs, activeJobs, dismissJob } = useSyncJobs();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const hasActive = activeJobs.length > 0;

  if (jobs.length === 0) return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Synchronisations"
      >
        {hasActive ? (
          <RefreshCw className="w-5 h-5 animate-spin text-teal-600" />
        ) : (
          <Activity className="w-5 h-5" />
        )}
        {hasActive && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-teal-500 rounded-full" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Synchronisations</p>
              <p className="text-xs text-gray-500">
                {hasActive
                  ? `${activeJobs.length} en cours en arrière-plan`
                  : 'Aucune synchronisation en cours'}
              </p>
            </div>
          </div>
          <div className="p-2 max-h-[420px] overflow-y-auto space-y-1.5">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onDismiss={dismissJob} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
