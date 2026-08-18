import { describe, expect, it } from 'vitest';

import type { Project, ReadinessResult, Run, Workflow } from '../../../lib/client';
import { deriveRunBarModel } from '../runBarModel';

const project: Project = {
  id: 'p1',
  name: 'no-path',
  root_path: '/tmp/p1',
  active_workflow_version: 1,
  created_at: '2026-08-19T00:00:00Z',
  updated_at: '2026-08-19T00:00:00Z',
};

const reviewed: Workflow = {
  id: 'wf',
  project_id: 'p1',
  version: 2,
  goal: 'g',
  planner_provider: null,
  planner_model: null,
  status: 'reviewed',
  graph_json: {},
  tasks: [],
  reviewed_at: '2026-08-19T00:00:00Z',
  reviewed_by: 'tester',
  review_snapshot_hash: 'a'.repeat(64),
  review_warnings: [],
  created_at: '2026-08-19T00:00:00Z',
};

const blocked: ReadinessResult = {
  ready: false,
  checkedAt: '2026-08-19T00:00:00Z',
  projectId: 'p1',
  workflowId: 'wf',
  checks: { nodes: 'blocked' },
  issues: [{
    code: 'node_offline',
    severity: 'blocking',
    title: '节点离线',
    message: '执行节点不可达',
    action: 'open_nodes',
    targetId: 'n1',
  }],
};

const ready: ReadinessResult = {
  ready: true,
  checkedAt: '2026-08-19T00:00:00Z',
  projectId: 'p1',
  workflowId: 'wf',
  checks: { nodes: 'ready' },
  issues: [],
};

const running: Run = {
  id: 'run-1',
  workflow_id: 'wf',
  status: 'running',
  started_at: '2026-08-19T00:00:00Z',
  completed_at: null,
  created_at: '2026-08-19T00:00:00Z',
  attempts: [],
  allowed_actions: ['pause', 'cancel'],
};

describe('deriveRunBarModel', () => {
  const base = {
    project,
    runStatus: 'idle',
    runProgress: 0,
    nodesPhase: 'ready' as const,
    onlineNodeCount: 1,
  };

  it('uses resolve when a reviewed workflow is blocked, without progress', () => {
    expect(deriveRunBarModel({ ...base, workflow: reviewed, readiness: blocked, run: null }))
      .toMatchObject({ primaryAction: { kind: 'resolve' }, showProgress: false });
  });

  it('uses execute when reviewed and ready with no run', () => {
    expect(deriveRunBarModel({ ...base, workflow: reviewed, readiness: ready, run: null }))
      .toMatchObject({ primaryAction: { kind: 'execute' }, showProgress: false });
  });

  it('uses pause and progress for a running run', () => {
    expect(deriveRunBarModel({
      ...base,
      workflow: reviewed,
      readiness: ready,
      run: running,
      runStatus: 'running',
      runProgress: 40,
    })).toMatchObject({ primaryAction: { kind: 'pause' }, showProgress: true });
  });

  it('keeps a real project name even when it is no-path', () => {
    const model = deriveRunBarModel({
      ...base,
      workflow: reviewed,
      readiness: ready,
      run: null,
    });
    expect(model.contextLabel).toBe('no-path');
  });

  it('uses review when the only blocker is an unreviewed draft', () => {
    const draft = { ...reviewed, status: 'draft' as const };
    const unreviewed: ReadinessResult = {
      ...blocked,
      issues: [{
        code: 'workflow_not_reviewed',
        severity: 'blocking',
        title: '工作流未审核',
        message: '请先审核',
        action: 'open_workflow',
        targetId: 'wf',
      }],
    };
    expect(deriveRunBarModel({ ...base, workflow: draft, readiness: unreviewed, run: null }))
      .toMatchObject({ primaryAction: { kind: 'review' } });
  });

  it('opens a project when none is selected', () => {
    expect(deriveRunBarModel({
      ...base,
      project: null,
      workflow: null,
      readiness: null,
      run: null,
    }).primaryAction).toMatchObject({ kind: 'open_project' });
  });
});
