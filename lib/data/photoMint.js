/**
 * ARENCON — Shared Photo Mint (pump-tool photo creation path)  v1.0.0
 * ═══════════════════════════════════════════════════════════════════════
 * THE single authoritative place a Diesel/Electric photo object is born.
 * Extracted S461 from 30 duplicated inline blocks in the live Diesel tool —
 * every one of them built the same object and enqueued it to R2:
 *
 *   { d:<dataURL>, n:<filename>,
 *     id:'ph_'+Date.now()+'_'+Math.random().toString(36).substr(2,6),
 *     date:<ISO string>, r2Key:'', r2Status:'', r2Url:'' }
 *   → _r2EnqueuePhoto(ph)
 *
 * WHY THIS EXISTS (fix once, inherit everywhere): the open placard-scan
 * photo-loss investigation (SCOPE_PLACARD_SCAN_PHOTO_LOSS.md) suspects the
 * enqueue path. Any hardening that lands there must land at EVERY mint site —
 * previously 30 places, now one. NOTE: this module intentionally ships the
 * VERBATIM current behavior; the loss-bug fix itself stays investigate-first,
 * Mark-present, and is NOT smuggled in here.
 *
 * SCHEMA RULES (Diesel/Electric photo model — NOT FRT's pool/pin model):
 *   • id is the photo's permanent identity: R2 keys derive from it
 *     (_r2Fname: '{instanceId}__{id}.jpg' at r2v===2, else '{id}.jpg') —
 *     NEVER key by filename (S281 B1). n is display metadata only.
 *   • r2Key/r2Status/r2Url start EMPTY; the outbox/enqueue pipeline owns them.
 *   • date defaults to now; checklist/records pass the EXIF capture date
 *     (S367 photoDate) when available.
 *   • Surface-specific fields (gauge tag/mode, record kind, caption) ride as
 *     opts.extra — same serialization, same save/load round-trip.
 *   • Enqueue is called BARE (not typeof-guarded): if _r2EnqueuePhoto were
 *     ever missing this must fail LOUDLY, because a silent skip is exactly
 *     the photo-loss class (S369). One historical site had a typeof guard;
 *     it was dead defensive code (the function is a hoisted declaration).
 *
 * HOST CONTRACT (late-bound global): _r2EnqueuePhoto(ph)
 *
 * USAGE:
 *   ArcPhoto.mint(dataUrl, fileName)                        // date = now
 *   ArcPhoto.mint(c, f.name, {date: photoDate})             // EXIF date
 *   ArcPhoto.mint(c, f.name, {extra:{tag:'suction', mode:null, caption:''}})
 *
 * Classic script global window.ArcPhoto (+ CJS export for the Node harness).
 */
(function (root) {
'use strict';

function mint(d, n, opts) {
  opts = opts || {};
  var ph = {
    d: d,
    n: n,
    id: 'ph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    date: opts.date || new Date().toISOString(),
    r2Key: '', r2Status: '', r2Url: ''
  };
  if (opts.extra) { for (var k in opts.extra) { if (Object.prototype.hasOwnProperty.call(opts.extra, k)) ph[k] = opts.extra[k]; } }
  _r2EnqueuePhoto(ph);
  return ph;
}

var API = { mint: mint, VERSION: '1.0.0' };
if (root) root.ArcPhoto = API;
try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
