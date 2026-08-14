import { useEffect, useState } from 'react';

import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function ThinkingModels() {
  const models = useWorkspaceStore((state) => state.thinkingModels);
  const loadThinkingModels = useWorkspaceStore((state) => state.loadThinkingModels);
  const saveThinkingModel = useWorkspaceStore((state) => state.saveThinkingModel);
  const setDefaultThinkingModel = useWorkspaceStore((state) => state.setDefaultThinkingModel);
  const saving = useWorkspaceStore((state) =>
    state.pendingActions.some((action) => action.kind === 'save_thinking_model'));
  const t = useT();
  const [name, setName] = useState('Default');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [modelId, setModelId] = useState('');
  const [apiMode, setApiMode] = useState<'responses' | 'chat_completions'>('chat_completions');
  const [credential, setCredential] = useState('');

  useEffect(() => {
    void loadThinkingModels();
  }, [loadThinkingModels]);

  return (
    <section aria-label={t('nav.thinkingModels')}>
      <h2>{t('nav.thinkingModels')}</h2>
      {models.length === 0 && <p>{t('thinking.empty')}</p>}
      <ul>
        {models.map((item) => (
          <li key={item.id}>
            <strong>{item.display_name}</strong>
            <span> {item.api_mode} · {item.model_id}</span>
            {item.is_default && <span> {t('thinking.default')}</span>}
            <span> {item.credential_configured ? t('thinking.keySet') : t('thinking.keyMissing')}</span>
            {!item.is_default && (
              <button type="button" onClick={() => void setDefaultThinkingModel(item.id)}>
                {t('thinking.makeDefault')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveThinkingModel({
            display_name: name,
            api_mode: apiMode,
            base_url: baseUrl,
            model_id: modelId,
            ...(credential ? { credential } : {}),
          });
          setCredential('');
        }}
      >
        <label>
          {t('thinking.name')}
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          {t('thinking.mode')}
          <select value={apiMode} onChange={(event) => setApiMode(event.target.value as typeof apiMode)}>
            <option value="chat_completions">Chat Completions</option>
            <option value="responses">Responses</option>
          </select>
        </label>
        <label>
          {t('thinking.baseUrl')}
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label>
          {t('thinking.modelId')}
          <input value={modelId} onChange={(event) => setModelId(event.target.value)} />
        </label>
        <label>
          {t('thinking.credential')}
          <input type="password" value={credential} onChange={(event) => setCredential(event.target.value)} autoComplete="off" />
        </label>
        <p>{t('thinking.testHint')}</p>
        <button type="submit" disabled={saving}>{t('thinking.save')}</button>
      </form>
    </section>
  );
}
