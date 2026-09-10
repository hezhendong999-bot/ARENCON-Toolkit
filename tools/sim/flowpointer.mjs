#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   FLOW-TEST PHOTO POINTER PROBE                    tools/sim/flowpointer.mjs
   ───────────────────────────────────────────────────────────────────────
   THE BUG THIS EXISTS TO CATCH (root-caused S722, fixed S728):

   A flow-test photo is saved in two halves: the picture goes to R2, and
   the report record keeps a note of where it went (r2Key). Six places
   could create a flow-test photo. Two of them — _pfFlowTestPld and
   _pfFlowTest — attached the cloud address at birth (the S626 pattern:
   mint → _r2EnqueuePhoto → push). FOUR did not: the two legacy camera
   branches in the global file-input handler (part06.js) and the two
   drag-and-drop handlers (part06c.js). Each did

       flowTestPhotos[Pld].push(ArcPhoto.mint(...))

   with no enqueue. The bytes still reached R2 later under an id-derived
   address; the record never learned it. On the tablet that took the
   photo everything looked fine (local copy). On any other device the
   photo was blank. The nightly sweep saw it as "no pointer, bytes
   present" — 42 of 49 such records at the S722 count.

   THE FIX: the four sites now CALL the two functions that already did it
   right. One creation path per test type. This probe holds that.

   WHAT IT ASSERTS (both tools, real source at HEAD of this checkout):
     1. Exactly ONE `flowTestPhotos.push(ArcPhoto.mint`  per tool and it
        sits inside _pfFlowTest.
     2. Exactly ONE `flowTestPhotosPld.push(ArcPhoto.mint` per tool and it
        sits inside _pfFlowTestPld.
     3. Inside each _pf* function `_r2EnqueuePhoto(` appears BEFORE the
        push (address born before the record is filed).
     4. All four former sites call the _pf* function (they still exist,
        they still route; the legacy camera branches are kept live because
        S718 could not prove them unreachable).

   RED-ARMED at S728: `git show 2b43487:diesel-app/js/part06c.js` (pre-fix)
   fails rule 2 with "2 bare mint+push sites" — the drop handler counted.

   Run:  node tools/sim/flowpointer.mjs        (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const TOOLS = ['diesel-app', 'electric-app'];

let fails = 0;
function fail(msg){ fails++; console.log('  ✗ ' + msg); }
function ok(msg){ console.log('  ✓ ' + msg); }

/* Return the source text of a top-level classic `function NAME(` body,
   brace-matched. Good enough for these one-line functions; if the shape
   changes the probe should be updated, not loosened. */
function fnBody(src, name){
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++){
    if (src[j] === '{') depth++;
    else if (src[j] === '}'){ depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

function count(src, needle){ return src.split(needle).length - 1; }

for (const tool of TOOLS){
  console.log('\n' + tool);
  const p06  = fs.readFileSync(path.join(REPO, tool, 'js/part06.js'),  'utf8');
  const p06c = fs.readFileSync(path.join(REPO, tool, 'js/part06c.js'), 'utf8');
  const all  = p06 + '\n' + p06c;

  for (const [arr, fn] of [['flowTestPhotos', '_pfFlowTest'], ['flowTestPhotosPld', '_pfFlowTestPld']]){
    const needle = arr + '.push(';
    const bare = count(all, arr + '.push(ArcPhoto.mint');
    const body = fnBody(p06c, fn);
    if (!body){ fail(fn + ' not found in part06c.js'); continue; }

    // Rule 1/2: the only place that mints straight into the array is the _pf* function.
    // (The state-restore path in part06c also pushes into these arrays, but it
    //  pushes SAVED objects, not fresh mints — that is loading, not creation.)
    const insideFn = count(body, needle);
    const mints    = count(body, 'ArcPhoto.mint(');
    if (bare !== 0) fail(arr + ': ' + bare + ' bare mint+push site(s) — must be 0 (mint must go through ' + fn + ')');
    else ok(arr + ': no bare mint+push');
    if (insideFn !== 1 || mints !== 1) fail(fn + ' should mint once and push once, found mint×' + mints + ' push×' + insideFn);
    else ok(arr + ' is minted and filed by ' + fn + ' only');

    // Rule 3: enqueue before push inside the function.
    const enq = body.indexOf('_r2EnqueuePhoto(');
    const psh = body.indexOf(needle);
    if (enq < 0) fail(fn + ' never calls _r2EnqueuePhoto');
    else if (enq > psh) fail(fn + ' enqueues AFTER pushing — address must be born first');
    else ok(fn + ' enqueues before it files');
  }

  // Rule 4: the four former sites still route to the _pf* functions.
  const sites = [
    [p06,  "__flowtestpld",          '_pfFlowTestPld(f)', 'legacy PLD camera branch'],
    [p06,  "currentPhotoId === '__flowtest'", '_pfFlowTest(f)', 'legacy 3-point camera branch'],
    [p06c, 'function handleFlowTestDropPld', '_pfFlowTestPld(f)', 'PLD drop handler'],
    [p06c, 'function handleFlowTestDrop(',   '_pfFlowTest(f)',    '3-point drop handler'],
  ];
  for (const [src, anchor, call, label] of sites){
    const i = src.indexOf(anchor);
    if (i < 0){ fail(label + ': anchor not found (' + anchor + ')'); continue; }
    const window_ = src.slice(i, i + 700);
    if (window_.indexOf(call) < 0) fail(label + ' does not call ' + call);
    else ok(label + ' → ' + call);
  }
}

console.log('\n' + (fails ? 'RED — ' + fails + ' failure(s)' : 'GREEN — every flow-test photo is filed with its cloud address at birth, both tools'));
process.exit(fails ? 1 : 0);
