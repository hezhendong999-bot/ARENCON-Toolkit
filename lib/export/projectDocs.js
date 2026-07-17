/**
 * ARENCON Toolkit — Export Project Docs (shared engine)
 * ═════════════════════════════════════════════════════
 *
 * ONE implementation of the "photos + JSON + README" ZIP export, shared across
 * every tool. Lifted from Diesel's proven S371 exporter and generalized.
 * "Engine shared, personality per-tool config."
 *
 * The engine knows NOTHING tool-specific. Each tool supplies a small adapter
 * that hands this engine a normalized config (see buildZip below). The adapter
 * owns all model-reaching, all date logic, all photo-src resolution. The engine
 * only sanitizes names, lays out folders, fetches+validates photos, writes the
 * JSON + README, and returns the blob.
 *
 * Locked behaviour (differs from Diesel's inline version):
 *   • SPACES, not underscores, in every emitted name (folders, subfolders,
 *     photo filenames). Diesel collapsed whitespace to '_'; this does not.
 *   • Date bucketing is the ADAPTER's job — the engine never sees a raw date.
 *     The adapter hands each photo a bucketLabel (folder name) + bucketKey
 *     (sort only). FRT's adapter replicates the gallery date-chain exactly.
 *
 * Read-only: no save, no R2 writes, no live-state mutation.
 */

