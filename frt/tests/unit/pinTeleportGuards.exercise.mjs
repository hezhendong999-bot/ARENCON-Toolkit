// ══ PIN TELEPORT GUARDS EXERCISE (S575) ════════════════════════════════════
// Runs standalone: `node frt/tests/unit/pinTeleportGuards.exercise.mjs`
// Exit 0 = every recorded cause of the S331w→S569 pin-teleport class is still
// impossible in the SHIPPED code. Reads the live files at run time — it can
// never drift from what devices actually run.
//
// The bug, for the record (S569 root-cause): S331w removed the 500ms hold on
// touch pin drags, so a one-finger PAN that happened to start on a pin
// silently relocated it, and off-sheet answers were CLAMPED onto the edge and
// saved. 17 movement events, 5 inspectors, 4 projects, six landing at exactly
// 0.000/1.000. Three invariants now hold on every writer:
//   (1) intent proven by the armed hold before any drag,
//   (2) a gesture validated at its END — off-sheet commits REFUSED and
//       restored, never clamped,
//   (3) every pin write logged to window._frtPinWriteLog.
//
// This exercise proves them three ways:
//   A. WRITER CENSUS — any NEW file that writes a pin position fails the run.
//      The invariants only cover surfaces that exist; this is the tripwire
//      for a fourth surface added without its guards.
//   B. GUARD INVARIANTS — structural assertions on the live viewer source:
//      the hold gate fires before any drag can start, refusal precedes the
//      clamp on every commit path, the pinch-keep validates first, and every
//      verdict logs.
//   C. LIVE REPLAY — the mini-map's setPinFromTip is extracted verbatim and
//      driven with real gestures: inside commits, a hair past the edge clamps
//      (a fingertip AT the boundary is legitimate), beyond tolerance REFUSES
//      and leaves the pin untouched.

import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
let failures = 0;
function ok(cond, name, detail) {
  if (cond) { console.log('  \u2713 ' + name); }
  else { failures++; console.error('  \u2717 ' + name + (detail ? ' \u2014 ' + detail : '')); }
}

// ── A. WRITER CENSUS ────────────────────────────────────────────────────────
// Files allowed to assign pinX/pinY (audited S575). Null-writes (unpinning)
// and copies are movement-safe but stay listed so the census is complete.
const ALLOWED_WRITERS = new Set([
  'frt/js/viewer/viewer.js',      // placement, drag commit/restore, pinch-keep, mini-map, mouse drag
  'frt/js/viewer/markup.js',      // clear-all-pins (null writes)
  'frt/js/ui/deficiencies.js',    // unpin on delete (null write)
  'frt/js/data/model.js',         // copy-from-source + unpin on drawing delete
]);
function walk(dir, hits) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== 'node_modules' && name !== 'tests') walk(p, hits); }
    else if (name.endsWith('.js') || name.endsWith('.mjs')) {
      const src = readFileSync(p, 'utf8');
      if (/\.pin[XY]\s*=(?!=)/.test(src)) hits.push(p.slice(ROOT.length + 1).replace(/\\/g, '/'));
    }
  }
}
console.log('A. Writer census (frt/js + lib)');
const hits = [];
walk(join(ROOT, 'frt/js'), hits);
walk(join(ROOT, 'lib'), hits);
const unknown = hits.filter(f => !ALLOWED_WRITERS.has(f));
ok(unknown.length === 0, 'every pin-position writer is a known, audited surface',
  'NEW writer(s) without guards: ' + unknown.join(', ') + ' \u2014 add the hold-gate/refuse/log invariants THERE, then list the file here');
for (const f of ALLOWED_WRITERS) ok(hits.includes(f), 'audited writer still present: ' + f,
  'writer disappeared \u2014 if the surface was removed, update this census; if it moved, the guards must move with it');

// ── B. GUARD INVARIANTS (live viewer source, structural) ────────────────────
console.log('B. Guard invariants in frt/js/viewer/viewer.js');
const V = readFileSync(join(ROOT, 'frt/js/viewer/viewer.js'), 'utf8');

// B1 — the hold gate: in the pin touchmove, "moved before the hold armed"
// cancels the claim BEFORE any code path can set _pinDragging = true.
const tmStart = V.indexOf('THE S331W REGRESSION, REVERSED');
ok(tmStart !== -1, 'S569 hold-gate block exists');
const cancelIdx = V.indexOf('_lastReadyId !== _pinDragDeficId', tmStart);
const dragStartIdx = V.indexOf('_pinDragging = true', tmStart);
ok(cancelIdx !== -1 && dragStartIdx !== -1 && cancelIdx < dragStartIdx,
  'movement before the armed glow cancels the pin claim BEFORE a drag can start');

