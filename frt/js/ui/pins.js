/**
 * ARENCON FRT v2 — All Deficiencies (Pins/Tasks) UI
 * Matches v1 layout: search + status/priority/contractor filters,
 * table with #, Drawing, Description, Contractor, Status, Priority, Pin, Jump columns.
 */

import { Model } from '../data/model.js';
import { buildDeficCard } from './deficiencies.js';

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

export var initPins = {
  render: function() {
    var container = document.getElementById('pins-container');
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
    h += '<table id="tasks-table" style="width:100%;border-collapse:collapse;font-size:calc(14px + var(--ts));font-family:Calibri,sans-serif;">';
    h += '<thead><tr style="background:var(--smoke);border-bottom:2px solid var(--border);">';
    h += th('num', '#') + th('drawing', 'Drawing') + th('description', 'Description') + th('contractor', 'Contractor') + th('status', 'Status') + th('priority', 'Priority') + '<th class="tt-th"></th>';
    h += '</tr></thead><tbody>';

    filtered.forEach(function(d) {
      var dd = d.defic;
      var desc = deficDesc(dd);
      var trunc = desc.length > 40 ? desc.substring(0, 40) + '\u2026' : desc;
      var isClosed = dd.status === 'closed' || dd.status === 'Addressed & Closed';
      var isIAR = dd.iar;
      var statusText = isIAR ? 'IAR' : (isClosed ? 'Closed' : 'Outstanding');
      var statusCls = isIAR ? 'iar' : (isClosed ? 'closed' : 'outstanding');
      var priCls = dd.priority || 'general';
      var dwgName = _getDrawingName(dd.drawingId);

      h += '<tr data-defic-id="' + esc(dd.id) + '" style="border-bottom:1px solid var(--border);">';
      h += '<td style="padding:8px 10px;font-weight:700;color:#9C2742;">#' + (dd.num || '?') + '</td>';
      h += '<td style="padding:8px 10px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(14px + var(--ts));color:var(--steel);">' + esc(dwgName || '\u2014') + '</td>';
      h += '<td style="padding:8px 10px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(trunc || '(no description)') + '</td>';
      h += '<td style="padding:8px 10px;">' + esc(d.contractorName) + '</td>';
      h += '<td style="padding:8px 10px;"><span class="tt-status ' + statusCls + '">' + statusText + '</span></td>';
      h += '<td style="padding:8px 10px;"><span class="tt-priority ' + priCls + '">' + esc((dd.priority || 'general').charAt(0).toUpperCase() + (dd.priority || 'general').slice(1)) + '</span></td>';
      h += '<td style="padding:8px 10px;"><button class="tt-jump" data-action="jump-defic" data-defic-id="' + esc(dd.id) + '">Jump</button></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    container.innerHTML = h;
  }
};

Model.onChange('project', function() { initPins.render(); });

// Sort, filter, and jump handlers
document.addEventListener('click', function(e) {
  // Sort header
  var th = e.target.closest && e.target.closest('.tt-th[data-sort]');
  if (th && th.closest('#pins-container')) {
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
  var row = e.target.closest && e.target.closest('#pins-container tr[data-defic-id]');
  if (row && !e.target.closest('button') && !e.target.closest('select') && !e.target.closest('input')) {
    var deficId = row.getAttribute('data-defic-id');
    var existingExpand = row.nextElementSibling;
    // Collapse any other open expand
    var allExpands = document.querySelectorAll('#pins-container .tt-expand-row');
    allExpands.forEach(function(ex) { ex.remove(); });
    // Toggle: if the same row was already expanded, just collapse (already removed above)
    if (existingExpand && existingExpand.classList.contains('tt-expand-row') && existingExpand.getAttribute('data-expand-id') === deficId) {
      row.classList.remove('tt-row-active');
      return;
    }
    // Remove active state from all rows
    document.querySelectorAll('#pins-container tr.tt-row-active').forEach(function(r) { r.classList.remove('tt-row-active'); });
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
