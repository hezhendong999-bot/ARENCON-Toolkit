/**
 * ARENCON FRT v2 — 3-Way Merge Engine
 * ════════════════════════════════════
 *
 * S123 Push 6A — Sync atomicity Tier 1 + Tier 2 (merge engine only, no UX wired).
 *
 * Pure-function module (no side effects). Performs 3-way merge between:
 *   - base   : the common ancestor (last cloud state we saw)
 *   - mine   : my current local state (what I tried to push)
 *   - theirs : the cloud's current state (what we got back on 412)
 *
 * Returns { merged, conflicts } where:
 *   - merged    : a new project object combining non-conflicting changes
 *                 from both sides
 *   - conflicts : array of {path, base, mine, theirs} describing every
 *                 location where both sides changed the same field in
 *                 incompatible ways. Caller resolves these via modal.
 *
 * Tier 1 (collection-level): handles top-level project collections
 *   (projectInfo, signatures, drawings, photos, contractors,
 *   generalDeficiencies). When only one side touched a collection,
 *   that side wins. When both touched the same collection, dive into
 *   Tier 2.
 *
 * Tier 2 (item-level): for arrays of id-keyed objects, walks items
 *   by id. Items added/deleted on one side are merged through.
 *   Items modified on one side are taken. Items modified on both
 *   sides recurse into field-level merge; mismatched scalars become
 *   conflicts.
 *
 * Stable id fields used for matching (in priority order):
 *   id, _id, drawingId, deficiencyId, observationId, photoId, entryId
 *
 * Path notation in conflicts:
 *   "projectInfo.client"
 *   "contractors[ctr_abc123].deficiencies[d_5].observations[o_2].text"
 *   "drawings[dw_42].name"
 *
 * Used by: data/sync.js (when push receives 412 Precondition Failed).
 * Tested via: window._frt_mergeDiag (set up at bottom).
 *
 * NOT used for: photo binary data, drawing tile data — those are
 * stripped before push and reconstituted from IDB/R2 separately.
 */

// ── Configuration ────────────────────────────────────────────

/**
 * Top-level collections we know how to merge.
 * Order matters only for the diagnostic output.
 */
var TOP_LEVEL_COLLECTIONS = [
  'projectInfo',
  'signatures',
  'projectNumber', 'projectName', 'client', 'address',  // scalar top-level fields
  'currentFrtInstance',
  'contractors',
  'generalDeficiencies',
  'drawings',
  'photos',
  'activityLog',
  'frtInstances',
  'reportInstances'
];

/**
 * For each array-of-objects collection, what field is the stable id?
 * Walked in order; first match wins.
 */
var ID_FIELDS = ['id', '_id'];

/**
 * Within these specific nested arrays, additional id hints if 'id' isn't present.
 * Map: parent path suffix → preferred id field.
 */
var NESTED_ID_HINTS = {
  // No hints needed currently — every array of objects uses 'id'.
  // Reserved for future schema additions.
};

// ── Helpers ──────────────────────────────────────────────────

/**
 * Deep clone via JSON round-trip. Safe because our data is JSON-clean
 * (binary blobs stripped before merge ever runs).
 */
function _clone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep equality check. Returns true if two values are structurally identical.
 * Treats undefined and missing keys as equivalent.
 */
function _deepEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!_deepEq(a[i], b[i])) return false;
    }
    return true;
  }
  var keysA = Object.keys(a);
  var keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (var k = 0; k < keysA.length; k++) {
    if (!_deepEq(a[keysA[k]], b[keysA[k]])) return false;
  }
  return true;
}

/**
 * Pick the stable id from an object. Returns null if none found.
 */
function _idOf(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (var i = 0; i < ID_FIELDS.length; i++) {
    if (obj[ID_FIELDS[i]] !== undefined && obj[ID_FIELDS[i]] !== null) {
      return obj[ID_FIELDS[i]];
    }
  }
  return null;
}

/**
 * Index an array of objects by their id. Returns { byId: Map, withoutId: [] }.
 * Items without a stable id go into withoutId — these can't be merged
 * cleanly and are treated as appends.
 */
