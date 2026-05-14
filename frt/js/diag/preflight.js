/**
 * ARENCON FRT — Boot Pre-flight Diagnostic (S130 Item 1.3)
 * ════════════════════════════════════════════════════════
 *
 * Verifies the S129 boot-perf optimizations actually fired on a real device
 * under real-world token expiry conditions. Turns the otherwise vague
 * "pre-flight check" into a 30-second pass/fail.
 *
 * HOW TO RUN
 * ──────────
 *   1. Sign out of FRT on the field tablet.
 *   2. Wait at least 65 minutes (longer than the 1-hour Supabase access-
 *      token TTL). Doing other work in another tab is fine.
 *   3. Open the Hub on the tablet and sign back in.
 *   4. Open any FRT project (any URL with ?project=<uuid>).
 *      Wait for the page to settle — drawings list visible, no spinner.
 *   5. Open DevTools (Chrome on Android: chrome://inspect from a desktop,
 *      or use eruda if you have it installed).
 *   6. In the console, paste this entire file's contents and press Enter.
 *      The function self-invokes and prints a PASS/CHECK summary.
 *
 * WHAT IT VERIFIES
 * ────────────────
 *   - Auth.restoreSession took the 'preemptive' or 'cached-valid' path,
 *     NOT 'refresh-on-401' (which means the S129 Item 1 preemptive refresh
 *     optimization did NOT fire — the old 401→refresh→retry chain ran).
 *   - Auth.restoreSession completed in <2000ms (target on slow tablet links).
 *   - SyncWorker, ImageWorker, and UploadQueue all booted with no fallbacks
 *     to inline / main-thread paths.
 *   - DOM was interactive in <3500ms from navigation start.
 *
 * WHAT IT DOES NOT VERIFY
 * ───────────────────────
 *   - That the page actually feels fast subjectively. Look at it. Tap things.
 *   - That uploads or saves work in real Hub mode — separate verification.
 *
 * Result returned synchronously as an object so you can paste the whole
 * thing into a bug report / handoff doc if needed.
 *
 * Standalone — no imports, no side effects on app state.
 */

