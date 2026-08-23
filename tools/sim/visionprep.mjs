/* visionprep.mjs — WHAT THE AI SCAN IS FED, AND HOW ITS ANSWER IS READ
 *                                                          (Lane C, S684b)
 *
 * UNIFICATION PHASE 3, fifth cut. Both ends of the placard/nameplate scan are
 * shared now: the image normalisation that stops the vision service rejecting
 * a perfectly good photograph, and the salvage walk that finds the JSON answer
 * inside the model's prose.
 *
 * THE FAILURES THESE RULES ENCODE, all field-real:
 *   • an R2-refetched placard carried media type 'image/jpg' — not a real MIME
 *     type — and the service rejected it with a bare 400 while a fresh camera
 *     capture of the same placard sailed through. Nothing on screen said why.
 *   • an image the browser could not decode was posted anyway (S509c): 400
 *     upstream, 502 from the proxy, a cryptic error the inspector could do
 *     nothing with. Undecodable now comes back marked unreadable instead.
 *   • models often print a draft answer before the final one, so candidates
 *     are tried LAST-first; and a parse that carries none of the caller's
 *     required keys is prose that happened to be valid JSON, and is skipped.
 *
 * Held against the PRE-EXTRACTION source, kept as a fixture.
 *
 * Run: node tools/sim/visionprep.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

const root = {};
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/data/visionPrep.js'), 'utf8'))(root, undefined);
const V = root.VisionPrep;
if (!V) { console.error('lib/data/visionPrep.js did not publish VisionPrep'); process.exit(1); }

function liftFunction(src, name) {
  const start = src.indexOf('\nfunction ' + name + '(');
  if (start < 0) return null;
  let i = src.indexOf('{', start), depth = 0, inStr = null, inLine = false, inBlock = false, inRe = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '/' && p === '*') inBlock = false; continue; }
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === '/' && src[j + 1] === '/' && !inRe) { inLine = true; continue; }
    if (c === '/' && src[j + 1] === '*') { inBlock = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start + 1, j + 1); }
  }
  return null;
}

const PRE = path.join(HERE, 'fixtures/part07_vision_pre.txt');
const preSrc = fs.readFileSync(PRE, 'utf8');
const liveSrc = fs.readFileSync(path.join(REPO, 'diesel-app/js/part07.js'), 'utf8');

/* ── fakes shared by both implementations ───────────────────────────────── */
function makeFakes(decode) {
  /* decode: null = onerror; {w,h} = loads at that size */
  class FakeImage {
    set src(v) {
      this._src = v;
      setTimeout(() => {
        if (!decode) { this.onerror && this.onerror(new Error('undecodable')); return; }
        this.naturalWidth = decode.w; this.naturalHeight = decode.h;
        this.onload && this.onload();
      }, 0);
    }
  }
  const fakeDoc = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => 'data:image/jpeg;base64,REENCODED'
    })
  };
  return { Image: FakeImage, document: fakeDoc };
}

function hostSalvage() {
  const body = liftFunction(preSrc, '_salvagePlacardJson') + '\nreturn _salvagePlacardJson;';
  return new Function('JSON', 'Object', body)(JSON, Object);
}
function hostDownscale(fakes) {
  const body = liftFunction(preSrc, '_downscaleForVision') + '\nreturn _downscaleForVision;';
  return new Function('Image', 'document', 'Promise', 'Math', body)(fakes.Image, fakes.document, Promise, Math);
}

let cases = 0; const bad = [];
const norm = v => JSON.stringify(v);
function agree(label, a, b) {
  cases++;
  if (norm(a) !== norm(b)) bad.push(label + '\n      host: ' + norm(a) + '\n      lib : ' + norm(b));
}

const KEYS = ['nameplate', 'rated_flow_gpm', 'rated_pressure_psi', 'rated_speed_rpm'];

console.log('\n═══ VISION PREP — pre-extraction source vs lib/data/visionPrep.js ═══');
console.log('source: ' + REPO + '\n');

/* ── 1: salvage, over everything a model actually sends back ────────────── */
let before = cases;
{
  const H = hostSalvage();
  const SAMPLES = [
    ['plain JSON, no fences', '{"nameplate":"A","rated_flow_gpm":500}'],
    ['fenced json block', 'Here you go:\n```json\n{"rated_flow_gpm":750}\n```\nDone.'],
    ['plain fence, no language tag', '```\n{"rated_pressure_psi":125}\n```'],
    ['draft THEN final — last one wins', '```json\n{"rated_flow_gpm":1}\n```\ntext\n```json\n{"rated_flow_gpm":2}\n```'],
    ['last candidate is prose-JSON without the keys — earlier real one wins',
      '```json\n{"rated_speed_rpm":1760}\n```\n```json\n{"note":"see above"}\n```'],
    ['widest span fallback', 'The result is {"nameplate":"X","extra":{"a":1}} as requested'],
    ['broken JSON then a good one', '```json\n{oops\n```\n```json\n{"nameplate":"ok"}\n```'],
    ['no JSON at all', 'I could not read the placard, the photo is too blurry.'],
    ['valid JSON but none of the keys', '{"weather":"sunny"}'],
    ['empty string', ''],
    ['object payload with raw field', { raw: '```json\n{"rated_flow_gpm":300}\n```' }],
    ['object payload with detail field', { detail: '{"rated_speed_rpm":3550}' }],
    ['object payload with message field', { message: '{"nameplate":"B"}' }],
    ['object payload with none of those', { other: '{"nameplate":"C"}' }],
    ['null', null]
  ];
  for (const [label, payload] of SAMPLES) {
    agree('salvage: ' + label, H(payload), V.salvageJson(payload, { requiredKeys: KEYS }));
  }
}
console.log('  ' + (cases - before) + ' salvage cases compared');

