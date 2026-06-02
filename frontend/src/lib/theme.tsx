import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type ThemeId = 'diplomatic' | 'burgundy' | 'slate' | 'midnight';

/** Selectable UI themes (default first). The label keys resolve through i18n (theme.*). */
export const THEMES: { id: ThemeId; labelKey: string }[] = [
  { id: 'slate', labelKey: 'theme.slate' },
  { id: 'diplomatic', labelKey: 'theme.diplomatic' },
  { id: 'burgundy', labelKey: 'theme.burgundy' },
  { id: 'midnight', labelKey: 'theme.midnight' },
];

const THEME_IDS = THEMES.map((t) => t.id) as string[];
const STORAGE_KEY = 'vms.theme';

function detectInitialTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEME_IDS.includes(saved)) return saved as ThemeId;
  } catch {
    // localStorage unavailable — fall through to default
  }
  return 'slate';
}

interface ThemeContextValue {
  theme: ThemeId;
  themes: typeof THEMES;
  setTheme: (next: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(detectInitialTheme);

  // Apply the theme to <html data-theme> so the CSS token overrides take effect.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = (next: ThemeId) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  };

  const value = useMemo(() => ({ theme, themes: THEMES, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
