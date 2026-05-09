/**
 * ARENCON FRT v2 — All Deficiencies (Pins/Tasks) UI
 * Matches v1 layout: search + status/priority/contractor filters,
 * table with #, Drawing, Description, Contractor, Status, Priority, Pin, Jump columns.
 */

import { Model } from '../data/model.js';
import { ctrColorClass } from './deficiencies.js';
import { confirmIARDeactivate } from '../shared/dialogs.js';

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
  // S119: effective priority/status (max across obs / all-addressed → closed)
  var pr = Model.getEffectivePriority(defic);
  var fill = defic.iar ? '#FF69B4' : (pr === 'general' ? '#1A7A4A' : (pr === 'low' ? '#E67E22' : '#C0392B'));
  // Prefer observations[] (current) over legacy entries[] (S114 migrated away)
  var obsList = (defic.observations && defic.observations.length) ? defic.observations : null;
  var entries = obsList || ((defic.entries && defic.entries.length) ? defic.entries : [{ description: defic.description || '', priority: defic.priority || 'high' }]);
  var multiObs = entries.length > 1;
  var descHtml = '';
  if (multiObs) {
    entries.forEach(function(en, ei) {
      // S119: each obs's priority drives its label color (independent)
      var ePr = en.priority || defic.priority || 'high';
      var ePrCol = ePr === 'general' ? '#1A7A4A' : (ePr === 'low' ? '#E67E22' : '#C0392B');
      var eLbl = String.fromCharCode(65 + ei);
      var eDesc = esc(en.description || en.text || 'No description');
      descHtml += '<div style="font-size:calc(11px + var(--ts));margin-bottom:3px;"><span style="color:' + ePrCol + ';font-weight:700;font-size:calc(10px + var(--ts));">' + eLbl + '</span> ' + eDesc + '</div>';
    });
  } else {
    descHtml = esc(entries[0].description || entries[0].text || deficDesc(defic) || 'No description');
  }
  var isClosed = Model.getEffectiveStatus(defic) === 'closed';
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
    // S119: pin lives in the column matching its effective priority
    var pr = Model.getEffectivePriority(d.defic);
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
  // S121 Push 8: Summary board drag — propagate the new priority to every
  // observation so getEffectivePriority returns the dropped value. Pre-Push 8
  // only d.priority was updated, but the kanban computes the column from
  // getEffectivePriority(d) = max across obs.priority, so cards with
  // multi-obs were snapping back to their original column. Updating each
  // obs.priority to the dropped value matches user intent ("move pin to Low"
  // = "make this pin Low priority overall").
  // S121 Push 9: bug — pins.js called Model.save() which doesn't exist
  // (only Model.saveNow() does). The exception was thrown silently before
  // _renderBoard() so drag results never surfaced. Now uses saveNow().
  // S121 Push 10: when dragging an IAR pin to Low/General, prompt for
  // confirmation (IAR = Immediate Action Required, only meaningful at
  // High priority). User confirms → IAR clears + priority changes.
  // User cancels → revert (no change).
  var willDeactivateIAR = f.defic.iar && (newPriority === 'low' || newPriority === 'general');
  var doApply = function() {
    f.defic.priority = newPriority;
    if (f.defic.observations && f.defic.observations.length) {
      f.defic.observations.forEach(function(o) { o.priority = newPriority; });
    }
    if (f.defic.entries) f.defic.entries.forEach(function(en) { en.priority = newPriority; });
    if (typeof Model.saveNow === 'function') Model.saveNow();
    _renderBoard();
  };
  if (willDeactivateIAR) {
    confirmIARDeactivate(f.defic).then(function(ok) {
      if (ok === false) {
        // User cancelled — re-render to snap card back into original column
        _renderBoard();
        return;
      }
      f.defic.iar = false;
      doApply();
    });
    return;
  }
  doApply();
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
      // S119: effective priority/status (max across obs / all-addressed)
      var effPri = Model.getEffectivePriority(dd);
      var isClosed = Model.getEffectiveStatus(dd) === 'closed';
      if (f.status === 'Outstanding' && (isClosed || dd.iar)) return false;
      if (f.status === 'Closed' && !isClosed) return false;
      if (f.status === 'IAR' && !dd.iar) return false;
      if (f.priority !== 'all' && effPri !== f.priority) return false;
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
      else if (_sortField === 'status') { av = Model.getEffectiveStatus(a.defic); bv = Model.getEffectiveStatus(b.defic); }
      else if (_sortField === 'priority') { av = Model.getEffectivePriority(a.defic); bv = Model.getEffectivePriority(b.defic); }
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
      // S119: effective status/priority
      var isClosed = Model.getEffectiveStatus(dd) === 'closed';
      var effPri = Model.getEffectivePriority(dd);
      var isIAR = dd.iar;
      var statusText = isIAR ? 'IAR' : (isClosed ? 'Closed' : 'Outstanding');
      var statusCls = isIAR ? 'iar' : (isClosed ? 'closed' : 'outstanding');
      var priCls = effPri;
      var dwgName = _getDrawingName(dd.drawingId);

      h += '<tr data-defic-id="' + esc(dd.id) + '" data-action="open-pin-editor" style="border-bottom:1px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent;">';
      h += '<td style="padding:8px 10px;font-weight:700;color:#9C2742;">#' + (dd.num || '?') + '</td>';
      h += '<td style="padding:8px 10px;word-break:break-word;">' + esc(dwgName || '\u2014') + '</td>';
      h += '<td style="padding:8px 10px;word-break:break-word;">' + esc(desc || '(no description)') + '</td>';
      h += '<td style="padding:8px 10px;"><span class="ctr-tag ' + ctrColorClass(d.contractorName) + '">' + esc(d.contractorName) + '</span></td>';
      // S113 Push 24: stack Outstanding/Closed and IAR vertically. IAR is
      // additive — when active, it appears as a second row below the main
      // status, not in place of it. Matches Mark's request from the same
      // session: "Move IAR to be below outstanding, as part of the status".
      // S116 Push 13: increased horizontal padding 10px -> 18px on Status
      // and Priority cells so the chips have breathing room (Mark image 3:
      // "Outstanding" was bumping right against "High").
      var statusBaseTxt = isClosed ? 'Closed' : 'Outstanding';
      var statusBaseCls = isClosed ? 'closed' : 'outstanding';
      h += '<td style="padding:8px 18px 8px 12px;">';
      h += '<span class="tt-status ' + statusBaseCls + '">' + statusBaseTxt + '</span>';
      h += '</td>';
      // S116 Push 10: IAR overrides priority. Mark: "I want IAR toggle also
      // shows in the summary, part of the priority item (so show IAR or high
      // or low or general. IAR overwrites all priority." When iar=true, the
      // priority cell shows "⚡ IAR" pink instead of the underlying priority.
      // The pin still has its own priority for color-coded markers etc.; this
      // is purely a Summary-tab display rule.
      h += '<td style="padding:8px 12px 8px 18px;">';
      if (isIAR) {
        h += '<span class="tt-priority iar">\u26A1 IAR</span>';
      } else {
        h += '<span class="tt-priority ' + priCls + '">' + esc(effPri.charAt(0).toUpperCase() + effPri.slice(1)) + '</span>';
      }
      h += '</td>';
      h += '<td style="padding:8px 10px;"><button class="tt-jump" data-action="jump-defic" data-defic-id="' + esc(dd.id) + '">Jump</button></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    container.innerHTML = h;
  }
};

