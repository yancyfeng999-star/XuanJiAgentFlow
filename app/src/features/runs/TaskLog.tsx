import { useCallback, useEffect, useState } from 'react';

import { CoordinatorError } from '../../lib/client';
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
        const message = reason instanceof Error ? reason.message : '加载日志失败';
        setError({ code: 'client_error', message });
      }
    } finally {
      setLoading(false);
    }
  }, [runId, setWorkspaceError, taskId]);

  useEffect(() => {
    setLines([]);
    setNextOffset(0);
    setHasMore(true);
    void loadPage(0, true);
  }, [loadPage]);

  return (
    <section className="task-log" aria-label="任务日志">
      <header>
        <h3>实时日志</h3>
        {loading && <span className="muted">加载中…</span>}
      </header>
      {error && (
        <div className="inline-error" role="alert">
          <strong>{error.code}</strong>
          <span>{error.message}</span>
        </div>
      )}
      <ol className="task-log-lines">
        {lines.length === 0 && !loading ? <li className="muted">暂无日志</li> : null}
        {lines.map((line, index) => (
          <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
        ))}
      </ol>
      {hasMore ? (
        <button
          type="button"
          onClick={() => void loadPage(nextOffset, false)}
          disabled={loading}
          aria-label="加载更多日志"
        >
          加载更多日志
        </button>
      ) : (
        <p className="muted">没有更多日志</p>
      )}
    </section>
  );
}
