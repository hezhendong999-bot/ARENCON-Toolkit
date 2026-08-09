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

/* ═══ S583 — CANONICAL CONTENT COMPARISON (the arrangement-proof root fix) ═══
 * Postgres stores report data as jsonb, which REWRITES object key order
 * (length-then-alphabetical). Every comparison in this engine that judged
 * "changed or not" used JSON.stringify — which is key-order SENSITIVE — with
 * one side client-built (insertion order) and the other parsed from jsonb
 * (server order). Same content, different arrangement, never equal. The
 * proven consequences (1490.04 forensics, 2 Aug 2026):
 *   - _stampLWW concluded every item changed on every save → every _ts
 *     re-stamped to "now" → newest-wins merge rigged so the cloud always
 *     beat pending offline work (the 70-psi loss);
 *   - the ever-fresh stamps were themselves "new content" → idle windows
 *     ping-ponged saves every ~3.5 min forever;
 *   - _computePartialPayload saw every section as changed → change-scoped
 *     saves silently degenerated.
 * Fix: ONE canonical serializer — recursively key-sorted, so arrangement can
 * never masquerade as change — used by every changed-or-not judgement.
 * `drop` removes bookkeeping keys (never content) at every depth. */
export function stableKey(v, drop) {
  if (v === null || v === undefined || typeof v !== 'object') {
    return v === undefined ? 'undefined' : JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    var parts = [];
    for (var i = 0; i < v.length; i++) parts.push(stableKey(v[i], drop));
    return '[' + parts.join(',') + ']';
  }
  var ks = Object.keys(v).sort();
  var out = [];
  for (var j = 0; j < ks.length; j++) {
    var k = ks[j];
    if (drop && drop[k]) continue;
    if (v[k] === undefined) continue;
    out.push(JSON.stringify(k) + ':' + stableKey(v[k], drop));
  }
  return '{' + out.join(',') + '}';
}

/* Bookkeeping keys that must NEVER count as content when asking "did anything
 * actually change": per-item stamps, field-stamp maps, build marker, and the
 * save-time-touched date fields. */
/* S612 (restored from S608) — HARNESS-ONLY EXPORT. Builds a throwaway engine
   with stub dependencies purely to reach the closure-internal per-item merge.
   The stub model never receives data and the replay path performs no I/O. */
export function __lwwTestHook(toolKey, field, localArr, cloudArr, snapArr) {
  var stubModel = { getProject: function(){ return {}; }, setProject: function(){}, applyMerged: function(){} };
  var eng = createSync({ toolKey: toolKey, Auth: {}, IDB: {}, model: stubModel, SyncWorkerHost: {} });
  return eng._lwwReplay(field, localArr, cloudArr, snapArr);
}

export var CONTENT_DROP_KEYS = { _ts: 1, _fts: 1, _build: 1, dateModified: 1, modified: 1,
  /* S589 receipt fields — bookkeeping, never content */ _dev: 1, _tab: 1, _via: 1, _wroteAt: 1 };

/* True when two report states are the same CONTENT — regardless of key
 * arrangement and ignoring bookkeeping. This is the no-change gate both
 * directions use: identical content must produce total silence (no push, no
 * pull-apply, no re-render), however many windows are open. */
export function contentEquals(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  try { return stableKey(a, CONTENT_DROP_KEYS) === stableKey(b, CONTENT_DROP_KEYS); }
  catch (e) { return false; }
}

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
  /* S566 — opt-in change-scoped saves (Mark's call: all tools the same).
     null = tool keeps today's full-document pushes, byte for byte. */
  var _partialSaveCfg  = config.partialSave || null;
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
/* S638 — photo ids present in the snapshot above, rebuilt lazily and keyed on
   that object's identity. Answers "has the cloud ever acknowledged this photo". */
var _snapPhotoIds = null, _snapPhotoIdsFor = null;
/* ═══ S589 — DEVICE RECEIPT (invisible; no UI, nothing for anyone to run) ════
   Every cloud write carries a small record of WHICH device wrote it and by
   which path. The history table then answers, from the server alone, the one
   question that cost this whole night: when a value reverts, which machine
   did it. `_dev` is stable per device (survives reloads); `_tab` distinguishes
   two windows on the same machine; `_via` names the code path that pushed.
   Read from Supabase; never rendered anywhere. */
var _DEV_ID = (function () {
  try {
    var k = 'arencon-device-id', v = localStorage.getItem(k);
    if (!v) {
      v = (navigator.userAgent.indexOf('Android') !== -1 ? 'and' :
           navigator.userAgent.indexOf('iPhone') !== -1 ? 'ios' : 'pc') +
          '-' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(k, v);
    }
    return v;
  } catch (_) { return 'dev-unknown'; }
})();
var _TAB_ID = Math.random().toString(36).slice(2, 7);
var _pushVia = 'save';   // set by the caller path just before a push
/* S589 — the engine tells the host every time it REPLACES the model (pull
   apply, silent merge, resolved conflict). The host uses this to re-baseline
   its own local "what have I saved / what is unsent" ledger. Without it the
   host keeps a stale document marked unsent and re-pushes it later — which is
   precisely how a desktop tab resurrected 150 psi over a synced 80. */
var _onModelReplaced = null;
/* S599 — engine-level diagnostics hook. The S598 telemetry sat in the host's
   apply step, but the discard happens HERE: the per-item merge can hand the
   local screen the win, and the no-change gate then returns before any apply
   is attempted — no apply, no badge, no report, nothing. The engine must
   account for its own decision. */
var _onDiag = null;
/* S583 — THE STAMP LEDGER. A reading's timestamp is set ONCE, at the save
 * that first contains it (seconds after entry via the autosave debounce), and
 * is never touched again by any later save, pull, or merge. To know whether a
 * save "first contains" a change, we diff against THIS DEVICE'S OWN previous
 * stamped state — never the cloud snapshot. Diffing against the cloud (the
 * old behaviour) had a second flaw beyond key order: another device's edit,
 * not yet pulled, made MY untouched copy of that item look "changed", so my
 * stale copy was re-stamped fresh and beat their genuine newer edit.
 * Updated at: every stamping (push), every pull-apply, every merge-apply.
 * Falls back to the cloud snapshot only before the first stamping of a
 * session (the stamps inside it are legitimate entry-time stamps written by
 * whichever device made them). */
var _lastStampedLocal = null;

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
      /* S605 — photo items carry a local-only dataURL the cloud strips, so
         whole-object dirtiness marked them locally-edited on every pull:
         caption/tag/rotation edits and delete flags from other devices could
         never win. Typed fields = what a person can change about a photo. */
      recordPhotos:       { key: 'id', fields: ['caption','tag','kind','date','rotation','deleted','delAt','delState','deletedBy','deletedDate','n'] },
      // S531: flow-test photo arrays brought under per-item protection. These
      // were the ONLY photo arrays left outside it, and they are exactly what
      // went missing on 7155.40 — three inspectors on one report, flow photos
      // present on one device and absent from the cloud copy that won. Both
      // arrays are id-keyed (host backfills legacy entries at collect time).
      flowTestPhotos:     { key: 'id', fields: ['caption','tag','rotation','deleted','delAt','delState','deletedBy','deletedDate','n'] },   // S605
      flowTestPhotosPld:  { key: 'id', fields: ['caption','tag','rotation','deleted','delAt','delState','deletedBy','deletedDate','n'] },   // S605
      /* S598 — TYPED FIELDS ONLY (Mark's 15:15 pull: cloud held 137, the pull
         ran, the screen kept 250). "Has my copy changed since the cloud and I
         last agreed?" was answered by comparing the WHOLE row object. On a
         live report these rows carry more than the inspector's readings —
         computed net pressure, adjusted values, verdict/override state, render
         bookkeeping — none of which exists in the cloud copy. Any one of them
         makes the local row read as permanently "changed", which hands it a
         fresh win on EVERY pull and makes another device's newer entry
         unreachable forever. Dirtiness must be judged only on what a person
         can type. Everything else is derived and never evidence of an edit. */
      pldData:            { key: 'pct', fields: ['flow','cutsheet','placard','suction','discharge','rpm','bfUp','bfDown'] },
      stdData:            { key: 'pct', fields: ['flow','cutsheet','placard','suction','discharge','rpm','bfUp','bfDown'] },
      batData:            { key: 'id' },
      contractorSignRows: { key: 'id' },
      witnessSignRows:    { key: 'id' },   // S540: named at collect, now registered
      // S532: the last unprotected structures. Host assigns permanent ids at
      // collect time (legacy reports migrate on first save), so these can now be
      // keyed by identity instead of by list position.
      generalDeficiencies:{ key: 'id',   // S538; S605: typed fields, same reasoning as `deficiencies`
        fields: ['description','status','priority','date','iarStatus','isRecommendation','isSiteRecord','deleted','delAt'],
        nested: { responses: { key: 'id', fields: ['comment','date','status','deleted','delAt'] }, photos: { key: 'id' } } },
      sketchEntries:      { key: 'id', fields: ['comment'] },   // S605: markupImg is binary, cloud-stripped
      /* S605 — these two were outside the spec entirely: last whole-array
         save won. Host mints ids at collect (S540 pattern). */
      pumpCurvePoints:    { key: 'id', fields: ['flow','psi','label'] },
      pldPumpCurvePoints: { key: 'id', fields: ['flow','psi','label'] }
    },
    // S532: object-of-arrays shape — `deficiencies` is keyed by contractor name,
    // each value a list of deficiencies. Same per-item rules as `arrays`, applied
    // inside each contractor's list; a contractor present only locally is kept
    // (absence never deletes, doctrine I-2).
    arrayMaps: {
      // S538: responses nested inside each deficiency, so a contractor reply and
      // a consultant reply entered on different devices both survive.
      /* S605 — THE S598 TREATMENT, applied here. Dirtiness was judged on the
         WHOLE object; the cloud copy strips photo dataURLs by design, so every
         deficiency read as locally-edited on every device on every pull, and
         local won forever: comment edits, status changes and deletes never
         propagated (Mark's 03-Aug field test). Judged now only on what a
         person can type. */
      deficiencies:       { key: 'id',
        fields: ['description','status','priority','date','iarStatus','isRecommendation','isSiteRecord','deleted','delAt'],
        nested: { responses: { key: 'id', fields: ['comment','date','status','deleted','delAt'] }, photos: { key: 'id' } } },
      // S540: keyed by tab ('3a' / '4b'). Rows now carry names that survive a
      // reload, so a pitot reading added on one device and one edited on another
      // both survive instead of the later save taking the whole tab.
      pitotRows:          { key: 'id' },
      customEquip:        { key: 'id' },
      customItems:        { key: 'id' }   // S541: custom checklist rows, per section
    },
    // S541: plain text lists — union, never paired. See _lwwMergeValueSet.
    valueSets: ['contractors', 'distribution'],
    /* S605 — sigStrokes had NO protection: whoever saved last took every
       signature (Mark's first signature attempt was wiped by exactly this
       race). Host wraps each canvas's strokes as {s:[...]} so the per-key
       stamp survives JSON (a _ts on a bare array does not serialize). */
    statusMaps: ['clState', 'sigStrokes', 'equipState', 'equipState4b', 'appendixState'],
    /* S616 — four of the ten S611 known gaps close here, on machinery that is
       already field-proven, with no new code: each is a container whose keys
       are arbitrated one at a time with their own stamps, instead of the whole
       object being taken from whoever saved last.
         contractorTrades — roster trade per contractor name.
         smCapVis / smState — which capacity lines a pump-curve chart draws and
           where its supply-margin box sits. These reach the CLIENT PDF, so a
           stale device taking the whole object changes the issued drawing.
         annDsForce — per-chart label overrides, same reasoning.
       The three positional-index lists (equipChecked, equipChecked4b,
       appendixExcluded) are deliberately NOT closed here: they record answers
       by checkbox POSITION, so no merge rule can pair them safely across
       devices — union would make an unchecked box impossible to uncheck, and
       pairing by position is forbidden doctrine. They need identity-keyed
       answers at the host (the clState shape), which is a data-shape change,
       not a spec line. They stay in coverage_audit.py's list. */
    fieldMaps:  ['proj', 'contractorTrades', 'smCapVis', 'smState', 'annDsForce'],
    /* S616 — TOP-LEVEL SCALARS. The spec had no category for a bare value
       sitting at the root of the report, so npshPsi and npshPsiPld — the Net
       Positive Suction Head readings a person types, which the pump analysis
       depends on — were on whole-document last-save-wins: a stale device's
       blank took them from everyone. Arbitrated now with the same rule as
       every other family. */
    scalars:    ['npshPsi', 'npshPsiPld', 'testType'],
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
      /* S612 — RESTORED. This entry was shipped at S608 and silently reverted
         by S610, which rebuilt this file from a copy taken before the S608
         push and gated against that copy rather than live HEAD. The gate can
         only catch what it is pointed at; frt/tests/sim/stalemate.mjs caught
         the revert on its next run. Re-asserting with the reasoning intact:

         THE S605 TREATMENT, applied to FRT's photos. FRT photo records carry
         local-only binary the cloud strips by design (dataUrl, thumb), so
         whole-object dirtiness read every photo as "locally edited" on every
         device on every pull — local won forever, and a caption edit,
         rotation or delete made on another tablet could NEVER land here (the
         exact disease Mark field-caught on Diesel, 03 Aug). Dirtiness is
         judged only on what a person can change about a photo. The never-bake
         markup vectors (_markupStrokes/_mkFrame) ARE content a person changes
         — excluding them would let a cloud pull silently revert a moved mark
         — and _lwwStripFields serializes non-scalar fields canonically so
         stroke edits are content-compared, not String()-flattened. */
      photos:              { key: 'id', fields: ['caption','filename','rotation','deleted','delAt','delState','deletedBy','deletedDate','_annotated','_markupStrokes','_mkFrame','_origBackupId','_releasedFromPin'] },
      // S538: deficiencies live INSIDE their contractor. Without this, two people
      // editing different deficiencies for the same contractor lost one of them.
      // S541: three levels — observations live inside a deficiency, which lives
      // inside a contractor. Nesting is recursive now, so an observation edited on
      // one device survives a different observation edited on another.
      /* S613 — `defaults` names the values FRT's own load-time normalisation
         writes onto every row, so the emptiness test stops mistaking them for
         an inspector's work. Value-matched: `priority` is ignorable only while
         it still reads 'high'; set it to 'low' and the row is content again.
         '*' = machine-chosen from a palette, never typed. Genuine creations are
         unaffected — a new contractor is born with a name, a new deficiency
         with a number and a date, a new observation with its author and date,
         and any one of those makes the row content. Proved both directions by
         frt/tests/sim/converge.mjs (G no-ghost + R real-row-survives). */
      contractors:         { key: 'id', defaults: { color: '*', trades: [], tradesAuto: [] },
        nested: { deficiencies: { key: 'id', defaults: { _photoPoolMigrated: true, isRecommendation: false, status: 'open', priority: 'low' },
          nested: { observations: { key: 'id', defaults: { priority: 'high', tradeSource: 'ai', repeatCount: 1, isRecommendation: false, addressed: false } },
                    photos: { key: 'id', fields: ['caption','rotation','deleted','delAt','delState','deletedBy','_annotated','_markupStrokes','_mkFrame','_origBackupId'] } } } } },
      generalDeficiencies: { key: 'id', defaults: { _photoPoolMigrated: true, isRecommendation: false, status: 'open', priority: 'low' },
        nested: { observations: { key: 'id', defaults: { priority: 'high', tradeSource: 'ai', repeatCount: 1, isRecommendation: false, addressed: false } },
                  photos: { key: 'id', fields: ['caption','rotation','deleted','delAt','delState','deletedBy','_annotated','_markupStrokes','_mkFrame','_origBackupId'] } } },   // S541; S608/S612 photo fields; S613 defaults
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

/* S598 — EVERY bookkeeping key must be invisible to a content comparison.
   _ts/_fts were stripped; the S589 device receipts (_dev/_tab/_via/_wroteAt)
   were NOT. The snapshot this device last agreed with the cloud is a PUSHED
   clone, which carries receipts; the live screen does not. So "has my copy
   changed since we agreed?" answered YES on every pull, forever, which handed
   the local screen a fresh win every time and made the cloud's newer entry
   unreachable — then the no-change gate saw the merge output equal to local
   and reported "identical, nothing applied". That is Mark's 15:15 pull: the
   137 arrived, lost the merge to a stale 250, and was discarded silently.
   Bookkeeping never counts as content. Anywhere. */
var _LWW_STRIP_DROP = { _ts: 1, _fts: 1, _dev: 1, _tab: 1, _via: 1, _wroteAt: 1, _build: 1, dateModified: 1 };
function _lwwStrip(o) {
  // Content-equality comparison must ignore the bookkeeping fields themselves.
  // S583: canonical (key-sorted) serialization. The old JSON.stringify replacer
  // was key-order sensitive; compared against a jsonb-normalized cloud snapshot
  // (Postgres re-orders keys) it NEVER matched, so every item read as "changed"
  // on every save — the root cause of the wholesale re-stamping proven in the
  // 1490.04 forensics. Arrangement can no longer masquerade as change.
  return stableKey(o, _LWW_STRIP_DROP);
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
/* S598 — signature over the typed fields only. Derived/computed properties on
   a row can never masquerade as an inspector's edit. */
function _lwwStripFields(o, fields) {
  if (!o || typeof o !== 'object') return stableKey(o);
  var out = {};
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    /* S612 (restored from S608; reverted by S610's stale-base rebuild) —
       non-scalar typed fields are serialized canonically. String() on an array
       of objects yields "[object Object],[object Object]": only the COUNT
       survives, so a mark MOVED on a device (same stroke count, new
       coordinates) would be invisible to the dirtiness check and a cloud pull
       could silently revert it. stableKey gives key-sorted canonical JSON —
       fully content-sensitive and deterministic on both sides of the compare.
       Scalars are unchanged in effect: both sides always use the same
       serializer, and the signature is only ever compared to itself. */
    if (o[f] !== undefined) out[f] = (o[f] === null) ? '' : (typeof o[f] === 'object' ? stableKey(o[f]) : String(o[f]));
  }
  return stableKey(out);
}

