import { useStore, type StoreApi, type UseBoundStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import {
  CoordinatorError,
  createApiClient,
  nodeUpdatePayload,
  type CoordinatorClient,
  type HermesNode,
  type LocalDiscoverResult,
  type NodeInput,
  type PlanInput,
  type PlannerConfig,
  type PlannerConfigInput,
  type Project,
  type ProjectRunSummary,
  type ReadinessResult,
  type ReviewPrepareResult,
  type Run,
  type TaskAttempt,
  type ThinkingModelProfile,
  type Workflow,
  type WorkflowTask,
} from '../lib/client';
import { getLocale, translate } from '../lib/i18n';
import { wouldCreateCycle } from '../features/inspector/taskDraft';

function storeText(key: string): string {
  return translate(getLocale(), key);
}

export interface WorkspaceError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type WorkspacePanel = 'projects' | 'workflow' | 'nodes' | 'thinking_models' | 'settings';
export type SettingsSection = 'appearance' | 'thinking_models' | 'execution' | 'updates' | 'support' | 'about';
export const NAV_COLLAPSED_KEY = 'xuanji.workspace.nav-collapsed';

export type PendingAction =
  | { kind: 'create_project'; key: 'new' }
  | { kind: 'rename_project' | 'delete_project'; key: string }
  | { kind: 'plan' | 'review' | 'execute'; key: string }
  | { kind: 'pause' | 'resume' | 'cancel'; key: string }
  | { kind: 'retry_task' | 'skip_task'; key: string }
  | { kind: 'save_node' | 'diagnose_node' | 'provision_node' | 'delete_node'; key: string }
  | { kind: 'save_planner'; key: 'planner' }
  | { kind: 'save_thinking_model'; key: string };

export type PendingActionKind = PendingAction['kind'];

function pendingKey(action: PendingAction): string {
  return `${action.kind}:${action.key}`;
}
export type RunStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'success'
  | 'success_with_warnings'
  | 'failed'
  | 'blocked';

export const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'success', 'success_with_warnings', 'failed']);

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
  coordinatorSessionToken: string | null;
  projects: Project[];
  project: Project | null;
  workflow: Workflow | null;
  run: Run | null;
  runHistory: ProjectRunSummary[];
  runHistoryCursor: string | null;
  runStatus: RunStatus;
  runProgress: number;
  lastEventId: number;
  taskAttempts: Record<string, TaskAttempt>;
  hermesNodes: HermesNode[];
  localDiscover: LocalDiscoverResult | null;
  selectedTaskId: string | null;
  activePanel: WorkspacePanel;
  settingsSection: SettingsSection;
  navCollapsed: boolean;
  inspectorCollapsed: boolean;
  inspectorWidth: number;
  plannerConfig: PlannerConfig;
  thinkingModels: ThinkingModelProfile[];
  selectedThinkingModelId: string | null;
  readiness: ReadinessResult | null;
  pendingActions: PendingAction[];
  error: WorkspaceError | null;
  canExecute: boolean;
  setCoordinatorBaseUrl: (baseUrl: string, sessionToken?: string | null) => void;
  selectTask: (taskId: string | null) => void;
  setActivePanel: (panel: WorkspacePanel) => void;
  setSettingsSection: (section: SettingsSection) => void;
  setNavCollapsed: (collapsed: boolean) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  setInspectorWidth: (width: number) => void;
  setRunStatus: (status: RunStatus) => void;
  setRunProgress: (progress: number) => void;
  applyRunMonitor: (update: MonitorUpdate) => void;
  setControlError: (error: WorkspaceError | null) => void;
  isPending: (kind: PendingActionKind, key?: string) => boolean;
  clearError: () => void;
  loadProjects: () => Promise<void>;
  createProject: (name: string, rootPath?: string) => Promise<void>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  plan: (input: PlanInput) => Promise<void>;
  updateTask: (taskId: string, changes: TaskChanges) => Promise<void>;
  setTaskDependencies: (taskId: string, dependencies: string[]) => Promise<void>;
  addTask: () => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
  connectTasks: (sourceTaskId: string, targetTaskId: string) => Promise<void>;
  disconnectTasks: (sourceTaskId: string, targetTaskId: string) => Promise<void>;
  disconnectTaskEdges: (edges: Array<{ source: string; target: string }>) => Promise<void>;
  prepareReview: () => Promise<ReviewPrepareResult | null>;
  reviewWorkflow: (snapshotHash: string, acknowledgedWarnings: string[]) => Promise<void>;
  createRevision: () => Promise<void>;
  executeWorkflow: () => Promise<void>;
  pauseRun: () => Promise<void>;
  resumeRun: () => Promise<void>;
  cancelRun: () => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  skipTask: (taskId: string) => Promise<void>;
  refreshRun: () => Promise<void>;
  loadRunHistory: (append?: boolean) => Promise<void>;
  openRun: (runId: string) => Promise<void>;
  loadNodes: () => Promise<void>;
  saveNode: (input: NodeInput) => Promise<void>;
  diagnoseNode: (nodeId: string) => Promise<void>;
  discoverLocalNode: () => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  provisionNode: (nodeId: string, hermesPort: number) => Promise<void>;
  loadSettings: () => Promise<void>;
  loadThinkingModels: () => Promise<void>;
  saveThinkingModel: (input: Record<string, unknown>, id?: string) => Promise<void>;
  setDefaultThinkingModel: (id: string) => Promise<void>;
  savePlannerConfig: (input: PlannerConfigInput) => Promise<void>;
  loadReadiness: (mode?: 'local' | 'deep') => Promise<void>;
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
  coordinatorSessionToken: null,
  projects: [] as Project[],
  project: null as Project | null,
  workflow: null as Workflow | null,
  run: null as Run | null,
  runHistory: [] as ProjectRunSummary[],
  runHistoryCursor: null as string | null,
  runStatus: 'idle' as RunStatus,
  runProgress: 0,
  lastEventId: 0,
  taskAttempts: {} as Record<string, TaskAttempt>,
  hermesNodes: [] as HermesNode[],
  localDiscover: null as LocalDiscoverResult | null,
  selectedTaskId: null as string | null,
  activePanel: 'workflow' as WorkspacePanel,
  settingsSection: 'appearance' as SettingsSection,
  navCollapsed: false,
  inspectorCollapsed: false,
  inspectorWidth: 360,
  plannerConfig: emptyPlannerConfig,
  thinkingModels: [] as ThinkingModelProfile[],
  selectedThinkingModelId: null as string | null,
  readiness: null as ReadinessResult | null,
  pendingActions: [] as PendingAction[],
  error: null as WorkspaceError | null,
  canExecute: false,
};

