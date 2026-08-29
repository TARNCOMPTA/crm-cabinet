import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { syncCardRegimeForClient } from '../lib/bilanService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
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

/**
 * La requete demande desormais `*` : elle annoncait la ligne complete tout en
 * n'en selectionnant que vingt colonnes sur trente-cinq, si bien qu'aucun
 * resultat ne correspondait au type promis aux composants enfants.
 */
import { SELECT_LISTE, type ClientListe } from '../components/clients/colonnesListe';
import { chargerPageClients, type PageClients } from '../lib/clientsListeService';

/**
 * ⚠️ CE TYPE EST PLUS ÉTROIT QUE LA LIGNE COMPLÈTE, ET C'EST LE POINT. La liste
 * ne demande à la base que les colonnes qu'elle affiche ; lire ici une colonne
 * absente de `COLONNES_LISTE` ne compile pas, au lieu d'arriver `undefined` à
 * l'écran. Voir `colonnesListe.ts`.
 */
type Client = ClientListe;

type CabinetUser = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
};

/** Les quatre colonnes que la liste sait completer sur place. */
type ChampSaisissable = 'email' | 'numero_dossier' | 'regime_fiscal' | 'date_cloture';

/**
 * Comment chaque champ se nomme dans les messages.
 *
 * DEUX FORMES, parce qu'une seule sonnerait faux : le refus a besoin de
 * l'article (« Impossible d'enregistrer l'email »), la confirmation du nom seul
 * et de son accord (« Email enregistre », « Cloture enregistree »).
 */
const LIBELLES_CHAMPS: Record<ChampSaisissable, { avecArticle: string; confirme: string }> = {
  email: { avecArticle: "l'email", confirme: 'Email enregistre' },
  numero_dossier: { avecArticle: 'le numero de dossier', confirme: 'Numero de dossier enregistre' },
  regime_fiscal: { avecArticle: 'le regime', confirme: 'Regime enregistre' },
  date_cloture: { avecArticle: 'la cloture', confirme: 'Cloture enregistree' },
};

