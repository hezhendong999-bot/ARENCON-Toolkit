/* repaint.mjs — THE DATA ARRIVED; THE SCREEN WAS NEVER TOLD (Lane C)
 *
 * MARK, 10 AUG: deleting a photo on the iPhone deletes it everywhere, but the
 * tablet only shows it after a refresh. Earlier the same evening: a photo added
 * on one device needed a leave-and-reenter to appear on another, and the flow
 * card titles would not turn blue until the card was re-tapped.
 *
 * The merge was doing its job — reopening the report showed the right thing
 * every time, which is exactly what "the data arrived and the screen did not
 * repaint" looks like from the field.
 *
 * THE CAUSE was two repaint lists where there should be one:
 *   _dslRefreshPhotoSurfaces  drew the gallery, but not the flow-test thumbs
 *   the cloud-apply path      drew the flow-test thumbs, but never the gallery
 * So whichever surface an inspector happened to be looking at decided whether
 * a colleague's change appeared, and for the gallery the answer was always
 * "not until you reopen the report".
 *
 * This is the ninth and tenth instance of one shape: a list of photo surfaces
 * maintained by hand in more than one place. S636 was three field lists, S638 a
 * rescue gate, S639 nine enumerations inside the merge. Same family.
 *
 * WHAT THIS PROBE GUARDS. That there is ONE repaint list, that it names every
 * photo surface, and that the cloud-apply path calls it rather than naming
 * surfaces itself. It reads the shipped source: driving the real repaint needs
 * the whole Diesel DOM, and a probe that stubs the renderers would only be
 * testing its own stubs.
 *
 * FAIL-FIRST: checks 1 and 3 FAIL on S639.
 *
 * Run: node tools/sim/repaint.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TARGET = process.env.SIM_TARGET === 'fix' ? 'fix' : 'live';
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const LIVE  = process.env.SIM_LIVE || path.resolve(REPO, '../live');
const ROOT  = TARGET === 'fix' ? REPO : LIVE;
const C = path.join(ROOT, 'diesel-app/js/part06c.js');
const D = path.join(ROOT, 'diesel-app/js/part06d.js');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}
for (const f of [C, D]) if (!fs.existsSync(f)) { console.error('SUBJECT MISSING: ' + f); process.exit(2); }

function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(at, i);
}

console.log('\n═══ REPAINT PROBE ═══');
console.log('sources: part06c.js + part06d.js under ' + ROOT + '\n');

const srcC = fs.readFileSync(C, 'utf8');
const srcD = fs.readFileSync(D, 'utf8');
const refresh = extractFn(srcC, '_dslRefreshPhotoSurfaces');
const apply   = extractFn(srcD, '_applyLoadedState');

/* Every renderer that puts photos on screen. A photo surface whose renderer is
   missing from the one list is a surface that goes stale under an inspector. */
const RENDERERS = [
  ['renderChecklist',          'checklist item photos'],
  ['renderDeficGroups',        'deficiency photos'],
  ['renderGeneralDeficGroup',  'general deficiency / recommendation photos'],
  ['_renderRecordZones',       'site record photos'],
  ['renderFlowTestThumbs',     'flow-test thumbs'],
  ['renderFlowTestThumbsPld',  'flow-test thumbs (PLD)'],
  ['_renderPhotoGallery',      'the project photo gallery']
];

/* ══ 1 — ONE LIST, AND IT IS COMPLETE ═════════════════════════════════════ */
console.log('1 COMPLETE-LIST   the shared repaint names every photo surface');
{
  check('_dslRefreshPhotoSurfaces exists', !!refresh,
        'no shared repaint function — every caller is drawing its own set of surfaces');
  if (refresh) {
    const missing = RENDERERS.filter(([fn]) => !new RegExp('\\b' + fn + '\\b').test(refresh));
    check('every photo renderer is in the one list', missing.length === 0,
          missing.length
            ? 'absent: ' + missing.map(([fn, what]) => fn + ' (' + what + ')').join(', ') +
              ' — these surfaces go stale until the report is reopened.'
            : 'all ' + RENDERERS.length + ' renderers present');
  }
}

/* ══ 2 — AND IT STAYS OUT OF THE INPUT FIELDS ════════════════════════════
   renderStdTable / renderPldTable rebuild the flow-test input rows. Calling
   them from a lightbox action would take the caret out from under someone
   mid-entry, so they are deliberately not in this list; the cloud apply calls
   them separately, where a full rebuild is already happening. */
console.log('\n2 NO-CARET-THEFT  the shared repaint does not rebuild input rows');
{
  if (refresh) {
    const bad = ['renderStdTable', 'renderPldTable'].filter(fn => new RegExp('\\b' + fn + '\\(').test(refresh));
    check('input-row renderers stay out of the photo repaint', bad.length === 0,
          bad.join(', ') + ' is called from the photo repaint — a lightbox action would ' +
          'rebuild the flow table and could take the caret from someone typing.');
  }
}

/* ══ 3 — THE APPLY PATH USES THE LIST INSTEAD OF ITS OWN ════════════════ */
console.log('\n3 APPLY-USES-IT   the cloud apply repaints through the shared list');
{
  check('_applyLoadedState exists', !!apply, 'the apply path could not be found — did it move?');
  if (apply) {
    check('the apply calls the shared repaint',
          /_dslRefreshPhotoSurfaces/.test(apply),
          'the apply path names photo renderers itself, which is how its list drifted ' +
          'out of step with the gallery.');
    const own = RENDERERS
      .filter(([fn]) => fn !== '_renderRecordZones')     // legitimately called on its own data branch
      .filter(([fn]) => new RegExp('\\b' + fn + '\\s*\\(').test(apply));
    check('the apply does not keep its own photo-surface list', own.length === 0,
          own.length
            ? 'still named directly in the apply: ' + own.map(([fn]) => fn).join(', ') +
              ' — two lists is what produced this bug.'
            : 'no photo renderer is named directly');
  }
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('\nA surface missing from the repaint list looks exactly like a sync');
  console.log('failure to an inspector, and sends everyone hunting the merge.\n');
}
process.exit(failed.length ? 1 : 0);
