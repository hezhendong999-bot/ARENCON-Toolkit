// FRT v2 — WebGL Markup Renderer (Phase 5: GPU render backend for markup.js)
// Called FROM markup.js to render committed markup objects. Not a standalone
// engine — markup.js retains all tool logic, events, undo/redo, persistence.
//
// Exposes: window.WebGLMarkupRenderer = { init, resize, render, destroy, isSupported, hasEraser }
//
// Rules honored:
//   - DPR-aware logical coordinates (matches markup.js _dpr convention)
//   - lineTo only for pen/highlight (quadraticCurveTo allowed for cloud, matching 2D)
//   - No OffscreenCanvas (iOS Safari)
//   - Highlight: offscreen composite via RenderTexture (no opacity stacking)
//   - Eraser: not supported in WebGL path — caller falls back to 2D if any present
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
      s.onload = function(){ resolve(window.PIXI); };
      s.onerror = function(){ _pixiLoading = null; reject(new Error('Pixi.js failed to load from cdnjs')); };
      document.head.appendChild(s);
    });
    return _pixiLoading;
  }

  function hexToInt(hex){
    if (typeof hex !== 'string') return 0xC0392B;
    if (hex.charAt(0) === '#') hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
    var n = parseInt(hex, 16);
    return isNaN(n) ? 0xC0392B : n;
  }

  function isSupported(){
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      return !!gl;
    } catch(_){ return false; }
  }

  var WebGLMarkupRenderer = {
    canvas: null,
    app: null,
    stage: null,
    _ready: false,
    _lastW: 0, _lastH: 0,

    version: '5.2',
    isSupported: isSupported,

    // init(canvas, {w, h, dpr}) → Promise<void>
    init: function(canvas, opts){
      var self = this;
      this.canvas = canvas;
      var w = Math.max(1, (opts && opts.w) || 1);
      var h = Math.max(1, (opts && opts.h) || 1);
      this._lastW = w; this._lastH = h;

      return loadPixi().then(function(PIXI){
        self.app = new PIXI.Application({
          view: canvas,
          width: w, height: h,
          backgroundAlpha: 0,
          antialias: true,
          resolution: 1,       // markup.js already bakes DPR into canvas.width
          autoDensity: false,
          powerPreference: 'high-performance'
        });
        self.stage = self.app.stage;
        self._ready = true;
        return true;
      });
    },

    resize: function(w, h){
      if (!this.app || !this.app.renderer) return;
      w = Math.max(1, w|0); h = Math.max(1, h|0);
      if (w === this._lastW && h === this._lastH) return;
      this._lastW = w; this._lastH = h;
      try { this.app.renderer.resize(w, h); } catch(_){}
    },

    // Rebuild stage from objects array. Called by markup.js _renderAll when in WebGL mode.
    // opts: { dpr: number, hlAlpha: number (default 0.3) }
    render: function(objects, opts){
      if (!this._ready || !this.stage) return;
      var PIXI = window.PIXI;
      var dpr = (opts && opts.dpr) || 1;
      var hlAlpha = (opts && opts.hlAlpha != null) ? opts.hlAlpha : 0.3;

      this.stage.removeChildren();

      // Root: scale by DPR so logical coords render into physical pixel buffer
      // (mirrors ctx.setTransform(dpr,0,0,dpr,0,0) in the 2D path)
      var root = new PIXI.Container();
      root.scale.set(dpr, dpr);
      this.stage.addChild(root);

      var highlights = [];
      var others = [];
      for (var i = 0; i < objects.length; i++){
        var o = objects[i];
        if (o.type === 'highlight') highlights.push(o);
        else others.push(o);
      }

      // Non-highlight: direct add (pen, shapes, text, polyline)
      for (var j = 0; j < others.length; j++){
        var node = this._makeObjectNode(others[j]);
        if (node) root.addChild(node);
      }

      // Highlight: offscreen composite per opacity group (no alpha stacking)
      if (highlights.length){
        var opGroups = {};
        for (var h = 0; h < highlights.length; h++){
          var hobj = highlights[h];
          var op = hobj.opacity != null ? hobj.opacity : 1;
          var key = Math.round(op * 100);
          if (!opGroups[key]) opGroups[key] = { opacity: op, objs: [] };
          opGroups[key].objs.push(hobj);
        }
        var keys = Object.keys(opGroups);
        for (var gi = 0; gi < keys.length; gi++){
          var grp = opGroups[keys[gi]];
          var container = new PIXI.Container();
          container.scale.set(dpr, dpr);
          for (var gj = 0; gj < grp.objs.length; gj++){
            var hg = new PIXI.Graphics();
            this._drawHighlight(hg, grp.objs[gj]);
            container.addChild(hg);
          }
          var tex = PIXI.RenderTexture.create({
            width: this._lastW, height: this._lastH, resolution: 1
          });
          this.app.renderer.render(container, { renderTexture: tex, clear: true });
          var sprite = new PIXI.Sprite(tex);
          sprite.alpha = hlAlpha * grp.opacity;
          this.stage.addChild(sprite);  // already at physical res — added to stage, not root
          container.destroy({ children: true });
        }
      }
    },

    _drawHighlight: function(g, obj){
      if (!obj.points || obj.points.length < 2) return;
      g.lineStyle({
        width: (obj.size || 2) * 4,
        color: hexToInt(obj.color || '#F1C40F'),
        alpha: 1, cap: 'round', join: 'round'
      });
      g.moveTo(obj.points[0].x, obj.points[0].y);
      for (var i = 1; i < obj.points.length; i++){
        g.lineTo(obj.points[i].x, obj.points[i].y);
      }
    },

    _makeObjectNode: function(obj){
      var PIXI = window.PIXI;
      var t = obj.type;
      var color = hexToInt(obj.color || '#C0392B');
      var size = obj.size || 2;
      var alpha = obj.opacity != null ? obj.opacity : 1;

      // Pen / polyline — freehand strokes
      if (t === 'pen' || t === 'polyline'){
        if (!obj.points || obj.points.length < 2) return null;
        var pg = new PIXI.Graphics();
        pg.alpha = alpha;
        pg.lineStyle({ width: size, color: color, alpha: 1, cap: 'round', join: 'round' });
        pg.moveTo(obj.points[0].x, obj.points[0].y);
        for (var i = 1; i < obj.points.length; i++){
          pg.lineTo(obj.points[i].x, obj.points[i].y);
        }
        return pg;
      }

      // Eraser — unsupported in WebGL path
      if (t === 'eraser') return null;

      // Text
      if (t === 'text'){
        var fs = obj.fontSize || 20;
        var style = new PIXI.TextStyle({
          fontFamily: 'Calibri, sans-serif',
          fontSize: fs,
          fontWeight: obj.bold ? '700' : '400',
          fill: color
        });
        var tx = new PIXI.Text(obj.text || '', style);
        tx.alpha = alpha;
        // 2D draws with baseline at y1 (so text extends UP). Pixi anchors top-left.
        tx.x = obj.x1;
        tx.y = (obj.y1 || 0) - fs;
        if (obj.rotation){
          tx.pivot.set(0, fs / 2);
          tx.position.set(obj.x1, (obj.y1 || 0) - fs / 2);
          tx.rotation = obj.rotation;
        }
        return tx;
      }

      // Shapes
      var x1 = obj.x1, y1 = obj.y1, x2 = obj.x2, y2 = obj.y2;
      if (x1 == null || y1 == null || x2 == null || y2 == null) return null;

      var sg = new PIXI.Graphics();
      sg.alpha = alpha;

      if (t === 'rect'){
        sg.lineStyle({ width: size, color: color, alpha: 1, cap: 'round', join: 'round' });
        sg.drawRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
      }
      else if (t === 'fillrect'){
        sg.beginFill(color, 1);
        sg.drawRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
        sg.endFill();
      }
      else if (t === 'circle'){
        var rx = Math.abs(x2-x1)/2, ry = Math.abs(y2-y1)/2;
        sg.lineStyle({ width: size, color: color, alpha: 1, cap: 'round', join: 'round' });
        sg.drawEllipse((x1+x2)/2, (y1+y2)/2, rx, ry);
      }
      else if (t === 'fillcircle'){
        var rx2 = Math.abs(x2-x1)/2, ry2 = Math.abs(y2-y1)/2;
        sg.beginFill(color, 1);
        sg.drawEllipse((x1+x2)/2, (y1+y2)/2, rx2, ry2);
        sg.endFill();
      }
      else if (t === 'line'){
        sg.lineStyle({ width: size, color: color, alpha: 1, cap: 'round', join: 'round' });
        sg.moveTo(x1, y1); sg.lineTo(x2, y2);
      }
      else if (t === 'arrow'){
        sg.lineStyle({ width: size, color: color, alpha: 1, cap: 'round', join: 'round' });
        sg.moveTo(x1, y1); sg.lineTo(x2, y2);
        var a = Math.atan2(y2 - y1, x2 - x1), hl = 15 + size * 2;
        sg.moveTo(x2, y2);
        sg.lineTo(x2 - hl * Math.cos(a - Math.PI/6), y2 - hl * Math.sin(a - Math.PI/6));
        sg.moveTo(x2, y2);
        sg.lineTo(x2 - hl * Math.cos(a + Math.PI/6), y2 - hl * Math.sin(a + Math.PI/6));
      }
      else if (t === 'triangle'){
        sg.lineStyle({ width: size, color: color, alpha: 1, cap: 'round', join: 'round' });
        var mx = x1 + (x2-x1)/2;
        sg.moveTo(mx, y1); sg.lineTo(x2, y2); sg.lineTo(x1, y2); sg.lineTo(mx, y1);
      }
      else if (t === 'filltriangle'){
        sg.beginFill(color, 1);
        var mx2 = x1 + (x2-x1)/2;
        sg.moveTo(mx2, y1); sg.lineTo(x2, y2); sg.lineTo(x1, y2); sg.lineTo(mx2, y1);
        sg.endFill();
      }
      else if (t === 'cloud'){
        this._drawCloud(sg, x1, y1, x2, y2, size, color);
      }
      else {
        return null;
      }

      // Rotation around shape center — matches 2D translate/rotate/translate
      if (obj.rotation){
        var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        sg.pivot.set(cx, cy);
        sg.position.set(cx, cy);
        sg.rotation = obj.rotation;
      }

      return sg;
    },

    _drawCloud: function(g, x1, y1, x2, y2, size, color){
      var w = x2 - x1, h = y2 - y1;
      var cx = x1 + w/2, cy = y1 + h/2;
      var rx = Math.abs(w)/2, ry = Math.abs(h)/2;
      if (rx < 5 || ry < 5) return;
      g.lineStyle({ width: size, color: color, alpha: 1, cap: 'round', join: 'round' });
      var bumps = Math.max(8, Math.floor((rx + ry) / 10));
      for (var i = 0; i < bumps; i++){
        var a1 = i * 2 * Math.PI / bumps;
        var a2 = (i + 1) * 2 * Math.PI / bumps;
        var ma = (a1 + a2) / 2;
        var px1 = cx + rx * Math.cos(a1), py1 = cy + ry * Math.sin(a1);
        var px2 = cx + rx * Math.cos(a2), py2 = cy + ry * Math.sin(a2);
        var cpx = cx + (rx + 12) * Math.cos(ma), cpy = cy + (ry + 12) * Math.sin(ma);
        if (i === 0) g.moveTo(px1, py1);
        g.quadraticCurveTo(cpx, cpy, px2, py2);
      }
    },

    // True if any eraser strokes present — caller falls back to 2D render
    hasEraser: function(objects){
      if (!objects) return false;
      for (var i = 0; i < objects.length; i++){
        if (objects[i].type === 'eraser') return true;
      }
      return false;
    },

    destroy: function(){
      if (this.app){
        try { this.app.destroy(false, { children: true, texture: true, baseTexture: true }); } catch(_){}
      }
      this.app = null;
      this.stage = null;
      this.canvas = null;
      this._ready = false;
    }
  };

  window.WebGLMarkupRenderer = WebGLMarkupRenderer;
})();