function _lwwStripNested(o, nested) {
  // S583: canonical, same reason as _lwwStrip. Nested child lists are dropped
  // from the parent's own content signature (they merge in their own right).
  if (!nested) return _lwwStrip(o);
  var drop = { _ts: 1, _fts: 1, _dev: 1, _tab: 1, _via: 1, _wroteAt: 1, _build: 1, dateModified: 1 };   // S598
  var nk = Object.keys(nested);
  if (!nk.length) return _lwwStrip(o);
  for (var i = 0; i < nk.length; i++) drop[nk[i]] = 1;
  return stableKey(o, drop);
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
/* S613 — EMPTINESS MUST IGNORE VALUES NOBODY TYPED.
   FRT stamps defaults onto rows at load: every contractor gets a palette
   colour, every observation gets priority/tradeSource/repeatCount, every
   deficiency gets a migration flag. This test then saw those machine-written
   values as content, so a genuinely blank row could NEVER be recognised as
   empty — it survived absence-never-deletes and unioned into everyone's
   report. Same ghost-row machine as Diesel's 21→32, with FRT's own defaults
   as the cause. Proved by frt/tests/sim/converge.mjs, five families.

   `defaults` is declared per family in _LWW_SPECS and is VALUE-MATCHED, not
   key-matched: priority is ignored only while it still reads 'high'. The
   moment an inspector sets it to 'low' the row counts as content and is kept.
   '*' means the value is machine-chosen and never typed (a contractor colour
   comes from a fixed palette), so any value is ignorable.
   Tools that declare nothing behave exactly as before — Diesel is untouched. */
function _lwwItemEmpty(item, defaults) {
  if (!item || typeof item !== 'object') return true;
  var keys = Object.keys(item);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === 'id' || k === 'pct' || k === 'label' || k === '_ts') continue;
    var v = item[k];
    if (defaults && Object.prototype.hasOwnProperty.call(defaults, k)) {
      var dv = defaults[k];
      if (dv === '*' || v === dv) continue;   // still the machine's value
    }
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

// ═══════════════════════════════════════════════════════════════════════
// S541 — VALUE SETS. Some lists hold plain text, not objects: the contractor
// roster and the report distribution list. Pairing them by identity is
// meaningless (there is nothing to name) and pairing them by position is unsafe
// (adding one name shifts everything after it). The correct treatment is a
// UNION: keep every entry either side has.
//
// So a contractor added in the office and one added on site both survive,
// instead of the later save deciding the whole roster.
//
// TRADEOFF, stated plainly: union means a deliberate REMOVAL on one device is
// undone by another device that still has the entry. That is doctrine I-2
// (absence never deletes) applied to text — for a roster, a name coming back is
// a visible annoyance, whereas a name disappearing silently corrupts every
// deficiency filed against it. If removals need to stick, these lists need real
// entries with names and deletion evidence, which is a larger change.
function _lwwMergeValueSet(localArr, cloudArr) {
  var out = [], seen = {};
  function add(v) {
    if (v === undefined || v === null) return;
    var k = (typeof v === 'string') ? v : JSON.stringify(v);
    if (seen[k]) return;
    seen[k] = true; out.push(v);
  }
  (Array.isArray(cloudArr) ? cloudArr : []).forEach(add);   // cloud order first
  (Array.isArray(localArr) ? localArr : []).forEach(add);   // then local-only
  return out;
}


/* ═══ S593 — ENTRY STAMPS ARE IMMUTABLE (Mark, receipts-proven 03 Aug 12:44) ══
   A stamp says WHEN A VALUE WAS ENTERED. It is written once and never again.
   The old code minted `now` whenever it could not find the item in the
   previous state — which is exactly the situation on a device that has been
   asleep for days: no ledger, so every value on its stale screen was stamped
   with TODAY. An iPhone carrying a days-old 250 psi therefore woke up, minted
   a 12:44:39 stamp onto it, and won "latest entry wins" against the phone's
   genuinely newer 200. The resurrection bug, arriving through the stamping
   layer after being closed in the delivery layer.

   Rule now enforced everywhere stamps are written:
     • content demonstrably UNCHANGED vs prev  → carry the previous stamp;
     • content demonstrably CHANGED vs prev    → mint now (a real entry);
     • prev UNKNOWN (cold boot, missing ledger) → KEEP the item's existing
       stamp; mint only if it has none. We cannot prove an entry happened, so
       we must not claim one. A stale screen can no longer manufacture recency.
   Genuine edits still stamp correctly: by the time anyone types, the pull has
   established the ledger, so prev is known and the change is seen. */
function _lwwStampOf(item, prevItem, unchanged, now) {
  /* ═══ S597 — THE SAVE-TIME PASS MAY NO LONGER MINT A STAMP AT ALL ══════════
     Receipts, 03 Aug: cloud held 111 stamped 14:46; at 14:50:50 the iPhone
     pushed a day-old 250 carrying a BRAND-NEW 14:46 stamp and won. Sequence:
     sign-in → boot pull established the ledger at 111 → the local screen still
     held its stale 250 → the save-time pass compared 250 against 111, called
     it "changed", and minted `now`. A value nobody typed was awarded a fresh
     entry time and beat a real one. S593 closed the no-ledger case; this is
     the same fabrication through the has-ledger door.

     Since S594 every genuine entry is stamped AT THE KEYSTROKE, so anything
     this pass would mint is by definition a value no person entered — a
     guess, and every guess it has made has been wrong. So it no longer
     guesses. It only carries stamps forward:
        • the item's own stamp (written by the keystroke) always wins;
        • else the previous state's stamp;
        • only an item that has never carried one at all gets `now`, which is
          the genuinely-new-row case (adding a flow point, a checklist item).
     One source of truth for "when was this entered": the person's finger. */
  if (typeof item._ts === 'number' && item._ts) return item._ts;
  if (prevItem && typeof prevItem._ts === 'number' && prevItem._ts) return prevItem._ts;
  /* ═══ S622 — AN UNCHANGED VALUE IS NOT A NEW ENTRY. The final fallback
     granted `now` to anything that had never carried a stamp — including a
     value UNCHANGED since the previous state. Run the pass twice (the push
     stamps the payload; the 412 door stamps its merge input against the
     ledger the first pass just pinned) and an unstamped skeleton "earned"
     recency on the second look and beat a real signature at the merge —
     converge's sigStrokes W no-wipe caught it. The pass's own S597 law,
     enforced at its last line: only a genuinely NEW or CHANGED item with no
     stamp anywhere mints; an unchanged one stays honestly unstamped. */
  if (unchanged && prevItem) return 0;
  return now;
}

// Stamp _ts onto changed items of a push clone by diffing vs prevData
// (the last-seen snapshot). Unchanged items carry their previous _ts forward.
/* ═══ S619 — CONTESTED-FIELD RECORDER ══════════════════════════════════════
   Answers one question, permanently: when two devices disagreed, what did
   each hold, and which one did the merge choose?

   Reads the SAME merge spec the merge itself reads, so it can never drift out
   of step with what is actually arbitrated — the previous recorder named one
   field by hand and went stale the moment the spec grew. Fields nobody
   contested are not reported: on a normal day this writes nothing at all.

   Deliberately shallow. It compares each family's own summary value and stops
   — walking whole reports on every tick would cost more than the sync it is
   watching. Depth is a diagnosis problem, not a monitoring one. */
var _DIAG_MAX_FIELDS = 6;
var _DIAG_MIN_GAP_MS = 20000;
var _lastDiagAt = 0;

function _diagSummarize(v, stampHint) {
  try {
    if (v === null || v === undefined) return { v: null, ts: stampHint || 0 };
    if (typeof v !== 'object') return { v: String(v).slice(0, 40), ts: stampHint || 0 };
    if (Array.isArray(v)) {
      var ts = 0;
      for (var i = 0; i < v.length; i++) { var t = v[i] && v[i]._ts; if (t > ts) ts = t; }
      return { v: 'array[' + v.length + ']', ts: ts || stampHint || 0 };
    }
    var keys = Object.keys(v), mts = 0;
    for (var k = 0; k < keys.length; k++) { var e = v[keys[k]], et = e && e._ts; if (et > mts) mts = et; }
    return { v: 'map{' + keys.length + '}', ts: mts || stampHint || 0 };
  } catch (_) { return { v: '?', ts: 0 }; }
}

/* A scalar's entry stamp does NOT live on the value — it lives in the
   document's own _fts ledger (_root for top-level scalars, _fts[field] for a
   field map's keys). Reading only the value gave every scalar a stamp of 0,
   which would have made the recorder useless for exactly the NPSH-class
   failures it was built to catch. Found by the harness, not by reading. */
function _diagStampHint(state, field) {
  try {
    var f = state && state._fts;
    if (!f) return 0;
    if (f._root && f._root[field]) return f._root[field];
    var m = f[field];
    if (m && typeof m === 'object') {
      var best = 0, ks = Object.keys(m);
      for (var i = 0; i < ks.length; i++) { if (m[ks[i]] > best) best = m[ks[i]]; }
      return best;
    }
    return 0;
  } catch (_) { return 0; }
}

function _diagContestedFields(cloudRaw, local, merged) {
  var out = [];
  try {
    var spec = _LWW_SPECS[_toolKey];
    if (!spec || !cloudRaw || !local) return out;
    var names = []
      .concat(spec.scalars || [])
      .concat(spec.valueSets || [])
      .concat(spec.statusMaps || [])
      .concat(spec.fieldMaps || [])
      .concat(Object.keys(spec.arrays || {}))
      .concat(Object.keys(spec.arrayMaps || {}));
    for (var i = 0; i < names.length && out.length < _DIAG_MAX_FIELDS; i++) {
      var f = names[i];
      var c = _diagSummarize(cloudRaw[f], _diagStampHint(cloudRaw, f));
      /* S622 — the recorder read local stamps from the fresh screen state,
         which never carries them (the S620 lesson taught to the MERGE but
         never to the recorder). Its "localTs:0" rows were partly false and
         misdirected three sessions. Same ledger fallback as the merge. */
      var l = _diagSummarize(local[f], _diagStampHint(local, f) ||
        _diagStampHint(_lastStampedLocal, f));
      if (c.v === l.v && c.ts === l.ts) continue;          // nobody disagreed
      var m = _diagSummarize(merged ? merged[f] : null, _diagStampHint(merged, f));
      var tookCloud = (m.v === c.v && m.ts === c.ts);
      var tookLocal = (m.v === l.v && m.ts === l.ts);
      var row = {
        field: f,
        cloud: c.v, cloudTs: c.ts,
        local: l.v, localTs: l.ts,
        won: tookCloud ? 'cloud' : (tookLocal ? 'local' : 'merged'),
        /* The decisive cross-check: if the merge kept the side with the OLDER
           entry stamp, an edit is about to lose to something typed before it —
           the exact shape of every wipe this engine has ever had. */
        olderWon: (tookCloud && c.ts && l.ts && c.ts < l.ts) ||
                  (tookLocal && c.ts && l.ts && l.ts < c.ts)
      };
      /* ═══ S622j — NAME THE KEY (Mark's run-3, 07 Aug: rated speed 36 vs
         55526 split with only "proj map{79} vs map{79}" on the record —
         which key fought, which values, and which stamps were all hidden
         behind the container summary, so the run stayed unexplained). For a
         contested field map, descend ONE level and record up to three
         DIFFERING keys with their 40-char values and per-key stamps. The
         next recurrence names itself. */
      if ((spec.fieldMaps || []).indexOf(f) >= 0 &&
          cloudRaw[f] && typeof cloudRaw[f] === 'object' &&
          local[f] && typeof local[f] === 'object') {
        try {
          var cf = (cloudRaw._fts && cloudRaw._fts[f]) || {};
          var lf = (local._fts && local._fts[f]) ||
                   (_lastStampedLocal && _lastStampedLocal._fts && _lastStampedLocal._fts[f]) || {};
          var mf2 = (merged && merged[f] && typeof merged[f] === 'object') ? merged[f] : {};
          var keysAll = {};
          Object.keys(cloudRaw[f]).forEach(function (k) { keysAll[k] = 1; });
          Object.keys(local[f]).forEach(function (k) { keysAll[k] = 1; });
          var diffs = [];
          Object.keys(keysAll).some(function (k) {
            var cv2 = cloudRaw[f][k], lv2 = local[f][k];
            if (JSON.stringify(cv2) === JSON.stringify(lv2)) return false;
            diffs.push({ key: k,
              cloud: String(cv2 == null ? '' : cv2).slice(0, 40), cloudTs: cf[k] || 0,
              local: String(lv2 == null ? '' : lv2).slice(0, 40), localTs: lf[k] || 0,
              mergedTo: String(mf2[k] == null ? '' : mf2[k]).slice(0, 40) });
            return diffs.length >= 3;
          });
          if (diffs.length) row.keys = diffs;
        } catch (_) {}
      }
      out.push(row);
    }
  } catch (_) {}
  return out;
}

function _stampLWW(data, prevData) {
  var spec = _LWW_SPECS[_toolKey];
  if (!spec || !data) return data;
  var now = _nowSync();   // S622i: server-anchored
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
              citem._ts = _lwwStampOf(citem, px, !!(px && _lwwStrip(px) === _lwwStrip(citem)), now);
            });
          });
        }
        // Parent compares on its OWN content — a child edit must not make the
        // whole parent look newer, or it would win and discard the other side's
        // parent-level scalars.
        item._ts = _lwwStampOf(item, p, !!(p && _lwwStripNested(p, nestedSpec) === _lwwStripNested(item, nestedSpec)), now);
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
                ci2._ts = _lwwStampOf(ci2, px, !!(px && _lwwStrip(px) === _lwwStrip(ci2)), now);
              });
            });
          }
          item._ts = _lwwStampOf(item, p, !!(p && _lwwStripNested(p, nSpec) === _lwwStripNested(item, nSpec)), now);
        });
      });
    });
    spec.statusMaps.forEach(function (field) {
      var map = data[field];
      if (!map || typeof map !== 'object' || Array.isArray(map)) return;
      var pmap = (prev[field] && typeof prev[field] === 'object') ? prev[field] : {};
      Object.keys(map).forEach(function (k) {
        var v = map[k];
        if (!v || typeof v !== 'object') {
          /* ═══ S622f (matrix M3, all rotations): PLAIN-VALUE STATUS KEYS —
             checklist ticks like 'pass'/'fail'/'na' — were never stamped at
             all: this pass only handled object values, and the pull path
             then kept local unconditionally, so a re-tick made on one device
             never converged onto a device that already held a value. Every
             device showed its own last answer forever. Plain values now get
             the same per-key entry stamps as project fields, in
             _fts[<map>][<key>]: mint on change, carry when unchanged, and a
             first-seen blank ('' only — 'na' is a real answer) is a
             skeleton, never an entry. */
          data._fts = data._fts || {};
          var _smf = data._fts[field] = data._fts[field] || {};
          var _pmf = (prev._fts && prev._fts[field]) || {};
          var _pvp = pmap[k];
          var _same = (v === _pvp);
          if (_same) { if (_pmf[k]) _smf[k] = _pmf[k]; }
          else if ((v === '' || v == null) && _pvp === undefined) { /* skeleton — no mint */ }
          else _smf[k] = now;
          return;
        }
        var pv = pmap[k];
        /* ═══ S622 — A FIRST-SEEN EMPTY VALUE IS A SKELETON, NOT AN ENTRY.
           This pass minted `now` onto a never-signed pad the moment it first
           appeared — granting a boot skeleton an entry time, which the 412
           door then honoured over a REAL signature (fieldsymptom exposed it;
           converge's sigStrokes W no-wipe is the guard). S610 doctrine at
           the stamping source: an empty value with no previous state keeps
           whatever stamp it already carries (usually none) — while a genuine
           CLEAR of a previously-held value still mints, so a stamped Clear
           still propagates. */
        var _vEmpty = (Array.isArray(v.s)) ? v.s.length === 0
                    : (v.status == null || v.status === '');
        if (pv === undefined && _vEmpty) return;
        v._ts = _lwwStampOf(v, pv, !!(pv && _lwwStrip(pv) === _lwwStrip(v)), now);
      });
    });
    spec.fieldMaps.forEach(function (field) {
      var obj = data[field];
      if (!obj || typeof obj !== 'object') return;
      var pobj = (prev[field] && typeof prev[field] === 'object') ? prev[field] : {};
      var pfts = (prev._fts && prev._fts[field]) || {};
      var ofts = (data._fts && data._fts[field]) || {};   // stamps this doc already carries
      var havePrev = !!(prev && prev[field]);
      var fts = {};
      Object.keys(obj).forEach(function (k) {
        /* S593 — same immutability rule for field-level stamps: carry when
           unchanged, mint on a seen change, and when there is NO previous
           state to compare against (cold boot) keep whatever stamp the value
           already had rather than fabricating recency. */
        if (stableKey(obj[k]) === stableKey(pobj[k])) fts[k] = pfts[k] || ofts[k] || 0;   // S583: canonical
        else if (!havePrev) fts[k] = ofts[k] || now;
        else fts[k] = now;
      });
      data._fts = data._fts || {};
      data._fts[field] = fts;
    });
    /* S616 — stamps for top-level scalars, into _fts._root. Mirror of the
       fieldMaps loop directly above, under the same S593 immutability rule:
       carry the stamp when the value is demonstrably unchanged, mint only on
       a seen change, and when there is no previous state to compare against
       keep whatever stamp the value already had rather than manufacturing
       recency for a stale screen. */
    if ((spec.scalars || []).length) {
      var proot = (prev._fts && prev._fts._root) || {};
      var oroot = (data._fts && data._fts._root) || {};
      var rfts = {};
      spec.scalars.forEach(function (field) {
        if (!Object.prototype.hasOwnProperty.call(data, field)) return;
        var havePrevS = Object.prototype.hasOwnProperty.call(prev, field);
        if (stableKey(data[field]) === stableKey(prev[field])) rfts[field] = proot[field] || oroot[field] || 0;
        else if (!havePrevS) rfts[field] = oroot[field] || now;
        else rfts[field] = now;
      });
      data._fts = data._fts || {};
      data._fts._root = rfts;
    }
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
    var cDef = nestedSpec[cf].defaults || null;   // S613: this child's machine-written values
    cOrder.forEach(function (k) {
      var xc = cCloud[k], xl = cLocal[k], xs = cSnap[k];
      if (xc && xl) {
        if (_lwwItemEmpty(xl, cDef) && !_lwwItemEmpty(xc, cDef) && !_lwwHasDeleteEvidence(xl)) { outC.push(xc); return; }
        // S541: RECURSE. Nesting is now unlimited depth — FRT holds observations
        // inside a deficiency inside a contractor, three levels down, and without
        // this two people editing different observations of the SAME deficiency
        // still lost one. Each level resolves on its own content, so a change at
        // any depth survives regardless of which ancestor wins.
        var deeper = nestedSpec[cf].nested || null;
        var deepMerged = deeper ? _lwwMergeNestedChildren(xl, xc, xs, deeper, stats, now) : null;
        var xTypedF = nestedSpec[cf].fields || null;   // S605: typed fields at every depth
        var xDirty = !xs || (xTypedF
          ? _lwwStripFields(xs, xTypedF) !== _lwwStripFields(xl, xTypedF)
          : _lwwStripNested(xs, deeper) !== _lwwStripNested(xl, deeper));
        /* S605 — S600's fabrication fix never reached this child loop: a dirty
           child was awarded a timestamp of NOW, so any stale restored child
           beat any genuinely newer entry. Same rule as items now: the child's
           own entry stamp is the only truth. */
        var xlTs = (xl._ts) || (xs && xs._ts) || (xDirty ? now : 0);
        var xWin = ((xc._ts || 0) > xlTs) ? xc : xl;
        if (deepMerged) Object.keys(deepMerged).forEach(function (df) { xWin[df] = deepMerged[df]; });
        outC.push(xWin);
      } else if (xl && !xc) {
        if (_lwwItemEmpty(xl, cDef) && !_lwwHasDeleteEvidence(xl)) { stats.droppedEmptyAbsent = (stats.droppedEmptyAbsent||0)+1; }   /* S611; S613 defaults-aware */
        else { outC.push(xl); stats.keptLocalAbsent++; }
      }
      else if (xc && !xl) { outC.push(xc); stats.tookCloudNew++; }
    });
    out[cf] = outC;
  });
  return out;
}

var _lwwMergeStats = null;

/* ═══ S622 — LEDGER HONESTY (law 2's enforcement point). When the merge kept
   a local value because it was DIRTY — an unpushed edit that has not been
   through a stamping pass — that value must NOT enter the snapshot or the
   stamp ledger as if it were already agreed and stamped. This helper reverts
   exactly those entries in the CLONE that is about to become the snapshot/
   ledger, back to the pre-edit state the marker captured at merge time. The
   APPLIED document is untouched — the person keeps their typed value on
   screen; only the device's book-keeping stays truthful, so the very next
   save sees value ≠ ledger and mints the true entry time. This also honours
   the S589 ancestor discipline: an unpushed edit was never "agreed", so it
   does not belong in the 412 merge ancestor either. Survives restarts for
   free: the reverted snapshot is what _persistSyncMeta persists. */

/* S626b — re-assert entry times an offline edit earned before the app closed.
   Applied ONCE, immediately after the boot pull replaces the ledger. Per key,
   and only when the restored stamp is strictly newer AND the restored value is
   what this device still holds — so a stale disk ledger can never resurrect a
   value the person has since changed. */
