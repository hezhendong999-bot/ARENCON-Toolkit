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
// S500: STALE-SHEET ACKNOWLEDGEMENT. The contractor answered an older report
// than the project has moved to. Default is to file on the CURRENT round (their
// late reply joins the live conversation); "anyway" backfills the old round the
// sheet was for. Only fires on a genuine round mismatch — never on a normal
// same-round import — so it stays a meaningful speed bump, not noise.
function _confirmStale(sheetFrt, latestIssued, currentRound, onChoose) {
  var old = document.getElementById('crbimp-stale-ov'); if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'crbimp-stale-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:12px;max-width:480px;width:92%;overflow:hidden;">' +
      '<div style="background:#C98A4A;color:#fff;padding:13px 18px;font-weight:bold;font-size:15px;">Older report responses</div>' +
      '<div style="padding:16px 18px;font-size:14px;line-height:1.55;color:#1B1A22;">' +
        'This PDF is the contractor\u2019s response to <b>FRT #' + _esc(sheetFrt) + '</b>, but the project has since moved to <b>FRT #' + _esc(currentRound) + '</b>.' +
        '<div style="margin-top:10px;">Filing under <b>FRT #' + _esc(currentRound) + '</b> (recommended) adds these as current-round responses \u2014 a late reply joining the live conversation. FRT #' + _esc(sheetFrt) + ' is not reopened or changed.</div>' +
        '<div style="margin-top:10px;color:#5E5B68;font-size:13px;">Filing under FRT #' + _esc(sheetFrt) + ' instead adds them to a report you already issued. The original PDF\u2019s content is never changed; they are recorded as received after that report was issued.</div>' +
      '</div>' +
      '<div style="padding:12px 18px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">' +
        '<button id="crbst-cancel" style="padding:10px 16px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;">Cancel</button>' +
        '<button id="crbst-old" style="padding:10px 16px;border:1px solid #C98A4A;background:#fff;color:#8a5a1e;border-radius:6px;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;">File as FRT #' + _esc(sheetFrt) + ' anyway</button>' +
        '<button id="crbst-cur" style="padding:10px 18px;border:none;background:#9C2742;color:#fff;border-radius:6px;font-weight:bold;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;">File as FRT #' + _esc(currentRound) + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  ov.querySelector('#crbst-cancel').addEventListener('click', function() { ov.remove(); });
  ov.querySelector('#crbst-cur').addEventListener('click', function() { ov.remove(); onChoose(currentRound); });
  ov.querySelector('#crbst-old').addEventListener('click', function() { ov.remove(); onChoose(sheetFrt); });
}

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
// The ONE place an imported row becomes a contractor round. Both the normal
// commit and every diff-resolution branch call this — there is no second
// writer to drift out of step with it.
function _writeRow(row, ctx, opts) {
  opts = opts || {};
  var data = {
    company: row.company,
    statusReported: row.status || 'Other',
    text: row.comment,
    source: 'pdf',
    importId: ctx.impId,             // batch receipt (undo grain)
    dedupeKey: row.dedupeKey || null,
    workingCopy: !!(ctx && ctx.workingCopy),   // S509: permanent draft-sheet marker
    frtInstance: row.frtInstance,    // round from the SHEET, not the clock
    round: row.round
  };
  // A revision to an ALREADY ISSUED answer is not a correction to that round —
  // it is a new thing said later. It files on the current round so the issued
  // record stands untouched beside it.
  if (opts.asNewRound) { delete data.frtInstance; delete data.round; }
  var entry = Model.addContractorResponse(row.deficId, row.obsIdx, data);
  if (entry && row.dedupeKey) { try { Model.registerExportId(row.dedupeKey); } catch (e) {} }
  // S508: remember where a comment actually landed, so respond-in-flow can walk
  // exactly the items that got one — never the whole project.
  if (entry && ctx && ctx.written) ctx.written.push({ deficId: row.deficId, obsIdx: row.obsIdx });
  return entry;
}