function _indexById(arr) {
  var byId = {};
  var withoutId = [];
  if (!Array.isArray(arr)) return { byId: byId, withoutId: withoutId, hasAnyIds: false };
  var hasAnyIds = false;
  for (var i = 0; i < arr.length; i++) {
    var id = _idOf(arr[i]);
    if (id !== null) {
      byId[id] = arr[i];
      hasAnyIds = true;
    } else {
      withoutId.push(arr[i]);
    }
  }
  return { byId: byId, withoutId: withoutId, hasAnyIds: hasAnyIds };
}

/**
 * Recurse: is this an array of objects keyed by id?
 * Returns true if at least one item has an id field.
 */
function _isIdKeyedArray(arr) {
  if (!Array.isArray(arr)) return false;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && typeof arr[i] === 'object' && _idOf(arr[i]) !== null) return true;
  }
  return false;
}

// ── Core merge algorithm ─────────────────────────────────────

/**
 * 3-way merge for any value (scalar, array, or object).
 * Returns { value, conflicts }.
 *
 * Rules:
 *   - If mine === theirs (deep) → no change, no conflict
 *   - If mine === base → take theirs (they changed, I didn't)
 *   - If theirs === base → take mine (I changed, they didn't)
 *   - Else if both arrays-of-id-keyed-objects → item-level recurse
 *   - Else if both plain objects → field-level recurse
 *   - Else → conflict (both changed to different scalars/arrays)
 */
function _merge3Value(base, mine, theirs, pathStr) {
  // Equal on both sides — no change anywhere.
  if (_deepEq(mine, theirs)) {
    return { value: _clone(mine), conflicts: [] };
  }

  // Only one side changed — take that side. This is the common case
  // (different inspectors editing different parts of the project).
  if (_deepEq(mine, base)) {
    return { value: _clone(theirs), conflicts: [] };
  }
  if (_deepEq(theirs, base)) {
    return { value: _clone(mine), conflicts: [] };
  }

  // Both sides changed. Try to merge structurally.

  // Case: both are arrays of id-keyed objects → item-by-item merge (Tier 2)
  if (Array.isArray(mine) && Array.isArray(theirs) &&
      _isIdKeyedArray(mine) && _isIdKeyedArray(theirs)) {
    return _merge3IdArray(base || [], mine, theirs, pathStr);
  }

  // Case: both are plain objects (and not arrays) → field-by-field merge
  if (mine && theirs &&
      typeof mine === 'object' && typeof theirs === 'object' &&
      !Array.isArray(mine) && !Array.isArray(theirs)) {
    return _merge3Object(base || {}, mine, theirs, pathStr);
  }

  // Otherwise: scalar conflict or incompatible type change. Real conflict.
  return {
    value: _clone(mine),  // Default to mine; modal will override
    conflicts: [{
      path: pathStr,
      base: _clone(base),
      mine: _clone(mine),
      theirs: _clone(theirs),
      kind: 'scalar'
    }]
  };
}

/**
 * Merge two plain objects field-by-field. base is the common ancestor.
 * Each field is merged recursively via _merge3Value.
 *
 * Keys present in only one side: that side's value is taken (additions
 * from either side are preserved).
 *
 * Keys deleted from one side that the other modified: conflict.
 */
function mineHasKey(obj, key) { return !!(obj && Object.prototype.hasOwnProperty.call(obj, key)); }

