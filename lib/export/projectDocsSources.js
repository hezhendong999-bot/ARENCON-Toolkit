/**
 * ARENCON Toolkit — Export Project Docs: per-tool SOURCES (shared)
 * ═══════════════════════════════════════════════════════════════════════════
 * lib/export/projectDocsSources.js · v1.0.0
 *
 * WHAT THIS IS, AND WHY IT EXISTS
 * ───────────────────────────────
 * The rule that decides what a photo is CALLED and which date folder it lands
 * in is the thing that makes an exported bundle citable. Until now that rule
 * lived in two places — inside FRT's adapter (written against FRT's live
 * in-memory model) and inside Diesel's own inline exporter. Neither could be
 * reached from the Hub, which reads plain cloud records rather than running a
 * tool.
 *
 * This module is that rule, extracted MODEL-FREE: every function here takes a
 * plain stored record (exactly what lives in Supabase `tool_data.data`) and
 * returns the normalized photo list the shared engine consumes. No Model, no
 * DOM, no live tool state, no network beyond what the engine itself fetches.
 *
 * That makes it usable from BOTH sides:
 *   • the Hub, for the whole-project bundle (today), and
 *   • each tool's own adapter, once whoever owns that tool's code flips it
 *     over (later — not this session, not this lane).
 *
 * It is deliberately ADDITIVE. Nothing existing was edited to introduce it, so
 * for now FRT's adapter and this module both exist. That duplication is
 * temporary and is meant to END by FRT's adapter becoming a consumer of this
 * file — not by this file drifting into a third copy. If you are reading this
 * because you are about to change a naming rule: change it HERE, then flip the
 * remaining caller. Do not fork it.
 *
 * CANON REPLICATED VERBATIM (do not "improve" without checking the source):
 *   • FRT site-vs-observation split = `contractorId == null`, via the same
 *     unified walk the gallery uses (model.js getAllDeficiencies). NEVER by
 *     which array a finding lives in.
 *   • FRT effective photos per observation (model.js getEffectivePhotos),
 *     including the legacy obs.photos fallback and the photoSelection filter.
 *   • FRT gallery date chain (_dayKey) including the S160 local-midnight parse
 *     — without it an EDT tablet mislabels a photo one day early.
 *   • FRT photo identity de-dupe (model.js _photoIdentityKey) so one physical
 *     photo shown in two places is zipped once.
 *   • Round/status tags read from the OBSERVATION's own provenance, and shown
 *     ONLY when the finding actually carries notedOnInstance. NEVER fabricate
 *     a round.
 *   • Diesel vocabulary: D#/G#/Checklist/Placard/Pump/Flow. The word "Obs"
 *     appears nowhere in Diesel or Electric output. Diesel is a single
 *     commissioning event — it has no round/close lifecycle, so no round tag.
 *
 * TOOL COVERAGE (measured from live code at HEAD, not assumed):
 *   frt      photos ✓   full FRT rules
 *   diesel   photos ✓   Diesel vocabulary
 *   electric photos ✓   SAME output scheme as Diesel (Mark's ruling) — Electric
 *                       has no gallery machinery of its own to reuse, so the
 *                       walk reads its stored record directly and emits
 *                       Diesel-shaped names, giving Electric a correct export
 *                       before its own photo port lands.
 *   dd       photos ✓   site photos + item photos
 *   ist      none        record-only folder — IST stores no photos at all
 *   obc      none        record-only folder — OBC stores no photos at all
 */

import { expSanitize, buildZip } from './projectDocs.js';

export const PROJECT_DOCS_SOURCES_VERSION = '1.0.0';

/* ══════════════════════════════════════════════════════════════════════════
   Shared helpers
   ══════════════════════════════════════════════════════════════════════════ */

/** Worker-proxy rewrite. GET is unauthenticated via the Worker. Never build an R2 URL by hand. */
function r2h(u) {
  if (!u || typeof u !== 'string') return u;
  if (u.indexOf('arencon-r2-worker.hezhendong999.workers.dev') === -1) return u;
  return u.replace('arencon-r2-worker.hezhendong999.workers.dev', 'files.arencon.app');
}

function srcOf(ph) {
  if (!ph) return '';
  return r2h(ph.r2Url || ph.dataUrl || '');
}

