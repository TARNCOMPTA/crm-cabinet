import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import {
  fetchContactsForClient,
  fetchContacts,
  ensureDirectoryCompanyForClientData,
  linkContactToCompany,
  unlinkContactFromCompany,
  setPrimaryContact,
  removePrimaryContact,
  type ClientDirectoryContactLink,
  type ContactWithCompanies,
} from '../../lib/contactsDirectoryService';
import {
  BookUser, Star, UserPlus, X, Loader, Plus,
} from 'lucide-react';

interface ClientDirectoryContactsProps {
  clientId: string;
  siren: string | null | undefined;
  siret: string | null | undefined;
  nomEntreprise: string | null | undefined;
  formeJuridique: string | null | undefined;
  // Les composants, et non la chaine : `directory_companies` porte deja
  // `address`/`postal_code`/`city`, la correspondance est directe.
  adresseLigne1: string | null | undefined;
  codePostal: string | null | undefined;
  ville: string | null | undefined;
  email: string | null | undefined;
  telephone: string | null | undefined;
}

export function ClientDirectoryContacts({
  siren,
  siret,
  nomEntreprise,
  formeJuridique,
  adresseLigne1,
  codePostal,
  ville,
  email,
  telephone,
}: ClientDirectoryContactsProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ClientDirectoryContactLink[]>([]);
  const [allContacts, setAllContacts] = useState<ContactWithCompanies[]>([]);
  const [creating, setCreating] = useState(false);

  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkContactId, setLinkContactId] = useState('');
  const [linkRole, setLinkRole] = useState('');
  const [linkAsPrimary, setLinkAsPrimary] = useState(false);
  const [linking, setLinking] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const result = await fetchContactsForClient(siren, siret);
      setCompanyId(result.companyId);
      setContacts(result.contacts);

      const all = await fetchContacts();
      setAllContacts(all);
    } catch {
      showToast('Erreur lors du chargement des contacts annuaire', 'error');
    } finally {
      setLoading(false);
    }
  }, [siren, siret]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateEntry() {
    if (!profile) return;
    setCreating(true);
    try {
      const id = await ensureDirectoryCompanyForClientData(profile.id, {
        nom_entreprise: nomEntreprise,
        siren,
        siret,
        forme_juridique: formeJuridique,
        adresse_ligne1: adresseLigne1,
        code_postal: codePostal,
        ville,
        email,
        telephone,
      });
      setCompanyId(id);
      showToast('Entree annuaire creee', 'success');
      await loadData();
    } catch {
      showToast('Erreur lors de la creation', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleLinkContact(e: React.FormEvent) {
    e.preventDefault();
    if (!linkContactId || !companyId) return;
    setLinking(true);
    try {
      await linkContactToCompany(linkContactId, companyId, linkRole, linkAsPrimary);
      showToast('Contact rattache', 'success');
      setShowLinkForm(false);
      setLinkContactId('');
      setLinkRole('');
      setLinkAsPrimary(false);
      await loadData();
    } catch {
      showToast('Erreur lors du rattachement', 'error');
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink(linkId: string) {
    try {
      await unlinkContactFromCompany(linkId);
      showToast('Contact detache', 'success');
      await loadData();
    } catch {
      showToast('Erreur', 'error');
    }
  }

  async function handleTogglePrimary(linkId: string, currentlyPrimary: boolean) {
    if (!companyId) return;
    try {
      if (currentlyPrimary) {
        await removePrimaryContact(linkId);
      } else {
        await setPrimaryContact(linkId, companyId);
      }
      showToast(currentlyPrimary ? 'Contact principal retire' : 'Contact principal defini', 'success');
      await loadData();
    } catch {
      showToast('Erreur', 'error');
    }
  }

  const linkedContactIds = new Set(contacts.map((c) => c.contactId));
  const availableContacts = allContacts.filter((c) => !linkedContactIds.has(c.id));

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 mb-4">
            <BookUser className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Contacts annuaire</h2>
          </div>
          <div className="flex items-center justify-center py-6">
            <Loader className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookUser className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Contacts annuaire
              {contacts.length > 0 && (
                <span className="ml-1.5 text-sm font-normal text-gray-400">({contacts.length})</span>
              )}
            </h2>
          </div>
          {companyId && availableContacts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkForm(!showLinkForm)}
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              Rattacher
            </Button>
          )}
        </div>

        {!companyId ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-3">
              Aucune societe correspondante dans l'annuaire
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateEntry}
              disabled={creating}
            >
              {creating ? (
                <Loader className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Plus className="w-4 h-4 mr-1.5" />
              )}
              Creer l'entree dans l'annuaire
            </Button>
          </div>
        ) : (
          <>
            {showLinkForm && (
              <form
                onSubmit={handleLinkContact}
                className="mb-4 p-3 border border-teal-200 rounded-lg bg-teal-50/50 space-y-3"
              >
                <Select
                  label="Contact"
                  value={linkContactId}
                  onChange={(e) => setLinkContactId(e.target.value)}
                  required
                >
                  <option value="">Selectionner un contact</option>
                  {availableContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}{c.role ? ` (${c.role})` : ''}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Role dans la societe"
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value)}
                  placeholder="Gerant, Comptable, Secretaire..."
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={linkAsPrimary}
                    onChange={(e) => setLinkAsPrimary(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  Definir comme contact principal
                </label>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" type="submit" disabled={linking || !linkContactId}>
                    {linking && <Loader className="w-4 h-4 animate-spin mr-1.5" />}
                    Rattacher
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setShowLinkForm(false)}
                  >
                    Annuler
                  </Button>
                </div>
              </form>
            )}

            {contacts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Aucun contact rattache
              </p>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.linkId}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      contact.isPrimary
                        ? 'border-amber-200 bg-amber-50/50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {contact.isPrimary && (
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-gray-900">
                          {contact.firstName} {contact.lastName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {contact.roleInCompany && (
                          <span className="text-xs text-gray-500">
                            {contact.roleInCompany}
                          </span>
                        )}
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-xs text-teal-600 hover:text-teal-700 transition-colors"
                          >
                            {contact.email}
                          </a>
                        )}
                        {(contact.phone || contact.mobile) && (
                          <a
                            href={`tel:${contact.mobile || contact.phone}`}
                            className="text-xs text-teal-600 hover:text-teal-700 transition-colors"
                          >
                            {contact.mobile || contact.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => handleTogglePrimary(contact.linkId, contact.isPrimary)}
                        className={`p-1.5 rounded-md transition-colors ${
                          contact.isPrimary
                            ? 'text-amber-500 hover:bg-amber-100'
                            : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100'
                        }`}
                        title={contact.isPrimary ? 'Retirer contact principal' : 'Definir comme contact principal'}
                      >
                        <Star className={`w-4 h-4 ${contact.isPrimary ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleUnlink(contact.linkId)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Detacher le contact"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
