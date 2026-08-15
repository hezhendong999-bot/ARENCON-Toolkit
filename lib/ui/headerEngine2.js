/* ════════════════════════════════════════════════════════════════════
 * ARENCON HEADER ENGINE v2 — SEALED MODULE (S460 contract)
 * ────────────────────────────────────────────────────────────────────
 * Architecture (LOCKED_SHARED_ENGINE_CONTRACT_S460):
 *  • Shadow DOM: header, menus, drawer, backdrop render inside a shadow
 *    root. Host CSS cannot restyle engine internals; engine CSS cannot
 *    leak out. No per-tool override blocks, ever.
 *  • API contract replaces the v1 ID contract: hosts NEVER reach into
 *    engine DOM. Everything dynamic goes through the returned controller
 *    (ctl.setHubMode / setCloud / setStorage / setInspector / setUndoRedo /
 *    setTheme / setTitle). See API table at bottom of file.
 *  • Lifecycle contract: after mount the engine sets
 *    window.ArenconHeader = { ctl, ready } and dispatches
 *    'arencon:header-ready' on document. Hosts must not touch the header
 *    before ready. (Parse-time dereference of engine internals is a
 *    documented host violation.)
 *  • Z-band contract:  0–4999 host content/sticky section chrome ·
 *    5000–9999 host app-header chrome · 10000–10099 ENGINE CHROME
 *    (menus 10000 · backdrop 10009 · drawer 10010 · export pill 10050) ·
 *    10100+ host lightboxes/modals. Exported as Z_BAND.
 *  • Config shape is IDENTICAL to v1 (lib/ui/headerConfigs.js factories
 *    are consumed unchanged): {title, logoSrc, homeHref, onBack, onHome,
 *    defaultTheme, actions:[{key,type,label,icon,iconLight,iconDark,
 *    title,bg,items,dim,foldRank,exemptUntilLast,isSignout,hubOnly,...}]}
 *  • Fold model (S448, Mark's spec, unchanged): declared order == bar
 *    order; fold by foldRank ascending; exemptUntilLast (QR, day-night)
 *    survive until nothing else is left; drawer lists folded controls in
 *    DECLARED order (same DOM nodes relocated); Sign Out pinned last.
 * ════════════════════════════════════════════════════════════════════ */

export const ENGINE2_VERSION = '2.11.1';

export const Z_BAND = Object.freeze({
  HOST_CONTENT_MAX: 4999,
  HOST_HEADER_MIN: 5000,
  HOST_HEADER_MAX: 9999,
  ENGINE_MIN: 10000,
  MENU: 10000,
  BACKDROP: 10009,
  DRAWER: 10010,
  EXPORT_PILL: 10050,
  ENGINE_MAX: 10099,
  HOST_MODAL_MIN: 10100
});

const THEME_KEY = 'arencon-theme';

/* ────────────────────────────────────────────────────────────────────
 * PURE FOLD SOLVER — exported for the regression harness.
 * items:  [{key, foldRank=50, exemptUntilLast=false, isSignout=false}]
 *         in DECLARED order.
 * widths: {key: px} measured bar widths (incl. gap share).
 * avail:  px available for action controls.
 * Returns {visible:[key...], folded:[key...]} — `folded` is DECLARED
 * order (drawer render order, before signout pinning); `visible` is
 * declared order.
 * Algorithm: while total > avail, fold the not-yet-folded control with
 * the LOWEST foldRank; exemptUntilLast controls are only foldable once
 * every non-exempt control is already folded. Ties fold rightmost first.
 * ──────────────────────────────────────────────────────────────────── */
export function computeFold(items, widths, avail){
  const state = items.map((it, i) => ({
    key: it.key, i,
    rank: (it.foldRank == null ? 50 : it.foldRank),
    exempt: !!it.exemptUntilLast,
    group: it.foldGroup || null,
    w: widths[it.key] || 0,
    folded: false
  }));
  const total = () => state.reduce((s, x) => s + (x.folded ? 0 : x.w), 0);
  const foldable = (allowExempt) =>
    state.filter(x => !x.folded && (allowExempt || !x.exempt));
  let guard = state.length + 1;
  while (total() > avail && guard-- > 0){
    let pool = foldable(false);
    if (!pool.length) pool = foldable(true);
    if (!pool.length) break;
    pool.sort((a, b) => (a.rank - b.rank) || (b.i - a.i));
    pool[0].folded = true;
  }
  /* S488 (Mark): FOLD GROUPS — members fold together. The small icon trio
     (QR / text-size / day-night) shares one drawer row; folding only part of
     it left a single button stretched across the row and the others stranded
     in the bar. Folding MORE never overflows, so this normalization is safe. */
  const groups = {};
  state.forEach(x => { if (x.group) (groups[x.group] = groups[x.group] || []).push(x); });
  Object.keys(groups).forEach(g => {
    if (groups[g].some(x => x.folded)) groups[g].forEach(x => { x.folded = true; });
  });
  return {
    visible: state.filter(x => !x.folded).map(x => x.key),
    folded:  state.filter(x =>  x.folded).map(x => x.key)
  };
}

/* ── scoped stylesheet (lives INSIDE the shadow root) ─────────────── */

/* ══ SHARED MENU — ONE implementation (S580) ══════════════════════════════
   The dropdown used by the header bar (More / Reports / AI) AND by any
   light-DOM host that needs the same menu — currently the FRT drawing
   viewer's ⋯ button. Mark, S579, after four rounds of a private copy being
   "matched" to this one: a shared engine means ONE implementation, not a
   matching copy. Anything that wants this menu calls buildSharedMenu();
   nothing re-derives these values.
   `dark` is the selector PREFIX for dark mode: the shadow header passes
   '__DARK__', a light-DOM host passes 'body.dark-mode'. */
export function menuCSS(dark, z){
  return `
.mwrap{ position:relative; display:inline-flex; }
.menu{ display:none; position:absolute; right:0; top:100%; margin-top:4px;
  background:#fff; border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,.18);
  min-width:220px; z-index:${'${'}Z_MENU}; overflow:hidden; font-family:Calibri,sans-serif; }
.menu.open{ display:block; }
.menu button{ display:block; width:100%; padding:10px 14px; border:none; background:none;
  text-align:left; font:400 calc(13px + var(--ts)) Calibri,sans-serif; color:#2F3B52; }
.menu button:hover{ background:#F2F0F4; }
.menu button span{ display:block; font-size:calc(11px + var(--ts)); color:#8A94B0; margin-top:2px; }
.menu .div{ height:1px; background:#eee; margin:2px 0; }
__DARK__ .menu{ background:#16151b; border:1px solid rgba(255,255,255,.12); }
__DARK__ .menu button{ background:#16151b; color:#d0d8f0; }
__DARK__ .menu button:hover{ background:#221f29; }
__DARK__ .menu button span{ color:#8a94b0; }
/* ═══ S488 Wave 3 prep — menu item extensions (FRT More menu) ═══ */
.menu button.danger{ color:#C62828; }
__DARK__ .menu button.danger{ color:#ef8a80; }
.menu .rsec-items{ display:none; }
.menu .rsec-items.open{ display:block; }
.menu button.rsec-toggle{ display:flex; align-items:center; justify-content:space-between; }
.menu button.rsec-toggle .caret{ margin-left:auto; font-size:calc(11px + var(--ts));
  opacity:.55; font-weight:400; }
.menu button.admin-only{ display:none; }
`.replace(/__DARK__/g, dark)
   .replace(/\$\{Z_MENU\}/g, String(z || 300));   /* light-DOM hosts get a real z-index; the shadow header substitutes its own band below */
}

/* Build the shared menu DOM. Identical node structure to the header's own
   dropdown because the header now builds through THIS function too. */
/* opts.shadow — build the menu inside a CLOSED-over shadow root (S582).
   The header's dropdown has always been immune to host CSS because the whole
   header lives in a shadow root. A light-DOM host (the FRT drawing viewer)
   had no such protection, so its toolbar's generic `button` rule painted a
   border + pill background on every row — the borders Mark kept seeing, four
   rounds running, even after the markup and CSS came from this module. Giving
   the menu its own shadow root is what actually makes "shared" hold: NO host
   stylesheet can reach in, ever, in any tool that adopts it. */
