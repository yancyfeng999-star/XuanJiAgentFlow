import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

import { hasMessage, useI18n } from '../../../lib/i18n';
import { useLabels } from '../../../lib/labels';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import type { WorkflowNode } from '../nodeTypes';

function TaskNodeComponent({ data, selected }: NodeProps<WorkflowNode>) {
  const selectTask = useWorkspaceStore((state) => state.selectTask);
  const attempt = useWorkspaceStore((state) => state.taskAttempts[data.id]);
  const status = attempt?.status ?? 'pending';
  const { t, locale } = useI18n();
  const { agentTypeLabel, schedulingModeLabel } = useLabels();
  const statusKey = `taskStatus.${status}`;
  return <button type="button" className={`task-node ${selected ? 'is-selected' : ''}`} data-status={status} aria-label={t('task.select', { title: data.title })} onClick={() => selectTask(data.id)}>
    <Handle type="target" position={Position.Left} />
    <div className="task-node__head"><strong>{data.title}</strong><span>{agentTypeLabel(data.agent_type)}</span></div>
    <p>{data.description}</p>
    <div className="task-node__meta">
      <span data-status={status}>{hasMessage(locale, statusKey) ? t(statusKey) : status}</span>
      <span>{attempt?.node_id ? t('task.node', { id: attempt.node_id }) : schedulingModeLabel(data.execution_policy.mode)}</span>
    </div>
    <div className="task-node__files">
      {t('task.io', { inputs: data.dependencies.length, outputs: data.expected_outputs.length })}
      {attempt ? t('task.attemptSuffix', { attempt: attempt.attempt }) : ''}
    </div>
    <Handle type="source" position={Position.Right} />
  </button>;
}

export const TaskNode = memo(TaskNodeComponent);
