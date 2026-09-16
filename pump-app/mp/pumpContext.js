/* ═══════════════════════════════════════════════════════════════════════
   PUMP CONTEXT                              multipump/js/pumpContext.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The one place the report changes which machine it is
   about. Everything an inspector types goes onto whatever pump is active
   at that moment, so this file is where a two-pump report is either
   honest or quietly wrong.

   WHAT IT IS BUILT ON, AND WHAT IT DOES NOT REBUILD. The shipped tools
   already move a report between the screen and a saved object, driven by
   a declared manifest (diesel-app/js/reportManifest.js) and the shared
   engine lib/data/reportState.js. This file adds nothing to that. It
   calls the engine with a manifest narrowed to the PUMP-scope keys, so
   the room's half of the screen is untouched BY CONSTRUCTION rather than
   by care. There is no second collector and no second applier here.

   ── THE FAILURE THIS FILE EXISTS TO PREVENT ──────────────────────────
   Putting a saved value back is not the same as making the screen say
   only that value. The engine's appliers write what they are given and
   nothing more — that is correct for a single-pump tool, where the
   screen was blank before the report opened. It is wrong for a pump
   switch, where the screen is already full of the LAST pump:

     • `fields` writes the ids present in the payload. A nameplate serial
       that pump 2 has never had is not mentioned, so pump 1's serial
       stays on the screen — and is collected onto pump 2 on the next
       save. A signed report then carries one machine's nameplate twice.
     • `rowsInPlace` assigns row for row and stops at the shorter array.
       Pump 1 tested 7-point, pump 2 tested 3-point: rows 4 to 7 of pump
       1's readings are still live, still on the screen, and are filed
       onto pump 2. This is not hypothetical — the test path is chosen
       per machine, so unequal row counts are the normal case.
     • `perKeyMerge` merges. An empty object clears nothing.

   So a switch is four steps, never one: file the outgoing pump, CLEAR
   the pump surface, REBUILD it to the shape the incoming pump needs, and
   only then apply that pump's values. Blanks come from the payload
   wherever an applier can express "empty" (see BLANKS below).

   ── AND CLEARING IS NOT ENOUGH ON ITS OWN ────────────────────────────
   This was found by the probe, after the first version of this file had
   been written and looked right. Some appliers fill a structure but
   cannot CREATE one: `rowsInPlace` writes into rows that already exist,
   and `perKeyMerge` writes into entries that already exist. Clear the
   table and then hand back a pump's seven saved rows, and all seven are
   silently discarded — the applier has nothing to write into. Switching
   away from a pump and back would return an EMPTY flow table with no
   error anywhere. That is worse than the carry it was meant to fix: a
   wrong number can be disputed, a missing one looks like a test nobody
   ran.

   So those keys need two things from the host, not one: `clear`, and
   `rebuild` — the host builds the table for the incoming pump's chosen
   test path, exactly as it does when a report is opened, and the engine
   then fills it. If either is missing, switchTo REFUSES rather than
   switching onto a dirty or hollow screen. That refusal is the gate: a
   pump-scope key added later with no surface declared stops the switch
   instead of losing a reading or moving one between machines, which
   nothing else in the stack would catch.

   ── NOTHING IS DROPPED ───────────────────────────────────────────────
   A key the scope model does not claim for this drive type is filed
   anyway and REPORTED. A project id the model has never heard of is
   parked by reportShape.js. Deleting data is the one operation with no
   failure mode to detect it afterwards.

   ── WHAT STAYS WITH THE ROOM ─────────────────────────────────────────
   A pump switch does not touch room values, contractors, signatures,
   sketches or the checklist. They did not change: it is the same room
   and the same visit. Only the machine changed.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var Scope = root.MPScope;
var Shape = root.MPShape;
if (!Scope || !Shape) throw new Error('pumpContext.js requires sectionScope.js and reportShape.js to load first');

/* ── how each applier expresses "this pump has none of this" ───────────
   auto  — the value below, handed to the engine's own applier, fully
           replaces whatever the last pump left behind.
   host  — the applier cannot express empty (it merges, or it is the
           host's own code). The host must supply a reset function.
   none  — nothing to clear: writeOnly is written for older builds and
           never read back onto the screen. */
