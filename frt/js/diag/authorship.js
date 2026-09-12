// frt/js/diag/authorship.js
// S728 — INTERNAL AUTHORSHIP REPORT (Owner ruling, S728).
//
// WHY THIS EXISTS
//   Authorship is recorded on every entry but is deliberately NOT shown in the
//   contractor thread and NEVER printed on a client report. The Owner's use case
//   is a principal occasionally wanting to see who has been doing the work — not
//   day-to-day visibility, and not something a client or AHJ ever sees.
//
//   So: record silently, surface on request, here and nowhere else.
//
// WHAT IT COUNTS (this report only, all reports for the project if loaded)
//   • ARENCON review comments        — obs.arenconReviews[].author (initials)
//   • Contractor comments typed by us — obs.responses[] where source==='manual'
//   • Deficiencies raised            — defic.createdBy (user id)
//   • Observations added             — obs.createdBy (user id)
//   • Pin markup saved on drawings   — drawing.markupR2.inspectorId (user id)
//   • Report versions issued         — versions[].by (user id)
//
//   Entries written before S728 carry no author — every identity field was
//   silently null until that fix. Those are grouped as "Not recorded (pre-S728)"
//   rather than being attributed to anyone.
//
// REACHED FROM
//   window._frtAuthorshipReport()  → console table, returns the data
//   window._frtAuthorshipPanel()   → on-screen panel (tablet has no console)
//
// This file only READS. It never writes to the model, never syncs, never saves.

