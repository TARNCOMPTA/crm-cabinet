import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Tag } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  loadTaskCategories,
  createTaskCategory,
  updateTaskCategory,
  deleteTaskCategory,
} from '../../lib/taskService';
import { Database } from '../../types/database';
import { codeErreur } from '../../lib/erreurs';

type TaskCategory = Database['public']['Tables']['task_categories']['Row'];

/**
 * Couleurs proposées, prises dans la charte du cabinet.
 *
 * Elles restent volontairement distinctes les unes des autres : leur rôle est
 * de séparer des catégories d'un coup d'œil, pas de décliner l'accent. Les
 * catégories déjà créées gardent la couleur choisie à l'époque — seules les
 * nouvelles piochent ici.
 */
const PREDEFINED_COLORS = [
  { value: '#7C2D5E', label: 'Bordeaux' },
  { value: '#3F7293', label: 'Bleu ardoise' },
  { value: '#3F7D54', label: 'Vert' },
  { value: '#B5781F', label: 'Doré' },
  { value: '#B3402F', label: 'Rouge' },
  { value: '#6B4A7E', label: 'Prune' },
  { value: '#B04A80', label: 'Rose ancien' },
  { value: '#7A6F74', label: 'Gris chaud' },
];

const ICON_OPTIONS = [
  'Tag',
  'Folder',
  'Briefcase',
  'FileText',
  'Calculator',
  'Scale',
  'Users',
  'TrendingUp',
  'Package',
  'Settings',
];

export function SettingsTaskCategories() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TaskCategory | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nom: '',
    couleur: '#3B82F6',
    icone: 'Tag',
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, [profile]);

  async function loadData() {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      const data = await loadTaskCategories();
      setCategories(data);
    } catch {
      showToast('Erreur lors du chargement des catégories', 'error');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenModal(category?: TaskCategory) {
    if (category) {
      setEditingCategory(category);
      setFormData({
        nom: category.nom,
        // Les trois colonnes ont un DEFAULT en base mais pas de NOT NULL : le
        // type les donne nullables. On retombe sur les memes valeurs par defaut
        // que la branche « nouvelle categorie » ci-dessous.
        couleur: category.couleur ?? '#3B82F6',
        icone: category.icone ?? 'Tag',
        is_active: category.is_active ?? true,
      });
    } else {
      setEditingCategory(null);
      setFormData({
        nom: '',
        couleur: '#3B82F6',
        icone: 'Tag',
        is_active: true,
      });
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    try {
      if (editingCategory) {
        await updateTaskCategory(editingCategory.id, {
          ...formData,
          nom: formData.nom.trim(),
        });
        showToast('Catégorie mise à jour', 'success');
      } else {
        const position = categories.length;
        await createTaskCategory({
          ...formData,
          nom: formData.nom.trim(),
          position,
        });
        showToast('Catégorie créée', 'success');
      }
      setShowModal(false);
      loadData();
    } catch {
      showToast(
        editingCategory ? 'Erreur lors de la mise à jour' : 'Erreur lors de la création',
        'error'
      );
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTaskCategory(id);
      showToast('Catégorie supprimée', 'success');
      setDeleteConfirm(null);
      loadData();
    } catch (error) {
      if (codeErreur(error) === '23503') {
        showToast('Impossible de supprimer : des tâches ou templates utilisent cette catégorie', 'error');
      } else {
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Tag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Aucun cabinet assigné</p>
          <p className="text-gray-500">
            Contactez un administrateur pour obtenir l'accès à un cabinet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Catégories de tâches</h2>
          <p className="text-gray-600 mt-1">
            Gérez les catégories pour organiser vos tâches
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle catégorie
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 font-medium mb-2">Aucune catégorie</p>
            <p className="text-gray-500 mb-4">
              Créez votre première catégorie pour organiser vos tâches
            </p>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Créer une catégorie
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Nom</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Couleur</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Icône</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Statut</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Badge style={{ backgroundColor: category.couleur ?? undefined, color: '#fff' }}>
                            {category.nom}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full border border-gray-300"
                            style={{ backgroundColor: category.couleur ?? undefined }}
                          />
                          <span className="text-sm text-gray-600">{category.couleur}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-900">{category.icone}</span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={category.is_active ? 'success' : 'default'}>
                          {category.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenModal(category)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(category.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom de la catégorie"
            value={formData.nom}
            onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
            required
            placeholder="Ex: Comptabilité, Juridique, etc."
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Couleur
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PREDEFINED_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, couleur: color.value })}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    formData.couleur === color.value
                      ? 'border-teal-600 ring-2 ring-teal-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div
                    className="w-full h-8 rounded"
                    style={{ backgroundColor: color.value }}
                  />
                  <p className="text-xs text-gray-600 mt-1 text-center">{color.label}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Icône (nom Lucide React)
            </label>
            <select
              value={formData.icone}
              onChange={(e) => setFormData({ ...formData, icone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {ICON_OPTIONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">
              Catégorie active
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button type="submit">
              {editingCategory ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Supprimer la catégorie"
        message="Êtes-vous sûr de vouloir supprimer cette catégorie ? Les tâches et templates associés ne seront pas supprimés mais n'auront plus de catégorie."
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}
