import { useStore, type StoreApi, type UseBoundStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import {
  CoordinatorError,
  createApiClient,
  nodeUpdatePayload,
  type CoordinatorClient,
  type HermesNode,
  type NodeInput,
  type PlanInput,
  type PlannerConfig,
  type PlannerConfigInput,
  type Project,
  type Run,
  type SecurityStatus,
  type TaskAttempt,
  type Workflow,
  type WorkflowTask,
} from '../lib/client';

export interface WorkspaceError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type WorkspacePanel = 'workflow' | 'nodes' | 'settings';
export type RunStatus = 'idle' | 'accepted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'pending' | 'success' | 'cancelling';

type TaskChanges = Partial<Omit<WorkflowTask, 'id' | 'workflow_id' | 'dependencies'>>;

export interface MonitorUpdate {
  lastEventId?: number;
  runStatus?: string;
  runProgress?: number;
  taskAttempts?: Record<string, TaskAttempt>;
  run?: Run | null;
}

export interface WorkspaceState {
  coordinatorBaseUrl: string;
  projects: Project[];
  project: Project | null;
  workflow: Workflow | null;
  run: Run | null;
  runStatus: RunStatus;
  runProgress: number;
  lastEventId: number;
  taskAttempts: Record<string, TaskAttempt>;
  hermesNodes: HermesNode[];
  selectedTaskId: string | null;
  activePanel: WorkspacePanel;
  securityStatus: SecurityStatus;
  plannerConfig: PlannerConfig;
  loading: boolean;
  error: WorkspaceError | null;
  canExecute: boolean;
  setCoordinatorBaseUrl: (baseUrl: string) => void;
  selectTask: (taskId: string | null) => void;
  setActivePanel: (panel: WorkspacePanel) => void;
  setRunStatus: (status: RunStatus) => void;
  setRunProgress: (progress: number) => void;
  applyRunMonitor: (update: MonitorUpdate) => void;
  setControlError: (error: WorkspaceError | null) => void;
  clearError: () => void;
  loadProjects: () => Promise<void>;
  createProject: (name: string, rootPath?: string) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  plan: (input: PlanInput) => Promise<void>;
  updateTask: (taskId: string, changes: TaskChanges) => Promise<void>;
  addTask: () => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
  connectTasks: (sourceTaskId: string, targetTaskId: string) => Promise<void>;
  disconnectTasks: (sourceTaskId: string, targetTaskId: string) => Promise<void>;
  disconnectTaskEdges: (edges: Array<{ source: string; target: string }>) => Promise<void>;
  reviewWorkflow: () => Promise<void>;
  executeWorkflow: () => Promise<void>;
  pauseRun: () => Promise<void>;
  resumeRun: () => Promise<void>;
  cancelRun: () => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  skipTask: (taskId: string) => Promise<void>;
  refreshRun: () => Promise<void>;
  loadNodes: () => Promise<void>;
  saveNode: (input: NodeInput) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  provisionNode: (nodeId: string, hermesPort: number) => Promise<void>;
  loadSettings: () => Promise<void>;
  initializeSecurity: (password: string) => Promise<void>;
  unlockSecurity: (password: string) => Promise<void>;
  lockSecurity: () => Promise<void>;
  savePlannerConfig: (input: PlannerConfigInput) => Promise<void>;
  resetWorkspace: () => void;
}

const emptyPlannerConfig: PlannerConfig = {
  base_url: null,
  model: null,
  credential_key: null,
  credential_configured: false,
};

const initialState = {
  coordinatorBaseUrl: 'http://127.0.0.1:8000',
  projects: [] as Project[],
  project: null as Project | null,
  workflow: null as Workflow | null,
  run: null as Run | null,
  runStatus: 'idle' as RunStatus,
  runProgress: 0,
  lastEventId: 0,
  taskAttempts: {} as Record<string, TaskAttempt>,
  hermesNodes: [] as HermesNode[],
  selectedTaskId: null as string | null,
  activePanel: 'workflow' as WorkspacePanel,
  securityStatus: 'uninitialized' as SecurityStatus,
  plannerConfig: emptyPlannerConfig,
  loading: false,
  error: null as WorkspaceError | null,
  canExecute: false,
};

function toRunStatus(status: string | undefined | null): RunStatus {
  switch (status) {
    case 'pending':
      return 'accepted';
    case 'success':
      return 'completed';
    case 'cancelling':
      return 'cancelled';
    case 'blocked':
      return 'failed';
    case 'accepted':
    case 'running':
    case 'paused':
    case 'completed':
    case 'failed':
    case 'cancelled':
    case 'idle':
      return status;
    default:
      return (status as RunStatus) || 'idle';
  }
}

function attemptsByTask(attempts: TaskAttempt[]): Record<string, TaskAttempt> {
  const latest: Record<string, TaskAttempt> = {};
  for (const attempt of attempts) {
    const previous = latest[attempt.task_id];
    if (!previous || attempt.attempt >= previous.attempt) latest[attempt.task_id] = attempt;
  }
  return latest;
}

function workspaceError(error: unknown): WorkspaceError {
  if (error instanceof CoordinatorError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return {
    code: 'client_error',
    message: error instanceof Error ? error.message : 'Unexpected workspace error',
    details: {},
  };
}

function cycleIn(tasks: WorkflowTask[]): boolean {
  const dependencies = new Map(tasks.map((task) => [task.id, task.dependencies]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(taskId: string): boolean {
    if (visiting.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    visiting.add(taskId);
    for (const dependency of dependencies.get(taskId) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  }

  return tasks.some((task) => visit(task.id));
}

function editable(workflow: Workflow | null): workflow is Workflow {
  return workflow?.status === 'draft';
}

let workspaceClient: CoordinatorClient = createApiClient(initialState.coordinatorBaseUrl);

export function setWorkspaceClient(client: CoordinatorClient): void {
  workspaceClient = client;
}

export function getWorkspaceClient(): CoordinatorClient {
  return workspaceClient;
}

export function createWorkspaceStore(getClient: () => CoordinatorClient = () => workspaceClient) {
  return createStore<WorkspaceState>((set, get) => {
    let settingsRequest = 0;
    let workspaceRequest = 0;
    let generation = 0;
    let selectionGeneration = 0;
    let workflowRequest = 0;
    let nodesRequest = 0;
    const nodeRequests = new Map<string, number>();
    const fail = (error: unknown) => set({ error: workspaceError(error), loading: false });
    const currentWorkspace = (snapshot: number) => snapshot === generation;
    const currentSelection = (workspace: number, selection: number, projectId: string, workflowId?: string) => {
      const state = get();
      return currentWorkspace(workspace)
        && selection === selectionGeneration
        && state.project?.id === projectId
        && (workflowId === undefined || state.workflow?.id === workflowId);
    };

    const persistTasks = async (tasks: WorkflowTask[]) => {
      const client = getClient();
      const workspace = generation;
      const selection = selectionGeneration;
      const request = ++workflowRequest;
      const projectId = get().project?.id;
      const workflow = get().workflow;
      if (!editable(workflow)) {
        set({ error: { code: 'workflow_frozen', message: '已审核的工作流不可编辑', details: {} } });
        return;
      }
      if (cycleIn(tasks)) {
        set({ error: { code: 'workflow_cycle', message: '连接会形成环，请调整任务依赖', details: {} } });
        return;
      }
      if (!projectId) return;
      set({ loading: true, error: null });
      try {
        const updated = await client.updateWorkflow(workflow.id, {
          tasks,
          graph_json: workflow.graph_json,
        });
        if (request === workflowRequest && currentSelection(workspace, selection, projectId, workflow.id)) {
          set({ workflow: updated, loading: false, canExecute: updated.status === 'reviewed' });
        }
      } catch (error) {
        if (request === workflowRequest && currentSelection(workspace, selection, projectId, workflow.id)) fail(error);
      }
    };

    return {
      ...initialState,
      setCoordinatorBaseUrl: (coordinatorBaseUrl) => {
        const normalized = coordinatorBaseUrl.trim().replace(/\/+$/, '');
        const current = get().coordinatorBaseUrl.trim().replace(/\/+$/, '');
        if (normalized === current) {
          return;
        }
        settingsRequest += 1;
        workspaceRequest += 1;
        generation += 1;
        selectionGeneration += 1;
        workflowRequest += 1;
        nodesRequest += 1;
        nodeRequests.clear();
        workspaceClient = createApiClient(normalized);
        set({
          coordinatorBaseUrl: normalized,
          projects: [],
          project: null,
          workflow: null,
          run: null,
          lastEventId: 0,
          taskAttempts: {},
          runStatus: 'idle',
          runProgress: 0,
          hermesNodes: [],
          selectedTaskId: null,
          plannerConfig: { ...emptyPlannerConfig },
          securityStatus: 'uninitialized',
          loading: false,
          error: null,
          canExecute: false,
        });
      },
      selectTask: (selectedTaskId) => set({ selectedTaskId }),
      setActivePanel: (activePanel) => set({ activePanel }),
      setRunStatus: (runStatus) => set({ runStatus }),
      setRunProgress: (runProgress) => set({ runProgress: Math.max(0, Math.min(100, runProgress)) }),
      applyRunMonitor: (update) => set((state) => ({
        lastEventId: update.lastEventId ?? state.lastEventId,
        runStatus: update.runStatus ? toRunStatus(update.runStatus) : state.runStatus,
        runProgress: update.runProgress === undefined
          ? state.runProgress
          : Math.max(0, Math.min(100, update.runProgress)),
        taskAttempts: update.taskAttempts
          ? { ...state.taskAttempts, ...update.taskAttempts }
          : state.taskAttempts,
        run: update.run === undefined ? state.run : update.run,
      })),
      setControlError: (error) => set({ error }),
      clearError: () => set({ error: null }),
      loadProjects: async () => {
        const client = getClient();
        const workspace = generation;
        const request = ++workspaceRequest;
        set({ loading: true, error: null });
        try {
          const projects = await client.listProjects();
          if (currentWorkspace(workspace) && request === workspaceRequest) set({ projects, loading: false });
        } catch (error) {
          if (currentWorkspace(workspace) && request === workspaceRequest) fail(error);
        }
      },
      createProject: async (name, rootPath) => {
        const client = getClient();
        const workspace = generation;
        const request = ++workspaceRequest;
        set({ loading: true, error: null });
        try {
          const project = await client.createProject({ name, ...(rootPath ? { root_path: rootPath } : {}) });
          if (!currentWorkspace(workspace) || request !== workspaceRequest) return;
          set((state) => ({ projects: [...state.projects, project], loading: false }));
          await get().loadProject(project.id);
        } catch (error) {
          if (currentWorkspace(workspace) && request === workspaceRequest) fail(error);
        }
      },
      loadProject: async (projectId) => {
        const client = getClient();
        const workspace = generation;
        const request = ++workspaceRequest;
        const selection = ++selectionGeneration;
        workflowRequest += 1;
        set({
          loading: true,
          error: null,
          selectedTaskId: null,
          workflow: null,
          run: null,
          lastEventId: 0,
          taskAttempts: {},
          runStatus: 'idle',
          runProgress: 0,
          canExecute: false,
        });
        try {
          const [project, workflow] = await Promise.all([
            client.getProject(projectId),
            client.getProjectWorkflow(projectId),
          ]);
          if (currentWorkspace(workspace) && request === workspaceRequest && selection === selectionGeneration) {
            set({ project, workflow, loading: false, canExecute: workflow?.status === 'reviewed' });
          }
        } catch (error) {
          if (currentWorkspace(workspace) && request === workspaceRequest && selection === selectionGeneration) fail(error);
        }
      },
      plan: async (input) => {
        const client = getClient();
        const workspace = generation;
        const selection = selectionGeneration;
        const request = ++workflowRequest;
        const project = get().project;
        if (!project) {
          set({ error: { code: 'project_required', message: '请先选择项目', details: {} } });
          return;
        }
        set({ loading: true, error: null });
        try {
          const workflow = await client.plan(project.id, input);
          if (!currentSelection(workspace, selection, project.id) || request !== workflowRequest) return;
          set((state) => ({
            workflow,
            project: state.project?.id === project.id ? { ...state.project, active_workflow_version: workflow.version } : state.project,
            loading: false,
            selectedTaskId: null,
            canExecute: false,
          }));
        } catch (error) {
          if (currentSelection(workspace, selection, project.id) && request === workflowRequest) fail(error);
        }
      },
      updateTask: async (taskId, changes) => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: '已审核的工作流不可编辑', details: {} } });
          return;
        }
        await persistTasks(workflow.tasks.map((task) => task.id === taskId ? { ...task, ...changes } : task));
      },
      addTask: async () => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: '已审核的工作流不可编辑', details: {} } });
          return;
        }
        const ids = new Set(workflow.tasks.map((task) => task.id));
        let number = 1;
        while (ids.has(`task-${number}`)) number += 1;
        await persistTasks([...workflow.tasks, {
          id: `task-${number}`,
          workflow_id: workflow.id,
          title: '新任务',
          description: '',
          prompt: '',
          agent_type: 'general',
          dependencies: [],
          execution_policy: {
            mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [], required_tags: [], timeout_seconds: 1800,
          },
          retry_policy: { max_attempts: 3, delay_seconds: 1 },
          expected_outputs: [],
          ui_position: { x: 80 + workflow.tasks.length * 40, y: 80 + workflow.tasks.length * 40 },
        }]);
      },
      removeTask: async (taskId) => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: '已审核的工作流不可编辑', details: {} } });
          return;
        }
        await persistTasks(workflow.tasks
          .filter((task) => task.id !== taskId)
          .map((task) => ({ ...task, dependencies: task.dependencies.filter((dependency) => dependency !== taskId) })));
        if (get().selectedTaskId === taskId) set({ selectedTaskId: null });
      },
      connectTasks: async (sourceTaskId, targetTaskId) => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: '已审核的工作流不可编辑', details: {} } });
          return;
        }
        const tasks = workflow.tasks.map((task) => task.id === targetTaskId && !task.dependencies.includes(sourceTaskId)
          ? { ...task, dependencies: [...task.dependencies, sourceTaskId] }
          : task);
        await persistTasks(tasks);
      },
      disconnectTasks: async (sourceTaskId, targetTaskId) => {
        await get().disconnectTaskEdges([{ source: sourceTaskId, target: targetTaskId }]);
      },
      disconnectTaskEdges: async (edges) => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: '已审核的工作流不可编辑', details: {} } });
          return;
        }
        const removedByTarget = new Map<string, Set<string>>();
        for (const edge of edges) {
          const sources = removedByTarget.get(edge.target) ?? new Set<string>();
          sources.add(edge.source);
          removedByTarget.set(edge.target, sources);
        }
        const tasks = workflow.tasks.map((task) => {
          const removed = removedByTarget.get(task.id);
          return removed
            ? { ...task, dependencies: task.dependencies.filter((dependency) => !removed.has(dependency)) }
            : task;
        });
        await persistTasks(tasks);
      },
      reviewWorkflow: async () => {
        const client = getClient();
        const workspace = generation;
        const selection = selectionGeneration;
        const request = ++workflowRequest;
        const projectId = get().project?.id;
        const workflow = get().workflow;
        if (!projectId || !workflow) return;
        set({ loading: true, error: null });
        try {
          await client.validateWorkflow(workflow.id);
          if (!currentSelection(workspace, selection, projectId, workflow.id) || request !== workflowRequest) return;
          const reviewed = await client.reviewWorkflow(workflow.id);
          if (currentSelection(workspace, selection, projectId, workflow.id) && request === workflowRequest) {
            set({ workflow: reviewed, loading: false, canExecute: reviewed.status === 'reviewed' });
          }
        } catch (error) {
          if (currentSelection(workspace, selection, projectId, workflow.id) && request === workflowRequest) fail(error);
        }
      },
      executeWorkflow: async () => {
        const client = getClient();
        const workspace = generation;
        const selection = selectionGeneration;
        const request = ++workflowRequest;
        const projectId = get().project?.id;
        const workflow = get().workflow;
        if (!projectId || !workflow || workflow.status !== 'reviewed') {
          set({ error: { code: 'workflow_not_reviewed', message: '工作流审核后才能执行', details: {} } });
          return;
        }
        set({ loading: true, error: null });
        try {
          const run = await client.createRun(workflow.id);
          if (!currentSelection(workspace, selection, projectId, workflow.id) || request !== workflowRequest) return;
          await client.startRun(run.id);
          if (currentSelection(workspace, selection, projectId, workflow.id) && request === workflowRequest) {
            set({
              run: { ...run, status: 'accepted' },
              runStatus: 'accepted',
              runProgress: 0,
              lastEventId: 0,
              taskAttempts: attemptsByTask(run.attempts ?? []),
              loading: false,
            });
          }
        } catch (error) {
          if (currentSelection(workspace, selection, projectId, workflow.id) && request === workflowRequest) fail(error);
        }
      },
      pauseRun: async () => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        set({ loading: true, error: null });
        try {
          const updated = await client.pauseRun(runId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: toRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
              loading: false,
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        }
      },
      resumeRun: async () => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        set({ loading: true, error: null });
        try {
          const updated = await client.resumeRun(runId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: toRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
              loading: false,
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        }
      },
      cancelRun: async () => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        set({ loading: true, error: null });
        try {
          const updated = await client.cancelRun(runId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: toRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
              loading: false,
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        }
      },
      retryTask: async (taskId) => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        set({ loading: true, error: null });
        try {
          const attempt = await client.retryTask(runId, taskId);
          if (get().run?.id === runId) {
            set((state) => ({
              taskAttempts: { ...state.taskAttempts, [taskId]: attempt },
              loading: false,
            }));
            const refreshed = await client.getRun(runId);
            if (get().run?.id === runId) {
              set({
                run: refreshed,
                runStatus: toRunStatus(refreshed.status),
                taskAttempts: attemptsByTask(refreshed.attempts ?? []),
              });
            }
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        }
      },
      skipTask: async (taskId) => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        set({ loading: true, error: null });
        try {
          const updated = await client.skipTask(runId, taskId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: toRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
              loading: false,
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        }
      },
      refreshRun: async () => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        try {
          const updated = await client.getRun(runId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: toRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        }
      },
      loadNodes: async () => {
        const client = getClient();
        const workspace = generation;
        const request = ++nodesRequest;
        try {
          const hermesNodes = await client.listNodes();
          if (currentWorkspace(workspace) && request === nodesRequest) set({ hermesNodes, error: null });
        } catch (error) {
          if (currentWorkspace(workspace) && request === nodesRequest) fail(error);
        }
      },
      saveNode: async (input) => {
        const client = getClient();
        const workspace = generation;
        const request = (nodeRequests.get(input.id) ?? 0) + 1;
        nodeRequests.set(input.id, request);
        const existing = get().hermesNodes.some((node) => node.id === input.id);
        set({ loading: true, error: null });
        try {
          const node = existing
            ? await client.updateNode(input.id, nodeUpdatePayload(input))
            : await client.createNode(input);
          if (!currentWorkspace(workspace) || nodeRequests.get(input.id) !== request) return;
          set((state) => {
            const index = state.hermesNodes.findIndex((item) => item.id === node.id);
            return {
              hermesNodes: index >= 0
                ? state.hermesNodes.map((item) => item.id === node.id ? node : item)
                : [...state.hermesNodes, node],
              loading: false,
            };
          });
        } catch (error) {
          if (currentWorkspace(workspace) && nodeRequests.get(input.id) === request) fail(error);
        }
      },
      removeNode: async (nodeId) => {
        const client = getClient();
        const workspace = generation;
        const request = (nodeRequests.get(nodeId) ?? 0) + 1;
        nodeRequests.set(nodeId, request);
        try {
          await client.deleteNode(nodeId);
          if (currentWorkspace(workspace) && nodeRequests.get(nodeId) === request) {
            set((state) => ({ hermesNodes: state.hermesNodes.filter((node) => node.id !== nodeId), error: null }));
          }
        } catch (error) {
          if (currentWorkspace(workspace) && nodeRequests.get(nodeId) === request) fail(error);
        }
      },
      provisionNode: async (nodeId, hermesPort) => {
        const client = getClient();
        const workspace = generation;
        const request = (nodeRequests.get(nodeId) ?? 0) + 1;
        nodeRequests.set(nodeId, request);
        try {
          const result = await client.provisionNode(nodeId, hermesPort);
          if (!currentWorkspace(workspace) || nodeRequests.get(nodeId) !== request) return;
          if (!result.completed) {
            set({
              error: {
                code: 'provision_failed',
                message: '节点部署未通过最终验证',
                details: { node_id: result.node_id, steps: result.steps },
              },
            });
            return;
          }
          set({ error: null });
        } catch (error) {
          if (currentWorkspace(workspace) && nodeRequests.get(nodeId) === request) fail(error);
        }
      },
      loadSettings: async () => {
        const request = ++settingsRequest;
        try {
          const [security, plannerConfig] = await Promise.all([
            getClient().getSecurityStatus(),
            getClient().getPlannerConfig(),
          ]);
          if (request === settingsRequest) {
            set({ securityStatus: security.status, plannerConfig, error: null });
          }
        } catch (error) {
          if (request === settingsRequest) fail(error);
        }
      },
      initializeSecurity: async (password) => {
        const request = ++settingsRequest;
        try {
          const security = await getClient().initializeSecurity(password);
          if (request === settingsRequest) set({ securityStatus: security.status, error: null });
        } catch (error) {
          if (request === settingsRequest) fail(error);
        }
      },
      unlockSecurity: async (password) => {
        const request = ++settingsRequest;
        try {
          const security = await getClient().unlockSecurity(password);
          if (request === settingsRequest) set({ securityStatus: security.status, error: null });
        } catch (error) {
          if (request === settingsRequest) fail(error);
        }
      },
      lockSecurity: async () => {
        const request = ++settingsRequest;
        try {
          const security = await getClient().lockSecurity();
          if (request === settingsRequest) set({ securityStatus: security.status, error: null });
        } catch (error) {
          if (request === settingsRequest) fail(error);
        }
      },
      savePlannerConfig: async (input) => {
        const request = ++settingsRequest;
        try {
          await getClient().setPlannerConfig(input);
          const plannerConfig = await getClient().getPlannerConfig();
          if (request === settingsRequest) set({ plannerConfig, error: null });
        } catch (error) {
          if (request === settingsRequest) fail(error);
        }
      },
      resetWorkspace: () => {
        settingsRequest += 1;
        workspaceRequest += 1;
        generation += 1;
        selectionGeneration += 1;
        workflowRequest += 1;
        nodesRequest += 1;
        nodeRequests.clear();
        set({ ...initialState, plannerConfig: { ...emptyPlannerConfig } });
      },
    };
  });
}

export const workspaceStore = createWorkspaceStore();
export const useWorkspaceStore = ((selector: (state: WorkspaceState) => unknown) =>
  useStore(workspaceStore, selector)) as UseBoundStore<StoreApi<WorkspaceState>>;
useWorkspaceStore.getState = workspaceStore.getState;
useWorkspaceStore.setState = workspaceStore.setState;
useWorkspaceStore.subscribe = workspaceStore.subscribe;
