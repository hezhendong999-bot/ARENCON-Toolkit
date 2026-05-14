/**
 * ARENCON Toolkit — Playwright E2E config (S129 Item 4.1, foundation).
 *
 * P-9 Phase 2: real-browser tests for things unit tests can't reach —
 * pan/touch, drawing viewer, PDF export, two-finger pinch, pin tap
 * accuracy, service worker behavior.
 *
 * Foundation scope: smoke tests against the deployed GitHub Pages site.
 * No auth-required tests yet (deferred to a later phase — needs a test
 * Supabase account or mocked auth state). What we test now: app boots,
 * static assets load, no uncaught JS errors, login screen renders.
 *
 * Why deployed-site target (not local static server):
 *  - Zero CI orchestration — just `playwright test`.
 *  - Catches GitHub Pages-specific issues (relative paths, SW scope).
 *  - Trades: tests run against current main, not a PR's preview.
 *    Mark deploys to main directly so this matches actual workflow.
 *
 * Browser matrix: Chromium only at foundation. Pixel 5 mobile project
 * mirrors the Android field-tablet target. Webkit/Firefox can come later.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // CI: 1 retry on transient failure. Locally: no retry (fail loud).
  retries: process.env.CI ? 1 : 0,
  // CI: 1 worker (deterministic, low resource).
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'https://hezhendong999-bot.github.io/ARENCON-Toolkit/',
    trace: process.env.CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
    // Don't fail the test if a third-party (e.g. Supabase keep-alive)
    // request 404s; we only care about ARENCON's own assets.
    ignoreHTTPSErrors: false
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'chromium-mobile',
      // Pixel 5: matches Mark's Android field tablet target. iPad/iOS
      // path is permanently abandoned per S125 — no Safari project.
      use: { ...devices['Pixel 5'] }
    }
  ]
});
