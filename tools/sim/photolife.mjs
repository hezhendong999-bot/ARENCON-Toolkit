/* photolife.mjs — THE PHOTO DELETION MODEL MUST NOT CHANGE (Lane C, S681)
 *
 * UNIFICATION PHASE 3, first cut. The rules deciding whether a photograph
 * still exists have moved out of diesel-app/js/part07.js into
 * lib/data/photoLifecycle.js so that Electric inherits them instead of
 * receiving a copy.
 *
 * WHY THE STANDARD IS "IDENTICAL", NOT "CORRECT". Being wrong here does not
 * produce an error. It produces a report, signed and issued, with a
 * photograph missing from it — evidence of a condition in a pump room that no
 * longer exists anywhere. There is no expected value to assert against: the
 * live code IS the specification, including the parts that look odd. So both
 * implementations are run over the same wide sweep and required to agree on
 * every field of every result.
 *
 * WHAT IS BEING PROTECTED, specifically:
 *   • the phantom-delete guard (7155.51) — a delete nobody asked for cannot
 *     remove a photo younger than ten seconds, and the refusal is visible;
 *   • delState as the authority, with the legacy booleans still written as a
 *     mirror for older cached builds and still read as a fallback for records
 *     written before S354;
 *   • a restore recorded as a decision, because between two devices an absent
 *     flag and a deliberate restore are indistinguishable;
 *   • capture time read from the photo's own id, which is what lets the guard
 *     work on a device that never saw the capture.
 *
 * Run: node tools/sim/photolife.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

/* ── the extracted module ───────────────────────────────────────────────── */
const root = {};
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/data/photoLifecycle.js'), 'utf8'))(root, undefined);
const M = root.PhotoLifecycle;
if (!M) { console.error('lib/data/photoLifecycle.js did not publish PhotoLifecycle'); process.exit(1); }

/* ── lift the live host functions out of source text ────────────────────── */
function liftFunction(src, name) {
  const start = src.indexOf('\nfunction ' + name + '(');
  if (start < 0) return null;
  let i = src.indexOf('{', start), depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '/' && p === '*') inBlock = false; continue; }
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === '/' && src[j + 1] === '/') { inLine = true; continue; }
    if (c === '/' && src[j + 1] === '*') { inBlock = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start + 1, j + 1); }
  }
  return null;
}

/* S681 — WHICH HOST IS BEING COMPARED.
   Before the conversion this probe was a differential: the live host's own
   implementation against the extracted module. After the conversion the host
   DELEGATES, so comparing the two would be two ways of saying the same thing —
   the trap Phase 1 hit. So the pre-conversion source is kept as a fixture, cut
   straight from the commit before the extraction, and THAT is what the module
   is held to. The converted host is compared too, which keeps the delegation
   honest: if a future edit quietly re-implements any of this in part07.js, the
   two host readings diverge and this goes red.

   THE FIXTURE IS A HISTORICAL RECORD. Never re-cut it to clear a failure. */
const PRE = path.join(HERE, 'fixtures/part07_preconversion.txt');
const p07 = fs.existsSync(PRE)
  ? fs.readFileSync(PRE, 'utf8')
  : fs.readFileSync(path.join(REPO, 'diesel-app/js/part07.js'), 'utf8');
const HOST_FNS = ['_isPhotoDeleted', '_photoCreatedTs', '_markPhotoDeleted', '_markPhotoLive',
                  '_normalizePhotoDel', '_normalizeAllPhotoDel', '_pgTrashDaysLeft'];
const lifted = {};
for (const n of HOST_FNS) {
  const s = liftFunction(p07, n);
  if (!s) { console.error('could not lift host function: ' + n); process.exit(1); }
  lifted[n] = s;
}

const FROZEN_NOW = 1755800000000;

function makeHost() {
  /* The host functions reach for a diagnostics buffer, a toast and a console.
     Those are UI, which is precisely what the extraction leaves behind, so
     they are stubbed — and what the host DECIDED is compared, not how it
     announced it. */
  const diag = [];
  const scope = {
    window: { _dslDelDiag: diag },
    console: { warn: () => {}, error: () => {}, log: () => {} },
    showToast: () => {},
    _TRASH_RETENTION_DAYS: 90,
    Date: class extends Date {
      constructor(...a) { super(...(a.length ? a : [FROZEN_NOW])); }
      static now() { return FROZEN_NOW; }
    },
    Error, String, Object, Array, JSON, Math, parseInt, isNaN
  };
  const names = Object.keys(scope);
  const body = HOST_FNS.map(n => lifted[n]).join('\n') +
    '\nreturn { isDeleted:_isPhotoDeleted, createdTs:_photoCreatedTs, markDeleted:_markPhotoDeleted,' +
    '         markLive:_markPhotoLive, normalize:_normalizePhotoDel, normalizeAll:_normalizeAllPhotoDel,' +
    '         trashDaysLeft:_pgTrashDaysLeft };';
  return { api: new Function(...names, body)(...names.map(k => scope[k])), diag };
}

