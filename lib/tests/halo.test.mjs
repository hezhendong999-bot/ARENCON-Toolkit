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

console.log('\n── selection chrome (S461i uniform frames) ──');

t('module version bumped', () => eq(window.MarkupSelection.VERSION, '2.8.1'));

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

t('member frames and the group box stay DISTINCT (signage vs draggable)', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  const group = /group:\s*'(#[0-9A-Fa-f]{6})'/.exec(src)[1].toLowerCase();
  const halo = /halo:\s*'(#[0-9A-Fa-f]{6})'/.exec(src)[1].toLowerCase();
  if(group === halo) throw new Error('group box colour collided with the member-glow cyan');
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

t('LOCKED (Mark): picks = glow BOX + check badge; grouped members = contour glow', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  const pick = src.slice(src.indexOf('if(inTap && this._pickIds'));
  const pickBlock = pick.slice(0, pick.indexOf('ctx.restore();'));
  // Picks must NEVER trace the ink — that overpaints the markup and makes it
  // unreadable. They get a BOX around the mark plus the green check.
  if(/_drawSelHalo/.test(pickBlock))
    throw new Error('picks must NOT use the contour glow — it paints over the ink (Mark, S461p)');
  if(!/strokeRect/.test(pickBlock)) throw new Error('pick glow box missing');
  if(!/#3FD08A/.test(pickBlock)) throw new Error('green check badge missing');
  // ...and the picking glow sits 10% more transparent than a committed one.
  if(!/globalAlpha=0\.90/.test(pickBlock))
    throw new Error('picking glow must be 10% more transparent (globalAlpha 0.90)');
  // Grouped members DO use the contour glow.
  const mem = src.slice(src.indexOf('if(inTap && this.selIds'));
  if(!/_drawSelHalo/.test(mem.slice(0, mem.indexOf('ctx.restore();'))))
    throw new Error('grouped members must use the contour glow');
});

t('S461j: bridge supplies the DIMENSION contour', () => {
  const b = readFileSync('/home/claude/markupSelBridge.js','utf8');
  if(!/haloPath: function \(ctx, s\)/.test(b)) throw new Error('bridge haloPath missing');
  if(!/label chip outline/.test(b)) throw new Error('dimension chip tracing missing');
});


t('v2.7.0: chrome scale survives nw=0 (the lightbox photo-fallback bug)', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  if(!/return this\.nw \|\| this\.w \|\|/.test(src))
    throw new Error('_selNW must prefer host w before any canvas fallback');
  if(!/canvas\.width \/ \(this\.dpr \|\| 1\)/.test(src))
    throw new Error('canvas fallback must divide out dpr');
  if(/this\.nw\/Math\.max/.test(src)) throw new Error('raw nw scale read survived — must go through _selNW');
});

t('v2.7.0: tap on a selected member DESELECTS it (no active-lighten in tap mode)', () => {
  const src = readFileSync('/home/claude/markupSelection.js','utf8');
  if(!/DESELECT that one/.test(src)) throw new Error('tap-deselect missing');
  if(/make it the "active" grouped mark/.test(src)) throw new Error('old lighten path survived');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
