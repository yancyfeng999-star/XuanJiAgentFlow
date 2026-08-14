import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AppShell from '../../../app/AppShell';
import type { CoordinatorClient, Project, Workflow } from '../../../lib/client';
import { setWorkspaceClient, useWorkspaceStore } from '../../../store/workspaceStore';

const project: Project = {
  id: 'project-1', name: 'Editable project', root_path: '/tmp/project-1', active_workflow_version: 1,
  created_at: '2026-07-28T00:00:00Z', updated_at: '2026-07-28T00:00:00Z',
};
const workflow: Workflow = {
  id: 'workflow-1', project_id: 'project-1', version: 1, goal: 'Build report', planner_provider: null, planner_model: null,
  status: 'draft', graph_json: {}, created_at: '2026-07-28T00:00:00Z',
  reviewed_at: null, reviewed_by: null, review_snapshot_hash: null, review_warnings: [], tasks: [{
    id: 'research', workflow_id: 'workflow-1', title: 'Research', description: 'Read sources', prompt: 'Find evidence', agent_type: 'research', dependencies: [],
    execution_policy: { mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [], required_tags: ['research'], timeout_seconds: 1800 },
    retry_policy: { max_attempts: 3, delay_seconds: 1 }, expected_outputs: [{ path: 'research.md', media_type: null }], writes: [], done_definition: [], verify: [], run_gate: 'auto', ui_position: { x: 100, y: 100 },
  }],
};
const client = {
  listProjects: vi.fn().mockResolvedValue([project]), getProject: vi.fn().mockResolvedValue(project), getProjectWorkflow: vi.fn().mockResolvedValue(workflow),
  listProjectRuns: vi.fn().mockResolvedValue({ runs: [], next_cursor: null }), getWorkflow: vi.fn().mockResolvedValue(workflow),
  plan: vi.fn().mockResolvedValue(workflow), updateWorkflow: vi.fn().mockImplementation(async (_id, payload) => ({ ...workflow, ...payload })),
  validateWorkflow: vi.fn().mockResolvedValue({ valid: true, topological_order: ['research'] }),
  prepareReview: vi.fn().mockResolvedValue({
    snapshot: {}, snapshot_hash: 'a'.repeat(64), topological_order: ['research'], task_count: 1,
    tasks: [{ task_id: 'research', title: 'Research', dependencies: [], writes: ['research.md'], verify: [], done_definition: [], run_gate: 'auto', matching_node_ids: ['node-1'], timeout_seconds: 1800 }],
    blockers: [], warnings: [],
  }),
  reviewWorkflow: vi.fn().mockResolvedValue({ ...workflow, status: 'reviewed' }),
  createRevision: vi.fn(),
  createRun: vi.fn().mockResolvedValue({ id: 'run-1', workflow_id: 'workflow-1', status: 'pending', started_at: null, completed_at: null, created_at: '2026-07-28T00:00:00Z', attempts: [] }),
  startRun: vi.fn().mockResolvedValue({ id: 'run-1', status: 'accepted' }),
  listNodes: vi.fn().mockResolvedValue([]), createNode: vi.fn().mockImplementation(async (value) => ({ ...value, credential_configured: Boolean(value.credential), status: 'unknown', capabilities_json: {}, max_concurrency: 1, running_tasks: 0, success_rate: 1, last_seen_at: null })),
  updateNode: vi.fn(), deleteNode: vi.fn(), diagnoseNode: vi.fn(), provisionNode: vi.fn().mockResolvedValue({ node_id: 'remote-1', completed: true, steps: [] }),
  getPlannerConfig: vi.fn().mockResolvedValue({ base_url: null, model: null, credential_key: null, credential_configured: false }),
  setPlannerConfig: vi.fn().mockResolvedValue({ base_url: 'https://planner.test/v1', model: 'model', credential_key: 'planner.primary', credential_configured: true }),
} as unknown as CoordinatorClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.getProjectWorkflow).mockResolvedValue(workflow);
  vi.mocked(client.listNodes).mockResolvedValue([]);
  vi.mocked(client.getPlannerConfig).mockResolvedValue({
    base_url: null, model: null, credential_key: null, credential_configured: false,
  });
  vi.mocked(client.setPlannerConfig).mockImplementation(async (input) => {
    const redacted = {
      base_url: input.base_url, model: input.model, credential_key: input.credential_key, credential_configured: true,
    };
    vi.mocked(client.getPlannerConfig).mockResolvedValue(redacted);
    return redacted;
  });
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
});
afterEach(cleanup);

