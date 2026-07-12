/**
 * ARENCON FRT — Drawing-Viewer Selection Bridge  v1.0.0 (S461)
 * ═══════════════════════════════════════════════════════════════════════════
 * The adapter that lets the DRAWING VIEWER (frt/js/viewer/markup.js) run the
 * shared selection engine (lib/ui/markupSelection.js) — the same convergence
 * the FRT LIGHTBOX completed at S459, done the same way:
 *
 *   • IN-MEMORY model = the shared engine's model: {id, tool, pts, …}
 *   • PERSISTED format = FRT v1, byte-for-byte UNCHANGED. Old drawings load
 *     identically; new saves are readable by every existing consumer
 *     (pdf.js export, cloud copies, older builds). Conversion happens ONLY
 *     at the load/save boundary, via toStroke()/toV1() below.
 *   • ROTATION model = FRT's own, injected as hooks (aabb + applyRotate):
 *     pen/highlight/polyline/eraser BAKE rotation into points; shapes and
 *     text keep unrotated coords + a .rotation angle. This is the drawing
 *     viewer's exact current behavior (markup.js rotate-drag handler,
 *     S331g-era), preserved verbatim — including its text pivot math, which
 *     differs slightly from the lightbox's (_getBounds uses y1 − fs/2; the
 *     lightbox uses _textMetrics h/2). We keep the DRAWING VIEWER's math.
 *
 * V1 OBJECT SHAPES (what the persisted format looks like — unchanged):
 *   freehand  {id, type:'pen'|'highlight'|'polyline'|'eraser', points:[{x,y}],
 *              color, size, opacity, eraserMask?}
 *   shape     {id, type:'rect'|'fillrect'|'circle'|'fillcircle'|'arrow'|
 *              'line'|'triangle'|'filltriangle'|'cloud', x1,y1,x2,y2,
 *              color, size, opacity, rotation?, eraserMask?}
 *   text      {id, type:'text', x1, y1, text, fontSize, color, opacity,
 *              rotation?}   (NO x2/y2 — writing them corrupts text data,
 *              see the S-era bug note in markup.js's rotate handler)
 *   dimension {id, type:'dimension', mx1,my1,mx2,my2, offset, rawLabel,
 *              overrideLabel, color, size, opacity}   (drawing-viewer-only;
 *              rendered by window._dimTool)
 *
 * ENGINE STROKE (in-memory only, never persisted):
 *   same object with: tool = canonical name (MarkupTools.toCanonical —
 *   fillrect→rect-fill etc.), pts = the geometry the engine may REWRITE
 *   wholesale on move/resize:
 *     freehand  pts = points
 *     shape     pts = [{x1,y1},{x2,y2}]   (as stored — not normalized)
 *     text      pts = [{x:x1,y:y1}]
 *     dimension pts = [{mx1,my1},{mx2,my2}]  (offset rides along untouched —
 *               it is a perpendicular scalar, translation-invariant)
 *   The v1 fields (points/x1..y2/mx*) are REMOVED in stroke form so there is
 *   exactly ONE source of truth in memory; toV1() rebuilds them from pts.
 *
 * UNDO: the drawing viewer is SNAPSHOT-based (_undoStack of full-state JSON),
 * not op-log. The engine's logOp fires exactly where markup.js already calls
 * _pushHistory(); _markDirty(); after a committed group op — so the hook does
 * precisely that, preserving current undo behavior verbatim (quirks included;
 * fidelity beats improvement here). Snapshots now hold engine-model objects,
 * which is fine: the undo stack is in-memory only and is reset on every
 * _loadMarkup.
 *
 * DEPENDS ON: window.MarkupTools (classic script, loaded by frt/index.html)
 * for the canonical tool-name mapping. Node harness injects it via globalThis.
 *
 * HARNESS: lib/tests/frtSelBridge.test.mjs — round-trip fidelity on every
 * object type, aabb == the verbatim markup.js _getBounds oracle, rotate
 * semantics vs the verbatim rotate-drag handler. GATE before any push.
 */
'use strict';

export const VERSION = '1.4.0';

// Canonical → FRT-v1 legacy name (persisted-format stability: a drawing saved
// with 'fillrect' must save back as 'fillrect', never 'rect-fill'). FRT v1
// never used the Diesel legacy names (square/…), so this map is total for FRT.
const CANONICAL_TO_V1 = {
  'rect-fill': 'fillrect',
  'circle-fill': 'fillcircle',
  'triangle-fill': 'filltriangle'
};

function _canon(t) {
  const MT = (typeof window !== 'undefined' ? window.MarkupTools : (typeof globalThis !== 'undefined' ? globalThis.MarkupTools : null));
  return (MT && MT.toCanonical) ? MT.toCanonical(t) : t;
}