(function () {
  'use strict';

  function _getModel() {
    return (typeof window !== 'undefined' && window._frt && window._frt.Model) || null;
  }

  var UNKNOWN = 'Not recorded (pre-S728)';

  function _arr(v) { return Array.isArray(v) ? v : []; }

  // Every deficiency in the project, general + contractor-filed.
  function _allDefics(proj) {
    var out = _arr(proj.generalDeficiencies).slice();
    _arr(proj.contractors).forEach(function (c) {
      _arr(c && c.deficiencies).forEach(function (d) { out.push(d); });
    });
    return out;
  }

  // Collect raw tallies keyed by whatever identifier the field carries.
  // Ids and initials are kept in separate buckets because they resolve differently.
  function collect() {
    var Model = _getModel();
    if (!Model || !Model.getProject) return null;
    var proj = Model.getProject();
    if (!proj) return null;

    var byId = {};        // user id  -> counts
    var byInitials = {};  // initials -> counts (thread comments)

    function bumpId(id, key) {
      var k = id || UNKNOWN;
      if (!byId[k]) byId[k] = { deficiencies: 0, observations: 0, pinMarkup: 0, versions: 0 };
      byId[k][key]++;
    }
    function bumpIni(ini, key) {
      var k = ini || UNKNOWN;
      if (!byInitials[k]) byInitials[k] = { arenconComments: 0, contractorComments: 0 };
      byInitials[k][key]++;
    }

    _allDefics(proj).forEach(function (d) {
      if (!d) return;
      bumpId(d.createdBy, 'deficiencies');
      _arr(d.observations).forEach(function (o) {
        if (!o) return;
        bumpId(o.createdBy, 'observations');
        _arr(o.arenconReviews).forEach(function (e) {
          if (e) bumpIni(e.author, 'arenconComments');
        });
        _arr(o.responses).forEach(function (e) {
          // Only comments WE typed carry an author; a contractor's own submission
          // through the portal is theirs, not ours, and is not counted here.
          if (e && e.source === 'manual') bumpIni(e.author, 'contractorComments');
        });
      });
    });

    _arr(proj.drawings).forEach(function (dw) {
      if (dw && dw.markupR2) bumpId(dw.markupR2.inspectorId, 'pinMarkup');
    });

    _arr(proj.versions).forEach(function (v) {
      if (v) bumpId(v.by, 'versions');
    });

    return { project: proj, byId: byId, byInitials: byInitials };
  }

  // Resolve user ids to names via the same resolver the inspector rings use,
  // then fold the initials-keyed thread counts onto the matching person.
  function build() {
    var raw = collect();
    if (!raw) return null;
    var Model = _getModel();

    var ids = Object.keys(raw.byId).filter(function (k) { return k !== UNKNOWN; });
    try { if (Model.primeInspectors) Model.primeInspectors(ids); } catch (e) {}

    var rows = {};
    function row(name, initials, color) {
      var k = name || initials || UNKNOWN;
      if (!rows[k]) {
        rows[k] = {
          person: k, initials: initials || '\u2014', color: color || null,
          deficiencies: 0, observations: 0, arenconComments: 0,
          contractorComments: 0, pinMarkup: 0, versions: 0
        };
      }
      return rows[k];
    }

    // Map initials -> resolved person, so thread counts land on the same row.
    var iniToPerson = {};
    ids.forEach(function (id) {
      var who = {};
      try { who = Model.resolveInspector(id) || {}; } catch (e) {}
      var name = who.name || who.initials || id;
      var r = row(name, who.initials, who.color);
      var c = raw.byId[id];
      r.deficiencies += c.deficiencies;
      r.observations += c.observations;
      r.pinMarkup    += c.pinMarkup;
      r.versions     += c.versions;
      if (who.initials && who.initials !== '\u2014') iniToPerson[who.initials] = name;
    });

    if (raw.byId[UNKNOWN]) {
      var u = row(UNKNOWN, '\u2014', null), cu = raw.byId[UNKNOWN];
      u.deficiencies += cu.deficiencies;
      u.observations += cu.observations;
      u.pinMarkup    += cu.pinMarkup;
      u.versions     += cu.versions;
    }

    Object.keys(raw.byInitials).forEach(function (ini) {
      var target = (ini === UNKNOWN) ? UNKNOWN : (iniToPerson[ini] || ini);
      var r = row(target, ini === UNKNOWN ? '\u2014' : ini, null);
      r.arenconComments    += raw.byInitials[ini].arenconComments;
      r.contractorComments += raw.byInitials[ini].contractorComments;
    });

    var list = Object.keys(rows).map(function (k) { return rows[k]; });
    var total = function (r) {
      return r.deficiencies + r.observations + r.arenconComments +
             r.contractorComments + r.pinMarkup + r.versions;
    };
    // Unrecorded always sorts last — it is a gap, not a contributor.
    list.sort(function (a, b) {
      if (a.person === UNKNOWN) return 1;
      if (b.person === UNKNOWN) return -1;
      return total(b) - total(a);
    });

    var info = raw.project.info || {};
    return {
      projectNumber: info.projectNumber || '\u2014',
      projectName: info.projectName || '\u2014',
      reportNumber: raw.project.currentFrtInstance || 1,
      generatedAt: new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto' }),
      rows: list,
      totals: list.reduce(function (acc, r) { return acc + total(r); }, 0)
    };
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showPanel() {
    var rpt = build();
    if (!rpt) {
      try { if (window._frt && window._frt.toast) window._frt.toast('No project loaded'); } catch (e) {}
      return;
    }

    var ov = document.createElement('div');
    ov.id = 'authorship-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:16px;' +
      'font-family:Calibri,sans-serif;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#1C2333;max-width:720px;width:100%;' +
      'max-height:82vh;overflow:auto;border-radius:10px;padding:20px 22px;' +
      'box-shadow:0 10px 40px rgba(0,0,0,.3);';

    var h = '';
    h += '<div style="font-size:calc(17px + var(--ts));font-weight:700;margin-bottom:2px;">Who wrote what</div>';
    h += '<div style="font-size:calc(12px + var(--ts));color:#6B7B8C;margin-bottom:4px;">' +
         _esc(rpt.projectNumber) + ' \u00b7 ' + _esc(rpt.projectName) + ' \u00b7 FRT #' + _esc(rpt.reportNumber) + '</div>';
    h += '<div style="font-size:calc(11px + var(--ts));color:#8A94A6;margin-bottom:14px;">' +
         'Internal only \u2014 never printed on a report. Generated ' + _esc(rpt.generatedAt) + ' (Toronto).</div>';

    if (!rpt.rows.length) {
      h += '<div style="color:#6B7B8C;">Nothing recorded on this report yet.</div>';
    } else {
      h += '<table style="width:100%;border-collapse:collapse;font-size:calc(12px + var(--ts));">';
      h += '<thead><tr style="text-align:left;border-bottom:2px solid #E3E6EC;">' +
           '<th style="padding:6px 4px;">Person</th>' +
           '<th style="padding:6px 4px;text-align:right;" title="Deficiencies raised">Defics</th>' +
           '<th style="padding:6px 4px;text-align:right;" title="Observations added">Obs</th>' +
           '<th style="padding:6px 4px;text-align:right;" title="ARENCON review comments">Reviews</th>' +
           '<th style="padding:6px 4px;text-align:right;" title="Contractor comments typed by ARENCON">Ctr notes</th>' +
           '<th style="padding:6px 4px;text-align:right;" title="Drawings with pin markup saved">Markup</th>' +
           '<th style="padding:6px 4px;text-align:right;" title="Report versions issued">Versions</th>' +
           '</tr></thead><tbody>';
      rpt.rows.forEach(function (r) {
        var muted = (r.person === UNKNOWN);
        var dot = r.color
          ? '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
            _esc(r.color) + ';margin-right:7px;vertical-align:middle;"></span>'
          : '';
        h += '<tr style="border-bottom:1px solid #EEF0F4;' + (muted ? 'color:#98A2B3;' : '') + '">';
        h += '<td style="padding:6px 4px;">' + dot + _esc(r.person) + '</td>';
        ['deficiencies','observations','arenconComments','contractorComments','pinMarkup','versions'].forEach(function (k) {
          h += '<td style="padding:6px 4px;text-align:right;">' + (r[k] || '\u2014') + '</td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table>';
      h += '<div style="font-size:calc(11px + var(--ts));color:#8A94A6;margin-top:12px;line-height:1.5;">' +
           'Entries made before the S728 fix carry no identity \u2014 every field was silently blank until then, ' +
           'so those are grouped rather than attributed.</div>';
    }
    card.innerHTML = h;

    var foot = document.createElement('div');
    foot.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:18px;';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'padding:8px 22px;background:#455A64;color:#fff;border:none;' +
      'border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts));cursor:pointer;';
    closeBtn.addEventListener('click', function () { if (ov.parentNode) ov.parentNode.removeChild(ov); });
    foot.appendChild(closeBtn);
    card.appendChild(foot);

    ov.appendChild(card);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.parentNode.removeChild(ov); });
    document.body.appendChild(ov);
  }

  function _bootstrap() {
    window._frtAuthorshipPanel = showPanel;
    window._frtAuthorshipReport = function () {
      var rpt = build();
      if (!rpt) { console.warn('[Authorship] no project loaded'); return null; }
      console.group('[Authorship] ' + rpt.projectNumber + ' FRT #' + rpt.reportNumber);
      console.table(rpt.rows);
      console.groupEnd();
      return rpt;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootstrap);
  } else {
    _bootstrap();
  }
})();
