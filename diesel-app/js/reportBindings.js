/* ══════════════════════════════════════════════════════════════════════════
   DIESEL — REPORT STATE BINDINGS          diesel-app/js/reportBindings.js
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PHASE 2, Part A (second half). STILL NOT WIRED INTO THE TOOL.
   Nothing in this file is called by anything the app runs. It exists so that
   Part B — the moment the live save and load paths switch over — is a change
   of WHICH function is called, not a rewrite of what those functions do.

   WHY IT IS A SEPARATE FILE. Two reasons, both about safety.
   First, adding a file changes no existing one: the live collect and load
   paths read back from GitHub byte-identical after this push, so no tablet
   is asked to do anything.
   Second, the shared engine cannot reach Diesel's report state on its own.
   Almost all of it is declared with `const` and `let` at the top level of a
   classic script, which means it is NOT on `window` and no generic module can
   find it. Classic scripts do share one global lexical scope, so this file can
   name those values directly — and having to name them, here, in one list, is
   the point. The engine touches exactly what this file hands it and nothing
   else.

   ── WHAT THIS FILE IS AND IS NOT ──────────────────────────────────────────
   It is the Diesel half of the contract in lib/data/reportState.js: the
   accessors for state the host reassigns, the live references for state the
   host mutates, the tool's own id format, and the handful of steps that are
   genuinely Diesel's own (the pump-type buttons, pitot rows, custom equipment,
   signature strokes, appendix decisions, the checklist migration).

   It is deliberately a SECOND implementation for now — the live collectState
   and _applyLoadedState are untouched and still the only ones running. That
   duplication is temporary and is the whole method: the probe
   (tools/sim/reportstate.mjs) runs both and requires byte-identical results,
   which is what makes the switch in Part B a provable no-op rather than a
   hopeful one. PART B DELETES THE ORIGINALS. A shared engine the host still
   duplicates has unified nothing, and if this file is still sitting beside an
   untouched collectState a month from now, the extraction failed.

   ── WHAT STAYS OUT ────────────────────────────────────────────────────────
   No saving. No network. No re-rendering. The live load path braids putting
   values back together with repainting twenty surfaces; only the first half is
   shared, and the repaint list stays where it is, in the host, called after
   the engine returns.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* Diesel's id format. The engine asks for a name; the convention is the
   host's, and it is the same shape the tool has minted since S540. */
function _dslMintId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

