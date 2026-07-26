// lib/ui/helpEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON shared Help engine (S499, Mark). ONE engine for every tool — Hub,
// dashboard, FRT, Diesel, and every future tool. It renders illustrated
// feature cards two ways: "What's New" (recent, by date) and "Guide" (grouped
// by area, with plain-language search).
//
// OWNERSHIP MODEL (Mark's decision, S499):
//   • Per-tool ownership (A): each tool registers ITS OWN card list via
//     registerHelp({ tool, areas, cards }). FRT owns FRT cards in FRT's lane,
//     Diesel owns Diesel's, the Hub owns the Hub's. No tool edits another's list.
//   • Pooled search (B): the engine searches across EVERY registered list, so
//     "export a diesel report" typed in the Hub still finds the Diesel card.
//   • The engine owns NEITHER the content nor the illustrations — a tool hands
//     those in. This file is the shared machinery only.
//
// SEARCH is deliberately offline (alias layer + fuzzy), NOT an AI call: the
// guide has to work on a field tablet with no signal, which is exactly when an
// inspector is stuck. An AI fallback can be attached later via setAiFallback()
// for the rare miss when a network is present — no rework needed.
//
// No framework, no build step. Classic ES module, imported like the Hub's other
// lib modules (dialogEngine, headerEngine2).
// ─────────────────────────────────────────────────────────────────────────────

/* ── registry ─────────────────────────────────────────────────────────────── */
// Each entry: { tool:'Hub', areas:[...], cards:[...] }. A card:
//   { id, tool?, area, date:'YYYY-MM-DD', isNew?, title, pts:[html…],
//     chips:[[label,className]…], terms:'space separated aliases', art:'<svg…>'|renderer,
//     compact? }
const _registry = [];
let _aiFallback = null;   // optional async (query, cards) => card[] | null

export function registerHelp(pkg) {
  if (!pkg || !Array.isArray(pkg.cards)) return;
  // replace an existing registration for the same tool (idempotent re-register)
  const i = _registry.findIndex(r => r.tool === pkg.tool);
  const norm = {
    tool: pkg.tool || '',
    areas: Array.isArray(pkg.areas) ? pkg.areas.slice() : [],
    cards: pkg.cards.map(c => Object.assign({ tool: pkg.tool || '' }, c))
  };
  if (i >= 0) _registry[i] = norm; else _registry.push(norm);
}

export function setAiFallback(fn) { _aiFallback = (typeof fn === 'function') ? fn : null; }

/* S504 — has any tool registered help cards? Optional `tool` narrows to one
   tool's registration. Drives the "coming soon" state: a tool whose guide isn't
   built yet has registered nothing, so its Help button opens a placeholder
   instead of an empty panel. */
export function hasCards(tool) {
  if (tool) { const r = _registry.find(x => x.tool === tool); return !!(r && r.cards.length); }
  return _registry.some(r => r.cards.length);
}

/* S504 — the placeholder shown when a tool's guide isn't built yet. Names the
   tool so the reminder is concrete ("Diesel guide — coming soon"). Deliberately
   minimal: one line, no planned-feature list. Callers inject this into their
   help host when hasCards(tool) is false. */
export function comingSoonHtml(toolLabel) {
  var t = toolLabel ? String(toolLabel) : 'This tool';
  return '<div class="help-soon">'
    + '<div class="help-soon-ico">\uD83D\uDCD8</div>'
    + '<div class="help-soon-title">' + t.replace(/[<>&]/g, '') + ' \u2014 user guide coming soon</div>'
    + '<div class="help-soon-sub">A searchable guide for this tool is on the way. In the meantime, reach out to Mark.</div>'
    + '</div>';
}

function _allCards() { return _registry.reduce((a, r) => a.concat(r.cards), []); }
function _allAreas() {
  // preserve declared order per tool, dedupe across tools
  const seen = {}, out = [];
  _registry.forEach(r => (r.areas.length ? r.areas : _toolAreas(r.tool)).forEach(a => {
    if (!seen[a]) { seen[a] = 1; out.push(a); }
  }));
  return out;
}
function _toolAreas(tool) {
  const seen = {}, out = [];
  _allCards().filter(c => c.tool === tool).forEach(c => { if (!seen[c.area]) { seen[c.area] = 1; out.push(c.area); } });
  return out;
}

