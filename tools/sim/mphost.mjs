#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   THE SHELL AND ITS FRAMES                        tools/sim/mphost.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. A machine's testing runs in the
   shipped Diesel or Electric tool, embedded in the multi-pump shell. In
   that position the tool must keep NO record of its own:

     A. saveState writes the machine's screen into the single-pump local
        drawer under 'diesel_<project>' — on a shared tablet that is
        another inspector's report, silently overwritten.
     B. loadAutosave pulls a single-pump report INTO the frame at boot,
        and the frame now shows another job's readings as this machine's.
     C. _cloudSyncInit starts the autosave loop and a cloud row is born
        for a report that does not exist.
     D. the leave prompt fires from inside a frame when the shell moves.
     E. the live-update engine reloads the frame and the machine's
        unsaved test is gone.

   Every one of those is a one-line guard in the live tools, and a guard
   that is checked by a probe once is a guard that stays.

   ASSERTED:
     1. Both live tools define _mpEmbedded exactly once, in part06c.
     2. In both tools the guard is the FIRST statement of saveState and
        loadAutosave, and present in _cloudSyncInit, the standalone
        beforeunload, and the live-update arm in index.html.
     3. The guard itself: false when not embedded, false when the parent
        has no MPShell, false when the parent is cross-origin (throws),
        true only when a same-origin parent carries MPShell. Run from the
        real source of both tools, not retyped here.
     4. The shell sets window.MPShell, points its frames at the live
        tools' own index.html (files that exist), and loads none of the
        tools' code itself.
     5. The shell keeps nothing: no localStorage, IndexedDB, CloudSync or
        fetch writes anywhere in shell.js.
     6. multipump/ is still absent from the service worker's precache.
     7. RED ARM: with the guard line removed from saveState, check 2
        fails. The probe has been shown to see the defect.

   Run:  node tools/sim/mphost.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const TOOLS = ['diesel-app', 'electric-app'];

/* the guard, as the tool spells it */
const GUARD = /function _mpEmbedded\(\)\{\s*try \{ return window\.parent !== window && !!window\.parent\.MPShell; \} catch\(e\)\{ return false; \}\s*\}/;

function firstStatementIsGuard(src, fnHead) {
  const i = src.indexOf(fnHead);
  if (i < 0) return { found: false };
  const after = src.slice(i + fnHead.length, i + fnHead.length + 200);
  return { found: true, guarded: /^\s*if\s*\(\s*_mpEmbedded\(\)\s*\)\s*return;/.test(after) };
}

function checkTool(t, srcs) {
  const c = srcs.part06c, d = srcs.part06d, html = srcs.index;
  const defs = (c.match(/function _mpEmbedded\(\)/g) || []).length;
  if (defs === 1 && GUARD.test(c)) ok(`${t}: _mpEmbedded defined once, in part06c, as specified`);
  else fail(`${t}: _mpEmbedded defined ${defs} time(s) in part06c${GUARD.test(c) ? '' : ' — body differs from the specified guard'}`);
  if ((d.match(/function _mpEmbedded\(\)/g) || []).length) fail(`${t}: a second _mpEmbedded in part06d`);

  const s = firstStatementIsGuard(c, 'function saveState(){');
  if (s.found && s.guarded) ok(`${t}: saveState refuses first`); else fail(`${t}: saveState is not guarded first (${s.found ? 'guard missing' : 'function not found'})`);
  const l = firstStatementIsGuard(d, 'function loadAutosave() {');
  if (l.found && l.guarded) ok(`${t}: loadAutosave refuses first`); else fail(`${t}: loadAutosave is not guarded first`);

  const ci = d.indexOf('function _cloudSyncInit(){');
  const cBody = ci >= 0 ? d.slice(ci, ci + 600) : '';
  if (/if\(_mpEmbedded\(\)\)\{ updateProgress\(\); return; \}/.test(cBody)) ok(`${t}: _cloudSyncInit stops before any cloud or local load`);
  else fail(`${t}: _cloudSyncInit has no embed guard in its opening lines`);

  const bi = d.indexOf("window.addEventListener('beforeunload', function(e) {");
  const bBody = bi >= 0 ? d.slice(bi, bi + 300) : '';
  if (/if\(_mpEmbedded\(\)\) return;/.test(bBody)) ok(`${t}: standalone leave prompt stands down in a frame`);
  else fail(`${t}: standalone beforeunload has no embed guard`);

  const li = html.indexOf('initLiveUpdate({');
  const before = li >= 0 ? html.slice(Math.max(0, li - 400), li) : '';
  if (/window\._mpEmbedded\(\)\) return;/.test(before)) ok(`${t}: live-update arm stands down in a frame`);
  else fail(`${t}: live-update arm has no embed guard`);
}

