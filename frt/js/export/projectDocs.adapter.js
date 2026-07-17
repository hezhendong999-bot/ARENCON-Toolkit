/**
 * ARENCON FRT v2 — Export Project Docs (FRT adapter)
 * ══════════════════════════════════════════════════
 *
 * Turns the FRT model into the normalized config the shared engine
 * (/lib/export/projectDocs.js) consumes, then hands off. The adapter owns:
 *   • enumerating photos exactly the way the gallery does (site pool + defic/obs
 *     effective photos),
 *   • the gallery date-chain (_dayKey — replicated VERBATIM below, including the
 *     S160 local-midnight parse fix),
 *   • identity de-dupe (one physical photo shown in two places → zipped once),
 *   • photo-src resolution through the SAME path the gallery uses (Worker-proxied
 *     R2 URL via _r2h, or dataUrl) — NEVER a hand-built R2 URL.
 *
 * Read-only: no save, no R2 writes, no live-state mutation.
 */

import { Model } from '../data/model.js';
import { toast } from '../shared/toast.js';
import { showDialog } from '../shared/dialogs.js';
import { buildAndDownload } from '../../../lib/export/projectDocs.js';

var TOOL_CODE = 'FRT';
var TOOL_NAME = 'Field Review Tool';

// ── Worker-proxy helper: rewrite the raw R2 worker origin to files.arencon.app.
// Mirrors _r2h in ui/photos.js. GET is unauthenticated via the Worker.
function _r2h(u) {
  if (!u || typeof u !== 'string') return u;
  if (u.indexOf('arencon-r2-worker.hezhendong999.workers.dev') === -1) return u;
  return u.replace('arencon-r2-worker.hezhendong999.workers.dev', 'files.arencon.app');
}

// ── Gallery date-chain. REPLICATED VERBATIM from ui/photos.js _dayKey (the S160
// local-midnight fix is load-bearing: without it, plain YYYY-MM-DD dates parse as
// UTC and EDT tablets mislabel a photo one day early). Returns {key,label}.
function _dayKey(ph, parentDefic) {
  var d = ph.addedDate || ph.date;
  if (!d && parentDefic) d = parentDefic.notedDate || parentDefic.date;
  if (!d && ph.id) {
    var m = String(ph.id).match(/[a-z]+_(\d{13})/);
    if (m) d = new Date(parseInt(m[1])).toISOString().split('T')[0];
  }
  if (!d) return { key: 'zzzz-no-date', label: 'No date' };
  try {
    var dt;
    var dateOnly = (typeof d === 'string') && d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      dt = new Date(parseInt(dateOnly[1], 10), parseInt(dateOnly[2], 10) - 1, parseInt(dateOnly[3], 10));
    } else {
      dt = new Date(d);
    }
    if (isNaN(dt.getTime())) return { key: 'zzzz-no-date', label: 'No date' };
    var yy = dt.getFullYear();
    var mm = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    var key = yy + '-' + mm + '-' + dd;
    var label = dt.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return { key: key, label: label };
  } catch (e) { return { key: 'zzzz-no-date', label: 'No date' }; }
}

// ── Full-res source for a pool/site photo (Worker-proxied R2 or dataUrl).
// Mirrors the gallery's _downloadPhoto resolution — never constructs an R2 URL.
function _origSrc(ph) {
  return _r2h(ph.r2Url || ph.dataUrl || '');
}

// ── Marked-variant source for an (obs, photo) pair, if a distinct marked file
// exists. Uses the model's markup state (markedR2Key), same as the gallery.
function _markedSrc(defic, obsIdx, ph) {
  try {
    var mk = Model.getObsPhotoMarkup ? Model.getObsPhotoMarkup(defic, obsIdx, ph.id) : null;
    if (mk && mk.markedR2Key) {
      var s = _r2h(mk.markedR2Key);
      if (s && s !== _origSrc(ph)) return s;
    }
  } catch (e) {}
  return '';
}

// ── Client-name abbreviation (~8 chars) for the folder name. "Iron Mountain
// Canada Corp" → "IronMtn". Falls back to alnum head.
function _clientShort(proj) {
  var raw = (proj && proj.info && proj.info.client) || '';
  if (!raw) return 'Client';
  var words = String(raw).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  var abbr = '';
  if (words.length >= 2) { abbr = words[0].slice(0, 4); for (var i = 1; i < words.length && abbr.length < 8; i++) abbr += words[i].slice(0, 2); }
  else abbr = raw.replace(/[^A-Za-z0-9]/g, '');
  return (abbr.slice(0, 8)) || 'Client';
}

function _projNum(proj) {
  var raw = (proj && proj.info && proj.info.projectNumber) || '';
  return String(raw || '').trim() || 'Project';
}

function _instance(proj) {
  try {
    if (typeof SyncEngine !== 'undefined' && SyncEngine.instanceNumber) return SyncEngine.instanceNumber;
  } catch (e) {}
  return (proj && proj.currentFrtInstance) || 1;
}

