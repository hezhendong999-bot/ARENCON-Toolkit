import { readFileSync } from 'fs';
let pass=0, fail=0;
function t(n,f){ try{ f(); console.log('  ✓ '+n); pass++; } catch(e){ console.log('  ✗ '+n+' — '+e.message); fail++; } }
function eq(a,b,m){ const A=JSON.stringify(a),B=JSON.stringify(b); if(A!==B) throw new Error((m||'')+' got '+A+' want '+B); }

global.window = {};
const src = readFileSync('/home/claude/markupPolyline.js','utf8');
new Function('module','window', src + '\nwindow.MarkupPolyline=window.MarkupPolyline;')({exports:{}}, global.window);
const MP = global.window.MarkupPolyline;

// fake host: records what the module asks it to do
function host(){
  const calls={commit:[],render:0,hide:0,changed:[]};
  const ctx={ setTransform(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){} };
  const ov={ style:{}, width:100, height:100, _dpr:1, getContext:()=>ctx };
  const p = MP.create({
    getOverlay:()=>ov,
    hideOverlay:()=>{ calls.hide++; },
    style:()=>({color:'#f00', size:3, opacity:1}),
    commit:(pts)=>{ calls.commit.push(pts); },
    afterChange:(n)=>{ calls.changed.push(n); },
    render:()=>{ calls.render++; }
  });
  return {p, calls};
}

console.log('\n── shared polyline: drawing-viewer behaviour, verbatim ──');

t('points accumulate; nothing commits until finish', () => {
  const {p, calls} = host();
  p.addPoint({x:0,y:0}); p.addPoint({x:50,y:0}); p.addPoint({x:50,y:50});
  eq(p.count(), 3);
  eq(calls.commit.length, 0, 'must not commit mid-draw:');
});

t('placing within 15 of the FIRST point CLOSES the loop and finishes', () => {
  const {p, calls} = host();
  p.addPoint({x:0,y:0}); p.addPoint({x:50,y:0}); p.addPoint({x:50,y:50});
  const finished = p.addPoint({x:8,y:8});          // dist ~11.3 < 15
  if(!finished) throw new Error('should have finished');
  eq(calls.commit.length, 1);
  const pts = calls.commit[0];
  eq(pts.length, 4);
  eq(pts[3], {x:0,y:0}, 'closing point must be an EXACT copy of point 0:');
  eq(p.count(), 0, 'state cleared after finish:');
});

t('a point 15+ away from the first does NOT close', () => {
  const {p, calls} = host();
  p.addPoint({x:0,y:0}); p.addPoint({x:50,y:0}); p.addPoint({x:50,y:50});
  const finished = p.addPoint({x:20,y:0});         // dist 20 > 15
  if(finished) throw new Error('must not close');
  eq(calls.commit.length, 0);
  eq(p.count(), 4);
});

t('✓ Finish commits AS DRAWN (open) with >= 2 points', () => {
  const {p, calls} = host();
  p.addPoint({x:0,y:0}); p.addPoint({x:99,y:99});
  p.finish();
  eq(calls.commit.length, 1);
  eq(calls.commit[0].length, 2, 'open polyline — no closing point:');
});

t('✓ Finish with < 2 points CANCELS (commits nothing)', () => {
  const {p, calls} = host();
  p.addPoint({x:0,y:0});
  p.finish();
  eq(calls.commit.length, 0);
  eq(p.count(), 0);
});

t('↩ undoPoint removes ONLY the last point', () => {
  const {p} = host();
  p.addPoint({x:0,y:0}); p.addPoint({x:10,y:0}); p.addPoint({x:20,y:0});
  p.undoPoint();
  eq(p.count(), 2);
  eq(p.lastPoint(), {x:10,y:0});
});

t('✕ cancel discards everything; nothing committed', () => {
  const {p, calls} = host();
  p.addPoint({x:0,y:0}); p.addPoint({x:10,y:10}); p.addPoint({x:20,y:0});
  p.cancel();
  eq(calls.commit.length, 0);
  eq(p.count(), 0);
  eq(p.isActive(), false);
});

t('afterChange fires with the live count (hosts drive the pill from it)', () => {
  const {p, calls} = host();
  p.addPoint({x:0,y:0}); p.addPoint({x:9,y:9});
  p.undoPoint();
  p.cancel();
  eq(calls.changed, [1,2,1,0]);
});

t('lineTo only — quadraticCurveTo is forbidden toolkit-wide', () => {
  const code = src.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
  if(/quadraticCurveTo/.test(code)) throw new Error('quadraticCurveTo in CODE');
  if(!/lineTo/.test(code)) throw new Error('lineTo missing');
});

t('the module NEVER hard-codes a stroke format (hosts mint their own)', () => {
  if(/\.points\s*=|\.pts\s*=|type:\s*'polyline'|tool:\s*'polyline'/.test(src))
    throw new Error('module must be format-agnostic — commit() is the host’s job');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail?1:0);
