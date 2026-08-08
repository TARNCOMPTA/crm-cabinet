import { useState, useMemo } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SortButton, SortableTh } from '../ui/SortButton';
import {
  RefreshCw,
  FileCheck,
  Search,
  Calendar,
  Building2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { Database } from '../../types/database';
import { syncBodaccForClient, ClientDepotComptes } from '../../lib/bodaccService';
import { useSortableTable } from '../../hooks/useSortableTable';
import { SortableTableWrapper } from '../ui/SortableTableWrapper';
import { SortableCardRow } from '../ui/SortableRow';

type Client = Database['public']['Tables']['clients']['Row'];

interface DepotComptesTabProps {
  clients: Client[];
  depotComptes: ClientDepotComptes[];
  onReload: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  excludedClientIds?: Set<string>;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSortChange: (field: string) => void;
  innerSortField: string;
  innerSortDir: 'asc' | 'desc';
  onInnerSortChange: (field: string) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

interface ClientGroup {
  client: Client;
  depots: ClientDepotComptes[];
}

export function DepotComptesTab({ clients, depotComptes, onReload, showToast, excludedClientIds = new Set(), sortField, sortDir, onSortChange, innerSortField, innerSortDir, onInnerSortChange }: DepotComptesTabProps) {
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingClientId, setSyncingClientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const clientsWithSiren = clients.filter((c) => c.siren);
  const clientsWithoutSiren = clients.filter((c) => !c.siren);

  const grouped: ClientGroup[] = clientsWithSiren.map((client) => ({
    client,
    depots: depotComptes.filter((d) => d.client_id === client.id),
  }));

  const searched = searchQuery.trim()
    ? grouped.filter(
        (g) =>
          g.client.nom_entreprise.toLowerCase().includes(searchQuery.toLowerCase()) ||
          g.client.siren?.includes(searchQuery)
      )
    : grouped;

  const filtered = useMemo(() => {
    return [...searched].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'nom_entreprise':
          cmp = a.client.nom_entreprise.localeCompare(b.client.nom_entreprise);
          break;
        case 'nombre_depots':
          cmp = a.depots.length - b.depots.length;
          break;
        case 'date_cloture': {
          const aLatest = a.depots[0]?.date_cloture || '';
          const bLatest = b.depots[0]?.date_cloture || '';
          cmp = aLatest.localeCompare(bLatest);
          break;
        }
        default: {
          const aL = a.depots[0]?.date_cloture || '';
          const bL = b.depots[0]?.date_cloture || '';
          cmp = aL.localeCompare(bL);
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [searched, sortField, sortDir]);

  const {
    sortedItems: dndFiltered,
    orderedIds: dndFilteredIds,
    handleDragEnd,
    isCustomOrder,
    resetOrder,
  } = useSortableTable({
    context: 'depot_comptes',
    items: filtered,
    getId: (g) => g.client.id,
  });

  function sortDepots(depots: ClientDepotComptes[]) {
    return [...depots].sort((a, b) => {
      let cmp = 0;
      switch (innerSortField) {
        case 'date_cloture':
          cmp = (a.date_cloture || '').localeCompare(b.date_cloture || '');
          break;
        case 'date_parution':
          cmp = (a.date_parution || '').localeCompare(b.date_parution || '');
          break;
        case 'type_depot':
          cmp = (a.type_depot || '').localeCompare(b.type_depot || '');
          break;
        case 'tribunal':
          cmp = (a.tribunal || '').localeCompare(b.tribunal || '');
          break;
        default:
          cmp = (a.date_cloture || '').localeCompare(b.date_cloture || '');
      }
      return innerSortDir === 'asc' ? cmp : -cmp;
    });
  }

  function toggleClient(clientId: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  async function handleSyncClient(client: Client) {
    if (!client.siren) return;
    setSyncingClientId(client.id);
    try {
      const result = await syncBodaccForClient(client.id, client.siren);
      showToast(
        `${client.nom_entreprise}: ${result.total} depot(s) trouve(s)`,
        'success'
      );
      await onReload();
    } catch (err: any) {
      showToast(
        `Erreur pour ${client.nom_entreprise}: ${err?.message || 'Erreur inconnue'}`,
        'error'
      );
    } finally {
      setSyncingClientId(null);
    }
  }

  async function handleSyncAll() {
    if (clientsWithSiren.length === 0) {
      showToast('Aucun client avec SIREN', 'error');
      return;
    }
    setSyncingAll(true);
    let ok = 0;
    let fail = 0;
    for (const client of clientsWithSiren) {
      try {
        await syncBodaccForClient(client.id, client.siren!);
        ok++;
      } catch {
        fail++;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    setSyncingAll(false);
    showToast(
      `${ok} client(s) synchronise(s)${fail > 0 ? `, ${fail} erreur(s)` : ''}`,
      fail > 0 ? 'error' : 'success'
    );
    await onReload();
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un client ou SIREN..."
            className="pl-9"
          />
        </div>
        <Button
          onClick={handleSyncAll}
          disabled={syncingAll || clientsWithSiren.length === 0}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncingAll ? 'animate-spin' : ''}`} />
          {syncingAll ? 'Synchronisation...' : 'Synchroniser BODACC'}
        </Button>
      </div>

      <div className="flex items-center gap-1 flex-wrap mb-4">
        {isCustomOrder && (
          <button
            onClick={resetOrder}
            className="inline-flex items-center gap-1 mr-2 text-xs text-teal-600 hover:text-teal-800 transition-colors font-medium"
          >
            <RotateCcw className="w-3 h-3" />
            Reset ordre
          </button>
        )}
        <span className="text-xs text-gray-400 mr-1">Trier :</span>
        <SortButton label="Nom" field="nom_entreprise" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="Nb depots" field="nombre_depots" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="Derniere cloture" field="date_cloture" activeField={sortField} direction={sortDir} onSort={onSortChange} />
      </div>

      {clientsWithoutSiren.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {clientsWithoutSiren.length} client(s) sans SIREN ne peuvent pas etre interroges sur BODACC.
          </p>
        </div>
      )}

      {dndFiltered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-16 text-center">
          <FileCheck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          {clientsWithSiren.length === 0 ? (
            <>
              <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">Aucun client avec SIREN</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ajoutez un SIREN a vos clients pour consulter les depots des comptes BODACC.
              </p>
            </>
          ) : searchQuery ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucun resultat pour "{searchQuery}"</p>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Aucun depot des comptes. Lancez une synchronisation BODACC.
              </p>
              <Button onClick={handleSyncAll} variant="secondary" disabled={syncingAll}>
                <RefreshCw className={`w-4 h-4 mr-2 ${syncingAll ? 'animate-spin' : ''}`} />
                Synchroniser
              </Button>
            </>
          )}
        </div>
      ) : (
        <SortableTableWrapper ids={dndFilteredIds} onDragEnd={handleDragEnd}>
        <div className="space-y-2">
          {dndFiltered.map(({ client, depots }) => {
            const isExpanded = expandedClients.has(client.id);
            const isSyncing = syncingClientId === client.id;
            const latestDepot = depots[0];
            const isExcluded = excludedClientIds.has(client.id);

            return (
              <SortableCardRow key={client.id} id={client.id}>
              <Card className={`overflow-hidden pl-8 ${isExcluded ? '!bg-red-50 dark:!bg-red-900/20 !border-red-300 dark:!border-red-800' : ''}`}>
                <button
                  onClick={() => toggleClient(client.id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className={`font-semibold truncate ${isExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {client.nom_entreprise}
                      </h3>
                      <Badge variant="default">{depots.length} depot(s)</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-mono">{client.siren}</span>
                      {latestDepot?.date_cloture && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Derniere cloture: {formatShortDate(latestDepot.date_cloture)}
                        </span>
                      )}
                      {client.last_bodacc_sync && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Sync: {formatShortDate(client.last_bodacc_sync)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSyncClient(client)}
                      disabled={isSyncing || syncingAll}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 px-5">
                    {depots.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 py-3 text-center">
                        Aucun depot des comptes trouve. Lancez une synchronisation.
                      </p>
                    ) : (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                              <SortableTh label="Date de cloture" field="date_cloture" activeField={innerSortField} direction={innerSortDir} onSort={onInnerSortChange} />
                              <SortableTh label="Date de parution" field="date_parution" activeField={innerSortField} direction={innerSortDir} onSort={onInnerSortChange} />
                              <SortableTh label="Type de depot" field="type_depot" activeField={innerSortField} direction={innerSortDir} onSort={onInnerSortChange} className="hidden md:table-cell" />
                              <SortableTh label="Tribunal" field="tribunal" activeField={innerSortField} direction={innerSortDir} onSort={onInnerSortChange} className="hidden lg:table-cell" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {sortDepots(depots).map((depot) => (
                              <tr key={depot.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                      {formatDate(depot.date_cloture)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                                  {formatDate(depot.date_parution)}
                                </td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hidden md:table-cell">
                                  <span className="truncate block max-w-[200px]">
                                    {depot.type_depot || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hidden lg:table-cell">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                    <span className="truncate max-w-[180px]">
                                      {depot.tribunal || '-'}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
              </SortableCardRow>
            );
          })}
        </div>
        </SortableTableWrapper>
      )}
    </div>
  );
}
