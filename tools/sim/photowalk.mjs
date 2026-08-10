/* photowalk.mjs — EVERY PASS MUST REACH EVERY SURFACE (Lane C)
 *
 * SEVEN TIMES, ONE CLASS OF DEFECT. A pass that must visit every photo surface
 * in the report visits all but one, and photos on the forgotten surface are
 * lost silently for months. The tool's own comments record five before tonight:
 *   · checklist photos keyed to a name that never existed — silent no-op, and
 *     binaries were wiped on every cloud apply
 *   · PLD flow photos had no preserve pass at all
 *   · general-deficiency photos had none either
 *   · sketches keyed to a name that never existed — silent no-op again
 *   · "fifth copy of the same body"
 * Tonight added two more: three drifting field lists in the serialiser (S636)
 * and a rescue gate that could not tell a new photo from a deleted one (S638).
 *
 * Each was fixed on its own. The SHAPE that produces them was not: the merge
 * carried NINE separate hand-written enumerations of the photo surfaces, so
 * each pass was an independent chance to forget one, and every new surface had
 * to be remembered nine times.
 *
 * WHAT THIS PROBE DOES. It builds one report holding a photo on ALL TEN
 * surfaces at once, and asserts each protection pass reaches every one of them:
 *   preserve      — the cloud strips photo bytes; local must restore them
 *   rescue        — a capture not yet pushed must survive an incoming update
 *   delete        — a deletion made elsewhere must propagate
 * A surface missed by any pass fails here loudly instead of losing photos
 * quietly. It also refuses to let the surface list itself shrink: if someone
 * removes a surface from the walk, the coverage count drops and this fails.
 *
 * FAIL-FIRST: on S638 the preserve pass misses the deficiency-response and
 * general-deficiency-response surfaces, which no probe had ever covered.
 *
 * Run: node tools/sim/photowalk.mjs
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

console.log('\n═══ PHOTO-WALK PROBE ═══');
console.log('source: ' + SRC + '\n');

let cloudKnew = {};
const win = { __arcCloudKnewPhoto: id =>
  Object.prototype.hasOwnProperty.call(cloudKnew, id) ? cloudKnew[id] : null };
const ctx = vm.createContext({
  console: { info(){}, warn(){}, log(){}, error(){} },
  JSON, Object, Array, Date, Math, String, Number, Boolean,
  window: win,
  _isPhotoDeleted: p => !!(p && (p.deleted || p.delState === 'deleted')),
  _normalizeAllPhotoDel: () => {},
  _markPhotoDeleted: p => { p.deleted = true; p.delState = 'deleted'; },
  _preserveMk: () => {},
  _assignRowPreservePhotos: () => {}
});
vm.runInContext(extractFn(fs.readFileSync(SRC, 'utf8'), '_mergeCloudLocal'), ctx);
const merge = vm.runInContext('_mergeCloudLocal', ctx);

/* THE TEN SURFACES. Every place a photo can live in a Diesel report. If a new
   one is added to the tool it belongs here, and the counts below move with it. */
const SURFACES = [
  'flowTestPhotos', 'flowTestPhotosPld', 'recordPhotos',
  'stdData row', 'pldData row', 'checklist item',
  'deficiency', 'deficiency response',
  'general deficiency', 'general deficiency response'
];

/* Build one report with a photo on every surface. `mk` decides what each photo
   looks like, so the same shape drives all three passes. */
function buildState(mk) {
  const s = {
    flowTestPhotos:    [mk('flowTestPhotos')],
    flowTestPhotosPld: [mk('flowTestPhotosPld')],
    recordPhotos:      [mk('recordPhotos')],
    stdData: [{ pct: '100%', photos: [mk('stdData row')] }],
    pldData: [{ pct: '100%', photos: [mk('pldData row')] }],
    clState: { s1_0: { status: 'yes', photos: [mk('checklist item')] } },
    deficiencies: { c1: [{ id: 'd1', photos: [mk('deficiency')],
                           responses: [{ id: 'r1', photos: [mk('deficiency response')] }] }] },
    generalDeficiencies: [{ id: 'g1', photos: [mk('general deficiency')],
                            responses: [{ id: 'gr1', photos: [mk('general deficiency response')] }] }]
  };
  return s;
}
const idFor = s => 'ph_' + s.replace(/[^a-z]/gi, '_');
/* Read a photo back out of a merged report, by surface. */
function readBack(m) {
  const out = {};
  const put = (surface, arr) => { out[surface] = (arr || [])[0] || null; };
  put('flowTestPhotos', m.flowTestPhotos);
  put('flowTestPhotosPld', m.flowTestPhotosPld);
  put('recordPhotos', m.recordPhotos);
  put('stdData row', (m.stdData || [])[0] && m.stdData[0].photos);
  put('pldData row', (m.pldData || [])[0] && m.pldData[0].photos);
  put('checklist item', m.clState && m.clState.s1_0 && m.clState.s1_0.photos);
  const d = m.deficiencies && m.deficiencies.c1 && m.deficiencies.c1[0];
  put('deficiency', d && d.photos);
  put('deficiency response', d && d.responses && d.responses[0] && d.responses[0].photos);
  const g = (m.generalDeficiencies || [])[0];
  put('general deficiency', g && g.photos);
  put('general deficiency response', g && g.responses && g.responses[0] && g.responses[0].photos);
  return out;
}
function report(missing, what) {
  return missing.length
    ? missing.length + ' of ' + SURFACES.length + ' surfaces ' + what + ': ' + missing.join(', ')
    : 'all ' + SURFACES.length + ' surfaces covered';
}

