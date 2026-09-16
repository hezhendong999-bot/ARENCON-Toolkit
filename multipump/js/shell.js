/* ═══════════════════════════════════════════════════════════════════════
   MULTI-PUMP SHELL                              multipump/js/shell.js
   ───────────────────────────────────────────────────────────────────────
   WHAT THIS IS. The page that owns a multi-pump commissioning job: the
   room review (walked once), the list of machines, the decision to
   proceed for each, and — later — deficiencies and the combined report.

   ── THE LOOK ────────────────────────────────────────────────────────
   Built to the Owner-approved demo of record, DEMO_multipump_FINAL_S728.
   Its own screen: a centred column, a breadcrumb, pill tabs keyed to each
   machine's drive type, cards with a coloured left edge, compact
   checklist rows. Two earlier builds dressed this page in the
   single-pump tool's chrome instead and were rejected — that is not a
   styling preference to revisit, it is a decided design.

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
   not wired here; that ships with the Owner at a tablet. collect()
   assembles the mp1 report shape on demand so the filing path can be
   exercised without a save path existing.

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
var view = 'site';      /* 'site' | pumpId | 'defic' */

function pumps() { return SETS[setKey].pumps; }
function pumpById(id) { return pumps().filter(function (p) { return p.id === id; })[0] || null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* ── drawing: the demo's shapes, nothing invented ────────────────────── */

var TC = { dsl: 'var(--dsl)', ele: 'var(--ele)' };
var TBG = { dsl: 'var(--dsl-bg)', ele: 'var(--ele-bg)' };

function toggleTheme() {
  var el = doc.documentElement;
  el.setAttribute('data-theme', el.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}
root.toggleTheme = toggleTheme;

/* a custom bottom sheet — the demo's modal, never the browser's */
function sheet(title, bodyHtml, buttons) {
  doc.getElementById('shT').textContent = title;
  doc.getElementById('shB').innerHTML = bodyHtml;
  doc.getElementById('shBtns').innerHTML = buttons.map(function (b, i) {
    return '<button class="btn' + (b.cls ? ' ' + b.cls : '') + '" data-sheet-btn="' + i + '">' + esc(b.label) + '</button>';
  }).join('');
  _sheetActions = buttons.map(function (b) { return b.act || null; });
  doc.getElementById('sheet').classList.add('open');
}
var _sheetActions = [];
function closeSheet() { doc.getElementById('sheet').classList.remove('open'); }

function drawCrumb() {
  doc.getElementById('crumb').innerHTML =
    '<button data-view="site">Fire Pump</button><span>&rsaquo;</span>'
    + '<span>' + esc(SETS[setKey].label) + '</span><span>&rsaquo;</span>'
    + '<span>' + (view === 'site' ? 'Site &amp; Room' : view === 'defic' ? 'Deficiencies'
        : esc((pumpById(view) || {}).name || '')) + '</span>';
}

/* Percentage per scope. One overall number would let a barely-started
   machine hide inside a mostly-finished room. */
function pctSite() {
  var p = S.progress(pumps(), answers[setKey]);
  return p.total ? Math.round(p.answered / p.total * 100) : 0;
}
function pctPump(id) {
  var f = frames[id], w = f && f.contentWindow;
  if (!w) return 0;
  try {
    var cl = w.eval('typeof clState!=="undefined"?clState:null');
    var secs = w.eval('typeof CL_SECTIONS!=="undefined"?CL_SECTIONS:null');
    if (!cl || !secs) return 0;
    var tot = 0, done = 0;
    Object.keys(cl).forEach(function (k) {
      if (!secs.some(function (sc) { return k.indexOf(sc + '_') === 0; })) return;
      tot++; if (cl[k] && cl[k].status) done++;
    });
    return tot ? Math.round(done / tot * 100) : 0;
  } catch (e) { return 0; }
}

function drawTabs() {
  var h = '<button class="' + (view === 'site' ? 'on' : '') + '" style="--tc:var(--site);--tbg:var(--site-bg)"'
    + ' data-view="site"><span class="dot" style="background:var(--site)"></span>Site &amp; Room'
    + '<span class="pc">' + pctSite() + '%</span></button>';
  pumps().forEach(function (p) {
    h += '<button class="' + (view === p.id ? 'on' : '') + '" style="--tc:' + TC[p.type] + ';--tbg:' + TBG[p.type] + '"'
      + ' data-view="' + p.id + '"><span class="dot" style="background:' + TC[p.type] + '"></span>'
      + esc(p.name.split(' ')[0]) + '<span class="pc">' + pctPump(p.id) + '%</span></button>';
  });
  h += '<button class="' + (view === 'defic' ? 'on' : '') + '" style="--tc:var(--fail);--tbg:var(--fail-bg)"'
    + ' data-view="defic"><span class="dot" style="background:var(--fail)"></span>Deficiencies'
    + '<span class="pc">' + deficCount() + '</span></button>';
  doc.getElementById('tabs').innerHTML = h;
  drawCrumb();
}

function deficCount() {
  if (typeof root.mpDeficLists !== 'function') return 0;
  var l = root.mpDeficLists(), n = (l.general || []).length;
  Object.keys(l.byContractor || {}).forEach(function (c) { n += (l.byContractor[c] || []).length; });
  return n;
}

/* ── Site & Room ─────────────────────────────────────────────────────── */

var PHASE_CARDS = [
  { phase: 'p1',  title: 'Phase 1 \u2014 before testing starts', sub: 'What you arrange, what you bring, then what others must have finished' },
  { phase: 'p2',  title: 'Phase 2 \u2014 the walk of the room',   sub: 'The installation itself, and each machine in it' },
  { phase: 'dsl', title: 'Diesel engine \u2014 per machine',      sub: 'Asked only of a diesel driver' }
];

function itemsHtml(rows) {
  var a = answers[setKey], h = '';
  rows.forEach(function (row) {
    var targets = (row.scope === 'machine') ? row.targets : [null];
    targets.forEach(function (t) {
      var key = RR.answerKey(row, t && t.id);
      var v = (a[key] && a[key].status) || '';
      var flag = row.scope === 'visit' ? '<span class="tflag visit">visit</span>'
               : row.scope === 'room'  ? '<span class="tflag room">room</span>'
               : (t && pumps().length > 1)
                 ? '<span class="tflag ' + t.type + '">' + esc(t.name.split(' ')[0]) + '</span>' : '';
      h += '<div class="item" id="it-' + esc(key) + '"><span class="n">' + esc(row.src || '') + '</span>'
        + '<span class="t">' + esc(row.text) + flag + '</span><span class="yn">'
        + '<button class="y' + (v === 'yes' ? ' on' : '') + '" data-ans="' + esc(key) + '" data-v="yes">Y</button>'
        + '<button class="n' + (v === 'no'  ? ' on' : '') + '" data-ans="' + esc(key) + '" data-v="no">N</button>'
        + '<button class="a' + (v === 'na'  ? ' on' : '') + '" data-ans="' + esc(key) + '" data-v="na">N/A</button>'
        + '</span></div>';
    });
  });
  return h;
}

function viewSite() {
  var rows = RR.rowsFor(pumps());
  var h = '<div class="card keyed" style="--tc:var(--site)"><div class="chd">Site &amp; Room'
    + '<span class="sp"></span><span class="rt">walked once \u00b7 shared by every machine</span></div><div class="cbd">'
    + '<div class="note">One walk of the room. <b>VISIT</b> is answered once for the day, <b>ROOM</b> once for '
    + 'the installation, and the rest once for each machine. Duplicating these per pump creates two places for '
    + 'the same answer to disagree.</div>';
  PHASE_CARDS.forEach(function (c) {
    var mine = rows.filter(function (r) { return r.phase === c.phase; });
    if (!mine.length) return;
    h += '<div class="sec"><div class="sech"><span class="b" style="background:var(--site)"></span>'
      + esc(c.title) + '</div><div class="note" style="margin-bottom:8px">' + esc(c.sub) + '</div>'
      + itemsHtml(mine) + '</div>';
  });
  h += '</div></div>';

  h += '<div class="card"><div class="chd">Pumps on this job<span class="sp"></span>'
    + '<span class="rt">' + pumps().length + ' machine' + (pumps().length > 1 ? 's' : '') + '</span></div><div class="cbd">'
    + '<div class="note">Drive type is a property of each machine, not of the app \u2014 a room with one '
    + 'electric and one diesel is the common case.</div>';
  pumps().forEach(function (p) {
    h += '<div class="prow"><span class="idc ' + p.type + '">' + (p.type === 'dsl' ? 'DIESEL' : 'ELECTRIC') + '</span>'
      + '<div class="nm">' + esc(p.name) + '<small>tested in the shipped '
      + (p.type === 'dsl' ? 'Diesel' : 'Electric') + ' tool</small></div>'
      + '<div class="acts"><button class="mini" data-view="' + p.id + '">Open testing \u203A</button></div></div>';
  });
  h += '<div class="seg" style="margin-top:6px">' + Object.keys(SETS).map(function (k) {
      return '<button class="' + (k === setKey ? 'on' : '') + '" data-set="' + k + '">' + esc(SETS[k].label) + '</button>';
    }).join('') + '</div></div></div>';

  h += '<div class="card"><div class="chd">Project Information</div><div class="cbd">'
    + '<div class="note">Typed once here and locked inside every machine\u2019s testing screen.</div>'
    + ROOM_FIELDS.map(function (f) {
        return '<div class="field"><label>' + esc(f.label) + '</label>'
          + '<input type="' + (f.type || 'text') + '" id="' + f.id + '" data-room-id="' + f.id
          + '" placeholder="' + esc(f.ph || '') + '"></div>';
      }).join('') + '</div></div>';

  h += '<div class="card"><div class="chd">Decision to proceed<span class="sp"></span>'
    + '<span class="rt">before any flow reading is taken</span></div><div class="cbd">'
    + '<div class="note">Taken for each machine separately \u2014 one pump can be ready while the other is not. '
    + 'The wording is still being written by the Owner with Shaun; these options stand in.</div>';
  pumps().forEach(function (p) {
    var d = decisions[setKey][p.id];
    h += '<div class="sec"><div class="sech"><span class="b" style="background:' + TC[p.type] + '"></span>'
      + esc(p.name) + '</div><div class="pickrow seg">'
      + RR.OUTCOMES.map(function (o) {
          return '<button class="' + (d === o.key ? 'on' : '') + '" style="--sc:' + TC[p.type] + '"'
            + ' data-dec="' + p.id + '" data-out="' + esc(o.key) + '">' + esc(o.text) + '</button>';
        }).join('') + '</div></div>';
  });
  h += '</div></div>';

  h += '<div class="card"><div class="chd">Completion<span class="sp"></span>'
    + '<span class="rt">one number per scope</span></div><div class="cbd">'
    + '<div class="note">One overall percentage would hide a machine that has barely been started.</div>'
    + '<div class="donuts"><div class="donut"><div class="v" style="color:var(--site)">' + pctSite() + '%</div>'
    + '<div class="l">Site &amp; Room</div></div>';
  pumps().forEach(function (p) {
    h += '<div class="donut"><div class="v" style="color:' + TC[p.type] + '">' + pctPump(p.id) + '%</div>'
      + '<div class="l">' + esc(p.name) + '</div></div>';
  });
  h += '</div></div></div>';
  return h;
}

/* ── the machine frames ──────────────────────────────────────────────── */

function openFrame(p) {
  if (frames[p.id]) { frames[p.id].parentNode.style.display = ''; syncRoomIntoFrame(frames[p.id]); return; }
  var wrap = doc.createElement('div');
  wrap.className = 'frame-wrap';
  wrap.innerHTML = '<div class="frame-note">' + esc(p.name) + ' \u2014 testing in the shipped '
    + (p.type === 'dsl' ? 'Diesel' : 'Electric') + ' tool. Nothing saves; photographs are held in memory only.</div>';
  var f = doc.createElement('iframe');
  f.className = 'frame';
  f.setAttribute('title', p.name + ' testing');
  f.setAttribute('data-pump', p.id);
  f.src = TOOL_FOR[p.type];
  f.addEventListener('load', function () { onFrameLoad(f, p); drawTabs(); });
  wrap.appendChild(f);
  doc.getElementById('frames').appendChild(wrap);
  frames[p.id] = f;
}

function onFrameLoad(f, p) {
  var w = f.contentWindow;
  try {
    if (!w || !w.PHASES) return;
    var ph = w.PHASES;
    ph.setup.panels = ph.setup.panels.filter(function (x) { return x.id !== 's1' && x.id !== 's2'; });
    delete ph.closeout;
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
    if (root.console && root.console.warn) root.console.warn('[mp] frame shaping failed for ' + p.id, e);
  }
}

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

function roomFieldValues() {
  var out = {};
  ROOM_FIELDS.forEach(function (f) {
    var el = doc.getElementById(f.id);
    out[f.id] = el ? String(el.value || '').trim() : '';
  });
  return out;
}

/* ── deficiencies ────────────────────────────────────────────────────── */

var _deficReady = false, _deficLoading = false;
function openDeficiencies() {
  var host = doc.getElementById('view');
  host.innerHTML = '<div class="card keyed" style="--tc:var(--fail)"><div class="chd">Deficiencies'
    + '<span class="sp"></span><span class="rt">one list \u00b7 filed by contractor</span></div>'
    + '<div class="cbd"><div class="note">Every deficiency names its owner. \u201cExcessive vibration\u201d with no '
    + 'owner does not tell a contractor which machine to look at. <b>Nothing saves</b>; photographs are not stored yet.</div>'
    + '<div id="defic-panel"></div><p class="note" id="mp-defic-note" style="display:none"></p>'
    + '<input type="file" id="global-file-input" style="display:none" onchange="handleFiles(this.files)">'
    + '</div></div>';
  if (_deficReady) { redrawDefic(); return; }
  if (_deficLoading) return;
  _deficLoading = true;
  doc.getElementById('defic-panel').innerHTML = '<div class="note">Loading the deficiencies panel from the Diesel tool\u2026</div>';
  root.fetch(TOOL_FOR.dsl, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (txt) {
    var d = new root.DOMParser().parseFromString(txt, 'text/html');
    var panel = d.getElementById('panel-defic');
    var body = panel && panel.querySelector('.card-body');
    if (!body) throw new Error('panel-defic not found in the Diesel tool');
    _deficMarkup = body.innerHTML;
    _deficReady = true; _deficLoading = false;
    redrawDefic();
  }).catch(function (e) {
    _deficLoading = false;
    var el = doc.getElementById('defic-panel');
    if (el) el.innerHTML = '<div class="warn">The deficiencies panel could not be read from the Diesel tool: ' + esc(e && e.message) + '</div>';
  });
}
var _deficMarkup = '';
function redrawDefic() {
  var el = doc.getElementById('defic-panel'); if (!el) return;
  el.innerHTML = _deficMarkup;
  if (typeof root.renderContractorTags === 'function') root.renderContractorTags();
  if (typeof root.renderDeficGroups === 'function') root.renderDeficGroups();
  if (typeof root.renderGeneralDeficGroup === 'function') root.renderGeneralDeficGroup();
  if (typeof root.updateDeficSummary === 'function') root.updateDeficSummary();
}

/* ── which screen is showing ─────────────────────────────────────────── */

function show(which) {
  view = which;
  Object.keys(frames).forEach(function (id) {
    frames[id].parentNode.style.display = (view === id) ? '' : 'none';
  });
  var v = doc.getElementById('view');
  if (view === 'site') { v.innerHTML = viewSite(); }
  else if (view === 'defic') { openDeficiencies(); }
  else {
    v.innerHTML = '';
    var p = pumpById(view);
    if (p) openFrame(p);
  }
  drawTabs();
}

function drawRoom() { if (view === 'site') show('site'); else drawTabs(); }

/* ── what the store would save ───────────────────────────────────────── */

/* Built from the modules, never assembled by hand here, so the filing this
   exercises is the filing the store will do. Nothing is written anywhere. */
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
    catch (e) { notes.push(p.id + ': the tool refused to be read \u2014 ' + (e && e.message)); return; }
    pump.tested = true;
    var filed = Ctx.fileInto(rep, p.id, flat, w.DieselReportManifest);
    pump._filed = filed.filed; pump._offType = filed.offType;
    Object.keys(flat).forEach(function (k) {
      if (filed.filed.indexOf(k) >= 0 || k === 'clState') return;
      var v = flat[k];
      var empty = v == null || v === '' || (Array.isArray(v) && !v.length)
               || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
      if (empty) return;
      var have = rep.room[k];
      var haveEmpty = have == null || have === '' || (Array.isArray(have) && !have.length)
                   || (typeof have === 'object' && !Array.isArray(have) && !Object.keys(have).length);
      if (haveEmpty) rep.room[k] = v;
      else if (JSON.stringify(have) !== JSON.stringify(v)) {
        notes.push(p.id + ': room-scope key "' + k + '" differs from the value already on the room \u2014 room kept');
      }
    });
    var cl = {};
    Object.keys(flat.clState || {}).forEach(function (id) {
      var st = flat.clState[id] || {};
      var hasContent = !!(st.status || st.comment || (st.photos && st.photos.length) || st.customText);
      if (/^s[12]_/.test(id)) { if (hasContent) notes.push(p.id + ': Section 1/2 answer ' + id + ' found in a frame'); return; }
      if (hasContent) cl[id] = st;
    });
    pump._checklist = CL.fileInto(rep, p.id, cl);
  });
  var Own = root.MPDeficiencyOwner;
  if (Own && typeof root.mpDeficLists === 'function') {
    var lists = root.mpDeficLists(), byC = lists.byContractor, gen = lists.general || [];
    rep.deficiencies = { contractors: lists.contractors.slice(), trades: lists.trades, byContractor: byC, general: gen };
    var isDel = function (d) { return !!(d && d.deleted); };
    var un = Own.unassigned(byC, gen, { isDeleted: isDel });
    rep.deficiencyOwnership = { unassigned: un.length, readyToIssue: Own.readyToIssue(byC, gen, rep, { isDeleted: isDel }) };
    if (un.length) notes.push(un.length + ' deficienc' + (un.length > 1 ? 'ies' : 'y') + ' not yet tagged \u2014 cannot issue');
  }
  rep._notes = notes;
  rep._nothingSaves = true;
  return rep;
}

