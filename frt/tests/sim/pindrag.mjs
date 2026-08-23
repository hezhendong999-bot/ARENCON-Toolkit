/* ══════════════════════════════════════════════════════════════════════════
   PROBE — PIN DRAG LAW (U1)                       frt/tests/sim/pindrag.mjs
   ──────────────────────────────────────────────────────────────────────────
   RUN:  node frt/tests/sim/pindrag.mjs

   WHAT IT PROVES, and — as important — what it does not.

   Checks 1-6 drive the REAL law module (frt/js/viewer/pinDrag.js). It is pure
   and has no DOM, so these run the shipped code, not a model of it.

   Checks 7-10 read the SHIPPED TEXT of frt/js/viewer/viewer.js. The three
   gestures cannot be executed headlessly — they need touch events, a canvas
   and a GL pin renderer — so the wiring is asserted against the bytes that
   actually deploy. A static arm cannot prove a gesture FEELS right; only a
   tablet can. It can prove the host no longer carries its own copy of the
   rules, which is the whole claim U1 makes.

   RED BASELINE, measured on live HEAD 6f23f33c before the change:
     1-6  FAIL — frt/js/viewer/pinDrag.js does not exist; the law is copied
                 into each surface.
     7    FAIL — the host carries its own tolerance constant, three times.
     8    FAIL — the host pushes pin records into the log directly, twice.
     9    FAIL — _peCancelGesture disarms the mini-map WITHOUT restoring: an
                 interrupted drag keeps the position the finger was over and
                 the next automatic save makes it permanent. This is the
                 defect U1 exists to close.
     10   FAIL — the mini-map never captures a true position at all.

   A CRASH IS NOT A RED RUN. The engine import is guarded so a missing module
   reports as ten legible verdicts rather than a stack trace, because a stack
   trace cannot be told apart from a typo in a path.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

globalThis.window = globalThis.window || {};

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(HERE, '../../js/viewer/viewer.js');

let pass = 0, fail = 0;
function check(n, name, ok, detail) {
  if (ok) { pass++; console.log(`  \u2714 ${n}. ${name}`); }
  else { fail++; console.log(`  \u2718 ${n}. ${name}${detail ? '\n       ' + detail : ''}`); }
}

let PinDrag = null, ENGINE_ERR = '';
try {
  ({ PinDrag } = await import(resolve(HERE, '../../js/viewer/pinDrag.js')));
} catch (e) {
  ENGINE_ERR = 'frt/js/viewer/pinDrag.js is absent \u2014 the law is still copied per surface';
}
function behaviour(n, name, fn) {
  if (ENGINE_ERR) { check(n, name, false, ENGINE_ERR); return; }
  try { fn(); } catch (e) { check(n, name, false, String((e && e.message) || e)); }
}

console.log('\nPIN DRAG LAW \u2014 U1\n');

/* ── 1. A position inside the sheet is written as given. ─────────────────── */
behaviour(1, 'a valid position commits exactly', () => {
  const pin = { id: 'd1', pinX: 0.2, pinY: 0.3 };
  const ok = PinDrag.commit('t', pin, 0.61234, 0.44321);
  check(1, 'a valid position commits exactly',
    ok && pin.pinX === 0.61234 && pin.pinY === 0.44321,
    `got ${pin.pinX}, ${pin.pinY}`);
});

/* ── 2. A hair past the edge clamps deliberately; that is fingertip room. ── */
behaviour(2, 'inside tolerance clamps to the boundary', () => {
  const pin = { id: 'd2', pinX: 0.5, pinY: 0.5 };
  const ok = PinDrag.commit('t', pin, 1.01, -0.015);
  check(2, 'inside tolerance clamps to the boundary',
    ok && pin.pinX === 1 && pin.pinY === 0, `got ${pin.pinX}, ${pin.pinY}`);
});

/* ── 3. Beyond tolerance is REFUSED and the true position comes back.
       Clamping instead of refusing is what produced every corrupted pin
       sitting at exactly 0.000 / 1.000 in the history. ─────────────────── */
