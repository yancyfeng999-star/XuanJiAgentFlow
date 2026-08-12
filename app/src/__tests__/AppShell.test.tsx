import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AppShell from '../app/AppShell';
import type { CoordinatorClient, Project, Workflow } from '../lib/client';
import { setWorkspaceClient, useWorkspaceStore } from '../store/workspaceStore';

const project: Project = {
  id: 'project-shell',
  name: '服务端项目快照',
  root_path: '/tmp/project-shell',
  active_workflow_version: 1,
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
};

const workflow: Workflow = {
  id: 'workflow-shell',
  project_id: project.id,
  version: 1,
  goal: '验证工作区快照',
  planner_provider: null,
  planner_model: null,
  status: 'draft',
  graph_json: {},
  reviewed_at: null, reviewed_by: null, review_snapshot_hash: null, review_warnings: [],
  created_at: '2026-07-28T00:00:00Z',
  tasks: [{
    id: 'server-task',
    workflow_id: 'workflow-shell',
    title: '服务端任务定义',
    description: '来自 Coordinator',
    prompt: '只使用服务端返回的任务 Prompt。',
    agent_type: 'research',
    dependencies: [],
    execution_policy: {
      mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [],
      required_tags: [], timeout_seconds: 1800,
    },
    retry_policy: { max_attempts: 3, delay_seconds: 1 },
    expected_outputs: [],
    ui_position: { x: 100, y: 100 },
  }],
};

const client = {
  listProjects: vi.fn().mockResolvedValue([project]),
  getProject: vi.fn().mockResolvedValue(project),
  getProjectWorkflow: vi.fn().mockResolvedValue(workflow),
  listProjectRuns: vi.fn().mockResolvedValue({ runs: [], next_cursor: null }),
} as unknown as CoordinatorClient;

beforeEach(() => {
  vi.clearAllMocks();
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
});

afterEach(cleanup);

async function renderReadyShell() {
  render(<AppShell />);
  await waitFor(() => {
    expect(screen.getByRole('navigation', { name: '项目资源栏' })).toBeInTheDocument();
  });
}

describe('Xuanji 2.0 workspace shell', () => {
  it('renders exactly the four core workspace regions after coordinator is healthy', async () => {
    await renderReadyShell();

    expect(screen.getByRole('banner', { name: '顶部运行栏' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: '工作流画布' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '节点检查器' })).toBeInTheDocument();
    expect(screen.queryByText('传统流程')).not.toBeInTheDocument();
  });

  it('shows a selected task from the server workflow snapshot in the inspector', async () => {
    await renderReadyShell();
    await waitFor(() => expect(client.getProjectWorkflow).toHaveBeenCalledWith(project.id));

    act(() => useWorkspaceStore.getState().selectTask('server-task'));

    expect(screen.getByRole('heading', { name: '服务端任务定义' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务指令')).toHaveValue('只使用服务端返回的任务 Prompt。');
  });

  it('shows run status and progress from the unified workspace store', async () => {
    await renderReadyShell();

    act(() => {
      useWorkspaceStore.getState().setRunStatus('running');
      useWorkspaceStore.getState().setRunProgress(42);
    });

    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });
});
