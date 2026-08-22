/* ═══════════════════════════════════════════════════════════════════════════
   FRT SIM — PROJECT PHOTO RUNNING ORDER (S677, Lane A)
   frt/tests/sim/photonav.mjs        run: node frt/tests/sim/photonav.mjs

   Mark, S677: a photo opened from a pin, the contractor thread or the
   activity log had arrows that stopped after the two or three photos attached
   to that one spot. Only the site gallery walked the report.

   This drives the REAL Model and the REAL running order (frt/js/ui/photoNav.js)
   against a report built the way the tool builds one: contractors, pins,
   observations, a pool photo shared by two observations, thread photos on a
   contractor response and an ARENCON review, an activity-log photo, plus a
   soft-deleted photo that belongs in Recently Deleted and nowhere else.

   1  COVERAGE      every live photo in the report is reachable by the arrows
   2  NO DUPLICATE  a pool photo shared by two observations appears ONCE
   3  RIGHT PHOTO   opening from any surface opens the photo that was tapped
   4  EXCLUSION     a soft-deleted photo never enters the running order
   5  LIVE RECORDS  the viewer receives the real records, not copies —
                    a caption typed in the viewer must reach the report
   6  FALLBACK      a record outside the running order still opens, on the
                    caller's own list (never the wrong photo)
   7  ORDER         site photos first, then pin photos in report order

   On a tree without photoNav.js this reports the PRE-CHANGE reach of each
   surface instead, which is the red baseline.

   Run: node frt/tests/sim/photonav.mjs        [BASE_ROOT=<tree>]
   Deps: npm i jsdom fake-indexeddb
   ═══════════════════════════════════════════════════════════════════════════ */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path'; import { pathToFileURL } from 'url'; import fs from 'fs';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.BASE_ROOT || path.resolve(HERE, '../../..');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/?project=p1' });
const w = dom.window;
global.window = w; global.document = w.document;
Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
global.location = w.location; global.self = w;
global.CustomEvent = w.CustomEvent; global.Event = w.Event; global.Blob = w.Blob;
global.localStorage = w.localStorage;
global.indexedDB = w.indexedDB = new FDBFactory();
global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;

const { Model } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/model.js')).href);
const { IDB } = await import(pathToFileURL(path.join(ROOT, 'frt/js/data/idb.js')).href);
await IDB.init();

const results = [];
const check = (n, ok, d) => { results.push({ n, ok }); console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (!ok && d ? '\n          ' + d : '')); };

/* ── build a report the tool's own way ─────────────────────────────────── */
Model.newProject();
const proj = Model.getProject();

let pn = 0;
const photo = (tag) => ({ id: 'ph_' + (++pn), filename: tag, caption: tag, r2Key: 'k/' + tag, addedDate: '2026-08-19' });

/* site photos */
const site1 = photo('site-riser'), site2 = photo('site-fdc'), siteDead = photo('site-deleted');
siteDead.deleted = true;
proj.photos = [site1, site2, siteDead];

/* contractor → pin → two observations sharing ONE pool photo */
const ctr = Model.addContractor('Vipond');
const d1 = Model.addDeficiency(ctr.id);
const defic1 = Model.findDeficiency(d1.id || d1).defic;
Model.addObservation(defic1.id);          // second observation
const shared = photo('pin1-shared'), only1 = photo('pin1-a'), poolDead = photo('pin1-deleted');
poolDead.deleted = true;
defic1.photos = [shared, only1, poolDead];
(defic1.observations || []).forEach(o => { o.photoSelection = null; });   // both see the whole pool

/* thread photos: a contractor response and an ARENCON review */
const obs0 = defic1.observations[0];
const rect = photo('thread-rectified'), follow = photo('thread-review');
obs0.responses = [{ id: 'r1', comment: 'rectified', rectPhotos: [rect] }];
obs0.arenconReviews = [{ id: 'v1', comment: 'verified', followupPhotos: [follow] }];

/* activity-log photo */
const act = photo('activity-shot');
defic1.activity = [{ id: 'a1', photos: [act] }];

/* a second pin, so ordering across pins is observable */
const d2 = Model.addDeficiency(ctr.id);
const defic2 = Model.findDeficiency(d2.id || d2).defic;
Model.addObservation(defic2.id);
const pin2a = photo('pin2-a');
defic2.photos = [pin2a];
(defic2.observations || []).forEach(o => { o.photoSelection = null; });

const LIVE = [site1, site2, shared, only1, rect, follow, act, pin2a];
const DEAD = [siteDead, poolDead];