/* the guard, executed from the real source */
function guardFrom(src) {
  const m = src.match(GUARD);
  if (!m) return null;
  return (win) => new Function('window', m[0] + '\nreturn _mpEmbedded();')(win);
}
function checkGuardBehaviour(t, src) {
  const g = guardFrom(src);
  if (!g) { fail(`${t}: could not extract the guard to run it`); return; }
  const self = {}; self.parent = self;
  const alone = g(self);
  const bare = g({ parent: {} });
  const shell = g({ parent: { MPShell: { version: 'x' } } });
  const foreign = g({ get parent() { throw new Error('cross-origin'); } });
  if (alone === false && bare === false && shell === true && foreign === false) ok(`${t}: guard is true only under a same-origin parent carrying MPShell`);
  else fail(`${t}: guard behaviour wrong — alone ${alone}, bare parent ${bare}, shell ${shell}, cross-origin ${foreign}`);
}

console.log('\n■ THE SHELL AND ITS FRAMES — DOES A HOSTED TOOL KEEP NOTHING OF ITS OWN?\n');

const SRC = {};
for (const t of TOOLS) {
  SRC[t] = { part06c: read(`${t}/js/part06c.js`), part06d: read(`${t}/js/part06d.js`), index: read(`${t}/index.html`) };
  checkTool(t, SRC[t]);
  checkGuardBehaviour(t, SRC[t].part06c);
}

/* the shell */
const shell = read('multipump/js/shell.js');
const page = read('multipump/index.html');
if (/root\.MPShell = API;/.test(shell)) ok('shell publishes window.MPShell — the flag the frames look for');
else fail('shell does not publish MPShell');

const tf = shell.match(/var TOOL_FOR = \{([^}]*)\}/);
if (!tf) fail('shell has no TOOL_FOR map');
else {
  const paths = [...tf[1].matchAll(/'(\.\.\/[^']+)'/g)].map((m) => m[1]);
  for (const p of paths) {
    const abs = path.join(REPO, 'multipump', p);
    if (fs.existsSync(abs) && /\/(diesel|electric)-app\/index\.html$/.test(p)) ok(`frame target ${p} is a live tool that exists`);
    else fail(`frame target ${p} is not a live tool on disk`);
  }
  if (paths.length !== 2) fail(`expected two frame targets, found ${paths.length}`);
}

const shellScripts = [...page.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
const foreignScripts = shellScripts.filter((s) => !/^js\/|auth-gate\.js$/.test(s));
if (!foreignScripts.length) ok('shell page loads only its own scripts and the sign-in gate — none of the tools\u2019 code');
else fail('shell page loads code that is not its own: ' + foreignScripts.join(', '));

const persists = ['localStorage', 'indexedDB', 'CloudSync', 'fetch(', 'ADB.', 'R2Photos', 'saveState'];
const hits = persists.filter((k) => shell.includes(k));
if (!hits.length) ok('shell.js touches no storage, sync or fetch — nothing saves');
else fail('shell.js reaches storage or sync: ' + hits.join(', '));

const sw = read('sw.js');
if (!/multipump\//.test(sw)) ok('multipump/ is not in the service worker precache — still dark');
else fail('multipump/ appears in sw.js — a tablet would fetch it');

/* red arm */
const stripped = SRC['diesel-app'].part06c.replace(/function saveState\(\)\{\s*if \(_mpEmbedded\(\)\) return;[^\n]*\n/, 'function saveState(){\n');
const red = firstStatementIsGuard(stripped, 'function saveState(){');
if (red.found && !red.guarded) ok('red arm: with the guard line removed, the saveState check fails as it should');
else fail('red arm: the probe did not see a removed guard');

console.log(fails ? `\n  ${fails} failure(s)\n` : '\n  all green\n');
process.exit(fails ? 1 : 0);
