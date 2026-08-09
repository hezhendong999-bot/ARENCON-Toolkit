/* photounion.mjs — THE GATE THAT SHUT ON SUCCESS (Lane C)
 *
 * MARK, 09 AUG: photo added to the 3-pt 100% row on the tablet; absent on the
 * iPhone and on the PC. Read live from the database: that row held ZERO photos
 * while the 0% row held five, every one with a valid address. The photo never
 * reached the cloud at all.
 *
 * THE MECHANISM. When a pull arrives, the host merges the cloud copy with what
 * is on screen. None of the targeted preserve passes ADD a photo the cloud copy
 * lacks — they only enrich photos present on both sides — so a capture not yet
 * pushed depends entirely on the S335 union to survive. That union's gate
 * required the photo to still hold its bytes inline AND to be not-yet-uploaded.
 * Both stop being true the instant the upload SUCCEEDS: the status flips to
 * 'uploaded' and the retire pass frees the inline copy precisely because the
 * bytes are now safe in cloud storage. The rescue window therefore closed at
 * the moment the photo became safest, and on wifi that window is a second or
 * two wide. After it, the next pull merged the photo away and the device
 * pushed the state without it — the bytes left in R2 with nothing pointing at
 * them.
 *
 * WHY THE GATE EXISTED. A photo deleted on another device is ALSO
 * uploaded-and-absent-from-cloud. Resurrecting it would undo a colleague's
 * deletion. The old code could not distinguish the two cases, so it refused
 * both — losing every new photo to protect against every stale one.
 *
 * WHAT THIS PROBE ENFORCES. Not "rescue more photos" — that alone would
 * resurrect deletes. It enforces the DISCRIMINATION: the capture the cloud has
 * never seen is kept (check 2), the photo the cloud knew and no longer has is
 * left deleted (check 3), and when this device has no snapshot to consult the
 * old conservative behaviour holds (check 4). A fix that passes 2 by
 * weakening 3 is worse than the bug.
 *
 * FAIL-FIRST: check 2 FAILS on S636.
 *
 * Run: node tools/sim/photounion.mjs
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const TARGET = process.env.SIM_TARGET === 'fix' ? 'fix' : 'live';
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const LIVE  = process.env.SIM_LIVE || path.resolve(REPO, '../live');
const ROOT  = TARGET === 'fix' ? REPO : LIVE;
const SRC   = path.join(ROOT, 'diesel-app/js/part06d.js');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}
if (!fs.existsSync(SRC)) { console.error('SUBJECT MISSING: ' + SRC); process.exit(2); }

function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error(name + ' not found — did it move?');
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(at, i);
}

console.log('\n═══ PHOTO-UNION PROBE ═══');
console.log('source: ' + SRC + '\n');

/* The host merge calls a handful of helpers that live in sibling files. They
   are irrelevant to this pass and the function guards each with try/catch, so
   they are stubbed rather than loaded — the union itself is real, verbatim. */
let cloudKnewAnswers = {};   // photo id -> true | false | null  (null = no snapshot)
const win = {
  __arcCloudKnewPhoto: function (id) {
    return Object.prototype.hasOwnProperty.call(cloudKnewAnswers, id) ? cloudKnewAnswers[id] : null;
  }
};
const ctx = vm.createContext({
  console: { info(){}, warn(){}, log(){}, error(){} },
  JSON, Object, Array, Date, Math, String, Number, Boolean,
  window: win,
  _isPhotoDeleted: p => !!(p && (p.deleted || p.delState === 'deleted')),
  _normalizeAllPhotoDel: () => {},
  _preserveMk: () => {},
  _assignRowPreservePhotos: () => {}
});
vm.runInContext(extractFn(fs.readFileSync(SRC, 'utf8'), '_mergeCloudLocal'), ctx);
const mergeCloudLocal = vm.runInContext('_mergeCloudLocal', ctx);

/* A photo that has finished uploading: bytes retired, status 'uploaded'.
   This is the ordinary steady state of a photo seconds after capture. */
function uploadedPhoto(id) {
  return { id: id, n: id + '.jpg',
           r2Key: 'photos/p/diesel/original/' + id + '.jpg',
           r2Url: 'https://files.arencon.app/photos/p/diesel/original/' + id + '.jpg',
           r2Status: 'uploaded' };
}
function rows(photosAt100) {
  return [ { pct: '0%', discharge: '10', photos: [] },
           { pct: '100%', discharge: '150', photos: photosAt100 },
           { pct: '150%', discharge: '200', photos: [] } ];
}
function rowPhotoIds(merged) {
  const r = (merged.stdData || [])[1];
  return ((r && r.photos) || []).map(p => p.id);
}

