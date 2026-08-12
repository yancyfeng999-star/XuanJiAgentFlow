import { useEffect, useState } from 'react';

import { getLocale, translate, useI18n, useT } from '../lib/i18n';
import { useWorkspaceStore } from '../store/workspaceStore';
import WorkflowCanvas from '../features/canvas/WorkflowCanvas';
import Inspector from '../features/inspector/Inspector';
import NodeManager from '../features/nodes/NodeManager';
import ReadinessCenter from '../features/onboarding/ReadinessCenter';
import ProjectRail from '../features/projects/ProjectRail';
import RunBar from '../features/runs/RunBar';
import PlannerSettings from '../features/settings/PlannerSettings';
import { getCoordinatorStatus, waitForHealthyRuntime, type RuntimeInfo } from '../lib/runtime';
import { runSilentUpdate } from '../lib/updater';
import './AppShell.css';

type BootState =
  | { phase: 'booting' }
  | { phase: 'ready'; runtime: RuntimeInfo }
  | { phase: 'error'; message: string };

export default function AppShell() {
  const panel = useWorkspaceStore((state) => state.activePanel);
  const error = useWorkspaceStore((state) => state.error);
  const clearError = useWorkspaceStore((state) => state.clearError);
  const setCoordinatorBaseUrl = useWorkspaceStore((state) => state.setCoordinatorBaseUrl);
  const coordinatorBaseUrl = useWorkspaceStore((state) => state.coordinatorBaseUrl);
  const coordinatorSessionToken = useWorkspaceStore((state) => state.coordinatorSessionToken);
  const loadProjects = useWorkspaceStore((state) => state.loadProjects);
  const project = useWorkspaceStore((state) => state.project);
  const readiness = useWorkspaceStore((state) => state.readiness);
  const loadReadiness = useWorkspaceStore((state) => state.loadReadiness);
  const [boot, setBoot] = useState<BootState>({ phase: 'booting' });
  const t = useT();
  const { locale } = useI18n();

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_app_locale', { locale }))
      .catch(() => {
        /* 浏览器环境或菜单同步失败时静默 */
      });
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const runtime = await waitForHealthyRuntime({ timeoutMs: 30_000, intervalMs: 200 });
        if (cancelled) return;
        if (runtime.baseUrl) {
          setCoordinatorBaseUrl(runtime.baseUrl, runtime.sessionToken);
        }
        setBoot({ phase: 'ready', runtime });
      } catch (err) {
        if (cancelled) return;
        setBoot({
          phase: 'error',
          message: err instanceof Error && /[\u4e00-\u9fff]/.test(err.message)
            ? err.message
            : translate(getLocale(), 'app.bootError.fallback'),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCoordinatorBaseUrl]);

  useEffect(() => {
    if (boot.phase !== 'ready') return;
    void runSilentUpdate();
    void loadReadiness();
  }, [boot.phase, loadReadiness]);

  useEffect(() => {
    if (boot.phase !== 'ready') return;
    let cancelled = false;
    const syncRuntime = async () => {
      const runtime = await getCoordinatorStatus();
      if (
        cancelled ||
        runtime.status !== 'healthy' ||
        !runtime.baseUrl ||
        (
          runtime.baseUrl === coordinatorBaseUrl &&
          (runtime.sessionToken ?? null) === coordinatorSessionToken
        )
      ) {
        return;
      }
      setCoordinatorBaseUrl(runtime.baseUrl, runtime.sessionToken);
      await loadProjects();
    };
    const timer = window.setInterval(() => {
      void syncRuntime();
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    boot.phase,
    coordinatorBaseUrl,
    coordinatorSessionToken,
    loadProjects,
    setCoordinatorBaseUrl,
  ]);

  if (boot.phase === 'booting') {
    return (
      <div className="app-shell boot-shell" role="status" aria-live="polite">
        <div className="boot-card">
          <strong>{t('app.booting.title')}</strong>
          <span>{t('app.booting.hint')}</span>
        </div>
      </div>
    );
  }

  if (boot.phase === 'error') {
    return (
      <div className="app-shell boot-shell" role="alert">
        <div className="boot-card boot-error">
          <strong>{t('app.bootError.title')}</strong>
          <span>{boot.message}</span>
          <button type="button" onClick={() => window.location.reload()}>
            {t('app.bootError.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <ProjectRail />
      <RunBar />
      {panel === 'workflow' ? (
        <>
          <div className="workflow-stage">
            {(!project || (readiness && !readiness.ready)) && <ReadinessCenter />}
            <WorkflowCanvas />
          </div>
          <Inspector />
        </>
      ) : (
        <div className="panel-stage">
          {panel === 'nodes' ? <NodeManager /> : <PlannerSettings />}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <div>
            <strong>{t('app.error.title')}</strong>
            <span>{error.message}</span>
          </div>
          <button type="button" onClick={clearError} aria-label={t('app.error.closeBanner')}>
            {t('app.error.close')}
          </button>
        </div>
      )}
    </div>
  );
}
