// ARENCON lib harness — checklist engine + lightbox shell (S461)
// Run: node lib/tests/checklist.test.mjs   (exit 0 = green; the /lib/ push gate)
//
// The migration tests use the VERBATIM S367 Diesel _migrateClState as the
// oracle: the shared engine, fed the Diesel config, must reproduce its output
// byte-for-byte on every case. That is the "same behavior, new home" proof
// for the one piece that was generalized rather than lifted verbatim.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); }
}
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg || 'mismatch') + '\n    got:      ' + ja + '\n    expected: ' + jb);
}

// ── ORACLE: verbatim S367 Diesel _migrateClState (v1→v2) ──────────────────
const CL_SCHEMA_VER = 2;
function oracleMigrate(loaded, savedVer) {
  if (!loaded || typeof loaded !== 'object') return loaded;
  savedVer = savedVer || 1;
  if (savedVer >= CL_SCHEMA_VER) return loaded;
  var out = {};
  var S5_V1_TO_V2 = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 8: 10, 9: 11, 10: 12, 11: 13, 12: 14 };
  Object.keys(loaded).forEach(function (k) {
    var m = /^s5_(\d+)$/.exec(k);
    if (m) {
      var oldIdx = parseInt(m[1], 10);
      if (S5_V1_TO_V2.hasOwnProperty(oldIdx)) {
        out['s5_' + S5_V1_TO_V2[oldIdx]] = loaded[k];
      }
      return;
    }
    out[k] = loaded[k];
  });
  return out;
}

// ── Load modules ───────────────────────────────────────────────────────────
const ArcChecklist = require('../ui/checklist.js');
const LightboxShell = require('../ui/lightbox.js');

const DIESEL_CFG = {
  schemaVer: 2,
  migrations: { 2: { re: /^s5_(\d+)$/, prefix: 's5_', map: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 8: 10, 9: 11, 10: 12, 11: 13, 12: 14 } } },
  sectionItems: function (sec) {
    const S2 = [{ num: '2.1', text: 'a' }, { num: '2.2', text: 'b' }];
    const S5 = [{ num: '5.1', text: 'x' }];
    return { s2: S2, s5: S5 }[sec];
  }
};
const CL = ArcChecklist.create(DIESEL_CFG);

console.log('\n── module surface ──');
t('ArcChecklist API', () => {
  eq(typeof ArcChecklist.create, 'function');
  eq(ArcChecklist.VERSION, '1.0.0');
  eq(typeof ArcChecklist.CSS, 'string');
  if (ArcChecklist.CSS.indexOf('.cl-item') < 0) throw new Error('CSS missing .cl-item');
});
t('create() exposes the full family', () => {
  for (const k of ['cid', 'migrate', 'visibleItems', 'renderChecklist', 'buildItem', 'toggleItemDetail', 'refreshItemPhotoUI', 'setStatus', 'renderThumbs', 'itemNum'])
    eq(typeof CL[k], 'function', k);
  eq(CL.schemaVer, 2);
});
t('LightboxShell API + Node-safe build', () => {
  eq(typeof LightboxShell.build, 'function');
  eq(LightboxShell.VERSION, '1.0.0');
  const inst = LightboxShell.build();
  for (const k of ['open', 'close', 'isOpen', 'handleBack', 'enterMarkup'])
    eq(typeof inst[k], 'function', k);
  eq(inst.isOpen(), false, 'closed at build');
  eq(inst.handleBack(), false, 'handleBack no-ops when closed');
});

console.log('\n── cid ──');
t('cid format', () => {
  eq(CL.cid('s2', 0), 's2_0');
  eq(CL.cid('s5m', 11), 's5m_11');
  eq(CL.cid('s4pld', 3), 's4pld_3');
});

