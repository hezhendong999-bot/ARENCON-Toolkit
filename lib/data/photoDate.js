/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — PHOTO DATING              lib/data/photoDate.js v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 3 — second cut: pure logic, no DOM.

   WHAT THIS OWNS. When a photograph was taken, and how that answer is shown.
   The camera's own EXIF capture date, the fallback chain when there is no
   EXIF, the day a photo is filed under in the gallery, and the time printed on
   its tile.

   WHY IT MATTERS MORE THAN IT LOOKS. A photo's date is not decoration — it is
   what puts the photograph on the right day of an inspection in a report that
   goes to an owner and an AHJ. Get it wrong by one day and the record says a
   condition was observed on a site visit that did not happen.

   THREE RULES THAT ARE EASY TO LOSE AND WERE ALL EARNED:

   1. THE FALLBACK CHAIN, IN ORDER: an explicit added date, then the file's
      own date, then the timestamp inside the photo's id. The id fallback is
      what saves photos that arrive from another device with their dates
      stripped by sync — the capture moment travels inside the name. Before
      this extraction the chain was written out twice, in two functions, in the
      same file; two copies of a three-step fallback is exactly the thing that
      drifts to two answers.

   2. EXIF DATES ARE READ AT NOON, NOT MIDNIGHT. The camera gives a calendar
      date with no time zone. Reading it as midnight puts a photo taken on the
      21st onto the 20th for anyone west of UTC — which is everyone at
      ARENCON. Noon is far enough from both edges that no real time zone can
      push the date across a day boundary. Do not "simplify" this to midnight.

   3. THE PARSER READS ONLY THE FIRST 128 KB and gives up quietly on anything
      it does not recognise. A field tablet holding forty photographs cannot
      afford to walk whole files, and a photo whose EXIF cannot be read must
      still be usable — every failure path here returns "no date", never an
      error, because the caller's answer to "no date" is the capture time,
      which is always correct enough.

   BEHAVIOUR IS IDENTICAL, BUG FOR BUG — this is a MOVE out of
   diesel-app/js/part07.js, pinned by tools/sim/photodate.mjs against the
   pre-extraction source.

   HOST CONTRACT: classic <script>, publishes window.PhotoDate. No bare export.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* THE ONE FALLBACK CHAIN. Everything that needs to know when a photo happened
   asks here, so there is one answer and one place to change it. */
function timestampOf(p) {
  if (!p) return null;
  var d = p.addedDate || p.date;
  if (!d && p.id) {
    var m = ('' + p.id).match(/_(\d{10,})_/);
    if (m) d = parseInt(m[1], 10);
  }
  return d || null;
}

/* The day a photo is filed under in the gallery: a stable key, a human label,
   and a sortable timestamp. Anything undateable lands in one honest bucket
   rather than being guessed into today. */
function dayKey(p, now) {
  var d = timestampOf(p);
  if (!d) return { key: 'no-date', label: 'No date', ts: 0 };
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return { key: 'no-date', label: 'No date', ts: 0 };
  var dd = new Date(dt);
  dd.setHours(0, 0, 0, 0);
  var label = dd.toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  return { key: dd.getTime() + '', label: label, ts: dd.getTime() };
}

/* The time on the tile. Empty string, never a placeholder time — a photo with
   no known time must look like it has none. */
