import { Bot, Clock3, FileOutput, RotateCcw, Server } from 'lucide-react';

import ArtifactBrowser from '../artifacts/ArtifactBrowser';
import RunHistory from '../runs/RunHistory';
import TaskLog from '../runs/TaskLog';
import { useI18n } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import { useWorkspaceStore } from '../../store/workspaceStore';
import TaskEditor from './TaskEditor';

export default function Inspector() {
  const task = useWorkspaceStore((state) => state.workflow?.tasks.find((item) => item.id === state.selectedTaskId));
  const run = useWorkspaceStore((state) => state.run);
  const attempt = useWorkspaceStore((state) => (
    state.selectedTaskId ? state.taskAttempts[state.selectedTaskId] ?? null : null
  ));
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const { t } = useI18n();
  const { agentTypeLabel, schedulingModeLabel, statusLabel } = useLabels();
  const nodeName = attempt?.node_id
    ? nodes.find((node) => node.id === attempt.node_id)?.name ?? attempt.node_id
    : t('inspector.unassigned');

  const setInspectorCollapsed = useWorkspaceStore((state) => state.setInspectorCollapsed);
  return (
    <aside className="inspector" aria-label={t('inspector.title')}>
      <button
        type="button"
        className="inspector-collapse"
        aria-label={t('inspector.collapse')}
        title={t('inspector.collapse')}
        onClick={() => setInspectorCollapsed(true)}
      >
        ×
      </button>
      {!task ? (
        <div className="inspector-empty">
          <Bot size={28} />
          <h2>{t('inspector.title')}</h2>
          <p>{t('inspector.empty')}</p>
          <RunHistory />
        </div>
      ) : (
        <>
          <div className="inspector-head">
            <span>{agentTypeLabel(task.agent_type)}</span>
            <h2>{task.title}</h2>
            <p>{task.description}</p>
          </div>
          <TaskEditor task={task} />
          <section className="detail-grid">
            <div><Bot size={15} /><span>{t('inspector.field.agentType')}</span><b>{agentTypeLabel(task.agent_type)}</b></div>
            <div><Clock3 size={15} /><span>{t('inspector.field.timeout')}</span><b>{t('inspector.seconds', { value: task.execution_policy.timeout_seconds })}</b></div>
            <div><RotateCcw size={15} /><span>{t('inspector.field.maxAttempts')}</span><b>{task.retry_policy.max_attempts}</b></div>
            <div><FileOutput size={15} /><span>{t('inspector.field.outputs')}</span><b>{task.expected_outputs.length}</b></div>
          </section>
          <section>
            <label>{t('inspector.constraints')}</label>
            <p className="constraint">
              {schedulingModeLabel(task.execution_policy.mode)} · {task.execution_policy.required_tags.join('、') || t('inspector.noTags')}
            </p>
          </section>
          {run && (
            <section className="execution-panel" aria-label={t('inspector.execution')}>
              <label>{t('inspector.executionStatus')}</label>
              <div className="execution-meta">
                <div><Server size={14} /><span>{t('inspector.execNode')}</span><b>{nodeName}</b></div>
                <div><RotateCcw size={14} /><span>{t('inspector.attempts')}</span><b>{attempt?.attempt ?? t('inspector.notExecuted')}</b></div>
                <div><span>{t('inspector.status')}</span><b>{statusLabel(attempt?.status)}</b></div>
              </div>
              {attempt?.error && (
                <div className="inline-error" role="alert">
                  <strong>{t('inspector.taskFailed')}</strong>
                  <span>
                    {typeof attempt.error.message === 'string' && /[一-鿿]/.test(attempt.error.message)
                      ? attempt.error.message
                      : t('inspector.nodeError')}
                  </span>
                </div>
              )}
              <TaskLog runId={run.id} taskId={task.id} />
              <ArtifactBrowser runId={run.id} taskId={task.id} />
            </section>
          )}
        </>
      )}
    </aside>
  );
}
