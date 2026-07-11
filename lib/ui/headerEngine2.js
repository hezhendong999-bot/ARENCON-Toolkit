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

export const ENGINE2_VERSION = '2.0.0';

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
:host{ all:initial; display:block; font-family:Calibri,Segoe UI,sans-serif;
  --bg:#ffffff; --fg:#1B1A22; --fg2:#5E5B68; --rule:#E3E0E8;
  --btn-bg:#F4F2F6; --btn-fg:#1B1A22; --btn-rule:#D8D4DE;
  --brand:#9C2742; --ok:#2E9E72; --menu-bg:#ffffff; --menu-fg:#1B1A22;
  --drawer-bg:#ffffff; --hdr-h:38px; --gap:8px;
}
:host([data-theme="dark"]){
  --bg:#14131a; --fg:#f4f3f6; --fg2:#a09aa8; --rule:#2c2933;
  /* btn surfaces kept LIGHTER than the bar so dark icon artwork (day/night
     PNG-in-SVG) stays visible — S460 demo finding */
  --btn-bg:#332f3e; --btn-fg:#f4f3f6; --btn-rule:#4a4558;
  --brand:#C9476A; --ok:#3FD08A; --menu-bg:#1b1922; --menu-fg:#f4f3f6;
  --drawer-bg:#17151d;
}
*,*::before,*::after{ box-sizing:border-box; font-family:inherit; }
.bar{ display:flex; align-items:center; gap:var(--gap); padding:8px 14px;
  background:var(--bg); color:var(--fg); border-bottom:1px solid var(--rule);
  min-width:0; }
.left{ display:flex; align-items:center; gap:var(--gap); min-width:0; flex:1 1 auto; }
.actions{ display:flex; align-items:center; gap:var(--gap); flex:0 0 auto; }
button{ cursor:pointer; font:600 13px Calibri,sans-serif; }
.back{ flex:0 0 auto; display:none; align-items:center; gap:5px; height:var(--hdr-h);
  padding:0 12px; border:1px solid var(--btn-rule); border-radius:9px;
  background:var(--btn-bg); color:var(--btn-fg); }
