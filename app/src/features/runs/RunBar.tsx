import { Play, Wifi } from 'lucide-react';

import { useWorkspaceStore } from '../../store/workspaceStore';
import ReviewGate from '../workflow/ReviewGate';

const runStatusLabels: Record<string, string> = {
  idle: '待运行', accepted: '已接受', running: '运行中', paused: '已暂停', completed: '已完成', failed: '失败', cancelled: '已终止',
};

export default function RunBar() {
  const project = useWorkspaceStore((state) => state.project);
  const workflow = useWorkspaceStore((state) => state.workflow);
  const run = useWorkspaceStore((state) => state.run);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const runProgress = useWorkspaceStore((state) => state.runProgress);
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const canExecute = useWorkspaceStore((state) => state.canExecute);
  const executeWorkflow = useWorkspaceStore((state) => state.executeWorkflow);
  const online = nodes.filter((node) => node.status === 'online').length;
  const status = run?.status ?? runStatus;

  return <header className="run-bar" aria-label="顶部运行栏">
    <div className="run-title"><strong>{project?.name ?? '未选择项目'}</strong><span>{workflow ? `工作流 v${workflow.version}` : '尚未规划'}</span><span className="status">{runStatusLabels[status] ?? status}</span></div>
    <div className="run-progress"><div><span>总进度</span><b>{runProgress}%</b></div><div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={runProgress}><i style={{ width: `${runProgress}%` }} /></div></div>
    <span className="node-count"><Wifi size={15} />{online} 个节点在线</span>
    <div className="run-actions"><ReviewGate /><button type="button" className="primary" onClick={() => void executeWorkflow()} disabled={!canExecute} aria-label="执行全部"><Play size={16} />执行全部</button></div>
  </header>;
}
