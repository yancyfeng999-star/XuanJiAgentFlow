const API_BASE = 'http://localhost:8000';
const WS_BASE = 'ws://localhost:8000';

export async function getStatus() {
  const res = await fetch(`${API_BASE}/api/status`);
  return res.json();
}

export async function planRun(goal: string, context?: string, constraints?: Record<string, string>) {
  const res = await fetch(`${API_BASE}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, context, constraints }),
  });
  return res.json();
}

export async function listRuns() {
  const res = await fetch(`${API_BASE}/api/runs`);
  return res.json();
}

export async function getRun(runId: string) {
  const res = await fetch(`${API_BASE}/api/runs/${runId}`);
  return res.json();
}

export async function startRun(runId: string) {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/start`, { method: 'POST' });
  return res.json();
}

export async function cancelRun(runId: string) {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/cancel`, { method: 'POST' });
  return res.json();
}

export async function exportRun(runId: string) {
  const res = await fetch(`${API_BASE}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id: runId }),
  });
  return res.json();
}

export async function getResults(runId: string) {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/results`);
  return res.json();
}

export function connectWebSocket(runId: string, onMessage: (data: any) => void): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/runs/${runId}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {}
  };
  return ws;
}
