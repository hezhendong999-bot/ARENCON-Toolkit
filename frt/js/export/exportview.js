/**
 * ARENCON FRT v2 — Export Report View  (S145 Phase 5)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Replaces the cramped legacy PDF picker modal (_openPDFPicker in
 * app.js — kept as a dead fallback). Adds:
 *   • Role-grouped Distribution (Owner / Contractors / Other recipients),
 *     each card in its own muted colour; pooled click-toggle, Add all /
 *     Remove all. Site Records is never a recipient. Persists to
 *     proj.distribution[].
 *   • Plain-language Scope. The Recommendations dropdown wording is
 *     Mark's exact text (S145 P3).
 *   • Editable report title persisting to proj.info.reportTitleOverride
 *     (pdf.js reads exactly this); the #N is automatic and locked.
 *
 * Functional parity with the legacy picker is exact: it builds the same
 * initPDFExport.generate(type, opts) call with the same opts shape, the
 * same renumber-before-export side-effect, and the same untagged-trade
 * control. No app.js import (no circular dependency).
 */

import { Model, isSiteRecordsName } from '../data/model.js';
import { initPDFExport } from './pdf.js';
import { initDeficiencies } from '../ui/deficiencies.js';
import { toast } from '../shared/toast.js';
import { lockScroll, unlockScroll } from '../shared/scrollLock.js';
import { Auth } from '../shared/auth.js';
import { esc as _esc } from '../lib/esc.js'; // S453: shared HTML-escape (was local; byte-identical)

// Replicated verbatim from app.js _countUntaggedForBand (pure fn; copied
// rather than imported to avoid an app.js <-> exportview.js cycle).
function _countUntaggedForBand(proj) {
  var n = 0;
  function ptrade(d) { return (d && d.observations && d.observations[0] && d.observations[0].trade) || ''; }
  (proj.contractors || []).forEach(function(c) {
    (c.deficiencies || []).forEach(function(d) { if (!ptrade(d)) n++; });
  });
  (proj.generalDeficiencies || []).forEach(function(d) {
    if (!ptrade(d) && !(d && d.isRecommendation)) n++;
  });
  return n;
}

var OWNER_C = '#3E4C66';
var ADDED_C = '#6B7280';

// _esc() imported (aliased) from ../lib/esc.js (S453 — shared, byte-identical)

// In-DOM internal-report confirm (never browser confirm/alert). Two actions:
// Cancel (dismiss) / Generate internal PDF (proceed). Burgundy header per Bold.
function _showInternalConfirm(host, onProceed) {
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Calibri,sans-serif;';
  ov.innerHTML =
    '<div style="max-width:420px;width:100%;background:var(--card,#fff);color:var(--fg,#1C2333);border:1px solid var(--border,#D5DBE3);border-radius:14px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.35);">'
    + '<div style="background:#9C2742;color:#fff;padding:14px 20px;font-size:15px;font-weight:700;display:flex;align-items:center;gap:9px;">&#9888; Internal report</div>'
    + '<div style="padding:20px;">'
    + '<div style="font-size:14px;line-height:1.55;">You\u2019re generating a <b>Site Records \u2014 Internal</b> report. It contains internal site records only, carries no distribution list, and is marked <b>not for external issue</b> on page 1.</div>'
    + '<div style="font-size:13px;color:var(--steel,#5E5B68);margin-top:12px;">Do not send this document to a client, contractor, or AHJ.</div>'
    + '</div>'
    + '<div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--border,#E4E8EE);background:var(--smoke,#F7F9FB);">'
    + '<button id="_ic-cancel" style="padding:9px 18px;border:1px solid var(--border,#D5DBE3);background:var(--card,#fff);color:#5E5B68;border-radius:8px;font-family:Calibri,sans-serif;font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>'
    + '<button id="_ic-go" style="padding:9px 20px;border:0;background:#9C2742;color:#fff;border-radius:8px;font-family:Calibri,sans-serif;font-size:14px;font-weight:700;cursor:pointer;">&#128196; Generate internal PDF</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  lockScroll();
  function done(){ ov.remove(); unlockScroll(); }
  ov.querySelector('#_ic-cancel').addEventListener('click', done);
  ov.addEventListener('click', function(e){ if (e.target === ov) done(); });
  ov.querySelector('#_ic-go').addEventListener('click', function(){ done(); onProceed(); });
}

