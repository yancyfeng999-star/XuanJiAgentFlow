import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultStatePath = path.join(root, '.e2e', 'stack.json');

export function coordinatorUrl(
  env: NodeJS.ProcessEnv = process.env,
  statePath = defaultStatePath,
): string {
  if (env.E2E_COORDINATOR_URL) return env.E2E_COORDINATOR_URL;
  if (env.E2E_COORDINATOR_PORT) {
    return `http://127.0.0.1:${env.E2E_COORDINATOR_PORT}`;
  }
  // Leftover .e2e/stack.json is only trusted when reuse is explicit.
  if (env.E2E_REUSE_EXISTING_SERVER === '1' && fs.existsSync(statePath)) {
    const meta = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { coordinator_url: string };
    return meta.coordinator_url;
  }
  return 'http://127.0.0.1:18080';
}