function _merge3Object(base, mine, theirs, pathStr) {
  var result = {};
  var conflicts = [];
  var allKeys = {};

  Object.keys(base || {}).forEach(function(k) { allKeys[k] = true; });
  Object.keys(mine || {}).forEach(function(k) { allKeys[k] = true; });
  Object.keys(theirs || {}).forEach(function(k) { allKeys[k] = true; });

  Object.keys(allKeys).forEach(function(key) {
    var bv = base ? base[key] : undefined;
    var mv = mine ? mine[key] : undefined;
    var tv = theirs ? theirs[key] : undefined;
    var subPath = pathStr ? pathStr + '.' + key : key;

    // ── S284b (Mark): photo-selection resurrection fix — two key-specific
    // rules, both deterministic, both conflict-free. They run BEFORE the
    // deletion handling: a register/selection present on only one side is an
    // ADDITION to preserve, never a delete-vs-modify conflict (the generic
    // path below conflates base-absent additions with deletions).
    // 1) photoSelTs: per-photo LWW. Greater t wins; exact tie → s:0 (the safe
    //    side — a wrongly-hidden photo is recoverable from the pool, a
    //    wrongly-resurrected one re-opens the incident).
    if (key === 'photoSelTs' && (mv || tv)) {
      var _ma = (mv && typeof mv === 'object') ? mv : {};
      var _ta = (tv && typeof tv === 'object') ? tv : {};
      var _reg = {};
      var _ids = {};
      Object.keys(_ma).forEach(function(id) { _ids[id] = true; });
      Object.keys(_ta).forEach(function(id) { _ids[id] = true; });
      Object.keys(_ids).forEach(function(id) {
        var a = _ma[id], b = _ta[id];
        if (a && !b) { _reg[id] = _clone(a); return; }
        if (b && !a) { _reg[id] = _clone(b); return; }
        var ta2 = (a && a.t) || 0, tb2 = (b && b.t) || 0;
        if (ta2 > tb2) _reg[id] = _clone(a);
        else if (tb2 > ta2) _reg[id] = _clone(b);
        else _reg[id] = _clone((a.s === 0) ? a : b);  // tie → the s:0 side
      });
      if (Object.keys(_reg).length) result[key] = _reg;
      return;
    }
    // 2) photoSelection: the legacy ID array. Never emit a conflict here —
    //    the old delete-vs-modify default WAS the resurrection mechanism.
    //    One side changed → that side wins; both changed → union (theirs'
    //    order, mine's extras appended); _reconcilePhotoSelectionsFn prunes
    //    the union via the register right after applyMerged. null means
    //    "default = whole pool"; a null colliding with a custom array loses
    //    to the array (narrowing carries intent the register arbitrates).
    if (key === 'photoSelection' && (mineHasKey(mine, key) || mineHasKey(theirs, key))) {
      if (_deepEq(mv, tv)) { if (mv !== undefined) result[key] = _clone(mv); return; }
      if (_deepEq(mv, bv)) { if (tv !== undefined) result[key] = _clone(tv); return; }
      if (_deepEq(tv, bv)) { if (mv !== undefined) result[key] = _clone(mv); return; }
      if (!Array.isArray(mv) || !Array.isArray(tv)) {
        result[key] = _clone(Array.isArray(mv) ? mv : (Array.isArray(tv) ? tv : mv));
        return;
      }
      var _u = tv.slice();
      mv.forEach(function(id) { if (_u.indexOf(id) === -1) _u.push(id); });
      result[key] = _u;
      return;
    }

    // Key deletion handling.
    var mineHas = mine && mine.hasOwnProperty(key);
    var theirsHas = theirs && theirs.hasOwnProperty(key);
    var baseHas = base && base.hasOwnProperty(key);

    if (!mineHas && !theirsHas) {
      // Both deleted; agree on absence.
      return;
    }
    if (!mineHas && theirsHas && baseHas && _deepEq(tv, bv)) {
      // I deleted, they didn't touch — keep deletion.
      return;
    }
    if (!theirsHas && mineHas && baseHas && _deepEq(mv, bv)) {
      // They deleted, I didn't touch — keep deletion.
      return;
    }
    if (!mineHas && theirsHas && !_deepEq(tv, bv)) {
      // I deleted, they modified — conflict.
      conflicts.push({ path: subPath, base: _clone(bv), mine: undefined, theirs: _clone(tv), kind: 'delete-vs-modify' });
      result[key] = _clone(tv);  // Default to theirs (don't silently lose work)
      return;
    }
    if (!theirsHas && mineHas && !_deepEq(mv, bv)) {
      // They deleted, I modified — conflict.
      conflicts.push({ path: subPath, base: _clone(bv), mine: _clone(mv), theirs: undefined, kind: 'modify-vs-delete' });
      result[key] = _clone(mv);
      return;
    }

    // Both present (or both base+both sides). Recurse.
    var sub = _merge3Value(bv, mv, tv, subPath);
    if (sub.value !== undefined) result[key] = sub.value;
    Array.prototype.push.apply(conflicts, sub.conflicts);
  });

  return { value: result, conflicts: conflicts };
}

