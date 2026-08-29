import { supabase } from './supabase';

export interface ClientStatusCounts {
  actif: number;
  inactif: number;
  prospect: number;
  archive: number;
}

export interface BilanProgressData {
  regime_fiscal: string;
  columns: { id: string; name: string; color: string; position: number; count: number }[];
  total: number;
}

export interface DeadlineItem {
  id: string;
  date: Date;
  type: 'cloture' | 'ag' | 'tache';
  label: string;
  clientName: string;
  clientId: string;
}

export interface ActivityItem {
  id: string;
  date: string;
  type: 'client_created' | 'inpi_sync' | 'legal_act' | 'bodacc';
  description: string;
  clientName: string;
  clientId: string;
  status?: string;
}

export interface AlertItem {
  id: string;
  severity: 'danger' | 'warning' | 'info';
  message: string;
  count: number;
  link: string;
}

export interface RegimeFiscalCount {
  regime: string;
  count: number;
}

export interface FormeJuridiqueCount {
  forme: string;
  count: number;
}

export interface TopCityItem {
  city: string;
  count: number;
}

export interface RecentCompanyItem {
  id: string;
  name: string;
  city: string | null;
  dateCreation: string;
}

/*
 * `extractCityFromAddress` a ete supprimee : `clients.ville` existe.
 *
 * ⚠️ Ne pas confondre avec `DashboardTopCities`, qui ne vient PAS d'ici mais du
 * rpc `get_dashboard_stats` — donc du SQL, ou le meme decoupage etait refait une
 * cinquieme fois. Il a ete bascule sur `clients.ville` dans le meme mouvement
 * (schema/increments/003).
 */

export interface DashboardData {
  clientStatusCounts: ClientStatusCounts;
  bilanProgress: BilanProgressData[];
  deadlines: DeadlineItem[];
  recentActivity: ActivityItem[];
  alerts: AlertItem[];
  regimeFiscalCounts: RegimeFiscalCount[];
  formeJuridiqueCounts: FormeJuridiqueCount[];
  habilitationsActives: number;
  legalActsRecent: number;
  assemblesPlanifiees: number;
  tasksEnCours: number;
  opportunitesEnCours: number;
  topCities: TopCityItem[];
  recentCompanies: RecentCompanyItem[];
}

/**
 * Le nom du client attache a une ligne, quand la requete l'a demande par une
 * jointure `clients(nom_entreprise)`.
 *
 * Les types generes de Supabase ne decrivent pas la forme des relations
 * imbriquees : le code contournait par `as any`, cinq fois. Ce lecteur dit ce
 * qu'on attend vraiment — un objet, la relation etant un PLUSIEURS-VERS-UN — et
 * rend la chaine vide si la jointure n'a rien ramene, exactement comme avant.
 */
function nomClient(relation: unknown): string {
  if (typeof relation !== 'object' || relation === null) return '';
  const nom = (relation as { nom_entreprise?: unknown }).nom_entreprise;
  return typeof nom === 'string' ? nom : '';
}

function parseClotureDate(raw: string): { day: number; month: number } | null {
  if (!raw || raw.length !== 4) return null;
  const day = parseInt(raw.substring(0, 2), 10);
  const month = parseInt(raw.substring(2, 4), 10);
  if (isNaN(day) || isNaN(month) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month };
}

function getNextOccurrence(day: number, month: number): Date {
  const now = new Date();
  const thisYear = now.getFullYear();
  let next = new Date(thisYear, month - 1, day);
  if (next < now) {
    next = new Date(thisYear + 1, month - 1, day);
  }
  return next;
}

