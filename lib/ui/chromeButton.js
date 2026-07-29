/**
 * lib/ui/chromeButton.js — THE chrome button. One definition, sealed.
 *
 * WHY THIS EXISTS (Mark, S524)
 * The drawing viewer's header buttons and the main header's buttons were
 * supposed to be one set of buttons and never were. Eleven pushes went into
 * six buttons and every one of them failed the same way: the values were
 * copied into frt.css, where ~200 accumulated rules argue with each other and
 * a new rule is simply the 201st contestant. Two definitions of the same
 * button always drift. A comment saying "keep these in sync" is not a
 * mechanism.
 *
 * Measured on device before this module (Chrome touch emulation / Android):
 *     layers / more / theme    38 x 38   (named in the fixed-size rule)
 *     seal / heights / help    34 x 44   (never named in it — inflated by the
 *                                         global touch rule, pinned narrow by
 *                                         a separate min-width rule)
 *     viewer back              60 x 38   transparent   13px
 *     header back              40 x 34   #EFEDF0       16px
 *
 * The fix is not better values. It is that these buttons now render inside a
 * SEALED shadow root, so no page stylesheet can reach the box — not frt.css,
 * not a future session's !important, not anything. The header engine and the
 * viewer both draw from CHROME_BTN_CSS below, so there is exactly one
 * definition to change and nothing to keep in sync.
 *
 * THE DELETION IS THE PROOF. Adopting this module without deleting the
 * frt.css rules that style these ids leaves the old system in place and the
 * unification is fake. Grep for the ids after wiring: they must be gone.
 *
 * RULES
 * · Values are HARDCODED. No var() indirection into host pages. A host may
 *   define a token weakly (the Hub defines --b-btn-shadow as an invisible
 *   0 1px 2px rgba(0,0,0,.08)) and a defined token beats any fallback.
 *   Two scars: S504 Back button, S514 Hub icons.
 *   The ONE exception is --ts (text size), which is a user setting and must
 *   reach every button. Custom properties inherit through a shadow boundary,
 *   so calc(16px + var(--ts,0px)) works unchanged inside the seal.
 * · NO breakpoints. NO @media(pointer:coarse). NO size variation of any kind.
 *   Every size drift Mark has reported came from a media query that covered
 *   some of the buttons and not others. There is one size. (Mark, S524:
 *   "I want these 6 buttons to be the same size, stop changing size.")
 * · upgrade() PRESERVES the host's id, title, data-* attributes and inline
 *   onclick, and KEEPS THE ORIGINAL CHILDREN IN THE LIGHT DOM behind a
 *   <slot>. That is deliberate: viewer.js reads #dv-heights-dot by id and
 *   drawings.js appends .seal-dot into #dv-seal-btn. Moving that content into
 *   the shadow would break both silently. Slotting keeps every existing
 *   handler and query working untouched.
 * · Runtime state classes (.active, .seal-armed, .has-covers) are set by
 *   existing code ON THE HOST and styled from inside via :host(.class).
 *   No observer, no API change, no caller edits.
 */

/* ── The one and only chrome-button appearance. Light + dark, both skins. ──
   Sizes: icon 34x34 · back 40x34 · wide auto-width x34. Nothing else. */
export const CHROME_BTN_CSS = `
  :host {
    display:inline-flex; align-items:center; justify-content:center;
    box-sizing:border-box;
    width:34px; height:34px; min-width:34px; flex:0 0 auto;
    padding:0; margin:0; border:0; background:none; box-shadow:none;
    cursor:pointer;
    position:relative; vertical-align:middle;
  }
  :host([hidden]) { display:none; }
  :host([data-variant="back"]) { width:40px; flex:0 0 40px; }
  :host([data-variant="wide"]) { width:auto; flex:0 0 auto; }

  button {
    display:inline-flex; align-items:center; justify-content:center;
    box-sizing:border-box;
    position:relative; z-index:1;
    width:100%; height:34px;
    padding:0; margin:0;
    background:#EFEDF0;
    border:1px solid #D2CEDB;
    color:#1B1A22;
    border-radius:6px;
    font:600 calc(16px + var(--ts,0px)) Calibri, sans-serif;
    line-height:1;
    cursor:pointer;
    box-shadow:0 1px 4px rgba(0,0,0,.2);
    transition:box-shadow .15s, transform .08s, background .15s;
    -webkit-tap-highlight-color:transparent;
  }
  :host([data-variant="wide"]) button {
    padding:0 12px; font-size:calc(12px + var(--ts,0px)); font-weight:600;
  }

  button:hover  { background:#E2DEE6; }
  button:active { transform:translateY(1px); box-shadow:0 1px 2px rgba(0,0,0,.22); }
  button:focus-visible { outline:2px solid #2C7FB8; outline-offset:2px; }

  /* ── armed / active — brand burgundy, same meaning in every tool ── */
  :host(.active) button,
  :host(.seal-armed) button {
    background:#9C2742; border-color:#9C2742; color:#fff;
  }

  /* ── help (?) — amber glyph, burgundy on hover ── */
  :host([data-variant="help"]) button { color:#E0872A; font-weight:800; }
  :host([data-variant="help"]) button:hover {
    background:#9C2742; border-color:#9C2742; color:#fff;
  }

  /* ── dark theme ── */
  :host([data-theme="dark"]) button {
    background:#221f29; border-color:rgba(255,255,255,.14); color:#f4f3f6;
    box-shadow:0 2px 6px rgba(0,0,0,.45);
  }
  :host([data-theme="dark"]) button:hover { background:#2d2a35; }
  :host([data-theme="dark"].active) button,
  :host([data-theme="dark"].seal-armed) button {
    background:#C9476A; border-color:#C9476A; color:#fff;
  }

  /* ── navy skin (the non-chrome header bar used by some tools) ── */
  :host([data-skin="navy"]) button {
    background:rgba(255,255,255,.14); border-color:rgba(255,255,255,.12);
    color:#fff; box-shadow:0 1px 4px rgba(0,0,0,.2);
  }
  :host([data-skin="navy"]) button:hover { background:rgba(255,255,255,.22); }

  /* ── slotted content: the host page still owns the glyphs and badges,
        but never the box. Sizes are normalised here so one button's emoji
        cannot make it taller than its neighbour. ── */
  ::slotted(*) { line-height:1 !important; }
  ::slotted(img) { display:block; }
  ::slotted(.dv-lb-txt) { display:none !important; }
  ::slotted(.bb-txt)    { display:none !important; }
  ::slotted(.dv-lb-icon) { font-size:calc(16px + var(--ts,0px)) !important; }
`;

