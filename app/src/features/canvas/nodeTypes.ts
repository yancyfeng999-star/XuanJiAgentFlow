import type { Node, NodeTypes } from '@xyflow/react';
import type { WorkflowTask } from '../../domain/types';
import { TaskNode } from './nodes/TaskNode';
export type WorkflowNode = Node<WorkflowTask, 'task'>;
export const nodeTypes: NodeTypes = { task: TaskNode };
