/**
 * ARENCON — Shared Lightbox Shell (photo viewer + markup chrome)  v1.0.0
 * ═══════════════════════════════════════════════════════════════════════
 * VERBATIM extraction of the field-proven Diesel lightbox (DslLightbox,
 * S283–S459 lineage) into /lib/ per MODULARIZATION_ROADMAP_v2_S460 Wave 4.
 * Same pixels, same behavior, new home — no logic was changed in the move.
 *
 * WHAT THIS IS: the viewer CHROME around the shared markup engine family
 * (lib/ui/markupTools/markupEraser/markupSelection/markupText). It owns its
 * entire DOM (built once, re-parented to <body>, ids dlb-*, all styles
 * inline), so it needs NO page CSS. Z-band: overlay z-index 10000 (engine
 * band 10000–10099 per the sealed-module contract; host modals >10100).
 *
 * FIELD-PROVEN QUIRKS PRESERVED (do not "clean up"):
 *   • S287: the photo is PAINTED ONTO #dlb-stage (canvas), never displayed
 *     via a CSS-transformed <img> — a Chrome compositor fault renders the
 *     transformed image blank white on some machines.
 *   • S300: bake/download composites from a taint-free loader; the displayed
 *     img loads plain, no crossOrigin.
 *   • S301: onerror/onload dropped before clearing src on close.
 *   • S303/S305: persist-busy gate — exit/toggle/close block until a save
 *     settles; closing mid-markup auto-commits.
 *   • iOS body scroll lock (position:fixed pattern).
 *
 * HOST CONTRACT (late-bound globals — resolved at CALL time, so load order
 * doesn't matter; the module only requires them to exist when the lightbox
 * is actually used). Consumers: Diesel (reference), Electric (next).
 *   ENGINE     window.DieselMarkup            vector markup engine (attach/
 *                                             detach/setTool/undo/…)
 *   DIALOG     _aConfirm(msg, fn, okText)     confirm modal
 *   TOAST      showToast(msg)
 *   PHOTO      _photoSrc(p) · _isPhotoDeleted(p) · _isRealImageBlob(d) ·
 *              _r2Fname(p)
 *   PERSIST    _dslLoadBakeImage(p) · _dslMarkupPersist(p,mk) ·
 *              _dslMarkupRevert(p) · _rebuildMkDisplay(p) ·
 *              _dslStampSiblings(photo, stampFn)
 *   SURFACES   _dslRefreshPhotoSurfaces() · _renderPhotoGallery()
 *   DELETE     deletePhotoEverywhere(target, afterFn)
 *   SAVE       saveState() · debounceAutosave() · _collectCloudState() ·
 *              CloudSync (optional; typeof-guarded)
 *
 * USAGE (host):
 *   <script src="lib/ui/lightbox.js"></script>
 *   var DslLightbox = window.LightboxShell.build();
 *   window.DslLightbox = DslLightbox;
 *   // then: DslLightbox.open(photos, idx, ctx) / .close() / .isOpen()
 *   //       .handleBack() / .enterMarkup()
 *
 * Classic script global window.LightboxShell (+ CJS export for the Node
 * harness). Building is side-effect-free until .open() (DOM built lazily).
 */
