import { Play, Wifi } from 'lucide-react';

import { hasMessage, useI18n } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import ReviewGate from '../workflow/ReviewGate';
import RunControls from './RunControls';
import { useRunEvents } from './useRunEvents';

export default function RunBar() {
  const project = useWorkspaceStore((state) => state.project);
  const workflow = useWorkspaceStore((state) => state.workflow);
  const run = useWorkspaceStore((state) => state.run);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const runProgress = useWorkspaceStore((state) => state.runProgress);
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const canExecute = useWorkspaceStore((state) => state.canExecute);
  const readiness = useWorkspaceStore((state) => state.readiness);
  const executeWorkflow = useWorkspaceStore((state) => state.executeWorkflow);
  const executing = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'execute'));
  const events = useRunEvents(run?.id ?? null);
  const online = nodes.filter((node) => node.status === 'online').length;
  const status = run?.status ?? runStatus;
  const { t, locale } = useI18n();
  const statusKey = `run.status.${status}`;
  const blockingIssue = readiness?.issues.find((issue) => issue.severity === 'blocking') ?? null;
  const executeDisabled = !canExecute || readiness?.ready === false;

  const inspectorCollapsed = useWorkspaceStore((state) => state.inspectorCollapsed);
  const setInspectorCollapsed = useWorkspaceStore((state) => state.setInspectorCollapsed);
  return (
    <header className="run-bar" aria-label={t('run.bar')}>
      <div className="run-title">
        <strong>{project?.name ?? t('run.noProject')}</strong>
        <span>{workflow ? t('run.workflowVersion', { version: workflow.version }) : t('run.notPlanned')}</span>
        <span className="status" data-status={status}>{hasMessage(locale, statusKey) ? t(statusKey) : status}</span>
        <span className="muted" data-testid="ws-connected">
          {events.connected ? t('run.liveConnected') : run ? t('run.liveReconnecting') : t('run.notRunning')}
        </span>
      </div>
      <div className="run-progress">
        <div><span>{t('run.progress')}</span><b>{runProgress}%</b></div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={runProgress}>
          <i style={{ width: `${runProgress}%` }} />
        </div>
      </div>
      <span className="node-count"><Wifi size={15} />{t('run.nodesOnline', { count: online })}</span>
      <div className="run-actions">
        {inspectorCollapsed && (
          <button
            type="button"
            aria-label={t('inspector.expand')}
            title={t('inspector.expand')}
            onClick={() => setInspectorCollapsed(false)}
          >
            {t('inspector.expand')}
          </button>
        )}
        <ReviewGate />
        <RunControls />
        {executeDisabled && blockingIssue && (
          <span className="execute-blocked-reason" role="status">{blockingIssue.title}</span>
        )}
        <button
          type="button"
          className="primary"
          onClick={() => void executeWorkflow()}
          disabled={executeDisabled || executing}
          aria-label={t('run.executeAll')}
        >
          <Play size={16} />{executing ? t('run.executing') : t('run.executeAll')}
        </button>
      </div>
    </header>
  );
}
