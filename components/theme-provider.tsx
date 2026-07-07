'use client';

/**
 * Theme provider — manages light/dark/system themes with localStorage
 * persistence and a no-FOUC inline init script (see app/layout.tsx).
 *
 * Why no `next-themes`: the dep is overkill for two theme values. Our
 * implementation is ~80 lines and reads/writes the same shape
 * (nextep-theme in localStorage). When we need viewport-match-on-system,
 * FOUC-prevention, or color-scheme meta — those are already handled here.
 */

import * as React from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'nextep-theme';
const DARK_CLASS = 'dark';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, resolved === 'dark');
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Render with default theme; the inline init script has already applied
  // the correct class to <html> before React hydrates. We only need to read
  // the stored preference and wire up reactivity.
  const [theme, setThemeState] = React.useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>('light');

  React.useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    const resolved = stored === 'system' ? getSystemTheme() : stored;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // React to system preference changes while in 'system' mode.
  React.useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be disabled (private browsing, sandboxed iframe).
      // The theme still applies for the current session.
    }
    const resolved = next === 'system' ? getSystemTheme() : next;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return ctx;
}