/**
 * Global test setup — runs once before any test file.
 *
 * Provides:
 *   - fake-indexeddb (drop-in replacement for window.indexedDB)
 *   - localStorage (jsdom provides this natively, just ensure clean state)
 *   - global fetch mock helper (overridden per-test as needed)
 */
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';

// Each test starts with a clean localStorage. Tests that need auth state
// must set `sb-access-token` explicitly.
beforeEach(() => {
  if (typeof localStorage !== 'undefined' && localStorage.clear) {
    localStorage.clear();
  }
});
