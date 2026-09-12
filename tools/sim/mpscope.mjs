#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   MULTI-PUMP SCOPE COVERAGE                     tools/sim/mpscope.mjs
   ───────────────────────────────────────────────────────────────────────
   THE FAILURE THIS EXISTS TO CATCH. The multi-pump report is being built
   from the two shipped tools. If a saved key or a project field is left
   out of the scope model, that piece of the report simply stops existing
   in the new tool — no error, no empty box, just a value an inspector
   entered last year that the new report never asks for and never shows.
   Reading the two lists side by side and ticking them off is exactly the
   check a human does badly.

   So: read the LIVE manifests of both shipped tools, read the scope model,
   and assert every key is accounted for in exactly one place.

   WHAT IT ASSERTS
     1. Every saved key in diesel-app's manifest has a scope.
     2. Every saved key in electric-app's manifest has a scope.
     3. Electric-only keys are marked only:'ele'; diesel-only marked 'dsl'.
     4. Every id in the live PROJ_FIELD_IDS lands in PROJ_ROOM or
        PROJ_PUMP — exactly one, never both, never neither.
     5. No key is declared twice in the scope model.
     6. Keys the scope model invents (groups, combined run, roster) are
        flagged isNew, so "not in the live tools" is a declaration rather
        than a typo nobody noticed.
     7. Every entry carries a reason. A scope with no reason is a guess.

   Run:  node tools/sim/mpscope.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok   = (m) => console.log('  ✓ ' + m);

/* read the live manifests as text — they are IIFEs against a browser global,
   so parsing beats importing, and parsing is what keeps this honest: it sees
   what is actually declared, not what a stub lets through. */
function liveKeys(tool) {
  const src = fs.readFileSync(path.join(REPO, tool, 'js/reportManifest.js'), 'utf8');
  return [...src.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1]);
}
function liveProjIds(tool) {
  const src = fs.readFileSync(path.join(REPO, tool, 'js/reportManifest.js'), 'utf8');
  const m = src.match(/var PROJ_FIELD_IDS = \[([\s\S]*?)\];/);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/* The model is a browser IIFE that publishes window.MPScope — the same shape
   as every other shared file in this repo. Run it in a sandbox with a fake
   global rather than importing it, so the probe reads the REAL file the tool
   will load, not a module-shaped copy of it. */
const sandbox = { module: undefined };
new Function('window', fs.readFileSync(path.join(REPO, 'multipump/js/sectionScope.js'), 'utf8')
  .replace('typeof window !== \'undefined\' ? window : globalThis', 'window'))(sandbox);
const scope = sandbox.MPScope;
if (!scope) { console.log('  ✗ sectionScope.js did not publish MPScope'); process.exit(1); }
const { KEY_SCOPE, PROJ_ROOM, PROJ_PUMP } = scope;

const dsl = liveKeys('diesel-app');
const ele = liveKeys('electric-app');
console.log(`\nlive manifests: diesel ${dsl.length} keys, electric ${ele.length} keys`);
console.log(`scope model:    ${KEY_SCOPE.length} entries\n`);

/* 5 — no duplicates */
const seen = {};
let dup = 0;
KEY_SCOPE.forEach((k) => { if (seen[k.key]) { fail('declared twice: ' + k.key); dup++; } seen[k.key] = k; });
if (!dup) ok('no key declared twice');

/* 1 & 2 — coverage both ways */
const missing = [...new Set([...dsl, ...ele])].filter((k) => !seen[k]);
if (missing.length) fail('live keys with no scope: ' + missing.join(', '));
else ok(`every live key has a scope (${new Set([...dsl, ...ele]).size} distinct across both tools)`);

/* 6 — anything the model adds must say so */
const live = new Set([...dsl, ...ele]);
const invented = KEY_SCOPE.filter((k) => !live.has(k.key));
const undeclared = invented.filter((k) => !k.isNew);
if (undeclared.length) fail('in the model but not in either live tool, and not marked isNew: ' + undeclared.map((k) => k.key).join(', '));
else ok(`${invented.length} new key(s) declared isNew: ` + invented.map((k) => k.key).join(', '));

/* 3 — drive-type exclusivity matches reality */
const dslOnly = dsl.filter((k) => !ele.includes(k));
const eleOnly = ele.filter((k) => !dsl.includes(k));
let typeBad = 0;
eleOnly.forEach((k) => { if (seen[k] && seen[k].only !== 'ele') { fail(`${k} exists only in the Electric tool but is not marked only:'ele'`); typeBad++; } });
dslOnly.forEach((k) => { if (seen[k] && seen[k].only !== 'dsl') { fail(`${k} exists only in the Diesel tool but is not marked only:'dsl'`); typeBad++; } });
if (!typeBad) ok(`drive-type exclusivity correct (electric-only: ${eleOnly.join(', ') || 'none'}; diesel-only: ${dslOnly.join(', ') || 'none'})`);

/* 4 — the proj split is total and exclusive */
[['diesel-app', 'dsl'], ['electric-app', 'ele']].forEach(([tool]) => {
  const ids = liveProjIds(tool);
  if (!ids) { fail(tool + ': could not read PROJ_FIELD_IDS'); return; }
  const inRoom = new Set(PROJ_ROOM), inPump = new Set(PROJ_PUMP);
  const nowhere = ids.filter((i) => !inRoom.has(i) && !inPump.has(i));
  const both    = ids.filter((i) => inRoom.has(i) && inPump.has(i));
  if (nowhere.length) fail(`${tool}: ${nowhere.length} project field(s) in neither scope — ` + nowhere.join(', '));
  if (both.length)    fail(`${tool}: field(s) in BOTH scopes — ` + both.join(', '));
  if (!nowhere.length && !both.length) ok(`${tool}: all ${ids.length} project fields land in exactly one scope (${ids.filter((i) => inRoom.has(i)).length} room, ${ids.filter((i) => inPump.has(i)).length} pump)`);
});

/* invented project fields would be just as invisible */
const allLiveIds = new Set([...(liveProjIds('diesel-app') || []), ...(liveProjIds('electric-app') || [])]);
const ghosts = [...PROJ_ROOM, ...PROJ_PUMP].filter((i) => !allLiveIds.has(i));
if (ghosts.length) fail('project field(s) in the scope model that exist in neither live tool: ' + ghosts.join(', '));
else ok('no invented project fields');

/* 7 — every entry reasoned */
const unreasoned = KEY_SCOPE.filter((k) => !k.why || k.why.length < 12);
if (unreasoned.length) fail('entries with no reason: ' + unreasoned.map((k) => k.key).join(', '));
else ok('every entry carries its reason');

/* a plain summary, because the split is the thing being reviewed */
const by = { room: [], pump: [], group: [], split: [] };
KEY_SCOPE.forEach((k) => by[k.scope] && by[k.scope].push(k.key));
console.log('\n  room  (' + by.room.length + '): ' + by.room.join(', '));
console.log('  pump  (' + by.pump.length + '): ' + by.pump.join(', '));
console.log('  group (' + by.group.length + '): ' + by.group.join(', '));
console.log('  split (' + by.split.length + '): ' + by.split.join(', '));

console.log('\n' + (fails ? 'RED — ' + fails + ' failure(s)' : 'GREEN — every field in both shipped tools is accounted for in the new model'));
process.exit(fails ? 1 : 0);
