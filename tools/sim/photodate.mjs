/* photodate.mjs — WHEN WAS THIS PHOTOGRAPH TAKEN (Lane C, S682)
 *
 * UNIFICATION PHASE 3, second cut. The rules deciding a photo's date have
 * moved out of diesel-app/js/part07.js into lib/data/photoDate.js.
 *
 * WHY THIS IS NOT COSMETIC. A photo's date is what puts it on the right day of
 * an inspection in a report an owner and an AHJ will read. Off by one day and
 * the record says a condition was observed on a site visit that did not
 * happen. Nothing about that failure looks like a bug on screen — the photo is
 * there, it just sits under the wrong heading.
 *
 * THREE THINGS BEING HELD IN PLACE:
 *   • the fallback chain — added date, then file date, then the timestamp
 *     inside the photo's id. The id fallback is what rescues photos arriving
 *     from another device with their dates stripped by sync, and it used to be
 *     written out twice in the same file;
 *   • EXIF dates read at NOON, because a camera gives a calendar date with no
 *     time zone and reading it as midnight moves a photo taken on the 21st
 *     onto the 20th for everyone west of UTC — which is everyone here;
 *   • every unreadable structure resolving to "no date" instead of throwing,
 *     because a photo that cannot be dated must still be usable.
 *
 * The host is pinned to the PRE-EXTRACTION source, kept as a fixture, so this
 * stays a real comparison after the host becomes a delegate.
 *
 * Run: node tools/sim/photodate.mjs   [BASE_ROOT=<tree>] */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');

const root = {};
new Function('window', 'module', fs.readFileSync(path.join(REPO, 'lib/data/photoDate.js'), 'utf8'))(root, undefined);
const M = root.PhotoDate;
if (!M) { console.error('lib/data/photoDate.js did not publish PhotoDate'); process.exit(1); }

function liftFunction(src, name) {
  const start = src.indexOf('\nfunction ' + name + '(');
  if (start < 0) return null;
  let i = src.indexOf('{', start), depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '/' && p === '*') inBlock = false; continue; }
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
    if (c === '/' && src[j + 1] === '/') { inLine = true; continue; }
    if (c === '/' && src[j + 1] === '*') { inBlock = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start + 1, j + 1); }
  }
  return null;
}

/* Pinned to the source as it stood BEFORE the extraction — after conversion the
   host delegates, and comparing a delegate to what it delegates to proves
   nothing. FIXTURE IS A HISTORICAL RECORD; never re-cut it to clear a failure. */
const PRE = path.join(HERE, 'fixtures/part07_dating_pre.txt');
const p07 = fs.existsSync(PRE)
  ? fs.readFileSync(PRE, 'utf8')
  : fs.readFileSync(path.join(REPO, 'diesel-app/js/part07.js'), 'utf8');

const HOST_FNS = ['_pgDayKey', '_pgPhotoTime', '_readExifCaptureDate', '_photoDateFromExif'];
const lifted = {};
for (const n of HOST_FNS) {
  const s = liftFunction(p07, n);
  if (!s) { console.error('could not lift host function: ' + n); process.exit(1); }
  lifted[n] = s;
}

/* A FileReader stand-in over a real ArrayBuffer, so both sides walk identical
   bytes with no browser involved. */
class FakeFileReader {
  readAsArrayBuffer(blobLike) {
    setTimeout(() => {
      try { this.onload({ target: { result: blobLike.buffer } }); }
      catch (e) { this.onerror && this.onerror(e); }
    }, 0);
  }
}
function fileOf(bytes, type) {
  const buf = new Uint8Array(bytes).buffer;
  return { type: type, buffer: buf, slice: () => ({ buffer: buf }) };
}

function makeHost() {
  const scope = {
    FileReader: FakeFileReader, DataView, Promise, Date, isNaN, parseInt,
    String, Math, Number, Object, Array
  };
  const names = Object.keys(scope);
  const body = HOST_FNS.map(n => lifted[n]).join('\n') +
    '\nreturn { dayKey:_pgDayKey, photoTime:_pgPhotoTime, exif:_readExifCaptureDate, dateFor:_photoDateFromExif };';
  return new Function(...names, body)(...names.map(k => scope[k]));
}

const norm = v => JSON.stringify(v);
let cases = 0; const bad = [];
function agree(label, a, b) {
  cases++;
  if (norm(a) !== norm(b)) bad.push(label + '\n      host: ' + norm(a) + '\n      lib : ' + norm(b));
}

console.log('\n═══ PHOTO DATING — host source vs lib/data/photoDate.js ═══');
console.log('source: ' + REPO + '\n');

/* ── 1: the fallback chain, every combination ───────────────────────────── */
let before = cases;
const ADDED = [undefined, null, '', '2026-08-21T14:30:00.000Z', 'not-a-date', 0];
const DATE = [undefined, null, '', '2026-05-02T09:05:00.000Z', 'rubbish'];
const IDS = [undefined, '', 'ph_1755800000000_abc', 'ph_123_x', 'no-timestamp-here',
             'evt_1740000000000_zz'];
const H = makeHost();
for (const a of ADDED) for (const d of DATE) for (const id of IDS) {
  const p = {};
  if (a !== undefined) p.addedDate = a;
  if (d !== undefined) p.date = d;
  if (id !== undefined) p.id = id;
  agree(`dayKey(${a}/${d}/${id})`, H.dayKey(p), M.dayKey(p));
  agree(`photoTime(${a}/${d}/${id})`, H.photoTime(p), M.photoTime(p));
}
console.log('  ' + (cases - before) + ' fallback-chain cases compared (day bucket AND tile time)');