export function Clients() {
  const { profile } = useAuth();
  const { showToast } = useToast();
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

  /**
   * DEUX CHARGEMENTS, ET C'EST LE CŒUR DE LA PAGINATION SERVEUR.
   *
   * En mode normal, `chargerPage` demande à `/api/clients/liste` la seule page
   * affichée : filtrée, triée et bornée par SQL. Sur 403 dossiers, 538 Ko
   * deviennent 45 Ko, et le coût cesse de grandir avec le portefeuille.
   *
   * ⚠️ L'ORDRE MANUEL, LUI, CONTINUE DE TOUT CHARGER. Il n'a jamais été
   * paginé — l'écran affichait déjà le portefeuille entier dès qu'on
   * l'activait — et pour cause : paginer un ordre que l'utilisateur pose à la
   * main n'a pas de sens. Ce mode garde donc PostgREST et le filtrage
   * JavaScript, inchangés.
   */
  const loadClients = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      /*
        ⚠️ LES COLONNES SONT NOMMÉES, PAS `*`. Sur 403 dossiers, `select('*')`
        rendait 1,11 Mo de JSON à chaque ouverture — soixante colonnes dont
        `resume_ia`, 203 Ko de résumés générés par IA que cet écran n'affiche
        nulle part. La liste vit dans `colonnesListe.ts`, d'où sort aussi le
        type : y ajouter une colonne est la seule façon d'en lire une de plus.

        `created_at` sert au tri sans être demandé — PostgREST ordonne sur une
        colonne qu'il ne rend pas, et la rapatrier pour cela seul serait du
        poids inutile sur chaque ligne.
      */
      const { data, error } = await supabase
        .from('clients')
        .select(SELECT_LISTE)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setClients(data || []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  /**
   * La recherche n'est plus instantanée : elle part au serveur. Sans ce délai,
   * taper « Dupont » lancerait six requêtes dont cinq déjà périmées. 250 ms est
   * en dessous de ce qu'on perçoit comme une attente, et au-dessus d'une frappe
   * rapide.
   */
  const [rechercheEnvoyee, setRechercheEnvoyee] = useState(searchTerm);
  useEffect(() => {
    const t = setTimeout(() => setRechercheEnvoyee(searchTerm), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const [pageServeur, setPageServeur] = useState<PageClients>({ clients: [], total: 0 });

  const chargerPage = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      setPageServeur(
        await chargerPageClients({
          recherche: rechercheEnvoyee,
          statut: filterStatus,
          regime: filterRegime,
          cloture: filterCloture,
          collaborateurs: filterCollaboratorIds,
          archives: showArchived,
          mesDossiers: showMyDossiers ?? false,
          tri: sortField,
          sens: sortDirection,
          limite: PAGE_SIZE,
          decalage: (currentPage - 1) * PAGE_SIZE,
        })
      );
    } catch {
      setPageServeur({ clients: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [
    profile, rechercheEnvoyee, filterStatus, filterRegime, filterCloture,
    filterCollaboratorIds, showArchived, showMyDossiers, sortField,
    sortDirection, currentPage,
  ]);

  useEffect(() => {
    if (useCustomOrder) void loadClients();
    else void chargerPage();
  }, [useCustomOrder, loadClients, chargerPage]);

  /** Recharge ce qui est à l'écran, quel que soit le mode. */
  const rechargerListe = useCallback(() => {
    if (useCustomOrder) void loadClients();
    else void chargerPage();
  }, [useCustomOrder, loadClients, chargerPage]);

  /**
   * Un champ saisi directement dans la liste, pour les fiches qui ne l'ont pas.
   *
   * PAS DE `loadClients()` APRES COUP, ET C'EST VOULU. Recharger tout le
   * portefeuille remonterait la pagination et rejouerait le tri sous les doigts
   * de qui complete dix fiches a la suite. On ne remplace que la fiche
   * concernee — c'est aussi ce qui fait basculer la cellule de la saisie vers
   * l'affichage.
   *
   * Rend un booleen : la cellule garde la saisie quand l'ecriture echoue.
   */
  const handleSaveChamp = useCallback(
    async (clientId: string, champ: ChampSaisissable, valeur: string) => {
      // La cle calculee s'elargirait en `{ [x: string]: string }`, que le type
      // de mise a jour refuse — et a raison : il accepterait alors n'importe
      // quelle colonne, y compris mal orthographiee. Le `Record` la borne aux
      // quatre colonnes prevues.
      const correctif: Partial<Record<ChampSaisissable, string>> = { [champ]: valeur };
      const { error } = await supabase.from('clients').update(correctif).eq('id', clientId);
      if (error) {
        showToast(`Impossible d'enregistrer ${LIBELLES_CHAMPS[champ].avecArticle}`, 'error');
        return false;
      }
      // Les DEUX sources : la page rendue par le serveur en mode normal, et la
      // liste complète en ordre manuel. Ne corriger que l'une laisserait la
      // cellule revenir à son tiret dès qu'on bascule de mode.
      const corriger = <T extends { id: string }>(c: T): T =>
        c.id === clientId ? { ...c, [champ]: valeur } : c;
      setClients((prev) => prev.map(corriger));
      setPageServeur((prev) => ({ ...prev, clients: prev.clients.map(corriger) }));

      /**
       * ⚠️ LE REGIME NE VIT PAS SEUL : LES BILANS LE SUIVENT.
       *
       * C'est le MEME geste que la fiche client (ClientDetail.tsx, a
       * l'enregistrement) : `syncCardRegimeForClient` deplace les bilans du
       * client vers le tableau du nouveau regime. Renseigner le regime ici sans
       * l'appeler les laisserait sur l'ancien tableau, en silence — et personne
       * ne ferait le lien avec une saisie faite depuis la liste.
       *
       * L'echec est avale, comme dans la fiche : le regime EST enregistre, et
       * faire echouer la saisie parce que le rangement des bilans a rate serait
       * pire que de la laisser passer.
       */
      if (champ === 'regime_fiscal') {
        syncCardRegimeForClient(clientId, valeur).catch(() => {});
      }

      showToast(LIBELLES_CHAMPS[champ].confirme, 'success');
      return true;
    },
    [showToast]
  );

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

  /*
    Le total vient du serveur en mode normal : il compte ce que le WHERE
    retient, sur TOUT le portefeuille, alors que la page n'en porte que
    cinquante lignes. Compter les lignes reçues annoncerait « 50 clients »
    quel que soit le cabinet.
  */
  const totalFiltered = useCustomOrder ? filteredClients.length : pageServeur.total;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterRegime, filterCloture, filterCollaboratorIds, showArchived, showMyDossiers]);

  const displayClients = useCustomOrder ? dndSortedClients : pageServeur.clients;
  const displayIds = useCustomOrder ? dndOrderedIds : pageServeur.clients.map((c) => c.id);

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
      {/*
        ⚠️ `flex-wrap` ICI ET SUR LE GROUPE DE BOUTONS, sous peine de déborder
        l'écran. Sans lui, les quatre actions — « Mes dossiers », « Ordre
        manuel », « Importer », « Nouveau client » — restent sur une ligne
        unique : 447 px de boutons dans 342 px utiles sur un téléphone, et c'est
        LA PAGE ENTIÈRE qui se met à défiler de 157 px vers la droite. Le
        tableau, lui, a son propre défilement ; ce débordement-là décalait tout
        le reste, en-tête et menu compris.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clients</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {/* `totalFiltered` et non `filteredClients.length` : en mode
                normal la page ne porte que cinquante lignes, et compter ce
                qu'on a reçu annoncerait « 50 clients » à tout un cabinet. */}
            {totalFiltered} client{totalFiltered > 1 ? 's' : ''}
            {activeFilterCount > 0 && ` (filtre${activeFilterCount > 1 ? 's' : ''} actif${activeFilterCount > 1 ? 's' : ''})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
          regimes={REGIMES_FISCAUX}
          onSaveChamp={handleSaveChamp}
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
        onCreated={rechargerListe}
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
          rechargerListe();
          setSelectedClientIds(new Set());
        }}
      />

      {selectedClientIds.size === 0 && (
        <FloatingActionButton onClick={handleOpenCreateModal} label="Nouveau client" />
      )}
    </div>
  );
}
