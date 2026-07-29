import { useWorkspaceStore } from '../store/workspaceStore';
import WorkflowCanvas from '../features/canvas/WorkflowCanvas';
import Inspector from '../features/inspector/Inspector';
import NodeManager from '../features/nodes/NodeManager';
import ProjectRail from '../features/projects/ProjectRail';
import RunBar from '../features/runs/RunBar';
import SecuritySettings from '../features/settings/SecuritySettings';
import './AppShell.css';

export default function AppShell() {
  const panel = useWorkspaceStore((state) => state.activePanel);
  const error = useWorkspaceStore((state) => state.error);
  const clearError = useWorkspaceStore((state) => state.clearError);

  return <div className="app-shell">
    <ProjectRail />
    <RunBar />
    {panel === 'workflow' ? <><WorkflowCanvas /><Inspector /></> : <div className="panel-stage">{panel === 'nodes' ? <NodeManager /> : <SecuritySettings />}</div>}
    {error && <div className="error-banner" role="alert"><div><strong>{error.code}</strong><span>{error.message}</span></div><button type="button" onClick={clearError} aria-label="关闭错误">关闭</button></div>}
  </div>;
}
