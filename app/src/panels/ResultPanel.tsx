import { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Download, Copy } from 'lucide-react';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { getResults, exportRun } from '../lib/api';

export default function ResultPanel({ data }: { data: any }) {
  const [results, setResults] = useState<any>({});
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    if (!data.runId) return;
    getResults(data.runId).then(r => {
      if (r.tasks) setResults(r.tasks);
    }).catch(() => {});
  }, [data.runId]);

  const nodes = data.nodes || [];
  const selected = selectedId ? results[selectedId] : null;

  const handleExport = async () => {
    try {
      const r = await exportRun(data.runId);
      await navigator.clipboard.writeText(r.text);
      alert('已复制到剪贴板');
    } catch {}
  };

  return (
    <div className="panel-node" style={{ width: 420 }}>
      <div className="panel-header">
        <div className="panel-header-dot" style={{ background: '#F59E0B' }} />
        结果汇总
        <Badge variant="success" size="sm">已完成</Badge>
      </div>
      <div className="panel-body">
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {nodes.map((node: any) => (
            <div
              key={node.id}
              onClick={() => setSelectedId(node.id)}
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                background: selectedId === node.id ? 'var(--primary-light)' : 'var(--bg)',
                border: `1px solid ${selectedId === node.id ? 'var(--primary)' : 'var(--border)'}`,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {node.title}
            </div>
          ))}
        </div>

        {selected ? (
          <div className="result-mini-text">
            <strong>{selected.title}</strong>
            {selected.result && <pre>{selected.result}</pre>}
            {!selected.result && <p style={{ color: 'var(--text-tertiary)' }}>暂无结果</p>}
          </div>
        ) : (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', padding: 20 }}>
            点击上方标签查看结果
          </div>
        )}
      </div>
      <div className="panel-footer">
        <Button variant="secondary" size="sm" onClick={handleExport}>
          <Copy size={12} /> 导出
        </Button>
      </div>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
