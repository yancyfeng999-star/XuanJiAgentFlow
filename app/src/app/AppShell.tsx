import { lazy, Suspense, useEffect, useState } from 'react';

import { getLocale, translate, useI18n, useT } from '../lib/i18n';
import { markMilestone } from '../lib/performance';
import { useWorkspaceStore } from '../store/workspaceStore';
import WorkspaceSkeleton from '../components/WorkspaceSkeleton';
import WorkspaceNav from '../features/navigation/WorkspaceNav';
import ReadinessCenter from '../features/onboarding/ReadinessCenter';
import RunBar from '../features/runs/RunBar';
import { getCoordinatorStatus, restartCoordinator, waitForHealthyRuntime, type RuntimeInfo } from '../lib/runtime';
import { bindNativeUpdateMenu, getUpdateService, isRunBlockingRelaunch } from '../lib/updater';
import './AppShell.css';

const WorkflowCanvas = lazy(() => import('../features/canvas/WorkflowCanvas'));
const Inspector = lazy(() => import('../features/inspector/Inspector'));
const NodeManager = lazy(() => import('../features/nodes/NodeManager'));
const SettingsShell = lazy(() => import('../features/settings/SettingsShell'));
const ProjectRail = lazy(() => import('../features/projects/ProjectRail'));

export type BootPhase = 'connecting' | 'loading_workspace' | 'ready' | 'degraded';

type BootState =
  | { phase: 'connecting' }
  | { phase: 'loading_workspace' | 'ready'; runtime: RuntimeInfo }
  | { phase: 'degraded'; message: string };

