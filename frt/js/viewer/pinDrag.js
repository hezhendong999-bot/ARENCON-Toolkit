/* ══════════════════════════════════════════════════════════════════════════
   ARENCON FRT — PIN DRAG LAW                    frt/js/viewer/pinDrag.js v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION — U1. One implementation of the rules that decide whether a pin
   position may be written, what happens when it may not, and what is recorded.

   WHAT THIS OWNS. Only the LAW. Not gestures, not rendering, not saving. A pin
   coordinate is report data: it is what a drawing says about where a problem
   is, and it is read months later by people who were never on site. Three
   surfaces move pins — a finger on the drawing, a mouse on the drawing, and
   the small map inside the pin card — and until this module each carried its
   own copy of the rules. Copies drift, and the drift is invisible until a pin
   is somewhere nobody put it.

   THE THREE INVARIANTS (S569, hard-won; every one of them was paid for):

     1. INTENT IS PROVEN, NEVER INFERRED. Nothing moves before the armed hold
        completes. S331w removed that rule on touch — "one finger on a pin is
        ALWAYS a drag" — and all seventeen recorded teleports, across five
        inspectors and four projects, are a one-finger flick that happened to
        begin on a pin. HOLD_MS and CANCEL_PX live here so the three surfaces
        cannot quietly disagree about what counts as intent.

     2. A GESTURE IS A PREVIEW UNTIL IT ENDS CLEANLY. The true position is
        captured when the drag arms. Any abnormal end — a second finger that
        is not a deliberate placement, the app being backgrounded for the
        camera, the editor closing under it — RESTORES that position. Nothing
        invalid may persist merely because a gesture was interrupted.

        THIS IS THE RULE THE MINI-MAP DID NOT HAVE, and it is the defect this
        module closes. That surface wrote the pin on every move frame and
        captured nothing, so an interrupted drag left the pin wherever the
        finger happened to be — and the next automatic save made that
        permanent, with no gesture ever having been completed.

     3. IMPOSSIBLE ANSWERS ARE REFUSED, NEVER CLAMPED. A computed fraction
        beyond fingertip tolerance is a geometry error, not a placement. It is
        refused, the pin goes back, and what the surface believed is recorded.
        Clamping is what turned errors into believable saved coordinates: six
        corrupted pins sit at exactly 0.000 or 1.000 in the history because a
        stale rect or a mid-zoom scale was quietly parked on the boundary.

   INSIDE TOLERANCE, A HAIR PAST THE EDGE STILL CLAMPS — deliberately. A
   fingertip may legitimately sit slightly beyond the sheet while dragging a
   pin to the boundary. Refusal begins past TOL, not past the edge.

   THE RECORD. Every accepted, refused, ignored and disarmed write lands in
   window._frtPinWriteLog, which the on-tablet Pin Write Log panel reads
   (S587 — the field tablets have no console, so this is the only evidence
   that exists). The panel reads `computed.x` / `computed.y`; the drawing
   viewer used to record `x` / `y` at the top level instead, so every viewer
   entry displayed its position as a dash. Entries written here carry BOTH
   shapes, so the panel now shows positions for all three surfaces.

   WHAT IS DELIBERATELY NOT HERE. Gesture state machines. Arming a drag on a
   tablet means a blue glow and a render pass; on a mouse it means a ready
   state; on the mini-map it means a haptic tick and a repaint. Those are the
   surfaces' own business and they interleave with GL pin painting. Moving
   them would be a large rewrite of live touch code with no gain in data
   safety — the gain is entirely in the law, and the law is here.
   ══════════════════════════════════════════════════════════════════════════ */

/* Fingertip tolerance beyond the sheet before a placement becomes a refusal. */
const TOL = 0.02;
/* The armed hold. Same duration on every surface since S568. */
const HOLD_MS = 500;
/* Movement before the hold completes cancels the drag — it was a scroll. */
const CANCEL_PX = 5;
/* The panel shows the last 40; keeping more only grows memory on a tablet. */
const LOG_CAP = 40;

/* Captured true positions, keyed by surface. A surface can only own one
   gesture at a time, so one slot each is enough — and keying by surface
   means the drawing viewer and the mini-map can never restore each other. */
const _held = Object.create(null);

function _round(n) {
  return (typeof n === 'number' && isFinite(n)) ? Math.round(n * 1e4) / 1e4 : n;
}

/* One log stream, one record shape, every surface. Never throws — a failure
   to record must never be able to stop a pin write. */
