export type AgentType = 'research' | 'code' | 'business' | 'review' | 'general';
export type WorkflowStatus = 'draft' | 'reviewed' | 'archived';
export type RunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type TaskStatus = 'pending' | 'ready' | 'dispatching' | 'running' | 'collecting' | 'success' | 'failed' | 'blocked' | 'skipped';

export interface Position { x: number; y: number; }
export interface RetryPolicy { maxAttempts: number; backoffSeconds: number; }
export interface ExecutionPolicy { nodePreference: 'auto' | 'local' | 'remote'; requiredTags: string[]; timeoutSeconds: number; }
export interface Project { id: string; name: string; rootPath: string; activeWorkflowVersion: number; createdAt: string; updatedAt: string; }
export interface WorkflowTask extends Record<string, unknown> {
  id: string; workflowId: string; title: string; description: string; prompt: string;
  agentType: AgentType; dependencies: string[]; executionPolicy: ExecutionPolicy;
  retryPolicy: RetryPolicy; expectedOutputs: string[]; uiPosition: Position;
}
export interface Workflow { id: string; projectId: string; version: number; goal: string; plannerProvider: string; plannerModel: string; status: WorkflowStatus; tasks: WorkflowTask[]; }
export interface TaskAttempt { id: string; taskId: string; nodeId?: string; attempt: number; status: TaskStatus; logs: string[]; outputFiles: string[]; }
export interface Run { id: string; workflowId: string; status: RunStatus; progress: number; startedAt?: string; completedAt?: string; attempts: Record<string, TaskAttempt>; }
export interface HermesNode { id: string; name: string; kind: 'local' | 'remote'; status: 'online' | 'offline'; maxConcurrency: number; runningTasks: number; }
