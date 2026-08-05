import { useState, useMemo } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { SortButton } from '../ui/SortButton';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { LegalFormDisplay } from '../clients/LegalFormDisplay';
import {
  syncLegalActsToDatabase,
  downloadActDocument,
  listLegalDocuments,
  INPIDocument,
} from '../../lib/inpiService';
import { Database } from '../../types/database';

type LegalAct = Database['public']['Tables']['legal_acts']['Row'];
type Client = Database['public']['Tables']['clients']['Row'];

interface ActsTabProps {
  clients: Client[];
  clientActsMap: Map<string, LegalAct[]>;
  onReloadActs: (clients: Client[]) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  excludedClientIds?: Set<string>;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSortChange: (field: string) => void;
}

const ACT_CATEGORY_BADGES: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  creation: 'success',
  modification_statuts: 'info',
  nomination: 'default',
  demission: 'warning',
  transfert_siege: 'info',
  dissolution: 'danger',
  capital: 'info',
  fusion: 'warning',
  autre: 'default',
};

const ACT_CATEGORY_LABELS: Record<string, string> = {
  creation: 'Creation',
  modification_statuts: 'Modification',
  nomination: 'Nomination',
  demission: 'Cessation',
  transfert_siege: 'Transfert siege',
  dissolution: 'Dissolution',
  capital: 'Capital',
  fusion: 'Restructuration',
  autre: 'Autre',
};

