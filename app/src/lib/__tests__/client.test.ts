import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoordinatorError, createApiClient } from '../client';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('CoordinatorClient', () => {
  it('normalizes the base URL and sends typed workflow updates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'workflow-1', project_id: 'project-1', version: 1, goal: 'Goal',
        planner_provider: null, planner_model: null, status: 'draft', graph_json: {},
        tasks: [], created_at: '2026-07-28T00:00:00Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('http://127.0.0.1:8000/');

    await client.updateWorkflow('workflow-1', { tasks: [], graph_json: { layout: 'manual' } });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/workflows/workflow-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ tasks: [], graph_json: { layout: 'manual' } }),
      }),
    );
  });

  it('loads the active workflow for a project', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'workflow-1', project_id: 'project-1', version: 1, goal: 'Goal',
      planner_provider: null, planner_model: null, status: 'draft', graph_json: {},
      tasks: [], created_at: '2026-07-28T00:00:00Z',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await createApiClient('http://127.0.0.1:8000').getProjectWorkflow('project/1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/projects/project%2F1/workflow',
      expect.any(Object),
    );
  });

  it('throws the structured server error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      error: {
        code: 'workflow_frozen',
        message: 'reviewed workflows cannot be edited',
        details: { workflow_id: 'workflow-1' },
      },
    }, 409)));

    const error = await createApiClient('http://127.0.0.1:8000')
      .reviewWorkflow('workflow-1')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CoordinatorError);
    expect(error).toMatchObject({
      status: 409,
      code: 'workflow_frozen',
      message: '工作流已审核冻结，不能继续编辑',
      details: { workflow_id: 'workflow-1' },
    });
  });

  it.each([
    { error: { code: 123, message: 'invalid code', details: {} } },
    { error: { code: 'invalid_message', message: 123, details: {} } },
    { error: { code: 'invalid_details', message: 'invalid details', details: 'not-an-object' } },
    { error: { code: 'null_details', message: 'invalid details', details: null } },
    { error: { code: 'array_details', message: 'invalid details', details: [] } },
  ])('rejects malformed structured error envelopes %#', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload, 400)));

    const error = await createApiClient('http://127.0.0.1:8000')
      .getProject('project-1')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CoordinatorError);
    expect(error).toMatchObject({ status: 400, code: 'http_error' });
  });

  it('filters forbidden fields from node PATCH payloads at the client boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const client = createApiClient('http://127.0.0.1:8000');

    await client.updateNode('node-1', {
      id: 'node-1', kind: 'local', name: 'Renamed', api_url: 'http://node.test',
      running_tasks: 9, success_rate: 0.5,
    } as never);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/nodes/node-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed', api_url: 'http://node.test' }),
      }),
    );
  });

  it('keeps planner credentials write-only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      base_url: 'https://planner.test/v1',
      model: 'planner-model',
      credential_key: 'planner.primary',
      credential_configured: true,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createApiClient('http://127.0.0.1:8000').setPlannerConfig({
      base_url: 'https://planner.test/v1',
      model: 'planner-model',
      credential_key: 'planner.primary',
      credential: 'secret-never-return',
    });

    expect(result).not.toHaveProperty('credential');
    expect(result.credential_configured).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/planner/config',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
