import { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Trash2, UserPlus, Paperclip, Upload, Download, FileText, Image, File, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { ExpandableTextarea } from '../ui/ExpandableTextarea';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { OpportunityChecklistSection } from './OpportunityChecklistSection';
import {
  updateCard,
  deleteCard,
  moveCard,
  fetchAttachments,
  uploadAttachment,
  deleteAttachment,
  getAttachmentSignedUrl,
  type OpportunityAttachment,
} from '../../lib/opportunityService';
import type { OpportunityCardWithDetails, OpportunityColumn } from '../../types/database';

interface Props {
  card: OpportunityCardWithDetails | null;
  columns: OpportunityColumn[];
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType === 'application/pdf') return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function OpportunityCardDetailModal({ card, columns, isOpen, onClose, onUpdated }: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [selectedColumn, setSelectedColumn] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [montant, setMontant] = useState('');
  const [source, setSource] = useState('');
  const [dateRelance, setDateRelance] = useState('');
  const [notes, setNotes] = useState('');
  const [comment, setComment] = useState('');
  const [users, setUsers] = useState<Array<{ id: string; display_name: string | null; prenom: string | null; nom: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [attachments, setAttachments] = useState<OpportunityAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (card) {
      setSelectedColumn(card.column_id);
      setSelectedAssignee(card.assignee_id || '');
      setProspectName(card.prospect_name || '');
      setMontant(card.montant_estime != null ? String(card.montant_estime) : '');
      setSource(card.source || '');
      setDateRelance(card.date_relance || '');
      setNotes(card.notes || '');
      setComment(card.comment || '');
    }
  }, [card]);

  useEffect(() => {
    if (isOpen && profile) {
      loadUsers();
    }
  }, [isOpen, profile]);

  useEffect(() => {
    if (isOpen && card) {
      loadAttachments();
    } else {
      setAttachments([]);
    }
  }, [isOpen, card?.id]);

  async function loadUsers() {
    if (!profile) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, prenom, nom')
      .eq('is_active', true)
      .order('nom');
    if (data) setUsers(data);
  }

  async function loadAttachments() {
    if (!card) return;
    try {
      const data = await fetchAttachments(card.id);
      setAttachments(data);
    } catch {
      /* silent */
    }
  }

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    if (!card || !profile) return;
    const MAX_SIZE = 10 * 1024 * 1024;
    const validFiles = Array.from(files).filter((f) => {
      if (f.size > MAX_SIZE) {
        showToast(`${f.name} depasse 10 Mo`, 'error');
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of validFiles) {
        const att = await uploadAttachment(card.id, file, profile.id);
        setAttachments((prev) => [att, ...prev]);
      }
      showToast(`${validFiles.length} fichier(s) ajoute(s)`, 'success');
      onUpdated();
    } catch {
      showToast('Erreur lors de l\'upload', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [card, profile, showToast, onUpdated]);

  async function handleDownloadAttachment(att: OpportunityAttachment) {
    try {
      const url = await getAttachmentSignedUrl(att.storage_path);
      window.open(url, '_blank');
    } catch {
      showToast('Erreur lors du telechargement', 'error');
    }
  }

  async function handleConfirmDeleteAttachment() {
    if (!deleteAttachmentId) return;
    const att = attachments.find((a) => a.id === deleteAttachmentId);
    if (!att) return;
    try {
      await deleteAttachment(att.id, att.storage_path);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      showToast('Piece jointe supprimee', 'success');
      onUpdated();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setDeleteAttachmentId(null);
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
    }
  }

  async function handleAssigneeChange(newAssigneeId: string) {
    if (!card) return;
    setSelectedAssignee(newAssigneeId);
    try {
      await updateCard(card.id, { assignee_id: newAssigneeId || null });
      onUpdated();
    } catch {
      setSelectedAssignee(card.assignee_id || '');
    }
  }

  async function handleSave() {
    if (!card) return;
    setSaving(true);
    try {
      const payload: Parameters<typeof updateCard>[1] = {
        montant_estime: montant ? parseFloat(montant) : null,
        source: source || null,
        date_relance: dateRelance || null,
        notes: notes || null,
        comment: comment || null,
      };
      if (!card.client_id) {
        payload.prospect_name = prospectName.trim() || null;
      }
      await updateCard(card.id, payload);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!card) return;
    setDeleting(true);
    try {
      await deleteCard(card.id);
      onUpdated();
      onClose();
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (!card) return null;

  const isProspect = !card.client_id;
  const displayName = card.clients?.nom_entreprise || card.prospect_name || 'Opportunite';

  const hasChanges =
    montant !== (card.montant_estime != null ? String(card.montant_estime) : '') ||
    source !== (card.source || '') ||
    dateRelance !== (card.date_relance || '') ||
    notes !== (card.notes || '') ||
    comment !== (card.comment || '') ||
    (isProspect && prospectName !== (card.prospect_name || ''));

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={displayName} size="lg">
        <div className="space-y-6">
          {isProspect ? (
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
                <UserPlus className="w-3.5 h-3.5" />
                Prospect
              </div>
              <Input
                label="Nom du prospect"
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                placeholder="Nom de l'entreprise ou du contact..."
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
              {card.clients?.siren && (
                <span>SIREN : <span className="font-medium text-gray-900 dark:text-gray-100">{card.clients.siren}</span></span>
              )}
              {card.clients?.forme_juridique && (
                <span>Forme : <span className="font-medium text-gray-900 dark:text-gray-100">{card.clients.forme_juridique}</span></span>
              )}
              <a
                href={`/clients/${card.client_id}`}
                className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300"
              >
                Voir la fiche <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Etape"
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
                ...users.map((u) => ({ value: u.id, label: u.display_name || `${u.prenom || ''} ${u.nom || ''}`.trim() })),
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Montant estime (EUR)"
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0"
            />
            <Input
              label="Source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Site web, recommandation..."
            />
            <Input
              label="Date de relance"
              type="date"
              value={dateRelance}
              onChange={(e) => setDateRelance(e.target.value)}
            />
          </div>

          <ExpandableTextarea
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Ajouter des notes..."
            minRows={8}
            maxHeightClass="max-h-80"
          />

          <ExpandableTextarea
            label="Commentaire"
            value={comment}
            onChange={setComment}
            placeholder="Ajouter un commentaire..."
            minRows={4}
            maxHeightClass="max-h-64"
          />

          {profile && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <OpportunityChecklistSection
                cardId={card.id}
                userId={profile.id}
              />
            </div>
          )}

          {/* Attachments section */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Pieces jointes {attachments.length > 0 && `(${attachments.length})`}
              </h4>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-2 mb-3">
                {attachments.map((att) => {
                  const Icon = getFileIcon(att.mime_type);
                  return (
                    <div
                      key={att.id}
                      className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg group"
                    >
                      <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(att)}
                          className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-teal-600 dark:hover:text-teal-400 truncate block max-w-full text-left"
                        >
                          {att.file_name}
                        </button>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {formatFileSize(att.file_size)} &middot; {new Date(att.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(att)}
                          className="p-1.5 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 rounded"
                          title="Telecharger"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteAttachmentId(att.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                          title="Supprimer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                dragOver
                  ? 'border-teal-400 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files);
                }}
              />
              {isUploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                  Upload en cours...
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Upload className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Glissez vos fichiers ici ou{' '}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-teal-600 dark:text-teal-400 hover:underline font-medium"
                    >
                      parcourir
                    </button>
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">PDF, images, Word, Excel - max 10 Mo</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </button>
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Supprimer l'opportunite"
        message="Cette opportunite sera definitivement supprimee. Cette action est irreversible."
        confirmText={deleting ? 'Suppression...' : 'Supprimer'}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!deleteAttachmentId}
        onClose={() => setDeleteAttachmentId(null)}
        onConfirm={handleConfirmDeleteAttachment}
        title="Supprimer la piece jointe"
        message="Ce fichier sera definitivement supprime."
        confirmText="Supprimer"
        variant="danger"
      />
    </>
  );
}
