/**
 * ARENCON /lib/ui/header.js — Unified Header Engine (S455 extraction)
 * ══════════════════════════════════════════════════════════════════════
 * Retires the S442 `ab-header` stub. Extracted VERBATIM from live Diesel
 * per the S448 preservation contract (HEADER_EXTRACTION_MAP_S448.md).
 *
 * ONE header shell for every tool. Layout / sizing / z-index identical
 * everywhere via lib/css/chrome.css tokens. Each tool injects only its
 * own buttons + menu items via config. Adding a button = one config entry.
 *
 * Canonical IDs (locked S455, Mark): ☰ = #mobile-menu-btn, QR = #btn-qr.
 * Each tool's JS is repointed to these once.
 *
 * Engine: priority-overflow, measured in REAL PIXELS. No @media, no
 * !important. Always-on bar: Back · cloud dot · ☰ (☰ only when ≥1 folded).
 * Fold from the right; day-night & QR exempt until last (QR folds before
 * day-night; day-night survives longest). Drawer lists folded items in
 * declared order; Sign Out pinned to bottom always.
 *
 * Theme: data-theme + body.dark-mode toggled together, persisted under the
 * ONE shared key 'arencon-theme'. Field tools default light; indoor default
 * dark (config.defaultTheme).
 */

var THEME_KEY = 'arencon-theme';

/* ── small DOM helper ── */
function _el(tag, attrs, html){
  var e = document.createElement(tag);
  if(attrs){ for(var k in attrs){ if(attrs[k]!=null) e.setAttribute(k, attrs[k]); } }
  if(html!=null) e.innerHTML = html;
  return e;
}

/* ────────────────────────────────────────────────────────────────────
 * CONTROL FACTORIES — each returns a DOM node with the canonical id.
 * type drives the class (text vs icon square) so rhythm is automatic.
 * ──────────────────────────────────────────────────────────────────── */
function _mkControl(item){
  // item: {key,label,id,type,onClick,title,bg,icon,items,dim,foldRank,exemptUntilLast}
  var t = item.type;
  if(t === 'menu'){
    var wrap = _el('div', {'class':'hdr-menu-wrap', 'id':item.wrapId||null});
    var btn = _el('button', {'class':'hdr-btn','id':item.id||null,'title':item.title||null});
    if(item.bg) btn.style.background = item.bg;
    btn.innerHTML = item.label;
    var menu = _el('div', {'class':'hdr-menu','id':item.menuId||null});
    (item.items||[]).forEach(function(mi){
      if(mi.divider){ menu.appendChild(_el('div',{'class':'hdr-menu-div','id':mi.id||null})); return; }
      var b = _el('button', {'id':mi.id||null});
      b.innerHTML = mi.label + (mi.sub? '<span>'+mi.sub+'</span>' : '');
      if(mi.onClick) b.addEventListener('click', function(ev){ mi.onClick(ev); _closeAllMenus(); });
      menu.appendChild(b);
    });
    btn.addEventListener('click', function(ev){ ev.stopPropagation(); _toggleMenu(menu); });
    wrap.appendChild(btn); wrap.appendChild(menu);
    wrap._ctrlBtn = btn; wrap._menu = menu;
    return wrap;
  }
  if(t === 'icon'){
    var ib = _el('button', {'class':'hdr-icon'+(item.dim?' is-dim':''),'id':item.id||null,'title':item.title||null});
    ib.innerHTML = item.icon || item.label || '';
    if(item.onClick) ib.addEventListener('click', item.onClick);
    return ib;
  }
  if(t === 'chip'){
    var chip = _el('div', {'class':'inspector-chip','id':item.id||null,'title':item.title||null});
    chip.innerHTML = item.label;
    if(item.onClick) chip.addEventListener('click', item.onClick);
    return chip;
  }
  if(t === 'meter'){
    var m = _el('div', {'class':'storage-bar','id':item.id||null,'title':item.title||null},
      '<div class="storage-bar-track"><div class="storage-bar-fill" id="'+(item.fillId||'idb-bar-fill')+'" style="width:0%"></div></div>');
    return m;
  }
  if(t === 'nav-arrows'){
    var g = _el('span', {'class':'header-nav-arrows','id':item.id||null});
    (item.items||[]).forEach(function(a){
      var ab = _el('button', {'class':'hdr-icon'+(a.dim?' is-dim':''),'id':a.id||null,'title':a.title||null});
      ab.innerHTML = a.icon || a.label;
      if(a.onClick) ab.addEventListener('click', a.onClick);
      g.appendChild(ab);
    });
    return g;
  }
  // default: text button
  var db = _el('button', {'class':'hdr-btn','id':item.id||null,'title':item.title||null});
  if(item.bg) db.style.background = item.bg;
  db.innerHTML = item.label;
  if(item.onClick) db.addEventListener('click', item.onClick);
  return db;
}

