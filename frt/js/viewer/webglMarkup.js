// FRT v2 — WebGL Markup Engine (Phase 5a scaffold)
// Pixi.js v7 UMD under the hood. Same stroke format as MarkupEngine so data is
// backward-compatible. 5a ships Pen tool only; other tools are stubbed.
//
// Public API mirrors window.MarkupEngine exactly so it can be swapped in later
// behind a feature flag without touching markupEngine.js or viewer.js.
//
// Rules honored:
//   - DPR-aware logical (CSS px) coordinates
//   - lineTo only (no quadraticCurveTo)
//   - No OffscreenCanvas (iOS Safari compatibility)
//   - No opacity stacking (highlight uses offscreen composite — 5b scope)
//   - Pen/live rendering on GPU; export (saveBlob) uses Canvas 2D for backward-compat output
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
    if (!hex) return 0xFF0000;
    if (hex.charAt(0) === '#') hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
    return parseInt(hex, 16) || 0;
  }

  function isSupported(){
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      return !!gl;
    } catch(_){ return false; }
  }

  function getGlInfo(){
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return null;
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        version: gl.getParameter(gl.VERSION),
        shading: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        webgl2: !!c.getContext('webgl2')
      };
    } catch(_){ return null; }
  }

  var WebGLMarkupEngine = {
    // --- State (mirrors MarkupEngine) ---
    canvas: null, host: null, img: null,
    dpr: 1, w: 0, h: 0,
    tool: 'pen', color: '#FF0000', size: 3, hlAlpha: 0.35,
    strokes: [], redoStack: [],
    _drawing: false, _curr: null,
    _origBlob: null, _onDirty: null,

    // --- Pixi-specific ---
    app: null,              // PIXI.Application
    stage: null,            // root Container
    _strokeG: [],           // Graphics per committed stroke (parallel to strokes[])
    _liveG: null,           // current in-progress Graphics
    _ready: false,
    _syncBound: null,
    _pendingAttach: null,

    // --- Info ---
    isSupported: isSupported,
    getGlInfo: getGlInfo,
    version: '5a.1',

    // === Public API ===

    attach: function(hostEl, imgEl, origBlob, onDirty){
      var self = this;
      this.detach();
      this.host = hostEl; this.img = imgEl;
      this._origBlob = origBlob || null;
      this._onDirty = onDirty || null;
      this.strokes = []; this.redoStack = [];
      this._strokeG = [];

      // Canvas overlay — same geometry rules as MarkupEngine
      var c = document.createElement('canvas');
      c.id = 'webgl-markup-canvas';
      c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:auto;touch-action:none;z-index:5;';
      hostEl.appendChild(c);
      this.canvas = c;

      // Attach input handlers immediately so taps aren't lost during Pixi load
      this._bind();
      window.addEventListener('resize', this._syncBound = this._sync.bind(this));

      // Lazy-init Pixi
      var attachToken = this._pendingAttach = {};
      loadPixi().then(function(PIXI){
        if (self._pendingAttach !== attachToken) return; // detached before load
        self._initPixi(PIXI);
        self._sync();
        self._ready = true;
      }).catch(function(err){
        console.error('[WebGLMarkupEngine] Pixi load failed:', err);
        self._ready = false;
      });

      return this;
    },

    detach: function(){
      this._pendingAttach = null;
      if (this._syncBound){ window.removeEventListener('resize', this._syncBound); this._syncBound = null; }
      if (this.app){
        try { this.app.destroy(true, {children:true, texture:true, baseTexture:true}); } catch(_){}
        this.app = null; this.stage = null;
      }
      if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      this.canvas = null; this.host = null; this.img = null;
      this.strokes = []; this.redoStack = []; this._strokeG = [];
      this._drawing = false; this._curr = null; this._liveG = null; this._ready = false;
    },

    setTool: function(t){ this.tool = t; },
    setColor: function(c){ this.color = c; },
    setSize: function(s){ this.size = s; },
    isDirty: function(){ return this.strokes.length > 0; },

    undo: function(){
      if (!this.strokes.length) return;
      var s = this.strokes.pop();
      var g = this._strokeG.pop();
      if (g && g.parent) g.parent.removeChild(g);
      this.redoStack.push({ stroke: s, g: g });
      if (this._onDirty) this._onDirty();
    },

    redo: function(){
      if (!this.redoStack.length) return;
      var item = this.redoStack.pop();
      this.strokes.push(item.stroke);
      if (item.g && this.stage){
        this.stage.addChild(item.g);
        this._strokeG.push(item.g);
      } else if (this.stage) {
        // Graphics was destroyed — rebuild from stroke data
        var g = this._makeStrokeGraphics(item.stroke);
        this.stage.addChild(g);
        this._strokeG.push(g);
      } else {
        this._strokeG.push(null);
      }
      if (this._onDirty) this._onDirty();
    },

    clear: function(){
      if (this.stage) this.stage.removeChildren();
      this.strokes = []; this.redoStack = []; this._strokeG = [];
      this._liveG = null;
      if (this._onDirty) this._onDirty();
    },

    revert: function(){ this.clear(); return this._origBlob; },

    // Export — backward-compatible raster output via Canvas 2D
    // (GPU is for live drawing; export is one-shot, so 2D is fine and keeps
    //  output byte-identical to MarkupEngine across renderers.)
    saveBlob: function(){
      var self = this;
      return new Promise(function(resolve, reject){
        try {
          var img = self.img;
          if (!img) throw new Error('No source image');
          var nw = img.naturalWidth, nh = img.naturalHeight;
          var out = document.createElement('canvas');
          out.width = nw; out.height = nh;
          var oc = out.getContext('2d');
          oc.drawImage(img, 0, 0, nw, nh);
          var sx = nw / self.w, sy = nh / self.h;

          // Pen strokes — lineTo only
          oc.lineCap = 'round'; oc.lineJoin = 'round';
          self.strokes.forEach(function(s){
            if (s.tool !== 'pen') return; // 5a: pen-only export
            if (!s.pts || s.pts.length < 2) return;
            oc.strokeStyle = s.color;
            oc.lineWidth = s.size * ((sx + sy) / 2);
            oc.beginPath();
            oc.moveTo(s.pts[0].x * sx, s.pts[0].y * sy);
            for (var j = 1; j < s.pts.length; j++){
              oc.lineTo(s.pts[j].x * sx, s.pts[j].y * sy);
            }
            oc.stroke();
          });

          out.toBlob(function(b){ b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/jpeg', 0.92);
        } catch(e){ reject(e); }
      });
    },

    // === Internals ===

    _initPixi: function(PIXI){
      this.dpr = window.devicePixelRatio || 1;
      var r = this.img ? this.img.getBoundingClientRect() : {width:800, height:600};
      this.w = r.width || 800;
      this.h = r.height || 600;

      var app = new PIXI.Application({
        view: this.canvas,
        width: this.w,
        height: this.h,
        backgroundAlpha: 0,
        antialias: true,
        resolution: this.dpr,
        autoDensity: true,
        powerPreference: 'high-performance'
      });
      this.app = app;
      this.stage = app.stage;
      // Stage uses logical CSS px; resolution handles DPR automatically
    },

    _sync: function(){
      if (!this.canvas || !this.img || !this.host) return;
      var r = this.img.getBoundingClientRect();
      var hr = this.host.getBoundingClientRect();
      this.canvas.style.left = (r.left - hr.left) + 'px';
      this.canvas.style.top  = (r.top  - hr.top)  + 'px';
      this.canvas.style.width  = r.width  + 'px';
      this.canvas.style.height = r.height + 'px';
      this.dpr = window.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height;
      if (this.app && this.app.renderer){
        try { this.app.renderer.resolution = this.dpr; } catch(_){}
        try { this.app.renderer.resize(this.w, this.h); } catch(_){}
      }
    },

    _bind: function(){
      var self = this, c = this.canvas;
      function pt(ev){
        var r = c.getBoundingClientRect();
        var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        var y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
        return { x: x, y: y };
      }
      function down(ev){
        if (!self._ready) return; // Pixi not loaded yet
        ev.preventDefault();
        if (self.tool !== 'pen'){
          // 5a scope: pen only. Other tools are 5b.
          return;
        }
        var p = pt(ev);
        self._drawing = true;
        self._curr = { tool:'pen', color:self.color, size:self.size, pts:[p] };
        self.redoStack = [];
        // Start a live Graphics
        self._liveG = self._makeStrokeGraphics(self._curr);
        self.stage.addChild(self._liveG);
      }
      function move(ev){
        if (!self._drawing || !self._curr) return;
        ev.preventDefault();
        var p = pt(ev);
        var last = self._curr.pts[self._curr.pts.length-1];
        if (Math.abs(p.x-last.x) + Math.abs(p.y-last.y) < 1) return;
        self._curr.pts.push(p);
        // Redraw live Graphics (cheap — single clear+redraw of growing path)
        if (self._liveG){
          self._liveG.clear();
          self._drawPenInto(self._liveG, self._curr);
        }
      }
      function up(){
        if (!self._drawing) return;
        self._drawing = false;
        if (self._curr && self._curr.pts.length > 1){
          self.strokes.push(self._curr);
          self._strokeG.push(self._liveG);
          if (self._onDirty) self._onDirty();
        } else if (self._liveG && self._liveG.parent){
          self._liveG.parent.removeChild(self._liveG);
        }
        self._curr = null;
        self._liveG = null;
      }
      c.addEventListener('mousedown', down);
      c.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      c.addEventListener('touchstart', down, {passive:false});
      c.addEventListener('touchmove',  move, {passive:false});
      window.addEventListener('touchend', up);
      // Keep refs for cleanup if we ever need it (not critical — detach removes canvas)
      this._handlers = { down:down, move:move, up:up };
    },

    _makeStrokeGraphics: function(stroke){
      var g = new window.PIXI.Graphics();
      this._drawPenInto(g, stroke);
      return g;
    },

    _drawPenInto: function(g, s){
      if (!s || !s.pts || s.pts.length < 1) return;
      var color = hexToInt(s.color);
      // Pixi v7: lineStyle API; cap/join enums are strings
      g.lineStyle({
        width: s.size || 3,
        color: color,
        alpha: 1,
        cap: 'round',
        join: 'round'
      });
      g.moveTo(s.pts[0].x, s.pts[0].y);
      for (var i = 1; i < s.pts.length; i++){
        g.lineTo(s.pts[i].x, s.pts[i].y); // lineTo only — hard rule
      }
    },

    // Bulk-load strokes (for backward-compat with existing markupObjects data).
    // Rebuilds Graphics objects from stroke data.
    loadStrokes: function(strokeArr){
      if (!this.stage || !strokeArr) return;
      this.clear();
      for (var i = 0; i < strokeArr.length; i++){
        var s = strokeArr[i];
        if (s.tool !== 'pen') continue; // 5a: pen only
        this.strokes.push(s);
        var g = this._makeStrokeGraphics(s);
        this.stage.addChild(g);
        this._strokeG.push(g);
      }
    }
  };

  window.WebGLMarkupEngine = WebGLMarkupEngine;
})();
