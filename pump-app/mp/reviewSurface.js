/* ═══════════════════════════════════════════════════════════════════════
   ROOM REVIEW SURFACE                    multipump/js/reviewSurface.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The screen for the room review: one prompt, and beneath
   it one set of controls per machine the row is about.

   ── WHY THIS IS NOT THE SHIPPED CHECKLIST ENGINE ─────────────────────
   The shared engine in lib/ui/checklist.js stores exactly one answer per
   item — clState[id].status, one status, one timestamp, one photo list.
   That is not a limitation to route around; it IS the shape of a
   single-pump report, and it is the save path running on tablets in both
   pump tools today.

   A row answered separately for two machines cannot be stored in one
   status field. Widening the engine to hold many would change the save
   path of two live tools, for the benefit of a tool that does not exist
   yet, and the failure mode of getting it wrong is a commissioning
   answer written to the wrong machine — silently, because both shapes
   look valid on disk.

   So this surface owns the multi-answer case and the engine keeps the
   single-answer case, and the intended end state is the opposite of
   duplication: once this is proven in the field, the single-pump tools
   become a room with one machine, and one implementation serves both.
   With one target this renders what the engine renders today — that is
   deliberate, and it is what makes that migration possible later.

   ── WHAT THE FIELD DECIDED ───────────────────────────────────────────
   Two machines are stacked, each labelled with its own name, never two
   columns: a column layout wraps at tablet width and a gloved thumb
   lands in the wrong one. Targets are full-height. Nothing depends on
   hover. The machine name comes from the pump, not from "Pump 1 / Pump
   2", because an inspector reads the placard, not our numbering.

   ── HTML IN, NOT DOM OUT ─────────────────────────────────────────────
   render() returns markup, the same way the shipped engine builds its
   rows, so it can be held by a probe with no browser. Events are one
   delegated handler on the container reading data attributes, rather
   than a listener per control — 69 answers on a two-pump job is 207
   controls, and that many listeners is how a tablet starts feeling slow.

   NOT LIVE. Nothing loads this yet.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var RR = root.MPRoomReview;
if (!RR) throw new Error('reviewSurface.js requires roomReview.js to load first');

var STATUSES = [
  { key: 'yes', label: 'YES' },
  { key: 'no',  label: 'NO'  },
  { key: 'na',  label: 'N/A' }
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function chip(scope) {
  if (scope === 'visit') return '<span class="cl-scope cl-scope-visit">VISIT</span>';
  if (scope === 'room') return '<span class="cl-scope cl-scope-room">ROOM</span>';
  return '';
}

/* One set of Yes / No / N/A for one machine, or for the room. */
function controls(row, target, answers, showWho) {
  var key = RR.answerKey(row, target && target.id);
  var cur = (answers && answers[key] && answers[key].status) || '';
  var btns = STATUSES.map(function (s) {
    return '<button type="button" class="cl-tog cl-tog-' + s.key + (cur === s.key ? ' on' : '') + '"'
      + ' data-mp-row="' + esc(row.id) + '"'
      + (target ? ' data-mp-pump="' + esc(target.id) + '"' : '')
      + ' data-mp-status="' + s.key + '"'
      + ' aria-pressed="' + (cur === s.key ? 'true' : 'false') + '">' + s.label + '</button>';
  }).join('');
  /* The answer ALWAYS names its machine — that is storage, and it is not
     optional. The visible label is what is conditional: with one pump in
     the room there is nothing to tell apart, and a label saying which
     pump is noise an inspector has to read past 49 times. */
  var who = (target && showWho) ? '<span class="cl-who">' + esc(target.name) + '</span>' : '';
  return '<div class="cl-target">' + who + '<div class="cl-seg">' + btns + '</div></div>';
}

function renderRow(row, answers, opts) {
  opts = opts || {};
  /* The machine name is only shown when there is more than one to tell
     apart. On a single-pump job a label saying which pump is noise. */
  var many = row.targets.length > 1;
  var body = row.targets.map(function (t) {
    return controls(row, t, answers, many);
  }).join('');
  var mark = row.mark === 'new'
    ? '<span class="cl-mark cl-mark-new" title="a check neither tool asked before"></span>'
    : (row.mark === 'derived'
      ? '<span class="cl-mark cl-mark-derived" title="reworded or split from an existing check"></span>' : '');
  return '<div class="cl-item" data-mp-item="' + esc(row.id) + '">'
    + '<div class="cl-item-top">'
    + '<div class="cl-num">' + esc(opts.number || '') + '</div>'
    + '<div class="cl-text">' + esc(row.text) + chip(row.scope) + (opts.marks === false ? '' : mark) + '</div>'
    + '</div><div class="cl-targets">' + body + '</div></div>';
}

/* The whole review, phases and diesel groups in order. */
function render(pumps, answers, opts) {
  opts = opts || {};
  var rows = RR.rowsFor(pumps);
  var html = '', phase = '', group = '', n = 0;
  var TITLES = {
    p1: ['Phase 1 — before testing starts',
         'What you arrange, what you bring, then what others must have finished'],
    p2: ['Phase 2 — installation review', 'One walk of the room, following the water'],
    dsl: ['Diesel', 'Asked only of the diesel machine']
  };
  rows.forEach(function (r) {
    if (r.phase !== phase) {
      phase = r.phase; group = ''; n = 0;
      html += '<div class="cl-phase">' + esc(TITLES[phase][0])
           + '<small>' + esc(TITLES[phase][1]) + '</small></div>';
    }
    if (r.group && r.group !== group) {
      group = r.group;
      html += '<div class="cl-group">' + esc(group) + '</div>';
    }
    n += 1;
    html += renderRow(r, answers, { number: n, marks: opts.marks });
  });
  return html;
}

/* One delegated handler. Returns what changed so the host owns saving —
   this surface never writes to storage, because how an answer is STORED
   is the part that must not be reinvented. */
function handleTap(ev, pumps, answers) {
  var el = ev.target;
  while (el && !el.getAttribute) el = el.parentNode;
  while (el && !el.hasAttribute('data-mp-status')) {
    el = el.parentNode;
    if (!el || !el.hasAttribute) return null;
  }
  var rowId = el.getAttribute('data-mp-row');
  var pumpId = el.getAttribute('data-mp-pump') || null;
  var status = el.getAttribute('data-mp-status');
  var row = RR.rowsFor(pumps).filter(function (r) { return r.id === rowId; })[0];
  if (!row) return null;
  var key = RR.answerKey(row, pumpId);
  var prev = (answers[key] && answers[key].status) || '';
  /* Tapping the lit answer clears it. An inspector who mis-taps needs a
     way back that is not "answer something else instead". */
  var next = (prev === status) ? '' : status;
  return { key: key, row: row, pump: pumpId, status: next, cleared: next === '' };
}

/* What is still unanswered, as a sentence a person can act on rather
   than a count they have to interpret. */
function progress(pumps, answers) {
  var left = RR.outstanding(pumps, answers);
  var total = RR.counts(pumps).answers;
  return { total: total, answered: total - left.length, outstanding: left.length, rows: left };
}

var API = { render: render, renderRow: renderRow, handleTap: handleTap,
            progress: progress, STATUSES: STATUSES };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.MPReviewSurface = API;

})(typeof window !== 'undefined' ? window : globalThis);
