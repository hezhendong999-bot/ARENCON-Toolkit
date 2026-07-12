// ─────────────────────────────────────────────────────────────────────────
// crbThread.js — CRB Phase 2 step 2: READ-ONLY thread render on the
// deficiency card (S471).
//
// DESIGN AUTHORITY: LOCKED_CRB_THREAD_UI.md + crb_thread_final.html — built
// to match the approved demo's grammar exactly:
//   .crbt-round > .crbt-rhead (R# · ISSUED/DRAFT tag) + .crbt-pair
//   .crbt-side.crbt-c (contractor: blue tint) / .crbt-side.crbt-a (ARENCON:
//   card bg, 3px burgundy left edge — burgundy is a signal, not a default)
//   .crbt-replies — replies nest ONE level under the comment they answer
//   sitelog rows — grey, quiet, pre-thread history (S464 migration)
//
// READ-ONLY BY DESIGN (build order step 2): no action rows, no composers —
// dead buttons are worse than absent ones. Step 3 (reply/edit/remove) adds
// the interactive layer onto these same rows.
//
// All functions are PURE — they render existing model data, never mutate.
// CSS lives in frt.css PART "CRB THREAD (S471)".
// ─────────────────────────────────────────────────────────────────────────

function _esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// Displayable url for a thread photo {r2Key,r2Url,caption}. R2 GET is
// unauthenticated, so the stored r2Url renders directly; dataUrl (fresh,
// not-yet-uploaded) wins when present.
function _phUrl(ph){
  if(!ph) return '';
  return ph.dataUrl || ph.r2Url || '';
}

function _photoStrip(list){
  var ps=(list||[]).filter(function(p){return p&&!p.deleted&&!p.purged;});
  if(!ps.length) return '';
  var h='<div class="crbt-photos">';
  ps.forEach(function(p){
    var u=_phUrl(p);
    var cap=p.caption?_esc(p.caption):'';
    if(u){
      h+='<div class="crbt-ph" style="background-image:url(\''+_esc(u)+'\')" title="'+cap+'"></div>';
    }else{
      h+='<div class="crbt-ph crbt-ph-empty">'+(cap||'photo')+'</div>';
    }
  });
  h+='</div>';
  return h;
}

// One contractor comment (blue side). Verbatim text; status bolded when the
// round carried one; provenance chip per source (§1.8 mirror of the report).
function _ctrSide(e, company){
  var src = e.source==='portal' ? 'PORTAL'
          : e.source==='pdf'    ? 'PDF'
          : e.source==='manual' ? 'MANUAL' : '';
  var who = 'Contractor'+(company?(' \u00b7 '+_esc(company)):'')
          + (src?(' <span class="crbt-src">'+src+'</span>'):'')
          + '<span class="crbt-when">'+_esc(e.date||'')
          + (e.source==='manual'&&e.author?(' \u00b7 by '+_esc(e.author)):'')+'</span>';
  var body = e.noResponse
    ? '<span class="crbt-noresp">No response received from contractor \u2014 reviewed on site by ARENCON.</span>'
    : ((e.statusReported?('<b>'+_esc(e.statusReported)+'</b>'+((e.text)?' \u2014 ':'')):'')+_esc(e.text||''));
  var h='<div class="crbt-side crbt-c" data-entry-id="'+_esc(e.id)+'">';
  h+='<div class="crbt-who">'+who+'</div>';
  h+='<div class="crbt-t">'+body
    +(e.withdrawn?' <span class="crbt-withdrawn">withdrawn from re-sent sheet</span>':'')
    +(e.orphaned?' <span class="crbt-orphan">\u2014 the comment this answered was removed</span>':'')
    +'</div>';
  h+=_photoStrip(e.rectPhotos);
  return h; // caller closes .crbt-side after nesting replies
}

// One ARENCON comment (burgundy-edged side). The only authoritative voice —
// it carries the status pill it set. Sitelog rows are handled separately.
function _arcSide(e){
  var who='ARENCON review'+(e.author?(' \u00b7 '+_esc(e.author)):'')
        +'<span class="crbt-when">'+_esc(e.date||'')+'</span>';
  var pill='';
  if(e.status==='closed')      pill=' <span class="crbt-pill crbt-pill-c">Closed</span>';
  else if(e.status==='low')    pill=' <span class="crbt-pill crbt-pill-l">Low priority</span>';
  else if(e.status==='high')   pill=' <span class="crbt-pill crbt-pill-h">Outstanding</span>';
  var h='<div class="crbt-side crbt-a" data-entry-id="'+_esc(e.id)+'">';
  h+='<div class="crbt-who">'+who+'</div>';
  h+='<div class="crbt-t">'+_esc(e.text||'')+pill
    +(e.edited?' <span class="crbt-edited">edited</span>':'')
    +(e.orphaned?' <span class="crbt-orphan">\u2014 the comment this answered was removed</span>':'')
    +'</div>';
  h+=_photoStrip(e.followupPhotos);
  return h; // caller closes
}

