import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoordinatorClient, Project, Workflow } from '../../lib/client';
import { createWorkspaceStore } from '../workspaceStore';

const project: Project = {
  id: 'project-1', name: 'Server project', root_path: '/tmp/project-1',
  active_workflow_version: 1, created_at: '2026-07-28T00:00:00Z', updated_at: '2026-07-28T00:00:00Z',
};

const workflow: Workflow = {
  id: 'workflow-1', project_id: 'project-1', version: 1, goal: 'Build report',
  planner_provider: null, planner_model: null, status: 'draft', graph_json: {},
  created_at: '2026-07-28T00:00:00Z',
  tasks: [
    {
      id: 'research', workflow_id: 'workflow-1', title: 'Research', description: '', prompt: '', agent_type: 'research', dependencies: [],
      execution_policy: { mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [], required_tags: [], timeout_seconds: 1800 },
      retry_policy: { max_attempts: 3, delay_seconds: 1 }, expected_outputs: [{ path: 'research.md', media_type: null }], ui_position: { x: 100, y: 100 },
    },
    {
      id: 'write', workflow_id: 'workflow-1', title: 'Write', description: '', prompt: '', agent_type: 'business', dependencies: ['research'],
      execution_policy: { mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [], required_tags: [], timeout_seconds: 1800 },
      retry_policy: { max_attempts: 3, delay_seconds: 1 }, expected_outputs: [{ path: 'report.md', media_type: null }], ui_position: { x: 440, y: 100 },
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

const makeClient = () => ({
  listProjects: vi.fn().mockResolvedValue([project]),
  getProject: vi.fn().mockResolvedValue(project),
  getProjectWorkflow: vi.fn().mockResolvedValue(workflow),
  getWorkflow: vi.fn().mockResolvedValue(workflow),
  plan: vi.fn().mockResolvedValue(workflow),
  updateWorkflow: vi.fn().mockImplementation(async (_id, payload) => ({ ...workflow, ...payload })),
  validateWorkflow: vi.fn().mockResolvedValue({ valid: true, topological_order: ['research', 'write'] }),
  reviewWorkflow: vi.fn().mockResolvedValue({ ...workflow, status: 'reviewed' }),
  createRun: vi.fn(), startRun: vi.fn(),
  listNodes: vi.fn().mockResolvedValue([]), createNode: vi.fn(), updateNode: vi.fn(), deleteNode: vi.fn(), diagnoseNode: vi.fn(), provisionNode: vi.fn(),
  getSecurityStatus: vi.fn().mockResolvedValue({ status: 'uninitialized' }), initializeSecurity: vi.fn(), unlockSecurity: vi.fn(), lockSecurity: vi.fn(), setCredential: vi.fn(),
  getPlannerConfig: vi.fn().mockResolvedValue({ base_url: null, model: null, credential_key: null, credential_configured: false }), setPlannerConfig: vi.fn(),
}) as unknown as CoordinatorClient;

describe('workspace store', () => {
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => { client = makeClient(); });

  it('loads the project and its active workflow without seeded business data', async () => {
    const store = createWorkspaceStore(() => client);
    expect(store.getState().project).toBeNull();
    expect(store.getState().workflow).toBeNull();

    await store.getState().loadProjects();
    await store.getState().loadProject('project-1');

    expect(store.getState().projects).toEqual([project]);
    expect(store.getState().project?.name).toBe('Server project');
    expect(store.getState().workflow?.id).toBe('workflow-1');
    expect(client.getProjectWorkflow).toHaveBeenCalledWith('project-1');
  });

  it('replaces the active workflow after planning', async () => {
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');

    await store.getState().plan({ goal: 'Build report' });

    expect(store.getState().workflow?.id).toBe('workflow-1');
    expect(client.plan).toHaveBeenCalledWith('project-1', { goal: 'Build report' });
  });

  it('updates tasks and persists valid connections', async () => {
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');
    await store.getState().plan({ goal: 'Build report' });

    await store.getState().updateTask('research', { title: 'Investigate' });
    await store.getState().disconnectTasks('research', 'write');
    await store.getState().connectTasks('write', 'research');

    expect(store.getState().workflow?.tasks[0].title).toBe('Investigate');
    expect(store.getState().workflow?.tasks[0].dependencies).toContain('write');
    expect(client.updateWorkflow).toHaveBeenCalledTimes(3);
  });

  it('removes multiple edges in one persisted workflow update', async () => {
    const multiDependencyWorkflow = {
      ...workflow,
      tasks: [
        ...workflow.tasks,
        {
          ...workflow.tasks[1],
          id: 'publish',
          title: 'Publish',
          dependencies: ['research', 'write'],
        },
      ],
    };
    vi.mocked(client.getProjectWorkflow).mockResolvedValue(multiDependencyWorkflow);
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');

    await store.getState().disconnectTaskEdges([
      { source: 'research', target: 'publish' },
      { source: 'write', target: 'publish' },
    ]);

    expect(client.updateWorkflow).toHaveBeenCalledOnce();
    expect(store.getState().workflow?.tasks.find((task) => task.id === 'publish')?.dependencies).toEqual([]);
  });

  it('adds and removes tasks while cleaning dependent edges', async () => {
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');

    await store.getState().addTask();
    const added = store.getState().workflow?.tasks.at(-1);
    expect(added).toMatchObject({ id: 'task-1', workflow_id: 'workflow-1', title: '新任务', dependencies: [] });

    await store.getState().removeTask('research');
    expect(store.getState().workflow?.tasks.map((task) => task.id)).toEqual(['write', 'task-1']);
    expect(store.getState().workflow?.tasks.find((task) => task.id === 'write')?.dependencies).toEqual([]);
    expect(client.updateWorkflow).toHaveBeenCalledTimes(2);
  });

  it('blocks adding and removing tasks after review', async () => {
    vi.mocked(client.getProjectWorkflow).mockResolvedValue({ ...workflow, status: 'reviewed' });
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');

    await store.getState().addTask();
    await store.getState().removeTask('research');

    expect(client.updateWorkflow).not.toHaveBeenCalled();
    expect(store.getState().workflow?.tasks).toEqual(workflow.tasks);
    expect(store.getState().error).toMatchObject({ code: 'workflow_frozen' });
  });

  it('detects a cycle before sending it to the server', async () => {
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');
    await store.getState().plan({ goal: 'Build report' });

    await store.getState().connectTasks('write', 'research');

    expect(store.getState().error).toMatchObject({ code: 'workflow_cycle' });
    expect(client.updateWorkflow).not.toHaveBeenCalled();
  });

  it('sends only updateable fields when saving an existing node', async () => {
    const existingNode = {
      id: 'node-1', name: 'Old Node', kind: 'local' as const, api_url: 'http://old.test',
      ssh_host: null, ssh_port: null, ssh_user: null, ssh_key_path: null, status: 'online' as const,
      capabilities_json: {}, max_concurrency: 1, running_tasks: 3, success_rate: 0.8,
      last_seen_at: null, credential_configured: true,
    };
    vi.mocked(client.listNodes).mockResolvedValue([existingNode]);
    vi.mocked(client.updateNode).mockResolvedValue({ ...existingNode, name: 'New Node' });
    const store = createWorkspaceStore(() => client);
    await store.getState().loadNodes();

    await store.getState().saveNode({
      id: 'node-1', name: 'New Node', kind: 'local', api_url: 'http://new.test',
      running_tasks: 9, success_rate: 0.2,
    });

    expect(client.updateNode).toHaveBeenCalledWith('node-1', {
      name: 'New Node', api_url: 'http://new.test',
    });
  });

  it('ignores stale project responses after a newer project selection', async () => {
    let resolveOldProject!: (value: Project) => void;
    let resolveOldWorkflow!: (value: Workflow | null) => void;
    const newerProject = { ...project, id: 'project-2', name: 'New Project' };
    const newerWorkflow = { ...workflow, id: 'workflow-2', project_id: 'project-2' };
    vi.mocked(client.getProject)
      .mockReturnValueOnce(new Promise((resolve) => { resolveOldProject = resolve; }))
      .mockResolvedValueOnce(newerProject);
    vi.mocked(client.getProjectWorkflow)
      .mockReturnValueOnce(new Promise((resolve) => { resolveOldWorkflow = resolve; }))
      .mockResolvedValueOnce(newerWorkflow);
    const store = createWorkspaceStore(() => client);

    const oldLoad = store.getState().loadProject('project-1');
    await store.getState().loadProject('project-2');
    resolveOldProject(project);
    resolveOldWorkflow(workflow);
    await oldLoad;

    expect(store.getState().project?.id).toBe('project-2');
    expect(store.getState().workflow?.id).toBe('workflow-2');
  });

  it('ignores stale project lists after the coordinator changes', async () => {
    let resolveProjects!: (value: Project[]) => void;
    vi.mocked(client.listProjects).mockReturnValue(new Promise((resolve) => { resolveProjects = resolve; }));
    const store = createWorkspaceStore(() => client);

    const loading = store.getState().loadProjects();
    store.getState().setCoordinatorBaseUrl('http://127.0.0.1:9000');
    resolveProjects([project]);
    await loading;

    expect(store.getState().projects).toEqual([]);
  });

  it('ignores a late plan response after selecting a newer project', async () => {
    const latePlan = deferred<Workflow>();
    const newerProject = { ...project, id: 'project-2', name: 'New Project' };
    const newerWorkflow = { ...workflow, id: 'workflow-2', project_id: 'project-2', goal: 'New goal' };
    vi.mocked(client.plan).mockReturnValue(latePlan.promise);
    vi.mocked(client.getProject).mockResolvedValueOnce(project).mockResolvedValueOnce(newerProject);
    vi.mocked(client.getProjectWorkflow).mockResolvedValueOnce(workflow).mockResolvedValueOnce(newerWorkflow);
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');

    const planning = store.getState().plan({ goal: 'Old goal' });
    await store.getState().loadProject('project-2');
    latePlan.resolve({ ...workflow, goal: 'Old goal' });
    await planning;

    expect(store.getState().project?.id).toBe('project-2');
    expect(store.getState().workflow?.id).toBe('workflow-2');
  });

  it('ignores a late workflow edit after selecting a newer project', async () => {
    const lateEdit = deferred<Workflow>();
    const newerProject = { ...project, id: 'project-2', name: 'New Project' };
    const newerWorkflow = { ...workflow, id: 'workflow-2', project_id: 'project-2', goal: 'New goal' };
    vi.mocked(client.updateWorkflow).mockReturnValue(lateEdit.promise);
    vi.mocked(client.getProject).mockResolvedValueOnce(project).mockResolvedValueOnce(newerProject);
    vi.mocked(client.getProjectWorkflow).mockResolvedValueOnce(workflow).mockResolvedValueOnce(newerWorkflow);
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');

    const editing = store.getState().updateTask('research', { title: 'Late edit' });
    await store.getState().loadProject('project-2');
    lateEdit.resolve({ ...workflow, tasks: [{ ...workflow.tasks[0], title: 'Late edit' }, workflow.tasks[1]] });
    await editing;

    expect(store.getState().project?.id).toBe('project-2');
    expect(store.getState().workflow?.id).toBe('workflow-2');
  });

  it('ignores stale nodes after the coordinator changes', async () => {
    const lateNodes = deferred<Awaited<ReturnType<CoordinatorClient['listNodes']>>>();
    vi.mocked(client.listNodes).mockReturnValue(lateNodes.promise);
    const store = createWorkspaceStore(() => client);

    const loading = store.getState().loadNodes();
    store.getState().setCoordinatorBaseUrl('http://127.0.0.1:9000');
    lateNodes.resolve([{
      id: 'old-node', name: 'Old Node', kind: 'local', api_url: 'http://old.test',
      ssh_host: null, ssh_port: null, ssh_user: null, ssh_key_path: null, status: 'online',
      capabilities_json: {}, max_concurrency: 1, running_tasks: 0, success_rate: 1,
      last_seen_at: null, credential_configured: true,
    }]);
    await loading;

    expect(store.getState().hermesNodes).toEqual([]);
    expect(store.getState().selectedTaskId).toBeNull();
    expect(store.getState().loading).toBe(false);
  });

  it('reports failed node provisioning without treating HTTP 200 as success', async () => {
    vi.mocked(client.provisionNode).mockResolvedValue({
      node_id: 'remote-1',
      completed: false,
      steps: [{ step: 'verify_api_server', online: false }],
    });
    const store = createWorkspaceStore(() => client);

    await store.getState().provisionNode('remote-1', 8642);

    expect(store.getState().error).toMatchObject({
      code: 'provision_failed',
      message: '节点部署未通过最终验证',
    });
    expect(store.getState().error?.details).toMatchObject({
      steps: [{ step: 'verify_api_server', online: false }],
    });
  });

  it('does not start an old run with a new coordinator client', async () => {
    const run = {
      id: 'old-run', workflow_id: 'workflow-1', status: 'pending', started_at: null,
      completed_at: null, created_at: '2026-07-28T00:00:00Z', attempts: [],
    };
    const lateRun = deferred<typeof run>();
    const oldClient = makeClient();
    const newClient = makeClient();
    vi.mocked(oldClient.getProjectWorkflow).mockResolvedValue({ ...workflow, status: 'reviewed' });
    vi.mocked(oldClient.createRun).mockReturnValue(lateRun.promise);
    let activeClient = oldClient;
    const store = createWorkspaceStore(() => activeClient);
    await store.getState().loadProject('project-1');

    const executing = store.getState().executeWorkflow();
    activeClient = newClient;
    store.getState().setCoordinatorBaseUrl('http://127.0.0.1:9000');
    lateRun.resolve(run);
    await executing;

    expect(oldClient.startRun).not.toHaveBeenCalled();
    expect(newClient.startRun).not.toHaveBeenCalled();
    expect(store.getState().run).toBeNull();
  });

  it('keeps simple run status and progress actions without seeded business data', () => {
    const store = createWorkspaceStore(() => client);

    store.getState().setRunStatus('running');
    store.getState().setRunProgress(142);

    expect(store.getState().runStatus).toBe('running');
    expect(store.getState().runProgress).toBe(100);
    expect(store.getState().run).toBeNull();
    expect(store.getState().project).toBeNull();
    expect(store.getState().workflow).toBeNull();
  });

  it('does not let an older settings load overwrite a completed security action', async () => {
    let resolveStatus!: (value: { status: 'uninitialized' }) => void;
    vi.mocked(client.getSecurityStatus).mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    vi.mocked(client.initializeSecurity).mockResolvedValue({ status: 'unlocked' });
    const store = createWorkspaceStore(() => client);

    const loading = store.getState().loadSettings();
    await store.getState().initializeSecurity('master-password');
    resolveStatus({ status: 'uninitialized' });
    await loading;

    expect(store.getState().securityStatus).toBe('unlocked');
  });

  it('refreshes redacted planner configuration after saving credentials', async () => {
    const store = createWorkspaceStore(() => client);
    const redactedConfig = {
      base_url: 'https://planner.test/v1', model: 'planner-model', credential_key: 'planner.primary', credential_configured: true,
    };
    vi.mocked(client.setPlannerConfig).mockResolvedValue(redactedConfig);
    vi.mocked(client.getPlannerConfig).mockResolvedValue(redactedConfig);

    await store.getState().savePlannerConfig({
      base_url: redactedConfig.base_url,
      model: redactedConfig.model,
      credential_key: redactedConfig.credential_key,
      credential: 'secret',
    });

    expect(client.setPlannerConfig).toHaveBeenCalledOnce();
    expect(client.getPlannerConfig).toHaveBeenCalledOnce();
    expect(store.getState().plannerConfig).toEqual(redactedConfig);
  });

  it('does not let an older settings load overwrite a saved planner configuration', async () => {
    let resolveOldConfig!: (value: typeof oldConfig) => void;
    const oldConfig = { base_url: 'https://old.test/v1', model: 'old', credential_key: 'old', credential_configured: false };
    const savedConfig = { base_url: 'https://new.test/v1', model: 'new', credential_key: 'new', credential_configured: true };
    vi.mocked(client.getPlannerConfig)
      .mockReturnValueOnce(new Promise((resolve) => { resolveOldConfig = resolve; }))
      .mockResolvedValueOnce(savedConfig);
    vi.mocked(client.setPlannerConfig).mockResolvedValue(savedConfig);
    const store = createWorkspaceStore(() => client);

    const loading = store.getState().loadSettings();
    await store.getState().savePlannerConfig({
      base_url: savedConfig.base_url,
      model: savedConfig.model,
      credential_key: savedConfig.credential_key,
      credential: 'secret',
    });
    resolveOldConfig(oldConfig);
    await loading;

    expect(store.getState().plannerConfig).toEqual(savedConfig);
  });

  it('invalidates an older settings response when the coordinator URL changes', async () => {
    let resolveConfig!: (value: typeof oldConfig) => void;
    const oldConfig = { base_url: 'https://old.test/v1', model: 'old', credential_key: 'old', credential_configured: true };
    vi.mocked(client.getPlannerConfig).mockReturnValue(new Promise((resolve) => { resolveConfig = resolve; }));
    const store = createWorkspaceStore(() => client);

    const loading = store.getState().loadSettings();
    store.getState().setCoordinatorBaseUrl('http://127.0.0.1:9000');
    resolveConfig(oldConfig);
    await loading;

    expect(store.getState().plannerConfig).toEqual({ base_url: null, model: null, credential_key: null, credential_configured: false });
  });

  it('invalidates an older settings response when the workspace resets', async () => {
    let resolveConfig!: (value: typeof oldConfig) => void;
    const oldConfig = { base_url: 'https://old.test/v1', model: 'old', credential_key: 'old', credential_configured: true };
    vi.mocked(client.getPlannerConfig).mockReturnValue(new Promise((resolve) => { resolveConfig = resolve; }));
    const store = createWorkspaceStore(() => client);

    const loading = store.getState().loadSettings();
    store.getState().resetWorkspace();
    resolveConfig(oldConfig);
    await loading;

    expect(store.getState().plannerConfig).toEqual({ base_url: null, model: null, credential_key: null, credential_configured: false });
  });

  it('freezes editing after review and gates execution until reviewed', async () => {
    const store = createWorkspaceStore(() => client);
    await store.getState().loadProject('project-1');
    await store.getState().plan({ goal: 'Build report' });

    expect(store.getState().canExecute).toBe(false);
    await store.getState().reviewWorkflow();
    expect(store.getState().canExecute).toBe(true);

    await store.getState().updateTask('research', { title: 'Blocked edit' });
    expect(store.getState().workflow?.tasks[0].title).toBe('Research');
    expect(store.getState().error).toMatchObject({ code: 'workflow_frozen' });
  });
});