const norm = v => JSON.stringify(v, (k, x) => (typeof x === 'number' && !isFinite(x)) ? String(x) : x);
let cases = 0; const mismatches = [];
function agree(label, a, b) {
  cases++;
  if (norm(a) !== norm(b) && mismatches.length < 8) {
    mismatches.push(label + '\n      host: ' + norm(a) + '\n      lib : ' + norm(b));
  } else if (norm(a) !== norm(b)) mismatches.push(label);
}

console.log('\n═══ PHOTO LIFECYCLE — host source vs lib/data/photoLifecycle.js ═══');
console.log('source: ' + REPO + '\n');

/* ── every shape a photo record can be in ───────────────────────────────── */
const DELSTATES = [undefined, 'live', 'deleted', 'weird', ''];
const LEGACY = [undefined, true, false];
const AGES = [0, 1, 2000, 9999, 10000, 10001, 60000, 86400000];
const IDS = (age) => [
  'ph_' + (FROZEN_NOW - age) + '_abc',   // canonical, known age
  'ph_123_x',                            // too short to parse
  'not-an-id', '', undefined
];

function photo(delState, legacy, id) {
  const p = { id: id, n: 'x.jpg' };
  if (delState !== undefined) p.delState = delState;
  if (legacy !== undefined) p.deleted = legacy;
  if (legacy) p.deletedDate = '2026-08-01T00:00:00.000Z';
  return p;
}

/* 1 — is it deleted, and how old is it */
let before = cases;
for (const d of DELSTATES) for (const l of LEGACY) for (const age of AGES) for (const id of IDS(age)) {
  const H = makeHost().api;
  agree(`isDeleted(${d}/${l})`, H.isDeleted(photo(d, l, id)), M.isDeleted(photo(d, l, id)));
  agree(`createdTs(${id})`, H.createdTs(photo(d, l, id)), M.createdTs(photo(d, l, id)));
}
agree('isDeleted(null)', makeHost().api.isDeleted(null), M.isDeleted(null));
agree('createdTs(null)', makeHost().api.createdTs(null), M.createdTs(null));
console.log('  ' + (cases - before) + ' state/age cases compared');

/* 2 — DELETING: the phantom guard, and what gets written */
before = cases;
for (const d of DELSTATES) for (const l of LEGACY) for (const age of AGES) for (const id of IDS(age)) {
  for (const force of [true, false, undefined]) {
    const hp = photo(d, l, id), mp = photo(d, l, id);
    const H = makeHost().api;
    const hRet = H.markDeleted(hp, force === undefined ? undefined : { force: force });
    const mRes = M.markDeleted(mp, force === undefined ? { now: FROZEN_NOW } : { force: force, now: FROZEN_NOW });
    /* The host returns a bare boolean; the module returns a result object. What
       must match is the DECISION and the RECORD it left on the photo. */
    agree(`markDeleted decision ${d}/${l}/${age}/force=${force}`, hRet, mRes.ok);
    agree(`markDeleted record ${d}/${l}/${age}/force=${force}`, hp, mp);
  }
}
console.log('  ' + (cases - before) + ' delete cases compared (decision AND the record left behind)');

/* 3 — the phantom guard is REAL, not incidental */
before = cases;
{
  const fresh = () => ({ id: 'ph_' + (FROZEN_NOW - 3000) + '_z', n: 'fresh.jpg' });
  const hHost = makeHost();
  const blockedHost = hHost.api.markDeleted(fresh());
  const blockedLib = M.markDeleted(fresh(), { now: FROZEN_NOW });
  agree('a programmatic delete of a 3s-old photo is refused', blockedHost, blockedLib.ok);
  agree('...and the photo is still live', false, M.isDeleted((function () {
    const p = fresh(); M.markDeleted(p, { now: FROZEN_NOW }); return p;
  })()));
  const forcedP = fresh();
  M.markDeleted(forcedP, { force: true, now: FROZEN_NOW });
  agree('...but a person tapping Delete goes through', true, M.isDeleted(forcedP));
  agree('...and the refusal says why', 'phantom-fresh', blockedLib.reason);
  agree('...and the host recorded the caller for the field', true, hHost.diag.length > 0);
}
console.log('  ' + (cases - before) + ' phantom-guard assertions');

