import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API = 'http://localhost:3000/api';

/** The seed truncates every table, so refuse anything but a local database. */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to reseed non-local database host "${host}" for e2e tests.`);
  }
}

/** The active priority strategy lives in API memory, not the seed; reset it for a reused API. */
async function resetPriorityStrategy() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'arjun@itsm.demo', password: 'demo1234' }),
  });
  if (!login.ok) throw new Error(`Admin sign-in for e2e setup failed: ${login.status}`);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const update = await fetch(`${API}/admin/strategies`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ priority: 'weighted-score' }),
  });
  if (!update.ok) throw new Error(`Resetting the priority strategy failed: ${update.status}`);
}

// Playwright starts the webServer entries before global setup, so the API is up here.
export default async function globalSetup() {
  assertLocalDatabase();
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  // Seed deliberately truncates demo incidents and resets numbering; never run against live data.
  for (const command of ['db:migrate', 'db:seed']) {
    execFileSync('pnpm', ['--filter', '@itsm/api', command], {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, SEED_PASSWORD: 'demo1234' },
    });
  }
  await resetPriorityStrategy();
}
