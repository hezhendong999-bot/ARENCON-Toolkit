/**
 * ARENCON FRT v2 — All Deficiencies (Pins/Tasks) UI
 * Sortable table with status badges and pin indicators.
 */

import { Model } from '../data/model.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function deficDesc(d) {
  if (d.observations && d.observations.length && d.observations[0].text) return d.observations[0].text;
  if (d.entries && d.entries.length && d.entries[0].description) return d.entries[0].description;
  return d.description || '';
}

var _sortField = 'num';
var _sortDir = 'asc';

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

    // Sort
    all.sort(function(a, b) {
      var av, bv;
      if (_sortField === 'num') { av = a.defic.num || 0; bv = b.defic.num || 0; }
      else if (_sortField === 'status') { av = a.defic.status || ''; bv = b.defic.status || ''; }
      else if (_sortField === 'priority') { av = a.defic.priority || ''; bv = b.defic.priority || ''; }
      else if (_sortField === 'contractor') { av = a.contractorName || ''; bv = b.contractorName || ''; }
      else { av = deficDesc(a.defic); bv = deficDesc(b.defic); }
      if (typeof av === 'number') return _sortDir === 'asc' ? av - bv : bv - av;
      return _sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

    var arrow = _sortDir === 'asc' ? ' \u25B4' : ' \u25BE';
    function thSort(field, label) {
      return '<th class="tt-th" data-sort="' + field + '" style="cursor:pointer;user-select:none;">' + label + (_sortField === field ? arrow : '') + '</th>';
    }

    var h = '<div style="font-size:calc(12px + var(--ts));color:var(--silver);margin-bottom:8px;">' + all.length + ' deficiencies total</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:calc(13px + var(--ts));">';
    h += '<thead><tr style="border-bottom:2px solid var(--border);">';
    h += thSort('num', '#') + thSort('desc', 'Description') + thSort('contractor', 'Contractor') + thSort('status', 'Status') + thSort('priority', 'Priority') + '<th class="tt-th">Pin</th>';
    h += '</tr></thead><tbody>';
    all.forEach(function(d, i) {
      var desc = deficDesc(d.defic);
      var trunc = desc.length > 60 ? desc.substring(0, 60) + '\u2026' : desc;
      var isClosed = d.defic.status === 'closed' || d.defic.status === 'Addressed & Closed';
      var statusColor = isClosed ? '#1A7A4A' : '#C0392B';
      var statusText = isClosed ? 'Closed' : 'Outstanding';
      var priColors = { high: '#C0392B', low: '#E67E22', general: '#1A7A4A' };
      var pri = d.defic.priority || 'general';
      var hasPinIcon = d.defic.drawingId && d.defic.pinX != null ? '\uD83D\uDCCC' : '';
      var bg = i % 2 === 0 ? 'transparent' : 'var(--smoke)';
      h += '<tr style="border-bottom:1px solid var(--border);background:' + bg + ';">';
      h += '<td style="padding:8px 10px;font-weight:700;color:#9C2742;">' + (d.defic.num || '?') + '</td>';
      h += '<td style="padding:8px 10px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(trunc) + '</td>';
      h += '<td style="padding:8px 10px;">' + esc(d.contractorName) + '</td>';
      h += '<td style="padding:8px 10px;"><span style="color:' + statusColor + ';font-weight:700;font-size:calc(11px + var(--ts));">' + statusText + '</span></td>';
      h += '<td style="padding:8px 10px;"><span style="color:' + (priColors[pri] || '#4A5568') + ';font-weight:600;font-size:calc(11px + var(--ts));">' + esc(pri.charAt(0).toUpperCase() + pri.slice(1)) + '</span></td>';
      h += '<td style="padding:8px 10px;text-align:center;">' + hasPinIcon + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table>';
    container.innerHTML = h;
  }
};

Model.onChange('project', function() { initPins.render(); });

// Sort header click
document.addEventListener('click', function(e) {
  var th = e.target.closest && e.target.closest('[data-sort]');
  if (!th) return;
  var field = th.getAttribute('data-sort');
  if (_sortField === field) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
  else { _sortField = field; _sortDir = 'asc'; }
  initPins.render();
});
