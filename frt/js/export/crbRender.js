// ============================================================================
// crbRender.js — Contractor Response: REAL-DATA render (LIVE since S455)
// ----------------------------------------------------------------------------
// S448 groundwork, wired live in S455. This module is imported by pdf.js and
// produces output when window._frtCrbLive is truthy — set by the "Contractor
// Response — live (real data)" admin checkbox in the export modal
// (exportview.js). It reads real obs.responses[] / obs.arenconReviews[] and
// replaces the sample-thread selection in _buildDefCard. The sample-preview
// path (_frtCrbPreview) stays for on-device A/B until the live path is fully
// field-confirmed. All functions here are PURE — they render existing model
// data and never mutate it, so render-only changes (e.g. §1.4 thread
// compression, S456) are safe without a data-path session.
//
// DESIGN AUTHORITY: LOCKED_CONTRACTOR_RESPONSE_SYSTEM.md §1 (grammar), and the
// FRT deficiency model as it actually exists post-S114:
//   project.currentFrtInstance : Number   (the report instance being issued)
//   deficiency (pin) .id, .priority, .notedOnInstance, .closedOnInstance
//   deficiency.observations[] : each { id, text, priority, notedOnInstance,
//                                      addressed, addressedOnInstance, ... }
//   Each RENDERED REPORT CARD == one observation (r.obs, r.obsIdx, r._itemNo).
//
// THREAD ATTACHMENT (locked S448): per OBSERVATION, keyed by obs.id.
//   obs.responses[]      — contractor rounds (frozen, never edited by ARENCON)
//   obs.arenconReviews[] — ARENCON review rows (the only coloured/authoritative)
// Both are id-array shaped so the existing deletion-wins _merge3IdArray handles
// them with NO new merge code (each row carries a stable id).
//
// ROUND math (locked §1.3): round = (frtInstance - obs.notedOnInstance) + 1.
//   Round 1 => no chip. 2 => grey "2nd rd". 3+ => maroon + drawn flag.
//
// COLOUR authority (locked §1.2): contractor rows = quiet slate, NO pill.
//   ARENCON review row = burgundy left rule + the item's REAL status pill.
// ============================================================================

/* ------------------------------------------------------------------ *
 * SCHEMA (documentation only — the on-device session creates real     *
 * writers; nothing here mutates the model).                           *
 * ------------------------------------------------------------------ *
 * obs.responses[i] = {
 *   id:            String,          // stable — merge key. e.g. 'resp_<uid>'
 *   round:         Number,          // 1-based; derived, but stored for record
 *   frtInstance:   Number,          // report instance this round belongs to
 *   company:       String,          // responding party name
 *   date:          'YYYY-MM-DD',
 *   statusReported:String,          // 'Addressed'|'In Progress'|'Not in Scope'|'Other'
 *   comment:       String,          // contractor's words, verbatim, never edited
 *   rectPhotos:    [{ r2Key, r2Url?, caption? }],  // added by ARENCON via portal/manual
 *   source:        'portal'|'manual'|'pdf',
 *   receiptNo:     String|null,     // portal/import receipt for the audit stamp
 *   noResponse:    Boolean          // true => grey "no response" row, no claim
 * }
 *
 * obs.arenconReviews[i] = {
 *   id:            String,          // stable — merge key. e.g. 'arv_<uid>'
 *   round:         Number,          // the contractor round this review answers
 *   frtInstance:   Number,
 *   date:          'YYYY-MM-DD',
 *   status:        'high'|'low'|'closed',  // maps to pill-h / pill-l / pill-c
 *   comment:       String,
 *   followupPhotos:[{ r2Key, r2Url?, caption? }]
 * }
 * ------------------------------------------------------------------ */

