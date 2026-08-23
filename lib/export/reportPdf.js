/* ══════════════════════════════════════════════════════════════════════════
   ARENCON Toolkit — REPORT PDF ENGINE     lib/export/reportPdf.js v0.1.0
   ──────────────────────────────────────────────────────────────────────────
   UNIFICATION PROGRAM, PHASE 4 — the shared PDF engine, opened.

   THE SHAPE OF THIS PHASE (Owner-approved): one engine, layouts as DATA.
   Section order, headings, which charts, which appendices — per-tool config,
   not per-tool code. Cover stays Dark, body stays light/printable; that canon
   is locked and nothing here touches it. The engine grows resident by
   resident, each one proven identical against Diesel's live exporter before
   the next moves in, because the acceptance for this phase is a Diesel PDF
   that is page-for-page identical to today's.

   RESIDENT 1 — APPENDIX ELIGIBILITY.
   Which photographs may appear in the client PDF's photo appendix. The
   MECHANISM is shared; the SCOPE is the tool's. Diesel's scope is an explicit
   Owner decision (S316): gauge and RPM photos, pump photos, flow-chart photos,
   placard and PLD-placard photos — no site records, no checklist, no
   deficiencies. That list arrives as configuration, so Electric can state its
   own scope without a second predicate existing anywhere. This pairs with
   PhotoInventory's live-only default: eligibility here decides WHICH KINDS,
   the inventory has already decided which photos are visible at all — a
   deleted photo never reaches this question.

   RESIDENT 2 — CHART PRINT SIZING.
   Charts are rendered for a screen and printed on paper, and the two disagree
   about resolution. The numbers are the knowledge: a 716-CSS-px stage across
   6.96 printed inches at devicePixelRatio 3 is ~308 dpi — crisp on paper
   without ballooning the canvas — and scaling height by the same factor as
   width keeps the printed aspect identical to the screen's. Just as important
   is the RESTORE: sizing returns a closure that puts every chart back exactly
   as found (style attribute, pixel ratio, and the annotation positions, which
   were computed against the print width and are wrong for the screen until
   re-placed). A missing restore is a report that prints beautifully and
   leaves the app's charts subtly broken until reload.

   HOST CONTRACT: classic <script>, publishes window.ReportPdf.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* Resident 1. `scope` is the tool's statement of what belongs in its client
   appendix: { types: [...], recordKinds: { exact:[...], substrings:[...] } }.
   An entry with no photo is never eligible, whatever the scope says. */
function appendixEligible(it, scope) {
  if (!it || !it.photo || !scope) return false;
  if ((scope.types || []).indexOf(it.type) !== -1) return true;
  if (it.type === 'record' && scope.recordKinds) {
    var k = (it.photo.kind || '');
    if ((scope.recordKinds.exact || []).indexOf(k) !== -1) return true;
    var subs = scope.recordKinds.substrings || [];
    for (var i = 0; i < subs.length; i++) {
      if (k.indexOf(subs[i]) !== -1) return true;
    }
  }
  return false;
}

/* Resident 2. `charts` is the tool's list of live chart instances; deps can
   carry `annotate(chart, canvasId)` for tools that overlay labels. Returns the
   restore closure — calling it is not optional. */
function sizeChartsForPrint(charts, deps) {
  deps = deps || {};
  var PRINT_STAGE_W = deps.stageWidthPx || 716;  // 72*10*6.96/716 = a 10px mark prints at 7.0pt
  var PRINT_DPR = deps.devicePixelRatio || 3;    // 716×3 across 6.96in ≈ 308 dpi
  var saved = [];
  (charts || []).forEach(function (c) {
    try {
      if (!c || !c.canvas) return;
      var stage = c.canvas.parentElement;
      if (!stage) return;
      var w = stage.clientWidth || 0, h = stage.clientHeight || 0;
      if (!w || !h) return;
      saved.push({ c: c, stage: stage, style: stage.getAttribute('style'),
                   dpr: (c.options ? c.options.devicePixelRatio : undefined) });
      stage.style.width = PRINT_STAGE_W + 'px';
      stage.style.height = Math.round(h * (PRINT_STAGE_W / w)) + 'px';  // same aspect => same printed height
      if (c.options) c.options.devicePixelRatio = PRINT_DPR;
      c.resize();
      (c.__origUpdate || c.update).call(c, 'none');
    } catch (_) {}
  });
  return function restore() {
    saved.forEach(function (s) {
      try {
        if (s.style === null) s.stage.removeAttribute('style');
        else s.stage.setAttribute('style', s.style);
        if (s.c.options) {
          if (s.dpr === undefined) delete s.c.options.devicePixelRatio;
          else s.c.options.devicePixelRatio = s.dpr;
        }
        s.c.resize();
        (s.c.__origUpdate || s.c.update).call(s.c, 'none');
        /* Labels were positioned against the print-width chart — re-place them
           for the screen, or they sit visibly off until the next reload. */
        if (typeof deps.annotate === 'function' && s.c.canvas) deps.annotate(s.c, s.c.canvas.id);
      } catch (_) {}
    });
  };
}


