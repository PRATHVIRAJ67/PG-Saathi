import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the owner dashboard in demo mode (real migrations in
 * PGlite inside the browser), so they exercise the real database functions
 * without needing a Supabase project.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npm run dev -w @pg/owner-dashboard -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @pg/super-admin -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
