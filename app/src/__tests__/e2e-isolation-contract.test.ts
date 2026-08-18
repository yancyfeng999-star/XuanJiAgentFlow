import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { coordinatorUrl } from '../../e2e/coordinator-url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('E2E isolation contract', () => {
  it('does not reuse an existing server unless explicitly requested', () => {
    const config = fs.readFileSync(path.join(root, 'app/playwright.config.ts'), 'utf8');
    expect(config).toContain("process.env.E2E_REUSE_EXISTING_SERVER === '1'");
    expect(config).not.toContain('reuseExistingServer: !process.env.CI');
  });

  it('allocates coordinator and Vite ports for the full local gate', () => {
    const script = fs.readFileSync(path.join(root, 'scripts/verify-all.sh'), 'utf8');
    expect(script).toContain('find_free_port');
    expect(script).toContain('export E2E_COORDINATOR_PORT');
    expect(script).toContain('export E2E_VITE_PORT');
    expect(script).toContain('export E2E_COORDINATOR_URL');
  });

  it('prefers E2E coordinator env over leftover stack.json unless reuse is explicit', () => {
    const helpers = fs.readFileSync(path.join(root, 'app/e2e/helpers.ts'), 'utf8');
    expect(helpers).toMatch(/import \{ coordinatorUrl \} from '\.\/coordinator-url'/);
    expect(helpers).toMatch(/export \{ coordinatorUrl \}/);

    const impl = fs.readFileSync(path.join(root, 'app/e2e/coordinator-url.ts'), 'utf8');
    expect(impl).toContain('E2E_COORDINATOR_URL');
    expect(impl).toContain('E2E_COORDINATOR_PORT');
    expect(impl).toContain("E2E_REUSE_EXISTING_SERVER === '1'");
    expect(impl).toContain('http://127.0.0.1:18080');

    const statePath = path.join(os.tmpdir(), `xuanji-e2e-stack-${process.pid}.json`);
    fs.writeFileSync(statePath, JSON.stringify({ coordinator_url: 'http://127.0.0.1:59999' }));
    try {
      expect(coordinatorUrl({ E2E_COORDINATOR_URL: 'http://127.0.0.1:19000' }, statePath))
        .toBe('http://127.0.0.1:19000');
      expect(coordinatorUrl({
        E2E_COORDINATOR_URL: 'http://127.0.0.1:19000',
        E2E_COORDINATOR_PORT: '19001',
      }, statePath)).toBe('http://127.0.0.1:19000');
      expect(coordinatorUrl({ E2E_COORDINATOR_PORT: '19001' }, statePath))
        .toBe('http://127.0.0.1:19001');
      expect(coordinatorUrl({
        E2E_COORDINATOR_PORT: '19001',
        E2E_REUSE_EXISTING_SERVER: '1',
      }, statePath)).toBe('http://127.0.0.1:19001');
      expect(coordinatorUrl({ E2E_REUSE_EXISTING_SERVER: '1' }, statePath))
        .toBe('http://127.0.0.1:59999');
      expect(coordinatorUrl({}, statePath)).toBe('http://127.0.0.1:18080');
      expect(coordinatorUrl({ E2E_REUSE_EXISTING_SERVER: '0' }, statePath))
        .toBe('http://127.0.0.1:18080');
    } finally {
      fs.rmSync(statePath, { force: true });
    }
  });
});
