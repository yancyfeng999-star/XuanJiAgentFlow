import { useState } from 'react';
import { MoreHorizontal, Pause, Play } from 'lucide-react';

import { hasMessage, useI18n } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import ReviewWorkspace from '../workflow/ReviewWorkspace';
import { deriveRunBarModel, type RunPrimaryAction } from './runBarModel';
import { useRunEvents } from './useRunEvents';

export default function RunBar({
  phase,
  onResolve,
}: {
  phase?: string;
  onResolve?: () => void;
}) {
  const project = useWorkspaceStore((state) => state.project);
  const workflow = useWorkspaceStore((state) => state.workflow);
  const run = useWorkspaceStore((state) => state.run);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const runProgress = useWorkspaceStore((state) => state.runProgress);
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const nodesPhase = useWorkspaceStore((state) => state.nodesPhase);
  const readiness = useWorkspaceStore((state) => state.readiness);
  const executeWorkflow = useWorkspaceStore((state) => state.executeWorkflow);
  const pauseRun = useWorkspaceStore((state) => state.pauseRun);
  const resumeRun = useWorkspaceStore((state) => state.resumeRun);
  const cancelRun = useWorkspaceStore((state) => state.cancelRun);
  const createRevision = useWorkspaceStore((state) => state.createRevision);
  const openRunInspector = useWorkspaceStore((state) => state.openRunInspector);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const executing = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'execute'));
  const [reviewOpen, setReviewOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const { t, locale } = useI18n();
  useRunEvents(run?.id ?? null);

  const model = deriveRunBarModel({
    project,
    workflow,
    run,
    runStatus,
    runProgress,
    readiness,
    nodesPhase,
    onlineNodeCount: nodes.filter((node) => node.status === 'online').length,
  });

  const runPrimary = (action: RunPrimaryAction) => {
    switch (action.kind) {
      case 'open_project':
        setActivePanel('projects');
        break;
      case 'plan':
        document.getElementById('workflow-goal')?.focus();
        break;
      case 'review':
        setReviewOpen(true);
        break;
      case 'resolve':
        onResolve?.();
        break;
      case 'execute':
        void executeWorkflow();
        break;
      case 'pause':
        void pauseRun();
        break;
      case 'resume':
        void resumeRun();
        break;
      case 'view_result':
        openRunInspector();
        break;
    }
  };

  const primaryLabel = (() => {
    switch (model.primaryAction.kind) {
      case 'open_project': return t('run.openProject');
      case 'plan': return t('canvas.plan');
      case 'review': return t('review.action');
      case 'resolve': return t('run.resolveBlockers');
      case 'execute': return executing ? t('run.executing') : t('run.executeAll');
      case 'pause': return t('run.pause');
      case 'resume': return t('run.resume');
      case 'view_result': return t('run.viewResult');
    }
  })();

  const statusText = hasMessage(locale, model.statusKey) ? t(model.statusKey) : model.statusLabel;

  return (
    <header className="run-bar" aria-label={t('run.bar')}>
      <div className="run-context">
        <strong title={model.contextLabel ?? t('run.noProject')}>
          {model.contextLabel ?? t('run.noProject')}
        </strong>
        <span>{workflow ? t('run.workflowVersion', { version: workflow.version }) : t('run.notPlanned')}</span>
        {model.pathUnavailable && (
          <button type="button" className="run-path-unavailable" onClick={() => setActivePanel('projects')}>
            {t('run.pathUnavailable')}
          </button>
        )}
      </div>
      <span className="status" data-status={model.statusLabel}>{statusText}</span>
      {workflow?.status === 'reviewed' && (
        <span className="review-state reviewed">{t('review.frozen')}</span>
      )}
      {model.showProgress && (
        <div className="run-progress">
          <div><span>{t('run.progress')}</span><b>{model.runProgress}%</b></div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={model.runProgress}>
            <i style={{ width: `${model.runProgress}%` }} />
          </div>
        </div>
      )}
      <span className="node-count" data-loading={model.nodeSummary.kind === 'loading' || undefined}>
        {model.nodeSummary.kind === 'loading'
          ? t('run.nodesLoading')
          : t('run.nodesOnline', { count: model.nodeSummary.online })}
      </span>
      <div className="run-actions">
        <button
          type="button"
          className="primary run-primary-action"
          onClick={() => runPrimary(model.primaryAction)}
          disabled={'disabled' in model.primaryAction ? model.primaryAction.disabled : false}
          aria-label={primaryLabel}
        >
          {model.primaryAction.kind === 'execute' || model.primaryAction.kind === 'resume' ? <Play size={16} /> : null}
          {model.primaryAction.kind === 'pause' ? <Pause size={16} /> : null}
          {primaryLabel}
        </button>
        <div className="run-overflow">
          <button
            type="button"
            aria-label={t('run.moreActions')}
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen((open) => !open)}
          >
            <MoreHorizontal size={16} />
          </button>
          {overflowOpen && (
            <div className="run-overflow-menu" role="menu">
              {model.overflowActions.includes('run_details') && (
                <button type="button" role="menuitem" onClick={() => { openRunInspector(); setOverflowOpen(false); }}>
                  {t('run.openDetails')}
                </button>
              )}
              {model.overflowActions.includes('cancel') && (
                <button type="button" role="menuitem" onClick={() => { void cancelRun(); setOverflowOpen(false); }}>
                  {t('run.cancel')}
                </button>
              )}
              {model.overflowActions.includes('revision') && (
                <button type="button" role="menuitem" onClick={() => { void createRevision(); setOverflowOpen(false); }}>
                  {t('review.createRevision')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {reviewOpen && <ReviewWorkspace onClose={() => setReviewOpen(false)} />}
      {phase ? <span className="visually-hidden">{phase}</span> : null}
    </header>
  );
}
