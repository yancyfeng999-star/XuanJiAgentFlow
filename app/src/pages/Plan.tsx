import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader } from 'lucide-react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import './Plan.css';

interface PlanNode {
  id: string;
  title: string;
  description: string;
  agent_type: string;
  dependencies: string[];
  estimated_time: string;
  output_format: string;
}

interface PlanResult {
  id: string;
  goal: string;
  thinking: string;
  nodes: PlanNode[];
  parallel_groups: string[][];
}

const typeColors: Record<string, string> = {
  research: 'research',
  code: 'code',
  business: 'business',
  review: 'review',
};

const typeIcons: Record<string, string> = {
  research: '🔍',
  code: '📄',
  business: '⚡',
  review: '✓',
};

export default function Plan() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [thinkSteps, setThinkSteps] = useState<{ status: string; title: string; desc: string }[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem('plan_result');
    if (stored) {
      const result: PlanResult = JSON.parse(stored);
      setPlan(result);
      // Parse thinking into steps
      const thinking = result.thinking || '';
      const steps = thinking.split(/[。；]/).filter(s => s.trim()).map((s, i) => ({
        status: i < 2 ? 'done' : i === 2 ? 'active' : 'waiting',
        title: `分析 ${i + 1}`,
        desc: s.trim(),
      }));
      setThinkSteps(steps.length ? steps : [
        { status: 'done', title: '理解领域', desc: '分析完成' },
        { status: 'done', title: '梳理知识', desc: '梳理完成' },
        { status: 'done', title: '拆解板块', desc: `拆解为${result.nodes?.length || 0}个任务` },
        { status: 'done', title: '规划依赖', desc: '依赖关系已确定' },
      ]);
    }
  }, []);

  return (
    <div className="page">
      <TopBar
        title="规划完成"
        backTo="/input"
        actions={
          <>
            <Button variant="ghost" onClick={() => {
              if (plan) {
                sessionStorage.setItem('dag_nodes', JSON.stringify(plan.nodes));
              }
              navigate('/edit');
            }}>
              跳过，直接编辑
            </Button>
            <Button onClick={() => {
              if (plan) {
                sessionStorage.setItem('dag_nodes', JSON.stringify(plan.nodes));
              }
              navigate('/edit');
            }}>
              确认进入编排
            </Button>
          </>
        }
      />
      <div className="content plan-content">
        <div className="plan-split">
          <div className="plan-left">
            <div className="plan-section-title">AI 思考过程</div>
            <div className="think-steps">
              {thinkSteps.map((step, i) => (
                <div key={i} className={`think-step ${step.status === 'active' ? 'active' : ''}`}>
                  <div className={`think-icon think-icon-${step.status}`}>
                    {step.status === 'done' && <Check size={14} />}
                    {step.status === 'active' && <Loader size={14} />}
                    {step.status === 'waiting' && <span>{i + 1}</span>}
                  </div>
                  <div className="think-content">
                    <strong>{step.title}</strong>
                    <span>{step.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="plan-right">
            <div className="plan-section-title">DAG 预览</div>
            <div className="dag-preview">
              {plan ? (
                <div className="mini-dag">
                  {/* Render nodes by dependency level */}
                  {(() => {
                    const levels: PlanNode[][] = [];
                    const assigned = new Set<string>();
                    const nodes = plan.nodes || [];
                    
                    while (assigned.size < nodes.length) {
                      const level = nodes.filter(n => 
                        !assigned.has(n.id) && 
                        n.dependencies.every(d => assigned.has(d))
                      );
                      if (level.length === 0) break;
                      levels.push(level);
                      level.forEach(n => assigned.add(n.id));
                    }
                    
                    return levels.map((level, li) => (
                      <div key={li}>
                        {li > 0 && <div className="dag-arrow">↓</div>}
                        <div className="dag-row">
                          {level.map(node => (
                            <div key={node.id} className={`dag-node ${typeColors[node.agent_type] || 'research'}`}>
                              {typeIcons[node.agent_type] || '📋'} {node.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>
                  加载中...
                </div>
              )}
            </div>
            <div className="plan-stats">
              <span>任务数: {plan?.nodes?.length || 0}</span>
              <span>目标: {plan?.goal?.slice(0, 30)}...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
