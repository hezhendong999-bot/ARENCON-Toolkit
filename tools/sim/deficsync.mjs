/* deficsync.mjs — S605 teeth. A comment edited on device A must reach device B,
   whose local copy differs from the cloud ONLY by stripped photo dataURLs.
   Live: whole-object dirtiness marks B's copy locally-edited forever → keeps
   stale comment (Mark's field test). Fix: typed fields → propagates. */
import { JSDOM } from 'jsdom';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import path from 'path'; import { pathToFileURL } from 'url';
const TARGET = process.env.SIM_TARGET === 'fix' ? 'fix' : 'live';
const ROOT = TARGET === 'fix' ? '/home/claude/work2' : '/home/claude/live3';
const ROW='c6036627-3615-4dc0-bda2-bbf4c5d1c179';
const jr=b=>Promise.resolve({ok:true,status:200,headers:{get:()=>null},json:()=>Promise.resolve(b),text:()=>Promise.resolve(JSON.stringify(b))});
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://arencon.app/'});
const w=dom.window; global.window=w; global.document=w.document;
Object.defineProperty(global,'navigator',{value:w.navigator,configurable:true});
global.location=w.location; global.self=w; global.CustomEvent=w.CustomEvent; global.Event=w.Event;
global.Blob=w.Blob; global.localStorage=w.localStorage;
global.indexedDB=w.indexedDB=new FDBFactory(); global.IDBKeyRange=w.IDBKeyRange=FDBKeyRange;
/* Device B's screen: stale comment, photo WITH dataURL (cloud strips it) */
const mkDefic=(comment,ts,withD)=>({id:'d1',description:comment,status:'open',priority:'high',_ts:ts,
  photos:[{id:'ph1',n:'p.jpg',r2Key:'k',...(withD?{d:'data:image/jpeg;base64,AAAA'}:{})}],responses:[]});
const screen={deficiencies:{Acme:[mkDefic('OLD comment',1785700000000,true)]},stdData:[]};
w._collectCloudState=()=>JSON.parse(JSON.stringify(screen));
/* Cloud: device A's NEWER comment, photo stripped */
const cloud={data:{deficiencies:{Acme:[mkDefic('NEW comment from A',1785720000000,false)]},stdData:[]},
  updatedAt:'2026-08-04T02:00:00Z'};
global.fetch=w.fetch=function(url,opts){url=String(url);const m=((opts&&opts.method)||'GET').toUpperCase();
  if(url.includes('/auth/v1/user'))return jr({id:'u'});
  if(url.includes('/rest/v1/sync_diag'))return jr([{}]);
  if(url.includes('/rest/v1/projects'))return jr([{id:'p1',project_number:'1490.04'}]);
  if(url.includes('/rest/v1/tool_data')){
    if(m==='GET'&&url.includes('select=updated_at'))return jr([{updated_at:cloud.updatedAt}]);
    if(m==='GET')return jr([{id:ROW,project_id:'p1',tool_key:'diesel',instance_number:1,data:cloud.data,updated_at:cloud.updatedAt,status:'draft'}]);
    if(m==='PATCH'){
      /* Real Supabase concurrency: the engine sends If-Match on the last-seen
         updated_at; a stale precondition gets 412 and the 3-way merge runs. */
      var im=(opts.headers&&(opts.headers['If-Match']||opts.headers['if-match']))||null;
      if(im && String(im).replace(/"/g,'')!==cloud.updatedAt)
        return Promise.resolve({ok:false,status:412,headers:{get:()=>null},json:()=>Promise.resolve({}),text:()=>Promise.resolve('precondition failed')});
      try{cloud.data=JSON.parse(opts.body).data||cloud.data;}catch(_){ }
      cloud.updatedAt=new Date(Date.parse(cloud.updatedAt)+60000).toISOString();
      return jr([{id:ROW,updated_at:cloud.updatedAt}]);}}
  return jr([]);};
w.localStorage.setItem('sb-access-token','tok'); w.localStorage.setItem('sb-refresh-token','ref');
w.localStorage.setItem('arencon-device-id','sim-b'); global.DIESEL_BUILD=w.DIESEL_BUILD='SIM';
let applied=null; w._applyLoadedState=j=>{applied=JSON.parse(j); Object.assign(screen,applied);};
w._mergeCloudLocal=(c,l)=>c; w._stateHasContent=()=>true;
await import(pathToFileURL(path.join(ROOT,'diesel-sync.js')).href);
const CS=w.CloudSync;
await CS.init({toolKey:'diesel',projectId:'p1',instanceId:ROW});
CS.startAutoSave(w._collectCloudState,1e9);
await new Promise(r=>setTimeout(r,80));
/* FIELD CONDITION: B's snapshot comes from a PULL — the cloud copy with
   photos STRIPPED — while B's live collect always carries the dataURL. That
   asymmetry is what read as 'locally edited' forever on live code. */
cloud.data={deficiencies:{Acme:[mkDefic('OLD comment',1785700000000,false)]},stdData:[]};
await CS.heartbeatTick(); await new Promise(r=>setTimeout(r,150));   // pull #1: snapshot = stripped OLD
screen.deficiencies.Acme[0].photos[0].d='data:image/jpeg;base64,AAAA';  // local re-hydrates the blob (host behaviour)
cloud.data={deficiencies:{Acme:[mkDefic('NEW comment from A',1785720000000,false)]},stdData:[]};
cloud.updatedAt='2026-08-04T02:05:00Z';
await CS.heartbeatTick(); await new Promise(r=>setTimeout(r,150));
const got=screen.deficiencies.Acme[0].description;
const pass=got==='NEW comment from A';
console.log(`  ${pass?'PASS':'FAIL'}  device B receives A's newer deficiency comment  — screen now: "${got}"`);
process.exit(TARGET==='live'?(pass?9:0):(pass?0:1));
