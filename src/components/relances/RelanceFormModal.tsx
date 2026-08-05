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
  RelanceInvoiceWithClient,
  createRelance,
  updateRelance,
} from '../../lib/relanceService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingItem?: RelanceInvoiceWithClient | null;
}

interface ClientOption {
  id: string;
  nom_entreprise: string;
  siren: string | null;
}

const STATUT_OPTIONS = [
  { value: 'en_attente', label: 'En attente' },
  { value: 'relancee', label: 'Relancee' },
  { value: 'contentieux', label: 'Contentieux' },
  { value: 'payee', label: 'Payee' },
];

const MODE_OPTIONS = [
  { value: '', label: '-- Aucun --' },
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'especes', label: 'Especes' },
  { value: 'prelevement', label: 'Prelevement' },
  { value: 'cb', label: 'Carte bancaire' },
  { value: 'autre', label: 'Autre' },
];

export function RelanceFormModal({ isOpen, onClose, onSaved, editingItem }: Props) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clientId, setClientId] = useState('');
  const [dateFacture, setDateFacture] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');
  const [numeroFacture, setNumeroFacture] = useState('');
  const [montant, setMontant] = useState('');
  const [statut, setStatut] = useState('en_attente');
  const [notes, setNotes] = useState('');
  const [dateReglement, setDateReglement] = useState('');
  const [montantRegle, setMontantRegle] = useState('');
  const [modeReglement, setModeReglement] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (editingItem) {
      setClientId(editingItem.client_id);
      setDateFacture(editingItem.date_facture);
      setDateEcheance(editingItem.date_echeance || '');
      setNumeroFacture(editingItem.numero_facture || '');
      setMontant(editingItem.montant?.toString() || '');
      setStatut(editingItem.statut);
      setNotes(editingItem.notes || '');
      setDateReglement(editingItem.date_reglement || '');
      setMontantRegle(editingItem.montant_regle ? editingItem.montant_regle.toString() : '');
      setModeReglement(editingItem.mode_reglement || '');
    } else {
      setClientId('');
      setDateFacture(new Date().toISOString().split('T')[0]);
      setDateEcheance('');
      setNumeroFacture('');
      setMontant('');
      setStatut('en_attente');
      setNotes('');
      setDateReglement('');
      setMontantRegle('');
      setModeReglement('');
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
    if (!clientId || !montant || !profile) return;

    setSaving(true);
    try {
      if (editingItem) {
        await updateRelance(editingItem.id, {
          client_id: clientId,
          date_facture: dateFacture,
          date_echeance: dateEcheance || null,
          numero_facture: numeroFacture || null,
          montant: parseFloat(montant),
          statut,
          notes: notes || null,
          date_reglement: dateReglement || null,
          montant_regle: montantRegle ? parseFloat(montantRegle) : 0,
          mode_reglement: modeReglement || '',
        });
      } else {
        await createRelance({
          client_id: clientId,
          date_facture: dateFacture,
          date_echeance: dateEcheance || null,
          numero_facture: numeroFacture || null,
          montant: parseFloat(montant),
          statut,
          notes: notes || null,
        });
      }
      onSaved();
      onClose();
    } catch {
      // handled by caller
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingItem ? 'Modifier la facture' : 'Nouvelle facture impayee'}
      size="lg"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Numero de facture"
            value={numeroFacture}
            onChange={(e) => setNumeroFacture(e.target.value)}
            placeholder="Ex: FA-2026-001"
          />

          <Input
            label="Montant (EUR)"
            type="number"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            placeholder="Ex: 1500.00"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Date de facture"
            type="date"
            value={dateFacture}
            onChange={(e) => setDateFacture(e.target.value)}
            required
          />

          <Input
            label="Date d'echeance"
            type="date"
            value={dateEcheance}
            onChange={(e) => setDateEcheance(e.target.value)}
          />
        </div>

        {editingItem && (
          <Select
            label="Statut"
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
          >
            {STATUT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        )}

        {editingItem && (statut === 'payee' || dateReglement) && (
          <div className="border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3 bg-green-50/50 dark:bg-green-900/10">
            <p className="text-xs font-medium text-green-700 dark:text-green-300 uppercase tracking-wider">
              Reglement
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Date de reglement"
                type="date"
                value={dateReglement}
                onChange={(e) => setDateReglement(e.target.value)}
              />
              <Input
                label="Montant regle (EUR)"
                type="number"
                value={montantRegle}
                onChange={(e) => setMontantRegle(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <Select
              label="Mode de reglement"
              value={modeReglement}
              onChange={(e) => setModeReglement(e.target.value)}
            >
              {MODE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
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
          <Button type="submit" disabled={saving || !clientId || !montant}>
            {saving ? 'Enregistrement...' : editingItem ? 'Modifier' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
