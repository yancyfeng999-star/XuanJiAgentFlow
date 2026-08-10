import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoordinatorClient, Project, Workflow } from '../../../lib/client';
import { setWorkspaceClient, useWorkspaceStore } from '../../../store/workspaceStore';
import WorkflowCanvas from '../WorkflowCanvas';

vi.mock('@xyflow/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...original,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlow: ({ children, edges, nodes, onEdgeContextMenu, onNodeContextMenu, onNodesChange }: {
      children?: React.ReactNode;
      edges: Array<{ id: string; source: string; target: string }>;
      nodes: Array<{ id: string; position: { x: number; y: number } }>;
      onEdgeContextMenu?: (event: React.MouseEvent, edge: { id: string; source: string; target: string }) => void;
      onNodeContextMenu?: (event: React.MouseEvent, node: { id: string }) => void;
      onNodesChange?: (changes: Array<{
        type: 'position';
        id: string;
        position: { x: number; y: number };
        dragging: boolean;
      }>) => void;
    }) => (
      <div>
        {nodes.map((node) => (
          <div key={node.id}>
            <button
              type="button"
              aria-label={`测试节点：${node.id}`}
              onContextMenu={(event) => onNodeContextMenu?.(event, node)}
            />
            <span data-testid={`节点位置：${node.id}`}>{node.position.x},{node.position.y}</span>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onNodesChange?.([{
            type: 'position',
            id: 'research',
            position: { x: 260, y: 210 },
            dragging: true,
          }])}
        >
          模拟拖动
        </button>
        {edges.map((edge) => (
          <button
            key={edge.id}
            type="button"
            aria-label={`测试连线：${edge.source}-${edge.target}`}
            onContextMenu={(event) => onEdgeContextMenu?.(event, edge)}
          />
        ))}
        {children}
      </div>
    ),
  };
});

const project: Project = {
  id: 'project-1',
  name: 'Editable project',
  root_path: '/tmp/project-1',
  active_workflow_version: 1,
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
};

const baseTask: Workflow['tasks'][number] = {
  id: 'research',
  workflow_id: 'workflow-1',
  title: 'Research',
  description: 'Read sources',
  prompt: 'Find evidence',
  agent_type: 'research',
  dependencies: [],
  execution_policy: {
    mode: 'auto',
    node_id: null,
    node_group: null,
    required_models: [],
    required_tools: [],
    required_tags: ['research'],
    timeout_seconds: 1800,
  },
  retry_policy: { max_attempts: 3, delay_seconds: 1 },
  expected_outputs: [{ path: 'research.md', media_type: null }],
  ui_position: { x: 100, y: 100 },
};

const workflow: Workflow = {
  id: 'workflow-1',
  project_id: project.id,
  version: 1,
  goal: 'Build report',
  planner_provider: null,
  planner_model: null,
  status: 'draft',
  graph_json: {},
  created_at: '2026-07-28T00:00:00Z',
  tasks: [
    baseTask,
    {
      ...baseTask,
      id: 'write',
      title: 'Write',
      dependencies: ['research'],
      ui_position: { x: 460, y: 100 },
    },
  ],
};

const updateWorkflow = vi.fn().mockImplementation(async (_id, payload) => ({ ...workflow, ...payload }));
const client = { updateWorkflow } as unknown as CoordinatorClient;

beforeEach(() => {
  vi.clearAllMocks();
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
  act(() => useWorkspaceStore.setState({ project, workflow, selectedTaskId: null }));
});

afterEach(cleanup);

describe('workflow canvas context menus', () => {
  it('previews a node position while it is being dragged', async () => {
    render(<WorkflowCanvas />);
    expect(screen.getByTestId('节点位置：research')).toHaveTextContent('100,100');

    fireEvent.click(screen.getByRole('button', { name: '模拟拖动' }));

    expect(screen.getByTestId('节点位置：research')).toHaveTextContent('260,210');
    expect(updateWorkflow).not.toHaveBeenCalled();
  });

  it('deletes a node and removes it from downstream dependencies', async () => {
    render(<WorkflowCanvas />);
    fireEvent.contextMenu(screen.getByRole('button', { name: '测试节点：research' }), {
      clientX: 240,
      clientY: 180,
    });

    expect(screen.getByRole('menu', { name: '节点操作' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: '删除节点' }));

    await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
    const update = updateWorkflow.mock.calls.at(-1)?.[1];
    expect(update.tasks.map((task: Workflow['tasks'][number]) => task.id)).toEqual(['write']);
    expect(update.tasks[0].dependencies).toEqual([]);
  });

  it('disconnects only the selected edge', async () => {
    render(<WorkflowCanvas />);
    fireEvent.contextMenu(screen.getByRole('button', { name: '测试连线：research-write' }), {
      clientX: 420,
      clientY: 220,
    });

    expect(screen.getByRole('menu', { name: '连线操作' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: '断开连线' }));

    await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
    const update = updateWorkflow.mock.calls.at(-1)?.[1];
    expect(update.tasks.find((task: Workflow['tasks'][number]) => task.id === 'write')?.dependencies).toEqual([]);
  });
});
