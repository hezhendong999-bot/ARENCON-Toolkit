/**
 * ARENCON FRT v2 — Photo Lightbox
 * ════════════════════════════════
 * 
 * Full-screen photo viewer with:
 *   - Pan/zoom (mouse wheel + pinch-to-zoom)
 *   - Swipe left/right for prev/next (touch)
 *   - Arrow buttons + keyboard arrows
 *   - Double-tap to toggle zoom
 *   - Photo info bar (caption, filename)
 *   - Close button + Escape key
 */

import { toast } from '../shared/toast.js';
import { showConfirm } from '../shared/dialogs.js';

var _photos = [];
var _idx = 0;
var _scale = 1;
var _fitScale = 1;
var _panX = 0;
var _panY = 0;
var _dragging = false;
var _lastX = 0;
var _lastY = 0;
var _isOpen = false;
var _rotations = {};
var _ctxLabel = '';
var _toolbarBuilt = false;
var _lastClickTime = 0;

// Touch state
var _touchStartDist = 0;
var _touchStartScale = 1;
var _touchStartMidX = 0;
var _touchStartMidY = 0;
var _touchStartPanX = 0;
var _touchStartPanY = 0;
var _singleTouchX = 0;
var _singleTouchY = 0;
var _lastTapTime = 0;
var _swipeStartX = 0;
var _swipeStartY = 0;
var _swiping = false;

function _el(id) { return document.getElementById(id); }

