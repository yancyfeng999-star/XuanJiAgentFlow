import { memo, Profiler, type ReactNode } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import I18nProvider from '../lib/I18nProvider';
import type { TaskAttempt, WorkflowTask } from '../lib/client';
import { TaskNode } from '../features/canvas/nodes/TaskNode';
import type { TaskNodeData, WorkflowNode } from '../features/canvas/nodeTypes';
import { useWorkspaceStore } from '../store/workspaceStore';

afterEach(cleanup);

const nodePassThrough = {
  type: 'task' as const,
  dragging: false,
  selectable: true,
  deletable: true,
  draggable: true,
  zIndex: 1,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
};

function makeTask(id: string, title: string): WorkflowTask {
  return {
    id,
    workflow_id: 'wf-render',
    title,
    description: `${title} description`,
    prompt: 'Prompt must stay off the card',
    agent_type: 'research',
    dependencies: [],
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
    expected_outputs: [{ path: `${id}.md`, media_type: 'text/markdown' }],
    writes: [],
    done_definition: [],
    verify: [],
    run_gate: 'auto',
    ui_position: { x: 0, y: 0 },
  };
}

const taskA = makeTask('task-a', '任务 A') as TaskNodeData;
const taskB = makeTask('task-b', '任务 B') as TaskNodeData;

function makeAttempt(taskId: string, attempt: number, status: string): TaskAttempt {
  return {
    id: `${taskId}-attempt-${attempt}`,
    run_id: 'run-1',
    task_id: taskId,
    node_id: 'node-1',
    attempt,
    status,
    started_at: '2026-08-18T00:00:00Z',
    completed_at: null,
    error: null,
    result_manifest: null,
  };
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </I18nProvider>
  );
}

const IsolatedTaskNode = memo(function IsolatedTaskNode({
  onCommit,
  ...props
}: NodeProps<WorkflowNode> & { onCommit: () => void }) {
  return (
    <Profiler id={props.id} onRender={onCommit}>
      <TaskNode {...props} />
    </Profiler>
  );
});

function TaskPair({
  onCommitA,
  onCommitB,
}: {
  onCommitA: () => void;
  onCommitB: () => void;
}) {
  const selectedTaskId = useWorkspaceStore((state) => state.selectedTaskId);
  return (
    <>
      <IsolatedTaskNode
        id={taskA.id}
        data={taskA}
        selected={selectedTaskId === taskA.id}
        onCommit={onCommitA}
        {...nodePassThrough}
      />
      <IsolatedTaskNode
        id={taskB.id}
        data={taskB}
        selected={selectedTaskId === taskB.id}
        onCommit={onCommitB}
        {...nodePassThrough}
      />
    </>
  );
}

beforeEach(() => {
  useWorkspaceStore.getState().resetWorkspace();
});

function renderTaskPair(commits: { a: number; b: number }) {
  const onCommitA = () => { commits.a += 1; };
  const onCommitB = () => { commits.b += 1; };
  return render(
    <Providers>
      <TaskPair onCommitA={onCommitA} onCommitB={onCommitB} />
    </Providers>,
  );
}

describe('TaskNode render isolation', () => {
  it('does not commit task B when selecting task A if B data, selected, and attempt are unchanged', () => {
    const commits = { a: 0, b: 0 };
    renderTaskPair(commits);
    expect(screen.getByRole('button', { name: '选择任务：任务 A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择任务：任务 B' })).toBeInTheDocument();

    const afterMount = { ...commits };
    const attemptB = useWorkspaceStore.getState().taskAttempts[taskB.id];

    act(() => {
      useWorkspaceStore.getState().selectTask(taskA.id);
    });

    expect(useWorkspaceStore.getState().selectedTaskId).toBe(taskA.id);
    expect(useWorkspaceStore.getState().taskAttempts[taskB.id]).toBe(attemptB);
    expect(screen.getByRole('button', { name: '选择任务：任务 B' })).not.toHaveClass('is-selected');
    expect(screen.getByRole('button', { name: '选择任务：任务 A' })).toHaveClass('is-selected');
    expect(commits.b).toBe(afterMount.b);
    expect(commits.a).toBeGreaterThan(afterMount.a);
  });

  it('does not change TaskNode render counts when a thinking-model pending action is added', () => {
    const commits = { a: 0, b: 0 };
    renderTaskPair(commits);
    const afterMount = { ...commits };

    act(() => {
      useWorkspaceStore.setState({
        pendingActions: [{ kind: 'save_thinking_model', key: 'model-1' }],
      });
    });

    expect(useWorkspaceStore.getState().pendingActions).toEqual([
      { kind: 'save_thinking_model', key: 'model-1' },
    ]);
    expect(commits).toEqual(afterMount);
  });

  it('only commits task B when task B attempt updates', () => {
    const commits = { a: 0, b: 0 };
    renderTaskPair(commits);
    const afterMount = { ...commits };
    const attemptB = makeAttempt(taskB.id, 1, 'running');

    act(() => {
      useWorkspaceStore.getState().applyRunMonitor({
        taskAttempts: { [taskB.id]: attemptB },
      });
    });

    expect(useWorkspaceStore.getState().taskAttempts[taskB.id]).toBe(attemptB);
    expect(useWorkspaceStore.getState().taskAttempts[taskA.id]).toBeUndefined();
    expect(commits.a).toBe(afterMount.a);
    expect(commits.b).toBeGreaterThan(afterMount.b);
  });
});