// --- small local helpers (no external deps; mirror pdf.js escaping) ----------
function _crbEsc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
// S500: when a comment was amended AFTER it was printed in an issued report,
// the report must not silently show the new wording — the AHJ/contractor only
// ever see the paper. This prints the current text (done by the caller) with a
// quiet line beneath giving the amendment date and the ORIGINAL issued wording,
// so the correction is on the record, not just in the app. The original is the
// first edit's `from` in the amendment history (same value revert restores).
// Returns '' for comments never amended after issue — no visual change for them.
function _crbAmendNote(entry){
  if(!entry || !entry.amendedAfterIssue) return '';
  var hist = entry.history || [], orig = null, when = null, i;
  for(i=0;i<hist.length;i++){ if(hist[i].action==='edit'){ orig = hist[i].from; when = hist[i].at; break; } }
  var whenStr = '';
  if(when){ try { whenStr = new Date(when).toISOString().slice(0,10); } catch(e){ whenStr=''; } }
  var issuedFrt = (entry.issuedOnInstance!=null) ? (' in FRT #'+_crbEsc(entry.issuedOnInstance)) : '';
  var was = (orig!=null && orig!=='') ? ('; as issued'+issuedFrt+' this read: \u201C'+_crbEsc(orig)+'\u201D') : '';
  return '<div class="crb-amend" style="font-size:9px;color:#5E5B68;font-style:italic;margin-top:2px;">'
    + 'Amended'+(whenStr?(' '+whenStr):'')+was+'</div>';
}
function _crbRound(frtInstance, notedOnInstance){
  var r = (Number(frtInstance)||1) - (Number(notedOnInstance)||1) + 1;
  return r < 1 ? 1 : r;
}

// Rounds-escalation chip for the item header. Returns '' for round 1.
// _flagSvg is passed in from pdf.js (_CRB_FLAG) so we don't duplicate the SVG.
function crbRoundChip(currentInstance, notedOnInstance, _flagSvg){
  var r = _crbRound(currentInstance, notedOnInstance);
  if(r <= 1) return '';
  var ord = (r===2?'2nd':r===3?'3rd':(r+'th'));
  var title = 'Outstanding for '+r+' reports \u2014 first noted FRT #'+(Number(notedOnInstance)||1);
  if(r === 2){
    return '<span class="rd-chip r-g" title="'+_crbEsc(title)+'">2nd rd</span>';
  }
  // 3rd rd and beyond: maroon + drawn flag (never emoji)
  return '<span class="rd-chip r-r" title="'+_crbEsc(title)+'">'+(_flagSvg||'')+ord+' rd</span>';
}

// Header text for the box, per §1.1: single live round / thread / record.
function crbHeaderLabel(responses, arenconReviews, closed){
  var nResp = (responses||[]).length;
  var nRev  = (arenconReviews||[]).length;
  if(closed) return 'Contractor Response \u2014 record';
  if((nResp + nRev) > 1) return 'Contractor Response \u2014 thread';
  return 'Contractor Response';
}

