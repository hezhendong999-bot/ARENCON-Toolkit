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

  // Multiple observations
  var hasMulti = obs.length > 1;
  if (obs.length) {
    obs.forEach(function(o, oi) {
      var lbl = hasMulti ? String.fromCharCode(65 + oi) + ') ' : '';
      var addrCls = o.addressed ? 'border-left:3px solid #1A7A4A;background:rgba(26,122,74,.05);' : '';
      h += '<div style="margin-bottom:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;' + addrCls + '">';
      // Observation header row
      if (hasMulti) {
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
        h += '<span style="font-size:calc(11px + var(--ts));font-weight:700;color:' + (o.addressed ? '#1A7A4A' : 'var(--ink)') + ';">' + lbl + 'Observation</span>';
        h += '<div style="display:flex;gap:4px;align-items:center;">';
        h += '<button data-action="toggle-addressed" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:' + (o.addressed ? '#1A7A4A' : '#CBD5E0') + ';color:white;border-radius:4px;padding:2px 8px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;">' + (o.addressed ? '\u2611 Addressed' : '\u2610 Open') + '</button>';
        if (obs.length > 1) h += '<button data-action="remove-obs" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:#E53E3E;color:white;border-radius:4px;padding:2px 6px;font-size:calc(10px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;" title="Remove observation">\u2715</button>';
        h += '</div></div>';
      }
      // Textarea
      h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" ';
      h += 'style="width:100%;min-height:56px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:var(--smoke);"';
      h += ' placeholder="Describe the observation...">' + esc(o.text || '') + '</textarea>';
      // Observation photos
      var obsPhotos = o.photos || [];
      if (obsPhotos.length) {
        h += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0;">';
        obsPhotos.forEach(function(ph) {
          var src = ph.r2Url || ph.dataUrl || '';
          if (src) {
            h += '<div style="width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border);">';
            h += '<img src="' + esc(src) + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">';
            h += '</div>';
          }
        });
        h += '</div>';
      }
      // Photo zone per observation
      h += '<div class="photo-zone-compact" data-action="photo-drop" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '"';
      h += ' ondragover="event.preventDefault();this.classList.add(\'drag-over\')"';
      h += ' ondragleave="this.classList.remove(\'drag-over\')">';
      h += '<button class="pz-upload" data-action="photo-upload" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '">\uD83D\uDCCE Upload</button>';
      h += '<button class="pz-camera" data-action="photo-camera" data-defic-id="' + esc(d.id) + '" data-obs-idx="' + oi + '" style="border:none;background:#37474F;color:white;border-radius:5px;padding:4px 10px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));font-weight:600;cursor:pointer;">\uD83D\uDCF7 Camera</button>';
      h += '</div>';
      h += '</div>';
    });
    // Add observation button
    h += '<button data-action="add-obs" data-defic-id="' + esc(d.id) + '" style="border:1px dashed var(--border);background:transparent;color:var(--silver);border-radius:4px;padding:4px 10px;font-size:calc(11px + var(--ts));font-family:Calibri,sans-serif;cursor:pointer;margin-bottom:6px;">+ Add Observation</button>';
  } else {
    h += '<textarea data-action="obs-text" data-defic-id="' + esc(d.id) + '" data-obs-idx="0" ';
    h += 'style="width:100%;min-height:56px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:calc(13px + var(--ts));font-family:Calibri,sans-serif;resize:vertical;box-sizing:border-box;background:var(--smoke);"';
    h += ' placeholder="Describe the deficiency..."></textarea>';
  }

  // Activity log
  var activity = d.activity || [];
  if (activity.length) {
    h += '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);">';
    h += '<div style="font-size:calc(10px + var(--ts));font-weight:700;color:var(--silver);margin-bottom:4px;">Activity Log</div>';
    activity.slice().sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); }).forEach(function(a) {
      if (a.autoGenerated) return;
      var isCtr = (a.label || '').indexOf('Contractor') >= 0;
      var bgColor = isCtr ? '#FEF3E2' : '#EBF4FF';
      var lColor = isCtr ? '#E67E22' : '#1565C0';
      h += '<div style="margin-bottom:3px;padding:4px 6px;background:' + bgColor + ';border-radius:4px;font-size:calc(11px + var(--ts));">';
      h += '<span style="color:' + lColor + ';font-weight:600;">' + esc(a.label || 'Note') + '</span> <span style="color:var(--silver);font-size:calc(10px + var(--ts));">' + esc(a.date || '') + '</span>';
      h += '<div style="margin-top:2px;">' + esc(a.text || '\u2014') + '</div>';
      h += '</div>';
    });
    h += '</div>';
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

  if (action === 'add-obs') {
    var deficId = e.target.getAttribute('data-defic-id');
    var obs = Model.addObservation(deficId);
    if (obs) {
      initDeficiencies.render();
      toast('Observation added');
    }
  }

  if (action === 'remove-obs') {
    var deficId = e.target.getAttribute('data-defic-id');
    var obsIdx = parseInt(e.target.getAttribute('data-obs-idx') || '0');
    showConfirm('Remove Observation', 'Remove this observation? This cannot be undone.').then(function(yes) {
      if (yes) {
        Model.removeObservation(deficId, obsIdx);
        initDeficiencies.render();
        toast('Observation removed');
      }
    });
  }

  if (action === 'toggle-addressed') {
    var deficId = e.target.getAttribute('data-defic-id');
    var obsIdx = parseInt(e.target.getAttribute('data-obs-idx') || '0');
    Model.toggleObsAddressed(deficId, obsIdx);
    initDeficiencies.render();
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

// ── Photo Upload Handling ────────────────────────────────
var _photoTargetDeficId = null;
var _photoTargetObsIdx = 0;

function _compressAndAdd(file, deficId, obsIdx) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      // Compress to max 1600px wide, JPEG 0.8 quality
      var maxW = 1600;
      var w = img.width;
      var h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      Model.addObservationPhoto(deficId, obsIdx, dataUrl);
      initDeficiencies.render();
      toast('Photo added');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

document.addEventListener('click', function(e) {
  var action = e.target.getAttribute && e.target.getAttribute('data-action');
  if (!action) {
    var btn = e.target.closest && e.target.closest('[data-action]');
    if (btn) action = btn.getAttribute('data-action');
    if (!action) return;
    e.target = btn;
  }

  if (action === 'photo-upload' || action === 'photo-camera') {
    var deficId = e.target.getAttribute('data-defic-id');
    if (!deficId) return;
    _photoTargetDeficId = deficId;
    _photoTargetObsIdx = parseInt(e.target.getAttribute('data-obs-idx') || '0');

    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    if (action === 'photo-camera') inp.capture = 'environment';
    inp.onchange = function() {
      if (!inp.files || !inp.files.length) return;
      for (var i = 0; i < inp.files.length; i++) {
        _compressAndAdd(inp.files[i], _photoTargetDeficId, _photoTargetObsIdx);
      }
    };
    inp.click();
  }
});

// Drag & drop on photo zones
document.addEventListener('drop', function(e) {
  var zone = e.target.closest && e.target.closest('[data-action="photo-drop"]');
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove('drag-over');
  var deficId = zone.getAttribute('data-defic-id');
  var obsIdx = parseInt(zone.getAttribute('data-obs-idx') || '0');
  if (!deficId || !e.dataTransfer || !e.dataTransfer.files) return;
  for (var i = 0; i < e.dataTransfer.files.length; i++) {
    if (e.dataTransfer.files[i].type.startsWith('image/')) {
      _compressAndAdd(e.dataTransfer.files[i], deficId, obsIdx);
    }
  }
});
