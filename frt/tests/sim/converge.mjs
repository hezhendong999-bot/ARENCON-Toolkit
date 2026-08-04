/* ═══════════════════════════════════════════════════════════════════════════
 * frt/tests/sim/converge.mjs — S612 FRT FULL-REPORT CONVERGENCE HARNESS.
 *
 * Lane C's tools/sim/converge.mjs (S611) walks Diesel's merge spec and drives
 * the real facade. This is the FRT clone of that method, with one deliberate
 * extension: it walks NESTED families too. FRT's structure is nested by
 * nature — a deficiency lives inside a contractor, an observation lives
 * inside a deficiency, photos live inside both — and the engine's own comment
 * calls FRT's contractor-level merge "coarse — follow-up work". A top-level-
 * only walker would report FRT healthy while the sections inspectors actually
 * type into stayed single-device. So depth is where the answers are.
 *
 * Four checks per family, per depth:
 *   P  propagate  : another device's newer-stamped edit must land here
 *   K  keep-newer : this device's newer-stamped entry must survive a pull
 *   W  no-wipe    : an empty/skeleton cloud item never erases local content
 *   G  no-ghost   : an empty local item absent from cloud never unions in
 *
 * New spec families are covered BY CONSTRUCTION — the walker reads the spec
 * out of the shipped engine, so adding a family to _LWW_SPECS.frt adds it
 * here with no edit to this file.
 *
 * FRT is driven through SyncEngine.pull() with Model as the host — that is
 * FRT's real multi-device path (there is no CloudSync facade on this side).
 * The service worker's merge worker cannot boot under node; the shipped
 * inline fallback takes over, which is the same code path a browser uses
 * whenever the worker fails, so the merge under test is the real one.
 *
 * Run: node frt/tests/sim/converge.mjs
 *      SIM_TARGET=live node frt/tests/sim/converge.mjs   (compares ../live3)
 * Deps: cd tools/sim && npm i jsdom fake-indexeddb
 * ═══════════════════════════════════════════════════════════════════════════ */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = process.env.SIM_TARGET === 'live' ? 'live' : 'fix';
const ROOT = TARGET === 'live' ? path.resolve(HERE, '../../../../live3') : path.resolve(HERE, '../../..');
const ROW = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';
const T_OLD = 1785700000000, T_NEW = 1785790000000;

/* ── read the spec straight from the shipped engine ─────────────────────── */
const engineSrc = fs.readFileSync(path.join(ROOT, 'lib/data/sync.js'), 'utf8');
const fseg = engineSrc.slice(engineSrc.indexOf('  frt: {'), engineSrc.indexOf('_LWW_SPECS.electric'));

/* Parse the spec object for real (brace-matched) rather than by line regex —
   FRT's entry is nested three deep on single lines, which a line-oriented
   scanner cannot see at all. */
