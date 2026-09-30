import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config for the web app.
 *
 * IMPORTANT — this config only manages the *frontend* dev server (`vite`). It
 * does NOT start Postgres/Redis/MinIO/Mailpit or the NestJS API, because the
 * root `bun run dev` (turbo, all apps + migrations) is too heavy to spin up
 * automatically for every test run. Before running `bun run e2e`:
 *
 *   1. `docker compose up -d` (from the repo root) — postgres, redis, minio, mailpit
 *   2. `bun run dev` (from the repo root, or `bun --filter @cragfoge/api dev`)
 *      so the API is listening on http://localhost:3000
 *
 * With those running, this config will reuse your existing `vite` dev server
 * on http://localhost:5173 if there is one (reuseExistingServer is true
 * outside CI), or start one itself otherwise.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
