import { useState } from 'react';

import { useT } from '../../lib/i18n';
import { getWorkspaceClient } from '../../store/workspaceStore';
import { buildSupportSummary } from './supportSummary';

export default function DiagnosticsCenter() {
  const t = useT();
  const [summary, setSummary] = useState('');

  const run = async () => {
    const payload = await getWorkspaceClient().getDiagnostics();
    setSummary(buildSupportSummary({
      appVersion: String(payload.appVersion),
      coordinator: String(payload.coordinator),
    }));
  };

  return (
    <section aria-label={t('settings.section.support')}>
      <h2>{t('settings.section.support')}</h2>
      <button type="button" onClick={() => void run()}>{t('support.runDiagnostics')}</button>
      {summary && <pre>{summary}</pre>}
    </section>
  );
}
