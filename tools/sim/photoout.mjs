/* photoout.mjs — THE ADDRESS MUST SURVIVE THE SAVE (Lane C)
 *
 * LANE B, TWICE: every new flow-test photo saves with a blank pointer, and a
 * backlog of older records carries no address at all. Read live from the
 * database on 09 Aug:
 *
 *     record photos     326 saved,  0 with no address
 *     checklist photos   52 saved,  0 with no address
 *     flow-test photos   33 saved, 31 with no address
 *     flow-test PLD      25 saved, 23 with no address
 *
 * The distribution IS the diagnosis. A fault in uploading, in R2 or in the sync
 * engine could not spare 378 photos and hit 54 in exactly two arrays. What was
 * specific to those two arrays was collectState()'s three hand-written field
 * lists: recordPhotos named r2Key/r2Url/r2Status, the two flow lists did not,
 * so every save dropped the pointer on the way out. The bytes reached cloud
 * storage and the photo still displayed on the device that took it — its own
 * copy is in memory — so this was invisible until someone opened the report on
 * a second device and found the photo simply absent.
 *
 * WHAT THIS PROBE GUARDS. Not "did someone add the three missing names" — that
 * fixes today and leaves list number four to be written next year by someone
 * who forgets again. It guards the SHAPE: exactly one photo serialiser, and
 * every photo array in collectState going through it. A new photo surface
 * added by hand fails this immediately.
 *
 * It reads the shipped source rather than running collectState(), which needs
 * the whole Diesel DOM. That is a deliberate limit: this is a structural check,
 * and the behavioural evidence is the live table above.
 *
 * FAIL-FIRST: checks 1 and 2 FAIL on S635.
 *
 * Run: node tools/sim/photoout.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TARGET = process.env.SIM_TARGET === 'fix' ? 'fix' : 'live';
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const LIVE  = process.env.SIM_LIVE || path.resolve(REPO, '../live');
const ROOT  = TARGET === 'fix' ? REPO : LIVE;
const SRC   = path.join(ROOT, 'diesel-app/js/part06c.js');
/* S679 — the photo arrays are now serialised in the report BINDINGS rather
   than inline in collectState. The guarantee this probe enforces is unchanged:
   one serialiser, every array through it, pointer fields never hand-listed.
   Only its address moved, so the probe reads both files as one subject. If it
   read only the old one it would go green on an empty file, which is the
   failure mode a probe must never have. */
const SRC2  = path.join(ROOT, 'diesel-app/js/reportBindings.js');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

if (!fs.existsSync(SRC)) { console.error('SUBJECT MISSING: ' + SRC); process.exit(2); }
if (!fs.existsSync(SRC2)) { console.error('SUBJECT MISSING: ' + SRC2); process.exit(2); }
const src = fs.readFileSync(SRC, 'utf8') + '\n' + fs.readFileSync(SRC2, 'utf8');

console.log('\n═══ PHOTO-OUT PROBE ═══');
console.log('source: ' + SRC + '\n      + ' + SRC2 + '\n');

/* Every photo array collectState writes out. Adding a surface without adding
   it here is itself a gap, so the list is asserted against the source below. */
const ARRAYS = ['flowTestPhotos', 'flowTestPhotosPld', 'recordPhotos'];

/* Two shapes are accepted, because the serialiser moved but the rule did not:
   the old inline `name: name.map(...)` inside collectState, and the binding
   `collectName: function () { return name.map(...) }`. Anything else counts as
   no serialiser at all. */
function matchArray(text, arr) {
  const bound = text.match(new RegExp('collect' + arr[0].toUpperCase() + arr.slice(1) +
                                      ':\\s*function[^{]*\\{([\\s\\S]*?)\\}\\);\\s*\\}', 'm'));
  if (bound) return bound[1].replace(/\s+/g, ' ').trim();
  /* the pre-S679 inline shape; a bare `name: name,` reference is NOT a
     serialiser, so a mapping call is required before it counts */
  const inline = text.match(new RegExp('^\\s*' + arr + ':\\s*(.+\\.map\\(.+?),\\s*$', 'm'));
  return inline ? inline[1] : null;
}
const POINTER_FIELDS = ['r2Key', 'r2Url', 'r2Status'];

