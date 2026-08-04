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
console.log(`\n=== CONVERGENCE (${TARGET.toUpperCase()}) — ${fam.length} families + ${statusMaps.length} maps ===\n`+lines.join('\n'));
console.log(`\n${pass} passed, ${fail} failed on ${TARGET.toUpperCase()}\n`);
process.exit(TARGET==='live'?0:(fail?1:0));
