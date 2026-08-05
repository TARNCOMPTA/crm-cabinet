import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { syncClientWithINPI } from '../../lib/inpiService';
import { useToast } from '../../contexts/ToastContext';
import { useSyncJobs } from '../../contexts/SyncJobsContext';
import { finalizeSyncJob } from '../../lib/syncJobsService';

interface INPISyncButtonProps {
  clientId: string;
  onSyncComplete?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function INPISyncButton({
  clientId,
  onSyncComplete,
  variant = 'outline',
  size = 'sm',
  showLabel = true,
}: INPISyncButtonProps) {
  const { showToast } = useToast();
  const { startJob, hasActiveJob } = useSyncJobs();

  const isRunning = hasActiveJob(
    (job) =>
      job.job_type === 'inpi_single' &&
      (job.payload as { clientId?: string })?.clientId === clientId
  );

  async function handleSync() {
    const job = await startJob({
      jobType: 'inpi_single',
      total: 1,
      payload: { clientId },
      message: 'Synchronisation INPI en cours…',
    });

    if (!job) {
      showToast('Impossible de lancer la synchronisation', 'error');
      return;
    }

    showToast('Synchronisation INPI lancée en arrière-plan', 'info');

    void (async () => {
      try {
        const result = await syncClientWithINPI(clientId);
        if (result.success) {
          await finalizeSyncJob(job.id, {
            status: 'success',
            message: result.message,
            processed: 1,
            total: 1,
            successCount: 1,
            errorCount: 0,
          });
          if (onSyncComplete) onSyncComplete();
        } else {
          await finalizeSyncJob(job.id, {
            status: 'error',
            message: result.message,
            processed: 1,
            total: 1,
            successCount: 0,
            errorCount: 1,
          });
        }
      } catch (error) {
        await finalizeSyncJob(job.id, {
          status: 'error',
          message: error instanceof Error ? error.message : 'Erreur inattendue',
          processed: 1,
          total: 1,
          successCount: 0,
          errorCount: 1,
        });
      }
    })();
  }

  return (
    <Button
      onClick={handleSync}
      disabled={isRunning}
      variant={variant}
      size={size}
      className="flex items-center space-x-2"
    >
      <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
      {showLabel && <span>{isRunning ? 'Synchro…' : 'Sync INPI'}</span>}
    </Button>
  );
}
