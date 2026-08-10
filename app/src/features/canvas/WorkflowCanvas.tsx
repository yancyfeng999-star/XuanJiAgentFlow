import { useEffect, useMemo, useState } from 'react';
import { Trash2, Unlink } from 'lucide-react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useNodesState } from '@xyflow/react';
import type { Connection, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useWorkspaceStore } from '../../store/workspaceStore';
import { nodeTypes } from './nodeTypes';
import type { WorkflowNode } from './nodeTypes';

const directionLabels: Record<string, string> = {
  down: '下',
  left: '左',
  right: '右',
  up: '上',
};

type CanvasMenu =
  | { kind: 'node'; nodeId: string; x: number; y: number }
  | { kind: 'edge'; source: string; target: string; x: number; y: number };

export default function WorkflowCanvas() {
  const project = useWorkspaceStore((state) => state.project);
  const workflow = useWorkspaceStore((state) => state.workflow);
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId);
  const selectTask = useWorkspaceStore((state) => state.selectTask);
  const plan = useWorkspaceStore((state) => state.plan);
  const addTask = useWorkspaceStore((state) => state.addTask);
  const removeTask = useWorkspaceStore((state) => state.removeTask);
  const updateTask = useWorkspaceStore((state) => state.updateTask);
  const connectTasks = useWorkspaceStore((state) => state.connectTasks);
  const disconnectTaskEdges = useWorkspaceStore((state) => state.disconnectTaskEdges);
  const [goal, setGoal] = useState('');
  const [menu, setMenu] = useState<CanvasMenu | null>(null);

  useEffect(() => {
    if (!menu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menu]);

  const workflowNodes = useMemo<WorkflowNode[]>(() => (workflow?.tasks ?? []).map((task) => ({
    id: task.id,
    type: 'task',
    position: task.ui_position,
    data: { ...task },
    selected: task.id === selectedTaskId,
  })), [selectedTaskId, workflow]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(workflowNodes);

  useEffect(() => {
    setNodes((current) => workflowNodes.map((nextNode) => {
      const currentNode = current.find((node) => node.id === nextNode.id);
      return currentNode?.dragging
        ? { ...nextNode, position: currentNode.position, dragging: true }
        : nextNode;
    }));
  }, [setNodes, workflowNodes]);

  const edges = useMemo<Edge[]>(() => {
    const tasks = workflow?.tasks ?? [];
    const titles = new Map(tasks.map((task) => [task.id, task.title]));
    return tasks.flatMap((task) => task.dependencies.map((source) => ({
      id: `${source}-${task.id}`,
      source,
      target: task.id,
      animated: true,
      ariaLabel: `从“${titles.get(source) ?? source}”到“${task.title}”的任务连线`,
    })));
  }, [workflow]);

  const connect = (connection: Connection) => {
    if (connection.source && connection.target) void connectTasks(connection.source, connection.target);
  };

  const menuPosition = (clientX: number, clientY: number) => ({
    x: Math.max(8, Math.min(Number.isFinite(clientX) ? clientX : window.innerWidth / 2, window.innerWidth - 176)),
    y: Math.max(8, Math.min(Number.isFinite(clientY) ? clientY : window.innerHeight / 2, window.innerHeight - 64)),
  });

  if (!workflow) {
    return <main className="workflow-canvas canvas-empty" aria-label="工作流画布">
      <form onSubmit={(event) => { event.preventDefault(); if (goal.trim()) void plan({ goal: goal.trim() }); }}>
        <h1>{project ? '规划第一个工作流' : '选择或创建项目'}</h1>
        <p>{project ? '输入目标，规划器将生成可编辑的任务流程图。' : '项目数据来自协调器，不使用本地演示数据。'}</p>
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
      onNodesChange={onNodesChange}
      onConnect={connect}
      onEdgesDelete={(deleted) => void disconnectTaskEdges(deleted.map(({ source, target }) => ({ source, target })))}
      onNodeContextMenu={(event, node) => {
        event.preventDefault();
        if (workflow.status !== 'draft') return;
        selectTask(node.id);
        setMenu({ kind: 'node', nodeId: node.id, ...menuPosition(event.clientX, event.clientY) });
      }}
      onEdgeContextMenu={(event, edge) => {
        event.preventDefault();
        if (workflow.status !== 'draft') return;
        setMenu({
          kind: 'edge',
          source: edge.source,
          target: edge.target,
          ...menuPosition(event.clientX, event.clientY),
        });
      }}
      onPaneClick={() => {
        setMenu(null);
        selectTask(null);
      }}
      onMoveStart={() => setMenu(null)}
      onNodeDragStop={(_, node) => {
        if (workflow.status === 'draft') void updateTask(node.id, { ui_position: node.position });
      }}
      nodesConnectable={workflow.status === 'draft'}
      nodesDraggable={workflow.status === 'draft'}
      edgesReconnectable={false}
      elementsSelectable
      fitView
      minZoom={0.25}
      maxZoom={2}
      ariaLabelConfig={{
        'node.a11yDescription.default': '按回车键或空格键选择任务节点，按删除键移除，按退出键取消。',
        'node.a11yDescription.keyboardDisabled': '按回车键或空格键选择任务节点，然后使用方向键移动，按删除键移除，按退出键取消。',
        'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `已向${directionLabels[direction] ?? '指定方向'}移动所选任务节点。新位置：横坐标 ${x}，纵坐标 ${y}`,
        'edge.a11yDescription.default': '按回车键或空格键选择连接线，按删除键移除，按退出键取消。',
        'controls.ariaLabel': '画布控制',
        'controls.zoomIn.ariaLabel': '放大',
        'controls.zoomOut.ariaLabel': '缩小',
        'controls.fitView.ariaLabel': '适应画布',
        'controls.interactive.ariaLabel': '切换交互模式',
        'minimap.ariaLabel': '任务缩略图',
        'handle.ariaLabel': '任务连接点',
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
    {menu && (
      <div
        className="canvas-context-menu"
        role="menu"
        aria-label={menu.kind === 'node' ? '节点操作' : '连线操作'}
        style={{ left: menu.x, top: menu.y }}
      >
        {menu.kind === 'node' ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const nodeId = menu.nodeId;
              setMenu(null);
              void removeTask(nodeId);
            }}
          >
            <Trash2 size={15} />
            删除节点
          </button>
        ) : (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const edge = { source: menu.source, target: menu.target };
              setMenu(null);
              void disconnectTaskEdges([edge]);
            }}
          >
            <Unlink size={15} />
            断开连线
          </button>
        )}
      </div>
    )}
  </main>;
}
