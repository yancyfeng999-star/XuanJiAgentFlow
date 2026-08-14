import type {
  ExecutionPolicy,
  ExpectedOutput,
  RetryPolicy,
  VerifyStep,
  WorkflowTask,
} from '../../lib/client';

export type InspectorTab = 'overview' | 'prompt_inputs' | 'execution' | 'outputs' | 'run_details';
export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
export type RunGate = WorkflowTask['run_gate'];

export interface TaskDraft {
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
  run_gate: RunGate;
}

export function taskToDraft(task: WorkflowTask): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    prompt: task.prompt,
    agent_type: task.agent_type,
    dependencies: [...task.dependencies],
    execution_policy: { ...task.execution_policy, required_models: [...task.execution_policy.required_models], required_tools: [...task.execution_policy.required_tools], required_tags: [...task.execution_policy.required_tags] },
    retry_policy: { ...task.retry_policy },
    expected_outputs: task.expected_outputs.map((item) => ({ ...item })),
    writes: [...task.writes],
    done_definition: [...task.done_definition],
    verify: task.verify.map((item) => ({ ...item })),
    run_gate: task.run_gate,
  };
}

export function draftToPatch(draft: TaskDraft): Omit<TaskDraft, never> {
  return {
    ...draft,
    expected_outputs: draft.expected_outputs
      .map((output) => ({ path: output.path.trim(), media_type: output.media_type || null }))
      .filter((output) => output.path),
    writes: draft.writes.map((line) => line.trim()).filter(Boolean),
    done_definition: draft.done_definition.map((line) => line.trim()).filter(Boolean),
    verify: draft.verify.filter((step) => step.value.trim()),
  };
}

export function relativePathError(path: string): string | null {
  const value = path.trim();
  if (!value) return 'empty';
  if (value.startsWith('/') || value.includes('..') || /^[A-Za-z]:/.test(value)) return 'absolute';
  return null;
}

export function draftEquals(left: TaskDraft, right: TaskDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function wouldCreateCycle(tasks: Array<{ id: string; dependencies: string[] }>, taskId: string, dependencies: string[]): boolean {
  if (dependencies.includes(taskId)) return true;
  const known = new Set(tasks.map((task) => task.id));
  if (dependencies.some((id) => !known.has(id))) return true;
  const remaining = new Map(tasks.map((task) => [task.id, new Set(task.id === taskId ? dependencies : task.dependencies)]));
  const ready: string[] = [];
  for (;;) {
    const next = [...remaining.entries()].filter(([, deps]) => deps.size === 0).map(([id]) => id);
    if (next.length === 0) return remaining.size > 0;
    for (const id of next) remaining.delete(id);
    for (const deps of remaining.values()) next.forEach((id) => deps.delete(id));
    ready.push(...next);
  }
}
