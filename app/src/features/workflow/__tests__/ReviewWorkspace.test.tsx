import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CoordinatorError, type CoordinatorClient, type Workflow } from '../../../lib/client';
import { setWorkspaceClient, useWorkspaceStore } from '../../../store/workspaceStore';
import ReviewWorkspace from '../ReviewWorkspace';

const workflow: Workflow = {
  id: 'workflow-1', project_id: 'project-1', version: 1, goal: 'Build report',
  planner_provider: null, planner_model: null, status: 'draft', graph_json: {},
  reviewed_at: null, reviewed_by: null, review_snapshot_hash: null, review_warnings: [],
  created_at: '2026-08-12T00:00:00Z',
  tasks: [{
    id: 'research', workflow_id: 'workflow-1', title: 'Research', description: '', prompt: '', agent_type: 'research', dependencies: [],
    execution_policy: { mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [], required_tags: [], timeout_seconds: 1800 },
    retry_policy: { max_attempts: 3, delay_seconds: 1 }, expected_outputs: [], writes: [], done_definition: [], verify: [], run_gate: 'auto', ui_position: { x: 0, y: 0 },
  }],
};

const prepared = {
  snapshot: {}, snapshot_hash: 'b'.repeat(64), topological_order: ['research'], task_count: 1,
  tasks: [{
    task_id: 'research', title: 'Research', dependencies: [], writes: [], verify: [],
    done_definition: [], run_gate: 'auto', matching_node_ids: [], timeout_seconds: 1800,
  }],
  blockers: [],
  warnings: [{
    code: 'task_without_expected_outputs', task_id: 'research',
    title: '任务“Research”未声明预期产物', message: '没有预期产物的任务无法机械验证交付结果。',
  }],
};

const client = {
  prepareReview: vi.fn().mockResolvedValue(prepared),
  reviewWorkflow: vi.fn().mockResolvedValue({ ...workflow, status: 'reviewed' }),
  getReadiness: vi.fn(),
} as unknown as CoordinatorClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.prepareReview).mockResolvedValue(prepared);
  vi.mocked(client.reviewWorkflow).mockResolvedValue({ ...workflow, status: 'reviewed' });
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.setState({
    workflow,
    project: {
      id: 'project-1', name: 'Demo', root_path: '/tmp/demo', active_workflow_version: 1,
      created_at: '2026-08-12T00:00:00Z', updated_at: '2026-08-12T00:00:00Z',
    },
  });
});
afterEach(cleanup);

describe('ReviewWorkspace', () => {
  it('requires warning acknowledgement before confirming', async () => {
    const onClose = vi.fn();
    render(<ReviewWorkspace onClose={onClose} />);
    const confirm = await screen.findByRole('button', { name: '确认审核' });
    expect(confirm).toBeDisabled();
    expect(screen.getByText('任务“Research”未声明预期产物')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('我已阅读并接受以上全部警告'));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(client.reviewWorkflow).toHaveBeenCalledWith('workflow-1', {
      snapshot_hash: 'b'.repeat(64),
      acknowledged_warnings: ['task_without_expected_outputs'],
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('keeps confirm disabled when blockers exist', async () => {
    vi.mocked(client.prepareReview).mockResolvedValue({
      ...prepared,
      blockers: [{ code: 'workflow_empty', title: '工作流没有任务', message: '请重新规划。' }],
    });
    render(<ReviewWorkspace onClose={vi.fn()} />);
    const confirm = await screen.findByRole('button', { name: '确认审核' });
    expect(screen.getByText('工作流没有任务')).toBeTruthy();
    expect(confirm).toBeDisabled();
  });

  it('offers reload when the snapshot is stale', async () => {
    vi.mocked(client.reviewWorkflow).mockRejectedValue(
      new CoordinatorError(409, 'review_snapshot_stale', 'stale', {}),
    );
    render(<ReviewWorkspace onClose={vi.fn()} />);
    const confirm = await screen.findByRole('button', { name: '确认审核' });
    fireEvent.click(screen.getByLabelText('我已阅读并接受以上全部警告'));
    fireEvent.click(confirm);
    await screen.findByText('工作流在审核准备后已被修改。');
    fireEvent.click(screen.getByRole('button', { name: '重新加载审核' }));
    await waitFor(() => expect(client.prepareReview).toHaveBeenCalledTimes(2));
  });

  it('keeps acknowledgement when the same prepared snapshot is delivered again', async () => {
    render(<ReviewWorkspace onClose={vi.fn()} />);
    const checkbox = await screen.findByLabelText('我已阅读并接受以上全部警告');
    fireEvent.click(checkbox);
    expect(screen.getByRole('button', { name: '确认审核' })).toBeEnabled();

    vi.mocked(client.prepareReview).mockResolvedValue({ ...prepared });
    fireEvent.click(screen.getByRole('button', { name: '重新加载审核' }));
    await waitFor(() => expect(client.prepareReview).toHaveBeenCalledTimes(2));
    expect(checkbox).toBeChecked();
    expect(screen.getByRole('button', { name: '确认审核' })).toBeEnabled();
  });

  it('requires acknowledgement again when the snapshot hash changes', async () => {
    render(<ReviewWorkspace onClose={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText('我已阅读并接受以上全部警告'));
    vi.mocked(client.prepareReview).mockResolvedValue({ ...prepared, snapshot_hash: 'c'.repeat(64) });
    fireEvent.click(screen.getByRole('button', { name: '重新加载审核' }));
    await waitFor(() => expect(client.prepareReview).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('我已阅读并接受以上全部警告')).not.toBeChecked();
    expect(screen.getByRole('button', { name: '确认审核' })).toBeDisabled();
  });
});
