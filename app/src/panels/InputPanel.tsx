import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Send } from 'lucide-react';
import Button from '../components/Button';
import { planRun } from '../lib/api';

export default function InputPanel({ data }: { data: any }) {
  const [goal, setGoal] = useState(data.initialGoal || '');
  const [loading, setLoading] = useState(false);

  const handlePlan = async () => {
    if (!goal.trim() || loading) return;
    setLoading(true);
    try {
      const result = await planRun(goal);
      data.onPlan?.(result);
    } catch (e) {
      alert('规划失败: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-node">
      <div className="panel-header">
        <div className="panel-header-dot" style={{ background: '#6366F1' }} />
        输入选题
      </div>
      <div className="panel-body">
        <textarea
          className="input-textarea-canvas"
          placeholder="输入你的选题或目标..."
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handlePlan(); }}
        />
      </div>
      <div className="panel-footer">
        <Button size="sm" onClick={handlePlan} disabled={loading || !goal.trim()}>
          {loading ? '规划中...' : '开始规划'}
          {!loading && <Send size={14} />}
        </Button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
