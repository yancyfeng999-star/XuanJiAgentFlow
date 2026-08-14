import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoordinatorClient, Project, Workflow } from '../../../lib/client';
import { I18nProvider } from '../../../lib/i18n';
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
  }],
};

const client = {
  updateWorkflow: vi.fn().mockImplementation(async (_id, payload) => ({ ...workflow, ...payload })),
  createRevision: vi.fn(),
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

  it('shows a revision action when the workflow is reviewed', () => {
    useWorkspaceStore.setState({ workflow: { ...workflow, status: 'reviewed' } });
    render(<I18nProvider><Inspector /></I18nProvider>);
    expect(screen.getByRole('button', { name: '创建新修订' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务指令')).toBeDisabled();
  });
});
