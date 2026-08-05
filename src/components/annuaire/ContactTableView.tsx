import { memo } from 'react';
import type { ContactWithCompanies } from '../../lib/contactsDirectoryService';
import { Pencil, Phone, Smartphone, Mail, Building2, User } from 'lucide-react';

interface ContactTableViewProps {
  contacts: ContactWithCompanies[];
  selectedIds: Set<string>;
  hasSelection: boolean;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClick: (contact: ContactWithCompanies) => void;
  onEdit: (contact: ContactWithCompanies) => void;
}

export const ContactTableView = memo(function ContactTableView({
  contacts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClick,
  onEdit,
}: ContactTableViewProps) {
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <th className="w-10 px-3 py-3 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
                className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700"
              />
            </th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Nom</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Fonction</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Telephone</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Mobile</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Email</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Societes</th>
            <th className="w-10 px-3 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {contacts.map((contact) => {
            const selected = selectedIds.has(contact.id);
            const companies = contact.directory_contact_companies
              ?.map((l) => l.directory_companies?.name)
              .filter(Boolean) || [];

            return (
              <tr
                key={contact.id}
                onClick={() => onClick(contact)}
                className={`cursor-pointer group transition-colors ${
                  selected
                    ? 'bg-teal-50/50 dark:bg-teal-950/20'
                    : 'even:bg-gray-50/50 dark:even:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(contact.id)}
                    className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-50 dark:bg-teal-950/50 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]">
                      {contact.first_name} {contact.last_name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                  {contact.role || '-'}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                    >
                      <Phone className="w-3 h-3" />
                      {contact.phone}
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {contact.mobile ? (
                    <a
                      href={`tel:${contact.mobile}`}
                      className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                    >
                      <Smartphone className="w-3 h-3" />
                      {contact.mobile}
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors truncate max-w-[180px]"
                    >
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                  {companies.length > 0 ? (
                    <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                      <Building2 className="w-3 h-3 flex-shrink-0 text-gray-400" />
                      <span className="truncate">
                        {companies.slice(0, 2).join(', ')}
                        {companies.length > 2 && ` +${companies.length - 2}`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onEdit(contact)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
