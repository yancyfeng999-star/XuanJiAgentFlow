import { Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';

import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function RunControls() {
  const run = useWorkspaceStore((state) => state.run);
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId);
  const pauseRun = useWorkspaceStore((state) => state.pauseRun);
  const resumeRun = useWorkspaceStore((state) => state.resumeRun);
  const cancelRun = useWorkspaceStore((state) => state.cancelRun);
  const retryTask = useWorkspaceStore((state) => state.retryTask);
  const skipTask = useWorkspaceStore((state) => state.skipTask);
  const pendingActions = useWorkspaceStore((state) => state.pendingActions);
  const controlPending = (kind: string, key?: string) =>
    pendingActions.some((action) => action.kind === kind && (key === undefined || action.key === key));
  const t = useT();

  const allowed = run?.allowed_actions ?? [];
  const disabled = !run;
  const canPause = allowed.includes('pause');
  const canResume = allowed.includes('resume');
  const canCancel = allowed.includes('cancel');

  const latestAttempt = selectedTaskId
    ? (run?.attempts ?? [])
        .filter((attempt) => attempt.task_id === selectedTaskId)
        .sort((a, b) => b.attempt - a.attempt)[0]
    : undefined;
  const taskAllowed = latestAttempt?.allowed_actions ?? [];
  const canRetry = Boolean(selectedTaskId && run) && taskAllowed.includes('retry');
  const canSkip = Boolean(selectedTaskId && run) && taskAllowed.includes('skip');

  return (
    <div className="run-controls" aria-label={t('run.controls')}>
      <button
        type="button"
        onClick={() => void pauseRun()}
        disabled={disabled || !canPause || controlPending('pause', run?.id)}
        aria-label={t('run.pause')}
        title={!canPause && run ? t('run.actionNotAllowed') : undefined}
      >
        <Pause size={14} />{t('run.pause')}
      </button>
      <button
        type="button"
        onClick={() => void resumeRun()}
        disabled={disabled || !canResume || controlPending('resume', run?.id)}
        aria-label={t('run.resume')}
        title={!canResume && run ? t('run.actionNotAllowed') : undefined}
      >
        <Play size={14} />{t('run.resume')}
      </button>
      <button
        type="button"
        onClick={() => void cancelRun()}
        disabled={disabled || !canCancel || controlPending('cancel', run?.id)}
        aria-label={t('run.cancel')}
        title={!canCancel && run ? t('run.actionNotAllowed') : undefined}
      >
        <Square size={14} />{t('run.cancel')}
      </button>
      <button
        type="button"
        onClick={() => selectedTaskId && void retryTask(selectedTaskId)}
        disabled={!canRetry || (selectedTaskId !== null && controlPending('retry_task', selectedTaskId))}
        aria-label={t('run.retryTask')}
        title={!canRetry && selectedTaskId ? t('run.actionNotAllowed') : undefined}
      >
        <RotateCcw size={14} />{t('run.retry')}
      </button>
      <button
        type="button"
        onClick={() => selectedTaskId && void skipTask(selectedTaskId)}
        disabled={!canSkip || (selectedTaskId !== null && controlPending('skip_task', selectedTaskId))}
        aria-label={t('run.skipTask')}
        title={!canSkip && selectedTaskId ? t('run.actionNotAllowed') : undefined}
      >
        <SkipForward size={14} />{t('run.skip')}
      </button>
    </div>
  );
}
