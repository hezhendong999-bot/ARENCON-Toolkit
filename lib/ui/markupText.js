/**
 * ARENCON — Shared Markup Text Engine
 * ════════════════════════════════════
 * CANONICAL SOURCE: the Diesel lightbox text engine (S344 Phase 2d/4 — itself the
 * FRT _textPrompt port — plus S459f halo removal, Mark field-approved). Extracted
 * VERBATIM from ARENCON_Diesel_Fire_Pump_Commissioning.html at build S459g.
 *
 * TWO PARTS:
 *   drawText(ctx, s, sx, sy) — paints a committed text stroke (bold Calibri, optional
 *     bg pill, NO halo per S459f). Returns true if handled; hosts keep their local
 *     branch as a fallback (the markupTools paint-safety pattern).
 *   install(E) — adds _promptText: the on-photo contentEditable editor with the
 *     docked-bar controller (size steps, color, bg, newline, commit/cancel),
 *     tap-to-edit (editId), natural-px fontSize, op-logged add/mod/del.
 *
 * HOST-AGNOSTIC REDO-CLEAR: commit clears only ARRAY-typed redo stores
 * (redo/redoOps/redoStack/_histRedo) — FRT's redo is a FUNCTION; never assign it.
 * REQUIRED HOST SURFACE for _promptText:
 *   canvas, nw, nh, strokes[], render(), _findStroke, _uid, _pushOp, _onDirty?,
 *   _styleFn (tool/color/fontSize/alpha), _PALETTE, _SIZE_STEPS, redo[],
 *   _onTextStart? / _onTextEnd? (docked bar hooks), _textInput/_textController slots.
 * Stroke model: {tool:'text', pts:[{x,y}], text, color, bg, fontSize, alpha} —
 * fontSize in NATURAL px; bg 'none' = clean.
 */