/** Shared date-bucket formatter. Same label shape in every tool. */
function bucketFromRaw(raw) {
  if (!raw) return { key: 'zzzz-no-date', label: 'No date' };
  try {
    var dt;
    var only = (typeof raw === 'string') && String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (only) {
      // S160: parse as LOCAL midnight. Without this, plain YYYY-MM-DD parses as
      // UTC and an EDT tablet buckets the photo one day early.
      dt = new Date(parseInt(only[1], 10), parseInt(only[2], 10) - 1, parseInt(only[3], 10));
    } else {
      dt = new Date(raw);
    }
    if (isNaN(dt.getTime())) return { key: 'zzzz-no-date', label: 'No date' };
    var yy = dt.getFullYear();
    var mm = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    return {
      key: yy + '-' + mm + '-' + dd,
      label: dt.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    };
  } catch (e) { return { key: 'zzzz-no-date', label: 'No date' }; }
}

/** FRT gallery date chain — photo date → parent finding date → id timestamp → No date. */
function frtDayKey(ph, parentDefic) {
  var d = ph.addedDate || ph.date;
  if (!d && parentDefic) d = parentDefic.notedDate || parentDefic.date;
  if (!d && ph.id) {
    var m = String(ph.id).match(/[a-z]+_(\d{13})/);
    if (m) d = new Date(parseInt(m[1])).toISOString().split('T')[0];
  }
  return bucketFromRaw(d);
}

/** model.js _photoIdentityKey — verbatim. */
function photoIdentityKey(photo) {
  if (!photo) return null;
  if (photo._idSeed) return 'seed:' + photo._idSeed;
  if (photo.r2Key) return 'r2:' + photo.r2Key;
  if (photo.sourceR2Key) return 'r2:' + photo.sourceR2Key;
  var bytes = photo.dataUrl || photo.thumb || null;
  if (bytes && bytes.length > 64) return 'b:' + bytes.length + ':' + bytes.slice(0, 48) + bytes.slice(-16);
  if (bytes) return 'b:' + bytes;
  return null;
}

/** model.js getAllDeficiencies — verbatim rule, over a plain record. */
function frtAllDeficiencies(proj) {
  var all = [];
  (proj.contractors || []).forEach(function (c) {
    (c.deficiencies || []).forEach(function (d) {
      all.push({ defic: d, contractorId: c.id });
    });
  });
  (proj.generalDeficiencies || []).forEach(function (d) {
    all.push({ defic: d, contractorId: null });
  });
  all.sort(function (a, b) { return (a.defic.num || 0) - (b.defic.num || 0); });
  return all;
}

/** model.js getEffectivePhotos — verbatim. */
function frtEffectivePhotos(defic, obsIdx) {
  if (!defic) return [];
  var obs = (defic.observations || [])[obsIdx];
  if (!obs) return [];
  var pool = (defic.photos || []).filter(function (p) { return p && !p.deleted; });
  if (!pool.length && obs.photos && obs.photos.length) return obs.photos.slice();
  if (obs.photoSelection === null || obs.photoSelection === undefined) return pool;
  if (!Array.isArray(obs.photoSelection)) return pool;
  var idSet = {};
  obs.photoSelection.forEach(function (id) { idSet[id] = true; });
  return pool.filter(function (p) { return idSet[p.id]; });
}

function frtMarkedSrc(defic, obsIdx, ph, origin) {
  try {
    var obs = (defic.observations || [])[obsIdx];
    var mk = (obs && obs.photoMarkups) ? obs.photoMarkups[ph.id] : null;
    if (mk && mk.markedR2Key) {
      var s = r2h(mk.markedR2Key);
      if (s && s !== origin) return s;
    }
  } catch (e) {}
  return '';
}

/**
 * FRT round/status tag. Shown ONLY when the finding actually carries a raised
 * round — a legacy or site record with no round lifecycle is never stamped
 * with a made-up one.
 */
function frtNameParts(baseRef, obs, defic) {
  var raised = (obs && obs.notedOnInstance) || (defic && defic.notedOnInstance) || null;
  var isClosed = obs ? !!obs.addressed : !!(defic && defic.closedOnInstance);
  var closedAt = obs ? (obs.addressed ? obs.addressedOnInstance : null)
                     : (defic ? defic.closedOnInstance : null);
  var name = baseRef;
  if (raised) {
    var round = '#' + raised;
    if (isClosed && closedAt && closedAt !== raised) round += '\u2192' + closedAt;
    name += ' - FRT ' + round;
  }
  if (isClosed) name = 'Closed ' + name;
  return name;
}