behaviour(3, 'beyond tolerance refuses AND restores, never clamps', () => {
  const pin = { id: 'd3', pinX: 0.42, pinY: 0.77 };
  PinDrag.capture('t', pin);
  const ok = PinDrag.commit('t', pin, 1.4, 0.5);
  check(3, 'beyond tolerance refuses AND restores, never clamps',
    ok === false && pin.pinX === 0.42 && pin.pinY === 0.77,
    `got ok=${ok} ${pin.pinX}, ${pin.pinY}`);
});

/* ── 4. THE DEFECT, in law form: an interrupted drag restores. ──────────── */
behaviour(4, 'an interrupted drag puts the pin back where it was', () => {
  const pin = { id: 'd4', pinX: 0.10, pinY: 0.10 };
  PinDrag.capture('map', pin);
  PinDrag.preview('map', pin, 0.80, 0.90);
  PinDrag.preview('map', pin, 0.85, 0.95);
  const restored = PinDrag.restore('map', 'app backgrounded');
  check(4, 'an interrupted drag puts the pin back where it was',
    restored && pin.pinX === 0.10 && pin.pinY === 0.10,
    `got ${pin.pinX}, ${pin.pinY}`);
});

/* ── 5. A deliberate release is KEPT, and a later interruption cannot undo
       it. Negative control for check 4 — a restore that fires on a real
       placement is as damaging as one that never fires. ─────────────────── */
behaviour(5, 'a released placement survives a later interruption', () => {
  const pin = { id: 'd5', pinX: 0.10, pinY: 0.10 };
  PinDrag.capture('map', pin);
  PinDrag.preview('map', pin, 0.66, 0.55);
  PinDrag.commitPreviewed('map', pin);
  const restored = PinDrag.restore('map', 'unrelated interruption');
  check(5, 'a released placement survives a later interruption',
    restored === false && pin.pinX === 0.66 && pin.pinY === 0.55,
    `got restored=${restored} ${pin.pinX}, ${pin.pinY}`);
});

/* ── 6. One drag records ONE decision, in the shape the on-tablet panel
       reads. Sixty logged frames would bury the evidence it exists for. ─── */
behaviour(6, 'one drag = one record, in the shape the tablet panel reads', () => {
  window._frtPinWriteLog = [];
  const pin = { id: 'd6', pinX: 0.1, pinY: 0.1 };
  PinDrag.capture('map', pin);
  for (let i = 0; i < 40; i++) PinDrag.preview('map', pin, 0.2 + i / 200, 0.3);
  PinDrag.commitPreviewed('map', pin);
  const log = window._frtPinWriteLog;
  const shaped = log.every(e => e.computed && typeof e.computed.x === 'number' && e.surface && e.at);
  check(6, 'one drag = one record, in the shape the tablet panel reads',
    log.length === 1 && log[0].verdict === 'COMMIT' && shaped,
    `entries=${log.length} verdicts=${log.map(e => e.verdict).join('|')}`);
});

/* ── 7-10. THE SHIPPED HOST. ────────────────────────────────────────────── */
const host = readFileSync(VIEWER, 'utf8');

check(7, 'the host carries no tolerance constant of its own',
  !/0\.02/.test(host),
  'a second copy of the rule is a rule that will drift');

check(8, 'the host writes no pin records of its own',
  !/_frtPinWriteLog\s*\.\s*push/.test(host),
  'one log stream, or the evidence disagrees with itself');

{
  const i = host.indexOf('function _peCancelGesture');
  const body = i < 0 ? '' : host.slice(i, i + 1400);
  check(9, 'an interrupted mini-map drag restores the pin',
    /PinDrag\.restore\(/.test(body),
    'disarm without restore = the interrupted position is kept, and the next autosave makes it permanent');
}

check(10, 'the mini-map captures a true position when the drag arms',
  /PinDrag\.capture\('pin-editor-map'/.test(host),
  'nothing to restore means invariant 2 does not hold on this surface');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
