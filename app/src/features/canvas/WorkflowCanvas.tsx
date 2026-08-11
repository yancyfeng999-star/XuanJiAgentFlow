import { useEffect, useMemo, useState } from 'react';
import { Trash2, Unlink } from 'lucide-react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useNodesState } from '@xyflow/react';
import type { Connection, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { hasMessage, useI18n } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { nodeTypes } from './nodeTypes';
import type { WorkflowNode } from './nodeTypes';

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
  const { t, locale } = useI18n();
  const directionText = (direction: string) => {
    const key = `direction.${direction}`;
    return hasMessage(locale, key) ? t(key) : t('direction.unknown');
  };

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
      ariaLabel: t('canvas.edgeAria', { source: titles.get(source) ?? source, target: task.title }),
    })));
  }, [t, workflow]);

  const connect = (connection: Connection) => {
    if (connection.source && connection.target) void connectTasks(connection.source, connection.target);
  };

  const menuPosition = (clientX: number, clientY: number) => ({
    x: Math.max(8, Math.min(Number.isFinite(clientX) ? clientX : window.innerWidth / 2, window.innerWidth - 176)),
    y: Math.max(8, Math.min(Number.isFinite(clientY) ? clientY : window.innerHeight / 2, window.innerHeight - 64)),
  });

  if (!workflow) {
    return <main className="workflow-canvas canvas-empty" aria-label={t('canvas.aria')}>
      <form onSubmit={(event) => { event.preventDefault(); if (goal.trim()) void plan({ goal: goal.trim() }); }}>
        <h1>{project ? t('canvas.empty.title') : t('canvas.empty.noProject')}</h1>
        <p>{project ? t('canvas.empty.hint') : t('canvas.empty.noProjectHint')}</p>
        {project && <><label htmlFor="workflow-goal">{t('canvas.goal')}</label><textarea id="workflow-goal" value={goal} onChange={(event) => setGoal(event.target.value)} /><button type="submit" className="form-primary">{t('canvas.plan')}</button></>}
      </form>
    </main>;
  }

  return <main className="workflow-canvas" aria-label={t('canvas.aria')}>
    {workflow.status === 'draft' && <button type="button" className="canvas-add-task" onClick={() => void addTask()}>{t('canvas.addTask')}</button>}
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
        'node.a11yDescription.default': t('canvas.a11y.nodeDefault'),
        'node.a11yDescription.keyboardDisabled': t('canvas.a11y.nodeKeyboardDisabled'),
        'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => t('canvas.a11y.nodeMoved', { direction: directionText(direction), x, y }),
        'edge.a11yDescription.default': t('canvas.a11y.edgeDefault'),
        'controls.ariaLabel': t('canvas.a11y.controls'),
        'controls.zoomIn.ariaLabel': t('canvas.a11y.zoomIn'),
        'controls.zoomOut.ariaLabel': t('canvas.a11y.zoomOut'),
        'controls.fitView.ariaLabel': t('canvas.a11y.fitView'),
        'controls.interactive.ariaLabel': t('canvas.a11y.interactive'),
        'minimap.ariaLabel': t('canvas.a11y.minimap'),
        'handle.ariaLabel': t('canvas.a11y.handle'),
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
        aria-label={menu.kind === 'node' ? t('canvas.menu.node') : t('canvas.menu.edge')}
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
            {t('canvas.menu.deleteNode')}
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
            {t('canvas.menu.disconnect')}
          </button>
        )}
      </div>
    )}
  </main>;
}
