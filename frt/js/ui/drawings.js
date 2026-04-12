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
import { showPrompt } from '../shared/dialogs.js';
import { initViewer } from '../viewer/viewer.js';

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

var _foldedFolders = {};

function countPins(drawingId, allDefics) {
  var n = 0;
  allDefics.forEach(function(d) { if (d.defic.drawingId === drawingId) n++; });
  return n;
}

function buildDrawingCard(d, allDefics) {
  var pins = countPins(d.id, allDefics);
  var imgSrc = d.thumb || '';
  var h = '<div class="drawing-card" data-drawing-id="' + esc(d.id) + '">';

  // Card thumb with pin badge + select check overlays
  h += '<div class="card-thumb drawing-thumb" data-action="open-viewer" data-drawing-id="' + esc(d.id) + '">';
  if (imgSrc) {
    h += '<img src="' + esc(imgSrc) + '" alt="' + esc(d.name) + '" loading="lazy" decoding="async">';
  } else {
    h += '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:32px;background:var(--smoke);">\uD83D\uDCC4</div>';
  }
  if (pins > 0) h += '<div class="pin-badge">' + pins + '</div>';
  h += '</div>';

  // Card footer with select check + name + menu
  h += '<div class="card-footer">';
  h += '<div class="select-check" data-action="toggle-drawing-select" data-drawing-id="' + esc(d.id) + '"></div>';
  h += '<span class="card-name" data-action="open-viewer" data-drawing-id="' + esc(d.id) + '">' + esc(d.name || 'Untitled') + '</span>';
  h += '<button class="card-menu-btn" data-action="drawing-menu" data-drawing-id="' + esc(d.id) + '">\u22EE</button>';
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

    // Apply search filter
    var searchQ = ((document.getElementById('dwg-search') || {}).value || '').toLowerCase().trim();
    if (searchQ) {
      drawings = drawings.filter(function(d) {
        return (d.name || '').toLowerCase().indexOf(searchQ) >= 0 || (d.folder || '').toLowerCase().indexOf(searchQ) >= 0;
      });
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
      var isFolded = _foldedFolders[fn];
      html += '<div class="dwg-folder-group" data-folder="' + esc(fn) + '" style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
      html += '<div class="dwg-folder-hdr" data-action="toggle-folder" data-folder="' + esc(fn) + '" style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--smoke);cursor:pointer;user-select:none;">';
      html += '<input type="checkbox" class="folder-checkbox" data-folder-name="' + esc(fn) + '" title="Select all in folder">';
      html += '<span style="font-size:12px;width:14px;">' + (isFolded ? '\u25B6' : '\u25BC') + '</span>';
      html += '\uD83D\uDCC1 <strong style="font-size:calc(14px + var(--ts));color:var(--steel);">' + esc(fn) + '</strong>';
      html += ' <span style="font-weight:400;color:var(--silver);font-size:calc(12px + var(--ts));">(' + items.length + ' plans)</span>';
      html += '<button data-action="rename-folder" data-folder="' + esc(fn) + '" style="border:none;background:none;cursor:pointer;font-size:calc(12px + var(--ts));padding:2px 4px;color:var(--silver);margin-left:auto;" title="Rename folder">\u270F\uFE0F</button>';
      html += '</div>';
      html += '<div class="dwg-folder-body dwg-card-row" style="padding:8px;display:flex;flex-wrap:wrap;' + (isFolded ? 'display:none;' : '') + '">';
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
    var card = document.querySelector('.drawing-card[data-drawing-id="' + d.id + '"] .card-thumb');
    if (card) {
      var pinBadge = card.querySelector('.pin-badge');
      var pinHTML = pinBadge ? pinBadge.outerHTML : '';
      card.innerHTML = '<img src="' + d.thumb + '" alt="' + (d.name || '') + '" decoding="async">' + pinHTML;
    }
    // Continue to next after short delay
    setTimeout(function() { _lazyGenThumbs(list, idx + 1); }, 200);
  };
  img.onerror = function() { setTimeout(function() { _lazyGenThumbs(list, idx + 1); }, 100); };
  img.src = d.r2Url;
}

