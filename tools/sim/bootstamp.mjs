/* bootstamp.mjs — WHERE THE BOOT MERGE LOOKS FOR "WHEN WAS THIS TYPED" (Lane C)
 *
 * MARK, FOUR TIMES: type a value in airplane mode, close the app fully, reopen
 * with wifi — the old number is back.
 *
 * S627 added the right RULE to the reopen merge: per key, the value with the
 * newer entry time wins. bootmerge.mjs proved that rule works. It proved it by
 * handing the merge a local document that carries an `_fts` entry-time table.
 *
 * THE APP NEVER PRODUCES ONE. The document the app actually hands to
 * _mergeCloudLocal at reopen is its own IDB autosave — collectState() output —
 * and the string `_fts` does not occur anywhere in diesel-app/js. So every
 * local value arrives at the arbitration dated ZERO, the cloud's copy carries a
 * real time, and `local <= cloud` is true for every field, forever. The
 * arbitration can never take anything. That is why the revert is RELIABLE and
 * not intermittent.
 *
 * This is the same fault the engine's live merge had, found by the S619
 * recorder and fixed at S620: "localProj is collected fresh from the screen on
 * each tick, so it has no _fts ledger — the entry times are written onto the
 * copy that gets SENT and kept in _lastStampedLocal." S627 shipped without that
 * correction applied.
 *
 * WHAT THIS PROBE DOES DIFFERENTLY. It measures what Mark measures:
 *   • the local document is built the way the APP builds it — no `_fts`;
 *   • the entry time is restored the way a REOPEN restores it — through the
 *     engine's real loadIDBSnapshot, from a real syncMeta record;
 *   • the function under test is the shipped _mergeCloudLocal, extracted
 *     verbatim, calling the shipped window.ArcBootArbitrate.
 *
 * FAIL-FIRST: checks 2 and 3 FAIL on the code that is live today. Any arm whose
 * subject is missing fails loudly rather than passing silently.
 *
 * Run: node tools/sim/bootstamp.mjs
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.SIM_TARGET === 'live' && process.env.SIM_LIVE
  ? path.resolve(process.env.SIM_LIVE)
  : path.resolve(HERE, '../..');
const HOST_DIR = path.join(REPO, 'diesel-app/js');
const SRC = path.join(HOST_DIR, 'part06d.js');
const ENGINE = path.join(REPO, 'lib/data/sync.js');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

/* ── the subject must exist, and say so if it does not ─────────────────────
   S630 lesson: a fail-first arm that prints nothing is a pass in disguise.  */
if (!fs.existsSync(SRC))    { console.error('SUBJECT MISSING: ' + SRC); process.exit(2); }
if (!fs.existsSync(ENGINE)) { console.error('SUBJECT MISSING: ' + ENGINE); process.exit(2); }

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

console.log('\n═══ BOOT-STAMP PROBE ═══');
console.log('host:   ' + SRC);
console.log('engine: ' + ENGINE + '\n');

/* ══ 1 — THE FACT THE WHOLE DEFECT RESTS ON ═══════════════════════════════
   Measured against the shipped host source, not asserted from memory. If this
   ever stops being true the arbitration could read local._fts safely and this
   probe should be revisited — so it is checked, not assumed.              */
console.log('1 SAVE-FORMAT     does the app\'s own saved report carry entry times?');
{
  const hostFiles = fs.readdirSync(HOST_DIR).filter(f => f.endsWith('.js'));
  let hits = 0;
  for (const f of hostFiles) {
    const t = fs.readFileSync(path.join(HOST_DIR, f), 'utf8');
    hits += (t.match(/_fts/g) || []).length;
  }
  check('the host never writes an entry-time table into its own save (0 refs)',
        hits === 0,
        hostFiles.length + ' host files scanned, ' + hits + ' reference(s) to _fts. ' +
        'Zero means a local autosave can NEVER carry stamps — so the boot ' +
        'arbitration must read them from the engine ledger, not from the document.');
}

/* ── boot the real engine, exactly as diesel-sync.js does ─────────────────
   The syncMeta record below is what _persistSyncMeta writes when a value is
   typed offline: the ledger holds the typed value AND its true entry time.  */
const OLD   = Date.now() - 600000;   // cloud's value, typed ten minutes ago
const FRESH = Date.now() - 60000;    // the offline edit, one minute ago
const PID = 'proj-1490-04', IID = 'inst-1';

