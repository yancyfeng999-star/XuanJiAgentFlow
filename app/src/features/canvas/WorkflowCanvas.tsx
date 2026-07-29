import { useMemo, useState } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import type { Connection, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useWorkspaceStore } from '../../store/workspaceStore';
import { nodeTypes } from './nodeTypes';
import type { WorkflowNode } from './nodeTypes';

export default function WorkflowCanvas() {
  const project = useWorkspaceStore((state) => state.project);
  const workflow = useWorkspaceStore((state) => state.workflow);
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId);
  const selectTask = useWorkspaceStore((state) => state.selectTask);
  const plan = useWorkspaceStore((state) => state.plan);
  const addTask = useWorkspaceStore((state) => state.addTask);
  const connectTasks = useWorkspaceStore((state) => state.connectTasks);
  const disconnectTaskEdges = useWorkspaceStore((state) => state.disconnectTaskEdges);
  const [goal, setGoal] = useState('');

  const nodes = useMemo<WorkflowNode[]>(() => (workflow?.tasks ?? []).map((task) => ({
    id: task.id,
    type: 'task',
    position: task.ui_position,
    data: { ...task },
    selected: task.id === selectedTaskId,
  })), [selectedTaskId, workflow]);
  const edges = useMemo<Edge[]>(() => (workflow?.tasks ?? []).flatMap((task) => task.dependencies.map((source) => ({
    id: `${source}-${task.id}`,
    source,
    target: task.id,
    animated: true,
  }))), [workflow]);

  const connect = (connection: Connection) => {
    if (connection.source && connection.target) void connectTasks(connection.source, connection.target);
  };

  if (!workflow) {
    return <main className="workflow-canvas canvas-empty" aria-label="工作流画布">
      <form onSubmit={(event) => { event.preventDefault(); if (goal.trim()) void plan({ goal: goal.trim() }); }}>
        <h1>{project ? '规划第一个工作流' : '选择或创建项目'}</h1>
        <p>{project ? '输入目标，Planner 将生成可编辑 DAG。' : '项目快照来自 Coordinator，不使用本地演示数据。'}</p>
        {project && <><label htmlFor="workflow-goal">项目目标</label><textarea id="workflow-goal" value={goal} onChange={(event) => setGoal(event.target.value)} /><button type="submit" className="form-primary">生成规划</button></>}
      </form>
    </main>;
  }

  return <main className="workflow-canvas" aria-label="工作流画布">
    {workflow.status === 'draft' && <button type="button" className="canvas-add-task" onClick={() => void addTask()}>新增任务</button>}
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onConnect={connect}
      onEdgesDelete={(deleted) => void disconnectTaskEdges(deleted.map(({ source, target }) => ({ source, target })))}
      onPaneClick={() => selectTask(null)}
      nodesConnectable={workflow.status === 'draft'}
      edgesReconnectable={false}
      elementsSelectable
      fitView
      minZoom={0.25}
      maxZoom={2}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  </main>;
}
