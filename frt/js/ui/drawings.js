/**
 * ARENCON FRT v2 — Drawings UI
 * ═════════════════════════════
 * 
 * Read-only drawing gallery renderer.
 * Shows drawing cards grouped by folder, with pin counts.
 * No thumbnails yet (Phase 2 — requires IDB blob loading).
 */

import { Model } from '../data/model.js';
import { IDB } from '../data/idb.js';
import { R2 } from '../data/r2.js';
import { toast } from '../shared/toast.js';
import { showConfirm } from '../shared/dialogs.js';
import { initViewer } from '../viewer/viewer.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function countPins(drawingId, allDefics) {
  var n = 0;
  allDefics.forEach(function(d) { if (d.defic.drawingId === drawingId) n++; });
  return n;
}

function buildDrawingCard(d, allDefics) {
  var pins = countPins(d.id, allDefics);
  var imgSrc = d.thumb || '';
  var h = '<div class="drawing-card" data-drawing-id="' + esc(d.id) + '" style="width:180px;display:inline-block;vertical-align:top;margin:0 8px 12px 0;cursor:pointer;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--surface);box-shadow:0 1px 4px rgba(0,0,0,.08);">';

  if (imgSrc) {
    h += '<div class="drawing-thumb" style="height:120px;overflow:hidden;border-radius:4px 4px 0 0;">';
    h += '<img src="' + esc(imgSrc) + '" style="width:100%;height:120px;object-fit:cover;display:block;" loading="lazy" decoding="async">';
    h += '</div>';
  } else {
    h += '<div class="drawing-thumb" style="height:120px;background:var(--smoke);display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:32px;border-radius:4px 4px 0 0;">';
    h += '\uD83D\uDCC4';
    h += '</div>';
  }

  h += '<div style="padding:6px 10px;display:flex;justify-content:space-between;align-items:center;gap:4px;border-top:1px solid var(--border);">';
  h += '<span style="font-size:calc(12px + var(--ts));font-weight:600;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">' + esc(d.name || 'Untitled') + '</span>';
  if (pins > 0) {
    h += '<span class="pin-count" style="font-size:calc(11px + var(--ts));color:var(--silver);background:var(--smoke);padding:2px 8px;border-radius:10px;flex-shrink:0;">\uD83D\uDCCC ' + pins + '</span>';
  }
  h += '<button data-action="delete-drawing" data-drawing-id="' + esc(d.id) + '" style="border:none;background:none;color:var(--silver);cursor:pointer;font-size:calc(13px + var(--ts));padding:0 2px;flex-shrink:0;" title="Delete drawing">\uD83D\uDDD1</button>';
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

    // Lazy-generate thumbnails for drawings missing them (cloud-synced from v1)
    var needThumb = drawings.filter(function(d) { return !d.thumb && d.r2Url; });
    if (needThumb.length) _lazyGenThumbs(needThumb, 0);
  }
};

function _lazyGenThumbs(list, idx) {
  if (idx >= list.length) return;
  var d = list[idx];
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    var maxW = 200;
    var scale = Math.min(1, maxW / img.width);
    var tw = Math.round(img.width * scale);
    var th = Math.round(img.height * scale);
    var c = document.createElement('canvas'); c.width = tw; c.height = th;
    c.getContext('2d').drawImage(img, 0, 0, tw, th);
    d.thumb = c.toDataURL('image/jpeg', 0.7);
    c.width = 1; c.height = 1;
    // Update the card image in-place without full re-render
    var card = document.querySelector('.drawing-card[data-drawing-id="' + d.id + '"] .drawing-thumb');
    if (card) card.innerHTML = '<img src="' + d.thumb + '" style="width:100%;height:120px;object-fit:cover;display:block;" decoding="async">';
    // Continue to next after short delay
    setTimeout(function() { _lazyGenThumbs(list, idx + 1); }, 200);
  };
  img.onerror = function() { setTimeout(function() { _lazyGenThumbs(list, idx + 1); }, 100); };
  img.src = d.r2Url;
}

Model.onChange('project', function() { initDrawings.render(); });

