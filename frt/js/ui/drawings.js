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

// S120 Push 25 (C4): drawing-deletion wrapper that frees R2 storage when
// the dropped drawing was holding the last reference to a PDF buffer. Use
// this instead of Model.removeDrawing() at every UI call site. Fire-and-
// forget cleanup — failure is logged but not surfaced (orphan PDFs are
// recoverable, deletion failures shouldn't block UX). Order matters: we
// snapshot the drawings BEFORE calling removeDrawing so the sharing check
// sees the live snapshot.
function _removeDrawingWithCleanup(drawingId) {
  var proj = Model.getProject();
  if (!proj || !proj.drawings) {
    Model.removeDrawing(drawingId);
    return;
  }
  var dwg = proj.drawings.find(function(d) { return d && d.id === drawingId; });
  // Snapshot the FULL drawings array — we pass it to deleteDrawingAssets
  // which checks "any OTHER drawing references this pdfBufKey?". Doing the
  // check post-removal would always pass since the target is gone.
  var allDrawings = proj.drawings.slice();
  Model.removeDrawing(drawingId);
  if (dwg && dwg.pdfBufKey) {
    R2.deleteDrawingAssets(proj.id, dwg, allDrawings).then(function(res) {
      if (res.pdfBufDeleted) console.log('[R2 cleanup] Freed PDF buffer for deleted drawing.');
      else if (res.sharedSkipped) console.log('[R2 cleanup] PDF buffer still shared; not deleted.');
    });
  }
}

var _foldedFolders = {};

// ─── S86: Server-side tile rendering manager ──────────────────────────────
// One render job per PDF upload (keyed by pdfBufKey). All N page-drawings
// sharing that pdfBufKey share a single tile manifest.
//
// State machine per drawing:
//   none       — image-only or legacy drawing, no tiles
//   processing — render job fired, polling for manifest
//   ready      — manifest.json present in R2, tiles available
//   failed     — render timed out (10 min) or fire failed
//
// Polling state is in-memory (_tilePolls). On project reload, render() calls
// _resumeTilePolling() to re-attach pollers to drawings with status ===
// 'processing'. A failed render can be retried via the badge click.
// ──────────────────────────────────────────────────────────────────────────
var _tilePolls = {};                     // { pdfBufKey: intervalId }
var _TILE_POLL_MS    = 7000;             // 7s — between 5/10s targets
var _TILE_TIMEOUT_MS = 10 * 60 * 1000;   // 10 min hard ceiling

function _tileSbToken() {
  return localStorage.getItem('sb-access-token') || '';
}
function _tileManifestUrl(pid, pdfBufKey) {
  return R2.WORKER_URL + '/' + pid + '/tiles/' + pdfBufKey + '/manifest.json';
}
// PDF buffer R2 bucket key — actual R2 layout (slug/photos swap from URL form).
function _tilePdfBucketKey(pid, pdfBufKey) {
  return pid + '/photos/frt/pdfbufs/' + pdfBufKey + '.pdf';
}

// Fire the render POST to Worker /render. Worker forwards to Azure Function
// with x-functions-key (held in Worker secret AZURE_FUNC_KEY). Fire-and-
// forget — Worker returns 202 immediately, we don't await Function.
function _fireTileRender(pid, pdfBufKey, r2BucketKey) {
  return fetch(R2.WORKER_URL + '/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + _tileSbToken()
    },
    body: JSON.stringify({ pid: pid, drawingId: pdfBufKey, r2Key: r2BucketKey })
  }).then(function(resp) {
    if (resp.status === 202 || resp.ok) {
      console.log('[Tiles] Render forwarded:', pdfBufKey);
      return true;
    }
    console.warn('[Tiles] Worker /render returned', resp.status);
    return false;
  }).catch(function(err) {
    console.warn('[Tiles] Render POST error:', err && err.message);
    return false;
  });
}

// Start polling for the manifest. Polling stops on success, timeout, or
// explicit _stopTilePolling call. No-op if already polling this pdfBufKey.
function _startTilePolling(pid, pdfBufKey, startedAt) {
  if (_tilePolls[pdfBufKey]) return;
  var manifestUrl = _tileManifestUrl(pid, pdfBufKey);
  var t0 = startedAt || Date.now();
  console.log('[Tiles] Polling:', manifestUrl);

  var check = function() {
    // Cache-bust via query param so Worker's max-age=60 on manifest doesn't
    // cache a 404 for us during the polling window.
    fetch(manifestUrl + '?t=' + Date.now()).then(function(resp) {
      if (resp.ok) {
        _stopTilePolling(pdfBufKey);
        _markTileStatus(pdfBufKey, 'ready');
        console.log('[Tiles] Ready:', pdfBufKey);
        return;
      }
      // 404 (still rendering) — check timeout
      if (Date.now() - t0 > _TILE_TIMEOUT_MS) {
        _stopTilePolling(pdfBufKey);
        _markTileStatus(pdfBufKey, 'failed');
        console.warn('[Tiles] Timeout (10 min):', pdfBufKey);
      }
    }).catch(function(err) {
      // Network error — keep polling, only timeout on actual 404 loop
      console.log('[Tiles] Poll fetch error (will retry):', err && err.message);
    });
  };

  // Kick immediately, then on interval. Immediate check handles resume-
  // after-page-refresh case where manifest may already exist.
  check();
  _tilePolls[pdfBufKey] = setInterval(check, _TILE_POLL_MS);
}

function _stopTilePolling(pdfBufKey) {
  if (_tilePolls[pdfBufKey]) {
    clearInterval(_tilePolls[pdfBufKey]);
    delete _tilePolls[pdfBufKey];
  }
}

// Apply tileStatus to all drawings with matching pdfBufKey. Saves model and
// updates visible badges in-place (no full gallery re-render).
function _markTileStatus(pdfBufKey, status) {
  var proj = Model.getProject();
  if (!proj || !proj.drawings) return;
  var changed = 0;
  proj.drawings.forEach(function(d) {
    if (d.pdfBufKey === pdfBufKey && d.tileStatus !== status) {
      d.tileStatus = status;
      changed++;
    }
  });
  if (changed) {
    Model.saveNow();
    _refreshTileBadges(pdfBufKey, status);
  }
}

function _refreshTileBadges(pdfBufKey, status) {
  var proj = Model.getProject(); if (!proj) return;
  (proj.drawings || []).forEach(function(d) {
    if (d.pdfBufKey !== pdfBufKey) return;
    var card = document.querySelector('.drawing-card[data-drawing-id="' + d.id + '"] .card-thumb');
    if (!card) return;
    var existing = card.querySelector('.tile-badge');
    if (existing) existing.remove();
    var html = _buildTileBadgeHtml(status, d.pdfBufKey);
    if (html) card.insertAdjacentHTML('beforeend', html);
  });
}

function _buildTileBadgeHtml(status, pdfBufKey) {
  if (status === 'processing') {
    return '<div class="tile-badge tile-processing"><span class="tile-spinner"></span>Processing</div>';
  }
  if (status === 'failed') {
    return '<div class="tile-badge tile-failed" data-action="retry-tile" data-pdf-buf-key="' +
           esc(pdfBufKey || '') + '" title="Tile render failed \u2014 click to retry">\u26A0 Retry</div>';
  }
  return '';  // 'ready' or 'none' → no badge
}

