/**
 * ARENCON Toolkit — Dialog Engine (shared, sealed)
 * ═══════════════════════════════════════════════════════════════════════════
 * lib/ui/dialogEngine.js · v1.0.0 · Wave 0 of the Modal Unification
 *
 * ONE dialog implementation for every tool. Follows the proven headerEngine2
 * pattern: sealed, versioned, Shadow-DOM-isolated. A tool CONFIGURES a dialog
 * (title, icon, accent, fields, rows). A tool NEVER defines dialog chrome,
 * spacing, colours or button styles. If a need does not fit a family below,
 * the ENGINE gains a family (with Mark's sign-off) — the tool does not invent
 * one.
 *
 * Approved design (S488): Bold two-mode. 16px cards, hairline borders,
 * low-alpha tinted headers with bordered icon chips (never heavy solid bars),
 * Calibri throughout, semantic accents. NO BURGUNDY IN THE DIALOG LAYER —
 * burgundy stays reserved for primary CTAs and active states in page chrome.
 *
 * Engine-enforced behaviours (not per-tool, not overridable):
 *   • Cancel is always leftmost.
 *   • ONE confirm tap. Never type-to-confirm except the typeToConfirm family.
 *   • confirmDanger REQUIRES undoNote (where the undo lives) or explicit
 *     irreversible:true — which forces the typeToConfirm family instead.
 *   • Esc cancels · Enter submits prompts/forms.
 *   • Touch targets via @media(pointer:coarse).
 *   • Scroll-locks the page; NEVER replaces page content.
 *
 * FAMILIES IN v1.0.0:
 *   alert · confirm · confirmDanger · typeToConfirm · prompt · leave ·
 *   progress · form · pickList
 *
 * NOT IN v1.0.0 (deliberately — do not hand-roll them in a tool, ask first):
 *   pickGrid · panel · conflict
 *
 * Theme: mirrors document.documentElement[data-theme] into the shadow root and
 * follows live changes. Both modes are defined once, switched on the attribute.
 */

export const DIALOG_ENGINE_VERSION = '1.3.0';

/* ══════════════════════════════════════════════════════════════════════════
   Tokens + shadow styles. Defined ONCE; light and dark ship together.
   ══════════════════════════════════════════════════════════════════════════ */