// Render ONE frozen contractor round (quiet slate, no pill, no colour).
// Rectification photos ride INSIDE the round. r2Url resolution is the caller's
// job (pass photos already resolved to { url, caption }).
function crbContractorRow(resp){
  if(resp && resp.noResponse){
    return '<div class="tr-row"><div class="claim" style="color:#928E9C;font-style:italic">'
      + 'No response received from contractor \u2014 reviewed on site by ARENCON.</div></div>';
  }
  var meta = 'ROUND '+_crbEsc(resp.round)+' \u00b7 FRT #'+_crbEsc(resp.frtInstance)
           + ' \u00b7 '+_crbEsc(resp.company)+' \u00b7 '+_crbEsc(resp.date);
  // source stamp (§1.8)
  var src = resp.source==='portal' ? ' \u00b7 via portal'+(resp.receiptNo?(' \u00b7 receipt #'+_crbEsc(resp.receiptNo)):'')
          : resp.source==='pdf'    ? ' \u00b7 via returned PDF'
          : resp.source==='manual' ? ' \u00b7 manual entry'
          : '';
  // S501: contractor self-reported status moves onto the meta/header line as a
  // quiet chip. It must never compete with the ARENCON pill (the only coloured
  // status verdict on the row), so it rides the grey meta run, not the body.
  var rep = resp.statusReported?(' \u00b7 <span class="rep">Reported \u00b7 '+_crbEsc(resp.statusReported)+'</span>'):'';
  var h = '<div class="tr-row"><div class="tr-meta"><b>'+meta+'</b>'+src+rep+'</div>';
  // S467: the S461 primitives store the body in `text`; this module's S448-era
  // schema said `comment`. Accept both — without this every primitive-written
  // round (incl. the S463 PDF imports) rendered body-less in the report.
  var _rBody = (resp.text!=null&&resp.text!=='') ? resp.text : resp.comment;
  h += '<div class="claim"><span class="ctext">'+(_rBody?_crbEsc(_rBody):'')+'</span></div>';
  h += _crbAmendNote(resp);
  // rectification photos (already resolved to {url,caption})
  var rp = resp.rectPhotos||[];
  if(rp.length){
    h += '<div class="rect-lbl">RECTIFICATION PHOTOS \u2014 SUBMITTED BY CONTRACTOR, ADDED BY ARENCON</div>';
    h += '<div class="rphotos">';
    rp.forEach(function(p){
      var bg = p.url ? ' style="background-image:url('+_crbEsc(p.url)+')"' : '';
      var lbl = p.caption ? _crbEsc(p.caption) : '';
      // wrap in <a> when a url exists so the export link-annotation layer makes
      // it clickable in-report and in-PDF (3. R2 clickable links, activates w/ 1a)
      var tile = '<div class="rphoto"'+bg+'>'+lbl+'</div>';
      h += p.url ? ('<a href="'+_crbEsc(p.url)+'">'+tile+'</a>') : tile;
    });
    h += '</div>';
  }
  h += '</div>';
  return h;
}

// Render ONE ARENCON review row — the only coloured/authoritative row.
// pillFor(status) is passed from pdf.js so pill class canon stays single-source.
function crbReviewRow(rev, pillClsResolver){
  var meta = 'ARENCON REVIEW \u00b7 FRT #'+_crbEsc(rev.frtInstance)+' \u00b7 '+_crbEsc(rev.date);
  // S473: a null status is a comment/question, not a verdict — no pill.
  var pillHtml='';
  if(rev.status){
    var pillCls = pillClsResolver ? pillClsResolver(rev.status)
                : (rev.status==='closed'?'pill-c':rev.status==='low'?'pill-l':'pill-h');
    var pillTxt = rev.status==='closed'?'Closed':'Outstanding';
    pillHtml='&nbsp;<span class="pill '+pillCls+'">'+pillTxt+'</span>';
  }
  var h = '<div class="tr-row arv"><div class="tr-meta"><b>'+meta+'</b>'+pillHtml+'</div>';
  // S467: accept `text` (S461 primitive schema) alongside legacy `comment`.
  var _vBody = (rev.text!=null&&rev.text!=='') ? rev.text : rev.comment;
  if(_vBody) h += '<p>'+_crbEsc(_vBody)+'</p>';
  h += _crbAmendNote(rev);
  var fp = rev.followupPhotos||[];
  if(fp.length){
    h += '<div class="rect-lbl">ARENCON FOLLOW-UP PHOTOS ('+fp.length+')</div>';
    h += '<div class="rphotos">';
    fp.forEach(function(p){
      var bg = p.url ? ' style="background-image:url('+_crbEsc(p.url)+')"' : '';
      var tile = '<div class="rphoto"'+bg+'>'+(p.caption?_crbEsc(p.caption):'')+'</div>';
      h += p.url ? ('<a href="'+_crbEsc(p.url)+'">'+tile+'</a>') : tile;
    });
    h += '</div>';
  }
  h += '</div>';
  return h;
}

// S467: render ONE migrated site-log row (source:'sitelog' — pre-thread history
// carried in from the old activity[] system by the S464 migration). Locked
// grammar: grey, quiet, visually distinct from formal rounds; NO status pill and
// no "ARENCON REVIEW" label — a casual site note is not the authoritative review
// row, and printing one as such would rewrite history as something it wasn't.
function crbSitelogRow(entry){
  var meta = 'SITE LOG \u00b7 '+_crbEsc(entry.author||'ARENCON')+' \u00b7 '+_crbEsc(entry.date)
           + (entry.frtInstance?(' \u00b7 FRT #'+_crbEsc(entry.frtInstance)):'');
  var body = (entry.text!=null&&entry.text!=='') ? entry.text : entry.comment;
  var h = '<div class="tr-row"><div class="tr-meta" style="color:#928E9C"><b>'+meta+'</b></div>';
  if(body) h += '<div class="claim" style="color:#6B7280">'+_crbEsc(body)+'</div>';
  h += '</div>';
  return h;
}

