import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import {
  createCompany,
  updateCompany,
  createContact,
  linkContactToCompany,
  searchCabinetClients,
  type CompanyWithContacts,
} from '../../lib/contactsDirectoryService';
import { searchCompanyByINPI, type INPICompanyData } from '../../lib/inpiService';
import { getLegalFormLabel } from '../../lib/legalFormsUtils';
import { Search, Loader, UserPlus, Check, Building2, ArrowDownToLine } from 'lucide-react';

/*
 * `parseClientAddress` a ete supprimee ici.
 *
 * C'etait le meilleur des cinq parseurs concurrents — le seul a traiter le cas
 * SANS virgule en plus de la virgule la plus a droite — et c'est a ce titre qu'il
 * a servi de reference pour `decouperAdresse` (src/lib/adresseHeritee.ts) et pour
 * le remplissage SQL de l'increment 002.
 *
 * Il n'a plus lieu d'etre : `clients` porte desormais les composants, et cet
 * ecran les lit directement.
 */

interface CompanyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyWithContacts | null;
  onSaved: () => Promise<void>;
}

const EMPTY_FORM = {
  name: '',
  siren: '',
  siret: '',
  legal_form: '',
  address: '',
  postal_code: '',
  city: '',
  phone: '',
  email: '',
  website: '',
  notes: '',
};

