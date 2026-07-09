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
    // Theme-swappable icon (e.g. day-night: sun in light, moon in dark).
    // The live tool swaps innerHTML on toggle — reproduce that here. If
    // iconLight/iconDark are provided, pick per current theme; else static icon.
    if(item.iconLight || item.iconDark){
      var isDarkNow = document.documentElement.getAttribute('data-theme') === 'dark';
      ib._iconLight = item.iconLight || item.icon || '';
      ib._iconDark  = item.iconDark  || item.icon || '';
      ib.innerHTML = isDarkNow ? ib._iconDark : ib._iconLight;
    } else {
      ib.innerHTML = item.icon || item.label || '';
    }
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
    // track + fill, PLUS a .storage-label (tools like Diesel write the % into
    // '#storage-display .storage-label' — without it the label is missing and
    // the tool's updater silently no-ops). label defaults to the item's label
    // or 'IDB'.
    var m = _el('div', {'class':'storage-bar','id':item.id||null,'title':item.title||null},
      '<div class="storage-bar-track"><div class="storage-bar-fill" id="'+(item.fillId||'idb-bar-fill')+'" style="width:0%"></div></div>'
      + '<span class="storage-label">'+(item.label||'IDB')+'</span>');
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
  // Swap theme-dependent icons (day-night: sun↔moon) to match the live tool's
  // updateDarkToggleIcon() — b.innerHTML = isDark ? _DT_MOON : _DT_SUN.
  var isDark = mode === 'dark';
  var swappable = document.querySelectorAll('.app-header .hdr-icon');
  for(var i=0;i<swappable.length;i++){
    var el = swappable[i];
    if(el._iconLight || el._iconDark){
      el.innerHTML = isDark ? (el._iconDark || '') : (el._iconLight || '');
    }
  }
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
  // When a tool owns its own theme system (e.g. Diesel: body.dark-mode +
  // ARENCON_Dark localStorage + its own updateDarkToggleIcon), the engine must
  // NOT apply data-theme or swap the day-night icon — that would fight the tool.
  var toolOwnsTheme = !!config.toolOwnsTheme;
  if(!toolOwnsTheme) _initTheme(config);

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

  // Signal slots: tool-owned status displays (cloud sync, presence, r2 badge,
  // save-ts, sync-indicator). The engine renders the container spans with the
  // tool's exact IDs so the tool's existing JS can read/write them; the tool
  // manages their content + visibility. Rendered leftmost in the actions
  // cluster, before the action controls. They do NOT participate in fold.
  (config.signalSlots||[]).forEach(function(s){
    var node;
    if(s.cloudStatus){
      // full cloud-status structure (dot + text + last-sync) used by Diesel/FRT
      node = _el('span', {'class':'cloud-status','id':s.id||'cloud-status','style':'display:none;'},
        '<span class="cloud-dot" id="'+(s.dotId||'cloud-dot')+'"></span>'
        + '<span id="'+(s.textId||'cloud-status-text')+'">Saved to cloud</span>'
        + '<span id="'+(s.lastSyncId||'last-sync-text')+'" style="display:none;"></span>');
    } else {
      node = _el('span', {'id':s.id||null,'class':s.className||null,'style':'display:none;'}, s.html||'');
    }
    actions.appendChild(node);
  });

  (config.actions||[]).forEach(function(item){
    var node = _mkControl(item);
    node._foldRank = (item.foldRank!=null? item.foldRank : 50);
    node._exemptUntilLast = !!item.exemptUntilLast;
    node._hidden = !!item.hidden;   // context-hidden (e.g. FRT Load/Export All are dashboard-only)
    node._item = item;
    if(node._hidden) node.style.display = 'none';
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
    // Render folded controls as full-width drawer rows that KEEP THEIR REAL COLOR
    // (bg) and, for menu-type controls, EXPAND their sub-items as rows (so AI
    // Review shows Full Review + Usage, Reports shows Issue + Export PDF, etc. —
    // no dead "open a submenu" rows). Sign Out pins to the bottom (teal).
    drawer.innerHTML = '';
    var signoutItem = null;

    built.forEach(function(b){
      if(folded.indexOf(b.node) === -1) return;   // only folded ones
      var it = b.item;
      if(it.isSignout){ signoutItem = it; return; }

      if(it.type === 'menu' && it.items && it.items.length){
        // section label (colored) + each sub-item as a row
        var head = _el('div', {'class':'drawer-section'}, _stripArrow(it.label || it.drawerLabel || ''));
        if(it.bg) head.style.background = it.bg, head.style.color = '#fff';
        drawer.appendChild(head);
        it.items.forEach(function(mi){
          if(mi.divider) return;
          var r = _el('button', {'class':'drawer-row drawer-subrow','id':mi.id||null},
            (mi.label||'') + (mi.sub? '<span class="drawer-sub">'+mi.sub+'</span>' : ''));
          r.addEventListener('click', function(ev){ closeDrawer(); if(mi.onClick) mi.onClick(ev); });
          drawer.appendChild(r);
        });
        return;
      }

      // plain control row — carry its real bg color if it has one
      var row = _el('button', {'class':'drawer-row','id':it.drawerId||null},
        (it.icon && it.type!=='icon' ? it.icon+' ' : '') + (it.drawerLabel || _stripArrow(it.label||'')));
      if(it.bg){ row.style.background = it.bg; row.style.color = '#fff'; }
      row.addEventListener('click', function(ev){
        closeDrawer();
        if(it.onClick) it.onClick(ev);
        else if(b.node._ctrlBtn) b.node._ctrlBtn.click();
        else if(b.node.click) b.node.click();
      });
      drawer.appendChild(row);
    });

    if(signoutItem){
      var so = _el('button', {'class':'drawer-row drawer-signout'},
        (signoutItem.icon? signoutItem.icon+' ':'') + _stripArrow(signoutItem.label));
      so.style.background = signoutItem.bg || '#0F766E'; so.style.color = '#fff';
      so.addEventListener('click', function(ev){ closeDrawer(); if(signoutItem.onClick) signoutItem.onClick(ev); });
      drawer.appendChild(so);
    }
  }

  function _measure(){
    // reset: everything visible in the bar EXCEPT context-hidden controls.
    // (Diesel's legacy @media header-hide rules are neutralized for the engine
    // header in diesel-app's s455 override block, so plain inline display works
    // and the JS fold is the single authority.)
    built.forEach(function(b){
      if(b.node._hidden) b.node.style.setProperty('display','none','important');
      else b.node.style.removeProperty('display');   // shown by default (CSS neutralize !important un-hides)
    });
    folded = [];

    // ☰ shows ONLY when something actually folds. Start hidden; reveal below if
    // the fold loop folds anything. (Green cloud dot never folds — it's a
    // signalSlot, not in `built`.)
    moreBtn.style.display = 'none';
    moreBtn.classList.remove('has-folded');

    // Reserve a FIXED minimum for the left cluster (Back slot + logo + a readable
    // title slice) so actions fold BEFORE the title is crushed. Title is the
    // lowest add-back priority on the left — it may shrink to TITLE_MIN.
    var backW = _ctrlWidth(back);
    var logoW = logoSlot.getBoundingClientRect().width;
    var TITLE_MIN = 60;
    var leftGaps = _gap() * 2;
    var leftReserve = backW + logoW + TITLE_MIN + leftGaps;
    var avail = top.clientWidth
      - leftReserve
      - parseFloat(getComputedStyle(top).paddingLeft || 0)
      - parseFloat(getComputedStyle(top).paddingRight || 0)
      - 4;

    // FOLD PRIORITY (Mark's spec, S455):
    //   Never fold: Back, logo, ☰ (when shown), green dot.
    //   Add-back order as width grows: title, Day/Night, Undo/Redo, QR, Sign Out,
    //   then everything else (AI Review, Reports, More, inspector, storage, text).
    //   => Fold order (tight → fold FIRST): everything else, then Sign Out, then
    //      Undo/Redo, then QR, then Day/Night LAST (survives longest, but CAN fold).
    function rank(b){
      var k = b.item.key;
      if(k === 'dark')    return 50;  // Day/Night — survives longest
      if(k === 'qr')      return 40;  // QR
      if(k === 'nav')     return 30;  // Undo/Redo
      if(k === 'signout') return 20;  // Sign Out
      return 0;                       // AI, Reports, More, inspector, storage, text — fold first
    }
    // Fold sequence = ascending survivalRank (lowest folds first). Within a rank,
    // fold rightmost-first (declared order reversed).
    var seq = built.filter(function(b){ return !b.node._hidden; })
      .map(function(b,i){ return {b:b, i:i, r:rank(b)}; });
    seq.sort(function(a,b){ return a.r - b.r || b.i - a.i; });
    var foldSeq = seq.map(function(x){ return x.b; });

    function barWidth(){
      var w = 0;
      built.forEach(function(b){
        if(b.node._hidden) return;
        if(folded.indexOf(b.node) !== -1) return;
        if(getComputedStyle(b.node).display === 'none') return;   // e.g. still CSS-hidden
        w += _ctrlWidth(b.node) + _gap();
      });
      return w;
    }

    // PASS 1: does everything fit WITHOUT the ☰? If so, no fold needed.
    if(barWidth() <= avail){
      _rebuildDrawer();   // empty
      return;
    }

    // PASS 2: something must fold. Reveal ☰, reserve its width, fold in survival
    // order (lowest rank folds first) until the bar + ☰ fits.
    moreBtn.style.display = '';
    moreBtn.classList.add('has-folded');
    var moreW = _ctrlWidth(moreBtn) + _gap();
    var si = 0;
    while(si < foldSeq.length){
      if(barWidth() + moreW <= avail) break;
      var cand = foldSeq[si]; si++;
      if(folded.indexOf(cand.node) !== -1) continue;
      cand.node.style.setProperty('display','none','important');
      folded.push(cand.node);
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
