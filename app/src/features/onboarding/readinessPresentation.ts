import type { ReadinessAction, ReadinessIssue, ReadinessResult } from '../../lib/client';

export type ReadinessGroupKey =
  | 'project'
  | 'thinking_model'
  | 'workflow_review'
  | 'node_config'
  | 'node_credentials'
  | 'task_matching';

export interface ReadinessGroup {
  key: ReadinessGroupKey | 'node_offline';
  severity: 'blocking' | 'warning' | 'info';
  title: string;
  message: string;
  count: number;
  action: ReadinessAction;
  targetIds: string[];
  suppressedCodes: string[];
  issues: ReadinessIssue[];
}

const GROUP_ORDER: ReadinessGroupKey[] = [
  'project',
  'thinking_model',
  'workflow_review',
  'node_config',
  'node_credentials',
  'task_matching',
];

function classify(issue: ReadinessIssue): ReadinessGroupKey {
  const code = issue.code;
  if (code === 'task_without_matching_node' || code.startsWith('task_')) return 'task_matching';
  if (code.startsWith('project_') || issue.action === 'open_project') return 'project';
  if (
    code.includes('thinking_model')
    || code.startsWith('planner_')
    || issue.action === 'open_planner'
  ) {
    return 'thinking_model';
  }
  if (code.startsWith('workflow_') || issue.action === 'open_workflow') return 'workflow_review';
  if (code.includes('credential') && (code.startsWith('node_') || code.includes('node'))) {
    return 'node_credentials';
  }
  if (
    code === 'node_offline'
    || code === 'node_missing'
    || code === 'node_degraded'
    || code.startsWith('node_')
    || issue.action === 'open_nodes'
  ) {
    return 'node_config';
  }
  if (code.includes('credential')) return 'thinking_model';
  return 'task_matching';
}

function isThinkingModelCredential(issue: ReadinessIssue): boolean {
  return classify(issue) === 'thinking_model' && issue.code.includes('credential');
}

export function buildReadinessGroups(result: ReadinessResult, taskCount: number): ReadinessGroup[] {
  const buckets = new Map<ReadinessGroupKey, ReadinessIssue[]>();
  for (const issue of result.issues) {
    const key = classify(issue);
    const list = buckets.get(key) ?? [];
    list.push(issue);
    buckets.set(key, list);
  }

  const suppressedCodes: string[] = [];
  const hasNodeRoot = buckets.has('node_config');
  if (hasNodeRoot) {
    const matching = buckets.get('task_matching') ?? [];
    const creds = buckets.get('node_credentials') ?? [];
    for (const issue of matching) suppressedCodes.push(issue.code);
    for (const issue of creds) suppressedCodes.push(issue.code);
    buckets.delete('task_matching');
    buckets.delete('node_credentials');
  }

  const groups: ReadinessGroup[] = [];
  for (const key of GROUP_ORDER) {
    const issues = buckets.get(key);
    if (!issues?.length) continue;
    const primary = issues[0];
    const targetIds = [...new Set(issues.map((issue) => issue.targetId).filter((id): id is string => Boolean(id)))];
    const nodeOffline = issues.some((issue) => issue.code === 'node_offline');
    groups.push({
      key: nodeOffline ? 'node_offline' : key,
      severity: issues.some((issue) => issue.severity === 'blocking') ? 'blocking' : issues[0].severity,
      title: primary.title,
      message: primary.message,
      count: nodeOffline && taskCount > 0 ? taskCount : Math.max(issues.length, targetIds.length, 1),
      action: primary.action,
      targetIds,
      suppressedCodes: key === 'node_config' ? [...new Set(suppressedCodes)] : [],
      issues,
    });
  }

  return groups.filter((group) => {
    if (group.key === 'thinking_model') return true;
    if (isThinkingModelCredential(group.issues[0])) return true;
    return true;
  });
}

export function firstBlockingGroup(groups: ReadinessGroup[]): ReadinessGroup | null {
  return groups.find((group) => group.severity === 'blocking') ?? groups[0] ?? null;
}
