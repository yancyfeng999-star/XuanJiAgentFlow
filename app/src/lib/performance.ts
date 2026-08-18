export type XuanjiMilestone =
  | 'shell_mounted'
  | 'runtime_healthy'
  | 'workspace_interactive'
  | 'canvas_interactive';

const snapshot: Partial<Record<XuanjiMilestone, number>> = {};

export function markMilestone(name: XuanjiMilestone): void {
  const now = globalThis.performance?.now?.() ?? Date.now();
  snapshot[name] = now;
  globalThis.performance?.mark?.(`xuanji:${name}`);
}

export function measureMilestone(
  name: string,
  start: XuanjiMilestone,
  end: XuanjiMilestone,
): number | null {
  const startAt = snapshot[start];
  const endAt = snapshot[end];
  if (startAt === undefined || endAt === undefined) return null;
  const duration = endAt - startAt;
  globalThis.performance?.measure?.(name, `xuanji:${start}`, `xuanji:${end}`);
  return duration;
}

export function readPerformanceSnapshot(): Readonly<Record<string, number>> {
  return { ...snapshot } as Record<string, number>;
}

export function resetPerformanceSnapshot(): void {
  for (const key of Object.keys(snapshot) as XuanjiMilestone[]) {
    delete snapshot[key];
  }
}
