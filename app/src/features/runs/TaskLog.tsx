import { useCallback, useEffect, useState } from 'react';

import { CoordinatorError } from '../../lib/client';
import { useT } from '../../lib/i18n';
import { getWorkspaceClient, useWorkspaceStore } from '../../store/workspaceStore';

export interface TaskLogProps {
  runId: string;
  taskId: string;
}

function logText(event: Record<string, unknown>, index: number): string {
  if (typeof event.message === 'string') return event.message;
  if (typeof event.text === 'string') return event.text;
  if (typeof event.line === 'string') return event.line;
  try {
    return JSON.stringify(event);
  } catch {
    return `log-${index}`;
  }
}

export default function TaskLog({ runId, taskId }: TaskLogProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const setWorkspaceError = useWorkspaceStore((state) => state.setControlError);
  const t = useT();

  const loadPage = useCallback(async (start: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const page = await getWorkspaceClient().listTaskLogs(runId, taskId, start);
      const nextLines = page.events.map((event, index) => logText(event, start + index));
      setLines((current) => (replace ? nextLines : [...current, ...nextLines]));
      setNextOffset(page.next_offset);
      setHasMore(page.events.length > 0 && page.next_offset > start);
    } catch (reason) {
      if (reason instanceof CoordinatorError) {
        setError({ code: reason.code, message: reason.message });
        setWorkspaceError({ code: reason.code, message: reason.message, details: reason.details });
      } else {
        setError({ code: 'client_error', message: t('log.loadError') });
      }
    } finally {
      setLoading(false);
    }
  }, [runId, setWorkspaceError, t, taskId]);

  useEffect(() => {
    setLines([]);
    setNextOffset(0);
    setHasMore(true);
    void loadPage(0, true);
  }, [loadPage]);

  return (
    <section className="task-log" aria-label={t('log.aria')}>
      <header>
        <h3>{t('log.title')}</h3>
        {loading && <span className="muted">{t('common.loading')}</span>}
      </header>
      {error && (
        <div className="inline-error" role="alert">
          <strong>{t('common.loadFailed')}</strong>
          <span>{error.message}</span>
        </div>
      )}
      <ol className="task-log-lines">
        {lines.length === 0 && !loading ? <li className="muted">{t('log.empty')}</li> : null}
        {lines.map((line, index) => (
          <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
        ))}
      </ol>
      {hasMore ? (
        <button
          type="button"
          onClick={() => void loadPage(nextOffset, false)}
          disabled={loading}
          aria-label={t('log.loadMore')}
        >
          {t('log.loadMore')}
        </button>
      ) : (
        <p className="muted">{t('log.noMore')}</p>
      )}
    </section>
  );
}