function _currentRotation() { return _rotations[_idx] || 0; }
function _isRotatedSideways() { var r = _currentRotation(); return r === 90 || r === 270; }
function _updateZoomIndicator() {
  var z = document.getElementById('lb-zoom-indicator');
  if (!z || !_fitScale) return;
  z.textContent = Math.round((_scale / _fitScale) * 100) + '%';
}
function _buildCaption(p) {
  if (p.caption && p.caption.trim()) return p.caption.trim();
  var d = p.addedDate || p.date || p.timestamp || '';
  var dateStr = '';
  if (d) { try { var dt = new Date(d); if (!isNaN(dt.getTime())) dateStr = dt.toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' }); } catch(e){} }
  var label = _ctxLabel || (p._ctxLabel || '');
  if (dateStr && label) return dateStr + ' \u2022 ' + label;
  return label || dateStr || '';
}
function _downloadCurrent() {
  var p = _photos[_idx]; if (!p) return;
  var src = p.r2Url || p.dataUrl || ''; if (!src) return;
  var fname = p.filename || ('photo_' + (_idx+1) + '.jpg');
  if (!/\.(jpe?g|png|webp|gif)$/i.test(fname)) fname += '.jpg';
  fetch(src).then(function(r){return r.blob();}).then(function(blob){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }).catch(function(){ window.open(src, '_blank'); });
}
function _buildToolbar() {
  if (_toolbarBuilt) return;
  var overlay = document.getElementById('lightbox-overlay'); if (!overlay) return;
  var topBar = document.createElement('div');
  topBar.id = 'lb-topbar';
  // S162-2: respect device safe-area insets so the close button isn't clipped
  // by the mobile status bar / TWA top inset / notched display. iPad and
  // Android phones in TWA both pin the chrome-edge differently — env(safe-
  // area-inset-*) lets the browser tell us. Falls back to the literal 10/14
  // values when the env() is unsupported (older WebViews) via the comma
  // syntax inside calc.
  topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;'
    + 'padding:calc(10px + env(safe-area-inset-top,0px)) calc(14px + env(safe-area-inset-right,0px)) 10px calc(14px + env(safe-area-inset-left,0px));'
    + 'background:linear-gradient(180deg,rgba(0,0,0,.65),rgba(0,0,0,0));z-index:10;pointer-events:none;';
  var left = document.createElement('div');
  left.style.cssText = 'flex:1;display:flex;align-items:center;gap:10px;pointer-events:auto;';
  var existingCounter = document.getElementById('lb-counter');
  if (existingCounter) { existingCounter.style.cssText = 'color:#fff;font-family:Calibri,sans-serif;font-size:14px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6);'; left.appendChild(existingCounter); }
  else { var c = document.createElement('div'); c.id = 'lb-counter'; c.style.cssText = 'color:#fff;font-family:Calibri,sans-serif;font-size:14px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6);'; left.appendChild(c); }
  var center = document.createElement('div');
  center.style.cssText = 'flex:1;display:flex;justify-content:center;pointer-events:auto;';
  var zoom = document.createElement('div');
  zoom.id = 'lb-zoom-indicator'; zoom.textContent = '100%';
  zoom.style.cssText = 'background:rgba(0,0,0,.55);color:#fff;font-family:Calibri,sans-serif;font-size:12px;font-weight:600;padding:5px 12px;border-radius:14px;';
  center.appendChild(zoom);
  var right = document.createElement('div');
  right.style.cssText = 'flex:1;display:flex;justify-content:flex-end;gap:8px;pointer-events:auto;';
  function mk(id, label, title) {
    var b = document.createElement('button');
    b.id = id; b.title = title; b.innerHTML = label;
    b.style.cssText = 'background:rgba(0,0,0,.55);color:#fff;border:none;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s;';
    b.addEventListener('mouseenter', function(){ b.style.background = 'rgba(156,39,66,.85)'; });
    b.addEventListener('mouseleave', function(){ b.style.background = 'rgba(0,0,0,.55)'; });
    return b;
  }
  var dl = mk('lb-download', '\u2B07', 'Download');
  var rot = mk('lb-rotate', '\u21BB', 'Rotate 90\u00B0');
  var mkb = mk('lb-markup', '\u270E', 'Markup');
  right.appendChild(mkb); right.appendChild(dl); right.appendChild(rot);
  var existingClose = document.getElementById('lb-close');
  if (existingClose && existingClose.parentNode) {
    existingClose.parentNode.removeChild(existingClose);
    existingClose.style.cssText = 'background:rgba(0,0,0,.55);color:#fff;border:none;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;';
    right.appendChild(existingClose);
  } else { right.appendChild(mk('lb-close', '\u2715', 'Close')); }
  topBar.appendChild(left); topBar.appendChild(center); topBar.appendChild(right);
  overlay.appendChild(topBar);
  dl.addEventListener('click', _downloadCurrent);
  rot.addEventListener('click', function() {
    _rotations[_idx] = (_currentRotation() + 90) % 360;
    _calcFitScale(); _scale = _fitScale; _panX = 0; _panY = 0; _applyTransform();
  });
  mkb.addEventListener('click', _toggleMarkup);
  _buildMarkupBar(overlay);
  _toolbarBuilt = true;
}

var _markupActive = false;
var _closeAfterPersist = false;   // S305-style: commit triggered by closing the lightbox
var _markupBar = null;
function _buildMarkupBar(overlay){
  if (_markupBar) return;
  var bar = document.createElement('div');
  bar.id = 'lb-markupbar';
  bar.style.cssText = 'position:absolute;left:50%;bottom:20px;transform:translateX(-50%);display:none;align-items:center;gap:6px;padding:8px 12px;background:rgba(20,20,28,.92);border-radius:24px;z-index:11;box-shadow:0 4px 16px rgba(0,0,0,.5);max-width:96vw;overflow-x:auto;';
  function tb(id, label, title){
    var b = document.createElement('button');
    b.id = id; b.title = title; b.textContent = label;
    b.style.cssText = 'background:rgba(255,255,255,.12);color:#fff;border:none;min-width:48px;height:40px;padding:0 12px;border-radius:20px;cursor:pointer;font:600 13px Calibri,sans-serif;';
    return b;
  }
  var bPen=tb('mk-pen','Pen','Pen tool');
  var bHi =tb('mk-hi','Highlight','Highlighter');
  var bLn =tb('mk-line','Line','Line');
  var bRc =tb('mk-rect','Rect','Rectangle');
  var bCi =tb('mk-circ','Oval','Ellipse');
  var bAr =tb('mk-arr','Arrow','Arrow');
  var bTx =tb('mk-text','Text','Text label');
  var bEr =tb('mk-er','Eraser','Eraser');
  var bSel=tb('mk-select','Select \u25BE','Select \u2014 tap for Single / Rubber-band / Tap modes');
  // S339 — Select sub-tool flyout (tap-to-open, finger-friendly; LOCKED_SELECT_DRAW_MODEL_S339)
  var subFly=document.createElement('div'); subFly.id='lb-mk-subfly';
  subFly.style.cssText='position:absolute;z-index:25;display:none;flex-direction:column;gap:4px;padding:6px;background:rgba(28,28,38,.98);border:1px solid rgba(255,255,255,.15);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.6);min-width:200px;';
  function subBtn(sub,glyph,name,desc){
    var b=document.createElement('button'); b.dataset.sub=sub;
    b.style.cssText='display:flex;align-items:center;gap:10px;text-align:left;background:rgba(255,255,255,.06);color:#fff;border:none;height:48px;padding:0 12px;border-radius:10px;cursor:pointer;font:600 14px Calibri,sans-serif;';
    b.innerHTML='<span style="width:22px;text-align:center;font-size:16px;">'+glyph+'</span>'+
      '<span style="line-height:1.05;">'+name+'<span style="display:block;font-weight:400;font-size:11px;color:#a9a4b2;margin-top:1px;">'+desc+'</span></span>';
    return b;
  }
  var subSingle=subBtn('single','\u25CE','Single','Tap one mark = select just it');
  var subRubber=subBtn('rubber','\u25C9','Rubber-band','Drag a box around marks');
  var subTap   =subBtn('tap','\u2713','Tap select','Tap to pick, then confirm');
  subFly.appendChild(subSingle); subFly.appendChild(subRubber); subFly.appendChild(subTap);
  overlay.appendChild(subFly);
  // S339 — ✓/✗ confirm bar. ✗ present in ALL select modes when a selection/pick is
  // active (deliberate clear, since empty taps are now sticky); ✓ only in tap mode
  // while picking (collapses individual picks into one group).
  var cBar=document.createElement('div'); cBar.id='lb-mk-confirm';
  cBar.style.cssText='position:absolute;left:50%;bottom:74px;transform:translateX(-50%);display:none;align-items:center;gap:10px;padding:8px 10px 8px 16px;background:rgba(20,20,28,.96);border:1px solid rgba(255,255,255,.14);border-radius:22px;z-index:21;box-shadow:0 6px 20px rgba(0,0,0,.55);';
  var cCnt=document.createElement('span'); cCnt.style.cssText='font:600 13px Calibri,sans-serif;color:#cfcad6;';
  var cOk=document.createElement('button'); cOk.innerHTML='\u2713'; cOk.title='Confirm \u2014 group these';
  cOk.style.cssText='border:none;width:42px;height:42px;border-radius:50%;cursor:pointer;font-size:20px;color:#fff;background:#3FD08A;display:flex;align-items:center;justify-content:center;';
  var cNo=document.createElement('button'); cNo.innerHTML='\u2715'; cNo.title='Cancel \u2014 clear selection';
  cNo.style.cssText='border:none;width:42px;height:42px;border-radius:50%;cursor:pointer;font-size:18px;color:#fff;background:#C0445F;display:flex;align-items:center;justify-content:center;';
  cBar.appendChild(cCnt); cBar.appendChild(cOk); cBar.appendChild(cNo);
  overlay.appendChild(cBar);
  var sep0=document.createElement('div'); sep0.style.cssText='width:1px;height:24px;background:rgba(255,255,255,.25);margin:0 4px;';
  var bUn =tb('mk-undo','\u21B6','Undo (Ctrl+Z)');
  var bRd =tb('mk-redo','\u21B7','Redo (Ctrl+Y)');
  var sep1=document.createElement('div'); sep1.style.cssText='width:1px;height:24px;background:rgba(255,255,255,.25);margin:0 4px;';
  // Color swatches
  var colors = ['#FF0000','#FFEB3B','#5F8068','#1976D2','#000000','#FFFFFF'];
  var swatches = colors.map(function(col){
    var s = document.createElement('button');
    s.className = 'mk-swatch'; s.dataset.col = col;
    s.style.cssText = 'width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:'+col+';cursor:pointer;padding:0;';
    return s;
  });
  // Size slider
  var sizeWrap = document.createElement('div'); sizeWrap.style.cssText='display:flex;align-items:center;gap:6px;padding:0 8px;';
  var sizeLbl = document.createElement('span'); sizeLbl.textContent='Size'; sizeLbl.style.cssText='color:#fff;font:600 12px Calibri,sans-serif;';
  var sizeSld = document.createElement('input'); sizeSld.type='range'; sizeSld.min='1'; sizeSld.max='20'; sizeSld.value='3';
  sizeSld.style.cssText='width:80px;accent-color:#9C2742;';
  sizeWrap.appendChild(sizeLbl); sizeWrap.appendChild(sizeSld);
  // Opacity stepper (Diesel-style: − value + , 10% steps, 10–100%)
  var opWrap = document.createElement('div'); opWrap.style.cssText='display:flex;align-items:center;gap:4px;padding:0 6px;';
  var opLbl = document.createElement('span'); opLbl.textContent='Opacity'; opLbl.style.cssText='color:#fff;font:600 12px Calibri,sans-serif;';
  function opStepBtn(txt){ var b=document.createElement('button'); b.textContent=txt;
    b.style.cssText='background:rgba(255,255,255,.2);border:none;color:white;width:28px;height:28px;border-radius:4px;cursor:pointer;font-size:16px;padding:0;'; return b; }
  var opMinus = opStepBtn('\u2212');
  var opVal = document.createElement('span'); opVal.id='mk-op-val'; opVal.textContent='100%';
  opVal.title='Click to type a value (10–100)';
  opVal.style.cssText='color:white;min-width:36px;text-align:center;font:600 12px Calibri,sans-serif;display:inline-block;cursor:text;border-radius:4px;';
  var opPlus = opStepBtn('+');
  opWrap.appendChild(opLbl); opWrap.appendChild(opMinus); opWrap.appendChild(opVal); opWrap.appendChild(opPlus);
  var sep2=document.createElement('div'); sep2.style.cssText='width:1px;height:24px;background:rgba(255,255,255,.25);margin:0 4px;';
  var bSv =tb('mk-save','Save','Save annotated copy'); bSv.style.background='#5F8068';
  var bCl =tb('mk-clear','Clear','Clear all edits');
  var bRv =tb('mk-revert','Revert','Discard edits');
  var bX  =tb('mk-cancel','\u2715','Exit markup'); bX.style.background='#9C2742';
  var arr = [bPen,bHi,bLn,bRc,bCi,bAr,bTx,bEr,bSel,sep0,bUn,bRd,sep1];
  swatches.forEach(function(s){arr.push(s);});
  arr.push(sizeWrap, opWrap, sep2, bSv,bCl,bRv,bX);
  arr.forEach(function(e){bar.appendChild(e);});
  overlay.appendChild(bar);
  _markupBar = bar;
  function setActive(btn){
    [bPen,bHi,bLn,bRc,bCi,bAr,bTx,bEr,bSel].forEach(function(b){b.style.background='rgba(255,255,255,.12)';});
    btn.style.background='#9C2742';
  }
  function setSwatch(col){
    swatches.forEach(function(s){ s.style.borderColor = (s.dataset.col===col)?'#fff':'rgba(255,255,255,.4)'; s.style.boxShadow = (s.dataset.col===col)?'0 0 0 2px #9C2742':'none';});
  }
  bPen.addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.setTool('pen');setActive(bPen);closeFly();_refreshConfirmBar();});
  bHi .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.setTool('highlight');setActive(bHi);closeFly();_refreshConfirmBar();});
  bLn .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.setTool('line');setActive(bLn);closeFly();_refreshConfirmBar();});
  bRc .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.setTool('rect');setActive(bRc);closeFly();_refreshConfirmBar();});
  bCi .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.setTool('circle');setActive(bCi);closeFly();_refreshConfirmBar();});
  bAr .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.setTool('arrow');setActive(bAr);closeFly();_refreshConfirmBar();});
  bTx .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.setTool('text');setActive(bTx);closeFly();_refreshConfirmBar();});
  bEr .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.setTool('eraser');setActive(bEr);closeFly();_refreshConfirmBar();});
  // S339 — tapping Select toggles the sub-tool flyout. Positioned overlay-relative
  // (centered, just above the toolbar) like the bar/confirm-bar — NOT via viewport
  // rect math, which mis-anchored against the overlay's positioning context.
  subFly.style.left='50%'; subFly.style.transform='translateX(-50%)'; subFly.style.bottom='72px';
  function positionFly(){ /* fixed overlay-relative anchor; no per-open recompute needed */ }
  function closeFly(){ subFly.style.display='none'; }
  bSel.addEventListener('click',function(e){
    e.stopPropagation();
    if (subFly.style.display==='flex'){ closeFly(); }
    else { subFly.style.display='flex'; }
  });
  function markSub(sub){
    [subSingle,subRubber,subTap].forEach(function(b){ b.style.background = (b.dataset.sub===sub)?'#9C2742':'rgba(255,255,255,.06)'; });
  }
  [subSingle,subRubber,subTap].forEach(function(b){
    b.addEventListener('click',function(e){
      e.stopPropagation();
      if (window.MarkupEngine) window.MarkupEngine.setSelectSub(b.dataset.sub);
      setActive(bSel); markSub(b.dataset.sub);
      closeFly(); _refreshConfirmBar();
    });
  });
  markSub('single');
  // close flyout on any outside tap (mouse + touch)
  function _flyOutside(ev){ if (subFly.style.display==='flex' && !subFly.contains(ev.target) && ev.target!==bSel && !bSel.contains(ev.target)) closeFly(); }
  document.addEventListener('mousedown',_flyOutside);
  document.addEventListener('touchstart',_flyOutside,{passive:true});
  // S339 — confirm bar: ✗ whenever a selection/pick is active; ✓ added in tap mode while picking.
  function _refreshConfirmBar(){
    var E=window.MarkupEngine;
    if (!E || E.tool!=='select' || !E.hasActiveSelection()){ cBar.style.display='none'; return; }
    cBar.style.display='flex';
    var picking = E.isPicking && E.isPicking();
    if (picking){ cOk.style.display='flex'; cCnt.textContent=E.pickCount()+' picked'; }
    else { cOk.style.display='none'; cCnt.textContent=E.selectionCount()+' selected'; }
  }
  cOk.addEventListener('click',function(){ if(window.MarkupEngine){ window.MarkupEngine.confirmPick(); } _refreshConfirmBar(); });
  cNo.addEventListener('click',function(){ if(window.MarkupEngine){ window.MarkupEngine.cancelSelect(); } _refreshConfirmBar(); });
  if (window.MarkupEngine) window.MarkupEngine.onSelChange(_refreshConfirmBar);
  bUn .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.undo();});
  bRd .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.redo();});
  swatches.forEach(function(s){
    s.addEventListener('click',function(){
      if (window.MarkupEngine) window.MarkupEngine.setColor(s.dataset.col);
      setSwatch(s.dataset.col);
    });
  });
  sizeSld.addEventListener('input',function(){
    if (window.MarkupEngine) window.MarkupEngine.setSize(parseInt(sizeSld.value,10));
  });
  // Opacity stepper — 10% steps, clamp 10–100%; updates current draw opacity + any selection
  var _opPct = 100;
  function _applyOp(){ opVal.textContent=_opPct+'%'; if (window.MarkupEngine) window.MarkupEngine.setOpacity(_opPct/100); }
  opMinus.addEventListener('click',function(){ _opPct=Math.max(10,_opPct-10); _applyOp(); });
  opPlus .addEventListener('click',function(){ _opPct=Math.min(100,_opPct+10); _applyOp(); });
  // S329 (#24, Mark): CLICK-TO-TYPE opacity. Click the % value -> editable number
  // input; type 10–100; Enter/blur commits (clamped). Esc cancels. +/- still step 10%.
  var _opEditing=false;
  opVal.addEventListener('click',function(){
    if(_opEditing) return; _opEditing=true;
    var inp=document.createElement('input');
    inp.type='number'; inp.min='10'; inp.max='100'; inp.value=String(_opPct);
    inp.style.cssText='width:44px;text-align:center;font:600 12px Calibri,sans-serif;border:1px solid #9C2742;border-radius:4px;padding:2px 0;background:#fff;color:#1B1A22;';
    opVal.replaceWith(inp); inp.focus(); inp.select();
    function commit(apply){
      if(!_opEditing) return; _opEditing=false;
      if(apply){ var v=parseInt(inp.value,10); if(isNaN(v)) v=_opPct; _opPct=Math.max(10,Math.min(100,v)); }
      inp.replaceWith(opVal); _applyOp();
    }
    inp.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'){ ev.preventDefault(); commit(true); }
      else if(ev.key==='Escape'){ ev.preventDefault(); commit(false); }
    });
    inp.addEventListener('blur',function(){ commit(true); });
  });
  bCl .addEventListener('click',function(){window.MarkupEngine&&window.MarkupEngine.clear();});
  bRv .addEventListener('click',_revertMarkup);
  bSv .addEventListener('click',_saveMarkup);
  bX  .addEventListener('click',_toggleMarkup);
  bPen.click();
  setSwatch('#FF0000');
}