// ── Enumerate every live photo the gallery would show, de-duped by identity.
// Returns the normalized photo array the engine consumes.
function _collectPhotos(proj) {
  var out = [];
  var seen = {};   // identityKey → true (collapse one physical photo shown twice)

  function push(rec) {
    var idk = null;
    try { idk = Model._photoIdentityKey ? Model._photoIdentityKey(rec._ph) : null; } catch (e) {}
    if (idk) { if (seen[idk]) return; seen[idk] = true; }
    delete rec._ph;
    out.push(rec);
  }

  // 1) Site pool photos (proj.photos).
  var site = (proj.photos || []).filter(function(p) { return p && !p.deleted; });
  site.forEach(function(p, i) {
    var dk = _dayKey(p, null);
    push({
      _ph: p,
      bucketLabel: dk.label, bucketKey: dk.key,
      itemRef: 'Site ' + (i + 1),
      sectionKey: 'site_' + (p.id || i),
      originalSrc: _origSrc(p),
      markedSrc: ''
    });
  });

  // 2) Deficiency / observation photos (effective photos per obs — what the
  //    gallery shows). ItemRef mirrors the gallery badge (num + obs letter).
  var contractors = proj.contractors || [];
  var allDefics = [];
  contractors.forEach(function(c) { (c.deficiencies || []).forEach(function(d) { if (d && !d.deleted) allDefics.push({ defic: d, site: false }); }); });
  // Site-records bucket deficiencies live under generalDeficiencies — labeled "Site".
  (proj.generalDeficiencies || []).forEach(function(d) { if (d && !d.deleted) allDefics.push({ defic: d, site: true }); });

  allDefics.forEach(function(entry) {
    var defic = entry.defic;
    var prefix = entry.site ? 'Site ' : 'Obs ';
    var obsList = defic.observations || [];
    var multiObs = obsList.length > 1;
    obsList.forEach(function(o, oi) {
      var effective = Model.getEffectivePhotos ? (Model.getEffectivePhotos(defic, oi) || []) : (o.photos || []);
      var obsLetter = multiObs ? String.fromCharCode(65 + oi) : '';
      var ref = prefix + (defic.num != null ? defic.num : 'x') + obsLetter;
      effective.forEach(function(ph, phi) {
        if (!ph || ph.deleted) return;
        var dk = _dayKey(ph, defic);
        push({
          _ph: ph,
          bucketLabel: dk.label, bucketKey: dk.key,
          itemRef: ref,
          sectionKey: 'defic_' + defic.id + '_' + oi + '_' + phi,
          originalSrc: _origSrc(ph),
          markedSrc: _markedSrc(defic, oi, ph)
        });
      });
    });
  });

  return out;
}

// ── Build the full re-loadable JSON (binary stripped from JSON; photos are in
// the loose folder). Reuses the same strip the Download-JSON path uses via a
// deep clone + field strip, then wraps in the _arenconExport envelope.
function _buildJsonState(proj) {
  var clone = JSON.parse(JSON.stringify(proj));
  function strip(list) { (list || []).forEach(function(p) { delete p.dataUrl; delete p.dataBlob; }); }
  strip(clone.photos);
  (clone.drawings || []).forEach(function(d) { delete d.dataUrl; delete d.dataBlob; delete d.thumbDataUrl; });
  (clone.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(function(d) {
      strip(d.photos);
      (d.observations || []).forEach(function(o) { strip(o.photos); });
    });
  });
  (clone.generalDeficiencies || []).forEach(function(d) {
    strip(d.photos);
    (d.observations || []).forEach(function(o) { strip(o.photos); });
  });
  return {
    _arenconExport: {
      tool: 'frt', toolCode: TOOL_CODE, version: (typeof window !== 'undefined' && window.FRT_BUILD) || '',
      exportedAt: new Date().toISOString(), project: _projNum(proj), instance: _instance(proj)
    },
    data: clone
  };
}

function _dateISO() { try { return new Date().toISOString().substring(0, 10); } catch (e) { return ''; } }

export var initProjectDocsExport = {
  /** Confirm, then build + download the ZIP. */
  run: function() {
    var proj = Model.getProject();
    if (!proj) { toast('No project to export'); return; }

    showDialog({
      title: 'Export Project Docs',
      message: 'Export this report as a ZIP (photos + JSON + README)? Nothing in your current work is changed.',
      buttons: [
        { label: 'Cancel', outline: true },
        { label: 'Export', color: '#9C2742', action: function() { _go(proj); } }
      ]
    });
  }
};

function _go(proj) {
  toast('Building export\u2026');
  var cfg = {
    toolCode: TOOL_CODE,
    toolName: TOOL_NAME,
    version: (typeof window !== 'undefined' && window.FRT_BUILD) || '',
    projectNum: _projNum(proj),
    projectName: (proj.info && proj.info.projectName) || '',
    clientName: (proj.info && proj.info.client) || '',
    instance: _instance(proj),
    folderName: _projNum(proj) + ' ' + _clientShort(proj) + ' ' + TOOL_CODE + ' ' + _instance(proj) + ' ' + _dateISO(),
    itemRefHelp: 'where it lives in the report, e.g. Obs-12A (observation), Site-3 (site record).',
    jsonState: _buildJsonState(proj),
    photos: _collectPhotos(proj)
  };

  buildAndDownload(cfg).then(function(out) {
    toast(out.skipped
      ? ('Exported \u2014 ' + out.added + ' photos (' + out.skipped + ' unavailable)')
      : ('Exported \u2014 ' + out.added + ' photos + JSON'));
  }).catch(function(e) {
    console.error('[export] failed', e);
    toast('Export failed: ' + ((e && e.message) || e));
  });
}
