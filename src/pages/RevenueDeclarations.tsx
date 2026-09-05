/**
 * Le suivi des déclarations de revenus.
 * ---------------------------------------------------------------------------
 * Un tableau ou un kanban, des filtres, et deux actions en LOT — attribuer des
 * collaborateurs, attribuer une zone. Ce sont ces deux-là qui demandent de la
 * rigueur : elles écrivent sur plusieurs lignes à la fois, et une erreur y est
 * invisible parce qu'elle réussit.
 *
 * Ce qui a été sorti d'ici, et pourquoi : `revenueDeclarations/filtrage.ts`
 * porte le filtrage et les règles de sélection, avec leurs tests. Deux défauts
 * y dormaient — une sélection qui ne suivait pas les filtres, un « tout
 * sélectionner » qui comparait des tailles — et aucun des deux ne se voyait en
 * relisant le JSX.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, LayoutGrid, Table as TableIcon, FileSpreadsheet, FolderOpen, Users, X, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
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
import {
  filtrerDeclarations,
  restreindreSelection,
  toutesSelectionnees,
} from './revenueDeclarations/filtrage';

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
  /**
   * ⚠️ « AUCUNE DÉCLARATION » ET « ON N'A PAS PU LIRE » NE SONT PAS LA MÊME
   * CHOSE. Le chargement avalait son erreur et vidait la liste : l'écran
   * annonçait alors « Aucune déclaration enregistrée » sur un portefeuille
   * plein, et invitait à en créer une première.
   */
  const [erreurChargement, setErreurChargement] = useState(false);
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
    setErreurChargement(false);
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
      setErreurChargement(true);
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

  const filtered = useMemo(
    () =>
      filtrerDeclarations(declarations, {
        recherche: search,
        annee: anneeFilter,
        statut: statutFilter,
        zone: zoneFilter,
        mesDossiers: showMyDossiers,
        utilisateurId: user?.id ?? null,
      }),
    [declarations, anneeFilter, statutFilter, zoneFilter, search, showMyDossiers, user]
  );

  /*
    ⚠️ LA SÉLECTION EST RAMENÉE À CE QUI EST VISIBLE, À CHAQUE RENDU.
    Sans cela : on coche vingt lignes, on change l'année, et « Attribuer
    collaborateurs » s'applique aux vingt d'AVANT. L'action réussit, annonce
    « 20 déclarations mises à jour », et rien à l'écran ne montre ce qui a
    changé — c'est le pire de ce qu'une action en lot peut faire.
  */
  const selectionVisible = useMemo(
    () => restreindreSelection(selectedIds, filtered),
    [selectedIds, filtered]
  );

  function openCreate() {
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(d: RevenueDeclaration) {
    setEditing(d);
    setShowModal(true);
  }

  function toggleSelectAll() {
    // `selection.size === visibles.length` etait vrai des que les deux comptes
    // coincidaient, meme sur des ensembles differents : apres un changement de
    // filtre, le bouton deselectionnait au lieu de selectionner.
    if (toutesSelectionnees(selectionVisible, filtered)) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((d) => d.id)));
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
      showToast('Sélectionnez au moins un collaborateur', 'error');
      return;
    }
    setBulkAssigning(true);
    try {
      await bulkAssignCollaborators(Array.from(selectionVisible), bulkAssignUserIds, bulkAssignMode);
      showToast(`${selectionVisible.size} déclaration(s) mise(s) à jour`, 'success');
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
      showToast('Sélectionnez une zone', 'error');
      return;
    }
    setBulkZoneUpdating(true);
    try {
      await bulkUpdateZone(Array.from(selectionVisible), bulkZoneValue);
      showToast(`${selectionVisible.size} déclaration(s) mise(s) à jour`, 'success');
      setSelectedIds(new Set());
      setShowBulkZone(false);
      setBulkZoneValue('');
      loadData();
    } catch {
      showToast('Erreur lors de la mise à jour de la zone', 'error');
    } finally {
      setBulkZoneUpdating(false);
    }
  }

  if (!profile || !user) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Suivi des déclarations de revenus
          </h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
              Aucun cabinet assigné
            </p>
            <p className="text-gray-500 dark:text-gray-400">
              Contactez un administrateur pour obtenir l’accès à un cabinet.
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
            Suivi des déclarations de revenus
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {filtered.length} déclaration{filtered.length !== 1 ? 's' : ''}
            {anneeFilter !== 'all' && <> &mdash; année {anneeFilter}</>}
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
            Nouvelle déclaration
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une personne…"
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
            <option value="all">Toutes les années</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                Année {y}
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
          title="Afficher uniquement mes déclarations"
        >
          <FolderOpen className="w-4 h-4" />
          Mes dossiers
        </button>
      </div>

      {selectionVisible.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-teal-800 dark:text-teal-200">
            {selectionVisible.size} déclaration{selectionVisible.size > 1 ? 's' : ''} sélectionnée{selectionVisible.size > 1 ? 's' : ''}
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
            Tout désélectionner
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
            {/*
              TROIS CAS, ET PAS DEUX. La lecture a échoué, il n'y a rien, ou les
              filtres ne rendent rien. Le premier était confondu avec le
              deuxième : sur une base injoignable, l'écran annonçait « Aucune
              déclaration enregistrée » à un cabinet qui en a des centaines, et
              l'invitait à créer sa première.
            */}
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
              {erreurChargement
                ? 'Les déclarations n’ont pas pu être lues'
                : declarations.length === 0
                  ? 'Aucune déclaration enregistrée'
                  : 'Aucun résultat pour ces filtres'}
            </p>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {erreurChargement
                ? 'Rien n’est conclu du contenu de la base : c’est la lecture qui a échoué.'
                : declarations.length === 0
                  ? 'Créez votre première déclaration de revenus pour démarrer le suivi.'
                  : 'Modifiez les filtres pour élargir la recherche.'}
            </p>
            {erreurChargement ? (
              <Button variant="outline" onClick={() => void loadData()}>
                Réessayer
              </Button>
            ) : (
              declarations.length === 0 && (
                <Button onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nouvelle déclaration
                </Button>
              )
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
          selectedIds={selectionVisible}
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

      {/*
        ⚠️ CES DEUX FENÊTRES ÉTAIENT BRICOLÉES À LA MAIN — un `fixed inset-0`,
        un fond noir, et un `<div>` au milieu. Elles perdaient donc TOUT ce que
        `Modal` porte et qui a été corrigé ailleurs : `role="dialog"`,
        `aria-modal`, le nom accessible, le piège à focus, `Échap` pour fermer,
        et le compteur de verrouillage du défilement. Un lecteur d'écran n'y
        annonçait rien, et la tabulation continuait derrière le voile.

        Ce sont des actions EN LOT : celles qui écrivent sur vingt lignes d'un
        coup sont les dernières qu'on veut laisser piloter à l'aveugle.
      */}
      <Modal
        isOpen={showBulkAssign}
        onClose={() => setShowBulkAssign(false)}
        title="Attribuer des collaborateurs"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {selectionVisible.size} déclaration{selectionVisible.size > 1 ? 's' : ''} sélectionnée{selectionVisible.size > 1 ? 's' : ''}
          </p>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mode</legend>
            <div className="flex gap-2">
              {([
                ['add', 'Ajouter'],
                ['replace', 'Remplacer'],
              ] as const).map(([mode, libelle]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBulkAssignMode(mode)}
                  aria-pressed={bulkAssignMode === mode}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    bulkAssignMode === mode
                      ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                      : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {libelle}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {bulkAssignMode === 'add'
                ? 'Les collaborateurs seront ajoutés aux attributions existantes.'
                : 'Les attributions actuelles seront remplacées.'}
            </p>
          </fieldset>

          <div>
            {bulkAssignUserIds.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 mb-2">
                {bulkAssignUserIds.map((uid) => {
                  const u = cabinetUsers.find((cu) => cu.id === uid);
                  const nom = u?.full_name || 'Utilisateur';
                  return (
                    <li
                      key={uid}
                      className="inline-flex items-center gap-1 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 text-sm px-2.5 py-1 rounded-full"
                    >
                      {nom}
                      <button
                        type="button"
                        onClick={() => setBulkAssignUserIds((prev) => prev.filter((id) => id !== uid))}
                        aria-label={`Retirer ${nom}`}
                        title={`Retirer ${nom}`}
                        className="ml-0.5 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {/*
              `Select` et non un `<select>` nu : c'est lui qui lie le libellé au
              champ. Sans cette liaison, un lecteur d'écran annonçait une liste
              déroulante sans dire de quoi.
            */}
            <Select
              label="Collaborateurs"
              value=""
              onChange={(e) => {
                if (e.target.value) setBulkAssignUserIds((prev) => [...prev, e.target.value]);
              }}
            >
              <option value="">Ajouter un collaborateur…</option>
              {cabinetUsers
                .filter((u) => !bulkAssignUserIds.includes(u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
            <Button variant="outline" onClick={() => setShowBulkAssign(false)} disabled={bulkAssigning}>
              Annuler
            </Button>
            <Button onClick={handleBulkAssign} disabled={bulkAssigning || bulkAssignUserIds.length === 0}>
              {bulkAssigning ? 'Attribution…' : 'Appliquer'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showBulkZone}
        onClose={() => setShowBulkZone(false)}
        title="Attribuer une zone"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {selectionVisible.size} déclaration{selectionVisible.size > 1 ? 's' : ''} sélectionnée{selectionVisible.size > 1 ? 's' : ''}
          </p>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Zone</legend>
            <div className="flex gap-2">
              {(Object.entries(ZONE_LABELS) as [RevenueDeclarationZone, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBulkZoneValue(key)}
                  aria-pressed={bulkZoneValue === key}
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
          </fieldset>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-800">
            <Button variant="outline" onClick={() => setShowBulkZone(false)} disabled={bulkZoneUpdating}>
              Annuler
            </Button>
            <Button onClick={handleBulkZone} disabled={bulkZoneUpdating || !bulkZoneValue}>
              {bulkZoneUpdating ? 'Mise à jour…' : 'Appliquer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
