import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Search, Briefcase, Loader, Calendar, Package, Scale, FileText, Users, CheckCircle, Eye, RotateCcw, AlertTriangle } from 'lucide-react';
import { Database, ClientStatus, RegimeFiscal } from '../../types/database';
import { useCollaboratorAssignments } from '../../hooks/useCollaboratorAssignments';
import { ClientBulkActionsBar } from '../../components/settings/ClientBulkActionsBar';
import { ClientSaveBar } from '../../components/settings/ClientSaveBar';
import { SoftwareManagementModal } from '../../components/settings/SoftwareManagementModal';
import { useRegimesFiscaux } from '../../hooks/useRegimesFiscaux';
import { useSortableTable } from '../../hooks/useSortableTable';
import { SortableTableWrapper } from '../../components/ui/SortableTableWrapper';
import { SortableRow } from '../../components/ui/SortableRow';

/**
 * La ligne complete, et la requete qui va avec (`select('*')`).
 *
 * L'ecran annoncait la ligne entiere mais n'en demandait que quinze colonnes :
 * ni les composants enfants ni les fonctions d'aide ne pouvaient recevoir ce
 * qu'on leur promettait. Restreindre le type a la projection deplacait
 * simplement le probleme chez eux — c'est la requete qui etait en tort.
 * `clients` compte 35 colonnes, toutes courtes, et l'ecran les charge une fois.
 */
type Client = Database['public']['Tables']['clients']['Row'];
type ClientUpdate = Pick<
  Database['public']['Tables']['clients']['Update'],
  'numero_dossier' | 'regime_fiscal' | 'statut' | 'date_cloture'
>;
type Software = Database['public']['Tables']['software']['Row'];

interface ClientEdits {
  numero_dossier?: string;
  regime_fiscal?: string;
  statut?: string;
  date_cloture?: string;
}

interface SoftwareChange {
  action: 'add' | 'remove';
  softwareId: string;
}

