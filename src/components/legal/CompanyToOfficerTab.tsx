import { useState, useMemo } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { SortButton } from '../ui/SortButton';
import { ChevronDown, ChevronRight, Users, Building2, Search, Plus, Pencil, Trash2, RefreshCw, Clock, Calendar, Building, CircleUser as UserCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isEntrepreneurIndividuel, EI_LABEL } from '../../lib/legalFormsUtils';
import { LegalFormDisplay } from '../clients/LegalFormDisplay';
import { OfficerFormModal } from './OfficerFormModal';
import { SyncSettingsPanel } from './SyncSettingsPanel';
import { ClientWithOfficers, CompanyOfficer, OfficerCompany } from './legalTypes';

interface CompanyToOfficerTabProps {
  clientsWithOfficers: ClientWithOfficers[];
  onReload: () => void;
  onSyncAll: () => void;
  syncing?: boolean;
  showToast: (msg: string, type: 'success' | 'error') => void;
  excludedClientIds?: Set<string>;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSortChange: (field: string) => void;
}

export function CompanyToOfficerTab({
  clientsWithOfficers,
  onReload,
  onSyncAll,
  syncing,
  showToast,
  excludedClientIds = new Set(),
  sortField,
  sortDir,
  onSortChange,
}: CompanyToOfficerTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    officer: CompanyOfficer;
    relation: OfficerCompany;
    clientName: string;
  } | null>(null);
  const [addTarget, setAddTarget] = useState<{ clientId: string; clientName: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  const searched = clientsWithOfficers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = c.nom_entreprise.toLowerCase();
    const siren = (c.siren || '').toLowerCase();
    const officers = c.officers.map(o =>
      `${o.officer.first_name} ${o.officer.last_name} ${o.officer.denomination || ''}`
    ).join(' ').toLowerCase();
    return name.includes(q) || siren.includes(q) || officers.includes(q);
  });

  const filtered = useMemo(() => {
    return [...searched].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'nom_entreprise':
          cmp = a.nom_entreprise.localeCompare(b.nom_entreprise);
          break;
        case 'siren': {
          const sa = a.siren || a.siret?.substring(0, 9) || '';
          const sb = b.siren || b.siret?.substring(0, 9) || '';
          cmp = sa.localeCompare(sb);
          break;
        }
        case 'nombre_dirigeants':
          cmp = a.officers.length - b.officers.length;
          break;
        case 'capital_social':
          cmp = (Number(a.capital_social) || 0) - (Number(b.capital_social) || 0);
          break;
        default:
          cmp = a.nom_entreprise.localeCompare(b.nom_entreprise);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [searched, sortField, sortDir]);

  const totalOfficers = clientsWithOfficers.reduce((sum, c) => sum + c.officers.length, 0);
  const withOfficers = clientsWithOfficers.filter(c => c.officers.length > 0).length;
  const withoutOfficers = clientsWithOfficers.length - withOfficers;

  async function handleSaveOfficer(
    data: any,
    officerId?: string,
    relationId?: string
  ) {
    const clientId = editTarget ? editTarget.relation.client_id : addTarget?.clientId;
    if (!clientId) return;

    if (officerId && relationId) {
      await supabase.from('company_officers').update({
        first_name: data.firstName,
        last_name: data.lastName,
        person_type: data.personType,
        denomination: data.personType === 'morale' ? data.denomination : null,
        birth_date: data.birthDate || null,
        nationality: data.nationality || null,
        source: 'manual',
        updated_at: new Date().toISOString(),
      }).eq('id', officerId);

      await supabase.from('officer_companies').update({
        role: data.role,
        start_date: data.startDate,
        end_date: data.endDate || null,
        is_active: data.isActive,
        notes: data.notes || null,
        source: 'manual',
        updated_at: new Date().toISOString(),
      }).eq('id', relationId);
    } else {
      const { data: newOfficer } = await supabase
        .from('company_officers')
        .insert({
          first_name: data.firstName || '',
          last_name: data.lastName,
          person_type: data.personType,
          denomination: data.personType === 'morale' ? data.denomination : null,
          birth_date: data.birthDate || null,
          nationality: data.nationality || null,
          source: 'manual',
        })
        .select('id')
        .maybeSingle();

      if (newOfficer) {
        await supabase.from('officer_companies').insert({
          officer_id: newOfficer.id,
          client_id: clientId,
          role: data.role,
          start_date: data.startDate,
          end_date: data.endDate || null,
          is_active: data.isActive,
          notes: data.notes || null,
          source: 'manual',
        });
      }
    }

    showToast('Dirigeant enregistre', 'success');
    onReload();
  }

  async function handleDelete(relationId: string, officerId: string) {
    setDeleting(relationId);
    try {
      await supabase.from('officer_companies').delete().eq('id', relationId);

      const { data: remaining } = await supabase
        .from('officer_companies')
        .select('id')
        .eq('officer_id', officerId);

      if (!remaining || remaining.length === 0) {
        await supabase.from('company_officers').delete().eq('id', officerId);
      }

      showToast('Dirigeant supprime', 'success');
      onReload();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setDeleting(null);
    }
  }

  if (clientsWithOfficers.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-16 text-center">
        <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">Aucun client dans ce cabinet</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Ajoutez des clients pour voir leurs dirigeants.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Building2 className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Societes</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{clientsWithOfficers.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Dirigeants</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalOfficers}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-orange-500 dark:text-orange-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Sans dirigeant</span>
          </div>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{withoutOfficers}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une societe, un SIREN, un dirigeant..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <Button
          onClick={onSyncAll}
          disabled={syncing}
          size="sm"
          className="flex items-center gap-2 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchronisation...' : 'Tout synchroniser'}
        </Button>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Trier :</span>
        <SortButton label="Nom" field="nom_entreprise" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="SIREN" field="siren" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="Nb dirigeants" field="nombre_dirigeants" activeField={sortField} direction={sortDir} onSort={onSortChange} />
        <SortButton label="Capital" field="capital_social" activeField={sortField} direction={sortDir} onSort={onSortChange} />
      </div>

      <SyncSettingsPanel />

      <div className="space-y-3">
        {filtered.map((client) => {
          const isOpen = expanded.has(client.id);
          const siren = client.siren || client.siret?.substring(0, 9) || '';
          const hasOfficers = client.officers.length > 0;
          const hasDirigeantFallback = !hasOfficers && client.dirigeant;
          const isExcluded = excludedClientIds.has(client.id);

          return (
            <div
              key={client.id}
              className={`rounded-xl overflow-hidden transition-shadow hover:shadow-md border ${
                isExcluded
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              <div
                className="flex items-center gap-4 px-4 py-3.5 cursor-pointer select-none"
                onClick={() => toggle(client.id)}
              >
                <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                  {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold truncate ${isExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {client.nom_entreprise}
                    </span>
                    {siren && <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{siren}</span>}
                    {client.forme_juridique && (
                      isEntrepreneurIndividuel(client.forme_juridique)
                        ? <Badge variant="violet" className="text-[10px]">{EI_LABEL}</Badge>
                        : <Badge variant={isExcluded ? 'danger' : 'gray'} className="text-[10px]"><LegalFormDisplay value={client.forme_juridique} /></Badge>
                    )}
                  </div>
                  {Number(client.capital_social) > 0 ? (
                    <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 block">
                      Capital: {Number(client.capital_social).toLocaleString('fr-FR')} EUR
                    </span>
                  ) : isEntrepreneurIndividuel(client.forme_juridique) ? (
                    <span className="text-xs text-violet-600 dark:text-violet-400 font-medium mt-0.5 block">{EI_LABEL}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {hasOfficers ? (
                    <Badge variant="info">
                      {client.officers.length} dirigeant{client.officers.length !== 1 ? 's' : ''}
                    </Badge>
                  ) : hasDirigeantFallback ? (
                    <Badge variant="warning">Non structure</Badge>
                  ) : (
                    <Badge variant="default">Aucun</Badge>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 px-4 py-3 space-y-2">
                  {[...client.officers].sort((a, b) => {
                    const nameA = a.officer.person_type === 'morale' ? (a.officer.denomination || a.officer.last_name) : `${a.officer.last_name} ${a.officer.first_name}`;
                    const nameB = b.officer.person_type === 'morale' ? (b.officer.denomination || b.officer.last_name) : `${b.officer.last_name} ${b.officer.first_name}`;
                    return nameA.localeCompare(nameB);
                  }).map((rel) => {
                    const isMorale = rel.officer.person_type === 'morale';
                    const displayName = isMorale
                      ? (rel.officer.denomination || rel.officer.last_name)
                      : `${rel.officer.first_name} ${rel.officer.last_name}`;

                    return (
                      <div key={rel.id} className={`rounded-lg border p-3 ${
                        rel.is_active
                          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 border-l-4 border-l-green-400 dark:border-l-green-500'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 border-l-4 border-l-gray-300 dark:border-l-gray-600'
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="flex-shrink-0 mt-0.5">
                              {isMorale ? (
                                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                                  <Building className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                                  <UserCircle className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{displayName}</p>
                                <Badge variant={isMorale ? 'warning' : 'info'} className="text-[10px]">
                                  {isMorale ? 'Personne morale' : 'Personne physique'}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {rel.role} - Du {new Date(rel.start_date).toLocaleDateString('fr-FR')}
                                {rel.end_date && ` au ${new Date(rel.end_date).toLocaleDateString('fr-FR')}`}
                              </p>
                              {rel.officer.birth_date && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                  Ne(e) le {new Date(rel.officer.birth_date).toLocaleDateString('fr-FR')}
                                  {rel.officer.nationality && ` - ${rel.officer.nationality}`}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Badge variant={rel.is_active ? 'success' : 'default'}>
                              {rel.is_active ? 'Actif' : 'Termine'}
                            </Badge>
                            <Badge variant={rel.source === 'inpi' ? 'blue' : 'gray'}>
                              {rel.source === 'inpi' ? 'INPI' : 'Manuel'}
                            </Badge>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditTarget({ officer: rel.officer, relation: rel, clientName: client.nom_entreprise });
                                setModalOpen(true);
                              }}
                              className="p-1.5 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-md transition-colors"
                              title="Modifier"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Supprimer ${displayName} de ${client.nom_entreprise} ?`)) {
                                  handleDelete(rel.id, rel.officer.id);
                                }
                              }}
                              disabled={deleting === rel.id}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {hasDirigeantFallback && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">{client.dirigeant}</p>
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
                            Donnee non structuree - Synchronisez avec l'INPI pour importer les details
                          </p>
                        </div>
                        <Badge variant="warning">Non structure</Badge>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddTarget({ clientId: client.id, clientName: client.nom_entreprise });
                      setEditTarget(null);
                      setModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg border border-dashed border-teal-300 dark:border-teal-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter un dirigeant
                  </button>
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

      <OfficerFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
          setAddTarget(null);
        }}
        onSave={handleSaveOfficer}
        officer={editTarget?.officer || null}
        relation={editTarget?.relation || null}
        clientName={editTarget?.clientName || addTarget?.clientName || ''}
      />
    </div>
  );
}