Model.onChange('project', function() { initDrawings.render(); });

// ── Drawing Selection State ─────────────────────────────
var _selectedDrawings = new Set();
var _lastSelectedId = null;

function _toggleSelect(drawingId, shiftKey) {
  if (shiftKey && _lastSelectedId && _lastSelectedId !== drawingId) {
    // Shift-click: select range like Google Photos
    var cards = Array.from(document.querySelectorAll('.drawing-card[data-drawing-id]'));
    var ids = cards.map(function(c) { return c.getAttribute('data-drawing-id'); });
    var a = ids.indexOf(_lastSelectedId);
    var b = ids.indexOf(drawingId);
    if (a >= 0 && b >= 0) {
      var start = Math.min(a, b), end = Math.max(a, b);
      for (var i = start; i <= end; i++) _selectedDrawings.add(ids[i]);
    }
  } else {
    if (_selectedDrawings.has(drawingId)) _selectedDrawings.delete(drawingId);
    else _selectedDrawings.add(drawingId);
  }
  _lastSelectedId = drawingId;
  _updateSelectionUI();
}

function _updateSelectionUI() {
  document.querySelectorAll('.drawing-card[data-drawing-id]').forEach(function(card) {
    var id = card.getAttribute('data-drawing-id');
    var sel = _selectedDrawings.has(id);
    card.classList.toggle('selected', sel);
    var check = card.querySelector('.select-check');
    if (check) {
      check.classList.toggle('checked', sel);
      check.textContent = sel ? '\u2713' : '';
    }
  });
}

// ── Drawing Context Menu ─────────────────────────────────
var _activeMenu = null;
function _closeActiveMenu() {
  if (_activeMenu) { _activeMenu.remove(); _activeMenu = null; }
  document.removeEventListener('click', _closeActiveMenu);
}

function _showDrawingContextMenu(drawingId, anchorEl) {
  _closeActiveMenu();
  var menu = document.createElement('div');
  menu.className = 'card-context-menu';
  menu.style.cssText = 'display:block;position:fixed;z-index:9000;';
  menu.innerHTML = '<button data-ctx="rename">\u270F\uFE0F Rename</button>'
    + '<button data-ctx="move">\uD83D\uDCC1 Move to folder...</button>'
    + '<button data-ctx="rotate">\uD83D\uDD04 Rotate 90\u00B0</button>'
    + '<button data-ctx="replace">\uD83D\uDD27 Replace image</button>'
    + '<button data-ctx="newversion">\u2B06\uFE0F Upload new version</button>'
    + '<div class="separator"></div>'
    + '<button data-ctx="download">\u2B07\uFE0F Download drawing</button>'
    + '<div class="separator"></div>'
    + '<button data-ctx="delete" class="danger">\uD83D\uDDD1\uFE0F Delete</button>';
  document.body.appendChild(menu);
  _activeMenu = menu;

  // Position near anchor
  var rect = anchorEl.getBoundingClientRect();
  menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8) + 'px';

  menu.addEventListener('click', function(ev) {
    var btn = ev.target.closest('[data-ctx]');
    if (!btn) return;
    var act = btn.getAttribute('data-ctx');
    _closeActiveMenu();
    var drawings = Model.getDrawings();
    var dwg = drawings.find(function(d) { return d.id === drawingId; });
    if (!dwg && act !== 'delete') return;

    if (act === 'rename') {
      showPrompt('Rename Drawing', 'New name:', dwg.name || '').then(function(n) {
        if (n && n.trim()) { dwg.name = n.trim(); Model.saveNow(); initDrawings.render(); toast('Renamed'); }
      });
    } else if (act === 'move') {
      var proj = Model.getProject();
      var folders = [];
      (proj.drawings || []).forEach(function(d) { if (d.folder && folders.indexOf(d.folder) < 0) folders.push(d.folder); });
      showPrompt('Move to Folder', 'Folder name (or type new):', dwg.folder || '').then(function(fn) {
        if (fn !== null) { dwg.folder = fn.trim() || ''; Model.saveNow(); initDrawings.render(); toast('Moved'); }
      });
    } else if (act === 'rotate') {
      toast('Rotate: requires viewer — open drawing first');
    } else if (act === 'replace') {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*,.pdf';
      inp.onchange = function() {
        if (inp.files[0]) {
          var reader = new FileReader();
          reader.onload = function() {
            dwg.dataUrl = reader.result;
            dwg.thumb = '';
            Model.saveNow();
            initDrawings.render();
            toast('Image replaced');
          };
          reader.readAsDataURL(inp.files[0]);
        }
      };
      inp.click();
    } else if (act === 'download') {
      var src = dwg.r2Url || dwg.dataUrl || dwg.thumb;
      if (src) { var a = document.createElement('a'); a.href = src; a.download = (dwg.name || 'drawing') + '.png'; a.click(); toast('Downloading...'); }
      else toast('No image data available');
    } else if (act === 'delete') {
      showConfirm('Delete Drawing', 'Delete "' + (dwg ? dwg.name : 'this drawing') + '"? Pins will be removed.').then(function(yes) {
        if (yes) { Model.removeDrawing(drawingId); initDrawings.render(); toast('Deleted'); }
      });
    }
  });

  setTimeout(function() { document.addEventListener('click', _closeActiveMenu); }, 10);
}