/* ══════════════════════════════════════════════════════════════════════════
   Per-tool photo sources. Each takes the stored record and returns
   [{ bucketKey, bucketLabel, itemRef, sectionKey, originalSrc, markedSrc }]
   ══════════════════════════════════════════════════════════════════════════ */

function frtPhotos(data) {
  var out = [];
  var seen = {};
  function push(ph, rec) {
    var idk = photoIdentityKey(ph);
    if (idk) { if (seen[idk]) return; seen[idk] = true; }
    out.push(rec);
  }

  (data.photos || []).filter(function (p) { return p && !p.deleted; })
    .forEach(function (p, i) {
      var dk = frtDayKey(p, null);
      push(p, {
        bucketKey: dk.key, bucketLabel: dk.label,
        itemRef: 'Site ' + (i + 1),
        sectionKey: 'site_' + (p.id || i),
        originalSrc: srcOf(p), markedSrc: ''
      });
    });

  frtAllDeficiencies(data).forEach(function (entry) {
    var defic = entry.defic;
    if (!defic || defic.deleted) return;
    var prefix = (entry.contractorId == null) ? 'Site ' : 'Obs ';
    (defic.observations || []).forEach(function (o, oi) {
      var effective = frtEffectivePhotos(defic, oi);
      var obsLetter = String.fromCharCode(65 + oi);
      var baseRef = prefix + (defic.num != null ? defic.num : 'x') + obsLetter;
      var ref = frtNameParts(baseRef, o, defic);
      effective.forEach(function (ph, phi) {
        if (!ph || ph.deleted) return;
        var dk = frtDayKey(ph, defic);
        var origin = srcOf(ph);
        push(ph, {
          bucketKey: dk.key, bucketLabel: dk.label,
          itemRef: ref,
          sectionKey: 'defic_' + defic.id + '_' + oi + '_' + phi,
          originalSrc: origin,
          markedSrc: frtMarkedSrc(defic, oi, ph, origin)
        });
      });
    });
  });

  return out;
}

/**
 * Commissioning walk — Diesel AND Electric.
 *
 * Mark's ruling: Electric must match Diesel. Electric has no photo-gallery
 * machinery of its own to share, so the two tools share this walk instead and
 * emit identical output shapes. Every collection is probed defensively: a key
 * a given tool does not have is simply absent, never an error.
 *
 * Badge wins where the record carries one (real records already carry D1, G1,
 * Checklist 1.3 …). The fallbacks below use each tool's own vocabulary.
 */
function commissioningPhotos(data, toolCode) {
  var out = [];
  var seen = {};
  function push(ph, ref, sectionKey) {
    if (!ph || ph.deleted) return;
    var idk = photoIdentityKey(ph);
    if (idk) { if (seen[idk]) return; seen[idk] = true; }
    var dk = bucketFromRaw(ph.date);
    var origin = srcOf(ph);
    if (!origin) return;
    out.push({
      bucketKey: dk.key, bucketLabel: dk.label,
      itemRef: (ph.badge || ref || 'Photo'),
      sectionKey: sectionKey,
      originalSrc: origin,
      markedSrc: (ph.markedR2Url || ph.markedR2Key) ? r2h(ph.markedR2Url || ph.markedR2Key) : ''
    });
  }

  // Flow test charts (3-point and PLD).
  (data.flowTestPhotos || []).forEach(function (p, i) { push(p, 'Flow', 'flow_' + i); });
  (data.flowTestPhotosPld || []).forEach(function (p, i) { push(p, 'Flow-PLD', 'flowpld_' + i); });

  // Gauge rows.
  (data.stdData || []).forEach(function (row, ri) {
    ((row && row.photos) || []).forEach(function (p, pi) { push(p, 'Gauge', 'gauge_std_' + ri + '_' + pi); });
  });
  (data.pldData || []).forEach(function (row, ri) {
    ((row && row.photos) || []).forEach(function (p, pi) { push(p, 'Gauge-PLD', 'gauge_pld_' + ri + '_' + pi); });
  });

  // Checklist items.
  var cl = data.clState || {};
  Object.keys(cl).forEach(function (id) {
    var st = cl[id];
    if (!st || !st.photos) return;
    st.photos.forEach(function (p, pi) { push(p, 'Checklist ' + id, 'cl_' + id + '_' + pi); });
  });

  // Contractor deficiencies + their responses.
  var defs = data.deficiencies || {};
  Object.keys(defs).forEach(function (ctr) {
    (defs[ctr] || []).forEach(function (d, di) {
      (d.photos || []).forEach(function (p, pi) { push(p, 'D' + (di + 1), 'def_' + ctr + '_' + di + '_' + pi); });
      (d.responses || []).forEach(function (r, ri) {
        (r.photos || []).forEach(function (p, pi) {
          push(p, 'D' + (di + 1) + 'R', 'resp_' + ctr + '_' + di + '_' + ri + '_' + pi);
        });
      });
    });
  });

  // General deficiencies.
  (data.generalDeficiencies || []).forEach(function (d, di) {
    (d.photos || []).forEach(function (p, pi) { push(p, 'G' + (di + 1), 'gdef_' + di + '_' + pi); });
  });

  // Site records — placards, pump, nameplates.
  (data.recordPhotos || []).forEach(function (p, i) { push(p, 'Record', 'rec_' + i); });
  (data.placardPhotos || []).forEach(function (p, i) { push(p, 'Placard', 'plc_' + i); });
  (data.pumpPhotos || []).forEach(function (p, i) { push(p, 'Pump', 'pump_' + i); });
  (data.sitePhotos || []).forEach(function (p, i) { push(p, 'Site', 'site_' + i); });

  return out;
}

