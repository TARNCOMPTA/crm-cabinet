import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../contexts/ToastContext';
import { Plus, Search, CreditCard as Edit, Trash2, Package } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { codeErreur } from '../../lib/erreurs';

interface Software {
  id: string;
  name: string;
  category: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'comptabilite', label: 'Comptabilité' },
  { value: 'paie', label: 'Paie' },
  { value: 'facturation', label: 'Facturation' },
  { value: 'gestion', label: 'Gestion' },
  { value: 'crm', label: 'CRM' },
  { value: 'autre', label: 'Autre' },
];

export function SettingsSoftware() {
  const { showToast } = useToast();
  const [software, setSoftware] = useState<Software[]>([]);
  const [filteredSoftware, setFilteredSoftware] = useState<Software[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingSoftware, setEditingSoftware] = useState<Software | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'comptabilite',
    description: '',
    is_active: true,
  });

  useEffect(() => {
    loadSoftware();
  }, []);

  useEffect(() => {
    filterSoftware();
  }, [software, searchTerm, categoryFilter]);

  async function loadSoftware() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('software')
        .select('id, name, category, description, is_active, created_at, updated_at')
        .order('name');

      if (error) throw error;
      setSoftware(data || []);
    } catch {
      showToast('Erreur lors du chargement des logiciels', 'error');
    } finally {
      setLoading(false);
    }
  }

  function filterSoftware() {
    let filtered = [...software];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(term) ||
          s.description?.toLowerCase().includes(term)
      );
    }

    if (categoryFilter) {
      filtered = filtered.filter((s) => s.category === categoryFilter);
    }

    setFilteredSoftware(filtered);
  }

  function openCreateModal() {
    setEditingSoftware(null);
    setFormData({
      name: '',
      category: 'comptabilite',
      description: '',
      is_active: true,
    });
    setShowModal(true);
  }

  function openEditModal(software: Software) {
    setEditingSoftware(software);
    setFormData({
      name: software.name,
      category: software.category,
      description: software.description || '',
      is_active: software.is_active,
    });
    setShowModal(true);
  }

  async function handleSubmit() {
    try {
      if (!formData.name || !formData.category) {
        showToast('Veuillez remplir tous les champs requis', 'error');
        return;
      }

      if (editingSoftware) {
        const { error } = await supabase
          .from('software')
          .update({
            name: formData.name,
            category: formData.category,
            description: formData.description || null,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingSoftware.id);

        if (error) throw error;
        showToast('Logiciel mis à jour', 'success');
      } else {
        const { error } = await supabase.from('software').insert({
          ...formData,
          description: formData.description || null,
        });

        if (error) throw error;
        showToast('Logiciel créé', 'success');
      }

      setShowModal(false);
      loadSoftware();
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from('software').delete().eq('id', id);

      if (error) throw error;
      showToast('Logiciel supprimé', 'success');
      setDeleteConfirm(null);
      loadSoftware();
    } catch (error) {
      if (codeErreur(error) === '23503') {
        showToast(
          'Impossible de supprimer : ce logiciel est assigné à des clients',
          'error'
        );
      } else {
        showToast('Erreur lors de la suppression', 'error');
      }
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
      gestion: 'bg-gray-600 text-white',
      crm: 'bg-pink-100 text-pink-800',
      autre: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Logiciels du Cabinet</h2>
          <p className="text-gray-600 mt-1">
            Gérer les logiciels disponibles dans votre cabinet
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau logiciel
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="text"
                  placeholder="Rechercher un logiciel..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-48"
            >
              <option value="">Toutes catégories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <p className="mt-2 text-gray-600">Chargement...</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {filteredSoftware.length} logiciel
                  {filteredSoftware.length > 1 ? 's' : ''}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nom
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Catégorie
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSoftware.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Package className="w-5 h-5 text-gray-400 mr-2" />
                            <div className="text-sm font-medium text-gray-900">
                              {s.name}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge className={getCategoryBadgeColor(s.category)}>
                            {getCategoryLabel(s.category)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600 max-w-xs truncate">
                            {s.description || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge
                            className={
                              s.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }
                          >
                            {s.is_active ? 'Actif' : 'Inactif'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openEditModal(s)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeleteConfirm(s.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredSoftware.length === 0 && (
                  <div className="text-center py-12">
                    <Package className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      Aucun logiciel
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {searchTerm || categoryFilter
                        ? 'Aucun résultat ne correspond à votre recherche'
                        : 'Commencez par créer un nouveau logiciel'}
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
        title={editingSoftware ? 'Modifier le logiciel' : 'Nouveau logiciel'}
      >
        <div className="space-y-4">
          <Input
            label="Nom du logiciel"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Ex: Sage, Cegid, QuadraCompta..."
            required
          />

          <Select
            label="Catégorie"
            value={formData.category}
            onChange={(e) =>
              setFormData({ ...formData, category: e.target.value })
            }
            required
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </Select>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Description optionnelle du logiciel..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              rows={3}
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
            />
            <label
              htmlFor="is_active"
              className="ml-2 block text-sm text-gray-900"
            >
              Logiciel actif
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit}>
              {editingSoftware ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Supprimer le logiciel"
        message="Êtes-vous sûr de vouloir supprimer ce logiciel ? Cette action est irréversible et peut échouer s'il est assigné à des clients."
        confirmText="Supprimer"
        cancelText="Annuler"
      />
    </div>
  );
}