// Build the full real-data thread body for one observation. Interleaves
// contractor rounds and ARENCON reviews in chronological (round, then review)
// order, appends the live fillable band on OPEN items only. _crbFillHtml is
// passed in (pdf.js _CRB_FILL) so the fillable grammar stays single-source.
//
// Returns { header, chip, body } or null when there is nothing to render
// (no responses, no reviews, and not open — i.e. leave the card untouched).
// Thread compression (locked §1.4): rounds whose report instance is OLDER than
// the immediately-previous report (currentInstance-1) collapse into ONE grey
// summary line, protecting pagination on long-running items. Rounds at
// currentInstance-1 and newer print in full. Only leading, contiguous old
// rounds are collapsed — the recent tail always prints verbatim.
//
// Grammar (matches _CRB_SAMPLES_OPEN[2]):
//   "ROUNDS a–b · FRT #x–#y — earlier exchange on record in FRT #<prev>"
// with a one-line quiet-slate gloss summarising the reported/held pattern.
// Single collapsed round degrades to "ROUND a · FRT #x".
function crbCompressionRow(collapsed, prevInstance){
  if(!collapsed.length) return '';
  var rA = collapsed[0].round, rB = collapsed[collapsed.length-1].round;
  var iA = collapsed[0].frtInstance, iB = collapsed[collapsed.length-1].frtInstance;
  var meta = (rA===rB)
    ? ('ROUND '+_crbEsc(rA)+' \u00b7 FRT #'+_crbEsc(iA))
    : ('ROUNDS '+_crbEsc(rA)+'\u2013'+_crbEsc(rB)+' \u00b7 FRT #'+_crbEsc(iA)+'\u2013#'+_crbEsc(iB));
  meta += ' \u2014 earlier exchange on record in FRT #'+_crbEsc(prevInstance);
  // Quiet-slate gloss: name the outcome pattern without re-printing each round.
  var anyReview = collapsed.some(function(c){ return c.hadReview; });
  var gloss = anyReview
    ? 'Contractor responded across earlier rounds; ARENCON held the item Outstanding.'
    : 'Earlier contractor rounds on record; no ARENCON review recorded in those reports.';
  return '<div class="tr-row"><div class="tr-meta"><b>'+meta+'</b></div>'
       + '<div class="claim" style="color:#928E9C">'+_crbEsc(gloss)+'</div></div>';
}