// Grey site-log row — pre-thread history migrated from activity[] (S464).
// No pill, no authoritative label: history is never rewritten as something
// it wasn't.
function _sitelogRow(e){
  var h='<div class="crbt-side crbt-log" data-entry-id="'+_esc(e.id)+'">';
  h+='<div class="crbt-who crbt-who-log">Site log \u00b7 '+_esc(e.author||'ARENCON')
    +'<span class="crbt-when">'+_esc(e.date||'')+'</span></div>';
  h+='<div class="crbt-t">'+_esc(e.text||'')+'</div>';
  h+=_photoStrip(e.followupPhotos);
  h+='</div>';
  return h;
}

/**
 * Build the read-only thread HTML for one observation.
 * @param {object} opts { defic, obs, company, currentInstance }
 * @returns {string} '' when there is nothing to show (caller keeps its
 *   legacy activity render as the sole content).
 */
export function buildThreadHtml(opts){
  var obs=opts.obs||{};
  var curInst=Number(opts.currentInstance)||1;
  var responses=(obs.responses||[]).filter(function(r){return r&&!r.removed;});
  var allRev=(obs.arenconReviews||[]).filter(function(v){return v&&!v.removed;});
  var sitelogs=allRev.filter(function(v){return v.source==='sitelog';})
    .sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));});
  var reviews=allRev.filter(function(v){return v.source!=='sitelog';});
  if(!responses.length&&!reviews.length&&!sitelogs.length) return '';

  // Split top-level comments from replies (one level, locked §2).
  var byId={};
  responses.forEach(function(e){byId[e.id]=e;});
  reviews.forEach(function(e){byId[e.id]=e;});
  function repliesTo(id){
    var out=[];
    responses.forEach(function(e){if(e.replyTo===id)out.push({e:e,kind:'c'});});
    reviews.forEach(function(e){if(e.replyTo===id)out.push({e:e,kind:'a'});});
    out.sort(function(x,y){return String(x.e.date||'').localeCompare(String(y.e.date||''));});
    return out;
  }
  function renderWithReplies(e,kind){
    var h=(kind==='c')?_ctrSide(e,opts.company):_arcSide(e);
    var reps=repliesTo(e.id);
    if(reps.length){
      h+='<div class="crbt-replies">';
      reps.forEach(function(r){h+=renderWithReplies(r.e,r.kind);});
      h+='</div>';
    }
    h+='</div>'; // close .crbt-side
    return h;
  }
  // A reply whose parent is gone entirely (not just removed→orphan-flagged)
  // renders top-level rather than vanishing.
  function isTop(e){return !e.replyTo||!byId[e.replyTo];}

  // Group top-level comments by round; contractor before review within a round.
  var byRound={};
  responses.forEach(function(e){if(isTop(e)){(byRound[e.round]=byRound[e.round]||[]).push({e:e,kind:'c'});}});
  reviews.forEach(function(e){if(isTop(e)){(byRound[e.round]=byRound[e.round]||[]).push({e:e,kind:'a'});}});
  var rounds=Object.keys(byRound).map(Number).sort(function(a,b){return a-b;});

  var h='<div class="crbt">';
  if(sitelogs.length){
    h+='<div class="crbt-round"><div class="crbt-rhead crbt-rhead-log">Site log \u2014 pre-thread history</div><div class="crbt-pair">';
    sitelogs.forEach(function(sl){h+=_sitelogRow(sl);});
    h+='</div></div>';
  }
  rounds.forEach(function(rn){
    var cell=byRound[rn];
    cell.sort(function(x,y){
      if(x.kind!==y.kind)return x.kind==='c'?-1:1;                 // contractor first
      return String(x.e.date||'').localeCompare(String(y.e.date||''));
    });
    // Round state: ISSUED when every top-level comment in it is stamped;
    // DRAFT (prints on the current report) otherwise. Locked §1 grammar.
    var allIssued=cell.every(function(x){return x.e.issuedOnInstance!=null;});
    var issuedInst=allIssued?cell[0].e.issuedOnInstance:null;
    var tag=allIssued
      ? '<span class="crbt-issuedtag">ISSUED \u00b7 FRT #'+_esc(issuedInst)+'</span>'
      : '<span class="crbt-drafttag">DRAFT \u00b7 prints on FRT #'+_esc(curInst)+'</span>';
    h+='<div class="crbt-round">';
    h+='<div class="crbt-rhead"><span class="crbt-rnum">R'+_esc(rn)+'</span> Round '+_esc(rn)+' '+tag+'</div>';
    h+='<div class="crbt-pair">';
    cell.forEach(function(x){h+=renderWithReplies(x.e,x.kind);});
    h+='</div></div>';
  });
  h+='</div>';
  return h;
}
