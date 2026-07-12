// ARENCON lib harness — FRT drawing-viewer selection bridge (S461)
// Run: node lib/tests/frtSelBridge.test.mjs   (exit 0 = green; the push gate)
//
// The oracles below are VERBATIM copies of markup.js's _getBounds and its
// rotate-drag handler. The bridge must reproduce them exactly on the converted
// model — that is the "same behavior, new home" proof for the drawing viewer.

import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); }
}
function eq(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg || 'mismatch') + '\n    got:      ' + ja + '\n    expected: ' + jb);
}
function near(a, b, tol, msg) {
  if (Math.abs(a - b) > (tol || 1e-9)) throw new Error((msg || 'not near') + ' ' + a + ' vs ' + b);
}

// markupTools onto the shim global (the bridge resolves it there in Node)
globalThis.window = globalThis;
new Function('window', readFileSync(new URL('../ui/markupTools.js', import.meta.url), 'utf8'))(globalThis);

const B = await import(new URL('../../frt/js/viewer/markupSelBridge.js', import.meta.url));

// ═══ ORACLE 1: verbatim markup.js _getBounds (S331g build) ═══
function _getBounds(obj) {
  if (obj.type === 'dimension' && obj.mx1 != null) {
    var dox = obj.mx2 - obj.mx1, doy = obj.my2 - obj.my1;
    var dlen = Math.sqrt(dox * dox + doy * doy) || 1;
    var dpx = -doy / dlen, dpy = dox / dlen;
    var doff = obj.offset || 0;
    var pxs = [obj.mx1, obj.mx2, obj.mx1 + dpx * doff, obj.mx2 + dpx * doff];
    var pys = [obj.my1, obj.my2, obj.my1 + dpy * doff, obj.my2 + dpy * doff];
    var mlx = (obj.mx1 + obj.mx2) / 2 + dpx * doff;
    var mly = (obj.my1 + obj.my2) / 2 + dpy * doff;
    pxs.push(mlx - 28, mlx + 28); pys.push(mly - 14, mly + 14);
    return { x1: Math.min.apply(null, pxs), y1: Math.min.apply(null, pys), x2: Math.max.apply(null, pxs), y2: Math.max.apply(null, pys) };
  }
  if (obj.type === 'text') {
    var fs = obj.fontSize || 20;
    var txtLen = (obj.text || '').length;
    var estW = txtLen * fs * 0.55;
    var bx1t = obj.x1, by1t = obj.y1 - fs;
    var bx2t = obj.x1 + estW, by2t = obj.y1 + 4;
    var rotT = obj.rotation || 0;
    if (rotT) {
      var ctx_ = obj.x1 + estW / 2, cty_ = obj.y1 - fs / 2;
      var ct = Math.cos(rotT), st = Math.sin(rotT);
      var cornersT = [[bx1t, by1t], [bx2t, by1t], [bx2t, by2t], [bx1t, by2t]];
      var rxMinT = Infinity, ryMinT = Infinity, rxMaxT = -Infinity, ryMaxT = -Infinity;
      for (var ti = 0; ti < 4; ti++) {
        var ddxT = cornersT[ti][0] - ctx_, ddyT = cornersT[ti][1] - cty_;
        var rxT = ctx_ + ddxT * ct - ddyT * st;
        var ryT = cty_ + ddxT * st + ddyT * ct;
        if (rxT < rxMinT) rxMinT = rxT; if (ryT < ryMinT) ryMinT = ryT;
        if (rxT > rxMaxT) rxMaxT = rxT; if (ryT > ryMaxT) ryMaxT = ryT;
      }
      return { x1: rxMinT, y1: ryMinT, x2: rxMaxT, y2: ryMaxT };
    }
    return { x1: bx1t, y1: by1t, x2: bx2t, y2: by2t };
  }
  if (obj.points && obj.points.length) {
    var xs = obj.points.map(function (p) { return p.x; });
    var ys = obj.points.map(function (p) { return p.y; });
    return { x1: Math.min.apply(null, xs), y1: Math.min.apply(null, ys), x2: Math.max.apply(null, xs), y2: Math.max.apply(null, ys) };
  }
  if (obj.x1 != null && obj.x2 != null) {
    var bx1 = Math.min(obj.x1, obj.x2), by1 = Math.min(obj.y1, obj.y2);
    var bx2 = Math.max(obj.x1, obj.x2), by2 = Math.max(obj.y1, obj.y2);
    var rot = obj.rotation || 0;
    if (rot) {
      var cx = (bx1 + bx2) / 2, cy = (by1 + by2) / 2;
      var c = Math.cos(rot), s = Math.sin(rot);
      var corners = [[bx1, by1], [bx2, by1], [bx2, by2], [bx1, by2]];
      var rxMin = Infinity, ryMin = Infinity, rxMax = -Infinity, ryMax = -Infinity;
      for (var i = 0; i < 4; i++) {
        var ddx = corners[i][0] - cx, ddy = corners[i][1] - cy;
        var rx = cx + ddx * c - ddy * s;
        var ry = cy + ddx * s + ddy * c;
        if (rx < rxMin) rxMin = rx; if (ry < ryMin) ryMin = ry;
        if (rx > rxMax) rxMax = rx; if (ry > ryMax) ryMax = ry;
      }
      return { x1: rxMin, y1: ryMin, x2: rxMax, y2: ryMax };
    }
    return { x1: bx1, y1: by1, x2: bx2, y2: by2 };
  }
  return null;
}

