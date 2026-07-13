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

// S478: the photo surface comes from the SHARED engine. Every ARENCON tool's
// photo input renders from this one module — three buttons (Camera / Upload /
// Gallery) plus drag-drop, always. That is what stops the gallery, the pin
// editor, and this composer drifting into three different photo zones again.
import { PhotoInput } from '../../../lib/ui/photoInput.js';

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

function _photoStrip(list, ids, entryId){
  var ps=(list||[]).filter(function(p){return p&&!p.deleted&&!p.purged;});
  if(!ps.length) return '';
  // S478 (Mark: "thumbnail is a little too small and clicking on it needs to
  // open lightbox too"). Was a 42px decorative square with no click target — you
  // could see that a photo existed but never actually LOOK at it, which is the
  // one thing you want to do with a rectification photo. Now a real tile, and it
  // opens the lightbox like every other photo in the app.
  var base = ids
    ? (' data-defic-id="'+_esc(ids.deficId)+'" data-obs-idx="'+ids.obsIdx+'" data-entry-id="'+_esc(entryId||'')+'"')
    : '';
  var h='<div class="crbt-photos">';
  ps.forEach(function(p,i){
    var u=_phUrl(p);
    var cap=p.caption?_esc(p.caption):'';
    if(u){
      h+='<div class="crbt-ph" role="button" tabindex="0"'
        +' data-action="crbt-ph-open"'+base+' data-photo-idx="'+i+'"'
        +' style="background-image:url(\''+_esc(u)+'\')" title="'+(cap||'Open photo')+'">'
        +'<span class="crbt-ph-zoom" aria-hidden="true">\u2922</span>'
        +'</div>';
    }else{
      h+='<div class="crbt-ph crbt-ph-empty">'+(cap||'photo')+'</div>';
    }
  });
  h+='</div>';
  return h;
}

// One contractor comment (blue side). Verbatim text; status bolded when the
// round carried one; provenance chip per source (§1.8 mirror of the report).
function _ctrSide(e, company, ids){
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
  h+=_photoStrip(e.rectPhotos, ids, e.id);
  return h; // caller closes .crbt-side after nesting replies
}

// One ARENCON comment (burgundy-edged side). The only authoritative voice —
// it carries the status pill it set. Sitelog rows are handled separately.
function _arcSide(e, ids){
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
  h+=_photoStrip(e.followupPhotos, ids, e.id);
  return h; // caller closes
}

// Grey site-log row — pre-thread history migrated from activity[] (S464).
// No pill, no authoritative label: history is never rewritten as something
// it wasn't.
function _sitelogRow(e, ids){
  var h='<div class="crbt-side crbt-log" data-entry-id="'+_esc(e.id)+'">';
  h+='<div class="crbt-who crbt-who-log">Site log \u00b7 '+_esc(e.author||'ARENCON')
    +'<span class="crbt-when">'+_esc(e.date||'')+'</span></div>';
  h+='<div class="crbt-t">'+_esc(e.text||'')+'</div>';
  h+=_photoStrip(e.followupPhotos, ids, e.id);
  return h; // caller appends the action row, then closes .crbt-side
}

