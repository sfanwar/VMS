import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for VMS end-to-end tests.
 *
 * Prereq: the docker-compose stack must be up and seeded:
 *   make up && make seed
 *
 * The tests treat the stack as a black box, exercising the REST API directly.
 * No UI tests here — those would go in a second project block.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,           // Workflow tests share request IDs — serial is safer
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'api', testMatch: /.*\.api\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
});
