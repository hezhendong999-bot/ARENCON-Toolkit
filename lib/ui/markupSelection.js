/**
 * ARENCON — Shared Markup Selection Engine
 * ═════════════════════════════════════════
 * CANONICAL SOURCE: the Diesel lightbox selection engine (S314 group API + S344
 * two-SET pick/group model + S459e grab-band pad + S461 contour halo + S461b
 * high-visibility chrome colours).
 * This file was EXTRACTED VERBATIM from ARENCON_Diesel_Fire_Pump_Commissioning.html
 * at build S459f — Mark field-approved behavior; do not "improve" it here without
 * a field-verify session. Every markup surface (Diesel lightbox live; FRT lightbox
 * planned) installs these methods so a selection fix lands once, everywhere.
 *
 * THE MODEL (S344 canon, two-SET):
 *   PICK set (_pickIds): TAP toggles a mark in/out — cyan glow + green check.
 *     Tapping NEVER groups. ✓ (confirmPick) is the ONLY way to group.
 *   GROUP set (selIds): the moveable selection — blue dashed group box with wide
 *     grab pad (22px / 30px coarse), corner resize, rotate, delete, copy handles.
 *     Members show an amber CONTOUR HALO tracing each mark's own shape (S461 —
 *     no bounding box: signage only, never a drag target); tap a member → active →
 *     round Ungroup pulls just it out. ✗/Esc/re-tap Select clears; marks stay.
 *   RUBBER sub-mode: classic rubber-band + click-to-select + group move.
 *
 * INSTALL:  window.MarkupSelection.install(engine)
 * REQUIRED HOST SURFACE (the engine object must provide):
 *   strokes[]                 — {id, tool, pts:[{x,y}], size, color, rot?, ...}
 *   canvas, ctx, nw           — canvas el, its 2d ctx, natural width
 *   render()                  — full repaint (must call _drawSelChrome last)
 *   _findStroke(id)           — id → stroke | null
 *   _strokeBBox(s)            — UNROTATED bbox of a stroke (with ink half-width)
 *   _strokeCenter(s)          — rotation center of a stroke
 *   (the rotation-aware _strokeAABB and _snapSel live IN this module)
 *   _uid()                    — new stroke id
 *   _pushOp(op)               — op log; ops used: gmod / gdel / gadd
 *   _onDirty (optional), redo / redoOps arrays (cleared by clone)
 *   window.MarkupEraser (optional) — masks follow move/resize/rotate/clone
 * STATE OWNED HERE (initialized by install if absent):
 *   selIds, _pickIds, _selectSub ('rubber'|'tap'), _dragState, _rubberBand,
 *   _grouped, _groupActiveId, _onSelChange
 *
 * The host keeps: pointer routing (call _selDown/_selMove/_selUp for the select
 * tool), the ✓/✗ confirm-bar DOM (drive it via onSelChange + the API methods),
 * and the geometry primitives listed above.
 */
