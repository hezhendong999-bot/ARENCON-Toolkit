/**
 * ARENCON FRT v2 — Deficiencies UI
 * ═════════════════════════════════
 * 
 * Read-only renderer for contractor groups and deficiency cards.
 * Phase 1: displays data from Model. No editing yet.
 */

import { Model } from '../data/model.js';

// ── Helpers ──────────────────────────────────────────────
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function deficDesc(d) {
  if (d.observations && d.observations.length && d.observations[0].text) return d.observations[0].text;
  if (d.entries && d.entries.length && d.entries[0].description) return d.entries[0].description;
  return d.description || '';
}
function deficIsOpen(d) { return d.status === 'open' || d.status === 'Outstanding'; }
function deficIsClosed(d) { return d.status === 'closed' || d.status === 'Addressed & Closed'; }
function obsCount(d) {
  if (d.observations) return d.observations.length;
  if (d.entries) return d.entries.length;
  return 0;
}
function photoCount(d) {
  var n = 0;
  (d.observations || []).forEach(function(o) { n += (o.photos || []).length; });
  (d.photos || []).forEach(function() { n++; });
  return n;
}

// ── Active DLC tab ───────────────────────────────────────
var _activeDlcTab = 'active';

// ── Card Builder ─────────────────────────────────────────
function buildDeficCard(d) {
  var desc = deficDesc(d);
  var truncDesc = desc.length > 120 ? desc.substring(0, 120) + '\u2026' : desc;
  var isOpen = deficIsOpen(d);
  var isClosed = deficIsClosed(d);
  var statusText = isClosed ? 'Closed' : (d.status === 'iar' ? 'IAR' : 'Outstanding');
  var statusClass = isClosed ? 'closed' : (d.status === 'iar' ? 'iar' : 'outstanding');
  var nObs = obsCount(d);
  var nPhotos = photoCount(d);
  var circleColor = isClosed ? '#1A7A4A' : '#C0392B';

  var h = '<div class="defic-item" data-status="' + esc(d.status || 'open') + '">';
  h += '<div class="defic-item-row">';
  h += '<div class="defic-num-circle" style="background:' + circleColor + ';">' + (d.num || '?') + '</div>';
  h += '<div class="defic-item-content">';

  // Status + priority row
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">';
  h += '<span class="tt-status ' + statusClass + '">' + statusText + '</span>';
  if (d.priority && d.priority !== 'general') {
    h += '<span class="tt-priority ' + esc(d.priority) + '">' + esc(d.priority.charAt(0).toUpperCase() + d.priority.slice(1)) + '</span>';
  }
  if (nObs > 0) h += '<span style="font-size:calc(11px + var(--ts));color:var(--silver);">\uD83D\uDCDD ' + nObs + '</span>';
  if (nPhotos > 0) h += '<span style="font-size:calc(11px + var(--ts));color:var(--silver);">\uD83D\uDCF7 ' + nPhotos + '</span>';
  if (d.drawingId) h += '<span style="font-size:calc(11px + var(--ts));color:var(--silver);">\uD83D\uDCCC</span>';
  h += '</div>';

  // Description
  h += '<div style="font-size:calc(13px + var(--ts));color:var(--fg);line-height:1.45;">' + esc(truncDesc) + '</div>';

  // Noted date
  if (d.notedDate || d.date) {
    h += '<div class="defic-noted">' + esc(d.notedDate || d.date) + '</div>';
  }

  h += '</div></div></div>';
  return h;
}

// ── Group Builder ────────────────────────────────────────
function buildGroup(ctrId, name, items, totalCount) {
  var countLabel = items.length + ' active';
  if (totalCount && totalCount > items.length) countLabel += ' / ' + totalCount + ' total';

  var h = '<div class="defic-group">';
  h += '<div class="defic-group-header" style="background:#1C2333;color:white;padding:10px 16px;">';
  h += '<span style="display:flex;align-items:center;gap:8px;">\u25BE \uD83D\uDC77 ' + esc(name) + '</span>';
  h += '<span style="font-size:calc(12px + var(--ts));opacity:.7;">' + countLabel + '</span>';
  h += '</div>';

  if (!items.length) {
    h += '<div class="defic-group-empty">No active deficiencies for this contractor.</div>';
  }
  items.forEach(function(d) { h += buildDeficCard(d); });
  h += '</div>';
  return h;
}

