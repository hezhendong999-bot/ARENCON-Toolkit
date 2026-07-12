// frt/js/diag/drawingMigrate.js
// S120 Push 18 — Drawing migration tool (console-driven).
//
// PURPOSE
// ───────
// Helps move pins from "old broken" drawings to "new tiled" drawings of the
// SAME source PDFs. Pin coordinates transfer 1:1 — caller has confirmed the
// source PDFs are identical between old and new (just re-rendered as tiled).
//
// USAGE (in DevTools console on the FRT, after the project loads)
// ─────────────────────────────────────────────────────────────────
//   _drawingMigrate.preview()      // shows old vs new drawings, suggests pairs by name
//   _drawingMigrate.plan()         // shows the migration plan you'd commit
//   _drawingMigrate.apply()        // commits — rewrites drawingId on every pin/defic
//   _drawingMigrate.undo()         // reverts the most recent apply (uses snapshot)
//
// SAFETY
// ──────
//   - apply() saves a JSON snapshot to localStorage._frtMigrateUndo BEFORE
//     mutating anything. undo() restores from it.
//   - Old drawings are NOT deleted. They're flagged with a _migratedAwayTo
//     pointer and become invisible in the drawings list (S120 P18 filter
//     respects this). You delete them manually via the drawings UI when
//     you're satisfied the new ones work.
//   - Orphan pins (no matching new drawing) are reported, NOT moved.
//   - Apply also fixes Model._dirty + saveNow + notifies.
//
// IDENTITY HEURISTIC
// ──────────────────
// "Same source PDF" is detected by exact match on (folder, displayName,
// pageNum). If a new drawing with the same triple exists, it's the target.
// preview() prints all matched + unmatched pairs for review.
//
// Exposes window._drawingMigrate. Self-loads with ?dbg=1 OR
// localStorage._frtDbg='1'. Does NOT auto-run anything.

