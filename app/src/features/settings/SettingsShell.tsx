import { useState } from 'react';

import { useI18n, type Locale } from '../../lib/i18n';
import { setThemePreference, type ThemePreference } from '../../lib/theme';
import { useWorkspaceStore, type SettingsSection } from '../../store/workspaceStore';
import ThinkingModels from '../thinking-models/ThinkingModels';

const SECTIONS: SettingsSection[] = [
  'appearance',
  'thinking_models',
  'execution',
  'updates',
  'support',
  'about',
];

export default function SettingsShell() {
  const settingsSection = useWorkspaceStore((state) => state.settingsSection);
  const setSettingsSection = useWorkspaceStore((state) => state.setSettingsSection);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const { t, locale, setLocale } = useI18n();
  const [theme, setTheme] = useState<ThemePreference>('system');

  return (
    <section className="settings-shell" aria-label={t('nav.settings')}>
      <div className="settings-nav" role="tablist" aria-label={t('settings.categories')}>
        {SECTIONS.map((section) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={settingsSection === section}
            onClick={() => setSettingsSection(section)}
          >
            {t(`settings.section.${section}`)}
          </button>
        ))}
      </div>
      <div className="settings-panel" role="tabpanel">
        {settingsSection === 'appearance' && (
          <>
            <h2>{t('settings.section.appearance')}</h2>
            <label>
              {t('settings.theme')}
              <select
                value={theme}
                onChange={(event) => {
                  const next = event.target.value as ThemePreference;
                  setTheme(next);
                  setThemePreference(next);
                }}
              >
                <option value="light">{t('theme.light')}</option>
                <option value="dark">{t('theme.dark')}</option>
                <option value="system">{t('theme.system')}</option>
              </select>
            </label>
            <label>
              {t('settings.language')}
              <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
          </>
        )}
        {settingsSection === 'thinking_models' && <ThinkingModels />}
        {settingsSection === 'execution' && (
          <>
            <h2>{t('settings.section.execution')}</h2>
            <p>{t('settings.executionHint')}</p>
            <button type="button" onClick={() => setActivePanel('nodes')}>
              {t('nav.nodes')}
            </button>
          </>
        )}
        {settingsSection === 'updates' && <h2>{t('settings.section.updates')}</h2>}
        {settingsSection === 'support' && <h2>{t('settings.section.support')}</h2>}
        {settingsSection === 'about' && (
          <>
            <h2>{t('settings.section.about')}</h2>
            <p>{t('settings.aboutCopy')}</p>
          </>
        )}
      </div>
    </section>
  );
}
