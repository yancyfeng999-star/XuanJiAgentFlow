import { Handle, Position } from '@xyflow/react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

const statusIcons: Record<string, any> = {
  completed: CheckCircle2,
  failed: XCircle,
  running: Clock,
  planned: Clock,
};

const statusColors: Record<string, string> = {
  completed: 'var(--success)',
  failed: 'var(--failed)',
  running: 'var(--running)',
  planned: 'var(--pending)',
};

export default function HistoryPanel({ data }: { data: any }) {
  const runs = data.runs || [];

  return (
    <div className="panel-node" style={{ width: 300 }}>
      <div className="panel-header">
        <div className="panel-header-dot" style={{ background: '#9CA3AF' }} />
        历史记录
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {runs.length}
        </span>
      </div>
      <div className="panel-body">
        {runs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 20, fontSize: 12 }}>
            暂无记录
          </div>
        ) : (
          runs.map((run: any) => {
            const Icon = statusIcons[run.status] || Clock;
            const color = statusColors[run.status] || 'var(--pending)';
            return (
              <div
                key={run.id}
                className="history-item"
                onClick={() => data.onSelect?.(run.id)}
              >
                <Icon size={14} style={{ color, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {run.goal}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {run.nodes?.length || 0}任务
                </span>
              </div>
            );
          })
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
