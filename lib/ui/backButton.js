/**
 * lib/ui/backButton.js — THE back button. One definition, sealed.
 *
 * WHY THIS EXISTS (Mark, S521)
 * The drawing viewer's back button and the main header's back button were
 * two different buttons that were supposed to look identical. They never did.
 * Eight rounds of copying values into frt.css failed because ~200 accumulated
 * rules in that stylesheet outranked every attempt — including two
 * `button:not(#dv-close):not(#dv-rename-btn)` rules whose `:not(#id)` carries
 * the ID's specificity. Measured on device, the two buttons were:
 *     viewer  60x38  transparent  13px  padding-right 12px
 *     header  40x34  #EFEDF0      18px  padding 0
 *
 * Matching values was the wrong fix. This module is the right one: the button
 * renders inside a SEALED shadow root, so no page stylesheet can reach it —
 * not frt.css, not a future session's !important, not anything. The header
 * engine and the viewer both draw from BACK_CSS below, so there is exactly one
 * definition to change and nothing to keep in sync.
 *
 * RULES
 * · BACK_CSS is the single source of truth. headerEngine2.js interpolates it
 *   for its own `.back`; do not fork the values.
 * · Values are hardcoded — no var() into host pages. A host may define a token
 *   weakly (the Hub defines --b-btn-shadow as an invisible 0 1px 2px
 *   rgba(0,0,0,.08)) and a defined token beats any fallback.
 * · upgrade() PRESERVES the host element's id. Click handling in this app is
 *   delegated (`e.target.id === 'dv-close'`, `closest('#dv-close')`), and
 *   composed events retarget to the shadow host — so existing handlers keep
 *   working untouched. Do not remove the id.
 */

/** The one and only back-button appearance. Light + dark. */
export const BACK_CSS = `
  :host { display:inline-flex; flex:0 0 40px; }
  button {
    display:inline-flex; align-items:center; justify-content:center;
    background:#EFEDF0;
    border:1px solid #D2CEDB;
    color:#1B1A22;
    height:34px; width:40px; min-width:40px;
    padding:0;
    border-radius:6px;
    font:600 16px Calibri, sans-serif;
    line-height:1;
    cursor:pointer;
    box-shadow:0 1px 4px rgba(0,0,0,.2);
    transition:box-shadow .15s, transform .08s, background .15s;
    position:relative; z-index:1;
  }
  button:hover { background:rgba(0,0,0,.05); }
  button:active { transform:translateY(1px); box-shadow:0 1px 2px rgba(0,0,0,.22); }
  :host([data-theme="dark"]) button {
    background:rgba(255,255,255,.14);
    border:1px solid rgba(255,255,255,.12);
    color:#fff;
  }
  :host([data-theme="dark"]) button:hover { background:rgba(255,255,255,.22); }
`;

const GLYPH = '\u2190';   // ← : identical to the header's back glyph

/**
 * Turn an existing element into the shared back button, in place.
 * Keeps the element (and therefore its id, title and any direct listeners);
 * everything visual moves inside a sealed shadow root.
 *
 * @param {Element} el   the element to upgrade (e.g. #dv-close)
 * @returns {Element|null} the same element, or null if it could not be upgraded
 */
export function upgradeBackButton(el) {
  if (!el) return null;
  if (el.shadowRoot || el.dataset.sharedBack === '1') return el;   // idempotent
  let root;
  try {
    root = el.attachShadow({ mode: 'closed' });
  } catch (e) {
    // Some elements (e.g. <button>) cannot host a shadow root. Swap in a span
    // that can, preserving id/title/classes so delegated handlers still match.
    try {
      const host = document.createElement('span');
      host.id = el.id;
      host.title = el.title || 'Back';
      /* S522 (Mark) — DO NOT COPY THE CLASSES.
         S521 carried .back-btn and .dv-close-btn onto the host, so page CSS
         still styled the WRAPPER (padding:0 12px !important, height !important,
         transparent bg, 13px font) even though the sealed inner button was
         correct. Measured result: host 60x44 around a correct 40x34 button.
         The shadow root protects the inside; the host must be given nothing
         for page rules to match. Verified: no JS anywhere selects this element
         by .dv-close-btn or .back-btn — they were styling-only. */
      host.setAttribute('role', 'button');
      host.setAttribute('tabindex', '0');
      /* Inline reset: inline styles beat any non-!important page rule, and with
         no classes there is nothing left carrying !important. The host is a
         bare wrapper; the sealed button inside defines the entire appearance. */
      host.style.cssText = 'all:initial;display:inline-flex;align-items:center;' +
        'line-height:0;font-size:0;padding:0;margin:0;border:0;background:none;' +
        'box-shadow:none;cursor:pointer;';
      el.parentNode.replaceChild(host, el);
      root = host.attachShadow({ mode: 'closed' });
      el = host;
    } catch (e2) {
      console.warn('[backButton] could not upgrade:', e2);
      return null;
    }
  }
  /* Same reset for a host that accepted a shadow root directly. */
  try {
    el.style.cssText = 'all:initial;display:inline-flex;align-items:center;' +
      'line-height:0;font-size:0;padding:0;margin:0;border:0;background:none;' +
      'box-shadow:none;cursor:pointer;';
  } catch (e) {}
  const style = document.createElement('style');
  style.textContent = BACK_CSS;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = GLYPH;
  btn.setAttribute('aria-label', el.title || 'Back');
  root.appendChild(style);
  root.appendChild(btn);
  el.dataset.sharedBack = '1';
  // Keyboard parity with a real button when we had to swap to a span.
  if (el.tagName !== 'BUTTON') {
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); }
    });
  }
  syncBackTheme(el);
  return el;
}

/** Mirror the page's dark-mode state onto the sealed host. */
export function syncBackTheme(el) {
  if (!el) return;
  const dark = document.body.classList.contains('dark-mode');
  el.setAttribute('data-theme', dark ? 'dark' : 'light');
}

/** Keep every upgraded back button in step with dark-mode toggles. */
export function watchBackTheme() {
  try {
    new MutationObserver(function () {
      document.querySelectorAll('[data-shared-back="1"]').forEach(syncBackTheme);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch (e) { /* non-fatal */ }
}
