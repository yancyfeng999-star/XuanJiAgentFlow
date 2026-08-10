import { useEffect, useState } from 'react';

import { useWorkspaceStore } from '../store/workspaceStore';
import WorkflowCanvas from '../features/canvas/WorkflowCanvas';
import Inspector from '../features/inspector/Inspector';
import NodeManager from '../features/nodes/NodeManager';
import ProjectRail from '../features/projects/ProjectRail';
import RunBar from '../features/runs/RunBar';
import PlannerSettings from '../features/settings/PlannerSettings';
import { getCoordinatorStatus, waitForHealthyRuntime, type RuntimeInfo } from '../lib/runtime';
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
  const [boot, setBoot] = useState<BootState>({ phase: 'booting' });

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
            : '协调器启动失败，请重新启动应用',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCoordinatorBaseUrl]);

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
          <strong>正在启动协调器…</strong>
          <span>等待后台服务健康检查通过后再加载工作区。</span>
        </div>
      </div>
    );
  }

  if (boot.phase === 'error') {
    return (
      <div className="app-shell boot-shell" role="alert">
        <div className="boot-card boot-error">
          <strong>协调器未能就绪</strong>
          <span>{boot.message}</span>
          <button type="button" onClick={() => window.location.reload()}>
            重试
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
          <WorkflowCanvas />
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
            <strong>操作失败</strong>
            <span>{error.message}</span>
          </div>
          <button type="button" onClick={clearError} aria-label="关闭错误">
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
