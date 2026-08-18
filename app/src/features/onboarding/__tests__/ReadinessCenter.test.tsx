import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoordinatorClient, ReadinessResult } from '../../../lib/client';
import { setWorkspaceClient, useWorkspaceStore } from '../../../store/workspaceStore';
import ReadinessCenter from '../ReadinessCenter';

const blockedResult: ReadinessResult = {
  ready: false,
  checkedAt: '2026-08-12T00:00:00Z',
  projectId: null,
  workflowId: null,
  checks: {
    project: 'blocked',
    planner: 'blocked',
    workflow: 'unknown',
    tasks: 'unknown',
    nodes: 'blocked',
    credentials: 'unknown',
  },
  issues: [
    {
      code: 'project_missing', severity: 'blocking', title: '尚未创建项目',
      message: '请先创建一个项目并选择项目目录。', action: 'open_project', targetId: null,
    },
    {
      code: 'planner_not_configured', severity: 'blocking', title: '思考模型未配置',
      message: '请在“思考模型”中填写接口地址、模型和 API Key。', action: 'open_planner', targetId: null,
    },
    {
      code: 'node_missing', severity: 'blocking', title: '尚未配置执行节点',
      message: '请添加本机节点或远程节点。', action: 'open_nodes', targetId: null,
    },
  ],
};

const readyResult: ReadinessResult = {
  ready: true,
  checkedAt: '2026-08-12T00:00:00Z',
  projectId: 'project-1',
  workflowId: 'workflow-1',
  checks: {
    project: 'ready', planner: 'ready', workflow: 'ready',
    tasks: 'ready', nodes: 'ready', credentials: 'ready',
  },
  issues: [],
};

const client = {
  getReadiness: vi.fn().mockResolvedValue(blockedResult),
} as unknown as CoordinatorClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.getReadiness).mockResolvedValue(blockedResult);
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
});
afterEach(cleanup);

describe('ReadinessCenter', () => {
  it('hides the strip until a blocking result exists', () => {
    render(<ReadinessCenter />);
    expect(screen.queryByLabelText('执行就绪检查')).toBeNull();
  });

  it('shows a single root-cause strip and expands grouped details', async () => {
    useWorkspaceStore.setState({ readiness: blockedResult });
    render(<ReadinessCenter expanded={false} onExpandedChange={() => undefined} />);
    expect(screen.getByText('尚未创建项目')).toBeTruthy();
    expect(screen.queryByText('思考模型未配置')).toBeNull();
    render(<ReadinessCenter expanded onExpandedChange={() => undefined} />);
    expect(screen.getAllByText('思考模型未配置').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '打开设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开节点' })).toBeTruthy();
  });

  it('routes issue actions to the matching panel', async () => {
    useWorkspaceStore.setState({ readiness: blockedResult });
    render(<ReadinessCenter expanded onExpandedChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));
    expect(useWorkspaceStore.getState().activePanel).toBe('thinking_models');
    fireEvent.click(screen.getByRole('button', { name: '打开节点' }));
    expect(useWorkspaceStore.getState().activePanel).toBe('nodes');
  });

  it('hides when ready', () => {
    useWorkspaceStore.setState({ readiness: readyResult });
    render(<ReadinessCenter />);
    expect(screen.queryByText('思考模型未配置')).toBeNull();
    expect(screen.queryByLabelText('执行就绪检查')).toBeNull();
  });
});