function _reassertBootLedger() {
  var ahead = 0;
  try {
    if (!_bootLedger || !_lastStampedLocal) { _bootLedger = null; return; }
    var spec = _LWW_SPECS[_toolKey] || {};
    var bR = (_bootLedger._fts && _bootLedger._fts._root) || {};
    _lastStampedLocal._fts = _lastStampedLocal._fts || {};
    var nR = _lastStampedLocal._fts._root = _lastStampedLocal._fts._root || {};
    (spec.scalars || []).forEach(function (f) {
      if (!Object.prototype.hasOwnProperty.call(_bootLedger, f)) return;
      if ((bR[f] || 0) <= (nR[f] || 0)) return;
      if (stableKey(_bootLedger[f]) !== stableKey(_lastStampedLocal[f])) ahead++;
      _lastStampedLocal[f] = _bootLedger[f];
      nR[f] = bR[f];
    });
    (spec.fieldMaps || []).forEach(function (fm) {
      var b = _bootLedger[fm]; if (!b || typeof b !== 'object') return;
      var bF = (_bootLedger._fts && _bootLedger._fts[fm]) || {};
      _lastStampedLocal[fm] = _lastStampedLocal[fm] || {};
      _lastStampedLocal._fts[fm] = _lastStampedLocal._fts[fm] || {};
      var nF = _lastStampedLocal._fts[fm];
      Object.keys(b).forEach(function (k) {
        if ((bF[k] || 0) <= (nF[k] || 0)) return;
        if (stableKey(b[k]) !== stableKey(_lastStampedLocal[fm][k])) ahead++;
        _lastStampedLocal[fm][k] = b[k];
        nF[k] = bF[k];
      });
    });
    /* ═══ S626b — THE RE-ARM THE BOOT PATH NEVER HAD (Mark's 77, and the
       reason S625b's restore alone changed nothing). The boot pull runs with
       allowStaleOverwrite, which by S524 doctrine SKIPS the per-item stamp
       merge — at boot the injected model is the default skeleton, and merging
       it read blanks as edits and preserved emptiness over real content. That
       skip is correct and stays. But the same path then hard-sets
       lastPullKeptLocal = false, so a device carrying an unsent offline edit
       reopened believing it had nothing to send: the host's boot block kept
       the typed value ON SCREEN while the push dedupe stayed silent, and the
       cloud held the old value forever. Zero cloud writes after reopen —
       exactly what tools/sim/offlineboot.mjs measures.
       This is NOT the skeleton hazard: nothing here reads the live model. The
       only evidence used is the ledger restored FROM DISK, which contains
       stamps this device minted at real edit moments, compared against the
       cloud's own stamps. A key qualifies only when the disk stamp is
       strictly newer AND the value genuinely differs — a skeleton blank has
       no disk stamp at all and can never qualify. Re-arm only; no value is
       merged into the applied document, and no time is invented. */
    if (ahead) {
      try { SyncEngine.lastPullKeptLocal = true; } catch (_) {}
      console.log('[Sync S626b] boot: ' + ahead + ' unsent offline edit(s) restored from disk — re-arming the push');
    }
  } catch (_) { /* book-keeping must never break a boot */ }
  _bootLedger = null;
}

function _lwwRevertDirtyKept(clone) {
  try {
    var dk = _lwwMergeStats && _lwwMergeStats._dirtyKept;
    if (!clone || !dk || !dk.length) return clone;
    dk.forEach(function (m) {
      if (m.key == null) {                                   // top-level scalar
        if (m.hadSnap) { clone[m.field] = m.snapVal; }
        else { try { delete clone[m.field]; } catch (_) {} }
        clone._fts = clone._fts || {}; clone._fts._root = clone._fts._root || {};
        if (m.hadSnap && m.snapTs) clone._fts._root[m.field] = m.snapTs;
        else { try { delete clone._fts._root[m.field]; } catch (_) {} }
      } else {                                               // fieldMap key
        var o = clone[m.field];
        if (!o || typeof o !== 'object') return;
        if (m.hadSnap) { o[m.key] = m.snapVal; }
        else { try { delete o[m.key]; } catch (_) {} }
        clone._fts = clone._fts || {}; clone._fts[m.field] = clone._fts[m.field] || {};
        if (m.hadSnap && m.snapTs) clone._fts[m.field][m.key] = m.snapTs;
        else { try { delete clone._fts[m.field][m.key]; } catch (_) {} }
      }
    });
  } catch (_) { /* book-keeping must never break an apply */ }
  return clone;
}

/* ═══ S622 — SPEC-AWARE ARBITRATION AT THE 412 DOOR. merge3 stays model-
   neutral; the entry-time law for spec-governed single values is applied
   HERE, where the spec lives. For each conflict on a spec scalar (or a
   spec fieldMap's key), the newer ENTRY STAMP wins — blank never beats
   content unless genuinely newer (doctrine I-2, both directions) — the
   conflict is consumed (a person is never asked to arbitrate bookkeeping),
   and the merged root/field ledger is aligned to the winner. For spec
   values merge3 resolved without conflict, the ledger is still value-
   aligned, because merge3's own _fts handling is a max-merge that can
   dress a value in the other side's stamp. Real recorded times move;
   nothing is ever minted here. */

/* ═══ S625 — STAMP PURITY AT THE 412 DOOR (Mark's Test A, 08 Aug: IP's 528
   arrived at the merge wearing the EXACT stamp of AD's 25 — sync_diag
   05:26:39Z shows localTs === cloudTs to the millisecond, then olderWon:true
   at 05:27:40Z, then a permanent split refresh could not heal).
   THE MECHANISM: merge3's _fts handling is a max-merge — its own comment
   admits it "can dress a value in the other side's stamp" — and the two 412
   ledger assignments below took that dressed document as the new stamp
   ledger WITHOUT the value-alignment the pull path gets. A narrow two-person
   race almost always 412s on one side, a wide gap does not: which is
   precisely "narrow gaps often fail, wide gaps work". Once a value wears a
   stamp that is not its own, dirtiness detection is defeated (_stampedK
   reads the ledger and believes it), ties deadlock each device on its own
   copy, and the split is permanent.
   THE LAW, one sentence: a value never wears another value's stamp. This
   pass re-asserts it over every spec-governed key after ANY 412 merge:
   where the merged value equals mine, it carries MY recorded stamp for it;
   where it equals theirs, THEIR stamp; where it matches neither (merge3
   composed something), the stamp is dropped to 0 — "entry time awaits its
   mint" — because an honest zero loses races until the next save mints the
   truth, while a borrowed stamp wins races it has no right to. Real
   recorded times are MOVED here; a time is never invented. */
function _alignSpecStamps(merged, mine, theirs) {
  try {
    var spec = _LWW_SPECS[_toolKey];
    if (!spec || !merged || !mine || !theirs) return merged;
    var mv, tv, gv;
    var mR = (mine._fts && mine._fts._root) || {};
    var tR = (theirs._fts && theirs._fts._root) || {};
    merged._fts = merged._fts || {};
    merged._fts._root = merged._fts._root || {};
    (spec.scalars || []).forEach(function (f) {
      if (!Object.prototype.hasOwnProperty.call(merged, f)) return;
      gv = stableKey(merged[f]); mv = stableKey(mine[f]); tv = stableKey(theirs[f]);
      if (gv === mv)      merged._fts._root[f] = mR[f] || 0;
      else if (gv === tv) merged._fts._root[f] = tR[f] || 0;
      else                merged._fts._root[f] = 0;
    });
    (spec.fieldMaps || []).forEach(function (fm) {
      var g = merged[fm]; if (!g || typeof g !== 'object' || Array.isArray(g)) return;
      var m = (mine[fm] && typeof mine[fm] === 'object') ? mine[fm] : {};
      var t = (theirs[fm] && typeof theirs[fm] === 'object') ? theirs[fm] : {};
      var mF = (mine._fts && mine._fts[fm]) || {};
      var tF = (theirs._fts && theirs._fts[fm]) || {};
      var out = merged._fts[fm] = merged._fts[fm] || {};
      Object.keys(g).forEach(function (k) {
        gv = stableKey(g[k]); mv = stableKey(m[k]); tv = stableKey(t[k]);
        if (gv === mv)      out[k] = mF[k] || 0;
        else if (gv === tv) out[k] = tF[k] || 0;
        else                out[k] = 0;
      });
    });
  } catch (_) { /* purity must never break a merge apply */ }
  return merged;
}

function _resolveSpecConflicts(mergeResult, mine, theirs) {
  var spec = _LWW_SPECS[_toolKey];
  if (!spec || !mergeResult || !mergeResult.merged) return;
  var merged = mergeResult.merged;
  var mRoot = (mine && mine._fts && mine._fts._root) || {};
  var tRoot = (theirs && theirs._fts && theirs._fts._root) || {};
  var _isBlank = function (v) { return v == null || v === ''; };
  var _pick = function (mv, mts, tv, tts) {
    // blank vs content: content wins unless the blank carries a strictly newer stamp
    if (_isBlank(mv) && !_isBlank(tv)) return (mts > tts) ? 'm' : 't';
    if (_isBlank(tv) && !_isBlank(mv)) return (tts > mts) ? 't' : 'm';
    return (tts > mts) ? 't' : 'm';                       // newest entry wins; tie → mine (this device is holding it)
  };
  var scalarSet = {}; (spec.scalars || []).forEach(function (f) { scalarSet[f] = 1; });
  var fmSet = {};     (spec.fieldMaps || []).forEach(function (f) { fmSet[f] = 1; });
  /* S622f — the door passes below own these families end to end, so their
     conflicts are consumed here: left in the list they would fall through to
     "true conflicts", the facade would auto-resolve to the cloud, and the
     pass's merged result would be silently discarded — exactly the matrix
     V2/A2 losses. */
  var vsSet = {};  (spec.valueSets || []).forEach(function (f) { vsSet[f] = 1; });
  var smSet = {};  (spec.statusMaps || []).forEach(function (f) { smSet[f] = 1; });
  var arSet = {};  Object.keys(spec.arrays || {}).forEach(function (f) { arSet[f] = 1; });
  var kept = [];
  (mergeResult.conflicts || []).forEach(function (c) {
    var p = String((c && (c.path || c.field)) || '');
    var seg = p.split('.');
    if (vsSet[seg[0]] || smSet[seg[0]] || arSet[seg[0]]) { return; }   // S622f: consumed by the door passes
    if (seg.length === 1 && scalarSet[seg[0]]) {
      var f = seg[0];
      var w = _pick(mine ? mine[f] : undefined, mRoot[f] || 0, theirs ? theirs[f] : undefined, tRoot[f] || 0);
      merged[f] = (w === 'm') ? (mine ? mine[f] : undefined) : (theirs ? theirs[f] : undefined);
      merged._fts = merged._fts || {}; merged._fts._root = merged._fts._root || {};
      merged._fts._root[f] = (w === 'm') ? (mRoot[f] || 0) : (tRoot[f] || 0);
      return;                                             // consumed — a person never arbitrates this
    }
    if (seg.length === 2 && fmSet[seg[0]]) {
      var ff = seg[0], k = seg[1];
      var mf = (mine && mine._fts && mine._fts[ff]) || {};
      var tf = (theirs && theirs._fts && theirs._fts[ff]) || {};
      var mv = mine && mine[ff] ? mine[ff][k] : undefined;
      var tv = theirs && theirs[ff] ? theirs[ff][k] : undefined;
      var w2 = (function (a, ats, b, bts) {          // S622b: header rule at the conflict path too
        if (_isBlank(a) && !_isBlank(b)) return 't';
        if (_isBlank(b) && !_isBlank(a)) return 'm';
        return (bts > ats) ? 't' : 'm';
      })(mv, mf[k] || 0, tv, tf[k] || 0);
      merged[ff] = merged[ff] || {};
      merged[ff][k] = (w2 === 'm') ? mv : tv;
      merged._fts = merged._fts || {}; merged._fts[ff] = merged._fts[ff] || {};
      merged._fts[ff][k] = (w2 === 'm') ? (mf[k] || 0) : (tf[k] || 0);
      return;
    }
    kept.push(c);
  });
  mergeResult.conflicts = kept;
  /* ═══ THE LAW GOVERNS UNCONDITIONALLY AT THIS DOOR (fieldsymptom T2d).
     merge3's 3-way rule — "only one side changed → that side wins" — hands a
     spec field to a RE-ASSERTED OLDER value without ever raising a conflict:
     a device still holding yesterday's number pushes it, the 412 fires on
     the newer device, base == mine, theirs "changed" → theirs wins, and a
     newer entry is destroyed with zero conflicts emitted. (This is also the
     exact mixed-build hazard while older devices coexist with this build.)
     For spec-governed values the base is irrelevant BY DECLARATION — these
     families are last-entry-wins — so the entry stamps settle the field
     outright, whatever merge3 chose, and the ledger is aligned to the
     winner so stamp and value can never disagree at this door. */
  (spec.scalars || []).forEach(function (f) {
    var mHas = mine && Object.prototype.hasOwnProperty.call(mine, f);
    var tHas = theirs && Object.prototype.hasOwnProperty.call(theirs, f);
    if (!mHas && !tHas) return;
    merged._fts = merged._fts || {}; merged._fts._root = merged._fts._root || {};
    if (!mHas) { merged[f] = theirs[f]; merged._fts._root[f] = tRoot[f] || 0; return; }
    if (!tHas) { merged[f] = mine[f];   merged._fts._root[f] = mRoot[f] || 0; return; }
    var w3 = _pick(mine[f], mRoot[f] || 0, theirs[f], tRoot[f] || 0);
    merged[f] = (w3 === 'm') ? mine[f] : theirs[f];
    merged._fts._root[f] = (w3 === 'm') ? (mRoot[f] || 0) : (tRoot[f] || 0);
  });
  (spec.fieldMaps || []).forEach(function (ff) {
    var mo = (mine && mine[ff] && typeof mine[ff] === 'object') ? mine[ff] : null;
    var to = (theirs && theirs[ff] && typeof theirs[ff] === 'object') ? theirs[ff] : null;
    if (!mo && !to) return;
    var mf = (mine && mine._fts && mine._fts[ff]) || {};
    var tf = (theirs && theirs._fts && theirs._fts[ff]) || {};
    merged[ff] = (merged[ff] && typeof merged[ff] === 'object') ? merged[ff] : {};
    merged._fts = merged._fts || {}; merged._fts[ff] = merged._fts[ff] || {};
    /* S622b — this family's documented trade-off ("a blank never beats
       content; a clear does not propagate") holds at THIS door too, or the
       E4 wipe simply re-enters through the collision path with a freshly
       minted blank. Scalars keep the stamped-clear rule; headers do not. */
    var _pickFM = function (mv, mts, tv, tts) {
      if (_isBlank(mv) && !_isBlank(tv)) return 't';
      if (_isBlank(tv) && !_isBlank(mv)) return 'm';
      return (tts > mts) ? 't' : 'm';
    };
    var ks = {};
    if (mo) Object.keys(mo).forEach(function (k) { ks[k] = 1; });
    if (to) Object.keys(to).forEach(function (k) { ks[k] = 1; });
    Object.keys(ks).forEach(function (k) {
      var mv = mo ? mo[k] : undefined, tv = to ? to[k] : undefined;
      if (mv === undefined) { merged[ff][k] = tv; merged._fts[ff][k] = tf[k] || 0; return; }
      if (tv === undefined) { merged[ff][k] = mv; merged._fts[ff][k] = mf[k] || 0; return; }
      var wk = _pickFM(mv, mf[k] || 0, tv, tf[k] || 0);
      merged[ff][k] = (wk === 'm') ? mv : tv;
      merged._fts[ff][k] = (wk === 'm') ? (mf[k] || 0) : (tf[k] || 0);
    });
  });

  /* ═══ S622f (matrix V2, all rotations): VALUE SETS AT THE COLLISION DOOR.
     The pull path has always UNIONED contractors/distribution, but a save
     that hit 412 went through merge3, saw both sides changed, and handed the
     whole list to the cloud — the losing device's just-added contractor
     vanished from its own screen. The door now applies the same union as the
     pull path: nobody's entry is ever dropped by a collision. */
  (spec.valueSets || []).forEach(function (vf) {
    var ml = mine ? mine[vf] : undefined, tl = theirs ? theirs[vf] : undefined;
    if (!Array.isArray(ml) && !Array.isArray(tl)) return;
    merged[vf] = _lwwMergeValueSet(ml, tl);
  });

  /* ═══ S622f (matrix M3): STATUS MAPS AT THE COLLISION DOOR. Plain keys
     (checklist ticks) resolve by their per-key entry stamps with the blank
     rule; object keys (signatures) resolve by their own _ts, emptiness never
     beating content — mirroring the pull path so both doors speak one law. */
  (spec.statusMaps || []).forEach(function (sf) {
    var mo2 = (mine && mine[sf] && typeof mine[sf] === 'object') ? mine[sf] : null;
    var to2 = (theirs && theirs[sf] && typeof theirs[sf] === 'object') ? theirs[sf] : null;
    if (!mo2 && !to2) return;
    var mf2 = (mine && mine._fts && mine._fts[sf]) || {};
    var tf2 = (theirs && theirs._fts && theirs._fts[sf]) || {};
    merged[sf] = (merged[sf] && typeof merged[sf] === 'object') ? merged[sf] : {};
    merged._fts = merged._fts || {}; merged._fts[sf] = merged._fts[sf] || {};
    var ks2 = {};
    if (mo2) Object.keys(mo2).forEach(function (k) { ks2[k] = 1; });
    if (to2) Object.keys(to2).forEach(function (k) { ks2[k] = 1; });
    var _emptySV = function (v) {
      if (v == null || v === '') return true;
      if (typeof v !== 'object') return false;
      if (Array.isArray(v.s)) return v.s.length === 0;
      return false;
    };
    Object.keys(ks2).forEach(function (k) {
      var mv2 = mo2 ? mo2[k] : undefined, tv2 = to2 ? to2[k] : undefined;
      if (mv2 === undefined) { merged[sf][k] = tv2; if (tf2[k]) merged._fts[sf][k] = tf2[k]; return; }
      if (tv2 === undefined) { merged[sf][k] = mv2; if (mf2[k]) merged._fts[sf][k] = mf2[k]; return; }
      if (mv2 && typeof mv2 === 'object' || tv2 && typeof tv2 === 'object') {
        var mts2 = (mv2 && mv2._ts) || 0, tts2 = (tv2 && tv2._ts) || 0;
        if (_emptySV(mv2) && !_emptySV(tv2) && !(mts2 > tts2)) { merged[sf][k] = tv2; return; }
        if (_emptySV(tv2) && !_emptySV(mv2) && !(tts2 > mts2)) { merged[sf][k] = mv2; return; }
        merged[sf][k] = (tts2 > mts2) ? tv2 : mv2;
        return;
      }
      var w3 = (function (a, ats, b, bts) {
        if ((a === '' || a == null) && b !== '' && b != null) return 't';
        if ((b === '' || b == null) && a !== '' && a != null) return 'm';
        return (bts > ats) ? 't' : 'm';
      })(mv2, mf2[k] || 0, tv2, tf2[k] || 0);
      merged[sf][k] = (w3 === 'm') ? mv2 : tv2;
      merged._fts[sf][k] = (w3 === 'm') ? (mf2[k] || 0) : (tf2[k] || 0);
    });
  });

  /* ═══ S622f (matrix A2, all rotations): KEYED ARRAYS AT THE COLLISION
     DOOR. A corrected reading (same row, same field) lost its 412 race —
     merge3 saw both sides changed and the conflict fell to the cloud, so
     the correction typed SECOND reverted to the value typed first. Items
     carry one whole-item entry stamp (_ts, S583/S593); the door resolves a
     same-key collision by that stamp: the item entered later wins whole.
     One side only → kept (absence never deletes; appends from both sides
     both survive). Per-FIELD stamps inside items are future work — noted,
     not silently attempted. */
  Object.keys(spec.arrays || {}).forEach(function (af) {
    var ma = mine ? mine[af] : undefined, ta = theirs ? theirs[af] : undefined;
    if (!Array.isArray(ma) && !Array.isArray(ta)) return;
    var keyF = spec.arrays[af].key;
    if (!_lwwKeyable(ma || [], keyF) || !_lwwKeyable(ta || [], keyF)) return;
    var idx = {}, order = [];
    (Array.isArray(ta) ? ta : []).forEach(function (it, i) {
      var k = _lwwKey(it, keyF, i); idx[k] = { t: it }; order.push(k);
    });
    (Array.isArray(ma) ? ma : []).forEach(function (it, i) {
      var k = _lwwKey(it, keyF, i);
      if (!idx[k]) { idx[k] = { m: it }; order.push(k); }
      else idx[k].m = it;
    });
    merged[af] = order.map(function (k) {
      var e = idx[k];
      if (!e.m) return e.t;
      if (!e.t) return e.m;
      var mts3 = (e.m && e.m._ts) || 0, tts3 = (e.t && e.t._ts) || 0;
      return (tts3 > mts3) ? e.t : e.m;
    });
  });
}

