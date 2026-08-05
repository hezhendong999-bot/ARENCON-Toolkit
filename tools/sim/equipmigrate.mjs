/* S616c — migration check: an OLD report (position lists, one-way exclusions)
   must load identically, and a NEW report must round-trip. No network, no IDB. */
import { JSDOM } from 'jsdom';
const IDS=['hm25-n25','hm25-n175','hm25-n118','pn2-lhm','pn2-oa','pn175-lhm','pn175-oa'];
const boxes=n=>IDS.map(v=>`<label><input type="checkbox" name="${n}" value="${v}"></label>`).join('');
const dom=new JSDOM(`<!doctype html><body>${boxes('equip3a')}${boxes('equip4b')}</body>`);
const document=dom.window.document;
function restore(s){
  const cbs=document.querySelectorAll('input[name="equip3a"]');
  const map=s.equipState;
  if(map&&typeof map==='object'&&!Array.isArray(map)){
    cbs.forEach((cb,i)=>{const e=map[cb.value||('pos'+i)]; cb.checked=!!(e&&e.status==='yes');});
    return;
  }
  if(Array.isArray(s.equipChecked)){ cbs.forEach(cb=>cb.checked=false); s.equipChecked.forEach(i=>{if(cbs[i])cbs[i].checked=true;}); }
}
function collect(){
  const st={}, legacy=[];
  document.querySelectorAll('input[name="equip3a"]').forEach((cb,i)=>{
    st[cb.value||('pos'+i)]={status:cb.checked?'yes':'no'}; if(cb.checked) legacy.push(i);
  });
  return {equipState:st, equipChecked:legacy};
}
const ticked=()=>[...document.querySelectorAll('input[name="equip3a"]')].map(c=>c.checked?1:0).join('');
let fail=0; const chk=(n,c,g)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'  → '+g)); if(!c)fail++;};

/* 1. Legacy report loads exactly as it used to. */
restore({equipChecked:[0,3,5]});
chk('legacy positions load unchanged', ticked()==='1001010', ticked());

/* 2. Saving that legacy report mints identities for the same equipment. */
const saved=collect();
chk('migrated ids match the ticks',
  saved.equipState['hm25-n25'].status==='yes' && saved.equipState['pn2-lhm'].status==='yes' &&
  saved.equipState['pn175-lhm'].status==='yes' && saved.equipState['hm25-n175'].status==='no',
  JSON.stringify(saved.equipState));

/* 3. Legacy list still written for older devices, and still correct. */
chk('back-compat list preserved', JSON.stringify(saved.equipChecked)==='[0,3,5]', JSON.stringify(saved.equipChecked));

/* 4. New shape round-trips. */
document.querySelectorAll('input[name="equip3a"]').forEach(c=>c.checked=false);
restore(saved);
chk('new shape round-trips', ticked()==='1001010', ticked());

/* 5. THE POINT OF THE EXERCISE: the list gets reordered. Positions would lie;
      identities must not. */
const reordered=[...IDS].reverse();
document.body.innerHTML=reordered.map(v=>`<label><input type="checkbox" name="equip3a" value="${v}"></label>`).join('');
restore(saved);
const now=[...document.querySelectorAll('input[name="equip3a"]')].filter(c=>c.checked).map(c=>c.value).sort().join(',');
chk('survives a reordered list', now==='hm25-n25,pn175-lhm,pn2-lhm', now);

/* 6. Deliberately unticking travels as an answer, not as an absence. */
chk('untick is a real answer, not a blank', saved.equipState['pn2-oa'].status==='no', JSON.stringify(saved.equipState['pn2-oa']));
console.log(fail?`\n${fail} FAILED\n`:'\nall 6 migration checks passed\n');
process.exit(fail?1:0);