Model.onChange('project', function() { if (_viewMode === 'board') _renderBoard(); else initPins.render(); });

// S117 hotfix: pin editor mutates `defic.priority`, `defic.iar`, etc.
// in-place and calls Model.saveNow() — which fires 'saved' but not
// 'project'. Without this listener the Summary table shows stale
// priority / IAR / status until the user navigates away and back.
// Debounced so rapid typing in the pin editor doesn't re-render every
// keystroke.
var _summaryDebounce = null;
Model.onChange('saved', function() {
  if (_summaryDebounce) clearTimeout(_summaryDebounce);
  _summaryDebounce = setTimeout(function() {
    if (_viewMode === 'board') _renderBoard(); else initPins.render();
  }, 300);
});

// View toggle (Table / Board)
document.addEventListener('click', function(e) {
  if (e.target.id === 'tasks-view-table') { _setView('table'); return; }
  if (e.target.id === 'tasks-view-board') { _setView('board'); return; }
  // S116 Push 1: Kanban card click → open pin editor (v1 parity).
  // Previously jumped to deficiencies tab and scrolled — but that bypassed
  // the editor where most edits actually happen.
  var card = e.target.closest && e.target.closest('[data-action="pkb-card"]');
  if (card && _viewMode === 'board' && !e.target.closest('.pkc-thumb')) {
    var deficId = card.getAttribute('data-defic-id');
    if (deficId && window._frtOpenPinEditor) {
      window._frtOpenPinEditor(deficId);
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

  // S116 Push 1: Row click → open pin editor (v1 parity).
  // Replaces the previous inline-expand-with-buildDeficCard behavior, which
  // was effectively dead since the row also carried data-action="jump-defic"
  // that fired first. The row now carries data-action="open-pin-editor".
  // The dedicated "Jump" button still has data-action="jump-defic" so explicit
  // jumps to the deficiencies tab continue to work from the button only.
  var openRow = e.target.closest && e.target.closest('[data-action="open-pin-editor"]');
  if (openRow && !e.target.closest('button') && !e.target.closest('select') && !e.target.closest('input')) {
    var deficId = openRow.getAttribute('data-defic-id');
    if (deficId && window._frtOpenPinEditor) {
      window._frtOpenPinEditor(deficId);
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
