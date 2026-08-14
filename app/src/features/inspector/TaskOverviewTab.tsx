import type { HermesNode, WorkflowTask } from '../../lib/client';
import { useT } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import type { TaskDraft } from './taskDraft';

export default function TaskOverviewTab({
  task,
  draft,
  nodes,
  onGoNodes,
}: {
  task: WorkflowTask;
  draft: TaskDraft;
  nodes: HermesNode[];
  onGoNodes: () => void;
}) {
  const t = useT();
  const { agentTypeLabel } = useLabels();
  const matching = nodes.filter((node) => node.status === 'online').length;
  return (
    <div className="inspector-tab-panel">
      <p><strong>{draft.title}</strong></p>
      <p>{agentTypeLabel(draft.agent_type)}</p>
      <p>{draft.description}</p>
      <p>{t('inspector.depsCount', { count: draft.dependencies.length })}</p>
      <p>{t('task.io', { inputs: task.dependencies.length, outputs: draft.expected_outputs.length })}</p>
      <p>{t('inspector.matchingNodes', { count: matching })}</p>
      {matching === 0 && (
        <button type="button" onClick={onGoNodes}>{t('inspector.goNodes')}</button>
      )}
    </div>
  );
}