/* ── 2: EXIF byte walking ───────────────────────────────────────────────── */
function jpegWithExif({ little = false, tag = 0x9003, dateStr = '2026:08:21 14:30:00',
                        magic = 0x45786966, soi = 0xFFD8, tiffMagic = 0x002A } = {}) {
  const b = [];
  const push16 = (v, le) => le ? b.push(v & 0xFF, v >> 8) : b.push(v >> 8, v & 0xFF);
  const push32 = (v, le) => le ? b.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF)
                               : b.push((v >>> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
  push16(soi, false);                 // SOI
  push16(0xFFE1, false);              // APP1
  push16(0, false);                   // length placeholder
  push32(magic, false);               // 'Exif'
  b.push(0, 0);                       // pad
  const tiffStart = b.length;
  push16(little ? 0x4949 : 0x4D4D, false);
  push16(tiffMagic, little);
  push32(8, little);                  // IFD0 at +8
  push16(1, little);                  // one entry
  push16(0x8769, little); push16(3, little); push32(1, little); push32(26, little);  // ExifIFD ptr
  push32(0, little);                  // next IFD
  const exifIfdOff = b.length - tiffStart;
  push16(1, little);
  push16(tag, little); push16(2, little); push32(dateStr.length + 1, little);
  /* value offset, from the TIFF header: this IFD (2 bytes of count) + one
     12-byte entry + the 4-byte next-IFD pointer. Getting this wrong makes the
     parser read zeroes and return null — which BOTH implementations would do
     identically, so the arm would pass while testing nothing. */
  push32(exifIfdOff + 2 + 12 + 4, little);
  push32(0, little);
  for (const ch of dateStr) b.push(ch.charCodeAt(0));
  b.push(0);
  return b;
}

before = cases;
const EXIF_CASES = [
  ['big-endian, DateTimeOriginal', jpegWithExif({}), 'image/jpeg'],
  ['little-endian', jpegWithExif({ little: true }), 'image/jpeg'],
  ['DateTimeDigitized fallback', jpegWithExif({ tag: 0x9004 }), 'image/jpeg'],
  ['wrong Exif magic', jpegWithExif({ magic: 0x11111111 }), 'image/jpeg'],
  ['not a JPEG header', jpegWithExif({ soi: 0x1234 }), 'image/jpeg'],
  ['bad TIFF magic', jpegWithExif({ tiffMagic: 0x1111 }), 'image/jpeg'],
  ['malformed date string', jpegWithExif({ dateStr: 'not a date at all' }), 'image/jpeg'],
  ['truncated file', [0xFF, 0xD8], 'image/jpeg'],
  ['empty file', [], 'image/jpeg'],
  ['png, not jpeg', jpegWithExif({}), 'image/png'],
  ['no type at all', jpegWithExif({}), ''],
];
for (const [label, bytes, type] of EXIF_CASES) {
  const hv = await makeHost().exif(fileOf(bytes, type));
  const mv = await M.exifCaptureDate(fileOf(bytes, type), { FileReader: FakeFileReader });
  agree('exif: ' + label, hv, mv);
}
agree('exif: null file', await makeHost().exif(null),
      await M.exifCaptureDate(null, { FileReader: FakeFileReader }));
console.log('  ' + (cases - before) + ' EXIF cases compared');

/* ── 3: THE NOON RULE. The one that silently shifts a report by a day. ──── */
before = cases;
{
  const bytes = jpegWithExif({ dateStr: '2026:08:21 23:45:00' });
  const hv = await makeHost().dateFor(fileOf(bytes, 'image/jpeg'));
  const mv = await M.dateForNewPhoto(fileOf(bytes, 'image/jpeg'), { FileReader: FakeFileReader });
  agree('a camera date becomes the same instant either way', hv, mv);
  /* Independently of the host: the stamped date must still read as the 21st
     in local time. Reading EXIF at midnight is what breaks this. */
  const localDay = new Date(mv).toLocaleDateString('en-CA');
  agree('a photo taken on the 21st is still filed on the 21st', '2026-08-21', localDay);
  const p = { addedDate: mv };
  agree('...and lands in that day\'s bucket', '2026-08-21',
        new Date(M.dayKey(p).ts).toLocaleDateString('en-CA'));
}
console.log('  ' + (cases - before) + ' noon-rule assertions');

/* ── 4: the delegation must stay wired ──────────────────────────────────── */
before = cases;
{
  const liveSrc = fs.readFileSync(path.join(REPO, 'diesel-app/js/part07.js'), 'utf8');
  const missing = HOST_FNS.filter(n => !liftFunction(liveSrc, n));
  agree('every dating function still exists in the host', 0, missing.length);
  if (!missing.length) {
    const notDelegating = HOST_FNS.filter(n => !/PhotoDate\./.test(liftFunction(liveSrc, n)));
    agree('every one of them delegates to the shared module', 0, notDelegating.length);
    if (notDelegating.length) bad.push('re-implemented in the host: ' + notDelegating.join(', '));
    /* The fallback chain must not be written out in the host any more — it was
       duplicated across two functions there, which is what this cut ends. */
    const chainInHost = (liveSrc.match(/_\(\\d\{10,\}\)_/g) || []).length;
    agree('the id fallback is not re-written in the host', 0, chainInHost);
  }
}
console.log('  ' + (cases - before) + ' delegation checks');

console.log('\n' + cases + ' cases compared, ' + bad.length + ' mismatches');
if (bad.length) {
  console.log('\nFIRST MISMATCHES:');
  bad.slice(0, 8).forEach(m => console.log('  ' + m));
  console.log('\nFAIL — the extraction changed when a photograph was taken\n');
  process.exit(1);
}
console.log('PASS — the module and the live host agree on every case\n');
process.exit(0);