function asRunStatus(status: string | undefined | null): RunStatus {
  switch (status) {
    case 'pending':
    case 'running':
    case 'paused':
    case 'cancelling':
    case 'cancelled':
    case 'success':
    case 'success_with_warnings':
    case 'failed':
    case 'blocked':
      return status;
    default:
      return 'idle';
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
    message: error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
      ? error.message
      : storeText('store.operationFailed'),
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
    let readinessRequest = 0;
    const nodeRequests = new Map<string, number>();
    const fail = (error: unknown) => set({ error: workspaceError(error) });
    const begin = (action: PendingAction): boolean => {
      if (get().pendingActions.some((item) => pendingKey(item) === pendingKey(action))) return false;
      set((state) => ({ pendingActions: [...state.pendingActions, action] }));
      return true;
    };
    const end = (action: PendingAction) => {
      set((state) => ({
        pendingActions: state.pendingActions.filter((item) => pendingKey(item) !== pendingKey(action)),
      }));
    };
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
        set({ error: { code: 'workflow_frozen', message: storeText('store.workflowFrozen'), details: {} } });
        return;
      }
      if (cycleIn(tasks)) {
        set({ error: { code: 'workflow_cycle', message: storeText('store.workflowCycle'), details: {} } });
        return;
      }
      if (!projectId) return;
      set({ error: null });
      try {
        const updated = await client.updateWorkflow(workflow.id, {
          tasks,
          graph_json: workflow.graph_json,
        });
        if (request === workflowRequest && currentSelection(workspace, selection, projectId, workflow.id)) {
          set({ workflow: updated, canExecute: updated.status === 'reviewed' });
        }
      } catch (error) {
        if (request === workflowRequest && currentSelection(workspace, selection, projectId, workflow.id)) fail(error);
      }
    };

    return {
      ...initialState,
      setCoordinatorBaseUrl: (coordinatorBaseUrl, coordinatorSessionToken = null) => {
        const normalized = coordinatorBaseUrl.trim().replace(/\/+$/, '');
        const current = get().coordinatorBaseUrl.trim().replace(/\/+$/, '');
        if (normalized === current && coordinatorSessionToken === get().coordinatorSessionToken) {
          return;
        }
        settingsRequest += 1;
        workspaceRequest += 1;
        generation += 1;
        selectionGeneration += 1;
        workflowRequest += 1;
        nodesRequest += 1;
        readinessRequest += 1;
        nodeRequests.clear();
        workspaceClient = createApiClient(normalized, coordinatorSessionToken);
        set({
          coordinatorBaseUrl: normalized,
          coordinatorSessionToken,
          projects: [],
          project: null,
          workflow: null,
          run: null,
          runHistory: [],
          runHistoryCursor: null,
          lastEventId: 0,
          taskAttempts: {},
          runStatus: 'idle',
          runProgress: 0,
          hermesNodes: [],
          selectedTaskId: null,
          plannerConfig: { ...emptyPlannerConfig },
          readiness: null,
          pendingActions: [],
          error: null,
          canExecute: false,
        });
      },
      selectTask: (selectedTaskId) => set({ selectedTaskId }),
      setActivePanel: (activePanel) => set({ activePanel }),
      setSettingsSection: (settingsSection) => set({ settingsSection }),
      setNavCollapsed: (navCollapsed) => {
        try {
          window.localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? '1' : '0');
        } catch {
          /* ignore */
        }
        set({ navCollapsed });
      },
      setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
      setInspectorWidth: (width) => set({ inspectorWidth: Math.min(520, Math.max(320, width)) }),
      setRunStatus: (runStatus) => set({ runStatus }),
      setRunProgress: (runProgress) => set({ runProgress: Math.max(0, Math.min(100, runProgress)) }),
      applyRunMonitor: (update) => set((state) => ({
        lastEventId: update.lastEventId ?? state.lastEventId,
        runStatus: update.runStatus ? asRunStatus(update.runStatus) : state.runStatus,
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
      isPending: (kind, key) => get().pendingActions.some(
        (action) => action.kind === kind && (key === undefined || action.key === key),
      ),
      loadProjects: async () => {
        const client = getClient();
        const workspace = generation;
        const request = ++workspaceRequest;
        set({ error: null });
        try {
          const projects = await client.listProjects();
          if (currentWorkspace(workspace) && request === workspaceRequest) set({ projects });
        } catch (error) {
          if (currentWorkspace(workspace) && request === workspaceRequest) fail(error);
        }
      },
      createProject: async (name, rootPath) => {
        const client = getClient();
        const workspace = generation;
        const request = ++workspaceRequest;
        const pending: PendingAction = { kind: 'create_project', key: 'new' };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const project = await client.createProject({ name, ...(rootPath ? { root_path: rootPath } : {}) });
          if (!currentWorkspace(workspace) || request !== workspaceRequest) return;
          set((state) => ({ projects: [...state.projects, project] }));
          await get().loadProject(project.id);
        } catch (error) {
          if (currentWorkspace(workspace) && request === workspaceRequest) fail(error);
        } finally {
          end(pending);
        }
      },
      renameProject: async (projectId, name) => {
        const client = getClient();
        const workspace = generation;
        const pending: PendingAction = { kind: 'rename_project', key: projectId };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const updated = await client.renameProject(projectId, name);
          if (!currentWorkspace(workspace)) return;
          set((state) => ({
            projects: state.projects.map((item) => (item.id === projectId ? updated : item)),
            project: state.project?.id === projectId ? updated : state.project,
          }));
        } catch (error) {
          if (currentWorkspace(workspace)) fail(error);
        } finally {
          end(pending);
        }
      },
      deleteProject: async (projectId) => {
        const client = getClient();
        const workspace = generation;
        const pending: PendingAction = { kind: 'delete_project', key: projectId };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          await client.deleteProject(projectId);
          if (!currentWorkspace(workspace)) return;
          const projects = get().projects.filter((item) => item.id !== projectId);
          set({ projects });
          if (get().project?.id === projectId) {
            set({ project: null, workflow: null, run: null, runHistory: [], runHistoryCursor: null, canExecute: false });
          }
        } catch (error) {
          if (currentWorkspace(workspace)) fail(error);
        } finally {
          end(pending);
        }
      },
      loadProject: async (projectId) => {
        const client = getClient();
        const workspace = generation;
        const request = ++workspaceRequest;
        const selection = ++selectionGeneration;
        workflowRequest += 1;
        set({
          error: null,
          selectedTaskId: null,
          workflow: null,
          run: null,
          runHistory: [],
          runHistoryCursor: null,
          lastEventId: 0,
          taskAttempts: {},
          runStatus: 'idle',
          runProgress: 0,
          canExecute: false,
        });
        try {
          const [project, workflow, runPage] = await Promise.all([
            client.getProject(projectId),
            client.getProjectWorkflow(projectId),
            client.listProjectRuns(projectId),
          ]);
          if (currentWorkspace(workspace) && request === workspaceRequest && selection === selectionGeneration) {
            set({
              project,
              workflow,
              canExecute: workflow?.status === 'reviewed',
              runHistory: runPage.runs,
              runHistoryCursor: runPage.next_cursor,
            });
            const active = runPage.runs.find((item) => !TERMINAL_RUN_STATUSES.has(item.status));
            if (active) {
              const restored = await client.getRun(active.id);
              if (currentWorkspace(workspace) && request === workspaceRequest && selection === selectionGeneration) {
                set({
                  run: restored,
                  runStatus: asRunStatus(restored.status),
                  taskAttempts: attemptsByTask(restored.attempts ?? []),
                });
              }
            }
            void get().loadReadiness();
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
          set({ error: { code: 'project_required', message: storeText('store.projectRequired'), details: {} } });
          return;
        }
        const pending: PendingAction = { kind: 'plan', key: project.id };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const workflow = await client.plan(project.id, input);
          if (!currentSelection(workspace, selection, project.id) || request !== workflowRequest) return;
          set((state) => ({
            workflow,
            project: state.project?.id === project.id ? { ...state.project, active_workflow_version: workflow.version } : state.project,
            selectedTaskId: null,
            canExecute: false,
          }));
          void get().loadReadiness();
        } catch (error) {
          if (currentSelection(workspace, selection, project.id) && request === workflowRequest) fail(error);
        } finally {
          end(pending);
        }
      },
      updateTask: async (taskId, changes) => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: storeText('store.workflowFrozen'), details: {} } });
          return;
        }
        await persistTasks(workflow.tasks.map((task) => task.id === taskId ? { ...task, ...changes } : task));
      },
      setTaskDependencies: async (taskId, dependencies) => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: storeText('store.workflowFrozen'), details: {} } });
          return;
        }
        if (wouldCreateCycle(workflow.tasks, taskId, dependencies)) {
          set({ error: { code: 'workflow_cycle', message: storeText('store.workflowCycle'), details: {} } });
          return;
        }
        await persistTasks(workflow.tasks.map((task) => task.id === taskId ? { ...task, dependencies } : task));
      },
      addTask: async () => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: storeText('store.workflowFrozen'), details: {} } });
          return;
        }
        const ids = new Set(workflow.tasks.map((task) => task.id));
        let number = 1;
        while (ids.has(`task-${number}`)) number += 1;
        await persistTasks([...workflow.tasks, {
          id: `task-${number}`,
          workflow_id: workflow.id,
          title: storeText('store.newTask'),
          description: '',
          prompt: '',
          agent_type: 'general',
          dependencies: [],
          execution_policy: {
            mode: 'auto', node_id: null, node_group: null, required_models: [], required_tools: [], required_tags: [], timeout_seconds: 1800,
          },
          retry_policy: { max_attempts: 3, delay_seconds: 1 },
          expected_outputs: [],
          writes: [],
          done_definition: [],
          verify: [],
          run_gate: 'auto',
          ui_position: { x: 80 + workflow.tasks.length * 40, y: 80 + workflow.tasks.length * 40 },
        }]);
      },
      removeTask: async (taskId) => {
        const workflow = get().workflow;
        if (!editable(workflow)) {
          set({ error: { code: 'workflow_frozen', message: storeText('store.workflowFrozen'), details: {} } });
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
          set({ error: { code: 'workflow_frozen', message: storeText('store.workflowFrozen'), details: {} } });
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
          set({ error: { code: 'workflow_frozen', message: storeText('store.workflowFrozen'), details: {} } });
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
      prepareReview: async () => {
        const workflow = get().workflow;
        if (!workflow) return null;
        try {
          return await getClient().prepareReview(workflow.id);
        } catch (error) {
          fail(error);
          return null;
        }
      },
      reviewWorkflow: async (snapshotHash, acknowledgedWarnings) => {
        const client = getClient();
        const workspace = generation;
        const selection = selectionGeneration;
        const request = ++workflowRequest;
        const projectId = get().project?.id;
        const workflow = get().workflow;
        if (!projectId || !workflow) return;
        const pending: PendingAction = { kind: 'review', key: workflow.id };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const reviewed = await client.reviewWorkflow(workflow.id, {
            snapshot_hash: snapshotHash,
            acknowledged_warnings: acknowledgedWarnings,
          });
          if (currentSelection(workspace, selection, projectId, workflow.id) && request === workflowRequest) {
            set({ workflow: reviewed, canExecute: reviewed.status === 'reviewed' });
            void get().loadReadiness();
          }
        } catch (error) {
          if (currentSelection(workspace, selection, projectId, workflow.id) && request === workflowRequest) fail(error);
          throw error;
        } finally {
          end(pending);
        }
      },
      createRevision: async () => {
        const client = getClient();
        const workspace = generation;
        const selection = selectionGeneration;
        const request = ++workflowRequest;
        const projectId = get().project?.id;
        const workflow = get().workflow;
        if (!projectId || !workflow || workflow.status !== 'reviewed') return;
        set({ error: null });
        try {
          const revision = await client.createRevision(workflow.id);
          if (currentSelection(workspace, selection, projectId) && request === workflowRequest) {
            set({
              workflow: revision,
              selectedTaskId: null,
              canExecute: false,
              project: get().project
                ? { ...get().project!, active_workflow_version: revision.version }
                : get().project,
            });
            void get().loadReadiness();
          }
        } catch (error) {
          if (currentSelection(workspace, selection, projectId) && request === workflowRequest) fail(error);
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
          set({ error: { code: 'workflow_not_reviewed', message: storeText('store.notReviewed'), details: {} } });
          return;
        }
        const pending: PendingAction = { kind: 'execute', key: workflow.id };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const run = await client.createRun(workflow.id);
          if (!currentSelection(workspace, selection, projectId, workflow.id) || request !== workflowRequest) return;
          await client.startRun(run.id);
          if (currentSelection(workspace, selection, projectId, workflow.id) && request === workflowRequest) {
            set({
              run,
              runStatus: asRunStatus(run.status),
              runProgress: 0,
              lastEventId: 0,
              taskAttempts: attemptsByTask(run.attempts ?? []),
            });
            void get().loadRunHistory();
          }
        } catch (error) {
          if (currentSelection(workspace, selection, projectId, workflow.id) && request === workflowRequest) fail(error);
        } finally {
          end(pending);
        }
      },
      pauseRun: async () => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        const pending: PendingAction = { kind: 'pause', key: runId };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const updated = await client.pauseRun(runId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: asRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        } finally {
          end(pending);
        }
      },
      resumeRun: async () => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        const pending: PendingAction = { kind: 'resume', key: runId };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const updated = await client.resumeRun(runId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: asRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        } finally {
          end(pending);
        }
      },
      cancelRun: async () => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        const pending: PendingAction = { kind: 'cancel', key: runId };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const updated = await client.cancelRun(runId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: asRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        } finally {
          end(pending);
        }
      },
      retryTask: async (taskId) => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        const pending: PendingAction = { kind: 'retry_task', key: taskId };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const attempt = await client.retryTask(runId, taskId);
          if (get().run?.id === runId) {
            set((state) => ({
              taskAttempts: { ...state.taskAttempts, [taskId]: attempt },
            }));
            const refreshed = await client.getRun(runId);
            if (get().run?.id === runId) {
              set({
                run: refreshed,
                runStatus: asRunStatus(refreshed.status),
                taskAttempts: attemptsByTask(refreshed.attempts ?? []),
              });
            }
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        } finally {
          end(pending);
        }
      },
      skipTask: async (taskId) => {
        const client = getClient();
        const runId = get().run?.id;
        if (!runId) return;
        const pending: PendingAction = { kind: 'skip_task', key: taskId };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          const updated = await client.skipTask(runId, taskId);
          if (get().run?.id === runId) {
            set({
              run: updated,
              runStatus: asRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
            });
          }
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        } finally {
          end(pending);
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
              runStatus: asRunStatus(updated.status),
              taskAttempts: attemptsByTask(updated.attempts ?? []),
            });
          }
          if (TERMINAL_RUN_STATUSES.has(updated.status)) void get().loadRunHistory();
        } catch (error) {
          if (get().run?.id === runId) fail(error);
        }
      },
      loadRunHistory: async (append = false) => {
        const client = getClient();
        const projectId = get().project?.id;
        if (!projectId) return;
        const cursor = append ? get().runHistoryCursor : null;
        try {
          const page = await client.listProjectRuns(projectId, cursor);
          set((state) => ({
            runHistory: append ? [...state.runHistory, ...page.runs] : page.runs,
            runHistoryCursor: page.next_cursor,
          }));
        } catch (error) {
          fail(error);
        }
      },
      openRun: async (runId) => {
        const client = getClient();
        try {
          const run = await client.getRun(runId);
          set({
            run,
            runStatus: asRunStatus(run.status),
            taskAttempts: attemptsByTask(run.attempts ?? []),
            lastEventId: 0,
            runProgress: 0,
          });
        } catch (error) {
          fail(error);
        }
      },
      loadNodes: async () => {
        const client = getClient();
        const workspace = generation;
        const request = ++nodesRequest;
        try {
          const hermesNodes = await client.listNodes();
          if (currentWorkspace(workspace) && request === nodesRequest) {
            set({ hermesNodes, error: null });
            void get().loadReadiness();
          }
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
        const pending: PendingAction = { kind: 'save_node', key: input.id };
        if (!begin(pending)) return;
        set({ error: null });
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
            };
          });
          void get().loadReadiness();
        } catch (error) {
          if (currentWorkspace(workspace) && nodeRequests.get(input.id) === request) fail(error);
        } finally {
          end(pending);
        }
      },
      diagnoseNode: async (nodeId) => {
        const client = getClient();
        const pending: PendingAction = { kind: 'diagnose_node', key: nodeId };
        if (!begin(pending)) return;
        set({ error: null });
        try {
          await client.diagnoseNode(nodeId);
          const hermesNodes = await client.listNodes();
          set({ hermesNodes });
        } catch (error) {
          fail(error);
        } finally {
          end(pending);
        }
      },
      discoverLocalNode: async () => {
        try {
          const localDiscover = await getClient().discoverLocalNode();
          set({ localDiscover });
        } catch (error) {
          fail(error);
        }
      },
      removeNode: async (nodeId) => {
        const client = getClient();
        const workspace = generation;
        const request = (nodeRequests.get(nodeId) ?? 0) + 1;
        nodeRequests.set(nodeId, request);
        const pending: PendingAction = { kind: 'delete_node', key: nodeId };
        if (!begin(pending)) return;
        try {
          await client.deleteNode(nodeId);
          if (currentWorkspace(workspace) && nodeRequests.get(nodeId) === request) {
            set((state) => ({ hermesNodes: state.hermesNodes.filter((node) => node.id !== nodeId), error: null }));
            void get().loadReadiness();
          }
        } catch (error) {
          if (currentWorkspace(workspace) && nodeRequests.get(nodeId) === request) fail(error);
        } finally {
          end(pending);
        }
      },
      provisionNode: async (nodeId, hermesPort) => {
        const client = getClient();
        const workspace = generation;
        const request = (nodeRequests.get(nodeId) ?? 0) + 1;
        nodeRequests.set(nodeId, request);
        const pending: PendingAction = { kind: 'provision_node', key: nodeId };
        if (!begin(pending)) return;
        try {
          const result = await client.provisionNode(nodeId, hermesPort);
          if (!currentWorkspace(workspace) || nodeRequests.get(nodeId) !== request) return;
          if (!result.completed) {
            set({
              error: {
                code: 'provision_failed',
                message: storeText('store.provisionFailed'),
                details: { node_id: result.node_id, steps: result.steps },
              },
            });
            return;
          }
          set({ error: null });
        } catch (error) {
          if (currentWorkspace(workspace) && nodeRequests.get(nodeId) === request) fail(error);
        } finally {
          end(pending);
        }
      },
      loadThinkingModels: async () => {
        const models = await getClient().listThinkingModels();
        const selected = models.items.find((item) => item.is_default)?.id ?? models.items[0]?.id ?? null;
        set({ thinkingModels: models.items, selectedThinkingModelId: selected });
      },
      saveThinkingModel: async (input, id) => {
        const pending: PendingAction = { kind: 'save_thinking_model', key: id ?? 'new' };
        if (!begin(pending)) return;
        try {
          if (id) await getClient().updateThinkingModel(id, input);
          else await getClient().createThinkingModel(input);
          await get().loadThinkingModels();
          void get().loadReadiness();
        } catch (error) {
          fail(error);
        } finally {
          end(pending);
        }
      },
      setDefaultThinkingModel: async (id) => {
        await getClient().setDefaultThinkingModel(id);
        await get().loadThinkingModels();
      },
      loadSettings: async () => {
        const request = ++settingsRequest;
        try {
          const plannerConfig = await getClient().getPlannerConfig();
          if (request === settingsRequest) {
            set({ plannerConfig, error: null });
          }
        } catch (error) {
          if (request === settingsRequest) fail(error);
        }
      },
      savePlannerConfig: async (input) => {
        const request = ++settingsRequest;
        const pending: PendingAction = { kind: 'save_planner', key: 'planner' };
        if (!begin(pending)) return;
        try {
          await getClient().setPlannerConfig(input);
          const plannerConfig = await getClient().getPlannerConfig();
          if (request === settingsRequest) {
            set({ plannerConfig, error: null });
            void get().loadReadiness();
          }
        } catch (error) {
          if (request === settingsRequest) fail(error);
        } finally {
          end(pending);
        }
      },
      loadReadiness: async (mode = 'local') => {
        const client = getClient();
        const workspace = generation;
        const request = ++readinessRequest;
        const projectId = get().project?.id ?? null;
        const workflowId = get().workflow?.id ?? null;
        try {
          const readiness = await client.getReadiness({ projectId, workflowId, mode });
          if (currentWorkspace(workspace) && request === readinessRequest) {
            set({ readiness, canExecute: readiness.ready && get().workflow?.status === 'reviewed' });
          }
        } catch {
          if (currentWorkspace(workspace) && request === readinessRequest) {
            set({ readiness: null });
          }
        }
      },
      resetWorkspace: () => {
        settingsRequest += 1;
        workspaceRequest += 1;
        generation += 1;
        selectionGeneration += 1;
        workflowRequest += 1;
        nodesRequest += 1;
        readinessRequest += 1;
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