const STYLES = `
:host{
  all: initial;
  font-family: Calibri, 'Segoe UI', sans-serif;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: block;

  /* ── Bold · Light (default) ── */
  --dlg-scrim:      rgba(20,18,24,.44);
  --dlg-card:       #FBFAFC;
  --dlg-card-2:     #EFEDF0;
  --dlg-line:       rgba(27,26,34,.12);
  --dlg-ink:        #1B1A22;
  --dlg-ink-2:      #5E5B68;
  --dlg-ink-3:      #928E9C;
  --dlg-shadow:     0 18px 48px rgba(20,18,24,.22), 0 2px 6px rgba(20,18,24,.10);

  --dlg-slate:      #5E5B68;
  --dlg-ok:         #2E9E72;
  --dlg-fail:       #C0445F;
  --dlg-warn:       #C98A4A;
  --dlg-info:       #2C7FB8;

  --dlg-btn-ink:    #1B1A22;
  --dlg-btn-face:   #FFFFFF;
  --dlg-btn-line:   rgba(27,26,34,.20);
}
:host([data-theme="dark"]){
  --dlg-scrim:      rgba(0,0,0,.62);
  --dlg-card:       #17151d;
  --dlg-card-2:     #1d1b24;
  --dlg-line:       rgba(244,243,246,.14);
  --dlg-ink:        #f4f3f6;
  --dlg-ink-2:      #a09aa8;
  --dlg-ink-3:      #6b6674;
  --dlg-shadow:     0 18px 52px rgba(0,0,0,.62), 0 2px 8px rgba(0,0,0,.44);

  --dlg-slate:      #a09aa8;
  --dlg-ok:         #3FD08A;
  --dlg-fail:       #E26076;
  --dlg-warn:       #E0A36A;
  --dlg-info:       #46C5E8;

  --dlg-btn-ink:    #f4f3f6;
  --dlg-btn-face:   #221f2a;
  --dlg-btn-line:   rgba(244,243,246,.20);
}

*, *::before, *::after { box-sizing: border-box; }

.scrim{
  position:absolute; inset:0;
  background: var(--dlg-scrim);
  backdrop-filter: blur(2px);
  display:flex; align-items:center; justify-content:center;
  padding: 20px;
  opacity:0; transition: opacity .13s ease;
}
.scrim.in{ opacity:1; }

.card{
  width: 100%;
  max-width: var(--dlg-w, 440px);
  max-height: calc(100vh - 40px);
  display:flex; flex-direction:column;
  background: var(--dlg-card);
  border: 1px solid var(--dlg-line);
  border-radius: 16px;
  box-shadow: var(--dlg-shadow);
  backdrop-filter: blur(8px);
  overflow: hidden;
  transform: translateY(6px) scale(.985);
  transition: transform .13s ease;
}
.scrim.in .card{ transform:none; }

/* ── Header (S497, Mark-approved: direction C "tinted wash" + hairline rule).
   NOT a solid bar. The accent wash fades from the card top into the body, so the
   colour comes from the ACTION'S MEANING — identical in every tool — rather than
   from any tool's chrome. That is why this one definition serves FRT, Diesel and
   Electric alike: it references nothing external. A single hairline under the
   header gives the region definition the wash alone lacked.
   The ✕ is engine-owned, exactly like "Cancel is leftmost": no call site can
   omit it, so it cannot drift back out of any tool. It is suppressed ONLY where
   dismissal is unsafe (see .no-x / progress). ── */
.card::before{
  content:''; position:absolute; left:0; right:0; top:0; height:92px;
  pointer-events:none;
  background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 11%, transparent), transparent);
}
.hd{
  position:relative;            /* above the wash */
  display:flex; align-items:center; gap:11px;
  padding: 15px 13px 12px 16px;
  border-bottom: 1px solid var(--dlg-line);   /* the hairline */
}
.chip{
  flex:0 0 auto;
  width:30px; height:30px;
  display:flex; align-items:center; justify-content:center;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--acc) 40%, transparent);
  background: color-mix(in srgb, var(--acc) 16%, transparent);
  color: var(--acc);
  font-size: 15px; line-height:1;
}
.htxt{ flex:1 1 auto; min-width:0; }
.ttl{
  font-size: 15.5px; font-weight: 700; color: var(--dlg-ink);
  letter-spacing:.1px; margin:0;
}
/* Optional context line — the report/project this dialog is acting on. */
.sub{
  font-size: 12px; color: var(--dlg-ink-3); margin-top: 2px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
button.x{
  flex:0 0 auto;
  width:32px; height:32px;
  display:flex; align-items:center; justify-content:center;
  border:0; border-radius:8px; background:none;
  color: var(--dlg-ink-3);
  font-size:17px; line-height:1; cursor:pointer;
  font-family: inherit;
}
button.x:hover{ background: var(--dlg-card-2); color: var(--dlg-ink); }
button.x:focus-visible{ outline: 2px solid var(--acc); outline-offset: 2px; }
.card.no-x button.x{ display:none; }

/* ── Body ── */
.bd{
  padding: 15px 16px 4px;
  overflow-y: auto;
  color: var(--dlg-ink);
  font-size: 14px;
  line-height: 1.5;
}
.bd p{ margin: 0 0 10px; }
.bd p.muted{ color: var(--dlg-ink-2); font-size: 13px; }

.undo{
  display:flex; gap:8px; align-items:flex-start;
  margin: 4px 0 10px;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dlg-info) 30%, transparent);
  background: color-mix(in srgb, var(--dlg-info) 9%, transparent);
  color: var(--dlg-ink-2);
  font-size: 12.5px; line-height:1.45;
}
.undo b{ color: var(--dlg-ink); font-weight:600; }

/* ── Fields ── */
.fld{ margin: 0 0 11px; }
.fld label{
  display:block; margin: 0 0 4px;
  font-size: 12px; font-weight:600; letter-spacing:.2px;
  color: var(--dlg-ink-2); text-transform: uppercase;
}
.fld input, .fld textarea, .fld select{
  width:100%;
  font-family: inherit; font-size: 14px;
  color: var(--dlg-ink);
  background: var(--dlg-card-2);
  border: 1px solid var(--dlg-btn-line);
  border-radius: 9px;
  padding: 9px 11px;
  outline: none;
}
.fld textarea{ min-height: 78px; resize: vertical; }
.fld input:focus, .fld textarea:focus, .fld select:focus{
  border-color: color-mix(in srgb, var(--acc) 55%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 16%, transparent);
}
.err{ color: var(--dlg-fail); font-size: 12px; margin-top: 5px; min-height: 1px; }

/* ── Pick list ── */
.list{ margin: 0 0 8px; max-height: 44vh; overflow-y:auto; }
.row{
  display:flex; align-items:center; gap:10px;
  padding: 10px 11px;
  border: 1px solid var(--dlg-line);
  border-radius: 10px;
  margin-bottom: 6px;
  cursor: pointer;
  background: transparent;
  color: var(--dlg-ink);
  text-align:left; width:100%;
  font-family: inherit; font-size: 14px;
}
.row:hover{ background: var(--dlg-card-2); }
.row[aria-selected="true"]{
  border-color: color-mix(in srgb, var(--acc) 50%, transparent);
  background: color-mix(in srgb, var(--acc) 10%, transparent);
}
.row .sub{ display:block; font-size:12px; color: var(--dlg-ink-3); margin-top:2px; }

/* ── Progress ── */
.bar{
  height: 7px; border-radius: 99px;
  background: var(--dlg-card-2);
  border: 1px solid var(--dlg-line);
  overflow:hidden; margin: 6px 0 10px;
}
.bar > i{
  display:block; height:100%; width:0%;
  background: var(--acc);
  transition: width .18s ease;
}
.bar.indet > i{ width:38%; animation: sweep 1.05s ease-in-out infinite; }
@keyframes sweep{ 0%{margin-left:-38%} 100%{margin-left:100%} }
.pstat{ font-size:12.5px; color: var(--dlg-ink-2); }

/* ── Footer. CANCEL IS ALWAYS LEFTMOST — enforced by DOM order. ── */
.ft{
  display:flex; gap:9px; align-items:center;
  padding: 13px 16px 15px;
  border-top: 1px solid var(--dlg-line);
  margin-top: 11px;
}
.ft .spacer{ flex:1 1 auto; }
button.b{
  font-family: inherit; font-size: 14px; font-weight:600;
  padding: 9px 15px;
  border-radius: 10px;
  border: 1px solid var(--dlg-btn-line);
  background: var(--dlg-btn-face);
  color: var(--dlg-btn-ink);
  cursor: pointer;
  min-height: 38px;
  white-space: nowrap;
}
button.b:hover{ border-color: color-mix(in srgb, var(--dlg-ink) 34%, transparent); }
button.b.primary{
  border-color: color-mix(in srgb, var(--acc) 55%, transparent);
  background: color-mix(in srgb, var(--acc) 15%, transparent);
  color: var(--acc);
}
button.b.primary:hover{ background: color-mix(in srgb, var(--acc) 23%, transparent); }
button.b:disabled{ opacity:.45; cursor: not-allowed; }
button.b:focus-visible{ outline: 2px solid var(--acc); outline-offset: 2px; }

@media (pointer:coarse){
  button.b{ min-height: 46px; padding: 12px 18px; font-size: 15px; }
  /* Gloves: the ✕ gets a full touch target, and sits a little further from the
     card corner so a thumb resting on the bezel cannot clip it. */
  button.x{ width: 42px; height: 42px; font-size: 20px; }
  .hd{ padding-right: 10px; }
  .row{ padding: 13px 12px; }
  .fld input, .fld textarea, .fld select{ padding: 12px; font-size: 15px; }
}
@media (max-width: 520px){
  .scrim{ padding: 12px; }
  .ft{ flex-wrap: wrap; }
  .ft .spacer{ display:none; }
  button.b{ flex: 1 1 auto; }
}
`;

