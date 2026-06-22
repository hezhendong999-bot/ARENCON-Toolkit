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

// S339 (Mark): text-edit chip styles. Injected once. Fixed top control row
// (grab · − size + · ↵ · ✕ · ✓) over an auto-expanding multi-line textarea.
// Calibri only; burgundy/dark per the design system. Lives here so the photo
// markup text tool is self-contained (no separate CSS-file push needed).
(function _injectTextChipCSS(){
  if (document.getElementById('mk-text-chip-css')) return;
  var st = document.createElement('style'); st.id = 'mk-text-chip-css';
  st.textContent =
    '.mk-text-chip{position:fixed;display:flex;flex-direction:column;background:rgba(20,18,24,.94);'+
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1.5px solid #C9476A;'+
      'border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.5);overflow:hidden;z-index:10000;'+
      'min-width:230px;max-width:92vw;font-family:Calibri,sans-serif;}'+
    '.mk-text-chip .mk-tc-bar{display:flex;align-items:stretch;height:40px;flex:0 0 40px;'+
      'border-bottom:1px solid rgba(255,255,255,.10);}'+
    '.mk-text-chip .mk-tc-grab{width:18px;flex:0 0 auto;cursor:move;display:flex;align-items:center;'+
      'justify-content:center;background:rgba(255,255,255,.05);touch-action:none;}'+
    '.mk-text-chip .mk-tc-grab span{width:3px;height:16px;border-radius:2px;'+
      'background:repeating-linear-gradient(transparent 0 2px,#a09aa8 2px 4px);}'+
    '.mk-text-chip .mk-tc-size{display:flex;align-items:center;flex:0 0 auto;}'+
    '.mk-text-chip .mk-tc-size button{width:32px;align-self:stretch;border:none;background:transparent;'+
      'color:#f4f3f6;font-size:18px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;}'+
    '.mk-text-chip .mk-tc-size button:active{background:rgba(255,255,255,.10);}'+
    '.mk-text-chip .mk-tc-sizeval{display:flex;align-items:center;justify-content:center;min-width:28px;'+
      'font-size:12px;color:#a09aa8;font-variant-numeric:tabular-nums;}'+
    '.mk-text-chip .mk-tc-sep{width:1px;align-self:stretch;background:rgba(255,255,255,.10);margin:0 2px;}'+
    '.mk-text-chip .mk-tc-btn{width:42px;flex:0 0 auto;border:none;cursor:pointer;display:flex;'+
      'align-items:center;justify-content:center;color:#f4f3f6;background:transparent;}'+
    '.mk-text-chip .mk-tc-btn svg{width:18px;height:18px;}'+
    '.mk-text-chip .mk-tc-ret:active{background:rgba(255,255,255,.10);}'+
    '.mk-text-chip .mk-tc-x{color:#a09aa8;}.mk-text-chip .mk-tc-x:active{background:rgba(255,255,255,.10);}'+
    '.mk-text-chip .mk-tc-ok{background:#3FD08A;color:#fff;}.mk-text-chip .mk-tc-ok:active{filter:brightness(.9);}'+
    '.mk-text-chip .mk-tc-dot{width:20px;height:20px;border-radius:50%;border:2px solid #fff;display:block;background:#FF0000;}'+
    '.mk-text-chip .mk-tc-colorpop{position:absolute;top:44px;right:8px;display:flex;flex-wrap:wrap;gap:6px;width:118px;'+
      'padding:8px;background:rgba(34,34,44,.99);border:1px solid rgba(255,255,255,.16);border-radius:12px;'+
      'box-shadow:0 8px 26px rgba(0,0,0,.6);z-index:10001;}'+
    '.mk-text-chip .mk-tc-sw{width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.4);'+
      'cursor:pointer;padding:0;}'+
    '.mk-text-chip .mk-tc-sw.sel{border-color:#fff;box-shadow:0 0 0 2px #9C2742;}'+
    '.mk-text-chip .mk-tc-spacer{flex:1 1 auto;}'+
    '.mk-text-chip .mk-text-area{border:none;outline:none;background:rgba(20,18,24,.70);color:#f4f3f6;resize:none;'+
      'overflow:hidden;font-weight:600;font-family:Calibri,sans-serif;line-height:1.25;padding:9px 11px;'+
      'min-width:210px;width:210px;caret-color:#C9476A;border-radius:0 0 8px 8px;}'+
    '.mk-text-chip .mk-text-area::placeholder{color:#a09aa8;font-weight:400;}'+
    // S339 (Mark): on-photo editable text box (replaces the floating chip). Sits over
    // the canvas; controls live in the docked text bar. Faint dark backing while
    // editing (readability); committed bg is drawn on the canvas stroke instead.
    '.mk-text-box{position:fixed;z-index:10000;min-width:12px;font-weight:600;font-family:Calibri,sans-serif;'+
      'line-height:1.25;white-space:pre;color:#fff;background:rgba(20,18,24,.55);padding:2px 6px;border-radius:5px;'+
      'outline:1.5px solid #C9476A;caret-color:#C9476A;-webkit-user-select:text;user-select:text;-webkit-touch-callout:none;}'+
    '.mk-text-box:empty::before{content:attr(data-empty-placeholder);color:#a09aa8;font-weight:400;}'+
    // S339 (Mark): while the lightbox is open, hide the header inspector chip +
    // sign-out so the green "mhe / Sign out" badge stops overlapping the markup
    // ✓/✗ confirm bar. Auto-restores on close (body.lb-open is removed there).
    'body.lb-open #inspector-chip,body.lb-open #btn-signout,body.lb-open #presence-chip{display:none!important;}';
  (document.head||document.documentElement).appendChild(st);
})();


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
  bar.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:none;flex-direction:column;gap:6px;padding:9px 10px;background:rgba(20,20,28,.94);border-radius:16px;z-index:11;box-shadow:0 6px 20px rgba(0,0,0,.5);max-width:calc(100vw - 16px);box-sizing:border-box;';
  var row1=document.createElement('div'); row1.style.cssText='display:flex;flex-wrap:nowrap;justify-content:center;align-items:center;gap:4px;';
  var rdiv=document.createElement('div'); rdiv.style.cssText='height:1px;background:rgba(255,255,255,.10);margin:1px 4px;';
  var row2=document.createElement('div'); row2.style.cssText='display:flex;flex-wrap:nowrap;justify-content:center;align-items:center;gap:4px;';
  // S339 — drawing-viewer icon set (copied verbatim) for the compact photo toolbar
  var SVG={
    select:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-7 1-4 7z"/></svg>',
    pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
    highlight:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>',
    line:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 20 4"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
    rect:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
    'rect-fill':'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
    circle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
    'circle-fill':'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>',
    triangle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3L22 21H2z"/></svg>',
    cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19a4.5 4.5 0 1 0 0-9h-.1A5.5 5.5 0 0 0 7 13.5 3.5 3.5 0 0 0 3.5 17 3.5 3.5 0 0 0 7 20.5h10.5"/></svg>',
    text:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
    eraser:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/></svg>',
    undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
    redo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l5 5L20 6"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>',
    revert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/><path d="M9 21h8"/></svg>'
  };
  function _sized(svg){ return svg.replace('<svg ', '<svg width="21" height="21" '); }
  function iconBtn(id,key,title,caret){
    var b=document.createElement('button'); b.id=id; b.title=title;
    b.style.cssText='flex:0 0 auto;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:#cfd2d6;border-radius:8px;cursor:pointer;padding:0;position:relative;';
    b.innerHTML=_sized(SVG[key])+(caret?'<span class="mk-caret" style="position:absolute;right:2px;bottom:2px;font-size:9px;color:#aaa;line-height:1;">\u25B8</span>':'');
    return b;
  }
  // Row 1 buttons
  var bSel=iconBtn('mk-select','select','Select \u2014 tap for Single / Rubber-band / Tap',false);
  bSel.querySelector('svg').insertAdjacentHTML('afterend','<span class="mk-caret" style="position:absolute;right:2px;bottom:2px;font-size:9px;color:#aaa;line-height:1;">\u25BE</span>');
  var bPenGrp=iconBtn('mk-pengrp','pen','Pen group',true);   bPenGrp.dataset.tool='pen';
  var bShapeGrp=iconBtn('mk-shapegrp','rect','Shapes group',true); bShapeGrp.dataset.tool='rect';
  var bTx=iconBtn('mk-text','text','Text label',false);
  var bEr=iconBtn('mk-er','eraser','Eraser',false);
  var sepU=document.createElement('div'); sepU.style.cssText='width:1px;height:26px;background:rgba(255,255,255,.18);margin:0 2px;flex:0 0 auto;';
  var bUn=iconBtn('mk-undo','undo','Undo (Ctrl+Z)',false);
  var bRd=iconBtn('mk-redo','redo','Redo (Ctrl+Y)',false);
  [bSel,bPenGrp,bShapeGrp,bTx,bEr,sepU,bUn,bRd].forEach(function(e){row1.appendChild(e);});
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
  // S339 (Mark): Single mode removed — Rubber-band already does tap-one-to-select
  // PLUS drag-a-box, so Single was redundant. Default sub-tool is now Rubber-band.
  var subRubber=subBtn('rubber','\u25C9','Rubber-band','Tap a mark, or drag a box');
  var subTap   =subBtn('tap','\u2713','Tap select','Tap to pick, then confirm');
  subFly.appendChild(subRubber); subFly.appendChild(subTap);
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
  // ===== Row 2: size · opacity · color · | · save/clear/revert (Option B icons) =====
  function sep2px(){ var d=document.createElement('div'); d.style.cssText='width:1px;height:26px;background:rgba(255,255,255,.18);margin:0 2px;flex:0 0 auto;'; return d; }
  // compact horizontal SIZE stepper (glyph + − [v] +)
  var sizeWrap=document.createElement('div'); sizeWrap.style.cssText='display:flex;flex-direction:row;align-items:center;gap:2px;flex:0 0 auto;';
  sizeWrap.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#9a96a2" stroke-width="2" style="width:15px;height:15px;margin-right:1px;"><path d="M3 6h18M5 12h14M7 18h10"/></svg>';
  function stepBtn(txt){ var b=document.createElement('button'); b.textContent=txt; b.style.cssText='width:26px;height:30px;border:none;border-radius:6px;background:rgba(255,255,255,.12);color:#fff;font-size:15px;font-weight:700;cursor:pointer;flex:0 0 auto;'; return b; }
  var szMinus=stepBtn('\u2212'); var szVal=document.createElement('span'); szVal.id='mk-size-val'; szVal.textContent='3';
  szVal.style.cssText='font-size:12.5px;color:#dfe;min-width:20px;text-align:center;font-weight:600;';
  var szPlus=stepBtn('+');
  sizeWrap.appendChild(szMinus); sizeWrap.appendChild(szVal); sizeWrap.appendChild(szPlus);
  // compact horizontal OPACITY stepper (glyph + − [v] +) — keeps click-to-type
  var opWrap=document.createElement('div'); opWrap.style.cssText='display:flex;flex-direction:row;align-items:center;gap:2px;flex:0 0 auto;';
  opWrap.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#9a96a2" stroke-width="2" style="width:15px;height:15px;margin-right:1px;"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="#9a96a2"/></svg>';
  var opMinus=stepBtn('\u2212');
  var opVal=document.createElement('span'); opVal.id='mk-op-val'; opVal.textContent='100'; opVal.title='Click to type a value (10\u2013100)';
  opVal.style.cssText='font-size:12.5px;color:#dfe;min-width:30px;text-align:center;font-weight:600;cursor:text;border-radius:4px;';
  var opPlus=stepBtn('+');
  opWrap.appendChild(opMinus); opWrap.appendChild(opVal); opWrap.appendChild(opPlus);
  // single COLOR swatch that opens a color grid flyout
  var colors=['#FF0000','#FFEB3B','#5F8068','#1976D2','#000000','#FFFFFF'];
  var colorBtn=document.createElement('button'); colorBtn.id='mk-color'; colorBtn.title='Colour';
  colorBtn.style.cssText='flex:0 0 auto;width:40px;height:40px;border:none;background:transparent;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  var colorDot=document.createElement('div'); colorDot.style.cssText='width:22px;height:22px;border-radius:50%;background:#FF0000;border:2px solid #fff;'; colorBtn.appendChild(colorDot);
  var colorFly=document.createElement('div'); colorFly.id='lb-mk-colorfly';
  colorFly.style.cssText='position:absolute;z-index:26;display:none;flex-wrap:wrap;gap:6px;width:118px;padding:8px;background:rgba(34,34,44,.99);border:1px solid rgba(255,255,255,.16);border-radius:12px;box-shadow:0 8px 26px rgba(0,0,0,.6);';
  var swatches=colors.map(function(col){ var s=document.createElement('button'); s.className='mk-swatch'; s.dataset.col=col;
    s.style.cssText='width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:'+col+';cursor:pointer;padding:0;'; return s; });
  swatches.forEach(function(s){colorFly.appendChild(s);}); overlay.appendChild(colorFly);
  // action icons (Option B)
  function actBtn(id,key,title,color){ var b=document.createElement('button'); b.id=id; b.title=title;
    b.style.cssText='flex:0 0 auto;width:40px;height:40px;border:none;background:transparent;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:'+(color||'#cfd2d6')+';';
    b.innerHTML=_sized(SVG[key]); return b; }
  var bSv=actBtn('mk-save','check','Save annotated copy','#7fd0a0');
  var bCl=actBtn('mk-clear','trash','Clear all edits','#e88');
  var bRv=actBtn('mk-revert','revert','Discard edits',null);
  [sizeWrap,opWrap,sep2px(),colorBtn,sep2px(),bSv,bCl,bRv].forEach(function(e){row2.appendChild(e);});

  bar.appendChild(row1); bar.appendChild(rdiv); bar.appendChild(row2);
  overlay.appendChild(bar);
  _markupBar = bar;

  // ===== S339 (Mark): docked TEXT bar — swaps in over the tool bar while editing a
  // text mark. On-photo box (engine) + this bar (size − N +, text-colour A glyph,
  // bg-colour glyph w/ none, ↵, ✕, ✓). Full drawing-viewer palette. Auto-unarms text
  // after a box is finished. Sticky colours live on the engine (_lastTextColor/Bg).
  var TEXT_PALETTE = ['#A85959','#E74C3C','#FF9800','#F1C40F','#2196F3','#1565C0','#4CAF50','#9C27B0','#1C2333','#607D8B','#FFFFFF'];
  var _RET='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>';
  var _XS='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var _OK='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 13 10 18 19 6"/></svg>';
  var _NONEX='<svg width="100%" height="100%" viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" stroke="#e23" stroke-width="2.6"/></svg>';
  var textBar=document.createElement('div'); textBar.id='lb-text-bar';
  textBar.style.cssText='position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:none;'+
    'align-items:center;gap:4px;padding:7px 9px;background:rgba(20,20,28,.96);border:1.5px solid #C9476A;'+
    'border-radius:14px;z-index:13;box-shadow:0 6px 20px rgba(0,0,0,.55);max-width:calc(100vw - 16px);'+
    'box-sizing:border-box;flex-wrap:nowrap;';
  textBar.innerHTML=
    '<button type="button" class="tb-dec" style="width:34px;height:40px;border:none;background:transparent;color:#f4f3f6;font:700 20px Calibri;border-radius:8px;cursor:pointer;">\u2212</button>'+
    '<div class="tb-sizeval" style="min-width:26px;text-align:center;font:13px Calibri;color:#a09aa8;font-variant-numeric:tabular-nums;">20</div>'+
    '<button type="button" class="tb-inc" style="width:34px;height:40px;border:none;background:transparent;color:#f4f3f6;font:700 20px Calibri;border-radius:8px;cursor:pointer;">+</button>'+
    '<div style="width:1px;height:28px;background:rgba(255,255,255,.14);margin:0 2px;"></div>'+
    '<button type="button" class="tb-textcol" title="Text colour" style="width:40px;height:40px;border:none;background:transparent;border-radius:8px;cursor:pointer;position:relative;">'+
      '<span style="font:800 19px Calibri;color:#A85959;" class="tb-A">A</span>'+
      '<span class="tb-Ustrip" style="position:absolute;bottom:5px;left:9px;right:9px;height:3px;border-radius:2px;background:#A85959;"></span></button>'+
    '<button type="button" class="tb-bgcol" title="Background colour" style="width:40px;height:40px;border:none;background:transparent;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">'+
      '<span class="tb-bgglyph" style="width:22px;height:18px;border-radius:3px;border:1.5px solid rgba(255,255,255,.5);position:relative;overflow:hidden;display:block;"></span></button>'+
    '<button type="button" class="tb-ret" title="New line" style="width:44px;height:40px;border:none;background:transparent;color:#f4f3f6;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">'+_RET+'</button>'+
    '<div style="width:1px;height:28px;background:rgba(255,255,255,.14);margin:0 2px;"></div>'+
    '<button type="button" class="tb-x" title="Discard" style="width:46px;height:40px;border:none;background:transparent;color:#a09aa8;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">'+_XS+'</button>'+
    '<button type="button" class="tb-ok" title="Place" style="width:46px;height:40px;border:none;background:#3FD08A;color:#fff;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">'+_OK+'</button>';
  overlay.appendChild(textBar);
  // colour popups (built once)
  function _mkPop(){ var p=document.createElement('div');
    p.style.cssText='position:absolute;display:none;flex-wrap:wrap;gap:6px;width:160px;padding:8px;'+
      'background:rgba(34,34,44,.99);border:1px solid rgba(255,255,255,.16);border-radius:12px;'+
      'box-shadow:0 8px 26px rgba(0,0,0,.6);z-index:27;';
    overlay.appendChild(p); return p; }
  var textPop=_mkPop(), bgPop=_mkPop();
  function _swatch(c,isNone){ var s=document.createElement('button'); s.type='button';
    s.style.cssText='width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.4);cursor:pointer;padding:0;overflow:hidden;';
    if(isNone){ s.style.background='#2a2a32'; s.innerHTML=_NONEX; } else { s.style.background=c; }
    return s; }
  function _tcloseTextPops(){ textPop.style.display='none'; bgPop.style.display='none'; }
  function _posPop(pop, btn){ var br=btn.getBoundingClientRect(), o=overlay.getBoundingClientRect();
    pop.style.left=Math.max(6,(br.left-o.left)+br.width/2-80)+'px'; pop.style.bottom=(o.bottom-textBar.getBoundingClientRect().top+8)+'px'; pop.style.right='auto'; }

  var _tc=null; // current text controller
  // S339 (Mark): lift the docked text bar above the on-screen keyboard. Keyboard
  // height varies by device/OS/keyboard app, so we use visualViewport (the area NOT
  // covered by the keyboard) instead of a hard-coded offset. When the keyboard opens,
  // vv.height shrinks; we set the bar's bottom to sit just above the keyboard top.
  function _liftTextBar(){
    if (textBar.style.display==='none') return;
    var vv = window.visualViewport;
    if (vv){
      var keyboardGap = window.innerHeight - vv.height - vv.offsetTop;
      if (keyboardGap < 0) keyboardGap = 0;
      textBar.style.bottom = (keyboardGap + 12) + 'px';
    } else {
      textBar.style.bottom = '16px';
    }
  }
  if (window.visualViewport){
    window.visualViewport.addEventListener('resize', _liftTextBar);
    window.visualViewport.addEventListener('scroll', _liftTextBar);
  }

  function _refreshTextBarGlyphs(){
    if(!_tc) return;
    var col=_tc.getColor(), bg=_tc.getBg();
    textBar.querySelector('.tb-A').style.color=col;
    textBar.querySelector('.tb-Ustrip').style.background=col;
    var g=textBar.querySelector('.tb-bgglyph');
    if(!bg||bg==='none'){ g.style.background='transparent'; g.innerHTML=_NONEX; }
    else { g.style.background=bg; g.innerHTML=''; }
    textBar.querySelector('.tb-sizeval').textContent=Math.round(_tc.getSize());
  }
  // build palettes
  TEXT_PALETTE.forEach(function(c){ var s=_swatch(c,false);
    s.addEventListener('click',function(e){ e.stopPropagation(); if(_tc){_tc.setColor(c); _refreshTextBarGlyphs();} _tcloseTextPops(); });
    textPop.appendChild(s); });
  // custom text colour
  var txCustom=document.createElement('input'); txCustom.type='color'; txCustom.value='#A85959';
  txCustom.style.cssText='width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;padding:0;';
  txCustom.addEventListener('input',function(){ if(_tc){_tc.setColor(txCustom.value); _refreshTextBarGlyphs();} });
  textPop.appendChild(txCustom);
  // bg palette: none + full palette + custom
  var bgNone=_swatch(null,true);
  bgNone.addEventListener('click',function(e){ e.stopPropagation(); if(_tc){_tc.setBg('none'); _refreshTextBarGlyphs();} _tcloseTextPops(); });
  bgPop.appendChild(bgNone);
  TEXT_PALETTE.forEach(function(c){ var s=_swatch(c,false);
    s.addEventListener('click',function(e){ e.stopPropagation(); if(_tc){_tc.setBg(c); _refreshTextBarGlyphs();} _tcloseTextPops(); });
    bgPop.appendChild(s); });
  var bgCustom=document.createElement('input'); bgCustom.type='color'; bgCustom.value='#1C2333';
  bgCustom.style.cssText='width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;padding:0;';
  bgCustom.addEventListener('input',function(){ if(_tc){_tc.setBg(bgCustom.value); _refreshTextBarGlyphs();} });
  bgPop.appendChild(bgCustom);

  textBar.querySelector('.tb-dec').addEventListener('click',function(e){e.preventDefault(); if(_tc){_tc.stepSize(-1); _refreshTextBarGlyphs();}});
  textBar.querySelector('.tb-inc').addEventListener('click',function(e){e.preventDefault(); if(_tc){_tc.stepSize(1); _refreshTextBarGlyphs();}});
  textBar.querySelector('.tb-ret').addEventListener('click',function(e){e.preventDefault(); if(_tc)_tc.insertNewline();});
  textBar.querySelector('.tb-ok').addEventListener('click',function(e){e.preventDefault(); if(_tc)_tc.commit();});
  textBar.querySelector('.tb-x').addEventListener('click',function(e){e.preventDefault(); if(_tc)_tc.cancel();});
  textBar.querySelector('.tb-textcol').addEventListener('click',function(e){e.stopPropagation();
    var on=textPop.style.display==='flex'; _tcloseTextPops(); if(!on){ _posPop(textPop,this); textPop.style.display='flex'; }});
  textBar.querySelector('.tb-bgcol').addEventListener('click',function(e){e.stopPropagation();
    var on=bgPop.style.display==='flex'; _tcloseTextPops(); if(!on){ _posPop(bgPop,this); bgPop.style.display='flex'; }});
  overlay.addEventListener('click',function(ev){ if(!textBar.contains(ev.target)) _tcloseTextPops(); });

  // engine hooks: show the text bar (hide tool bar) on text start; reverse on end.
  function _wireTextHooks(){
    if(!window.MarkupEngine) return;
    window.MarkupEngine._onTextStart=function(controller){
      _tc=controller; _refreshTextBarGlyphs();
      if(_markupBar) _markupBar.style.display='none';
      textBar.style.display='flex';
      // lift above keyboard; the keyboard opens slightly after focus, so re-lift on a
      // couple of frames + a short timeout to catch the viewport resize.
      _liftTextBar();
      requestAnimationFrame(_liftTextBar);
      setTimeout(_liftTextBar, 150);
      setTimeout(_liftTextBar, 400);
    };
    window.MarkupEngine._onTextEnd=function(){
      _tc=null; _tcloseTextPops(); textBar.style.display='none';
      if(_markupActive && _markupBar) _markupBar.style.display='flex';
      // S339 auto-unarm: after a text box is finished, drop the Text tool so the
      // next tap doesn't drop another box. User re-taps T for the next label.
      if(window.MarkupEngine){ window.MarkupEngine.setTool(''); }
      clearActive(); _activeBtn=null; _refreshConfirmBar();
    };
  }
  _wireTextHooks();


  // ===== Pen-group & Shapes-group flyouts =====
  function groupFly(items, anchor){
    var f=document.createElement('div'); f.style.cssText='position:absolute;z-index:25;display:none;flex-wrap:wrap;gap:4px;padding:6px;background:rgba(34,34,44,.99);border:1px solid rgba(255,255,255,.16);border-radius:12px;box-shadow:0 8px 26px rgba(0,0,0,.6);max-width:170px;';
    items.forEach(function(it){ var b=document.createElement('button'); b.dataset.tool=it[0]; b.title=it[1];
      b.style.cssText='width:46px;height:46px;border:none;border-radius:9px;background:rgba(255,255,255,.07);color:#dfe;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      b.innerHTML=_sized(SVG[it[0]]);
      b.addEventListener('click',function(e){ e.stopPropagation(); pickGroupTool(anchor, it[0]); });
      f.appendChild(b); });
    overlay.appendChild(f); return f;
  }
  var penFly=groupFly([['pen','Pen'],['highlight','Highlighter'],['line','Line'],['arrow','Arrow']], bPenGrp);
  var shapeFly=groupFly([['rect','Rectangle'],['rect-fill','Filled Rect'],['circle','Circle'],['circle-fill','Filled Circle'],['triangle','Triangle']], bShapeGrp);

  function setActive(btn){
    [bSel,bPenGrp,bShapeGrp,bTx,bEr].forEach(function(b){ b.style.background='transparent'; b.style.color='#cfd2d6'; });
    if (btn){ btn.style.background='#9C2742'; btn.style.color='#fff'; }
  }
  function clearActive(){ setActive(null); }
  // S339 — tap a tool to arm it; tap the SAME tool again to deactivate (no tool armed,
  // taps inert) per Mark. _activeBtn tracks which is lit so the second tap toggles off.
  var _activeBtn=null;
  function toggleTool(btn, toolName){
    var E=window.MarkupEngine; if(!E) return;
    closeFly();
    if (_activeBtn===btn){            // tapping the active tool → turn it off
      E.setTool(''); clearActive(); _activeBtn=null; _refreshConfirmBar(); return;
    }
    E.setTool(toolName); setActive(btn); _activeBtn=btn; _refreshConfirmBar();
  }
  function setSwatch(col){
    colorDot.style.background=col;
    swatches.forEach(function(s){ s.style.borderColor = (s.dataset.col===col)?'#fff':'rgba(255,255,255,.4)'; s.style.boxShadow = (s.dataset.col===col)?'0 0 0 2px #9C2742':'none';});
  }
  // S339 — Pen-group / Shapes-group: tap group button toggles its flyout; picking a
  // sub-tool arms it, shows its icon on the group button, lights the group burgundy.
  function pickGroupTool(groupBtn, toolName){
    var E=window.MarkupEngine; if(!E) return;
    E.setTool(toolName); groupBtn.dataset.tool=toolName;
    var sv=SVG[toolName]; if(sv){ var caret=groupBtn.querySelector('.mk-caret');
      groupBtn.innerHTML=_sized(sv)+(caret?caret.outerHTML:''); }
    setActive(groupBtn); _activeBtn=groupBtn; closeAllFlys(); _refreshConfirmBar();
  }
  // Tapping an armed group toggles it OFF (no tool); otherwise opens its flyout.
  function toggleGroup(groupBtn, fly){
    var open=fly.style.display==='flex'; closeAllFlys();
    if(open) return;
    if(_activeBtn===groupBtn){ window.MarkupEngine&&window.MarkupEngine.setTool(''); clearActive(); _activeBtn=null; _refreshConfirmBar(); return; }
    positionFlyAt(fly, groupBtn); fly.style.display='flex';
  }
  bPenGrp.addEventListener('click',function(e){ e.stopPropagation(); toggleGroup(bPenGrp, penFly); });
  bShapeGrp.addEventListener('click',function(e){ e.stopPropagation(); toggleGroup(bShapeGrp, shapeFly); });
  bTx.addEventListener('click',function(){toggleTool(bTx,'text');});
  bEr.addEventListener('click',function(){toggleTool(bEr,'eraser');});
  // S339 — all flyouts (Select sub-modes, Pen-group, Shapes-group, Colour) anchor
  // just above the toolbar, left-aligned to their button. Measured per-open so they
  // sit correctly above the two-row bar.
  subFly.style.left='50%'; subFly.style.transform='translateX(-50%)';
  function _barClearance(){ var bh = bar.offsetHeight || 56; return (16 + bh + 10); }
  function positionFlyAt(fly, anchor){
    var br=anchor.getBoundingClientRect();
    fly.style.left=Math.max(6, br.left + br.width/2 - 80)+'px';
    fly.style.right='auto'; fly.style.transform='none';
    fly.style.bottom=_barClearance()+'px';
  }
  function positionFly(){ subFly.style.bottom=_barClearance()+'px'; }
  function closeAllFlys(){ [subFly,penFly,shapeFly,colorFly].forEach(function(f){ f.style.display='none'; }); }
  function closeFly(){ closeAllFlys(); }
  bSel.addEventListener('click',function(e){
    e.stopPropagation();
    if (subFly.style.display==='flex'){ closeAllFlys(); }
    else { closeAllFlys(); positionFly(); subFly.style.display='flex'; }
  });
  colorBtn.addEventListener('click',function(e){
    e.stopPropagation();
    if (colorFly.style.display==='flex'){ closeAllFlys(); }
    else { closeAllFlys(); positionFlyAt(colorFly, colorBtn); colorFly.style.display='flex'; }
  });
  function markSub(sub){
    [subRubber,subTap].forEach(function(b){ b.style.background = (b.dataset.sub===sub)?'#9C2742':'rgba(255,255,255,.06)'; });
  }
  [subRubber,subTap].forEach(function(b){
    b.addEventListener('click',function(e){
      e.stopPropagation();
      if (window.MarkupEngine) window.MarkupEngine.setSelectSub(b.dataset.sub);
      setActive(bSel); _activeBtn=bSel; markSub(b.dataset.sub);
      closeFly(); _refreshConfirmBar();
    });
  });
  markSub('rubber');
  // close any flyout on outside tap (mouse + touch)
  function _anyFlyOpen(){ return subFly.style.display==='flex'||penFly.style.display==='flex'||shapeFly.style.display==='flex'||colorFly.style.display==='flex'; }
  function _flyOutside(ev){
    if(!_anyFlyOpen()) return;
    var t=ev.target;
    var inside = subFly.contains(t)||penFly.contains(t)||shapeFly.contains(t)||colorFly.contains(t)||
      bSel.contains(t)||bPenGrp.contains(t)||bShapeGrp.contains(t)||colorBtn.contains(t);
    if(!inside) closeAllFlys();
  }
  document.addEventListener('mousedown',_flyOutside);
  document.addEventListener('touchstart',_flyOutside,{passive:true});
  // S339 — confirm bar: ✗ whenever a selection/pick is active; ✓ added in tap mode while picking.
  function _refreshConfirmBar(){
    var E=window.MarkupEngine;
    if (!E || E.tool!=='select' || !E.hasActiveSelection()){ cBar.style.display='none'; return; }
    cBar.style.bottom=_barClearance()+'px';
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
    s.addEventListener('click',function(e){
      e.stopPropagation();
      if (window.MarkupEngine) window.MarkupEngine.setColor(s.dataset.col);
      setSwatch(s.dataset.col); closeAllFlys();
    });
  });
  // SIZE stepper — 1..20, clamp; updates current draw size
  var _size=3;
  function _applySize(){ szVal.textContent=String(_size); if(window.MarkupEngine) window.MarkupEngine.setSize(_size); }
  szMinus.addEventListener('click',function(){ _size=Math.max(1,_size-1); _applySize(); });
  szPlus .addEventListener('click',function(){ _size=Math.min(20,_size+1); _applySize(); });
  // Opacity stepper — 10% steps, clamp 10–100%; updates current draw opacity + any selection
  var _opPct = 100;
  function _applyOp(){ opVal.textContent=String(_opPct); if (window.MarkupEngine) window.MarkupEngine.setOpacity(_opPct/100); }
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
  bCl .addEventListener('click',function(){
    // S339 (Mark): clear-all is destructive + easy to fat-finger — gate behind the
    // standard confirm modal (same as Revert), not a bare immediate wipe.
    if(!window.MarkupEngine) return;
    showConfirm('Clear all markups?', 'This removes every mark on this photo. This cannot be undone.').then(function(yes){
      if(yes && window.MarkupEngine){ window.MarkupEngine.clear(); _refreshConfirmBar(); }
    });
  });
  bRv .addEventListener('click',_revertMarkup);
  bSv .addEventListener('click',_saveMarkup);
  // default: arm Pen via the Pen-group (shows pen icon, lights group)
  pickGroupTool(bPenGrp,'pen');
  setSwatch('#FF0000');
}

