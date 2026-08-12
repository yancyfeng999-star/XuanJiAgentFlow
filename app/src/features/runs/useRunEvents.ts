import { useEffect, useRef, useState } from 'react';

import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  applyRunEvent,
  computeRunProgress,
  createInitialRunEventState,
  type RunEvent,
  type RunEventState,
} from './runEventState';

export interface UseRunEventsResult {
  lastEventId: number;
  connected: boolean;
}

function toWebSocketUrl(baseUrl: string, runId: string, lastEventId: number, ticket: string | null): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/runs/${encodeURIComponent(runId)}`;
  url.searchParams.set('last_event_id', String(lastEventId));
  if (ticket) url.searchParams.set('ticket', ticket);
  url.hash = '';
  return url.toString();
}

async function issueTicket(baseUrl: string, runId: string, sessionToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/session/ws-tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Xuanji-Session': sessionToken },
      body: JSON.stringify({ run_id: runId }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ticket?: string };
    return typeof payload.ticket === 'string' ? payload.ticket : null;
  } catch {
    return null;
  }
}

function parseEvent(raw: unknown): RunEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<RunEvent>;
  if (typeof value.event_id !== 'number' || typeof value.run_id !== 'string' || typeof value.type !== 'string') {
    return null;
  }
  return {
    event_id: value.event_id,
    run_id: value.run_id,
    type: value.type,
    payload: value.payload && typeof value.payload === 'object' && !Array.isArray(value.payload)
      ? value.payload as Record<string, unknown>
      : {},
    created_at: typeof value.created_at === 'string' ? value.created_at : '',
  };
}

const QUIESCENT_STATUSES = new Set(['paused', 'blocked', 'success', 'failed', 'cancelled']);

function syncWorkspace(state: RunEventState) {
  const store = useWorkspaceStore.getState();
  const taskIds = store.workflow?.tasks.map((task) => task.id) ?? Object.keys(state.taskAttempts);
  const progress = computeRunProgress(taskIds, state.taskAttempts);
  const currentRun = store.run;
  const previousStatus = currentRun?.status;
  const nextStatus = state.runStatus ?? currentRun?.status;
  store.applyRunMonitor({
    lastEventId: state.lastEventId,
    runStatus: nextStatus,
    runProgress: progress,
    taskAttempts: state.taskAttempts,
    run: currentRun
      ? {
          ...currentRun,
          status: nextStatus ?? currentRun.status,
          attempts: Object.values(state.taskAttempts),
        }
      : currentRun,
  });
  // 进入静止态后用服务端快照收敛，恢复 allowed_actions 等权威字段
  if (nextStatus && nextStatus !== previousStatus && QUIESCENT_STATUSES.has(nextStatus)) {
    void store.refreshRun();
  }
}

export function useRunEvents(runId: string | null): UseRunEventsResult {
  const baseUrl = useWorkspaceStore((state) => state.coordinatorBaseUrl);
  const sessionToken = useWorkspaceStore((state) => state.coordinatorSessionToken);
  const [connected, setConnected] = useState(false);
  const [lastEventId, setLastEventId] = useState(0);
  const stateRef = useRef<RunEventState>(createInitialRunEventState());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stateRef.current = createInitialRunEventState();
    setLastEventId(0);
    setConnected(false);

    if (!runId) return undefined;

    let disposed = false;
    let socket: WebSocket | null = null;

    const clearTimer = () => {
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    const connect = async () => {
      if (disposed) return;
      clearTimer();
      // 长期会话令牌不进入 URL：先换取一次性短期票据
      const ticket = sessionToken ? await issueTicket(baseUrl, runId, sessionToken) : null;
      if (disposed) return;
      if (sessionToken && !ticket) {
        reconnectTimer.current = setTimeout(() => void connect(), 500);
        return;
      }
      const url = toWebSocketUrl(baseUrl, runId, stateRef.current.lastEventId, ticket);
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (disposed) return;
        setConnected(true);
      };

      socket.onmessage = (message) => {
        if (disposed) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const event = parseEvent(parsed);
        if (!event) return;
        const next = applyRunEvent(stateRef.current, event);
        if (next === stateRef.current) return;
        stateRef.current = next;
        setLastEventId(next.lastEventId);
        syncWorkspace(next);
      };

      socket.onerror = () => {
        // onclose handles reconnection
      };

      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        reconnectTimer.current = setTimeout(() => void connect(), 250);
      };
    };

    void connect();

    return () => {
      disposed = true;
      clearTimer();
      setConnected(false);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [baseUrl, runId, sessionToken]);

  return { lastEventId, connected };
}

export default useRunEvents;
