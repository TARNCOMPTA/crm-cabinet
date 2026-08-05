import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CopyButton } from '../ui/CopyButton';
import { useAuth } from '../../contexts/AuthContext';
import {
  deleteContact,
  linkContactToCompany,
  unlinkContactFromCompany,
  isClientCompany,
  ensureDirectoryCompanyFromClient,
  type CompanyWithContacts,
  type ContactWithCompanies,
  type ClientAsCompany,
} from '../../lib/contactsDirectoryService';
import {
  Building2, Pencil, Trash2,
  Link2, X, Loader, FileText, Star,
} from 'lucide-react';

interface ContactDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: ContactWithCompanies;
  companies: CompanyWithContacts[];
  onRefresh: () => Promise<void>;
  onEdit: () => void;
}

export function ContactDetailModal({
  isOpen, onClose, contact, companies, onRefresh, onEdit,
}: ContactDetailModalProps) {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkCompanyId, setLinkCompanyId] = useState('');
  const [linkRole, setLinkRole] = useState('');
  const [linking, setLinking] = useState(false);

  const linkedCompanyIds = new Set(
    (contact.directory_contact_companies || []).map((l) => l.company_id)
  );
  const availableCompanies = companies.filter((c) => !linkedCompanyIds.has(c.id));

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteContact(contact.id);
      showToast('Contact supprime', 'success');
      await onRefresh();
      onClose();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleLinkCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!linkCompanyId || !profile || !profile?.id) return;
    setLinking(true);
    try {
      let resolvedId = linkCompanyId;
      const selectedCompany = companies.find((c) => c.id === linkCompanyId);
      if (selectedCompany && isClientCompany(selectedCompany)) {
        resolvedId = await ensureDirectoryCompanyFromClient(
          selectedCompany as ClientAsCompany,
          profile.id
        );
      }
      await linkContactToCompany(contact.id, resolvedId, linkRole, false);
      showToast('Societe rattachee', 'success');
      setShowLinkForm(false);
      setLinkCompanyId('');
      setLinkRole('');
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
      showToast('Societe detachee', 'success');
      await onRefresh();
    } catch {
      showToast('Erreur', 'error');
    }
  }

  const infoRows = [
    { label: 'Prenom', value: contact.first_name, href: undefined as string | undefined },
    { label: 'Nom', value: contact.last_name, href: undefined as string | undefined },
    { label: 'Fonction', value: contact.role, href: undefined as string | undefined },
    { label: 'Telephone fixe', value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : undefined },
    { label: 'Mobile', value: contact.mobile, href: contact.mobile ? `tel:${contact.mobile}` : undefined },
    { label: 'Email', value: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined },
  ].filter((r) => r.value?.trim());

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`${contact.first_name} ${contact.last_name}`}
        size="lg"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-2">
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
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {infoRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">{row.label}</span>
                <div className="flex items-center gap-2">
                  {row.href ? (
                    <a
                      href={row.href}
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

          {contact.notes?.trim() && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                Notes
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 whitespace-pre-wrap">
                {contact.notes}
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Societes rattachees ({contact.directory_contact_companies?.length || 0})
              </h4>
              {availableCompanies.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLinkForm(!showLinkForm)}
                >
                  <Link2 className="w-4 h-4 mr-1.5" />
                  Rattacher
                </Button>
              )}
            </div>

            {showLinkForm && (
              <form
                onSubmit={handleLinkCompany}
                className="mb-4 p-3 border border-teal-200 dark:border-teal-900 rounded-lg bg-teal-50/50 dark:bg-teal-950/20 space-y-3"
              >
                <Select
                  label="Societe"
                  value={linkCompanyId}
                  onChange={(e) => setLinkCompanyId(e.target.value)}
                  required
                >
                  <option value="">Selectionner une societe</option>
                  {availableCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.siren ? ` (${c.siren})` : ''}{isClientCompany(c) ? ' [Client]' : ''}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Role dans la societe"
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value)}
                  placeholder="Gerant, Comptable, Secretaire..."
                />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" type="submit" disabled={linking || !linkCompanyId}>
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

            {(contact.directory_contact_companies?.length || 0) === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                Aucune societe rattachee
              </p>
            ) : (
              <div className="space-y-2">
                {contact.directory_contact_companies.map((link) => {
                  const comp = link.directory_companies;
                  return (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {comp?.name}
                          </span>
                          {link.is_primary_contact && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                          )}
                        </div>
                        {link.role_in_company && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-6">
                            {link.role_in_company}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleUnlink(link.id)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors ml-2"
                        title="Detacher"
                      >
                        <X className="w-4 h-4" />
                      </button>
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
        title="Supprimer le contact"
        message={`Etes-vous sur de vouloir supprimer "${contact.first_name} ${contact.last_name}" de l'annuaire ? Les rattachements aux societes seront egalement supprimes.`}
        confirmText="Supprimer"
        loading={deleting}
      />
    </>
  );
}