/**
 * Merge two arrays of id-keyed objects. This is Tier 2's core.
 *
 *   - Items in both sides with matching id → recurse into the object
 *   - Items only in mine → keep (I added)
 *   - Items only in theirs → keep (they added)
 *   - Items in base but not in mine and unchanged in theirs → I deleted, keep delete
 *   - Items in base but not in theirs and unchanged in mine → they deleted, keep delete
 *   - Items deleted on one side but modified on the other → conflict
 *
 * The merged array order: base's order is preserved for items that
 * existed in base, then mine's new items appended, then theirs' new
 * items appended (in their respective orders).
 */
function _merge3IdArray(base, mine, theirs, pathStr) {
  var baseIdx = _indexById(base);
  var mineIdx = _indexById(mine);
  var theirsIdx = _indexById(theirs);

  var conflicts = [];
  var result = [];
  var seenIds = {};

  // 1. Walk base order. For each base item, determine its fate.
  if (Array.isArray(base)) {
    base.forEach(function(baseItem) {
      var bid = _idOf(baseItem);
      if (bid === null) return; // shouldn't happen — base items without ids handled in withoutId block below
      seenIds[bid] = true;

      var inMine = mineIdx.byId.hasOwnProperty(bid);
      var inTheirs = theirsIdx.byId.hasOwnProperty(bid);
      var mineItem = inMine ? mineIdx.byId[bid] : undefined;
      var theirsItem = inTheirs ? theirsIdx.byId[bid] : undefined;

      if (!inMine && !inTheirs) {
        // Both deleted — agree, drop.
        return;
      }
      if (!inMine && inTheirs) {
        // I deleted. Did they modify?
        if (_deepEq(theirsItem, baseItem)) {
          // They didn't touch it — keep my delete.
          return;
        }
        // They modified, I deleted — conflict.
        conflicts.push({
          path: pathStr + '[' + bid + ']',
          base: _clone(baseItem),
          mine: undefined,
          theirs: _clone(theirsItem),
          kind: 'delete-vs-modify'
        });
        result.push(_clone(theirsItem));  // Default keep, modal decides
        return;
      }
      if (!inTheirs && inMine) {
        // They deleted. Did I modify?
        if (_deepEq(mineItem, baseItem)) {
          // I didn't touch — keep their delete.
          return;
        }
        // I modified, they deleted — conflict.
        conflicts.push({
          path: pathStr + '[' + bid + ']',
          base: _clone(baseItem),
          mine: _clone(mineItem),
          theirs: undefined,
          kind: 'modify-vs-delete'
        });
        result.push(_clone(mineItem));
        return;
      }

      // Both present — recurse into the item itself.
      var sub = _merge3Value(baseItem, mineItem, theirsItem, pathStr + '[' + bid + ']');
      result.push(sub.value);
      Array.prototype.push.apply(conflicts, sub.conflicts);
    });
  }

  // 2. New items in mine (not in base).
  Object.keys(mineIdx.byId).forEach(function(mid) {
    if (seenIds[mid]) return;
    // Could also exist in theirs (independently added with same id —
    // unlikely with our uid generator but possible). Treat as merge.
    if (theirsIdx.byId.hasOwnProperty(mid)) {
      // Both added an item with the same id. Recurse.
      seenIds[mid] = true;
      var sub = _merge3Value(undefined, mineIdx.byId[mid], theirsIdx.byId[mid], pathStr + '[' + mid + ']');
      result.push(sub.value);
      Array.prototype.push.apply(conflicts, sub.conflicts);
    } else {
      seenIds[mid] = true;
      result.push(_clone(mineIdx.byId[mid]));
    }
  });

  // 3. New items in theirs (not in base, not in mine).
  Object.keys(theirsIdx.byId).forEach(function(tid) {
    if (seenIds[tid]) return;
    seenIds[tid] = true;
    result.push(_clone(theirsIdx.byId[tid]));
  });

  // 4. Items without stable ids — append both sides' lists.
  // (These can't be merged; safest is to keep all, even if duplicated.)
  // S284b: dedupe EXACT duplicates across the two lists — when mine and
  // theirs both carry the same untouched id-less item (the common case:
  // an old client added one item and neither side edited it), appending
  // both duplicated it. Deep-equal items appear once; genuinely different
  // id-less items still both survive (old behavior).
  mineIdx.withoutId.forEach(function(item) { result.push(_clone(item)); });
  theirsIdx.withoutId.forEach(function(item) {
    var dup = mineIdx.withoutId.some(function(m) { return _deepEq(m, item); });
    if (!dup) result.push(_clone(item));
  });

  return { value: result, conflicts: conflicts };
}