(function (root) {
'use strict';

function build(hooks) {
  'use strict';
  /* ═══ S679-A (Lane A, lightbox unification Phase L1) — THE HOOKS ARE REAL.
     The parameter was reserved since v1; it now carries a per-host
     personality. RESOLUTION ORDER: hooks first, window global second, and
     the global is read AT CALL TIME — Diesel defines its globals after this
     script loads, and capturing them at build() would break that. A host
     that passes nothing (Diesel today) resolves every name exactly as
     before; the characterisation probe (tools/sim/lbshell.mjs) recorded the
     pre-edit session and this file must reproduce it byte-for-byte. */
  var HOOKS = hooks || {};
  /* The markup engine indirection: every engine touch goes through _ENG().
     FRT will supply hooks.markupEngine (a _ENG()-shaped adapter over
     its own MarkupEngine, Phase L2); Diesel supplies nothing and gets its
     window engine, late-bound as ever. */
  function _ENG(){ return HOOKS.markupEngine || root.DieselMarkup; }
  /* Function-shaped host services. Each wrapper shadows the bare global name
     for this closure, so every existing call site resolves through it with
     zero call-site edits. Unbound = safe no-op (pre-edit, an unbound name
     was either typeof-guarded out or a host misconfiguration). */
  function _hk(name, dflt){
    return function(){ var f=(HOOKS[name]!==undefined)?HOOKS[name]:root[name];
      if(typeof f==='function') return f.apply(null, arguments);
      return dflt; };
  }
  var showToast=_hk('showToast'), _aConfirm=_hk('_aConfirm'),
      _photoSrc=_hk('_photoSrc'), _isPhotoDeleted=_hk('_isPhotoDeleted'),
      _r2Fname=_hk('_r2Fname'), saveState=_hk('saveState'),
      debounceAutosave=_hk('debounceAutosave'), _collectCloudState=_hk('_collectCloudState'),
      _dslRefreshPhotoSurfaces=_hk('_dslRefreshPhotoSurfaces'),
      _renderPhotoGallery=_hk('_renderPhotoGallery'), _rebuildMkDisplay=_hk('_rebuildMkDisplay'),
      _dslMarkupRevert=_hk('_dslMarkupRevert'), _dslMarkupPersist=_hk('_dslMarkupPersist'),
      _dslLoadBakeImage=_hk('_dslLoadBakeImage'), _dslStampSiblings=_hk('_dslStampSiblings'),
      deletePhotoEverywhere=_hk('deletePhotoEverywhere');
  /* _isRealImageBlob sits in a value branch (`typeof f==='function' ? f(blob)
     : Promise.resolve(true)`); its unbound default must stay a resolved
     promise or the download path would call .then on undefined. */
  var _isRealImageBlob=_hk('_isRealImageBlob', Promise.resolve(true));
  var _photos=[], _idx=0, _ctx=null, _isOpen=false, _built=false;
  var _scale=1, _fitScale=1, _panX=0, _panY=0, _rotations={};
  var _dragging=false, _lastX=0, _lastY=0;
  var _tDist=0, _tScale=1, _tMidX=0, _tMidY=0, _tPanX=0, _tPanY=0;
  var _sX=0, _sY=0, _lastTap=0, _swX=0, _swY=0, _swiping=false;
  var _markupActive=false;
  var _mkTool='pen', _mkColor='#FF0000', _mkSize=4;
  var _setTool=null;        // S295: module handle to the bar's setActiveTool (ESC deactivates tool)
  var _resetBarState=null;  // S344: module handle to reset toolbar to clean default (markup entry)
  var _mkAlpha=100;         // S296: stroke opacity %, driven by the bar's opacity slider
  var _mkDraft={};          // S295: per-photo unsaved-stroke stash — strokes survive markup exit/nav until saved or cleared
  var _persistBusy=false;   // S303: a save is persisting — exit/toggle/close blocked until it settles
  var _layoutBar=null;      // S305: responsive markup-bar layout (desktop pill vs mobile sheet)
  var _closeAfterPersist=false;   // S305: auto-commit triggered by closing the lightbox
  var _scrollLockY=0;

  function _el(id){ return document.getElementById(id); }
  function _photoObj(i){ var p=_photos[i]; return (p && typeof p==='object') ? p : {d:(typeof p==='string'?p:'')}; }
  function _rot(){ return _rotations[_idx]||0; }
  function _sideways(){ var r=_rot(); return r===90||r===270; }

  // ── DOM (built once) ──
  function _build(){
    if(_built) return;
    var ov=document.createElement('div');
    ov.id='dlb-overlay';
    ov.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:10000;flex-direction:column;font-family:Calibri,sans-serif;'; // S288: exact FRT .lightbox-overlay backdrop
    ov.innerHTML =
      '<div id="dlb-area" style="flex:1;position:relative;overflow:hidden;touch-action:none;cursor:grab;">'
      // S287: the photo is PAINTED ONTO A CANVAS, not displayed via a
      // transformed <img>. Field-proven on Mark's machine: identical bytes in a
      // plain <img>/canvas render fine while the same image inside a CSS-
      // transformed wrapper composites to BLANK WHITE (Chrome compositor fault,
      // survives relaunch). #dlb-image is now a hidden decode source only;
      // #dlb-stage is the visible viewport canvas; #dlb-canvas remains the
      // markup engine's interactive overlay, positioned at the fitted rect.
      + '<img id="dlb-image" draggable="false" style="display:none;">'
      + '<canvas id="dlb-stage" style="position:absolute;top:0;left:0;"></canvas>'
      + '<canvas id="dlb-canvas" style="position:absolute;top:0;left:0;background:transparent;pointer-events:none;display:none;"></canvas>'
      + '<button id="dlb-prev" title="Previous" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);color:#fff;border:none;width:44px;height:44px;border-radius:50%;cursor:pointer;font-size:20px;z-index:9;">\u2039</button>'
      + '<button id="dlb-next" title="Next" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);color:#fff;border:none;width:44px;height:44px;border-radius:50%;cursor:pointer;font-size:20px;z-index:9;">\u203A</button>'
      + '</div>';
    // ── Top bar (FRT layout: counter | zoom% | markup/download/rotate/close) ──
    var top=document.createElement('div');
    top.id='dlb-topbar';
    top.style.cssText='position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;'
      +'padding:calc(10px + env(safe-area-inset-top,0px)) calc(14px + env(safe-area-inset-right,0px)) 10px calc(14px + env(safe-area-inset-left,0px));'
      +'background:linear-gradient(180deg,rgba(0,0,0,.65),rgba(0,0,0,0));z-index:10;pointer-events:none;';
    function rb(id,label,title){
      var b=document.createElement('button');
      b.id=id; b.title=title; b.innerHTML=label;
      b.style.cssText='background:rgba(0,0,0,.55);color:#fff;border:none;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s;';
      b.addEventListener('mouseenter',function(){b.style.background='rgba(156,39,66,.85)';});
      b.addEventListener('mouseleave',function(){b.style.background='rgba(0,0,0,.55)';});
      return b;
    }
    var left=document.createElement('div'); left.style.cssText='flex:1;display:flex;align-items:center;gap:10px;pointer-events:auto;';
    var counter=document.createElement('div'); counter.id='dlb-counter';
    counter.style.cssText='color:#fff;font-size:14px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6);';
    left.appendChild(counter);
    var center=document.createElement('div'); center.style.cssText='flex:1;display:flex;justify-content:center;pointer-events:auto;';
    var zoom=document.createElement('div'); zoom.id='dlb-zoom'; zoom.textContent='100%';
    zoom.style.cssText='background:rgba(0,0,0,.55);color:#fff;font-size:12px;font-weight:600;padding:5px 12px;border-radius:14px;';
    center.appendChild(zoom);
    var right=document.createElement('div'); right.style.cssText='flex:1;display:flex;justify-content:flex-end;gap:8px;pointer-events:auto;';
    var bMk=rb('dlb-markup','\u270E','Markup'), bDl=rb('dlb-download','\u2B07','Download'),
        bRo=rb('dlb-rotate','\u21BB','Rotate 90\u00B0'), bDel=rb('dlb-delete','\uD83D\uDDD1','Delete'), bCl=rb('dlb-close','\u2715','Close');
    right.appendChild(bMk); right.appendChild(bDl); right.appendChild(bRo); right.appendChild(bDel); right.appendChild(bCl);
    top.appendChild(left); top.appendChild(center); top.appendChild(right);
    ov.appendChild(top);
    // S284: caption + date row removed per Mark — view is photo-only.
    // ── FRT markup pill bar ──
    // S304: the markup bar is a compact IN-FLOW bottom sheet — a flex sibling
    // after the stage, so the drawing surface can structurally NEVER overlap
    // the buttons (the absolute/wrapped bar intercepted Save taps — proven by
    // elementFromPoint returning #dlb-area at the Save button's coordinates).
    // Three rows: tools (scrollable) / style (scrollable) / actions (always visible).
    var bar=document.createElement('div');
    bar.id='dlb-markupbar';
    // S305 (Mark): desktop keeps the original centered floating pill (it was
    // never the problem there and looked right); narrow viewports get the
    // compact in-flow bottom sheet so the stage can never cover the buttons
    // and the bar stays portrait-friendly. display:contents flattens the rows
    // into one pill line in desktop mode.
    var _rowScrollCss='display:flex;align-items:center;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;';
    var _rowActionCss='display:flex;align-items:center;gap:6px;justify-content:center;';
    function mkRow(scroll){
      var r=document.createElement('div');
      r.style.cssText = scroll ? _rowScrollCss : _rowActionCss;
      return r;
    }
    var rowTools=mkRow(true), rowStyle=mkRow(true);
    // ═══ S344 Phase 1 — FRT redesigned TWO-ROW ICON BAR (ported from frt/js/ui/lightbox.js) ═══
    // Replaces the old single-row text-label pill. Row 1 = tools (Select w/ sub-caret,
    // Pen-group, Shapes-group w/ flyout, Text, Eraser | Undo Redo). Row 2 = size · opacity
    // steppers · colour swatch+flyout | Save Clear Revert (icon actions). Wiring below keeps
    // Diesel's existing setActiveTool/_styleFn/engine plumbing; tool keys unchanged
    // (select/pen/highlight/line/square/circle/arrow/text/erase). Select sub-flyout, confirm
    // bar, filled shapes + docked text bar arrive in Phase 2 (engine-dependent).
    var SVG={
      select:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-7 1-4 7z"/></svg>',
      pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
      highlight:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>',
      line:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 20 4"/></svg>',
      arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
      square:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
      'square-fill':'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
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
    var _rowCss='display:flex;flex-wrap:nowrap;justify-content:center;align-items:center;gap:4px;';
    rowTools.style.cssText=_rowCss; rowStyle.style.cssText=_rowCss;
    var rdiv=document.createElement('div'); rdiv.style.cssText='height:1px;background:rgba(255,255,255,.10);margin:1px 4px;';
    function _layoutMarkupBar(){
      var keep=bar.style.display;
      bar.style.cssText='position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:none;flex-direction:column;gap:6px;padding:9px 10px;background:rgba(20,20,28,.94);border-radius:16px;z-index:11;box-shadow:0 6px 20px rgba(0,0,0,.5);max-width:calc(100vw - 16px);box-sizing:border-box;';
      bar.style.display=keep||'none';
    }
    _layoutBar=_layoutMarkupBar; _layoutMarkupBar();
    // ── Row 1: Select(caret) · Pen-group(caret) · Shapes-group(caret) · Text · Eraser | Undo Redo ──
    var bSel=iconBtn('dlb-mk-sel','select','Select \u2014 tap a mark or drag a box',false);
    bSel.querySelector('svg').insertAdjacentHTML('afterend','<span class="mk-caret" style="position:absolute;right:2px;bottom:2px;font-size:9px;color:#aaa;line-height:1;">\u25BE</span>');
    var bPenGrp=iconBtn('dlb-mk-pengrp','pen','Pen / Highlighter',true); bPenGrp.dataset.tool='pen';
    var bShapeGrp=iconBtn('dlb-mk-shapegrp','square','Shapes',true); bShapeGrp.dataset.tool='square';
    var bTx=iconBtn('dlb-mk-text','text','Text label',false);
    var bEr=iconBtn('dlb-mk-er','eraser','Eraser',false);
    function sepU(){ var s=document.createElement('div'); s.style.cssText='width:1px;height:26px;background:rgba(255,255,255,.18);margin:0 2px;flex:0 0 auto;'; return s; }
    var bUn=iconBtn('dlb-mk-undo','undo','Undo (Ctrl+Z)',false);
    var bRd=iconBtn('dlb-mk-redo','redo','Redo (Ctrl+Y)',false);
    [bSel,bPenGrp,bShapeGrp,bTx,bEr,sepU(),bUn,bRd].forEach(function(e){rowTools.appendChild(e);});
    // toolBtns map (key→button) so existing setActiveTool() highlight logic still works.
    // Group buttons carry their CURRENT tool in dataset.tool; the highlight resolves
    // by matching the active tool against each group's member set (handled in setActiveTool).
    var toolBtns={ select:bSel, pen:bPenGrp, highlight:bPenGrp, line:bPenGrp, arrow:bPenGrp,
                   square:bShapeGrp, 'square-fill':bShapeGrp, circle:bShapeGrp, 'circle-fill':bShapeGrp, triangle:bShapeGrp, text:bTx, erase:bEr };
    // ── Pen-group flyout (Pen / Highlighter) ──
    var penFly=document.createElement('div'); penFly.id='dlb-mk-penfly';
    penFly.style.cssText='position:absolute;z-index:25;display:none;flex-direction:row;gap:4px;padding:6px;background:rgba(28,28,38,.98);border:1px solid rgba(255,255,255,.15);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.6);';
    function flyBtn(tool,key,title){
      var b=document.createElement('button'); b.title=title; b.dataset.tool=tool;
      b.style.cssText='flex:0 0 auto;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:#cfd2d6;border-radius:8px;cursor:pointer;padding:0;';
      b.innerHTML=_sized(SVG[key]);
      return b;
    }
    var penP=flyBtn('pen','pen','Pen'), penH=flyBtn('highlight','highlight','Highlighter');
    var penL=flyBtn('line','line','Line'), penA=flyBtn('arrow','arrow','Arrow');
    penFly.appendChild(penP); penFly.appendChild(penH); penFly.appendChild(penL); penFly.appendChild(penA); ov.appendChild(penFly);
    // ── Shapes-group flyout (FRT: Rectangle / Filled Rect / Circle / Filled Circle / Triangle) ──
    var shapeFly=document.createElement('div'); shapeFly.id='dlb-mk-shapefly';
    shapeFly.style.cssText=penFly.style.cssText;   // single row, hugs content (no wrap gap)
    // S344: filled rect/circle DRAW support added to the engine in Phase 2b; buttons present now.
    [['square','square'],['square-fill','square-fill'],['circle','circle'],['circle-fill','circle-fill'],['triangle','triangle']]
      .forEach(function(s){ shapeFly.appendChild(flyBtn(s[0],s[1],s[0])); });
    ov.appendChild(shapeFly);
    // ── S344 Phase 2a: Select sub-tool flyout (Rubber-band / Tap select) ──
    var subFly=document.createElement('div'); subFly.id='dlb-mk-subfly';
    subFly.style.cssText='position:absolute;z-index:25;display:none;flex-direction:column;gap:4px;padding:6px;background:rgba(28,28,38,.98);border:1px solid rgba(255,255,255,.15);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.6);min-width:200px;';
    function subBtn(sub,glyph,name,desc){
      var b=document.createElement('button'); b.dataset.sub=sub;
      b.style.cssText='display:flex;align-items:center;gap:10px;text-align:left;background:rgba(255,255,255,.06);color:#fff;border:none;height:48px;padding:0 12px;border-radius:10px;cursor:pointer;font:600 14px Calibri,sans-serif;';
      b.innerHTML='<span style="width:22px;text-align:center;font-size:16px;">'+glyph+'</span>'+
        '<span style="line-height:1.05;">'+name+'<span style="display:block;font-weight:400;font-size:11px;color:#a9a4b2;margin-top:1px;">'+desc+'</span></span>';
      return b;
    }
    subFly.appendChild(subBtn('rubber','\u25C9','Rubber-band','Tap a mark, or drag a box'));
    subFly.appendChild(subBtn('tap','\u2713','Tap select','Tap to pick, then confirm'));
    ov.appendChild(subFly);
    // ── S344 Phase 2a: ✓/✗ confirm bar (tap-mode pick → group; ✗ clears any selection) ──
    var cBar=document.createElement('div'); cBar.id='dlb-mk-confirm';
    // S459f: pointer-events none on the pill, auto on its buttons — the bar stays visible
    // while grouped (Mark: ✗ must remain reachable) without eating canvas drag-starts
    // (the S344 reason it used to hide). Presses between/around buttons pass through.
    cBar.style.cssText='position:absolute;left:50%;bottom:96px;transform:translateX(-50%);display:none;align-items:center;gap:10px;padding:8px 10px 8px 16px;background:rgba(20,20,28,.96);border:1px solid rgba(255,255,255,.14);border-radius:22px;z-index:21;box-shadow:0 6px 20px rgba(0,0,0,.55);pointer-events:none;';
    var cCnt=document.createElement('span'); cCnt.style.cssText='font:600 13px Calibri,sans-serif;color:#cfcad6;';
    var cOk=document.createElement('button'); cOk.innerHTML='\u2713'; cOk.title='Confirm \u2014 group these';
    cOk.style.cssText='border:none;width:42px;height:42px;border-radius:50%;cursor:pointer;font-size:20px;color:#fff;background:#3FD08A;display:flex;align-items:center;justify-content:center;pointer-events:auto;';
    var cNo=document.createElement('button'); cNo.innerHTML='\u2715'; cNo.title='Cancel \u2014 clear selection';
    cNo.style.cssText='border:none;width:42px;height:42px;border-radius:50%;cursor:pointer;font-size:18px;color:#fff;background:#C0445F;display:flex;align-items:center;justify-content:center;pointer-events:auto;';
    var cUn=document.createElement('button'); cUn.title='Ungroup \u2014 remove this mark from the group';
    cUn.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 4 8"/><line x1="8" y1="12" x2="12" y2="12"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
    cUn.style.cssText='border:none;width:42px;height:42px;border-radius:50%;cursor:pointer;background:#BA7517;display:none;align-items:center;justify-content:center;pointer-events:auto;';
    cBar.appendChild(cCnt); cBar.appendChild(cUn); cBar.appendChild(cOk); cBar.appendChild(cNo);
    ov.appendChild(cBar);
    // ── Row 2: size stepper · opacity stepper · | · colour swatch+flyout · | · save clear revert ──
    function sep2px(){ var d=document.createElement('div'); d.style.cssText='width:1px;height:26px;background:rgba(255,255,255,.18);margin:0 2px;flex:0 0 auto;'; return d; }
    function stepBtn(txt){ var b=document.createElement('button'); b.textContent=txt; b.style.cssText='width:26px;height:30px;border:none;border-radius:6px;background:rgba(255,255,255,.12);color:#fff;font-size:15px;font-weight:700;cursor:pointer;flex:0 0 auto;'; return b; }
    var sizeWrap=document.createElement('div'); sizeWrap.style.cssText='display:flex;flex-direction:row;align-items:center;gap:2px;flex:0 0 auto;';
    sizeWrap.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#9a96a2" stroke-width="2" style="width:15px;height:15px;margin-right:1px;"><path d="M3 6h18M5 12h14M7 18h10"/></svg>';
    var szMinus=stepBtn('\u2212'); var szVal=document.createElement('span'); szVal.id='dlb-mk-size-val'; szVal.textContent='4';
    szVal.style.cssText='font-size:12.5px;color:#dfe;min-width:20px;text-align:center;font-weight:600;';
    var szPlus=stepBtn('+');
    sizeWrap.appendChild(szMinus); sizeWrap.appendChild(szVal); sizeWrap.appendChild(szPlus);
    var opWrap=document.createElement('div'); opWrap.style.cssText='display:flex;flex-direction:row;align-items:center;gap:2px;flex:0 0 auto;';
    opWrap.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#9a96a2" stroke-width="2" style="width:15px;height:15px;margin-right:1px;"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="#9a96a2"/></svg>';
    var opMinus=stepBtn('\u2212');
    var opVal=document.createElement('span'); opVal.id='dlb-mk-op-val'; opVal.textContent='100'; opVal.title='Click to type a value (10\u2013100)';
    opVal.style.cssText='font-size:12.5px;color:#dfe;min-width:30px;text-align:center;font-weight:600;cursor:text;border-radius:4px;';
    var opPlus=stepBtn('+');
    opWrap.appendChild(opMinus); opWrap.appendChild(opVal); opWrap.appendChild(opPlus);
    var colors=['#FF0000','#FFEB3B','#5F8068','#1976D2','#000000','#FFFFFF'];
    var colorBtn=document.createElement('button'); colorBtn.id='dlb-mk-color'; colorBtn.title='Colour';
    colorBtn.style.cssText='flex:0 0 auto;width:40px;height:40px;border:none;background:transparent;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    var colorDot=document.createElement('div'); colorDot.id='dlb-mk-colordot'; colorDot.style.cssText='width:22px;height:22px;border-radius:50%;background:#FF0000;border:2px solid #fff;'; colorBtn.appendChild(colorDot);
    var colorFly=document.createElement('div'); colorFly.id='dlb-mk-colorfly';
    colorFly.style.cssText='position:absolute;z-index:26;display:none;flex-wrap:wrap;gap:6px;width:118px;padding:8px;background:rgba(34,34,44,.99);border:1px solid rgba(255,255,255,.16);border-radius:12px;box-shadow:0 8px 26px rgba(0,0,0,.6);';
    var swatches=colors.map(function(col){ var s=document.createElement('button'); s.className='dlb-mk-swatch'; s.dataset.col=col;
      s.style.cssText='width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.4);background:'+col+';cursor:pointer;padding:0;'; return s; });
    swatches.forEach(function(s){colorFly.appendChild(s);}); ov.appendChild(colorFly);
    function actBtn(id,key,title,color){ var b=document.createElement('button'); b.id=id; b.title=title;
      b.style.cssText='flex:0 0 auto;width:40px;height:40px;border:none;background:transparent;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:'+(color||'#cfd2d6')+';';
      b.innerHTML=_sized(SVG[key]); return b; }
    var bSv=actBtn('dlb-mk-save','check','Save annotated copy','#7fd0a0');
    var bCr=actBtn('dlb-mk-clear','trash','Clear all edits','#e88');
    var bRv=actBtn('dlb-mk-revert','revert','Discard edits',null);
    [sizeWrap,opWrap,sep2px(),colorBtn,sep2px(),bSv,bCr,bRv].forEach(function(e){rowStyle.appendChild(e);});
    bar.appendChild(rowTools); bar.appendChild(rdiv); bar.appendChild(rowStyle);
    ov.appendChild(bar);
    // ═══ S344 Phase 2d-2: docked TEXT bar (FRT port) — swaps in over the markup bar while
    // editing an on-photo text box. size − N + · text-colour A · bg-colour (w/ none) · ↵ · ✕ ✓.
    var TEXT_PALETTE=['#A85959','#E74C3C','#FF9800','#F1C40F','#2196F3','#1565C0','#4CAF50','#9C27B0','#1C2333','#607D8B','#FFFFFF'];
    var _RET='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>';
    var _XS='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    var _OK='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 13 10 18 19 6"/></svg>';
    var _NONEX='<svg width="100%" height="100%" viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" stroke="#e23" stroke-width="2.6"/></svg>';
    var textBar=document.createElement('div'); textBar.id='dlb-text-bar';
    textBar.style.cssText='position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:none;'+
      'align-items:center;gap:4px;padding:7px 9px;background:rgba(20,20,28,.96);border:1.5px solid #C9476A;'+
      'border-radius:14px;z-index:13;box-shadow:0 6px 20px rgba(0,0,0,.55);max-width:calc(100vw - 16px);box-sizing:border-box;flex-wrap:nowrap;';
    textBar.innerHTML=
      '<button type="button" class="tb-dec" style="width:34px;height:40px;border:none;background:transparent;color:#f4f3f6;font:700 20px Calibri;border-radius:8px;cursor:pointer;">\u2212</button>'+
      '<div class="tb-sizeval" style="min-width:26px;text-align:center;font:13px Calibri;color:#a09aa8;font-variant-numeric:tabular-nums;">24</div>'+
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
    ov.appendChild(textBar);
    function _mkPop(){ var pp=document.createElement('div');
      pp.style.cssText='position:absolute;display:none;flex-wrap:wrap;gap:6px;width:160px;padding:8px;background:rgba(34,34,44,.99);border:1px solid rgba(255,255,255,.16);border-radius:12px;box-shadow:0 8px 26px rgba(0,0,0,.6);z-index:27;';
      ov.appendChild(pp); return pp; }
    var textPop=_mkPop(), bgPop=_mkPop();
    function _swatchT(c,isNone){ var s=document.createElement('button'); s.type='button';
      s.style.cssText='width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,.4);cursor:pointer;padding:0;overflow:hidden;';
      if(isNone){ s.style.background='#2a2a32'; s.innerHTML=_NONEX; } else { s.style.background=c; }
      return s; }
    function _tcloseTextPops(){ textPop.style.display='none'; bgPop.style.display='none'; }
    function _posPop(pop, btn){ var br=btn.getBoundingClientRect(), o=ov.getBoundingClientRect();
      pop.style.left=Math.max(6,(br.left-o.left)+br.width/2-80)+'px'; pop.style.bottom=(o.bottom-textBar.getBoundingClientRect().top+8)+'px'; pop.style.right='auto'; }
    var _tc=null;
    function _liftTextBar(){
      if(textBar.style.display==='none') return;
      var vv=window.visualViewport;
      if(vv){ var kb=window.innerHeight - vv.height - vv.offsetTop; if(kb<0) kb=0; textBar.style.bottom=(kb+12)+'px'; }
      else { textBar.style.bottom='16px'; }
    }
    if(window.visualViewport){ window.visualViewport.addEventListener('resize',_liftTextBar); window.visualViewport.addEventListener('scroll',_liftTextBar); }
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
    TEXT_PALETTE.forEach(function(c){ var s=_swatchT(c,false);
      s.addEventListener('click',function(e){ e.stopPropagation(); if(_tc){_tc.setColor(c); _refreshTextBarGlyphs();} _tcloseTextPops(); });
      textPop.appendChild(s); });
    var txCustom=document.createElement('input'); txCustom.type='color'; txCustom.value='#A85959';
    txCustom.style.cssText='width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;padding:0;';
    txCustom.addEventListener('input',function(){ if(_tc){_tc.setColor(txCustom.value); _refreshTextBarGlyphs();} });
    textPop.appendChild(txCustom);
    var bgNone=_swatchT(null,true);
    bgNone.addEventListener('click',function(e){ e.stopPropagation(); if(_tc){_tc.setBg('none'); _refreshTextBarGlyphs();} _tcloseTextPops(); });
    bgPop.appendChild(bgNone);
    TEXT_PALETTE.forEach(function(c){ var s=_swatchT(c,false);
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
    ov.addEventListener('click',function(ev){ if(!textBar.contains(ev.target)) _tcloseTextPops(); });
    // engine hooks: show text bar (hide markup bar) on text start; reverse on end.
    if(_ENG()){
      _ENG()._onTextStart=function(controller){
        _tc=controller; _refreshTextBarGlyphs();
        bar.style.display='none';
        textBar.style.display='flex';
        _liftTextBar(); requestAnimationFrame(_liftTextBar); setTimeout(_liftTextBar,150); setTimeout(_liftTextBar,400);
      };
      _ENG()._onTextEnd=function(){
        _tc=null; _tcloseTextPops(); textBar.style.display='none';
        if(_markupActive) bar.style.display='flex';
        setActiveTool('pen');   // FRT auto-unarm: drop Text after a box so next tap doesn't add another
      };
    }
    document.body.appendChild(ov);
    _built=true;

    // ── Wiring ──
    function setActiveTool(tool){
      _mkTool=tool;
      if(tool!=='select' && _ENG() && _ENG().hasSel && _ENG().hasSel()) _ENG().deselect();   // S314
      // S344: highlight the owning button (group buttons own several tools). De-tint all first.
      [bSel,bPenGrp,bShapeGrp,bTx,bEr].forEach(function(b){ b.style.background='transparent'; b.style.color='#cfd2d6'; });
      var owner=toolBtns[tool];
      if(owner){ owner.style.background='rgba(156,39,66,.9)'; owner.style.color='#fff'; }
      // Group buttons reflect their current member tool's icon.
      if(tool==='pen'||tool==='highlight'||tool==='line'||tool==='arrow'){ bPenGrp.dataset.tool=tool; bPenGrp.innerHTML=_sized(SVG[tool])+'<span class="mk-caret" style="position:absolute;right:2px;bottom:2px;font-size:9px;color:#fff;line-height:1;">\u25B8</span>'; }
      if(tool==='square'||tool==='square-fill'||tool==='circle'||tool==='circle-fill'||tool==='triangle'){ bShapeGrp.dataset.tool=tool; bShapeGrp.innerHTML=_sized(SVG[tool])+'<span class="mk-caret" style="position:absolute;right:2px;bottom:2px;font-size:9px;color:#fff;line-height:1;">\u25B8</span>'; }
      _closeFlyouts();
      if(typeof _refreshConfirmBar==='function') _refreshConfirmBar();
    }
    // S314: live-apply style changes to the current selection (FRT _applyToSelection port).
    var _selGest=null;
    function _selLive(fn){
      if(!(_ENG()&&_ENG().hasSel&&_ENG().hasSel())) return;
      if(!_selGest) _selGest=_ENG().snapSel();
      fn();
    }
    function _selCommit(){ if(_selGest){ _ENG().commitSel(_selGest); _selGest=null; } }
    function setSwatch(col){
      _mkColor=col;
      colorDot.style.background=col;
      swatches.forEach(function(s){ s.style.borderColor=(s.dataset.col===col)?'#fff':'rgba(255,255,255,.4)'; s.style.boxShadow=(s.dataset.col===col)?'0 0 0 2px #9C2742':'none'; });
      if(_ENG()&&_ENG().hasSel&&_ENG().hasSel()){
        var snap=_ENG().snapSel();
        _ENG().applySel('color',col,false);
        _ENG().commitSel(snap);
      }
    }
    _setTool = setActiveTool;   // S295: ESC handler needs to deactivate the tool
    // ── Flyout open/close (pen-group, shapes-group, colour) ──
    function _closeFlyouts(){ [penFly,shapeFly,colorFly,subFly].forEach(function(f){ if(f) f.style.display='none'; }); }
    function _openFlyAbove(fly, anchor, horizontal){
      _closeFlyouts();
      fly.style.display = horizontal ? 'flex' : 'flex';
      var ar=anchor.getBoundingClientRect();
      // measure then place just above the anchor, clamped to viewport
      fly.style.left='0px'; fly.style.top='0px';
      var fr=fly.getBoundingClientRect();
      var left=Math.max(6, Math.min(ar.left+ar.width/2-fr.width/2, window.innerWidth-fr.width-6));
      var top=ar.top-fr.height-8;
      fly.style.left=left+'px'; fly.style.top=top+'px';
    }
    // Group button: tap = activate its current member tool; the caret region opens the flyout.
    function _wireGroup(grpBtn, fly){
      grpBtn.addEventListener('click', function(e){
        var wasOpen=(fly.style.display!=='none');
        var curTool=grpBtn.dataset.tool||'pen';
        var wasActive=(_mkTool===curTool);
        setActiveTool(curTool);   // activate this group's current member (closes flyouts)
        if(wasOpen && wasActive){ _closeFlyouts(); return; }   // second tap on active group → close menu
        _openFlyAbove(fly, grpBtn, true);
      });
      Array.prototype.forEach.call(fly.querySelectorAll('button'), function(mb){
        mb.addEventListener('click', function(){ setActiveTool(mb.dataset.tool); });
      });
    }
    _wireGroup(bPenGrp, penFly);
    _wireGroup(bShapeGrp, shapeFly);
    // Select button: tap activates select + opens the sub-flyout (Rubber-band / Tap select).
    function _hiliteSub(){
      var cur=(_ENG()&&_ENG().getSelectSub)?_ENG().getSelectSub():'rubber';
      Array.prototype.forEach.call(subFly.querySelectorAll('button'), function(b){
        b.style.background=(b.dataset.sub===cur)?'#9C2742':'rgba(255,255,255,.06)';
      });
    }
    bSel.addEventListener('click', function(){
      var wasOpen=(subFly.style.display!=='none');
      var wasSelect=(_mkTool==='select');
      setActiveTool('select');   // this closes flyouts as a side effect
      if(wasOpen && wasSelect){ _closeFlyouts(); return; }   // second tap on active Select → close menu
      _hiliteSub(); _openFlyAbove(subFly, bSel, false);
    });
    Array.prototype.forEach.call(subFly.querySelectorAll('button'), function(sb){
      sb.addEventListener('click', function(){
        if(_ENG()&&_ENG().setSelectSub) _ENG().setSelectSub(sb.dataset.sub);
        setActiveTool('select'); _hiliteSub(); _closeFlyouts(); _refreshConfirmBar();
      });
    });
    // ✓/✗ confirm bar refresh — driven by engine selection state.
    var _barDismissed=false;   // S344: ✓ hides the bar but keeps selection; a new tap re-shows it
    function _placeConfirmBar(){
      // Sit the confirm bar just above the live toolbar with an 8px gap — never overlap,
      // regardless of the two-row bar's height (FRT parity).
      try{
        var br=bar.getBoundingClientRect();
        var gap=window.innerHeight - br.top + 8;   // distance from viewport bottom to bar top, + gap
        cBar.style.bottom=Math.max(96, Math.round(gap))+'px';
      }catch(_){ cBar.style.bottom='112px'; }
    }
    function _refreshConfirmBar(){
      var E=_ENG(); if(!E||_mkTool!=='select'){ cBar.style.display='none'; return; }
      var picking = E.isPicking&&E.isPicking();   // tap-mode marks picked but NOT yet grouped
      var activeGrouped = E.groupActiveId&&E.groupActiveId();   // a grouped mark is tapped → ungroup
      var grouped = E.selCount&&E.selCount()>0;   // S459f: a grouped selection exists
      if(picking){
        cCnt.textContent=(E.pickCount?E.pickCount():0)+' selected';
        cUn.style.display='none'; cOk.style.display='flex'; cNo.style.display='flex';
        cBar.style.display='flex'; _placeConfirmBar();
      } else if(activeGrouped){
        cCnt.textContent='1 grouped';
        cUn.style.display='flex'; cOk.style.display='none'; cNo.style.display='flex';
        cBar.style.display='flex'; _placeConfirmBar();
      } else if(grouped){
        // S459f (Mark): the ✗ must stay available while a group exists — with the bar
        // hidden (old S344 rule) there was NO way to unselect a grouped selection.
        // Only ✗ + count show (nothing to confirm, nothing to unlink); the bar body is
        // click-through (see cBar pointer-events) so it can't eat drag-starts — the
        // original reason S344 hid it.
        cCnt.textContent=(E.selCount?E.selCount():0)+' grouped';
        cUn.style.display='none'; cOk.style.display='none'; cNo.style.display='flex';
        cBar.style.display='flex'; _placeConfirmBar();
      } else { cBar.style.display='none'; }
    }
    cOk.addEventListener('click',function(){ if(_ENG()&&_ENG().confirmPick){ _ENG().confirmPick(); } _refreshConfirmBar(); });   // ✓ = group the picks
    cUn.addEventListener('click',function(){ if(_ENG()&&_ENG().ungroupActive){ _ENG().ungroupActive(); } _refreshConfirmBar(); });   // ⛓ = remove this mark from the group
    cNo.addEventListener('click',function(){ if(_ENG()&&_ENG().cancelSelect){ _ENG().cancelSelect(); } _refreshConfirmBar(); });   // ✗ = clear
    if(_ENG()&&_ENG().onSelChange) _ENG().onSelChange(_refreshConfirmBar);
    bTx.addEventListener('click', function(){ setActiveTool('text'); });
    bEr.addEventListener('click', function(){ setActiveTool('erase'); });
    // ── Colour swatch button → colour flyout ──
    colorBtn.addEventListener('click', function(){
      if(colorFly.style.display!=='none'){ _closeFlyouts(); return; }
      _openFlyAbove(colorFly, colorBtn, false);
    });
    swatches.forEach(function(s){ s.addEventListener('click',function(){ setSwatch(s.dataset.col); _closeFlyouts(); }); });
    // tap outside any flyout closes them
    ov.addEventListener('click', function(e){
      if(penFly.style.display==='none'&&shapeFly.style.display==='none'&&colorFly.style.display==='none'&&subFly.style.display==='none') return;
      if(e.target.closest && (e.target.closest('#dlb-mk-penfly')||e.target.closest('#dlb-mk-shapefly')||e.target.closest('#dlb-mk-colorfly')||e.target.closest('#dlb-mk-subfly')||e.target.closest('#dlb-mk-pengrp')||e.target.closest('#dlb-mk-shapegrp')||e.target.closest('#dlb-mk-color')||e.target.closest('#dlb-mk-sel'))) return;
      _closeFlyouts();
    }, true);
    // ── Size stepper (1–20) ──
    function _applySize(){
      szVal.textContent=String(_mkSize);
      _selLive(function(){
        _ENG().applySel('size',function(s){ return s.tool==='text'?s.size:_mkSize*3; },false);
        _ENG().applySel('fontSize',function(s){ return s.tool==='text'?Math.max(18,_mkSize*8):s.fontSize; },false);
      });
      _selCommit();
    }
    szMinus.addEventListener('click',function(){ _mkSize=Math.max(1,_mkSize-1); _applySize(); });
    szPlus .addEventListener('click',function(){ _mkSize=Math.min(20,_mkSize+1); _applySize(); });
    // ── Opacity stepper (10–100, click value to type) ──
    function _applyOp(){
      opVal.textContent=String(_mkAlpha);
      _selLive(function(){ _ENG().applySel('alpha',function(s){ var a=_mkAlpha/100; return s.tool==='highlight'?0.35*a:a; },false); });
      _selCommit();
    }
    opMinus.addEventListener('click',function(){ _mkAlpha=Math.max(10,_mkAlpha-10); _applyOp(); });
    opPlus .addEventListener('click',function(){ _mkAlpha=Math.min(100,_mkAlpha+10); _applyOp(); });
    opVal.addEventListener('click',function(){
      var v=prompt('Opacity (10–100):', String(_mkAlpha));
      if(v===null) return; var n=parseInt(v,10); if(isNaN(n)) return;
      _mkAlpha=Math.max(10,Math.min(100,n)); _applyOp();
    });
    // ── Undo / Redo / actions ──
    bUn.addEventListener('click',function(){ _ENG().undo(); });
    bRd.addEventListener('click',function(){ _ENG().redoOp(); });
    bCr.addEventListener('click',function(){ _ENG().clear(); });
    bRv.addEventListener('click',_revertMk);
    bSv.addEventListener('click',_toggleMarkup);   // S344: Save commits + exits (Diesel auto-commit path)
    bMk.addEventListener('click',_toggleMarkup);
    bDl.addEventListener('click',_download);
    bRo.addEventListener('click',function(){
      // S373: SINGLE-SOURCE ROTATION. The rotated image lives ONLY in the baked
      // _mkDisplay cache — the live viewer never rotates a baked cache a second time
      // (the old code applied _rot() ON TOP of the rotated cache → double-rotation,
      // the "spin 90° then snap back / stuck sideways" field bug). The durable truth
      // is p.rotation; the live _rotations[_idx] stays 0 for cache-backed photos.
      var p=_photos[_idx];
      if(!(p && typeof p==='object')){
        // Fallback: ephemeral (cacheless) photo — keep the old live-only spin.
        _rotations[_idx]=(_rot()+90)%360;
        _calcFit(); _scale=_fitScale; _panX=0; _panY=0; _apply();
        return;
      }
      // Increment the DURABLE rotation (not the live transform — that's why the
      // console showed 90→180→270 climbing wrong: it was double-counting _rot()).
      p.rotation=(((p.rotation||0)+90)%360+360)%360;
      _rotations[_idx]=0;   // cache will carry the rotation; live transform = 0
      if(typeof _rebuildMkDisplay==='function'){
        _rebuildMkDisplay(p).then(function(){
          _rotations[_idx]=0;       // stays 0 — the cache is already rotated
          _showPhoto(_idx);         // reloads dlb-image = rotated cache; _apply paints at 0°
          if(typeof _dslRefreshPhotoSurfaces==='function') _dslRefreshPhotoSurfaces();
          if(typeof saveState==='function') try{ saveState(); }catch(_e){}
          if(typeof debounceAutosave==='function') debounceAutosave();
          if(typeof _csHubMode!=='undefined' && _csHubMode && typeof CloudSync!=='undefined' && CloudSync.save && typeof _collectCloudState==='function'){
            try{ CloudSync.save(_collectCloudState()); }catch(_e){}
          }
        });
      }
    });
    bCl.addEventListener('click',_close);
    bDel.addEventListener('click',_deleteCurrent);
    _el('dlb-prev').addEventListener('click',function(){ _nav(-1); });
    _el('dlb-next').addEventListener('click',function(){ _nav(1); });
    _resetBarState=function(){
      // S344: bring the toolbar to a clean default — used on markup entry so tool/flyout/
      // confirm/text state never leaks across lightbox open/close.
      try{ if(_ENG()){ if(_ENG()._textController&&_ENG()._textController.cancel) _ENG()._textController.cancel(); if(_ENG().cancelSelect) _ENG().cancelSelect(); if(_ENG().setSelectSub) _ENG().setSelectSub('rubber'); } }catch(_){}
      _closeFlyouts(); _tcloseTextPops();
      if(textBar) textBar.style.display='none';
      if(cBar) cBar.style.display='none';
      setActiveTool('pen');
    };
    setActiveTool('pen'); setSwatch('#FF0000'); _applySize(); _applyOp();
    _wireViewEvents();
    window.addEventListener('resize', function(){
      _closeFlyouts();
      if(_isOpen && _layoutBar) _layoutBar();
      if(_isOpen && !_markupActive) _scheduleFit();
    });
  }

  // ── Transform / view math (FRT) ──
  function _clampPan(){
    var img=_el('dlb-image'), area=_el('dlb-area');
    if(!img||!area||!img.naturalWidth) return;
    var aw=area.clientWidth, ah=area.clientHeight;
    var nw=_sideways()?img.naturalHeight:img.naturalWidth;
    var nh=_sideways()?img.naturalWidth:img.naturalHeight;
    var sw=nw*_scale, sh=nh*_scale;
    if(sw<=aw) _panX=(aw-sw)/2; else _panX=Math.min(0,Math.max(aw-sw,_panX));
    if(sh<=ah) _panY=(ah-sh)/2; else _panY=Math.min(0,Math.max(ah-sh,_panY));
  }
  function _apply(){
    // S285 sanity guard: an oversized image must never sit at fitScale 1 —
    // that's the stuck-fit signature. Recalculate before painting.
    var gimg=_el('dlb-image'), garea=_el('dlb-area');
    if(_fitScale===1 && gimg && garea && gimg.naturalWidth &&
       (gimg.naturalWidth>garea.clientWidth || gimg.naturalHeight>garea.clientHeight)){
      _calcFit();
      if(_scale>0.999 && _scale<1.001) _scale=_fitScale;
    }
    _clampPan();
    // S287: paint via canvas — no CSS transforms anywhere in the photo path.
    var img=_el('dlb-image'), area=_el('dlb-area'), st=_el('dlb-stage');
    if(!img||!area||!st||!img.naturalWidth) return;
    var aw=area.clientWidth, ah=area.clientHeight;
    if(!aw||!ah) return;
    var dpr=Math.min(window.devicePixelRatio||1, 2);
    // S290: the stage canvas is OPAQUE ({alpha:false} — transparent canvas
    // pixels composite WHITE on the affected machine) and is sized/positioned
    // to ONLY the photo's visible bounding box. The overlay div's
    // rgba(0,0,0,.95) shows around it — the FRT translucent backdrop (div
    // alpha compositing is proven good on the same machine by FRT itself).
    var rot=_rot(), nw=img.naturalWidth, nh=img.naturalHeight, offX=0, offY=0;
    if(rot===90){ offX=nh*_scale; }
    else if(rot===180){ offX=nw*_scale; offY=nh*_scale; }
    else if(rot===270){ offY=nw*_scale; }
    var bw=(_sideways()?nh:nw)*_scale, bh=(_sideways()?nw:nh)*_scale; // photo bbox
    var cx=Math.max(Math.floor(_panX),0), cy=Math.max(Math.floor(_panY),0);
    var cw=Math.max(1, Math.min(Math.ceil(_panX+bw),aw)-cx);
    var ch=Math.max(1, Math.min(Math.ceil(_panY+bh),ah)-cy);
    st.style.left=cx+'px'; st.style.top=cy+'px';
    if(st.width!==Math.round(cw*dpr)||st.height!==Math.round(ch*dpr)){
      st.width=Math.round(cw*dpr); st.height=Math.round(ch*dpr);
      st.style.width=cw+'px'; st.style.height=ch+'px';
    }
    var ctx=st._ctx || (st._ctx=st.getContext('2d',{alpha:false}));
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle='#0b0b0d';
    ctx.fillRect(0,0,st.width,st.height);
    ctx.setTransform(dpr,0,0,dpr,(_panX+offX-cx)*dpr,(_panY+offY-cy)*dpr);
    ctx.rotate(rot*Math.PI/180);
    ctx.scale(_scale,_scale);
    try{ ctx.drawImage(img,0,0); }catch(e){ console.warn('[DLB] stage drawImage failed', e); }
    /* ═══ S679-A P1 — host-drawn overlay in photo-natural coords. FRT's
       never-bake vector marks render OVER the clean binary through this hook;
       a host that supplies nothing (Diesel) is byte-for-byte unchanged. */
    try{ if(HOOKS.renderOverlay){ var _p1=_photoObj(_idx); HOOKS.renderOverlay(ctx,_p1,nw,nh,_markupActive); } }catch(_e1){ console.warn('[DLB] host overlay failed', _e1); }
    // saved markup composited over the photo (image natural coords)
    var p=_photoObj(_idx);
    // S367: when a photo is annotated, its displayed image (p.d) ALREADY has the
    // strokes baked in, so compositing p.mk again would double-draw. Only the
    // UNSAVED draft (_mkDraft) needs compositing here — saved p.mk is for re-entry
    // editing, not display. Non-annotated photo with a draft still composites.
    var _draft=(p.id&&_mkDraft[p.id])||null;
    var mkV = _draft ? _draft : (p._annotated ? null : p.mk);
    if(mkV && _ENG() && !_markupActive){
      try{ _ENG().composite(ctx, mkV, nw, nh); }catch(e){ console.warn('[DLB] saved-mk composite failed', e); }
    }
    var z=_el('dlb-zoom');
    if(z&&_fitScale) z.textContent=Math.round((_scale/_fitScale)*100)+'%';
    // keep the markup overlay pinned to the fitted photo rect while active
    if(_markupActive){ _placeMarkupCanvas(); try{ if(_ENG() && _ENG()._repositionTextBox) _ENG()._repositionTextBox(); }catch(_){} }
  }
  // S287: position the markup engine's interactive canvas exactly over the
  // photo as painted on the stage (markup runs at fit scale, pan 0).
  function _placeMarkupCanvas(){
    var img=_el('dlb-image'), cv=_el('dlb-canvas');
    if(!img||!cv||!img.naturalWidth) return;
    cv.style.left=Math.round(_panX)+'px';
    cv.style.top=Math.round(_panY)+'px';
    cv.style.width=Math.round(img.naturalWidth*_scale)+'px';
    cv.style.height=Math.round(img.naturalHeight*_scale)+'px';
  }
  function _calcFit(){
    var img=_el('dlb-image'), area=_el('dlb-area');
    if(!img||!area||!img.naturalWidth){ _fitScale=1; return; }
    var nw=_sideways()?img.naturalHeight:img.naturalWidth;
    var nh=_sideways()?img.naturalWidth:img.naturalHeight;
    _fitScale=Math.min(area.clientWidth/nw, area.clientHeight/nh);
    if(_fitScale>1) _fitScale=1;
  }
  function _resetView(){ _scale=_fitScale; _panX=0; _panY=0; _apply(); }

  // ── View-mode composite of saved markup ──
  // S287: saved markup is composited inside _apply()'s stage draw; this stays
  // as the repaint entry point for existing callers.
  function _paintSavedMk(){ _apply(); }

  // ── Show photo ──
  // S285 fit-bug fix (field-found): the original single onload→_calcFit tick
  // could run before naturalWidth/layout settled, or never run at all for a
  // cached/same-URL src (no load event) — leaving _fitScale stuck at 1 and the
  // photo painted at NATURAL size, clipped by the area, which on white-paper
  // photos looks like a blank white field. _fitNow() is now idempotent and
  // fired from every signal that geometry may have changed: onload, decode(),
  // two rAF ticks after src set, and window resize — plus a sanity guard that
  // refits whenever an oversized image is somehow sitting at fitScale 1.
  var _fitToken=0;
  function _fitNow(){
    var img=_el('dlb-image'), area=_el('dlb-area');
    if(!img||!area||!img.naturalWidth||!area.clientWidth||!area.clientHeight) return false;
    _calcFit();
    _scale=_fitScale; _panX=0; _panY=0;
    _apply();
    _paintSavedMk();
    return true;
  }
  function _scheduleFit(){
    var tok=++_fitToken;
    var tries=0;
    function attempt(){
      if(tok!==_fitToken) return;            // a newer photo superseded this one
      if(_fitNow()) return;
      if(++tries<30) requestAnimationFrame(attempt);  // wait out decode/layout
    }
    requestAnimationFrame(attempt);
  }
  function _showPhoto(i){
    if(i<0||i>=_photos.length) return;
    if(_markupActive) _exitMarkup(false);
    _idx=i;
    var p=_photoObj(i);
    var img=_el('dlb-image');
    var src=_photoSrc(p);
    img.onload=function(){ _scheduleFit(); };
    img.onerror=function(ev){
      if(!img.getAttribute('src')) return;   // S301: src cleared (close/reset) — not a load failure
      /* ═══ S679-B (L2) — host fallback ladder (FRT S341): before declaring a
         load failure, ask the host for the next source. Prevents the blank
         frame on orphaned cloud URLs. No hook → old behaviour. */
      try{ if(HOOKS.photoSrcFallback){ var _alt=HOOKS.photoSrcFallback(_photoObj(_idx), img.currentSrc||img.src||''); if(_alt){ img.src=_alt; return; } } }catch(_){}
      console.warn('[DLB] photo load error', {idx:i, id:p.id||null, src:(img.currentSrc||img.src||'').slice(0,160), ev:ev&&ev.type});
      if(typeof showToast==='function') showToast('Photo failed to load');
    };
    // S300: crossOrigin removed — the displayed img is never a toDataURL source
    // anymore (safe bake loader), and crossOrigin loads fail outright on Chrome
    // cache entries first fetched without CORS (the 'Photo failed to load' toast).
    img.removeAttribute('crossorigin');   // S282b: cloud photos must not taint the canvas
    img.src=src;
    // cached/same-URL loads may never fire onload — schedule regardless, and
    // use decode() as a third independent trigger where supported.
    _scheduleFit();
    if(img.decode){ img.decode().then(function(){ _scheduleFit(); }).catch(function(){}); }
    var c=_el('dlb-counter');
    if(c) c.textContent=(_photos.length>1)?((i+1)+' / '+_photos.length):'';
    _el('dlb-prev').style.display=(i>0&&_photos.length>1)?'':'none';
    _el('dlb-next').style.display=(i<_photos.length-1&&_photos.length>1)?'':'none';
    /* ═══ S679-A P2 — the host hears which photo is up and may mount its own
       info chrome (FRT: the S410 caption+date bar and per-photo context
       label). Diesel supplies nothing and stays photo-only (S284). */
    try{ if(HOOKS.onPhotoShown) HOOKS.onPhotoShown(p,i,_photos.length); }catch(_e2){}
  }
  function _nav(dir){ var n=_idx+dir; if(n>=0&&n<_photos.length) _showPhoto(n); }

  // ── Markup mode ──
  // S305 (Mark): leaving markup with strokes on the canvas COMMITS them — no
  // explicit Save click required. ✎ toggle, the ✕ button, and closing the
  // lightbox all bake + create the Site "(original)" + refresh thumbs. Exiting
  // with an empty canvas just exits. Save button kept for explicit mid-session
  // commits. Prev/Next nav still stashes (resume on return, commit on exit).
  function _maybeCommitOnExit(){
    var p=_photos[_idx];
    if(_ENG() && _ENG().strokes && _ENG().strokes.length){ _saveMk(); }
    else if(p && (p._annotated || p.mk) && _ENG()){
      // S372 (never-bake): the photo WAS annotated and the inspector erased every
      // stroke, then closed. Exiting silently used to leave stale p.mk +
      // p._mkDisplay, so the marks "came back". Persist the cleared state directly
      // (no confirm — the erase IS the intent): clear markup fields + remove the
      // clean-original backup (symmetric FRT S363 lifecycle: no strokes ⇒ no markup).
      _clearMarkupState(p);
    }
    else { _exitMarkup(false); }
  }
  // S372: persist a deliberate full-erase. Mirrors _dslMarkupRevert's cleanup but
  // with no confirmation dialog (the inspector already erased every stroke). Uses
  // the backup machinery when present so the (original) Site Record is removed and
  // the photo returns to its single clean state.
  function _clearMarkupState(p){
    /* ═══ S679-B (L2) — a deliberate full-erase is a persist too; the host
       owns how cleared state is stored (FRT: strokes removed, binary never
       had marks in it to begin with). No hook → Diesel behaviour below. */
    if(HOOKS.clearMarkup){
      try{ HOOKS.clearMarkup(p); }catch(_e){ console.warn('[DLB] host clearMarkup failed', _e); }
      _exitMarkup(false);
      _showPhoto(_idx);
      _dslRefreshPhotoSurfaces();
      return;
    }
    try{
      if(p && p._origBackupId && typeof _dslMarkupRevert==='function'){
        _dslMarkupRevert(p);   // restores clean p.d, clears mk/_mkDisplay/_annotated, drops backup
      } else if(p){
        delete p.mk; delete p._mkDisplay; delete p._annotated; delete p._origBackupId;
        if(typeof _dslStampSiblings==='function'){
          _dslStampSiblings(p, function(sp){ delete sp.mk; delete sp._mkDisplay; delete sp._annotated; delete sp._origBackupId; });
        }
      }
      if(_ENG()) _ENG().clear();
    }catch(e){ console.warn('[DLB] clearMarkupState failed', e); }
    if(p && p.id) delete _mkDraft[p.id];
    _exitMarkup(false);
    _showPhoto(_idx);
    if(typeof saveState==='function') try{ saveState(); }catch(_e){}
    if(typeof debounceAutosave==='function') debounceAutosave();
    if(typeof _csHubMode!=='undefined' && _csHubMode && typeof CloudSync!=='undefined' && CloudSync.save && typeof _collectCloudState==='function'){
      try{ CloudSync.save(_collectCloudState()); }catch(_e){}
    }
    if(_ctx && typeof _ctx.renderer==='function'){ try{ _ctx.renderer(); }catch(_e){} }
    if(typeof _dslRefreshPhotoSurfaces==='function') _dslRefreshPhotoSurfaces();
    if(typeof showToast==='function') showToast('Markup removed \u2014 original kept');
  }
  // S346 (non-destructive markup): resolve a photo's CLEAN ORIGINAL image source
  // so re-entering markup replays p.mk over the original — NOT over the already-
  // baked p.d (which would double-bake the strokes). Reuses the same backup
  // lookup the revert path uses (_origBackupId -> recordPhotos -> backup.d), and
  // falls back to the R2 'original/' key when the original isn't in memory after
  // a fresh device load. Returns '' when this photo has no baked original (a
  // fresh, never-saved photo) — caller then uses the displayed image as-is.
  function _origSrcForMarkup(p){
    if(!p || !p._annotated || !p._origBackupId) return '';   // not a re-open of saved markup
    // 1) original backup record carried in memory (covers same-session + most loads)
    if(typeof recordPhotos!=='undefined'){
      var b=recordPhotos.filter(function(r){ return r && r.id===p._origBackupId; })[0];
      if(b){
        if(b.d) return b.d;                       // clean original binary in memory
        if(b.r2Url) return b.r2Url;               // original at its cloud URL
      }
    }
    // 2) deterministic R2 'original/' key (fresh-device fallback)
    if(p.id && typeof _r2FolderId!=='undefined' && _r2FolderId &&
       typeof R2Photos!=='undefined' && R2Photos.getUrl){
      try{ return R2Photos.getUrl(_r2FolderId, 'diesel', 'original', _r2Fname(p)); }catch(_e){}
    }
    return '';
  }

  function _toggleMarkup(){
    if(_markupActive){ _maybeCommitOnExit(); return; }
    if(!_ENG()){ if(typeof showToast==='function') showToast('Markup engine not loaded'); return; }
    var img=_el('dlb-image'), cv=_el('dlb-canvas');
    if(!img||!img.naturalWidth) return;
    // S304/S305: lay out the bar for this viewport, then show it BEFORE the fit
    // calc so a sheet-mode stage sizes itself to the remaining area.
    if(_layoutBar) _layoutBar();
    var _mb=_el('dlb-markupbar'); _mb.style.display='flex'; void _mb.offsetHeight;
    if(_resetBarState) _resetBarState();   // S344: clean tool/flyout/confirm/text state on entry
    _resetView();                       // markup at fit scale, no pan (FRT rule)
    var p=_photoObj(_idx);
    cv.style.display='block';
    cv.style.pointerEvents='auto';
    // S290: create the markup canvas context OPAQUE before the engine's own
    // getContext (same context object is returned) and have the engine paint
    // the photo as its base layer — a displayed transparent canvas composites
    // WHITE on the affected machine.
    try{ cv.getContext('2d',{alpha:false}); }catch(e){ console.warn('[DLB] opaque markup ctx pre-create failed', e); }
    _ENG().opaqueBase=true;

    // S346: the base image the engine paints under the strokes. For a re-opened
    // annotated photo we MUST paint the clean original (not the baked p.d) or the
    // saved strokes replay on top of already-baked strokes = double image.
    _markupActive=true;
    _el('dlb-area').style.cursor='crosshair';
    var _doAttach=function(){
      // attach to the ON-PAGE dlb-image (it has real offsetWidth/naturalWidth;
      // an off-DOM Image has offsetWidth 0 -> zero-size canvas -> frozen flat look).
      _ENG().attach(cv, img, (p.id&&_mkDraft[p.id])||p.mk||null, function(){
        var _a=_mkAlpha/100;
        return {tool:_mkTool, color:_mkColor, size:_mkSize*3,
                alpha:(_mkTool==='highlight' ? 0.35*_a : _a),
                fontSize:Math.max(18,_mkSize*8)};
      }, null);
      // post-attach setup (was after the if/else; must run AFTER the async
      // original load completes for the clean-original branch).
      _apply();                            // repaints stage WITHOUT baked mk + places canvas
      _placeMarkupCanvas();
      try{ _ENG().render(); }catch(e){ console.warn('[DLB] markup initial render failed', e); }  // paint base photo + loaded strokes
    };

    var _origSrc=_origSrcForMarkup(p);
    var _curSrc=img.getAttribute('src')||img.src||'';
    var baseMode;
    if(_origSrc && _origSrc!==_curSrc){
      // Re-point the DISPLAYED image at the clean original, wait for it to load
      // (real naturalWidth + offsetWidth), then attach + replay strokes over it.
      baseMode='clean-original';
      var _restore=function(){ img.onload=null; img.onerror=null; };
      img.onload=function(){ _restore(); _calcFit(); _scale=_fitScale; _panX=0; _panY=0; _doAttach(); };
      img.onerror=function(){ _restore();
        // S348: the clean-original fetch failed (e.g. R2 404). img is now BROKEN
        // (naturalWidth 0) — attaching here gives the engine a zero-size base, so
        // strokes paint then vanish on the next render. Restore the last-good
        // displayed (baked) src and WAIT for it to reload before attaching, so the
        // base always has real dimensions and new markup can never drop.
        console.warn('[DLB] markup: clean original failed to load — restoring baked display image as base');
        baseMode='fallback-baked';
        if(_curSrc && _curSrc!==img.src){
          img.onload=function(){ img.onload=null; img.onerror=null; _calcFit(); _scale=_fitScale; _panX=0; _panY=0; _doAttach(); };
          img.onerror=function(){ img.onload=null; img.onerror=null;
            console.warn('[DLB] markup: baked display image also failed — attaching as-is');
            _doAttach();
          };
          try{ if(_curSrc.indexOf('data:')!==0) img.removeAttribute('crossorigin'); }catch(_e){}
          img.src=_curSrc;
        } else {
          // already showing the baked image (or no good src to restore) — attach now
          _doAttach();
        }
      };
      try{ if(_origSrc.indexOf('data:')!==0) img.removeAttribute('crossorigin'); }catch(_e){}
      img.src=_origSrc;
    } else {
      // Fresh photo (no baked original) OR original already displayed — attach as-is.
      baseMode = _origSrc ? 'already-original' : 'fresh-photo';
      _doAttach();
    }
  }
  function _exitMarkup(keepStrokes){
    if(_persistBusy){ if(typeof showToast==='function') showToast('Still saving \u2014 one moment\u2026'); return; }   // S303
    try{ if(_ENG() && _ENG()._textController && _ENG()._textController.cancel) _ENG()._textController.cancel(); }catch(_){}   // S344: never leave an open text box behind
    if(_ENG() && !keepStrokes){
      // S295: stash unsaved strokes so leaving markup mode (toggle/nav/close)
      // never loses work — they reload on re-entry and composite in view mode.
      var sp=_photoObj(_idx);
      if(sp && sp.id){
        var draft=_ENG().toMk();
        if(draft) _mkDraft[sp.id]=draft; else delete _mkDraft[sp.id];
      }
      _ENG().detach();
    }
    var cv=_el('dlb-canvas');
    if(cv){ cv.style.pointerEvents='none'; cv.style.display='none'; }
    var _mb2=_el('dlb-markupbar'); _mb2.style.display='none'; void _mb2.offsetHeight;   // S304: reflow, then re-fit to the regrown area
    // Hide the orphaned ✓/✗ selection confirm bar (it lives outside the markup bar,
    // so hiding the markup bar alone left it stranded on close). Clear any pending
    // tap-selection too so a re-open starts with no ghost selection.
    try{
      var _cb=_el('dlb-mk-confirm'); if(_cb) _cb.style.display='none';
      if(_ENG() && _ENG().cancelSelect) _ENG().cancelSelect();
    }catch(_e){}
    _el('dlb-area').style.cursor='grab';
    _markupActive=false;
    _calcFit(); _scale=_fitScale; _panX=0; _panY=0;
    _paintSavedMk();                    // restore saved-state composite
  }
  function _saveMk(){
    console.info('[DLB] saveMk pressed');   // S304: logs unconditionally — if this line is absent, the click never reached the handler
    var p=_photos[_idx];
    if(!p||typeof p!=='object'){ if(typeof showToast==='function') showToast('Cannot save markup on this photo'); return; }
    if(_persistBusy){ console.info('[DLB] saveMk ignored — persist already in flight'); return; }
    /* ═══ S679-B (L2) — HOST PERSISTENCE DELEGATION. Storage direction is
       per-host by law (S496): the shell hands over WHAT happened, the host
       stores it ITS way. FRT persists vector strokes over an untouched
       binary; Diesel (no hook) continues into its bake pipeline below,
       byte-for-byte. On host failure the shell stays in markup so strokes
       are never lost — same promise the bake path makes. */
    if(HOOKS.persistMarkup){
      _persistBusy=true;
      var _pmP=p;
      var _pmDone=function(err){
        _persistBusy=false;
        if(err){ _closeAfterPersist=false; return; }   // host reported; stay in markup
        _exitMarkup(false);
        if(_pmP&&_pmP.id) delete _mkDraft[_pmP.id];
        _showPhoto(_idx);
        _dslRefreshPhotoSurfaces();
        if(_ctx && typeof _ctx.renderer==='function'){ try{ _ctx.renderer(); }catch(_e){} }
        if(_closeAfterPersist){ _closeAfterPersist=false; _close(); }
      };
      try{ HOOKS.persistMarkup(_pmP, _ENG(), _pmDone); }catch(_e){ _pmDone(_e); }
      return;
    }
    var mk=_ENG().toMk();
    console.info('[DLB] saveMk', {id:p.id||null, strokes:(mk&&mk.o)?mk.o.length:0, annotated:!!p._annotated});
    if(!mk){
      // No strokes drawn this session — nothing new to bake.
      _exitMarkup(false);
      if(_closeAfterPersist){ _closeAfterPersist=false; _close(); return; }
      if(typeof showToast==='function') showToast(p._annotated?'No new markup to save':'No markup to save');
      return;
    }
    // S292/S300: FRT persistence semantics — bake original+strokes (from a
    // taint-free source, async), swap display/R2 to the marked version, keep a
    // clean "(original)" duplicate in Site Records. Markup mode stays open and
    // strokes stay live until persist actually succeeds.
    if(typeof showToast==='function') showToast('Saving markup\u2026');
    _persistBusy=true;
    var _sb=_el('dlb-mk-save'); if(_sb){ _sb.disabled=true; _sb.textContent='Saving\u2026'; _sb.style.opacity='.6'; }
    var _sbDone=function(){ _persistBusy=false; if(_sb){ _sb.disabled=false; _sb.textContent='Save'; _sb.style.opacity='1'; } };
    _dslMarkupPersist(p, mk).then(function(){
      _sbDone();
      _exitMarkup(false);
      delete _mkDraft[p.id];   // strokes are baked into the photo — drop the session draft
      // S372: if the photo carries a persisted rotation, the flat composite from
      // persist is at 0° — rebuild so marks AND rotation both show, then reload.
      var _afterDisp = function(){
        _showPhoto(_idx);        // reload — photo now displays the composited version
        if(typeof showToast==='function') showToast('\u2713 Markup saved \u2014 original kept in Site Records');
        if(typeof saveState==='function') try{ saveState(); }catch(e){ console.warn('[DLB] saveMk saveState failed', e); }
        if(typeof debounceAutosave==='function') debounceAutosave();
        if(typeof _csHubMode!=='undefined' && _csHubMode && typeof CloudSync!=='undefined' && CloudSync.save){
          try{ CloudSync.save(_collectCloudState()); }catch(e){ console.warn('[DLB] saveMk cloud push failed', e); }
        }
        if(_ctx && typeof _ctx.renderer==='function'){ try{ _ctx.renderer(); }catch(e){ console.warn('[DLB] saveMk renderer failed', e); } }
        _dslRefreshPhotoSurfaces();   // S301: checklist/defic/flow thumbs too, not just gallery
        if(_closeAfterPersist){ _closeAfterPersist=false; _close(); }   // S305: commit was triggered by closing the lightbox
      };
      if(((p.rotation||0)%360)!==0 && typeof _rebuildMkDisplay==='function'){
        _rebuildMkDisplay(p).then(_afterDisp);
      } else {
        _afterDisp();
      }
    }).catch(function(e){
      _sbDone();
      _closeAfterPersist=false;   // S305: stay open on failure so the strokes are visible
      console.warn('[DLB] saveMk persist failed', e);
      if(typeof showToast==='function') showToast('Markup save failed \u2014 '+((e&&e.message)||e)+'. Your strokes are still here.');
      // stay in markup mode so the strokes aren't lost
    });
  }
  function _revertMk(){
    var p=_photos[_idx];
    if(!p||typeof p!=='object') return;
    /* ═══ S679-B (L2) — host-owned revert. FRT's marks are vectors OVER the
       photo, so revert is deleting data, not restoring a backup; the host
       confirms and clears its own fields. changed=false → nothing to do. */
    if(HOOKS.revertMarkup){
      HOOKS.revertMarkup(p, _ENG(), function(changed, msg){
        if(!changed) return;
        try{ if(_ENG()) _ENG().clear(); }catch(_e){}
        _exitMarkup(false);
        if(p&&p.id) delete _mkDraft[p.id];
        _showPhoto(_idx);
        if(msg) showToast(msg);
        _dslRefreshPhotoSurfaces();
      });
      return;
    }
    var dirty = !!(_ENG() && _ENG().isDirty());
    var hasBaked = !!p._origBackupId;
    var hasVector = !!p.mk;                       // legacy vector-only save (pre-S292)
    if(!hasBaked && !hasVector && !dirty) return;
    var finish = function(msg){
      if(_ENG()) _ENG().clear();
      _exitMarkup(false);
      if(p && p.id) delete _mkDraft[p.id];   // S295: revert discards the session draft as well
      _showPhoto(_idx);   // reload restored original
      if(msg && typeof showToast==='function') showToast(msg);
      if(typeof saveState==='function') try{ saveState(); }catch(e){ console.warn('[DLB] revertMk saveState failed', e); }
      if(typeof debounceAutosave==='function') debounceAutosave();
      if(typeof _csHubMode!=='undefined' && _csHubMode && typeof CloudSync!=='undefined' && CloudSync.save){
        try{ CloudSync.save(_collectCloudState()); }catch(e){ console.warn('[DLB] revertMk cloud push failed', e); }
      }
      if(_ctx && typeof _ctx.renderer==='function'){ try{ _ctx.renderer(); }catch(e){ console.warn('[DLB] revertMk renderer failed', e); } }
      _dslRefreshPhotoSurfaces();   // S301: checklist/defic/flow thumbs too, not just gallery
    };
    if(hasBaked){
      // S292: FRT semantics — restore original, remove the "(original)" backup
      // record, delete the marked R2 object.
      var doIt=function(){
        try{ _dslMarkupRevert(p); }catch(e){ console.warn('[DLB] revertMk failed', e); if(typeof showToast==='function') showToast('Revert failed: '+((e&&e.message)||e)); return; }
        finish('\u2713 Reverted to original');
      };
      if(typeof _aConfirm==='function') _aConfirm('All markup will be removed and the (original) backup will also be deleted. This cannot be undone.', doIt, 'Revert to original');
      else doIt();
      return;
    }
    if(hasVector){
      // Legacy vector markup (saved before S292) — deleting p.mk restores the view.
      var doIt2=function(){ delete p.mk; finish('Markup removed \u2014 original intact'); };
      if(typeof _aConfirm==='function') _aConfirm('Remove all saved markup from this photo? The original photo is untouched.', doIt2, 'Remove markup');
      else doIt2();
      return;
    }
    // Only unsaved strokes from this session — just clear them.
    finish(null);
  }

  // ── Download (composite original + markup at natural res) ──
  function _download(){
    var p=_photoObj(_idx);
    if(!p) return;
    // S300: composite from the taint-free bake loader, not the displayed img —
    // toBlob throws on a tainted canvas exactly like toDataURL did in persist.
    var mkLive = (_markupActive && _ENG() && _ENG().canvas) ? _ENG().toMk() : null;
    var mkV = mkLive || (p.id&&_mkDraft[p.id]) || p.mk || null;
    _dslLoadBakeImage(p).then(function(bake){
      var img=bake.img;
      var c=document.createElement('canvas');
      c.width=img.naturalWidth; c.height=img.naturalHeight;
      var cx=c.getContext('2d');
      cx.drawImage(img,0,0,c.width,c.height);
      if(mkV && _ENG()) _ENG().composite(cx,mkV,c.width,c.height);
      bake.revoke();
      c.toBlob(function(blob){
        if(!blob){ console.warn('[DLB] download: toBlob returned null'); return; }
        var url=URL.createObjectURL(blob);
        var a=document.createElement('a');
        a.href=url; a.download=(p.n&&/\.(jpe?g|png|webp)$/i.test(p.n))?p.n:('photo_'+Date.now()+'.jpg');
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); },1000);
      },'image/jpeg',0.95);
    }).catch(function(e){
      console.warn('[DLB] download composite failed, fetching original to save', e);
      // S365: do NOT window.open (that just navigates to the image = "opens a
      // webpage"). Fetch the bytes and save a real file, validating it's an image.
      var src=_photoSrc(p);
      if(!src){ if(typeof showToast==='function') showToast('Photo not available'); return; }
      fetch(src).then(function(resp){
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        return resp.blob();
      }).then(function(blob){
        return (typeof _isRealImageBlob==='function' ? _isRealImageBlob(blob) : Promise.resolve(true)).then(function(ok){
          if(!ok) throw new Error('fetched content is not a valid image');
          var url=URL.createObjectURL(blob);
          var a=document.createElement('a');
          a.href=url; a.download=(p.n&&/\.(jpe?g|png|webp)$/i.test(p.n))?p.n:('photo_'+Date.now()+'.jpg');
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function(){ URL.revokeObjectURL(url); },2000);
        });
      }).catch(function(err){
        console.warn('[DLB] download fallback failed', err);
        if(typeof showToast==='function') showToast('Download failed — photo not available');
      });
    });
  }

  // ── View-mode events (FRT pan/zoom/swipe, scoped to dlb-area) ──
  function _wireViewEvents(){
    var area=_el('dlb-area');
    area.addEventListener('wheel',function(e){
      if(!_isOpen||_markupActive) return;
      e.preventDefault();
      var rect=area.getBoundingClientRect();
      var mx=e.clientX-rect.left, my=e.clientY-rect.top;
      var ix=(mx-_panX)/_scale, iy=(my-_panY)/_scale;
      var delta=e.deltaY>0?0.9:1.1;
      var ns=Math.max(_fitScale,Math.min(8,_scale*delta));
      if(ns<=_fitScale){ _scale=_fitScale; _panX=0; _panY=0; _apply(); return; }
      _panX=mx-ix*ns; _panY=my-iy*ns; _scale=ns; _apply();
    },{passive:false});
    area.addEventListener('mousedown',function(e){
      if(!_isOpen||_markupActive) return;
      if(e.target.closest&&e.target.closest('button')) return;
      _dragging=true; _lastX=e.clientX; _lastY=e.clientY; area.style.cursor='grabbing'; e.preventDefault();
    });
    window.addEventListener('mousemove',function(e){
      if(!_isOpen||!_dragging||_markupActive) return;
      if(_scale<=_fitScale) return;
      _panX+=e.clientX-_lastX; _panY+=e.clientY-_lastY;
      _lastX=e.clientX; _lastY=e.clientY; _apply();
    });
    window.addEventListener('mouseup',function(){ if(_isOpen){ _dragging=false; var a=_el('dlb-area'); if(a&&!_markupActive)a.style.cursor='grab'; } });
    area.addEventListener('dblclick',function(e){
      if(!_isOpen||_markupActive) return;
      e.preventDefault();
      if(_scale>_fitScale*1.05){ _resetView(); return; }
      var rect=area.getBoundingClientRect();
      var mx=e.clientX-rect.left, my=e.clientY-rect.top;
      var ix=(mx-_panX)/_scale, iy=(my-_panY)/_scale;
      _scale=Math.min(8,_fitScale*2.5);
      _panX=mx-ix*_scale; _panY=my-iy*_scale; _apply();
    });
    area.addEventListener('touchstart',function(e){
      if(!_isOpen||_markupActive) return;
      if(e.target.closest&&e.target.closest('button')) return;
      if(e.touches.length===2){
        e.preventDefault();
        var dx=e.touches[1].clientX-e.touches[0].clientX, dy=e.touches[1].clientY-e.touches[0].clientY;
        _tDist=Math.sqrt(dx*dx+dy*dy); _tScale=_scale;
        var rect=area.getBoundingClientRect();
        _tMidX=(e.touches[0].clientX+e.touches[1].clientX)/2-rect.left;
        _tMidY=(e.touches[0].clientY+e.touches[1].clientY)/2-rect.top;
        _tPanX=_panX; _tPanY=_panY; _swiping=false;
      } else if(e.touches.length===1){
        _sX=e.touches[0].clientX; _sY=e.touches[0].clientY;
        _swX=_sX; _swY=_sY;
        _swiping=(_scale<=_fitScale*1.05);
        var now=Date.now();
        if(now-_lastTap<350){
          e.preventDefault();
          if(_scale>_fitScale*1.5){ _resetView(); }
          else {
            var rect2=area.getBoundingClientRect();
            var mx=e.touches[0].clientX-rect2.left, my=e.touches[0].clientY-rect2.top;
            var ix=(mx-_panX)/_scale, iy=(my-_panY)/_scale;
            _scale=Math.min(8,_fitScale*3);
            _panX=mx-ix*_scale; _panY=my-iy*_scale; _apply();
          }
          _lastTap=0; _swiping=false;
        } else _lastTap=now;
      }
    },{passive:false});
    area.addEventListener('touchmove',function(e){
      if(!_isOpen||_markupActive) return;
      if(e.touches.length===2){
        e.preventDefault(); _swiping=false;
        var dx=e.touches[1].clientX-e.touches[0].clientX, dy=e.touches[1].clientY-e.touches[0].clientY;
        var dist=Math.sqrt(dx*dx+dy*dy);
        if(!_tDist) return;
        var ns=Math.max(_fitScale,Math.min(8,_tScale*(dist/_tDist)));
        var ix=(_tMidX-_tPanX)/_tScale, iy=(_tMidY-_tPanY)/_tScale;
        _scale=ns; _panX=_tMidX-ix*ns; _panY=_tMidY-iy*ns; _apply();
      } else if(e.touches.length===1){
        if(_swiping){
          var dX=e.touches[0].clientX-_swX, dY=e.touches[0].clientY-_swY;
          if(Math.abs(dY)>Math.abs(dX)*1.5 && Math.abs(dX)<30) _swiping=false;
        } else if(_scale>_fitScale){
          e.preventDefault();
          _panX+=e.touches[0].clientX-_sX; _panY+=e.touches[0].clientY-_sY; _apply();
        }
        _sX=e.touches[0].clientX; _sY=e.touches[0].clientY;
      }
    },{passive:false});
    area.addEventListener('touchend',function(e){
      if(!_isOpen) return;
      if(e.touches.length<2) _tDist=0;
      if(e.touches.length===1){ _sX=e.touches[0].clientX; _sY=e.touches[0].clientY; }
      if(_swiping && e.touches.length===0 && e.changedTouches && e.changedTouches.length){
        var diff=e.changedTouches[0].clientX-_swX;
        if(Math.abs(diff)>60){ if(diff>0) _nav(-1); else _nav(1); }
        _swiping=false;
      }
    });
    document.addEventListener('keydown',function(e){
      if(!_isOpen) return;
      if(e.key==='Escape'){
        // S295 (Mark): ESC steps down, NEVER destroys work. Markup mode:
        // modal open -> modal owns it; selection -> deselect; tool active ->
        // deactivate tool; else nothing. Exit is only via the pencil toggle
        // or Save; strokes survive exit via the session draft stash.
        if(document.querySelector('._a-modal-ov')) return;
        if(_markupActive){
          if(_ENG() && _ENG().hasSel && _ENG().hasSel()){ _ENG().deselect(); }   // S314
          else if(_mkTool && _setTool){ _setTool(null); }
          e.preventDefault(); return;
        }
        _close(); e.preventDefault(); return;
      }
      if(_markupActive&&(e.ctrlKey||e.metaKey)){
        if(e.key==='z'||e.key==='Z'){ _ENG().undo(); e.preventDefault(); return; }
        if(e.key==='y'||e.key==='Y'){ _ENG().redoOp(); e.preventDefault(); return; }
      }
      // S296: Delete/Backspace removes the selected stroke (op-logged, undoable)
      if(_markupActive&&(e.key==='Delete'||e.key==='Backspace')){
        var ae=document.activeElement;
        if(!(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA')) &&
           _ENG() && _ENG().hasSel && _ENG().hasSel()){   // S314
          _ENG().deleteSelected(); e.preventDefault(); return;
        }
      }
      if(_markupActive) return;
      if(e.key==='ArrowLeft'){ _nav(-1); e.preventDefault(); }
      if(e.key==='ArrowRight'){ _nav(1); e.preventDefault(); }
      if(e.key==='+'||e.key==='='){ _scale=Math.min(8,_scale*1.2); _apply(); }
      if(e.key==='-'){ _scale=Math.max(_fitScale,_scale/1.2); if(_scale<=_fitScale){_panX=0;_panY=0;} _apply(); }
      if(e.key==='0'){ _resetView(); }
      if(e.key==='r'||e.key==='R'){ var _rb=_el('dlb-rotate'); if(_rb) _rb.click(); }   // S373: one rotation path (persist + single-source cache)
    });
  }

  // ── iOS-safe scroll lock (gauge-modal pattern) ──
  function _lockScroll(){
    _scrollLockY=window.scrollY||document.documentElement.scrollTop||0;
    document.body.style.position='fixed';
    document.body.style.top=(-_scrollLockY)+'px';
    document.body.style.left='0'; document.body.style.right='0';
    document.body.style.overflow='hidden';
  }
  function _unlockScroll(){
    document.body.style.position='';
    document.body.style.top=''; document.body.style.left=''; document.body.style.right='';
    document.body.style.overflow='';
    window.scrollTo(0,_scrollLockY);
  }

  // ── Open / close ──
  function _open(photos, idx, ctx){
    if(!photos||!photos.length) return;
    // S337: never show a soft-deleted photo. Filter the array and remap the
    // requested index by identity so prev/next nav can never page onto a deleted
    // photo. Centralized here so every call site (cards, gallery, flow) is
    // automatically consistent without per-surface array juggling.
    var _want = photos[(typeof idx==='number')?idx:0];
    var _live = photos.filter(function(p){ return !_isPhotoDeleted(p); });
    if(!_live.length) return;   // everything in this set is deleted — nothing to show
    var _ni = _live.indexOf(_want);
    if(_ni < 0) _ni = 0;        // requested photo was deleted — fall back to first live
    photos = _live; idx = _ni;
    _build();
    _photos=photos; _idx=(typeof idx==='number')?idx:0; _ctx=ctx||null;
    _rotations={}; _isOpen=true;
    var ov=_el('dlb-overlay');
    // FRT S205: re-parent to be last child of <body> — escapes any ancestor
    // stacking context so the lightbox always paints on top.
    if(ov.parentNode!==document.body || ov!==document.body.lastElementChild) document.body.appendChild(ov);
    ov.style.display='flex';
    _lockScroll();
    _showPhoto(_idx);
  }
  // S339: unified delete from the lightbox — works from ANY surface that opens it
  // (gallery, evidence tiles, deficiency thumbs, flow). Soft-deletes the current
  // photo (→ Recently Deleted, 90-day restore), closes, and re-renders the host
  // surface via the ctx renderer so the thumbnail disappears immediately.
  function _deleteCurrent(){
    var p = _photos[_idx];
    if(!p || !p.id){ if(typeof showToast==='function') showToast('Photo not found'); return; }
    var renderer = _ctx && _ctx.renderer;
    if(typeof deletePhotoEverywhere==='function'){
      deletePhotoEverywhere({photoId:p.id}, function(){
        try{ if(typeof renderer==='function') renderer(); }catch(e){}
        try{ if(typeof _renderPhotoGallery==='function') _renderPhotoGallery(); }catch(e){}
      });
      _close();
    }
  }
  function _close(){
    if(_markupActive && _ENG() && _ENG().strokes && _ENG().strokes.length && !_persistBusy){
      _closeAfterPersist=true;   // S305: auto-commit, then finish closing in the save's success path
      _saveMk();
      return;
    }
    if(_markupActive) _exitMarkup(false);
    _isOpen=false; _photos=[]; _rotations={}; _ctx=null;
    var ov=_el('dlb-overlay');
    if(ov) ov.style.display='none';
    // S301: clearing src fires the armed onerror ('Photo failed to load' on
    // every close) — drop the handlers first.
    var img=_el('dlb-image'); if(img){ img.onerror=null; img.onload=null; img.removeAttribute('src'); }
    _unlockScroll();
  }

  function _handleBack(){
     if(!_isOpen) return false;
     if(document.querySelector('._a-modal-ov')) return true;
     if(_markupActive){
       if(_ENG() && _ENG().hasSel && _ENG().hasSel()){ _ENG().deselect(); return true; }
       if(_mkTool && _setTool){ _setTool(null); return true; }
       _close(); return true;
     }
     _close(); return true;
  }
  return { open:_open, close:_close, isOpen:function(){return _isOpen;}, handleBack:_handleBack,
    enterMarkup:function(){ if(_isOpen && !_markupActive){ _toggleMarkup(); } } };
}

var API = { build: build, VERSION: '1.0.0' };
if (root) root.LightboxShell = API;
try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
