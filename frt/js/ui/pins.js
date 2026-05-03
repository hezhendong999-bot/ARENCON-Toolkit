/**
 * ARENCON FRT v2 — All Deficiencies (Pins/Tasks) UI
 * Matches v1 layout: search + status/priority/contractor filters,
 * table with #, Drawing, Description, Contractor, Status, Priority, Pin, Jump columns.
 */

import { Model } from '../data/model.js';
import { buildDeficCard, ctrColorClass } from './deficiencies.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function deficDesc(d) {
  if (d.observations && d.observations.length && d.observations[0].text) return d.observations[0].text;
  if (d.entries && d.entries.length && d.entries[0].description) return d.entries[0].description;
  return d.description || '';
}

var _sortField = 'num';
var _sortDir = 'asc';

function _getFilters() {
  return {
    search: ((document.getElementById('tasks-search') || {}).value || '').toLowerCase().trim(),
    status: ((document.getElementById('tasks-filter-status') || {}).value) || 'all',
    priority: ((document.getElementById('tasks-filter-priority') || {}).value) || 'all',
    contractor: ((document.getElementById('tasks-filter-contractor') || {}).value) || 'all'
  };
}

function _getDrawingName(drawingId) {
  if (!drawingId) return '';
  var drawings = Model.getDrawings();
  for (var i = 0; i < drawings.length; i++) {
    if (drawings[i].id === drawingId) {
      var n = drawings[i].name || '';
      return n;
    }
  }
  return '';
}

// ── Board (kanban) view (S113 Push 16, ported from v1) ──────────
var _viewMode = 'table';
var _dragId = null;

function _pkbCard(d, p) {
  var defic = d.defic;
  var pr = defic.priority || 'high';
  var fill = defic.iar ? '#FF69B4' : (pr === 'general' ? '#1A7A4A' : (pr === 'low' ? '#E67E22' : '#C0392B'));
  var entries = (defic.entries && defic.entries.length) ? defic.entries : [{ description: defic.description || '', priority: defic.priority || 'high' }];
  var multiObs = entries.length > 1;
  var descHtml = '';
  if (multiObs) {
    entries.forEach(function(en, ei) {
      var ePr = en.priority || 'high';
      var ePrCol = ePr === 'general' ? '#1A7A4A' : (ePr === 'low' ? '#E67E22' : '#C0392B');
      var eLbl = String.fromCharCode(65 + ei);
      var eDesc = esc(en.description || 'No description');
      descHtml += '<div style="font-size:calc(11px + var(--ts));margin-bottom:3px;"><span style="color:' + ePrCol + ';font-weight:700;font-size:calc(10px + var(--ts));">' + eLbl + '</span> ' + eDesc + '</div>';
    });
  } else {
    descHtml = esc(entries[0].description || deficDesc(defic) || 'No description');
  }
  var isClosed = defic.status === 'closed' || defic.status === 'Addressed & Closed';
  var badgeCls = 'outstanding';
  var badgeTxt = 'Outstanding';
  if (defic.iar) { badgeCls = 'iar'; badgeTxt = '\u26A1 IAR'; }
  else if (isClosed) { badgeCls = 'closed'; badgeTxt = 'Closed'; }
  var dwgName = '';
  if (defic.drawingId && p.drawings) {
    var dwg = p.drawings.find(function(x) { return x.id === defic.drawingId; });
    if (dwg) dwgName = dwg.name || dwg.filename || '';
  }
  var obsCountHtml = multiObs ? '<span style="font-size:9px;color:var(--silver);margin-left:4px;">' + entries.length + ' obs.</span>' : '';

  // S113 Push 18: photo thumbnail (matches v1). Pull from defic.photos +
  // any nested entry photos. v2 photo objects: { r2Url, dataUrl, ... };
  // pick the first with a usable src. Display as 44×44 thumbnail on
  // right side of card (CSS is .pkc-thumb).
  var photos = defic.photos || [];
  if (defic.entries) {
    defic.entries.forEach(function(en) {
      if (en.photos && en.photos.length) photos = photos.concat(en.photos);
    });
  }
  var firstSrc = '';
  for (var pi = 0; pi < photos.length; pi++) {
    var ph = photos[pi];
    var s = (ph && (ph.r2Url || ph.dataUrl)) || '';
    if (s && s.length > 20) { firstSrc = s; break; }
  }
  var thumbHtml = firstSrc
    ? '<img class="pkc-thumb" src="' + esc(firstSrc) + '" alt="evidence" loading="lazy" onerror="this.style.display=\'none\'">'
    : '';

  return '<div class="pin-kanban-card" draggable="true" data-defic-id="' + defic.id + '" data-action="pkb-card">'
    + '<div class="pkc-num" style="background:' + fill + '">' + (defic.num || '?') + '</div>'
    + '<div class="pkc-body">'
    + '<div class="pkc-desc">' + descHtml + obsCountHtml + '</div>'
    + '<div class="pkc-meta">'
    + '<span class="pkc-badge ' + badgeCls + '">' + badgeTxt + '</span>'
    + (dwgName ? '<span class="pkc-drawing" title="' + esc(dwgName) + '">\uD83D\uDCD0 ' + esc(dwgName) + '</span>' : '')
    + '</div>'
    + '</div>'
    + thumbHtml
    + '</div>';
}

