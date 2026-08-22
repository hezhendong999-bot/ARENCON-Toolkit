/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — REPORT STATE ENGINE        lib/data/reportState.js v1.0.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 2 (Part A — built, proven, NOT yet wired).

   WHAT THIS IS FOR. Every commissioning tool has to do the same two things:
   gather a report off the screen into one object, and put a saved object back
   onto the screen. Diesel and Electric each grew their own copy of both. That
   duplication is not a tidiness problem — it is why S673, S674 and S675 each
   had to be found once, fixed twice, and proven twice. A durability rule that
   lives in one tool's collect path is not a rule; it is a local habit.

   Here the movement of data is written ONCE and driven by a per-tool MANIFEST:
   a declared list of every key a report carries, how it is gathered, and how it
   is put back. The manifest is the contract; this file is the machinery.

   ── WHY A MANIFEST RATHER THAN MORE SHARED CODE ───────────────────────────
   The live Diesel apply path assigns flowTestPhotosPld TWICE, sixteen lines
   apart. It is harmless because it happens to be idempotent — this time. The
   defect it represents is not: in a hand-written list of ~38 keys, nothing
   checks that each key is handled once, in one place, on both sides. A key can
   be collected and never applied (witnessSignRows, S496 — a witness signature
   round-tripped to empty and then overwrote the cloud), or applied twice, and
   no test in the world notices, because the file still parses and the screen
   still fills in. A manifest makes both faults structural: a key with no apply
   rule is a declared error, and a key cannot appear twice in one list.

   ── WHAT THIS MODULE DOES NOT DO ──────────────────────────────────────────
   It does not save anything. It has no IDB, no network, no push bookkeeping.
   Storage stays deliberately un-unified (S496 rule, reaffirmed S676b): each
   tool keeps its own field-proven write path, and this engine hands it a plain
   object. Changing how a report is GATHERED is mechanical; changing how it is
   WRITTEN is how reports die.

   It also does not re-render. The live apply path braids two jobs together —
   putting values back, and repainting twenty surfaces. Only the first is
   shared. The repaint list is host personality and stays with the host, called
   through declared hooks in the order the host declares.

   ── WHY THE HOST HANDS IN BINDINGS ────────────────────────────────────────
   The obvious design — reach the tool's state through window — does not work
   and must not be made to work. Diesel declares almost all of its report state
   with `const` and `let` at the top level of a classic script, which means it
   is NOT on window and cannot be reached from here at all. That is a good
   thing: it is what forces the host to declare, explicitly and in one place,
   exactly which state this engine may touch. Arrays and objects are handed in
   as live references and mutated in place; anything the host REASSIGNS
   (contractorTrades, the revision scalars) is handed in as an accessor pair,
   because a reference to a value that gets replaced is a reference to the old
   value.

   ── HOST CONTRACT ─────────────────────────────────────────────────────────
   Classic <script>; publishes window.ReportState. No bare `export` — those
   throw the moment a classic script parses them, which is how a shared module
   takes a whole tool down.

     ReportState.collect(manifest, env)        -> plain state object
     ReportState.apply(state, manifest, env)   -> { applied:[], skipped:[], failed:[] }
     ReportState.audit(manifest)               -> structural check of the manifest

   env = {
     doc,                     the document to read/write
     refs:    { name: liveArrayOrObject },     mutated in place
     get(name) / set(name,v), for anything the host reassigns
     custom:  { name: fn },   bespoke collectors/appliers the host owns
     hooks:   { name: fn },   host steps (migrations, gates, repaints)
     opts:    { }             passed through to custom fns (e.g. hubLocked ids)
   }
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

function _deep(v) { return JSON.parse(JSON.stringify(v)); }

function _envGet(env, name) {
  if (env.refs && Object.prototype.hasOwnProperty.call(env.refs, name)) return env.refs[name];
  if (typeof env.get === 'function') return env.get(name);
  return undefined;
}
function _envSet(env, name, value) {
  if (typeof env.set === 'function') { env.set(name, value); return true; }
  return false;
}

/* ── COLLECT ───────────────────────────────────────────────────────────────
   Each manifest entry names one key of the saved report and how it is read.
   An entry that produces `undefined` is OMITTED from the result rather than
   written as undefined — absence and a recorded blank are different claims,
   and the merge engine treats them differently (S622i: a default nobody chose
   must never leave the device). */
