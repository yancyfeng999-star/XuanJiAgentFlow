import { useEffect, useState } from 'react';
import { Server, Trash2 } from 'lucide-react';

import { useWorkspaceStore } from '../../store/workspaceStore';
import ProvisionWizard from './ProvisionWizard';

const blank = {
  id: '', name: '', apiUrl: '', sshHost: '', sshPort: '22', sshUser: '', sshKeyPath: '', credential: '',
};

export default function NodeManager() {
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const loadNodes = useWorkspaceStore((state) => state.loadNodes);
  const saveNode = useWorkspaceStore((state) => state.saveNode);
  const removeNode = useWorkspaceStore((state) => state.removeNode);
  const [form, setForm] = useState(blank);

  useEffect(() => { void loadNodes(); }, [loadNodes]);
  const field = (name: keyof typeof blank) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [name]: event.target.value });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await saveNode({
      id: form.id,
      name: form.name,
      kind: form.sshHost ? 'remote' : 'local',
      api_url: form.apiUrl,
      ssh_host: form.sshHost || null,
      ssh_port: form.sshHost ? Number(form.sshPort) : null,
      ssh_user: form.sshUser || null,
      ssh_key_path: form.sshKeyPath || null,
      credential: form.credential || undefined,
    });
    setForm(blank);
  };

  return <section className="workspace-overlay" aria-label="Hermes 节点管理">
    <header><div><span>INFRASTRUCTURE</span><h1>Hermes 节点</h1><p>连接本机或远程执行节点，凭据只写不回读。</p></div></header>
    <div className="overlay-grid">
      <form className="settings-card form-grid" onSubmit={submit}>
        <h2>节点配置</h2>
        <label htmlFor="node-id">节点 ID</label><input id="node-id" value={form.id} onChange={field('id')} required />
        <label htmlFor="node-name">节点名称</label><input id="node-name" value={form.name} onChange={field('name')} required />
        <label htmlFor="node-url">节点地址</label><input id="node-url" type="url" value={form.apiUrl} onChange={field('apiUrl')} required />
        <label htmlFor="ssh-host">SSH Host</label><input id="ssh-host" value={form.sshHost} onChange={field('sshHost')} />
        <label htmlFor="ssh-port">SSH 端口</label><input id="ssh-port" type="number" min="1" max="65535" value={form.sshPort} onChange={field('sshPort')} />
        <label htmlFor="ssh-user">SSH 用户</label><input id="ssh-user" value={form.sshUser} onChange={field('sshUser')} />
        <label htmlFor="ssh-key">SSH Key Path</label><input id="ssh-key" value={form.sshKeyPath} onChange={field('sshKeyPath')} />
        <label htmlFor="node-token">节点 Token</label><input id="node-token" type="password" value={form.credential} onChange={field('credential')} autoComplete="off" />
        <button type="submit" className="form-primary">保存节点</button>
      </form>
      <div className="settings-card node-list"><h2>已连接节点</h2>{nodes.length === 0 ? <p className="muted">尚无节点。</p> : nodes.map((node) => <article key={node.id}>
        <div><Server size={18} /><strong>{node.name}</strong><span>{node.status}</span></div><small>{node.api_url}</small>
        {node.credential_configured === true && <p className="configured">Token 已配置</p>}
        {node.credential_configured === null && <p className="muted">锁定后不可确认 Token 配置状态</p>}
        {node.kind === 'remote' && <ProvisionWizard nodeId={node.id} />}
        <button type="button" className="danger-link" onClick={() => void removeNode(node.id)}><Trash2 size={14} />移除</button>
      </article>)}</div>
    </div>
  </section>;
}
