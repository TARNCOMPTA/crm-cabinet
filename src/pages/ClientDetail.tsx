import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { Database } from '../types/database';
import { DataTable, type DataTableRow } from '../components/clients/DataTable';
import { INPISyncButton } from '../components/clients/INPISyncButton';
import { INPIStatusBadge } from '../components/clients/INPIStatusBadge';
import ArchiveClientModal from '../components/clients/ArchiveClientModal';
import DeleteClientModal from '../components/clients/DeleteClientModal';
import { ClientCollaboratorAssignModal } from '../components/clients/ClientCollaboratorAssignModal';
import {
  ArrowLeft, Building, FileText, Users, MapPin, Save, Clock,
  MoreVertical, Archive, RotateCcw, Trash2,
  Plus, Calculator, FileDown, Loader2, Package, PieChart,
} from 'lucide-react';
import { ClientDirectoryContacts } from '../components/clients/ClientDirectoryContacts';
import { ClientStatutsCard } from '../components/clients/ClientStatutsCard';
import { ClientSynthesisTab } from '../components/clients/ClientSynthesisTab';
import { ClientMeetingNotesTab } from '../components/clients/ClientMeetingNotesTab';
import { ClientARDTab } from '../components/clients/ClientARDTab';
import { ClientSoftwareTab } from '../components/clients/ClientSoftwareTab';
import { ClientPartsTab } from '../components/clients/ClientPartsTab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { useRegimesFiscaux } from '../hooks/useRegimesFiscaux';
import { useCabinetRoles } from '../hooks/useCabinetRoles';
import { getRoleColorClasses, type CabinetCollaboratorRole } from '../lib/cabinetRolesService';
import { getSyncHistory } from '../lib/inpiService';
import { syncCardRegimeForClient } from '../lib/bilanService';
import { messageErreur, codeErreur } from '../lib/erreurs';
import { patchFicheClient } from '../lib/champsClient';
import { lignesGenerales, lignesComptables, lignesCoordonnees, type ContexteFiche } from './clientDetail/lignes';
import {
  getClientDeletionStats, archiveClient, restoreClient,
  deleteClientPermanently, getClientDeletionPermissions, DeletionStats,
} from '../lib/clientDeletionService';

