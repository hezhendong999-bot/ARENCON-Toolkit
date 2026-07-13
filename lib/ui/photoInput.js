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

/* Build the zone. Pure markup — safe to call inside any innerHTML build.

   S478b: this renders the app's EXISTING button family — `.obs-drop-btn` with
   `is-camera` / `is-gallery` / `is-upload` — and the app's EXISTING icons
   (📷 / ⬆️ / 🖼️). It does NOT invent a parallel `.pi-btn` system that merely
   imitates them. The pin editor already had this design; the engine's job is to
   BE it everywhere, not to reimplement it and drift.
   The engine adds exactly one thing the app didn't have: `is-upload`, dusty blue. */
function html(o) {
  o = o || {};
  var ns = o.ns || 'pi';
  var ctx = o.ctx || {};
  var showGallery = (o.gallery !== false);
  var hint = o.hint || 'Drop photos to add';

  // ctx rides on the wrapper as data-pi-* so a delegated handler can recover it
  // without a closure — survives every re-render the host does.
  var da = '';
  Object.keys(ctx).forEach(function(k) {
    da += ' data-pi-' + k + '="' + _esc(ctx[k]) + '"';
  });

  var h = '<div class="pi-zone" data-pi-ns="' + _esc(ns) + '"' + da + '>';
  h += '<div class="pi-hint">' + _esc(hint) + '</div>';
  h += '<div class="pi-btns obs-drop-btns">';
  h += '<button type="button" class="obs-drop-btn is-camera" data-action="' + _esc(ns) + '-pi-camera"'
     + ' title="Take photos with the burst camera">\uD83D\uDCF7 Camera</button>';
  h += '<button type="button" class="obs-drop-btn is-upload" data-action="' + _esc(ns) + '-pi-upload"'
     + ' title="Upload photos from this device">\u2B06\uFE0F Upload</button>';
  if (showGallery) {
    h += '<button type="button" class="obs-drop-btn is-gallery" data-action="' + _esc(ns) + '-pi-gallery"'
       + ' title="Pick from project site photos">\uD83D\uDDBC\uFE0F Gallery</button>';
  }
  h += '</div></div>';
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
    var zone = el.closest('.pi-zone');
    if (!zone) return;
    var ctx = _ctxOf(zone);

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
  document.addEventListener('dragover', function(e) {
    var z = e.target.closest && e.target.closest('.pi-zone');
    if (!z || !_mounted[z.getAttribute('data-pi-ns')]) return;
    e.preventDefault();
    z.classList.add('pi-over');
  });
  document.addEventListener('dragleave', function(e) {
    var z = e.target.closest && e.target.closest('.pi-zone');
    if (z) z.classList.remove('pi-over');
  });
  document.addEventListener('drop', function(e) {
    var z = e.target.closest && e.target.closest('.pi-zone');
    if (!z) return;
    var h = _mounted[z.getAttribute('data-pi-ns')];
    if (!h) return;
    e.preventDefault();
    z.classList.remove('pi-over');
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

var api = { html: html, mount: mount, unmount: unmount, VERSION: '1.0.0' };

if (typeof window !== 'undefined') window.PhotoInput = api;

export const PhotoInput = api;
export default api;