function _exitMarkupNoSave(){
  if (!window.MarkupEngine) return;
  window.MarkupEngine.detach();
  if (_markupBar) _markupBar.style.display='none';
  // S339 — hide the select confirm bar + sub-tool flyout on markup exit
  var _cb=document.getElementById('lb-mk-confirm'); if(_cb) _cb.style.display='none';
  var _sf=document.getElementById('lb-mk-subfly'); if(_sf) _sf.style.display='none';
  _markupActive = false;
}
// Copied from Diesel S305/S306: leaving markup mode COMMITS any drawn strokes —
// no explicit Save click required. The pencil toggle (✎), the ✕ button, Escape,
// and closing the lightbox all bake + persist (via _saveMarkup, which dispatches
// frt-markup-saved and then exits). Exiting with a clean/undirty canvas just exits.
function _maybeCommitOnExit(){
  if (window.MarkupEngine && window.MarkupEngine.isDirty()){
    _saveMarkup();        // bakes, dispatches frt-markup-saved, then exits markup
  } else {
    _exitMarkupNoSave();
  }
}
function _toggleMarkup(){
  // S120 Push 14: native alert → toast for transient infrastructure errors.
  if (!window.MarkupEngine){ toast('Markup engine not loaded', 'error'); return; }
  var img = document.getElementById('lb-image');
  var canvas = document.getElementById('lb-canvas');
  if (!img || !canvas) return;
  if (_markupActive){
    _maybeCommitOnExit();   // exiting now auto-commits (was: silent detach/discard)
  } else {
    // S329 (#20/#21/#22, Mark): markup now works while zoomed. The canvas stays attached
    // to lb-canvas (outer container, untransformed) and keeps the engine's original
    // coordinate space (so line widths, fonts, and saveBlob() output are all unchanged).
    // To make markup zoom/pan WITH the photo, _applyTransform mirrors the wrap's transform
    // onto the markup canvas (see _applyMarkupTransform). We sync the canvas to the photo's
    // FIT box once at attach (baseline), then the shared transform scales/pans both together.
    // We no longer force fit-scale on entry, so the current zoom carries into markup.
    var prevScale = _scale, prevPanX = _panX, prevPanY = _panY;
    _scale = _fitScale; _panX = 0; _panY = 0; _applyTransform();  // baseline so _sync captures fit box
    var p = _photos[_idx] || {};
    window.MarkupEngine.attach(canvas, img, p._origBlob || null, null);
    // restore the zoom the user had, now mirrored onto the freshly-synced canvas
    _scale = prevScale; _panX = prevPanX; _panY = prevPanY; _applyTransform();
    if (_markupBar) _markupBar.style.display='flex';
    _markupActive = true;
  }
}