/* ── the module under test ─────────────────────────────────────────────── */
const navPath = path.join(ROOT, 'frt/js/ui/photoNav.js');
if (!fs.existsSync(navPath)) {
  console.log('\n  photoNav.js is not in this tree — reporting the PRE-CHANGE reach of each surface:\n');
  const reach = (label, list) => console.log('    ' + label.padEnd(26) + 'arrows reach ' + list.length +
    ' of ' + LIVE.length + ' photos');
  reach('site gallery', proj.photos.filter(p => !p.deleted));
  reach('pin card strip', Model.getEffectivePhotos(defic1, 0));
  reach('contractor thread', [rect]);
  reach('activity log', [act]);
  console.log('\nRED  every surface but the gallery stops inside its own group  (tree: ' + ROOT + ')');
  process.exit(1);
}
const { buildProjectPhotoList, openInProject } = await import(pathToFileURL(navPath).href);

/* stub the viewer: record exactly what it was handed */
let opened = null;
w._frtLightbox = { open: (photos, idx, opts) => { opened = { photos, idx, opts }; } };

/* ── 1 COVERAGE ────────────────────────────────────────────────────────── */
const order = buildProjectPhotoList();
const missing = LIVE.filter(p => order.indexOf(p) < 0).map(p => p.filename);
check('1  every live photo in the report is reachable by the arrows',
  missing.length === 0, 'unreachable: ' + missing.join(', '));

/* ── 2 NO DUPLICATE ────────────────────────────────────────────────────── */
const ids = order.map(p => p.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
check('2  a pool photo shared by two observations appears exactly once',
  dupes.length === 0 && order.length === LIVE.length,
  'length=' + order.length + ' want ' + LIVE.length + '; duplicated ids: ' + dupes.join(', '));

/* ── 3 RIGHT PHOTO from every surface ──────────────────────────────────── */
const surfaces = [
  ['site gallery',      site1,  proj.photos, 0],
  ['pin card strip',    only1,  Model.getEffectivePhotos(defic1, 0), 1],
  ['contractor thread', rect,   [rect], 0],
  ['ARENCON review',    follow, [follow], 0],
  ['activity log',      act,    [act], 0],
  ['second pin',        pin2a,  Model.getEffectivePhotos(defic2, 0), 0]
];
let wrong = [];
surfaces.forEach(([label, p, list, idx]) => {
  opened = null;
  openInProject(p, list, idx, {});
  if (!opened || opened.photos[opened.idx] !== p) wrong.push(label);
  else if (opened.photos.length !== LIVE.length) wrong.push(label + ' (reach ' + opened.photos.length + ')');
});
check('3  every surface opens the tapped photo, with the whole report either side',
  wrong.length === 0, 'wrong: ' + wrong.join(', '));

/* ── 4 EXCLUSION ───────────────────────────────────────────────────────── */
const leaked = DEAD.filter(p => order.indexOf(p) >= 0).map(p => p.filename);
check('4  a deleted photo never enters the running order (it lives in Trash)',
  leaked.length === 0, 'leaked: ' + leaked.join(', '));

/* ── 5 LIVE RECORDS ────────────────────────────────────────────────────── */
opened = null;
openInProject(rect, [rect], 0, {});
const handed = opened.photos[opened.idx];
handed.caption = 'typed in the viewer';
check('5  the viewer gets the live records — a caption typed there reaches the report',
  rect.caption === 'typed in the viewer' && handed === rect,
  'record identity broken: the viewer was handed a copy');

/* ── 6 FALLBACK ────────────────────────────────────────────────────────── */
const orphan = photo('not-in-report');
opened = null;
const ok6 = openInProject(orphan, [orphan], 0, {});
check('6  a record outside the running order still opens, on its own list',
  ok6 && opened && opened.photos.length === 1 && opened.photos[0] === orphan,
  'opened: ' + (opened ? opened.photos.length + ' photos, idx ' + opened.idx : 'nothing'));

/* ── 7 ORDER ───────────────────────────────────────────────────────────── */
const names = order.map(p => p.filename);
const siteBlock = names.slice(0, 2).join(',');
const pin2Last = names[names.length - 1] === 'pin2-a';
check('7  site photos lead, then pin photos in report order',
  siteBlock === 'site-riser,site-fdc' && pin2Last,
  'order: ' + names.join(' → '));

const fails = results.filter(r => !r.ok).length;
console.log('\n' + (fails ? 'RED' : 'GREEN') + '  ' + (results.length - fails) + '/' + results.length +
  ' checks  (tree: ' + ROOT + ')');
console.log('  running order: ' + order.map(p => p.filename).join(' → '));
process.exit(fails ? 1 : 0);
