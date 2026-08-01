// frt/js/viewer/dimensionTool.js
// S126 #6 — Dimension tool with chain modes, perpendicular offset,
// always-edit-on-commit, vertex handles, best-guess scale, recalibration
// walker, and Option-D override pill.
//
// ─────────────────────────────────────────────────────────────────────
// DIMENSION OBJECT SHAPE
// ─────────────────────────────────────────────────────────────────────
//
// New (S126+):
// {
//   id, type: 'dimension',
//   mx1, my1, mx2, my2,       // measured points (real geometry being measured)
//   offset,                    // signed perpendicular distance from measured
//                              //   axis to rendered dimension line
//   color, size, opacity,
//   rawValue, rawLabel,        // computed from |AB| × scaleRatio
//   overrideLabel,             // user-typed override; null = use rawLabel
//   isGuess                    // true if drawn against auto-guessed calibration
// }
//
// Legacy (pre-S126, still rendered):
// {
//   id, type: 'dimension',
//   x1, y1, x2, y2,            // the dimension line itself (= measured line)
//   color, size, opacity, rawValue, rawLabel, overrideLabel
// }
//
// Legacy renders without extension lines (offset = 0 effectively). New
// objects render with extension stubs and offset dimension line.
//
// ─────────────────────────────────────────────────────────────────────
// CALIBRATION OBJECT (drawing.calibration)
// ─────────────────────────────────────────────────────────────────────
// {
//   p1, p2, realDistance, units, scaleRatio, createdAt,
//   _guessed: false              // true if auto-guessed from filename
//                                //   or default 200 ft page-width
// }
//
// ─────────────────────────────────────────────────────────────────────
// CHAIN MODES
// ─────────────────────────────────────────────────────────────────────
// 'single'     — click A, click B, click offset → commit. Tool stays
//                active; next click starts a new A.
// 'continuous' — click A, click B, click offset → commit AB; B becomes
//                next A. Click next-pt, click offset → commit BC; chain
//                forward. Esc / dbl-click ends chain.
// 'running'    — click A, click B, click offset → commit AB. A persists
//                as origin. Click next-pt, click offset → commit AC.
//                Repeats from A. Esc / dbl-click ends.
//
// ─────────────────────────────────────────────────────────────────────
// PUBLIC API (window._dimTool.*)
// ─────────────────────────────────────────────────────────────────────
// isCalibrated, getCalibration, formatLabel, computeLabel, parseDimNumber
// renderObject, renderPreview, renderVertexHandles
// showCalibrationPrompt
// setMode, getMode, getState
// handleClick, handleMove, endChain, cancel
// hitTestDimension, hitTestVertex
// guessScale, applyGuessedCalibration, recalibrateAll

