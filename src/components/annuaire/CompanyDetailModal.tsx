import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CopyButton } from '../ui/CopyButton';
import {
  deleteCompany,
  linkContactToCompany,
  unlinkContactFromCompany,
  setPrimaryContact,
  removePrimaryContact,
  isClientCompany,
  type CompanyWithContacts,
  type ContactWithCompanies,
  type ClientAsCompany,
} from '../../lib/contactsDirectoryService';
import {
  Building2, Star, Pencil,
  Trash2, UserPlus, X, Loader, FileText, User,
} from 'lucide-react';

interface CompanyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyWithContacts;
  contacts: ContactWithCompanies[];
  onRefresh: () => Promise<void>;
  onEdit: () => void;
}

export function CompanyDetailModal({
  isOpen, onClose, company, contacts, onRefresh, onEdit,
}: CompanyDetailModalProps) {
  const { showToast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkContactId, setLinkContactId] = useState('');
  const [linkRole, setLinkRole] = useState('');
  const [linkAsPrimary, setLinkAsPrimary] = useState(false);
  const [linking, setLinking] = useState(false);

  const isClient = isClientCompany(company);
  const clientData = isClient ? (company as ClientAsCompany) : null;

  const linkedContactIds = new Set(
    (company.directory_contact_companies || []).map((l) => l.contact_id)
  );
  const availableContacts = contacts.filter((c) => !linkedContactIds.has(c.id));

  const sortedLinks = [...(company.directory_contact_companies || [])].sort((a, b) => {
    if (a.is_primary_contact && !b.is_primary_contact) return -1;
    if (!a.is_primary_contact && b.is_primary_contact) return 1;
    return 0;
  });

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCompany(company.id);
      showToast('Societe supprimee', 'success');
      await onRefresh();
      onClose();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleLinkContact(e: React.FormEvent) {
    e.preventDefault();
    if (!linkContactId) return;
    setLinking(true);
    try {
      await linkContactToCompany(linkContactId, company.id, linkRole, linkAsPrimary);
      showToast('Contact rattache', 'success');
      setShowLinkForm(false);
      setLinkContactId('');
      setLinkRole('');
      setLinkAsPrimary(false);
      await onRefresh();
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
      await onRefresh();
    } catch {
      showToast('Erreur', 'error');
    }
  }

  async function handleTogglePrimary(linkId: string, currentlyPrimary: boolean) {
    try {
      if (currentlyPrimary) {
        await removePrimaryContact(linkId);
      } else {
        await setPrimaryContact(linkId, company.id);
      }
      showToast(currentlyPrimary ? 'Contact principal retire' : 'Contact principal defini', 'success');
      await onRefresh();
    } catch {
      showToast('Erreur', 'error');
    }
  }

  const infoRows = [
    { label: 'Denomination', value: company.name, href: undefined as string | undefined },
    { label: 'Forme juridique', value: company.legal_form, href: undefined as string | undefined },
    { label: 'SIREN', value: company.siren, href: undefined as string | undefined },
    { label: 'SIRET', value: company.siret, href: undefined as string | undefined },
    { label: 'Adresse', value: [company.address, company.postal_code, company.city].filter(Boolean).join(', '), href: undefined as string | undefined },
    { label: 'Telephone', value: company.phone, href: company.phone ? `tel:${company.phone}` : undefined },
    { label: 'Email', value: company.email, href: company.email ? `mailto:${company.email}` : undefined },
    { label: 'Site web', value: company.website, href: company.website ? (company.website.startsWith('http') ? company.website : `https://${company.website}`) : undefined },
    ...(clientData?._contactPrincipal ? [{ label: 'Contact principal', value: clientData._contactPrincipal, href: undefined as string | undefined }] : []),
    ...(clientData?._dirigeant ? [{ label: 'Dirigeant', value: clientData._dirigeant, href: undefined as string | undefined }] : []),
    ...(clientData?._numeroDossier ? [{ label: 'N° dossier', value: clientData._numeroDossier, href: undefined as string | undefined }] : []),
  ].filter((r) => r.value?.trim());

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={company.name} size="lg">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            {isClient ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                <Building2 className="w-3.5 h-3.5" />
                Client du cabinet
              </span>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Modifier
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Supprimer
                </Button>
              </>
            )}
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {infoRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">{row.label}</span>
                <div className="flex items-center gap-2">
                  {row.href ? (
                    <a
                      href={row.href}
                      target={row.label === 'Site web' ? '_blank' : undefined}
                      rel={row.label === 'Site web' ? 'noopener noreferrer' : undefined}
                      className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors text-right"
                    >
                      {row.value}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 text-right">
                      {row.value}
                    </span>
                  )}
                  <CopyButton value={row.value!} label={row.label} />
                </div>
              </div>
            ))}
          </div>

          {company.notes?.trim() && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                Notes
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 whitespace-pre-wrap">
                {company.notes}
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Contacts rattaches ({sortedLinks.length})
              </h4>
              {availableContacts.length > 0 && (
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

            {showLinkForm && (
              <form
                onSubmit={handleLinkContact}
                className="mb-4 p-3 border border-teal-200 dark:border-teal-900 rounded-lg bg-teal-50/50 dark:bg-teal-950/20 space-y-3"
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

            {sortedLinks.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                Aucun contact rattache
              </p>
            ) : (
              <div className="space-y-2">
                {sortedLinks.map((link) => {
                  const contact = link.directory_contacts;
                  return (
                    <div
                      key={link.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        link.is_primary_contact
                          ? 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20'
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {link.is_primary_contact && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                          )}
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {contact.first_name} {contact.last_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {link.role_in_company && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {link.role_in_company}
                            </span>
                          )}
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                            >
                              {contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                              className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                            >
                              {contact.phone}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => handleTogglePrimary(link.id, link.is_primary_contact)}
                          className={`p-1.5 rounded-md transition-colors ${
                            link.is_primary_contact
                              ? 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                              : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                          title={link.is_primary_contact ? 'Retirer contact principal' : 'Definir comme contact principal'}
                        >
                          <Star className={`w-4 h-4 ${link.is_primary_contact ? 'fill-amber-500' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleUnlink(link.id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Detacher le contact"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Supprimer la societe"
        message={`Etes-vous sur de vouloir supprimer "${company.name}" de l'annuaire ? Les rattachements aux contacts seront egalement supprimes.`}
        confirmText="Supprimer"
        loading={deleting}
      />
    </>
  );
}
