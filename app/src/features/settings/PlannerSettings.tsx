import { useEffect, useState } from 'react';
import { Download, Languages, ShieldCheck } from 'lucide-react';

import { useI18n, type Locale } from '../../lib/i18n';
import { checkForUpdateManually, isRunBlockingRelaunch, relaunchApp } from '../../lib/updater';
import { useWorkspaceStore } from '../../store/workspaceStore';

const ISSUES_URL = 'https://github.com/yancyfeng999-star/XuanJiAgentFlow/issues';

export default function PlannerSettings() {
  const planner = useWorkspaceStore((state) => state.plannerConfig);
  const loadSettings = useWorkspaceStore((state) => state.loadSettings);
  const savePlannerConfig = useWorkspaceStore((state) => state.savePlannerConfig);
  const saving = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'save_planner'));
  const [plannerBaseUrl, setPlannerBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [plannerHint, setPlannerHint] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [updateState, setUpdateState] = useState<
    | { phase: 'idle' }
    | { phase: 'checking' }
    | { phase: 'up-to-date' }
    | { phase: 'installed'; version: string; relaunchBlocked: boolean }
    | { phase: 'failed' }
  >({ phase: 'idle' });

  const checkNow = async () => {
    setUpdateState({ phase: 'checking' });
    const result = await checkForUpdateManually({
      canRelaunch: () => !isRunBlockingRelaunch(useWorkspaceStore.getState().runStatus),
    });
    if (result.kind === 'up-to-date') setUpdateState({ phase: 'up-to-date' });
    else if (result.kind === 'installed') {
      setUpdateState({ phase: 'installed', version: result.version, relaunchBlocked: result.relaunchBlocked });
    } else setUpdateState({ phase: 'failed' });
  };
  const { t, locale, setLocale } = useI18n();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('__TAURI_INTERNALS__' in window)) return;
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const version = await getVersion();
        if (!cancelled) setAppVersion(version);
      } catch {
        /* 浏览器环境无版本信息 */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openIssues = async () => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(ISSUES_URL);
    } catch {
      /* 打开浏览器失败时静默 */
    }
  };

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
        <button type="submit" className="form-primary" disabled={saving}>
          {saving ? t('planner.saving') : t('planner.save')}
        </button>
      </form>
      <div className="settings-card form-grid">
        <h2><Languages size={18} />{t('settings.interface')}</h2>
        <label htmlFor="ui-locale">{t('settings.language')}</label>
        <select id="ui-locale" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
          <option value="zh-CN">中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="settings-card form-grid">
        <h2><Download size={18} />{t('updates.title')}</h2>
        <p className="muted">{t('update.manualHint')}</p>
        {appVersion && <p className="muted">{t('updates.currentVersion')}：{appVersion}</p>}
        <button type="button" onClick={() => void checkNow()} disabled={updateState.phase === 'checking'}>
          {updateState.phase === 'checking' ? t('updates.checking') : t('updates.checkNow')}
        </button>
        {updateState.phase === 'up-to-date' && <p className="configured" role="status">{t('updates.upToDate')}</p>}
        {updateState.phase === 'installed' && (
          <>
            <p className="configured" role="status">{t('updates.installed', { version: updateState.version })}</p>
            {updateState.relaunchBlocked ? (
              <p className="muted">{t('updates.runGuardBlocked')}</p>
            ) : (
              <button type="button" onClick={() => void relaunchApp()}>{t('updates.relaunchNow')}</button>
            )}
          </>
        )}
        {updateState.phase === 'failed' && <p className="form-hint" role="status">{t('updates.failed')}</p>}
        <button type="button" onClick={() => void openIssues()}>{t('updates.feedback')}</button>
        <p className="muted">{t('updates.feedbackHint')}</p>
      </div>
    </div>
  </section>;
}
