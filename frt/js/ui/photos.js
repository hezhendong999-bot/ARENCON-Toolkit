/**
 * ARENCON FRT v2 — Photos UI
 * Full photo gallery: site photos + deficiency photos, grouped by source.
 * Upload zone with drag-drop, camera, and import buttons.
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm } from '../shared/dialogs.js';
import { R2 } from '../data/r2.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export var initPhotos = {
  render: function() {
    var container = document.getElementById('photos-container');
    if (!container) return;
    var proj = Model.getProject();
    if (!proj) { container.innerHTML = ''; return; }

    var sitePhotos = proj.photos || [];
    var allDefics = Model.getAllDeficiencies(proj);

    // Collect all deficiency photos with source info
    var deficPhotos = [];
    allDefics.forEach(function(d) {
      (d.defic.observations || []).forEach(function(o, oi) {
        (o.photos || []).forEach(function(ph, phi) {
          deficPhotos.push({
            photo: ph,
            deficNum: d.defic.num,
            deficId: d.defic.id,
            obsIdx: oi,
            photoIdx: phi,
            contractorName: d.contractorName
          });
        });
      });
    });

    var totalCount = sitePhotos.length + deficPhotos.length;

    var html = '';

    // Summary stats
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin:20px 0 16px;">';
    html += '<div style="background:var(--smoke);border:1px solid var(--border);border-radius:8px;padding:12px 18px;flex:1;min-width:100px;">';
    html += '<div style="font-size:24px;font-weight:700;color:var(--fg);">' + totalCount + '</div>';
    html += '<div style="font-size:calc(12px + var(--ts));color:var(--steel);font-weight:600;">Total Photos</div></div>';
    html += '<div style="background:var(--smoke);border:1px solid var(--border);border-radius:8px;padding:12px 18px;flex:1;min-width:100px;">';
    html += '<div style="font-size:24px;font-weight:700;color:var(--fg);">' + sitePhotos.length + '</div>';
    html += '<div style="font-size:calc(12px + var(--ts));color:var(--steel);font-weight:600;">Site Photos</div></div>';
    html += '<div style="background:var(--smoke);border:1px solid var(--border);border-radius:8px;padding:12px 18px;flex:1;min-width:100px;">';
    html += '<div style="font-size:24px;font-weight:700;color:var(--fg);">' + deficPhotos.length + '</div>';
    html += '<div style="font-size:calc(12px + var(--ts));color:var(--steel);font-weight:600;">Deficiency Photos</div></div>';
    html += '</div>';

    // Site photos section
    if (sitePhotos.length) {
      html += '<div style="font-weight:700;font-size:calc(13px + var(--ts));color:var(--steel);margin-bottom:8px;">Site Photos</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">';
      sitePhotos.forEach(function(p, i) {
        var imgSrc = p.thumb || p.r2Url || p.dataUrl || '';
        html += '<div style="position:relative;width:120px;border-radius:6px;overflow:hidden;border:1px solid var(--border);background:var(--smoke);">';
        if (imgSrc) {
          html += '<img data-action="open-site-lightbox" data-photo-idx="' + i + '" src="' + esc(imgSrc) + '" loading="lazy" style="width:120px;height:100px;object-fit:cover;display:block;cursor:pointer;" onerror="this.style.display=\'none\'">';
        } else {
          html += '<div style="width:120px;height:100px;display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:24px;">\uD83D\uDCF7</div>';
        }
        html += '<button data-action="delete-site-photo" data-photo-idx="' + i + '" style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.6);color:white;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;line-height:22px;text-align:center;cursor:pointer;padding:0;" title="Remove photo">\u2715</button>';
        html += '<div style="padding:3px 6px;font-size:calc(10px + var(--ts));color:var(--steel);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.caption || p.filename || 'Photo ' + (i + 1)) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Deficiency photos section
    if (deficPhotos.length) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">';
      deficPhotos.forEach(function(dp) {
        var ph = dp.photo;
        var imgSrc = ph.r2Url || ph.dataUrl || '';
        if (!imgSrc) return;
        html += '<div data-action="open-defic-lightbox" data-defic-id="' + esc(dp.deficId) + '" data-obs-idx="' + dp.obsIdx + '" data-photo-idx="' + dp.photoIdx + '" style="position:relative;width:120px;border-radius:6px;overflow:hidden;border:1px solid var(--border);background:var(--smoke);cursor:pointer;">';
        html += '<img src="' + esc(imgSrc) + '" loading="lazy" style="width:120px;height:100px;object-fit:cover;display:block;">';
        html += '<div style="padding:3px 6px;font-size:calc(10px + var(--ts));color:var(--steel);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#' + dp.deficNum + ' \u2022 ' + esc(dp.contractorName) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (!totalCount) {
      html += '<p style="color:var(--silver);font-size:calc(13px + var(--ts));text-align:center;padding:16px;">No photos yet. Upload site photos or add photos to deficiencies.</p>';
    }

    container.innerHTML = html;
  }
};

Model.onChange('project', function() { initPhotos.render(); });

// Click handlers
document.addEventListener('click', function(e) {
  // Site photo lightbox
  var el = e.target.closest && e.target.closest('[data-action="open-site-lightbox"]');
  if (el) {
    var idx = parseInt(el.getAttribute('data-photo-idx') || '0');
    var proj = Model.getProject();
    if (proj && (proj.photos || []).length && window._frtLightbox) {
      var fullPhotos = (proj.photos || []).map(function(p) {
        return { r2Url: p.r2Url, dataUrl: p.dataUrl, caption: p.caption || p.filename || '', filename: p.filename };
      });
      window._frtLightbox.open(fullPhotos, idx);
    }
    return;
  }

  // Deficiency photo lightbox from gallery
  var dp = e.target.closest && e.target.closest('[data-action="open-defic-lightbox"]');
  if (dp) {
    var deficId = dp.getAttribute('data-defic-id');
    var obsIdx = parseInt(dp.getAttribute('data-obs-idx') || '0');
    var photoIdx = parseInt(dp.getAttribute('data-photo-idx') || '0');
    var f = Model.findDeficiency(deficId);
    if (f && f.defic.observations && f.defic.observations[obsIdx]) {
      var photos = f.defic.observations[obsIdx].photos || [];
      if (photos.length && window._frtLightbox) {
        window._frtLightbox.open(photos, photoIdx);
      }
    }
    return;
  }

  // Delete site photo
  var del = e.target.closest && e.target.closest('[data-action="delete-site-photo"]');
  if (del) {
    var idx = parseInt(del.getAttribute('data-photo-idx') || '0');
    showConfirm('Remove Photo', 'Remove this site photo?').then(function(yes) {
      if (yes) {
        Model.removeSitePhoto(idx);
        initPhotos.render();
        toast('Site photo removed');
      }
    });
  }
});

// ── Site Photo Upload ───────────────────────────────────
function _compressSitePhoto(file, cb) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxW = 1600;
      var w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      var tw = Math.min(200, w);
      var ts = tw / w;
      var tc = document.createElement('canvas');
      tc.width = tw; tc.height = Math.round(h * ts);
      tc.getContext('2d').drawImage(img, 0, 0, tc.width, tc.height);
      var thumb = tc.toDataURL('image/jpeg', 0.7);
      tc.width = 1; tc.height = 1;
      canvas.width = 1; canvas.height = 1;
      cb(dataUrl, thumb);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function _addSitePhoto(file) {
  _compressSitePhoto(file, function(dataUrl, thumb) {
    var proj = Model.getProject();
    if (!proj) return;
    if (!proj.photos) proj.photos = [];
    var photo = {
      id: 'sph_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      filename: file.name,
      dataUrl: dataUrl,
      thumb: thumb,
      caption: '',
      addedDate: new Date().toISOString().split('T')[0]
    };
    proj.photos.push(photo);
    Model.saveNow();
    initPhotos.render();
    toast('Site photo added');
    var pid = new URLSearchParams(window.location.search).get('project');
    if (pid) {
      R2.uploadPhoto(pid, photo, 'original').then(function() { Model.saveNow(); });
    }
  });
}

function _handleSitePhotoFiles(files) {
  Array.from(files).forEach(function(f) {
    if (f.type.startsWith('image/')) _addSitePhoto(f);
  });
}

// Expose for drag-drop
window._handleSitePhotoDrop = _handleSitePhotoFiles;

// Wire upload buttons
var uploadBtn = document.getElementById('site-photo-upload-btn');
var cameraBtn = document.getElementById('site-photo-camera-btn');
var fileInput = document.getElementById('site-photo-input');
var cameraInput = document.getElementById('site-photo-camera');

if (uploadBtn) uploadBtn.addEventListener('click', function() { fileInput.click(); });
if (cameraBtn) cameraBtn.addEventListener('click', function() { cameraInput.click(); });
if (fileInput) fileInput.addEventListener('change', function(e) {
  if (e.target.files) _handleSitePhotoFiles(e.target.files);
  e.target.value = '';
});
if (cameraInput) cameraInput.addEventListener('change', function(e) {
  if (e.target.files) _handleSitePhotoFiles(e.target.files);
  e.target.value = '';
});
