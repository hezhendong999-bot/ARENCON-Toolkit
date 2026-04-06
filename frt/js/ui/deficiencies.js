/**
 * ARENCON FRT v2 — Deficiencies UI
 * ═════════════════════════════════
 * 
 * Interactive deficiency management:
 *   - Add/remove contractors
 *   - Add deficiencies per contractor or general
 *   - Edit observation text (two-way binding)
 *   - Change status/priority
 *   - Lifecycle tabs (Active / Site General / Closed)
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm, showPrompt } from '../shared/dialogs.js';

// ── Helpers ──────────────────────────────────────────────
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function deficDesc(d) {
  if (d.observations && d.observations.length && d.observations[0].text) return d.observations[0].text;
  if (d.entries && d.entries.length && d.entries[0].description) return d.entries[0].description;
  return d.description || '';
}
function deficIsOpen(d) { return d.status === 'open' || d.status === 'Outstanding'; }
function deficIsClosed(d) { return d.status === 'closed' || d.status === 'Addressed & Closed'; }

var _activeDlcTab = 'active';

// ── Deficiency Card (interactive) ────────────────────────
function buildDeficCard(d, ctrId) {
  var obs = d.observations || [];
  var firstObs = obs.length ? obs[0] : null;
  var isOpen = deficIsOpen(d);
  var isClosed = deficIsClosed(d);
  var circleColor = isClosed ? '#1A7A4A' : '#C0392B';

  var h = '<div class="defic-item" data-defic-id="' + esc(d.id) + '" data-status="' + esc(d.status || 'open') + '">';
  h += '<div class="defic-item-row">';
  h += '<div class="defic-num-circle" style="background:' + circleColor + ';">' + (d.num || '?') + '</div>';
  h += '<div class="defic-item-content">';

  // Status + priority row
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">';
  h += '<select class="pin-status-sel" data-action="status" data-defic-id="' + esc(d.id) + '" data-status="' + esc(d.status === 'open' ? 'Outstanding' : d.status === 'closed' ? 'Addressed & Closed' : d.status || 'Outstanding') + '" style="width:auto;padding:3px 8px;font-size:calc(11px + var(--ts));">';
  h += '<option value="open"' + (isOpen ? ' selected' : '') + '>Outstanding</option>';
  h += '<option value="closed"' + (isClosed ? ' selected' : '') + '>Addressed &amp; Closed</option>';
  h += '</select>';
  h += '<select data-action="priority" data-defic-id="' + esc(d.id) + '" style="padding:3px 8px;border:1.5px solid var(--border);border-radius:4px;font-size:calc(11px + var(--ts));font-family:Calibri,sans-serif;font-weight:600;background:var(--smoke);">';
  var pris = ['general', 'high', 'low'];
  pris.forEach(function(p) {
    h += '<option value="' + p + '"' + (d.priority === p ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
  });
  h += '</select>';
  if (d.drawingId) h += '<span style="font-size:calc(11px + var(--ts));color:var(--silver);">\uD83D\uDCCC</span>';
  h += '</div>';

  // Observation textarea
  if (firstObs) {
    h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="0" ';
    h += 'style="width:100%;min-height:56px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:var(--smoke);"';
    h += ' placeholder="Describe the deficiency...">' + esc(firstObs.text || '') + '</textarea>';
  } else {
    h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="0" ';
    h += 'style="width:100%;min-height:56px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:var(--smoke);"';
    h += ' placeholder="Describe the deficiency..."></textarea>';
  }

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
  items.forEach(function(d) { h += buildDeficCard(d, ctrId); });

  h += '<div class="add-defic-btn-wrap">';
  h += '<button class="btn btn-outline btn-sm" data-action="add-defic" data-ctr-id="' + esc(ctrId || '') + '">+ Add Deficiency</button>';
  h += '</div></div>';
  return h;
}

// ── Render ───────────────────────────────────────────────
export var initDeficiencies = {

  render: function() {
    var proj = Model.getProject();
    var container = document.getElementById('deficiencies-container');
    if (!container) return;
    if (!proj) { container.innerHTML = ''; return; }

    var dlcTabs = document.getElementById('defic-lifecycle-tabs');
    if (dlcTabs) dlcTabs.style.display = 'flex';

    var allDefics = Model.getAllDeficiencies(proj);
    var activeCount = 0, generalCount = 0, closedCount = 0;
    allDefics.forEach(function(d) {
      if (deficIsClosed(d.defic)) closedCount++;
      else if (!d.contractorId) generalCount++;
      else activeCount++;
    });

    if (_activeDlcTab === 'active') {
      _renderActiveTab(proj, container);
    } else if (_activeDlcTab === 'general') {
      _renderGeneralTab(proj, container);
    } else if (_activeDlcTab === 'closed') {
      _renderClosedTab(allDefics.filter(function(d) { return deficIsClosed(d.defic); }), container);
    }

    _updateDlcCounts(activeCount, generalCount, closedCount);
  }
};

function _renderActiveTab(proj, container) {
  var html = '';

  // Add Contractor button
  html += '<div style="padding:10px 0 6px;display:flex;gap:8px;flex-wrap:wrap;">';
  html += '<button class="btn btn-outline btn-sm" data-action="add-contractor" style="color:#1A7A4A;border-color:rgba(26,122,74,.3);">+ Add Contractor</button>';
  html += '<button class="btn btn-outline btn-sm" data-action="add-general" style="color:#6A1B9A;border-color:rgba(106,27,154,.3);">+ General Deficiency</button>';
  html += '</div>';

  (proj.contractors || []).forEach(function(c) {
    var active = (c.deficiencies || []).filter(deficIsOpen);
    var total = (c.deficiencies || []).length;
    html += buildGroup(c.id, c.name || 'Unnamed Contractor', active, total);
  });

  if (!(proj.contractors || []).length) {
    html += '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:16px;text-align:center;">No contractors yet. Click "+ Add Contractor" to start.</p>';
  }
  container.innerHTML = html;
}

function _renderGeneralTab(proj, container) {
  var gen = (proj.generalDeficiencies || []).filter(deficIsOpen);
  var html = '<div style="padding:10px 0 6px;">';
  html += '<button class="btn btn-outline btn-sm" data-action="add-general" style="color:#6A1B9A;border-color:rgba(106,27,154,.3);">+ General Deficiency</button>';
  html += '</div>';
  if (!gen.length) {
    html += '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:16px;text-align:center;">No site general deficiencies.</p>';
  } else {
    html += buildGroup(null, 'Site General', gen, (proj.generalDeficiencies || []).length);
  }
  container.innerHTML = html;
}

function _renderClosedTab(closedDefics, container) {
  if (!closedDefics.length) {
    container.innerHTML = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:24px 0;text-align:center;">No closed deficiencies yet.</p>';
    return;
  }
  var html = '';
  closedDefics.forEach(function(d) { html += buildDeficCard(d.defic, d.contractorId); });
  container.innerHTML = '<div class="defic-group"><div class="defic-group-header" style="background:#1C2333;color:white;padding:10px 16px;"><span>\u2705 Closed Items</span><span style="font-size:calc(12px + var(--ts));opacity:.7;">' + closedDefics.length + '</span></div>' + html + '</div>';
}

function _updateDlcCounts(activeCount, generalCount, closedCount) {
  document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(tab) {
    var type = tab.getAttribute('data-dlc');
    var count = type === 'active' ? activeCount : type === 'general' ? generalCount : closedCount;
    var label = type === 'active' ? 'Active' : type === 'general' ? 'Site General' : 'Closed';
    tab.textContent = label + (count > 0 ? ' (' + count + ')' : '');
  });
}

// ── Event Delegation ─────────────────────────────────────
var _obsDebounce = {};

document.addEventListener('click', function(e) {
  // DLC tab switching
  var dlcTab = e.target.closest && e.target.closest('.dlc-tab');
  if (dlcTab) {
    var type = dlcTab.getAttribute('data-dlc');
    if (type) {
      _activeDlcTab = type;
      document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-dlc') === type);
      });
      initDeficiencies.render();
    }
    return;
  }

  var action = e.target.getAttribute && e.target.getAttribute('data-action');
  if (!action) {
    var btn = e.target.closest && e.target.closest('[data-action]');
    if (btn) action = btn.getAttribute('data-action');
    else return;
    e.target = btn;
  }

  if (action === 'add-contractor') {
    showPrompt('Add Contractor', 'Contractor name').then(function(name) {
      if (name) {
        Model.addContractor(name);
        initDeficiencies.render();
        toast('Added: ' + name);
      }
    });
  }

  if (action === 'add-defic') {
    var ctrId = e.target.getAttribute('data-ctr-id') || null;
    var defic = Model.addDeficiency(ctrId || null);
    if (defic) {
      initDeficiencies.render();
      toast('Deficiency #' + defic.num + ' added');
    }
  }

  if (action === 'add-general') {
    var defic = Model.addDeficiency(null);
    if (defic) {
      _activeDlcTab = 'general';
      document.querySelectorAll('#defic-lifecycle-tabs .dlc-tab').forEach(function(t) {
        t.classList.toggle('active', t.getAttribute('data-dlc') === 'general');
      });
      initDeficiencies.render();
      toast('General deficiency #' + defic.num + ' added');
    }
  }
});

// Status and priority changes via select
document.addEventListener('change', function(e) {
  var action = e.target.getAttribute && e.target.getAttribute('data-action');
  if (!action) return;

  if (action === 'status') {
    var deficId = e.target.getAttribute('data-defic-id');
    Model.updateDeficStatus(deficId, e.target.value);
    // Re-render after status change (item may move tabs)
    setTimeout(function() { initDeficiencies.render(); }, 50);
  }

  if (action === 'priority') {
    var deficId = e.target.getAttribute('data-defic-id');
    Model.updateDeficPriority(deficId, e.target.value);
  }
});

// Observation text editing with debounce
document.addEventListener('input', function(e) {
  var action = e.target.getAttribute && e.target.getAttribute('data-action');
  if (action !== 'obs-text') return;

  var deficId = e.target.getAttribute('data-defic-id');
  var obsIdx = parseInt(e.target.getAttribute('data-obs-idx') || '0');
  var text = e.target.value;

  // Debounce: don't save on every keystroke
  if (_obsDebounce[deficId]) clearTimeout(_obsDebounce[deficId]);
  _obsDebounce[deficId] = setTimeout(function() {
    Model.updateObservation(deficId, obsIdx, text);
  }, 500);
});

// Re-render when project loads
Model.onChange('project', function() { initDeficiencies.render(); });
