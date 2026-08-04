/**
 * ARENCON — Shared Signature Pad (vector-stroke model)  v1.0.0
 * ═══════════════════════════════════════════════════════════════════════
 * VERBATIM extraction of the Diesel signature engine (S220 lineage) into
 * /lib/. Same pixels, same behavior, new home. Consumers: Diesel (reference),
 * Electric (next); any future tool needing a sign-off pad.
 *
 * THE MODEL (S220 — fixed a real data-loss bug): signatures are stored as
 * VECTOR strokes at window._sigStrokes[canvasId] = [{pts:[{x,y},…]},…], NOT
 * as bitmaps. That is what lets them (a) survive reload/cloud-sync — the host
 * serializes _sigStrokes in saved state and repaints on load — and (b)
 * recolour cleanly on theme toggle (a bitmap cannot be recoloured).
 *
 * WHAT THIS OWNS
 *   init(canvasId)    bind a pad: mouse + touch capture, double-bind guard
 *                     (dataset.sigBound), zero-width-rect fallback (pad
 *                     init'd on a hidden tab still gets finite coordinates)
 *   ink()             theme ink — white in dark mode, #1C2333 in light
 *   repaint(id)       redraw one pad from strokes in the CURRENT theme ink
 *   repaintAll()      every pad (dark-mode toggle path)
 *   printSrc(id)      PDF RULE: render in FORCED dark ink #1C2333 regardless
 *                     of theme, so a report exported in dark mode never
 *                     prints invisible white-on-white; falls back to the live
 *                     canvas bitmap when a pad has no vector strokes (e.g.
 *                     pre-94c4b576 legacy signatures, uploaded images)
 *
 * WHAT STAYS HOST: signer-row management (contractor/witness rows), the
 * Draw/Upload mode buttons, clear buttons, uploaded-image path
 * (sig-upload-img-*), and serialization of window._sigStrokes in save/load.
 *
 * HOST CONTRACT (late-bound, both optional):
 *   window._sigStrokes             created lazily here if absent; the host
 *                                  reads/writes/serializes it freely
 *   updateCompletionOverview()     typeof-guarded; called on stroke commit
 *                                  for the primary pad id 'sig-canvas'
 *                                  (both pump tools use that id)
 *
 * USAGE (host binders — see diesel-next):
 *   function initSig(id){ return SigPad.init(id); }
 *   function _sigInk(){ return SigPad.ink(); }         …etc.
 *
 * Classic script global window.SigPad (+ CJS export for the Node harness).
 */
