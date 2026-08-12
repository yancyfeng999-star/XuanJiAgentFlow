import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      code: 'planner_not_configured', severity: 'blocking', title: '规划器未配置',
      message: '请在“设置”中填写 Planner 的 Base URL、模型和 API Key。', action: 'open_planner', targetId: null,
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
  it('shows unchecked hint before any result and fetches on demand', async () => {
    render(<ReadinessCenter />);
    expect(screen.getByText('尚未检查执行条件，点击“检查”开始。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /检查/ }));
    await waitFor(() => expect(client.getReadiness).toHaveBeenCalled());
    await screen.findByText('规划器未配置');
  });

  it('lists all six checks and blocking issues with actions', async () => {
    useWorkspaceStore.setState({ readiness: blockedResult });
    render(<ReadinessCenter />);
    expect(screen.getByText('项目目录')).toBeTruthy();
    expect(screen.getByText('Planner')).toBeTruthy();
    expect(screen.getByText('工作流审核')).toBeTruthy();
    expect(screen.getByText('任务匹配')).toBeTruthy();
    expect(screen.getByText('执行节点')).toBeTruthy();
    expect(screen.getByText('凭据')).toBeTruthy();
    expect(screen.getByText('尚未创建项目')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开设置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开节点' })).toBeTruthy();
  });

  it('routes issue actions to the matching panel', async () => {
    useWorkspaceStore.setState({ readiness: blockedResult });
    render(<ReadinessCenter />);
    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));
    expect(useWorkspaceStore.getState().activePanel).toBe('settings');
    fireEvent.click(screen.getByRole('button', { name: '打开节点' }));
    expect(useWorkspaceStore.getState().activePanel).toBe('nodes');
  });

  it('shows the ready state without issues', () => {
    useWorkspaceStore.setState({ readiness: readyResult });
    render(<ReadinessCenter />);
    expect(screen.getByText('所有条件已就绪，可以执行。')).toBeTruthy();
    expect(screen.queryByText('规划器未配置')).toBeNull();
  });
});
