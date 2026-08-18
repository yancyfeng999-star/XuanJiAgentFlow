import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoordinatorClient } from '../../../lib/client';
import I18nProvider from '../../../lib/I18nProvider';
import { setWorkspaceClient, useWorkspaceStore } from '../../../store/workspaceStore';
import ThinkingModels from '../ThinkingModels';

const client = {
  listThinkingModels: vi.fn().mockResolvedValue({ items: [] }),
  createThinkingModel: vi.fn().mockResolvedValue({
    id: 'tm-1', display_name: 'GPT', provider_kind: 'openai', api_mode: 'responses',
    base_url: 'https://api.openai.com/v1', model_id: 'gpt-5.4', credential_key: 'thinking-model.tm-1.api-key',
    enabled: true, is_default: true, reasoning_effort: null, credential_configured: true,
    last_test_status: 'untested', last_tested_at: null,
  }),
} as unknown as CoordinatorClient;

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  setWorkspaceClient(client);
  useWorkspaceStore.getState().resetWorkspace();
});

describe('ThinkingModels', () => {
  it('creates a default profile without echoing the key', async () => {
    render(<I18nProvider><ThinkingModels /></I18nProvider>);
    await screen.findByText('还没有思考模型。保存下方表单即可创建默认配置。');
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'GPT' } });
    fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'gpt-5.4' } });
    fireEvent.change(screen.getByLabelText('接口密钥（留空表示保留现有）'), { target: { value: 'sk-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存思考模型' }));
    await waitFor(() => expect(client.createThinkingModel).toHaveBeenCalled());
    expect(screen.queryByDisplayValue('sk-secret')).not.toBeInTheDocument();
  });
});
