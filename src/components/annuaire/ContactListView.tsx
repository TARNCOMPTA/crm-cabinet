import { memo } from 'react';
import type { ContactWithCompanies } from '../../lib/contactsDirectoryService';
import { Phone, Smartphone, Mail, Building2, Pencil, User } from 'lucide-react';

interface ContactListViewProps {
  contacts: ContactWithCompanies[];
  selectedIds: Set<string>;
  hasSelection: boolean;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClick: (contact: ContactWithCompanies) => void;
  onEdit: (contact: ContactWithCompanies) => void;
}

export const ContactListView = memo(function ContactListView({
  contacts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClick,
  onEdit,
}: ContactListViewProps) {
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700"
        />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {contacts.length} contact{contacts.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {contacts.map((contact) => {
          const selected = selectedIds.has(contact.id);
          const companies = contact.directory_contact_companies
            ?.map((l) => l.directory_companies?.name)
            .filter(Boolean) || [];

          return (
            <div
              key={contact.id}
              onClick={() => onClick(contact)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer group transition-colors ${
                selected
                  ? 'bg-teal-50/50 dark:bg-teal-950/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(contact.id)}
                  className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700"
                />
              </div>

              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-50 dark:bg-teal-950/50 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              </div>

              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
                  {contact.first_name} {contact.last_name}
                </span>
                {contact.role && (
                  <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                    {contact.role}
                  </span>
                )}
              </div>

              <div className="hidden md:block flex-shrink-0 w-28" onClick={(e) => e.stopPropagation()}>
                {(contact.phone || contact.mobile) ? (
                  <a
                    href={`tel:${contact.mobile || contact.phone}`}
                    className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                  >
                    {contact.mobile ? (
                      <Smartphone className="w-3 h-3 flex-shrink-0" />
                    ) : (
                      <Phone className="w-3 h-3 flex-shrink-0" />
                    )}
                    <span className="truncate">{contact.mobile || contact.phone}</span>
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </div>

              <div className="hidden lg:block flex-shrink-0 w-44" onClick={(e) => e.stopPropagation()}>
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                  >
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{contact.email}</span>
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </div>

              {companies.length > 0 && (
                <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 max-w-[140px]">
                  <Building2 className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">
                    {companies.slice(0, 1).join(', ')}
                    {companies.length > 1 && ` +${companies.length - 1}`}
                  </span>
                </div>
              )}

              <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onEdit(contact)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
