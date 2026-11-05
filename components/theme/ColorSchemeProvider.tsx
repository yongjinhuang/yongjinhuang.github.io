'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  COLOR_SCHEME_NAMES,
  STORAGE_KEY,
  type ColorSchemeName,
} from '@/lib/color-schemes';

interface ColorSchemeContextValue {
  readonly scheme: ColorSchemeName;
  readonly isAuto: boolean;
  readonly setScheme: (scheme: ColorSchemeName) => void;
  readonly setAuto: () => void;
}

const ColorSchemeContext = createContext<ColorSchemeContextValue | null>(null);

function getSchemeForHour(): ColorSchemeName {
  const hour = new Date().getHours();
  return COLOR_SCHEME_NAMES[hour % COLOR_SCHEME_NAMES.length];
}

function getMillisUntilNextHour(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function applyScheme(scheme: ColorSchemeName): void {
  document.documentElement.setAttribute('data-color-scheme', scheme);
}

export function ColorSchemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorSchemeName>('amber');
  const [isAuto, setIsAuto] = useState(true);

  // Initialize from localStorage or hour
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (
      stored &&
      stored !== 'auto' &&
      COLOR_SCHEME_NAMES.includes(stored as ColorSchemeName)
    ) {
      const storedScheme = stored as ColorSchemeName;
      setSchemeState(storedScheme);
      setIsAuto(false);
      applyScheme(storedScheme);
    } else {
      const hourScheme = getSchemeForHour();
      setSchemeState(hourScheme);
      setIsAuto(true);
      applyScheme(hourScheme);
    }
  }, []);

  // Hourly rotation timer (only when auto)
  useEffect(() => {
    if (!isAuto) return;

    const scheduleNext = () => {
      const ms = getMillisUntilNextHour();
      return setTimeout(() => {
        const nextScheme = getSchemeForHour();
        setSchemeState(nextScheme);
        applyScheme(nextScheme);
        // Schedule the next rotation
        timerRef = scheduleNext();
      }, ms);
    };

    let timerRef = scheduleNext();
    return () => clearTimeout(timerRef);
  }, [isAuto]);

  const setScheme = useCallback((newScheme: ColorSchemeName) => {
    setSchemeState(newScheme);
    setIsAuto(false);
    applyScheme(newScheme);
    localStorage.setItem(STORAGE_KEY, newScheme);
  }, []);

  const setAuto = useCallback(() => {
    const hourScheme = getSchemeForHour();
    setSchemeState(hourScheme);
    setIsAuto(true);
    applyScheme(hourScheme);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ColorSchemeContext.Provider value={{ scheme, isAuto, setScheme, setAuto }}>
      {children}
    </ColorSchemeContext.Provider>
  );
}

export function useColorScheme(): ColorSchemeContextValue {
  const context = useContext(ColorSchemeContext);
  if (!context) {
    throw new Error('useColorScheme must be used within a ColorSchemeProvider');
  }
  return context;
}
