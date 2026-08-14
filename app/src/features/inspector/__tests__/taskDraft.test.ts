import { describe, expect, it } from 'vitest';

import type { WorkflowTask } from '../../../lib/client';
import { draftToPatch, relativePathError, taskToDraft, wouldCreateCycle } from '../taskDraft';

const task: WorkflowTask = {
  id: 't1',
  workflow_id: 'wf',
  title: '调研',
  description: '说明',
  prompt: '完整指令',
  agent_type: 'research',
  dependencies: ['t0'],
  execution_policy: {
    mode: 'fixed',
    node_id: 'n1',
    node_group: null,
    required_models: ['m1'],
    required_tools: ['web'],
    required_tags: ['gpu'],
    timeout_seconds: 900,
  },
  retry_policy: { max_attempts: 2, delay_seconds: 5 },
  expected_outputs: [{ path: 'out.md', media_type: 'text/markdown' }],
  writes: ['out.md'],
  done_definition: ['文件存在'],
  verify: [{ kind: 'file_exists', value: 'out.md' }],
  run_gate: 'review_before_complete',
  ui_position: { x: 1, y: 2 },
};

describe('taskDraft', () => {
  it('round-trips every contract field without dropping values', () => {
    const draft = taskToDraft(task);
    const patch = draftToPatch(draft);
    expect(patch.title).toBe('调研');
    expect(patch.agent_type).toBe('research');
    expect(patch.prompt).toBe('完整指令');
    expect(patch.dependencies).toEqual(['t0']);
    expect(patch.execution_policy).toEqual(task.execution_policy);
    expect(patch.retry_policy).toEqual(task.retry_policy);
    expect(patch.expected_outputs).toEqual(task.expected_outputs);
    expect(patch.writes).toEqual(['out.md']);
    expect(patch.done_definition).toEqual(['文件存在']);
    expect(patch.verify).toEqual([{ kind: 'file_exists', value: 'out.md' }]);
    expect(patch.run_gate).toBe('review_before_complete');
  });

  it('rejects absolute output paths and self/cycle dependencies', () => {
    expect(relativePathError('/tmp/out.md')).toBe('absolute');
    expect(relativePathError('../secret')).toBe('absolute');
    expect(relativePathError('out.md')).toBeNull();
    expect(wouldCreateCycle(
      [{ id: 'a', dependencies: [] }, { id: 'b', dependencies: ['a'] }],
      'a',
      ['b'],
    )).toBe(true);
    expect(wouldCreateCycle(
      [{ id: 'a', dependencies: [] }, { id: 'b', dependencies: ['a'] }],
      'b',
      ['a'],
    )).toBe(false);
    expect(wouldCreateCycle(
      [{ id: 'a', dependencies: [] }],
      'a',
      ['a'],
    )).toBe(true);
    expect(wouldCreateCycle(
      [{ id: 'a', dependencies: [] }],
      'a',
      ['missing'],
    )).toBe(true);
  });
});