/** DD Checklist — site photos plus per-item photos. */
function ddPhotos(data) {
  var out = [];
  var seen = {};
  function push(ph, ref, sectionKey) {
    if (!ph || ph.deleted) return;
    var idk = photoIdentityKey(ph);
    if (idk) { if (seen[idk]) return; seen[idk] = true; }
    var dk = bucketFromRaw(ph.date || ph.addedDate);
    var origin = srcOf(ph);
    if (!origin) return;
    out.push({
      bucketKey: dk.key, bucketLabel: dk.label,
      itemRef: (ph.badge || ref || 'Photo'),
      sectionKey: sectionKey,
      originalSrc: origin, markedSrc: ''
    });
  }

  (data.sitePhotos || []).forEach(function (p, i) { push(p, 'Site', 'site_' + i); });
  var items = data.itemState || data.items || {};
  Object.keys(items).forEach(function (id) {
    var st = items[id];
    if (!st || !st.photos) return;
    st.photos.forEach(function (p, pi) { push(p, 'Item ' + id, 'item_' + id + '_' + pi); });
  });
  (data.deficiencies || []).forEach(function (d, di) {
    (d.photos || []).forEach(function (p, pi) { push(p, 'D' + (di + 1), 'dd_def_' + di + '_' + pi); });
  });

  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   Tool registry
   ══════════════════════════════════════════════════════════════════════════ */

export const TOOL_SOURCES = {
  frt:      { code: 'FRT', name: 'Field Review Tool',                hasPhotos: true,  photos: frtPhotos },
  diesel:   { code: 'DFP', name: 'Diesel Fire Pump Commissioning',   hasPhotos: true,  photos: function (d) { return commissioningPhotos(d, 'DFP'); } },
  electric: { code: 'EFP', name: 'Electric Fire Pump Acceptance',    hasPhotos: true,  photos: function (d) { return commissioningPhotos(d, 'EFP'); } },
  dd:       { code: 'DD',  name: 'Due Diligence Checklist',          hasPhotos: true,  photos: ddPhotos },
  ist:      { code: 'IST', name: 'Integrated Systems Testing',       hasPhotos: false, photos: function () { return []; } },
  obc:      { code: 'OBC', name: 'OBC Compliance Report',            hasPhotos: false, photos: function () { return []; } }
};

/** Photos are carried in the loose folders; the JSON keeps pointers, not bytes. */
function stripBinary(obj) {
  var clone;
  try { clone = JSON.parse(JSON.stringify(obj || {})); } catch (e) { return obj || {}; }
  (function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) { node.forEach(function (n) { walk(n, depth + 1); }); return; }
    if (node.dataUrl || node.dataBlob || node.thumbDataUrl) {
      delete node.dataUrl; delete node.dataBlob; delete node.thumbDataUrl;
    }
    Object.keys(node).forEach(function (k) { walk(node[k], depth + 1); });
  })(clone, 0);
  return clone;
}