function _mergeLWW(localProj, cloudData, localSnap) {
  var spec = _LWW_SPECS[_toolKey];
  if (!spec || !localProj || !cloudData) return cloudData;
  try {
    var now = _nowSync();   // S622i: server-anchored
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
      var _fDef = spec.arrays[field].defaults || null;   // S613
      order.forEach(function (k) {
        var c = cloudIdx[k], l = localIdx[k], s = snapIdx[k];
        if (c && l) {
          // S524 HOTFIX — DOCTRINE I-2 INSIDE THE MERGE: emptiness is never an
          // edit. A blank local item (boot skeleton / unloaded row) with no
          // deletion evidence takes the cloud item OUTRIGHT — not via
          // timestamps, where a tie would let the blank win.
          if (_lwwItemEmpty(l, _fDef) && !_lwwItemEmpty(c, _fDef) && !_lwwHasDeleteEvidence(l)) {
            merged.push(c); stats.replacedFromCloud++;
            return;
          }
          var nestedSpec = spec.arrays[field].nested || null;
          var typedFields = spec.arrays[field].fields || null;   // S598
          var mergedChildren = _lwwMergeNestedChildren(l, c, s, nestedSpec, stats, now);
          /* S598: when the spec names the typed fields, compare ONLY those. */
          var localDirty = !s || (typedFields
            ? _lwwStripFields(s, typedFields) !== _lwwStripFields(l, typedFields)
            : _lwwStripNested(s, nestedSpec) !== _lwwStripNested(l, nestedSpec));
          /* S600 — THE LAST FABRICATION POINT (harness-reproduced with teeth).
             A local row differing from the snapshot was awarded a timestamp
             of NOW — "dirty means edited right now". False: dirty means
             DIFFERS, origin unknown. A stale screen restored from disk
             differs from every snapshot forever, so this crowned a day-old
             value freshly-entered on every pull, on every build, and it beat
             every genuinely newer entry — the single comparison that all of
             S583-S599's fixes funnel into. The item's OWN entry stamp
             (written at the keystroke, S594/S597) is the only truth; a row
             with no stamp at all (legacy) falls back to now once. */
          var localTs = (l && l._ts) || (s && s._ts) || (localDirty ? now : 0);   // S600: entry stamp, never fabricated now
          var cloudTs = c._ts || 0;
          var winner;
          if (cloudTs > localTs) { winner = c; stats.replacedFromCloud++; }
          else {
            winner = l;
            if (localDirty) stats.keptLocalDirty++;
            /* S616 — THE STALEMATE'S LAST UNCOUNTED PATH. A device holding a
               newer entry it has ALREADY saved is not dirty against its own
               snapshot, so this win was invisible to the S605 re-arm: the
               merge rejected the cloud's stale value on every tick, the gate
               applied nothing, the push saw nothing to send, and the cloud
               kept the loser permanently. Counted only when this device is
               strictly newer AND the two sides actually differ — an equal or
               agreeing pair must never re-arm, or every idle tick pushes. */
            else if ((cloudTs || 0) < localTs && _lwwStrip(c) !== _lwwStrip(l)) {
              stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1;
            }
          }
          if (mergedChildren) {
            Object.keys(mergedChildren).forEach(function (cf) { winner[cf] = mergedChildren[cf]; });
          }
          merged.push(winner);
        } else if (l && !c) {
          // I-2: absence never deletes. Keep local item.
          /* S611 — absence never deletes CONTENT; an EMPTY item with no delete
               evidence is not content (boot skeletons, ghost starter rows) and
               does not union into everyone's report.
             S613 — and "empty" now ignores values the machine wrote itself. */
            if (_lwwItemEmpty(l, _fDef) && !_lwwHasDeleteEvidence(l)) { stats.droppedEmptyAbsent = (stats.droppedEmptyAbsent||0)+1; }
            else { merged.push(l); stats.keptLocalAbsent++; }
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
        var _amDef = spec.arrayMaps[field].defaults || null;   // S613
        order.forEach(function (k) {
          var c = cloudIdx[k], l = localIdx[k], s = snapIdx[k];
          if (c && l) {
            if (_lwwItemEmpty(l, _amDef) && !_lwwItemEmpty(c, _amDef) && !_lwwHasDeleteEvidence(l)) {
              merged.push(c); stats.replacedFromCloud++; return;
            }
            // S538: same nested treatment here — Diesel's responses live inside
            // a deficiency, and deficiencies live inside a contractor's list.
            var nSpec = spec.arrayMaps[field].nested || null;
            var mChildren = _lwwMergeNestedChildren(l, c, s, nSpec, stats, now);
            /* S605 — the S598 typed-fields rule existed ONLY in the plain-array
               loop; this contractor-keyed loop still judged dirtiness on the
               whole object. A deficiency's local copy always differs from its
               cloud copy (the cloud strips photo dataURLs by design), so every
               deficiency read as locally-edited on every pull and local won
               forever — nothing in the section could propagate. */
            var typedF = spec.arrayMaps[field].fields || null;
            var localDirty = !s || (typedF
              ? _lwwStripFields(s, typedF) !== _lwwStripFields(l, typedF)
              : _lwwStripNested(s, nSpec) !== _lwwStripNested(l, nSpec));
            var localTs = (l && l._ts) || (s && s._ts) || (localDirty ? now : 0);   // S600: entry stamp, never fabricated now
            var win;
            if ((c._ts || 0) > localTs) { win = c; stats.replacedFromCloud++; }
            else {
              win = l;
              if (localDirty) stats.keptLocalDirty++;
              /* S616 — mirror of the plain-array re-arm count above. */
              else if ((c._ts || 0) < localTs && _lwwStrip(c) !== _lwwStrip(l)) {
                stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1;
              }
            }
            if (mChildren) Object.keys(mChildren).forEach(function (cf) { win[cf] = mChildren[cf]; });
            merged.push(win);
          } else if (l && !c) {
            /* S611 — absence never deletes CONTENT; an EMPTY item with no delete
               evidence is not content (boot skeletons, ghost starter rows) and
               does not union into everyone's report. */
            if (_lwwItemEmpty(l, _amDef) && !_lwwHasDeleteEvidence(l)) { stats.droppedEmptyAbsent = (stats.droppedEmptyAbsent||0)+1; }   /* S613 defaults-aware */
            else { merged.push(l); stats.keptLocalAbsent++; }
          } else if (c && !l) {
            merged.push(c); stats.tookCloudNew++;
          }
        });
        outMap[grp] = merged;
      });
      cloudData[field] = outMap;
    });

    // S541 — value sets (plain text lists): union, never pair.
    (spec.valueSets || []).forEach(function (field) {
      var l = localProj[field], c = cloudData[field];
      if (!Array.isArray(l) && !Array.isArray(c)) return;
      cloudData[field] = _lwwMergeValueSet(l, c);
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
          /* ═══ S610 — THE THIRD COPY OF THE S600 FABRICATION — the signature
             wipe machine. `dirty ? now` crowned ANY locally-different value —
             including an EMPTY pad on a device that simply never signed —
             newest, so every unsigned device erased every signed one, and the
             S608 fast flush broadcast each wipe within seconds. Same rule as
             items (S600) and children (S605): the value's own stamp is the
             only truth. Plus: emptiness never beats content unless it carries
             a genuinely NEWER stamp (a real, stamped Clear still propagates;
             a boot skeleton or never-signed pad never wins anything). */
          var _emptyV = function (v) {
            if (v == null || v === '') return true;
            if (typeof v !== 'object') return false;
            if (Array.isArray(v.s)) return v.s.length === 0;
            return false;
          };
          if (_emptyV(l) && !_emptyV(c) && !((l._ts || 0) > (c._ts || 0))) { out[k] = c; return; }
          if (_emptyV(c) && !_emptyV(l) && !((c._ts || 0) > (l._ts || 0))) { out[k] = l; return; }
          var dirty = !s || _lwwStrip(s) !== _lwwStrip(l);
          var lts = (l._ts) || (s && s._ts) || (dirty ? now : 0);   // S610: entry stamp, never fabricated
          out[k] = ((c._ts || 0) > lts) ? c : l;
        } else {
          /* ═══ S622f (matrix M3): plain-value keys arbitrate by their entry
             stamps, with the same discipline as the fieldMaps branch —
             absence never deletes, a blank ('' only) never beats a real
             answer, dirty means dirty AND not yet stamped (ledger lift), and
             a dirty keep raises the kept-local flag so the push re-arms. */
          if (l === undefined || l === null) { out[k] = c; return; }
          if (c === undefined || c === null) {
            out[k] = l;
            stats.keptLocalAbsent = (stats.keptLocalAbsent || 0) + 1;
            return;
          }
          var _cf2 = (cloudData._fts && cloudData._fts[field]) || {};
          var _lf2 = (localProj._fts && localProj._fts[field]) || {};
          var kc2 = _cf2[k] || 0, kl2 = _lf2[k] || 0;
          var _lg2 = (_lastStampedLocal && _lastStampedLocal[field] && typeof _lastStampedLocal[field] === 'object') ? _lastStampedLocal[field] : null;
          var _stK2 = _lg2 && Object.prototype.hasOwnProperty.call(_lg2, k) && _lg2[k] === l;
          if (_stK2) {
            try {
              var _lgf2 = (_lastStampedLocal._fts && _lastStampedLocal._fts[field]) || {};
              if ((_lgf2[k] || 0) > kl2) kl2 = _lgf2[k];
            } catch (_) {}
          }
          var d2 = (l !== smap[k]) && !_stK2;
          if (l === '' && c !== '') { out[k] = (kl2 > kc2 && d2) ? l : c; return; }
          if (c === '' && l !== '') {
            out[k] = l;
            if (d2) stats.keptLocalDirty = (stats.keptLocalDirty || 0) + 1;
            else if (kc2 < kl2) stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1;
            return;
          }
          if (d2) {
            out[k] = l;
            stats._dirtyKept = stats._dirtyKept || [];
            stats._dirtyKept.push({ field: field, key: k,
              hadSnap: Object.prototype.hasOwnProperty.call(smap, k),
              snapVal: (smap[k] === undefined ? undefined : smap[k]), snapTs: 0 });
            if (l !== c) stats.keptLocalDirty = (stats.keptLocalDirty || 0) + 1;
            return;
          }
          if (kc2 > kl2) { out[k] = c; return; }
          out[k] = l;
          if (l !== c && kl2 > kc2) stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1;
        }
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
      /* ═══ S622 — the SAME two laws as the scalars branch (which was copied
         FROM here, disease included). Three corrections:
           1. The local side's per-key stamps are now actually read — from the
              same ledger the scalars branch reads (the S620 lesson: the fresh
              screen state never carries them). The old comparisons here
              (`> now`, `>= 0`) never consulted a local stamp at all: dirty
              always kept local, not-dirty always took cloud — first-pusher-
              wins with extra steps, and no keep-newer re-arm, so this family
              still carried the S611-class deadlock.
           2. Stamp conservation: the winner's per-key stamp travels into the
              merged document's _fts[field] map.
           3. A dirty-kept key is marked so the ledger keeps its pre-edit
              entry and the next save mints the true entry time.
         The S610 blank rule and its accepted trade-off are unchanged. */
      var lfts = (localProj._fts && localProj._fts[field])
              || (_lastStampedLocal && _lastStampedLocal._fts && _lastStampedLocal._fts[field])
              || {};
      var sfts = (snap._fts && snap._fts[field]) || {};
      stats._dirtyKept = stats._dirtyKept || [];
      var keys = {};
      Object.keys(cobj).forEach(function (k) { keys[k] = true; });
      Object.keys(lobj).forEach(function (k) { keys[k] = true; });
      var out = {}, outFts = {};
      Object.keys(cfts).forEach(function (k) { outFts[k] = cfts[k]; });   // preserve non-arbitrated entries
      var _ledgerObj = (_lastStampedLocal && _lastStampedLocal[field] && typeof _lastStampedLocal[field] === 'object') ? _lastStampedLocal[field] : null;
      Object.keys(keys).forEach(function (k) {
        var lv = lobj[k], cv = cobj[k], sv = sobj[k];
        /* S622c — same refinement as the scalars branch above: dirty means
           dirty AND not yet stamped; a key the ledger already holds at this
           value arbitrates by its real stamp. */
        var _stampedK = _ledgerObj && Object.prototype.hasOwnProperty.call(_ledgerObj, k) &&
          JSON.stringify(lv) === JSON.stringify(_ledgerObj[k]);
        var dirty = (JSON.stringify(lv) !== JSON.stringify(sv)) && !_stampedK;
        var kcts = cfts[k] || 0, klts = lfts[k] || 0;
        /* S622c — same lift as the scalars branch: a ledger-stamped key
           decides with the ledger's stamp, not the screen's stale copy. */
        if (_stampedK) {
          try {
            var _lgf = (_lastStampedLocal._fts && _lastStampedLocal._fts[field]) || {};
            if ((_lgf[k] || 0) > klts) klts = _lgf[k];
          } catch (_) {}
        }
        var keepL = function () {
          out[k] = lv; outFts[k] = klts;
          if (dirty) {
            stats._dirtyKept.push({ field: field, key: k,
              hadSnap: Object.prototype.hasOwnProperty.call(sobj, k),
              snapVal: (sv === undefined ? undefined : JSON.parse(JSON.stringify(sv === null ? null : sv))),
              snapTs: sfts[k] || 0 });
            /* ═══ S622c — MARK'S RPM DRIFT (06 Aug, pm-rpm 22233 stranded on
               the iPhone). This dirty keep counted NOTHING, so
               lastPullKeptLocal stayed false, the facade never reset the
               push dedupe, and the reconnect flush was silently swallowed —
               the S611 deadlock, recreated in this family by the S622
               rewrite while being fixed one branch below in scalars. The
               engine's own S621 comment describes this exact disease. Count
               it on the same terms as everywhere else: only when this
               device actually holds something different, so an agreeing
               pair never re-arms. */
            if (JSON.stringify(lv) !== JSON.stringify(cv)) {
              stats.keptLocalDirty = (stats.keptLocalDirty || 0) + 1;
            }
          }
          else if (kcts < klts && JSON.stringify(lv) !== JSON.stringify(cv)) {
            stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1;   // the re-arm this family never had
          }
        };
        var takeC = function () { out[k] = cv; outFts[k] = kcts; };
        if (lv === undefined) { takeC(); return; }
        if (cv === undefined) { keepL(); return; }
        /* S625 — EQUAL STAMPS, DIFFERENT VALUES is the wreckage the borrowed
           stamp leaves behind: every device lawfully prefers its own copy
           and the split never heals (Mark's 528, stuck on the iPhone while
           25 held everywhere else, refresh powerless). Stamps being equal,
           neither side has a better claim to recency — so the break must
           merely be IDENTICAL on every device, and canonical value order is.
           This is deliberately not "local wins": that is what deadlocked. */
        if (!dirty && kcts === klts && stableKey(lv) !== stableKey(cv)) {
          if (stableKey(cv) > stableKey(lv)) { takeC(); }
          else { keepL(); stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1; }   // the heal must be pushed
          return;
        }
        /* S610 — a blank local field marked "dirty" (boot skeleton, unloaded
           screen) won outright and wiped the cloud's real value — the 02:50Z
           consultant-name wipe in tool_data_history. A blank never beats
           content here. (Trade-off, accepted: an intentional cross-device
           field CLEAR no longer propagates through this branch; clearing
           project-info fields on one device while another edits is rare, and
           mass wipes are not.) */
        if ((lv == null || lv === '') && cv != null && cv !== '') { takeC(); return; }
        /* ═══ S622b — battle E4: THE S610 WIPE WAS STILL ALIVE THROUGH THE
           RECEIVING DOOR. A device saving with an unloaded header (a blank
           it never showed the user — the exact 02:50Z consultant-wipe shape)
           pushed ''-with-a-fresh-stamp, and every OTHER device's not-dirty
           path accepted it, erasing the real name everywhere. S610 guarded
           only the saving device's own pull. The documented trade-off for
           this family — "a clear does not propagate; a blank never beats
           content" — now holds in BOTH directions, and the keeper re-arms
           so its next push restores the content to the cloud. */
        if ((cv == null || cv === '') && lv != null && lv !== '') {
          out[k] = lv; outFts[k] = klts;
          if (dirty) stats._dirtyKept.push({ field: field, key: k,
            hadSnap: Object.prototype.hasOwnProperty.call(sobj, k),
            snapVal: (sv === undefined ? undefined : JSON.parse(JSON.stringify(sv === null ? null : sv))),
            snapTs: sfts[k] || 0 });
          stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1;
          return;
        }
        if (dirty) { keepL(); return; }                 // an unpushed edit is the newest thing this device knows
        if (kcts > klts) { takeC(); return; }           // the value's own entry stamp decides
        keepL();
      });
      cloudData[field] = out;
      cloudData._fts = cloudData._fts || {};
      cloudData._fts[field] = outFts;
    });

    /* ═══ S616 — TOP-LEVEL SCALARS ═══════════════════════════════════════
       A deliberate MIRROR of the fieldMaps branch above, not a refactor of
       it — same reasoning as the S532 arrayMaps mirror: that branch is
       field-proven and rewriting both to share a helper would put the proven
       one at risk for a cosmetic gain. Keep the two in step.
       Rules, identical to every other family:
         • a blank never beats content (doctrine I-2);
         • otherwise the value's own entry stamp decides, read from the
           document's _fts._root map — never a fabricated `now`;
         • absence never deletes: a side that does not carry the key at all
           yields to the side that does. */
    (spec.scalars || []).forEach(function (field) {
      var lv = localProj[field], cv = cloudData[field];
      var lHas = Object.prototype.hasOwnProperty.call(localProj, field);
      var cHas = Object.prototype.hasOwnProperty.call(cloudData, field);
      if (!lHas && !cHas) return;
      if (!lHas) { return; }                     // cloud value already in place
      /* S622b — battle C4: a payload missing the key entirely (not blank —
         absent) deleted it from the cloud, and this keep-local branch never
         re-armed, so the value survived on devices but the cloud and any
         absent device stayed empty until the next unrelated save. Absence
         never deletes AND the keeper heals the cloud. */
      if (!cHas) {
        cloudData[field] = lv;
        stats._mergedRoot = stats._mergedRoot || {};
        stats._mergedRoot[field] = ((localProj._fts && localProj._fts._root) || (_lastStampedLocal && _lastStampedLocal._fts && _lastStampedLocal._fts._root) || {})[field] || 0;
        stats.keptLocalAbsent = (stats.keptLocalAbsent || 0) + 1;
        return;
      }
      var lBlank = (lv == null || lv === '');
      var cBlank = (cv == null || cv === '');
      if (lBlank && cBlank) { cloudData[field] = cv; return; }
      var croot = (cloudData._fts && cloudData._fts._root) || {};
      /* ═══ S620 — THE LOCAL SIDE HAD NO STAMPS AT ALL ═══════════════════
         Field-proven by the S619 recorder on Mark's three devices: EVERY
         contested scalar reported localTs = 0, on every device, every time.
         The cause is that `localProj` is collected fresh from the screen on
         each tick, so it has no `_fts` ledger — the entry times are written
         onto the copy that gets SENT and kept in _lastStampedLocal. So a
         value typed on THIS device arrived at the merge dated to zero and
         had nothing to defend itself with: the outcome turned entirely on
         whether the cloud's copy happened to carry a stamp (cloud stamped →
         cloud always won, even against newer typing; cloud unstamped → local
         won by default). That is exactly the pattern Mark could not explain
         across five runs — 635 losing to an older value, 8 flickering to 33
         and reverting. Read the local stamp from this device's own ledger,
         which is where it has been all along. */
      var lroot = (localProj._fts && localProj._fts._root)
               || (_lastStampedLocal && _lastStampedLocal._fts && _lastStampedLocal._fts._root)
               || {};
      var cts = croot[field] || 0, lts = lroot[field] || 0;
      /* ═══ S621 — TWO GAPS THE S620 FIX DID NOT CLOSE (Mark, on-device) ══
         (A) "AD 12, then IP right away → 12 won everywhere."
         The ledger only advances when a save RUNS. Between a keystroke and
         the autosave firing, a freshly typed value still carries the PREVIOUS
         stamp — so a heartbeat landing in that window saw a stale local time
         and handed the field to the cloud, overwriting typing that was newer
         than anything in it. Fixed the way the fieldMaps branch has always
         done it: an unpushed local edit — local differs from the last state
         this device saw — is by definition the newest thing this device
         knows, and is kept. Note this is `dirty ? keep local`, NOT the
         `dirty ? now` timestamp fabrication that has been found and killed
         four times; no time is invented here.

         (B) "IP offline 125555 → back online → IP keeps 125555, cloud keeps
         55, forever." The local win was correct, but this branch counted
         NOTHING, so lastPullKeptLocal stayed false, the push never re-armed,
         and the device sat ahead of the cloud permanently — the S604 deadlock
         reaching scalars through a door the S616 re-arm never covered. Count
         it, on the same terms as the array branches: only when this device
         actually holds something different, so an agreeing pair never
         re-arms and idle ticks never push. */
      var sHas = Object.prototype.hasOwnProperty.call(snap, field);
      var _dirtyRaw = sHas ? (JSON.stringify(lv) !== JSON.stringify(snap[field])) : false;
      /* ═══ S622c — "DIRTY" MEANS DIRTY AND NOT YET STAMPED (battle B6, run
         with real browser offline events). An OFFLINE-SAVED value is dirty
         against the stale snapshot but was already stamped at its true edit
         moment (S617) — the ledger holds the value with its time. Treating
         it as "awaiting a mint" made the honest-ledger revert destroy that
         true stamp, and the next save re-minted at RECONNECT time: an older
         offline entry wearing manufactured recency then beat entries other
         people typed later — the inverse of the 05 Aug loss. A value the
         ledger already holds arbitrates by its real stamp like any other
         entry; only a genuinely unstamped screen edit gets the typing-window
         protection and the awaiting-mint marker. */
      var _stampedAlready = _lastStampedLocal &&
        Object.prototype.hasOwnProperty.call(_lastStampedLocal, field) &&
        JSON.stringify(lv) === JSON.stringify(_lastStampedLocal[field]);
      var dirty = _dirtyRaw && !_stampedAlready;
      /* S622c (second half of the same law): for a ledger-stamped value the
         DECISION must read the ledger's stamp too. The screen's own root
         table is a stale copy from the last apply and wins the lroot
         fallback above, so an offline entry's true edit time — pinned in
         the ledger by S617 — was invisible here, and the value lost races
         it had honestly won. The stamp travels with the value: lift it. */
      if (_stampedAlready) {
        try {
          var _lgr = (_lastStampedLocal._fts && _lastStampedLocal._fts._root) || {};
          if ((_lgr[field] || 0) > lts) lts = _lgr[field];
        } catch (_) {}
      }
      /* ═══ S622 — STAMP CONSERVATION (the root cause of the whole scalar
         arc, proven by fieldsymptom.mjs replaying Mark's Test 1 + Test 2).
         The old branch moved the winning VALUE into the merged document but
         never its entry stamp — the merged document kept the CLOUD's root
         ledger wholesale. That merged document then became this device's
         stamp ledger (_lastStampedLocal), so a value that had just WON a
         merge was recorded as stamped with the LOSER's time (or nothing),
         and every subsequent save shipped it wearing that wrong stamp — at
         which point every other device lawfully discarded it. Two laws now:
           1. The winner's stamp travels with the winner's value. A real
              recorded time is MOVED; a time is never invented here.
           2. A local value kept because it is DIRTY (an unpushed edit not
              yet through a stamping pass) is marked in stats._dirtyKept so
              the pull path can keep it OUT of the snapshot and ledger —
              the next save then sees value ≠ ledger and mints its true
              entry time exactly where mints have always happened. */
      stats._mergedRoot = stats._mergedRoot || {};
      stats._dirtyKept = stats._dirtyKept || [];
      var _markDirtyKept = function () {
        stats._dirtyKept.push({ field: field, key: null, hadSnap: sHas,
          snapVal: sHas ? JSON.parse(JSON.stringify(snap[field] === undefined ? null : snap[field])) : undefined,
          snapTs: (function () { try { var sr = (snap._fts && snap._fts._root) || {}; return sr[field] || 0; } catch (_) { return 0; } })() });
      };
      var _keepLocal = function () {
        cloudData[field] = lv;
        stats._mergedRoot[field] = lts;                 // law 1: winner's own stamp (may honestly be 0)
        if (dirty) _markDirtyKept();                    // law 2: an unpushed edit still awaits its mint
        if (JSON.stringify(lv) !== JSON.stringify(cv)) {
          stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1;
        }
      };
      var _takeCloud = function () { cloudData[field] = cv; stats._mergedRoot[field] = cts; };
      if (lBlank && !cBlank) { if (lts > cts && dirty) _keepLocal(); else _takeCloud(); return; }
      if (cBlank && !lBlank) { if (cts > lts && !dirty) _takeCloud(); else _keepLocal(); return; }
      if (dirty && cts <= lts) { _keepLocal(); return; }
      if (dirty && !sHas)     { _keepLocal(); return; }
      if (dirty && cts > lts) { _keepLocal(); return; }   // unpushed edit is newest this device knows
      if (cts > lts) { _takeCloud(); return; }
      /* S625 — same equal-stamp tie-break as the fieldMaps branch, same
         reasoning: with stamps equal, only an order every device computes
         identically can converge. */
      if (cts === lts && !dirty && stableKey(lv) !== stableKey(cv)) {
        if (stableKey(cv) > stableKey(lv)) { _takeCloud(); return; }
        _keepLocal(); stats.keptLocalNewer = (stats.keptLocalNewer || 0) + 1; return;   // the heal must be pushed
      }
      _keepLocal();
    });
    /* S622 law 1, applied: the merged document's root ledger now records the
       winner of every arbitrated scalar. Non-arbitrated keys already present
       in the cloud's root are preserved untouched. */
    if ((spec.scalars || []).length && stats._mergedRoot) {
      cloudData._fts = cloudData._fts || {};
      var _finalRoot = cloudData._fts._root || {};
      Object.keys(stats._mergedRoot).forEach(function (f2) { _finalRoot[f2] = stats._mergedRoot[f2]; });
      cloudData._fts._root = _finalRoot;
    }

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
/* S579: the exact message text the user dismissed. Keyed to the text, not a
   flag, so a NEW or WORSENING message still shows — dismissing "not synced
   (126 min)" must not hide "(180 min)" or a different failure entirely. */
