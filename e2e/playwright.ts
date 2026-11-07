import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    locale: 'en-GB',
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      cwd: root,
      command: 'pnpm --filter @itsm/api... build && node services/api/dist/main.js',
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        PORT: '3000',
        MONITOR_ENABLED: 'true',
        MONITOR_INTERVAL_MS: '1000',
        ESCALATION_POLICY: 'demo',
        // Exercise the HTTP adapter's real fallback, even if ML happens to be running.
        ML_SERVICE_URL: 'http://127.0.0.1:1',
        NOTIFICATIONS_EMAIL_ENABLED: 'true',
      },
    },
    {
      cwd: root,
      command: 'pnpm --filter @itsm/web dev --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