function sliceBlock(src, startIdx) {
  let d = 0;
  for (let i = startIdx; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(startIdx, i + 1); }
  }
  return '';
}
function parseFamilies(block, prefix) {
  // block = the text between { } of an `arrays:` or `nested:` object
  const out = [];
  const re = /(\w+):\s*\{\s*key:\s*'(\w+)'/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const objStart = block.indexOf('{', m.index + m[1].length);
    const obj = sliceBlock(block, objStart);
    // Only direct children: skip matches that live inside an already-consumed
    // nested object.
    if (out.some(f => f._span && m.index > f._span[0] && m.index < f._span[1])) continue;
    const fm = obj.match(/fields:\s*\[([^\]]*)\]/);
    const nm = obj.indexOf('nested:');
    const fam = {
      name: m[1],
      path: prefix ? prefix + '.' + m[1] : m[1],
      key: m[2],
      fields: fm ? fm[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean) : [],
      _span: [objStart, objStart + obj.length],
      children: []
    };
    if (nm >= 0) {
      const nb = sliceBlock(obj, obj.indexOf('{', nm));
      fam.children = parseFamilies(nb, fam.path);
    }
    out.push(fam);
  }
  return out;
}
const arraysBlock = sliceBlock(fseg, fseg.indexOf('{', fseg.indexOf('arrays:')));
const tree = parseFamilies(arraysBlock, '');
const fieldMaps = (fseg.match(/fieldMaps:\s*\[([^\]]*)\]/) || [, ''])[1]
  .replace(/'/g, '').split(',').map(s => s.trim()).filter(Boolean);

// Flatten to a walk list, each entry carrying the chain of ancestors.
const walk = [];
(function flat(list, chain) {
  for (const f of list) { walk.push({ f, chain }); flat(f.children, chain.concat([f])); }
})(tree, []);

/* ── build a project state that places one item at the family's depth ───── */
function mkItem(f, val, ts) {
  const o = {};
  o[f.key] = f.path.replace(/\./g, '_') + '-1';
  o[f.fields.length ? f.fields[0] : 'v'] = val;
  if (ts) o._ts = ts;
  return o;
}
function build(entry, val, ts, opts) {
  opts = opts || {};
  const leaf = mkItem(entry.f, val, ts);
  if (opts.dropTs) delete leaf._ts;
  if (opts.altKey) leaf[entry.f.key] = entry.f.path.replace(/\./g, '_') + '-cloudonly';
  let node = [leaf];
  for (let i = entry.chain.length - 1; i >= 0; i--) {
    const p = entry.chain[i];
    const childName = (i === entry.chain.length - 1) ? entry.f.name : entry.chain[i + 1].name;
    const holder = mkItem(p, 'carrier', T_OLD);
    holder[childName] = node;
    node = [holder];
  }
  const st = { info: {}, signatures: {} };
  st[entry.chain.length ? entry.chain[0].name : entry.f.name] = node;
  return st;
}
function readLeaf(st, entry) {
  let arr = st[entry.chain.length ? entry.chain[0].name : entry.f.name];
  for (let i = 0; i < entry.chain.length; i++) {
    if (!Array.isArray(arr) || !arr[0]) return { val: '∅', n: 0 };
    const childName = (i === entry.chain.length - 1) ? entry.f.name : entry.chain[i + 1].name;
    arr = arr[0][childName];
  }
  if (!Array.isArray(arr)) return { val: '∅', n: 0 };
  const it = arr[0];
  if (!it) return { val: '∅', n: 0 };
  return { val: String(it[entry.f.fields.length ? entry.f.fields[0] : 'v']), n: arr.length };
}

/* ── browser + cloud simulation ─────────────────────────────────────────── */
const jr = b => Promise.resolve({
  ok: true, status: 200, headers: { get: () => null },
  json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b))
});
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/?project=p1' });
const w = dom.window;
global.window = w; global.document = w.document;
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w;
global.CustomEvent = w.CustomEvent; global.Event = w.Event; global.Blob = w.Blob;
global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory();
global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;

const cloud = { data: {}, updatedAt: '2026-08-04T04:00:00Z' };
global.fetch = w.fetch = function (url, opts) {
  url = String(url);
  const m = ((opts && opts.method) || 'GET').toUpperCase();
  if (url.includes('/auth/v1/user')) return jr({ id: 'u' });
  if (url.includes('/rest/v1/sync_diag')) return jr([{}]);
  if (url.includes('/rest/v1/profiles')) return jr([{ id: 'u', full_name: 'Sim' }]);
  if (url.includes('/rest/v1/projects')) return jr([{ id: 'p1' }]);
  if (url.includes('/rest/v1/tool_data')) {
    if (m === 'GET' && url.includes('select=updated_at')) return jr([{ updated_at: cloud.updatedAt }]);
    if (m === 'GET') return jr([{ id: ROW, project_id: 'p1', tool_key: 'frt', instance_number: 1,
                                 data: cloud.data, updated_at: cloud.updatedAt, status: 'draft' }]);
    if (m === 'PATCH') {
      try { cloud.data = JSON.parse(opts.body).data || cloud.data; } catch (_) {}
      cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString();
      return jr([{ id: ROW, updated_at: cloud.updatedAt }]);
    }
  }
  return jr([]);
};
w.localStorage.setItem('sb-access-token', 'tok');
w.localStorage.setItem('sb-refresh-token', 'ref');
w.localStorage.setItem('arencon-device-id', 'sim-frt-cv');

