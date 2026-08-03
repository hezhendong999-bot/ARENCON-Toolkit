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
    _hist: [], _histRedo: [],   // S459: unified action log — {t:'add'} per stroke push, {t:'erase',before,after} snapshots
    _drawing: false, _curr: null,
    _shapePending: null,                  // S329 #23 — in-progress two-click shape
    _origBlob: null,                      // pristine source for Revert
    _onDirty: null,
    // ── Select-mode state (ported from drawing viewer markup.js) ──
    selIds: [],                     // ids of selected strokes (group model)
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
      this.redoStack = []; this._hist = []; this._histRedo = [];
      // Baseline signature of the just-loaded strokes — lets the lightbox tell a
      // genuine edit from a no-op reopen (so closing without changes doesn't
      // needlessly re-flatten + re-upload). Updated by _onDirty edits via the getter.
      this._attachSig = JSON.stringify(this.strokes);
      this._rotation = 0;   // S352: lightbox sets this so pt() can un-rotate input
      // S479 (Mark 7.2): chrome-scale PARITY with the drawing viewer. The engine
      // sizes selection chrome as k = nw/rect.width. The DV supplies nw via a live
      // getter equal to _uiScale()*rect (S342: chrome is screen-constant zoomed
      // out, grows with zoom-in). This host used to pin nw = natural width, which
      // pins chrome at a constant 11 CSS px at EVERY zoom — correct math, tiny
      // handles. Same policy, expressed in this host's terms: nw = max(natural,
      // on-screen) — identical k to the DV at every zoom. Installed ONCE as a
      // getter (rect changes as the user pinches; a snapshot would go stale).
      // _fixNW's repair-write can never fire against it: the getter returns >= 1.
      if (!this._nwPolicyInstalled){
        this._nwPolicyInstalled = true;
        Object.defineProperty(this, 'nw', { configurable: true, get: function(){
          var r = (this.canvas && this.canvas.getBoundingClientRect().width) || 0;
          return Math.max(this.w || 1, r || 1);
        }});
        Object.defineProperty(this, 'nh', { configurable: true, get: function(){ return this.h || 1; }});
      }
      this._sync();   // sets w/h and _render()s — re-paints the reloaded strokes
      this._bind();
      window.addEventListener('resize', this._syncBound = this._sync.bind(this));
    },

    // S352: the lightbox tells the engine the photo's display rotation (0/90/180/270)
    // so pointer input can be inverted back into the canvas's logical frame. Without
    // this, getBoundingClientRect (axis-aligned) makes drawing land wrong when rotated.
    setRotation: function(deg){
      this._rotation = ((deg % 360) + 360) % 360;
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
      function _maskPts(st){ var out=[]; if(!st.eraserMask) return out;
        for (var q=0;q<st.eraserMask.length;q++){ var mp=st.eraserMask[q].points||[]; for (var r2=0;r2<mp.length;r2++) out.push(mp[r2]); }
        return out; }
      for (var a = 0; a < strokes.length; a++){
        var st = strokes[a]; if (!st.pts) continue;
        for (var b = 0; b < st.pts.length; b++){ st.pts[b].x /= w; st.pts[b].y /= h; }
        var _ma=_maskPts(st); for (var b2=0;b2<_ma.length;b2++){ _ma[b2].x /= w; _ma[b2].y /= h; }   // S459
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
          var _mk=_maskPts(k);
          for (var j2 = 0; j2 < _mk.length; j2++){ var p2=_mk[j2]; var nx2=1-p2.y, ny2=p2.x; p2.x=nx2; p2.y=ny2; }   // S459
          if (k.rotation != null) k.rotation += Math.PI / 2;
        }
        var t = w; w = h; h = t;
      }
      // re-expand into the new (swapped) frame
      for (var c = 0; c < strokes.length; c++){
        var sc = strokes[c]; if (!sc.pts) continue;
        for (var e = 0; e < sc.pts.length; e++){ sc.pts[e].x *= w; sc.pts[e].y *= h; }
        var _mc=_maskPts(sc); for (var e2=0;e2<_mc.length;e2++){ _mc[e2].x *= w; _mc[e2].y *= h; }   // S459
      }
      return { w: w, h: h };
    },

    detach: function(){
      if (this._textInput && this._textInput.parentNode) { try{ this._textInput.parentNode.removeChild(this._textInput); }catch(_){} this._textInput=null; }
      if (this._syncBound) { window.removeEventListener('resize', this._syncBound); this._syncBound = null; }
      if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
      this.canvas = null; this.ctx = null; this.host = null; this.img = null;
      this.strokes = []; this.redoStack = []; this._hist = []; this._histRedo = []; this._drawing = false; this._curr = null;
      this._shapePending = null;
      this.selIds = []; this._dragState = null; this._rubberBand = null;
      this._pickIds = [];
    },

    // Match overlay canvas to img's rendered box (CSS px) at device pixel resolution
    _sync: function(){
      if (!this.canvas || !this.img) return;
      // S358 SINGLE-TRANSFORM MODEL (proven in FRT_ROTATION_REBUILD_DEMO):
      // The markup canvas is now a CHILD of lb-img-wrap (the rotated/scaled/panned
      // frame), sitting directly over the photo at local (0,0). It therefore
      // INHERITS the wrap's single transform — rotate/zoom/pan apply to photo and
      // ink together, exactly once. No mirror, no frame-swap, no separate
      // un-rotation. The canvas logical frame == the photo's natural pixel box, so
      // strokes live in one fixed unrotated frame at all rotations. This removes
      // the three-stacked-correction stack that broke draw-at-90.
      var nw = this.img.naturalWidth  || this.img.width  || 1;
      var nh = this.img.naturalHeight || this.img.height || 1;
      this.canvas.style.left = '0px';
      this.canvas.style.top  = '0px';
      this.canvas.style.width  = nw + 'px';
      this.canvas.style.height = nh + 'px';
      this.dpr = window.devicePixelRatio || 1;
      this.w = nw; this.h = nh;
      this.canvas.width  = Math.max(1, Math.round(nw * this.dpr));
      this.canvas.height = Math.max(1, Math.round(nh * this.dpr));
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
      this._render();
    },

    setTool:  function(t){
      // S574: switching straight from trash to ANY other tool exits trash mode
      // cleanly — otherwise the forced tap sub-mode and the pick set leak into
      // the next tool. setTrashMode(false) restores the user's chosen sub.
      if (this._trashMode && t !== 'trash' && this.setTrashMode) this.setTrashMode(false);
      if (t === 'trash' && this.setTrashMode) this.setTrashMode(true);
      // S461t: leaving polyline mid-draw discards pending points AND the arm
      // flags — nothing may leak into another tool's press/move/release.
      if (this.tool === 'polyline' && t !== 'polyline'){
        if (this._polyTool && this._polyTool.count()) this._polyTool.cancel();
        this._polyDown = false; this._polyCursor = null;
      }
      this.tool = t; if (this._shapePending){ this._shapePending = null; this._curr = null; } if (t !== 'select'){ this.selIds = []; this._dragState = null; this._rubberBand = null; this._pickIds = []; if (this.ctx) this._render(); } else { this._pickIds = []; if (this.ctx) this._render(); } this._emitSel(); },

    setColor: function(c){ this.color = c; this._applyToSelection('color', c); },
    setSize:  function(s){ this.size = s; },
    setOpacity: function(v){ v = Math.max(0.1, Math.min(1, v)); this.opacity = v; this._applyToSelection('opacity', v); },

    // Live-apply colour/opacity to the current selection (so the bar edits selected strokes)
    _applyToSelection: function(field, val){
      if (!this.selIds || !this.selIds.length) return;
      var changed = false;
      for (var i=0;i<this.strokes.length;i++){
        if (this.selIds.indexOf(this.strokes[i].id) !== -1){ this.strokes[i][field] = val; changed = true; }
      }
      if (changed){ this._render(); if (this._onDirty) this._onDirty(); }
    },

    _bind: function(){
      var self = this, c = this.canvas;
      function pt(ev){
        var r = c.getBoundingClientRect();
        self._lastRectW = r.width;   // S482 [ported S487k]: zoom-under-stroke guard reads this
        var cx = (ev.touches ? ev.touches[0].clientX : ev.clientX);
        var cy = (ev.touches ? ev.touches[0].clientY : ev.clientY);
        // S358 SINGLE-TRANSFORM INVERSE (matches FRT_ROTATION_REBUILD_DEMO _toFrame):
        // The canvas is a child of lb-img-wrap, sized to the photo's natural frame
        // (self.w×self.h) and carried by the wrap's single rotate/scale transform.
        // getBoundingClientRect returns the axis-aligned box of that rotated+scaled
        // canvas. Recover the logical point by inverting ONE transform: translate to
        // box centre, un-rotate by -rotation, then map the unrotated on-screen box to
        // logical natural px. self.w/self.h are the FIXED unrotated frame now, so
        // there is nothing else to compensate for — a single clean inverse.
        var rot = self._rotation || 0;
        var bcx = r.left + r.width/2, bcy = r.top + r.height/2;
        var dx = cx - bcx, dy = cy - bcy;
        var a = -rot * Math.PI/180;
        var ux = dx*Math.cos(a) - dy*Math.sin(a);
        var uy = dx*Math.sin(a) + dy*Math.cos(a);
        // unrotated on-screen box dims (swap back on 90/270)
        var ubw = (rot%180!==0) ? r.height : r.width;
        var ubh = (rot%180!==0) ? r.width  : r.height;
        var sx0 = (ubw && self.w) ? (self.w / ubw) : 1;
        var sy0 = (ubh && self.h) ? (self.h / ubh) : 1;
        var lx = (ux + ubw/2) * sx0;
        var ly = (uy + ubh/2) * sy0;
        return { x: lx, y: ly };
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
        self._strokeRefW = self._lastRectW;   // S482 [ported S487k]: zoom-under-stroke guard baseline
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
        if (self.tool === 'trash'){ if (self._trashDown) self._trashDown(p); return; }   // S574 trash mode — tap-pick only, down-only
        if (self.tool === 'select'){ if (self._selDown) self._selDown(p, ev); return; }   // shared MarkupSelection (S459l)
        if (self.tool === 'eraser'){
          // S459 shared eraser (lib/ui/markupEraser.js): nothing deletes during the
          // drag — a grey path shows live; the erase applies once at pointer-up.
          // Width = (chip size)*3*uiScale = 3x a same-chip stroke's STORED width
          // (FRT stores sizes pre-scaled by uiScale, unlike Diesel — same 3:1 rule).
          if (window.MarkupEraser){
            self._drawing = true;
            var _eu = self._uiScale ? self._uiScale() : 1;
            self._curr = { tool:'eraser', pts:[p], _ew:(self.size||3)*3*_eu };
            self.redoStack = []; self._histRedo = [];
            return;
          }
          self._eraseAtLegacy(p); self._drawing = true; return;
        }
        if (isShape(self.tool)){
          // S339 — press-drag-release flow (was two-click). Start point on press;
          // pts[1] tracks the pointer during move; commit on up if dragged past
          // threshold. Matches pen/freehand and the signed-off demo.
          self._drawing = true;
          self._curr = { id:self._uid(), tool:self.tool, color:self.color, size:self.size*(self._uiScale?self._uiScale():1), opacity:self.opacity, pts:[p, {x:p.x,y:p.y}] };
          self.redoStack = [];
          self._render();
          return;
        }
        // S461t — POLYLINE: press arms; RELEASE places the point (the drawing
        // viewer's locked input model). Strictly gated on tool === 'polyline';
        // touches nothing shared. Points live in the shared module.
        if (self.tool === 'polyline'){
          self._polyDown = true;
          self._polyCursor = { x:p.x, y:p.y };
          self._render();
          return;
        }
        // Freehand (pen/highlight) — drag flow.
        self._drawing = true;
        self._curr = { id:self._uid(), tool:self.tool, color:self.color, size:self.size*(self._uiScale?self._uiScale():1), opacity:self.opacity, pts:[p, {x:p.x,y:p.y}] };
        self._curr.pts = [p]; // freehand uses growing array
        self.redoStack = [];
      }
      function move(ev){
        // S461t — polyline: the pending leg follows the pointer. Renders only
        // when there are placed points; never touches other tools' flow.
        if (self.tool === 'polyline'){
          // S329 parity: a second finger = pinch/pan, not drawing — disarm so
          // the release places NO point, and let the gesture bubble.
          if (ev.touches && ev.touches.length >= 2){ self._polyDown = false; return; }
          var _pm = pt(ev);
          self._polyCursor = { x:_pm.x, y:_pm.y };
          if (self._polyTool && self._polyTool.count()) self._render();
          return;
        }
        // S329: 2+ fingers — stop drawing, let the pinch/pan move bubble to lightbox.
        if (ev.touches && ev.touches.length >= 2){
          if (self._drawing || self._curr || self._shapePending){
            self._drawing = false; self._curr = null; self._shapePending = null;
            if (self.ctx) self._render();
          }
          return;
        }
        if (self.tool === 'trash'){ return; }   // S574: trash has no drags
        if (self.tool === 'select'){ if (self._dragState && self._selMove){ ev.preventDefault(); self._selMove(pt(ev)); } return; }
        if (!self._drawing) return;
        ev.preventDefault();
        var p = pt(ev);
        // S482 [ported S487k]: photo zoomed/resized UNDER an in-progress stroke.
        // A pinch whose 2nd finger lands on the surrounding viewer keeps zooming
        // the wrap while THIS canvas still reports one touch; points then map
        // against a moving rect and land displaced ("teleporting marks", Nasim
        // 7310.17). Abort the stroke, same cleanup as the 2-finger branch.
        if (self._strokeRefW && self._lastRectW && Math.abs(self._lastRectW - self._strokeRefW) > 0.5){
          self._drawing = false; self._curr = null; self._shapePending = null;
          self._render();
          return;
        }
        if (self.tool === 'eraser'){
          if (!(window.MarkupEraser && self._curr && self._curr.tool==='eraser')){ self._eraseAtLegacy(p); return; }
          // live drag path: fall through to the freehand append + render below
        }
        if (!self._curr) return;
        if (isShape(self._curr.tool)){
          // S339 — drag updates the second corner; render live rubber-band preview.
          self._curr.pts[1] = p;
          self._renderSoon();   // S482 [ported S487k]: frame-batched
          return;
        }
        var last = self._curr.pts[self._curr.pts.length-1];
        if (Math.abs(p.x-last.x) + Math.abs(p.y-last.y) < 1) return;
        self._curr.pts.push(p);
        self._renderSoon();   // S482 [ported S487k]: frame-batched — points append per event
      }
      function up(){
        if (self.tool === 'trash'){ return; }   // S574: trash has no drags
        if (self.tool === 'select'){ if (self._dragState && self._selUp) self._selUp(); return; }
        // S461t — POLYLINE: release places the point (module owns close-loop:
        // within 15 units of point 0 → snap + finish). Gated on tool + its own
        // down flag; consumed here, never read by another tool.
        if (self.tool === 'polyline'){
          if (!self._polyDown) return;
          self._polyDown = false;
          var _pu = self._poly();
          if (_pu && self._polyCursor) _pu.addPoint(self._polyCursor);
          return;
        }
        if (!self._drawing) return;
        self._drawing = false;
        if (self._curr && self._curr.tool==='eraser'){
          // S459: commit the erase — every stroke type gets an exact-path mask carve.
          var eps=self._curr.pts, ew=self._curr._ew||((self.size||3)*3);
          self._curr=null;
          if (window.MarkupEraser && eps.length>1){
            var _before=JSON.stringify(self.strokes);
            var res=window.MarkupEraser.applyEraser(self.strokes, eps, ew, {
              toCanonical:(window.MarkupTools&&window.MarkupTools.toCanonical)||null,
              halfWidth:function(hs){ return ((hs.size||3)*4)/2; },   // FRT highlight renders at size*4
              bbox:function(bs){ return self._localBBox(bs); },
              center:function(cs){ return self._rotCenter(cs); },
              rot:function(rs){ return rs.rotation||0; },             // shapes/text; pen/highlight bake -> 0
              newId:function(){ return self._uid(); }
            });
            if (res.changed){
              self.strokes=res.strokes;
              self._histPush({t:'erase', before:_before, after:JSON.stringify(self.strokes)});
              if (self._onDirty) self._onDirty();
            }
          }
          self._render(); return;
        }
        if (self._curr){
          var ok = false;
          if (isShape(self._curr.tool)){
            var a=self._curr.pts[0], b=self._curr.pts[1];
            ok = (Math.abs(a.x-b.x) + Math.abs(a.y-b.y)) > 4; // ignore taps
          } else {
            ok = self._curr.pts.length > 1;
          }
          if (ok){ self.strokes.push(self._curr); self._histPush({t:'add'}); if (self._onDirty) self._onDirty(); }
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

    _histPush: function(op){ this._hist.push(op); if (this._hist.length>80) this._hist.shift(); this._histRedo=[]; },
    // Unrotated/local-frame bbox + rotation center for the shared eraser's hit tests.
    _localBBox: function(s){
      if (s.tool==='text'){ var m=this._textMetrics(s), tp=s.pts[0];
        return {x1:tp.x-4, y1:tp.y-m.fs-2, x2:tp.x+m.w+4, y2:tp.y-m.fs+m.h+4}; }
      var xs=s.pts.map(function(p){return p.x;}), ys=s.pts.map(function(p){return p.y;});
      return {x1:Math.min.apply(null,xs), y1:Math.min.apply(null,ys),
              x2:Math.max.apply(null,xs), y2:Math.max.apply(null,ys)};
    },
    _rotCenter: function(s){
      if (s.tool==='text'){ var m=this._textMetrics(s);
        return {x:s.pts[0].x+m.w/2, y:s.pts[0].y-m.fs+m.h/2}; }   // same center _drawTextR rotates about
      var b=this._localBBox(s); return {x:(b.x1+b.x2)/2, y:(b.y1+b.y2)/2};
    },
    // S459: per-object offscreen destination-out carve (shared markupEraser model).
    // rotFn re-applies the SAME rotation transform the raw draw used, so masks stored
    // in the stroke's local frame carve in place and follow rotation. Base transform
    // copied from the destination ctx (dpr on screen, identity on save canvases).
    _drawMasked: function(ctx, s, sx, sy, rawFn, rotFn){
      sx=sx||1; sy=sy||1;
      var off=this._maskCanvas||(this._maskCanvas=document.createElement('canvas'));
      if (off.width!==ctx.canvas.width||off.height!==ctx.canvas.height){ off.width=ctx.canvas.width; off.height=ctx.canvas.height; }
      var oc=off.getContext('2d');
      oc.setTransform(1,0,0,1,0,0); oc.clearRect(0,0,off.width,off.height);
      try { var tr=ctx.getTransform(); oc.setTransform(tr); }
      catch(_){ if (ctx===this.ctx) oc.setTransform(this.dpr||1,0,0,this.dpr||1,0,0); }
      rawFn(oc);
      oc.save();
      if (rotFn) rotFn(oc);
      oc.globalCompositeOperation='destination-out';
      oc.lineCap='round'; oc.lineJoin='round'; oc.globalAlpha=1;
      for (var mi=0; mi<s.eraserMask.length; mi++){
        var m=s.eraserMask[mi]; if(!m.points||m.points.length<2) continue;
        oc.lineWidth=(m.size||2)*((sx+sy)/2);
        oc.beginPath(); oc.moveTo(m.points[0].x*sx, m.points[0].y*sy);
        for (var mj=1; mj<m.points.length; mj++) oc.lineTo(m.points[mj].x*sx, m.points[mj].y*sy);
        oc.stroke();
      }
      oc.restore();
      ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(off,0,0); ctx.restore();
    },
    _drawPenR: function(ctx, s){
      var self=this;
      if (s.eraserMask && s.eraserMask.length){
        this._drawMasked(ctx, s, 1, 1, function(oc){
          oc.globalAlpha=(s.opacity!=null)?s.opacity:1; self._strokePath(oc, s);
        }, null);
        return;
      }
      ctx.save(); ctx.globalAlpha=(s.opacity!=null)?s.opacity:1; this._strokePath(ctx, s); ctx.restore();
    },
    // S459: LEGACY eraser — kept ONLY as the fallback when lib/ui/markupEraser.js
    // failed to load. The live path is the shared mask-carve model above.
    _eraseAtLegacy: function(p){
      // S455-parity: radius is screen-constant (uiScale) so hi-res photos erase
      // with the same on-screen brush as compressed ones.
      var _u = this._uiScale ? this._uiScale() : 1;
      // Drawing-viewer parity: eraser brush = lineWidth*1.5 (narrow path-breaker),
      // NOT size+10 (that wiped big chunks). Screen-constant via uiScale.
      var r = Math.max(3, (this.size||3) * 1.5) * _u;
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
        if (tool === 'pen' || tool === 'highlight' || tool === 'polyline'){   // S461u: polyline path-erases like pen
          // S455-parity with drawing viewer: PATH-ERASE. Instead of deleting the
          // whole freehand stroke, remove only the points under the brush and
          // split the survivors into separate strokes. Shapes/text keep
          // whole-delete (partial erase of a rect isn't meaningful without masks).
          var touched=false;
          for (var j=0; j<s.pts.length; j++){
            var _ex=s.pts[j].x-p.x, _ey=s.pts[j].y-p.y;
            if (_ex*_ex+_ey*_ey <= r2){ touched=true; break; }
          }
          if (touched){
            var runs=[], cur=[];
            for (var k=0; k<s.pts.length; k++){
              var _pt=s.pts[k], _dx=_pt.x-p.x, _dy=_pt.y-p.y;
              if (_dx*_dx+_dy*_dy <= r2){ if (cur.length>1) runs.push(cur); cur=[]; }
              else cur.push(_pt);
            }
            if (cur.length>1) runs.push(cur);
            var eng=this;
            var repl=runs.map(function(run,ri){
              return { id: ri===0 ? s.id : eng._uid(), tool:s.tool, color:s.color,
                       size:s.size, opacity:s.opacity, pts:run };
            });
            this.redoStack.push(this.strokes[i]);
            Array.prototype.splice.apply(this.strokes, [i,1].concat(repl));
            if (this._onDirty) this._onDirty();
            this._render();
            return;
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
      // Shared shape definitions (lib/ui/markupTools.js) are the single source of
      // truth for rect/circle/triangle/line (+ fills). drawShape() returns true if
      // it handled the tool; cloud + arrow stay FRT-local (arrow uses FRT's own
      // arrowhead sizing; cloud is the S339 lightbox design, per A3). Stroke storage
      // is untouched — this only changes HOW a shape is painted, never-bake intact.
      if (window.MarkupTools && s.tool !== 'cloud' && s.tool !== 'arrow'){
        if (window.MarkupTools.drawShape(ctx, s.tool, x1, y1, x2, y2)) return;
      }
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
    _SIZE_STEPS: [12,14,16,20,24,28,32,40,48,56,64,72],
    _PALETTE: ['#A85959','#E74C3C','#FF9800','#F1C40F','#2196F3','#1565C0','#4CAF50','#9C27B0','#1C2333','#607D8B','#FFFFFF'],

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


    // ── S461t: POLYLINE — the shared module (lib/ui/markupPolyline.js), the
    // same one the drawing viewer runs on. In-progress state lives in the
    // module (mirroring how _curr holds an in-progress pen stroke) and is
    // painted inline during _render, at the same slot _curr is painted.
    _poly: function(){
      if (this._polyTool) return this._polyTool;
      if (!window.MarkupPolyline) return null;
      var self = this;
      this._polyTool = window.MarkupPolyline.create({
        getOverlay: function(){ return null; },   // no overlay layer — painted in _render
        hideOverlay: function(){},
        style: function(){
          return { color: self.color,
                   size: self.size * (self._uiScale ? self._uiScale() : 1),
                   opacity: self.opacity };
        },
        commit: function(pts){
          // This host's stroke shape: {tool,pts[]} — identical to pen, so render,
          // hit-testing, selection, eraser and undo all work with no new cases.
          self.strokes.push({
            id: self._uid(), tool: 'polyline', color: self.color,
            size: self.size * (self._uiScale ? self._uiScale() : 1),
            opacity: self.opacity, pts: pts
          });
          self._histPush({ t:'add' });
          self.redoStack = [];
          if (self._onDirty) self._onDirty();
        },
        afterChange: function(n){ if (self._onPolyChange) self._onPolyChange(n); },
        render: function(){ if (self.ctx) self._render(); }
      });
      return this._polyTool;
    },
    finishPolyline: function(){ var p=this._poly(); if(p) p.finish(); },
    undoPolyPoint:  function(){ var p=this._poly(); if(p) p.undoPoint(); },
    cancelPolyline: function(){ var p=this._poly(); if(p) p.cancel(); },
    polyCount:      function(){ return (this._polyTool ? this._polyTool.count() : 0); },
    onPolyChange:   function(fn){ this._onPolyChange = fn || null; },

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
      // pen/highlight/polyline: rotation baked into points → AABB of points is
      // the visual AABB. (S461u, Mark: the selection box hugged only the FIRST
      // SEGMENT — polyline was falling into the shapes branch below, which
      // reads pts[0]/pts[1] only.)
      if (s.tool === 'pen' || s.tool === 'highlight' || s.tool === 'polyline'){
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

    // S364 — selection-chrome scale compensation. The canvas is sized to the
    // photo's NATURAL pixel dimensions (self.w) and CSS-scaled down by the wrap to
    // fit the screen (S358 single-transform model). Handles drawn in logical px
    // therefore shrink by that same factor on screen — microscopic on large/obs
    // photos. Multiply every handle size / offset / hit-radius by naturalW÷onScreenW
    // so the chrome is a CONSTANT screen size regardless of photo resolution. Clamped
    // so it can't blow up to absurd sizes on tiny photos.
    _uiScale: function(){
      try {
        if (!this.canvas) return 1;
        var onScreenW = this.canvas.getBoundingClientRect().width;
        if (!onScreenW || !this.w) return 1;
        var k = this.w / onScreenW;            // naturalW / displayedW = 1/displayScale
        if (!isFinite(k) || k <= 0) return 1;
        return Math.max(0.5, Math.min(k, 12)); // clamp
      } catch(e){ return 1; }
    },



    _renderSoon: function(){
      // S482 [ported S487k]: frame-batch the live-draw repaint. touchmove fires
      // far faster than the display; painting per EVENT (the pre-port behavior)
      // was the photo-markup pen lag (Nasim 7310.17). Points still append on
      // every event (zero fidelity loss) — we paint at most once per frame.
      // Everything outside the live drag keeps calling _render() directly.
      if (this._rafQueued) return;
      if (typeof requestAnimationFrame !== 'function'){ this._render(); return; }
      var self = this;
      self._rafQueued = true;
      requestAnimationFrame(function(){ self._rafQueued = false; self._render(); });
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
            if (s.eraserMask && s.eraserMask.length){
              // S459: carve this highlight's own mask on a scratch (isolated), then
              // accumulate opaque onto the group layer — no-stack model preserved.
              var scr=this._hlScratch||(this._hlScratch=document.createElement('canvas'));
              if (scr.width!==off.width||scr.height!==off.height){ scr.width=off.width; scr.height=off.height; }
              var sc2=scr.getContext('2d');
              sc2.setTransform(1,0,0,1,0,0); sc2.clearRect(0,0,scr.width,scr.height);
              sc2.setTransform(this.dpr,0,0,this.dpr,0,0);
              sc2.lineCap='round'; sc2.lineJoin='round';
              sc2.strokeStyle=s.color; sc2.lineWidth=(s.size||3)*4;
              sc2.beginPath(); sc2.moveTo(s.pts[0].x,s.pts[0].y);
              for (var j2=1;j2<s.pts.length;j2++) sc2.lineTo(s.pts[j2].x,s.pts[j2].y);
              sc2.stroke();
              sc2.save(); sc2.globalCompositeOperation='destination-out'; sc2.globalAlpha=1;
              for (var mi2=0;mi2<s.eraserMask.length;mi2++){
                var m2=s.eraserMask[mi2]; if(!m2.points||m2.points.length<2) continue;
                sc2.lineWidth=(m2.size||2);
                sc2.beginPath(); sc2.moveTo(m2.points[0].x,m2.points[0].y);
                for (var mj2=1;mj2<m2.points.length;mj2++) sc2.lineTo(m2.points[mj2].x,m2.points[mj2].y);
                sc2.stroke();
              }
              sc2.restore();
              oc.save(); oc.setTransform(1,0,0,1,0,0); oc.globalAlpha=1; oc.drawImage(scr,0,0);
              oc.setTransform(this.dpr,0,0,this.dpr,0,0); oc.restore();
              continue;
            }
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
        if (st.tool==='pen' || st.tool==='polyline') this._drawPenR(ctx, st);   // S459: mask-aware (S461t: polyline shares the pen path)
      }
      if (this._curr && this._curr.tool==='pen'){ ctx.save(); ctx.globalAlpha=(this._curr.opacity!=null)?this._curr.opacity:1; this._strokePath(ctx, this._curr); ctx.restore(); }
      // S461t — in-progress POLYLINE, painted at the _curr slot from the shared
      // module's state: placed segments + rubber-band leg to the cursor + the
      // close indicator on point 0 (the drawing viewer's preview, verbatim).
      if (this.tool === 'polyline' && this._polyTool && this._polyTool.count()){
        var _pl = this._polyTool.points();
        var _pu2 = this._uiScale ? this._uiScale() : 1;
        ctx.save();
        ctx.globalAlpha = (this.opacity != null) ? this.opacity : 1;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size * _pu2;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(_pl[0].x, _pl[0].y);
        for (var _pj = 1; _pj < _pl.length; _pj++) ctx.lineTo(_pl[_pj].x, _pl[_pj].y);   // lineTo only
        if (this._polyCursor) ctx.lineTo(this._polyCursor.x, this._polyCursor.y);
        ctx.stroke();
        if (this._polyCursor && _pl.length >= 2){
          var _dxp = this._polyCursor.x - _pl[0].x, _dyp = this._polyCursor.y - _pl[0].y;
          if (Math.sqrt(_dxp*_dxp + _dyp*_dyp) < 15){
            ctx.beginPath();
            ctx.arc(_pl[0].x, _pl[0].y, 8 * _pu2, 0, Math.PI * 2);
            ctx.fillStyle = this.color; ctx.globalAlpha = 0.3; ctx.fill();
          }
        }
        ctx.restore();
      }
      // S459: live eraser drag path — grey preview, never persisted (viewer parity)
      if (this._curr && this._curr.tool==='eraser' && this._curr.pts.length>1){
        var _ec=this._curr;
        ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.strokeStyle=(window.MarkupEraser&&window.MarkupEraser.PREVIEW&&window.MarkupEraser.PREVIEW.color)||'#8a94b0';
        ctx.globalAlpha=0.85; ctx.lineWidth=_ec._ew||9;
        ctx.beginPath(); ctx.moveTo(_ec.pts[0].x,_ec.pts[0].y);
        for (var _ei=1;_ei<_ec.pts.length;_ei++) ctx.lineTo(_ec.pts[_ei].x,_ec.pts[_ei].y);
        ctx.stroke(); ctx.restore();
      }
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
      if ((this.tool === 'select' || this.tool === 'trash') && this._drawSelChrome) this._drawSelChrome(ctx);   // shared chrome (S459e pad + S459f tight amber); S574 trash rides the same tap-pick chrome
    },

    // Wrap shape draw with opacity + rotation about bbox center (screen render only, sx=sy=1)
    _drawShapeR: function(ctx, s){
      var self=this;
      if (s.eraserMask && s.eraserMask.length){
        // S459: masked shape — draw (with its rotation) on an offscreen, carve the
        // local-frame masks INSIDE the same rotation transform, composite.
        var rotFn=null;
        if (s.rotation){ var ra=s.pts[0], rb=s.pts[1], rcx=(ra.x+rb.x)/2, rcy=(ra.y+rb.y)/2;
          rotFn=function(oc){ oc.translate(rcx,rcy); oc.rotate(s.rotation); oc.translate(-rcx,-rcy); }; }
        this._drawMasked(ctx, s, 1, 1, function(oc){
          oc.save(); oc.globalAlpha=(s.opacity!=null)?s.opacity:1;
          if (rotFn) rotFn(oc);
          self._drawShape(oc, s); oc.restore();
        }, rotFn);
        return;
      }
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
      var self=this;
      if (s.eraserMask && s.eraserMask.length){
        var rotFnT=null;
        if (s.rotation){ var _tm=this._textMetrics(s), tfs=_tm.fs, tw=_tm.w;
          var tcx=s.pts[0].x+tw/2, tcy=s.pts[0].y-tfs+_tm.h/2;
          rotFnT=function(oc){ oc.translate(tcx,tcy); oc.rotate(s.rotation); oc.translate(-tcx,-tcy); }; }
        this._drawMasked(ctx, s, 1, 1, function(oc){
          oc.save(); oc.globalAlpha=(s.opacity!=null)?s.opacity:1;
          if (rotFnT) rotFnT(oc);
          self._drawText(oc, s); oc.restore();
        }, rotFnT);
        return;
      }
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

    // S459: op-aware undo/redo. 'add' entries mirror the classic pop model exactly;
    // 'erase' entries restore whole-array snapshots so one drag = one undo. Strokes
    // loaded at attach have no log — undo falls through to the classic pop (parity).
    undo: function(){
      if (this._shapePending){ this._shapePending = null; this._curr = null; this._render(); return; }
      var op = (this._hist && this._hist.length) ? this._hist.pop() : null;
      if (op && op.t==='erase'){
        this._histRedo.push(op);
        this.strokes = JSON.parse(op.before);
        this._render(); if (this._onDirty) this._onDirty(); return;
      }
      if (op && op.t==='mod'){   // S459l: shared-text edit op
        this._histRedo.push(op);
        var jm=(op.idx>=0&&op.idx<this.strokes.length)?op.idx:this.strokes.findIndex(function(st){return st.id===JSON.parse(op.before).id;});
        if(jm>=0) this.strokes[jm]=JSON.parse(op.before);
        this._render(); if (this._onDirty) this._onDirty(); return;
      }
      if (op && op.t==='del'){   // S459l: shared-text delete-empty op
        this._histRedo.push(op);
        this.strokes.splice(Math.min(op.idx,this.strokes.length),0,op.stroke);
        this._render(); if (this._onDirty) this._onDirty(); return;
      }
      if (op && (op.t==='gmod'||op.t==='gdel'||op.t==='gadd')){   // S459l: shared-selection group ops
        var selfU=this; this._histRedo.push(op);
        if (op.t==='gmod'){ op.ids.forEach(function(id,i){ var j=selfU.strokes.findIndex(function(st){return st.id===id;}); if(j>=0) selfU.strokes[j]=JSON.parse(op.before[i]); }); }
        else if (op.t==='gdel'){ op.items.forEach(function(it){ selfU.strokes.splice(Math.min(it.idx,selfU.strokes.length),0,it.stroke); }); }
        else { var addIds=op.items.map(function(it){return it.stroke.id;}); this.strokes=this.strokes.filter(function(st){return addIds.indexOf(st.id)===-1;}); }
        this.selIds=[]; this._pickIds=[]; this._dragState=null; this._rubberBand=null;
        this._render(); if (this._onDirty) this._onDirty(); this._emitSel && this._emitSel(); return;
      }
      if (!this.strokes.length) return;
      if (op) this._histRedo.push(op);
      this.redoStack.push(this.strokes.pop());
      this._render();
      if (this._onDirty) this._onDirty();
    },
    redo: function(){
      var op = (this._histRedo && this._histRedo.length) ? this._histRedo.pop() : null;
      if (op && op.t==='erase'){
        this._hist.push(op);
        this.strokes = JSON.parse(op.after);
        this._render(); if (this._onDirty) this._onDirty(); return;
      }
      if (op && op.t==='mod'){
        this._hist.push(op);
        var jr=(op.idx>=0&&op.idx<this.strokes.length)?op.idx:this.strokes.findIndex(function(st){return st.id===JSON.parse(op.after).id;});
        if(jr>=0) this.strokes[jr]=JSON.parse(op.after);
        this._render(); if (this._onDirty) this._onDirty(); return;
      }
      if (op && op.t==='del'){
        this._hist.push(op);
        var rid=op.stroke.id; this.strokes=this.strokes.filter(function(st){return st.id!==rid;});
        this._render(); if (this._onDirty) this._onDirty(); return;
      }
      if (op && (op.t==='gmod'||op.t==='gdel'||op.t==='gadd')){   // S459l
        var selfR=this; this._hist.push(op);
        if (op.t==='gmod'){ op.ids.forEach(function(id,i){ var j=selfR.strokes.findIndex(function(st){return st.id===id;}); if(j>=0) selfR.strokes[j]=JSON.parse(op.after[i]); }); }
        else if (op.t==='gdel'){ var rmIds=op.items.map(function(it){return it.stroke.id;}); this.strokes=this.strokes.filter(function(st){return rmIds.indexOf(st.id)===-1;}); }
        else { op.items.forEach(function(it){ selfR.strokes.splice(Math.min(it.idx,selfR.strokes.length),0,it.stroke); }); }
        this.selIds=[]; this._pickIds=[]; this._dragState=null; this._rubberBand=null;
        this._render(); if (this._onDirty) this._onDirty(); this._emitSel && this._emitSel(); return;
      }
      if (!this.redoStack.length){ if (op) this._histRedo.push(op); return; }
      this.strokes.push(this.redoStack.pop());
      if (op) this._hist.push(op);
      this._render();
      if (this._onDirty) this._onDirty();
    },

    clear: function(){
      this.strokes = []; this.redoStack = []; this._hist=[]; this._histRedo=[]; this._shapePending = null; this._curr = null; this._render();
      if (this._onDirty) this._onDirty();
    },

    // Revert: drop edits AND signal caller to reload original blob
    revert: function(){ this.clear(); return this._origBlob; },

    // S347d: re-encode the CLEAN source image (this.img — the original the engine
    // draws under the strokes) to a Blob, with NO strokes painted. Used to capture
    // a guaranteed clean-original backup at markup-save time, so the original is
    // never lost (prevents the silent-overwrite CASE 4). Returns Promise<Blob|null>.
    cleanBlob: function(){
      var self = this;
      return new Promise(function(resolve){
        try {
          var img = self.img;
          if (!img || !img.naturalWidth){ resolve(null); return; }
          var nw = img.naturalWidth, nh = img.naturalHeight;
          var cv = document.createElement('canvas'); cv.width = nw; cv.height = nh;
          cv.getContext('2d').drawImage(img, 0, 0, nw, nh);   // clean pixels only
          cv.toBlob(function(b){ resolve(b || null); }, 'image/jpeg', 0.92);
        } catch(_){ resolve(null); }
      });
    },

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
                if (s.eraserMask && s.eraserMask.length){
                  // S459: carve on a scratch so the mask cuts only THIS highlight
                  var hscr=document.createElement('canvas'); hscr.width=nw; hscr.height=nh;
                  var hsc=hscr.getContext('2d'); hsc.lineCap='round'; hsc.lineJoin='round';
                  hsc.strokeStyle=s.color; hsc.lineWidth=(s.size||3)*4*savg;
                  hsc.beginPath(); hsc.moveTo(s.pts[0].x*sx, s.pts[0].y*sy);
                  for (var jm=1;jm<s.pts.length;jm++) hsc.lineTo(s.pts[jm].x*sx, s.pts[jm].y*sy);
                  hsc.stroke();
                  hsc.save(); hsc.globalCompositeOperation='destination-out'; hsc.globalAlpha=1;
                  for (var hmi=0;hmi<s.eraserMask.length;hmi++){
                    var hm=s.eraserMask[hmi]; if(!hm.points||hm.points.length<2) continue;
                    hsc.lineWidth=(hm.size||2)*savg;
                    hsc.beginPath(); hsc.moveTo(hm.points[0].x*sx, hm.points[0].y*sy);
                    for (var hmj=1;hmj<hm.points.length;hmj++) hsc.lineTo(hm.points[hmj].x*sx, hm.points[hmj].y*sy);
                    hsc.stroke();
                  }
                  hsc.restore();
                  hctx.drawImage(hscr,0,0);
                  return;
                }
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
            function _rawPen(tc){
              tc.lineCap='round'; tc.lineJoin='round';
              tc.globalAlpha=(s.opacity!=null)?s.opacity:1;
              tc.strokeStyle=s.color; tc.lineWidth=s.size*savg;
              tc.beginPath(); tc.moveTo(s.pts[0].x*sx, s.pts[0].y*sy);
              for (var j=1;j<s.pts.length;j++) tc.lineTo(s.pts[j].x*sx, s.pts[j].y*sy);
              tc.stroke();
            }
            if (s.eraserMask && s.eraserMask.length){ self._drawMasked(oc, s, sx, sy, _rawPen, null); return; }
            oc.save(); _rawPen(oc); oc.restore();
          });
          // Shapes on top (per-object opacity + rotation about scaled bbox center)
          self.strokes.filter(function(s){return isShapeTool(s.tool);}).forEach(function(s){
            var rotFn=null;
            if (s.rotation){ var a=s.pts[0],b=s.pts[1], cx=((a.x+b.x)/2)*sx, cy=((a.y+b.y)/2)*sy;
              rotFn=function(tc){ tc.translate(cx,cy); tc.rotate(s.rotation); tc.translate(-cx,-cy); }; }
            function _rawShape(tc){
              tc.save(); tc.globalAlpha=(s.opacity!=null)?s.opacity:1;
              if (rotFn) rotFn(tc);
              self._drawShape(tc, s, sx, sy); tc.restore();
            }
            if (s.eraserMask && s.eraserMask.length){ self._drawMasked(oc, s, sx, sy, _rawShape, rotFn); return; }
            _rawShape(oc);
          });
          // Text labels on top (per-object opacity + rotation about scaled visual center)
          self.strokes.filter(function(s){return s.tool==='text';}).forEach(function(s){
            var rotFnT=null;
            if (s.rotation){ var _bm=self._textMetrics(s), fs=_bm.fs, estW=_bm.w;   // S459: was this._textMetrics (undefined here) — self
              var cx=(s.pts[0].x+estW/2)*sx, cy=(s.pts[0].y-fs+_bm.h/2)*sy;
              rotFnT=function(tc){ tc.translate(cx,cy); tc.rotate(s.rotation); tc.translate(-cx,-cy); }; }
            function _rawText(tc){
              tc.save(); tc.globalAlpha=(s.opacity!=null)?s.opacity:1;
              if (rotFnT) rotFnT(tc);
              self._drawText(tc, s, sx, sy); tc.restore();
            }
            if (s.eraserMask && s.eraserMask.length){ self._drawMasked(oc, s, sx, sy, _rawText, rotFnT); return; }
            _rawText(oc);
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
            if (s.eraserMask && s.eraserMask.length){
              var rscr=document.createElement('canvas'); rscr.width=W; rscr.height=H;
              var rc2=rscr.getContext('2d'); rc2.lineCap='round'; rc2.lineJoin='round';
              rc2.strokeStyle=s.color; rc2.lineWidth=(s.size||3)*4;
              rc2.beginPath(); rc2.moveTo(s.pts[0].x,s.pts[0].y);
              for (var jr=1;jr<s.pts.length;jr++) rc2.lineTo(s.pts[jr].x,s.pts[jr].y);
              rc2.stroke();
              rc2.save(); rc2.globalCompositeOperation='destination-out'; rc2.globalAlpha=1;
              for (var rmi=0;rmi<s.eraserMask.length;rmi++){
                var rm=s.eraserMask[rmi]; if(!rm.points||rm.points.length<2) continue;
                rc2.lineWidth=(rm.size||2);
                rc2.beginPath(); rc2.moveTo(rm.points[0].x,rm.points[0].y);
                for (var rmj=1;rmj<rm.points.length;rmj++) rc2.lineTo(rm.points[rmj].x,rm.points[rmj].y);
                rc2.stroke();
              }
              rc2.restore(); hc.drawImage(rscr,0,0);
              return;
            }
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
        function _rp(tc){ tc.lineCap='round'; tc.lineJoin='round';
          tc.globalAlpha=(s.opacity!=null)?s.opacity:1;
          tc.strokeStyle=s.color; tc.lineWidth=s.size;
          tc.beginPath(); tc.moveTo(s.pts[0].x,s.pts[0].y);
          for (var j=1;j<s.pts.length;j++) tc.lineTo(s.pts[j].x,s.pts[j].y);
          tc.stroke(); }
        if (s.eraserMask && s.eraserMask.length){ self._drawMasked(ctx, s, 1, 1, _rp, null); return; }
        ctx.save(); _rp(ctx); ctx.restore();
      });
      strokes.filter(function(s){return isShapeTool(s.tool);}).forEach(function(s){
        var rotF=null;
        if (s.rotation){ var a=s.pts[0],b=s.pts[1], cx=(a.x+b.x)/2, cy=(a.y+b.y)/2;
          rotF=function(tc){ tc.translate(cx,cy); tc.rotate(s.rotation); tc.translate(-cx,-cy); }; }
        function _rs(tc){ tc.save(); tc.globalAlpha=(s.opacity!=null)?s.opacity:1;
          if (rotF) rotF(tc); self._drawShape(tc, s, 1, 1); tc.restore(); }
        if (s.eraserMask && s.eraserMask.length){ self._drawMasked(ctx, s, 1, 1, _rs, rotF); return; }
        _rs(ctx);
      });
      strokes.filter(function(s){return s.tool==='text';}).forEach(function(s){
        var rotFT=null;
        if (s.rotation){ var _bm=self._textMetrics(s), fs=_bm.fs, estW=_bm.w;
          var cx=s.pts[0].x+estW/2, cy=s.pts[0].y-fs+_bm.h/2;
          rotFT=function(tc){ tc.translate(cx,cy); tc.rotate(s.rotation); tc.translate(-cx,-cy); }; }
        function _rt(tc){ tc.save(); tc.globalAlpha=(s.opacity!=null)?s.opacity:1;
          if (rotFT) rotFT(tc); self._drawText(tc, s, 1, 1); tc.restore(); }
        if (s.eraserMask && s.eraserMask.length){ self._drawMasked(ctx, s, 1, 1, _rt, rotFT); return; }
        _rt(ctx);
      });
    }
  };

  window.MarkupEngine = MarkupEngine;
  // ── S459l: shared selection engine (lib/ui/markupSelection.js v2) ──
  // FRT injects its own transform semantics; everything else (two-SET model,
  // rubber-band, chrome with S459e grab-band + S459f tight amber, clone, delete,
  // S410 additive) comes from the ONE shared module both lightboxes run.
  if (window.MarkupSelection){
    window.MarkupSelection.install(MarkupEngine, {
      aabb: function(st){ return this._strokeBounds(st); },   // rotation-aware FRT bounds
      applyRotate: function(st, o, dA, rot){
        // FRT rotation model (verbatim from the pre-extraction engine):
        // pen/highlight BAKE rotation into points; shapes/text keep .rotation.
        if (o.tool==='pen'||o.tool==='highlight'||o.tool==='polyline'){   // S461u: shapes branch would collapse a polyline to 2 points
          st.pts=o.pts.map(function(pt){ return rot(pt); });
          if (o.eraserMask){ st.eraserMask=JSON.parse(JSON.stringify(o.eraserMask));
            if (window.MarkupEraser) window.MarkupEraser.xformMask(st, function(pt){ return rot(pt); }); }
        } else if (o.tool==='text'){
          var _rm=this._textMetrics(o), fs=_rm.fs, estW=_rm.w;
          var oc={x:o.pts[0].x+estW/2, y:o.pts[0].y-fs+_rm.h/2}, nc=rot(oc);
          st.pts[0]={x:nc.x-estW/2, y:nc.y-_rm.h/2+fs};
          if (o.eraserMask){ var _tdx=st.pts[0].x-o.pts[0].x, _tdy=st.pts[0].y-o.pts[0].y;
            st.eraserMask=JSON.parse(JSON.stringify(o.eraserMask));
            if (window.MarkupEraser) window.MarkupEraser.xformMask(st, function(pt){ return {x:pt.x+_tdx, y:pt.y+_tdy}; }); }
          st.rotation=(o.rotation||0)+dA;
        } else {
          var a=o.pts[0], b=o.pts[1];
          var ocx=(a.x+b.x)/2, ocy=(a.y+b.y)/2, ncs=rot({x:ocx,y:ocy});
          var hw=Math.abs(b.x-a.x)/2, hh=Math.abs(b.y-a.y)/2;
          st.pts[0]={x:ncs.x-hw, y:ncs.y-hh}; st.pts[1]={x:ncs.x+hw, y:ncs.y+hh};
          if (o.eraserMask){ var _sdx=ncs.x-ocx, _sdy=ncs.y-ocy;
            st.eraserMask=JSON.parse(JSON.stringify(o.eraserMask));
            if (window.MarkupEraser) window.MarkupEraser.xformMask(st, function(pt){ return {x:pt.x+_sdx, y:pt.y+_sdy}; }); }
          st.rotation=(o.rotation||0)+dA;
        }
      }
    });
    MarkupEngine.render = function(){ this._render(); };            // module calls render()
    MarkupEngine._pushOp = function(op){ this._histPush(op); };     // g-ops flow into _hist
    MarkupEngine.selectionCount = MarkupEngine.selCount;            // lightbox API compat
    MarkupEngine.deleteSelection = MarkupEngine.deleteSelected;     // lightbox API compat
  } if (window.MarkupText){
    // ── S459l: shared text engine (lib/ui/markupText.js v2) ──
    // FRT hooks: size schema (stored s.size = fontN/4, S458 screen-constant sizing),
    // steps in nominal SCREEN px, place-ONCE on document.body (S403 keyboard rule).
    window.MarkupText.install(MarkupEngine, {
      readFontN: function(es){ return ((es&&es.size)||3)*4; },                       // natural px
      newFontN: function(){ var uT=this._uiScale?this._uiScale():1; return ((this.size||3)*4)*uT; },
      storeFont: function(t, fontN){ t.size = fontN/4; },
      stepFontN: function(fontN, dir){
        var uT=this._uiScale?this._uiScale():1;
        var sPx=fontN/Math.max(0.0001,uT);
        var steps=this._SIZE_STEPS, i=0, best=1e9;
        for(var k=0;k<steps.length;k++){ var d=Math.abs(steps[k]-sPx); if(d<best){best=d;i=k;} }
        i=Math.max(0,Math.min(steps.length-1,i+dir));
        return steps[i]*uT;
      },
      displaySize: function(fontN){ var uT=this._uiScale?this._uiScale():1; return Math.round(fontN/Math.max(0.0001,uT)); },
      placement: function(){
        // viewport rect captured ONCE at open; never re-derived (S403: repositioning
        // after the mobile keyboard opens yanks the box off the tapped spot).
        var r=this.canvas.getBoundingClientRect(), self=this;
        return { host:document.body,
                 origin:function(){ return {x:r.left, y:r.top}; },
                 sx:function(){ return r.width/self.w; },
                 sy:function(){ return r.height/self.h; },
                 track:false };
      },
      buildStroke: function(v, fontN, color, bg, lx, ly){
        return { id:this._uid(), tool:'text', pts:[{x:lx,y:ly}], text:v, color:color, bg:bg, size:fontN/4, opacity:this.opacity };
      },
      applyEdit: function(es, v, fontN, color, bg, lx, ly){
        es.text=v; es.size=fontN/4; es.color=color; es.bg=bg; es.pts[0]={x:lx,y:ly};
      }
    });
    MarkupEngine._textPrompt = function(p, _ev, editId){ return this._promptText(p, {tool:'text', alpha:this.opacity}, editId); };   // routing + host-style adapter
  } else {
    console.error('[MarkupEngine] lib/ui/markupSelection.js missing — selection tool disabled');
  }
})();
