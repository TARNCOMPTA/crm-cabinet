import { Database } from '../../types/database';

export type Client = Database['public']['Tables']['clients']['Row'];
export type LegalAct = Database['public']['Tables']['legal_acts']['Row'];
export type CompanyOfficer = Database['public']['Tables']['company_officers']['Row'];
export type OfficerCompany = Database['public']['Tables']['officer_companies']['Row'];

export interface ClientCollaborator {
  id: string;
  user_id: string;
  role: string;
  user: { prenom: string | null; nom: string | null } | null;
}

export interface ClientWithCollaborators extends Client {
  collaborators: ClientCollaborator[];
}

export interface OfficerWithCompanies extends CompanyOfficer {
  mandates: (OfficerCompany & { client: Client })[];
}

export interface ClientWithOfficers extends Client {
  officers: (OfficerCompany & { officer: CompanyOfficer })[];
}

export interface SortPref {
  field: string;
  dir: 'asc' | 'desc';
}

export interface AllSortPrefs {
  acts: SortPref;
  depotComptes: SortPref;
  depotComptesInner: SortPref;
  suiviDepotComptes: SortPref;
  officerToCompany: SortPref;
  companyToOfficer: SortPref;
}

export const DEFAULT_SORT_PREFS: AllSortPrefs = {
  acts: { field: 'nom_entreprise', dir: 'asc' },
  depotComptes: { field: 'date_cloture', dir: 'desc' },
  depotComptesInner: { field: 'date_cloture', dir: 'desc' },
  suiviDepotComptes: { field: 'status', dir: 'asc' },
  officerToCompany: { field: 'nom', dir: 'asc' },
  companyToOfficer: { field: 'nom_entreprise', dir: 'asc' },
};

export type TabType = 'acts' | 'assemblies' | 'depot-comptes' | 'officer-to-company' | 'company-to-officer';
