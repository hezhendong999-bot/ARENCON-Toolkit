/* photoinv.mjs — WHICH PHOTOGRAPHS ARE VISIBLE (Lane C, S683)
 *
 * UNIFICATION PHASE 3, third cut. The walk that gathers every photograph in a
 * project now runs through lib/data/photoInventory.js: the tool still declares
 * its own sources, badges and labels, but the rule deciding whether a photo
 * appears at all is shared and unskippable — a source reaches the list only
 * through an `emit` that has already applied it.
 *
 * WHY THAT RULE IS THE THING UNDER TEST. It fails in two opposite directions
 * and both have happened:
 *
 *   TOO STRICT (S367) — the live-only filter was hard-coded, so the consumers
 *   that manage deleted photos asked for the full walk and silently got the
 *   filtered one. Recently Deleted was permanently empty; Restore could never
 *   find a photograph. Nothing errored. The photos existed the entire time and
 *   no screen would show them.
 *
 *   TOO LOOSE — the default must stay live-only, because the PDF appendix is
 *   one of about thirty callers relying on it. Loosen it and a soft-deleted
 *   placard, or an internal backup duplicate, appears in a report issued to a
 *   client. That is the tool publishing something a person deliberately
 *   removed.
 *
 * Held against the PRE-EXTRACTION source, kept as a fixture, so this stays a
 * real comparison now that the host delegates.
 *
 * Run: node tools/sim/photoinv.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

const root = {};
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/data/photoInventory.js'), 'utf8'))(root, undefined);
const INV = root.PhotoInventory;
if (!INV) { console.error('lib/data/photoInventory.js did not publish PhotoInventory'); process.exit(1); }

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

const PRE = path.join(HERE, 'fixtures/part07_inventory_pre.txt');
const preSrc = fs.readFileSync(PRE, 'utf8');
const liveSrc = fs.readFileSync(path.join(REPO, 'diesel-app/js/part07.js'), 'utf8');

/* Both the OLD implementation and the NEW delegating one are built over the
   same report and the same helpers, and required to produce the same list. */
function build(src, state, withEngine) {
  const scope = {
    window: withEngine ? { PhotoInventory: INV } : {},
    console: { warn: () => {} },
    _photoSrc: (p) => 'src:' + (p && p.id),
    _clItemNum: (id) => 'N' + id,
    _floweqTag: (p) => (p && p.tag) || 'flow_chart',
    _floweqShort: (t) => 'S(' + t + ')',
    _floweqLabel: (t) => 'L(' + t + ')',
    _GAUGE_TAG_SHORT: { suction: 'Suc', discharge: 'Dis' },
    _GAUGE_TAG_LABEL: { suction: 'Suction', discharge: 'Discharge' },
    flowTestPhotos: state.flowTestPhotos,
    flowTestPhotosPld: state.flowTestPhotosPld,
    clState: state.clState,
    deficiencies: state.deficiencies,
    generalDeficiencies: state.generalDeficiencies,
    recordPhotos: state.recordPhotos,
    stdData: state.stdData,
    pldData: state.pldData,
    Object, Array, String
  };
  const names = Object.keys(scope);
  const body = liftFunction(src, '_collectAllPhotos') + '\nreturn _collectAllPhotos;';
  return new Function(...names, body)(...names.map(k => scope[k]));
}

let cases = 0; const bad = [];
const norm = v => JSON.stringify(v);
function agree(label, a, b) {
  cases++;
  if (norm(a) !== norm(b)) bad.push(label + '\n      old: ' + String(norm(a)).slice(0, 300) + '\n      new: ' + String(norm(b)).slice(0, 300));
}

/* ── report shapes, including every awkward corner ───────────────────────── */
function ph(id, extra) { return Object.assign({ id: id, n: id + '.jpg' }, extra || {}); }