/* menu open/close ------------------------------------------------------ */
function _closeAllMenus(){
  var opened = document.querySelectorAll('.hdr-menu.open');
  for(var i=0;i<opened.length;i++) opened[i].classList.remove('open');
}
function _toggleMenu(menu){
  var wasOpen = menu.classList.contains('open');
  _closeAllMenus();
  if(!wasOpen) menu.classList.add('open');
}
document.addEventListener('click', function(){ _closeAllMenus(); });

/* ────────────────────────────────────────────────────────────────────
 * THEME
 * ──────────────────────────────────────────────────────────────────── */
function _applyTheme(mode){
  document.documentElement.setAttribute('data-theme', mode);
  document.body.classList.toggle('dark-mode', mode === 'dark');
}
function _initTheme(cfg){
  var saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(_){}
  var mode = saved || cfg.defaultTheme || 'light';
  _applyTheme(mode);
  return mode;
}
function toggleHeaderTheme(){
  var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  var next = cur === 'dark' ? 'light' : 'dark';
  _applyTheme(next);
  try{ localStorage.setItem(THEME_KEY, next); }catch(_){}
  return next;
}

/* ────────────────────────────────────────────────────────────────────
 * BUILD
 * config = {
 *   title, logoSrc, homeHref, onBack, onHome, defaultTheme,
 *   actions: [ item, ... ]   // declared order == bar order, never rearranged
 * }
 * Each action item may carry foldRank (lower folds first) and
 * exemptUntilLast:true (day-night, QR). Sign Out is flagged isSignout:true.
 * ──────────────────────────────────────────────────────────────────── */
