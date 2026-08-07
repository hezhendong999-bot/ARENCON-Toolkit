/* ═══════════════════════════════════════════════════════════════════════════
   ARENCON — LIVE UPDATE ENGINE (S588)
   lib/ui/liveUpdate.js

   WHAT THIS IS FOR
   Nobody at ARENCON should ever check a build number again, and nobody should
   ever be told to close the app or hard-refresh. A new build reaches every
   device on its own and goes live at a moment that costs the user nothing.

   WHY IT IS SHARED, NOT COPIED
   The safe-moment rules below are the load-bearing part: get them wrong and a
   tool reloads out from under an inspector who is mid-observation in a
   mechanical room. Five hand-maintained copies of a rule drift, and drift here
   hurts someone. ONE implementation; tools supply only what genuinely differs.
   (Diesel/Electric proved these rules in S596; this is that logic lifted into
   the shared layer, not a re-derivation of it.)

   HOW IT WORKS
   1. The service worker precaches a new build and broadcasts {type:'sw-updated'}
      when it activates. That announcement has existed for a long time; most
      tools simply never listened, which is the real reason staff were
      relaunching by hand for months.
   2. This engine listens, and ALSO asks the browser to check for a new worker
      on launch and on every foreground return — not on a 30-minute timer.
   3. A staged build is applied only at a SAFE MOMENT, never mid-task.
   4. Before applying: unsent work is flushed FIRST, then the user's place
      (panel + scroll) is saved and restored on the way back in.

   WHAT A TOOL SUPPLIES (config) — only the genuinely per-tool parts:
     flush()        → Promise. Push unsent work. Omit if the tool has no sync.
     isBusy()       → true if the tool knows it is mid-task (in-flight save,
                      upload, open dialog). Omit if the tool has no such state.
     busyReason()   → S622. Plain-language end of the sentence "Update ready ·
                      ___", said when a USER TAP is refused: "close the drawing
                      to apply". Engine owns the mechanism, the tool owns the
                      words — only the tool knows what it is busy WITH. Omit and
                      a generic line is used.
     ownBuildChanged() → S627. true/false or a Promise of one. "Did MY code
                      change in this build?" One service worker serves the
                      whole toolkit, so every lane's push stages a build on
                      every device; only the tool can say whether the change
                      is its own. false = stage and apply silently, no pill.
                      Omit (or throw, or reject) and the pill shows as always.
     capture()      → any JSON-able "where I was" value. Omit for simple tools.
     restore(value) → put the user back. Called on boot by restoreAfterUpdate().
     toolName       → for the log line only.

   The engine already refuses to swap while a field is focused, while a dialog
   is open in the DOM, or while the page is hidden mid-gesture — tools do not
   need to re-implement any of that.
   ═══════════════════════════════════════════════════════════════════════════ */

var RESTORE_KEY = 'arencon-restore';   // agreed key, shared across tools
var BG_APPLY_MS = 20 * 1000;           // backgrounded this long → apply
var IDLE_APPLY_MS = 5 * 60 * 1000;     // idle this long with nothing unsaved → apply
var IDLE_TICK_MS = 30 * 1000;
var POLL_MS = 60 * 1000;               // S593: ask for a new build every minute

var _cfg = null;
var _staged = false;      // a new build is precached and waiting
var _applying = false;    // one-shot guard: never reload twice
var _lastActivityAt = Date.now();
var _hiddenSince = 0;
var _hiddenTimer = null;   // S592: pending swap while the tab is hidden
var _pill = null;
/* S622 — a user tap that cannot be honoured yet ARMS this, and a watcher applies
   the moment the blocker clears. Without it the pill refused every tap for as
   long as a drawing stayed open, silently, and the crew learned it was broken. */
var _pendingUserApply = false;
var _pendingTimer = null;

function _log(msg) {
  try { console.log('[LiveUpdate] ' + msg); } catch (e) {}
}

/* ── SAFE MOMENT ──────────────────────────────────────────────────────────
   Every reason NOT to swap. Deliberately conservative: when in doubt we wait,
   because the cost of waiting is a few more minutes on an old build, and the
   cost of being wrong is an inspector losing their place — or their work —
   in a pump room.

   S622 — this now returns the REASON rather than a bare boolean, and _safeNow()
   is a thin wrapper so every existing caller is untouched. Nothing about what
   gets refused has changed; the engine simply became able to say why. Mark:
   "I click on this update ready but nothing happens" — it was refusing
   correctly and reporting nothing, which reads as a dead button. A refusal the
   user cannot see is indistinguishable from a bug. */
