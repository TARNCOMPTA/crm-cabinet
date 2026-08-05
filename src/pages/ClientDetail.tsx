import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Breadcrumb } from '../components/ui/Breadcrumb';
import { Database, ClientStatus } from '../types/database';
import { DataTable, type DataTableRow } from '../components/clients/DataTable';
import { TvaStatusBadge } from '../components/clients/TvaStatusBadge';
import { TvaVerifyButton } from '../components/clients/TvaVerifyButton';
import type { StatutTvaAffiche } from '../components/clients/tvaStatut';
import { controlerSaisieTva, formaterNumeroTva } from '../lib/tva';
import { AdresseEdition, AdresseLecture } from '../components/clients/AdresseFields';
import { composerAdresse } from '../lib/adresseHeritee';
import { EmailLink, PhoneLink } from '../components/ui/ContactLinks';
import { INPISyncButton } from '../components/clients/INPISyncButton';
import { INPIStatusBadge } from '../components/clients/INPIStatusBadge';
import { LegalFormSelect } from '../components/clients/LegalFormSelect';
import { LegalFormDisplay } from '../components/clients/LegalFormDisplay';
import { MonthPicker } from '../components/clients/MonthPicker';
import ArchiveClientModal from '../components/clients/ArchiveClientModal';
import DeleteClientModal from '../components/clients/DeleteClientModal';
import { ClientCollaboratorAssignModal } from '../components/clients/ClientCollaboratorAssignModal';
import {
  ArrowLeft, Building, FileText, Users, MapPin, Save, Clock,
  MoreVertical, Archive, RotateCcw, Trash2, ExternalLink,
  Plus, Calculator, FileDown, Loader2, Package,
} from 'lucide-react';
import { ClientDirectoryContacts } from '../components/clients/ClientDirectoryContacts';
import { ClientSynthesisTab } from '../components/clients/ClientSynthesisTab';
import { ClientMeetingNotesTab } from '../components/clients/ClientMeetingNotesTab';
import { ClientARDTab } from '../components/clients/ClientARDTab';
import { ClientSoftwareTab } from '../components/clients/ClientSoftwareTab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { useRegimesFiscaux } from '../hooks/useRegimesFiscaux';
import { useCabinetRoles } from '../hooks/useCabinetRoles';
import { getRoleColorClasses } from '../lib/cabinetRolesService';
import { getSyncHistory } from '../lib/inpiService';
import { syncCardRegimeForClient } from '../lib/bilanService';
import {
  getClientDeletionStats, archiveClient, restoreClient,
  deleteClientPermanently, getClientDeletionPermissions, DeletionStats,
} from '../lib/clientDeletionService';

type Client = Database['public']['Tables']['clients']['Row'];
type ClientCollaborator = Database['public']['Tables']['client_collaborators']['Row'] & {
  user?: Database['public']['Tables']['profiles']['Row'];
};
type INPISyncHistory = Database['public']['Tables']['inpi_sync_history']['Row'];

const STATUS_OPTIONS = [
  { value: 'actif', label: 'Actif' },
  { value: 'inactif', label: 'Inactif' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'archive', label: 'Archive' },
];

const MONTHS = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];

/**
 * Colonnes que l'enregistrement de la fiche n'envoie JAMAIS.
 * ---------------------------------------------------------------------------
 * Trois familles, et chacune pour une raison differente :
 *
 *   · CE QUE LA BASE POSSEDE — `id`, `created_at`, `updated_at`. Les renvoyer
 *     n'echoue pas, mais c'est du bruit qui masque le vrai contenu du PATCH ;
 *
 *   · CE QUE LES DECLENCHEURS RECOMPOSENT — `adresse` et `nom_entreprise`. Les
 *     envoyer serait au mieux inutile, au pire destructeur : le declencheur les
 *     recompose depuis les composants, et une valeur venue du formulaire les
 *     combattrait a chaque enregistrement.
 *
 *     Historiquement, `loadClient` mettait dans `formData.adresse` une version
 *     NORMALISEE, differente de la base pour les lignes restees au format JSON :
 *     ouvrir puis enregistrer une fiche sans rien toucher REECRIVAIT son
 *     adresse. Cette normalisation a disparu, mais la regle demeure ;
 *
 *   · CE QU'UNE ROUTE SERVEUR ECRIT SEULE — les `tva_verif_*`, poses par la
 *     verification VIES. Un formulaire qui les renvoie ecraserait un verdict que
 *     le serveur vient d'obtenir, avec la valeur qu'avait la page a son
 *     chargement.
 *
 * `tva_intracom` n'y est PAS, et c'est voulu : le numero est surchargeable a la
 * main, c'est la seule des colonnes de TVA que l'utilisateur pilote.
 */
