import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, CardContent } from '../components/ui/Card';
import { Scale } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getCommercialCompanyLabels } from '../lib/legalFormsUtils';
import { loadCachedDepotComptes, ClientDepotComptes } from '../lib/bodaccService';
import { parLots } from '../lib/lots';
import { syncClientWithINPI } from '../lib/inpiService';
import { useSyncJobs } from '../contexts/SyncJobsContext';
import { finalizeSyncJob, updateSyncJob } from '../lib/syncJobsService';
import { useLegalFilters } from '../hooks/useLegalFilters';
import { LegalToolbar } from '../components/legal/LegalToolbar';
import { ActsTab } from '../components/legal/ActsTab';
import { AssembliesTab } from '../components/legal/AssembliesTab';
import { OfficerToCompanyTab } from '../components/legal/OfficerToCompanyTab';
import { CompanyToOfficerTab } from '../components/legal/CompanyToOfficerTab';
import { DepotComptesTab } from '../components/legal/DepotComptesTab';
import { messageErreur } from '../lib/erreurs';
import {
  ClientWithCollaborators,
  ClientWithOfficers,
  OfficerWithCompanies,
  LegalAct,
  TabType,
  Client,
  CompanyOfficer,
  OfficerCompany,
} from '../components/legal/legalTypes';

/**
 * Les lignes de `officer_companies` telles que les deux requetes les demandent :
 * la ligne de mandat, plus le dirigeant et le client joints en entier.
 *
 * `parLots()` rend `unknown` — il ne peut pas deviner le `select`. C'est ce qui
 * poussait a ecrire `(oc: any)`, et ce qui masquait que `officer` et `client`
 * peuvent manquer si la jointure ne ramene rien.
 */
type MandatJoint = OfficerCompany & { officer: CompanyOfficer; client: Client };