/* ── 2: downscale — the decision, under every shape of input ────────────── */
before = cases;
{
  const CASES = [
    ['small, valid type — passes through untouched', { w: 800, h: 600 }, { data: 'AAA', media_type: 'image/jpeg' }],
    ['small but INVALID type — re-encoded anyway', { w: 800, h: 600 }, { data: 'AAA', media_type: 'image/jpg' }],
    ['octet-stream from R2 — re-encoded', { w: 800, h: 600 }, { data: 'AAA', media_type: 'application/octet-stream' }],
    ['too large — re-encoded', { w: 4000, h: 3000 }, { data: 'AAA', media_type: 'image/jpeg' }],
    ['undecodable — marked unreadable, never sent', null, { data: 'AAA', media_type: 'image/jpeg' }],
    ['decodes to zero size — same as a decode failure', { w: 0, h: 0 }, { data: 'AAA', media_type: 'image/jpeg' }],
    ['no data at all — passthrough', { w: 1, h: 1 }, { media_type: 'image/jpeg' }],
    ['null image — passthrough', { w: 1, h: 1 }, null]
  ];
  for (const [label, decode, img] of CASES) {
    const hv = await hostDownscale(makeFakes(decode))(img);
    const mv = await V.downscaleForVision(img, makeFakes(decode));
    agree('downscale: ' + label, hv, mv);
  }
}
console.log('  ' + (cases - before) + ' downscale decisions compared');

/* ── 3: the day grouping that moved into PhotoDate ──────────────────────── */
before = cases;
{
  const pdRoot = {};
  new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/data/photoDate.js'), 'utf8'))(pdRoot, undefined);
  const PD = pdRoot.PhotoDate;
  const scope = { _pgDayKey: (p) => PD.dayKey(p), Object, Array };
  const body = liftFunction(preSrc, '_pgGroupView') + '\nreturn _pgGroupView;';
  const H = new Function(...Object.keys(scope), body)(...Object.values(scope));
  const view = [
    { photo: { id: 'a', addedDate: '2026-08-20T10:00:00.000Z' } },
    { photo: { id: 'b', addedDate: '2026-08-21T09:00:00.000Z' } },
    { photo: { id: 'c', addedDate: '2026-08-20T15:00:00.000Z' } },
    { photo: { id: 'd' } },                                        // no date at all
    { photo: { id: 'ph_1755690000000_x' } }                        // id-timestamp only
  ];
  agree('grouping: same sections, same order, same members', H(view), PD.groupByDay(view));
  agree('grouping: newest day first', true, (() => {
    const g = PD.groupByDay(view);
    for (let i = 1; i < g.length; i++) if (g[i].ts > g[i - 1].ts) return false;
    return true;
  })());
}
console.log('  ' + (cases - before) + ' grouping cases compared');

/* ── 4: delegation wired, logic gone from the host ──────────────────────── */
before = cases;
{
  agree('salvage delegates', true, /VisionPrep\.salvageJson/.test(liveSrc));
  agree('downscale delegates', true, /VisionPrep\.downscaleForVision/.test(liveSrc));
  agree('grouping delegates', true, /PhotoDate\.groupByDay/.test(liveSrc));
  agree('the fence-walk is not re-written in the host', false, /fence\.exec/.test(liveSrc));
  agree('the re-encode is not re-written in the host', false, /toDataURL/.test(liftFunction(liveSrc, '_downscaleForVision') || ''));
  /* Diesel still owns what makes a placard result REAL — the keys stay in the
     host, because Electric's will differ. */
  agree('the placard keys stay with Diesel', true, /rated_flow_gpm/.test(liveSrc));
}
console.log('  ' + (cases - before) + ' delegation checks');

console.log('\n' + cases + ' cases, ' + bad.length + ' mismatches');
if (bad.length) {
  console.log('\nFIRST MISMATCHES:');
  bad.slice(0, 6).forEach(m => console.log('  ' + m));
  console.log('\nFAIL — the scan would feed or read differently than the field-proven path\n');
  process.exit(1);
}
console.log('PASS — same bytes sent, same answers found, same day sections\n');
process.exit(0);
