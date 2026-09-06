/* ═══ tools/sim/words_stability.mjs ══════════════════════════════════════════
   THE STABILITY TEST FOR "THE WORDS"  —  run: node tools/sim/words_stability.mjs

   LOCKED_REPORT_VERSIONING.md §17.1: "Build the stability test before the
   feature: open the same report twenty times and get the same answer every
   time."

   This probe is that test, and it has to pass in BOTH directions or it is
   worth nothing:

     PART A — TWENTY OPENS. Twenty times over, the report is put through
       everything the app does to it by itself between one look and the next:
       save stamps rewritten, previews hydrated and stripped, uploads landing
       and re-keying photo pointers, arrays coming back in a different order,
       pin coordinates re-clamped, device and session fields churning. The
       answer must be the same all twenty times. If it is not, the tool would
       mint a revision because somebody opened a report.

     PART B — RED ARM. Twenty real edits, one at a time, each to a single
       thing an inspector actually writes. Every one must move the answer. A
       digest that never changes is perfectly stable and perfectly useless —
       this half is what stops a false pass, and it is the half that catches
       an over-eager exclusion in reportWords.js.

     PART C — the small print: order independence proved directly, an
       unreadable report reads as "cannot tell" rather than "unchanged", and
       a schema mismatch does the same.

   No app, no browser, no network, no clock, no randomness — the shuffles run
   off a fixed seed so a failure here reproduces exactly.
   ═══════════════════════════════════════════════════════════════════════════ */

import { reportWords, wordsDigest, wordsCompare, WORDS_SCHEMA } from '../../frt/js/data/reportWords.js';

/* ── deterministic helpers ──────────────────────────────────────────────── */

let _seed = 20260906;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function shuffle(a) {
  if (!Array.isArray(a)) return a;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

let pass = 0, fail = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { pass++; return true; }
  fail++; failures.push(label + (detail ? ' — ' + detail : ''));
  return false;
}

/* ── the fixture: a report shaped like a real one ───────────────────────────
   One contractor with two deficiencies, one of them carrying a contractor
   thread; one site deficiency; site photos; two drawings; both signatures.  */

