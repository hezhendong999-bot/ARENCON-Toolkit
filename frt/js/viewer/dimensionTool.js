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
    modal.innerHTML =
      '<h3 style="margin:0 0 10px;font-family:Calibri,sans-serif;color:#9C2742;">Calibrate this drawing</h3>' +
      '<p style="margin:0 0 14px;font-family:Calibri,sans-serif;font-size:14px;line-height:1.4;color:#333;">' +
      'You\u2019ve marked two points. Enter the real-world distance between them so this drawing knows its scale.' +
      ' All future dimensions on this drawing will use it.</p>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;">' +
        '<input type="number" id="dim-cal-value" min="0" step="0.01" placeholder="Distance" ' +
          'style="flex:1;padding:8px 10px;border:1px solid #B0A89C;border-radius:4px;font-family:Calibri,sans-serif;font-size:15px;">' +
        '<select id="dim-cal-units" style="padding:8px 10px;border:1px solid #B0A89C;border-radius:4px;font-family:Calibri,sans-serif;font-size:15px;">' +
          '<option value="ft">feet</option>' +
          '<option value="m">meters</option>' +
        '</select>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="dim-cal-cancel" class="btn-muted-cancel" style="padding:8px 14px;">Cancel</button>' +
        '<button id="dim-cal-ok" class="btn-burgundy" style="padding:8px 14px;">Save calibration</button>' +
      '</div>';
    modal.style.cssText = 'background:#FAF6EE;border-radius:8px;padding:22px 26px;min-width:360px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.4);';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var valueInput = modal.querySelector('#dim-cal-value');
    var unitsSelect = modal.querySelector('#dim-cal-units');
    var okBtn = modal.querySelector('#dim-cal-ok');
    var cancelBtn = modal.querySelector('#dim-cal-cancel');

    setTimeout(function () { valueInput.focus(); }, 80);

    function _close(result) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (onComplete) onComplete(result);
    }

    cancelBtn.addEventListener('click', function () { _close(null); });

    okBtn.addEventListener('click', function () {
      var realDist = parseFloat(valueInput.value);
      if (!(realDist > 0)) {
        valueInput.style.borderColor = '#A85959';
        valueInput.focus();
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
        units: unitsSelect.value,
        scaleRatio: realDist / px,
        createdAt: new Date().toISOString()
      };
      // Mutate drawing in place
      if (drawing) drawing.calibration = calibration;
      _close({
        calibration: calibration,
        firstDim: {
          // Caller fills in id/color/size/opacity from current tool state
          x1: x1, y1: y1, x2: x2, y2: y2,
          rawValue: realDist,
          rawLabel: formatLabel(realDist, calibration.units)
        }
      });
    });

    valueInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
    });
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
      // White halo for legibility on dark backgrounds
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
      renderObject: renderObject
    };
  }
})();
