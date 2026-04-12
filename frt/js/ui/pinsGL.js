// FRT v2 — WebGL Pin Renderer (Phase 5 polish)
// ════════════════════════════════════════════════════════════════════════════
// Pixi.js-based teardrop pin renderer. Matches HTML pin visuals exactly:
//   - White outer teardrop (body outline)
//   - Colored inner teardrop (priority fill)
//   - White circle centered in the head
//   - Priority-colored number text
//   - Drop-shadow glow (doubled for outstanding items)
//   - Closed pins at 0.5 alpha
//
// Key behaviors (match HTML, except fixed size):
//   - Fixed screen size at EVERY zoom level (fixes HTML's grow-on-zoom bug)
//   - Anchored at bottom-center (tip of teardrop = exact pin location)
//   - Size = 32px wide × 42px tall at 1× DPR (same as HTML @ 24–96px range,
//     just locked to 32px since HTML's size-from-drawing-resolution heuristic
//     never made sense for field use)
//   - Tap-to-select opens pin editor
//   - Long-press (400ms) + drag to reposition
//   - Hit-test uses teardrop body bbox (generous for fat fingers)
//
// Contract:
//   window.PinsGL = {
//     isSupported(): boolean,
//     init(hostEl, {w, h}): Promise<true>,          // hostEl = dv-canvas-area (outside dv-img-wrap)
//     resize(w, h),
//     render(pins, {scale, panX, panY, imgRect}),   // called on every transform/pin change
//     hitTest(clientX, clientY): deficId | null,    // screen coords → pin
//     getPinScreenRect(deficId): {x,y,w,h} | null,  // for drag ghost positioning
//     destroy()
//   };
//
// Pin record shape (matches what viewer.js supplies):
//   { deficId: string, num: number, pinX: 0..1, pinY: 0..1,
//     priority: 'high'|'low'|'general', isClosed: bool, isIAR: bool }
//
(function(){
  'use strict';

  var PIXI_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.4.2/pixi.min.js';
  var _pixiLoading = null;

  function loadPixi(){
    if (window.PIXI) return Promise.resolve(window.PIXI);
    if (_pixiLoading) return _pixiLoading;
    _pixiLoading = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = PIXI_URL;
      s.async = true;
      s.onload  = function(){ resolve(window.PIXI); };
      s.onerror = function(){ _pixiLoading = null; reject(new Error('Pixi.js failed to load')); };
      document.head.appendChild(s);
    });
    return _pixiLoading;
  }

  function isSupported(){
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      return !!gl;
    } catch(_){ return false; }
  }

  // ─── Module state ───────────────────────────────────────────────────────
  var _app = null;
  var _stage = null;
  var _canvas = null;
  var _host = null;
  var _pinSize = 32;          // CSS px wide (height = size * 42/32)
  var _pins = [];             // last rendered pin list (for hit testing)
  var _pinScreenPos = {};     // deficId -> {x,y,w,h} in canvas-local CSS px (last render)

  // ─── Pin SVG path constants (match HTML exactly) ────────────────────────
  // HTML used viewBox="0 0 32 42". We reproduce the same two teardrop paths:
  //   outer: M16 1C8.3 1 2 7.3 2 15c0 10.5 14 25 14 25s14-14.5 14-25C30 7.3 23.7 1 16 1z   (fill white)
  //   inner: M16 3C9.4 3 4 8.4 4 15c0 9.5 12 22 12 22s12-12.5 12-22C28 8.4 22.6 3 16 3z    (fill priority color)
  //   circle: cx=16 cy=14 r=9 fill white opacity .95
  //   text: x=16 y=14.5 (baseline central)

  function _priorityColor(pin){
    if (pin.isIAR) return 0xE91E8C;
    if (pin.priority === 'general') return 0x1A7A4A;
    if (pin.priority === 'low')     return 0xE67E22;
    return 0xC0392B; // high
  }

  function _priorityHex(pin){
    if (pin.isIAR) return '#E91E8C';
    if (pin.priority === 'general') return '#1A7A4A';
    if (pin.priority === 'low')     return '#E67E22';
    return '#C0392B';
  }

  // Draw a teardrop into a PIXI.Graphics at native (32×42) scale
  function _drawTeardropOuter(g){
    g.beginFill(0xFFFFFF);
    // Approximation of M16 1C8.3 1 2 7.3 2 15c0 10.5 14 25 14 25s14-14.5 14-25C30 7.3 23.7 1 16 1z
    // Use bezier curves that match the SVG path exactly
    g.moveTo(16, 1);
    g.bezierCurveTo(8.3, 1, 2, 7.3, 2, 15);
    // c0 10.5 14 25 14 25 → cp1=(2, 25.5), cp2=(16, 40), end=(16, 40)
    g.bezierCurveTo(2, 25.5, 16, 40, 16, 40);
    // s14-14.5 14-25 → mirror of prev, so cp1=(16, 40), cp2=(30, 25.5), end=(30, 15)
    g.bezierCurveTo(16, 40, 30, 25.5, 30, 15);
    // C30 7.3 23.7 1 16 1
    g.bezierCurveTo(30, 7.3, 23.7, 1, 16, 1);
    g.closePath();
    g.endFill();
  }

  function _drawTeardropInner(g, color){
    g.beginFill(color);
    g.moveTo(16, 3);
    g.bezierCurveTo(9.4, 3, 4, 8.4, 4, 15);
    g.bezierCurveTo(4, 24.5, 16, 37, 16, 37);
    g.bezierCurveTo(16, 37, 28, 24.5, 28, 15);
    g.bezierCurveTo(28, 8.4, 22.6, 3, 16, 3);
    g.closePath();
    g.endFill();
  }

  // ─── Init ────────────────────────────────────────────────────────────────
  function init(hostEl, opts){
    opts = opts || {};
    return loadPixi().then(function(PIXI){
      if (_app){ try { _app.destroy(true); } catch(_){} _app = null; _stage = null; _canvas = null; }
      _host = hostEl;
      var w = Math.max(1, opts.w || hostEl.clientWidth || 1);
      var h = Math.max(1, opts.h || hostEl.clientHeight || 1);

      _app = new PIXI.Application({
        width: w, height: h,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        powerPreference: 'high-performance'
      });
      _canvas = _app.view;
      _canvas.id = 'dv-pins-gl';
      _canvas.style.cssText =
        'position:absolute;' +
        'left:0;top:0;' +
        'width:100%;height:100%;' +
        'pointer-events:none;' +    // pin hit-testing routed through viewer.js handlers
        'z-index:5;';              // above markup, below HUD
      hostEl.appendChild(_canvas);
      _stage = _app.stage;
      _stage.sortableChildren = false;
      return true;
    });
  }

  function resize(w, h){
    if (!_app || !_app.renderer) return;
    try { _app.renderer.resize(Math.max(1,w|0), Math.max(1,h|0)); } catch(_){}
  }

  // Draw outer teardrop with optional offset + scale factor around center (16, 21).
  // Used by both the main body and the shadow layers.
  function _drawTeardropOuterInto(g, dx, dy, factor){
    var cx = 16, cy = 21;
    function sx(x){ return cx + (x - cx) * factor + dx; }
    function sy(y){ return cy + (y - cy) * factor + dy; }
    g.moveTo(sx(16), sy(1));
    g.bezierCurveTo(sx(8.3), sy(1), sx(2), sy(7.3), sx(2), sy(15));
    g.bezierCurveTo(sx(2), sy(25.5), sx(16), sy(40), sx(16), sy(40));
    g.bezierCurveTo(sx(16), sy(40), sx(30), sy(25.5), sx(30), sy(15));
    g.bezierCurveTo(sx(30), sy(7.3), sx(23.7), sy(1), sx(16), sy(1));
    g.closePath();
  }

  // Build a soft drop-shadow / glow using stacked translucent teardrops.
  // Outstanding (open, non-IAR) items get a priority-colored halo on top of the dark shadow.
  // state=hover → stronger halo; state=active → even stronger + larger shadow
  function _buildShadow(g, color, outstanding, state){
    var haloMul = state === 'active' ? 2.5 : state === 'hover' ? 1.8 : 1.0;
    var shadowMul = state === 'active' ? 1.6 : state === 'hover' ? 1.3 : 1.0;
    if (outstanding){
      for (var i = 3; i >= 1; i--){
        g.beginFill(color, Math.min(0.35, 0.12 * haloMul));
        _drawTeardropOuterInto(g, 0, 0, 1 + i * 0.05 * (state === 'active' ? 1.3 : state === 'hover' ? 1.15 : 1));
        g.endFill();
      }
    }
    for (var j = 3; j >= 1; j--){
      g.beginFill(0x000000, Math.min(0.22, 0.10 * shadowMul));
      _drawTeardropOuterInto(g, 0, 2, 1 + j * 0.04 * (state === 'active' ? 1.3 : state === 'hover' ? 1.15 : 1));
      g.endFill();
    }
  }

  // ─── Build a pin Container at native 32×42 coordinate space ─────────────
  // state: 'normal' | 'hover' | 'active'
  function _buildPin(PIXI, pin, state){
    var container = new PIXI.Container();
    container.sortableChildren = false;

    var isOutstanding = !pin.isClosed && !pin.isIAR;
    var priColor = _priorityColor(pin);

    // Layer 0: drop shadow / glow — intensified on hover/active
    var shadow = new PIXI.Graphics();
    _buildShadow(shadow, priColor, isOutstanding, state);
    container.addChild(shadow);

    // Layer 1: solid colored teardrop (NO outer white border per V1 design)
    var art = new PIXI.Graphics();
    art.beginFill(priColor, 1);
    _drawTeardropOuterInto(art, 0, 0, 1);
    art.endFill();
    // Inner white circle (r=9 at 16,14)
    art.beginFill(0xFFFFFF, 0.95);
    art.drawCircle(16, 14, 9);
    art.endFill();

    // Hover/active brightness tint
    if (state === 'hover') {
      art.tint = 0xFFFFFF;  // Pixi-v7: no-op on Graphics with beginFill; keep for future Sprite swap
    }
    container.addChild(art);

    // Layer 2: number text
    var numStr = String(pin.num);
    var numFs = numStr.length <= 2 ? 14 : numStr.length === 3 ? 11 : 9;
    var style = new PIXI.TextStyle({
      fontFamily: 'Calibri, Arial, sans-serif',
      fontSize: numFs,
      fontWeight: '900',
      fill: _priorityHex(pin)
    });
    var text = new PIXI.Text(numStr, style);
    text.resolution = Math.max(2, window.devicePixelRatio || 1) * 2;
    text.anchor.set(0.5, 0.5);
    text.position.set(16, 14);
    container.addChild(text);

    // Hover: slight scale-up for feedback (like CSS :hover transform)
    // Active: a little more
    if (state === 'hover') container.scale.set(1.08, 1.08);
    else if (state === 'active') container.scale.set(1.15, 1.15);

    return container;
  }

  // ─── Render: position + size all pins at screen coords ──────────────────
  // opts: { scale, panX, panY, imgRect: {left,top,width,height} of dv-img-wrap RELATIVE TO host canvas }
  // Pins render at FIXED CSS size regardless of zoom.
  function render(pins, opts){
    if (!_app || !_stage) return;
    var PIXI = window.PIXI;
    if (!PIXI) return;

    // Wipe previous frame
    while (_stage.children.length){
      var ch = _stage.children[0];
      _stage.removeChild(ch);
      try { if (ch.destroy) ch.destroy({ children: true }); } catch(_){}
    }

    _pins = pins || [];
    _pinScreenPos = {};
    if (!_pins.length){
      _app.renderer.render(_stage);
      return;
    }

    opts = opts || {};
    var scale  = opts.scale  || 1;
    var pinScale = opts.pinScale != null ? opts.pinScale : 1;
    var hoveredId = opts.hoveredId || null;
    var activeId  = opts.activeId  || null;
    var imgRect = opts.imgRect || { left: 0, top: 0, width: 0, height: 0 };
    var imgW = opts.naturalW || 0;
    var imgH = opts.naturalH || 0;
    if (!imgW || !imgH){
      _app.renderer.render(_stage);
      return;
    }

    // Pin visual dimensions — FIXED CSS px, modulated by caller-supplied pinScale
    var pw = Math.round(_pinSize * pinScale);
    var ph = Math.round(_pinSize * 42 / 32 * pinScale);

    for (var i = 0; i < _pins.length; i++){
      var pin = _pins[i];
      if (pin.pinX == null || pin.pinY == null) continue;
      // S81 Bug #1 guard: skip pins with non-finite (NaN/Infinity) coords —
      // those project to (0,0) and render as a black shadow ghost at top-left.
      if (!isFinite(pin.pinX) || !isFinite(pin.pinY)) continue;

      var sx = imgRect.left + pin.pinX * imgRect.width;
      var sy = imgRect.top  + pin.pinY * imgRect.height;

      var state = (pin.deficId === activeId) ? 'active' : (pin.deficId === hoveredId) ? 'hover' : 'normal';
      var node = _buildPin(PIXI, pin, state);
      var nativeScale = pw / 32;
      node.scale.set(node.scale.x * nativeScale, node.scale.y * nativeScale);
      node.position.set(sx - 16 * nativeScale, sy - 40 * nativeScale);
      node.alpha = pin.isClosed ? 0.5 : 1;

      _stage.addChild(node);

      _pinScreenPos[pin.deficId] = {
        x: sx - pw / 2,
        y: sy - ph,
        w: pw, h: ph,
        sx: sx, sy: sy,
        pin: pin
      };
    }

    _app.renderer.render(_stage);
  }

  // ─── Hit test: given clientX/clientY (page coords), return deficId or null ──
  // Searches in reverse order so top-most pins win.
  function hitTest(clientX, clientY){
    if (!_canvas) return null;
    var cr = _canvas.getBoundingClientRect();
    var lx = clientX - cr.left;
    var ly = clientY - cr.top;
    var ids = Object.keys(_pinScreenPos);
    for (var i = ids.length - 1; i >= 0; i--){
      var p = _pinScreenPos[ids[i]];
      if (lx >= p.x && lx <= p.x + p.w && ly >= p.y && ly <= p.y + p.h){
        return ids[i];
      }
    }
    return null;
  }

  // Hit test all: returns ARRAY of deficIds at this position (for tooltip with overlapping pins).
  function hitTestAll(clientX, clientY){
    var out = [];
    if (!_canvas) return out;
    var cr = _canvas.getBoundingClientRect();
    var lx = clientX - cr.left;
    var ly = clientY - cr.top;
    var ids = Object.keys(_pinScreenPos);
    for (var i = ids.length - 1; i >= 0; i--){
      var p = _pinScreenPos[ids[i]];
      if (lx >= p.x && lx <= p.x + p.w && ly >= p.y && ly <= p.y + p.h){
        out.push(ids[i]);
      }
    }
    return out;
  }

  function getPinScreenRect(deficId){
    return _pinScreenPos[deficId] || null;
  }

  function destroy(){
    _pinScreenPos = {};
    _pins = [];
    if (_app){
      try { _app.destroy(true, { children: true, texture: true, baseTexture: true }); } catch(_){}
    }
    if (_canvas && _canvas.parentNode){
      try { _canvas.parentNode.removeChild(_canvas); } catch(_){}
    }
    _app = null; _stage = null; _canvas = null; _host = null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────
  window.PinsGL = {
    isSupported:      isSupported,
    init:             init,
    resize:           resize,
    render:           render,
    hitTest:          hitTest,
    hitTestAll:       hitTestAll,
    getPinScreenRect: getPinScreenRect,
    destroy:          destroy,
    version:          '1.2'
  };
})();