/* ══ 1 — IN-FLIGHT CAPTURE: THE CASE S335 ALREADY HANDLED ═══════════════ */
console.log('1 IN-FLIGHT       a capture still uploading survives a pull (S335, must not regress)');
{
  cloudKnewAnswers = {};
  const inflight = { id: 'ph_inflight', n: 'a.jpg', d: 'data:image/jpeg;base64,AAA', r2Status: 'pending' };
  const merged = mergeCloudLocal({ stdData: rows([]) }, { stdData: rows([inflight]) });
  check('a photo mid-upload is kept', rowPhotoIds(merged).includes('ph_inflight'),
        'row photos after merge: [' + rowPhotoIds(merged).join(', ') + ']');
}

/* ══ 2 — MARK'S CASE: THE UPLOAD FINISHED FIRST ════════════════════════ */
console.log('\n2 UPLOAD-WON-RACE the capture whose upload finished before the row was pushed');
{
  const p = uploadedPhoto('ph_new_on_tablet');
  cloudKnewAnswers = { ph_new_on_tablet: false };      // the cloud has never seen this id
  const merged = mergeCloudLocal({ stdData: rows([]) }, { stdData: rows([p]) });
  check('an uploaded photo the cloud has never seen is kept',
        rowPhotoIds(merged).includes('ph_new_on_tablet'),
        'row photos after merge: [' + rowPhotoIds(merged).join(', ') + '] — ' +
        'the upload succeeded, so the old gate treated it as ineligible and the pull merged it away. ' +
        'Its bytes are in cloud storage with nothing referencing them.');
}

/* ══ 3 — THE CONTROL THAT MATTERS MORE: A COLLEAGUE'S DELETE STANDS ════ */
console.log('\n3 REMOTE-DELETE   a photo the cloud knew and no longer has must STAY gone');
{
  const p = uploadedPhoto('ph_deleted_elsewhere');
  cloudKnewAnswers = { ph_deleted_elsewhere: true };   // it was in the last snapshot; now absent
  const merged = mergeCloudLocal({ stdData: rows([]) }, { stdData: rows([p]) });
  check('a photo removed on another device is not resurrected',
        !rowPhotoIds(merged).includes('ph_deleted_elsewhere'),
        'row photos after merge: [' + rowPhotoIds(merged).join(', ') + '] — ' +
        'resurrecting a colleague\'s deletion is worse than the bug being fixed.');
}

/* ══ 4 — NO SNAPSHOT, NO GUESSING ═════════════════════════════════════ */
console.log('\n4 UNKNOWN-STAYS-OUT  with no snapshot to consult, behave as before');
{
  const p = uploadedPhoto('ph_unknown');
  cloudKnewAnswers = { ph_unknown: null };             // device has never pulled
  const merged = mergeCloudLocal({ stdData: rows([]) }, { stdData: rows([p]) });
  check('an unanswerable case is not rescued',
        !rowPhotoIds(merged).includes('ph_unknown'),
        'not knowing whether the cloud ever saw a photo is not a licence to resurrect it');
}

/* ══ 5 — SOFT DELETE ON THIS DEVICE STILL WINS ════════════════════════ */
console.log('\n5 SOFT-DELETE     a photo deleted HERE is not re-added by the rescue (S337)');
{
  const p = uploadedPhoto('ph_soft_deleted');
  p.deleted = true; p.delState = 'deleted'; p.delAt = new Date().toISOString();
  cloudKnewAnswers = { ph_soft_deleted: false };
  const merged = mergeCloudLocal({ stdData: rows([]) }, { stdData: rows([p]) });
  check('a locally-deleted photo is not rescued',
        !rowPhotoIds(merged).includes('ph_soft_deleted'),
        'row photos after merge: [' + rowPhotoIds(merged).join(', ') + ']');
}

/* ══ 6 — THE SAME RULE ON THE TOP-LEVEL ARRAYS ════════════════════════ */
console.log('\n6 EVERY-SURFACE   the rescue covers the top-level photo arrays too');
{
  const p = uploadedPhoto('ph_flow_new');
  cloudKnewAnswers = { ph_flow_new: false };
  const merged = mergeCloudLocal({ flowTestPhotos: [] }, { flowTestPhotos: [p] });
  check('a new flow-test photo is kept',
        (merged.flowTestPhotos || []).some(x => x.id === 'ph_flow_new'),
        'flowTestPhotos after merge: [' + (merged.flowTestPhotos || []).map(x => x.id).join(', ') + ']');
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('\nA capture that is not rescued is not merely invisible elsewhere —');
  console.log('this device pushes the merged state and the photo is gone for good,');
  console.log('its bytes stranded in cloud storage with nothing referencing them.\n');
}
process.exit(failed.length ? 1 : 0);
