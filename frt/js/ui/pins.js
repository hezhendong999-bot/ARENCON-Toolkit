/**
 * ARENCON FRT v2 — All Deficiencies (Pins/Tasks) UI
 * Sortable table with status badges, IAR, pin indicators, clickable rows.
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function deficDesc(d) {
  if (d.observations && d.observations.length && d.observations[0].text) return d.observations[0].text;
  if (d.entries && d.entries.length && d.entries[0].description) return d.entries[0].description;
  return d.description || '';
}

var _sortField = 'num';
var _sortDir = 'asc';
var _searchQuery = '';

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

    // Filter by search
    var filtered = all;
    if (_searchQuery) {
      filtered = all.filter(function(d) {
        var text = ((d.defic.num || '') + ' ' + deficDesc(d.defic) + ' ' + (d.contractorName || '')).toLowerCase();
        return text.indexOf(_searchQuery) >= 0;
      });
    }

    // Sort
    filtered.sort(function(a, b) {
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
      return '<th data-sort="' + field + '" style="cursor:pointer;user-select:none;padding:8px 10px;text-align:left;font-size:calc(11px + var(--ts));font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--steel);">' + label + (_sortField === field ? arrow : '') + '</th>';
    }

    var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">';
    h += '<div style="font-size:calc(12px + var(--ts));color:var(--silver);">' + all.length + ' deficiencies' + (filtered.length !== all.length ? ' (' + filtered.length + ' shown)' : '') + '</div>';
    h += '<div style="flex:1;"></div>';
    h += '<input type="text" id="pins-search" placeholder="\uD83D\uDD0D Search..." value="' + esc(_searchQuery) + '" style="max-width:200px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));background:var(--smoke);color:var(--fg);">';
    h += '</div>';

    h += '<div style="overflow-x:auto;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:calc(13px + var(--ts));">';
    h += '<thead><tr style="border-bottom:2px solid var(--border);">';
    h += thSort('num', '#') + thSort('desc', 'Description') + thSort('contractor', 'Contractor') + thSort('status', 'Status') + thSort('priority', 'Priority') + '<th style="padding:8px 10px;text-align:center;font-size:calc(11px + var(--ts));font-weight:700;color:var(--steel);">IAR</th><th style="padding:8px 10px;text-align:center;font-size:calc(11px + var(--ts));font-weight:700;color:var(--steel);">Pin</th>';
    h += '</tr></thead><tbody>';

    filtered.forEach(function(d, i) {
      var desc = deficDesc(d.defic);
      var trunc = desc.length > 60 ? desc.substring(0, 60) + '\u2026' : desc;
      var isClosed = d.defic.status === 'closed' || d.defic.status === 'Addressed & Closed';
      var statusColor = isClosed ? '#1A7A4A' : '#C0392B';
      var statusText = isClosed ? 'Closed' : 'Outstanding';
      var priColors = { high: '#C0392B', low: '#E67E22', general: '#1A7A4A' };
      var pri = d.defic.priority || 'general';
      var hasPinIcon = d.defic.drawingId && d.defic.pinX != null ? '\uD83D\uDCCC' : '';
      var iarIcon = d.defic.iar ? '<span style="color:#E91E8C;font-weight:700;">IAR</span>' : '';
      var bg = i % 2 === 0 ? 'transparent' : 'var(--smoke)';
      h += '<tr data-action="jump-defic" data-defic-id="' + esc(d.defic.id) + '" style="border-bottom:1px solid var(--border);background:' + bg + ';cursor:pointer;" onmouseover="this.style.background=\'rgba(156,39,66,.04)\'" onmouseout="this.style.background=\'' + bg + '\'">';
      h += '<td style="padding:8px 10px;font-weight:700;color:#9C2742;">' + (d.defic.num || '?') + '</td>';
      h += '<td style="padding:8px 10px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(trunc) + '</td>';
      h += '<td style="padding:8px 10px;">' + esc(d.contractorName) + '</td>';
      h += '<td style="padding:8px 10px;"><span style="color:' + statusColor + ';font-weight:700;font-size:calc(11px + var(--ts));">' + statusText + '</span></td>';
      h += '<td style="padding:8px 10px;"><span style="color:' + (priColors[pri] || '#4A5568') + ';font-weight:600;font-size:calc(11px + var(--ts));">' + esc(pri.charAt(0).toUpperCase() + pri.slice(1)) + '</span></td>';
      h += '<td style="padding:8px 10px;text-align:center;">' + iarIcon + '</td>';
      h += '<td style="padding:8px 10px;text-align:center;">' + hasPinIcon + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    container.innerHTML = h;
  }
};

Model.onChange('project', function() { initPins.render(); });

// Sort header click
document.addEventListener('click', function(e) {
  var th = e.target.closest && e.target.closest('[data-sort]');
  if (th && th.closest('#pins-container')) {
    var field = th.getAttribute('data-sort');
    if (_sortField === field) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
    else { _sortField = field; _sortDir = 'asc'; }
    initPins.render();
    return;
  }

  // Row click — jump to deficiency tab
  var row = e.target.closest && e.target.closest('[data-action="jump-defic"]');
  if (row) {
    var deficId = row.getAttribute('data-defic-id');
    if (deficId) {
      // Switch to deficiencies tab
      var tabs = document.querySelectorAll('.nav-tab');
      tabs.forEach(function(t) { t.classList.toggle('active', t.dataset.tab === 'deficiencies'); });
      document.querySelectorAll('.panel').forEach(function(p) { p.classList.toggle('active', p.id === 'panel-deficiencies'); });
      // Try to scroll to the deficiency card
      setTimeout(function() {
        var card = document.querySelector('.defic-item[data-defic-id="' + deficId + '"]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '2px solid #9C2742';
          setTimeout(function() { card.style.outline = ''; }, 2000);
        }
      }, 100);
    }
  }
});

// Search input
document.addEventListener('input', function(e) {
  if (e.target.id === 'pins-search') {
    _searchQuery = (e.target.value || '').trim().toLowerCase();
    initPins.render();
    // Restore focus after re-render
    var inp = document.getElementById('pins-search');
    if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
  }
});
