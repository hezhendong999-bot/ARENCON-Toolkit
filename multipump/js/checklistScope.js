/* ═══════════════════════════════════════════════════════════════════════
   CHECKLIST SCOPE                        multipump/js/checklistScope.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. Which checklist answers are the room's, answered once,
   and which belong to a particular machine and must be answered again
   for each one.

   ── WHY IT CANNOT BE LEFT WHOLE ─────────────────────────────────────
   A checklist is a record that somebody looked. Keep it whole on a
   two-pump job and one "Yes" covers two machines: the controller of the
   pump nobody tested reads as tested, on a page an AHJ takes at face
   value. Split it the other way and the inspector answers "suction
   piping free of obstruction" twice for one shared pipe, which is only
   an annoyance — but an annoyance that gets clicked through, and a
   clicked-through checklist is the same lie arrived at more slowly.

   ── THE DEFAULT, AND WHY IT LEANS THIS WAY ──────────────────────────
   Section 3 (controller), 4 (performance) and 5 (alarms and signalling)
   are per machine: each pump has its own controller, its own curve and
   its own signals. Sections 1 and 2 are mixed — a water supply is the
   room's, a pump's alignment is its own — and those are Owner rulings,
   not mine to make.

   Until they are ruled, an unruled item is treated as PER PUMP. That is
   deliberate and it is the safer error: asking twice about a shared pipe
   wastes a minute, while asking once about two separate machines prints
   an unverified pass on the one that was never looked at. Everything
   unruled is listed by needsRuling() so the question is visible rather
   than buried in a default.

   ── THE GATE ON ITEM IDENTITY ───────────────────────────────────────
   A checklist answer is filed under its item's POSITION in a section,
   not under anything stable. Insert an item into section 2 and every
   later answer in that section shifts onto the wrong question. The tool
   already carries a schema version for exactly this reason, so the scope
   table below records the version it was written against and check()
   refuses to be trusted against a different one. Without that, a schema
   bump would silently re-scope items — the shared pipe becoming per
   pump, or worse, a controller test becoming shared — with nothing on
   screen to show it had happened.

   ── ONE DEFINITION, MANY ANSWERS ────────────────────────────────────
   Custom items are DEFINED once for the report and ANSWERED per pump
   where the section is per-pump. They cannot be defined per pump: an
   item's id is its position, so a custom item on pump 1 and not on pump
   2 shifts every later id on one machine and not the other, and the two
   pumps' answers stop describing the same questions. That is a silent,
   unrecoverable misfiling of a signed record, which is why the
   definition list stays with the room.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* The checklist schema this table was written against. Read from the
   shipped Diesel tool (diesel-app/js/part06.js, schemaVer: 2) rather
   than assumed; the probe re-reads it from source on every run, so this
   number cannot quietly fall behind. A mismatch is a refusal, not a
   warning. */
var WRITTEN_FOR_SCHEMA = 2;

/* Per section. 'pump' = answered for each machine. 'room' = answered
   once. 'unruled' = Owner has not said yet, treated as 'pump'. */
var SECTION_SCOPE = {
  s1:    'unruled',   /* Pre-commissioning — mixed: supply is the room's, the set is the pump's */
  s2:    'unruled',   /* Visual inspection — mixed: suction piping shared, alignment per machine */
  s3:    'pump',      /* Controller tests — each pump has its own controller */
  s4:    'pump',      /* Performance test, constant speed */
  s4pld: 'pump',      /* Performance test, variable speed */
  s5m:   'pump',      /* The three mandatory signals — raised by each controller */
  s5:    'pump'       /* FA & signalling */
};

/* Exceptions inside a section, keyed 'section:index'. Owner rulings land
   here one at a time; nothing is assumed into it. */
var ITEM_SCOPE = {};

function scopeOfSection(sec) {
  var s = SECTION_SCOPE[sec];
  if (!s) return 'unruled';
  return s;
}

/* An id is the tool's own cid(section, index). */
function parseId(id) {
  var s = String(id || '');
  var m = s.match(/^([a-z0-9]+)[-_:]?(\d+)$/i);
  if (m) return { sec: m[1], idx: parseInt(m[2], 10) };
  return { sec: s, idx: null };
}

/* room | pump. Unruled resolves to pump — see the header. */
function scopeOfItem(id) {
  var p = parseId(id);
  var override = ITEM_SCOPE[p.sec + ':' + p.idx];
  if (override) return override;
  var s = scopeOfSection(p.sec);
  return (s === 'room') ? 'room' : 'pump';
}
function isRuled(id) {
  var p = parseId(id);
  if (ITEM_SCOPE[p.sec + ':' + p.idx]) return true;
  return scopeOfSection(p.sec) !== 'unruled';
}