const FREEHAND = { pen: 1, highlight: 1, polyline: 1, eraser: 1 };

/** v1 persisted object → in-memory engine stroke. Loss-free; toV1 inverts it
 *  BYTE-EXACTLY (original key order preserved via _v1keys, so a drawing that
 *  is loaded and re-saved without edits produces identical JSON).
 *  Note: .type stays on the stroke (immutable creation metadata) alongside the
 *  canonical .tool — markup.js's render/hit paths read obj.type everywhere,
 *  and keeping it means the step-2 surgery only touches GEOMETRY access. */
export function toStroke(v1) {
  const s = Object.assign({}, v1);
  const t = v1.type;
  s.tool = _canon(t);
  s._v1type = t;                       // exact original name, for save-back
  s._v1keys = Object.keys(v1);         // exact original key order, for save-back
  if (FREEHAND[t]) {
    s.pts = (v1.points || []).map(p => ({ x: p.x, y: p.y }));
    delete s.points;
  } else if (t === 'text') {
    s.pts = [{ x: v1.x1, y: v1.y1 }];
    delete s.x1; delete s.y1;
  } else if (t === 'dimension') {
    // Two persisted flavors exist in the field (markup.js guards `mx1 != null`
    // everywhere): newer dims use mx1..my2, LEGACY dims use x1..y2. Read either;
    // _v1keys remembers which, so toV1 emits the original flavor byte-exactly.
    if (v1.mx1 != null) {
      s.pts = [{ x: v1.mx1, y: v1.my1 }, { x: v1.mx2, y: v1.my2 }];
      delete s.mx1; delete s.my1; delete s.mx2; delete s.my2;
    } else {
      s.pts = [{ x: v1.x1, y: v1.y1 }, { x: v1.x2, y: v1.y2 }];
      delete s.x1; delete s.y1; delete s.x2; delete s.y2;
    }
  } else {
    // shapes (rect/fillrect/circle/fillcircle/arrow/line/triangle/filltriangle/cloud)
    s.pts = [{ x: v1.x1, y: v1.y1 }, { x: v1.x2, y: v1.y2 }];
    delete s.x1; delete s.y1; delete s.x2; delete s.y2;
  }
  return s;
}

/** in-memory engine stroke → v1 persisted object. Exact inverse of toStroke,
 *  emitting keys in the ORIGINAL order (falling back to stroke order for
 *  strokes born in-engine, e.g. clones). */
export function toV1(stroke) {
  const t = stroke._v1type || CANONICAL_TO_V1[stroke.tool] || stroke.tool;
  const pts = stroke.pts || [];
  // materialize the v1 geometry fields
  const geo = {};
  if (FREEHAND[t]) {
    geo.points = pts.map(p => ({ x: p.x, y: p.y }));
  } else if (t === 'text') {
    geo.x1 = pts[0] ? pts[0].x : 0;
    geo.y1 = pts[0] ? pts[0].y : 0;
    // NEVER write x2/y2 on text — see markup.js rotate handler bug note.
  } else if (t === 'dimension') {
    // Emit the flavor this dim was persisted with (legacy x1..y2 vs mx1..my2).
    // Strokes born in-engine (clones) inherit _v1keys from their parent.
    const legacyDim = stroke._v1keys ? stroke._v1keys.indexOf('mx1') === -1 : false;
    if (legacyDim) {
      geo.x1 = pts[0] ? pts[0].x : 0; geo.y1 = pts[0] ? pts[0].y : 0;
      geo.x2 = pts[1] ? pts[1].x : 0; geo.y2 = pts[1] ? pts[1].y : 0;
    } else {
      geo.mx1 = pts[0] ? pts[0].x : 0; geo.my1 = pts[0] ? pts[0].y : 0;
      geo.mx2 = pts[1] ? pts[1].x : 0; geo.my2 = pts[1] ? pts[1].y : 0;
    }
  } else {
    geo.x1 = pts[0] ? pts[0].x : 0; geo.y1 = pts[0] ? pts[0].y : 0;
    geo.x2 = pts[1] ? pts[1].x : 0; geo.y2 = pts[1] ? pts[1].y : 0;
  }
  const INTERNAL = { tool: 1, pts: 1, _v1type: 1, _v1keys: 1 };
  // source of non-geometry values
  const vals = {};
  for (const k of Object.keys(stroke)) { if (!INTERNAL[k]) vals[k] = stroke[k]; }
  vals.type = t;
  Object.assign(vals, geo);
  // emit in the original key order, then any new keys (e.g. rotation minted
  // by a first-ever rotate) in stroke order
  const o = {};
  const order = stroke._v1keys || Object.keys(vals);
  for (const k of order) { if (k in vals) { o[k] = vals[k]; delete vals[k]; } }
  for (const k of Object.keys(vals)) o[k] = vals[k];
  return o;
}

