/**
 * ARENCON FRT v2 — Photos UI
 * ═══════════════════════════
 * 
 * Read-only site photos summary. No thumbnails yet (need IDB/R2 blobs).
 * Shows count and metadata for each photo.
 */

import { Model } from '../data/model.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export var initPhotos = {
  render: function() {
    var container = document.getElementById('photos-container');
    if (!container) return;
    var photos = Model.getSitePhotos();

    // Also count deficiency photos
    var allDefics = Model.getAllDeficiencies();
    var deficPhotoCount = 0;
    allDefics.forEach(function(d) {
      (d.defic.observations || []).forEach(function(o) {
        deficPhotoCount += (o.photos || []).length;
      });
      deficPhotoCount += (d.defic.photos || []).length;
    });

    if (!photos.length && deficPhotoCount === 0) {
      container.innerHTML = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:12px;">No photos in project.</p>';
      return;
    }

    var html = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">';

    // Site photos stat
    html += '<div style="background:var(--smoke);border-radius:8px;padding:12px 20px;text-align:center;">';
    html += '<div style="font-size:24px;font-weight:500;color:var(--fg);">' + photos.length + '</div>';
    html += '<div style="font-size:12px;color:var(--silver);text-transform:uppercase;letter-spacing:.5px;">Site Photos</div>';
    html += '</div>';

    // Deficiency photos stat
    html += '<div style="background:var(--smoke);border-radius:8px;padding:12px 20px;text-align:center;">';
    html += '<div style="font-size:24px;font-weight:500;color:var(--fg);">' + deficPhotoCount + '</div>';
    html += '<div style="font-size:12px;color:var(--silver);text-transform:uppercase;letter-spacing:.5px;">Deficiency Photos</div>';
    html += '</div>';

    html += '</div>';

    // Photo list (metadata only — no thumbnails until IDB/R2 integration)
    if (photos.length) {
      html += '<div style="font-size:calc(12px + var(--ts));color:var(--steel);font-weight:600;margin-bottom:8px;">Site Photo Records</div>';
      photos.forEach(function(p, i) {
        var hasR2 = p.r2Key || p.r2Url;
        html += '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:calc(12px + var(--ts));display:flex;align-items:center;gap:8px;">';
        html += '<span style="color:var(--silver);">' + (i + 1) + '.</span>';
        html += '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.caption || p.id || 'Photo ' + (i + 1)) + '</span>';
        if (hasR2) html += '<span style="font-size:10px;">\u2601\uFE0F</span>';
        html += '</div>';
      });
    }

    container.innerHTML = html;
  }
};

Model.onChange('project', function() { initPhotos.render(); });