function _styleOnce() {
  if (document.getElementById('exv-style')) return;
  var st = document.createElement('style');
  st.id = 'exv-style';
  st.textContent = [
    '#exv-ov{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;overflow:auto;padding:18px 14px;font-family:Calibri,sans-serif;}',
    '.exv-w{background:var(--bg,#fff);color:var(--fg,#1C2333);width:100%;max-width:1060px;max-height:calc(100vh - 36px);display:flex;flex-direction:column;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.3);}',
    '.exv-h{flex:none;background:linear-gradient(135deg,#1B2438,#243048);color:#fff;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;}',
    '.exv-h .t{font-size:calc(18px + var(--ts,0px));font-weight:700;letter-spacing:.3px;}',
    '.exv-h .s{font-size:calc(12px + var(--ts,0px));color:#9FB0CC;margin-top:2px;}',
    '.exv-h .x{color:#9FB0CC;font-size:20px;cursor:pointer;border:0;background:none;}',
    '.exv-b{flex:1 1 auto;min-height:0;overflow-y:auto;padding:18px 24px;}',
    '.exv-cols{display:grid;grid-template-columns:1.15fr 1fr;gap:24px;}',
    '@media(max-width:820px){.exv-cols{grid-template-columns:1fr;}}',
    '.exv-sec{margin-bottom:16px;}',
    '.exv-eb{font-size:calc(11px + var(--ts,0px));font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#928E9C;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;}',
    '.exv-fld{margin-bottom:12px;}',
    '.exv-fld label{display:block;font-size:calc(12.5px + var(--ts,0px));font-weight:600;color:var(--steel,#4A5568);margin-bottom:4px;}',
    '.exv-fld select,.exv-fld input[type=text]{width:100%;padding:8px 10px;border:1.5px solid var(--border,#D5DBE3);border-radius:7px;font-family:Calibri,sans-serif;font-size:calc(13.5px + var(--ts,0px));background:var(--card,#fff);color:var(--fg,#1C2333);}',
    /* ── merged roster (icon table) ── */
    '.exv-tbl{border:1px solid var(--border,#D5DBE3);border-radius:10px;overflow:hidden;transition:opacity .2s;}',
    '.exv-tbl.greyed{opacity:.4;pointer-events:none;filter:grayscale(.5);}',
    '.exv-tr{display:grid;grid-template-columns:1fr 62px 74px 28px;align-items:center;border-bottom:1px solid var(--border,#E4E8EE);}',
    '.exv-tr:last-child{border-bottom:none;}',
    '.exv-tr.h{background:var(--smoke,#F0EDE6);font-size:calc(9.5px + var(--ts,0px));font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#928E9C;}',
    '.exv-tr.h .c{text-align:center;padding:7px 0;}',
    '.exv-tr .nm{padding:8px 12px;font-size:calc(13px + var(--ts,0px));font-weight:600;display:flex;align-items:center;gap:8px;min-width:0;color:var(--fg,#1C2333);}',
    '.exv-tr .nm .txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.exv-tr .c{display:flex;justify-content:center;padding:7px 0;cursor:pointer;}',
    '.exv-ic{width:26px;height:26px;border-radius:7px;border:1.5px solid var(--border,#D5DBE3);display:flex;align-items:center;justify-content:center;color:#928E9C;font-size:calc(13px + var(--ts,0px));background:var(--card,#fff);transition:all .12s;}',
    '.exv-ic.on.rep{background:rgba(44,71,112,.12);border-color:rgba(44,71,112,.45);color:#2C4770;}',
    '.exv-ic.on.rec{background:rgba(46,158,114,.14);border-color:#2E9E72;color:#2E9E72;}',
    '.exv-ic.lk{opacity:.7;cursor:not-allowed;}',
    '.exv-grp{font-size:calc(9.5px + var(--ts,0px));font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#928E9C;padding:7px 12px 4px;background:var(--smoke,#F0EDE6);}',
    '.exv-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;}',
    '.exv-rb{font-size:calc(8.5px + var(--ts,0px));text-transform:uppercase;letter-spacing:.4px;color:#928E9C;font-weight:700;}',
    '.exv-del{display:flex;justify-content:center;color:#928E9C;font-size:calc(14px + var(--ts,0px));cursor:pointer;}',
    '.exv-del:hover{color:#C0445F;}',
    '.exv-lk{display:flex;justify-content:center;color:#928E9C;font-size:calc(11px + var(--ts,0px));}',
    '@media(pointer:coarse){.exv-tr{grid-template-columns:1fr 62px 74px 34px;}.exv-del,.exv-lk{min-width:34px;}}',
    '.exv-mini{display:flex;gap:6px;}',
    '.exv-mini button{font-size:calc(10px + var(--ts,0px));font-weight:700;text-transform:uppercase;letter-spacing:.3px;border:1px solid var(--border,#D5DBE3);background:var(--card,#fff);color:#5E5B68;border-radius:5px;padding:3px 8px;cursor:pointer;}',
    '.exv-add{display:flex;gap:8px;margin-top:10px;}',
    '.exv-add input{flex:1;padding:8px 11px;border:1.5px dashed var(--border,#C5CEDB);border-radius:7px;font-family:Calibri,sans-serif;font-size:calc(12.5px + var(--ts,0px));background:var(--card,#fff);color:var(--fg,#1C2333);}',
    '.exv-add button{font-size:calc(12px + var(--ts,0px));font-weight:700;border:1.5px solid rgba(44,71,112,.4);background:rgba(44,71,112,.10);color:#2C4770;border-radius:7px;padding:0 14px;cursor:pointer;white-space:nowrap;}',
    '.exv-prev{margin-top:10px;border:1px solid var(--border,#E4E8EE);border-radius:8px;background:var(--smoke,#F0EDE6);padding:9px 12px;}',
    '.exv-prev.internal{border-color:#9C2742;background:rgba(156,39,66,.08);}',
    '.exv-prev .lbl{font-size:calc(9.5px + var(--ts,0px));font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#928E9C;margin-bottom:3px;}',
    '.exv-prev.internal .lbl{color:#9C2742;}',
    '.exv-prev .names{font-size:calc(12.5px + var(--ts,0px));color:var(--fg,#1C2333);line-height:1.4;}',
    /* ── options / summary ── */
    '.exv-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;}',
    '.exv-chk{display:flex;align-items:center;gap:8px;font-size:calc(12.5px + var(--ts,0px));color:var(--fg,#33415C);cursor:pointer;}',
    '.exv-chk input{width:15px;height:15px;}',
    '.exv-summary{border:1px solid var(--border,#E4E8EE);border-radius:10px;background:var(--smoke,#F0EDE6);padding:10px 14px;}',
    '.exv-summary .row{display:flex;justify-content:space-between;font-size:calc(12.5px + var(--ts,0px));padding:4px 0;border-bottom:1px solid var(--border,#E4E8EE);}',
    '.exv-summary .row:last-child{border-bottom:none;}',
    '.exv-summary .row .v{font-weight:700;font-variant-numeric:tabular-nums;color:var(--fg,#1C2333);}',
    '.exv-summary .k{color:var(--steel,#5E5B68);}',
    /* ── internal mode bar ── */
    '.exv-modebar{display:flex;align-items:center;gap:10px;background:rgba(156,39,66,.08);border:1px solid #9C2742;border-radius:9px;padding:9px 13px;margin-bottom:16px;font-size:calc(12.5px + var(--ts,0px));color:#9C2742;font-weight:600;}',
    /* ── untagged ── */
    '.exv-ut{margin-top:12px;padding:10px 12px;border:1px solid var(--border,#E4E8EE);border-radius:7px;}',
    '.exv-ut .uh{font-weight:600;font-size:calc(13px + var(--ts,0px));color:var(--steel,#4A5568);margin-bottom:6px;}',
    '.exv-ut label{display:flex;align-items:center;gap:8px;font-size:calc(13px + var(--ts,0px));cursor:pointer;margin-bottom:5px;}',
    /* ── footer ── */
    '.exv-f{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 24px;border-top:1px solid var(--border,#E4E8EE);background:var(--card,#FAFBFC);}',
    '.exv-count{font-size:calc(12px + var(--ts,0px));color:var(--steel,#5E5B68);}',
    '.exv-count b{color:var(--fg,#1C2333);font-variant-numeric:tabular-nums;}',
    '.exv-count.internal{color:#9C2742;font-weight:700;}',
    '.exv-acts{display:flex;gap:10px;}',
    '.exv-cancel{padding:9px 18px;border:1px solid var(--border,#D5DBE3);background:var(--card,#fff);color:#5E5B68;border-radius:8px;font-size:calc(13px + var(--ts,0px));font-weight:700;cursor:pointer;}',
    '.exv-go{padding:9px 20px;border:0;background:#243048;color:#fff;border-radius:8px;font-size:calc(14px + var(--ts,0px));font-weight:700;cursor:pointer;letter-spacing:.2px;}',
    '.exv-go:hover{background:#1B2438;}',
    '.exv-go.internal{background:#9C2742;}',
    '.exv-go:disabled{opacity:.5;cursor:not-allowed;}'
  ].join('');
  document.head.appendChild(st);
}

