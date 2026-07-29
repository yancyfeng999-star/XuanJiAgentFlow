import { useEffect, useState } from 'react';

import { useWorkspaceStore } from '../store/workspaceStore';
import WorkflowCanvas from '../features/canvas/WorkflowCanvas';
import Inspector from '../features/inspector/Inspector';
import NodeManager from '../features/nodes/NodeManager';
import ProjectRail from '../features/projects/ProjectRail';
import RunBar from '../features/runs/RunBar';
import SecuritySettings from '../features/settings/SecuritySettings';
import { waitForHealthyRuntime, type RuntimeInfo } from '../lib/runtime';
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
  const [boot, setBoot] = useState<BootState>({ phase: 'booting' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const runtime = await waitForHealthyRuntime({ timeoutMs: 30_000, intervalMs: 200 });
        if (cancelled) return;
        if (runtime.baseUrl) {
          setCoordinatorBaseUrl(runtime.baseUrl);
        }
        setBoot({ phase: 'ready', runtime });
      } catch (err) {
        if (cancelled) return;
        setBoot({
          phase: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCoordinatorBaseUrl]);

  if (boot.phase === 'booting') {
    return (
      <div className="app-shell boot-shell" role="status" aria-live="polite">
        <div className="boot-card">
          <strong>正在启动 Coordinator…</strong>
          <span>等待 sidecar 健康检查通过后再加载工作区。</span>
        </div>
      </div>
    );
  }

  if (boot.phase === 'error') {
    return (
      <div className="app-shell boot-shell" role="alert">
        <div className="boot-card boot-error">
          <strong>Coordinator 未能就绪</strong>
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
          {panel === 'nodes' ? <NodeManager /> : <SecuritySettings />}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <div>
            <strong>{error.code}</strong>
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
