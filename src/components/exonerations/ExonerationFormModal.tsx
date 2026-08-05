import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Textarea } from '../ui/Textarea';
import {
  EXONERATION_TYPES,
  ExonerationWithClient,
  createExoneration,
  updateExoneration,
} from '../../lib/exonerationService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingItem?: ExonerationWithClient | null;
}

interface ClientOption {
  id: string;
  nom_entreprise: string;
  siren: string | null;
}

export function ExonerationFormModal({ isOpen, onClose, onSaved, editingItem }: Props) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clientId, setClientId] = useState('');
  const [typeExoneration, setTypeExoneration] = useState('ZFU');
  const [dateDebut, setDateDebut] = useState('');
  const [montant, setMontant] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (editingItem) {
      setClientId(editingItem.client_id);
      setTypeExoneration(editingItem.type_exoneration);
      setDateDebut(editingItem.date_debut);
      setMontant(editingItem.montant?.toString() || '');
      setNotes(editingItem.notes || '');
    } else {
      setClientId('');
      setTypeExoneration('ZFU');
      setDateDebut('');
      setMontant('');
      setNotes('');
    }
  }, [isOpen, editingItem]);

  useEffect(() => {
    if (!isOpen || !profile) return;

    const loadClients = async () => {
      setLoadingClients(true);
      const { data } = await supabase
        .from('clients')
        .select('id, nom_entreprise, siren')
        .eq('statut', 'actif')
        .order('nom_entreprise');

      setClients(data || []);
      setLoadingClients(false);
    };

    loadClients();
  }, [isOpen, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !dateDebut) return;

    setSaving(true);
    try {
      if (editingItem) {
        await updateExoneration(editingItem.id, {
          client_id: clientId,
          type_exoneration: typeExoneration,
          date_debut: dateDebut,
          montant: montant ? parseFloat(montant) : null,
          notes: notes || null,
        });
      } else {
        await createExoneration({
          client_id: clientId,
          type_exoneration: typeExoneration,
          date_debut: dateDebut,
          montant: montant ? parseFloat(montant) : null,
          notes: notes || null,
        });
      }
      onSaved();
      onClose();
    } catch {
      // error handled by caller
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingItem ? 'Modifier l\'exoneration' : 'Nouvelle exoneration'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <SearchableSelect
          label="Client"
          value={clientId}
          onChange={setClientId}
          disabled={loadingClients}
          placeholder={loadingClients ? 'Chargement...' : 'Rechercher un client...'}
          required
          options={clients.map((c) => ({
            value: c.id,
            label: c.nom_entreprise,
            subtitle: c.siren || undefined,
          }))}
        />

        <Select
          label="Type d'exoneration"
          value={typeExoneration}
          onChange={(e) => setTypeExoneration(e.target.value)}
        >
          {EXONERATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>

        <Input
          label="Date de debut"
          type="date"
          value={dateDebut}
          onChange={(e) => setDateDebut(e.target.value)}
          required
        />

        {editingItem && (
          <Input
            label="Montant (optionnel)"
            type="number"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="Ex: 50000"
            min="0"
            step="0.01"
          />
        )}

        <Textarea
          label="Notes (optionnel)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Informations complementaires..."
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || !clientId || !dateDebut}>
            {saving ? 'Enregistrement...' : editingItem ? 'Modifier' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