/* ══════════════════════════════════════════════════════════════════════════
   Internals
   ══════════════════════════════════════════════════════════════════════════ */

const ACCENTS = {
  slate: 'var(--dlg-slate)',
  ok:    'var(--dlg-ok)',
  fail:  'var(--dlg-fail)',
  warn:  'var(--dlg-warn)',
  info:  'var(--dlg-info)'
};

let _openCount = 0;
let _savedOverflow = null;

function _lockScroll() {
  if (_openCount++ === 0) {
    try {
      _savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } catch (e) {}
  }
}
function _unlockScroll() {
  if (--_openCount <= 0) {
    _openCount = 0;
    try { document.body.style.overflow = _savedOverflow || ''; } catch (e) {}
  }
}

function _currentTheme() {
  try {
    const t = document.documentElement.getAttribute('data-theme');
    return (t === 'dark') ? 'dark' : 'light';
  } catch (e) { return 'light'; }
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Create the shadow host + card skeleton. Returns a controller the families
 * build on. Nothing outside this file constructs dialog chrome.
 */
function _mount(opts) {
  const host = document.createElement('div');
  host.setAttribute('data-arencon-dialog', DIALOG_ENGINE_VERSION);
  host.setAttribute('data-theme', _currentTheme());

  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  root.appendChild(style);

  const accent = ACCENTS[opts.accent] || ACCENTS.slate;

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML =
    '<div class="card' + (opts.dismissable === false ? ' no-x' : '') +
      '" role="dialog" aria-modal="true" style="--acc:' + accent +
      (opts.width ? ';--dlg-w:' + parseInt(opts.width, 10) + 'px' : '') + '">' +
      '<div class="hd">' +
        '<div class="chip">' + _esc(opts.icon || 'i') + '</div>' +
        '<div class="htxt">' +
          '<h2 class="ttl"></h2>' +
          (opts.sub ? '<div class="sub"></div>' : '') +
        '</div>' +
        '<button class="x" type="button" aria-label="Close" title="Close">\u2715</button>' +
      '</div>' +
      '<div class="bd"></div>' +
      '<div class="ft"><span class="spacer"></span></div>' +
    '</div>';
  root.appendChild(scrim);

  scrim.querySelector('.ttl').textContent = opts.title || '';
  if (opts.sub) scrim.querySelector('.sub').textContent = opts.sub;

  const card = scrim.querySelector('.card');
  const body = scrim.querySelector('.bd');
  const foot = scrim.querySelector('.ft');
  const spacer = foot.querySelector('.spacer');

  document.body.appendChild(host);
  _lockScroll();

  // Follow live theme flips while open.
  let mo = null;
  try {
    mo = new MutationObserver(() => host.setAttribute('data-theme', _currentTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) {}

  requestAnimationFrame(() => scrim.classList.add('in'));

  let closed = false;
  const ctl = {
    host, root, scrim, card, body, foot,

    /** Buttons are appended in call order. Cancel must be added FIRST. */
    addButton(label, kind, onTap) {
      const b = document.createElement('button');
      b.className = 'b' + (kind === 'primary' ? ' primary' : '');
      b.textContent = label;
      b.addEventListener('click', onTap);
      if (kind === 'primary') foot.appendChild(b);
      else foot.insertBefore(b, spacer);
      return b;
    },

    close(cb) {
      if (closed) return;
      closed = true;
      scrim.classList.remove('in');
      if (mo) { try { mo.disconnect(); } catch (e) {} }
      setTimeout(() => {
        try { host.remove(); } catch (e) {}
        _unlockScroll();
        if (cb) cb();
      }, 130);
    },

    /** Esc cancels. Enter submits when a submit handler is supplied.
        S497: the ✕ is bound to the SAME onEsc handler, so closing by ✕ and
        closing by Esc are literally the same code path — a family that resolves
        its promise with 'cancel' on Esc does exactly that on ✕. Wiring the ✕ to
        a bare ctl.close() instead would drop the promise and hang every caller
        that awaits the result. Families that pass no onEsc (progress) also get
        no ✕ behaviour, which is why progress additionally sets dismissable:false
        to hide the button rather than leave a dead control. */
    keys(onEsc, onEnter) {
      const h = (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); onEsc && onEsc(); }
        else if (ev.key === 'Enter' && onEnter) {
          const t = ev.target;
          if (t && t.tagName === 'TEXTAREA') return;
          ev.preventDefault(); onEnter();
        }
      };
      root.addEventListener('keydown', h);
      document.addEventListener('keydown', h);
      const xb = card.querySelector('button.x');
      const xh = onEsc ? () => onEsc() : null;
      if (xb && xh) xb.addEventListener('click', xh);
      const off = () => {
        root.removeEventListener('keydown', h);
        document.removeEventListener('keydown', h);
        if (xb && xh) xb.removeEventListener('click', xh);
      };
      return off;
    }
  };

  return ctl;
}

function _para(body, text, muted) {
  if (!text) return;
  String(text).split('\n').forEach((line) => {
    const p = document.createElement('p');
    if (muted) p.className = 'muted';
    p.textContent = line;
    body.appendChild(p);
  });
}

function _undoNote(body, note) {
  const d = document.createElement('div');
  d.className = 'undo';
  d.innerHTML = '<span>&#8634;</span><span><b>Undo:</b> ' + _esc(note) + '</span>';
  body.appendChild(d);
}

/* ══════════════════════════════════════════════════════════════════════════
   Families
   ══════════════════════════════════════════════════════════════════════════ */

export function alert(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || 'Notice',
      icon: opts.icon || 'i',
      accent: opts.accent || 'info',
      sub: opts.sub,
      width: opts.width
    });
    _para(ctl.body, opts.message);
    const done = () => { off(); ctl.close(() => { if (opts.onClose) opts.onClose(); resolve(); }); };
    const off = ctl.keys(done, done);
    ctl.addButton(opts.okText || 'OK', 'primary', done).focus();
  });
}

