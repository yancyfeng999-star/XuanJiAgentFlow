import type { Edge } from '@xyflow/react';

import type { TaskAttempt, WorkflowTask } from '../../lib/client';
import type { TaskNodeData, WorkflowNode } from './nodeTypes';

export const DEFAULT_VIEW = {
  minZoom: 0.55,
  maxZoom: 1.25,
  fitMinZoom: 0.62,
  fitMaxZoom: 1,
} as const;

const ACTIVE_EDGE_STATUSES = new Set(['dispatching', 'running', 'collecting']);

export function buildWorkflowNodes(
  tasks: WorkflowTask[],
  selectedTaskId: string | null,
  currentNodes: WorkflowNode[],
): WorkflowNode[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  return tasks.map((task) => {
    const current = currentById.get(task.id);
    return {
      id: task.id,
      type: 'task',
      position: current?.position ?? task.ui_position,
      data: (current && current.data === task ? current.data : task) as TaskNodeData,
      selected: task.id === selectedTaskId,
      dragging: current?.dragging,
    };
  });
}

export function buildWorkflowEdges(
  tasks: WorkflowTask[],
  attempts: Record<string, Pick<TaskAttempt, 'status'> | undefined>,
  t: (key: string, vars?: Record<string, string | number>) => string,
  reducedMotion = false,
): Edge[] {
  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  return tasks.flatMap((task) => task.dependencies.map((source) => {
    const sourceActive = ACTIVE_EDGE_STATUSES.has(attempts[source]?.status ?? '');
    const targetActive = ACTIVE_EDGE_STATUSES.has(attempts[task.id]?.status ?? '');
    return {
      id: `${source}-${task.id}`,
      source,
      target: task.id,
      animated: !reducedMotion && (sourceActive || targetActive),
      ariaLabel: t('canvas.edgeAria', { source: titles.get(source) ?? source, target: task.title }),
    };
  }));
}
