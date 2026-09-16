/* ═══════════════════════════════════════════════════════════════════════
   DIESEL PUMP SURFACES                   multipump/js/dieselSurfaces.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. pumpContext.js asks the host for two things per surface:
   clear it, and rebuild it so the incoming pump's values have somewhere
   to land. This file answers for the Diesel screen — the performance
   tables, the placard and nameplate fields, the equipment lists, the
   pitot readings, the battery block and the chart state.

   IT ADDS NO SECOND ENGINE. The environment is the tool's own
   dieselStateEnv() from diesel-app/js/reportBindings.js; this file
   attaches `surfaces` to it and nothing else. Collecting and applying
   stay with lib/data/reportState.js, driven by the same manifest the
   shipped tool runs on.

   ── THE CORRECTION THAT SHAPED THIS FILE ─────────────────────────────
   The pump switch was designed against the general behaviour of the
   appliers. Read against the actual Diesel tool, one assumption was
   wrong and worth writing down rather than quietly fixing:

   The flow tables are NOT variable-length. `stdData` is always the three
   template rows (churn, rated, overload) and `pldData` always the seven,
   built once at boot and then only ever written to by index. Choosing
   3-point or 7-point picks which table is SHOWN, not which exists. So
   pump 1 cannot leave surplus rows behind on pump 2 — there are no
   surplus rows.

   What CAN cross is inside each row, and it is worse than a surplus row
   because it looks completely normal: the suction and discharge
   readings, the RPM, the cutsheet and placard values, and the GAUGE
   PHOTOS attached to that row. The tool deliberately preserves row
   photos through an apply (the cloud strips the bytes, so the live row
   keeps them). That rule is correct within one report and wrong across
   two machines: it would hand pump 1's gauge photographs to pump 2's
   rated-flow row, and the report would print them as pump 2's evidence.

   ── HOW A SURFACE IS CLEARED — SNAPSHOT, NEVER A TYPED LIST ──────────
   Clearing is done by restoring the structure the tool built for itself
   at boot, captured before any report is opened. Not by listing which
   fields to blank: a hand-written field list is exactly the thing that
   silently falls behind when a column is added, and the failure it
   produces is a value from another machine sitting in the new column
   with nothing to flag it.

   captureBlank() must therefore run at boot, BEFORE a report is applied.
   build() refuses without it, because a snapshot taken late is not a
   blank report — it is somebody's readings, and every future "clear"
   would restore them.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

function clone(v) { return JSON.parse(JSON.stringify(v)); }

/* Restore an array in place: same array object the screen is bound to,
   contents replaced by the pristine ones. */
function restoreArray(live, blank) {
  if (!Array.isArray(live)) return;
  live.length = 0;
  clone(blank).forEach(function (r) { live.push(r); });
}
/* Restore an object in place, keys and all. */
function restoreObject(live, blank) {
  if (!live) return;
  Object.keys(live).forEach(function (k) { delete live[k]; });
  var b = clone(blank);
  Object.keys(b).forEach(function (k) { live[k] = b[k]; });
}

var _blank = null;

/* ── the boot snapshot ─────────────────────────────────────────────── */

/* Call once, at boot, before any saved report is applied. */
function captureBlank(env) {
  var r = env.refs || {};
  _blank = {
    stdData: clone(r.stdData || []),
    pldData: clone(r.pldData || []),
    smState: clone(r.smState || {}),
    smCapVis: clone(r.smCapVis || {}),
    annDsForce: clone(r.annDsForce || {}),
    batData: (typeof env.custom.collectBatData === 'function') ? clone(env.custom.collectBatData(env)) : null
  };
  return _blank;
}
function blankSnapshot() { return _blank; }

/* ── what this file needs the host to have ─────────────────────────── */

/* Named so the probe can prove every call has a real door behind it.
   A renderer that quietly does not exist means a cleared table that is
   still on the screen — the worst of both states. */
var HOST_FNS = ['renderStdTable', 'renderPldTable', 'updateChart3pt', 'updatePldChart'];

function missing(env) {
  var out = [];
  HOST_FNS.forEach(function (fn) { if (typeof root[fn] !== 'function') out.push('function ' + fn); });
  if (!env || !env.refs) out.push('dieselStateEnv() refs');
  if (!_blank) out.push('captureBlank() — no boot snapshot, so "clear" has nothing pristine to restore');
  return out;
}