// ── Public API ───────────────────────────────────────────────

/**
 * Main entry point. Performs 3-way merge of two project states.
 *
 *   merge3(base, mine, theirs) → { merged, conflicts }
 *
 * base   : the snapshot we got from the last successful pull
 * mine   : our current local state (what we tried to push)
 * theirs : the cloud's current state (what we received on 412)
 *
 * Returns:
 *   merged    : new project object combining both sides
 *   conflicts : array of { path, base, mine, theirs, kind }
 *
 * Caller must:
 *   1. Display conflicts to the user via modal (Push B)
 *   2. Apply user's resolutions (overwrite conflicting paths in merged)
 *   3. Push merged with new If-Match header
 *
 * If conflicts is empty, merged can be pushed immediately.
 */
export function merge3(base, mine, theirs) {
  if (!mine || !theirs) {
    throw new Error('merge3: both mine and theirs are required');
  }
  // base may be null (first-time push with no prior snapshot) — treat as
  // mine being the source-of-truth for fields absent from base.
  var safeBase = base || {};
  var result = _merge3Value(safeBase, mine, theirs, '');
  return {
    merged: result.value,
    conflicts: result.conflicts
  };
}

/**
 * Apply user resolutions to a merged result.
 *
 * resolutions: array of { path, chosen } where chosen is 'mine' | 'theirs'
 *              and path matches a conflict's path.
 *
 * Walks the merged tree, swapping the value at each path according to
 * the user's choice. Returns a new merged object (does not mutate input).
 */
export function applyResolutions(mergeResult, resolutions) {
  if (!mergeResult || !mergeResult.conflicts) {
    throw new Error('applyResolutions: mergeResult is required');
  }
  if (!Array.isArray(resolutions)) resolutions = [];

  var result = _clone(mergeResult.merged);
  var conflictsById = {};
  mergeResult.conflicts.forEach(function(c) { conflictsById[c.path] = c; });

  resolutions.forEach(function(res) {
    var conflict = conflictsById[res.path];
    if (!conflict) return;
    var newVal = res.chosen === 'theirs' ? conflict.theirs : conflict.mine;
    _setAtPath(result, res.path, newVal);
  });

  return result;
}

/**
 * Set a value at a dotted/bracketed path in an object.
 * Path syntax: "foo.bar[id_123].baz"
 *
 * If newVal is undefined, deletes the key (used for resolving
 * delete-vs-modify conflicts in favor of the deleter).
 *
 * If the path traverses into an array of id-keyed objects, the bracket
 * notation [id] is resolved by walking and matching _idOf(item).
 */
