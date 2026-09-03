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
  /**
   * ⚠️ VRAI AU DEPART, ET C'EST TOUT L'OBJET DE LA LIGNE. A `false`, le tout
   * premier rendu presentait un contexte « charge et vide » pendant l'instant
   * qui precede l'effet de lecture. `ThemeSync` s'y fiait : il concluait
   * qu'aucun theme n'etait enregistre et ECRIVAIT le theme courant — un
   * `POST user_preferences` a chaque demarrage de l'application, pour une
   * valeur deja en base. Mesure le 2026-09-03 dans un vrai navigateur, sur
   * les huit ecrans recenses. Tant qu'on n'a pas lu, on ne sait pas : c'est
   * `true` qui le dit.
   */
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<UserPreferences>({});

  useEffect(() => {
    if (!user) {
      setPreferences({});
      latestRef.current = {};
      setLoading(false); // personne a lire : on SAIT qu'il n'y a rien
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
      // L'IDENTIFIANT, PAS L'OBJET : `AuthContext` produit un nouvel objet
    // `profile` pour le meme compte a chaque rafraichissement et a chaque
    // bascule de `show_my_dossiers`. Dependre de l'objet relisait les
    // preferences a chacun de ces moments ; seul le changement de personne
    // justifie une relecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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