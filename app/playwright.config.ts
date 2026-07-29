import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = process.env.XUANJI_PYTHON
  ?? path.join(root, '.venv', 'bin', 'python');
const stackPort = Number(process.env.E2E_COORDINATOR_PORT ?? '18080');
const vitePort = Number(process.env.E2E_VITE_PORT ?? '5173');
const coordinatorUrl = process.env.E2E_COORDINATOR_URL
  ?? `http://127.0.0.1:${stackPort}`;

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const stackCommand = [
  shQuote(python),
  shQuote(path.join(root, 'scripts', 'e2e_stack.py')),
  '--coordinator-port',
  String(stackPort),
].join(' ');

/**
 * E2E strategy:
 * - web+backend stack with Fake multi-node HTTP servers (scripts/e2e_stack.py)
 * - Vite frontend bound to that Coordinator via VITE_COORDINATOR_URL
 * - No stub-success paths; failures fail the gate
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${vitePort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: stackCommand,
      url: `${coordinatorUrl}/api/status`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${vitePort} --strictPort`,
      url: `http://127.0.0.1:${vitePort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        VITE_COORDINATOR_URL: coordinatorUrl,
      },
    },
  ],
  metadata: {
    coordinatorUrl,
    stack: 'web+backend Fake multi-node',
  },
});
