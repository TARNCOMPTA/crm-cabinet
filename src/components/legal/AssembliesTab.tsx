import { Database } from '../../types/database';
import { ClientDepotComptes } from '../../lib/bodaccService';
import { SuiviDepotComptes } from './SuiviDepotComptes';

type Client = Database['public']['Tables']['clients']['Row'];

interface AssembliesTabProps {
  clients: Client[];
  depotComptes: ClientDepotComptes[];
  excludedClientIds?: Set<string>;
  suiviSortField: string;
  suiviSortDir: 'asc' | 'desc';
  onSuiviSortChange: (field: string) => void;
}

export function AssembliesTab({ clients, depotComptes, excludedClientIds = new Set(), suiviSortField, suiviSortDir, onSuiviSortChange }: AssembliesTabProps) {
  return (
    <SuiviDepotComptes
      clients={clients}
      depotComptes={depotComptes}
      excludedClientIds={excludedClientIds}
      sortField={suiviSortField}
      sortDir={suiviSortDir}
      onSortChange={onSuiviSortChange}
    />
  );
}