// On project load (called from initDrawings.render), find any drawings with
// status='processing' and resume polling for each unique pdfBufKey. Uses the
// drawing's tileProcessStartedAt as t0 so timeout math survives page reloads.
function _resumeTilePolling() {
  var proj = Model.getProject(); if (!proj) return;
  var pid = new URLSearchParams(window.location.search).get('project');
  if (!pid) return;
  var seen = {};
  (proj.drawings || []).forEach(function(d) {
    if (d.tileStatus !== 'processing' || !d.pdfBufKey) return;
    if (seen[d.pdfBufKey] || _tilePolls[d.pdfBufKey]) return;
    seen[d.pdfBufKey] = true;
    _startTilePolling(pid, d.pdfBufKey, d.tileProcessStartedAt || Date.now());
  });
}

// Retry handler — re-fires render POST and restarts polling fresh.
function _retryTileRender(pdfBufKey) {
  var pid = new URLSearchParams(window.location.search).get('project');
  if (!pid) { toast('Hub mode required'); return; }
  var proj = Model.getProject(); if (!proj) return;
  var matches = (proj.drawings || []).filter(function(d) { return d.pdfBufKey === pdfBufKey; });
  if (!matches.length) { toast('Drawing not found'); return; }
  // Reset start time on every match so timeout begins anew
  var now = Date.now();
  matches.forEach(function(d) { d.tileProcessStartedAt = now; });
  _stopTilePolling(pdfBufKey);
  _markTileStatus(pdfBufKey, 'processing');
  _fireTileRender(pid, pdfBufKey, _tilePdfBucketKey(pid, pdfBufKey));
  _startTilePolling(pid, pdfBufKey, now);
  toast('Retrying tile render\u2026');
}

// ──────────────────────────────────────────────────────────────────────────
// S97 console helpers — manual control over Azure tile rendering.
//
// Use case: drawings uploaded standalone (or where Azure auto-render failed
// silently) need their tile pyramids built. These globals let the user
// inspect drawing state and trigger renders without touching the UI.
//
//   _frtTilesInspect()            — print all drawings with tile-render state
//   _frtRenderAllMissingTiles()   — fire Azure render for every PDF lacking a manifest
//   _frtRenderOnePdf(pdfBufKey)   — re-render a specific PDF (by pdfBufKey)
//   _frtCheckManifest(pdfBufKey)  — direct GET on the manifest URL (bypasses cache)
// ──────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window._frtTilesInspect = function () {
    var proj = Model.getProject();
    if (!proj) { console.warn('[Tiles] No project loaded'); return null; }
    var pid = new URLSearchParams(window.location.search).get('project');
    var byKey = {};
    (proj.drawings || []).forEach(function (d) {
      if (!d.pdfBufKey) {
        byKey['__nonpdf__' + d.id] = byKey['__nonpdf__' + d.id] || { pdfBufKey: '(non-PDF)', drawings: [], tileStatus: '-', tileManifestUrl: '' };
        byKey['__nonpdf__' + d.id].drawings.push(d.name);
        return;
      }
      var key = d.pdfBufKey;
      if (!byKey[key]) {
        byKey[key] = {
          pdfBufKey: key, pages: 0, drawings: [],
          tileStatus: d.tileStatus || '(unset)',
          tileManifestUrl: d.tileManifestUrl || '(unset)'
        };
      }
      byKey[key].pages++;
      byKey[key].drawings.push(d.pdfPage ? ('pg' + d.pdfPage + ': ' + d.name) : d.name);
    });
    var rows = Object.keys(byKey).map(function (k) { return byKey[k]; });
    console.log('[Tiles] Project pid:', pid);
    console.log('[Tiles] Unique pdfBufKeys:', rows.length);
    console.table(rows.map(function (r) {
      return {
        pdfBufKey: (r.pdfBufKey || '').substring(0, 30) + ((r.pdfBufKey || '').length > 30 ? '\u2026' : ''),
        pages: r.pages || 0,
        tileStatus: r.tileStatus,
        hasManifestUrl: r.tileManifestUrl && r.tileManifestUrl !== '(unset)' ? 'yes' : 'NO'
      };
    }));
    return rows;
  };

  window._frtRenderOnePdf = function (pdfBufKey) {
    var pid = new URLSearchParams(window.location.search).get('project');
    if (!pid) { console.warn('[Tiles] Hub mode required (no project param in URL)'); return; }
    if (!pdfBufKey) { console.warn('[Tiles] Usage: _frtRenderOnePdf("<pdfBufKey>")'); return; }
    var proj = Model.getProject();
    if (!proj) { console.warn('[Tiles] No project loaded'); return; }
    var matches = (proj.drawings || []).filter(function (d) { return d.pdfBufKey === pdfBufKey; });
    if (!matches.length) { console.warn('[Tiles] No drawings found with pdfBufKey:', pdfBufKey); return; }
    // Backfill manifest URL on every page sharing this pdfBufKey
    var manifestUrl = _tileManifestUrl(pid, pdfBufKey);
    var now = Date.now();
    matches.forEach(function (d) {
      d.tileManifestUrl = manifestUrl;
      d.tileServer = R2.WORKER_URL;
      d.tileProcessStartedAt = now;
    });
    _stopTilePolling(pdfBufKey);
    _markTileStatus(pdfBufKey, 'processing');
    var bucketKey = _tilePdfBucketKey(pid, pdfBufKey);
    console.log('[Tiles] Firing render for', pdfBufKey, '(', matches.length, 'pages, R2 key:', bucketKey, ')');
    _fireTileRender(pid, pdfBufKey, bucketKey).then(function (ok) {
      if (ok) {
        console.log('[Tiles] Render queued at Worker. Polling for manifest every 7s, 10min ceiling.');
        _startTilePolling(pid, pdfBufKey, now);
      } else {
        console.warn('[Tiles] Render POST failed \u2014 status will become "failed" via timeout, OR retry now via badge.');
      }
    });
    return manifestUrl;
  };

  window._frtRenderAllMissingTiles = function () {
    var pid = new URLSearchParams(window.location.search).get('project');
    if (!pid) { console.warn('[Tiles] Hub mode required'); return; }
    var proj = Model.getProject();
    if (!proj) { console.warn('[Tiles] No project loaded'); return; }
    var seen = {};
    var toRender = [];
    (proj.drawings || []).forEach(function (d) {
      if (!d.pdfBufKey) return;
      if (d.tileStatus === 'ready') return;            // already rendered
      if (d.tileStatus === 'processing') return;       // already in flight
      if (seen[d.pdfBufKey]) return;                   // dedupe by pdfBufKey
      seen[d.pdfBufKey] = true;
      toRender.push(d.pdfBufKey);
    });
    if (!toRender.length) {
      console.log('[Tiles] Nothing to render \u2014 all PDFs are either ready or already processing.');
      console.log('[Tiles] If you want to FORCE re-render of a "ready" PDF, use _frtRenderOnePdf("<pdfBufKey>") directly.');
      return [];
    }
    console.log('[Tiles] Will fire render for', toRender.length, 'PDF(s):');
    toRender.forEach(function (k) { console.log('  \u2022', k); });
    toRender.forEach(function (k) { window._frtRenderOnePdf(k); });
    return toRender;
  };

  window._frtCheckManifest = function (pdfBufKey) {
    var pid = new URLSearchParams(window.location.search).get('project');
    if (!pid || !pdfBufKey) { console.warn('[Tiles] Usage: _frtCheckManifest("<pdfBufKey>")'); return; }
    var url = _tileManifestUrl(pid, pdfBufKey) + '?t=' + Date.now();
    console.log('[Tiles] GET', url);
    fetch(url).then(function (r) {
      console.log('[Tiles] HTTP', r.status, r.statusText);
      if (r.ok) return r.json();
      return null;
    }).then(function (m) {
      if (m) {
        console.log('[Tiles] Manifest:', m);
        if (m.pages) console.log('[Tiles]', m.pages.length, 'pages, levels:',
          (m.pages[0] && m.pages[0].levels || []).map(function (l) { return 'L' + l.level + '(' + l.cols + 'x' + l.rows + ')'; }).join(' '));
      }
    }).catch(function (e) { console.warn('[Tiles] Fetch error:', e && e.message); });
  };

  // S97 RECOVERY HELPER — for legacy drawings that lost their pdfBufKey field.
  // Lists R2 pdfbufs/, picks the newest PDF, back-stamps every PDF-page
  // drawing (id pattern includes _pg<N>_) with the recovered pdfBufKey +
  // tileManifestUrl + tileStatus='processing', saves the model, then fires
  // Azure render and starts polling for the manifest. One-shot recovery for
  // drawings uploaded before S86 added pdfBufKey to the schema, OR drawings
  // where a sync stripped the field.
  window._frtRecoverTiles = function () {
    var pid = new URLSearchParams(window.location.search).get('project');
    if (!pid) { console.warn('[Recover] Hub mode required (no ?project= in URL)'); return; }
    var proj = Model.getProject();
    if (!proj || !proj.drawings || !proj.drawings.length) {
      console.warn('[Recover] No drawings in project'); return;
    }
    var listUrl = R2.WORKER_URL + '/list/' + pid + '/frt/pdfbufs/';
    console.log('[Recover] Listing PDFs in R2:', listUrl);
    fetch(listUrl).then(function (r) {
      if (!r.ok) throw new Error('List HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      if (!data.files || !data.files.length) {
        console.warn('[Recover] No PDFs found in R2 pdfbufs/. Cannot recover automatically.');
        console.warn('[Recover] Re-upload the original PDF to the Drawings tab instead.');
        return;
      }
      // Sort by uploaded desc, pick newest
      var sorted = data.files.slice().sort(function (a, b) {
        return (b.uploaded || '').localeCompare(a.uploaded || '');
      });
      console.log('[Recover] Found', sorted.length, 'PDF(s) in R2:');
      sorted.forEach(function (f, i) {
        console.log('  ' + (i === 0 ? '\u2192' : ' ') + ' ' + f.key.split('/').pop() +
          '  (' + Math.round((f.size || 0) / 1024 / 1024) + ' MB, ' + f.uploaded + ')');
      });
      var newest = sorted[0];
      // pdfBufKey = filename without .pdf extension
      var fname = newest.key.split('/').pop();
      var pdfBufKey = fname.replace(/\.pdf$/i, '');
      console.log('[Recover] Using newest PDF. Recovered pdfBufKey:', pdfBufKey);

      // Back-stamp every PDF-page drawing (id pattern: dwg_<ts>_pg<N>_<rand>)
      var manifestUrl = _tileManifestUrl(pid, pdfBufKey);
      var bucketKey = _tilePdfBucketKey(pid, pdfBufKey);
      var bucketUrl = R2.WORKER_URL + '/' + bucketKey;
      var stamped = 0, skipped = 0;
      var now = Date.now();
      proj.drawings.forEach(function (d) {
        if (!/_pg\d+_/.test(d.id)) { skipped++; return; }
        d.pdfBufKey = pdfBufKey;
        d.pdfBufR2Url = bucketUrl;
        d.tileManifestUrl = manifestUrl;
        d.tileServer = R2.WORKER_URL;
        d.tileStatus = 'processing';
        d.tileProcessStartedAt = now;
        stamped++;
      });
      console.log('[Recover] Back-stamped ' + stamped + ' drawing(s).' +
        (skipped ? ' Skipped ' + skipped + ' non-PDF drawing(s).' : ''));

      if (!stamped) {
        console.warn('[Recover] No PDF-page drawings found (none match pattern _pg<N>_). Aborting.');
        return;
      }

      // Save model locally + push to cloud, then fire Azure render
      Model.saveNow().then(function () {
        console.log('[Recover] Model saved locally. Firing Azure render now\u2026');
        return _fireTileRender(pid, pdfBufKey, bucketKey);
      }).then(function (ok) {
        if (ok === false) {
          console.warn('[Recover] Render POST failed. Drawings are stamped but Azure didn\'t accept the job.');
          console.warn('[Recover] Retry with: _frtRenderOnePdf("' + pdfBufKey + '")');
          return;
        }
        _startTilePolling(pid, pdfBufKey, now);
        console.log('[Recover] DONE \u2014 polling for manifest every 7s. Expected ~3min for a 128 MB PDF.');
        console.log('[Recover] When you see "[Tiles] Ready: ' + pdfBufKey + '", reopen the drawing on iPad to get the tile pyramid.');
        console.log('[Recover] Track progress with: _frtCheckManifest("' + pdfBufKey + '")');
      }).catch(function (err) {
        console.error('[Recover] Failed during save or render fire:', err && err.message);
      });
    }).catch(function (err) {
      console.error('[Recover] List request failed:', err && err.message);
    });
  };
}