var COLLECTORS = {

  /* A flat list of element ids -> { id: value }. Missing elements are skipped,
     never written as '' — a field that is not on this screen was not cleared. */
  fields: function (spec, env) {
    var out = {};
    (spec.ids || []).forEach(function (id) {
      var el = env.doc.getElementById(id);
      if (el) out[id] = el.value;
    });
    return out;
  },

  /* Array of plain objects, one level of copying — the rows keep their own
     identity but the caller cannot mutate live state through the result.

     `mintIds` gives rows a permanent name before copying, on the live row as
     well as the copy. This is not bookkeeping: rows without a stable identity
     merge by POSITION, and position means nothing across two devices — the
     whole pump-curve table used to merge last-save-wins for exactly this
     reason (S540/S605). Minting at collect time is the last moment it can
     still be done before the row leaves the device. The host supplies the
     minter, because the id FORMAT is the host's convention. */
  rowsCopy: function (spec, env) {
    var arr = _envGet(env, spec.ref);
    if (!Array.isArray(arr)) return arr;
    if (spec.mintIds && typeof env.mintId === 'function') {
      arr.forEach(function (r) { if (r && !r.id) r.id = env.mintId(spec.mintIds); });
    }
    return arr.map(function (r) { return Object.assign({}, r); });
  },

  /* Full structural copy, for nested state (checklists, deficiencies). */
  deepCopy: function (spec, env) {
    var v = _envGet(env, spec.ref);
    return (v === undefined || v === null) ? v : _deep(v);
  },

  /* Flat array copy. */
  listCopy: function (spec, env) {
    var arr = _envGet(env, spec.ref);
    return Array.isArray(arr) ? arr.slice() : arr;
  },

  /* A plain value read straight through (numbers, strings, chosen flags). */
  scalar: function (spec, env) {
    return _envGet(env, spec.ref);
  },

  /* A literal written on every save — schema versions and the like. */
  constant: function (spec) { return spec.value; },

  /* A Set -> array. */
  setToList: function (spec, env) {
    var s = _envGet(env, spec.ref);
    return s ? Array.from(s) : [];
  },

  /* { key: Set } -> { key: array }. */
  mapOfSets: function (spec, env) {
    var m = _envGet(env, spec.ref) || {}, out = {};
    Object.keys(m).forEach(function (k) { out[k] = Array.from(m[k] || []); });
    return out;
  },

  /* Checkbox group by name -> { value: {status} }, plus the legacy positional
     array some builds still read. Identity, not position (S616c). */
  checkboxGroup: function (spec, env) {
    var state = {}, positions = [];
    var list = env.doc.querySelectorAll('input[name="' + spec.name + '"]');
    Array.prototype.forEach.call(list, function (cb, i) {
      var k = cb.value || ('pos' + i);
      state[k] = { status: cb.checked ? 'yes' : 'no' };
      if (cb.checked) positions.push(i);
    });
    return spec.positions ? positions : state;
  },

  /* Anything genuinely bespoke to one tool: pitot rows, custom equipment,
     photo arrays that need the host's own outbound shaping. Declared here so
     the key is still ACCOUNTED FOR — the point of the manifest is that no key
     is invisible, not that every key is generic. */
  custom: function (spec, env) {
    var fn = env.custom && env.custom[spec.fn];
    if (typeof fn !== 'function') throw new Error('reportState: no custom collector "' + spec.fn + '"');
    return fn(env, spec);
  }
};

function collect(manifest, env) {
  var out = {};
  (manifest.keys || []).forEach(function (entry) {
    if (!entry.collect) return;                       // declared apply-only
    var kind = entry.collect.kind;
    var fn = COLLECTORS[kind];
    if (!fn) throw new Error('reportState: unknown collector kind "' + kind + '" for ' + entry.key);
    var v = fn(entry.collect, env);
    if (v === undefined) return;                      // absence is not a claim
    out[entry.key] = v;
  });
  return out;
}

/* ── APPLY ─────────────────────────────────────────────────────────────────
   Putting values BACK. Every rule mutates the host's own live objects in
   place, because the host holds those references everywhere and swapping them
   out from under it is how a screen ends up bound to an array nothing writes
   to any more.

   Absent keys are SKIPPED, never treated as empty. A saved report that predates
   a field must not blank that field, and a partial payload must not erase what
   it does not mention. */
