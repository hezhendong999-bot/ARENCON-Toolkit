// frt/js/shared/scrollLock.js
// Ref-counted background scroll lock for modals / overlays.
//
// Why this module exists: dialogs.js (and the ad-hoc overlays) import
// { lockScroll, unlockScroll } from here. Without it the whole dialog module
// fails to load (broken static import). It also delivers the actual feature:
// while ANY modal is open the page behind it must not scroll.
//
// Mechanism: position:fixed body lock with scrollY capture/restore. This is the
// device-agnostic pattern (plain `overflow:hidden` on <body> does not reliably
// stop touch scroll on iOS/webviews). The modal's own scrollable content is a
// child of the overlay, so it keeps scrolling normally — only the page behind
// is frozen. Ref-counted so a confirm stacked on a modal doesn't unlock early.

let _depth = 0;
let _savedY = 0;

export function lockScroll() {
  if (_depth === 0) {
    _savedY = window.scrollY || document.documentElement.scrollTop || 0;
    const b = document.body;
    b.style.top = (-_savedY) + 'px';
    b.style.left = '0';
    b.style.right = '0';
    b.style.width = '100%';
    b.style.position = 'fixed';
    b.classList.add('modal-scroll-lock');
  }
  _depth++;
}

export function unlockScroll() {
  if (_depth === 0) return;          // never go negative
  _depth--;
  if (_depth === 0) {
    const b = document.body;
    b.style.position = '';
    b.style.top = '';
    b.style.left = '';
    b.style.right = '';
    b.style.width = '';
    b.classList.remove('modal-scroll-lock');
    window.scrollTo(0, _savedY);     // restore where the user was
  }
}

// Safety valve for any code path that closes an overlay without a paired
// unlockScroll (e.g. an error teardown) — call to force the page unfrozen.
export function resetScrollLock() {
  _depth = 0;
  const b = document.body;
  b.style.position = '';
  b.style.top = '';
  b.style.left = '';
  b.style.right = '';
  b.style.width = '';
  b.classList.remove('modal-scroll-lock');
}