// ═══ ORACLE 2: verbatim markup.js rotate-drag semantics ═══
function oracleRotate(orig, cx, cy, dAngle) {
  const cosA = Math.cos(dAngle), sinA = Math.sin(dAngle);
  function rot(px, py) { return { x: cx + (px - cx) * cosA - (py - cy) * sinA, y: cy + (px - cx) * sinA + (py - cy) * cosA }; }
  const obj = JSON.parse(JSON.stringify(orig));
  if (orig.points) {
    obj.points = orig.points.map(function (p) { return rot(p.x, p.y); });
  } else if (orig.type === 'text') {
    var fs_r = orig.fontSize || 20;
    var estW_r = (orig.text || '').length * fs_r * 0.55;
    var origCxT = orig.x1 + estW_r / 2;
    var origCyT = orig.y1 - fs_r / 2;
    var newCT = rot(origCxT, origCyT);
    obj.x1 = newCT.x - estW_r / 2;
    obj.y1 = newCT.y + fs_r / 2;
    obj.rotation = (orig.rotation || 0) + dAngle;
  } else if (orig.x1 != null) {
    var origCx = ((orig.x1 || 0) + (orig.x2 || 0)) / 2;
    var origCy = ((orig.y1 || 0) + (orig.y2 || 0)) / 2;
    var newC = rot(origCx, origCy);
    var hw = Math.abs((orig.x2 || 0) - (orig.x1 || 0)) / 2;
    var hh = Math.abs((orig.y2 || 0) - (orig.y1 || 0)) / 2;
    obj.x1 = newC.x - hw; obj.y1 = newC.y - hh;
    obj.x2 = newC.x + hw; obj.y2 = newC.y + hh;
    obj.rotation = (orig.rotation || 0) + dAngle;
  }
  if (orig.eraserMask && orig.eraserMask.length) {
    obj.eraserMask = orig.eraserMask.map(function (m) {
      return { points: m.points.map(function (p) { return rot(p.x, p.y); }), size: m.size };
    });
  }
  return obj;
}

