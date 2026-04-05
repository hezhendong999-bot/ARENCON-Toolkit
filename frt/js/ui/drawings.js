/**
 * ARENCON FRT v2 — Drawings UI
 * ═════════════════════════════
 * 
 * Read-only gallery of drawing cards grouped by folder.
 * Shows name, pin count, folder. No thumbnails yet (Phase 4).
 */

import { Model } from '../data/model.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export var initDrawings = {
  render: function() {
    var container = document.getElementById('drawings-container');
    if (!container) return;
    var drawings = Model.getDrawings();
    if (!drawings.length) {
      container.innerHTML = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:12px;">No drawings in project. Upload drawings in the v1 FRT, then load the JSON here.</p>';
      return;
    }

    // Group by folder
    var folders = {};
    var noFolder = [];
    drawings.forEach(function(d) {
      if (d.folder) {
        if (!folders[d.folder]) folders[d.folder] = [];
        folders[d.folder].push(d);
      } else {
        noFolder.push(d);
      }
    });

    var html = '';

    // Render folder groups
    var folderNames = Object.keys(folders).sort();
    folderNames.forEach(function(fname) {
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:calc(13px + var(--ts));font-weight:700;color:var(--steel);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:8px;">\uD83D\uDCC1 ' + esc(fname) + ' (' + folders[fname].length + ')</div>';
      html += '<div class="drawing-gallery">';
      folders[fname].forEach(function(d) { html += _buildCard(d); });
      html += '</div></div>';
    });

    // Render unfiled drawings
    if (noFolder.length) {
      if (folderNames.length) {
        html += '<div style="font-size:calc(13px + var(--ts));font-weight:700;color:var(--steel);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:8px;">Unfiled (' + noFolder.length + ')</div>';
      }
      html += '<div class="drawing-gallery">';
      noFolder.forEach(function(d) { html += _buildCard(d); });
      html += '</div>';
    }

    container.innerHTML = html;
  }
};

function _buildCard(d) {
  // Count pins for this drawing
  var allDefics = Model.getAllDeficiencies();
  var pinCount = 0;
  allDefics.forEach(function(item) {
    if (item.defic.drawingId === d.id) pinCount++;
  });

  var h = '<div class="drawing-card" style="cursor:default;">';
  h += '<div class="drawing-thumb" style="height:120px;background:var(--smoke);display:flex;align-items:center;justify-content:center;">';
  h += '<span style="font-size:36px;opacity:.3;">\uD83D\uDCC4</span>';
  h += '</div>';
  h += '<div style="padding:8px 10px;display:flex;align-items:center;justify-content:space-between;gap:6px;">';
  h += '<span style="font-size:calc(12px + var(--ts));font-weight:600;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + esc(d.name || 'Untitled') + '</span>';
  if (pinCount > 0) {
    h += '<span class="pin-count" style="font-size:calc(11px + var(--ts));color:var(--silver);background:var(--smoke);padding:2px 8px;border-radius:10px;">\uD83D\uDCCC ' + pinCount + '</span>';
  }
  h += '</div>';
  h += '</div>';
  return h;
}

Model.onChange('project', function() { initDrawings.render(); });