function syncMetaRecord(ledger) {
  return {
    id: 'diesel:' + PID + ':' + IID,
    updatedAt: new Date(OLD).toISOString(),
    /* An offline edit's snapshot is deliberately stripped of the unpushed
       value (the S622 honesty revert), so this is intentionally minimal —
       the case S626b exists to protect. The LEDGER is the evidence.        */
    snapshot: { npshPsi: '200', proj: { 'pm-relief': '200' } },
    ledger: ledger,
    clockOffset: 0,
    savedAt: new Date(FRESH).toISOString()
  };
}

const win = { addEventListener(){}, removeEventListener(){}, setTimeout, clearTimeout, setInterval, clearInterval, location: { href: 'http://localhost/' } };
globalThis.window = win;
globalThis.localStorage = { getItem(){return null;}, setItem(){}, removeItem(){}, key(){return null;}, length:0 };
globalThis.document = { addEventListener(){}, removeEventListener(){}, visibilityState:'visible', getElementById(){ return null; }, querySelector(){ return null; } };
try { Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true }); } catch (_) {}

let engine = null, metaRec = null;
try {
  const mod = await import(pathToFileURL(ENGINE).href);
  engine = mod.createSync({
    toolKey: 'diesel',
    Auth: { SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_ANON_KEY: 'x', request: () => Promise.resolve(null) },
    IDB: {
      get: (store, key) => Promise.resolve(store === 'syncMeta' && metaRec && metaRec.id === key ? metaRec : null),
      put: () => Promise.resolve(), getAll: () => Promise.resolve([]), delete: () => Promise.resolve()
    },
    model: { getProject: () => ({}), setProject: () => {}, applyMerged: () => {} },
    SyncWorkerHost: { parseLarge: t => Promise.resolve(JSON.parse(t)), serializePush: p => Promise.resolve({ strippedData: p }) }
  });
} catch (e) {
  console.error('ENGINE INIT FAILED: ' + (e && e.message));
  process.exit(2);
}
if (typeof win.ArcBootArbitrate !== 'function') {
  console.error('SUBJECT MISSING: the engine did not publish ArcBootArbitrate.');
  process.exit(2);
}

const ctx = vm.createContext({ console, JSON, Object, Array, Date, Math, String, Number, Boolean, window: win });
vm.runInContext(extractFn(fs.readFileSync(SRC, 'utf8'), '_mergeCloudLocal'), ctx);
const mergeCloudLocal = vm.runInContext('_mergeCloudLocal', ctx);

/* Restore the ledger the way a reopen restores it — through the real engine
   door Diesel's boot actually uses. */
async function reopenWith(ledger) {
  metaRec = syncMetaRecord(ledger);
  await engine.loadIDBSnapshot(PID, IID);
}

/* The cloud row: the old value, carrying a real entry time. */
function cloudDoc() {
  return {
    npshPsi: '200',
    proj: { 'pm-relief': '200' },
    _fts: { _root: { npshPsi: OLD }, proj: { 'pm-relief': OLD } }
  };
}
/* The local autosave, in the shape collectState() ACTUALLY produces: the
   typed value, and NO entry-time table anywhere. */
function localDoc(v) {
  return { npshPsi: v, proj: { 'pm-relief': v } };
}
/* What the engine ledger holds after an offline edit is stamped. */
function ledgerDoc(v, ts) {
  return { npshPsi: v, proj: { 'pm-relief': v },
           _fts: { _root: { npshPsi: ts }, proj: { 'pm-relief': ts } } };
}

/* ══ 2 — MARK'S EXACT CASE, WITH THE DOCUMENT THE APP REALLY HANDS OVER ══ */
console.log('\n2 OFFLINE-EDIT    77 typed in airplane mode, app closed, reopened online');
{
  await reopenWith(ledgerDoc('77', FRESH));
  const merged = mergeCloudLocal(cloudDoc(), localDoc('77'));
  check('the offline edit survives the reopen (scalar npshPsi)',
        merged.npshPsi === '77',
        'reopen produced npshPsi=' + merged.npshPsi + ', expected 77 — ' +
        'the ledger holds 77 stamped one minute ago; the cloud holds 200 stamped ten minutes ago.');
  check('the offline edit survives the reopen (nameplate field pm-relief)',
        merged.proj && merged.proj['pm-relief'] === '77',
        'reopen produced pm-relief=' + (merged.proj && merged.proj['pm-relief']) + ', expected 77');
}

