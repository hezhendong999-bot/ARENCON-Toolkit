// frt/js/viewer/dimensionTool.js
// S124 A1 — Dimension Tool (with 2-point calibration).
//
// USER FLOW
// ─────────
// 1. User taps 📐 toolbar button → tool activates.
// 2. If the current drawing has no `calibration` field yet:
//      - Show modal "Calibrate this drawing first" with instructions.
//      - User clicks 2 points on the drawing.
//      - Modal prompts for real-world distance + units (ft or m).
//      - Calibration saved on drawing.calibration = {p1, p2, realDistance,
//        units, scaleRatio}. The two points + label render as the first
//        dimension object.
// 3. If calibration exists: every subsequent 2-point click becomes a
//    dimension object — line + arrows at both ends + perpendicular ticks +
//    computed label centered above.
// 4. Label format:
//      - Feet : architectural fraction `12'-3 1/2"` (precision = 1/16")
//      - Meters: decimal `3.74 m` (precision = 1 cm)
//
// MARKUP OBJECT SHAPE
// ───────────────────
// {
//   id, type: 'dimension',
//   x1, y1, x2, y2,                  // pixel coords (same as line/arrow)
//   color, size, opacity,
//   rawValue: 12.292,                // real-world distance in DRAWING units (ft or m)
//   rawLabel: "12'-3 1/2\"",         // formatted label string
//   overrideLabel: null              // user override (reserved for S125 edit UI)
// }
//
// CALIBRATION OBJECT (lives on drawing.calibration)
// ─────────────────────────────────────────────────
// {
//   p1: {x: pxX, y: pxY},            // pixel coords of first calibration point
//   p2: {x: pxX, y: pxY},            // pixel coords of second
//   realDistance: 10,                // real-world value entered by user
//   units: 'ft' | 'm',
//   scaleRatio: 0.0247,              // realDistance / pixelDistance(p1,p2)
//   createdAt: ISO timestamp
// }
//
// Exposes window._dimTool.{
//   isCalibrated(drawing), getCalibration(drawing), setCalibration(drawing, ...),
//   formatLabel(realValue, units), computeLabel(x1,y1,x2,y2, calibration),
//   showCalibrationPrompt(drawing, onComplete), renderObject(ctx, obj)
// }