// Click handler: open drawing in viewer
document.addEventListener('click', function(e) {
  // Delete drawing
  var delBtn = e.target.closest && e.target.closest('[data-action="delete-drawing"]');
  if (delBtn) {
    e.stopPropagation();
    var drawingId = delBtn.getAttribute('data-drawing-id');
    var drawings = Model.getDrawings();
    var dwg = drawings.find(function(d) { return d.id === drawingId; });
    var name = dwg ? (dwg.name || 'Untitled') : 'this drawing';
    showConfirm('Delete Drawing', 'Delete "' + name + '"? Pins on this drawing will be removed.').then(function(yes) {
      if (yes) {
        Model.removeDrawing(drawingId);
        initDrawings.render();
        toast('Drawing deleted');
      }
    });
    return;
  }

  var card = e.target.closest && e.target.closest('.drawing-card[data-drawing-id]');
  if (!card) return;
  var drawingId = card.getAttribute('data-drawing-id');
  if (drawingId) initViewer.open(drawingId);
});

// ── Upload Handlers ─────────────────────────────────────

function _showDwgLoading(msg) {
  var el = document.getElementById('drawing-loading');
  if (el) {
    el.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid #F57F17;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;"></span> ' + msg;
    el.style.display = 'flex';
  }
}
function _hideDwgLoading() {
  var el = document.getElementById('drawing-loading');
  if (el) el.style.display = 'none';
}

function _genThumb(dataUrl, cb) {
  var img = new Image();
  img.onload = function() {
    var maxW = 200;
    var scale = Math.min(1, maxW / img.width);
    var tw = Math.round(img.width * scale);
    var th = Math.round(img.height * scale);
    var c = document.createElement('canvas'); c.width = tw; c.height = th;
    c.getContext('2d').drawImage(img, 0, 0, tw, th);
    var t = c.toDataURL('image/jpeg', 0.70);
    c.width = 1; c.height = 1;
    cb(t);
  };
  img.onerror = function() { cb(''); };
  img.src = dataUrl;
}

function _getUniqueName(baseName) {
  var proj = Model.getProject();
  var names = (proj.drawings || []).map(function(d) { return d.name; });
  if (names.indexOf(baseName) === -1) return baseName;
  var i = 2;
  while (names.indexOf(baseName + ' (' + i + ')') !== -1) i++;
  return baseName + ' (' + i + ')';
}

function handleDrawingFiles(files) {
  Array.from(files).forEach(function(f) {
    if (f.type === 'application/pdf') _handlePDFUpload(f);
    else if (f.type.startsWith('image/')) _handleImageUpload(f);
  });
}

function _handleImageUpload(f) {
  _showDwgLoading('Processing ' + f.name + '...');
  var reader = new FileReader();
  reader.onload = function(e) {
    var baseName = f.name.replace(/\.[^.]+$/, '');
    var dataUrl = e.target.result;
    _genThumb(dataUrl, function(thumb) {
      var newDwg = {
        id: 'dwg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: _getUniqueName(baseName),
        dataUrl: null,
        thumb: thumb,
        width: 0, height: 0,
        isOriginal: true, folder: '',
        r2Key: '', r2Status: '', r2Url: ''
      };
      Model.addDrawing(newDwg);
      // Save full-res blob to IDB drawingBlobs store (not on project object)
      fetch(dataUrl).then(function(r) { return r.blob(); }).then(function(blob) {
        IDB.put('drawingBlobs', { id: newDwg.id, dataBlob: blob }).catch(function(err) {
          console.warn('[Drawings] IDB blob save error:', err);
        });
        // R2 upload in Hub mode (fire-and-forget)
        var pid = new URLSearchParams(window.location.search).get('project');
        if (pid) {
          R2.uploadDrawing(pid, newDwg, blob).then(function() { Model.saveNow(); });
        }
      });
      _hideDwgLoading();
      initDrawings.render();
      toast('Drawing added: ' + newDwg.name);
    });
  };
  reader.readAsDataURL(f);
}

