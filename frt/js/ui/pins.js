/**
 * ARENCON FRT v2 — All Deficiencies (Pins/Tasks) UI
 * Read-only table view of all deficiencies across all contractors.
 */

import { Model } from '../data/model.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function deficDesc(d) {
  if (d.observations && d.observations.length && d.observations[0].text) return d.observations[0].text;
  if (d.entries && d.entries.length && d.entries[0].description) return d.entries[0].description;
  return d.description || '';
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

    var h = '<table style="width:100%;border-collapse:collapse;font-size:calc(13px + var(--ts));">';
    h += '<thead><tr style="border-bottom:2px solid var(--border);">';
    h += '<th class="tt-th">#</th><th class="tt-th">Description</th><th class="tt-th">Contractor</th><th class="tt-th">Status</th><th class="tt-th">Priority</th>';
    h += '</tr></thead><tbody>';
    all.forEach(function(d) {
      var desc = deficDesc(d.defic);
      var trunc = desc.length > 80 ? desc.substring(0, 80) + '\u2026' : desc;
      var isClosed = d.defic.status === 'closed' || d.defic.status === 'Addressed & Closed';
      var statusClass = isClosed ? 'closed' : (d.defic.status === 'iar' ? 'iar' : 'outstanding');
      var statusText = isClosed ? 'Closed' : (d.defic.status === 'iar' ? 'IAR' : 'Outstanding');
      var priClass = (d.defic.priority || 'general');
      h += '<tr style="border-bottom:1px solid var(--border);">';
      h += '<td style="padding:8px 10px;font-weight:700;">' + (d.defic.num || '?') + '</td>';
      h += '<td style="padding:8px 10px;">' + esc(trunc) + '</td>';
      h += '<td style="padding:8px 10px;">' + esc(d.contractorName) + '</td>';
      h += '<td style="padding:8px 10px;"><span class="tt-status ' + statusClass + '">' + statusText + '</span></td>';
      h += '<td style="padding:8px 10px;"><span class="tt-priority ' + priClass + '">' + esc(priClass.charAt(0).toUpperCase() + priClass.slice(1)) + '</span></td>';
      h += '</tr>';
    });
    h += '</tbody></table>';
    container.innerHTML = h;
  }
};

Model.onChange('project', function() { initPins.render(); });
