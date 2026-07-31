/* ARENCON /lib/ — Sync Engine (S446 extraction)
   From FRT frt/js/data/sync.js at current HEAD. Parameterized:
     • toolKey    — was hardcoded 'frt' (config.toolKey; defaults 'frt')
     • model      — the CANONICAL 4-method adapter, injected (not imported):
         { getProject(), setProject(p), applyMerged(p), saveNow?() }
       The Step-2 outbox's {getProject, saveNow?} is a strict subset — same
       object satisfies both.
     • Auth, IDB, BinaryOutbox, SyncWorkerHost — injected instances.
   Supabase URL/anon come from the injected Auth (same fallbacks as FRT).
   Everything else VERBATIM incl. S426 stale-writer guard + S440 repaint. */

/**
 * ARENCON FRT v2 — Sync Engine
 * ════════════════════════════
 * 
 * Loads/saves project data from Supabase tool_data table.
 * Backward compatible with v1 CloudSync format.
 *
 * S123 Push 6B — sync atomicity:
 *   - Tracks _lastSeenUpdatedAt + _lastSeenSnapshot after every pull/push.
 *   - On push, sends `If-Match: "<updated_at>"` header so PostgREST returns
 *     412 Precondition Failed if the row changed since we last saw it.
 *   - On 412, calls SyncEngine.onConflict(localData, cloudData, baseSnapshot)
 *     which runs merge3 (data/merge.js) and either:
 *       - Auto-retries with merged data if no conflicts (silent merge)
 *       - Surfaces conflicts to app.js via the onConflict callback, which
 *         shows the modal and resolves to a merged-with-resolutions object,
 *         then retries the push.
 *   - Bounded retry: 3 attempts max. After that, returns null + warns.
 *
 * S124 A3 — sync hardening:
 *   - _lastSeenUpdatedAt + _lastSeenSnapshot now persisted to IDB store
 *     `syncMeta` after every pull AND push. Key shape:
 *       `<toolKey>:<projectId>:<instanceId|_default>`
 *   - On pull(): IDB record is restored BEFORE the network call. If the
 *     network pull succeeds, the snapshot is overwritten with cloud data.
 *     If the network pull fails (offline), the IDB-restored snapshot
 *     remains in memory so the next push still sends a valid If-Match.
 *   - Closes the S123 "first save after reload skips precondition" gap.
 */

export function createSync(config) {
  config = config || {};
  var Auth           = config.Auth;
  var IDB            = config.IDB;
  var model          = config.model;
  var BinaryOutbox   = config.BinaryOutbox;
  var SyncWorkerHost = config.SyncWorkerHost;
  // S491 — optional per-tool hook: called with the count of zero-source
  // photos the S462 rescue stage could not recover on this device.
  var onPhotoAttention = config.onPhotoAttention;
  if (!Auth || !IDB || !model || !SyncWorkerHost) {
    throw new Error('[lib/sync] createSync requires { toolKey?, Auth, IDB, model, SyncWorkerHost, BinaryOutbox? }');
  }
  ['getProject','setProject','applyMerged'].forEach(function(fn){
    if (typeof model[fn] !== 'function') {
      throw new Error('[lib/sync] model.' + fn + '() is required (canonical adapter)');
    }
  });


// S132 — the direct merge3 import was removed: since S128 P-6 the 3-way
// merge runs in the sync worker (SyncWorkerHost.merge3Worker), so sync.js
// never calls merge3() directly. The engine still lives in data/merge.js.
// S171 (Fix A) — outbox integration. Push strips photos that originated
// in the local outbox before serialize; pull/merge call reconcileWithModel
// to repair any photos a wholesale-replace would have lost. Activation
// gated by BinaryOutbox.isEnabled() so PROD pushers/pullers see no change.

// S165 — like the anon key above, the URL also lives in Auth (single source of truth).
// Auth's URL is computed at module load and reflects staging vs prod based on ?staging=1
// in the URL. Reading it dynamically prevents the S125 #1 class of bug where a copy here
// would drift from Auth.
function _url() {
  return (Auth && Auth.SUPABASE_URL) ? Auth.SUPABASE_URL : 'https://xsemvinxsyphjiaqgywv.supabase.co';
}
// S125 #1 — The anon key was rotated in early March 2026 but the copy here
// was missed, causing every PATCH to return 401 "Invalid API key" while
// pulls (which use Auth.request) worked fine. Cloud saves silently failed
// for ~6 weeks. Durable fix: ALWAYS read the live anon key from the Auth
// module — single source of truth. Never store a copy here again.
function _anonKey() {
  return (Auth && Auth.SUPABASE_ANON_KEY) ? Auth.SUPABASE_ANON_KEY : '';
}

var _instanceId = null;
var _instanceNumber = 1;
var _toolKey = (config.toolKey || 'frt');
var _pendingSync = false;
var _online = navigator.onLine;

// S123 P6B — optimistic-concurrency tracking
// Set after every successful pull AND every successful push. Used as the
// If-Match header on the next push, and as the "common ancestor" snapshot
// in 3-way merge when we hit 412.
// S124 A3 — also persisted to IDB store `syncMeta` so reload between pull
// and push doesn't lose the snapshot.
var _lastSeenUpdatedAt = null;
var _lastSeenSnapshot = null;

// S126 Phase C — Sync atomicity: empty-array clobber guard.
//
// THE PROBLEM:
//   A cloud row can arrive with `drawings: []`, `photos: []`, `contractors: []`
//   even when the local model has populated arrays. Causes include:
//   (a) A concurrent push from another instance that itself had empty arrays
//       (e.g. brand-new instance for the same project)
//   (b) A migration / cleanup pass that emptied an array but isn't yet
//       reconciled with the local model
//   (c) A merged result that legitimately ended up empty for those arrays
//       (rare, but possible)
//   Without a guard, pull() → model.setProject(cloudData) wipes the local
//   data even when the user has unsaved drawings/photos/contractors.
//
// THE GUARD:
//   Before handing cloud data to model.setProject or model.applyMerged, walk
//   four sensitive arrays (drawings, photos, contractors, sitePhotos — the
//   legacy field still seen on pre-S114 projects). For each: if cloud has
//   an empty array AND local has a non-empty array, splice the local array
//   back into the incoming cloud data. Counter increments per guard fire so
//   we can see in field deployment whether this is actually triggering.
//
// WHY NOT JUST FIX IT IN merge3:
//   merge3 already protects against the case where both sides have data —
//   it walks id-keyed arrays per-item. The clobber window we're closing is
//   the direct pull path (no merge happens, cloud is taken whole) and the
//   silent-merge path (where merge3 could legitimately produce an empty
//   array if the cloud version did and base/local agreed on a delete that
//   the local hasn't actually performed yet). The guard is defense-in-depth
//   for cases the merge engine can't distinguish from intentional deletes.
//
// DIAGNOSTIC COUNTERS:
//   Available as window._frt.diagnostics.sync.emptyArrayGuards after Phase D
//   loads. Pre-Phase D: visible via SyncEngine.diag (defined at module
//   bottom).
var _emptyArrayGuardFires = 0;
var _emptyArrayGuardLog = [];
// S524 DOCTRINE I-2 — the guarded set was FRT-only field names, which meant
// the Diesel/Electric tools ran the pull path with NO absence protection at
// all. That is the 7155.40 mechanism: a gutted cloud copy was pulled down
// over a device holding real work. Absence never deletes — extend coverage to
// every content-bearing array in every tool. Fields absent from a given tool's
// payload are simply skipped by the guards (Array.isArray checks), so listing
// all tools' fields here is safe for all tools.
var _GUARDED_ARRAY_FIELDS = [
  // FRT
  'drawings', 'photos', 'contractors', 'sitePhotos', 'generalDeficiencies',
  // Diesel / Electric commissioning
  'recordPhotos', 'pldData', 'stdData', 'batData', 'contractorSignRows',
  'pumpCurvePoints', 'pldPumpCurvePoints'
];

// ── B1 (S339+): photo badge stamp for Hub read-through ──────────────
// Stamps each photo with badgeText + badgeType so the Hub can render the
// SAME badge FRT shows, by reading these fields verbatim (Hub never derives).
// Logic ported from photos.js gallery records builder. Runs on the push
// CLONE only. Pool+selection model: photos live in d.photos; each obs has
// photoSelection (id array) or null (= whole pool).
function _stampPhotoBadges(data) {
  if (!data) return;
  function _typeFromCtx(defic, o, isSiteRecordPin) {
    if (o && o.addressed) return 'closed';
    if (o && o.isRecommendation) return 'recommendations';
    if (isSiteRecordPin) return 'site';
    var pri = (o && o.priority) || (defic && defic.priority) || 'high';
    return (pri === 'low' || pri === 'general') ? 'low' : 'high';
  }
  function _stampDefic(defic, contractorId) {
    if (!defic) return;
    var isSiteRecordPin = (contractorId == null);
    var pool = Array.isArray(defic.photos) ? defic.photos : [];
    var byId = {};
    pool.forEach(function(p) { if (p && p.id != null) byId[p.id] = p; });
    var allIds = pool.map(function(p) { return p && p.id; });
    (defic.observations || []).forEach(function(o, oi) {
      var btype = _typeFromCtx(defic, o, isSiteRecordPin);
      var label = 'Obs ' + defic.num + String.fromCharCode(65 + oi);
      var ids = Array.isArray(o.photoSelection) ? o.photoSelection : allIds;
      ids.forEach(function(id) {
        var ph = byId[id];
        if (ph) { ph.badgeText = label; ph.badgeType = btype; }
      });
    });
    // Pool photos not referenced by any obs (rare) — give a defic-level badge.
    pool.forEach(function(ph) {
      if (ph && !ph.badgeText) {
        ph.badgeText = 'Obs ' + defic.num;
        ph.badgeType = _typeFromCtx(defic, null, isSiteRecordPin);
      }
    });
  }
  (data.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(function(d) { _stampDefic(d, c.id); });
  });
  (data.generalDeficiencies || []).forEach(function(d) { _stampDefic(d, null); });
  // Site pool: FRT stores it in data.photos (top-level); legacy used sitePhotos.
  (data.photos || []).forEach(function(ph) {
    if (ph && !ph.badgeText) { ph.badgeText = 'Site'; ph.badgeType = 'site'; }
  });
  (data.sitePhotos || []).forEach(function(ph) {
    if (ph) { ph.badgeText = 'Site'; ph.badgeType = 'site'; }
  });
}


// S189 V-2 — Array-shrinkage clobber guard. Extends the S126 Phase C empty-
// array guard to catch the cloud-shorter-than-local case: cloud delivers an
// array that is a STRICT SUBSET (by id) of the local array.
//
// THE 4380.24 PROPAGATION PATTERN:
//   A misbehaving device (e.g. legacy v1 client that stripped pins, or any
//   future bug that silently drops items) pushes a shrunk array to cloud.
//   On the next fresh-sign-in or initial pull on any OTHER device:
//     pull() -> setProject(cloudData) -> local 14 drawings becomes cloud's 9
//   The good device's healthy local state is overwritten by the bad device's
//   shrunk state. This is how a single misbehaving device propagates loss
//   across the fleet.
//
// THE GUARD (pull path only, NOT silentMerge):
//   When cloud's array is STRICTLY SHORTER than local AND every cloud id is
//   present in local (true subset), refuse to apply. Restore the local array
//   into cloudData so setProject() preserves it. Counter + log + console.error
//   + user toast: this is an integrity event, not a routine sync.
//
// FALSE-POSITIVE PROFILE:
//   Legitimate delete on Device A propagates to Device B's pull. Guard would
//   fire on Device B's first pull. User sees toast; they can manually delete
//   on Device B too. Tradeoff: protects against silent loss at the cost of
//   surfacing intentional deletes for manual reconciliation. Considered
//   acceptable per S158/S188 risk weighting (loss > false-positive friction).
//
// WHY NOT IN silentMerge:
//   merge3 already does per-id reconciliation. If its output is shorter than
//   local, that's intentional (e.g. tombstoned deletes converged). Re-
//   guarding would block legitimate merge work.
//
// EDGE CASES:
//   - Cloud array empty: handled by _guardEmptyArrays, skip here.
//   - Cloud items without ids: cannot make subset judgment, skip (let merge handle).
//   - Cloud has ids local doesn't: NOT subset (concurrent edits), let through.
//   - Same length: pre-skipped (no shrinkage).
var _arrayShrinkageGuardFires = 0;
var _arrayShrinkageGuardLog = [];