function _handlePDFUpload(file) {
  if (typeof ensurePdfJs === 'undefined') {
    toast('PDF support not available');
    return;
  }
  ensurePdfJs(function() {
    if (typeof pdfjsLib === 'undefined') {
      toast('PDF.js failed to load');
      return;
    }
    _showDwgLoading('Reading PDF...');
    var reader = new FileReader();
    reader.onload = function(e) {
      var arrayBuf = e.target.result;
      var pdfBufCopy = arrayBuf.slice(0);
      var ta = new Uint8Array(arrayBuf);
      var pdfTimeout = setTimeout(function() {
        _hideDwgLoading();
        toast('PDF is taking too long (>2 min)');
      }, 120000);
      pdfjsLib.getDocument({ data: ta }).promise.then(function(pdf) {
        clearTimeout(pdfTimeout);
        var bn = file.name.replace(/\.pdf$/i, '');
        var total = pdf.numPages;
        _runPdfPages(pdf, bn, bn, total, pdfBufCopy);
      }).catch(function(err) {
        clearTimeout(pdfTimeout);
        _hideDwgLoading();
        toast('PDF error: ' + err.message);
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── SACRED CODE: recursive go(pg) pattern — DO NOT REWRITE ──
function _runPdfPages(pdf, bn, folder, total, arrayBuf) {
  var done = 0;
  function go(pg) {
    pdf.getPage(pg).then(function(page) {
      var pv = page.view;
      var pw = pv[2], ph = pv[3];
      var hiScale = Math.min(4.0, 8192 / pw, 8192 / ph);
      var hiVp = page.getViewport({ scale: hiScale });
      var hc = document.createElement('canvas');
      var hcW = Math.round(hiVp.width), hcH = Math.round(hiVp.height);
      hc.width = hcW; hc.height = hcH;
      _showDwgLoading('Rendering page ' + pg + '/' + total + '\u2026');
      page.render({ canvasContext: hc.getContext('2d'), viewport: hiVp }).promise.then(function() {
        // Derive thumb from full-res canvas
        var thumbMaxW = 200;
        var thumbScaleR = Math.min(1, thumbMaxW / hcW);
        var tw = Math.round(hcW * thumbScaleR), th = Math.round(hcH * thumbScaleR);
        var thumbC = document.createElement('canvas'); thumbC.width = tw; thumbC.height = th;
        thumbC.getContext('2d').drawImage(hc, 0, 0, tw, th);
        var thumbDu = thumbC.toDataURL('image/jpeg', 0.70);
        thumbC.width = 1; thumbC.height = 1;
        // Export full-res as JPEG blob for IDB
        hc.toBlob(function(imgBlob) {
          hc.width = 1; hc.height = 1; // free GPU memory
          try {
            var pageName = total > 1 ? bn + ' - Page ' + pg : bn;
            pageName = _getUniqueName(pageName);
            var newDwg = {
              id: 'dwg_' + Date.now() + '_pg' + pg + '_' + Math.random().toString(36).substr(2, 4),
              name: pageName, dataUrl: null, thumb: thumbDu,
              width: hcW, height: hcH,
              pdfTiled: false, pdfPage: pg,
              isOriginal: false, folder: folder,
              r2Key: '', r2Status: '', r2Url: ''
            };
            Model.addDrawing(newDwg);
            // Store pre-rendered JPEG in IDB drawingBlobs
            IDB.put('drawingBlobs', {
              id: newDwg.id, dataBlob: imgBlob,
              name: newDwg.name, width: hcW, height: hcH,
              folder: folder, pdfPage: pg
            }).catch(function(err) { console.error('[Drawings] IDB save error:', err); });
            // R2 upload in Hub mode (fire-and-forget)
            var pid = new URLSearchParams(window.location.search).get('project');
            if (pid && imgBlob) {
              R2.uploadDrawing(pid, newDwg, imgBlob).then(function() { Model.saveNow(); });
            }
            done++;
            _showDwgLoading('Processing PDF: ' + done + '/' + total + '...');
            if (pg < total) { go(pg + 1); }
            else { initDrawings.render(); _hideDwgLoading(); toast(total + ' pages added from ' + bn); }
          } catch (encErr) {
            _hideDwgLoading();
            toast('Error on page ' + pg + ': ' + encErr.message);
          }
        }, 'image/jpeg', 0.85);
      });
    });
  }
  go(1);
}

// ── Wire file input ─────────────────────────────────────
var dwgFileInput = document.getElementById('drawing-file-input');
if (dwgFileInput) {
  dwgFileInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files.length) {
      handleDrawingFiles(e.target.files);
      e.target.value = '';
    }
  });
}

// Expose drag-drop handler for HTML ondrop
window._handleDrawingDrop = handleDrawingFiles;