(function () {
  'use strict';

  // ── Units & display-unit state (S330 #37) ────────────────────────────
  // DISPLAY_UNIT is the engine-wide render choice ('imperial' | 'metric').
  // It is display-only: dimension geometry + calibration are NEVER mutated
  // by toggling it. Persisted by the host (markup.js) via FRT's own
  // mechanism, NOT artifact localStorage. Calibration.units still records
  // the unit the scale was entered in (used to turn pixels into metres).
  // ── S552 — SIZED FOR FINGERS, NOT MICE. ──────────────────────────────────
  // Every other affordance in the drawing viewer is sized in SCREEN terms via
  // the host's _uiScale(), so it stays finger-sized however far out you zoom.
  // The dimension tool never got that: its endpoint handles were a flat 10
  // DRAWING units and grabbed within 12 — on a large sheet fitted to a tablet
  // that is a dot about two pixels wide with a three-pixel grab zone, roughly
  // a twentieth the width of a fingertip. The host now feeds its scale in.
  var UI_SCALE = 1;
  function setUiScale(s) { UI_SCALE = (typeof s === 'number' && s > 0) ? s : 1; }
  function _px(n) { return n * UI_SCALE; }          // screen px → drawing units

  // Touch has no fine control and no hover. Detected once; drives grab size
  // and how close to straight counts as straight.
  var COARSE = false;
  try { COARSE = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches); } catch (e) {}

  var DISPLAY_UNIT = 'imperial';
  function getDisplayUnit() { return DISPLAY_UNIT; }
  function setDisplayUnit(u) { DISPLAY_UNIT = (u === 'metric') ? 'metric' : 'imperial'; }

  var FT_PER_M = 1 / 0.3048;

  // ── Formatting (S330: feet-inches to nearest 1/2", metric mm/m) ───────

  function _roundHalfInch(totalInches) { return Math.round(totalInches * 2) / 2; }

  function _formatFeetArch(valueFt) {
    // valueFt: real-world length expressed in FEET. Rounds to nearest 1/2".
    var sign = valueFt < 0 ? '-' : '';
    var v = Math.abs(valueFt);
    var totalInches = _roundHalfInch(v * 12);
    var feet = Math.floor(totalInches / 12);
    var inchRem = totalInches - feet * 12;
    var wholeInch = Math.floor(inchRem);
    var half = (inchRem - wholeInch) >= 0.5 ? '\u00BD' : '';
    var inchPart = (wholeInch || half) ? (wholeInch + half + '"') : '0"';
    return sign + feet + "'-" + inchPart;
  }

  function _formatMetric(meters) {
    var mm = Math.round(meters * 1000);
    if (Math.abs(mm) >= 10000) {
      return (mm / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' m';
    }
    return mm + ' mm';
  }

  // formatLabel(value, units): legacy signature kept for back-compat.
  // value is in the given units ('ft' => feet, 'm' => metres).
  function formatLabel(value, units) {
    if (units === 'm') return _formatMetric(value);
    return _formatFeetArch(value);
  }

  // Format a true length (in METRES) according to the current DISPLAY_UNIT.
  function formatMeters(meters) {
    if (DISPLAY_UNIT === 'metric') return _formatMetric(meters);
    return _formatFeetArch(meters * FT_PER_M);
  }

  // ── Smart length parser (S330 #37) ───────────────────────────────────
  // Returns { meters, system, confidence, label, isNote }.
  //   meters: real length in metres, or null when unparseable / a note.
  //   system: 'imperial' | 'metric' (best guess for the input).
  //   confidence: 'ok' | 'guess' | 'note' | 'bad'.
  //   label: formatted interpretation for the live preview.
  //   isNote: true when the text is a frozen note (TYP., EQ, VERIFY...).
  // Rules: dash = feet-inches separator (8-4 => 8'-4", never 84);
  //        bare number with no units => imperial FEET (flagged guess);
  //        explicit mm/cm/m/km => metric; ', ", ft, in => imperial.
  function parseLength(raw) {
    var s = (raw == null ? '' : String(raw)).trim();
    if (!s) return { meters: null, system: DISPLAY_UNIT, confidence: 'bad', label: '\u2014', isNote: false };
    var low = s.toLowerCase().replace(/[, ]+/g, ' ').trim();

    // explicit metric
    var mMet = low.match(/^([\d]*\.?[\d]+)\s*(mm|cm|m|km)$/);
    if (mMet) {
      var v = parseFloat(mMet[1]), u = mMet[2];
      var meters = u === 'mm' ? v / 1000 : u === 'cm' ? v / 100 : u === 'km' ? v * 1000 : v;
      return { meters: meters, system: 'metric', confidence: 'ok', label: _formatMetric(meters), isNote: false };
    }

    var feet = 0, inches = 0, matched = false;
    var hasMetricTok = /(mm|cm|km|\bm\b)/.test(low);
    // dash form: feet - inches (optionally with a fraction)
    var dash = low.match(/^(\d+)\s*-\s*(\d+(?:\s+\d+\/\d+)?(?:\.\d+)?)\s*(?:"|in|inch|inches)?$/);
    if (dash && !hasMetricTok) {
      feet = parseInt(dash[1], 10); inches = _parseInchToken(dash[2]); matched = true;
    } else {
      var fM = low.match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)/);
      if (fM) { feet = parseFloat(fM[1]); matched = true; }
      var iM = low.match(/(?:'|ft|feet|foot)\s*(\d+(?:\s+\d+\/\d+)?(?:\.\d+)?)\s*(?:"|in|inch|inches)?/);
      if (iM) { inches = _parseInchToken(iM[1]); matched = true; }
      else {
        var iOnly = low.match(/^(\d+(?:\s+\d+\/\d+)?(?:\.\d+)?)\s*(?:"|in|inch|inches)$/);
        if (iOnly) { inches = _parseInchToken(iOnly[1]); feet = 0; matched = true; }
      }
    }
    if (matched) {
      var m2 = (feet * 12 + inches) * 0.0254;
      return { meters: m2, system: 'imperial', confidence: 'ok', label: _formatFeetArch(m2 * FT_PER_M), isNote: false };
    }

    // bare number => assume imperial feet
    var bare = low.match(/^(\d+(?:\.\d+)?)$/);
    if (bare) {
      var ft = parseFloat(bare[1]);
      var m3 = ft * 0.3048;
      return { meters: m3, system: 'imperial', confidence: 'guess', label: _formatFeetArch(ft), isNote: false };
    }

    // non-numeric => frozen text note
    return { meters: null, system: DISPLAY_UNIT, confidence: 'note', label: s, isNote: true };
  }

  function _parseInchToken(t) {
    t = String(t).trim();
    var whole = 0, frac = 0;
    var fr = t.match(/(\d+)\s+(\d+)\/(\d+)/);
    if (fr) { whole = parseInt(fr[1], 10); frac = parseInt(fr[2], 10) / parseInt(fr[3], 10); }
    else {
      var fr2 = t.match(/^(\d+)\/(\d+)$/);
      if (fr2) { frac = parseInt(fr2[1], 10) / parseInt(fr2[2], 10); }
      else { whole = parseFloat(t) || 0; }
    }
    return whole + frac;
  }

  // Legacy numeric parser kept for the calibration modal (returns a plain
  // number in the field's own unit). Unchanged behaviour.
  function _parseDimNumber(raw) {
    if (raw == null) return 0;
    var s = String(raw).trim();
    if (!s) return 0;
    s = s.replace(/["'\u2032\u2033]|in|ft|cm|mm|\bm\b/gi, '').trim();
    if (!s) return 0;
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    var mixed = s.match(/^(-?\d+)[\s\-]+(\d+)\/(\d+)$/);
    if (mixed) {
      var sign = mixed[1].charAt(0) === '-' ? -1 : 1;
      var whole = Math.abs(parseInt(mixed[1], 10));
      var num = parseInt(mixed[2], 10);
      var den = parseInt(mixed[3], 10);
      if (den > 0) return sign * (whole + num / den);
    }
    var frac = s.match(/^(-?\d+)\/(\d+)$/);
    if (frac) {
      var fNum = parseInt(frac[1], 10);
      var fDen = parseInt(frac[2], 10);
      if (fDen > 0) return fNum / fDen;
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // ── Geometry helpers ─────────────────────────────────────────────────

  function _pixelDist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Returns { ux, uy, px, py, len } for vector A→B. Perp is rotated +90°
  // (right-hand of direction). Returns null if A=B.
  // ── S331h — Ortho / angle snapping (AutoCAD-style F8 ortho + polar) ──
  // When the in-progress A→B line is within a small angular threshold of a
  // cardinal (0/90/180/270) or 45° diagonal, snap B to lie exactly on that
  // ray from A. Past the threshold the line is fully free (true diagonals
  // work normally). Default ON; a flag lets the UI toggle it. _orthoActive
  // tells the preview to draw a faint guide line.
  var _orthoSnap = true;       // feature enabled
  var _orthoActive = false;    // currently snapping (drives the guide)
  // S552: 1.5° is a mouse tolerance. Nobody holds 1.5° with a finger on a
  // moving tablet, so on touch the snap effectively never fired and every
  // dimension came out very slightly skewed — with no way to correct it
  // except grabbing the (unhittable) endpoint again.
  var ORTHO_TOL_DEG = 1.5;     // within ±1.5° of a snap angle → snap (near-perfect only)
  function _orthoTol() { return (COARSE ? 4.5 : ORTHO_TOL_DEG) * Math.PI / 180; }
  function setOrthoSnap(on) { _orthoSnap = !!on; }
  function isOrthoSnap() { return _orthoSnap; }
  function isOrthoActive() { return _orthoActive; }
  // ── S479 (Mark 3.1 extension) — align-to-EXISTING-dims cache ──────────
  // The FIRST dimension of a session had no guide help at diagonals: ortho
  // only knows the 45° grid, and offset-snap only knew the chain's own
  // _lastOffset. This cache holds, for every dimension already on the
  // drawing, (a) its segment ANGLE and (b) one point ON its dimension LINE.
  // _applyOrtho snaps the 2nd point parallel to any cached angle; _snapOffset
  // snaps the 3rd point onto any parallel dim's row. Both reuse the existing
  // green guides — no new rendering. Refreshed on every click/seed that
  // carries the v1 object views (move-time snap uses the last cache).
  var _alignDims = [];   // [{ ang, lx, ly }]
  function _cacheAlignDims(objects) {
    _alignDims = [];
    if (!objects) return;
    for (var i = 0; i < objects.length; i++) {
      var o = objects[i];
      if (!o || o.type !== 'dimension') continue;
      var ax = (o.mx1 != null) ? o.mx1 : o.x1, ay = (o.mx1 != null) ? o.my1 : o.y1;
      var bx = (o.mx1 != null) ? o.mx2 : o.x2, by = (o.mx1 != null) ? o.my2 : o.y2;
      var f = _abFrame(ax, ay, bx, by);
      if (!f) continue;
      var off = (typeof o.offset === 'number') ? o.offset : 0;
      _alignDims.push({
        ang: Math.atan2(by - ay, bx - ax),
        lx: (ax + bx) / 2 + f.px * off,     // midpoint displaced onto the dim LINE
        ly: (ay + by) / 2 + f.py * off
      });
    }
  }
  // Snap a moving point `p` relative to anchor `a`. Returns the (possibly
  // adjusted) point and sets _orthoActive. Snap angles: every 45°.
  function _applyOrtho(a, p) {
    _orthoActive = false;
    if (!_orthoSnap || !a) return p;
    var dx = p.x - a.x, dy = p.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return p;
    var ang = Math.atan2(dy, dx);                 // (-PI, PI]
    var step = Math.PI / 4;                        // 45° increments
    var snapAng = Math.round(ang / step) * step;   // nearest 45° ray
    // Wrapped angular difference in (-PI, PI] — symmetric in every direction,
    // including the ±180° boundary where the previous version failed (a back-
    // drag flipped the sign and fell outside the tolerance window).
    var d = ang - snapAng;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) <= _orthoTol()) {
      _orthoActive = true;
      return { x: a.x + Math.cos(snapAng) * len, y: a.y + Math.sin(snapAng) * len };
    }
    // S479 (Mark 3.1 extension): not on the 45° grid — try running PARALLEL
    // to an existing dimension (either direction), same ±1.5° tolerance.
    // This is what makes diagonals repeatable: dim #2+ locks to dim #1's
    // exact angle instead of being eyeballed. Reuses the same green guide.
    for (var i = 0; i < _alignDims.length; i++) {
      var dd = ang - _alignDims[i].ang;
      while (dd > Math.PI / 2) dd -= Math.PI;    // fold: parallel OR anti-parallel
      while (dd < -Math.PI / 2) dd += Math.PI;
      if (Math.abs(dd) <= _orthoTol()) {
        _orthoActive = true;
        var sa = ang - dd;                        // exact parallel ray through a
        return { x: a.x + Math.cos(sa) * len, y: a.y + Math.sin(sa) * len };
      }
    }
    return p;
  }

  // S331x — draw a short perpendicular tick at point (px,py), oriented across
  // the dimension direction (ax,ay)→(bx,by). Used for in-progress endpoints so
  // they read as dimension ticks (lines) rather than big dots.
  function _drawTick(ctx, px, py, ox, oy) {
    var dx = ox - px, dy = oy - py, len = Math.sqrt(dx*dx + dy*dy);
    var ux, uy;
    if (len < 1) { ux = 1; uy = 0; } else { ux = -dy/len; uy = dx/len; } // perpendicular
    var h = _px(9); // S552: half-length in SCREEN px, constant at any zoom
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - ux*h, py - uy*h);
    ctx.lineTo(px + ux*h, py + uy*h);
    ctx.stroke();
    ctx.restore();
  }

  function _abFrame(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.0001) return null;
    var ux = dx / len, uy = dy / len;
    return { ux: ux, uy: uy, px: -uy, py: ux, len: len };
  }

  // Compute signed perpendicular offset of cursor from the AB line
  // (positive = right side of A→B direction). Used during the "await
  // offset" click to drive the live preview.
  function _projectOffset(ax, ay, bx, by, cx, cy) {
    var f = _abFrame(ax, ay, bx, by);
    if (!f) return 0;
    var mx = (ax + bx) / 2, my = (ay + by) / 2;
    var ddx = cx - mx, ddy = cy - my;
    return ddx * f.px + ddy * f.py;
  }

  // For a dimension with measured points A,B and signed offset, returns
  // the four key points: extA = A + offset, extB = B + offset (these are
  // the dimension line endpoints; A→extA and B→extB are the extension
  // stubs).
  function _offsetEndpoints(ax, ay, bx, by, offset) {
    var f = _abFrame(ax, ay, bx, by);
    if (!f) return null;
    return {
      extA: { x: ax + f.px * offset, y: ay + f.py * offset },
      extB: { x: bx + f.px * offset, y: by + f.py * offset },
      frame: f
    };
  }

  function isCalibrated(drawing) {
    return !!(drawing && drawing.calibration && drawing.calibration.scaleRatio > 0);
  }
  function getCalibration(drawing) { return (drawing && drawing.calibration) || null; }

  function computeLabel(x1, y1, x2, y2, calibration) {
    if (!calibration || !calibration.scaleRatio) return null;
    var px = _pixelDist(x1, y1, x2, y2);
    var rawValue = px * calibration.scaleRatio;            // in calibration.units
    var units = calibration.units || 'ft';
    var trueM = units === 'm' ? rawValue : rawValue * 0.3048; // store metres
    var rawLabel = formatLabel(rawValue, units);
    return { rawValue: rawValue, rawLabel: rawLabel, trueM: trueM };
  }

  // True length of a dimension object in METRES, or null if uncalibrated
  // and never given a value. Prefers the stored trueM; falls back to
  // recomputing from rawValue when an older object predates trueM.
  function dimTrueMeters(obj) {
    if (!obj) return null;
    if (typeof obj.trueM === 'number') return obj.trueM;
    if (typeof obj.rawValue === 'number' && obj.rawValue) {
      // legacy: rawValue stored in the calibration unit at draw time.
      // Assume feet unless the stored rawLabel looks metric.
      var metric = /\bm(m)?\b/.test(obj.rawLabel || '');
      return metric ? obj.rawValue : obj.rawValue * 0.3048;
    }
    return null;
  }

  // Resolve the on-screen label for a dimension, honouring DISPLAY_UNIT.
  // Returns { txt, isOverride }.
  //   - override note (non-numeric)  -> frozen text, shown as-is.
  //   - numeric override (ovrM set)  -> converts with the unit toggle.
  //   - measured                     -> formatted from trueM.
  //   - uncalibrated, no value yet   -> em-dash placeholder.
  function resolveLabel(obj) {
    if (!obj) return { txt: '', isOverride: false };
    // Frozen text note override
    if (obj.overrideNote != null && obj.overrideNote !== '') {
      return { txt: obj.overrideNote, isOverride: true };
    }
    // Numeric override (true length in metres)
    if (typeof obj.ovrM === 'number') {
      return { txt: formatMeters(obj.ovrM), isOverride: true };
    }
    // Legacy string override with no parsed length — keep showing it
    if (obj.overrideLabel != null && obj.overrideLabel !== '') {
      var p = parseLength(obj.overrideLabel);
      if (p.meters != null) return { txt: formatMeters(p.meters), isOverride: true };
      return { txt: obj.overrideLabel, isOverride: true };
    }
    var tm = dimTrueMeters(obj);
    if (tm == null) return { txt: '\u2014 set \u2014', isOverride: false };
    return { txt: formatMeters(tm), isOverride: false };
  }

  // ── Best-guess scale (S126 #6c) ──────────────────────────────────────

  /**
   * Heuristic scale guess from drawing filename + canvas pixel width.
   * Returns { scaleRatio, units, source } or a default-fallback object
   * (never null). Always marks _guessed so the caller can flag dimensions
   * drawn against this scale with the ~ tilde prefix.
   *
   * Patterns recognized in filename (case-insensitive, common positions):
   *   "1\"=20"    → engineering: 1 inch on paper = 20 feet
   *   "1\"=20'"   → same (apostrophe optional)
   *   "1:50"      → architectural ratio: 1 unit on paper = 50 units real
   *   "1=50"      → same (= variant)
   *   "1/4\"=1'"  → architectural fractional: 1/4 inch = 1 foot
   *   "1/8\"=1'"  → same family
   *
   * Without a known PDF physical size, we assume a 22-inch-wide engineering
   * sheet (ARCH-D ≈ 24"×36", but the printable area is closer to 22"). For
   * a guess this is fine — the user will calibrate properly when accuracy
   * matters, and the ~ prefix flags every result.
   *
   * Fallback when no pattern matches: 200 ft page-width.
   */
  function guessScale(drawing, canvasLogicalW) {
    var pxW = canvasLogicalW || 0;
    if (!(pxW > 0)) {
      return { scaleRatio: 0.1, units: 'ft', source: 'default (no canvas dims)' };
    }
    var fname = (drawing && (drawing.fname || drawing.name || '')) || '';
    var assumedPaperInches = 22;
    var paperFt = assumedPaperInches / 12;

    // Fractional architectural: 1/4"=1' or 1/8"=1'
    var m = fname.match(/\b(\d+)\s*\/\s*(\d+)\s*["\u2033]\s*=\s*1\s*['\u2032]/);
    if (m) {
      var num = parseFloat(m[1]), den = parseFloat(m[2]);
      if (num > 0 && den > 0) {
        var fracInches = num / den;
        var ftPerPaperIn = 1 / fracInches;
        var ftPerPixel = (assumedPaperInches * ftPerPaperIn) / pxW;
        return { scaleRatio: ftPerPixel, units: 'ft', source: 'filename ' + m[0] };
      }
    }

    // Engineering: 1"=N (with optional foot mark on N)
    m = fname.match(/\b1\s*["\u2033]\s*=\s*(\d+(?:\.\d+)?)\s*['\u2032]?/);
    if (m) {
      var nFt = parseFloat(m[1]);
      if (nFt > 0) {
        var ftPerPixel2 = (assumedPaperInches * nFt) / pxW;
        return { scaleRatio: ftPerPixel2, units: 'ft', source: 'filename ' + m[0] };
      }
    }

    // Generic ratio: 1:N or 1=N
    m = fname.match(/\b1\s*[:=]\s*(\d+(?:\.\d+)?)\b/);
    if (m) {
      var nRatio = parseFloat(m[1]);
      if (nRatio > 0) {
        var realW_ft = paperFt * nRatio;
        var ftPerPixel3 = realW_ft / pxW;
        return { scaleRatio: ftPerPixel3, units: 'ft', source: 'filename ' + m[0] };
      }
    }

    // Default: 200 ft across the page
    return { scaleRatio: 200 / pxW, units: 'ft', source: '200 ft page-width default' };
  }

  /**
   * Set drawing.calibration to a guessed value. Adds two synthetic
   * endpoints at (10px, 10px) and (10px + 1ft-worth-of-px, 10px) just to
   * satisfy the structural requirement that a calibration carry p1/p2 —
   * they are NOT used for anything visible once _guessed=true.
   */
  function applyGuessedCalibration(drawing, canvasLogicalW) {
    if (!drawing) return null;
    var g = guessScale(drawing, canvasLogicalW);
    var pxPerFt = 1 / g.scaleRatio;
    var cal = {
      p1: { x: 10, y: 10 },
      p2: { x: 10 + pxPerFt, y: 10 },
      realDistance: 1,
      units: g.units,
      scaleRatio: g.scaleRatio,
      createdAt: new Date().toISOString(),
      _guessed: true,
      _guessSource: g.source
    };
    drawing.calibration = cal;
    return cal;
  }

  // ── Recalibration walker (S126 #6g) ──────────────────────────────────

  /**
   * Walk all markup objects in place; for every dimension recompute
   * rawValue + rawLabel from the new calibration. Overridden dimensions
   * keep their displayed override BUT their underlying rawValue/rawLabel
   * still update silently — so if the user later clears the override
   * they see the current-scale value, not the stale one. Sets
   * isGuess=false on all dims (real calibration replaces a guess).
   */
  function recalibrateAll(objects, newCalibration, mode) {
    if (!objects || !objects.length) return 0;
    if (!newCalibration || !newCalibration.scaleRatio) return 0;
    // mode: 'measured' (default) recomputes measured dims, keeps overrides;
    //       'all' also clears numeric overrides so everything shows measured;
    //       'none' leaves existing dims, only future dims use the new scale.
    mode = mode || 'measured';
    if (mode === 'none') return 0;
    var n = 0;
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      if (!obj || obj.type !== 'dimension') continue;
      var ax, ay, bx, by;
      if (obj.mx1 != null) { ax = obj.mx1; ay = obj.my1; bx = obj.mx2; by = obj.my2; }
      else { ax = obj.x1; ay = obj.y1; bx = obj.x2; by = obj.y2; }
      var lab = computeLabel(ax, ay, bx, by, newCalibration);
      if (lab) {
        obj.rawValue = lab.rawValue;
        obj.rawLabel = lab.rawLabel;
        obj.trueM = lab.trueM;
      }
      if (mode === 'all') { obj.ovrM = undefined; obj.overrideNote = null; obj.overrideLabel = null; }
      if (obj.isGuess) obj.isGuess = false;
      n++;
    }
    return n;
  }

  // ── Calibration prompt UI (unchanged structurally from S125) ─────────

  function showCalibrationPrompt(drawing, x1, y1, x2, y2, onComplete) {
    // S331e #37 — Compact, theme-aware calibration modal. Reads body.dark-mode
    // and switches the whole palette; smaller footprint than the prior build.
    var DARK = false;
    try { DARK = document.body.classList.contains('dark-mode'); } catch (e) {}
    var P = DARK ? {
      ov:'rgba(0,0,0,.6)', card:'#231f29', rule:'#3a3340', ink:'#f4f3f6',
      ink2:'#a79fb0', ink3:'#8a8194', badge:'#3a2030', accent:'#E26076',
      xbg:'#332d3a', xink:'#b6acc2', inBg:'#1b1820', inBd:'#4a4356',
      cardBg:'#2a2530', cardBd:'#3a3340', icoBg:'#3a3340', icoInk:'#a79fb0',
      cancelBg:'#332d3a', cancelInk:'#cfc7d6'
    } : {
      ov:'rgba(20,18,24,.5)', card:'#fff', rule:'#efe9dc', ink:'#3a352c',
      ink2:'#8a8073', ink3:'#9a8e74', badge:'#f3d9de', accent:'#9C2742',
      xbg:'#f4f1ea', xink:'#8a8073', inBg:'#fff', inBd:'#d8d0bf',
      cardBg:'#f7f4ee', cardBd:'#e3ddd0', icoBg:'#e3ddd0', icoInk:'#9a8e74',
      cancelBg:'#f0ece3', cancelInk:'#6a6253'
    };
    var overlay = document.createElement('div');
    overlay.id = 'dim-cal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:' + P.ov + ';z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;';

    var modal = document.createElement('div');
    modal.className = 'dim-cal-modal';
    modal.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px 12px;border-bottom:1px solid ' + P.rule + ';">' +
        '<div style="width:32px;height:32px;border-radius:9px;background:' + P.badge + ';color:' + P.accent + ';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">\ud83d\udccf</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-family:Calibri,sans-serif;font-size:15px;font-weight:700;color:' + P.accent + ';line-height:1.15;">Set the drawing scale</div>' +
          '<div style="font-family:Calibri,sans-serif;font-size:12px;color:' + P.ink2 + ';margin-top:1px;">How long is the line you just drew?</div>' +
        '</div>' +
        '<button class="dim-cal-x" aria-label="Close" style="width:28px;height:28px;border:none;background:' + P.xbg + ';border-radius:7px;color:' + P.xink + ';font-size:14px;cursor:pointer;font-family:Calibri,sans-serif;flex-shrink:0;">\u2715</button>' +
      '</div>' +
      '<div style="padding:14px 16px 16px;">' +
        '<input type="text" class="dim-cal-val" inputmode="text" autocomplete="off" placeholder="e.g. 8-4" ' +
          'style="width:100%;box-sizing:border-box;padding:11px 13px;border:2px solid ' + P.inBd + ';border-radius:9px;font-family:Calibri,sans-serif;font-size:20px;font-weight:700;color:' + P.ink + ';background:' + P.inBg + ';outline:none;transition:border-color .12s;">' +
        '<div style="font-family:Calibri,sans-serif;font-size:11px;color:' + P.ink3 + ';margin-top:5px;">8-4 → 8\u2032-4\u2033 \u00b7 12 → 12 ft \u00b7 2.5m → metric</div>' +
        '<div class="dim-cal-interp" style="margin-top:11px;padding:10px 12px;border-radius:9px;border:1px solid ' + P.cardBd + ';background:' + P.cardBg + ';display:flex;align-items:center;gap:9px;">' +
          '<div class="dci-icon" style="width:22px;height:22px;border-radius:50%;background:' + P.icoBg + ';color:' + P.icoInk + ';display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">=</div>' +
          '<div style="min-width:0;flex:1;">' +
            '<div class="dci-big" style="font-family:Calibri,sans-serif;font-size:17px;font-weight:700;color:' + P.ink2 + ';line-height:1.1;">\u2014</div>' +
            '<div class="dci-sub" style="font-family:Calibri,sans-serif;font-size:11px;color:' + P.ink2 + ';margin-top:1px;">Reads your length as you type.</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">' +
          '<button class="dim-cal-cancel" style="font-family:Calibri,sans-serif;font-size:13px;font-weight:600;padding:9px 16px;background:' + P.cancelBg + ';color:' + P.cancelInk + ';border:none;border-radius:8px;cursor:pointer;">Cancel</button>' +
          '<button class="dim-cal-ok" disabled style="font-family:Calibri,sans-serif;font-size:13px;font-weight:700;padding:9px 20px;background:#9C2742;color:#fff;border:none;border-radius:8px;cursor:pointer;opacity:.4;">Save scale</button>' +
        '</div>' +
      '</div>';
    modal.style.cssText = 'position:relative;background:' + P.card + ';border-radius:14px;width:340px;max-width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // theme palette reused by _updateInterp for state colors
    var _P = P;
    var valInput = modal.querySelector('.dim-cal-val');
    var interpBox = modal.querySelector('.dim-cal-interp');
    var interpBig = modal.querySelector('.dci-big');
    var interpSub = modal.querySelector('.dci-sub');
    var interpIcon = modal.querySelector('.dci-icon');
    var okBtn = modal.querySelector('.dim-cal-ok');
    var cancelBtn = modal.querySelector('.dim-cal-cancel');
    var xBtn = modal.querySelector('.dim-cal-x');
    var lastParsed = null;
    setTimeout(function () { valInput.focus(); }, 60);

    function _updateInterp() {
      var res = parseLength(valInput.value);
      lastParsed = res;
      var ok = res.meters != null && res.meters > 0;
      if (!valInput.value.trim()) {
        interpBig.textContent = '\u2014';
        interpSub.textContent = 'Reads your length as you type.';
        interpBox.style.background = _P.cardBg; interpBox.style.borderColor = _P.cardBd;
        interpBig.style.color = _P.ink2; interpSub.style.color = _P.ink2;
        interpIcon.textContent = '='; interpIcon.style.background = _P.icoBg; interpIcon.style.color = _P.icoInk;
      } else if (res.isNote || !ok) {
        interpBig.textContent = 'Not a length';
        interpSub.textContent = 'Try a number, like 8-4, 12, or 2.5m.';
        interpBox.style.background = '#FBE3E9'; interpBox.style.borderColor = '#f0c6d0';
        interpBig.style.color = '#8a2740'; interpSub.style.color = '#8a2740';
        interpIcon.textContent = '!'; interpIcon.style.background = '#f3c6d0'; interpIcon.style.color = '#8a2740';
      } else {
        interpBig.textContent = res.label;
        var guess = res.confidence === 'guess';
        interpSub.textContent = guess
          ? 'No units given \u2014 assumed feet. Add \u2032 or m to be explicit.'
          : (res.system === 'metric' ? 'Metric.' : 'Imperial, rounded to the nearest half-inch.');
        interpBox.style.background = guess ? '#FBF1E0' : '#EAF4EC';
        interpBox.style.borderColor = guess ? '#f0dcbb' : '#cfe7d6';
        interpBig.style.color = guess ? '#7a5414' : '#1d5b39';
        interpIcon.textContent = guess ? '\u2248' : '\u2713';
        interpIcon.style.background = guess ? '#f0dcbb' : '#cfe7d6';
        interpIcon.style.color = guess ? '#7a5414' : '#1d5b39';
        interpSub.style.color = guess ? '#7a5414' : '#1d5b39';
      }
      okBtn.disabled = !ok;
      okBtn.style.opacity = ok ? '1' : '.45';
      okBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
    }
    valInput.addEventListener('input', _updateInterp);
    valInput.addEventListener('focus', function () { valInput.style.borderColor = '#9C2742'; });
    valInput.addEventListener('blur', function () { valInput.style.borderColor = _P.inBd; });

    function _close(result) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (onComplete) onComplete(result);
    }
    cancelBtn.addEventListener('click', function () { _close(null); });
    xBtn.addEventListener('click', function () { _close(null); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _close(null); });

    okBtn.addEventListener('click', function () {
      var res = lastParsed || parseLength(valInput.value);
      if (!(res && res.meters != null && res.meters > 0)) {
        valInput.style.borderColor = '#A85959'; valInput.focus(); return;
      }
      // Store in the unit the user expressed it in (ft or m), matching the
      // existing calibration object contract.
      var units = res.system === 'metric' ? 'm' : 'ft';
      var realDist = units === 'm' ? res.meters : (res.meters * FT_PER_M); // metres → feet
      var px = _pixelDist(x1, y1, x2, y2);
      if (!(px > 0)) { _close(null); return; }
      var calibration = {
        p1: { x: x1, y: y1 },
        p2: { x: x2, y: y2 },
        realDistance: realDist,
        units: units,
        scaleRatio: realDist / px,
        createdAt: new Date().toISOString(),
        _guessed: false
      };
      if (drawing) drawing.calibration = calibration;
      _close({
        calibration: calibration,
        firstDim: {
          x1: x1, y1: y1, x2: x2, y2: y2,
          rawValue: realDist,
          rawLabel: formatLabel(realDist, calibration.units)
        }
      });
    });
    valInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (!okBtn.disabled) okBtn.click(); }
      if (e.key === 'Escape') { e.preventDefault(); _close(null); }
    });
    _updateInterp();
  }

  // ── Chain state machine (S126 #6) ────────────────────────────────────

  var _mode = 'single';       // 'single' | 'continuous' | 'running'
  var _state = 'idle';        // 'idle' | 'awaitB' | 'awaitOffset'
  var _pA = null;             // {x,y}: measured point A of current dim
  var _pB = null;             // {x,y}: measured point B of current dim
  var _chainAnchor = null;    // running mode: fixed origin; continuous: rolling
  var _cursor = null;         // last cursor pos for live preview
  var _curCal = null;         // last calibration seen (for live preview labels)
  var _pickAwait = false;     // pickup picker: awaiting a vertex tap
  var _lastOffset = null;     // S331 #37 — last committed signed offset, for align-snap
  var _offsetSnapOn = false;  // S331 #37 — true when the offset preview is snapped to _lastOffset
  var OFFSET_SNAP_PX = 10;    // S331 #37 — catch distance for offset-alignment snap

  // S331 #37 — Offset-alignment snap. If the live signed offset is within
  // OFFSET_SNAP_PX of the LAST committed dimension's offset, snap to it
  // exactly so consecutive dimension lines sit on ONE row (not a staircase).
  // Last-dim-only by design. Returns the (possibly snapped) signed offset and
  // sets _offsetSnapOn for the green guide.
  function _snapOffset(rawOffset, ax, ay, bx, by) {
    _offsetSnapOn = false;
    if (_lastOffset != null && Math.abs(rawOffset - _lastOffset) <= OFFSET_SNAP_PX) {
      _offsetSnapOn = true;
      return _lastOffset;
    }
    // S479 (Mark 3.1 extension): FIRST dim of a session has no _lastOffset —
    // snap instead onto the row of any EXISTING dimension that runs parallel
    // to this segment (within the ortho tolerance). The candidate offset is
    // that dim's line-point projected into THIS segment's frame, so it is
    // exact at any angle. Chain-own offset above keeps priority.
    if (ax != null && _alignDims.length) {
      var ang = Math.atan2(by - ay, bx - ax);
      for (var i = 0; i < _alignDims.length; i++) {
        var dd = ang - _alignDims[i].ang;
        while (dd > Math.PI / 2) dd -= Math.PI;
        while (dd < -Math.PI / 2) dd += Math.PI;
        if (Math.abs(dd) > _orthoTol()) continue;   // not parallel
        var cand = _projectOffset(ax, ay, bx, by, _alignDims[i].lx, _alignDims[i].ly);
        if (Math.abs(rawOffset - cand) <= OFFSET_SNAP_PX) {
          _offsetSnapOn = true;
          return cand;
        }
      }
    }
    return rawOffset;
  }

  function setMode(m) {
    if (m !== 'single' && m !== 'continuous' && m !== 'running') return;
    _mode = m;
    // Switching mode clears any in-progress chain (clean reset)
    resetState();
  }
  function getMode() { return _mode; }
  function getState() {
    return {
      state: _state, mode: _mode,
      pA: _pA ? { x: _pA.x, y: _pA.y } : null,
      pB: _pB ? { x: _pB.x, y: _pB.y } : null,
      chainAnchor: _chainAnchor ? { x: _chainAnchor.x, y: _chainAnchor.y } : null
    };
  }
  function resetState() {
    _state = 'idle'; _pA = null; _pB = null; _chainAnchor = null; _cursor = null; _pickAwait = false;
    _lastOffset = null; _offsetSnapOn = false;  // S331 #37 — align-snap resets with the chain
  }
  function cancel() { resetState(); }
  function endChain() { resetState(); }

  // ── Pickup picker support (S330 #37) ─────────────────────────────────
  // Resume a continuous/running chain from the previous dim's endpoint /
  // origin. setTool-equivalent (resetState) must run BEFORE seeding _pA,
  // because resetState clears it — order matters (locked-spec note §3).
  function startContinueFromPrevious(objects) {
    resetState();
    _cacheAlignDims(objects);   // S479: guide available during the first drag, not just at commit
    var last = _lastDim(objects);
    if (!last) { return false; }
    var a = (last.mx1 != null) ? { x: last.mx1, y: last.my1 } : { x: last.x1, y: last.y1 };
    var b = (last.mx1 != null) ? { x: last.mx2, y: last.my2 } : { x: last.x2, y: last.y2 };
    if (_mode === 'running') { _chainAnchor = { x: a.x, y: a.y }; _pA = { x: a.x, y: a.y }; }
    else { _pA = { x: b.x, y: b.y }; _chainAnchor = null; }
    _state = 'awaitB';
    // S461h (Mark, frt-next field report): ADOPT the previous dimension's
    // signed offset so the green align guide works on the FIRST continued
    // dim too — resetState() above wiped _lastOffset, so the guide only
    // appeared from the 2nd chain link onward. The offset is signed along
    // the segment's own perpendicular, so this snaps in ANY direction the
    // previous dim ran (horizontal, vertical, diagonal) — not just up/down.
    if (typeof last.offset === 'number') _lastOffset = last.offset;
    return true;
  }
  function startPickPoint() { resetState(); _pickAwait = true; }
  function startFresh() { resetState(); }
  function isPickAwaiting() { return _pickAwait; }
  // Seed the chain from an explicitly tapped vertex.
  function seedFromPoint(p, objects) {
    _pickAwait = false;
    _cacheAlignDims(objects);   // S479: guide available during the first drag, not just at commit
    if (_mode === 'running') { _chainAnchor = { x: p.x, y: p.y }; _pA = { x: p.x, y: p.y }; }
    else { _pA = { x: p.x, y: p.y }; _chainAnchor = null; }
    _state = 'awaitB';
    // S461h (Mark): if the picked vertex belongs to an existing dimension,
    // adopt THAT dim's signed offset so the first dim drawn from it gets the
    // green align guide (any direction — the offset rides the segment's own
    // perpendicular). Caller passes the v1 object views.
    if (objects) {
      for (var i = objects.length - 1; i >= 0; i--) {
        var o = objects[i];
        if (!o || o.type !== 'dimension') continue;
        var ax = (o.mx1 != null) ? o.mx1 : o.x1, ay = (o.mx1 != null) ? o.my1 : o.y1;
        var bx = (o.mx1 != null) ? o.mx2 : o.x2, by = (o.mx1 != null) ? o.my2 : o.y2;
        if ((Math.abs(p.x - ax) < 0.5 && Math.abs(p.y - ay) < 0.5) ||
            (Math.abs(p.x - bx) < 0.5 && Math.abs(p.y - by) < 0.5)) {
          if (typeof o.offset === 'number') _lastOffset = o.offset;
          break;
        }
      }
    }
  }
  function _lastDim(objects) {
    if (!objects) return null;
    for (var i = objects.length - 1; i >= 0; i--) {
      if (objects[i] && objects[i].type === 'dimension') return objects[i];
    }
    return null;
  }
  // All vertices (start/end) of every dimension — for the pickup highlight
  // + snapping. Returns [{x,y}].
  function allVertices(objects) {
    var vs = [];
    if (!objects) return vs;
    for (var i = 0; i < objects.length; i++) {
      var o = objects[i];
      if (!o || o.type !== 'dimension') continue;
      if (o.mx1 != null) { vs.push({ x: o.mx1, y: o.my1 }); vs.push({ x: o.mx2, y: o.my2 }); }
      else { vs.push({ x: o.x1, y: o.y1 }); vs.push({ x: o.x2, y: o.y2 }); }
    }
    return vs;
  }
  // Nearest vertex within `maxDist` logical px of p, else null.
  function nearestVertex(p, objects, maxDist) {
    var best = null, bd = (maxDist || 12) * (maxDist || 12);
    var vs = allVertices(objects);
    for (var i = 0; i < vs.length; i++) {
      var dx = vs[i].x - p.x, dy = vs[i].y - p.y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = vs[i]; }
    }
    return best;
  }
  // Is the chain waiting between dimensions (so the finish ✕ chip shows)?
  // Anchor point for the chip is returned, or null when not waiting.
  function chainFinishAnchor() {
    if (_state !== 'awaitB') return null;
    if (_mode === 'continuous' && _pA) return { x: _pA.x, y: _pA.y };
    if (_mode === 'running' && _chainAnchor) return { x: _chainAnchor.x, y: _chainAnchor.y };
    return null;
  }

  /**
   * Process a click in dimension tool mode. Caller passes the click
   * position and the active drawing (for calibration / units).
   *
   * Returns an object describing what happened:
   *   { committed: false, action: 'lockedA' | 'lockedB' | 'noop' }
   *   { committed: true, obj: <dimensionObj>, action: 'committed' }
   *
   * On 'committed', caller pushes obj into the markup objects array,
   * calls pushHistory, renderAll, markDirty, and spawns the always-edit
   * label input. Chain logic (next-state) is handled internally.
   */
  function handleClick(pos, drawing, objects) {
    if (!pos) return { committed: false, action: 'noop' };
    _cacheAlignDims(objects);   // S479: refresh align-to-existing-dims cache (see §S331h block)
    var cal = getCalibration(drawing);
    _curCal = cal;
    // Gentle snap to a nearby existing vertex so chains close cleanly
    // (locked spec §3). Only the start/end points snap, not the offset.
    var _vertexSnapped = false;
    if (objects && _state !== 'awaitOffset') {
      var snap = nearestVertex(pos, objects, 12);
      if (snap) { pos = { x: snap.x, y: snap.y }; _vertexSnapped = true; }
    }
    if (_state === 'idle') {
      _pA = { x: pos.x, y: pos.y };
      _state = 'awaitB';
      // In running mode, the first A becomes the persistent anchor
      if (_mode === 'running' && !_chainAnchor) {
        _chainAnchor = { x: pos.x, y: pos.y };
      }
      return { committed: false, action: 'lockedA' };
    }
    if (_state === 'awaitB') {
      // S331h — snap B to ortho/45 (unless it locked onto an existing vertex).
      if (!_vertexSnapped) pos = _applyOrtho(_pA, pos);
      // Don't allow zero-length AB (accidental double-tap)
      if (_pA && _pixelDist(_pA.x, _pA.y, pos.x, pos.y) < 4) {
        return { committed: false, action: 'noop' };
      }
      _pB = { x: pos.x, y: pos.y };
      _state = 'awaitOffset';
      _orthoActive = false;
      // Seed the cursor with a DEFAULT perpendicular offset (not _pB itself)
      // so the offset-stage preview is immediately visible as a real,
      // staggered dimension line — otherwise offset is 0 and the preview
      // collapses onto the measured segment and looks like nothing happened.
      var _f = _abFrame(_pA.x, _pA.y, _pB.x, _pB.y);
      var _seedOff = 28; // px, comfortable default stagger above the line
      _cursor = _f
        ? { x: (_pA.x + _pB.x) / 2 + _f.px * _seedOff, y: (_pA.y + _pB.y) / 2 + _f.py * _seedOff }
        : { x: pos.x, y: pos.y };
      return { committed: false, action: 'lockedB' };
    }
    if (_state === 'awaitOffset') {
      var ax = _pA.x, ay = _pA.y, bx = _pB.x, by = _pB.y;
      var offset = _projectOffset(ax, ay, bx, by, pos.x, pos.y);
      offset = _snapOffset(offset, _pA.x, _pA.y, _pB.x, _pB.y);   // S331 #37 + S479 — chain row, else any parallel existing dim's row
      var lab = computeLabel(ax, ay, bx, by, cal);
      var isGuess = !!(cal && cal._guessed);
      var obj = {
        type: 'dimension',
        mx1: ax, my1: ay, mx2: bx, my2: by,
        offset: offset,
        rawValue: lab ? lab.rawValue : 0,
        rawLabel: lab ? lab.rawLabel : '',
        trueM: lab ? lab.trueM : null,   // true length in metres (null = uncalibrated)
        overrideLabel: null,              // legacy display string (kept for back-compat)
        ovrM: undefined,                  // numeric override, true metres (converts on toggle)
        overrideNote: null,               // frozen text note (never converts)
        isGuess: isGuess
      };
      // Compute chain-next state
      _lastOffset = offset;  // S331 #37 — remember this row for the next dim's align-snap
      if (_mode === 'continuous') {
        _pA = { x: bx, y: by };
        _pB = null; _cursor = null; _state = 'awaitB';
      } else if (_mode === 'running') {
        _pA = _chainAnchor ? { x: _chainAnchor.x, y: _chainAnchor.y } : null;
        _pB = null; _cursor = null;
        _state = _pA ? 'awaitB' : 'idle';
      } else {
        resetState();  // single: clears _lastOffset (nothing to align to)
      }
      return { committed: true, action: 'committed', obj: obj };
    }
    return { committed: false, action: 'noop' };
  }

  function handleMove(pos) {
    if (!pos) return;
    // S331h — during the A→B stage, snap near-straight lines to H/V/45.
    if (_state === 'awaitB' && _pA) {
      _cursor = _applyOrtho(_pA, { x: pos.x, y: pos.y });
    } else {
      _orthoActive = false;
      _cursor = { x: pos.x, y: pos.y };
    }
  }

  /**
   * Render the current in-progress preview onto the overlay ctx. Caller
   * has already cleared the overlay and applied DPR transform.
   *
   * State-aware:
   *   awaitB     → draw line A→cursor (the AB axis being measured)
   *   awaitOffset → draw extension lines + dimension line + live label
   */
  function renderPreview(ctx, color, lineWidth, opacity) {
    if (_state === 'idle' || !_pA) return;

    // ── S552 — SHOW THE START POINT (Mark's team: "we have to guess"). ──
    // The A→cursor preview below is gated on _cursor, which only exists once a
    // pointer has MOVED. A mouse always has one, so on desktop the start point
    // appears the instant you click. Touch has no hover: after the first tap
    // the finger is gone and there is no pointer position at all, so nothing
    // was drawn — the start point was invisible until the second touch began.
    // Anchor marker, drawn whenever we are waiting for B and have no live
    // cursor. Direction-independent (there is no cursor to be perpendicular
    // to), and sized in screen px so a finger can actually see it.
    if (_state === 'awaitB' && !_cursor) {
      var mr = _px(COARSE ? 13 : 10);
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      // white backing so it reads on dark AND light drawings
      ctx.strokeStyle = '#fff'; ctx.lineWidth = _px(5);
      ctx.beginPath();
      ctx.moveTo(_pA.x - mr, _pA.y); ctx.lineTo(_pA.x + mr, _pA.y);
      ctx.moveTo(_pA.x, _pA.y - mr); ctx.lineTo(_pA.x, _pA.y + mr);
      ctx.stroke();
      ctx.strokeStyle = color || '#9C2742'; ctx.lineWidth = _px(2.5);
      ctx.beginPath();
      ctx.moveTo(_pA.x - mr, _pA.y); ctx.lineTo(_pA.x + mr, _pA.y);
      ctx.moveTo(_pA.x, _pA.y - mr); ctx.lineTo(_pA.x, _pA.y + mr);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(_pA.x, _pA.y, _px(4), 0, Math.PI * 2);
      ctx.fillStyle = color || '#9C2742'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = _px(1.5); ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.strokeStyle = color || '#9C2742';
    ctx.fillStyle = color || '#9C2742';
    ctx.lineWidth = lineWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = opacity != null ? opacity : 1;

    if (_state === 'awaitB' && _cursor) {
      // S331h — when ortho-snapped, extend a faint green guide beyond the
      // segment so it reads like AutoCAD's polar/ortho tracking line.
      if (_orthoActive) {
        var gdx = _cursor.x - _pA.x, gdy = _cursor.y - _pA.y;
        var glen = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
        var gux = gdx / glen, guy = gdy / glen;
        var ext = 9999;
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = 'rgba(46, 158, 114, 0.7)'; // muted green guide
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(_pA.x - gux * ext, _pA.y - guy * ext);
        ctx.lineTo(_pA.x + gux * ext, _pA.y + guy * ext);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(_pA.x, _pA.y);
      ctx.lineTo(_cursor.x, _cursor.y);
      ctx.stroke();
      ctx.restore();
      // S331x — endpoint as a perpendicular TICK line, not a filled dot.
      _drawTick(ctx, _pA.x, _pA.y, _cursor.x, _cursor.y);
    } else if (_state === 'awaitOffset' && _pB) {
      var offset = _cursor ? _projectOffset(_pA.x, _pA.y, _pB.x, _pB.y, _cursor.x, _cursor.y) : 0;
      offset = _snapOffset(offset, _pA.x, _pA.y, _pB.x, _pB.y);   // S331 #37 + S479 — preview snaps exactly like the commit
      var ends = _offsetEndpoints(_pA.x, _pA.y, _pB.x, _pB.y, offset);
      if (!ends) { ctx.restore(); return; }
      // Measure axis (dashed, thin) — visible reminder of what's being measured
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = Math.max(1, (lineWidth || 2) * 0.6);
      ctx.beginPath();
      ctx.moveTo(_pA.x, _pA.y);
      ctx.lineTo(_pB.x, _pB.y);
      ctx.stroke();
      ctx.restore();
      // S331 #37 — green alignment guide along the snapped offset row, so it's
      // clear the new dim is landing on the previous dim's line.
      if (_offsetSnapOn) {
        var gdx = ends.extB.x - ends.extA.x, gdy = ends.extB.y - ends.extA.y;
        var gl = Math.hypot(gdx, gdy) || 1, gux = gdx / gl, guy = gdy / gl, ge = 9999;
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = '#2E9E72';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(ends.extA.x - gux * ge, ends.extA.y - guy * ge);
        ctx.lineTo(ends.extB.x + gux * ge, ends.extB.y + guy * ge);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      // Render the would-be dimension as a real object preview, with a
      // live measured label so the value forms as you set the offset.
      var liveLab = _curCal ? computeLabel(_pA.x, _pA.y, _pB.x, _pB.y, _curCal) : null;
      var prev = {
        type: 'dimension',
        mx1: _pA.x, my1: _pA.y, mx2: _pB.x, my2: _pB.y,
        offset: offset,
        color: color, size: lineWidth, opacity: opacity,
        trueM: liveLab ? liveLab.trueM : null,
        rawLabel: liveLab ? liveLab.rawLabel : '\u2026',
        overrideLabel: null, ovrM: undefined, overrideNote: null
      };
      renderObject(ctx, prev);
      return;
    }
    ctx.restore();
  }

  // ── Vertex handle hit-tests ──────────────────────────────────────────

  function _distSqPtSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) { var ex = px - ax, ey = py - ay; return ex * ex + ey * ey; }
    var t = ((px - ax) * dx + (py - ay) * dy) / l2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var qx = ax + t * dx, qy = ay + t * dy;
    var fx = px - qx, fy = py - qy;
    return fx * fx + fy * fy;
  }

  /**
   * Single dimension hit-test (for entering vertex-edit mode). Returns
   * the obj if a dim is within tolerance px of `pos`, else null. Hits
   * against the rendered dimension line (offset endpoints) so the user
   * clicks the line they see, not the invisible measured line.
   */
  function hitTestDimension(pos, objects, tolerance) {
    if (!pos || !objects) return null;
    var tol = tolerance || 8;
    var tol2 = tol * tol;
    for (var i = objects.length - 1; i >= 0; i--) {
      var o = objects[i];
      if (!o || o.type !== 'dimension') continue;
      var ax, ay, bx, by;
      if (o.mx1 != null) {
        var ends = _offsetEndpoints(o.mx1, o.my1, o.mx2, o.my2, o.offset || 0);
        if (!ends) continue;
        ax = ends.extA.x; ay = ends.extA.y; bx = ends.extB.x; by = ends.extB.y;
      } else {
        ax = o.x1; ay = o.y1; bx = o.x2; by = o.y2;
      }
      if (_distSqPtSeg(pos.x, pos.y, ax, ay, bx, by) <= tol2) return o;
    }
    return null;
  }

  /**
   * Hit-test a specific dim's two vertex handles. Returns 0 for A, 1 for
   * B, or null. Tolerance ~12 px in drawing pixel coords.
   */
  function hitTestVertex(pos, obj, tolerance) {
    if (!pos || !obj || obj.type !== 'dimension') return null;
    // S552: the grab zone is deliberately LARGER than the painted dot, and
    // larger again on touch — you aim at what you see, you hit what you meant.
    var tol = tolerance || _px(COARSE ? 30 : 20);
    var tol2 = tol * tol;
    var ax, ay, bx, by;
    if (obj.mx1 != null) { ax = obj.mx1; ay = obj.my1; bx = obj.mx2; by = obj.my2; }
    else { ax = obj.x1; ay = obj.y1; bx = obj.x2; by = obj.y2; }
    var dxA = pos.x - ax, dyA = pos.y - ay;
    var dxB = pos.x - bx, dyB = pos.y - by;
    var dA = dxA * dxA + dyA * dyA;
    var dB = dxB * dxB + dyB * dyB;
    if (dA <= tol2 && dA <= dB) return 0;
    if (dB <= tol2) return 1;
    return null;
  }

  /**
   * Render the two vertex handles for a dim being edited. Drawn into the
   * main markup canvas after _renderAll has done its pass. Burgundy fill,
   * white border, 10 px radius.
   */
  function renderVertexHandles(ctx, obj) {
    if (!obj || obj.type !== 'dimension') return;
    var ax, ay, bx, by;
    if (obj.mx1 != null) { ax = obj.mx1; ay = obj.my1; bx = obj.mx2; by = obj.my2; }
    else { ax = obj.x1; ay = obj.y1; bx = obj.x2; by = obj.y2; }
    ctx.save();
    ctx.lineWidth = _px(2);
    ctx.fillStyle = '#9C2742';
    ctx.strokeStyle = '#fff';
    ctx.globalAlpha = 1;
    var pts = [[ax, ay], [bx, by]];
    for (var i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], _px(11), 0, Math.PI * 2);   // S552: screen-constant
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Rendering ────────────────────────────────────────────────────────

  /**
   * Render a dimension object on the canvas. Handles both new (offset +
   * extension lines) and legacy (no offset) object shapes. Renders the
   * Option-D faint background pill when overrideLabel is set, and the ~
   * tilde prefix when isGuess is true.
   */
  function renderObject(ctx, obj) {
    var ax, ay, bx, by, offset;
    if (obj.mx1 != null) {
      ax = obj.mx1; ay = obj.my1; bx = obj.mx2; by = obj.my2; offset = obj.offset || 0;
    } else {
      ax = obj.x1; ay = obj.y1; bx = obj.x2; by = obj.y2; offset = 0;
    }
    var f = _abFrame(ax, ay, bx, by);
    if (!f) return;
    var hasOffset = Math.abs(offset) > 0.5;
    var dax = ax + f.px * offset, day = ay + f.py * offset;
    var dbx = bx + f.px * offset, dby = by + f.py * offset;
    var ddx = dbx - dax, ddy = dby - day;
    var ang = Math.atan2(ddy, ddx);
    var col = obj.color || '#9C2742';

    // Clean look matched to the signed-off demo: thin fixed line weight (not
    // driven by the SIZE stepper), small fixed arrowheads, NO perpendicular
    // tick stubs, and a horizontal white label chip with a colored border
    // (not rotated, not white-outlined text). Override = underline beneath.
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;

    // 1. Extension lines from measured points out to (slightly past) the dim line
    if (hasOffset) {
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(dax + f.px * (offset >= 0 ? 3 : -3), day + f.py * (offset >= 0 ? 3 : -3));
      ctx.moveTo(bx, by); ctx.lineTo(dbx + f.px * (offset >= 0 ? 3 : -3), dby + f.py * (offset >= 0 ? 3 : -3));
      ctx.stroke();
    }

    // 2. Dimension line
    ctx.beginPath();
    ctx.moveTo(dax, day);
    ctx.lineTo(dbx, dby);
    ctx.stroke();

    // 3. Small fixed arrowheads (filled triangles), demo proportions (s=8)
    _dimArrow(ctx, dbx, dby, ang, col);
    _dimArrow(ctx, dax, day, ang + Math.PI, col);

    // 4. Label — horizontal white chip with colored border at the dim midpoint
    var resolved = resolveLabel(obj);
    var isOverride = resolved.isOverride;
    var label = isOverride
      ? resolved.txt
      : (obj.isGuess && resolved.txt && resolved.txt.charAt(0) !== '\u2014' ? '~' + resolved.txt : resolved.txt);
    if (label) {
      var mx = (dax + dbx) / 2, my = (day + dby) / 2;
      ctx.font = 'bold 14px Calibri, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var tw = ctx.measureText(label).width;
      var chipW = tw + 14, chipH = 22, r = 6;
      var cx = mx - chipW / 2, cy = my - chipH / 2;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      ctx.arcTo(cx + chipW, cy, cx + chipW, cy + chipH, r);
      ctx.arcTo(cx + chipW, cy + chipH, cx, cy + chipH, r);
      ctx.arcTo(cx, cy + chipH, cx, cy, r);
      ctx.arcTo(cx, cy, cx + chipW, cy, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillText(label, mx, my + 0.5);
      // override underline
      if (isOverride) {
        ctx.beginPath();
        ctx.moveTo(mx - tw / 2, my + 8);
        ctx.lineTo(mx + tw / 2, my + 8);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = col;
        ctx.stroke();
      }
      obj._labelBox = { x: cx, y: cy, w: chipW, h: chipH };
    }

    ctx.restore();
  }

  // Small filled-triangle arrowhead, demo proportions (constant size).
  function _dimArrow(ctx, x, y, ang, col) {
    var s = 8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(ang - 0.4) * s, y - Math.sin(ang - 0.4) * s);
    ctx.lineTo(x - Math.cos(ang + 0.4) * s, y - Math.sin(ang + 0.4) * s);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }

  // ── Public API ───────────────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window._dimTool = {
      isCalibrated: isCalibrated,
      getCalibration: getCalibration,
      formatLabel: formatLabel,
      formatMeters: formatMeters,
      computeLabel: computeLabel,
      resolveLabel: resolveLabel,
      dimTrueMeters: dimTrueMeters,
      parseLength: parseLength,
      showCalibrationPrompt: showCalibrationPrompt,
      renderObject: renderObject,
      renderPreview: renderPreview,
      setOrthoSnap: setOrthoSnap,
      isOrthoSnap: isOrthoSnap,
      isOrthoActive: isOrthoActive,
      applyOrtho: function(a, p) { return _applyOrtho(a, p); },
      renderVertexHandles: renderVertexHandles,
      setUiScale: setUiScale,          // S552: host feeds its screen scale in
      parseDimNumber: _parseDimNumber,
      // Display unit (display-only; persisted by host)
      getDisplayUnit: getDisplayUnit,
      setDisplayUnit: setDisplayUnit,
      // Chain controller
      setMode: setMode,
      getMode: getMode,
      getState: getState,
      handleClick: handleClick,
      handleMove: handleMove,
      cancel: cancel,
      endChain: endChain,
      resetState: resetState,
      // Pickup picker
      startContinueFromPrevious: startContinueFromPrevious,
      startPickPoint: startPickPoint,
      startFresh: startFresh,
      isPickAwaiting: isPickAwaiting,
      seedFromPoint: seedFromPoint,
      allVertices: allVertices,
      nearestVertex: nearestVertex,
      chainFinishAnchor: chainFinishAnchor,
      // Hit testing
      hitTestDimension: hitTestDimension,
      hitTestVertex: hitTestVertex,
      // Calibration helpers
      guessScale: guessScale,
      applyGuessedCalibration: applyGuessedCalibration,
      recalibrateAll: recalibrateAll
    };
  }
})();
