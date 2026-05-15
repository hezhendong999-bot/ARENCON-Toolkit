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
// S121 Push 12: kanban now flattens to PER-OBSERVATION cards. Pin #3 with
// 2 obs → 2 cards (#3-A and #3-B), each independently draggable to its
// own column. Single-obs pins → single card (#1, #2). Universal letter
// suffix (#3-A/-B) when multi-obs, plain (#N) when single — same logic
// as the Deficiency tab's flatten path.
var _viewMode = 'table';
var _dragId = null;     // legacy, kept for reference
var _dragObsId = null;  // S121 Push 12: composite ID "deficId|obsIdx" for drop targeting

// _pkbObsCard renders a single observation as a kanban card. Replaces
// the old _pkbCard which rendered a whole pin.
//   d: the wrapper { ctrId, defic } from Model.getAllDeficiencies
//   oi: observation index within d.defic.observations
//   o: the observation object
//   p: project (for drawings lookup)
//   multiObs: whether the parent pin has >1 obs (controls suffix labeling)
function _pkbObsCard(d, oi, o, p, multiObs) {
  var defic = d.defic;
  // Per-obs priority drives card color/column. Falls back to pin priority
  // for legacy obs that haven't been migrated.
  var obsPri = o.priority || defic.priority || 'high';
  var fill = defic.iar
    ? '#FF69B4'
    : (obsPri === 'general' ? '#5F8068' : (obsPri === 'low' ? '#B07F5A' : '#A85959'));
  // Number label: #3A, #3B for multi-obs (no dash, S122 Push 1); plain #3 for single-obs.
  var numLabel = multiObs
    ? (defic.num + String.fromCharCode(65 + oi))
    : String(defic.num || '?');
  // S119 effective status — addressed obs greys out the card.
  var isAddressed = !!o.addressed;
  var badgeCls = 'outstanding';
  var badgeTxt = 'Outstanding';
  if (defic.iar) { badgeCls = 'iar'; badgeTxt = '\u26A1 IAR'; }
  else if (isAddressed) { badgeCls = 'closed'; badgeTxt = 'Closed'; }
  var dwgName = '';
  if (defic.drawingId && p.drawings) {
    var dwg = p.drawings.find(function(x) { return x.id === defic.drawingId; });
    if (dwg) dwgName = dwg.name || dwg.filename || '';
  }
  var descText = o.text || o.description || deficDesc(defic) || 'No description';
  var descHtml = esc(descText);

  // Photo thumbnail — per-obs photos first, fall back to pin-level.
  var obsPhotos = o.photos || [];
  var allPhotos = obsPhotos.concat(defic.photos || []);
  var firstSrc = '';
  for (var pi = 0; pi < allPhotos.length; pi++) {
    var ph = allPhotos[pi];
    var s = (ph && (ph.r2Url || ph.dataUrl || ph.thumb)) || '';
    if (s && s.length > 20) { firstSrc = s; break; }
  }
  var thumbHtml = firstSrc
    ? '<img class="pkc-thumb" src="' + esc(firstSrc) + '" alt="evidence" loading="lazy" onerror="this.style.display=\'none\'">'
    : '';

  // Composite drag id "deficId|obsIdx" so drop knows which obs to update.
  var dragId = defic.id + '|' + oi;
  return '<div class="pin-kanban-card" draggable="true" data-defic-id="' + defic.id + '" data-obs-idx="' + oi + '" data-drag-id="' + dragId + '" data-action="pkb-card">'
    + '<div class="pkc-num' + (multiObs ? ' pkc-num-obs' : '') + '" style="background:' + fill + '">' + esc(numLabel) + '</div>'
    + '<div class="pkc-body">'
    + '<div class="pkc-desc">' + descHtml + '</div>'
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

  // S121 Push 12: flatten pins × observations. Each obs becomes a row
  // routed to its own priority column. Pins with no observations array
  // (legacy) emit a single row using d.priority.
  var cols = { high: [], low: [], general: [] };
  all.forEach(function(d) {
    var obs = (d.defic.observations && d.defic.observations.length) ? d.defic.observations : null;
    var multi = obs && obs.length > 1;
    if (obs) {
      obs.forEach(function(o, oi) {
        var pr = o.priority || d.defic.priority || 'high';
        if (!cols[pr]) cols[pr] = [];
        cols[pr].push({ d: d, oi: oi, o: o, multi: multi });
      });
    } else {
      // Legacy: defic with no observations array → single row using pin priority.
      var pr = d.defic.priority || 'high';
      if (!cols[pr]) cols[pr] = [];
      cols[pr].push({ d: d, oi: 0, o: { text: d.defic.description || '', priority: pr }, multi: false });
    }
  });
  ['high', 'low', 'general'].forEach(function(pr) {
    var el = document.getElementById('pkb-col-' + pr);
    var countEl = document.getElementById('pkb-count-' + pr);
    if (countEl) countEl.textContent = cols[pr].length;
    if (!el) return;
    el.innerHTML = cols[pr].map(function(row) {
      return _pkbObsCard(row.d, row.oi, row.o, proj, row.multi);
    }).join('');
    el.ondragover = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); };
    el.ondragleave = function(e) { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); };
    el.ondrop = function(e) {
      e.preventDefault();
      el.classList.remove('drag-over');
      var dragId = e.dataTransfer.getData('text/plain');
      if (!dragId || !_dragObsId) return;
      var parts = dragId.split('|');
      if (parts.length !== 2) return;
      var did = parts[0];
      var obsIdx = parseInt(parts[1], 10);
      if (isNaN(obsIdx)) return;
      var newPr = el.getAttribute('data-priority');
      _changeObsPriority(did, obsIdx, newPr);
    };
  });
}