// ══ S508 — RE-IMPORT DIFF ═══════════════════════════════════════════════
// Until now an already-imported item was simply dropped on the floor. That is
// correct only when nothing changed. A contractor who re-sends a sheet may
// have corrected an answer, or answered something you deliberately removed —
// and silence in either direction is wrong on a record an AHJ may read.
//
// Every already-seen item is classified into exactly one of four buckets:
//   silent   — unchanged, or removed-and-already-declined at this wording
//   offerBack— you removed it; the contractor still says it. Ask, one tap.
//   reworded — live UNISSUED draft, different wording. Replace or keep both.
//   newRound — live ISSUED answer, different wording. The issued wording is
//              the record and is NEVER overwritten; the revision lands as a
//              new round (locked §5).
function _classifyDupes(dupes) {
  var out = { silent: [], offerBack: [], reworded: [], newRound: [] };
  (dupes || []).forEach(function(r) {
    if (!r.dedupeKey) { out.silent.push(r); return; }
    var live = null, decision = 'none';
    try { live = Model.findLiveResponseByDedupe(r.dedupeKey); } catch (e) { live = null; }
    try { decision = Model.tombDecisionFor(r.dedupeKey, r.comment || ''); } catch (e) { decision = 'none'; }

    if (!live) {
      // Not in the thread. Either deliberately removed (tombstone), or removed
      // before tombstones existed. Never silent unless this exact wording was
      // already declined — when in doubt, ask rather than swallow.
      if (decision === 'silent') out.silent.push(r);
      else { r._tomb = (decision === 'offer'); out.offerBack.push(r); }
      return;
    }

    var a = Model._normTombText(live.entry.text || '');
    var b = Model._normTombText(r.comment || '');
    if (a === b) { out.silent.push(r); return; }          // genuinely unchanged

    r._live = live;
    // ⚠ Issued is checked BEFORE any skip logic. An earlier build let an
    // issued item with no recorded decision fall through a skip fallback,
    // silently dropping a contractor's revision to an issued answer.
    if (live.entry.issuedOnInstance != null) out.newRound.push(r);
    else out.reworded.push(r);
  });
  return out;
}

// Sequential, one decision per screen. Never a batch checklist — each of these
// is a judgment about a specific item's record.
function _resolveDiffQueue(buckets, ctx, onDone) {
  var queue = [];
  buckets.offerBack.forEach(function(r) { queue.push({ kind: 'offerBack', row: r }); });
  buckets.reworded.forEach(function(r) { queue.push({ kind: 'reworded', row: r }); });
  var applied = { broughtBack: 0, declined: 0, replaced: 0, keptBoth: 0, newRounds: 0 };

  // Issued revisions are not a question — the record cannot be overwritten, so
  // there is only one lawful outcome. They are written first and reported.
  buckets.newRound.forEach(function(r) {
    var entry = _writeRow(r, ctx, { asNewRound: true });
    if (entry) applied.newRounds++;
  });

  var i = 0;
  function next() {
    if (i >= queue.length) { onDone(applied); return; }
    var step = queue[i++];
    if (step.kind === 'offerBack') _confirmOfferBack(step.row, ctx, applied, next);
    else _confirmReworded(step.row, ctx, applied, next);
  }
  next();
}

function _diffOverlay(headerColor, title, bodyHtml, buttons) {
  var old = document.getElementById('crbimp-diff-ov'); if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'crbimp-diff-ov';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9600;display:flex;' +
    'align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
  ov.innerHTML =
    '<div style="background:#fff;border-radius:12px;max-width:520px;width:92%;overflow:hidden;">' +
      '<div style="background:' + headerColor + ';color:#fff;padding:13px 18px;font-weight:bold;font-size:15px;">' + _esc(title) + '</div>' +
      '<div style="padding:16px 18px;font-size:14px;line-height:1.55;color:#1B1A22;max-height:56vh;overflow-y:auto;">' + bodyHtml + '</div>' +
      '<div id="crbdiff-btns" style="padding:12px 18px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;"></div>' +
    '</div>';
  var bar = ov.querySelector('#crbdiff-btns');
  buttons.forEach(function(b) {
    var el = document.createElement('button');
    el.textContent = b.label;
    el.style.cssText = 'padding:10px 16px;border-radius:6px;cursor:pointer;min-height:44px;font-family:Calibri,sans-serif;' +
      (b.primary ? 'border:none;background:#9C2742;color:#fff;font-weight:bold;padding:10px 18px;'
                 : 'border:1px solid #ccc;background:#fff;color:#1B1A22;');
    el.addEventListener('click', function() { ov.remove(); b.onClick(); });
    bar.appendChild(el);
  });
  document.body.appendChild(ov);
  return ov;
}

function _quoteBlock(label, text, tint) {
  return '<div style="margin-top:10px;">' +
    '<div style="font-size:12px;font-weight:bold;color:#5E5B68;text-transform:uppercase;letter-spacing:.04em;">' + _esc(label) + '</div>' +
    '<div style="margin-top:4px;padding:8px 10px;background:' + (tint || '#F6F5F8') + ';border-radius:6px;white-space:pre-wrap;">' +
      _esc(text || '(no comment)') + '</div></div>';
}

