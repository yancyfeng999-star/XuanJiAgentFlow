import { Bot, Clock3, FileOutput, RotateCcw, Server } from 'lucide-react';

import ArtifactBrowser from '../artifacts/ArtifactBrowser';
import TaskLog from '../runs/TaskLog';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { agentTypeLabel, schedulingModeLabel, statusLabel } from '../../lib/labels';
import TaskEditor from './TaskEditor';

export default function Inspector() {
  const task = useWorkspaceStore((state) => state.workflow?.tasks.find((item) => item.id === state.selectedTaskId));
  const run = useWorkspaceStore((state) => state.run);
  const attempt = useWorkspaceStore((state) => (
    state.selectedTaskId ? state.taskAttempts[state.selectedTaskId] ?? null : null
  ));
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const nodeName = attempt?.node_id
    ? nodes.find((node) => node.id === attempt.node_id)?.name ?? attempt.node_id
    : '未分配';

  return (
    <aside className="inspector" aria-label="节点检查器">
      {!task ? (
        <div className="inspector-empty">
          <Bot size={28} />
          <h2>节点检查器</h2>
          <p>选择画布中的任务，查看并编辑任务定义、调度约束和产出。</p>
        </div>
      ) : (
        <>
          <div className="inspector-head">
            <span>{agentTypeLabel(task.agent_type)}</span>
            <h2>{task.title}</h2>
            <p>{task.description}</p>
          </div>
          <TaskEditor task={task} />
          <section className="detail-grid">
            <div><Bot size={15} /><span>任务类型</span><b>{agentTypeLabel(task.agent_type)}</b></div>
            <div><Clock3 size={15} /><span>超时</span><b>{task.execution_policy.timeout_seconds} 秒</b></div>
            <div><RotateCcw size={15} /><span>最大尝试</span><b>{task.retry_policy.max_attempts}</b></div>
            <div><FileOutput size={15} /><span>预期产出</span><b>{task.expected_outputs.length}</b></div>
          </section>
          <section>
            <label>调度约束</label>
            <p className="constraint">
              {schedulingModeLabel(task.execution_policy.mode)} · {task.execution_policy.required_tags.join('、') || '无标签限制'}
            </p>
          </section>
          {run && (
            <section className="execution-panel" aria-label="执行详情">
              <label>执行状态</label>
              <div className="execution-meta">
                <div><Server size={14} /><span>执行节点</span><b>{nodeName}</b></div>
                <div><RotateCcw size={14} /><span>尝试次数</span><b>{attempt?.attempt ?? '尚未执行'}</b></div>
                <div><span>状态</span><b>{statusLabel(attempt?.status)}</b></div>
              </div>
              {attempt?.error && (
                <div className="inline-error" role="alert">
                  <strong>任务执行失败</strong>
                  <span>
                    {typeof attempt.error.message === 'string' && /[\u4e00-\u9fff]/.test(attempt.error.message)
                      ? attempt.error.message
                      : '执行节点返回错误，请查看任务日志'}
                  </span>
                </div>
              )}
              <TaskLog runId={run.id} taskId={task.id} />
              <ArtifactBrowser runId={run.id} taskId={task.id} />
            </section>
          )}
        </>
      )}
    </aside>
  );
}