function repaint(env) {
  HOST_FNS.forEach(function (fn) { try { if (typeof root[fn] === 'function') root[fn](); } catch (e) {} });
}

/* ── the twelve surfaces ───────────────────────────────────────────── */

function build(env) {
  var gaps = missing(env);
  if (gaps.length) throw new Error('dieselSurfaces: cannot build — ' + gaps.join('; '));
  var r = env.refs, doc = env.doc;

  /* The row set is fixed by the tool's own template, so rebuild's job is
     to make sure it still IS that set before values are written into it.
     A report from another build with a different row count would
     otherwise have its readings dropped one by one, silently. */
  function rowSurface(key) {
    return {
      clear: function () { restoreArray(r[key], _blank[key]); },
      rebuild: function (e, value) {
        if (!Array.isArray(r[key])) return;
        if (r[key].length !== _blank[key].length) restoreArray(r[key], _blank[key]);
        var extra = (value || []).length - r[key].length;
        if (extra > 0) {
          /* More readings than this build has rows. Do not discard them:
             grow from the last template row so every one lands, and say
             so — a dropped reading leaves nothing behind to notice. */
          for (var i = 0; i < extra; i++) r[key].push(clone(_blank[key][_blank[key].length - 1] || {}));
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[mp] ' + key + ': report carries ' + (value || []).length
              + ' rows, this build templates ' + _blank[key].length + ' — grew to fit rather than drop readings');
          }
        }
        repaint(env);
      }
    };
  }

  /* Chart state merges into the entries already present, so the entries
     have to be there before the merge. */
  function chartSurface(key) {
    return {
      clear: function () { restoreObject(r[key], _blank[key]); },
      rebuild: function (e, value) {
        if (!r[key]) return;
        Object.keys(value || {}).forEach(function (k) { if (!r[key][k]) r[key][k] = {}; });
      }
    };
  }

  /* A checkbox group: the host's applier only ticks what it is given, so
     clearing is unticking, which only the screen can do. */
  function checkboxSurface(name) {
    return { clear: function () {
      var list = doc.querySelectorAll('input[name="' + name + '"]');
      Array.prototype.forEach.call(list, function (cb) { cb.checked = false; });
    } };
  }

  /* Free-typed rows that live only in the DOM. */
  function inputsSurface(sel) {
    return { clear: function () {
      Array.prototype.forEach.call(doc.querySelectorAll(sel), function (el) {
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = false; else el.value = '';
      });
    } };
  }

  return {
    stdData: rowSurface('stdData'),
    pldData: rowSurface('pldData'),
    smState: chartSurface('smState'),
    smCapVis: chartSurface('smCapVis'),
    annDsForce: chartSurface('annDsForce'),

    /* Battery readings are a fixed pair of arrays; zero is this tool's
       own unentered value, which is why the snapshot supplies it rather
       than a literal here. */
    batData: { clear: function () {
      if (_blank.batData && typeof env.custom.applyBatData === 'function') env.custom.applyBatData(clone(_blank.batData), env);
    } },

    /* The test path is a per-machine choice. Unlighting both buttons is
       deliberate: the incoming pump's own choice is applied straight
       after, and if it has none, no button lit is the truthful state —
       a default nobody chose must never be collected as a decision. */
    testType: { clear: function () {
      Array.prototype.forEach.call(doc.querySelectorAll('.pump-type-btns button'), function (b) { b.classList.remove('on'); });
    } },
    ttChosen: { clear: function () { try { if (typeof root._ttChosen !== 'undefined') root._ttChosen = false; } catch (e) {} } },

    equipState:   checkboxSurface('equip3a'),
    equipState4b: checkboxSurface('equip4b'),
    pitotRows:    inputsSurface('[id^="pp-3a-"],[id^="pf-3a-"],[id^="po-3a-"],[id^="pp-4b-"],[id^="pf-4b-"],[id^="po-4b-"]'),
    customEquip:  inputsSurface('#equip-custom-3a input, #equip-custom-4b input')
  };
}

/* The env the multi-pump host runs on: the tool's own, plus surfaces. */
function envWithSurfaces(baseEnv) {
  baseEnv.surfaces = build(baseEnv);
  return baseEnv;
}

var API = { captureBlank: captureBlank, blankSnapshot: blankSnapshot,
            missing: missing, build: build, envWithSurfaces: envWithSurfaces,
            HOST_FNS: HOST_FNS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPDieselSurfaces = API;

})(typeof window !== 'undefined' ? window : globalThis);
