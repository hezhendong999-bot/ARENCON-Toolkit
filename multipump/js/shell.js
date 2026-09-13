/* ═══════════════════════════════════════════════════════════════════════
   MULTI-PUMP SHELL                              multipump/js/shell.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The page that owns a multi-pump commissioning job: the
   room review (walked once), the list of machines, the decision to
   proceed for each, and — later — deficiencies and the combined report.

   ── THE ARCHITECTURE, DECIDED S730 ──────────────────────────────────
   A machine's TESTING is done by the shipped tool for its drive type —
   the Diesel or the Electric commissioning tool — running inside this
   page as an embedded frame. Not a copy of it, not a merge of the two:
   the same file the tablets open today, unchanged except for one mode
   check.

   Why. The two shipped tools declare their performance tables, their
   Section 3 and 5 rows and their controller fields under the same names,
   so they cannot be loaded into one document together. A room with one
   electric and one diesel pump — the common case — therefore cannot be
   served by composing either tool's screen. Each machine gets its own
   document instead. That also makes cross-machine contamination — pump
   1's gauge photograph printed as pump 2's evidence — impossible by
   construction rather than by a switching routine that has to remember
   to clear every surface.

   ── HOW A FRAME KNOWS IT IS HERE ────────────────────────────────────
   The tool asks `window.parent.MPShell`. Same origin, so a frame inside
   this page can see it; a cross-origin parent throws and reads as "not
   embedded". Nothing a person can type into an address bar turns the
   mode on. Inside the shell the tool keeps NO record of its own — no
   local drawer, no cloud row, no autosave loop, no leave prompt. It
   paints a blank screen and this shell reads it back through the
   manifest the tool already exposes (dieselCollectViaManifest), filing
   what it reads onto the pump with the S728/S729 modules: reportShape
   draws the room/pump line, pumpContext files the pump-scope keys, and
   checklistScope splits the checklist.

   ── NOTHING SAVES, STILL ────────────────────────────────────────────
   Every answer on this page and every value typed into a frame lives in
   memory until the page is closed. The store (store.js) exists and is
   not wired here; that ships with the Owner at a tablet. "Job record"
   at the foot of the page shows exactly what WOULD be saved — the mp1
   report shape — so the filing path can be walked at a desk before the
   save path is trusted with a job.

   ── WHAT STAYS OFF IN A FRAME ───────────────────────────────────────
   Sections 1 and 2 (the room review supersedes them), and the whole
   Closeout phase — deficiencies, signatures, sketches, photos — which
   belong to the job, not to a machine, and are the next build steps.
   The frame's Summary panel stays because the nameplate and pump data
   are read there; its room-level project fields are filled from this
   page and locked, the way Hub mode locks them.

   NOT LIVE. Reachable only by typing the address. Not precached.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var RR = root.MPRoomReview, S = root.MPReviewSurface,
    Shape = root.MPShape, Ctx = root.MPContext, CL = root.MPChecklistScope;
if (!RR || !S || !Shape || !Ctx || !CL) {
  throw new Error('shell.js needs roomReview, reviewSurface, sectionScope, reportShape, pumpContext and checklistScope first');
}
var doc = root.document;

/* Which shipped tool tests which drive type. Paths are the LIVE tools. */
var TOOL_FOR = { dsl: '../diesel-app/index.html', ele: '../electric-app/index.html' };

/* Until a job supplies its own machines, these stand in. The names are
   what an inspector reads off the placard, never "Pump 1 / Pump 2" — a
   report that calls a machine something the room does not call it is a
   report somebody has to translate. */
var SETS = {
  two: { label: 'Electric + diesel', pumps: [
    { id: 'p1', name: 'FP-1 Electric', type: 'ele' },
    { id: 'p2', name: 'FP-2 Diesel', type: 'dsl' }] },
  ele: { label: 'One electric', pumps: [{ id: 'p1', name: 'FP-1 Electric', type: 'ele' }] },
  dsl: { label: 'One diesel', pumps: [{ id: 'p1', name: 'FP-1 Diesel', type: 'dsl' }] }
};
var setKey = 'two';
/* Answers keyed per pump set as well as per row: switching the set is
   switching to a different room, and an answer from the old one must not
   be sitting there lit when the new one draws. */
var answers = { two: {}, ele: {}, dsl: {} };
var decisions = { two: {}, ele: {}, dsl: {} };

/* The room-level project fields this page owns. Same ids the tools use,
   so a frame can be filled by id and the scope model recognises them. */
