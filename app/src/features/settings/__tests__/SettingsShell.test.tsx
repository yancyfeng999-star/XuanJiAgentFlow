import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../lib/i18n';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import SettingsShell from '../SettingsShell';

afterEach(cleanup);

beforeEach(() => {
  useWorkspaceStore.getState().resetWorkspace();
});

describe('SettingsShell', () => {
  it('exposes six settings categories and switches the visible panel', () => {
    render(
      <I18nProvider>
        <SettingsShell />
      </I18nProvider>,
    );
    const names = ['外观', '思考模型', '节点与执行', '更新', '诊断与帮助', '关于'];
    for (const name of names) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: '外观' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '关于' }));
    expect(screen.getByRole('heading', { name: '关于' })).toBeInTheDocument();
  });
});
