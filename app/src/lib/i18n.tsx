import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { messages as en } from './messages.en';
import { messages as zhCN } from './messages.zh-CN';

export type Locale = 'zh-CN' | 'en';

const STORAGE_KEY = 'xuanji.locale';
const dictionaries: Record<Locale, Record<string, string>> = { 'zh-CN': zhCN, en };

export function getLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh-CN') return stored;
  } catch {
    /* localStorage 不可用时使用默认中文 */
  }
  return 'zh-CN';
}

export function hasMessage(locale: Locale, key: string): boolean {
  return key in dictionaries[locale] || key in dictionaries['zh-CN'];
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const table = dictionaries[locale];
  const template = table[key] ?? dictionaries['zh-CN'][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'zh-CN',
  setLocale: () => undefined,
  t: (key, vars) => translate('zh-CN', key, vars),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (next: Locale) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* 忽略持久化失败 */
      }
      setLocaleState(next);
    },
    t: (key, vars) => translate(locale, key, vars),
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useT(): I18nContextValue['t'] {
  return useContext(I18nContext).t;
}