const COLONNES_NON_ENVOYEES = new Set([
  'id',
  'created_at',
  'updated_at',
  'adresse',
  'nom_entreprise',
  'last_inpi_sync',
  'last_legal_sync',
  'last_bodacc_sync',
  'resume_ia',
  'resume_ia_generated_at',
  'resume_ia_generated_by',
  'tva_verif_statut',
  'tva_verif_le',
  'tva_verif_code',
  'tva_verif_nom',
  'tva_verif_adresse',
]);

function formatFiscalClosingMonth(ddmm: string | null | undefined): string {
  if (!ddmm) return '-';
  const monthIndex = parseInt(ddmm.substring(2, 4), 10) - 1;
  return monthIndex >= 0 && monthIndex < 12 ? MONTHS[monthIndex] : '-';
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('fr-FR');
}

function formatClosingMonth(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  return MONTHS[new Date(dateString).getMonth()];
}

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { regimes } = useRegimesFiscaux();
  const { resolveRole } = useCabinetRoles();

  const REGIME_FISCAL_OPTIONS = regimes.map((r) => ({
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
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
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
    } catch {
      showToast('Erreur lors du chargement du client', 'error');
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

    // N'envoyer QUE ce qui a change, et jamais ce qui ne nous appartient pas.
    //
    // L'enregistrement faisait `update(formData)` avec le Row complet. Deux
    // consequences, dont la seconde est un vrai defaut :
    //
    //   · l'echo de `id`, `created_at` et `updated_at` — inoffensif mais inutile ;
    //   · `adresse` et `nom_entreprise` sont recomposees par declencheur : les
    //     renvoyer depuis le formulaire les combattrait a chaque enregistrement.
    //
    // LES DEUX MOITIES SONT NECESSAIRES, et c'est le point a ne pas simplifier :
    // le diff seul n'ecarterait pas `adresse` — justement parce qu'elle differe —
    // et la liste noire seule laisserait passer l'echo des autres colonnes.
    // Le `as Partial<Client>` est sain et non un contournement : les cles sortent
    // de `formData`, qui EST un `Partial<Client>`. `Object.fromEntries` perd
    // simplement cette information et rend un index generique, que le client
    // PostgREST refuse — il exige un objet dont chaque cle est une colonne connue.
    const patch = Object.fromEntries(
      Object.entries(formData).filter(
        ([cle, valeur]) =>
          !COLONNES_NON_ENVOYEES.has(cle) &&
          valeur !== (client as Record<string, unknown> | null)?.[cle]
      )
    ) as Partial<Client>;

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
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de la mise a jour', 'error');
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
    } catch (error: any) {
      showToast(error?.message || "Erreur lors de l'export PDF", 'error');
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
    } catch (error: any) {
      showToast(error.message || "Erreur lors de l'archivage", 'error');
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
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de la restauration', 'error');
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
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de la suppression', 'error');
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

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Client non trouve</p>
        <Button onClick={() => navigate('/clients')} className="mt-4">Retour aux clients</Button>
      </div>
    );
  }

  const permissions = getClientDeletionPermissions(profile?.role, client.statut ?? undefined);

  // Controle local de la cle, recalcule a chaque frappe : il dit ce qu'on peut
  // dire sans reseau, avant de deranger VIES.
  const controleTva = controlerSaisieTva(formData.tva_intracom);

  const estPhysique = formData.type_personne === 'physique';

  /**
   * La bascule morale / physique, en fonction dediee et non en `setFormData`
   * inline : elle doit PRE-REMPLIR, parce que `nom_entreprise` est NOT NULL.
   *
   *   · morale -> physique : `nom` recoit le libelle actuel EN ENTIER. Laisser
   *     les trois champs vides ferait recomposer une chaine vide au declencheur,
   *     et l'enregistrement echouerait sur la contrainte.
   *   · physique -> morale : `nom_entreprise` recoit la valeur recomposee, et
   *     civilite/nom/prenom NE SONT PAS EFFACES — on ne detruit pas trois champs
   *     sur un clic de menu. Le declencheur les ignore en `morale`, et un retour
   *     arriere ne perd rien.
   */
  function changerTypePersonne(valeur: string) {
    if (valeur === 'physique') {
      setFormData({
        ...formData,
        type_personne: 'physique',
        nom: formData.nom || client?.nom_entreprise || '',
      });
      return;
    }
    setFormData({
      ...formData,
      type_personne: valeur || null,
      nom_entreprise:
        [formData.nom, formData.prenom].filter(Boolean).join(' ') ||
        formData.nom_entreprise ||
        client?.nom_entreprise ||
        '',
    });
  }

  const generalInfoRows: DataTableRow[] = [
    {
      key: 'type_personne',
      label: 'Type de personne',
      value: client.type_personne === 'physique' ? 'Personne physique' : client.type_personne === 'morale' ? 'Personne morale' : null,
      customDisplay: client.type_personne ? (
        <Badge variant={client.type_personne === 'physique' ? 'violet' : 'gray'}>
          {client.type_personne === 'physique' ? 'Personne physique' : 'Personne morale'}
        </Badge>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">Non renseigne</span>
      ),
      editField: 'select' as const,
      editValue: formData.type_personne ?? '',
      onChange: changerTypePersonne,
      selectOptions: [
        { value: 'morale', label: 'Personne morale (societe)' },
        { value: 'physique', label: 'Personne physique (entrepreneur individuel)' },
      ],
    },
    /*
     * LES LIGNES APPARAISSENT ET DISPARAISSENT — JAMAIS GRISEES.
     *
     * « Raison sociale » et « Nom / Prenom / Civilite » sont des alternatives
     * mutuellement exclusives, pas un champ desactive. Une SARL avec une ligne
     * « Prenom » grisee est du bruit dans un tableau de onze lignes.
     *
     * C'est aussi ce qui rend `key` indispensable sur DataTableRow : le nombre
     * de lignes change, et sans identite stable React reassocie par position —
     * tous les champs suivants perdent le focus au milieu d'une saisie.
     */
    ...(estPhysique
      ? [
          {
            key: 'nom_affiche',
            label: 'Nom affiche',
            value: client.nom_entreprise,
            copyable: true,
            // Ni `editField` ni `customEditDisplay` : DataTable la laisse en
            // lecture meme en mode edition. C'est le declencheur qui l'ecrit.
            helperText: 'Recompose automatiquement depuis le nom et le prenom.',
          } as DataTableRow,
          {
            key: 'civilite',
            label: 'Civilite',
            value: client.civilite,
            editField: 'select' as const,
            editValue: formData.civilite ?? '',
            onChange: (v: string) => setFormData({ ...formData, civilite: v || null }),
            selectOptions: [
              { value: 'M.', label: 'M.' },
              { value: 'Mme', label: 'Mme' },
            ],
            helperText: "Sert au courrier, pas au libelle : le nom affiche n'en tient pas compte.",
          } as DataTableRow,
          {
            key: 'nom',
            label: 'Nom',
            value: client.nom,
            copyable: true,
            editField: 'input' as const,
            editValue: formData.nom ?? '',
            onChange: (v: string) => setFormData({ ...formData, nom: v }),
          } as DataTableRow,
          {
            key: 'prenom',
            label: 'Prenom',
            value: client.prenom,
            copyable: true,
            editField: 'input' as const,
            editValue: formData.prenom ?? '',
            onChange: (v: string) => setFormData({ ...formData, prenom: v }),
            helperText: client.prenoms && client.prenoms !== client.prenom
              ? `Etat civil complet : ${client.prenoms}`
              : undefined,
          } as DataTableRow,
        ]
      : [
          {
            key: 'raison_sociale',
            label: 'Raison sociale',
            value: client.nom_entreprise,
            copyable: true,
            editField: 'input' as const,
            editValue: formData.nom_entreprise,
            onChange: (v: string) => setFormData({ ...formData, nom_entreprise: v }),
          } as DataTableRow,
        ]),
    {
      key: 'nom_commercial',
      label: 'Nom commercial',
      value: client.nom_commercial,
      copyable: true,
      editField: 'input' as const,
      editValue: formData.nom_commercial ?? '',
      onChange: (v: string) => setFormData({ ...formData, nom_commercial: v }),
      helperText: 'Le nom sous lequel le client repond au telephone et signe ses cheques.',
    },
    { label: 'Numero de dossier', value: client.numero_dossier, copyable: true, editField: 'input' as const, editValue: formData.numero_dossier, onChange: (v: string) => setFormData({ ...formData, numero_dossier: v }) },
    { label: 'SIREN', value: client.siren, copyable: true, copyLabel: 'SIREN' },
    {
      label: 'SIRET', value: client.siret, copyable: true, copyLabel: 'SIRET',
      customDisplay: client.siret ? (
        <span className="flex items-center gap-2">
          <span className="font-mono">{client.siret}</span>
          <a href={`https://api-avis-situation-sirene.insee.fr/identification/pdf/${client.siret}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300" title="Avis de situation INSEE">
            <ExternalLink className="w-4 h-4" />
          </a>
        </span>
      ) : undefined,
      editField: 'input' as const, editValue: formData.siret, onChange: (v: string) => setFormData({ ...formData, siret: v }),
    },
    /**
     * Juste apres le SIRET, et non dans « Informations comptables » : c'est un
     * identifiant derive du SIREN, il herite du voisinage SIREN/SIRET et de son
     * motif — police a chasse fixe, bouton de copie.
     */
    {
      key: 'tva_intracom',
      label: 'TVA intracommunautaire',
      value: client.tva_intracom,
      copyable: true,
      copyLabel: 'Numero de TVA',
      customDisplay: client.tva_intracom ? (
        <span className="flex items-center gap-2 flex-wrap">
          <span className="font-mono">{formaterNumeroTva(client.tva_intracom)}</span>
          <TvaStatusBadge
            numero={client.tva_intracom}
            statut={client.tva_verif_statut as StatutTvaAffiche | null}
            nomVies={client.tva_verif_nom}
            nomEnBase={client.nom_entreprise}
            verifieLe={client.tva_verif_le}
            indisponibleTransitoire={viesIndisponible}
          />
          {client.tva_intracom_source === 'manuel' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">saisi a la main</span>
          )}
        </span>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">
          Calcule automatiquement des que le SIREN est renseigne
        </span>
      ),
      customEditDisplay: (
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={formData.tva_intracom ?? ''}
              onChange={(e) => setFormData({ ...formData, tva_intracom: e.target.value })}
              placeholder="FR40303265045"
              className="font-mono"
            />
            <TvaVerifyButton
              clientId={client.id}
              numero={client.tva_intracom}
              onVerified={() => void loadClient()}
              onIndisponible={setViesIndisponible}
            />
            {/*
              Le badge est AUSSI ici, et pas seulement en lecture : le bouton ne
              vit qu'en edition, donc sans cette ligne le verdict s'enregistrait
              sans que rien ne change a l'ecran — seul un toast passait. On
              cliquait, et on ne voyait rien.
            */}
            <TvaStatusBadge
              numero={client.tva_intracom}
              statut={client.tva_verif_statut as StatutTvaAffiche | null}
              nomVies={client.tva_verif_nom}
              nomEnBase={client.nom_entreprise}
              verifieLe={client.tva_verif_le}
              indisponibleTransitoire={viesIndisponible}
            />
          </div>
          {controleTva && (
            <p
              className={`text-xs ${
                controleTva.niveau === 'invalid'
                  ? 'text-red-600 dark:text-red-400'
                  : controleTva.niveau === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
              }`}
            >
              {controleTva.message}
            </p>
          )}
        </div>
      ),
      helperText:
        'Calcule depuis le SIREN. Le remplacer a la main le fige : vider le champ rend la main au calcul.',
    },
    { label: 'Forme juridique', value: client.forme_juridique, copyable: true, customDisplay: <LegalFormDisplay value={client.forme_juridique} />, customEditDisplay: <LegalFormSelect value={formData.forme_juridique || ''} onChange={(v) => setFormData({ ...formData, forme_juridique: v })} /> },
    {
      key: 'etat_administratif',
      label: 'Etat au registre',
      value: client.etat_administratif === 'A' ? 'Active' : client.etat_administratif === 'C' ? 'Cessee' : null,
      // Renseigne par la synchronisation INPI, jamais a la main : c'est un fait
      // du registre, pas une saisie du cabinet.
      customDisplay: client.etat_administratif === 'C' ? (
        <Badge variant="danger">Cessee au registre</Badge>
      ) : client.etat_administratif === 'A' ? (
        <Badge variant="success">Active</Badge>
      ) : (
        <span className="text-gray-400 dark:text-gray-500">-</span>
      ),
      helperText: client.date_radiation ? `Radiee le ${formatDate(client.date_radiation)}` : undefined,
    },
    { label: 'Code APE', value: client.code_ape, copyable: true, editField: 'input' as const, editValue: formData.code_ape, onChange: (v: string) => setFormData({ ...formData, code_ape: v }) },
    { label: 'Capital social', value: client.capital_social ? `${client.capital_social} EUR` : null, editField: 'number' as const, editValue: formData.capital_social, onChange: (v: string) => setFormData({ ...formData, capital_social: parseFloat(v) || null }) },
    { label: 'Dirigeant', value: client.dirigeant, copyable: true, editField: 'input' as const, editValue: formData.dirigeant, onChange: (v: string) => setFormData({ ...formData, dirigeant: v }) },
    { label: 'Date de creation', value: formatDate(client.date_creation_entreprise), editField: 'date' as const, editValue: formData.date_creation_entreprise, onChange: (v: string) => setFormData({ ...formData, date_creation_entreprise: v }) },
    {
      label: 'Dossier LMNP', value: client.is_lmnp ? 'Oui' : 'Non',
      customDisplay: <Badge variant={client.is_lmnp ? 'success' : 'default'}>{client.is_lmnp ? 'Oui' : 'Non'}</Badge>,
      customEditDisplay: (
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={formData.is_lmnp || false} onChange={(e) => setFormData({ ...formData, is_lmnp: e.target.checked })} className="sr-only peer" />
          <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-teal-600 transition-colors" />
          <div className="absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
          <span className="ms-3 text-sm font-medium text-gray-700 dark:text-gray-300">{formData.is_lmnp ? 'Oui' : 'Non'}</span>
        </label>
      ),
    },
  ];

  const accountingInfoRows: DataTableRow[] = [
    { label: 'Mois de cloture', value: formatClosingMonth(client.date_cloture), customEditDisplay: <MonthPicker label="" value={formData.date_cloture || ''} onChange={(d) => setFormData({ ...formData, date_cloture: d })} /> },
    { label: 'Date cloture exercice social', value: formatFiscalClosingMonth(client.date_cloture_exercice_social) },
    { label: 'Date de premiere cloture', value: formatDate(client.date_premiere_cloture) },
    { label: 'Regime fiscal', value: client.regime_fiscal, editField: 'select' as const, editValue: formData.regime_fiscal, onChange: (v: string) => setFormData({ ...formData, regime_fiscal: v }), selectOptions: REGIME_FISCAL_OPTIONS },
    {
      label: 'Statut', value: client.statut,
      customDisplay: !editMode ? <Badge variant={client.statut === 'actif' ? 'success' : client.statut === 'prospect' ? 'blue' : 'warning'}>{client.statut}</Badge> : undefined,
      editField: 'select' as const, editValue: formData.statut, onChange: (v: string) => setFormData({ ...formData, statut: v as ClientStatus }), selectOptions: STATUS_OPTIONS,
    },
    { label: "Date d'entree au cabinet", value: formatDate(client.date_entree_cabinet), editField: 'date' as const, editValue: formData.date_entree_cabinet, onChange: (v: string) => setFormData({ ...formData, date_entree_cabinet: v || null }) },
    { label: 'Date de sortie du cabinet', value: formatDate(client.date_sortie_cabinet), editField: 'date' as const, editValue: formData.date_sortie_cabinet, onChange: (v: string) => setFormData({ ...formData, date_sortie_cabinet: v || null }) },
    {
      label: "Description de l'activite", value: client.description_activite,
      customDisplay: client.description_activite ? (
        <div className="text-sm text-gray-900 dark:text-gray-100">
          <p>{descriptionExpanded ? client.description_activite : (client.description_activite.length > 150 ? client.description_activite.substring(0, 150) + '...' : client.description_activite)}</p>
          {client.description_activite.length > 150 && (
            <button type="button" onClick={() => setDescriptionExpanded(!descriptionExpanded)} className="text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium mt-1 text-sm">
              {descriptionExpanded ? 'Voir moins' : 'Voir plus'}
            </button>
          )}
        </div>
      ) : <span className="text-gray-400 dark:text-gray-500">-</span>,
      editField: 'textarea' as const, editValue: formData.description_activite, onChange: (v: string) => setFormData({ ...formData, description_activite: v }),
    },
  ];

  const contactRows: DataTableRow[] = [
    {
      key: 'adresse',
      label: 'Adresse',
      // La valeur brute sert au bouton « copier » et a rien d'autre : l'affichage
      // passe par `customDisplay`, qui compose depuis les composants.
      value: composerAdresse({
        ligne1: client.adresse_ligne1,
        complement: client.adresse_complement,
        codePostal: client.code_postal,
        ville: client.ville,
        pays: client.pays,
      }) || client.adresse,
      copyable: true,
      wide: true,
      customDisplay: (
        <AdresseLecture
          composants={client}
          adresseHeritee={client.adresse}
        />
      ),
      customEditDisplay: (
        <AdresseEdition
          composants={formData}
          adresseHeritee={client.adresse}
          onChange={(champs) => setFormData({ ...formData, ...champs })}
        />
      ),
    },
    { label: 'Email', value: client.email, customDisplay: !editMode && client.email?.trim() ? <EmailLink email={client.email} /> : undefined, copyable: !editMode, editField: 'input' as const, editValue: formData.email, onChange: (v: string) => setFormData({ ...formData, email: v }) },
    { label: 'Telephone', value: client.telephone, customDisplay: !editMode && client.telephone?.trim() ? <PhoneLink phone={client.telephone} /> : undefined, copyable: !editMode, editField: 'input' as const, editValue: formData.telephone, onChange: (v: string) => setFormData({ ...formData, telephone: v }) },
    { label: 'Telephone 2', value: client.telephone_2, customDisplay: !editMode && client.telephone_2?.trim() ? <PhoneLink phone={client.telephone_2} /> : undefined, copyable: !editMode, editField: 'input' as const, editValue: formData.telephone_2, onChange: (v: string) => setFormData({ ...formData, telephone_2: v }) },
    { label: 'Contact principal', value: client.contact_principal, copyable: true, editField: 'input' as const, editValue: formData.contact_principal, onChange: (v: string) => setFormData({ ...formData, contact_principal: v }) },
  ];

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
        <TabsList>
          <TabsTrigger value="informations">Informations</TabsTrigger>
          <TabsTrigger value="rdv">Comptes-rendus</TabsTrigger>
          <TabsTrigger value="logiciels" className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" />Logiciels</TabsTrigger>
          {client.is_lmnp && <TabsTrigger value="outils" className="flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" />Outils</TabsTrigger>}
          <TabsTrigger value="synthese">Synthese</TabsTrigger>
        </TabsList>

        <TabsContent value="informations" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <InfoSection icon={Building} title="Informations generales" rows={generalInfoRows} editMode={editMode} />
              <InfoSection icon={FileText} title="Informations comptables" rows={accountingInfoRows} editMode={editMode} />
              <InfoSection icon={MapPin} title="Coordonnees" rows={contactRows} editMode={editMode} />
            </div>
            <div className="space-y-6">
              <CollaboratorsCard
                collaborators={collaborators}
                resolveRole={resolveRole}
                onAdd={() => setShowCollabModal(true)}
              />
              <ClientDirectoryContacts clientId={client.id} siren={client.siren} siret={client.siret} nomEntreprise={client.nom_entreprise} formeJuridique={client.forme_juridique} adresseLigne1={client.adresse_ligne1} codePostal={client.code_postal} ville={client.ville} email={client.email} telephone={client.telephone} />
              <SyncHistoryCard syncHistory={syncHistory} />
            </div>
          </div>
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

function CollaboratorsCard({ collaborators, resolveRole, onAdd }: { collaborators: any[]; resolveRole: (key: string) => any; onAdd: () => void }) {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Collaborateurs</h2>
          </div>
          <button type="button" onClick={onAdd} className="w-7 h-7 flex items-center justify-center rounded-full bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-800 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {collaborators.length > 0 ? (
          <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
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

function SyncHistoryCard({ syncHistory }: { syncHistory: any[] }) {
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
                  <p className="text-sm text-gray-900 dark:text-gray-100">{new Date(sync.sync_date).toLocaleString('fr-FR')}</p>
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
