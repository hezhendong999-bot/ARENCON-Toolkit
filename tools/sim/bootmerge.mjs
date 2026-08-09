/* bootmerge.mjs — THE APP'S OWN BOOT MERGE, ON TRIAL (Lane C)
 *
 * MARK, THREE TIMES: type a value offline, close the app fully, reopen — the
 * old number is back. Three engine fixes shipped, three field failures, and
 * every engine harness green throughout.
 *
 * WHY THOSE HARNESSES COULD NOT SEE IT. They drive the sync ENGINE. On a real
 * boot the last word belongs to the APP: diesel-app/js/part06d.js reads the
 * local IDB autosave, hands it to _mergeCloudLocal(cloud, local) along with
 * the cloud row, and applies whatever comes back. That function's own opening
 * line states its rule — "cloud is authoritative for all fields except photo
 * blobs" — and it returns `cloud`. It hand-preserves photo binaries, markup
 * vectors and sketch images, and takes every TYPED value from the cloud copy.
 * So an offline edit could be persisted, stamped, restored and re-armed
 * perfectly, and still be discarded here, one layer further out than anything
 * the engine harnesses observe. A simulated device has no _mergeCloudLocal;
 * it simply keeps its own state, which is exactly why it kept passing.
 *
 * WHAT THIS DOES. Extracts _mergeCloudLocal VERBATIM from the shipped file and
 * runs it against the two documents a real reopen produces: the cloud row
 * holding the old value, and the local autosave holding the value typed
 * offline. No re-implementation — if the shipped text changes, this tests the
 * changed text.
 *
 * Run: node tools/sim/bootmerge.mjs
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SRC  = process.env.BM_SRC || path.join(REPO, 'diesel-app/js/part06d.js');

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

/* The app reaches the entry-time law through window.ArcBootArbitrate, which
   the shared engine publishes. Import the REAL engine so the probe exercises
   the real arbitrator — not a stand-in. If the engine has not published it
   (older build), window simply lacks the function and _mergeCloudLocal
   behaves exactly as it does today, which is what the fail-first arm shows. */
const win = { };
globalThis.window = win;
globalThis.localStorage = { getItem(){return null;}, setItem(){}, removeItem(){}, key(){return null;}, length:0 };
globalThis.document = { addEventListener(){}, visibilityState:'visible' };
try { Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true }); } catch (_) {}
try {
  const mod = await import(pathToFileURL(path.resolve(REPO, 'lib/data/sync.js')).href);
  /* The arbitrator is published when the engine is INSTANTIATED, exactly as
     diesel-sync.js does at load. Instantiating with inert collaborators is the
     honest way to reach it — the probe touches no network, storage or model. */
  mod.createSync({
    toolKey: 'diesel',
    Auth: { SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_ANON_KEY: 'x', request: () => Promise.resolve(null) },
    IDB:  { get: () => Promise.resolve(null), put: () => Promise.resolve(), getAll: () => Promise.resolve([]), delete: () => Promise.resolve() },
    model: { getProject: () => ({}), setProject: () => {}, applyMerged: () => {} },
    SyncWorkerHost: { parseLarge: t => Promise.resolve(JSON.parse(t)), serializePush: p => Promise.resolve({ strippedData: p }) }
  });
} catch (e) { console.log('(engine init: ' + (e && e.message) + ')'); }

const ctx = vm.createContext({ console, JSON, Object, Array, Date, Math, String, Number, Boolean, window: win });
vm.runInContext(extractFn(fs.readFileSync(SRC, 'utf8'), '_mergeCloudLocal'), ctx);
console.log('arbitrator available: ' + (typeof win.ArcBootArbitrate === 'function') + '\n');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n           ' + detail : ''));
}

console.log('\n═══ BOOT MERGE PROBE ═══');
console.log('source: ' + SRC + '\n');

/* The two documents a real reopen produces. Cloud carries the OLD value with
   an OLD entry stamp; local carries what was typed offline, with a NEWER
   stamp — pinned at the true edit moment by the engine's offline stamping and
   restored from disk. Both are collectState-shaped. */
function docs() {
  const old = Date.now() - 600000;   // cloud value typed ten minutes ago
  const fresh = Date.now() - 60000;  // offline edit, one minute ago
  const cloud = {
    npshPsi: '200',
    proj: { 'pm-reducing': '200' },
    _fts: { _root: { npshPsi: old }, proj: { 'pm-reducing': old } }
  };
  const local = {
    npshPsi: '77',
    proj: { 'pm-reducing': '77' },
    _fts: { _root: { npshPsi: fresh }, proj: { 'pm-reducing': fresh } }
  };
  return { cloud, local, old, fresh };
}

/* 1 — MARK'S EXACT CASE ------------------------------------------------- */
console.log('1 OFFLINE-EDIT    value typed offline (newer stamp) vs cloud\'s old value');
{
  const { cloud, local } = docs();
  const merged = vm.runInContext('_mergeCloudLocal', ctx)(cloud, local);
  check('the offline edit survives the boot merge (scalar)',
        merged.npshPsi === '77',
        'boot merge produced npshPsi=' + merged.npshPsi + ', expected 77 (typed offline, newer entry time)');
  check('the offline edit survives the boot merge (proj field)',
        merged.proj && merged.proj['pm-reducing'] === '77',
        'boot merge produced pm-reducing=' + (merged.proj && merged.proj['pm-reducing']) + ', expected 77');
}

/* 2 — THE OPPOSITE CASE, which must NOT regress -------------------------- */
console.log('\n2 STALE-LOCAL     a local copy OLDER than cloud must lose (S488/S601 canon)');
{
  const { cloud, local } = docs();
  // invert the stamps: local is the stale one now
  local._fts._root.npshPsi = Date.now() - 900000;
  local._fts.proj['pm-reducing'] = Date.now() - 900000;
  const merged = vm.runInContext('_mergeCloudLocal', ctx)(cloud, local);
  check('a stale local value yields to the cloud',
        merged.npshPsi === '200' && merged.proj['pm-reducing'] === '200',
        'npshPsi=' + merged.npshPsi + ' pm-reducing=' + merged.proj['pm-reducing'] + ' (want 200)');
}

/* 3 — THE PROPERTY THIS FUNCTION EXISTS FOR, which must not break -------- */
console.log('\n3 PHOTO-RESCUE    local photo binary must still be preserved (the S488 root fix)');
{
  const cloud = { recordPhotos: [{ id: 'p1', n: 'a.jpg' }], _fts: {} };
  const local = { recordPhotos: [{ id: 'p1', n: 'a.jpg', d: 'data:image/jpeg;base64,AAA', r2Url: 'https://x/y', r2Key: 'k' }], _fts: {} };
  const merged = vm.runInContext('_mergeCloudLocal', ctx)(cloud, local);
  const p = merged.recordPhotos[0];
  check('a local-only photo binary and pointer survive',
        !!p.d && p.r2Url === 'https://x/y' && p.r2Key === 'k',
        'd=' + !!p.d + ' r2Url=' + p.r2Url + ' r2Key=' + p.r2Key);
}

const failed = results.filter(x => !x.pass);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
if (failed.length) {
  console.log('\nThis is the field failure, reproduced in code for the first time.');
  console.log('The boot merge takes every typed value from the cloud by design;');
  console.log('an offline edit cannot survive it no matter what the engine does.\n');
}
process.exit(failed.length ? 1 : 0);
