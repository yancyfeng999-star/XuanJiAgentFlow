export type AgentType = 'research' | 'code' | 'business' | 'review';

export type TaskStatus = 'pending' | 'claimed' | 'running' | 'success' | 'failed' | 'timeout' | 'blocked' | 'skipped';

export type RunStatus = 'draft' | 'planning' | 'running' | 'paused' | 'completed' | 'failed';

export interface TaskNode {
  id: string;
  title: string;
  description: string;
  agentType: AgentType;
  status: TaskStatus;
  dependencies: string[];
  estimatedTime: string;
  outputFormat?: string;
  result?: string;
  logs?: LogEntry[];
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  maxRetries: number;
}

export interface LogEntry {
  time: string;
  level: 'info' | 'debug' | 'warn' | 'error';
  message: string;
}

export interface TaskGraph {
  id: string;
  goal: string;
  thinking?: string;
  nodes: TaskNode[];
  parallelGroups?: string[][];
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PlanInput {
  goal: string;
  context?: string;
  constraints?: {
    format?: string;
    language?: string;
  };
  engine?: 'hermes' | 'manual';
}