// ── Click Handler ───────────────────────────────────────
document.addEventListener('click', function(e) {
  // 1) Rename folder (MUST be before toggle-folder)
  var renameBtn = e.target.closest && e.target.closest('[data-action="rename-folder"]');
  if (renameBtn) {
    e.stopPropagation();
    e.preventDefault();
    var oldName = renameBtn.getAttribute('data-folder');
    showPrompt('Rename Folder', 'New folder name:', oldName).then(function(newName) {
      if (newName && newName.trim() && newName.trim() !== oldName) {
        var drawings = Model.getDrawings();
        drawings.forEach(function(d) {
          if (d.folder === oldName) d.folder = newName.trim();
        });
        Model.saveNow();
        initDrawings.render();
        toast('Folder renamed');
      }
    });
    return;
  }

  // 2) Folder checkbox (stop propagation so it doesn't toggle fold)
  if (e.target.classList && e.target.classList.contains('folder-checkbox')) {
    e.stopPropagation();
    var checked = e.target.checked;
    var folderGroup = e.target.closest('.dwg-folder-group');
    if (folderGroup) {
      folderGroup.querySelectorAll('.drawing-card[data-drawing-id]').forEach(function(card) {
        var id = card.getAttribute('data-drawing-id');
        if (checked) _selectedDrawings.add(id);
        else _selectedDrawings.delete(id);
      });
    }
    _updateSelectionUI();
    return;
  }

  // 3) Toggle folder fold/unfold
  var foldHdr = e.target.closest && e.target.closest('[data-action="toggle-folder"]');
  if (foldHdr && !e.target.closest('[data-action="rename-folder"]') && !e.target.classList.contains('folder-checkbox')) {
    var fn = foldHdr.getAttribute('data-folder');
    if (fn) {
      _foldedFolders[fn] = !_foldedFolders[fn];
      var group = document.querySelector('.dwg-folder-group[data-folder="' + fn + '"]');
      if (group) {
        var body = group.querySelector('.dwg-folder-body');
        var arrow = foldHdr.querySelector('span');
        if (body) body.style.display = _foldedFolders[fn] ? 'none' : 'flex';
        if (arrow) arrow.textContent = _foldedFolders[fn] ? '\u25B6' : '\u25BC';
      }
    }
    return;
  }

  // 4) Toggle drawing selection (click on select-check)
  var selCheck = e.target.closest && e.target.closest('[data-action="toggle-drawing-select"]');
  if (selCheck) {
    e.stopPropagation();
    var drawingId = selCheck.getAttribute('data-drawing-id');
    if (drawingId) _toggleSelect(drawingId, e.shiftKey);
    return;
  }

  // 5) Drawing menu button
  var menuBtn = e.target.closest && e.target.closest('[data-action="drawing-menu"]');
  if (menuBtn) {
    e.stopPropagation();
    var drawingId = menuBtn.getAttribute('data-drawing-id');
    _showDrawingContextMenu(drawingId, menuBtn);
    return;
  }

  // 6) Open viewer (click on card-thumb or card-name)
  var openBtn = e.target.closest && e.target.closest('[data-action="open-viewer"]');
  if (openBtn) {
    var drawingId = openBtn.getAttribute('data-drawing-id');
    if (drawingId) initViewer.open(drawingId);
    return;
  }

  // 7) Fallback: clicking anywhere on drawing card opens viewer
  var card = e.target.closest && e.target.closest('.drawing-card[data-drawing-id]');
  if (card) {
    var drawingId = card.getAttribute('data-drawing-id');
    if (drawingId) initViewer.open(drawingId);
  }
});