.back.on{ display:inline-flex; }
.logo{ display:inline-flex; align-items:center; height:var(--hdr-h);
  background:#fff; border-radius:8px; padding:4px 10px; text-decoration:none; }
.logo img{ height:24px; display:block; }
.title{ font:700 15px Calibri,sans-serif; color:var(--fg); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; min-width:0; }
.cloud{ display:none; align-items:center; gap:6px; font:600 11px Calibri,sans-serif;
  color:var(--fg2); white-space:nowrap; }
.cloud.on{ display:inline-flex; }
.cloud .dot{ width:9px; height:9px; border-radius:50%; background:#9aa; }
.cloud .dot[data-s="ok"]{ background:var(--ok); }
.cloud .dot[data-s="sync"]{ background:#E0A36A; }
.cloud .dot[data-s="err"]{ background:#E26076; }
.hbtn{ display:inline-flex; align-items:center; gap:6px; height:var(--hdr-h);
  padding:0 13px; border:1px solid var(--btn-rule); border-radius:9px;
  background:var(--btn-bg); color:var(--btn-fg); white-space:nowrap; }
.hicon{ width:var(--hdr-h); height:var(--hdr-h); padding:0; display:inline-flex;
  align-items:center; justify-content:center; border:1px solid var(--btn-rule);
  border-radius:9px; background:var(--btn-bg); color:var(--btn-fg); font-size:16px; }
.is-dim{ opacity:.38; }
.navg{ display:inline-flex; gap:4px; }
.chip{ display:inline-flex; align-items:center; height:var(--hdr-h); padding:0 12px;
  border:1px solid var(--btn-rule); border-radius:999px; background:var(--btn-bg);
  color:var(--btn-fg); font:700 12px Calibri,sans-serif; cursor:pointer;
  white-space:nowrap; }
.meter{ display:inline-flex; align-items:center; gap:6px; height:var(--hdr-h);
  padding:0 10px; border:1px solid var(--btn-rule); border-radius:9px;
  background:var(--btn-bg); }
.meter .track{ width:52px; height:7px; border-radius:4px; background:var(--rule);
  overflow:hidden; }
.meter .fill{ height:100%; width:0%; background:linear-gradient(90deg,var(--brand),#46C5E8); }
.meter .lab{ font:700 10px Calibri,sans-serif; color:var(--fg2); }
.mwrap{ position:relative; display:inline-flex; }
.menu{ display:none; position:absolute; top:calc(100% + 4px); right:0;
  min-width:240px; background:var(--menu-bg); color:var(--menu-fg);
  border:1px solid var(--rule); border-radius:10px;
  box-shadow:0 8px 28px rgba(0,0,0,.22); padding:6px; z-index:${'${'}Z_MENU}; }
.menu.open{ display:block; }
.menu button{ display:block; width:100%; text-align:left; background:none;
  border:none; border-radius:7px; padding:9px 11px; color:var(--menu-fg);
  font:600 13px Calibri,sans-serif; }
.menu button:hover{ background:rgba(128,110,150,.12); }
.menu button span{ display:block; font:400 11px Calibri,sans-serif;
  color:var(--fg2); margin-top:2px; }
.menu .div{ height:1px; background:var(--rule); margin:5px 4px; }
.more{ display:none; }
.more.has-folded{ display:inline-flex; }
.backdrop{ display:none; position:fixed; inset:0; background:rgba(0,0,0,.55);
  z-index:${'${'}Z_BACKDROP}; }
.backdrop.open{ display:block; }
.drawer{ display:none; position:fixed; top:0; right:0; height:100%;
  width:min(320px,86vw); background:var(--drawer-bg); color:var(--fg);
  border-left:1px solid var(--rule); box-shadow:-4px 0 24px rgba(0,0,0,.28);
  z-index:${'${'}Z_DRAWER}; flex-direction:column; padding:14px; gap:8px;
  overflow-y:auto; }
.drawer.open{ display:flex; }
.drawer .hbtn,.drawer .hicon,.drawer .chip,.drawer .meter,.drawer .mwrap{ width:100%; }
.drawer .mwrap{ display:block; }
.drawer .mwrap .hbtn{ width:100%; justify-content:center; }
.drawer .menu{ position:static; width:100%; margin-top:4px; box-shadow:none; }
.drawer .signout-pin{ margin-top:auto; }
.dclose{ align-self:flex-end; }
.hide{ display:none !important; }
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
      const b = _el('button', {});
      b.innerHTML = mi.label + (mi.sub ? '<span>' + mi.sub + '</span>' : '');
      if (mi.hubOnly) b._hubOnly = true;
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
  left.appendChild(back); left.appendChild(logo); left.appendChild(title); left.appendChild(cloud);

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

  const backdrop = _el('div', { 'class':'backdrop' });
  const drawer = _el('div', { 'class':'drawer' });
  root.appendChild(backdrop); root.appendChild(drawer);

  const openDrawer = () => { _rebuildDrawer(); drawer.classList.add('open'); backdrop.classList.add('open'); };
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
      if (b.node._ctxHidden){ w[b.item.key] = 0; return; }
      b.node.classList.remove('hide');
      w[b.item.key] = b.node.offsetWidth + 8;
    });
    return w;
  }
  function _rebuildDrawer(){
    while (drawer.firstChild) drawer.removeChild(drawer.firstChild);
    const dclose = _el('button', { 'class':'hicon dclose', title:'Close' }, '&#10005;');
    dclose.addEventListener('click', closeDrawer);
    drawer.appendChild(dclose);
    let signout = null;
    built.forEach(b => {
      if (folded.indexOf(b.item.key) === -1) return;
      if (b.item.isSignout){ signout = b; return; }
      b.node.classList.remove('hide');
      drawer.appendChild(b.node);
    });
    if (signout){ signout.node.classList.remove('hide');
      signout.node.classList.add('signout-pin'); drawer.appendChild(signout.node); }
  }
  function refit(){
    /* return every control to the bar for true measurement */
    built.forEach(b => { b.node.classList.remove('signout-pin');
      if (b.node.parentNode !== actions) actions.insertBefore(b.node, moreBtn);
      actions.insertBefore(b.node, moreBtn); });
    const avail = bar.clientWidth - left.offsetWidth - moreBtn.offsetWidth - 28;
    const r = computeFold(built.map(b => ({
      key:b.item.key, foldRank:b.item.foldRank,
      exemptUntilLast:b.item.exemptUntilLast, isSignout:b.item.isSignout
    })), _widths(), Math.max(avail, 0));
    folded = r.folded;
    built.forEach(b => {
      const isFolded = folded.indexOf(b.item.key) !== -1;
      b.node.classList.toggle('hide', isFolded || !!b.node._ctxHidden);
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
        b.node.querySelectorAll && b.node.querySelectorAll('button').forEach(x => {
          if (x._hubOnly) x.classList.toggle('hide', !o.hub);
        });
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
 *   ctl.setControlHidden(key, bool)
 *   ctl.openDrawer() / ctl.closeDrawer() / ctl.refit()
 *   window.ArenconHeader.ready · 'arencon:header-ready' event
 * ──────────────────────────────────────────────────────────────────── */
