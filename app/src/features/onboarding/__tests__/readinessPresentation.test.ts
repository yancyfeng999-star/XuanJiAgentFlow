import { describe, expect, it } from 'vitest';

import type { ReadinessIssue, ReadinessResult } from '../../../lib/client';
import { buildReadinessGroups } from '../readinessPresentation';

function issue(partial: Partial<ReadinessIssue> & Pick<ReadinessIssue, 'code' | 'title'>): ReadinessIssue {
  return {
    severity: 'blocking',
    message: partial.title,
    action: 'open_nodes',
    targetId: null,
    ...partial,
  };
}

const blockedResult: ReadinessResult = {
  ready: false,
  checkedAt: '2026-08-19T00:00:00Z',
  projectId: 'p1',
  workflowId: 'wf',
  checks: { nodes: 'blocked', tasks: 'blocked' },
  issues: [],
};

describe('buildReadinessGroups', () => {
  it('folds unmatched tasks into a single node_offline group', () => {
    const nodeOffline = issue({ code: 'node_offline', title: '节点离线', action: 'open_nodes', targetId: 'n1' });
    const taskAUnmatched = issue({
      code: 'task_without_matching_node',
      title: '任务 A 无匹配节点',
      action: 'open_nodes',
      targetId: 'task-a',
    });
    const taskBUnmatched = issue({
      code: 'task_without_matching_node',
      title: '任务 B 无匹配节点',
      action: 'open_nodes',
      targetId: 'task-b',
    });
    const taskCUnmatched = issue({
      code: 'task_without_matching_node',
      title: '任务 C 无匹配节点',
      action: 'open_nodes',
      targetId: 'task-c',
    });
    const groups = buildReadinessGroups({
      ...blockedResult,
      issues: [nodeOffline, taskAUnmatched, taskBUnmatched, taskCUnmatched],
    }, 7);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'node_offline', count: 7 });
    expect(groups[0].suppressedCodes).toContain('task_without_matching_node');
  });

  it('keeps capability mismatches when nodes are online', () => {
    const groups = buildReadinessGroups({
      ...blockedResult,
      issues: [
        issue({ code: 'task_without_matching_node', title: '任务甲', targetId: 't1', action: 'open_workflow' }),
        issue({ code: 'task_without_matching_node', title: '任务乙', targetId: 't2', action: 'open_workflow' }),
      ],
    }, 2);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('task_matching');
    expect(groups[0].targetIds).toEqual(['t1', 't2']);
  });

  it('merges node credentials into an offline root cause but keeps thinking-model credentials', () => {
    const groups = buildReadinessGroups({
      ...blockedResult,
      issues: [
        issue({ code: 'node_offline', title: '节点离线', action: 'open_nodes', targetId: 'n1' }),
        issue({ code: 'node_credential_missing', title: '节点凭据缺失', action: 'open_nodes', targetId: 'n1' }),
        issue({
          code: 'planner_credential_missing',
          title: '思考模型凭据缺失',
          action: 'open_planner',
          targetId: 'model-1',
        }),
      ],
    }, 3);
    expect(groups.map((group) => group.key)).toEqual(['thinking_model', 'node_offline']);
    const nodeGroup = groups.find((group) => group.key === 'node_offline');
    expect(nodeGroup?.suppressedCodes).toContain('node_credential_missing');
    expect(groups.find((group) => group.key === 'thinking_model')?.issues[0].code).toBe('planner_credential_missing');
  });
});