function _saveMarkup(){
  if (!window.MarkupEngine || !window.MarkupEngine.isDirty()){ _exitMarkupNoSave(); return; }
  window.MarkupEngine.saveBlob().then(function(blob){
    var p = _photos[_idx]; if (!p){ _exitMarkupNoSave(); return; }
    if (!p._origBlob && p.dataUrl) p._origBlob = p.dataUrl;
    var url = URL.createObjectURL(blob);
    p.dataUrl = url; p._annotated = true;
    var img = document.getElementById('lb-image');
    if (img) img.src = url;
    // R2 upload hook — defer to host app via custom event
    try { document.dispatchEvent(new CustomEvent('frt-markup-saved',{detail:{photo:p,blob:blob,index:_idx}})); } catch(e){}
    _exitMarkupNoSave();
    if (_closeAfterPersist){ _closeAfterPersist = false; _finishClose(); return; }   // close was the trigger
    if (_navAfterPersist != null){ var ni = _navAfterPersist; _navAfterPersist = null; _showPhoto(ni); }   // nav was the trigger
  }).catch(function(e){ _closeAfterPersist = false; _navAfterPersist = null; toast('Save failed: '+e.message, 'error'); /* stay in markup so strokes aren't lost */ });
}

function _revertMarkup(){
  if (!window.MarkupEngine) return;
  var p = _photos[_idx]; if (!p) return;
  // S115: only confirm + persist if there's actually a saved markup to revert.
  // (If user just dropped a stroke that hasn't been saved, MarkupEngine.clear
  // is enough — no persisted state to undo.)
  var hasSaved = !!p._origBackupId;
  console.log('[Markup] _revertMarkup called — hasSaved=', hasSaved, 'origBackupId=', p._origBackupId, 'r2Key=', p.r2Key);
  if (!hasSaved && !window.MarkupEngine.isDirty()) { console.log('[Markup] revert: nothing to do'); return; }
  var doRevert = function(){
    window.MarkupEngine.clear();
    if (hasSaved) {
      // Dispatch revert event — photos.js handler does R2 cleanup,
      // backup-record removal, sibling restoration, and persistence.
      console.log('[Markup] dispatching frt-markup-reverted for photo id=', p.id);
      try { document.dispatchEvent(new CustomEvent('frt-markup-reverted',{detail:{photo:p,index:_idx}})); } catch(e){ console.warn('[Markup] dispatch error:', e); }
      console.log('[Markup] after dispatch — p.r2Key=', p.r2Key, 'p.r2Url=', p.r2Url, 'p._origBackupId=', p._origBackupId);
      // Force image reload from the restored r2Url. Add cache-bust in case
      // the browser cached anything under the old marked URL.
      var img = document.getElementById('lb-image');
      if (img) {
        var src = p.r2Url || p._origBlob || '';
        if (typeof src !== 'string' && src) src = URL.createObjectURL(src);
        if (src) {
          // Cache-bust to force browser refetch — guarantees the marked
          // image (if same URL was reused, e.g. via service worker) is
          // dropped and the original is fetched fresh.
          var bust = (src.indexOf('?') >= 0 ? '&' : '?') + 'rv=' + Date.now();
          img.src = src + bust;
          console.log('[Markup] revert: img.src set to', src + bust);
        } else {
          console.warn('[Markup] revert: no src to set on img — p.r2Url and _origBlob both missing');
        }
      }
      delete p._annotated;
      // If we're currently in markup mode, exit it so the user sees the
      // restored original cleanly.
      if (_markupActive) {
        try { _toggleMarkup(); } catch(_){}
      }
    } else if (p._origBlob) {
      // No persisted markup — just restore the in-memory original.
      p.dataUrl = (typeof p._origBlob === 'string') ? p._origBlob : URL.createObjectURL(p._origBlob);
      delete p._annotated;
      var img2 = document.getElementById('lb-image');
      if (img2) img2.src = p.dataUrl;
    }
  };
  if (hasSaved) {
    // S120 Push 14: confirm only when revert will hit cloud + remove records.
    // Switched from native confirm() to showConfirm — destructive action
    // deserves the same modal style as the rest of the app.
    showConfirm('Revert to original?', 'All markup will be removed and the (original) backup will also be deleted. This cannot be undone.').then(function(yes) {
      if (yes) doRevert();
    });
  } else {
    doRevert();
  }
}

