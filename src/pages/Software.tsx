import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Package, Trash2, Settings, Calendar, Building2, Filter, X } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Link } from 'react-router-dom';
import { codeErreur } from '../lib/erreurs';

/**
 * `clients.statut` est nullable en base (DEFAULT 'actif', pas de NOT NULL) : la
 * forme ecrite a la main le promettait present, et aucune ligne lue ne pouvait
 * lui correspondre.
 */
interface Client {
  id: string;
  nom_entreprise: string;
  siret: string | null;
  statut: string | null;
}

interface Software {
  id: string;
  name: string;
  category: string;
  description: string | null;
}

interface ClientSoftware {
  id: string;
  software_id: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  software: Software;
}

interface ClientWithSoftware extends Client {
  client_software: ClientSoftware[];
}

const CATEGORIES = [
  { value: 'comptabilite', label: 'Comptabilité' },
  { value: 'paie', label: 'Paie' },
  { value: 'facturation', label: 'Facturation' },
  { value: 'gestion', label: 'Gestion' },
  { value: 'crm', label: 'CRM' },
  { value: 'autre', label: 'Autre' },
];

export function Software() {
  const { showToast } = useToast();
  const [clients, setClients] = useState<ClientWithSoftware[]>([]);
  const [filteredClients, setFilteredClients] = useState<ClientWithSoftware[]>([]);
  const [availableSoftware, setAvailableSoftware] = useState<Software[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [softwareFilter, setSoftwareFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithSoftware | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    software_id: '',
    start_date: '',
    end_date: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterClients();
  }, [clients, searchTerm, softwareFilter, categoryFilter]);

  async function loadData() {
    try {
      setLoading(true);

      const [clientsResult, softwareResult] = await Promise.all([
        supabase
          .from('clients')
          .select(
            `
            id,
            nom_entreprise,
            siret,
            statut,
            client_software (
              id,
              software_id,
              start_date,
              end_date,
              notes,
              software:software_id (
                id,
                name,
                category,
                description
              )
            )
          `
          )
          .eq('statut', 'actif')
          .order('nom_entreprise'),
        supabase
          .from('software')
          .select('id, name, category, description')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (clientsResult.error) throw clientsResult.error;
      if (softwareResult.error) throw softwareResult.error;

      setClients(clientsResult.data || []);
      setAvailableSoftware(softwareResult.data || []);
    } catch {
      showToast('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  }

  function filterClients() {
    let filtered = [...clients];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (client) =>
          client.nom_entreprise.toLowerCase().includes(term) ||
          client.siret?.toLowerCase().includes(term) ||
          client.client_software.some((cs) =>
            cs.software.name.toLowerCase().includes(term)
          )
      );
    }

    if (softwareFilter === '__none__') {
      filtered = filtered.filter((client) => client.client_software.length === 0);
    } else if (softwareFilter) {
      filtered = filtered.filter((client) =>
        client.client_software.some((cs) => cs.software_id === softwareFilter)
      );
    }

    if (categoryFilter === '__none__') {
      filtered = filtered.filter((client) => client.client_software.length === 0);
    } else if (categoryFilter) {
      filtered = filtered.filter((client) =>
        client.client_software.some((cs) => cs.software.category === categoryFilter)
      );
    }

    setFilteredClients(filtered);
  }

  function openAssignModal(client: ClientWithSoftware) {
    setSelectedClient(client);
    setFormData({
      software_id: '',
      start_date: '',
      end_date: '',
      notes: '',
    });
    setShowModal(true);
  }

  async function refreshClientData(clientId: string) {
    const { data, error } = await supabase
      .from('clients')
      .select(
        `
        id,
        nom_entreprise,
        siret,
        statut,
        client_software (
          id,
          software_id,
          start_date,
          end_date,
          notes,
          software:software_id (
            id,
            name,
            category,
            description
          )
        )
      `
      )
      .eq('id', clientId)
      .single();

    if (!error && data) {
      setSelectedClient(data);
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? data : c))
      );
    }
  }

  async function handleAssign() {
    try {
      if (!formData.software_id || !selectedClient) {
        showToast('Veuillez sélectionner un logiciel', 'error');
        return;
      }

      const { error } = await supabase.from('client_software').insert([
        {
          client_id: selectedClient.id,
          software_id: formData.software_id,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          notes: formData.notes || null,
        },
      ]);

      if (error) throw error;
      showToast('Logiciel assigné au client', 'success');
      setShowModal(false);
      await refreshClientData(selectedClient.id);
      setShowManageModal(true);
    } catch (error) {
      if (codeErreur(error) === '23505') {
        showToast('Ce logiciel est déjà assigné à ce client', 'error');
      } else {
        showToast('Erreur lors de l\'assignation', 'error');
      }
    }
  }

  async function handleUnassign(assignmentId: string) {
    try {
      if (!selectedClient) return;

      const { error } = await supabase
        .from('client_software')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      showToast('Logiciel retiré du client', 'success');
      setDeleteConfirm(null);
      await refreshClientData(selectedClient.id);
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find((c) => c.value === category)?.label || category;
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: Record<string, string> = {
      comptabilite: 'bg-teal-100 text-teal-800',
      paie: 'bg-green-100 text-green-800',
      facturation: 'bg-amber-100 text-amber-800',
      gestion: 'bg-cyan-100 text-cyan-800',
      crm: 'bg-pink-100 text-pink-800',
      autre: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const getCategoryChipActiveColor = (category: string) => {
    const colors: Record<string, string> = {
      comptabilite: 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-300',
      paie: 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/40 dark:border-green-700 dark:text-green-300',
      facturation: 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-300',
      gestion: 'bg-cyan-50 border-cyan-300 text-cyan-700 dark:bg-cyan-900/40 dark:border-cyan-700 dark:text-cyan-300',
      crm: 'bg-pink-50 border-pink-300 text-pink-700 dark:bg-pink-900/40 dark:border-pink-700 dark:text-pink-300',
      autre: 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300',
    };
    return colors[category] || 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300';
  };

  const activeFilterCount = (softwareFilter ? 1 : 0) + (categoryFilter ? 1 : 0);

  const clearAllFilters = () => {
    setSearchTerm('');
    setSoftwareFilter('');
    setCategoryFilter('');
  };

  const getAvailableSoftwareForClient = (client: ClientWithSoftware) => {
    const assignedIds = client.client_software.map((cs) => cs.software_id);
    return availableSoftware.filter((s) => !assignedIds.includes(s.id));
  };

  function openManageModal(client: ClientWithSoftware) {
    setSelectedClient(client);
    setShowManageModal(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Logiciels</h1>
          <p className="text-gray-600 mt-1">
            Vue d'ensemble des logiciels utilisés par vos clients
          </p>
        </div>
        <Link to="/settings">
          <Button variant="secondary">
            <Settings className="w-4 h-4 mr-2" />
            Gérer les logiciels
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="py-4 px-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Input
                type="text"
                placeholder="Rechercher un client ou un logiciel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search className="w-5 h-5" />}
                className="py-2.5 text-base"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-300'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filtres
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-600 text-white text-xs font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {filteredClients.length} client{filteredClients.length > 1 ? 's' : ''}
            </span>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logiciel</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSoftwareFilter('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      !softwareFilter
                        ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-300'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    Tous
                  </button>
                  <button
                    onClick={() => setSoftwareFilter(softwareFilter === '__none__' ? '' : '__none__')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      softwareFilter === '__none__'
                        ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-900/40 dark:border-orange-700 dark:text-orange-300'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    Non affecté
                  </button>
                  {availableSoftware.map((sw) => (
                    <button
                      key={sw.id}
                      onClick={() => setSoftwareFilter(softwareFilter === sw.id ? '' : sw.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        softwareFilter === sw.id
                          ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-300'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {sw.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Catégorie</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCategoryFilter('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      !categoryFilter
                        ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-300'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    Toutes
                  </button>
                  <button
                    onClick={() => setCategoryFilter(categoryFilter === '__none__' ? '' : '__none__')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      categoryFilter === '__none__'
                        ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-900/40 dark:border-orange-700 dark:text-orange-300'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    Non affecté
                  </button>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategoryFilter(categoryFilter === cat.value ? '' : cat.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        categoryFilter === cat.value
                          ? getCategoryChipActiveColor(cat.value)
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {(searchTerm || softwareFilter || categoryFilter) && (
                <div className="flex justify-end">
                  <button
                    onClick={clearAllFilters}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <p className="mt-2 text-gray-600 dark:text-gray-400">Chargement...</p>
            </div>
          ) : (
            <>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SIRET
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Logiciels
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredClients.map((client) => (
                      <tr key={client.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Building2 className="w-5 h-5 text-gray-400 mr-3" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {client.nom_entreprise}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {client.siret || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {client.client_software.length === 0 ? (
                              <span className="text-sm text-gray-400 italic">
                                Aucun logiciel
                              </span>
                            ) : (
                              client.client_software.map((cs) => (
                                <Badge
                                  key={cs.id}
                                  className={getCategoryBadgeColor(cs.software.category)}
                                >
                                  {cs.software.name}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openManageModal(client)}
                          >
                            <Package className="w-4 h-4 mr-2" />
                            Gérer
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredClients.length === 0 && (
                  <div className="text-center py-12">
                    <Package className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      Aucun client trouvé
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {searchTerm || softwareFilter || categoryFilter
                        ? 'Aucun résultat ne correspond à votre recherche'
                        : 'Aucun client actif dans votre cabinet'}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={`Assigner un logiciel à ${selectedClient?.nom_entreprise}`}
      >
        <div className="space-y-4">
          <SearchableSelect
            label="Logiciel"
            value={formData.software_id}
            onChange={(val) =>
              setFormData({ ...formData, software_id: val })
            }
            placeholder="Rechercher un logiciel..."
            required
            options={
              selectedClient
                ? getAvailableSoftwareForClient(selectedClient).map((software) => ({
                    value: software.id,
                    label: software.name,
                    subtitle: getCategoryLabel(software.category),
                  }))
                : []
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Date de début"
              type="date"
              value={formData.start_date}
              onChange={(e) =>
                setFormData({ ...formData, start_date: e.target.value })
              }
            />
            <Input
              label="Date de fin"
              type="date"
              value={formData.end_date}
              onChange={(e) =>
                setFormData({ ...formData, end_date: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Notes optionnelles..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleAssign}>Assigner</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        title={`Gérer les logiciels - ${selectedClient?.nom_entreprise}`}
      >
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Logiciels assignés
              </h3>
              <Button
                size="sm"
                onClick={() => {
                  setShowManageModal(false);
                  openAssignModal(selectedClient!);
                }}
                disabled={
                  !selectedClient ||
                  getAvailableSoftwareForClient(selectedClient).length === 0
                }
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>

            {selectedClient?.client_software.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Package className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  Aucun logiciel assigné
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedClient?.client_software.map((cs) => (
                  <div
                    key={cs.id}
                    className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">
                            {cs.software.name}
                          </span>
                          <Badge
                            className={getCategoryBadgeColor(cs.software.category)}
                          >
                            {getCategoryLabel(cs.software.category)}
                          </Badge>
                        </div>
                        {(cs.start_date || cs.end_date) && (
                          <div className="flex items-center text-xs text-gray-500 mb-1">
                            <Calendar className="w-3 h-3 mr-1" />
                            {cs.start_date && (
                              <span>
                                Depuis{' '}
                                {new Date(cs.start_date).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                            {cs.end_date && (
                              <span>
                                {' '}
                                - Jusqu'au{' '}
                                {new Date(cs.end_date).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                          </div>
                        )}
                        {cs.notes && (
                          <p className="text-sm text-gray-600 mt-2">{cs.notes}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setDeleteConfirm(cs.id)}
                        className="ml-4 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowManageModal(false)}>
              Fermer
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleUnassign(deleteConfirm)}
        title="Retirer le logiciel"
        message="Êtes-vous sûr de vouloir retirer ce logiciel du client ? Cette action est irréversible."
        confirmText="Retirer"
        cancelText="Annuler"
      />
    </div>
  );
}
