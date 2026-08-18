import { afterEach, describe, expect, it } from 'vitest';

import { markMilestone, measureMilestone, readPerformanceSnapshot } from '../performance';

afterEach(() => {
  readPerformanceSnapshot();
});

describe('performance milestones', () => {
  it('records shell and workspace milestones without throwing when Performance API is absent', () => {
    const original = globalThis.performance;
    // @ts-expect-error — exercise the no-Performance-API fallback
    globalThis.performance = undefined;
    try {
      expect(() => markMilestone('shell_mounted')).not.toThrow();
      markMilestone('workspace_interactive');
      expect(readPerformanceSnapshot()).toMatchObject({ shell_mounted: expect.any(Number) });
    } finally {
      globalThis.performance = original;
    }
  });

  it('measures duration between two named milestones', () => {
    markMilestone('shell_mounted');
    markMilestone('workspace_interactive');
    const duration = measureMilestone('shell_to_workspace', 'shell_mounted', 'workspace_interactive');
    expect(duration).toEqual(expect.any(Number));
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});
