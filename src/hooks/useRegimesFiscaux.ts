import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface RegimeOption {
  id: string;
  value: string;
  label: string;
  description: string;
  position: number;
  is_active: boolean;
}

export function useRegimesFiscaux() {
  const { profile } = useAuth();
  const [regimes, setRegimes] = useState<RegimeOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('regimes_fiscaux')
      .select('id, value, label, description, position, is_active')
      .eq('is_active', true)
      .order('position');

    if (error) {
      setRegimes([]);
    } else {
      setRegimes(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profile) {
      setRegimes([]);
      setLoading(false);
      return;
    }

    load();

    const channelName = `regimes_fiscaux_changes_${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'regimes_fiscaux' },
        () => { load(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, load]);

  function getRegimeLabel(value: string): string {
    const found = regimes.find(r => r.value === value);
    return found ? found.label : value;
  }

  function getRegimeDescription(value: string): string {
    const found = regimes.find(r => r.value === value);
    return found ? found.description : '';
  }

  return { regimes, loading, getRegimeLabel, getRegimeDescription };
}