(function (root) {
  'use strict';

  // v2.0.0: pure point rotation is module-internal — hosts are NOT required to
  // provide _rotPt (Diesel happens to have one; FRT does not).
  function rotPt(q, c, a){
    var dx=q.x-c.x, dy=q.y-c.y, ca=Math.cos(a), sa=Math.sin(a);
    return { x:c.x+dx*ca-dy*sa, y:c.y+dx*sa+dy*ca };
  }

  // ── S461b: SELECTION CHROME COLOURS (Mark, field report: both indicators were
  //   too dim to see on a busy grey site photo). ONE place — every surface that
  //   installs this engine inherits any change here.
  //   The two indicators MUST stay distinct in hue: the halo is signage ("this
  //   mark is picked"), the blue box is the only DRAGGABLE chrome. Same colour
  //   would make a photo of picked marks inside a group read as four identical
  //   outlines with no clue which one you can grab.
  var SEL = {
    // MEMBER GLOW — the ink-hugging contour (v2.2 spec, Mark-approved; restored
    // v2.6.0 after the uniform-box detour was called backwards). Cyan-white:
    // pops on red / orange / yellow ink alike.
    halo:        '#7FE9FF',
    haloActive:  '#B8F4FF',
    haloAlpha:        0.62,
    haloAlphaActive:  0.80,
    // GROUP BOX — brighter, more saturated true blue; the old #3F6E9C was a muted
    // steel that vanished against concrete.
    group:       '#4DA6E8',
    groupCopy:   '#2E86C8',
    groupDelete: '#C0445F'   // unchanged — the muted red ✕ reads fine
  };

  var M = {
    // ── S314: GROUP selection API (FRT markupEngine port — multi-select, rubber-band,
    //          delete handle, group move/resize/rotate, per-object style via applySel).
    //          Diesel op-log undo + s.rot render model RETAINED; FRT group semantics adopted. ──
    _uid:function(){ return 'mk'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); },
    _ensureIds:function(){ var self=this; this.strokes.forEach(function(s){ if(!s.id) s.id=self._uid(); }); },
    _findStroke:function(id){ for(var i=0;i<this.strokes.length;i++){ if(this.strokes[i].id===id) return this.strokes[i]; } return null; },
    _snapSel:function(){ var self=this; return this.selIds.map(function(id){ return JSON.stringify(self._findStroke(id)); }); },
    // Visual AABB of one stroke (rotation-aware: rotate bbox corners by s.rot about stroke center)
    _strokeAABB:function(s){
      var b=this._strokeBBox(s); if(!s.rot) return b;
      var c={x:(b.x1+b.x2)/2,y:(b.y1+b.y2)/2}, self=this;
      var x1=1e15,y1=1e15,x2=-1e15,y2=-1e15;
      [{x:b.x1,y:b.y1},{x:b.x2,y:b.y1},{x:b.x2,y:b.y2},{x:b.x1,y:b.y2}].forEach(function(q){
        var r=self._rotPt(q,c,s.rot);
        if(r.x<x1)x1=r.x; if(r.y<y1)y1=r.y; if(r.x>x2)x2=r.x; if(r.y>y2)y2=r.y; });
      return {x1:x1,y1:y1,x2:x2,y2:y2};
    },
    _groupBounds:function(){
      var x1=1e15,y1=1e15,x2=-1e15,y2=-1e15, self=this, any=false;
      this.selIds.forEach(function(id){
        var s=self._findStroke(id); if(!s) return; var b=self._selHooks.aabb.call(self, s); if(!b) return; any=true;
        if(b.x1<x1)x1=b.x1; if(b.y1<y1)y1=b.y1; if(b.x2>x2)x2=b.x2; if(b.y2>y2)y2=b.y2; });
      if(!any) return null;
      return {x1:x1,y1:y1,x2:x2,y2:y2};
    },
    // Shared geometry for handles — ONE source for both hit-test and chrome draw (always aligned)
    // v2.7.0 (S461k — Mark's console: MarkupEngine.nw === 0 after a photo
    // load fallback): natural width for chrome scaling, with the canvas
    // buffer width as the safety net so k can never collapse to zero.
    _selNW:function(){
      // v2.7.1 (Mark: chrome came back "insanely big"): the canvas BUFFER is
      // dpr-scaled (e.g. 6048 = 2016 natural × dpr 3), so falling back to
      // canvas.width overshot every chrome size by the device pixel ratio.
      // Preference order: nw (natural, when the host set it) → w (the host's
      // true stroke-space width — always right in the FRT lightbox) →
      // canvas.width ÷ dpr as the final net.
      return this.nw || this.w || (this.canvas ? (this.canvas.width / (this.dpr || 1)) : 1) || 1;
    },
    _selGeom:function(){
      var b=this._groupBounds(); if(!b||!this.canvas) return null;
      var rect=this.canvas.getBoundingClientRect();
      var k=this._selNW()/Math.max(1,rect.width);                 // natural px per screen px
      var coarse=(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
      // S459e (Mark field report): pad widened 8→22 (30 touch). _hitStrokeSel tests the
      // stroke's AABB+7px — for boxy shapes the whole interior is "the mark", so the only
      // move-grab area is the ring between AABB+7 and this frame. At pad 8 that ring was
      // ~1 screen px → every press toggled the mark instead of moving it. The pad must
      // stay comfortably larger than the 7px hit inflation.
      var pad=(coarse?30:22)*k, hs=11*k;
      var bx1=b.x1-pad, by1=b.y1-pad, bx2=b.x2+pad, by2=b.y2+pad;
      return { k:k, pad:pad, hs:hs, b:{x1:bx1,y1:by1,x2:bx2,y2:by2},
        corners:[{x:bx1,y:by1},{x:bx2,y:by1},{x:bx2,y:by2},{x:bx1,y:by2}],
        rot:{x:(bx1+bx2)/2, y:by1-24*k, r:9*k},
        del:{x:bx2+14*k, y:by1-14*k, r:9*k},
        // S344 Phase 2c: copy handle — bottom-center, below the box. Generous radius on touch.
        copy:{x:(bx1+bx2)/2, y:by2+34*k, r:(coarse?20:11)*k} };
    },
    hasSel:function(){ return !!(this.selIds&&this.selIds.length); },
    deselect:function(){ this.selIds=[]; this._pickIds=[]; this._grouped=false; this._groupActiveId=null; this._dragState=null; this._rubberBand=null; if(this.ctx) this.render(); this._emitSel(); },
    // ── S344 Phase 2a: FRT S339 select sub-tool + confirm API ──
    setSelectSub:function(sub){ if(sub==='single') sub='rubber'; this._selectSub=sub; this._pickIds=[]; this._grouped=false; this._groupActiveId=null; this._dragState=null; this._rubberBand=null; if(this.ctx) this.render(); this._emitSel(); },
    getSelectSub:function(){ return this._selectSub; },
    // ✓ merges the PICK set into the grouped (moveable) selection — the ONLY way to group.
    confirmPick:function(){ if(!this._pickIds||!this._pickIds.length) return; var self=this; this._pickIds.forEach(function(id){ if(self.selIds.indexOf(id)===-1) self.selIds.push(id); }); this._pickIds=[]; this._groupActiveId=null; if(this.ctx) this.render(); this._emitSel(); },
    cancelSelect:function(){ this.selIds=[]; this._pickIds=[]; this._grouped=false; this._groupActiveId=null; this._dragState=null; this._rubberBand=null; if(this.ctx) this.render(); this._emitSel(); },
    // Ungroup: pull the currently-active grouped mark back out of the group (it stays on the photo).
    groupActiveId:function(){ return this._groupActiveId; },
    ungroupActive:function(){ if(!this._groupActiveId) return; var i=this.selIds.indexOf(this._groupActiveId); if(i!==-1) this.selIds.splice(i,1); this._groupActiveId=null; if(this.ctx) this.render(); this._emitSel(); },
    hasActiveSelection:function(){ return (this.selIds&&this.selIds.length>0)||(this._pickIds&&this._pickIds.length>0); },
    // "picking" = there are marks in the PICK set → drives the ✓/✗ bar.
    isPicking:function(){ return this._selectSub==='tap' && this._pickIds && this._pickIds.length>0; },
    pickCount:function(){ return this._pickIds?this._pickIds.length:0; },
    selCount:function(){ return this.selIds?this.selIds.length:0; },
    onSelChange:function(fn){ this._onSelChange=fn||null; },
    _emitSel:function(){ if(this._onSelChange){ try{ this._onSelChange(); }catch(_){} } },
    deleteSelected:function(){
      if(!this.hasSel()) return;
      var sel=this.selIds, items=[];
      for(var i=this.strokes.length-1;i>=0;i--){
        if(sel.indexOf(this.strokes[i].id)!==-1) items.unshift({idx:i, stroke:this.strokes.splice(i,1)[0]});
      }
      this._selHooks.logOp.call(this, {t:'gdel', items:items});
      this.selIds=[]; this._dragState=null; this._rubberBand=null;
      if(this._onDirty) this._onDirty(); this.render();
    },
    // S344 Phase 2c: duplicate the current selection. Each clone gets a fresh id, a deep
    // copy of pts[] offset by (+28,+28), and becomes the new selection so the user can
    // drag-to-place and chain another copy. Op-logged ('gadd') so one Undo removes the clones.
    _cloneSelection:function(){
      if(!this.hasSel()) return;
      var self=this, OFF=28, newIds=[], added=[];
      this.selIds.forEach(function(id){
        var s=self._findStroke(id); if(!s) return;
        var c=JSON.parse(JSON.stringify(s));   // deep copy (pts, optional fields)
        c.id=self._uid();
        if(c.pts) c.pts=c.pts.map(function(q){ return {x:q.x+OFF, y:q.y+OFF}; });
        if(c.eraserMask && window.MarkupEraser) window.MarkupEraser.xformMask(c, function(q){ return {x:q.x+OFF, y:q.y+OFF}; });   // S459: masks follow the clone offset
        self.strokes.push(c); newIds.push(c.id); added.push({idx:self.strokes.length-1, stroke:c});
      });
      if(!newIds.length) return;
      this.selIds=newIds;
      // v2.0.0: host-agnostic redo-clear — Diesel uses redo/redoOps arrays; FRT's
      // redo is a FUNCTION (its stacks are redoStack/_histRedo). Only clear arrays.
      if(Array.isArray(this.redo)) this.redo=[];
      if(Array.isArray(this.redoOps)) this.redoOps=[];
      if(Array.isArray(this.redoStack)) this.redoStack=[];
      if(Array.isArray(this._histRedo)) this._histRedo=[];
      this._selHooks.logOp.call(this, {t:'gadd', items:added});
      if(this._onDirty) this._onDirty();
      this.render(); this._emitSel();
    },
    // Apply a style field to the current selection. log=false → live preview (slider input);
    // commitSel(snap) pushes one gmod for the whole gesture. Swatch clicks pass log=true.
    applySel:function(field, val, log){
      if(!this.hasSel()) return false;
      var self=this, ids=this.selIds.slice();
      var before=log?this._snapSel():null;
      ids.forEach(function(id){ var s=self._findStroke(id); if(!s) return;
        s[field]=(typeof val==='function')?val(s):val; });
      if(log){
        var after=this._snapSel();
        if(after.join('\u0001')!==before.join('\u0001')) this._selHooks.logOp.call(this, {t:'gmod', ids:ids, before:before, after:after});
      }
      if(this._onDirty) this._onDirty(); this.render(); return true;
    },
    snapSel:function(){ return this.hasSel()?{ids:this.selIds.slice(), before:this._snapSel()}:null; },
    commitSel:function(snap){
      if(!snap||!snap.ids||!snap.ids.length) return;
      var self=this;
      var after=snap.ids.map(function(id){ return JSON.stringify(self._findStroke(id)); });
      if(after.join('\u0001')!==snap.before.join('\u0001')) this._selHooks.logOp.call(this, {t:'gmod', ids:snap.ids, before:snap.before, after:after});
    },
    // S344 Phase 4: topmost TEXT stroke under p → its id (for tap-to-edit). Generous
    // screen-constant hit padding, glove-friendly.
    _hitTextAt:function(p){
      var rect=this.canvas.getBoundingClientRect();
      var hr=10*(this._selNW()/Math.max(1,rect.width));
      for(var i=this.strokes.length-1;i>=0;i--){
        var s=this.strokes[i]; if(s.tool!=='text') continue;
        var b=this._selHooks.aabb.call(this, s); if(!b) continue;
        if(p.x>=b.x1-hr&&p.x<=b.x2+hr&&p.y>=b.y1-hr&&p.y<=b.y2+hr) return s.id;
      }
      return null;
    },
    _hitStrokeSel:function(p){
      var rect=this.canvas.getBoundingClientRect();
      var hr=14*(this._selNW()/Math.max(1,rect.width));          // glove-friendly, screen-constant
      for(var i=this.strokes.length-1;i>=0;i--){
        var b=this._selHooks.aabb.call(this, this.strokes[i]);
        if(!b) continue;   // v2.4.1: a malformed stroke must never throw and kill selection for everything else
        if(p.x>=b.x1-hr/2&&p.x<=b.x2+hr/2&&p.y>=b.y1-hr/2&&p.y<=b.y2+hr/2){
          // v2.4.0 (S461d, Mark field report): on DRAWINGS, AABBs are enormous
          // (a dimension's box spans the whole bay), so AABB-hit selected marks
          // the user never touched — and empty-space drags could never rubber-band.
          // Hosts may inject hitInk(s, p, tol) for INK-PRECISE hits; the AABB
          // stays as a cheap cull. Default hook accepts the AABB verdict, so the
          // photo lightboxes (small marks) keep byte-identical behavior.
          if(this._selHooks.hitInk.call(this, this.strokes[i], p, hr/2)) return this.strokes[i];
        }
      }
      return null;
    },
    _selDown:function(p, ev){
      var g=this.hasSel()?this._selGeom():null;
      function d(a,bx,by){ var dx=a.x-bx, dy=a.y-by; return Math.sqrt(dx*dx+dy*dy); }
      if(g){
        // S344 Phase 2c: copy handle (✎ duplicate) — tested BEFORE all other handles so a
        // tap duplicates the selection instead of starting a move/resize.
        if(g.copy && d(p,g.copy.x,g.copy.y)<=g.copy.r+5*g.k){ this._cloneSelection(); return; }
        // delete handle (✕)
        if(d(p,g.del.x,g.del.y)<=g.del.r+5*g.k){ this.deleteSelected(); return; }
        // corner scale handles — anchor is the OPPOSITE corner (FRT model)
        for(var ci=0;ci<4;ci++){
          if(Math.abs(p.x-g.corners[ci].x)<=g.hs&&Math.abs(p.y-g.corners[ci].y)<=g.hs){
            // S461c (Mark, frt-next field report): the BR/BL anchor entries were
            // SWAPPED — grabbing bottom-right anchored to TOP-right (same side), so
            // dist(press,anchor) was tiny and the scale factor could only blow UP.
            // Correct table: each corner anchors to its true OPPOSITE.
            // corners = [TL, TR, BR, BL] → anchors = [BR, BL, TL, TR].
            var anchors=[[g.b.x2,g.b.y2],[g.b.x1,g.b.y2],[g.b.x1,g.b.y1],[g.b.x2,g.b.y1]];
            this._dragState={type:'resize', anchorX:anchors[ci][0], anchorY:anchors[ci][1],
              startX:p.x, startY:p.y,   // S314b: scale is ratioed to the PRESS point, not the bounds corner
              origBounds:{x1:g.b.x1,y1:g.b.y1,x2:g.b.x2,y2:g.b.y2}, orig:this._snapSel()};
            return;
          }
        }
        // rotate handle
        if(d(p,g.rot.x,g.rot.y)<=g.rot.r+5*g.k){
          var cx=(g.b.x1+g.b.x2)/2, cy=(g.b.y1+g.b.y2)/2;
          this._dragState={type:'rotate', centerX:cx, centerY:cy,
            startAngle:Math.atan2(p.y-cy,p.x-cx), orig:this._snapSel()};
          return;
        }
      }
      var hit=this._hitStrokeSel(p);
      // S344 two-SET TAP model (Mark's final spec):
      //  • TAP always toggles a mark in the PICK set (_pickIds) — individual glow + green check.
      //    Tapping NEVER groups and NEVER joins an existing group.
      //  • ✓ merges _pickIds into the grouped selection (selIds) — the only way to group.
      //  • A grouped selection (selIds) shows the box + handles and is DRAG-moveable.
      if(this._selectSub==='tap'){
        // GROUPED: pressing inside the group box on empty space (no mark hit) arms a move.
        if(this.selIds.length && g && !hit && p.x>=g.b.x1&&p.x<=g.b.x2&&p.y>=g.b.y1&&p.y<=g.b.y2){
          this._dragState={type:'move', startX:p.x, startY:p.y, moved:false, orig:this._snapSel()};
          return;
        }
        if(hit){
          if(this.selIds.indexOf(hit.id)!==-1){
            // v2.7.0 (S461k, Mark): tap a mark that's ALREADY selected →
            // DESELECT that one (un-glow, out of the group). The old "active
            // member" lighten state read as noise in tap mode.
            this.selIds.splice(this.selIds.indexOf(hit.id),1);
            this._groupActiveId=null;
            this._dragState=null; this.render(); this._emitSel();
            return;
          }
          // tap an UNGROUPED mark → toggle it in the PICK set (cyan glow + green check).
          // v2.0.0 (S410 union, from FRT): if a committed group exists, it RE-OPENS as
          // picks first, so tapping non-members GROWS the group (then \u2713 recommits the
          // enlarged set) instead of silently starting a fresh selection beside it.
          if(this.selIds.length && !this._pickIds.length){
            this._pickIds=this.selIds.slice();
            this.selIds=[]; this._grouped=false;
          }
          this._groupActiveId=null;
          var pix=this._pickIds.indexOf(hit.id);
          if(pix!==-1) this._pickIds.splice(pix,1); else this._pickIds.push(hit.id);
          this._dragState=null; this.render(); this._emitSel();
        }
        return;   // empty-area tap (outside box): sticky — never rubber-band, never lose picks
      }
      var multi=!!(ev&&(ev.ctrlKey||ev.metaKey));
      // Press inside a multi-selection's bounds (even empty space between strokes)
      // starts a group move, not a rubber-band (FRT lesson).
      if(!multi && this.selIds.length>1 && g){
        if(p.x>=g.b.x1&&p.x<=g.b.x2&&p.y>=g.b.y1&&p.y<=g.b.y2){
          this._dragState={type:'move', startX:p.x, startY:p.y, moved:false, orig:this._snapSel()};
          return;
        }
      }
      if(hit){
        if(multi){
          var ix=this.selIds.indexOf(hit.id);
          if(ix!==-1) this.selIds.splice(ix,1); else this.selIds.push(hit.id);
          this._dragState=null; this.render(); return;
        }
        if(this.selIds.indexOf(hit.id)===-1) this.selIds=[hit.id];
        this._dragState={type:'move', startX:p.x, startY:p.y, moved:false, orig:this._snapSel()};
        this.render();
      } else {
        this.selIds=[]; this._rubberBand={x1:p.x,y1:p.y,x2:p.x,y2:p.y};
        this._dragState={type:'rubberband'}; this.render();
      }
    },
    _selMove:function(p){
      var ds=this._dragState; if(!ds) return; var self=this;
      if(ds.type==='rubberband'){ this._rubberBand.x2=p.x; this._rubberBand.y2=p.y; this.render(); return; }
      if(ds.type==='move'){
        var dx=p.x-ds.startX, dy=p.y-ds.startY;
        if(Math.abs(dx)<2&&Math.abs(dy)<2&&!ds.moved) return;
        ds.moved=true;
        for(var i=0;i<this.selIds.length;i++){
          var s=this._findStroke(this.selIds[i]); if(!s) continue;
          var o=JSON.parse(ds.orig[i]);
          s.pts=o.pts.map(function(q){return {x:q.x+dx, y:q.y+dy};});
          if(o.eraserMask){ s.eraserMask=JSON.parse(JSON.stringify(o.eraserMask)); if(window.MarkupEraser) window.MarkupEraser.xformMask(s, function(q){return {x:q.x+dx, y:q.y+dy};}); }   // S459: masks follow
        }
        this.render(); return;
      }
      if(ds.type==='resize'){
        // S314b FIX (field report): the corner handle has a ±11px hit zone; the old
        // factor |p-anchor|/boundsWidth started <1 when the press landed inside the
        // zone, so the markup visibly shrank ON CONTACT before any drag. Ratio the
        // scale to the press point instead — exactly 1.0 at the moment of touch.
        var ax=ds.anchorX, ay=ds.anchorY;
        function _dA(x,y){ var dx=x-ax, dy=y-ay; return Math.sqrt(dx*dx+dy*dy); }
        var f=Math.max(0.1,Math.min(10,_dA(p.x,p.y)/Math.max(1,_dA(ds.startX,ds.startY))));
        if(Math.abs(f-1)<0.01 && !ds.moved) return;   // dead-zone: ignore press jitter
        ds.moved=true;
        for(var ri=0;ri<this.selIds.length;ri++){
          var rs=this._findStroke(this.selIds[ri]); if(!rs) continue;
          var ro=JSON.parse(ds.orig[ri]);
          rs.pts=ro.pts.map(function(q){return {x:ax+(q.x-ax)*f, y:ay+(q.y-ay)*f};});
          if(ro.eraserMask){ rs.eraserMask=JSON.parse(JSON.stringify(ro.eraserMask)); if(window.MarkupEraser) window.MarkupEraser.xformMask(rs, function(q){return {x:ax+(q.x-ax)*f, y:ay+(q.y-ay)*f};}, f); }   // S459: masks follow
          if(ro.size) rs.size=Math.max(1, ro.size*f);
          if(ro.fontSize) rs.fontSize=Math.max(8, ro.fontSize*f);
        }
        this.render(); return;
      }
      if(ds.type==='rotate'){
        var cx=ds.centerX, cy=ds.centerY, cur=Math.atan2(p.y-cy,p.x-cx), dA=cur-ds.startAngle;
        ds.moved=true;
        var _rotFn=function(q){ return rotPt(q,{x:cx,y:cy},dA); };
        for(var ti=0;ti<this.selIds.length;ti++){
          var ts=this._findStroke(this.selIds[ti]); if(!ts) continue;
          var to=JSON.parse(ds.orig[ti]);
          // v2.0.0: rotation semantics are HOST-INJECTED (Diesel: .rot render-time;
          // FRT: bake pen/highlight points, .rotation for shapes/text).
          this._selHooks.applyRotate.call(this, ts, to, dA, _rotFn);
        }
        this.render(); return;
      }
    },
    _selUp:function(){
      var ds=this._dragState; var self=this;
      if(ds && ds.type==='rubberband' && this._rubberBand){
        var r=this._rubberBand, rx1=Math.min(r.x1,r.x2), ry1=Math.min(r.y1,r.y2),
            rx2=Math.max(r.x1,r.x2), ry2=Math.max(r.y1,r.y2);
        if(Math.abs(rx2-rx1)>4||Math.abs(ry2-ry1)>4){
          var hits=[];
          this.strokes.forEach(function(s){
            var b=self._selHooks.aabb.call(self, s); if(!b) return;
            if(b.x2>=rx1&&b.x1<=rx2&&b.y2>=ry1&&b.y1<=ry2) hits.push(s.id);
          });
          this.selIds=hits;
        }
        this._rubberBand=null;
      }
      if(ds && (ds.type==='move'||ds.type==='resize'||ds.type==='rotate') && ds.moved && ds.orig){
        var after=this._snapSel();
        if(after.join('\u0001')!==ds.orig.join('\u0001')){
          this._selHooks.logOp.call(this, {t:'gmod', ids:this.selIds.slice(), before:ds.orig, after:after});
          if(this._onDirty) this._onDirty();
        }
      }
      this._dragState=null; this.render(); this._emitSel();
    },
    // ── S461: CONTOUR halo path (Mark, field report) ───────────────────────
    // The amber member indicator is SIGNAGE ONLY — it says "this mark is in the
    // group", nothing more. It is never a drag target (dragging belongs to the
    // BLUE group box alone — S459e). So it should trace the mark's OWN shape,
    // not a bounding box: a rectangular frame around a triangle left two huge
    // empty corners that read as clutter and invited misclicks.
    //
    // This lays down the mark's true path on ctx (no stroke/fill — the caller
    // decides). Rotation is honored by rotating the ctx about the stroke center,
    // exactly as the host renderer does, so the halo can never drift off a
    // rotated mark. Returns true if a real contour was pathed; false means the
    // caller must fall back to the AABB (text: a box IS its true shape; cloud:
    // per-surface design, deliberately not unified — see markupTools A3).
    // Caller MUST wrap in save/restore: this may leave a ctx transform applied.
    // Paint the amber contour halo for ONE grouped member. off = px off the ink.
    _selHaloPath:function(ctx, s){
      // v2.6.0 (S461j, Mark: "you had it backwards" — the ink-hugging glow IS
      // the member indicator; dims/text must MATCH it, not the other way).
      // Hosts may inject haloPath(ctx, s) to trace types the default can't
      // (the drawing viewer supplies DIMENSION tracing: offset line + legs +
      // label chip). Hook returns true = path laid; false/undefined = fall
      // through to the default below.
      var hp=this._selHooks && this._selHooks.haloPath;
      if(hp){ var r=hp.call(this, ctx, s); if(r===true) return true; if(r===false) return false; }
      var pts=s.pts||[];
      if(!pts.length) return false;
      var MT=(typeof window!=='undefined') ? window.MarkupTools : null;
      var isShape = MT && MT.isShapeTool && MT.isShapeTool(s.tool);
      var isFree  = (s.tool==='pen' || s.tool==='highlight');
      if(!isShape && !isFree) return false;          // text / cloud / unknown → AABB fallback
      if(s.rot){                                     // rotate the ctx, then path in local coords
        var c=this._strokeCenter(s);
        ctx.translate(c.x,c.y); ctx.rotate(s.rot); ctx.translate(-c.x,-c.y);
      }
      if(isFree){
        ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
        for(var i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);   // lineTo only — never quadraticCurveTo
        return true;
      }
      // Shape: reuse the CANONICAL renderer so the halo can never disagree with
      // the ink. drawShape strokes as it paths, so we run it with a transparent
      // stroke purely to lay down the geometry, then the caller re-strokes it.
      var p0=pts[0], p1=pts[pts.length-1];
      var oa=ctx.globalAlpha, os=ctx.strokeStyle;
      ctx.globalAlpha=0;
      var handled=MT.drawShape(ctx, s.tool, p0.x, p0.y, p1.x, p1.y);
      ctx.globalAlpha=oa; ctx.strokeStyle=os;
      return !!handled;                              // false (cloud) → AABB fallback
    },
    _drawSelHalo:function(ctx, s, k, active){
      var ink=(s.size||s.lineWidth||2);
      var off=3*k;                                   // S461: Mark-approved 3px offset
      ctx.save();
      ctx.lineCap='round'; ctx.lineJoin='round'; ctx.setLineDash([]);
      var pathed=this._selHaloPath(ctx, s);
      if(pathed){
        // Translucent glow hugging the ink, traced along the mark's real shape.
        ctx.globalAlpha = active ? SEL.haloAlphaActive : SEL.haloAlpha;
        ctx.strokeStyle = active ? SEL.haloActive : SEL.halo;
        ctx.lineWidth   = ink + 2*off + (active ? 2.5*k : 0);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        // AABB fallback (text: the box IS the shape; cloud: not unified).
        var b=this._selHooks.aabb.call(this, s);
        var x=b.x1-off, y=b.y1-off, w=(b.x2-b.x1)+2*off, h=(b.y2-b.y1)+2*off;
        ctx.globalAlpha = active ? SEL.haloAlphaActive : SEL.haloAlpha;
        ctx.strokeStyle = active ? SEL.haloActive : SEL.halo;
        ctx.lineWidth   = Math.max(2, (active?3.4:2.4)*k);
        ctx.strokeRect(x,y,w,h);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
    _drawSelChrome:function(ctx){
      // S344 two-SET tap: the PICK set (_pickIds) shows a per-mark cyan glow + green check so
      // you see exactly which individuals are picked. The GROUP box (selIds) draws further below.
      var inTap=(this._selectSub==='tap');
      if(inTap && this._pickIds && this._pickIds.length){
        var self=this, pk=this._selNW()/Math.max(1,this.canvas.getBoundingClientRect().width);
        ctx.save();
        // glow boxes
        this._pickIds.forEach(function(id){ var s=self._findStroke(id); if(!s) return; var b=self._selHooks.aabb.call(self, s);
          var x=b.x1-3*pk, y=b.y1-3*pk, w=(b.x2-b.x1)+6*pk, h=(b.y2-b.y1)+6*pk;
          ctx.shadowColor='#46C5E8'; ctx.shadowBlur=10*pk;
          ctx.strokeStyle='#46C5E8'; ctx.lineWidth=Math.max(1.6,1.8*pk); ctx.globalAlpha=0.90;   // S461p (Mark): picking glow 10% more transparent — ALPHA ONLY
          ctx.strokeRect(x,y,w,h);
          ctx.shadowBlur=0; ctx.strokeRect(x,y,w,h);
        });
        // green ✓ badge at the top of each picked mark
        var br=9*pk;
        this._pickIds.forEach(function(id){ var s=self._findStroke(id); if(!s) return; var b=self._selHooks.aabb.call(self, s);
          var bx=(b.x1+b.x2)/2, by=b.y1-3*pk-br;
          ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2); ctx.fillStyle='#3FD08A'; ctx.fill();
          ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(1.4,1.8*pk); ctx.lineCap='round'; ctx.lineJoin='round';
          ctx.beginPath(); ctx.moveTo(bx-br*0.45,by); ctx.lineTo(bx-br*0.1,by+br*0.4); ctx.lineTo(bx+br*0.5,by-br*0.4); ctx.stroke();
        });
        ctx.restore();
      }
      if(this._rubberBand){
        var rb=this._rubberBand, rk=this._selNW()/Math.max(1,this.canvas.getBoundingClientRect().width);
        ctx.save(); ctx.setLineDash([4*rk,3*rk]); ctx.strokeStyle=SEL.group; ctx.lineWidth=Math.max(1.4,1.4*rk); ctx.globalAlpha=1;
        ctx.strokeRect(Math.min(rb.x1,rb.x2),Math.min(rb.y1,rb.y2),Math.abs(rb.x2-rb.x1),Math.abs(rb.y2-rb.y1));
        ctx.setLineDash([]); ctx.restore();
      }
      // S344: GROUPED marks (selIds) each get an amber frame so they read as "in the group",
      // distinct from the cyan/green PICK state. The tapped "active" grouped mark gets a thicker
      // solid amber frame (it's the one the round Ungroup button will pull out).
      if(inTap && this.selIds && this.selIds.length){
        var selfG=this, pkG=this._selNW()/Math.max(1,this.canvas.getBoundingClientRect().width), actId=this._groupActiveId;
        ctx.save();
        // S461 (Mark, field report): amber members are now a CONTOUR HALO tracing
        // each mark's own shape — a triangle gets a triangle, a squiggle a squiggle.
        // The old rectangular frames (S459f, 1px-tight) left big empty corners on
        // non-rectangular marks. Signage only: this never was and still is not a
        // drag target — the wide grab pad belongs to the BLUE group box (S459e).
        this.selIds.forEach(function(id){
          var s=selfG._findStroke(id); if(!s) return;
          selfG._drawSelHalo(ctx, s, pkG, id===actId);
        });
        ctx.setLineDash([]); ctx.restore();
      }
      if(!this.hasSel()) return;   // group box only when there IS a grouped selection (selIds)
      var g=this._selGeom(); if(!g) return;
      var lw=Math.max(2,2*g.k);   // S461b: was 1.5 — too thin to see on a busy site photo
      ctx.save(); ctx.globalAlpha=1;
      // dashed group box
      ctx.setLineDash([lw*3,lw*2]); ctx.strokeStyle=SEL.group; ctx.lineWidth=lw;
      ctx.strokeRect(g.b.x1,g.b.y1,g.b.x2-g.b.x1,g.b.y2-g.b.y1); ctx.setLineDash([]);
      // corner scale handles
      ctx.fillStyle='#fff'; ctx.strokeStyle=SEL.group; ctx.lineWidth=lw;
      g.corners.forEach(function(q){ ctx.fillRect(q.x-g.hs/2,q.y-g.hs/2,g.hs,g.hs); ctx.strokeRect(q.x-g.hs/2,q.y-g.hs/2,g.hs,g.hs); });
      // rotate handle (stem + circle)
      ctx.beginPath(); ctx.moveTo((g.b.x1+g.b.x2)/2,g.b.y1); ctx.lineTo(g.rot.x,g.rot.y+g.rot.r); ctx.stroke();
      ctx.beginPath(); ctx.arc(g.rot.x,g.rot.y,g.rot.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(g.rot.x,g.rot.y,g.rot.r*0.55,-0.3,Math.PI*1.4); ctx.stroke();
      // delete handle (muted red ✕)
      ctx.beginPath(); ctx.arc(g.del.x,g.del.y,g.del.r,0,Math.PI*2); ctx.fillStyle=SEL.groupDelete; ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold '+Math.round(g.del.r*1.15)+'px Calibri,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('\u2715',g.del.x,g.del.y+g.k*0.5);
      // S344 Phase 2c: copy handle (blue circle + two-rect glyph, bottom-center, stem)
      if(g.copy){
        ctx.strokeStyle=SEL.group; ctx.lineWidth=lw;
        ctx.beginPath(); ctx.moveTo((g.b.x1+g.b.x2)/2,g.b.y2); ctx.lineTo(g.copy.x,g.copy.y-g.copy.r); ctx.stroke();
        ctx.beginPath(); ctx.arc(g.copy.x,g.copy.y,g.copy.r,0,Math.PI*2); ctx.fillStyle=SEL.groupCopy; ctx.fill();
        ctx.strokeStyle=SEL.groupCopy; ctx.stroke();
        // two-rect copy glyph (white): back rect up-left, front rect down-right
        var u=g.copy.r*0.42;
        ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(1,lw*0.9);
        ctx.strokeRect(g.copy.x-u*1.4, g.copy.y-u*1.4, u*1.8, u*2.2);
        ctx.fillStyle=SEL.groupCopy; ctx.fillRect(g.copy.x-u*0.2, g.copy.y-u*0.2, u*1.8, u*2.2);
        ctx.strokeRect(g.copy.x-u*0.2, g.copy.y-u*0.2, u*1.8, u*2.2);
      }
      ctx.restore();
    },
  };

  // v2.0.0 — host hooks. Each markup surface injects its own transform/coordinate
  // semantics; omitted hooks default to the DIESEL model, so Diesel's existing
  // install(E) call keeps byte-identical behavior.
  //   aabb(s)                   — rotation-aware VISUAL bounds of a stroke
  //   applyRotate(ts,to,dA,rot) — apply a rotate gesture to stroke ts from its
  //                               snapshot to; rot(pt) rotates about the group
  //                               center by dA. Diesel default: translate pts by
  //                               center delta, masks follow, ts.rot += dA.
  //                               FRT injects: bake pen/highlight, .rotation for
  //                               shapes/text.
  //   logOp(op)                 — group-op log (gmod/gdel/gadd); default _pushOp.
  var DEFAULT_HOOKS = {
    aabb: function(s){ return this._strokeAABB(s); },
    applyRotate: function(ts, to, dA, rot){
      var oc=this._strokeCenter(to);
      var nc=rot(oc);
      var mdx=nc.x-oc.x, mdy=nc.y-oc.y;
      ts.pts=to.pts.map(function(q){return {x:q.x+mdx, y:q.y+mdy};});
      if(to.eraserMask){ ts.eraserMask=JSON.parse(JSON.stringify(to.eraserMask)); if(window.MarkupEraser) window.MarkupEraser.xformMask(ts, function(q){return {x:q.x+mdx, y:q.y+mdy};}); }
      ts.rot=(to.rot||0)+dA;
    },
    logOp: function(op){ this._pushOp(op); },
    // v2.4.0: precise ink hit — default accepts the AABB verdict (photo hosts).
    hitInk: function(_s, _p, _tol){ return true; },
    // v2.6.0: optional host contour for types the default halo can't trace
    // (drawing viewer: dimensions). undefined = use the default path logic.
    haloPath: function(_ctx, _s){ return undefined; }
  };

  function install(E, hooks){
    for (var k in M){ if (Object.prototype.hasOwnProperty.call(M, k)) E[k] = M[k]; }
    E._selHooks = {};
    for (var hk in DEFAULT_HOOKS){ E._selHooks[hk] = (hooks && hooks[hk]) || DEFAULT_HOOKS[hk]; }
    if (!E.selIds) E.selIds = [];
    if (!E._pickIds) E._pickIds = [];
    if (E._selectSub === undefined) E._selectSub = 'rubber';
    if (E._dragState === undefined) E._dragState = null;
    if (E._rubberBand === undefined) E._rubberBand = null;
    if (E._grouped === undefined) E._grouped = false;
    if (E._groupActiveId === undefined) E._groupActiveId = null;
    if (E._onSelChange === undefined) E._onSelChange = null;
    return E;
  }

  var API = { install: install, VERSION: '2.8.1' };
  if (root) root.MarkupSelection = API;
  try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
