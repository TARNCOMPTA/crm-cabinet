import { useState, useEffect, useRef } from 'react';
import {
  X,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
  Download,
  FileText,
  Image,
  Loader2,
  CheckSquare,
  Square,
  Pencil,
} from 'lucide-react';
import {
  loadItemComments,
  addItemComment,
  deleteItemComment,
  loadItemAttachments,
  uploadItemAttachment,
  deleteItemAttachment,
  getAttachmentSignedUrl,
} from '../../lib/checklistService';
import type { ChecklistItem, ChecklistItemComment, ChecklistItemAttachment } from '../../types/database';

interface Props {
  item: ChecklistItem | null;
  isOwner: boolean;
  userId: string;
  onClose: () => void;
  onToggle: (itemId: string, currentValue: boolean) => void;
  onUpdateLabel: (itemId: string, label: string) => void;
}

export function ChecklistItemDrawer({
  item,
  isOwner,
  userId,
  onClose,
  onToggle,
  onUpdateLabel,
}: Props) {
  const [comments, setComments] = useState<ChecklistItemComment[]>([]);
  const [attachments, setAttachments] = useState<ChecklistItemAttachment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!item) return;
    setLoadingComments(true);
    setLoadingAttachments(true);
    loadItemComments(item.id)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoadingComments(false));
    loadItemAttachments(item.id)
      .then(setAttachments)
      .catch(() => {})
      .finally(() => setLoadingAttachments(false));
  }, [item?.id]);

  if (!item) return null;

  const handleAddComment = async () => {
    const text = newComment.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const comment = await addItemComment(item.id, userId, text);
      setComments((prev) => [...prev, { ...comment, author: { prenom: null, nom: null } }]);
      setNewComment('');
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await deleteItemComment(commentId);
    } catch {
      const refreshed = await loadItemComments(item.id);
      setComments(refreshed);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const attachment = await uploadItemAttachment(item.id, file, userId);
      setAttachments((prev) => [...prev, attachment]);
    } catch {
      // silently fail
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (att: ChecklistItemAttachment) => {
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    try {
      await deleteItemAttachment(att.id, att.storage_path);
    } catch {
      const refreshed = await loadItemAttachments(item.id);
      setAttachments(refreshed);
    }
  };

  const handleDownload = async (att: ChecklistItemAttachment) => {
    try {
      const url = await getAttachmentSignedUrl(att.storage_path);
      window.open(url, '_blank');
    } catch {}
  };

  const handleSaveLabel = () => {
    if (labelDraft.trim() && labelDraft.trim() !== item.label) {
      onUpdateLabel(item.id, labelDraft.trim());
    }
    setEditingLabel(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / 1048576).toFixed(1)} Mo`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getFileIcon = (mime: string) => {
    if (mime.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />;
    return <FileText className="w-4 h-4 text-red-500" />;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => isOwner && onToggle(item.id, item.is_checked)}
            disabled={!isOwner}
            className="mt-0.5 flex-shrink-0"
          >
            {item.is_checked ? (
              <CheckSquare className="w-5 h-5 text-emerald-500" />
            ) : (
              <Square className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            {editingLabel ? (
              <input
                type="text"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLabel();
                  if (e.key === 'Escape') setEditingLabel(false);
                }}
                onBlur={handleSaveLabel}
                className="w-full text-base font-medium bg-transparent border-b-2 border-teal-500 outline-none text-gray-900 dark:text-white"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 group">
                <h3
                  className={`text-base font-medium ${
                    item.is_checked
                      ? 'line-through text-gray-400 dark:text-gray-500'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {item.label}
                </h3>
                {isOwner && (
                  <button
                    onClick={() => {
                      setLabelDraft(item.label);
                      setEditingLabel(true);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-teal-600 transition-opacity"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Cree le {formatDate(item.created_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comments Section */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Commentaires
              </h4>
              {comments.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                  {comments.length}
                </span>
              )}
            </div>

            {loadingComments ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                Aucun commentaire pour le moment
              </p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="group flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">
                        {(comment.author?.prenom?.[0] || comment.user_id[0] || '?').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {comment.author?.prenom && comment.author?.nom
                            ? `${comment.author.prenom} ${comment.author.nom}`
                            : 'Moi'}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {formatDate(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-wrap break-words">
                        {comment.content}
                      </p>
                    </div>
                    {(comment.user_id === userId || isOwner) && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition-opacity flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add comment */}
            <div className="flex items-center gap-2 mt-4">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
                placeholder="Ajouter un commentaire..."
                className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-shadow"
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim() || submitting}
                className="p-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Attachments Section */}
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Pieces jointes
              </h4>
              {attachments.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                  {attachments.length}
                </span>
              )}
            </div>

            {loadingAttachments ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : attachments.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                Aucune piece jointe
              </p>
            ) : (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="group flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    {getFileIcon(att.mime_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {att.file_name}
                      </p>
                      <p className="text-xs text-gray-400">{formatFileSize(att.file_size)}</p>
                    </div>
                    <button
                      onClick={() => handleDownload(att)}
                      className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-teal-600 transition-colors"
                      title="Telecharger"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => handleDeleteAttachment(att)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition-opacity"
                        title="Supprimer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            {isOwner && (
              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleUpload}
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-teal-400 hover:text-teal-600 dark:hover:border-teal-500 dark:hover:text-teal-400 transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Paperclip className="w-4 h-4" />
                      Ajouter un fichier
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
