import type { Project, ReadinessResult, Run, Workflow } from '../../lib/client';

export type ResourcePhase = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

export type RunPrimaryAction =
  | { kind: 'open_project'; disabled: boolean }
  | { kind: 'plan'; disabled: boolean }
  | { kind: 'review'; disabled: boolean }
  | { kind: 'resolve'; count: number }
  | { kind: 'execute'; disabled: false }
  | { kind: 'pause'; disabled: false }
  | { kind: 'resume'; disabled: false }
  | { kind: 'view_result'; disabled: false };

export type RunOverflowAction = 'cancel' | 'revision' | 'run_details';

export interface RunBarInput {
  project: Project | null;
  workflow: Workflow | null;
  run: Run | null;
  runStatus: string;
  runProgress: number;
  readiness: ReadinessResult | null;
  nodesPhase: ResourcePhase;
  onlineNodeCount: number;
}

export interface RunBarViewModel {
  contextLabel: string | null;
  pathUnavailable: boolean;
  statusLabel: string;
  statusKey: string;
  primaryAction: RunPrimaryAction;
  showProgress: boolean;
  runProgress: number;
  overflowActions: RunOverflowAction[];
  nodeSummary: { kind: 'loading' } | { kind: 'ready'; online: number };
}

const TERMINAL = new Set(['cancelled', 'success', 'success_with_warnings', 'failed']);
const ACTIVE = new Set(['pending', 'running', 'paused', 'cancelling', 'blocked']);

function blockingIssues(readiness: ReadinessResult | null) {
  return readiness?.issues.filter((issue) => issue.severity === 'blocking') ?? [];
}

export function deriveRunBarModel(input: RunBarInput): RunBarViewModel {
  const status = input.run?.status ?? input.runStatus ?? 'idle';
  const blockers = blockingIssues(input.readiness);
  const allowed = input.run?.allowed_actions ?? [];
  const overflowActions: RunOverflowAction[] = ['run_details'];
  if (allowed.includes('cancel')) overflowActions.unshift('cancel');
  if (input.workflow?.status === 'reviewed') overflowActions.push('revision');

  let primaryAction: RunPrimaryAction;
  const reviewableDraft = input.workflow?.status !== 'reviewed';
  const onlyWorkflowReviewBlockers = blockers.length > 0
    && blockers.every((issue) => issue.code.startsWith('workflow_') || issue.action === 'open_workflow');

  if (!input.project) {
    primaryAction = { kind: 'open_project', disabled: false };
  } else if (blockers.length > 0 && !(reviewableDraft && onlyWorkflowReviewBlockers)) {
    primaryAction = { kind: 'resolve', count: blockers.length };
  } else if (!input.workflow) {
    primaryAction = { kind: 'plan', disabled: false };
  } else if (input.workflow.status !== 'reviewed') {
    primaryAction = { kind: 'review', disabled: false };
  } else if (status === 'running' && allowed.includes('pause')) {
    primaryAction = { kind: 'pause', disabled: false };
  } else if (status === 'paused' && allowed.includes('resume')) {
    primaryAction = { kind: 'resume', disabled: false };
  } else if (input.run && TERMINAL.has(status)) {
    primaryAction = { kind: 'view_result', disabled: false };
  } else {
    primaryAction = { kind: 'execute', disabled: false };
  }

  return {
    contextLabel: input.project?.name ?? null,
    pathUnavailable: Boolean(input.project && !input.project.root_path),
    statusLabel: status,
    statusKey: `run.status.${status}`,
    primaryAction,
    showProgress: Boolean(input.run && ACTIVE.has(status)),
    runProgress: input.runProgress,
    overflowActions,
    nodeSummary: input.nodesPhase === 'ready' || input.nodesPhase === 'error'
      ? { kind: 'ready', online: input.onlineNodeCount }
      : { kind: 'loading' },
  };
}
