import { useEffect, useState } from 'react';

import { useT } from '../../lib/i18n';
import {
  getUpdateService,
  isRunBlockingRelaunch,
  type UpdateState,
} from '../../lib/updater';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function UpdateSettings() {
  const t = useT();
  const [state, setState] = useState<UpdateState>(getUpdateService().getState());
  const [appVersion, setAppVersion] = useState('');
  const runStatus = useWorkspaceStore((store) => store.runStatus);

  useEffect(() => getUpdateService().subscribe(setState), []);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let cancelled = false;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((version) => {
        if (!cancelled) setAppVersion(version);
      })
      .catch(() => {
        /* browser / missing plugin */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = state.kind === 'checking' || state.kind === 'downloading' || state.kind === 'installing';

  const apply = () => {
    void getUpdateService().applyAndRelaunch({
      canRelaunch: () => !isRunBlockingRelaunch(useWorkspaceStore.getState().runStatus),
    });
  };

  return (
    <section aria-label={t('settings.section.updates')}>
      <h2>{t('settings.section.updates')}</h2>
      <p className="muted">{t('update.manualHint')}</p>
      {appVersion && <p className="muted">{t('updates.currentVersion')}：{appVersion}</p>}
      <p data-testid="update-state">{state.kind}</p>
      {state.kind === 'desktop_only' && <p>{t('update.desktopOnly')}</p>}
      {state.kind === 'checking' && <p role="status">{t('updates.checking')}</p>}
      {state.kind === 'up_to_date' && <p className="configured" role="status">{t('updates.upToDate')}</p>}
      {state.kind === 'downloading' && (
        <p role="status">
          {t('update.downloading', { version: state.candidate.version })}
          {state.progress != null ? ` ${Math.round(state.progress * 100)}%` : ''}
        </p>
      )}
      {state.kind === 'installing' && (
        <p role="status">{t('update.relaunching', { version: state.candidate.version })}</p>
      )}
      {state.kind === 'restart_required' && (
        <p className="configured" role="status">{t('updates.installed', { version: state.candidate.version })}</p>
      )}
      {state.kind === 'run_blocked' && (
        <p className="form-hint" role="status">
          {t('update.runBlocked', { version: state.candidate.version })}
        </p>
      )}
      {state.kind === 'failed' && <p className="form-hint" role="status">{t('updates.failed')}</p>}
      {isRunBlockingRelaunch(runStatus) && state.kind !== 'run_blocked' && (
        <p className="muted">{t('updates.runGuardBlocked')}</p>
      )}
      <button type="button" onClick={apply} disabled={busy}>
        {busy ? t('updates.checking') : t('update.check')}
      </button>
    </section>
  );
}