var _bannerDismissed = null;
var _engineSelf = null;

function _cloudConfirmed() {
  _lastCloudOkAt = Date.now();
  _hasUnconfirmedWork = false;
  _hideSyncBanner();
}

function _showSyncBanner(text, level) {
  try {
    /* S579 (Mark, field-blocked): this banner was pinned to top:0 at z-index
       99999, which puts it directly ON TOP of the tool header — so a device
       that could not sync also could not reach Sign Out, the one control that
       fixes the commonest cause (an expired login). A warning that blocks the
       remedy for the thing it is warning about is worse than no warning.
       Two changes: it now sits at the BOTTOM, where no tool has controls, and
       it can be dismissed. Bottom placement is deliberate over "offset by the
       header height" — header height varies by tool, by screen width and by
       fold state, and any fixed offset is wrong somewhere. */
    if (_bannerEl && _bannerDismissed === text) return;   // stay dismissed for this message
    if (!_bannerEl) {
      _bannerEl = document.createElement('div');
      _bannerEl.id = 'syncStaleBanner';
      _bannerEl.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;' +
        'padding:10px 44px 10px 16px;text-align:center;font-family:Calibri,sans-serif;' +
        'font-size:15px;font-weight:bold;color:#fff;display:none;';
      var _txt = document.createElement('span');
      _txt.id = 'syncStaleBannerText';
      _bannerEl.appendChild(_txt);
      var _x = document.createElement('button');
      _x.type = 'button';
      _x.setAttribute('aria-label', 'Dismiss');
      _x.textContent = '\u2715';
      _x.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);' +
        'background:rgba(255,255,255,.18);border:none;color:#fff;font-size:15px;font-weight:bold;' +
        'width:28px;height:28px;border-radius:7px;cursor:pointer;line-height:1;font-family:Calibri,sans-serif;';
      _x.onclick = function () {
        _bannerDismissed = (_bannerEl && _bannerEl._msg) || '';
        _bannerEl.style.display = 'none';
      };
      _bannerEl.appendChild(_x);
      document.body.appendChild(_bannerEl);
    }
    _bannerEl._msg = text;
    if (_bannerDismissed === text) return;
    _bannerEl.style.background = (level === 'red') ? '#C0445F' : '#C98A4A';
    var t = document.getElementById('syncStaleBannerText');
    if (t) t.textContent = text; else _bannerEl.textContent = text;
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
// frozen for ~60 sessions and could not be trusted, and FRT's (FRT_BUILD) had
// likewise gone 15 sessions without a bump. The service worker cache name is the
// one identifier that is bumped on EVERY push by standing discipline and is a
// sortable timestamp, so it describes the code that is genuinely running rather
// than what a constant claims.
//
// S546 CORRECTION — it is NOT enough to read the cache names the browser holds.
// caches.keys() is ORIGIN-wide, not tool-wide: every ARENCON tool's cache is
// visible from inside every other one, and the old code took the newest of them.
// A tablet on a two-week-old Field Review Tool that had opened the portal
// yesterday read as fully current — the exact device the floor exists to catch.
// FRT's own cache carried a trailing tag and was not even recognised. We now ASK
// the service worker serving this page (GET_BUILD_STAMP) and treat only that
// answer as trustworthy enough to block on.
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
var _pushFlight = null;      // S622e single-flight: the one in-flight push chain
var _pushFollowUp = false;   // S622e: a trigger arrived mid-flight — run once after

/* ═══ S622i — SERVER-ANCHORED TIME (Mark's field E1/E2, 06 Aug: three physical
   devices, rapid two-writer races, and the FIRST-typed value kept winning —
   in different directions on different runs). Every entry stamp minted from
   the device's own wall clock, and real tablets, iPhones and PCs disagree by
   seconds. An entry typed LATER on a slow clock carried an EARLIER stamp and
   honestly lost an arbitration it should have won. No harness caught it: all
   simulated devices share one clock, which is precisely the property real
   fleets lack.
   The fix is a rolling offset learned from the server itself: every cloud
   round trip carries the server's own Date header, so each device knows
   "server time = my time + offset" to within one network trip, and every
   stamp is minted on the SERVER's clock. Three devices minting through the
   same reference collapse the skew from seconds to milliseconds. Smoothed
   (last-4 median) so one slow response cannot yank the clock; monotonic guard
   so a stamp never mints behind this device's previous mint. */
/* ═══ S623 — MILLISECOND CLOCK. Three defects were found behind Mark's
   07 Aug sub-second inversion (two values ~1s apart on two devices, the
   earlier one won; sync_diag showed the stamps 79 ms apart, olderWon:false —
   the merge was lawful, the stamps were not).

   1. THE FLOOR PINNED A SKEWED MINT PERMANENTLY. The boot pull runs through
      Auth.request, which never learns, so the FIRST entry a person typed
      after opening the tool was always minted on the raw device clock. The
      monotonic floor then held that value: every later stamp came out at
      floor+1 ms until real time caught up. A tablet 8 s fast published
      stamps 7.7 s in the future for the next 8 s of use — proved by
      tools/sim/clockskew.mjs check 4, which failed on S622m even though
      S622i was supposed to have closed gross skew. Learning at boot, before
      any mint, is the fix; the floor then sits in the corrected frame from
      the start. NEVER rebase the floor downward instead — this device's
      earlier stamps are already published, and a lower new stamp would lose
      an arbitration against its own older value.

   2. THE DATE HEADER CANNOT DO BETTER THAN A SECOND. It has 1 s resolution,
      truncated downward, so the learned offset carried up to a second of
      quantization error — which is why it had to be dead-banded at ±1500 ms,
      and why every sub-second skew survived untouched.

   3. WE ALREADY HAD A MICROSECOND CLOCK AND THREW IT AWAY. tool_data has a
      BEFORE UPDATE trigger (`NEW.updated_at = now()`), and both write paths
      already ask for the row back — the full PATCH via
      `Prefer: return=representation`, the change-scoped save via the RPC's
      row_updated_at. Every save therefore returns a Postgres timestamp at
      microsecond resolution (verified live 07 Aug: …17.979497+00). Paired
      with the local send and receive times it bounds the offset by the round
      trip, not by a second.

   The estimate is NTP's: offset = server − midpoint(send, receive), keeping
   the LEAST-DELAYED sample because it carries the tightest bound, and the
   correction is applied only when it exceeds the measurement uncertainty
   (half the round trip) — then shrunk BY that uncertainty so a correction can
   never overshoot into artificial future. Overshoot is the failure mode that
   defeated the S622i centring attempt: a corrected device that lands ahead of
   honest peers wins races by the margin of its own correction. Under-
   correcting merely costs a device a race it won by less than its own network
   latency, which is the honest direction to fail in. */
var _svrOffsets = [];        // Date-header samples (coarse fallback only)
var _svrTrips = [];          // write round trips: {off, rtt} — the real clock
var _svrOffset = 0;          // applied offset
var _lastMint = 0;           // monotonic floor
/* Skew is a property of the DEVICE and moves slowly, so the last learned
   offset is seeded at boot from storage. Without this, everything minted in
   the first seconds after open — or during an entire offline boot — carries
   the raw skewed clock, which is exactly the window a person types their
   first reading in. */
try {
  var _svrSaved = parseInt(localStorage.getItem('arc-clock-offset') || '', 10);
  if (!isNaN(_svrSaved) && _svrSaved) { _svrOffset = _svrSaved; _svrOffsets.push(_svrSaved); }
} catch (_) {}
/* Commit a candidate offset. One place, so every source is persisted,
   published for field diagnosis, and recorded with its provenance. */
function _applyOffset(ms, source, rttMs) {
  _svrOffset = ms;
  try {
    if (typeof window !== 'undefined') {
      window.__arcSvrOffset = ms;          // diagnosable in the field
      window.__arcClockSrc = source;       // 'trip' (µs) or 'date' (1 s)
      window.__arcClockRtt = (rttMs == null ? null : rttMs);
    }
  } catch (_) {}
  try { localStorage.setItem('arc-clock-offset', String(ms)); } catch (_) {}
}

/* PostgREST returns '2026-08-07T21:59:17.979497+00:00'. Date.parse handles it
   on every current engine, but a timestamp we cannot read must be discarded
   rather than guessed at — a wrong clock is worse than no correction. */
function _parseSvrIso(iso) {
  var t = Date.parse(iso);
  if (t && !isNaN(t)) return t;
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(String(iso || ''));
  if (!m) return 0;
  var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7]) ms += Math.round(parseFloat('0.' + m[7]) * 1000);
  return ms;
}

/* THE PRECISE SOURCE. Called with the server timestamp a write came back
   with, plus the local clock readings either side of that round trip. */
function _learnServerStamp(iso, t0, t1) {
  try {
    var sv = _parseSvrIso(iso);
    if (!sv) return;
    if (!t0 || !t1 || t1 < t0) return;
    var rtt = t1 - t0;
    if (rtt > 5000) return;                       // too delayed to bound anything
    var off = sv - (t0 + t1) / 2;
    if (Math.abs(off) > 12 * 3600 * 1000) return; // garbage, not skew
    _svrTrips.push({ off: off, rtt: rtt });
    if (_svrTrips.length > 8) _svrTrips.shift();

    /* NTP's minimum filter: the least-delayed sample is the least distorted
       one. A median would average good samples with congested ones. */
    var best = _svrTrips[0];
    for (var i = 1; i < _svrTrips.length; i++) if (_svrTrips[i].rtt < best.rtt) best = _svrTrips[i];

    /* Uncertainty is half the round trip — we cannot tell where inside it the
       server took its reading. The 25 ms floor stops a very fast link from
       chasing scheduler jitter into a correction nobody needs. */
    var u = Math.max(25, best.rtt / 2);
    var applied = Math.abs(best.off) <= u ? 0
                : (best.off > 0 ? best.off - u : best.off + u);
    _applyOffset(applied, 'trip', best.rtt);
  } catch (_) {}
}

/* Timing for every round trip, so the body-parsing sites can pair a server
   timestamp with the local clock either side of it. WeakMap, not a shared
   variable: two requests can be in flight and must not read each other's. */
var _tripAt = (typeof WeakMap === 'function') ? new WeakMap() : null;
function _learnFromRows(res, rows) {
  try {
    if (!_tripAt || !res || !rows) return;
    var t = _tripAt.get(res); if (!t) return;
    var row = rows.length ? rows[0] : rows;
    if (row && row.updated_at) _learnServerStamp(row.updated_at, t.t0, t.t1);
  } catch (_) {}
}

/* THE COARSE FALLBACK. Kept for the window before this device has completed
   a write — a read-only session, or the first seconds after a fresh install
   with no persisted offset. Superseded the moment a real round trip lands:
   a one-second-resolution reading must never overwrite a microsecond one. */
function _learnServerTime(res) {
  try {
    if (_svrTrips.length) return;
    var d = res && res.headers && res.headers.get && res.headers.get('date');
    if (!d) return;
    var sv = Date.parse(d);
    if (!sv || isNaN(sv)) return;
    /* The Date header has 1s resolution, truncated downward. NOT centred:
       a +500ms centring hands the corrected device half a second of
       artificial future over dead-banded honest peers (the probe caught it
       — the skewed device kept winning by the centring margin). Truncation
       error points backward, which at worst costs the skewed device a race
       it won by less than a second — the honest failure direction. */
    _svrOffsets.push(sv - Date.now());
    if (_svrOffsets.length > 4) _svrOffsets.shift();
    var s = _svrOffsets.slice().sort(function (a, b) { return a - b; });
    var med = s[Math.floor(s.length / 2)];
    /* The Date header has ONE-SECOND resolution, so the learned offset
       carries up to ~1s of quantization jitter — applying it always would
       introduce sub-second mis-ordering between devices whose clocks agree.
       The field disease is MULTI-SECOND skew; correct only that. Inside the
       dead band the device clock is already the better sub-second reference. */
    _applyOffset((med > 1500 || med < -1500) ? med : 0, 'date', null);
  } catch (_) {}
}
function _nowSync() {
  var t = Date.now() + _svrOffset;
  if (t <= _lastMint) {
    /* S623 — THE FLOOR MUST YIELD TO A CORRECTED FRAME. The floor exists to
       break same-millisecond ties and absorb tiny backward jitter. It was
       also, unintentionally, preserving stamps minted before this device
       knew the server's time: a tablet 8 s fast pinned the floor 8 s ahead
       and then published floor+1 ms for the next 8 s of use, so every value
       anyone else typed in that window lost to it. A floor standing well
       above the corrected clock was minted on a clock we have since learned
       was wrong, and republishing that error is worse than dropping it.
       RESIDUAL, stated plainly: stamps this device already published in the
       wrong frame stay in the cloud, so for the length of the correction it
       can lose a race against its OWN older value. Bounded by the skew, and
       covered by clockskew.mjs check 5. The 100 ms threshold keeps ordinary
       tie-breaking untouched — only a real frame change reaches it. */
    if (_lastMint - t > 100) _lastMint = t - 1;
    else t = _lastMint + 1;                // monotonic on this device
  }
  _lastMint = t;
  return t;
}
try { if (typeof window !== 'undefined') window.ArcSyncNow = _nowSync; } catch (_) {}

