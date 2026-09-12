#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   THE MULTI-PUMP ESTATE, IN ONE RUN              tools/sim/mpall.mjs
   ───────────────────────────────────────────────────────────────────────
   Eight probes now hold the multi-pump work, and a probe that is not run
   is a probe that does not exist. This runs all of them and fails if any
   one fails — so "did I run them all" stops being something a session
   has to remember.

   It also fails if it finds a multi-pump probe on disk that is not in the
   list below. A probe added later and never wired in here would look
   like coverage while contributing none.

   Run:  node tools/sim/mpall.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* in the order the work was built, which is the order it reads */
const PROBES = [
  ['mpscope.mjs',     'every field in both tools has a scope'],
  ['mpshape.mjs',     'the report shape and the project block split'],
  ['mpcontext.mjs',   'the pump switch: nothing crosses between machines'],
  ['mpsurface.mjs',   'the Diesel surfaces: a cleared table stays this pump\u2019s'],
  ['mpphoto.mjs',     'placards: a scan reads this machine or refuses'],
  ['mpchecklist.mjs', 'the checklist: each machine answers for itself'],
  ['mpdefic.mjs',     'deficiencies: every work order names its machine'],
  ['mppair.mjs',      'two pumps, one room: a whole visit']
];

const onDisk = fs.readdirSync(HERE).filter((f) => /^mp[a-z]+\.mjs$/.test(f) && f !== 'mpall.mjs');
const listed = PROBES.map((p) => p[0]);
const unlisted = onDisk.filter((f) => !listed.includes(f));

let failed = [];
console.log('\n═══ MULTI-PUMP PROBE ESTATE ═══\n');
for (const [file, what] of PROBES) {
  const full = path.join(HERE, file);
  if (!fs.existsSync(full)) { console.log(`  ✗ ${file} — listed but not on disk`); failed.push(file); continue; }
  try {
    execFileSync(process.execPath, [full], { stdio: 'pipe' });
    console.log(`  ✓ ${file.padEnd(18)} ${what}`);
  } catch (e) {
    console.log(`  ✗ ${file.padEnd(18)} ${what}`);
    const out = String((e.stdout || '') + (e.stderr || ''));
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => console.log('      ' + l.trim()));
    failed.push(file);
  }
}

if (unlisted.length) {
  console.log('');
  unlisted.forEach((f) => console.log(`  ✗ ${f} is a multi-pump probe that this runner does not run — add it`));
  failed = failed.concat(unlisted);
}

console.log('');
if (failed.length) { console.log(`═══ ${failed.length} FAILING: ${failed.join(', ')} ═══\n`); process.exit(1); }
console.log(`═══ ALL ${PROBES.length} GREEN ═══\n`);