export function clientShort(raw) {
  if (!raw) return 'Client';
  var words = String(raw).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  var abbr = '';
  if (words.length >= 2) {
    abbr = words[0].slice(0, 4);
    for (var i = 1; i < words.length && abbr.length < 8; i++) abbr += words[i].slice(0, 2);
  } else {
    abbr = String(raw).replace(/[^A-Za-z0-9]/g, '');
  }
  return abbr.slice(0, 8) || 'Client';
}

function dateISO() {
  try { return new Date().toISOString().substring(0, 10); } catch (e) { return ''; }
}

/**
 * Build the engine config for ONE stored tool record.
 * row: { tool_key, instance_number, data, label }
 * proj: the Hub project row (project_number, client, name)
 */
export function configForRecord(row, proj) {
  var key = row.tool_key;
  var src = TOOL_SOURCES[key];
  if (!src) return null;

  var data = row.data || {};
  var inst = row.instance_number || 1;
  var num = String((proj && (proj.project_number || proj.number)) || 'Project').trim() || 'Project';

  return {
    toolKey: key,
    toolCode: src.code,
    toolName: src.name,
    hasPhotos: src.hasPhotos,
    version: '',
    projectNum: num,
    projectName: (proj && (proj.name || proj.project_name)) || '',
    clientName: (proj && proj.client) || '',
    instance: inst,
    folderName: num + ' ' + src.code + '-' + inst,
    jsonFileName: expSanitize(num) + ' ' + src.code + '-' + inst + ' data.json',
    itemRefHelp: (key === 'frt')
      ? 'where it lives in the report, e.g. Obs 12A (observation), Site 3A (site record).'
      : 'where it lives in the report, e.g. D1 (deficiency), G1 (general), Checklist 1.3, Placard, Pump, Flow.',
    jsonState: {
      _arenconExport: {
        tool: key, toolCode: src.code,
        exportedAt: new Date().toISOString(),
        project: num, instance: inst,
        source: 'hub-cloud-record'
      },
      data: stripBinary(data)
    },
    photos: src.hasPhotos ? (src.photos(data) || []) : []
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Whole-project bundle (Tier 3/4)
   ══════════════════════════════════════════════════════════════════════════

   Deliberately built by calling the shared engine's own buildZip() once per
   tool and re-parenting its entries under a per-tool subfolder. That keeps
   ONE implementation of naming, image validation, JSON and README — this file
   adds nesting, and nothing else. It does NOT re-implement fetching or
   validation, because a second copy of that is exactly what we are trying to
   stop creating.
*/

function ensureJSZip() {
  if (typeof JSZip !== 'undefined') return Promise.resolve(JSZip);
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = function () { resolve(JSZip); };
    s.onerror = function () { reject(new Error('Could not load the exporter (offline?)')); };
    document.head.appendChild(s);
  });
}

function topReadme(proj, entries, stats) {
  var L = [];
  L.push('ARENCON — Whole Project Export');
  L.push('══════════════════════════════════════════════════════════');
  L.push('');
  L.push('Project #: ' + (proj.project_number || 'Project'));
  if (proj.name) L.push('Project:   ' + proj.name);
  if (proj.client) L.push('Client:    ' + proj.client);
  L.push('Exported:  ' + new Date().toLocaleString('en-CA'));
  L.push('Source:    synced cloud record (the project of record).');
  L.push('           Edits still sitting unsynced on a device are NOT included —');
  L.push('           those belong to that device\'s own single-tool export.');
  L.push('');
  L.push('CONTENTS — one folder per report');
  L.push('──────────────────────────────────────────────────────────');
  entries.forEach(function (e) {
    var line = '  ' + e.folder + '  —  ' + e.toolName + ', report ' + e.instance;
    if (!e.hasPhotos) line += '   (this tool stores no photos: record + README only)';
    else line += '   (' + e.added + ' photos' + (e.skipped ? ', ' + e.skipped + ' unavailable' : '') + ')';
    L.push(line);
  });
  L.push('');
  L.push('Each folder holds that report\'s photos in capture-date folders, the');
  L.push('full re-loadable record, and its own README explaining the filenames.');
  L.push('');
  L.push('TOTALS');
  L.push('──────────────────────────────────────────────────────────');
  L.push('  Reports:            ' + entries.length);
  L.push('  Photos included:    ' + stats.added);
  if (stats.skipped) {
    L.push('  Photos unavailable: ' + stats.skipped);
    L.push('    (could not be fetched, or the stored file failed its image check —');
    L.push('     skipped rather than written as a broken file)');
  }
  if (stats.failedTools.length) {
    L.push('');
    L.push('  REPORTS THAT FAILED TO EXPORT: ' + stats.failedTools.join(', '));
    L.push('    Nothing was changed in those reports — retry, or export that tool directly.');
  }
  L.push('');
  L.push('Export is READ-ONLY. Nothing in any report was modified.');
  L.push('');
  return L.join('\n');
}

