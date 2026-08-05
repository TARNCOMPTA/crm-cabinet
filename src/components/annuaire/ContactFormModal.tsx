import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import {
  createContact,
  updateContact,
  linkContactToCompany,
  unlinkContactFromCompany,
  isClientCompany,
  ensureDirectoryCompanyFromClient,
  type ContactWithCompanies,
  type CompanyWithContacts,
  type DirectoryCompany,
  type ClientAsCompany,
} from '../../lib/contactsDirectoryService';
import { Loader, Building2, Search, X, Users } from 'lucide-react';

interface LinkedCompanyEntry {
  // La jointure ne rapporte que la fiche societe, sans ses contacts : annoncer
  // `CompanyWithContacts` promettait une liste que rien ne remplit.
  company: DirectoryCompany;
  role_in_company: string;
  existingLinkId?: string;
}

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: ContactWithCompanies | null;
  onSaved: () => Promise<void>;
  companies?: CompanyWithContacts[];
}

const ROLE_SUGGESTIONS = [
  'Gerant',
  'Associe',
  'Directeur',
  'DAF',
  'Comptable',
  'Secretaire',
  'Juriste',
  'Avocat',
  'Notaire',
  'Expert-comptable',
  'Commissaire aux comptes',
  'Banquier',
  'Assureur',
];

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  role: '',
  phone: '',
  mobile: '',
  email: '',
  notes: '',
};

