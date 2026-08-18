import { describe, expect, it, vi } from 'vitest';

import type { WorkflowTask } from '../../../lib/client';
import { buildWorkflowEdges, buildWorkflowNodes, DEFAULT_VIEW } from '../workflowGraph';

function task(id: string, deps: string[] = []): WorkflowTask {
  return {
    id,
    workflow_id: 'wf',
    title: id,
    description: '',
    prompt: '',
    agent_type: 'general',
    dependencies: deps,
    execution_policy: {
      mode: 'auto',
      node_id: null,
      node_group: null,
      required_models: [],
      required_tools: [],
      required_tags: [],
      timeout_seconds: 1800,
    },
    retry_policy: { max_attempts: 3, delay_seconds: 1 },
    expected_outputs: [],
    writes: [],
    done_definition: [],
    verify: [],
    run_gate: 'auto',
    ui_position: { x: 10, y: 10 },
  };
}

describe('workflowGraph', () => {
  it('reuses unchanged task data references across remaps', () => {
    const tasks = [task('task-a'), task('task-b')];
    const first = buildWorkflowNodes(tasks, null, []);
    const selected = buildWorkflowNodes(tasks, 'task-a', first);
    expect(selected.find((node) => node.id === 'task-b')?.data)
      .toBe(first.find((node) => node.id === 'task-b')?.data);
    expect(selected.find((node) => node.id === 'task-a')?.selected).toBe(true);
  });

  it('merges 200 node positions with one Map and one pass', () => {
    const tasks = Array.from({ length: 200 }, (_, index) => task(`task-${index}`));
    const current = buildWorkflowNodes(tasks, null, []);
    const findSpy = vi.spyOn(Array.prototype, 'find');
    findSpy.mockClear();
    const next = buildWorkflowNodes(tasks, 'task-3', current);
    expect(findSpy.mock.instances).not.toContain(current);
    expect(next).toHaveLength(200);
    expect(next[3]?.data).toBe(current[3]?.data);
    findSpy.mockRestore();
  });

  it('animates only edges touching an active attempt', () => {
    const tasks = [task('a'), task('b', ['a']), task('c', ['b'])];
    const t = (key: string) => key;
    const idle = buildWorkflowEdges(tasks, {}, t);
    expect(idle.every((edge) => edge.animated === false)).toBe(true);

    const active = buildWorkflowEdges(tasks, { b: { status: 'running' } }, t);
    expect(active.find((edge) => edge.id === 'a-b')?.animated).toBe(true);
    expect(active.find((edge) => edge.id === 'b-c')?.animated).toBe(true);

    const reduced = buildWorkflowEdges(tasks, { b: { status: 'running' } }, t, true);
    expect(reduced.every((edge) => edge.animated === false)).toBe(true);
  });

  it('locks a readable default view', () => {
    expect(DEFAULT_VIEW.fitMinZoom).toBe(0.62);
    expect(DEFAULT_VIEW.minZoom).toBe(0.55);
  });
});