function _exitMarkupNoSave(){
  if (!window.MarkupEngine) return;
  window.MarkupEngine.detach();
  if (_markupBar) _markupBar.style.display='none';
  // S339 — hide the select confirm bar + all flyouts on markup exit
  var _cb=document.getElementById('lb-mk-confirm'); if(_cb) _cb.style.display='none';
  ['lb-mk-subfly','lb-mk-colorfly'].forEach(function(id){ var e=document.getElementById(id); if(e) e.style.display='none'; });
  _markupActive = false;
}
// Copied from Diesel S305/S306: leaving markup mode COMMITS any drawn strokes —
// no explicit Save click required. The pencil toggle (✎), the ✕ button, Escape,
// and closing the lightbox all bake + persist (via _saveMarkup, which dispatches
// frt-markup-saved and then exits). Exiting with a clean/undirty canvas just exits.
function _maybeCommitOnExit(){
  // S340: re-save only when the strokes actually changed. A photo reopened for
  // re-edit loads its saved strokes (isDirty()=true immediately); without this
  // guard, simply opening + closing markup would needlessly re-flatten + re-upload.
  if (window.MarkupEngine && window.MarkupEngine.hasChangesSinceAttach()){
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
    var p = _photos[_idx] || {};
    // S340 RE-EDITABLE MARKUP: if this photo has saved strokes, reload them as LIVE
    // editable objects. CRITICAL: the strokes must render on the CLEAN ORIGINAL image,
    // not the flattened/marked JPEG currently shown — otherwise the reloaded strokes
    // paint ON TOP of already-baked strokes (doubling). So when we have saved strokes
    // AND can resolve the original source, swap lb-image to the original first.
    var savedStrokes = (p._markupStrokes && p._markupStrokes.length) ? p._markupStrokes : null;
    var origSrc = savedStrokes ? _resolveOriginalSrc(p) : null;
    try {
      console.log('[S340 reopen]', p && p.id,
        'savedStrokes=', savedStrokes && savedStrokes.length,
        '| has _markupStrokes key=', (p && ('_markupStrokes' in p)),
        '| typeof=', (p && typeof p._markupStrokes),
        '| rawLen=', (p && p._markupStrokes && p._markupStrokes.length),
        '| origSrc=', origSrc ? origSrc.slice(0,50) : null,
        '| origBackupId=', p && p._origBackupId,
        '| keys=', p ? Object.keys(p).filter(function(k){return k.indexOf("_")===0;}).join(",") : '');
    } catch(_){}
    // attachAndArm(withStrokes): mount the engine. Pass strokes ONLY when we're
    // confident the displayed image is the CLEAN original (else doubling). When the
    // original can't be loaded (404/error), we attach clean so the photo still opens.
    var attachAndArm = function(withStrokes){
      var prevScale = _scale, prevPanX = _panX, prevPanY = _panY;
      _calcFitScale();
      _scale = _fitScale; _panX = 0; _panY = 0; _applyTransform();  // baseline so _sync captures fit box
      window.MarkupEngine.attach(canvas, img, p._origBlob || null, null, withStrokes ? savedStrokes : null);
      _scale = prevScale; _panX = prevPanX; _panY = prevPanY; _applyTransform();
      if (_markupBar) _markupBar.style.display='flex';
      _markupActive = true;
    };
    if (origSrc && img.src !== origSrc){
      // Switch the display to the clean original, THEN attach + render strokes on it.
      // CRITICAL: the original R2 file can 404 (orphaned/never-uploaded). Without an
      // error+timeout guard, a failed load means 'load' never fires and markup never
      // arms — the photo looks "stuck flattened". So guard every outcome:
      //   success → attach WITH strokes on the clean original
      //   error/404 or timeout → attach CLEAN on whatever is shown (no doubling, opens)
      var _done = false;
      var _finish = function(ok){
        if (_done) return; _done = true;
        img.removeEventListener('load', _onOk);
        img.removeEventListener('error', _onErr);
        if (_t) { clearTimeout(_t); _t = null; }
        try { console.log('[S340 reopen] original load ' + (ok?'OK → arm WITH strokes':'FAILED → arm CLEAN (strokes kept in data)')); } catch(_){}
        attachAndArm(ok);   // ok=true → with strokes; ok=false → clean
      };
      var _onOk  = function(){ _finish(true); };
      var _onErr = function(){ _finish(false); };
      img.addEventListener('load', _onOk);
      img.addEventListener('error', _onErr);
      var _t = setTimeout(function(){ _finish(false); }, 6000);  // never hang
      img.src = origSrc;
    } else {
      // No original switch needed (origSrc null, or img already showing it).
      // If origSrc is null we never resolved a clean original → attach clean.
      attachAndArm(!!origSrc);
    }
  }
}

