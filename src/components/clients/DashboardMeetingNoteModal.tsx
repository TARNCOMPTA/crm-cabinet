import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { createMeetingNote, MEETING_TYPE_OPTIONS, type MeetingTypeRdv } from '../../lib/meetingNotesService';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Save, Search, Building, X } from 'lucide-react';

interface DashboardMeetingNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface ClientOption {
  id: string;
  nom_entreprise: string;
  siret: string | null;
  siren: string | null;
}

export function DashboardMeetingNoteModal({ isOpen, onClose, onCreated }: DashboardMeetingNoteModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      setSelectedClient(null);
      setClientSearch('');
      setDateRdv(new Date().toISOString().split('T')[0]);
      setTypeRdv('');
      setObjet('');
      setParticipants('');
      setContenu('');
      setActionsASuivre('');
      setErrors({});
      setShowDropdown(false);
      loadClients();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!showDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  async function loadClients() {
    if (!profile) return;
    const { data } = await supabase
      .from('clients')
      .select('id, nom_entreprise, siret, siren')
      .neq('statut', 'archive')
      .order('nom_entreprise');
    if (data) setClients(data);
  }

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const term = clientSearch.toLowerCase();
    return clients.filter(c =>
      c.nom_entreprise.toLowerCase().includes(term) ||
      c.siret?.includes(term) ||
      c.siren?.includes(term)
    );
  }, [clients, clientSearch]);

  function validate() {
    const newErrors: Record<string, string> = {};
    if (!selectedClient) newErrors.client = 'Veuillez selectionner un client';
    if (!dateRdv) newErrors.dateRdv = 'La date est obligatoire';
    if (!objet.trim()) newErrors.objet = "L'objet est obligatoire";
    if (!contenu.trim()) newErrors.contenu = 'Le contenu est obligatoire';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !selectedClient || !profile) return;

    setSaving(true);
    try {
      await createMeetingNote({
        client_id: selectedClient.id,
        created_by: profile.id,
        date_rdv: dateRdv,
        type_rdv: typeRdv || null,
        objet: objet.trim(),
        participants: participants.trim(),
        contenu: contenu.trim(),
        actions_a_suivre: actionsASuivre.trim(),
      });
      showToast('Compte-rendu cree avec succes', 'success');
      onCreated();
      onClose();
    } catch {
      showToast('Erreur lors de la creation du compte-rendu', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleSelectClient(client: ClientOption) {
    setSelectedClient(client);
    setClientSearch('');
    setShowDropdown(false);
    setErrors(prev => {
      const next = { ...prev };
      delete next.client;
      return next;
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouveau compte-rendu de RDV" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div ref={dropdownRef} className="relative">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Client
          </label>
          {selectedClient ? (
            <div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                  <Building className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedClient.nom_entreprise}</p>
                  {selectedClient.siren && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">SIREN: {selectedClient.siren}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Rechercher un client par nom ou SIREN..."
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm ${
                    errors.client
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
              </div>
              {showDropdown && (
                <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                  {filteredClients.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      Aucun client trouve
                    </div>
                  ) : (
                    filteredClients.map(client => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2.5 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <Building className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{client.nom_entreprise}</p>
                          {client.siren && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">{client.siren}</p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
          {errors.client && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.client}</p>
          )}
        </div>

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
              <option key={opt.value} value={opt.value}>{opt.label}</option>
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
