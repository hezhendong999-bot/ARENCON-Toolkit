/**
 * ARENCON FRT v2 — Photos UI
 * ═══════════════════════════
 * 
 * Site photos summary. Shows count and basic info.
 * No thumbnails yet (Phase 2 — requires IDB/R2 blob loading).
 */

import { Model } from '../data/model.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export var initPhotos = {
  render: function() {
    var container = document.getElementById('photos-container');
    if (!container) return;
    var proj = Model.getProject();
    if (!proj) { container.innerHTML = ''; return; }

    var sitePhotos = proj.photos || [];
    var allDefics = Model.getAllDeficiencies(proj);

    // Count deficiency photos
    var deficPhotoCount = 0;
    allDefics.forEach(function(d) {
      (d.defic.observations || []).forEach(function(o) {
        deficPhotoCount += (o.photos || []).length;
      });
      deficPhotoCount += (d.defic.photos || []).length;
    });

    if (!sitePhotos.length && !deficPhotoCount) {
      container.innerHTML = '<p style="color:var(--silver);font-size:calc(13px + var(--ts));padding:12px;">No photos in this project.</p>';
      return;
    }

    var html = '<div style="padding:8px 0;">';

    // Summary stats
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">';
    if (sitePhotos.length) {
      html += '<div style="background:var(--smoke);border-radius:8px;padding:12px 18px;flex:1;min-width:120px;">';
      html += '<div style="font-size:24px;font-weight:700;color:var(--fg);">' + sitePhotos.length + '</div>';
      html += '<div style="font-size:calc(12px + var(--ts));color:var(--steel);font-weight:600;">Site Photos</div>';
      html += '</div>';
    }
    if (deficPhotoCount) {
      html += '<div style="background:var(--smoke);border-radius:8px;padding:12px 18px;flex:1;min-width:120px;">';
      html += '<div style="font-size:24px;font-weight:700;color:var(--fg);">' + deficPhotoCount + '</div>';
      html += '<div style="font-size:calc(12px + var(--ts));color:var(--steel);font-weight:600;">Deficiency Photos</div>';
      html += '</div>';
    }
    html += '</div>';

    // Site photo list (names only, no thumbnails)
    if (sitePhotos.length) {
      html += '<div style="font-weight:700;font-size:calc(13px + var(--ts));color:var(--steel);margin-bottom:8px;">Site Photos</div>';
      sitePhotos.forEach(function(p, i) {
        var hasR2 = p.r2Key || p.r2Url;
        html += '<div style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:calc(12px + var(--ts));display:flex;align-items:center;gap:8px;">';
        html += '<span style="color:var(--silver);">' + (i + 1) + '.</span>';
        html += '<span style="flex:1;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.name || p.filename || 'Photo ' + (i + 1)) + '</span>';
        if (p.caption) html += '<span style="color:var(--silver);font-size:calc(11px + var(--ts));">' + esc(p.caption) + '</span>';
        if (hasR2) html += '<span style="font-size:9px;">\u2601\uFE0F</span>';
        html += '</div>';
      });
    }

    html += '</div>';
    container.innerHTML = html;
    console.log('[Photos] Site:', sitePhotos.length, '| Deficiency:', deficPhotoCount);
  }
};

Model.onChange('project', function() { initPhotos.render(); });
