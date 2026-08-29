import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Star, GripVertical } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { messageErreur } from '../../lib/erreurs';
import {
  type AgoAvancementStatus,
  type AgoStatusColor,
  AGO_STATUS_COLORS,
  getAgoStatusBadgeClass,
  listAgoStatuses,
  createAgoStatus,
  updateAgoStatus,
  deleteAgoStatus,
} from '../../lib/agoAvancementService';

export function SettingsAGOStatuses() {
  const { profile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const canEdit = isAdmin;

  const [statuses, setStatuses] = useState<AgoAvancementStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AgoAvancementStatus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState<{ label: string; color: AgoStatusColor; is_default: boolean }>({
    label: '',
    color: 'gray',
    is_default: false,
  });

  useEffect(() => { loadData(); }, [profile]);

  async function loadData() {
    if (!profile) { setLoading(false); return; }
    try {
      const data = await listAgoStatuses();
      setStatuses(data);
    } catch {
      showToast('Erreur lors du chargement', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ label: '', color: 'gray', is_default: false });
    setShowModal(true);
  }

  function openEdit(status: AgoAvancementStatus) {
    setEditing(status);
    setForm({ label: status.label, color: status.color as AgoStatusColor, is_default: status.is_default });
    setShowModal(true);
  }

  async function handleSave() {
    if (!profile || !form.label.trim()) return;
    try {
      if (editing) {
        await updateAgoStatus(editing.id, {
          label: form.label.trim(),
          color: form.color,
          is_default: form.is_default,
        });
        showToast('Statut mis a jour', 'success');
      } else {
        const maxPos = statuses.reduce((m, s) => Math.max(m, s.position), -1);
        await createAgoStatus({
          label: form.label.trim(),
          color: form.color,
          position: maxPos + 1,
          is_default: form.is_default,
        });
        showToast('Statut cree', 'success');
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      if (messageErreur(err, '').includes('duplicate')) {
        showToast('Ce libelle existe deja', 'error');
      } else {
        showToast('Erreur lors de la sauvegarde', 'error');
      }
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAgoStatus(deleteTarget);
      showToast('Statut supprime', 'success');
      setDeleteTarget(null);
      await loadData();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  async function handleSetDefault(id: string) {
    if (!profile) return;
    try {
      await updateAgoStatus(id, { is_default: true });
      await loadData();
    } catch {
      showToast('Erreur', 'error');
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0 || !profile) return;
    const items = [...statuses];
    const prev = items[index - 1];
    const curr = items[index];
    try {
      await updateAgoStatus(prev.id, { position: curr.position });
      await updateAgoStatus(curr.id, { position: prev.position });
      await loadData();
    } catch {
      showToast('Erreur', 'error');
    }
  }

  async function handleMoveDown(index: number) {
    if (index === statuses.length - 1 || !profile) return;
    const items = [...statuses];
    const next = items[index + 1];
    const curr = items[index];
    try {
      await updateAgoStatus(next.id, { position: curr.position });
      await updateAgoStatus(curr.id, { position: next.position });
      await loadData();
    } catch {
      showToast('Erreur', 'error');
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">
          Chargement...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Statuts d'avancement AGO
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Definissez les etats d'avancement pour le suivi des assemblees generales
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Ajouter
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {statuses.length === 0 ? (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400">
              Aucun statut configure
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {statuses.map((status, idx) => (
                <div key={status.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  {canEdit && (
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
                      >
                        <GripVertical className="w-3.5 h-3.5 rotate-180" />
                      </button>
                      <button
                        onClick={() => handleMoveDown(idx)}
                        disabled={idx === statuses.length - 1}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getAgoStatusBadgeClass(status.color)}`}>
                    {status.label}
                  </span>

                  {status.is_default && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <Star className="w-3 h-3 fill-current" />
                      Defaut
                    </span>
                  )}

                  <div className="flex-1" />

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      {!status.is_default && (
                        <button
                          onClick={() => handleSetDefault(status.id)}
                          className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors"
                          title="Definir par defaut"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(status)}
                        className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(status.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <Modal
          isOpen
          onClose={() => setShowModal(false)}
          title={editing ? 'Modifier le statut' : 'Nouveau statut'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Libelle
              </label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex: En cours"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Couleur
              </label>
              <div className="grid grid-cols-5 gap-2">
                {AGO_STATUS_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, color: c.value })}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs transition-all ${
                      form.color === c.value
                        ? 'border-teal-500 ring-2 ring-teal-200 dark:ring-teal-800'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${c.dotClass}`} />
                    <span className="text-gray-700 dark:text-gray-300">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Statut par defaut pour les nouveaux exercices
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={!form.label.trim()}>
                {editing ? 'Enregistrer' : 'Creer'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { handleDelete(); }}
        title="Supprimer ce statut ?"
        message="Les clients utilisant ce statut n'auront plus d'avancement attribue pour les exercices concernes."
        confirmText="Supprimer"
        variant="danger"
      />
    </div>
  );
}