export var initExportView = {

  open: function() {
    // S462: idempotent — if the modal is already open, never stack a second
    // copy (double-wired buttons previously opened two overlays per click).
    if (document.getElementById('exv-ov')) return;
    var proj = Model.getProject();
    if (!proj) return;
    _styleOnce();

    var info = proj.info || {};
    var rptNum = proj.currentFrtInstance || 1;

    // ── Roster model ──────────────────────────────────────────────
    // ONE merged roster: contractors only (Site Records is NOT a contractor
    // and is governed solely by the Site-Records-internal switch). Each row
    // carries TWO independent states:
    //   • deficiency (rep) — is this contractor's items IN the report → drives ctrFilter
    //   • distribution (rec) — is this recipient ON the distribution list → p.distribution
    // Owner: distribution-only, LOCKED on, always first, no delete.
    // Default link: a contractor ON for deficiency is ON for distribution too;
    // either can be toggled after. p.distribution (saved) restores distribution
    // state when present.
    var _ctrPalette = ['#9C2742','#2C7FB8','#C98A4A','#2E9E72','#7A5EA8','#C0445F'];
    var ownerName = (info.client && String(info.client).trim()) || '';
    var _rawCtr = (proj.contractors || []);
    // Contractors only, de-duplicated by name (a contractor covering two trades
    // must appear ONCE), Site Records excluded.
    var _seen = {};
    var ctrList = [];
    _rawCtr.forEach(function(c, i){
      var nm = (c.name || '').trim();
      if (!nm || isSiteRecordsName(nm)) return;
      if (_seen[nm]) return;
      _seen[nm] = 1;
      ctrList.push({ id: c.id, name: nm, color: c.color || _ctrPalette[i % _ctrPalette.length],
                     count: (c.deficiencies || []).length });
    });

    var savedDist = Array.isArray(proj.distribution) ? proj.distribution.slice() : null;
    var roleNames = {};
    if (ownerName) roleNames[ownerName] = 1;
    ctrList.forEach(function(c){ roleNames[c.name] = 1; });
    var addedNames = (savedDist || []).filter(function(n){ return n && !roleNames[n]; });

    // distribution default: if saved set exists use it; else owner + all contractors on.
    function distOn(name){
      if (savedDist) return savedDist.indexOf(name) >= 0;
      return true;
    }

    // ── Summary counts (This report will include…) ────────────────
    var _allDefs = (Model.getAllDeficiencies ? Model.getAllDeficiencies(proj) : []) || [];
    var _photoCount = 0, _siteRecCount = 0;
    try {
      _allDefs.forEach(function(rec){
        var d = rec.defic || rec;
        (d.photos || []).forEach(function(p){ if (p && !p.deleted) _photoCount++; });
      });
    } catch(_e){}
    try { (proj.photos || []).forEach(function(p){ if (p && !p.deleted) _siteRecCount++; }); } catch(_e){}
    var _drawCount = (proj.drawings || []).length;
    var _deficCount = _allDefs.length;

    // ── Roster HTML ───────────────────────────────────────────────
    function rosterRow(name, color, count, opts){
      opts = opts || {};
      var repOn = opts.repOn, recOn = opts.recOn, locked = opts.locked, added = opts.added, showCount = opts.showCount;
      var repCell = opts.noRep
        ? '<div class="c"></div>'
        : '<div class="c" data-act="rep"><span class="exv-ic rep' + (repOn?' on':'') + '">&#10003;</span></div>';
      var recCell = locked
        ? '<div class="c"><span class="exv-ic rec on lk" title="Owner is always on distribution">&#10148;</span></div>'
        : '<div class="c" data-act="rec"><span class="exv-ic rec' + (recOn?' on':'') + '">&#10148;</span></div>';
      var lastCell = added
        ? '<div class="exv-del" data-act="del" title="Remove recipient">&#215;</div>'
        : (locked ? '<div class="exv-lk" title="Locked">&#128274;</div>' : '<div></div>');
      var ctBadge = (showCount && !opts.noRep) ? '' : '';
      return '<div class="exv-tr" data-n="' + _esc(name) + '"'
        + (opts.ctrId ? ' data-cid="' + _esc(opts.ctrId) + '"' : '')
        + (added ? ' data-added="1"' : '')
        + (locked ? ' data-owner="1"' : '')
        + '>'
        + '<div class="nm">' + (color ? '<span class="exv-dot" style="background:' + color + '"></span>' : '')
        + '<span class="txt">' + _esc(name) + '</span>'
        + (opts.roleBadge ? ' <span class="exv-rb">' + _esc(opts.roleBadge) + '</span>' : '')
        + '</div>'
        + repCell + recCell + lastCell + '</div>';
    }

    var rosterHtml = '<div class="exv-tbl" id="exv-roster">';
    rosterHtml += '<div class="exv-tr h"><div class="nm" style="padding:7px 12px;">Name</div>'
      + '<div class="c">Deficiency</div><div class="c">Distribution</div><div class="c"></div></div>';
    if (ownerName) {
      rosterHtml += '<div class="exv-grp">Owner</div>';
      rosterHtml += rosterRow(ownerName, '#928E9C', 0, { noRep:true, recOn:true, locked:true, roleBadge:'Owner' });
    }
    if (ctrList.length) {
      rosterHtml += '<div class="exv-grp">Contractors</div>';
      ctrList.forEach(function(c){
        rosterHtml += rosterRow(c.name, c.color, c.count, { repOn:true, recOn:distOn(c.name), ctrId:c.id, showCount:true });
      });
    }
    if (addedNames.length) {
      rosterHtml += '<div class="exv-grp" id="exv-addgrp">Other recipients</div>';
      addedNames.forEach(function(n){
        rosterHtml += rosterRow(n, '#7A8699', 0, { noRep:true, recOn:true, added:true, roleBadge:'Added' });
      });
    }
    rosterHtml += '</div>';
    rosterHtml += '<input type="hidden" id="exv-ctr" value="__all__">';

    var utc = _countUntaggedForBand(proj);

    // ── Build modal ───────────────────────────────────────────────
    var h = '<div id="exv-ov"><div class="exv-w">';
    h += '<div class="exv-h"><div><div class="t">Export Report</div>'
      + '<div class="s">' + _esc(Model.getSmartFilename ? Model.getSmartFilename() : (info.projectName || '')) + '</div></div>'
      + '<button class="x" id="exv-x" title="Close">&#10005;</button></div>';
    h += '<div class="exv-b">';

    // internal mode bar (hidden unless Site Records only)
    h += '<div class="exv-modebar" id="exv-modebar" style="display:none;">&#128274; Internal mode \u2014 Site Records only. Not for external issue; distribution suppressed.</div>';

    h += '<div class="exv-cols">';

    // LEFT: roster + add + preview
    h += '<div>';
    h += '<div class="exv-eb"><span>Contractors &amp; recipients</span>'
      + '<span class="exv-mini"><button id="exv-all">All</button><button id="exv-none">None</button></span></div>';
    h += rosterHtml;
    h += '<div class="exv-add"><input type="text" id="exv-newrec" placeholder="Add a recipient \u2014 e.g. base-building contractor, PM\u2026">'
      + '<button id="exv-addbtn">+ Add to pool</button></div>';
    h += '<div class="exv-prev" id="exv-prevbox"><div class="lbl">Distribution line</div><div class="names" id="exv-prevnames"></div></div>';
    h += '</div>';

    // RIGHT: scope + options + summary
    h += '<div>';
    h += '<div class="exv-eb">Scope</div>';
    h += '<div class="exv-fld"><label>Recommendations</label><select id="exv-recs">'
      + '<option value="bottom">Full report (deficiencies + recommendations)</option>'
      + '<option value="only">Recommendations only</option>'
      + '<option value="exclude">Exclude recommendations</option></select></div>';
    h += '<div class="exv-fld"><label>Drawings</label><select id="exv-type">'
      + '<option value="field">Include mini-maps and drawing appendices</option>'
      + '<option value="plain">Report only \u2014 no drawings</option></select></div>';
    h += '<div class="exv-fld" id="exv-drawpage-fld"><label>Drawing sheet size</label><select id="exv-drawpage">'
      + '<option value="11x17">11\u00D717 landscape</option>'
      + '<option value="letter">Letter portrait</option>'
      + '<option value="24x36">24\u00D736 landscape</option></select></div>';
    h += '<div class="exv-eb" style="margin-top:14px;">Options</div>';
    // S479i: _crbAdmin restored — Mark's preview diagnostic is back (S479h
    // wrongly retired it as a scope expansion; the tool is how Mark checks
    // the response-section look on demand).
    var _crbAdmin=false; try{_crbAdmin=!!(Auth&&Auth.isAdmin&&Auth.isAdmin());}catch(_e){}
    h += '<div class="exv-opts">'
      + '<label class="exv-chk"><input type="checkbox" id="exv-final"> Final commissioning</label>'
      + '<label class="exv-chk"><input type="checkbox" id="exv-closed" checked> Closed Items Summary</label>'
      + '<label class="exv-chk"><input type="checkbox" id="exv-siterec"> Site Records only (internal)</label>'
      + '<label class="exv-chk"><input type="checkbox" id="exv-renum" checked> Renumber before export</label>'
      // S479h (Mark): there is NO live-CRB checkbox — the contractor response
      // box is part of what an ARENCON report IS ("user should not be able to
      // pdf without it"). Live is hard-wired ON at generate time.
      // S479i (Mark): the admin-only PREVIEW checkbox is RESTORED — S479h
      // wrongly retired it. New semantics fitting the always-on world: ticked,
      // the report renders the SAMPLE thread instead of real data, so Mark can
      // check the response-section look on any project. Unticked (and for all
      // non-admins, always): real data, no switch.
      + (_crbAdmin ? '<label class="exv-chk"><input type="checkbox" id="exv-crbpreview"> Contractor Response \u2014 preview (sample thread, admin)</label>' : '')
      + '</div>';
    // untagged control (parity)
    if (utc > 0) {
      h += '<div class="exv-ut" id="exv-ut-wrap"><div class="uh">Items with no trade (' + utc + ')</div>'
        + '<label><input type="radio" name="exv-ut" value="show" checked> Show as \u201COther Trade Items\u201d band</label>'
        + '<label><input type="radio" name="exv-ut" value="exclude"> Exclude from report</label></div>';
    }
    h += '<div class="exv-eb" style="margin-top:14px;">This report will include</div>';
    h += '<div class="exv-summary" id="exv-summary">'
      + '<div class="row"><span class="k" id="exv-sum-k1">Deficiencies</span><span class="v" id="exv-sum-v1">' + _deficCount + '</span></div>'
      + '<div class="row"><span class="k">Photos</span><span class="v">' + _photoCount + '</span></div>'
      + '<div class="row"><span class="k">Drawings</span><span class="v">' + _drawCount + '</span></div>'
      + '<div class="row"><span class="k" id="exv-sum-k4">Site records</span><span class="v" id="exv-sum-v4">' + _siteRecCount + '</span></div>'
      + '</div>';
    h += '</div>'; // right col
    h += '</div>'; // cols
    h += '</div>'; // exv-b

    h += '<div class="exv-f">'
      + '<span class="exv-count" id="exv-count"></span>'
      + '<div class="exv-acts"><button class="exv-cancel" id="exv-cancel">Cancel</button>'
      + '<button class="exv-go" id="exv-go">\uD83D\uDCC4 Generate PDF</button></div></div>';

    h += '</div></div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = h;
    var ov = wrap.firstChild;
    document.body.appendChild(ov);
    lockScroll();
    (function(){ var _r = false, _o = ov.remove.bind(ov);
      ov.remove = function(){ if (_r) return _o(); _r = true; _o(); unlockScroll(); }; })();

    var rosterEl = ov.querySelector('#exv-roster');
    var hidden = ov.querySelector('#exv-ctr');
    var goBtn = ov.querySelector('#exv-go');
    var prevNames = ov.querySelector('#exv-prevnames');
    var prevBox = ov.querySelector('#exv-prevbox');
    var countEl = ov.querySelector('#exv-count');
    var modeBar = ov.querySelector('#exv-modebar');
    var siterecEl = ov.querySelector('#exv-siterec');

    // drawing-sheet-size visibility follows Drawings selector
    (function(){
      var _typeEl = ov.querySelector('#exv-type');
      var _dpFld = ov.querySelector('#exv-drawpage-fld');
      if (_typeEl && _dpFld) {
        var _syncDp = function(){ _dpFld.style.display = (_typeEl.value === 'field') ? '' : 'none'; };
        _typeEl.addEventListener('change', _syncDp); _syncDp();
      }
    })();

    // ── derive ctrFilter from the Deficiency column ──
    function ctrRows(){ return Array.prototype.slice.call(rosterEl.querySelectorAll('.exv-tr[data-cid]')); }
    function resolveCtrFilter(){
      var rows = ctrRows();
      var on = rows.filter(function(r){ return r.querySelector('[data-act="rep"] .exv-ic').classList.contains('on'); });
      var val;
      if (rows.length && on.length === rows.length) val = '__all__';
      else if (on.length === 0) val = ''; // nothing selected -> block
      else val = on.map(function(r){ return r.getAttribute('data-cid'); }).join(',');
      hidden.value = val;
      return val;
    }
    // ── distribution names from the Distribution column ──
    function distNames(){
      return Array.prototype.slice.call(rosterEl.querySelectorAll('.exv-tr'))
        .filter(function(r){ var ic = r.querySelector('[data-act="rec"] .exv-ic, .exv-ic.rec.lk'); return ic && ic.classList.contains('on'); })
        .map(function(r){ return r.getAttribute('data-n'); })
        .filter(Boolean);
    }
    function ownerFirst(names){
      if (!ownerName) return names;
      var rest = names.filter(function(n){ return n !== ownerName; });
      return (names.indexOf(ownerName) >= 0 ? [ownerName] : []).concat(rest);
    }
    function isInternal(){ return siterecEl.checked; }

    function refresh(){
      var internal = isInternal();
      // internal mode: grey roster, suppress distribution, swap summary emphasis, burgundy button
      rosterEl.classList.toggle('greyed', internal);
      ov.querySelector('#exv-newrec').disabled = internal;
      ov.querySelector('#exv-addbtn').disabled = internal;
      modeBar.style.display = internal ? '' : 'none';
      var repFilter = resolveCtrFilter();
      var names = ownerFirst(distNames());
      if (internal) {
        prevBox.classList.add('internal');
        prevBox.querySelector('.lbl').textContent = 'Distribution \u2014 suppressed';
        prevNames.innerHTML = '<i>Internal \u2014 ARENCON only. Not issued to any external party.</i>';
        countEl.className = 'exv-count internal';
        countEl.innerHTML = '\uD83D\uDC12 Internal \u2014 no distribution';
        goBtn.classList.add('internal');
        goBtn.innerHTML = '\uD83D\uDCC4 Generate internal PDF';
        goBtn.disabled = false; goBtn.style.opacity = ''; goBtn.style.cursor = '';
      } else {
        prevBox.classList.remove('internal');
        prevBox.querySelector('.lbl').textContent = 'Distribution line';
        prevNames.textContent = names.length ? names.join(', ') : '(none selected)';
        var repCount = ctrRows().filter(function(r){ return r.querySelector('[data-act="rep"] .exv-ic').classList.contains('on'); }).length;
        countEl.className = 'exv-count';
        countEl.innerHTML = '<b>' + repCount + '</b> deficiency \u00B7 <b>' + names.length + '</b> distribution';
        goBtn.classList.remove('internal');
        goBtn.innerHTML = '\uD83D\uDCC4 Generate PDF';
        var none = (repFilter === '');
        goBtn.disabled = none; goBtn.style.opacity = none ? '0.5' : ''; goBtn.style.cursor = none ? 'not-allowed' : '';
      }
    }

    // roster click: toggle rep/rec, delete added, default-link rep→rec
    rosterEl.addEventListener('click', function(e){
      if (rosterEl.classList.contains('greyed')) return;
      var cell = e.target.closest('[data-act]');
      if (!cell) return;
      var row = cell.closest('.exv-tr');
      var act = cell.getAttribute('data-act');
      if (act === 'del') {
        row.remove(); refresh(); return;
      }
      var ic = cell.querySelector('.exv-ic');
      if (!ic || ic.classList.contains('lk')) return;
      var turnOn = !ic.classList.contains('on');
      ic.classList.toggle('on', turnOn);
      // default link (both directions): turning Deficiency ON adds Distribution;
      // turning Deficiency OFF removes Distribution. Either overridable after.
      if (act === 'rep') {
        var recIc = row.querySelector('[data-act="rec"] .exv-ic');
        if (recIc && !recIc.classList.contains('lk')) {
          recIc.classList.toggle('on', turnOn);
        }
      }
      refresh();
    });

    ov.querySelector('#exv-all').addEventListener('click', function(){
      if (rosterEl.classList.contains('greyed')) return;
      ctrRows().forEach(function(r){
        r.querySelector('[data-act="rep"] .exv-ic').classList.add('on');
        var rec = r.querySelector('[data-act="rec"] .exv-ic'); if (rec) rec.classList.add('on');
      });
      refresh();
    });
    ov.querySelector('#exv-none').addEventListener('click', function(){
      if (rosterEl.classList.contains('greyed')) return;
      ctrRows().forEach(function(r){
        r.querySelector('[data-act="rep"] .exv-ic').classList.remove('on');
        var rec = r.querySelector('[data-act="rec"] .exv-ic');
        if (rec && !rec.classList.contains('lk')) rec.classList.remove('on');
      });
      refresh();
    });

    function addRecipient(){
      var i = ov.querySelector('#exv-newrec');
      var v = (i.value || '').trim();
      if (!v) return;
      var grp = ov.querySelector('#exv-addgrp');
      if (!grp) {
        grp = document.createElement('div'); grp.className = 'exv-grp'; grp.id = 'exv-addgrp';
        grp.textContent = 'Other recipients';
        rosterEl.appendChild(grp);
      }
      var rowHtml = rosterRow(v, '#7A8699', 0, { noRep:true, recOn:true, added:true, roleBadge:'Added' });
      var tmp = document.createElement('div'); tmp.innerHTML = rowHtml;
      rosterEl.appendChild(tmp.firstChild);
      i.value = ''; i.focus(); refresh();
    }
    ov.querySelector('#exv-addbtn').addEventListener('click', addRecipient);
    ov.querySelector('#exv-newrec').addEventListener('keydown', function(e){ if (e.key === 'Enter') addRecipient(); });

    siterecEl.addEventListener('change', function(){
      // internal mode swaps the summary's first row emphasis
      var k1 = ov.querySelector('#exv-sum-k1');
      if (isInternal()) { k1.textContent = 'Site records only'; }
      else { k1.textContent = 'Deficiencies'; }
      refresh();
    });

    function close(){ ov.remove(); }
    ov.querySelector('#exv-cancel').addEventListener('click', close);
    ov.querySelector('#exv-x').addEventListener('click', close);

    ov.querySelector('#exv-go').addEventListener('click', function(){
      var internal = isInternal();
      var type = ov.querySelector('#exv-type').value;
      var ctrFilter = internal ? '__general__' : resolveCtrFilter();
      var isFinalComm = ov.querySelector('#exv-final').checked;
      var showClosedSummary = ov.querySelector('#exv-closed').checked;
      var recsMode = ov.querySelector('#exv-recs').value || 'bottom';
      var recFooter = true;
      var includeSiteRecords = internal ? true : false;
      var inspTag = 'off';
      var doRenumber = ov.querySelector('#exv-renum').checked;
      var utEl = ov.querySelector('input[name="exv-ut"]:checked');
      var untaggedMode = utEl ? utEl.value : 'show';
      var _dpEl = ov.querySelector('#exv-drawpage');
      var drawingPageSize = (type === 'field' && _dpEl) ? (_dpEl.value || '11x17') : '11x17';

      // internal-mode confirm safeguard — in-DOM modal (never browser confirm)
      if (internal) {
        _showInternalConfirm(ov, function(){ _doGenerate(); });
        return;
      }
      _doGenerate();

      function _doGenerate(){
      var p = Model.getProject();
      if (p) {
        // internal report has NO external distribution
        p.distribution = internal ? [] : ownerFirst(distNames());
        if (Model.saveNow) Model.saveNow();
      }

      if (doRenumber) {
        var rc = Model.renumberDeficiencies();
        if (rc > 0) {
          if (initDeficiencies && initDeficiencies.render) initDeficiencies.render();
          if (window._frtRenderTasks) window._frtRenderTasks();
        }
      }

      // CRB live (real obs.responses[]/arenconReviews[]) takes precedence over the
      // sample preview in _buildDefCard. Both flags are set; when live is on we also
      // force preview off so the export options read unambiguously (real vs sample).
      // S479i: real data is unconditional for everyone — EXCEPT when an admin
      // explicitly ticks preview, which swaps in the sample thread (the look-
      // check tool). Implemented by flipping the pair, so pdf.js's existing
      // live/else-preview precedence renders the right path with zero changes.
      var _pvOn = !!(ov.querySelector('#exv-crbpreview') && ov.querySelector('#exv-crbpreview').checked);
      window._frtCrbLive = !_pvOn;
      window._frtCrbPreview = _pvOn;
      initPDFExport.generate(type, {
        ctrFilter: ctrFilter,
        isFinalComm: isFinalComm,
        showClosedSummary: showClosedSummary,
        recsMode: recsMode,
        recFooter: recFooter,
        includeSiteRecords: includeSiteRecords,
        internalMode: internal,
        inspTag: inspTag,
        untaggedMode: untaggedMode,
        drawingPageSize: drawingPageSize
      });
      }
    });

    refresh();
  }
};
