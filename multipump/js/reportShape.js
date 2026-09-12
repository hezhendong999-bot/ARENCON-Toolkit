/* ═══════════════════════════════════════════════════════════════════════
   REPORT SHAPE                              multipump/js/reportShape.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The shape a multi-pump report is saved in, and the one
   piece of machinery that decides which values belong to the room and
   which belong to a machine.

   THE SHAPE. A pump's block is EXACTLY today's report — the same keys the
   shipped tools already fill. That is deliberate: performance testing, the
   placard scan, the curve, the flow tables and the photos all keep working
   per pump without their logic being rewritten, because what they are
   handed looks like the report they already know.

     { schema:'mp1',
       room:   { proj:{…room ids}, contractors:[], sketchEntries:[], … },
       pumps:  [ { id, tag, type, duty, data:{ proj:{…pump ids}, stdData, … } } ],
       groups: [ { id, kind, members:[…] } ],
       combined:{ <groupId>: { combinedData, combinedCurvePoints, … } },
       deficiencies: [ { …, owner:{scope,id} } ] }

   THE DANGER THIS GUARDS. `proj` in the shipped tools is one flat object of
   86 ids on Diesel and 92 on Electric, and it spans both scopes: the
   project number sits beside the nameplate, the water supply beside the
   pump's cut-in pressure. Splitting it by hand, per save, is how a room
   value ends up stamped on one pump — or worse, how a pump value is
   written to the room and then read back onto EVERY pump. splitProj() and
   mergeProj() below are the only two functions allowed to cross that line,
   and tools/sim/mpshape.mjs holds them to it.

   NOTHING IS EVER DROPPED. An id the scope model has never heard of is not
   discarded; it is parked in `_unscoped` and reported. A field that
   silently disappears on save is the failure mode that costs a signed
   report, and it is invisible in every syntax check and byte-size guard.

   LEGACY READ. splitProj() also reads a report saved by a shipped tool:
   its flat proj becomes room values plus one pump's values, which is the
   migration path if the single-pump tools are ever retired.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var Scope = root.MPScope;
if (!Scope) throw new Error('reportShape.js requires sectionScope.js to load first');

var ROOM = {}, PUMP = {};
Scope.PROJ_ROOM.forEach(function (id) { ROOM[id] = 1; });
Scope.PROJ_PUMP.forEach(function (id) { PUMP[id] = 1; });

/* An id must not be claimed by both lists. The probe asserts this too, but
   a model edited later must not be able to reach the save path broken. */
(function () {
  var both = Object.keys(ROOM).filter(function (id) { return PUMP[id]; });
  if (both.length) throw new Error('sectionScope: id in BOTH scopes — ' + both.join(', '));
})();

function blank() {
  return { schema: 'mp1', room: { proj: {} }, pumps: [], groups: [], combined: {}, deficiencies: [] };
}

/* ── the only place the scope line is crossed ────────────────────────── */

/* flat -> { room, pump, unscoped }
   Every key present in `flat` lands in exactly one of the three. */
function splitProj(flat) {
  var out = { room: {}, pump: {}, unscoped: {} };
  Object.keys(flat || {}).forEach(function (id) {
    if (ROOM[id])      out.room[id] = flat[id];
    else if (PUMP[id]) out.pump[id] = flat[id];
    else               out.unscoped[id] = flat[id];   /* parked, never dropped */
  });
  return out;
}

/* room + one pump's values -> the flat object today's section code expects.
   `unscoped` is carried through so a value the model does not yet know
   about still round-trips instead of dying on the first save. */
function mergeProj(roomProj, pumpProj, unscoped) {
  var flat = {};
  [roomProj, pumpProj, unscoped].forEach(function (src) {
    if (!src) return;
    Object.keys(src).forEach(function (id) { flat[id] = src[id]; });
  });
  return flat;
}

/* ── pumps ───────────────────────────────────────────────────────────── */

function addPump(rep, pump) {
  /* Identity is fixed at creation and never derived from position, so
     removing one pump can never re-point another pump's readings. */
  if (!pump || !pump.id) throw new Error('addPump: a pump must arrive with its own id');
  if (findPump(rep, pump.id)) throw new Error('addPump: duplicate pump id ' + pump.id);
  rep.pumps.push({
    id: pump.id, tag: pump.tag || '', type: pump.type, duty: pump.duty || 'primary',
    data: pump.data || { proj: {} }
  });
  return rep;
}
function findPump(rep, id) {
  for (var i = 0; i < rep.pumps.length; i++) if (rep.pumps[i].id === id) return rep.pumps[i];
  return null;
}

/* Write a flat project object onto the report as THIS pump's.
   Room values inside it update the room once; pump values stay on the pump. */
function applyFlatProj(rep, pumpId, flat) {
  var p = findPump(rep, pumpId);
  if (!p) throw new Error('applyFlatProj: no pump ' + pumpId);
  var s = splitProj(flat);
  Object.keys(s.room).forEach(function (id) { rep.room.proj[id] = s.room[id]; });
  p.data.proj = s.pump;
  if (Object.keys(s.unscoped).length) {
    p.data._unscoped = s.unscoped;
    /* Reached directly, not via the host object: a warning that only fires
       when the host happens to expose a console is a warning that will be
       missing exactly where nobody is looking. */
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[mp] ' + Object.keys(s.unscoped).length
        + ' project field(s) not in the scope model, parked on pump ' + pumpId
        + ': ' + Object.keys(s.unscoped).join(', '));
    }
  }
  return rep;
}

/* Read this pump back out in the shape today's section code expects. */
function flatProjFor(rep, pumpId) {
  var p = findPump(rep, pumpId);
  if (!p) throw new Error('flatProjFor: no pump ' + pumpId);
  return mergeProj(rep.room.proj, p.data.proj, p.data._unscoped);
}

/* ── legacy ──────────────────────────────────────────────────────────── */

/* A report saved by a shipped single-pump tool becomes a one-pump
   multi-pump report. Its pump-scope keys ride onto that pump; its
   room-scope keys sit once. */
function fromLegacy(legacy, pump) {
  var rep = blank();
  var s = splitProj(legacy.proj || {});
  rep.room.proj = s.room;
  var data = { proj: s.pump };
  if (Object.keys(s.unscoped).length) data._unscoped = s.unscoped;
  Scope.KEY_SCOPE.forEach(function (k) {
    if (k.isNew || k.scope === 'split' || k.key === 'proj') return;
    if (!(k.key in legacy)) return;
    if (k.scope === 'room') rep.room[k.key] = legacy[k.key];
    else if (k.scope === 'pump') data[k.key] = legacy[k.key];
  });
  addPump(rep, { id: pump.id, tag: pump.tag, type: pump.type, duty: pump.duty, data: data });
  /* split keys are carried whole for now and divided by item later — never
     silently halved, because a half-read checklist looks complete. */
  ['clState', 'customItems', 'deficiencies'].forEach(function (k) {
    if (k in legacy) rep.room['_legacy_' + k] = legacy[k];
  });
  return rep;
}

var API = {
  blank: blank, splitProj: splitProj, mergeProj: mergeProj,
  addPump: addPump, findPump: findPump,
  applyFlatProj: applyFlatProj, flatProjFor: flatProjFor,
  fromLegacy: fromLegacy
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPShape = API;

})(typeof window !== 'undefined' ? window : globalThis);
