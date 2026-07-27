import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { WorkflowNode } from '../nodeTypes';
import { useWorkspaceStore } from '../../../store/workspaceStore';
export function TaskNode({ data, selected }: NodeProps<WorkflowNode>) {
  const selectTask = useWorkspaceStore((state) => state.selectTask);
  return <button type="button" className={`task-node ${selected ? 'is-selected' : ''}`} aria-label={`选择任务：${data.title}`} onClick={() => selectTask(data.id)}>
    <Handle type="target" position={Position.Left} />
    <div className="task-node__head"><strong>{data.title}</strong><span>{data.agentType}</span></div>
    <p>{data.description}</p><div className="task-node__meta"><span>等待执行</span><span>自动选择</span></div>
    <div className="task-node__files">输入 {data.dependencies.length} · 产出 {data.expectedOutputs.length}</div>
    <Handle type="source" position={Position.Right} />
  </button>;
}
