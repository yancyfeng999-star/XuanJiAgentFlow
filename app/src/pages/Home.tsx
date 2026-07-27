import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CheckCircle2, XCircle, Clock } from 'lucide-react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { listRuns } from '../lib/api';
import './Home.css';

interface RunItem {
  id: string;
  goal: string;
  status: string;
  created_at: string;
  nodes?: { id: string; title: string }[];
}

const statusMap: Record<string, { label: string; variant: 'success' | 'failed' | 'running' | 'pending' }> = {
  completed: { label: '已完成', variant: 'success' },
  failed: { label: '已失败', variant: 'failed' },
  running: { label: '运行中', variant: 'running' },
  planned: { label: '已规划', variant: 'pending' },
  draft: { label: '草稿', variant: 'pending' },
};

export default function Home() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunItem[]>([]);

  useEffect(() => {
    listRuns().then(setRuns).catch(() => {});
  }, []);

  const handleClick = async (run: RunItem) => {
    try {
      const res = await fetch(`http://localhost:8000/api/runs/${run.id}`);
      const full = await res.json();
      sessionStorage.setItem('plan_result', JSON.stringify(full));
      sessionStorage.setItem('dag_nodes', JSON.stringify(full.nodes || []));
      navigate('/result');
    } catch {
      navigate('/result');
    }
  };

  return (
    <div className="page">
      <TopBar title="璇玑" subtitle="有脑子的任务编排器" />
      <div className="content">
        <div className="home-hero">
          <h2>思考在先，执行在后</h2>
          <p>输入选题，璇玑帮你思考、拆解、编排、执行</p>
          <Button size="lg" onClick={() => navigate('/input')}>
            <Plus size={18} />
            新建运行
          </Button>
        </div>

        <div className="run-list">
          <div className="run-list-header">
            <h3>最近运行</h3>
            <span>{runs.length} 条记录</span>
          </div>

          {runs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
              暂无运行记录，点击上方按钮新建
            </div>
          ) : (
            runs.map((run) => {
              const s = statusMap[run.status] || { label: run.status, variant: 'pending' as const };
              const date = run.created_at ? new Date(run.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
              return (
                <div key={run.id} className="run-item" onClick={() => handleClick(run)}>
                  <div className={`run-icon run-icon-${run.status === 'completed' ? 'completed' : run.status === 'failed' ? 'failed' : 'completed'}`}>
                    {run.status === 'completed' ? <CheckCircle2 size={18} /> :
                     run.status === 'failed' ? <XCircle size={18} /> :
                     <Clock size={18} />}
                  </div>
                  <div className="run-info">
                    <h4>{run.goal}</h4>
                    <p>{run.nodes?.length || 0} 个任务 · {s.label} · {date}</p>
                  </div>
                  <Badge variant={s.variant} size="sm">{s.label}</Badge>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
