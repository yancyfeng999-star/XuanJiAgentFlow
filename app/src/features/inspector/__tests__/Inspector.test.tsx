import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoordinatorClient, Project, Workflow } from '../../../lib/client';
import I18nProvider from '../../../lib/I18nProvider';
import { setWorkspaceClient, useWorkspaceStore } from '../../../store/workspaceStore';
import Inspector from '../Inspector';

const project: Project = {
  id: 'p1', name: 'P', root_path: '/tmp/p', active_workflow_version: 1,
  created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:00:00Z',
};

const workflow: Workflow = {
  id: 'wf', project_id: 'p1', version: 1, goal: 'g', planner_provider: null, planner_model: null,
  status: 'draft', graph_json: {}, reviewed_at: null, reviewed_by: null, review_snapshot_hash: null,
  review_warnings: [], created_at: '2026-08-14T00:00:00Z',
  tasks: [{
    id: 't1', workflow_id: 'wf', title: '任务甲', description: '描述', prompt: '指令',
    agent_type: 'research', dependencies: [],
    execution_policy: { mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [], required_tags: [], timeout_seconds: 1800 },
    retry_policy: { max_attempts: 3, delay_seconds: 1 }, expected_outputs: [], writes: [], done_definition: [], verify: [],
    run_gate: 'auto', ui_position: { x: 0, y: 0 },
  }, {
    id: 't2', workflow_id: 'wf', title: '任务乙', description: '下游', prompt: '乙指令',
    agent_type: 'write', dependencies: [],
    execution_policy: { mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [], required_tags: [], timeout_seconds: 1800 },
    retry_policy: { max_attempts: 3, delay_seconds: 1 }, expected_outputs: [], writes: [], done_definition: [], verify: [],
    run_gate: 'auto', ui_position: { x: 80, y: 0 },
  }],
};

const client = {
  updateWorkflow: vi.fn().mockImplementation(async (_id, payload) => ({ ...workflow, ...payload })),
  createRevision: vi.fn(),
  listNodes: vi.fn().mockResolvedValue([]),
} as unknown as CoordinatorClient;

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.setState({ project, workflow, selectedTaskId: 't1' });
});

describe('Inspector tabs', () => {
  it('exposes five tabs and keeps the prompt field on the inputs tab', () => {
    render(<I18nProvider><Inspector /></I18nProvider>);
    expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '提示词与输入' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '执行' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '预期产物' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '运行详情' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务指令')).toHaveValue('指令');
    fireEvent.click(screen.getByRole('tab', { name: '概览' }));
    expect(screen.getAllByText('任务甲').length).toBeGreaterThan(0);
  });

  it('saves the full task contract from one draft across the five tabs', async () => {
    render(<I18nProvider><Inspector /></I18nProvider>);

    fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '统一草稿标题' } });
    fireEvent.change(screen.getByLabelText('角色'), { target: { value: 'analyst' } });
    fireEvent.change(screen.getByLabelText('任务指令'), { target: { value: '统一草稿指令' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '任务乙' }));

    fireEvent.click(screen.getByRole('tab', { name: '执行' }));
    fireEvent.change(screen.getByLabelText('调度模式'), { target: { value: 'local_first' } });
    fireEvent.change(screen.getByLabelText('超时（秒）'), { target: { value: '900' } });
    fireEvent.change(screen.getByLabelText('最大尝试次数'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('重试延迟（秒）'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('新增所需模型'), { target: { value: 'gpt-test' } });
    fireEvent.click(screen.getAllByRole('button', { name: '添加' }).find((button) => !(button as HTMLButtonElement).disabled)!);

    fireEvent.click(screen.getByRole('tab', { name: '预期产物' }));
    fireEvent.click(screen.getByRole('button', { name: '添加产出' }));
    fireEvent.change(screen.getByPlaceholderText('例如 报告.md'), { target: { value: 'out/report.md' } });
    fireEvent.change(screen.getByLabelText('写入范围（每行一个相对路径）'), { target: { value: 'out/report.md' } });
    fireEvent.change(screen.getByLabelText('完成定义（每行一条）'), { target: { value: '报告已写完' } });
    fireEvent.change(screen.getByLabelText('人工检查点'), { target: { value: 'review_before_complete' } });
    fireEvent.click(screen.getByRole('button', { name: '添加验证步骤' }));
    fireEvent.change(screen.getByLabelText('内容'), { target: { value: 'out/report.md' } });

    fireEvent.click(screen.getByRole('button', { name: '保存任务' }));

    await waitFor(() => expect(client.updateWorkflow).toHaveBeenCalled());
    const saved = vi.mocked(client.updateWorkflow).mock.calls.at(-1)?.[1].tasks.find((task: { id: string }) => task.id === 't1');
    expect(saved).toMatchObject({
      title: '统一草稿标题',
      agent_type: 'analyst',
      prompt: '统一草稿指令',
      dependencies: ['t2'],
      execution_policy: expect.objectContaining({
        mode: 'local_first',
        timeout_seconds: 900,
        required_models: ['gpt-test'],
      }),
      retry_policy: { max_attempts: 5, delay_seconds: 10 },
      expected_outputs: [{ path: 'out/report.md', media_type: null }],
      writes: ['out/report.md'],
      done_definition: ['报告已写完'],
      verify: [{ kind: 'file_exists', value: 'out/report.md' }],
      run_gate: 'review_before_complete',
    });
  });

  it('shows a revision action when the workflow is reviewed', () => {
    useWorkspaceStore.setState({ workflow: { ...workflow, status: 'reviewed' } });
    render(<I18nProvider><Inspector /></I18nProvider>);
    expect(screen.getByRole('button', { name: '创建新修订' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务指令')).toBeDisabled();
  });
});
