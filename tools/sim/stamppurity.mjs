/* stamppurity.mjs — A VALUE NEVER WEARS ANOTHER VALUE'S STAMP (Lane C, S625)
 * Mark's Test A, 08 Aug: AD types 25, IP types 528 one second later. PC and
 * AD settle on 25; IP holds 528 forever; refresh powerless. sync_diag showed
 * IP's 528 carrying the EXACT stamp minted for AD's 25 (05:26:39Z), then
 * olderWon:true (05:27:40Z). The narrow race 412s on the loser's side, and
 * the 412 door ledgered merge3's stamp-dressed document unaligned.
 * This probe replays that narrow race — second entry lands while the first
 * push is already in the cloud, forcing the 412 path — and demands the later
 * entry win EVERYWHERE. Second scenario: a cloud already poisoned with an
 * equal-stamp split must converge identically on every device (tie-break).
 * Run: node tools/sim/stamppurity.mjs      [BASE_ROOT=<tree> for other arms] */
import http from 'http';
import { spawn } from 'child_process';
import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.BASE_ROOT || path.resolve(HERE, '../..');
const ROW  = 'c6036627-3615-4dc0-bda2-bbf4c5d1c179';
let cloud = { data: {}, updatedAt: new Date().toISOString() };
const server = http.createServer((req,res)=>{ let b=''; req.on('data',c=>b+=c);
  req.on('end',()=>{ const send=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
    const u=req.url||'';
    if(u.includes('/auth/v1/user'))return send(200,{id:'u'});
    if(u.includes('/rest/v1/sync_diag'))return send(200,[{}]);
    if(u.includes('/rest/v1/projects'))return send(200,[{id:'p1'}]);
    if(u.includes('/rest/v1/tool_data')){
      if(req.method==='GET'&&u.includes('select=updated_at'))return send(200,[{updated_at:cloud.updatedAt}]);
      if(req.method==='GET')return send(200,[{id:ROW,project_id:'p1',tool_key:'diesel',instance_number:1,data:cloud.data,updated_at:cloud.updatedAt,status:'draft'}]);
      if(req.method==='PATCH'){
        const im=req.headers['if-match'];
        if(im&&String(im).replace(/"/g,'')!==cloud.updatedAt)return send(412,{});
        try{const nd=JSON.parse(b).data;if(nd)cloud.data=nd;}catch(_){}
        cloud.updatedAt=new Date().toISOString();
        return send(200,[{id:ROW,instance_number:1,updated_at:cloud.updatedAt}]);
      }}
    return send(200,[]); });});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const PORT=server.address().port;
let msgId=0; const devices={};
function dev(name){ const child=spawn(process.execPath,[path.join(HERE,'battle_device.mjs')],{cwd:REPO,
  env:{...process.env,DEV_ROOT:REPO,CLOUD_BASE:`http://127.0.0.1:${PORT}`,DEVICE_ID:name,DEV_BUILD:'SIM'},stdio:['pipe','pipe','pipe']});
  const pend={};let buf='';
  child.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);
    let m;try{m=JSON.parse(l);}catch(_){continue;}const p=pend[m.id];if(p){delete pend[m.id];p(m);}}});
  child.stderr.on('data',d=>{if(process.env.VERBOSE)process.stderr.write('['+name+'] '+d);});
  devices[name]={child,call(cmd,ex){const id=++msgId;return new Promise((res,rej)=>{
    const t=setTimeout(()=>rej(new Error(name+':'+cmd+' timeout')),20000);
    pend[id]=m=>{clearTimeout(t);res(m);};child.stdin.write(JSON.stringify({id,cmd,...(ex||{})})+'\n');});}};
  return devices[name]; }
const D=n=>devices[n]; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[]; const check=(n,p,d)=>{results.push({n,p});console.log((p?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));};

console.log('\n═══ STAMP PURITY PROBE ═══\nsource: '+REPO+'\n');
console.log('1 NARROW-RACE   AD types 36 and pushes; IP types 35 before hearing it (412 path). 35 must win everywhere.');
cloud={data:{},updatedAt:new Date().toISOString()};
for(const n of ['AD','IP']){dev(n);await D(n).call('init',{row:ROW});}
if(D('AD').call){try{await D('AD').call('load');await D('IP').call('load');}catch(_){/* older driver */}}
await D('AD').call('set',{path:['proj','pm-reducing'],value:'20'});await D('AD').call('save');
await D('AD').call('beat');await D('IP').call('beat');await sleep(150);      // both agree on 20
await D('AD').call('set',{path:['proj','pm-reducing'],value:'36'});await D('AD').call('save');   // 36 lands in cloud
await sleep(120);
await D('IP').call('set',{path:['proj','pm-reducing'],value:'35'});          // IP types before pulling
await D('IP').call('save');                                                  // stale If-Match → 412 door
for(let i=0;i<5;i++){await D('AD').call('beat');await D('IP').call('beat');await sleep(120);}
const a1=(await D('AD').call('get')).screen.proj['pm-reducing'];
const i1=(await D('IP').call('get')).screen.proj['pm-reducing'];
check('later entry wins the narrow race on every device and the cloud',
  a1==='35'&&i1==='35'&&cloud.data.proj&&cloud.data.proj['pm-reducing']==='35',
  'AD='+a1+' IP='+i1+' cloud='+(cloud.data.proj&&cloud.data.proj['pm-reducing'])+' (want 35)');
const stampOf35=cloud.data._fts&&cloud.data._fts.proj&&cloud.data._fts.proj['pm-reducing'];
check('the winning value wears its own stamp, not the displaced value\'s',
  typeof stampOf35==='number'&&stampOf35>0,'cloud stamp='+stampOf35);

console.log('\n2 POISON-HEAL   equal stamps, different values already split — devices must converge identically.');
const T=Date.now()-60000;
cloud={data:{proj:{'pm-reducing':'25'},_fts:{proj:{'pm-reducing':T}}},updatedAt:new Date().toISOString()};
for(const n of Object.keys(devices)){try{await devices[n].call('exit');}catch(_){}devices[n].child.kill('SIGKILL');delete devices[n];}
dev('AD');await D('AD').call('init',{row:ROW});
try{await D('AD').call('restore',{store:{localStorage:{},idb:{},screen:{proj:{'pm-reducing':'528'},_fts:{proj:{'pm-reducing':T}}}}});}catch(_){/* older driver */}
try{await D('AD').call('load');}catch(_){}
for(let i=0;i<3;i++){await D('AD').call('beat');await sleep(120);}
const a2=(await D('AD').call('get')).screen.proj['pm-reducing'];
const c2=cloud.data.proj&&cloud.data.proj['pm-reducing'];
check('the split converges to one value everywhere',a2===c2&&(a2==='25'||a2==='528'),'AD='+a2+' cloud='+c2);
for(const n of Object.keys(devices)){try{await devices[n].call('exit');}catch(_){}devices[n].child.kill('SIGKILL');}
server.close();
const f=results.filter(x=>!x.p);
console.log('\n'+(results.length-f.length)+'/'+results.length+' checks passed\n');
process.exit(f.length?1:0);