/* ═══ S627 — THE BOOT MERGE NEEDS THE ENTRY-TIME LAW TOO ═══════════════════
   Mark's offline-close-reopen case failed three times while every engine
   harness stayed green, because the last word at boot does not belong to this
   engine. The app reads its local autosave, hands it to _mergeCloudLocal
   along with the cloud row, and applies the result — and that function's rule
   is "cloud is authoritative for all fields except photo blobs". It rescues
   photo binaries, markup vectors and sketch images by hand, and takes every
   TYPED value from the cloud. So an offline edit could be stamped, persisted,
   restored and re-armed perfectly and still be discarded one layer further
   out, where no engine test was looking.
   This exposes the arbitration the running app already uses so the boot merge
   can apply the SAME rule to typed values: per key, the newer entry time
   wins, exactly as a heartbeat pull would decide it. Read-only and additive —
   it decides nothing about photos, structure or arrays, and returns the
   cloud's own value whenever the cloud is newer or the stamps are missing, so
   a document without stamps behaves exactly as it does today. */
try {
  if (typeof window !== 'undefined') window.ArcBootArbitrate = function (cloud, local, toolKey) {
    var out = { took: 0, keys: [] };
    try {
      var spec = _LWW_SPECS[toolKey || _toolKey];
      if (!spec || !cloud || !local) return out;
      var cR = (cloud._fts && cloud._fts._root) || {};
      var lR = (local._fts && local._fts._root) || {};
      /* ═══ S634 — THE LOCAL SIDE HAD NO STAMPS AT ALL. AGAIN. ══════════════
         Mark's fourth field failure of the offline-close-reopen case, with the
         S627 rule shipped and every harness green. The rule was right; the
         place it looked for "when was this typed" was not.
         `local` here is the APP's own IDB autosave — collectState() output —
         and the string `_fts` does not occur anywhere in diesel-app/js. It
         never has. So lR was ALWAYS empty, every local value arrived dated
         zero, `local <= cloud` was true for every field, and this arbitration
         could not take a single value on any device on any reopen. That is
         why the revert was reliable rather than intermittent, and why
         bootmerge.mjs passed: it hands the merge a local document carrying
         stamps, which the product never produces.
         This is the S620 fault verbatim, one layer out: "the entry times are
         written onto the copy that gets SENT and kept in _lastStampedLocal."
         Read them from there — the same ledger the running merge already
         reads, restored from disk at boot by loadIDBSnapshot (S626b).
         STAMP CONSERVATION IS PRESERVED (law A1/A2): the ledger's time belongs
         to the ledger's VALUE. It is lent only when the local document still
         holds that exact value. A screen that has moved on to something else
         is an unstamped edit — it keeps losing here and mints its true entry
         time at the next save, exactly where mints have always happened. No
         time is invented; a recorded time is moved with the value it belongs
         to. Harness: tools/sim/bootstamp.mjs (checks 2 and 3 fail on S631;
         check 5 is the no-borrowing negative control). */
      var _lgR = (_lastStampedLocal && _lastStampedLocal._fts && _lastStampedLocal._fts._root) || {};
      function _bootTs(f) {
        if (lR[f]) return lR[f];                                  // the document's own stamp wins
        if (!_lastStampedLocal) return 0;
        if (!Object.prototype.hasOwnProperty.call(_lastStampedLocal, f)) return 0;
        if (stableKey(local[f]) !== stableKey(_lastStampedLocal[f])) return 0;   // not this value's time
        return _lgR[f] || 0;
      }
      function _bootTsMap(fm, k) {
        var lF = (local._fts && local._fts[fm]) || {};
        if (lF[k]) return lF[k];
        if (!_lastStampedLocal) return 0;
        var lg = _lastStampedLocal[fm];
        if (!lg || typeof lg !== 'object' || Array.isArray(lg)) return 0;
        if (!Object.prototype.hasOwnProperty.call(lg, k)) return 0;
        if (stableKey(local[fm][k]) !== stableKey(lg[k])) return 0;              // not this value's time
        var lgF = (_lastStampedLocal._fts && _lastStampedLocal._fts[fm]) || {};
        return lgF[k] || 0;
      }
      (spec.scalars || []).forEach(function (f) {
        if (!Object.prototype.hasOwnProperty.call(local, f)) return;
        var lts = _bootTs(f);                                     // S634: document, else this device's ledger
        if (lts <= (cR[f] || 0)) return;                          // cloud newer or unstamped — leave it
        if (stableKey(local[f]) === stableKey(cloud[f])) return;  // same value, nothing to decide
        cloud[f] = local[f];
        cloud._fts = cloud._fts || {}; cloud._fts._root = cloud._fts._root || {};
        cloud._fts._root[f] = lts;                                // the winner's own stamp travels
        out.took++; out.keys.push(f);
      });
      (spec.fieldMaps || []).forEach(function (fm) {
        var l = local[fm]; if (!l || typeof l !== 'object' || Array.isArray(l)) return;
        var c = cloud[fm]; if (!c || typeof c !== 'object' || Array.isArray(c)) return;
        var cF = (cloud._fts && cloud._fts[fm]) || {};
        Object.keys(l).forEach(function (k) {
          var lts = _bootTsMap(fm, k);                            // S634
          if (lts <= (cF[k] || 0)) return;
          if (stableKey(l[k]) === stableKey(c[k])) return;
          c[k] = l[k];
          cloud._fts = cloud._fts || {}; cloud._fts[fm] = cloud._fts[fm] || {};
          cloud._fts[fm][k] = lts;
          out.took++; out.keys.push(fm + '.' + k);
        });
      });
    } catch (_) { /* arbitration must never break a boot */ }
    return out;
  };
} catch (_) {}
var _floorMsg = '';

