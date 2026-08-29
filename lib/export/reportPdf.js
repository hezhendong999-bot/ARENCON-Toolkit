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

/* ── RESIDENT 4 — PAGINATION (S694; first landed S686, reverted with S686b's
   export breakage, re-landed from the S693-fixed host once the image-settle
   root cause was proven). The geometry of a letter page: the 1040px budget,
   section units, keep-with-next (S693: a splittable first block no longer
   drags its whole section to a fresh page), row/photo splitting with S687
   photo flow, S693 oversized-container division and post-landing verdict
   test, and the S688 settle gate — pagination measures nothing until every
   image is settled. The host states WHAT the running header says, WHICH
   wrapper divs unwrap, and WHERE pages insert; the engine owns every measure
   and cut. Moved VERBATIM — proven page-identical across 120 randomized
   real-layout documents (Chromium probe) before the host copy was deleted. */
function paginate(win, cfg){
  function _paginateNow(){
    try {
      var wd = win.document;
      var PAGE_H = 912; // usable height per page (8.5x11 @ 96dpi minus padding)
      var origPage = wd.querySelector('.page');
      if(!origPage) return;
      // S372.4: the flow-test/sketch print divs are wrapper <div>s whose .sh band
      // + photos live INSIDE them (injected via innerHTML). The unit-grouper below
      // only inspects DIRECT children of .page, so a nested .sh is invisible and the
      // wrapper gets absorbed into the previous section (Signature) → photos print
      // under "Signature (cont.)". Unwrap these wrappers: promote their children to
      // be direct .page children, in place, so each inner .sh starts its own unit.
      ((cfg && cfg.unwrapIds) || ['flow-test-photos-print','sketches-print']).forEach(function(wid){
        var wrap = wd.getElementById(wid);
        if(!wrap || wrap.parentNode!==origPage) return;
        while(wrap.firstChild){ origPage.insertBefore(wrap.firstChild, wrap); }
        origPage.removeChild(wrap);
      });
      // Header CONTENT is the host's statement (cfg.header) — the tool name in
      // the title line is personality, not geometry. Escaping stays here so no
      // host can forget it.
      var _hd = (cfg && cfg.header) || {};
      var _esc = function(s){ return (s||'').replace(/</g,'&lt;'); };
      var _chClient = _esc(_hd.client);
      var _chAddr = _esc(_hd.addr);
      var _chTitle = _esc(_hd.title);
      var _chProjNo = _hd.projNo||'';
      var _chRev = _hd.rev||'';
      var _chDate = _hd.dateStr || new Date().toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'});

      // FRT-matched running header (frt/js/export/pdf.js _compactHeader):
      // left = client / address / title-line ; right = "projNo rev Page N" / blank / date
      function _makeCompactHeader(pageNum, totalPages){
        var right = (_chProjNo + ' ' + _chRev).trim() + '&nbsp;&nbsp;Page ' + pageNum;
        return '<div class="compact-header">'
          +'<div class="ch-compact-left">'+_chClient+'<br>'+_chAddr+'<br>'+_chTitle+'</div>'
          +'<div class="ch-compact-right">'+right+'<br>&nbsp;<br>'+_chDate+'</div>'
          +'</div>';
      }
      function _makeCompactHeaderNode(pageNum){
        var d = wd.createElement('div');
        d.innerHTML = _makeCompactHeader(pageNum, 0);
        return d.firstChild;
      }
      
      // Collect all direct children of .page as content blocks
      var children = Array.from(origPage.children);
      var pages = [];

      // ════════════════════════════════════════════════════════════════
      // S367 v2 — section-aware DOM pagination (FRT-grade).
      // Goals (Mark-locked): letter-size EVERY page, NEVER a long page,
      // NEVER a section band orphaned at a page bottom, NEVER a section
      // cut mid-row. Tall sections SPLIT across pages, re-stamping the
      // section band "(cont.)" + the table's own header on each new page.
      // No "Page X of Y" footer (running header already carries the page #).
      // ════════════════════════════════════════════════════════════════
      function _newPage(withHeader, pageNum){
        var pg = wd.createElement('div');
        pg.className = 'page';
        pg.style.cssText = origPage.style.cssText;   // full .page styling on EVERY page
        pg.style.minHeight = '0';                    // so offscreen measurement reflects real content height (print CSS restores letter sizing)
        if(withHeader){
          var h = _makeCompactHeaderNode(pageNum);
          if(h) pg.appendChild(h);
        }
        return pg;
      }

      // Live offscreen build stage. Pages are measured WHILE in the document so
      // table rows (which have no height when detached) measure correctly.
      // PAGE_LIMIT is compared against curPage.offsetHeight, which is a BORDER-BOX
      // measurement: it already INCLUDES the .page 0.5in top+bottom padding (96px).
      // The old limit (960px = content height inside the padding) therefore compared
      // a padded measurement against an unpadded budget and declared every page full
      // a full inch early — an inch of white space lost off the bottom of every sheet
      // in every report. Correct budget = the whole sheet: 11in = 1056px, less a small
      // rounding reserve so a page that measures a hair over cannot tip onto a blank
      // extra sheet at print time.
      var stage = wd.createElement('div');
      stage.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;';
      wd.body.appendChild(stage);
      var PAGE_LIMIT = (11 * 96) - 16;    // 1040px = full 11in sheet (1056px) − 16px (~1/6in) rounding reserve
      function _overflow(){ return curPage.offsetHeight > PAGE_LIMIT; }

      // Find first section band; everything before it = cover/dashboard.
      var firstSectionIdx = children.findIndex(function(c){ return c.classList && c.classList.contains('sh'); });
      if(firstSectionIdx < 0) firstSectionIdx = children.length;

      // ── Group remaining children into section units: { head:.sh, body:[...] } ──
      var units = []; var u = null;
      for(var j=firstSectionIdx;j<children.length;j++){
        var c = children[j];
        if(c.classList && c.classList.contains('sh')){ if(u) units.push(u); u = { head:c, body:[] }; }
        else if(u){ u.body.push(c); }
        else { u = { head:null, body:[c] }; }
      }
      if(u) units.push(u);

      // ── Page 1 starts with the cover + dashboard, then sections flow onto it
      //    to fill the page (no clean-cover gap). Page 1 has the FULL header
      //    built into the cover, so it gets no compact header. Continuation
      //    pages get the compact running header.
      var curPage = _newPage(false, 1);
      for(var i=0;i<firstSectionIdx;i++) curPage.appendChild(children[i]);
      stage.appendChild(curPage);
      function _push(){ pages.push(curPage); curPage = _newPage(true, pages.length+1); stage.appendChild(curPage); }
      // A page is "too full" to start more content only when it's near the
      // limit. Higher threshold = tighter packing (fewer gaps). The hard
      // overflow guard (_overflow) is what actually prevents spillover.
      function _pageFull(){ return curPage.offsetHeight > PAGE_LIMIT * 0.92 && curPage.children.length > 1; }
      function _bandClone(headEl, cont){
        if(!headEl) return null;
        var b = headEl.cloneNode(true);
        if(cont) b.textContent = headEl.textContent + ' (cont.)';
        return b;
      }

      // Split a body that wraps/IS a table — row by row, re-stamping band+thead.
      // Item rows and their trailing photo rows (.ph-keep) are kept together as a
      // unit so a photo never gets orphaned from its checklist item by a break.
      function _splitTable(wrapper, table, head){
        var thead = table.querySelector('thead');
        var tbody = table.tBodies[0];
        var rows = Array.from(tbody.rows);
        // Group rows: each item row absorbs any immediately-following ph-keep rows.
        var groups = []; var g = null;
        rows.forEach(function(r){
          var isPhoto = r.classList && r.classList.contains('ph-keep');
          if(isPhoto && g){ g.push(r); }       // attach photo row to current item group
          else { g = [r]; groups.push(g); }    // start a new group on an item row
        });
        function _shell(cont){
          // A continuation is BY DEFINITION the top of a new page — always push,
          // so a "(cont.)" band can never appear mid-page with content under it.
          // (For the first shell, only push if the current page is genuinely full.)
          if(cont){ if(curPage.children.length > 1) _push(); }
          else if(_pageFull()){ _push(); }
          if(cont && head){ curPage.appendChild(_bandClone(head,true)); }
          var w = wrapper.cloneNode(false);
          var t = table.cloneNode(false);
          if(thead) t.appendChild(thead.cloneNode(true));
          var tb = wd.createElement('tbody'); t.appendChild(tb); w.appendChild(t);
          curPage.appendChild(w);
          return tb;
        }
        var tb = _shell(false);
        // S687 — root cause of the 1490.04 spill: an item carrying enough evidence
        // photos (24 on item 1.1) makes item+photos taller than a whole page. The
        // placement below keeps a group atomic — right for 2 photos, impossible
        // for 24: a group taller than a page fits NOWHERE, so it bled off the
        // sheet and printed over the next page's running header. The group IS
        // divisible at photo boundaries, so: keep the item row with as many
        // photos as the page holds, flow the rest onto continuation pages in
        // their own rows under the "(cont.)" band. Measurement-driven — photos
        // are pulled back one at a time against the live page height — so it
        // assumes nothing about photo size, photos-per-row, or CSS. Only a group
        // that has ALREADY overflowed a fresh page enters here; every group that
        // fits is placed exactly as before this fix.
        function _flowPhotoOverflow(grp){
          var boxes = grp.filter(function(r){ return r.classList && r.classList.contains('ph-keep'); })
                         .map(function(r){ return r.querySelector('.nd-photos'); })
                         .filter(Boolean);
          if(!boxes.length) return;            // nothing divisible — rides its page, as before
          var proto = null, carry = [];
          for(var b=boxes.length-1; b>=0 && _overflow(); b--){
            var box = boxes[b];
            if(!proto) proto = box.closest('tr');
            while(_overflow() && box.lastElementChild){
              carry.unshift(box.lastElementChild);
              box.removeChild(box.lastElementChild);
            }
            if(!box.children.length){          // an emptied photo row is dead weight
              var tr = box.closest('tr');
              if(tr && tr.parentNode) tr.parentNode.removeChild(tr);
            }
          }
          while(carry.length){
            tb = _shell(true);                 // fresh page: "(cont.)" band + re-stamped thead
            var row = proto.cloneNode(true);
            var cbox = row.querySelector('.nd-photos');
            while(cbox.firstChild) cbox.removeChild(cbox.firstChild);
            tb.appendChild(row);
            while(carry.length){
              cbox.appendChild(carry.shift());
              if(_overflow()){
                if(cbox.children.length > 1){ carry.unshift(cbox.lastElementChild); cbox.removeChild(cbox.lastElementChild); }
                break;                         // one photo can never overflow forever
              }
            }
          }
        }
        groups.forEach(function(grp){
          var firstOnPage = (tb.rows.length === 0);
          grp.forEach(function(r){ tb.appendChild(r); });   // place the whole group
          if(_overflow() && !firstOnPage){
            grp.forEach(function(r){ if(r.parentNode) r.parentNode.removeChild(r); }); // pull back the group
            tb = _shell(true);                                // continue on a fresh page
            grp.forEach(function(r){ tb.appendChild(r); });
          }
          /* S693 — the pull-back above deliberately skipped the FIRST group of a
             shell so the band could not strand over an empty table; the price
             was that a first group overflowing a page that already carried
             OTHER content rode the overflow and painted past the sheet edge.
             When the page has other content, move band + shell + group to a
             fresh page TOGETHER — nothing strands, nothing bleeds. A first
             group alone on its page stays (nowhere better exists; the S687
             photo flow below divides it if it can be divided). */
          if(_overflow() && firstOnPage){
            var _tblEl = tb.parentNode, _wrapEl = _tblEl ? _tblEl.parentNode : null;
            var _hasOther = _wrapEl && Array.prototype.some.call(curPage.children, function(n){
              return n !== _wrapEl && !(n.classList && (n.classList.contains('compact-header') || n.classList.contains('sh')));
            });
            if(_hasOther && _wrapEl && _wrapEl.parentNode === curPage){
              grp.forEach(function(r){ if(r.parentNode) r.parentNode.removeChild(r); });
              if(!tb.rows.length) curPage.removeChild(_wrapEl);
              var _tailBand = curPage.lastElementChild;
              if(_tailBand && _tailBand.classList && _tailBand.classList.contains('sh') && curPage.children.length > 1){
                curPage.removeChild(_tailBand);        // the band travels with its table
              } else { _tailBand = null; }
              _push();
              if(_tailBand) curPage.appendChild(_tailBand);
              tb = _shell(false);
              grp.forEach(function(r){ tb.appendChild(r); });
            }
          }
          if(_overflow()) _flowPhotoOverflow(grp);            // S687: taller than any page — divide at photo boundaries
        });
      }
      // Split a non-table tall body at its direct children. If a child is
      // itself a table taller than a page, recurse into _splitTable for it so
      // big tables (e.g. the 7-point PLD table) split row-by-row. A child that
      // can't be split (e.g. a chart image) and overflows is moved WHOLE to a
      // fresh page so it never bleeds across a page boundary.
      function _splitGeneric(block, head){
        var kids = Array.from(block.children);
        function _wrap(cont){
          if(cont){ if(curPage.children.length > 1) _push(); }
          else if(_pageFull()){ _push(); }
          if(cont && head){ curPage.appendChild(_bandClone(head,true)); }
          var w = block.cloneNode(false); curPage.appendChild(w); return w;
        }
        var w = _wrap(false);
        kids.forEach(function(k){
          w.appendChild(k);
          if(!_overflow()) return;                 // fits — keep it
          w.removeChild(k);
          var kt = (k.matches && k.matches('table')) ? k : (k.querySelector ? k.querySelector('table') : null);
          var splittable = kt && kt.tBodies && kt.tBodies.length && kt.tBodies[0].rows.length > 2;
          if(splittable){
            _splitTable(k, kt, head);
            w = curPage.lastChild; if(!w || w === block) { w = _wrap(true); }
            return;
          }
          // Non-splittable (chart/image/short block). If the wrapper already has
          // siblings, force a FRESH PAGE so this block rides one page whole and
          // never crosses the boundary. If it was alone and STILL overflows it's
          // taller than a page (rare) — leave it on its own page; can't cut an img.
          if(w.children.length > 0){
            _push();
            w = block.cloneNode(false);
            if(head){ curPage.appendChild(_bandClone(head,true)); }
            curPage.appendChild(w);
          }
          w.appendChild(k);
          /* S693 — ROOT CAUSE of the deficiency-summary bleed: a contractor
             block carrying several deficiencies measures taller than ANY page,
             and "leave it on its own page" painted the excess past the sheet
             edge (probe measured 170–570px of ink off the page). A block that
             has ALREADY overflowed a page it has to itself is in the
             guaranteed-bleed case; when it is a plain multi-child container
             (not nosplit / apx-keep), dividing it at its OWN child boundaries
             is strictly better. Recursion descends the tree, so it terminates
             at leaves; every block that fits a page is placed exactly as
             before this fix. */
          if(_overflow() && k.children && k.children.length > 1 && !(k.classList && (k.classList.contains('nosplit') || k.classList.contains('apx-keep')))){
            w.removeChild(k);
            if(!w.children.length && w.parentNode === curPage) curPage.removeChild(w);
            _splitGeneric(k, head);
            w = curPage.lastChild; if(!w || w === block){ w = _wrap(true); }
          }
        });
      }

      units.forEach(function(unit){
        var head = unit.head, bodyNodes = unit.body;

        // 1) Try the whole unit on the current page (greedy bin-pack).
        var band = head ? _bandClone(head,false) : null;
        if(band) curPage.appendChild(band);
        var placed = [];
        var overflowed = false;
        for(var bi=0; bi<bodyNodes.length; bi++){
          curPage.appendChild(bodyNodes[bi]); placed.push(bodyNodes[bi]);
          if(_overflow()){ overflowed = true; break; }
        }
        if(!overflowed) return;   // whole unit fit on the current page — done

        // 2) It overflowed. Roll back the tentative placement.
        placed.forEach(function(n){ if(n.parentNode===curPage) curPage.removeChild(n); });
        if(band && band.parentNode===curPage) curPage.removeChild(band);

        // 3) Decide whether to start the section HERE or on a fresh page.
        //    Keep-with-next: the band must not strand on a page whose remaining
        //    room can't hold the band PLUS its first real content block. Testing a
        //    flat 70px wasn't enough — a tall first block (e.g. a 300px placard
        //    apx-keep) overflowed in step 4 and got pushed to a fresh page on its
        //    own, leaving the band orphaned above a big gap. So test the band + the
        //    ACTUAL first body node together; if they don't both fit, push first so
        //    band + first block start the next page together.
        if(head){
          var pushedForBand = false;
          if(curPage.children.length > 1){
            var testBand = _bandClone(head,false);
            curPage.appendChild(testBand);
            var firstBN = bodyNodes[0];
            /* S693 — ROOT CAUSE of "section starts on a fresh page leaving most
               of a page blank" (field report pages 8–9, sections 4 & 5). The
               test below measured band + the ENTIRE first body node. For every
               section whose body is ONE block (all .sb.flush tables, and the
               big section-4 .sb) that degenerates into "does the whole section
               fit — if not, fresh page", abandoning hundreds of px of room the
               splitting machinery below was built to fill. So: when the first
               body node is SPLITTABLE (a rowed table, or a multi-child
               container), require only the band plus a meaningful start of
               content (160px ≈ table header + a first row group); the split
               machinery re-stamps "(cont.)" bands from there. An ATOMIC first
               node (nosplit / apx-keep / single leaf — the 300px placard case
               this test was written for) keeps the original whole-block test. */
            var _fbAtomic = firstBN && firstBN.classList && (firstBN.classList.contains('nosplit') || firstBN.classList.contains('apx-keep'));
            var _fbTable = (!_fbAtomic && firstBN && firstBN.querySelector) ? ((firstBN.matches && firstBN.matches('table')) ? firstBN : firstBN.querySelector('table')) : null;
            var _fbSplittable = !_fbAtomic && firstBN && ((_fbTable && _fbTable.tBodies && _fbTable.tBodies.length && _fbTable.tBodies[0].rows.length > 2) || (firstBN.children && firstBN.children.length > 1));
            var measured = false;
            if(firstBN && _fbSplittable){
              if((PAGE_LIMIT - curPage.offsetHeight) < 160){
                curPage.removeChild(testBand);
                _push();                              // no meaningful room under the band → fresh page
                pushedForBand = true;
              } else {
                curPage.removeChild(testBand);        // band + a real start fit; splitting fills the rest
              }
            } else if(firstBN){
              curPage.appendChild(firstBN);          // tentatively measure band + first block
              measured = true;
              if(_overflow()){ 
                curPage.removeChild(firstBN);         // pull the test block back
                curPage.removeChild(testBand);
                _push();                              // band + first block won't fit → fresh page
                pushedForBand = true;
              } else {
                curPage.removeChild(firstBN);         // they fit; remove the test block, keep going
                curPage.removeChild(testBand);
              }
            } else {
              if(_overflow()){ _push(); pushedForBand = true; }
              curPage.removeChild(testBand);
            }
          }
          curPage.appendChild(_bandClone(head,false));
        } else if(curPage.children.length > 1 && (PAGE_LIMIT - curPage.offsetHeight) < 70){
          _push();
        }

        // 4) Flow the body, splitting any block that doesn't fit the room left.
        bodyNodes.forEach(function(bn){
          curPage.appendChild(bn);
          if(!_overflow()) return;            // fit whole in the remaining room
          curPage.removeChild(bn);            // too tall → handle by type
          // nosplit = atomic block (e.g. verdict box) → must ride a page WHOLE,
          // never split. If it has keep-prev, try to pull its immediately-
          // preceding sibling (e.g. the Deficiency Summary .sb) onto the fresh
          // page with it so the two are never separated by a page break.
          var isNoSplit = bn.classList && (bn.classList.contains('nosplit') || bn.classList.contains('apx-keep'));
          if(isNoSplit){
            var prevNode = null, bandNode = null;
            if(bn.classList.contains('keep-prev')){
              var lc = curPage.lastElementChild;
              // only pull a preceding content block, never the section band
              if(lc && !(lc.classList && lc.classList.contains('sh')) && curPage.children.length > 1){
                prevNode = lc; curPage.removeChild(prevNode);
              }
              /* S689 — ROOT CAUSE of the blank "Deficiency Summary" page. Pulling
                 the body left its BAND behind, so the heading printed alone at
                 the foot of one sheet and its content started on the next. The
                 band exists to sit above the thing it titles; a heading with
                 nothing under it is precisely what the keep-together rule is
                 for. So after the body is pulled, if the band is now the last
                 thing on the page, it travels too. Characterised in S686 and
                 left alone then because an extraction is no place to change
                 layout; this is that place. */
              if(prevNode){
                var bandTail = curPage.lastElementChild;
                if(bandTail && bandTail.classList && bandTail.classList.contains('sh') && curPage.children.length > 1){
                  curPage.removeChild(bandTail);
                  bandNode = bandTail;
                }
              }
            }
            if(curPage.children.length > 1) _push();
            if(bandNode) curPage.appendChild(bandNode);
            if(prevNode) curPage.appendChild(prevNode);
            curPage.appendChild(bn);
            // if the pair STILL overflows the fresh page, the sb is genuinely
            // oversized — release it back to splitting, keep verdict atomic after.
            if(prevNode && _overflow()){
              curPage.removeChild(bn); curPage.removeChild(prevNode);
              _splitGeneric(prevNode, head);
              if(_overflow() && curPage.children.length > 1) _push();
              curPage.appendChild(bn);
              /* S693 — the overflow test above ran BEFORE the verdict box was
                 re-appended, so a page the split had left nearly full took the
                 box and painted it past the sheet edge (the field FAIL bar,
                 page 11). Test what is actually ON the page: if the box
                 overflows and has company, it gets the fresh page the nosplit
                 rule promises it. */
              if(_overflow() && curPage.children.length > 2){
                curPage.removeChild(bn);
                _push();
                if(head) curPage.appendChild(_bandClone(head,true));
                curPage.appendChild(bn);
              }
            }
            return;
          }
          // .sb.flush = a single checklist table → split rows. Plain .sb =
          // mixed content (tables + charts + headings) → split at children.
          var isFlush = bn.classList && bn.classList.contains('flush');
          var table = (bn.matches && bn.matches('table')) ? bn : (bn.querySelector ? bn.querySelector('table') : null);
          if(isFlush && table && table.tBodies && table.tBodies.length){ _splitTable(bn, table, head); }
          else { _splitGeneric(bn, head); }
        });
      });

      if(curPage.children.length > 1) pages.push(curPage);
      if(stage.parentNode) stage.parentNode.removeChild(stage);

      // S372.7: sub-section continuation headers. The paginator re-stamps the
      // SECTION band ("Photo Appendix (cont.)") but not the sub-headers inside it.
      // Walk the finished pages in order, tracking the last appendix sub-header
      // seen; when a page carries appendix photo rows that continue a sub-section
      // whose header was on an earlier page (i.e. the page's first appendix block
      // is NOT itself a sub-header), inject a "<sub> (cont.)" header at the top of
      // that page's appendix content so the reader always knows what they're seeing.
      (function(){
        var lastSub = null;   // label of the most recent appendix sub-header seen
        pages.forEach(function(pg){
          var kids = Array.from(pg.children);
          var firstAppendixIsSub = null;   // sub-header element if the first appendix block IS one
          var firstAppendixNode = null;    // first appendix content node on this page
          var pageLastSub = null;          // last sub-header label found on this page
          var sawApxContent = false;
          for(var i=0;i<kids.length;i++){
            var k = kids[i];
            if(k.classList && k.classList.contains('apx-band')){ sawApxContent = true; continue; }
            var isSub = k.classList && k.classList.contains('apx-subhead');
            var innerSub = (!isSub && k.querySelector) ? k.querySelector('.apx-subhead') : null;
            var subEl = isSub ? k : innerSub;
            var hasImg = (!subEl && k.querySelector) ? !!k.querySelector('img') : false;
            var isPhoto = !subEl && hasImg;
            if(subEl){
              sawApxContent = true;
              if(!firstAppendixNode){ firstAppendixNode = k; firstAppendixIsSub = subEl; }
              pageLastSub = (subEl.getAttribute('data-subhead')||subEl.textContent||'').replace(/\s*\(cont\.\)\s*$/,'');
            } else if(isPhoto){
              sawApxContent = true;
              if(!firstAppendixNode){ firstAppendixNode = k; }
            }
          }
          // Inject "(cont.)" only when this page's FIRST appendix block is photo
          // content (not a sub-header) continuing the previous page's sub-section.
          if(sawApxContent && firstAppendixNode && !firstAppendixIsSub && lastSub){
            var cont = wd.createElement('div');
            cont.className = 'apx-subhead';
            cont.setAttribute('data-subhead', lastSub);
            cont.style.cssText = 'display:flex;align-items:center;gap:9px;padding:16px 0 6px;margin:0 0 11px;border-bottom:1px solid #D8DCE3;';
            cont.innerHTML = '<span style="width:4px;height:15px;background:#9C2742;border-radius:2px;display:inline-block;flex:0 0 auto;"></span>'
              + '<span style="font:700 14px Calibri,sans-serif;color:#1C2333;letter-spacing:.3px;">'
              + lastSub.replace(/&/g,'&amp;').replace(/</g,'&lt;') + ' (cont.)</span>';
            pg.insertBefore(cont, firstAppendixNode);
          }
          // Carry forward the last sub-header seen on this page (if any) so the NEXT
          // page's continuation uses the correct sub-section.
          if(pageLastSub) lastSub = pageLastSub;
        });
      })();

      // Replace original page with paginated pages. NO "Page X of Y" footer.
      // Force every final page to EXACTLY letter height (11in) so all pages are
      // uniform letter-size sheets — never content-height, never taller.
      // (Measurement used min-height:0; here we lock the display height.)
      var parent = origPage.parentNode;
      origPage.remove();
      pages.forEach(function(pg){
        pg.style.minHeight = '11in';
        pg.style.height = '11in';
        parent.insertBefore(pg, wd.getElementById((cfg && cfg.insertBeforeId) || 'mobile-page-nav'));
      });
    } catch(pgErr){ console.warn('Pagination error:', pgErr); }
  }
  // S688 — ROOT CAUSE of the 1490.04 spill: pagination measured a document
  // whose geometry was not final. Deficiency and response photos print with
  // height:auto — ZERO pixels tall until the image finishes loading — and the
  // 1200ms timer ran pagination while they were still arriving. Pages were cut
  // and locked to 11in against those short measurements; when the images then
  // landed at full height, the content re-flowed inside pages that could no
  // longer grow, and the excess painted off the sheet and over the next page's
  // running header. It also silenced every overflow guard (S53 pull-to-fresh
  // and S687 photo flow alike): a page that MEASURES short never trips them.
  // The fix is at the mechanism: do not measure until every image has settled
  // (loaded or errored — an errored image's final height is also final). The
  // 1200ms floor stays for the rest of the window's setup; a 15s hard cap
  // guarantees one hung image can never hold a report hostage. The console
  // line is the field diagnostic: it states, on every export, how many images
  // pagination actually waited for — the fact this bug hid for want of.
  function _paginateWhenSettled(){
    var imgs, pending;
    try{
      imgs = Array.prototype.slice.call(win.document.images || []);
      pending = imgs.filter(function(im){ return !im.complete; });
    }catch(_){ imgs = []; pending = []; }
    try{ console.info('[pdf] paginate gate: ' + (imgs.length - pending.length) + '/' + imgs.length + ' images settled at the 1200ms mark'); }catch(_){}
    if(!pending.length){ _paginateNow(); return; }
    var fired = false, done = 0;
    function _go(why){
      if(fired) return; fired = true;
      try{ console.info('[pdf] paginate gate released: ' + why); }catch(_){}
      _paginateNow();
    }
    function _tick(){ done++; if(done >= pending.length) _go('all ' + pending.length + ' remaining images settled'); }
    pending.forEach(function(im){
      im.addEventListener('load', _tick);
      im.addEventListener('error', _tick);
      if(im.complete) _tick();   // settled between the filter and the listener — never wait on it
    });
    setTimeout(function(){ _go('15s cap — ' + (pending.length - done) + ' image(s) never settled'); }, 15000);
  }
  _paginateWhenSettled();
}

var api = {
  appendixEligible: appendixEligible,
  appendixHTML: appendixHTML,
  sizeChartsForPrint: sizeChartsForPrint,
  paginate: paginate,
  VERSION: '0.2.0'
};

if (root) root.ReportPdf = api;
try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