(function (root) {
  'use strict';

  // ── Paint (verbatim S459f branch body) ──
  function drawText(ctx, s, sx, sy){
    if (!s || s.tool !== 'text') return false;
    sx = sx || 1; sy = sy || 1;
        if(s._editing){ /* the on-photo box is showing; don't double-draw */ }
        else {
          var fp=(s.fontSize||24)*((sx+sy)/2);
          ctx.font='bold '+fp+'px Calibri,Arial,sans-serif'; ctx.textBaseline='alphabetic';
          var lines=String(s.text||'').split('\n');
          var lineH=fp*1.25, tx=s.pts[0].x*sx, ty=s.pts[0].y*sy;
          // optional background pill behind the whole block
          if(s.bg && s.bg!=='none'){
            var maxw=0; for(var li=0;li<lines.length;li++){ var w=ctx.measureText(lines[li]).width; if(w>maxw)maxw=w; }
            var padX=fp*0.25, padY=fp*0.18;
            var blkH=lineH*lines.length;
            ctx.save(); ctx.globalAlpha=(s.alpha==null?1:s.alpha);
            ctx.fillStyle=s.bg;
            ctx.fillRect(tx-padX, ty-fp-padY, maxw+padX*2, blkH+padY*2);
            ctx.restore();
          }
          // S459f (Mark): NO dark halo/outline on text — it muddied the glyphs and made
          // them hard to read. Plain fill only; the optional bg pill remains available.
          for(var ln=0;ln<lines.length;ln++){
            var yy=ty+ln*lineH;
            ctx.fillStyle=s.color; ctx.fillText(lines[ln], tx, yy);
          }
        }
    return true;
  }

  var M = {
    // S344 Phase 2d: on-photo editable text box (FRT _textPrompt port). A contentEditable
    // div sits in screen space over the canvas; the lightbox docked text bar drives size,
    // text colour, bg colour, newline, ✓/✕ via the returned controller. Multi-line supported.
    // editId re-opens an existing text stroke. Diesel coords: natural px on the canvas
    // backing store; fontSize stored in natural px; bg = optional pill colour ('none'=clean).
    _promptText:function(p, st, editId){
      var self=this;
      if(self._textInput){ try{ self._textInput.parentNode.removeChild(self._textInput); }catch(_){} self._textInput=null; }
      var editStroke = editId ? self._findStroke(editId) : null;
      var startText  = editStroke ? (editStroke.text||'') : '';
      var startFont  = editStroke ? self._txtHooks.readFontN.call(self, editStroke) : self._txtHooks.newFontN.call(self, st);   // natural px (hooked)
      var startColor = editStroke ? (editStroke.color||self._lastTextColor||st.color) : (self._lastTextColor||st.color||'#A85959');
      var startBg    = editStroke ? (editStroke.bg||'none') : (self._lastTextBg||'none');
      if(editStroke){ editStroke._editing=true; self.render(); }
      var anchor=editStroke ? {x:editStroke.pts[0].x, y:editStroke.pts[0].y} : {x:p.x, y:p.y};
      var fontN=startFont;                                            // current font in natural px
      var curColor=startColor, curBg=startBg;
      var box=document.createElement('div');
      box.className='dlb-mk-text-box';
      box.contentEditable='true'; box.spellcheck=false;
      // S344 Phase 4 fix: the box lives INSIDE the photo area (dlb-canvas's parent), not on
      // document.body. Absolute-positioned in the area's coordinate space so it (a) is clipped
      // to the lightbox and can never leak onto other pages, and (b) tracks the canvas as the
      // user pans/zooms (positionBox reads the canvas's live offset+scale and is re-run via
      // repositionTextBox() from the lightbox's _apply()).
      box.style.cssText='position:absolute;z-index:10050;min-width:8px;max-width:calc(100% - 4px);outline:none;'+
        'font-family:Calibri,Arial,sans-serif;font-weight:bold;line-height:1.25;white-space:pre-wrap;'+
        'word-break:break-word;padding:1px 4px;border-radius:4px;caret-color:#fff;';
      var _pl=self._txtHooks.placement.call(self);
      var host=_pl.host||document.body;
      host.appendChild(box);
      self._textInput=box;
      if(startText){ box.textContent=startText; }
      function curScaleY(){ return _pl.sy(); }
      function curScaleX(){ return _pl.sx(); }
      function screenFont(){ return fontN*curScaleY(); }
      function positionBox(){
        // canvas offset within the area (= _panX/_panY) + anchor scaled to current display size
        var sf=screenFont();
        var _o=_pl.origin();
        var sx=_o.x + anchor.x*curScaleX();
        var sy=_o.y + anchor.y*curScaleY();
        box.style.left=Math.max(2, Math.round(sx-4))+'px';   // v2 union: FRT edge clamp
        box.style.top =Math.max(2, Math.round(sy-sf))+'px';
      }
      // expose so the lightbox can keep the box glued during pan/zoom — ONLY for
      // hosts whose placement tracks (Diesel). FRT places ONCE on document.body:
      // repositioning after the mobile keyboard opens yanks the box (S403 rule).
      self._repositionTextBox = _pl.track ? function(){ if(self._textInput===box){ box.style.fontSize=screenFont()+'px'; positionBox(); } } : null;
      function applyStyle(){
        box.style.fontSize=screenFont()+'px';
        box.style.color=curColor;
        box.style.background='rgba(20,18,24,.55)';   // editing backing pill (readability)
        positionBox();
      }
      applyStyle(); box.focus();
      requestAnimationFrame(function(){ try{ box.focus(); placeCaretEnd(); }catch(_){} });
      function placeCaretEnd(){ try{ var rg=document.createRange(); rg.selectNodeContents(box); rg.collapse(false);
        var s=window.getSelection(); s.removeAllRanges(); s.addRange(rg);}catch(_){} }
      var resolved=false;
      function cleanup(){
        if(box.parentNode) box.parentNode.removeChild(box);
        if(self._textInput===box) self._textInput=null;
        self._repositionTextBox=null;
        if(editStroke){ delete editStroke._editing; }
        self._textController=null;
        if(self._onTextEnd) self._onTextEnd();
      }
      function commit(){
        if(resolved) return; resolved=true;
        var r2=self.canvas.getBoundingClientRect();
        var br=box.getBoundingClientRect();
        var sx2=r2.width/self.nw, sy2=r2.height/self.nh;
        var ascent=fontN*sy2;
        var lx=(br.left+4 - r2.left)/sx2;
        var ly=(br.top  - r2.top + ascent)/sy2;
        var v=(box.innerText||box.textContent||'').replace(/[ \t]+$/,'').replace(/\n+$/,'');
        self._lastTextColor=curColor; self._lastTextBg=curBg;
        if(editStroke){
          if(!v.trim()){ var ix=self.strokes.indexOf(editStroke); if(ix>=0){ self.strokes.splice(ix,1); self._pushOp({t:'del', idx:ix, stroke:editStroke}); } }
          else { var before=JSON.stringify(editStroke); self._txtHooks.applyEdit.call(self, editStroke, v, fontN, curColor, curBg, lx, ly);
            var eix=self.strokes.indexOf(editStroke); self._pushOp({t:'mod', idx:eix, before:before, after:JSON.stringify(editStroke)}); }
          delete editStroke._editing; (function(h){ if(Array.isArray(h.redo)) h.redo=[]; if(Array.isArray(h.redoOps)) h.redoOps=[]; if(Array.isArray(h.redoStack)) h.redoStack=[]; if(Array.isArray(h._histRedo)) h._histRedo=[]; })(self); if(self._onDirty) self._onDirty(); self.render(); cleanup(); return;
        }
        if(v.trim()){
          var ns=self._txtHooks.buildStroke.call(self, v, fontN, curColor, curBg, lx, ly, st);
          self.strokes.push(ns); self._pushOp({t:'add'}); (function(h){ if(Array.isArray(h.redo)) h.redo=[]; if(Array.isArray(h.redoOps)) h.redoOps=[]; if(Array.isArray(h.redoStack)) h.redoStack=[]; if(Array.isArray(h._histRedo)) h._histRedo=[]; })(self); if(self._onDirty) self._onDirty();
        }
        self.render(); cleanup();
      }
      function cancel(){ if(resolved) return; resolved=true; self.render(); cleanup(); }
      box.addEventListener('keydown', function(e){
        if(e.key==='Escape'){ e.preventDefault(); cancel(); }
        e.stopPropagation();   // Enter = newline (contentEditable default)
      });
      var controller={
        isActive:function(){ return !resolved; },
        getSize:function(){ return self._txtHooks.displaySize.call(self, fontN); },
        getColor:function(){ return curColor; },
        getBg:function(){ return curBg; },
        palette:self._PALETTE,
        stepSize:function(dir){
          fontN=self._txtHooks.stepFontN.call(self, fontN, dir); applyStyle(); box.focus();
          return self._txtHooks.displaySize.call(self, fontN);
        },
        setColor:function(c){ curColor=c; self._lastTextColor=c; box.style.color=c; box.focus(); },
        setBg:function(c){ curBg=c; self._lastTextBg=c; box.focus(); },
        insertNewline:function(){ box.focus(); try{ document.execCommand('insertLineBreak'); }catch(_){ document.execCommand('insertText',false,'\n'); } },
        commit:commit, cancel:cancel
      };
      self._textController=controller;
      // 2d-1 fallback: if no docked text bar is wired (no _onTextStart), commit on blur so
      // the box is usable on its own. Once 2d-2 wires the bar, _onTextStart exists and the
      // bar's ✓/✕ drive commit/cancel (FRT model — no blur-commit).
      if(!self._onTextStart){
        box.addEventListener('blur', function(){ setTimeout(commit, 60); });
      }
      if(self._onTextStart) self._onTextStart(controller);
      return controller;
    },
  };

  // v2.0.0 — host hooks (Diesel defaults preserve current behavior byte-for-byte):
  //   readFontN(editStroke)      -> working font in NATURAL px
  //   newFontN(style)            -> natural font for a new text
  //   storeFont(target, fontN)   -> write the host's font field (Diesel fontSize; FRT size=fontN/4)
  //   stepFontN(fontN, dir)      -> next size (Diesel walks _SIZE_STEPS natural;
  //                                 FRT walks its steps in nominal SCREEN px * uiScale)
  //   displaySize(fontN)         -> number the docked bar shows
  //   placement()                -> { host, origin(), sx(), sy(), track }
  //                                 Diesel: canvas-parent, offset model, tracks pan/zoom;
  //                                 FRT: document.body, viewport rect captured ONCE
  //                                 (S403: never reposition after mobile keyboard opens)
  //   buildStroke(v,fontN,color,bg,lx,ly,style) -> new stroke object (host schema)
  //   applyEdit(stroke,v,fontN,color,bg,lx,ly)  -> mutate an edited stroke (host schema)
  var TEXT_DEFAULT_HOOKS = {
    readFontN: function(es){ return (es && es.fontSize) || 24; },
    newFontN: function(st){ return (st && st.fontSize) || 24; },
    storeFont: function(t, fontN){ t.fontSize = fontN; },
    stepFontN: function(fontN, dir){
      var steps=this._SIZE_STEPS, i=0, best=1e9;
      for(var k=0;k<steps.length;k++){ var d=Math.abs(steps[k]-fontN); if(d<best){best=d;i=k;} }
      i=Math.max(0,Math.min(steps.length-1,i+dir)); return steps[i];
    },
    displaySize: function(fontN){ return Math.round(fontN); },
    placement: function(){
      var self=this;
      return {
        host:(self.canvas&&self.canvas.parentNode)||document.body,
        origin:function(){ return {x:self.canvas?self.canvas.offsetLeft:0, y:self.canvas?self.canvas.offsetTop:0}; },
        sx:function(){ var dw=self.canvas?self.canvas.offsetWidth:self.nw; return dw/self.nw; },
        sy:function(){ var dh=self.canvas?self.canvas.offsetHeight:self.nh; return dh/self.nh; },
        track:true
      };
    },
    buildStroke: function(v, fontN, color, bg, lx, ly, st){
      return { id:this._uid(), tool:'text', pts:[{x:lx,y:ly}], text:v, color:color, bg:bg, fontSize:fontN, alpha:(st&&st.alpha==null?1:(st?st.alpha:1)) };
    },
    applyEdit: function(es, v, fontN, color, bg, lx, ly){
      es.text=v; this._txtHooks.storeFont.call(this, es, fontN); es.color=color; es.bg=bg; es.pts[0]={x:lx,y:ly};
    }
  };

  function install(E, hooks){
    for (var k in M){ if (Object.prototype.hasOwnProperty.call(M, k)) E[k] = M[k]; }
    E._txtHooks = {};
    for (var hk in TEXT_DEFAULT_HOOKS){ E._txtHooks[hk] = (hooks && hooks[hk]) || TEXT_DEFAULT_HOOKS[hk]; }
    return E;
  }

  var API = { drawText: drawText, install: install, VERSION: '2.0.0' };
  if (root) root.MarkupText = API;
  try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
