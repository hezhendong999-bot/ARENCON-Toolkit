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
      html += '<div class="photo-thumb-grid">';
      sitePhotos.forEach(function(p, i) {
        var imgSrc = p.r2Url || p.dataUrl || '';
        html += '<div class="photo-thumb">';
        if (imgSrc) {
          html += '<img src="' + esc(imgSrc) + '" loading="lazy" style="width:120px;height:100px;object-fit:cover;display:block;" onerror="this.style.display=\'none\'">';
        } else {
          html += '<div style="width:120px;height:100px;background:#e8eaf0;display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:20px;">\uD83D\uDCF7</div>';
        }
        if (p.caption) html += '<div style="padding:3px 6px;font-size:calc(10px + var(--ts));color:var(--steel);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.caption) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
    console.log('[Photos] Site:', sitePhotos.length, '| Deficiency:', deficPhotoCount);
  }
};

Model.onChange('project', function() { initPhotos.render(); });