/* ── search: alias layer + light fuzzy, no network ────────────────────────── */
const STOP = { i:1,a:1,an:1,the:1,my:1,me:1,is:1,it:1,to:1,do:1,how:1,can:1,in:1,on:1,of:1,for:1,and:1,was:1,has:1,have:1,get:1,this:1,that:1,what:1,where:1,when:1,why:1,you:1,we:1 };
function _norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function _stem(w) { const m = w.match(/(ing|ed|es|s)$/); return (m && w.length - m[0].length >= 3) ? w.slice(0, -m[0].length) : w; }
function _lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const m = a.length, n = b.length, d = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[m][n];
}
function _score(card, qWords) {
  const title = _norm(card.title), terms = _norm(card.terms || ''),
        body = _norm((card.pts || []).join(' ').replace(/<[^>]*>/g, '')),
        area = _norm(card.area), tool = _norm(card.tool);
  const hayStem = {};
  (title + ' ' + terms + ' ' + body + ' ' + area + ' ' + tool).split(' ').forEach(w => { if (w) hayStem[_stem(w)] = 1; });
  let s = 0, hits = 0;
  qWords.forEach(qw => {
    const q = _stem(qw); let got = 0;
    if (title.indexOf(qw) >= 0) got = 60;
    else if (terms.indexOf(qw) >= 0) got = 40;
    else if (body.indexOf(qw) >= 0) got = 22;
    else if (area.indexOf(qw) >= 0 || tool.indexOf(qw) >= 0) got = 18;
    if (!got && hayStem[q]) got = 32;
    if (!got && qw.length >= 4) {
      for (const k in hayStem) { if (k.length >= 4 && _lev(q, k) <= 1) { got = 16; break; } }
    }
    if (got) { s += got; hits++; }
  });
  return hits ? s * (1 + (hits - 1) * 0.35) : 0;
}
export function searchHelp(q) {
  const qw = _norm(q).split(' ').filter(w => w && !STOP[w]);
  if (!qw.length) return null;
  return _allCards()
    .map(c => ({ c, s: _score(c, qw) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.c);
}

/* ── html helpers ─────────────────────────────────────────────────────────── */
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function _art(card) {
  const a = card.art;
  if (typeof a === 'function') { try { return a(card) || ''; } catch (e) { return ''; } }
  return a || '';
}
function _cardHtml(c) {
  return '<div class="help-card' + (c.compact ? ' compact' : '') + '">'
    + '<h4 class="help-card-h">' + _esc(c.title) + (c.tool ? ' <span class="help-card-tool">' + _esc(c.tool) + '</span>' : '') + '</h4>'
    + '<div class="help-card-split">'
    +   '<div class="help-card-shot">' + _art(c) + '</div>'
    +   '<ul class="help-card-pts">' + (c.pts || []).map(p => '<li>' + p + '</li>').join('') + '</ul>'
    + '</div>'
    + (c.chips && c.chips.length
        ? '<div class="help-card-chips">' + c.chips.map(ch => '<span class="help-chip ' + _esc(ch[1]) + '">' + _esc(ch[0]) + '</span>').join('') + '</div>'
        : '')
    + '</div>';
}

/* ── unseen-badge support (per device) ────────────────────────────────────── */
const _SEEN_KEY = 'arencon_help_seen';
export function latestId() {
  const all = _allCards().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return all[0] && all[0].id;
}
export function hasUnseen() {
  const l = latestId(); if (!l) return false;
  let seen = ''; try { seen = localStorage.getItem(_SEEN_KEY) || ''; } catch (e) {}
  return l !== seen;
}
export function markSeen() {
  const l = latestId(); if (!l) return;
  try { localStorage.setItem(_SEEN_KEY, l); } catch (e) {}
}

/* ── mount ────────────────────────────────────────────────────────────────── */
// host: the element to render into. opts.tab: 'wn' | 'guide' initial.
// Returns a small controller { setTab, destroy }.
export function mountHelp(host, opts) {
  opts = opts || {};
  let tab = opts.tab || 'wn';
  let q = '';

  host.innerHTML =
      '<div class="help-tabs">'
    +   '<button class="help-tab" data-t="wn">What\u2019s New</button>'
    +   '<button class="help-tab" data-t="guide">Guide</button>'
    + '</div>'
    + '<div class="help-search" data-role="search">'
    +   '<div class="help-search-box">'
    +     '<span class="help-search-ico">\uD83D\uDD0D</span>'
    +     '<input type="text" data-role="q" placeholder="Describe what you\u2019re trying to do\u2026" autocomplete="off">'
    +     '<button class="help-search-clr" data-role="qclr" title="Clear">\u2715</button>'
    +   '</div>'
    +   '<div class="help-search-hint">Search understands plain language \u2014 try \u201Cmy report disappeared\u201D or \u201Cscreen too bright\u201D.</div>'
    + '</div>'
    + '<div class="help-body" data-role="body"></div>';

  const tabsEls = host.querySelectorAll('.help-tab');
  const searchWrap = host.querySelector('[data-role=search]');
  const body = host.querySelector('[data-role=body]');
  const input = host.querySelector('[data-role=q]');
  const clr = host.querySelector('[data-role=qclr]');

  function paintTabs() {
    tabsEls.forEach(b => b.classList.toggle('active', b.dataset.t === tab));
    searchWrap.style.display = tab === 'guide' ? 'block' : 'none';
  }

  function renderWn() {
    const recent = _allCards().slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, opts.wnLimit || 10);
    if (!recent.length) { body.innerHTML = '<div class="help-empty">No updates yet.</div>'; return; }
    const byMonth = {};
    recent.forEach(c => {
      let m = c.date || '';
      try { m = new Date(c.date + 'T00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }); } catch (e) {}
      (byMonth[m] = byMonth[m] || []).push(c);
    });
    body.innerHTML = Object.keys(byMonth).map(m =>
      '<div class="help-grouphdr">' + _esc(m) + '</div>' + byMonth[m].map(_cardHtml).join('')
    ).join('');
  }

  async function renderGuide() {
    if (q) {
      let hits = searchHelp(q);
      if ((!hits || !hits.length) && _aiFallback) {
        body.innerHTML = '<div class="help-empty">Searching\u2026</div>';
        try { hits = await _aiFallback(q, _allCards()); } catch (e) { hits = null; }
      }
      if (!hits || !hits.length) {
        body.innerHTML = '<div class="help-empty">Nothing matched <b>\u201C' + _esc(q) + '\u201D</b>.<br>'
          + 'Try describing what you want to do \u2014 \u201Crecover a deleted report\u201D, \u201Cmake the screen darker\u201D.</div>';
        return;
      }
      body.innerHTML = '<div class="help-grouphdr">' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + '</div>'
        + hits.map(_cardHtml).join('');
      return;
    }
    const areas = _allAreas();
    body.innerHTML = areas.map(a => {
      const inA = _allCards().filter(c => c.area === a);
      if (!inA.length) return '';
      return '<div class="help-grouphdr areahdr">' + _esc(a) + '</div>' + inA.map(_cardHtml).join('');
    }).join('');
  }

  function render() {
    paintTabs();
    if (tab === 'wn') renderWn(); else renderGuide();
  }

  tabsEls.forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; q = ''; input.value = ''; clr.classList.remove('on'); render(); }));
  input.addEventListener('input', () => { q = input.value.trim(); clr.classList.toggle('on', !!q); render(); });
  clr.addEventListener('click', () => { input.value = ''; q = ''; clr.classList.remove('on'); render(); input.focus(); });

  render();
  return {
    setTab(t) { tab = t; q = ''; if (input) input.value = ''; render(); },
    destroy() { host.innerHTML = ''; }
  };
}
