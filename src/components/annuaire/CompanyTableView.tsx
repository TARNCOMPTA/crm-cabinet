import { memo } from 'react';
import { isClientCompany, type CompanyWithContacts, type ClientAsCompany } from '../../lib/contactsDirectoryService';
import { Pencil, Phone, Mail, Users } from 'lucide-react';

interface CompanyTableViewProps {
  companies: CompanyWithContacts[];
  selectedIds: Set<string>;
  hasSelection: boolean;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClick: (company: CompanyWithContacts) => void;
  onEdit: (company: CompanyWithContacts) => void;
}

export const CompanyTableView = memo(function CompanyTableView({
  companies,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClick,
  onEdit,
}: CompanyTableViewProps) {
  const allSelected = companies.length > 0 && companies.every((c) => selectedIds.has(c.id));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full min-w-[900px] text-sm">
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
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Forme juridique</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">SIREN</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Ville</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Telephone</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Email</th>
            <th className="px-3 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Contact principal</th>
            <th className="w-10 px-3 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {companies.map((company) => {
            const isClient = isClientCompany(company);
            const clientData = isClient ? (company as ClientAsCompany) : null;
            const primaryLink = company.directory_contact_companies?.find((l) => l.is_primary_contact);
            const primaryContact = primaryLink?.directory_contacts;
            const contactCount = company.directory_contact_companies?.length || 0;
            const selected = selectedIds.has(company.id);

            return (
              <tr
                key={company.id}
                onClick={() => onClick(company)}
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
                    onChange={() => onToggleSelect(company.id)}
                    className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {isClient && (
                      <span className="flex-shrink-0 w-1 h-5 rounded-full bg-teal-500" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">
                      {company.name}
                    </span>
                    {isClient && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 uppercase tracking-wide">
                        Client
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                  {company.legal_form || '-'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 font-mono text-xs">
                  {company.siren || '-'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                  {company.city || '-'}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {company.phone ? (
                    <a
                      href={`tel:${company.phone}`}
                      className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                    >
                      <Phone className="w-3 h-3" />
                      {company.phone}
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {company.email ? (
                    <a
                      href={`mailto:${company.email}`}
                      className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors truncate max-w-[180px]"
                    >
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{company.email}</span>
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                  {clientData?._contactPrincipal ? (
                    <span className="truncate max-w-[140px] block">{clientData._contactPrincipal}</span>
                  ) : primaryContact ? (
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[140px]">
                        {primaryContact.first_name} {primaryContact.last_name}
                      </span>
                      {contactCount > 1 && (
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs text-gray-400">
                          <Users className="w-3 h-3" />+{contactCount - 1}
                        </span>
                      )}
                    </div>
                  ) : contactCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                      <Users className="w-3 h-3" />{contactCount}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {!isClient && (
                    <button
                      onClick={() => onEdit(company)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