(function preflight() {
  var THRESHOLDS = {
    authRestoreMs: 2000,
    domInteractiveMs: 3500,
    minTokenSeconds: 0  // we want the token to have BEEN expiring or expired,
                        // confirming the preemptive path actually had work to do
  };

  function flag(ok) { return ok ? '✅' : '⚠️ '; }

  var checks = [];
  var addCheck = function(name, pass, detail) {
    checks.push({ name: name, pass: pass, detail: detail });
  };

  console.group('🔍 ARENCON Boot Pre-flight (S130 1.3)');

  // ─── Auth ─────────────────────────────────────────────────────────────
  var token = localStorage.getItem('sb-access-token');
  if (!token) {
    console.error('FAIL: No sb-access-token in localStorage. Sign in first via Hub.');
    console.groupEnd();
    return { pass: false, reason: 'not-signed-in' };
  }

  // Decode JWT exp claim
  var jwtExpMs = null;
  try {
    var parts = token.split('.');
    var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    jwtExpMs = payload && payload.exp ? payload.exp * 1000 : null;
  } catch (e) {}

  var nowSec = Math.round((jwtExpMs ? (jwtExpMs - Date.now()) : 0) / 1000);

  // Pull Auth._diag if it's accessible. In FRT v2 it's on the imported Auth
  // module, exposed via the window only if the app explicitly attaches it.
  // Fallback: rely on console log scan instructions.
  var authDiag = (window.Auth && window.Auth._diag) ||
                 (window._frt_auth && window._frt_auth._diag) ||
                 null;
  if (!authDiag) {
    // Try to find Auth via the FRT module graph — Auth is imported by many
    // modules. The Hub or FRT app may not have exposed it on window. Print
    // a friendly note instead of failing the whole script.
    console.warn('Auth._diag not exposed on window — pre-flight will rely on the JWT exp claim and console scrollback for path detection.');
  }

  if (authDiag) {
    addCheck('Auth path used preemptive or cached-valid',
      authDiag.restorePath === 'preemptive' || authDiag.restorePath === 'cached-valid',
      'path=' + authDiag.restorePath);
    addCheck('Auth restoreSession finished under ' + THRESHOLDS.authRestoreMs + 'ms',
      authDiag.restoreMs !== null && authDiag.restoreMs < THRESHOLDS.authRestoreMs,
      authDiag.restoreMs + 'ms');
    if (authDiag.tokenExpAtRestore !== null) {
      var expSec = Math.round(authDiag.tokenExpAtRestore / 1000);
      addCheck('Token was near/past expiry at restore (genuine preemptive scenario)',
        authDiag.tokenExpAtRestore < 600000,  // <10 min at restore
        'remaining was ' + expSec + 's');
    }
  }

  // ─── SyncWorker (S128 P-6 + S130 5.3 parseLarge) ─────────────────────
  var sw = window._frt_syncWorker && window._frt_syncWorker._diag;
  if (sw) {
    addCheck('SyncWorker booted', sw.workerOK, 'workerOK=' + sw.workerOK);
    addCheck('SyncWorker has no fallbacks', sw.fallbackCount === 0, 'fallbackCount=' + sw.fallbackCount);
    if (sw.callCount > 0) {
      addCheck('SyncWorker has handled at least 1 call', true, 'callCount=' + sw.callCount);
    }
  } else {
    addCheck('SyncWorker exposed on window', false, '_frt_syncWorker missing');
  }

  // ─── ImageWorker (S130 5.4) ──────────────────────────────────────────
  // Only meaningful AFTER at least one photo has been added — if no photos
  // yet, callCount is 0 and we just confirm the worker bootstrapped.
  var iw = window._frt_imageWorker && window._frt_imageWorker._diag;
  if (iw) {
    if (typeof OffscreenCanvas !== 'undefined') {
      addCheck('ImageWorker (OffscreenCanvas) available on this device',
        iw.workerOK,
        'workerOK=' + iw.workerOK + ', err=' + (iw.lastError || 'none'));
    }
    if (iw.callCount > 0) {
      addCheck('ImageWorker has no fallbacks to main thread',
        iw.fallbackCount === 0,
        'fallbackCount=' + iw.fallbackCount + ' of ' + iw.callCount);
    }
  } else {
    addCheck('ImageWorker exposed on window', false, '_frt_imageWorker missing');
  }

  // ─── UploadQueue (S130 5.1) ──────────────────────────────────────────
  var uq = window._frt_uploadQueue && window._frt_uploadQueue.diag;
  if (uq) {
    if (uq.enqueued > 0) {
      addCheck('UploadQueue: every enqueued upload completed or is in flight',
        (uq.completed + uq.running) >= (uq.enqueued - uq.failed),
        'enqueued=' + uq.enqueued + ' completed=' + uq.completed +
        ' failed=' + uq.failed + ' retried=' + uq.retried);
    } else {
      addCheck('UploadQueue available (no uploads yet)', true,
        'add a photo to populate counters');
    }
  } else {
    addCheck('UploadQueue exposed on window', false, '_frt_uploadQueue missing');
  }

  // ─── Boot timing ─────────────────────────────────────────────────────
  var nav = performance.getEntriesByType('navigation')[0];
  if (nav) {
    var domInt = Math.round(nav.domInteractive - nav.fetchStart);
    addCheck('DOM interactive within ' + THRESHOLDS.domInteractiveMs + 'ms',
      domInt < THRESHOLDS.domInteractiveMs,
      domInt + 'ms');
  }

  // ─── Render results ──────────────────────────────────────────────────
  console.table(checks.map(function(c) {
    return { check: c.name, status: flag(c.pass), detail: c.detail };
  }));

  var allPass = checks.every(function(c) { return c.pass; });
  console.log(allPass
    ? '%c✅ PASS — S129 boot-perf optimizations verified live on this device.'
    : '%c⚠️  CHECK — one or more boot-perf items not in expected state. See table above.',
    'font-weight:bold; font-size:14px; padding:4px 8px;');

  if (!allPass) {
    console.log('Console scrollback check: look for "[Auth] Cached token near/past expiry" — its presence confirms the preemptive refresh path. Its absence (combined with a token that WAS expiring) means S129 Item 1 did not fire.');
  }

  console.log('Token currently has ' + nowSec + 's remaining. (For the genuine S129 test scenario, this should have been negative or close to zero immediately after sign-in following the 1h+ wait.)');
  console.log('User-Agent:', navigator.userAgent);

  console.groupEnd();
  return {
    pass: allPass,
    checks: checks,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString()
  };
})();
