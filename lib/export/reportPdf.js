/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — REPORT PDF ENGINE     lib/export/reportPdf.js v0.1.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 4 — the shared PDF engine, opened.

   THE SHAPE OF THIS PHASE (Owner-approved): one engine, layouts as DATA.
   Section order, headings, which charts, which appendices — per-tool config,
   not per-tool code. Cover stays Dark, body stays light/printable; that canon
   is locked and nothing here touches it. The engine grows resident by
   resident, each one proven identical against Diesel's live exporter before
   the next moves in, because the acceptance for this phase is a Diesel PDF
   that is page-for-page identical to today's.

   RESIDENT 1 — APPENDIX ELIGIBILITY.
   Which photographs may appear in the client PDF's photo appendix. The
   MECHANISM is shared; the SCOPE is the tool's. Diesel's scope is an explicit
   Owner decision (S316): gauge and RPM photos, pump photos, flow-chart photos,
   placard and PLD-placard photos — no site records, no checklist, no
   deficiencies. That list arrives as configuration, so Electric can state its
   own scope without a second predicate existing anywhere. This pairs with
   PhotoInventory's live-only default: eligibility here decides WHICH KINDS,
   the inventory has already decided which photos are visible at all — a
   deleted photo never reaches this question.

   RESIDENT 2 — CHART PRINT SIZING.
   Charts are rendered for a screen and printed on paper, and the two disagree
   about resolution. The numbers are the knowledge: a 716-CSS-px stage across
   6.96 printed inches at devicePixelRatio 3 is ~308 dpi — crisp on paper
   without ballooning the canvas — and scaling height by the same factor as
   width keeps the printed aspect identical to the screen's. Just as important
   is the RESTORE: sizing returns a closure that puts every chart back exactly
   as found (style attribute, pixel ratio, and the annotation positions, which
   were computed against the print width and are wrong for the screen until
   re-placed). A missing restore is a report that prints beautifully and
   leaves the app's charts subtly broken until reload.

   HOST CONTRACT: classic <script>, publishes window.ReportPdf.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* Resident 1. `scope` is the tool's statement of what belongs in its client
   appendix: { types: [...], recordKinds: { exact:[...], substrings:[...] } }.
   An entry with no photo is never eligible, whatever the scope says. */
function appendixEligible(it, scope) {
  if (!it || !it.photo || !scope) return false;
  if ((scope.types || []).indexOf(it.type) !== -1) return true;
  if (it.type === 'record' && scope.recordKinds) {
    var k = (it.photo.kind || '');
    if ((scope.recordKinds.exact || []).indexOf(k) !== -1) return true;
    var subs = scope.recordKinds.substrings || [];
    for (var i = 0; i < subs.length; i++) {
      if (k.indexOf(subs[i]) !== -1) return true;
    }
  }
  return false;
}

/* Resident 2. `charts` is the tool's list of live chart instances; deps can
   carry `annotate(chart, canvasId)` for tools that overlay labels. Returns the
   restore closure — calling it is not optional. */
function sizeChartsForPrint(charts, deps) {
  deps = deps || {};
  var PRINT_STAGE_W = deps.stageWidthPx || 716;  // 72*10*6.96/716 = a 10px mark prints at 7.0pt
  var PRINT_DPR = deps.devicePixelRatio || 3;    // 716×3 across 6.96in ≈ 308 dpi
  var saved = [];
  (charts || []).forEach(function (c) {
    try {
      if (!c || !c.canvas) return;
      var stage = c.canvas.parentElement;
      if (!stage) return;
      var w = stage.clientWidth || 0, h = stage.clientHeight || 0;
      if (!w || !h) return;
      saved.push({ c: c, stage: stage, style: stage.getAttribute('style'),
                   dpr: (c.options ? c.options.devicePixelRatio : undefined) });
      stage.style.width = PRINT_STAGE_W + 'px';
      stage.style.height = Math.round(h * (PRINT_STAGE_W / w)) + 'px';  // same aspect => same printed height
      if (c.options) c.options.devicePixelRatio = PRINT_DPR;
      c.resize();
      (c.__origUpdate || c.update).call(c, 'none');
    } catch (_) {}
  });
  return function restore() {
    saved.forEach(function (s) {
      try {
        if (s.style === null) s.stage.removeAttribute('style');
        else s.stage.setAttribute('style', s.style);
        if (s.c.options) {
          if (s.dpr === undefined) delete s.c.options.devicePixelRatio;
          else s.c.options.devicePixelRatio = s.dpr;
        }
        s.c.resize();
        (s.c.__origUpdate || s.c.update).call(s.c, 'none');
        /* Labels were positioned against the print-width chart — re-place them
           for the screen, or they sit visibly off until the next reload. */
        if (typeof deps.annotate === 'function' && s.c.canvas) deps.annotate(s.c, s.c.canvas.id);
      } catch (_) {}
    });
  };
}

var api = {
  appendixEligible: appendixEligible,
  sizeChartsForPrint: sizeChartsForPrint,
  VERSION: '0.1.0'
};

if (root) root.ReportPdf = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
