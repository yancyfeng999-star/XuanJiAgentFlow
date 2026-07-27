import { useMemo } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { nodeTypes } from './nodeTypes';
import type { WorkflowNode } from './nodeTypes';
export default function WorkflowCanvas() {
  const tasks = useWorkspaceStore((state) => state.workflow.tasks); const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId); const selectTask = useWorkspaceStore((state) => state.selectTask);
  const nodes = useMemo<WorkflowNode[]>(() => tasks.map((task) => ({ id: task.id, type: 'task', position: task.uiPosition, data: task, selected: task.id === selectedTaskId })), [tasks, selectedTaskId]);
  const edges = useMemo<Edge[]>(() => tasks.flatMap((task) => task.dependencies.map((source) => ({ id: `${source}-${task.id}`, source, target: task.id, animated: true }))), [tasks]);
  return <main className="workflow-canvas" aria-label="工作流画布"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onPaneClick={() => selectTask(null)} fitView minZoom={0.25} maxZoom={2}><Background variant={BackgroundVariant.Dots} gap={24} size={1.5}/><Controls/><MiniMap pannable zoomable/></ReactFlow></main>;
}
