import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import I18nProvider from '../../../lib/I18nProvider';
import { createUpdateService, setUpdateServiceForTests } from '../../../lib/updater';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import UpdateSettings from '../UpdateSettings';

afterEach(() => {
  cleanup();
  useWorkspaceStore.getState().resetWorkspace();
});

describe('UpdateSettings', () => {
  it('has a single check button and does not expose download or install actions', () => {
    setUpdateServiceForTests(createUpdateService({
      available: true,
      async check() {
        return { version: '0.3.5' };
      },
      async download() {},
      async install() {},
      async relaunch() {},
    }));
    render(<I18nProvider><UpdateSettings /></I18nProvider>);
    expect(screen.getByRole('button', { name: '检查更新' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '下载更新' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '安装并重启' })).not.toBeInTheDocument();
  });

  it('applies a found update and relaunches after check', async () => {
    const relaunch = vi.fn();
    setUpdateServiceForTests(createUpdateService({
      available: true,
      async check() {
        return { version: '0.3.5' };
      },
      async download() {},
      async install() {},
      relaunch,
    }));
    render(<I18nProvider><UpdateSettings /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
    await waitFor(() => expect(screen.getByTestId('update-state')).toHaveTextContent('restart_required'));
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it('does not download when a run is active', async () => {
    const download = vi.fn();
    useWorkspaceStore.setState({ runStatus: 'running' });
    setUpdateServiceForTests(createUpdateService({
      available: true,
      async check() {
        return { version: '0.3.5' };
      },
      download,
      async install() {},
      async relaunch() {},
    }));
    render(<I18nProvider><UpdateSettings /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
    await waitFor(() => expect(screen.getByTestId('update-state')).toHaveTextContent('run_blocked'));
    expect(download).not.toHaveBeenCalled();
  });
});
