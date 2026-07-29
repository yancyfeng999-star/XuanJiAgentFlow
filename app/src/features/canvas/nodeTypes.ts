import type { Node, NodeTypes } from '@xyflow/react';

import type { WorkflowTask } from '../../lib/client';
import { TaskNode } from './nodes/TaskNode';

export type TaskNodeData = WorkflowTask & Record<string, unknown>;
export type WorkflowNode = Node<TaskNodeData, 'task'>;
export const nodeTypes: NodeTypes = { task: TaskNode };