// ═══ fixtures — one of every v1 object type, rotated and not ═══
const FIX = [
  { id: 'a1', type: 'pen', points: [{ x: 10, y: 10 }, { x: 40, y: 62 }, { x: 91, y: 20 }], color: '#FF0000', size: 3, opacity: 1 },
  { id: 'a2', type: 'highlight', points: [{ x: 5, y: 5 }, { x: 80, y: 6 }], color: '#FFFF00', size: 14, opacity: 1 },
  { id: 'a3', type: 'polyline', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }], color: '#FF0000', size: 3, opacity: 1 },
  { id: 'a4', type: 'eraser', points: [{ x: 20, y: 20 }, { x: 30, y: 30 }], size: 20 },
  { id: 'b1', type: 'rect', x1: 100, y1: 100, x2: 220, y2: 180, color: '#FF0000', size: 4, opacity: 1 },
  { id: 'b2', type: 'fillrect', x1: 10, y1: 10, x2: 60, y2: 40, color: '#00FF00', size: 4, opacity: 0.8 },
  { id: 'b3', type: 'circle', x1: 200, y1: 200, x2: 300, y2: 260, color: '#FF0000', size: 4, opacity: 1, rotation: 0.7 },
  { id: 'b4', type: 'fillcircle', x1: 0, y1: 0, x2: 30, y2: 30, color: '#0000FF', size: 2, opacity: 1 },
  { id: 'b5', type: 'arrow', x1: 50, y1: 300, x2: 180, y2: 340, color: '#FF0000', size: 5, opacity: 1 },
  { id: 'b6', type: 'line', x1: 0, y1: 0, x2: 100, y2: 100, color: '#FF0000', size: 3, opacity: 1 },
  { id: 'b7', type: 'triangle', x1: 400, y1: 100, x2: 520, y2: 220, color: '#FF0000', size: 4, opacity: 1, rotation: -0.4 },
  { id: 'b8', type: 'filltriangle', x1: 10, y1: 10, x2: 90, y2: 80, color: '#FF0000', size: 4, opacity: 1 },
  { id: 'b9', type: 'cloud', x1: 60, y1: 60, x2: 200, y2: 160, color: '#FF0000', size: 4, opacity: 1 },
  { id: 'c1', type: 'text', x1: 150, y1: 150, text: 'FLUSH REQUIRED', fontSize: 24, color: '#FF0000', opacity: 1 },
  { id: 'c2', type: 'text', x1: 10, y1: 40, text: 'ROTATED', fontSize: 20, color: '#FF0000', opacity: 1, rotation: 1.1 },
  { id: 'd1', type: 'dimension', mx1: 100, my1: 500, mx2: 340, my2: 520, offset: 40, rawLabel: '12.4 m', overrideLabel: null, color: '#FF0000', size: 2, opacity: 1 },
  { id: 'd2', type: 'dimension', x1: 50, y1: 60, x2: 200, y2: 60, offset: -30, rawLabel: '5.0 m', overrideLabel: null, color: '#FF0000', size: 2, opacity: 1 },   // LEGACY flavor (pre-mx*)
  { id: 'd2', type: 'dimension', x1: 50, y1: 60, x2: 210, y2: 65, rawLabel: '8.1 m', overrideLabel: null, color: '#FF0000', size: 2, opacity: 1 },
  { id: 'e1', type: 'pen', points: [{ x: 1, y: 1 }, { x: 9, y: 9 }], color: '#FF0000', size: 3, opacity: 1,
    eraserMask: [{ points: [{ x: 3, y: 3 }, { x: 6, y: 6 }], size: 12 }] }
];

console.log('\n── round-trip fidelity: toV1(toStroke(x)) === x ──');
for (const v1 of FIX) {
  t(`${v1.type} (${v1.id})`, () => eq(B.toV1(B.toStroke(structuredClone(v1))), v1));
}

t('legacy x-dimension NEVER silently migrates to mx family', () => {
  const v1 = FIX.find(f => f.id === 'd2');
  const back = B.toV1(B.toStroke(structuredClone(v1)));
  if ('mx1' in back) throw new Error('legacy dim gained mx1 — silent format migration!');
  eq(back, v1);
});

