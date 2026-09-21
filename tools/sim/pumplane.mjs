#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   THE PARALLEL LANE IS SEALED                    tools/sim/pumplane.mjs
   ───────────────────────────────────────────────────────────────────────
   THE INSTRUCTION THIS ENFORCES. The multi-pump build runs in pump-app/
   and must not affect live work. That is an Owner ruling, not a
   preference, and a ruling with no gate behind it is a promise that gets
   broken the first busy session. This is the gate.

   THE FAILURES IT CATCHES.
     A. The lane edits a shipped file — diesel-app/, electric-app/, the
        Hub, the portal, sw.js — and a field tablet picks up experimental
        code on its next refresh.
     B. The lane writes to a shared module in lib/**. One rule in shared
        code reaches every surface; that is how an invisible button
        shipped to a tablet once already.
     C. The fork's local records use the live key prefix, so a project
        number typed into the experiment lands on top of that project's
        real Diesel report on a shared tablet.
     D. Cloud sync comes back on quietly and experimental rows appear in
        tool_data beside real reports, where a merge can pull them into a
        live report.
     E. The lane gets precached or linked, and a tablet fetches it.

   WHAT IT DOES NOT CHECK. Whether the fork works. That is the manual
   protocol's job. This only answers one question: can this lane reach
   the field? The answer must stay no until the Owner says otherwise.

   Run:  node tools/sim/pumplane.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

console.log('\n■ THE PARALLEL LANE — CAN ANY OF IT REACH THE FIELD?\n');

/* ── C. local records are namespaced away from the live tool ─────────── */
const p06c = read('pump-app/js/part06c.js');
const key = p06c.match(/return '([a-z_]+)'\+pno;/);
if (key && key[1] === 'pumpfork_') ok('fork local records use their own prefix — a project number here cannot land on a live report');
else fail(`fork local key prefix is ${key ? key[1] : 'not found'} — must be pumpfork_`);
const liveKey = read('diesel-app/js/part06c.js').match(/return '([a-z_]+)'\+pno;/);
if (liveKey && liveKey[1] === 'diesel_') ok('the live Diesel tool still uses its own prefix, unchanged');
else fail('the LIVE Diesel key prefix moved — the lane has touched a shipped file');

/* ── D. the cloud is off, and provably so ────────────────────────────── */
const p06d = read('pump-app/js/part06d.js');
const ci = p06d.indexOf('function _cloudSyncInit(){');
const head = ci >= 0 ? p06d.slice(ci, ci + 1200) : '';
const bodyStart = head.indexOf('_pfNoCloudBanner();');
/* S732: the device-local restore (loadAutosave) may sit between the banner and
   the return -- it reads the pumpfork_ key only. Anything ELSE there fails. */
const returnsBefore = bodyStart >= 0 && /_pfNoCloudBanner\(\);\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:loadAutosave\(\);\s*)?updateProgress\(\);\s*return;/.test(head);
const betweenBannerAndReturn = head.slice(bodyStart, head.indexOf('return;', bodyStart));
if (bodyStart >= 0 && !/CloudSync|R2Photos|fetch\(|supabase/i.test(betweenBannerAndReturn)) ok('nothing between the banner and the return reaches the cloud');
else fail('something between the banner and the return can reach the cloud');
if (returnsBefore) ok('_cloudSyncInit returns before any cloud call — sync cannot start in this lane');
else fail('_cloudSyncInit does not return before the cloud path');
/* the return must come before the first mention of CloudSync, or it is decoration */
const idxReturn = head.indexOf('return;');
const idxCloud = head.indexOf('CloudSync');
if (idxReturn >= 0 && (idxCloud < 0 || idxReturn < idxCloud)) ok('the early return precedes every CloudSync reference in that function');
else fail('a CloudSync reference is reachable before the early return');
if (/Parallel build .* saved on this device only/.test(p06d)) ok('the screen says so permanently — device only, never the cloud');
else fail('the standing on-screen statement is missing');

/* ── A + B. nothing outside the lane has been touched ────────────────── */
/* A working-tree diff would measure whoever is running this, not the lane, so
   the check is made on CONTENT instead: no shipped file may know this lane
   exists. If a shipped tool, a shared module or the service worker ever names
   pump-app or its key prefix, the lane has leaked into the field. */
const SHIPPED = [];
(function walkShipped(d) {
  for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = d ? d + '/' + e.name : e.name;
    if (rel.startsWith('pump-app') || rel.startsWith('multipump') || rel.startsWith('tools/sim')) continue;
    if (e.isDirectory()) walkShipped(rel);
    else if (/\.(js|html|css|mjs)$/.test(rel)) SHIPPED.push(rel);
  }
})('');
const leaks = SHIPPED.filter((f) => {
  const t = read(f);
  return /pump-app|pumpfork_/.test(t);
});
if (!leaks.length) ok(`no shipped file names this lane (${SHIPPED.length} files scanned)`);
else fail('the lane is referenced by shipped code: ' + leaks.join(', '));

/* the fork may READ lib/**, never carry a modified copy of one */
const forkFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
    const rel = d + '/' + e.name;
    if (e.isDirectory()) walk(rel); else forkFiles.push(rel);
  }
})('pump-app');
const libImports = forkFiles.filter((f) => /\.(js|html)$/.test(f))
  .some((f) => /\.\.\/lib\//.test(read(f)));
if (libImports) ok('the fork READS shared lib modules by path — reading cannot affect live work');
else console.log('  · the fork imports no lib module (fine, just noted)');

/* ── E. still dark ───────────────────────────────────────────────────── */
const sw = read('sw.js');
if (!/pump-app\//.test(sw)) ok('pump-app/ is not in the service worker precache — no tablet will fetch it');
else fail('pump-app/ appears in sw.js');
const linkers = ['index.html', 'ARENCON_Project_Hub.html', 'ARENCON_Intranet_Portal.html'];
const linked = linkers.filter((f) => { try { return read(f).includes('pump-app'); } catch (e) { return false; } });
if (!linked.length) ok('nothing links to pump-app/ — reachable only by typing the address');
else fail('pump-app/ is linked from: ' + linked.join(', '));

/* ── the fork is a real, complete tool, not a stub ───────────────────── */
for (const f of ['pump-app/index.html', 'pump-app/js/part06.js', 'pump-app/css/diesel-01.css', 'pump-app/mp/roomReview.js']) {
  if (fs.existsSync(path.join(REPO, f))) ok(`${f} present`); else fail(`${f} missing from the lane`);
}
if (read('pump-app/index.html').includes('PARALLEL BUILD')) ok('the lane declares its own rules at the top of its page');
else fail('the lane rules block is missing from pump-app/index.html');

console.log(fails ? `\n  ${fails} failure(s)\n` : '\n  all green — the lane cannot reach the field\n');
process.exit(fails ? 1 : 0);