type Client = Database['public']['Tables']['clients']['Row'];
type ClientCollaborator = Database['public']['Tables']['client_collaborators']['Row'] & {
  user?: Database['public']['Tables']['profiles']['Row'];
};
type INPISyncHistory = Database['public']['Tables']['inpi_sync_history']['Row'];

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { regimes } = useRegimesFiscaux();
  const { resolveRole } = useCabinetRoles();

  const optionsRegimeFiscal = regimes.map((r) => ({
    value: r.value,
    label: `${r.label} - ${r.description}`,
  }));

  const [client, setClient] = useState<Client | null>(null);
  const [collaborators, setCollaborators] = useState<ClientCollaborator[]>([]);
  const [syncHistory, setSyncHistory] = useState<INPISyncHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [descriptionDepliee, setDescriptionDepliee] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [deletionStats, setDeletionStats] = useState<DeletionStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  /**
   * Indisponibilite de VIES, TRANSITOIRE et jamais persistee : la colonne
   * `tva_verif_statut` n'a que trois valeurs, et la route n'ecrit rien quand le
   * service n'a pas repondu. Cet etat local dit « le dernier appel n'a rien
   * conclu » et disparait au rechargement.
   */
  const [viesIndisponible, setViesIndisponible] = useState(false);

  /**
   * Le chargement a echoue — ce qui n'est PAS la meme chose qu'une fiche
   * absente. Voir `loadClient` : c'est ce booleen qui separe les deux ecrans.
   */
  const [echecChargement, setEchecChargement] = useState(false);

  useEffect(() => {
    if (id && profile) {
      loadClient();
      loadSyncHistory();
    }
  }, [id, profile]);

  async function loadClient() {
    if (!id || !profile) return;
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      /*
       * PLUS DE NORMALISATION A LA LECTURE.
       *
       * `formaterAdresse` etait posee ici pour rendre lisibles les adresses
       * restees au format JSON — et c'est precisement ce qui faisait que
       * `formData.adresse` DIFFERAIT de la base, donc que l'enregistrement
       * reecrivait l'adresse (voir COLONNES_NON_ENVOYEES).
       *
       * Elle n'a plus d'objet : il ne reste aucune ligne au format JSON en base,
       * et l'affichage passe par les composants. Verifie sur la production le
       * 2026-08-03 — zero `adresse LIKE '{%'`, zero adresse sans aucun composant.
       */
      setClient(data);
      setFormData(data);
      const { data: collabData } = await supabase
        .from('client_collaborators')
        .select('*, user:profiles(*)')
        .eq('client_id', id);
      if (collabData) setCollaborators(collabData as ClientCollaborator[]);
      setEchecChargement(false);
    } catch (e) {
      /*
       * « ABSENT » ET « ON N'A PAS PU SAVOIR » NE SONT PAS LA MEME CHOSE.
       *
       * Les deux finissaient ici, et l'ecran affichait ensuite « Client non
       * trouve » dans les deux cas — donc, sur une simple coupure reseau, un
       * message qui se lit comme une SUPPRESSION. Quelqu'un qui vient d'ouvrir
       * la fiche d'un dossier qu'il connait en conclut que le dossier a
       * disparu, et rien a l'ecran ne dit le contraire ni ne propose de
       * reessayer.
       *
       * `PGRST116` est le code de PostgREST pour « `.single()` n'a ramene
       * aucune ligne » : c'est le SEUL cas ou la fiche est vraiment absente.
       * Tout le reste — reseau coupe, jeton expire, base injoignable — est un
       * echec de chargement, et se dit comme tel.
       */
      const absente = codeErreur(e) === 'PGRST116';
      setEchecChargement(!absente);
      if (!absente) showToast(messageErreur(e, 'Erreur lors du chargement du client'), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncHistory() {
    if (!id) return;
    setSyncHistory(await getSyncHistory(id));
  }

  async function handleSave() {
    if (!id || !formData || !profile) return;
    if (formData.date_sortie_cabinet && formData.date_entree_cabinet && formData.date_sortie_cabinet < formData.date_entree_cabinet) {
      showToast("La date de sortie ne peut pas etre anterieure a la date d'entree", 'error');
      return;
    }

    // N'envoyer QUE ce qui a change, et jamais ce qui ne nous appartient pas :
    // la regle complete — normaliser, differencier, ecarter la liste noire —
    // vit dans `lib/champsClient.ts`, avec ses tests et l'ordre qu'elle impose.
    const patch = patchFicheClient(formData, client) as Partial<Client>;

    // Un enregistrement sans changement doit le dire, plutot que d'annoncer un
    // succes qui n'a rien fait.
    if (Object.keys(patch).length === 0) {
      showToast('Aucune modification a enregistrer', 'info');
      setEditMode(false);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('clients').update(patch).eq('id', id);
      if (error) throw error;

      if (formData.regime_fiscal && formData.regime_fiscal !== client?.regime_fiscal) {
        syncCardRegimeForClient(id, formData.regime_fiscal).catch(() => {});
      }
      showToast('Client mis a jour avec succes', 'success');
      setEditMode(false);
      // Indispensable, et pas seulement par confort : c'est ce rechargement qui
      // fait apparaitre `adresse` et `nom_entreprise` telles que les
      // declencheurs viennent de les recomposer.
      await loadClient();
    } catch (error) {
      showToast(messageErreur(error, 'Erreur lors de la mise a jour'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPdf() {
    if (!id || !profile) return;
    setExportingPdf(true);
    try {
      // Chargement a la demande.
      // -----------------------------------------------------------------------
      // `clientPdfExportService` embarque jsPDF et son greffon de tableaux, qui
      // pesaient a eux seuls la moitie du morceau « ClientDetail » — livre a
      // TOUTE ouverture d'une fiche client, alors que l'export est une action
      // ponctuelle. L'import dynamique le sort du chemin de rendu : le poids
      // n'est paye que par celui qui clique sur « Exporter ».
      const { exportClientToPdf } = await import('../lib/clientPdfExportService');
      await exportClientToPdf({ clientId: id});
      showToast('Fiche client exportee', 'success');
    } catch (error) {
      showToast(messageErreur(error, "Erreur lors de l'export PDF"), 'error');
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleArchive() {
    if (!id || !profile) return;
    setIsPerformingAction(true);
    try {
      await archiveClient(id, profile.id);
      showToast('Client archive avec succes', 'success');
      navigate('/clients');
    } catch (error) {
      showToast(messageErreur(error, "Erreur lors de l'archivage"), 'error');
    } finally {
      setIsPerformingAction(false);
    }
  }

  async function handleRestore() {
    if (!id || !profile) return;
    setIsPerformingAction(true);
    try {
      await restoreClient(id, profile.id);
      showToast('Client restaure avec succes', 'success');
      await loadClient();
    } catch (error) {
      showToast(messageErreur(error, 'Erreur lors de la restauration'), 'error');
    } finally {
      setIsPerformingAction(false);
    }
  }

  async function handleDelete() {
    if (!id || !profile || !deletionStats) return;
    setIsPerformingAction(true);
    try {
      await deleteClientPermanently(id, profile.id, deletionStats);
      showToast('Client supprime definitivement', 'success');
      navigate('/clients');
    } catch (error) {
      showToast(messageErreur(error, 'Erreur lors de la suppression'), 'error');
    } finally {
      setIsPerformingAction(false);
    }
  }

  async function handleOpenDeleteModal() {
    if (!id) return;
    setLoadingStats(true);
    setShowDeleteModal(true);
    try {
      setDeletionStats(await getClientDeletionStats(id));
    } catch {
      showToast('Erreur lors du chargement des statistiques', 'error');
    } finally {
      setLoadingStats(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-[3px] border-gray-200 dark:border-gray-700 border-t-teal-600 dark:border-t-teal-400" />
      </div>
    );
  }

  if (echecChargement) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-900 dark:text-gray-100 font-medium">Impossible de charger cette fiche</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Le dossier existe peut-etre toujours : c'est la lecture qui a echoue.
        </p>
        <div className="flex gap-2 justify-center mt-4">
          {/* Reessayer SUR PLACE. Renvoyer vers la liste etait la seule issue
              offerte, et elle fait perdre l'endroit ou l'on etait pour un
              incident qui dure souvent quelques secondes. */}
          <Button onClick={() => { setLoading(true); loadClient(); loadSyncHistory(); }}>Reessayer</Button>
          <Button variant="secondary" onClick={() => navigate('/clients')}>Retour aux clients</Button>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Client non trouve</p>
        <Button onClick={() => navigate('/clients')} className="mt-4">Retour aux clients</Button>
      </div>
    );
  }

  const permissions = getClientDeletionPermissions(profile?.role, client.statut ?? undefined);

  /**
   * Ce que les champs de la fiche ont besoin de savoir, en un seul objet.
   *
   * Leurs 320 lignes de definition sont dans `clientDetail/lignes.tsx` : cet
   * ecran decide QUOI faire, ce module dit QUOI afficher. Le contexte est la
   * frontiere entre les deux, et le fait qu'elle tienne en dix champs est ce
   * qui prouve que la coupure est au bon endroit.
   */
  const contexteChamps: ContexteFiche = {
    client,
    formData,
    /*
     * Le remplacant des vingt-cinq `setFormData({ ...formData, x })`. La
     * fusion se fait ici, une fois, au lieu d'etre recopiee a chaque champ —
     * et chaque recopie etait une occasion d'oublier le `...formData` et
     * d'effacer toute la saisie.
     *
     * ⚠️ `setFormData(actuel => ...)` ET NON `{ ...formData, ... }` : la
     * FORME FONCTIONNELLE, parce qu'un appelant peut ecrire APRES une attente.
     * `AdresseEdition.chercherCommune` interroge l'API Adresse puis appelle
     * `onChange({ ville, code_insee })` — une seconde plus tard. Avec la
     * valeur capturee au rendu, tout ce qui avait ete tape dans l'intervalle
     * etait ecrase par l'etat d'AVANT la recherche. La forme fonctionnelle
     * part de l'etat courant, pas de celui du rendu qui a lance l'appel.
     */
    modifier: (champs) => setFormData((actuel) => ({ ...actuel, ...champs })),
    editMode,
    optionsRegimeFiscal,
    viesIndisponible,
    setViesIndisponible,
    recharger: () => void loadClient(),
    descriptionDepliee,
    basculerDescription: () => setDescriptionDepliee((v) => !v),
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Clients', to: '/clients', icon: Building }, { label: client.nom_entreprise }]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/clients">
            <Button variant="ghost" size="sm" aria-label="Retour"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{client.nom_entreprise}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={client.statut === 'actif' ? 'success' : client.statut === 'prospect' ? 'blue' : 'warning'}>{client.statut}</Badge>
              <INPIStatusBadge lastSync={client.last_inpi_sync} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <Button variant="secondary" onClick={() => { setFormData(client || {}); setEditMode(false); }} disabled={saving}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />{saving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </>
          ) : (
            <>
              <INPISyncButton clientId={client.id} onSyncComplete={() => { loadClient(); loadSyncHistory(); }} />
              <Button variant="secondary" onClick={handleExportPdf} disabled={exportingPdf || isPerformingAction}>
                {exportingPdf ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generation...</> : <><FileDown className="w-4 h-4 mr-2" />Exporter PDF</>}
              </Button>
              <Button onClick={() => setEditMode(true)} disabled={isPerformingAction}>Modifier</Button>
              {(permissions.canArchive || permissions.canRestore || permissions.canDelete) && (
                <div className="relative">
                  <Button variant="secondary" onClick={() => setShowActionsMenu(!showActionsMenu)} disabled={isPerformingAction}>
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                  {showActionsMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-20">
                        {permissions.canArchive && (
                          <button onClick={() => { setShowActionsMenu(false); setShowArchiveModal(true); }} className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                            <Archive className="w-4 h-4 text-orange-600 dark:text-orange-400" />Archiver le client
                          </button>
                        )}
                        {permissions.canRestore && (
                          <button onClick={() => { setShowActionsMenu(false); handleRestore(); }} className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                            <RotateCcw className="w-4 h-4 text-teal-600 dark:text-teal-400" />Restaurer le client
                          </button>
                        )}
                        {permissions.canDelete && (
                          <>
                            {(permissions.canArchive || permissions.canRestore) && <div className="my-1 border-t border-gray-200 dark:border-gray-700" />}
                            <button onClick={() => { setShowActionsMenu(false); handleOpenDeleteModal(); }} className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2">
                              <Trash2 className="w-4 h-4" />Supprimer definitivement
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="informations">
        <TabsList aria-label="Sections de la fiche client">
          <TabsTrigger value="informations">Informations</TabsTrigger>
          <TabsTrigger value="rdv">Comptes-rendus</TabsTrigger>
          {/* Sans condition sur la forme juridique, DELIBEREMENT : masquer
              l'onglet quand `forme_juridique` est vide le cacherait justement
              aux fiches incompletes, celles qui ont le plus besoin d'etre
              renseignees. Un particulier y verra « aucune repartition saisie »,
              ce qui est exact. */}
          <TabsTrigger value="parts" className="flex items-center gap-1.5"><PieChart className="w-3.5 h-3.5" />Parts</TabsTrigger>
          <TabsTrigger value="logiciels" className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />Logiciels</TabsTrigger>
          {client.is_lmnp && <TabsTrigger value="outils" className="flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" />Outils</TabsTrigger>}
          <TabsTrigger value="synthese">Synthèse</TabsTrigger>
        </TabsList>

        <TabsContent value="informations" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <InfoSection icon={Building} title="Informations generales" rows={lignesGenerales(contexteChamps)} editMode={editMode} />
              <InfoSection icon={FileText} title="Informations comptables" rows={lignesComptables(contexteChamps)} editMode={editMode} />
              <InfoSection icon={MapPin} title="Coordonnees" rows={lignesCoordonnees(contexteChamps)} editMode={editMode} />
            </div>
            <div className="space-y-6">
              <CollaboratorsCard
                collaborators={collaborators}
                resolveRole={resolveRole}
                onAdd={() => setShowCollabModal(true)}
              />
              <ClientDirectoryContacts clientId={client.id} siren={client.siren} siret={client.siret} nomEntreprise={client.nom_entreprise} formeJuridique={client.forme_juridique} adresseLigne1={client.adresse_ligne1} codePostal={client.code_postal} ville={client.ville} email={client.email} telephone={client.telephone} />
              {/* Ne s'affiche que si des statuts sont deposes au registre — ou si
                  on n'a pas pu le savoir, ce qui n'est pas la meme chose. */}
              <ClientStatutsCard client={client} />
              <SyncHistoryCard syncHistory={syncHistory} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="parts" className="mt-6">
          {/* `parts_totales`, `capital_social` et `forme_juridique` viennent de
              la fiche : c'est elle qui les possede et qui les edite. L'onglet
              les lit, il ne les ecrit jamais — deux proprietaires pour un meme
              champ finissent toujours par se contredire. */}
          <ClientPartsTab
            clientId={client.id}
            nomClient={client.nom_entreprise}
            partsTotales={client.parts_totales}
            capitalSocial={client.capital_social}
            formeJuridique={client.forme_juridique}
          />
        </TabsContent>

        <TabsContent value="rdv" className="mt-6">
          <ClientMeetingNotesTab clientId={client.id} />
        </TabsContent>
        <TabsContent value="logiciels" className="mt-6">
          <ClientSoftwareTab clientId={client.id} />
        </TabsContent>
        {client.is_lmnp && (
          <TabsContent value="outils" className="mt-6">
            <ClientARDTab clientId={client.id} />
          </TabsContent>
        )}
        <TabsContent value="synthese" className="mt-6">
          <ClientSynthesisTab clientId={client.id} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <ArchiveClientModal isOpen={showArchiveModal} onClose={() => setShowArchiveModal(false)} onConfirm={handleArchive} clientName={client.nom_entreprise || ''} />
      <DeleteClientModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} onConfirm={handleDelete} clientName={client.nom_entreprise || ''} stats={deletionStats} isLoadingStats={loadingStats} />
      <ClientCollaboratorAssignModal
        isOpen={showCollabModal}
        onClose={() => setShowCollabModal(false)}
        clientIds={[client.id]}
        clientNames={[client.nom_entreprise || '']}
        existingCollaborators={collaborators.map((c) => ({ user_id: c.user_id, role: c.role, user: c.user ? { prenom: c.user.prenom, nom: c.user.nom } : undefined }))}
        onSaved={loadClient}
      />
    </div>
  );
}

function InfoSection({ icon: Icon, title, rows, editMode }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rows: DataTableRow[];
  editMode: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-4">
          <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        </div>
        <DataTable rows={rows} editMode={editMode} />
      </CardContent>
    </Card>
  );
}

function CollaboratorsCard({ collaborators, resolveRole, onAdd }: {
  collaborators: ClientCollaborator[];
  resolveRole: (key: string | null | undefined) => CabinetCollaboratorRole | null;
  onAdd: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Collaborateurs</h2>
          </div>
          {/* Un bouton a icone seule n'a AUCUN nom accessible : ni une aide
              technique ni un test ne peuvent le designer. C'est exactement le
              defaut que le parcours de bout en bout a ete ecrit pour attraper. */}
          <button type="button" onClick={onAdd} aria-label="Gerer les collaborateurs" title="Gerer les collaborateurs" className="w-7 h-7 flex items-center justify-center rounded-full bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-800 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {collaborators.length > 0 ? (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Collaborateur</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {collaborators.map((collab) => {
                  const resolved = resolveRole(collab.role);
                  return (
                    <tr key={collab.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-medium text-teal-700 dark:text-teal-400">{collab.user?.prenom?.[0]}{collab.user?.nom?.[0]}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{collab.user?.prenom} {collab.user?.nom}</p>
                            {collab.user?.job_role && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{collab.user.job_role}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {resolved ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColorClasses(resolved.color)}`}>{resolved.label}</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 italic">{collab.role}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Aucun collaborateur affecte</p>
        )}
      </CardContent>
    </Card>
  );
}

function SyncHistoryCard({ syncHistory }: { syncHistory: INPISyncHistory[] }) {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Synchronisation INPI</h2>
        </div>
        <div className="space-y-3">
          {syncHistory.length > 0 ? (
            syncHistory.slice(0, 5).map((sync) => (
              <div key={sync.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  {/* `sync_date` est nullable : `new Date(null)` aurait affiche le 1er janvier
                      1970 comme une vraie date de synchronisation. */}
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {sync.sync_date ? new Date(sync.sync_date).toLocaleString('fr-FR') : 'Date inconnue'}
                  </p>
                  {sync.error_message && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{sync.error_message}</p>}
                </div>
                <Badge variant={sync.status === 'success' ? 'success' : sync.status === 'error' ? 'danger' : 'orange'}>{sync.status}</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Aucune synchronisation</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
