import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit2, Trash2, FileText, Search } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  loadTaskTemplates,
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
  loadTaskCategories,
  TaskTemplateWithCategory,
} from '../../lib/taskService';
import { Database } from '../../types/database';
import { codeErreur } from '../../lib/erreurs';

type TaskTemplate = Database['public']['Tables']['task_templates']['Row'];
type TaskCategory = Database['public']['Tables']['task_categories']['Row'];

export function SettingsTaskTemplates() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<TaskTemplateWithCategory[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<TaskTemplateWithCategory[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    priorite: 'moyenne',
    category_id: '',
    estimated_hours: '',
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, [profile]);

  useEffect(() => {
    filterTemplates();
  }, [templates, searchTerm, filterCategory]);

  async function loadData() {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      const [templatesData, categoriesData] = await Promise.all([
        loadTaskTemplates(),
        loadTaskCategories(true),
      ]);
      setTemplates(templatesData);
      setCategories(categoriesData);
    } catch {
      showToast('Erreur lors du chargement des modèles', 'error');
      setTemplates([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }

  function filterTemplates() {
    let filtered = [...templates];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.titre.toLowerCase().includes(search) ||
          t.description?.toLowerCase().includes(search)
      );
    }

    if (filterCategory) {
      filtered = filtered.filter((t) => t.category_id === filterCategory);
    }

    setFilteredTemplates(filtered);
  }

  function handleOpenModal(template?: TaskTemplate) {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        titre: template.titre,
        description: template.description || '',
        // DEFAULT sans NOT NULL en base : mêmes valeurs de repli que la
        // branche « nouveau modele ».
        priorite: template.priorite ?? 'moyenne',
        category_id: template.category_id || '',
        estimated_hours: template.estimated_hours?.toString() || '',
        is_active: template.is_active ?? true,
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        titre: '',
        description: '',
        priorite: 'moyenne',
        category_id: '',
        estimated_hours: '',
        is_active: true,
      });
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    try {
      const templateData = {
        ...formData,
        titre: formData.titre.trim(),
        description: formData.description.trim() || null,
        category_id: formData.category_id || null,
        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
      };

      if (editingTemplate) {
        await updateTaskTemplate(editingTemplate.id, templateData);
        showToast('Modèle mis à jour', 'success');
      } else {
        const position = templates.length;
        await createTaskTemplate({
          ...templateData,
          position,
        });
        showToast('Modèle créé', 'success');
      }
      setShowModal(false);
      loadData();
    } catch {
      showToast(
        editingTemplate ? 'Erreur lors de la mise à jour' : 'Erreur lors de la création',
        'error'
      );
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTaskTemplate(id);
      showToast('Modèle supprimé', 'success');
      setDeleteConfirm(null);
      loadData();
    } catch (error) {
      if (codeErreur(error) === '23503') {
        showToast('Impossible de supprimer : des tâches utilisent ce modèle', 'error');
      } else {
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  }

  function getPriorityVariant(priorite: string) {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
      basse: 'default',
      moyenne: 'info',
      haute: 'warning',
      urgente: 'danger',
    };
    return variants[priorite] || 'default';
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
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
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
          <h2 className="text-2xl font-bold text-gray-900">Modèles de tâches</h2>
          <p className="text-gray-600 mt-1">
            Créez des modèles réutilisables pour gagner du temps
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau modèle
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            placeholder="Rechercher un modèle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <Select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          options={[
            { value: '', label: 'Toutes les catégories' },
            ...categories.map((c) => ({ value: c.id, label: c.nom })),
          ]}
        />
      </div>

      {filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 font-medium mb-2">
              {templates.length === 0 ? 'Aucun modèle' : 'Aucun résultat'}
            </p>
            <p className="text-gray-500 mb-4">
              {templates.length === 0
                ? 'Créez votre premier modèle de tâche pour gagner du temps'
                : 'Aucun modèle ne correspond à vos critères de recherche'}
            </p>
            {templates.length === 0 && (
              <Button onClick={() => handleOpenModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Créer un modèle
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Titre</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Catégorie</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Priorité</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Durée estimée</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Statut</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((template) => (
                    <tr key={template.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium text-gray-900">{template.titre}</div>
                          {template.description && (
                            <div className="text-sm text-gray-600 line-clamp-1">
                              {template.description}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {template.task_categories ? (
                          <Badge
                            style={{
                              backgroundColor: template.task_categories.couleur,
                              color: '#fff',
                            }}
                          >
                            {template.task_categories.nom}
                          </Badge>
                        ) : (
                          <span className="text-sm text-gray-500">Aucune</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={getPriorityVariant(template.priorite ?? 'moyenne')}>
                          {template.priorite}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {template.estimated_hours ? (
                          <span className="text-sm text-gray-900">{template.estimated_hours}h</span>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={template.is_active ? 'success' : 'default'}>
                          {template.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenModal(template)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(template.id)}
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
        title={editingTemplate ? 'Modifier le modèle' : 'Nouveau modèle'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Titre du modèle"
            value={formData.titre}
            onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
            required
            placeholder="Ex: Déclaration TVA mensuelle"
          />

          <Textarea
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            placeholder="Décrivez les étapes ou objectifs de cette tâche..."
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Priorité par défaut"
              value={formData.priorite}
              onChange={(e) => setFormData({ ...formData, priorite: e.target.value })}
              options={[
                { value: 'basse', label: 'Basse' },
                { value: 'moyenne', label: 'Moyenne' },
                { value: 'haute', label: 'Haute' },
                { value: 'urgente', label: 'Urgente' },
              ]}
            />

            <Select
              label="Catégorie"
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              options={[
                { value: '', label: 'Aucune catégorie' },
                ...categories.map((c) => ({ value: c.id, label: c.nom })),
              ]}
            />
          </div>

          <Input
            label="Durée estimée (heures)"
            type="number"
            step="0.5"
            min="0"
            value={formData.estimated_hours}
            onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
            placeholder="Ex: 2.5"
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">
              Modèle actif (visible lors de la création de tâches)
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button type="submit">
              {editingTemplate ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Supprimer le modèle"
        message="Êtes-vous sûr de vouloir supprimer ce modèle ? Les tâches créées à partir de ce modèle ne seront pas affectées."
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}
