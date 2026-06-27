// FRT v2 - Markup Engine (foundation: Pen, Highlight, Eraser)
// Rules: DPR-aware logical coords; lineTo only (no quadraticCurveTo);
// highlighter via offscreen composite (no opacity stacking); no OffscreenCanvas.
(function(){
  'use strict';

  // S339 — single source of truth for "is this stroke a two-point shape?". Used by
  // the retained-draw pass, the bake pass, and hit-testing so adding a shape only
  // touches the per-shape draw/hit code, not four scattered tool-name lists.
  var SHAPE_TOOLS = { line:1, arrow:1, rect:1, circle:1, 'rect-fill':1, 'circle-fill':1, triangle:1, cloud:1 };
  function isShapeTool(t){ return !!SHAPE_TOOLS[t]; }

  var MarkupEngine = {
    canvas: null, ctx: null, host: null, img: null,
    dpr: 1, w: 0, h: 0,                  // logical (CSS px) size
    tool: 'pen',                          // 'pen' | 'highlight' | 'eraser' | 'select' | shapes | 'text'
    color: '#FF0000', size: 3, hlAlpha: 0.35,
    opacity: 1,                           // current draw opacity (0.1–1) — Diesel-style, stamped per stroke at commit
    strokes: [],                          // committed strokes
    redoStack: [],
    _drawing: false, _curr: null,
    _shapePending: null,                  // S329 #23 — in-progress two-click shape
    _origBlob: null,                      // pristine source for Revert
    _onDirty: null,
    // ── Select-mode state (ported from drawing viewer markup.js) ──
    _selectedIds: [],                     // ids of selected strokes (group model)
    _dragState: null,                     // {type:'move'|'resize'|'rotate'|'rubberband', ...}
    _rubberBand: null,                    // {x1,y1,x2,y2} during drag-select
    // S339 — Select sub-tool model (LOCKED_SELECT_DRAW_MODEL_S339). Select is a
    // tool GROUP: 'rubber' (default — tap one OR drag-box group), 'tap' (two-phase
    // pick → ✓ to group). Selection is STICKY in all modes — empty-area taps/pans
    // never clear; only the ✗ cancel (or picking different marks) clears.
    // S339 (Mark): 'single' retired from the UI — rubber covers tap-one + drag-box.
    // Still accepted by setSelectSub for back-compat, but never the default.
    _selectSub: 'rubber',                 // 'rubber' | 'tap' (legacy: 'single')
    _pickIds: [],                         // tap-mode individual picks (pre-✓ group)
    _onSelChange: null,                   // lightbox callback to refresh ✓/✗ bar chrome

    _uid: function(){ return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); },

    // Mount onto an <img> inside a host element. Creates an absolutely-positioned canvas overlay.
    // initStrokes (optional): an array of previously-saved stroke objects (logical coords) to
    // reload as LIVE, editable markup. Pass null/undefined for a clean canvas.
    attach: function(hostEl, imgEl, origBlob, onDirty, initStrokes){
      this.detach();
      this.host = hostEl; this.img = imgEl; this._origBlob = origBlob || null;
      this._onDirty = onDirty || null;
      var c = document.createElement('canvas');
      c.id = 'markup-canvas';
      c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:auto;touch-action:none;z-index:5;'+
        '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;';
      hostEl.appendChild(c);
      this.canvas = c; this.ctx = c.getContext('2d');
      // Reload saved strokes (deep-cloned so the engine owns its own copy) or start clean.
      this.strokes = (initStrokes && initStrokes.length)
        ? JSON.parse(JSON.stringify(initStrokes))
        : [];
      this.redoStack = [];
      // Baseline signature of the just-loaded strokes — lets the lightbox tell a
      // genuine edit from a no-op reopen (so closing without changes doesn't
      // needlessly re-flatten + re-upload). Updated by _onDirty edits via the getter.
      this._attachSig = JSON.stringify(this.strokes);
      this._sync();   // sets w/h and _render()s — re-paints the reloaded strokes
      this._bind();
      window.addEventListener('resize', this._syncBound = this._sync.bind(this));
    },

    // Serialize current strokes for persistence (logical coords; pure data, no canvas).
    // Returns a deep clone so callers can't mutate engine state.
    exportStrokes: function(){
      return this.strokes && this.strokes.length
        ? JSON.parse(JSON.stringify(this.strokes))
        : [];
    },

    // S347: rigidly rotate the LIVE strokes by `steps` × 90° CW. Rotation is
    // done in FRACTION space (frame-independent), which is mathematically
    // identical to rigid pixel rotation about the image but needs no knowledge
    // of the absolute frame magnitude. Strokes are stored in fit-logical px;
    // we normalize by the current fit frame (this.w × this.h), rotate, then
    // re-expand into the SWAPPED fit frame. Per-object s.rotation turns +90° CW.
    // After this the engine's frame W/H have swapped — caller re-syncs + _render.
    rotateStrokes: function(steps){
      if (!this.strokes || !this.strokes.length) return;
      var r = MarkupEngine.rotateStrokesInFrame(this.strokes, steps, this.w, this.h);
      // (frame swap is reflected by the caller's re-sync; nothing else to do here)
      return r;
    },

    // Static: rigid 90°-CW-by-steps rotation of a stroke array IN PLACE. Works in
    // fraction space using the given starting frame (w0,h0) only to normalize;
    // the result is re-expanded into the swapped frame. Returns the new frame.
    // 90° CW in fraction space: (fx,fy) -> (1 - fy, fx)  [== rigid pixel rotation].
    rotateStrokesInFrame: function(strokes, steps, w0, h0){
      steps = (((steps||0) % 4) + 4) % 4;
      if (!steps || !strokes || !strokes.length) return { w: w0, h: h0 };
      var w = w0, h = h0;
      // normalize to fractions of the starting frame
      for (var a = 0; a < strokes.length; a++){
        var st = strokes[a]; if (!st.pts) continue;
        for (var b = 0; b < st.pts.length; b++){ st.pts[b].x /= w; st.pts[b].y /= h; }
      }
      // rotate in fraction space, swapping the frame each step
      for (var s = 0; s < steps; s++){
        for (var i = 0; i < strokes.length; i++){
          var k = strokes[i];
          if (k.pts){
            for (var j = 0; j < k.pts.length; j++){
              var p = k.pts[j];
              var nx = 1 - p.y, ny = p.x;   // (fx,fy) -> (1-fy, fx)
              p.x = nx; p.y = ny;
            }
          }
          if (k.rotation != null) k.rotation += Math.PI / 2;
        }
        var t = w; w = h; h = t;
      }
      // re-expand into the new (swapped) frame
      for (var c = 0; c < strokes.length; c++){
        var sc = strokes[c]; if (!sc.pts) continue;
        for (var e = 0; e < sc.pts.length; e++){ sc.pts[e].x *= w; sc.pts[e].y *= h; }
      }
      return { w: w, h: h };
    },

    detach: function(){
      if (this._textInput && this._textInput.parentNode) { try{ this._textInput.parentNode.removeChild(this._textInput); }catch(_){} this._textInput=null; }
      if (this._syncBound) { window.removeEventListener('resize', this._syncBound); this._syncBound = null; }
      if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      this.canvas = null; this.ctx = null; this.host = null; this.img = null;
      this.strokes = []; this.redoStack = []; this._drawing = false; this._curr = null;
      this._shapePending = null;
      this._selectedIds = []; this._dragState = null; this._rubberBand = null;
      this._pickIds = [];
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

    setTool:  function(t){ this.tool = t; if (this._shapePending){ this._shapePending = null; this._curr = null; } if (t !== 'select'){ this._selectedIds = []; this._dragState = null; this._rubberBand = null; this._pickIds = []; if (this.ctx) this._render(); } else { this._pickIds = []; if (this.ctx) this._render(); } this._emitSel(); },

    // S339 — arm a Select sub-tool. Keeps any committed selection; resets an
    // in-progress tap pick / rubber band / drag (changing sub-tool mid-pick).
    setSelectSub: function(sub){
      if (sub!=='single' && sub!=='rubber' && sub!=='tap') return;
      this._selectSub = sub; this.tool = 'select';
      this._pickIds = []; this._dragState = null; this._rubberBand = null;
      if (this.ctx) this._render(); this._emitSel();
    },
    getSelectSub: function(){ return this._selectSub; },

    // S339 — tap-mode ✓: collapse individual picks into ONE committed group.
    confirmPick: function(){
      if (!this._pickIds.length) return;
      this._selectedIds = this._pickIds.slice();
      this._pickIds = [];
      if (this.ctx) this._render(); this._emitSel();
    },
    // S339 — ✗ cancel (all modes): clear committed selection AND any in-progress
    // pick / rubber band. The only deliberate clear (empty taps are sticky).
    cancelSelect: function(){
      this._selectedIds = []; this._pickIds = [];
      this._dragState = null; this._rubberBand = null;
      if (this.ctx) this._render(); this._emitSel();
    },
    // True whenever the ✗ (and, in tap mode, ✓) bar should be visible.
    hasActiveSelection: function(){ return (this._selectedIds && this._selectedIds.length>0) || (this._pickIds && this._pickIds.length>0); },
    isPicking: function(){ return this._selectSub==='tap' && this._pickIds && this._pickIds.length>0; },
    pickCount: function(){ return this._pickIds ? this._pickIds.length : 0; },
    selectionCount: function(){ return this._selectedIds ? this._selectedIds.length : 0; },
    onSelChange: function(fn){ this._onSelChange = fn || null; },
    _emitSel: function(){ if (this._onSelChange){ try{ this._onSelChange(); }catch(_){} } },
    setColor: function(c){ this.color = c; this._applyToSelection('color', c); },
    setSize:  function(s){ this.size = s; },
    setOpacity: function(v){ v = Math.max(0.1, Math.min(1, v)); this.opacity = v; this._applyToSelection('opacity', v); },

    // Live-apply colour/opacity to the current selection (so the bar edits selected strokes)
    _applyToSelection: function(field, val){
      if (!this._selectedIds || !this._selectedIds.length) return;
      var changed = false;
      for (var i=0;i<this.strokes.length;i++){
        if (this._selectedIds.indexOf(this.strokes[i].id) !== -1){ this.strokes[i][field] = val; changed = true; }
      }
      if (changed){ this._render(); if (this._onDirty) this._onDirty(); }
    },

    _bind: function(){
      var self = this, c = this.canvas;
      function pt(ev){
        var r = c.getBoundingClientRect();
        var cx = (ev.touches ? ev.touches[0].clientX : ev.clientX);
        var cy = (ev.touches ? ev.touches[0].clientY : ev.clientY);
        // S329 (#20/#21/#22): during markup the canvas may carry a CSS scale (zoom), so
        // its on-screen rect is larger/smaller than its logical size. Map the screen point
        // back into the canvas's LOGICAL (fit) coordinate space — the same space strokes
        // were always stored in — so saveBlob() and line widths are unaffected. At fit
        // (no scale) r.width === self.w, so this reduces to the original (cx - r.left).
        var sx = (r.width  && self.w) ? (self.w / r.width)  : 1;
        var sy = (r.height && self.h) ? (self.h / r.height) : 1;
        return { x: (cx - r.left) * sx, y: (cy - r.top) * sy };
      }
      function isShape(t){ return t==='arrow'||t==='rect'||t==='circle'||t==='line'||t==='rect-fill'||t==='circle-fill'||t==='triangle'||t==='cloud'; }
      // S329 (#23, Mark): shapes (arrow/rect/circle/line) place via TWO CLICKS
      // (click start -> click finish), NOT click-drag-hold. Freehand (pen/highlight)
      // and eraser keep the drag flow. Mirrors the drawing-viewer engine's
      // click-to-draw state machine. `_shapePending` holds the in-progress shape
      // between the two clicks; a move updates its live rubber-band preview (mouse).
      function down(ev){
        // S329 (#20/#21/#22, Mark): TWO+ fingers = pinch-zoom/pan, never draw. Bail
        // WITHOUT preventDefault so the gesture bubbles to the lightbox's pinch handler.
        // Also cancel any stroke/shape that a first finger had started, so dropping a
        // 2nd finger to zoom never leaves a stray mark (Procreate-style behaviour).
        if (ev.touches && ev.touches.length >= 2){
          if (self._drawing || self._curr || self._shapePending){
            self._drawing = false; self._curr = null; self._shapePending = null;
            if (self.ctx) self._render();
          }
          return;
        }
        var p = pt(ev);
        // S339 (Mark): if a text box is already open, swallow ALL canvas presses —
        // tapping empty space must NOT drop a second box or discard the text in the
        // open one (fat-finger fix). Only the bar's ✓ (commit) / ✕ (discard) exit.
        if (self._textInput){ ev.preventDefault(); return; }
        // S339 (Mark): SINGLE-TAP to edit existing text when NO tool is armed. (Was
        // double-tap, which lost the race to the OS double-tap/text-selection gesture
        // on iOS+Android — the native Copy/Look-Up menu kept hijacking it.) With no
        // tool armed, a tap that lands on a text mark re-opens it in the editor.
        if (!self.tool){
          var hitTextId = self._hitTextAt(p);
          if (hitTextId){ ev.preventDefault(); self._textPrompt(p, ev, hitTextId); return; }
          return;   // no tool, no text hit → inert tap
        }
        if (self.tool === 'text'){ self._textPrompt(p, ev); return; }  // no preventDefault — let focus land
        ev.preventDefault();
        if (self.tool === 'select'){ self._selectDown(p, ev); return; }
        if (self.tool === 'eraser'){ self._eraseAt(p); self._drawing = true; return; }
        if (isShape(self.tool)){
          // S339 — press-drag-release flow (was two-click). Start point on press;
          // pts[1] tracks the pointer during move; commit on up if dragged past
          // threshold. Matches pen/freehand and the signed-off demo.
          self._drawing = true;
          self._curr = { id:self._uid(), tool:self.tool, color:self.color, size:self.size, opacity:self.opacity, pts:[p, {x:p.x,y:p.y}] };
          self.redoStack = [];
          self._render();
          return;
        }
        // Freehand (pen/highlight) — drag flow.
        self._drawing = true;
        self._curr = { id:self._uid(), tool:self.tool, color:self.color, size:self.size, opacity:self.opacity, pts:[p, {x:p.x,y:p.y}] };
        self._curr.pts = [p]; // freehand uses growing array
        self.redoStack = [];
      }
      function move(ev){
        // S329: 2+ fingers — stop drawing, let the pinch/pan move bubble to lightbox.
        if (ev.touches && ev.touches.length >= 2){
          if (self._drawing || self._curr || self._shapePending){
            self._drawing = false; self._curr = null; self._shapePending = null;
            if (self.ctx) self._render();
          }
          return;
        }
        if (self.tool === 'select'){ if (self._dragState){ ev.preventDefault(); self._selectMove(pt(ev)); } return; }
        if (!self._drawing) return;
        ev.preventDefault();
        var p = pt(ev);
        if (self.tool === 'eraser'){ self._eraseAt(p); return; }
        if (!self._curr) return;
        if (isShape(self._curr.tool)){
          // S339 — drag updates the second corner; render live rubber-band preview.
          self._curr.pts[1] = p;
          self._render();
          return;
        }
        var last = self._curr.pts[self._curr.pts.length-1];
        if (Math.abs(p.x-last.x) + Math.abs(p.y-last.y) < 1) return;
        self._curr.pts.push(p);
        self._render();
      }
      function up(){
        if (self.tool === 'select'){ if (self._dragState) self._selectUp(); return; }
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
        } else if (tool === 'rect-fill' || tool === 'cloud'){
          // filled rect & cloud: hit anywhere inside the bounding box
          var bx1=Math.min(s.pts[0].x,s.pts[1].x), by1=Math.min(s.pts[0].y,s.pts[1].y);
          var bx2=Math.max(s.pts[0].x,s.pts[1].x), by2=Math.max(s.pts[0].y,s.pts[1].y);
          if (p.x>=bx1-r && p.x<=bx2+r && p.y>=by1-r && p.y<=by2+r) hit=i;
        } else if (tool === 'circle-fill'){
          var fcx=(s.pts[0].x+s.pts[1].x)/2, fcy=(s.pts[0].y+s.pts[1].y)/2;
          var frx=Math.abs(s.pts[1].x-s.pts[0].x)/2, fry=Math.abs(s.pts[1].y-s.pts[0].y)/2;
          if (frx>0 && fry>0){ var fnx=(p.x-fcx)/frx, fny=(p.y-fcy)/fry; if (fnx*fnx+fny*fny <= 1.0) hit=i; }
        } else if (tool === 'triangle'){
          var trl=Math.min(s.pts[0].x,s.pts[1].x), trr=Math.max(s.pts[0].x,s.pts[1].x);
          var trt=Math.min(s.pts[0].y,s.pts[1].y), trb=Math.max(s.pts[0].y,s.pts[1].y);
          // point-in-triangle (apex top-center, base bottom) via edge sign test
          var A={x:(trl+trr)/2,y:trt}, B={x:trr,y:trb}, C={x:trl,y:trb};
          function sign(p1,p2,p3){ return (p1.x-p3.x)*(p2.y-p3.y)-(p2.x-p3.x)*(p1.y-p3.y); }
          var d1=sign(p,A,B), d2=sign(p,B,C), d3=sign(p,C,A);
          var hasNeg=(d1<0)||(d2<0)||(d3<0), hasPos=(d1>0)||(d2>0)||(d3>0);
          if (!(hasNeg&&hasPos)) hit=i;
        } else if (tool === 'text'){
          var tp=s.pts[0];
          var _hm=this._textMetrics(s);
          var fontPx=_hm.fs;
          var w=_hm.w; // widest line
          if (p.x >= tp.x-4 && p.x <= tp.x+w+4 && p.y >= tp.y-fontPx-2 && p.y <= tp.y-fontPx+_hm.h+4) hit=i;
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
      } else if (s.tool==='rect-fill'){
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
      } else if (s.tool==='circle'){
        var cx=(x1+x2)/2, cy=(y1+y2)/2;
        var rx=Math.abs(x2-x1)/2, ry=Math.abs(y2-y1)/2;
        // ellipse via canvas API; fall back to circle if not supported
        if (ctx.ellipse){ ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); }
        else { ctx.arc(cx,cy,Math.max(rx,ry),0,Math.PI*2); }
        ctx.stroke();
      } else if (s.tool==='circle-fill'){
        var cxf=(x1+x2)/2, cyf=(y1+y2)/2;
        var rxf=Math.abs(x2-x1)/2, ryf=Math.abs(y2-y1)/2;
        ctx.fillStyle = s.color;
        if (ctx.ellipse){ ctx.ellipse(cxf,cyf,rxf,ryf,0,0,Math.PI*2); }
        else { ctx.arc(cxf,cyf,Math.max(rxf,ryf),0,Math.PI*2); }
        ctx.fill();
      } else if (s.tool==='triangle'){
        // Isosceles triangle inscribed in the bounding box: apex top-center, base along bottom.
        var tl=Math.min(x1,x2), tr=Math.max(x1,x2), tt=Math.min(y1,y2), tb=Math.max(y1,y2);
        ctx.moveTo((tl+tr)/2, tt);
        ctx.lineTo(tr, tb);
        ctx.lineTo(tl, tb);
        ctx.closePath();
        ctx.stroke();
      } else if (s.tool==='cloud'){
        this._cloudPath(ctx, Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
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

    // S339 — revision-cloud path: scalloped arcs around the bounding box. Builds a
    // closed path the caller can stroke. Bump radius scales with the box so small
    // clouds still read as clouds. Uses arc only (no quadraticCurveTo, per canon).
    _cloudPath: function(ctx, x, y, w, h){
      if (w < 4 || h < 4){ ctx.rect(x,y,w,h); return; }
      var bump = Math.max(6, Math.min(w, h) * 0.16);
      var perim = 2*(w+h);
      var pts = [];
      function edge(x0,y0,x1,y1,count){ for(var i=0;i<count;i++){ var t=i/count; pts.push([x0+(x1-x0)*t, y0+(y1-y0)*t]); } }
      var nTop=Math.max(2,Math.round(w/(bump*1.6))), nRight=Math.max(2,Math.round(h/(bump*1.6)));
      edge(x,y, x+w,y, nTop);
      edge(x+w,y, x+w,y+h, nRight);
      edge(x+w,y+h, x,y+h, nTop);
      edge(x,y+h, x,y, nRight);
      for (var i=0;i<pts.length;i++){
        var p=pts[i];
        ctx.moveTo(p[0]+bump, p[1]);
        ctx.arc(p[0], p[1], bump, 0, Math.PI*2);
      }
    },

    // Inline text input overlay — commits on Enter/blur, cancels on Escape
    // S339 (Mark): TEXT CHIP. Replaces the old transparent borderless field (which
    // was invisible in daylight — "text appeared at random"). Now a visible compact
    // editor: fixed top control row (grab · − size + · ↵ newline · ✕ · ✓) over an
    // auto-expanding multi-line textarea. ✓ is the only commit (Enter/↵ = newline).
    // S339 (Mark): TEXT — on-photo editable box driven by a docked bar (lightbox owns
    // the bar). The box sits in screen space over the canvas; controls (size, text
    // colour, bg colour, newline, ✓/✕) live in the bar so nothing floats/covers the
    // photo on mobile. Backing pill shows ONLY while editing; committed text shows the
    // CHOSEN bg colour (default 'none' = clean). Sticky colours persist via
    // self._lastTextColor / self._lastTextBg. editId re-opens an existing text stroke.
    // Returns a controller object so the lightbox bar can drive it.
    _SIZE_STEPS: [12,14,16,20,24,28,32,40,48],
    _PALETTE: ['#A85959','#E74C3C','#FF9800','#F1C40F','#2196F3','#1565C0','#4CAF50','#9C27B0','#1C2333','#607D8B','#FFFFFF'],
    _textPrompt: function(p, _createEv, editId){
      var self = this;
      if (self._textInput) { try { self._textInput.parentNode.removeChild(self._textInput); } catch(_){} self._textInput=null; }

      var editStroke = editId ? self._findStroke(editId) : null;
      var startText  = editStroke ? (editStroke.text||'') : '';
      var startSizePx= (editStroke ? (editStroke.size||3) : (self.size||3)) * 4;
      var startColor = editStroke ? (editStroke.color||self._lastTextColor||self.color) : (self._lastTextColor||self.color);
      var startBg    = editStroke ? (editStroke.bg||'none') : (self._lastTextBg||'none');
      if (editStroke){ editStroke._editing = true; self._render(); }

      var r = self.canvas.getBoundingClientRect();
      var scaleX = r.width  / self.w, scaleY = r.height / self.h;
      var anchor = editStroke ? { x: editStroke.pts[0].x, y: editStroke.pts[0].y } : { x: p.x, y: p.y };
      var sizePx = startSizePx;
      var curColor = startColor, curBg = startBg;

      // on-photo editable box (no toolbar; the lightbox docked bar drives it)
      var box = document.createElement('div');
      box.className = 'mk-text-box';
      box.contentEditable = 'true';
      box.spellcheck = false;
      box.setAttribute('data-empty-placeholder','Type\u2026');
      document.body.appendChild(box);
      self._textInput = box;
      if (startText){ box.textContent = startText; }

      function screenFont(){ return sizePx * scaleY; }
      function positionBox(){
        // place box so its first text line baseline ~ anchor point
        var sf = screenFont();
        var sx = r.left + anchor.x * scaleX;
        var sy = r.top  + anchor.y * scaleY;
        box.style.left = Math.max(2, sx - 4) + 'px';
        box.style.top  = Math.max(2, sy - sf) + 'px';
      }
      function applyStyle(){
        box.style.fontSize = screenFont() + 'px';
        box.style.color = curColor;
        // editing backing: always a faint dark pill while typing (readability),
        // regardless of chosen bg. The chosen bg shows on the COMMITTED stroke.
        box.style.background = 'rgba(20,18,24,.55)';
        positionBox();
      }
      applyStyle();
      box.focus();
      requestAnimationFrame(function(){ try{ box.focus(); placeCaretEnd(); }catch(_){} });
      function placeCaretEnd(){ try{ var rg=document.createRange(); rg.selectNodeContents(box); rg.collapse(false);
        var s=window.getSelection(); s.removeAllRanges(); s.addRange(rg);}catch(_){} }

      var resolved = false;
      function cleanup(){
        if (box.parentNode) box.parentNode.removeChild(box);
        if (self._textInput === box) self._textInput = null;
        if (editStroke){ delete editStroke._editing; }
        if (self._onTextEnd) self._onTextEnd();   // tell lightbox to restore tool row
      }
      function commit(){
        if (resolved) return; resolved = true;
        var r2 = self.canvas.getBoundingClientRect();
        var br = box.getBoundingClientRect();
        var sx2 = r2.width/self.w, sy2 = r2.height/self.h;
        var ascent = sizePx * sy2;
        var lx = (br.left + 4 - r2.left) / sx2;
        var ly = (br.top  + 0 - r2.top + ascent) / sy2;
        var v = (box.innerText || box.textContent || '').replace(/[ \t]+$/,'').replace(/\n+$/,'');
        var newSize = sizePx/4;
        // persist sticky colours
        self._lastTextColor = curColor; self._lastTextBg = curBg;
        if (editStroke){
          if (!v.trim()){ var ix=self.strokes.indexOf(editStroke); if(ix>=0) self.strokes.splice(ix,1); }
          else { editStroke.text=v; editStroke.size=newSize; editStroke.color=curColor; editStroke.bg=curBg; editStroke.pts[0]={x:lx,y:ly}; }
          delete editStroke._editing;
          self.redoStack=[]; if(self._onDirty) self._onDirty(); self._render(); cleanup(); return;
        }
        if (v.trim()){
          self.strokes.push({ id:self._uid(), tool:'text', pts:[{x:lx,y:ly}], text:v, color:curColor, bg:curBg, size:newSize, opacity:self.opacity });
          self.redoStack=[]; if(self._onDirty) self._onDirty();
        }
        self._render(); cleanup();
      }
      function cancel(){ if (resolved) return; resolved = true; self._render(); cleanup(); }

      box.addEventListener('keydown', function(e){
        if (e.key === 'Escape'){ e.preventDefault(); cancel(); }
        e.stopPropagation();   // Enter = newline (contentEditable default)
      });
      // NOTE: do NOT reposition the box on 'input'. The box's top-left anchor never
      // changes as text grows (multi-line grows downward from the fixed top), so
      // re-running positionBox is a no-op on desktop but a BUG on mobile: once the
      // keyboard is open the visual viewport shifts the position:fixed origin, so
      // re-applying the (viewport-relative) top/left yanks the box off the tapped
      // spot on the first keystroke. Place once (applyStyle above) and leave it.

      // controller the lightbox docked bar drives
      var controller = {
        isActive: function(){ return !resolved; },
        getSize: function(){ return sizePx; },
        getColor: function(){ return curColor; },
        getBg: function(){ return curBg; },
        palette: self._PALETTE,
        stepSize: function(dir){
          var steps=self._SIZE_STEPS, i=0, best=1e9;
          for (var k=0;k<steps.length;k++){ var d=Math.abs(steps[k]-sizePx); if(d<best){best=d;i=k;} }
          i=Math.max(0,Math.min(steps.length-1,i+dir)); sizePx=steps[i]; applyStyle(); box.focus();
          return sizePx;
        },
        setColor: function(c){ curColor=c; self._lastTextColor=c; box.style.color=c; box.focus(); },
        setBg: function(c){ curBg=c; self._lastTextBg=c; box.focus(); },   // bg shows on commit
        insertNewline: function(){
          box.focus();
          try{ document.execCommand('insertLineBreak'); }catch(_){ document.execCommand('insertText',false,'\n'); }
          // no positionBox() — box top-left is fixed; recomputing it drifts on mobile.
        },
        commit: commit,
        cancel: cancel
      };
      self._textController = controller;
      if (self._onTextStart) self._onTextStart(controller);
      return controller;
    },

    // S339 (Mark): MULTI-LINE TEXT. Text may contain '\n'. One shared metric helper
    // so every bounds/hit/rotation site agrees on the box. Width = widest line,
    // height = lineCount * lineHeight. Returned in LOGICAL units (font = size*4).
    //   lineH = fontPx * 1.25 (matches the editor textarea line-height).
    // anchor pts[0] is the FIRST line's alphabetic baseline (unchanged from before),
    // so a single-line text measures identically to the old code.
    _LINE_H_FACTOR: 1.25,
    _textMetrics: function(s){
      var fs = (s.size||3) * 4;
      var lines = String(s.text||'').split('\n');
      var maxLen = 0;
      for (var i=0;i<lines.length;i++){ if (lines[i].length>maxLen) maxLen=lines[i].length; }
      var w = maxLen * fs * 0.55;
      var lineH = fs * this._LINE_H_FACTOR;
      var totalH = (lines.length>0 ? lines.length : 1) * lineH;
      return { fs:fs, lines:lines, w:w, lineH:lineH, h:totalH };
    },

    _drawText: function(ctx, s, sx, sy){
      sx = sx || 1; sy = sy || 1;
      var p = s.pts[0]; if (!p) return;
      var avg = (sx+sy)/2;
      var fontPx = (s.size||3) * 4 * avg;
      var lineHpx = fontPx * this._LINE_H_FACTOR;
      var lines = String(s.text||'').split('\n');
      // S339 (Mark): readable BACKING PILL — busy/colourful drawings made text blend
      // in. Draw a fixed dark translucent rounded rect (~70%) behind the text so the
      // ink stays legible regardless of what's underneath or the chosen text colour.
      ctx.font = '600 ' + fontPx + 'px Calibri, sans-serif';
      // S339 (Mark): per-text BACKGROUND. Committed text shows its chosen bg colour.
      // Default 'none' (or legacy undefined) → no pill (clean text). A colour → a
      // translucent rounded backing for readability over busy drawings.
      var bg = s.bg;
      if (bg && bg !== 'none'){
        var padX = fontPx*0.28, padY = fontPx*0.20;
        var maxW = 0;
        for (var w=0; w<lines.length; w++){ var lw = ctx.measureText(lines[w]).width; if (lw>maxW) maxW=lw; }
        var bx = p.x*sx - padX;
        var by = p.y*sy - fontPx - padY;
        var bw = maxW + padX*2;
        var bh = (lines.length*lineHpx) + padY*2 - (lineHpx - fontPx);
        var rad = Math.min(8*avg, bh/2);
        ctx.save();
        ctx.fillStyle = this._bgFill(bg);
        ctx.beginPath();
        if (ctx.roundRect){ ctx.roundRect(bx, by, bw, bh, rad); }
        else {
          ctx.moveTo(bx+rad,by); ctx.lineTo(bx+bw-rad,by); ctx.arcTo(bx+bw,by,bx+bw,by+rad,rad);
          ctx.lineTo(bx+bw,by+bh-rad); ctx.arcTo(bx+bw,by+bh,bx+bw-rad,by+bh,rad);
          ctx.lineTo(bx+rad,by+bh); ctx.arcTo(bx,by+bh,bx,by+bh-rad,rad);
          ctx.lineTo(bx,by+rad); ctx.arcTo(bx,by,bx+rad,by,rad);
        }
        ctx.fill();
        ctx.restore();
      }
      // text on top
      ctx.fillStyle = s.color;
      ctx.textBaseline = 'alphabetic';
      for (var i=0;i<lines.length;i++){
        ctx.fillText(lines[i], p.x*sx, p.y*sy + i*lineHpx);
      }
    },
    // translucent fill for a bg swatch colour (hex → rgba ~0.72)
    _bgFill: function(hex){
      if (!hex || hex==='none') return 'rgba(0,0,0,0)';
      var h=hex.replace('#',''); if(h.length===3){h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];}
      var rr=parseInt(h.slice(0,2),16), gg=parseInt(h.slice(2,4),16), bb=parseInt(h.slice(4,6),16);
      if (isNaN(rr)) return 'rgba(20,18,24,0.72)';
      return 'rgba('+rr+','+gg+','+bb+',0.78)';
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

    // ════════════════════════════════════════════════════════════════
    // SELECT ENGINE — ported from drawing viewer (markup.js ~1470-2570),
    // adapted to this engine's stroke model (pts[]/tool). Behaviour, handle
    // sizes, hit tolerances, and transform math are identical to the viewer.
    //   - pen/highlight: rotation BAKED into pts (points are the visual AABB)
    //   - shapes (line/rect/circle/arrow): store pts[0],pts[1] + rotation; render rotates around bbox center
    //   - text: store pts[0] + rotation; render rotates around visual center
    // ════════════════════════════════════════════════════════════════
    _findStroke: function(id){ for (var i=0;i<this.strokes.length;i++){ if (this.strokes[i].id===id) return this.strokes[i]; } return null; },

    // S339 — top-down hit-test for text marks (for double-tap-to-edit). Returns id or null.
    _hitTextAt: function(p){
      for (var i=this.strokes.length-1; i>=0; i--){
        var s=this.strokes[i]; if (s.tool!=='text') continue;
        var tp=s.pts[0]; if(!tp) continue;
        var m=this._textMetrics(s);
        var x1=tp.x-4, x2=tp.x+m.w+4, y1=tp.y-m.fs-2, y2=tp.y-m.fs+m.h+4;
        if (p.x>=x1 && p.x<=x2 && p.y>=y1 && p.y<=y2) return s.id;
      }
      return null;
    },

    _strokeBounds: function(s){
      if (s.tool === 'text'){
        var _m = this._textMetrics(s);
        var fs = _m.fs;
        var estW = _m.w;
        var p = s.pts[0];
        // pts[0] = first-line baseline. Box top sits one ascent above it (~fs),
        // box bottom drops by the remaining lines' height plus descent.
        var bx1=p.x, by1=p.y - fs, bx2=p.x + estW, by2=p.y - fs + _m.h + 4;
        var rot = s.rotation || 0;
        if (rot){
          var cxT=p.x + estW/2, cyT=(by1+by2)/2, ct=Math.cos(rot), stt=Math.sin(rot);
          var cs=[[bx1,by1],[bx2,by1],[bx2,by2],[bx1,by2]], xmn=Infinity,ymn=Infinity,xmx=-Infinity,ymx=-Infinity;
          for (var t=0;t<4;t++){ var dx=cs[t][0]-cxT, dy=cs[t][1]-cyT, rx=cxT+dx*ct-dy*stt, ry=cyT+dx*stt+dy*ct;
            if(rx<xmn)xmn=rx; if(ry<ymn)ymn=ry; if(rx>xmx)xmx=rx; if(ry>ymx)ymx=ry; }
          return {x1:xmn,y1:ymn,x2:xmx,y2:ymx};
        }
        return {x1:bx1,y1:by1,x2:bx2,y2:by2};
      }
      // pen/highlight: rotation baked into points → AABB of points is visual AABB
      if (s.tool === 'pen' || s.tool === 'highlight'){
        var xs=s.pts.map(function(p){return p.x;}), ys=s.pts.map(function(p){return p.y;});
        return {x1:Math.min.apply(null,xs),y1:Math.min.apply(null,ys),x2:Math.max.apply(null,xs),y2:Math.max.apply(null,ys)};
      }
      // shapes: pts[0],pts[1] un-rotated + rotation angle
      var a=s.pts[0], b=s.pts[1]; if (!a||!b) return null;
      var x1=Math.min(a.x,b.x), y1=Math.min(a.y,b.y), x2=Math.max(a.x,b.x), y2=Math.max(a.y,b.y);
      var r=s.rotation||0;
      if (r){
        var cx=(x1+x2)/2, cy=(y1+y2)/2, c=Math.cos(r), sn=Math.sin(r);
        var cor=[[x1,y1],[x2,y1],[x2,y2],[x1,y2]], mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
        for (var i=0;i<4;i++){ var ddx=cor[i][0]-cx, ddy=cor[i][1]-cy, rrx=cx+ddx*c-ddy*sn, rry=cy+ddx*sn+ddy*c;
          if(rrx<mnx)mnx=rrx; if(rry<mny)mny=rry; if(rrx>mxx)mxx=rrx; if(rry>mxy)mxy=rry; }
        return {x1:mnx,y1:mny,x2:mxx,y2:mxy};
      }
      return {x1:x1,y1:y1,x2:x2,y2:y2};
    },

    _groupBounds: function(){
      var x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity, self=this;
      this._selectedIds.forEach(function(id){
        var s=self._findStroke(id); if(!s) return; var b=self._strokeBounds(s); if(!b) return;
        if(b.x1<x1)x1=b.x1; if(b.y1<y1)y1=b.y1; if(b.x2>x2)x2=b.x2; if(b.y2>y2)y2=b.y2;
      });
      if (x1===Infinity) return null;
      return {x1:x1,y1:y1,x2:x2,y2:y2};
    },

    _hitStroke: function(p){
      for (var i=this.strokes.length-1;i>=0;i--){
        var b=this._strokeBounds(this.strokes[i]);
        if (b && p.x>=b.x1-6 && p.x<=b.x2+6 && p.y>=b.y1-6 && p.y<=b.y2+6) return this.strokes[i];
      }
      return null;
    },

    _hitResize: function(p){
      var b=this._groupBounds(); if(!b) return -1;
      var pad=6, bx=b.x1-pad, by=b.y1-pad, bw=b.x2-b.x1+pad*2, bh=b.y2-b.y1+pad*2;
      var cor=[[bx,by],[bx+bw,by],[bx,by+bh],[bx+bw,by+bh]];
      for (var i=0;i<4;i++){ if (Math.abs(p.x-cor[i][0])<=11 && Math.abs(p.y-cor[i][1])<=11) return i; }
      return -1;
    },
    _hitRotate: function(p){
      var b=this._groupBounds(); if(!b) return false;
      var pad=6, rcx=(b.x1+b.x2)/2, rcy=b.y1-pad-24;
      return Math.sqrt((p.x-rcx)*(p.x-rcx)+(p.y-rcy)*(p.y-rcy)) <= 14;
    },
    _hitDelete: function(p){
      var b=this._groupBounds(); if(!b) return false;
      var pad=6, dx=b.x2+pad+4+8, dy=b.y1-pad-14+8;
      return Math.sqrt((p.x-dx)*(p.x-dx)+(p.y-dy)*(p.y-dy)) <= 12;
    },
    // S339 — copy handle: filled circle centered below the bottom edge, mirroring
    // the rotate handle's top-center stem. Generous radius on coarse pointers.
    _hitCopy: function(p){
      var b=this._groupBounds(); if(!b) return false;
      var pad=6, ccx=(b.x1+b.x2)/2, ccy=b.y2+pad+34;
      var coarse=(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
      var rad=coarse?20:14;
      return Math.sqrt((p.x-ccx)*(p.x-ccx)+(p.y-ccy)*(p.y-ccy)) <= rad;
    },

    _selectDown: function(p, ev){
      // copy handle (bottom-center) — must be tested BEFORE delete/resize/rotate/move
      // so tapping it duplicates the selection instead of starting a drag. S339.
      if (this._selectedIds.length && this._hitCopy(p)){
        this._cloneSelection(); return;
      }
      // delete button
      if (this._selectedIds.length && this._hitDelete(p)){
        var sel=this._selectedIds; this.strokes=this.strokes.filter(function(s){return sel.indexOf(s.id)===-1;});
        this._selectedIds=[]; this.redoStack=[]; this._render(); if(this._onDirty)this._onDirty(); this._emitSel(); return;
      }
      // resize corner
      if (this._selectedIds.length){
        var corner=this._hitResize(p);
        if (corner>=0){
          var gb=this._groupBounds();
          var anchors=[[gb.x2,gb.y2],[gb.x1,gb.y2],[gb.x2,gb.y1],[gb.x1,gb.y1]];
          this._dragState={ type:'resize', anchorX:anchors[corner][0], anchorY:anchors[corner][1],
            origBounds:{x1:gb.x1,y1:gb.y1,x2:gb.x2,y2:gb.y2},
            orig:JSON.parse(JSON.stringify(this._selectedIds.map(this._findStroke.bind(this)).filter(Boolean))) };
          return;
        }
        // rotate handle
        if (this._hitRotate(p)){
          var gb2=this._groupBounds(), cx=(gb2.x1+gb2.x2)/2, cy=(gb2.y1+gb2.y2)/2;
          this._dragState={ type:'rotate', centerX:cx, centerY:cy, startAngle:Math.atan2(p.y-cy,p.x-cx),
            orig:JSON.parse(JSON.stringify(this._selectedIds.map(this._findStroke.bind(this)).filter(Boolean))) };
          return;
        }
      }
      var hit=this._hitStroke(p);
      var multi=!!(ev&&(ev.ctrlKey||ev.metaKey));
      // S339 — TAP-SELECT sub-mode: each tap toggles an individual pick (own box);
      // committed selection stays empty until ✓. Empty taps ignored (sticky).
      if (this._selectSub==='tap'){
        if (hit){
          var pix=this._pickIds.indexOf(hit.id);
          if (pix!==-1) this._pickIds.splice(pix,1); else this._pickIds.push(hit.id);
          this._selectedIds=[];           // tap builds pick, not committed group, until ✓
          this._dragState=null; this._render(); this._emitSel();
        }
        // empty tap → sticky, do nothing
        return;
      }
      // If a (multi-)selection exists and the press is INSIDE the group bounds —
      // even in empty space between strokes — start a group move rather than
      // clearing and rubber-banding. Without this, dragging a rubber-band group
      // only worked when you pressed exactly on one stroke's tight hit-box.
      if (!multi && this._selectedIds.length > 1){
        var gbm=this._groupBounds();
        if (gbm && p.x>=gbm.x1-6 && p.x<=gbm.x2+6 && p.y>=gbm.y1-6 && p.y<=gbm.y2+6){
          this._dragState={ type:'move', startX:p.x, startY:p.y, moved:false };
          return;
        }
      }
      // S339 — RUBBER-BAND sub-mode: hit-in-selection = move; press on empty arms a
      // rubber band that only commits if it MOVES past threshold (sticky tap).
      if (this._selectSub==='rubber'){
        if (multi && hit){
          var rix=this._selectedIds.indexOf(hit.id);
          if (rix!==-1) this._selectedIds.splice(rix,1); else this._selectedIds.push(hit.id);
          this._dragState=null; this._render(); this._emitSel(); return;
        }
        if (hit && this._selectedIds.indexOf(hit.id)!==-1){
          this._dragState={ type:'move', startX:p.x, startY:p.y, moved:false }; return;
        }
        if (hit){
          this._selectedIds=[hit.id];
          this._dragState={ type:'move', startX:p.x, startY:p.y, moved:false };
          this._render(); this._emitSel(); return;
        }
        // empty press → arm rubber band; a stationary tap = sticky (no clear in _selectUp)
        this._rubberBand={x1:p.x,y1:p.y,x2:p.x,y2:p.y};
        this._dragState={type:'rubberband'}; this._render(); return;
      }
      // S339 — SINGLE sub-mode (default): tap a mark = select just it; empty = sticky.
      if (hit){
        if (multi){
          var ix=this._selectedIds.indexOf(hit.id);
          if (ix!==-1) this._selectedIds.splice(ix,1); else this._selectedIds.push(hit.id);
          this._dragState=null; this._render(); this._emitSel(); return;
        }
        if (this._selectedIds.indexOf(hit.id)===-1) this._selectedIds=[hit.id];
        this._dragState={ type:'move', startX:p.x, startY:p.y, moved:false };
        this._render(); this._emitSel();
      }
      // empty tap in single → sticky, do nothing
    },

    _selectMove: function(p){
      var ds=this._dragState; if(!ds) return; var self=this;
      if (ds.type==='rubberband'){ this._rubberBand.x2=p.x; this._rubberBand.y2=p.y; this._render(); return; }
      if (ds.type==='move'){
        var dx=p.x-ds.startX, dy=p.y-ds.startY;
        if (Math.abs(dx)<2 && Math.abs(dy)<2 && !ds.moved) return;
        ds.moved=true;
        this._selectedIds.forEach(function(id){ var s=self._findStroke(id); if(!s)return;
          s.pts.forEach(function(pt){ pt.x+=dx; pt.y+=dy; }); });
        ds.startX=p.x; ds.startY=p.y; this._render(); return;
      }
      if (ds.type==='resize'){
        var ob=ds.origBounds, ax=ds.anchorX, ay=ds.anchorY, ow=ob.x2-ob.x1, oh=ob.y2-ob.y1;
        if (ow<1||oh<1) return;
        var sx=Math.abs(p.x-ax)/ow, sy=Math.abs(p.y-ay)/oh, s=Math.max(0.1,(sx+sy)/2);
        ds.orig.forEach(function(o){ var st=self._findStroke(o.id); if(!st)return;
          st.pts=o.pts.map(function(pt){ return {x:ax+(pt.x-ax)*s, y:ay+(pt.y-ay)*s}; });
          if (o.size) st.size=Math.max(1, o.size*s);
        });
        this._render(); return;
      }
      if (ds.type==='rotate'){
        var cx=ds.centerX, cy=ds.centerY, cur=Math.atan2(p.y-cy,p.x-cx), dA=cur-ds.startAngle;
        var cs=Math.cos(dA), sn=Math.sin(dA);
        function rot(px,py){ return {x:cx+(px-cx)*cs-(py-cy)*sn, y:cy+(px-cx)*sn+(py-cy)*cs}; }
        ds.orig.forEach(function(o){ var st=self._findStroke(o.id); if(!st)return;
          if (o.tool==='pen'||o.tool==='highlight'){
            st.pts=o.pts.map(function(pt){ return rot(pt.x,pt.y); });          // bake into points
          } else if (o.tool==='text'){
            var _rm=this._textMetrics(o), fs=_rm.fs, estW=_rm.w;
            var ocx=o.pts[0].x+estW/2, ocy=o.pts[0].y-fs+_rm.h/2, nc=rot(ocx,ocy);
            st.pts[0]={x:nc.x-estW/2, y:nc.y-_rm.h/2+fs};
            st.rotation=(o.rotation||0)+dA;
          } else {
            var a=o.pts[0], b=o.pts[1];
            var ocxs=(a.x+b.x)/2, ocys=(a.y+b.y)/2, ncs=rot(ocxs,ocys);
            var hw=Math.abs(b.x-a.x)/2, hh=Math.abs(b.y-a.y)/2;
            st.pts[0]={x:ncs.x-hw, y:ncs.y-hh}; st.pts[1]={x:ncs.x+hw, y:ncs.y+hh};
            st.rotation=(o.rotation||0)+dA;
          }
        });
        this._render(); return;
      }
    },

    _selectUp: function(){
      var ds=this._dragState; if(!ds) return; var self=this;
      if (ds.type==='rubberband' && this._rubberBand){
        var r=this._rubberBand, rx1=Math.min(r.x1,r.x2), ry1=Math.min(r.y1,r.y2), rx2=Math.max(r.x1,r.x2), ry2=Math.max(r.y1,r.y2);
        // S339 — only a REAL drag (>4px) selects; a stationary empty tap is sticky
        // (selection unchanged), never clears. Removes the old clear-on-empty bug.
        if (Math.abs(rx2-rx1)>4 || Math.abs(ry2-ry1)>4){
          var hits=[]; this.strokes.forEach(function(s){ var b=self._strokeBounds(s); if(!b)return;
            if (b.x2>=rx1 && b.x1<=rx2 && b.y2>=ry1 && b.y1<=ry2) hits.push(s.id); });
          if (hits.length) this._selectedIds=hits;
        }
        this._rubberBand=null;
      }
      if ((ds.type==='move'||ds.type==='resize'||ds.type==='rotate') && (ds.moved!==false)){
        if (this._onDirty) this._onDirty();
      }
      this._dragState=null; this._render(); this._emitSel();
    },

    // S339 — duplicate the current selection. Each clone gets a fresh id, a deep
    // copy of its pts[] (no aliasing), every coord offset by (+28,+28), and all
    // visual fields copied verbatim. The new strokes become the active selection
    // so the user can immediately drag-to-place and chain another copy.
    // NOTE: this engine's undo is a per-stroke LIFO (strokes.pop()), so a
    // multi-select copy that pushes N strokes undoes one stroke per Undo press.
    // Single-object copy (the common case) undoes cleanly in one press.
    _cloneSelection: function(){
      if (!this._selectedIds || !this._selectedIds.length) return;
      var self=this, OFF=28, newIds=[];
      this._selectedIds.forEach(function(id){
        var s=self._findStroke(id); if(!s) return;
        var c={ id:self._uid(), tool:s.tool, color:s.color, size:s.size,
                opacity:s.opacity, text:s.text, rotation:s.rotation };
        // deep-copy + offset the only coordinate array this engine uses
        c.pts = (s.pts||[]).map(function(pt){ return { x:pt.x+OFF, y:pt.y+OFF }; });
        // drop undefined optional fields so cloned objects stay clean
        if (c.text===undefined) delete c.text;
        if (c.rotation===undefined) delete c.rotation;
        self.strokes.push(c); newIds.push(c.id);
      });
      if (!newIds.length) return;
      this._selectedIds = newIds;
      this.redoStack = [];           // a new action invalidates redo (engine canon)
      this._render();
      if (this._onDirty) this._onDirty();
      this._emitSel();
    },
    _drawSelection: function(ctx){
      // S339 — tap-mode individual pick boxes (pre-✓ group): green dashed + ✓ badge.
      if (this._pickIds && this._pickIds.length){
        var self=this;
        this._pickIds.forEach(function(id){
          var s=self._findStroke(id); if(!s) return;
          var b=self._strokeBounds(s); if(!b) return;
          ctx.save();
          ctx.setLineDash([4,3]); ctx.strokeStyle='#3FD08A'; ctx.lineWidth=2; ctx.globalAlpha=1;
          ctx.strokeRect(b.x1-5,b.y1-5,b.x2-b.x1+10,b.y2-b.y1+10);
          ctx.setLineDash([]);
          ctx.fillStyle='#3FD08A'; ctx.beginPath(); ctx.arc(b.x2+5,b.y1-5,7,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#0b2018'; ctx.font='bold 10px Calibri,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText('\u2713', b.x2+5, b.y1-4);
          ctx.restore();
        });
      }
      if (this._rubberBand){
        var r=this._rubberBand;
        ctx.save(); ctx.setLineDash([4,3]); ctx.strokeStyle='#2196F3'; ctx.lineWidth=1; ctx.globalAlpha=1;
        ctx.strokeRect(Math.min(r.x1,r.x2),Math.min(r.y1,r.y2),Math.abs(r.x2-r.x1),Math.abs(r.y2-r.y1));
        ctx.setLineDash([]); ctx.restore();
      }
      var b=this._groupBounds(); if(!b) return;
      var pad=6, bx=b.x1-pad, by=b.y1-pad, bw=b.x2-b.x1+pad*2, bh=b.y2-b.y1+pad*2;
      ctx.save();
      ctx.setLineDash([5,4]); ctx.strokeStyle='#2196F3'; ctx.lineWidth=2; ctx.globalAlpha=1;
      ctx.strokeRect(bx,by,bw,bh); ctx.setLineDash([]);
      var hs=11; ctx.fillStyle='white'; ctx.strokeStyle='#2196F3'; ctx.lineWidth=1.5;
      [[bx,by],[bx+bw,by],[bx,by+bh],[bx+bw,by+bh]].forEach(function(p){
        ctx.fillRect(p[0]-hs/2,p[1]-hs/2,hs,hs); ctx.strokeRect(p[0]-hs/2,p[1]-hs/2,hs,hs); });
      var rcx=bx+bw/2, rcy=by-24;
      ctx.beginPath(); ctx.moveTo(bx+bw/2,by); ctx.lineTo(rcx,rcy+9); ctx.strokeStyle='#2196F3'; ctx.lineWidth=1; ctx.stroke();
      ctx.beginPath(); ctx.arc(rcx,rcy,9,0,Math.PI*2); ctx.fillStyle='white'; ctx.fill(); ctx.strokeStyle='#2196F3'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(rcx,rcy,5,-0.3,Math.PI*1.4); ctx.strokeStyle='#2196F3'; ctx.lineWidth=1.2; ctx.stroke();
      var dx=bx+bw+4, dy=by-14;
      ctx.fillStyle='#E53E3E'; ctx.beginPath(); ctx.arc(dx+8,dy+8,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='white'; ctx.font='bold 12px Calibri,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('\u2715', dx+8, dy+8);
      // S339 — copy handle: bottom-center, stem mirrors the rotate handle's stem
      var ccx=bx+bw/2, ccy=by+bh+34;
      ctx.beginPath(); ctx.moveTo(bx+bw/2,by+bh); ctx.lineTo(ccx,ccy-9); ctx.strokeStyle='#2196F3'; ctx.lineWidth=1; ctx.stroke();
      ctx.beginPath(); ctx.arc(ccx,ccy,9,0,Math.PI*2); ctx.fillStyle='#1565C0'; ctx.fill();
      ctx.strokeStyle='#1565C0'; ctx.lineWidth=1.5; ctx.stroke();
      // two-rect copy glyph (white): back rect offset up-left, front rect down-right
      ctx.strokeStyle='white'; ctx.lineWidth=1.3;
      ctx.strokeRect(ccx-4, ccy-4, 5, 6);
      ctx.fillStyle='#1565C0'; ctx.fillRect(ccx-1, ccy-1, 5, 6);
      ctx.strokeRect(ccx-1, ccy-1, 5, 6);
      ctx.restore();
    },

    // Public: delete current selection (Delete key from lightbox)
    deleteSelection: function(){
      if (!this._selectedIds || !this._selectedIds.length) return;
      var sel = this._selectedIds;
      this.strokes = this.strokes.filter(function(s){ return sel.indexOf(s.id) === -1; });
      this._selectedIds = []; this.redoStack = [];
      this._render(); if (this._onDirty) this._onDirty(); this._emitSel();
    },

    _render: function(){
      if (!this.ctx) return;
      var ctx = this.ctx;
      ctx.clearRect(0,0,this.w,this.h);
      // Pass 1: highlights via offscreen composite, GROUPED by opacity so each
      // group composites once at hlAlpha*opacity (never stack — Diesel/markup.js rule).
      var hi = this.strokes.filter(function(s){return s.tool==='highlight';});
      if (this._curr && this._curr.tool==='highlight') hi = hi.concat([this._curr]);
      if (hi.length){
        var groups = {};
        for (var gi=0; gi<hi.length; gi++){
          var op = (hi[gi].opacity!=null)?hi[gi].opacity:1;
          var key = String(op);
          (groups[key] || (groups[key] = {opacity:op, list:[]})).list.push(hi[gi]);
        }
        for (var gk in groups){
          if (!groups.hasOwnProperty(gk)) continue;
          var grp = groups[gk];
          var off = document.createElement('canvas');
          off.width = Math.max(1, Math.round(this.w*this.dpr));
          off.height= Math.max(1, Math.round(this.h*this.dpr));
          var oc = off.getContext('2d');
          oc.setTransform(this.dpr,0,0,this.dpr,0,0);
          for (var i=0;i<grp.list.length;i++){
            var s = grp.list[i];
            oc.lineCap='round'; oc.lineJoin='round';
            oc.strokeStyle = s.color; oc.lineWidth = (s.size||3)*4;
            oc.beginPath(); oc.moveTo(s.pts[0].x,s.pts[0].y);
            for (var j=1;j<s.pts.length;j++) oc.lineTo(s.pts[j].x,s.pts[j].y);
            oc.stroke();
          }
          ctx.save(); ctx.globalAlpha = this.hlAlpha * grp.opacity;
          ctx.setTransform(1,0,0,1,0,0);
          ctx.drawImage(off,0,0);
          ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
          ctx.restore();
        }
      }
      // Pass 2: pen strokes on top (per-object opacity)
      for (var k=0;k<this.strokes.length;k++){
        var st = this.strokes[k];
        if (st.tool==='pen'){ ctx.save(); ctx.globalAlpha = (st.opacity!=null)?st.opacity:1; this._strokePath(ctx, st); ctx.restore(); }
      }
      if (this._curr && this._curr.tool==='pen'){ ctx.save(); ctx.globalAlpha=(this._curr.opacity!=null)?this._curr.opacity:1; this._strokePath(ctx, this._curr); ctx.restore(); }
      // Pass 3: shapes (per-object opacity + rotation)
      for (var m=0;m<this.strokes.length;m++){
        var sh = this.strokes[m];
        if (isShapeTool(sh.tool)) this._drawShapeR(ctx, sh);
      }
      if (this._curr && isShapeTool(this._curr.tool)) this._drawShapeR(ctx, this._curr);
      // Pass 4: text labels (per-object opacity + rotation)
      for (var n=0;n<this.strokes.length;n++){
        var tx = this.strokes[n];
        if (tx.tool==='text') this._drawTextR(ctx, tx);
      }
      // Pass 5: selection overlay (select mode only)
      if (this.tool === 'select') this._drawSelection(ctx);
    },

    // Wrap shape draw with opacity + rotation about bbox center (screen render only, sx=sy=1)
    _drawShapeR: function(ctx, s){
      ctx.save();
      ctx.globalAlpha = (s.opacity!=null)?s.opacity:1;
      if (s.rotation){
        var a=s.pts[0], b=s.pts[1];
        var cx=((a.x+b.x)/2), cy=((a.y+b.y)/2);
        ctx.translate(cx,cy); ctx.rotate(s.rotation); ctx.translate(-cx,-cy);
      }
      this._drawShape(ctx, s);
      ctx.restore();
    },
    // Wrap text draw with opacity + rotation about visual center
    _drawTextR: function(ctx, s){
      if (s._editing) return;   // S339: hidden on canvas while open in the edit chip
      ctx.save();
      ctx.globalAlpha = (s.opacity!=null)?s.opacity:1;
      if (s.rotation){
        var _sm=this._textMetrics(s), fs=_sm.fs, estW=_sm.w;
        var cx=s.pts[0].x+estW/2, cy=s.pts[0].y-fs+_sm.h/2;
        ctx.translate(cx,cy); ctx.rotate(s.rotation); ctx.translate(-cx,-cy);
      }
      this._drawText(ctx, s);
      ctx.restore();
    },

    isDirty: function(){ return this.strokes.length > 0; },

    // True only if strokes differ from what was loaded at attach (a real edit).
    // Used so reopening a saved photo and closing it WITHOUT changes doesn't
    // re-flatten/re-upload an identical marked image.
    hasChangesSinceAttach: function(){
      return JSON.stringify(this.strokes) !== (this._attachSig || '[]');
    },

    undo: function(){
      if (this._shapePending){ this._shapePending = null; this._curr = null; this._render(); return; }
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
      this.strokes = []; this.redoStack = []; this._shapePending = null; this._curr = null; this._render();
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
          var savg = (sx+sy)/2;
          // Highlights composite at natural size, GROUPED by opacity (never stack)
          var hi = self.strokes.filter(function(s){return s.tool==='highlight';});
          if (hi.length){
            var hgroups = {};
            hi.forEach(function(s){ var op=(s.opacity!=null)?s.opacity:1; (hgroups[String(op)]||(hgroups[String(op)]={opacity:op,list:[]})).list.push(s); });
            for (var hk in hgroups){ if(!hgroups.hasOwnProperty(hk)) continue; var hg=hgroups[hk];
              var off = document.createElement('canvas'); off.width=nw; off.height=nh;
              var hctx = off.getContext('2d'); hctx.lineCap='round'; hctx.lineJoin='round';
              hg.list.forEach(function(s){
                hctx.strokeStyle=s.color; hctx.lineWidth=(s.size||3)*4*savg;
                hctx.beginPath(); hctx.moveTo(s.pts[0].x*sx, s.pts[0].y*sy);
                for (var j=1;j<s.pts.length;j++) hctx.lineTo(s.pts[j].x*sx, s.pts[j].y*sy);
                hctx.stroke();
              });
              oc.save(); oc.globalAlpha = self.hlAlpha * hg.opacity; oc.drawImage(off,0,0); oc.restore();
            }
          }
          // Pen on top (per-object opacity)
          oc.lineCap='round'; oc.lineJoin='round';
          self.strokes.filter(function(s){return s.tool==='pen';}).forEach(function(s){
            oc.save(); oc.globalAlpha=(s.opacity!=null)?s.opacity:1;
            oc.strokeStyle=s.color; oc.lineWidth=s.size*savg;
            oc.beginPath(); oc.moveTo(s.pts[0].x*sx, s.pts[0].y*sy);
            for (var j=1;j<s.pts.length;j++) oc.lineTo(s.pts[j].x*sx, s.pts[j].y*sy);
            oc.stroke(); oc.restore();
          });
          // Shapes on top (per-object opacity + rotation about scaled bbox center)
          self.strokes.filter(function(s){return isShapeTool(s.tool);}).forEach(function(s){
            oc.save(); oc.globalAlpha=(s.opacity!=null)?s.opacity:1;
            if (s.rotation){ var a=s.pts[0],b=s.pts[1], cx=((a.x+b.x)/2)*sx, cy=((a.y+b.y)/2)*sy;
              oc.translate(cx,cy); oc.rotate(s.rotation); oc.translate(-cx,-cy); }
            self._drawShape(oc, s, sx, sy); oc.restore();
          });
          // Text labels on top (per-object opacity + rotation about scaled visual center)
          self.strokes.filter(function(s){return s.tool==='text';}).forEach(function(s){
            oc.save(); oc.globalAlpha=(s.opacity!=null)?s.opacity:1;
            if (s.rotation){ var _bm=this._textMetrics(s), fs=_bm.fs, estW=_bm.w;
              var cx=(s.pts[0].x+estW/2)*sx, cy=(s.pts[0].y-fs+_bm.h/2)*sy;
              oc.translate(cx,cy); oc.rotate(s.rotation); oc.translate(-cx,-cy); }
            self._drawText(oc, s, sx, sy); oc.restore();
          });
          out.toBlob(function(b){ b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/jpeg', 0.92);
        } catch(e){ reject(e); }
      });
    },

    // S347: paint strokes (already in TARGET-px coords matching the ctx canvas
    // W×H) onto an arbitrary 2D context. Mirrors saveBlob compositing at scale 1.
    // Used by the rotation bake to composite rotated markup onto rotated pixels.
    renderStrokesToContext: function(ctx, strokes, W, H){
      if (!ctx || !strokes || !strokes.length) return;
      var self = this;
      var hi = strokes.filter(function(s){return s.tool==='highlight';});
      if (hi.length){
        var hg = {};
        hi.forEach(function(s){ var op=(s.opacity!=null)?s.opacity:1; (hg[String(op)]||(hg[String(op)]={opacity:op,list:[]})).list.push(s); });
        for (var hk in hg){ if(!hg.hasOwnProperty(hk)) continue; var g=hg[hk];
          var off=document.createElement('canvas'); off.width=W; off.height=H;
          var hc=off.getContext('2d'); hc.lineCap='round'; hc.lineJoin='round';
          g.list.forEach(function(s){
            hc.strokeStyle=s.color; hc.lineWidth=(s.size||3)*4;
            hc.beginPath(); hc.moveTo(s.pts[0].x,s.pts[0].y);
            for (var j=1;j<s.pts.length;j++) hc.lineTo(s.pts[j].x,s.pts[j].y);
            hc.stroke();
          });
          ctx.save(); ctx.globalAlpha=self.hlAlpha*g.opacity; ctx.drawImage(off,0,0); ctx.restore();
        }
      }
      ctx.lineCap='round'; ctx.lineJoin='round';
      strokes.filter(function(s){return s.tool==='pen';}).forEach(function(s){
        ctx.save(); ctx.globalAlpha=(s.opacity!=null)?s.opacity:1;
        ctx.strokeStyle=s.color; ctx.lineWidth=s.size;
        ctx.beginPath(); ctx.moveTo(s.pts[0].x,s.pts[0].y);
        for (var j=1;j<s.pts.length;j++) ctx.lineTo(s.pts[j].x,s.pts[j].y);
        ctx.stroke(); ctx.restore();
      });
      strokes.filter(function(s){return isShapeTool(s.tool);}).forEach(function(s){
        ctx.save(); ctx.globalAlpha=(s.opacity!=null)?s.opacity:1;
        if (s.rotation){ var a=s.pts[0],b=s.pts[1], cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
          ctx.translate(cx,cy); ctx.rotate(s.rotation); ctx.translate(-cx,-cy); }
        self._drawShape(ctx, s, 1, 1); ctx.restore();
      });
      strokes.filter(function(s){return s.tool==='text';}).forEach(function(s){
        ctx.save(); ctx.globalAlpha=(s.opacity!=null)?s.opacity:1;
        if (s.rotation){ var _bm=self._textMetrics(s), fs=_bm.fs, estW=_bm.w;
          var cx=s.pts[0].x+estW/2, cy=s.pts[0].y-fs+_bm.h/2;
          ctx.translate(cx,cy); ctx.rotate(s.rotation); ctx.translate(-cx,-cy); }
        self._drawText(ctx, s, 1, 1); ctx.restore();
      });
    }
  };

  window.MarkupEngine = MarkupEngine;
})();