function _clampPan() {
  var img = _el('lb-image');
  var area = _el('lb-canvas');
  if (!img || !area || !img.naturalWidth) return;
  var aw = area.clientWidth;
  var ah = area.clientHeight;
  var nw = _isRotatedSideways() ? img.naturalHeight : img.naturalWidth;
  var nh = _isRotatedSideways() ? img.naturalWidth : img.naturalHeight;
  var sw = nw * _scale;
  var sh = nh * _scale;
  if (sw <= aw) { _panX = (aw - sw) / 2; }
  else { _panX = Math.min(0, Math.max(aw - sw, _panX)); }
  if (sh <= ah) { _panY = (ah - sh) / 2; }
  else { _panY = Math.min(0, Math.max(ah - sh, _panY)); }
}

function _applyTransform() {
  _clampPan();
  var wrap = _el('lb-img-wrap');
  if (!wrap) return;
  // S115 fix: rotate around photo CENTER while keeping CSS transform-origin
  // at 0,0 (which pan/zoom math depends on). Trick: after rotating around
  // 0,0, the image's bounding box shifts off-screen. We add a rotation-
  // dependent offset to translate the rotated bbox back into the visible
  // area so its top-left aligns with (panX, panY) — same coords pan/zoom
  // already compute. End result: photo appears to rotate around its center.
  var img = _el('lb-image');
  var rot = _currentRotation();
  var offX = 0, offY = 0;
  if (img && img.naturalWidth) {
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    // After rotate(θ) around (0,0) with scale s applied AFTER rotate, the
    // visible bbox of the scaled+rotated image relative to the wrapper origin:
    //   0°  → (0, 0)            no offset
    //   90° → (-nh*s, 0)        push X by +nh*s
    //   180°→ (-nw*s, -nh*s)    push X by +nw*s, Y by +nh*s
    //   270°→ (0, -nw*s)        push Y by +nw*s
    if (rot === 90)  { offX = nh * _scale; }
    else if (rot === 180) { offX = nw * _scale; offY = nh * _scale; }
    else if (rot === 270) { offY = nw * _scale; }
  }
  // Order matters — rotate FIRST, then scale, all wrapped in a translate.
  // CSS applies transforms right-to-left so the inner (scale) hits first,
  // then rotate pivots the scaled image around (0,0), then translate moves
  // it into place.
  wrap.style.transform = 'translate3d(' + (_panX + offX) + 'px,' + (_panY + offY) + 'px,0) rotate(' + rot + 'deg) scale(' + _scale + ')';
  // S329 (#20/#21/#22, Mark): mirror the SAME transform onto the markup canvas so markup
  // zooms/pans WITH the photo. The canvas was synced to the fit-display box (engine's
  // original coord space — untouched), so its relative scale is k = _scale/_fitScale; the
  // pan/rotate/offset terms are identical to the wrap. Proven aligned at all zoom/pan/fit.
  if (_markupActive && window.MarkupEngine && window.MarkupEngine.canvas) {
    var mc = window.MarkupEngine.canvas;
    var k = (_fitScale ? (_scale / _fitScale) : 1);
    mc.style.transformOrigin = '0 0';
    mc.style.transform = 'translate3d(' + (_panX + offX) + 'px,' + (_panY + offY) + 'px,0) rotate(' + rot + 'deg) scale(' + k + ')';
  }
  _updateZoomIndicator();
}