function _setAtPath(root, path, newVal) {
  if (!path) return;
  var tokens = _tokenizePath(path);
  var cur = root;
  for (var i = 0; i < tokens.length - 1; i++) {
    var t = tokens[i];
    if (t.kind === 'key') {
      if (cur[t.value] === undefined || cur[t.value] === null) cur[t.value] = {};
      cur = cur[t.value];
    } else { // kind === 'id'
      var idx = _findIdIndex(cur, t.value);
      if (idx === -1) return; // path no longer exists; skip
      cur = cur[idx];
    }
  }
  var last = tokens[tokens.length - 1];
  if (last.kind === 'key') {
    if (newVal === undefined) delete cur[last.value];
    else cur[last.value] = _clone(newVal);
  } else {
    var lastIdx = _findIdIndex(cur, last.value);
    if (lastIdx === -1) {
      if (newVal !== undefined) cur.push(_clone(newVal));
    } else {
      if (newVal === undefined) cur.splice(lastIdx, 1);
      else cur[lastIdx] = _clone(newVal);
    }
  }
}

function _findIdIndex(arr, id) {
  if (!Array.isArray(arr)) return -1;
  for (var i = 0; i < arr.length; i++) {
    if (_idOf(arr[i]) === id) return i;
  }
  return -1;
}

/**
 * Tokenize a path string into { kind: 'key'|'id', value: string } parts.
 *
 *   "foo.bar[id_123].baz" → [
 *     { kind: 'key', value: 'foo' },
 *     { kind: 'key', value: 'bar' },
 *     { kind: 'id',  value: 'id_123' },
 *     { kind: 'key', value: 'baz' }
 *   ]
 */
function _tokenizePath(path) {
  var tokens = [];
  var i = 0;
  var buf = '';
  while (i < path.length) {
    var ch = path[i];
    if (ch === '.') {
      if (buf) { tokens.push({ kind: 'key', value: buf }); buf = ''; }
      i++;
    } else if (ch === '[') {
      if (buf) { tokens.push({ kind: 'key', value: buf }); buf = ''; }
      var end = path.indexOf(']', i);
      if (end === -1) break;
      tokens.push({ kind: 'id', value: path.substring(i + 1, end) });
      i = end + 1;
    } else {
      buf += ch;
      i++;
    }
  }
  if (buf) tokens.push({ kind: 'key', value: buf });
  return tokens;
}

/**
 * Convenience: summarize a conflict for human reading.
 * Used by the modal in Push B; exposed here for diagnostic use.
 */
export function summarizeConflict(c) {
  var pathParts = c.path.split(/[.\[\]]/g).filter(Boolean);
  var pretty = pathParts.join(' → ');
  var meVal = _previewValue(c.mine);
  var themVal = _previewValue(c.theirs);
  return {
    pretty: pretty,
    mine: meVal,
    theirs: themVal,
    kind: c.kind || 'scalar'
  };
}

function _previewValue(v) {
  if (v === undefined) return '(deleted)';
  if (v === null) return '(empty)';
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 77) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '(' + v.length + ' items)';
  if (typeof v === 'object') {
    var keys = Object.keys(v);
    return '(object: ' + keys.slice(0, 3).join(', ') + (keys.length > 3 ? '…' : '') + ')';
  }
  return String(v);
}

// ── Diagnostic helper ────────────────────────────────────────

/**
 * Console diagnostic surface. Exposed on window._frt_mergeDiag so you can
 * test the merge engine without triggering a real conflict.
 *
 * Usage from console:
 *   _frt_mergeDiag.testBasic()       // runs built-in self-test
 *   _frt_mergeDiag.diff(a, b)        // shows changed paths between two states
 *   _frt_mergeDiag.merge3(b, m, t)   // direct merge
 *   _frt_mergeDiag.simulate()        // takes current Model.getProject(),
 *                                       creates a fake conflict, returns the result
 */