// ── Deterministic, Windows/Mac-safe name sanitize. SAME input → SAME output.
// Strips only the characters that are illegal in file/folder names on Win/Mac,
// plus control chars. Whitespace is PRESERVED (collapsed to single spaces).
export function expSanitize(s) {
  return String(s == null ? '' : s)
    .replace(/[\/\\:*?"<>|\u0000-\u001F]/g, '-')  // illegal → hyphen
    .replace(/\s+/g, ' ')                          // collapse runs of space
    .replace(/-+/g, '-')                           // collapse runs of hyphen
    .replace(/^[-.\s]+|[-.\s]+$/g, '')             // trim edge punctuation/space
    .trim();
}

// ── Lazy JSZip loader. Resolves to the JSZip constructor, or rejects if it
// can't be loaded (offline). Callers surface a clean "offline?" message.
function ensureJSZip() {
  return new Promise(function(resolve, reject) {
    if (typeof window !== 'undefined' && window.JSZip) { resolve(window.JSZip); return; }
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    sc.onload = function() {
      if (window.JSZip) resolve(window.JSZip);
      else reject(new Error('JSZip loaded but unavailable'));
    };
    sc.onerror = function() { reject(new Error('Could not load exporter (offline?)')); };
    document.head.appendChild(sc);
  });
}

// ── Minimal real-image guard: reject an R2 error body masquerading as a photo.
// Checks the leading magic bytes (JPEG / PNG / WebP / GIF). Anything else (e.g.
// an XML/JSON error page returned with a 200) is skipped, never zipped.
function isRealImageBlob(blob) {
  return new Promise(function(resolve) {
    if (!blob || blob.size < 8) { resolve(false); return; }
    var r = new FileReader();
    r.onload = function() {
      try {
        var b = new Uint8Array(r.result);
        var jpg  = b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
        var png  = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
        var gif  = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
        var webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
                   b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
        resolve(jpg || png || gif || webp);
      } catch (e) { resolve(false); }
    };
    r.onerror = function() { resolve(false); };
    r.readAsArrayBuffer(blob.slice(0, 16));
  });
}

// ── Add one image into a folder, de-duping the filename within that folder.
// src may be a data: URL or a (Worker-proxied) https URL — the adapter has
// already resolved it; the engine never builds R2 URLs itself.
function addImage(folderZip, folderPath, src, name, usedNames) {
  return new Promise(function(resolve) {
    if (!src) { resolve(false); return; }
    var base = name, n = 1;
    while (usedNames[folderPath + '/' + name]) {
      var dot = base.lastIndexOf('.');
      name = (dot > 0 ? base.slice(0, dot) : base) + ' ' + (n++) + (dot > 0 ? base.slice(dot) : '.jpg');
    }
    usedNames[folderPath + '/' + name] = 1;

    if (src.indexOf('data:') === 0) {
      try { folderZip.file(name, src.split(',')[1], { base64: true }); resolve(true); }
      catch (e) { console.warn('[export] skip', name, e && e.message); resolve(false); }
      return;
    }
    fetch(src)
      .then(function(resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.blob(); })
      .then(function(blob) {
        return isRealImageBlob(blob).then(function(ok) {
          if (!ok) throw new Error('not a valid image');
          folderZip.file(name, blob); resolve(true);
        });
      })
      .catch(function(e) { console.warn('[export] skip', name, e && e.message); resolve(false); });
  });
}

function defaultReadme(cfg, stats) {
  var L = [];
  L.push('ARENCON — ' + cfg.toolName + ' — Project Export');
  L.push('========================================================');
  L.push('');
  L.push('Project #: ' + (cfg.projectNum || 'Project'));
  if (cfg.projectName) L.push('Project:   ' + cfg.projectName);
  if (cfg.clientName)  L.push('Client:    ' + cfg.clientName);
  L.push('Tool:      ' + cfg.toolName + ' (code ' + cfg.toolCode + '), instance ' + (cfg.instance || 1));
  L.push('Exported:  ' + new Date().toLocaleString());
  L.push('Tool ver:  ' + (cfg.version || ''));
  L.push('');
  L.push('CONTENTS');
  L.push('--------');
  L.push('  ' + (cfg.projectNum || 'Project') + ' ... data.json   Full re-loadable report data (photos embedded).');
  L.push('                              Load it back via the tool\u2019s Load / Import JSON.');
  L.push('  photos/<date>/              Photos grouped by capture date.');
  L.push('  photos/No date/             Photos with no/odd capture date.');
  L.push('');
  L.push('PHOTO FILE NAMES');
  L.push('----------------');
  L.push('  <ItemRef> NN.jpg            original photo (NN = counter for that item)');
  L.push('  <ItemRef> NN-marked.jpg     same photo with on-site markup baked in');
  L.push('');
  L.push('  ItemRef carries the finding and its status/round, e.g.:');
  L.push('    Obs 12A - FRT #1            raised in report #1, still outstanding');
  L.push('    Closed Obs 12A - FRT #1\u21922    raised in #1, closed in #2');
  L.push('    Closed Obs 3 - FRT #2      raised and closed in the same report #2');
  L.push('    Site 4                     a site-record photo (not round-scoped)');
  L.push('  The report number is the round the finding was RAISED, carried forward');
  L.push('  unchanged into every later report that still shows it. So this export');
  L.push('  (the current report) contains photos from earlier rounds too \u2014 the');
  L.push('  complete current state, each labelled by the finding it belongs to.');
  L.push('');
  L.push('TOOL CODES (across the ARENCON toolkit)');
  L.push('---------------------------------------');
  L.push('  FRT Field Review \u00b7 DFP Diesel Fire Pump \u00b7 EFP Electric Fire Pump');
  L.push('  IST Integrated Systems Test \u00b7 OBC OBC Report \u00b7 DDC DD Checklist');
  L.push('');
  L.push('SUMMARY');
  L.push('-------');
  L.push('  Photos written:  ' + stats.added + (stats.skipped ? (' (+' + stats.skipped + ' unavailable, skipped)') : ''));
  L.push('  JSON included:   yes');
  L.push('');
  L.push('Note: this is a snapshot. The JSON is the authoritative re-loadable copy;');
  L.push('the loose photos are a human-browsable convenience copy of the same data.');
  return L.join('\n');
}

/**
 * Build (and return) the export ZIP blob.
 *
 * cfg = {
 *   toolCode, toolName, version, projectNum, projectName?, clientName?, instance,
 *   folderName,          // root folder + zip filename base (adapter builds it; spaces)
 *   jsonState,           // the full re-loadable object (adapter wraps it)
 *   jsonFileName?,       // optional; defaults to "<projectNum> <toolCode>-<instance> data.json"
 *   itemRefHelp?,        // optional README line explaining ItemRef
 *   photos: [ {
 *     bucketLabel,       // folder name under photos/  (e.g. "Monday, May 20, 2026" | "No date")
 *     bucketKey,         // stable sort key            (e.g. "2026-05-20" | "zzzz-no-date")
 *     itemRef,           // display ref (e.g. "Obs 12A")
 *     sectionKey,        // GLOBALLY UNIQUE — drives the per-item NN counter
 *     originalSrc,       // data: or https (resolved by adapter)
 *     markedSrc          // "" if no distinct marked variant
 *   } ]
 * }
 *
 * onProgress(done,total) optional. Returns { blob, filename, added, skipped }.
 */
export async function buildZip(cfg, onProgress) {
  var JSZipCtor = await ensureJSZip();
  var zip = new JSZipCtor();
  var root = expSanitize(cfg.folderName) || 'Export';
  var top = zip.folder(root);
  var used = {};
  var stats = { added: 0, skipped: 0 };

  var photos = (cfg.photos || []).slice();
  // Stable order: by bucketKey, then by the order the adapter supplied.
  photos.forEach(function(p, i) { p._ord = i; });
  photos.sort(function(a, b) {
    var ak = a.bucketKey || '', bk = b.bucketKey || '';
    if (ak < bk) return -1; if (ak > bk) return 1;
    return a._ord - b._ord;
  });

  var itemCount = {};          // sectionKey → running NN
  var total = photos.length;
  for (var i = 0; i < photos.length; i++) {
    var it = photos[i];
    var bucket = expSanitize(it.bucketLabel) || 'No date';
    var ref = expSanitize(it.itemRef).slice(0, 40) || 'Photo';
    var sk = (it.sectionKey || ref) + '';
    var nn = (itemCount[sk] = (itemCount[sk] || 0) + 1);
    var nnStr = (nn < 10 ? '0' : '') + nn;

    var folderPath = root + '/photos/' + bucket;
    var folderZip = top.folder('photos').folder(bucket);

    if (await addImage(folderZip, folderPath, it.originalSrc, ref + ' ' + nnStr + '.jpg', used)) stats.added++;
    else stats.skipped++;

    if (it.markedSrc && it.markedSrc !== it.originalSrc) {
      if (await addImage(folderZip, folderPath, it.markedSrc, ref + ' ' + nnStr + '-marked.jpg', used)) stats.added++;
    }
    if (typeof onProgress === 'function') { try { onProgress(i + 1, total); } catch (e) {} }
  }

  // JSON (the machine-reloadable copy — redundant by design).
  try {
    var jsonName = cfg.jsonFileName ||
      (expSanitize(cfg.projectNum || 'Project') + ' ' + cfg.toolCode + '-' + (cfg.instance || 1) + ' data.json');
    top.file(jsonName, JSON.stringify(cfg.jsonState, null, 2));
  } catch (e) {
    console.warn('[export] JSON failed', e && e.message);
    top.file('JSON_EXPORT_FAILED.txt', 'jsonState serialize failed: ' + (e && e.message));
  }

  // README.
  top.file('README.txt', (cfg.readme ? cfg.readme(cfg, stats) : defaultReadme(cfg, stats)));

  var blob = await zip.generateAsync({ type: 'blob' });
  return { blob: blob, filename: root + '.zip', added: stats.added, skipped: stats.skipped };
}

/** Convenience: build + trigger the browser download. */
export async function buildAndDownload(cfg, onProgress) {
  var out = await buildZip(cfg, onProgress);
  var url = URL.createObjectURL(out.blob);
  var a = document.createElement('a');
  a.href = url; a.download = out.filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
  return out;
}