export default function AppShell() {
  const panel = useWorkspaceStore((state) => state.activePanel);
  const error = useWorkspaceStore((state) => state.error);
  const clearError = useWorkspaceStore((state) => state.clearError);
  const setCoordinatorBaseUrl = useWorkspaceStore((state) => state.setCoordinatorBaseUrl);
  const coordinatorBaseUrl = useWorkspaceStore((state) => state.coordinatorBaseUrl);
  const coordinatorSessionToken = useWorkspaceStore((state) => state.coordinatorSessionToken);
  const bootstrapWorkspace = useWorkspaceStore((state) => state.bootstrapWorkspace);
  const loadProjects = useWorkspaceStore((state) => state.loadProjects);
  const projectLoadPhase = useWorkspaceStore((state) => state.projectLoadPhase);
  const workflow = useWorkspaceStore((state) => state.workflow);
  const inspectorContext = useWorkspaceStore((state) => state.inspectorContext);
  const inspectorWidth = useWorkspaceStore((state) => state.inspectorWidth);
  const navCollapsed = useWorkspaceStore((state) => state.navCollapsed);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const setSettingsSection = useWorkspaceStore((state) => state.setSettingsSection);
  const closeInspector = useWorkspaceStore((state) => state.closeInspector);
  const [boot, setBoot] = useState<BootState>({ phase: 'connecting' });
  const [readinessExpanded, setReadinessExpanded] = useState(false);
  const t = useT();
  const { locale } = useI18n();

  useEffect(() => {
    markMilestone('shell_mounted');
  }, []);

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
        check: () => getUpdateService().applyAndRelaunch({
          canRelaunch: () => !isRunBlockingRelaunch(useWorkspaceStore.getState().runStatus),
        }),
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
        markMilestone('runtime_healthy');
        setBoot({ phase: 'loading_workspace', runtime });
      } catch (err) {
        if (cancelled) return;
        setBoot({
          phase: 'degraded',
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
    if (boot.phase !== 'loading_workspace') return;
    let cancelled = false;
    void (async () => {
      await bootstrapWorkspace();
      if (cancelled) return;
      markMilestone('workspace_interactive');
      setBoot((current) => current.phase === 'loading_workspace'
        ? { phase: 'ready', runtime: current.runtime }
        : current);
    })();
    return () => {
      cancelled = true;
    };
  }, [boot.phase, bootstrapWorkspace]);

  useEffect(() => {
    if (boot.phase !== 'ready' && boot.phase !== 'loading_workspace') return;
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (readinessExpanded) {
        setReadinessExpanded(false);
        return;
      }
      if (inspectorContext && window.matchMedia('(max-width: 1099px)').matches) {
        closeInspector();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeInspector, inspectorContext, readinessExpanded]);

  const retryBoot = async () => {
    setBoot({ phase: 'connecting' });
    try {
      const runtime = await waitForHealthyRuntime({ timeoutMs: 30_000, intervalMs: 200 });
      if (runtime.baseUrl) setCoordinatorBaseUrl(runtime.baseUrl, runtime.sessionToken);
      setBoot({ phase: 'loading_workspace', runtime });
    } catch (err) {
      setBoot({
        phase: 'degraded',
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
      `error: ${boot.phase === 'degraded' ? boot.message : 'unknown'}`,
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

  const showInspector = panel === 'workflow' && inspectorContext !== null;
  const railWidth = navCollapsed ? 52 : 208;
  const connecting = boot.phase === 'connecting';
  const canvasBusy = connecting || boot.phase === 'loading_workspace' || projectLoadPhase === 'loading';
  const showCanvas = boot.phase !== 'connecting' && boot.phase !== 'degraded' && (Boolean(workflow) || projectLoadPhase === 'ready' || boot.phase === 'ready');

  return (
    <div
      className={`app-shell${navCollapsed ? ' nav-collapsed' : ''}${showInspector ? '' : ' inspector-collapsed'}`}
      style={{
        ['--nav-width' as string]: `${railWidth}px`,
        ['--inspector-width' as string]: showInspector ? `${inspectorWidth}px` : '0px',
      }}
    >
      <WorkspaceNav />
      <RunBar
        phase={boot.phase}
        onResolve={() => setReadinessExpanded(true)}
      />
      {panel === 'workflow' && (
        <>
          <section className="workflow-stage" aria-busy={canvasBusy}>
            <ReadinessCenter expanded={readinessExpanded} onExpandedChange={setReadinessExpanded} />
            {!showCanvas ? (
              boot.phase === 'degraded' ? (
                <div className="boot-card boot-error workspace-degraded" role="alert">
                  <strong>{t('app.bootError.title')}</strong>
                  <span>{boot.message}</span>
                  <div className="boot-actions">
                    <button type="button" onClick={() => void retryBoot()}>{t('app.bootError.retry')}</button>
                    <button type="button" onClick={() => void restartAndRetry()}>{t('app.bootError.restartCoordinator')}</button>
                    <button type="button" onClick={() => void copyDiagnostics()}>{t('app.bootError.copyDiagnostics')}</button>
                    <button type="button" onClick={quitApp}>{t('app.bootError.quit')}</button>
                  </div>
                </div>
              ) : (
                <WorkspaceSkeleton region="canvas" />
              )
            ) : (
              <Suspense fallback={<WorkspaceSkeleton region="canvas" />}>
                <WorkflowCanvas />
              </Suspense>
            )}
          </section>
          {showInspector && (
            <Suspense fallback={<aside className="inspector inspector-skeleton" aria-label={t('inspector.title')} />}>
              <Inspector />
            </Suspense>
          )}
        </>
      )}
      {panel === 'projects' && (
        <div className="panel-stage">
          <Suspense fallback={<WorkspaceSkeleton region="canvas" />}>
            <ProjectRail />
          </Suspense>
        </div>
      )}
      {panel === 'nodes' && (
        <div className="panel-stage">
          <Suspense fallback={<WorkspaceSkeleton region="canvas" />}>
            <NodeManager />
          </Suspense>
        </div>
      )}
      {(panel === 'settings' || panel === 'thinking_models') && (
        <div className="panel-stage">
          <Suspense fallback={<WorkspaceSkeleton region="canvas" />}>
            <SettingsShell />
          </Suspense>
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