var BLANKS = {
  fields:        { how: 'auto', blank: function (spec) {
                     var o = {}; (spec.ids || []).forEach(function (id) { o[id] = ''; }); return o; } },
  listReplace:   { how: 'auto', blank: function () { return []; } },
  objectReplace: { how: 'auto', blank: function () { return {}; } },
  listToSet:     { how: 'auto', blank: function () { return []; } },
  scalar:        { how: 'auto', blank: function (spec) { return spec && spec.skipFalsy ? undefined : ''; } },
  writeOnly:     { how: 'none' },
  rowsInPlace:   { how: 'host', creates: false,
                   why: 'assigns row for row and stops at the shorter array — a longer previous table keeps its tail' },
  perKeyMerge:   { how: 'host', creates: false,
                   why: 'merges into the entries already there; an empty object clears nothing' },
  objectMerge:   { how: 'host', creates: true,  why: 'merges; an empty object clears nothing' },
  mapOfLists:    { how: 'host', creates: true,  why: 'writes only the keys it is given' },
  custom:        { how: 'host', creates: true,  why: 'the host owns this surface, so the host owns clearing it' }
};
/* scalar with skipFalsy ignores a blank, so it cannot clear itself. */
function blankRule(spec) {
  var r = BLANKS[spec && spec.kind];
  if (!r) return null;
  if (spec.kind === 'scalar' && spec.skipFalsy) return { how: 'host', why: 'skipFalsy: a blank is ignored' };
  return r;
}

/* ── the manifest, narrowed to one machine ─────────────────────────── */

function projEntry(manifest) {
  var e = (manifest.keys || []).filter(function (k) { return k.key === 'proj'; })[0];
  if (!e) throw new Error('pumpContext: manifest declares no proj key');
  return e;
}

/* The project ids THIS tool declares that belong to a pump. An id the
   scope model has not heard of rides with the pump too, because that is
   where reportShape.js parks it — one answer, in one place, either way. */
function pumpProjIds(manifest) {
  var declared = projEntry(manifest).collect.ids || [];
  var room = {}; Scope.PROJ_ROOM.forEach(function (id) { room[id] = 1; });
  return declared.filter(function (id) { return !room[id]; });
}

/* Every manifest key the scope model calls a pump's, with proj rewritten
   to carry only that pump's ids. Room and split keys are absent, so no
   room surface can be read or written through this manifest at all. */
function pumpManifest(manifest) {
  var ids = pumpProjIds(manifest);
  var keys = [];
  (manifest.keys || []).forEach(function (e) {
    if (e.key === 'proj') {
      keys.push({
        key: 'proj',
        collect: { kind: 'fields', ids: ids },
        apply: Object.assign({}, e.apply, { kind: 'fields' })
      });
      return;
    }
    if (Scope.scopeOf(e.key) === 'pump') keys.push(e);
  });
  return { keys: keys, tool: (manifest.tool || '') + ':pump' };
}

/* ── can this surface be switched at all? ──────────────────────────── */

/* Answers, for one manifest: which pump keys the engine can blank on its
   own, and which need a reset from the host. Call it before offering a
   pump switch in the interface — not after the inspector has typed. */
function plan(manifest, surfaces) {
  var auto = [], needsClear = [], needsRebuild = [], missing = [], nothing = [];
  pumpManifest(manifest).keys.forEach(function (e) {
    if (!e.apply) { missing.push(e.key + ' (no apply rule)'); return; }
    var r = blankRule(e.apply);
    if (!r) { missing.push(e.key + ' (unknown applier ' + e.apply.kind + ')'); return; }
    if (r.how === 'none') { nothing.push(e.key); return; }
    if (r.how === 'auto') { auto.push(e.key); return; }
    needsClear.push(e.key);
    var s = surfaces && surfaces[e.key];
    if (!s || typeof s.clear !== 'function') missing.push(e.key + ' — no clear (' + r.why + ')');
    if (r.creates === false) {
      needsRebuild.push(e.key);
      if (!s || typeof s.rebuild !== 'function') {
        missing.push(e.key + ' — no rebuild (' + e.apply.kind
          + ' fills a structure it cannot create; without one this pump\u2019s saved values are discarded)');
      }
    }
  });
  return { ready: missing.length === 0, auto: auto, needsClear: needsClear,
           needsRebuild: needsRebuild, nothing: nothing, missing: missing };
}

/* ── reading one pump back onto the screen ─────────────────────────── */

/* The payload for a pump, with EVERY blankable key present — blank where
   this pump has no value. Present-and-empty is the whole point: a key
   the engine is not given is a key the last pump still owns. */