export function SettingsMyClients() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { regimes: REGIMES_FISCAUX } = useRegimesFiscaux();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchCompanyName, setSearchCompanyName] = useState('');
  const [searchGlobal, setSearchGlobal] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRegime, setFilterRegime] = useState<string>('all');
  const [filterSoftware, setFilterSoftware] = useState<string>('all');
  const [filterFormeJuridique, setFilterFormeJuridique] = useState<string>('all');
  const [filterCodeApe, setFilterCodeApe] = useState<string>('all');
  const [filterAssignedOnly, setFilterAssignedOnly] = useState(false);

  const [availableSoftware, setAvailableSoftware] = useState<Software[]>([]);
  const [availableLegalForms, setAvailableLegalForms] = useState<string[]>([]);
  const [availableCodeApes, setAvailableCodeApes] = useState<string[]>([]);
  const [clientSoftware, setClientSoftware] = useState<Map<string, string[]>>(new Map());
  const [pendingSoftwareChanges, setPendingSoftwareChanges] = useState<Map<string, SoftwareChange[]>>(new Map());
  const [showSoftwareModal, setShowSoftwareModal] = useState(false);
  const [selectedClientForSoftware, setSelectedClientForSoftware] = useState<Client | null>(null);

  const [editedClients, setEditedClients] = useState<Map<string, ClientEdits>>(new Map());
  const [pendingAssignments, setPendingAssignments] = useState<Map<string, boolean>>(new Map());
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());

  const { assignments, loading: assignmentsLoading, isClientAssigned, refresh: refreshAssignments } =
    useCollaboratorAssignments(profile?.id);

  useEffect(() => {
    loadData();
  }, [profile]);

  const { hasChanges, changeCount } = useMemo(() => {
    let count = 0;
    editedClients.forEach((edits, clientId) => {
      const client = clients.find(c => c.id === clientId);
      if (!client) return;
      const changed = Object.entries(edits).some(
        ([field, value]) => value !== ((client[field as keyof Client] as string) || '')
      );
      if (changed) count++;
    });
    pendingAssignments.forEach((desired, clientId) => {
      if (desired !== isClientAssigned(clientId)) count++;
    });
    pendingSoftwareChanges.forEach((changes) => {
      if (changes.length > 0) count++;
    });
    return { hasChanges: count > 0, changeCount: count };
  }, [editedClients, pendingAssignments, pendingSoftwareChanges, clients, assignments]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  async function loadData() {
    if (!profile) {
      setError('Votre profil n\'est pas associe a un cabinet. Contactez votre administrateur.');
      setLoading(false);
      return;
    }

    setError(null);

    try {
      const [clientsResult, softwareResult, clientSoftwareResult] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .neq('statut', 'archive')
          .order('nom_entreprise'),
        supabase
          .from('software')
          .select('*')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('client_software')
          .select('client_id, software_id')
      ]);

      if (clientsResult.error) {
        throw clientsResult.error;
      }
      if (softwareResult.error) {
        throw softwareResult.error;
      }
      if (clientSoftwareResult.error) {
        throw clientSoftwareResult.error;
      }

      setClients(clientsResult.data || []);
      setAvailableSoftware(softwareResult.data || []);

      const distinctLegalForms = Array.from(
        new Set(
          (clientsResult.data || [])
            .map(c => c.forme_juridique)
            .filter((f): f is string => !!f && f.trim() !== '')
        )
      ).sort();
      setAvailableLegalForms(distinctLegalForms);

      const distinctCodeApes = Array.from(
        new Set(
          (clientsResult.data || [])
            .map(c => c.code_ape)
            .filter((c): c is string => !!c && c.trim() !== '')
        )
      ).sort();
      setAvailableCodeApes(distinctCodeApes);

      const softwareMap = new Map<string, string[]>();
      (clientSoftwareResult.data || []).forEach((cs) => {
        const existing = softwareMap.get(cs.client_id) || [];
        existing.push(cs.software_id);
        softwareMap.set(cs.client_id, existing);
      });
      setClientSoftware(softwareMap);
    } catch (error: any) {
      setError(error.message || 'Erreur lors du chargement des clients');
      showToast('Erreur lors du chargement des clients', 'error');
    } finally {
      setLoading(false);
    }
  }

  const {
    sortedItems: orderedClients,
    handleDragEnd,
    isCustomOrder,
    resetOrder,
  } = useSortableTable({
    context: 'settings_clients',
    items: clients,
    getId: (c) => c.id,
  });

  const filteredClients = useMemo(() => {
    return orderedClients.filter(client => {
      const matchesCompanyName = !searchCompanyName ||
        client.nom_entreprise?.toLowerCase().includes(searchCompanyName.toLowerCase());

      const matchesGlobalSearch = !searchGlobal ||
        client.numero_dossier?.toLowerCase().includes(searchGlobal.toLowerCase()) ||
        client.siren?.includes(searchGlobal) ||
        client.siret?.includes(searchGlobal) ||
        client.code_ape?.toLowerCase().includes(searchGlobal.toLowerCase());

      const effectiveStatus = getEffectiveValue(client, 'statut');
      const effectiveRegime = getEffectiveValue(client, 'regime_fiscal');
      const matchesStatus = filterStatus === 'all' || effectiveStatus === filterStatus;
      const matchesRegime = filterRegime === 'all' || effectiveRegime === filterRegime;
      const clientSoftwareIds = getEffectiveSoftware(client.id);
      const matchesSoftware = filterSoftware === 'all' || clientSoftwareIds.includes(filterSoftware);
      const matchesFormeJuridique = filterFormeJuridique === 'all' || client.forme_juridique === filterFormeJuridique;
      const matchesCodeApe = filterCodeApe === 'all' || client.code_ape === filterCodeApe;
      const matchesAssigned = !filterAssignedOnly || getEffectiveAssignment(client.id);
      return matchesCompanyName && matchesGlobalSearch && matchesStatus && matchesRegime && matchesSoftware && matchesFormeJuridique && matchesCodeApe && matchesAssigned;
    });
  }, [orderedClients, searchCompanyName, searchGlobal, filterStatus, filterRegime, filterSoftware, filterFormeJuridique, filterCodeApe, filterAssignedOnly, editedClients, clientSoftware, pendingSoftwareChanges, pendingAssignments, assignments]);

  function getEffectiveValue(client: Client, field: keyof ClientEdits): string {
    const edits = editedClients.get(client.id);
    if (edits && edits[field] !== undefined) return edits[field]!;
    return (client[field as keyof Client] as string) || '';
  }

  function getEffectiveAssignment(clientId: string): boolean {
    if (pendingAssignments.has(clientId)) return pendingAssignments.get(clientId)!;
    return isClientAssigned(clientId);
  }

  function handleFieldChange(clientId: string, field: keyof ClientEdits, value: string) {
    setEditedClients(prev => {
      const next = new Map(prev);
      next.set(clientId, { ...next.get(clientId), [field]: value });
      return next;
    });
  }

  function handleAssignmentChange(clientId: string) {
    setPendingAssignments(prev => {
      const next = new Map(prev);
      next.set(clientId, !getEffectiveAssignment(clientId));
      return next;
    });
  }

  function getEffectiveSoftware(clientId: string): string[] {
    const current = clientSoftware.get(clientId) || [];
    const changes = pendingSoftwareChanges.get(clientId) || [];

    let effective = [...current];
    changes.forEach(change => {
      if (change.action === 'add' && !effective.includes(change.softwareId)) {
        effective.push(change.softwareId);
      } else if (change.action === 'remove') {
        effective = effective.filter(id => id !== change.softwareId);
      }
    });
    return effective;
  }

  function handleSoftwareToggle(clientId: string, softwareId: string) {
    setPendingSoftwareChanges(prev => {
      const next = new Map(prev);
      const currentChanges = next.get(clientId) || [];
      const currentSoftware = clientSoftware.get(clientId) || [];
      const hasSoftware = currentSoftware.includes(softwareId);

      const existingChangeIndex = currentChanges.findIndex(c => c.softwareId === softwareId);
      if (existingChangeIndex >= 0) {
        currentChanges.splice(existingChangeIndex, 1);
      } else {
        currentChanges.push({
          action: hasSoftware ? 'remove' : 'add',
          softwareId
        });
      }

      if (currentChanges.length > 0) {
        next.set(clientId, currentChanges);
      } else {
        next.delete(clientId);
      }
      return next;
    });
  }

  function openSoftwareModal(client: Client) {
    setSelectedClientForSoftware(client);
    setShowSoftwareModal(true);
  }

  function toggleSelectClient(clientId: string) {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function toggleSelectAll() {
    const filteredIds = filteredClients.map(c => c.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedClientIds.has(id));
    setSelectedClientIds(allSelected ? new Set() : new Set(filteredIds));
  }

  function bulkChangeStatus(status: ClientStatus) {
    selectedClientIds.forEach(id => handleFieldChange(id, 'statut', status));
  }

  function bulkChangeRegime(regime: RegimeFiscal) {
    selectedClientIds.forEach(id => handleFieldChange(id, 'regime_fiscal', regime));
  }

  function bulkAssign() {
    setPendingAssignments(prev => {
      const next = new Map(prev);
      selectedClientIds.forEach(id => next.set(id, true));
      return next;
    });
  }

  function bulkUnassign() {
    setPendingAssignments(prev => {
      const next = new Map(prev);
      selectedClientIds.forEach(id => next.set(id, false));
      return next;
    });
  }

  function bulkSetClosingDate(date: string) {
    selectedClientIds.forEach(id => handleFieldChange(id, 'date_cloture', date));
  }

  function bulkAssignSoftware(softwareId: string) {
    selectedClientIds.forEach(clientId => {
      const currentSoftware = getEffectiveSoftware(clientId);
      if (!currentSoftware.includes(softwareId)) {
        handleSoftwareToggle(clientId, softwareId);
      }
    });
  }

  function bulkRemoveSoftware(softwareId: string) {
    selectedClientIds.forEach(clientId => {
      const currentSoftware = getEffectiveSoftware(clientId);
      if (currentSoftware.includes(softwareId)) {
        handleSoftwareToggle(clientId, softwareId);
      }
    });
  }

  function isRowModified(clientId: string): boolean {
    const edits = editedClients.get(clientId);
    if (edits) {
      const client = clients.find(c => c.id === clientId);
      if (client) {
        const changed = Object.entries(edits).some(
          ([field, value]) => value !== ((client[field as keyof Client] as string) || '')
        );
        if (changed) return true;
      }
    }
    if (pendingAssignments.has(clientId)) {
      return pendingAssignments.get(clientId) !== isClientAssigned(clientId);
    }
    const softwareChanges = pendingSoftwareChanges.get(clientId);
    if (softwareChanges && softwareChanges.length > 0) return true;
    return false;
  }

  async function handleSave() {
    if (!profile?.id) return;
    setSaving(true);
    try {
      // Les constructeurs de requete de postgrest-js sont « thenables », pas des
      // Promise : ils n'ont ni catch ni finally. `PromiseLike` decrit ce qu'ils
      // sont reellement, et suffit a `Promise.all`.
      const promises: PromiseLike<{ error: unknown }>[] = [];

      editedClients.forEach((edits, clientId) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;
        // Le formulaire ne modifie que les quatre colonnes de `ClientEdits` ;
        // typer la carte ainsi evite d'annoncer a `.update()` des colonnes
        // arbitraires, qu'il refuse.
        const updates: ClientUpdate = {};
        Object.entries(edits).forEach(([field, value]) => {
          if (value !== ((client[field as keyof Client] as string) || '')) {
            updates[field as keyof ClientEdits] = value || null;
          }
        });
        if (Object.keys(updates).length > 0) {
          promises.push(supabase.from('clients').update(updates).eq('id', clientId));
        }
      });

      pendingAssignments.forEach((desired, clientId) => {
        const current = isClientAssigned(clientId);
        if (desired && !current) {
          promises.push(
            supabase.from('client_collaborators').insert({
              client_id: clientId,
              user_id: profile.id,
              role: 'assistant',
            })
          );
        } else if (!desired && current) {
          promises.push(
            supabase.from('client_collaborators').delete().eq('client_id', clientId).eq('user_id', profile.id)
          );
        }
      });

      pendingSoftwareChanges.forEach((changes, clientId) => {
        changes.forEach(change => {
          if (change.action === 'add') {
            promises.push(
              supabase.from('client_software').insert({
                client_id: clientId,
                software_id: change.softwareId,
              })
            );
          } else if (change.action === 'remove') {
            promises.push(
              supabase.from('client_software')
                .delete()
                .eq('client_id', clientId)
                .eq('software_id', change.softwareId)
            );
          }
        });
      });

      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw new Error(`${errors.length} erreur(s) lors de la sauvegarde`);

      setEditedClients(new Map());
      setPendingAssignments(new Map());
      setPendingSoftwareChanges(new Map());
      setSelectedClientIds(new Set());
      await Promise.all([loadData(), refreshAssignments()]);
      showToast('Modifications enregistrees avec succes', 'success');
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditedClients(new Map());
    setPendingAssignments(new Map());
    setPendingSoftwareChanges(new Map());
  }

  const assignedClientsCount = useMemo(() => {
    let count = assignments.length;
    pendingAssignments.forEach((desired, clientId) => {
      const current = isClientAssigned(clientId);
      if (desired && !current) count++;
      else if (!desired && current) count--;
    });
    return count;
  }, [assignments, pendingAssignments]);

  const activeClientsCount = useMemo(() => {
    return filteredClients.filter(c => getEffectiveValue(c, 'statut') === 'actif').length;
  }, [filteredClients, editedClients]);

  const prospectClientsCount = useMemo(() => {
    return filteredClients.filter(c => getEffectiveValue(c, 'statut') === 'prospect').length;
  }, [filteredClients, editedClients]);

  if (loading || assignmentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const allFilteredSelected =
    filteredClients.length > 0 && filteredClients.every(c => selectedClientIds.has(c.id));
  const someFilteredSelected = filteredClients.some(c => selectedClientIds.has(c.id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-1">
          Mes Clients
        </h2>
        <p className="text-sm text-gray-500">
          Modifiez les informations et affectations clients. Les changements ne sont enregistres qu'au clic sur Enregistrer.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-900 mb-1">Erreur de chargement</h3>
            <p className="text-sm text-red-700">{error}</p>
            <p className="text-xs text-red-600 mt-2">
              Verifiez la console du navigateur (F12) pour plus de details.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Total</p>
              <p className="text-3xl font-semibold text-gray-900">{filteredClients.length}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (filterStatus === 'actif') {
              setFilterStatus('all');
            } else {
              setFilterStatus('actif');
              setFilterAssignedOnly(false);
            }
          }}
          className={`text-left bg-white border rounded-lg p-5 shadow-sm hover:shadow-md transition-all ${
            filterStatus === 'actif'
              ? 'border-emerald-400 ring-2 ring-emerald-100'
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Actifs</p>
              <p className="text-3xl font-semibold text-emerald-600">{activeClientsCount}</p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (filterAssignedOnly) {
              setFilterAssignedOnly(false);
            } else {
              setFilterAssignedOnly(true);
              setFilterStatus('all');
            }
          }}
          className={`text-left bg-white border rounded-lg p-5 shadow-sm hover:shadow-md transition-all ${
            filterAssignedOnly
              ? 'border-teal-400 ring-2 ring-teal-100'
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Assignes</p>
              <p className="text-3xl font-semibold text-teal-600">{assignedClientsCount}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-teal-600" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (filterStatus === 'prospect') {
              setFilterStatus('all');
            } else {
              setFilterStatus('prospect');
              setFilterAssignedOnly(false);
            }
          }}
          className={`text-left bg-white border rounded-lg p-5 shadow-sm hover:shadow-md transition-all ${
            filterStatus === 'prospect'
              ? 'border-blue-400 ring-2 ring-blue-100'
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Prospects</p>
              <p className="text-3xl font-semibold text-blue-600">{prospectClientsCount}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Eye className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </button>
      </div>

      <Card className="overflow-hidden border-gray-200 shadow-sm">
        <CardHeader className="border-b border-gray-100 bg-white">
          <div className="flex flex-col gap-4">
            {isCustomOrder && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-teal-600 font-medium">Ordre personnalise actif</span>
                <button
                  onClick={resetOrder}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reinitialiser l'ordre
                </button>
              </div>
            )}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 min-w-0 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Rechercher par nom d'entreprise..."
                  value={searchCompanyName}
                  onChange={e => setSearchCompanyName(e.target.value)}
                  className="pl-10 h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
                />
              </div>
              <div className="shrink-0 md:w-64 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="SIREN, n° dossier, code APE..."
                  value={searchGlobal}
                  onChange={e => setSearchGlobal(e.target.value)}
                  className="pl-10 h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
                />
              </div>
              <div className="shrink-0 md:w-48">
                <Select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="actif" className="text-emerald-700">Actif</option>
                  <option value="inactif" className="text-gray-500">Inactif</option>
                  <option value="prospect" className="text-blue-700">Prospect</option>
                </Select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <div className="shrink-0 md:w-48">
                <Select
                  value={filterRegime}
                  onChange={e => setFilterRegime(e.target.value)}
                  className="h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm"
                >
                  <option value="all">Tous les regimes</option>
                  {REGIMES_FISCAUX.map((regime) => (
                    <option key={regime.value} value={regime.value}>
                      {regime.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex-1 min-w-0">
                <Select
                  value={filterFormeJuridique}
                  onChange={e => setFilterFormeJuridique(e.target.value)}
                  className={`h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm ${
                    availableLegalForms.length === 0 ? 'text-gray-400' : ''
                  }`}
                >
                  <option value="all">
                    {availableLegalForms.length === 0
                      ? 'Aucune forme juridique disponible'
                      : 'Toutes les formes juridiques'}
                  </option>
                  {availableLegalForms.map(form => (
                    <option key={form} value={form}>
                      {form}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex-1 min-w-0">
                <Select
                  value={filterCodeApe}
                  onChange={e => setFilterCodeApe(e.target.value)}
                  className={`h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm ${
                    availableCodeApes.length === 0 ? 'text-gray-400' : ''
                  }`}
                >
                  <option value="all">
                    {availableCodeApes.length === 0
                      ? 'Aucun code APE disponible'
                      : 'Tous les codes APE'}
                  </option>
                  {availableCodeApes.map(code => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="shrink-0 md:w-48">
                <Select
                  value={filterSoftware}
                  onChange={e => setFilterSoftware(e.target.value)}
                  className={`h-10 border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm ${
                    availableSoftware.length === 0 ? 'text-gray-400' : ''
                  }`}
                >
                  <option value="all">
                    {availableSoftware.length === 0
                      ? 'Aucun logiciel disponible'
                      : 'Tous les logiciels'}
                  </option>
                  {availableSoftware.map(software => (
                    <option key={software.id} value={software.id}>
                      {software.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {selectedClientIds.size > 0 && (
              <ClientBulkActionsBar
                selectedCount={selectedClientIds.size}
                onChangeStatus={bulkChangeStatus}
                onChangeRegime={bulkChangeRegime}
                onAssignAll={bulkAssign}
                onUnassignAll={bulkUnassign}
                onSetClosingDate={bulkSetClosingDate}
                onAssignSoftware={bulkAssignSoftware}
                onRemoveSoftware={bulkRemoveSoftware}
                availableSoftware={availableSoftware}
                onClearSelection={() => setSelectedClientIds(new Set())}
                regimesFiscaux={REGIMES_FISCAUX}
              />
            )}
          </div>
        </CardHeader>

        {filteredClients.length === 0 ? (
          <div className="text-center py-16">
            <Briefcase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm font-medium">Aucun client trouve</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <SortableTableWrapper ids={filteredClients.map(c => c.id)} onDragEnd={handleDragEnd}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50">
                  <th className="w-8 py-4 px-1" />
                  <th className="sticky left-0 z-20 bg-gray-50 py-4 px-4 min-w-[48px]">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={el => {
                        if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer transition-colors"
                    />
                  </th>
                  <th className="sticky left-[48px] z-20 bg-gray-50 text-center py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide min-w-[72px]">
                    Assigne
                  </th>
                  <th className="sticky left-[120px] z-20 bg-gray-50 text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide min-w-[180px] max-w-[220px] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                    Entreprise
                  </th>
                  <th className="text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    N&#176; Dossier
                  </th>
                  <th className="text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    SIREN
                  </th>
                  <th className="text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Code APE</span>
                    </div>
                  </th>
                  <th className="text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    <div className="flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5" />
                      <span>Forme juridique</span>
                    </div>
                  </th>
                  <th className="text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Statut
                  </th>
                  <th className="text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Regime fiscal
                  </th>
                  <th className="text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Date cloture</span>
                    </div>
                  </th>
                  <th className="text-left py-4 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      <span>Logiciels</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredClients.map(client => {
                  const effectiveAssigned = getEffectiveAssignment(client.id);
                  const modified = isRowModified(client.id);
                  const selected = selectedClientIds.has(client.id);
                  const effectiveStatus = getEffectiveValue(client, 'statut');
                  const stickyBg = modified
                    ? 'bg-white group-hover:bg-gray-50'
                    : selected
                      ? 'bg-teal-50/30 group-hover:bg-teal-50/50'
                      : 'bg-white group-hover:bg-gray-50';

                  return (
                    <SortableRow
                      key={client.id}
                      id={client.id}
                      className={`group transition-all duration-200 ${
                        modified
                          ? 'bg-white hover:bg-gray-50/50'
                          : selected
                            ? 'bg-teal-50/30 hover:bg-teal-50/50'
                            : 'bg-white hover:bg-gray-50/50'
                      }`}
                    >
                      <td className={`sticky left-0 z-10 py-4 px-4 min-w-[48px] ${stickyBg} ${modified ? 'border-l-4 border-l-teal-500' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelectClient(client.id)}
                          className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer transition-colors"
                        />
                      </td>
                      <td className={`sticky left-[48px] z-10 py-4 px-4 text-center min-w-[72px] ${stickyBg}`}>
                        <input
                          type="checkbox"
                          checked={effectiveAssigned}
                          onChange={() => handleAssignmentChange(client.id)}
                          className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer transition-colors"
                        />
                      </td>
                      <td className={`sticky left-[120px] z-10 py-4 px-4 font-medium text-gray-900 whitespace-nowrap min-w-[180px] max-w-[220px] truncate shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)] ${stickyBg}`} title={client.nom_entreprise || '-'}>
                        {client.nom_entreprise || '-'}
                      </td>
                      <td className="py-4 px-4">
                        <input
                          type="text"
                          value={getEffectiveValue(client, 'numero_dossier')}
                          onChange={e => handleFieldChange(client.id, 'numero_dossier', e.target.value)}
                          placeholder="-"
                          className="w-full max-w-[140px] h-9 px-3 text-sm border border-transparent rounded-md bg-transparent hover:border-gray-300 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all"
                        />
                      </td>
                      <td className="py-4 px-4 text-gray-600 font-mono text-sm whitespace-nowrap">
                        {client.siren || '-'}
                      </td>
                      <td className="py-4 px-4 text-gray-700 text-sm whitespace-nowrap">
                        {client.code_ape || '-'}
                      </td>
                      <td className="py-4 px-4 text-gray-700 text-sm max-w-[180px] truncate" title={client.forme_juridique || '-'}>
                        {client.forme_juridique || '-'}
                      </td>
                      <td className="py-4 px-4">
                        <select
                          value={effectiveStatus}
                          onChange={e => handleFieldChange(client.id, 'statut', e.target.value)}
                          className={`h-9 px-3 text-sm font-medium border border-transparent rounded-md cursor-pointer bg-transparent hover:border-gray-300 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all ${
                            effectiveStatus === 'actif'
                              ? 'text-emerald-700'
                              : effectiveStatus === 'inactif'
                                ? 'text-gray-500'
                                : effectiveStatus === 'prospect'
                                  ? 'text-blue-700'
                                  : 'text-gray-700'
                          }`}
                        >
                          <option value="actif" className="text-emerald-700">Actif</option>
                          <option value="inactif" className="text-gray-500">Inactif</option>
                          <option value="prospect" className="text-blue-700">Prospect</option>
                        </select>
                      </td>
                      <td className="py-4 px-4">
                        <select
                          value={getEffectiveValue(client, 'regime_fiscal')}
                          onChange={e => handleFieldChange(client.id, 'regime_fiscal', e.target.value)}
                          className="h-9 px-3 text-sm border border-transparent rounded-md bg-transparent cursor-pointer hover:border-gray-300 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all text-gray-700"
                        >
                          <option value="">-</option>
                          {REGIMES_FISCAUX.map((regime) => (
                            <option key={regime.value} value={regime.value}>
                              {regime.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-4 px-4">
                        <input
                          type="date"
                          value={getEffectiveValue(client, 'date_cloture')}
                          onChange={e => handleFieldChange(client.id, 'date_cloture', e.target.value)}
                          className="w-full max-w-[160px] h-9 px-3 text-sm border border-transparent rounded-md bg-transparent hover:border-gray-300 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all"
                        />
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            {getEffectiveSoftware(client.id).slice(0, 2).map(softwareId => {
                              const software = availableSoftware.find(s => s.id === softwareId);
                              return software ? (
                                <span
                                  key={software.id}
                                  className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-md"
                                >
                                  {software.name}
                                </span>
                              ) : null;
                            })}
                            {getEffectiveSoftware(client.id).length > 2 && (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-200 text-gray-600 rounded-md">
                                +{getEffectiveSoftware(client.id).length - 2}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => openSoftwareModal(client)}
                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                            title="Gerer les logiciels"
                          >
                            <Package className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </SortableRow>
                  );
                })}
              </tbody>
            </table>
            </SortableTableWrapper>
          </div>
        )}

        {hasChanges && (
          <ClientSaveBar
            changeCount={changeCount}
            saving={saving}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </Card>

      <SoftwareManagementModal
        isOpen={showSoftwareModal}
        onClose={() => setShowSoftwareModal(false)}
        client={selectedClientForSoftware}
        availableSoftware={availableSoftware}
        currentSoftwareIds={selectedClientForSoftware ? getEffectiveSoftware(selectedClientForSoftware.id) : []}
        onToggleSoftware={(softwareId) => {
          if (selectedClientForSoftware) {
            handleSoftwareToggle(selectedClientForSoftware.id, softwareId);
          }
        }}
      />
    </div>
  );
}