// Drawings toolbar — delegated wiring (S78 fix: top-level getElementById ran before DOM existed)
document.addEventListener('click', function(e) {
  var t = e.target.closest && e.target.closest('button');
  if (!t || !t.id) return;
  if (t.id === 'btn-new-folder') {
    showPrompt('New Folder', 'Folder name:').then(function(name) {
      if (name && name.trim()) toast('Folder "' + name.trim() + '" ready — upload drawings or move existing ones');
    });
  } else if (t.id === 'btn-dwg-select-all') {
    var cards = document.querySelectorAll('.drawing-card[data-drawing-id]');
    if (_selectedDrawings.size === cards.length && cards.length > 0) { _selectedDrawings.clear(); toast('Deselected all'); }
    else { cards.forEach(function(c) { _selectedDrawings.add(c.getAttribute('data-drawing-id')); }); toast(_selectedDrawings.size + ' drawings selected'); }
    _updateSelectionUI();
  } else if (t.id === 'btn-dwg-actions') {
    // S78: v1-style Actions dropdown menu
    var existing = document.getElementById('dwg-actions-pop');
    if (existing) { existing.remove(); return; }
    var pop = document.createElement('div');
    pop.id = 'dwg-actions-pop'; pop.className = 'card-context-menu';
    pop.style.cssText = 'display:block;position:fixed;z-index:9000;';
    pop.innerHTML =
      '<button data-dwg-act="dl-all">\u2B07\uFE0F Download all drawings</button>'
      + '<button data-dwg-act="dl-sel">\u2B07\uFE0F Download selected</button>'
      + '<div class="separator"></div>'
      + '<button data-dwg-act="move">\uD83D\uDCC1 Move to folder...</button>'
      + '<button data-dwg-act="rename">Batch rename</button>'
      + '<div class="separator"></div>'
      + '<button data-dwg-act="del" class="danger">\uD83D\uDDD1\uFE0F Delete selected</button>';
    document.body.appendChild(pop);
    var rA = t.getBoundingClientRect();
    pop.style.cssText += ';position:fixed!important;bottom:auto!important;right:auto!important;height:auto!important;max-height:none!important;';
    pop.style.top = (rA.bottom + 4) + 'px';
    pop.style.left = Math.min(rA.left, window.innerWidth - 240) + 'px';
    setTimeout(function(){ document.addEventListener('click', function close(ev){
      var act = ev.target.closest && ev.target.closest('[data-dwg-act]');
      if (act) {
        var a = act.getAttribute('data-dwg-act');
        var drawings = Model.getDrawings();
        if (a === 'dl-all' || a === 'dl-sel') {
          var list = a === 'dl-all' ? drawings : drawings.filter(function(d){ return _selectedDrawings.has(d.id); });
          if (!list.length) { toast('No drawings to download'); }
          else {
            toast('Downloading ' + list.length + ' drawing' + (list.length>1?'s':'') + '...');
            list.forEach(function(d, i){ setTimeout(function(){
              var src = d.r2Url || d.dataUrl || d.thumb; if (!src) return;
              var safe = (d.name || 'drawing').replace(/[^a-zA-Z0-9._-]/g,'_');
              var anchor = document.createElement('a'); anchor.href = src; anchor.download = 'ARENCON_' + safe + '.png';
              document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
            }, i * 600); });
          }
        } else if (a === 'move') {
          if (!_selectedDrawings.size) { toast('No drawings selected'); }
          else {
            var folders = []; drawings.forEach(function(d){ if (d.folder && folders.indexOf(d.folder)<0) folders.push(d.folder); });
            showPrompt('Move ' + _selectedDrawings.size + ' to folder', 'Folder name (blank = unfiled). Existing: ' + (folders.join(', ') || 'none'), '').then(function(fn){
              if (fn === null) return;
              drawings.forEach(function(d){ if (_selectedDrawings.has(d.id)) d.folder = (fn||'').trim(); });
              _selectedDrawings.clear(); Model.saveNow(); initDrawings.render(); toast('Moved');
            });
          }
        } else if (a === 'rename') {
          if (!_selectedDrawings.size) { toast('No drawings selected'); }
          else {
            showPrompt('Batch rename', 'Prefix (e.g. "FP"):', '').then(function(pre){
              if (!pre) return;
              var n = 1; drawings.forEach(function(d){ if (_selectedDrawings.has(d.id)) { d.name = pre + '-' + n; n++; } });
              _selectedDrawings.clear(); Model.saveNow(); initDrawings.render(); toast('Renamed ' + (n-1));
            });
          }
        } else if (a === 'del') {
          var n2 = _selectedDrawings.size;
          if (!n2) { toast('No drawings selected'); }
          else {
            showConfirm('Delete ' + n2 + ' Drawing' + (n2>1?'s':''), 'Pins on these drawings will be removed. Continue?').then(function(yes){
              if (!yes) return;
              _selectedDrawings.forEach(function(id){ Model.removeDrawing(id); });
              _selectedDrawings.clear(); initDrawings.render(); toast('Deleted ' + n2);
            });
          }
        }
        pop.remove();
      } else if (!ev.target.closest('#dwg-actions-pop')) {
        pop.remove();
      }
      document.removeEventListener('click', close);
    }); }, 10);
  } else if (t.id === 'btn-dwg-filters') {
    // S78: v1-style Filters dropdown — All folders / Has tasks / No tasks
    var ex2 = document.getElementById('dwg-filter-pop');
    if (ex2) { ex2.remove(); return; }
    var pop2 = document.createElement('div');
    pop2.id = 'dwg-filter-pop'; pop2.className = 'card-context-menu';
    pop2.style.cssText = 'display:block;position:fixed;z-index:9000;';
    pop2.innerHTML =
      '<button data-dwg-filt="all">All folders</button>'
      + '<button data-dwg-filt="pinned">Has tasks</button>'
      + '<button data-dwg-filt="nopins">No tasks</button>';
    document.body.appendChild(pop2);
    var rF = t.getBoundingClientRect();
    pop2.style.cssText += ';position:fixed!important;bottom:auto!important;right:auto!important;height:auto!important;max-height:none!important;';
    pop2.style.top = (rF.bottom + 4) + 'px';
    pop2.style.left = Math.min(rF.left, window.innerWidth - 200) + 'px';
    setTimeout(function(){ document.addEventListener('click', function close2(ev){
      var f = ev.target.closest && ev.target.closest('[data-dwg-filt]');
      if (f) {
        var mode = f.getAttribute('data-dwg-filt');
        var defs = Model.getDeficiencies ? Model.getDeficiencies() : [];
        var pinned = {};
        defs.forEach(function(d){ if (d.drawingId) pinned[d.drawingId] = true; (d.observations||[]).forEach(function(o){ if (o.drawingId) pinned[o.drawingId]=true; if (o.pinDrawingId) pinned[o.pinDrawingId]=true; }); });
        document.querySelectorAll('.drawing-card[data-drawing-id]').forEach(function(c){
          var id = c.getAttribute('data-drawing-id');
          var has = !!pinned[id];
          var show = mode === 'all' || (mode === 'pinned' && has) || (mode === 'nopins' && !has);
          c.style.display = show ? '' : 'none';
        });
        toast('Filter: ' + (mode === 'all' ? 'All' : mode === 'pinned' ? 'Has tasks' : 'No tasks'));
        pop2.remove();
      } else if (!ev.target.closest('#dwg-filter-pop')) {
        pop2.remove();
      }
      document.removeEventListener('click', close2);
    }); }, 10);
  } else if (t.id === 'btn-dwg-purge') {
    var drawings = Model.getDrawings();
    var defs = Model.getDeficiencies ? Model.getDeficiencies() : [];
    var pinnedIds = {};
    defs.forEach(function(d) { (d.observations || []).forEach(function(o) { if (o.drawingId) pinnedIds[o.drawingId] = true; if (o.pinDrawingId) pinnedIds[o.pinDrawingId] = true; }); if (d.drawingId) pinnedIds[d.drawingId] = true; });
    var orphans = drawings.filter(function(d) { return !pinnedIds[d.id]; });
    if (!orphans.length) { toast('No orphan drawings to purge'); return; }
    showConfirm('Purge Orphan Drawings', 'Delete ' + orphans.length + ' drawing' + (orphans.length>1?'s':'') + ' with no pins? This cannot be undone.').then(function(yes) {
      if (!yes) return;
      orphans.forEach(function(d) { Model.removeDrawing(d.id); });
      initDrawings.render();
      toast('Purged ' + orphans.length + ' drawing' + (orphans.length>1?'s':''));
    });
  }
});