export function Legal() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('acts');
  const { startJob, hasActiveJob } = useSyncJobs();
  const syncingAll = hasActiveJob((j) => j.job_type === 'inpi_bulk');

  const [allClients, setAllClients] = useState<ClientWithCollaborators[]>([]);
  const [commercialLabels, setCommercialLabels] = useState<Set<string>>(new Set());
  const [cabinetUsers, setCabinetUsers] = useState<Array<{ id: string; prenom: string | null; nom: string | null; email: string }>>([]);
  const [clientActsMap, setClientActsMap] = useState<Map<string, LegalAct[]>>(new Map());
  const [officersWithCompanies, setOfficersWithCompanies] = useState<OfficerWithCompanies[]>([]);
  const [clientsWithOfficers, setClientsWithOfficers] = useState<ClientWithOfficers[]>([]);
  const [depotComptes, setDepotComptes] = useState<ClientDepotComptes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const commercialLabelsRef = useRef<Set<string>>(new Set());

  const filters = useLegalFilters(allClients, commercialLabels, profile?.id);

  useEffect(() => {
    if (!profile) return;
    getCommercialCompanyLabels().then((l) => {
      commercialLabelsRef.current = l;
      setCommercialLabels(l);
    });
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('profiles')
      .select('id, prenom, nom, email')
      .eq('is_active', true)
      .order('nom')
      .then(({ data }) => { if (data) setCabinetUsers(data); });
  }, [profile]);

  const loadAllClients = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('clients')
        .select(`
          *,
          collaborators:client_collaborators(
            id,
            user_id,
            role,
            user:profiles(prenom, nom)
          )
        `)
        .eq('statut', 'actif')
        .order('nom_entreprise');
      if (err) throw err;
      setAllClients((data || []) as ClientWithCollaborators[]);
    } catch (err) {
      setError(messageErreur(err, 'Erreur lors du chargement'));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { loadAllClients(); }, [loadAllClients]);

  const loadLegalActs = useCallback(async (clientsList: Client[]) => {
    const withSiren = clientsList.filter(c => c.siren || c.siret);
    if (withSiren.length === 0) { setClientActsMap(new Map()); return; }
    const data = await parLots<LegalAct>(withSiren.map(c => c.id), (lot) =>
      supabase
        .from('legal_acts')
        .select('*')
        .in('client_id', lot)
        .order('act_date', { ascending: false })
    );
    const map = new Map<string, LegalAct[]>();
    withSiren.forEach(c => map.set(c.id, []));
    (data || []).forEach((act: LegalAct) => map.get(act.client_id)?.push(act));
    setClientActsMap(map);
  }, []);

  const loadDepotComptes = useCallback(async (clientsList: Client[]) => {
    const withSiren = clientsList.filter(c => c.siren);
    if (withSiren.length === 0) { setDepotComptes([]); return; }
    const data = await loadCachedDepotComptes(withSiren.map(c => c.id));
    setDepotComptes(data);
  }, []);

  const loadOfficersWithCompanies = useCallback(async (clientsList: Client[]) => {
    const data = await parLots<unknown>(clientsList.map(c => c.id), (lot) =>
      supabase
        .from('officer_companies')
        .select('*, officer:company_officers(*), client:clients(*)')
        .in('client_id', lot)
        .order('start_date', { ascending: false })
    );

    const idMap = new Map<string, OfficerWithCompanies>();
    (data as MandatJoint[] || []).forEach((oc) => {
      const id = oc.officer.id;
      if (!idMap.has(id)) idMap.set(id, { ...oc.officer, mandates: [] });
      const officer = idMap.get(id)!;
      const dupKey = `${oc.client_id}|${oc.role}`;
      if (!officer.mandates.some(m => `${m.client_id}|${m.role}` === dupKey)) {
        officer.mandates.push({ ...oc, client: oc.client });
      }
    });

    const merged = new Map<string, OfficerWithCompanies>();
    idMap.forEach((officer) => {
      const key = [
        (officer.first_name || '').toLowerCase().trim(),
        (officer.last_name || '').toLowerCase().trim(),
        officer.person_type || '',
        officer.birth_date || '',
      ].join('|');
      if (!merged.has(key)) {
        merged.set(key, { ...officer, mandates: [...officer.mandates] });
      } else {
        const existing = merged.get(key)!;
        const existingKeys = new Set(existing.mandates.map(m => `${m.client_id}|${m.role}`));
        officer.mandates.forEach(m => {
          if (!existingKeys.has(`${m.client_id}|${m.role}`)) {
            existing.mandates.push(m);
          }
        });
      }
    });
    setOfficersWithCompanies(Array.from(merged.values()));
  }, []);

  const loadClientsWithOfficers = useCallback(async (clientsList: Client[]) => {
    const data = await parLots<unknown>(clientsList.map(c => c.id), (lot) =>
      supabase
        .from('officer_companies')
        .select('*, officer:company_officers(*), client:clients(*)')
        .in('client_id', lot)
        .order('start_date', { ascending: false })
    );

    const map = new Map<string, ClientWithOfficers>();
    clientsList.forEach(c => map.set(c.id, { ...c, officers: [] }));
    (data as MandatJoint[] || []).forEach((oc) => {
      map.get(oc.client_id)?.officers.push({ ...oc, officer: oc.officer });
    });
    setClientsWithOfficers(Array.from(map.values()));
  }, []);

  const filteredClients = filters.clients;
  const prevTabRef = useRef(activeTab);
  const prevClientsRef = useRef(filteredClients);

  useEffect(() => {
    if (!profile || filteredClients.length === 0) return;
    const tabChanged = prevTabRef.current !== activeTab;
    const clientsChanged = prevClientsRef.current !== filteredClients;
    prevTabRef.current = activeTab;
    prevClientsRef.current = filteredClients;

    if (!tabChanged && !clientsChanged) return;

    const loadTabData = async () => {
      try {
        if (activeTab === 'acts') await loadLegalActs(filteredClients);
        else if (activeTab === 'assemblies' || activeTab === 'depot-comptes') await loadDepotComptes(filteredClients);
        else if (activeTab === 'officer-to-company') await loadOfficersWithCompanies(filteredClients);
        else if (activeTab === 'company-to-officer') await loadClientsWithOfficers(filteredClients);
      } catch (err) {
        setError(messageErreur(err, 'Erreur lors du chargement'));
      }
    };
    loadTabData();
    // `profile` et `loadLegalActs` sont deux dependances distinctes. Elles
    // avaient ete fondues en `profile?.loadLegalActs`, qui ne designe rien : un
    // profil n'a pas de methode de chargement. La valeur valait donc toujours
    // `undefined`, si bien que ni l'arrivee du profil ni un changement du
    // chargeur ne relancaient l'effet — alors que la ligne 185 lit `profile`.
  }, [activeTab, filteredClients, profile, loadLegalActs, loadDepotComptes, loadOfficersWithCompanies, loadClientsWithOfficers]);

  const handleSyncAll = useCallback(async () => {
    const eligible = filteredClients.filter(c => c.siren || c.siret);
    if (eligible.length === 0) {
      showToast('Aucun client avec SIREN/SIRET', 'error');
      return;
    }

    const job = await startJob({
      jobType: 'inpi_bulk',
      total: eligible.length,
      payload: { clientIds: eligible.map(c => c.id) },
      message: `Synchronisation de ${eligible.length} client(s)...`,
    });

    if (!job) {
      showToast('Impossible de lancer la synchronisation', 'error');
      return;
    }

    showToast(`Synchronisation lancee en arriere-plan (${eligible.length} clients)`, 'info');

    void (async () => {
      let ok = 0;
      let fail = 0;
      let processed = 0;
      for (const client of eligible) {
        try {
          const result = await syncClientWithINPI(client.id);
          if (result.success) ok++;
          else fail++;
        } catch {
          fail++;
        }
        processed++;
        await updateSyncJob(job.id, {
          processed,
          success_count: ok,
          error_count: fail,
          message: `${processed}/${eligible.length} client(s) traite(s)`,
        });
      }
      await finalizeSyncJob(job.id, {
        status: fail > 0 ? (ok > 0 ? 'partial' : 'error') : 'success',
        message: `${ok} client(s) synchronise(s)${fail > 0 ? `, ${fail} erreur(s)` : ''}`,
        processed,
        total: eligible.length,
        successCount: ok,
        errorCount: fail,
      });
      loadAllClients();
    })();
  }, [filteredClients, startJob, showToast, loadAllClients]);

  if (!profile) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Juridique</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Scale className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">Aucun cabinet assigne</p>
            <p className="text-gray-500 dark:text-gray-400">
              Contactez un administrateur pour obtenir l'acces.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <LegalToolbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showMyDossiers={filters.showMyDossiers}
        onToggleMyDossiers={filters.toggleShowMyDossiers}
        cabinetUsers={cabinetUsers}
        filterCollaboratorIds={filters.filterCollaboratorIds}
        onToggleCollaborator={filters.toggleCollaboratorFilter}
        showNonCommercial={filters.showNonCommercial}
        onToggleNonCommercial={() => filters.setShowNonCommercial(!filters.showNonCommercial)}
        excludedCount={filters.excludedCount}
      />

      {error && (
        <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg flex items-start gap-3">
          <svg className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
        </div>
      ) : (
        <>
          {activeTab === 'acts' && (
            <ActsTab
              clients={filteredClients}
              clientActsMap={clientActsMap}
              onReloadActs={loadLegalActs}
              showToast={showToast}
              excludedClientIds={filters.excludedClientIds}
              sortField={filters.sortPrefs.acts.field}
              sortDir={filters.sortPrefs.acts.dir}
              onSortChange={filters.makeSortHandler('acts')}
            />
          )}

          {activeTab === 'assemblies' && (
            <AssembliesTab
              clients={filteredClients}
              depotComptes={depotComptes}
              excludedClientIds={filters.excludedClientIds}
              suiviSortField={filters.sortPrefs.suiviDepotComptes.field}
              suiviSortDir={filters.sortPrefs.suiviDepotComptes.dir}
              onSuiviSortChange={filters.makeSortHandler('suiviDepotComptes')}
            />
          )}

          {activeTab === 'depot-comptes' && (
            <DepotComptesTab
              clients={filteredClients}
              depotComptes={depotComptes}
              onReload={async () => { await loadDepotComptes(filteredClients); }}
              showToast={showToast}
              excludedClientIds={filters.excludedClientIds}
              sortField={filters.sortPrefs.depotComptes.field}
              sortDir={filters.sortPrefs.depotComptes.dir}
              onSortChange={filters.makeSortHandler('depotComptes')}
              innerSortField={filters.sortPrefs.depotComptesInner.field}
              innerSortDir={filters.sortPrefs.depotComptesInner.dir}
              onInnerSortChange={filters.makeSortHandler('depotComptesInner')}
            />
          )}

          {activeTab === 'officer-to-company' && (
            <OfficerToCompanyTab
              officers={officersWithCompanies}
              clientCount={filteredClients.length}
              excludedClientIds={filters.excludedClientIds}
              sortField={filters.sortPrefs.officerToCompany.field}
              sortDir={filters.sortPrefs.officerToCompany.dir}
              onSortChange={filters.makeSortHandler('officerToCompany')}
            />
          )}

          {activeTab === 'company-to-officer' && (
            <CompanyToOfficerTab
              clientsWithOfficers={clientsWithOfficers}
              onReload={loadAllClients}
              onSyncAll={handleSyncAll}
              syncing={syncingAll}
              showToast={showToast}
              excludedClientIds={filters.excludedClientIds}
              sortField={filters.sortPrefs.companyToOfficer.field}
              sortDir={filters.sortPrefs.companyToOfficer.dir}
              onSortChange={filters.makeSortHandler('companyToOfficer')}
            />
          )}
        </>
      )}
    </div>
  );
}