// ── S473 (A1): action row per comment — locked order ↩ Reply · ✎ Edit · 🗑.
// (+ Photo arrives with A2; a dead button is worse than an absent one.)
// Frozen (issued) comments: Reply stays live, the rest grey with a tooltip
// stating why. Edit only on ARENCON's own draft comments — contractor words
// are never ours to rewrite, even in draft (remove and re-add instead).
// S478 (Mark: "too many buttons"): a thread of six comments used to paint
// EIGHTEEN controls before you had done anything — Reply/Edit/🗑 on every row,
// permanently. Now the row actions are quiet until the row is engaged: hover on
// a fine pointer, tap-to-focus on a coarse one (see .crbt-side.crbt-on in CSS).
// The buttons are always in the DOM — this is a reveal, never a removal, so
// nothing is unreachable and no keyboard/AT path is broken.
function _actionRow(e, kind, ids){
  var frozen = e.issuedOnInstance!=null;
  var base=' data-defic-id="'+_esc(ids.deficId)+'" data-obs-idx="'+ids.obsIdx+'" data-entry-id="'+_esc(e.id)+'"';
  var h='<div class="crbt-acts">';
  h+='<button class="crbt-act" data-action="crbt-reply"'+base+'>\u21A9 Reply</button>';
  if(kind==='a'&&e.source!=='sitelog'){
    h+= frozen
      ? '<button class="crbt-act crbt-frozen" title="Printed in FRT #'+_esc(e.issuedOnInstance)+' \u2014 the record can\u2019t be edited">\u270E Edit</button>'
      : '<button class="crbt-act" data-action="crbt-edit"'+base+'>\u270E Edit</button>';
  }else if(kind==='c'){
    h+='<button class="crbt-act crbt-frozen" title="Contractor\u2019s words \u2014 not ours to edit. Remove and re-add.">\u270E Edit</button>';
  }
  h+= frozen
    ? '<button class="crbt-act crbt-frozen" title="Printed in FRT #'+_esc(e.issuedOnInstance)+' \u2014 the record can\u2019t be removed">\uD83D\uDDD1</button>'
    : '<button class="crbt-act crbt-danger" data-action="crbt-remove"'+base+' title="Remove (undoable)">\uD83D\uDDD1</button>';
  h+='</div>';
  return h;
}

