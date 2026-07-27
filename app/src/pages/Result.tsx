import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Copy, Plus, ChevronRight } from 'lucide-react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { exportRun, getResults } from '../lib/api';
import './Result.css';

interface DagNode {
  id: string;
  title: string;
  description: string;
  agent_type: string;
  status: string;
  result?: string;
}

interface TaskResult {
  title: string;
  status: string;
  result: string;
}

export default function ResultPage() {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<DagNode[]>([]);
  const [goal, setGoal] = useState('');
  const [runId, setRunId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [results, setResults] = useState<Record<string, TaskResult>>({});

  useEffect(() => {
    const stored = sessionStorage.getItem('plan_result');
    if (stored) {
      const result = JSON.parse(stored);
      setNodes(result.nodes || []);
      setGoal(result.goal || '');
      setRunId(result.id || '');
      if (result.nodes?.length) setSelectedId(result.nodes[0].id);
    }
  }, []);

  useEffect(() => {
    if (!runId) return;
    getResults(runId).then(r => {
      if (r.tasks) setResults(r.tasks);
    }).catch(() => {});
  }, [runId]);

  const selectedNode = nodes.find(n => n.id === selectedId);
  const selectedResult = results[selectedId];

  const handleExport = async () => {
    if (!runId) return;
    try {
      const result = await exportRun(runId);
      await navigator.clipboard.writeText(result.text);
      alert('已复制到剪贴板');
    } catch {
      alert('导出失败');
    }
  };

  return (
    <div className="page">
      <TopBar
        title={goal || '运行结果'}
        backTo="/"
        rightBadge={<Badge variant="success">已完成</Badge>}
        actions={
          <>
            <Button variant="secondary" onClick={handleExport}>
              <Download size={14} />
              导出全部
            </Button>
            <Button variant="secondary" onClick={handleExport}>
              <Copy size={14} />
              复制报告
            </Button>
            <Button onClick={() => navigate('/input')}>
              <Plus size={14} />
              新建运行
            </Button>
          </>
        }
      />
      <div className="content result-content-wrapper">
        <div className="result-layout">
          <div className="result-sidebar">
            <div className="result-sidebar-title">任务产出</div>
            {nodes.map((node) => (
              <div
                key={node.id}
                className={`result-task-item ${selectedId === node.id ? 'active' : ''}`}
                onClick={() => setSelectedId(node.id)}
              >
                <span className="result-task-check">
                  {node.status === 'success' ? '✓' : node.status === 'failed' ? '✕' : '⏳'}
                </span>
                <span className="result-task-name">{node.title}</span>
                <ChevronRight size={12} className="result-task-arrow" />
              </div>
            ))}
          </div>

          <div className="result-main">
            {selectedNode ? (
              <div className="result-card">
                <h3>{selectedNode.title}</h3>
                <div className="result-text">
                  <p><strong>类型：</strong>{selectedNode.agent_type} Agent</p>
                  <p><strong>描述：</strong>{selectedNode.description}</p>
                  <p><strong>状态：</strong>{selectedNode.status}</p>
                  {selectedResult?.result && (
                    <>
                      <div className="panel-divider" style={{ margin: '16px 0' }} />
                      <h4>执行结果</h4>
                      <pre style={{
                        background: 'var(--bg)',
                        padding: 16,
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 13,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {selectedResult.result}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="result-card" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 60 }}>
                选择任务查看详情
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