function photoTime(p) {
  var d = timestampOf(p);
  if (!d) return '';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  var hh = ('' + dt.getHours()).padStart(2, '0');
  var mm = ('' + dt.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}

/* ── EXIF ─────────────────────────────────────────────────────────────────
   Reads DateTimeOriginal (0x9003), falling back to DateTimeDigitized (0x9004),
   and returns 'YYYY-MM-DD' or null. Only the first 128 KB is read; every
   unrecognised structure resolves null rather than throwing, because a photo
   that cannot be dated must still be usable. */
function exifCaptureDate(file, deps) {
  deps = deps || {};
  var FR = deps.FileReader || (typeof FileReader !== 'undefined' ? FileReader : null);
  return new Promise(function (resolve) {
    try {
      if (!file || !/^image\/jpe?g$/i.test(file.type || '')) { resolve(null); return; }
      if (!FR) { resolve(null); return; }
      var reader = new FR();
      reader.onerror = function () { resolve(null); };
      reader.onload = function (e) {
        try { resolve(parseExifDate(e.target.result)); }
        catch (err) { resolve(null); }
      };
      reader.readAsArrayBuffer(file.slice(0, 131072));
    } catch (err) { resolve(null); }
  });
}

/* The byte walk, split out so it can be tested without a FileReader at all. */
function parseExifDate(buffer) {
  var view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null;
  var offset = 2, len = view.byteLength;
  while (offset < len) {
    if (view.getUint16(offset) !== 0xFFE1) {
      if ((view.getUint16(offset) & 0xFF00) !== 0xFF00) return null;
      offset += 2 + view.getUint16(offset + 2);
      continue;
    }
    var app1 = offset + 4;
    if (view.getUint32(app1) !== 0x45786966) return null;   // 'Exif'
    var tiff = app1 + 6;
    var little = (view.getUint16(tiff) === 0x4949);
    function u16(o) { return view.getUint16(o, little); }
    function u32(o) { return view.getUint32(o, little); }
    if (u16(tiff + 2) !== 0x002A) return null;
    var ifd0 = tiff + u32(tiff + 4);
    var n0 = u16(ifd0), exifIfd = 0;
    for (var i = 0; i < n0; i++) {
      var e0 = ifd0 + 2 + i * 12;
      if (u16(e0) === 0x8769) { exifIfd = tiff + u32(e0 + 8); break; }
    }
    function readDateTag(ifd, tag) {
      if (!ifd) return null;
      var n = u16(ifd);
      for (var j = 0; j < n; j++) {
        var ent = ifd + 2 + j * 12;
        if (u16(ent) === tag) {
          var cnt = u32(ent + 4);
          var valOff = (cnt > 4) ? tiff + u32(ent + 8) : (ent + 8);
          var s = '';
          for (var k = 0; k < Math.min(cnt, 19); k++) {
            var c = view.getUint8(valOff + k);
            if (!c) break;
            s += String.fromCharCode(c);
          }
          return s;
        }
      }
      return null;
    }
    var raw = readDateTag(exifIfd, 0x9003) || readDateTag(exifIfd, 0x9004);
    if (raw) {
      var m = raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
      if (m) return m[1] + '-' + m[2] + '-' + m[3];
    }
    return null;
  }
  return null;
}

/* The date a newly-added photo is stamped with: the camera's own date if it
   has one, otherwise now. READ AT NOON — see rule 2 in the header. */
function dateForNewPhoto(file, deps) {
  return exifCaptureDate(file, deps).then(function (cap) {
    if (cap) return new Date(cap + 'T12:00:00').toISOString();
    return new Date().toISOString();
  });
}

/* Group an inventory listing into gallery day sections, newest day first.
   Extracted with the rest of the dating rules (S684b): the grouping is only a
   fold over dayKey, and a second copy of that fold in Electric would be a
   second place for the day boundary to drift. */
function groupByDay(entries) {
  var groups = {};
  (entries || []).forEach(function (a) {
    var g = dayKey(a.photo);
    if (!groups[g.key]) groups[g.key] = { key: g.key, label: g.label, ts: g.ts, items: [] };
    groups[g.key].items.push(a);
  });
  return Object.keys(groups).map(function (k) { return groups[k]; })
    .sort(function (x, y) { return y.ts - x.ts; });
}

var api = {
  timestampOf: timestampOf,
  groupByDay: groupByDay,
  dayKey: dayKey,
  photoTime: photoTime,
  exifCaptureDate: exifCaptureDate,
  parseExifDate: parseExifDate,
  dateForNewPhoto: dateForNewPhoto,
  VERSION: '1.0.0'
};

if (root) root.PhotoDate = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
