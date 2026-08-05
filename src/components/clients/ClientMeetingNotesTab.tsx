import { useEffect, useState } from 'react';
import {
  Plus,
  Calendar,
  Users,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  MessageSquareText,
  ListChecks,
  Phone,
  MapPin,
  Video,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { MeetingNoteModal } from './MeetingNoteModal';
import { FloatingActionButton } from '../ui/FloatingActionButton';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchMeetingNotes,
  createMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
  MeetingNoteWithAuthor,
  type MeetingTypeRdv,
} from '../../lib/meetingNotesService';

interface ClientMeetingNotesTabProps {
  clientId: string;
}

export function ClientMeetingNotesTab({ clientId }: ClientMeetingNotesTabProps) {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [notes, setNotes] = useState<MeetingNoteWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<MeetingNoteWithAuthor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MeetingNoteWithAuthor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadNotes();
  }, [clientId]);

  async function loadNotes() {
    try {
      const data = await fetchMeetingNotes(clientId);
      setNotes(data);
    } catch {
      showToast('Erreur lors du chargement des comptes-rendus', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(data: {
    date_rdv: string;
    type_rdv: MeetingTypeRdv | null;
    objet: string;
    participants: string;
    contenu: string;
    actions_a_suivre: string;
  }) {
    if (editingNote) {
      await updateMeetingNote(editingNote.id, data);
      showToast('Compte-rendu mis a jour', 'success');
    } else {
      await createMeetingNote({
        ...data,
        client_id: clientId,
        created_by: profile?.id,
      });
      showToast('Compte-rendu cree', 'success');
    }
    await loadNotes();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMeetingNote(deleteTarget.id);
      showToast('Compte-rendu supprime', 'success');
      setDeleteTarget(null);
      await loadNotes();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function formatDate(dateString: string) {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function getAuthorName(note: MeetingNoteWithAuthor) {
    if (!note.author) return 'Inconnu';
    return [note.author.prenom, note.author.nom].filter(Boolean).join(' ') || 'Inconnu';
  }

  const typeRdvConfig: Record<MeetingTypeRdv, { label: string; icon: typeof Phone; color: string }> = {
    telephonique: { label: 'Telephonique', icon: Phone, color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    physique: { label: 'Physique', icon: MapPin, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    visio: { label: 'Visio', icon: Video, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Comptes-rendus de RDV
          </h2>
          {notes.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
              {notes.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditingNote(null);
              setShowModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nouveau
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <MessageSquareText className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
            Aucun compte-rendu pour ce client
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-xs">
            Cliquez sur "Nouveau" pour ajouter votre premier compte-rendu de RDV
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const expanded = expandedIds.has(note.id);
            const isLong = note.contenu.length > 200;

            return (
              <div
                key={note.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-md"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {note.objet}
                        </h3>
                        {note.type_rdv && typeRdvConfig[note.type_rdv] && (() => {
                          const cfg = typeRdvConfig[note.type_rdv!];
                          const Icon = cfg.icon;
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                              <Icon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(note.date_rdv)}
                        </span>
                        {note.participants && (
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            {note.participants}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote(note);
                          setShowModal(true);
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(note)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                      {expanded || !isLong
                        ? note.contenu
                        : note.contenu.substring(0, 200) + '...'}
                    </p>
                    {isLong && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(note.id)}
                        className="mt-1.5 text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-medium flex items-center gap-1 transition-colors"
                      >
                        {expanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            Voir moins
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Voir plus
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {note.actions_a_suivre && note.actions_a_suivre.trim() && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <ListChecks className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                          Actions a suivre
                        </span>
                      </div>
                      <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-line leading-relaxed">
                        {note.actions_a_suivre}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span>Par {getAuthorName(note)}</span>
                    <span>
                      {new Date(note.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MeetingNoteModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingNote(null);
        }}
        onSave={handleSave}
        note={editingNote}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer le compte-rendu"
        message={`Voulez-vous vraiment supprimer le compte-rendu "${deleteTarget?.objet}" ? Cette action est irreversible.`}
        confirmText="Supprimer"
        loading={deleting}
      />

      <FloatingActionButton
        onClick={() => {
          setEditingNote(null);
          setShowModal(true);
        }}
        label="Nouveau compte-rendu"
      />
    </div>
  );
}
