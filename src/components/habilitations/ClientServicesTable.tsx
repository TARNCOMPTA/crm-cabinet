import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Building, ChevronRight, ExternalLink, Ban, ChevronDown, UserX, ShieldOff, UserPlus, MessageSquare, CheckCircle2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { CopyButton } from '../ui/CopyButton';
import { SortableTh } from '../ui/SortButton';
import { resolveCompanyNames } from '../../lib/inpiService';
import { loadSirenDenominations, saveSirenDenominations } from '../../lib/habilitationsService';
import { getServiceColor, AVANCEMENT_STYLES, TABLE_ROW_HEIGHT } from '../../lib/habilitationsConstants';
import { HabilitationsToolbar } from './HabilitationsToolbar';
import { HabilitationsProgressCell } from './HabilitationsProgressCell';
import { HabilitationsExpandedRow } from './HabilitationsExpandedRow';
import { HabilitationsBulkBar } from './HabilitationsBulkBar';
import { useSortableTable } from '../../hooks/useSortableTable';
import { SortableTableWrapper } from '../ui/SortableTableWrapper';
import { SortableRow } from '../ui/SortableRow';
import type { EnrichedClient, CompletenessFilter } from '../../types/habilitations';

interface ClientServicesTableProps {
  data: EnrichedClient[];
  hasImportData: boolean;
  onToggleNonConcerne: (clientId: string, value: boolean) => void;
  onUpdateAvancement: (clientId: string, value: string) => void;
  onUpdateCommentaire: (clientId: string, value: string) => void;
  onCreateClient?: (siren: string, companyName?: string) => void;
  onBulkAvancement: (clientIds: string[], value: string) => void;
  onBulkNonConcerne: (clientIds: string[], value: boolean) => void;
}

type SortField = 'entreprise' | 'siren' | 'completude' | 'avancement';

