import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useClientFilters } from '../hooks/useClientFilters';
import { useRegimesFiscaux } from '../hooks/useRegimesFiscaux';
import { useShowMyDossiers } from '../hooks/useShowMyDossiers';
import { useSortableTable } from '../hooks/useSortableTable';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { NoCabinetState } from '../components/ui/NoCabinetState';
import { Plus, Building, FileSpreadsheet, FolderOpen, GripVertical, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { ClientsToolbar } from '../components/clients/ClientsToolbar';
import { ClientsTable } from '../components/clients/ClientsTable';
import { ClientCreateModal } from '../components/clients/ClientCreateModal';
import { ClientImportModal } from '../components/clients/ClientImportModal';
import { ClientCollaboratorAssignModal } from '../components/clients/ClientCollaboratorAssignModal';
import { ClientsBulkBar } from '../components/clients/ClientsBulkBar';
import { FloatingActionButton } from '../components/ui/FloatingActionButton';
import type { Database } from '../types/database';

/**
 * La requete demande desormais `*` : elle annoncait la ligne complete tout en
 * n'en selectionnant que vingt colonnes sur trente-cinq, si bien qu'aucun
 * resultat ne correspondait au type promis aux composants enfants.
 */
type Client = Database['public']['Tables']['clients']['Row'] & {
  collaborators?: Array<{
    id: string;
    user_id: string;
    // `client_collaborators.role` a un DEFAULT ('assistant') sans NOT NULL.
    role: string | null;
    user?: { prenom: string | null; nom: string | null; avatar_color?: string | null } | null;
  }>;
};

type CabinetUser = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
};