function _calcFitScale() {
  var img = _el('lb-image');
  var area = _el('lb-canvas');
  if (!img || !area || !img.naturalWidth) { _fitScale = 1; return; }
  var nw = _isRotatedSideways() ? img.naturalHeight : img.naturalWidth;
  var nh = _isRotatedSideways() ? img.naturalWidth : img.naturalHeight;
  _fitScale = Math.min(area.clientWidth / nw, area.clientHeight / nh);
  if (_fitScale > 1) _fitScale = 1;
}

function _resetView() {
  _scale = _fitScale;
  _panX = 0; _panY = 0;
  _clampPan();
  _applyTransform();
}

function _showPhoto(idx) {
  if (idx < 0 || idx >= _photos.length) return;
  _idx = idx;
  var p = _photos[idx];
  var img = _el('lb-image');
  var info = _el('lb-info');
  var counter = _el('lb-counter');
  if (!img) return;

  var src = p.r2Url || p.dataUrl || p.thumb || '';
  img.onload = function() {
    _calcFitScale();
    _scale = _fitScale;
    _panX = 0; _panY = 0;
    _applyTransform();
  };
  // S114 P1.4: set crossOrigin BEFORE src so the R2 image loads via CORS and the
  // canvas isn't tainted when MarkupEngine.saveBlob() draws it into a canvas
  // and calls toBlob(). R2 worker sends Access-Control-Allow-Origin matching
  // the GitHub Pages origin; verified via curl.
  // Setting crossOrigin on dataUrl/blob URLs is a harmless no-op.
  img.crossOrigin = 'anonymous';
  img.src = src;

  if (info) info.textContent = _buildCaption(p);
  if (counter) counter.textContent = (_photos.length > 1) ? (idx + 1) + ' / ' + _photos.length : '';

  // Prev/next button visibility
  var prev = _el('lb-prev');
  var next = _el('lb-next');
  if (prev) prev.style.display = _photos.length > 1 ? '' : 'none';
  if (next) next.style.display = _photos.length > 1 ? '' : 'none';
}

function _open(photos, startIdx, opts) {
  if (!photos || !photos.length) return;
  _photos = photos;
  _idx = startIdx || 0;
  _isOpen = true;
  _rotations = {};
  _ctxLabel = (opts && opts.contextLabel) || '';
  _buildToolbar();

  var overlay = _el('lightbox-overlay');
  if (overlay) {
    // S205 — escape any ancestor stacking context. The lightbox lives in
    // index.html nested below body; when opened over a body-level modal
    // (e.g. the pin-editor #pinfocus-overlay), its z-index is scoped to its
    // wrapper and it renders BEHIND that modal. Re-parenting to be the last
    // child of <body> puts it in the root stacking context and paints last.
    // No-op once it's already there (idempotent across opens).
    if (overlay.parentNode !== document.body || overlay !== document.body.lastElementChild) {
      document.body.appendChild(overlay);
    }
    overlay.classList.add('open');
    document.body.classList.add('lb-open');
  }
  _showPhoto(_idx);
}

function _close() {
  // Copy Diesel S305: closing the lightbox with unsaved strokes COMMITS them
  // first (bake + persist), then tears down — no silent discard. If clean, just close.
  if (_markupActive && window.MarkupEngine && window.MarkupEngine.isDirty()){
    _closeAfterPersist = true;
    _saveMarkup();   // on success its .then exits markup; _finishClose runs after
    return;
  }
  _finishClose();
}
function _finishClose() {
  if (_markupActive && window.MarkupEngine) { window.MarkupEngine.detach(); _markupActive = false; if (_markupBar) _markupBar.style.display='none'; }
  _isOpen = false;
  _photos = [];
  _rotations = {};
  _ctxLabel = '';
  var overlay = _el('lightbox-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    document.body.classList.remove('lb-open');
  }
  var img = _el('lb-image');
  if (img) img.src = '';
}

