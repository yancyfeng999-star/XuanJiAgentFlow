import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ArtifactBrowser from '../../artifacts/ArtifactBrowser';
import type {
  Artifact,
  CoordinatorClient,
  Project,
  Run,
  TaskAttempt,
  Workflow,
} from '../../../lib/client';
import { CoordinatorError } from '../../../lib/client';
import I18nProvider from '../../../lib/I18nProvider';
import { setWorkspaceClient, useWorkspaceStore } from '../../../store/workspaceStore';
import RunBar from '../RunBar';
import RunControls from '../RunControls';
import TaskLog from '../TaskLog';
import {
  applyRunEvent,
  createInitialRunEventState,
  type RunEvent,
  type RunEventState,
} from '../runEventState';
import { useRunEvents } from '../useRunEvents';

const project: Project = {
  id: 'project-1',
  name: 'Monitor project',
  root_path: '/tmp/project-1',
  active_workflow_version: 1,
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
};

const workflow: Workflow = {
  id: 'workflow-1',
  project_id: 'project-1',
  version: 1,
  goal: 'Monitor run',
  planner_provider: null,
  planner_model: null,
  status: 'reviewed',
  graph_json: {},
  reviewed_at: null, reviewed_by: null, review_snapshot_hash: null, review_warnings: [],
  created_at: '2026-07-28T00:00:00Z',
  tasks: [{
    id: 'research',
    workflow_id: 'workflow-1',
    title: 'Research',
    description: 'Collect facts',
    prompt: 'Research the topic',
    agent_type: 'research',
    dependencies: [],
    execution_policy: {
      mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [],
      required_tags: [], timeout_seconds: 1800,
    },
    retry_policy: { max_attempts: 3, delay_seconds: 1 },
    expected_outputs: [{ path: 'research.md', media_type: 'text/markdown' }], writes: [], done_definition: [], verify: [], run_gate: 'auto',
    ui_position: { x: 100, y: 100 },
  }],
};

const attempt: TaskAttempt = {
  id: 'attempt-1',
  run_id: 'run-1',
  task_id: 'research',
  node_id: 'node-local',
  attempt: 1,
  status: 'running',
  started_at: '2026-07-28T00:01:00Z',
  completed_at: null,
  error: null,
  result_manifest: null,
  allowed_actions: ['retry', 'skip'],
};

const run: Run = {
  id: 'run-1',
  workflow_id: 'workflow-1',
  status: 'running',
  started_at: '2026-07-28T00:01:00Z',
  completed_at: null,
  created_at: '2026-07-28T00:00:00Z',
  attempts: [attempt],
  allowed_actions: ['pause', 'cancel'],
};

const artifact: Artifact = {
  id: 'artifact-1',
  run_id: 'run-1',
  task_id: 'research',
  attempt_id: 'attempt-1',
  relative_path: 'runs/run-1/tasks/research/artifacts/research.md',
  media_type: 'text/markdown',
  size: 12,
  sha256: 'a'.repeat(64),
  created_at: '2026-07-28T00:02:00Z',
};

type MockSocket = {
  url: string;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  emit: (data: unknown) => void;
  open: () => void;
  fail: () => void;
  disconnect: () => void;
};

let sockets: MockSocket[] = [];
let OriginalWebSocket: typeof WebSocket;

function installMockWebSocket() {
  sockets = [];
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    url: string;
    readyState = MockWebSocket.CONNECTING;
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.({ code: 1000 } as CloseEvent);
    });

    constructor(url: string) {
      this.url = url;
      const socket = this as unknown as MockSocket;
      socket.emit = (data: unknown) => {
        this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
      };
      socket.open = () => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.(new Event('open'));
      };
      socket.fail = () => {
        this.onerror?.(new Event('error'));
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ code: 1006 } as CloseEvent);
      };
      socket.disconnect = () => {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ code: 1006 } as CloseEvent);
      };
      sockets.push(socket);
    }
  }
  vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
}

