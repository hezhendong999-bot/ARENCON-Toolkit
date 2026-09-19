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

        // Strip signature data from imported projects — signatures are per-session
        if (proj.signatures) {
          delete proj.signatures.sigInspectorName;
          delete proj.signatures.sigInspectorDate;
          delete proj.signatures.sigInspectorData;
        }

        /* S730 — A FILE IS NOT THE PROJECT. Before this, any JSON dropped on
           a tablet became the live document in IndexedDB with no check that
           it was even the same job, and the next merge treated it as this
           device's work. Two gates in Hub mode (the same ?project= test
           app.js uses), none of them a schema validator:
           1. The document id in the file must be the document id the live
              model carries (proj.id — what the model itself mints and
              notifies with; live bodies carry no other identity). An export
              of THIS report from any device passes; another job, or an old
              export from before the row was recreated, does not.
           2. The project number must match, so the refusal can say two
              numbers a person recognises.
           3. An issued report is never replaced from a file — the same
              predicate that locks the screen decides.
           Standalone may load anything, as before. After any load the model
           is marked dirty: setProject clears the flag, and a replaced
           document that the cloud has not seen is unsent work by definition. */
        var _hubPid = null;
        try { _hubPid = new URLSearchParams(window.location.search).get('project'); } catch (_) {}
        if (_hubPid) {
          var _live = Model.getProject();
          var _liveNum = (_live && _live.info && _live.info.projectNumber) || '';
          var _fileNum = (proj.info && proj.info.projectNumber) || '';
          var _issued = false;
          try { _issued = !!(window.FRT_ISSUED_LOCKED && window.FRT_ISSUED_LOCKED()); } catch (_) {}
          if (_issued) {
            toast('This report is issued. An issued report is not replaced from a file \u2014 use Issue \u2192 Revise. Nothing was loaded.', 8000);
            return;
          }
          if (!_live || !_live.id || !proj.id || proj.id !== _live.id) {
            toast('That file is not this report. File: ' + (_fileNum || 'unknown project') +
                  ' \u2014 open: ' + (_liveNum || 'unknown project') + '. Nothing was loaded.', 9000);
            return;
          }
          if (_fileNum && _liveNum && _fileNum !== _liveNum) {
            toast('Project number differs. File: ' + _fileNum + ' \u2014 open: ' + _liveNum + '. Nothing was loaded.', 9000);
            return;
          }
        }

        Model.setProject(proj);
        try { if (Model.touch) Model.touch(); } catch (_) {}   /* S730: a loaded file is unsent work */
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
