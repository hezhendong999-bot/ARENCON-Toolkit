/* ═══════════════════════════════════════════════════════════════════════
   PUMP SESSION                              multipump/js/pumpSession.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The single call the interface makes when the inspector
   moves from one machine to the next. Everything that belongs to a pump
   moves together, or nothing moves.

   ── WHY A LAYER ABOVE pumpContext ───────────────────────────────────
   pumpContext moves what the report manifest calls a pump's: the
   nameplate, the flow tables, the equipment answers, the battery block,
   the chart state. It deliberately does NOT touch the checklist, because
   the checklist is split item by item rather than whole — some answers
   are the room's and some are the machine's — and that division is
   checklistScope's to make.

   Leave those two as separate calls the interface has to remember to
   make in the right order, and eventually one of them is made without
   the other. The screen then shows pump 2's nameplate above pump 1's
   controller answers, and the inspector has no way to tell: both look
   like a normal half-filled report. So there is one call, and the
   partial state is unreachable rather than merely discouraged.

   ── THE ORDER, AND WHY IT IS THIS ORDER ─────────────────────────────
   Everything belonging to the OUTGOING pump is read and filed before
   anything on the screen changes. If any part of that fails, the switch
   stops with the screen still showing the machine it was showing, and
   nothing has been lost. Only once the outgoing pump is safely filed
   does the screen get cleared and refilled.

   A failure halfway through the second half would leave a mixed screen,
   so that half is ordered to finish with the checklist — the slowest and
   most visible surface — giving the repaint something to land on.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var Ctx = root.MPContext;
var CL = root.MPChecklistScope;
var Shape = root.MPShape;
if (!Ctx || !CL || !Shape) throw new Error('pumpSession.js requires pumpContext.js, checklistScope.js and reportShape.js first');

/* The checklist lives as one live object the screen is bound to, so it is
   emptied and refilled in place, never replaced — a reference to a
   replaced object is a reference to the one nothing writes to any more. */
function readChecklist(env) {
  var live = (env.refs && env.refs.clState) || {};
  var out = {};
  Object.keys(live).forEach(function (k) { out[k] = live[k]; });
  return out;
}
function writeChecklist(env, next) {
  var live = (env.refs && env.refs.clState) || null;
  if (!live) return;
  Object.keys(live).forEach(function (k) { delete live[k]; });
  Object.keys(next || {}).forEach(function (k) { live[k] = next[k]; });
}

/* Before a two-pump report can be trusted at all. */
function preflight(rep, env, manifest, opts) {
  opts = opts || {};
  var problems = [];

  var pl = Ctx.plan(manifest, env.surfaces);
  if (!pl.ready) problems.push({ what: 'pump surfaces', detail: pl.missing });

  if (opts.schemaVer !== undefined) {
    var sc = CL.check(opts.schemaVer);
    if (!sc.ok) problems.push({ what: 'checklist schema', detail: [sc.why] });
  }

  var cu = CL.customItemsAreShared(rep);
  if (!cu.ok) problems.push({ what: 'custom checklist items', detail: [cu.why] });

  var mis = CL.misfiled(rep);
  if (mis.roomHoldingPumpAnswers.length || mis.pumpsHoldingRoomAnswers.length) {
    /* Reported, not fatal: these are answers from before a ruling
       changed, and only the Owner decides where an answer belongs. */
    problems.push({ what: 'answers on the wrong side of a ruling', advisory: true,
                    detail: mis.roomHoldingPumpAnswers.concat(mis.pumpsHoldingRoomAnswers) });
  }

  var blocking = problems.filter(function (p) { return !p.advisory; });
  return { ok: blocking.length === 0, problems: problems, awaitingRuling: CL.needsRuling() };
}

/* The switch. Returns what happened; throws nothing at the caller for a
   refusal, because a refusal is an ordinary outcome the interface has to
   show, not an error to swallow. */
