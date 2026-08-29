import { useState, useEffect, useCallback } from 'react';
import { Clock, Settings, Check, Play, ChevronDown, ChevronUp, AlertTriangle, RefreshCw, Shield, FileText } from 'lucide-react';
import {
  getSyncSettings,
  upsertSyncSettings,
  getLegalSyncLogs,
  triggerLegalFullSync,
  type SyncSettings,
  type LegalSyncLogEntry,
} from '../../lib/inpiService';
import { useSyncJobs } from '../../contexts/SyncJobsContext';
import { finalizeSyncJob } from '../../lib/syncJobsService';
import { useToast } from '../../contexts/ToastContext';

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Quotidien',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
};

function BatchProgressBar({ progress, lastCompleted }: {
  progress: { batch_offset?: number; total?: number; batch_size?: number; cycle_complete?: boolean };
  lastCompleted?: string | null;
}) {
  const offset = progress.batch_offset || 0;
  const total = progress.total || 0;
  const pct = total > 0 ? Math.min(100, Math.round((offset / total) * 100)) : 0;
  const cycleComplete = progress.cycle_complete || offset === 0;

  if (total === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
        <span>
          {cycleComplete ? 'Cycle complet' : `${offset}/${total} clients traites`}
          {progress.batch_size && !cycleComplete && ` (lots de ${progress.batch_size})`}
        </span>
        {lastCompleted && (
          <span>Dernier cycle: {new Date(lastCompleted).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        )}
      </div>
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${cycleComplete ? 'bg-emerald-500' : 'bg-teal-500'}`}
          style={{ width: `${cycleComplete ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}


const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  success: { label: 'Reussi', color: 'text-green-700', bg: 'bg-green-50' },
  error: { label: 'Erreur', color: 'text-red-700', bg: 'bg-red-50' },
  running: { label: 'En cours', color: 'text-teal-700', bg: 'bg-teal-50' },
  partial: { label: 'Partiel', color: 'text-amber-700', bg: 'bg-amber-50' },
  never: { label: 'Jamais', color: 'text-gray-500', bg: 'bg-gray-50' },
};

const PHASE_LABELS: Record<string, string> = {
  phase1_inpi: 'INPI (dirigeants + actes)',
  phase2_bodacc: 'BODACC (depots des comptes)',
  phase3_alerts: 'Detection des alertes',
};

function SyncStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.never;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.color}`}>
      {status === 'running' && <RefreshCw className="w-3 h-3 animate-spin" />}
      {status === 'success' && <Check className="w-3 h-3" />}
      {status === 'error' && <AlertTriangle className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

function SyncConfigForm({ settings, onSave, saving }: {
  settings: { frequency: string; batchSize: number; isEnabled: boolean };
  onSave: (f: string, batchSize: number, e: boolean) => void;
  saving: boolean;
}) {
  const [frequency, setFrequency] = useState(settings.frequency);
  const [batchSize, setBatchSize] = useState(settings.batchSize);
  const [isEnabled, setIsEnabled] = useState(settings.isEnabled);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={e => setIsEnabled(e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">Activer la synchronisation automatique</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Frequence de cycle</label>
          <select
            value={frequency}
            onChange={e => setFrequency(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="daily">Quotidien (1 cycle/jour)</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuel</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Taille du lot (clients/heure)</label>
          <select
            value={batchSize}
            onChange={e => setBatchSize(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value={25}>25 clients/heure</option>
            <option value={50}>50 clients/heure (recommande)</option>
            <option value={75}>75 clients/heure</option>
            <option value={100}>100 clients/heure</option>
          </select>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Les lots sont traites toutes les heures automatiquement. Un cycle complet se termine quand tous les clients ont ete synchronises.
      </p>

      <div className="flex justify-end">
        <button
          onClick={() => onSave(frequency, batchSize, isEnabled)}
          disabled={saving}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

function SyncLogHistory({ logs }: { logs: LegalSyncLogEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">Aucun historique</p>;
  }

  return (
    <div className="space-y-1.5 max-h-60 overflow-y-auto">
      {logs.map(log => (
        <div key={log.id} className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <SyncStatusBadge status={log.status} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {new Date(log.started_at).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {log.clients_processed}/{log.total_clients} clients
              </span>
            </div>
            {expandedId === log.id ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
          </button>

          {expandedId === log.id && (
            <div className="px-3 pb-2 space-y-2 border-t border-gray-50 dark:border-gray-700">
              {log.phases_completed && (
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {Object.entries(log.phases_completed).map(([key, status]) => (
                    <div key={key} className="text-center">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{PHASE_LABELS[key] || key}</p>
                      <SyncStatusBadge status={status as string} />
                    </div>
                  ))}
                </div>
              )}
              {log.error_details && log.error_details.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-red-600">Erreurs :</p>
                  {log.error_details.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-[10px] text-red-500 pl-2">
                      {err.name} ({err.phase}) : {err.error}
                    </p>
                  ))}
                  {log.error_details.length > 5 && (
                    <p className="text-[10px] text-gray-400 pl-2">+{log.error_details.length - 5} autres erreurs</p>
                  )}
                </div>
              )}
              {log.completed_at && (
                <p className="text-[10px] text-gray-400">
                  Duree : {Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SyncSettingsPanel() {
  const [inpiSettings, setInpiSettings] = useState<SyncSettings | null>(null);
  const [fullSettings, setFullSettings] = useState<SyncSettings | null>(null);
  const [actsSettings, setActsSettings] = useState<SyncSettings | null>(null);
  const [syncLogs, setSyncLogs] = useState<LegalSyncLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'full' | 'inpi' | 'acts'>('full');
  const [showConfig, setShowConfig] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const { startJob, hasActiveJob } = useSyncJobs();
  const { showToast } = useToast();
  const triggering = hasActiveJob((j) => j.job_type === 'legal_full');

  const loadAll = useCallback(async () => {
    const [inpi, full, acts, logs] = await Promise.all([
      getSyncSettings('inpi_officers'),
      getSyncSettings('legal_full'),
      getSyncSettings('legal_acts'),
      getLegalSyncLogs(),
    ]);
    setInpiSettings(inpi);
    setFullSettings(full);
    setActsSettings(acts);
    setSyncLogs(logs);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const currentSettings = activeTab === 'full' ? fullSettings : activeTab === 'acts' ? actsSettings : inpiSettings;
  const syncType = activeTab === 'full' ? 'legal_full' : activeTab === 'acts' ? 'legal_acts' : 'inpi_officers';

  async function handleSave(frequency: string, batchSize: number, isEnabled: boolean) {
    setSaving(true);
    const ok = await upsertSyncSettings({ frequency, batch_size: batchSize, is_enabled: isEnabled }, syncType);
    if (ok) await loadAll();
    setSaving(false);
    setShowConfig(false);
  }

  async function handleTriggerNow() {
    const job = await startJob({
      jobType: 'legal_full',
      message: 'Synchronisation juridique complète…',
    });
    if (!job) {
      showToast('Impossible de lancer la synchronisation', 'error');
      return;
    }
    showToast('Synchronisation lancée en arrière-plan', 'info');
    void (async () => {
      const result = await triggerLegalFullSync(job.id);
      if (!result.success) {
        await finalizeSyncJob(job.id, {
          status: 'error',
          message: result.message || 'Erreur de connexion',
        });
      }
      await loadAll();
    })();
  }

  const runningPhases = fullSettings?.sync_progress?.phases;
  const isRunning = fullSettings?.last_sync_status === 'running';

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="flex border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('full')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'full'
              ? 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 border-b-2 border-teal-600 dark:border-teal-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Sync complete
          </div>
        </button>
        <button
          onClick={() => setActiveTab('inpi')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'inpi'
              ? 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 border-b-2 border-teal-600 dark:border-teal-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Dirigeants
          </div>
        </button>
        <button
          onClick={() => setActiveTab('acts')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
            activeTab === 'acts'
              ? 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 border-b-2 border-teal-600 dark:border-teal-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Actes/Statuts
          </div>
        </button>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              currentSettings?.is_enabled ? 'bg-green-100 dark:bg-green-900/40' : 'bg-gray-100 dark:bg-gray-700'
            }`}>
              {activeTab === 'full'
                ? <Shield className={`w-4 h-4 ${currentSettings?.is_enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
                : <Clock className={`w-4 h-4 ${currentSettings?.is_enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
              }
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {activeTab === 'full' ? 'Synchronisation juridique complete' : 'Synchronisation INPI dirigeants'}
                </span>
                {currentSettings?.is_enabled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                    <Check className="w-3 h-3" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    Desactivee
                  </span>
                )}
              </div>

              {activeTab === 'full' && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  INPI actes + dirigeants, BODACC depots, alertes juridiques
                </p>
              )}

              {currentSettings?.is_enabled && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {FREQUENCY_LABELS[currentSettings.frequency] || currentSettings.frequency} | {currentSettings.batch_size || 50} clients/lot/heure
                  {currentSettings.last_sync_at && (
                    <> | {new Date(currentSettings.last_sync_at).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}</>
                  )}
                  {currentSettings.last_sync_status && currentSettings.last_sync_status !== 'never' && (
                    <> | <SyncStatusBadge status={currentSettings.last_sync_status} /></>
                  )}
                </p>
              )}

              {currentSettings?.is_enabled && currentSettings.sync_progress && (
                <BatchProgressBar progress={currentSettings.sync_progress} lastCompleted={currentSettings.last_batch_completed_at} />
              )}

              {currentSettings?.last_sync_message && (currentSettings.last_sync_status === 'error' || currentSettings.last_sync_status === 'partial') && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{currentSettings.last_sync_message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {activeTab === 'full' && (
              <button
                onClick={handleTriggerNow}
                disabled={triggering || isRunning}
                className="p-2 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors disabled:opacity-50"
                title="Lancer maintenant"
              >
                {triggering || isRunning ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            )}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Configurer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isRunning && runningPhases && activeTab === 'full' && (
          <div className="mt-3 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-3.5 h-3.5 text-teal-600 animate-spin" />
              <span className="text-xs font-medium text-teal-700 dark:text-teal-300">Synchronisation en cours...</span>
              {fullSettings?.sync_progress && (
                <span className="text-[10px] text-teal-600 dark:text-teal-400">
                  {fullSettings.sync_progress.processed}/{fullSettings.sync_progress.total} clients
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(runningPhases).map(([key, status]) => (
                <div key={key} className="text-center">
                  <p className="text-[10px] text-teal-600 dark:text-teal-400 truncate">{PHASE_LABELS[key] || key}</p>
                  <SyncStatusBadge status={status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {showConfig && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <SyncConfigForm
              settings={{
                frequency: currentSettings?.frequency || 'daily',
                batchSize: currentSettings?.batch_size ?? 50,
                isEnabled: currentSettings?.is_enabled ?? false,
              }}
              onSave={handleSave}
              saving={saving}
            />
          </div>
        )}

        {activeTab === 'full' && (
          <div className="mt-3">
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory && syncLogs.length === 0) loadAll(); }}
              className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Historique des synchronisations
            </button>
            {showHistory && (
              <div className="mt-2">
                <SyncLogHistory logs={syncLogs} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