export function ActsTab({ clients, clientActsMap, onReloadActs, showToast, excludedClientIds = new Set(), sortField, sortDir, onSortChange }: ActsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState<string | null>(null);
  const [downloadingAct, setDownloadingAct] = useState<string | null>(null);
  const [availableDocuments, setAvailableDocuments] = useState<Map<string, INPIDocument[]>>(new Map());
  const [loadingDocuments, setLoadingDocuments] = useState<string | null>(null);

  const clientsWithSiren = clients.filter(c => c.siren || c.siret);
  const searched = clientsWithSiren.filter(c =>
    c.nom_entreprise.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.siren || c.siret?.substring(0, 9) || '').includes(searchQuery)
  );

  const filtered = useMemo(() => {
    return [...searched].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'nom_entreprise':
          cmp = a.nom_entreprise.localeCompare(b.nom_entreprise);
          break;
        case 'siren': {
          const sa = a.siren || a.siret?.substring(0, 9) || '';
          const sb = b.siren || b.siret?.substring(0, 9) || '';
          cmp = sa.localeCompare(sb);
          break;
        }
        case 'nombre_actes': {
          const ca = (clientActsMap.get(a.id) || []).length;
          const cb = (clientActsMap.get(b.id) || []).length;
          cmp = ca - cb;
          break;
        }
        case 'derniere_sync': {
          const da = a.last_legal_sync || '';
          const db = b.last_legal_sync || '';
          cmp = da.localeCompare(db);
          break;
        }
        default:
          cmp = a.nom_entreprise.localeCompare(b.nom_entreprise);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [searched, sortField, sortDir, clientActsMap]);

  function toggleRow(id: string) {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  }

  async function handleSyncActs(clientId: string) {
    setSyncing(clientId);
    try {
      const result = await syncLegalActsToDatabase(clientId);
      if (result.success) {
        showToast(result.message, 'success');
        await onReloadActs(clients);
      } else {
        showToast(result.message, 'error');
      }
    } catch {
      showToast('Erreur lors de la synchronisation', 'error');
    } finally {
      setSyncing(null);
    }
  }

  async function handleSyncAll() {
    for (const client of clientsWithSiren) {
      await handleSyncActs(client.id);
    }
  }

  async function handleDownloadAct(client: Client, act: LegalAct) {
    setDownloadingAct(act.id);
    try {
      const result = await downloadActDocument(client.id, client.nom_entreprise, act.act_type, act.inpi_reference);
      showToast(result.message, result.success ? 'success' : 'error');
    } catch {
      showToast('Erreur lors du telechargement', 'error');
    } finally {
      setDownloadingAct(null);
    }
  }

  async function handleLoadDocuments(clientId: string) {
    setLoadingDocuments(clientId);
    try {
      const result = await listLegalDocuments(clientId);
      if (result.success && result.documents) {
        const newMap = new Map(availableDocuments);
        newMap.set(clientId, result.documents);
        setAvailableDocuments(newMap);
        showToast(`${result.documents.length} document(s) disponible(s)`, 'success');
      } else {
        showToast(result.message, 'error');
      }
    } catch {
      showToast('Erreur lors du chargement des documents', 'error');
    } finally {
      setLoadingDocuments(null);
    }
  }

  async function handleDownloadDocument(client: Client, doc: INPIDocument) {
    setDownloadingAct(doc.id);
    try {
      const result = await downloadActDocument(client.id, client.nom_entreprise, doc.type, doc.id);
      showToast(result.message, result.success ? 'success' : 'error');
    } catch {
      showToast('Erreur lors du telechargement', 'error');
    } finally {
      setDownloadingAct(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSyncAll}
          disabled={syncing !== null}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Tout synchroniser
        </Button>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Trier :</span>
        <SortButton label="Nom" field="nom_entreprise" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="SIREN" field="siren" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="Nb actes" field="nombre_actes" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="Derniere sync" field="derniere_sync" activeField={sortField} direction={sortDir} onSort={onSortChange} />
      </div>

      {clientsWithSiren.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-16 text-center">
          <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">Aucun client avec SIREN</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Ajoutez un SIREN ou SIRET a vos fiches clients pour synchroniser leurs actes juridiques.
          </p>
        </div>
      )}

      {clientsWithSiren.length > 0 && filtered.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-16 text-center">
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-900 dark:text-gray-100 font-medium">Aucun resultat</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((client) => {
          const acts = clientActsMap.get(client.id) || [];
          const siren = client.siren || client.siret?.substring(0, 9) || '';
          const isExpanded = expandedRows.has(client.id);
          const isExcluded = excludedClientIds.has(client.id);
          const recentActs = acts.filter(a => {
            // `created_at` porte un DEFAULT now() sans NOT NULL : nullable au type.
            if (!a.created_at) return false;
            const d = new Date(a.created_at);
            return (Date.now() - d.getTime()) < 7 * 86400000;
          });

          return (
            <div
              key={client.id}
              className={`rounded-xl overflow-hidden transition-shadow hover:shadow-md border ${
                isExcluded
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800'
                  : recentActs.length > 0
                  ? 'bg-green-50/40 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              <div
                className="flex items-center gap-4 px-4 py-3.5 cursor-pointer select-none"
                onClick={() => toggleRow(client.id)}
              >
                <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                  {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isExcluded && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    <span className={`text-sm font-semibold truncate ${isExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {client.nom_entreprise}
                    </span>
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{siren}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <LegalFormDisplay value={client.forme_juridique} className={`text-xs ${isExcluded ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`} />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={acts.length > 0 ? 'info' : 'default'}>
                    {acts.length} acte{acts.length !== 1 ? 's' : ''}
                  </Badge>
                  {client.last_legal_sync && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                      {new Date(client.last_legal_sync).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="p-1.5 rounded-md text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-40"
                    onClick={() => handleSyncActs(client.id)}
                    disabled={syncing === client.id}
                    title="Synchroniser"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing === client.id ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 px-4 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actes synchronises
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadDocuments(client.id)}
                      disabled={loadingDocuments === client.id}
                      className="text-xs"
                    >
                      {loadingDocuments === client.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Documents INPI
                    </Button>
                  </div>

                  {acts.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Aucun acte synchronise</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSyncActs(client.id)}
                        disabled={syncing === client.id}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${syncing === client.id ? 'animate-spin' : ''}`} />
                        Synchroniser
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {acts.map((act) => (
                        <div
                          key={act.id}
                          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug" title={act.act_type}>
                                {act.act_type}
                              </p>
                              {act.metadata && typeof act.metadata === 'object' && (act.metadata as any).description && (act.metadata as any).description !== act.act_type && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                                  {(act.metadata as any).description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(act.act_date).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  })}
                                </span>
                                {act.deposit_date && (
                                  <span className="text-xs text-gray-400 dark:text-gray-500">
                                    Depot: {new Date(act.deposit_date).toLocaleDateString('fr-FR')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                              <Badge variant={ACT_CATEGORY_BADGES[act.act_category || 'autre'] || 'default'}>
                                {ACT_CATEGORY_LABELS[act.act_category || 'autre'] || act.act_category}
                              </Badge>
                              <Badge
                                variant={
                                  act.download_status === 'completed' ? 'success'
                                    : act.download_status === 'error' ? 'danger'
                                    : 'default'
                                }
                              >
                                {act.download_status === 'completed' ? 'Telecharge'
                                  : act.download_status === 'error' ? 'Erreur'
                                  : 'En attente'}
                              </Badge>
                              <button
                                className="p-1.5 rounded-md text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-40"
                                onClick={() => handleDownloadAct(client, act)}
                                disabled={downloadingAct === act.id}
                                title="Telecharger"
                              >
                                {downloadingAct === act.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {availableDocuments.has(client.id) && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Documents disponibles sur l'INPI
                      </h4>
                      <div className="space-y-2">
                        {availableDocuments.get(client.id)?.map((doc) => (
                          <div
                            key={doc.id}
                            className="bg-teal-50/60 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800 p-3 hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {doc.description || doc.type}
                                </p>
                                {doc.description && doc.description !== doc.type && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{doc.type}</p>
                                )}
                                <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">
                                  {doc.date ? new Date(doc.date).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  }) : 'Date inconnue'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge variant="info">INPI</Badge>
                                <button
                                  className="p-1.5 rounded-md text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-40"
                                  onClick={() => handleDownloadDocument(client, doc)}
                                  disabled={downloadingAct === doc.id}
                                  title="Telecharger depuis l'INPI"
                                >
                                  {downloadingAct === doc.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Download className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