console.log('\n── migrate vs verbatim S367 oracle ──');
const migCases = [
  ['v1 full S5 spread', { s5_0: { status: 'yes' }, s5_6: { status: 'no', comment: 'c' }, s5_7: { status: 'yes' }, s5_8: { status: 'na' }, s5_12: { status: 'yes' } }, 1],
  ['v1 mixed sections untouched', { s1_0: { status: 'yes' }, s5m_3: { status: 'no' }, s5_9: { status: 'yes' }, s4pld_2: { status: 'na' } }, 1],
  ['v1 with custom-shaped keys', { s5_10: { status: 'yes' }, weird_key: { status: 'no' }, s5_extra: { status: 'yes' } }, 1],
  ['already v2 passthrough', { s5_7: { status: 'yes' } }, 2],
  ['undefined savedVer treated as v1', { s5_7: { status: 'yes' }, s5_0: { status: 'no' } }, undefined],
  ['empty object', {}, 1],
];
for (const [name, input, ver] of migCases) {
  t(name, () => eq(CL.migrate(structuredClone(input), ver), oracleMigrate(structuredClone(input), ver)));
}
t('null / non-object passthrough', () => {
  eq(CL.migrate(null, 1), oracleMigrate(null, 1));
  eq(CL.migrate('x', 1), oracleMigrate('x', 1));
});
t('v1→v2 drops old idx 7 and remaps 8→10 (spot check)', () => {
  const out = CL.migrate({ s5_7: { status: 'yes' }, s5_8: { status: 'no' } }, 1);
  eq(out.s5_7, undefined, 'idx 7 dropped');
  eq(out.s5_10, { status: 'no' }, '8 → 10');
});

console.log('\n── visibleItems walk ──');
const ITEMS = [{ num: '1.1', text: 'A' }, { num: '1.2', text: 'B' }, { num: '1.3', text: 'C' }];
t('built-ins only', () => {
  const v = CL.visibleItems(ITEMS, 's1');
  eq(v.map(x => x.id), ['s1_0', 's1_1', 's1_2']);
  eq(v.map(x => x.isCustom), [false, false, false]);
});
t('deletion re-numbers by visible index (positional model)', () => {
  globalThis.deletedItems = { s1: new Set([1]) };
  const v = CL.visibleItems(ITEMS, 's1');
  eq(v.map(x => x.id), ['s1_0', 's1_1']);
  eq(v.map(x => x.item.text), ['A', 'C']);
  delete globalThis.deletedItems;
});
t('custom items append after built-ins', () => {
  globalThis.customItems = { s1: [{ num: 'C1', text: 'X' }] };
  const v = CL.visibleItems(ITEMS, 's1');
  eq(v.map(x => x.id), ['s1_0', 's1_1', 's1_2', 's1_3']);
  eq(v[3].isCustom, true);
  delete globalThis.customItems;
});
t('deletion + custom together', () => {
  globalThis.deletedItems = { s1: new Set([0]) };
  globalThis.customItems = { s1: [{ text: 'X' }] };
  const v = CL.visibleItems(ITEMS, 's1');
  eq(v.map(x => x.id), ['s1_0', 's1_1', 's1_2']);
  eq(v.map(x => x.item.text), ['B', 'C', 'X']);
  delete globalThis.deletedItems; delete globalThis.customItems;
});
t('deletions never apply to custom items (rawIdx guard)', () => {
  globalThis.deletedItems = { s1: new Set([3]) };   // idx 3 would be the custom slot
  globalThis.customItems = { s1: [{ text: 'X' }] };
  const v = CL.visibleItems(ITEMS, 's1');
  eq(v.length, 4, 'custom survives a same-index deletion mark');
  delete globalThis.deletedItems; delete globalThis.customItems;
});

console.log('\n── itemNum ──');
t('resolves built-in num via sectionItems', () => {
  eq(CL.itemNum('s2_1'), '2.2');
  eq(CL.itemNum('s5_0'), '5.1');
});
t('unknown section / out-of-range / custom → returns id (live behavior)', () => {
  eq(CL.itemNum('s9_0'), 's9_0');
  eq(CL.itemNum('s2_99'), 's2_99');
});
t('non-string and separator-less ids pass through', () => {
  eq(CL.itemNum(42), 42);
  eq(CL.itemNum('plain'), 'plain');
});