const { Model } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/model.js')).href);
const { IDB } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/idb.js')).href);
const { SyncEngine } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/sync.js')).href);
await IDB.init();

/* One pull = one "beat" — an ORDINARY heartbeat pull.
   HARNESS CORRECTION (caught on this file's maiden run, before any finding
   was reported): the first draft passed { allowStaleOverwrite: true }, copying
   FRT's BOOT call. That flag deliberately SKIPS the per-item merge entirely
   (engine line ~2291, S524 hotfix: at boot the model holds a default skeleton
   whose blanks would read as local edits and preserve emptiness over real
   cloud content). Testing the merge through a call that bypasses the merge
   produced a uniform K and W failure across every family — a harness artifact
   that would have been reported as an engine catastrophe. The multi-device
   path under test is the heartbeat pull, so that is what this drives. */
async function beat() {
  cloud.updatedAt = new Date(Date.parse(cloud.updatedAt) + 60000).toISOString();
  await SyncEngine.pull('p1', ROW);
  await new Promise(r => setTimeout(r, 40));
}
/* Seeding must also set `modified` ahead of the cloud clock, or the S491
   stale-overwrite guard short-circuits the pull before the merge is reached
   and every check reads as a pass for the wrong reason. */
function seed(st) {
  st.modified = new Date(Date.parse(cloud.updatedAt) - 3600000).toISOString();
  Model.setProject(JSON.parse(JSON.stringify(st)));
}
function screen() { return Model.getProject() || {}; }

let pass = 0, fail = 0; const lines = [];
function chk(label, tag, ok, d) {
  ok ? pass++ : fail++;
  lines.push('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + label.padEnd(34) + tag + '  ' + (d || ''));
}

for (const entry of walk) {
  const label = entry.f.path + (entry.f.fields.length ? '' : '  (untyped)');
  // P — another device's newer edit must land here
  seed(build(entry, 'stale', T_OLD)); cloud.data = build(entry, 'fresh', T_NEW);
  await beat();
  chk(label, 'P propagate ', readLeaf(screen(), entry).val === 'fresh', 'got ' + readLeaf(screen(), entry).val);
  // K — this device's newer entry must survive
  seed(build(entry, 'mine', T_NEW)); cloud.data = build(entry, 'old', T_OLD);
  await beat();
  chk(label, 'K keep-newer', readLeaf(screen(), entry).val === 'mine', 'got ' + readLeaf(screen(), entry).val);
  // W — an unstamped skeleton from the cloud must not erase real content
  seed(build(entry, 'real', T_OLD)); cloud.data = build(entry, '', 0, { dropTs: true });
  await beat();
  chk(label, 'W no-wipe   ', readLeaf(screen(), entry).val === 'real', 'got ' + readLeaf(screen(), entry).val);
  // G — an empty local item absent from the cloud must not union in
  seed(build(entry, '', 0, { dropTs: true }));
  cloud.data = build(entry, 'kept', T_NEW, { altKey: true });
  await beat();
  chk(label, 'G no-ghost  ', readLeaf(screen(), entry).n === 1, 'rows=' + readLeaf(screen(), entry).n);
}

/* fieldMaps (info / signatures): a blank local field must never beat content */
for (const fm of fieldMaps) {
  const st = { info: {}, signatures: {} };
  st[fm] = { projectName: '' };
  seed(st);
  cloud.data = { info: {}, signatures: {} };
  cloud.data[fm] = { projectName: 'from tablet B', _ts: T_NEW };
  await beat();
  const v = screen()[fm];
  chk(fm + '  (fieldMap)', 'W no-wipe   ', !!(v && v.projectName === 'from tablet B'),
      'got ' + (v && v.projectName));
}

console.log('\n=== FRT CONVERGENCE (' + TARGET.toUpperCase() + ') — ' + walk.length +
            ' families (nested walk) + ' + fieldMaps.length + ' field maps ===\n' + lines.join('\n'));
console.log('\n' + pass + ' passed, ' + fail + ' failed on ' + TARGET.toUpperCase() + '\n');
process.exit(TARGET === 'live' ? 0 : (fail ? 1 : 0));
