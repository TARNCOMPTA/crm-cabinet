import { memo, useState, useCallback } from 'react';
import { isClientCompany, type CompanyWithContacts } from '../../lib/contactsDirectoryService';
import { Building2, User, Phone, Mail, MapPin, Pencil, ChevronRight, Star } from 'lucide-react';

interface CompanyListViewProps {
  companies: CompanyWithContacts[];
  selectedIds: Set<string>;
  hasSelection: boolean;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClick: (company: CompanyWithContacts) => void;
  onEdit: (company: CompanyWithContacts) => void;
}

export const CompanyListView = memo(function CompanyListView({
  companies,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClick,
  onEdit,
}: CompanyListViewProps) {
  const allSelected = companies.length > 0 && companies.every((c) => selectedIds.has(c.id));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = useCallback((e: React.MouseEvent, companyId: string) => {
    e.stopPropagation();
    setExpandedId((prev) => (prev === companyId ? null : companyId));
  }, []);

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
          {companies.length} societe{companies.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {companies.map((company) => {
          const isClient = isClientCompany(company);
          const contacts = company.directory_contact_companies || [];
          const contactCount = contacts.length;
          const selected = selectedIds.has(company.id);
          const isExpanded = expandedId === company.id;

          return (
            <div key={company.id}>
              <div
                onClick={() => onClick(company)}
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
                    onChange={() => onToggleSelect(company.id)}
                    className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 dark:bg-gray-700"
                  />
                </div>

                <div className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${
                  isClient
                    ? 'bg-teal-50 dark:bg-teal-950/50'
                    : 'bg-blue-50 dark:bg-blue-950/50'
                }`}>
                  <Building2 className={`w-3.5 h-3.5 ${isClient ? 'text-teal-600 dark:text-teal-400' : 'text-blue-600 dark:text-blue-400'}`} />
                </div>

                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
                    {company.name}
                  </span>
                  {isClient && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 uppercase tracking-wide">
                      Client
                    </span>
                  )}
                </div>

                {company.city && (
                  <div className="hidden md:flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 w-28 truncate">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{company.city}</span>
                  </div>
                )}

                <div className="hidden lg:block flex-shrink-0 w-28" onClick={(e) => e.stopPropagation()}>
                  {company.phone ? (
                    <a
                      href={`tel:${company.phone}`}
                      className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                    >
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{company.phone}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </div>

                <div className="hidden lg:block flex-shrink-0 w-44" onClick={(e) => e.stopPropagation()}>
                  {company.email ? (
                    <a
                      href={`mailto:${company.email}`}
                      className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                    >
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{company.email}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </div>

                {contactCount > 0 ? (
                  <button
                    onClick={(e) => toggleExpand(e, company.id)}
                    className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 hover:text-teal-600 dark:hover:text-teal-400 transition-colors rounded-md px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <User className="w-3 h-3" />
                    <span>{contactCount}</span>
                    <ChevronRight
                      className={`w-3 h-3 transition-transform duration-200 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                ) : (
                  <div className="w-[52px] flex-shrink-0" />
                )}

                <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {!isClient && (
                    <button
                      onClick={() => onEdit(company)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && contactCount > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
                  <div className="pl-14 pr-4 py-1.5 space-y-0.5">
                    {contacts.map((cc) => {
                      const contact = cc.directory_contacts;
                      if (!contact) return null;

                      return (
                        <div
                          key={cc.id}
                          className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors"
                        >
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-teal-700 dark:text-teal-300" />
                          </div>

                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate min-w-0">
                            {contact.first_name} {contact.last_name}
                          </span>

                          {cc.is_primary_contact && (
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500 flex-shrink-0" />
                          )}

                          {cc.role_in_company && (
                            <span className="hidden sm:inline text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              {cc.role_in_company}
                            </span>
                          )}

                          <div className="ml-auto flex items-center gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {contact.phone && (
                              <a
                                href={`tel:${contact.phone}`}
                                className="hidden md:inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                              >
                                <Phone className="w-3 h-3" />
                                <span className="hidden lg:inline truncate max-w-[100px]">{contact.phone}</span>
                              </a>
                            )}
                            {contact.email && (
                              <a
                                href={`mailto:${contact.email}`}
                                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                              >
                                <Mail className="w-3 h-3" />
                                <span className="hidden lg:inline truncate max-w-[140px]">{contact.email}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
