/* ═══ lib/ui/updateReady.js — "Update ready — tap to restart" (S617) ════════
 *
 * WHY THIS EXISTS (Mark, 05 Aug): updates already install themselves in the
 * background — the service worker downloads the new build, precaches it, and
 * takes control immediately. What was never built is the LAST STEP: nothing
 * told the person an update had arrived, and the screen they were looking at
 * never swapped over, so the only way to get a new build mid-session was a
 * manual hard refresh. The next cold open always got it; the open session
 * never did.
 *
 * WHAT THIS DOES:
 *   1. Listens for the moment a NEW service worker takes control of the page
 *      (which, with this toolkit's skipWaiting+claim worker, is the moment a
 *      new build has fully installed). First-ever install is ignored — that
 *      is not an update.
 *   2. Shows a QUIET pill: "Update ready — tap to restart". Per the design
 *      rules: no toast, no auto-reload — yanking the page out from under an
 *      inspector mid-entry is worse than the wait. The pill sits until
 *      tapped; tapping reloads, which serves the new build.
 *   3. Nudges the update CHECK every 20 minutes. Browsers only check for a
 *      new worker on navigation, and a field tablet can sit on one screen for
 *      an entire shift — without the nudge, an update pushed at 9am would not
 *      be noticed until the app was reopened.
 *
 * The "applies on next open regardless" half needs no code here: the worker
 * already activates immediately, so any fresh open serves the new build.
 *
 * HOST CONTRACT: classic script; call ArcUpdateReady.init(registration) with
 * the value from navigator.serviceWorker.register(...). Safe to call in any
 * environment — every step is guarded and failure leaves the app exactly as
 * it was (an update indicator must never be able to break the tool it
 * updates).
 * ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var _CHECK_MS = 20 * 60 * 1000;
var _shown = false;

function _showPill() {
  if (_shown) return;
  _shown = true;
  try {
    if (document.getElementById('arc-update-pill')) return;
    var p = document.createElement('button');
    p.id = 'arc-update-pill';
    p.type = 'button';
    p.textContent = '\u21BB Update ready \u2014 tap to restart';
    p.setAttribute('aria-label', 'A new version is ready. Tap to restart the app.');
    /* Quiet chip per the design language: accent text on a low-alpha fill,
       1px tinted border, Calibri, generous touch target for gloves. */
    /* S621 (Mark, on-device): bottom-right sat on top of the Prev/Next
       footer buttons on a phone — the tool's own footer owns that corner.
       Top-centre, below the header, is where the freshness pill already
       lives and where nothing is tappable. */
    p.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99990;'
      + 'background:rgba(156,39,66,.10);color:#9C2742;border:1px solid rgba(156,39,66,.35);'
      + 'border-radius:999px;padding:10px 16px;min-height:44px;'
      + 'font:600 13px Calibri,sans-serif;cursor:pointer;'
      + 'box-shadow:0 2px 10px rgba(0,0,0,.10);backdrop-filter:blur(8px);';
    p.onclick = function () {
      p.disabled = true;
      p.textContent = 'Restarting\u2026';
      try { location.reload(); } catch (_) {}
    };
    document.body.appendChild(p);
  } catch (_) { /* an update pill must never break the app */ }
}

function init(reg, opts) {
  try {
    if (!('serviceWorker' in navigator)) return;
    /* No controller yet = the very first install, not an update. */
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }
      _showPill();
    });
    /* Belt for browsers where controllerchange is missed: watch the install
       pipeline directly. 'installed' with an existing controller = update. */
    if (reg && reg.addEventListener) {
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && navigator.serviceWorker.controller) _showPill();
        });
      });
    }
    /* Long-lived field sessions: nudge the check periodically. Hosts that
       already run their own nudge (Diesel's part13 has one) pass
       {nudge:false} so two timers never do one job. */
    if (!(opts && opts.nudge === false) && reg && typeof reg.update === 'function') {
      setInterval(function () {
        try { reg.update().catch(function () {}); } catch (_) {}
      }, _CHECK_MS);
    }
  } catch (_) { /* never break the host */ }
}

root.ArcUpdateReady = { init: init, VERSION: '1.0.0' };
})(typeof window !== 'undefined' ? window : this);
