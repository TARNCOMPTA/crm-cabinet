import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Pose `data-theme` sur <html>, et non la classe `.dark`.
 *
 * C'est ce qu'attendent les jetons de la charte (`src/styles/tokens.css`), et
 * c'est la convention des autres outils du cabinet — portail, TNS Pilot. Le
 * verrou d'impression en dépend : il neutralise `[data-theme='dark']`, ce
 * qu'un sélecteur de classe ne lui permettrait pas d'exprimer aussi
 * simplement.
 *
 * Tailwind est configuré sur le même sélecteur, donc les variantes `dark:`
 * déjà écrites dans les composants continuent de fonctionner sans retouche.
 *
 * L'attribut est posé dans les deux cas plutôt que retiré en clair : un
 * `[data-theme='light']` explicite permet de forcer le thème clair même si le
 * système est en sombre.
 */
function applyThemeClass(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function triggerTransition() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.add('theme-transitioning');
  window.setTimeout(() => {
    root.classList.remove('theme-transitioning');
  }, 360);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyThemeClass(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState((prev) => {
      if (prev === t) return prev;
      triggerTransition();
      return t;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      triggerTransition();
      return prev === 'light' ? 'dark' : 'light';
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