function _blockReason() {
  if (_applying) return 'the update is already being applied';

  // Someone is typing or focused in a field.
  try {
    var a = document.activeElement;
    if (a) {
      var tag = (a.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'finish typing to apply';
      if (a.isContentEditable) return 'finish typing to apply';
    }
  } catch (e) {}

  // A dialog/modal/overlay is open — swapping would eat the interaction.
  try {
    if (document.querySelector(
      'dialog[open], .modal.open, .modal.show, .dlg-open, .arc-modal, ' +
      '[role="dialog"]:not([aria-hidden="true"]), .drawing-viewer-overlay.open'
    )) return 'close the open window to apply';
  } catch (e) {}

  // The tool says it is mid-task. Only the tool knows what it is busy WITH,
  // so the tool supplies the words; the engine never guesses on its behalf.
  try {
    if (_cfg && _cfg.isBusy && _cfg.isBusy()) {
      var why = null;
      try { if (_cfg.busyReason) why = _cfg.busyReason(); } catch (e2) {}
      return why || 'finish what is open to apply';
    }
  } catch (e) {}

  return null;
}

function _safeNow() { return _blockReason() === null; }

/* ── APPLY ────────────────────────────────────────────────────────────────
   Order matters and is not negotiable: flush unsent work FIRST, then save the
   user's place, then reload. A swap must never be the reason something did not
   reach the cloud. If the flush fails we still reload — the work is already in
   local storage by then and the next session pushes it — but we log it. */
function _apply(reason) {
  if (_applying || !_staged) return;

  /* S622 — a USER TAP is a promise, so it must never be answered with silence.
     If we cannot honour it yet, say what is in the way and ARM it: the watcher
     below applies the moment the blocker clears, so the inspector never has to
     remember to come back and tap again. Automatic swaps (backgrounded / idle)
     stay silent and unchanged — they were never a promise to anyone. */
  var block = _blockReason();
  if (block !== null) {
    if (reason.indexOf('user tapped') === 0) {
      _pillSay('\u2728 Update ready \u00b7 ' + block);
      _armUserApply();
      _log('user tap deferred — ' + block);
    }
    return;
  }

  /* S592: belt-and-braces — a swap attributed to the tab being hidden must
     never fire against a visible page, whatever the timing race. */
  if (reason.indexOf('backgrounded') === 0 && !document.hidden) return;
  _applying = true;
  _log('applying new build (' + reason + ')');

  Promise.resolve()
    .then(function () { return (_cfg && _cfg.flush) ? _cfg.flush() : null; })
    .catch(function (e) { _log('flush failed before update — reloading anyway: ' + e); })
    .then(function () {
      try {
        if (_cfg && _cfg.capture) {
          var where = _cfg.capture();
          if (where !== undefined && where !== null) {
            sessionStorage.setItem(RESTORE_KEY, JSON.stringify({
              tool: (_cfg && _cfg.toolName) || 'tool',
              at: Date.now(),
              where: where
            }));
          }
        }
      } catch (e) {}
      window.location.reload();
    });
}

/* ── S622 — SAYING SO, AND FOLLOWING THROUGH ──────────────────────────────
   Two small pieces the pill needed: a way to change what it says, and a way to
   keep a promise it could not keep at the moment it was made. */
function _pillSay(text) {
  if (!_pill) return;
  try { _pill.textContent = text; } catch (e) {}
}

function _armUserApply() {
  if (_pendingUserApply) return;   // once-guard: repeated taps arm one watcher
  _pendingUserApply = true;
  _pendingTimer = setInterval(function () {
    if (!_staged || _applying) { _disarmUserApply(); return; }
    if (!_safeNow()) return;   // still blocked — keep waiting, quietly
    _disarmUserApply();
    _apply('user tapped the pill, applied once free');
  }, 1500);
}

function _disarmUserApply() {
  _pendingUserApply = false;
  if (_pendingTimer) { clearInterval(_pendingTimer); _pendingTimer = null; }
}

/* ── THE PILL ─────────────────────────────────────────────────────────────
   Quiet, corner, non-blocking, GREEN — a waiting update is good news, never a
   warning. It is an escape hatch, not the mechanism: in normal use the swap
   happens on backgrounding and nobody ever taps this. No dialog, no toast. */
function _showPill() {
  if (_pill || document.getElementById('arcUpdPill')) return;
  var p = document.createElement('div');
  p.id = 'arcUpdPill';
  p.setAttribute('role', 'status');
  p.textContent = '\u2728 Update ready \u00b7 tap to apply';
  p.style.cssText =
    'background:rgba(46,158,114,.95);color:#fff;border:1px solid rgba(255,255,255,.25);' +
    'font:600 12.5px/1.3 Calibri,sans-serif;padding:9px 15px;border-radius:18px;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;';
  /* S595 (Mark: "it was covering my Next button in Diesel") — POSITION IS A
     CROSS-TOOL DECISION, so it is made once here rather than per tool.
     Bottom-right is the worst possible corner in this toolkit: Diesel and
     Electric put Next/Save there, FRT's viewer has its own bars, and the Hub
     has the build stamp. The bottom edge belongs to the tools.
     TOP-CENTRE, just under the header band, is the one region every tool
     leaves free — headers own the top corners, content starts below, and
     nothing is anchored dead-centre at the top. It is also where a person
     looks first, which suits something optional and ignorable.
     Fixed with priority so no host stylesheet can knock it into the flow. */
  p.style.setProperty('position', 'fixed', 'important');
  p.style.setProperty('top', 'calc(env(safe-area-inset-top, 0px) + 68px)', 'important');
  p.style.setProperty('left', '50%', 'important');
  p.style.setProperty('transform', 'translateX(-50%)', 'important');
  p.style.setProperty('right', 'auto', 'important');
  p.style.setProperty('bottom', 'auto', 'important');
  p.style.setProperty('z-index', '2147483000', 'important');
  p.style.setProperty('max-width', '80vw', 'important');
  p.style.setProperty('white-space', 'nowrap', 'important');
  p.title = 'A new version is ready — it will apply on its own; tap to apply now';
  p.addEventListener('click', function () { _apply('user tapped the pill'); });
  document.body.appendChild(p);
  _pill = p;
}

/* ── STAGED ───────────────────────────────────────────────────────────────
   A new build is precached and waiting. Try immediately (if they happen to be
   idle at a safe point it goes live at once and invisibly); otherwise the
   watchers below pick it up. */
function _onStaged() {
  if (_staged) return;   // once-guard: repeat broadcasts and multi-tab races
  _staged = true;
  _log('new build staged');
  /* S627 — ONE WORKER SERVES TEN TOOLS, so every push by any lane announces a
     "new build" to every device in the field. The staging is correct; telling
     the user about it is not. A tool that can tell whether IT changed supplies
     ownBuildChanged(); when it says no, the build still stages and still
     applies at the next safe moment — silently, because nothing the person is
     looking at is any different. Tools that do not supply it behave exactly as
     before, and any failure to decide falls through to showing the pill.
     (Mark, on-device 07 Aug: four pump-tool pushes in one night produced four
     "Update ready" pills on a tablet running unchanged FRT code. A signal that
     fires when nothing happened trains people to ignore it.) */
  var decide;
  try {
    decide = (_cfg && typeof _cfg.ownBuildChanged === 'function')
      ? _cfg.ownBuildChanged() : true;
  } catch (e) { decide = true; }
  Promise.resolve(decide)
    .catch(function () { return true; })
    .then(function (mine) {
      if (mine === false) _log('not this tool\u2019s build — staged quietly, no pill');
      else _showPill();
    });
  /* S595 — DO NOT APPLY HERE. The first version applied immediately if the
     user was not typing, which counts someone reading the screen as a safe
     moment. Mark hit it twice: once reloading under him as he scrolled, and
     once swapping so fast the pill was invisible and the update looked broken.
     A staged build now WAITS. It goes live only when they leave the tab, go
     idle five minutes, or tap the pill. If the tab is already hidden when the
     build lands, the departure timer is not running, so apply now — nobody is
     watching, which is the whole test. */
  if (document.hidden) _apply('staged while tab already hidden');
}

/* ── PUBLIC ──────────────────────────────────────────────────────────────── */

export function initLiveUpdate(cfg) {
  _cfg = cfg || {};

  if (!('serviceWorker' in navigator)) {
    _log('no service worker on this platform — live update disabled');
    return;
  }

  // 1. Listen for the worker's announcement.
  try {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e && e.data && e.data.type === 'sw-updated') _onStaged();
    });
  } catch (e) {}

  // 2. Ask for a check now, and on every foreground return. This is the part
  //    FRT was missing — it only asked every 30 minutes, so a fix could sit
  //    unused on a device for half an hour after it shipped.
  function checkNow() {
    try {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (!reg || !reg.update) return;
        // update() throws InvalidStateError mid-install/activate — benign.
        try { var p = reg.update(); if (p && p.catch) p.catch(function () {}); }
        catch (e) {}
      }).catch(function () {});
    } catch (e) {}
  }
  checkNow();

  // 3. Activity + visibility watchers drive the safe moments.
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (evt) {
    try {
      document.addEventListener(evt, function () { _lastActivityAt = Date.now(); },
        { passive: true, capture: true });
    } catch (e) {}
  });

  /* ── S592 — SWAP WHILE THEY ARE AWAY, NEVER AS THEY COME BACK ────────────
     My first version applied the update ON RETURN if they had been away 20s.
     Mark caught it immediately: he stepped away, came back, started scrolling
     and reading, and the page reloaded under him. Of course it did — "returned"
     is precisely the moment he IS looking. The requirement is the opposite:
     swap only while nobody is watching.
     So the swap now happens WHILE the tab is hidden, 20s in. Coming back never
     triggers a reload; it only asks whether something newer exists. If a
     browser froze our timer while hidden (mobile does this) the update simply
     stays staged and waits for the next departure, the 5-minute idle window, or
     a tap on the pill. Waiting costs a few minutes on an older build; reloading
     under someone costs them their place. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      _hiddenSince = Date.now();
      if (_hiddenTimer) clearTimeout(_hiddenTimer);
      _hiddenTimer = setTimeout(function () {
        _hiddenTimer = null;
        if (!document.hidden) return;            // they came back first — leave it alone
        if (_staged) _apply('backgrounded ' + Math.round(BG_APPLY_MS / 1000) + 's, nobody watching');
      }, BG_APPLY_MS);
      return;
    }
    // Coming back to the foreground: cancel any pending swap, check for new.
    if (_hiddenTimer) { clearTimeout(_hiddenTimer); _hiddenTimer = null; }
    _hiddenSince = 0;
    _lastActivityAt = Date.now();
    checkNow();
  });

  setInterval(function () {
    if (!_staged) return;
    if ((Date.now() - _lastActivityAt) > IDLE_APPLY_MS) _apply('idle 5 min');
  }, IDLE_TICK_MS);

  /* ── S593 — KEEP ASKING (Mark: "I've been waiting and nothing is showing") ──
     The engine only asked on launch and on foreground return. Sitting still on
     a page it never asked, so it never learned a new build existed, so there
     was nothing to stage and no pill to show — the Hub open on a second
     monitor all day would never update, which is the opposite of the goal.
     Now it asks every minute while the tab is visible. This is a cheap
     conditional request to one small file, not a download: the browser only
     pulls a new build when the worker has actually changed. Paused while
     hidden — a backgrounded tab has nothing to show anyone, and the departure
     swap already covers that case. */
  setInterval(function () {
    if (document.hidden) return;
    if (_staged) return;               // already have one waiting
    checkNow();
  }, POLL_MS);

  _log('armed for ' + (_cfg.toolName || 'tool'));
}

/* Call once on boot, AFTER the tool can act on its own state. Returns the
   captured value so the tool can put the user back, or null. Consumes the
   record so a later ordinary reload never teleports someone. */
export function restoreAfterUpdate(toolName) {
  var raw = null;
  try {
    raw = sessionStorage.getItem(RESTORE_KEY);
    sessionStorage.removeItem(RESTORE_KEY);
  } catch (e) { return null; }
  if (!raw) return null;
  try {
    var rec = JSON.parse(raw);
    if (!rec) return null;
    if (toolName && rec.tool && rec.tool !== toolName) return null;
    // Stale guard: a record older than 2 minutes is not this reload's.
    if (rec.at && (Date.now() - rec.at) > 120000) return null;
    _log('restoring position after update');
    return rec.where;
  } catch (e) { return null; }
}

export const LIVE_UPDATE_VERSION = '1.0.0';
