import { useState, useMemo, useEffect, useCallback } from 'react';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { SortableTh } from '../ui/SortButton';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Calendar,
} from 'lucide-react';
import { Database } from '../../types/database';
import { ClientDepotComptes } from '../../lib/bodaccService';
import { PeriodesTooltip } from './PeriodesTooltip';
import {
  computeStatus,
  formatDateFR,
  STATUS_ORDER,
  STATUS_CONFIG,
  MONTH_LABELS,
  DepotStatus,
} from '../../lib/depotComptesStatusUtils';
import { useAuth } from '../../contexts/AuthContext';
import {
  type AgoAvancementStatus,
  type ClientAgoAvancement,
  getAgoStatusBadgeClass,
  listAgoStatuses,
  listClientAgoAvancements,
  upsertClientAgoAvancement,
} from '../../lib/agoAvancementService';

type Client = Database['public']['Tables']['clients']['Row'];

type SortField = 'societe' | 'status' | 'cloture' | 'limite' | 'avancement';

interface SuiviDepotComptesProps {
  clients: Client[];
  depotComptes: ClientDepotComptes[];
  excludedClientIds?: Set<string>;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSortChange: (field: string) => void;
}

function getCurrentExerciceYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export function SuiviDepotComptes({ clients, depotComptes, excludedClientIds = new Set(), sortField, sortDir, onSortChange }: SuiviDepotComptesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<DepotStatus | null>(null);
  const [avancementFilter, setAvancementFilter] = useState<string | null>(null);

  const { profile } = useAuth();
  const userId = profile?.id;

  const [agoStatuses, setAgoStatuses] = useState<AgoAvancementStatus[]>([]);
  const [avancements, setAvancements] = useState<Map<string, ClientAgoAvancement>>(new Map());
  const [exerciceYear] = useState(getCurrentExerciceYear);

  const loadAgoData = useCallback(async () => {
    if (!profile) return;
    try {
      const [statuses, avs] = await Promise.all([
        listAgoStatuses(),
        listClientAgoAvancements(exerciceYear),
      ]);
      setAgoStatuses(statuses);
      const map = new Map<string, ClientAgoAvancement>();
      avs.forEach(a => map.set(a.client_id, a));
      setAvancements(map);
    } catch (err) {
      console.warn('Failed to load AGO avancement data:', err);
    }
  }, [exerciceYear]);

  useEffect(() => { loadAgoData(); }, [loadAgoData]);

  async function handleAvancementChange(clientId: string, statusId: string) {
    if (!profile) return;
    const newStatusId = statusId === '' ? null : statusId;
    try {
      await upsertClientAgoAvancement(clientId, exerciceYear, newStatusId, userId || null);
      setAvancements(prev => {
        const next = new Map(prev);
        const existing = next.get(clientId);
        if (existing) {
          next.set(clientId, { ...existing, status_id: newStatusId, updated_at: new Date().toISOString() });
        } else {
          next.set(clientId, {
            id: 'temp',
            client_id: clientId,
            exercice_year: exerciceYear,
            status_id: newStatusId,
            updated_by: userId || null,
            updated_at: new Date().toISOString(),
          });
        }
        return next;
      });
    } catch {
      // silent
    }
  }

  const activeClients = useMemo(
    () => clients.filter((c) => c.statut === 'actif'),
    [clients]
  );

  const statuses = useMemo(() => {
    return activeClients.map((client) => {
      const clientDepots = depotComptes.filter((d) => d.client_id === client.id);
      return computeStatus(client, clientDepots);
    });
  }, [activeClients, depotComptes]);

  const filtered = useMemo(() => {
    let result = [...statuses];

    if (monthFilter !== null) {
      result = result.filter((s) => s.clotureMonthIndex === monthFilter);
    }

    if (avancementFilter !== null) {
      if (avancementFilter === '__none__') {
        result = result.filter((s) => !avancements.get(s.client.id)?.status_id);
      } else {
        result = result.filter((s) => avancements.get(s.client.id)?.status_id === avancementFilter);
      }
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) =>
          (s.client.nom_entreprise || '').toLowerCase().includes(q) ||
          (s.client.siren || '').includes(q)
      );
    }

    return result;
  }, [statuses, searchQuery, monthFilter, avancementFilter, avancements]);

  const counts = useMemo(() => {
    const c = { en_regle: 0, ag_a_faire: 0, en_retard: 0, premiere_cloture: 0 };
    filtered.forEach((s) => c[s.status]++);
    return c;
  }, [filtered]);

  const displayed = useMemo(() => {
    if (!statusFilter) return filtered;
    return filtered.filter((s) => s.status === statusFilter);
  }, [filtered, statusFilter]);

  const sorted = useMemo(() => {
    return [...displayed].sort((a, b) => {
      let cmp = 0;
      switch (sortField as SortField) {
        case 'societe':
          cmp = a.client.nom_entreprise.localeCompare(b.client.nom_entreprise);
          break;
        case 'status':
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          if (cmp === 0) cmp = a.client.nom_entreprise.localeCompare(b.client.nom_entreprise);
          break;
        case 'cloture':
          cmp = (a.derniereCloture || '').localeCompare(b.derniereCloture || '');
          break;
        case 'limite':
          cmp = (a.dateLimite || '').localeCompare(b.dateLimite || '');
          break;
        case 'avancement': {
          const aStatus = avancements.get(a.client.id)?.status_id;
          const bStatus = avancements.get(b.client.id)?.status_id;
          const aPos = agoStatuses.find(s => s.id === aStatus)?.position ?? 999;
          const bPos = agoStatuses.find(s => s.id === bStatus)?.position ?? 999;
          cmp = aPos - bPos;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [displayed, sortField, sortDir, avancements, agoStatuses]);

  const ROW_BG: Record<DepotStatus, string> = {
    en_retard: 'bg-red-50/60 dark:bg-red-900/20',
    ag_a_faire: 'bg-amber-50/50 dark:bg-amber-900/15',
    premiere_cloture: '',
    en_regle: '',
  };

  if (activeClients.length === 0) return null;

  const hasActiveFilters = searchQuery.trim() !== '' || monthFilter !== null || statusFilter !== null || avancementFilter !== null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Suivi du depot des comptes
        <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
          Exercice {exerciceYear}
        </span>
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
          label="En regle"
          count={counts.en_regle}
          bgClass="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
          activeBgClass="bg-green-100 dark:bg-green-900/40 border-green-400 dark:border-green-600 ring-2 ring-green-300 dark:ring-green-700"
          textClass="text-green-700 dark:text-green-400"
          isActive={statusFilter === 'en_regle'}
          onClick={() => setStatusFilter(statusFilter === 'en_regle' ? null : 'en_regle')}
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
          label="AG a faire"
          count={counts.ag_a_faire}
          bgClass="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
          activeBgClass="bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 ring-2 ring-amber-300 dark:ring-amber-700"
          textClass="text-amber-700 dark:text-amber-400"
          isActive={statusFilter === 'ag_a_faire'}
          onClick={() => setStatusFilter(statusFilter === 'ag_a_faire' ? null : 'ag_a_faire')}
        />
        <StatCard
          icon={<AlertCircle className="w-5 h-5 text-red-500" />}
          label="En retard"
          count={counts.en_retard}
          bgClass="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
          activeBgClass="bg-red-100 dark:bg-red-900/40 border-red-400 dark:border-red-600 ring-2 ring-red-300 dark:ring-red-700"
          textClass="text-red-700 dark:text-red-400"
          isActive={statusFilter === 'en_retard'}
          onClick={() => setStatusFilter(statusFilter === 'en_retard' ? null : 'en_retard')}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-gray-400 dark:text-gray-500" />}
          label="Premiere cloture"
          count={counts.premiere_cloture}
          bgClass="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
          activeBgClass="bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500 ring-2 ring-gray-300 dark:ring-gray-600"
          textClass="text-gray-600 dark:text-gray-400"
          isActive={statusFilter === 'premiere_cloture'}
          onClick={() => setStatusFilter(statusFilter === 'premiere_cloture' ? null : 'premiere_cloture')}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom ou SIREN..."
            className="pl-9"
          />
        </div>
        <div className="relative max-w-[220px]">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <select
            value={monthFilter === null ? '' : String(monthFilter)}
            onChange={(e) => setMonthFilter(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 appearance-none cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
          >
            <option value="">Tous les mois</option>
            {[11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((m) => (
              <option key={m} value={String(m)}>{MONTH_LABELS[m]}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {agoStatuses.length > 0 && (
          <div className="relative max-w-[220px]">
            <select
              value={avancementFilter ?? ''}
              onChange={(e) => setAvancementFilter(e.target.value === '' ? null : e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 appearance-none cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
            >
              <option value="">Tous avancements</option>
              <option value="__none__">Non renseigne</option>
              {agoStatuses.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-12 text-center">
          <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasActiveFilters
              ? 'Aucun resultat pour les filtres appliques'
              : 'Aucun client actif'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <SortableTh label="Societe" field="societe" activeField={sortField} direction={sortDir} onSort={onSortChange} className="py-3" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                    Cloture annuelle
                  </th>
                  <SortableTh label="Derniere cloture" field="cloture" activeField={sortField} direction={sortDir} onSort={onSortChange} className="py-3" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">
                    Dernier depot
                  </th>
                  <SortableTh label="Date limite" field="limite" activeField={sortField} direction={sortDir} onSort={onSortChange} className="hidden md:table-cell py-3" />
                  <SortableTh label="Statut" field="status" activeField={sortField} direction={sortDir} onSort={onSortChange} className="py-3" />
                  {agoStatuses.length > 0 && (
                    <SortableTh label="Avancement" field="avancement" activeField={sortField} direction={sortDir} onSort={onSortChange} className="py-3" />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sorted.map((row) => {
                  const cfg = STATUS_CONFIG[row.status];
                  const isExcluded = excludedClientIds.has(row.client.id);
                  const clientAvancement = avancements.get(row.client.id);
                  const currentStatusId = clientAvancement?.status_id || '';
                  const currentStatus = agoStatuses.find(s => s.id === currentStatusId);

                  return (
                    <tr
                      key={row.client.id}
                      className={`${isExcluded ? 'bg-red-50/80 dark:bg-red-900/20' : ROW_BG[row.status]} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                    >
                      <td className="px-4 py-3">
                        <div className={`font-medium truncate max-w-[200px] ${isExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {row.client.nom_entreprise}
                        </div>
                        {row.client.forme_juridique && (
                          <div className={`text-xs truncate max-w-[200px] ${isExcluded ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                            {row.client.forme_juridique}
                          </div>
                        )}
                        {isExcluded && !row.client.forme_juridique && (
                          <div className="text-xs text-red-500 dark:text-red-400 font-medium">Forme juridique manquante</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {row.dateClotureMois}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        <span className={row.note ? 'italic' : ''}>
                          {row.derniereCloture ? formatDateFR(row.derniereCloture) : '-'}
                        </span>
                        {row.note && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.note}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                        {row.dernierDepot ? formatDateFR(row.dernierDepot) : '-'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={
                          row.status === 'en_retard' ? 'text-red-600 dark:text-red-400 font-medium' :
                          row.status === 'ag_a_faire' ? 'text-amber-600 dark:text-amber-400 font-medium' :
                          'text-gray-600 dark:text-gray-400'
                        }>
                          {row.dateLimite ? formatDateFR(row.dateLimite) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <PeriodesTooltip periods={row.detailPeriodes}>
                          <Badge variant={cfg.variant}>
                            {row.status === 'en_retard' && row.nombrePeriodesEnRetard > 0
                              ? `${row.nombrePeriodesEnRetard} periode${row.nombrePeriodesEnRetard > 1 ? 's' : ''} en retard`
                              : row.status === 'ag_a_faire' && row.nombrePeriodesAFaire > 0
                              ? `${row.nombrePeriodesAFaire} periode${row.nombrePeriodesAFaire > 1 ? 's' : ''} a faire`
                              : cfg.label}
                          </Badge>
                        </PeriodesTooltip>
                      </td>
                      {agoStatuses.length > 0 && (
                        <td className="px-4 py-3">
                          <div className="relative">
                            <select
                              value={currentStatusId}
                              onChange={(e) => handleAvancementChange(row.client.id, e.target.value)}
                              className={`w-full max-w-[160px] px-2 py-1.5 text-xs rounded-lg border appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                                currentStatus
                                  ? `${getAgoStatusBadgeClass(currentStatus.color)} border-transparent font-medium`
                                  : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              <option value="">--</option>
                              {agoStatuses.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                              ))}
                            </select>
                            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                              <svg className="w-3 h-3 text-current opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  count,
  bgClass,
  activeBgClass,
  textClass,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  bgClass: string;
  activeBgClass: string;
  textClass: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-all cursor-pointer ${
        isActive ? activeBgClass : `${bgClass} hover:shadow-sm`
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className={`text-xs font-medium ${textClass}`}>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${textClass}`}>{count}</div>
    </button>
  );
}
