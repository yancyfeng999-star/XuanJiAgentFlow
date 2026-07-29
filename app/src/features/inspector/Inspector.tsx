import { Bot, Clock3, FileOutput, RotateCcw } from 'lucide-react';

import { useWorkspaceStore } from '../../store/workspaceStore';
import TaskEditor from './TaskEditor';

export default function Inspector() {
  const task = useWorkspaceStore((state) => state.workflow?.tasks.find((item) => item.id === state.selectedTaskId));

  return (
    <aside className="inspector" aria-label="节点检查器">
      {!task ? <div className="inspector-empty"><Bot size={28} /><h2>节点检查器</h2><p>选择画布中的任务，查看并编辑任务定义、调度约束和产出。</p></div> : <>
        <div className="inspector-head"><span>{task.agent_type}</span><h2>{task.title}</h2><p>{task.description}</p></div>
        <TaskEditor task={task} />
        <section className="detail-grid">
          <div><Bot size={15} /><span>Agent 类型</span><b>{task.agent_type}</b></div>
          <div><Clock3 size={15} /><span>超时</span><b>{task.execution_policy.timeout_seconds}s</b></div>
          <div><RotateCcw size={15} /><span>最大尝试</span><b>{task.retry_policy.max_attempts}</b></div>
          <div><FileOutput size={15} /><span>预期产出</span><b>{task.expected_outputs.length}</b></div>
        </section>
        <section><label>调度约束</label><p className="constraint">{task.execution_policy.mode} · {task.execution_policy.required_tags.join(', ') || '无标签限制'}</p></section>
      </>}
    </aside>
  );
}