export function CompanyFormModal({ isOpen, onClose, company, onSaved }: CompanyFormModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<any[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [createPrimaryContact, setCreatePrimaryContact] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const inpiTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [inpiSearching, setInpiSearching] = useState(false);
  const [inpiResult, setInpiResult] = useState<INPICompanyData | null>(null);
  const [inpiError, setInpiError] = useState<string | null>(null);
  const [inpiApplied, setInpiApplied] = useState(false);
  const lastInpiQuery = useRef('');

  const isEditing = !!company;

  useEffect(() => {
    if (isOpen) {
      if (company) {
        setForm({
          name: company.name || '',
          siren: company.siren || '',
          siret: company.siret || '',
          legal_form: company.legal_form || '',
          address: company.address || '',
          postal_code: company.postal_code || '',
          city: company.city || '',
          phone: company.phone || '',
          email: company.email || '',
          website: company.website || '',
          notes: company.notes || '',
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setClientQuery('');
      setClientResults([]);
      setSelectedClient(null);
      setCreatePrimaryContact(false);
      setInpiResult(null);
      setInpiError(null);
      setInpiApplied(false);
      lastInpiQuery.current = '';
    }
  }, [isOpen, company]);

  function handleClientSearch(query: string) {
    setClientQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim() || !profile) {
      setClientResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const results = await searchCabinetClients(query);
        setClientResults(results);
      } catch {
        setClientResults([]);
      } finally {
        setSearchingClients(false);
      }
    }, 300);
  }

  function handleSelectClient(client: any) {
    setSelectedClient(client);
    setForm({
      name: client.nom_entreprise || '',
      siren: client.siren || '',
      siret: client.siret || '',
      legal_form: client.forme_juridique || '',
      address: client.adresse_ligne1 || '',
      postal_code: client.code_postal || '',
      city: client.ville || '',
      phone: client.telephone || '',
      email: client.email || '',
      website: '',
      notes: '',
    });
    setClientQuery('');
    setClientResults([]);
    if (client.contact_principal?.trim()) {
      setCreatePrimaryContact(true);
    }
  }

  const triggerInpiSearch = useCallback((siren: string) => {
    const cleaned = siren.replace(/\s/g, '');
    if (cleaned.length !== 9 && cleaned.length !== 14) {
      setInpiResult(null);
      setInpiError(null);
      setInpiApplied(false);
      lastInpiQuery.current = '';
      return;
    }
    if (cleaned === lastInpiQuery.current) return;
    lastInpiQuery.current = cleaned;

    if (inpiTimeout.current) clearTimeout(inpiTimeout.current);
    setInpiResult(null);
    setInpiError(null);
    setInpiApplied(false);

    inpiTimeout.current = setTimeout(async () => {
      setInpiSearching(true);
      try {
        const result = await searchCompanyByINPI(cleaned);
        if (result.success && result.data) {
          setInpiResult(result.data);
          setInpiError(null);
        } else {
          setInpiResult(null);
          setInpiError(result.message || 'Aucun resultat INPI');
        }
      } catch {
        setInpiError('Erreur lors de la recherche INPI');
      } finally {
        setInpiSearching(false);
      }
    }, 600);
  }, []);

  async function applyInpiData(data: INPICompanyData) {
    const formeLabel = await getLegalFormLabel(data.formeJuridique);
    setForm((prev) => ({
      ...prev,
      name: data.denomination || prev.name,
      siren: data.siren || prev.siren,
      siret: data.siret || prev.siret,
      legal_form: formeLabel || prev.legal_form,
      address: [data.adresse?.ligne1, data.adresse?.complement].filter(Boolean).join(' - ') || prev.address,
      postal_code: data.adresse?.codePostal || prev.postal_code,
      city: data.adresse?.ville || prev.city,
    }));
    setInpiApplied(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!profile || !profile?.id) return;

    setSaving(true);
    try {
      if (isEditing) {
        await updateCompany(company!.id, form);
      } else {
        const newCompany = await createCompany(profile.id, form);

        if (createPrimaryContact && selectedClient?.contact_principal?.trim()) {
          const nameParts = selectedClient.contact_principal.trim().split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          const contact = await createContact(profile.id, {
            first_name: firstName,
            last_name: lastName,
            phone: selectedClient.telephone || '',
            email: selectedClient.email || '',
          });

          await linkContactToCompany(contact.id, newCompany.id, 'Contact principal', true);
        }
      }

      showToast(
        isEditing ? 'Societe modifiee' : 'Societe ajoutee a l\'annuaire',
        'success'
      );
      await onSaved();
      onClose();
    } catch {
      showToast('Erreur lors de l\'enregistrement', 'error');
    } finally {
      setSaving(false);
    }
  }

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'siren') {
      triggerInpiSearch(value);
    } else if (field === 'siret') {
      const cleaned = value.replace(/\s/g, '');
      if (cleaned.length === 14) {
        triggerInpiSearch(cleaned);
      }
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Modifier la societe' : 'Ajouter une societe'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {!isEditing && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
              Pre-remplir depuis un client existant
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher par nom ou SIREN..."
                value={clientQuery}
                onChange={(e) => handleClientSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-blue-300 dark:border-blue-800 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              {searchingClients && (
                <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />
              )}
            </div>
            {clientResults.length > 0 && (
              <ul className="mt-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
                {clientResults.map((client) => (
                  <li
                    key={client.id}
                    onClick={() => handleSelectClient(client)}
                    className="px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {client.nom_entreprise}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[client.siren && `SIREN ${client.siren}`, client.forme_juridique].filter(Boolean).join(' - ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {selectedClient && (
              <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <Check className="w-4 h-4" />
                Pre-rempli depuis {selectedClient.nom_entreprise}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Denomination *"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Nom de la societe"
            required
          />
          <Input
            label="Forme juridique"
            value={form.legal_form}
            onChange={(e) => set('legal_form', e.target.value)}
            placeholder="SAS, SARL, SCI..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="SIREN"
            value={form.siren}
            onChange={(e) => set('siren', e.target.value)}
            placeholder="123 456 789"
          />
          <Input
            label="SIRET"
            value={form.siret}
            onChange={(e) => set('siret', e.target.value)}
            placeholder="123 456 789 00012"
          />
        </div>

        {inpiSearching && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30">
            <Loader className="w-4 h-4 animate-spin text-teal-600 dark:text-teal-400" />
            <span className="text-sm text-teal-700 dark:text-teal-300">Recherche INPI en cours...</span>
          </div>
        )}

        {inpiResult && !inpiApplied && (
          <div className="p-3 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 flex-shrink-0 text-teal-600 dark:text-teal-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-teal-800 dark:text-teal-200 truncate">
                    {inpiResult.denomination}
                  </p>
                  <p className="text-xs text-teal-600 dark:text-teal-400">
                    {[inpiResult.formeJuridique, inpiResult.adresse?.ville].filter(Boolean).join(' - ')}
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => applyInpiData(inpiResult)}
              >
                <ArrowDownToLine className="w-3.5 h-3.5 mr-1" />
                Pre-remplir
              </Button>
            </div>
          </div>
        )}

        {inpiApplied && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30">
            <Check className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-sm text-teal-700 dark:text-teal-300">Informations INPI appliquees</span>
          </div>
        )}

        {inpiError && !inpiSearching && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <span className="text-xs text-gray-500 dark:text-gray-400">{inpiError}</span>
          </div>
        )}

        <Input
          label="Adresse"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="Adresse complete"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Code postal"
            value={form.postal_code}
            onChange={(e) => set('postal_code', e.target.value)}
            placeholder="75001"
          />
          <Input
            label="Ville"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="Paris"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Telephone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="01 23 45 67 89"
          />
          <Input
            label="Email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="contact@societe.fr"
          />
        </div>

        <Input
          label="Site web"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
          placeholder="https://www.societe.fr"
        />

        <Textarea
          label="Notes"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          placeholder="Notes internes..."
        />

        {!isEditing && selectedClient?.contact_principal?.trim() && (
          <label className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 cursor-pointer">
            <input
              type="checkbox"
              checked={createPrimaryContact}
              onChange={(e) => setCreatePrimaryContact(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-amber-800 dark:text-amber-200">
                Creer automatiquement le contact principal : <strong>{selectedClient.contact_principal}</strong>
              </span>
            </div>
          </label>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" type="submit" disabled={saving || !form.name.trim()}>
            {saving && <Loader className="w-4 h-4 animate-spin mr-2" />}
            {isEditing ? 'Modifier' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
