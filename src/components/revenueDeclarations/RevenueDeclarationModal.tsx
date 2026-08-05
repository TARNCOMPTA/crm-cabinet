import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2,
  UserCog,
  UserPlus,
  Trash2,
  Paperclip,
  Upload,
  FileText,
  Download,
  X,
  Loader2,
  Users,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import {
  createDeclaration,
  updateDeclaration,
  deleteDeclaration,
  listCabinetClients,
  listCabinetOfficers,
  listCabinetUsers,
  assignCollaborators,
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
  getDeadlinesMap,
  STATUS_LABELS,
  STATUS_ORDER,
  type RevenueDeclaration,
  type RevenueDeclarationStatus,
  type RevenueDeclarationZone,
  type CabinetClientOption,
  type OfficerOption,
  type CabinetUserOption,
  type RevenueDeclarationAttachment,
} from '../../lib/revenueDeclarationService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  declaration: RevenueDeclaration | null;
  defaultAnnee: number;
  onSaved: () => void;
}

type SourceTab = 'client' | 'officer' | 'custom';

export function RevenueDeclarationModal({
  isOpen,
  onClose,
  userId,
  declaration,
  defaultAnnee,
  onSaved,
}: Props) {
  const { showToast } = useToast();
  const isEdit = declaration !== null;

  const [sourceTab, setSourceTab] = useState<SourceTab>('client');
  const [clientId, setClientId] = useState<string>('');
  const [officerId, setOfficerId] = useState<string>('');
  const [customName, setCustomName] = useState('');
  const [annee, setAnnee] = useState<number>(defaultAnnee);
  const [zone, setZone] = useState<RevenueDeclarationZone | ''>('');
  const [derniereAnnee, setDerniereAnnee] = useState(false);
  const [statut, setStatut] = useState<RevenueDeclarationStatus>('a_faire');
  const [commentaire, setCommentaire] = useState('');
  const [deadlinesMap, setDeadlinesMap] = useState<Record<string, string>>({});

  const [clients, setClients] = useState<CabinetClientOption[]>([]);
  const [officers, setOfficers] = useState<OfficerOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [attachments, setAttachments] = useState<RevenueDeclarationAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] =
    useState<RevenueDeclarationAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cabinetUsers, setCabinetUsers] = useState<CabinetUserOption[]>([]);
  const [selectedCollabIds, setSelectedCollabIds] = useState<string[]>([]);
  const [collabSelectOpen, setCollabSelectOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    listCabinetClients().then(setClients).catch(() => setClients([]));
    listCabinetOfficers().then(setOfficers).catch(() => setOfficers([]));
    listCabinetUsers().then(setCabinetUsers).catch(() => setCabinetUsers([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    getDeadlinesMap(annee).then(setDeadlinesMap).catch(() => setDeadlinesMap({}));
  }, [isOpen, annee]);

  useEffect(() => {
    if (!isOpen || !declaration) {
      setAttachments([]);
      return;
    }
    setAttachmentsLoading(true);
    listAttachments(declaration.id)
      .then(setAttachments)
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false));
  }, [isOpen, declaration]);

  async function handleFiles(files: FileList | File[]) {
    if (!declaration) return;
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    try {
      for (const file of list) {
        try {
          const uploaded = await uploadAttachment(
            declaration.id,
            userId,
            file
          );
          setAttachments((prev) => [uploaded, ...prev]);
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : `Echec de l'upload de ${file.name}`;
          showToast(msg, 'error');
        }
      }
      showToast('Piece(s) jointe(s) ajoutee(s)', 'success');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteAttachment() {
    if (!attachmentToDelete) return;
    try {
      await deleteAttachment(
        attachmentToDelete.id,
        attachmentToDelete.storage_path
      );
      setAttachments((prev) =>
        prev.filter((a) => a.id !== attachmentToDelete.id)
      );
      showToast('Piece jointe supprimee', 'success');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erreur lors de la suppression';
      showToast(msg, 'error');
    } finally {
      setAttachmentToDelete(null);
    }
  }

  async function handleDownload(attachment: RevenueDeclarationAttachment) {
    try {
      await downloadAttachment(attachment.storage_path, attachment.file_name);
    } catch {
      showToast('Erreur lors du telechargement', 'error');
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  useEffect(() => {
    if (!isOpen) return;
    if (declaration) {
      setClientId(declaration.client_id ?? '');
      setOfficerId('');
      setCustomName(declaration.client_id ? '' : declaration.person_name);
      setSourceTab(declaration.client_id ? 'client' : 'custom');
      setAnnee(declaration.annee);
      setZone(declaration.zone || '');
      setDerniereAnnee(declaration.derniere_annee ?? false);
      setStatut(declaration.statut);
      setCommentaire(declaration.commentaire);
      setSelectedCollabIds((declaration.collaborators || []).map((c) => c.user_id));
    } else {
      setClientId('');
      setOfficerId('');
      setCustomName('');
      setSourceTab('client');
      setAnnee(defaultAnnee);
      setZone('');
      setDerniereAnnee(false);
      setStatut('a_faire');
      setCommentaire('');
      setSelectedCollabIds([]);
    }
    setCollabSelectOpen(false);
  }, [isOpen, declaration, defaultAnnee]);

  const clientOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c.id,
        label: c.nom_entreprise || '(Sans nom)',
        subtitle: c.numero_dossier || undefined,
      })),
    [clients]
  );

  const officerOptions = useMemo(
    () =>
      officers.map((o) => ({
        value: o.id,
        label: o.full_name,
        subtitle: o.client_names.slice(0, 2).join(', ') || undefined,
      })),
    [officers]
  );

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current + 1; y >= current - 6; y--) list.push(y);
    if (declaration && !list.includes(declaration.annee)) {
      list.push(declaration.annee);
      list.sort((a, b) => b - a);
    }
    return list;
  }, [declaration]);

  function resolvePersonName(): { name: string; client_id: string | null } | null {
    if (sourceTab === 'client') {
      const c = clients.find((x) => x.id === clientId);
      if (!c) return null;
      return {
        name: c.nom_entreprise || 'Sans nom',
        client_id: c.id,
      };
    }
    if (sourceTab === 'officer') {
      const o = officers.find((x) => x.id === officerId);
      if (!o) return null;
      return { name: o.full_name, client_id: null };
    }
    const trimmed = customName.trim();
    if (!trimmed) return null;
    return { name: trimmed, client_id: null };
  }

  async function handleSave() {
    const resolved = resolvePersonName();
    if (!resolved) {
      showToast('Selectionnez une personne ou saisissez un nom', 'error');
      return;
    }
    if (!annee) {
      showToast('Annee requise', 'error');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && declaration) {
        await updateDeclaration(declaration.id, {
          client_id: resolved.client_id,
          person_name: resolved.name,
          annee,
          zone: zone || null,
          derniere_annee: derniereAnnee,
          statut,
          commentaire,
        });
        await assignCollaborators(declaration.id, selectedCollabIds);
        showToast('Declaration mise a jour', 'success');
      } else {
        const created = await createDeclaration(userId, {
          client_id: resolved.client_id,
          person_name: resolved.name,
          annee,
          zone: zone || null,
          derniere_annee: derniereAnnee,
          statut,
          commentaire,
        });
        if (selectedCollabIds.length > 0) {
          await assignCollaborators(created.id, selectedCollabIds);
        }
        showToast('Declaration creee', 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l enregistrement';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!declaration) return;
    setSaving(true);
    try {
      await deleteDeclaration(declaration.id);
      showToast('Declaration supprimee', 'success');
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la suppression';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  const tabs: Array<{ key: SourceTab; label: string; icon: typeof Building2 }> = [
    { key: 'client', label: 'Client', icon: Building2 },
    { key: 'officer', label: 'Dirigeant', icon: UserCog },
    { key: 'custom', label: 'Autre personne', icon: UserPlus },
  ];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? 'Modifier la declaration' : 'Nouvelle declaration de revenus'}
        size="lg"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Personne concernee
            </label>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-3">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = sourceTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSourceTab(t.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? 'bg-white dark:bg-gray-700 text-teal-700 dark:text-teal-300 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {sourceTab === 'client' && (
              <SearchableSelect
                options={clientOptions}
                value={clientId}
                onChange={setClientId}
                placeholder="Rechercher un client..."
              />
            )}
            {sourceTab === 'officer' && (
              <SearchableSelect
                options={officerOptions}
                value={officerId}
                onChange={setOfficerId}
                placeholder="Rechercher un dirigeant..."
              />
            )}
            {sourceTab === 'custom' && (
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nom et prenom"
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Annee"
              value={annee}
              onChange={(e) => setAnnee(parseInt(e.target.value, 10))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>

            <Select
              label="Zone"
              value={zone}
              onChange={(e) => setZone(e.target.value as RevenueDeclarationZone | '')}
            >
              <option value="">--</option>
              <option value="1">Zone 1</option>
              <option value="2">Zone 2</option>
              <option value="3">Zone 3</option>
            </Select>

            <Select
              label="Statut"
              value={statut}
              onChange={(e) => setStatut(e.target.value as RevenueDeclarationStatus)}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>

          {zone && deadlinesMap[zone] && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              new Date(deadlinesMap[zone] + 'T00:00:00') < new Date()
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                : 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300'
            }`}>
              <span className="font-medium">Echeance :</span>
              {new Date(deadlinesMap[zone] + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              {new Date(deadlinesMap[zone] + 'T00:00:00') < new Date() && (
                <span className="ml-1 text-xs font-medium">(depassee)</span>
              )}
            </div>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={derniereAnnee}
              onChange={(e) => setDerniereAnnee(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 w-4 h-4"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Derniere annee
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              (ne pas creer la declaration pour l'annee suivante)
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Commentaire
            </label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={4}
              placeholder="Notes, infos a transmettre..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Collaborateurs en charge
              </div>
            </label>
            {selectedCollabIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedCollabIds.map((uid) => {
                  const user = cabinetUsers.find((u) => u.id === uid);
                  return (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 text-sm px-2.5 py-1 rounded-full"
                    >
                      {user?.full_name || 'Utilisateur'}
                      <button
                        type="button"
                        onClick={() => setSelectedCollabIds((prev) => prev.filter((id) => id !== uid))}
                        className="ml-0.5 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setCollabSelectOpen(!collabSelectOpen)}
                className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:border-teal-400 transition-colors"
              >
                <span className="text-gray-400 dark:text-gray-500">
                  {selectedCollabIds.length === 0 ? 'Ajouter un collaborateur...' : 'Ajouter un autre collaborateur...'}
                </span>
                <Users className="w-4 h-4 text-gray-400" />
              </button>
              {collabSelectOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {cabinetUsers
                    .filter((u) => !selectedCollabIds.includes(u.id))
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedCollabIds((prev) => [...prev, u.id]);
                          setCollabSelectOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                      >
                        {u.full_name}
                      </button>
                    ))}
                  {cabinetUsers.filter((u) => !selectedCollabIds.includes(u.id)).length === 0 && (
                    <p className="px-3 py-2 text-sm text-gray-500 italic">Tous les collaborateurs sont deja assignes</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {isEdit && declaration && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Pieces jointes
                  </h3>
                  {attachments.length > 0 && (
                    <span className="text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                      {attachments.length}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  PDF uniquement - max 10 Mo
                </span>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`group cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                  dragOver
                    ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-teal-400 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files);
                  }}
                />
                <div className="flex flex-col items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-gray-400 group-hover:text-teal-600 transition-colors" />
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        Glissez un PDF ou cliquez pour selectionner
                      </span>
                    </>
                  )}
                </div>
              </div>

              {attachmentsLoading ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement...
                </div>
              ) : attachments.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {attachments.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 px-3 py-2"
                    >
                      <div className="w-9 h-9 rounded-md bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {att.file_name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(att.file_size)} -{' '}
                          {new Date(att.created_at).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownload(att)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 transition-colors"
                        title="Telecharger"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttachmentToDelete(att)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                        title="Supprimer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 italic">
                  Aucune piece jointe pour cette annee.
                </p>
              )}
            </div>
          )}

          {!isEdit && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Paperclip className="w-3.5 h-3.5" />
                <span>
                  Enregistrez d'abord la declaration pour pouvoir ajouter des pieces
                  jointes.
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
            {isEdit ? (
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Creer'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer cette declaration ?"
        message="Cette action est irreversible."
        confirmText="Supprimer"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={attachmentToDelete !== null}
        onClose={() => setAttachmentToDelete(null)}
        onConfirm={handleDeleteAttachment}
        title="Supprimer cette piece jointe ?"
        message={`Le fichier "${attachmentToDelete?.file_name}" sera definitivement supprime.`}
        confirmText="Supprimer"
        variant="danger"
      />
    </>
  );
}
