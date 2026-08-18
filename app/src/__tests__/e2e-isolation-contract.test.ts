import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
});
