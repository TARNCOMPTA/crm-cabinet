import { memo } from 'react';
import { Card } from '../ui/Card';
import { isClientCompany, type CompanyWithContacts, type ClientAsCompany } from '../../lib/contactsDirectoryService';
import { Building2, Phone, Mail, MapPin, Star, Pencil, User } from 'lucide-react';

interface CompanyCardProps {
  company: CompanyWithContacts;
  onClick: () => void;
  onEdit: () => void;
  selected?: boolean;
  hasSelection?: boolean;
  onToggleSelect?: () => void;
}

export const CompanyCard = memo(function CompanyCard({ company, onClick, onEdit, selected, hasSelection, onToggleSelect }: CompanyCardProps) {
  const isClient = isClientCompany(company);
  const clientData = isClient ? (company as ClientAsCompany) : null;
  const primaryLink = company.directory_contact_companies?.find((l) => l.is_primary_contact);
  const primaryContact = primaryLink?.directory_contacts;
  const contactCount = company.directory_contact_companies?.length || 0;

  return (
    <Card className={`hover:shadow-md transition-shadow cursor-pointer group relative ${
      selected ? 'ring-2 ring-teal-500 dark:ring-teal-400' : ''
    }`}>
      {onToggleSelect && (
        <div
          className={`absolute top-2.5 left-2.5 z-10 transition-opacity ${
            hasSelection || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700 shadow-sm"
          />
        </div>
      )}
      <div onClick={onClick} className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
              isClient
                ? 'bg-teal-50 dark:bg-teal-950/50'
                : 'bg-blue-50 dark:bg-blue-950/50'
            }`}>
              <Building2 className={`w-5 h-5 ${isClient ? 'text-teal-600 dark:text-teal-400' : 'text-blue-600 dark:text-blue-400'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">
                  {company.name}
                </h3>
                {isClient && (
                  <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 uppercase tracking-wide">
                    Client
                  </span>
                )}
              </div>
              {company.legal_form && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {company.legal_form}
                </p>
              )}
            </div>
          </div>
          {!isClient && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {company.siren && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            SIREN {company.siren}
          </p>
        )}

        <div className="space-y-1.5">
          {(company.address || company.city) && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <span className="truncate">
                {[company.address, company.postal_code, company.city].filter(Boolean).join(', ')}
              </span>
            </div>
          )}
          {company.phone && (
            <div
              className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <a
                href={`tel:${company.phone}`}
                className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
              >
                {company.phone}
              </a>
            </div>
          )}
          {company.email && (
            <div
              className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
              onClick={(e) => e.stopPropagation()}
            >
              <Mail className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <a
                href={`mailto:${company.email}`}
                className="truncate hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
              >
                {company.email}
              </a>
            </div>
          )}
        </div>

        {clientData?._contactPrincipal && (
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {clientData._contactPrincipal}
              </span>
            </div>
          </div>
        )}

        {!isClient && primaryContact && (
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 flex-wrap">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {primaryContact.first_name} {primaryContact.last_name}
              </span>
              {primaryLink.role_in_company && (
                <span className="text-xs text-gray-400">
                  - {primaryLink.role_in_company}
                </span>
              )}
              {(primaryContact.mobile || primaryContact.phone) && (
                <span onClick={(e) => e.stopPropagation()}>
                  <a
                    href={`tel:${primaryContact.mobile || primaryContact.phone}`}
                    className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                  >
                    <Phone className="w-3 h-3" />
                    {primaryContact.mobile || primaryContact.phone}
                  </a>
                </span>
              )}
            </div>
          </div>
        )}

        {contactCount > 0 && (
          <div className="space-y-1 text-xs text-gray-400 dark:text-gray-500">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{contactCount} contact{contactCount > 1 ? 's' : ''}</span>
            </div>
            {company.directory_contact_companies.slice(0, 2).map((l) => {
              const c = l.directory_contacts;
              if (!c) return null;
              const tel = c.mobile || c.phone;
              return (
                <div key={l.id} className="flex items-center gap-1.5 pl-5 text-gray-500 dark:text-gray-400">
                  <User className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{c.first_name} {c.last_name}</span>
                  {tel && (
                    <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                      <span className="text-gray-300 dark:text-gray-600">-</span>
                      <a
                        href={`tel:${tel}`}
                        className="flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors flex-shrink-0"
                      >
                        <Phone className="w-3 h-3" />
                        {tel}
                      </a>
                    </span>
                  )}
                </div>
              );
            })}
            {contactCount > 2 && (
              <span className="pl-5 text-gray-400">+{contactCount - 2} autre{contactCount - 2 > 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {clientData?._numeroDossier && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <span>Dossier {clientData._numeroDossier}</span>
          </div>
        )}
      </div>
    </Card>
  );
});
