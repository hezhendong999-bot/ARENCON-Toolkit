/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — VISION PREP             lib/data/visionPrep.js v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 3 — fifth cut.

   WHAT THIS OWNS. The two ends of every AI photo-scan: making an image the
   vision service will actually accept, and finding the JSON answer inside
   whatever prose the model wraps it in. Diesel uses both for placard scanning
   today; Electric's nameplate scan needs exactly the same two things, and
   these rules were expensive enough to learn once.

   ── RULE 1: NORMALISE THE IMAGE, AND NEVER SEND GARBAGE ──────────────────
   The vision service accepts ONLY image/jpeg|png|gif|webp. A photo whose type
   reads 'image/jpg' (not a real MIME type) or 'application/octet-stream' —
   which is exactly what a blob fetched back from R2 can resolve to — is
   rejected with a bare HTTP 400. That asymmetry cost a real afternoon: a
   reloaded 3-pt placard (bytes from R2, wrong type) failed at one image while
   a freshly-captured 7-pt (clean camera JPEG) sailed through, and nothing on
   screen said why. So the type is normalised and the image re-encoded when
   needed, capped at 1568px on the long side.

   And S509c: an image the browser cannot decode used to fall through with its
   ORIGINAL bytes, which were then posted anyway — 400 upstream, 502 from the
   proxy, and a cryptic error the inspector could do nothing with. Garbage in
   is never worth sending. An undecodable image comes back marked unreadable
   so the caller can say so in words.

   ── RULE 2: SALVAGE THE JSON, LAST CANDIDATE FIRST ───────────────────────
   Models wrap answers in prose and often show a draft before the final. So:
   every fenced code block is collected and tried LAST-first, falling back to
   the widest {...} span; a candidate only counts if it parses AND carries at
   least one of the keys the caller says a real answer must have. The caller
   owns that key list — what makes a placard result real is Diesel's business,
   a nameplate result Electric's.

   HOST CONTRACT: classic <script>, publishes window.VisionPrep. The DOM pieces
   (Image, document) are injectable for testing and default to the globals.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

function _validType(t) { return /^image\/(jpeg|png|gif|webp)$/i.test(t || ''); }

/* Rule 1. Resolves the image ready to send, the original when it is already
   fine, or { __unreadable:true } when the browser cannot decode it. Never
   rejects — a scan pipeline wants an answer, not an exception. */
function downscaleForVision(img, deps) {
  deps = deps || {};
  var ImageCtor = deps.Image || (typeof Image !== 'undefined' ? Image : null);
  var doc = deps.document || (typeof document !== 'undefined' ? document : null);
  var MAX = deps.maxPx || 1568;
  return new Promise(function (resolve) {
    try {
      if (!img || !img.data) { resolve(img); return; }
      if (!ImageCtor || !doc) { resolve(img); return; }
      var im = new ImageCtor();
      im.onload = function () {
        try {
          var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
          if (!w || !h) { resolve({ __unreadable: true }); return; }   // decoded to nothing = a decode failure
          var scale = Math.min(1, MAX / Math.max(w, h));
          /* Skip re-encoding ONLY if already small AND already a valid type —
             both conditions, because a small image with a bad type is still a
             400 waiting to happen. */
          if (scale >= 1 && _validType(img.media_type)) { resolve(img); return; }
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var cv = doc.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var cx = cv.getContext('2d');
          cx.drawImage(im, 0, 0, cw, ch);
          var du = cv.toDataURL('image/jpeg', 0.85);
          var mm = /^data:([^;]+);base64,(.*)$/.exec(du);
          if (mm) resolve({ data: mm[2], media_type: mm[1] });
          else resolve(img);
        } catch (_e) { resolve(img); }
      };
      im.onerror = function () { resolve({ __unreadable: true }); };
      im.src = 'data:' + (_validType(img.media_type) ? img.media_type : 'image/jpeg') + ';base64,' + img.data;
    } catch (_e) { resolve(img); }
  });
}

/* Rule 2. requiredKeys is the caller's definition of "looks like a real
   answer" — a parse that carries none of them is prose that happened to be
   valid JSON, and is skipped in favour of an earlier candidate. */
function salvageJson(payload, opts) {
  var requiredKeys = (opts && opts.requiredKeys) || [];
  if (!payload) return null;
  var raw = (typeof payload === 'string') ? payload : (payload.raw || payload.detail || payload.message || '');
  if (!raw || typeof raw !== 'string') return null;
  var candidates = [];
  var fence = /```(?:json)?\s*([\s\S]*?)```/gi, m;
  while ((m = fence.exec(raw))) candidates.push(m[1]);
  if (!candidates.length) {
    var a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) candidates.push(raw.slice(a, b + 1));
  }
  for (var i = candidates.length - 1; i >= 0; i--) {
    var txt = candidates[i].trim();
    try {
      var obj = JSON.parse(txt);
      if (obj && typeof obj === 'object') {
        if (!requiredKeys.length) return obj;
        for (var k = 0; k < requiredKeys.length; k++) {
          if (requiredKeys[k] in obj) return obj;
        }
      }
    } catch (_e) { /* try the next candidate */ }
  }
  return null;
}

var api = {
  downscaleForVision: downscaleForVision,
  salvageJson: salvageJson,
  VERSION: '1.0.0'
};

if (root) root.VisionPrep = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
