import { useEffect, useState } from 'react';
import { Languages, ShieldCheck } from 'lucide-react';

import { useI18n, type Locale } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function PlannerSettings() {
  const planner = useWorkspaceStore((state) => state.plannerConfig);
  const loadSettings = useWorkspaceStore((state) => state.loadSettings);
  const savePlannerConfig = useWorkspaceStore((state) => state.savePlannerConfig);
  const [plannerBaseUrl, setPlannerBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [plannerHint, setPlannerHint] = useState('');
  const { t, locale, setLocale } = useI18n();

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { setPlannerBaseUrl(planner.base_url ?? ''); setModel(planner.model ?? ''); }, [planner.base_url, planner.model]);

  const submitPlanner = async (event: React.FormEvent) => {
    event.preventDefault();
    await savePlannerConfig({
      base_url: plannerBaseUrl,
      model,
      credential_key: planner.credential_key ?? 'planner.primary',
      ...(apiKey ? { credential: apiKey } : {}),
    });
    setApiKey('');
    setPlannerHint(t('planner.saved'));
  };

  return <section className="workspace-overlay" aria-label={t('nav.settings')}>
    <header><div><span>{t('settings.kicker')}</span><h1>{t('nav.settings')}</h1><p>{t('settings.subtitle')}</p></div></header>
    <div className="overlay-grid">
      <form className="settings-card form-grid" onSubmit={submitPlanner}>
        <h2><ShieldCheck size={18} />{t('planner.title')}</h2>
        <label htmlFor="planner-base-url">{t('planner.baseUrl')}</label><input id="planner-base-url" type="url" value={plannerBaseUrl} onChange={(event) => setPlannerBaseUrl(event.target.value)} required />
        <label htmlFor="planner-model">{t('planner.model')}</label><input id="planner-model" value={model} onChange={(event) => setModel(event.target.value)} required />
        <label htmlFor="planner-api-key">{t('planner.apiKey')}</label><input id="planner-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" />
        {planner.credential_configured === true && <p className="configured">{t('planner.keyConfigured')}</p>}
        {plannerHint && <p className="configured" role="status">{plannerHint}</p>}
        <button type="submit" className="form-primary">{t('planner.save')}</button>
      </form>
      <div className="settings-card form-grid">
        <h2><Languages size={18} />{t('settings.interface')}</h2>
        <label htmlFor="ui-locale">{t('settings.language')}</label>
        <select id="ui-locale" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
          <option value="zh-CN">中文</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  </section>;
}
