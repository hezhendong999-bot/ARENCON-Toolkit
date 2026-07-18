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

export const ENGINE2_VERSION = '2.6.0';

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
  return {
    visible: state.filter(x => !x.folded).map(x => x.key),
    folded:  state.filter(x =>  x.folded).map(x => x.key)
  };
}

/* ── scoped stylesheet (lives INSIDE the shadow root) ─────────────── */
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
.left{ display:flex; align-items:center; gap:6px; min-width:0; flex:1; overflow:hidden; }
/* S488: overflow:hidden is the S448 lock made structural — 'logo never
   shrinks/overlaps'. Nothing in the left cluster can ever be painted over
   by the actions; if space runs out, the FOLD gives it back, not overlap. */
.actions{ display:flex; gap:8px; align-items:center; flex-shrink:0; position:relative; }
button{ cursor:pointer; }
.back{ display:none; align-items:center; justify-content:center; gap:6px;
  background:var(--chrome2-lt); border:1px solid var(--chrome-rule); color:#fff;
  padding:5px 12px; border-radius:6px; font:600 calc(13px + var(--ts)) Calibri,sans-serif;
  box-shadow:var(--btn-shadow); transition:box-shadow .15s,transform .08s,background .15s;
  margin-right:10px; white-space:nowrap; flex-shrink:0; }
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
.r2badge{ display:none; font-size:calc(10px + var(--ts)); font-weight:700;
  padding:2px 8px; border-radius:4px; letter-spacing:.3px; flex-shrink:0;
  white-space:nowrap; color:#fff; }
.r2badge.on{ display:inline-block; }
.savets{ display:none; font-size:calc(10.5px + var(--ts,0px)); color:rgba(255,255,255,.5); margin-right:4px;
  flex-shrink:0; white-space:nowrap; }
.savets.on{ display:inline-block; }
.cloud .csync{ font-size:calc(10px + var(--ts)); margin-left:6px; opacity:.85; }
.hbtn{ display:inline-flex; align-items:center; gap:4px; padding:0 12px; height:34px;
  border-radius:6px; font:600 calc(12px + var(--ts)) Calibri,sans-serif;
  border:none; color:#fff; transition:all .15s; white-space:nowrap;
  background:rgba(255,255,255,.15); }
.hbtn:hover{ filter:brightness(1.15); }
.hicon{ background:var(--chrome2-lt); color:#fff; border:1px solid var(--chrome-rule);
  box-shadow:var(--btn-shadow); border-radius:6px; width:34px; height:34px;
  padding:0; font-size:calc(15px + var(--ts)); display:inline-flex;
  align-items:center; justify-content:center; transition:all .15s; }
.hicon:hover{ background:#9C2742; color:#fff; border-color:#9C2742; }
.is-dim{ opacity:.4; }
.navg{ display:inline-flex; gap:4px; flex-shrink:0; }
.chip{ display:inline-flex; align-items:center; gap:5px; padding:3px 10px;
  background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25);
  border-radius:16px; font:600 calc(11px + var(--ts)) Calibri,sans-serif;
  color:rgba(255,255,255,.85); cursor:pointer; transition:all .15s;
  white-space:nowrap; max-width:140px; overflow:hidden; text-overflow:ellipsis;
  flex-shrink:0; height:auto; }
.chip:hover{ background:rgba(255,255,255,.25); }
.meter{ display:inline-flex; align-items:center; gap:4px; padding:3px 7px;
  background:rgba(255,255,255,.1); border-radius:5px; cursor:help; border:none; }
.meter .track{ width:48px; height:5px; background:rgba(255,255,255,.2);
  border-radius:3px; overflow:hidden; }
.meter .fill{ height:100%; width:0%; border-radius:3px; transition:width .4s;
  background:linear-gradient(90deg,#9C2742,#46C5E8); }
.meter .lab{ font-size:calc(9px + var(--ts)); color:rgba(255,255,255,.45); white-space:nowrap; }
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
:host([data-theme="dark"]) .menu{ background:#16151b; border:1px solid rgba(255,255,255,.12); }
:host([data-theme="dark"]) .menu button{ background:#16151b; color:#d0d8f0; }
:host([data-theme="dark"]) .menu button:hover{ background:#221f29; }
:host([data-theme="dark"]) .menu button span{ color:#8a94b0; }
/* ═══ S488 Wave 3 prep — menu item extensions (FRT More menu) ═══ */
.menu button.danger{ color:#C62828; }
:host([data-theme="dark"]) .menu button.danger{ color:#ef8a80; }
.menu .rsec-items{ display:none; }
.menu .rsec-items.open{ display:block; }
.menu button.rsec-toggle{ display:flex; align-items:center; justify-content:space-between; }
.menu button.rsec-toggle .caret{ margin-left:auto; font-size:calc(11px + var(--ts));
  opacity:.55; font-weight:400; }
.menu button.admin-only{ display:none; }
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
  background:var(--b-chrome2,#EFEDF0); border:1px solid var(--b-chrome-rule,#D2CEDB);
  color:var(--b-chrome-fg,#1B1A22); height:var(--hdr-h,34px);
  flex:0 0 var(--back-slot-w,84px); width:var(--back-slot-w,84px);
  padding:0 var(--hdr-px,12px); border-radius:var(--hdr-radius,6px);
  box-shadow:var(--b-btn-shadow,0 1px 2px rgba(0,0,0,.08)); }
:host([data-skin="chrome"]) .back:hover{ background:var(--b-chrome-hover,rgba(0,0,0,.05)); }
:host([data-skin="chrome"]) .cloud{ color:var(--b-chrome-fg,#1B1A22); }
:host([data-skin="chrome"]) .hicon{
  background:var(--b-chrome2,#EFEDF0); border:1px solid var(--b-chrome-rule,#D2CEDB);
  color:var(--b-chrome-fg,#1B1A22); border-radius:var(--hdr-radius,6px);
  width:var(--hdr-h,34px); height:var(--hdr-h,34px);
  box-shadow:var(--b-btn-shadow,0 1px 2px rgba(0,0,0,.08)); }
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
  box-shadow:var(--b-btn-shadow,0 1px 2px rgba(0,0,0,.08)); }
:host([data-skin="chrome"]) .chip:hover{ background:rgba(0,0,0,.03); }
:host([data-skin="chrome"][data-theme="dark"]) .chip{
  background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25);
  color:rgba(255,255,255,.85); box-shadow:none; }
:host([data-skin="chrome"][data-theme="dark"]) .chip:hover{ background:rgba(255,255,255,.25); }
:host([data-skin="chrome"]) .meter{
  background:var(--b-chrome2,#EFEDF0); border:1px solid var(--b-chrome-rule,#D2CEDB);
  border-radius:var(--hdr-radius,6px); height:var(--hdr-h,34px); padding:0 var(--hdr-px,12px); }
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
    const menu = _el('div', { 'class':'menu' });
    (item.items || []).forEach(mi => {
      if (mi.divider){ menu.appendChild(_el('div', { 'class':'div' }, '')); return; }
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
    .replace('${Z_MENU}', String(Z_BAND.MENU))
    .replace('${Z_BACKDROP}', String(Z_BAND.BACKDROP))
    .replace('${Z_DRAWER}', String(Z_BAND.DRAWER));
  root.appendChild(_el('style', null, css));

  /* structure */
  const bar = _el('div', { 'class':'bar', part:'bar' });
  const left = _el('div', { 'class':'left' });
  const actions = _el('div', { 'class':'actions' });

  const back = _el('button', { 'class':'back', title:'Back' }, '&#8592; Back');
  if (cfg.onBack) back.addEventListener('click', cfg.onBack);
  const logo = _el('a', { 'class':'logo', href:cfg.homeHref || '#', title:cfg.logoTitle || 'Home' });
  const logoImg = _el('img', { alt:'ARENCON' });
  if (cfg.logoSrc) logoImg.src = cfg.logoSrc;
  logo.appendChild(logoImg);
  if (cfg.onHome) logo.addEventListener('click', ev => { ev.preventDefault(); cfg.onHome(ev); });
  const title = _el('span', { 'class':'title' }, cfg.title || '');
  const cloud = _el('span', { 'class':'cloud' },
    '<span class="dot"></span><span class="ctext">Cloud</span><span class="csync"></span>');
  if (cfg.onCloudClick){ cloud.style.cursor = 'pointer';
    cloud.addEventListener('click', cfg.onCloudClick); }   /* S488: FRT tap-for-diagnostic */
  const presence = _el('span', { 'class':'presence', title:'Others in this project' },
    '<span>&#128101;</span><span class="ptext">0 others here</span>');
  if (cfg.onPresenceClick) presence.addEventListener('click', cfg.onPresenceClick);
  const r2badge = _el('span', { 'class':'r2badge' }, '');
  const savets = _el('span', { 'class':'savets' }, '');
  left.appendChild(back); left.appendChild(logo); left.appendChild(title);
  left.appendChild(presence); left.appendChild(cloud);
  left.appendChild(r2badge); left.appendChild(savets);

  const closeMenus = () => {
    root.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  };

  const built = (cfg.actions || []).map((item, i) => {
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

  bar.appendChild(left); bar.appendChild(actions);
  root.appendChild(bar);

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
       IDB meter, then the 3-across icon row (QR / day-night / text-size),
       Sign Out pinned last. */
    let signout = null, meter = null; const iconFold = [], rest = [];
    built.forEach(b => {
      if (folded.indexOf(b.item.key) === -1) return;
      if (b.item.isSignout){ signout = b; return; }
      if (b.item.key === 'idb'){ meter = b; return; }
      if (b.item.type === 'icon'){ iconFold.push(b); return; }
      rest.push(b);
    });
    rest.forEach(b => { b.node.classList.remove('hide'); drawer.appendChild(b.node); });
    if (meter){ meter.node.classList.remove('hide'); drawer.appendChild(meter.node); }
    if (iconFold.length){
      const row = _el('div', { 'class':'iconrow' });
      iconFold.forEach(b => { b.node.classList.remove('hide'); row.appendChild(b.node); });
      drawer.appendChild(row);
    }
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
    const TITLE_MIN = 60;   /* v1's device-verified value (S455 _measure) */
    let reserved = TITLE_MIN, nLeft = 1;
    Array.from(left.children).forEach(c => {
      if (c === title) return;
      if (getComputedStyle(c).display === 'none') return;
      reserved += c.offsetWidth; nLeft++;
    });
    reserved += (nLeft - 1) * 6;   /* left gap */
    const avail = bar.clientWidth - reserved - (moreBtn.offsetWidth || 42) - 12;
    const r = computeFold(built.map(b => ({
      key:b.item.key, foldRank:b.item.foldRank,
      exemptUntilLast:b.item.exemptUntilLast, isSignout:b.item.isSignout
    })), _widths(), Math.max(avail, 0));
    folded = r.folded;
    built.forEach(b => {
      const isFolded = folded.indexOf(b.item.key) !== -1;
      b.node.classList.toggle('hide', isFolded || !!b.node._ctxHidden || !!b.node._hubHidden);
    });
    moreBtn.classList.toggle('has-folded', folded.length > 0);
    if (drawer.classList.contains('open')) _rebuildDrawer();
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
      cloud.classList.toggle('on', o.visible !== false);
      cloud.querySelector('.dot').setAttribute('data-s', o.state || 'ok');
      if (o.text != null) cloud.querySelector('.ctext').textContent = o.text;
      if (o.lastSync != null) cloud.querySelector('.csync').textContent = o.lastSync;
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
    setPresence(o){
      o = o || {};
      presence.classList.toggle('on', !!o.visible);
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
