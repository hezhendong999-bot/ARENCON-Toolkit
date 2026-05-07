/**
 * ARENCON FRT v2 — Project Info UI
 * ═════════════════════════════════
 * 
 * Two-way data binding for project info fields.
 * Fields use data-field attribute to map to Model.getProject().info[field].
 */

import { Model } from '../data/model.js';

var _wired = false;

export var initProjectInfo = {

  /**
   * Render: populate all fields from Model.
   */
  render: function() {
    var proj = Model.getProject();
    if (!proj || !proj.info) return;

    // Populate all data-field inputs
    var panel = document.getElementById('panel-info');
    if (!panel) return;
    var fields = panel.querySelectorAll('[data-field]');
    fields.forEach(function(el) {
      var key = el.getAttribute('data-field');
      var val = proj.info[key];
      if (val !== undefined && val !== null) {
        el.value = val;
      }
    });

    // Update date modified display
    var dm = document.getElementById('field-date-modified');
    if (dm && proj.modified) {
      dm.value = new Date(proj.modified).toLocaleString('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    }

    // Update header filename
    _updateHeaderFilename();

    // Wire inputs on first render
    if (!_wired) {
      this.wireInputs();
      _wired = true;
    }
  },

  /**
   * Wire input change handlers — two-way binding.
   */
  wireInputs: function() {
    var panel = document.getElementById('panel-info');
    if (!panel) return;

    panel.querySelectorAll('[data-field]').forEach(function(el) {
      // Skip readonly fields
      if (el.readOnly) return;

      el.addEventListener('input', function() {
        var field = this.getAttribute('data-field');
        if (!field) return;

        // Special formatting for project number
        if (field === 'projectNumber') {
          _formatProjectNumber(this);
        }

        // Update Model — this triggers debounced IDB save
        Model.updateField(field, this.value);

        // Update header on name-affecting fields
        if (field === 'projectNumber' || field === 'projectName' ||
            field === 'client' || field === 'revision') {
          _updateHeaderFilename();
        }

        // Update date modified display
        var dm = document.getElementById('field-date-modified');
        if (dm) {
          dm.value = new Date().toLocaleString('en-CA', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
          });
        }
      });
    });

    console.log('[ProjectInfo] Inputs wired');
  }
};

// ── Helpers ──────────────────────────────────────────────

function _updateHeaderFilename() {
  var fn = Model.getSmartFilename();
  var hf = document.getElementById('header-filename');
  if (hf) hf.textContent = fn;
  var pbf = document.getElementById('pb-filename');
  if (pbf) pbf.textContent = fn;
  // Update page title
  document.title = 'ARENCON \u2014 ' + fn;
}

function _formatProjectNumber(el) {
  // Auto-format: insert period after 4 digits if not present
  var v = el.value.replace(/[^0-9.]/g, '');
  if (v.length > 4 && v.indexOf('.') === -1) {
    v = v.substr(0, 4) + '.' + v.substr(4);
    el.value = v;
  }
}

// Subscribe to project load events — re-render when project changes
Model.onChange('project', function() {
  initProjectInfo.render();
});
