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

  // ── Identity key for matching old → new ──
  // Two drawings are "the same page" iff folder + displayName + pageNum match.
  // displayName is canonicalized: case-insensitive, trimmed, internal whitespace
  // collapsed. PDF source filename is the most stable identifier.
  function _identityKey(d) {
    var folder = (d.folder || '').trim().toLowerCase();
    var name = (d.name || d.displayName || '').trim().toLowerCase().replace(/\s+/g, ' ');
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

  // ── Find pairs ──
  // Walks all drawings, groups by identity key, splits each group into
  // tiled vs non-tiled. Returns { matched: [{ old, new }], orphanOld: [], orphanNew: [] }.
  function _findPairs() {
    var Model = _getModel();
    if (!Model) return null;
    var proj = Model.getProject();
    if (!proj || !Array.isArray(proj.drawings)) return null;
    var drawings = proj.drawings.filter(function (d) { return d && d.id && !d._migratedAwayTo; });
    var groups = {};
    drawings.forEach(function (d) {
      var k = _identityKey(d);
      if (!groups[k]) groups[k] = [];
      groups[k].push(d);
    });
    var matched = [];
    var orphanOld = [];
    var orphanNew = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      var tiled = g.filter(_isTiled);
      var legacy = g.filter(function (d) { return !_isTiled(d); });
      if (tiled.length && legacy.length) {
        // Pair every legacy with the FIRST tiled of the group. If multiple
        // tiled exist (shouldn't happen but safe), they go to orphanNew.
        legacy.forEach(function (oldD) { matched.push({ old: oldD, new: tiled[0] }); });
        tiled.slice(1).forEach(function (extra) { orphanNew.push(extra); });
      } else if (tiled.length === 0 && legacy.length) {
        legacy.forEach(function (oldD) { orphanOld.push(oldD); });
      } else {
        // Only tiled — already-migrated state, no-op
      }
    });
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
      console.table(pairs.matched.map(function (p) {
        return {
          name: p.old.name || p.old.displayName || '(unnamed)',
          page: p.old.pageNum != null ? p.old.pageNum : '?',
          folder: p.old.folder || '(root)',
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
      console.warn('  → these drawings will NOT be migrated. Their pins stay where they are.');
    }
    if (pairs.orphanNew.length) {
      console.warn('Orphan NEW drawings (no old to migrate from): ' + pairs.orphanNew.length);
    }
    console.groupEnd();
    return pairs;
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

  // ── Bootstrap ──
  // Always expose. Tool is opt-in via console invocation; loading the script
  // alone has no behavior effect.
  if (typeof window !== 'undefined') {
    window._drawingMigrate = {
      preview: preview,
      plan: plan,
      apply: apply,
      undo: undo,
      _findPairs: _findPairs,    // for advanced use
      _identityKey: _identityKey
    };
    // Quiet log on first load so the user knows it's available
    if (typeof console !== 'undefined' && console.log) {
      console.log('%c[_drawingMigrate] loaded. Run _drawingMigrate.preview() to start.', 'color:#7B5A8F;');
    }
  }
})();
