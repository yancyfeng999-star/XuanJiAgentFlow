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
  ui_position: { x: number; y: number };
}

export interface Workflow {
  id: string;
  project_id: string;
  version: number;
  goal: string;
  planner_provider: string | null;
  planner_model: string | null;
  status: WorkflowStatus;
  graph_json: Record<string, unknown>;
  tasks: WorkflowTask[];
  created_at: string;
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
}

export interface Run {
  id: string;
  workflow_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  attempts: TaskAttempt[];
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

const ERROR_MESSAGES: Record<string, string> = {
  artifact_integrity_error: '产物完整性校验失败',
  artifact_not_found: '产物不存在',
  internal_error: '服务器内部错误',
  invalid_project_root: '项目目录无效',
  invalid_session: '桌面会话已失效，请重新启动应用',
  network_error: '无法连接协调器，请确认应用服务正在运行',
  node_client_unavailable: '节点客户端当前不可用',
  node_connection_error: '无法连接执行节点',
  node_not_found: '执行节点不存在',
  node_not_remote: '该节点未配置远程连接信息',
  node_protocol_error: '执行节点返回了无效响应',
  node_timeout: '执行节点请求超时',
  no_eligible_node: '没有符合调度条件的可用节点',
  planner_credentials_missing: '规划器接口密钥尚未配置',
  planner_invalid_output: '规划器返回的工作流格式无效，自动修复后仍未通过校验',
  planner_not_configured: '规划器尚未配置，请先前往“设置”完成配置',
  planner_provider_error: '规划器服务请求失败',
  planner_timeout: '规划器服务请求超时',
  planner_unauthorized: '规划器身份验证失败，请检查接口密钥',
  project_not_found: '项目不存在',
  resource_in_use: '该资源仍被历史记录引用，无法删除',
  resource_not_found: '资源不存在',
  run_not_found: '运行记录不存在',
  run_not_cancellable: '当前运行不能取消',
  run_not_pausable: '当前运行不能暂停',
  run_not_resumable: '当前运行不能恢复',
  task_not_found: '任务不存在',
  task_not_retryable: '当前任务不可重试',
  task_not_skippable: '当前任务不可跳过',
  task_timeout: '任务执行超时',
  validation_error: '数据校验失败',
  workflow_frozen: '工作流已审核冻结，不能继续编辑',
  workflow_invalid: '工作流结构校验失败',
  workflow_not_found: '工作流不存在',
  workflow_not_reviewed: '工作流必须先审核，才能开始执行',
};

function localizedErrorMessage(code: string, message?: string): string {
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (message && /[\u4e00-\u9fff]/.test(message)) return message;
  return `操作失败（错误码：${code}）`;
}

export interface CoordinatorClient {
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; root_path?: string }): Promise<Project>;
  getProject(projectId: string): Promise<Project>;
  getProjectWorkflow(projectId: string): Promise<Workflow | null>;
  plan(projectId: string, input: PlanInput): Promise<Workflow>;
  getWorkflow(workflowId: string): Promise<Workflow>;
  updateWorkflow(workflowId: string, input: WorkflowUpdate): Promise<Workflow>;
  validateWorkflow(workflowId: string): Promise<{ valid: boolean; topological_order: string[] }>;
  reviewWorkflow(workflowId: string): Promise<Workflow>;
  createRun(workflowId: string): Promise<Run>;
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
  diagnoseNode(nodeId: string): Promise<Record<string, unknown>>;
  provisionNode(nodeId: string, hermesPort: number): Promise<{ node_id: string; completed: boolean; steps: Record<string, unknown>[] }>;
  getPlannerConfig(): Promise<PlannerConfig>;
  setPlannerConfig(input: PlannerConfigInput): Promise<PlannerConfig>;
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
      throw new CoordinatorError(0, 'network_error', '无法连接协调器，请确认应用服务正在运行');
    }

    const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      if (isErrorEnvelope(payload)) {
        throw new CoordinatorError(response.status, payload.error.code, payload.error.message, payload.error.details);
      }
      throw new CoordinatorError(response.status, 'http_error', `协调器请求失败（状态码 ${response.status}）`);
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
    getProjectWorkflow: (projectId) => request(`/api/projects/${id(projectId)}/workflow`),
    plan: (projectId, input) => request(`/api/projects/${id(projectId)}/plan`, json('POST', input)),
    getWorkflow: (workflowId) => request(`/api/workflows/${id(workflowId)}`),
    updateWorkflow: (workflowId, input) => request(`/api/workflows/${id(workflowId)}`, json('PUT', input)),
    validateWorkflow: (workflowId) => request(`/api/workflows/${id(workflowId)}/validate`, json('POST')),
    reviewWorkflow: (workflowId) => request(`/api/workflows/${id(workflowId)}/review`, json('POST')),
    createRun: (workflowId) => request(`/api/workflows/${id(workflowId)}/runs`, json('POST')),
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
    provisionNode: (nodeId, hermesPort) => request(`/api/nodes/${id(nodeId)}/provision`, json('POST', { hermes_port: hermesPort })),
    getPlannerConfig: () => request('/api/planner/config'),
    setPlannerConfig: (input) => request('/api/planner/config', json('PUT', input)),
  };
}
