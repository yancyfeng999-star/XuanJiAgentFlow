import { getLocale, hasMessage, translate } from './i18n';

export type WorkflowStatus = 'draft' | 'reviewed' | 'archived';
export type NodeStatus = 'unknown' | 'online' | 'offline' | 'degraded';

export interface Project {
  id: string;
  name: string;
  root_path: string;
  active_workflow_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionPolicy {
  mode: 'auto' | 'fixed' | 'node_group' | 'local_first' | 'remote_first';
  node_id: string | null;
  node_group: string | null;
  required_models: string[];
  required_tools: string[];
  required_tags: string[];
  timeout_seconds: number;
}

export interface RetryPolicy {
  max_attempts: number;
  delay_seconds: number;
}

export interface ExpectedOutput {
  path: string;
  media_type: string | null;
}

export interface VerifyStep {
  kind: 'command' | 'file_exists' | 'sha256' | 'manual';
  value: string;
}

export interface WorkflowTask {
  id: string;
  workflow_id: string;
  title: string;
  description: string;
  prompt: string;
  agent_type: string;
  dependencies: string[];
  execution_policy: ExecutionPolicy;
  retry_policy: RetryPolicy;
  expected_outputs: ExpectedOutput[];
  writes: string[];
  done_definition: string[];
  verify: VerifyStep[];
  run_gate: 'auto' | 'review_before_start' | 'review_before_complete';
  ui_position: { x: number; y: number };
}

export interface Workflow {
  id: string;
  project_id: string;
  version: number;
  goal: string;
  planner_provider: string | null;
  planner_model: string | null;
  thinking_model_id?: string | null;
  status: WorkflowStatus;
  graph_json: Record<string, unknown>;
  tasks: WorkflowTask[];
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_snapshot_hash: string | null;
  review_warnings: string[];
  created_at: string;
}

export interface ReviewIssue {
  code: string;
  task_id?: string;
  title: string;
  message: string;
}

export interface ReviewTaskSummary {
  task_id: string;
  title: string;
  dependencies: string[];
  writes: string[];
  done_definition: string[];
  verify: VerifyStep[];
  run_gate: string;
  matching_node_ids: string[];
  timeout_seconds: number;
}

export interface ReviewPrepareResult {
  snapshot: Record<string, unknown>;
  snapshot_hash: string;
  topological_order: string[];
  task_count: number;
  tasks: ReviewTaskSummary[];
  blockers: ReviewIssue[];
  warnings: ReviewIssue[];
}

export interface WorkflowUpdate {
  goal?: string;
  graph_json?: Record<string, unknown>;
  tasks: WorkflowTask[];
}

export interface PlanInput {
  goal: string;
  context?: string;
  constraints?: Record<string, unknown>;
  thinking_model_id?: string;
}

export interface ThinkingModelProfile {
  id: string;
  display_name: string;
  provider_kind: 'openai';
  api_mode: 'responses' | 'chat_completions';
  base_url: string;
  model_id: string;
  credential_key: string;
  enabled: boolean;
  is_default: boolean;
  reasoning_effort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null;
  credential_configured: boolean;
  last_test_status: 'untested' | 'ok' | 'failed';
  last_tested_at: string | null;
}

export interface TaskAttempt {
  id: string;
  run_id: string;
  task_id: string;
  node_id: string | null;
  attempt: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error: Record<string, unknown> | null;
  result_manifest: Record<string, unknown> | null;
  allowed_actions?: string[];
}

export interface Run {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  attempts: TaskAttempt[];
  workflow_version?: number;
  review_snapshot_hash?: string | null;
  allowed_actions?: string[];
}

export interface ProjectRunSummary {
  id: string;
  workflow_id: string;
  workflow_version: number | null;
  review_snapshot_hash: string | null;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  allowed_actions: string[];
  task_count: number;
  task_status_counts: Record<string, number>;
}

export interface ProjectRunPage {
  runs: ProjectRunSummary[];
  next_cursor: string | null;
}

export interface Artifact {
  id: string;
  run_id: string;
  task_id: string;
  attempt_id: string | null;
  relative_path: string;
  media_type: string;
  size: number;
  sha256: string;
  created_at: string;
}

export interface LogPage {
  offset: number;
  next_offset: number;
  events: Record<string, unknown>[];
}

export interface HermesNode {
  id: string;
  name: string;
  kind: 'local' | 'remote';
  api_url: string;
  ssh_host: string | null;
  ssh_port: number | null;
  ssh_user: string | null;
  ssh_key_path: string | null;
  status: NodeStatus;
  capabilities_json: Record<string, unknown>;
  max_concurrency: number;
  running_tasks: number;
  success_rate: number;
  last_seen_at: string | null;
  credential_configured: boolean | null;
}

export interface DiagnoseStep {
  step: 'dns' | 'tcp' | 'ssh' | 'node_agent' | 'hermes' | string;
  status: 'ok' | 'failed' | 'skipped' | string;
  message: string;
}

export interface DiagnoseResult {
  health?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  steps?: DiagnoseStep[];
  node: HermesNode;
}

export interface HostKeyInfo {
  algorithm: string;
  fingerprint: string;
  known: boolean;
}

export interface HostKeyInspectResult {
  node_id: string;
  host: string;
  port: number;
  keys: HostKeyInfo[];
}

export interface LocalDiscoverResult {
  found: boolean;
  path: string | null;
  version: string | null;
}

export interface NodeInput {
  id: string;
  name: string;
  kind: 'local' | 'remote';
  api_url: string;
  ssh_host?: string | null;
  ssh_port?: number | null;
  ssh_user?: string | null;
  ssh_key_path?: string | null;
  status?: NodeStatus;
  capabilities_json?: Record<string, unknown>;
  max_concurrency?: number;
  running_tasks?: number;
  success_rate?: number;
  credential?: string;
}

export type NodeUpdate = Partial<Pick<NodeInput,
  'name' | 'api_url' | 'ssh_host' | 'ssh_port' | 'ssh_user' | 'ssh_key_path'
  | 'status' | 'capabilities_json' | 'max_concurrency' | 'credential'
>>;

const nodeUpdateFields = [
  'name', 'api_url', 'ssh_host', 'ssh_port', 'ssh_user', 'ssh_key_path',
  'status', 'capabilities_json', 'max_concurrency', 'credential',
] as const;

export function nodeUpdatePayload(input: NodeInput | NodeUpdate): NodeUpdate {
  return Object.fromEntries(
    nodeUpdateFields
      .filter((field) => field in input && input[field] !== undefined)
      .map((field) => [field, input[field]]),
  );
}

export interface PlannerConfig {
  base_url: string | null;
  model: string | null;
  credential_key: string | null;
  credential_configured: boolean | null;
}

export interface PlannerConfigInput {
  base_url: string;
  model: string;
  credential_key: string;
  credential?: string;
}

export type ReadinessSeverity = 'blocking' | 'warning' | 'info';
export type ReadinessAction = 'open_project' | 'open_planner' | 'open_nodes' | 'open_workflow' | 'retry';
export type ReadinessCheckStatus = 'ready' | 'blocked' | 'warning' | 'unknown';

export interface ReadinessIssue {
  code: string;
  severity: ReadinessSeverity;
  title: string;
  message: string;
  action: ReadinessAction;
  targetId: string | null;
}

export interface ReadinessResult {
  ready: boolean;
  checkedAt: string;
  projectId: string | null;
  workflowId: string | null;
  checks: Record<string, ReadinessCheckStatus>;
  issues: ReadinessIssue[];
}

export interface ReadinessQuery {
  projectId?: string | null;
  workflowId?: string | null;
  mode?: 'local' | 'deep';
}

export interface CoordinatorErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export class CoordinatorError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(localizedErrorMessage(code, message));
    this.name = 'CoordinatorError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function localizedErrorMessage(code: string, message?: string): string {
  const locale = getLocale();
  const key = `error.${code}`;
  if (hasMessage(locale, key)) return translate(locale, key);
  if (message && /[一-鿿]/.test(message)) return message;
  return translate(locale, 'error.fallback', { code });
}

