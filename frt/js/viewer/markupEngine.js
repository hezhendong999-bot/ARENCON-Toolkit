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
      if (this._textInput && this._textInput.parentNode) { try{ this._textInput.parentNode.removeChild(this._textInput); }catch(_){} this._textInput=null; }
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
      function isShape(t){ return t==='arrow'||t==='rect'||t==='circle'||t==='line'; }
      function down(ev){
        ev.preventDefault();
        var p = pt(ev);
        if (self.tool === 'text'){ self._textPrompt(p); return; }
        if (self.tool === 'eraser'){ self._eraseAt(p); self._drawing = true; return; }
        self._drawing = true;
        self._curr = { tool:self.tool, color:self.color, size:self.size, pts:[p, {x:p.x,y:p.y}] };
        if (!isShape(self.tool)) self._curr.pts = [p]; // freehand uses growing array
        self.redoStack = [];
      }
      function move(ev){
        if (!self._drawing) return;
        ev.preventDefault();
        var p = pt(ev);
        if (self.tool === 'eraser'){ self._eraseAt(p); return; }
        if (!self._curr) return;
        if (isShape(self._curr.tool)){
          self._curr.pts[1] = p; // rubber-band
          self._render();
          return;
        }
        var last = self._curr.pts[self._curr.pts.length-1];
        if (Math.abs(p.x-last.x) + Math.abs(p.y-last.y) < 1) return;
        self._curr.pts.push(p);
        self._render();
      }
      function up(){
        if (!self._drawing) return;
        self._drawing = false;
        if (self._curr){
          var ok = false;
          if (isShape(self._curr.tool)){
            var a=self._curr.pts[0], b=self._curr.pts[1];
            ok = (Math.abs(a.x-b.x) + Math.abs(a.y-b.y)) > 4; // ignore taps
          } else {
            ok = self._curr.pts.length > 1;
          }
          if (ok){ self.strokes.push(self._curr); if (self._onDirty) self._onDirty(); }
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
      var r = (this.size||3) + 10;
      var r2 = r*r;
      function distToSeg(px,py, ax,ay, bx,by){
        var dx=bx-ax, dy=by-ay;
        var len2 = dx*dx + dy*dy;
        if (len2 === 0){ var ex=px-ax,ey=py-ay; return ex*ex+ey*ey; }
        var t = ((px-ax)*dx + (py-ay)*dy) / len2;
        t = Math.max(0, Math.min(1, t));
        var qx = ax + t*dx, qy = ay + t*dy;
        var fx = px-qx, fy = py-qy;
        return fx*fx + fy*fy;
      }
      var hit = -1;
      for (var i=this.strokes.length-1; i>=0; i--){
        var s = this.strokes[i];
        var tool = s.tool;
        if (tool === 'pen' || tool === 'highlight'){
          for (var j=0; j<s.pts.length-1; j++){
            if (distToSeg(p.x,p.y, s.pts[j].x,s.pts[j].y, s.pts[j+1].x,s.pts[j+1].y) <= r2){ hit=i; break; }
          }
        } else if (tool === 'line' || tool === 'arrow'){
          if (distToSeg(p.x,p.y, s.pts[0].x,s.pts[0].y, s.pts[1].x,s.pts[1].y) <= r2) hit=i;
        } else if (tool === 'rect'){
          var x1=Math.min(s.pts[0].x,s.pts[1].x), y1=Math.min(s.pts[0].y,s.pts[1].y);
          var x2=Math.max(s.pts[0].x,s.pts[1].x), y2=Math.max(s.pts[0].y,s.pts[1].y);
          // Test all 4 edges
          if (distToSeg(p.x,p.y,x1,y1,x2,y1)<=r2 || distToSeg(p.x,p.y,x2,y1,x2,y2)<=r2 ||
              distToSeg(p.x,p.y,x2,y2,x1,y2)<=r2 || distToSeg(p.x,p.y,x1,y2,x1,y1)<=r2) hit=i;
        } else if (tool === 'circle'){
          var cx=(s.pts[0].x+s.pts[1].x)/2, cy=(s.pts[0].y+s.pts[1].y)/2;
          var rx=Math.abs(s.pts[1].x-s.pts[0].x)/2, ry=Math.abs(s.pts[1].y-s.pts[0].y)/2;
          if (rx>0 && ry>0){
            // Distance from point to ellipse perimeter (approximation): scale into unit circle space
            var nx=(p.x-cx)/rx, ny=(p.y-cy)/ry;
            var d = Math.abs(Math.sqrt(nx*nx+ny*ny) - 1) * Math.min(rx,ry);
            if (d <= r) hit=i;
          }
        } else if (tool === 'text'){
          var tp=s.pts[0];
          var fontPx=(s.size||3)*4;
          var w=(s.text||'').length*fontPx*0.55; // rough char width estimate
          if (p.x >= tp.x-4 && p.x <= tp.x+w+4 && p.y >= tp.y-fontPx-2 && p.y <= tp.y+4) hit=i;
        }
        if (hit >= 0) break;
      }
      if (hit >= 0){
        this.redoStack.push(this.strokes.splice(hit,1)[0]);
        if (this._onDirty) this._onDirty();
        this._render();
      }
    },

    // Generic shape renderer used by both _render (screen) and saveBlob (natural res).
    // sx/sy let saveBlob scale logical coords -> natural pixels.
    _drawShape: function(ctx, s, sx, sy){
      sx = sx || 1; sy = sy || 1;
      var a = s.pts[0], b = s.pts[1]; if (!a || !b) return;
      var x1=a.x*sx, y1=a.y*sy, x2=b.x*sx, y2=b.y*sy;
      ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.strokeStyle = s.color; ctx.lineWidth = s.size * ((sx+sy)/2);
      ctx.beginPath();
      if (s.tool==='line'){
        ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      } else if (s.tool==='rect'){
        ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
      } else if (s.tool==='circle'){
        var cx=(x1+x2)/2, cy=(y1+y2)/2;
        var rx=Math.abs(x2-x1)/2, ry=Math.abs(y2-y1)/2;
        // ellipse via canvas API; fall back to circle if not supported
        if (ctx.ellipse){ ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); }
        else { ctx.arc(cx,cy,Math.max(rx,ry),0,Math.PI*2); }
        ctx.stroke();
      } else if (s.tool==='arrow'){
        ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        // Arrowhead
        var ang = Math.atan2(y2-y1, x2-x1);
        var head = Math.max(10, s.size*4) * ((sx+sy)/2);
        ctx.beginPath();
        ctx.moveTo(x2,y2);
        ctx.lineTo(x2 - head*Math.cos(ang - Math.PI/6), y2 - head*Math.sin(ang - Math.PI/6));
        ctx.moveTo(x2,y2);
        ctx.lineTo(x2 - head*Math.cos(ang + Math.PI/6), y2 - head*Math.sin(ang + Math.PI/6));
        ctx.stroke();
      }
    },

    // Inline text input overlay — commits on Enter/blur, cancels on Escape
    _textPrompt: function(p){
      var self = this;
      if (self._textInput) { try { self._textInput.parentNode.removeChild(self._textInput); } catch(_){} self._textInput=null; }
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = 'Type, Enter to commit';
      var fontPx = (self.size||3) * 4;
      inp.style.cssText = 'position:absolute;left:'+p.x+'px;top:'+(p.y - fontPx)+'px;'+
        'background:rgba(255,255,255,.95);color:'+self.color+';border:2px dashed '+self.color+';'+
        'border-radius:3px;padding:2px 6px;font:600 '+fontPx+'px Calibri,sans-serif;'+
        'min-width:120px;outline:none;z-index:6;pointer-events:auto;';
      self.canvas.parentNode.appendChild(inp);
      self._textInput = inp;
      setTimeout(function(){ inp.focus(); }, 0);
      function cleanup(){
        if (inp.parentNode) inp.parentNode.removeChild(inp);
        if (self._textInput === inp) self._textInput = null;
      }
      function commit(){
        var v = inp.value.trim();
        if (v){
          self.strokes.push({ tool:'text', pts:[{x:p.x,y:p.y}], text:v, color:self.color, size:self.size });
          self.redoStack = [];
          if (self._onDirty) self._onDirty();
          self._render();
        }
        cleanup();
      }
      inp.addEventListener('keydown', function(e){
        if (e.key === 'Enter'){ e.preventDefault(); commit(); }
        else if (e.key === 'Escape'){ e.preventDefault(); cleanup(); }
        e.stopPropagation();
      });
      inp.addEventListener('blur', commit);
    },

    _drawText: function(ctx, s, sx, sy){
      sx = sx || 1; sy = sy || 1;
      var p = s.pts[0]; if (!p) return;
      var fontPx = (s.size||3) * 4 * ((sx+sy)/2);
      ctx.font = '600 ' + fontPx + 'px Calibri, sans-serif';
      ctx.fillStyle = s.color;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s.text || '', p.x*sx, p.y*sy);
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
      // Pass 3: shapes (line, rect, circle, arrow) on top of everything
      for (var m=0;m<this.strokes.length;m++){
        var sh = this.strokes[m];
        if (sh.tool==='line'||sh.tool==='rect'||sh.tool==='circle'||sh.tool==='arrow') this._drawShape(ctx, sh);
      }
      if (this._curr && (this._curr.tool==='line'||this._curr.tool==='rect'||this._curr.tool==='circle'||this._curr.tool==='arrow')) this._drawShape(ctx, this._curr);
      // Pass 4: text labels on top of everything
      for (var n=0;n<this.strokes.length;n++){
        var tx = this.strokes[n];
        if (tx.tool==='text') this._drawText(ctx, tx);
      }
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
          // Shapes on top
          self.strokes.filter(function(s){return s.tool==='line'||s.tool==='rect'||s.tool==='circle'||s.tool==='arrow';}).forEach(function(s){
            self._drawShape(oc, s, sx, sy);
          });
          // Text labels on top
          self.strokes.filter(function(s){return s.tool==='text';}).forEach(function(s){
            self._drawText(oc, s, sx, sy);
          });
          out.toBlob(function(b){ b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/jpeg', 0.92);
        } catch(e){ reject(e); }
      });
    }
  };

  window.MarkupEngine = MarkupEngine;
})();
