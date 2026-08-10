import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { useWorkspaceStore } from '../../store/workspaceStore';

export default function PlannerSettings() {
  const planner = useWorkspaceStore((state) => state.plannerConfig);
  const loadSettings = useWorkspaceStore((state) => state.loadSettings);
  const savePlannerConfig = useWorkspaceStore((state) => state.savePlannerConfig);
  const [plannerBaseUrl, setPlannerBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [plannerHint, setPlannerHint] = useState('');

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { setPlannerBaseUrl(planner.base_url ?? ''); setModel(planner.model ?? ''); }, [planner.base_url, planner.model]);

  const submitPlanner = async (event: React.FormEvent) => {
    event.preventDefault();
    await savePlannerConfig({
      base_url: plannerBaseUrl,
      model,
      credential_key: planner.credential_key ?? 'planner.primary',
      ...(apiKey ? { credential: apiKey } : {}),
    });
    setApiKey('');
    setPlannerHint('规划器配置已保存。');
  };

  return <section className="workspace-overlay" aria-label="设置">
    <header><div><span>应用配置</span><h1>设置</h1><p>配置智能任务规划器。</p></div></header>
    <div className="overlay-grid">
      <form className="settings-card form-grid" onSubmit={submitPlanner}>
        <h2><ShieldCheck size={18} />规划器</h2>
        <label htmlFor="planner-base-url">规划器基础地址</label><input id="planner-base-url" type="url" value={plannerBaseUrl} onChange={(event) => setPlannerBaseUrl(event.target.value)} required />
        <label htmlFor="planner-model">规划模型</label><input id="planner-model" value={model} onChange={(event) => setModel(event.target.value)} required />
        <label htmlFor="planner-api-key">规划器接口密钥</label><input id="planner-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" />
        {planner.credential_configured === true && <p className="configured">接口密钥已配置</p>}
        {plannerHint && <p className="configured" role="status">{plannerHint}</p>}
        <button type="submit" className="form-primary">保存规划器配置</button>
      </form>
    </div>
  </section>;
}