function crbBuildRealThread(opts){
  // opts: { obs, currentInstance, closed, pillClsResolver, flagSvg, fillHtml, resolvePhoto }
  var obs = opts.obs || {};
  // S467: three stream rules before round-merging —
  //   • removed (soft-deleted, S464 model) entries never print;
  //   • source:'sitelog' reviews are pre-thread history: extracted here and
  //     rendered FIRST as grey rows. They must not enter byRound: they all
  //     carry round 0, and byRound keeps ONE review per round — multiple
  //     sitelog entries would silently clobber each other.
  var responses = (obs.responses || []).filter(function(r){ return r && !r.removed; });
  var _allRev   = (obs.arenconReviews || []).filter(function(v){ return v && !v.removed; });
  var sitelogs  = _allRev.filter(function(v){ return v.source==='sitelog'; })
                         .sort(function(a,b){ return String(a.date||'').localeCompare(String(b.date||'')); });
  var reviews   = _allRev.filter(function(v){ return v.source!=='sitelog'; });
  var closed    = !!opts.closed;

  // Nothing to show and item is closed with no history → skip the box entirely.
  if(!responses.length && !reviews.length && !sitelogs.length && closed) return null;

  var noted = obs.notedOnInstance || 1;
  var chip  = crbRoundChip(opts.currentInstance, noted, opts.flagSvg);
  var header= crbHeaderLabel(responses, reviews, closed);

  // Merge the two streams by round, contractor row before its review.
  var byRound = {};
  responses.forEach(function(r){ (byRound[r.round]=byRound[r.round]||{}).resp=r; });
  reviews.forEach(function(v){ (byRound[v.round]=byRound[v.round]||{}).rev=v; });
  var rounds = Object.keys(byRound).map(Number).sort(function(a,b){return a-b;});

  // Photo resolution hook: caller maps {r2Key} → {url,caption}. Default: no url.
  var resolve = opts.resolvePhoto || function(p){ return { url:null, caption:p&&p.caption }; };
  function resolveList(arr){ return (arr||[]).map(resolve); }

  // ── Thread compression (§1.4) ──────────────────────────────────────────────
  // The report instance of a round: prefer an explicit frtInstance on the
  // contractor/review cell; fall back to notedOnInstance + (round-1). A round is
  // "old" when its instance is strictly before the previous report
  // (currentInstance-1). Collapse only the LEADING contiguous run of old rounds;
  // the moment a round is recent, the rest of the tail prints in full (a later
  // old-instance round is unusual and not hidden).
  var curInst  = Number(opts.currentInstance)||1;
  var prevInst = curInst - 1;
  function instanceOf(rn){
    var cell = byRound[rn];
    var fi = (cell.resp && cell.resp.frtInstance) || (cell.rev && cell.rev.frtInstance);
    return Number(fi) || (noted + (rn - 1));
  }
  var collapsed = [], tail = [], sawRecent = false;
  rounds.forEach(function(rn){
    var inst = instanceOf(rn);
    if(!sawRecent && inst < prevInst){
      collapsed.push({ round: rn, frtInstance: inst, hadReview: !!(byRound[rn].rev) });
    }else{
      sawRecent = true;
      tail.push(rn);
    }
  });
  // Never collapse a lone round to a summary that's longer than the round itself;
  // a single old round is cheap to keep — only compress 2+.
  if(collapsed.length < 2){ tail = collapsed.map(function(c){return c.round;}).concat(tail); collapsed = []; }

  var body = '';
  // S467: migrated site-log history prints first — it predates the thread.
  sitelogs.forEach(function(sl){ body += crbSitelogRow(sl); });
  if(collapsed.length){
    body += crbCompressionRow(collapsed, prevInst);
  }
  tail.forEach(function(rn){
    var cell = byRound[rn];
    if(cell.resp){
      var rc = Object.assign({}, cell.resp, { rectPhotos: resolveList(cell.resp.rectPhotos) });
      body += crbContractorRow(rc);
    }
    if(cell.rev){
      var vc = Object.assign({}, cell.rev, { followupPhotos: resolveList(cell.rev.followupPhotos) });
      body += crbReviewRow(vc, opts.pillClsResolver);
    }
  });

  if(closed){
    body += '<div class="closednote">Closed items carry no fillable field. '
          + 'This item moves to Previously Closed on the next report.</div>';
  }else{
    // live fillable band (grammar owned by pdf.js _CRB_FILL)
    body += '<div class="tr-row live"><div class="tr-meta"><b>ROUND '
          + (rounds.length? (Math.max.apply(null,rounds)+1) : 1)
          + ' \u2014 RESPOND ON THIS REPORT</b></div>' + (opts.fillHtml||'') + '</div>';
  }

  return { header: header, chip: chip, body: body };
}

// Export for pdf.js. ES module + a window fallback so a classic-script include
// also works. Nothing here runs on import.
export {
  crbRoundChip, crbHeaderLabel, crbContractorRow, crbReviewRow, crbSitelogRow, crbBuildRealThread
};
if(typeof window!=='undefined'){
  window._crbRender = {
    crbRoundChip: crbRoundChip, crbHeaderLabel: crbHeaderLabel,
    crbContractorRow: crbContractorRow, crbReviewRow: crbReviewRow,
    crbSitelogRow: crbSitelogRow, crbBuildRealThread: crbBuildRealThread
  };
}