// S473: a removed draft renders as a collapsed grey stub — attributed, dated,
// with Undo one tap away. Nothing vanishes silently (locked §3).
function _removedStub(e, ids){
  return '<div class="crbt-removedstub" data-entry-id="'+_esc(e.id)+'">'
    +'Comment removed'+(e.removedBy?(' by '+_esc(e.removedBy)):'')+(e.removedAt?(' \u00b7 '+_esc(e.removedAt)):'')
    +' <button class="crbt-act" data-action="crbt-restore" data-defic-id="'+_esc(ids.deficId)+'" data-obs-idx="'+ids.obsIdx+'" data-entry-id="'+_esc(e.id)+'">Undo</button>'
    +'</div>';
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
  var ids={deficId:(opts.defic&&opts.defic.id)||'',obsIdx:(opts.obsIdx!=null?opts.obsIdx:0)};
  var closed=!!opts.closed;
  // S473: removed entries render as Undo stubs on the card (locked §3 —
  // attributed, dated, undoable), so they stay in the working sets here.
  var responses=(obs.responses||[]).filter(function(r){return !!r;});
  var allRev=(obs.arenconReviews||[]).filter(function(v){return !!v;});
  var sitelogs=allRev.filter(function(v){return v.source==='sitelog';})
    .sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));});
  var reviews=allRev.filter(function(v){return v.source!=='sitelog';});
  var hasContent=!!(responses.length||reviews.length||sitelogs.length);
  if(!hasContent&&closed) return '';

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
  // S475 (Mark: a chain of stubs wastes space): removed entries are POOLED
  // into one folded line at the thread's foot — "N removed · Show" — instead
  // of holding their positions. Undo stays one tap away; the S474 issued-line
  // window still retires them entirely at the next Issue.
  var _removedPool=[];
  function _poolRemoved(e){
    if((Number(e.frtInstance)||1) < curInst) return;   // S474 window closed
    _removedPool.push(e);
  }
  function renderWithReplies(e,kind){
    if(e.removed){ _poolRemoved(e); return ''; }
    var h=(kind==='c')?_ctrSide(e,opts.company,ids):_arcSide(e,ids);
    h+=_actionRow(e,kind,ids);
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

  var h='<div class="crbt" data-defic-id="'+_esc(ids.deficId)+'" data-obs-idx="'+ids.obsIdx+'">';
  if(sitelogs.length){
    h+='<div class="crbt-round"><div class="crbt-rhead crbt-rhead-log">Site log \u2014 pre-thread history</div><div class="crbt-pair">';
    sitelogs.forEach(function(sl){
      if(sl.removed){ _poolRemoved(sl); return; }
      // Sitelog rows: verbatim history — no Edit; Reply + 🗑 live (drafts).
      h+=_sitelogRow(sl,ids)+_actionRow(sl,'log',ids)+'</div>';
    });
    h+='</div></div>';
  }
  rounds.forEach(function(rn){
    var cell=byRound[rn];
    if(cell.every(function(x){return x.e.removed;})){
      cell.forEach(function(x){_poolRemoved(x.e);});
      return;   // a round of nothing but removed drafts renders no header
    }
    cell.sort(function(x,y){
      if(x.kind!==y.kind)return x.kind==='c'?-1:1;                 // contractor first
      return String(x.e.date||'').localeCompare(String(y.e.date||''));
    });
    // Round state considers only rows still standing (a removed draft must
    // not hold a round in DRAFT forever).
    var live=cell.filter(function(x){return !x.e.removed;});
    var allIssued=live.length>0&&live.every(function(x){return x.e.issuedOnInstance!=null;});
    var issuedInst=allIssued?live[0].e.issuedOnInstance:null;
    var tag=allIssued
      ? '<span class="crbt-issuedtag">ISSUED \u00b7 FRT #'+_esc(issuedInst)+'</span>'
      : '<span class="crbt-drafttag">DRAFT \u00b7 prints on FRT #'+_esc(curInst)+'</span>';
    h+='<div class="crbt-round">';
    h+='<div class="crbt-rhead"><span class="crbt-rnum">R'+_esc(rn)+'</span> Round '+_esc(rn)+' '+tag+'</div>';
    h+='<div class="crbt-pair">';
    cell.forEach(function(x){h+=renderWithReplies(x.e,x.kind);});
    h+='</div></div>';
  });
  if(_removedPool.length){
    h+='<div class="crbt-stubfold">'
      +'<button class="crbt-act" data-action="crbt-showstubs">'
      +_removedPool.length+' removed comment'+(_removedPool.length>1?'s':'')
      +' \u00b7 <span class="crbt-stubtoggle">Show</span></button>'
      +'<div class="crbt-stublist" style="display:none;">';
    _removedPool.forEach(function(e){h+=_removedStub(e,ids);});
    h+='</div></div>';
  }
  // ── S473 (A1): open-round footer — the entry point for new comments.
  // Renders whenever the item is open, INCLUDING an empty thread (otherwise
  // there is no way to start one). Locked §2: "+ Add comment" (quiet) and
  // "Record no reply"; the old burgundy modal buttons are retired.
  if(!closed){
    var openRound=1;
    rounds.forEach(function(rn){if(rn>=openRound)openRound=rn+1;});
    var curRound=Math.max(openRound,(curInst-(Number(obs.notedOnInstance)||1))+1);
    // S478 (Mark: "too many buttons — overwhelming where to click"): the open
    // round is now ONE control. Previously it showed "+ Add comment" AND
    // "Record no reply" AND an already-open composer carrying its own Cancel +
    // Add comment — the button and the thing the button opens, side by side.
    // Half the clutter was that duplication. Now: one Respond button, and when
    // it opens the composer it REMOVES ITSELF (see the crbt-addcomment handler),
    // so the two are never on screen together.
    // "No reply" is not a peer of "respond" — it is one of the things you might
    // do when responding — so it lives inside the composer as a quiet link.
    h+='<div class="crbt-openround">';
    h+='<div class="crbt-openlbl">Round '+curRound+' \u2014 respond</div>';
    h+='<div class="crbt-openbtns">';
    h+='<button class="crbt-btn crbt-respond" data-action="crbt-addcomment" data-defic-id="'+_esc(ids.deficId)+'" data-obs-idx="'+ids.obsIdx+'" data-round="'+curRound+'">Respond</button>';
    h+='</div></div>';
  }
  h+='</div>';
  return h;
}

