/* ═══════════════════════════════════════════════════════════════════════
   MULTI-PUMP STORE                              multipump/js/store.js
   ───────────────────────────────────────────────────────────────────────
   Where a multi-pump report lives. Built on the toolkit's own factories —
   createIDB for the device, createSync for the cloud — so this tool gets
   the same merge, the same array-shrinkage guards and the same outbox as
   every other tool, rather than a second storage system that will drift.

   ── WHY A SEPARATE DATABASE NAME ─────────────────────────────────────
   ARENCON_MULTIPUMP, not the Diesel or Electric database. A multi-pump
   report is a different document shape, and a half-built tool sharing a
   live tool's store is how a field report gets rewritten by code nobody
   was testing that day. Separate name means this tool cannot reach a
   report the single-pump tools own, however wrong it gets.

   ── WHAT THE MODEL ADAPTER IS FOR ────────────────────────────────────
   createSync needs three things: hand it the document, take a document
   back, and apply a merged one. Everything about WHICH answers belong to
   WHICH machine stays in roomReview.js — this file moves documents, it
   does not interpret them. The one rule it does enforce is the one that
   cannot be enforced anywhere else: an answer key names its machine, and
   a merge that produced a machine answer belonging to no machine in the
   report is refused rather than written.

   ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────
   No photo binaries yet. Photos are the part of this toolkit that has
   cost the most when it went wrong, and they arrive with the testing
   phase, on the shared photo modules, with the Owner at a tablet.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
import { createIDB } from '../../lib/data/idb.js';

export var DB_NAME = 'ARENCON_MULTIPUMP';
export var TOOL_KEY = 'multipump';

/* One document per project. `answers` is keyed exactly as roomReview
   keys them: rowId for a shared answer, rowId@pumpId for a machine one. */
export function blankReport(projectId) {
  return {
    v: 1,
    projectId: projectId || null,
    pumps: [],                 /* [{ id, name, type:'dsl'|'ele' }] */
    answers: {},               /* { key: { status, _ts, note } } */
    decisions: {},             /* { pumpId: outcomeKey } */
    deficiencies: {},          /* by contractor, as the single-pump tools do */
    generalDeficiencies: [],
    recordPhotos: [],
    updatedAt: null
  };
}

export function createStore(opts) {
  opts = opts || {};
  var IDB = opts.IDB || createIDB({
    dbName: DB_NAME,
    version: 1,
    stores: [{ name: 'state', keyPath: 'k' }, 'photos']
  });

  var current = null;

  /* ── the rule this layer owns ──────────────────────────────────────
     Every machine answer must name a machine that is actually in the
     report. A key surviving a merge after its pump was removed, or
     arriving from a device that knew a different pump set, would
     otherwise sit in the document unreachable and uncounted — present
     on disk, invisible on screen, and printed by nothing. Refusing is
     safe; it can only reject, never rewrite. */
  function orphanAnswers(rep) {
    var ids = {};
    (rep.pumps || []).forEach(function (p) { ids[p.id] = true; });
    return Object.keys(rep.answers || {}).filter(function (k) {
      var at = k.indexOf('@');
      return at !== -1 && !ids[k.slice(at + 1)];
    });
  }

  function assertSound(rep, where) {
    var orphans = orphanAnswers(rep);
    if (orphans.length) {
      throw new Error('[multipump] ' + where + ': ' + orphans.length
        + ' answer(s) belong to a machine that is not in this report — '
        + orphans.slice(0, 3).join(', '));
    }
    return rep;
  }

  return {
    IDB: IDB,
    orphanAnswers: orphanAnswers,

    get: function () { return current; },

    open: function (projectId) {
      return IDB.get('state', 'report:' + projectId).then(function (rec) {
        current = (rec && rec.v) ? rec.v : blankReport(projectId);
        return assertSound(current, 'open');
      });
    },

    save: function () {
      if (!current) return Promise.resolve(null);
      assertSound(current, 'save');
      current.updatedAt = new Date().toISOString();
      return IDB.put('state', { k: 'report:' + current.projectId, v: current })
        .then(function () { return current; });
    },

    /* The adapter createSync asks for. Nothing here decides what an
       answer means — it moves the document and refuses an unsound one. */
    model: {
      getProject: function () { return current; },
      setProject: function (rep) { current = assertSound(rep, 'setProject'); return current; },
      applyMerged: function (merged) {
        /* A merge that produced answers for a machine this report does
           not have is a merge that has gone wrong. Keeping the local
           document is the conservative outcome: nothing is lost, and the
           next push reconciles from a document that is still coherent. */
        var orphans = orphanAnswers(merged);
        if (orphans.length) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[multipump] merge refused — ' + orphans.length
              + ' answer(s) for machines not in this report: ' + orphans.slice(0, 5).join(', '));
          }
          return current;
        }
        current = merged;
        return current;
      }
    },

    /* Adding or removing a machine mid-job. Removing is the dangerous
       one: the machine's answers are NOT deleted, they are handed back,
       because a pump taken off a report by a mis-tap must not take a
       morning's readings with it. */
    addPump: function (pump) {
      if (!current) throw new Error('addPump: no report open');
      if (!pump || !pump.id || !pump.type) throw new Error('addPump: needs { id, name, type }');
      if (current.pumps.some(function (p) { return p.id === pump.id; })) {
        throw new Error('addPump: ' + pump.id + ' is already in this report');
      }
      current.pumps.push({ id: pump.id, name: pump.name || pump.id, type: pump.type });
      return current.pumps.slice();
    },

    removePump: function (pumpId) {
      if (!current) throw new Error('removePump: no report open');
      var keep = {}, taken = {};
      Object.keys(current.answers).forEach(function (k) {
        if (k.slice(k.indexOf('@') + 1) === pumpId && k.indexOf('@') !== -1) taken[k] = current.answers[k];
        else keep[k] = current.answers[k];
      });
      current.answers = keep;
      current.pumps = current.pumps.filter(function (p) { return p.id !== pumpId; });
      var decision = current.decisions[pumpId];
      delete current.decisions[pumpId];
      /* handed back, not destroyed */
      return { pumpId: pumpId, answers: taken, decision: decision || null,
               count: Object.keys(taken).length };
    },

    restorePump: function (pump, held) {
      if (!current) throw new Error('restorePump: no report open');
      current.pumps.push({ id: pump.id, name: pump.name || pump.id, type: pump.type });
      Object.keys((held && held.answers) || {}).forEach(function (k) {
        current.answers[k] = held.answers[k];
      });
      if (held && held.decision) current.decisions[pump.id] = held.decision;
      return assertSound(current, 'restorePump');
    }
  };
}