console.log('\n── tool-name mapping ──');
t('legacy fills map to canonical in memory, back to legacy on save', () => {
  eq(B.toStroke({ id: 'x', type: 'fillrect', x1: 0, y1: 0, x2: 1, y2: 1 }).tool, 'rect-fill');
  eq(B.toStroke({ id: 'x', type: 'fillcircle', x1: 0, y1: 0, x2: 1, y2: 1 }).tool, 'circle-fill');
  eq(B.toStroke({ id: 'x', type: 'filltriangle', x1: 0, y1: 0, x2: 1, y2: 1 }).tool, 'triangle-fill');
  eq(B.toV1({ id: 'x', tool: 'rect-fill', _v1type: 'fillrect', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).type, 'fillrect');
});

t('dimension flavor preserved: mx* stays mx*, legacy x1 stays x1', () => {
  const modern = { id: 'dm', type: 'dimension', mx1: 1, my1: 2, mx2: 3, my2: 4, offset: 5 };
  const legacy = { id: 'dl', type: 'dimension', x1: 1, y1: 2, x2: 3, y2: 4, offset: 5 };
  const m2 = B.toV1(B.toStroke(structuredClone(modern)));
  const l2 = B.toV1(B.toStroke(structuredClone(legacy)));
  eq(m2, modern); eq(l2, legacy);
  if ('x1' in m2) throw new Error('modern dim gained legacy fields');
  if ('mx1' in l2) throw new Error('legacy dim gained mx fields');
});

console.log('\n── aabb hook == verbatim _getBounds oracle ──');
const hooks = B.buildHooks({ getBounds: _getBounds, pushHistory() {}, markDirty() {} });
for (const v1 of FIX) {
  t(`bounds ${v1.type} (${v1.id})`, () => eq(hooks.aabb(B.toStroke(structuredClone(v1))), _getBounds(v1)));
}

console.log('\n── applyRotate == verbatim rotate-drag oracle ──');
function bridgeRotate(v1, cx, cy, dA) {
  const cosA = Math.cos(dA), sinA = Math.sin(dA);
  const rot = q => ({ x: cx + (q.x - cx) * cosA - (q.y - cy) * sinA, y: cy + (q.x - cx) * sinA + (q.y - cy) * cosA });
  const o = B.toStroke(structuredClone(v1));
  const st = structuredClone(o);
  hooks.applyRotate(st, o, dA, rot);
  return B.toV1(st);
}
const rotCases = FIX.filter(f => f.type !== 'dimension');   // dimension: no oracle branch (see below)
for (const v1 of rotCases) {
  t(`rotate ${v1.type} (${v1.id}) by 0.63 rad about (250,250)`, () => {
    const got = bridgeRotate(v1, 250, 250, 0.63);
    const want = oracleRotate(v1, 250, 250, 0.63);
    // float-tolerant deep compare
    const jg = JSON.parse(JSON.stringify(got)), jw = JSON.parse(JSON.stringify(want));
    (function cmp(a, b, path) {
      if (typeof a === 'number' && typeof b === 'number') { near(a, b, 1e-9, path); return; }
      if (Array.isArray(a)) { eq(a.length, b.length, path + '.length'); a.forEach((x, i) => cmp(x, b[i], path + '[' + i + ']')); return; }
      if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) cmp(a[k], b[k], path + '.' + k); return; }
      eq(a, b, path);
    })(jg, jw, v1.id);
  });
}
t('dimension rotate = pure translation of its center (no .rotation minted)', () => {
  const v1 = FIX.find(f => f.type === 'dimension');
  const got = bridgeRotate(v1, 0, 0, Math.PI / 2);
  if ('rotation' in got) throw new Error('dimension must not gain .rotation');
  // center rotated 90° about origin; offset/labels untouched
  const ocx = (v1.mx1 + v1.mx2) / 2, ocy = (v1.my1 + v1.my2) / 2;
  near((got.mx1 + got.mx2) / 2, -ocy, 1e-9, 'center x');
  near((got.my1 + got.my2) / 2, ocx, 1e-9, 'center y');
  eq(got.offset, v1.offset); eq(got.rawLabel, v1.rawLabel);
});
t('4 × 90° returns a shape home (accumulation sanity)', () => {
  let v1 = { id: 'r', type: 'rect', x1: 100, y1: 100, x2: 200, y2: 160, color: '#f00', size: 3, opacity: 1 };
  let cur = v1;
  for (let i = 0; i < 4; i++) cur = bridgeRotate(cur, 150, 130, Math.PI / 2);
  near(cur.x1, v1.x1, 1e-6); near(cur.y1, v1.y1, 1e-6);
  near(cur.x2, v1.x2, 1e-6); near(cur.y2, v1.y2, 1e-6);
  near(((cur.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), 0, 1e-6, 'net rotation');
});

console.log('\n── logOp → the drawing viewer\'s own snapshot undo ──');
t('logOp calls pushHistory then markDirty (verbatim commit behavior)', () => {
  const calls = [];
  const h = B.buildHooks({ getBounds: _getBounds, pushHistory: () => calls.push('push'), markDirty: () => calls.push('dirty') });
  h.logOp({ t: 'gmod', ids: ['a'], before: [], after: [] });
  eq(calls, ['push', 'dirty']);
});

console.log('\n── engine integration smoke (converted strokes + bridge hooks) ──');
t('group move drag translates pts; undo snapshot pushed on commit', () => {
  new Function('window', readFileSync(new URL('../ui/markupSelection.js', import.meta.url), 'utf8'))(globalThis);
  const strokes = [B.toStroke(structuredClone(FIX[0])), B.toStroke(structuredClone(FIX[4]))];
  let pushed = 0;
  const E = {
    strokes, nw: 1000,
    canvas: { getBoundingClientRect: () => ({ width: 1000 }) },
    ctx: null, render() {}, _pushOp() {},
    _strokeBBox(s) { return _getBounds(B.toV1(s)); },
    _strokeCenter(s) { const b = _getBounds(B.toV1(s)); return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }; }
  };
  globalThis.MarkupSelection.install(E, B.buildHooks({ getBounds: _getBounds, pushHistory: () => pushed++, markDirty() {} }));
  E._selectSub = 'rubber';
  const p0 = { x: 15, y: 15 };                  // on the pen stroke's ink
  E.selIds = [strokes[0].id];
  E._dragState = { type: 'move', startX: p0.x, startY: p0.y, moved: false, orig: E._snapSel() };
  E._selMove({ x: 45, y: 25 });                  // drag +30,+10
  near(E.strokes[0].pts[0].x, 40, 1e-9, 'pt0.x translated');
  near(E.strokes[0].pts[0].y, 20, 1e-9, 'pt0.y translated');
  E._selUp({ x: 45, y: 25 });
  eq(pushed, 1, 'one undo snapshot on commit');
  // and the moved stroke still round-trips to clean v1
  const back = B.toV1(E.strokes[0]);
  eq(back.type, 'pen'); eq(back.points.length, 3);
});