// ── Render ───────────────────────────────────────────────
export var initDeficiencies = {

  render: function() {
    var proj = Model.getProject();
    var container = document.getElementById('deficiencies-container');
    if (!container) return;
    if (!proj) { container.innerHTML = ''; return; }

    // Show lifecycle tabs
    var dlcTabs = document.getElementById('defic-lifecycle-tabs');
    if (dlcTabs) dlcTabs.style.display = 'flex';

    var allDefics = Model.getAllDeficiencies(proj);
    var activeDefics = allDefics.filter(function(d) { return deficIsOpen(d.defic); });
    var closedDefics = allDefics.filter(function(d) { return deficIsClosed(d.defic); });

    if (_activeDlcTab === 'active') {
      _renderActiveTab(proj, container);
    } else if (_activeDlcTab === 'general') {
      _renderGeneralTab(proj, container);
    } else if (_activeDlcTab === 'closed') {
      _renderClosedTab(closedDefics, container);
    }

    // Update tab counts — Active excludes general deficiencies
    var ctrActiveCount = 0;
    (proj.contractors || []).forEach(function(c) {
      (c.deficiencies || []).forEach(function(d) { if (deficIsOpen(d)) ctrActiveCount++; });
    });
    var genActiveCount = (proj.generalDeficiencies || []).filter(deficIsOpen).length;
    _updateDlcCounts(ctrActiveCount, genActiveCount, closedDefics.length);
  }
};

function _renderActiveTab(proj, container) {
  var html = '';
  // Render each contractor group
  (proj.contractors || []).forEach(function(c) {
    var active = (c.deficiencies || []).filter(deficIsOpen);
    var total = (c.deficiencies || []).length;
    if (total > 0) {
      html += buildGroup(c.id, c.name || 'Unnamed Contractor', active, total);
    }
  });
  if (!html) {
    html = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:24px 0;text-align:center;">No contractor deficiencies. Load a project with deficiency data to see them here.</p>';
  }
  container.innerHTML = html;
}

function _renderGeneralTab(proj, container) {
  var gen = (proj.generalDeficiencies || []).filter(deficIsOpen);
  if (!gen.length) {
    container.innerHTML = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:24px 0;text-align:center;">No site general deficiencies.</p>';
    return;
  }
  container.innerHTML = buildGroup(null, 'Site General', gen, (proj.generalDeficiencies || []).length);
}

function _renderClosedTab(closedDefics, container) {
  if (!closedDefics.length) {
    container.innerHTML = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:24px 0;text-align:center;">No closed deficiencies yet.</p>';
    return;
  }
  var html = '';
  closedDefics.forEach(function(d) { html += buildDeficCard(d.defic); });
  container.innerHTML = '<div class="defic-group"><div class="defic-group-header" style="background:#1C2333;color:white;padding:10px 16px;"><span>\u2705 Closed Items</span><span style="font-size:calc(12px + var(--ts));opacity:.7;">' + closedDefics.length + '</span></div>' + html + '</div>';
}

function _updateDlcCounts(activeCount, generalCount, closedCount) {
  var tabs = document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab');
  tabs.forEach(function(tab) {
    var type = tab.getAttribute('data-dlc');
    var count = type === 'active' ? activeCount : type === 'general' ? generalCount : closedCount;
    var label = type === 'active' ? 'Active' : type === 'general' ? 'Site General' : 'Closed';
    tab.textContent = label + (count > 0 ? ' (' + count + ')' : '');
  });
}

// ── DLC Tab Switching ────────────────────────────────────
document.addEventListener('click', function(e) {
  var tab = e.target.closest && e.target.closest('.dlc-tab');
  if (!tab) return;
  var type = tab.getAttribute('data-dlc');
  if (!type) return;
  _activeDlcTab = type;
  document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
    t.classList.toggle('active', t.getAttribute('data-dlc') === type);
  });
  initDeficiencies.render();
});

// Re-render when project loads
Model.onChange('project', function() { initDeficiencies.render(); });