// S121 Push 12: per-obs priority change (replaces pin-level _changePriority).
// Updates ONLY the dragged observation's priority, not any sibling obs.
// IAR confirm logic: IAR is pin-level, so dragging any obs to Low/General
// while the pin is IAR-flagged still triggers the deactivate prompt.
// Reasoning: IAR (Immediate Action Required) is meaningful only when the
// pin's effective priority is High. After dropping one obs to Low, if the
// new effective priority drops below High, IAR no longer applies. Easier
// to just clear IAR whenever any obs is reduced below High on an IAR pin.
function _changeObsPriority(deficId, obsIdx, newPriority) {
  var f = Model.findDeficiency(deficId);
  if (!f || !f.defic) return;
  var obs = f.defic.observations;
  if (!obs || !obs[obsIdx]) {
    // Legacy defic with no observations array — fall back to pin-level update
    if (f.defic.priority === newPriority) return;
    var willDeactivateIAR_legacy = f.defic.iar && (newPriority === 'low' || newPriority === 'general');
    var doApplyLegacy = function() {
      f.defic.priority = newPriority;
      if (typeof Model.saveNow === 'function') Model.saveNow();
      _renderBoard();
    };
    if (willDeactivateIAR_legacy) {
      confirmIARDeactivate(f.defic).then(function(ok) {
        if (ok === false) { _renderBoard(); return; }
        f.defic.iar = false;
        doApplyLegacy();
      });
      return;
    }
    doApplyLegacy();
    return;
  }
  if (obs[obsIdx].priority === newPriority) return;
  // IAR confirm — only if pin is IAR AND the dragged obs is being lowered
  // to a non-High priority. (Dragging FROM Low to High doesn't deactivate.)
  var willDeactivateIAR = f.defic.iar && (newPriority === 'low' || newPriority === 'general');
  var doApply = function() {
    if (typeof Model.updateObsPriority === 'function') {
      Model.updateObsPriority(deficId, obsIdx, newPriority);
    } else {
      obs[obsIdx].priority = newPriority;
      if (typeof Model.saveNow === 'function') Model.saveNow();
    }
    _renderBoard();
  };
  if (willDeactivateIAR) {
    confirmIARDeactivate(f.defic).then(function(ok) {
      if (ok === false) {
        // User cancelled — re-render so card snaps back to its original column
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

    // S133: flatten pins x observations — one row per observation, mirroring
    // the kanban board (_pkbObsCard) and the Deficiency tab's per-obs cards.
    // Each row pre-computes its display fields so filter / sort / render all
    // read the same values. Legacy defics with no observations array emit a
    // single synthetic row built from pin-level state.
    var rows = [];
    all.forEach(function(d) {
      var dd = d.defic;
      var parentCtr = d.contractorName || 'Site General';
      function _rowFor(oi, o, multi) {
        // Per-obs effective contractor (mirrors _buildPinGroupCard).
        var ctrName = parentCtr;
        if (o && o.contractorId && proj.contractors) {
          var c = proj.contractors.find(function(c) { return c.id === o.contractorId; });
          if (c) ctrName = c.name;
        }
        return {
          dd: dd, oi: oi, o: o, multi: multi,
          // #4A / #4B for multi-obs (no dash, S122 P1 convention); #4 single.
          numLabel: multi ? (dd.num + String.fromCharCode(65 + oi)) : String(dd.num || '?'),
          desc: (o && (o.text || o.description)) || deficDesc(dd) || '',
          ctrName: ctrName,
          dwgName: _getDrawingName(dd.drawingId),
          obsPri: (o && o.priority) || dd.priority || 'high',
          isIAR: !!dd.iar,                 // IAR is pin-level
          isAddressed: !!(o && o.addressed)
        };
      }
      var obs = (dd.observations && dd.observations.length) ? dd.observations : null;
      if (obs) {
        var multi = obs.length > 1;
        obs.forEach(function(o, oi) { rows.push(_rowFor(oi, o, multi)); });
      } else {
        // Legacy: no observations array → single synthetic row.
        var synthClosed = Model.getEffectiveStatus(dd) === 'closed';
        rows.push(_rowFor(0, { text: dd.description || '', priority: dd.priority || 'high', addressed: synthClosed }, false));
      }
    });

    // Build contractor dropdown options (from flattened rows so per-obs
    // contractors are represented).
    var ctrSet = {};
    rows.forEach(function(r) { ctrSet[r.ctrName || 'Site General'] = true; });
    var ctrOpts = '<option value="all">All Contractors</option>';
    Object.keys(ctrSet).sort().forEach(function(n) { ctrOpts += '<option value="' + esc(n) + '"' + (f.contractor === n ? ' selected' : '') + '>' + esc(n) + '</option>'; });

    // Filter — per-observation.
    var filtered = rows.filter(function(r) {
      if (f.status === 'Outstanding' && (r.isAddressed || r.isIAR)) return false;
      if (f.status === 'Closed' && !r.isAddressed) return false;
      if (f.status === 'IAR' && !r.isIAR) return false;
      if (f.priority !== 'all' && r.obsPri !== f.priority) return false;
      if (f.contractor !== 'all' && (r.ctrName || 'Site General') !== f.contractor) return false;
      if (f.search) {
        var text = ('#' + r.numLabel + ' ' + r.desc + ' ' + (r.ctrName || '')).toLowerCase();
        if (text.indexOf(f.search) < 0) return false;
      }
      return true;
    });

    // Sort — per-observation. 'num' sorts by pin number, then observation
    // index, so #4A precedes #4B.
    filtered.sort(function(a, b) {
      var av, bv;
      if (_sortField === 'num') {
        var an = a.dd.num || 0, bn = b.dd.num || 0;
        if (an !== bn) return _sortDir === 'asc' ? an - bn : bn - an;
        return _sortDir === 'asc' ? a.oi - b.oi : b.oi - a.oi;
      }
      else if (_sortField === 'status') { av = a.isIAR ? 'iar' : (a.isAddressed ? 'closed' : 'open'); bv = b.isIAR ? 'iar' : (b.isAddressed ? 'closed' : 'open'); }
      else if (_sortField === 'priority') { av = a.obsPri; bv = b.obsPri; }
      else if (_sortField === 'contractor') { av = a.ctrName || ''; bv = b.ctrName || ''; }
      else if (_sortField === 'drawing') { av = a.dwgName || ''; bv = b.dwgName || ''; }
      else { av = a.desc || ''; bv = b.desc || ''; }
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
    h += '<span style="font-size:calc(12px + var(--ts));color:var(--silver);">' + filtered.length + ' observation' + (filtered.length !== 1 ? 's' : '') + '</span>';
    h += '</div>';

    // Table — S123 P5.6: revert to table-layout:auto since we removed the
    // letter-badge from the chip. Simple pill + auto layout = no cutoff.
    h += '<div style="overflow-x:auto;">';
    h += '<table id="tasks-table" style="width:100%;border-collapse:collapse;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;">';
    h += '<thead><tr style="background:var(--smoke);border-bottom:2px solid var(--border);">';
    h += th('num', '#') + th('drawing', 'Drawing') + th('description', 'Description');
    h += th('contractor', 'Contractor');
    h += th('status', 'Status') + th('priority', 'Priority') + '<th class="tt-th"></th>';
    h += '</tr></thead><tbody>';

    filtered.forEach(function(r) {
      var dd = r.dd;

      h += '<tr data-defic-id="' + esc(dd.id) + '" data-obs-idx="' + r.oi + '" data-action="open-pin-editor" style="border-bottom:1px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent;">';
      h += '<td style="padding:8px 10px;font-weight:700;color:#9C2742;">#' + esc(r.numLabel) + '</td>';
      h += '<td style="padding:8px 10px;word-break:break-word;">' + esc(r.dwgName || '\u2014') + '</td>';
      h += '<td style="padding:8px 10px;word-break:break-word;">' + esc(r.desc || '(no description)') + '</td>';
      // S123 P5.6: simple colored pill — pure name in colored chip.
      var _ctrName = r.ctrName || 'Unknown';
      h += '<td style="padding:8px 10px;"><span class="ctr-tag ' + ctrColorClass(r.ctrName) + '" title="' + esc(_ctrName) + '">' + esc(_ctrName) + '</span></td>';
      // S116 Push 13: 18px horizontal padding on Status / Priority cells so
      // the chips have breathing room.
      // S133: status is now per-observation — Closed when this observation is
      // addressed, Outstanding otherwise. IAR (pin-level) shows in Priority.
      var statusBaseTxt = r.isAddressed ? 'Closed' : 'Outstanding';
      var statusBaseCls = r.isAddressed ? 'closed' : 'outstanding';
      h += '<td style="padding:8px 18px 8px 12px;">';
      h += '<span class="tt-status ' + statusBaseCls + '">' + statusBaseTxt + '</span>';
      h += '</td>';
      // S116 Push 10: IAR overrides priority display. S133: priority is the
      // observation's own priority; IAR (pin-level) still overrides it.
      h += '<td style="padding:8px 12px 8px 18px;">';
      if (r.isIAR) {
        h += '<span class="tt-priority iar">\u26A1 IAR</span>';
      } else {
        h += '<span class="tt-priority ' + r.obsPri + '">' + esc(r.obsPri.charAt(0).toUpperCase() + r.obsPri.slice(1)) + '</span>';
      }
      h += '</td>';
      h += '<td style="padding:8px 10px;"><button class="tt-jump" data-action="jump-defic" data-defic-id="' + esc(dd.id) + '" data-obs-idx="' + r.oi + '">Jump</button></td>';
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
  var obsIdx = card.getAttribute('data-obs-idx') || '0';
  if (!deficId) return;
  // S121 Push 12: composite drag id "deficId|obsIdx" so per-obs cards
  // route their drop to the correct observation.
  var dragId = deficId + '|' + obsIdx;
  _dragId = deficId;       // legacy global, kept for any old callers
  _dragObsId = dragId;     // new global used by Push 12 drop handler
  e.dataTransfer.setData('text/plain', dragId);
  e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
});
document.addEventListener('dragend', function(e) {
  var card = e.target.closest && e.target.closest('.pin-kanban-card');
  if (card) card.classList.remove('dragging');
  _dragId = null;
  _dragObsId = null;
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
      var obsIdx = jump.getAttribute('data-obs-idx');
      document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === 'deficiencies'); });
      document.querySelectorAll('.panel').forEach(function(p) { p.classList.toggle('active', p.id === 'panel-deficiencies'); });
      setTimeout(function() {
        // S133: target the specific observation card; fall back to the pin
        // group if the obs card isn't in the DOM (e.g. on a different
        // lifecycle tab). The old '.defic-item' selector never matched —
        // the Deficiency tab renders '.defic-obs-card' / '.defic-pin-group'.
        var card = null;
        if (obsIdx != null) {
          card = document.querySelector('.defic-obs-card[data-defic-id="' + deficId + '"][data-obs-idx="' + obsIdx + '"]');
        }
        if (!card) card = document.querySelector('.defic-pin-group[data-defic-id="' + deficId + '"]');
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
