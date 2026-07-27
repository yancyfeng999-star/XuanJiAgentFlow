import { Handle, Position } from '@xyflow/react';
import { Check, Loader } from 'lucide-react';
import Button from '../components/Button';

const typeIcons: Record<string, string> = { research: '🔍', code: '📄', business: '⚡', review: '✓' };
const typeColors: Record<string, string> = { research: 'research', code: 'code', business: 'business', review: 'review' };

export default function PlanPanel({ data }: { data: any }) {
  const result = data.result || {};
  const nodes = result.nodes || [];

  // 按依赖分层
  const levels: any[][] = [];
  const assigned = new Set<string>();
  while (assigned.size < nodes.length) {
    const level = nodes.filter((n: any) =>
      !assigned.has(n.id) && n.dependencies.every((d: string) => assigned.has(d))
    );
    if (!level.length) break;
    levels.push(level);
    level.forEach((n: any) => assigned.add(n.id));
  }

  return (
    <div className="panel-node">
      <div className="panel-header">
        <div className="panel-header-dot" style={{ background: '#8B5CF6' }} />
        规划结果
      </div>
      <div className="panel-body">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          {result.goal}
        </div>

        {result.thinking && (
          <div className="think-step-mini">
            <div className="icon icon-done"><Check size={10} /></div>
            <span style={{ color: 'var(--text-secondary)' }}>
              {result.thinking.slice(0, 120)}...
            </span>
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3, margin: '10px 0 6px' }}>
          任务图
        </div>

        <div className="dag-mini">
          {levels.map((level, li) => (
            <div key={li}>
              {li > 0 && <div className="dag-mini-arrow">↓</div>}
              <div className="dag-mini-row">
                {level.map((node: any) => (
                  <div key={node.id} className={`dag-mini-node ${typeColors[node.agent_type] || 'research'}`}>
                    {typeIcons[node.agent_type] || '📋'} {node.title}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
          {nodes.length} 个任务 · {nodes.filter((n: any) => !n.dependencies.length).length} 个可并行
        </div>
      </div>
      <div className="panel-footer">
        <Button size="sm" onClick={() => data.onConfirm?.()}>
          确认编排
        </Button>
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
