import { useEffect, useState } from 'react';

import { getLocale, translate, useI18n, useT } from '../lib/i18n';
import { useWorkspaceStore } from '../store/workspaceStore';
import WorkflowCanvas from '../features/canvas/WorkflowCanvas';
import Inspector from '../features/inspector/Inspector';
import WorkspaceNav from '../features/navigation/WorkspaceNav';
import NodeManager from '../features/nodes/NodeManager';
import ReadinessCenter from '../features/onboarding/ReadinessCenter';
import ProjectRail from '../features/projects/ProjectRail';
import RunBar from '../features/runs/RunBar';
import SettingsShell from '../features/settings/SettingsShell';
import { getCoordinatorStatus, restartCoordinator, waitForHealthyRuntime, type RuntimeInfo } from '../lib/runtime';
import { bindNativeUpdateMenu, getUpdateService } from '../lib/updater';
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
  const loadProject = useWorkspaceStore((state) => state.loadProject);
  const project = useWorkspaceStore((state) => state.project);
  const readiness = useWorkspaceStore((state) => state.readiness);
  const loadReadiness = useWorkspaceStore((state) => state.loadReadiness);
  const navCollapsed = useWorkspaceStore((state) => state.navCollapsed);
  const inspectorCollapsed = useWorkspaceStore((state) => state.inspectorCollapsed);
  const inspectorWidth = useWorkspaceStore((state) => state.inspectorWidth);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const setSettingsSection = useWorkspaceStore((state) => state.setSettingsSection);
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
    if (!('__TAURI_INTERNALS__' in window)) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void import('@tauri-apps/api/event')
      .then(({ listen }) => bindNativeUpdateMenu({
        listen: (event, handler) => listen(event, handler).then((stop) => () => { stop(); }),
        check: () => getUpdateService().check(),
        openUpdates: () => {
          setActivePanel('settings');
          setSettingsSection('updates');
        },
      }))
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {
        /* 浏览器环境或菜单监听失败时静默 */
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [setActivePanel, setSettingsSection]);

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
    void loadReadiness();
    void (async () => {
      await loadProjects();
      const { projects, project } = useWorkspaceStore.getState();
      if (!project && projects[0]) await loadProject(projects[0].id);
    })();
  }, [boot.phase, loadReadiness, loadProjects, loadProject]);

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
    const retryBoot = async () => {
      setBoot({ phase: 'booting' });
      try {
        const runtime = await waitForHealthyRuntime({ timeoutMs: 30_000, intervalMs: 200 });
        if (runtime.baseUrl) setCoordinatorBaseUrl(runtime.baseUrl, runtime.sessionToken);
        setBoot({ phase: 'ready', runtime });
      } catch (err) {
        setBoot({
          phase: 'error',
          message: err instanceof Error && /[一-鿿]/.test(err.message)
            ? err.message
            : translate(getLocale(), 'app.bootError.fallback'),
        });
      }
    };
    const restartAndRetry = async () => {
      await restartCoordinator().catch(() => null);
      await retryBoot();
    };
    const copyDiagnostics = async () => {
      const runtime = await getCoordinatorStatus().catch(() => null);
      const report = [
        `time: ${new Date().toISOString()}`,
        `error: ${boot.message}`,
        `runtime_status: ${runtime?.status ?? 'unknown'}`,
        `base_url: ${runtime?.baseUrl ?? 'none'}`,
        'note: 诊断信息不含会话令牌、凭据或私钥内容',
      ].join('\n');
      try {
        await navigator.clipboard.writeText(report);
      } catch {
        /* 剪贴板不可用时忽略 */
      }
    };
    const quitApp = () => {
      if ('__TAURI_INTERNALS__' in window) {
        void import('@tauri-apps/plugin-process').then(({ exit }) => exit(0)).catch(() => window.close());
      } else {
        window.close();
      }
    };
    return (
      <div className="app-shell boot-shell" role="alert">
        <div className="boot-card boot-error">
          <strong>{t('app.bootError.title')}</strong>
          <span>{boot.message}</span>
          <div className="boot-actions">
            <button type="button" onClick={() => void retryBoot()}>
              {t('app.bootError.retry')}
            </button>
            <button type="button" onClick={() => void restartAndRetry()}>
              {t('app.bootError.restartCoordinator')}
            </button>
            <button type="button" onClick={() => void copyDiagnostics()}>
              {t('app.bootError.copyDiagnostics')}
            </button>
            <button type="button" onClick={quitApp}>
              {t('app.bootError.quit')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showInspector = panel === 'workflow' && !inspectorCollapsed;
  const railWidth = navCollapsed ? 52 : 216;

  return (
    <div
      className={`app-shell${navCollapsed ? ' nav-collapsed' : ''}${inspectorCollapsed ? ' inspector-collapsed' : ''}`}
      style={{
        ['--nav-width' as string]: `${railWidth}px`,
        ['--inspector-width' as string]: showInspector ? `${inspectorWidth}px` : '0px',
      }}
    >
      <WorkspaceNav />
      <RunBar />
      {panel === 'workflow' && (
        <>
          <div className="workflow-stage">
            {(!project || (readiness && !readiness.ready)) && <ReadinessCenter />}
            <WorkflowCanvas />
          </div>
          {showInspector && <Inspector />}
        </>
      )}
      {panel === 'projects' && (
        <div className="panel-stage">
          <ProjectRail />
        </div>
      )}
      {panel === 'nodes' && (
        <div className="panel-stage">
          <NodeManager />
        </div>
      )}
      {(panel === 'settings' || panel === 'thinking_models') && (
        <div className="panel-stage">
          <SettingsShell />
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