function daysDiff(a: Date, b: Date): number {
  return Math.ceil((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export async function loadDashboardData(userId: string): Promise<DashboardData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  // Use the server-side RPC for aggregated stats + remaining queries for row-level data
  const [
    statsRes,
    clientsForDeadlinesRes,
    bilanCardsRes,
    bilanColumnsRes,
    assembliesRes,
    tasksRes,
    recentClientsRes,
    recentInpiRes,
    recentLegalActsRes,
    recentBodaccRes,
    recentCompaniesRes,
  ] = await Promise.all([
    supabase.rpc('get_dashboard_stats', { p_user_id: userId }),
    supabase
      .from('clients')
      .select('id, nom_entreprise, date_cloture_exercice_social, last_inpi_sync')
      .eq('statut', 'actif')
      .not('date_cloture_exercice_social', 'is', null),
    supabase
      .from('bilan_cards')
      .select('id, regime_fiscal, column_id, client_id')
      ,
    supabase
      .from('bilan_columns')
      .select('id, regime_fiscal, name, color, position')
      .order('position', { ascending: true }),
    supabase
      .from('general_assemblies')
      .select('id, client_id, date_prevue, statut, clients!inner(nom_entreprise)')
      .in('statut', ['planifiee', 'en_cours']),
    supabase
      .from('tasks')
      .select('id, titre, client_id, statut, date_echeance, assignee_id, clients(nom_entreprise)')
      .eq('is_archived', false)
      .neq('statut', 'done')
      .eq('assignee_id', userId)
      .not('date_echeance', 'is', null),
    supabase
      .from('clients')
      .select('id, nom_entreprise, created_at')
      .gte('created_at', thirtyDaysAgoISO)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('inpi_sync_history')
      .select('id, client_id, sync_date, status, clients!inner(nom_entreprise)')
      .order('sync_date', { ascending: false })
      .limit(10),
    supabase
      .from('legal_acts')
      .select('id, client_id, act_type, act_category, created_at, clients!inner(nom_entreprise)')
      .gte('created_at', thirtyDaysAgoISO)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('bodacc_depot_comptes')
      .select('id, client_id, date_parution, created_at, commercant, clients!inner(nom_entreprise)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('clients')
      .select('id, nom_entreprise, ville, date_creation_entreprise')
      .not('date_creation_entreprise', 'is', null)
      .order('date_creation_entreprise', { ascending: false })
      .limit(5),
  ]);

  // Parse server-side aggregated stats
  //
  // `get_dashboard_stats` est declaree `RETURNS jsonb`, et c'est bien ce que
  // disent maintenant les types generes depuis la base. `Json` etant une union,
  // on ne peut pas y lire une propriete sans dire d'abord ce qu'on attend :
  // d'ou cette forme, qui reprend exactement les cles du `jsonb_build_object`
  // de la fonction (voir schema/cible.sql).
  //
  // Une assertion et non une validation : c'est notre propre fonction, dans
  // notre propre base. Si sa forme change, c'est ici qu'il faut le repercuter —
  // et le compilateur le signalera aux points d'usage.
  const stats = (statsRes.data ?? {}) as {
    client_status_counts?: ClientStatusCounts;
    tasks_en_cours?: number;
    overdue_tasks_count?: number;
    habilitations_actives?: number;
    assemblees_planifiees?: number;
    opportunites_en_cours?: number;
    legal_acts_recent?: number;
    clients_without_siret?: number;
    clients_without_cloture?: number;
    top_cities?: { city: string; count: number | string }[];
    regime_fiscal_counts?: { regime: string; count: number | string }[];
    forme_juridique_counts?: { forme: string; count: number | string }[];
  };
  const clientStatusCounts: ClientStatusCounts = stats.client_status_counts || { actif: 0, inactif: 0, prospect: 0, archive: 0 };
  const tasksEnCours = stats.tasks_en_cours || 0;
  const habilitationsActives = stats.habilitations_actives || 0;
  const assemblesPlanifiees = stats.assemblees_planifiees || 0;
  const opportunitesEnCours = stats.opportunites_en_cours || 0;
  const legalActsRecent = stats.legal_acts_recent || 0;

  const topCities: TopCityItem[] = (stats.top_cities || []).map((t) => ({ city: t.city, count: Number(t.count) }));
  const regimeFiscalCounts: RegimeFiscalCount[] = (stats.regime_fiscal_counts || []).map((r) => ({ regime: r.regime, count: Number(r.count) }));
  const formeJuridiqueCounts: FormeJuridiqueCount[] = (stats.forme_juridique_counts || []).map((f) => ({ forme: f.forme, count: Number(f.count) }));

  // Alerts from RPC counts
  //
  // Les compteurs sont ramenes a zero avant d'etre testes : une cle absente du
  // jsonb n'est pas une alerte a zero, c'est `undefined`, et « undefined > 0 »
  // vaut faux sans le dire. Autant l'ecrire.
  const sansSiret = stats.clients_without_siret ?? 0;
  const sansCloture = stats.clients_without_cloture ?? 0;
  const tachesEnRetard = stats.overdue_tasks_count ?? 0;

  const alerts: AlertItem[] = [];
  if (sansSiret > 0) {
    alerts.push({ id: 'no-siret', severity: 'danger', message: 'Clients actifs sans SIRET/SIREN', count: sansSiret, link: '/clients' });
  }
  if (sansCloture > 0) {
    alerts.push({ id: 'no-cloture', severity: 'warning', message: 'Clients sans date de clôture exercice', count: sansCloture, link: '/clients' });
  }
  if (tachesEnRetard > 0) {
    alerts.push({ id: 'overdue-tasks', severity: 'danger', message: 'Tâches en retard', count: tachesEnRetard, link: '/tasks' });
  }

  // Deadlines (still need row-level data for display)
  const deadlines: DeadlineItem[] = [];
  const clientsForDeadlines = clientsForDeadlinesRes.data || [];
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const clientsNotSynced90Days: string[] = [];

  for (const client of clientsForDeadlines) {
    if (client.date_cloture_exercice_social) {
      const parsed = parseClotureDate(client.date_cloture_exercice_social);
      if (parsed) {
        const nextDate = getNextOccurrence(parsed.day, parsed.month);
        const diff = daysDiff(nextDate, now);
        if (diff <= 90) {
          deadlines.push({
            id: `cloture-${client.id}`,
            date: nextDate,
            type: 'cloture',
            label: 'Clôture exercice',
            clientName: client.nom_entreprise,
            clientId: client.id,
          });
        }
      }
    }
    if (client.last_inpi_sync) {
      const lastSync = new Date(client.last_inpi_sync);
      if (lastSync < ninetyDaysAgo) {
        clientsNotSynced90Days.push(client.nom_entreprise);
      }
    }
  }

  if (clientsNotSynced90Days.length > 0) {
    alerts.push({ id: 'no-inpi-sync', severity: 'info', message: 'Clients non synchronisés INPI depuis 90 jours', count: clientsNotSynced90Days.length, link: '/clients' });
  }

  const assemblies = assembliesRes.data || [];
  for (const ag of assemblies) {
    if (ag.date_prevue) {
      const agDate = new Date(ag.date_prevue);
      const diff = daysDiff(agDate, now);
      if (diff >= -7 && diff <= 90) {
        const clientName = nomClient(ag.clients);
        deadlines.push({ id: `ag-${ag.id}`, date: agDate, type: 'ag', label: 'AG prévue', clientName, clientId: ag.client_id });
      }
    }
  }

  const tasks = tasksRes.data || [];
  for (const task of tasks) {
    if (task.date_echeance) {
      const taskDate = new Date(task.date_echeance);
      const diff = daysDiff(taskDate, now);
      if (diff >= -7 && diff <= 90) {
        const clientName = nomClient(task.clients);
        deadlines.push({ id: `task-${task.id}`, date: taskDate, type: 'tache', label: task.titre, clientName, clientId: task.client_id || '' });
      }
    }
  }

  deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Bilan progress (still needs row-level card/column data)
  const bilanCards = bilanCardsRes.data || [];
  const bilanColumns = bilanColumnsRes.data || [];
  const columnsByRegime = new Map<string, typeof bilanColumns>();
  for (const col of bilanColumns) {
    if (!columnsByRegime.has(col.regime_fiscal)) {
      columnsByRegime.set(col.regime_fiscal, []);
    }
    columnsByRegime.get(col.regime_fiscal)!.push(col);
  }

  const bilanProgress: BilanProgressData[] = [];
  for (const [regime, cols] of columnsByRegime.entries()) {
    const cardsForRegime = bilanCards.filter(c => c.regime_fiscal === regime);
    if (cardsForRegime.length === 0) continue;
    const columnsWithCount = cols.map(col => ({
      id: col.id, name: col.name, color: col.color, position: col.position,
      count: cardsForRegime.filter(c => c.column_id === col.id).length,
    }));
    bilanProgress.push({ regime_fiscal: regime, columns: columnsWithCount, total: cardsForRegime.length });
  }

  // Recent activity feed
  // ---------------------------------------------------------------------------
  // Les quatre colonnes de date lues ici (`created_at`, `sync_date`) portent un
  // DEFAULT now() sans contrainte NOT NULL : le type genere les donne donc
  // nullables, alors qu'en pratique PostgreSQL les remplit toujours. Le flux
  // etant trie par date, une entree sans date n'aurait de toute facon pas de
  // place dans l'ordre — on l'ecarte plutot que d'inventer un horodatage.
  const recentActivity: ActivityItem[] = [];
  const ajouter = (date: string | null, item: Omit<ActivityItem, 'date'>) => {
    if (date) recentActivity.push({ ...item, date });
  };
  for (const c of recentClientsRes.data || []) {
    ajouter(c.created_at, { id: `client-${c.id}`, type: 'client_created', description: 'Nouveau client ajouté', clientName: c.nom_entreprise, clientId: c.id });
  }
  for (const s of recentInpiRes.data || []) {
    const clientName = nomClient(s.clients);
    ajouter(s.sync_date, { id: `inpi-${s.id}`, type: 'inpi_sync', description: 'Synchronisation INPI', clientName, clientId: s.client_id, status: s.status });
  }
  for (const a of recentLegalActsRes.data || []) {
    const clientName = nomClient(a.clients);
    ajouter(a.created_at, { id: `legal-${a.id}`, type: 'legal_act', description: `Acte juridique : ${a.act_type}`, clientName, clientId: a.client_id });
  }
  for (const b of recentBodaccRes.data || []) {
    const clientName = nomClient(b.clients);
    ajouter(b.created_at, { id: `bodacc-${b.id}`, type: 'bodacc', description: 'Publication BODACC', clientName, clientId: b.client_id });
  }
  recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  recentActivity.splice(10);

  const recentCompanies: RecentCompanyItem[] = (recentCompaniesRes.data || []).map(c => ({
    id: c.id, name: c.nom_entreprise, city: c.ville, dateCreation: c.date_creation_entreprise!,
  }));

  return {
    clientStatusCounts,
    bilanProgress,
    deadlines,
    recentActivity,
    alerts,
    regimeFiscalCounts,
    formeJuridiqueCounts,
    habilitationsActives,
    legalActsRecent,
    assemblesPlanifiees,
    tasksEnCours,
    opportunitesEnCours,
    topCities,
    recentCompanies,
  };
}
