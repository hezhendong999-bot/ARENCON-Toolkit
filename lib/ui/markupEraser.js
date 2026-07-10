/**
 * ARENCON — Shared Markup Eraser (drawing-viewer parity)
 * ═══════════════════════════════════════════════════════
 * The DRAWING VIEWER (frt/js/viewer/markup.js) is the canonical eraser. This
 * module lifts its algorithm — geometry helpers verbatim — expressed over the
 * LIGHTBOX stroke model ({tool, pts:[{x,y}], size, color, alpha, rot?, id})
 * shared by the FRT and Diesel photo lightboxes.
 *
 * CANONICAL BEHAVIOR (nothing is ever whole-deleted):
 *   • DURING the drag: the eraser shows its path live — grey #8a94b0 stroke at
 *     lineWidth = size×3 (the engine's render draws it; see eraserPreview()).
 *   • ON RELEASE (applyEraser): EVERY stroke type gets an eraserMask — the
 *     eraser's EXACT path is carved from that object's pixels at render time
 *     via destination-out on a per-object offscreen. This is the viewer's own
 *     mechanism for polyline/highlight/text/shapes; pen uses it here too
 *     because the viewer's pen vertex-split fails on lightbox geometry
 *     (sparse vertices from fast drags → whole adjacent segments vanish, or
 *     a crossing between vertices erases nothing — S459 harness cases 4/5).
 *     Hit tests: pen/highlight = spine distance inflated by the visible
 *     half-width (viewer S81/polyline rule); text/shapes = inflated bbox.
 *   • The eraser stroke itself is NEVER persisted.
 *   • NO-OP GUARD (viewer S331 C1): an erase through empty space returns
 *     changed:false — the caller must not push an undo entry for it.
 *   • Radius = lineWidth/2 where lineWidth = (size||2)×3 (in the same coord
 *     space as the stroke pts — callers pass natural-coord width, i.e.
 *     (size||2)*3*uiScale for screen-constant feel on hi-res photos).
 *
 * ROTATION / LOCAL FRAME (lightbox extension):
 *   Lightbox strokes may carry s.rot (applied at render about the stroke
 *   center). Hit-testing and masks operate in the stroke's LOCAL (pre-rot)
 *   frame: world eraser pts are inverse-rotated about the stroke center per
 *   stroke. Masks stored local-frame render inside the same rotation
 *   transform as the stroke — so masks follow move/resize/rotate exactly as
 *   the viewer's world-coord masks follow its move/resize.
 *
 * MASK DATA: s.eraserMask = [ { points:[{x,y}...], size:<lineWidth> } ... ]
 *   Plain JSON on the stroke object → persists through mk.o / toMk deep-copy
 *   with zero serializer changes. Transform code that maps s.pts MUST map
 *   mask points identically (see xformMask helper).
 *
 * Pure + stateless. Classic script global window.MarkupEraser (+ CJS export).
 */
