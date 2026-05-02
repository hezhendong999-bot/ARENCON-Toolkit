// FRT v2 — WebGL Markup Renderer (Phase 5 integration)
// ════════════════════════════════════════════════════════════════════════════
// Pure stateless Pixi.js v7 renderer consumed by frt/js/viewer/markup.js.
// markup.js owns all state (objects, undo/redo, hit testing, input, toolbar).
// This module only paints a given object array onto a pre-sized WebGL canvas
// that sits as a sibling underneath markup.js's Canvas 2D overlay.
//
// Contract (called by markup.js):
//   window.WebGLMarkupRenderer = {
//     isSupported(): boolean,
//     init(canvas, {w,h,dpr}): Promise<true>,
//     resize(w, h),
//     hasEraser(objects): boolean,
//     render(objects, {dpr, hlAlpha}),
//     destroy()
//   };
//
// Rules honored:
//   - DPR-aware via Pixi resolution (coords in logical CSS px on the stage)
//   - lineTo only for pen/highlight/polyline (no quadraticCurveTo)
//   - Cloud uses quadraticCurveTo (shape, not stroke — explicitly permitted)
//   - No OffscreenCanvas (iOS Safari compatibility)
//   - No opacity stacking (highlight via per-opacity-group RenderTexture composite)
//   - Eraser supported via BLEND_MODES.ERASE (destination-out on framebuffer) — v5.2
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
      s.onerror = function(){ _pixiLoading = null; reject(new Error('Pixi.js failed to load from cdnjs')); };
      document.head.appendChild(s);
    });
    return _pixiLoading;
  }

  function hexToInt(hex){
    if (hex == null) return 0xC0392B;
    if (typeof hex !== 'string') return hex | 0;
    if (hex.charAt(0) === '#') hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
    var n = parseInt(hex, 16);
    return isNaN(n) ? 0xC0392B : n;
  }

  // ─── Module state ───────────────────────────────────────────────────────
  var _app = null;
  var _stage = null;
  var _dpr = 1;
  var _canvasW = 0;   // device px
  var _canvasH = 0;   // device px
  var _supported = null;

  function isSupported(){
    if (_supported !== null) return _supported;
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      _supported = !!gl;
    } catch(_){ _supported = false; }
    return _supported;
  }

  // Retained for backward compat with markup.js S80 integration.
  // As of 5.2, WebGL handles eraser via BLEND_MODES.ERASE — this always returns false.
  function hasEraser(objects){
    void objects; // intentionally ignored
    return false;
  }

  function init(canvas, opts){
    opts = opts || {};
    return loadPixi().then(function(PIXI){
      _dpr = opts.dpr || 1;
      _canvasW = opts.w || canvas.width;
      _canvasH = opts.h || canvas.height;
      var logicalW = Math.max(1, _canvasW / _dpr);
      var logicalH = Math.max(1, _canvasH / _dpr);

      if (_app){ try { _app.destroy(false); } catch(_){} _app = null; _stage = null; }

      // S111: Detect WebGL MAX_TEXTURE_SIZE BEFORE creating the Pixi app.
      // If the canvas pixel dimensions exceed MAX, we have to lower _dpr
      // (the pixel-density resolution) so internal textures fit within
      // the GL limit. Otherwise libgl silently clips render targets and
      // freehand pen strokes get cut at the right/bottom of the drawing
      // (visible only when zoomed out far enough to see the clipped area
      //  — typically at L2 fit zoom on large drawings). This was the
      // markup clipping bug deferred from S110.
      try {
        var probeC = document.createElement('canvas');
        var probeGl = probeC.getContext('webgl2') || probeC.getContext('webgl') || probeC.getContext('experimental-webgl');
        if (probeGl){
          var maxTex = probeGl.getParameter(probeGl.MAX_TEXTURE_SIZE) || 4096;
          var biggest = Math.max(_canvasW, _canvasH);
          console.log('[WebGLMarkup] MAX_TEXTURE_SIZE=' + maxTex + ', canvas device-px=' + _canvasW + 'x' + _canvasH + ' (logical ' + logicalW + 'x' + logicalH + ', dpr=' + _dpr + ')');
          if (biggest > maxTex){
            // Need to clamp. Reduce _dpr so canvas device-px ≤ maxTex.
            var oldDpr = _dpr;
            _dpr = _dpr * (maxTex / biggest) * 0.95; // 5% headroom
            _canvasW = Math.floor(logicalW * _dpr);
            _canvasH = Math.floor(logicalH * _dpr);
            console.warn('[WebGLMarkup] canvas exceeded MAX_TEXTURE_SIZE — reducing dpr ' + oldDpr.toFixed(3) + ' -> ' + _dpr.toFixed(3) + ' (canvas device-px now ' + _canvasW + 'x' + _canvasH + ')');
          }
        }
      } catch(probeErr){
        console.warn('[WebGLMarkup] MAX_TEXTURE_SIZE probe failed:', probeErr);
      }

      _app = new PIXI.Application({
        view: canvas,
        width: logicalW,
        height: logicalH,
        resolution: _dpr,
        autoDensity: false,        // markup.js controls canvas sizing directly
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,          // render only when markup.js calls render()
        powerPreference: 'high-performance'
      });
      _stage = _app.stage;
      return true;
    });
  }

  function resize(w, h, dpr){
    if (!_app) return;
    _canvasW = w; _canvasH = h;
    // S113 Push 14: caller may pass a NEW _dpr (Markup.setRenderScale does
    // this on viewer-zoom changes). Without it we'd compute logical coord
    // space using the STALE _dpr from init() — which made objects appear
    // at the wrong on-canvas position after the very first resize. The
    // logical (drawing-coordinate) dimensions must stay constant across
    // resizes; only canvas device pixels and resolution change.
    if (typeof dpr === 'number' && dpr > 0) {
      _dpr = dpr;
      try { if (_app.renderer && _app.renderer.resolution !== undefined) _app.renderer.resolution = dpr; } catch(_){}
    }
    var logicalW = Math.max(1, w / _dpr);
    var logicalH = Math.max(1, h / _dpr);
    try { _app.renderer.resize(logicalW, logicalH); } catch(_){}
  }

  function destroy(){
    if (_app){
      try { _app.destroy(false, { children: true, texture: true, baseTexture: true }); } catch(_){}
      _app = null; _stage = null;
    }
    _canvasW = 0; _canvasH = 0;
  }

  // ─── Stage wipe (with RenderTexture cleanup) ────────────────────────────
  function _wipeStage(){
    if (!_stage) return;
    while (_stage.children.length){
      var ch = _stage.children[0];
      _stage.removeChild(ch);
      if (ch._rtToDestroy){
        try { ch._rtToDestroy.destroy(true); } catch(_){}
      }
      try { if (ch.destroy) ch.destroy({ children: true, texture: false, baseTexture: false }); } catch(_){}
    }
  }

  // ─── Main render ────────────────────────────────────────────────────────
  function render(objects, opts){
    if (!_app || !_stage) return;
    var PIXI = window.PIXI;
    if (!PIXI) return;
    opts = opts || {};
    var hlAlpha = opts.hlAlpha != null ? opts.hlAlpha : 0.3;

    _wipeStage();

    if (!objects || !objects.length){
      _app.renderer.render(_stage);
      return;
    }

    // Non-highlight objects (pen, shapes, text, polyline, eraser) must go through
    // a RenderTexture for BLEND_MODES.ERASE to work correctly — Pixi's main
    // framebuffer with premultiplied alpha doesn't honor ERASE reliably, but
    // RenderTextures do (this is the same pattern used for highlights below).
    // Iterate in insertion order so eraser strokes cut through earlier pixels only.
    var nonHighlights = [];
    var highlights = [];
    for (var i = 0; i < objects.length; i++){
      var o = objects[i];
      if (!o || !o.type) continue;
      if (o.type === 'highlight'){ highlights.push(o); continue; }
      nonHighlights.push(o);
    }

    if (nonHighlights.length){
      _drawNonHighlights(PIXI, nonHighlights);
    }

    if (highlights.length){
      _drawHighlights(PIXI, highlights, hlAlpha);
    }

    _app.renderer.render(_stage);
  }

  // ─── Per-object builders ────────────────────────────────────────────────

  function _buildObject(PIXI, obj){
    var t = obj.type;
    if (t === 'pen' || t === 'polyline') return _buildStroke(PIXI, obj);
    if (t === 'text')                    return _buildText(PIXI, obj);
    return _buildShape(PIXI, obj);
  }

  function _buildStroke(PIXI, obj){
    if (!obj.points || obj.points.length < 2) return null;
    var g = new PIXI.Graphics();
    g.lineStyle({
      width: obj.size || 2,
      color: hexToInt(obj.color || '#C0392B'),
      alpha: obj.opacity != null ? obj.opacity : 1,
      cap: 'round',
      join: 'round'
    });
    g.moveTo(obj.points[0].x, obj.points[0].y);
    for (var i = 1; i < obj.points.length; i++){
      g.lineTo(obj.points[i].x, obj.points[i].y);   // lineTo only — hard rule
    }
    return g;
  }

  // Eraser: same freehand stroke shape, but rendered with BLEND_MODES.ERASE
  // which maps to destination-out (src*0 + dst*(1-srcAlpha)) — cuts pixels
  // from whatever was drawn earlier in the child list on the main framebuffer.
  // Width multiplier (×3) matches Canvas 2D: ctx.lineWidth = (obj.size||2)*3
  function _buildEraser(PIXI, obj){
    if (!obj.points || obj.points.length < 2) return null;
    var g = new PIXI.Graphics();
    g.lineStyle({
      width: (obj.size || 2) * 3,
      color: 0xFFFFFF,         // color irrelevant under ERASE blend (only src alpha matters)
      alpha: 1,
      cap: 'round',
      join: 'round'
    });
    g.moveTo(obj.points[0].x, obj.points[0].y);
    for (var i = 1; i < obj.points.length; i++){
      g.lineTo(obj.points[i].x, obj.points[i].y);
    }
    // Pixi v7: ERASE blend mode produces destination-out on the framebuffer
    if (PIXI.BLEND_MODES && PIXI.BLEND_MODES.ERASE != null){
      g.blendMode = PIXI.BLEND_MODES.ERASE;
    }
    return g;
  }

  function _buildShape(PIXI, obj){
    var t = obj.type;
    var x1 = obj.x1, y1 = obj.y1, x2 = obj.x2, y2 = obj.y2;
    if (x1 == null || y1 == null || x2 == null || y2 == null) return null;

    var g = new PIXI.Graphics();
    var col = hexToInt(obj.color || '#C0392B');
    var alpha = obj.opacity != null ? obj.opacity : 1;
    var size = obj.size || 2;
    var line = { width: size, color: col, alpha: alpha, cap: 'round', join: 'round' };

    if (t === 'rect'){
      g.lineStyle(line);
      g.drawRect(x1, y1, x2 - x1, y2 - y1);
    }
    else if (t === 'fillrect'){
      g.beginFill(col, alpha);
      g.drawRect(x1, y1, x2 - x1, y2 - y1);
      g.endFill();
    }
    else if (t === 'circle'){
      var rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      g.lineStyle(line);
      g.drawEllipse(x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2, rx, ry);
    }
    else if (t === 'fillcircle'){
      var rxf = Math.abs(x2 - x1) / 2, ryf = Math.abs(y2 - y1) / 2;
      g.beginFill(col, alpha);
      g.drawEllipse(x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2, rxf, ryf);
      g.endFill();
    }
    else if (t === 'line'){
      g.lineStyle(line);
      g.moveTo(x1, y1); g.lineTo(x2, y2);
    }
    else if (t === 'arrow'){
      g.lineStyle(line);
      g.moveTo(x1, y1); g.lineTo(x2, y2);
      var a = Math.atan2(y2 - y1, x2 - x1), hl = 15 + size * 2;
      g.moveTo(x2, y2);
      g.lineTo(x2 - hl * Math.cos(a - Math.PI / 6), y2 - hl * Math.sin(a - Math.PI / 6));
      g.moveTo(x2, y2);
      g.lineTo(x2 - hl * Math.cos(a + Math.PI / 6), y2 - hl * Math.sin(a + Math.PI / 6));
    }
    else if (t === 'triangle'){
      g.lineStyle(line);
      g.moveTo(x1 + (x2 - x1) / 2, y1);
      g.lineTo(x2, y2);
      g.lineTo(x1, y2);
      g.closePath();
    }
    else if (t === 'filltriangle'){
      g.beginFill(col, alpha);
      g.moveTo(x1 + (x2 - x1) / 2, y1);
      g.lineTo(x2, y2);
      g.lineTo(x1, y2);
      g.closePath();
      g.endFill();
    }
    else if (t === 'cloud'){
      _buildCloud(g, line, x1, y1, x2, y2);
    }
    else {
      g.destroy();
      return null;
    }

    if (obj.rotation){
      _applyRotation(g, (x1 + x2) / 2, (y1 + y2) / 2, obj.rotation);
    }
    return g;
  }

  function _buildCloud(g, line, x1, y1, x2, y2){
    var w = x2 - x1, h = y2 - y1;
    var cx = x1 + w / 2, cy = y1 + h / 2;
    var rx = Math.abs(w) / 2, ry = Math.abs(h) / 2;
    if (rx < 5 || ry < 5) return;
    g.lineStyle(line);
    var bumps = Math.max(8, Math.floor((rx + ry) / 10));
    for (var i = 0; i < bumps; i++){
      var a  = i * 2 * Math.PI / bumps;
      var na = (i + 1) * 2 * Math.PI / bumps;
      var ma = (a + na) / 2;
      var px1 = cx + rx * Math.cos(a),  py1 = cy + ry * Math.sin(a);
      var px2 = cx + rx * Math.cos(na), py2 = cy + ry * Math.sin(na);
      var cpx = cx + (rx + 12) * Math.cos(ma), cpy = cy + (ry + 12) * Math.sin(ma);
      if (i === 0) g.moveTo(px1, py1);
      g.quadraticCurveTo(cpx, cpy, px2, py2);
    }
  }

  function _buildText(PIXI, obj){
    if (obj.text == null || obj.text === '') return null;
    var fs = obj.fontSize || 20;
    var style = new PIXI.TextStyle({
      fontFamily: 'Calibri, sans-serif',
      fontSize: fs,
      fontWeight: obj.bold ? '700' : '400',
      fill: obj.color || '#C0392B',
      padding: 2
    });
    var t = new PIXI.Text(obj.text, style);
    t.resolution = Math.max(1, _dpr);      // sharp text at device pixel density
    t.alpha = obj.opacity != null ? obj.opacity : 1;
    // Canvas 2D uses fillText with alphabetic baseline at y1.
    // Pixi Text anchors top-left; approx baseline ≈ top + fontSize * 0.8.
    t.x = obj.x1;
    t.y = obj.y1 - fs * 0.8;
    if (obj.rotation){
      // markup.js _drawObject rotates text around (x1, y1 - fontSize/2)
      var rcx = obj.x1, rcy = obj.y1 - fs / 2;
      _applyRotation(t, rcx, rcy, obj.rotation);
    }
    return t;
  }

  // Rotate a DisplayObject around world-space point (cx, cy)
  function _applyRotation(d, cx, cy, rad){
    d.position.set(cx, cy);
    d.pivot.set(cx, cy);
    d.rotation = rad;
  }

  // Build a Graphics containing only this object's eraser-mask paths, at ERASE blend.
  // Caller places it AFTER the object's own Graphics so destination-out cuts only
  // the preceding object's pixels (on the per-object RenderTexture, not main stage).
  function _buildMaskGraphics(PIXI, obj){
    if (!obj.eraserMask || !obj.eraserMask.length) return null;
    var g = new PIXI.Graphics();
    for (var i = 0; i < obj.eraserMask.length; i++){
      var m = obj.eraserMask[i];
      if (!m.points || m.points.length < 2) continue;
      g.lineStyle({
        width: (m.size || 2) * 3,
        color: 0xFFFFFF,
        alpha: 1,
        cap: 'round',
        join: 'round'
      });
      g.moveTo(m.points[0].x, m.points[0].y);
      for (var j = 1; j < m.points.length; j++){
        g.lineTo(m.points[j].x, m.points[j].y);
      }
    }
    if (PIXI.BLEND_MODES && PIXI.BLEND_MODES.ERASE != null){
      g.blendMode = PIXI.BLEND_MODES.ERASE;
    }
    return g;
  }

  // Render one object (+ its mask if any) into its own RenderTexture so the mask
  // only cuts that object's pixels. Returns a Sprite wrapping the RenderTexture,
  // with _rtToDestroy set for cleanup. Returns null for empty / unrenderable objects.
  function _rasterizeMaskedObject(PIXI, obj){
    var node = (obj.type === 'eraser') ? _buildEraser(PIXI, obj) : _buildObject(PIXI, obj);
    if (!node) return null;
    // No mask → skip isolation; return node directly (cheaper path)
    if (!obj.eraserMask || !obj.eraserMask.length) return node;

    var logicalW = Math.max(1, _canvasW / _dpr);
    var logicalH = Math.max(1, _canvasH / _dpr);
    var c = new PIXI.Container();
    c.addChild(node);
    var mask = _buildMaskGraphics(PIXI, obj);
    if (mask) c.addChild(mask);
    var rt = PIXI.RenderTexture.create({ width: logicalW, height: logicalH, resolution: _dpr });
    _app.renderer.render(c, { renderTexture: rt, clear: true });
    try { c.destroy({ children: true }); } catch(_){}
    var spr = new PIXI.Sprite(rt);
    spr._rtToDestroy = rt;
    return spr;
  }

  // ─── Non-highlight compositing (via RenderTexture so ERASE blend works) ─
  function _drawNonHighlights(PIXI, objects){
    var logicalW = Math.max(1, _canvasW / _dpr);
    var logicalH = Math.max(1, _canvasH / _dpr);

    // S111: Fast path — when NO object has an eraser mask, we don't need
    // the outer RenderTexture at all. The original code unconditionally
    // baked all non-highlights into one giant RT (logicalW × logicalH at
    // resolution _dpr). For an L4-master drawing 12288×8192 at dpr=0.5,
    // that's a 6144×4096 GL texture — within most desktop limits but at
    // or above WebGL MAX_TEXTURE_SIZE on smaller devices (commonly 4096).
    // When the texture exceeds MAX, libgl silently clips, which appears
    // to the user as freehand pen strokes being CUT at the bottom/right
    // of the drawing — visible only when zoomed out far enough to see
    // the clipped region (i.e., L2 fit zoom). This is the markup-clipping
    // bug Mark reported as deferred from S110.
    //
    // Bypassing the RT for the no-mask case both (a) avoids the texture
    // size limit entirely and (b) saves a full-RT clear+render+sprite
    // every frame. The masked-object path (per-object isolated RTs sized
    // logicalW × logicalH) still uses RTs because BLEND_MODES.ERASE
    // requires destination-out, which only works on RTs.
    var hasAnyMask = false;
    for (var hi = 0; hi < objects.length; hi++){
      if (objects[hi] && objects[hi].eraserMask && objects[hi].eraserMask.length){
        hasAnyMask = true; break;
      }
    }

    if (!hasAnyMask){
      // Fast path: build Graphics for each object and add directly to stage.
      // No outer RenderTexture, no texture-size limit hit.
      for (var fi = 0; fi < objects.length; fi++){
        var fo = objects[fi];
        var fnode = (fo.type === 'eraser') ? _buildEraser(PIXI, fo) : _buildObject(PIXI, fo);
        if (fnode) _stage.addChild(fnode);
      }
      return;
    }

    // Slow path — at least one mask present. Need RT for ERASE compositing.
    var container = new PIXI.Container();
    var spritesToTrack = [];
    for (var i = 0; i < objects.length; i++){
      var o = objects[i];
      var d = _rasterizeMaskedObject(PIXI, o);
      if (d){
        container.addChild(d);
        if (d._rtToDestroy) spritesToTrack.push(d);
      }
    }

    var rt = PIXI.RenderTexture.create({
      width: logicalW,
      height: logicalH,
      resolution: _dpr
    });
    _app.renderer.render(container, { renderTexture: rt, clear: true });
    // Destroy per-object RTs that were consumed in this composite
    for (var s = 0; s < spritesToTrack.length; s++){
      try { spritesToTrack[s]._rtToDestroy.destroy(true); } catch(_){}
    }
    try { container.destroy({ children: true }); } catch(_){}

    var spr = new PIXI.Sprite(rt);
    spr._rtToDestroy = rt;    // cleanup on next _wipeStage()
    _stage.addChild(spr);
  }

  // ─── Highlight compositing (non-stacking, per opacity group) ────────────
  function _drawHighlights(PIXI, highlights, hlAlpha){
    // Group by rounded opacity key — same as markup.js Canvas 2D path
    var opGroups = {};
    for (var i = 0; i < highlights.length; i++){
      var o = highlights[i];
      var op = o.opacity != null ? o.opacity : 1;
      var key = String(Math.round(op * 100));
      if (!opGroups[key]) opGroups[key] = { opacity: op, objs: [] };
      opGroups[key].objs.push(o);
    }

    var logicalW = Math.max(1, _canvasW / _dpr);
    var logicalH = Math.max(1, _canvasH / _dpr);
    var keys = Object.keys(opGroups);

    for (var k = 0; k < keys.length; k++){
      var grp = opGroups[keys[k]];

      // Container of per-highlight sprites (each highlight is isolated so its
      // eraser mask cuts only that highlight's pixels, not other highlights in the same group)
      var container = new PIXI.Container();
      var perHLRTs = [];
      for (var j = 0; j < grp.objs.length; j++){
        var obj = grp.objs[j];
        if (!obj.points || obj.points.length < 2) continue;
        var g = new PIXI.Graphics();
        g.lineStyle({
          width: (obj.size || 2) * 4,
          color: hexToInt(obj.color || '#F1C40F'),
          alpha: 1,
          cap: 'round',
          join: 'round'
        });
        g.moveTo(obj.points[0].x, obj.points[0].y);
        for (var p = 1; p < obj.points.length; p++){
          g.lineTo(obj.points[p].x, obj.points[p].y);  // lineTo only
        }

        if (obj.eraserMask && obj.eraserMask.length){
          // Per-highlight RT with mask applied via ERASE blend
          var subC = new PIXI.Container();
          subC.addChild(g);
          var maskG = _buildMaskGraphics(PIXI, obj);
          if (maskG) subC.addChild(maskG);
          var subRT = PIXI.RenderTexture.create({ width: logicalW, height: logicalH, resolution: _dpr });
          _app.renderer.render(subC, { renderTexture: subRT, clear: true });
          try { subC.destroy({ children: true }); } catch(_){}
          var subSpr = new PIXI.Sprite(subRT);
          container.addChild(subSpr);
          perHLRTs.push(subRT);
        } else {
          container.addChild(g);
        }
      }

      // Render the accumulated highlights (sprites + plain Graphics) to the group RenderTexture at full alpha
      var rt = PIXI.RenderTexture.create({
        width: logicalW,
        height: logicalH,
        resolution: _dpr
      });
      _app.renderer.render(container, { renderTexture: rt, clear: true });
      try { container.destroy({ children: true }); } catch(_){}
      // Destroy per-highlight RTs now that they've been baked into the group RT
      for (var r = 0; r < perHLRTs.length; r++){
        try { perHLRTs[r].destroy(true); } catch(_){}
      }

      // Composite as a Sprite at (hlAlpha × groupOpacity) — matches Canvas 2D
      var spr = new PIXI.Sprite(rt);
      spr.alpha = hlAlpha * grp.opacity;
      spr._rtToDestroy = rt;    // cleanup on next _wipeStage()
      _stage.addChild(spr);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────
  window.WebGLMarkupRenderer = {
    isSupported: isSupported,
    init:        init,
    resize:      resize,
    hasEraser:   hasEraser,
    render:      render,
    destroy:     destroy,
    version:     '5.4'
  };
})();
