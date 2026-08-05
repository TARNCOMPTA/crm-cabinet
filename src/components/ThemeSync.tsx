import { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { usePreference, useUserPreferences } from '../contexts/UserPreferencesContext';

type StoredTheme = 'light' | 'dark' | null;

export function ThemeSync() {
  const { theme, setTheme } = useTheme();
  const { loading } = useUserPreferences();
  const [stored, setStored] = usePreference<StoredTheme>('theme', null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (loading || initializedRef.current) return;
    if (stored && stored !== theme) {
      setTheme(stored);
    } else if (!stored) {
      setStored(theme);
    }
    initializedRef.current = true;
  }, [loading, stored, theme, setTheme, setStored]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (stored !== theme) {
      setStored(theme);
    }
  }, [theme, stored, setStored]);

  return null;
}
