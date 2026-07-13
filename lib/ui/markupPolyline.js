/* ============================================================================
 * lib/ui/markupPolyline.js — SHARED POLYLINE TOOL
 * ----------------------------------------------------------------------------
 * S461q — EXTRACTED VERBATIM from the FRT drawing viewer (frt/js/viewer/markup.js
 * _handlePolylineClick / _finishPolyline / _commitPolyline / _cancelPolyline /
 * _undoPolyPoint / _redrawPolyOverlay). The drawing viewer is the SOURCE OF
 * TRUTH: its behaviour is reproduced here EXACTLY — no redesign, no new rules.
 *
 * Behaviour (unchanged from the drawing viewer):
 *   - each placement appends a point
 *   - placing within 15 units of the FIRST point CLOSES the loop (pushes an
 *     exact copy of point 0) and finishes
 *   - the live preview draws the placed points ONLY (>= 2), on the host's
 *     overlay canvas, with lineTo (never quadraticCurveTo)
 *   - ✓ Finish commits AS DRAWN (open) when >= 2 points, else cancels
 *   - ↩ removes the last placed point and repaints
 *   - ✕ discards everything in progress; nothing is committed
 *   - commit pushes ONE stroke, then history + dirty
 *
 * "Engine shared, personality per-tool config": this module owns the STATE
 * MACHINE. Each host supplies a config for how IT mints and draws a stroke,
 * so the two stroke formats (drawing viewer v1 {type,points[]} vs lightbox
 * {tool,pts[]}) both work without either host changing its storage.
 *
 * config = {
 *   getOverlay()            -> canvas | null   (live preview target; may create)
 *   hideOverlay()                              (clear + hide it)
 *   style()                 -> {color,size,opacity}   current tool style
 *   commit(points)                             mint + push ONE stroke, host format
 *   afterChange(count)                         optional: pill show/hide/position
 *   closeTolerance()        -> number          optional, default 15 (host units)
 *   render()                                   repaint the host's main canvas
 * }
 * ========================================================================== */
(function (root) {
  'use strict';

  function create(config) {
    var cfg = config || {};
    var points = [];

    function _tol() {
      return (typeof cfg.closeTolerance === 'function') ? cfg.closeTolerance() : 15;
    }

    // Live preview — the placed points only. Verbatim from the drawing viewer:
    // it draws when there are >= 2 points, using the CURRENT tool style, and
    // lineTo exclusively (quadraticCurveTo is forbidden toolkit-wide).
    // cursor === null  → placed segments only (after a placement)
    // cursor === {x,y} → placed segments + a RUBBER-BAND LEG to the cursor, and
    //                    the CLOSE INDICATOR (a soft circle on point 0) when the
    //                    cursor is within the close tolerance. Both extracted
    //                    verbatim from the drawing viewer's _redrawPolyOverlay.
    function _redraw(cursor) {
      var ov = cfg.getOverlay && cfg.getOverlay();
      if (!ov) return;
      var min = cursor ? 1 : 2;
      if (points.length < min) { if (cfg.hideOverlay) cfg.hideOverlay(); return; }
      var st = (cfg.style && cfg.style()) || {};
      ov.style.display = 'block';
      ov.style.opacity = '1';
      var ctx = ov.getContext('2d');
      var d = ov._dpr || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ov.width, ov.height);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = (st.opacity == null ? 1 : st.opacity);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      if (cursor) ctx.lineTo(cursor.x, cursor.y);          // rubber-band leg
      ctx.stroke();
      // close indicator — circle on the first point when the cursor is in range
      if (cursor && points.length >= 2) {
        var dx = cursor.x - points[0].x, dy = cursor.y - points[0].y;
        if (Math.sqrt(dx * dx + dy * dy) < _tol()) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(points[0].x, points[0].y, 8, 0, Math.PI * 2);
          ctx.fillStyle = st.color;
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.restore();
        }
      }
    }

    function _changed() {
      if (cfg.afterChange) cfg.afterChange(points.length);
    }

    function _clear() {
      points = [];
      if (cfg.hideOverlay) cfg.hideOverlay();
      if (cfg.render) cfg.render();
      _changed();
    }

    return {
      /* Place a point. Returns true if the polyline FINISHED (loop closed). */
      addPoint: function (pos) {
        // Placing near the first point closes the loop — exact copy of point 0.
        if (points.length >= 2) {
          var dx = pos.x - points[0].x, dy = pos.y - points[0].y;
          if (Math.sqrt(dx * dx + dy * dy) < _tol()) {
            points.push({ x: points[0].x, y: points[0].y });
            this.finish();
            return true;
          }
        }
        points.push({ x: pos.x, y: pos.y });
        _redraw();
        _changed();
        return false;
      },

      /* ✓ Finish — commits AS DRAWN (open) when >= 2 points, else cancels. */
      finish: function () {
        if (points.length >= 2 && cfg.commit) cfg.commit(points.slice());
        _clear();
      },

      /* ↩ Undo the LAST placed point (never deletes a committed stroke). */
      undoPoint: function () {
        if (!points.length) return;
        points.pop();
        _redraw();
        _changed();
      },

      /* ✕ Cancel — discards everything in progress; nothing is committed. */
      cancel: function () { _clear(); },

      count: function () { return points.length; },
      isActive: function () { return points.length > 0; },
      /* Last placed point — hosts use it to anchor the pill. */
      lastPoint: function () { return points.length ? points[points.length - 1] : null; },
      /* Repaint the preview (e.g. after a zoom/pan changed the overlay). */
      /* Live preview while the pointer moves — pass the cursor to get the
         rubber-band leg + close indicator. */
      preview: function (cursor) { if (points.length) _redraw(cursor); },
      redraw: _redraw
    };
  }

  var API = { create: create, VERSION: '1.0.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.MarkupPolyline = API;
})(typeof window !== 'undefined' ? window : this);