function _renderBoard() {
  var proj = Model.getProject();
  if (!proj) return;
  var all = Model.getAllDeficiencies(proj);
  var unpinnedCount = all.filter(function(d) { return d.defic.pinX == null; }).length;
  var notice = document.getElementById('pins-unpinned-notice');
  if (notice) notice.textContent = unpinnedCount > 0 ? (unpinnedCount + ' unpinned deficienc' + (unpinnedCount === 1 ? 'y' : 'ies')) : '';
  var cols = { high: [], low: [], general: [] };
  all.forEach(function(d) {
    var pr = d.defic.priority || 'high';
    if (!cols[pr]) cols[pr] = [];
    cols[pr].push(d);
  });
  ['high', 'low', 'general'].forEach(function(pr) {
    var el = document.getElementById('pkb-col-' + pr);
    var countEl = document.getElementById('pkb-count-' + pr);
    if (countEl) countEl.textContent = cols[pr].length;
    if (!el) return;
    el.innerHTML = cols[pr].map(function(d) { return _pkbCard(d, proj); }).join('');
    el.ondragover = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); };
    el.ondragleave = function(e) { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); };
    el.ondrop = function(e) {
      e.preventDefault();
      el.classList.remove('drag-over');
      var did = e.dataTransfer.getData('text/plain');
      if (!did || !_dragId) return;
      var newPr = el.getAttribute('data-priority');
      _changePriority(did, newPr);
    };
  });
}

function _changePriority(deficId, newPriority) {
  var f = Model.findDeficiency(deficId);
  if (!f) return;
  if (f.defic.priority === newPriority) return;
  f.defic.priority = newPriority;
  if (f.defic.entries) f.defic.entries.forEach(function(en) { en.priority = newPriority; });
  Model.save();
  _renderBoard();
}

function _setView(mode) {
  _viewMode = mode;
  var tv = document.getElementById('tasks-table-view');
  var bv = document.getElementById('tasks-board-view');
  var btnT = document.getElementById('tasks-view-table');
  var btnB = document.getElementById('tasks-view-board');
  if (tv) tv.style.display = mode === 'table' ? '' : 'none';
  if (bv) bv.style.display = mode === 'board' ? '' : 'none';
  if (btnT) btnT.classList.toggle('active', mode === 'table');
  if (btnB) btnB.classList.toggle('active', mode === 'board');
  if (mode === 'table') initPins.render();
  else _renderBoard();
}