function _guardEmptyArrays(cloudData, label) {
  if (!cloudData || typeof cloudData !== 'object') return cloudData;
  var localProj = model.getProject();
  if (!localProj) return cloudData;
  _GUARDED_ARRAY_FIELDS.forEach(function(field) {
    var cloudArr = cloudData[field];
    var localArr = localProj[field];
    // Cloud has an EMPTY array AND local has a NON-EMPTY array → preserve local
    if (Array.isArray(cloudArr) && cloudArr.length === 0 &&
        Array.isArray(localArr) && localArr.length > 0) {
      cloudData[field] = JSON.parse(JSON.stringify(localArr));
      _emptyArrayGuardFires++;
      var entry = {
        at: new Date().toISOString(),
        path: label + '.' + field,
        rescued: localArr.length
      };
      _emptyArrayGuardLog.push(entry);
      // Cap log at 50 entries to bound memory
      if (_emptyArrayGuardLog.length > 50) _emptyArrayGuardLog.shift();
      console.warn('[Sync C-guard] Cloud delivered empty ' + field +
                   '; preserved local (' + localArr.length + ' items). Path: ' + label);
    }
  });
  return cloudData;
}

// S524 DOCTRINE I-2 — CONTENT-COLLAPSE GUARD.
// The empty-array and subset guards both reason about ITEM COUNT. The 7155.40
// wipe kept the arrays at full length and emptied the VALUES inside them
// (7 flow rows still present, every reading blank) and emptied the checklist
// object. Count-based guards see no shrinkage and let it through.
// Rule: if local holds real content in a structure and the incoming cloud copy
// holds none, the incoming copy is stale/partial — never a delete instruction.
// Preserve local for that structure. Conservative by design: fires only on a
// TOTAL collapse against a local that has meaningful content, and fails open
// on any unexpected shape so field work is never blocked.
var _contentCollapseGuardFires = 0;
var _contentCollapseGuardLog = [];

function _countRowValues(arr) {
  if (!Array.isArray(arr)) return -1;
  var n = 0;
  arr.forEach(function(row) {
    if (!row || typeof row !== 'object') return;
    Object.keys(row).forEach(function(k) {
      if (k === 'id' || k === 'pct' || k === 'label') return;   // structural, not data
      var v = row[k];
      if (typeof v === 'string' && v.trim() !== '') n++;
      else if (typeof v === 'number' && v !== 0) n++;
      else if (Array.isArray(v) && v.length > 0) n++;
    });
  });
  return n;
}

function _countAnswered(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return -1;
  var n = 0;
  Object.keys(obj).forEach(function(k) {
    var v = obj[k];
    if (v && typeof v === 'object' && v.status != null && v.status !== '') n++;
  });
  return n;
}

function _guardContentCollapse(cloudData, label) {
  try {
    if (!cloudData || typeof cloudData !== 'object') return cloudData;
    var localProj = model.getProject();
    if (!localProj) return cloudData;

    // Value-bearing row arrays (flow-test data, battery data, sign-off rows)
    ['pldData', 'stdData', 'batData', 'contractorSignRows'].forEach(function(field) {
      var localN = _countRowValues(localProj[field]);
      var cloudN = _countRowValues(cloudData[field]);
      if (localN >= 3 && cloudN === 0) {
        cloudData[field] = JSON.parse(JSON.stringify(localProj[field]));
        _contentCollapseGuardFires++;
        _contentCollapseGuardLog.push({ at: new Date().toISOString(), path: label + '.' + field, rescued: localN });
        if (_contentCollapseGuardLog.length > 50) _contentCollapseGuardLog.shift();
        console.warn('[Sync I-2 collapse-guard] Cloud delivered hollowed ' + field +
                     '; preserved local (' + localN + ' values). Path: ' + label);
      }
    });

    // Answered-checklist object
    var localA = _countAnswered(localProj.clState);
    var cloudA = _countAnswered(cloudData.clState);
    if (localA >= 3 && cloudA === 0) {
      cloudData.clState = JSON.parse(JSON.stringify(localProj.clState));
      _contentCollapseGuardFires++;
      _contentCollapseGuardLog.push({ at: new Date().toISOString(), path: label + '.clState', rescued: localA });
      if (_contentCollapseGuardLog.length > 50) _contentCollapseGuardLog.shift();
      console.warn('[Sync I-2 collapse-guard] Cloud delivered emptied clState; preserved local (' +
                   localA + ' answers). Path: ' + label);
    }
  } catch (e) {
    console.warn('[Sync I-2 collapse-guard] skipped (unexpected shape):', e && e.message);
  }
  return cloudData;
}

// ═══════════════════════════════════════════════════════════════════════
// S524 DOCTRINE I-3 — PER-ITEM TIMESTAMPS, NEWEST-WINS-REPLACE (Phase 2).
// Whole-document last-write-wins is forbidden by doctrine. Each content item
// carries _ts (last content-change, ms epoch); the pull path merges item by
// item: a newer edit REPLACES the older value outright (never fill-only);
// absence without a tombstone never deletes (I-2); items the device edited
// since its last sync (dirty) always survive a stale pull.
//   • Stamping happens centrally at push time by diffing the collected state
//     against _lastSeenSnapshot — no host-tool edit sites to instrument.
//     Items without _ts (all pre-S524 reports) are treated as epoch 0:
//     lazy migration, no DB rewrite needed.
//   • Enabled per tool via _LWW_SPECS. Diesel/Electric are live now; FRT
//     activates after its two-device acceptance test (doctrine gate) —
//     until then FRT keeps the Phase-1 guard behavior unchanged.
// ═══════════════════════════════════════════════════════════════════════
var _LWW_SPECS = {
  diesel: {
    arrays: {
      recordPhotos:       { key: 'id' },
      // S531: flow-test photo arrays brought under per-item protection. These
      // were the ONLY photo arrays left outside it, and they are exactly what
      // went missing on 7155.40 — three inspectors on one report, flow photos
      // present on one device and absent from the cloud copy that won. Both
      // arrays are id-keyed (host backfills legacy entries at collect time).
      flowTestPhotos:     { key: 'id' },
      flowTestPhotosPld:  { key: 'id' },
      pldData:            { key: 'pct' },
      stdData:            { key: 'pct' },
      batData:            { key: 'id' },
      contractorSignRows: { key: 'id' },
      // S532: the last unprotected structures. Host assigns permanent ids at
      // collect time (legacy reports migrate on first save), so these can now be
      // keyed by identity instead of by list position.
      generalDeficiencies:{ key: 'id', nested: { responses: { key: 'id' } } },   // S538
      sketchEntries:      { key: 'id' }
    },
    // S532: object-of-arrays shape — `deficiencies` is keyed by contractor name,
    // each value a list of deficiencies. Same per-item rules as `arrays`, applied
    // inside each contractor's list; a contractor present only locally is kept
    // (absence never deletes, doctrine I-2).
    arrayMaps: {
      // S538: responses nested inside each deficiency, so a contractor reply and
      // a consultant reply entered on different devices both survive.
      deficiencies:       { key: 'id', nested: { responses: { key: 'id' } } }
    },
    statusMaps: ['clState'],
    fieldMaps:  ['proj']
  },
  electric: null,  // set = diesel below (identical data shapes)
  // ═══════════════════════════════════════════════════════════════════════
  // S535 — FRT ACTIVATED. Previously held back pending a two-device
  // acceptance test. The test was never the real safeguard; correct keying is,
  // and _lwwKeyable now enforces that mechanically: any list whose items lack
  // unique stable identities sits out and keeps the pre-existing behaviour.
  // That makes activation strictly additive — a structure either gains correct
  // per-item protection or gains nothing. It CANNOT gain wrong protection, and
  // a field name that turns out not to match simply does nothing.
  //
  // Without this, FRT was the tool with NO cover for partial loss: the server
  // wipe guard only trips on near-total erasure, so losing some readings or
  // most-but-not-all photos passed silently. Diesel has been covered since
  // S524; this closes the same gap for the flagship.
  //
  // `contractors` merges as whole entries, so two people editing deficiencies
  // under the SAME contractor still resolve to the later save for that
  // contractor. That is coarse, but strictly better than the previous
  // behaviour, where the cloud copy replaced the entire contractor list
  // outright. Nesting deficiencies properly is follow-up work.
  frt: {
    arrays: {
      photos:              { key: 'id' },
      // S538: deficiencies live INSIDE their contractor. Without this, two people
      // editing different deficiencies for the same contractor lost one of them.
      contractors:         { key: 'id', nested: { deficiencies: { key: 'id' } } },
      generalDeficiencies: { key: 'id', nested: { observations: { key: 'id' } } },
      // S539: Field Heights rows live inside their drawing and now carry
      // permanent names, so an added row and an edited row on two devices both
      // survive instead of the whole drawing resolving to the later save.
      drawings:            { key: 'id', nested: { heights: { key: 'id' } } },
      sketches:            { key: 'id' }
    },
    statusMaps: [],
    fieldMaps:  ['info', 'signatures']
  }
};
_LWW_SPECS.electric = _LWW_SPECS.diesel;

function _lwwStrip(o) {
  // Content-equality comparison must ignore the bookkeeping fields themselves.
  return JSON.stringify(o, function (k, v) {
    return (k === '_ts' || k === '_fts') ? undefined : v;
  });
}

// ═══════════════════════════════════════════════════════════════════════
// S538 — NESTED LISTS. Some structures hold their real content one level down:
// in FRT a deficiency lives INSIDE its contractor, so treating a contractor as
// one indivisible item meant two people editing DIFFERENT deficiencies for the
// SAME contractor resolved to whoever saved last — and the other edit was gone.
// Diesel had the equivalent through responses inside a deficiency.
//
// A parent entry is now compared on its OWN content only, with its nested lists
// excluded, and those nested lists are merged in their own right. The parent's
// scalars resolve by parent timestamp; its children resolve child by child. So
// Ian editing Acme deficiency 2 and Stacy editing Acme deficiency 5 both survive.
//
// The identity rule from S535 applies at every level: a nested list whose items
// lack unique stable names is left exactly as the winning parent had it, rather
// than being paired by position.
// ═══════════════════════════════════════════════════════════════════════
function _lwwStripNested(o, nested) {
  var drop = nested ? Object.keys(nested) : [];
  if (!drop.length) return _lwwStrip(o);
  return JSON.stringify(o, function (k, v) {
    if (k === '_ts' || k === '_fts') return undefined;
    if (drop.indexOf(k) !== -1) return undefined;
    return v;
  });
}
function _lwwKey(item, keyField, idx) {
  var k = item && item[keyField];
  return (k === undefined || k === null || k === '') ? ('#' + idx) : String(k);
}

// ═══════════════════════════════════════════════════════════════════════
// S535 — NO POSITIONAL KEYS. _lwwKey falls back to '#<index>' when an item
// carries no identity. That fallback is the single most dangerous line in this
// engine: position is not identity. Insert one deficiency at the top of a list
// on device A and every later entry shifts, so device B's edit to "the third
// one" gets paired with a DIFFERENT record and overwrites it. Legacy reports
// (anything written before ids were assigned to that structure) are full of
// such items, and no amount of care in the specs prevents it — the spec cannot
// know whether a given report has been migrated yet.
//
// Rule: an array is eligible for per-item merging ONLY if every live item
// carries a non-empty key AND those keys are unique. Anything else falls back
// to the pre-existing guard behaviour, which is conservative but never pairs
// the wrong two records. This makes switching a tool on strictly additive: the
// worst case is that a structure gets no new protection, never that it gets
// wrong protection. It is also what makes writing a spec for a tool safe before
// its data model has been fully migrated — an un-migrated structure simply sits
// out until it has ids.
function _lwwKeyable(arr, keyField) {
  if (!Array.isArray(arr)) return false;
  var seen = {}, n = 0;
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    if (!it || typeof it !== 'object') continue;
    var k = it[keyField];
    if (k === undefined || k === null || k === '') return false;   // no identity
    k = String(k);
    if (seen[k]) return false;                                     // ambiguous identity
    seen[k] = true; n++;
  }
  return true;   // empty arrays are trivially safe
}
// Both sides must be keyable: a keyed local against an unkeyed cloud copy (or
// the reverse) still cannot be paired reliably.
function _lwwPairable(keyField) {
  for (var i = 1; i < arguments.length; i++) {
    var a = arguments[i];
    if (a == null) continue;
    if (!_lwwKeyable(a, keyField)) return false;
  }
  return true;
}

