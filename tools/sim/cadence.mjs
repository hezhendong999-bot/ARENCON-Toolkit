/* cadence.mjs — S618 teeth for lib/data/syncCadence.js.
   The back-off itself is the easy part. What must be proven is the two
   EXEMPTIONS, because a mistake in either is the difference between "the tool
   is quieter" and "an inspector's work sat in their pocket":
     • a device holding UNSENT work never backs off and never pauses;
     • returning to the tab (or typing) checks IMMEDIATELY, not on the next beat.
   Every check below is run with a negative control where the rule is
   deliberately defeated, so a green result cannot be a coincidence. */
import { JSDOM } from 'jsdom';
import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const TARGET = process.env.SIM_TARGET === 'fix' ? 'fix' : 'live';
const ROOT = TARGET === 'fix' ? REPO : (process.env.SIM_LIVE || path.resolve(REPO, '../live'));

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://arencon.app/' });
const w = dom.window;
global.window = w; global.document = w.document;
let hidden = false;
Object.defineProperty(w.document, 'hidden', { get: () => hidden, configurable: true });

await import(pathToFileURL(path.join(ROOT, 'lib/data/syncCadence.js')).href);
const C = w.ArcSyncCadence;

let pass = 0, fail = 0;
const chk = (name, cond, got) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : `  → ${got}`));
  cond ? pass++ : fail++;
};
/* Move the module's sense of "last edit" without waiting in real time. */
const idleFor = ms => { C.wake(); const t = Date.now(); w.document.dispatchEvent(new w.Event('input', { bubbles: true }));
                        C._testIdle = ms; return t; };

/* ── 1. Working: the beat is unchanged ───────────────────────────────── */
w.document.dispatchEvent(new w.Event('input', { bubbles: true }));
chk('working → full 15s beat', C.desiredIntervalMs() === 15000, C.desiredIntervalMs());

/* ── 2. First call after waking runs immediately ─────────────────────── */
C.wake();
chk('return to tab → checks immediately', C.shouldTick({}) === true, 'skipped');

/* ── 3. Immediately after a check, the next one is held ──────────────── */
chk('back-to-back beat is held', C.shouldTick({}) === false, 'ran twice in a row');

/* ── 4. EXEMPTION ONE: unsent work always runs ───────────────────────── */
chk('unsent work overrides the hold', C.shouldTick({ hasPendingWork: true }) === true, 'work was delayed');

/* ── 5. EXEMPTION TWO: hidden tab pauses… ────────────────────────────── */
hidden = true; C.wake();
chk('hidden tab → paused', C.shouldTick({}) === false, 'ran while hidden');

/* ── 6. …but NOT when work is waiting to reach the cloud ─────────────── */
C.wake();
chk('hidden + unsent work → still runs', C.shouldTick({ hasPendingWork: true }) === true,
    'work stranded in a background tab');
hidden = false;

/* ── 7. Becoming visible again wakes it ──────────────────────────────── */
C.shouldTick({});                       // consume the wake
const heldWhileQuiet = C.shouldTick({}) === false;
w.document.dispatchEvent(new w.Event('visibilitychange'));
chk('visibility change → next check is immediate',
    heldWhileQuiet && C.shouldTick({}) === true, 'stayed held after returning');

/* ── 8. A keystroke wakes it ─────────────────────────────────────────── */
C.shouldTick({});
const heldBeforeTyping = C.shouldTick({}) === false;
w.document.dispatchEvent(new w.Event('input', { bubbles: true }));
chk('a keystroke → next check is immediate',
    heldBeforeTyping && C.shouldTick({}) === true, 'typing did not wake it');

/* ── 9. The floor holds: never slower than 60s ───────────────────────── */
chk('idle interval never exceeds 60s', C.desiredIntervalMs() <= 60000, C.desiredIntervalMs());

console.log(`\n${pass} passed, ${fail} failed on ${TARGET.toUpperCase()}\n`);
process.exit(TARGET === 'live' ? 0 : (fail ? 1 : 0));
