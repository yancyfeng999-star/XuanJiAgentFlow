import { useCallback, useEffect, useState } from 'react';

import { CoordinatorError } from '../../lib/client';
import { useT } from '../../lib/i18n';
import { getWorkspaceClient, useWorkspaceStore } from '../../store/workspaceStore';

export interface TaskLogProps {
  runId: string;
  taskId: string;
}

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/-]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\b[0-9a-f]{64}\b/g,
  /XUANJI_SESSION_TOKEN=\S+/g,
  /\/Users\/[^/\s]+/g,
];

export function redactLogText(line: string): string {
  let redacted = line;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) =>
      match.startsWith('/Users/') ? '~' : '[已脱敏]',
    );
  }
  return redacted;
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
  const [search, setSearch] = useState('');
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

  const visibleLines = search
    ? lines.filter((line) => line.toLowerCase().includes(search.toLowerCase()))
    : lines;

  const exportLogs = () => {
    const content = lines.map(redactLogText).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${runId}-${taskId}-logs.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <section className="task-log" aria-label={t('log.aria')}>
      <header>
        <h3>{t('log.title')}</h3>
        {loading && <span className="muted">{t('common.loading')}</span>}
      </header>
      <div className="log-tools">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('log.searchPlaceholder')}
          aria-label={t('log.search')}
        />
        <button type="button" onClick={exportLogs} disabled={lines.length === 0}>
          {t('log.export')}
        </button>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          <strong>{t('common.loadFailed')}</strong>
          <span>{error.message}</span>
        </div>
      )}
      <ol className="task-log-lines">
        {visibleLines.length === 0 && !loading ? <li className="muted">{t('log.empty')}</li> : null}
        {visibleLines.map((line, index) => (
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
