import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Badge } from '../ui/Badge';
import {
  Clock,
  Mail,
  Phone,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
  User,
} from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import {
  RelanceInvoiceWithClient,
  RelanceHistoryWithUser,
  loadRelanceHistory,
  enregistrerRelance,
  deleteRelanceHistory,
} from '../../lib/relanceService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  invoice: RelanceInvoiceWithClient | null;
  onRelanceAdded: () => void;
}

const TYPE_OPTIONS = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'telephone', label: 'Telephone', icon: Phone },
  { value: 'courrier', label: 'Courrier', icon: FileText },
  { value: 'autre', label: 'Autre', icon: MoreHorizontal },
];

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function getTypeIcon(type: string) {
  const opt = TYPE_OPTIONS.find((t) => t.value === type);
  return opt?.icon || MoreHorizontal;
}

function getTypeBadgeVariant(type: string) {
  switch (type) {
    case 'email': return 'info' as const;
    case 'telephone': return 'success' as const;
    case 'courrier': return 'warning' as const;
    default: return 'default' as const;
  }
}

export function RelanceHistoryModal({ isOpen, onClose, invoice, onRelanceAdded }: Props) {
  const { profile } = useAuth();
  const [history, setHistory] = useState<RelanceHistoryWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeRelance, setTypeRelance] = useState('email');
  const [commentaire, setCommentaire] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !invoice) return;
    loadHistory();
  }, [isOpen, invoice?.id]);

  async function loadHistory() {
    if (!invoice) return;
    setLoading(true);
    try {
      const data = await loadRelanceHistory(invoice.id);
      setHistory(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !profile || !profile?.id) return;

    setSaving(true);
    try {
      await enregistrerRelance(
        invoice.id,
        profile.id,
        typeRelance,
        commentaire
      );
      setShowForm(false);
      setTypeRelance('email');
      setCommentaire('');
      await loadHistory();
      onRelanceAdded();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRelanceHistory(id);
      await loadHistory();
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  }

  if (!invoice) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Historique des relances"
      size="lg"
    >
      <div className="space-y-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 dark:text-white">
              {invoice.clients.nom_entreprise}
            </p>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(invoice.montant)}
            </span>
          </div>
          {invoice.numero_facture && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {invoice.numero_facture}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-500">
            {invoice.nombre_relances} relance{invoice.nombre_relances > 1 ? 's' : ''} effectuee{invoice.nombre_relances > 1 ? 's' : ''}
          </p>
        </div>

        {!showForm && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm(true)}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-1" />
            Enregistrer une relance
          </Button>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="border border-teal-200 dark:border-teal-800 rounded-lg p-4 space-y-3 bg-teal-50/50 dark:bg-teal-900/20"
          >
            <Select
              label="Type de relance"
              value={typeRelance}
              onChange={(e) => setTypeRelance(e.target.value)}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>

            <Textarea
              label="Commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              placeholder="Details de la relance effectuee..."
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setCommentaire('');
                }}
              >
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-1">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Historique
          </h4>

          {loading && (
            <div className="text-center py-6 text-gray-500">Chargement...</div>
          )}

          {!loading && history.length === 0 && (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aucune relance enregistree</p>
            </div>
          )}

          {!loading && history.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {history.map((entry) => {
                const TypeIcon = getTypeIcon(entry.type_relance);
                return (
                  <div
                    key={entry.id}
                    className="relative border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-700">
                          <TypeIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={getTypeBadgeVariant(entry.type_relance)}>
                              {TYPE_OPTIONS.find((t) => t.value === entry.type_relance)?.label || entry.type_relance}
                            </Badge>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDateTime(entry.date_relance)}
                            </span>
                          </div>
                          {entry.profiles && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <User className="w-3 h-3" />
                              {entry.profiles.prenom} {entry.profiles.nom}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setDeletingId(entry.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {entry.commentaire && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 pl-9">
                        {entry.commentaire}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && handleDelete(deletingId)}
        title="Supprimer cette relance"
        message="Voulez-vous vraiment supprimer cet enregistrement de relance ?"
        confirmText="Supprimer"
        variant="danger"
      />
    </Modal>
  );
}
