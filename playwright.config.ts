import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the owner dashboard in demo mode (real migrations in
 * PGlite inside the browser), so they exercise the real database functions
 * without needing a Supabase project.
 */
/**
 * Tests never touch a real database: blank Supabase settings force every app
 * into demo mode, even when local .env files point at a live project.
 * (Environment variables set here take precedence over .env files.)
 */
const DEMO_ENV = {
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
  EXPO_PUBLIC_SUPABASE_URL: '',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
};

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
      reuseExistingServer: false,
      timeout: 120_000,
      env: DEMO_ENV,
    },
    {
      command: 'npm run dev -w @pg/super-admin -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 120_000,
      env: DEMO_ENV,
    },
    {
      // Export the mobile app in demo mode, then serve it.
      command: 'npm run export:web -w @pg/mobile && node scripts/serve-static.mjs apps/mobile/dist-web 5175',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 300_000,
      env: DEMO_ENV,
    },
  ],
});