export function confirm(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || 'Confirm',
      icon: opts.icon || '?',
      accent: opts.accent || 'info',
      sub: opts.sub,
      width: opts.width
    });
    _para(ctl.body, opts.message);
    if (opts.detail) _para(ctl.body, opts.detail, true);

    const finish = (ok) => {
      off();
      ctl.close(() => {
        if (ok && opts.onConfirm) opts.onConfirm();
        if (!ok && opts.onCancel) opts.onCancel();
        resolve(!!ok);
      });
    };
    const off = ctl.keys(() => finish(false), () => finish(true));

    // Cancel FIRST — engine-enforced leftmost placement.
    ctl.addButton(opts.cancelText || 'Cancel', 'ghost', () => finish(false));
    ctl.addButton(opts.confirmText || 'Confirm', 'primary', () => finish(true)).focus();
  });
}

/**
 * Destructive confirm. undoNote is MANDATORY — every destructive dialog must
 * say where the undo lives. If the action genuinely cannot be undone, pass
 * irreversible:true and the engine routes to typeToConfirm instead.
 */
export function confirmDanger(opts) {
  opts = opts || {};
  if (opts.irreversible) {
    return typeToConfirm(opts);
  }
  if (!opts.undoNote) {
    throw new Error(
      '[dialogEngine] confirmDanger requires undoNote (where the undo lives), ' +
      'or irreversible:true. Refusing to show a destructive dialog that does not ' +
      'tell the user how to get their data back.'
    );
  }
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || 'Delete',
      icon: opts.icon || '\u2715',
      accent: 'fail',
      sub: opts.sub,
      width: opts.width
    });
    _para(ctl.body, opts.message);
    _undoNote(ctl.body, opts.undoNote);
    if (opts.detail) _para(ctl.body, opts.detail, true);

    const finish = (ok) => {
      off();
      ctl.close(() => {
        if (ok && opts.onConfirm) opts.onConfirm();
        if (!ok && opts.onCancel) opts.onCancel();
        resolve(!!ok);
      });
    };
    const off = ctl.keys(() => finish(false), null);

    ctl.addButton(opts.cancelText || 'Cancel', 'ghost', () => finish(false)).focus();
    ctl.addButton(opts.confirmText || 'Delete', 'primary', () => finish(true));
  });
}