// Drawing search — delegated to always work regardless of DOM timing
document.addEventListener('input', function(e) {
  if (e.target.id === 'dwg-search') initDrawings.render();
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
        // Phase 5: persist source PDF buffer for tiled renderer
        var pdfBufKey = 'pdfbuf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        IDB.put('pdfBufs', { id: pdfBufKey, buf: pdfBufCopy }).catch(function(err) {
          console.warn('[Drawings] pdfBufs save failed:', err);
        });
        _runPdfPages(pdf, bn, bn, total, pdfBufCopy, pdfBufKey);
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
function _runPdfPages(pdf, bn, folder, total, arrayBuf, pdfBufKey) {
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
              pdfTiled: true, pdfPage: pg, pdfBufKey: pdfBufKey,
              isOriginal: false, folder: folder,
              r2Key: '', r2Status: '', r2Url: ''
            };
            Model.addDrawing(newDwg);
            // Tiled PDFs use pdfBufs (shared per upload) — skip per-page hi-res JPEG cache
            // Legacy non-tiled path still writes to drawingBlobs for fallback
            if (!newDwg.pdfTiled) {
              IDB.put('drawingBlobs', {
                id: newDwg.id, dataBlob: imgBlob,
                name: newDwg.name, width: hcW, height: hcH,
                folder: folder, pdfPage: pg
              }).catch(function(err) { console.error('[Drawings] IDB save error:', err); });
            }
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