const client = {
  listProjects: vi.fn().mockResolvedValue([project]),
  createProject: vi.fn(),
  getProject: vi.fn().mockResolvedValue(project),
  getProjectWorkflow: vi.fn().mockResolvedValue(workflow),
  listProjectRuns: vi.fn().mockResolvedValue({ runs: [], next_cursor: null }),
  plan: vi.fn(),
  getWorkflow: vi.fn().mockResolvedValue(workflow),
  updateWorkflow: vi.fn(),
  validateWorkflow: vi.fn(),
  reviewWorkflow: vi.fn(),
  createRun: vi.fn().mockResolvedValue(run),
  startRun: vi.fn().mockResolvedValue({ id: 'run-1', status: 'accepted' }),
  getRun: vi.fn().mockResolvedValue(run),
  pauseRun: vi.fn().mockResolvedValue({ ...run, status: 'paused', allowed_actions: ['resume', 'cancel'] }),
  resumeRun: vi.fn().mockResolvedValue({ ...run, status: 'running', allowed_actions: ['pause', 'cancel'] }),
  cancelRun: vi.fn().mockResolvedValue({ ...run, status: 'cancelled', allowed_actions: [] }),
  retryTask: vi.fn().mockResolvedValue({ ...attempt, attempt: 2, status: 'ready' }),
  skipTask: vi.fn().mockResolvedValue({ ...run, status: 'running' }),
  listArtifacts: vi.fn().mockResolvedValue({ artifacts: [artifact] }),
  listTaskLogs: vi.fn().mockResolvedValue({
    offset: 0,
    next_offset: 2,
    events: [
      { message: 'line-0' },
      { message: 'line-1' },
    ],
  }),
  listNodes: vi.fn().mockResolvedValue([]),
  createNode: vi.fn(),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  diagnoseNode: vi.fn(),
  provisionNode: vi.fn(),
  getPlannerConfig: vi.fn().mockResolvedValue({
    base_url: null, model: null, credential_key: null, credential_configured: false,
  }),
  setPlannerConfig: vi.fn(),
} as unknown as CoordinatorClient;

function Probe({ runId }: { runId: string | null }) {
  const state = useRunEvents(runId);
  return (
    <div>
      <span data-testid="last-event-id">{state.lastEventId}</span>
      <span data-testid="connected">{String(state.connected)}</span>
    </div>
  );
}

function seedWorkspace() {
  useWorkspaceStore.setState({
    project,
    workflow,
    run,
    runStatus: 'running',
    runProgress: 0,
    selectedTaskId: 'research',
    canExecute: true,
    error: null,
    pendingActions: [],
  });
}

beforeEach(() => {
  OriginalWebSocket = globalThis.WebSocket;
  installMockWebSocket();
  vi.clearAllMocks();
  vi.mocked(client.listArtifacts).mockResolvedValue({ artifacts: [artifact] });
  vi.mocked(client.listTaskLogs).mockResolvedValue({
    offset: 0,
    next_offset: 2,
    events: [{ message: 'line-0' }, { message: 'line-1' }],
  });
  vi.mocked(client.pauseRun).mockResolvedValue({ ...run, status: 'paused', allowed_actions: ['resume', 'cancel'] });
  vi.mocked(client.resumeRun).mockResolvedValue({ ...run, status: 'running', allowed_actions: ['pause', 'cancel'] });
  vi.mocked(client.cancelRun).mockResolvedValue({ ...run, status: 'cancelled', allowed_actions: [] });
  vi.mocked(client.retryTask).mockResolvedValue({ ...attempt, attempt: 2, status: 'ready' });
  vi.mocked(client.skipTask).mockResolvedValue({ ...run, status: 'running' });
  vi.mocked(client.getRun).mockResolvedValue(run);
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
  seedWorkspace();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (OriginalWebSocket) vi.stubGlobal('WebSocket', OriginalWebSocket);
  useWorkspaceStore.getState().resetWorkspace();
});

