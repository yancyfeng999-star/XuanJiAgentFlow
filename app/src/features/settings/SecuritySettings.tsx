import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';

import { useWorkspaceStore } from '../../store/workspaceStore';

export default function SecuritySettings() {
  const baseUrl = useWorkspaceStore((state) => state.coordinatorBaseUrl);
  const securityStatus = useWorkspaceStore((state) => state.securityStatus);
  const planner = useWorkspaceStore((state) => state.plannerConfig);
  const setCoordinatorBaseUrl = useWorkspaceStore((state) => state.setCoordinatorBaseUrl);
  const loadSettings = useWorkspaceStore((state) => state.loadSettings);
  const initializeSecurity = useWorkspaceStore((state) => state.initializeSecurity);
  const unlockSecurity = useWorkspaceStore((state) => state.unlockSecurity);
  const lockSecurity = useWorkspaceStore((state) => state.lockSecurity);
  const savePlannerConfig = useWorkspaceStore((state) => state.savePlannerConfig);
  const [coordinator, setCoordinator] = useState(baseUrl);
  const [password, setPassword] = useState('');
  const [plannerBaseUrl, setPlannerBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { setPlannerBaseUrl(planner.base_url ?? ''); setModel(planner.model ?? ''); }, [planner.base_url, planner.model]);

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (securityStatus === 'uninitialized') await initializeSecurity(password);
    else await unlockSecurity(password);
    setPassword('');
  };
  const submitPlanner = async (event: React.FormEvent) => {
    event.preventDefault();
    await savePlannerConfig({
      base_url: plannerBaseUrl,
      model,
      credential_key: planner.credential_key ?? 'planner.primary',
      ...(apiKey ? { credential: apiKey } : {}),
    });
    setApiKey('');
  };

  return <section className="workspace-overlay" aria-label="安全设置">
    <header><div><span>LOCAL SECURITY</span><h1>设置与安全</h1><p>Coordinator 地址、Planner 与本地凭据保险库。</p></div></header>
    <div className="overlay-grid">
      <div className="settings-card form-grid">
        <h2>Coordinator</h2>
        <label htmlFor="coordinator-url">Coordinator Base URL</label>
        <input id="coordinator-url" type="url" value={coordinator} onChange={(event) => setCoordinator(event.target.value)} />
        <button type="button" onClick={() => setCoordinatorBaseUrl(coordinator)}>应用地址</button>
      </div>
      <form className="settings-card form-grid" onSubmit={submitPassword}>
        <h2><LockKeyhole size={18} />安全存储</h2>
        <p className="security-status">状态：{securityStatus}</p>
        <label htmlFor="master-password">主密码</label>
        <input id="master-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        <button type="submit" className="form-primary">{securityStatus === 'uninitialized' ? '初始化安全存储' : '解锁安全存储'}</button>
        {securityStatus === 'unlocked' && <button type="button" onClick={() => void lockSecurity()}>启用安全锁</button>}
      </form>
      <form className="settings-card form-grid" onSubmit={submitPlanner}>
        <h2><ShieldCheck size={18} />Planner</h2>
        <label htmlFor="planner-base-url">Planner Base URL</label><input id="planner-base-url" type="url" value={plannerBaseUrl} onChange={(event) => setPlannerBaseUrl(event.target.value)} required />
        <label htmlFor="planner-model">Planner 模型</label><input id="planner-model" value={model} onChange={(event) => setModel(event.target.value)} required />
        <label htmlFor="planner-api-key">Planner API Key</label><input id="planner-api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" />
        {planner.credential_configured === true && <p className="configured">API Key 已配置</p>}
        {planner.credential_configured === null && <p className="muted">锁定后不可确认 API Key 配置状态</p>}
        <button type="submit" className="form-primary" disabled={securityStatus !== 'unlocked'}>保存 Planner 配置</button>
      </form>
    </div>
  </section>;
}