/**
 * Build one AllTools ZIP for a project.
 *
 * rows  : tool_data rows for the project ({tool_key, instance_number, data})
 * proj  : Hub project row
 * opts  : { onProgress(done,total,label), shouldCancel() }
 *
 * Returns { blob, filename, added, skipped, entries, failedTools }.
 */
export async function buildProjectBundle(rows, proj, opts) {
  opts = opts || {};
  var JSZipCtor = await ensureJSZip();

  var usable = (rows || []).filter(function (r) { return r && TOOL_SOURCES[r.tool_key]; });
  usable.sort(function (a, b) {
    if (a.tool_key !== b.tool_key) return a.tool_key < b.tool_key ? -1 : 1;
    return (a.instance_number || 1) - (b.instance_number || 1);
  });

  var num = String((proj && proj.project_number) || 'Project').trim() || 'Project';
  var rootName = expSanitize(num + ' ' + clientShort(proj && proj.client) + ' AllTools ' + dateISO()) || 'Project Export';

  var parent = new JSZipCtor();
  var top = parent.folder(rootName);

  var stats = { added: 0, skipped: 0, failedTools: [] };
  var entries = [];
  var total = usable.length;

  for (var i = 0; i < usable.length; i++) {
    if (opts.shouldCancel && opts.shouldCancel()) break;

    var row = usable[i];
    var cfg = configForRecord(row, proj);
    if (!cfg) continue;

    var label = cfg.toolCode + '-' + cfg.instance;
    if (typeof opts.onProgress === 'function') {
      try { opts.onProgress(i, total, label); } catch (e) {}
    }

    try {
      // The engine builds this tool's complete, correctly-named bundle.
      var out = await buildZip(cfg);
      // Re-parent its entries under the per-tool subfolder. Same bytes, nested.
      var inner = await JSZipCtor.loadAsync(out.blob);
      var names = Object.keys(inner.files);
      for (var n = 0; n < names.length; n++) {
        var f = inner.files[names[n]];
        if (f.dir) continue;
        var content = await f.async('uint8array');
        top.file(names[n], content);
      }
      stats.added += out.added || 0;
      stats.skipped += out.skipped || 0;
      entries.push({
        folder: cfg.folderName, toolName: cfg.toolName, instance: cfg.instance,
        hasPhotos: cfg.hasPhotos, added: out.added || 0, skipped: out.skipped || 0
      });
    } catch (e) {
      console.error('[projectDocsSources] tool export failed', row.tool_key, e);
      stats.failedTools.push(cfg.toolCode + '-' + cfg.instance);
    }
  }

  if (typeof opts.onProgress === 'function') {
    try { opts.onProgress(total, total, 'Compressing'); } catch (e) {}
  }

  top.file('README.txt', topReadme(proj || {}, entries, stats));

  var blob = await parent.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return {
    blob: blob,
    filename: rootName + '.zip',
    added: stats.added,
    skipped: stats.skipped,
    entries: entries,
    failedTools: stats.failedTools
  };
}

/** Convenience: build + trigger the browser download. */
export async function downloadProjectBundle(rows, proj, opts) {
  var out = await buildProjectBundle(rows, proj, opts);
  var url = URL.createObjectURL(out.blob);
  var a = document.createElement('a');
  a.href = url; a.download = out.filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  return out;
}

export default {
  PROJECT_DOCS_SOURCES_VERSION,
  TOOL_SOURCES,
  configForRecord,
  buildProjectBundle,
  downloadProjectBundle,
  clientShort
};
