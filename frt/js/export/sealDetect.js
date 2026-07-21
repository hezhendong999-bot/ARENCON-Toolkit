/**
 * ARENCON FRT v2 — Seal detection (S497)
 * ═══════════════════════════════════════════════════════════════════
 *
 * SUGGESTIONS ONLY. This module finds candidate seal/stamp regions on a
 * drawing thumbnail and returns them as boxes. It NEVER writes a cover.
 * Per LOCKED_SEAL_REDACTION_VISIBILITY.md §5 (the sanctioned revisit
 * shape, assigned by Mark in S495 §3):
 *
 *   - every suggestion starts UNCONFIRMED (amber in the UI)
 *   - nothing counts as covered until a human taps it
 *   - a sheet where detection finds nothing STAYS amber-flagged —
 *     a miss must not be able to hide behind this feature
 *
 * The caller (exportview.js seal band) owns the confirm tap, which is
 * the ONLY path from suggestion → real cover (dw.redactions).
 *
 * WHAT IT LOOKS FOR — both target shapes, per Mark:
 *   - round P.Eng seals: a compact, ink-dense circular blob
 *   - rectangular L.E.T. stamps (Mark's own): a compact, ink-dense
 *     signed block — visually similar to a title/revision box, which
 *     is exactly why false positives are expected and confirm-first
 *     is non-negotiable
 * It does not distinguish the two; both present as compact regions of
 * high ink density against the sheet's line-work baseline.
 *
 * INPUT is the existing synced 400px thumbnail (d.thumb) — the same
 * source the contact sheet already renders. NO drawing decode, NO tile
 * fetch, so it is cheap, offline-safe, and tablet-safe. At 400px a
 * seal on a 24×36 sheet is small; suggestion boxes are padded and the
 * user can fine-tune in the viewer's 🔒 editor after confirming.
 *
 * OUTPUT: Promise<[{x,y,w,h}]> as FRACTIONS of the sheet — the same
 * coordinate space dw.redactions uses — sorted best-first, max 3.
 * Resolves [] on any failure (never rejects; detection failing must
 * never break the export screen).
 */

export function detectSeals(thumbSrc) {
  return new Promise(function (resolve) {
    if (!thumbSrc) { resolve([]); return; }
    var img = new Image();
    img.onload = function () {
      try { resolve(_scan(img)); } catch (e) { resolve([]); }
    };
    img.onerror = function () { resolve([]); };
    img.src = thumbSrc;
  });
}

function _scan(img) {
  var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return [];
  // Work at ≤480px long edge (thumbs are ~400 already; belt for odd inputs).
  var sc = Math.min(1, 480 / Math.max(iw, ih));
  var w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc));
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0, w, h);
  var px = cx.getImageData(0, 0, w, h).data;
  cv.width = 0; cv.height = 0;

  // ── luminance + adaptive ink threshold ──
  // Drawings are dark line-work on a light sheet. The threshold hangs off
  // the sheet's own brightness so scanned/greyish sheets still resolve.
  var lum = new Uint8Array(w * h);
  var hist = new Uint32Array(256);
  for (var i = 0, j = 0; i < px.length; i += 4, j++) {
    var l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
    lum[j] = l; hist[l]++;
  }
  var half = (w * h) / 2, acc = 0, median = 235;
  for (var m = 255; m >= 0; m--) { acc += hist[m]; if (acc >= half) { median = m; break; } }
  var thr = Math.min(190, median - 40);
  if (thr < 40) return []; // sheet is dark overall — density means nothing here

  // ── 8px cell ink density ──
  var CELL = 8;
  var gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL);
  var dens = new Float32Array(gw * gh);
  for (var y = 0; y < h; y++) {
    var gy = (y / CELL) | 0;
    for (var x = 0; x < w; x++) {
      if (lum[y * w + x] < thr) dens[gy * gw + ((x / CELL) | 0)]++;
    }
  }
  var nz = 0, sum = 0;
  for (var d = 0; d < dens.length; d++) {
    dens[d] /= (CELL * CELL);
    if (dens[d] > 0.02) { nz++; sum += dens[d]; }
  }
  if (!nz) return [];
  var meanD = sum / nz;
  // A seal cell is ink-dense well beyond the sheet's line-work baseline.
  var hot = Math.max(0.22, meanD * 2.2);

  // ── flood-fill hot-cell clusters (4-connected) ──
  var seen = new Uint8Array(gw * gh), clusters = [];
  for (var c = 0; c < dens.length; c++) {
    if (seen[c] || dens[c] < hot) continue;
    var stack = [c], cells = [];
    seen[c] = 1;
    while (stack.length) {
      var k = stack.pop(); cells.push(k);
      var kx = k % gw, ky = (k / gw) | 0;
      var nb = [k - 1, k + 1, k - gw, k + gw];
      for (var n = 0; n < 4; n++) {
        var q = nb[n];
        if (q < 0 || q >= dens.length || seen[q]) continue;
        if (n === 0 && kx === 0) continue;
        if (n === 1 && kx === gw - 1) continue;
        if (dens[q] >= hot) { seen[q] = 1; stack.push(q); }
      }
    }
    clusters.push(cells);
  }

  // ── cluster → candidate box, filtered ──
  var imgMin = Math.min(w, h), imgMax = Math.max(w, h);
  var out = [];
  clusters.forEach(function (cells) {
    var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, dsum = 0;
    cells.forEach(function (k) {
      var kx = k % gw, ky = (k / gw) | 0;
      if (kx < x0) x0 = kx; if (kx > x1) x1 = kx;
      if (ky < y0) y0 = ky; if (ky > y1) y1 = ky;
      dsum += dens[k];
    });
    var bw = (x1 - x0 + 1) * CELL, bh = (y1 - y0 + 1) * CELL;
    // size: big enough to be a stamp, small enough not to be the title
    // block frame, a legend panel, or the sheet border
    if (bw < Math.max(12, imgMin * 0.025) || bh < Math.max(12, imgMin * 0.025)) return;
    if (bw > imgMax * 0.30 || bh > imgMax * 0.30) return;
    if ((bw * bh) > (w * h) * 0.08) return;
    // aspect: round seals ≈1; rectangular signed blocks up to ~3:1
    var a = bw / bh;
    if (a < 0.33 || a > 3.0) return;
    // compactness: a seal fills its box; a stray line run does not
    var fill = cells.length / (((x1 - x0 + 1) * (y1 - y0 + 1)) || 1);
    if (fill < 0.45) return;
    out.push({
      px: x0 * CELL, py: y0 * CELL, pw: bw, ph: bh,
      score: fill * (dsum / cells.length)
    });
  });

  out.sort(function (p, q) { return q.score - p.score; });
  out = out.slice(0, 3);

  // pad 12% each side (detection on a 400px thumb is approximate — the
  // cover must err toward covering) and convert to sheet fractions
  return out.map(function (b) {
    var padx = b.pw * 0.12, pady = b.ph * 0.12;
    var rx = Math.max(0, b.px - padx), ry = Math.max(0, b.py - pady);
    var rw = Math.min(w - rx, b.pw + padx * 2), rh = Math.min(h - ry, b.ph + pady * 2);
    return {
      x: +(rx / w).toFixed(4), y: +(ry / h).toFixed(4),
      w: +(rw / w).toFixed(4), h: +(rh / h).toFixed(4)
    };
  });
}
