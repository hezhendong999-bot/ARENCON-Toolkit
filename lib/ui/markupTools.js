/**
 * ARENCON — Shared Markup Tool Definitions
 * ════════════════════════════════════════
 * Single source of truth for markup TOOLS + SHAPES used by every markup surface:
 *   - FRT drawing viewer (canonical origin of this code)
 *   - FRT photo lightbox
 *   - Diesel photo lightbox
 *
 * WHY THIS EXISTS
 * Each surface used to carry its own shape list + draw function, hand-matched by
 * Mark and drifted over time (rect vs square, fillrect vs rect-fill vs square-fill).
 * Adding one shape meant editing three files with three vocabularies. Now: add or
 * change a shape ONCE here → every surface updates, identically named.
 *
 * WHAT'S HERE  : tool list, canonical shape set, pure shape-drawing, name aliases.
 * WHAT'S NOT   : canvas/coord systems, pan/zoom, WebGL, tile logic, selection
 *                plumbing, persistence (Save/trash/Revert), never-bake model.
 *                Those stay per-surface. This module is pure + stateless.
 *
 * CANONICAL NAMING (going forward)
 *   Base shapes : rect, circle, triangle, line, arrow, cloud
 *   Filled      : <base>-fill   → rect-fill, circle-fill, triangle-fill
 *   The "-fill" SUFFIX groups a shape with its filled variant and reads clearly.
 *   Legacy names (fillrect, square, square-fill, fillcircle, filltriangle) are
 *   normalized via SHAPE_ALIASES so EVERY existing report still renders. Never
 *   remove an alias.
 *
 * DIMENSION is NOT here — it stays drawing-viewer-only (viewer owns _dimTool). If
 * ever promoted to a lightbox, move it INTO this file so it ports, never drifts.
 *
 * Loads as a classic script (no build step): exposes window.MarkupTools.
 * Also supports ES module import for the FRT modular app (export at bottom).
 */
(function (root) {
  'use strict';

  // ── Canonical shape set ────────────────────────────────────────────────
  // Value 1 = shape tool (drag start→end). Order is display-friendly.
  var SHAPE_TOOLS = {
    line: 1, arrow: 1,
    rect: 1, 'rect-fill': 1,
    circle: 1, 'circle-fill': 1,
    triangle: 1, 'triangle-fill': 1,
    cloud: 1
  };

  // ── Full shared tool set (what a surface may offer). Persistence actions
  //    (save/trash/revert) and viewer-only tools (dimension) are NOT here.
  var TOOLS = {
    select: 1, pen: 1, highlight: 1, eraser: 1, text: 1,
    line: 1, arrow: 1, rect: 1, 'rect-fill': 1,
    circle: 1, 'circle-fill': 1, triangle: 1, 'triangle-fill': 1, cloud: 1
  };

  // ── Legacy → canonical aliases. Keep FOREVER (old saved markup depends on
  //    these). Normalize any stored tool name through toCanonical() before use.
  var SHAPE_ALIASES = {
    // drawing viewer legacy (fill-prefix)
    fillrect: 'rect-fill',
    fillcircle: 'circle-fill',
    filltriangle: 'triangle-fill',
    // Diesel legacy (square = rect)
    square: 'rect',
    'square-fill': 'rect-fill',
    // FRT lightbox already used <base>-fill → identity, listed for clarity
    'rect-fill': 'rect-fill',
    'circle-fill': 'circle-fill'
  };

  /** Normalize a possibly-legacy tool/shape name to its canonical form. */
  function toCanonical(t) {
    if (t == null) return t;
    return SHAPE_ALIASES[t] || t;
  }

  /** Is this (possibly-legacy) name a shape tool? */
  function isShapeTool(t) {
    return !!SHAPE_TOOLS[toCanonical(t)];
  }

  // ── Canonical shape renderer ───────────────────────────────────────────
  // Unified SUPERSET of the drawing-viewer and lightbox draw functions for the
  // five shapes that genuinely match: rect, circle, triangle, arrow, line
  // (+ their -fill variants). Improvements folded in so ALL surfaces get them:
  //   • Corner-normalization (Math.min/max) → reverse-drag works everywhere.
  //   • Behavior otherwise identical to the drawing viewer (canonical template).
  //
  // CLOUD is deliberately NOT unified here (A3 decision): the drawing viewer and
  // the FRT S339 lightbox use two different, intentional cloud designs. Until Mark
  // picks the canonical one by eye, each surface keeps its own cloud. If drawShape
  // is asked to draw 'cloud', it returns false so the caller draws its own; every
  // other shape returns true (handled here).
  //
  // 'dimension' is intentionally NOT handled — drawing-viewer-only (window._dimTool).
  //
  // Pure: caller sets ctx.strokeStyle / fillStyle / lineWidth / globalAlpha first.
  // Returns true if drawShape handled it, false if the caller must handle it (cloud).
  function drawShape(ctx, type, x1, y1, x2, y2) {
    var t = toCanonical(type);
    var L = Math.min(x1, x2), R = Math.max(x1, x2);
    var T = Math.min(y1, y2), B = Math.max(y1, y2);
    var w = R - L, h = B - T;
    if (t === 'rect') {
      ctx.beginPath(); ctx.strokeRect(L, T, w, h); return true;
    } else if (t === 'rect-fill') {
      if (ctx.strokeStyle) ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(L, T, w, h); return true;
    } else if (t === 'circle') {
      var cx = L + w / 2, cy = T + h / 2, rx = w / 2, ry = h / 2;
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      else ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
      ctx.stroke(); return true;
    } else if (t === 'circle-fill') {
      var cxf = L + w / 2, cyf = T + h / 2, rxf = w / 2, ryf = h / 2;
      if (ctx.strokeStyle) ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(cxf, cyf, rxf, ryf, 0, 0, Math.PI * 2);
      else ctx.arc(cxf, cyf, Math.max(rxf, ryf), 0, Math.PI * 2);
      ctx.fill(); return true;
    } else if (t === 'arrow') {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      var a = Math.atan2(y2 - y1, x2 - x1), hl = 15 + (ctx.lineWidth || 2) * 2;
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(a - Math.PI / 6), y2 - hl * Math.sin(a - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(a + Math.PI / 6), y2 - hl * Math.sin(a + Math.PI / 6));
      ctx.stroke(); return true;
    } else if (t === 'line') {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return true;
    } else if (t === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(L + w / 2, T); ctx.lineTo(R, B); ctx.lineTo(L, B);
      ctx.closePath(); ctx.stroke(); return true;
    } else if (t === 'triangle-fill') {
      if (ctx.strokeStyle) ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(L + w / 2, T); ctx.lineTo(R, B); ctx.lineTo(L, B);
      ctx.closePath(); ctx.fill(); return true;
    }
    // 'cloud' (and anything unknown) → caller handles it.
    return false;
  }

  var API = {
    SHAPE_TOOLS: SHAPE_TOOLS,
    TOOLS: TOOLS,
    SHAPE_ALIASES: SHAPE_ALIASES,
    toCanonical: toCanonical,
    isShapeTool: isShapeTool,
    drawShape: drawShape,
    VERSION: '1.0.0'
  };

  // classic-script global (Diesel single-file, drawing viewer, lightboxes)
  if (root) root.MarkupTools = API;

  // ES-module named exports (FRT modular app) — only if in a module context
  // (guarded so classic <script> loading doesn't choke)
  try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