(function () {
  'use strict';

  function _getModel() {
    return (typeof window !== 'undefined' && window._frt && window._frt.Model) || null;
  }

  // ── Identity strategies, tried in order from most-specific to loosest ──
  // S120 P19: previously only used (folder, name, page) which produced zero
  // pairs when old/new lived in separate folders. Now we try four:
  //   (1) Same pdfBufKey + same pageNum    — strongest: literally same source
  //   (2) Same canonicalized name + same pageNum (folder ignored)
  //   (3) Same canonicalized name (no page) — for single-page drawings
  //   (4) Ordered pairing within each (oldFolder, newFolder) cluster — last
  //       resort when names diverged but the count of old equals count of new
  function _canonName(s) {
    return (s || '').toString().trim().toLowerCase()
      .replace(/\.pdf$/, '')
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 .\-_]/g, '');
  }
  function _identityKey(d) {
    var folder = (d.folder || '').trim().toLowerCase();
    var name = _canonName(d.name || d.displayName || '');
    var page = (typeof d.pageNum === 'number') ? d.pageNum : (parseInt(d.pageNum, 10) || 1);
    return folder + '||' + name + '||' + page;
  }

  // ── Detect "tiled" vs "old/broken" ──
  // A drawing is considered tiled if it has tileStatus === 'ready' OR a
  // pdfBufKey AND a tileManifest reference. Anything else = "old/broken".
  // The user can override per-pair in plan() if heuristic gets it wrong.
  function _isTiled(d) {
    if (!d) return false;
    if (d.tileStatus === 'ready') return true;
    if (d.tiledStatus === 'ready') return true;
    if (d.tileManifestUrl) return true;
    if (d._migratedAwayTo) return false; // hidden by previous migration
    return false;
  }

  // ── Find pairs (multi-strategy) ──
  // Walks all drawings, tries strategies in order. Returns
  // { matched: [{ old, new, strategy }], orphanOld: [], orphanNew: [] }.
  function _findPairs() {
    var Model = _getModel();
    if (!Model) return null;
    var proj = Model.getProject();
    if (!proj || !Array.isArray(proj.drawings)) return null;
    var live = proj.drawings.filter(function (d) { return d && d.id && !d._migratedAwayTo; });
    var oldDwgs = live.filter(function (d) { return !_isTiled(d); });
    var newDwgs = live.filter(_isTiled);

    var matched = [];
    var consumedOld = {};
    var consumedNew = {};

    // Strategy 0 — manual pairs (from manualPair() calls). These ALWAYS win.
    _manualPairs.forEach(function (mp) {
      var oldD = oldDwgs.find(function (d) { return d.id === mp.oldId; });
      var newD = newDwgs.find(function (d) { return d.id === mp.newId; });
      // Allow manual pairs to override the tiled-vs-old heuristic too
      if (!oldD) oldD = live.find(function (d) { return d.id === mp.oldId; });
      if (!newD) newD = live.find(function (d) { return d.id === mp.newId; });
      if (oldD && newD && !consumedOld[oldD.id] && !consumedNew[newD.id]) {
        matched.push({ old: oldD, new: newD, strategy: 'manual' });
        consumedOld[oldD.id] = true;
        consumedNew[newD.id] = true;
      }
    });

    // Strategy 1 — same pdfBufKey + same pageNum
    oldDwgs.forEach(function (oldD) {
      if (consumedOld[oldD.id]) return;
      if (!oldD.pdfBufKey) return;
      var page = oldD.pageNum != null ? oldD.pageNum : 1;
      var hit = newDwgs.find(function (nD) {
        if (consumedNew[nD.id]) return false;
        if (!nD.pdfBufKey) return false;
        if (nD.pdfBufKey !== oldD.pdfBufKey) return false;
        var nPage = nD.pageNum != null ? nD.pageNum : 1;
        return nPage === page;
      });
      if (hit) {
        matched.push({ old: oldD, new: hit, strategy: 'pdfBufKey+page' });
        consumedOld[oldD.id] = true;
        consumedNew[hit.id] = true;
      }
    });

    // Strategy 2 — same canonical name + same pageNum (folder ignored)
    oldDwgs.forEach(function (oldD) {
      if (consumedOld[oldD.id]) return;
      var name = _canonName(oldD.name || oldD.displayName || '');
      if (!name) return;
      var page = oldD.pageNum != null ? oldD.pageNum : 1;
      var hit = newDwgs.find(function (nD) {
        if (consumedNew[nD.id]) return false;
        var nName = _canonName(nD.name || nD.displayName || '');
        if (nName !== name) return false;
        var nPage = nD.pageNum != null ? nD.pageNum : 1;
        return nPage === page;
      });
      if (hit) {
        matched.push({ old: oldD, new: hit, strategy: 'name+page' });
        consumedOld[oldD.id] = true;
        consumedNew[hit.id] = true;
      }
    });

    // Strategy 3 — same canonical name only (for non-paginated drawings)
    oldDwgs.forEach(function (oldD) {
      if (consumedOld[oldD.id]) return;
      var name = _canonName(oldD.name || oldD.displayName || '');
      if (!name) return;
      var hit = newDwgs.find(function (nD) {
        if (consumedNew[nD.id]) return false;
        return _canonName(nD.name || nD.displayName || '') === name;
      });
      if (hit) {
        matched.push({ old: oldD, new: hit, strategy: 'name-only' });
        consumedOld[oldD.id] = true;
        consumedNew[hit.id] = true;
      }
    });

    // Strategy 4 — ordered pairing within (oldFolder, newFolder) clusters
    // when leftover counts are equal. Sort each side by pageNum then name.
    var leftoverOld = oldDwgs.filter(function (d) { return !consumedOld[d.id]; });
    var leftoverNew = newDwgs.filter(function (d) { return !consumedNew[d.id]; });
    if (leftoverOld.length && leftoverNew.length) {
      // Group by folder
      var oldByFolder = {};
      leftoverOld.forEach(function (d) {
        var f = (d.folder || '').trim();
        if (!oldByFolder[f]) oldByFolder[f] = [];
        oldByFolder[f].push(d);
      });
      var newByFolder = {};
      leftoverNew.forEach(function (d) {
        var f = (d.folder || '').trim();
        if (!newByFolder[f]) newByFolder[f] = [];
        newByFolder[f].push(d);
      });
      var oldFolders = Object.keys(oldByFolder);
      var newFolders = Object.keys(newByFolder);
      // Try each old-folder × new-folder combination where counts match
      oldFolders.forEach(function (oF) {
        var oldList = oldByFolder[oF];
        // Find a matching new-folder with same count
        var nF = newFolders.find(function (f) {
          return newByFolder[f].length === oldList.length &&
            newByFolder[f].every(function (d) { return !consumedNew[d.id]; });
        });
        if (!nF) return;
        var newList = newByFolder[nF];
        var sortFn = function (a, b) {
          var pa = a.pageNum != null ? a.pageNum : 0;
          var pb = b.pageNum != null ? b.pageNum : 0;
          if (pa !== pb) return pa - pb;
          return _canonName(a.name || '').localeCompare(_canonName(b.name || ''));
        };
        oldList.slice().sort(sortFn).forEach(function (oldD, i) {
          var newD = newList.slice().sort(sortFn)[i];
          if (newD && !consumedNew[newD.id]) {
            matched.push({ old: oldD, new: newD, strategy: 'ordered-by-folder' });
            consumedOld[oldD.id] = true;
            consumedNew[newD.id] = true;
          }
        });
      });
    }

    var orphanOld = oldDwgs.filter(function (d) { return !consumedOld[d.id]; });
    var orphanNew = newDwgs.filter(function (d) { return !consumedNew[d.id]; });
    return { matched: matched, orphanOld: orphanOld, orphanNew: orphanNew };
  }

  // ── Walk every pin reference in a project ──
  // Returns array of { defic, isGeneral, ctrId } refs whose drawingId is in
  // the supplied id-set.
  function _findReferencingDeficiencies(idSet) {
    var Model = _getModel();
    if (!Model) return [];
    var proj = Model.getProject();
    var hits = [];
    function walk(defics, ctrId, isGeneral) {
      (defics || []).forEach(function (d) {
        if (d && d.drawingId && idSet[d.drawingId]) {
          hits.push({ defic: d, ctrId: ctrId, isGeneral: !!isGeneral });
        }
      });
    }
    (proj.contractors || []).forEach(function (c) { walk(c.deficiencies, c.id, false); });
    walk(proj.generalDeficiencies, null, true);
    return hits;
  }

  // ── Public API ──
  function preview() {
    var pairs = _findPairs();
    if (!pairs) { console.warn('[Migrate] No project loaded'); return null; }
    console.group('%c[Drawing Migration] Preview', 'color:#7B5A8F;font-weight:bold;');
    console.log('Matched pairs (old → new): ' + pairs.matched.length);
    if (pairs.matched.length) {
      // Strategy breakdown so user can see HOW each pair was matched
      var byStrat = {};
      pairs.matched.forEach(function (p) { byStrat[p.strategy] = (byStrat[p.strategy] || 0) + 1; });
      console.log('  by strategy:', byStrat);
      console.table(pairs.matched.map(function (p) {
        return {
          strategy: p.strategy,
          oldName: p.old.name || p.old.displayName || '(unnamed)',
          oldFolder: p.old.folder || '(root)',
          newName: p.new.name || p.new.displayName || '(unnamed)',
          newFolder: p.new.folder || '(root)',
          page: p.old.pageNum != null ? p.old.pageNum : '?',
          oldId: (p.old.id || '').slice(0, 8),
          newId: (p.new.id || '').slice(0, 8)
        };
      }));
    }
    if (pairs.orphanOld.length) {
      console.warn('Orphan OLD drawings (no tiled match): ' + pairs.orphanOld.length);
      console.table(pairs.orphanOld.map(function (d) {
        return { name: d.name || d.displayName, page: d.pageNum, folder: d.folder, id: (d.id || '').slice(0, 8) };
      }));
      console.warn('  → These will NOT be migrated. Use _drawingMigrate.manualPair(oldId, newId) to pair them by hand if needed.');
    }
    if (pairs.orphanNew.length) {
      console.warn('Orphan NEW drawings (no old to migrate from): ' + pairs.orphanNew.length);
      console.table(pairs.orphanNew.map(function (d) {
        return { name: d.name || d.displayName, page: d.pageNum, folder: d.folder, id: (d.id || '').slice(0, 8) };
      }));
    }
    console.groupEnd();
    return pairs;
  }

  // ── Manual override ──
  // For when the auto-matcher can't find a pair (different name AND order
  // doesn't help). Caller passes the short id prefixes from preview().
  // Stored in window._drawingMigrate._manualPairs and consulted by apply()
  // alongside the auto-matched pairs.
  var _manualPairs = []; // [{ oldId, newId }]
  function manualPair(oldIdPrefix, newIdPrefix) {
    var Model = _getModel();
    if (!Model) return null;
    var proj = Model.getProject();
    var drawings = (proj && proj.drawings) || [];
    function find(prefix) {
      var match = drawings.filter(function (d) { return d.id && d.id.indexOf(prefix) === 0; });
      if (match.length === 0) return null;
      if (match.length > 1) {
        console.warn('[Migrate] Prefix "' + prefix + '" matched ' + match.length + ' drawings — be more specific.');
        return null;
      }
      return match[0];
    }
    var oldD = find(oldIdPrefix);
    var newD = find(newIdPrefix);
    if (!oldD) { console.warn('[Migrate] No drawing with id prefix "' + oldIdPrefix + '"'); return null; }
    if (!newD) { console.warn('[Migrate] No drawing with id prefix "' + newIdPrefix + '"'); return null; }
    _manualPairs.push({ oldId: oldD.id, newId: newD.id });
    console.log('[Migrate] Manual pair queued:', oldD.name || '?', '→', newD.name || '?');
    console.log('  (' + _manualPairs.length + ' manual pair(s) queued so far. Run preview() to see effect.)');
    return { old: oldD, new: newD };
  }
  function clearManualPairs() {
    var n = _manualPairs.length;
    _manualPairs = [];
    console.log('[Migrate] Cleared ' + n + ' manual pair(s).');
    return n;
  }

  function plan() {
    var pairs = _findPairs();
    if (!pairs) return null;
    var mapById = {};
    pairs.matched.forEach(function (p) { mapById[p.old.id] = p.new.id; });
    var oldIdSet = {};
    pairs.matched.forEach(function (p) { oldIdSet[p.old.id] = true; });
    var hits = _findReferencingDeficiencies(oldIdSet);
    console.group('%c[Drawing Migration] Plan', 'color:#5A6E80;font-weight:bold;');
    console.log('Drawing pairs to migrate: ' + pairs.matched.length);
    console.log('Pins/defics to rewrite: ' + hits.length);
    if (hits.length) {
      console.table(hits.slice(0, 50).map(function (h) {
        var oldId = h.defic.drawingId;
        return {
          pin: h.defic.num != null ? '#' + h.defic.num : '?',
          ctr: h.isGeneral ? '(General)' : (h.ctrId || '').slice(0, 8),
          oldDrawingId: (oldId || '').slice(0, 8),
          newDrawingId: (mapById[oldId] || '').slice(0, 8),
          pinX: h.defic.pinX != null ? Math.round(h.defic.pinX * 100) / 100 : null,
          pinY: h.defic.pinY != null ? Math.round(h.defic.pinY * 100) / 100 : null
        };
      }));
      if (hits.length > 50) console.log('  ...and ' + (hits.length - 50) + ' more');
    }
    console.log('%cReady. Run _drawingMigrate.apply() to commit.', 'color:#5C7A65;font-weight:bold;');
    console.groupEnd();
    return { pairs: pairs, mapById: mapById, hits: hits };
  }

  function apply() {
    var Model = _getModel();
    if (!Model) { console.warn('[Migrate] No Model'); return null; }
    var p = plan();
    if (!p || !p.hits.length) {
      console.log('[Migrate] Nothing to do.');
      return null;
    }
    // ── Snapshot for undo ──
    try {
      var snap = JSON.stringify({
        ts: new Date().toISOString(),
        hits: p.hits.map(function (h) {
          return { deficId: h.defic.id, oldDrawingId: h.defic.drawingId };
        }),
        pairs: p.pairs.matched.map(function (pr) {
          return { oldId: pr.old.id, newId: pr.new.id };
        })
      });
      localStorage.setItem('_frtMigrateUndo', snap);
      console.log('[Migrate] Undo snapshot saved (localStorage._frtMigrateUndo, ' + snap.length + ' bytes)');
    } catch (e) {
      console.error('[Migrate] Could not save undo snapshot — aborting:', e);
      return null;
    }
    // ── Rewrite ──
    var rewritten = 0;
    p.hits.forEach(function (h) {
      var oldId = h.defic.drawingId;
      var newId = p.mapById[oldId];
      if (newId && oldId !== newId) {
        h.defic.drawingId = newId;
        rewritten++;
      }
    });
    // ── Hide old drawings ──
    // NOT deleting — leaving them flagged. The drawings UI filters on
    // _migratedAwayTo presence so they vanish from view. User deletes
    // manually via the drawing list once they confirm everything works.
    p.pairs.matched.forEach(function (pr) {
      pr.old._migratedAwayTo = pr.new.id;
      pr.old._migratedAt = new Date().toISOString();
    });
    Model._dirty = true; // private — but the alternative is wrong (no _markDirty public)
    // Use saveNow if available, else _queueSave
    if (typeof Model.saveNow === 'function') Model.saveNow();
    if (typeof Model._notify === 'function') {
      Model._notify('drawing', { action: 'migrate', count: p.pairs.matched.length });
      Model._notify('project', Model.getProject());
    }
    console.log('%c[Migrate] Done. Rewrote ' + rewritten + ' pins. Hid ' + p.pairs.matched.length + ' old drawings.', 'color:#5C7A65;font-weight:bold;');
    console.log('  - Reload the drawings tab to see the migration.');
    console.log('  - Old drawings remain in data but are hidden — delete them manually once you verify pins land correctly on the new drawings.');
    console.log('  - To undo: _drawingMigrate.undo()');
    return { rewritten: rewritten, hidden: p.pairs.matched.length };
  }

  function undo() {
    var Model = _getModel();
    if (!Model) return null;
    var raw = null;
    try { raw = localStorage.getItem('_frtMigrateUndo'); } catch (_) {}
    if (!raw) { console.warn('[Migrate] No undo snapshot.'); return null; }
    var snap;
    try { snap = JSON.parse(raw); } catch (e) {
      console.error('[Migrate] Undo snapshot corrupt:', e);
      return null;
    }
    if (!snap.hits || !snap.pairs) {
      console.error('[Migrate] Undo snapshot malformed.');
      return null;
    }
    // Restore drawingIds
    var deficById = {};
    var proj = Model.getProject();
    function walk(defics) {
      (defics || []).forEach(function (d) { if (d && d.id) deficById[d.id] = d; });
    }
    (proj.contractors || []).forEach(function (c) { walk(c.deficiencies); });
    walk(proj.generalDeficiencies);
    var restored = 0;
    snap.hits.forEach(function (h) {
      var d = deficById[h.deficId];
      if (d) { d.drawingId = h.oldDrawingId; restored++; }
    });
    // Un-hide old drawings
    var pairById = {};
    snap.pairs.forEach(function (pr) { pairById[pr.oldId] = pr; });
    (proj.drawings || []).forEach(function (d) {
      if (d && pairById[d.id]) {
        delete d._migratedAwayTo;
        delete d._migratedAt;
      }
    });
    Model._dirty = true;
    if (typeof Model.saveNow === 'function') Model.saveNow();
    if (typeof Model._notify === 'function') {
      Model._notify('drawing', { action: 'migrate-undo', count: snap.pairs.length });
      Model._notify('project', Model.getProject());
    }
    try { localStorage.removeItem('_frtMigrateUndo'); } catch (_) {}
    console.log('%c[Migrate] Undo complete. Restored ' + restored + ' pins. Un-hid ' + snap.pairs.length + ' drawings.', 'color:#A85959;font-weight:bold;');
    return { restored: restored, unhidden: snap.pairs.length };
  }

  // ── List drawings (helper for figuring out manual pairs) ──
  function listDrawings() {
    var Model = _getModel();
    if (!Model) return null;
    var proj = Model.getProject();
    if (!proj) return null;
    var rows = (proj.drawings || []).map(function (d) {
      return {
        id8: (d.id || '').slice(0, 8),
        name: d.name || d.displayName || '(unnamed)',
        folder: d.folder || '(root)',
        page: d.pageNum != null ? d.pageNum : '?',
        tiled: _isTiled(d) ? 'YES' : 'no',
        migrated: d._migratedAwayTo ? 'gone' : '',
        pdfBufKey: (d.pdfBufKey || '').slice(0, 12)
      };
    });
    console.group('%c[Drawing Migration] All drawings', 'color:#5A6E80;font-weight:bold;');
    console.table(rows);
    console.groupEnd();
    return rows;
  }

  // ── Folder-based explicit pairing ──
  // S120 P20: when the auto-detector can't tell old from new (e.g. both
  // sides have tileStatus='ready' but one set is actually broken in R2),
  // user passes the two folder names explicitly. Pairs by ascending pageNum.
  // Falls back to ordered position if pageNum is missing on either side.
  // Both folder names match by case-insensitive substring so user can pass
  // a fragment instead of the exact name.
  function pairFolders(oldFolderQuery, newFolderQuery) {
    var Model = _getModel();
    if (!Model) { console.warn('[Migrate] No Model'); return null; }
    var proj = Model.getProject();
    if (!proj) return null;
    var live = (proj.drawings || []).filter(function (d) { return d && d.id && !d._migratedAwayTo; });
    var qOld = (oldFolderQuery || '').trim().toLowerCase();
    var qNew = (newFolderQuery || '').trim().toLowerCase();
    if (!qOld || !qNew) {
      console.warn('[Migrate] Usage: pairFolders("old folder fragment", "new folder fragment")');
      return null;
    }
    // S120 P21: classify EACH drawing as old / new / neither based on which
    // fragment matches its folder. When both fragments match (because one is
    // a substring of the folder name and the other is too — e.g. 'ift b10'
    // and 'inspector 2' both appearing in 'IFT B10 (Inspector 2)'), the
    // SPECIFIC rule wins:
    //   - if exactly one fragment matches → assign to that side
    //   - if both match → assign to whichever fragment is NOT a substring
    //     of the other (i.e. the more discriminating fragment). 'inspector 2'
    //     is unique to the inspector folder; 'ift b10' is in both folders;
    //     so 'inspector 2' is the more discriminating identifier.
    //   - if both fragments are equally non-discriminating, refuse and warn.
    var oldList = [];
    var newList = [];
    var ambiguous = [];
    var qOldIsSubsetOfNew = qNew.indexOf(qOld) >= 0 && qNew !== qOld;
    var qNewIsSubsetOfOld = qOld.indexOf(qNew) >= 0 && qOld !== qNew;
    live.forEach(function (d) {
      var f = (d.folder || '').toLowerCase();
      var matchOld = f.indexOf(qOld) >= 0;
      var matchNew = f.indexOf(qNew) >= 0;
      if (matchOld && matchNew) {
        // Both queries hit this folder. Assign to the more discriminating side.
        if (qOldIsSubsetOfNew && !qNewIsSubsetOfOld) {
          // qOld is a generic prefix of qNew → qNew is more specific → NEW wins
          newList.push(d);
        } else if (qNewIsSubsetOfOld && !qOldIsSubsetOfNew) {
          // qNew is a generic prefix of qOld → qOld is more specific → OLD wins
          oldList.push(d);
        } else {
          // Neither contains the other; both match for unrelated reasons.
          // Assign to whichever fragment is longer (more specific characters).
          if (qOld.length > qNew.length) oldList.push(d);
          else if (qNew.length > qOld.length) newList.push(d);
          else ambiguous.push(d);
        }
      } else if (matchOld) {
        oldList.push(d);
      } else if (matchNew) {
        newList.push(d);
      }
      // matchNeither → ignored (drawing in some unrelated folder)
    });
    if (ambiguous.length) {
      console.warn('[Migrate] ' + ambiguous.length + ' drawings match BOTH fragments equally — cannot disambiguate. Use distinctive fragments.');
      console.table(ambiguous.map(function (d) {
        return { id8: (d.id || '').slice(0, 8), name: d.name, folder: d.folder };
      }));
    }
    if (!oldList.length) {
      console.warn('[Migrate] No drawings matched old folder fragment "' + oldFolderQuery + '"');
      console.warn('  Run _drawingMigrate.list() to see all folder names. Try a more specific fragment.');
      return null;
    }
    if (!newList.length) {
      console.warn('[Migrate] No drawings matched new folder fragment "' + newFolderQuery + '"');
      return null;
    }
    console.log('[Migrate] Old folder: "' + oldList[0].folder + '" (' + oldList.length + ' drawings)');
    console.log('[Migrate] New folder: "' + newList[0].folder + '" (' + newList.length + ' drawings)');
    if (oldList.length !== newList.length) {
      console.warn('[Migrate] Counts differ — pairing as many as fits.');
    }
    var sortByPage = function (a, b) {
      var pa = a.pageNum != null ? a.pageNum : 0;
      var pb = b.pageNum != null ? b.pageNum : 0;
      if (pa !== pb) return pa - pb;
      return _canonName(a.name || '').localeCompare(_canonName(b.name || ''));
    };
    var oldSorted = oldList.slice().sort(sortByPage);
    var newSorted = newList.slice().sort(sortByPage);
    var n = Math.min(oldSorted.length, newSorted.length);
    var paired = 0;
    for (var i = 0; i < n; i++) {
      var oldD = oldSorted[i];
      var newD = newSorted[i];
      var alreadyPaired = _manualPairs.some(function (mp) {
        return mp.oldId === oldD.id || mp.newId === newD.id;
      });
      if (alreadyPaired) continue;
      _manualPairs.push({ oldId: oldD.id, newId: newD.id });
      paired++;
    }
    console.log('%c[Migrate] Queued ' + paired + ' pairs from folders.', 'color:#5C7A65;font-weight:bold;');
    console.log('  Run _drawingMigrate.preview() to see them, then plan() and apply().');
    return paired;
  }

  // ── Public API ──
  // Always expose. Tool is opt-in via console invocation; loading the script
  // alone has no behavior effect.
  function deleteHidden() {
    var Model = _getModel();
    if (!Model) return null;
    var proj = Model.getProject();
    if (!proj || !Array.isArray(proj.drawings)) return null;
    var hidden = proj.drawings.filter(function (d) { return d && d._migratedAwayTo; });
    if (!hidden.length) {
      console.log('[Migrate] No migrated-away drawings to delete.');
      return 0;
    }
    console.warn('[Migrate] About to delete ' + hidden.length + ' migrated-away drawings:');
    console.table(hidden.map(function (d) {
      return { id8: (d.id || '').slice(0, 8), name: d.name, folder: d.folder, page: d.pageNum, migratedTo: (d._migratedAwayTo || '').slice(0, 8) };
    }));
    // Require explicit confirm via second invocation within 30s
    var now = Date.now();
    if (!window._drawingMigrate._lastDeleteHiddenWarn ||
        (now - window._drawingMigrate._lastDeleteHiddenWarn) > 30000) {
      window._drawingMigrate._lastDeleteHiddenWarn = now;
      console.warn('%c[Migrate] Run _drawingMigrate.deleteHidden() AGAIN within 30 seconds to confirm deletion.', 'color:#A85959;font-weight:bold;');
      return null;
    }
    window._drawingMigrate._lastDeleteHiddenWarn = 0; // consume the confirm
    var deleted = 0;
    var R2 = (window._frt && window._frt.R2) || null;
    hidden.forEach(function (d) {
      try {
        if (typeof Model.removeDrawing === 'function') {
          // S120 Push 25 (C4): snapshot drawings BEFORE removal so the
          // sharing check in deleteDrawingAssets sees a live picture.
          // Fire-and-forget the R2 cleanup — failure is logged, doesn't
          // block the local deletion.
          var allDrawings = ((Model.getProject() || {}).drawings || []).slice();
          var pid = (Model.getProject() || {}).id;
          Model.removeDrawing(d.id);
          deleted++;
          if (R2 && typeof R2.deleteDrawingAssets === 'function' && pid && d.pdfBufKey) {
            R2.deleteDrawingAssets(pid, d, allDrawings).then(function (res) {
              if (res.pdfBufDeleted) console.log('[Migrate cleanup] Freed PDF buffer for ' + (d.name || d.id));
              else if (res.sharedSkipped) console.log('[Migrate cleanup] PDF buffer of ' + (d.name || d.id) + ' still shared.');
            });
          }
        }
      } catch (e) {
        console.error('[Migrate] removeDrawing(' + d.id + ') failed:', e);
      }
    });
    if (typeof Model.saveNow === 'function') Model.saveNow();
    console.log('%c[Migrate] Deleted ' + deleted + ' drawings.', 'color:#5C7A65;font-weight:bold;');
    console.log('  Reload the drawings tab to refresh the view.');
    return deleted;
  }

  if (typeof window !== 'undefined') {
    window._drawingMigrate = {
      preview: preview,
      plan: plan,
      apply: apply,
      undo: undo,
      list: listDrawings,
      manualPair: manualPair,
      pairFolders: pairFolders,
      clearManualPairs: clearManualPairs,
      deleteHidden: deleteHidden,
      _findPairs: _findPairs,
      _identityKey: _identityKey,
      _manualPairs: _manualPairs,
      _lastDeleteHiddenWarn: 0
    };
    if (typeof console !== 'undefined' && console.log) {
      console.log('%c[_drawingMigrate v4] loaded. Run _drawingMigrate.preview() to start.', 'color:#7B5A8F;');
    }
  }
})();
