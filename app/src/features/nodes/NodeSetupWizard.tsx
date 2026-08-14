import { useState } from 'react';
import { KeyRound, Laptop, RefreshCw, Server } from 'lucide-react';

import { useT } from '../../lib/i18n';
import { selectSshKey } from '../../lib/runtime';
import { useWorkspaceStore } from '../../store/workspaceStore';

type WizardMode = 'pick' | 'local' | 'remote';

const blankRemote = {
  id: '', name: '', apiUrl: '', sshHost: '', sshPort: '22', sshUser: '', sshKeyPath: '', credential: '',
};

export default function NodeSetupWizard({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const saveNode = useWorkspaceStore((state) => state.saveNode);
  const discoverLocal = useWorkspaceStore((state) => state.discoverLocalNode);
  const discoverResult = useWorkspaceStore((state) => state.localDiscover);
  const [mode, setMode] = useState<WizardMode>('pick');
  const [form, setForm] = useState(blankRemote);
  const [localForm, setLocalForm] = useState({ id: 'local', name: '', apiUrl: 'http://127.0.0.1:8765', credential: '' });

  const field = (name: keyof typeof blankRemote) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [name]: event.target.value });

  const pickKey = async () => {
    const selected = await selectSshKey();
    // 取消选择时保留已有路径，不清空
    if (selected) setForm((current) => ({ ...current, sshKeyPath: selected }));
  };

  const submitRemote = async (event: React.FormEvent) => {
    event.preventDefault();
    await saveNode({
      id: form.id,
      name: form.name,
      kind: 'remote',
      api_url: form.apiUrl,
      ssh_host: form.sshHost,
      ssh_port: Number(form.sshPort) || 22,
      ssh_user: form.sshUser || null,
      ssh_key_path: form.sshKeyPath || null,
      credential: form.credential || undefined,
    });
    setForm(blankRemote);
    onDone?.();
  };

  const submitLocal = async (event: React.FormEvent) => {
    event.preventDefault();
    await saveNode({
      id: localForm.id,
      name: localForm.name || localForm.id,
      kind: 'local',
      api_url: localForm.apiUrl,
      credential: localForm.credential || undefined,
    });
    setLocalForm({ id: 'local', name: '', apiUrl: 'http://127.0.0.1:8765', credential: '' });
    onDone?.();
  };

  if (mode === 'pick') {
    return (
      <div className="node-wizard" aria-label={t('nodes.wizard')}>
        <h2>{t('nodes.wizardTitle')}</h2>
        <p className="muted">{t('nodes.wizardHint')}</p>
        <div className="node-wizard-choices">
          <button type="button" onClick={() => { setMode('local'); void discoverLocal(); }}>
            <Laptop size={18} aria-hidden="true" />
            <strong>{t('nodes.wizardLocal')}</strong>
            <span>{t('nodes.wizardLocalHint')}</span>
          </button>
          <button type="button" onClick={() => setMode('remote')}>
            <Server size={18} aria-hidden="true" />
            <strong>{t('nodes.wizardRemote')}</strong>
            <span>{t('nodes.wizardRemoteHint')}</span>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'local') {
    return (
      <form className="node-wizard form-grid" onSubmit={submitLocal} aria-label={t('nodes.wizardLocal')}>
        <h2>{t('nodes.wizardLocal')}</h2>
        {discoverResult && (
          <p className={discoverResult.found ? 'configured' : 'muted'} role="status">
            {discoverResult.found
              ? t('nodes.discoverFound', { path: discoverResult.path ?? '' })
              : t('nodes.discoverNotFound')}
          </p>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void discoverLocal()}>
          <RefreshCw size={14} aria-hidden="true" />{t('nodes.discoverAgain')}
        </button>
        <label htmlFor="local-id">{t('nodes.field.id')}</label>
        <input id="local-id" value={localForm.id} onChange={(e) => setLocalForm({ ...localForm, id: e.target.value })} required />
        <label htmlFor="local-name">{t('nodes.field.name')}</label>
        <input id="local-name" value={localForm.name} onChange={(e) => setLocalForm({ ...localForm, name: e.target.value })} />
        <label htmlFor="local-url">{t('nodes.field.url')}</label>
        <input id="local-url" type="url" value={localForm.apiUrl} onChange={(e) => setLocalForm({ ...localForm, apiUrl: e.target.value })} required />
        <label htmlFor="local-token">{t('nodes.field.token')}</label>
        <input id="local-token" type="password" value={localForm.credential} onChange={(e) => setLocalForm({ ...localForm, credential: e.target.value })} autoComplete="off" />
        <div className="wizard-actions">
          <button type="button" onClick={() => setMode('pick')}>{t('nodes.wizardBack')}</button>
          <button type="submit" className="form-primary">{t('nodes.save')}</button>
        </div>
      </form>
    );
  }

  return (
    <form className="node-wizard form-grid" onSubmit={submitRemote} aria-label={t('nodes.wizardRemote')}>
      <h2>{t('nodes.wizardRemote')}</h2>
      <label htmlFor="node-id">{t('nodes.field.id')}</label>
      <input id="node-id" value={form.id} onChange={field('id')} required />
      <label htmlFor="node-name">{t('nodes.field.name')}</label>
      <input id="node-name" value={form.name} onChange={field('name')} required />
      <label htmlFor="node-url">{t('nodes.field.url')}</label>
      <input id="node-url" type="url" value={form.apiUrl} onChange={field('apiUrl')} required />
      <label htmlFor="ssh-host">{t('nodes.field.sshHost')}</label>
      <input id="ssh-host" value={form.sshHost} onChange={field('sshHost')} required />
      <label htmlFor="ssh-port">{t('nodes.field.sshPort')}</label>
      <input id="ssh-port" type="number" min="1" max="65535" value={form.sshPort} onChange={field('sshPort')} />
      <label htmlFor="ssh-user">{t('nodes.field.sshUser')}</label>
      <input id="ssh-user" value={form.sshUser} onChange={field('sshUser')} />
      <label htmlFor="ssh-key">{t('nodes.field.sshKey')}</label>
      <div className="ssh-key-row">
        <input id="ssh-key" value={form.sshKeyPath} onChange={field('sshKeyPath')} />
        <button type="button" onClick={() => void pickKey()} aria-label={t('nodes.pickSshKey')}>
          <KeyRound size={14} aria-hidden="true" />
        </button>
      </div>
      <label htmlFor="node-token">{t('nodes.field.token')}</label>
      <input id="node-token" type="password" value={form.credential} onChange={field('credential')} autoComplete="off" />
      <div className="wizard-actions">
        <button type="button" onClick={() => setMode('pick')}>{t('nodes.wizardBack')}</button>
        <button type="submit" className="form-primary">{t('nodes.save')}</button>
      </div>
    </form>
  );
}
