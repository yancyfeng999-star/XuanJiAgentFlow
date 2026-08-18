import { createContext } from 'react';

import { translate, type Locale } from './i18n-core';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: 'zh-CN',
  setLocale: () => undefined,
  t: (key, vars) => translate('zh-CN', key, vars),
});
