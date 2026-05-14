/**
 * ARENCON Toolkit E2E — Visual regression (S129 Item 4.2, foundation).
 *
 * P-9 Phase 3: pixel-diff screenshots against committed baselines. Catches
 * font/layout drift, CSS regressions, and Chromium-version-induced render
 * changes that unit tests can't see.
 *
 * Foundation scope (this file):
 *   1. Index portal layout baseline — sanity check on the toolkit entry page.
 *   2. Trapeze Hanger Calculator screen layout — exercises a real ARENCON
 *      tool that's standalone (no auth).
 *   3. Trapeze Hanger Calculator @ media:print — the real PDF-style output
 *      via window.print(). This is the meaningful "PDF visual regression"
 *      target: same browser print pipeline FRT PDF export uses, on a tool
 *      that needs no auth or fixture.
 *
 * What this catches:
 *   - Calibri / BlairMdITC font metric changes
 *   - CSS variable changes that ripple into print layout
 *   - Chromium version updates that shift glyph positions
 *   - Page break / margin regressions
 *
 * What this does NOT catch (deferred to S130+):
 *   - FRT field-review-report PDF (needs auth or a fixture-mode URL param to
 *     bypass auth without leaving prod surface area). Add a per-tool baseline
 *     once that infrastructure exists.
 *   - Hub project-card layouts (requires authenticated dashboard).
 *
 * Why chromium-desktop only:
 *   - Print rendering is a desktop concept; mobile Pixel 5 viewport doesn't
 *     exercise @media print meaningfully.
 *   - One baseline per test (vs. two) keeps the snapshot count small and
 *     avoids mobile rendering flakes that change with each Chromium update
 *     to mobile emulation.
 *
 * How to update a baseline when an INTENTIONAL visual change ships:
 *   1. Locally:  npx playwright test e2e/visual.spec.js --update-snapshots
 *   2. Inspect the new PNG(s) under e2e/visual.spec.js-snapshots/
 *   3. Commit the new baseline(s) in the same PR as the visual change
 *
 * Diff tolerance:
 *   maxDiffPixelRatio: 0.01 — allows 1% of pixels to differ to absorb
 *   anti-aliasing / font-hinting noise without false alarms. Tighten if
 *   we start missing real regressions; loosen if CI runs flake.
 */
import { test, expect } from '@playwright/test';

// Visual baselines are per-platform. CI is Linux/Chromium-headless; if you
// run locally on Mac/Windows you'll see diffs — that's expected. Snapshots
// committed to the repo are the Linux/CI baseline.
test.beforeEach(async ({}, testInfo) => {
  if (testInfo.project.name !== 'chromium-desktop') {
    test.skip(true, 'Visual baselines maintained for chromium-desktop only');
  }
});

const SCREENSHOT_OPTS = {
  fullPage: true,
  maxDiffPixelRatio: 0.01,
  animations: 'disabled',
  caret: 'hide'
};

test.describe('Visual regression', () => {
  test('index portal — desktop layout', async ({ page }) => {
    await page.goto('index.html');
    await page.waitForLoadState('networkidle');
    // Defensive: wait an extra tick so any post-load JS (config fetch,
    // tile render) has time to settle before snapshot.
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('index-desktop.png', SCREENSHOT_OPTS);
  });

  test('Trapeze Hanger Calculator — screen layout', async ({ page }) => {
    await page.goto('Trapeze_Hanger_Calculator.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('trapeze-screen.png', SCREENSHOT_OPTS);
  });

  test('Trapeze Hanger Calculator — @media print (PDF output regression)', async ({ page }) => {
    await page.goto('Trapeze_Hanger_Calculator.html');
    await page.waitForLoadState('networkidle');
    // Switch to print media — exercises the same path window.print() takes.
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('trapeze-print.png', SCREENSHOT_OPTS);
  });
});
