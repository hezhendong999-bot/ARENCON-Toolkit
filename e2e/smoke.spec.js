/**
 * ARENCON Toolkit E2E — smoke tests (S129 Item 4.1 foundation).
 *
 * These run against the LIVE deployed GitHub Pages site. They are
 * intentionally narrow: prove that the three main entry points boot,
 * render their top-level UI, and don't throw uncaught JS errors.
 *
 * What this catches that unit tests don't:
 *   - GitHub Pages relative-path regressions
 *   - Service worker registration failures
 *   - Top-level JS errors on the boot path (the kind that leave
 *     a blank screen with no test feedback)
 *   - Mobile viewport differences (Pixel 5 project)
 *
 * Deferred to later phases:
 *   - Auth-required flows (login → project list → tool nav)
 *   - Drawing viewer pan/touch behavior
 *   - PDF export round-trip
 *   - Two-finger pinch / mobile gestures
 *
 * Convention: collect uncaught page errors as the test runs and assert
 * the list is empty at the end. Console warnings are NOT treated as
 * failures — only thrown errors and unhandled rejections.
 */
import { test, expect } from '@playwright/test';

/** Attach a JS-error collector to a page. Returns an array that fills
 *  as errors fire. Call before navigating. */
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('crash', () => errors.push('page crashed'));
  // Filter "console" listener to errors only; warnings happen in normal
  // operation (e.g. webgl stencil buffer) and are not failures.
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore expected/known-benign errors:
      //   - Service worker registration in incognito (handled gracefully)
      //   - Supabase 401s on unauthenticated boot (expected — user not logged in)
      //   - Network errors on optional resources (favicon, etc.)
      if (text.includes('Failed to load resource') && (text.includes('401') || text.includes('favicon'))) return;
      if (text.includes('ServiceWorker registration failed')) return;
      errors.push(`console.error: ${text}`);
    }
  });
  return errors;
}

test.describe('Index portal', () => {
  test('loads and renders tool grid', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('index.html');
    await expect(page).toHaveTitle(/ARENCON/i);
    await expect(page.locator('body')).not.toBeEmpty();
    expect(errors, `Page errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

test.describe('FRT entry', () => {
  test('boots without uncaught errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('frt/');
    await expect(page).toHaveTitle(/ARENCON|FRT|Field Review/i);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    expect(errors, `FRT boot errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

test.describe('Hub entry', () => {
  test('boots and shows login or project list', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('ARENCON_Project_Hub.html');
    await expect(page).toHaveTitle(/ARENCON|Hub|Project/i);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    const interactiveCount = await page.locator('button, input').count();
    expect(interactiveCount, 'Hub rendered no interactive elements').toBeGreaterThan(0);
    expect(errors, `Hub boot errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
