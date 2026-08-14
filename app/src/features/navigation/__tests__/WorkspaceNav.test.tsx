import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../lib/i18n';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import WorkspaceNav from '../WorkspaceNav';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  useWorkspaceStore.getState().resetWorkspace();
  window.localStorage.clear();
});

function renderNav() {
  return render(
    <I18nProvider>
      <WorkspaceNav />
    </I18nProvider>,
  );
}

describe('WorkspaceNav', () => {
  it('renders five primary destinations with aria-current on the active item', () => {
    renderNav();
    const nav = screen.getByRole('navigation', { name: '工作区导航' });
    expect(nav).toBeInTheDocument();
    const labels = ['项目', '工作流', '节点', '思考模型', '设置'];
    const buttons = labels.map((label) => screen.getByRole('button', { name: label }));
    expect(buttons).toHaveLength(5);
    expect(screen.getByRole('button', { name: '工作流' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: '项目' }));
    expect(useWorkspaceStore.getState().activePanel).toBe('projects');
    expect(screen.getByRole('button', { name: '项目' })).toHaveAttribute('aria-current', 'page');
  });

  it('collapses to an icon rail and persists the preference', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: '折叠导航' }));
    expect(screen.getByRole('navigation', { name: '工作区导航' })).toHaveClass('is-collapsed');
    expect(window.localStorage.getItem('xuanji.workspace.nav-collapsed')).toBe('1');
    expect(screen.getByRole('button', { name: '展开导航' })).toBeInTheDocument();
  });
});