// S340: resolve the best "clean original" image source for re-editing markup.
// Order: the (original) backup record's r2Url (cloud, survives sessions) →
// in-memory _origBlob (Blob or data-URL string). Returns a usable src string,
// or null if none is resolvable (caller then attaches clean = no re-edit, no doubling).
function _resolveOriginalSrc(p){
  try {
    if (p._origBackupId && typeof Model !== 'undefined' && Model.getSitePhotos){
      var bk = (Model.getSitePhotos()||[]).filter(function(x){ return x && x.id === p._origBackupId; })[0];
      if (bk && bk.r2Url) return bk.r2Url;
    }
  } catch(_){}
  if (p._origBlob){
    if (typeof p._origBlob === 'string') return p._origBlob;
    try { return URL.createObjectURL(p._origBlob); } catch(_){}
  }
  return null;
}

function _saveMarkup(){
  if (!window.MarkupEngine || !window.MarkupEngine.isDirty()){ _exitMarkupNoSave(); return; }
  // S340: capture the live strokes for persistence BEFORE saveBlob (which is async).
  var savedStrokes = window.MarkupEngine.exportStrokes();
  try { console.log('[S340 save] exportStrokes →', savedStrokes && savedStrokes.length, 'stroke(s); isDirty=', window.MarkupEngine.isDirty(), 'rawLen=', (window.MarkupEngine.strokes||[]).length); } catch(_){}
  window.MarkupEngine.saveBlob().then(function(blob){
    var p = _photos[_idx]; if (!p){ _exitMarkupNoSave(); return; }
    if (!p._origBlob && p.dataUrl) p._origBlob = p.dataUrl;
    var url = URL.createObjectURL(blob);
    p.dataUrl = url; p._annotated = true;
    p._markupStrokes = savedStrokes;   // S340: ride with the photo into IDB + cloud
    try { console.log('[S340 save] set p._markupStrokes on', p.id, '→', (p._markupStrokes||[]).length, 'stroke(s)'); } catch(_){}
    var img = document.getElementById('lb-image');
    if (img) img.src = url;
    // R2 upload hook — defer to host app via custom event (now carries strokes)
    try { document.dispatchEvent(new CustomEvent('frt-markup-saved',{detail:{photo:p,blob:blob,index:_idx,strokes:savedStrokes}})); } catch(e){}
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
    // S339 FIX (mobile drift): the canvas carries its own CSS left/top from _sync
    // (the image's letterbox offset within the host). The wrap has no such CSS offset
    // (left:0/top:0) and positions purely via transform. Mirroring the SAME translate
    // onto the canvas double-counts that offset (a constant ~106px on letterboxed
    // portrait photos; ~0 on desktop, which is why it only showed on mobile). Subtract
    // the canvas's own CSS left/top so the two align at every zoom.
    var _cl = parseFloat(mc.style.left) || 0;
    var _ct = parseFloat(mc.style.top) || 0;
    mc.style.transform = 'translate3d(' + (_panX + offX - _cl) + 'px,' + (_panY + offY - _ct) + 'px,0) rotate(' + rot + 'deg) scale(' + k + ')';
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
  // S341 (Option A): graceful fallback if the displayed image fails to load.
  // The primary src is normally p.r2Url. For a small number of historical
  // photos the r2Url points at an orphaned/never-uploaded R2 object that 404s
  // (e.g. a marked JPEG whose upload didn't complete). Without this, such a
  // photo shows a BLANK frame. We build an ordered list of alternate sources
  // and step to the next one on each load error, so the viewer falls back to
  // any local copy (dataUrl/thumb) or the clean original backup instead of
  // showing nothing. Each candidate is tried at most once (no loop). This is
  // purely additive: when the primary src loads (the 35/36 normal case), the
  // error handler never runs and behavior is unchanged.
  var _fallbacks = [];
  (function(){
    var seen = {};
    [p.r2Url, p.dataUrl, p.thumb].forEach(function(s){
      if (s && !seen[s]) { seen[s] = 1; _fallbacks.push(s); }
    });
    try {
      var orig = _resolveOriginalSrc(p);
      if (orig && !seen[orig]) { seen[orig] = 1; _fallbacks.push(orig); }
    } catch(_){}
  })();
  var _fbIdx = 0;
  img.onload = function() {
    _calcFitScale();
    _scale = _fitScale;
    _panX = 0; _panY = 0;
    _applyTransform();
  };
  img.onerror = function() {
    _fbIdx++;
    if (_fbIdx < _fallbacks.length) {
      try { console.warn('[Lightbox] image load failed, trying fallback', _fbIdx, '/', _fallbacks.length - 1); } catch(_){}
      img.src = _fallbacks[_fbIdx];
    } else {
      try { console.warn('[Lightbox] all image sources failed for photo', p && p.id); } catch(_){}
    }
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
  if (_markupActive && window.MarkupEngine && window.MarkupEngine.hasChangesSinceAttach()){
    _closeAfterPersist = true;
    _saveMarkup();   // on success its .then exits markup; _finishClose runs after
    return;
  }
  // markup open but unchanged (incl. a re-edit reopen with no edits) — exit clean.
  if (_markupActive && window.MarkupEngine){ _exitMarkupNoSave(); }
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
  if (_markupActive && window.MarkupEngine && window.MarkupEngine.hasChangesSinceAttach()){
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
  // S339 (Mark): while a text box is open, freeze pan/zoom — the on-photo box is
  // screen-fixed, so panning the photo under it would make it drift. Reposition the
  // photo before or after editing, not during.
  if (window.MarkupEngine && window.MarkupEngine._textInput) return;
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
  if (window.MarkupEngine && window.MarkupEngine._textInput) return;  // S339: freeze pan/zoom while text box open
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
    // S339 (Mark): TWO-FINGER PAN FIX. The pan anchor was frozen to the START
    // midpoint (_touchStartMidX/Y), so dragging both fingers only re-centred the
    // ZOOM — never translated the view (zoom worked, pan didn't). Use the LIVE
    // midpoint as the focal point: the image-space point under the start midpoint
    // (imgX/imgY) is held under the CURRENT midpoint, so moving the fingers moves
    // the view. Zoom stays centred under the fingers; pan now tracks finger drag.
    var _r2 = area.getBoundingClientRect();
    var curMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - _r2.left;
    var curMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - _r2.top;
    var imgX = (_touchStartMidX - _touchStartPanX) / _touchStartScale;
    var imgY = (_touchStartMidY - _touchStartPanY) / _touchStartScale;
    _scale = newScale;
    _panX = curMidX - imgX * newScale;
    _panY = curMidY - imgY * newScale;
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
