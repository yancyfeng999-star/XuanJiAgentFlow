import { useEffect, useState } from 'react';
import { RefreshCw, Server, Trash2 } from 'lucide-react';

import { useI18n } from '../../lib/i18n';
import { useLabels } from '../../lib/labels';
import { useWorkspaceStore } from '../../store/workspaceStore';
import ProvisionWizard from './ProvisionWizard';

const blank = {
  id: '', name: '', apiUrl: '', sshHost: '', sshPort: '22', sshUser: '', sshKeyPath: '', credential: '',
};

export default function NodeManager() {
  const nodes = useWorkspaceStore((state) => state.hermesNodes);
  const loadNodes = useWorkspaceStore((state) => state.loadNodes);
  const saveNode = useWorkspaceStore((state) => state.saveNode);
  const diagnoseNode = useWorkspaceStore((state) => state.diagnoseNode);
  const removeNode = useWorkspaceStore((state) => state.removeNode);
  const [form, setForm] = useState(blank);
  const { t } = useI18n();
  const { statusLabel } = useLabels();

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

  return <section className="workspace-overlay" aria-label={t('nodes.aria')}>
    <header><div><span>{t('nodes.kicker')}</span><h1>{t('nodes.title')}</h1><p>{t('nodes.subtitle')}</p></div></header>
    <div className="overlay-grid">
      <form className="settings-card form-grid" onSubmit={submit}>
        <h2>{t('nodes.config')}</h2>
        <label htmlFor="node-id">{t('nodes.field.id')}</label><input id="node-id" value={form.id} onChange={field('id')} required />
        <label htmlFor="node-name">{t('nodes.field.name')}</label><input id="node-name" value={form.name} onChange={field('name')} required />
        <label htmlFor="node-url">{t('nodes.field.url')}</label><input id="node-url" type="url" value={form.apiUrl} onChange={field('apiUrl')} required />
        <label htmlFor="ssh-host">{t('nodes.field.sshHost')}</label><input id="ssh-host" value={form.sshHost} onChange={field('sshHost')} />
        <label htmlFor="ssh-port">{t('nodes.field.sshPort')}</label><input id="ssh-port" type="number" min="1" max="65535" value={form.sshPort} onChange={field('sshPort')} />
        <label htmlFor="ssh-user">{t('nodes.field.sshUser')}</label><input id="ssh-user" value={form.sshUser} onChange={field('sshUser')} />
        <label htmlFor="ssh-key">{t('nodes.field.sshKey')}</label><input id="ssh-key" value={form.sshKeyPath} onChange={field('sshKeyPath')} />
        <label htmlFor="node-token">{t('nodes.field.token')}</label><input id="node-token" type="password" value={form.credential} onChange={field('credential')} autoComplete="off" />
        <button type="submit" className="form-primary">{t('nodes.save')}</button>
      </form>
      <div className="settings-card node-list"><h2>{t('nodes.connected')}</h2>{nodes.length === 0 ? <p className="muted">{t('nodes.empty')}</p> : nodes.map((node) => <article key={node.id}>
        <div><Server size={18} /><strong>{node.name}</strong><span>{statusLabel(node.status)}</span></div><small>{node.api_url}</small>
        {node.credential_configured === true && <p className="configured">{t('nodes.credentialConfigured')}</p>}
        <button type="button" onClick={() => void diagnoseNode(node.id)}><RefreshCw size={14} />{t('nodes.rediagnose')}</button>
        {node.kind === 'remote' && <ProvisionWizard nodeId={node.id} />}
        <button type="button" className="danger-link" onClick={() => void removeNode(node.id)}><Trash2 size={14} />{t('nodes.remove')}</button>
      </article>)}</div>
    </div>
  </section>;
}
