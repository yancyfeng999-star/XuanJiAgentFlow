import { Handle, Position } from '@xyflow/react';
import { Play } from 'lucide-react';
import Button from '../components/Button';

const typeIcons: Record<string, string> = { research: '🔍', code: '📄', business: '⚡', review: '✓' };

export default function EditPanel({ data }: { data: any }) {
  const nodes = data.nodes || [];

  return (
    <div className="panel-node">
      <div className="panel-header">
        <div className="panel-header-dot" style={{ background: '#3B82F6' }} />
        编排确认
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {nodes.length} 任务
        </span>
      </div>
      <div className="panel-body">
        {nodes.map((node: any, i: number) => (
          <div key={node.id} className="task-mini">
            <div className="task-mini-status pending">⏳</div>
            <span className="task-mini-title">
              {typeIcons[node.agent_type] || '📋'} {node.title}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {node.estimated_time || ''}
            </span>
          </div>
        ))}
      </div>
      <div className="panel-footer">
        <Button size="sm" onClick={() => data.onExecute?.()}>
          <Play size={14} />
          确认执行
        </Button>
      </div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