// ──────────────────────────────────────────────────────────────────────────

// ── S79: Download-with-pins-baked-on (raster drawings only) ──
// PDF-tiled drawings fall back to raw URL download (WebGL markup render deferred to Phase 5).
function _deficIsOpen(d) { return (d.status || 'open') === 'open'; }
function _addPinsToCanvas(ctx, dwg, canvas) {
  var proj = Model.getProject(); if (!proj) return;
  var ad = Model.getAllDeficiencies(proj);
  var pins = ad.filter(function(r){ return r.defic.drawingId === dwg.id && r.defic.pinX != null; });
  if (!pins.length) return;
  var scale = canvas.width / 1200;
  pins.forEach(function(r) {
    var d = r.defic;
    var px = d.pinX * canvas.width, py = d.pinY * canvas.height;
    var fill = d.iar ? '#FF69B4' : (_deficIsOpen(d) ? '#C0392B' : '#1A7A4A');
    var r0 = Math.max(3, 4 * scale), tipY = r0 * 2.2;
    ctx.save(); ctx.translate(px, py - tipY);
    ctx.beginPath(); ctx.arc(0, 0, r0, Math.PI, 0, false);
    ctx.bezierCurveTo(r0, r0*0.8, r0*0.3, tipY, 0, tipY);
    ctx.bezierCurveTo(-r0*0.3, tipY, -r0, r0*0.8, -r0, 0);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = Math.max(1, 1.5*scale); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r0*0.6, 0, Math.PI*2); ctx.fillStyle = 'white'; ctx.fill();
    var fs = Math.max(6, r0 * 0.8);
    ctx.fillStyle = fill; ctx.font = '800 ' + fs + 'px Calibri,Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(d.num), 0, 0);
    ctx.restore();
  });
}
function _buildDownloadCanvas(dwg, incPins) {
  return new Promise(function(resolve) {
    if (dwg.pdfTiled) { resolve(null); return; }
    var src = dwg.r2Url || dwg.dataUrl || dwg.thumb;
    if (!src) { resolve(null); return; }
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth || 1200;
      c.height = img.naturalHeight || 900;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      if (incPins) { try { _addPinsToCanvas(ctx, dwg, c); } catch(e) { console.warn('[dl] pin bake err', e); } }
      resolve(c);
    };
    img.onerror = function() { resolve(null); };
    img.src = src;
  });
}
function _downloadDrawingWithPins(dwg) {
  var safe = (dwg.name || 'drawing').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (dwg.pdfTiled) {
    var src = dwg.r2Url || dwg.dataUrl;
    if (!src) { toast('No data to download'); return; }
    var a0 = document.createElement('a'); a0.href = src; a0.download = 'ARENCON_' + safe + '.pdf';
    document.body.appendChild(a0); a0.click(); document.body.removeChild(a0);
    toast('Downloaded (PDF — pins not baked)');
    return;
  }
  _buildDownloadCanvas(dwg, true).then(function(canvas) {
    if (!canvas) { toast('No image data to download'); return; }
    try {
      var data = canvas.toDataURL('image/png');
      var a = document.createElement('a'); a.href = data; a.download = 'ARENCON_' + safe + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast('Downloaded ' + safe + '.png');
    } catch(e) {
      console.warn('[dl] toDataURL failed (CORS?)', e);
      var src2 = dwg.r2Url || dwg.dataUrl;
      if (src2) {
        var a2 = document.createElement('a'); a2.href = src2; a2.download = 'ARENCON_' + safe + '.png';
        document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
        toast('Downloaded (pins skipped — CORS)');
      }
    }
  });
}

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
  // S86: tile processing/failed badge (bottom-right corner of thumb)
  var tileBadge = _buildTileBadgeHtml(d.tileStatus, d.pdfBufKey);
  if (tileBadge) h += tileBadge;
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
      // S115: Make the entire folder group a drop target. Previously only the
      // small "+ Drop plans here" reserve card caught drops; drops onto folder
      // header/body whitespace/existing cards fell through to the browser
      // (which would either open the file or do nothing). Now any drop within
      // the folder routes files to THIS folder. Master drop-zone at top is
      // the only thing that creates new folders.
      var escFn = esc(fn).replace(/'/g, "\\'");
      html += '<div class="dwg-folder-group" data-folder="' + esc(fn) + '" ' +
        'ondragover="event.preventDefault();this.classList.add(\'drag-over\')" ' +
        'ondragleave="if(event.target===this)this.classList.remove(\'drag-over\')" ' +
        'ondrop="event.preventDefault();this.classList.remove(\'drag-over\');if(window._handleDrawingFilesIntoFolder)window._handleDrawingFilesIntoFolder(event.dataTransfer.files,\'' + escFn + '\')" ' +
        'style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden;">';
      html += '<div class="dwg-folder-hdr" data-action="toggle-folder" data-folder="' + esc(fn) + '" style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--smoke);cursor:pointer;user-select:none;">';
      html += '<input type="checkbox" class="folder-checkbox" data-folder-name="' + esc(fn) + '" title="Select all in folder">';
      html += '<span style="font-size:12px;width:14px;">' + (isFolded ? '\u25B6' : '\u25BC') + '</span>';
      html += '\uD83D\uDCC1 <strong style="font-size:calc(13px + var(--ts));color:var(--steel);">' + esc(fn) + '</strong>';
      html += ' <span style="font-weight:400;color:var(--silver);font-size:calc(12px + var(--ts));">(' + items.length + ' plans)</span>';
      html += '<button data-action="rename-folder" data-folder="' + esc(fn) + '" style="border:none;background:none;cursor:pointer;font-size:calc(12px + var(--ts));padding:2px 4px;color:var(--silver);margin-left:auto;" title="Rename folder">\u270F\uFE0F</button>';
      html += '</div>';
      html += '<div class="dwg-folder-body dwg-card-row" style="padding:8px;display:flex;flex-wrap:wrap;' + (isFolded ? 'display:none;' : '') + '">';
      items.forEach(function(d) { html += buildDrawingCard(d, allDefics); });
      // S81 Option 3: "+ Drop plans here" reserve card as last tile. Click
      // opens file picker scoped to this folder. Drop also still works on
      // this card directly (parent folder-group catches it either way).
      html += '<div class="drawing-card add-card" ' +
        'data-add-folder="' + esc(fn) + '" ' +
        'onclick="if(window._uploadToFolder)window._uploadToFolder(\'' + escFn + '\')">' +
        '<div class="add-card-inner">+ Drop plans here<br>' +
        '<span style="font-size:calc(10px + var(--ts));color:var(--silver);font-weight:400;">added to <em>' + esc(fn) + '</em></span></div>' +
        '</div>';
      html += '</div></div>';
    });

    container.innerHTML = html;
    console.log('[Drawings] Rendered', drawings.length, 'drawings in', folderNames.length + 1, 'groups');

    // S86: re-attach pollers for any drawings still in 'processing' state
    // (e.g. after a page reload while tile render is in flight).
    _resumeTilePolling();

    // Lazy-generate thumbnails for drawings missing them (cloud-synced from v1)
    // S98d: include tile drawings — for these, the Azure-rendered L0 tile
    // serves as the thumb source. Fixes Page 1 of Caplink (and any other
    // drawing where r2Url was never populated or got lost).
    var needThumb = drawings.filter(function(d) { return !d.thumb && (d.tileManifestUrl || d.r2Url); });
    if (needThumb.length) _lazyGenThumbs(needThumb, 0);
  }
};

