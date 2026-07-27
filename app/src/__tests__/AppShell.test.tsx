import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AppShell from '../app/AppShell';
import { useWorkspaceStore } from '../store/workspaceStore';

beforeEach(() => {
  useWorkspaceStore.getState().resetWorkspace();
});

afterEach(cleanup);

describe('Xuanji 2.0 workspace shell', () => {
  it('renders exactly the four core workspace regions', () => {
    render(<AppShell />);

    expect(screen.getByRole('navigation', { name: '项目资源栏' })).toBeInTheDocument();
    expect(screen.getByRole('banner', { name: '顶部运行栏' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: '工作流画布' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '节点检查器' })).toBeInTheDocument();
    expect(screen.queryByText('传统流程')).not.toBeInTheDocument();
  });

  it('shows the selected canvas task definition in the inspector', () => {
    useWorkspaceStore.getState().selectTask('task-market');
    render(<AppShell />);

    expect(screen.getByRole('heading', { name: '市场规模调研' })).toBeInTheDocument();
    expect(screen.getByLabelText('任务 Prompt')).toHaveValue(
      '调研目标市场的规模、增长率与主要驱动因素。',
    );
  });

  it('shows run status and progress from the unified workspace store', () => {
    useWorkspaceStore.getState().setRunStatus('running');
    useWorkspaceStore.getState().setRunProgress(42);

    render(<AppShell />);

    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });
});
