import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  User,
  MessageSquare,
  Pencil,
  Trash2,
  Paperclip,
  Loader2,
  FileText,
  ExternalLink,
} from 'lucide-react';
import {
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_COLORS,
  updateStatut,
  updateDeclaration,
  deleteDeclaration,
  uploadAttachment,
  listAttachments,
  openAttachmentInNewTab,
  type RevenueDeclaration,
  type RevenueDeclarationAttachment,
  type RevenueDeclarationStatus,
} from '../../lib/revenueDeclarationService';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CollaboratorAvatarGroup } from '../ui/CollaboratorAvatarGroup';

interface Props {
  declarations: RevenueDeclaration[];
  attachmentsCounts?: Record<string, number>;
  deadlinesMap?: Record<string, string>;
  userId: string;
  onEdit: (d: RevenueDeclaration) => void;
  onChanged: () => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export function RevenueDeclarationsTable({
  declarations,
  attachmentsCounts = {},
  deadlinesMap = {},
  userId,
  onEdit,
  onChanged,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const { showToast } = useToast();
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RevenueDeclaration | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [openAttachmentsId, setOpenAttachmentsId] = useState<string | null>(null);
  const [attachmentsList, setAttachmentsList] = useState<RevenueDeclarationAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingDeclarationIdRef = useRef<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openAttachmentsId) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenAttachmentsId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openAttachmentsId]);

  async function toggleAttachmentsPopover(declarationId: string) {
    if (openAttachmentsId === declarationId) {
      setOpenAttachmentsId(null);
      return;
    }
    setOpenAttachmentsId(declarationId);
    setLoadingAttachments(true);
    setAttachmentsList([]);
    try {
      const items = await listAttachments(declarationId);
      setAttachmentsList(items);
    } catch {
      showToast('Erreur chargement des pieces jointes', 'error');
      setOpenAttachmentsId(null);
    } finally {
      setLoadingAttachments(false);
    }
  }

  async function handleOpenAttachment(att: RevenueDeclarationAttachment) {
    setOpeningAttachmentId(att.id);
    try {
      await openAttachmentInNewTab(att.storage_path);
    } catch {
      showToast('Impossible d\'ouvrir la piece jointe', 'error');
    } finally {
      setOpeningAttachmentId(null);
    }
  }

  function triggerAttach(declarationId: string) {
    pendingDeclarationIdRef.current = declarationId;
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const declarationId = pendingDeclarationIdRef.current;
    const files = e.target.files;
    if (!declarationId || !files || files.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      pendingDeclarationIdRef.current = null;
      return;
    }

    setUploadingId(declarationId);
    try {
      for (const file of Array.from(files)) {
        try {
          await uploadAttachment(declarationId, userId, file);
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : `Echec de l'upload de ${file.name}`;
          showToast(msg, 'error');
        }
      }
      showToast('Piece(s) jointe(s) ajoutee(s)', 'success');
      onChanged();
    } finally {
      setUploadingId(null);
      pendingDeclarationIdRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleStatutChange(id: string, statut: RevenueDeclarationStatus) {
    try {
      await updateStatut(id, statut);
      onChanged();
    } catch {
      showToast('Erreur mise a jour statut', 'error');
    }
  }

  async function handleCommentSave(id: string) {
    try {
      await updateDeclaration(id, { commentaire: commentDraft });
      setEditingCommentId(null);
      onChanged();
    } catch {
      showToast('Erreur mise a jour commentaire', 'error');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteDeclaration(deleteTarget.id);
      showToast('Declaration supprimee', 'success');
      onChanged();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
              <tr>
                {onToggleSelect && (
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds ? selectedIds.size === declarations.length && declarations.length > 0 : false}
                      onChange={onToggleSelectAll}
                      className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                  Personne
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 w-24">
                  Annee
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 w-40">
                  Zone / Echeance
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 w-60">
                  Statut
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 w-40">
                  Collaborateurs
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                  Commentaire
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 w-36">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {declarations.map((d) => {
                const colors = STATUS_COLORS[d.statut];
                const isEditingComment = editingCommentId === d.id;
                return (
                  <tr
                    key={d.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${selectedIds?.has(d.id) ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''}`}
                  >
                    {onToggleSelect && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds?.has(d.id) ?? false}
                          onChange={() => onToggleSelect(d.id)}
                          className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {d.client_id ? (
                          <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        ) : (
                          <User className="w-4 h-4 text-gray-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {d.person_name}
                          </div>
                          {d.client_id && d.clients?.numero_dossier && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {d.clients.numero_dossier}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{d.annee}</span>
                        {(attachmentsCounts[d.id] ?? 0) > 0 && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => toggleAttachmentsPopover(d.id)}
                              className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                              title="Voir les pieces jointes"
                            >
                              <Paperclip className="w-3 h-3" />
                              {attachmentsCounts[d.id]}
                            </button>
                            {openAttachmentsId === d.id && (
                              <div
                                ref={popoverRef}
                                className="absolute left-0 top-full mt-1 z-20 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1"
                              >
                                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                                  Pieces jointes
                                </div>
                                {loadingAttachments ? (
                                  <div className="px-3 py-4 flex items-center justify-center text-gray-400">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  </div>
                                ) : attachmentsList.length === 0 ? (
                                  <div className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                                    Aucune piece jointe
                                  </div>
                                ) : (
                                  <ul className="max-h-64 overflow-y-auto">
                                    {attachmentsList.map((att) => (
                                      <li key={att.id}>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenAttachment(att)}
                                          disabled={openingAttachmentId === att.id}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-wait transition-colors"
                                        >
                                          {openingAttachmentId === att.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-teal-600 shrink-0" />
                                          ) : (
                                            <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                                          )}
                                          <span className="truncate flex-1">{att.file_name}</span>
                                          <ExternalLink className="w-3 h-3 text-gray-400 shrink-0" />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {d.zone ? (
                        <div className="space-y-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            d.zone === '1' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' :
                            d.zone === '2' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                            'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                          }`}>
                            Z{d.zone}
                          </span>
                          {deadlinesMap[d.zone] && (
                            <div className={`text-xs ${
                              new Date(deadlinesMap[d.zone] + 'T00:00:00') < new Date() && d.statut !== 'fait'
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {new Date(deadlinesMap[d.zone] + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={d.statut}
                        onChange={(e) =>
                          handleStatutChange(d.id, e.target.value as RevenueDeclarationStatus)
                        }
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-md border-0 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer ${colors.badge}`}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <CollaboratorAvatarGroup
                        collaborators={(d.collaborators || []).map((c) => ({
                          user_id: c.user_id,
                          full_name: c.full_name,
                          avatar_color: c.avatar_color,
                        }))}
                        size="small"
                        maxDisplay={3}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {isEditingComment ? (
                        <div className="flex gap-1">
                          <textarea
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            rows={2}
                            className="w-full px-2 py-1 text-xs border border-teal-400 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            autoFocus
                          />
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleCommentSave(d.id)}
                              className="text-xs px-2 py-0.5 bg-teal-600 text-white rounded hover:bg-teal-700"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => setEditingCommentId(null)}
                              className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                            >
                              X
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingCommentId(d.id);
                            setCommentDraft(d.commentaire);
                          }}
                          className="w-full text-left text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-start gap-1 min-h-[24px]"
                        >
                          {d.commentaire ? (
                            <>
                              <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{d.commentaire}</span>
                            </>
                          ) : (
                            <span className="italic text-gray-400 dark:text-gray-500">
                              Ajouter un commentaire...
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => triggerAttach(d.id)}
                          disabled={uploadingId === d.id}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 transition-colors disabled:opacity-50 disabled:cursor-wait"
                          title="Joindre un PDF"
                        >
                          {uploadingId === d.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Paperclip className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => onEdit(d)}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(d)}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer cette declaration ?"
        message={`La declaration de ${deleteTarget?.person_name} (${deleteTarget?.annee}) sera definitivement supprimee.`}
        confirmText="Supprimer"
        variant="danger"
      />
    </>
  );
}
