/**
 * Vitest config — ARENCON Toolkit test scaffolding (P-9 phase 1).
 *
 * Test layout:
 *   frt/tests/unit/        — pure-logic tests against fake mocks. Fast. Run in CI on every push.
 *   frt/tests/contracts/   — tests that hit REAL Supabase/R2 to assert response shapes.
 *                            Run in CI on every push BUT failures are non-blocking flag-only.
 *                            Goal: catch the kind of shape-drift that caused S127 PUSH E.
 *
 * Why two separate test directories: unit tests must be deterministic (no network),
 * contract tests intentionally hit production to validate the mocks tell the truth.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./frt/tests/setup.js'],
    include: ['frt/tests/**/*.test.js'],
    // Generous timeout for contract tests that hit prod
    testTimeout: 10000,
    // Vitest reports per-file; the GH Actions summary catches the totals.
    reporters: ['default']
  }
});