(function (root) {
  'use strict';

  // ── Geometry (lifted verbatim from frt/js/viewer/markup.js) ─────────────

  // Shortest distance² from point (px,py) to segment (ax,ay)-(bx,by)
  function distSqPtSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) { var ex = px - ax, ey = py - ay; return ex * ex + ey * ey; }
    var t = ((px - ax) * dx + (py - ay) * dy) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var qx = ax + t * dx, qy = ay + t * dy;
    var fx = px - qx, fy = py - qy;
    return fx * fx + fy * fy;
  }

  // Min distance² between segments (a→b) and (c→d). Returns 0 if they cross.
  function segDistSq(a, b, c, d) {
    var dx1 = b.x - a.x, dy1 = b.y - a.y;
    var dx2 = d.x - c.x, dy2 = d.y - c.y;
    var det = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(det) > 1e-9) {
      var nx = a.x - c.x, ny = a.y - c.y;
      var t = (nx * dy2 - ny * dx2) / -det;
      var u = (nx * dy1 - ny * dx1) / -det;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
    }
    var d1 = distSqPtSeg(a.x, a.y, c.x, c.y, d.x, d.y);
    var d2 = distSqPtSeg(b.x, b.y, c.x, c.y, d.x, d.y);
    var d3 = distSqPtSeg(c.x, c.y, a.x, a.y, b.x, b.y);
    var d4 = distSqPtSeg(d.x, d.y, a.x, a.y, b.x, b.y);
    var m = d1;
    if (d2 < m) m = d2;
    if (d3 < m) m = d3;
    if (d4 < m) m = d4;
    return m;
  }

  // True if any portion of segment p1→p2 lies inside the axis-aligned bbox.
  // Liang–Barsky line clipping (viewer: fast eraser stroke whose sparse
  // vertices all land outside a small shape still registers).
  function segmentIntersectsBbox(p1, p2, bx1, by1, bx2, by2) {
    var dx = p2.x - p1.x, dy = p2.y - p1.y;
    var t0 = 0, t1 = 1;
    function clip(p, q) {
      if (p === 0) { if (q < 0) return false; return true; }
      var r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    }
    if (!clip(-dx, p1.x - bx1)) return false;
    if (!clip( dx, bx2 - p1.x)) return false;
    if (!clip(-dy, p1.y - by1)) return false;
    if (!clip( dy, by2 - p1.y)) return false;
    return true;
  }

  // True if point (px,py) is within eraserR of any point on the eraser polyline
  function pointHitByEraser(px, py, eraserPts, eraserR2) {
    if (eraserPts.length === 1) {
      var ex = px - eraserPts[0].x, ey = py - eraserPts[0].y;
      return (ex * ex + ey * ey) <= eraserR2;
    }
    for (var i = 0; i < eraserPts.length - 1; i++) {
      var a = eraserPts[i], b = eraserPts[i + 1];
      if (distSqPtSeg(px, py, a.x, a.y, b.x, b.y) <= eraserR2) return true;
    }
    return false;
  }

  // Did the eraser come within eraserR of any part of the stroke polyline?
  function strokeHitByEraser(pts, eraserPts, eraserR2) {
    if (!pts || pts.length < 1) return false;
    if (pts.length === 1) {
      return pointHitByEraser(pts[0].x, pts[0].y, eraserPts, eraserR2);
    }
    if (eraserPts.length === 1) {
      var ex = eraserPts[0].x, ey = eraserPts[0].y;
      for (var k = 0; k < pts.length - 1; k++) {
        if (distSqPtSeg(ex, ey, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y) <= eraserR2) return true;
      }
      return false;
    }
    for (var i = 0; i < pts.length - 1; i++) {
      var sa = pts[i], sb = pts[i + 1];
      for (var j = 0; j < eraserPts.length - 1; j++) {
        if (segDistSq(sa, sb, eraserPts[j], eraserPts[j + 1]) <= eraserR2) return true;
      }
    }
    return false;
  }

  // Bbox-overlap test for shapes/text (viewer _shapeHitByEraser): inflate the
  // bbox by eraser radius; vertex-inside OR segment-crosses.
  function bboxHitByEraser(b, eraserPts, eraserR2) {
    if (!b) return false;
    var r = Math.sqrt(eraserR2);
    var ix1 = b.x1 - r, iy1 = b.y1 - r, ix2 = b.x2 + r, iy2 = b.y2 + r;
    for (var i = 0; i < eraserPts.length; i++) {
      var p = eraserPts[i];
      if (p.x >= ix1 && p.x <= ix2 && p.y >= iy1 && p.y <= iy2) return true;
    }
    for (var j = 0; j < eraserPts.length - 1; j++) {
      if (segmentIntersectsBbox(eraserPts[j], eraserPts[j + 1], ix1, iy1, ix2, iy2)) return true;
    }
    return false;
  }

  // Split a freehand point list into kept fragments (viewer _splitStrokeByEraser
  // core). Returns array of point-runs (each ≥2 pts); [] = entire stroke erased.
  function splitPtsByEraser(pts, eraserPts, eraserR2) {
    if (!pts || pts.length < 2) return null;   // caller keeps stroke unchanged
    var kept = new Array(pts.length);
    for (var i = 0; i < pts.length; i++) {
      kept[i] = !pointHitByEraser(pts[i].x, pts[i].y, eraserPts, eraserR2);
    }
    var fragments = [];
    var run = [];
    for (var j = 0; j < pts.length; j++) {
      if (kept[j]) { run.push(pts[j]); }
      else { if (run.length >= 2) fragments.push(run); run = []; }
    }
    if (run.length >= 2) fragments.push(run);
    return fragments;
  }

  // ── Local-frame helpers (lightbox s.rot extension) ───────────────────────
  function rotPt(q, c, a) {
    var dx = q.x - c.x, dy = q.y - c.y, ca = Math.cos(a), sa = Math.sin(a);
    return { x: c.x + dx * ca - dy * sa, y: c.y + dx * sa + dy * ca };
  }
  // World eraser pts → stroke's local (pre-rot) frame
  function toLocal(eraserPts, center, rot) {
    if (!rot) return eraserPts;
    var out = new Array(eraserPts.length);
    for (var i = 0; i < eraserPts.length; i++) out[i] = rotPt(eraserPts[i], center, -rot);
    return out;
  }

  // Append an eraser path to the stroke's eraserMask (deep-copied — viewer _pushMask)
  function pushMask(s, eraserPts, lineWidth) {
    if (!s.eraserMask) s.eraserMask = [];
    var copy = new Array(eraserPts.length);
    for (var i = 0; i < eraserPts.length; i++) copy[i] = { x: eraserPts[i].x, y: eraserPts[i].y };
    s.eraserMask.push({ points: copy, size: lineWidth });
  }

  /**
   * Apply an eraser path to a lightbox stroke array. Viewer _applyEraser,
   * adapted to the {tool, pts} model. PURE — returns a NEW strokes array;
   * masked strokes are shallow-replaced clones (originals untouched) so the
   * caller can snapshot before/after for a single undo entry.
   *
   * @param strokes    array of stroke objects
   * @param eraserPts  eraser path in WORLD (natural-image) coords
   * @param lineWidth  eraser visual line width in STROKE UNITS
   *                   (callers: (size||2)*3 — viewer-exact). Hit radius = lineWidth/2.
   * @param opts { toCanonical(t), halfWidth(s), bbox(s), center(s), newId() }
   *   toCanonical — name normalizer (MarkupTools.toCanonical; identity ok)
   *   halfWidth   — visible half-width of a highlight stroke in world coords
   *                 (engines render highlight wider than s.size; viewer S81)
   *   bbox        — UNROTATED bbox {x1,y1,x2,y2} of a stroke in local frame
   *   center      — rotation center {x,y} of a stroke (its bbox center)
   *   newId       — id generator for split fragments
   * @returns { changed:boolean, strokes:array }
   */
  function applyEraser(strokes, eraserPts, lineWidth, opts) {
    if (!eraserPts || eraserPts.length < 2) return { changed: false, strokes: strokes };
    var canon = (opts && opts.toCanonical) || function (t) { return t; };
    var newId = (opts && opts.newId) || function () {
      return 'mk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    };
    var eraserR = (lineWidth || 2) / 2;   // radius = half the visual line
    var eraserR2 = eraserR * eraserR;

    var changed = false;
    var next = [];
    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      if (!s || !s.tool) { next.push(s); continue; }
      var t = canon(s.tool);
      var ep = toLocal(eraserPts, (s.rot && opts && opts.center) ? opts.center(s) : null, s.rot || 0);

      if (t === 'pen' || t === 'highlight') {
        // MASK carve — the viewer's POLYLINE/HIGHLIGHT mechanism, applied to pen
        // too. Vertex-removal split (the viewer's pen branch) is unusable on
        // lightbox strokes: fast drags store sparse vertices, so dropping a
        // vertex deletes its WHOLE adjacent segments (S459 harness: 60px chunk
        // from a 12px eraser) and a crossing BETWEEN vertices erases nothing.
        // The mask cuts the exact drag path regardless of vertex density —
        // splitPtsByEraser stays exported for dense-vertex surfaces (viewer).
        // Spine hit radius inflated by the stroke's visible half-width so
        // grazing the visible edge registers (viewer S81 / polyline rule).
        var hw = (t === 'highlight')
          ? ((opts && opts.halfWidth) ? opts.halfWidth(s) : ((s.size || 2) * 2))
          : ((s.size || 2) / 2);
        var hlR = eraserR + hw;
        if (strokeHitByEraser(s.pts, ep, hlR * hlR)) {
          var hs = JSON.parse(JSON.stringify(s));
          pushMask(hs, ep, lineWidth);
          next.push(hs); changed = true;
        } else next.push(s);
      }
      else if (t === 'text' || t === 'line' || t === 'arrow' || t === 'rect' ||
               t === 'rect-fill' || t === 'circle' || t === 'circle-fill' ||
               t === 'triangle' || t === 'triangle-fill' || t === 'cloud') {
        // Mask: carve the eraser's exact path (viewer rule for shapes/text)
        var b = (opts && opts.bbox) ? opts.bbox(s) : null;
        if (bboxHitByEraser(b, ep, eraserR2)) {
          var ms = JSON.parse(JSON.stringify(s));
          pushMask(ms, ep, lineWidth);
          next.push(ms); changed = true;
        } else next.push(s);
      }
      else {
        next.push(s);   // unknown tool — untouched
      }
    }
    return { changed: changed, strokes: next };
  }

  /**
   * Live drag-path style (viewer _moveDraw parity): grey #8a94b0 stroke at the
   * eraser's visual width. Engines draw the in-progress eraser stroke with this.
   */
  var PREVIEW = { color: '#8a94b0', widthOf: function (size) { return (size || 2) * 3; } };

  /**
   * Transform helper — call wherever engine code maps s.pts (move / resize /
   * rotate-translate / clone) so masks follow the stroke exactly. fn receives
   * a point and returns the transformed point; scaleF (optional) scales the
   * mask line width (resize only).
   */
  function xformMask(s, fn, scaleF) {
    if (!s || !s.eraserMask || !s.eraserMask.length) return;
    for (var i = 0; i < s.eraserMask.length; i++) {
      var m = s.eraserMask[i];
      m.points = m.points.map(fn);
      if (scaleF) m.size = Math.max(1, (m.size || 2) * scaleF);
    }
  }

  var API = {
    applyEraser: applyEraser,
    xformMask: xformMask,
    pushMask: pushMask,
    splitPtsByEraser: splitPtsByEraser,
    strokeHitByEraser: strokeHitByEraser,
    bboxHitByEraser: bboxHitByEraser,
    pointHitByEraser: pointHitByEraser,
    distSqPtSeg: distSqPtSeg,
    segDistSq: segDistSq,
    segmentIntersectsBbox: segmentIntersectsBbox,
    PREVIEW: PREVIEW,
    VERSION: '1.1.0'
  };

  if (root) root.MarkupEraser = API;
  try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