// ── Compact Mode Toggle ─────────────────────────────────
var _compactMode = false;
document.addEventListener('click', function(e) {
  var compactBtn = e.target.closest && e.target.closest('#btn-dwg-compact');
  if (!compactBtn) return;
  _compactMode = !_compactMode;
  var container = document.getElementById('drawings-container');
  if (container) {
    container.querySelectorAll('.drawing-card').forEach(function(card) {
      if (_compactMode) {
        card.style.width = '90px';
        var thumb = card.querySelector('.drawing-thumb');
        if (thumb) thumb.style.height = '64px';
      } else {
        card.style.width = '180px';
        var thumb = card.querySelector('.drawing-thumb');
        if (thumb) thumb.style.height = '120px';
      }
    });
  }
  compactBtn.textContent = _compactMode ? '\u2637 Normal' : '\u2637 Compact';
});

// ── Drawing Search ──────────────────────────────────────
var dwgSearch = document.getElementById('dwg-search');
if (dwgSearch) dwgSearch.addEventListener('input', function() {
  var q = (dwgSearch.value || '').trim().toLowerCase();
  var container = document.getElementById('drawings-container');
  if (!container) return;
  container.querySelectorAll('.drawing-card').forEach(function(card) {
    var name = (card.querySelector('.dwg-card-name') || {}).textContent || '';
    card.style.display = (!q || name.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
  });
});