var APPLIERS = {

  fields: function (val, spec, env) {
    var locked = (spec.lockedFrom && env.opts) ? (env.opts[spec.lockedFrom] || {}) : {};
    Object.keys(val || {}).forEach(function (id) {
      var el = env.doc.getElementById(id);
      if (!el) return;
      if (locked[id] && el.readOnly) return;          // params authoritative (S264)
      el.value = val[id];
    });
  },

  /* Row arrays whose objects must survive: the incoming copy carries typed
     fields, the live row carries photo binaries the cloud strips. The host's
     own pairing function decides — it is the S393 union rule and it does not
     belong to this engine. */
  rowsInPlace: function (val, spec, env) {
    var live = _envGet(env, spec.ref);
    var pair = env.hooks && env.hooks[spec.pairWith];
    if (!Array.isArray(val) || !Array.isArray(live)) return;
    val.forEach(function (r, i) {
      if (!live[i]) return;
      if (typeof pair === 'function') pair(live[i], r);
      else Object.assign(live[i], r);
    });
  },

  /* Replace the contents of a live array, keeping the array itself. */
  listReplace: function (val, spec, env) {
    var live = _envGet(env, spec.ref);
    if (!Array.isArray(val) || !Array.isArray(live)) return;
    live.length = 0;
    val.forEach(function (v) { live.push(v); });
  },

  /* Merge keys into a live object, leaving keys the payload does not mention. */
  objectMerge: function (val, spec, env) {
    var live = _envGet(env, spec.ref);
    if (!val || !live) return;
    Object.assign(live, val);
  },

  /* Replace a live object's contents entirely (the payload is authoritative
     for this whole family — deficiencies, where a removal must stick). */
  objectReplace: function (val, spec, env) {
    var live = _envGet(env, spec.ref);
    if (!val || !live) return;
    Object.keys(live).forEach(function (k) { delete live[k]; });
    Object.assign(live, val);
  },

  /* Per-key merge into an existing map of small objects, only for keys the
     host already knows about — chart state, where an unknown chart name from a
     newer build must not invent a chart. */
  perKeyMerge: function (val, spec, env) {
    var live = _envGet(env, spec.ref);
    if (!val || !live) return;
    Object.keys(live).forEach(function (k) {
      if (val[k]) {
        if (spec.replace) live[k] = Object.assign({}, val[k]);
        else Object.assign(live[k], val[k]);
      }
    });
  },

  /* A value the host reassigns rather than mutates. */
  scalar: function (val, spec, env) {
    if (spec.skipFalsy && !val) return;
    _envSet(env, spec.ref, val);
    if (spec.mirrorTo) {
      var el = env.doc.getElementById(spec.mirrorTo);
      if (el) el.value = val || '';
    }
  },

  /* array -> live Set contents. */
  listToSet: function (val, spec, env) {
    var live = _envGet(env, spec.ref);
    if (!Array.isArray(val)) return;
    if (live && typeof live.clear === 'function') { live.clear(); val.forEach(function (v) { live.add(v); }); }
    else _envSet(env, spec.ref, new Set(val));
  },

  /* { key: array } -> { key: Set }, host object kept. */
  mapOfLists: function (val, spec, env) {
    var live = _envGet(env, spec.ref);
    if (!val || !live) return;
    Object.keys(val).forEach(function (k) { live[k] = new Set(val[k]); });
  },

  /* Deliberately nothing: the key is written for older builds to read and is
     never read back by this one. Declared so it is visibly accounted for
     rather than looking like an oversight (S616c legacy equipment positions). */
  writeOnly: function () {},

  custom: function (val, spec, env) {
    var fn = env.custom && env.custom[spec.fn];
    if (typeof fn !== 'function') throw new Error('reportState: no custom applier "' + spec.fn + '"');
    fn(val, env, spec);
  }
};

/* apply() reports what it did rather than throwing the whole restore away.
   The live path wraps every line in ONE try, so the first thing that throws
   abandons every remaining key and the screen silently keeps whatever it had
   (S643 — Mark's "report opens empty" and "values never repaint"). Here each
   key is independent: one bad key is one bad key, named, and the other
   thirty-seven still land. */
function apply(state, manifest, env) {
  var applied = [], skipped = [], failed = [];
  state = state || {};
  (manifest.keys || []).forEach(function (entry) {
    if (!entry.apply) { skipped.push(entry.key + ':no-rule'); return; }
    if (!Object.prototype.hasOwnProperty.call(state, entry.key)) { skipped.push(entry.key + ':absent'); return; }
    var kind = entry.apply.kind;
    var fn = APPLIERS[kind];
    if (!fn) { failed.push(entry.key + ':unknown-kind:' + kind); return; }
    try { fn(state[entry.key], entry.apply, env); applied.push(entry.key); }
    catch (e) { failed.push(entry.key + ':' + String((e && e.message) || e).slice(0, 120)); }
  });
  return { applied: applied, skipped: skipped, failed: failed };
}

/* ── AUDIT ─────────────────────────────────────────────────────────────────
   The structural guarantees the hand-written lists could not give. This is the
   part that would have caught witnessSignRows collected-but-never-applied
   before it cost a set of witness signatures. */
function audit(manifest) {
  var seen = {}, dupes = [], collectOnly = [], applyOnly = [], unknown = [];
  (manifest.keys || []).forEach(function (e) {
    if (seen[e.key]) dupes.push(e.key);
    seen[e.key] = true;
    if (e.collect && !COLLECTORS[e.collect.kind]) unknown.push(e.key + ':collect:' + e.collect.kind);
    if (e.apply && !APPLIERS[e.apply.kind]) unknown.push(e.key + ':apply:' + e.apply.kind);
    if (e.collect && !e.apply && !e.collectOnlyReason) collectOnly.push(e.key);
    if (!e.collect && e.apply && !e.applyOnlyReason) applyOnly.push(e.key);
  });
  return {
    total: (manifest.keys || []).length,
    duplicates: dupes,
    collectedNeverApplied: collectOnly,
    appliedNeverCollected: applyOnly,
    unknownKinds: unknown,
    ok: !dupes.length && !collectOnly.length && !applyOnly.length && !unknown.length
  };
}

var api = {
  collect: collect,
  apply: apply,
  audit: audit,
  collectorKinds: Object.keys(COLLECTORS),
  applierKinds: Object.keys(APPLIERS),
  VERSION: '1.0.0'
};

if (root) root.ReportState = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
