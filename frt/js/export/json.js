/**
 * ARENCON FRT v2 — JSON Import/Export
 * ════════════════════════════════════
 * 
 * Load/save v1-compatible JSON project files.
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';

export var initJSONExport = {

  /**
   * Export current project as JSON file download.
   */
  exportJSON: function() {
    var proj = Model.getProject();
    if (!proj) { toast('No project to export'); return; }

    // Build filename
    var fn = Model.getSmartFilename().replace(/[^a-zA-Z0-9._\- ]/g, '_') + '.json';

    // Deep clone and strip binary data
    var data = JSON.parse(JSON.stringify(proj));
    _stripBinaryFields(data);

    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fn;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported: ' + fn);
  },

  /**
   * Import a project from a JSON file.
   */
  importJSON: function(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var raw = e.target.result;
        var data = JSON.parse(raw);

        // Handle v1 format: could be a single project or { projects: {...} }
        var proj = null;
        if (data.info && (data.contractors || data.generalDeficiencies)) {
          // Direct project object
          proj = data;
        } else if (data.projects) {
          // Multi-project format — take the first (or most recent)
          var keys = Object.keys(data.projects);
          if (keys.length === 0) { toast('No projects found in file'); return; }
          if (keys.length === 1) {
            proj = data.projects[keys[0]];
          } else {
            // Multiple projects — pick most recently modified
            var best = null;
            keys.forEach(function(k) {
              var p = data.projects[k];
              if (!best || (p.modified || '') > (best.modified || '')) best = p;
            });
            proj = best;
            toast('Loaded most recent of ' + keys.length + ' projects');
          }
        } else {
          toast('Unrecognized file format');
          return;
        }

        if (!proj) { toast('No project data found'); return; }

        // Strip inspector from imported data — inspector is per-user, not per-project
        if (proj.info) {
          delete proj.info.inspectorName;
        }
        if (proj.signatures) {
          delete proj.signatures.sigInspectorName;
          delete proj.signatures.sigInspectorDate;
          delete proj.signatures.sigInspectorData;
        }

        Model.setProject(proj);
        Model.saveNow();
        toast('Loaded: ' + Model.getSmartFilename());

      } catch (err) {
        console.error('[JSON] Import error:', err);
        toast('Error loading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }
};

// ── Helpers ──────────────────────────────────────────────

function _stripBinaryFields(obj) {
  // Remove dataUrl / dataBlob fields from drawings and photos
  // (these are stored in IDB blob stores, not in JSON)
  if (obj.drawings) {
    obj.drawings.forEach(function(d) {
      delete d.dataUrl;
      delete d.dataBlob;
      delete d.thumbDataUrl;
    });
  }
  if (obj.photos) {
    obj.photos.forEach(function(p) {
      delete p.dataUrl;
      delete p.dataBlob;
    });
  }
  (obj.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(function(d) {
      (d.photos || []).forEach(function(p) {
        delete p.dataUrl;
        delete p.dataBlob;
      });
      (d.observations || []).forEach(function(o) {
        (o.photos || []).forEach(function(p) {
          delete p.dataUrl;
          delete p.dataBlob;
        });
      });
    });
  });
}