if (typeof window !== 'undefined') {
  window._frt_mergeDiag = {
    merge3: merge3,
    applyResolutions: applyResolutions,
    summarizeConflict: summarizeConflict,
    _clone: _clone,
    _deepEq: _deepEq,
    _tokenizePath: _tokenizePath,

    /**
     * Built-in self-test. Run from console to verify the merge engine
     * works correctly. Logs results; returns pass/fail count.
     */
    testBasic: function() {
      var pass = 0, fail = 0;
      function assert(name, cond) {
        if (cond) { console.log('  ✓', name); pass++; }
        else { console.error('  ✗', name); fail++; }
      }

      console.log('--- merge3 self-test ---');

      // Test 1: no changes → no conflicts
      var base1 = { client: 'ABC', address: '123 Main' };
      var r1 = merge3(base1, _clone(base1), _clone(base1));
      assert('no changes → no conflicts', r1.conflicts.length === 0);
      assert('no changes → result equals base', _deepEq(r1.merged, base1));

      // Test 2: only mine changed → take mine
      var r2 = merge3(base1, { client: 'XYZ', address: '123 Main' }, _clone(base1));
      assert('only mine changed → no conflicts', r2.conflicts.length === 0);
      assert('only mine changed → take mine', r2.merged.client === 'XYZ');

      // Test 3: only theirs changed → take theirs
      var r3 = merge3(base1, _clone(base1), { client: 'XYZ', address: '123 Main' });
      assert('only theirs changed → no conflicts', r3.conflicts.length === 0);
      assert('only theirs changed → take theirs', r3.merged.client === 'XYZ');

      // Test 4: both changed same field → conflict
      var r4 = merge3(base1, { client: 'XYZ', address: '123 Main' }, { client: 'PDQ', address: '123 Main' });
      assert('both changed same field → 1 conflict', r4.conflicts.length === 1);
      assert('conflict path is correct', r4.conflicts[0].path === 'client');

      // Test 5: both changed DIFFERENT fields → no conflict, both kept
      var r5 = merge3(
        { client: 'ABC', address: '123 Main', notes: 'old' },
        { client: 'XYZ', address: '123 Main', notes: 'old' },
        { client: 'ABC', address: '456 Oak',  notes: 'old' }
      );
      assert('both changed different fields → no conflict', r5.conflicts.length === 0);
      assert('both changes preserved', r5.merged.client === 'XYZ' && r5.merged.address === '456 Oak');

      // Test 6: id-keyed array merge — different items modified
      var arrBase = { items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }] };
      var arrMine = { items: [{ id: 'a', n: 99 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }] };
      var arrTheirs = { items: [{ id: 'a', n: 1 }, { id: 'b', n: 88 }, { id: 'c', n: 3 }] };
      var r6 = merge3(arrBase, arrMine, arrTheirs);
      assert('different items modified → no conflict', r6.conflicts.length === 0);
      assert('mine kept on item a', r6.merged.items.find(function(i){return i.id==='a';}).n === 99);
      assert('theirs kept on item b', r6.merged.items.find(function(i){return i.id==='b';}).n === 88);
      assert('item c unchanged', r6.merged.items.find(function(i){return i.id==='c';}).n === 3);

      // Test 7: id-keyed array — same item modified differently
      var r7 = merge3(arrBase,
        { items: [{ id: 'a', n: 99 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }] },
        { items: [{ id: 'a', n: 77 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }] }
      );
      assert('same item changed differently → 1 conflict', r7.conflicts.length === 1);
      assert('conflict path includes item id', r7.conflicts[0].path.indexOf('[a]') >= 0);

      // Test 8: items added on each side
      var r8 = merge3(
        { items: [{ id: 'a', n: 1 }] },
        { items: [{ id: 'a', n: 1 }, { id: 'm1', n: 10 }] },
        { items: [{ id: 'a', n: 1 }, { id: 't1', n: 20 }] }
      );
      assert('items added on both sides → no conflict', r8.conflicts.length === 0);
      assert('both additions preserved', r8.merged.items.length === 3);

      // Test 9: item deleted on one side, untouched on other
      var r9 = merge3(
        { items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] },
        { items: [{ id: 'a', n: 1 }] },  // mine deleted b
        { items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] }
      );
      assert('delete-only → no conflict', r9.conflicts.length === 0);
      assert('delete applied', r9.merged.items.length === 1);

      // Test 10: delete vs modify → conflict
      var r10 = merge3(
        { items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] },
        { items: [{ id: 'a', n: 1 }] },  // mine deleted b
        { items: [{ id: 'a', n: 1 }, { id: 'b', n: 99 }] }  // theirs modified b
      );
      assert('delete-vs-modify → 1 conflict', r10.conflicts.length === 1);
      assert('conflict kind is delete-vs-modify', r10.conflicts[0].kind === 'delete-vs-modify');

      // Test 11: applyResolutions
      var resolved = applyResolutions(r10, [{ path: r10.conflicts[0].path, chosen: 'mine' }]);
      assert('applyResolutions(mine) → delete preserved', !resolved.items.find(function(i){return i.id==='b';}));
      var resolvedT = applyResolutions(r10, [{ path: r10.conflicts[0].path, chosen: 'theirs' }]);
      assert('applyResolutions(theirs) → modification kept', resolvedT.items.find(function(i){return i.id==='b';}).n === 99);

      // Test 12: deep nested conflict path
      var r12 = merge3(
        { contractors: [{ id: 'ctr1', deficiencies: [{ id: 'd1', text: 'A' }] }] },
        { contractors: [{ id: 'ctr1', deficiencies: [{ id: 'd1', text: 'B' }] }] },
        { contractors: [{ id: 'ctr1', deficiencies: [{ id: 'd1', text: 'C' }] }] }
      );
      assert('deep nested conflict detected', r12.conflicts.length === 1);
      assert('deep nested conflict path correct',
        r12.conflicts[0].path === 'contractors[ctr1].deficiencies[d1].text');

      console.log('--- ' + pass + ' passed, ' + fail + ' failed ---');
      return { pass: pass, fail: fail };
    },

    /**
     * Diff two project states: returns a list of paths where they differ.
     * Useful for inspecting "what did I change since the last pull?"
     */
    diff: function(a, b) {
      var changes = [];
      function walk(va, vb, path) {
        if (_deepEq(va, vb)) return;
        if (va === undefined) { changes.push({ path: path, kind: 'added', value: vb }); return; }
        if (vb === undefined) { changes.push({ path: path, kind: 'removed', value: va }); return; }
        if (typeof va !== 'object' || typeof vb !== 'object' ||
            va === null || vb === null) {
          changes.push({ path: path, kind: 'changed', from: va, to: vb });
          return;
        }
        if (Array.isArray(va) && Array.isArray(vb) &&
            _isIdKeyedArray(va) && _isIdKeyedArray(vb)) {
          var ia = _indexById(va), ib = _indexById(vb);
          var allIds = {};
          Object.keys(ia.byId).forEach(function(id){ allIds[id] = true; });
          Object.keys(ib.byId).forEach(function(id){ allIds[id] = true; });
          Object.keys(allIds).forEach(function(id) {
            walk(ia.byId[id], ib.byId[id], path + '[' + id + ']');
          });
          return;
        }
        if (Array.isArray(va) || Array.isArray(vb)) {
          changes.push({ path: path, kind: 'changed', from: va, to: vb });
          return;
        }
        var keys = {};
        Object.keys(va).forEach(function(k){ keys[k] = true; });
        Object.keys(vb).forEach(function(k){ keys[k] = true; });
        Object.keys(keys).forEach(function(k) {
          walk(va[k], vb[k], path ? path + '.' + k : k);
        });
      }
      walk(a, b, '');
      return changes;
    },

    /**
     * Simulate a conflict on the current project. Takes the current
     * Model.getProject() state, fabricates a "their" state that differs,
     * and runs merge3. Returns the result. Does not modify any state.
     *
     * Usage: window._frt_mergeDiag.simulate()
     */
    simulate: function() {
      var Model = window.Model;
      if (!Model || !Model.getProject) {
        console.error('Model not on window — cannot simulate.');
        return null;
      }
      var current = Model.getProject();
      if (!current) {
        console.error('No project loaded.');
        return null;
      }
      var base = _clone(current);
      var mine = _clone(current);
      mine.client = (mine.client || '') + ' [me-edit]';
      var theirs = _clone(current);
      theirs.address = (theirs.address || '') + ' [them-edit]';
      var result = merge3(base, mine, theirs);
      console.log('Simulated merge:', result.conflicts.length, 'conflicts');
      console.log('  Result:', result);
      return result;
    }
  };
}