function buildHeader(mountEl, config){
  _initTheme(config);

  var header = _el('header', {'class':'app-header'});
  var top = _el('div', {'class':'header-top'});

  // LEFT cluster: Back · logo · title
  var left = _el('div', {'class':'header-left'});
  var back = _el('button', {'class':'back-btn','id':'back-btn','title':'Back'}, '← Back');
  if(config.onBack) back.addEventListener('click', config.onBack);
  var logoSlot = _el('div', {'class':'logo-slot'});
  var logoLink = _el('a', {'id':'logo-link','href':config.homeHref||'index.html','title':'Back to Toolkit'});
  var logo = _el('img', {'class':'header-logo','id':'logo-img','src':config.logoSrc||'','alt':'ARENCON Inc.'});
  if(config.onHome){ logoLink.addEventListener('click', function(ev){ ev.preventDefault(); config.onHome(ev); }); }
  logoLink.appendChild(logo); logoSlot.appendChild(logoLink);
  var title = _el('span', {'class':'app-title','id':'header-app-title'}, config.title||'');
  left.appendChild(back); left.appendChild(logoSlot); left.appendChild(title);

  // RIGHT cluster: actions in declared order
  var actions = _el('div', {'class':'header-actions','id':'header-actions'});
  var built = [];   // {item, node} in declared order
  (config.actions||[]).forEach(function(item){
    var node = _mkControl(item);
    node._foldRank = (item.foldRank!=null? item.foldRank : 50);
    node._exemptUntilLast = !!item.exemptUntilLast;
    node._item = item;
    actions.appendChild(node);
    built.push({item:item, node:node});
  });

  // ☰ overflow toggle (always in DOM; shown only when ≥1 folded)
  var moreBtn = _el('button', {'class':'hdr-icon more-toggle','id':'mobile-menu-btn','title':'Menu'}, '☰');
  actions.appendChild(moreBtn);

  top.appendChild(left); top.appendChild(actions);
  header.appendChild(top);

  // drawer + backdrop
  var backdrop = _el('div', {'class':'oflow-backdrop','id':'mobile-menu-backdrop'});
  var drawer = _el('div', {'class':'oflow-drawer','id':'mobile-menu'});
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  function openDrawer(){ _rebuildDrawer(); drawer.classList.add('open'); backdrop.classList.add('open'); }
  function closeDrawer(){ drawer.classList.remove('open'); backdrop.classList.remove('open'); }
  moreBtn.addEventListener('click', function(ev){ ev.stopPropagation(); openDrawer(); });
  backdrop.addEventListener('click', closeDrawer);

  // mount
  mountEl.innerHTML = '';
  mountEl.appendChild(header);

  // ── PRIORITY-OVERFLOW ENGINE (real px) ──────────────────────────────
  var folded = [];   // nodes currently folded into drawer

  function _rebuildDrawer(){
    // list folded items in DECLARED order; Sign Out pinned to bottom
    drawer.innerHTML = '';
    var signoutItem = null;
    built.forEach(function(b){
      if(folded.indexOf(b.node) === -1) return;   // only folded ones
      if(b.item.isSignout){ signoutItem = b.item; return; }
      var row = _el('button', {'class':'drawer-row','id':b.item.drawerId||null},
        (b.item.icon? b.item.icon+' ' : '') + (b.item.drawerLabel || _stripArrow(b.item.label)));
      row.addEventListener('click', function(ev){
        closeDrawer();
        if(b.item.onClick) b.item.onClick(ev);
        else if(b.node._ctrlBtn) b.node._ctrlBtn.click();
      });
      drawer.appendChild(row);
    });
    if(signoutItem){
      var so = _el('button', {'class':'drawer-row drawer-signout'},
        (signoutItem.icon? signoutItem.icon+' ':'') + _stripArrow(signoutItem.label));
      so.addEventListener('click', function(ev){ closeDrawer(); if(signoutItem.onClick) signoutItem.onClick(ev); });
      drawer.appendChild(so);
    }
  }

  function _measure(){
    // reset: everything visible in the bar
    built.forEach(function(b){ b.node.style.display = ''; });
    folded = [];
    moreBtn.classList.remove('has-folded');

    // available width = header inner width minus left cluster minus gaps
    var avail = top.clientWidth
      - _outer(left)
      - parseFloat(getComputedStyle(top).paddingLeft || 0)
      - parseFloat(getComputedStyle(top).paddingRight || 0)
      - 4;

    // ☰ reserved width once anything folds
    var moreW = _ctrlWidth(moreBtn) + _gap();

    // FOLD PRIORITY (locked S448): fold from the RIGHT end inward in declared
    // order — rightmost non-exempt control folds first. The two exempt controls
    // (QR, day-night) survive until everything else is folded; QR folds BEFORE
    // day-night (day-night survives longest). Sign Out is an ordinary control
    // here (folds by its position) but pins to drawer bottom when folded.
    var nonExempt = [], exempt = [];
    built.forEach(function(b){ (b.node._exemptUntilLast ? exempt : nonExempt).push(b); });
    nonExempt.reverse();                                   // rightmost first
    exempt.sort(function(a,b){                             // QR (lower exemptOrder) first
      var ao=a.item.exemptOrder!=null?a.item.exemptOrder:0, bo=b.item.exemptOrder!=null?b.item.exemptOrder:0;
      return ao - bo;
    });
    var foldSeq = nonExempt.concat(exempt);

    function barWidth(){
      var w = 0;
      built.forEach(function(b){
        if(folded.indexOf(b.node) !== -1) return;
        w += _ctrlWidth(b.node) + _gap();
      });
      return w;
    }

    // fold in sequence until the bar (plus ☰ reserve, once anything folds) fits
    var si = 0;
    while(si < foldSeq.length){
      var reserve = folded.length ? moreW : 0;
      if(barWidth() + reserve <= avail) break;
      var cand = foldSeq[si]; si++;
      if(folded.indexOf(cand.node) !== -1) continue;
      cand.node.style.display = 'none';
      folded.push(cand.node);
    }

    if(folded.length){
      moreBtn.classList.add('has-folded');
    }
    _rebuildDrawer();
  }

  function _outer(node){
    var r = node.getBoundingClientRect();
    var cs = getComputedStyle(node);
    return r.width + parseFloat(cs.marginLeft||0) + parseFloat(cs.marginRight||0);
  }
  function _ctrlWidth(node){
    var prev = node.style.display;
    if(prev === 'none'){ node.style.display=''; }
    var w = node.getBoundingClientRect().width;
    if(prev === 'none'){ node.style.display='none'; }
    return w;
  }
  function _gap(){ return parseFloat(getComputedStyle(actions).columnGap || getComputedStyle(actions).gap || 6) || 6; }

  // measure now + on resize (debounced)
  var _raf = null;
  function _schedule(){ if(_raf) cancelAnimationFrame(_raf); _raf = requestAnimationFrame(_measure); }
  _schedule();
  window.addEventListener('resize', _schedule);

  return {
    el: header,
    remeasure: _schedule,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    setTitle: function(t){ title.textContent = t; },
    toggleTheme: toggleHeaderTheme
  };
}

function _stripArrow(s){ return String(s||'').replace(/\s*[▾▸►]\s*$/,'').trim(); }

export { buildHeader, toggleHeaderTheme };