function report(v) {
  return {
    flowTestPhotos: v.empty ? [] : [ph('f1'), ph('f2', { deleted: true }), ph('f3', { tag: 'suction' })],
    flowTestPhotosPld: v.empty ? [] : [ph('p1'), ph('p2', { _isOrigBackup: true })],
    clState: v.empty ? {} : { 's1-1': { photos: [ph('c1'), ph('c2', { deleted: true })] }, 's1-2': {}, 's1-3': { photos: [] } },
    deficiencies: v.empty ? {} : {
      ACME: [{ photos: [ph('d1'), ph('d2', { _isOrigBackup: true })], responses: [{ photos: [ph('r1')] }, { photos: [] }] },
             { photos: [], responses: [] }],
      BETA: [{ photos: [ph('d3', { deleted: true })] }]
    },
    generalDeficiencies: v.empty ? [] : [{ photos: [ph('g1')] }, { photos: [ph('g2', { deleted: true })] }],
    recordPhotos: v.empty ? [] : [
      ph('rec1', { kind: 'pump' }), ph('rec2', { kind: 'pump-pld' }),
      ph('rec3', { kind: 'placard' }), ph('rec4', { kind: 'placard-pld' }),
      ph('rec5', { kind: 'site' }), ph('rec6', {}), ph('rec7', { kind: 'pump', _isOrigBackup: true }),
      ph('rec8', { kind: 'placard', deleted: true })
    ],
    stdData: v.empty ? [] : [
      { pct: '0%', photos: [ph('s1'), ph('s2', { tag: 'suction' })] },
      { pct: '100%', photos: [] }, { pct: '150%' }, null
    ],
    pldData: v.empty ? [] : [
      { pct: '0%', photos: [ph('q1', { tag: 'discharge', mode: 'pld' }), ph('q2', { mode: 'direct' })] },
      { photos: [ph('q3')] }
    ]
  };
}

console.log('\n═══ PHOTO INVENTORY — pre-extraction walk vs the shared engine ═══');
console.log('source: ' + REPO + '\n');

let before = cases;
for (const shape of [{ name: 'full report' }, { name: 'empty report', empty: true }]) {
  for (const opts of [undefined, {}, { includeDeleted: true }, { includeBackups: true },
                      { includeDeleted: true, includeBackups: true },
                      { includeDeleted: false, includeBackups: false }]) {
    const oldFn = build(preSrc, report(shape), false);
    const newFn = build(liveSrc, report(shape), true);
    agree(`${shape.name} / ${JSON.stringify(opts)}`, oldFn(opts), newFn(opts));
  }
}
console.log('  ' + (cases - before) + ' whole-report walks compared, entry for entry');

/* ── the two failure directions, asserted outright ──────────────────────── */
before = cases;
{
  const newFn = build(liveSrc, report({}), true);
  const live = newFn();
  const full = newFn({ includeDeleted: true });
  agree('by default a deleted photo is not in the list', false,
        live.some(e => e.photo.deleted === true));
  agree('by default a backup duplicate is not in the list', false,
        live.some(e => e.photo._isOrigBackup === true));
  agree('the trash gatherer DOES see deleted photos', true,
        full.some(e => e.photo.deleted === true));
  agree('the gallery can ask for backups without asking for deleted ones', true,
        newFn({ includeBackups: true }).some(e => e.photo._isOrigBackup === true));
  agree('...and that request still excludes deleted photos', false,
        newFn({ includeBackups: true }).some(e => e.photo.deleted === true));
  agree('the full walk is a superset of the default', true, full.length > live.length);
}
console.log('  ' + (cases - before) + ' visibility assertions (both failure directions)');

/* ── a broken source must not empty the gallery ─────────────────────────── */
before = cases;
{
  const out = INV.collect([
    { name: 'ok-before', each: (emit) => { emit(ph('a'), { type: 't' }); } },
    { name: 'explodes', each: () => { throw new Error('bad source'); } },
    { name: 'ok-after', each: (emit) => { emit(ph('b'), { type: 't' }); } }
  ], {});
  agree('one broken source does not take the rest of the gallery with it', 2, out.length);
}
console.log('  ' + (cases - before) + ' resilience assertions');

/* ── the delegation must stay wired ─────────────────────────────────────── */
before = cases;
{
  const fn = liftFunction(liveSrc, '_collectAllPhotos');
  agree('the walk still exists in the host', true, !!fn);
  agree('it delegates to the shared engine', true, /PhotoInventory\.collect/.test(fn));
  /* The filter must not be re-written in the host — a private copy of _live is
     exactly how the two directions diverge again. */
  agree('the host does not re-implement the visibility rule', false,
        /_isOrigBackup\s*\)\s*return\s+_includeBackups/.test(fn));
}
console.log('  ' + (cases - before) + ' delegation checks');

console.log('\n' + cases + ' cases compared, ' + bad.length + ' mismatches');
if (bad.length) {
  console.log('\nFIRST MISMATCHES:');
  bad.slice(0, 5).forEach(m => console.log('  ' + m));
  console.log('\nFAIL — the extraction changed which photographs are visible\n');
  process.exit(1);
}
console.log('PASS — the same photographs, in the same order, for every caller\n');
process.exit(0);
