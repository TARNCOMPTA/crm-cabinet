import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Save } from 'lucide-react';
import type { MeetingNoteWithAuthor } from '../../lib/meetingNotesService';
import { MEETING_TYPE_OPTIONS, type MeetingTypeRdv } from '../../lib/meetingNotesService';

interface MeetingNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    date_rdv: string;
    type_rdv: MeetingTypeRdv | null;
    objet: string;
    participants: string;
    contenu: string;
    actions_a_suivre: string;
  }) => Promise<void>;
  note?: MeetingNoteWithAuthor | null;
}

export function MeetingNoteModal({ isOpen, onClose, onSave, note }: MeetingNoteModalProps) {
  const [dateRdv, setDateRdv] = useState('');
  const [typeRdv, setTypeRdv] = useState<MeetingTypeRdv | ''>('');
  const [objet, setObjet] = useState('');
  const [participants, setParticipants] = useState('');
  const [contenu, setContenu] = useState('');
  const [actionsASuivre, setActionsASuivre] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      if (note) {
        setDateRdv(note.date_rdv);
        setTypeRdv(note.type_rdv || '');
        setObjet(note.objet);
        setParticipants(note.participants || '');
        setContenu(note.contenu);
        setActionsASuivre(note.actions_a_suivre || '');
      } else {
        setDateRdv(new Date().toISOString().split('T')[0]);
        setTypeRdv('');
        setObjet('');
        setParticipants('');
        setContenu('');
        setActionsASuivre('');
      }
      setErrors({});
    }
  }, [isOpen, note]);

  function validate() {
    const newErrors: Record<string, string> = {};
    if (!dateRdv) newErrors.dateRdv = 'La date est obligatoire';
    if (!objet.trim()) newErrors.objet = "L'objet est obligatoire";
    if (!contenu.trim()) newErrors.contenu = 'Le contenu est obligatoire';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await onSave({
        date_rdv: dateRdv,
        type_rdv: typeRdv || null,
        objet: objet.trim(),
        participants: participants.trim(),
        contenu: contenu.trim(),
        actions_a_suivre: actionsASuivre.trim(),
      });
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={note ? 'Modifier le compte-rendu' : 'Nouveau compte-rendu de RDV'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Date du RDV"
            type="date"
            value={dateRdv}
            onChange={(e) => setDateRdv(e.target.value)}
            error={errors.dateRdv}
          />
          <Select
            label="Type de RDV"
            value={typeRdv}
            onChange={(e) => setTypeRdv(e.target.value as MeetingTypeRdv | '')}
          >
            <option value="">-- Choisir --</option>
            {MEETING_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Input
            label="Objet / Sujet"
            type="text"
            placeholder="Ex: Bilan annuel, Point fiscal..."
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
            error={errors.objet}
          />
        </div>

        <Input
          label="Participants"
          type="text"
          placeholder="Ex: M. Dupont, Mme Martin, Comptable..."
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
        />

        <Textarea
          label="Compte-rendu / Synthese"
          placeholder="Resume du rendez-vous, points abordes, decisions prises..."
          rows={6}
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          error={errors.contenu}
        />

        <Textarea
          label="Actions a suivre"
          placeholder="Prochaines etapes, taches a realiser..."
          rows={3}
          value={actionsASuivre}
          onChange={(e) => setActionsASuivre(e.target.value)}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
