import { useState, useEffect, useRef } from 'react';
import {
  ExternalLink,
  Check,
  User,
  Clock,
  Paperclip,
  Loader2,
  Calendar,
  Building2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { BilanDAS2Panel } from './BilanDAS2Panel';
import { PieceJointeLigne, type PieceJointe } from './PieceJointeLigne';
import { VignettesCollaborateurs } from './VignettesCollaborateurs';
import { vignettesDuBilan } from '../../lib/collaborateursBilan';
import { ZoneDepot } from './ZoneDepot';
import { useDepotFichiers } from '../../hooks/useDepotFichiers';
import {
  toggleChecklistItem,
  updateCardNotes,
  updateCardAssignee,
  updateCardMoisTraites,
  moveCard,
  uploadChecklistAttachment,
  deleteChecklistAttachment,
  downloadChecklistAttachment,
  fetchCardAttachments,
  uploadCardAttachment,
  deleteCardAttachment,
} from '../../lib/bilanService';
import type { BilanCardWithDetails, BilanColumn } from '../../types/database';

const MOIS_LABELS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Une piece jointe de checklist, telle que la base la rend.
 *
 * Trois champs etaient declares NON NULS alors qu'ils le sont — `file_size`,
 * `mime_type`, `created_at`. Le `as any` du chargement empechait de le voir : un
 * fichier sans type MIME enregistre passait pour une chaine, et l'affichage
 * d'une taille absente montrait « NaN o ».
 */
interface Attachment {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string | null;
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
  const [users, setUsers] = useState<Array<{ id: string; display_name: string | null; prenom: string | null; nom: string | null; avatar_color: string | null }>>([]);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [attachmentsState, setAttachmentsState] = useState<Record<string, Attachment[]>>({});
  const [uploadingItems, setUploadingItems] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  /** Les pieces jointes qui ne relevent d'aucun point de checklist (increment 016). */
  const [piecesDiverses, setPiecesDiverses] = useState<PieceJointe[]>([]);
  const [depotDiversEnCours, setDepotDiversEnCours] = useState(false);
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
        attachState[item.id] = item.attachments || [];
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

  // Les pieces diverses ne voyagent pas avec la carte : elles vivent dans leur
  // propre table et se chargent a l'ouverture. `annule` evite d'ecrire l'etat
  // d'une carte qu'on vient de quitter.
  useEffect(() => {
    if (!isOpen || !card) return;
    let annule = false;
    fetchCardAttachments(card.id)
      .then((lignes) => {
        if (!annule) setPiecesDiverses(lignes as PieceJointe[]);
      })
      .catch(() => {
        if (!annule) showToast('Les pieces jointes diverses n’ont pas pu etre lues', 'error');
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, card?.id]);

  async function loadUsers() {
    if (!profile) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, prenom, nom, avatar_color')
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

  // `File[] | FileList` : le selecteur de fichiers rend une `FileList`, le
  // glisser-deposer un tableau. Les deux passent par `Array.from`.
  async function handleFileUpload(itemId: string, files: File[] | FileList | null) {
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

  async function deposerPiecesDiverses(fichiers: File[]) {
    if (!card || !user || fichiers.length === 0) return;
    setDepotDiversEnCours(true);
    try {
      for (const fichier of fichiers) {
        const piece = await uploadCardAttachment(card.id, fichier, user.id);
        setPiecesDiverses((prev) => [...prev, piece as PieceJointe]);
      }
    } catch {
      showToast('Erreur lors de l’envoi de la piece jointe', 'error');
    } finally {
      setDepotDiversEnCours(false);
    }
  }

  async function supprimerPieceDiverse(piece: PieceJointe) {
    try {
      await deleteCardAttachment(piece.id, piece.storage_path);
      setPiecesDiverses((prev) => prev.filter((p) => p.id !== piece.id));
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

  /*
    Les vignettes suivent `selectedAssignee`, pas `card.assignee_id` : changer
    de responsable met la liste a jour tout de suite, sans attendre le
    rechargement du tableau. Le profil vient de `users`, deja charge pour le
    menu deroulant.
  */
  const responsableChoisi = users.find((u) => u.id === selectedAssignee);
  const vignettes = vignettesDuBilan(
    card.clients?.collaborators,
    selectedAssignee ? { id: selectedAssignee, ...(responsableChoisi ?? card.assignee ?? {}) } : null
  );

  const nbDiverses = piecesDiverses.length;
  /** Sans checklist, l'onglet des pieces est le seul : c'est lui qui s'ouvre. */
  const ongletInitial = total > 0 ? 'checklist' : 'pieces';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={card.clients?.nom_entreprise || 'Fiche bilan'} size="lg">
      <div className="space-y-6">
        {/*
          LES NOTES EN PREMIER, ET C'EST UN CHOIX D'USAGE.
          Elles etaient tout en bas, apres la checklist et ses pieces jointes :
          sur un bilan bien rempli il fallait derouler toute la fenetre pour
          lire « le client a change d'expert-comptable en mars » — l'information
          qu'on veut AVANT de toucher au reste.
        */}
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

        {/* Identite de la carte */}
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

        {/*
          L'EQUIPE DU DOSSIER, A COTE DE QUI PILOTE CE BILAN.
          Ce sont deux faits distincts, et la fenetre n'en montrait qu'un :
          `bilan_cards.assignee_id` (le responsable du bilan) etait etiquete
          « Collaborateur », ce qui laissait croire qu'il etait le seul affecte.
          L'equipe vient de `client_collaborators` et se modifie sur la fiche
          client — d'ou l'absence de commande ici, et le renvoi vers la fiche
          juste au-dessus.
        */}
        {vignettes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Équipe du dossier
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <VignettesCollaborateurs vignettes={vignettes} taille="md" max={8} />
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                {vignettes.map((v) => (
                  <li key={v.userId}>
                    {v.nomComplet}
                    {v.role && <span className="text-gray-400 dark:text-gray-500"> · {v.role}</span>}
                    {v.responsableBilan && (
                      <span className="text-teal-600 dark:text-teal-400"> · responsable du bilan</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Colonne"
            value={selectedColumn}
            onChange={(e) => handleColumnChange(e.target.value)}
            options={columns.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Responsable du bilan"
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

        {/* Mois traites */}
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

        {/*
          Checklist et pieces diverses en ONGLETS, avec leur compte sur l'onglet.
          Les deux listes s'allongent independamment ; empilees, elles faisaient
          une fenetre qu'on parcourait a l'ascenseur. La pastille dit ce que
          contient l'onglet qu'on ne regarde pas — c'est tout son interet.
        */}
        <Tabs defaultValue={ongletInitial}>
          <TabsList aria-label="Contenu du bilan">
            {total > 0 && (
              <TabsTrigger value="checklist" className="flex items-center gap-2">
                Checklist
                <Pastille
                  texte={`${checked}/${total}`}
                  ton={progress === 100 ? 'vert' : progress > 0 ? 'ambre' : 'neutre'}
                />
              </TabsTrigger>
            )}
            <TabsTrigger value="pieces" className="flex items-center gap-2">
              Pieces jointes
              <Pastille texte={String(nbDiverses)} ton={nbDiverses > 0 ? 'teal' : 'neutre'} />
            </TabsTrigger>
          </TabsList>

          {total > 0 && (
            <TabsContent value="checklist" className="pt-4">
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 mb-4 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ease-out ${progressColor}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className={`text-xs font-semibold mb-3 ${progressTextColor}`}>
                {checked}/{total} ({progress}%)
              </p>
              <div className="space-y-0.5">
                {card.checklist_items
                  ?.slice()
                  .sort((a, b) => (a.template?.position ?? 0) - (b.template?.position ?? 0))
                  .map((item) => (
                    <LigneChecklist
                      key={item.id}
                      nom={item.template?.name || 'Element'}
                      coche={!!checklistState[item.id]}
                      cochePar={item.is_checked ? item.checked_by : null}
                      cocheLe={item.checked_at}
                      users={users}
                      pieces={(attachmentsState[item.id] || []) as PieceJointe[]}
                      envoiEnCours={uploadingItems.has(item.id)}
                      onBasculer={() => handleCheckToggle(item.id, !checklistState[item.id])}
                      onFichiers={(fichiers) => handleFileUpload(item.id, fichiers)}
                      onTelecharger={(p) => handleDownloadAttachment(p as Attachment)}
                      onSupprimer={(p) => handleDeleteAttachment(item.id, p as Attachment)}
                    />
                  ))}
              </div>
            </TabsContent>
          )}

          <TabsContent value="pieces" className="pt-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Les pieces qui ne relevent d’aucun point de la checklist : courrier de la banque,
              balance du confrere precedent, PV recu en vrac.
            </p>
            {nbDiverses > 0 && (
              <div className="space-y-1.5 mb-4">
                {piecesDiverses.map((piece) => (
                  <PieceJointeLigne
                    key={piece.id}
                    piece={piece}
                    onTelecharger={(p) => handleDownloadAttachment(p as Attachment)}
                    onSupprimer={supprimerPieceDiverse}
                  />
                ))}
              </div>
            )}
            <ZoneDepot
              onFichiers={deposerPiecesDiverses}
              accept={ACCEPTED_TYPES}
              disabled={depotDiversEnCours}
              libelle={depotDiversEnCours ? 'Envoi en cours...' : 'choisir un fichier'}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                Glissez vos fichiers ici
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">PDF et images · ou </p>
            </ZoneDepot>
          </TabsContent>
        </Tabs>

        {das2Enabled && card && <BilanDAS2Panel cardId={card.id} onSaved={onUpdated} />}
      </div>
    </Modal>
  );
}

/** La pastille d'un onglet : un compte, et rien d'autre. */
function Pastille({ texte, ton }: { texte: string; ton: 'neutre' | 'teal' | 'ambre' | 'vert' }) {
  const tons = {
    neutre: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
    teal: 'bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300',
    ambre: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    vert: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
  };
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[20px] px-1.5 h-[18px] rounded-full text-[10px] font-bold ${tons[ton]}`}
    >
      {texte}
    </span>
  );
}

/**
 * Un point de checklist, qui accepte aussi qu'on lui depose des fichiers.
 *
 * Composant a part, et pas une boucle dans le rendu du parent : `useDepotFichiers`
 * est un crochet, et un crochet ne s'appelle pas dans un `.map()`.
 */
function LigneChecklist({
  nom,
  coche,
  cochePar,
  cocheLe,
  users,
  pieces,
  envoiEnCours,
  onBasculer,
  onFichiers,
  onTelecharger,
  onSupprimer,
}: {
  nom: string;
  coche: boolean;
  cochePar: string | null;
  cocheLe: string | null;
  users: Array<{ id: string; display_name: string | null; prenom: string | null; nom: string | null }>;
  pieces: PieceJointe[];
  envoiEnCours: boolean;
  onBasculer: () => void;
  onFichiers: (fichiers: File[]) => void;
  onTelecharger: (piece: PieceJointe) => void;
  onSupprimer: (piece: PieceJointe) => void;
}) {
  const { survol, gestionnaires } = useDepotFichiers(onFichiers, envoiEnCours);
  const champ = useRef<HTMLInputElement>(null);

  const auteur = cochePar ? users.find((u) => u.id === cochePar) : undefined;

  return (
    <div
      {...gestionnaires}
      className={`py-2.5 px-3 rounded-xl group transition-colors ${
        survol
          ? 'bg-teal-50 dark:bg-teal-950/30 ring-2 ring-teal-400 ring-inset'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBasculer}
          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
            coche
              ? 'bg-teal-600 border-teal-600 scale-95'
              : 'border-gray-300 dark:border-gray-600 group-hover:border-teal-400'
          }`}
          aria-label={`Cocher ${nom}`}
        >
          {coche && <Check className="w-3.5 h-3.5 text-white" />}
        </button>
        <div className="flex-1 min-w-0">
          <span className={`text-sm ${coche ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
            {nom}
          </span>
          {auteur && (
            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
              <User className="w-3 h-3" />
              <span>
                {auteur.display_name || `${auteur.prenom || ''} ${auteur.nom || ''}`.trim() || 'Utilisateur'}
              </span>
              {cocheLe && (
                <>
                  <Clock className="w-3 h-3 ml-1" />
                  <span>{new Date(cocheLe).toLocaleDateString('fr-FR')}</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {pieces.length > 0 && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
              {pieces.length}
            </span>
          )}
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
            onClick={() => champ.current?.click()}
            disabled={envoiEnCours}
            aria-label={`Joindre un fichier a ${nom}`}
            title="Joindre un fichier — ou glissez-le sur cette ligne"
          >
            {envoiEnCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <input
            ref={champ}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onFichiers(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {pieces.length > 0 && (
        <div className="ml-8 mt-2 space-y-1.5">
          {pieces.map((piece) => (
            <PieceJointeLigne
              key={piece.id}
              piece={piece}
              onTelecharger={onTelecharger}
              onSupprimer={onSupprimer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