function _lazyGenThumbs(list, idx) {
  if (idx >= list.length) return;
  var d = list[idx];

  function _next(delay) {
    setTimeout(function() { _lazyGenThumbs(list, idx + 1); }, delay || 100);
  }

  // Shared: given a loaded img and source-crop rect, produce thumb + update card
  function _finishThumb(img, sx, sy, sW, sH) {
    // S113 Push 24: bumped from 200 → 400 max width and quality 0.7 → 0.85.
    // Card thumb display height is 135px and grid card width is typically
    // 250-320 CSS px. A 200-px-wide JPEG at 0.7 quality looked visibly
    // blurry. 400 / 0.85 quadruples the pixel data with marginal IDB cost
    // and renders crisp at every card size up to 600 px wide.
    var maxW = 400;
    var scale = Math.min(1, maxW / sW);
    var tw = Math.max(1, Math.round(sW * scale));
    var th = Math.max(1, Math.round(sH * scale));
    var c = document.createElement('canvas');
    c.width = tw; c.height = th;
    c.getContext('2d').drawImage(img, sx, sy, sW, sH, 0, 0, tw, th);
    d.thumb = c.toDataURL('image/jpeg', 0.85);
    c.width = 1; c.height = 1;
    var card = document.querySelector('.drawing-card[data-drawing-id="' + d.id + '"] .card-thumb');
    if (card) {
      var pinBadge = card.querySelector('.pin-badge');
      var pinHTML = pinBadge ? pinBadge.outerHTML : '';
      card.innerHTML = '<img src="' + d.thumb + '" alt="' + (d.name || '') + '" decoding="async">' + pinHTML;
    }
    _next(200);
  }

  // Fallback path: load r2Url and use full image (legacy non-tile drawings)
  function _tryR2() {
    if (!d.r2Url) { _next(); return; }
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() { _finishThumb(img, 0, 0, img.width, img.height); };
    img.onerror = function() { _next(); };
    img.src = d.r2Url;
  }

  // S98d-v2: for tile drawings, the L0 tile is always stored as a padded
  // 512x512 WebP. The actual page thumbnail content is in the top-left
  // corner at manifest.levels[0].width x levels[0].height (e.g. 256x171
  // for 3:2 landscape). The rest is white sharp.extend() padding. We must
  // fetch the manifest to know the real content dims, then pass them as
  // the drawImage source rect to crop away the padding. Without this
  // cropping, thumbs drew the whole 512x512 tile and the real content
  // became a tiny strip in the top-left — the exact bug Mark saw in v203.
  if (d.tileManifestUrl) {
    fetch(d.tileManifestUrl)
      .then(function(r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function(m) {
        var wantPage = d.pdfPage || 1;
        var page = null;
        for (var i = 0; i < (m.pages || []).length; i++) {
          if (m.pages[i].pageNumber === wantPage) { page = m.pages[i]; break; }
        }
        if (!page || !page.levels || !page.levels[0]) throw new Error('no L0');
        var l0 = page.levels[0];
        var contentW = l0.width, contentH = l0.height;
        var tileUrl = d.tileManifestUrl.replace(/manifest\.json(\?.*)?$/,
          'page-' + wantPage + '/level-0/0-0.webp');
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
          // Clamp source rect to image bounds (defensive — if content dims
          // somehow exceed the 512x512 tile, drawImage would throw).
          var sW = Math.min(contentW, img.width);
          var sH = Math.min(contentH, img.height);
          _finishThumb(img, 0, 0, sW, sH);
        };
        img.onerror = function() { _tryR2(); };
        img.src = tileUrl;
      })
      .catch(function() { _tryR2(); });
    return;
  }

  _tryR2();
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

// S116 Push 17: NEW — swap-content picker. Lists every other drawing in the
// project (grouped by folder), tap one to copy its content onto the
// CURRENT drawing record. The current drawing's id, pins, deficiencies,
// markups all stay intact; only the image bytes + tile-pyramid links get
// swapped in. Designed for Mark's "I uploaded new drawings as a separate
// group, how do I move my pins onto them" workflow.
function _showSwapPicker(currentDrawingId) {
  _closeActiveMenu();
  var proj = Model.getProject();
  if (!proj || !proj.drawings) return;
  var others = (proj.drawings || []).filter(function(d) { return d.id !== currentDrawingId; });
  if (!others.length) {
    toast('\u26A0 No other drawings in this project to swap with');
    return;
  }
  var current = (proj.drawings || []).find(function(d) { return d.id === currentDrawingId; });
  if (!current) return;

  // Build a modal-style picker overlay.
  var overlay = document.createElement('div');
  overlay.className = 'swap-picker-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9100;display:flex;align-items:center;justify-content:center;padding:20px;';
  var modal = document.createElement('div');
  modal.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.35);max-width:680px;width:100%;max-height:80vh;display:flex;flex-direction:column;font-family:Calibri,sans-serif;color:var(--fg);';
  // Header
  var header = document.createElement('div');
  header.style.cssText = 'padding:14px 18px;border-bottom:1px solid var(--border);';
  header.innerHTML = '<div style="font-weight:700;font-size:calc(15px + var(--ts));margin-bottom:4px;">\uD83D\uDD01 Swap content with...</div>'
    + '<div style="font-size:calc(12px + var(--ts));color:var(--steel);">'
    + 'Pick another drawing to copy its image + tiles onto <strong>' + esc(current.name || 'this drawing') + '</strong>. '
    + 'Pins, deficiencies, markups all stay attached to this drawing.'
    + '</div>';
  modal.appendChild(header);

  // List
  var list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto;padding:8px;flex:1;';
  // Group by folder
  var byFolder = {};
  others.forEach(function(d) {
    var f = d.folder || '(no folder)';
    if (!byFolder[f]) byFolder[f] = [];
    byFolder[f].push(d);
  });
  Object.keys(byFolder).sort().forEach(function(folderName) {
    var folderHdr = document.createElement('div');
    folderHdr.style.cssText = 'font-size:calc(11px + var(--ts));font-weight:700;color:var(--steel);padding:6px 10px;text-transform:uppercase;letter-spacing:.5px;';
    folderHdr.textContent = '\uD83D\uDCC1 ' + folderName;
    list.appendChild(folderHdr);
    byFolder[folderName].forEach(function(d) {
      var row = document.createElement('button');
      row.type = 'button';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;background:transparent;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));color:var(--fg);cursor:pointer;transition:background .12s;';
      row.onmouseenter = function() { row.style.background = 'var(--smoke)'; };
      row.onmouseleave = function() { row.style.background = 'transparent'; };
      var thumbSrc = d.thumb || d.dataUrl || '';
      var thumbHtml = thumbSrc
        ? '<img src="' + thumbSrc + '" style="width:48px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0;background:#eee;">'
        : '<div style="width:48px;height:36px;background:var(--smoke);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--silver);font-size:18px;">\uD83D\uDCD0</div>';
      var hasTiles = !!(d.tileManifestUrl && d.tileStatus === 'ready');
      var tilesBadge = hasTiles
        ? '<span style="font-size:calc(10px + var(--ts));color:#5C7A65;background:rgba(92,122,101,.10);padding:1px 6px;border-radius:3px;margin-left:6px;">\u2713 tiles</span>'
        : '<span style="font-size:calc(10px + var(--ts));color:var(--silver);margin-left:6px;">no tiles</span>';
      row.innerHTML = thumbHtml
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(d.name || 'Drawing') + tilesBadge + '</div>'
        + '<div style="font-size:calc(10px + var(--ts));color:var(--silver);">id: ' + d.id.substr(-12) + '</div>'
        + '</div>'
        + '<span style="color:var(--primary);font-weight:700;">Use \u2192</span>';
      row.onclick = function() {
        showConfirm('Swap drawing content',
          'Copy "' + (d.name || 'this drawing') + '" content onto "' + (current.name || 'current drawing') + '"?\n\n' +
          'Pins, deficiencies, and markups on the current drawing stay intact. The source drawing will not be modified — you can delete it afterwards if no longer needed.'
        ).then(function(yes) {
          if (!yes) return;
          // Copy content fields from source -> current; preserve id, name,
          // folder (Mark might want to keep the original organisational
          // metadata), and any pin-relevant fields. Pins live on
          // deficiency records keyed by drawingId, NOT on the drawing
          // itself, so they're untouched by this operation.
          current.dataUrl = d.dataUrl || '';
          current.r2Url = d.r2Url || '';
          current.r2Key = d.r2Key || '';
          current.thumb = d.thumb || '';
          current.tileManifestUrl = d.tileManifestUrl || '';
          current.tileStatus = d.tileStatus || '';
          current.pdfBufKey = d.pdfBufKey || '';
          current.pdfBufR2Url = d.pdfBufR2Url || '';
          current.tileServer = d.tileServer || '';
          current.naturalW = d.naturalW || 0;
          current.naturalH = d.naturalH || 0;
          current.rotation = d.rotation || 0;
          Model.saveNow();
          initDrawings.render();
          overlay.remove();
          toast('\u2713 Content swapped \u2014 pins/deficiencies preserved');
        });
      };
      list.appendChild(row);
    });
  });
  modal.appendChild(list);

  // Footer (Cancel)
  var footer = document.createElement('div');
  footer.style.cssText = 'padding:10px 18px;border-top:1px solid var(--border);text-align:right;';
  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:6px 16px;background:transparent;border:1.5px solid var(--border);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(12px + var(--ts));cursor:pointer;color:var(--steel);';
  cancelBtn.onclick = function() { overlay.remove(); };
  footer.appendChild(cancelBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  // Click outside modal to dismiss
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
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
    + '<div class="separator"></div>'
    + '<button data-ctx="replace">\uD83D\uDD27 Replace image (file)</button>'
    + '<button data-ctx="newversion">\u2B06\uFE0F Upload new version</button>'
    + '<button data-ctx="swapwith">\uD83D\uDD01 Swap content with\u2026</button>'
    + '<div class="separator"></div>'
    + '<button data-ctx="download">\u2B07\uFE0F Download drawing</button>'
    + '<div class="separator"></div>'
    + '<button data-ctx="delete" class="danger">\uD83D\uDDD1\uFE0F Delete drawing</button>';
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
    } else if (act === 'replace' || act === 'newversion') {
      // S116 Push 17: 'newversion' was unhandled (Mark: "doesn't work at all").
      // Route both 'replace' and 'newversion' through the same file picker —
      // they're functionally identical (swap image bytes on this drawing
      // record, keeping id + pins). The button labels differ for UX clarity
      // but the action is one and the same.
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*,.pdf';
      inp.onchange = function() {
        if (inp.files[0]) {
          var reader = new FileReader();
          reader.onload = function() {
            // S120 Push 25 (C4): exclusive-asset cleanup BEFORE we overwrite
            // the dwg fields. We snapshot the old pdfBufKey via a clone so
            // the post-replace key isn't seen by the sharing check. R2.del
            // is fire-and-forget — failing to delete is tolerable (orphan
            // PDF stays, no functional break).
            var proj = Model.getProject();
            var pid = proj && proj.id;
            var oldDwg = { id: dwg.id, pdfBufKey: dwg.pdfBufKey };
            if (pid && oldDwg.pdfBufKey) {
              R2.deleteDrawingAssets(pid, oldDwg, proj.drawings).then(function(res) {
                if (res.pdfBufDeleted) console.log('[R2 cleanup] Old PDF buffer freed on replace.');
                else if (res.sharedSkipped) console.log('[R2 cleanup] Old PDF buffer still shared; not deleted.');
              });
            }
            dwg.dataUrl = reader.result;
            dwg.thumb = '';
            // Invalidate tile pyramid since image bytes changed
            dwg.tileStatus = '';
            dwg.tileManifestUrl = '';
            dwg.pdfBufKey = '';
            Model.saveNow();
            initDrawings.render();
            toast('\u2713 Image replaced \u2014 pins preserved');
          };
          reader.readAsDataURL(inp.files[0]);
        }
      };
      inp.click();
    } else if (act === 'swapwith') {
      // S116 Push 17: NEW. Swap this drawing's content with another drawing
      // already in the project. Use case: Mark uploaded a new "Inspector 2"
      // group of drawings, wants to move all his pins from the OLD drawings
      // onto the new content. Per-drawing flow:
      //   1. Click 3-dot on the OLD drawing
      //   2. Click "Swap content with..."
      //   3. Pick the matching NEW drawing from the list
      //   4. The OLD drawing's id (and its pins) stay intact, but the image
      //      content + tile pyramid links come from the NEW drawing.
      //   5. The NEW drawing record can then be deleted (it's a husk now).
      _showSwapPicker(drawingId);
    } else if (act === 'download') {
      _downloadDrawingWithPins(dwg);
    } else if (act === 'delete') {
      showConfirm('Delete Drawing', 'Delete "' + (dwg ? dwg.name : 'this drawing') + '"? Pins will be removed.').then(function(yes) {
        if (yes) { _removeDrawingWithCleanup(drawingId); initDrawings.render(); toast('Deleted'); }
      });
    }
  });

  setTimeout(function() { document.addEventListener('click', _closeActiveMenu); }, 10);
}

