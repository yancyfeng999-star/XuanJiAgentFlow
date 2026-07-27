import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Link, GitBranch } from 'lucide-react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import { startRun } from '../lib/api';
import './Edit.css';

interface DagNode {
  id: string;
  title: string;
  description: string;
  agent_type: string;
  dependencies: string[];
  estimated_time: string;
}

const typeIcons: Record<string, string> = {
  research: '🔍',
  code: '📄',
  business: '⚡',
  review: '✓',
};

export default function EditPage() {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<DagNode[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [runId, setRunId] = useState<string>('');

  useEffect(() => {
    const stored = sessionStorage.getItem('dag_nodes');
    const planResult = sessionStorage.getItem('plan_result');
    if (stored) {
      setNodes(JSON.parse(stored));
    }
    if (planResult) {
      const r = JSON.parse(planResult);
      setRunId(r.id);
    }
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedId) || nodes[0];

  // Calculate positions for nodes
  const nodePositions: Record<string, { x: number; y: number }> = {};
  const assigned = new Set<string>();
  const levels: DagNode[][] = [];
  while (assigned.size < nodes.length) {
    const level = nodes.filter(n =>
      !assigned.has(n.id) && n.dependencies.every(d => assigned.has(d))
    );
    if (level.length === 0) break;
    levels.push(level);
    level.forEach(n => assigned.add(n.id));
  }
  levels.forEach((level, li) => {
    level.forEach((node, ni) => {
      nodePositions[node.id] = { x: 100 + li * 220, y: 80 + ni * 120 };
    });
  });

  const handleExecute = async () => {
    if (!runId) {
      alert('没有运行ID，请先规划');
      return;
    }
    try {
      await startRun(runId);
      navigate('/run');
    } catch (e) {
      alert('执行失败: ' + (e as Error).message);
    }
  };

  return (
    <div className="page">
      <TopBar
        title="编排任务"
        backTo="/plan"
        actions={
          <>
            <span className="edit-progress-text">{nodes.length} 个任务</span>
            <Button onClick={handleExecute}>确认执行</Button>
          </>
        }
      />
      <div className="content edit-content">
        <div className="edit-layout">
          <div className="edit-canvas">
            <div className="edit-toolbar">
              <Button variant="secondary" size="sm">
                <Plus size={14} />
                添加任务
              </Button>
              <Button variant="secondary" size="sm">
                <Link size={14} />
                连线模式
              </Button>
              <Button variant="secondary" size="sm">
                <GitBranch size={14} />
                版本 v1
              </Button>
            </div>

            {/* SVG Arrows */}
            <svg className="canvas-arrows" viewBox="0 0 1000 600">
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#D1D5DB" />
                </marker>
              </defs>
              {nodes.map(node =>
                node.dependencies.map(depId => {
                  const from = nodePositions[depId];
                  const to = nodePositions[node.id];
                  if (!from || !to) return null;
                  const fx = from.x + 70, fy = from.y + 30;
                  const tx = to.x, ty = to.y + 30;
                  const mx = (fx + tx) / 2;
                  return (
                    <path
                      key={`${depId}-${node.id}`}
                      d={`M ${fx} ${fy} Q ${mx} ${fy} ${tx} ${ty}`}
                      stroke="#D1D5DB"
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#arrowhead)"
                    />
                  );
                })
              )}
            </svg>

            {/* Nodes */}
            {nodes.map(node => {
              const pos = nodePositions[node.id];
              if (!pos) return null;
              return (
                <div
                  key={node.id}
                  className={`canvas-node ${node.agent_type} ${selectedId === node.id ? 'selected' : ''}`}
                  style={{ left: pos.x, top: pos.y }}
                  onClick={() => setSelectedId(node.id)}
                >
                  <div className="canvas-node-title">
                    {typeIcons[node.agent_type] || '📋'} {node.title}
                  </div>
                  <div className="canvas-node-meta">
                    <span>{node.agent_type}</span> · <span>{node.estimated_time}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="edit-panel">
            <div className="panel-header">节点详情</div>
            {selectedNode ? (
              <div className="panel-body">
                <div className="panel-field">
                  <label>标题</label>
                  <input type="text" defaultValue={selectedNode.title} />
                </div>
                <div className="panel-field">
                  <label>描述</label>
                  <textarea defaultValue={selectedNode.description} />
                </div>
                <div className="panel-field">
                  <label>Agent 类型</label>
                  <select defaultValue={selectedNode.agent_type}>
                    <option value="research">Research Agent</option>
                    <option value="code">Code Agent</option>
                    <option value="business">Business Agent</option>
                    <option value="review">Review Agent</option>
                  </select>
                </div>
                <div className="panel-field">
                  <label>预估耗时</label>
                  <input type="text" defaultValue={selectedNode.estimated_time} />
                </div>

                <div className="panel-divider" />

                <div className="panel-field">
                  <label>依赖</label>
                  <div className="dependency-badges">
                    {selectedNode.dependencies.length === 0 ? (
                      <span className="dep-badge" style={{ background: 'var(--bg)', color: 'var(--text-tertiary)' }}>无依赖</span>
                    ) : (
                      selectedNode.dependencies.map(d => {
                        const dep = nodes.find(n => n.id === d);
                        return <span key={d} className="dep-badge">✓ {dep?.title || d}</span>;
                      })
                    )}
                  </div>
                </div>

                <div className="panel-divider" />

                <div className="panel-think">
                  <strong>任务描述</strong>
                  {selectedNode.description}
                </div>
              </div>
            ) : (
              <div className="panel-body" style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 40 }}>
                点击节点查看详情
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
