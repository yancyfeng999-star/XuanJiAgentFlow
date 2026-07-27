import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import { planRun } from '../lib/api';
import './Input.css';

export default function InputPage() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [context, setContext] = useState('');
  const [engine, setEngine] = useState<'hermes' | 'manual'>('hermes');
  const [loading, setLoading] = useState(false);

  const handlePlan = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    try {
      const result = await planRun(goal, context);
      // Store result in sessionStorage for Plan page to read
      sessionStorage.setItem('plan_result', JSON.stringify(result));
      navigate('/plan');
    } catch (e) {
      alert('规划失败: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <TopBar title="新建运行" backTo="/" />
      <div className="content">
        <div className="input-page">
          <h2>你想做什么？</h2>

          <textarea
            className="input-textarea"
            placeholder="输入你的选题或目标...&#10;&#10;例如：调研跨境电商SaaS市场并生成分析报告"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />

          <div
            className={`advanced-toggle ${showAdvanced ? 'open' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <ChevronRight size={14} />
            高级选项
          </div>

          {showAdvanced && (
            <div className="advanced-panel">
              <div className="form-group">
                <label className="form-label">背景信息</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: 60 }}
                  placeholder="补充上下文信息..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">产出格式</label>
                  <select className="form-input">
                    <option>Markdown 报告</option>
                    <option>PDF 文档</option>
                    <option>JSON 数据</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">语言</label>
                  <select className="form-input">
                    <option>中文</option>
                    <option>English</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">执行引擎</label>
                <div className="radio-group">
                  <label className={`radio-item ${engine === 'hermes' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="engine"
                      checked={engine === 'hermes'}
                      onChange={() => setEngine('hermes')}
                    />
                    <span className="radio-dot" />
                    Hermes 自动执行
                  </label>
                  <label className={`radio-item ${engine === 'manual' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="engine"
                      checked={engine === 'manual'}
                      onChange={() => setEngine('manual')}
                    />
                    <span className="radio-dot" />
                    手动导出
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="input-actions">
            <Button size="lg" onClick={handlePlan} disabled={loading || !goal.trim()}>
              {loading ? '规划中...' : '开始规划'}
              {!loading && <ChevronRight size={16} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