// ── Click Handler ───────────────────────────────────────
document.addEventListener('click', function(e) {
  // 0) S86: Retry tile render (MUST be before open-viewer — badge sits inside card-thumb)
  var retryBtn = e.target.closest && e.target.closest('[data-action="retry-tile"]');
  if (retryBtn) {
    e.stopPropagation();
    e.preventDefault();
    var pdfBufKey = retryBtn.getAttribute('data-pdf-buf-key');
    if (pdfBufKey) _retryTileRender(pdfBufKey);
    return;
  }

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
            toast('Downloading ' + list.length + ' drawing' + (list.length>1?'s':'') + ' (baking pins)...');
            list.forEach(function(d, i){ setTimeout(function(){
              _downloadDrawingWithPins(d);
            }, i * 800); });
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
              _selectedDrawings.forEach(function(id){ _removeDrawingWithCleanup(id); });
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
      orphans.forEach(function(d) { _removeDrawingWithCleanup(d.id); });
      initDrawings.render();
      toast('Purged ' + orphans.length + ' drawing' + (orphans.length>1?'s':''));
    });
  } else if (t.id === 'btn-dwg-build-tiles') {
    // S116 Push 15: surface-level access to _frtRecoverTiles for legacy
    // projects that lost their tile pyramid. Re-fires Azure render for the
    // newest PDF in R2 + polls for the manifest. Used for project 1490.04
    // which was rendering through the static-image fallback. Hub mode only —
    // standalone has no R2 backing.
    var pid = new URLSearchParams(window.location.search).get('project');
    if (!pid) {
      toast('\u26A0 Build Tiles works in Hub mode only (open project from the Hub)');
      return;
    }
    if (!window._frtRecoverTiles) {
      toast('\u26A0 Tile recovery helper not available');
      return;
    }
    showConfirm('Build Tile Pyramid',
      'Re-fire Azure render for the newest PDF in this project\'s R2 storage? Existing pins, deficiencies, and markups are NOT affected. Tile pyramid build typically takes 2-3 minutes for a 100MB PDF — open the browser console to watch progress.'
    ).then(function(yes) {
      if (!yes) return;
      try {
        window._frtRecoverTiles();
        toast('\uD83D\uDD27 Tile build started — watch console for progress (~3 min)');
      } catch (err) {
        toast('\u26A0 Build failed: ' + (err && err.message ? err.message : 'unknown error'));
        console.error('[Build Tiles]', err);
      }
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

// ─── V1 Drawing-conflict logic (ported verbatim S83) ────────────────
// Local escape helper (avoids cross-module import; matches v1's escHtml).
function _escHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _dwgConflictsInFolder(names, folder, p){
  var existing = (p.drawings || [])
    .filter(function(d){ return (d.folder || '') === folder; })
    .map(function(d){ return d.name; });
  return names.filter(function(n){ return existing.indexOf(n) !== -1; });
}

function _suggestFolderName(baseName, p){
  var folders = {};
  (p.drawings || []).forEach(function(d){ if (d.folder) folders[d.folder] = true; });
  var candidates = [baseName + ' (Inspector 2)', baseName + ' (Set B)', baseName + ' (Copy)'];
  ['B','C','D','E','F'].forEach(function(s){ candidates.push(baseName + ' \u2014 Set ' + s); });
  for (var i = 0; i < candidates.length; i++){
    if (!folders[candidates[i]]) return candidates[i];
  }
  var n = 2;
  while (folders[baseName + ' (' + n + ')']) n++;
  return baseName + ' (' + n + ')';
}

function _showDrawingConflictModal(conflictNames, suggestedFolder, onProceed, onCancel){
  var ex = document.getElementById('_dwg-conflict-overlay');
  if (ex) ex.remove();
  var ov = document.createElement('div');
  ov.id = '_dwg-conflict-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(28,35,51,.88);z-index:19500;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
  var listHtml = conflictNames.slice(0, 8).map(function(n){
    return '<div style="padding:3px 0;color:#f0a030;font-size:calc(12px + var(--ts));">\u26A0 ' + _escHtml(n) + '</div>';
  }).join('');
  if (conflictNames.length > 8){
    listHtml += '<div style="color:#8892a8;font-size:calc(11px + var(--ts));">\u2026and ' + (conflictNames.length - 8) + ' more</div>';
  }
  ov.innerHTML =
    '<div style="background:#1e2028;border:1px solid #3a3e48;border-radius:14px;padding:28px 26px;max-width:420px;width:100%;box-shadow:0 16px 48px rgba(0,0,0,.6);font-family:Calibri,sans-serif;">' +
      '<div style="font-size:calc(16px + var(--ts));font-weight:700;color:#dde2f0;margin-bottom:6px;">\u26A0\uFE0F Drawing Name Conflict</div>' +
      '<div style="font-size:calc(13px + var(--ts));color:#8892a8;margin-bottom:14px;">The following names already exist. New drawings will be saved into a separate folder to keep each set independent:</div>' +
      '<div style="background:#141720;border-radius:8px;padding:10px 14px;margin-bottom:16px;max-height:140px;overflow-y:auto;">' + listHtml + '</div>' +
      '<div style="font-size:calc(12px + var(--ts));color:#8892a8;margin-bottom:6px;">New folder name:</div>' +
      '<input id="_dwgc-folder-inp" type="text" value="' + _escHtml(suggestedFolder) + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #4a5570;border-radius:8px;font-size:calc(14px + var(--ts));font-family:Calibri,sans-serif;background:#12151e;color:#dde2f0;margin-bottom:6px;">' +
      '<div id="_dwgc-err" style="font-size:calc(11px + var(--ts));color:#C62828;min-height:16px;margin-bottom:12px;"></div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button id="_dwgc-cancel" style="flex:1;padding:10px;background:none;color:#8892a8;border:1.5px solid #3a3e48;border-radius:8px;font-size:calc(13px + var(--ts));cursor:pointer;font-family:Calibri,sans-serif;">Cancel upload</button>' +
        '<button id="_dwgc-ok" style="flex:2;padding:11px;background:#9C2742;color:white;border:none;border-radius:8px;font-size:calc(14px + var(--ts));font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;">Save to New Folder</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  var inp = document.getElementById('_dwgc-folder-inp');
  var errEl = document.getElementById('_dwgc-err');
  setTimeout(function(){ inp.focus(); inp.select(); }, 60);
  function doOk(){
    var val = inp.value.trim();
    if (!val){ errEl.textContent = 'Folder name cannot be empty.'; return; }
    var p = Model.getProject();
    var exists = (p.drawings || []).some(function(d){ return (d.folder || '') === val; });
    if (exists){ errEl.textContent = 'That folder already exists \u2014 choose a different name.'; return; }
    ov.remove();
    onProceed(val);
  }
  inp.addEventListener('keydown', function(e){
    if (e.key === 'Enter'){ e.preventDefault(); doOk(); }
    if (e.key === 'Escape'){ ov.remove(); if (onCancel) onCancel(); }
  });
  document.getElementById('_dwgc-ok').onclick = doOk;
  document.getElementById('_dwgc-cancel').onclick = function(){ ov.remove(); if (onCancel) onCancel(); };
}

function handleDrawingFiles(files) {
  Array.from(files).forEach(function(f) {
    if (f.type === 'application/pdf') _handlePDFUpload(f);
    else if (f.type.startsWith('image/')) _handleImageUpload(f);
  });
}

// S81 Option 3: folder-scoped drop/pick — matches V1 handleDrawingFilesIntoFolder.
// Files dropped on a folder's "+ Drop plans here" reserve card arrive here.
function handleDrawingFilesIntoFolder(files, folder) {
  if (!folder) { handleDrawingFiles(files); return; }
  Array.from(files).forEach(function(f) {
    if (f.type === 'application/pdf') _handlePDFUpload(f, folder);
    else if (f.type.startsWith('image/')) _handleImageUpload(f, folder);
  });
}

// Open the native file picker scoped to a specific folder (click on reserve card).
function uploadToFolder(folder) {
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*,.pdf';
  inp.multiple = true;
  inp.onchange = function() {
    if (inp.files && inp.files.length) handleDrawingFilesIntoFolder(inp.files, folder);
  };
  inp.click();
}

function _handleImageUpload(f, folder) {
  _showDwgLoading('Processing ' + f.name + '...');
  var reader = new FileReader();
  reader.onload = function(e) {
    var baseName = f.name.replace(/\.[^.]+$/, '');
    var dataUrl = e.target.result;
    var p = Model.getProject();
    var targetFolder = folder || '';
    // S83: V1 conflict logic for single-image uploads.
    // Skip when folder explicitly passed (drag-on-folder bypasses the modal).
    var conflicts = (typeof folder === 'string' && folder)
      ? []
      : _dwgConflictsInFolder([baseName], targetFolder, p);

    function _proceed(chosenFolder){
      _genThumb(dataUrl, function(thumb) {
        // After conflict resolution we save with the ORIGINAL baseName under chosenFolder
        // (the new folder gives the file a unique scope; no (2) suffix needed).
        var nameToUse = chosenFolder === targetFolder
          ? _getUniqueName(baseName)   // same folder, fall back to suffix
          : baseName;                  // new folder, raw name OK
        var newDwg = {
          id: 'dwg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: nameToUse,
          dataUrl: null,
          thumb: thumb,
          width: 0, height: 0,
          isOriginal: true, folder: chosenFolder,
          r2Key: '', r2Status: '', r2Url: ''
        };
        Model.addDrawing(newDwg);
        fetch(dataUrl).then(function(r){ return r.blob(); }).then(function(blob){
          IDB.put('drawingBlobs', { id: newDwg.id, dataBlob: blob }).catch(function(err){
            console.warn('[Drawings] IDB blob save error:', err);
          });
          var pid = new URLSearchParams(window.location.search).get('project');
          if (pid){
            R2.uploadDrawing(pid, newDwg, blob).then(function(){ Model.saveNow(); });
          }
        });
        _hideDwgLoading();
        initDrawings.render();
        toast('Drawing added: ' + newDwg.name);
      });
    }

    if (conflicts.length > 0){
      _hideDwgLoading();
      _showDrawingConflictModal(
        conflicts,
        _suggestFolderName(baseName, p),
        function(newFolder){ _proceed(newFolder); },
        function(){ _hideDwgLoading(); }
      );
      return;
    }
    _proceed(targetFolder);
  };
  reader.readAsDataURL(f);
}

function _handlePDFUpload(file, folderOverride) {
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
      _showDwgLoading('Parsing PDF structure...');
      pdfjsLib.getDocument({ data: ta }).promise.then(function(pdf) {
        clearTimeout(pdfTimeout);
        var bn = file.name.replace(/\.pdf$/i, '');
        var total = pdf.numPages;
        // S81: caller-supplied folder wins. Otherwise default = filename stem (V1 behavior).
        var folderHint = (typeof folderOverride === 'string' && folderOverride)
          ? folderOverride
          : bn;

        // S83: V1 conflict logic — if any drawings already live under this folder,
        // pop the conflict modal so the inspector reviews + accepts a new folder name
        // (instead of silently auto-renaming with (2), (3) suffixes).
        // Only triggers when caller did NOT pass an explicit folderOverride —
        // drag-on-folder uploads bypass the modal (folder choice is already explicit).
        var p = Model.getProject();
        var existingInFolder = (p.drawings || []).filter(function(d){ return (d.folder || '') === folderHint; });
        var skipConflictCheck = (typeof folderOverride === 'string' && folderOverride);

        function _proceed(targetFolder){
          // Phase 5: persist source PDF buffer for tiled renderer
          var pdfBufKey = 'pdfbuf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
          IDB.put('pdfBufs', { id: pdfBufKey, buf: pdfBufCopy }).catch(function(err){
            console.warn('[Drawings] pdfBufs save failed:', err);
          });
          // S83b3: R2 upload runs in parallel; patches pdfBufR2Url after the fact.
          var pid = new URLSearchParams(window.location.search).get('project');
          if (pid && typeof R2 !== 'undefined' && R2.uploadPdfBuf){
            R2.uploadPdfBuf(pid, pdfBufKey, pdfBufCopy.slice(0)).then(function(r){
              if (r && r.r2Url){
                console.log('[Drawings] PDF buffer uploaded to R2 (background):', r.r2Url);
                _pdfBufR2UrlCache[pdfBufKey] = r.r2Url; // S83b6: future pages stamp from here
                try {
                  // S83b6: keep sweeping until all drawings with this pdfBufKey have the URL.
                  // Race-safe: pages still rendering will read from _pdfBufR2UrlCache at creation.
                  function sweep(){
                    var proj2 = Model.getProject();
                    var dwgs2 = (proj2 && proj2.drawings) || [];
                    var patched = 0;
                    dwgs2.forEach(function(d){
                      if (d.pdfBufKey === pdfBufKey && !d.pdfBufR2Url){
                        d.pdfBufR2Url = r.r2Url; patched++;
                      }
                    });
                    if (patched && Model.saveNow){
                      console.log('[Drawings] Patched pdfBufR2Url onto ' + patched + ' drawings');
                      Model.saveNow();
                    }
                  }
                  sweep();
                  // Re-sweep at 5s, 15s, 30s in case more pages finish rendering after upload completed
                  setTimeout(sweep, 5000);
                  setTimeout(sweep, 15000);
                  setTimeout(sweep, 30000);
                } catch(patchErr){ console.warn('[Drawings] patch failed:', patchErr); }
                // S86: Fire server-side tile render job. ONE job per PDF
                // upload — all page-drawings sharing pdfBufKey share the
                // resulting manifest. Fire-and-forget; polling handles done.
                try {
                  var bucketKey = _tilePdfBucketKey(pid, pdfBufKey);
                  _fireTileRender(pid, pdfBufKey, bucketKey);
                  _startTilePolling(pid, pdfBufKey, Date.now());
                } catch(tileErr){
                  console.warn('[Tiles] Fire/poll setup failed:', tileErr);
                }
              }
            }).catch(function(err){
              console.warn('[Drawings] PDF buffer R2 upload failed:', err && err.message);
              // S86: R2 upload died — mark all matching drawings as failed
              // so the retry badge appears (give _runPdfPages 30s to add them)
              setTimeout(function(){ _markTileStatus(pdfBufKey, 'failed'); }, 30000);
            });
          }
          _showDwgLoading('Processing PDF: 0/' + total + '\u2026');
          _runPdfPages(pdf, bn, targetFolder, total, pdfBufCopy, pdfBufKey, '');
        }

        if (!skipConflictCheck && existingInFolder.length > 0){
          _hideDwgLoading();
          var conflictNames = existingInFolder.map(function(d){ return d.name; });
          _showDrawingConflictModal(
            conflictNames,
            _suggestFolderName(folderHint, p),
            function(chosenFolder){ _proceed(chosenFolder); },
            function(){ _hideDwgLoading(); }
          );
          return;
        }
        _proceed(folderHint);
      }).catch(function(err) {
        clearTimeout(pdfTimeout);
        _hideDwgLoading();
        toast('PDF error: ' + err.message);
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

// S83b6: Map from pdfBufKey → resolved R2 URL once multipart upload finishes.
// Used by _runPdfPages so pages created AFTER the upload completes get the URL
// stamped at creation time (no patch needed). Pages created BEFORE upload
// completes still benefit from the post-hoc patch sweep below.
var _pdfBufR2UrlCache = {};

// ── SACRED CODE: recursive go(pg) pattern — DO NOT REWRITE ──
function _runPdfPages(pdf, bn, folder, total, arrayBuf, pdfBufKey, pdfBufR2Url) {
  var done = 0;
  function go(pg) {
    pdf.getPage(pg).then(function(page) {
      var pv = page.view;
      var pw = pv[2], ph = pv[3];
      // S83b12: 6144px cap. 4096 was too blurry for engineering drawings;
      // 8192 risks iPhone memory ceiling. 6144 gives 100 MB decoded per page
      // (~300 MB headroom on iPhone's ~400 MB budget), text is readable at
      // 1.5x zoom. One page in memory at a time. Final interim-answer until
      // server-side tile-pyramid rendering is implemented (see handoff §Future).
      var hiScale = Math.min(4.0, 6144 / pw, 6144 / ph);
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
            // S83b6: read cached R2 URL — if multipart finished before this page, use it now
            var resolvedR2Url = pdfBufR2Url || _pdfBufR2UrlCache[pdfBufKey] || '';
            // S86: tile pyramid metadata (Hub mode only — standalone has no Function)
            var _pidForTile = new URLSearchParams(window.location.search).get('project');
            var newDwg = {
              id: 'dwg_' + Date.now() + '_pg' + pg + '_' + Math.random().toString(36).substr(2, 4),
              name: pageName, dataUrl: null, thumb: thumbDu,
              width: hcW, height: hcH,
              // S83b11: MATCH V1. v2 was setting pdfTiled:true which routed the
              // drawing through the tiled renderer at open time — slow, tile-
              // flicker, iPad crashes. v1 renders the whole page as ONE JPEG at
              // upload time, stores in drawingBlobs IDB, opens as a single <img>
              // in 100ms. No tile reassembly at open. This is why v1 was fast.
              // The tiled renderer stays available for truly-huge PDFs if
              // needed in future, but not the default upload path.
              pdfTiled: false, pdfPage: pg, pdfBufKey: pdfBufKey,
              pdfBufR2Url: resolvedR2Url,
              // S86: server-side tile pyramid (rendered by Azure Function)
              tileManifestUrl: _pidForTile ? _tileManifestUrl(_pidForTile, pdfBufKey) : '',
              tileServer: _pidForTile ? R2.WORKER_URL : '',
              tileStatus: _pidForTile ? 'processing' : 'none',
              tileProcessStartedAt: _pidForTile ? Date.now() : 0,
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
            _showDwgLoading('Page ' + done + ' of ' + total + ' ready \u2014 continuing...');
            // S83b4: do NOT re-render the gallery on every page — that re-tiles
            // every thumbnail image on the main thread and locks the UI.
            // Only render once at the end. Progress text alone is enough feedback.
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
// S81 Option 3: folder-scoped versions for per-folder reserve cards
window._handleDrawingFilesIntoFolder = handleDrawingFilesIntoFolder;
window._uploadToFolder = uploadToFolder;

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
