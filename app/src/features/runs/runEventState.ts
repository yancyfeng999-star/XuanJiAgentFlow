export interface RunEvent {
  event_id: number;
  run_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TaskAttemptSnapshot {
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

export interface RunEventState {
  lastEventId: number;
  events: RunEvent[];
  runStatus: string | null;
  taskAttempts: Record<string, TaskAttemptSnapshot>;
}

export function createInitialRunEventState(): RunEventState {
  return {
    lastEventId: 0,
    events: [],
    runStatus: null,
    taskAttempts: {},
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function applyRunEvent(state: RunEventState, event: RunEvent): RunEventState {
  if (!Number.isFinite(event.event_id) || event.event_id <= state.lastEventId) {
    return state;
  }

  const next: RunEventState = {
    ...state,
    lastEventId: event.event_id,
    events: [...state.events, event],
  };

  const payload = asRecord(event.payload);

  if (event.type === 'run.created' || event.type === 'run.status_changed') {
    const status = asString(payload.status, state.runStatus ?? '');
    return { ...next, runStatus: status || next.runStatus };
  }

  if (event.type === 'task.status_changed' || event.type === 'task.cancel_failed') {
    const taskId = asString(payload.task_id);
    if (!taskId) return next;
    const previous = next.taskAttempts[taskId];
    const snapshot: TaskAttemptSnapshot = {
      id: asString(payload.attempt_id, previous?.id ?? `${taskId}:${asNumber(payload.attempt, 1)}`),
      run_id: event.run_id,
      task_id: taskId,
      node_id: asNullableString(payload.node_id) ?? previous?.node_id ?? null,
      attempt: asNumber(payload.attempt, previous?.attempt ?? 1),
      status: asString(payload.status, previous?.status ?? 'pending'),
      started_at: asNullableString(payload.started_at) ?? previous?.started_at ?? null,
      completed_at: asNullableString(payload.completed_at) ?? previous?.completed_at ?? null,
      error: payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error)
        ? payload.error as Record<string, unknown>
        : previous?.error ?? null,
      result_manifest: previous?.result_manifest ?? null,
    };
    return {
      ...next,
      taskAttempts: {
        ...next.taskAttempts,
        [taskId]: snapshot,
      },
    };
  }

  return next;
}

export function mapRunStatus(status: string | null | undefined): string {
  switch (status) {
    case 'pending':
      return 'accepted';
    case 'success':
      return 'completed';
    case 'cancelling':
      return 'cancelled';
    case 'blocked':
      return 'failed';
    default:
      return status ?? 'idle';
  }
}

export function computeRunProgress(
  taskIds: string[],
  attempts: Record<string, { status: string } | undefined>,
): number {
  if (taskIds.length === 0) return 0;
  const terminal = new Set(['success', 'skipped', 'cancelled', 'failed', 'artifact_failed']);
  const done = taskIds.filter((taskId) => terminal.has(attempts[taskId]?.status ?? '')).length;
  return Math.round((done / taskIds.length) * 100);
}
