import { useState, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import Badge from '../components/Badge';
import { startRun, cancelRun, getRun, connectWebSocket } from '../lib/api';

export default function RunPanel({ data }: { data: any }) {
  const [nodes, setNodes] = useState(data.nodes || []);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!data.runId) return;
    setIsRunning(true);

    const ws = connectWebSocket(data.runId, (msg: any) => {
      if (msg.type === 'task_status') {
        setNodes((prev: any[]) => prev.map((n: any) =>
          n.id === msg.task_id ? { ...n, status: msg.status } : n
        ));
        setLogs(prev => [...prev, `${msg.task_id}: ${msg.status}`]);
      }
      if (msg.type === 'run_completed') {
        setIsRunning(false);
        data.onComplete?.();
      }
      if (msg.type === 'run_failed') {
        setIsRunning(false);
      }
    });
    wsRef.current = ws;

    startRun(data.runId).then(res => {
      setIsRunning(false);
      if (res.status === 'completed') {
        getRun(data.runId).then(r => {
          if (r.nodes) setNodes(r.nodes);
        });
        data.onComplete?.();
      }
    }).catch(() => setIsRunning(false));

    return () => { ws.close(); };
  }, [data.runId]);

  const completed = nodes.filter((n: any) => n.status === 'success').length;
  const total = nodes.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="panel-node" style={{ width: 340 }}>
      <div className="panel-header">
        <div className="panel-header-dot" style={{ background: '#10B981' }} />
        执行监控
        <Badge variant={isRunning ? 'running' : 'success'} size="sm">
          {isRunning ? '运行中' : '已完成'}
        </Badge>
      </div>
      <div className="panel-body">
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
          {pct}% · {completed}/{total}
        </div>
        <div className="progress-mini">
          <div className="progress-mini-fill" style={{ width: `${pct}%` }} />
        </div>

        {nodes.map((task: any) => {
          const s = task.status || 'pending';
          return (
            <div key={task.id} className="task-mini">
              <div className={`task-mini-status ${s}`}>
                {s === 'success' ? '✓' : s === 'running' ? '⟳' : s === 'failed' ? '✕' : '⏳'}
              </div>
              <span className="task-mini-title">{task.title}</span>
            </div>
          );
        })}

        {logs.length > 0 && (
          <div className="log-mini" style={{ marginTop: 8 }}>
            {logs.slice(-8).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
