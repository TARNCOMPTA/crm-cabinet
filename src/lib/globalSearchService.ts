import { supabase } from './supabase';

export interface SearchResultItem {
  id: string;
  label: string;
  sublabel: string;
  type: SearchCategory;
  route: string;
}

export type SearchCategory =
  | 'clients'
  | 'contacts'
  | 'companies'
  | 'tasks'
  | 'legalActs'
  | 'habilitations'
  | 'software'
  | 'opportunities';

export interface SearchResults {
  clients: SearchResultItem[];
  contacts: SearchResultItem[];
  companies: SearchResultItem[];
  tasks: SearchResultItem[];
  legalActs: SearchResultItem[];
  habilitations: SearchResultItem[];
  software: SearchResultItem[];
  opportunities: SearchResultItem[];
}

const LIMIT = 5;

function emptyResults(): SearchResults {
  return {
    clients: [],
    contacts: [],
    companies: [],
    tasks: [],
    legalActs: [],
    habilitations: [],
    software: [],
    opportunities: [],
  };
}

async function searchClients(q: string): Promise<SearchResultItem[]> {
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, siren, siret, email, contact_principal, dirigeant, numero_dossier, ville')
    .or(
      // Pas de `tva_intracom` : personne ne cherche un client par son numero de TVA.
      `nom_entreprise.ilike.${pattern},siren.ilike.${pattern},siret.ilike.${pattern},email.ilike.${pattern},contact_principal.ilike.${pattern},dirigeant.ilike.${pattern},numero_dossier.ilike.${pattern},ville.ilike.${pattern}`
    )
    .limit(LIMIT);

  if (error || !data) return [];
  return data.map((c) => ({
    id: c.id,
    label: c.nom_entreprise || 'Client sans nom',
    sublabel: [c.siren, c.email, c.contact_principal].filter(Boolean).join(' - '),
    type: 'clients' as const,
    route: `/clients/${c.id}`,
  }));
}

async function searchContacts(q: string): Promise<SearchResultItem[]> {
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('id, first_name, last_name, email, phone, mobile, role')
    .or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},mobile.ilike.${pattern},role.ilike.${pattern}`
    )
    .limit(LIMIT);

  if (error || !data) return [];
  return data.map((c) => ({
    id: c.id,
    label: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Contact',
    sublabel: [c.role, c.email, c.phone].filter(Boolean).join(' - '),
    type: 'contacts' as const,
    route: `/annuaire?tab=contacts&highlight=${c.id}`,
  }));
}

async function searchCompanies(q: string): Promise<SearchResultItem[]> {
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('directory_companies')
    .select('id, name, siren, siret, email, phone, city')
    .or(
      `name.ilike.${pattern},siren.ilike.${pattern},siret.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},city.ilike.${pattern}`
    )
    .limit(LIMIT);

  if (error || !data) return [];
  return data.map((c) => ({
    id: c.id,
    label: c.name || 'Societe',
    sublabel: [c.siren, c.city, c.email].filter(Boolean).join(' - '),
    type: 'companies' as const,
    route: `/annuaire?tab=companies&highlight=${c.id}`,
  }));
}

async function searchTasks(q: string): Promise<SearchResultItem[]> {
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('tasks')
    .select('id, titre, description, statut, clients(nom_entreprise)')
    .eq('is_archived', false)
    .or(`titre.ilike.${pattern},description.ilike.${pattern}`)
    .limit(LIMIT);

  if (error || !data) return [];
  return data.map((t: any) => ({
    id: t.id,
    label: t.titre || 'Tache',
    sublabel: [t.statut, t.clients?.nom_entreprise].filter(Boolean).join(' - '),
    type: 'tasks' as const,
    route: `/tasks?highlight=${t.id}`,
  }));
}

async function searchLegalActs(q: string): Promise<SearchResultItem[]> {
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('legal_acts')
    .select('id, act_type, act_category, act_date, clients!inner(nom_entreprise)')
    .or(`act_type.ilike.${pattern},act_category.ilike.${pattern}`)
    .limit(LIMIT);

  if (error || !data) return [];
  return data.map((a: any) => ({
    id: a.id,
    label: a.act_type || 'Acte',
    sublabel: [a.act_category, a.clients?.nom_entreprise, a.act_date].filter(Boolean).join(' - '),
    type: 'legalActs' as const,
    route: `/legal?highlight=${a.id}`,
  }));
}

async function searchHabilitations(q: string): Promise<SearchResultItem[]> {
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('habilitations')
    .select('id, siren, service, etat, clients(nom_entreprise)')
    .or(`service.ilike.${pattern},siren.ilike.${pattern}`)
    .limit(LIMIT);

  if (error || !data) return [];
  return data.map((h: any) => ({
    id: h.id,
    label: h.service || 'Habilitation',
    sublabel: [h.siren, h.clients?.nom_entreprise, h.etat].filter(Boolean).join(' - '),
    type: 'habilitations' as const,
    route: `/tax-authorizations?highlight=${h.id}`,
  }));
}

async function searchSoftware(q: string): Promise<SearchResultItem[]> {
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('software')
    .select('id, name, category, description')
    .or(`name.ilike.${pattern},category.ilike.${pattern},description.ilike.${pattern}`)
    .limit(LIMIT);

  if (error || !data) return [];
  return data.map((s) => ({
    id: s.id,
    label: s.name || 'Logiciel',
    sublabel: [s.category, s.description?.slice(0, 60)].filter(Boolean).join(' - '),
    type: 'software' as const,
    route: `/software?highlight=${s.id}`,
  }));
}

// searchTickets() retiree avec le module support : la table support_tickets
// n'existe plus dans le schema cible, et la route /support n'existe plus non
// plus. La fonction avalait l'erreur (« if (error || !data) return [] »), donc
// la recherche se contentait de ne jamais rien remonter — sans rien signaler.

async function searchOpportunities(q: string): Promise<SearchResultItem[]> {
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from('opportunity_cards')
    .select('id, prospect_name, notes, source, montant_estime, clients(nom_entreprise, siren)')
    .or(`prospect_name.ilike.${pattern},notes.ilike.${pattern},source.ilike.${pattern}`)
    .limit(LIMIT);

  if (error || !data) return [];
  return data.map((o: any) => ({
    id: o.id,
    label: o.clients?.nom_entreprise || o.prospect_name || 'Opportunite',
    sublabel: [o.source, o.montant_estime ? `${o.montant_estime} EUR` : null].filter(Boolean).join(' - '),
    type: 'opportunities' as const,
    route: `/opportunities?highlight=${o.id}`,
  }));
}

export async function globalSearch(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return emptyResults();

  const [clients, contacts, companies, tasks, legalActs, habilitations, software, opportunities] =
    await Promise.all([
      searchClients(q),
      searchContacts(q),
      searchCompanies(q),
      searchTasks(q),
      searchLegalActs(q),
      searchHabilitations(q),
      searchSoftware(q),
      searchOpportunities(q),
    ]);

  return { clients, contacts, companies, tasks, legalActs, habilitations, software, opportunities };
}

export function getTotalResultCount(results: SearchResults): number {
  return Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
}