/** Irreversible actions only. The user types an exact phrase. */
export function typeToConfirm(opts) {
  opts = opts || {};
  const phrase = String(opts.phrase || 'DELETE');
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || 'This cannot be undone',
      icon: opts.icon || '\u26A0',
      accent: 'fail',
      sub: opts.sub,
      width: opts.width || 460
    });
    _para(ctl.body, opts.message);
    if (opts.undoNote) _undoNote(ctl.body, opts.undoNote);
    else _para(ctl.body, 'There is no undo for this action.', true);

    const wrap = document.createElement('div');
    wrap.className = 'fld';
    wrap.innerHTML =
      '<label>Type ' + _esc(phrase) + ' to confirm</label>' +
      '<input type="text" autocomplete="off" spellcheck="false">';
    ctl.body.appendChild(wrap);
    const input = wrap.querySelector('input');

    const finish = (ok) => {
      off();
      ctl.close(() => {
        if (ok && opts.onConfirm) opts.onConfirm();
        if (!ok && opts.onCancel) opts.onCancel();
        resolve(!!ok);
      });
    };

    ctl.addButton(opts.cancelText || 'Cancel', 'ghost', () => finish(false));
    const go = ctl.addButton(opts.confirmText || 'Delete forever', 'primary', () => {
      if (input.value.trim() === phrase) finish(true);
    });
    go.disabled = true;

    input.addEventListener('input', () => {
      go.disabled = (input.value.trim() !== phrase);
    });
    const off = ctl.keys(() => finish(false), () => { if (!go.disabled) finish(true); });
    setTimeout(() => input.focus(), 40);
  });
}