// S546: stamps are compared as strings, so they must be the same width or
// '20260801' sorts above '202607301130'. Normalised to 14 digits, and any
// trailing tag on the cache name (FRT shipped 'arencon-frt-202607301130-s543')
// is tolerated rather than making the whole cache invisible.
function _normStamp(s) {
  var d = String(s || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  return (d + '00000000000000').slice(0, 14);
}
function _stampFromCacheName(n) {
  var s = String(n || '');
  // The tile cache is deliberately long-lived and pinned to an old date
  // (arencon-frt-202607271900tiles-v1). It is not a build.
  if (/tiles/i.test(s)) return null;
  var m = /^arencon-[a-z0-9]+-(\d{8,14})(?:\D|$)/i.exec(s);
  return m ? _normStamp(m[1]) : null;
}

// S546 — ASK, DON'T GUESS.
// The scan below is origin-wide: it sees every cache this SITE holds, not this
// TOOL's, and took the newest of them. A tablet running a two-week-old Field
// Review Tool that had opened the portal yesterday therefore read as current —
// precisely the device the floor exists to catch. The service worker actually
// serving this page is the only thing that knows which build is running, so we
// ask it. No controller (first load before claim, SW disabled, private mode) or
// no answer inside the timeout means we do not know: fail open.
function _buildStampFromController() {
  try {
    var nav = (typeof navigator !== 'undefined') ? navigator : null;
    if (!nav || !nav.serviceWorker || !nav.serviceWorker.controller) return Promise.resolve(null);
    if (typeof MessageChannel === 'undefined') return Promise.resolve(null);
    return new Promise(function (resolve) {
      var settled = false;
      var finish = function (v) { if (!settled) { settled = true; resolve(v || null); } };
      var ch = new MessageChannel();
      ch.port1.onmessage = function (ev) {
        var d = (ev && ev.data) || {};
        finish(d.type === 'BUILD_STAMP' ? _stampFromCacheName(d.cacheName) : null);
      };
      setTimeout(function () { finish(null); }, 1500);
      try { nav.serviceWorker.controller.postMessage({ type: 'GET_BUILD_STAMP' }, [ch.port2]); }
      catch (e) { finish(null); }
    });
  } catch (e) { return Promise.resolve(null); }
}

function _buildStampFromCaches() {
  try {
    if (typeof caches === 'undefined' || !caches.keys) return Promise.resolve(null);
    return caches.keys().then(function (names) {
      var best = null;
      (names || []).forEach(function (n) {
        var v = _stampFromCacheName(n);
        if (v && (best === null || v > best)) best = v;
      });
      return best;
    }).catch(function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}

// Trusted only when the serving worker answered. The scan is kept as a
// last resort — it can raise the banner, it may NEVER block cloud writes,
// because a guess that names the wrong tool would refuse writes on a
// perfectly healthy device. Warning wrongly costs a banner; blocking
// wrongly costs a day of field work.
function _resolveBuildStamp() {
  return _buildStampFromController().then(function (v) {
    if (v) return { stamp: v, trusted: true, via: 'service worker' };
    return _buildStampFromCaches().then(function (w) {
      return { stamp: w, trusted: false, via: w ? 'cache scan (untrusted)' : 'unknown' };
    });
  }).catch(function () { return { stamp: null, trusted: false, via: 'unknown' }; });
}

function _checkVersionFloor() {
  if (_floorChecked) return Promise.resolve();
  _floorChecked = true;
  return _resolveBuildStamp().then(function (id) {
    var build = id && id.stamp;
    // S546: always announce what we decided we are running. Silence is why
    // nobody noticed the floor was reading another tool's cache — there was
    // no way to read a field tablet's answer back.
    try {
      console.info('%c[Sync S546] running build ' + (build || 'unknown') +
                   ' (via ' + (id ? id.via : 'unknown') + ')',
                   'background:#2C7FB8;color:#fff;padding:2px 8px;border-radius:4px');
    } catch (e) {}
    if (!build) return;                       // no SW / no cache — fail open
    // cache:'no-store' AND a cache-busting query: the whole point is to read a
    // value the stale build has never seen, so it must not be served from the
    // very cache we are trying to judge.
    return fetch('/version-floor.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg) return;                     // unreachable — fail open
        var warn  = _normStamp(cfg.warnBelow)  || '0';
        var block = _normStamp(cfg.blockBelow) || '0';
        var msg   = cfg.message || 'This app is out of date. Close and reopen it to update.';
        if (block !== '0' && build < block && !id.trusted) {
          // Untrusted identity may warn but must never refuse cloud writes.
          _showSyncBanner(msg, 'red');
          console.warn('[Sync S546] build ' + build + ' looks below the floor ' + block +
                       ' but the identity is a guess — warning only, writes allowed');
        } else if (block !== '0' && build < block) {
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
var _lastPersistPid = null;   // S625: so an offline stamp can persist the ledger too
var _bootLedger = null;       // S626b: entry times restored from disk, re-asserted after the boot pull
/* S626b — a read-only window onto the entry-time ledger, so a harness can
   assert what the ENGINE actually restored instead of inferring it from
   behaviour. Two field failures this week passed a green harness because the
   test observed an outcome the product reached by a different route. */
try { if (typeof window !== 'undefined') window.__arcLedgerPeek = function () {
  try { return _lastStampedLocal ? { keys: Object.keys(_lastStampedLocal).slice(0,8),
    root: (_lastStampedLocal._fts && _lastStampedLocal._fts._root) || null,
    npshPsi: _lastStampedLocal.npshPsi } : null; } catch (_) { return null; }
}; } catch (_) {}

/* ═══ S638 — HAS THE CLOUD EVER ACKNOWLEDGED THIS PHOTO? ══════════════════
   The host's photo-rescue pass has to answer one question about a photo that
   exists on this device and not in the cloud copy: is it a capture the cloud
   has not heard about yet, or something a colleague deleted? Those need
   opposite outcomes and look identical from the host's side.

   The last cloud snapshot settles it. If this device has pulled the row and
   the photo's id was NOT in what came back, the cloud has never known about
   it — nobody can have deleted it, so it is a local capture and must be
   rescued. If the id WAS there and is gone now, that is a removal and must be
   respected. No new bookkeeping: the snapshot is already kept for the 3-way
   merge and already restored from disk at boot.

   Returns null when this device has no snapshot yet (never pulled, or a fresh
   install). Null means "cannot tell" and the caller must fall back to the
   conservative path — an unknown answer is not a licence to resurrect. */
try { if (typeof window !== 'undefined') window.__arcCloudKnewPhoto = function (photoId) {
  try {
    if (!photoId || !_lastSeenSnapshot) return null;
    /* Cache keyed on the snapshot OBJECT, not a flag: every assignment to
       _lastSeenSnapshot installs a freshly-parsed object, so an identity
       mismatch invalidates this automatically. Patching all seven assignment
       sites would leave the eighth one, added later, silently serving a stale
       answer about which photos the cloud knows. */
    if (_snapPhotoIdsFor !== _lastSeenSnapshot) {
      _snapPhotoIdsFor = _lastSeenSnapshot;
      _snapPhotoIds = {};
      var s = _lastSeenSnapshot;
      var visit = function (p) { if (p && p.id) _snapPhotoIds[p.id] = true; };
      var arr = function (a) { if (Array.isArray(a)) a.forEach(visit); };
      arr(s.flowTestPhotos); arr(s.flowTestPhotosPld); arr(s.recordPhotos);
      [s.stdData, s.pldData].forEach(function (rows) {
        if (Array.isArray(rows)) rows.forEach(function (r) { if (r) arr(r.photos); });
      });
      if (s.clState) Object.keys(s.clState).forEach(function (k) {
        if (s.clState[k]) arr(s.clState[k].photos);
      });
      if (s.deficiencies) Object.keys(s.deficiencies).forEach(function (c) {
        (s.deficiencies[c] || []).forEach(function (d) {
          if (d) { arr(d.photos); (d.responses || []).forEach(function (r) { if (r) arr(r.photos); }); }
        });
      });
      if (Array.isArray(s.generalDeficiencies)) s.generalDeficiencies.forEach(function (d) {
        if (d) { arr(d.photos); (d.responses || []).forEach(function (r) { if (r) arr(r.photos); }); }
      });
    }
    return !!_snapPhotoIds[photoId];
  } catch (_) { return null; }
}; } catch (_) {}
function _persistSyncMeta(projectId, instanceId) {
  if (!projectId) return Promise.resolve(false);
  _lastPersistPid = projectId;
  if (!_lastSeenUpdatedAt || !_lastSeenSnapshot) return Promise.resolve(false);
  var key = _syncMetaKey(projectId, instanceId);
  var record = {
    id: key,
    updatedAt: _lastSeenUpdatedAt,
    snapshot: _lastSeenSnapshot,
    /* S625 — OPEN 3's root (Mark: type offline, close the app, reopen, the
       old number is back — reliably). The entry-time LEDGER, which every
       merge decision is made from, was a module variable and died with the
       process; only the cloud's last-seen state survived. So a reopened app
       held the typed value with no record of WHEN it was typed, and a value
       with no stamp loses to any stamped cloud copy — every time, which is
       why the revert was reliable rather than intermittent. The ledger now
       travels with the snapshot it has always lived beside. The offline
       save already pinned the edit's TRUE entry time into it (S617), so
       after a relaunch the edit argues with its real stamp and wins the
       race it honestly won. The clock offset rides along so the restored
       stamps are read in the frame they were minted in. */
    ledger: _lastStampedLocal || null,
    clockOffset: _svrOffset || 0,
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
    /* S625 — restore the entry-time ledger with the snapshot (OPEN 3). */
    if (rec.ledger && !_lastStampedLocal) _lastStampedLocal = rec.ledger;
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
    /* S623 — fall back to the anon key exactly as Auth.request does. Without
       this the header read 'Bearer null' whenever no session token was
       present, which every caller inherited; it matters now because the boot
       pull moved onto this fetch so that it can learn the server clock, and
       the boot pull is precisely the moment a token may not yet be restored. */
    'Authorization': 'Bearer ' + (token || _anonKey()),
    'Content-Type': 'application/json'
  }, opts.headers || {});

  var _t0 = Date.now();   // S623: the send side of the round-trip clock sample
  return fetch(_url() + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function(res) {
    try { if (_tripAt) _tripAt.set(res, { t0: _t0, t1: Date.now() }); } catch (_) {}
    _learnServerTime(res);   // S622i: coarse fallback until a write lands
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

/* ═══ S566 — CHANGE-SCOPED SAVES (opt-in via config.partialSave) ═══════════
 * Instead of replacing the whole cloud document, send ONLY the top-level
 * sections that differ from the last-synced ancestor; the server overlays
 * them (tool_partial_save RPC) under the same If-Match token, wipe guard and
 * history snapshot as the full path.
 *
 * THE SAFETY ARGUMENT IS EQUIVALENCE, NOT JUDGEMENT. When If-Match passes,
 * cloud == ancestor, so ancestor ⊕ changed-sections is content-identical to
 * what a full push of this payload would have written — the partial path can
 * never produce a different final row than today's path. What it removes is
 * the ability to REWRITE sections this device did not change, which is the
 * blast radius three inspectors on one project actually share. No size or
 * loss thresholds are involved anywhere in this path.
 *
 * THE FALLBACK LADDER IS ABSOLUTE: no ancestor pinned, a top-level section
 * deleted outright, nothing changed, no material size benefit, RPC declined
 * ('stale' → the full path's own 412 → 3-way merge machinery takes over),
 * network or any error at all → the full-document push runs exactly as it
 * always has. A failure here can cost bytes, never data. */
var _RECEIPT_KEYS = { _dev: 1, _tab: 1, _via: 1, _wroteAt: 1 };   // S589
function _computePartialPayload(mine, base) {
  try {
    if (!mine || !base || typeof mine !== 'object' || typeof base !== 'object' ||
        Array.isArray(mine) || Array.isArray(base)) return null;
    var bk = Object.keys(base);
    for (var i = 0; i < bk.length; i++) {
      // A vanished top-level section cannot be expressed as an overlay —
      // and is also the shape a wipe makes. Full path only.
      if (!(bk[i] in mine)) return null;
    }
    var changed = {}, keys = [], sentLen = 2, fullLen = 2;
    var mk = Object.keys(mine);
    for (var j = 0; j < mk.length; j++) {
      var k = mk[j];
      var a = JSON.stringify(mine[k]);
      if (a === undefined) return null;          // unserializable value — full path
      fullLen += a.length + k.length + 4;
      /* S583 — equality judged CANONICALLY (stableKey), never by raw
         JSON.stringify: the ancestor comes back through jsonb, which
         re-orders keys, so raw-string comparison marked every section
         changed on every save and the scoped path silently degenerated.
         (Raw stringify above is still used for SIZE, which is what actually
         goes over the wire.) _ts stays IN this comparison on purpose — a
         genuinely changed item carries a new stamp and that stamp must
         reach the cloud with it. */
      if (_RECEIPT_KEYS[k]) continue;   // S589: receipts ride the full path only
      var isEq = (k in base) && stableKey(mine[k]) === stableKey(base[k]);
      if (!isEq) { changed[k] = mine[k]; keys.push(k); sentLen += a.length + k.length + 4; }
    }
    if (!keys.length) return null;               // nothing changed — full path decides
    if (sentLen >= fullLen * 0.9) return null;   // no material benefit — full path
    return { payload: changed, keys: keys,
             kb: Math.round(sentLen / 1024), fullKb: Math.round(fullLen / 1024) };
  } catch (e) { return null; }
}

function _reportPartialOutcome(info) {
  if (_partialSaveCfg && typeof _partialSaveCfg.onPartialPush === 'function') {
    try { _partialSaveCfg.onPartialPush(info); } catch (_) {}
  }
}

/* ═══ S572 — ANTI-DRIFT FULL-DOCUMENT RE-ASSERT ═════════════════════════════
 * Scoped saves only ever overlay the sections a device changed. The equivalence
 * argument holds for anything the ENGINE writes: If-Match guarantees cloud ==
 * ancestor at push time, so ancestor ⊕ changed is provably the same row a full
 * push would have produced.
 *
 * What that argument does NOT cover is a writer OUTSIDE this engine touching
 * the same row — the Hub's issue/status writes are the live example. If a
 * device's ancestor ever stops matching cloud reality in a section it never
 * edits, scoped saves would never correct it, because they never send it. The
 * drift would simply sit there, invisible, until something read it.
 *
 * So the whole document is re-asserted on a schedule, and drift can never
 * outlive one interval:
 *   - the FIRST push of a session is always full;
 *   - after 20 scoped pushes, the next is full;
 *   - after 30 minutes, the next is full.
 * A full push rewrites every section and re-pins the ancestor from what was
 * actually written, so anything that had drifted is corrected in one step.
 * Cost is one ordinary save every so often — the same save every tool did on
 * every tick until yesterday.
 *
 * A PULL is the other correction path and needs no help here: it re-pins the
 * ancestor from the real cloud row, so a device that pulls has re-synchronised
 * its picture by definition. These budgets exist for the device that is only
 * ever writing. */
var _PARTIALS_BEFORE_FULL = 20;
var _FULL_REASSERT_MS = 30 * 60 * 1000;
var _partialsSinceFull = 0;
var _lastFullPushAt = 0;
/* S573 — SECTION FINGERPRINTS. The server is the sole author of these; the
   client never computes one, it only stores what it was told and hands it back
   on the next scoped save. That is deliberate: a fingerprint computed
   independently in JS and in Postgres would have to agree on key order,
   whitespace and number formatting for every value in a report — it would not,
   and the failures would be silent false alarms. Null until the server has
   spoken, and a null map simply means "no expectations to check". */
var _sectionDigests = null;
var _driftPending = false;   // a drift report forces the very next push full

/** True when this push must send the whole document to re-assert it. */
function _fullReassertDue() {
  if (_driftPending) return true;                                     // server reported divergence
  if (!_lastFullPushAt) return true;                                  // first of the session
  if (_partialsSinceFull >= _PARTIALS_BEFORE_FULL) return true;       // count budget spent
  if ((Date.now() - _lastFullPushAt) >= _FULL_REASSERT_MS) return true; // time budget spent
  return false;
}

/** Called from the confirmed-push handler for BOTH paths. */
function _notePushMode(wasPartial) {
  if (wasPartial) { _partialsSinceFull++; }
  else {
    _partialsSinceFull = 0; _lastFullPushAt = Date.now();
    /* A full push rewrote every section, so any previously reported drift is
       now corrected — and the digests we held describe a row that no longer
       exists. Drop them; the next scoped save runs without expectations and
       the server re-issues a fresh set with it. */
    _driftPending = false; _sectionDigests = null;
  }
}

/** Resolves to rows-shaped [{id, instance_number, updated_at}] on a confirmed
 *  change-scoped save, or null for "use the full path". NEVER rejects. */
function _tryPartialSave(projectId, data) {
  return Promise.resolve().then(function() {
    var changed = _computePartialPayload(data, _lastSeenSnapshot);
    if (!changed) { _reportPartialOutcome({ mode: 'full', reason: 'not scoped' }); return null; }
    return _rawFetch('/rest/v1/rpc/tool_partial_save', {
      method: 'POST',
      body: {
        p_project_id: projectId,
        p_tool_key: _toolKey,
        p_instance_number: _instanceNumber,
        p_changed: changed.payload,
        p_if_match: _lastSeenUpdatedAt,
        /* S573: what this device believes the cloud holds, in the server's own
           words. Null on the first scoped save after any full push — the
           server then has nothing to check and issues a fresh set. */
        p_expect: _sectionDigests || null
      }
    }).then(function(res) {
      if (!res.ok) {
        _reportPartialOutcome({ mode: 'full', reason: 'server declined' });
        return null;   // incl. PT409: the full path retries and owns the loud banner
      }
      return res.json().then(function(rows) {
        var r = rows && rows[0];
        /* S573 — DRIFT. A section this device was NOT editing does not match
           what the cloud actually holds, so its picture of the report is wrong
           in a way a timestamp could never reveal. Nothing was written. Force
           the whole document on the next push, which corrects it in one step. */
        if (r && r.status === 'drift') {
          console.warn('[Sync S573] section drift detected (' +
                       (r.drift || []).join(', ') + ') — re-asserting the full document.');
          _driftPending = true;
          if (r.digests) _sectionDigests = r.digests;
          _reportPartialOutcome({ mode: 'full', reason: 'drift: ' + (r.drift || []).join(', '),
                                  drift: r.drift || [] });
          return null;
        }
        if (!r || r.status !== 'ok' || !r.row_updated_at) {
          console.info('[Sync S566] change-scoped save not taken (' +
                       (r && r.status || 'no result') + ') — full save instead.');
          _reportPartialOutcome({ mode: 'full', reason: (r && r.status) || 'no result' });
          return null;
        }
        if (r.digests) _sectionDigests = r.digests;   // fresh truth, straight from the server
        /* S623 — row_updated_at is read back AFTER the update inside the RPC,
           so it is the trigger's now(). Diesel runs change-scoped saves, so
           without this hook the precise clock would never be learned on the
           tool that needs it most. */
        _learnFromRows(res, [{ updated_at: r.row_updated_at }]);
        console.log('[Sync S566] change-scoped save: sent ' + changed.keys.join(', ') +
                    ' (' + changed.kb + ' KB of ' + changed.fullKb + ' KB)');
        _reportPartialOutcome({ mode: 'partial', sent: changed.keys,
                                sentKB: changed.kb, fullKB: changed.fullKb });
        return [{ id: _instanceId, instance_number: _instanceNumber,
                  updated_at: r.row_updated_at }];
      });
    });
  }).catch(function(e) {
    console.warn('[Sync S566] change-scoped attempt failed — full save instead:', e && e.message);
    _reportPartialOutcome({ mode: 'full', reason: 'error' });
    return null;
  });
}

var SyncEngine = {

  get instanceId() { return _instanceId; },
  get instanceNumber() { return _instanceNumber; },
  get lastSeenUpdatedAt() { return _lastSeenUpdatedAt; },
  /** S589 — name the code path about to push, for the device receipt. */
  set pushVia(v) { _pushVia = String(v || 'save').slice(0, 24); },
  /** S589 — host hook: called with the new state whenever the engine replaces
   *  the model, so the host can re-baseline its unsent-work ledger. */
  set onModelReplaced(fn) { _onModelReplaced = (typeof fn === 'function') ? fn : null; },
  /** S599 — host receives (event, detail) for every pull decision. */
  set onDiag(fn) { _onDiag = (typeof fn === 'function') ? fn : null; },
  /** S601 — the SAME per-item entry-stamp merge the heartbeat pull uses,
   *  callable at boot so the boot path can stop being the one door that
   *  bypasses it. local = device's disk copy, cloud = pulled row. */
  mergeByStamps: function (localState, cloudState) {
    try {
      if (!localState) return cloudState;
      if (!cloudState) return localState;
      return _mergeLWW(localState, JSON.parse(JSON.stringify(cloudState)), _lastSeenSnapshot);
    } catch (e) { console.warn('[Sync S601] boot merge fail-open:', e && e.message); return cloudState; }
  },
  get onModelReplaced() { return _onModelReplaced; },

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
    _lastPersistPid = projectId;   // S626b: an offline stamp must be able to persist without waiting for a prior save
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
      /* ═══ S626b — THE LEDGER IS NOT THE SNAPSHOT, AND MUST SURVIVE THIS
         GUARD. The S132 blank-snapshot guard below returns early — correctly:
         a contentless snapshot must not render or become a merge base. But
         the ENTRY-TIME LEDGER was restored after it, so on exactly the boot
         that matters it was never restored at all. That is why Mark's 77
         reverted even with the ledger provably on disk, and why S625b's
         restore appeared to change nothing: the code never reached it. An
         offline edit's snapshot is frequently minimal — the S622 honesty
         revert strips an unpushed edit out of it by design — so "blank
         snapshot" and "has unsent work" are not opposites; they co-occur
         precisely in the case this exists to protect. Restore the ledger
         first, unconditionally. It is read-only evidence about WHEN this
         device typed things; it renders nothing and is never a merge base. */
      if (rec.ledger && !_lastStampedLocal) _lastStampedLocal = rec.ledger;
      if (rec.ledger) _bootLedger = rec.ledger;
      if (self._isBlankSnapshot(rec.snapshot)) {
        console.warn('[Sync] IDB snapshot is blank/placeholder — skipping fast-path render, waiting for cloud pull');
        return null;
      }
      _lastSeenUpdatedAt = rec.updatedAt || null;
      _lastSeenSnapshot = rec.snapshot;
      /* S625b — Mark's Test 3, on-device: 77 typed offline, app closed,
         reopened — 200 came back. The ledger DID persist (S625) and the
         restore DID exist — in _restoreSyncMeta, the fallback path the pull
         uses, which the harness happened to exercise. The path Diesel's boot
         ACTUALLY takes is this one, and it restored the snapshot and token
         while leaving the entry-time ledger on disk — so the offline edit
         arrived at the boot merge with no stamp and lost to the cloud's
         stamped copy, every time. Same restore, on the door that is used. */
      /* S626b — restored above, before the blank-snapshot guard. */
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
    if (projectId) _lastPersistPid = projectId;   // S626b
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
      /* S623 — THE BOOT PULL MUST LEARN THE CLOCK. This ran through
         Auth.request, which never feeds the clock learner, so the first
         entry anyone typed after opening the tool was minted on the raw
         device clock — and the monotonic floor then held that skewed value
         for as long as the skew lasted. Same request, same 401 handling,
         same raw text for the off-thread parse; through the one fetch that
         learns. Verified by tools/sim/clockskew.mjs check 4, which fails
         without this even though the offset is learned moments later. */
      return _rawFetch(path).then(function(res) {
        if (!res.ok) {
          return res.json().catch(function() { return { message: res.statusText }; })
                    .then(function(err) { throw new Error(err.message || err.msg || res.statusText); });
        }
        return res.text();
      });
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
      /* S588 — THE PERMISSION-SLIP BUG (proven 02 Aug, 1490.04 hist 998).
         The token was pinned to the cloud's CURRENT timestamp here, BEFORE the
         stale-overwrite guard below decided whether to apply the pull. When
         the guard fired ("local is newer — skip the apply"), the tab kept its
         stale screen AND walked away holding a fresh If-Match token: its next
         save wrote the stale document straight over newer cloud work — no
         412, no merge, no trace. That is how a desktop tab erased the phone's
         synced 60 psi within minutes, all night, across three fix attempts
         aimed at the phone. Rule: a guard that refuses the APPLY must refuse
         the TOKEN. Pin only after the guard passes; on guard-fire, restore
         the pre-pull token so the stale tab's next push 412s into the 3-way
         merge — where the other device's newer rows survive and this tab's
         genuinely newer fields survive too. */
      var _tokBeforePull = _lastSeenUpdatedAt;
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
            _lastSeenUpdatedAt = _tokBeforePull;   // S588: no apply → no token
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
          var _rawCloudForDiag = null;
          try { _rawCloudForDiag = JSON.parse(JSON.stringify(data)); } catch (_) {}
          if (_lp && !(opts && opts.allowStaleOverwrite)) data = _mergeLWW(_lp, data, _lastSeenSnapshot);
        } catch (e) { console.warn('[Sync I-3] merge wire skipped:', e && e.message); }
        /* S604 — record whether this pull's OUTCOME differs from what the
           cloud actually holds. When the stamp merge keeps newer local
           entries over the cloud copy, this device is now AHEAD of the
           cloud — and unless it pushes, the cloud keeps the losing value
           forever (tonight's field deadlock: PC held the correct 150, cloud
           held the phone's stale 200, and the push dedupe — which compares
           against what THIS device last sent, not what the cloud holds —
           saw nothing to send). The facade reads this flag to re-arm the
           push after such a pull. */
        try { SyncEngine.lastPullKeptLocal = false; } catch (_) {}
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
        /* S583 — NO-CHANGE GATE, pull direction (Mark's ruling: "the cloud
           should not push to local if no changes, period"). If the cloud copy
           is content-identical to what this window already holds — compared
           canonically, bookkeeping ignored — nothing is applied, nothing
           re-renders, nothing re-saves. The concurrency token and snapshot
           are still re-pinned (that is the pull's other job), so the next
           push preconditions correctly. Ten idle windows on one report must
           produce total silence. Boot is naturally exempt: an unpopulated
           model never content-matches a real cloud row. */
        try {
          var _lpg = (model && typeof model.getProject === 'function') ? model.getProject() : null;
          /* S605 — the S604 trigger compared merged-vs-rawCloud CONTENT, which
             differs on every pull for any tool holding local-only photo
             binaries (the cloud strips dataURLs by design). That made every
             pull re-arm the push — and under the dirty-forever bug the flush
             ran BEFORE the pull and overwrote another inspector's newer entry
             with stale content (harness-reproduced). The merge already knows
             whether it kept typed local content the cloud lacks; use ITS
             verdict, which binary preserves never touch. */
          /* S616 — plus keptLocalNewer: a local win that was CLEAN against
             this device's own snapshot still means the cloud is holding a
             loser, and still has to be pushed back. Its absence here was the
             unexplained `pull_decision` on `no-change` ticks. */
          /* ═══ S619 — THE RECORDER LOOKED AT ONE FIELD, AND ONLY AT BOOT ════
             Mark's 05 Aug field session produced four reproducible failures.
             Twenty-five diag rows were written across three devices that day
             and EVERY ONE was identical: the same stale flow-test discharge
             from two days earlier. The reason is above — `_pick` reads one
             hard-coded field (the 100% row's discharge), and this whole block
             only runs on a boot pull. Every failure happened mid-session, on a
             heartbeat, on OTHER fields. The decisive moment — the instant a
             device decided to keep its own value — was never recorded on any
             device, which is also why the S611 "unexplained pull" sat open for
             eight sessions: the window was pointed at the wrong wall.

             The rule now is DISAGREEMENT, not schedule. Silent while the
             devices agree — so this costs nothing on a normal day — and loud
             on exactly the ticks where something was contested, naming the
             field, both candidate values, both entry stamps, and who won.
             That is the whole forensic question in one row.

             Bounded on purpose: at most _DIAG_MAX_FIELDS fields per tick and
             at most one row per _DIAG_MIN_GAP_MS, so a genuinely divergent
             pair of devices cannot flood the table. Values are truncated to
             40 characters — this is evidence about WHICH side won, never a
             copy of the report. */
          try { SyncEngine.lastPullKeptLocal = !!(_lwwMergeStats && (_lwwMergeStats.keptLocalDirty > 0 || _lwwMergeStats.keptLocalAbsent > 0 || _lwwMergeStats.keptLocalNewer > 0)); } catch (_) {}   // S604→S605→S616
          /* S599 — report what the merge decided, before the gate can swallow it. */
          try {
            if (_onDiag) {
              var _contested = _diagContestedFields(_rawCloudForDiag, _lpg, data);
              if (_contested.length && (Date.now() - _lastDiagAt) >= _DIAG_MIN_GAP_MS) {
                _lastDiagAt = Date.now();
                _onDiag('pull_decision', {
                  contested: _contested,
                  gateWillBlock: !!(_lpg && contentEquals(data, _lpg)),
                  hadSnapshot: !!_lastSeenSnapshot,
                  keptLocal: !!SyncEngine.lastPullKeptLocal,
                  lwwStats: (typeof _lwwMergeStats !== 'undefined' ? _lwwMergeStats : null)
                });
              }
            }
          } catch (_) {}
          if (_lpg && contentEquals(data, _lpg)) {
            _lastSeenSnapshot = _lwwRevertDirtyKept(JSON.parse(JSON.stringify(data)));   // S622: an unpushed edit never enters the ledger
            _lastStampedLocal = _lastSeenSnapshot;
            _reassertBootLedger();   // S626b
            _persistSyncMeta(projectId, _instanceId);
            console.log('[Sync S583] pull: cloud content identical to local — nothing applied.');
            return data;
          }
        } catch (e) { /* on any doubt, fall through to the normal apply */ }
        // S123 P6B — snapshot for 3-way merge. Deep clone so later edits
        // to model.getProject() don't mutate this reference.
        _lastSeenSnapshot = _lwwRevertDirtyKept(JSON.parse(JSON.stringify(data)));   // S622: an unpushed edit never enters the ledger
        // S583: the applied state is now what this device holds — it becomes
        // the stamp ledger, so items the CLOUD changed are not re-stamped by
        // this device's next save.
        _lastStampedLocal = _lastSeenSnapshot;
        _reassertBootLedger();   // S626b: the apply path — where the boot pull actually lands
        model.setProject(data);
        try { if (typeof _onModelReplaced === 'function') _onModelReplaced(data); } catch (_) {}
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
    /* S622i — the probe ran through Auth.request, which never feeds the
       server-clock learner, so a device could beat for minutes and still
       mint its first entries on its own skewed clock (the wire caught AD
       shipping a stamp 3.7s in the future). Same behaviour, same 401
       handling — through the one fetch that learns. */
    return _rawFetch(path).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function(rows) {
      SyncEngine.lastProbeError = null;
      if (!rows || !rows.length) return null;
      return rows[0].updated_at || null;
    }).catch(function(err) {
      /* S602 — this returns null on ANY failure, and callers read null as
         "the cloud has not changed". An expired token or a dropped request
         therefore looked exactly like a quiet cloud — silently, on a device
         with no console. The return contract is unchanged (callers rely on
         it); the reason is now recorded so a caller can tell the difference
         and report it. */
      SyncEngine.lastProbeError = (err && err.message ? String(err.message) : 'unknown').slice(0, 120);
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
  /* ═══ S617 — STAMP AT EDIT TIME, WITH OR WITHOUT A NETWORK ═══════════════
     A value's entry time is when it was TYPED. Field failure (Mark, 05 Aug):
     a reading typed offline wrongly beat a reading another device typed
     later, because no stamping pass ran until the first ONLINE push — the
     facades return "Saved locally (offline)" before this engine is ever
     called, so the edit's moment was recorded at flush time. The sixth
     instance of the entry-time fabrication family, by omission.
     This is the whole stamping half of push() and nothing else: serialize,
     diff against this device's own ledger, pin. The ledger pins immediately
     (the S583 rule), so the eventual online flush re-diffs as "unchanged"
     and carries this stamp verbatim instead of minting a fresher one.
     S625 — the queued work lands: the ledger persists to IDB the moment the
     offline stamp pins, so killing the app no longer erases WHEN the edit
     was made. The reopened app restores the ledger with the snapshot and the
     edit argues with its true stamp — OPEN 3's root, closed where the file
     itself declared it open. */
  stampLocal: function () {
    var proj = model.getProject();
    return SyncWorkerHost.serializePush(proj).then(function (serialized) {
      var data = serialized.strippedData;
      try {
        _stampLWW(data, _lastStampedLocal || _lastSeenSnapshot);
        _lastStampedLocal = JSON.parse(JSON.stringify(data));
        /* S625/S626b — the stamp is only real if it survives the process. The
           project id is now captured by every engine door that receives one
           (boot restore, pull, push), so an edit typed offline in a session
           that has not yet completed a save still persists its entry time.
           Awaited by the caller via the returned promise, so the facade's
           "Saved locally" is not reported before the ledger is on disk. */
        return _persistSyncMeta(_lastPersistPid, _instanceId).catch(function(){ return null; });
      } catch (e) { console.warn('[Sync I-3] offline stamp skipped:', e); }
      return null;
    }).catch(function (e) {
      console.warn('[Sync] stampLocal failed:', e && e.message);
      return null;
    });
  },

  push: function(projectId, _attempt) {
    if (projectId) _lastPersistPid = projectId;   // S626b
    _attempt = _attempt || 0;
    var self = this;
    /* ═══ S622e — SINGLE-FLIGHT PUSH (Mark's 06 Aug 22:00 telemetry: nine
       412s in two seconds). Reconnect, heartbeat flush, and autosave are all
       legitimate push triggers, and after a kept-local re-arm every one of
       them fired AT ONCE — three concurrent chains from one device, each
       retrying into collisions caused partly by its own siblings, all three
       exhausting their attempts, and the next pull re-arming the storm: a
       livelock the recorder caught end to end. One device gets ONE push
       flight. A trigger that arrives mid-flight coalesces: it marks a
       follow-up and rides the in-flight promise, and when the flight lands
       the follow-up runs once with the then-current state — no trigger is
       dropped, none duplicates. Retry attempts (_attempt > 0) are the SAME
       flight continuing, never coalesced against themselves. */
    if (_attempt === 0) {
      if (_pushFlight) {
        _pushFollowUp = true;
        return _pushFlight;
      }
      var _flightDone = function (r) {
        _pushFlight = null;
        if (_pushFollowUp) {
          _pushFollowUp = false;
          /* one queued follow-up, with whatever the state is NOW */
          return self.push(projectId, 0);
        }
        return r;
      };
      _pushFlight = self._pushRun(projectId, 0).then(_flightDone, function (e) { _flightDone(); throw e; });
      return _pushFlight;
    }
    return self._pushRun(projectId, _attempt);
  },

  _pushRun: function(projectId, _attempt) {
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
      /* ═══ S617 — A VALUE'S TIME IS WHEN IT WAS TYPED, NOT WHEN IT SENT ════
         Field failure (Mark, 05 Aug): a reading typed OFFLINE wrongly beat a
         reading another device typed later, because this branch exited before
         the stamping pass ever ran — the edit's moment was only recorded at
         the first ONLINE push, i.e. at flush time. The sixth instance of the
         entry-time fabrication family, by omission rather than by `now`.
         Run the SAME pass the online path runs, against the same ledger:
         the ledger pins immediately (the S583 rule), so when the flush later
         re-serializes, it re-diffs as "unchanged" and carries this stamp
         verbatim instead of minting a fresher one. Network is never touched.
         HONEST LIMIT: the ledger is in-memory. Kill the app while offline and
         the un-flushed edit re-stamps at next serialize; persisting the
         ledger is queued work, not quietly claimed here. */
      /* S617 — one implementation: the engine's own offline exit runs the
         same edit-time stamping pass the facades invoke (see stampLocal). */
      return self.stampLocal();
    }

    if (_attempt >= 3) {
      console.warn('[Sync] Push abandoned — 3 conflict retries exhausted.');
      /* S622c — PUSH-PATH TELEMETRY. The recorder logged every pull decision
         and NOTHING about pushes: an iPhone that attempted zero cloud writes
         for five minutes (Mark's 06 Aug pm-rpm drift) was indistinguishable
         from one whose pushes all collided out or timed out. Every non-success
         push outcome is now recorded, so the next field failure names its own
         mechanism instead of costing a forensic session. */
      try { if (_onDiag) _onDiag('push_result', { outcome: 'abandoned-3-retries' }); } catch (_) {}
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
      /* S589 — device receipt on every write (invisible, ~90 bytes). */
      try {
        data._dev = _DEV_ID; data._tab = _TAB_ID; data._via = _pushVia;
        data._wroteAt = new Date().toISOString();
      } catch (e) { /* never block a push over bookkeeping */ }
      // S524 DOCTRINE I-3 / S583 REWORK — stamp per-item _ts on the push clone.
      // Diff vs THIS DEVICE'S OWN previous stamped state (_lastStampedLocal),
      // never the cloud snapshot: unchanged items carry their existing stamp
      // verbatim; only a genuinely new entry gets a stamp, once. The ledger is
      // pinned IMMEDIATELY — before the push can succeed or fail — so a failed
      // push retried later re-diffs as "unchanged" and keeps the original
      // entry-time stamp instead of minting a fresher one.
      try {
        _stampLWW(data, _lastStampedLocal || _lastSeenSnapshot);
        _lastStampedLocal = JSON.parse(JSON.stringify(data));
      } catch (e) { console.warn('[Sync I-3] stamp wire skipped:', e); }

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
        updated_at: new Date().toISOString()
      };
      /* S583 — EVERY SAVE RECORDS ITS AUTHOR. The old `user ? user.id : null`
         explicitly ERASED the row's author whenever Auth was momentarily
         unavailable (mid-token-refresh) — 1490.04 history shows saves with no
         author, which the badge system cannot attribute. Omit the field
         instead: a PATCH without it leaves the previous author intact. */
      if (user && user.id) payload.updated_by = user.id;

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
        if (user && user.id) payload.created_by = user.id;   // S583: never write null over an author field
        payload.status = 'draft';
        payload = [payload];
      }

      /* S566 — try the change-scoped save first. Existing rows only (PATCH),
         and only with a pinned ancestor + If-Match token. Any outcome other
         than a confirmed 'ok' resolves null and the full-document push below
         runs untouched. */
      var _partialAttempt = Promise.resolve(null);
      var _reassert = _fullReassertDue();
      if (_reassert) {
        _reportPartialOutcome({ mode: 'full', reason: 'full re-assert' });
      } else if (method === 'PATCH' && _partialSaveCfg && _instanceId &&
                 _lastSeenSnapshot && _lastSeenUpdatedAt) {
        _partialAttempt = _tryPartialSave(projectId, data);
      }
      return _partialAttempt.then(function(_pRows) {
        if (_pRows) { _notePushMode(true); return _pRows; }   // confirmed scoped save
      return _rawFetch(path, {
        method: method,
        body: payload,
        headers: customHeaders
      }).then(function(res) {
      // S123 P6B — 412 Precondition Failed = optimistic-concurrency conflict
      if (res.status === 412) {
        console.warn('[Sync] 412 conflict on push — running 3-way merge (attempt ' + (_attempt + 1) + '/3)');
        try { if (_onDiag) _onDiag('push_result', { outcome: '412', attempt: _attempt + 1 }); } catch (_) {}   // S622c push telemetry
        /* S590 — RESULT PROPAGATION FIX (Mark's "Saved locally while online").
           The conflict path's retried push already returns a fully processed
           row — but this value then fell into the outer rows-handler below,
           which expects a raw ARRAY and reads a row object as "no result".
           The push had LANDED, yet save() resolved null: pill said "Saved
           locally", the pushed ledger never advanced, the next save re-pushed
           and re-collided — the merge loop in the 03 Aug 00:15 console. Wrap
           the resolved value so the outer handler passes it through intact. */
        return self._handleConflict(projectId, proj, _attempt).then(function (r) {
          return { __resolvedElsewhere: true, value: r };
        });
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
      return res.text().then(function(text) {
        var rows = text ? JSON.parse(text) : null;
        /* S623 — the row we just wrote came back carrying Postgres's own
           now(), at microsecond resolution. This is the tightest clock
           reference the tool ever sees, and it arrives free on every save. */
        _learnFromRows(res, rows);
        return rows;
      });
    });
      }).then(function(rows) {
      /* S590 — a conflict-path result is already fully processed; pass it up. */
      if (rows && rows.__resolvedElsewhere) return rows.value;
      if (rows && rows.length > 0) {
        _instanceId = rows[0].id;
        _instanceNumber = rows[0].instance_number;
        _lastSeenUpdatedAt = rows[0].updated_at || null;
        // S123 P6B — update snapshot to the just-pushed state so next
        // 412 has the correct ancestor.
        _lastSeenSnapshot = JSON.parse(JSON.stringify(data));
        /* S572: this push wrote every section, so the ancestor is re-pinned
           from a complete write and any drift is now corrected. Resets both
           drift budgets. Scoped pushes return earlier and never reach here. */
        _notePushMode(false);
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
      /* ═══ S622 — MINE MUST BE STAMPED (fieldsymptom.mjs, Mark's Test 1).
         This door merged the RAW screen state as "mine" — but the freshly
         minted entry stamps live only on the stamped payload the push just
         sent; the screen copy carries none. The reconciled result therefore
         wore the CLOUD side's stamps (or nothing), was then installed as
         this device's stamp ledger, and every later save shipped the value
         undated — the exact production of the 05:06Z "35 with stamp 0" row
         in tool_data_history. Run the SAME stamping pass on a clone of mine
         against the same ledger the payload was stamped with: values equal
         to the just-stamped payload CARRY those stamps deterministically —
         nothing is minted twice, no time is invented. */
      var stampedMine = localProj;
      try {
        stampedMine = JSON.parse(JSON.stringify(localProj));
        _stampLWW(stampedMine, _lastStampedLocal || _lastSeenSnapshot);
      } catch (_) { stampedMine = localProj; }
      return SyncWorkerHost.merge3Worker(_lastSeenSnapshot, stampedMine, cloudData).then(function(mergeResult) {
      /* ═══ S622 — ENTRY TIME, NOT ARRIVAL ORDER, SETTLES A SCALAR COLLISION.
         merge3 is model-neutral: a same-field scalar collision became a
         "conflict", and both facades auto-resolve every non-bookkeeping
         conflict to the CLOUD — which is "whoever pushed first wins",
         regardless of when each value was typed. That is Mark's Test 1
         verbatim. For every field the LWW spec governs, resolve the
         collision here by the values' own entry stamps — the same law as
         the pull door — and align the merged root ledger to the winner so
         stamp and value can never disagree again at this door. */
      try { _resolveSpecConflicts(mergeResult, stampedMine, cloudData); } catch (_) {}

      /* S589 — ANCESTOR DISCIPLINE (root cause of the 80→150 revert, proven
         by the 12:15 console: "412 → silent merge, both editors kept (0
         conflicts)" and the other device's reading vanished).
         The token must advance (the retry needs it), but the SNAPSHOT is the
         merge ANCESTOR — "what this device and the cloud last agreed on". It
         was being set to the raw cloud copy while the model held something
         else. On the next 412 that made the cloud's side look UNCHANGED
         (theirs == base) and this device's stale document look like the only
         edit — so merge3 silently handed the win to the stale document, with
         zero conflicts, and pushed it over the other device's newer work.
         The ancestor is pinned below, to the state actually agreed (merged),
         once the merge has produced it. */
      _lastSeenUpdatedAt = cloudUpdatedAt;
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
        /* S589: ancestor = what we agreed, which is exactly what the model now
           holds. If the retry push fails, the NEXT merge correctly sees this
           device as unchanged and lets the other device's newer rows through. */
        _lastSeenSnapshot = JSON.parse(JSON.stringify(guardedMerged));
        _alignSpecStamps(guardedMerged, stampedMine, cloudData || {});   // S625: a value never wears another value's stamp
        _lastStampedLocal = JSON.parse(JSON.stringify(guardedMerged));   // S583: merged state = new stamp ledger
        _persistSyncMeta(projectId, _instanceId);
        try { if (typeof _onModelReplaced === 'function') _onModelReplaced(guardedMerged); } catch (_) {}
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
        /* S622e — collision backoff with jitter. Retries 700ms apart into a
           cloud that two other devices were actively writing collided every
           single time. A short randomized pause lets this device slot into
           a gap instead of re-entering the same collision window. */
        return new Promise(function (res) { setTimeout(res, 350 * (attempt + 1) + Math.floor(Math.random() * 900)); })
          .then(function () { return self.push(projectId, attempt + 1); });
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
        _lastSeenSnapshot = JSON.parse(JSON.stringify(resolution.merged));   // S589: ancestor = agreed state
        _alignSpecStamps(resolution.merged, stampedMine, cloudData || {});   // S625: same law at the second 412 door
        _lastStampedLocal = JSON.parse(JSON.stringify(resolution.merged));   // S583: merged state = new stamp ledger
        try { if (typeof _onModelReplaced === 'function') _onModelReplaced(resolution.merged); } catch (_) {}
        // S171 Fix A — same reconcile as the silent-merge path.
        try {
          if (BinaryOutbox && BinaryOutbox.reconcileWithModel) {
            BinaryOutbox.reconcileWithModel(model.getProject());
          }
        } catch (e) {
          console.warn('[Sync][Fix A] reconcileWithModel (conflict resolution) failed:', e && e.message);
        }
        /* S622e — same collision backoff as the silent-merge retry above. */
        return new Promise(function (res) { setTimeout(res, 350 * (attempt + 1) + Math.floor(Math.random() * 900)); })
          .then(function () { return self.push(projectId, attempt + 1); });
      });

      }).catch(function(mergeErr) {
        // Legacy contract: any merge3 failure → abandon push.
        console.error('[Sync] merge3 threw — abandoning push:', mergeErr);
        try { if (_onDiag) _onDiag('push_result', { outcome: 'merge3-threw', err: String(mergeErr && mergeErr.message || mergeErr).slice(0, 120) }); } catch (_) {}   // S622c
        return null;
      });
    }).catch(function(err) {
      console.warn('[Sync] _handleConflict failed:', err.message);
      try { if (_onDiag) _onDiag('push_result', { outcome: 'conflict-path-failed', err: String(err && err.message || err).slice(0, 120) }); } catch (_) {}   // S622c
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
  /* S612 (restored from S608) — HARNESS HOOK. Replays the per-item LWW merge
     against the SHIPPED code with no I/O: no network, no IDB, no model
     mutation. Inputs are deep-cloned so a harness can never leak state into a
     live engine. Used by frt/tests/sim/stalemate.mjs. Not for production. */
  _lwwReplay: function(field, localArr, cloudArr, snapArr, rootFts) {
    /* S616 — `|| []` coerced a scalar '' into an empty ARRAY, so a harness
       could never see what the engine really does to a blank top-level value.
       Undefined still defaults to [] (what array callers expect); every other
       value, including '' and 0 and {}, is passed through as itself. */
    var _c = function (v) { return (v === undefined) ? [] : JSON.parse(JSON.stringify(v)); };
    var localProj = {}; localProj[field] = _c(localArr);
    var cloudData = {}; cloudData[field] = _c(cloudArr);
    var snap = {};      snap[field]      = _c(snapArr);
    /* S616 — optional root stamps, so a harness can prove that a genuinely
       newer stamped CLEAR still propagates and that the blank rule has not
       been widened into "blank always loses". */
    if (rootFts) {
      if (rootFts.local)  localProj._fts = { _root: JSON.parse(JSON.stringify(rootFts.local)) };
      if (rootFts.cloud)  cloudData._fts = { _root: JSON.parse(JSON.stringify(rootFts.cloud)) };
      /* S620 — `ledger` populates _lastStampedLocal INSTEAD of localProj._fts,
         reproducing real conditions: the screen state is collected fresh each
         tick and never carries stamps, so the local entry time can only come
         from this device's own ledger. Without this the harness could not see
         the fault at all — it was handing the merge a stamped local copy that
         never exists in the running tool. */
      if (rootFts.ledger) _lastStampedLocal = { _fts: { _root: JSON.parse(JSON.stringify(rootFts.ledger)) } };
    }
    var out = _mergeLWW(localProj, cloudData, snap);
    return { merged: out ? out[field] : null, stats: _lwwMergeStats };
  },

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

/* ═══ S635 — THE TIME IS PINNED WHEN THE VALUE IS SAVED ═══════════════════
   MARK, 09 AUG, ON THE IPHONE: type a value in airplane mode, close the app
   immediately, reopen — the old number is back. Wait about ten seconds before
   closing and it holds. Android holds either way.

   WHY THE TWO PLATFORMS DIFFER. A typed value reaches the device's own saved
   report ~0.7s after typing (the S488 watchdog). Its ENTRY TIME was recorded
   somewhere else entirely: on the 5.5s cloud-push debounce, or in the
   best-effort flush fired at visibilitychange/pagehide. Android reliably runs
   that flush before freezing the page. iOS very often does not — a swipe from
   the app switcher kills the process outright — so the value landed and its
   time never did. And per S634 a value with no recorded time loses to the
   cloud's timed copy at reopen, by design. Two save clocks, and only the
   slower one carried the evidence.

   THE FIX IS THE SHAPE, NOT THE TIMEOUT. Nothing that runs at close time can
   be relied on, on any platform — so the time must already be on disk before
   the app is closed. Stamping rides the SAME trigger as the value save, on a
   shorter debounce than it (500ms vs 700ms), so the entry time can never lag
   the value it belongs to. By the moment the value is on disk, its time is
   too. There is nothing left for a close-time flush to rescue, which is why
   this does not depend on iOS granting one.

   ONE IMPLEMENTATION (S478). The trigger lives here rather than in either
   host: Diesel reaches its save through the S488 delegated watchdog, Electric
   through ~90 hand-written debounceAutosave() call sites, and wiring this into
   both would mean two triggers to keep in step and one for anybody adding
   call site 91 to forget. Both pump tools instantiate this engine, so both get
   it, and a field added years from now is covered without anyone remembering.

   NO TIME IS INVENTED. This changes only WHEN the existing stamping pass runs,
   never what it records: stampLocal serializes, diffs against this device's
   own ledger, and pins only what actually changed (S617/S583). A value stamped
   here re-diffs as unchanged at the eventual online flush and travels with
   this stamp verbatim, so it argues with its real typing moment — which is
   also strictly MORE accurate than the 5.5s-late stamp it replaces.
   No network is touched.

   TRAILING DEBOUNCE, DELIBERATELY. Each edit resets the timer, exactly as the
   value save does, so the ledger always holds the value the save holds. A
   leading-edge timer would stamp a half-typed "7" of a "77" and, under S634's
   value-equality rule, the ledger's time would then refuse to lend itself to
   the "77" on disk — losing the edit through the very mechanism meant to save
   it. Harness: tools/sim/killswitch.mjs (fails on S634). */
var _stampSoonTimer = null;
var STAMP_SOON_MS = 500;          // must stay BELOW the host's value-save debounce
SyncEngine.stampSoon = function () {
  try {
    if (!_LWW_SPECS[_toolKey]) return;        // tools without entry-time merging
    if (!_lastPersistPid) return;             // no project in play (standalone) — nothing to pin
    if (_stampSoonTimer) clearTimeout(_stampSoonTimer);
    _stampSoonTimer = setTimeout(function () {
      _stampSoonTimer = null;
      try { SyncEngine.stampLocal(); }
      catch (e) { console.warn('[Sync S635] edit-time stamp skipped:', e && e.message); }
    }, STAMP_SOON_MS);
  } catch (_) { /* stamping must never break typing */ }
};

/* The trigger. Capture phase so a field that stops propagation cannot opt out
   — the same law as the S488 watchdog, and the same exclusions: file pickers
   mint their own records, dialog and search boxes are not report data. */
try {
  if (typeof document !== 'undefined' && document.addEventListener) {
    var _stampEdit = function (e) {
      var el = e && e.target;
      if (!el || !el.matches) return;
      if (!el.matches('input, textarea, select')) return;
      if (el.type === 'file') return;
      if (el.id && /^(dfx-|search|filter)/i.test(el.id)) return;
      if (el.closest && el.closest('.dlg-backdrop, dialog, .help-panel, .modal, [data-nosave]')) return;
      SyncEngine.stampSoon();
    };
    document.addEventListener('input', _stampEdit, true);
    document.addEventListener('change', _stampEdit, true);
  }
} catch (_) {}

// S123 P6B — expose for diagnostic / dev console
if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
}

  return SyncEngine;
}
