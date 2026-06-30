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

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function _styleOnce() {
  if (document.getElementById('exv-style')) return;
  var st = document.createElement('style');
  st.id = 'exv-style';
  st.textContent = [
    '#exv-ov{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;overflow:auto;padding:18px 14px;font-family:Calibri,sans-serif;}',
    '.exv-w{background:var(--bg,#fff);color:var(--fg,#1C2333);width:100%;max-width:1060px;max-height:calc(100vh - 36px);display:flex;flex-direction:column;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.3);}',
    '.exv-h{flex:none;background:linear-gradient(135deg,#1B2438,#243048);color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;}',
    '.exv-h .t{font-size:calc(18px + var(--ts,0px));font-weight:700;letter-spacing:.3px;}',
    '.exv-h .s{font-size:calc(12px + var(--ts,0px));color:#9FB0CC;margin-top:2px;}',
    '.exv-h .x{color:#9FB0CC;font-size:20px;cursor:pointer;border:0;background:none;}',
    '.exv-b{flex:1 1 auto;min-height:0;overflow-y:auto;padding:18px 24px;}',
    '.exv-sec{margin-bottom:16px;}',
    '.exv-sh{font-size:calc(13px + var(--ts,0px));font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#4F6788;margin-bottom:8px;border-bottom:1px solid var(--border,#E4E8EE);padding-bottom:5px;display:flex;justify-content:space-between;align-items:center;}',
    '.exv-bulk{display:flex;gap:6px;}',
    '.exv-bulk button{font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts,0px));font-weight:700;letter-spacing:.3px;text-transform:uppercase;border:1px solid #C9D1DC;background:var(--bg,#fff);color:#4F6788;border-radius:5px;padding:3px 9px;cursor:pointer;}',
    '.exv-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;}',
    '.exv-fld label{display:block;font-size:calc(13px + var(--ts,0px));font-weight:600;color:var(--steel,#4A5568);margin-bottom:4px;}',
    '.exv-fld select,.exv-fld input[type=text]{width:100%;padding:8px 10px;border:1.5px solid var(--border,#D5DBE3);border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(14px + var(--ts,0px));background:var(--card,#fff);color:var(--fg,#1C2333);}',
    // Contractor multi-select: pinned to an explicit dark panel with explicitly
    // LIGHT text on EVERY row — selected or not. Previously rows had no own
    // background (transparent over --card) and the name used --fg, so a deselected
    // row could land light-text-on-light-surface = invisible. Now every row carries
    // its own surface + ink, so it is always readable regardless of host theme or
    // selection state.
    '.exv-multi{border:1.5px solid #3a4254;border-radius:8px;overflow:hidden;background:#1c2230;}',
    '.exv-mrow{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #2c3444;cursor:pointer;user-select:none;transition:background .12s;background:#1c2230;}',
    '.exv-mrow:last-of-type{border-bottom:none;}',
    '.exv-mrow.on{background:#2a3346;}',
    '.exv-mall{background:#242c3c;font-weight:700;}',
    '.exv-mall.on{background:#2f3a4f;}',
    '.exv-msep{height:1px;background:#2c3444;}',
    '.exv-mbox{width:18px;height:18px;flex:0 0 auto;border:2px solid #6b7589;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:900;line-height:1;background:transparent;}',
    '.exv-mrow.on .exv-mbox{background:#2C4770;border-color:#2C4770;}',
    '.exv-mdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}',
    '.exv-mname{flex:1;font-size:calc(14px + var(--ts,0px));font-weight:600;color:#eef1f6;}',
    '.exv-mct{font-size:calc(12px + var(--ts,0px));color:#aab2c4;font-variant-numeric:tabular-nums;}',
    '.exv-mhint{font-size:calc(11px + var(--ts,0px));color:#aab2c4;padding:8px 12px;background:#242c3c;}',
    '.exv-chk{display:flex;align-items:center;gap:8px;font-size:calc(13px + var(--ts,0px));color:var(--fg,#33415C);padding:5px 0;cursor:pointer;}',
    '.exv-chk input{width:15px;height:15px;}',
    '.exv-tw{display:flex;gap:8px;align-items:stretch;}',
    '.exv-tw input{flex:1;}',
    '.exv-lock{display:flex;align-items:center;gap:6px;background:var(--card,#EEF1F5);border:1.5px solid var(--border,#D5DBE3);border-radius:6px;padding:0 12px;font-size:calc(14px + var(--ts,0px));font-weight:700;color:#7A8699;white-space:nowrap;}',
    '.exv-grp{margin-bottom:14px;}.exv-grp:last-child{margin-bottom:0;}',
    '.exv-gh{font-size:calc(11px + var(--ts,0px));font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7A8699;margin-bottom:7px;display:flex;align-items:center;gap:8px;}',
    '.exv-sw{width:11px;height:11px;border-radius:3px;flex-shrink:0;}',
    '.exv-cards{display:flex;flex-wrap:wrap;gap:8px;}',
    '.exv-c{display:inline-flex;align-items:center;gap:8px;background:var(--card,#F4F5F8);border:1.5px solid var(--border,#D8DEE7);border-radius:8px;padding:7px 12px;font-size:calc(13px + var(--ts,0px));color:var(--steel,#5A6373);cursor:pointer;user-select:none;transition:all .12s;}',
    '.exv-c .role{font-size:calc(10px + var(--ts,0px));text-transform:uppercase;letter-spacing:.4px;opacity:.6;}',
    '.exv-c.on{background:var(--c,#6B7280);border-color:var(--c,#6B7280);color:#fff;}',
    '.exv-c.on .role{opacity:.85;}',
    '.exv-c .tk{width:16px;height:16px;border-radius:50%;border:1.5px solid #BCC4D0;display:inline-flex;align-items:center;justify-content:center;font-size:calc(11px + var(--ts,0px));color:transparent;flex-shrink:0;}',
    '.exv-c.on .tk{background:#fff;border-color:#fff;color:var(--c,#6B7280);}',
    '.exv-c .exv-x{margin-left:2px;width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:calc(14px + var(--ts,0px));line-height:1;opacity:.55;flex-shrink:0;cursor:pointer;transition:opacity .12s,background .12s;}',
    '.exv-c .exv-x:hover{opacity:1;background:rgba(138,74,74,.18);}',
    '.exv-c.on .exv-x:hover{background:rgba(255,255,255,.28);}',
    '@media(pointer:coarse){.exv-c .exv-x{width:30px;height:30px;opacity:.8;}}',
    '.exv-add{display:flex;gap:8px;margin-top:14px;}',
    '.exv-add input{flex:1;padding:7px 10px;border:1.5px dashed #C5CEDB;border-radius:6px;font-family:Calibri,sans-serif;font-size:calc(13px + var(--ts,0px));background:var(--card,#fff);color:var(--fg,#1C2333);}',
    '.exv-add button{padding:7px 14px;border:1px solid #4F6788;background:var(--bg,#fff);color:#33506B;border-radius:6px;font-size:calc(13px + var(--ts,0px));font-weight:600;cursor:pointer;}',
    '.exv-prev{margin-top:12px;background:var(--card,#F7F9FB);border:1px solid var(--border,#E4E8EE);border-radius:6px;padding:9px 12px;font-size:calc(13px + var(--ts,0px));color:var(--fg,#33415C);}',
    '.exv-prev b{color:#4F6788;text-transform:uppercase;font-size:calc(11px + var(--ts,0px));letter-spacing:.5px;}',
    '.exv-ut{margin-bottom:16px;padding:10px 12px;border:1px solid var(--border,#E4E8EE);border-radius:6px;}',
    '.exv-ut .uh{font-weight:600;font-size:calc(13px + var(--ts,0px));color:var(--steel,#4A5568);margin-bottom:6px;}',
    '.exv-ut label{display:flex;align-items:center;gap:8px;font-size:calc(13px + var(--ts,0px));cursor:pointer;margin-bottom:5px;}',
    '.exv-f{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:14px 24px;border-top:1px solid var(--border,#E4E8EE);background:var(--card,#FAFBFC);}',
    '.exv-acts{display:flex;gap:10px;}',
    '.exv-cancel{padding:6px 18px;border:0;background:#8A4A4A;color:#fff;border-radius:6px;font-size:calc(13px + var(--ts,0px));font-weight:600;cursor:pointer;letter-spacing:.2px;}',
    '.exv-cancel:hover{background:#763D3D;}',
    '.exv-go{padding:6px 18px;border:0;background:#4A6B5A;color:#fff;border-radius:6px;font-size:calc(13px + var(--ts,0px));font-weight:700;cursor:pointer;letter-spacing:.2px;}',
    '.exv-go:hover{background:#3E5A4B;}',
    '@media(max-width:680px){.exv-grid{grid-template-columns:1fr;}}'
  ].join('');
  document.head.appendChild(st);
}

