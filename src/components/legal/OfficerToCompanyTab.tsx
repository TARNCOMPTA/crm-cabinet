import { useState, useMemo } from 'react';
import { Badge } from '../ui/Badge';
import { SortButton } from '../ui/SortButton';
import { ChevronDown, ChevronRight, Users, Building2, Search, Clock, Calendar, Globe, Building, CircleUser as UserCircle } from 'lucide-react';
import { OfficerWithCompanies } from './legalTypes';
import { isEntrepreneurIndividuel, EI_LABEL } from '../../lib/legalFormsUtils';
import { LegalFormDisplay } from '../clients/LegalFormDisplay';

interface OfficerToCompanyTabProps {
  officers: OfficerWithCompanies[];
  clientCount: number;
  excludedClientIds?: Set<string>;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSortChange: (field: string) => void;
}

export function OfficerToCompanyTab({ officers, clientCount, excludedClientIds = new Set(), sortField, sortDir, onSortChange }: OfficerToCompanyTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  const searched = officers.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${o.first_name} ${o.last_name}`.toLowerCase();
    const denom = (o.denomination || '').toLowerCase();
    const companies = o.mandates.map(m => m.client.nom_entreprise.toLowerCase()).join(' ');
    return name.includes(q) || denom.includes(q) || companies.includes(q);
  });

  const filtered = useMemo(() => {
    return [...searched].sort((a, b) => {
      let cmp = 0;
      const nameA = a.person_type === 'morale' ? (a.denomination || a.last_name) : `${a.last_name} ${a.first_name}`;
      const nameB = b.person_type === 'morale' ? (b.denomination || b.last_name) : `${b.last_name} ${b.first_name}`;
      switch (sortField) {
        case 'nom':
          cmp = nameA.localeCompare(nameB);
          break;
        case 'mandats_total':
          cmp = a.mandates.length - b.mandates.length;
          break;
        case 'mandats_actifs':
          cmp = a.mandates.filter(m => m.is_active).length - b.mandates.filter(m => m.is_active).length;
          break;
        default:
          cmp = nameA.localeCompare(nameB);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [searched, sortField, sortDir]);

  const totalMandates = officers.reduce((sum, o) => sum + o.mandates.length, 0);
  const activeMandates = officers.reduce(
    (sum, o) => sum + o.mandates.filter(m => m.is_active).length, 0
  );

  if (officers.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-16 text-center">
        <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        {clientCount === 0 ? (
          <>
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">Aucun client dans ce cabinet</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Ajoutez des clients pour voir leurs dirigeants.</p>
          </>
        ) : (
          <>
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">Aucun dirigeant enregistre</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Synchronisez vos clients avec l'INPI pour importer les dirigeants.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Dirigeants</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{officers.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Building2 className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Mandats</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalMandates}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Actifs</span>
          </div>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{activeMandates}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un dirigeant, une societe..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Trier :</span>
        <SortButton label="Nom" field="nom" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="Mandats total" field="mandats_total" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="Mandats actifs" field="mandats_actifs" activeField={sortField} direction={sortDir} onSort={onSortChange} />
      </div>

      <div className="space-y-3">
        {filtered.map((officer) => {
          const isOpen = expanded.has(officer.id);
          const isMorale = officer.person_type === 'morale';
          const displayName = isMorale
            ? (officer.denomination || officer.last_name)
            : `${officer.first_name} ${officer.last_name}`;
          const activeCount = officer.mandates.filter(m => m.is_active).length;

          return (
            <div
              key={officer.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden transition-shadow hover:shadow-md"
            >
              <div
                className="flex items-center gap-4 px-4 py-3.5 cursor-pointer select-none"
                onClick={() => toggle(officer.id)}
              >
                <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                  {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </div>
                <div className="flex-shrink-0">
                  {isMorale ? (
                    <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                      <Building className="w-4.5 h-4.5 text-amber-700 dark:text-amber-400" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                      <UserCircle className="w-4.5 h-4.5 text-teal-700 dark:text-teal-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{displayName}</span>
                    <Badge variant={isMorale ? 'warning' : 'info'} className="text-[10px]">
                      {isMorale ? 'PM' : 'PP'}
                    </Badge>
                  </div>
                  {officer.nationality && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Globe className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{officer.nationality}</span>
                    </div>
                  )}
                </div>
                <Badge variant={activeCount > 0 ? 'success' : 'default'}>
                  {activeCount} actif{activeCount !== 1 ? 's' : ''} / {officer.mandates.length}
                </Badge>
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 px-4 py-3 space-y-2">
                  {[...officer.mandates].sort((a, b) => a.client.nom_entreprise.localeCompare(b.client.nom_entreprise)).map((mandate) => {
                    const isMandateExcluded = excludedClientIds.has(mandate.client.id);
                    return (
                      <div key={mandate.id} className={`rounded-lg border p-3 ${
                        isMandateExcluded
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      } ${mandate.is_active ? 'border-l-4 border-l-green-400 dark:border-l-green-500' : 'border-l-4 border-l-gray-300 dark:border-l-gray-600'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium ${isMandateExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{mandate.client.nom_entreprise}</p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {mandate.client.siren && (
                                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{mandate.client.siren}</span>
                              )}
                              {mandate.client.forme_juridique && (
                                isEntrepreneurIndividuel(mandate.client.forme_juridique)
                                  ? <Badge variant="violet" className="text-[10px]">{EI_LABEL}</Badge>
                                  : <span className={`text-xs ${isMandateExcluded ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}><LegalFormDisplay value={mandate.client.forme_juridique} /></span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {mandate.role} - Du {new Date(mandate.start_date).toLocaleDateString('fr-FR')}
                              {mandate.end_date && ` au ${new Date(mandate.end_date).toLocaleDateString('fr-FR')}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant={mandate.is_active ? 'success' : 'default'}>
                              {mandate.is_active ? 'Actif' : 'Termine'}
                            </Badge>
                            <Badge variant={mandate.source === 'inpi' ? 'blue' : 'gray'}>
                              {mandate.source === 'inpi' ? 'INPI' : 'Manuel'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && search && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-12 text-center">
            <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucun resultat pour "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