console.log('\n── S461d: ink-precise hit test ──');
const H = B.buildHooks({ getBounds: _getBounds, pushHistory() {}, markDirty() {} });
function hit(v1, x, y, tol) { return H.hitInk.call({}, B.toStroke(structuredClone(v1)), { x, y }, tol == null ? 7 : tol); }

t('pen: near the polyline hits; far inside its AABB misses', () => {
  const s = { id:'p', type:'pen', points:[{x:0,y:0},{x:100,y:100}], size:4 };
  if(!hit(s, 50, 52)) throw new Error('near diagonal should hit');
  if(hit(s, 90, 10)) throw new Error('AABB corner far from ink must MISS');
});

t('S461g REVERT (Mark): hollow shapes grab ANYWHERE inside — edge AND interior', () => {
  const s = { id:'r', type:'rect', x1:100, y1:100, x2:300, y2:250, size:4 };
  if(!hit(s, 100, 175)) throw new Error('left edge should hit');
  if(!hit(s, 200, 175)) throw new Error('interior should hit (Mark: shapes always grab)');
});

t('fillrect: interior IS ink', () => {
  const s = { id:'fr', type:'fillrect', x1:0, y1:0, x2:60, y2:40, size:2 };
  if(!hit(s, 30, 20)) throw new Error('filled interior should hit');
});

t('hollow triangle grabs from inside its box (S461g revert)', () => {
  const s = { id:'t3', type:'triangle', x1:100, y1:100, x2:300, y2:280, size:5 };
  if(!hit(s, 200, 280)) throw new Error('base edge should hit');
  if(!hit(s, 200, 220)) throw new Error('interior should hit');
});

t('circle grabs from ring AND center (S461g revert)', () => {
  const o = { id:'c', type:'circle', x1:0, y1:0, x2:200, y2:200, size:4 };
  if(!hit(o, 200, 100)) throw new Error('ring should hit');
  if(!hit(o, 100, 100)) throw new Error('center should hit');
});

t('dimension: offset dim line + label chip hit; empty bay misses', () => {
  const s = { id:'d', type:'dimension', mx1:100, my1:500, mx2:340, my2:500, offset:40, rawLabel:'12 m' };
  // offset line runs at y = 500 - 40 = 460 (perp of a rightward line is up: (-dy,dx)/len = (0,1)? dx=240,dy=0 → px=0,py=1 → offset DOWN at +40 → y=540)
  if(!hit(s, 220, 540)) throw new Error('offset dim line should hit');
  if(!hit(s, 220, 545, 7)) throw new Error('label chip should hit');
  if(hit(s, 220, 500 - 60)) throw new Error('empty space above must miss');
  if(!hit(s, 100, 520)) throw new Error('extension leg should hit');
});

t('rotated text: hit follows the SPUN box, not the unrotated one', () => {
  const s = { id:'tx', type:'text', x1:100, y1:100, text:'ROTATE', fontSize:20, rotation: Math.PI / 2 };
  // estW = 6*20*0.55 = 66; pivot (133, 90). After 90° the box is vertical.
  if(!hit(s, 133, 90)) throw new Error('pivot center should always hit');
  if(!hit(s, 130, 120)) throw new Error('point inside the SPUN box should hit');
  if(hit(s, 190, 95)) throw new Error('end of the UNROTATED box must now miss');
});

t('engine default hook keeps AABB behavior (photo hosts unchanged)', () => {
  const src2 = readFileSync(new URL('../ui/markupSelection.js', import.meta.url), 'utf8');
  if(!/hitInk: function\(_s, _p, _tol\)\{ return true; \}/.test(src2)) throw new Error('default hitInk must accept the AABB verdict');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