(function () {
  'use strict';

  // ── Formatting ───────────────────────────────────────────────────────

  /**
   * Format a real-world distance into an architectural fraction string.
   * `value` is in feet (decimal). Precision: 1/16 of an inch.
   * Examples:
   *   12.0      → "12'-0\""
   *   12.292    → "12'-3 1/2\""
   *   0.4167    → "0'-5\""
   *   0.0260417 → "0'-5/16\""
   */
  function _formatFeetArch(value) {
    var sign = value < 0 ? '-' : '';
    var v = Math.abs(value);
    var feet = Math.floor(v);
    var remInch = (v - feet) * 12; // remaining inches
    // Round to nearest 16th
    var sixteenths = Math.round(remInch * 16);
    if (sixteenths === 192) { feet += 1; sixteenths = 0; } // overflow rollup
    var wholeInch = Math.floor(sixteenths / 16);
    var fracSix = sixteenths - wholeInch * 16;
    var label = sign + feet + "'-";
    if (fracSix === 0) {
      label += wholeInch + '"';
    } else {
      // Reduce the fraction
      function gcd(a, b) { return b ? gcd(b, a % b) : a; }
      var g = gcd(fracSix, 16);
      var num = fracSix / g, den = 16 / g;
      if (wholeInch === 0) {
        label += num + '/' + den + '"';
      } else {
        label += wholeInch + ' ' + num + '/' + den + '"';
      }
    }
    return label;
  }

  /**
   * Format a real-world distance into a metric string (decimal meters).
   * Precision: 1 cm. Example: 3.7421 → "3.74 m"
   */
  function _formatMeters(value) {
    return value.toFixed(2) + ' m';
  }

  function formatLabel(value, units) {
    if (units === 'm') return _formatMeters(value);
    return _formatFeetArch(value); // default feet
  }

  // ── Math helpers ─────────────────────────────────────────────────────

  /**
   * S125 #4 — Parse a feet OR inches text input into a decimal number.
   * Accepts:
   *   "1.5"         → 1.5         (decimal)
   *   "1 1/2"       → 1.5         (mixed with space)
   *   "1-1/2"       → 1.5         (mixed with dash)
   *   "1/2"         → 0.5         (pure fraction)
   *   "1"           → 1           (integer)
   *   "" or invalid → 0
   * Strips trailing inch/foot marks (" ' in cm m mm) so casual entry works.
   */
  function _parseDimNumber(raw) {
    if (raw == null) return 0;
    var s = String(raw).trim();
    if (!s) return 0;
    // Strip unit markers — user might paste "12'-3 1/2\"" into the wrong field
    s = s.replace(/["'\u2032\u2033]|in|ft|cm|mm|\bm\b/gi, '').trim();
    if (!s) return 0;
    // Pure decimal
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    // Mixed number with space OR dash: "1 1/2" or "1-1/2"
    var mixed = s.match(/^(-?\d+)[\s\-]+(\d+)\/(\d+)$/);
    if (mixed) {
      var sign = mixed[1].charAt(0) === '-' ? -1 : 1;
      var whole = Math.abs(parseInt(mixed[1], 10));
      var num = parseInt(mixed[2], 10);
      var den = parseInt(mixed[3], 10);
      if (den > 0) return sign * (whole + num / den);
    }
    // Pure fraction "1/2"
    var frac = s.match(/^(-?\d+)\/(\d+)$/);
    if (frac) {
      var fNum = parseInt(frac[1], 10);
      var fDen = parseInt(frac[2], 10);
      if (fDen > 0) return fNum / fDen;
    }
    // Last-ditch decimal parse (handles things like "1.5 ")
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function _pixelDist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function isCalibrated(drawing) {
    return !!(drawing && drawing.calibration && drawing.calibration.scaleRatio > 0);
  }

  function getCalibration(drawing) {
    return drawing && drawing.calibration || null;
  }

  /**
   * Compute real-world distance + formatted label for a dimension's two
   * pixel endpoints, given the drawing's calibration.
   * Returns { rawValue, rawLabel } or null if not calibrated.
   */
  function computeLabel(x1, y1, x2, y2, calibration) {
    if (!calibration || !calibration.scaleRatio) return null;
    var px = _pixelDist(x1, y1, x2, y2);
    var rawValue = px * calibration.scaleRatio;
    var rawLabel = formatLabel(rawValue, calibration.units || 'ft');
    return { rawValue: rawValue, rawLabel: rawLabel };
  }

  // ── Calibration prompt UI ────────────────────────────────────────────

  var _pendingCalibration = null; // {p1, drawing, onComplete} between clicks 1 and 2

  /**
   * Open a modal explaining calibration. The Markup engine handles point
   * collection; this UI only shows instruction + final value prompt.
   *
   * Caller (markup.js _endDraw) hands us:
   *   - drawing: current drawing object (we'll mutate drawing.calibration)
   *   - x1,y1,x2,y2: the two pixel points the user clicked
   *   - onComplete(calibration, dimensionObj): called once user submits the
   *     real-world distance. dimensionObj is the first dimension drawn
   *     (using these same two points).
   *
   * The flow is: markup.js detects "tool=dimension + drawing not calibrated"
   * on the FIRST 2-point draw, and calls _showCalibrationPrompt instead of
   * committing a normal dimension object. We then prompt for distance,
   * compute scaleRatio, store calibration, and synthesize the first
   * dimension object back through the callback.
   */
  function showCalibrationPrompt(drawing, x1, y1, x2, y2, onComplete) {
    // Build modal
    var overlay = document.createElement('div');
    overlay.id = 'dim-cal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;display:flex;align-items:center;justify-content:center;';

    var modal = document.createElement('div');
    modal.className = 'dim-cal-modal';
    // S125 #4 — Two-field input: feet (integer-ish) + inches (smart parser
    // accepts decimal, fraction, mixed-with-space, mixed-with-dash).
    // Metric users switch to a single decimal-meters field via the toggle.
    modal.innerHTML =
      '<h3 style="margin:0 0 10px;font-family:Calibri,sans-serif;color:#9C2742;">Calibrate this drawing</h3>' +
      '<p style="margin:0 0 14px;font-family:Calibri,sans-serif;font-size:14px;line-height:1.4;color:#333;">' +
      'You\u2019ve marked two points. Enter the real-world distance between them so this drawing knows its scale.</p>' +
      // Units toggle
      '<div style="display:flex;gap:6px;margin-bottom:14px;background:#EDE5D3;border-radius:6px;padding:3px;width:fit-content;">' +
        '<button type="button" id="dim-cal-unit-ft" data-unit="ft" style="padding:6px 14px;border:none;background:#fff;color:#444;border-radius:4px;font-family:Calibri,sans-serif;font-size:13px;font-weight:600;cursor:pointer;">Feet + inches</button>' +
        '<button type="button" id="dim-cal-unit-m" data-unit="m" style="padding:6px 14px;border:none;background:transparent;color:#6a5a3a;border-radius:4px;font-family:Calibri,sans-serif;font-size:13px;font-weight:600;cursor:pointer;">Meters</button>' +
      '</div>' +
      // Imperial pair
      '<div id="dim-cal-imperial" style="display:flex;gap:10px;align-items:flex-end;margin-bottom:6px;">' +
        '<div style="flex:1;">' +
          '<label style="display:block;margin-bottom:4px;font-family:Calibri,sans-serif;font-size:12px;color:#666;">Feet</label>' +
          '<input type="text" id="dim-cal-ft" placeholder="0" inputmode="decimal" ' +
            'style="width:100%;padding:8px 10px;border:1px solid #B0A89C;border-radius:4px;font-family:Calibri,sans-serif;font-size:15px;box-sizing:border-box;">' +
        '</div>' +
        '<div style="flex:1.4;">' +
          '<label style="display:block;margin-bottom:4px;font-family:Calibri,sans-serif;font-size:12px;color:#666;">Inches <span style="color:#999;font-size:11px;">(1.5 or 1-1/2 or 1 1/2)</span></label>' +
          '<input type="text" id="dim-cal-in" placeholder="0" inputmode="text" ' +
            'style="width:100%;padding:8px 10px;border:1px solid #B0A89C;border-radius:4px;font-family:Calibri,sans-serif;font-size:15px;box-sizing:border-box;">' +
        '</div>' +
      '</div>' +
      // Metric single
      '<div id="dim-cal-metric" style="display:none;margin-bottom:6px;">' +
        '<label style="display:block;margin-bottom:4px;font-family:Calibri,sans-serif;font-size:12px;color:#666;">Meters</label>' +
        '<input type="text" id="dim-cal-m" placeholder="0" inputmode="decimal" ' +
          'style="width:100%;padding:8px 10px;border:1px solid #B0A89C;border-radius:4px;font-family:Calibri,sans-serif;font-size:15px;box-sizing:border-box;">' +
      '</div>' +
      // Hint
      '<p id="dim-cal-hint" style="margin:0 0 14px;font-family:Calibri,sans-serif;font-size:12px;color:#888;min-height:16px;"></p>' +
      // Buttons
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="dim-cal-cancel" class="btn-muted-cancel" style="padding:8px 14px;">Cancel</button>' +
        '<button id="dim-cal-ok" class="btn-burgundy" style="padding:8px 14px;">Save calibration</button>' +
      '</div>';
    modal.style.cssText = 'background:#FAF6EE;border-radius:8px;padding:22px 26px;min-width:380px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.4);';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var ftInput = modal.querySelector('#dim-cal-ft');
    var inInput = modal.querySelector('#dim-cal-in');
    var mInput  = modal.querySelector('#dim-cal-m');
    var unitFtBtn = modal.querySelector('#dim-cal-unit-ft');
    var unitMBtn  = modal.querySelector('#dim-cal-unit-m');
    var imperialDiv = modal.querySelector('#dim-cal-imperial');
    var metricDiv   = modal.querySelector('#dim-cal-metric');
    var hint = modal.querySelector('#dim-cal-hint');
    var okBtn = modal.querySelector('#dim-cal-ok');
    var cancelBtn = modal.querySelector('#dim-cal-cancel');
    var currentUnit = 'ft';

    setTimeout(function () { ftInput.focus(); }, 80);

    function _setUnit(u) {
      currentUnit = u;
      if (u === 'ft') {
        imperialDiv.style.display = 'flex';
        metricDiv.style.display = 'none';
        unitFtBtn.style.background = '#fff';
        unitFtBtn.style.color = '#444';
        unitMBtn.style.background = 'transparent';
        unitMBtn.style.color = '#6a5a3a';
        setTimeout(function () { ftInput.focus(); }, 30);
      } else {
        imperialDiv.style.display = 'none';
        metricDiv.style.display = 'block';
        unitMBtn.style.background = '#fff';
        unitMBtn.style.color = '#444';
        unitFtBtn.style.background = 'transparent';
        unitFtBtn.style.color = '#6a5a3a';
        setTimeout(function () { mInput.focus(); }, 30);
      }
      _updateHint();
    }
    unitFtBtn.addEventListener('click', function () { _setUnit('ft'); });
    unitMBtn.addEventListener('click', function () { _setUnit('m'); });

    /** Live preview of what we parsed so the user can verify before saving */
    function _updateHint() {
      if (currentUnit === 'ft') {
        var ft = _parseDimNumber(ftInput.value);
        var inch = _parseDimNumber(inInput.value);
        if (ft === 0 && inch === 0) { hint.textContent = ''; return; }
        var totalFt = ft + inch / 12;
        hint.textContent = '→ ' + formatLabel(totalFt, 'ft') + '  (' + totalFt.toFixed(4) + ' ft)';
      } else {
        var m = _parseDimNumber(mInput.value);
        if (m === 0) { hint.textContent = ''; return; }
        hint.textContent = '→ ' + formatLabel(m, 'm');
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
      if (!(px > 0)) {
        console.warn('[dim] Calibration aborted — pixel distance is zero');
        _close(null);
        return;
      }
      var calibration = {
        p1: { x: x1, y: y1 },
        p2: { x: x2, y: y2 },
        realDistance: realDist,
        units: currentUnit,
        scaleRatio: realDist / px,
        createdAt: new Date().toISOString()
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

  // ── Rendering ────────────────────────────────────────────────────────

  /**
   * Draw a dimension object on the canvas. Called from markup.js
   * _drawObjectRaw when obj.type === 'dimension'.
   *
   * Shape: solid line + arrowheads at both ends + perpendicular tick marks
   * at each endpoint + label centered above the line.
   *
   * `obj` has x1, y1, x2, y2, color, size, opacity, rawLabel, overrideLabel.
   */
  function renderObject(ctx, obj) {
    var x1 = obj.x1, y1 = obj.y1, x2 = obj.x2, y2 = obj.y2;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    var nx = dx / len, ny = dy / len;
    // Perpendicular unit vector
    var px = -ny, py = nx;
    var tickHalf = 6; // px on each side of endpoint for the tick mark

    ctx.save();
    ctx.strokeStyle = obj.color || '#9C2742';
    ctx.fillStyle = obj.color || '#9C2742';
    ctx.lineWidth = obj.size || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = obj.opacity || 1;

    // 1. Main line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 2. Arrowheads at both ends (inward-pointing tips)
    var ahLen = 10 + (ctx.lineWidth || 2) * 1.5;
    var ahAngle = Math.PI / 8; // narrow architectural arrow
    // End 2
    var a2 = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ahLen * Math.cos(a2 - ahAngle), y2 - ahLen * Math.sin(a2 - ahAngle));
    ctx.lineTo(x2 - ahLen * Math.cos(a2 + ahAngle), y2 - ahLen * Math.sin(a2 + ahAngle));
    ctx.closePath();
    ctx.fill();
    // End 1 (reverse direction)
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ahLen * Math.cos(a2 - ahAngle), y1 + ahLen * Math.sin(a2 - ahAngle));
    ctx.lineTo(x1 + ahLen * Math.cos(a2 + ahAngle), y1 + ahLen * Math.sin(a2 + ahAngle));
    ctx.closePath();
    ctx.fill();

    // 3. Perpendicular ticks at each endpoint (architectural extension stub)
    ctx.beginPath();
    ctx.moveTo(x1 + px * tickHalf, y1 + py * tickHalf);
    ctx.lineTo(x1 - px * tickHalf, y1 - py * tickHalf);
    ctx.moveTo(x2 + px * tickHalf, y2 + py * tickHalf);
    ctx.lineTo(x2 - px * tickHalf, y2 - py * tickHalf);
    ctx.stroke();

    // 4. Label — perpendicular-offset above the line midpoint, rotated to align
    var label = obj.overrideLabel || obj.rawLabel || '';
    if (label) {
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      var labelOffset = 14;
      var lx = mx + px * labelOffset;
      var ly = my + py * labelOffset;
      // Orient so text reads left-to-right even when line slopes
      var rot = Math.atan2(dy, dx);
      if (rot > Math.PI / 2) rot -= Math.PI;
      else if (rot < -Math.PI / 2) rot += Math.PI;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      var fontPx = Math.max(11, (obj.size || 2) * 5);
      ctx.font = '600 ' + fontPx + 'px Calibri, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      // White halo for legibility on dark backgrounds. Original 3px at 0.85
      // alpha. (Previous "thin halo" hotfix was solving the wrong problem —
      // the actual blur was the markup canvas being downsampled to ~965 px
      // at zoom-out, fixed in markup.js _resizeMarkupForScale floor.)
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
      // S125 #4 — smart number parser (decimal / mixed-space / mixed-dash /
      // pure fraction). Reusable in S126 for the inline label-edit UI.
      parseDimNumber: _parseDimNumber
    };
  }
})();
