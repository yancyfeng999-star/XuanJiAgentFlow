import { Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';

import { useT } from '../../lib/i18n';
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
  const pendingActions = useWorkspaceStore((state) => state.pendingActions);
  const controlPending = (kind: string, key?: string) =>
    pendingActions.some((action) => action.kind === kind && (key === undefined || action.key === key));
  const status = run?.status ?? runStatus;
  const disabled = !run;
  const canPause = status === 'running' || status === 'accepted' || status === 'pending';
  const canResume = status === 'paused' || status === 'blocked';
  const canCancel = !['completed', 'cancelled', 'failed', 'idle', 'success'].includes(status);
  const canMutateTask = Boolean(selectedTaskId && run);
  const t = useT();

  return (
    <div className="run-controls" aria-label={t('run.controls')}>
      <button
        type="button"
        onClick={() => void pauseRun()}
        disabled={disabled || !canPause || controlPending('pause', run?.id)}
        aria-label={t('run.pause')}
      >
        <Pause size={14} />{t('run.pause')}
      </button>
      <button
        type="button"
        onClick={() => void resumeRun()}
        disabled={disabled || !canResume || controlPending('resume', run?.id)}
        aria-label={t('run.resume')}
      >
        <Play size={14} />{t('run.resume')}
      </button>
      <button
        type="button"
        onClick={() => void cancelRun()}
        disabled={disabled || !canCancel || controlPending('cancel', run?.id)}
        aria-label={t('run.cancel')}
      >
        <Square size={14} />{t('run.cancel')}
      </button>
      <button
        type="button"
        onClick={() => selectedTaskId && void retryTask(selectedTaskId)}
        disabled={!canMutateTask || (selectedTaskId !== null && controlPending('retry_task', selectedTaskId))}
        aria-label={t('run.retryTask')}
      >
        <RotateCcw size={14} />{t('run.retry')}
      </button>
      <button
        type="button"
        onClick={() => selectedTaskId && void skipTask(selectedTaskId)}
        disabled={!canMutateTask || (selectedTaskId !== null && controlPending('skip_task', selectedTaskId))}
        aria-label={t('run.skipTask')}
      >
        <SkipForward size={14} />{t('run.skip')}
      </button>
    </div>
  );
}