// #3 (Mark): markup is "locked in" — navigating away never deletes it. If you
// page prev/next while marking with unsaved strokes, commit the current photo's
// markup FIRST (bake+persist), then navigate once the save resolves. Mirrors
// Diesel: leaving a photo mid-markup persists rather than discards.
var _navAfterPersist = null;   // target index to show after a nav-triggered commit
function _navCommitThen(targetIdx){
  if (targetIdx < 0 || targetIdx >= _photos.length) return;
  if (_markupActive && window.MarkupEngine && window.MarkupEngine.isDirty()){
    _navAfterPersist = targetIdx;
    _saveMarkup();   // bakes+persists; its .then navigates via _navAfterPersist
    return;
  }
  // Not marking (or nothing drawn) — if markup is open but clean, exit it cleanly first.
  if (_markupActive) _exitMarkupNoSave();
  _showPhoto(targetIdx);
}
function _next() { _navCommitThen(_idx + 1); }
function _prev() { _navCommitThen(_idx - 1); }

// ── Event Wiring ─────────────────────────────────────────

// Close button
document.addEventListener('click', function(e) {
  if (!_isOpen) return;
  if (e.target.id === 'lb-close' || (e.target.closest && e.target.closest('#lb-close'))) { _close(); return; }
  if (e.target.id === 'lb-prev' || (e.target.closest && e.target.closest('#lb-prev'))) { _prev(); return; }
  if (e.target.id === 'lb-next' || (e.target.closest && e.target.closest('#lb-next'))) { _next(); return; }
  // Backdrop-click close disabled (accidental dismiss). Lightbox closes only
  // via the × button or Escape. (Was: click on lb-canvas at fit-scale closed.)
});