export var initPins = {
  render: function() {
    var container = document.getElementById('tasks-table-view');
    if (!container) return;
    var proj = Model.getProject();
    if (!proj) { container.innerHTML = ''; return; }

    var all = Model.getAllDeficiencies(proj);
    if (!all.length) {
      container.innerHTML = '<p style="color:var(--silver);padding:16px;text-align:center;">No deficiencies in project.</p>';
      return;
    }

    var f = _getFilters();

    // Build contractor dropdown options
    var ctrSet = {};
    all.forEach(function(d) { ctrSet[d.contractorName || 'Site General'] = true; });
    var ctrOpts = '<option value="all">All Contractors</option>';
    Object.keys(ctrSet).sort().forEach(function(n) { ctrOpts += '<option value="' + esc(n) + '"' + (f.contractor === n ? ' selected' : '') + '>' + esc(n) + '</option>'; });

    // Filter
    var filtered = all.filter(function(d) {
      var dd = d.defic;
      var isClosed = dd.status === 'closed' || dd.status === 'Addressed & Closed';
      if (f.status === 'Outstanding' && (isClosed || dd.iar)) return false;
      if (f.status === 'Closed' && !isClosed) return false;
      if (f.status === 'IAR' && !dd.iar) return false;
      if (f.priority !== 'all' && (dd.priority || 'general') !== f.priority) return false;
      if (f.contractor !== 'all' && (d.contractorName || 'Site General') !== f.contractor) return false;
      if (f.search) {
        var text = ((dd.num || '') + ' ' + deficDesc(dd) + ' ' + (d.contractorName || '')).toLowerCase();
        if (text.indexOf(f.search) < 0) return false;
      }
      return true;
    });

    // Sort
    filtered.sort(function(a, b) {
      var av, bv;
      if (_sortField === 'num') { av = a.defic.num || 0; bv = b.defic.num || 0; }
      else if (_sortField === 'status') { av = a.defic.status || ''; bv = b.defic.status || ''; }
      else if (_sortField === 'priority') { av = a.defic.priority || ''; bv = b.defic.priority || ''; }
      else if (_sortField === 'contractor') { av = a.contractorName || ''; bv = b.contractorName || ''; }
      else if (_sortField === 'drawing') { av = _getDrawingName(a.defic.drawingId); bv = _getDrawingName(b.defic.drawingId); }
      else { av = deficDesc(a.defic); bv = deficDesc(b.defic); }
      if (typeof av === 'number') return _sortDir === 'asc' ? av - bv : bv - av;
      return _sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

    var arrow = _sortDir === 'asc' ? ' \u25B4' : ' \u25BE';
    function th(field, label) {
      return '<th class="tt-th" data-sort="' + field + '">' + label + (_sortField === field ? arrow : '') + '</th>';
    }

    // Filter bar (matches v1)
    var h = '<div class="pins-filter-bar" style="padding:10px 14px;border-bottom:1.5px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    h += '<input id="tasks-search" type="text" placeholder="Search..." value="' + esc(f.search) + '" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));width:160px;background:var(--bg);color:var(--fg);">';
    h += '<select id="tasks-filter-status" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));background:var(--bg);color:var(--fg);">';
    h += '<option value="all"' + (f.status === 'all' ? ' selected' : '') + '>All Status</option>';
    h += '<option value="Outstanding"' + (f.status === 'Outstanding' ? ' selected' : '') + '>Outstanding</option>';
    h += '<option value="Closed"' + (f.status === 'Closed' ? ' selected' : '') + '>Closed</option>';
    h += '<option value="IAR"' + (f.status === 'IAR' ? ' selected' : '') + '>IAR</option></select>';
    h += '<select id="tasks-filter-priority" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));background:var(--bg);color:var(--fg);">';
    h += '<option value="all"' + (f.priority === 'all' ? ' selected' : '') + '>All Priority</option>';
    h += '<option value="high"' + (f.priority === 'high' ? ' selected' : '') + '>High</option>';
    h += '<option value="low"' + (f.priority === 'low' ? ' selected' : '') + '>Low</option>';
    h += '<option value="general"' + (f.priority === 'general' ? ' selected' : '') + '>General</option></select>';
    h += '<select id="tasks-filter-contractor" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));background:var(--bg);color:var(--fg);">' + ctrOpts + '</select>';
    h += '<span style="font-size:calc(12px + var(--ts));color:var(--silver);">' + filtered.length + ' deficiencie' + (filtered.length !== 1 ? 's' : '') + '</span>';
    h += '</div>';

    // Table
    h += '<div style="overflow-x:auto;">';
    h += '<table id="tasks-table" style="width:100%;border-collapse:collapse;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;">';
    h += '<thead><tr style="background:var(--smoke);border-bottom:2px solid var(--border);">';
    h += th('num', '#') + th('drawing', 'Drawing') + th('description', 'Description') + th('contractor', 'Contractor') + th('status', 'Status') + th('priority', 'Priority') + '<th class="tt-th"></th>';
    h += '</tr></thead><tbody>';

    filtered.forEach(function(d) {
      var dd = d.defic;
      var desc = deficDesc(dd);
      var isClosed = dd.status === 'closed' || dd.status === 'Addressed & Closed';
      var isIAR = dd.iar;
      var statusText = isIAR ? 'IAR' : (isClosed ? 'Closed' : 'Outstanding');
      var statusCls = isIAR ? 'iar' : (isClosed ? 'closed' : 'outstanding');
      var priCls = dd.priority || 'general';
      var dwgName = _getDrawingName(dd.drawingId);

      h += '<tr data-defic-id="' + esc(dd.id) + '" data-action="jump-defic" style="border-bottom:1px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent;">';
      h += '<td style="padding:8px 10px;font-weight:700;color:#9C2742;">#' + (dd.num || '?') + '</td>';
      h += '<td style="padding:8px 10px;word-break:break-word;">' + esc(dwgName || '\u2014') + '</td>';
      h += '<td style="padding:8px 10px;word-break:break-word;">' + esc(desc || '(no description)') + '</td>';
      h += '<td style="padding:8px 10px;"><span class="ctr-tag ' + ctrColorClass(d.contractorName) + '">' + esc(d.contractorName) + '</span></td>';
      // S113 Push 24: stack Outstanding/Closed and IAR vertically. IAR is
      // additive — when active, it appears as a second row below the main
      // status, not in place of it. Matches Mark's request from the same
      // session: "Move IAR to be below outstanding, as part of the status".
      var statusBaseTxt = isClosed ? 'Closed' : 'Outstanding';
      var statusBaseCls = isClosed ? 'closed' : 'outstanding';
      h += '<td style="padding:8px 10px;">';
      h += '<span class="tt-status ' + statusBaseCls + '">' + statusBaseTxt + '</span>';
      if (isIAR) {
        h += '<div style="margin-top:3px;"><span class="tt-status iar">\u26A1 IAR</span></div>';
      }
      h += '</td>';
      h += '<td style="padding:8px 10px;"><span class="tt-priority ' + priCls + '">' + esc((dd.priority || 'general').charAt(0).toUpperCase() + (dd.priority || 'general').slice(1)) + '</span></td>';
      h += '<td style="padding:8px 10px;"><button class="tt-jump" data-action="jump-defic" data-defic-id="' + esc(dd.id) + '">Jump</button></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    container.innerHTML = h;
  }
};

Model.onChange('project', function() { if (_viewMode === 'board') _renderBoard(); else initPins.render(); });

// View toggle (Table / Board)
document.addEventListener('click', function(e) {
  if (e.target.id === 'tasks-view-table') { _setView('table'); return; }
  if (e.target.id === 'tasks-view-board') { _setView('board'); return; }
  // Kanban card click → jump-to-defic in deficiencies tab
  var card = e.target.closest && e.target.closest('[data-action="pkb-card"]');
  if (card && _viewMode === 'board' && !e.target.closest('.pkc-thumb')) {
    var deficId = card.getAttribute('data-defic-id');
    if (deficId) {
      document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === 'deficiencies'); });
      document.querySelectorAll('.panel').forEach(function(p) { p.classList.toggle('active', p.id === 'panel-deficiencies'); });
      setTimeout(function() {
        var dc = document.querySelector('.defic-item[data-defic-id="' + deficId + '"]');
        if (dc) {
          dc.scrollIntoView({ behavior: 'smooth', block: 'center' });
          dc.style.outline = '2px solid #9C2742';
          setTimeout(function() { dc.style.outline = ''; }, 2000);
        }
      }, 100);
    }
  }
});
// Kanban card drag-start / drag-end
document.addEventListener('dragstart', function(e) {
  var card = e.target.closest && e.target.closest('.pin-kanban-card');
  if (!card) return;
  var deficId = card.getAttribute('data-defic-id');
  if (!deficId) return;
  _dragId = deficId;
  e.dataTransfer.setData('text/plain', deficId);
  e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
});
document.addEventListener('dragend', function(e) {
  var card = e.target.closest && e.target.closest('.pin-kanban-card');
  if (card) card.classList.remove('dragging');
  _dragId = null;
  document.querySelectorAll('.pins-kanban-col-body').forEach(function(c) { c.classList.remove('drag-over'); });
});