(function (root) {
'use strict';

function initSig(canvasId) {
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  // Guard against double-binding when a pad is re-initialised (e.g. on tab show).
  if(canvas.dataset.sigBound === '1') return;
  canvas.dataset.sigBound = '1';
  const ctx = canvas.getContext('2d');
  let drawing = false;
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  // Ink colour is resolved at REPAINT time, not init time. Signatures are stored
  // as VECTOR strokes in _sigStrokes[canvasId] so they (a) survive reload and
  // (b) recolour cleanly when dark mode toggles (a bitmap cannot be recoloured).
  if(typeof _sigStrokes==='undefined'){ window._sigStrokes = {}; }
  if(!_sigStrokes[canvasId]) _sigStrokes[canvasId] = [];
  let _cur = null;

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    // Guard against a zero-width box (pad init'd while its tab was hidden):
    // fall back to 1:1 so coordinates are finite and drawing still works.
    const scaleX = rect.width  ? canvas.width  / rect.width  : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    if(e.touches) return { x:(e.touches[0].clientX-rect.left)*scaleX, y:(e.touches[0].clientY-rect.top)*scaleY };
    return { x:(e.clientX-rect.left)*scaleX, y:(e.clientY-rect.top)*scaleY };
  };

  canvas.addEventListener('mousedown', e=>{ drawing=true; ctx.strokeStyle=_sigInk(); const p=getPos(e); _cur={pts:[{x:p.x,y:p.y}], w:canvas.width, h:canvas.height}; ctx.beginPath(); ctx.moveTo(p.x,p.y); });   /* S606: reference dims travel with the stroke */
  canvas.addEventListener('mousemove', e=>{ if(!drawing) return; const p=getPos(e); if(_cur)_cur.pts.push({x:p.x,y:p.y}); ctx.lineTo(p.x,p.y); ctx.stroke(); });
  canvas.addEventListener('mouseup', ()=>{ drawing=false; if(_cur&&_cur.pts.length){_sigStrokes[canvasId].push(_cur);} _cur=null; if(canvasId==='sig-canvas' && typeof updateCompletionOverview==='function') updateCompletionOverview(); });
  canvas.addEventListener('mouseleave', ()=>{ if(drawing&&_cur&&_cur.pts.length){_sigStrokes[canvasId].push(_cur);} drawing=false; _cur=null; });
  canvas.addEventListener('touchstart', e=>{ e.preventDefault(); drawing=true; ctx.strokeStyle=_sigInk(); const p=getPos(e); _cur={pts:[{x:p.x,y:p.y}], w:canvas.width, h:canvas.height}; ctx.beginPath(); ctx.moveTo(p.x,p.y); }, {passive:false});   /* S606 */
  canvas.addEventListener('touchmove', e=>{ e.preventDefault(); if(!drawing) return; const p=getPos(e); if(_cur)_cur.pts.push({x:p.x,y:p.y}); ctx.lineTo(p.x,p.y); ctx.stroke(); }, {passive:false});
  canvas.addEventListener('touchend', ()=>{ drawing=false; if(_cur&&_cur.pts.length){_sigStrokes[canvasId].push(_cur);} _cur=null; if(canvasId==='sig-canvas' && typeof updateCompletionOverview==='function') updateCompletionOverview(); });
}

// Current signature ink colour for the active theme.
function _sigInk(){ return document.body.classList.contains('dark-mode') ? '#ffffff' : '#1C2333'; }

// Repaint a signature canvas from its stored vector strokes in the current
// theme colour. Used on load (restore) and on dark-mode toggle (recolour).
function _sigRepaint(canvasId){
  if(typeof _sigStrokes==='undefined') return;
  var strokes = _sigStrokes[canvasId]; if(!strokes) return;
  var c = document.getElementById(canvasId); if(!c) return;
  var ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle=_sigInk();
  strokes.forEach(function(s){
    if(!s.pts||!s.pts.length) return;
    /* ═══ S606 — SIGNATURES ARE GEOMETRY, NOT PIXELS ════════════════════════
       Strokes were recorded in the DRAWING device's canvas pixels with no
       reference size. Replayed on a canvas of any other size they landed
       clipped and displaced — a PC signature appeared on a phone as stray
       fragments (Mark's 03-Aug screenshots). Each stroke now carries the
       recording canvas's dimensions; replay applies ONE uniform scale factor
       (never separate x/y — a signature must not squeeze or stretch),
       centred. Legacy strokes without dims draw 1:1 as before. */
    var k = 1, ox = 0, oy = 0;
    if (s.w && s.h) {
      k  = Math.min(c.width / s.w, c.height / s.h);
      ox = (c.width  - s.w * k) / 2;
      oy = (c.height - s.h * k) / 2;
    }
    ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k);
    ctx.lineWidth = 2 / k;   /* constant on-screen ink weight at any size */
    ctx.beginPath(); ctx.moveTo(s.pts[0].x,s.pts[0].y);
    for(var i=1;i<s.pts.length;i++) ctx.lineTo(s.pts[i].x,s.pts[i].y);
    ctx.stroke(); ctx.restore();
  });
}

// Repaint every known signature canvas (called on dark-mode toggle).
function _sigRepaintAll(){
  if(typeof _sigStrokes==='undefined') return;
  Object.keys(_sigStrokes).forEach(function(id){ _sigRepaint(id); });
}

// Render a signature for the PDF in FORCED DARK ink (theme-independent), so a
// report exported in dark mode never produces invisible white-on-white ink.
// Falls back to the live canvas bitmap if there are no vector strokes.
function _sigPrintSrc(canvasId){
  var strokes = (typeof _sigStrokes!=='undefined') ? _sigStrokes[canvasId] : null;
  var c = document.getElementById(canvasId);
  if(strokes && strokes.length && c){
    var t=document.createElement('canvas'); t.width=c.width; t.height=c.height;
    var tx=t.getContext('2d');
    tx.lineWidth=2; tx.lineCap='round'; tx.lineJoin='round'; tx.strokeStyle='#1C2333';
    strokes.forEach(function(s){
      if(!s.pts||!s.pts.length) return;
      var k=1, ox=0, oy=0;   /* S606: same uniform-scale geometry as _sigRepaint */
      if (s.w && s.h) { k=Math.min(t.width/s.w, t.height/s.h); ox=(t.width-s.w*k)/2; oy=(t.height-s.h*k)/2; }
      tx.save(); tx.translate(ox,oy); tx.scale(k,k); tx.lineWidth = 2/k;
      tx.beginPath(); tx.moveTo(s.pts[0].x,s.pts[0].y);
      for(var i=1;i<s.pts.length;i++) tx.lineTo(s.pts[i].x,s.pts[i].y);
      tx.stroke(); tx.restore();
    });
    return t.toDataURL();
  }
  return c ? c.toDataURL() : '';
}

var API = {
  init: initSig,
  ink: _sigInk,
  repaint: _sigRepaint,
  repaintAll: _sigRepaintAll,
  printSrc: _sigPrintSrc,
  VERSION: '1.0.0'
};
if (root) root.SigPad = API;
try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