/* 4 — restore, normalise, and the retention countdown */
before = cases;
for (const d of DELSTATES) for (const l of LEGACY) {
  const hp = photo(d, l, 'ph_' + FROZEN_NOW + '_q'), mp = photo(d, l, 'ph_' + FROZEN_NOW + '_q');
  makeHost().api.markLive(hp); M.markLive(mp);
  agree(`markLive ${d}/${l}`, hp, mp);
  const hn = photo(d, l, 'ph_1_q'), mn = photo(d, l, 'ph_1_q');
  agree(`normalize ${d}/${l}`, makeHost().api.normalize(hn), M.normalize(mn, FROZEN_NOW));
}
for (const iso of [null, '', 'not-a-date', '2026-08-22T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z']) {
  agree(`trashDaysLeft(${iso})`, makeHost().api.trashDaysLeft(iso), M.trashDaysLeft(iso, 90, FROZEN_NOW));
}
console.log('  ' + (cases - before) + ' restore / normalise / retention cases compared');

/* 5 — a WHOLE REPORT normalised, every place a photo can hide */
before = cases;
{
  const build = () => ({
    recordPhotos: [photo(undefined, true, 'ph_1_a'), photo(undefined, false, 'ph_2_b')],
    flowTestPhotos: [photo(undefined, true, 'ph_3_c')],
    flowTestPhotosPld: [photo('deleted', undefined, 'ph_4_d')],
    stdData: [{ photos: [photo(undefined, true, 'ph_5_e')] }, { photos: [] }, null],
    pldData: [{ photos: [photo(undefined, undefined, 'ph_6_f')] }],
    clState: { 's1-1': { photos: [photo(undefined, true, 'ph_7_g')] }, 's1-2': {}, 's1-3': null },
    deficiencies: { ACME: [{ photos: [photo(undefined, true, 'ph_8_h')], responses: [{ photos: [photo(undefined, true, 'ph_9_i')] }] }] },
    generalDeficiencies: [{ photos: [photo(undefined, true, 'ph_10_j')], responses: [{ photos: [photo(undefined, true, 'ph_11_k')] }] }]
  });
  const h = build(), m = build();
  makeHost().api.normalizeAll(h);
  M.normalizeAll(m);
  agree('a whole report normalises identically', h, m);
  /* Not one photo may be missed: a legacy record left un-normalised keeps
     answering from the old boolean forever. */
  const flat = [];
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      if (o.delState !== undefined || o.deleted !== undefined || o.n === 'x.jpg') flat.push(o);
      Object.keys(o).forEach(k => walk(o[k]));
    }
  })(m);
  const missed = flat.filter(p => p.n === 'x.jpg' && p.delState === undefined);
  agree('every photo in the report reached canonical state', 0, missed.length);
}
console.log('  ' + (cases - before) + ' whole-report cases compared');

/* 6 — THE DELEGATION MUST STAY WIRED. The converted host is lifted and run
      alongside, so a future edit that quietly re-implements any of this in
      part07.js shows up here rather than in a field report. */
before = cases;
{
  const liveSrc = fs.readFileSync(path.join(REPO, 'diesel-app/js/part07.js'), 'utf8');
  const liveLifted = {};
  let ok = true;
  for (const n of HOST_FNS) {
    const fn = liftFunction(liveSrc, n);
    if (!fn) { ok = false; break; }
    liveLifted[n] = fn;
  }
  agree('every lifecycle function still exists in the host', true, ok);
  if (ok) {
    /* Each one must be a DELEGATE, not a re-implementation: the body names the
       shared module. Grep-shaped on purpose — this is the mechanical test the
       unification rules require, and it cannot be satisfied by matching
       behaviour, only by actually calling the engine. */
    const notDelegating = HOST_FNS.filter(n => !/PhotoLifecycle\./.test(liveLifted[n]));
    agree('every one of them delegates to the shared module', 0, notDelegating.length);
    if (notDelegating.length) mismatches.push('re-implemented in the host: ' + notDelegating.join(', '));
    /* And no state-writing logic left behind. */
    const writesState = /delState\s*=\s*'(deleted|live)'/.test(
      HOST_FNS.map(n => liveLifted[n]).join('\n'));
    agree('no lifecycle function still writes the state itself', false, writesState);
  }
}
console.log('  ' + (cases - before) + ' delegation checks');

console.log('\n' + cases + ' cases compared, ' + mismatches.length + ' mismatches');
if (mismatches.length) {
  console.log('\nFIRST MISMATCHES:');
  mismatches.slice(0, 8).forEach(m => console.log('  ' + m));
  console.log('\nFAIL — the extraction changed how a photo lives or dies\n');
  process.exit(1);
}
console.log('PASS — the module and the live host agree on every case\n');
process.exit(0);