async function renderReadyShell() {
  render(<AppShell />);
  await screen.findByRole('navigation', { name: '工作区导航' });
}


async function confirmReviewViaModal() {
  fireEvent.click(screen.getByRole('button', { name: '审核工作流' }));
  const confirm = await screen.findByRole('button', { name: '确认审核' });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
}

describe('editable workflow workspace', () => {
  it('loads a project and edits a selected task until review freezes it', async () => {
    render(<AppShell />);
    await screen.findByRole('button', { name: '审核工作流' });
    expect(useWorkspaceStore.getState().workflow?.tasks[0].title).toBe('Research');
    act(() => useWorkspaceStore.getState().selectTask('research'));
    fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: 'Investigate' } });
    fireEvent.click(screen.getByRole('button', { name: '保存任务' }));
    await waitFor(() => expect(client.updateWorkflow).toHaveBeenCalled());

    await confirmReviewViaModal();
    await waitFor(() => expect(screen.getByText('已审核，编辑已冻结')).toBeInTheDocument());
    expect(screen.getByLabelText('任务标题')).toBeDisabled();
  });

  it('selects scheduling capabilities and outputs without comma-delimited fields', async () => {
    vi.mocked(client.listNodes).mockResolvedValue([{
      id: 'node-1', name: 'Research Node', kind: 'local', api_url: 'http://node.test',
      ssh_host: null, ssh_port: null, ssh_user: null, ssh_key_path: null, status: 'online',
      capabilities_json: { models: ['m1'], tools: ['terminal'], tags: ['research', 'gpu'] },
      max_concurrency: 1, running_tasks: 0, success_rate: 1, last_seen_at: null,
      credential_configured: false,
    }]);
    render(<AppShell />);
    await screen.findByRole('button', { name: '审核工作流' });
    act(() => useWorkspaceStore.getState().selectTask('research'));

    await screen.findByText('终端');
    fireEvent.click(screen.getByText('m1'));
    fireEvent.click(screen.getByText('终端'));
    fireEvent.click(screen.getByText('图形处理器'));
    fireEvent.change(screen.getByLabelText('调度模式'), { target: { value: 'fixed' } });
    fireEvent.change(screen.getByLabelText('固定节点'), { target: { value: 'node-1' } });
    fireEvent.change(screen.getByLabelText('文件类型'), { target: { value: 'text/markdown' } });
    fireEvent.click(screen.getByRole('button', { name: '保存任务' }));

    await waitFor(() => expect(client.updateWorkflow).toHaveBeenCalled());
    const updatedTask = vi.mocked(client.updateWorkflow).mock.calls.at(-1)?.[1].tasks[0];
    expect(updatedTask).toBeDefined();
    if (!updatedTask) return;
    expect(updatedTask.execution_policy).toMatchObject({
      mode: 'fixed',
      node_id: 'node-1',
      required_models: ['m1'],
      required_tools: ['terminal'],
      required_tags: ['research', 'gpu'],
    });
    expect(updatedTask.expected_outputs).toEqual([{ path: 'research.md', media_type: 'text/markdown' }]);
    expect(screen.queryByText(/逗号分隔/)).not.toBeInTheDocument();
  });

  it('offers minimal task add and delete controls only while draft', async () => {
    render(<AppShell />);
    await screen.findByRole('button', { name: '新增任务' });

    fireEvent.click(screen.getByRole('button', { name: '新增任务' }));
    await waitFor(() => expect(client.updateWorkflow).toHaveBeenCalled());

    act(() => useWorkspaceStore.getState().selectTask('research'));
    fireEvent.click(screen.getByRole('button', { name: '删除任务' }));
    await waitFor(() => expect(client.updateWorkflow).toHaveBeenCalledTimes(2));

    await confirmReviewViaModal();
    await waitFor(() => expect(screen.queryByRole('button', { name: '新增任务' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '删除任务' })).not.toBeInTheDocument();
  });

  it('gates execution before review and executes only after review', async () => {
    render(<AppShell />);
    await waitFor(() => expect(screen.getByText('Editable project')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '执行全部' })).toBeDisabled();

    await confirmReviewViaModal();
    await waitFor(() => expect(screen.getByRole('button', { name: '执行全部' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '执行全部' }));

    await waitFor(() => expect(client.createRun).toHaveBeenCalledWith('workflow-1'));
    expect(client.startRun).toHaveBeenCalledWith('run-1');
  });

  it('shows configured planner and node credentials without a lock step', async () => {
    vi.mocked(client.listNodes).mockResolvedValue([{
      id: 'locked-node', name: 'Locked Node', kind: 'local', api_url: 'http://node.test',
      ssh_host: null, ssh_port: null, ssh_user: null, ssh_key_path: null, status: 'unknown',
      capabilities_json: {}, max_concurrency: 1, running_tasks: 0, success_rate: 1,
      last_seen_at: null, credential_configured: true,
    }]);
    vi.mocked(client.getPlannerConfig).mockResolvedValue({
      base_url: 'https://planner.test/v1', model: 'model', credential_key: 'planner.primary', credential_configured: true,
    });
    await renderReadyShell();

    fireEvent.click(screen.getByRole('button', { name: '节点' }));

    expect(await screen.findByText('访问密钥已配置')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '思考模型' }));
    expect(await screen.findByText('接口密钥已配置')).toBeInTheDocument();
  });

  it('shows structured error when remote provisioning fails verification', async () => {
    vi.mocked(client.listNodes).mockResolvedValue([{
      id: 'remote-1', name: 'Remote', kind: 'remote', api_url: 'http://remote.test:8642',
      ssh_host: 'remote.test', ssh_port: 2222, ssh_user: 'runner', ssh_key_path: '/keys/id_ed25519',
      status: 'unknown', capabilities_json: {}, max_concurrency: 1, running_tasks: 0, success_rate: 1,
      last_seen_at: null, credential_configured: true,
    }]);
    vi.mocked(client.provisionNode).mockResolvedValue({
      node_id: 'remote-1', completed: false, steps: [{ step: 'verify_api_server', online: false }],
    });
    await renderReadyShell();
    fireEvent.click(screen.getByRole('button', { name: '节点' }));
    await screen.findByText('访问密钥已配置');
    fireEvent.change(screen.getByLabelText('任务引擎端口'), { target: { value: '8642' } });
    fireEvent.click(screen.getByRole('button', { name: '远程部署' }));
    expect(await screen.findByText('节点部署未通过最终验证')).toBeInTheDocument();
  });

  it('saves redacted planner configuration and configures a remote node', async () => {
    render(<AppShell />);
    await waitFor(() => expect(screen.getByText('Editable project')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '思考模型' }));
    expect(screen.queryByLabelText('协调器基础地址')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('规划器基础地址'), { target: { value: 'https://planner.test/v1' } });
    fireEvent.change(screen.getByLabelText('规划模型'), { target: { value: 'model' } });
    fireEvent.change(screen.getByLabelText('规划器接口密钥'), { target: { value: 'planner-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存规划器配置' }));
    await waitFor(() => expect(screen.getByText('接口密钥已配置')).toBeInTheDocument());
    expect(client.setPlannerConfig).toHaveBeenCalled();
    expect(screen.getByLabelText('规划器接口密钥')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: '节点' }));
    fireEvent.click(screen.getByRole('button', { name: /远程节点/ }));
    fireEvent.change(screen.getByLabelText('节点标识'), { target: { value: 'remote-1' } });
    fireEvent.change(screen.getByLabelText('节点名称'), { target: { value: 'Remote' } });
    fireEvent.change(screen.getByLabelText('节点地址'), { target: { value: 'http://remote.test:8642' } });
    fireEvent.change(screen.getByLabelText('远程连接主机地址'), { target: { value: 'remote.test' } });
    fireEvent.change(screen.getByLabelText('远程连接端口'), { target: { value: '2222' } });
    fireEvent.change(screen.getByLabelText('远程连接用户'), { target: { value: 'runner' } });
    fireEvent.change(screen.getByLabelText('远程连接私钥路径'), { target: { value: '/keys/id_ed25519' } });
    fireEvent.change(screen.getByLabelText('节点访问密钥'), { target: { value: 'node-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存节点' }));

    await waitFor(() => expect(client.createNode).toHaveBeenCalledWith(expect.objectContaining({
      id: 'remote-1', api_url: 'http://remote.test:8642', ssh_host: 'remote.test', ssh_port: 2222,
      ssh_user: 'runner', ssh_key_path: '/keys/id_ed25519', credential: 'node-secret',
    })));
    expect((await screen.findAllByText('访问密钥已配置')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('节点访问密钥')).toHaveValue('');
  });
});