// Sort, filter, and jump handlers
document.addEventListener('click', function(e) {
  // Sort header
  var th = e.target.closest && e.target.closest('.tt-th[data-sort]');
  if (th && th.closest('#tasks-table-view')) {
    var field = th.getAttribute('data-sort');
    if (_sortField === field) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
    else { _sortField = field; _sortDir = 'asc'; }
    initPins.render();
    return;
  }

  // Jump button
  var jump = e.target.closest && e.target.closest('[data-action="jump-defic"]');
  if (jump) {
    var deficId = jump.getAttribute('data-defic-id');
    if (deficId) {
      document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === 'deficiencies'); });
      document.querySelectorAll('.panel').forEach(function(p) { p.classList.toggle('active', p.id === 'panel-deficiencies'); });
      setTimeout(function() {
        var card = document.querySelector('.defic-item[data-defic-id="' + deficId + '"]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '2px solid #9C2742';
          setTimeout(function() { card.style.outline = ''; }, 2000);
        }
      }, 100);
    }
    return;
  }

  // Row click → inline expand (not on buttons/inputs/jump)
  var row = e.target.closest && e.target.closest('#tasks-table-view tr[data-defic-id]');
  if (row && !e.target.closest('button') && !e.target.closest('select') && !e.target.closest('input')) {
    var deficId = row.getAttribute('data-defic-id');
    var existingExpand = row.nextElementSibling;
    // Collapse any other open expand
    var allExpands = document.querySelectorAll('#tasks-table-view .tt-expand-row');
    allExpands.forEach(function(ex) { ex.remove(); });
    // Toggle: if the same row was already expanded, just collapse (already removed above)
    if (existingExpand && existingExpand.classList.contains('tt-expand-row') && existingExpand.getAttribute('data-expand-id') === deficId) {
      row.classList.remove('tt-row-active');
      return;
    }
    // Remove active state from all rows
    document.querySelectorAll('#tasks-table-view tr.tt-row-active').forEach(function(r) { r.classList.remove('tt-row-active'); });
    // Build expand row
    var f = Model.findDeficiency(deficId);
    if (f) {
      var expandTr = document.createElement('tr');
      expandTr.className = 'tt-expand-row';
      expandTr.setAttribute('data-expand-id', deficId);
      var td = document.createElement('td');
      td.setAttribute('colspan', '7');
      td.style.cssText = 'padding:0;border-bottom:2px solid #9C2742;';
      td.innerHTML = '<div class="tt-expand-content" style="padding:12px 16px;background:var(--smoke);border-top:1px solid var(--border);">' + buildDeficCard(f.defic, f.contractor ? f.contractor.id : null) + '</div>';
      expandTr.appendChild(td);
      row.parentNode.insertBefore(expandTr, row.nextSibling);
      row.classList.add('tt-row-active');
    }
    return;
  }
});

// Filter change handlers
document.addEventListener('input', function(e) {
  if (e.target.id === 'tasks-search') initPins.render();
});
document.addEventListener('change', function(e) {
  if (e.target.id === 'tasks-filter-status' || e.target.id === 'tasks-filter-priority' || e.target.id === 'tasks-filter-contractor') {
    initPins.render();
  }
});
