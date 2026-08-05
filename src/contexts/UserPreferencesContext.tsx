import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  fetchUserPreferences,
  getAtPath,
  saveUserPreferences,
  setAtPath,
  UserPreferences,
} from '../lib/userPreferencesService';

interface UserPreferencesContextType {
  preferences: UserPreferences;
  loading: boolean;
  getPreference: <T,>(path: string, fallback: T) => T;
  setPreference: (path: string, value: unknown) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>({});
  const [loading, setLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<UserPreferences>({});

  useEffect(() => {
    if (!user) {
      setPreferences({});
      latestRef.current = {};
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchUserPreferences(user.id)
      .then((prefs) => {
        if (cancelled) return;
        setPreferences(prefs);
        latestRef.current = prefs;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const schedulePersist = useCallback(
    (next: UserPreferences) => {
      if (!user) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveUserPreferences(user.id, next).catch(() => {});
      }, 400);
    },
    [user]
  );

  const setPreference = useCallback(
    (path: string, value: unknown) => {
      setPreferences((prev) => {
        const next = setAtPath(prev, path, value);
        latestRef.current = next;
        schedulePersist(next);
        return next;
      });
    },
    [schedulePersist]
  );

  const getPreference = useCallback(
    <T,>(path: string, fallback: T): T => {
      const value = getAtPath(preferences, path);
      return (value === undefined ? fallback : (value as T));
    },
    [preferences]
  );

  const value = useMemo(
    () => ({ preferences, loading, getPreference, setPreference }),
    [preferences, loading, getPreference, setPreference]
  );

  return (
    <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) throw new Error('useUserPreferences must be used within UserPreferencesProvider');
  return ctx;
}

export function usePreference<T>(path: string, fallback: T): [T, (value: T) => void] {
  const { getPreference, setPreference } = useUserPreferences();
  const value = getPreference<T>(path, fallback);
  const setValue = useCallback(
    (next: T) => setPreference(path, next as unknown),
    [path, setPreference]
  );
  return [value, setValue];
}