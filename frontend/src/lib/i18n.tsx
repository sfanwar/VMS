import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { en } from '../locales/en';
import { ar } from '../locales/ar';

export type Lang = 'en' | 'ar';
export type Dir = 'ltr' | 'rtl';

// The translation dictionary is keyed by the same shape across all languages.
// We use the English dictionary as the canonical type — every other locale
// must structurally match it (TypeScript enforces this in locales/ar.ts).
export type TranslationDict = typeof en;

const LOCALES: Record<Lang, TranslationDict> = { en, ar };

interface I18nContextValue {
  lang: Lang;
  dir: Dir;
  /** Translate a dotted key, e.g. t('nav.requests'). Falls back to the key itself if missing. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (next: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'vms.lang';

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    // localStorage unavailable — fall through to default
  }
  // Default to English. Could also peek at navigator.language here.
  return 'en';
}

function lookup(dict: TranslationDict, key: string): string | undefined {
  const parts = key.split('.');
  let node: any = dict;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in node) node = node[p];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);
  const dir: Dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Sync to <html lang> and <html dir> so global CSS + screen readers respond.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = (next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  };

  const t = useMemo<I18nContextValue['t']>(() => {
    const dict = LOCALES[lang];
    return (key, vars) => {
      const v = lookup(dict, key) ?? lookup(LOCALES.en, key) ?? key;
      return interpolate(v, vars);
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, dir, t, setLang }), [lang, dir, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used inside <LanguageProvider>');
  return ctx;
}
