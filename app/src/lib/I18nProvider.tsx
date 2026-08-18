import { useMemo, useState, type ReactNode } from 'react';

import { I18nContext, type I18nContextValue } from './i18n-context';
import { getLocale, STORAGE_KEY, translate, type Locale } from './i18n-core';

export default function I18nProvider({ children }: { children: ReactNode }) {
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
