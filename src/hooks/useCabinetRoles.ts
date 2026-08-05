import { useCallback, useEffect, useState } from 'react';
import {
  type CabinetCollaboratorRole,
  listCabinetRoles,
} from '../lib/cabinetRolesService';

export interface UseCabinetRolesResult {
  roles: CabinetCollaboratorRole[];
  loading: boolean;
  defaultRole: CabinetCollaboratorRole | null;
  reload: () => Promise<void>;
  resolveRole: (key: string | null | undefined) => CabinetCollaboratorRole | null;
}

export function useCabinetRoles(): UseCabinetRolesResult {
  const [roles, setRoles] = useState<CabinetCollaboratorRole[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await listCabinetRoles();
    setRoles(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const defaultRole = roles.find((r) => r.is_default) ?? roles[0] ?? null;

  const resolveRole = useCallback(
    (key: string | null | undefined) => {
      if (!key) return null;
      return roles.find((r) => r.key === key) ?? null;
    },
    [roles]
  );

  return { roles, loading, defaultRole, reload, resolveRole };
}