// S524 HOTFIX helpers — see the boot-skeleton incident notes at the merge
// call sites. An item is "empty" when it carries no non-trivial scalar
// content and no nested items beyond structural keys.
function _lwwItemEmpty(item) {
  if (!item || typeof item !== 'object') return true;
  var keys = Object.keys(item);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === 'id' || k === 'pct' || k === 'label' || k === '_ts') continue;
    var v = item[k];
    if (typeof v === 'string' && v.trim() !== '') return false;
    if (typeof v === 'number' && v !== 0) return false;
    if (v === true) return false;
    if (Array.isArray(v) && v.length > 0) return false;
    if (v && typeof v === 'object' && Object.keys(v).length > 0) return false;
  }
  return true;
}
function _lwwHasDeleteEvidence(item) {
  return !!(item && (item.deleted === true || item.purged === true ||
            (item.delState && item.delState !== 'live') ||
            (item.delAt && item.delAt !== '') ||
            (item.deletedDate && item.deletedDate !== '')));
}

// Stamp _ts onto changed items of a push clone by diffing vs prevData
// (the last-seen snapshot). Unchanged items carry their previous _ts forward.
function _stampLWW(data, prevData) {
  var spec = _LWW_SPECS[_toolKey];
  if (!spec || !data) return data;
  var now = Date.now();
  var prev = prevData || {};
  try {
    Object.keys(spec.arrays).forEach(function (field) {
      var arr = data[field];
      if (!Array.isArray(arr)) return;
      // S535: do not stamp an array we would refuse to merge — a _ts on an
      // unkeyable item is a claim the merge cannot honour.
      if (!_lwwKeyable(arr, spec.arrays[field].key)) return;
      var prevIdx = {};
      (Array.isArray(prev[field]) ? prev[field] : []).forEach(function (p, i) {
        prevIdx[_lwwKey(p, spec.arrays[field].key, i)] = p;
      });
      var nestedSpec = spec.arrays[field].nested || null;   // S538
      arr.forEach(function (item, i) {
        if (!item || typeof item !== 'object') return;
        var p = prevIdx[_lwwKey(item, spec.arrays[field].key, i)];
        // S538: stamp each nested list on its own terms first.
        if (nestedSpec) {
          Object.keys(nestedSpec).forEach(function (cf) {
            var carr = item[cf];
            if (!Array.isArray(carr)) return;
            var ckey = nestedSpec[cf].key;
            if (!_lwwKeyable(carr, ckey)) return;
            var cprev = {};
            var pc = (p && Array.isArray(p[cf])) ? p[cf] : [];
            pc.forEach(function (x, xi) { cprev[_lwwKey(x, ckey, xi)] = x; });
            carr.forEach(function (citem, ci) {
              if (!citem || typeof citem !== 'object') return;
              var px = cprev[_lwwKey(citem, ckey, ci)];
              if (px && _lwwStrip(px) === _lwwStrip(citem)) citem._ts = px._ts || citem._ts || 0;
              else citem._ts = now;
            });
          });
        }
        // Parent compares on its OWN content — a child edit must not make the
        // whole parent look newer, or it would win and discard the other side's
        // parent-level scalars.
        if (p && _lwwStripNested(p, nestedSpec) === _lwwStripNested(item, nestedSpec)) item._ts = p._ts || item._ts || 0;
        else item._ts = now;
      });
    });
    // S532 — object-of-arrays (deficiencies keyed by contractor). Deliberately a
    // MIRROR of the plain-array loop above rather than a refactor of it: that loop
    // is field-proven since S524, and rewriting it to share a helper would put the
    // whole protected set at risk for a cosmetic gain. Keep the two in step.
    Object.keys(spec.arrayMaps || {}).forEach(function (field) {
      var map = data[field];
      if (!map || typeof map !== 'object' || Array.isArray(map)) return;
      var keyF = spec.arrayMaps[field].key;
      var pmap = (prev[field] && typeof prev[field] === 'object' && !Array.isArray(prev[field])) ? prev[field] : {};
      Object.keys(map).forEach(function (grp) {
        var arr = map[grp];
        if (!Array.isArray(arr)) return;
        if (!_lwwKeyable(arr, keyF)) return;   // S535
        var prevIdx = {};
        (Array.isArray(pmap[grp]) ? pmap[grp] : []).forEach(function (p, i) {
          prevIdx[_lwwKey(p, keyF, i)] = p;
        });
        var nSpec = spec.arrayMaps[field].nested || null;   // S538
        arr.forEach(function (item, i) {
          if (!item || typeof item !== 'object') return;
          var p = prevIdx[_lwwKey(item, keyF, i)];
          if (nSpec) {
            Object.keys(nSpec).forEach(function (cf) {
              var carr = item[cf]; if (!Array.isArray(carr)) return;
              var ckey = nSpec[cf].key; if (!_lwwKeyable(carr, ckey)) return;
              var cprev = {}; var pc = (p && Array.isArray(p[cf])) ? p[cf] : [];
              pc.forEach(function (x, xi) { cprev[_lwwKey(x, ckey, xi)] = x; });
              carr.forEach(function (ci2, ci) {
                if (!ci2 || typeof ci2 !== 'object') return;
                var px = cprev[_lwwKey(ci2, ckey, ci)];
                if (px && _lwwStrip(px) === _lwwStrip(ci2)) ci2._ts = px._ts || ci2._ts || 0;
                else ci2._ts = now;
              });
            });
          }
          if (p && _lwwStripNested(p, nSpec) === _lwwStripNested(item, nSpec)) item._ts = p._ts || item._ts || 0;
          else item._ts = now;
        });
      });
    });
    spec.statusMaps.forEach(function (field) {
      var map = data[field];
      if (!map || typeof map !== 'object' || Array.isArray(map)) return;
      var pmap = (prev[field] && typeof prev[field] === 'object') ? prev[field] : {};
      Object.keys(map).forEach(function (k) {
        var v = map[k];
        if (!v || typeof v !== 'object') return;
        var pv = pmap[k];
        if (pv && _lwwStrip(pv) === _lwwStrip(v)) v._ts = pv._ts || v._ts || 0;
        else v._ts = now;
      });
    });
    spec.fieldMaps.forEach(function (field) {
      var obj = data[field];
      if (!obj || typeof obj !== 'object') return;
      var pobj = (prev[field] && typeof prev[field] === 'object') ? prev[field] : {};
      var pfts = (prev._fts && prev._fts[field]) || {};
      var fts = {};
      Object.keys(obj).forEach(function (k) {
        if (JSON.stringify(obj[k]) === JSON.stringify(pobj[k])) fts[k] = pfts[k] || 0;
        else fts[k] = now;
      });
      data._fts = data._fts || {};
      data._fts[field] = fts;
    });
  } catch (e) {
    console.warn('[Sync I-3] stamping skipped (unexpected shape):', e && e.message);
  }
  return data;
}

// Per-item merge of an incoming cloud copy against the live local project.
// localSnap = _lastSeenSnapshot (what local last synced) for dirty detection.
// Returns the merged data object to hand to setProject. Fails open: any
// error returns cloudData unmodified (Phase-1 guards already ran on it).

// S538 — ONE nested-list merge, called by both the plain-array loop and the
// contractor-keyed loop. Written as a helper deliberately: the alternative was a
// third hand-maintained copy of the same rule, which is exactly the pattern that
// let general-deficiency photos go unprotected for months.
function _lwwMergeNestedChildren(l, c, s, nestedSpec, stats, now) {
  if (!nestedSpec) return null;
  var out = {};
  Object.keys(nestedSpec).forEach(function (cf) {
    var ckey = nestedSpec[cf].key;
    var cl = Array.isArray(l[cf]) ? l[cf] : null;
    var cc = Array.isArray(c[cf]) ? c[cf] : null;
    var cs = (s && Array.isArray(s[cf])) ? s[cf] : [];
    if (!cl && !cc) return;
    if (!cl) { out[cf] = cc; return; }
    if (!cc) { out[cf] = cl; return; }
    if (!_lwwPairable(ckey, cl, cc, cs)) {          // S535 rule applies at every level
      stats.skippedUnkeyed = (stats.skippedUnkeyed || 0) + 1;
      return;                                       // winning parent supplies this list
    }
    var cSnap = {}, cCloud = {}, cLocal = {}, cOrder = [], cSeen = {};
    cs.forEach(function (x, xi) { cSnap[_lwwKey(x, ckey, xi)] = x; });
    cc.forEach(function (x, xi) { var k = _lwwKey(x, ckey, xi); cCloud[k] = x; cOrder.push(k); cSeen[k] = true; });
    cl.forEach(function (x, xi) { var k = _lwwKey(x, ckey, xi); if (!cSeen[k]) { cOrder.push(k); cSeen[k] = true; } });
    cl.forEach(function (x, xi) { cLocal[_lwwKey(x, ckey, xi)] = x; });
    var outC = [];
    cOrder.forEach(function (k) {
      var xc = cCloud[k], xl = cLocal[k], xs = cSnap[k];
      if (xc && xl) {
        if (_lwwItemEmpty(xl) && !_lwwItemEmpty(xc) && !_lwwHasDeleteEvidence(xl)) { outC.push(xc); return; }
        var xDirty = !xs || _lwwStrip(xs) !== _lwwStrip(xl);
        var xlTs = xDirty ? now : ((xl._ts) || (xs && xs._ts) || 0);
        outC.push(((xc._ts || 0) > xlTs) ? xc : xl);
      } else if (xl && !xc) { outC.push(xl); stats.keptLocalAbsent++; }
      else if (xc && !xl) { outC.push(xc); stats.tookCloudNew++; }
    });
    out[cf] = outC;
  });
  return out;
}

