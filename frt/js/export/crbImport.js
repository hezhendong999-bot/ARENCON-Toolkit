// ─────────────────────────────────────────────────────────────────────────
// crbImport.js — CRB Phase 1d RETURN PATH (S463)
//
// The export side (S451/S455/S463) prints real fillable AcroForm fields into
// the report PDF, named with stable item identity:
//   resp_{obsId}_status_{Addressed|In_Progress|Not_in_Scope|Other}
//   resp_{obsId}_comment
// This module closes the loop: the contractor fills the PDF and sends it
// back; office staff imports it here. We parse the form values, resolve each
// obs.id back to its deficiency + observation, show a preview-confirm dialog
// (custom modal per canon — never browser confirm()), and on confirm write
// frozen contractor rounds via Model.addContractorResponse (source:'pdf') —
// the S461 merge-safe primitives. Contractor text is stored verbatim and
// never edited (locked CRB invariant).
//
// Legacy PDFs exported before S463 carry sequential field names (resp_3_…);
// those cannot be resolved to items and are listed as unmatched — the fix is
// to re-export the report and have the contractor fill the new copy.
// ─────────────────────────────────────────────────────────────────────────
import { Model } from '../data/model.js';

var _PDFLIB_CDN = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

function _loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return new Promise(function(res, rej) {
    var s = document.createElement('script');
    s.src = _PDFLIB_CDN;
    s.onload = function() { window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib loaded but PDFLib missing')); };
    s.onerror = function() { rej(new Error('Failed to load pdf-lib')); };
    document.head.appendChild(s);
  });
}

// Reverse of the export-side option sanitizer (replace(/[^A-Za-z0-9]+/g,'_')).
var _OPT_MAP = { 'Addressed': 'Addressed', 'In_Progress': 'In Progress',
                 'Not_in_Scope': 'Not in Scope', 'Other': 'Other' };

// Resolve obs.id → { deficId, obsIdx, defic, obs, company } by scanning the model.
function _resolveObs(proj, obsId) {
  var hit = null;
  function scan(defics, company) {
    (defics || []).forEach(function(d) {
      (d.observations || []).forEach(function(o, i) {
        if (!hit && o && String(o.id) === String(obsId)) {
          hit = { deficId: d.id, obsIdx: i, defic: d, obs: o, company: company || '' };
        }
      });
    });
  }
  (proj.contractors || []).forEach(function(c) { scan(c.deficiencies, c.name); });
  scan(proj.generalDeficiencies, '');
  return hit;
}

// Parse the loaded pdf-lib document's form into rows keyed by obsId.
function _parseForm(PDFLib, pdfDoc) {
  var byId = {};   // obsId → { status, comment }
  var unmatchedNames = [];
  var exportId = null;   // S470: identity stamp written by the export side
  var form;
  try { form = pdfDoc.getForm(); } catch (e) { return { byId: byId, unmatchedNames: unmatchedNames, noForm: true }; }
  var fields = [];
  try { fields = form.getFields(); } catch (e) {}
  fields.forEach(function(f) {
    var name = '';
    try { name = f.getName(); } catch (e) { return; }
    if (name === 'arencon_export_id') {
      try { exportId = f.getText() || null; } catch (e) {}
      return;
    }
    var m = name.match(/^resp_(.+)_status_(Addressed|In_Progress|Not_in_Scope|Other)$/);
    if (m) {
      var checked = false;
      try { checked = f.isChecked(); } catch (e) {}
      if (checked) {
        byId[m[1]] = byId[m[1]] || {};
        byId[m[1]].status = _OPT_MAP[m[2]] || 'Other';
      } else {
        byId[m[1]] = byId[m[1]] || {};
      }
      return;
    }
    m = name.match(/^resp_(.+)_comment$/);
    if (m) {
      var txt = '';
      try { txt = f.getText() || ''; } catch (e) {}
      byId[m[1]] = byId[m[1]] || {};
      if (txt) byId[m[1]].comment = txt;
      return;
    }
    // Non-CRB fields in the PDF are ignored silently.
  });
  return { byId: byId, unmatchedNames: unmatchedNames, exportId: exportId };
}