export function prompt(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || 'Enter a value',
      icon: opts.icon || '\u270E',
      accent: opts.accent || 'info',
      sub: opts.sub,
      width: opts.width
    });
    if (opts.message) _para(ctl.body, opts.message);

    const wrap = document.createElement('div');
    wrap.className = 'fld';
    wrap.innerHTML =
      (opts.label ? '<label>' + _esc(opts.label) + '</label>' : '') +
      (opts.multiline
        ? '<textarea spellcheck="true"></textarea>'
        : '<input type="text" autocomplete="off">') +
      '<div class="err"></div>';
    ctl.body.appendChild(wrap);

    const input = wrap.querySelector(opts.multiline ? 'textarea' : 'input');
    const err = wrap.querySelector('.err');
    input.value = opts.value == null ? '' : String(opts.value);
    if (opts.placeholder) input.placeholder = opts.placeholder;

    const finish = (val) => {
      off();
      ctl.close(() => {
        if (val != null && opts.onSubmit) opts.onSubmit(val);
        if (val == null && opts.onCancel) opts.onCancel();
        resolve(val);
      });
    };
    const submit = () => {
      const v = input.value.trim();
      if (opts.required && !v) { err.textContent = 'Required.'; input.focus(); return; }
      if (typeof opts.validate === 'function') {
        const msg = opts.validate(v);
        if (msg) { err.textContent = msg; input.focus(); return; }
      }
      finish(v);
    };
    const off = ctl.keys(() => finish(null), submit);

    ctl.addButton(opts.cancelText || 'Cancel', 'ghost', () => finish(null));
    ctl.addButton(opts.confirmText || 'Save', 'primary', submit);
    setTimeout(() => { input.focus(); input.select && input.select(); }, 40);
  });
}

/** Three-button leave dialog. Resolves 'save' | 'discard' | 'cancel'. */
export function leave(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || 'Unsaved changes',
      icon: opts.icon || '\u2691',
      accent: 'warn',
      sub: opts.sub,
      width: opts.width || 470
    });
    _para(ctl.body, opts.message || 'You have changes that are not saved yet.');
    if (opts.detail) _para(ctl.body, opts.detail, true);

    const finish = (r) => {
      off();
      ctl.close(() => {
        if (opts.onResult) opts.onResult(r);
        resolve(r);
      });
    };
    const off = ctl.keys(() => finish('cancel'), null);

    ctl.addButton(opts.cancelText || 'Cancel \u2014 go back', 'ghost', () => finish('cancel'));
    ctl.addButton(opts.discardText || 'Leave without saving', 'ghost', () => finish('discard'));
    ctl.addButton(opts.saveText || 'Save & Leave', 'primary', () => finish('save')).focus();
  });
}

/**
 * Progress. Returns a handle synchronously — no promise, because the caller
 * drives it. handle.update(pct|null, statusText) · handle.close().
 * pct null/undefined = indeterminate.
 */
export function progress(opts) {
  opts = opts || {};
  const ctl = _mount({
    title: opts.title || 'Working\u2026',
    icon: opts.icon || '\u21BB',
    accent: opts.accent || 'info',
    sub: opts.sub,
    /* S497: no ✕. A progress dialog must not be dismissed mid-operation — the
       same reason it has no Esc. Hiding the button is honest; showing a dead
       one is not. Cancellation, where the caller supports it, is the explicit
       Cancel button below. */
    dismissable: false,
    width: opts.width || 420
  });
  if (opts.message) _para(ctl.body, opts.message);

  const bar = document.createElement('div');
  bar.className = 'bar indet';
  bar.innerHTML = '<i></i>';
  ctl.body.appendChild(bar);

  const stat = document.createElement('div');
  stat.className = 'pstat';
  stat.textContent = opts.status || '';
  ctl.body.appendChild(stat);

  let cancelled = false;
  let cancelBtn = null;
  if (opts.cancellable) {
    cancelBtn = ctl.addButton(opts.cancelText || 'Cancel', 'ghost', () => {
      cancelled = true;
      stat.textContent = 'Cancelling\u2026';
      cancelBtn.disabled = true;
    });
  }
  // No Esc-to-close: a progress dialog must not be dismissed mid-operation.

  return {
    update(pct, status) {
      if (pct == null) bar.classList.add('indet');
      else {
        bar.classList.remove('indet');
        const v = Math.max(0, Math.min(100, Number(pct) || 0));
        bar.firstElementChild.style.width = v + '%';
      }
      if (status != null) stat.textContent = String(status);
    },
    get cancelled() { return cancelled; },
    close() { ctl.close(); }
  };
}

