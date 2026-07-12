import { readFileSync } from 'fs';
let pass=0, fail=0;
const t=(n,f)=>{ try{ f(); pass++; console.log('  ✓ '+n); } catch(e){ fail++; console.log('  ✗ '+n+' — '+e.message); } };
const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error((m||'')+' got '+JSON.stringify(a)+' want '+JSON.stringify(b)); };

// recording 2d ctx
function mkCtx(){ const c={ ops:[], globalAlpha:1, strokeStyle:'', lineWidth:0, lineCap:'', lineJoin:'', _dash:[],
  save(){c.ops.push(['save']);}, restore(){c.ops.push(['restore']);},
  translate(x,y){c.ops.push(['translate',x,y]);}, rotate(a){c.ops.push(['rotate',a]);},
  beginPath(){c.ops.push(['beginPath']);}, moveTo(x,y){c.ops.push(['moveTo',x,y]);}, lineTo(x,y){c.ops.push(['lineTo',x,y]);},
  closePath(){c.ops.push(['closePath']);}, stroke(){c.ops.push(['stroke',c.lineWidth,c.strokeStyle,c.globalAlpha]);},
  strokeRect(x,y,w,h){c.ops.push(['strokeRect',x,y,w,h]);}, fillRect(){}, fill(){}, arc(){c.ops.push(['arc']);},
  ellipse(){c.ops.push(['ellipse']);}, setLineDash(d){c._dash=d;}, quadraticCurveTo(){ throw new Error('quadraticCurveTo FORBIDDEN'); } };
  return c; }

global.window = global;
new Function('window', readFileSync('/home/claude/markupTools.js','utf8'))(global);
new Function('window', readFileSync('/home/claude/markupSelection.js','utf8'))(global);

// minimal engine
function mkEngine(strokes){
  const E = { strokes, nw: 1000, ctx: null,
    canvas: { getBoundingClientRect: () => ({ width: 1000 }) },
    render(){}, _pushOp(){},
    _strokeBBox(s){ let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9; s.pts.forEach(p=>{x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}); return {x1,y1,x2,y2}; },
    _strokeCenter(s){ const b=E._strokeBBox(s); return {x:(b.x1+b.x2)/2, y:(b.y1+b.y2)/2}; } };
  window.MarkupSelection.install(E);
  return E;
}

console.log('\n── S461 contour halo ──');
t('module version bumped', () => eq(window.MarkupSelection.VERSION, '2.4.1'));

t('pen stroke → traces its OWN polyline (no strokeRect, lineTo only)', () => {
  const s = { id:'a', tool:'pen', size:6, pts:[{x:10,y:10},{x:40,y:60},{x:90,y:20}] };
  const E = mkEngine([s]); const c = mkCtx();
  E._drawSelHalo(c, s, 1, false);
  const kinds = c.ops.map(o=>o[0]);
  if(kinds.includes('strokeRect')) throw new Error('fell back to a bounding box');
  eq(kinds.filter(k=>k==='lineTo').length, 2, 'two lineTo for 3 pts:');
  const st = c.ops.find(o=>o[0]==='stroke');
  eq(st[1], 6 + 2*3, 'halo width = ink + 2*offset:');   // 3px offset, k=1
  if(st[3] >= 1) throw new Error('halo must be translucent');
});

t('triangle → traces a real triangle (closePath), not a rectangle', () => {
  const s = { id:'b', tool:'triangle', size:6, pts:[{x:100,y:100},{x:200,y:200}] };
  const E = mkEngine([s]); const c = mkCtx();
  E._drawSelHalo(c, s, 1, false);
  const kinds = c.ops.map(o=>o[0]);
  if(kinds.includes('strokeRect')) throw new Error('drew a bounding box for a triangle');
  if(!kinds.includes('closePath')) throw new Error('triangle path not closed');
  eq(kinds.filter(k=>k==='lineTo').length, 2, 'triangle has 2 lineTo:');
});

t('circle → ellipse path, no bounding box', () => {
  const s = { id:'c', tool:'circle', size:5, pts:[{x:0,y:0},{x:80,y:50}] };
  const E = mkEngine([s]); const c = mkCtx();
  E._drawSelHalo(c, s, 1, false);
  const kinds = c.ops.map(o=>o[0]);
  if(kinds.includes('strokeRect')) throw new Error('bounding box on a circle');
  if(!kinds.includes('ellipse') && !kinds.includes('arc')) throw new Error('no ellipse/arc path');
});

t('legacy alias (square → rect) still traces via canonical renderer', () => {
  const s = { id:'d', tool:'square', size:4, pts:[{x:10,y:10},{x:50,y:40}] };
  const E = mkEngine([s]); const c = mkCtx();
  E._drawSelHalo(c, s, 1, false);
  // rect legitimately uses strokeRect as its TRUE shape — assert it pathed and stroked a halo
  const st = c.ops.find(o=>o[0]==='stroke');
  if(!st) throw new Error('no halo stroke for rect');
  eq(st[1], 4 + 2*3, 'rect halo width:');
});

