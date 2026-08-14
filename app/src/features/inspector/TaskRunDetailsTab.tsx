import ArtifactBrowser from '../artifacts/ArtifactBrowser';
import RunHistory from '../runs/RunHistory';
import TaskLog from '../runs/TaskLog';
import RunControls from '../runs/RunControls';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function TaskRunDetailsTab() {
  const runId = useWorkspaceStore((state) => state.run?.id);
  const taskId = useWorkspaceStore((state) => state.selectedTaskId);
  return (
    <div className="inspector-tab-panel">
      <RunControls />
      <RunHistory />
      {runId && taskId && <TaskLog runId={runId} taskId={taskId} />}
      {runId && <ArtifactBrowser runId={runId} taskId={taskId} />}
    </div>
  );
}