/* Every section still waiting on a ruling, for the interface to show and
   for a handoff to carry. */
function needsRuling() {
  return Object.keys(SECTION_SCOPE).filter(function (s) { return SECTION_SCOPE[s] === 'unruled'; });
}

/* The gate. liveVer is the shipped engine's schema version. */
function check(liveVer) {
  if (liveVer === WRITTEN_FOR_SCHEMA) return { ok: true, schema: liveVer };
  return { ok: false, schema: liveVer, writtenFor: WRITTEN_FOR_SCHEMA,
           why: 'The checklist schema is now ' + liveVer + ' but the scope table was written for '
              + WRITTEN_FOR_SCHEMA + '. Item positions may have moved, so which answers are shared '
              + 'and which are per pump has to be re-read before a two-pump report can be trusted.' };
}

/* ── splitting and merging answers ─────────────────────────────────── */

/* The screen holds one checklist: the room's answers plus the active
   pump's. Filing puts each answer back where it belongs, with its edit
   stamp intact — the stamp is how two devices decide who wrote last, so
   dropping it in the split would quietly break sync. */
function fileInto(rep, pumpId, clState) {
  var pump = null;
  (rep.pumps || []).forEach(function (p) { if (p.id === pumpId) pump = p; });
  if (!pump) throw new Error('fileInto: no pump ' + pumpId);
  rep.room.clState = rep.room.clState || {};
  pump.data.clState = pump.data.clState || {};
  var moved = { room: 0, pump: 0 };
  Object.keys(clState || {}).forEach(function (id) {
    if (scopeOfItem(id) === 'room') { rep.room.clState[id] = clState[id]; moved.room++; }
    else { pump.data.clState[id] = clState[id]; moved.pump++; }
  });
  return moved;
}

/* The other direction: one checklist for this machine. Room answers
   first, then the pump's — a pump answer always wins its own id, so a
   mis-scoped answer left over from an earlier ruling cannot shadow the
   machine's real one. */
function flatFor(rep, pumpId) {
  var out = {};
  var room = (rep.room && rep.room.clState) || {};
  Object.keys(room).forEach(function (id) { if (scopeOfItem(id) === 'room') out[id] = room[id]; });
  (rep.pumps || []).forEach(function (p) {
    if (p.id !== pumpId) return;
    var mine = (p.data && p.data.clState) || {};
    Object.keys(mine).forEach(function (id) { out[id] = mine[id]; });
  });
  return out;
}

/* Answers filed on the wrong side by an earlier ruling. Reported, never
   silently rehomed: moving an answer is the same act as answering it,
   and only the Owner decides which questions are shared. */
function misfiled(rep) {
  var out = { roomHoldingPumpAnswers: [], pumpsHoldingRoomAnswers: [] };
  Object.keys((rep.room && rep.room.clState) || {}).forEach(function (id) {
    if (scopeOfItem(id) !== 'room') out.roomHoldingPumpAnswers.push(id);
  });
  (rep.pumps || []).forEach(function (p) {
    Object.keys((p.data && p.data.clState) || {}).forEach(function (id) {
      if (scopeOfItem(id) === 'room') out.pumpsHoldingRoomAnswers.push(p.id + '/' + id);
    });
  });
  return out;
}

/* Custom item DEFINITIONS stay with the room, always — see the header.
   This is the check that keeps it true. */
function customItemsAreShared(rep) {
  var offenders = [];
  (rep.pumps || []).forEach(function (p) {
    if (p.data && p.data.customItems && Object.keys(p.data.customItems).length) offenders.push(p.id);
  });
  return { ok: offenders.length === 0, offenders: offenders,
           why: offenders.length ? 'Custom item definitions were found on pump(s) ' + offenders.join(', ')
              + '. Item ids are positions, so a custom item on one pump and not another shifts every '
              + 'later answer on one machine only.' : '' };
}

var API = {
  WRITTEN_FOR_SCHEMA: WRITTEN_FOR_SCHEMA, SECTION_SCOPE: SECTION_SCOPE, ITEM_SCOPE: ITEM_SCOPE,
  scopeOfSection: scopeOfSection, scopeOfItem: scopeOfItem, isRuled: isRuled,
  needsRuling: needsRuling, check: check, parseId: parseId,
  fileInto: fileInto, flatFor: flatFor, misfiled: misfiled,
  customItemsAreShared: customItemsAreShared
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPChecklistScope = API;

})(typeof window !== 'undefined' ? window : globalThis);
