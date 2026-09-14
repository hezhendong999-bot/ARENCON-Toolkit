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
const foreignScripts = shellScripts.filter((s) => !/^js\/|^\.\.\/lib\/|auth-gate\.js$/.test(s));
if (!foreignScripts.length) ok('shell page loads only its own scripts, shared lib engines and the sign-in gate — none of the tools\u2019 code');
else fail('shell page loads code that is not its own: ' + foreignScripts.join(', '));

/* deficiencies: the shared engine draws, the shell only hosts */
const eng = read('lib/ui/deficiencies.js');
const host = read('multipump/js/deficHost.js');
if (/function _deficOwnerChip\(d, scope\)\{\s*return \(typeof _deficOwnerHook==='function'\)/.test(eng)) ok('engine asks the host for the owner chip and draws nothing without a host hook');
else fail('engine owner-chip hook is not scoped by host presence');
if ((eng.match(/\+_deficOwnerChip\(d, *'/g) || []).length === 2) ok('owner chip drawn at both deficiency builders (contractor and general)');
else fail('owner chip is not at exactly the two builders');
const hookInTools = ['diesel-app', 'electric-app', 'frt'].filter((t) => { try { return read(`${t}/index.html`).includes('_deficOwnerHook'); } catch (e) { return false; } });
const hookInParts = fs.readdirSync(path.join(REPO, 'diesel-app/js')).some((f) => read('diesel-app/js/' + f).includes('_deficOwnerHook'))
  || fs.readdirSync(path.join(REPO, 'electric-app/js')).some((f) => read('electric-app/js/' + f).includes('_deficOwnerHook'));
if (!hookInTools.length && !hookInParts) ok('no shipped tool defines _deficOwnerHook — their deficiency rows are unchanged');
else fail('a shipped tool defines _deficOwnerHook: ' + hookInTools.join(', '));
if (shellScripts.includes('../lib/ui/deficiencies.js') && shellScripts.indexOf('js/deficHost.js') < shellScripts.indexOf('../lib/ui/deficiencies.js')) ok('shell loads the shared deficiencies engine, host globals first');
else fail('shell does not load lib/ui/deficiencies.js after deficHost.js');
const drawn = ['Describe Deficiency', 'defic-group-', 'renderDeficGroup(name) {', 'buildDeficItem'].filter((k) => host.includes(k) && !/mpSetDeficOwner|renderDeficGroup\(ref/.test(k));
if (!host.includes('Describe Deficiency') && !host.includes('function buildDeficItem') && !host.includes('function renderDeficGroup')) ok('deficHost draws no deficiency markup — the engine owns the list');
else fail('deficHost redraws deficiency markup: ' + drawn.join(', '));
for (const g of ['const contractors', 'let contractorTrades', 'var clState', 'function escHtml', 'function debounceAutosave() {}', 'function showToast', 'function _phSrc', 'function _isPhotoDeleted', 'function _deficOwnerHook', 'function mpDeficLists']) {
  if (host.includes(g)) ok(`deficHost provides ${g.replace(/^(const|let|var|function) /, '')}`); else fail(`deficHost missing ${g}`);
}
if (!/localStorage|indexedDB|CloudSync|R2Photos|_r2Enqueue/.test(host)) ok('deficHost touches no storage — photos say not-yet, nothing saves');
else fail('deficHost reaches storage');

/* S730c — three more host hooks in the engine, all scoped by presence */
if (/if\(typeof _checklistFindingsHost==='function'\) return _checklistFindingsHost\(\)\|\|\[\];/.test(eng)) ok('engine lets a host supply the findings rows; reads clState otherwise');
else fail('findings host hook missing or unscoped');
if (/if\(typeof _jumpToChecklistItemHost==='function' && _jumpToChecklistItemHost\(id\)\) return;/.test(eng)) ok('engine lets a host take the jump; walks its own panels otherwise');
else fail('jump host hook missing or unscoped');
const removeClicks = (eng.match(/onclick="_deficConfirmRemove\(/g) || []).length;
const bareRemoves = (eng.match(/onclick="remove(General)?DeficItem\(/g) || []).length;
if (removeClicks === 2 && bareRemoves === 0) ok('both Remove buttons confirm first — no bare removal left');
else fail(`Remove buttons: ${removeClicks} confirming, ${bareRemoves} bare`);
if (/if\(typeof _aConfirm==='function'\)\{ _aConfirm\(msg, go, 'Remove'\); return; \}/.test(eng) && /removal blocked/.test(eng)) ok('removal confirms through the host\u2019s _aConfirm and is BLOCKED without one');
else fail('removal confirm is not fail-safe');
for (const t of TOOLS) {
  const p03 = read(`${t}/js/part03.js`);
  if (/function _aConfirm\(msg,onOk,okText\)/.test(p03)) ok(`${t}: provides _aConfirm — its Remove now confirms like every other destructive action`);
  else fail(`${t}: has no _aConfirm; its Remove button would be blocked`);
  const anyHook = fs.readdirSync(path.join(REPO, `${t}/js`)).some((f) => /_checklistFindingsHost|_jumpToChecklistItemHost/.test(read(`${t}/js/` + f)));
  if (!anyHook) ok(`${t}: defines neither findings nor jump host hook — its roll-up is unchanged`); else fail(`${t}: defines a findings/jump host hook`);
}
for (const g of ['function _aConfirm', 'function _checklistFindingsHost', 'function _jumpToChecklistItemHost']) {
  if (host.includes(g)) ok(`deficHost provides ${g.replace('function ', '')}`); else fail(`deficHost missing ${g}`);
}
if (/import Dlg from '\/lib\/ui\/dialogEngine\.js';\s*window\.ArenconDlg = Dlg;/.test(page)) ok('shell loads the sealed dialog engine the confirm needs');
else fail('shell does not load the dialog engine');
/* S730d — the shell wears the tools' chrome and draws nothing itself */
const clh = read('multipump/js/clHost.js');
if (/ArcChecklist\.create\(/.test(clh)) ok('room review runs the shipped checklist engine');
else fail('clHost does not create the shipped checklist engine');
if (!/cl-item|cl-seg|tog-yes|item-num/.test(shell) && !/cl-item|cl-seg|tog-yes/.test(clh)) ok('neither shell nor clHost draws a checklist row — the engine owns it');
else fail('a checklist row is being drawn outside lib/ui/checklist.js');
for (const cls of ['app-header', 'section-nav', 'nav-tab', 'main-wrap', 'panel', 'card-header', 'card-body']) {
  if (page.includes(cls) || shell.includes(cls)) ok(`shell uses the shipped ${cls}`); else fail(`shell does not use the shipped ${cls}`);
}
if (/root\.fetch\(TOOL_FOR\.dsl[\s\S]{0,900}?proj-grid/.test(shell)) ok('project fields are the Diesel tool\u2019s own grid, read from the live file');
else fail('project fields are not read from the Diesel tool');
if (!/mp-field|mp-tab\b|mp-pump\b/.test(shell) && !/mp-field|class="mp-tab|class="mp-pump/.test(page)) ok('the home-made tab strip, pump buttons and field grid are gone');
else fail('a home-made chrome component survives in the shell');
const scope = read('multipump/js/sectionScope.js');
if (/key:'batData',\s*scope:'pump',\s*why:/.test(scope) && !/key:'batData'[^\n]*only:/.test(scope)) ok('batData is scoped to the pump for BOTH drive types — Electric carries the key too');
else fail('batData still marked diesel-only');

const persists = ['localStorage', 'indexedDB', 'CloudSync', 'ADB.', 'R2Photos', 'saveState'];
/* fetch is allowed for ONE thing: reading the Diesel tool\u2019s own panel markup */
const fetches = (shell.match(/root\.fetch\(TOOL_FOR\.dsl/g) || []).length;
const otherFetch = (shell.match(/fetch\(/g) || []).length - fetches;
if (fetches === 2 && otherFetch === 0) ok('shell reads the Diesel tool twice — its deficiencies panel and its project grid — and fetches nothing else');
else fail(`shell fetches: ${fetches} of the Diesel tool, ${otherFetch} elsewhere`);
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
