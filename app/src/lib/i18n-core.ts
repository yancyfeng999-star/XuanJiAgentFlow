import { messages as en } from './messages.en';
import { messages as zhCN } from './messages.zh-CN';

export type Locale = 'zh-CN' | 'en';

export const STORAGE_KEY = 'xuanji.locale';
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
