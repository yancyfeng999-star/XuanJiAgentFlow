import { useContext } from 'react';

import { I18nContext, type I18nContextValue } from './i18n-context';

export type { Locale } from './i18n-core';
export { getLocale, hasMessage, translate } from './i18n-core';

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useT(): I18nContextValue['t'] {
  return useContext(I18nContext).t;
}