describe('run event reducer', () => {
  it('only accepts events with event_id greater than lastEventId', () => {
    let state = createInitialRunEventState();
    const first: RunEvent = {
      event_id: 3,
      run_id: 'run-1',
      type: 'run.created',
      payload: { status: 'pending' },
      created_at: '2026-07-28T00:00:00Z',
    };
    state = applyRunEvent(state, first);
    expect(state.lastEventId).toBe(3);

    state = applyRunEvent(state, { ...first, event_id: 3, type: 'run.status_changed' });
    expect(state.lastEventId).toBe(3);
    expect(state.events).toHaveLength(1);

    state = applyRunEvent(state, {
      event_id: 1,
      run_id: 'run-1',
      type: 'run.status_changed',
      payload: { status: 'running' },
      created_at: '2026-07-28T00:00:01Z',
    });
    expect(state.lastEventId).toBe(3);
    expect(state.events).toHaveLength(1);

    state = applyRunEvent(state, {
      event_id: 5,
      run_id: 'run-1',
      type: 'run.status_changed',
      payload: { status: 'running' },
      created_at: '2026-07-28T00:00:02Z',
    });
    expect(state.lastEventId).toBe(5);
    expect(state.events.map((event) => event.event_id)).toEqual([3, 5]);
  });

  it('tracks task attempt snapshots from task.status_changed events', () => {
    let state: RunEventState = createInitialRunEventState();
    state = applyRunEvent(state, {
      event_id: 1,
      run_id: 'run-1',
      type: 'task.status_changed',
      payload: {
        task_id: 'research',
        attempt: 1,
        attempt_id: 'attempt-1',
        node_id: 'node-local',
        status: 'running',
      },
      created_at: '2026-07-28T00:01:00Z',
    });
    expect(state.taskAttempts.research).toMatchObject({
      id: 'attempt-1',
      task_id: 'research',
      node_id: 'node-local',
      attempt: 1,
      status: 'running',
    });
  });
});

describe('useRunEvents', () => {
  it('RunBar keeps a live websocket for the current run and applies status events', async () => {
    useWorkspaceStore.setState({
      run: { ...run, status: 'pending' },
      runStatus: 'pending',
      runProgress: 0,
    });
    render(<I18nProvider><RunBar /></I18nProvider>);
    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(sockets[0].url).toContain('/ws/runs/run-1?last_event_id=0');
    expect(screen.getByText('等待调度')).toBeInTheDocument();

    act(() => {
      sockets[0].open();
      sockets[0].emit({
        event_id: 2,
        run_id: 'run-1',
        type: 'run.status_changed',
        payload: { previous: 'pending', status: 'running' },
        created_at: '2026-07-28T00:00:01Z',
      });
    });

    await waitFor(() => expect(useWorkspaceStore.getState().runStatus).toBe('running'));
    expect(useWorkspaceStore.getState().run?.status).toBe('running');
    expect(screen.getByText('运行中')).toBeInTheDocument();
  });

  it('applies snapshot events then incremental events over websocket', async () => {
    render(<Probe runId="run-1" />);
    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(sockets[0].url).toContain('/ws/runs/run-1?last_event_id=0');

    act(() => {
      sockets[0].open();
      sockets[0].emit({
        event_id: 1,
        run_id: 'run-1',
        type: 'run.created',
        payload: { status: 'pending' },
        created_at: '2026-07-28T00:00:00Z',
      });
      sockets[0].emit({
        event_id: 2,
        run_id: 'run-1',
        type: 'run.status_changed',
        payload: { previous: 'pending', status: 'running' },
        created_at: '2026-07-28T00:00:01Z',
      });
    });

    await waitFor(() => expect(screen.getByTestId('last-event-id')).toHaveTextContent('2'));
    expect(screen.getByTestId('connected')).toHaveTextContent('true');
    expect(useWorkspaceStore.getState().runStatus).toBe('running');
  });

  it('reconnects with last_event_id so the server can resume', async () => {
    render(<Probe runId="run-1" />);
    await waitFor(() => expect(sockets).toHaveLength(1));

    act(() => {
      sockets[0].open();
      sockets[0].emit({
        event_id: 4,
        run_id: 'run-1',
        type: 'run.status_changed',
        payload: { status: 'running' },
        created_at: '2026-07-28T00:00:00Z',
      });
    });
    await waitFor(() => expect(screen.getByTestId('last-event-id')).toHaveTextContent('4'));

    act(() => { sockets[0].disconnect(); });
    await waitFor(() => expect(sockets.length).toBeGreaterThanOrEqual(2));
    expect(sockets.at(-1)?.url).toContain('last_event_id=4');
  });

  it('ignores duplicate and out-of-order websocket events', async () => {
    render(<Probe runId="run-1" />);
    await waitFor(() => expect(sockets).toHaveLength(1));

    act(() => {
      sockets[0].open();
      sockets[0].emit({
        event_id: 10,
        run_id: 'run-1',
        type: 'task.status_changed',
        payload: {
          task_id: 'research', attempt: 1, attempt_id: 'attempt-1', node_id: 'node-a', status: 'running',
        },
        created_at: '2026-07-28T00:00:00Z',
      });
      sockets[0].emit({
        event_id: 10,
        run_id: 'run-1',
        type: 'task.status_changed',
        payload: {
          task_id: 'research', attempt: 1, attempt_id: 'attempt-1', node_id: 'node-b', status: 'failed',
        },
        created_at: '2026-07-28T00:00:01Z',
      });
      sockets[0].emit({
        event_id: 8,
        run_id: 'run-1',
        type: 'task.status_changed',
        payload: {
          task_id: 'research', attempt: 1, attempt_id: 'attempt-1', node_id: 'node-c', status: 'success',
        },
        created_at: '2026-07-28T00:00:02Z',
      });
    });

    await waitFor(() => expect(screen.getByTestId('last-event-id')).toHaveTextContent('10'));
    expect(useWorkspaceStore.getState().taskAttempts.research?.node_id).toBe('node-a');
    expect(useWorkspaceStore.getState().taskAttempts.research?.status).toBe('running');
  });
});