export function ClientServicesTable({
  data,
  hasImportData,
  onToggleNonConcerne,
  onUpdateAvancement,
  onUpdateCommentaire,
  onCreateClient,
  onBulkAvancement,
  onBulkNonConcerne,
}: ClientServicesTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [completenessFilter, setCompletenessFilter] = useState<CompletenessFilter>('all');
  const [avancementFilter, setAvancementFilter] = useState<string>('all');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | ''>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(new Map());
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupProgress, setLookupProgress] = useState({ current: 0, total: 0 });
  const [lookupDone, setLookupDone] = useState(false);
  const [, setCacheLoaded] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const nonClientSirens = useMemo(() => data.filter((c) => c.isNonClient).map((c) => c.siren), [data]);

  useEffect(() => {
    if (nonClientSirens.length === 0) {
      setCacheLoaded(true);
      return;
    }
    (async () => {
      try {
        const map = await loadSirenDenominations(nonClientSirens);
        if (map.size > 0) {
          setResolvedNames(map);
          if (map.size >= nonClientSirens.length) setLookupDone(true);
        }
      } catch {
        // Les denominations viennent d'un cache d'appoint : leur absence laisse
        // le SIREN affiche tel quel, ce qui reste exploitable.
      } finally {
        setCacheLoaded(true);
      }
    })();
  }, [nonClientSirens]);

  const handleLookupNames = useCallback(async () => {
    if (nonClientSirens.length === 0) return;
    const uncached = nonClientSirens.filter((s) => !resolvedNames.has(s));
    if (uncached.length === 0) { setLookupDone(true); return; }
    setIsLookingUp(true);
    setLookupProgress({ current: 0, total: uncached.length });
    try {
      const identifiers = uncached.map((siren) => ({ siret: null, siren }));
      const results = await resolveCompanyNames(identifiers, (current, total) => {
        setLookupProgress({ current, total });
      });
      setResolvedNames((prev) => {
        const merged = new Map(prev);
        for (const [key, val] of results) merged.set(key, val);
        return merged;
      });
      setLookupDone(true);
      saveSirenDenominations(results);
    } catch {
      // Meme parti pris que ci-dessus : une recherche de denomination ratee ne
      // doit pas interrompre l'affichage du tableau.
    } finally {
      setIsLookingUp(false);
    }
  }, [nonClientSirens, resolvedNames]);

  const handleSort = useCallback((field: string) => {
    const f = field as SortField;
    if (sortField === f) setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(f); setSortDirection('asc'); }
  }, [sortField]);

  const pillCounts = useMemo(() => {
    const counts: Record<CompletenessFilter, number> = { all: data.length, complete: 0, incomplete: 0, none: 0, non_concerne: 0, non_client: 0 };
    for (const c of data) {
      if (c.isNonClient) { counts.non_client++; continue; }
      if (c.nonConcerne) { counts.non_concerne++; continue; }
      if (!c.hasHabilitations) { counts.none++; continue; }
      if (c.completeness.percentage > 92) counts.complete++;
      else counts.incomplete++;
    }
    return counts;
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((client) => {
      const resolvedName = client.isNonClient ? resolvedNames.get(client.siren) : null;
      const displayName = resolvedName || client.clientName;
      const matchesSearch =
        displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.siren.includes(searchTerm);

      let matchesFilter = true;
      if (completenessFilter === 'non_client') matchesFilter = client.isNonClient;
      else if (completenessFilter === 'non_concerne') matchesFilter = client.nonConcerne;
      else if (completenessFilter === 'none') matchesFilter = !client.nonConcerne && !client.isNonClient && !client.hasHabilitations;
      else if (completenessFilter === 'complete') matchesFilter = !client.nonConcerne && !client.isNonClient && client.hasHabilitations && client.completeness.percentage > 92;
      else if (completenessFilter === 'incomplete') matchesFilter = !client.nonConcerne && !client.isNonClient && client.hasHabilitations && client.completeness.percentage <= 92;

      const matchesAvancement = avancementFilter === 'all' || client.avancement === avancementFilter;

      return matchesSearch && matchesFilter && matchesAvancement;
    });
  }, [data, searchTerm, completenessFilter, avancementFilter, resolvedNames]);

  const columnSortedData = useMemo(() => {
    if (!sortField) return filteredData;
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'entreprise') {
        const aName = (a.isNonClient && resolvedNames.get(a.siren)) || a.clientName;
        const bName = (b.isNonClient && resolvedNames.get(b.siren)) || b.clientName;
        cmp = aName.localeCompare(bName, 'fr', { sensitivity: 'base' });
      } else if (sortField === 'siren') {
        cmp = (a.siren || '').localeCompare(b.siren || '');
      } else if (sortField === 'completude') {
        cmp = a.completeness.percentage - b.completeness.percentage;
      } else if (sortField === 'avancement') {
        const order: Record<string, number> = { a_faire: 0, demande: 1, complet: 2 };
        cmp = (order[a.avancement] ?? 0) - (order[b.avancement] ?? 0);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredData, sortField, sortDirection, resolvedNames]);

  const isColumnSorted = sortField !== '';

  const {
    sortedItems: dndFilteredData,
    handleDragEnd,
    isCustomOrder,
    resetOrder,
  } = useSortableTable({
    context: 'habilitations',
    items: isColumnSorted ? columnSortedData : filteredData,
    getId: (c) => c.clientId,
    enabled: !isColumnSorted,
  });

  const displayData = isColumnSorted ? columnSortedData : dndFilteredData;
  const displayIds = displayData.map((c) => c.clientId);

  const toggleExpand = (clientId: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleSelect = (clientId: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedClients.size === displayData.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(displayData.map((c) => c.clientId)));
    }
  };

  const rowVirtualizer = useVirtualizer({
    count: displayData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => {
      const client = displayData[index];
      if (!client) return TABLE_ROW_HEIGHT;
      const isExpanded = expandedClients.has(client.clientId);
      return isExpanded ? TABLE_ROW_HEIGHT + 120 : TABLE_ROW_HEIGHT;
    },
    overscan: 10,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [expandedClients, rowVirtualizer]);

  const handleBulkAvancement = (value: string) => {
    onBulkAvancement(Array.from(selectedClients), value);
    setSelectedClients(new Set());
  };

  const handleBulkNonConcerne = (value: boolean) => {
    onBulkNonConcerne(Array.from(selectedClients), value);
    setSelectedClients(new Set());
  };

  if (data.length === 0) return null;

  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Couverture des services</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {data.length} client{data.length > 1 ? 's' : ''} du cabinet
            {hasImportData && ` dont ${data.filter((c) => c.hasHabilitations).length} avec des services ouverts`}
          </p>
        </div>
      </div>

      <Card className="dark:bg-gray-900 dark:border-gray-700">
        <HabilitationsToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          filter={completenessFilter}
          onFilterChange={setCompletenessFilter}
          pillCounts={pillCounts}
          showSyncButton={completenessFilter === 'non_client' && nonClientSirens.length > 0}
          isLookingUp={isLookingUp}
          lookupDone={lookupDone}
          lookupProgress={lookupProgress}
          onLookupNames={handleLookupNames}
          isCustomOrder={isCustomOrder}
          isColumnSorted={isColumnSorted}
          onResetOrder={() => { if (isColumnSorted) setSortField(''); else resetOrder(); }}
          displayCount={displayData.length}
          totalCount={data.length}
          avancementFilter={avancementFilter}
          onAvancementFilterChange={setAvancementFilter}
        />

        <div ref={tableContainerRef} className="overflow-auto max-h-[70vh]">
          <SortableTableWrapper ids={displayIds} onDragEnd={isColumnSorted ? () => {} : handleDragEnd}>
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                <tr>
                  <th className="w-10 py-3 px-3">
                    <input
                      type="checkbox"
                      checked={selectedClients.size > 0 && selectedClients.size === displayData.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </th>
                  {!isColumnSorted && <th className="w-8 py-3 px-1" />}
                  <th className="w-8 py-3 px-3" />
                  <SortableTh label="Entreprise" field="entreprise" activeField={sortField} direction={sortDirection} onSort={handleSort} className="text-xs uppercase tracking-wider py-3" />
                  <SortableTh label="SIREN" field="siren" activeField={sortField} direction={sortDirection} onSort={handleSort} className="text-xs uppercase tracking-wider py-3" />
                  <SortableTh label="Completude" field="completude" activeField={sortField} direction={sortDirection} onSort={handleSort} className="text-xs uppercase tracking-wider py-3" />
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Services</th>
                  <SortableTh label="Avancement" field="avancement" activeField={sortField} direction={sortDirection} onSort={handleSort} className="text-xs uppercase tracking-wider py-3" />
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Commentaire</th>
                  <th className="text-right py-3 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {displayData.map((client) => {
                  const isExpanded = expandedClients.has(client.clientId);
                  const isSelected = selectedClients.has(client.clientId);
                  const { percentage } = client.completeness;
                  const isWithout = !client.hasHabilitations && !client.nonConcerne && !client.isNonClient;
                  const isNC = client.nonConcerne;
                  const isNonClient = client.isNonClient;

                  return (
                    <Fragment key={client.clientId}>
                      <SortableRow id={client.clientId} disabled={isColumnSorted} className={`group hover:bg-gray-50/50 dark:hover:bg-gray-800/50 ${isSelected ? 'bg-teal-50/50 dark:bg-teal-900/20' : ''} ${isNC ? 'bg-slate-50/40 opacity-60 dark:bg-slate-900/20' : isNonClient ? 'bg-orange-50/30 dark:bg-orange-900/10' : isWithout ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(client.clientId)}
                            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700"
                          />
                        </td>
                        <td className="py-3 px-1">
                          {!isNC && (
                            <button
                              onClick={() => toggleExpand(client.clientId)}
                              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isNC ? 'bg-slate-100 dark:bg-slate-800' : isNonClient ? 'bg-orange-100 dark:bg-orange-900/40' : isWithout ? 'bg-red-100 dark:bg-red-900/40' : 'bg-teal-100 dark:bg-teal-900/40'
                            }`}>
                              {isNC ? <Ban className="w-4 h-4 text-slate-400" /> : isNonClient ? <UserX className="w-4 h-4 text-orange-500" /> : isWithout ? <ShieldOff className="w-4 h-4 text-red-500" /> : <Building className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                            </div>
                            <div>
                              {isNonClient ? (
                                <>
                                  <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
                                    {resolvedNames.get(client.siren) || client.clientName}
                                  </span>
                                  {resolvedNames.has(client.siren) && (
                                    <p className="text-[10px] font-mono text-gray-400 mt-0.5">SIREN {client.siren}</p>
                                  )}
                                </>
                              ) : (
                                <Link
                                  to={`/clients/${client.clientId}`}
                                  className={`text-sm font-medium transition-colors ${isNC ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400'}`}
                                >
                                  {client.clientName}
                                </Link>
                              )}
                              {isNonClient && <p className="text-[10px] font-medium text-orange-500 mt-0.5">Non client</p>}
                              {isNC && <p className="text-[10px] font-medium text-slate-400 mt-0.5">Non concerne</p>}
                              {isWithout && <p className="text-[10px] font-medium text-red-500 mt-0.5">Aucune habilitation</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {client.siren ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm font-mono ${isNC ? 'text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{client.siren}</span>
                              <CopyButton value={client.siren} label="SIREN" />
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Non renseigne</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <HabilitationsProgressCell
                            isNonConcerne={isNC}
                            isWithout={isWithout}
                            completeness={client.completeness}
                          />
                        </td>
                        <td className="py-3 px-4">
                          {isNC ? (
                            <span className="text-xs text-slate-400 italic">--</span>
                          ) : isWithout ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                              Aucun service ouvert
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {(isExpanded ? client.services : client.services.slice(0, 3)).map((s) => (
                                <span key={s.service} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getServiceColor(s.service)}`}>
                                  {s.service}
                                </span>
                              ))}
                              {!isExpanded && client.services.length > 3 && (
                                <button
                                  onClick={() => toggleExpand(client.clientId)}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
                                >
                                  +{client.services.length - 3}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isNC ? (
                            <span className="text-xs text-slate-400 italic">--</span>
                          ) : percentage >= 90 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">
                              <CheckCircle2 className="w-3 h-3" />
                              Complet
                            </span>
                          ) : (
                            <select
                              value={client.avancement || 'a_faire'}
                              onChange={(e) => onUpdateAvancement(client.clientId, e.target.value)}
                              className={`text-xs font-medium rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 ${
                                AVANCEMENT_STYLES[client.avancement || 'a_faire'] || AVANCEMENT_STYLES.a_faire
                              }`}
                            >
                              <option value="a_faire">A faire</option>
                              <option value="demande">Demande</option>
                              <option value="complet">Complet</option>
                            </select>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isNC ? (
                            <span className="text-xs text-slate-400 italic">--</span>
                          ) : isNonClient ? null : (
                            <div className="relative group/comment">
                              <input
                                type="text"
                                defaultValue={client.commentaire || ''}
                                placeholder="Ajouter..."
                                onBlur={(e) => {
                                  const val = e.target.value.trim();
                                  if (val !== (client.commentaire || '')) onUpdateCommentaire(client.clientId, val);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                  if (e.key === 'Escape') {
                                    (e.target as HTMLInputElement).value = client.commentaire || '';
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                className="w-full min-w-[120px] max-w-[180px] text-xs px-2.5 py-1.5 border border-transparent rounded-lg bg-transparent hover:border-gray-200 hover:bg-white focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all placeholder:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:focus:border-teal-600 dark:focus:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-600"
                              />
                              {!client.commentaire && (
                                <MessageSquare className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300 dark:text-gray-600 pointer-events-none group-hover/comment:hidden" />
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isNonClient && onCreateClient && (
                              <button
                                onClick={() => onCreateClient(client.siren, resolvedNames.get(client.siren) || undefined)}
                                title="Creer la fiche client"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 rounded-lg transition-colors"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                Creer
                              </button>
                            )}
                            {!isNonClient && (
                              <button
                                onClick={() => onToggleNonConcerne(client.clientId, !client.nonConcerne)}
                                title={isNC ? 'Marquer comme concerne' : 'Marquer comme non concerne'}
                                className={`p-1.5 rounded-lg transition-colors inline-flex ${
                                  isNC
                                    ? 'text-slate-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30'
                                    : 'text-gray-300 hover:text-slate-500 hover:bg-slate-50 dark:text-gray-600 dark:hover:text-slate-400 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100'
                                }`}
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                            {!isNonClient && (
                              <Link
                                to={`/clients/${client.clientId}`}
                                className="p-1.5 text-gray-400 hover:text-teal-600 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors inline-flex"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Link>
                            )}
                          </div>
                        </td>
                      </SortableRow>

                      {isExpanded && !isNC && (
                        <tr>
                          <td colSpan={isColumnSorted ? 9 : 10} className="px-4 pb-4 pt-1">
                            <HabilitationsExpandedRow
                              isWithout={isWithout}
                              completeness={client.completeness}
                              services={client.services}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </SortableTableWrapper>

          {displayData.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Aucun client trouve</p>
            </div>
          )}
        </div>
      </Card>

      <HabilitationsBulkBar
        selectedCount={selectedClients.size}
        onClearSelection={() => setSelectedClients(new Set())}
        onBulkAvancement={handleBulkAvancement}
        onBulkNonConcerne={handleBulkNonConcerne}
      />
    </div>
  );
}
