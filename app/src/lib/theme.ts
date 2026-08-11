export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'xuanji.theme';

function mediaQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage 不可用时跟随系统 */
  }
  return 'system';
}

export function resolveTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return mediaQuery()?.matches ? 'dark' : 'light';
}

export function applyTheme(preference: ThemePreference = getThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try {
    if (preference === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    /* 忽略持久化失败，仍然应用主题 */
  }
  return applyTheme(preference);
}

export function toggleTheme(): ResolvedTheme {
  const next: ResolvedTheme = resolveTheme() === 'dark' ? 'light' : 'dark';
  return setThemePreference(next);
}

export function initTheme(): void {
  applyTheme();
  mediaQuery()?.addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
}
