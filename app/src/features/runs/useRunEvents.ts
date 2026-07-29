import { useEffect, useRef, useState } from 'react';

import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  applyRunEvent,
  computeRunProgress,
  createInitialRunEventState,
  mapRunStatus,
  type RunEvent,
  type RunEventState,
} from './runEventState';

export interface UseRunEventsResult {
  lastEventId: number;
  connected: boolean;
}

function toWebSocketUrl(baseUrl: string, runId: string, lastEventId: number): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/runs/${encodeURIComponent(runId)}`;
  url.search = `last_event_id=${lastEventId}`;
  url.hash = '';
  return url.toString();
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

function syncWorkspace(state: RunEventState) {
  const store = useWorkspaceStore.getState();
  const mapped = mapRunStatus(state.runStatus);
  const taskIds = store.workflow?.tasks.map((task) => task.id) ?? Object.keys(state.taskAttempts);
  const progress = computeRunProgress(taskIds, state.taskAttempts);
  const currentRun = store.run;
  store.applyRunMonitor({
    lastEventId: state.lastEventId,
    runStatus: mapped,
    runProgress: progress,
    taskAttempts: state.taskAttempts,
    run: currentRun
      ? {
          ...currentRun,
          status: state.runStatus ?? currentRun.status,
          attempts: Object.values(state.taskAttempts),
        }
      : currentRun,
  });
}

export function useRunEvents(runId: string | null): UseRunEventsResult {
  const baseUrl = useWorkspaceStore((state) => state.coordinatorBaseUrl);
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

    const connect = () => {
      if (disposed) return;
      clearTimer();
      const url = toWebSocketUrl(baseUrl, runId, stateRef.current.lastEventId);
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
        reconnectTimer.current = setTimeout(connect, 250);
      };
    };

    connect();

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
  }, [baseUrl, runId]);

  return { lastEventId, connected };
}

export default useRunEvents;
