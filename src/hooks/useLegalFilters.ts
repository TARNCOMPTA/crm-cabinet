import { useState, useMemo, useCallback } from 'react';
import { useShowMyDossiers } from './useShowMyDossiers';
import { isCommercialCompany } from '../lib/legalFormsUtils';
import {
  ClientWithCollaborators,
  Client,
  AllSortPrefs,
  DEFAULT_SORT_PREFS,
} from '../components/legal/legalTypes';

interface UseLegalFiltersReturn {
  showMyDossiers: boolean;
  toggleShowMyDossiers: () => void;
  filterCollaboratorIds: string[];
  toggleCollaboratorFilter: (userId: string) => void;
  showNonCommercial: boolean;
  setShowNonCommercial: (v: boolean) => void;
  baseClients: Client[];
  clients: Client[];
  excludedClientIds: Set<string>;
  excludedCount: number;
  sortPrefs: AllSortPrefs;
  makeSortHandler: (key: keyof AllSortPrefs) => (field: string) => void;
}

export function useLegalFilters(
  allClients: ClientWithCollaborators[],
  commercialLabels: Set<string>,
  userId: string | undefined
): UseLegalFiltersReturn {
  const [showMyDossiers, toggleShowMyDossiers] = useShowMyDossiers();
  const [filterCollaboratorIds, setFilterCollaboratorIds] = useState<string[]>([]);
  const [showNonCommercial, setShowNonCommercial] = useState(false);
  const [sortPrefs, setSortPrefs] = useState<AllSortPrefs>(DEFAULT_SORT_PREFS);

  const toggleCollaboratorFilter = useCallback((uid: string) => {
    setFilterCollaboratorIds(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  }, []);

  const makeSortHandler = useCallback((key: keyof AllSortPrefs) => {
    return (field: string) => {
      setSortPrefs((prev) => {
        const current = prev[key];
        if (current.field === field) {
          return { ...prev, [key]: { field, dir: current.dir === 'asc' ? 'desc' : 'asc' } };
        }
        return { ...prev, [key]: { field, dir: 'asc' } };
      });
    };
  }, []);

  const baseClients = useMemo(() => {
    let filtered: ClientWithCollaborators[] = allClients;

    if (showMyDossiers) {
      filtered = filtered.filter(client =>
        client.collaborators?.some(c => c.user_id === userId)
      );
    }

    if (filterCollaboratorIds.length > 0) {
      filtered = filtered.filter(client =>
        filterCollaboratorIds.every(uid =>
          client.collaborators?.some(c => c.user_id === uid)
        )
      );
    }

    return filtered;
  }, [allClients, showMyDossiers, filterCollaboratorIds, userId]);

  const excludedClientIds = useMemo(() => {
    const excluded = new Set<string>();
    baseClients.forEach(c => {
      if (!isCommercialCompany(c.forme_juridique, commercialLabels)) {
        excluded.add(c.id);
      }
    });
    return excluded;
  }, [baseClients, commercialLabels]);

  const excludedCount = useMemo(() => {
    return baseClients.filter(c => !isCommercialCompany(c.forme_juridique, commercialLabels)).length;
  }, [baseClients, commercialLabels]);

  const clients = useMemo(() => {
    return showNonCommercial
      ? baseClients
      : baseClients.filter(c => isCommercialCompany(c.forme_juridique, commercialLabels));
  }, [baseClients, showNonCommercial, commercialLabels]);

  return {
    showMyDossiers,
    toggleShowMyDossiers,
    filterCollaboratorIds,
    toggleCollaboratorFilter,
    showNonCommercial,
    setShowNonCommercial,
    baseClients,
    clients,
    excludedClientIds,
    excludedCount,
    sortPrefs,
    makeSortHandler,
  };
}