function flatFor(rep, pumpId, manifest) {
  var p = Shape.findPump(rep, pumpId);
  if (!p) throw new Error('flatFor: no pump ' + pumpId);
  var out = {};
  pumpManifest(manifest).keys.forEach(function (e) {
    if (!e.apply) return;
    var r = blankRule(e.apply);
    if (!r || r.how === 'none') return;
    if (e.key === 'proj') {
      var blank = r.blank(e.collect);                    /* every pump id, blank */
      var have = Shape.flatProjFor(rep, pumpId);
      Object.keys(blank).forEach(function (id) {
        out.proj = out.proj || {};
        out.proj[id] = (id in have) ? have[id] : '';
      });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(p.data, e.key)) { out[e.key] = p.data[e.key]; return; }
    if (r.how === 'auto') {
      var b = r.blank(e.apply);
      if (b !== undefined) out[e.key] = b;
    }
    /* host-reset keys with no value are cleared by the reset, not here */
  });
  return out;
}

/* ── filing what was on the screen back onto the pump ──────────────── */

/* `flat` is what the engine collected through the pump manifest, so it
   holds pump ids only. splitProj/applyFlatProj stay the only code that
   crosses the room/pump line. */
function fileInto(rep, pumpId, flat, manifest) {
  var p = Shape.findPump(rep, pumpId);
  if (!p) throw new Error('fileInto: no pump ' + pumpId);
  var report = { filed: [], absent: [], offType: [] };
  Shape.applyFlatProj(rep, pumpId, flat.proj || {});
  report.filed.push('proj');
  pumpManifest(manifest).keys.forEach(function (e) {
    if (e.key === 'proj') return;
    if (!Object.prototype.hasOwnProperty.call(flat, e.key)) { report.absent.push(e.key); return; }
    /* A key belonging to the other drive type is FILED and named, never
       discarded: a value that vanishes leaves nothing behind to notice. */
    if (!Scope.appliesTo(e.key, p.type)) report.offType.push(e.key);
    p.data[e.key] = flat[e.key];
    report.filed.push(e.key);
  });
  return report;
}

/* ── the switch ────────────────────────────────────────────────────── */

/* env is the host's reportState environment (doc, refs, get/set, custom,
   hooks) plus `surfaces`: { key: { clear(env), rebuild(env, value) } } for
   the keys plan() names. rebuild is required only where the applier fills
   a structure it cannot create.

   Order is deliberate. The outgoing pump is filed BEFORE anything on the
   screen changes, so a failure there costs nothing — the screen still
   shows the pump it was showing. */
function switchTo(rep, fromId, toId, env, manifest) {
  var RS = (env && env.ReportState) || root.ReportState;
  if (!RS) throw new Error('switchTo: the report state engine is not loaded');
  if (!Shape.findPump(rep, toId)) throw new Error('switchTo: no pump ' + toId);
  if (fromId && !Shape.findPump(rep, fromId)) throw new Error('switchTo: no pump ' + fromId);
  if (fromId === toId) return { switched: false, reason: 'already active' };

  var pl = plan(manifest, env.surfaces);
  if (!pl.ready) {
    /* Reached directly: a warning routed through a host object is missing
       exactly where nobody is looking. */
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[mp] pump switch REFUSED — ' + pl.missing.join('; '));
    }
    return { switched: false, reason: 'no-surface', missing: pl.missing };
  }

  var pm = pumpManifest(manifest);
  var filed = null;
  if (fromId) {
    var flat = RS.collect(pm, env);
    filed = fileInto(rep, fromId, flat, manifest);
  }

  /* Clear what the payload cannot blank, then let the host rebuild the
     surfaces that have to exist before values can land in them — the
     same thing it does when a report is opened from cold. */
  var incoming = flatFor(rep, toId, manifest);
  pl.needsClear.forEach(function (k) { env.surfaces[k].clear(env); });
  pl.needsRebuild.forEach(function (k) { env.surfaces[k].rebuild(env, incoming[k]); });

  var res = RS.apply(incoming, pm, env);
  rep._activePumpId = toId;
  return { switched: true, from: fromId || null, to: toId, filed: filed, applied: res };
}

function activePump(rep) { return rep && rep._activePumpId ? Shape.findPump(rep, rep._activePumpId) : null; }

var API = {
  BLANKS: BLANKS, blankRule: blankRule,
  pumpProjIds: pumpProjIds, pumpManifest: pumpManifest,
  plan: plan, flatFor: flatFor, fileInto: fileInto,
  switchTo: switchTo, activePump: activePump
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPContext = API;

})(typeof window !== 'undefined' ? window : globalThis);