export function ContactFormModal({ isOpen, onClose, contact, onSaved, companies = [] }: ContactFormModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);

  const [linkedCompanies, setLinkedCompanies] = useState<LinkedCompanyEntry[]>([]);
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyResults, setShowCompanyResults] = useState(false);
  const companySearchRef = useRef<HTMLDivElement>(null);

  const isEditing = !!contact;

  useEffect(() => {
    if (isOpen) {
      if (contact) {
        setForm({
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          role: contact.role || '',
          phone: contact.phone || '',
          mobile: contact.mobile || '',
          email: contact.email || '',
          notes: contact.notes || '',
        });
        const existing = (contact.directory_contact_companies || []).map((link) => ({
          company: link.directory_companies,
          role_in_company: link.role_in_company || '',
          existingLinkId: link.id,
        }));
        setLinkedCompanies(existing);
      } else {
        setForm(EMPTY_FORM);
        setLinkedCompanies([]);
      }
      setShowRoleSuggestions(false);
      setCompanySearch('');
      setShowCompanyResults(false);
    }
  }, [isOpen, contact]);

  const linkedCompanyIds = useMemo(
    () => new Set(linkedCompanies.map((l) => l.company.id)),
    [linkedCompanies]
  );

  const companyResults = useMemo(() => {
    if (!companySearch.trim()) return [];
    const term = companySearch.toLowerCase();
    return companies
      .filter((c) => !linkedCompanyIds.has(c.id))
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(term) ||
          c.siren?.toLowerCase().includes(term) ||
          c.siret?.toLowerCase().includes(term)
      )
      .slice(0, 12);
  }, [companies, companySearch, linkedCompanyIds]);

  async function resolveCompanyId(entry: LinkedCompanyEntry): Promise<string> {
    if (isClientCompany(entry.company)) {
      return ensureDirectoryCompanyFromClient(
        entry.company as ClientAsCompany,
        profile!.id
      );
    }
    return entry.company.id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    if (!profile || !profile?.id) return;

    setSaving(true);
    try {
      let contactId: string;

      if (isEditing) {
        await updateContact(contact!.id, form);
        contactId = contact!.id;

        const originalLinkIds = new Set(
          (contact!.directory_contact_companies || []).map((l) => l.id)
        );
        const currentLinkIds = new Set(
          linkedCompanies.filter((l) => l.existingLinkId).map((l) => l.existingLinkId!)
        );

        for (const origId of originalLinkIds) {
          if (!currentLinkIds.has(origId)) {
            await unlinkContactFromCompany(origId);
          }
        }

        for (const entry of linkedCompanies) {
          if (!entry.existingLinkId) {
            const companyId = await resolveCompanyId(entry);
            await linkContactToCompany(contactId, companyId, entry.role_in_company, false);
          }
        }
      } else {
        const created = await createContact(profile.id, form);
        contactId = created.id;

        for (const entry of linkedCompanies) {
          const companyId = await resolveCompanyId(entry);
          await linkContactToCompany(contactId, companyId, entry.role_in_company, false);
        }
      }

      showToast(
        isEditing ? 'Contact modifie' : 'Contact ajoute a l\'annuaire',
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
  }

  function addCompany(company: DirectoryCompany) {
    setLinkedCompanies((prev) => [...prev, { company, role_in_company: '' }]);
    setCompanySearch('');
    setShowCompanyResults(false);
  }

  function removeCompany(companyId: string) {
    setLinkedCompanies((prev) => prev.filter((l) => l.company.id !== companyId));
  }

  function updateCompanyRole(companyId: string, role: string) {
    setLinkedCompanies((prev) =>
      prev.map((l) => (l.company.id === companyId ? { ...l, role_in_company: role } : l))
    );
  }

  const filteredSuggestions = ROLE_SUGGESTIONS.filter(
    (r) => !form.role || r.toLowerCase().includes(form.role.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Modifier le contact' : 'Ajouter un contact'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Prenom *"
            value={form.first_name}
            onChange={(e) => set('first_name', e.target.value)}
            placeholder="Prenom"
            required
          />
          <Input
            label="Nom *"
            value={form.last_name}
            onChange={(e) => set('last_name', e.target.value)}
            placeholder="Nom de famille"
            required
          />
        </div>

        <div className="relative">
          <Input
            label="Fonction / Role"
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
            onFocus={() => setShowRoleSuggestions(true)}
            onBlur={() => setTimeout(() => setShowRoleSuggestions(false), 200)}
            placeholder="Gerant, Comptable, DAF..."
          />
          {showRoleSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    set('role', suggestion);
                    setShowRoleSuggestions(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Telephone fixe"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="01 23 45 67 89"
          />
          <Input
            label="Mobile"
            value={form.mobile}
            onChange={(e) => set('mobile', e.target.value)}
            placeholder="06 12 34 56 78"
          />
        </div>

        <Input
          label="Email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="prenom.nom@email.fr"
          type="email"
        />

        <Textarea
          label="Notes"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          placeholder="Notes internes..."
        />

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Entreprises liees
            </span>
            {linkedCompanies.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                {linkedCompanies.length}
              </span>
            )}
          </div>

          {companies.length > 0 ? (
            <>
              <div className="relative" ref={companySearchRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher une societe ou un client par nom ou SIREN..."
                  value={companySearch}
                  onChange={(e) => {
                    setCompanySearch(e.target.value);
                    setShowCompanyResults(true);
                  }}
                  onFocus={() => {
                    if (companySearch.trim()) setShowCompanyResults(true);
                  }}
                  onBlur={() => setTimeout(() => setShowCompanyResults(false), 200)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                />

                {showCompanyResults && companySearch.trim() && (
                  <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl">
                    {companyResults.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                        Aucune societe trouvee
                      </p>
                    ) : (
                      companyResults.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addCompany(company);
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0"
                        >
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {company.name}
                          </span>
                          {isClientCompany(company) && (
                            <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                              <Users className="w-3 h-3" />
                              Client
                            </span>
                          )}
                          {company.siren && (
                            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                              SIREN {company.siren}
                            </span>
                          )}
                          {company.city && (
                            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                              — {company.city}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {linkedCompanies.length > 0 && (
                <div className="space-y-2">
                  {linkedCompanies.map((entry) => (
                    <div
                      key={entry.company.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50"
                    >
                      <Building2 className="w-4 h-4 text-blue-500 mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {entry.company.name}
                          </span>
                          {entry.company.siren && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                              {entry.company.siren}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Role dans la societe (optionnel)"
                          value={entry.role_in_company}
                          onChange={(e) => updateCompanyRole(entry.company.id, e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCompany(entry.company.id)}
                        className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0 mt-0.5"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Aucune societe disponible. Ajoutez d'abord une societe depuis l'onglet Societes ou creez un client.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={saving || !form.first_name.trim() || !form.last_name.trim()}
          >
            {saving && <Loader className="w-4 h-4 animate-spin mr-2" />}
            {isEditing ? 'Modifier' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
