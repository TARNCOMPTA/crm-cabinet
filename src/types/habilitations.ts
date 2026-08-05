export interface ServiceEntry {
  service: string;
  role: string | null;
  etat: string | null;
  dateCreation: string | null;
}

export interface GroupedClient {
  clientId: string;
  clientName: string;
  siren: string;
  hasHabilitations: boolean;
  nonConcerne: boolean;
  isNonClient: boolean;
  avancement: string;
  commentaire: string;
  services: ServiceEntry[];
}

export interface GroupedUnknown {
  siren: string;
  services: ServiceEntry[];
}

export type CompletenessFilter = 'all' | 'complete' | 'incomplete' | 'none' | 'non_concerne' | 'non_client';

export interface CompletenessResult {
  present: { name: string; category: string }[];
  missing: { name: string; category: string }[];
  count: number;
  total: number;
  percentage: number;
}

export interface HabilitationStats {
  complete: number;
  incomplete: number;
  noHabilitations: number;
  nonConcerne: number;
  totalPercentage: number;
  applicableCount: number;
}

export interface EnrichedClient extends GroupedClient {
  completeness: CompletenessResult;
}