function fixture() {
  return {
    id: 'proj_1780000000000_1_abcd1234',
    info: {
      projectNumber: '1490.04', projectName: 'Attic Space Sprinkler Upgrade',
      client: 'Ironmount Properties Ltd.', address: '610 Sprucewood Ave',
      city: 'Mississauga', province: 'Ontario', dateOfIssue: '2026-08-28',
      scope: 'Field review of sprinkler rough-in',
      revision: 'B01', customFilename: '', dateModified: '2026-08-28T14:02:11.000Z',
      visitDate: '2026-08-21', inspectorName: 'E. Rodriguez',
      weather: 'Clear, 21C', purpose: 'Progress review',
      generalNotes: 'Second floor was not accessible at time of visit.'
    },
    status: 'issued',
    settings: { sketchesEnabled: false },
    currentFrtInstance: 2,
    nextDeficNum: 4,
    contractors: [{
      id: 'ctr_1', name: 'Northbridge Fire Protection', color: '#9C2742',
      trades: ['Sprinkler', 'Standpipe'],
      deficiencies: [
        {
          id: 'def_1', num: 1, status: 'open', priority: 'high', category: 'Sprinkler',
          isRecommendation: false, drawingId: 'dwg_1', pinX: 0.31245117, pinY: 0.68820043,
          date: '2026-08-21', notedDate: '2026-08-21', notedOnInstance: 1,
          createdBy: 'u_elvis',
          observations: [{
            id: 'obs_1', text: 'Sprinkler head obstructed by ductwork; clearance under 450 mm.',
            priority: 'high', trade: 'Sprinkler', tradeSource: 'ai', addressed: false,
            isRecommendation: false, repeatCount: 1, notedOnInstance: 1,
            notedDate: '2026-08-21', createdBy: 'u_elvis',
            photos: [
              { id: 'ph_a', caption: 'Looking north at duct', r2Key: null, r2Url: null, thumb: null, dataUrl: null },
              { id: 'ph_b', caption: '', r2Key: 'photos/x/frt/original/ph_b.jpg', r2Url: 'https://files.arencon.app/photos/x/frt/original/ph_b.jpg', thumb: 'data:image/jpeg;base64,AAAA', dataUrl: null }
            ],
            responses: [{
              id: 'r_1', round: 1, frtInstance: 1, company: 'Northbridge Fire Protection',
              date: '2026-08-25', statusReported: 'In Progress',
              text: 'Duct relocation scheduled with mechanical for week of Sept 1.',
              source: 'manual', noResponse: false, workingCopy: false, withdrawn: false,
              removed: false, replyTo: null, issuedOnInstance: 1,
              rectPhotos: [{ id: 'rph_1', caption: 'Proposed route', r2Key: null, r2Url: null }]
            }],
            followups: []
          }],
          photos: [], activity: []
        },
        {
          id: 'def_2', num: 2, status: 'closed', priority: 'low', category: 'Standpipe',
          isRecommendation: false, drawingId: 'dwg_1', pinX: 0.64, pinY: 0.41,
          date: '2026-08-21', notedDate: '2026-08-21', notedOnInstance: 1,
          observations: [{
            id: 'obs_2', text: 'Hose valve cap missing at Level 2 standpipe.',
            priority: 'low', trade: 'Standpipe', addressed: true, isRecommendation: false,
            repeatCount: 1, notedOnInstance: 1, notedDate: '2026-08-21',
            photos: [], responses: [], followups: []
          }],
          photos: [], activity: []
        }
      ]
    }],
    generalDeficiencies: [{
      id: 'def_3', num: 3, status: 'open', priority: 'low', category: '',
      isRecommendation: true, drawingId: null, pinX: null, pinY: null,
      date: '2026-08-21', notedDate: '2026-08-21', notedOnInstance: 2,
      observations: [{
        id: 'obs_3', text: 'Recommend confirming attic access hatch rating with the AHJ.',
        priority: 'low', trade: '', addressed: false, isRecommendation: true,
        repeatCount: 1, notedOnInstance: 2, notedDate: '2026-08-21',
        photos: [], responses: [], followups: []
      }],
      photos: [], activity: []
    }],
    photos: [
      { id: 'sp_1', caption: 'Main entrance', r2Key: 'photos/x/frt/original/sp_1.jpg', thumb: null },
      { id: 'sp_2', caption: '', r2Key: null, thumb: 'data:image/jpeg;base64,BBBB' },
      { id: 'sp_3', caption: 'Removed by inspector', deleted: true, r2Key: null }
    ],
    sitePhotos: [],
    drawings: [
      { id: 'dwg_1', name: 'FP-101 Level 1 Sprinkler', folder: 'Sprinkler', pages: 4 },
      { id: 'dwg_2', name: 'FP-102 Level 2 Sprinkler', folder: 'Sprinkler', pages: 4 }
    ],
    sketches: [],
    signatures: {
      sigInspectorName: 'E. Rodriguez', sigInspectorDate: '2026-08-28',
      sigInspectorData: 'data:image/png;base64,SIGA',
      sigWitnessName: '', sigWitnessDate: '', sigWitnessData: ''
    },
    created: '2026-08-21T13:00:00.000Z',
    modified: '2026-08-28T14:02:11.000Z'
  };
}

/* ── PART A — what an open does to a report all by itself ───────────────────
   Every mutation below is something the app already does without anyone
   typing a character. None of them may move the digest.                     */

function machineChurn(p, n) {
  const stamp = new Date(Date.UTC(2026, 8, 6, 12, n)).toISOString();

  /* 1. save / sync / modification stamps */
  p.modified = stamp;
  p.info.dateModified = stamp;
  p._lastSync = stamp;
  p._syncRev = n;
  p.updated_at = stamp;

  /* 2. session and device churn */
  p._deviceId = 'dev_' + n;
  p._openCount = n;
  p.currentFrtInstance = 2;
  p.nextDeficNum = 4 + (n % 2);          /* moves without a deficiency being added */
  p.status = (n % 2) ? 'issued' : 'draft';

  /* 3. contractor colour reassigned from the palette pool */
  p.contractors[0].color = (n % 2) ? '#9C2742' : '#2C7FB8';

  /* 4. every photograph: preview hydrated, stripped, upload landing, re-keyed */
  const eachPhoto = (list) => {
    if (!Array.isArray(list)) return;
    for (const ph of list) {
      if (!ph) continue;
      if (n % 3 === 0) {
        ph.thumb = 'blob:https://arencon.app/' + n + '-' + ph.id;
        ph._thumbHydrated = true;
      } else if (n % 3 === 1) {
        delete ph.thumb; delete ph._thumbHydrated;
        ph.thumbKey = 'photos/x/frt/thumb/' + ph.id + '.jpg';
        ph.thumbUrl = 'https://files.arencon.app/photos/x/frt/thumb/' + ph.id + '.jpg';
      } else {
        ph.thumb = null;
        ph.r2Key = 'photos/x/frt/original/' + ph.id + '.jpg';
        ph.r2Url = 'https://arencon-r2-worker.hezhendong999.workers.dev/photos/x/frt/original/' + ph.id + '.jpg';
        ph.dataUrl = null;
        ph.uploadedAt = stamp;
      }
    }
  };
  const walkDefics = (defics) => {
    if (!Array.isArray(defics)) return;
    for (const d of defics) {
      /* 5. pin coordinates re-clamped. Coordinates are FRACTIONS of the sheet
         (0–1) and nothing rewrites them on load today — this is the guard
         against a future path that re-derives one from device pixels, so the
         noise is IEEE round-trip scale, not a real nudge. A move an inspector
         could make is a change and is tested in Part B. */
      if (typeof d.pinX === 'number') d.pinX = Math.max(0, Math.min(1, d.pinX + (rnd() - 0.5) * 1e-9));
      if (typeof d.pinY === 'number') d.pinY = Math.max(0, Math.min(1, d.pinY + (rnd() - 0.5) * 1e-9));
      eachPhoto(d.photos);
      for (const o of (d.observations || [])) {
        eachPhoto(o.photos);
        for (const e of (o.responses || [])) eachPhoto(e.rectPhotos);
        /* 6. arrays come back in whatever order storage gave them */
        shuffle(o.responses || []);
        shuffle(o.photos || []);
      }
      shuffle(d.observations || []);
    }
    shuffle(defics);
  };
  for (const c of p.contractors) walkDefics(c.deficiencies);
  walkDefics(p.generalDeficiencies);
  eachPhoto(p.photos);
  shuffle(p.photos);
  shuffle(p.contractors);
  shuffle(p.drawings);

  /* 7. absence written three different ways */
  if (n % 2) { p.info.customFilename = null; p.sitePhotos = undefined; }
  else { p.info.customFilename = ''; p.sitePhotos = []; }

  /* 8. whitespace the app re-wraps but nobody typed */
  p.info.generalNotes = ' ' + p.info.generalNotes.trim() + (n % 2 ? '\n' : '  ');

  return p;
}