/* ══ 1 — PRESERVE: the cloud strips photo bytes; local must restore them ══ */
console.log('1 PRESERVE        photo bytes stripped by the cloud are restored on every surface');
{
  const cloud = buildState(s => ({ id: idFor(s), n: s + '.jpg' }));                  // stripped
  const local = buildState(s => ({ id: idFor(s), n: s + '.jpg',
                                   d: 'data:image/jpeg;base64,' + s,
                                   r2Key: 'k/' + s, r2Url: 'https://x/' + s, tag: 'discharge' }));
  const got = readBack(merge(cloud, local));
  const missing = SURFACES.filter(s => !got[s] || !got[s].d);
  check('the photo binary is restored on every surface', missing.length === 0,
        report(missing, 'lost their photo bytes') +
        ' — a stripped photo whose bytes are not restored renders as a broken tile ' +
        'and can be pushed back to the cloud empty.');
  const noPtr = SURFACES.filter(s => got[s] && !got[s].r2Key);
  check('the cloud address is restored on every surface', noPtr.length === 0,
        report(noPtr, 'lost their address'));
  const noTag = SURFACES.filter(s => got[s] && got[s].tag !== 'discharge');
  check('the slot tag is carried on every surface', noTag.length === 0,
        report(noTag, 'lost their slot tag') + ' (was flow-rows-only before S639)');
}

/* ══ 2 — RESCUE: a capture not yet pushed must survive an incoming update ══ */
console.log('\n2 RESCUE          an unpushed capture survives an update on every surface');
{
  const cloud = buildState(() => null);
  SURFACES.forEach(() => {});
  // strip the cloud side bare: it has the containers but no photos yet
  [cloud.flowTestPhotos, cloud.flowTestPhotosPld, cloud.recordPhotos].forEach(a => a.length = 0);
  cloud.stdData[0].photos = []; cloud.pldData[0].photos = [];
  cloud.clState.s1_0.photos = [];
  cloud.deficiencies.c1[0].photos = []; cloud.deficiencies.c1[0].responses[0].photos = [];
  cloud.generalDeficiencies[0].photos = []; cloud.generalDeficiencies[0].responses[0].photos = [];

  const local = buildState(s => ({ id: idFor(s), n: s + '.jpg',
                                   r2Key: 'k/' + s, r2Url: 'https://x/' + s, r2Status: 'uploaded' }));
  cloudKnew = {}; SURFACES.forEach(s => { cloudKnew[idFor(s)] = false; });   // never seen by the cloud
  const got = readBack(merge(cloud, local));
  const missing = SURFACES.filter(s => !got[s]);
  check('a new photo is kept on every surface', missing.length === 0,
        report(missing, 'DROPPED the capture') +
        ' — a dropped capture is pushed away for good, its bytes stranded in cloud storage.');
}

/* ══ 3 — DELETE: a deletion made elsewhere must propagate on every surface ══ */
console.log('\n3 DELETE          a deletion made on another device propagates on every surface');
{
  const when = new Date().toISOString();
  const cloud = buildState(s => ({ id: idFor(s), n: s + '.jpg' }));                        // live
  const local = buildState(s => ({ id: idFor(s), n: s + '.jpg', d: 'data:x',
                                   deleted: true, delState: 'deleted', delAt: when }));     // deleted here
  cloudKnew = {}; SURFACES.forEach(s => { cloudKnew[idFor(s)] = true; });
  const got = readBack(merge(cloud, local));
  const missing = SURFACES.filter(s => got[s] && !(got[s].deleted || got[s].delState === 'deleted'));
  check('the deletion reaches every surface', missing.length === 0,
        report(missing, 'did not receive the deletion') +
        ' — to an inspector this reads as a photo that refuses to delete.');
}

/* ══ 4 — THE SURFACE LIST CANNOT QUIETLY SHRINK ═══════════════════════════
   The passes above prove coverage of the surfaces this probe knows about. This
   asserts the walk in the SOURCE still names all of them, so removing one from
   the tool fails here rather than silently narrowing every pass at once. */
console.log('\n4 NO-SHRINK       the shared walk still names every surface');
{
  const src = fs.readFileSync(SRC, 'utf8');
  const walk = (() => { try { return extractFn(src, '_eachPhotoArray'); } catch (_) { return null; } })();
  check('the shared walk exists', !!walk,
        'no _eachPhotoArray — the passes are each carrying their own surface list again');
  if (walk) {
    const names = ['flowTestPhotos', 'flowTestPhotosPld', 'recordPhotos', 'stdData',
                   'pldData', 'clState', 'deficiencies', 'responses', 'generalDeficiencies'];
    const absent = names.filter(n => !new RegExp('\\b' + n + '\\b').test(walk));
    check('every surface is named in the one walk', absent.length === 0,
          'missing from the walk: ' + absent.join(', '));
  }
  const merged = extractFn(src, '_mergeCloudLocal');
  /* Count enumerations OUTSIDE the shared walkers. The walkers themselves name
     every surface — that is their job — so counting raw mentions would flag
     the fix. What must not exist is a PASS carrying its own list. */
  let outside = merged;
  for (const fn of ['_eachPhotoArray', '_eachPhotoPair']) {
    try { outside = outside.replace(extractFn(src, fn), ''); } catch (_) {}
  }
  const handWritten = (outside.match(/generalDeficiencies/g) || []).length;
  check('no pass re-enumerates the surfaces by hand', handWritten === 0,
        handWritten + ' mention(s) of generalDeficiencies outside the shared walkers — a pass ' +
        'carrying its own surface list is how all seven of these bugs began.');
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('\nA surface missed by one pass loses photos only in that one way,');
  console.log('which is why these took months to notice. One walk, every pass.\n');
}
process.exit(failed.length ? 1 : 0);