/**
 * Form. fields: [{key,label,type,value,placeholder,required,options,hint}]
 * type: text | textarea | number | date | select | checkbox
 * Resolves an object of values, or null on cancel.
 */
export function form(opts) {
  opts = opts || {};
  const fields = Array.isArray(opts.fields) ? opts.fields : [];
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || 'Details',
      icon: opts.icon || '\u270E',
      accent: opts.accent || 'info',
      width: opts.width || 520
    });
    if (opts.message) _para(ctl.body, opts.message);

    const inputs = {};
    fields.forEach((f) => {
      const wrap = document.createElement('div');
      wrap.className = 'fld';
      let inner = f.label ? '<label>' + _esc(f.label) + '</label>' : '';
      if (f.type === 'textarea') inner += '<textarea></textarea>';
      else if (f.type === 'select') {
        inner += '<select>' + (f.options || []).map((o) => {
          const val = (o && typeof o === 'object') ? o.value : o;
          const lab = (o && typeof o === 'object') ? o.label : o;
          return '<option value="' + _esc(val) + '">' + _esc(lab) + '</option>';
        }).join('') + '</select>';
      }
      else if (f.type === 'checkbox') inner += '<input type="checkbox">';
      else inner += '<input type="' + _esc(f.type || 'text') + '">';
      inner += '<div class="err"></div>';
      wrap.innerHTML = inner;
      ctl.body.appendChild(wrap);

      const el = wrap.querySelector('input,textarea,select');
      if (f.type === 'checkbox') el.checked = !!f.value;
      else el.value = f.value == null ? '' : String(f.value);
      if (f.placeholder) el.placeholder = f.placeholder;
      inputs[f.key] = { el, wrap, def: f };
    });

    const finish = (val) => {
      off();
      ctl.close(() => {
        if (val && opts.onSubmit) opts.onSubmit(val);
        if (!val && opts.onCancel) opts.onCancel();
        resolve(val);
      });
    };
    const submit = () => {
      const out = {};
      let bad = null;
      Object.keys(inputs).forEach((k) => {
        const { el, wrap, def } = inputs[k];
        const errEl = wrap.querySelector('.err');
        errEl.textContent = '';
        const v = (def.type === 'checkbox') ? el.checked : el.value.trim();
        if (def.required && (v === '' || v === false)) {
          errEl.textContent = 'Required.';
          if (!bad) bad = el;
        } else if (typeof def.validate === 'function') {
          const msg = def.validate(v, out);
          if (msg) { errEl.textContent = msg; if (!bad) bad = el; }
        }
        out[k] = v;
      });
      if (bad) { bad.focus(); return; }
      finish(out);
    };
    const off = ctl.keys(() => finish(null), submit);

    ctl.addButton(opts.cancelText || 'Cancel', 'ghost', () => finish(null));
    ctl.addButton(opts.submitText || 'Save', 'primary', submit);

    const first = fields.length ? inputs[fields[0].key].el : null;
    if (first) setTimeout(() => first.focus(), 40);
  });
}

/**
 * Pick list. items: [{id,label,sub,disabled}]
 * multi:false → resolves an id (or null). multi:true → resolves an array.
 */
export function pickList(opts) {
  opts = opts || {};
  const items = Array.isArray(opts.items) ? opts.items : [];
  const multi = !!opts.multi;
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || 'Choose',
      icon: opts.icon || '\u2261',
      accent: opts.accent || 'info',
      sub: opts.sub,
      width: opts.width || 480
    });
    if (opts.message) _para(ctl.body, opts.message);

    const list = document.createElement('div');
    list.className = 'list';
    ctl.body.appendChild(list);

    const picked = new Set(
      Array.isArray(opts.selected) ? opts.selected : (opts.selected != null ? [opts.selected] : [])
    );

    const finish = (val) => {
      off();
      ctl.close(() => {
        if (val != null && opts.onPick) opts.onPick(val);
        if (val == null && opts.onCancel) opts.onCancel();
        resolve(val);
      });
    };

    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'row';
      b.type = 'button';
      b.disabled = !!it.disabled;
      b.innerHTML = '<span>' + _esc(it.label) +
        (it.sub ? '<span class="sub">' + _esc(it.sub) + '</span>' : '') + '</span>';
      b.setAttribute('aria-selected', picked.has(it.id) ? 'true' : 'false');
      b.addEventListener('click', () => {
        if (multi) {
          if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id);
          b.setAttribute('aria-selected', picked.has(it.id) ? 'true' : 'false');
        } else {
          finish(it.id);
        }
      });
      list.appendChild(b);
    });

    const off = ctl.keys(() => finish(null), null);
    ctl.addButton(opts.cancelText || 'Cancel', 'ghost', () => finish(null));
    if (multi) {
      ctl.addButton(opts.confirmText || 'Select', 'primary', () => finish(Array.from(picked)));
    }
  });
}