export interface CoordinatorClient {
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; root_path?: string }): Promise<Project>;
  getProject(projectId: string): Promise<Project>;
  renameProject(projectId: string, name: string): Promise<Project>;
  deleteProject(projectId: string): Promise<{ deleted: boolean; artifacts_retained: boolean; root_path: string }>;
  getProjectWorkflow(projectId: string): Promise<Workflow | null>;
  plan(projectId: string, input: PlanInput): Promise<Workflow>;
  getWorkflow(workflowId: string): Promise<Workflow>;
  updateWorkflow(workflowId: string, input: WorkflowUpdate): Promise<Workflow>;
  validateWorkflow(workflowId: string): Promise<{ valid: boolean; topological_order: string[] }>;
  prepareReview(workflowId: string): Promise<ReviewPrepareResult>;
  reviewWorkflow(workflowId: string, input: { snapshot_hash: string; acknowledged_warnings: string[] }): Promise<Workflow>;
  createRevision(workflowId: string): Promise<Workflow>;
  createRun(workflowId: string): Promise<Run>;
  listProjectRuns(projectId: string, cursor?: string | null, limit?: number): Promise<ProjectRunPage>;
  startRun(runId: string): Promise<{ id: string; status: 'accepted' }>;
  getRun(runId: string): Promise<Run>;
  pauseRun(runId: string): Promise<Run>;
  resumeRun(runId: string): Promise<Run>;
  cancelRun(runId: string): Promise<Run>;
  retryTask(runId: string, taskId: string): Promise<TaskAttempt>;
  skipTask(runId: string, taskId: string): Promise<Run>;
  listArtifacts(runId: string): Promise<{ artifacts: Artifact[] }>;
  listTaskLogs(runId: string, taskId: string, offset?: number): Promise<LogPage>;
  listNodes(): Promise<HermesNode[]>;
  createNode(input: NodeInput): Promise<HermesNode>;
  updateNode(nodeId: string, input: NodeUpdate): Promise<HermesNode>;
  deleteNode(nodeId: string): Promise<void>;
  diagnoseNode(nodeId: string): Promise<DiagnoseResult>;
  discoverLocalNode(): Promise<LocalDiscoverResult>;
  inspectHostKey(nodeId: string): Promise<HostKeyInspectResult>;
  confirmHostKey(nodeId: string, input: { algorithm: string; fingerprint: string }): Promise<Record<string, unknown>>;
  provisionNode(nodeId: string, hermesPort: number): Promise<{ node_id: string; completed: boolean; steps: Record<string, unknown>[] }>;
  getPlannerConfig(): Promise<PlannerConfig>;
  setPlannerConfig(input: PlannerConfigInput): Promise<PlannerConfig>;
  listThinkingModels(): Promise<{ items: ThinkingModelProfile[] }>;
  createThinkingModel(input: Record<string, unknown>): Promise<ThinkingModelProfile>;
  updateThinkingModel(id: string, input: Record<string, unknown>): Promise<ThinkingModelProfile>;
  deleteThinkingModel(id: string): Promise<void>;
  setDefaultThinkingModel(id: string): Promise<ThinkingModelProfile>;
  getReadiness(query?: ReadinessQuery): Promise<ReadinessResult>;
  createWsTicket(runId: string): Promise<{ ticket: string; expires_in: number }>;
}

