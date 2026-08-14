import { History } from 'lucide-react';

import { hasMessage, useI18n } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

export default function RunHistory() {
  const runHistory = useWorkspaceStore((state) => state.runHistory);
  const runHistoryCursor = useWorkspaceStore((state) => state.runHistoryCursor);
  const currentRun = useWorkspaceStore((state) => state.run);
  const openRun = useWorkspaceStore((state) => state.openRun);
  const loadRunHistory = useWorkspaceStore((state) => state.loadRunHistory);
  const { t, locale } = useI18n();

  if (runHistory.length === 0) return null;

  return (
    <section className="run-history" aria-label={t('run.history')}>
      <h3><History size={14} aria-hidden="true" />{t('run.history')}</h3>
      <ul>
        {runHistory.map((item) => {
          const statusKey = `run.status.${item.status}`;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={currentRun?.id === item.id ? 'run-history-item active' : 'run-history-item'}
                onClick={() => void openRun(item.id)}
                aria-current={currentRun?.id === item.id ? 'true' : undefined}
              >
                <span className="run-history-status" data-status={item.status}>
                  {hasMessage(locale, statusKey) ? t(statusKey) : item.status}
                </span>
                <span>{item.workflow_version !== null ? t('run.workflowVersion', { version: item.workflow_version }) : item.id}</span>
                <span className="muted">{new Date(item.created_at).toLocaleString(locale)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {runHistoryCursor && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadRunHistory(true)}>
          {t('run.historyMore')}
        </button>
      )}
    </section>
  );
}
