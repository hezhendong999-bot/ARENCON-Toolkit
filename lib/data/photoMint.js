/**
 * ARENCON — Shared Photo Mint (pump-tool photo creation path)  v1.1.0
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
  /* S488 PHOTO-LOSS FIX (Mark's field repro: take photo → pull-to-refresh →
     photo GONE, online or offline). Every one of the ~30 call sites did
     photos.push(mint(...)) then a re-render and NOTHING ELSE — the photo
     lived only in a JS variable until some unrelated action happened to
     trigger a save. Refresh in that window destroyed it. This was the open
     placard-scan loss class (SCOPE_PLACARD_SCAN_PHOTO_LOSS.md).
     A photo is now durable AT BIRTH: persist immediately, here, so no call
     site can ever forget. saveState() is called BARE per this module's own
     doctrine (see the _r2EnqueuePhoto note above): if a host lacks it this
     must fail LOUDLY, because a silent skip is exactly the loss class.
     ORDERING (verified against Diesel's actual saveState, which is fully
     synchronous — JSON.stringify(collectState()) runs immediately): mint()
     executes INSIDE the caller's push expression, i.e. BEFORE the photo is
     in the array. An immediate save here would serialize the state WITHOUT
     the new photo. The save is therefore deferred one macrotask so the
     caller's push completes first; pull-to-refresh is human-scale slower
     than the next tick. An absent saveState throws uncaught in the timeout —
     loud, per doctrine, without breaking the mint itself. */
  setTimeout(function(){ saveState(); }, 0);
  return ph;
}

var API = { mint: mint, VERSION: '1.1.0' };
if (root) root.ArcPhoto = API;
try { if (typeof module !== 'undefined' && module.exports) module.exports = API; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