/* ══ 1 — EVERY PHOTO ARRAY WRITES ITS ADDRESS ═══════════════════════════ */
console.log('1 ADDRESS-SAVED   every photo array must write r2Key / r2Url / r2Status');
{
  for (const arr of ARRAYS) {
    const m = matchArray(src, arr);
    if (!m) { check(arr + ' is serialised on the way out', false, 'no serialiser found — did the key move?'); continue; }
    const line = m;
    const viaShared = /_photoOut\s*\(/.test(line);
    const namesAll = POINTER_FIELDS.every(f => new RegExp('\\b' + f + '\\b').test(line));
    check(arr + ' writes the photo\'s cloud address',
          viaShared || namesAll,
          'serialiser: ' + line.slice(0, 110) + (line.length > 110 ? '…' : '') +
          '\n           → names no pointer fields and does not use the shared serialiser, ' +
          'so every save drops the address for this array.');
  }
}

/* ══ 2 — ONE SERIALISER, NOT THREE ═════════════════════════════════════
   The duplication is the defect. Three hand-maintained ~20-field lists drift;
   that is exactly what produced this bug. */
console.log('\n2 ONE-IMPLEMENTATION  all photo arrays share a single serialiser (S478)');
{
  const usingShared = ARRAYS.filter(arr => {
    const m = matchArray(src, arr);
    return m && /_photoOut\s*\(/.test(m);
  });
  check('every photo array routes through _photoOut',
        usingShared.length === ARRAYS.length,
        usingShared.length + ' of ' + ARRAYS.length + ' use it (' +
        (ARRAYS.filter(a => !usingShared.includes(a)).join(', ') || 'none missing') +
        '). Hand-written per-array field lists are how the pointer went missing.');
  const defs = (src.match(/function _photoOut\s*\(/g) || []).length;
  check('there is exactly one _photoOut definition', defs === 1,
        'found ' + defs + ' definitions (want 1)');
}

/* ══ 3 — THE DERIVED CACHES MUST STILL NOT BE WRITTEN ══════════════════
   S372/S560: _mkDisplay is recomposited from the clean original plus mk on
   load, and _localSrc is a live object URL meaningless on another device.
   Writing either into the report bakes markup and bloats the row — the exact
   never-bake rule. A shared serialiser makes it easy to add one by accident. */
console.log('\n3 NEVER-BAKE      derived display caches stay out of the saved report');
{
  const m = src.match(/function _photoOut\s*\([\s\S]*?\n\}/);
  if (!m) { check('_photoOut body found for inspection', false, 'could not isolate the function body'); }
  else {
    const body = m[0];
    check('_mkDisplay is not written out', !/_mkDisplay/.test(body),
          '_photoOut writes _mkDisplay — baked markup would be saved into the report (S372)');
    check('_localSrc is not written out', !/_localSrc/.test(body),
          '_photoOut writes _localSrc — a live object URL that is meaningless off this device (S553)');
  }
}

/* ══ 4 — THE PER-ARRAY EXTRAS SURVIVED THE MERGE ═══════════════════════
   Collapsing three lists into one must not quietly drop the fields that were
   only ever on ONE of them: flow photos carry `tag` (which chart/equipment
   slot they belong to), record photos carry `kind` and `date`. Losing `tag`
   would scatter every flow photo out of its slot. */
console.log('\n4 EXTRAS-KEPT     per-array fields that only one array carries');
{
  const flow = matchArray(src, 'flowTestPhotos');
  const flowPld = matchArray(src, 'flowTestPhotosPld');
  const rec  = matchArray(src, 'recordPhotos');
  check('flow-test photos still carry their slot tag',
        !!flow && /\btag\b/.test(flow) && !!flowPld && /\btag\b/.test(flowPld),
        'tag missing — flow photos would lose which chart or equipment slot they belong to');
  check('record photos still carry kind and date',
        !!rec && /\bkind\b/.test(rec) && /\bdate\b/.test(rec),
        'kind/date missing — record photos would lose their category');
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('\nA photo whose address is not saved is invisible on every other');
  console.log('device, and unrecoverable if the device that took it is lost.');
  console.log('One serialiser, every array through it.\n');
}
process.exit(failed.length ? 1 : 0);
