/* ═══ lib/data/syncCadence.js — WHEN to check the cloud (S618) ══════════════
 *
 * THE PROBLEM. Every open report asked the cloud "anything new?" every 15
 * seconds, forever — a tab parked on a second monitor all afternoon, a tablet
 * face-down in a truck, a report nobody has touched since lunch. Eighteen
 * technical staff with a few tabs each is tens of thousands of checks a day,
 * almost all of them answering "no". Commercial field tools do not do this;
 * they go quiet when nothing is happening and wake instantly when it is.
 *
 * WHAT THIS IS NOT. This is not a fix for the checking itself — the right
 * long-term shape is the server PUSHING changes down an open line, which also
 * takes "see a colleague's entry" from up to 15s to under a second. This
 * module is the cheap, low-risk first step and it deliberately does not touch
 * the save path, the merge, or anything that decides what data wins.
 *
 * THE RULES, and why each one is safe:
 *   • HIDDEN TAB → paused entirely, UNLESS this device is holding unsent work.
 *     A backgrounded tab has nobody reading it, so a stale screen harms no
 *     one; but a device with work still in its pocket must keep trying, or
 *     backgrounding the app would strand an inspector's edits. That exception
 *     is the whole reason this is not simply `if (hidden) return`.
 *   • ACTIVELY WORKING (edit within 2 min) → the full 15s beat, unchanged.
 *   • QUIET (2–10 min) → 30s.  • IDLE (>10 min) → 60s, and no slower.
 *     The cap matters: someone READING a report while a colleague types is
 *     idle by this measure, and must still see the colleague's work land. A
 *     minute is the worst case, and only after ten minutes of stillness.
 *   • UNSENT WORK → always the full beat, whatever the idle timer says. Work
 *     waiting to reach the cloud is never slowed down.
 *   • COMING BACK (tab visible, window focused, or any keystroke) → the next
 *     check runs IMMEDIATELY, not on the next scheduled beat. This is what
 *     makes the back-off invisible in use: the moment a person returns, the
 *     report refreshes.
 *
 * DELIBERATELY NOT DONE HERE: nothing about what data wins, nothing about
 * when a push happens. Cadence only. A bug in this file can make the tool
 * slower to notice a change; it cannot lose or corrupt anyone's work.
 *
 * HOST CONTRACT (classic script, late-bound global):
 *     if (window.ArcSyncCadence && !ArcSyncCadence.shouldTick({
 *           hasPendingWork: CloudSync.hasPendingSync })) return;
 * placed at the TOP of the existing heartbeat, before any network call. The
 * host's own 15s timer is unchanged — this only decides whether a given beat
 * does any work, so removing the module restores the old behaviour exactly.
 * ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var FULL_MS  = 15000;    // actively working — unchanged from the old fixed beat
var QUIET_MS = 30000;    // 2–10 min since the last keystroke
var IDLE_MS  = 60000;    // >10 min — the hard floor, never slower

var QUIET_AFTER = 2  * 60 * 1000;
var IDLE_AFTER  = 10 * 60 * 1000;

var _lastEditAt = Date.now();   // assume fresh at boot: a person just opened this
var _lastTickAt = 0;            // 0 = the next beat runs immediately
var _stats = { skippedHidden: 0, skippedBackoff: 0, ran: 0 };

function _wake() { _lastTickAt = 0; }          // next beat runs now
function _touch() { _lastEditAt = Date.now(); _wake(); }

try {
  /* Capture phase so a field that stops propagation cannot hide a keystroke
     from us — this must never under-report activity. */
  document.addEventListener('input',  _touch, true);
  document.addEventListener('change', _touch, true);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) _wake();
  });
  window.addEventListener('focus', _wake);
  window.addEventListener('online', _wake);
} catch (_) { /* a cadence hint must never break the host */ }

function desiredIntervalMs() {
  var idle = Date.now() - _lastEditAt;
  if (idle < QUIET_AFTER) return FULL_MS;
  if (idle < IDLE_AFTER)  return QUIET_MS;
  return IDLE_MS;
}

function shouldTick(opts) {
  try {
    var pending = !!(opts && opts.hasPendingWork);
    /* Unsent work overrides everything below — never slow down a flush. */
    if (!pending) {
      if (document.hidden) { _stats.skippedHidden++; return false; }
      var now = Date.now();
      if (now - _lastTickAt < desiredIntervalMs()) { _stats.skippedBackoff++; return false; }
    }
    _lastTickAt = Date.now();
    _stats.ran++;
    return true;
  } catch (_) {
    return true;   // any doubt → behave exactly as before this module existed
  }
}

root.ArcSyncCadence = {
  shouldTick: shouldTick,
  desiredIntervalMs: desiredIntervalMs,
  wake: _wake,
  stats: function () {
    return { ran: _stats.ran, skippedHidden: _stats.skippedHidden,
             skippedBackoff: _stats.skippedBackoff,
             idleMs: Date.now() - _lastEditAt, nextMs: desiredIntervalMs() };
  },
  VERSION: '1.0.0'
};
})(typeof window !== 'undefined' ? window : this);