/* ── panel — custom-body dialog on the shared chrome (v1.2.0, S497) ──
   Mark ordered every hand-built modal in every tool migrated onto the engine;
   most of the ~24 Diesel sites carry bodies no fixed family can express
   (camera-permission help, QR code, boot guards, diagnostics HTML). This
   family supplies the ONE missing capability — a caller-built body — while
   the engine keeps everything that must stay uniform: header (wash + hairline
   + ✕), footer discipline (cancel-kind leftmost), theming, touch targets,
   scroll lock, Esc/✕ parity.

   build(bodyEl, api) constructs the body. DOM construction is the intended
   style; innerHTML is possible but the CALLER owns escaping (same trust rule
   _aConfirmHtml had — trusted internal markup only, never user input).

   dismissable:false = no ✕, no Esc, no scrim path: for HARD guards (a boot
   block, a lock screen) the only exits are the buttons the caller declares.
   Do NOT use it for convenience — an inspector must normally always have a
   way out of a dialog.

   Buttons resolve the promise via api.close(value); Esc/✕ resolve null.
   A button with no onClick closes with its `value` (default null). An
   onClick may keep the panel open by returning false. */
export function panel(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const ctl = _mount({
      title: opts.title || '',
      sub: opts.sub,
      icon: opts.icon || 'i',
      accent: opts.accent || 'slate',
      width: opts.width || 440,
      dismissable: opts.dismissable !== false
    });
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      off();
      ctl.close(() => resolve(val === undefined ? null : val));
    };
    const api = {
      body: ctl.body,
      close: finish,
      button(label) {          // look up a declared button to enable/disable
        return btns[label] || null;
      }
    };
    const btns = {};
    const list = (Array.isArray(opts.buttons) && opts.buttons.length)
      ? opts.buttons
      : [{ label: 'Close', kind: 'cancel' }];
    // Cancel-kind first so the engine's leftmost rule holds regardless of the
    // order the caller wrote them in.
    list.slice().sort((a, b) =>
      (a.kind === 'cancel' ? -1 : 0) - (b.kind === 'cancel' ? -1 : 0)
    ).forEach((b) => {
      const el = ctl.addButton(b.label, b.kind === 'primary' ? 'primary' : 'normal', () => {
        if (b.onClick) {
          const r = b.onClick(api);
          if (r === false) return;      // caller kept it open
          if (r !== undefined) { finish(r); return; }
        }
        finish(b.value !== undefined ? b.value : null);
      });
      if (b.disabled) el.disabled = true;
      btns[b.label] = el;
    });
    if (typeof opts.build === 'function') opts.build(ctl.body, api);
    /* S621 (additive, backwards-compatible). onDismiss lets a caller KEEP the
       ✕ and Esc while routing them through its own guard instead of closing
       silently. Before this, a panel with unsaved work had only two options:
       dismissable:true and risk losing the work, or dismissable:false and lose
       the ✕ entirely — which is what Edit Project chose, and why it had no
       close button. No existing caller passes onDismiss, so every other dialog
       behaves exactly as before. */
    const _dismiss = (opts.dismissable === false)
      ? null
      : (typeof opts.onDismiss === 'function' ? () => opts.onDismiss(api) : () => finish(null));
    const off = ctl.keys(_dismiss, null);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   Namespace export. Tools may call either style.
   ══════════════════════════════════════════════════════════════════════════ */

export const Dlg = {
  VERSION: DIALOG_ENGINE_VERSION,
  alert, confirm, confirmDanger, typeToConfirm, prompt, leave, progress, form,
  pickList, panel
};

export default Dlg;