function dieselStateEnv(opts) {
  opts = opts || {};
  return {
    doc: document,
    mintId: _dslMintId,

    /* Live references. The engine mutates these in place, never replaces them,
       because the tool holds these same references on every screen. */
    refs: {
      stdData: stdData, pldData: pldData,
      pumpCurvePoints: pumpCurvePoints, pldPumpCurvePoints: pldPumpCurvePoints,
      clState: clState, customItems: customItems,
      contractors: contractors, deficiencies: deficiencies,
      generalDeficiencies: generalDeficiencies,
      contractorSignRows: contractorSignRows, witnessSignRows: witnessSignRows,
      flowTestPhotos: flowTestPhotos, flowTestPhotosPld: flowTestPhotosPld,
      recordPhotos: recordPhotos, sketchEntries: sketchEntries,
      deletedItems: deletedItems, distribution: distribution,
      smState: smState, smCapVis: smCapVis, annDsForce: annDsForce
    },

    /* Anything the host REASSIGNS goes through here. A reference to a value
       that gets replaced is a reference to the old value — that is not a
       style preference, it is how a screen ends up bound to an object nothing
       writes to any more. */
    get: function (name) {
      switch (name) {
        case 'npshPsi':          return (typeof npshPsi !== 'undefined') ? npshPsi : '';
        case 'npshPsiPld':       return (typeof npshPsiPld !== 'undefined') ? npshPsiPld : '';
        case 'formRevision':     return formRevision;
        case 'formDateModified': return formDateModified;
        case 'contractorTrades': return contractorTrades;
        /* NOT a live reference: applyAppendixState REPLACES this Set rather
           than clearing it, and a reference captured before the replacement
           points at the discarded one. This file's own rule, caught by the
           round-trip probe rather than by reading it. */
        case 'appendixExcl':     return (typeof _appendixExcl !== 'undefined') ? _appendixExcl : new Set();
      }
      return undefined;
    },
    set: function (name, v) {
      switch (name) {
        case 'npshPsi':          npshPsi = v; return;
        case 'npshPsiPld':       npshPsiPld = v; return;
        case 'formRevision':     formRevision = v; return;
        case 'formDateModified': formDateModified = v; return;
        case 'contractorTrades': contractorTrades = v; return;
      }
    },

    /* Hub-launched reports lock project identity to the URL params; a saved
       blob can carry another project's stale values and must never win (S264). */
    opts: {
      hubLockedIds: (typeof _csHubMode !== 'undefined' && _csHubMode)
        ? { 'pi-projno': 1, 'pi-projname': 1, 'pi-client': 1, 'pi-addr': 1 } : {}
    },

    hooks: {
      assignRowPreservePhotos: function (live, incoming) {
        if (typeof _assignRowPreservePhotos === 'function') _assignRowPreservePhotos(live, incoming);
        else Object.assign(live, incoming);
      }
    },

    custom: {
      /* ── the pump-type choice ──────────────────────────────────────────
         Omitted entirely when no button is lit. A default nobody chose must
         never leave the device: if the boot restore fails to relight the
         buttons, a collect that fell back to 'std' would mint it as a fresh
         edit and beat the real choice on every device (S622i). */
      collectTestType: function (env) {
        var t;
        env.doc.querySelectorAll('.pump-type-btns button').forEach(function (b) {
          if (b.classList.contains('on')) t = b.dataset.ptype;
        });
        return t;
      },
      collectTtChosen: function (env) {
        var t;
        env.doc.querySelectorAll('.pump-type-btns button').forEach(function (b) {
          if (b.classList.contains('on')) t = b.dataset.ptype;
        });
        if (t === undefined) return undefined;          // unset ships as absent, not as a claim
        return (typeof _ttChosen !== 'undefined') ? !!_ttChosen : true;
      },
      applyTestType: function (v, env) {
        if (!v) return;
        /* S622c — restore UNCONDITIONALLY. This used to run only if a radio
           named "pump-test-type" existed, and that control has been extinct
           since the S582 button merge, so the stored choice was never put back
           on screen and the next autosave collected the default and pushed it. */
        var r = env.doc.querySelector('input[name="pump-test-type"][value="' + v + '"]');
        if (r) r.checked = true;
        if (typeof setPumpTestType === 'function') setPumpTestType(v);
        try {
          _ttChosen = true;
          if (typeof _ttApplyGate === 'function') _ttApplyGate();
        } catch (_e) {}
      },
      applyNoop: function () {},

      /* ── equipment answers by identity ────────────────────────────────── */
      applyEquipState:   function (v, env) { _applyEquipGroup(v, env, 'equip3a'); },
      applyEquipState4b: function (v, env) { _applyEquipGroup(v, env, 'equip4b'); },

      /* ── pitot rows: readings that live only in the DOM (S321/S540) ───── */
      collectPitotRows: function (env) {
        var out = {};
        ['3a', '4b'].forEach(function (tab) {
          var rows = [];
          var total = (typeof pitotCounts !== 'undefined' && pitotCounts[tab]) || 0;
          for (var n = 1; n <= total; n++) {
            var pp = env.doc.getElementById('pp-' + tab + '-' + n);
            var pf = env.doc.getElementById('pf-' + tab + '-' + n);
            var po = env.doc.getElementById('po-' + tab + '-' + n);
            if (!pp && !pf && !po) continue;            // removed row
            var pr = env.doc.getElementById('pr-' + tab + '-' + n);
            var pid = pr ? pr.getAttribute('data-pid') : null;
            if (!pid) { pid = _dslMintId('pt'); if (pr) pr.setAttribute('data-pid', pid); }
            rows.push({ id: pid, p: pp ? pp.value : '', f: pf ? pf.value : '', o: po ? po.value : '1' });
          }
          out[tab] = rows;
        });
        return out;
      },
      applyPitotRows: function (v, env) {
        /* Rebuilt through the tool's OWN row builder, exactly as the live
           restore does: clear the container, reset the count, then add each
           saved row back by its permanent name. Writing into whatever rows
           happen to be on screen is not equivalent — a saved report can carry
           more rows than this device is showing (someone added two on another
           tablet), and the extras vanish in silence. */
        Object.keys(v || {}).forEach(function (tab) {
          var rows = v[tab] || [];
          var c = env.doc.getElementById('pitot-' + tab);
          if (c) c.innerHTML = '';
          if (typeof pitotCounts !== 'undefined') pitotCounts[tab] = 0;
          rows.forEach(function (r) {
            if (typeof addPitotRow !== 'function') return;
            addPitotRow(tab, r.id);                       // S540 — carries the row's name
            var n = pitotCounts[tab];
            var pp = env.doc.getElementById('pp-' + tab + '-' + n);
            var pf = env.doc.getElementById('pf-' + tab + '-' + n);
            var po = env.doc.getElementById('po-' + tab + '-' + n);
            if (pp) pp.value = r.p || '';
            if (pf) pf.value = r.f || '';
            if (po) po.value = r.o || '1';
          });
          if (rows.length && typeof calcPitotTotal === 'function') { try { calcPitotTotal(tab); } catch (_e) {} }
        });
      },

      /* ── custom equipment: the TEXT, not just the tick (S321) ─────────── */
      collectCustomEquip: function (env) {
        var out = {};
        ['3a', '4b'].forEach(function (tab) {
          var arr = [];
          env.doc.querySelectorAll('#equip-custom-' + tab + ' label').forEach(function (w) {
            var cb = w.querySelector('input[type=checkbox]'), tx = w.querySelector('input[type=text]');
            var cid = w.getAttribute('data-cid');
            if (!cid) { cid = _dslMintId('ce'); w.setAttribute('data-cid', cid); }
            arr.push({ id: cid, t: tx ? tx.value : '', c: cb ? cb.checked : true });
          });
          out[tab] = arr;
        });
        return out;
      },
      applyCustomEquip: function (v, env) {
        Object.keys(v || {}).forEach(function (tab) {
          var host = env.doc.getElementById('equip-custom-' + tab);
          if (!host) return;
          var labels = host.querySelectorAll('label');
          (v[tab] || []).forEach(function (row, i) {
            var w = labels[i];
            if (!w) return;
            if (row.id) w.setAttribute('data-cid', row.id);
            var cb = w.querySelector('input[type=checkbox]'), tx = w.querySelector('input[type=text]');
            if (cb) cb.checked = !!row.c;
            if (tx) tx.value = row.t;
          });
        });
      },

      /* ── checklist state: migration then timestamp strip ──────────────── */
      applyClState: function (v, env, spec) {
        /* The migration must run against the version the REPORT was saved
           with, not against today's. Passing a default here would migrate an
           old checklist as though it were current — the answers would land in
           the wrong shape and look like unanswered items. */
        var savedVer = (env && env._state && env._state.clSchemaVer !== undefined)
          ? env._state.clSchemaVer : ((spec && spec.schemaVer) || 2);
        var migrated = (typeof _migrateClState === 'function')
          ? _migrateClState(v, savedVer) : v;
        Object.assign(clState, migrated);
        Object.keys(clState).forEach(function (k) { if (clState[k]) delete clState[k].timestamp; });
      },

      /* ── signature strokes ────────────────────────────────────────────────
         Wrapped {s:[...]} per canvas so the engine's per-key stamp survives
         JSON; a bare array drops attached properties on serialise (S605). */
      collectSigStrokes: function () {
        var o = {};
        if (typeof _sigStrokes === 'undefined') return o;
        Object.keys(_sigStrokes).forEach(function (k) {
          o[k] = { s: JSON.parse(JSON.stringify(_sigStrokes[k] || [])) };
        });
        return o;
      },
      applySigStrokes: function (v) {
        if (typeof _sigStrokes === 'undefined') return;
        Object.keys(_sigStrokes).forEach(function (k) { delete _sigStrokes[k]; });
        Object.keys(v || {}).forEach(function (k) {
          var x = v[k];
          _sigStrokes[k] = (x && !Array.isArray(x) && Array.isArray(x.s)) ? x.s : x;   // legacy bare arrays pass through
        });
      },

      /* ── battery readings ─────────────────────────────────────────────── */
      collectBatData: function () { return { b1: batData.b1.slice(), b2: batData.b2.slice() }; },
      applyBatData:   function (v) {
        if (!v) return;
        if (v.b1) batData.b1 = v.b1.map(Number);
        if (v.b2) batData.b2 = v.b2.map(Number);
      },

      /* ── photo arrays: shaped on the way out by the tool's own rule ───── */
      collectFlowTestPhotos:    function () { return flowTestPhotos.map(function (p) { return _photoOut(p, { tag: p.tag || '' }); }); },
      collectFlowTestPhotosPld: function () { return flowTestPhotosPld.map(function (p) { return _photoOut(p, { tag: p.tag || '' }); }); },
      collectRecordPhotos:      function () { return recordPhotos.map(function (p) { return _photoOut(p, { kind: p.kind, date: p.date || '' }); }); },
      collectSketchEntries:     function () { return sketchEntries.map(function (e) { return { id: e.id || '', comment: e.comment, markupImg: e.markupImg || null }; }); },

      /* ── contractor trades: reassigned, so it goes through set() ──────── */
      applyContractorTrades: function (v, env) { env.set('contractorTrades', JSON.parse(JSON.stringify(v))); },

      /* ── appendix decisions ───────────────────────────────────────────────
         Putting a photo BACK is a decision, not an absence. Only recording
         "excluded" made exclusion one-way between two devices: a restore
         carried no evidence to beat the other device's exclusion (S616c).
         The legacy one-way list is read only when the newer map is absent. */
      collectAppendixState: function () {
        var out = {};
        try {
          if (typeof _appendixExcl !== 'undefined') _appendixExcl.forEach(function (k) { out[k] = { status: 'out' }; });
          if (typeof _appendixIncl !== 'undefined') _appendixIncl.forEach(function (k) { if (!out[k]) out[k] = { status: 'in' }; });
        } catch (_) {}
        return out;
      },
      applyAppendixState: function (v) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return;
        if (typeof _appendixExcl === 'undefined') return;
        _appendixExcl = new Set();
        if (typeof _appendixIncl !== 'undefined') _appendixIncl = new Set();
        Object.keys(v).forEach(function (k) {
          var e = v[k];
          if (!e) return;
          if (e.status === 'out') _appendixExcl.add(k);
          else if (e.status === 'in' && typeof _appendixIncl !== 'undefined') _appendixIncl.add(k);
        });
      },
      applyAppendixLegacy: function (v, env, spec) {
        /* Only when the per-photo map is absent — an older report opens
           exactly as it always has. */
        if (!Array.isArray(v)) return;
        if (env && env._appendixStatePresent) return;
        if (typeof _appendixExcl !== 'undefined') _appendixExcl = new Set(v);
      }
    }
  };

  function _applyEquipGroup(v, env, name) {
    if (!v) return;
    var list = env.doc.querySelectorAll('input[name="' + name + '"]');
    Array.prototype.forEach.call(list, function (cb, i) {
      var k = cb.value || ('pos' + i);
      if (v[k]) cb.checked = (v[k].status === 'yes');
    });
  }
}

/* Not called by anything yet. Part B replaces the bodies of collectState and
   the data half of _applyLoadedState with calls to these two. */
function dieselCollectViaManifest() {
  return root.ReportState.collect(root.DieselReportManifest, dieselStateEnv());
}
function dieselApplyViaManifest(state) {
  var env = dieselStateEnv();
  /* Custom appliers sometimes need a second key from the same payload — the
     checklist migration needs the schema version the report was saved with,
     and the legacy appendix list must lose to the per-photo map when both are
     present. The engine hands each applier its own value; the payload itself
     is put here so a rule can look sideways without the engine having to know
     which rules do. */
  env._state = state || {};
  env._appendixStatePresent = !!(state && state.appendixState &&
                                 typeof state.appendixState === 'object' &&
                                 !Array.isArray(state.appendixState));
  return root.ReportState.apply(state, root.DieselReportManifest, env);
}

if (root) {
  root.dieselStateEnv = dieselStateEnv;
  root.dieselCollectViaManifest = dieselCollectViaManifest;
  root.dieselApplyViaManifest = dieselApplyViaManifest;
}
})(typeof window !== 'undefined' ? window : this);
