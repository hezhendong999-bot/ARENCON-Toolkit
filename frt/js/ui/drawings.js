/**
 * ARENCON FRT v2 — Drawings UI
 * ═════════════════════════════
 * 
 * Read-only drawing gallery renderer.
 * Shows drawing cards grouped by folder, with pin counts.
 * No thumbnails yet (Phase 2 — requires IDB blob loading).
 */

import { Model } from '../data/model.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function countPins(drawingId, allDefics) {
  var n = 0;
  allDefics.forEach(function(d) { if (d.defic.drawingId === drawingId) n++; });
  return n;
}

function buildDrawingCard(d, allDefics) {
  var pins = countPins(d.id, allDefics);
  var imgSrc = d.r2Url || d.dataUrl || '';
  var h = '<div class="drawing-card" style="width:180px;display:inline-block;vertical-align:top;margin:0 8px 12px 0;">';

  if (imgSrc) {
    h += '<div class="drawing-thumb" style="height:120px;overflow:hidden;">';
    h += '<img src="' + esc(imgSrc) + '" style="width:100%;height:120px;object-fit:cover;display:block;" loading="lazy" onerror="this.parentElement.innerHTML=\'\\uD83D\\uDCC4\';this.parentElement.style.cssText=\'height:120px;background:#e8eaf0;display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:32px;\'">';
    h += '</div>';
  } else {
    h += '<div class="drawing-thumb" style="height:120px;background:#e8eaf0;display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:32px;">';
    h += '\uD83D\uDCC4';
    h += '</div>';
  }

  h += '<div style="padding:8px 10px;display:flex;justify-content:space-between;align-items:center;gap:4px;">';
  h += '<span style="font-size:calc(12px + var(--ts));font-weight:600;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + esc(d.name || 'Untitled') + '</span>';
  if (pins > 0) {
    h += '<span class="pin-count" style="font-size:calc(11px + var(--ts));color:var(--silver);background:var(--smoke);padding:2px 8px;border-radius:10px;flex-shrink:0;">\uD83D\uDCCC ' + pins + '</span>';
  }
  h += '</div>';
  h += '</div>';
  return h;
}

export var initDrawings = {
  render: function() {
    var container = document.getElementById('drawings-container');
    if (!container) return;
    var proj = Model.getProject();
    if (!proj) { container.innerHTML = ''; return; }

    var drawings = proj.drawings || [];
    if (!drawings.length) {
      container.innerHTML = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:12px;">No drawings uploaded yet.</p>';
      return;
    }

    var allDefics = Model.getAllDeficiencies(proj);

    // Group by folder
    var folders = {};
    var unfiled = [];
    drawings.forEach(function(d) {
      if (d.folder) {
        if (!folders[d.folder]) folders[d.folder] = [];
        folders[d.folder].push(d);
      } else {
        unfiled.push(d);
      }
    });

    var html = '';

    // Unfiled drawings
    if (unfiled.length) {
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;font-weight:700;font-size:calc(14px + var(--ts));color:var(--steel);">';
      html += '\uD83D\uDCC1 Unfiled plans <span style="font-weight:400;color:var(--silver);">(' + unfiled.length + ')</span></div>';
      html += '<div style="display:flex;flex-wrap:wrap;">';
      unfiled.forEach(function(d) { html += buildDrawingCard(d, allDefics); });
      html += '</div></div>';
    }

    // Folders
    var folderNames = Object.keys(folders).sort();
    folderNames.forEach(function(fn) {
      var items = folders[fn];
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;font-weight:700;font-size:calc(14px + var(--ts));color:var(--steel);">';
      html += '\u25BE \uD83D\uDCC1 ' + esc(fn) + ' <span style="font-weight:400;color:var(--silver);">(' + items.length + ' plans)</span></div>';
      html += '<div style="display:flex;flex-wrap:wrap;">';
      items.forEach(function(d) { html += buildDrawingCard(d, allDefics); });
      html += '</div></div>';
    });

    container.innerHTML = html;
    console.log('[Drawings] Rendered', drawings.length, 'drawings in', folderNames.length + 1, 'groups');
  }
};

Model.onChange('project', function() { initDrawings.render(); });
