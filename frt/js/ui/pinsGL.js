// FRT v2 — Pin Renderer (Canvas 2D)
// ════════════════════════════════════════════════════════════════════════════
// Session 81, Option B: Rewritten from Pixi/WebGL to Canvas 2D. The previous
// WebGL implementation collided with the WebGL markup renderer — two Pixi
// Application instances fighting for GL context resources caused pins to
// render solid black ("object does not belong to this context" errors).
//
// This Canvas 2D implementation keeps the same public API, the same fixed-
// screen-size behavior, and renders at 60fps for the 10-20 pins typical in a
// field review. No WebGL context — no collision.
//
// Public API (unchanged from v1.x so viewer.js needs no changes):
//   window.PinsGL = {
//     isSupported(): boolean,                        // always true for 2D
//     init(hostEl, {w, h}): Promise<true>,           // hostEl = dv-canvas-area
//     resize(w, h),
//     render(pins, {scale, panX, panY, pinScale, hoveredId, activeId,
//                   imgRect, naturalW, naturalH}),
//     hitTest(clientX, clientY): deficId | null,
//     hitTestAll(clientX, clientY): deficId[],
//     getPinScreenRect(deficId): {x,y,w,h,sx,sy,pin} | null,
//     destroy(),
//     version: '2.0-canvas2d'
//   };
//
// Pin record shape (S154 extended):
//   { deficId: string, num: number, pinX: 0..1, pinY: 0..1,
//     priority: 'high'|'low'|'general', isClosed: bool, isIAR: bool,
//     isSiteRecord: bool }
//
// Visual behavior matches HTML V1 pins with WebGL polish carried over:
//   - Fixed CSS screen size regardless of drawing zoom (pinScale modulation only)
//   - Anchored at bottom-center (tip = exact logical pin location)
//   - Solid priority color + white circle + priority-colored number (V1 flat)
//   - Drop shadow + priority halo for open, non-IAR items
//   - Hover:  1.08× scale, 1.8× halo, 1.3× shadow
//   - Active: 1.15× scale, 2.5× halo, 1.6× shadow
//   - Closed: 0.5 alpha
//   - S154 NEW: Site Records render in indigo #6B6FA8 (canon Site Records colour)
//   - Lives outside dv-img-wrap so CSS zoom never scales the pin
//
(function(){
  'use strict';

  // Canvas 2D is universally supported; this is a formality for API parity.
  function isSupported(){ return true; }

  // ─── Module state ───────────────────────────────────────────────────────
  var _canvas = null;
  var _ctx    = null;
  var _host   = null;
  var _dpr    = 1;
  var _cssW   = 0;
  var _cssH   = 0;

  var _pinSize = 32;          // CSS px wide (height = 42/32 × this). Reduced on
                              // coarse-pointer devices below.
  // S81: shrink on touch devices where the viewport is tight and pins overlap.
  (function(){
    try {
      if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches){
        _pinSize = 24;
      }
    } catch(_){}
  })();
  var _pins = [];             // last rendered pin list (for hit testing)
  var _pinScreenPos = {};     // deficId -> {x,y,w,h,sx,sy,pin} in canvas-local CSS px

  // S(this) Contractor Highlight Mode — per-session view lens (NOT persisted).
  // null = all pins full colour; otherwise pins whose contractorId !== this id
  // dim to CTR_DIM_ALPHA with reduced shadow. Pure view state.
  var _highlightCtrId = null;
  var CTR_DIM_ALPHA = 0.10;
  var _lastOpts = null;       // cached render opts (for highlight-toggle re-render)
  // Solid muted-green closed pins (Mark-confirmed at build). Closed pins fill
  // #5F8068 instead of priority colour so they read as resolved on busy linework.
  var GREEN_CLOSED = true;

  // ─── Priority color lookups (match HTML V1) ─────────────────────────────
  // S154: Site Record check takes precedence over IAR and priority so
  // a Site Record pin reads as "internal documentation" first and
  // foremost. Indigo #6B6FA8 matches the on-screen card + PDF teardrop.
  function _priorityFillHex(pin){
    if (GREEN_CLOSED && pin.isClosed) return '#5F8068';  // resolved → muted green
    if (pin.isRecommendation) return '#5E5440';          // S317: rec → brown (matches PDF .rec-chip; rec wins over site/priority; closed above still wins)
    if (pin.isSiteRecord) return '#6B6FA8';
    if (pin.priority === 'general') return '#5F8068';
    if (pin.priority === 'low')     return '#B07F5A';
    return '#A85959'; // high
  }

  // ─── Teardrop path in native 32×42 coord space (centered at 16, 21) ─────
  // Scale/offset applied via ctx.save/translate/scale at call site.
  function _teardropPath(ctx, dx, dy, factor){
    var cx = 16, cy = 21;
    function sx(x){ return cx + (x - cx) * factor + dx; }
    function sy(y){ return cy + (y - cy) * factor + dy; }
    ctx.beginPath();
    ctx.moveTo(sx(16), sy(1));
    ctx.bezierCurveTo(sx(8.3), sy(1), sx(2), sy(7.3), sx(2), sy(15));
    ctx.bezierCurveTo(sx(2), sy(25.5), sx(16), sy(40), sx(16), sy(40));
    ctx.bezierCurveTo(sx(16), sy(40), sx(30), sy(25.5), sx(30), sy(15));
    ctx.bezierCurveTo(sx(30), sy(7.3), sx(23.7), sy(1), sx(16), sy(1));
    ctx.closePath();
  }

  // V1 filter strings (toned down slightly per S81 feedback — less heavy shadow):
  //   outstanding: drop-shadow(0 0 2px fill) drop-shadow(0 1px 3px rgba(0,0,0,.4))
  //   other:       drop-shadow(0 1px 3px rgba(0,0,0,.35))
  //   ready (S81 match V1 press-and-hold): blue glow 8px indicating ready-to-drag
  //   highlight (S179c): gold glow + 1.4× scale for navigate-to-pin pulse — matches
  //     the HTML fallback path which already uses gold. Distinct from 'ready'
  //     (blue) and from priority-color 'active' glows.
  // Hover/active multiply blur radius so interaction feedback is visible.
  function _buildFilterString(fillHex, outstanding, state){
    if (state === 'highlight'){
      // S179c: bright gold glow for navigate-to-pin pulse. Not blue (ready),
      // not red/burgundy (priority/brand). Visible against grayscale drawings.
      return 'drop-shadow(0 0 14px #FFC400) drop-shadow(0 0 6px #FFC400) drop-shadow(0 1px 3px rgba(0,0,0,0.4))';
    }
    if (state === 'ready'){
      // V1-exact: 'drop-shadow(0 0 8px #2196F3)' — blue glow signals "you can drag now"
      return 'drop-shadow(0 0 8px #2196F3) drop-shadow(0 1px 3px rgba(0,0,0,0.4))';
    }
    var mul = state === 'active' ? 1.5 : state === 'hover' ? 1.25 : 1.0;
    if (outstanding){
      var glowR   = (2 * mul).toFixed(2);
      var shadowR = (3 * mul).toFixed(2);
      return 'drop-shadow(0 0 ' + glowR + 'px ' + fillHex + ') ' +
             'drop-shadow(0 1px ' + shadowR + 'px rgba(0,0,0,0.4))';
    }
    var r = (3 * mul).toFixed(2);
    return 'drop-shadow(0 1px ' + r + 'px rgba(0,0,0,0.35))';
  }

  // Feature-detect ctx.filter once — Safari 9.1+, universally present on modern iPad
  var _supportsFilter = (function(){
    try {
      var c = document.createElement('canvas');
      var x = c.getContext('2d');
      return typeof x.filter !== 'undefined';
    } catch(_){ return false; }
  })();

  // Draw one pin at native 32×42 coords, anchored at tip (16, 40).
  // Caller handles translate + scale to place at screen position.
  function _drawPinAtNative(ctx, pin, state, dimmed, highlightColor, pinAlpha){
    var isOutstanding = !pin.isClosed;
    /* ═══ S628e — CONTRACTOR COLOUR GOES ON THE TIP, NOT THE WHOLE BODY ══════
       Mark, three times across 08 Aug: "the contractor colour is supposed to be
       just the tip, not the entire body."

       The S328 record says whole-teardrop recolour and names it as his spec, and
       I cited that record twice before doing what he asked. Once was defensible;
       twice was not. It is his tool and his call, and the record is now wrong —
       corrected in the PK alongside this change so no later session "restores"
       whole-body recolour on the grounds that the document says so.

       He is also right on the merits, and it is more obvious now than it was at
       S328. A pin carries three separate facts: WHO placed it (the ring), HOW
       BAD it is (the body), and WHOSE trade it belongs to (the contractor).
       Repainting the whole body swallowed two of the three to show one — with
       rings now on by default, selecting a contractor turned every matching pin
       into a flat block of one colour and you could no longer see priority at
       all. Tip-only keeps all three legible at once.

       The body therefore keeps its priority/status fill even under the lens;
       only the lower point of the teardrop takes the contractor's colour. The
       DIM applied to non-matching pins is unchanged — that half of the lens was
       never the problem. */
    var ctrTip  = highlightColor || null;
    var fillHex = _priorityFillHex(pin);
    // Effective per-pin opacity (contractor-highlight dim, closed 0.5, etc.).
    // Every layer below multiplies its own alpha by this so the dim actually
    // reaches the paint — otherwise the internal globalAlpha resets wiped it.
    var _pa = (typeof pinAlpha === 'number') ? pinAlpha : 1;

    // Layer 0: teardrop silhouette with V1 filter (glow + drop shadow).
    // KEEP the full drop-shadow on dimmed pins (Mark: keep the shadow, just make
    // the pin transparent) — only drop the bright glow, not the shadow.
    if (_supportsFilter){
      ctx.filter = dimmed ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))'
                          : _buildFilterString(fillHex, isOutstanding, state);
    }

    // S83: Inspector ring — outer teardrop in inspector color, inner teardrop
    // in priority color. Only rendered when a) pin has inspectorColor set
    // and b) global showInspectorRings is enabled.
    // Inspector color is resolved by viewer.js and passed in as pin.inspectorColor.
    var hasRing = !!(pin.inspectorColor && pin._showRing);
    if (hasRing){
      // Outer teardrop at full size in inspector color
      ctx.fillStyle = pin.inspectorColor;
      ctx.globalAlpha = _pa;
      _teardropPath(ctx, 0, 0, 1);
      ctx.fill();
      // Inner teardrop at 0.76 scale in priority color.
      // S629 (Mark): ring thickness DOUBLED from 0.88 → 0.76 inner scale, ~3px
      // to ~6px at 32×42. It is the fastest read on a busy sheet — whose pin is
      // this — and at 3px it was losing that fight against the body colour once
      // a drawing filled up. The teardrop itself does NOT grow, so pin spacing
      // and hit targets are unchanged; the priority body absorbs the loss. The
      // white number disc (r=11 at cy=14) is untouched, so numbers read exactly
      // as before. The Hub's colour-picker preview mirrors this number — if it
      // changes here it changes there, or the preview starts lying.
      // Reset filter so inner doesn't double-shadow
      if (_supportsFilter) ctx.filter = 'none';
      ctx.fillStyle = fillHex;
      _teardropPath(ctx, 0, 0, 0.76);
      ctx.fill();
    } else {
      ctx.fillStyle = fillHex;
      ctx.globalAlpha = _pa;
      _teardropPath(ctx, 0, 0, 1);
      ctx.fill();
      if (_supportsFilter) ctx.filter = 'none';
    }

    /* S628e: the contractor tip. Clip to the teardrop so the wedge can never
       spill past the silhouette, then fill the lower portion — below the white
       number disc, so it never fights the number for legibility. Drawn after
       the body (and after the ring's inner fill) so it reads on both, and
       before the disc so the disc still sits on top. */
    if (ctrTip){
      if (_supportsFilter) ctx.filter = 'none';
      ctx.save();
      _teardropPath(ctx, 0, 0, hasRing ? 0.76 : 1);   // stay inside the ring if one is drawn
      ctx.clip();
      ctx.fillStyle = ctrTip;
      ctx.globalAlpha = _pa;
      ctx.beginPath();
      ctx.rect(0, 26, 32, 16);      // tip zone: below the disc, down past the point
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = _pa;
    }

    // Layer 1: inner white circle at (16, 14), r=11, α=0.95
    // (Enlarged S81 from r=9 so numbers can render bigger without fattening the teardrop.)
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.95 * _pa;
    ctx.beginPath();
    ctx.arc(16, 14, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = _pa;

    // Layer 2: priority-colored number, centered at (16, 14)
    // Font sizes bumped to take advantage of larger inner circle.
    var numStr = String(pin.num);
    var fs = numStr.length <= 2 ? 17 : numStr.length === 3 ? 13 : 11;
    ctx.fillStyle = fillHex;
    ctx.globalAlpha = _pa;
    ctx.font = '900 ' + fs + 'px Calibri, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(numStr, 16, 14);
    ctx.globalAlpha = 1;
  }

  // ─── Init ───────────────────────────────────────────────────────────────
  function init(hostEl, opts){
    return new Promise(function(resolve, reject){
      try {
        if (!hostEl){ reject(new Error('PinsGL: host element required')); return; }
        destroy();
        _host = hostEl;
        _dpr = Math.max(1, window.devicePixelRatio || 1);

        _canvas = document.createElement('canvas');
        _canvas.id = 'dv-pins-gl';   // id preserved for CSS (Bug #4 cursor rule)
        _canvas.style.cssText =
          'position:absolute;' +
          'left:0;top:0;' +
          'width:100%;height:100%;' +
          'pointer-events:none;' +   // hit-testing routed through viewer.js
          'z-index:5;';
        hostEl.appendChild(_canvas);

        _ctx = _canvas.getContext('2d');
        if (!_ctx){ reject(new Error('PinsGL: Canvas 2D context unavailable')); return; }

        var w = (opts && opts.w) || hostEl.clientWidth  || 1;
        var h = (opts && opts.h) || hostEl.clientHeight || 1;
        resize(w, h);

        resolve(true);
      } catch(err){
        reject(err);
      }
    });
  }

  function resize(w, h){
    if (!_canvas || !_ctx) return;
    _cssW = Math.max(1, w | 0);
    _cssH = Math.max(1, h | 0);
    var wantW = _cssW * _dpr;
    var wantH = _cssH * _dpr;
    if (_canvas.width !== wantW)  _canvas.width  = wantW;
    if (_canvas.height !== wantH) _canvas.height = wantH;
  }

  // ─── Render: position + size all pins at screen coords ──────────────────
  function render(pins, opts){
    if (!_canvas || !_ctx) return;

    _ctx.setTransform(1, 0, 0, 1, 0, 0);
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    _pins = pins || [];
    _lastOpts = opts || {};
    _pinScreenPos = {};
    if (!_pins.length) return;

    opts = opts || {};
    var pinScale = opts.pinScale != null ? opts.pinScale : 1;
    var hoveredId = opts.hoveredId || null;
    var activeId  = opts.activeId  || null;
    var readyId   = opts.readyId   || null;   // S81: V1-match press-and-hold glow
    var highlightId = opts.highlightId || null;  // S179c: navigate-to-pin pulse (gold)
    var imgRect = opts.imgRect || { left: 0, top: 0, width: 0, height: 0 };
    var imgW = opts.naturalW || 0;
    var imgH = opts.naturalH || 0;
    if (!imgW || !imgH || !imgRect.width || !imgRect.height) return;

    var pw = Math.round(_pinSize * pinScale);
    var ph = Math.round(_pinSize * 42 / 32 * pinScale);
    var nativeScale = pw / 32;

    // Build render order: normal → hover → ready → active → highlight so the
    // highlight pulse draws on top of everything.
    var order = [];
    for (var i = 0; i < _pins.length; i++){
      var pin = _pins[i];
      if (pin.pinX == null || pin.pinY == null) continue;
      // Guard against non-finite coords that would project to (0,0)
      if (!isFinite(pin.pinX) || !isFinite(pin.pinY)) continue;
      var state = (pin.deficId === highlightId) ? 'highlight'
                : (pin.deficId === activeId) ? 'active'
                : (pin.deficId === readyId)  ? 'ready'
                : (pin.deficId === hoveredId) ? 'hover'
                : 'normal';
      var sx = imgRect.left + pin.pinX * imgRect.width;
      var sy = imgRect.top  + pin.pinY * imgRect.height;
      _pinScreenPos[pin.deficId] = {
        x:  sx - pw / 2,
        y:  sy - ph,
        w:  pw,
        h:  ph,
        sx: sx, sy: sy,
        pin: pin
      };
      order.push({ pin: pin, state: state, sx: sx, sy: sy });
    }
    var rank = { normal: 0, hover: 1, ready: 2, active: 3, highlight: 4 };
    order.sort(function(a, b){ return rank[a.state] - rank[b.state]; });

    _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);

    for (var k = 0; k < order.length; k++){
      var o = order[k];
      var feedbackScale = o.state === 'highlight' ? 1.4
                        : o.state === 'active' ? 1.15
                        : o.state === 'hover' ? 1.08 : 1.0;
      var totalScale = nativeScale * feedbackScale;

      _ctx.save();
      // Contractor Highlight lens (per-session view state, NOT persisted):
      // when a contractor is selected, pins under that contractor RECOLOUR to
      // the contractor's colour and everything else dims to ~10% (near-
      // invisible). Mark's rule: you only ever view ONE contractor at a time,
      // so a pin shared across contractors simply takes whichever colour is
      // selected — no mixing. Stacks with closed-0.5.
      var _isHL = (_highlightCtrId != null);
      var _match = _isHL && (o.pin.contractorId === _highlightCtrId);
      var _dimmed = _isHL && !_match;
      var _baseAlpha = o.pin.isClosed ? 0.5 : 1;
      // Effective opacity for the WHOLE pin. _drawPinAtNative resets globalAlpha
      // internally per layer (teardrop/circle/number), so the outer globalAlpha
      // alone never reached the paint — the dim must be threaded INTO the draw
      // and multiplied onto each layer. Outer alpha kept for non-filter fallback.
      var _effAlpha = _dimmed ? (_baseAlpha * CTR_DIM_ALPHA) : _baseAlpha;
      _ctx.globalAlpha = _effAlpha;
      _ctx.translate(o.sx - 16 * totalScale, o.sy - 40 * totalScale);
      _ctx.scale(totalScale, totalScale);
      // Matching pin (and not closed — closed stays green so resolved still
      // reads as resolved) draws in the contractor colour passed from viewer.
      var _hlCol = (_match && !o.pin.isClosed && o.pin.contractorColor) ? o.pin.contractorColor : null;
      _drawPinAtNative(_ctx, o.pin, o.state, _dimmed, _hlCol, _effAlpha);
      _ctx.restore();
    }
  }

  // ─── Hit test (reverse order — top pin wins) ───────────────────────────
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
    if (_canvas && _canvas.parentNode){
      try { _canvas.parentNode.removeChild(_canvas); } catch(_){}
    }
    _canvas = null;
    _ctx    = null;
    _host   = null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────
  // Contractor Highlight lens. id=null resets to all-pins. Re-renders if pins exist.
  function setHighlightContractor(id){
    _highlightCtrId = (id == null ? null : id);
    if (_pins && _pins.length) render(_pins, _lastOpts || {});
  }
  function getHighlightContractor(){ return _highlightCtrId; }

  window.PinsGL = {
    isSupported:      isSupported,
    init:             init,
    resize:           resize,
    render:           render,
    hitTest:          hitTest,
    hitTestAll:       hitTestAll,
    getPinScreenRect: getPinScreenRect,
    setHighlightContractor: setHighlightContractor,
    getHighlightContractor: getHighlightContractor,
    destroy:          destroy,
    version:          '2.0-canvas2d'
  };
})();