/* ══ 3 — AND THE WINNER'S OWN TIME MUST TRAVEL WITH IT ═══════════════════
   Stamp conservation (law A1). A value that wins wearing the loser's time is
   the exact fault that produced the whole scalar-loss family.              */
console.log('\n3 STAMP-TRAVELS   the surviving value carries its own entry time forward');
{
  await reopenWith(ledgerDoc('77', FRESH));
  const merged = mergeCloudLocal(cloudDoc(), localDoc('77'));
  const gotRoot = merged._fts && merged._fts._root && merged._fts._root.npshPsi;
  check('the kept value carries the ledger\'s entry time, not the cloud\'s',
        gotRoot === FRESH,
        'merged stamp=' + gotRoot + ', expected ' + FRESH + ' (cloud\'s was ' + OLD + ')');
}

/* ══ 4 — NEGATIVE CONTROL: A STALE DEVICE MUST STILL YIELD ═══════════════ */
console.log('\n4 STALE-LOCAL     a device holding an OLDER value must still lose (S488/S601 canon)');
{
  await reopenWith(ledgerDoc('55', Date.now() - 900000));
  const merged = mergeCloudLocal(cloudDoc(), localDoc('55'));
  check('a stale local value yields to the cloud',
        merged.npshPsi === '200' && merged.proj['pm-relief'] === '200',
        'npshPsi=' + merged.npshPsi + ' pm-relief=' + merged.proj['pm-relief'] + ' (want 200)');
}

/* ══ 5 — NEGATIVE CONTROL: NO BORROWED STAMPS ════════════════════════════
   The ledger's time belongs to the VALUE the ledger holds. If the screen has
   since moved on to a different value, that value has not been stamped yet
   and must NOT inherit the earlier entry's recency. Without this the fix
   would re-open the borrowed-stamp fault killed at S625.                   */
console.log('\n5 NO-BORROWING    a value the ledger does not hold cannot wear the ledger\'s time');
{
  await reopenWith(ledgerDoc('77', FRESH));       // ledger holds 77 @ fresh
  const merged = mergeCloudLocal(cloudDoc(), localDoc('99'));   // screen holds 99, unstamped
  check('an unstamped local value does not borrow the ledger\'s stamp',
        merged.npshPsi === '200',
        'npshPsi=' + merged.npshPsi + ' — 99 was never stamped, so it must not beat the cloud here; ' +
        'it is dirty against the ledger and mints its true entry time on the next save.');
}

/* ══ 6 — BACK-COMPAT: a document that DOES carry stamps still decides itself */
console.log('\n6 DOC-STAMPS      a local document carrying its own entry times still wins on them');
{
  await reopenWith(ledgerDoc('11', Date.now() - 900000));   // ledger is stale and irrelevant here
  const local = localDoc('77');
  local._fts = { _root: { npshPsi: FRESH }, proj: { 'pm-relief': FRESH } };
  const merged = mergeCloudLocal(cloudDoc(), local);
  check('the document\'s own stamps are honoured when present',
        merged.npshPsi === '77',
        'npshPsi=' + merged.npshPsi + ' (want 77 — document stamp is newer than cloud)');
}

/* ══ 7 — THE PROPERTY THIS MERGE EXISTS FOR MUST NOT BREAK ═══════════════ */
console.log('\n7 PHOTO-RESCUE    a local-only photo binary must still be preserved (S488 root fix)');
{
  const cloud = { recordPhotos: [{ id: 'p1', n: 'a.jpg' }], _fts: {} };
  const local = { recordPhotos: [{ id: 'p1', n: 'a.jpg', d: 'data:image/jpeg;base64,AAA', r2Url: 'https://x/y', r2Key: 'k' }] };
  const merged = mergeCloudLocal(cloud, local);
  const p = merged.recordPhotos[0];
  check('a local-only photo binary and pointer survive',
        !!p.d && p.r2Url === 'https://x/y' && p.r2Key === 'k',
        'd=' + !!p.d + ' r2Url=' + p.r2Url + ' r2Key=' + p.r2Key);
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('\nThe reopen arbitration reads entry times from the local DOCUMENT.');
  console.log('The app\'s own save has never carried them (check 1), so every local');
  console.log('value arrives dated zero and the cloud wins every field, every time.');
  console.log('Read the local time from the engine ledger — where S620 already');
  console.log('proved it lives — and only for the value the ledger actually holds.\n');
}
process.exit(failed.length ? 1 : 0);
