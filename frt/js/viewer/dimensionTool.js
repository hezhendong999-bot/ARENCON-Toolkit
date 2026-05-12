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

  // ── Formatting ───────────────────────────────────────────────────────

  function _formatFeetArch(value) {
    var sign = value < 0 ? '-' : '';
    var v = Math.abs(value);
    var feet = Math.floor(v);
    var remInch = (v - feet) * 12;
    var sixteenths = Math.round(remInch * 16);
    if (sixteenths === 192) { feet += 1; sixteenths = 0; }
    var wholeInch = Math.floor(sixteenths / 16);
    var fracSix = sixteenths - wholeInch * 16;
    var label = sign + feet + "'-";
    if (fracSix === 0) {
      label += wholeInch + '"';
    } else {
      function gcd(a, b) { return b ? gcd(b, a % b) : a; }
      var g = gcd(fracSix, 16);
      var num = fracSix / g, den = 16 / g;
      if (wholeInch === 0) label += num + '/' + den + '"';
      else label += wholeInch + ' ' + num + '/' + den + '"';
    }
    return label;
  }

  function _formatMeters(value) { return value.toFixed(2) + ' m'; }

  function formatLabel(value, units) {
    if (units === 'm') return _formatMeters(value);
    return _formatFeetArch(value);
  }

  // ── Smart number parser (S125, reusable) ─────────────────────────────

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
    var rawValue = px * calibration.scaleRatio;
    var rawLabel = formatLabel(rawValue, calibration.units || 'ft');
    return { rawValue: rawValue, rawLabel: rawLabel };
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
  function recalibrateAll(objects, newCalibration) {
    if (!objects || !objects.length) return 0;
    if (!newCalibration || !newCalibration.scaleRatio) return 0;
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
      }
      if (obj.isGuess) obj.isGuess = false;
      n++;
    }
    return n;
  }

  // ── Calibration prompt UI (unchanged structurally from S125) ─────────

  function showCalibrationPrompt(drawing, x1, y1, x2, y2, onComplete) {
    var overlay = document.createElement('div');
    overlay.id = 'dim-cal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;display:flex;align-items:center;justify-content:center;';

    var modal = document.createElement('div');
    modal.className = 'dim-cal-modal';
    modal.innerHTML =
      '<h3 style="margin:0 0 10px;font-family:Calibri,sans-serif;color:#9C2742;">Calibrate this drawing</h3>' +
      '<p style="margin:0 0 14px;font-family:Calibri,sans-serif;font-size:14px;line-height:1.4;color:#333;">' +
      'You\u2019ve marked two points. Enter the real-world distance between them so this drawing knows its scale.</p>' +
      '<div style="display:flex;gap:6px;margin-bottom:14px;background:#EDE5D3;border-radius:6px;padding:3px;width:fit-content;">' +
      '<button class="dim-cal-unit" data-u="ft" style="font-family:Calibri,sans-serif;font-size:13px;font-weight:600;background:#fff;color:#444;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;">Feet + Inches</button>' +
      '<button class="dim-cal-unit" data-u="m" style="font-family:Calibri,sans-serif;font-size:13px;font-weight:600;background:transparent;color:#6a5a3a;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;">Meters</button>' +
      '</div>' +
      '<div class="dim-cal-imperial" style="display:flex;gap:8px;margin-bottom:8px;">' +
      '<div style="flex:1;"><label style="display:block;font-family:Calibri,sans-serif;font-size:12px;color:#555;margin-bottom:3px;">Feet</label>' +
      '<input type="text" inputmode="decimal" class="dim-cal-ft" placeholder="12" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #B0A89C;border-radius:4px;font-family:Calibri,sans-serif;font-size:15px;"></div>' +
      '<div style="flex:1.4;"><label style="display:block;font-family:Calibri,sans-serif;font-size:12px;color:#555;margin-bottom:3px;">Inches (1.5 or 1-1/2 or 1 1/2)</label>' +
      '<input type="text" class="dim-cal-in" placeholder="3 1/2" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #B0A89C;border-radius:4px;font-family:Calibri,sans-serif;font-size:15px;"></div>' +
      '</div>' +
      '<div class="dim-cal-metric" style="display:none;margin-bottom:8px;">' +
      '<label style="display:block;font-family:Calibri,sans-serif;font-size:12px;color:#555;margin-bottom:3px;">Meters</label>' +
      '<input type="text" inputmode="decimal" class="dim-cal-m" placeholder="3.74" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #B0A89C;border-radius:4px;font-family:Calibri,sans-serif;font-size:15px;"></div>' +
      '<div class="dim-cal-hint" style="font-family:Calibri,sans-serif;font-size:12px;color:#888;min-height:16px;margin-bottom:14px;"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button class="dim-cal-cancel" style="font-family:Calibri,sans-serif;font-size:14px;padding:8px 14px;background:#eee;color:#444;border:none;border-radius:4px;cursor:pointer;">Cancel</button>' +
      '<button class="dim-cal-ok" style="font-family:Calibri,sans-serif;font-size:14px;font-weight:600;padding:8px 18px;background:#9C2742;color:#fff;border:none;border-radius:4px;cursor:pointer;">Save Calibration</button>' +
      '</div>';
    modal.style.cssText = 'background:#fff;border-radius:8px;padding:20px 24px;min-width:380px;max-width:90vw;box-shadow:0 12px 40px rgba(0,0,0,.3);';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var ftInput = modal.querySelector('.dim-cal-ft');
    var inInput = modal.querySelector('.dim-cal-in');
    var mInput = modal.querySelector('.dim-cal-m');
    var hint = modal.querySelector('.dim-cal-hint');
    var imperialDiv = modal.querySelector('.dim-cal-imperial');
    var metricDiv = modal.querySelector('.dim-cal-metric');
    var unitFtBtn = modal.querySelector('.dim-cal-unit[data-u="ft"]');
    var unitMBtn = modal.querySelector('.dim-cal-unit[data-u="m"]');
    var okBtn = modal.querySelector('.dim-cal-ok');
    var cancelBtn = modal.querySelector('.dim-cal-cancel');
    var currentUnit = 'ft';
    setTimeout(function () { ftInput.focus(); }, 60);

    function _setUnit(u) {
      currentUnit = u;
      if (u === 'ft') {
        imperialDiv.style.display = 'flex'; metricDiv.style.display = 'none';
        unitFtBtn.style.background = '#fff'; unitFtBtn.style.color = '#444';
        unitMBtn.style.background = 'transparent'; unitMBtn.style.color = '#6a5a3a';
        setTimeout(function () { ftInput.focus(); }, 30);
      } else {
        imperialDiv.style.display = 'none'; metricDiv.style.display = 'block';
        unitMBtn.style.background = '#fff'; unitMBtn.style.color = '#444';
        unitFtBtn.style.background = 'transparent'; unitFtBtn.style.color = '#6a5a3a';
        setTimeout(function () { mInput.focus(); }, 30);
      }
      _updateHint();
    }
    unitFtBtn.addEventListener('click', function () { _setUnit('ft'); });
    unitMBtn.addEventListener('click', function () { _setUnit('m'); });

    function _updateHint() {
      if (currentUnit === 'ft') {
        var ft = _parseDimNumber(ftInput.value);
        var inch = _parseDimNumber(inInput.value);
        if (ft === 0 && inch === 0) { hint.textContent = ''; return; }
        var totalFt = ft + inch / 12;
        hint.textContent = '\u2192 ' + formatLabel(totalFt, 'ft') + '  (' + totalFt.toFixed(4) + ' ft)';
      } else {
        var m = _parseDimNumber(mInput.value);
        if (m === 0) { hint.textContent = ''; return; }
        hint.textContent = '\u2192 ' + formatLabel(m, 'm');
      }
    }
    ftInput.addEventListener('input', _updateHint);
    inInput.addEventListener('input', _updateHint);
    mInput.addEventListener('input', _updateHint);

    function _close(result) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (onComplete) onComplete(result);
    }
    cancelBtn.addEventListener('click', function () { _close(null); });
    okBtn.addEventListener('click', function () {
      var realDist;
      if (currentUnit === 'ft') {
        var ft = _parseDimNumber(ftInput.value);
        var inch = _parseDimNumber(inInput.value);
        realDist = ft + inch / 12;
      } else {
        realDist = _parseDimNumber(mInput.value);
      }
      if (!(realDist > 0)) {
        var target = currentUnit === 'ft' ? ftInput : mInput;
        target.style.borderColor = '#A85959';
        target.focus();
        return;
      }
      var px = _pixelDist(x1, y1, x2, y2);
      if (!(px > 0)) { _close(null); return; }
      var calibration = {
        p1: { x: x1, y: y1 },
        p2: { x: x2, y: y2 },
        realDistance: realDist,
        units: currentUnit,
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
    function _handleKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
    }
    ftInput.addEventListener('keydown', _handleKey);
    inInput.addEventListener('keydown', _handleKey);
    mInput.addEventListener('keydown', _handleKey);
  }

  // ── Chain state machine (S126 #6) ────────────────────────────────────

  var _mode = 'single';       // 'single' | 'continuous' | 'running'
  var _state = 'idle';        // 'idle' | 'awaitB' | 'awaitOffset'
  var _pA = null;             // {x,y}: measured point A of current dim
  var _pB = null;             // {x,y}: measured point B of current dim
  var _chainAnchor = null;    // running mode: fixed origin; continuous: rolling
  var _cursor = null;         // last cursor pos for live preview

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
    _state = 'idle'; _pA = null; _pB = null; _chainAnchor = null; _cursor = null;
  }
  function cancel() { resetState(); }
  function endChain() { resetState(); }

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
  function handleClick(pos, drawing) {
    if (!pos) return { committed: false, action: 'noop' };
    var cal = getCalibration(drawing);
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
      // Don't allow zero-length AB (accidental double-tap)
      if (_pA && _pixelDist(_pA.x, _pA.y, pos.x, pos.y) < 4) {
        return { committed: false, action: 'noop' };
      }
      _pB = { x: pos.x, y: pos.y };
      _state = 'awaitOffset';
      _cursor = { x: pos.x, y: pos.y };
      return { committed: false, action: 'lockedB' };
    }
    if (_state === 'awaitOffset') {
      var ax = _pA.x, ay = _pA.y, bx = _pB.x, by = _pB.y;
      var offset = _projectOffset(ax, ay, bx, by, pos.x, pos.y);
      var lab = computeLabel(ax, ay, bx, by, cal);
      var isGuess = !!(cal && cal._guessed);
      var obj = {
        type: 'dimension',
        mx1: ax, my1: ay, mx2: bx, my2: by,
        offset: offset,
        rawValue: lab ? lab.rawValue : 0,
        rawLabel: lab ? lab.rawLabel : '',
        overrideLabel: null,
        isGuess: isGuess
      };
      // Compute chain-next state
      if (_mode === 'continuous') {
        _pA = { x: bx, y: by };
        _pB = null; _cursor = null; _state = 'awaitB';
      } else if (_mode === 'running') {
        _pA = _chainAnchor ? { x: _chainAnchor.x, y: _chainAnchor.y } : null;
        _pB = null; _cursor = null;
        _state = _pA ? 'awaitB' : 'idle';
      } else {
        resetState();
      }
      return { committed: true, action: 'committed', obj: obj };
    }
    return { committed: false, action: 'noop' };
  }

  function handleMove(pos) {
    if (!pos) return;
    _cursor = { x: pos.x, y: pos.y };
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
    ctx.save();
    ctx.strokeStyle = color || '#9C2742';
    ctx.fillStyle = color || '#9C2742';
    ctx.lineWidth = lineWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = opacity != null ? opacity : 1;

    if (_state === 'awaitB' && _cursor) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(_pA.x, _pA.y);
      ctx.lineTo(_cursor.x, _cursor.y);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(_pA.x, _pA.y, Math.max(2.5, (lineWidth || 2)), 0, Math.PI * 2);
      ctx.fill();
    } else if (_state === 'awaitOffset' && _pB) {
      var offset = _cursor ? _projectOffset(_pA.x, _pA.y, _pB.x, _pB.y, _cursor.x, _cursor.y) : 0;
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
      ctx.restore();
      // Render the would-be dimension as a real object preview
      var prev = {
        type: 'dimension',
        mx1: _pA.x, my1: _pA.y, mx2: _pB.x, my2: _pB.y,
        offset: offset,
        color: color, size: lineWidth, opacity: opacity,
        rawLabel: '\u2026',
        overrideLabel: null
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
    var tol = tolerance || 12;
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
    ctx.lineWidth = 2;
    ctx.fillStyle = '#9C2742';
    ctx.strokeStyle = '#fff';
    ctx.globalAlpha = 1;
    var pts = [[ax, ay], [bx, by]];
    for (var i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 10, 0, Math.PI * 2);
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

    ctx.save();
    ctx.strokeStyle = obj.color || '#9C2742';
    ctx.fillStyle = obj.color || '#9C2742';
    ctx.lineWidth = obj.size || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = obj.opacity != null ? obj.opacity : 1;

    // 1. Extension lines from measured points to dimension line endpoints
    //    (only when offset is meaningful)
    if (hasOffset) {
      var stubGap = Math.min(4, Math.abs(offset) * 0.15);
      var sgn = offset >= 0 ? 1 : -1;
      var stubAx = ax + f.px * sgn * stubGap;
      var stubAy = ay + f.py * sgn * stubGap;
      var stubBx = bx + f.px * sgn * stubGap;
      var stubBy = by + f.py * sgn * stubGap;
      ctx.beginPath();
      ctx.moveTo(stubAx, stubAy); ctx.lineTo(dax, day);
      ctx.moveTo(stubBx, stubBy); ctx.lineTo(dbx, dby);
      ctx.stroke();
    }

    // 2. Dimension line itself
    ctx.beginPath();
    ctx.moveTo(dax, day);
    ctx.lineTo(dbx, dby);
    ctx.stroke();

    // 3. Arrowheads at both ends of dimension line
    var ahLen = 10 + (ctx.lineWidth || 2) * 1.5;
    var ahAngle = Math.PI / 8;
    var a2 = Math.atan2(ddy, ddx);
    ctx.beginPath();
    ctx.moveTo(dbx, dby);
    ctx.lineTo(dbx - ahLen * Math.cos(a2 - ahAngle), dby - ahLen * Math.sin(a2 - ahAngle));
    ctx.lineTo(dbx - ahLen * Math.cos(a2 + ahAngle), dby - ahLen * Math.sin(a2 + ahAngle));
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(dax, day);
    ctx.lineTo(dax + ahLen * Math.cos(a2 - ahAngle), day + ahLen * Math.sin(a2 - ahAngle));
    ctx.lineTo(dax + ahLen * Math.cos(a2 + ahAngle), day + ahLen * Math.sin(a2 + ahAngle));
    ctx.closePath();
    ctx.fill();

    // 4. Perpendicular tick stubs at each dim endpoint
    var tickHalf = 6;
    ctx.beginPath();
    ctx.moveTo(dax + f.px * tickHalf, day + f.py * tickHalf);
    ctx.lineTo(dax - f.px * tickHalf, day - f.py * tickHalf);
    ctx.moveTo(dbx + f.px * tickHalf, dby + f.py * tickHalf);
    ctx.lineTo(dbx - f.px * tickHalf, dby - f.py * tickHalf);
    ctx.stroke();

    // 5. Label — perpendicular-offset above the dimension line midpoint
    var override = obj.overrideLabel;
    var raw = obj.rawLabel || '';
    var label = override != null ? override : (obj.isGuess && raw ? '~' + raw : raw);
    if (label) {
      var mx = (dax + dbx) / 2, my = (day + dby) / 2;
      var labelOffset = 14;
      var lx = mx + f.px * labelOffset;
      var ly = my + f.py * labelOffset;
      var rot = a2;
      if (rot > Math.PI / 2) rot -= Math.PI;
      else if (rot < -Math.PI / 2) rot += Math.PI;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      var fontPx = Math.max(11, (obj.size || 2) * 5);
      ctx.font = '600 ' + fontPx + 'px Calibri, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // Option-D override pill: faint colored background behind the label
      // text when overrideLabel is set. Sits in the same local coord space
      // as the label (already translated + rotated). Padding 4 px h, 1 px v.
      if (override != null) {
        var tw = ctx.measureText(label).width;
        var padH = 4, padV = 1;
        var pillX = -tw / 2 - padH;
        var pillY = -fontPx - padV;
        var pillW = tw + padH * 2;
        var pillH = fontPx + padV * 2;
        ctx.save();
        ctx.globalAlpha = 0.10 * (obj.opacity != null ? obj.opacity : 1);
        ctx.fillStyle = obj.color || '#9C2742';
        var r = 3;
        ctx.beginPath();
        ctx.moveTo(pillX + r, pillY);
        ctx.lineTo(pillX + pillW - r, pillY);
        ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + r);
        ctx.lineTo(pillX + pillW, pillY + pillH - r);
        ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH);
        ctx.lineTo(pillX + r, pillY + pillH);
        ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - r);
        ctx.lineTo(pillX, pillY + r);
        ctx.quadraticCurveTo(pillX, pillY, pillX + r, pillY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeText(label, 0, 0);
      ctx.fillStyle = obj.color || '#9C2742';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  // ── Public API ───────────────────────────────────────────────────────

  if (typeof window !== 'undefined') {
    window._dimTool = {
      isCalibrated: isCalibrated,
      getCalibration: getCalibration,
      formatLabel: formatLabel,
      computeLabel: computeLabel,
      showCalibrationPrompt: showCalibrationPrompt,
      renderObject: renderObject,
      renderPreview: renderPreview,
      renderVertexHandles: renderVertexHandles,
      parseDimNumber: _parseDimNumber,
      // Chain controller
      setMode: setMode,
      getMode: getMode,
      getState: getState,
      handleClick: handleClick,
      handleMove: handleMove,
      cancel: cancel,
      endChain: endChain,
      resetState: resetState,
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