function logWrite(surface, verdict, fx, fy, extra) {
  try {
    if (!window._frtPinWriteLog) window._frtPinWriteLog = [];
    const entry = {
      at: new Date().toISOString(),
      surface: surface,
      verdict: verdict,
      computed: { x: _round(fx), y: _round(fy) },
      x: _round(fx),
      y: _round(fy)
    };
    if (extra) { for (const k in extra) { if (!(k in entry)) entry[k] = extra[k]; } }
    window._frtPinWriteLog.push(entry);
    if (window._frtPinWriteLog.length > LOG_CAP) window._frtPinWriteLog.shift();
    if (verdict !== 'COMMIT') {
      try { console.warn('[PinDrag] ' + surface + ' ' + verdict, entry); } catch (e) {}
    }
  } catch (e) {}
}

/* The verdict itself, with nothing recorded. Returns the position to write,
   or null when the answer is impossible. */
function validate(fx, fy) {
  if (!(typeof fx === 'number' && typeof fy === 'number') || !isFinite(fx) || !isFinite(fy)) return null;
  if (fx < -TOL || fx > 1 + TOL || fy < -TOL || fy > 1 + TOL) return null;
  return { x: Math.max(0, Math.min(1, fx)), y: Math.max(0, Math.min(1, fy)) };
}

/* Validate and record the refusal. For paths that judge a position without
   owning a drag (placing a new pin), where there is nothing to restore. */
function validateLogged(surface, fx, fy, why) {
  const ok = validate(fx, fy);
  if (!ok) logWrite(surface, 'REFUSED ' + (why || 'write') + ' (off-sheet)', fx, fy);
  return ok;
}

/* Remember where the pin really is before a preview begins.
   `resolve` lets a host re-find its record by id at restore time rather than
   holding a reference across a possible cloud merge. */
function capture(surface, rec, resolve) {
  _held[surface] = (rec && rec.pinX != null)
    ? { id: rec.id, x: rec.pinX, y: rec.pinY, rec: rec, resolve: resolve || null }
    : null;
}

function held(surface) { return !!_held[surface]; }

function clear(surface) { _held[surface] = null; }

/* Put the pin back where it was and say why. Returns true if anything was
   restored, so a host can decide whether it needs to repaint. */
function restore(surface, reason) {
  const h = _held[surface];
  if (!h) return false;
  let target = h.rec;
  try { if (h.resolve) target = h.resolve(h.id) || h.rec; } catch (e) {}
  if (target) { target.pinX = h.x; target.pinY = h.y; }
  logWrite(surface, 'RESTORED (' + (reason || 'interrupted') + ')', h.x, h.y, { deficId: h.id });
  _held[surface] = null;
  return true;
}

/* A live drag frame: validated, written, NOT recorded. Sixty frames a second
   would bury the evidence log under a single drag, and a preview is not a
   decision. A refused frame writes nothing and leaves the pin alone. */
function preview(surface, rec, fx, fy) {
  const ok = validate(fx, fy);
  if (!ok || !rec) return false;
  rec.pinX = ok.x;
  rec.pinY = ok.y;
  return true;
}

/* The decision. One validated write, one record. A refusal restores the
   captured position rather than clamping an error onto the sheet edge. */
function commit(surface, rec, fx, fy, extra) {
  const ok = validate(fx, fy);
  if (!ok) {
    logWrite(surface, 'REFUSED off-sheet', fx, fy, extra);
    restore(surface, 'off-sheet commit');
    return false;
  }
  if (!rec) return false;
  rec.pinX = ok.x;
  rec.pinY = ok.y;
  logWrite(surface, 'COMMIT', ok.x, ok.y, extra);
  _held[surface] = null;
  return true;
}

/* A position already validated frame-by-frame, now deliberately released.
   Records the decision and closes the capture so nothing can restore over it. */
function commitPreviewed(surface, rec, extra) {
  if (!rec || rec.pinX == null) { _held[surface] = null; return false; }
  logWrite(surface, 'COMMIT', rec.pinX, rec.pinY, extra);
  _held[surface] = null;
  return true;
}

/* Something happened that was never a placement — a press on the wrong pin, a
   gesture disarmed by the camera. Recorded so the next report of a pin moving
   on its own names its own cause. */
function note(surface, verdict, extra) {
  logWrite(surface, verdict, -1, -1, extra);
}

export const PinDrag = {
  TOL: TOL,
  HOLD_MS: HOLD_MS,
  CANCEL_PX: CANCEL_PX,
  validate: validate,
  validateLogged: validateLogged,
  logWrite: logWrite,
  capture: capture,
  held: held,
  clear: clear,
  restore: restore,
  preview: preview,
  commit: commit,
  commitPreviewed: commitPreviewed,
  note: note
};

/* Reachable from the tablet for diagnostics, same as the write log itself. */
try { window.PinDrag = PinDrag; } catch (e) {}