// ══ S473 (A1) / S478 (redesign) — THE INLINE COMPOSER ═════════════════════
// Built on demand by the delegate, one at a time, never a modal (locked §6).
//
// S478 (Mark: "too many buttons — hard even for me to figure out where I'm
// clicking"). The old composer stacked NINE controls to leave one sentence, and
// the round above it added two more that duplicated the composer's own. What
// changed:
//   • The composer only exists once you ask for it, and the Respond button that
//     opened it is REMOVED — the button and the thing it opens are never both
//     on screen.  (That duplication was half the clutter.)
//   • Voice is a MODE, not an action — a quiet segmented control, not two
//     buttons competing for attention with the real actions.
//   • Photos are ONE surface via the shared engine (Camera / Upload / Gallery,
//     drag-drop) — identical here, in Diesel, and in every tool that follows.
//   • "No reply" is not a peer of "respond"; it is something you may do WHILE
//     responding. It becomes a quiet link on the footer, out of the way.
// Result: 18 controls at rest → 1. Composing → 6.
export function buildComposerHtml(o){
  var v=o.voice==='c'?'c':'a';
  var h='<div class="crbt-composer" data-defic-id="'+_esc(o.deficId)+'" data-obs-idx="'+o.obsIdx+'"'
      +(o.replyTo?(' data-reply-to="'+_esc(o.replyTo)+'"'):'')
      +' data-round="'+_esc(o.round)+'">';

  // Voice — a segmented control. Reads as a setting, not a call to action.
  h+='<div class="crbt-voice">'
    +'<span class="crbt-vlab">'+(o.replyTo?'Reply as':'Comment as')+'</span>'
    +'<div class="crbt-seg">'
      +'<button type="button" class="crbt-vopt'+(v==='a'?' crbt-von':'')+'" data-action="crbt-voice" data-v="a">ARENCON</button>'
      +'<button type="button" class="crbt-vopt'+(v==='c'?' crbt-von':'')+'" data-action="crbt-voice" data-v="c">Contractor</button>'
    +'</div>'
  +'</div>';

  h+='<textarea class="crbt-ta" placeholder="'+(v==='c'
      ? 'Contractor\u2019s words, verbatim \u2014 logged as MANUAL, attributed to you.'
      : (o.replyTo?'Your response to this comment\u2026':'Your comment\u2026'))+'"></textarea>';

  // ══ PHOTOS — the SHARED engine (lib/ui/photoInput.js) ═══════════════════
  // Camera / Upload (dusty blue) / Gallery + drag-drop. Not hand-rolled here:
  // this is the same surface every ARENCON tool renders, so it can never drift
  // out of step with the gallery or the pin editor again.
  //
  // Staging, not attaching. A photo dropped here has NO comment to attach to
  // yet — the entry does not exist until Submit. Files land in a staging tray
  // and flush onto the entry only AFTER the model creates it and stamps an id.
  // An id-less photo is silently discarded by merge.
  h+=PhotoInput.html({ ns:'crbt', ctx:{ 'defic-id':o.deficId, 'obs-idx':o.obsIdx } });
  h+='<div class="crbt-tray"></div>';   // staging thumbnails render here

  h+='<div class="crbt-cfoot">'
    +'<button type="button" class="crbt-link" data-action="crbt-noreply" data-defic-id="'+_esc(o.deficId)+'" data-obs-idx="'+o.obsIdx+'" data-round="'+_esc(o.round)+'">No reply received</button>'
    +'<span class="crbt-sp"></span>'
    +'<button type="button" class="crbt-btn" data-action="crbt-cancel">Cancel</button>'
    +'<button type="button" class="crbt-btn crbt-primary" data-action="crbt-submit">'+(o.replyTo?'Add reply':'Add comment')+'</button>'
  +'</div>';
  h+='</div>';
  return h;
}

// ── S477 (A2) — staging tray render ──────────────────────────────────────
// `items` are staged, NOT-yet-persisted photos: {tmpId, dataUrl, file, name}.
// Rendered from the dataUrl only — nothing here has an R2 key yet, by design.
export function buildTrayHtml(items){
  var ls=(items||[]);
  if(!ls.length) return '';
  var h='<div class="crbt-tray-in">';
  ls.forEach(function(p){
    h+='<div class="crbt-tph" style="background-image:url(\''+_esc(p.dataUrl||'')+'\')">'
      +'<button class="crbt-tph-x" data-action="crbt-ph-drop" data-tmp-id="'+_esc(p.tmpId)+'" '
      +'title="Remove this photo" aria-label="Remove this photo">\u00D7</button>'
      +'</div>';
  });
  h+='</div>';
  h+='<div class="crbt-tray-note">'+ls.length+' photo'+(ls.length===1?'':'s')
    +' will upload when you add the comment</div>';
  return h;
}