// Keyboard
document.addEventListener('keydown', function(e) {
  if (!_isOpen) return;
  if (e.key === 'Escape') { if (_markupActive) { _toggleMarkup(); } else { _close(); } e.preventDefault(); return; }
  if (_markupActive && (e.ctrlKey || e.metaKey)) {
    if (e.key === 'z' || e.key === 'Z') { window.MarkupEngine && window.MarkupEngine.undo(); e.preventDefault(); return; }
    if (e.key === 'y' || e.key === 'Y') { window.MarkupEngine && window.MarkupEngine.redo(); e.preventDefault(); return; }
  }
  if (_markupActive && (e.key === 'Delete' || e.key === 'Backspace')) {
    window.MarkupEngine && window.MarkupEngine.deleteSelection(); e.preventDefault(); return;
  }
  // During markup, suppress photo-nav and image-rotate shortcuts (they'd disrupt annotating)
  if (_markupActive && ['ArrowLeft','ArrowRight','r','R'].indexOf(e.key) !== -1) { return; }
  if (e.key === 'ArrowLeft') { _prev(); e.preventDefault(); }
  if (e.key === 'ArrowRight') { _next(); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') { _scale = Math.min(8, _scale * 1.2); _applyTransform(); }
  if (e.key === '-') { _scale = Math.max(_fitScale, _scale / 1.2); if (_scale <= _fitScale) { _panX = 0; _panY = 0; } _applyTransform(); }
  if (e.key === '0') { _resetView(); }
  if (e.key === 'r' || e.key === 'R') { _rotations[_idx] = (_currentRotation() + 90) % 360; _calcFitScale(); _scale = _fitScale; _panX = 0; _panY = 0; _applyTransform(); }
});

// Mouse double-click → reset zoom (S70)
document.addEventListener('dblclick', function(e) {
  if (!_isOpen) return;
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;
  e.preventDefault();
  if (_scale > _fitScale * 1.05) { _resetView(); }
  else {
    var rect = area.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var imgX = (mx - _panX) / _scale, imgY = (my - _panY) / _scale;
    _scale = Math.min(8, _fitScale * 2.5);
    _panX = mx - imgX * _scale; _panY = my - imgY * _scale;
    _applyTransform();
  }
});


// Mouse wheel zoom
document.addEventListener('wheel', function(e) {
  if (!_isOpen) return;
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;
  e.preventDefault();
  var rect = area.getBoundingClientRect();
  var mx = e.clientX - rect.left;
  var my = e.clientY - rect.top;
  var imgX = (mx - _panX) / _scale;
  var imgY = (my - _panY) / _scale;
  var delta = e.deltaY > 0 ? 0.9 : 1.1;
  var newScale = Math.max(_fitScale, Math.min(8, _scale * delta));
  if (newScale <= _fitScale) { _panX = 0; _panY = 0; _scale = _fitScale; _applyTransform(); return; }
  _panX = mx - imgX * newScale;
  _panY = my - imgY * newScale;
  _scale = newScale;
  _applyTransform();
}, { passive: false });

// Mouse drag pan
document.addEventListener('mousedown', function(e) {
  if (!_isOpen) return;
  if (_markupActive) return;  // S327 (B2): during markup the engine owns the pointer — no pan
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;
  if (e.target.closest && (e.target.closest('#lb-prev') || e.target.closest('#lb-next') || e.target.closest('#lb-close') || e.target.closest('#lb-topbar'))) return;
  _dragging = true;
  _lastX = e.clientX;
  _lastY = e.clientY;
  e.preventDefault();
});

document.addEventListener('mousemove', function(e) {
  if (!_isOpen || !_dragging) return;
  if (_scale <= _fitScale) return;
  _panX += e.clientX - _lastX;
  _panY += e.clientY - _lastY;
  _lastX = e.clientX;
  _lastY = e.clientY;
  _applyTransform();
});

document.addEventListener('mouseup', function() {
  if (_isOpen) _dragging = false;
});

// Touch: pinch-to-zoom + swipe + double-tap
document.addEventListener('touchstart', function(e) {
  if (!_isOpen) return;
  // S329 (#20/#21/#22, Mark): two-finger gestures ALWAYS pinch-zoom/pan, even with a
  // markup tool active (so you never deactivate the tool to reposition). One finger is
  // blocked here only when markup is active (the engine owns single-finger draw/select);
  // with no tool active, one finger pans as before.
  if (_markupActive && e.touches.length < 2) return;
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;
  if (e.target.closest && (e.target.closest('#lb-prev') || e.target.closest('#lb-next') || e.target.closest('#lb-close') || e.target.closest('#lb-topbar'))) return;

  if (e.touches.length === 2) {
    e.preventDefault();
    var dx = e.touches[1].clientX - e.touches[0].clientX;
    var dy = e.touches[1].clientY - e.touches[0].clientY;
    _touchStartDist = Math.sqrt(dx * dx + dy * dy);
    _touchStartScale = _scale;
    var rect = area.getBoundingClientRect();
    _touchStartMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    _touchStartMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    _touchStartPanX = _panX;
    _touchStartPanY = _panY;
    _swiping = false;
  } else if (e.touches.length === 1) {
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swiping = (_scale <= _fitScale * 1.05);

    // Double-tap detection
    var now = Date.now();
    if (now - _lastTapTime < 350) {
      e.preventDefault();
      if (_scale > _fitScale * 1.5) { _resetView(); }
      else {
        var rect = area.getBoundingClientRect();
        var mx = e.touches[0].clientX - rect.left;
        var my = e.touches[0].clientY - rect.top;
        var imgX = (mx - _panX) / _scale;
        var imgY = (my - _panY) / _scale;
        _scale = Math.min(8, _fitScale * 3);
        _panX = mx - imgX * _scale;
        _panY = my - imgY * _scale;
        _applyTransform();
      }
      _lastTapTime = 0;
      _swiping = false;
    } else {
      _lastTapTime = now;
    }
  }
}, { passive: false });

document.addEventListener('touchmove', function(e) {
  if (!_isOpen) return;
  if (_markupActive && e.touches.length < 2) return;  // S329: 2-finger pinch/pan ok during markup; 1-finger = draw
  var area = _el('lb-canvas');
  if (!area || !area.contains(e.target)) return;

  if (e.touches.length === 2) {
    e.preventDefault();
    _swiping = false;
    var dx = e.touches[1].clientX - e.touches[0].clientX;
    var dy = e.touches[1].clientY - e.touches[0].clientY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (_touchStartDist === 0) return;
    var ratio = dist / _touchStartDist;
    var newScale = Math.max(_fitScale, Math.min(8, _touchStartScale * ratio));
    var imgX = (_touchStartMidX - _touchStartPanX) / _touchStartScale;
    var imgY = (_touchStartMidY - _touchStartPanY) / _touchStartScale;
    _scale = newScale;
    _panX = _touchStartMidX - imgX * newScale;
    _panY = _touchStartMidY - imgY * newScale;
    _applyTransform();
  } else if (e.touches.length === 1) {
    if (_swiping) {
      // Allow horizontal swipe for prev/next (don't prevent default for natural scrolling feel)
      var diffX = e.touches[0].clientX - _swipeStartX;
      var diffY = e.touches[0].clientY - _swipeStartY;
      // If moving more vertically, stop treating as swipe
      if (Math.abs(diffY) > Math.abs(diffX) * 1.5 && Math.abs(diffX) < 30) { _swiping = false; }
    } else if (_scale > _fitScale) {
      e.preventDefault();
      _panX += e.touches[0].clientX - _singleTouchX;
      _panY += e.touches[0].clientY - _singleTouchY;
      _applyTransform();
    }
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;
  }
}, { passive: false });

document.addEventListener('touchend', function(e) {
  if (!_isOpen) return;
  // S329: no blanket markup bail here. _swiping is only set by single-finger viewing
  // touchstart, which is now blocked during markup — so swipe-to-next can't fire in
  // markup mode anyway. The pinch/finger bookkeeping below is harmless to run.
  if (e.touches.length < 2) _touchStartDist = 0;
  if (e.touches.length === 1) {
    _singleTouchX = e.touches[0].clientX;
    _singleTouchY = e.touches[0].clientY;
  }
  // Swipe detection on final release
  if (_swiping && e.touches.length === 0 && e.changedTouches && e.changedTouches.length) {
    var endX = e.changedTouches[0].clientX;
    var diffX = endX - _swipeStartX;
    if (Math.abs(diffX) > 60) {
      if (diffX > 0) _prev(); else _next();
    }
    _swiping = false;
  }
});

// ── Public API ───────────────────────────────────────────
export var Lightbox = {
  open: _open,
  close: _close,
  isOpen: function() { return _isOpen; }
};

// Caption editing
document.addEventListener('click', function(e) {
  if (!_isOpen) return;
  var info = _el('lb-info');
  if (e.target === info || (e.target.closest && e.target.closest('#lb-info'))) {
    var p = _photos[_idx];
    if (!p) return;
    // Replace info bar with input
    var current = p.caption || '';
    info.innerHTML = '<input id="lb-caption-input" type="text" value="' + current.replace(/"/g, '&quot;') + '" placeholder="Add caption..." style="width:100%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:4px 8px;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;color:#d0d8f0;outline:none;">';
    var inp = info.querySelector('#lb-caption-input');
    if (inp) {
      inp.focus();
      inp.select();
      inp.addEventListener('blur', function() {
        p.caption = inp.value.trim();
        info.textContent = _buildCaption(p);
      });
      inp.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { inp.blur(); ev.preventDefault(); }
        if (ev.key === 'Escape') { inp.value = current; inp.blur(); ev.preventDefault(); }
        ev.stopPropagation(); // Prevent lightbox keyboard shortcuts
      });
    }
  }
});

// Global access for cross-module use
window._frtLightbox = Lightbox;