console.log('\n── source-of-truth guards ──');
t('lightbox: no quadraticCurveTo, no OffscreenCanvas (locked rules)', () => {
  const src = require('fs').readFileSync(new URL('../ui/lightbox.js', import.meta.url), 'utf8');
  if (/quadraticCurveTo/.test(src)) throw new Error('quadraticCurveTo present');
  if (/new OffscreenCanvas/.test(src)) throw new Error('OffscreenCanvas constructor present');
});
t('checklist: unselected tog carries no colour tint (ledger rule)', () => {
  const css = ArcChecklist.CSS;
  const m = css.match(/\.tog\{[^}]*\}/);
  if (!m) throw new Error('.tog base rule missing');
  if (/--cl-(yes|no|na)(?!-bg)/.test(m[0])) throw new Error('unselected .tog references a status colour');
});
t('buildItem HTML wires the host global contract (static check)', () => {
  const src = require('fs').readFileSync(new URL('../ui/checklist.js', import.meta.url), 'utf8');
  for (const g of ['setStatus(', 'toggleItemDetail(', 'triggerPhoto(', 'handleDrop(', '_boxUp(', 'triggerCamera(', '_galleryReuseChecklist(', 'openLightbox(', 'removePhoto(', 'openLightboxMarkup('])
    if (src.indexOf(g) < 0) throw new Error('missing host wiring: ' + g);
});


// ═══ photoMint (S461 leg 2) ═══
console.log('\n── ArcPhoto.mint (photo mint path) ──');
const ArcPhoto = require('../data/photoMint.js');
t('module surface', () => { eq(typeof ArcPhoto.mint, 'function'); eq(ArcPhoto.VERSION, '1.0.0'); });
t('base schema verbatim (id format, empty R2 triplet, date default, enqueue called with same ref)', () => {
  let enq = null; globalThis._r2EnqueuePhoto = p => { enq = p; };
  const ph = ArcPhoto.mint('data:x', 'IMG_1.jpg');
  if (!/^ph_\d+_[a-z0-9]{1,6}$/.test(ph.id)) throw new Error('id format: ' + ph.id);
  eq(ph.d, 'data:x'); eq(ph.n, 'IMG_1.jpg');
  eq([ph.r2Key, ph.r2Status, ph.r2Url], ['', '', '']);
  if (isNaN(Date.parse(ph.date))) throw new Error('date not ISO');
  if (enq !== ph) throw new Error('enqueue did not receive the minted object');
  delete globalThis._r2EnqueuePhoto;
});
t('EXIF date override', () => {
  globalThis._r2EnqueuePhoto = () => {};
  const ph = ArcPhoto.mint('d', 'n', { date: '2026-01-02T03:04:05.000Z' });
  eq(ph.date, '2026-01-02T03:04:05.000Z');
  delete globalThis._r2EnqueuePhoto;
});
t('extras merge (gauge tag/mode, record kind) without touching base fields', () => {
  globalThis._r2EnqueuePhoto = () => {};
  const ph = ArcPhoto.mint('d', 'n', { extra: { tag: 'suction', mode: null, caption: '', kind: 'pump' } });
  eq(ph.tag, 'suction'); eq(ph.mode, null); eq(ph.caption, ''); eq(ph.kind, 'pump');
  eq([ph.r2Key, ph.r2Status, ph.r2Url], ['', '', '']);
  delete globalThis._r2EnqueuePhoto;
});
t('enqueue failure is LOUD (no silent skip — the S369 photo-loss class)', () => {
  delete globalThis._r2EnqueuePhoto;
  let threw = false;
  try { ArcPhoto.mint('d', 'n'); } catch (e) { threw = true; }
  if (!threw) throw new Error('mint silently skipped enqueue');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
