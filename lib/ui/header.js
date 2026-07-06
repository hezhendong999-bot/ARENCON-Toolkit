/**
 * ARENCON /lib/ — Shared Header (S442, Library Step 0 demo)
 * ══════════════════════════════════════════════════════════
 * ONE header for every tool. The layout, colours, and sizes are identical
 * everywhere; each tool injects only its unique buttons and menu items via
 * config. System the same — content per-tool.
 *
 * Standard cluster (always present, never per-tool):
 *   left  : ← Back · ARENCON logo (→ Hub dashboard, S412 nav canon) · title
 *   right : cloud/sync dot (permanent-visibility rule §S114-16)
 *           · ☀/☾ theme toggle · ☰ menu
 *
 * Config slots (per-tool):
 *   buttons[]   — header buttons on wide screens; auto-collapse into ☰ ≤1024px
 *   menuItems[] — always-in-menu items (QR Code lives here, S441 canon:
 *                 QR is never a header button)
 *
 * Theme: data-theme on <html>, persisted under the ONE shared key
 * 'arencon-theme' so every tool on a device matches. Field tools default
 * LIGHT; indoor tools default DARK (config.defaultTheme).
 *
 * Nav canon (S412): Back = exactly one tier up (config.onBack — the tool's
 * own _leaveTool-equivalent). Logo = Hub dashboard, save-guarded by the
 * same handler (config.onHome; falls back to config.homeHref).
 */

import { ARENCON_LOGO } from '../assets/logo.js';

var THEME_KEY = 'arencon-theme';

function _el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

export function initTheme(defaultTheme) {
  var saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  var theme = (saved === 'dark' || saved === 'light') ? saved : (defaultTheme || 'light');
  applyTheme(theme);
  return theme;
}

/**
 * Build the shared header inside `config.mount`.
 * Returns { setTitle, setCloudStatus, setBackVisible, root }.
 */
export function initHeader(config) {
  config = config || {};
  var mount = typeof config.mount === 'string' ? document.querySelector(config.mount) : config.mount;
  if (!mount) throw new Error('[lib/header] mount not found');

  initTheme(config.defaultTheme);

  var root = _el('header', 'ab-header');

  // ── left: Back · logo · title ──
  var left = _el('div', 'ab-hdr-left');
  var back = _el('button', 'ab-back', '← Back');
  back.style.display = config.showBack === false ? 'none' : '';
  back.addEventListener('click', function() { if (config.onBack) config.onBack(); });
  var logo = _el('a', 'ab-logo');
  logo.title = 'Hub dashboard';
  var img = document.createElement('img');
  img.src = ARENCON_LOGO;
  img.alt = 'ARENCON Inc.';
  logo.appendChild(img);
  logo.addEventListener('click', function(ev) {
    ev.preventDefault();
    if (config.onHome) config.onHome();
    else if (config.homeHref) location.href = config.homeHref;
  });
  var title = _el('span', 'ab-title');
  title.textContent = config.toolName || '';
  left.appendChild(back); left.appendChild(logo); left.appendChild(title);

  // ── right: cloud dot · tool buttons · theme · ☰ ──
  var right = _el('div', 'ab-hdr-right');

  var cloud = _el('span', 'ab-cloud');
  cloud.title = 'Cloud status';
  var dot = _el('span', 'ab-cloud-dot');
  var cloudText = _el('span', 'ab-cloud-text');
  cloudText.textContent = '';
  cloud.appendChild(dot); cloud.appendChild(cloudText);
  cloud.addEventListener('click', function() { if (config.onCloudClick) config.onCloudClick(); });
  right.appendChild(cloud);

  var wide = window.matchMedia('(min-width: 1025px)');
  var toolBtns = [];
  (config.buttons || []).forEach(function(b) {
    var btn = _el('button', 'ab-hdr-btn');
    btn.textContent = b.label;
    if (b.title) btn.title = b.title;
    if (b.id) btn.id = b.id;
    btn.addEventListener('click', function() { if (b.onClick) b.onClick(); });
    right.appendChild(btn);
    toolBtns.push({ cfg: b, el: btn });
  });

  var themeBtn = _el('button', 'ab-icon-btn');
  themeBtn.title = 'Toggle light / dark';
  function _paintThemeBtn() {
    themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾';
  }
  _paintThemeBtn();
  themeBtn.addEventListener('click', function() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    _paintThemeBtn();
  });
  right.appendChild(themeBtn);

  var menuWrap = _el('div');
  menuWrap.style.position = 'relative';
  var menuBtn = _el('button', 'ab-icon-btn', '☰');
  menuBtn.title = 'Menu';
  var menu = _el('div', 'ab-menu');
  menuWrap.appendChild(menuBtn); menuWrap.appendChild(menu);
  right.appendChild(menuWrap);

  function _rebuildMenu() {
    menu.innerHTML = '';
    // Collapsed tool buttons first (narrow screens), then per-tool menu items.
    if (!wide.matches) {
      toolBtns.forEach(function(tb) {
        var mi = _el('button', '', '');
        mi.textContent = tb.cfg.label;
        mi.addEventListener('click', function() { _closeMenu(); if (tb.cfg.onClick) tb.cfg.onClick(); });
        menu.appendChild(mi);
      });
      if (toolBtns.length && (config.menuItems || []).length) menu.appendChild(_el('div', 'ab-menu-div'));
    }
    (config.menuItems || []).forEach(function(m) {
      if (m.divider) { menu.appendChild(_el('div', 'ab-menu-div')); return; }
      var mi = _el('button', '', '');
      mi.textContent = m.label;
      if (m.id) mi.id = m.id;
      mi.addEventListener('click', function() { _closeMenu(); if (m.onClick) m.onClick(); });
      menu.appendChild(mi);
    });
  }
  function _closeMenu() { menu.classList.remove('open'); }
  menuBtn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    _rebuildMenu();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', _closeMenu);

  function _layout() {
    toolBtns.forEach(function(tb) { tb.el.style.display = wide.matches ? '' : 'none'; });
  }
  _layout();
  if (wide.addEventListener) wide.addEventListener('change', _layout);

  root.appendChild(left); root.appendChild(right);
  mount.appendChild(root);

  return {
    root: root,
    setTitle: function(t) { title.textContent = t || ''; },
    setBackVisible: function(v) { back.style.display = v ? '' : 'none'; },
    /**
     * setCloudStatus(state, text) — state: 'synced'|'saving'|'offline'|'error'.
     * The dot NEVER hides (§S114-16); only the text changes/hides responsively.
     */
    setCloudStatus: function(state, text) {
      dot.setAttribute('data-state', state === 'synced' ? 'ok' : (state || 'ok'));
      cloudText.textContent = text || '';
    }
  };
}