function isErrorEnvelope(value: unknown): value is CoordinatorErrorEnvelope {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;
  const envelope = error as { code?: unknown; message?: unknown; details?: unknown };
  return typeof envelope.code === 'string'
    && typeof envelope.message === 'string'
    && Boolean(envelope.details)
    && typeof envelope.details === 'object'
    && !Array.isArray(envelope.details);
}

export function createApiClient(baseUrl: string, sessionToken?: string | null): CoordinatorClient {
  const base = baseUrl.trim().replace(/\/+$/, '');

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(sessionToken ? { 'X-Xuanji-Session': sessionToken } : {}),
          ...init?.headers,
        },
      });
    } catch {
      throw new CoordinatorError(0, 'network_error', translate(getLocale(), 'error.network_error'));
    }

    const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      if (isErrorEnvelope(payload)) {
        throw new CoordinatorError(response.status, payload.error.code, payload.error.message, payload.error.details);
      }
      throw new CoordinatorError(response.status, 'http_error', translate(getLocale(), 'error.httpError', { status: response.status }));
    }
    return payload as T;
  }

  const json = (method: string, body?: unknown): RequestInit => ({
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const id = encodeURIComponent;

  return {
    listProjects: () => request('/api/projects'),
    createProject: (input) => request('/api/projects', json('POST', input)),
    getProject: (projectId) => request(`/api/projects/${id(projectId)}`),
    renameProject: (projectId, name) => request(`/api/projects/${id(projectId)}`, json('PATCH', { name })),
    deleteProject: (projectId) => request(`/api/projects/${id(projectId)}`, json('DELETE')),
    getProjectWorkflow: (projectId) => request(`/api/projects/${id(projectId)}/workflow`),
    plan: (projectId, input) => request(`/api/projects/${id(projectId)}/plan`, json('POST', input)),
    getWorkflow: (workflowId) => request(`/api/workflows/${id(workflowId)}`),
    updateWorkflow: (workflowId, input) => request(`/api/workflows/${id(workflowId)}`, json('PUT', input)),
    validateWorkflow: (workflowId) => request(`/api/workflows/${id(workflowId)}/validate`, json('POST')),
    prepareReview: (workflowId) => request(`/api/workflows/${id(workflowId)}/review/prepare`, json('POST')),
    reviewWorkflow: (workflowId, input) => request(`/api/workflows/${id(workflowId)}/review`, json('POST', input)),
    createRevision: (workflowId) => request(`/api/workflows/${id(workflowId)}/revisions`, json('POST')),
    createRun: (workflowId) => request(`/api/workflows/${id(workflowId)}/runs`, json('POST')),
    listProjectRuns: (projectId, cursor = null, limit = 20) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return request(`/api/projects/${id(projectId)}/runs?${params.toString()}`);
    },
    startRun: (runId) => request(`/api/runs/${id(runId)}/start`, json('POST')),
    getRun: (runId) => request(`/api/runs/${id(runId)}`),
    pauseRun: (runId) => request(`/api/runs/${id(runId)}/pause`, json('POST')),
    resumeRun: (runId) => request(`/api/runs/${id(runId)}/resume`, json('POST')),
    cancelRun: (runId) => request(`/api/runs/${id(runId)}/cancel`, json('POST')),
    retryTask: (runId, taskId) => request(`/api/runs/${id(runId)}/tasks/${id(taskId)}/retry`, json('POST')),
    skipTask: (runId, taskId) => request(`/api/runs/${id(runId)}/tasks/${id(taskId)}/skip`, json('POST')),
    listArtifacts: (runId) => request(`/api/runs/${id(runId)}/artifacts`),
    listTaskLogs: (runId, taskId, offset = 0) =>
      request(`/api/runs/${id(runId)}/tasks/${id(taskId)}/logs?offset=${encodeURIComponent(String(offset))}`),
    listNodes: () => request('/api/nodes'),
    createNode: (input) => request('/api/nodes', json('POST', input)),
    updateNode: (nodeId, input) => request(`/api/nodes/${id(nodeId)}`, json('PATCH', nodeUpdatePayload(input))),
    deleteNode: (nodeId) => request(`/api/nodes/${id(nodeId)}`, json('DELETE')),
    diagnoseNode: (nodeId) => request(`/api/nodes/${id(nodeId)}/diagnose`, json('POST')),
    discoverLocalNode: () => request('/api/nodes/local/discover', json('POST')),
    inspectHostKey: (nodeId) => request(`/api/nodes/${id(nodeId)}/host-key/inspect`, json('POST')),
    confirmHostKey: (nodeId, input) => request(`/api/nodes/${id(nodeId)}/host-key/confirm`, json('POST', input)),
    provisionNode: (nodeId, hermesPort) => request(`/api/nodes/${id(nodeId)}/provision`, json('POST', { hermes_port: hermesPort })),
    getPlannerConfig: () => request('/api/planner/config'),
    setPlannerConfig: (input) => request('/api/planner/config', json('PUT', input)),
    listThinkingModels: () => request('/api/thinking-models'),
    createThinkingModel: (input) => request('/api/thinking-models', json('POST', input)),
    updateThinkingModel: (id, input) => request(`/api/thinking-models/${encodeURIComponent(id)}`, json('PATCH', input)),
    deleteThinkingModel: (id) => request(`/api/thinking-models/${encodeURIComponent(id)}`, json('DELETE')),
    setDefaultThinkingModel: (id) => request(`/api/thinking-models/${encodeURIComponent(id)}/default`, json('PUT')),
    createWsTicket: (runId) => request('/api/session/ws-tickets', json('POST', { run_id: runId })),
    getReadiness: (query = {}) => {
      const params = new URLSearchParams();
      if (query.projectId) params.set('project_id', query.projectId);
      if (query.workflowId) params.set('workflow_id', query.workflowId);
      if (query.mode) params.set('mode', query.mode);
      const suffix = params.size ? `?${params.toString()}` : '';
      return request(`/api/readiness${suffix}`);
    },
  };
}
