/**
 * ARENCON FRT v2 — Photos UI
 * Full photo gallery: site photos + deficiency photos, grouped by source.
 * Upload zone with drag-drop, camera, and import buttons.
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showConfirm } from '../shared/dialogs.js';
import { R2 } from '../data/r2.js';
import { IDB } from '../data/idb.js';

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

    // ── Date grouping helper ──
    function dayKey(p) {
      var d = p.addedDate || p.date || p.timestamp || '';
      if (!d) return 'No date';
      try { var dt = new Date(d); if (isNaN(dt.getTime())) return 'No date';
        return dt.toLocaleDateString('en-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
      } catch(e) { return 'No date'; }
    }
    function r2Dot(ph) {
      var st = ph.r2Url ? 'ok' : 'pending';
      var color = st === 'ok' ? '#1A7A4A' : '#FFA726';
      return '<div title="R2: ' + st + '" style="position:absolute;bottom:4px;left:4px;width:8px;height:8px;border-radius:50%;background:' + color + ';box-shadow:0 0 0 1.5px rgba(255,255,255,.8);"></div>';
    }
    function siteCard(p, i) {
      var imgSrc = p.thumb || p.r2Url || p.dataUrl || '';
      var h = '<div class="ph-card ph-card-site" style="position:relative;width:120px;border-radius:6px;overflow:hidden;border:1px solid var(--border);background:var(--smoke);user-select:none;">';
      if (imgSrc) {
        h += '<img data-action="open-site-lightbox" data-photo-idx="' + i + '" src="' + esc(imgSrc) + '" loading="lazy" style="width:120px;height:100px;object-fit:cover;display:block;cursor:pointer;" onerror="this.style.display=\'none\'">';
      } else {
        h += '<div style="width:120px;height:100px;display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:24px;">\uD83D\uDCF7</div>';
      }
      h += '<button class="ph-hover-btn ph-del" data-action="delete-site-photo" data-photo-idx="' + i + '" title="Delete">\u2715</button>';
      h += '<button class="ph-hover-btn ph-dl" data-action="download-site-photo" data-photo-idx="' + i + '" title="Download">\u2B07</button>';
      h += r2Dot(p);
      h += '<div style="padding:3px 6px;font-size:calc(10px + var(--ts));color:var(--steel);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.caption || 'Site Photo') + '</div>';
      h += '</div>';
      return h;
    }
    function deficCard(dp) {
      var ph = dp.photo;
      var imgSrc = ph.r2Url || ph.dataUrl || '';
      if (!imgSrc) return '';
      var h = '<div class="ph-card ph-card-defic" data-action="open-defic-lightbox" data-defic-id="' + esc(dp.deficId) + '" data-obs-idx="' + dp.obsIdx + '" data-photo-idx="' + dp.photoIdx + '" style="position:relative;width:120px;border-radius:6px;overflow:hidden;border:1px solid var(--border);background:var(--smoke);cursor:pointer;user-select:none;">';
      h += '<img src="' + esc(imgSrc) + '" loading="lazy" style="width:120px;height:100px;object-fit:cover;display:block;">';
      h += '<div class="ph-pin-badge" title="Pin #' + dp.deficNum + '">#' + dp.deficNum + '</div>';
      h += '<button class="ph-hover-btn ph-dl" data-action="download-defic-photo" data-defic-id="' + esc(dp.deficId) + '" data-obs-idx="' + dp.obsIdx + '" data-photo-idx="' + dp.photoIdx + '" title="Download">\u2B07</button>';
      h += r2Dot(ph);
      h += '<div style="padding:3px 6px;font-size:calc(10px + var(--ts));color:var(--steel);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(dp.contractorName) + '</div>';
      h += '</div>';
      return h;
    }

    // Group site photos by date
    var siteGroups = {};
    var siteOrder = [];
    sitePhotos.forEach(function(p, i) {
      var k = dayKey(p);
      if (!siteGroups[k]) { siteGroups[k] = []; siteOrder.push(k); }
      siteGroups[k].push({ photo: p, idx: i });
    });
    if (sitePhotos.length) {
      html += '<div style="font-weight:700;font-size:calc(13px + var(--ts));color:var(--steel);margin:18px 0 8px;">Site Photos</div>';
      siteOrder.forEach(function(k) {
        html += '<div style="font-size:calc(12px + var(--ts));color:var(--silver);font-weight:600;margin:10px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border);">' + esc(k) + ' \u00B7 ' + siteGroups[k].length + '</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
        siteGroups[k].forEach(function(item) { html += siteCard(item.photo, item.idx); });
        html += '</div>';
      });
    }

    // Group defic photos by date
    var defGroups = {};
    var defOrder = [];
    deficPhotos.forEach(function(dp) {
      var k = dayKey(dp.photo);
      if (!defGroups[k]) { defGroups[k] = []; defOrder.push(k); }
      defGroups[k].push(dp);
    });
    if (deficPhotos.length) {
      html += '<div style="font-weight:700;font-size:calc(13px + var(--ts));color:var(--steel);margin:18px 0 8px;">Deficiency Photos</div>';
      defOrder.forEach(function(k) {
        html += '<div style="font-size:calc(12px + var(--ts));color:var(--silver);font-weight:600;margin:10px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border);">' + esc(k) + ' \u00B7 ' + defGroups[k].length + '</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
        defGroups[k].forEach(function(dp) { html += deficCard(dp); });
        html += '</div>';
      });
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
      window._frtLightbox.open(fullPhotos, idx, { contextLabel:'Site Photo' });
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
        window._frtLightbox.open(photos, photoIdx, { contextLabel:'Pin #' + (f.defic.num || '?') });
      }
    }
    return;
  }

  // Download site photo
  var dlS = e.target.closest && e.target.closest('[data-action="download-site-photo"]');
  if (dlS) {
    e.stopPropagation();
    var idx = parseInt(dlS.getAttribute('data-photo-idx') || '0');
    var proj = Model.getProject();
    var p = proj && proj.photos && proj.photos[idx];
    if (p) _downloadPhoto(p, 'site_photo_' + (idx+1));
    return;
  }
  // Download defic photo
  var dlD = e.target.closest && e.target.closest('[data-action="download-defic-photo"]');
  if (dlD) {
    e.stopPropagation();
    var did = dlD.getAttribute('data-defic-id');
    var oi = parseInt(dlD.getAttribute('data-obs-idx') || '0');
    var pi = parseInt(dlD.getAttribute('data-photo-idx') || '0');
    var f = Model.findDeficiency(did);
    if (f && f.defic.observations && f.defic.observations[oi]) {
      var ph = (f.defic.observations[oi].photos || [])[pi];
      if (ph) _downloadPhoto(ph, 'defic_' + (f.defic.num || 'x') + '_' + (pi+1));
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
function _downloadPhoto(ph, fallbackName) {
  var src = ph.r2Url || ph.dataUrl || '';
  if (!src) { toast('No image source'); return; }
  var fname = ph.filename || (fallbackName + '.jpg');
  if (!/\.(jpe?g|png|webp|gif)$/i.test(fname)) fname += '.jpg';
  fetch(src).then(function(r){return r.blob();}).then(function(blob){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    toast('Downloaded ' + fname);
  }).catch(function(){ window.open(src, '_blank'); });
}

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
// Photo Gallery toolbar — delegated wiring (S78 fix: top-level getElementById ran before DOM existed)
document.addEventListener('click', function(e) {
  var t = e.target.closest && e.target.closest('button');
  if (!t || !t.id) return;
  if (t.id === 'site-photo-upload-btn') {
    var fi = document.getElementById('site-photo-input');
    if (fi) fi.click();
  } else if (t.id === 'site-photo-camera-btn') {
    var ci = document.getElementById('site-photo-camera');
    if (ci) ci.click();
  } else if (t.id === 'photo-actions-btn') {
    var ex = document.getElementById('photo-actions-pop');
    if (ex) { ex.remove(); return; }
    var pop = document.createElement('div');
    pop.id = 'photo-actions-pop'; pop.className = 'card-context-menu';
    pop.style.cssText = 'display:block;position:fixed;z-index:9000;';
    pop.innerHTML =
      '<button data-ph-act="sel-all">Select all</button>'
      + '<button data-ph-act="desel-all">Deselect all</button>'
      + '<div class="separator"></div>'
      + '<button data-ph-act="export">Export selected</button>'
      + '<button data-ph-act="reassign">\u2197 Reassign selected</button>'
      + '<button data-ph-act="pin">\uD83D\uDCCC Assign to Pin</button>'
      + '<div class="separator"></div>'
      + '<button data-ph-act="delete" class="danger">\uD83D\uDDD1\uFE0F Delete selected</button>';
    document.body.appendChild(pop);
    var rA = t.getBoundingClientRect();
    pop.style.cssText += ';position:fixed!important;bottom:auto!important;right:auto!important;height:auto!important;max-height:none!important;';
    pop.style.top = (rA.bottom + 4) + 'px';
    pop.style.left = Math.min(rA.left, window.innerWidth - 240) + 'px';
    setTimeout(function(){ document.addEventListener('click', function close(ev){
      var act = ev.target.closest && ev.target.closest('[data-ph-act]');
      if (act) {
        var a = act.getAttribute('data-ph-act');
        if (a === 'sel-all') {
          document.querySelectorAll('#panel-photos .photo-card, #panel-photos [data-photo-id]').forEach(function(c){ c.classList.add('selected'); var ck=c.querySelector('input[type=checkbox]'); if(ck)ck.checked=true; });
          toast('All photos selected');
        } else if (a === 'desel-all') {
          document.querySelectorAll('#panel-photos .selected, #panel-photos [data-photo-id]').forEach(function(c){ c.classList.remove('selected'); var ck=c.querySelector('input[type=checkbox]'); if(ck)ck.checked=false; });
          toast('Cleared selection');
        } else if (a === 'export') {
          var sel = document.querySelectorAll('#panel-photos .photo-card.selected, #panel-photos .selected[data-photo-id]');
          if (!sel.length) { toast('No photos selected'); }
          else {
            toast('Exporting ' + sel.length + ' photo' + (sel.length>1?'s':'') + '...');
            sel.forEach(function(c, i){ setTimeout(function(){
              var img = c.querySelector('img'); if (!img || !img.src) return;
              var a2 = document.createElement('a'); a2.href = img.src; a2.download = 'ARENCON_photo_' + (i+1) + '.jpg';
              document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
            }, i * 400); });
          }
        } else if (a === 'reassign' || a === 'pin' || a === 'delete') {
          // S78: stub — full v1 parity deferred to S79 (R2/IDB cleanup paths need careful port per S59 footgun)
          toast((a === 'delete' ? 'Bulk delete' : a === 'pin' ? 'Assign to Pin' : 'Reassign') + ' \u2014 coming in next update (needs R2 cleanup port)');
        }
        pop.remove();
      } else if (!ev.target.closest('#photo-actions-pop')) {
        pop.remove();
      }
      document.removeEventListener('click', close);
    }); }, 10);
  } else if (t.id === 'photo-filters-btn') {
    var ex2 = document.getElementById('photo-filter-pop');
    if (ex2) { ex2.remove(); return; }
    var pop2 = document.createElement('div');
    pop2.id = 'photo-filter-pop'; pop2.className = 'card-context-menu';
    pop2.style.cssText = 'display:block;position:fixed;z-index:9000;';
    pop2.innerHTML =
      '<button data-ph-filt="all">All photos</button>'
      + '<button data-ph-filt="deficiency">Deficiency photos</button>'
      + '<button data-ph-filt="general">General photos</button>'
      + '<button data-ph-filt="site">Site photos</button>';
    document.body.appendChild(pop2);
    var rF = t.getBoundingClientRect();
    pop2.style.cssText += ';position:fixed!important;bottom:auto!important;right:auto!important;height:auto!important;max-height:none!important;';
    pop2.style.top = (rF.bottom + 4) + 'px';
    pop2.style.left = Math.min(rF.left - 100, window.innerWidth - 200) + 'px';
    setTimeout(function(){ document.addEventListener('click', function close2(ev){
      var f = ev.target.closest && ev.target.closest('[data-ph-filt]');
      if (f) {
        var mode = f.getAttribute('data-ph-filt');
        document.querySelectorAll('#panel-photos .photo-card, #panel-photos [data-photo-type]').forEach(function(c){
          var type = (c.getAttribute('data-photo-type') || '').toLowerCase();
          var show = mode === 'all' || type === mode;
          c.style.display = show ? '' : 'none';
        });
        toast('Showing: ' + mode);
        pop2.remove();
      } else if (!ev.target.closest('#photo-filter-pop')) {
        pop2.remove();
      }
      document.removeEventListener('click', close2);
    }); }, 10);
  }
});

// Legacy file/camera input change handlers (kept top-level — inputs exist at module load via index.html)
var fileInput = document.getElementById('site-photo-input');
var cameraInput = document.getElementById('site-photo-camera');
if (fileInput) fileInput.addEventListener('change', function(e) {
  if (e.target.files) _handleSitePhotoFiles(e.target.files);
  e.target.value = '';
});
if (cameraInput) cameraInput.addEventListener('change', function(e) {
  if (e.target.files) _handleSitePhotoFiles(e.target.files);
  e.target.value = '';
});

// Session 71: R2 wiring for markup engine save events
document.addEventListener('frt-markup-saved', function(e) {
  var d = e.detail; if (!d || !d.blob || !d.photo) return;
  var photo = d.photo;
  var proj = Model.getProject(); if (!proj) return;
  var pid = proj.id || proj.projectId; if (!pid) return;
  // Persist annotated blob to IDB under photo id (mirrors R2.uploadPhoto pattern)
  try { IDB.put('photoBlobs', { id: photo.id, dataBlob: d.blob }).catch(function(){}); } catch(_){}
  var filename = 'marked_' + (photo.id || Date.now()) + '.jpg';
  R2.upload(pid, 'marked', d.blob, filename).then(function(result) {
    if (result) {
      photo.r2Key = result.r2Key;
      photo.r2Url = result.r2Url;
      photo.r2Status = 'synced';
      photo._annotated = true;
    } else {
      photo.r2Status = 'pending';
    }
    Model.saveNow();
    initPhotos.render();
  }).catch(function(err) {
    console.warn('[Markup] R2 upload failed, queueing:', err);
    photo.r2Status = 'pending';
    R2.queueUpload(photo.id, pid, 'marked', d.blob, filename);
    Model.saveNow();
    initPhotos.render();
  });
});
