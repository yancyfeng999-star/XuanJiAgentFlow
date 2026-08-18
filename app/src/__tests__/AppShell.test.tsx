import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AppShell from '../app/AppShell';
import type { CoordinatorClient, Project, Workflow } from '../lib/client';
import { applyTheme, initTheme, setThemePreference } from '../lib/theme';
import { setWorkspaceClient, useWorkspaceStore } from '../store/workspaceStore';

const waitForHealthyRuntime = vi.fn();
vi.mock('../lib/runtime', async () => {
  const actual = await vi.importActual<typeof import('../lib/runtime')>('../lib/runtime');
  return {
    ...actual,
    waitForHealthyRuntime: (...args: unknown[]) => waitForHealthyRuntime(...args),
  };
});

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
    writes: [], done_definition: [], verify: [], run_gate: 'auto',
    ui_position: { x: 100, y: 100 },
  }],
};

const client = {
  listProjects: vi.fn().mockResolvedValue([project]),
  getProject: vi.fn().mockResolvedValue(project),
  getProjectWorkflow: vi.fn().mockResolvedValue(workflow),
  listProjectRuns: vi.fn().mockResolvedValue({ runs: [], next_cursor: null }),
  listNodes: vi.fn().mockResolvedValue([]),
  listThinkingModels: vi.fn().mockResolvedValue({ items: [] }),
  getReadiness: vi.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-08-19T00:00:00Z',
    projectId: project.id,
    workflowId: workflow.id,
    checks: {},
    issues: [],
  }),
} as unknown as CoordinatorClient;

beforeEach(() => {
  vi.clearAllMocks();
  waitForHealthyRuntime.mockResolvedValue({
    status: 'healthy',
    baseUrl: 'http://127.0.0.1:8000',
    port: 8000,
    dataDir: null,
    pid: null,
    sessionToken: null,
    error: null,
  });
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
});

afterEach(cleanup);

async function renderReadyShell() {
  render(<AppShell />);
  await waitFor(() => {
    expect(screen.getByRole('navigation', { name: '工作区导航' })).toBeInTheDocument();
  });
}

describe('Xuanji 2.0 workspace shell', () => {
  it('renders workspace chrome while the coordinator is still connecting', () => {
    waitForHealthyRuntime.mockReturnValue(new Promise(() => {}));
    render(<AppShell />);
    expect(screen.getByRole('navigation', { name: '工作区导航' })).toBeVisible();
    expect(screen.getByRole('banner', { name: '顶部运行栏' })).toBeVisible();
    expect(screen.getByTestId('workspace-canvas-skeleton')).toBeVisible();
    expect(screen.queryByRole('complementary', { name: '节点检查器' })).not.toBeInTheDocument();
  });

  it('renders nav, run bar and canvas after coordinator is healthy without an empty inspector', async () => {
    await renderReadyShell();

    expect(screen.getByRole('navigation', { name: '工作区导航' })).toBeInTheDocument();
    expect(screen.getByRole('banner', { name: '顶部运行栏' })).toBeInTheDocument();
    expect(await screen.findByRole('main', { name: '工作流画布' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '节点检查器' })).not.toBeInTheDocument();
    expect(screen.queryByText('传统流程')).not.toBeInTheDocument();
  });

  it('does not reserve inspector width without task or run context', async () => {
    await renderReadyShell();
    expect(screen.queryByRole('complementary', { name: '节点检查器' })).not.toBeInTheDocument();
  });

  it('opens the inspector after a task is selected', async () => {
    await renderReadyShell();
    await waitFor(() => expect(client.getProjectWorkflow).toHaveBeenCalled());
    act(() => useWorkspaceStore.getState().selectTask('server-task'));
    expect(await screen.findByRole('heading', { name: '服务端任务定义' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭检查器' })).toBeInTheDocument();
  });

  it('shows a selected task from the server workflow snapshot in the inspector', async () => {
    await renderReadyShell();
    await waitFor(() => expect(client.getProjectWorkflow).toHaveBeenCalled());

    act(() => useWorkspaceStore.getState().selectTask('server-task'));

    expect(await screen.findByRole('heading', { name: '服务端任务定义' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务指令')).toHaveValue('只使用服务端返回的任务 Prompt。');
  });

  it('shows run status and progress from the unified workspace store', async () => {
    await renderReadyShell();

    act(() => {
      useWorkspaceStore.setState({
        run: {
          id: 'run-shell',
          workflow_id: workflow.id,
          status: 'running',
          started_at: '2026-08-19T00:00:00Z',
          completed_at: null,
          created_at: '2026-08-19T00:00:00Z',
          attempts: [],
          allowed_actions: ['pause', 'cancel'],
        },
      });
      useWorkspaceStore.getState().setRunStatus('running');
      useWorkspaceStore.getState().setRunProgress(42);
    });

    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('maps light, dark, and system theme onto document data-theme', async () => {
    await renderReadyShell();
    expect(setThemePreference('light')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(setThemePreference('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    const media = {
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    };
    window.matchMedia = vi.fn().mockReturnValue(media) as unknown as typeof window.matchMedia;
    expect(applyTheme('system')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows OS color scheme changes while preference is system', async () => {
    await renderReadyShell();
    const listeners: Array<(event: MediaQueryListEvent) => void> = [];
    const media = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.push(listener);
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    };
    window.matchMedia = vi.fn().mockReturnValue(media) as unknown as typeof window.matchMedia;
    setThemePreference('system');
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    media.matches = true;
    act(() => {
      listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
