/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — SHARED PHOTO INPUT ENGINE   lib/ui/photoInput.js   v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   THE canonical photo-input surface. Every place in every ARENCON tool that
   accepts a photo renders THIS — so that a photo zone in Diesel looks and
   behaves exactly like a photo zone in the FRT thread, and neither has to be
   reinvented when the next tool needs one.

   THE STANDARD (project canon — three ways in, always):
     • DRAG & DROP is the default surface — the zone itself accepts a drop.
     • 📷 CAMERA   — burst capture (falls back to the file picker when denied)
     • ⬆️ UPLOAD   — file picker.  DUSTY BLUE (#4F6788).
     • 🖼️ GALLERY  — pick from photos already in the project.
   Never a click-only zone. Never a subset of the three buttons.

   ── THIS IS THE APP'S EXISTING BUTTON FAMILY, NOT A NEW ONE ────────────────
   The buttons render as `.obs-drop-btn` with `is-camera` / `is-upload` /
   `is-gallery` — the SAME classes, colours and emoji the pin editor already
   used (📷 Camera #5C7A65, 🖼️ Gallery #8A7689). The engine adds exactly one
   thing that did not exist: `is-upload`, in dusty blue.

   It does NOT define a parallel set of look-alike classes. A shared engine that
   reimplements the thing it is supposed to unify has not unified anything — it
   has just created a second system that will drift from the first. If a photo
   button's look needs to change, it changes HERE and in `.obs-drop-btn`, once.

   ── ARCHITECTURE: engine shared, personality per-tool config ───────────────
   This engine owns the SURFACE: markup, the three buttons, drag-drop plumbing,
   the coarse-pointer fallbacks, the disabled states. It owns NONE of the
   storage. The host supplies onFiles(files) and onGallery() and does whatever
   its own data path requires.

   That separation is deliberate and load-bearing. The FRT deficiency photo path
   carries the S393 photo-loss protections; Diesel's carries its own. An engine
   that "helpfully" saved photos for its hosts would have to know all of them,
   and the first time one changed, a photo would go missing in a way nobody
   could trace. So: the engine hands you File objects. What happens next is
   yours.

   ── USE ───────────────────────────────────────────────────────────────────
     import { PhotoInput } from '../../lib/ui/photoInput.js';

     el.innerHTML = PhotoInput.html({ ns:'crbt', ctx:{ deficId:'d1' } });

     PhotoInput.mount({
       ns: 'crbt',
       onFiles:   function(files, ctx){ ... },   // Camera / Upload / Drop
       onGallery: function(ctx){ ... }           // Gallery (omit → button hidden)
     });

   `ns` namespaces the data-action strings so several engines can live on one
   page without fighting (the thread composer and the pin editor are both open
   at once, routinely).  ctx is echoed back to the callbacks untouched.
   ══════════════════════════════════════════════════════════════════════════ */

var _mounted = {};          // ns -> handlers   (idempotent mount)
var _delegated = false;     // document listeners attached exactly once

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Build the zone.

   S478c: this emits the app's EXISTING photo-zone markup, verbatim —
     .obs-media-col  (drop target)
       > .obs-media-zone
           > [.obs-media-photos]   host-supplied thumbs (optional)
           > .obs-media-hint       "Drop photos to add"
           > .obs-media-btns       📷 Camera · ⬆️ Upload · 🖼️ Gallery

   It introduces NO new classes. Not one. The previous cut invented `.pi-zone`
   / `.pi-hint` / `.pi-btns` — a second zone that merely resembled the first, and
   every value drifted: hint 12px vs 11px, gap 5px vs 6px, no font-weight, wrong
   button padding. Mark saw it instantly, because it was not the same thing.

   The whole point of a shared engine is that there IS only one thing. If it
   renders anything the pin editor does not, it is not shared — it is a copy.
   The only hook kept is `data-pi-ns`, which carries no styling. */
/* THE BUTTON ROW — the single copy of it. Both the full zone and buttonsOnly
   render THIS. If the row is written twice, the two drift; that is the whole
   lesson of this file. `da` is the data-pi-* ctx string, attached to each BUTTON
   in buttonsOnly mode (there is no wrapper to hang it on) and left empty when
   the wrapper carries it. */
function _btnRow(ns, showGallery, da) {
  da = da || '';
  var h = '<div class="obs-media-btns">';
  h += '<button type="button" class="obs-drop-btn is-camera" data-action="' + _esc(ns) + '-pi-camera"' + da
     + ' title="Take photos with the burst camera">\uD83D\uDCF7 Camera</button>';
  h += '<button type="button" class="obs-drop-btn is-upload" data-action="' + _esc(ns) + '-pi-upload"' + da
     + ' title="Upload photos from this device">\uD83D\uDCCE Upload</button>';
  if (showGallery) {
    h += '<button type="button" class="obs-drop-btn is-gallery" data-action="' + _esc(ns) + '-pi-gallery"' + da
       + ' title="Pick from project site photos">\uD83D\uDDBC\uFE0F Gallery</button>';
  }
  h += '</div>';
  return h;
}

function html(o) {
  o = o || {};
  var ns = o.ns || 'pi';
  var ctx = o.ctx || {};
  var showGallery = (o.gallery !== false);
  var hint = o.hint || 'Drop photos to add';
  var inner = o.inner || '';   // host thumbs, rendered above the hint

  // ctx rides on the wrapper as data-pi-* so a delegated handler can recover it
  // without a closure — survives every re-render the host does.
  var da = '';
  Object.keys(ctx).forEach(function(k) {
    da += ' data-pi-' + k + '="' + _esc(ctx[k]) + '"';
  });

  // ── buttonsOnly ───────────────────────────────────────────────────────────
  // For a host that already has its OWN box — an evidence tile, a compact photo
  // zone, a markup placeholder — each with its own border, hint, thumbnails and
  // its own field-proven drag/drop handler. Those boxes are that tool's design
  // and are not the engine's to replace. What WAS duplicated in every one of
  // them is the row of photo buttons, so that is what the engine takes over.
  //
  // Emits the row and nothing else: no wrapper, no hint, no closing tags. The
  // ctx rides on each BUTTON instead of a wrapper, because there is no wrapper.
  // Drag/drop is deliberately NOT claimed here — the delegated handlers key off
  // .obs-media-col, which these hosts do not have, so the host's existing drop
  // path keeps running exactly as it did and nothing double-fires.
  if (o.buttonsOnly) return _btnRow(ns, showGallery, da);

  // ── zoneOnly ──────────────────────────────────────────────────────────────
  // The pin editor opens .obs-media-col/.obs-media-zone itself and streams its
  // thumbnails (sync badges, AI, delete, move-to-pin, ghosts, undo chips) into
  // it before the zone's tail. Rather than force that content through `inner`
  // as a giant string — or worse, teach the engine to render thumbnails, which
  // are that surface's business and not the engine's — the engine can emit just
  // the TAIL: hint + buttons + closers.
  //
  // That tail IS the photo input. It is the whole of what was duplicated. The
  // host keeps its own content; the engine owns the surface. One implementation.
  var h = '';
  if (!o.zoneOnly) {
    h += '<div class="obs-media-col" data-pi-ns="' + _esc(ns) + '"' + da + '>';
    h += '<div class="obs-media-zone">';
    if (inner) h += inner;
  }
  h += '<div class="obs-media-hint">' + _esc(hint) + '</div>';
  h += _btnRow(ns, showGallery, '');
  h += '</div></div>';   // /obs-media-zone /obs-media-col — closed either way
  return h;
}

/* Recover the ctx the host passed to html() from the DOM. */
function _ctxOf(zone) {
  var ctx = {};
  if (!zone || !zone.attributes) return ctx;
  for (var i = 0; i < zone.attributes.length; i++) {
    var a = zone.attributes[i];
    if (a.name.indexOf('data-pi-') === 0 && a.name !== 'data-pi-ns') {
      ctx[a.name.slice(8)] = a.value;
    }
  }
  // zoneOnly hosts open the column themselves and label it with their OWN
  // attributes. Read those too, so the engine works identically whether it
  // built the wrapper or the host did.
  if (zone.getAttribute('data-defic-id') && !ctx['defic-id']) {
    ctx['defic-id'] = zone.getAttribute('data-defic-id');
  }
  if (zone.getAttribute('data-obs-idx') && !ctx['obs-idx']) {
    ctx['obs-idx'] = zone.getAttribute('data-obs-idx');
  }
  return ctx;
}

function _filePick(multiple, cb) {
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.multiple = (multiple !== false);
  inp.onchange = function() {
    if (inp.files && inp.files.length) cb(Array.prototype.slice.call(inp.files));
  };
  inp.click();
}

/* Camera → burst capture. Contract (S284, unchanged):
     File[] → use them        [] → user cancelled, no-op
     null   → unsupported/denied → fall back to the file picker, because the
              button must ALWAYS produce a way to add a photo. A camera button
              that does nothing on a desktop is a dead end. */
function _camera(cb) {
  var burst = (typeof window !== 'undefined') && window.openCameraBurst;
  if (!burst) { _filePick(true, cb); return; }
  burst().then(function(files) {
    if (files === null) { _filePick(true, cb); return; }
    if (files && files.length) cb(files);
  }).catch(function() { _filePick(true, cb); });
}

function _imagesOnly(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (/^image\//.test(list[i].type)) out.push(list[i]);
  }
  return out;
}

/* Delegated once, on document. Survives every host re-render — a mounted ns
   never needs re-binding, which is what makes this safe to drop into code that
   rebuilds its innerHTML on every model change (all of them do). */
function _delegate() {
  if (_delegated) return;
  _delegated = true;

  document.addEventListener('click', function(e) {
    var el = e.target.closest && e.target.closest('[data-action]');
    if (!el) return;
    var act = el.getAttribute('data-action') || '';
    var m = act.match(/^(.+)-pi-(camera|upload|gallery)$/);
    if (!m) return;
    var h = _mounted[m[1]];
    if (!h) return;
    // zoneOnly hosts (the pin editor) open .obs-media-col themselves, so it has
    // no data-pi-ns. The BUTTON always carries the ns in its data-action, so key
    // off that and read ctx from whichever col we are in — data-pi-* when the
    // engine built it, the host's own data-defic-id/data-obs-idx when it didn't.
    // buttonsOnly rows have no .obs-media-col above them — the host owns the
    // box. The ctx is on the button in that case, so read it from there rather
    // than bailing out, which would leave a live button doing nothing at all.
    var zone = el.closest('.obs-media-col');
    var ctx = _ctxOf(zone || el);

    if (m[2] === 'gallery') {
      if (h.onGallery) h.onGallery(ctx, zone);
      return;
    }
    var sink = function(files) { if (h.onFiles) h.onFiles(files, ctx, zone); };
    if (m[2] === 'camera') _camera(sink);
    else _filePick(true, sink);
  });

  // Drag & drop — the DEFAULT surface. dragover MUST preventDefault or the
  // browser navigates away to the dropped file and the app is simply gone.
  // Resolve which mounted ns owns a column. Engine-built wrappers say so on
  // data-pi-ns. zoneOnly hosts do not — but they contain the engine's buttons,
  // and those carry the ns. Anything with NEITHER is not ours: the pin editor
  // already has its own inline ondragover + photo-drop handler, and claiming its
  // column here would double-fire every drop.
  function _nsOf(z) {
    if (!z) return null;
    // A host that already declares its OWN drop handler keeps it. The pin editor
    // has had `data-action="photo-drop"` + an inline ondragover for many sessions
    // and it is field-proven; the engine claiming that column would double-fire
    // every drop and risk a live photo path to gain nothing. The engine owns the
    // BUTTONS there. It owns drag only where the host has no drag of its own.
    if (z.getAttribute('data-action') === 'photo-drop') return null;
    var ns = z.getAttribute('data-pi-ns');
    if (ns && _mounted[ns]) return ns;
    var b = z.querySelector('[data-action$="-pi-camera"]');
    if (b) {
      var m = (b.getAttribute('data-action') || '').match(/^(.+)-pi-camera$/);
      if (m && _mounted[m[1]]) return m[1];
    }
    return null;
  }

  document.addEventListener('dragover', function(e) {
    var z = e.target.closest && e.target.closest('.obs-media-col');
    if (!z || !_nsOf(z)) return;
    e.preventDefault();
    z.classList.add('drag-over');   // the app's EXISTING drag class
  });
  document.addEventListener('dragleave', function(e) {
    var z = e.target.closest && e.target.closest('.obs-media-col');
    if (z && _nsOf(z)) z.classList.remove('drag-over');
  });
  document.addEventListener('drop', function(e) {
    var z = e.target.closest && e.target.closest('.obs-media-col');
    if (!z) return;
    var ns = _nsOf(z);
    if (!ns) return;
    var h = _mounted[ns];
    if (!h) return;
    e.preventDefault();
    z.classList.remove('drag-over');
    var dt = e.dataTransfer;
    if (!dt || !dt.files || !dt.files.length) return;
    var imgs = _imagesOnly(dt.files);
    if (!imgs.length) {
      if (typeof window !== 'undefined' && window.toast) window.toast('Only image files can be attached');
      return;
    }
    if (h.onFiles) h.onFiles(imgs, _ctxOf(z), z);
  });
}

/* Register the handlers for a namespace. Idempotent — safe to call on every
   render; the last registration for an ns wins. */
function mount(o) {
  o = o || {};
  var ns = o.ns || 'pi';
  _mounted[ns] = { onFiles: o.onFiles || null, onGallery: o.onGallery || null };
  _delegate();
  return ns;
}

function unmount(ns) { delete _mounted[ns]; }

var api = { html: html, mount: mount, unmount: unmount, VERSION: '1.2.0' };   // 1.1.0 = S479 paperclip Upload glyph · 1.2.0 = S718 buttonsOnly (host owns the box, engine owns the row)

if (typeof window !== 'undefined') window.PhotoInput = api;

export const PhotoInput = api;
export default api;
