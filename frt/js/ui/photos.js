/**
 * ARENCON FRT v2 — Photos UI
 * Site photo gallery with upload, thumbnails, and summary stats.
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export var initPhotos = {
  render: function() {
    var container = document.getElementById('photos-container');
    if (!container) return;
    var proj = Model.getProject();
    if (!proj) { container.innerHTML = ''; return; }

    var sitePhotos = proj.photos || [];
    var allDefics = Model.getAllDeficiencies(proj);
    var deficPhotoCount = 0;
    allDefics.forEach(function(d) {
      (d.defic.observations || []).forEach(function(o) {
        deficPhotoCount += (o.photos || []).length;
      });
      deficPhotoCount += (d.defic.photos || []).length;
    });

    var html = '';

    // Summary stats
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">';
    html += '<div style="background:var(--smoke);border-radius:8px;padding:12px 18px;flex:1;min-width:120px;">';
    html += '<div style="font-size:24px;font-weight:700;color:var(--fg);">' + sitePhotos.length + '</div>';
    html += '<div style="font-size:calc(12px + var(--ts));color:var(--steel);font-weight:600;">Site Photos</div>';
    html += '</div>';
    html += '<div style="background:var(--smoke);border-radius:8px;padding:12px 18px;flex:1;min-width:120px;">';
    html += '<div style="font-size:24px;font-weight:700;color:var(--fg);">' + deficPhotoCount + '</div>';
    html += '<div style="font-size:calc(12px + var(--ts));color:var(--steel);font-weight:600;">Deficiency Photos</div>';
    html += '</div>';
    html += '</div>';

    // Site photo grid
    if (sitePhotos.length) {
      html += '<div style="font-weight:700;font-size:calc(13px + var(--ts));color:var(--steel);margin-bottom:8px;">Site Photos</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      sitePhotos.forEach(function(p, i) {
        var imgSrc = p.thumb || p.r2Url || p.dataUrl || '';
        html += '<div style="width:120px;border-radius:6px;overflow:hidden;border:1px solid var(--border);background:var(--smoke);">';
        if (imgSrc) {
          html += '<img src="' + esc(imgSrc) + '" loading="lazy" style="width:120px;height:100px;object-fit:cover;display:block;" onerror="this.style.display=\'none\'">';
        } else {
          html += '<div style="width:120px;height:100px;display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:24px;">\uD83D\uDCF7</div>';
        }
        html += '<div style="padding:3px 6px;font-size:calc(10px + var(--ts));color:var(--steel);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.caption || p.filename || 'Photo ' + (i + 1)) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    } else if (!deficPhotoCount) {
      html += '<p style="color:var(--silver);font-size:calc(13px + var(--ts));text-align:center;padding:16px;">No photos yet. Upload site photos above or add photos to deficiencies.</p>';
    }

    container.innerHTML = html;
    console.log('[Photos] Site:', sitePhotos.length, '| Deficiency:', deficPhotoCount);
  }
};

Model.onChange('project', function() { initPhotos.render(); });

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
      // Generate thumbnail
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