console.log('\n═══ WORDS STABILITY — schema ' + WORDS_SCHEMA + ' ═══\n');

const base = fixture();
const baseline = wordsDigest(base);
check(!!baseline && baseline.length === 16, 'A0 baseline digest is produced', baseline);
console.log('  baseline digest: ' + baseline);

console.log('\n── PART A — twenty opens ──');
let churned = clone(base);
let stable = true;
for (let n = 1; n <= 20; n++) {
  churned = machineChurn(churned, n);
  const d = wordsDigest(churned);
  if (d !== baseline) {
    stable = false;
    console.log('  open ' + n + ': ' + d + '   ← MOVED');
  }
}
check(stable, 'A1 twenty opens leave the digest unmoved');
if (stable) console.log('  20/20 opens: ' + baseline + '  (unmoved)');

/* PART B — every real edit must move it ─────────────────────────────────── */

console.log('\n── PART B — red arm: real edits must move the digest ──');

const edits = [
  ['observation text edited', p => { p.contractors[0].deficiencies[0].observations[0].text = 'Sprinkler head obstructed by ductwork; clearance under 300 mm.'; }],
  ['deficiency status open→closed', p => { p.contractors[0].deficiencies[0].status = 'closed'; }],
  ['observation priority changed', p => { p.contractors[0].deficiencies[0].observations[0].priority = 'low'; }],
  ['deficiency renumbered', p => { p.contractors[0].deficiencies[1].num = 5; }],
  ['new deficiency added', p => { p.contractors[0].deficiencies.push({ id: 'def_9', num: 4, status: 'open', priority: 'high', category: '', isRecommendation: false, drawingId: 'dwg_2', pinX: 100, pinY: 100, date: '2026-09-01', notedDate: '2026-09-01', notedOnInstance: 2, observations: [{ id: 'obs_9', text: 'New item.', priority: 'high', trade: '', addressed: false, isRecommendation: false, repeatCount: 1, photos: [], responses: [], followups: [] }], photos: [], activity: [] }); }],
  ['deficiency deleted', p => { p.contractors[0].deficiencies[1].deleted = true; }],
  ['new observation added to a deficiency', p => { p.contractors[0].deficiencies[1].observations.push({ id: 'obs_10', text: 'Second item on the same pin.', priority: 'high', trade: '', addressed: false, isRecommendation: false, repeatCount: 1, photos: [], responses: [], followups: [] }); }],
  ['photo caption changed', p => { p.contractors[0].deficiencies[0].observations[0].photos[0].caption = 'Looking south at duct'; }],
  ['photo attached', p => { p.contractors[0].deficiencies[0].observations[0].photos.push({ id: 'ph_new', caption: '', r2Key: null }); }],
  ['photo deleted', p => { p.contractors[0].deficiencies[0].observations[0].photos[1].deleted = true; }],
  ['site photo caption changed', p => { p.photos[0].caption = 'Main entrance, west side'; }],
  ['site photo added', p => { p.photos.push({ id: 'sp_9', caption: 'Roof access', r2Key: null }); }],
  ['header field edited', p => { p.info.generalNotes = 'Second floor was accessible at time of visit.'; }],
  ['inspector name changed', p => { p.info.inspectorName = 'M. He'; }],
  ['contractor renamed', p => { p.contractors[0].name = 'Northbridge Fire Protection Inc.'; }],
  ['contractor trade added', p => { p.contractors[0].trades.push('Fire Alarm'); }],
  ['contractor answer added', p => { p.contractors[0].deficiencies[0].observations[0].responses.push({ id: 'r_9', round: 2, frtInstance: 2, company: 'Northbridge Fire Protection', date: '2026-09-02', statusReported: 'Addressed', text: 'Duct relocated; clearance now compliant.', noResponse: false, workingCopy: false, withdrawn: false, removed: false, rectPhotos: [] }); }],
  ['contractor answer removed', p => { p.contractors[0].deficiencies[0].observations[0].responses[0].removed = true; }],
  ['recommendation flag toggled', p => { p.generalDeficiencies[0].observations[0].isRecommendation = false; }],
  ['pin moved', p => { p.contractors[0].deficiencies[0].pinX = 0.31345117; }],   /* ~4px on a 4000px sheet */
  ['drawing renamed', p => { p.drawings[0].name = 'FP-101 Level 1 Sprinkler (Rev 2)'; }],
  ['signature name changed', p => { p.signatures.sigInspectorName = 'M. He'; }],
  ['signature image changed', p => { p.signatures.sigInspectorData = 'data:image/png;base64,SIGB'; }],
  ['witness signature added', p => { p.signatures.sigWitnessName = 'S. Skelly'; p.signatures.sigWitnessDate = '2026-08-28'; p.signatures.sigWitnessData = 'data:image/png;base64,SIGW'; }]
];

