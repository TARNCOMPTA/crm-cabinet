import { useState, useEffect, useRef } from 'react';
import {
  ExternalLink,
  Check,
  User,
  Clock,
  Paperclip,
  Download,
  Trash2,
  Loader2,
  FileText,
  Image,
  Calendar,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { BilanDAS2Panel } from './BilanDAS2Panel';
import {
  toggleChecklistItem,
  updateCardNotes,
  updateCardAssignee,
  updateCardMoisTraites,
  moveCard,
  uploadChecklistAttachment,
  deleteChecklistAttachment,
  downloadChecklistAttachment,
} from '../../lib/bilanService';
import type { BilanCardWithDetails, BilanColumn } from '../../types/database';

const MOIS_LABELS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

interface Props {
  card: BilanCardWithDetails | null;
  columns: BilanColumn[];
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  das2Enabled?: boolean;
}

const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png,image/gif,image/webp';

export function BilanCardDetailModal({ card, columns, isOpen, onClose, onUpdated, das2Enabled }: Props) {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [notes, setNotes] = useState('');
  const [selectedColumn, setSelectedColumn] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [moisTraites, setMoisTraites] = useState<number[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; display_name: string | null; prenom: string | null; nom: string | null }>>([]);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [attachmentsState, setAttachmentsState] = useState<Record<string, Attachment[]>>({});
  const [uploadingItems, setUploadingItems] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (card) {
      setNotes(card.notes || '');
      setSelectedColumn(card.column_id);
      setSelectedAssignee(card.assignee_id || '');
      setMoisTraites(card.mois_traites || []);
      const state: Record<string, boolean> = {};
      const attachState: Record<string, Attachment[]> = {};
      card.checklist_items?.forEach((item) => {
        state[item.id] = item.is_checked;
        attachState[item.id] = (item as any).attachments || [];
      });
      setChecklistState(state);
      setAttachmentsState(attachState);
    }
  }, [card]);

  useEffect(() => {
    if (isOpen && profile) {
      loadUsers();
    }
  }, [isOpen, profile]);

  async function loadUsers() {
    if (!profile) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, prenom, nom')
      .eq('is_active', true)
      .order('nom');
    if (data) setUsers(data);
  }

  async function handleCheckToggle(itemId: string, checked: boolean) {
    if (!user) return;
    setChecklistState((prev) => ({ ...prev, [itemId]: checked }));
    try {
      await toggleChecklistItem(itemId, checked, user.id);
      onUpdated();
    } catch {
      setChecklistState((prev) => ({ ...prev, [itemId]: !checked }));
      showToast('Erreur lors de la mise a jour', 'error');
    }
  }

  async function handleColumnChange(newColumnId: string) {
    if (!card || newColumnId === card.column_id) return;
    setSelectedColumn(newColumnId);
    try {
      await moveCard(card.id, newColumnId, card.position);
      onUpdated();
    } catch {
      setSelectedColumn(card.column_id);
      showToast('Erreur lors du deplacement', 'error');
    }
  }

  async function handleAssigneeChange(newAssigneeId: string) {
    if (!card) return;
    setSelectedAssignee(newAssigneeId);
    try {
      await updateCardAssignee(card.id, newAssigneeId || null);
      onUpdated();
    } catch {
      setSelectedAssignee(card.assignee_id || '');
      showToast('Erreur', 'error');
    }
  }

  async function handleToggleMois(mois: number) {
    if (!card) return;
    const prevMois = [...moisTraites];
    const newMois = moisTraites.includes(mois)
      ? moisTraites.filter((m) => m !== mois)
      : [...moisTraites, mois].sort((a, b) => a - b);
    setMoisTraites(newMois);
    try {
      await updateCardMoisTraites(card.id, newMois);
      onUpdated();
    } catch {
      setMoisTraites(prevMois);
      showToast('Erreur', 'error');
    }
  }

  async function handleSaveNotes() {
    if (!card) return;
    setSaving(true);
    try {
      await updateCardNotes(card.id, notes);
      onUpdated();
      showToast('Notes enregistrees', 'success');
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(itemId: string, files: FileList | null) {
    if (!files || files.length === 0 || !card || !profile || !user) return;
    setUploadingItems((prev) => new Set(prev).add(itemId));
    try {
      for (const file of Array.from(files)) {
        const attachment = await uploadChecklistAttachment(itemId, card.id, file, user.id);
        setAttachmentsState((prev) => ({
          ...prev,
          [itemId]: [...(prev[itemId] || []), attachment as Attachment],
        }));
      }
      onUpdated();
    } catch {
      showToast('Erreur lors du telechargement', 'error');
    } finally {
      setUploadingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      const input = fileInputRefs.current[itemId];
      if (input) input.value = '';
    }
  }

  async function handleDeleteAttachment(itemId: string, attachment: Attachment) {
    try {
      await deleteChecklistAttachment(attachment.id, attachment.storage_path);
      setAttachmentsState((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] || []).filter((a) => a.id !== attachment.id),
      }));
      onUpdated();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  async function handleDownloadAttachment(attachment: Attachment) {
    try {
      await downloadChecklistAttachment(attachment.storage_path, attachment.file_name);
    } catch {
      showToast('Erreur lors du telechargement', 'error');
    }
  }

  if (!card) return null;

  const total = card.checklist_items?.length || 0;
  const checked = Object.values(checklistState).filter(Boolean).length;
  const progress = total > 0 ? Math.round((checked / total) * 100) : 0;

  const progressColor = progress === 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-400' : 'bg-red-400';
  const progressTextColor = progress === 100
    ? 'text-emerald-600 dark:text-emerald-400'
    : progress >= 50
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={card.clients?.nom_entreprise || 'Fiche bilan'} size="lg">
      <div className="space-y-6">
        {/* Meta info */}
        <div className="flex flex-wrap gap-3">
          {card.clients?.siren && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
              <Building2 className="w-3 h-3 text-gray-400" />
              SIREN {card.clients.siren}
            </span>
          )}
          {card.clients?.forme_juridique && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
              {card.clients.forme_juridique}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/30 text-xs font-medium text-teal-700 dark:text-teal-300">
            {card.regime_fiscal}
          </span>
          <a
            href={`/clients/${card.client_id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
          >
            Voir la fiche <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Column / Assignee selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Colonne"
            value={selectedColumn}
            onChange={(e) => handleColumnChange(e.target.value)}
            options={columns.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Collaborateur"
            value={selectedAssignee}
            onChange={(e) => handleAssigneeChange(e.target.value)}
            options={[
              { value: '', label: 'Non assigne' },
              ...users.map((u) => ({
                value: u.id,
                label: u.display_name || `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Utilisateur',
              })),
            ]}
          />
        </div>

        {/* Mois traites grid */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Mois traites</h3>
            </div>
            <span className={`text-xs font-semibold ${
              moisTraites.length === 12 ? 'text-emerald-600 dark:text-emerald-400' :
              moisTraites.length >= 6 ? 'text-amber-600 dark:text-amber-400' :
              'text-gray-500 dark:text-gray-400'
            }`}>{moisTraites.length}/12</span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {MOIS_LABELS.map((label, idx) => {
              const mois = idx + 1;
              const isSelected = moisTraites.includes(mois);
              return (
                <button
                  key={mois}
                  type="button"
                  onClick={() => handleToggleMois(mois)}
                  className={`px-2 py-2 text-xs font-medium rounded-lg border-2 transition-all duration-150 ${
                    isSelected
                      ? 'bg-teal-600 border-teal-600 text-white shadow-sm scale-[1.02]'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-teal-300 dark:hover:border-teal-600 hover:text-teal-700 dark:hover:text-teal-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Checklist section */}
        {total > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Checklist</h3>
              <span className={`text-sm font-semibold ${progressTextColor}`}>
                {checked}/{total} ({progress}%)
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 mb-4 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ease-out ${progressColor}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="space-y-0.5">
              {card.checklist_items
                ?.slice()
                .sort((a, b) => {
                  const posA = a.template?.position ?? 0;
                  const posB = b.template?.position ?? 0;
                  return posA - posB;
                })
                .map((item) => {
                  const itemAttachments = attachmentsState[item.id] || [];
                  const isUploading = uploadingItems.has(item.id);
                  const isChecked = checklistState[item.id];

                  return (
                    <div key={item.id} className="py-2.5 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 group transition-colors">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleCheckToggle(item.id, !isChecked)}
                          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            isChecked
                              ? 'bg-teal-600 border-teal-600 scale-95'
                              : 'border-gray-300 dark:border-gray-600 group-hover:border-teal-400'
                          }`}
                          aria-label={`Cocher ${item.template?.name}`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${isChecked ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                            {item.template?.name || 'Element'}
                          </span>
                          {item.is_checked && item.checked_by && (
                            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                              <User className="w-3 h-3" />
                              <span>{(() => {
                                const u = users.find((usr) => usr.id === item.checked_by);
                                return u ? (u.display_name || `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Utilisateur') : 'Utilisateur';
                              })()}</span>
                              {item.checked_at && (
                                <>
                                  <Clock className="w-3 h-3 ml-1" />
                                  <span>{new Date(item.checked_at).toLocaleDateString('fr-FR')}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {itemAttachments.length > 0 && (
                            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">{itemAttachments.length}</span>
                          )}
                          <button
                            type="button"
                            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                            onClick={() => fileInputRefs.current[item.id]?.click()}
                            disabled={isUploading}
                            title="Joindre un fichier"
                          >
                            {isUploading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Paperclip className="w-4 h-4" />
                            )}
                          </button>
                          <input
                            ref={(el) => { fileInputRefs.current[item.id] = el; }}
                            type="file"
                            accept={ACCEPTED_TYPES}
                            multiple
                            className="hidden"
                            onChange={(e) => handleFileUpload(item.id, e.target.files)}
                          />
                        </div>
                      </div>

                      {itemAttachments.length > 0 && (
                        <div className="ml-8 mt-2 space-y-1.5">
                          {itemAttachments.map((att) => (
                            <div
                              key={att.id}
                              className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-xs group/att"
                            >
                              {att.mime_type.startsWith('image/') ? (
                                <Image className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              )}
                              <span className="truncate text-gray-700 dark:text-gray-300 flex-1 font-medium" title={att.file_name}>
                                {att.file_name}
                              </span>
                              <span className="text-gray-400 dark:text-gray-500 shrink-0">
                                {att.file_size < 1024 * 1024
                                  ? `${Math.round(att.file_size / 1024)} Ko`
                                  : `${(att.file_size / (1024 * 1024)).toFixed(1)} Mo`}
                              </span>
                              <button
                                type="button"
                                className="p-1 rounded-md hover:bg-teal-100 dark:hover:bg-teal-950/30 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                                onClick={() => handleDownloadAttachment(att)}
                                title="Telecharger"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100"
                                onClick={() => handleDeleteAttachment(item.id, att)}
                                title="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* DAS2 INPI Panel */}
        {das2Enabled && card && (
          <BilanDAS2Panel
            cardId={card.id}
            onSaved={onUpdated}
          />
        )}

        {/* Notes */}
        <div>
          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Ajouter des notes..."
          />
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSaveNotes}
              disabled={saving || notes === (card.notes || '')}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les notes'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
