import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, LayoutGrid, Table as TableIcon, FileSpreadsheet, FolderOpen, Users, X, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { RevenueDeclarationsTable } from '../components/revenueDeclarations/RevenueDeclarationsTable';
import { RevenueDeclarationsKanban } from '../components/revenueDeclarations/RevenueDeclarationsKanban';
import { RevenueDeclarationModal } from '../components/revenueDeclarations/RevenueDeclarationModal';
import { useToast } from '../contexts/ToastContext';
import {
  listDeclarations,
  listAttachmentsCounts,
  listCabinetUsers,
  bulkAssignCollaborators,
  bulkUpdateZone,
  getDeadlinesMap,
  STATUS_LABELS,
  STATUS_ORDER,
  ZONE_LABELS,
  type RevenueDeclaration,
  type RevenueDeclarationStatus,
  type RevenueDeclarationZone,
  type CabinetUserOption,
} from '../lib/revenueDeclarationService';

type ViewMode = 'table' | 'kanban';
const VIEW_STORAGE_KEY = 'revenue_declarations_view';
const MY_DECL_STORAGE_KEY = 'revenue_declarations_my_dossiers';

export function RevenueDeclarations() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const currentYear = new Date().getFullYear();
  const defaultAnnee = currentYear - 1;

  const [view, setView] = useState<ViewMode>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(VIEW_STORAGE_KEY) : null;
    return stored === 'kanban' ? 'kanban' : 'table';
  });

  const [declarations, setDeclarations] = useState<RevenueDeclaration[]>([]);
  const [attachmentsCounts, setAttachmentsCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [anneeFilter, setAnneeFilter] = useState<number | 'all'>(defaultAnnee);
  const [statutFilter, setStatutFilter] = useState<RevenueDeclarationStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RevenueDeclaration | null>(null);
  const [zoneFilter, setZoneFilter] = useState<RevenueDeclarationZone | 'all'>('all');
  const [deadlinesMap, setDeadlinesMap] = useState<Record<string, string>>({});

  const [showMyDossiers, setShowMyDossiers] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(MY_DECL_STORAGE_KEY) === 'true';
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cabinetUsers, setCabinetUsers] = useState<CabinetUserOption[]>([]);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignUserIds, setBulkAssignUserIds] = useState<string[]>([]);
  const [bulkAssignMode, setBulkAssignMode] = useState<'add' | 'replace'>('add');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [showBulkZone, setShowBulkZone] = useState(false);
  const [bulkZoneValue, setBulkZoneValue] = useState<RevenueDeclarationZone | ''>('');
  const [bulkZoneUpdating, setBulkZoneUpdating] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    }
  }, [view]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(MY_DECL_STORAGE_KEY, showMyDossiers ? 'true' : 'false');
    }
  }, [showMyDossiers]);

  const loadData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listDeclarations();
      setDeclarations(rows);
      if (rows.length > 0) {
        try {
          const counts = await listAttachmentsCounts(rows.map((r) => r.id));
          setAttachmentsCounts(counts);
        } catch {
          setAttachmentsCounts({});
        }
      } else {
        setAttachmentsCounts({});
      }
    } catch {
      setDeclarations([]);
      setAttachmentsCounts({});
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (profile) {
      listCabinetUsers().then(setCabinetUsers).catch(() => setCabinetUsers([]));
    }
  }, [profile]);

  useEffect(() => {
    const yearToLoad = anneeFilter === 'all' ? defaultAnnee : anneeFilter;
    getDeadlinesMap(yearToLoad).then(setDeadlinesMap).catch(() => setDeadlinesMap({}));
  }, [anneeFilter, defaultAnnee]);

  const availableYears = useMemo(() => {
    const set = new Set<number>(declarations.map((d) => d.annee));
    set.add(defaultAnnee);
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [declarations, defaultAnnee, currentYear]);

  const filtered = useMemo(() => {
    return declarations.filter((d) => {
      if (anneeFilter !== 'all' && d.annee !== anneeFilter) return false;
      if (statutFilter !== 'all' && d.statut !== statutFilter) return false;
      if (zoneFilter !== 'all' && d.zone !== zoneFilter) return false;
      if (showMyDossiers && user) {
        const isAssigned = (d.collaborators || []).some((c) => c.user_id === user.id);
        if (!isAssigned) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !d.person_name.toLowerCase().includes(q) &&
          !(d.clients?.nom_entreprise ?? '').toLowerCase().includes(q) &&
          !(d.clients?.numero_dossier ?? '').toLowerCase().includes(q) &&
          !d.commentaire.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [declarations, anneeFilter, statutFilter, zoneFilter, search, showMyDossiers, user]);

  function openCreate() {
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(d: RevenueDeclaration) {
    setEditing(d);
    setShowModal(true);
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((d) => d.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkAssign() {
    if (bulkAssignUserIds.length === 0) {
      showToast('Selectionnez au moins un collaborateur', 'error');
      return;
    }
    setBulkAssigning(true);
    try {
      await bulkAssignCollaborators(Array.from(selectedIds), bulkAssignUserIds, bulkAssignMode);
      showToast(`${selectedIds.size} declaration(s) mise(s) a jour`, 'success');
      setSelectedIds(new Set());
      setShowBulkAssign(false);
      setBulkAssignUserIds([]);
      loadData();
    } catch {
      showToast('Erreur lors de l\'attribution', 'error');
    } finally {
      setBulkAssigning(false);
    }
  }

  async function handleBulkZone() {
    if (!bulkZoneValue) {
      showToast('Selectionnez une zone', 'error');
      return;
    }
    setBulkZoneUpdating(true);
    try {
      await bulkUpdateZone(Array.from(selectedIds), bulkZoneValue);
      showToast(`${selectedIds.size} declaration(s) mise(s) a jour`, 'success');
      setSelectedIds(new Set());
      setShowBulkZone(false);
      setBulkZoneValue('');
      loadData();
    } catch {
      showToast('Erreur lors de la mise a jour de la zone', 'error');
    } finally {
      setBulkZoneUpdating(false);
    }
  }

  if (!profile || !user) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Suivi declarations de revenus
          </h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
              Aucun cabinet assigne
            </p>
            <p className="text-gray-500 dark:text-gray-400">
              Contactez un administrateur pour obtenir l acces a un cabinet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Suivi declarations de revenus
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {filtered.length} declaration{filtered.length !== 1 ? 's' : ''}
            {anneeFilter !== 'all' && <> &mdash; annee {anneeFilter}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'table'
                  ? 'bg-white dark:bg-gray-700 text-teal-700 dark:text-teal-300 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              title="Vue tableau"
            >
              <TableIcon className="w-4 h-4" />
              Tableau
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'kanban'
                  ? 'bg-white dark:bg-gray-700 text-teal-700 dark:text-teal-300 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              title="Vue kanban"
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </button>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle declaration
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une personne..."
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="w-40">
          <Select
            value={anneeFilter === 'all' ? 'all' : String(anneeFilter)}
            onChange={(e) =>
              setAnneeFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
            }
          >
            <option value="all">Toutes les annees</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                Annee {y}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-56">
          <Select
            value={statutFilter}
            onChange={(e) =>
              setStatutFilter(e.target.value as RevenueDeclarationStatus | 'all')
            }
          >
            <option value="all">Tous les statuts</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-36">
          <Select
            value={zoneFilter}
            onChange={(e) =>
              setZoneFilter(e.target.value as RevenueDeclarationZone | 'all')
            }
          >
            <option value="all">Toutes zones</option>
            <option value="1">Zone 1</option>
            <option value="2">Zone 2</option>
            <option value="3">Zone 3</option>
          </Select>
        </div>

        <button
          onClick={() => setShowMyDossiers(!showMyDossiers)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
            showMyDossiers
              ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700'
          }`}
          title="Afficher uniquement mes declarations"
        >
          <FolderOpen className="w-4 h-4" />
          Mes dossiers
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-teal-800 dark:text-teal-200">
            {selectedIds.size} declaration{selectedIds.size > 1 ? 's' : ''} selectionnee{selectedIds.size > 1 ? 's' : ''}
          </span>
          <Button
            variant="outline"
            onClick={() => {
              setShowBulkAssign(true);
              setBulkAssignUserIds([]);
              setBulkAssignMode('add');
            }}
            className="text-sm"
          >
            <Users className="w-4 h-4 mr-1.5" />
            Attribuer collaborateurs
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowBulkZone(true);
              setBulkZoneValue('');
            }}
            className="text-sm"
          >
            <MapPin className="w-4 h-4 mr-1.5" />
            Attribuer zone
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Deselectionner
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
              {declarations.length === 0
                ? 'Aucune declaration enregistree'
                : 'Aucun resultat pour ces filtres'}
            </p>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {declarations.length === 0
                ? 'Creez votre premiere declaration de revenus pour demarrer le suivi.'
                : 'Modifiez les filtres pour elargir la recherche.'}
            </p>
            {declarations.length === 0 && (
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle declaration
              </Button>
            )}
          </CardContent>
        </Card>
      ) : view === 'table' ? (
        <RevenueDeclarationsTable
          declarations={filtered}
          attachmentsCounts={attachmentsCounts}
          deadlinesMap={deadlinesMap}
          userId={user.id}
          onEdit={openEdit}
          onChanged={loadData}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      ) : (
        <RevenueDeclarationsKanban
          declarations={filtered}
          attachmentsCounts={attachmentsCounts}
          deadlinesMap={deadlinesMap}
          onCardClick={openEdit}
          onChanged={loadData}
        />
      )}

      <RevenueDeclarationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        userId={user.id}
        declaration={editing}
        defaultAnnee={anneeFilter === 'all' ? defaultAnnee : anneeFilter}
        onSaved={loadData}
      />

      {showBulkAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBulkAssign(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Attribuer des collaborateurs
              </h2>
              <button onClick={() => setShowBulkAssign(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {selectedIds.size} declaration{selectedIds.size > 1 ? 's' : ''} selectionnee{selectedIds.size > 1 ? 's' : ''}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkAssignMode('add')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    bulkAssignMode === 'add'
                      ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                      : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAssignMode('replace')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    bulkAssignMode === 'replace'
                      ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                      : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Remplacer
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {bulkAssignMode === 'add'
                  ? 'Les collaborateurs seront ajoutes aux assignations existantes.'
                  : 'Les assignations actuelles seront remplacees.'}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Collaborateurs</label>
              {bulkAssignUserIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {bulkAssignUserIds.map((uid) => {
                    const u = cabinetUsers.find((cu) => cu.id === uid);
                    return (
                      <span
                        key={uid}
                        className="inline-flex items-center gap-1 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 text-sm px-2.5 py-1 rounded-full"
                      >
                        {u?.full_name || 'Utilisateur'}
                        <button
                          type="button"
                          onClick={() => setBulkAssignUserIds((prev) => prev.filter((id) => id !== uid))}
                          className="ml-0.5 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <select
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setBulkAssignUserIds((prev) => [...prev, e.target.value]);
                  }
                }}
              >
                <option value="">Ajouter un collaborateur...</option>
                {cabinetUsers
                  .filter((u) => !bulkAssignUserIds.includes(u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
              <Button variant="outline" onClick={() => setShowBulkAssign(false)} disabled={bulkAssigning}>
                Annuler
              </Button>
              <Button onClick={handleBulkAssign} disabled={bulkAssigning || bulkAssignUserIds.length === 0}>
                {bulkAssigning ? 'Attribution...' : 'Appliquer'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {showBulkZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBulkZone(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Attribuer une zone
              </h2>
              <button onClick={() => setShowBulkZone(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {selectedIds.size} declaration{selectedIds.size > 1 ? 's' : ''} selectionnee{selectedIds.size > 1 ? 's' : ''}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Zone</label>
              <div className="flex gap-2">
                {(Object.entries(ZONE_LABELS) as [RevenueDeclarationZone, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBulkZoneValue(key)}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      bulkZoneValue === key
                        ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                        : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-teal-200 dark:hover:border-teal-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
              <Button variant="outline" onClick={() => setShowBulkZone(false)} disabled={bulkZoneUpdating}>
                Annuler
              </Button>
              <Button onClick={handleBulkZone} disabled={bulkZoneUpdating || !bulkZoneValue}>
                {bulkZoneUpdating ? 'Mise a jour...' : 'Appliquer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