/* ── RESIDENT 3 — THE PHOTO APPENDIX ASSEMBLY (S685b) ─────────────────────
   The HTML of the client PDF's photo appendix, moved VERBATIM from Diesel's
   exporter. The report look — the navy band, the burgundy sub-heads, Calibri,
   the grid chunking — is toolkit CANON, one design system across every tool,
   which is exactly why the markup lives in the engine and not in each host.
   What each tool supplies is its DATA: how to collect its photos, which are
   eligible (its own appendix scope), which keys the user excluded in the
   pre-print picker, and its gauge-reading order.

   The phase's acceptance is a page-for-page identical Diesel PDF, and for an
   HTML assembly the strongest proof available is BYTE IDENTITY: same entries
   in, same string out, character for character, pinned by the probe against
   the pre-extraction exporter. Any edit here that changes one byte of output
   for the same inputs goes red before it can reach a client deliverable. */
function appendixHTML(deps){
  deps = deps || {};
  /* The photo-link wrapper is the host's (S521 — it is instrumented there, and
     the counts are how a missing-anchor fault is diagnosed from a tablet). A
     host that supplies none gets the cell unwrapped, never an error. */
  var _lnk = (typeof deps.link === 'function') ? deps.link : function (p, cell) { return cell; };
  try{
    if(typeof deps.collect!=='function') return '';
    var inc = deps.collect().filter(function(it){
      return deps.eligible(it) && it.src && !deps.isExcluded(deps.key(it));
    });
    if(!inc.length) return '';
    if(typeof deps.onEmitted==='function') deps.onEmitted();   // S372.5: this path always emits the Photo Appendix band
    function esc(t){ return (''+(t==null?'':t)).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
    function chunk(a,n){ var o=[]; for(var i=0;i<a.length;i+=n) o.push(a.slice(i,i+n)); return o; }
    // S372.5 unified-appendix design. ONE navy section band ("Photo Appendix");
    // every category below is a refined sub-header (burgundy left-rule + dark label
    // + hairline baseline), visually subordinate to the band and consistent across
    // charts / pump / placards / gauges / sketches. No more disconnected navy bars.
    function head(t){
      return '<div class="apx-subhead" data-subhead="'+esc(t)+'" style="display:flex;align-items:center;gap:9px;padding:16px 0 6px;margin-bottom:11px;border-bottom:1px solid #D8DCE3;">'
        +'<span style="width:4px;height:15px;background:#9C2742;border-radius:2px;display:inline-block;flex:0 0 auto;"></span>'
        +'<span style="font:700 14px Calibri,sans-serif;color:#1C2333;letter-spacing:.3px;">'+esc(t)+'</span>'
        +'</div>';
    }
    function sub(t){ return '<div style="font:700 11.5px Calibri,sans-serif;color:#9C2742;letter-spacing:.2px;padding:6px 0 4px;">'+esc(t)+'</div>'; }
    function rows(items,size){
      // returns ARRAY of row strings (each row = one bin-pack block)
      return chunk(items, size>=300?2:3).map(function(row){
        return '<div style="display:flex;gap:12px;margin-bottom:12px;">'+row.map(function(it){
          return '<div style="width:'+size+'px;height:'+size+'px;background:#f2f2f2;border:1px solid #C9CDD4;border-radius:4px;overflow:hidden;">'
            +_lnk(it.photo, '<img src="'+it.src+'" style="width:100%;height:100%;object-fit:cover;display:block;">')+'</div>';
        }).join('')+'</div>';
      });
    }
    // KEEP-WITH-NEXT (S316): the Session-53 bin-pack paginates by top-level block,
    // so a heading emitted alone can strand at a page bottom (field report). Every
    // heading/sub-label is therefore WRAPPED IN THE SAME BLOCK as its first photo
    // row; remaining rows follow as separate blocks and may break freely.
    var out='';
    function emit(label, items, size, labelFn){
      if(!items.length) return;
      var rs=rows(items,size);
      out+='<div class="apx-keep">'+labelFn(label)+rs[0]+'</div>';
      for(var i=1;i<rs.length;i++) out+=rs[i];
    }
    // The single navy section band — the appendix anchor. Emitted ONCE here as a
    // STANDALONE top-level element so the paginator's unit-grouper (which only
    // inspects direct .page children) sees the `sh` class and starts a Photo
    // Appendix unit. Wrapping it inside a section's <div> made it a grandchild →
    // invisible → the whole appendix got absorbed into the Signature unit and its
    // photos printed under "Signature (cont.)". Flow-test charts + sketches (DOM
    // divs after the appendix) continue UNDER this band as refined sub-headers.
    var _apxTitle = '<div class="sh apx-band" style="margin-top:26px;">Photo Appendix</div>';
    out += _apxTitle;
    var first=false;   // band already emitted standalone; sections no longer embed it
    // S367: active test type drives the "(3-Point)" / "(7-Point)" suffix on
    // appendix section headers so placards/charts/pump photos are unambiguous.
    var ptype='std';
    try{ document.querySelectorAll('.pump-type-btns button').forEach(function(b){ if(b.classList.contains('on')) ptype=b.dataset.ptype||'std'; }); }catch(_){}
    var ptSuffix = (ptype==='pld') ? ' (7-Point)' : ' (3-Point)';
    function sect(title, items, size){
      if(!items.length) return;
      var t=(first?_apxTitle:'');
      first=false;
      emit(title, items, size, function(l){ return t+head(l); });
    }
    // 1. Pump & Installation — TWO per row at 230x185, left-aligned
    var pmp=inc.filter(function(it){ return it.type==='record'&&(it.photo.kind==='pump'||it.photo.kind==='pump-pld'); });
    if(pmp.length){
      var tp=(first?_apxTitle:''); first=false;
      function _pmpCard(it){
        var d=''; try{ if(it.photo.date) d=new Date(it.photo.date).toLocaleDateString(); }catch(_){}
        return '<div style="width:230px;">'
          +'<div style="width:230px;height:185px;background:#f2f2f2;border:1px solid #C9CDD4;border-radius:4px;overflow:hidden;">'
          +_lnk(it.photo, '<img src="'+it.src+'" style="width:100%;height:100%;object-fit:cover;display:block;">')+'</div>'
          +(d?'<div style="font:11px Calibri,sans-serif;color:#5E5B68;padding-top:3px;text-align:center;">'+esc(d)+'</div>':'')
          +'</div>';
      }
      var pmpRows=chunk(pmp,2).map(function(pair){
        return '<div style="display:flex;gap:14px;justify-content:flex-start;margin-bottom:14px;">'+pair.map(_pmpCard).join('')+'</div>';
      });
      out+='<div class="apx-keep">'+tp+head('Pump & Installation'+ptSuffix)+pmpRows[0]+'</div>';
      for(var pm=1;pm<pmpRows.length;pm++) out+=pmpRows[pm];
    }
    // 2. Placards (incl. PLD placard) — TWO cards per row at 285x300, left-aligned
    var plc=inc.filter(function(it){ return it.type==='record'&&(it.photo.kind||'').indexOf('placard')!==-1; });
    if(plc.length){
      var t2=(first?_apxTitle:''); first=false;
      var plcHdr=(plc[0].photo.kind==='placard-pld'?'PLD Placard (7-Point)':'Pump Placard (3-Point)');
      function _plcCard(it){
        var d=''; try{ if(it.photo.date) d=new Date(it.photo.date).toLocaleDateString(); }catch(_){}
        return '<div style="width:285px;">'
          +'<div style="width:285px;height:300px;background:#f2f2f2;border:1px solid #C9CDD4;border-radius:4px;overflow:hidden;">'
          +_lnk(it.photo, '<img src="'+it.src+'" style="width:100%;height:100%;object-fit:contain;display:block;">')+'</div>'
          +(d?'<div style="font:11px Calibri,sans-serif;color:#5E5B68;padding-top:3px;text-align:center;">'+esc(d)+'</div>':'')
          +'</div>';
      }
      var plcRows=chunk(plc,2).map(function(pair){
        return '<div style="display:flex;gap:14px;justify-content:flex-start;margin-bottom:16px;">'+pair.map(_plcCard).join('')+'</div>';
      });
      out+='<div class="apx-keep">'+t2+head(plcHdr)+plcRows[0]+'</div>';
      for(var pr=1;pr<plcRows.length;pr++) out+=plcRows[pr];
    }
    // 3. Gauge & RPM — Option C: ONE row per flow point. All readings for that
    //    point flow left-to-right (fixed order S·D·BFi·BFo·RPM·PRV·PRdV) and wrap
    //    when the line is full; each photo captioned with its reading. For 7-Point
    //    (PLD) the caption also notes without/with PLD. The flow-point sub-header
    //    travels with its first photos (keep-with-next).
    // S372 fix: emit gauge photos for BOTH pump types (3-Point std + 7-Point PLD),
    // not just whichever pump-type toggle happened to be active at print time. A
    // marked-up 7-point photo was silently dropped from the report when generated
    // on the 3-point view. Each type prints its own header only if it has photos.
    var _gaugeTypes=[
      { gType:'gauge',     rows:(typeof stdData!=='undefined'?stdData:[]), prefix:'gauge_std_', isPld:false, suffix:'3-Point' },
      { gType:'gauge-pld', rows:(typeof pldData!=='undefined'?pldData:[]), prefix:'gauge_pld_', isPld:true,  suffix:'7-Point' }
    ];
    var _rdOrderG=(deps.gaugeReadings||[]);
    _gaugeTypes.forEach(function(GT){
      var gItems=inc.filter(function(it){ return it.type===GT.gType; });
      if(!gItems.length) return;
      var hdrDone=false;
      var gh=(first?_apxTitle:''); first=false;
      function _gCard(it){
        var rd=_rdOrderG.filter(function(r){ return r.k===(it.photo.tag||'suction'); })[0];
        var cap=rd?rd.label:(it.photo.tag||'');
        if(GT.isPld && it.photo.mode){ cap+= (it.photo.mode==='pld'?' \u00b7 w/PLD':it.photo.mode==='direct'?' \u00b7 w/o PLD':''); }
        return '<div style="width:120px;">'
          +'<div style="width:120px;height:150px;background:#f2f2f2;border:1px solid #C9CDD4;border-radius:4px;overflow:hidden;">'
          +_lnk(it.photo, '<img src="'+it.src+'" style="width:100%;height:100%;object-fit:cover;display:block;">')+'</div>'
          +'<div style="font:10px Calibri,sans-serif;color:#5E5B68;padding-top:3px;text-align:center;">'+esc(cap)+'</div>'
          +'</div>';
      }
      GT.rows.forEach(function(row,ri){
        var rowItems=gItems.filter(function(it){ return it.section===GT.prefix+ri; });
        if(!rowItems.length) return;
        rowItems.sort(function(a,b){
          var ia=_rdOrderG.findIndex(function(r){ return r.k===(a.photo.tag||'suction'); });
          var ib=_rdOrderG.findIndex(function(r){ return r.k===(b.photo.tag||'suction'); });
          if(ia!==ib) return ia-ib;
          var ma=(a.photo.mode==='pld')?1:0, mb=(b.photo.mode==='pld')?1:0;
          return ma-mb;
        });
        var lbl=sub(row.pct||('Point '+(ri+1)));
        var lineGroups=chunk(rowItems,5);
        var lines=lineGroups.map(function(g){
          return '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-start;margin-bottom:10px;">'+g.map(_gCard).join('')+'</div>';
        });
        if(!hdrDone){ out+='<div class="apx-keep">'+gh+head('Flow Test \u2014 Gauge & RPM Photos ('+GT.suffix+')')+lbl+lines[0]+'</div>'; hdrDone=true; }
        else out+='<div class="apx-keep">'+lbl+lines[0]+'</div>';
        for(var li=1;li<lines.length;li++) out+=lines[li];
      });
    });
    // Flow Test Charts + Site Sketches are rendered by the flow-test-photos-print /
    // sketches-print divs immediately after this appendix HTML (they need live
    // canvas access). They continue under the same "Photo Appendix" section band as
    // refined sub-headers — see the PDF fill block. Not duplicated here.
    return out;
  }catch(e){ console.warn('[appendix] build error', e); return ''; }
}

var api = {
  appendixEligible: appendixEligible,
  appendixHTML: appendixHTML,
  sizeChartsForPrint: sizeChartsForPrint,
  VERSION: '0.1.0'
};

if (root) root.ReportPdf = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
