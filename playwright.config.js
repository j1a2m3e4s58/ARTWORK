import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const port = Number(process.env.E2E_PORT || 43127);
const externalBaseUrl = process.env.E2E_BASE_URL?.replace(/\/$/, '');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: externalBaseUrl || `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'small-mobile-chromium',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 320, height: 568 },
      },
    },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'tablet-chromium', use: { ...devices['iPad Mini'], browserName: 'chromium' } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: externalBaseUrl ? undefined : {
    command: 'npm start',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
      WEB_PORT: String(port),
      API_PORT: '',
      API_HOST: '127.0.0.1',
      APP_ORIGIN: `http://127.0.0.1:${port}`,
      SITE_URL: `http://127.0.0.1:${port}`,
      JWT_SECRET: process.env.JWT_SECRET || 'e2e-only-secret-with-at-least-32-characters',
      ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || 'e2e-admin@example.com',
      ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || 'E2e-Admin-Password-2026!',
      REQUIRE_ADMIN_MFA: 'false',
      SEED_DEMO_CONTENT: 'false',
      SERVE_STATIC: 'true',
      DATA_DIR: path.join(os.tmpdir(), 'reigns-atelier-e2e-data'),
    },
  },
});