describe('TaskLog pagination', () => {
  it('loads the first page and requests the next offset', async () => {
    vi.mocked(client.listTaskLogs)
      .mockResolvedValueOnce({
        offset: 0,
        next_offset: 2,
        events: [{ message: 'alpha' }, { message: 'beta' }],
      })
      .mockResolvedValueOnce({
        offset: 2,
        next_offset: 2,
        events: [],
      });

    render(<TaskLog runId="run-1" taskId="research" />);

    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(client.listTaskLogs).toHaveBeenCalledWith('run-1', 'research', 0);

    fireEvent.click(screen.getByRole('button', { name: '加载更多日志' }));
    await waitFor(() => expect(client.listTaskLogs).toHaveBeenCalledWith('run-1', 'research', 2));
    expect(screen.getByText('没有更多日志')).toBeInTheDocument();
  });
});

describe('ArtifactBrowser errors', () => {
  it('shows structured server errors when listing artifacts fails', async () => {
    vi.mocked(client.listArtifacts).mockRejectedValue(
      new CoordinatorError(409, 'artifact_integrity_error', 'artifact failed integrity verification', {
        path: 'broken.md',
      }),
    );

    render(<ArtifactBrowser runId="run-1" taskId="research" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('加载失败')).toBeInTheDocument();
    expect(screen.getByText('产物完整性校验失败')).toBeInTheDocument();
  });

  it('lists real artifacts for the selected task', async () => {
    render(<ArtifactBrowser runId="run-1" taskId="research" />);
    await waitFor(() => expect(screen.getByText(/research\.md/)).toBeInTheDocument());
    expect(screen.getByText('12 字节')).toBeInTheDocument();
  });
});

describe('RunControls', () => {
  it('pauses, resumes, cancels, retries and skips through the API client', async () => {
    render(<RunControls />);

    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    await waitFor(() => expect(client.pauseRun).toHaveBeenCalledWith('run-1'));
    expect(useWorkspaceStore.getState().run?.status).toBe('paused');

    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    await waitFor(() => expect(client.resumeRun).toHaveBeenCalledWith('run-1'));

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(client.cancelRun).toHaveBeenCalledWith('run-1'));

    fireEvent.click(screen.getByRole('button', { name: '重试任务' }));
    await waitFor(() => expect(client.retryTask).toHaveBeenCalledWith('run-1', 'research'));

    fireEvent.click(screen.getByRole('button', { name: '跳过任务' }));
    await waitFor(() => expect(client.skipTask).toHaveBeenCalledWith('run-1', 'research'));
  });

  it('surfaces structured control errors from the server', async () => {
    vi.mocked(client.pauseRun).mockRejectedValue(
      new CoordinatorError(409, 'run_not_pausable', 'run cannot be paused', { run_id: 'run-1' }),
    );
    render(<RunControls />);

    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    await waitFor(() => expect(useWorkspaceStore.getState().error).toMatchObject({
      code: 'run_not_pausable',
      message: '当前运行不能暂停',
    }));
  });
});