const seen = new Map([[baseline, 'baseline']]);
for (const [label, apply] of edits) {
  const p = clone(base);
  apply(p);
  const d = wordsDigest(p);
  const moved = check(d !== baseline, 'B  ' + label + ' moves the digest', d);
  if (moved && seen.has(d)) {
    check(false, 'B  ' + label + ' collides with "' + seen.get(d) + '"', d);
  }
  seen.set(d, label);
  console.log('  ' + (d !== baseline ? '✓' : '✗ DID NOT MOVE') + '  ' + label);
}

/* PART C — the small print ──────────────────────────────────────────────── */

console.log('\n── PART C — order independence, unknowns ──');

const reversed = clone(base);
reversed.contractors[0].deficiencies.reverse();
reversed.contractors[0].deficiencies[0].observations[0].photos.reverse();
reversed.photos.reverse();
reversed.drawings.reverse();
check(wordsDigest(reversed) === baseline, 'C1 reversing every array does not move the digest');

const idsChanged = clone(base);
idsChanged.contractors[0].deficiencies[0].observations[0].id = 'obs_regenerated';
idsChanged.contractors[0].id = 'ctr_regenerated';
check(wordsDigest(idsChanged) === baseline, 'C2 an internal id being re-minted does not move the digest');

check(wordsDigest(null) === '', 'C3 an unreadable report yields no digest, not a fake one');
check(wordsCompare(base, null) === 'unknown', 'C4 no export record reads as "cannot tell"');
check(wordsCompare(base, { schema: WORDS_SCHEMA, digest: baseline }) === 'same', 'C5 matching record reads as "same"');
check(wordsCompare(base, { schema: WORDS_SCHEMA + 1, digest: baseline }) === 'unknown', 'C6 a different schema reads as "cannot tell", never "unchanged"');

const edited = clone(base);
edited.info.generalNotes = 'Changed.';
check(wordsCompare(edited, { schema: WORDS_SCHEMA, digest: baseline }) === 'changed', 'C7 an edited report reads as "changed"');

const w = reportWords(base);
const flat = JSON.stringify(w);
check(!/r2Key|r2Url|thumbUrl|thumbKey|dataUrl|blob:|_thumbHydrated|dateModified|"modified"|createdBy|tradeSource/.test(flat),
  'C8 no storage pointer, stamp or device field survives into the words');
check(!/"revision"|B01/.test(flat), 'C9 the version number is not part of the words');

/* ── result ─────────────────────────────────────────────────────────────── */

console.log('\n═══ ' + pass + ' passed, ' + fail + ' failed ═══');
if (fail) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ✗ ' + f);
  console.log('\nDo NOT wire this to the Issue button.\n');
  process.exit(1);
}
console.log('\nThe words are stable under twenty opens and move on every real edit.\n');
