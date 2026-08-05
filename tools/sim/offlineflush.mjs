/* offlineflush.mjs — S608 teeth: work saved offline must push on the FIRST
   online beat with an UNCHANGED cloud. Live: only a cloud change dislodges it. */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const TARGET=process.env.SIM_TARGET==='fix'?'fix':'live';

/* S614 — PORTABLE ROOTS (Lane A finding: these harnesses carried absolute
   paths from the machine that wrote them and could not run anywhere else).
     SIM_TARGET=fix  → the tree this file lives in (repo root, resolved)
     SIM_TARGET=live → $SIM_LIVE, a checkout of the build you are comparing
                       against; defaults to <repo>/../live for convenience. */
const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(_HERE, '../..');
const LIVE  = process.env.SIM_LIVE || path.resolve(REPO, '../live');
const ROOT = TARGET === 'fix' ? REPO : LIVE;
const ROW='c6036627-3615-4dc0-bda2-bbf4c5d1c179';
const jr=b=>Promise.resolve({ok:true,status:200,headers:{get:()=>null},json:()=>Promise.resolve(b),text:()=>Promise.resolve(JSON.stringify(b))});
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://arencon.app/'});
const w=dom.window; global.window=w; global.document=w.document;
let online=true;
Object.defineProperty(w.navigator,'onLine',{get:()=>online,configurable:true});
Object.defineProperty(global,'navigator',{value:w.navigator,configurable:true});
global.location=w.location; global.self=w; global.CustomEvent=w.CustomEvent; global.Event=w.Event;
global.Blob=w.Blob; global.localStorage=w.localStorage;
global.indexedDB=w.indexedDB=new FDBFactory(); global.IDBKeyRange=w.IDBKeyRange=FDBKeyRange;
const cloud={data:{stdData:[{pct:'100%',discharge:'150',_ts:1785720000000}]},updatedAt:'2026-08-04T03:00:00Z'};
let patches=0;
global.fetch=w.fetch=function(url,opts){url=String(url);const m=((opts&&opts.method)||'GET').toUpperCase();
  if(!online) return Promise.reject(new Error('Failed to fetch'));
  if(url.includes('/auth/v1/user'))return jr({id:'u'});
  if(url.includes('/rest/v1/sync_diag'))return jr([{}]);
  if(url.includes('/rest/v1/projects'))return jr([{id:'p1'}]);
  if(url.includes('/rest/v1/tool_data')){
    if(m==='GET'&&url.includes('select=updated_at'))return jr([{updated_at:cloud.updatedAt}]);
    if(m==='GET')return jr([{id:ROW,project_id:'p1',tool_key:'diesel',instance_number:1,data:cloud.data,updated_at:cloud.updatedAt,status:'draft'}]);
    if(m==='PATCH'){patches++;try{cloud.data=JSON.parse(opts.body).data||cloud.data;}catch(_){ }
      cloud.updatedAt=new Date(Date.parse(cloud.updatedAt)+60000).toISOString();return jr([{id:ROW,updated_at:cloud.updatedAt}]);}}
  return jr([]);};
w.localStorage.setItem('sb-access-token','tok');w.localStorage.setItem('sb-refresh-token','ref');
w.localStorage.setItem('arencon-device-id','sim-and');global.DIESEL_BUILD=w.DIESEL_BUILD='SIM';
const screen={stdData:[{pct:'100%',discharge:'150',_ts:1785720000000}],npshPsi:'',volatile:String(Math.random())};
w._collectCloudState=()=>{screen.volatile=String(Math.random());return JSON.parse(JSON.stringify(screen));};
await import(pathToFileURL(path.join(ROOT,'diesel-sync.js')).href);
const CS=w.CloudSync;
await CS.init({toolKey:'diesel',projectId:'p1',instanceId:ROW});
CS.startAutoSave(w._collectCloudState,1e9);
await new Promise(r=>setTimeout(r,60));
await CS.heartbeatTick(); await new Promise(r=>setTimeout(r,80));   // baseline pull
/* airplane mode: edit + save locally */
online=false;
const tEdit=Date.now();
screen.stdData[0].discharge='777'; screen.stdData[0]._ts=tEdit;
screen.npshPsi='55';   /* S617 — a value the ENGINE stamps, not the screen */
await CS.save(JSON.stringify(w._collectCloudState()));
await new Promise(r=>setTimeout(r,600));   /* offline dwell: any flush-time stamp is now ≥600ms late */
const before=patches;
/* back online: cloud UNCHANGED; beats must flush without any external help */
online=true;
for(let i=0;i<4&&patches===before;i++){await CS.heartbeatTick();await new Promise(r=>setTimeout(r,150));}
const cd=cloud.data&&cloud.data.stdData&&cloud.data.stdData[0]&&cloud.data.stdData[0].discharge;
const pass=patches>before&&String(cd)==='777';
console.log(`  ${pass?'PASS':'FAIL'}  offline work pushes on the first online beat, cloud untouched  — pushes:${patches-before}, cloud:${cd}`);
/* ═══ S617 — THE STAMP MUST CARRY THE MOMENT OF THE EDIT, NOT THE FLUSH ════
   Field failure (Mark, 05 Aug): a value typed OFFLINE was stamped when it
   finally SENT, so it wrongly beat a value another device typed later. The
   engine's stamping pass only ran on the online push path; the offline branch
   exited before it, so the edit's true time was never recorded. The value
   above was typed at tEdit and sent ≥600ms later — a stamp within 250ms of
   tEdit can only have been minted at edit time. */
const rootFts=cloud.data&&cloud.data._fts&&cloud.data._fts._root||{};
const stampAge=(rootFts.npshPsi||0)-tEdit;
const pass2=rootFts.npshPsi>0&&stampAge>=0&&stampAge<250;
console.log(`  ${pass2?'PASS':'FAIL'}  offline edit is stamped at EDIT time, not flush time  — stamp ${rootFts.npshPsi?stampAge+'ms after the edit':'MISSING'}`);
const allPass=pass&&pass2;
process.exit(TARGET==='live'?(allPass?9:0):(allPass?0:1));