export function Clients() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { regimes: REGIMES_FISCAUX } = useRegimesFiscaux();
  const [showMyDossiers, toggleShowMyDossiers] = useShowMyDossiers();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [cabinetUsers, setCabinetUsers] = useState<CabinetUser[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [createInitialSiret, setCreateInitialSiret] = useState<string | undefined>();
  const [createInitialName, setCreateInitialName] = useState<string | undefined>();

  // DnD order
  const [useCustomOrder, setUseCustomOrder] = useState(false);

  // Selection
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignModalClientIds, setAssignModalClientIds] = useState<string[]>([]);
  const [assignModalClientNames, setAssignModalClientNames] = useState<string[]>([]);
  const [assignModalExistingCollabs, setAssignModalExistingCollabs] = useState<Array<{
    user_id: string;
    role: string | null;
    user?: { prenom: string | null; nom: string | null };
  }>>([]);

  // Filters
  const {
    searchTerm,
    filterStatus,
    filterRegime,
    filterCloture,
    filterCollaboratorIds,
    showArchived,
    sortField,
    sortDirection,
    showFilters,
    activeFilterCount,
    filteredClients,
    setSearchTerm,
    setFilterStatus,
    setFilterRegime,
    setFilterCloture,
    setShowArchived,
    setShowFilters,
    handleSortToggle,
    toggleCollaboratorFilter,
    resetFilters,
  } = useClientFilters(clients, profile?.id, showMyDossiers);

  // Create from URL params
  useEffect(() => {
    const createSiret = searchParams.get('create');
    const createName = searchParams.get('name');
    if (createSiret) {
      setCreateInitialSiret(createSiret);
      setCreateInitialName(createName || undefined);
      setShowModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Load data
  const loadClients = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          collaborators:client_collaborators(
            id,
            user_id,
            role,
            user:profiles(prenom, nom, avatar_color)
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setClients(data || []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    async function loadCabinetUsers() {
      if (!profile) return;
      const { data } = await supabase
        .from('profiles')
        .select('id, prenom, nom, email')
        .eq('is_active', true)
        .order('nom');
      if (data) setCabinetUsers(data);
    }
    loadCabinetUsers();
  }, [profile]);

  // DnD
  const {
    sortedItems: dndSortedClients,
    orderedIds: dndOrderedIds,
    handleDragEnd,
    isCustomOrder,
    resetOrder,
  } = useSortableTable({
    context: 'clients',
    items: filteredClients,
    getId: (c) => c.id,
    enabled: useCustomOrder,
  });

  const totalFiltered = filteredClients.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredClients.slice(start, start + PAGE_SIZE);
  }, [filteredClients, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterRegime, filterCloture, filterCollaboratorIds, showArchived, showMyDossiers]);

  const displayClients = useCustomOrder ? dndSortedClients : paginatedClients;
  const displayIds = useCustomOrder ? dndOrderedIds : paginatedClients.map((c) => c.id);

  // Selection
  const toggleClientSelection = (clientId: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedClientIds.size === displayClients.length && displayClients.length > 0) {
      setSelectedClientIds(new Set());
    } else {
      setSelectedClientIds(new Set(displayClients.map((c) => c.id)));
    }
  };

  // Assign modals
  const openBulkAssignModal = () => {
    const ids = Array.from(selectedClientIds);

    // Un seul client coche : c'est le meme geste que cliquer ses avatars dans la
    // ligne, et cela doit donner le meme resultat. Sans ce renvoi, la modale
    // recevait une liste existante vide, se mettait en mode « ajout », et
    // masquait le selecteur de mode puisqu'elle ne voit qu'un client — il
    // devenait alors impossible de RETIRER un collaborateur : la sauvegarde
    // n'inserait que les manquants et ne supprimait rien.
    //
    // Constate le 2026-08-01 en recette : remplacer un collaborateur par un
    // autre n'ecrivait rien du tout, l'ancien restant en place.
    if (ids.length === 1) {
      const client = clients.find((c) => c.id === ids[0]);
      if (client) {
        openSingleAssignModal(client);
        return;
      }
    }

    const names = ids.map((id) => clients.find((c) => c.id === id)?.nom_entreprise || '').filter(Boolean);
    setAssignModalClientIds(ids);
    setAssignModalClientNames(names);
    setAssignModalExistingCollabs([]);
    setShowAssignModal(true);
  };

  const openSingleAssignModal = (client: Client) => {
    setAssignModalClientIds([client.id]);
    setAssignModalClientNames([client.nom_entreprise]);
    setAssignModalExistingCollabs(
      (client.collaborators || []).map((c) => ({
        user_id: c.user_id,
        role: c.role,
        user: c.user ? { prenom: c.user.prenom, nom: c.user.nom } : undefined,
      }))
    );
    setShowAssignModal(true);
  };

  function handleOpenCreateModal() {
    setCreateInitialSiret(undefined);
    setCreateInitialName(undefined);
    setShowModal(true);
  }

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clients</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {filteredClients.length} client{filteredClients.length > 1 ? 's' : ''}
            {activeFilterCount > 0 && ` (filtre${activeFilterCount > 1 ? 's' : ''} actif${activeFilterCount > 1 ? 's' : ''})`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showMyDossiers}
              onChange={toggleShowMyDossiers}
              className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <FolderOpen className="w-4 h-4 ml-2 mr-1.5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Mes dossiers</span>
          </label>
          <button
            onClick={() => setUseCustomOrder(!useCustomOrder)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
              useCustomOrder
                ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-700'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5" />
            Ordre manuel
          </button>
          {useCustomOrder && isCustomOrder && (
            <button
              onClick={resetOrder}
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Importer
            </Button>
            <Button onClick={handleOpenCreateModal}>
              <Plus className="w-4 h-4 mr-2" />
              Nouveau client
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <ClientsToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        activeFilterCount={activeFilterCount}
        onReset={resetFilters}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterRegime={filterRegime}
        onFilterRegimeChange={setFilterRegime}
        filterCloture={filterCloture}
        onFilterClotureChange={setFilterCloture}
        filterCollaboratorIds={filterCollaboratorIds}
        onToggleCollaborator={toggleCollaboratorFilter}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        cabinetUsers={cabinetUsers}
        regimes={REGIMES_FISCAUX}
      />

      {/* Content */}
      {!profile ? (
        <NoCabinetState />
      ) : displayClients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm || activeFilterCount > 0
                ? 'Aucun client trouve avec ces criteres'
                : 'Aucun client pour le moment'}
            </p>
            {!searchTerm && activeFilterCount === 0 && (
              <Button onClick={handleOpenCreateModal} variant="secondary" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Ajouter votre premier client
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
        <ClientsTable
          clients={displayClients}
          displayIds={displayIds}
          selectedClientIds={selectedClientIds}
          sortField={sortField}
          sortDirection={sortDirection}
          useCustomOrder={useCustomOrder}
          onSortToggle={handleSortToggle}
          onToggleSelection={toggleClientSelection}
          onToggleSelectAll={toggleSelectAll}
          onOpenAssignModal={openSingleAssignModal}
          onDragEnd={handleDragEnd}
        />

        {/* Pagination */}
        {!useCustomOrder && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalFiltered)} sur {totalFiltered} clients
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let page: number;
                if (totalPages <= 7) {
                  page = i + 1;
                } else if (currentPage <= 4) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  page = totalPages - 6 + i;
                } else {
                  page = currentPage - 3 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`min-w-[32px] h-8 rounded-lg text-sm font-medium transition-colors ${
                      page === currentPage
                        ? 'bg-teal-600 text-white dark:bg-teal-500'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Modals */}
      <ClientCreateModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={loadClients}
        initialSiret={createInitialSiret}
        initialName={createInitialName}
      />

      <ClientImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={loadClients}
      />

      <ClientsBulkBar
        selectedCount={selectedClientIds.size}
        onAssignCollaborators={openBulkAssignModal}
        onClearSelection={() => setSelectedClientIds(new Set())}
      />

      <ClientCollaboratorAssignModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        clientIds={assignModalClientIds}
        clientNames={assignModalClientNames}
        existingCollaborators={assignModalExistingCollabs}
        onSaved={() => {
          loadClients();
          setSelectedClientIds(new Set());
        }}
      />

      {selectedClientIds.size === 0 && (
        <FloatingActionButton onClick={handleOpenCreateModal} label="Nouveau client" />
      )}
    </div>
  );
}