var ROOM_FIELDS = [
  { id: 'pi-projno',   label: 'Project No.',           ph: '9999.99' },
  { id: 'pi-client',   label: 'Client',                ph: 'Client / Owner name' },
  { id: 'pi-projname', label: 'Project Name / Building', ph: 'Building & scope' },
  { id: 'pi-addr',     label: 'Project Address',       ph: '123 ABC Ave., City, Province' },
  { id: 'pi-date',     label: 'Date of Inspection',    type: 'date' },
  { id: 'pi-prepby',   label: 'Prepared By',           ph: 'Initials or name' }
];

var frames = {};        /* pumpId → iframe element */
var view = 'room';      /* 'room' | pumpId | 'record' */
var _setArm = null;     /* two-tap confirm for a set switch */

function pumps() { return SETS[setKey].pumps; }
function pumpById(id) { return pumps().filter(function (p) { return p.id === id; })[0] || null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* ── drawing ─────────────────────────────────────────────────────────── */

function drawTabs() {
  var html = '<button type="button" class="mp-tab' + (view === 'room' ? ' on' : '') + '" data-view="room">Room review</button>';
  pumps().forEach(function (p) {
    var d = decisions[setKey][p.id];
    var st = d ? (d === 'proceed' ? ' dec-go' : ' dec-hold') : '';
    html += '<button type="button" class="mp-tab' + (view === p.id ? ' on' : '') + st + '" data-view="' + p.id + '">'
      + esc(p.name) + '<small>' + (p.type === 'dsl' ? 'diesel' : 'electric') + (d ? ' · decided' : ' · undecided') + '</small></button>';
  });
  html += '<button type="button" class="mp-tab' + (view === 'defic' ? ' on' : '') + '" data-view="defic">Deficiencies<small>one list, filed by contractor</small></button>';
  html += '<button type="button" class="mp-tab mp-tab-rec' + (view === 'record' ? ' on' : '') + '" data-view="record">Job record</button>';
  doc.getElementById('mp-tabs').innerHTML = html;
}

function drawRoomHead() {
  doc.getElementById('mp-sets').innerHTML = Object.keys(SETS).map(function (k) {
    var arm = _setArm === k ? ' arm' : '';
    return '<button type="button" class="mp-pump' + (k === setKey ? ' on' : '') + arm + '" data-set="' + k + '">'
      + (arm ? 'Tap again to switch' : SETS[k].label) + '</button>';
  }).join('');
  doc.getElementById('mp-set').textContent = pumps().map(function (p) { return p.name; }).join('  ·  ');
}

function drawRoomFields() {
  var host = doc.getElementById('mp-room-fields');
  if (host.children.length) return;   /* draw once — the values live in the inputs */
  host.innerHTML = ROOM_FIELDS.map(function (f) {
    return '<label class="mp-field"><span>' + esc(f.label) + '</span>'
      + '<input type="' + (f.type || 'text') + '" id="mp-' + f.id + '" data-room-id="' + f.id + '" placeholder="' + esc(f.ph || '') + '"></label>';
  }).join('');
}
function roomFieldValues() {
  var out = {};
  ROOM_FIELDS.forEach(function (f) {
    var el = doc.getElementById('mp-' + f.id);
    out[f.id] = el ? String(el.value || '').trim() : '';
  });
  return out;
}

function drawDecision() {
  var d = decisions[setKey];
  var html = '<div class="mp-decision"><h3>Decision to proceed</h3>'
    + '<p>Recorded before any flow reading is taken, and taken for each machine separately — '
    + 'one pump can be ready while the other is not, and a report with a blank performance '
    + 'section and no decision reads as though a pump was forgotten. The wording of this '
    + 'decision is still being written by the Owner with Shaun; these options stand in.</p>';
  pumps().forEach(function (p) {
    html += '<div class="cl-group">' + esc(p.name) + '</div>';
    RR.OUTCOMES.forEach(function (o) {
      html += '<button type="button" class="mp-opt' + (d[p.id] === o.key ? ' on' : '') + '"'
        + ' data-dec="' + p.id + '" data-out="' + o.key + '">' + esc(o.text) + '</button>';
    });
    if (d[p.id]) {
      html += '<button type="button" class="mp-go" data-open="' + p.id + '">Open ' + esc(p.name)
        + ' testing \u203A</button>';
    }
  });
  doc.getElementById('mp-decision').innerHTML = html + '</div>';
}

function drawRoom() {
  drawRoomHead();
  drawRoomFields();
  doc.getElementById('mp-body').innerHTML = S.render(pumps(), answers[setKey]);
  drawDecision();
  var p = S.progress(pumps(), answers[setKey]);
  var un = RR.undecided(pumps(), decisions[setKey]).length;
  doc.getElementById('mp-progress').innerHTML =
    '<b>' + p.answered + '</b> of <b>' + p.total + '</b> answered'
    + (un ? ' · <b>' + un + '</b> machine' + (un > 1 ? 's' : '') + ' undecided' : ' · decided');
}

function show(which) {
  view = which;
  doc.getElementById('mp-room').style.display = (view === 'room') ? '' : 'none';
  doc.getElementById('mp-record').style.display = (view === 'record') ? '' : 'none';
  doc.getElementById('mp-defic').style.display = (view === 'defic') ? '' : 'none';
  if (view === 'defic') openDeficiencies();
  Object.keys(frames).forEach(function (id) {
    frames[id].parentNode.style.display = (view === id) ? '' : 'none';
  });
  if (view !== 'room' && view !== 'record' && view !== 'defic') {
    var p = pumpById(view);
    if (p) openFrame(p);
  }
  if (view === 'record') drawRecord();
  drawTabs();
}

/* ── the machine frames ──────────────────────────────────────────────── */

/* Created the first time a machine's testing is opened, never before: a
   two-pump job means two whole tools in memory, and a job that never
   reaches testing should not pay for them. */
function openFrame(p) {
  if (frames[p.id]) { frames[p.id].parentNode.style.display = ''; syncRoomIntoFrame(frames[p.id]); return; }
  var wrap = doc.createElement('div');
  wrap.className = 'mp-frame-wrap';
  wrap.innerHTML = '<div class="mp-frame-note">' + esc(p.name) + ' \u2014 testing in the shipped '
    + (p.type === 'dsl' ? 'Diesel' : 'Electric') + ' tool. <b>Nothing saves.</b> Photographs taken here are held in memory only until the store is wired.</div>';
  var f = doc.createElement('iframe');
  f.className = 'mp-frame';
  f.setAttribute('title', p.name + ' testing');
  f.setAttribute('data-pump', p.id);
  f.src = TOOL_FOR[p.type];
  f.addEventListener('load', function () { onFrameLoad(f, p); });
  wrap.appendChild(f);
  doc.getElementById('mp-frames').appendChild(wrap);
  frames[p.id] = f;
}

/* The tool has booted in multi-pump mode. Shape its navigation for the
   one job it has here — testing this machine — and fill the room fields. */
function onFrameLoad(f, p) {
  var w = f.contentWindow;
  try {
    if (!w || !w.PHASES) return;
    var ph = w.PHASES;
    ph.setup.panels = ph.setup.panels.filter(function (x) { return x.id !== 's1' && x.id !== 's2'; });
    delete ph.closeout;
    /* The checklist counts must follow: Sections 1 and 2 are the room
       review's now, and a tally that still asks for them would show this
       machine forever incomplete. CL_GROUPS is a const ARRAY — its
       contents can be edited in place, and the derived list is rebuilt
       the same way the tool built it. */
    /* Top-level `const` is not a property of the frame's window, so the two
       lists are reached by evaluating their names in the frame's own global
       scope. Same origin, our own document — this is a reference, not code
       from anywhere else. */
    var groups = w.eval('typeof CL_GROUPS !== "undefined" ? CL_GROUPS : null');
    var sections = w.eval('typeof CL_SECTIONS !== "undefined" ? CL_SECTIONS : null');
    if (groups && sections) {
      for (var i = groups.length - 1; i >= 0; i--) {
        var secs = groups[i].secs || [];
        if (secs.indexOf('s1') >= 0 || secs.indexOf('s2') >= 0) groups.splice(i, 1);
      }
      sections.length = 0;
      groups.forEach(function (g) { g.secs.forEach(function (s) { sections.push(s); }); });
    }
    var pb = w.document.getElementById('project-bar'); if (pb) pb.style.display = 'none';
    var phBar = w.document.getElementById('phase-closeout'); if (phBar) phBar.style.display = 'none';
    if (typeof w.switchPanel === 'function') w.switchPanel('proj');
    if (typeof w.renderSubNav === 'function') w.renderSubNav();
    if (typeof w.updateProgress === 'function') w.updateProgress();
    syncRoomIntoFrame(f);
  } catch (e) {
    /* Reached directly: a warning routed through a host object is missing
       exactly where nobody is looking. */
    if (root.console && root.console.warn) root.console.warn('[mp] frame shaping failed for ' + p.id, e);
  }
}

/* Room-level project fields are typed once, here, and locked in every
   frame — the same lock Hub mode applies. */
function syncRoomIntoFrame(f) {
  var w = f.contentWindow; if (!w || !w.document) return;
  var vals = roomFieldValues();
  Object.keys(vals).forEach(function (id) {
    var el = w.document.getElementById(id);
    if (!el) return;
    if (el.value !== vals[id]) { el.value = vals[id]; try { el.dispatchEvent(new w.Event('change', { bubbles: true })); } catch (e) {} }
    el.readOnly = true; el.style.opacity = '0.7';
  });
}

/* ── deficiencies ────────────────────────────────────────────────────── */

/* The panel's markup is the Diesel tool's own — read from the live file
   at first open, never retyped here, so a change to the shipped panel is
   a change to this one. The engine that draws into it is loaded by the
   page (lib/ui/deficiencies.js) with deficHost.js as its host. */
var _deficReady = false, _deficLoading = false;
function openDeficiencies() {
  if (_deficReady || _deficLoading) return;
  _deficLoading = true;
  var host = doc.getElementById('mp-defic-panel');
  host.innerHTML = '<div class="mp-note">Loading the deficiencies panel from the Diesel tool…</div>';
  root.fetch(TOOL_FOR.dsl, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (txt) {
    var d = new root.DOMParser().parseFromString(txt, 'text/html');
    var panel = d.getElementById('panel-defic');
    var body = panel && panel.querySelector('.card-body');
    if (!body) throw new Error('panel-defic not found in the Diesel tool');
    host.innerHTML = '<div class="card"><div class="card-body">' + body.innerHTML + '</div></div>';
    if (typeof root.renderContractorTags === 'function') root.renderContractorTags();
    if (typeof root.renderDeficGroups === 'function') root.renderDeficGroups();
    if (typeof root.renderGeneralDeficGroup === 'function') root.renderGeneralDeficGroup();
    if (typeof root.updateDeficSummary === 'function') root.updateDeficSummary();
    _deficReady = true; _deficLoading = false;
  }).catch(function (e) {
    _deficLoading = false;
    host.innerHTML = '<div class="mp-note">The deficiencies panel could not be read from the Diesel tool: ' + esc(e && e.message) + '</div>';
  });
}

/* ── the job record ──────────────────────────────────────────────────── */

/* What WOULD be saved. Built from the modules, never assembled by hand
   here, so the desk walk exercises the same filing the store will. */
function collect() {
  var rep = Shape.blank();
  rep.room.proj = roomFieldValues();
  rep.room.review = { set: setKey, answers: answers[setKey] };
  rep.room.reviewProgress = S.progress(pumps(), answers[setKey]);
  var notes = [];
  pumps().forEach(function (p) {
    Shape.addPump(rep, { id: p.id, tag: p.name, type: p.type, duty: 'primary' });
    var pump = Shape.findPump(rep, p.id);
    pump.decision = decisions[setKey][p.id] || '';
    var f = frames[p.id];
    if (!f || !f.contentWindow || typeof f.contentWindow.dieselCollectViaManifest !== 'function') {
      pump.tested = false; return;
    }
    var w = f.contentWindow, flat;
    try { flat = w.dieselCollectViaManifest(); }
    catch (e) { notes.push(p.id + ': the tool refused to be read — ' + (e && e.message)); return; }
    pump.tested = true;
    /* Pump-scope keys and the room/pump split of `proj`, through the one
       module allowed to cross that line. Room-scope keys typed inside a
       frame (contractors, signatures…) cannot be reached there — the
       Closeout phase is off — but if one is ever found non-empty it is
       reported, not dropped. */
    var filed = Ctx.fileInto(rep, p.id, flat, w.DieselReportManifest);
    pump._filed = filed.filed; pump._offType = filed.offType;
    Object.keys(flat).forEach(function (k) {
      if (filed.filed.indexOf(k) >= 0 || k === 'clState') return;
      var v = flat[k];
      var empty = v == null || v === '' || (Array.isArray(v) && !v.length)
               || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
      if (empty) return;
      /* The room's, so it is filed on the room ONCE. Two frames agreeing is
         the normal case (schema version, form revision); two frames
         disagreeing is a note, and the first value stands. */
      var have = rep.room[k];
      var haveEmpty = have == null || have === '' || (Array.isArray(have) && !have.length)
                   || (typeof have === 'object' && !Array.isArray(have) && !Object.keys(have).length);
      if (haveEmpty) rep.room[k] = v;
      else if (JSON.stringify(have) !== JSON.stringify(v)) {
        notes.push(p.id + ': room-scope key "' + k + '" differs from the value already on the room — room kept, this frame\u2019s value not filed');
      }
    });
    /* Checklist: Sections 1 and 2 are the room review's here. Their seeded
       blank entries are not filed; a non-blank one would be a defect in
       the frame shaping and is reported. */
    var cl = {};
    Object.keys(flat.clState || {}).forEach(function (id) {
      var st = flat.clState[id] || {};
      var hasContent = !!(st.status || st.comment || (st.photos && st.photos.length) || st.customText);
      if (/^s[12]_/.test(id)) { if (hasContent) notes.push(p.id + ': Section 1/2 answer ' + id + ' found in a frame'); return; }
      if (hasContent) cl[id] = st;
    });
    pump._checklist = CL.fileInto(rep, p.id, cl);
  });
  /* Deficiencies: the engine's own lists, whole, plus what ownership says
     about them. An entry with no owner is the report's problem to fix
     before issue, and it is counted here, never hidden. */
  var Own = root.MPDeficiencyOwner;
  if (Own && typeof root.mpDeficLists === 'function') {
    var lists = root.mpDeficLists(), byC = lists.byContractor, gen = lists.general || [];
    rep.deficiencies = { contractors: lists.contractors.slice(), trades: lists.trades, byContractor: byC, general: gen };
    var isDel = function (d) { return !!(d && d.deleted); };
    var un = Own.unassigned(byC, gen, { isDeleted: isDel });
    rep.deficiencyOwnership = { unassigned: un.length, readyToIssue: Own.readyToIssue(byC, gen, rep, { isDeleted: isDel }) };
    if (un.length) notes.push(un.length + ' deficienc' + (un.length > 1 ? 'ies' : 'y') + ' not yet tagged to a machine or the room — cannot issue');
  }
  rep._notes = notes;
  rep._nothingSaves = true;
  return rep;
}

function drawRecord() {
  var rep = collect();
  var el = doc.getElementById('mp-record-body');
  var json = JSON.stringify(rep, null, 2);
  var tested = rep.pumps.filter(function (p) { return p.tested; }).length;
  el.innerHTML = '<div class="mp-note">This is the record the store would save — <b>it is not saved</b>. '
    + rep.pumps.length + ' machine' + (rep.pumps.length > 1 ? 's' : '') + ', ' + tested + ' with a testing screen open, '
    + rep.room.reviewProgress.answered + ' of ' + rep.room.reviewProgress.total + ' room answers, '
    + Math.round(json.length / 1024) + ' KB.'
    + (rep._notes.length ? '<br><b>Notes:</b> ' + rep._notes.map(esc).join('<br>') : '')
    + '</div><pre class="mp-json">' + esc(json) + '</pre>';
}

/* ── one handler for the whole page ──────────────────────────────────── */

doc.addEventListener('click', function (ev) {
  var t = ev.target && ev.target.closest ? ev.target.closest('[data-view],[data-set],[data-dec],[data-open]') : null;
  if (t) {
    if (t.hasAttribute('data-view')) { show(t.getAttribute('data-view')); return; }
    if (t.hasAttribute('data-open')) { show(t.getAttribute('data-open')); return; }
    if (t.hasAttribute('data-set')) {
      var k = t.getAttribute('data-set');
      if (k === setKey) { _setArm = null; drawRoomHead(); return; }
      /* Destructive: the machines' testing screens are discarded. One
         confirming tap, in place, no native dialog. */
      if (_setArm !== k) { _setArm = k; drawRoomHead(); return; }
      _setArm = null;
      Object.keys(frames).forEach(function (id) { frames[id].parentNode.remove(); });
      frames = {};
      setKey = k; view = 'room';
      drawRoom(); show('room'); return;
    }
    if (t.hasAttribute('data-dec')) {
      var who = t.getAttribute('data-dec'), out = t.getAttribute('data-out');
      decisions[setKey][who] = (decisions[setKey][who] === out) ? '' : out;
      drawRoom(); drawTabs(); return;
    }
  }
  if (view !== 'room') return;
  var hit = S.handleTap(ev, pumps(), answers[setKey]);
  if (!hit) return;
  if (hit.cleared) delete answers[setKey][hit.key];
  else answers[setKey][hit.key] = { status: hit.status, _ts: Date.now() };
  drawRoom();
}, false);

/* A room field typed here reaches every open frame. */
doc.addEventListener('change', function (ev) {
  var t = ev.target;
  if (!t || !t.getAttribute || !t.getAttribute('data-room-id')) return;
  Object.keys(frames).forEach(function (id) { syncRoomIntoFrame(frames[id]); });
}, true);

/* The flag the shipped tools look for. Its presence IS the mode. */
var API = { version: 'S730', collect: collect, frames: function () { return frames; },
            pumps: pumps, sets: SETS, TOOL_FOR: TOOL_FOR, show: show };
root.MPShell = API;

drawRoom();
drawTabs();
show('room');

})(window);
