// FRT v2 - Markup Engine (foundation: Pen, Highlight, Eraser)
// Rules: DPR-aware logical coords; lineTo only (no quadraticCurveTo);
// highlighter via offscreen composite (no opacity stacking); no OffscreenCanvas.
(function(){
  'use strict';

  var MarkupEngine = {
    canvas: null, ctx: null, host: null, img: null,
    dpr: 1, w: 0, h: 0,                  // logical (CSS px) size
    tool: 'pen',                          // 'pen' | 'highlight' | 'eraser'
    color: '#FF0000', size: 3, hlAlpha: 0.35,
    strokes: [],                          // committed strokes
    redoStack: [],
    _drawing: false, _curr: null,
    _origBlob: null,                      // pristine source for Revert
    _onDirty: null,

    // Mount onto an <img> inside a host element. Creates an absolutely-positioned canvas overlay.
    attach: function(hostEl, imgEl, origBlob, onDirty){
      this.detach();
      this.host = hostEl; this.img = imgEl; this._origBlob = origBlob || null;
      this._onDirty = onDirty || null;
      var c = document.createElement('canvas');
      c.id = 'markup-canvas';
      c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:auto;touch-action:none;z-index:5;';
      hostEl.appendChild(c);
      this.canvas = c; this.ctx = c.getContext('2d');
      this.strokes = []; this.redoStack = [];
      this._sync();
      this._bind();
      window.addEventListener('resize', this._syncBound = this._sync.bind(this));
    },

    detach: function(){
      if (this._syncBound) { window.removeEventListener('resize', this._syncBound); this._syncBound = null; }
      if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      this.canvas = null; this.ctx = null; this.host = null; this.img = null;
      this.strokes = []; this.redoStack = []; this._drawing = false; this._curr = null;
    },

    // Match overlay canvas to img's rendered box (CSS px) at device pixel resolution
    _sync: function(){
      if (!this.canvas || !this.img) return;
      var r = this.img.getBoundingClientRect();
      var hr = this.host.getBoundingClientRect();
      this.canvas.style.left = (r.left - hr.left) + 'px';
      this.canvas.style.top  = (r.top  - hr.top)  + 'px';
      this.canvas.style.width  = r.width  + 'px';
      this.canvas.style.height = r.height + 'px';
      this.dpr = window.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height;
      this.canvas.width  = Math.max(1, Math.round(r.width  * this.dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
      this._render();
    },

    setTool:  function(t){ this.tool = t; },
    setColor: function(c){ this.color = c; },
    setSize:  function(s){ this.size = s; },

    _bind: function(){
      var self = this, c = this.canvas;
      function pt(ev){
        var r = c.getBoundingClientRect();
        var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        var y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
        return { x: x, y: y };
      }
      function down(ev){
        ev.preventDefault();
        var p = pt(ev);
        if (self.tool === 'eraser'){ self._eraseAt(p); self._drawing = true; return; }
        self._drawing = true;
        self._curr = { tool:self.tool, color:self.color, size:self.size, pts:[p] };
        self.redoStack = [];
      }
      function move(ev){
        if (!self._drawing) return;
        ev.preventDefault();
        var p = pt(ev);
        if (self.tool === 'eraser'){ self._eraseAt(p); return; }
        if (!self._curr) return;
        var last = self._curr.pts[self._curr.pts.length-1];
        if (Math.abs(p.x-last.x) + Math.abs(p.y-last.y) < 1) return;
        self._curr.pts.push(p);
        self._render();
      }
      function up(){
        if (!self._drawing) return;
        self._drawing = false;
        if (self._curr && self._curr.pts.length > 1){
          self.strokes.push(self._curr);
          if (self._onDirty) self._onDirty();
        }
        self._curr = null;
        self._render();
      }
      c.addEventListener('mousedown', down); c.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      c.addEventListener('touchstart', down, {passive:false});
      c.addEventListener('touchmove',  move, {passive:false});
      window.addEventListener('touchend', up);
    },

    _eraseAt: function(p){
      // Hit-test strokes by bounding test (cheap): remove any stroke whose any point within size+8 of p
      var r = (this.size||3) + 8;
      var hit = -1;
      for (var i=this.strokes.length-1; i>=0; i--){
        var s = this.strokes[i];
        for (var j=0; j<s.pts.length; j++){
          var dx = s.pts[j].x - p.x, dy = s.pts[j].y - p.y;
          if (dx*dx + dy*dy <= r*r){ hit = i; break; }
        }
        if (hit >= 0) break;
      }
      if (hit >= 0){
        this.redoStack.push(this.strokes.splice(hit,1)[0]);
        if (this._onDirty) this._onDirty();
        this._render();
      }
    },

    _strokePath: function(ctx, s){
      if (s.pts.length < 2) return;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = s.color; ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (var i=1; i<s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y); // lineTo only
      ctx.stroke();
    },

    _render: function(){
      if (!this.ctx) return;
      var ctx = this.ctx;
      ctx.clearRect(0,0,this.w,this.h);
      // Pass 1: highlights via offscreen composite (no opacity stacking)
      var hi = this.strokes.filter(function(s){return s.tool==='highlight';});
      if (this._curr && this._curr.tool==='highlight') hi = hi.concat([this._curr]);
      if (hi.length){
        var off = document.createElement('canvas');
        off.width = Math.max(1, Math.round(this.w*this.dpr));
        off.height= Math.max(1, Math.round(this.h*this.dpr));
        var oc = off.getContext('2d');
        oc.setTransform(this.dpr,0,0,this.dpr,0,0);
        for (var i=0;i<hi.length;i++){
          var s = hi[i];
          oc.lineCap='round'; oc.lineJoin='round';
          oc.strokeStyle = s.color; oc.lineWidth = (s.size||3)*4;
          oc.beginPath(); oc.moveTo(s.pts[0].x,s.pts[0].y);
          for (var j=1;j<s.pts.length;j++) oc.lineTo(s.pts[j].x,s.pts[j].y);
          oc.stroke();
        }
        ctx.save(); ctx.globalAlpha = this.hlAlpha;
        ctx.setTransform(1,0,0,1,0,0);
        ctx.drawImage(off,0,0);
        ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
        ctx.restore();
      }
      // Pass 2: pen strokes on top
      for (var k=0;k<this.strokes.length;k++){
        var st = this.strokes[k];
        if (st.tool==='pen') this._strokePath(ctx, st);
      }
      if (this._curr && this._curr.tool==='pen') this._strokePath(ctx, this._curr);
    },

    isDirty: function(){ return this.strokes.length > 0; },

    undo: function(){
      if (!this.strokes.length) return;
      this.redoStack.push(this.strokes.pop());
      this._render();
      if (this._onDirty) this._onDirty();
    },
    redo: function(){
      if (!this.redoStack.length) return;
      this.strokes.push(this.redoStack.pop());
      this._render();
      if (this._onDirty) this._onDirty();
    },

    clear: function(){
      this.strokes = []; this.redoStack = []; this._render();
      if (this._onDirty) this._onDirty();
    },

    // Revert: drop edits AND signal caller to reload original blob
    revert: function(){ this.clear(); return this._origBlob; },

    // Bake annotations into a fresh blob at the image's natural resolution
    saveBlob: function(){
      var self = this;
      return new Promise(function(resolve, reject){
        try {
          var img = self.img;
          var nw = img.naturalWidth, nh = img.naturalHeight;
          var out = document.createElement('canvas');
          out.width = nw; out.height = nh;
          var oc = out.getContext('2d');
          oc.drawImage(img, 0, 0, nw, nh);
          // Scale logical coords -> natural pixels
          var sx = nw / self.w, sy = nh / self.h;
          // Highlights composite at natural size
          var hi = self.strokes.filter(function(s){return s.tool==='highlight';});
          if (hi.length){
            var off = document.createElement('canvas'); off.width=nw; off.height=nh;
            var hctx = off.getContext('2d');
            hctx.lineCap='round'; hctx.lineJoin='round';
            hi.forEach(function(s){
              hctx.strokeStyle=s.color; hctx.lineWidth=(s.size||3)*4*((sx+sy)/2);
              hctx.beginPath(); hctx.moveTo(s.pts[0].x*sx, s.pts[0].y*sy);
              for (var j=1;j<s.pts.length;j++) hctx.lineTo(s.pts[j].x*sx, s.pts[j].y*sy);
              hctx.stroke();
            });
            oc.save(); oc.globalAlpha = self.hlAlpha; oc.drawImage(off,0,0); oc.restore();
          }
          // Pen on top
          oc.lineCap='round'; oc.lineJoin='round';
          self.strokes.filter(function(s){return s.tool==='pen';}).forEach(function(s){
            oc.strokeStyle=s.color; oc.lineWidth=s.size*((sx+sy)/2);
            oc.beginPath(); oc.moveTo(s.pts[0].x*sx, s.pts[0].y*sy);
            for (var j=1;j<s.pts.length;j++) oc.lineTo(s.pts[j].x*sx, s.pts[j].y*sy);
            oc.stroke();
          });
          out.toBlob(function(b){ b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/jpeg', 0.92);
        } catch(e){ reject(e); }
      });
    }
  };

  window.MarkupEngine = MarkupEngine;
})();
