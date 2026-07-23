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
 *
 * S129 Item 4.3 — coverage gate. `npm run test:coverage` enforces thresholds
 * measured against files that tests import (not whole-codebase). Numbers
 * chosen just below current baseline (53.93% stmts / 67.94% branches at
 * S129) so future PRs can't silently regress coverage.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./frt/tests/setup.js'],
    // S499: `tests/**` is the SHARED-LIB suite (lib/**), starting with the
    // Diesel carve. FRT keeps its own tree; both run in one command so a
    // shared-engine change cannot pass by only testing one tool.
    include: ['frt/tests/**/*.test.js', 'tests/**/*.test.js'],
    // Generous timeout for contract tests that hit prod
    testTimeout: 10000,
    // Vitest reports per-file; the GH Actions summary catches the totals.
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      // Scope: only files tests actually load. Untested modules
      // (markup.js, viewer/*, ui/*) intentionally excluded — adding
      // them to `include` without tests would force 0% and block all PRs.
      // Expand `include` as new tests are added.
      include: [
        'frt/js/data/r2.js',
        'frt/js/data/merge.js',
        'frt/js/data/syncWorker.js',
        'frt/js/data/uploadQueue.js'
      ],
      // Mocks aren't production code; exclude from report.
      exclude: ['frt/tests/__mocks__/**', 'frt/tests/setup.js'],
      reporter: ['text', 'json-summary'],
      // Threshold gate — fails the run if coverage drops below these.
      // Baselines at S129: r2.js/merge.js ≈58%, syncWorker.js ≈80%.
      // Using floor of the lowest to keep one global gate that all
      // future PRs must clear.
      thresholds: {
        statements: 50,
        branches: 60,
        functions: 50,
        lines: 50
      }
    }
  }
});

