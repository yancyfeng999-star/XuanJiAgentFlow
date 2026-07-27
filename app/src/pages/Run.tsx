import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pause, Square } from 'lucide-react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { getRun, startRun, cancelRun, connectWebSocket } from '../lib/api';
import './Run.css';

interface DagNode {
  id: string;
  title: string;
  description: string;
  agent_type: string;
  status: string;
  dependencies: string[];
}

interface LogLine {
  time: string;
  level: string;
  msg: string;
}

export default function RunPage() {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<DagNode[]>([]);
  const [goal, setGoal] = useState('');
  const [runId, setRunId] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('plan_result');
    if (stored) {
      const result = JSON.parse(stored);
      setNodes(result.nodes || []);
      setGoal(result.goal || '');
      setRunId(result.id || '');
    }
  }, []);

  // 自动启动执行
  useEffect(() => {
    if (!runId || isRunning) return;
    setIsRunning(true);

    // 连接WebSocket
    const ws = connectWebSocket(runId, (data) => {
      if (data.type === 'task_status') {
        setNodes(prev => prev.map(n =>
          n.id === data.task_id ? { ...n, status: data.status } : n
        ));
        setLogs(prev => [...prev, {
          time: new Date().toLocaleTimeString(),
          level: data.status === 'success' ? 'INFO' : data.status === 'failed' ? 'ERROR' : 'INFO',
          msg: `${data.task_id}: ${data.status} ${data.result ? '- ' + data.result.slice(0, 80) : ''}`,
        }]);
      }
      if (data.type === 'run_completed') {
        setIsRunning(false);
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), level: 'INFO', msg: '全部任务完成' }]);
      }
      if (data.type === 'run_failed') {
        setIsRunning(false);
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), level: 'ERROR', msg: '运行失败: ' + (data.error || '') }]);
      }
    });
    wsRef.current = ws;

    // 调用执行API
    startRun(runId).then(res => {
      if (res.status === 'completed') {
        setIsRunning(false);
        // 刷新最终状态
        getRun(runId).then(r => {
          if (r.nodes) setNodes(r.nodes);
        });
      }
    }).catch(() => setIsRunning(false));

    return () => { ws.close(); };
  }, [runId]);

  const completed = nodes.filter(n => n.status === 'success').length;
  const total = nodes.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleCancel = async () => {
    if (runId) await cancelRun(runId);
    setIsRunning(false);
  };

  return (
    <div className="page">
      <TopBar
        title={`运行中 · ${goal.slice(0, 20)}`}
        backTo="/edit"
        rightBadge={<Badge variant={isRunning ? 'running' : 'success'}>{isRunning ? '执行中' : '已完成'}</Badge>}
      />
      <div className="content">
        <div className="run-monitor">
          <div className="run-progress-section">
            <div className="run-progress-header">
              <h3>整体进度</h3>
              <span>{completed}/{total} 任务完成</span>
            </div>
            <div className="run-progress-bar">
              <div className="run-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="run-progress-stats">
              <span>{pct}%</span>
              <span>运行ID: {runId}</span>
            </div>
          </div>

          <div className="task-list">
            {nodes.map((task) => {
              const status = task.status || 'pending';
              return (
                <div key={task.id} className={`task-item ${status === 'running' ? 'task-item-running' : ''}`}>
                  <div className={`task-status-icon task-status-${status}`}>
                    {status === 'success' && '✓'}
                    {status === 'running' && '⟳'}
                    {status === 'pending' && '⏳'}
                    {status === 'failed' && '✕'}
                  </div>
                  <div className="task-info">
                    <h4>{task.title}</h4>
                    <p>{task.description}</p>
                  </div>
                  <div className="task-meta">
                    <Badge
                      variant={status === 'success' ? 'success' : status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'pending'}
                      size="sm"
                    >
                      {status === 'success' ? '已完成' : status === 'running' ? '运行中' : status === 'failed' ? '失败' : '等待中'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="log-panel">
            <div className="log-header">实时日志</div>
            <div className="log-body">
              {logs.length === 0 ? (
                <div className="log-line">
                  <span className="log-time">--:--:--</span>
                  <span className="log-level">INFO</span>
                  <span className="log-msg">等待执行开始...</span>
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="log-line">
                    <span className="log-time">{log.time}</span>
                    <span className="log-level">{log.level}</span>
                    <span className="log-msg">{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="run-actions">
            <Button variant="secondary" disabled={!isRunning}>
              <Pause size={14} />
              暂停
            </Button>
            <Button variant="danger" onClick={handleCancel} disabled={!isRunning}>
              <Square size={14} />
              终止
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