/* Attributes worth carrying onto the replacement host. Classes are NOT
   copied: S521 carried .back-btn / .dv-close-btn across and page CSS went on
   sizing the wrapper (60x44 around a correct 40x34 button). Verified: no JS
   selects these elements by class — they were styling-only. */
const KEEP_ATTRS = ['id', 'title', 'onclick', 'aria-label', 'disabled'];

/**
 * Turn an existing toolbar button into the shared chrome button, in place.
 *
 * @param {Element} el            element to upgrade (e.g. #dv-seal-btn)
 * @param {Object}  [opts]
 * @param {string}  [opts.variant] 'icon' (default) | 'back' | 'help' | 'wide'
 * @param {string}  [opts.skin]    'chrome' (default) | 'navy'
 * @returns {Element|null} the live host element, or null if it could not be upgraded
 */
export function upgradeChromeButton(el, opts) {
  if (!el) return null;
  if (el.dataset && el.dataset.chromeBtn === '1') return el;   // idempotent
  opts = opts || {};

  /* <button> cannot host a shadow root, so swap in a <span> that can and move
     the original children across so the <slot> still shows them. */
  let host = el;
  if (!canAttachShadow(el)) {
    try {
      host = document.createElement('span');
      KEEP_ATTRS.forEach(function (a) {
        if (el.hasAttribute(a)) host.setAttribute(a, el.getAttribute(a));
      });
      if (el.dataset) {
        Object.keys(el.dataset).forEach(function (k) { host.dataset[k] = el.dataset[k]; });
      }
      host.setAttribute('role', 'button');
      if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '0');
      while (el.firstChild) host.appendChild(el.firstChild);   // keep light DOM
      el.parentNode.replaceChild(host, el);
    } catch (e) {
      console.warn('[chromeButton] could not upgrade', el && el.id, e);
      return null;
    }
  }

  let root;
  try {
    root = host.attachShadow({ mode: 'closed' });
  } catch (e) {
    console.warn('[chromeButton] shadow attach failed', host && host.id, e);
    return null;
  }

  host.setAttribute('data-variant', opts.variant || 'icon');
  host.setAttribute('data-skin', opts.skin || 'chrome');

  const style = document.createElement('style');
  style.textContent = CHROME_BTN_CSS;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.tabIndex = -1;                       // the host owns focus
  btn.setAttribute('aria-hidden', 'true'); // the host owns the accessible name
  btn.appendChild(document.createElement('slot'));
  root.appendChild(style);
  root.appendChild(btn);

  host.dataset.chromeBtn = '1';
  if (host.tagName !== 'BUTTON') {
    host.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); host.click(); }
    });
  }
  syncChromeTheme(host);
  return host;
}

/** True if this element can host a shadow root (buttons cannot). */
function canAttachShadow(el) {
  const ok = { SPAN: 1, DIV: 1, SECTION: 1, ARTICLE: 1, ASIDE: 1, HEADER: 1,
               FOOTER: 1, NAV: 1, MAIN: 1, P: 1, H1: 1, H2: 1, H3: 1 };
  return !!ok[el.tagName];
}

/** Mirror the page's dark-mode state onto one sealed host. */
export function syncChromeTheme(el) {
  if (!el) return;
  const dark = document.body.classList.contains('dark-mode');
  el.setAttribute('data-theme', dark ? 'dark' : 'light');
}

/** Keep every upgraded chrome button in step with dark-mode toggles. */
export function watchChromeTheme() {
  try {
    const apply = function () {
      document.querySelectorAll('[data-chrome-btn="1"]').forEach(syncChromeTheme);
    };
    new MutationObserver(apply).observe(document.body,
      { attributes: true, attributeFilter: ['class'] });
    apply();
  } catch (e) { /* non-fatal */ }
}
