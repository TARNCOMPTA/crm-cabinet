import { memo } from 'react';
import { Card } from '../ui/Card';
import type { ContactWithCompanies } from '../../lib/contactsDirectoryService';
import { User, Phone, Smartphone, Mail, Building2, Pencil } from 'lucide-react';

interface ContactCardProps {
  contact: ContactWithCompanies;
  onClick: () => void;
  onEdit: () => void;
  selected?: boolean;
  hasSelection?: boolean;
  onToggleSelect?: () => void;
}

export const ContactCard = memo(function ContactCard({ contact, onClick, onEdit, selected, hasSelection, onToggleSelect }: ContactCardProps) {
  const companiesCount = contact.directory_contact_companies?.length || 0;

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
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-950/50 flex items-center justify-center">
              <User className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">
                {contact.first_name} {contact.last_name}
              </h3>
              {contact.role && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {contact.role}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5">
          {contact.phone && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <Phone className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <a
                href={`tel:${contact.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
              >
                {contact.phone}
              </a>
            </div>
          )}
          {contact.mobile && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <Smartphone className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <a
                href={`tel:${contact.mobile}`}
                onClick={(e) => e.stopPropagation()}
                className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
              >
                {contact.mobile}
              </a>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <Mail className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <a
                href={`mailto:${contact.email}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
              >
                {contact.email}
              </a>
            </div>
          )}
        </div>

        {companiesCount > 0 && (
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Building2 className="w-3.5 h-3.5" />
              <span className="truncate">
                {contact.directory_contact_companies
                  .slice(0, 2)
                  .map((l) => l.directory_companies?.name)
                  .filter(Boolean)
                  .join(', ')}
                {companiesCount > 2 && ` +${companiesCount - 2}`}
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
});
