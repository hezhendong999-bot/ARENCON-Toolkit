// ══ TWO-INSPECTOR MARKUP EXERCISE (S558) ═══════════════════════════════════
// Runs standalone: `node frt/tests/unit/twoInspectorMarkup.exercise.mjs`
// Extracts the LIVE merge function from lib/data/r2.js at run time — it can
// never drift from the shipped code, because it IS the shipped code.
// Written after the worker deploy made conditional PUTs real for the first
// time; these five scenarios are the concurrency contract two inspectors on
// one drawing depend on. Exit 0 = contract holds.
// Drives the real merge function from lib/data/r2.js (extracted verbatim by
// import) through the exact sequence the field produces: two clients diverge
// from one cloud state, save in turn, each re-reading before writing (the
// read-merge-write cycle the 412 retry enforces). Asserts nothing is lost,
// deletions win, and edits keep last-writer per object.
import { readFileSync } from 'fs';

// extract the two pure functions from the live file, unmodified
const src = readFileSync(new URL('../../../lib/data/r2.js', import.meta.url),'utf8');
const normStart = src.indexOf('function _normTombs');
const normEnd = src.indexOf('\n}', normStart)+2;
const mergeStart = src.indexOf('_mergeMarkupObjects: function');
const mergeEnd = src.indexOf('\n  },', mergeStart)+4;
const consts = src.split('\n').filter(l=>l.startsWith('var _TOMBSTONE')).join('\n');
const code = consts + '\n' + src.slice(normStart, normEnd) + '\n' +
  'const R2={' + src.slice(mergeStart, mergeEnd) + '};\n';
const factory = new Function('console', code + '; return R2;');
const R2 = factory(console);

let CLOUD = { objects: [], deletedIds: [] };   // the drawing's file in R2
function save(client){  // one read-merge-write cycle, as the app does it
  const m = R2._mergeMarkupObjects(CLOUD.objects, client.objects, client.tombs, CLOUD.deletedIds);
  CLOUD = { objects: m.objects, deletedIds: m.deletedIds };
  client.objects = JSON.parse(JSON.stringify(m.objects));   // client adopts merged state
  client.tombs = [];
}
function pull(client){ client.objects = JSON.parse(JSON.stringify(CLOUD.objects)); client.tombs=[]; }
const ids = a => a.objects.map(o=>o.id).sort().join(',');
let pass=0, fail=0;
function check(name,cond){ cond?pass++:fail++; console.log((cond?'  ✓ ':'  ✗ ')+name); }

// ── Scenario 1: both draw different marks while apart ──
let ian={objects:[],tombs:[]}, stacy={objects:[],tombs:[]};
pull(ian); pull(stacy);
ian.objects.push({id:'i1',tool:'pen'},{id:'i2',tool:'text',text:'RN 2.5'});
stacy.objects.push({id:'s1',tool:'cloud'},{id:'s2',tool:'dimension'});
save(ian); save(stacy);
check('scenario 1 — all four marks survive both saves', ids(CLOUD)==='i1,i2,s1,s2');

// ── Scenario 2: Stacy deletes one of Ian's marks; Ian saves again after ──
stacy.tombs=[{id:'i1',t:Date.now()}];
stacy.objects = stacy.objects.filter(o=>o.id!=='i1');
save(stacy);
// Ian, still holding i1 locally (never saw the delete), saves:
save(ian);
check('scenario 2 — deletion sticks even against a client still holding the mark',
      !CLOUD.objects.some(o=>o.id==='i1'));
check('scenario 2 — nothing else was taken with it', ids(CLOUD)==='i2,s1,s2');

// ── Scenario 3: both edit the SAME text object while apart ──
pull(ian); pull(stacy);
ian.objects.find(o=>o.id==='i2').text='EDIT BY IAN';
stacy.objects.find(o=>o.id==='i2').text='EDIT BY STACY';
save(ian); save(stacy);   // stacy saves second → her read-merge sees ian's, local wins
check('scenario 3 — one version survives, no duplicate ids',
      CLOUD.objects.filter(o=>o.id==='i2').length===1);
check('scenario 3 — the later saver\'s edit is the survivor (documented local-wins rule)',
      CLOUD.objects.find(o=>o.id==='i2').text==='EDIT BY STACY');

// ── Scenario 4: long-offline device resurrects nothing ──
const offline={objects:JSON.parse(JSON.stringify(CLOUD.objects)),tombs:[]};
offline.objects.push({id:'i1',tool:'pen'});   // still holds the deleted mark AND re-adds it
save(offline);
check('scenario 4 — tombstone blocks resurrection from a stale device',
      !CLOUD.objects.some(o=>o.id==='i1'));

// ── Scenario 5: the 412 path — write raced, client re-reads and re-merges ──
pull(ian); pull(stacy);
ian.objects.push({id:'i9',tool:'pen'});
stacy.objects.push({id:'s9',tool:'pen'});
save(stacy);                    // stacy lands first — ian's PUT would 412 here
save(ian);                      // the retry: re-read (now includes s9), re-merge, re-put
check('scenario 5 — after the retry cycle both racing marks exist',
      CLOUD.objects.some(o=>o.id==='i9') && CLOUD.objects.some(o=>o.id==='s9'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