t('rotation: ctx is rotated about the stroke center (halo cannot drift)', () => {
  const s = { id:'e', tool:'pen', size:6, rot:0.5, pts:[{x:0,y:0},{x:100,y:0}] };
  const E = mkEngine([s]); const c = mkCtx();
  E._drawSelHalo(c, s, 1, false);
  const rot = c.ops.find(o=>o[0]==='rotate');
  if(!rot) throw new Error('no ctx rotate for a rotated stroke');
  eq(rot[1], 0.5, 'rotates by s.rot:');
  const tr = c.ops.filter(o=>o[0]==='translate');
  eq(tr.length, 2, 'translate to center and back:');
  eq(tr[0][1], 50, 'center x:');
});

t('text → AABB fallback (a box IS its true shape)', () => {
  const s = { id:'f', tool:'text', size:20, pts:[{x:10,y:10},{x:120,y:40}] };
  const E = mkEngine([s]); const c = mkCtx();
  E._drawSelHalo(c, s, 1, false);
  if(!c.ops.some(o=>o[0]==='strokeRect')) throw new Error('text should use the AABB fallback');
});

t('cloud → AABB fallback (not unified across surfaces, per markupTools A3)', () => {
  const s = { id:'g', tool:'cloud', size:6, pts:[{x:10,y:10},{x:120,y:90}] };
  const E = mkEngine([s]); const c = mkCtx();
  E._drawSelHalo(c, s, 1, false);
  if(!c.ops.some(o=>o[0]==='strokeRect')) throw new Error('cloud should use the AABB fallback');
});

t('active member reads stronger than a plain member', () => {
  const s = { id:'h', tool:'pen', size:6, pts:[{x:0,y:0},{x:50,y:50}] };
  const E = mkEngine([s]);
  const c1 = mkCtx(); E._drawSelHalo(c1, s, 1, false);
  const c2 = mkCtx(); E._drawSelHalo(c2, s, 1, true);
  const a1 = c1.ops.find(o=>o[0]==='stroke'), a2 = c2.ops.find(o=>o[0]==='stroke');
  if(!(a2[3] > a1[3])) throw new Error('active halo not more opaque');
  if(!(a2[1] > a1[1])) throw new Error('active halo not thicker');
});

t('empty pts → no throw, nothing drawn', () => {
  const s = { id:'i', tool:'pen', size:6, pts:[] };
  const E = mkEngine([s]); const c = mkCtx();
  E._drawSelHalo(c, s, 1, false);   // must not throw
});

t('BLUE group box GEOMETRY untouched (S459e grab pad + box draw) — colour may change, behavior may NOT', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  if(!/var pad=\(coarse\?30:22\)\*k, hs=11\*k;/.test(src)) throw new Error('S459e grab pad changed!');
  if(!/ctx\.strokeRect\(g\.b\.x1,g\.b\.y1,g\.b\.x2-g\.b\.x1,g\.b\.y2-g\.b\.y1\)/.test(src)) throw new Error('blue group box draw changed!');
});

t('S461b: chrome colours CENTRALIZED — one SEL block, no stray hex in code paths', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  if(!/var SEL = \{/.test(src)) throw new Error('SEL token block missing');
  const code = src.split('\n').filter(l => { const q=l.trim(); return !q.startsWith('//') && !q.startsWith('*'); }).join('\n');
  for(const dead of ['#3F6E9C','#2C5E8E','#E6A23C','#EF9F27'])
    if(code.includes(dead)) throw new Error('stale colour literal in a code path: ' + dead);
});

t('S461b: halo and group box are DISTINCT hues (roles must stay tellable apart)', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  const halo  = /halo:\s*'(#[0-9A-Fa-f]{6})'/.exec(src)[1].toLowerCase();
  const group = /group:\s*'(#[0-9A-Fa-f]{6})'/.exec(src)[1].toLowerCase();
  if(halo === group) throw new Error('halo and group box same colour — signage vs draggable becomes ambiguous');
});

t('S461b: halo brighter/more opaque than the old amber (the visibility fix)', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  const a  = parseFloat(/haloAlpha:\s*([\d.]+)/.exec(src)[1]);
  const aa = parseFloat(/haloAlphaActive:\s*([\d.]+)/.exec(src)[1]);
  if(!(a > 0.42)) throw new Error('plain halo not more opaque than old 0.42');
  if(!(aa > a))   throw new Error('active halo must read stronger than plain');
});


t('S461c: every resize corner anchors to its TRUE OPPOSITE corner', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  const m = /var anchors=\[\[g\.b\.(\w+),g\.b\.(\w+)\],\[g\.b\.(\w+),g\.b\.(\w+)\],\[g\.b\.(\w+),g\.b\.(\w+)\],\[g\.b\.(\w+),g\.b\.(\w+)\]\]/.exec(src);
  if(!m) throw new Error('anchor table not found');
  // corners order = [TL(x1,y1), TR(x2,y1), BR(x2,y2), BL(x1,y2)]
  const want = ['x2','y2',  'x1','y2',  'x1','y1',  'x2','y1'];  // BR, BL, TL, TR
  const got = m.slice(1);
  for(let i=0;i<8;i++) if(got[i]!==want[i])
    throw new Error('anchor['+Math.floor(i/2)+'] wrong: got '+got.join(',')+' want '+want.join(','));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
