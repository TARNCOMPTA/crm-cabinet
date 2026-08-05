import { useState, useEffect } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { createCard } from '../../lib/opportunityService';
import type { OpportunityColumn } from '../../types/database';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  columns: OpportunityColumn[];
  onCreated: () => void;
}

type ContactMode = 'client' | 'prospect';

export function OpportunityCreateModal({ isOpen, onClose, columns, onCreated }: Props) {
  const { user, profile } = useAuth();
  const [mode, setMode] = useState<ContactMode>('prospect');
  const [clientId, setClientId] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [montant, setMontant] = useState('');
  const [source, setSource] = useState('');
  const [dateRelance, setDateRelance] = useState('');
  const [notes, setNotes] = useState('');
  const [comment, setComment] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [saving, setSaving] = useState(false);

  const [clients, setClients] = useState<Array<{ value: string; label: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; display_name: string | null; prenom: string | null; nom: string | null }>>([]);

  useEffect(() => {
    if (isOpen) {
      loadClients();
      loadUsers();
      setMode('prospect');
      setClientId('');
      setProspectName('');
      setMontant('');
      setSource('');
      setDateRelance('');
      setNotes('');
      setComment('');
      setAssigneeId('');
    }
  }, [isOpen]);

  async function loadClients() {
    const { data } = await supabase
      .from('clients')
      .select('id, nom_entreprise, siren, numero_dossier')
      .in('statut', ['actif', 'prospect', 'inactif'])
      .order('nom_entreprise');

    if (data) {
      setClients(data.map(c => ({
        value: c.id,
        label: `${c.nom_entreprise}${c.siren ? ` (${c.siren})` : ''}${c.numero_dossier ? ` - ${c.numero_dossier}` : ''}`,
      })));
    }
  }

  async function loadUsers() {
    if (!profile) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, prenom, nom')
      .eq('is_active', true)
      .order('nom');
    if (data) setUsers(data);
  }

  const isValid = mode === 'client' ? !!clientId : prospectName.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || columns.length === 0) return;

    setSaving(true);
    try {
      const { data: maxRow } = await supabase
        .from('opportunity_cards')
        .select('position')
        .eq('column_id', columns[0].id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPosition = (maxRow?.position ?? -1) + 1;

      await createCard({
        client_id: mode === 'client' ? clientId : null,
        prospect_name: mode === 'prospect' ? prospectName.trim() : null,
        column_id: columns[0].id,
        assignee_id: assigneeId || null,
        montant_estime: montant ? parseFloat(montant) : null,
        source: source || null,
        date_relance: dateRelance || null,
        notes: notes || null,
        comment: comment || null,
        created_by: user?.id || null,
        position: nextPosition,
      });
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouvelle opportunite" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Type de contact
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMode('prospect'); setClientId(''); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                mode === 'prospect'
                  ? 'bg-teal-50 dark:bg-teal-900/40 border-teal-300 dark:border-teal-600 text-teal-700 dark:text-teal-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Nouveau prospect
            </button>
            <button
              type="button"
              onClick={() => { setMode('client'); setProspectName(''); }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                mode === 'client'
                  ? 'bg-teal-50 dark:bg-teal-900/40 border-teal-300 dark:border-teal-600 text-teal-700 dark:text-teal-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Users className="w-4 h-4" />
              Client existant
            </button>
          </div>
        </div>

        {mode === 'prospect' ? (
          <Input
            label="Nom du prospect"
            value={prospectName}
            onChange={(e) => setProspectName(e.target.value)}
            placeholder="Nom de l'entreprise ou du contact..."
            required
          />
        ) : (
          <SearchableSelect
            label="Client"
            options={clients}
            value={clientId}
            onChange={setClientId}
            placeholder="Rechercher un client..."
            required
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Collaborateur"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            options={[
              { value: '', label: 'Non assigne' },
              ...users.map((u) => ({ value: u.id, label: u.display_name || `${u.prenom || ''} ${u.nom || ''}`.trim() })),
            ]}
          />
          <Input
            label="Montant estime (EUR)"
            type="number"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <Textarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ajouter des notes..."
        />

        <Textarea
          label="Commentaire"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Ajouter un commentaire..."
        />

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={saving || !isValid}>
            {saving ? 'Creation...' : 'Creer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
