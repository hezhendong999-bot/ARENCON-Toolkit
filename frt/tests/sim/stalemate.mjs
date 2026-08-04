/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — STALEMATE (S608, Lane A)
   frt/tests/sim/stalemate.mjs          run: node frt/tests/sim/stalemate.mjs

   WHAT THIS PROVES
   The S598/S605 disease, in FRT: a photo record carries local-only data the
   cloud strips by design (dataUrl, thumb). Judge dirtiness on the WHOLE
   object and every photo reads as "locally edited" on every device on every
   pull — so local wins forever, and a caption edit, rotation, or delete made
   on another tablet can NEVER land here. Two devices each keep their own
   copy and the report never converges: a stalemate. Diesel hit exactly this
   in Mark's 03-Aug field test; S605 fixed it there with typed fields —
   dirtiness judged only on what a person can change about a photo.

   This harness does two things:
     A. Reads the shipped _LWW_SPECS and requires typed fields on FRT's
        photo-bearing entries (the pool `photos` array and the nested photo
        lists inside contractor/general deficiencies).
     B. LIVE REPLAY — imports the shipped merge and proves that a photo
        whose only local/cloud difference is a stripped dataUrl loses to a
        newer cloud caption edit (converges), while a genuinely newer LOCAL
        markup-stroke edit survives a cloud pull (marks are content).

   DELIBERATELY OUT OF SCOPE: deficiency/observation typed fields. Lane C's
   deficiency-propagation investigation is open; changing how FRT judges
   deficiency dirtiness mid-investigation would contaminate their forensics.
   Photos are orthogonal (nested children are dropped from the parent's own
   signature and merge in their own right).

   FAILS on pre-S608 FRT (spec entries are id-only; the replay stalemates).
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const libSrc = readFileSync(join(ROOT, 'lib', 'data', 'sync.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (why ? ' — ' + why : '')); }
}

console.log('\n═══ A. FRT photo entries carry typed fields ═══');
const frtSpec = (() => {
  const i = libSrc.indexOf('frt: {');
  if (i < 0) return '';
  // FRT is the last spec entry; slice to the electric alias line.
  const end = libSrc.indexOf('_LWW_SPECS.electric', i);
  return libSrc.slice(i, end > 0 ? end : i + 4000);
})();
ok('FRT spec entry exists', frtSpec.length > 0);
ok("pool `photos` has typed fields incl. caption",
   /photos:\s*\{\s*key:\s*'id',\s*fields:\s*\[[^\]]*'caption'/.test(frtSpec),
   'id-only = whole-object dirtiness = the stalemate');
ok('typed photo fields include the never-bake markup vectors (_markupStrokes)',
   /_markupStrokes/.test(frtSpec),
   'excluding marks means a mark moved on this device could be silently reverted by a cloud pull');
ok('nested deficiency photo lists carry the same typed fields',
   /deficiencies:[\s\S]*photos:\s*\{\s*key:\s*'id',\s*fields:/.test(frtSpec));
ok('deficiency/observation entries remain UNtyped (Lane C investigation open)',
   !/deficiencies:\s*\{\s*key:\s*'id',\s*fields:/.test(frtSpec) &&
   !/observations:\s*\{\s*key:\s*'id',\s*fields:/.test(frtSpec),
   'do not change deficiency dirtiness while Lane C is investigating propagation');

console.log('\n═══ B. Non-scalar typed fields are content-compared ═══');
ok('_lwwStripFields serializes object/array fields canonically (not String())',
   /_lwwStripFields[\s\S]{0,1500}stableKey\(o\[f\]\)/.test(libSrc),
   "String([strokes]) is '[object Object],…' — a moved mark would be invisible");

console.log('\n═══ C. LIVE REPLAY — the shipped merge, both directions ═══');
try {
  // createSync touches window/navigator/localStorage at construction; shim
  // them so the SHIPPED module runs unmodified under node.
  if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener() {} };
  // node ships a read-only `navigator` (userAgent present, onLine absent) —
  // absent reads as falsy/offline, which the replay path never consults.
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  }
  const mod = await import('../../../lib/data/sync.js');
  // Reach the per-item merge through a real createSync instance the same way
  // pinTeleportGuards reaches its validator: via the module's test hook.
  const hook = mod.__lwwTestHook;
  ok('merge test hook exported (__lwwTestHook)', typeof hook === 'function',
     'without a hook the replay cannot run against shipped code');
  if (typeof hook === 'function') {
    const now = Date.now();
    // Device-local copy: stale caption, but carries dataUrl the cloud strips.
    const local = [{ id: 'ph1', caption: 'old caption', rotation: 0,
                     dataUrl: 'data:image/jpeg;base64,LOCALONLY', thumb: 'x',
                     _ts: now - 60000 }];
    // Cloud copy: another tablet edited the caption 10s ago; no dataUrl.
    const cloud = [{ id: 'ph1', caption: 'NEW caption from tablet B',
                     rotation: 0, _ts: now - 10000 }];
    // Snapshot = what this device last agreed with the cloud (also stripped).
    const snap  = [{ id: 'ph1', caption: 'old caption', rotation: 0,
                     _ts: now - 60000 }];
    const out = hook('frt', 'photos', local, cloud, snap);
    const item = out && out.merged && out.merged.find(p => p.id === 'ph1');
    ok('cloud caption edit LANDS despite the stripped local dataUrl',
       !!item && item.caption === 'NEW caption from tablet B',
       'still stalemated: local-only binary is masquerading as an inspector edit');
    // Diesel-proven semantics: the cloud item wins OUTRIGHT (cloud owns
    // structure). The binary is not in the merged model row — it lives in the
    // durable local stores (BinaryOutbox/IDB) and R2, and reconcileWithModel
    // rehydrates after every merge. Same shape as diesel recordPhotos, field-
    // proven since S605.
    ok('the win is recorded as replacedFromCloud (convergence, not stalemate)',
       !!(out.stats && out.stats.replacedFromCloud >= 1),
       'the item must actually converge, not be kept-local by phantom dirtiness');

    // Reverse direction: a genuinely newer LOCAL mark edit beats the cloud.
    const local2 = [{ id: 'ph2', caption: 'c', _markupStrokes: [{ t: 'pen', p: [1, 2, 3] }],
                      _ts: now - 5000 }];
    const cloud2 = [{ id: 'ph2', caption: 'c', _markupStrokes: [], _ts: now - 40000 }];
    const snap2  = [{ id: 'ph2', caption: 'c', _markupStrokes: [], _ts: now - 40000 }];
    const out2 = hook('frt', 'photos', local2, cloud2, snap2);
    const item2 = out2 && out2.merged && out2.merged.find(p => p.id === 'ph2');
    ok('a newer LOCAL mark edit survives a cloud pull (marks are content)',
       !!item2 && Array.isArray(item2._markupStrokes) && item2._markupStrokes.length === 1);
  }
} catch (e) {
  fail++;
  console.log('  ✗ live replay could not run — ' + (e && e.message));
}

console.log('\n' + (fail ? '✗ STALEMATE: ' + fail + ' FAILED, ' + pass + ' passed'
                         : '✓ STALEMATE: all ' + pass + ' checks passed'));
process.exit(fail ? 1 : 0);
