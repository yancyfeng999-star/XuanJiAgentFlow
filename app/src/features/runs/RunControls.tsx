import { Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';

import { useWorkspaceStore } from '../../store/workspaceStore';

export default function RunControls() {
  const run = useWorkspaceStore((state) => state.run);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId);
  const pauseRun = useWorkspaceStore((state) => state.pauseRun);
  const resumeRun = useWorkspaceStore((state) => state.resumeRun);
  const cancelRun = useWorkspaceStore((state) => state.cancelRun);
  const retryTask = useWorkspaceStore((state) => state.retryTask);
  const skipTask = useWorkspaceStore((state) => state.skipTask);
  const status = run?.status ?? runStatus;
  const disabled = !run;
  const canPause = status === 'running' || status === 'accepted' || status === 'pending';
  const canResume = status === 'paused' || status === 'blocked';
  const canCancel = !['completed', 'cancelled', 'failed', 'idle', 'success'].includes(status);
  const canMutateTask = Boolean(selectedTaskId && run);

  return (
    <div className="run-controls" aria-label="运行控制">
      <button
        type="button"
        onClick={() => void pauseRun()}
        disabled={disabled || !canPause}
        aria-label="暂停"
      >
        <Pause size={14} />暂停
      </button>
      <button
        type="button"
        onClick={() => void resumeRun()}
        disabled={disabled || !canResume}
        aria-label="恢复"
      >
        <Play size={14} />恢复
      </button>
      <button
        type="button"
        onClick={() => void cancelRun()}
        disabled={disabled || !canCancel}
        aria-label="取消"
      >
        <Square size={14} />取消
      </button>
      <button
        type="button"
        onClick={() => selectedTaskId && void retryTask(selectedTaskId)}
        disabled={!canMutateTask}
        aria-label="重试任务"
      >
        <RotateCcw size={14} />重试
      </button>
      <button
        type="button"
        onClick={() => selectedTaskId && void skipTask(selectedTaskId)}
        disabled={!canMutateTask}
        aria-label="跳过任务"
      >
        <SkipForward size={14} />跳过
      </button>
    </div>
  );
}