function switchPump(rep, fromId, toId, env, manifest, opts) {
  opts = opts || {};
  if (!Shape.findPump(rep, toId)) return { switched: false, reason: 'no-such-pump', pump: toId };
  if (fromId === toId) return { switched: false, reason: 'already-active' };

  var pre = preflight(rep, env, manifest, opts);
  if (!pre.ok) return { switched: false, reason: 'preflight', problems: pre.problems };

  /* ── everything outgoing, filed before the screen moves ── */
  var checklistMoved = null;
  if (fromId) {
    if (!Shape.findPump(rep, fromId)) return { switched: false, reason: 'no-such-pump', pump: fromId };
    checklistMoved = CL.fileInto(rep, fromId, readChecklist(env));
  }

  /* pumpContext files the rest of the outgoing pump itself, then clears
     and refills the manifest-owned surfaces. */
  var res = Ctx.switchTo(rep, fromId, toId, env, manifest);
  if (!res.switched) {
    /* Nothing on screen has changed yet, but the outgoing checklist has
       already been filed — which is safe: filing is the same answer in
       its proper place, and the screen still holds it too. */
    return res;
  }

  /* ── incoming ── */
  writeChecklist(env, CL.flatFor(rep, toId));
  if (typeof opts.repaintChecklist === 'function') opts.repaintChecklist(env);

  return { switched: true, from: fromId || null, to: toId,
           checklist: checklistMoved, pumpKeys: res.filed,
           awaitingRuling: pre.awaitingRuling };
}

/* Opening a report. The screen is usually NOT blank at this point: a
   saved report has just been loaded into it, and on a report written by
   the single-pump tool that loaded checklist and project block belong to
   the one machine in it. Loading a pump over the top would throw them
   away — silently, because a discarded answer looks exactly like a
   question nobody reached.

   So opening either adopts what is on screen for this pump, or refuses
   and says the screen is not empty. It never quietly drops it. */
function openPump(rep, pumpId, env, manifest, opts) {
  opts = opts || {};
  if (opts.adopt) {
    var ad = adoptScreen(rep, pumpId, env, manifest);
    if (!ad.ok) return { switched: false, reason: 'adopt-failed', detail: ad };
  } else if (screenHasContent(env, manifest)) {
    return { switched: false, reason: 'screen-not-empty',
             why: 'There are answers and values on screen already. Say whether they belong to '
                + pumpId + ' (adopt) — they must not be dropped on the way in.' };
  }
  return switchPump(rep, null, pumpId, env, manifest, opts);
}

/* Is there anything on screen that would be lost? */
function screenHasContent(env, manifest) {
  if (Object.keys(readChecklist(env)).length) return true;
  var ids = Ctx.pumpProjIds(manifest);
  for (var i = 0; i < ids.length; i++) {
    var el = env.doc && env.doc.getElementById(ids[i]);
    if (el && String(el.value || '').trim()) return true;
  }
  return false;
}

/* File everything currently on screen onto this pump and the room. The
   project block goes through reportShape's own split, so the room/pump
   line is drawn in one place here as everywhere else. */
function adoptScreen(rep, pumpId, env, manifest) {
  if (!Shape.findPump(rep, pumpId)) return { ok: false, why: 'no pump ' + pumpId };
  var RS = (env && env.ReportState) || root.ReportState;
  if (!RS) return { ok: false, why: 'the report state engine is not loaded' };

  /* the WHOLE project block, room ids included — applyFlatProj decides
     which side each id belongs on */
  var projEntry = (manifest.keys || []).filter(function (k) { return k.key === 'proj'; })[0];
  var wholeProj = RS.collect({ keys: [projEntry] }, env);
  Shape.applyFlatProj(rep, pumpId, wholeProj.proj || {});

  var flat = RS.collect(Ctx.pumpManifest(manifest), env);
  var filed = Ctx.fileInto(rep, pumpId, flat, manifest);
  var cl = CL.fileInto(rep, pumpId, readChecklist(env));
  return { ok: true, pump: pumpId, pumpKeys: filed.filed, checklist: cl };
}

/* Closing a report or saving: file the active pump without moving away
   from it, so a save never depends on a switch having happened. */
function fileActive(rep, env, manifest) {
  var id = rep._activePumpId;
  if (!id || !Shape.findPump(rep, id)) return { filed: false, reason: 'no-active-pump' };
  var cl = CL.fileInto(rep, id, readChecklist(env));
  var RS = (env && env.ReportState) || root.ReportState;
  var flat = RS.collect(Ctx.pumpManifest(manifest), env);
  var pumpFiled = Ctx.fileInto(rep, id, flat, manifest);
  return { filed: true, pump: id, checklist: cl, pumpKeys: pumpFiled.filed };
}

var API = { preflight: preflight, switchPump: switchPump, openPump: openPump,
            adoptScreen: adoptScreen, screenHasContent: screenHasContent,
            fileActive: fileActive, readChecklist: readChecklist, writeChecklist: writeChecklist };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPPumpSession = API;

})(typeof window !== 'undefined' ? window : globalThis);