/**
 * Build the hook pack the shared engine needs for the drawing viewer.
 * host = {
 *   getBounds(v1obj)   — markup.js's own _getBounds (the rotation-aware oracle)
 *   pushHistory()      — markup.js's _pushHistory
 *   markDirty()        — markup.js's _markDirty
 * }
 */
export function buildHooks(host) {
  return {
    // The oracle itself does the bounds. Zero drift possible: the same function
    // that has always sized selection chrome in the drawing viewer keeps doing
    // it — we just hand it the v1 view of the stroke.
    aabb: function (st) { return host.getBounds(toV1(st)); },

    // VERBATIM port of markup.js's rotate-drag semantics (the S331g-era
    // handler): freehand bakes points; text rotates its visual center
    // (x1 + estW/2, y1 − fs/2) and accumulates .rotation without ever touching
    // x2/y2; shapes translate their center, re-normalize to min/max via
    // hw/hh (exactly as the original does), and accumulate .rotation;
    // dimension translates only (it has no .rotation render path).
    // Eraser masks rotate around the same pivot, inline, mask shape preserved.
    applyRotate: function (st, o, dA, rot) {
      const t = o._v1type || o.tool;
      if (FREEHAND[t] || (o.pts && o.pts.length > 2 && !o.text)) {
        st.pts = o.pts.map(p => rot(p));
      } else if (t === 'text') {
        const fs = o.fontSize || 20;
        const estW = (o.text || '').length * fs * 0.55;
        const oc = { x: o.pts[0].x + estW / 2, y: o.pts[0].y - fs / 2 };
        const nc = rot(oc);
        st.pts = [{ x: nc.x - estW / 2, y: nc.y + fs / 2 }];
        st.rotation = (o.rotation || 0) + dA;
      } else if (t === 'dimension') {
        const a = o.pts[0], b = o.pts[1];
        const oc2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const nc2 = rot(oc2);
        const dx = nc2.x - oc2.x, dy = nc2.y - oc2.y;
        st.pts = o.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
        // no .rotation — the dimension renderer has no rotation path
      } else {
        const a2 = o.pts[0], b2 = o.pts[1];
        const ocx = (a2.x + b2.x) / 2, ocy = (a2.y + b2.y) / 2;
        const ncs = rot({ x: ocx, y: ocy });
        const hw = Math.abs(b2.x - a2.x) / 2, hh = Math.abs(b2.y - a2.y) / 2;
        st.pts = [{ x: ncs.x - hw, y: ncs.y - hh }, { x: ncs.x + hw, y: ncs.y + hh }];
        st.rotation = (o.rotation || 0) + dA;
      }
      if (o.eraserMask && o.eraserMask.length) {
        st.eraserMask = o.eraserMask.map(m => ({
          points: m.points.map(p => rot(p)),
          size: m.size
        }));
      }
    },

    // ── S461j: DIMENSION CONTOUR for the member/pick glow ──────────────────
    // The engine's default halo traces shapes (canonical renderer) and freehand
    // polylines but has no idea what a dimension looks like. This lays down the
    // dim's true ink: offset dim line + the two extension legs + the label chip
    // outline — the same geometry the hitInk test uses. Non-dimension types
    // return undefined so the engine's default logic runs.
    haloPath: function (ctx, s) {
      const t = s._v1type || s.tool;
      if (t !== 'dimension') return undefined;
      const pts = s.pts || [];
      if (pts.length < 2) return false;
      const a = pts[0], b = pts[1];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / len, py = dx / len, off = s.offset || 0;
      const oa = { x: a.x + px * off, y: a.y + py * off };
      const ob = { x: b.x + px * off, y: b.y + py * off };
      ctx.beginPath();
      ctx.moveTo(oa.x, oa.y); ctx.lineTo(ob.x, ob.y);   // offset dim line
      ctx.moveTo(a.x, a.y); ctx.lineTo(oa.x, oa.y);     // extension legs
      ctx.moveTo(b.x, b.y); ctx.lineTo(ob.x, ob.y);
      const mx = (a.x + b.x) / 2 + px * off, my = (a.y + b.y) / 2 + py * off;
      ctx.rect(mx - 28, my - 14, 56, 28);               // label chip outline
      return true;
    },

    // Committed group op → exactly what markup.js already does at the same
    // moment (see _handleSelectUp): push a full-state undo snapshot and mark
    // the drawing dirty for autosave. Behavior preserved verbatim.
    logOp: function (_op) { host.pushHistory(); host.markDirty(); },

    // ── S461d: INK-PRECISE hit test (drawing viewer) ────────────────────────
    // On a drawing, bounding boxes are enormous — a dimension's AABB spans the
    // whole bay, a tall scribble covers half the sheet. AABB-hit selected marks
    // the user never touched (the S461 dimension-deletion incident) and made
    // empty-space drags grab instead of rubber-banding. This tests the INK:
    //   freehand / line / arrow → distance to the polyline/segment ≤ size/2+tol
    //   hollow shapes           → distance to the PERIMETER (interior = miss!)
    //   filled shapes / text    → inside the box IS the ink
    //   cloud                   → its rect perimeter (arcs ride the boundary)
    //   dimension               → near the OFFSET dim line, its extension legs,
    //                             or inside the label chip (matches _getBounds
    //                             chip geometry: mid ± 28×14)
    // Rotated shapes/text: the POINT is inverse-rotated about the stroke center
    // (same pivot the renderer uses), then tested in unrotated space.
    hitInk: function (s, p, tol) {
      const t = s._v1type || s.tool;
      const pts = s.pts || [];
      if (!pts.length) return false;
      const half = (s.size || 2) / 2 + tol;

      function dSeg(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
        const qx = ax + u * dx, qy = ay + u * dy;
        return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
      }
      function nearPolyline(q, arr, closed, r) {
        const n = arr.length, lim = closed ? n : n - 1;
        if (n === 1) return Math.hypot(q.x - arr[0].x, q.y - arr[0].y) <= r;
        for (let i = 0; i < lim; i++) {
          const a = arr[i], b = arr[(i + 1) % n];
          if (dSeg(q.x, q.y, a.x, a.y, b.x, b.y) <= r) return true;
        }
        return false;
      }

      // freehand + eraser strokes: the polyline IS the ink
      if (t === 'pen' || t === 'highlight' || t === 'polyline' || t === 'eraser') {
        return nearPolyline(p, pts, false, half);
      }

      if (t === 'dimension') {
        const a = pts[0], b = pts[1];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len, py = dx / len, off = s.offset || 0;
        const oa = { x: a.x + px * off, y: a.y + py * off };
        const ob = { x: b.x + px * off, y: b.y + py * off };
        // offset dim line + the two extension legs
        if (dSeg(p.x, p.y, oa.x, oa.y, ob.x, ob.y) <= half + 2) return true;
        if (dSeg(p.x, p.y, a.x, a.y, oa.x, oa.y) <= half + 2) return true;
        if (dSeg(p.x, p.y, b.x, b.y, ob.x, ob.y) <= half + 2) return true;
        // label chip (same geometry _getBounds uses)
        const mx = (a.x + b.x) / 2 + px * off, my = (a.y + b.y) / 2 + py * off;
        return p.x >= mx - 28 - tol && p.x <= mx + 28 + tol && p.y >= my - 14 - tol && p.y <= my + 14 + tol;
      }

      // shapes + text: normalize the box; inverse-rotate the point if rotated
      const a2 = pts[0], b2 = pts[1] || pts[0];
      let q = p;
      if (s.rotation) {
        let cx, cy;
        if (t === 'text') {
          const fs = s.fontSize || 20, estW = (s.text || '').length * fs * 0.55;
          cx = a2.x + estW / 2; cy = a2.y - fs / 2;   // renderer's pivot
        } else {
          cx = (a2.x + b2.x) / 2; cy = (a2.y + b2.y) / 2;
        }
        const c = Math.cos(-s.rotation), sn = Math.sin(-s.rotation);
        q = { x: cx + (p.x - cx) * c - (p.y - cy) * sn, y: cy + (p.x - cx) * sn + (p.y - cy) * c };
      }

      if (t === 'text') {
        const fs = s.fontSize || 20, estW = (s.text || '').length * fs * 0.55;
        return q.x >= a2.x - tol && q.x <= a2.x + estW + tol && q.y >= a2.y - fs - tol && q.y <= a2.y + 4 + tol;
      }

      const L = Math.min(a2.x, b2.x), R = Math.max(a2.x, b2.x);
      const T = Math.min(a2.y, b2.y), B = Math.max(a2.y, b2.y);
      const filled = (t === 'fillrect' || t === 'fillcircle' || t === 'filltriangle' ||
                      s.tool === 'rect-fill' || s.tool === 'circle-fill' || s.tool === 'triangle-fill');
      const inside = q.x >= L - tol && q.x <= R + tol && q.y >= T - tol && q.y <= B + tol;

      if (t === 'line' || t === 'arrow') {
        return dSeg(q.x, q.y, a2.x, a2.y, b2.x, b2.y) <= half + (t === 'arrow' ? 6 : 0);
      }
      // S461g (Mark, verbatim): "I never said to not grab for hollow shape
      // markups." Shapes hit ANYWHERE inside their box — the perimeter-only
      // rule was over-designed and is reverted. Precise treatment stays ONLY
      // where it solved his actual complaint: dimensions (line/legs/chip) and
      // freehand strokes (so empty sheet areas still rubber-band).
      return inside;
    }
  };
}