/* The room's "No" answers, for the deficiencies roll-up. */
function roomFindings() {
  var out = [], a = answers[setKey];
  RR.rowsFor(pumps()).forEach(function (row) {
    var targets = row.scope === 'machine' ? row.targets : [null];
    targets.forEach(function (t) {
      var key = RR.answerKey(row, t && t.id);
      if (!a[key] || a[key].status !== 'no') return;
      var who = t ? t.name : (row.scope === 'visit' ? 'VISIT' : 'ROOM');
      out.push({ key: key, rowId: row.id, who: who, num: (row.src || row.id), text: row.text });
    });
  });
  return out;
}
function scrollToRoomRow(key) {
  show('site');
  var el = doc.getElementById('it-' + key);
  if (!el) return;
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.outline = '2px solid var(--arencon)'; el.style.outlineOffset = '2px';
  setTimeout(function () { el.style.outline = ''; el.style.outlineOffset = ''; }, 2200);
}

/* ── one handler for the whole page ──────────────────────────────────── */

doc.addEventListener('click', function (ev) {
  var t = ev.target && ev.target.closest
    ? ev.target.closest('[data-view],[data-set],[data-dec],[data-ans],[data-sheet-btn]') : null;
  if (!t) return;

  if (t.hasAttribute('data-sheet-btn')) {
    var act = _sheetActions[+t.getAttribute('data-sheet-btn')];
    closeSheet(); if (typeof act === 'function') act();
    return;
  }
  if (t.hasAttribute('data-view')) { show(t.getAttribute('data-view')); return; }

  if (t.hasAttribute('data-ans')) {
    var key = t.getAttribute('data-ans'), v = t.getAttribute('data-v');
    var a = answers[setKey];
    if (a[key] && a[key].status === v) delete a[key];
    else a[key] = { status: v, _ts: Date.now() };
    var row = doc.getElementById('it-' + key);
    if (row) {
      ['y', 'n', 'a'].forEach(function (c) {
        var btn = row.querySelector('.yn button.' + c);
        if (btn) btn.classList.toggle('on', (a[key] || {}).status === btn.getAttribute('data-v'));
      });
    }
    drawTabs();
    return;
  }

  if (t.hasAttribute('data-set')) {
    var k = t.getAttribute('data-set');
    if (k === setKey) return;
    /* Destructive: the machines' testing screens are discarded. Confirmed in
       the demo's own sheet, never the browser's dialog. */
    sheet('Change the pumps on this job?',
      '<p>Switching to <b>' + esc(SETS[k].label) + '</b> discards the testing screens that are open and the '
      + 'answers given for the current set. There is no undo on this screen.</p>',
      [{ label: 'Cancel' },
       { label: 'Switch', cls: 'danger', act: function () {
          Object.keys(frames).forEach(function (id) { frames[id].parentNode.remove(); });
          frames = {}; setKey = k; show('site');
        } }]);
    return;
  }

  if (t.hasAttribute('data-dec')) {
    var who = t.getAttribute('data-dec'), out = t.getAttribute('data-out');
    decisions[setKey][who] = (decisions[setKey][who] === out) ? '' : out;
    show('site');
    return;
  }
}, false);

/* A room field typed here reaches every open frame. */
doc.addEventListener('change', function (ev) {
  var t = ev.target;
  if (!t || !t.getAttribute || !t.getAttribute('data-room-id')) return;
  Object.keys(frames).forEach(function (id) { syncRoomIntoFrame(frames[id]); });
}, true);

/* The flag the shipped tools look for. Its presence IS the mode. */
var API = { version: 'S730', collect: collect, frames: function () { return frames; },
            pumps: pumps, sets: SETS, TOOL_FOR: TOOL_FOR, show: show,
            roomFindings: roomFindings, scrollToRoomRow: scrollToRoomRow,
            sheet: sheet, redrawDefic: redrawDefic };
root.MPShell = API;

show('site');

})(window);
