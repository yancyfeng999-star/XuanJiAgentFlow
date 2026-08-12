import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoordinatorClient } from '../../../lib/client';
import { setWorkspaceClient, useWorkspaceStore } from '../../../store/workspaceStore';
import NodeSetupWizard from '../NodeSetupWizard';

const client = {
  listNodes: vi.fn().mockResolvedValue([]),
  createNode: vi.fn().mockImplementation(async (value) => ({
    ...value, status: 'unknown', capabilities_json: {}, max_concurrency: 1,
    running_tasks: 0, success_rate: 1, last_seen_at: null,
    credential_configured: Boolean(value.credential),
  })),
  updateNode: vi.fn(),
  discoverLocalNode: vi.fn().mockResolvedValue({ found: true, path: '/usr/local/bin/hermes', version: null }),
  getReadiness: vi.fn(),
} as unknown as CoordinatorClient;

beforeEach(() => {
  vi.clearAllMocks();
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
});
afterEach(cleanup);

describe('NodeSetupWizard', () => {
  it('starts with an explicit local/remote choice', () => {
    render(<NodeSetupWizard />);
    expect(screen.getByRole('button', { name: /本机节点/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /远程节点/ })).toBeTruthy();
    expect(screen.queryByLabelText('远程连接主机地址')).toBeNull();
  });

  it('local path triggers discovery and saves a local node', async () => {
    render(<NodeSetupWizard />);
    fireEvent.click(screen.getByRole('button', { name: /本机节点/ }));
    await waitFor(() => expect(client.discoverLocalNode).toHaveBeenCalled());
    await screen.findByText(/已发现本机 Hermes/);
    fireEvent.change(screen.getByLabelText('节点标识'), { target: { value: 'mac-local' } });
    fireEvent.change(screen.getByLabelText('节点访问密钥'), { target: { value: 'tok' } });
    fireEvent.click(screen.getByRole('button', { name: '保存节点' }));
    await waitFor(() => expect(client.createNode).toHaveBeenCalledWith(expect.objectContaining({
      id: 'mac-local', kind: 'local', credential: 'tok',
    })));
  });

  it('remote path collects ssh fields including key path', async () => {
    render(<NodeSetupWizard />);
    fireEvent.click(screen.getByRole('button', { name: /远程节点/ }));
    fireEvent.change(screen.getByLabelText('节点标识'), { target: { value: 'remote-1' } });
    fireEvent.change(screen.getByLabelText('节点名称'), { target: { value: 'Remote' } });
    fireEvent.change(screen.getByLabelText('节点地址'), { target: { value: 'http://remote.test:8642' } });
    fireEvent.change(screen.getByLabelText('远程连接主机地址'), { target: { value: 'remote.test' } });
    fireEvent.change(screen.getByLabelText('远程连接私钥路径'), { target: { value: '/keys/id_ed25519' } });
    fireEvent.click(screen.getByRole('button', { name: '保存节点' }));
    await waitFor(() => expect(client.createNode).toHaveBeenCalledWith(expect.objectContaining({
      id: 'remote-1', kind: 'remote', ssh_host: 'remote.test', ssh_key_path: '/keys/id_ed25519',
    })));
  });

  it('back button returns to the choice step', () => {
    render(<NodeSetupWizard />);
    fireEvent.click(screen.getByRole('button', { name: /远程节点/ }));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.getByRole('button', { name: /本机节点/ })).toBeTruthy();
  });
});
