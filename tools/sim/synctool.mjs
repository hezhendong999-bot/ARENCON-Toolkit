#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   ONE SYNC FILE, TWO TOOLS                           tools/sim/synctool.mjs
   ───────────────────────────────────────────────────────────────────────
   S728 retired electric-app-sync.js — a byte copy of diesel-sync.js with
   the tool name changed in eleven places and kept in lockstep by hand.
   Both pump tools now load diesel-sync.js; the host declares
   `window.ARC_PUMP_TOOL = 'electric'` before the module or gets Diesel.

   THE FAILURE THIS CATCHES: the wrong identity is the worst outcome of
   this change — an Electric report saved under tool_data tool='diesel', or
   an Electric photo uploaded into photos/{pid}/diesel/. Nothing would
   error; the data would simply be filed in the other pump's drawer.

   HOW: boot the facade twice in fresh jsdom worlds — once with the host
   flag, once without — and record where init() reads tool_data from and
   what tool the sync engine was created with. Runtime truth, not a grep.
   Run as two child processes so module caches cannot bleed between them.

   Run:  node tools/sim/synctool.mjs         (exit 0 green / 1 red)
   ═══════════════════════════════════════════════════════════════════ */
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

if (process.argv[2] === '--child') {
  const wantElectric = process.argv[3] === 'electric';
  const { JSDOM } = await import('jsdom');
  const FDBFactory = (await import('fake-indexeddb/lib/FDBFactory')).default;
  const FDBKeyRange = (await import('fake-indexeddb/lib/FDBKeyRange')).default;

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://arencon.app/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  Object.defineProperty(global, 'navigator', { value: w.navigator, configurable: true });
  global.location = w.location; global.self = w; global.CustomEvent = w.CustomEvent;
  global.Event = w.Event; global.Blob = w.Blob; global.localStorage = w.localStorage;
  global.indexedDB = w.indexedDB = new FDBFactory();
  global.IDBKeyRange = w.IDBKeyRange = FDBKeyRange;
  const seen = [];
  const jsonRes = (b) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
    json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
  global.fetch = w.fetch = function (url) {
    url = String(url); seen.push(url);
    if (url.includes('/auth/v1/user')) return jsonRes({ id: 'u-sim' });
    if (url.includes('/rest/v1/projects')) return jsonRes([{ id: 'p1', project_number: '0000.00' }]);
    return jsonRes([]);
  };
  w.localStorage.setItem('sb-access-token', 'tok');
  w.localStorage.setItem('sb-refresh-token', 'ref');
  if (wantElectric) { w.ARC_PUMP_TOOL = 'electric'; global.ELECTRIC_BUILD = w.ELECTRIC_BUILD = 'ESIM'; }
  else { global.DIESEL_BUILD = w.DIESEL_BUILD = 'DSIM'; }

  await import(pathToFileURL(path.join(REPO, 'diesel-sync.js')).href);
  const CS = w.CloudSync;
  await Promise.race([CS.init({ projectId: 'p1', toolKey: wantElectric ? 'electric' : 'diesel', instanceId: null }), new Promise(r => setTimeout(r, 15000))]);
  try { await Promise.race([CS.load(), new Promise(r => setTimeout(r, 15000))]); } catch (_) {}
  const toolReads = seen.filter(u => u.includes('/rest/v1/tool_data')).map(u => (u.match(/tool_key=eq\.([a-z]+)/) || [])[1]).filter(Boolean);
  const out = {
    journalTag: (w._dslJournal && (w._dslJournal.tag || (w._dslJournal.config && w._dslJournal.config.tag))) || null,
    toolReads: [...new Set(toolReads)],
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let fails = 0;
function run(tool){
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', tool], { cwd: REPO, encoding: 'utf8', timeout: 60000 });
  const m = r.stdout.match(/\{.*\}\s*$/s);
  if (!m) { console.log('  ✗ child produced no result for', tool, '\n', (r.stderr || r.stdout).slice(-600)); fails++; return null; }
  return JSON.parse(m[0]);
}
console.log('\n═══ ONE SYNC FILE — does diesel-sync.js become Electric when the host says so? ═══');
for (const tool of ['diesel', 'electric']) {
  const res = run(tool); if (!res) continue;
  const reads = res.toolReads;
  const ok = reads.length > 0 && reads.every(t => t === tool);
  console.log(`  ${ok ? '✓' : '✗'} host=${tool === 'electric' ? "ARC_PUMP_TOOL='electric'" : '(nothing set)'} → tool_data read with tool_key=eq.${reads.join(',') || '(none)'}`);
  if (!ok) fails++;
}
console.log('\n' + (fails ? 'RED — the one facade filed a tool in the wrong drawer' : 'GREEN — Diesel by default, Electric on request, from one file'));
process.exit(fails ? 1 : 0);
