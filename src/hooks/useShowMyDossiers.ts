import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function useShowMyDossiers(): [boolean, () => void] {
  const { profile, updateShowMyDossiers } = useAuth();

  const showMyDossiers = profile?.show_my_dossiers ?? true;

  const toggle = useCallback(() => {
    updateShowMyDossiers(!showMyDossiers);
  }, [showMyDossiers, updateShowMyDossiers]);

  return [showMyDossiers, toggle];
}