var _lwwMergeStats = null;
function _mergeLWW(localProj, cloudData, localSnap) {
  var spec = _LWW_SPECS[_toolKey];
  if (!spec || !localProj || !cloudData) return cloudData;
  try {
    var now = Date.now();
    var snap = localSnap || {};
    var stats = { replacedFromCloud: 0, keptLocalDirty: 0, keptLocalAbsent: 0, tookCloudNew: 0 };

    Object.keys(spec.arrays).forEach(function (field) {
      var keyF = spec.arrays[field].key;
      var localArr = Array.isArray(localProj[field]) ? localProj[field] : null;
      var cloudArr = Array.isArray(cloudData[field]) ? cloudData[field] : null;
      if (!localArr && !cloudArr) return;
      // S535: both sides must be identity-keyable or this array sits out and
      // keeps its pre-existing behaviour. Never pair records by position.
      if (!_lwwPairable(keyF, localArr, cloudArr, snap[field])) {
        stats.skippedUnkeyed = (stats.skippedUnkeyed || 0) + 1;
        return;
      }
      var snapIdx = {}, cloudIdx = {}, order = [], seen = {};
      (Array.isArray(snap[field]) ? snap[field] : []).forEach(function (p, i) {
        snapIdx[_lwwKey(p, keyF, i)] = p;
      });
      (cloudArr || []).forEach(function (c, i) {
        var k = _lwwKey(c, keyF, i);
        cloudIdx[k] = c;
        order.push(k); seen[k] = true;
      });
      (localArr || []).forEach(function (l, i) {
        var k = _lwwKey(l, keyF, i);
        if (!seen[k]) { order.push(k); seen[k] = true; }
      });
      var localIdx = {};
      (localArr || []).forEach(function (l, i) { localIdx[_lwwKey(l, keyF, i)] = l; });

      var merged = [];
      order.forEach(function (k) {
        var c = cloudIdx[k], l = localIdx[k], s = snapIdx[k];
        if (c && l) {
          // S524 HOTFIX — DOCTRINE I-2 INSIDE THE MERGE: emptiness is never an
          // edit. A blank local item (boot skeleton / unloaded row) with no
          // deletion evidence takes the cloud item OUTRIGHT — not via
          // timestamps, where a tie would let the blank win.
          if (_lwwItemEmpty(l) && !_lwwItemEmpty(c) && !_lwwHasDeleteEvidence(l)) {
            merged.push(c); stats.replacedFromCloud++;
            return;
          }
          var nestedSpec = spec.arrays[field].nested || null;
          var mergedChildren = _lwwMergeNestedChildren(l, c, s, nestedSpec, stats, now);
          var localDirty = !s || _lwwStripNested(s, nestedSpec) !== _lwwStripNested(l, nestedSpec);
          var localTs = localDirty ? now : ((l && l._ts) || (s && s._ts) || 0);
          var cloudTs = c._ts || 0;
          var winner;
          if (cloudTs > localTs) { winner = c; stats.replacedFromCloud++; }
          else { winner = l; if (localDirty) stats.keptLocalDirty++; }
          if (mergedChildren) {
            Object.keys(mergedChildren).forEach(function (cf) { winner[cf] = mergedChildren[cf]; });
          }
          merged.push(winner);
        } else if (l && !c) {
          // I-2: absence never deletes. Keep local item.
          merged.push(l); stats.keptLocalAbsent++;
        } else if (c && !l) {
          merged.push(c); stats.tookCloudNew++;
        }
      });
      cloudData[field] = merged;
    });

    // S532 — object-of-arrays merge (deficiencies keyed by contractor name).
    // Mirror of the plain-array merge above, applied inside each contractor's
    // list. A contractor group present only locally is kept outright (I-2:
    // absence never deletes). Deliberate mirror, not a refactor — see the note
    // in _stampLWW.
    Object.keys(spec.arrayMaps || {}).forEach(function (field) {
      var keyF = spec.arrayMaps[field].key;
      var lmap = (localProj[field] && typeof localProj[field] === 'object' && !Array.isArray(localProj[field])) ? localProj[field] : null;
      var cmap = (cloudData[field] && typeof cloudData[field] === 'object' && !Array.isArray(cloudData[field])) ? cloudData[field] : null;
      if (!lmap && !cmap) return;
      if (!lmap) return;
      if (!cmap) { cloudData[field] = lmap; return; }
      var smap = (snap[field] && typeof snap[field] === 'object' && !Array.isArray(snap[field])) ? snap[field] : {};
      var groups = {};
      Object.keys(cmap).forEach(function (g) { groups[g] = true; });
      Object.keys(lmap).forEach(function (g) { groups[g] = true; });
      var outMap = {};
      Object.keys(groups).forEach(function (grp) {
        var localArr = Array.isArray(lmap[grp]) ? lmap[grp] : null;
        var cloudArr = Array.isArray(cmap[grp]) ? cmap[grp] : null;
        if (!localArr && !cloudArr) return;
        // S535: same identity rule inside each contractor's list.
        if (!_lwwPairable(keyF, localArr, cloudArr, smap[grp])) {
          outMap[grp] = cloudArr || localArr;
          stats.skippedUnkeyed = (stats.skippedUnkeyed || 0) + 1;
          return;
        }
        if (!cloudArr) { outMap[grp] = localArr; return; }   // group only local — keep it
        if (!localArr) { outMap[grp] = cloudArr; return; }
        var snapIdx = {}, cloudIdx = {}, localIdx = {}, order = [], seen = {};
        (Array.isArray(smap[grp]) ? smap[grp] : []).forEach(function (p, i) {
          snapIdx[_lwwKey(p, keyF, i)] = p;
        });
        cloudArr.forEach(function (c, i) {
          var k = _lwwKey(c, keyF, i);
          cloudIdx[k] = c; order.push(k); seen[k] = true;
        });
        localArr.forEach(function (l, i) {
          var k = _lwwKey(l, keyF, i);
          if (!seen[k]) { order.push(k); seen[k] = true; }
        });
        localArr.forEach(function (l, i) { localIdx[_lwwKey(l, keyF, i)] = l; });
        var merged = [];
        order.forEach(function (k) {
          var c = cloudIdx[k], l = localIdx[k], s = snapIdx[k];
          if (c && l) {
            if (_lwwItemEmpty(l) && !_lwwItemEmpty(c) && !_lwwHasDeleteEvidence(l)) {
              merged.push(c); stats.replacedFromCloud++; return;
            }
            // S538: same nested treatment here — Diesel's responses live inside
            // a deficiency, and deficiencies live inside a contractor's list.
            var nSpec = spec.arrayMaps[field].nested || null;
            var mChildren = _lwwMergeNestedChildren(l, c, s, nSpec, stats, now);
            var localDirty = !s || _lwwStripNested(s, nSpec) !== _lwwStripNested(l, nSpec);
            var localTs = localDirty ? now : ((l && l._ts) || (s && s._ts) || 0);
            var win;
            if ((c._ts || 0) > localTs) { win = c; stats.replacedFromCloud++; }
            else { win = l; if (localDirty) stats.keptLocalDirty++; }
            if (mChildren) Object.keys(mChildren).forEach(function (cf) { win[cf] = mChildren[cf]; });
            merged.push(win);
          } else if (l && !c) {
            merged.push(l); stats.keptLocalAbsent++;
          } else if (c && !l) {
            merged.push(c); stats.tookCloudNew++;
          }
        });
        outMap[grp] = merged;
      });
      cloudData[field] = outMap;
    });

    spec.statusMaps.forEach(function (field) {
      var lmap = (localProj[field] && typeof localProj[field] === 'object') ? localProj[field] : null;
      var cmap = (cloudData[field] && typeof cloudData[field] === 'object') ? cloudData[field] : null;
      if (!lmap) return;
      if (!cmap) { cloudData[field] = lmap; return; }
      var smap = (snap[field] && typeof snap[field] === 'object') ? snap[field] : {};
      var out = {};
      var keys = {};
      Object.keys(cmap).forEach(function (k) { keys[k] = true; });
      Object.keys(lmap).forEach(function (k) { keys[k] = true; });
      Object.keys(keys).forEach(function (k) {
        var c = cmap[k], l = lmap[k], s = smap[k];
        if (c && l && typeof c === 'object' && typeof l === 'object') {
          // S524 HOTFIX — a null/blank local answer never beats a real cloud
          // answer (boot skeleton is not the inspector's work). Cloud outright.
          if ((l.status == null || l.status === '') && c.status != null && c.status !== '') {
            out[k] = c;
            return;
          }
          var dirty = !s || _lwwStrip(s) !== _lwwStrip(l);
          var lts = dirty ? now : ((l._ts) || (s && s._ts) || 0);
          out[k] = ((c._ts || 0) > lts) ? c : l;
        } else out[k] = (l !== undefined && l !== null) ? l : c;   // absence never deletes an answer
      });
      cloudData[field] = out;
    });

    spec.fieldMaps.forEach(function (field) {
      var lobj = (localProj[field] && typeof localProj[field] === 'object') ? localProj[field] : null;
      var cobj = (cloudData[field] && typeof cloudData[field] === 'object') ? cloudData[field] : null;
      if (!lobj) return;
      if (!cobj) { cloudData[field] = lobj; return; }
      var sobj = (snap[field] && typeof snap[field] === 'object') ? snap[field] : {};
      var cfts = (cloudData._fts && cloudData._fts[field]) || {};
      var keys = {};
      Object.keys(cobj).forEach(function (k) { keys[k] = true; });
      Object.keys(lobj).forEach(function (k) { keys[k] = true; });
      var out = {};
      Object.keys(keys).forEach(function (k) {
        var lv = lobj[k], cv = cobj[k], sv = sobj[k];
        var dirty = JSON.stringify(lv) !== JSON.stringify(sv);
        if (lv === undefined) { out[k] = cv; return; }
        if (cv === undefined) { out[k] = lv; return; }
        if (dirty) {
          out[k] = ((cfts[k] || 0) > now) ? cv : lv;   // local unpushed edit wins vs older cloud
        } else {
          out[k] = ((cfts[k] || 0) >= 0) ? cv : lv;    // not dirty → cloud (newest synced) wins
        }
      });
      cloudData[field] = out;
    });

    _lwwMergeStats = stats;
    if (stats.keptLocalDirty || stats.keptLocalAbsent) {
      console.log('[Sync I-3] per-item merge: +' + stats.tookCloudNew + ' cloud, ' +
        stats.replacedFromCloud + ' replaced-from-cloud, ' + stats.keptLocalDirty +
        ' local-dirty kept, ' + stats.keptLocalAbsent + ' local kept vs absence');
    }
    return cloudData;
  } catch (e) {
    console.warn('[Sync I-3] per-item merge skipped (fail-open):', e && e.message);
    return cloudData;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// S524 DOCTRINE I-5 / I-6 — DELIVERY GUARANTEE + LOUD STALENESS (Phase 3).
// 7155.40: an inspector worked 110 minutes while every cloud save failed
// silently. Two mechanisms below make that impossible:
//   • _lastCloudOkAt advances ONLY on a confirmed cloud round-trip. A watcher
//     escalates: amber status at 5 min of unconfirmed work, an unmissable
//     fixed red banner at 15 min. The banner is engine-owned (inline styles,
//     no tool CSS dependency) so every tool on this engine inherits it.
//   • A background retry loop: while a push is pending and the browser is
//     online, engine.flush() retries every 60s. Previously a failed push was
//     retried ONLY when the content changed again or an offline→online event
//     fired — on a live-but-bad connection that meant never.
// ═══════════════════════════════════════════════════════════════════════
var _lastCloudOkAt = 0;
var _hasUnconfirmedWork = false;
var _staleWatchTimer = null;
var _retryTimer = null;
var _bannerEl = null;
var _engineSelf = null;

function _cloudConfirmed() {
  _lastCloudOkAt = Date.now();
  _hasUnconfirmedWork = false;
  _hideSyncBanner();
}

function _showSyncBanner(text, level) {
  try {
    if (!_bannerEl) {
      _bannerEl = document.createElement('div');
      _bannerEl.id = 'syncStaleBanner';
      _bannerEl.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;' +
        'padding:10px 16px;text-align:center;font-family:Calibri,sans-serif;' +
        'font-size:15px;font-weight:bold;color:#fff;display:none;';
      document.body.appendChild(_bannerEl);
    }
    _bannerEl.style.background = (level === 'red') ? '#C0445F' : '#C98A4A';
    _bannerEl.textContent = text;
    _bannerEl.style.display = 'block';
  } catch (e) { console.warn('[Sync I-6] banner failed:', e && e.message); }
}
function _hideSyncBanner() {
  if (_bannerEl) _bannerEl.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════
// S536 — VERSION FLOOR. A tablet that has not reconnected keeps running old
// code indefinitely. Today nothing stops that build from writing: it saves
// happily, looks correct to the person holding it, and its idea of the report
// can be months behind the structures everyone else is using. This becomes
// acute the moment a storage location is retired — the old build keeps reading
// and writing somewhere nobody else looks, and that device goes quietly blind
// while appearing fine.
//
// WHICH BUILD AM I? Deliberately NOT a per-tool constant. Diesel's own stamp sat
// frozen for ~60 sessions and could not be trusted, and FRT has no build stamp at
// all. The service worker cache name is the one identifier that is bumped on
// EVERY push by standing discipline, is shared by every tool, and is a sortable
// timestamp. We read it from the caches the browser actually holds, so it
// describes the code that is genuinely running rather than what a constant claims.
//
// TWO LEVELS, deliberately staged:
//   warnBelow  — visible red banner, writing still allowed.
//   blockBelow — cloud writes refused; LOCAL SAVES CONTINUE and queue, so field
//                work is never lost, it simply cannot be published from a build
//                we do not trust.
// Ships with blockBelow dormant. It is armed in the same push that retires a
// storage location, never before — arming a floor that has not been exercised in
// the field is its own outage.
//
// FAILS OPEN, always. No service worker, no floor file, offline, malformed
// response, anything unexpected — the floor does not apply. A connectivity
// problem must never look like an out-of-date app.
// ═══════════════════════════════════════════════════════════════════════
var _floorChecked = false;
var _writeBlockedByFloor = false;
var _floorMsg = '';

function _buildStampFromCaches() {
  try {
    if (typeof caches === 'undefined' || !caches.keys) return Promise.resolve(null);
    return caches.keys().then(function (names) {
      var best = null;
      (names || []).forEach(function (n) {
        var m = /^arencon-frt-(\d{8,14})$/.exec(n);
        if (!m) return;
        var v = m[1];
        if (best === null || v > best) best = v;
      });
      return best;
    }).catch(function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}

function _checkVersionFloor() {
  if (_floorChecked) return Promise.resolve();
  _floorChecked = true;
  return _buildStampFromCaches().then(function (build) {
    if (!build) return;                       // no SW / no cache — fail open
    // cache:'no-store' AND a cache-busting query: the whole point is to read a
    // value the stale build has never seen, so it must not be served from the
    // very cache we are trying to judge.
    return fetch('/version-floor.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg) return;                     // unreachable — fail open
        var warn  = String(cfg.warnBelow  || '0');
        var block = String(cfg.blockBelow || '0');
        var msg   = cfg.message || 'This app is out of date. Close and reopen it to update.';
        if (block !== '0' && build < block) {
          _writeBlockedByFloor = true;
          _floorMsg = msg;
          _showSyncBanner(msg + '  \u2014 saving to the device only until updated.', 'red');
          console.warn('[Sync S536] build ' + build + ' is below the floor ' + block +
                       ' \u2014 cloud writes blocked, local saves continue');
        } else if (warn !== '0' && build < warn) {
          _showSyncBanner(msg, 'red');
          console.warn('[Sync S536] build ' + build + ' is below the warning level ' + warn);
        }
      })
      .catch(function () { /* fail open */ });
  }).catch(function () { /* fail open */ });
}
try { _checkVersionFloor(); } catch (e) { /* fail open */ }

function _ensureStaleWatch() {
  if (_staleWatchTimer) return;
  _staleWatchTimer = setInterval(function () {
    if (!_hasUnconfirmedWork) return;
    var base = _lastCloudOkAt || Date.now();
    var ageMin = (Date.now() - base) / 60000;
    // S524d WORDING (Mark) — an alarm must tell an inspector what to DO.
    // The original red text read "YOUR WORK IS NOT REACHING THE CLOUD", which
    // an inspector reads as *you are losing work*. That is not what is
    // happening: every entry is on the device the moment it is typed, the
    // outbox retries until the cloud confirms, and a relaunch flushes it.
    // Wording that implies loss forces a "stop entering data" rule, and we
    // cannot ask a crew to stop working a building. Say what is true, and say
    // the one action that matters: get to signal before leaving site.
    // Never the phrase "not reaching".
    if (ageMin >= 15) {
      _showSyncBanner('Still not synced (' + Math.round(ageMin) + ' min). ' +
        'Keep working — your device has everything. ' +
        'Get to signal before you leave site.', 'red');
    } else if (ageMin >= 5) {
      _showSyncBanner('Not synced yet — keep working, your device has everything.', 'amber');
    }
  }, 30000);
}

function _ensureRetryLoop() {
  if (_retryTimer) return;
  _retryTimer = setInterval(function () {
    try {
      if (_pendingSync && navigator.onLine && _engineSelf && typeof _engineSelf.flush === 'function') {
        console.log('[Sync I-5] background retry of pending push…');
        _engineSelf.flush();
      }
    } catch (e) { /* retry loop must never throw */ }
  }, 60000);
}

// S189 V-2 — Array-shrinkage clobber guard. See block comment near
// _arrayShrinkageGuardFires declaration above for full rationale.
// Pull-path only; do NOT call from silentMerge (merge3 has its own reconcile).
function _guardArrayShrinkage(cloudData, label) {
  if (!cloudData || typeof cloudData !== 'object') return cloudData;
  var localProj = model.getProject();
  if (!localProj) return cloudData;
  _GUARDED_ARRAY_FIELDS.forEach(function(field) {
    var cloudArr = cloudData[field];
    var localArr = localProj[field];
    if (!Array.isArray(cloudArr)) return;
    if (!Array.isArray(localArr) || localArr.length === 0) return;
    // Empty cloud already handled by _guardEmptyArrays
    if (cloudArr.length === 0) return;
    // No shrinkage if cloud is same or larger
    if (cloudArr.length >= localArr.length) return;
    // Build cloud id set
    var cloudIdSet = {};
    var cloudWithId = 0;
    for (var i = 0; i < cloudArr.length; i++) {
      var c = cloudArr[i];
      if (c && c.id) {
        cloudIdSet[c.id] = true;
        cloudWithId++;
      }
    }
    // If cloud items lack ids, we cannot make a subset judgment — let through.
    if (cloudWithId === 0) return;
    // Local id set
    var localIdSet = {};
    for (var j = 0; j < localArr.length; j++) {
      if (localArr[j] && localArr[j].id) localIdSet[localArr[j].id] = true;
    }
    // Strict subset check: every cloud id must be in local. If cloud has
    // any id local lacks, that's concurrent state — let through.
    var isStrictSubset = true;
    for (var ck in cloudIdSet) {
      if (!localIdSet[ck]) { isStrictSubset = false; break; }
    }
    if (!isStrictSubset) return;
    // V-2 fires: restore local in place of cloud
    cloudData[field] = JSON.parse(JSON.stringify(localArr));
    _arrayShrinkageGuardFires++;
    var entry = {
      at: new Date().toISOString(),
      path: label + '.' + field,
      cloudCount: cloudArr.length,
      localCount: localArr.length,
      rescued: localArr.length - cloudArr.length
    };
    _arrayShrinkageGuardLog.push(entry);
    if (_arrayShrinkageGuardLog.length > 50) _arrayShrinkageGuardLog.shift();
    console.error('[Sync S-guard] Cloud shrinkage on ' + field +
                  ': cloud=' + cloudArr.length + ' local=' + localArr.length +
                  ' (strict subset by id) — preserved local. Path: ' + label);
    try {
      if (typeof window !== 'undefined' && typeof window.toast === 'function') {
        window.toast('Cloud sync paused: cloud ' + field + ' shrunk (' +
                     cloudArr.length + ' vs local ' + localArr.length +
                     '). Local data preserved.');
      }
    } catch(_) {}
  });
  return cloudData;
}

// ═══════════════════════════════════════════════════════════════════════
// S524c DOCTRINE I-2 — DEEP (NESTED) COLLAPSE GUARD.
//
// WHY: every guard above reasons about a CONTAINER it knows by name.
// _guardEmptyArrays/_guardArrayShrinkage walk a fixed field list; the S524
// content-collapse guard walks Diesel's row arrays. So a copy that keeps all
// three contractors and empties every deficiency INSIDE them reads as "no
// shrinkage, containers intact" and passes all three. That is the 7155.40 wipe
// shape one level down, and it is what FRT's pins live inside. Enumerating
// containers is how each lane rediscovers this hole; this guard counts CONTENT
// at every depth instead, so Diesel and every future tool inherit it too.
//
// ── DELETION MUST ALWAYS WORK (Mark, S524c) ──────────────────────────────
// This guard can never fight a real deletion, by construction, because of one
// rule: IT ONLY PROTECTS WORK THAT HAS NOT REACHED THE CLOUD.
//   · It runs on the PULL path only. A person deleting on their own device is
//     pushing, and no guard here ever touches a push.
//   · It fires only while this device holds unsynced local content. If local
//     is already synced and the cloud copy is emptier, someone deleted it on
//     purpose — that is a professional act by a named inspector, it lands, it
//     propagates, and this guard stands aside.
//   · Any explicit deletion evidence in the incoming copy (an item flagged
//     deleted, a tombstone list) makes it stand aside outright, even when the
//     result is an empty report.
// The distinction is deletion vs ABSENCE. Only absence is ever refused.
// If this guard ever makes an inspector fight the software to delete
// something, it is broken and must be fixed, not worked around.
//
// Conservative on purpose: fires only on a TOTAL content collapse of a
// structure that held real content, bounded in depth, and fails open on any
// unexpected shape so field work is never blocked.
var _deepCollapseGuardFires = 0;
var _deepCollapseGuardLog = [];

// Keys that are structure/bookkeeping, not an inspector's work.
var _STRUCTURAL_KEYS = {
  id: 1, _id: 1, num: 1, order: 1, idx: 1, pct: 1, label: 1, _ts: 1,
  createdAt: 1, updatedAt: 1, modified: 1, createdBy: 1, updatedBy: 1
};

/** Count real content leaves at any depth: non-blank strings, non-zero
 *  numbers, true booleans. Structural keys excluded. Depth-bounded. */
function _contentLeaves(node, depth) {
  if (node == null || depth > 8) return 0;
  var t = typeof node;
  if (t === 'string')  return node.trim() !== '' ? 1 : 0;
  if (t === 'number')  return node !== 0 ? 1 : 0;
  if (t === 'boolean') return node ? 1 : 0;
  var n = 0, i, k;
  if (Array.isArray(node)) {
    for (i = 0; i < node.length; i++) n += _contentLeaves(node[i], depth + 1);
    return n;
  }
  if (t === 'object') {
    for (k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      if (_STRUCTURAL_KEYS[k]) continue;
      n += _contentLeaves(node[k], depth + 1);
    }
    return n;
  }
  return 0;
}

/** True if this subtree carries an EXPLICIT record of deletion. A tombstone
 *  is always honoured — deletion beats absence, always. */
function _hasDeletionEvidence(node, depth) {
  if (node == null || depth > 8 || typeof node !== 'object') return false;
  var i, k;
  if (Array.isArray(node)) {
    for (i = 0; i < node.length; i++) {
      if (_hasDeletionEvidence(node[i], depth + 1)) return true;
    }
    return false;
  }
  if (node.deleted === true || node.deletedAt || node._deleted === true) return true;
  for (k in node) {
    if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
    if (/tombstone/i.test(k)) {
      var v = node[k];
      if (Array.isArray(v) ? v.length > 0 : !!v) return true;
    }
    if (_hasDeletionEvidence(node[k], depth + 1)) return true;
  }
  return false;
}

/** Index an array of objects by id (local helper — merge.js is not imported
 *  here and this guard must stay dependency-free). */
function _byIdMap(arr) {
  var m = {};
  if (!Array.isArray(arr)) return m;
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    if (it && typeof it === 'object' && it.id != null) m[it.id] = it;
  }
  return m;
}

/** Walk local and cloud in parallel. Where a structure held real content
 *  locally and arrives with NONE, splice the local one back in. Items absent
 *  from cloud are NOT resurrected here — absence of an item is the merge
 *  engine's and the tombstone system's business, not this guard's. */
function _walkDeepCollapse(local, cloud, path, depth, label) {
  if (depth > 6 || !local || !cloud ||
      typeof local !== 'object' || typeof cloud !== 'object') return;

  if (Array.isArray(local) && Array.isArray(cloud)) {
    // Recurse only into ids present on BOTH sides. Never re-add a missing id.
    var cmap = _byIdMap(cloud);
    for (var i = 0; i < local.length; i++) {
      var li = local[i];
      if (!li || typeof li !== 'object' || li.id == null) continue;
      var ci = cmap[li.id];
      if (ci) _walkDeepCollapse(li, ci, path + '[' + li.id + ']', depth + 1, label);
    }
    return;
  }

  Object.keys(local).forEach(function (k) {
    if (_STRUCTURAL_KEYS[k]) return;
    var lv = local[k];
    if (lv == null || typeof lv !== 'object') return;   // scalars: LWW's job
    var localN = _contentLeaves(lv, 0);
    if (localN < 3) return;                             // nothing substantial
    var cv = cloud[k];
    var cloudN = (cv == null || typeof cv !== 'object') ? 0 : _contentLeaves(cv, 0);

    if (cloudN > 0) {                                   // still alive — go deeper
      _walkDeepCollapse(lv, cv, path + '.' + k, depth + 1, label);
      return;
    }
    // Total content collapse of a structure that held real work.
    if (_hasDeletionEvidence(cloud, 0)) return;         // explicit delete — stand aside
    cloud[k] = JSON.parse(JSON.stringify(lv));
    _deepCollapseGuardFires++;
    var entry = { at: new Date().toISOString(), path: path + '.' + k, rescued: localN };
    _deepCollapseGuardLog.push(entry);
    if (_deepCollapseGuardLog.length > 50) _deepCollapseGuardLog.shift();
    console.warn('[Sync I-2 deep-guard] Cloud delivered hollowed ' + path + '.' + k +
                 ' — preserved local (' + localN + ' values). Path: ' + label);
  });
}

function _guardDeepCollapse(cloudData, label) {
  try {
    if (!cloudData || typeof cloudData !== 'object') return cloudData;
    // ONLY protects unsynced work. If this device is in step with the cloud,
    // an emptier cloud copy is somebody's deliberate deletion — honour it.
    var dirty = _pendingSync ||
      (model && typeof model.hasUnsavedChanges === 'function' && model.hasUnsavedChanges());
    if (!dirty) return cloudData;
    var localProj = model.getProject();
    if (!localProj) return cloudData;
    _walkDeepCollapse(localProj, cloudData, 'root', 0, label);
  } catch (e) {
    console.warn('[Sync I-2 deep-guard] skipped (unexpected shape):', e && e.message);
  }
  return cloudData;
}

/**
 * S124 A3 — build the IDB key for a given project/instance.
 * Records keyed by `<toolKey>:<projectId>:<instanceId|_default>`.
 */
function _syncMetaKey(projectId, instanceId) {
  return _toolKey + ':' + projectId + ':' + (instanceId || '_default');
}

/**
 * S124 A3 — write current _lastSeen* to IDB. Fire-and-forget; errors
 * are warned but never block sync. Skips silently if IDB unavailable.
 */
function _persistSyncMeta(projectId, instanceId) {
  if (!projectId) return Promise.resolve(false);
  if (!_lastSeenUpdatedAt || !_lastSeenSnapshot) return Promise.resolve(false);
  var key = _syncMetaKey(projectId, instanceId);
  var record = {
    id: key,
    updatedAt: _lastSeenUpdatedAt,
    snapshot: _lastSeenSnapshot,
    savedAt: new Date().toISOString()
  };
  return IDB.put('syncMeta', record).catch(function(e) {
    console.warn('[Sync] _persistSyncMeta failed (non-fatal):', e && e.message);
    return false;
  });
}

/**
 * S124 A3 — read sync meta from IDB and restore _lastSeen* in memory.
 * Returns true if a record was found and applied, false otherwise.
 * Safe to call before the network is reachable.
 */
function _restoreSyncMeta(projectId, instanceId) {
  if (!projectId) return Promise.resolve(false);
  var key = _syncMetaKey(projectId, instanceId);
  return IDB.get('syncMeta', key).then(function(rec) {
    if (!rec || !rec.updatedAt || !rec.snapshot) return false;
    _lastSeenUpdatedAt = rec.updatedAt;
    _lastSeenSnapshot = rec.snapshot;
    console.log('[Sync] Restored snapshot from IDB — updated:', rec.updatedAt, '(saved at', rec.savedAt + ')');
    return true;
  }).catch(function(e) {
    console.warn('[Sync] _restoreSyncMeta failed (non-fatal):', e && e.message);
    return false;
  });
}

// Track online/offline
window.addEventListener('online', function() {
  _online = true;
  if (_pendingSync) {
    console.log('[Sync] Back online — flushing pending changes');
    SyncEngine.flush();
  }
});
window.addEventListener('offline', function() { _online = false; });

/**
 * Raw fetch helper that returns the full Response object (status, headers,
 * body) so we can inspect 412 specifically. Auth.request throws on non-200
 * which would swallow the 412. This is intentionally local — keeps the
 * Auth contract unchanged while letting us handle 412 properly.
 *
 * Auto-refreshes token on 401, just like Auth.request does.
 */
function _rawFetch(path, opts, _isRetry) {
  opts = opts || {};
  var token = localStorage.getItem('sb-access-token');
  var headers = Object.assign({
    'apikey': _anonKey(),
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }, opts.headers || {});

  return fetch(_url() + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function(res) {
    // Mirror Auth.request 401-handling so token expiry doesn't surface as a push failure
    if (res.status === 401 && !_isRetry && path.indexOf('/auth/v1/') !== 0) {
      console.log('[Sync] 401 on ' + path + ' — refreshing token + retrying');
      return Auth._refreshTokenShared().then(function(user) {
        if (!user) throw new Error('Unauthorized (refresh failed)');
        return _rawFetch(path, opts, true);
      });
    }
    return res;
  });
}

var SyncEngine = {

  get instanceId() { return _instanceId; },
  get instanceNumber() { return _instanceNumber; },
  get lastSeenUpdatedAt() { return _lastSeenUpdatedAt; },

  /**
   * Callback hook. app.js sets this to its conflict-modal handler.
   * Signature: function(conflicts) → Promise<{resolutions: [...]} | null>
   *
   * Called when we hit 412 AND the 3-way merge produces conflicts that
   * need user resolution. If null is returned (user cancels), the push
   * is abandoned (the local state stays dirty, retry on next save).
   *
   * Default no-op returns null so sync gracefully degrades if app.js
   * forgets to wire it.
   */
  onConflict: function(/* conflicts, mergeResult */) {
    console.warn('[Sync] onConflict called but no handler wired. Push abandoned.');
    return Promise.resolve(null);
  },

  /**
   * Callback hook for silent (no-conflict) merge notifications.
   * Signature: function(mergeResult) → void
   * Default no-op. app.js sets this to show a passive toast.
   */
  onSilentMerge: function(/* mergeResult */) { /* no-op */ },

  /**
   * S132 — Is a candidate IDB snapshot blank / a placeholder?
   *
   * The blank-project load race: if the syncMeta record for this project
   * holds a snapshot with no real content (a placeholder captured mid-
   * creation, a stale pre-population snapshot, or a wrong/empty record),
   * the fast path would model.setProject() it and the app would render
   * blank until the cloud pull lands. While that blank object is the live
   * _project, anything that fires _queueSave() (a user tap on the blank
   * UI, a mis-fired seed) would persist the blank state over the real one.
   *
   * Fix: treat a contentless snapshot as "no snapshot" — return null so the
   * fast path skips it entirely and the cloud pull becomes the FIRST
   * setProject(). A blank _project is then never set, so the race window
   * does not exist. A genuinely populated snapshot still fast-paths exactly
   * as before, so boot speed for real projects is unchanged.
   *
   * "Has content" = any of: a non-empty project number/name, or any
   * drawing / contractor / general deficiency / photo. Deliberately
   * generous — a project the user has touched at all clears this bar; only
   * a truly empty placeholder fails it.
   */
  _isBlankSnapshot: function(snap) {
    if (!snap || typeof snap !== 'object') return true;
    var info = snap.info || {};
    if ((info.projectNumber && String(info.projectNumber).trim()) ||
        (info.projectName && String(info.projectName).trim())) return false;
    if (Array.isArray(snap.drawings) && snap.drawings.length) return false;
    if (Array.isArray(snap.contractors) && snap.contractors.length) return false;
    if (Array.isArray(snap.generalDeficiencies) && snap.generalDeficiencies.length) return false;
    if (Array.isArray(snap.photos) && snap.photos.length) return false;
    return true;
  },

  /**
   * S129 Item 3 — Load the last-seen project snapshot from IDB for fast-path
   * boot render. Returns the project data or null. Side-effect: also sets
   * _lastSeenUpdatedAt and _lastSeenSnapshot so a subsequent push (before
   * pull() resolves) still has its 3-way-merge base.
   *
   * This is the perceived-boot-time fix. The full pull() still runs after
   * auth resolves and overwrites Model with fresh cloud data. The snapshot
   * we return here is whatever was current at the last successful pull.
   *
   * Non-blocking on failure (returns null). Safe to call before IDB.init
   * resolves — it'll just return null. Safe to call before auth — IDB has
   * no auth requirement.
   *
   * S132 — a blank/placeholder snapshot is treated as null (see
   * _isBlankSnapshot) so the fast path never sets a blank _project.
   */
  loadIDBSnapshot: function(projectId, instanceId) {
    if (!projectId) return Promise.resolve(null);
    var key = _syncMetaKey(projectId, instanceId);
    var self = this;
    return IDB.get('syncMeta', key).then(function(rec) {
      if (!rec || !rec.snapshot) return null;
      // S132 — blank-project load race guard. A contentless snapshot is
      // worse than no snapshot: it would render blank AND be persistable
      // over the real cloud data. Skip the fast path entirely; the cloud
      // pull becomes the first setProject(). Do NOT adopt it as the
      // merge base either — leave _lastSeenSnapshot unset so pull() sets
      // a real one.
      if (self._isBlankSnapshot(rec.snapshot)) {
        console.warn('[Sync] IDB snapshot is blank/placeholder — skipping fast-path render, waiting for cloud pull');
        return null;
      }
      _lastSeenUpdatedAt = rec.updatedAt || null;
      _lastSeenSnapshot = rec.snapshot;
      // Also record instanceId so a fast-path push (before pull resolves)
      // targets the right row. Best-effort — may be re-set by pull().
      if (instanceId) _instanceId = instanceId;
      console.log('[Sync] Loaded IDB snapshot for fast-path render — updated:', rec.updatedAt);
      return rec.snapshot;
    }).catch(function(e) {
      console.warn('[Sync] loadIDBSnapshot failed (non-fatal):', e && e.message);
      return null;
    });
  },

  /**
   * Pull project data from Supabase.
   * Reads from tool_data table (v1 format — single blob per project/tool/instance).
   * Records updated_at + a deep snapshot for later 3-way merge.
   *
   * S124 A3 — restores _lastSeen* from IDB BEFORE the network call so an
   * offline open still has a usable snapshot for the next push attempt.
   * If the network pull succeeds, the in-memory snapshot is overwritten
   * with the fresh cloud data and persisted back to IDB.
   */
  pull: function(projectId, instanceId, opts) {
    opts = opts || {};
    var path;
    if (instanceId) {
      path = '/rest/v1/tool_data?select=*&id=eq.' + instanceId;
    } else {
      path = '/rest/v1/tool_data?select=*&project_id=eq.' + projectId + '&tool_key=eq.' + _toolKey + '&order=updated_at.desc&limit=1';
    }

    // S124 A3 — try IDB restore first. Non-blocking on failure; the network
    // pull below will overwrite anyway if it succeeds.
    return _restoreSyncMeta(projectId, instanceId).then(function() {
      // S130 Item 5.3 — request raw text and parse off the main thread.
      // For 10MB+ project responses this saves 100-300ms of UI freeze.
      // SyncWorkerHost.parseLarge falls back to inline JSON.parse if the
      // worker is unavailable, so this works on every browser.
      return Auth.request(path, { rawText: true });
    }).then(function(text) {
      return text ? SyncWorkerHost.parseLarge(text) : null;
    }).then(function(rows) {
      if (!rows || !rows.length) {
        console.log('[Sync] No cloud data found for project:', projectId);
        return null;
      }

      var row = rows[0];
      _instanceId = row.id;
      _instanceNumber = row.instance_number || 1;
      _lastSeenUpdatedAt = row.updated_at || null;

      // S263 STALE-OVERWRITE GUARD — the existing _guardEmptyArrays /
      // _guardArrayShrinkage guards catch MISSING items, but NOT stale FIELD
      // values inside existing items (e.g. an observation whose text the cloud
      // copy hasn't received yet because the push timed out). Symptom: typed
      // comments vanish when a silent pull replaces the project with a cloud
      // copy older than the local edits. Gate: if the LOCAL in-memory project
      // is strictly NEWER than this cloud row, skip the overwrite and keep
      // local. The cloud's changes arrive on the next pull AFTER local has
      // pushed. Explicit pulls (manual "Pull now", initial load) pass
      // opts.allowStaleOverwrite=true to bypass — the user / first-load
      // deliberately wants the cloud copy. Auto/silent pulls are gated.
      if (!opts.allowStaleOverwrite) {
        try {
          // S491 — extraction bug fix: the guard checked `typeof Model` — the
          // FRT global name, always undefined inside this factory — so
          // localProj was permanently null and the stale-overwrite guard
          // NEVER fired for lib consumers (Electric live): a silent pull of
          // an older cloud row could wipe unsynced local edits. Check the
          // INJECTED model instead.
          var localProj = (model && typeof model.getProject === 'function') ? model.getProject() : null;
          var localMod = localProj && localProj.modified ? Date.parse(localProj.modified) : 0;
          var cloudMod = row.updated_at ? Date.parse(row.updated_at) : 0;
          if (localProj && localMod && cloudMod && localMod > cloudMod) {
            console.warn('[Sync] STALE-OVERWRITE GUARD: local (' + localProj.modified +
              ') is newer than cloud (' + row.updated_at + ') — skipping pull overwrite to protect unsynced local edits.');
            return null;  // keep local; do NOT setProject the stale cloud copy
          }
        } catch (e) { /* on any doubt, fall through to normal pull */ }
      }

      var data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      if (data) {
        // S126 Phase C — empty-array clobber guard. Inspects cloud arrays
        // vs local; if cloud is empty AND local has data, splice local back
        // in before passing to setProject. Prevents cross-device pulls from
        // wiping unsaved local drawings/photos/contractors.
        data = _guardEmptyArrays(data, 'pull');
        // S524 DOCTRINE I-2 — content-collapse guard: catches hollowed rows
        // (arrays full length, values blank) and emptied checklists, which
        // both count-based guards above are blind to. This is the exact
        // 7155.40 wipe shape.
        data = _guardContentCollapse(data, 'pull');
        // S524 DOCTRINE I-3 — per-item newest-wins merge (Phase 2). Runs on
        // tools registered in _LWW_SPECS; others keep guard-only behavior.
        try {
          var _lp = (model && typeof model.getProject === 'function') ? model.getProject() : null;
          // S524 HOTFIX (field incident, Mark's machine, 00:41–00:46):
          // NEVER run the per-item merge on boot/manual pulls
          // (opts.allowStaleOverwrite). At boot the injected model returns the
          // DEFAULT SKELETON — 60 unanswered items, empty rows — and the merge
          // read those blanks as "local dirty edits" and preserved the
          // emptiness over the cloud's real content (checklist 20→0). The
          // host's own boot block merges IDB-vs-cloud; the per-item merge is
          // for HEARTBEAT pulls onto a live, populated model only.
          if (_lp && !(opts && opts.allowStaleOverwrite)) data = _mergeLWW(_lp, data, _lastSeenSnapshot);
        } catch (e) { console.warn('[Sync I-3] merge wire skipped:', e && e.message); }
        // S189 V-2 — Array-shrinkage clobber guard. Catches cloud-shorter-
        // than-local (strict subset by id). This is the 4380.24 propagation
        // path: misbehaving device pushes shrunk array → cloud takes it →
        // any other device's pull wipes its good local. Pull-path ONLY
        // (silentMerge has its own merge3 reconcile).
        data = _guardArrayShrinkage(data, 'pull');
        // S524c DOCTRINE I-2 — deep (nested) collapse guard. The three guards
        // above all reason about named containers; this one counts CONTENT at
        // every depth, so a copy that keeps the contractors and empties every
        // deficiency inside them is caught. Protects UNSYNCED work only — a
        // real deletion by a real inspector always lands (see block comment).
        data = _guardDeepCollapse(data, 'pull');
        // S123 P6B — snapshot for 3-way merge. Deep clone so later edits
        // to model.getProject() don't mutate this reference.
        _lastSeenSnapshot = JSON.parse(JSON.stringify(data));
        model.setProject(data);
        // S171 Fix A — repair any photos a wholesale-replace would have
        // lost. The outbox is parallel to model state; rows in r2_confirmed
        // get re-injected back into model.defic.photos[]. No-op when the
        // outbox is empty or BinaryOutbox is disabled (PROD).
        try {
          if (BinaryOutbox && BinaryOutbox.reconcileWithModel) {
            BinaryOutbox.reconcileWithModel(model.getProject());
          }
        } catch (e) {
          console.warn('[Sync][Fix A] reconcileWithModel (pull) failed:', e && e.message);
        }
        // S414: HEAD-verify stored R2 keys once per project per session and
        // self-heal dead ones (7155.51 yellow-badge / 404 root cause). Save
        // only when something actually changed.
        try {
          if (BinaryOutbox && BinaryOutbox.verifyR2Keys) {
            BinaryOutbox.verifyR2Keys(model.getProject()).then(function(r){
              if (r && (r.healed || r.nulled)) { model.saveNow(); }
              // S462 (ported to /lib/ S491): surface any zero-source photos
              // the rescue stage could NOT recover on this device — visible
              // to the user, never console-only. The presentation is
              // per-tool personality: injected via config.onPhotoAttention
              // (FRT passes its banner hook; tools without one no-op).
              if (r && typeof r.sourceless === 'number' && typeof onPhotoAttention === 'function') {
                var remaining = r.sourceless - (r.rescued || 0);
                try { onPhotoAttention(remaining); } catch(_){}
              }
            }).catch(function(){});
          }
        } catch (e) {
          console.warn('[Sync] verifyR2Keys failed:', e && e.message);
        }
        // S124 A3 — persist fresh snapshot to IDB (re-key in case instanceId
        // was null on entry but resolved from the row).
        _persistSyncMeta(projectId, _instanceId);
        console.log('[Sync] Loaded from cloud — instance:', _instanceId, 'updated:', _lastSeenUpdatedAt);
        _cloudConfirmed();   // S524 I-6 — confirmed round-trip
        return data;
      }
      return null;
    }).catch(function(err) {
      console.warn('[Sync] Pull failed:', err.message);
      return null;
    });
  },

  /**
   * S82: Lightweight check for remote updated_at. Used by periodic-pull system
   * to detect when another inspector pushed changes. Returns ISO timestamp or null.
   * Cheap query (~150 bytes) — safe to run every 30s.
   */
  getRemoteUpdatedAt: function(projectId, instanceId) {
    var path;
    if (instanceId) {
      path = '/rest/v1/tool_data?select=updated_at&id=eq.' + instanceId;
    } else {
      path = '/rest/v1/tool_data?select=updated_at&project_id=eq.' + projectId + '&tool_key=eq.' + _toolKey + '&order=updated_at.desc&limit=1';
    }
    return Auth.request(path).then(function(rows) {
      if (!rows || !rows.length) return null;
      return rows[0].updated_at || null;
    }).catch(function(err) {
      console.warn('[Sync] getRemoteUpdatedAt failed:', err.message);
      return null;
    });
  },

  /**
   * Push current project state to Supabase.
   * If offline, marks as pending and pushes on reconnect.
   *
   * S123 P6B — bounded-retry with 3-way merge:
   *   1. Strip binary data + build payload
   *   2. PATCH with If-Match: "<_lastSeenUpdatedAt>"
   *   3. If 412 (precondition failed):
   *      a. Pull the latest cloud row
   *      b. Run merge3(_lastSeenSnapshot, local, cloud)
   *      c. If no conflicts → apply merged via model.applyMerged, retry push (attempt++)
   *      d. If conflicts → onConflict callback shows modal, resolves,
   *         apply, retry push (attempt++)
   *      e. After 3 attempts, give up + warn
   */
  push: function(projectId, _attempt) {
    _attempt = _attempt || 0;
    var self = this;
    var proj = model.getProject();
    if (!proj) return Promise.resolve(null);

    // S536 VERSION FLOOR — refuse to PUBLISH from a build below the floor, but
    // treat it exactly like being offline: the work is kept, queued, and goes up
    // the moment the app updates. Never a data-loss path; the local save has
    // already happened by the time push runs.
    if (_writeBlockedByFloor) {
      _pendingSync = true;
      console.warn('[Sync S536] push refused: build below floor. Work is saved locally and queued.');
      return Promise.resolve(null);
    }

    // S524 I-5/I-6 — every push attempt marks unconfirmed work and arms the
    // staleness watcher + background retry loop. Only a confirmed cloud
    // round-trip (_cloudConfirmed) stands the flag down.
    _hasUnconfirmedWork = true;
    if (!_lastCloudOkAt) _lastCloudOkAt = Date.now();
    _engineSelf = self;
    _ensureStaleWatch();
    _ensureRetryLoop();

    if (!_online) {
      _pendingSync = true;
      console.log('[Sync] Offline — queued for sync');
      IDB.put('syncQueue', {
        id: 'pending_' + Date.now(),
        projectId: projectId,
        timestamp: new Date().toISOString(),
        status: 'pending'
      });
      return Promise.resolve(null);
    }

    if (_attempt >= 3) {
      console.warn('[Sync] Push abandoned — 3 conflict retries exhausted.');
      _pendingSync = true;
      return Promise.resolve(null);
    }

    // Strip binary data before pushing.
    //
    // S126 Phase B — markupObjects ride per-drawing R2 binaries, not the
    // tool_data row. We strip markupObjects from each drawing before push;
    // the drawing.markupR2 reference object stays (it carries r2Key, r2Url,
    // count, updatedAt, inspectorId — small scalars that field-merge
    // cleanly between concurrent writers). Legacy `markupData` (never used
    // since the canvas-objects refactor) is also stripped to be safe.
    //
    // History: pre-S124 stripped markupObjects, but Markup.saveNow() never
    // ran on hard refresh, so strokes were silently lost. S125 hotfix 6
    // removed the strip — strokes round-tripped through cloud but the
    // tool_data row grew unboundedly with heavy-markup projects, and two
    // tablets editing the same project clobbered each other's strokes.
    // S126 Phase B fixes both: the strip is back AND strokes persist
    // because the per-drawing markup binary is the durable store, not the
    // tool_data row.
    // S128 P-6 — moved the deep-clone + strip-binaries block into the
    // sync worker (background thread). serializePush() returns the
    // stripped data; falls back to inline on the main thread if Worker
    // is unavailable. The whole push() flow is now anchored on this
    // initial Promise rather than a sync prelude.
    return SyncWorkerHost.serializePush(proj).then(function(serialized) {
      var data = serialized.strippedData;

      // ── B1 (S339+): stamp photo badges for Hub read-through ──
      // The Hub renders badges by READING these fields verbatim (it never
      // derives). We stamp on the push clone only — never the live model.
      // Ported from photos.js gallery badge logic (pool+selection model).
      // Additive + guarded so it can never break a push.
      try { _stampPhotoBadges(data); } catch (e) { console.warn('[Sync] photo badge stamp skipped:', e); }
      // S524 DOCTRINE I-3 — stamp per-item _ts on the push clone (diff vs the
      // last-seen snapshot; unchanged items carry their previous stamp).
      try { _stampLWW(data, _lastSeenSnapshot); } catch (e) { console.warn('[Sync I-3] stamp wire skipped:', e); }

      // ── S171 Fix A: strip outbox-originated photos that aren't ready ──
      // Per D7: only strip photos that originated in the LOCAL outbox.
      // Photos with r2Key:null that arrived from cloud (legacy / pre-Fix-A
      // devices) pass through unchanged — we don't destructively clean
      // up another device's data.
      //
      // The strip set is rows in {pending, uploading, retrying, failed}.
      // Rows in r2_confirmed have their photo.r2Key set and ARE pushed
      // — they're exactly what we want cloud to capture, so the next
      // markCloudConfirmed can retire the outbox row.
      var photoIdsToConfirm = [];
      if (BinaryOutbox && BinaryOutbox.isEnabled && BinaryOutbox.isEnabled()) {
        var rows = BinaryOutbox.getEntriesForProject(projectId);
        var stripIds = {};
        rows.forEach(function(r) {
          if (!r || !r.photoId) return;
          if (r.status === 'r2_confirmed') {
            photoIdsToConfirm.push(r.photoId);
          } else if (r.status === 'pending' || r.status === 'uploading' ||
                     r.status === 'retrying' || r.status === 'failed') {
            stripIds[r.photoId] = true;
          }
        });
        var stripCount = 0;
        function _strip(d) {
          if (!d || !Array.isArray(d.photos)) return;
          var before = d.photos.length;
          d.photos = d.photos.filter(function(p) {
            return !(p && p.id && stripIds[p.id]);
          });
          stripCount += (before - d.photos.length);
          // S171 follow-up: also remove the stripped photoIds from any
          // obs.photoSelection so cloud doesn't see a dangling reference
          // (custom-state obs explicitly list photoIds; default-state
          // obs use photoSelection:null and need no cleanup).
          if (Array.isArray(d.observations)) {
            d.observations.forEach(function(o) {
              if (Array.isArray(o.photoSelection)) {
                o.photoSelection = o.photoSelection.filter(function(id) {
                  return !stripIds[id];
                });
              }
            });
          }
        }
        (data.contractors || []).forEach(function(c) {
          (c.deficiencies || []).forEach(_strip);
        });
        (data.generalDeficiencies || []).forEach(_strip);
        if (stripCount > 0) {
          console.log('[Sync][Fix A] Stripped ' + stripCount +
                      ' outbox-tracked photo(s) from push payload (waiting for R2 confirm)');
        }
      }

      var user = Auth.getUser();
      var payload = {
        project_id: projectId,
        tool_key: _toolKey,
        instance_number: _instanceNumber,
        data: data,
        updated_by: user ? user.id : null,
        updated_at: new Date().toISOString()
      };

      var method, path;
      var customHeaders = { 'Prefer': 'return=representation' };

      if (_instanceId) {
        method = 'PATCH';
        path = '/rest/v1/tool_data?id=eq.' + _instanceId;
        // S123 P6B — only send If-Match on PATCH (POST is initial create)
        // and only if we have a tracked updated_at (defensive: a hot reload
        // after a manual cloud edit could leave us with no snapshot).
        // S524 DOCTRINE I-4 / I-8 — BOOT DISCIPLINE.
        // Previously: no token → PATCH sent WITHOUT If-Match → unconditional
        // last-write-wins overwrite. That is how a crash-relaunched app that
        // never completed a baseline pull gutted the 7155.40 cloud copy with
        // day-old local state. A context that has not established a baseline
        // has no standing to overwrite anyone. Refuse the push; the local save
        // is already durable and the next successful pull re-establishes the
        // baseline so this same data pushes safely afterwards.
        if (_lastSeenUpdatedAt) {
          customHeaders['If-Match'] = '"' + _lastSeenUpdatedAt + '"';
        } else {
          console.warn('[Sync I-4] Push REFUSED: no cloud baseline established for this ' +
                       'context (no If-Match token). Local data is safe and queued; ' +
                       'a successful pull will re-enable cloud saves.');
          _pendingSync = true;
          return Promise.resolve(null);
        }
      } else {
        method = 'POST';
        path = '/rest/v1/tool_data';
        payload.created_by = user ? user.id : null;
        payload.status = 'draft';
        payload = [payload];
      }

      return _rawFetch(path, {
        method: method,
        body: payload,
        headers: customHeaders
      }).then(function(res) {
      // S123 P6B — 412 Precondition Failed = optimistic-concurrency conflict
      if (res.status === 412) {
        console.warn('[Sync] 412 conflict on push — running 3-way merge (attempt ' + (_attempt + 1) + '/3)');
        return self._handleConflict(projectId, proj, _attempt);
      }
      if (!res.ok) {
        return res.json().catch(function() { return { message: res.statusText }; }).then(function(err) {
          // S524 DOCTRINE I-8 — the server wipe guard refuses content-erasing
          // saves with SQLSTATE PT409. That refusal is a SUCCESS of the safety
          // system and must be LOUD, never a silent retry loop: local data is
          // intact, and retrying the same payload would be refused forever.
          var msg = String(err.message || err.msg || err.code || '');
          if (err.code === 'PT409' || msg.indexOf('PT409') !== -1 ||
              msg.indexOf('wipe blocked') !== -1) {
            console.error('[Sync I-8] SAVE REFUSED BY SERVER WIPE GUARD — this save would ' +
              'have erased report content. Local data is intact. Detail: ' + (err.details || msg));
            _showSyncBanner('Save refused: it would have erased report content. ' +
              'Your local data is intact. Pull the latest, verify, then save again.', 'red');
            _pendingSync = false;   // do not hammer a payload the server will always refuse
            return null;
          }
          throw new Error(err.message || err.msg || res.statusText);
        });
      }
      return res.text().then(function(text) { return text ? JSON.parse(text) : null; });
    }).then(function(rows) {
      if (rows && rows.length > 0) {
        _instanceId = rows[0].id;
        _instanceNumber = rows[0].instance_number;
        _lastSeenUpdatedAt = rows[0].updated_at || null;
        // S123 P6B — update snapshot to the just-pushed state so next
        // 412 has the correct ancestor.
        _lastSeenSnapshot = JSON.parse(JSON.stringify(data));
        // S124 A3 — persist to IDB so the snapshot survives reloads.
        _persistSyncMeta(projectId, _instanceId);
        _pendingSync = false;
        IDB.clear('syncQueue');
        console.log('[Sync] Pushed to cloud — instance:', _instanceId, 'updated:', _lastSeenUpdatedAt);
        _cloudConfirmed();   // S524 I-6 — confirmed round-trip
        // S524e DOCTRINE I-8 — a declared clear is SINGLE-USE, client side too.
        // The server consumes `_intentionalClear` on the save that carried it;
        // strip it locally on the same confirmed round-trip so it can never
        // ride a later save and silently disarm the wipe guard for this
        // report. A safety switch that can only be turned off is not one.
        try {
          var _lp = (model && typeof model.getProject === 'function') ? model.getProject() : null;
          if (_lp && _lp._intentionalClear) { delete _lp._intentionalClear; }
          if (_lastSeenSnapshot && _lastSeenSnapshot._intentionalClear) {
            delete _lastSeenSnapshot._intentionalClear;
          }
        } catch (e) { /* never block a confirmed save */ }

        // ── S171 Fix A: tell the outbox cloud captured these photos ──
        // Snapshot-time photoIdsToConfirm is what we actually pushed.
        // markCloudConfirmed is idempotent; if rows moved on between
        // capture and now (rare), it filters defensively.
        if (photoIdsToConfirm.length > 0 &&
            BinaryOutbox && BinaryOutbox.markCloudConfirmed) {
          BinaryOutbox.markCloudConfirmed(photoIdsToConfirm).catch(function(e) {
            console.warn('[Sync][Fix A] markCloudConfirmed failed (non-fatal):',
                         e && e.message);
          });
        }

        return rows[0];
      }
      return null;
    }).catch(function(err) {
      console.warn('[Sync] Push failed:', err.message);
      _pendingSync = true;
      return null;
    });
    }); // close SyncWorkerHost.serializePush().then
  },

  /**
   * S123 P6B — internal: handle a 412 conflict.
   * Pulls latest cloud state, runs merge3, dispatches to silent-merge or
   * modal path depending on whether conflicts exist.
   */
  _handleConflict: function(projectId, localProj, attempt) {
    var self = this;
    var pullPath = '/rest/v1/tool_data?select=*&id=eq.' + _instanceId;

    return Auth.request(pullPath).then(function(rows) {
      if (!rows || !rows.length) {
        console.warn('[Sync] 412 conflict but row not found — was it deleted? Abandoning push.');
        return null;
      }
      var cloudRow = rows[0];
      var cloudData = typeof cloudRow.data === 'string' ? JSON.parse(cloudRow.data) : cloudRow.data;
      var cloudUpdatedAt = cloudRow.updated_at;

      // S128 P-6 — merge3 runs in the sync worker (background thread).
      // Falls back to inline on the main thread if Worker is unavailable.
      // The catch below preserves the legacy "merge3 threw → abandon push"
      // contract.
      return SyncWorkerHost.merge3Worker(_lastSeenSnapshot, localProj, cloudData).then(function(mergeResult) {

      // Update the "last seen" to the new cloud state regardless — the
      // next push uses this as the precondition.
      _lastSeenUpdatedAt = cloudUpdatedAt;
      _lastSeenSnapshot = JSON.parse(JSON.stringify(cloudData));
      // S124 A3 — persist new ancestor so a reload mid-conflict doesn't
      // lose the just-fetched cloud state.
      _persistSyncMeta(projectId, _instanceId);

      if (mergeResult.conflicts.length === 0) {
        // Silent merge — apply + retry push
        console.log('[Sync] Silent merge — no field conflicts. Auto-applying merged state.');
        // S126 Phase C — guard the merged result the same way as a direct
        // pull. merge3 already protects per-item but can legitimately
        // produce an empty array if cloud was empty AND local agrees on
        // a delete we haven't yet committed; the guard ensures the local
        // populated state wins in the rare ambiguous case.
        var guardedMerged = _guardEmptyArrays(mergeResult.merged, 'silentMerge');
        model.applyMerged(guardedMerged);
        // S171 Fix A — applyMerged is just as destructive to in-flight
        // photos as setProject. Run the same outbox reconcile.
        try {
          if (BinaryOutbox && BinaryOutbox.reconcileWithModel) {
            BinaryOutbox.reconcileWithModel(model.getProject());
          }
        } catch (e) {
          console.warn('[Sync][Fix A] reconcileWithModel (silentMerge) failed:', e && e.message);
        }
        try { self.onSilentMerge(mergeResult); } catch (e) { console.warn('[Sync] onSilentMerge handler threw:', e); }
        return self.push(projectId, attempt + 1);
      }

      // True conflicts — surface to user via callback
      console.log('[Sync] ' + mergeResult.conflicts.length + ' true conflict(s) — surfacing to user.');
      return Promise.resolve(self.onConflict(mergeResult.conflicts, mergeResult)).then(function(resolution) {
        if (!resolution) {
          // User cancelled — leave local dirty for retry on next save
          console.log('[Sync] User cancelled conflict resolution — push abandoned.');
          return null;
        }
        // resolution is { resolutions: [...] } — caller applies them and
        // returns the final merged state. Apply + retry.
        model.applyMerged(resolution.merged);
        // S171 Fix A — same reconcile as the silent-merge path.
        try {
          if (BinaryOutbox && BinaryOutbox.reconcileWithModel) {
            BinaryOutbox.reconcileWithModel(model.getProject());
          }
        } catch (e) {
          console.warn('[Sync][Fix A] reconcileWithModel (conflict resolution) failed:', e && e.message);
        }
        return self.push(projectId, attempt + 1);
      });

      }).catch(function(mergeErr) {
        // Legacy contract: any merge3 failure → abandon push.
        console.error('[Sync] merge3 threw — abandoning push:', mergeErr);
        return null;
      });
    }).catch(function(err) {
      console.warn('[Sync] _handleConflict failed:', err.message);
      return null;
    });
  },

  /**
   * Flush pending changes (alias for push).
   */
  flush: function() {
    var params = new URLSearchParams(window.location.search);
    var pid = params.get('project');
    if (!pid) return Promise.resolve();
    return this.push(pid);
  },

  /**
   * Poll for remote changes (stub — full implementation in Phase 1-C).
   */
  poll: function() {
    console.log('[Sync] poll() — stub');
    return Promise.resolve();
  },

  startHeartbeat: function(intervalMs) {
    var self = this;
    this.stopHeartbeat();
    this._heartbeat = setInterval(function() {
      if (_online && _pendingSync) {
        self.flush();
      }
    }, intervalMs || 30000);
    console.log('[Sync] Heartbeat started');
  },

  stopHeartbeat: function() {
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
  },

  get isPending() { return _pendingSync; },
  get isOnline() { return _online; },

  // S126 Phase C — empty-array clobber guard diagnostics. Counts every fire
  // since module load; log holds the most recent 50 events. Read via
  // SyncEngine.diag.emptyArrayGuards (count) and SyncEngine.diag.emptyArrayLog
  // (recent fires). Phase D wires these into window._frt.diagnostics.sync.
  //
  // S189 V-2 — Array-shrinkage clobber guard diagnostics. Same shape as the
  // empty-array counters. arrayShrinkageGuards = count since module load,
  // arrayShrinkageLog = recent 50 fires with cloudCount/localCount/rescued.
  get diag() {
    return {
      emptyArrayGuards: _emptyArrayGuardFires,
      emptyArrayLog: _emptyArrayGuardLog.slice(),
      arrayShrinkageGuards: _arrayShrinkageGuardFires,
      arrayShrinkageLog: _arrayShrinkageGuardLog.slice(),
      lastSeenUpdatedAt: _lastSeenUpdatedAt,
      instanceId: _instanceId,
      pendingSync: _pendingSync,
      online: _online
    };
  }
};

// S123 P6B — expose for diagnostic / dev console
if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
}

  return SyncEngine;
}