export function buildSharedMenu(items, opts){
  opts = opts || {};
  const doc = opts.document || document;
  const wrap = doc.createElement('div'); wrap.className = 'mwrap';
  let mount = wrap;
  if (opts.shadow){
    const root = wrap.attachShadow({ mode:'open' });
    root.appendChild(_el('style', null,
      menuCSS(':host([data-theme="dark"])', opts.z || 9600) +
      /* the host element is the positioned/toggled node; the panel inside is
         static so hosts keep controlling placement from their own stylesheet */
      ':host{ display:block; }' +
      '.menu{ position:static !important; display:none; }' +
      ':host(.open) .menu{ display:block; }'));
    mount = root;
  }
  const menu = doc.createElement('div'); menu.className = 'menu';
  (items || []).forEach(mi => {
    if (mi.divider){ const d = doc.createElement('div'); d.className = 'div'; menu.appendChild(d); return; }
    const b = doc.createElement('button');
    const cls = [mi.danger?'danger':'', mi.adminOnly?'admin-only':''].join(' ').trim();
    if (cls) b.className = cls;
    b.innerHTML = mi.label + (mi.sub ? '<span>' + mi.sub + '</span>' : '');
    if (mi.onClick) b.addEventListener('click', ev => { mi.onClick(ev); if (opts.onPick) opts.onPick(); });
    menu.appendChild(b);
  });
  mount.appendChild(menu);
  wrap._menu = menu;
  if (opts.shadow){
    /* keep the shadow's dark switch in sync with the page's own theme flag */
    const syncTheme = () => wrap.setAttribute('data-theme',
      document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    syncTheme();
    try { new MutationObserver(syncTheme).observe(document.body,
      { attributes:true, attributeFilter:['class'] }); } catch (e) {}
  }
  return wrap;
}

/* Inject menuCSS once into a light-DOM host (no-op inside the shadow header,
   which already carries it in its own stylesheet). */
export function ensureSharedMenuCSS(dark, id){
  id = id || 'arencon-shared-menu-css';
  if (document.getElementById(id)) return;
  const st = document.createElement('style');
  st.id = id;
  st.textContent = menuCSS(dark || 'body.dark-mode');
  document.head.appendChild(st);
}

const CSS = `
/* ═══ VERBATIM PORT of the live Diesel header (S460 spec: extraction, not
   redesign — same pixels, sealed home). Sources: .app-header/.header-top/
   .hdr-btn/.hdr-sm/.header-logo/.inspector-chip/.storage-bar/menu rules +
   the inline styles of the original header markup. Only deliberate change:
   the IDB fill keeps the burgundy→cyan gradient (Mark, S460). ═══ */
:host{ all:initial; display:block;
  font-family:Calibri,sans-serif;
  /* S488 FIX (Mark): --ts is NOT defined here. Defining --ts:0px on :host
     SHADOWED the page's text-size variable and deadened S/M/L scaling for
     every control in the sealed header. Custom properties inherit through
     the shadow boundary; every size below uses var(--ts,0px) fallbacks. */
  --chrome2:#221f29; --chrome2-lt:rgba(255,255,255,.14);
  --chrome-rule:rgba(255,255,255,.12);
  --btn-shadow:0 2px 6px rgba(0,0,0,.40);
}
*,*::before,*::after{ box-sizing:border-box; font-family:inherit; }
.bar{ display:flex; align-items:center; justify-content:space-between;
  gap:8px; padding:10px 14px;
  background:linear-gradient(135deg,#1B2438 0%,#243048 100%); color:#fff;
  border-bottom:1px solid rgba(255,255,255,.07);
  box-shadow:0 2px 12px rgba(27,36,56,.4); min-width:0; overflow:visible; }
.left{ display:flex; align-items:center; gap:6px; min-width:0; flex:1; overflow:hidden;
  /* S505b ROOT CAUSE of the flat Back button: overflow:hidden CLIPS children's
     box-shadows at this container's edge — no shadow value could ever survive it
     (which is why S249/S504/S505 'fixes' all failed; they changed the value, not
     the clip). Padding gives shadows room INSIDE the clipped box; the matching
     negative margins cancel the geometry so layout is pixel-identical. The S448
     lock (overflow:hidden itself) is untouched. */
  padding:6px 0 6px 6px; margin:-6px 0 -6px -6px; }
/* S488: overflow:hidden is the S448 lock made structural — 'logo never
   shrinks/overlaps'. Nothing in the left cluster can ever be painted over
   by the actions; if space runs out, the FOLD gives it back, not overlap. */
.actions{ display:flex; gap:8px; align-items:center; flex-shrink:0; position:relative; }
button{ cursor:pointer; }
/* S505 (Mark, rebuild): the Back button is SELF-CONTAINED. Every visual value is
   hardcoded here — box, border, size, and the 3D shadow (0 1px 4px rgba(0,0,0,.2),
   the drawing-viewer shadow Mark approved). NO var() for any of it: the S504
   version read its shadow from a host-page token with a near-invisible fallback,
   so tools that never defined the token (Diesel) rendered Back flat. A shared
   button must not depend on each tool's stylesheet to look right.
   position:relative+z-index give it its own stacking context so no bar
   background/compositing can swallow the shadow (the S249 failure mode). */
.back{ display:none; align-items:center; justify-content:center;
  width:40px; min-width:40px; height:34px;
  background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.12); color:#fff;
  padding:0; border-radius:6px; font:600 calc(16px + var(--ts,0px)) Calibri,sans-serif;
  box-shadow:0 1px 4px rgba(0,0,0,.2); transition:box-shadow .15s,transform .08s,background .15s;
  margin-right:10px; white-space:nowrap; flex-shrink:0;
  position:relative; z-index:1; }
.back.on{ display:inline-flex; }
.back:hover{ background:rgba(255,255,255,.22); }
.back:active{ transform:translateY(1px); box-shadow:0 1px 2px rgba(0,0,0,.22); }
.logo{ display:block; flex-shrink:0; text-decoration:none; }
.logo img{ height:34px; width:auto; background:#fff; padding:3px 7px; border-radius:6px;
  border:1px solid rgba(0,0,0,.08); box-shadow:0 1px 4px rgba(0,0,0,.2); display:block; }
.title{ font:600 calc(19px + var(--ts,0px)) Calibri,sans-serif; letter-spacing:.5px; color:#fff;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:60px;
  /* S488: min-width:60px = the S448 lock 'title truncates via ellipsis but
     NEVER display:none' as a structural floor (matches TITLE_MIN in refit).
     The rule's original trailing min-width:0 (which silently overrode the
     floor — later declaration wins) is deleted; 60px now IS the flex minimum. */ }
.cloud{ display:none; align-items:center; gap:5px;
  font-size:calc(11px + var(--ts)); color:#fff; opacity:.75; flex-shrink:0; white-space:nowrap; }
.cloud.on{ display:inline-flex; }
.cloud .dot{ width:9px; height:9px; border-radius:50%; background:#34D399;
  display:inline-block; flex-shrink:0; transition:background .4s; }
.cloud .dot[data-s="sync"]{ background:#E0A36A; }
.cloud .dot[data-s="err"]{ background:#F87171; }
.cloud .dot[data-s="pull"]{ background:#3B82F6; }
.cloud .dot[data-s="off"]{ background:#9CA3AF; }
/* ═══ S488 Wave 3 prep — FRT live-signal slots (verbatim from live FRT header) ═══ */
.presence{ display:none; align-items:center; gap:5px; font-size:calc(11px + var(--ts));
  padding:4px 10px; border-radius:6px; cursor:pointer; flex-shrink:0;
  color:rgba(255,255,255,.9); background:rgba(122,91,160,.22);
  border:1px solid rgba(122,91,160,.45); white-space:nowrap; }
.presence.on{ display:inline-flex; }
/* S633 presence stack — overlapping circles, a real gap before your own avatar */
.presence{ cursor:pointer; padding:0 2px; background:transparent; border:none; }
.pstack{ display:inline-flex; align-items:center; }
/* S633b breadcrumb — where you are, and the way back up */
.cseg{ background:transparent; border:none; padding:0 1px; font:inherit; color:inherit;
  opacity:.68; cursor:pointer; text-decoration:none; }
.cseg:hover{ opacity:1; text-decoration:underline; }
@media(pointer:coarse){ .cseg:hover{ text-decoration:none; } }
.csep{ opacity:.38; margin:0 5px; flex:0 0 auto; }
/* S633b: the title box clips with an ellipsis — correct for a plain string,
   wrong for a breadcrumb, which is why the tool name vanished and left a bare
   project number. The breadcrumb lays out as flex INSIDE that box: the current
   page never shrinks, and the leading segments give up their width first. */
.crumbbar{ display:none; align-items:center; gap:0; padding:7px 14px;
  font-family:Calibri,sans-serif; font-size:calc(12px + var(--ts,0px));
  background:var(--b-chrome2,rgba(127,127,140,.10));
  border-bottom:1px solid var(--b-chrome-rule,rgba(127,127,140,.28));
  color:inherit; white-space:nowrap; overflow:hidden; }
.crumbbar.on{ display:flex; }
/* the job you are in never gives way; the middle of the path goes first */
@media(max-width:560px){ .crumbbar .cseg:not(:first-child){ display:none; }
  .crumbbar .csep:nth-of-type(n+2){ display:none; } }
.cnow{ font-weight:700; flex:0 0 auto; white-space:nowrap; }
.cseg{ flex:0 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
@media(max-width:560px){ .cseg, .csep{ display:none; } }
/* the current page must never be the thing that disappears */
.cnow{ display:inline !important; }
/* S633b Dashboard entry in the drawer — the explicit replacement for the
   logo click that kept throwing inspectors out of a review */
.ditem{ display:flex; align-items:center; width:100%; background:transparent; border:none;
  border-radius:8px; padding:11px 12px; font-family:Calibri,sans-serif;
  font-size:calc(13px + var(--ts)); color:inherit; cursor:pointer; text-align:left;
  min-height:44px; }
.ditem:hover{ background:rgba(127,127,140,.18); }
@media(pointer:coarse){ .ditem:hover{ background:transparent; } }
.pav{ display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px;
  border-radius:50%; font-family:Calibri,sans-serif; font-size:10px; font-weight:800;
  letter-spacing:-.3px; margin-left:-8px; color:#1B1A22; background:var(--pc,#888);
  border:1px solid rgba(0,0,0,.18); box-shadow:0 0 0 2px var(--b-chrome-bg,#1d1b24); }
.pav:first-child{ margin-left:0; }
:host([data-theme="dark"]) .pav{ color:var(--pc,#888);
  background:color-mix(in srgb,var(--pc,#888) 22%,#1d1b24);
  border-color:color-mix(in srgb,var(--pc,#888) 45%,transparent); }
.pav.pmore{ background:rgba(128,128,128,.28); color:inherit; }
/* S633 your own avatar — rightmost, larger, and separated by a divider so
   nobody has to hunt for which circle is them */
.mediv{ width:1px; height:22px; background:currentColor; opacity:.22; margin:0 8px 0 4px; flex:0 0 auto; }
.meav{ border:none; background:transparent; padding:0; cursor:pointer; line-height:0; flex:0 0 auto; }
.meav .pav{ width:32px; height:32px; font-size:11.5px; margin-left:0; box-shadow:none; }
.r2badge{ display:none; font-size:calc(10px + var(--ts)); font-weight:700;
  padding:2px 8px; border-radius:4px; letter-spacing:.3px; flex-shrink:0;
  white-space:nowrap; color:#fff; }
.r2badge.on{ display:inline-block; }
.savets{ display:none; font-size:calc(10.5px + var(--ts,0px)); color:rgba(255,255,255,.5); margin-right:4px;
  flex-shrink:0; white-space:nowrap; }
.savets.on{ display:inline-block; }
.cloud .csync{ font-size:calc(10px + var(--ts)); margin-left:6px; opacity:.85; }
/* S628 — STALENESS HAS TO BE VISIBLE, AND IT LIVES IN HERE. Mark, three
   minutes in airplane mode: "I don't think this feature exists". It did not
   — the host wrote it with document.getElementById('last-sync-text'), an id
   that has been inside this SHADOW ROOT since the header engine landed, so
   the lookup returned null and the staleness text went nowhere. Host CSS
   could not reach it either. The state belongs to the engine that owns the
   element: attention amber, never red — the data is safe, it just has not
   travelled — and it overrides the .csync fade so a warning cannot be
   quieter than the healthy text it replaces. */
.cloud.is-stale .csync{ opacity:1; font-weight:600; color:#C98A4A; }
/* S629b — live socket: one quiet dot after the text. Info accent, never
   burgundy (reserved for primary actions) and never green (which would read
   as "saved"). Absent when the socket is down, which is the honest default. */
.cloud.is-live .ctext::after{ content:''; display:inline-block; width:5px; height:5px;
  border-radius:50%; background:#2C7FB8; margin-left:5px; vertical-align:middle; }
:host([data-theme="dark"]) .cloud.is-live .ctext::after{ background:#46C5E8; }
:host([data-theme="dark"]) .cloud.is-stale .csync{ color:#E0A36A; }
.hbtn{ display:inline-flex; align-items:center; gap:4px; padding:0 12px; height:34px;
  border-radius:6px; font:600 calc(12px + var(--ts)) Calibri,sans-serif;
  border:none; color:#fff; transition:all .15s; white-space:nowrap;
  background:rgba(255,255,255,.15); }
.hbtn:hover{ filter:brightness(1.15); }
/* ═══ S512 (Mark, demo-approved): every header button reads pressable — the
   coloured CTAs and the user chip get the same shadow discipline the icon
   buttons (.hicon) have carried since S249k. ENGINE-OWNED, hardcoded per
   theme: no host tokens (the S504 lesson — a shared component must not
   depend on a tool's stylesheet to look right). Box-shadow ONLY: no icon,
   markup or colour changes. Press sinks 1px and flattens, matching .back. */
.hbtn, .chip{ box-shadow:0 1px 3px rgba(0,0,0,.35), 0 1px 1px rgba(0,0,0,.22); }
.hbtn:active, .chip:active{ transform:translateY(1px);
  box-shadow:0 1px 1px rgba(0,0,0,.28); }
:host([data-theme="dark"]) .hbtn, :host([data-theme="dark"]) .chip{
  box-shadow:0 1px 3px rgba(0,0,0,.55), 0 1px 1px rgba(0,0,0,.38); }
:host([data-theme="dark"]) .hbtn:active, :host([data-theme="dark"]) .chip:active{
  box-shadow:0 1px 1px rgba(0,0,0,.45); }
.hicon{ background:var(--chrome2-lt); color:#fff; border:1px solid var(--chrome-rule);
  box-shadow:var(--btn-shadow); border-radius:6px; width:34px; height:34px;
  padding:0; font-size:calc(15px + var(--ts)); display:inline-flex;
  align-items:center; justify-content:center; transition:all .15s;
  /* S505b: anchor for .wn-dot (position:absolute). Without this the dot's
     containing block was .actions, so it rendered on the LAST button's corner
     (Sign Out) instead of on the help button that owns it. */
  position:relative; }
.hicon:hover{ background:#9C2742; color:#fff; border-color:#9C2742; }
/* S504 — Help icon button (Treatment B, Mark). The "?" is amber so the button is
   findable at rest without motion; the button itself stays chrome-coloured. The
   wn-dot is the unseen-update signal, hidden until the host calls setControlIcon
   with the .wn-pulse variant, which fires a short 3-cycle pulse then rests. Only
   the Help button carries these classes; adding them here is inert for every
   other tool. The Help icon needs position:relative so the dot can pin to it. */
/* S512 (Mark — explicit go given on this LOCKED file): the word "Help" beside the
   amber "?", across every tool.

   WHY IT LIVES IN CSS AND NOT IN THE ICON HTML: every host overwrites the help
   button's innerHTML whenever it toggles the unseen-content dot, via
   setControlIcon('help', '<span class="help-q">?</span><span class="wn-dot">…').
   A label written into those strings would survive until the first dot flip and
   then silently vanish — in one tool but not another, depending on whether that
   tool had new guide content. As a ::after on the button it cannot be erased by
   any host, present or future, without touching this rule.

   The ID selector is what beats the chrome skin's fixed 34px square width; the
   drawer's width:100% !important still wins over it, so a folded Help button is
   still full-width in the drawer exactly as before.

   TRADEOFF MARK ACCEPTED: a wider button means headers fold to the drawer
   slightly earlier on tablets. */
#btn-help{ position:relative; width:auto; min-width:34px; padding:0 10px; gap:6px; }
#btn-help::after{ content:'Help'; font-size:calc(13px + var(--ts)); font-weight:600;
  letter-spacing:.2px; line-height:1; }
.help-q{ color:#E0872A; font-weight:800; font-size:calc(16px + var(--ts)); line-height:1; }
.hicon:hover .help-q{ color:#fff; }
.wn-dot{ position:absolute; top:2px; right:2px; width:8px; height:8px; border-radius:50%;
  background:#E0872A; box-shadow:0 0 0 2px var(--chrome2-lt); }
.wn-dot.wn-pulse{ animation:wn-pulse 1.8s ease-out 3; }
@keyframes wn-pulse{
  0%{ box-shadow:0 0 0 0 rgba(224,135,42,.55), 0 0 0 2px var(--chrome2-lt); }
  70%{ box-shadow:0 0 0 7px rgba(224,135,42,0), 0 0 0 2px var(--chrome2-lt); }
  100%{ box-shadow:0 0 0 0 rgba(224,135,42,0), 0 0 0 2px var(--chrome2-lt); } }
.is-dim{ opacity:.4; }
.navg{ display:inline-flex; gap:4px; flex-shrink:0; }
.chip{ display:inline-flex; align-items:center; gap:5px; padding:3px 10px;
  background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25);
  border-radius:16px; font:600 calc(11px + var(--ts)) Calibri,sans-serif;
  color:rgba(255,255,255,.85); cursor:pointer; transition:all .15s;
  white-space:nowrap; max-width:140px; overflow:hidden; text-overflow:ellipsis;
  flex-shrink:0; height:auto; }
.chip:hover{ background:rgba(255,255,255,.25); }
/* S633b (Mark: "remove the box around IDB as well, I never liked it").
   The bar and its label ARE the object; the chip around them only added weight
   to a header that is short of room on a tablet. Same reasoning as presence. */
.meter{ display:inline-flex; align-items:center; gap:5px; padding:3px 2px;
  background:transparent; border-radius:0; cursor:help; border:none; }
.meter .track{ width:48px; height:5px; background:rgba(255,255,255,.2);
  border-radius:3px; overflow:hidden; }
.meter .fill{ height:100%; width:0%; border-radius:3px; transition:width .4s;
  background:linear-gradient(90deg,#9C2742,#46C5E8); }
.meter .lab{ font-size:calc(9px + var(--ts)); color:rgba(255,255,255,.45); white-space:nowrap; }
${'${'}MENU_CSS}
:host([data-admin="1"]) .menu button.admin-only{ display:block; }
.more{ display:none; }
.more.has-folded{ display:inline-flex; }
.backdrop{ display:none; position:fixed; inset:0; background:rgba(0,0,0,.55);
  z-index:${'${'}Z_BACKDROP}; }
.backdrop.open{ display:block; }
.drawer{ display:none; position:fixed; top:0; right:0; height:100%;
  width:min(320px,86vw); background:linear-gradient(160deg,#1B2438 0%,#243048 100%);
  color:#fff; border-left:1px solid rgba(255,255,255,.12);
  box-shadow:-4px 0 24px rgba(0,0,0,.28); z-index:${'${'}Z_DRAWER};
  flex-direction:column; padding:14px; gap:8px; overflow-y:auto; }
.drawer.open{ display:flex; }
/* ═══ DRAWER CHILDREN — VERBATIM PORT of the S455 v1 spec (lib/css/chrome.css
   .oflow-drawer rules, "Mark's spec: NODE-RELOCATION — the drawer holds the
   REAL header controls so they look IDENTICAL to the bar"). v2 had re-invented
   this block; the deviations Mark caught (tiny icon squares, unstyled chip)
   trace to that re-invention plus a chrome-skin specificity trap: the skin's
   :host([data-skin]) .hicon width rule outranked .drawer .hicon and re-shrank
   icons inside the drawer. Selectors below carry :host to outrank skins. */
:host .drawer > *{ width:100%; box-sizing:border-box; flex:0 0 auto; }
:host .drawer .mwrap{ position:relative; display:flex; flex-direction:column; width:100%; }
:host .drawer .mwrap > .hbtn,
:host .drawer > .hbtn{ width:100%; justify-content:center; min-height:46px;
  border-radius:10px; font-size:calc(14px + var(--ts,0px)); height:auto; }
:host .drawer > .hicon{ width:100% !important; justify-content:center; min-height:46px;
  /* !important is v1-verbatim (chrome.css .oflow-drawer > .hdr-icon) — it exists
     precisely to beat the skin's fixed square width on specificity ties. */
  border-radius:10px; border:1px solid var(--b-chrome-rule,#D2CEDB);
  background:var(--b-chrome2,#EFEDF0); }
:host .drawer > .meter,
:host .drawer > .chip,
:host .drawer > .navg{ width:100%; justify-content:center; min-height:46px; border-radius:10px; }
:host .drawer > .chip{ max-width:none !important; height:auto;
  /* !important: the chrome-skin pill's max-width:140 wins the specificity tie
     by sheet order; v1's drawer chip is full-width (chrome.css .oflow-drawer). */ }
:host .drawer .menu{ position:static !important; right:auto !important; top:auto !important;
  width:100%; margin:6px 0 0; box-shadow:none;
  border:1px solid var(--b-chrome-rule,#D2CEDB); border-radius:10px; }
:host .drawer .signout-pin{ margin-top:auto; }
/* S488 (Mark): small icon controls (QR / day-night / text-size) share ONE row,
   three across, total width = the big buttons. IDB meter sits directly above. */
:host .drawer .iconrow{ display:flex; gap:8px; width:100%; flex:0 0 auto; }
:host .drawer .iconrow > .hicon{ flex:1; width:auto !important; min-height:46px;
  border-radius:10px; border:1px solid var(--b-chrome-rule,#D2CEDB);
  background:var(--b-chrome2,#EFEDF0); justify-content:center; }
.hide{ display:none !important; }
/* S488 FIX (Mark): the hamburger has no job when nothing is folded — on a
   desktop where everything fits it must not exist. (S479 law, generalized
   to real-pixel terms: visibility = fold state, not a breakpoint.) */
.more:not(.has-folded){ display:none; }
/* ═══ CHROME SKIN (S488 Wave 1) — verbatim port of lib/css/chrome.css control
   rules for hosts whose live header is the Bold chrome (Electric today; FRT in
   Wave 3). Token values inherit from the HOST (:root / body.dark-mode define
   --b-chrome-* and --hdr-*; custom properties pierce the shadow boundary and
   are NOT reset by all:initial). Fallbacks = the S455 light values. Navy skin
   (default) is untouched — Diesel canon preserved. ═══ */
:host([data-skin="chrome"]) .bar{
  background:var(--b-chrome-bg,#E6E3E9); color:var(--b-chrome-fg,#1B1A22);
  border-bottom:1px solid var(--b-chrome-rule,#D2CEDB);
  box-shadow:0 1px 3px rgba(40,30,50,.10);
  padding:8px 14px; gap:var(--hdr-gap,6px); }
:host([data-skin="chrome"][data-theme="dark"]) .bar{ box-shadow:0 2px 12px rgba(0,0,0,.5); }
:host([data-skin="chrome"]) .title{
  font:600 calc(17px + var(--ts)) Calibri,sans-serif; letter-spacing:.5px;
  color:var(--b-chrome-fg,#1B1A22); }
:host([data-skin="chrome"]) .back{
  /* S627 (Mark, on-device: "why is the back button white at night") — BACK IS
     NO LONGER THE EXCEPTION ON THIS BAR. It was the only chrome control still
     holding literal colours: .hicon beside it reads these same three tokens
     and therefore follows the mode, .back could not, so on a night header it
     sat there as a white tile while everything around it went dark. There is
     no night rule for .back and there must not be one — a second hardcode is
     the same bug with a longer fuse. One rule, tokens switch, both modes.
     The S505 concern was never the token: it was a fallback so faint that a
     host which defined nothing rendered Back flat. That protection is kept —
     these fallbacks ARE the day values, so a host defining nothing still gets
     exactly the button S505 specified. All four hosts (FRT, Diesel, Electric,
     Hub) define the full set in both modes, verified at S627. */
  background:var(--b-chrome2,#EFEDF0); border:1px solid var(--b-chrome-rule,#D2CEDB);
  color:var(--b-chrome-fg,#1B1A22);
  height:34px; flex:0 0 40px; width:40px; min-width:40px;
  padding:0; justify-content:center; border-radius:6px;
  box-shadow:0 1px 4px rgba(0,0,0,.2);
  position:relative; z-index:1; }
:host([data-skin="chrome"]) .back:hover{ background:var(--b-chrome-hover,rgba(0,0,0,.05)); }

/* ═══ S551 — SMALL SCREENS KEEP THE CONTROLS, NOT THE DECORATION (Mark) ═══
   On a phone-width screen the logo held roughly a third of the bar and never
   gave any of it back, so undo and redo — the two controls an inspector reaches
   for most on site — were the things pushed into the drawer. Mark's spec: back,
   logo, undo/redo and the menu stay outside; everything else is lower priority.

   .narrow / .xnarrow are set by refit from the bar's own width, not a media
   query: this header lives in a shadow root inside tools that are also embedded,
   so the VIEWPORT width is not the width that matters — the bar's is. */
:host .bar.narrow .logo img{ height:26px; padding:2px 5px; }
/* S448/S488 held that the title truncates but is NEVER hidden. Mark has
   overridden that below 480px: "Diese…" tells nobody anything the project bar
   underneath does not already say, and the room it costs is the room undo and
   redo need. The floor still applies at every width above this. */
:host .bar.xnarrow .title{ display:none; }
/* The glyph sat high in its button: the font shorthand resets line-height to
   normal, and Calibri's arrow does not sit centred on that box. */
:host .back{ line-height:1; }
:host([data-skin="chrome"]) .cloud{ color:var(--b-chrome-fg,#1B1A22); }
:host([data-skin="chrome"]) .hicon{
  background:var(--b-chrome2,#EFEDF0); border:1px solid var(--b-chrome-rule,#D2CEDB);
  color:var(--b-chrome-fg,#1B1A22); border-radius:var(--hdr-radius,6px);
  width:var(--hdr-h,34px); height:var(--hdr-h,34px);
  /* S514 (Mark): fallback hardened .08 -> the real shadow. The Hub never
     defines --b-btn-shadow, so the weak fallback rendered as "no shadow" —
     the S504 pattern again; the S511 audit missed it by checking only .back. */
  box-shadow:0 1px 4px rgba(0,0,0,.25); }  /* S517: UNCONDITIONAL — six rounds proved token resolution in host pages cannot be trusted; there is now nothing to resolve */
:host([data-skin="chrome"]) .hicon:hover{
  filter:brightness(1.12); background:var(--b-chrome-hover,rgba(0,0,0,.05));
  color:var(--b-chrome-fg,#1B1A22); border-color:var(--b-chrome-rule,#D2CEDB); }
:host([data-skin="chrome"]) .hbtn{ height:var(--hdr-h,34px);
  padding:0 var(--hdr-px,12px); border-radius:var(--hdr-radius,6px); }
:host([data-skin="chrome"]) .chip{
  /* S488 FIX (Mark): the inspector chip is HIS pill — live FRT winning rules
     (base r16 pill + the S259 day-mode override: white bg, #D2CEDB border,
     dark text, button shadow). Not the squared r6 chrome button. */
  background:#FFFFFF; border:1px solid #D2CEDB; border-radius:16px;
  color:#1B1A22; font-size:calc(11px + var(--ts,0px)); font-weight:600;
  height:auto; padding:3px 10px; max-width:140px;
  box-shadow:0 1px 4px rgba(0,0,0,.25); }  /* S517: unconditional, see .hicon note */
:host([data-skin="chrome"]) .chip:hover{ background:rgba(0,0,0,.03); }
:host([data-skin="chrome"][data-theme="dark"]) .chip{
  background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25);
  color:rgba(255,255,255,.85); box-shadow:none; }
:host([data-skin="chrome"][data-theme="dark"]) .chip:hover{ background:rgba(255,255,255,.25); }
:host([data-skin="chrome"]) .meter{
  background:transparent; border:none;
  border-radius:0; height:var(--hdr-h,34px); padding:0 4px; }
:host([data-skin="chrome"]) .meter .track{ background:rgba(120,120,140,.28); }
:host([data-skin="chrome"]) .meter .fill{ background:#5F8068; }
:host([data-skin="chrome"]) .meter .lab{ color:var(--b-chrome-fg,#1B1A22); opacity:.55; }
:host([data-skin="chrome"]) .menu button:hover{ background:var(--b-chrome-hover,rgba(0,0,0,.05)); }
:host([data-skin="chrome"]) .drawer{
  background:var(--b-chrome-bg,#E6E3E9); color:var(--b-chrome-fg,#1B1A22);
  border-left:1px solid var(--b-chrome-rule,#D2CEDB); }
:host([data-skin="chrome"]) .drawer .hicon{
  border:1px solid var(--b-chrome-rule,#D2CEDB); background:var(--b-chrome2,#EFEDF0); }
/* ═══ PROJECT BAR (S488 Wave 1, roadmap: "belongs INSIDE the header module
   scope") — verbatim port of Electric's .project-bar (host lines 631-637). ═══ */
.pbar{ display:none; align-items:center; gap:8px; padding:6px 14px;
  font-family:Calibri,'Segoe UI',system-ui,sans-serif; background:#2C3E50;
  border-top:1px solid rgba(255,255,255,.06); min-height:32px; flex-wrap:wrap; }
.pbar.on{ display:flex; }
.pbar .pfn{ font-size:calc(12px + var(--ts)); font-weight:500;
  color:rgba(255,255,255,.88); min-width:0; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap; flex:1; padding:2px 6px; border-radius:4px; }
.pbar .pbdg{ font-size:calc(9px + var(--ts)); font-weight:700; padding:2px 8px;
  border-radius:4px; color:#fff; text-transform:uppercase; letter-spacing:.5px;
  flex-shrink:0; white-space:nowrap; cursor:pointer; border:none;
  transition:filter .15s,transform .15s; background:#6B7280; }
.pbar .pbdg:hover{ filter:brightness(1.15); transform:scale(1.04); }
:host([data-theme="dark"]) .pbar{ background:#151a24; border-top-color:rgba(255,255,255,.04); }
@media(max-width:600px){ .pbar .pfn{ white-space:normal; -webkit-line-clamp:2;
  display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; } }
`;

function _el(tag, attrs, html){
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs){ if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
  if (html != null) e.innerHTML = html;
  return e;
}

/* ── control builders (config shape identical to v1) ───────────────── */
function _mkControl(item, closeMenus){
  const t = item.type;
  if (t === 'menu'){
    const wrap = _el('div', { 'class':'mwrap' });
    const btn = _el('button', { 'class':'hbtn', title:item.title || null });
    if (item.bg) btn.style.background = item.bg, btn.style.color = '#fff', btn.style.borderColor = 'transparent';
    btn.innerHTML = item.label;
    /* S580: the plain rows are built by the SHARED builder (buildSharedMenu),
       the same function the FRT drawing viewer calls — one implementation, not
       a matching copy. The repairSection below stays engine-local: it is
       header-only chrome with its own collapse behaviour. */
    const menu = _el('div', { 'class':'menu' });
    (item.items || []).forEach(mi => {
      if (mi.divider || (!mi.repairSection && !mi.hubOnly)){
        const built = buildSharedMenu([mi], { onPick: closeMenus });
        while (built._menu.firstChild) menu.appendChild(built._menu.firstChild);
        return;
      }
      if (mi.repairSection){
        /* S488: collapsible Repair section (FRT More menu, verbatim behavior:
           collapsed by default, caret toggles, admin-only items gated by
           ctl.setAdmin, whole section hidden until setHubMode({hub:true})). */
        const sec = _el('div', {});
        const tog = _el('button', { 'class':'rsec-toggle' },
          (mi.label || '🔧 Repair') + '<span class="caret">▸</span>');
        const box = _el('div', { 'class':'rsec-items' });
        (mi.repairItems || []).forEach(ri => {
          const rb = _el('button', { 'class': ri.adminOnly ? 'admin-only' : null });
          rb.innerHTML = ri.label + (ri.sub ? '<span>' + ri.sub + '</span>' : '');
          if (ri.onClick) rb.addEventListener('click', ev => { ri.onClick(ev); closeMenus(); });
          box.appendChild(rb);
        });
        tog.addEventListener('click', ev => { ev.stopPropagation();
          const open = box.classList.toggle('open');
          tog.querySelector('.caret').textContent = open ? '▾' : '▸'; });
        sec.appendChild(tog); sec.appendChild(box);
        sec.appendChild(_el('div', { 'class':'div' }, ''));
        if (mi.hubOnly){ tog._hubOnly = true; tog.classList.add('hide'); }
        if (mi.adminOnly){ tog.classList.add('admin-only'); }   /* S488: FRT S284 — Repair is super-admin only */
        menu.appendChild(sec);
        return;
      }
      const b = _el('button', { 'class': [mi.danger?'danger':'', mi.adminOnly?'admin-only':''].join(' ').trim() || null });
      b.innerHTML = mi.label + (mi.sub ? '<span>' + mi.sub + '</span>' : '');
      if (mi.hubOnly){ b._hubOnly = true; b.classList.add('hide'); }  /* S488: hubOnly items hidden until setHubMode({hub:true}) — v1 parity */
      if (mi.onClick) b.addEventListener('click', ev => { mi.onClick(ev); closeMenus(); });
      menu.appendChild(b);
    });
    btn.addEventListener('click', ev => { ev.stopPropagation();
      const was = menu.classList.contains('open'); closeMenus();
      if (!was) menu.classList.add('open'); });
    wrap.appendChild(btn); wrap.appendChild(menu);
    wrap._menu = menu;
    return wrap;
  }
  if (t === 'icon'){
    const ib = _el('button', { 'class':'hicon' + (item.dim ? ' is-dim' : ''), title:item.title || null });
    /* S512: apply the configured id. Every config declares one (id:'btn-help',
       'btn-undo', 'btn-redo'…) but the engine only ever looked controls up by
       KEY, so the id was silently dropped and the stylesheet's own #btn-help
       rule has never matched anything. Ids are scoped to this shadow root, so
       there is no collision with the host page. */
    if (item.id) ib.id = item.id;
    ib._iconLight = item.iconLight || item.icon || item.label || '';
    ib._iconDark  = item.iconDark  || item.icon || item.label || '';
    ib.innerHTML = ib._iconLight;
    if (item.onClick) ib.addEventListener('click', item.onClick);
    return ib;
  }
  if (t === 'chip'){
    const chip = _el('button', { 'class':'chip', title:item.title || null }, item.label);
    if (item.onClick) chip.addEventListener('click', item.onClick);
    return chip;
  }
  if (t === 'meter'){
    const m = _el('div', { 'class':'meter', title:item.title || null },
      '<div class="track"><div class="fill" style="width:0%"></div></div>' +
      '<span class="lab">' + (item.label || 'IDB') + '</span>');
    return m;
  }
  if (t === 'nav-arrows'){
    const g = _el('span', { 'class':'navg' });
    (item.items || []).forEach(a => {
      const ab = _el('button', { 'class':'hicon' + (a.dim ? ' is-dim' : ''), title:a.title || null }, a.icon || a.label);
      if (a.onClick) ab.addEventListener('click', a.onClick);
      g.appendChild(ab);
    });
    return g;
  }
  const db = _el('button', { 'class':'hbtn', title:item.title || null }, item.label);
  if (item.bg) db.style.background = item.bg, db.style.color = '#fff', db.style.borderColor = 'transparent';
  if (item.onClick) db.addEventListener('click', item.onClick);
  return db;
}

/* ────────────────────────────────────────────────────────────────────
 * BUILD — buildHeader2(mountEl, cfg) → ctl
 * ──────────────────────────────────────────────────────────────────── */
export function buildHeader2(mountEl, cfg){
  const root = mountEl.attachShadow({ mode:'open' });
  mountEl.setAttribute('data-skin', cfg.skin || 'navy');   /* S488: 'navy' (Diesel canon, default) | 'chrome' (Bold chrome hosts) */
  const css = CSS
    .replace('${MENU_CSS}', () => menuCSS(':host([data-theme=\"dark\"])', Z_BAND.MENU))
    .replace('${Z_MENU}', String(Z_BAND.MENU))
    .replace('${Z_BACKDROP}', String(Z_BAND.BACKDROP))
    .replace('${Z_DRAWER}', String(Z_BAND.DRAWER));
  root.appendChild(_el('style', null, css));

  /* structure */
  const bar = _el('div', { 'class':'bar', part:'bar' });
  const left = _el('div', { 'class':'left' });
  const actions = _el('div', { 'class':'actions' });

  /* S504 (Mark): Back is ARROW ONLY. The word cost ~44px of header width that is
     better spent keeping controls out of the fold. title='Back' carries the
     meaning for hover/screen-readers; setHubMode({backLabel}) can still put a
     word back on a per-tool basis if one is ever wanted. */
  const back = _el('button', { 'class':'back', title:'Back', 'aria-label':'Back' }, '&#8592;');
  if (cfg.onBack) back.addEventListener('click', cfg.onBack);
  /* ═══ S633b (Mark) — THE LOGO IS NOT A CONTROL ═════════════════════════
     Field staff mis-tap it and get thrown out of a review; Mark has watched it
     happen. Logo-to-home is a MARKETING SITE convention and this is a tool
     people work inside — in a TWA with no back button and no URL bar, so the
     misclick has no cheap undo. The cost is asymmetric: it saves two seconds
     when used on purpose and costs an inspector their place when it is not.
     Leaving now happens through the back arrow (UP ONE LEVEL, not straight to
     the dashboard), the breadcrumb, or the explicit Dashboard entry in the
     drawer — all deliberate. DO NOT make this clickable again. */
  const logo = _el('span', { 'class':'logo', title:'ARENCON' });
  const logoImg = _el('img', { alt:'ARENCON' });
  if (cfg.logoSrc) logoImg.src = cfg.logoSrc;
  logo.appendChild(logoImg);
  /* cfg.onHome is intentionally NOT bound to the logo — see the note above.
     Hosts that pass it get it on the drawer's Dashboard entry instead. */
  /* S633b: the title is a breadcrumb — where you are, and a way back up.
     ctl.setBreadcrumb([{label, onClick}, …]); the LAST entry is where you are
     and is never clickable. On a narrow bar the leading segments hide and the
     current one survives, so an inspector always knows which project this is. */
  const title = _el('span', { 'class':'title' }, cfg.title || '');
  const paintCrumb = (segs) => {
    const host = (typeof crumbbar !== 'undefined') ? crumbbar : title;
    if (!Array.isArray(segs) || !segs.length){ host.classList.remove('on'); host.innerHTML = ''; return; }
    host.classList.add('on');
    host.innerHTML = '';
    segs.forEach((sg, i) => {
      const last = (i === segs.length - 1);
      if (i) host.appendChild(_el('span', { 'class':'csep' }, '\u203A'));
      if (last || !sg.onClick){
        host.appendChild(_el('span', { 'class':'cnow' }, sg.label || ''));
      } else {
        const b = _el('button', { 'class':'cseg', title:'Back to ' + (sg.label||'') }, sg.label || '');
        b.addEventListener('click', sg.onClick);
        host.appendChild(b);
      }
    });
  };
  const cloud = _el('span', { 'class':'cloud' },
    '<span class="dot"></span><span class="ctext">Cloud</span><span class="csync"></span>');
  if (cfg.onCloudClick){ cloud.style.cursor = 'pointer';
    cloud.addEventListener('click', cfg.onCloudClick); }   /* S488: FRT tap-for-diagnostic */
  const presence = _el('span', { 'class':'presence', title:'Others in this project' },
    '<span class="pstack"></span><span class="ptext"></span>');
  if (cfg.onPresenceClick) presence.addEventListener('click', cfg.onPresenceClick);
  const r2badge = _el('span', { 'class':'r2badge' }, '');
  const savets = _el('span', { 'class':'savets' }, '');
  left.appendChild(back); left.appendChild(logo); left.appendChild(title);
  left.appendChild(cloud);
  left.appendChild(r2badge); left.appendChild(savets);
  /* S633b (Mark): presence belongs at the START OF THE RIGHT GROUP — right of
     the sync status, immediately left of the buttons. It is about people, not
     about the document, so it sits with the controls rather than trailing the
     title block. */
  actions.appendChild(presence);

  const closeMenus = () => {
    root.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  };

  /* ═══ S659 — DASHBOARD GETS A PERMANENT HOME IN THE BAR ═══════════════════
     Mark, 14 Aug: at full-screen width FRT and Diesel showed a hamburger whose
     only content was Dashboard. Nothing was folded — the menu existed purely to
     hold the way home, so a primary navigation action cost two taps on a screen
     with room to spare.

     S633d created that deliberately, and its comment set the condition for
     undoing it: "Do not restore the fold-only rule without first giving
     Dashboard another permanent home." This is that home. The ENGINE renders it
     — no tool declares it, no tool can forget it — so every header that knows
     how to go home shows the same button in the same place.

     foldRank 1 means it folds FIRST as the bar tightens, which is correct: on a
     narrow screen the drawer exists anyway and the pinned drawer entry takes
     over, so the way home is never lost, just relocated. */
  const _homeAction = (cfg.onHome || cfg.homeHref) ? {
    key: '__home', type: 'text', foldRank: 1, label: '&#127968; Dashboard',
    title: 'Go to the Dashboard', drawerLabel: 'Dashboard',
    onClick: (ev) => {
      if (cfg.onHome) cfg.onHome(ev);
      else if (cfg.homeHref && cfg.homeHref !== '#') location.href = cfg.homeHref;
    }
  } : null;

  const built = ([].concat(_homeAction ? [_homeAction] : [], cfg.actions || [])).map((item, i) => {
    /* contract: every action gets a stable key; config keys win, keyless
       actions get positional fallbacks so fold math and the ctl API never
       depend on optional config fields. */
    if (item.key == null) item = Object.assign({}, item, { key:'__a' + i });
    const node = _mkControl(item, closeMenus);
    node._key = item.key;
    return { item, node };
  });
  built.forEach(b => actions.appendChild(b.node));

  const moreBtn = _el('button', { 'class':'hicon more', title:'Menu' }, '&#9776;');
  actions.appendChild(moreBtn);

  /* S633 — YOUR AVATAR, rightmost, opening Account / Sign out.
     Replaces the name chip, the Profile button and the Sign Out button. Sign
     out buried one level down is deliberate: as a bare header button it is one
     mis-tap away from ending a review, and on a tablet that costs unsent work.
     Help does NOT move in here — it carries an unseen-guides badge, and a badge
     inside a closed menu cannot be seen, which defeats the point of it. */
  let meWrap = null, meBtn = null, meMenu = null;
  /* S670 — the avatar is CREATED ON DEMAND, not once at build time.
     Only the Hub can hand the engine an account block up front; FRT, Diesel and
     Electric cannot, because who is signed in is not known until a round trip
     finishes. Building the element solely inside `if (cfg.account)` meant those
     three tools never got one — and since setAccount also hides the standalone
     Sign Out, a signed-in inspector was left with no avatar and no way out.
     Creation lives in a function so the late path and the build path produce the
     same element, in the same place, with the same handler. */
  function mkMe(){
    if (meBtn) return;
    meWrap = _el('span', { 'class':'mewrap', style:'position:relative;display:inline-flex;align-items:center' });
    meWrap.appendChild(_el('span', { 'class':'mediv' }));
    meBtn = _el('button', { 'class':'meav', title:'Your account', 'aria-haspopup':'menu', 'aria-expanded':'false' });
    meWrap.appendChild(meBtn);
    meMenu = _el('div', { 'class':'menu', style:'right:0;left:auto;min-width:224px' });
    meWrap.appendChild(meMenu);
    /* Rightmost, after the hamburger — the position it has always held on the
       Hub. Anchored to moreBtn rather than appended, so a late creation lands in
       the same slot even if something else has since been added to the row. */
    actions.insertBefore(meWrap, moreBtn.nextSibling);
    meBtn.addEventListener('click', ev => {
      ev.stopPropagation(); closeMenus();
      const on = !meMenu.classList.contains('open');
      meMenu.classList.toggle('open', on);
      meBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
  }
  if (cfg.account) mkMe();
  const paintMe = () => {
    if (!meBtn || !cfg.account) return;
    const a = cfg.account;
    meBtn.innerHTML = `<span class="pav" style="--pc:${a.colour||'#888'}">${a.initials||'?'}</span>`;
    meMenu.innerHTML =
      `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px 11px;border-bottom:1px solid currentColor;opacity:1">
         <span class="pav" style="--pc:${a.colour||'#888'};width:32px;height:32px;font-size:11.5px;margin:0"> ${a.initials||'?'}</span>
         <span><span style="display:block;font-weight:700">${a.name||''}</span>
         <span style="display:block;font-size:11.5px;opacity:.65">${a.email||''}</span></span></div>`
      + (a.onAccount ? `<button class="mi" data-act="account">&#9881;&nbsp; Account</button>
         <div class="misep"></div>` : '')
      + `<button class="mi" data-act="signout" style="color:#E26076">&#8618;&nbsp; Sign out</button>`;
    meMenu.querySelectorAll('button[data-act]').forEach(b => {
      b.addEventListener('click', ev => {
        ev.stopPropagation();
        meMenu.classList.remove('open');
        meBtn.setAttribute('aria-expanded','false');
        const act = b.getAttribute('data-act');
        if (act === 'account' && cfg.account.onAccount) cfg.account.onAccount();
        /* Sign out ALWAYS goes through the host's confirm — and the host must
           warn hard when the device holds unsynced work. Never straight out. */
        if (act === 'signout' && cfg.account.onSignOut) cfg.account.onSignOut();
      });
    });
  };
  if (meBtn) paintMe();

  bar.appendChild(left); bar.appendChild(actions);
  root.appendChild(bar);

  /* ═══ S633c — BREADCRUMB STRIP (Mark: "I still want it but in a different
     spot"). Tried in the bar and rejected: it pushed out the tool name, which
     must always be readable. It gets its own thin line UNDER the header, so it
     never competes with the controls and can carry the project NAME as well as
     the number — the thing that actually tells someone they are in the right
     job. Hidden until a host sets it, so screens with no path (and the
     edge-to-edge drawing viewer) show nothing at all. */
  const crumbbar = _el('div', { 'class':'crumbbar' });
  root.appendChild(crumbbar);

  /* S488: project bar inside module scope (roadmap S460 finding). */
  const pbar = _el('div', { 'class':'pbar' });
  const pbadge = _el('button', { 'class':'pbdg', title:'Click to change status' }, 'DRAFT');
  const pfn = _el('span', { 'class':'pfn' }, '');
  if (cfg.projectBar && cfg.projectBar.onBadgeClick)
    pbadge.addEventListener('click', cfg.projectBar.onBadgeClick);
  pbar.appendChild(pbadge); pbar.appendChild(pfn);
  root.appendChild(pbar);

  const backdrop = _el('div', { 'class':'backdrop' });
  const drawer = _el('div', { 'class':'drawer' });
  root.appendChild(backdrop); root.appendChild(drawer);

  const openDrawer = () => { closeMenus();   /* S488 FIX (Mark): drawer never stacks over an open menu */
    _rebuildDrawer(); drawer.classList.add('open'); backdrop.classList.add('open'); };
  const closeDrawer = () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); };
  moreBtn.addEventListener('click', openDrawer);
  backdrop.addEventListener('click', closeDrawer);
  drawer.addEventListener('click', ev => { if (ev.target.closest('button') && !ev.target.closest('.mwrap')) closeDrawer(); });

  /* outside-click closes menus (shadow-aware via composedPath) */
  const outClose = ev => { if (!ev.composedPath().includes(bar) && !ev.composedPath().includes(drawer)) closeMenus(); };
  document.addEventListener('click', outClose);

  /* ── fold (uses the pure solver) ── */
  let folded = [];
  function _widths(){
    const w = {};
    built.forEach(b => {
      if (b.node._ctxHidden || b.node._hubHidden){ w[b.item.key] = 0; return; }
      b.node.classList.remove('hide');
      w[b.item.key] = b.node.offsetWidth + 6;   /* S488: + the real flex gap (6px), not 8 — the 2px×n overcount plus the old 28px reserve folded Sign Out on full desktops */
    });
    return w;
  }
  function _rebuildDrawer(){
    while (drawer.firstChild) drawer.removeChild(drawer.firstChild);
    /* S488 v2.5.0: no ✕ — v1's device-verified drawer closes via backdrop tap
       or tapping any non-menu item (chrome.css .oflow-drawer had no close btn). */
    /* S488 (Mark): drawer order — regular items in declared order, then the
       3-across icon row (QR / day-night / text-size), then the IDB meter
       BELOW all buttons, Sign Out pinned last. */
    let signout = null, meter = null; const iconFold = [], rest = [];
    built.forEach(b => {
      if (folded.indexOf(b.item.key) === -1) return;
      if (b.item.key === '__home') return;   /* S659: rendered as the pinned entry above */
      if (b.item.isSignout){ signout = b; return; }
      if (b.item.key === 'idb'){ meter = b; return; }
      if (b.item.type === 'icon'){ iconFold.push(b); return; }
      rest.push(b);
    });
    /* S633b: the explicit way out, replacing the logo click. Deliberate, named,
       and reached through a menu rather than sitting under a stray thumb. */
    /* S659: only when the bar's own Dashboard button has folded away, or it
       would appear twice on a narrow screen. */
    if ((cfg.onHome || cfg.homeHref) && folded.indexOf('__home') !== -1){
      const dash = _el('button', { 'class':'ditem', title:'Go to the Dashboard' }, '&#127968;&nbsp; Dashboard');
      dash.addEventListener('click', ev => {
        closeDrawer();
        /* Falls back to homeHref when a host has no onHome. The logo is inert
           now, so this entry is the ONLY way home — it must never be absent. */
        if (cfg.onHome) cfg.onHome(ev);
        else if (cfg.homeHref && cfg.homeHref !== '#') location.href = cfg.homeHref;
      });
      drawer.appendChild(dash);
    }
    rest.forEach(b => { b.node.classList.remove('hide'); drawer.appendChild(b.node); });
    if (iconFold.length){
      const row = _el('div', { 'class':'iconrow' });
      iconFold.forEach(b => { b.node.classList.remove('hide'); row.appendChild(b.node); });
      drawer.appendChild(row);
    }
    /* S488 (Mark): IDB meter sits BELOW all buttons, under the icon row. */
    if (meter){ meter.node.classList.remove('hide'); drawer.appendChild(meter.node); }
    if (signout){ signout.node.classList.remove('hide');
      signout.node.classList.add('signout-pin'); drawer.appendChild(signout.node); }
  }
  function refit(){
    /* return every control to the bar for true measurement */
    built.forEach(b => { b.node.classList.remove('signout-pin');
      if (b.node.parentNode !== actions) actions.insertBefore(b.node, moreBtn);
      actions.insertBefore(b.node, moreBtn); });
    drawer.querySelectorAll('.iconrow').forEach(r => r.remove());   /* S488: clear stale icon rows */
    /* S488 v2.4.1 — MEASUREMENT DONE RIGHT (per the S448 lock, after two
       self-referential attempts, both patched symptoms):
         v2.3.x subtracted .left's flex-GROWN width  → avail always ≈ used → Sign Out flapped.
         v2.4.0 subtracted .left's squeezed edge     → avail inflated when actions crushed the
                                                       left → meter painted over the logo,
                                                       title vanished (two lock violations).
       The lock's own words define the correct math: the left side RESERVES its
       fixed elements — Back (fixed slot), logo (never shrinks), cloud (S114:
       never hides at any width), presence/badges when on — plus a 60px title
       floor (title ellipsizes down to it, never past it). Only the remainder
       is offered to the fold engine. All reserved children are flex-shrink:0,
       so their offsetWidth is their natural width even under squeeze; the
       title is the single flexible element and is excluded from the sum. */
    /* S551: the bar's OWN width decides, and the title floor disappears with
       the title — leaving it at 60 would reserve room for something not drawn. */
    const barW = bar.clientWidth;
    bar.classList.toggle('narrow',  barW < 520);
    bar.classList.toggle('xnarrow', barW < 480);
    const TITLE_MIN = (barW < 480) ? 0 : 60;   /* v1's device-verified value (S455 _measure) */
    let reserved = TITLE_MIN, nLeft = 1;
    Array.from(left.children).forEach(c => {
      if (c === title) return;
      if (getComputedStyle(c).display === 'none') return;
      reserved += c.offsetWidth; nLeft++;
    });
    reserved += (nLeft - 1) * 6;   /* left gap */
    /* ═══ S661 — THE GAP AT THE RIGHT EDGE (Mark, screenshot) ═══════════════
       The hamburger's width was reserved unconditionally, with a 42px fallback
       whenever its measured width came back 0. Since S659 made the hamburger
       fold-only, a full-width desktop hides it (`.more:not(.has-folded)` is
       display:none) — so offsetWidth IS 0, the fallback fired, and the bar
       reserved 42px for a button it was not drawing. That reserved strip is the
       empty space at the right edge, and it appeared the moment the hamburger
       stopped being permanent.

       Exactly the trap the TITLE_MIN comment above warns about: reserving room
       for something not drawn. Measure it only when it is on screen. */
    const shape = built.map(b => ({
      key:b.item.key, foldRank:b.item.foldRank, foldGroup:b.item.foldGroup,
      exemptUntilLast:b.item.exemptUntilLast, isSignout:b.item.isSignout
    }));
    const widths = _widths();
    const MORE_W = (moreBtn.offsetWidth || 42);
    /* Two passes, and only ever two. Pass 1 assumes no hamburger, because on a
       full-width desktop there is none. If something folds after all, the
       hamburger WILL appear, so pass 2 re-solves with its width reserved —
       otherwise the bar would be one control too wide on the frame where the
       hamburger arrives. Settling in one place beats reserving space for a
       button that is usually not there. */
    let r = computeFold(shape, widths, Math.max(barW - reserved - 12, 0));
    if (r.folded.length > 0) {
      r = computeFold(shape, widths, Math.max(barW - reserved - MORE_W - 12, 0));
    }
    folded = r.folded;
    built.forEach(b => {
      const isFolded = folded.indexOf(b.item.key) !== -1;
      b.node.classList.toggle('hide', isFolded || !!b.node._ctxHidden || !!b.node._hubHidden);
    });
    /* S633d (Mark, caught live): the hamburger used to appear ONLY when
       something folded. That was right when the logo was the way home — it is
       not right now the logo is inert, because on a full-width screen nothing
       folds, the menu never appears, and there is NO WAY HOME AT ALL. The menu
       is shown whenever it has content, and the pinned Dashboard entry is
       content. Do not restore the fold-only rule without first giving Dashboard
       another permanent home. */
    /* S659: back to fold-only. Dashboard now has a permanent home in the bar
       (see _homeAction), so a hamburger with nothing folded has no job — which
       is exactly what S633d said had to be true before this rule came back. */
    moreBtn.classList.toggle('has-folded', folded.length > 0);
    if (drawer.classList.contains('open')) _rebuildDrawer();
  }
  /* ═══ S660 — THE ENGINE FINDS OUT WHO IS SIGNED IN ════════════════════════
     S653 read identity from window.Auth. No tool actually sets it: FRT keeps
     Auth in a module binding, Diesel and Electric sign in through
     shared/auth-gate.js which has no Auth object at all. Every tool therefore
     concluded nobody was signed in and kept the old Sign Out button — visible
     in Mark's screenshots of both tools.

     Making three tools each expose an Auth object is the per-tool wiring this
     engine exists to abolish, and the fourth tool would forget. So the engine
     asks, once, using the stored session every tool shares. A new tool gets the
     avatar by doing nothing at all.

     Deliberately late and deliberately silent: the header paints first as it
     always did, then swaps when identity is known. Never the other way round —
     an avatar shown before its colour is known would be the wrong colour, and
     colour is how the toolkit says whose marks are whose. */
  if (!cfg.account && (cfg.resolveIdentity !== false)) {
    import('./headerIdentity.js').then(m => m.resolveIdentity()).then(id => {
      if (!id) return;                       // nobody signed in: leave Sign Out alone
      ctl.setAccount({
        name: id.name, email: id.email, initials: id.initials, colour: id.colour,
        /* S668: if the host has not supplied one, the ENGINE opens the shared
           Account panel itself, fully wired. Previously FRT/Diesel/Electric each
           passed their own handler that knew nothing about the roster or the
           palette, so the panel opened blank with no colour picker. A host
           handler still wins — the Hub has extra sections to add. */
        onAccount: cfg.onAccount || function () { _openSharedAccount(id, cfg, ctl); },
        onSignOut: cfg.onSignout || cfg.onSignOut || null
      });
    }).catch(e => console.warn('[header] identity unavailable:', e));
  }

  /* Everything the panel needs comes from the shared identity module, so no
     tool declares a palette, a roster or a save path — and none of them can
     drift from the others. */
  function _openSharedAccount(id, cfg, ctl){
    Promise.all([ import('./accountPanel.js'), import('./headerIdentity.js') ])
      .then(function (mods) {
        var panel = mods[0], idm = mods[1];
        return idm.loadRoster().then(function (roster) {
          panel.openAccountPanel({
            dark: document.documentElement.getAttribute('data-theme') === 'dark',
            identity: { name: id.name, email: id.email, role: id.role, initials: id.initials },
            colour: {
              palette: idm.RING_PALETTE,
              /* Never fade out the colour the signed-in person is already using,
                 or they could not re-select their own. */
              taken: roster.filter(function (p) { return p.id !== id.id; }),
              current: id.colour,
              onSave: function (hex) {
                return idm.saveColour(id.id, hex).then(function () {
                  id.colour = hex;
                  try { ctl.setAccount({ colour: hex }); } catch (e) {}
                });
              }
            },
            security: {
              hasPin: true,
              onPassword: function (pw) { return idm.changePassword(pw); },
              onPin: cfg.onPin || null
            },
            toast: cfg.toast || function (m) { console.log('[account]', m); }
          });
        });
      })
      .catch(function (e) { console.error('[header] account panel failed to open:', e); });
  }

  try{ new ResizeObserver(refit).observe(bar); }catch(_){ }
  window.addEventListener('resize', refit);

  /* ── theme (engine-owned; host may also call setTheme) ── */
  function applyTheme(mode){
    mountEl.setAttribute('data-theme', mode);
    built.forEach(b => {
      const n = b.node;
      if (n._iconLight != null && (n._iconLight !== n._iconDark))
        n.innerHTML = (mode === 'dark') ? n._iconDark : n._iconLight;
    });
  }
  let saved = null; try{ saved = localStorage.getItem(THEME_KEY); }catch(_){ }
  applyTheme(saved || cfg.defaultTheme || 'light');

  /* ── controller API (the contract) ── */
  const byKey = k => { const b = built.find(x => x.item.key === k); return b ? b.node : null; };
  const ctl = {
    version: ENGINE2_VERSION,
    root,
    ready: Promise.resolve(),
    refit,
    openDrawer, closeDrawer,
    setTitle(t){ title.textContent = t; },
    setHubMode(o){
      o = o || {};
      back.classList.toggle('on', !!o.backVisible);
      if (o.backLabel) back.innerHTML = '&#8592; ' + o.backLabel;
      if (o.logoHref){ logo.href = o.logoHref; }
      if (o.logoTitle){ logo.title = o.logoTitle; }
      built.forEach(b => {
        if (b.item.hubOnly) b.node._hubHidden = !o.hub;   /* S488: top-level hubOnly actions */
        b.node.querySelectorAll && b.node.querySelectorAll('button').forEach(x => {
          if (x._hubOnly) x.classList.toggle('hide', !o.hub);
        });
        if (!o.hub && b.node.querySelectorAll)   /* S488: collapse an open Repair box on hub exit */
          b.node.querySelectorAll('.rsec-items.open').forEach(x => x.classList.remove('open'));
      });
      refit();
    },
    setCloud(o){
      o = o || {};
      /* S629b — PARTIAL UPDATES MUST NOT CLOBBER WHAT THEY DO NOT MENTION.
         Both lines below used to run on every call, so a caller updating one
         field silently reset the others: setCloud({stale:true}) forced the
         pill visible, and setCloud({live:false}) — which the realtime status
         hook fires on every socket transition — repainted the dot 'ok'
         regardless of the real sync state. A flapping socket would have shown
         a healthy green dot while a save was failing, which is the same class
         of false reassurance as the offline pill that reported itself synced.
         Each field now moves only when the caller names it. */
      /* S631 — VISIBILITY MUST FOLLOW CONTENT. The pill is display:none until
         it carries .on, and before S629b EVERY setCloud call forced that
         class. Stopping the clobber was right for the DOT (a live-socket
         update was repainting a failed save green) and wrong for the PILL:
         setCloud({lastSync, stale}) then wrote the staleness warning into a
         hidden element, so the feature Mark has now reported missing five
         times was invisible again one commit after it was fixed. Anything
         that sets CONTENT implies the pill should be seen; only an explicit
         visible:false hides it. The dot still moves solely when named. */
      if (o.visible != null) cloud.classList.toggle('on', o.visible !== false);
      else if (o.text != null || o.lastSync != null || o.stale) cloud.classList.add('on');
      if (o.state != null) cloud.querySelector('.dot').setAttribute('data-s', o.state);
      if (o.text != null) cloud.querySelector('.ctext').textContent = o.text;
      if (o.lastSync != null) cloud.querySelector('.csync').textContent = o.lastSync;
      /* S628 — an explicit stale flag, so the host never has to reach into the
         shadow root (it cannot) and never has to guess at styling. */
      if (o.stale != null) cloud.classList.toggle('is-stale', !!o.stale);
      /* S629b — the live-socket indicator. Deliberately quiet: a small dot,
         not a badge. It says only "changes arrive as they happen"; it makes
         no claim about whether THIS device's own work is saved, which is what
         the state dot and the staleness text are for. */
      if (o.live != null) cloud.classList.toggle('is-live', !!o.live);
    },
    setStorage(o){
      o = o || {};
      const m = byKey('idb'); if (!m) return;
      const f = m.querySelector('.fill'), l = m.querySelector('.lab');
      if (f && o.pct != null) f.style.width = Math.max(0, Math.min(100, o.pct)) + '%';
      if (l && o.label != null) l.textContent = o.label;
      if (o.title != null) m.title = o.title;
    },
    setInspector(o){
      o = o || {};
      const c = byKey('inspector'); if (!c) return;
      c.innerHTML = o.name ? o.name : (o.placeholder || '&#128100; Set Name');
    },
    setUndoRedo(o){
      o = o || {};
      const b = built.find(x => x.item.type === 'nav-arrows');
      const g = b && b.node; if (!g) return;
      const btns = g.querySelectorAll('button');
      if (btns[0]) btns[0].classList.toggle('is-dim', !o.canUndo);
      if (btns[1]) btns[1].classList.toggle('is-dim', !o.canRedo);
    },
    setTheme(mode){ applyTheme(mode); try{ localStorage.setItem(THEME_KEY, mode); }catch(_){ } },
    getTheme(){ return mountEl.getAttribute('data-theme') || 'light'; },
    /* S633: repaint your own avatar when your colour or profile changes —
       the picker saves and the header must follow without a reload. */
    /* S633c (Mark): THE BREADCRUMB IS NOT IN THE HEADER. Tried, rejected —
       the bar is the most contested strip on the screen and the crumb pushed
       out the tool name, which is the one thing that must always be readable.
       The renderer stays because Mark wants breadcrumbs SOMEWHERE, but the
       header title is a plain tool name again. Do not wire this into the bar. */
    setBreadcrumb(segs){ paintCrumb(segs); },
    setAccount(a){
      /* S660: previously this bailed out when the host had passed no account
         block, which made it useless for the tools — exactly the ones that
         cannot know who is signed in until a round trip completes. It now
         CREATES the block, so identity can arrive late. */
      if (!a) return;
      if (!cfg.account) cfg.account = {};
      Object.assign(cfg.account, a);
      /* S670: the S660 comment above described creating the account BLOCK — the
         config object. The DOM element was still only ever built at boot, so on
         every tool that resolves identity late paintMe() returned immediately
         for want of a button and nothing appeared. Create the element first. */
      mkMe();
      paintMe();
      /* Once there is an avatar, the standalone Sign Out button is a duplicate
         route — and a bright one-tap route to ending a session mid-review,
         which is why the Hub retired it. Hidden rather than removed so a tool
         that never resolves identity keeps its way out. */
      if (cfg.account.name || cfg.account.initials) {
        built.forEach(b => {
          if (b.item.isSignout) { b.node._hubHidden = true; b.node.classList.add('hide'); }
        });
        try { refit(); } catch (_) {}
      }
    },
    setPresence(o){
      o = o || {};
      presence.classList.toggle('on', !!o.visible);
      /* S633: people = [{name, initials, colour}] — OTHERS only, never the
         signed-in user. Colours come from the same roster the colour picker
         uses, so a person is the same colour here, on their pins and on the
         board. Older callers passing {text} or {count} still work. */
      if (Array.isArray(o.people)){
        const show = o.people.slice(0,3), extra = o.people.length - show.length;
        presence.querySelector('.pstack').innerHTML =
          show.map(p => `<span class="pav" title="${(p.name||'').replace(/"/g,'')}" style="--pc:${p.colour||'#888'}">${p.initials||'?'}</span>`).join('')
          + (extra>0 ? `<span class="pav pmore">+${extra}</span>` : '');
        presence.querySelector('.ptext').textContent = '';
        presence.classList.toggle('on', o.people.length>0);
      }
      if (o.text != null) presence.querySelector('.ptext').textContent = o.text;
      else if (o.count != null) presence.querySelector('.ptext').textContent =
        o.count + (o.count === 1 ? ' other here' : ' others here');
    },
    setR2Badge(o){
      o = o || {};
      r2badge.classList.toggle('on', !!o.visible);
      if (o.text != null) r2badge.textContent = o.text;
      if (o.bg != null) r2badge.style.background = o.bg;
      if (o.color != null) r2badge.style.color = o.color;
    },
    setSaveStamp(t){
      savets.classList.toggle('on', t != null && t !== '');
      savets.textContent = t || '';
    },
    setAdmin(on){ mountEl.setAttribute('data-admin', on ? '1' : '0'); },
    setLogo(src){ if (src) logoImg.src = src; },
    setControlIcon(key, html){
      const n = byKey(key); if (!n) return;
      n.innerHTML = html; n._iconLight = html; n._iconDark = html;
    },
    setProjectBar(o){
      o = o || {};
      if (o.visible != null) pbar.classList.toggle('on', !!o.visible);
      if (o.filename != null) pfn.textContent = o.filename;
      if (o.badge){
        if (o.badge.text != null) pbadge.textContent = o.badge.text;
        if (o.badge.bg != null) pbadge.style.background = o.badge.bg;
      }
    },
    setControlHidden(key, hidden){
      const n = byKey(key); if (!n) return;
      n._ctxHidden = !!hidden; refit();
    }
  };

  /* lifecycle contract */
  try{
    window.ArenconHeader = { ctl, ready: ctl.ready };
    document.dispatchEvent(new CustomEvent('arencon:header-ready', { detail: ctl }));
  }catch(_){ }

  requestAnimationFrame(refit);
  return ctl;
}

/* ────────────────────────────────────────────────────────────────────
 * API CONTRACT (hosts use ONLY this — never engine DOM):
 *   ctl.setTitle(text)
 *   ctl.setHubMode({hub, backVisible, backLabel, logoHref, logoTitle})
 *   ctl.setCloud({visible, state:'ok'|'sync'|'err', text, lastSync})
 *   ctl.setStorage({pct, label, title})
 *   ctl.setInspector({name} | {placeholder})
 *   ctl.setUndoRedo({canUndo, canRedo})
 *   ctl.setTheme('light'|'dark') / ctl.getTheme()
 *   ctl.setPresence({visible, count|text}) · ctl.setR2Badge({visible, text, bg, color})
 *   ctl.setSaveStamp(text) · ctl.setAdmin(bool) · ctl.setControlIcon(key, html) · ctl.setLogo(src)
 *   ctl.setProjectBar({visible, filename, badge:{text,bg}})
 *   ctl.setControlHidden(key, bool)
 *   ctl.openDrawer() / ctl.closeDrawer() / ctl.refit()
 *   window.ArenconHeader.ready · 'arencon:header-ready' event
 * ──────────────────────────────────────────────────────────────────── */
