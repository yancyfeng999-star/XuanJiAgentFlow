import { useEffect, useState } from 'react';

import { useT } from '../../lib/i18n';
import { getUpdateService, type UpdateState } from '../../lib/updater';

export default function UpdateSettings() {
  const t = useT();
  const [state, setState] = useState<UpdateState>(getUpdateService().getState());

  useEffect(() => getUpdateService().subscribe(setState), []);

  return (
    <section aria-label={t('settings.section.updates')}>
      <h2>{t('settings.section.updates')}</h2>
      <p data-testid="update-state">{state.kind}</p>
      {state.kind === 'desktop_only' && <p>{t('update.desktopOnly')}</p>}
      {state.kind === 'available' && (
        <p>{t('update.available', { version: state.candidate.version })}</p>
      )}
      <button type="button" onClick={() => void getUpdateService().check()}>{t('update.check')}</button>
      <button
        type="button"
        disabled={state.kind !== 'available'}
        onClick={() => void getUpdateService().download()}
      >
        {t('update.download')}
      </button>
      <button
        type="button"
        disabled={state.kind !== 'ready_to_install'}
        onClick={() => void getUpdateService().installAndRestart()}
      >
        {t('update.install')}
      </button>
    </section>
  );
}
