/* ═══════════════════════════════════════════════════════════════════════════
 * converge.mjs — S611 FULL-REPORT CONVERGENCE HARNESS.
 * Walks the merge spec ITSELF (arrays + arrayMaps + statusMaps) and, for every
 * covered family, drives the real facade+engine through four checks:
 *   P  propagation : another device's newer-stamped edit must land here
 *   K  keep-newer  : this device's newer-stamped entry must survive a pull
 *   W  no-wipe     : an empty/skeleton cloud item never erases local content
 *   G  no-ghosts   : an empty absent-from-cloud local item never unions in
 * New spec families are covered BY CONSTRUCTION — the walker reads the spec.
 * Run: SIM_TARGET=fix|live node tools/sim/converge.mjs   (live = ../live3)
 * ═════════════════════════════════════════════════════════════════════════*/
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const TARGET=process.env.SIM_TARGET==='live'?'live':'fix';
const ROOT=TARGET==='live'?path.resolve(HERE,'../../../live3'):path.resolve(HERE,'../..');
const ROW='c6036627-3615-4dc0-bda2-bbf4c5d1c179';
const T_OLD=1785700000000, T_NEW=1785790000000;

/* ── read the spec straight from the shipped engine ── */
const engineSrc=fs.readFileSync(path.join(ROOT,'lib/data/sync.js'),'utf8');
const dseg=engineSrc.slice(engineSrc.indexOf('diesel: {'),engineSrc.indexOf('electric:'));
const fam=[...dseg.matchAll(/^\s+(\w+):\s*\{\s*key:\s*'(\w+)'(?:,\s*\n?\s*fields:\s*\[([^\]]*)\])?/gm)]
  .map(m=>({name:m[1],key:m[2],fields:(m[3]||'').split(',').map(x=>x.trim().replace(/'/g,'')).filter(Boolean)}));
const amapNames=new Set([...dseg.slice(dseg.indexOf('arrayMaps')).matchAll(/^\s+(\w+):\s*\{\s*key/gm)].map(m=>m[1]));
const statusMaps=(dseg.match(/statusMaps:\s*\[([^\]]*)\]/)||[,''])[1].replace(/'/g,'').split(',').map(s=>s.trim()).filter(Boolean);

function mkItem(name,f,val,ts,extra){const o={};o[f.key||'id']=name+'-1';const tf=f.fields.length?f.fields[0]:'v';o[tf]=val;o._ts=ts;return Object.assign(o,extra||{});}
function famState(f,val,ts,extra){
  const it=mkItem(f.name,f,val,ts,extra);
  return amapNames.has(f.name)?{[f.name]:{Grp:[it]}}:{[f.name]:[it]};
}
function readVal(st,f){const c=amapNames.has(f.name)?(st[f.name]&&st[f.name].Grp)||[]:st[f.name]||[];const it=c[0];if(!it)return '∅';const tf=f.fields.length?f.fields[0]:'v';return String(it[tf]);}
function count(st,f){const c=amapNames.has(f.name)?(st[f.name]&&st[f.name].Grp)||[]:st[f.name]||[];return c.length;}

/* ── one facade instance, scriptable cloud ── */
const jr=b=>Promise.resolve({ok:true,status:200,headers:{get:()=>null},json:()=>Promise.resolve(b),text:()=>Promise.resolve(JSON.stringify(b))});
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://arencon.app/'});
const w=dom.window; global.window=w; global.document=w.document;
Object.defineProperty(global,'navigator',{value:w.navigator,configurable:true});
global.location=w.location; global.self=w; global.CustomEvent=w.CustomEvent; global.Event=w.Event;
global.Blob=w.Blob; global.localStorage=w.localStorage;
global.indexedDB=w.indexedDB=new FDBFactory(); global.IDBKeyRange=w.IDBKeyRange=FDBKeyRange;
const cloud={data:{},updatedAt:'2026-08-04T04:00:00Z'};
global.fetch=w.fetch=function(url,opts){url=String(url);const m=((opts&&opts.method)||'GET').toUpperCase();
  if(url.includes('/auth/v1/user'))return jr({id:'u'});
  if(url.includes('/rest/v1/sync_diag'))return jr([{}]);
  if(url.includes('/rest/v1/projects'))return jr([{id:'p1'}]);
  if(url.includes('/rest/v1/tool_data')){
    if(m==='GET'&&url.includes('select=updated_at'))return jr([{updated_at:cloud.updatedAt}]);
    if(m==='GET')return jr([{id:ROW,project_id:'p1',tool_key:'diesel',instance_number:1,data:cloud.data,updated_at:cloud.updatedAt,status:'draft'}]);
    if(m==='PATCH'){const im=(opts.headers&&(opts.headers['If-Match']||opts.headers['if-match']))||null;
      if(im&&String(im).replace(/"/g,'')!==cloud.updatedAt)return Promise.resolve({ok:false,status:412,headers:{get:()=>null},json:()=>Promise.resolve({}),text:()=>Promise.resolve('412')});
      try{cloud.data=JSON.parse(opts.body).data||cloud.data;}catch(_){ }
      cloud.updatedAt=new Date(Date.parse(cloud.updatedAt)+60000).toISOString();return jr([{id:ROW,updated_at:cloud.updatedAt}]);}}
  return jr([]);};
w.localStorage.setItem('sb-access-token','tok');w.localStorage.setItem('sb-refresh-token','ref');
w.localStorage.setItem('arencon-device-id','sim-cv');global.DIESEL_BUILD=w.DIESEL_BUILD='SIM';
let screen={};
w._collectCloudState=()=>JSON.parse(JSON.stringify(screen));
w._applyLoadedState=j=>{screen=JSON.parse(j);};
w._mergeCloudLocal=(c,l)=>c; w._stateHasContent=()=>true;
await import(pathToFileURL(path.join(ROOT,'diesel-sync.js')).href);
const CS=w.CloudSync;
await CS.init({toolKey:'diesel',projectId:'p1',instanceId:ROW});
CS.startAutoSave(w._collectCloudState,1e9);
await new Promise(r=>setTimeout(r,60));
const beat=async()=>{await CS.heartbeatTick();await new Promise(r=>setTimeout(r,120));};

let pass=0,fail=0,lines=[];
function chk(f,tag,ok,d){ (ok?pass++:fail++); lines.push(`  ${ok?'PASS':'FAIL'}  ${f.name.padEnd(20)} ${tag}  ${d||''}`); }

for(const f of fam){
  /* P: cloud carries a NEWER edit; screen holds the stale value */
  screen=famState(f,'stale',T_OLD); cloud.data=famState(f,'fresh',T_NEW);
  cloud.updatedAt=new Date(Date.parse(cloud.updatedAt)+60000).toISOString();
  await beat();
  chk(f,'P propagate ',readVal(screen,f)==='fresh',`got ${readVal(screen,f)}`);
  /* K: screen holds the NEWER entry; cloud is stale */
  screen=famState(f,'mine',T_NEW); cloud.data=famState(f,'old',T_OLD);
  cloud.updatedAt=new Date(Date.parse(cloud.updatedAt)+60000).toISOString();
  await beat();
  chk(f,'K keep-newer',readVal(screen,f)==='mine',`got ${readVal(screen,f)}`);
  /* W: cloud item is an unstamped SKELETON; local has real content */
  screen=famState(f,'real',T_OLD);
  cloud.data=famState(f,'',0); {const c=amapNames.has(f.name)?cloud.data[f.name].Grp[0]:cloud.data[f.name][0]; delete c._ts;}
  cloud.updatedAt=new Date(Date.parse(cloud.updatedAt)+60000).toISOString();
  await beat();
  chk(f,'W no-wipe   ',readVal(screen,f)==='real',`got ${readVal(screen,f)}`);
  /* G: local holds an empty id-less-style ghost absent from cloud */
  screen=famState(f,'',0); {const l=amapNames.has(f.name)?screen[f.name].Grp[0]:screen[f.name][0]; delete l._ts;}
  cloud.data=famState(f,'kept',T_NEW,{});
  {const c=amapNames.has(f.name)?cloud.data[f.name].Grp[0]:cloud.data[f.name][0]; c[f.key]=f.name+'-cloudonly';}
  cloud.updatedAt=new Date(Date.parse(cloud.updatedAt)+60000).toISOString();
  await beat();
  chk(f,'G no-ghost  ',count(screen,f)===1,`rows=${count(screen,f)}`);
}
/* statusMaps (sigStrokes-class): never-signed must not wipe a signature */
for(const sm of statusMaps){
  screen={[sm]:{pad1:(sm==='sigStrokes'?{s:[]}:{})}};
  cloud.data={[sm]:{pad1:(sm==='sigStrokes'?{s:[{pts:[{x:1,y:1}],w:900,h:130}],_ts:T_NEW}:{status:'yes',_ts:T_NEW})}};
  cloud.updatedAt=new Date(Date.parse(cloud.updatedAt)+60000).toISOString();
  await beat();
  const v=screen[sm]&&screen[sm].pad1;
  const ok=sm==='sigStrokes'?!!(v&&Array.isArray(v.s)&&v.s.length):!!(v&&v.status==='yes');
  chk({name:sm},'W no-wipe   ',ok,'');
}
/* ═══ DOOR A2 — THE RECONCILIATION RULES, TESTED DIRECTLY (S616) ═══════════
 * Door A above proves the OUTCOME through the whole facade. These three prove
 * the RULE, so a later change cannot quietly reintroduce the fault while the
 * outcome still happens to look right. The decisive assertion is "no conflict
 * emitted": every conflict that reaches the list is handed to the cloud by the
 * tools' auto-resolver, so emitting one for a blank IS the wipe.
 * ═════════════════════════════════════════════════════════════════════════*/
const M3 = w._frt_mergeDiag;
lines.push('  ── door A2: reconciliation rules, direct ──');
function a2(label, base, mine, theirs, wantVal, wantConflicts) {
  let r;
  try { r = M3.merge3(base, mine, theirs); }
  catch (e) { chk({name:'reconcile'}, label, false, 'threw: ' + (e && e.message)); return; }
  const it = (r.merged && r.merged.sketchEntries && r.merged.sketchEntries[0]) || {};
  const got = it.hasOwnProperty('comment') ? String(it.comment) : '∅';
  const nc = r.conflicts.length;
  chk({name:'reconcile'}, label, got === wantVal && nc === wantConflicts,
      `val=${JSON.stringify(got)} conflicts=${nc}`);
}
const _row = (c, ts) => { const o = { id: 'sk-1', comment: c }; if (ts) o._ts = ts; return { sketchEntries: [o] }; };
/* 1. A blank with no entry stamp must never take a typed value, and must not
      even be offered as a question. */
a2('A2 blank-loses  ', _row('orig', T_OLD - 2), _row('real', T_OLD), _row(''), 'real', 0);
/* 2. NEGATIVE CONTROL, permanent: a genuinely newer stamped Clear MUST still
      propagate. If rule 1 is ever widened into "blank always loses", this
      check turns red. */
a2('A2 stamped-clear', _row('orig', T_OLD - 2), _row('real', T_OLD), _row('', T_NEW), '', 0);
/* 3. Absence is not a deletion event: a cloud copy that simply does not carry
      the field never removes what this device typed. */
a2('A2 absence-keeps', _row('orig', T_OLD - 2), _row('real', T_OLD), { sketchEntries: [{ id: 'sk-1' }] }, 'real', 0);

/* ═══ DOOR B — THE BACKGROUND-REFRESH MERGE, TESTED IN ISOLATION (S616) ═════
 * Every check above is decided by the 412 RECONCILIATION path, not the pull
 * merge: the autosave beat always races the bumped cloud token, the push takes
 * a 412, the 3-way merge resolves it, and by the time the pull runs the cloud
 * is content-identical and nothing is applied. Proved by negative control —
 * deliberately breaking the ghost-drop in _mergeLWW changed NOTHING above, so
 * G had no teeth and the pull merge had no coverage at all.
 * This pass drives the shipped pull merge directly (SyncEngine._lwwReplay):
 * no network, no facade, no 412. Negative controls now bite here.
 * ═════════════════════════════════════════════════════════════════════════*/
const ENG = w.SyncEngine;
lines.push('  ── door B: background-refresh merge (pull path, isolated) ──');
function bReplay(name, localV, cloudV) {
  try { return ENG._lwwReplay(name, localV, cloudV, []); }
  catch (e) { return { merged: null, err: e && e.message }; }
}
function bRead(f, merged) { return readVal({ [f.name]: merged }, f); }
function bCount(f, merged) { return count({ [f.name]: merged }, f); }
for (const f of fam) {
  let r;
  r = bReplay(f.name, famState(f,'stale',T_OLD)[f.name], famState(f,'fresh',T_NEW)[f.name]);
  chk(f,'bP propagate', bRead(f,r.merged)==='fresh', `got ${bRead(f,r.merged)}`);
  r = bReplay(f.name, famState(f,'mine',T_NEW)[f.name], famState(f,'old',T_OLD)[f.name]);
  chk(f,'bK keep-newer', bRead(f,r.merged)==='mine', `got ${bRead(f,r.merged)}`);
  {
    const cs = famState(f,'',0);
    const ci = amapNames.has(f.name)?cs[f.name].Grp[0]:cs[f.name][0]; delete ci._ts;
    r = bReplay(f.name, famState(f,'real',T_OLD)[f.name], cs[f.name]);
    chk(f,'bW no-wipe  ', bRead(f,r.merged)==='real', `got ${bRead(f,r.merged)}`);
  }
  {
    const ls = famState(f,'',0);
    const li = amapNames.has(f.name)?ls[f.name].Grp[0]:ls[f.name][0]; delete li._ts;
    const cs = famState(f,'kept',T_NEW);
    const ci = amapNames.has(f.name)?cs[f.name].Grp[0]:cs[f.name][0]; ci[f.key]=f.name+'-cloudonly';
    r = bReplay(f.name, ls[f.name], cs[f.name]);
    chk(f,'bG no-ghost ', bCount(f,r.merged)===1, `rows=${bCount(f,r.merged)}`);
  }
}
for (const sm of statusMaps) {
  const lv = { pad1: (sm==='sigStrokes'?{s:[]}:{}) };
  const cv = { pad1: (sm==='sigStrokes'?{s:[{pts:[{x:1,y:1}],w:900,h:130}],_ts:T_NEW}:{status:'yes',_ts:T_NEW}) };
  const r = bReplay(sm, lv, cv);
  const v = r.merged && r.merged.pad1;
  const ok = sm==='sigStrokes' ? !!(v&&Array.isArray(v.s)&&v.s.length) : !!(v&&v.status==='yes');
  chk({name:sm},'bW no-wipe  ', ok, '');
}

/* ═══ DOOR B2 — THE FAMILIES THE WALKER NEVER WALKED (S616) ════════════════
 * The walker read `arrays`, `arrayMaps` and `statusMaps` from the spec and
 * stopped there, so `fieldMaps`, `valueSets` and every top-level scalar had
 * no coverage at all — which is exactly why coverage_audit.py's known-gap
 * list could sit at ten for five sessions without anything going red.
 * Same construction rule as the rest: read the spec, walk what it declares.
 * ═════════════════════════════════════════════════════════════════════════*/
const scalarNames = (dseg.match(/scalars:\s*\[([^\]]*)\]/)||[,''])[1].replace(/'/g,'').split(',').map(s=>s.trim()).filter(Boolean);
const fieldMapNames = (dseg.match(/fieldMaps:\s*\[([^\]]*)\]/)||[,''])[1].replace(/'/g,'').split(',').map(s=>s.trim()).filter(Boolean);
const valueSetNames = (dseg.match(/valueSets:\s*\[([^\]]*)\]/)||[,''])[1].replace(/'/g,'').split(',').map(s=>s.trim()).filter(Boolean);
lines.push('  ── door B2: scalars, fieldMaps, valueSets ──');
/* Top-level scalars: a blank must never take a typed reading, either way round. */
for (const sc of scalarNames) {
  let r = bReplay(sc, 'real', '');
  chk({name:sc},'sW no-wipe  ', r.merged === 'real', `got ${JSON.stringify(r.merged)}`);
  r = bReplay(sc, '', 'fresh');
  chk({name:sc},'sP propagate', r.merged === 'fresh', `got ${JSON.stringify(r.merged)}`);
  /* PERMANENT NEGATIVE CONTROL: a genuinely newer stamped Clear must still
     travel. If the blank rule is ever widened into "blank always loses",
     this turns red. */
  /* S620 — REAL CONDITIONS: the screen state carries no stamps (it is
     collected fresh from the fields every tick), so the local entry time can
     only come from this device's ledger. Field-proven fault: every contested
     scalar reported a local stamp of ZERO on all three of Mark's devices, so
     newer local typing lost to any stamped cloud value. */
  r = ENG._lwwReplay(sc, 'mine-newer', 'cloud-older', undefined,
                     { cloud: { [sc]: T_OLD }, ledger: { [sc]: T_NEW } });
  chk({name:sc},'sL ledger    ', r.merged === 'mine-newer', `got ${JSON.stringify(r.merged)}`);
}
/* fieldMaps: per-key arbitration. A key this device never loaded must not
   erase the value another device typed into it. */
for (const fm of fieldMapNames) {
  let r = bReplay(fm, { k1: 'typed' }, { k1: '' });
  let v = r.merged && r.merged.k1;
  chk({name:fm},'fW no-wipe  ', v === 'typed', `got ${JSON.stringify(v)}`);
  r = bReplay(fm, { k1: 'mine' }, { k1: 'mine', k2: 'theirs' });
  v = r.merged || {};
  chk({name:fm},'fP propagate', v.k1 === 'mine' && v.k2 === 'theirs', `got ${JSON.stringify(v)}`);
}
/* valueSets: union — an entry either side holds survives. */
for (const vs of valueSetNames) {
  const r = bReplay(vs, ['local-only'], ['cloud-only']);
  const a = Array.isArray(r.merged) ? r.merged : [];
  chk({name:vs},'vU union    ', a.indexOf('local-only')>=0 && a.indexOf('cloud-only')>=0, `got ${JSON.stringify(a)}`);
}

/* ═══ DOOR B3 — THE STALEMATE RE-ARM (S616, explains the S611 mystery) ═════
 * Telemetry 04 Aug 01:02–01:04Z: `pull_decision` fired on ticks that reported
 * `no-change`, unexplained since S611. Both are true at once when this device
 * is AHEAD of the cloud: the merge rejects the cloud's stale value every tick,
 * so the merged result equals the screen and the S583 gate applies nothing —
 * while the cloud keeps the losing value. S605 re-arms the push from the
 * merge's own verdict, but only counted local wins that were DIRTY versus this
 * device's snapshot. A device holding a newer entry it already saved is not
 * dirty, so nothing re-armed, and the cloud kept the loser forever. That is
 * the deadlock S604 was named for, still open through an uncounted path.
 * ═════════════════════════════════════════════════════════════════════════*/
lines.push('  ── door B3: stalemate re-arm ──');
{
  const F = 'stdData';
  const kept = s => !!(s && (s.keptLocalDirty > 0 || s.keptLocalAbsent > 0 || s.keptLocalNewer > 0));
  /* Ahead of the cloud, clean against own snapshot → must re-arm the push. */
  let r = ENG._lwwReplay(F,
    [{ pct:'100%', discharge:'150', _ts:T_NEW }],
    [{ pct:'100%', discharge:'200', _ts:T_OLD }],
    [{ pct:'100%', discharge:'150', _ts:T_NEW }]);
  chk({name:'stalemate'},'R re-arms   ', kept(r.stats), `stats ${JSON.stringify(r.stats)}`);
  /* PERMANENT CONTROL: both sides already agree → must NOT re-arm, or every
     idle tick pushes and ten quiet windows become a push storm. */
  r = ENG._lwwReplay(F,
    [{ pct:'100%', discharge:'150', _ts:T_NEW }],
    [{ pct:'100%', discharge:'150', _ts:T_NEW }],
    [{ pct:'100%', discharge:'150', _ts:T_NEW }]);
  chk({name:'stalemate'},'R no-storm  ', !kept(r.stats), `stats ${JSON.stringify(r.stats)}`);
}

console.log(`\n=== CONVERGENCE (${TARGET.toUpperCase()}) — ${fam.length} families + ${statusMaps.length} maps ===\n`+lines.join('\n'));
console.log(`\n${pass} passed, ${fail} failed on ${TARGET.toUpperCase()}\n`);
process.exit(TARGET==='live'?0:(fail?1:0));
