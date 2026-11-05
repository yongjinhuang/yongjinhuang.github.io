'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  readonly theme: Theme;
  readonly resolvedTheme: ResolvedTheme;
  readonly setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

function applyThemeToDOM(
  resolved: ResolvedTheme,
  disableTransitionOnChange: boolean
) {
  if (typeof document === 'undefined') return;

  let cleanupTransition: (() => void) | null = null;
  if (disableTransitionOnChange) {
    const style = document.createElement('style');
    style.appendChild(
      document.createTextNode(
        '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}'
      )
    );
    document.head.appendChild(style);
    cleanupTransition = () => {
      window.getComputedStyle(document.body);
      setTimeout(() => {
        if (style.parentNode) style.parentNode.removeChild(style);
      }, 1);
    };
  }

  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;

  cleanupTransition?.();
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  disableTransitionOnChange?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('dark');

  // Read saved theme and system preference on mount
  useEffect(() => {
    const sys = getSystemTheme();
    setSystemTheme(sys);

    let initial = defaultTheme;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        initial = stored;
      }
    } catch {
      // Ignore storage errors
    }

    setThemeState(initial);
    const resolved = initial === 'system' ? sys : initial;
    applyThemeToDOM(resolved, disableTransitionOnChange);
  }, [defaultTheme, disableTransitionOnChange]);

  // Listen to OS dark/light mode changes
  useEffect(() => {
    const mql = window.matchMedia(MEDIA_QUERY);
    const handleChange = (e: MediaQueryListEvent) => {
      const nextSys: ResolvedTheme = e.matches ? 'dark' : 'light';
      setSystemTheme(nextSys);
      if (theme === 'system') {
        applyThemeToDOM(nextSys, disableTransitionOnChange);
      }
    };

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [theme, disableTransitionOnChange]);

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      setThemeState(nextTheme);
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch {
        // Ignore storage errors
      }
      const resolved = nextTheme === 'system' ? getSystemTheme() : nextTheme;
      applyThemeToDOM(resolved, disableTransitionOnChange);
    },
    [disableTransitionOnChange]
  );

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
