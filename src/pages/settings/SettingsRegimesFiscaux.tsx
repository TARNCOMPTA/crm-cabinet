import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Landmark } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/database';

/**
 * Exactement la projection selectionnee. Ecrite a la main, elle donnait
 * `description` et `is_active` non nullables, ce que la table ne garantit pas.
 */
type RegimeFiscalRow = Pick<
  Database['public']['Tables']['regimes_fiscaux']['Row'],
  'id' | 'value' | 'label' | 'description' | 'position' | 'is_active' | 'created_at'
>;

export function SettingsRegimesFiscaux() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [regimes, setRegimes] = useState<RegimeFiscalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRegime, setEditingRegime] = useState<RegimeFiscalRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    value: '',
    label: '',
    description: '',
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
      const { data, error } = await supabase
        .from('regimes_fiscaux')
        .select('id, value, label, description, position, is_active, created_at')
        .order('position');

      if (error) throw error;
      setRegimes(data || []);
    } catch (error) {
      showToast('Erreur lors du chargement des regimes fiscaux', 'error');
      setRegimes([]);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenModal(regime?: RegimeFiscalRow) {
    if (regime) {
      setEditingRegime(regime);
      setFormData({
        value: regime.value,
        label: regime.label,
        description: regime.description,
        is_active: regime.is_active,
      });
    } else {
      setEditingRegime(null);
      setFormData({
        value: '',
        label: '',
        description: '',
        is_active: true,
      });
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const trimmedValue = formData.value.trim().toUpperCase();
    const trimmedLabel = formData.label.trim();

    if (!trimmedValue || !trimmedLabel) {
      showToast('Le code et le libelle sont obligatoires', 'error');
      return;
    }

    try {
      if (editingRegime) {
        const { error } = await supabase
          .from('regimes_fiscaux')
          .update({
            value: trimmedValue,
            label: trimmedLabel,
            description: formData.description.trim(),
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingRegime.id);

        if (error) throw error;
        showToast('Regime fiscal mis a jour', 'success');
      } else {
        const position = regimes.length;
        const { error } = await supabase.from('regimes_fiscaux').insert({
          value: trimmedValue,
          label: trimmedLabel,
          description: formData.description.trim(),
          is_active: formData.is_active,
          position,
        });

        if (error) throw error;
        showToast('Regime fiscal cree', 'success');
      }

      setShowModal(false);
      loadData();
    } catch (error: any) {
      if (error?.code === '23505') {
        showToast('Ce code de regime existe deja', 'error');
      } else {
        showToast(
          editingRegime ? 'Erreur lors de la mise a jour' : 'Erreur lors de la creation',
          'error'
        );
      }
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('regimes_fiscaux')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast('Regime fiscal supprime', 'success');
      setDeleteConfirm(null);
      loadData();
    } catch (error: any) {
      if (error?.code === '23503') {
        showToast('Impossible de supprimer : ce regime est utilise par des clients', 'error');
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
          <Landmark className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Aucun cabinet assigne</p>
          <p className="text-gray-500">
            Contactez un administrateur pour obtenir l'acces a un cabinet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Regimes fiscaux</h2>
          <p className="text-gray-600 mt-1">
            Gerez les regimes fiscaux disponibles pour vos clients (BIC, BNC, BA, etc.)
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau regime
        </Button>
      </div>

      {regimes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Landmark className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 font-medium mb-2">Aucun regime fiscal</p>
            <p className="text-gray-500 mb-4">
              Creez votre premier regime fiscal pour vos clients
            </p>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Creer un regime
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
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Code</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Libelle</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Description</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Statut</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {regimes.map((regime) => (
                    <tr key={regime.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <Badge className="bg-teal-100 text-teal-800 font-mono">
                          {regime.value}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-gray-900">{regime.label}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600">{regime.description || '-'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={regime.is_active ? 'success' : 'default'}>
                          {regime.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenModal(regime)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(regime.id)}
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
        title={editingRegime ? 'Modifier le regime fiscal' : 'Nouveau regime fiscal'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Code (ex: BIC, BNC, BA...)"
            value={formData.value}
            onChange={(e) => setFormData({ ...formData, value: e.target.value.toUpperCase() })}
            required
            placeholder="BIC"
            className="font-mono uppercase"
          />

          <Input
            label="Libelle"
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            required
            placeholder="BIC"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Benefices Industriels et Commerciaux"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="regime_is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
            />
            <label htmlFor="regime_is_active" className="text-sm text-gray-700">
              Regime actif
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button type="submit">
              {editingRegime ? 'Mettre a jour' : 'Creer'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Supprimer le regime fiscal"
        message="Etes-vous sur de vouloir supprimer ce regime fiscal ? Les clients utilisant ce regime conserveront leur valeur actuelle."
        variant="danger"
        confirmText="Supprimer"
      />
    </div>
  );
}