export var initExportView = {

  /**
   * Open the Export Report view for the current project.
   */
  open: function() {
    var proj = Model.getProject();
    if (!proj) return;

    _styleOnce();

    var info = proj.info || {};
    var rptNum = proj.currentFrtInstance || 1;
    var titleVal = (info.reportTitleOverride && String(info.reportTitleOverride).trim()) || 'Field Review Report';

    // S(this) — multi-contractor selector. Replaces the single-pick dropdown
    // with a checkbox group: tick any subset; "All contractors" = every box on.
    // Resolves to a hidden #exv-ctr value ('__all__' | '__general__' | single id
    // | comma-joined id set) so the downstream read at #exv-ctr is unchanged.
    var _ctrList = (proj.contractors || []);
    var _ctrPalette = ['#9C2742','#2C7FB8','#C98A4A','#2E9E72','#7A5EA8','#C0445F'];
    var _hasGeneral = (proj.generalDeficiencies || []).length > 0;
    function _ctrCount(c){ return (c.deficiencies || []).length; }
    var _ctrMultiHtml = '<div class="exv-multi" id="exv-ctr-multi">';
    _ctrMultiHtml += '<div class="exv-mrow exv-mall on" data-id="__all__"><span class="exv-mbox">&#10003;</span>'
      + '<span class="exv-mname">All contractors</span></div><div class="exv-msep"></div>';
    _ctrList.forEach(function(c, i){
      _ctrMultiHtml += '<div class="exv-mrow on" data-id="' + _esc(c.id) + '" data-n="' + _esc(c.name || 'Unnamed') + '">'
        + '<span class="exv-mbox">&#10003;</span>'
        + '<span class="exv-mdot" style="background:' + _ctrPalette[i % _ctrPalette.length] + ';"></span>'
        + '<span class="exv-mname">' + _esc(c.name || 'Unnamed') + '</span>'
        + '<span class="exv-mct">' + _ctrCount(c) + '</span></div>';
    });
    if (_hasGeneral) {
      _ctrMultiHtml += '<div class="exv-msep"></div>'
        + '<div class="exv-mrow" data-id="__general__" data-n="Site Records">'
        + '<span class="exv-mbox"></span><span class="exv-mdot" style="background:#928E9C;"></span>'
        + '<span class="exv-mname">Site Records (internal)</span></div>';
    }
    _ctrMultiHtml += '<div class="exv-mhint">Untick "All contractors" to choose a subset.</div></div>';
    _ctrMultiHtml += '<input type="hidden" id="exv-ctr" value="__all__">';

    // ── Distribution model ────────────────────────────────────────
    // Recipients in their roles. Owner = info.client. Contractors =
    // proj.contractors minus Site Records. saved = proj.distribution[]
    // (the persisted selection); default selection when none saved =
    // owner + every contractor.
    var saved = Array.isArray(proj.distribution) ? proj.distribution.slice() : null;
    var ownerName = (info.client && String(info.client).trim()) || '';
    var ctrNames = (proj.contractors || [])
      .map(function(c) { return { n: (c.name || '').trim(), color: c.color || ADDED_C }; })
      .filter(function(x) { return x.n && !isSiteRecordsName(x.n); });
    var roleNames = {};
    if (ownerName) roleNames[ownerName] = 1;
    ctrNames.forEach(function(x) { roleNames[x.n] = 1; });
    var added = (saved || []).filter(function(n) { return !roleNames[n]; });

    function isOn(name) {
      if (saved) return saved.indexOf(name) >= 0;
      return true; // no saved set yet -> owner + contractors pre-selected
    }
    function cardHtml(name, role, color, on) {
      // 'added' recipients (manually pooled, not owner/contractor) get an ×
      // to remove them from the pool entirely — distinct from tapping the card
      // to select/deselect. Owner/contractor cards have no × (they come from
      // the roster, not the pool, so removal there would be meaningless).
      var x = (role === 'added')
        ? '<span class="exv-x" title="Remove recipient" data-x="' + _esc(name) + '">&#215;</span>'
        : '';
      return '<div class="exv-c' + (on ? ' on' : '') + '" data-n="' + _esc(name) + '" style="--c:' + color + ';">'
        + '<span class="tk">&#10003;</span>' + _esc(name) + ' <span class="role">' + _esc(role) + '</span>' + x + '</div>';
    }
    function grpHtml(label, color, cardsHtml) {
      return '<div class="exv-grp"><div class="exv-gh"><span class="exv-sw" style="background:' + color + ';"></span>'
        + _esc(label) + '</div><div class="exv-cards">' + cardsHtml + '</div></div>';
    }

    var distHtml = '';
    if (ownerName) {
      distHtml += grpHtml('Owner', OWNER_C, cardHtml(ownerName, 'owner', OWNER_C, isOn(ownerName)));
    }
    if (ctrNames.length) {
      distHtml += grpHtml('Contractors', '#6B7280', ctrNames.map(function(x) {
        return cardHtml(x.n, 'contractor', x.color, isOn(x.n));
      }).join(''));
    }
    if (added.length) {
      distHtml += grpHtml('Other recipients', ADDED_C, added.map(function(n) {
        return cardHtml(n, 'added', ADDED_C, isOn(n));
      }).join(''));
    }

    var utc = _countUntaggedForBand(proj);

    var h = '<div id="exv-ov"><div class="exv-w">';
    h += '<div class="exv-h"><div><div class="t">Export Report</div>'
      + '<div class="s">' + _esc(Model.getSmartFilename ? Model.getSmartFilename() : (info.projectName || '')) + '</div></div>'
      + '<button class="x" id="exv-x" title="Close">&#10005;</button></div>';
    h += '<div class="exv-b">';

    // Scope
    h += '<div class="exv-sec"><div class="exv-sh">Scope</div><div class="exv-grid">';
    h += '<div class="exv-fld"><label>Recommendations</label><select id="exv-recs">'
      + '<option value="bottom">Full report (deficiencies + recommendations)</option>'
      + '<option value="only">Recommendations only</option>'
      + '<option value="exclude">Exclude recommendations</option>'
      + '</select></div>';
    h += '<div class="exv-fld"><label>Drawings</label><select id="exv-type">'
      + '<option value="field">Include mini-maps and drawing appendices</option>'
      + '<option value="plain">Report only \u2014 no drawings</option>'
      + '</select></div>';
    // S(this): drawing-sheet size selector. Controls ONLY the appendix drawing
    // sheets (report body stays Letter portrait). Default Letter portrait.
    // Shown only when drawings are included (#exv-type === 'field'); meaningless
    // otherwise. Plumbing-only this step — pdf.js carries the value but still
    // renders Letter until the mixed-page renderer lands.
    h += '<div class="exv-fld" id="exv-drawpage-fld"><label>Drawing sheet size</label><select id="exv-drawpage">'
      + '<option value="letter">Letter portrait (default)</option>'
      + '<option value="11x17">11\u00D717 landscape</option>'
      + '<option value="24x36">24\u00D736 landscape</option>'
      + '</select></div>';
    h += '<div class="exv-fld"><label>Show items for</label>' + _ctrMultiHtml + '</div>';
    h += '<div class="exv-fld"><label>Inspector initials</label><select id="exv-insp">'
      + '<option value="off">Don\u2019t show initials</option>'
      + '<option value="initials">Show initials on each item</option>'
      + '</select></div>';
    h += '</div></div>';

    // Report title
    h += '<div class="exv-sec"><div class="exv-sh">Report title</div><div class="exv-tw">'
      + '<input type="text" id="exv-title" value="' + _esc(titleVal) + '">'
      + '<div class="exv-lock"><span style="font-size:12px;opacity:.7;">&#128274;</span> #' + rptNum
      + ' <span style="font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.4px;">auto</span></div></div>'
      + '</div>';

    // Options
    h += '<div class="exv-sec"><div class="exv-sh">Options</div><div class="exv-grid">'
      + '<label class="exv-chk"><input type="checkbox" id="exv-final"> Final commissioning (suppress future-deficiency note)</label>'
      + '<label class="exv-chk"><input type="checkbox" id="exv-closed" checked> Include Closed Items Summary</label>'
      + '<label class="exv-chk"><input type="checkbox" id="exv-siterec"> Include Site Records (internal)</label>'
      + '<label class="exv-chk"><input type="checkbox" id="exv-renum" checked> Renumber before export</label>'
      + '</div></div>';

    // Untagged-trade control (parity — only when untagged pins exist)
    if (utc > 0) {
      h += '<div class="exv-sec"><div class="exv-ut">'
        + '<div class="uh">Items with no trade (' + utc + ')</div>'
        + '<label><input type="radio" name="exv-ut" value="show" checked> Show as \u201cOther Trade Items\u201d band</label>'
        + '<label><input type="radio" name="exv-ut" value="exclude"> Exclude from report (' + utc + ' item' + (utc !== 1 ? 's' : '') + ')</label>'
        + '</div></div>';
    }

    // Distribution
    h += '<div class="exv-sec"><div class="exv-sh"><span>Distribution</span>'
      + '<span class="exv-bulk"><button id="exv-all">Add all</button><button id="exv-none">Remove all</button></span></div>'
      + '<div id="exv-groups">' + distHtml + '</div>'
      + '<div class="exv-add"><input type="text" id="exv-newrec" placeholder="Add a recipient \u2014 e.g. base-building service contractor, construction PM\u2026">'
      + '<button id="exv-addbtn">+ Add to pool</button></div>'
      + '<div class="exv-prev" id="exv-prevbox"></div>'
      + '</div>';

    h += '</div>'; // exv-b

    h += '<div class="exv-f">'
      + '<div class="exv-acts"><button class="exv-cancel" id="exv-cancel">Cancel</button>'
      + '<button class="exv-go" id="exv-go">\uD83D\uDCC4 Generate PDF</button></div></div>';

    h += '</div></div>';

    var wrap = document.createElement('div');
    wrap.innerHTML = h;
    var ov = wrap.firstChild;
    document.body.appendChild(ov);

    var groupsEl = ov.querySelector('#exv-groups');
    var prevBox = ov.querySelector('#exv-prevbox');

    // S(this): the drawing-sheet-size selector is only meaningful when drawings
    // are included. Hide it for "Report only — no drawings". Sync on load + change.
    (function() {
      var _typeEl = ov.querySelector('#exv-type');
      var _dpFld = ov.querySelector('#exv-drawpage-fld');
      if (_typeEl && _dpFld) {
        var _syncDp = function() { _dpFld.style.display = (_typeEl.value === 'field') ? '' : 'none'; };
        _typeEl.addEventListener('change', _syncDp);
        _syncDp();
      }
    })();

    function selectedNames() {
      return [].slice.call(groupsEl.querySelectorAll('.exv-c.on'))
        .map(function(c) { return c.getAttribute('data-n'); });
    }
    function refreshPrev() {
      var on = selectedNames();
      prevBox.innerHTML = '<b>Distribution line</b><br>'
        + (on.length ? _esc(on.join(', ')) : '<i style="color:#9aa5b5;">(none selected)</i>');
    }
    groupsEl.addEventListener('click', function(e) {
      // × on an added recipient removes the whole card (and so it won't be
      // saved back into proj.distribution on export). Handle BEFORE the
      // select-toggle so clicking × never also toggles selection.
      var x = e.target.closest('.exv-x');
      if (x) {
        e.stopPropagation();
        var card = x.closest('.exv-c');
        var grp = card ? card.closest('.exv-grp') : null;
        if (card) card.remove();
        // If that emptied the Other-recipients group, drop the now-empty group.
        if (grp && grp.hasAttribute('data-added') && !grp.querySelector('.exv-c')) grp.remove();
        refreshPrev();
        return;
      }
      var c = e.target.closest('.exv-c');
      if (c) { c.classList.toggle('on'); refreshPrev(); }
    });
    ov.querySelector('#exv-all').addEventListener('click', function() {
      [].forEach.call(groupsEl.querySelectorAll('.exv-c'), function(c) { c.classList.add('on'); });
      refreshPrev();
    });
    ov.querySelector('#exv-none').addEventListener('click', function() {
      [].forEach.call(groupsEl.querySelectorAll('.exv-c'), function(c) { c.classList.remove('on'); });
      refreshPrev();
    });
    function ensureAddedGroup() {
      var g = groupsEl.querySelector('.exv-grp[data-added]');
      if (!g) {
        g = document.createElement('div');
        g.className = 'exv-grp';
        g.setAttribute('data-added', '1');
        g.innerHTML = '<div class="exv-gh"><span class="exv-sw" style="background:' + ADDED_C + ';"></span>Other recipients</div><div class="exv-cards"></div>';
        groupsEl.appendChild(g);
      }
      return g.querySelector('.exv-cards');
    }
    ov.querySelector('#exv-addbtn').addEventListener('click', function() {
      var i = ov.querySelector('#exv-newrec');
      var v = (i.value || '').trim();
      if (!v) return;
      ensureAddedGroup().insertAdjacentHTML('beforeend', cardHtml(v, 'added', ADDED_C, true));
      i.value = '';
      i.focus();
      refreshPrev();
    });
    ov.querySelector('#exv-newrec').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') ov.querySelector('#exv-addbtn').click();
    });

    function close() { ov.remove(); }
    ov.querySelector('#exv-cancel').addEventListener('click', close);
    ov.querySelector('#exv-x').addEventListener('click', close);

    // S(this) — multi-contractor selector wiring. Maintains the hidden
    // #exv-ctr value as the user ticks rows. Touch-safe (click, not :hover).
    (function(){
      var multi = ov.querySelector('#exv-ctr-multi');
      var hidden = ov.querySelector('#exv-ctr');
      var goBtn = ov.querySelector('#exv-go');
      if (!multi || !hidden) return;
      function rowsAll(){ return Array.prototype.slice.call(multi.querySelectorAll('.exv-mrow')); }
      function ctrRows(){ return rowsAll().filter(function(r){ var id=r.dataset.id; return id!=='__all__'&&id!=='__general__'; }); }
      function setOn(r,v){ r.classList.toggle('on',v); r.querySelector('.exv-mbox').innerHTML = v ? '&#10003;' : ''; }
      function resolve(){
        var allRow = multi.querySelector('[data-id="__all__"]');
        var genRow = multi.querySelector('[data-id="__general__"]');
        var picked = ctrRows().filter(function(r){ return r.classList.contains('on'); });
        var allCtr = ctrRows();
        var genOn = genRow && genRow.classList.contains('on');
        var val;
        if (picked.length === allCtr.length && allCtr.length) { val = '__all__'; }
        else if (picked.length === 0 && genOn) { val = '__general__'; }
        else if (picked.length === 0) { val = ''; } // nothing -> blocked below
        else { val = picked.map(function(r){ return r.dataset.id; }).join(','); }
        hidden.value = val;
        // Block export when nothing is selected.
        var none = (picked.length === 0 && !genOn);
        if (goBtn) { goBtn.disabled = none; goBtn.style.opacity = none ? '0.5' : ''; goBtn.style.cursor = none ? 'not-allowed' : ''; }
      }
      multi.addEventListener('click', function(e){
        var r = e.target.closest('.exv-mrow'); if (!r) return;
        var id = r.dataset.id;
        if (id === '__all__') {
          var turnOn = !r.classList.contains('on');
          setOn(r, turnOn);
          ctrRows().forEach(function(c){ setOn(c, turnOn); });
        } else {
          setOn(r, !r.classList.contains('on'));
          var everyOn = ctrRows().every(function(c){ return c.classList.contains('on'); });
          setOn(multi.querySelector('[data-id="__all__"]'), everyOn && ctrRows().length>0);
        }
        resolve();
      });
      resolve();
    })();

    ov.querySelector('#exv-go').addEventListener('click', function() {
      var type = ov.querySelector('#exv-type').value;
      var ctrFilter = ov.querySelector('#exv-ctr').value;
      var isFinalComm = ov.querySelector('#exv-final').checked;
      var showClosedSummary = ov.querySelector('#exv-closed').checked;
      var recsMode = ov.querySelector('#exv-recs').value || 'bottom';
      var recFooter = true; // S144: Recommendations footer always shown
      var includeSiteRecords = ov.querySelector('#exv-siterec').checked;
      var inspTag = ov.querySelector('#exv-insp').value || 'off';
      var doRenumber = ov.querySelector('#exv-renum').checked;
      var utEl = ov.querySelector('input[name="exv-ut"]:checked');
      var untaggedMode = utEl ? utEl.value : 'show';
      // S(this): chosen appendix drawing-sheet size (letter|11x17|24x36).
      // Forced to 'letter' when drawings aren't included (selector is hidden).
      var _dpEl = ov.querySelector('#exv-drawpage');
      var drawingPageSize = (type === 'field' && _dpEl) ? (_dpEl.value || 'letter') : 'letter';

      // Persist title override + distribution to the project. updateField
      // writes proj.info.reportTitleOverride (exactly what pdf.js reads)
      // and queues a save; the distribution mutation rides the same live
      // _project object. saveNow() flushes immediately.
      var tov = (ov.querySelector('#exv-title').value || '').trim();
      var p = Model.getProject();
      if (p) {
        p.distribution = selectedNames();
        Model.updateField('reportTitleOverride',
          (tov && tov !== 'Field Review Report') ? tov : '');
        if (Model.saveNow) Model.saveNow();
      }

      close();

      // Renumber-before-export side-effect — byte-identical to the
      // legacy picker so the PDF and the on-screen tab agree.
      if (doRenumber) {
        var rc = Model.renumberDeficiencies();
        if (rc > 0) {
          if (initDeficiencies && initDeficiencies.render) initDeficiencies.render();
          if (window._frtRenderTasks) window._frtRenderTasks();
        }
      }

      initPDFExport.generate(type, {
        ctrFilter: ctrFilter,
        isFinalComm: isFinalComm,
        showClosedSummary: showClosedSummary,
        recsMode: recsMode,
        recFooter: recFooter,
        includeSiteRecords: includeSiteRecords,
        inspTag: inspTag,
        untaggedMode: untaggedMode,
        drawingPageSize: drawingPageSize
      });
    });

    refreshPrev();
  }
};
