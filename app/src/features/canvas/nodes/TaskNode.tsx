import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

import { useWorkspaceStore } from '../../../store/workspaceStore';
import type { WorkflowNode } from '../nodeTypes';

const statusLabels: Record<string, string> = {
  pending: '等待执行',
  ready: '就绪',
  dispatching: '派发中',
  running: '运行中',
  collecting: '收集产物',
  success: '成功',
  failed: '失败',
  blocked: '阻塞',
  skipped: '已跳过',
  cancelled: '已取消',
  retry_wait: '等待重试',
};

export function TaskNode({ data, selected }: NodeProps<WorkflowNode>) {
  const selectTask = useWorkspaceStore((state) => state.selectTask);
  const attempt = useWorkspaceStore((state) => state.taskAttempts[data.id]);
  const status = attempt?.status ?? 'pending';
  return <button type="button" className={`task-node ${selected ? 'is-selected' : ''}`} aria-label={`选择任务：${data.title}`} onClick={() => selectTask(data.id)}>
    <Handle type="target" position={Position.Left} />
    <div className="task-node__head"><strong>{data.title}</strong><span>{data.agent_type}</span></div>
    <p>{data.description}</p>
    <div className="task-node__meta">
      <span>{statusLabels[status] ?? status}</span>
      <span>{attempt?.node_id ? `节点 ${attempt.node_id}` : data.execution_policy.mode}</span>
    </div>
    <div className="task-node__files">
      输入 {data.dependencies.length} · 产出 {data.expected_outputs.length}
      {attempt ? ` · #${attempt.attempt}` : ''}
    </div>
    <Handle type="source" position={Position.Right} />
  </button>;
}