// You removed this answer. The contractor has sent it again.
function _confirmOfferBack(row, ctx, applied, next) {
  _diffOverlay('#C98A4A', 'A removed response is back',
    'You removed this contractor answer from <b>' + _esc(row.itemLabel) + '</b>. Their re-sent sheet still contains it.' +
    _quoteBlock('What they say now', row.comment) +
    '<div style="margin-top:10px;color:#5E5B68;font-size:13px;">Bringing it back adds it to the item\u2019s thread as a contractor round. Leaving it out keeps the item as it is \u2014 and an identical re-send will not ask again, though a changed answer will.</div>',
    [
      { label: 'Leave it out', onClick: function() {
          try { Model.dismissCommentTomb(row.dedupeKey, row.comment || ''); } catch (e) {}
          applied.declined++; next();
        } },
      { label: 'Bring it back', primary: true, onClick: function() {
          var entry = _writeRow(row, ctx, {});
          if (entry) { try { Model.clearCommentTomb(row.dedupeKey); } catch (e) {} applied.broughtBack++; }
          next();
        } }
    ]);
}

// A live, not-yet-printed imported draft whose wording changed on the re-send.
function _confirmReworded(row, ctx, applied, next) {
  var live = row._live;
  _diffOverlay('#2C7FB8', 'Answer changed on the re-sent sheet',
    'The contractor\u2019s answer for <b>' + _esc(row.itemLabel) + '</b> is different this time. It has <b>not</b> been printed yet, so it can be corrected in place.' +
    _quoteBlock('Currently in the thread', live && live.entry ? live.entry.text : '') +
    _quoteBlock('On the new sheet', row.comment, '#EAF3F9') +
    '<div style="margin-top:10px;color:#5E5B68;font-size:13px;">Replace swaps the wording and keeps one round. Keep both records the new wording as an additional round, leaving the earlier one visible.</div>',
    [
      { label: 'Keep both', onClick: function() {
          var entry = _writeRow(row, ctx, {});
          if (entry) applied.keptBoth++;
          next();
        } },
      { label: 'Replace', primary: true, onClick: function() {
          var r2 = null;
          try {
            r2 = Model.replaceUnissuedImportedDraft(live.deficId, live.obsIdx, live.entry.id, row.comment || '', ctx.who);
          } catch (e) { r2 = null; }
          if (r2) {
            applied.replaced++;
            if (ctx && ctx.written) ctx.written.push({ deficId: live.deficId, obsIdx: live.obsIdx });
          }
          else console.warn('[CRBImport] replace refused — falling back to leaving the thread unchanged.');
          next();
        } }
    ]);
}

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
      // S500 (Mark): a STALE sheet — the contractor answered an OLDER report
      // than the project has since moved to (e.g. they finally reply to FRT #1
      // after you've already issued FRT #2) — is no longer a hard block. It is
      // a speed bump: warn plainly, then file the answers on the CURRENT round
      // by default, so a late reply joins the live conversation instead of
      // reopening a closed, issued report. The other gate failures stay hard
      // blocks — they are different problems (no stamp, never issued, etc.).
      if (!_gate.ok && _gate.code === 'stale') {
        var _cur = (proj.currentFrtInstance || 1);
        _confirmStale(_gate.sheetFrt, _gate.latestIssued, _cur, function(useRound) {
          // useRound: the current instance (default) or the old sheet round (backfill anyway).
          _runImport(useRound, false);
        });
        return;
      }
      if (!_gate.ok && _gate.code === 'not-issued') {
        // S509 (Mark): a filled WORKING copy is importable now — the block was
        // a workflow assumption, not a data-safety rule. The contractor's words
        // are their words either way, and the sheet's round is known from the
        // registry, so nothing mis-numbers. But the fact is recorded forever:
        // every round from this sheet carries a permanent working-copy marker,
        // in the app AND on printed reports.
        _diffOverlay('#C98A4A', 'This sheet is a working copy',
          'This PDF is a <b>draft</b> of FRT #' + _esc(_gate.sheetFrt) + ' \u2014 it was never issued. The contractor answered a working copy.' +
          '<div style="margin-top:10px;">You can import these answers. Every response from this sheet will be permanently marked <b>WORKING COPY</b> in the thread and on printed reports.</div>' +
          '<div style="margin-top:10px;color:#5E5B68;font-size:13px;">If this draft went out by mistake, the cleaner path is to issue the report properly and have the contractor fill the issued sheet.</div>',
          [
            { label: 'Cancel', onClick: function() {} },
            { label: 'Import as working copy', primary: true, onClick: function() {
                _runImport(_gate.sheetFrt || (proj.currentFrtInstance || 1), true);
              } }
          ]);
        return;
      }
      if (!_gate.ok) {
        var _gmsg = {
          'no-stamp': 'This PDF carries no ARENCON identity stamp, so it can\u2019t be matched to an issued report. Re-export the current report and have the contractor fill the new copy.',
          'unknown': 'This sheet doesn\u2019t belong to this project, or predates round protection. Re-export the current report for the contractor.',
          'nothing-issued': 'No report has been issued from this project yet \u2014 there is nothing for a contractor to respond to.'
        };
        _notice(_gmsg[_gate.code] || 'This sheet can\u2019t be imported.');
        return;
      }
      _runImport(_gate.sheetFrt || (proj.currentFrtInstance || 1), false);

      // Everything from round-assignment through preview+write, callable with an
      // explicit round so the stale-acknowledgement path can file on the current
      // instance. sheetFrt is the round the responses will be recorded against.
      function _runImport(sheetFrt, isWorkingCopy) {
      var _sheetFrt = sheetFrt;
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
      // S508: shared write context, and the already-seen items sorted into
      // unchanged / removed / reworded / issued-revision.
      var _ctx = { impId: _impId, sheetFrt: _sheetFrt, expId: _expId, written: [],
        workingCopy: !!isWorkingCopy,
        who: (typeof Auth !== 'undefined' && Auth.getInitials && Auth.getInitials()) || null };
      var _buckets = _classifyDupes(dupes);
      var _actionable = _buckets.offerBack.length + _buckets.reworded.length + _buckets.newRound.length;
      if (!rows.length && !dupes.length) {
        _notice(unresolved.length
          ? 'Filled fields were found but none match items in this project. This PDF may be from an older export (re-export the report and have the contractor fill the new copy) or belong to a different project.'
          : 'No filled contractor responses found in this PDF.');
        return;
      }
      if (!rows.length && dupes.length && !_actionable) {
        _notice('All ' + dupes.length + ' filled item(s) in this PDF were already imported, and none of them changed. Nothing to add. (Removed or reworded answers are handled automatically on re-import.)');
        return;
      }
      // Writes the new items, then walks the changed/removed ones one at a
      // time, then commits once. Nothing is left half-resolved.
      function _commit() {
        var ok = 0, fail = 0;
        rows.forEach(function(r) {
          // Registration happens inside _writeRow, AFTER a successful write, so
          // a failed write stays importable.
          if (_writeRow(r, _ctx, {})) ok++; else fail++;
        });
        _resolveDiffQueue(_buckets, _ctx, function(applied) {
          var extra = applied.broughtBack + applied.replaced + applied.keptBoth + applied.newRounds;
          try { if ((ok + extra) && Model.logImport) Model.logImport({ importId: _impId, exportId: _expId, frt: _sheetFrt, count: ok + extra }); } catch (e) {}

          // ⚠ CRASH FENCE (locked decision 4). The import must be fully
          // committed AND saved before respond-in-flow opens. A flow running
          // over a half-saved project would let a crash lose comments the
          // inspector believes are recorded. Everything below waits on the
          // save promise; if saveNow gives us nothing to wait on, we still
          // fall through — but never before the write calls have returned.
          var _saved;
          try { _saved = Model.saveNow(); } catch (e) { _saved = null; }
          Promise.resolve(_saved).catch(function(e) {
            console.warn('[CRBImport] save reported an error; not opening the respond flow:', e);
            return '__failed__';
          }).then(function(res) {
          var parts = [];
          if (ok) parts.push('Imported ' + ok + ' new contractor response(s).');
          if (applied.broughtBack) parts.push(applied.broughtBack + ' removed response(s) brought back.');
          if (applied.replaced) parts.push(applied.replaced + ' corrected in place.');
          if (applied.keptBoth) parts.push(applied.keptBoth + ' added as an extra round.');
          if (applied.newRounds) parts.push(applied.newRounds + ' revision(s) to already-issued answers added as a new round \u2014 the issued wording is unchanged.');
          if (applied.declined) parts.push(applied.declined + ' left out.');
          if (_buckets.silent.length) parts.push(_buckets.silent.length + ' unchanged item(s) skipped.');
          if (fail) parts.push(fail + ' failed \u2014 see console.');
          if (!parts.length) parts.push('Nothing changed.');
          _noticeUndo(parts.join(' ') + ' They will appear in the next exported report\u2019s thread history.', _impId);
          console.log('[CRBImport] wrote ' + ok + ' new, resolved ' + JSON.stringify(applied) +
            ', ' + _buckets.silent.length + ' unchanged, ' +
            unresolved.length + ' unresolved field id(s)', unresolved);

          // Now — and only now — walk the inspector through responding.
          if (res === '__failed__') return;
          if (!_ctx.written.length) return;
          try {
            if (window._frtStartRespondFlow) window._frtStartRespondFlow(_ctx.written);
          } catch (e) { console.warn('[CRBImport] could not open the respond flow:', e); }
          });
        });
      }

      // Nothing new on the sheet — go straight to the changed/removed items.
      if (!rows.length) { _commit(); return; }
      _showPreview(rows, unresolved, dupes, !_expId, _commit);
      } // end _runImport
    }).catch(function(e) {
      console.error('[CRBImport] failed:', e);
      _notice('Could not read that PDF: ' + (e && e.message ? e.message : 'unknown error'));
    });
  });
  inp.click();
}