// ── Preview-confirm dialog (self-contained custom modal) ─────────────────
function _showPreview(rows, unresolved, dupes, noStamp, onConfirm) {
  var old = document.getElementById('crbimp-ov'); if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'crbimp-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;' +
    'display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
  var rowsHtml = rows.map(function(r) {
    return '<div style="padding:8px 0;border-bottom:1px solid #eee;">' +
      '<div style="font-weight:bold;">' + _esc(r.itemLabel) + (r.company ? ' \u00b7 ' + _esc(r.company) : '') + '</div>' +
      '<div style="font-size:13px;color:#444;">Status: <b>' + _esc(r.status || '\u2014 none checked') + '</b>' +
      (r.comment ? ' \u2014 \u201C' + _esc(r.comment.length > 120 ? r.comment.slice(0, 120) + '\u2026' : r.comment) + '\u201D' : '') +
      '</div></div>';
  }).join('');
  // S470: already-imported items — greyed, explicitly skipped, never silent.
  var dupesHtml = (dupes && dupes.length)
    ? '<div style="margin-top:10px;font-size:12px;color:#928E9C;font-weight:bold;letter-spacing:.4px;">ALREADY IMPORTED \u2014 WILL BE SKIPPED</div>' +
      dupes.map(function(r) {
        return '<div style="padding:6px 0;border-bottom:1px solid #f2f2f2;color:#928E9C;">' +
          '<div>' + _esc(r.itemLabel) + ' \u00b7 previously imported from this PDF</div></div>';
      }).join('') +
      '<div style="font-size:12px;color:#928E9C;margin-top:4px;">If the contractor corrected one of these, remove the earlier round from the item\u2019s thread first, then re-import.</div>'
    : '';
  // S470: legacy export without an identity stamp — say so, don't block.
  var stampNote = noStamp
    ? '<div style="margin-top:10px;padding:8px;background:#F4F6F8;border:1px solid #C7CDD4;border-radius:6px;font-size:13px;color:#4A5568;">' +
      'This PDF predates duplicate protection (older export). Importing it twice would duplicate rounds \u2014 import it once.</div>'
    : '';
  var unres = unresolved.length
    ? '<div style="margin-top:10px;padding:8px;background:#FDF3E7;border:1px solid #C98A4A;border-radius:6px;font-size:13px;">' +
      '\u26A0 ' + unresolved.length + ' filled item(s) could not be matched to this project ' +
      '(older report export or wrong project). They will be skipped.</div>'
    : '';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:12px;max-width:560px;width:92%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">' +
      '<div style="background:#9C2742;color:#fff;padding:14px 18px;font-weight:bold;font-size:16px;">Import Contractor Responses</div>' +
      '<div style="padding:14px 18px;overflow-y:auto;flex:1;">' +
        '<div style="font-size:14px;margin-bottom:8px;">' + rows.length + ' filled item(s) found. Each will be added to its item\u2019s thread as a contractor round (source: PDF). Contractor text is stored verbatim.</div>' +
        rowsHtml + dupesHtml + stampNote + unres +
      '</div>' +
      '<div style="padding:12px 18px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;">' +
        '<button id="crbimp-cancel" style="padding:10px 18px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;">Cancel</button>' +
        '<button id="crbimp-ok" style="padding:10px 18px;border:none;background:#9C2742;color:#fff;border-radius:6px;font-weight:bold;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;">Import ' + rows.length + ' response(s)</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  ov.querySelector('#crbimp-cancel').addEventListener('click', function() { ov.remove(); });
  ov.querySelector('#crbimp-ok').addEventListener('click', function() { ov.remove(); onConfirm(); });
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function _notice(msg) {
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
  ov.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:440px;width:90%;padding:20px;">' +
    '<div style="font-size:15px;margin-bottom:14px;">' + _esc(msg) + '</div>' +
    '<div style="text-align:right;"><button style="padding:10px 18px;border:none;background:#9C2742;color:#fff;border-radius:6px;font-weight:bold;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;">OK</button></div></div>';
  ov.querySelector('button').addEventListener('click', function() { ov.remove(); });
  document.body.appendChild(ov);
}

// S500: success notice that also offers "Undo this import" — the batch id lets
// us pull the whole import back out in one tap (clean for a demo; the real
// safety net for the wrong-PDF day). Undo hard-removes untouched imports and
// soft-removes any you've already replied to (your review is preserved), then
// re-arms the PDF for re-import.
function _noticeUndo(msg, importId) {
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
  ov.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:460px;width:90%;padding:20px;">' +
    '<div style="font-size:15px;margin-bottom:14px;">' + _esc(msg) + '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
      '<button id="crbimp-undo" style="padding:10px 16px;border:1px solid #C0445F;background:#fff;color:#C0445F;border-radius:6px;font-weight:600;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;">\u21A9 Undo this import</button>' +
      '<button id="crbimp-okok" style="padding:10px 18px;border:none;background:#9C2742;color:#fff;border-radius:6px;font-weight:bold;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;">OK</button>' +
    '</div></div>';
  ov.querySelector('#crbimp-okok').addEventListener('click', function() { ov.remove(); });
  ov.querySelector('#crbimp-undo').addEventListener('click', function() {
    var r = Model.undoImportBatch ? Model.undoImportBatch(importId) : null;
    try { if (Model.saveNow) Model.saveNow(); } catch (e) {}
    ov.remove();
    // Repaint the deficiencies view so the removed rows disappear immediately.
    try { if (typeof window !== 'undefined' && window.Deficiencies && window.Deficiencies.render) window.Deficiencies.render(); } catch (e) {}
    var m = 'Import undone.';
    if (r) {
      m = 'Import undone \u2014 ' + r.total + ' response(s) removed';
      if (r.soft) m += ' (' + r.soft + ' kept as removed because you had replied to them; your reviews are intact)';
      m += '. This PDF can be imported again.';
    }
    _notice(m);
  });
  document.body.appendChild(ov);
}

// ── Public entry ──────────────────────────────────────────────────────────
export function openCrbImport() {
  var proj = Model.getProject && Model.getProject();
  if (!proj) { _notice('Open a project first, then import the filled PDF.'); return; }
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/pdf,.pdf';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', function() {
    var file = inp.files && inp.files[0];
    inp.remove();
    if (!file) return;
    file.arrayBuffer().then(function(buf) {
      return _loadPdfLib().then(function(PDFLib) {
        // ignoreEncryption: some PDF apps stamp benign encryption dicts on save.
        return PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
      });
    }).then(function(pdfDoc) {
      var parsed = _parseForm(window.PDFLib, pdfDoc);
      if (parsed.noForm) { _notice('This PDF has no fillable form fields. Make sure it is the exported ARENCON report (not a print-to-PDF copy).'); return; }
      // ── S480: THE IMPORT GATE — only a sheet from the LATEST ISSUED report
      // may come back (locked design: contractors respond to issued reports
      // only; the gate has no back door). Round identity comes from the SHEET
      // via the export registry, never from the clock — a late import can
      // never stamp the wrong round.
      var _gate = Model.validateImportSheet ? Model.validateImportSheet(parsed.exportId || null)
                                            : { ok: true, code: 'ok', sheetFrt: null, latestIssued: 0 };
      if (!_gate.ok) {
        var _gmsg = {
          'no-stamp': 'This PDF carries no ARENCON identity stamp, so it can\u2019t be matched to an issued report. Re-export the current report and have the contractor fill the new copy.',
          'unknown': 'This sheet doesn\u2019t belong to this project, or predates round protection. Re-export the current report for the contractor.',
          'not-issued': 'This is a working copy of FRT #' + _gate.sheetFrt + ' \u2014 it was never issued. Contractors respond to issued reports only. Issue the report first, then import responses against the issued sheet.',
          'stale': 'This is a response to FRT #' + _gate.sheetFrt + ', which has been superseded (latest issued report is FRT #' + _gate.latestIssued + '). Enter any still-relevant answers manually in the item threads as current-round responses.',
          'nothing-issued': 'No report has been issued from this project yet \u2014 there is nothing for a contractor to respond to.'
        };
        _notice(_gmsg[_gate.code] || 'This sheet can\u2019t be imported.');
        return;
      }
      var _sheetFrt = _gate.sheetFrt || (proj.currentFrtInstance || 1);
      var _impId = 'imp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      // S470: duplicate detection keyed per (exportId, obsId). The realistic
      // workflow is a contractor part-filling, sending, filling MORE, and
      // re-sending the SAME PDF — so the grain is per item, never per file:
      // new items import, already-imported ones are skipped and SAID so. If
      // an item was filled DIFFERENTLY on the re-send (a correction), the
      // skip is surfaced — a person removes the earlier round deliberately;
      // an import never overwrites a record (locked §5).
      var _expId = parsed.exportId || null;
      var _seen = (proj.exportIds || []);
      var rows = [], unresolved = [], dupes = [];
      Object.keys(parsed.byId).forEach(function(obsId) {
        var v = parsed.byId[obsId];
        // Skip untouched blocks: no status checked AND no comment typed.
        if (!v.status && !v.comment) return;
        var hit = _resolveObs(proj, obsId);
        if (!hit) { unresolved.push(obsId); return; }
        var obsTxt = (hit.obs.text || '').slice(0, 60);
        var row = {
          deficId: hit.deficId, obsIdx: hit.obsIdx, company: hit.company,
          status: v.status || null, comment: v.comment || '',
          itemLabel: obsTxt || ('Observation ' + (hit.obsIdx + 1)),
          dedupeKey: _expId ? (_expId + '|' + obsId) : null,
          // S480: round from the SHEET — these are answers to FRT #_sheetFrt,
          // regardless of what instance the project has moved to since.
          frtInstance: _sheetFrt,
          round: Math.max(1, (_sheetFrt - ((hit.obs && Number(hit.obs.notedOnInstance)) || 1)) + 1)
        };
        if (row.dedupeKey && _seen.indexOf(row.dedupeKey) >= 0) { dupes.push(row); return; }
        rows.push(row);
      });
      if (!rows.length && !dupes.length) {
        _notice(unresolved.length
          ? 'Filled fields were found but none match items in this project. This PDF may be from an older export (re-export the report and have the contractor fill the new copy) or belong to a different project.'
          : 'No filled contractor responses found in this PDF.');
        return;
      }
      if (!rows.length && dupes.length) {
        _notice('All ' + dupes.length + ' filled item(s) in this PDF were already imported. Nothing new to add. (If the contractor corrected an earlier answer, remove that round from the item\u2019s thread first, then re-import.)');
        return;
      }
      _showPreview(rows, unresolved, dupes, !_expId, function() {
        var ok = 0, fail = 0;
        rows.forEach(function(r) {
          var entry = Model.addContractorResponse(r.deficId, r.obsIdx, {
            company: r.company,
            statusReported: r.status || 'Other',
            text: r.comment,
            source: 'pdf',
            importId: _impId,          // S480: batch receipt (undo grain)
            dedupeKey: r.dedupeKey || null, // S500: so undo can un-register this item's export key
            frtInstance: r.frtInstance, // S480: round from the sheet, not the clock
            round: r.round
          });
          if (entry) {
            ok++;
            // Register AFTER a successful write, so a failed write stays importable.
            if (r.dedupeKey) { try { Model.registerExportId(r.dedupeKey); } catch (e) {} }
          } else fail++;
        });
        try { if (ok && Model.logImport) Model.logImport({ importId: _impId, exportId: _expId, frt: _sheetFrt, count: ok }); } catch (e) {}
        try { if (Model.saveNow) Model.saveNow(); } catch (e) {}
        _noticeUndo('Imported ' + ok + ' contractor response(s) into item threads.' +
          (dupes.length ? ' ' + dupes.length + ' already-imported item(s) skipped.' : '') +
          (fail ? ' ' + fail + ' failed \u2014 see console.' : '') +
          ' They will appear in the next exported report\u2019s thread history.', _impId);
        console.log('[CRBImport] wrote ' + ok + ' response(s), ' + fail + ' failed, ' +
          dupes.length + ' duplicate(s) skipped, ' +
          unresolved.length + ' unresolved field id(s)', unresolved);
      });
    }).catch(function(e) {
      console.error('[CRBImport] failed:', e);
      _notice('Could not read that PDF: ' + (e && e.message ? e.message : 'unknown error'));
    });
  });
  inp.click();
}