// B2 — commit validates then clamps, never clamp-then-save. In the commit
// function the REFUSED+restore branch must precede the clamped write.
const refIdx = V.indexOf("_pinViewerWriteLog('REFUSED off-sheet'");
const restoreIdx = V.indexOf("_pinDragRestore('off-sheet commit')");
const commitWriteIdx = V.indexOf("_pinViewerWriteLog('COMMIT'");
ok(refIdx !== -1 && restoreIdx !== -1, 'off-sheet commit is REFUSED and RESTORED (never clamped-and-saved)');
ok(commitWriteIdx !== -1 && refIdx < commitWriteIdx, 'refusal branch precedes the commit write');

// B3 — pinch mid-drag keeps a VALIDATED placement (S570) and logs it.
ok(V.indexOf('_pinDragLastFx >= -_tol') !== -1 && V.indexOf('pinch ended drag, placement kept') !== -1,
  'pinch mid-drag validates the fingertip position, then KEEPS the placement (S570)');
ok(V.indexOf("_pinDragRestore('pinch with fingertip off-sheet')") !== -1,
  'pinch with fingertip off-sheet restores instead of saving garbage');

// B4 — every surface logs to the one on-tablet stream.
const logCount = (V.match(/_frtPinWriteLog/g) || []).length;
ok(logCount >= 4, 'window._frtPinWriteLog wired on both viewer surfaces (found ' + logCount + ' refs)');
ok(V.indexOf("_pinWriteBreadcrumb('REFUSED'") !== -1, 'mini-map refusal logs its believed geometry (S568 breadcrumb)');

// B5 — one-finger pan (S573) can never run while a pin is armed or dragging.
const panGate = V.indexOf('_pinDragging || _lastReadyId');
ok(panGate !== -1, 'one-finger pan is gated off while a pin is armed (glow) or dragging (S573)');

// ── C. LIVE REPLAY — mini-map setPinFromTip, extracted verbatim ─────────────
console.log('C. Live replay of the mini-map validator');
const fnStart = V.indexOf('function setPinFromTip');
const fnEnd = V.indexOf('\n  }', fnStart) + 4;
ok(fnStart !== -1, 'setPinFromTip present in live source');
const fnSrc = V.slice(fnStart, fnEnd);
// Inject the closure it expects: imgRect, st, _pinWriteBreadcrumb.
const factory = new Function('imgRect', 'st', '_pinWriteBreadcrumb',
  fnSrc + '\n; return setPinFromTip;');

function runTip(tipx, tipy) {
  const st = { d: { pinX: 0.5, pinY: 0.5, id: 'test' }, canvas: null, boxW: 100, boxH: 100, scale: 1 };
  const log = [];
  const fn = factory(() => ({ x: 0, y: 0, w: 100, h: 100 }), st,
    (verdict, fx, fy) => log.push({ verdict, fx, fy }));
  const wrote = fn(tipx, tipy);
  return { wrote, st, log };
}

// C1 — a normal in-sheet placement commits the exact fraction.
let r = runTip(30, 70);
ok(r.wrote === true && Math.abs(r.st.d.pinX - 0.3) < 1e-9 && Math.abs(r.st.d.pinY - 0.7) < 1e-9,
  'in-sheet tip commits the exact position');

// C2 — a fingertip a hair past the edge (inside tolerance) clamps to the
// boundary. This is the ONE legitimate way a pin lands at exactly 0/1:
// a deliberate drag TO the edge, validated, not a clamped accident.
r = runTip(-1, 50);
ok(r.wrote === true && r.st.d.pinX === 0 && r.log.length === 0,
  'hair-past-edge (inside tolerance) clamps to the boundary \u2014 the deliberate edge drag stays possible');

// C3 — beyond tolerance: REFUSED, pin untouched, refusal logged. This is the
// clamp-and-save accident (six recorded pins at exactly 0.000) made impossible.
r = runTip(-10, 50);
ok(r.wrote === false && r.st.d.pinX === 0.5 && r.st.d.pinY === 0.5,
  'off-sheet tip is REFUSED and the pin does not move');
ok(r.log.length === 1 && r.log[0].verdict === 'REFUSED',
  'the refusal is logged with the computed position');

// C4 — stale-geometry fingerprint: a collapsed rect (the S568 hypothesis)
// cannot write at all.
{
  const st = { d: { pinX: 0.5, pinY: 0.5, id: 'test' }, canvas: null, boxW: 100, boxH: 100, scale: 1 };
  const fn = factory(() => ({ x: 0, y: 0, w: 0, h: 0 }), st, () => {});
  ok(fn(30, 70) === false && st.d.pinX === 0.5, 'a zero-size panel rect (stale geometry) cannot write a pin');
}

console.log('');
if (failures) { console.error('\u2717 ' + failures + ' guard(s) FAILED \u2014 the teleport class may be back'); process.exit(1); }
console.log('\u2713 all pin-teleport guards hold in the shipped code');
