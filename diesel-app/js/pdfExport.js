/* ARENCON — PDF Export / Photo Appendix engine (Diesel-owned: diesel-app/js/)
   Extracted VERBATIM from diesel-app/js/part06.js at S503 (Lane C).
   Classic script; all symbols global by design (inline onclick handlers + cross-file
   calls reference them by name). Loaded by the Diesel beta build; the Diesel monolith
   carries a byte-identical inline copy — edit BOTH or they drift.
   Owns: pre-print photo-selection screen, appendix HTML, export/distribution modal,
   _realExportPDF() and its section-aware live-measured pagination engine.

   S511 — MOVED OUT OF lib/ui/. It was placed there at S503 on the commitment that
   Electric's export path would be converted to call it "next". That did not happen, and
   for the whole time in between a 180KB Diesel-only file sat in the shared folder
   presenting itself as a shared engine. A path is a claim about who uses something; this
   one was false, and the cost of a false claim in lib/ is a future session assuming an
   edit here is safe for other tools, or assuming Electric already routes through it.
   Nothing in this file is general: the report template, the section names, the placard
   and flow-test appendices and the pass/fail box are all Diesel's.
   If Electric is ever genuinely converted to call this, move it back to lib/ AS PART OF
   that work — not before, and not on a promise. Verified at the time of the move: the
   only references anywhere in the repo were diesel-app/index.html, sw.js and one comment
   in the monolith.
   DO NOT rewrite blocks here — surgical str_replace only, edit BOTH builds, bump SW+CSS. */
/* ════ S315 F1: PRE-PRINT PHOTO SELECTION (LOCKED design, Diesel PK) ════
   Full-screen, one category per row, select-all + per-category, default
   include-all / opt-OUT. Tap a photo to exclude it from the report's Photo
   Appendix; exclusions persist with the report (state key appendixExcluded).
   Export PDF now routes through this screen; Generate continues to the
   original export chain (_exportPDFGo). */
var _appendixExcl = new Set();
function _ppxKey(item){ return (item.photo&&item.photo.id) ? item.photo.id : ('pgk_'+item.section+'#'+item.idx); }
/* ════ S315 F2: PDF PHOTO APPENDIX (LOCKED layout, Diesel PK) ════
   pump/install 3-up square NO labels \u00B7 gauge/RPM/BF 2-up grouped by flow point,
   one reading per row \u00B7 two placard cards per page \u00B7 readings/sections with
   zero photos are OMITTED (Mark's rule). Emits SIBLING blocks (not one wrapper)
   so the Session-53 bin-pack paginates them; tiles are FIXED-size so heights are
   deterministic before images finish loading. Inline styles only — the report
   window has its own stylesheet. */
function _appendixEligible(it){
  // S316 scope (Mark): gauge & RPM photos, pump photos, flow chart photos,
  // placard + PLD placard photos ONLY. No site records, checklist, deficiencies.
  if(!it||!it.photo) return false;
  if(it.type==='gauge'||it.type==='gauge-pld') return true;
  if(it.type==='flowtest'||it.type==='flowtest-pld') return true;
  if(it.type==='record'){ var k=(it.photo.kind||''); return k==='pump'||k==='pump-pld'||k.indexOf('placard')!==-1||k==='flow'||k==='flow-pld'; }
  return false;
}
function _appendixHTML(){
  try{
    if(typeof _collectAllPhotos!=='function') return '';
    var inc = _collectAllPhotos().filter(function(it){
      return _appendixEligible(it) && it.src && !_appendixExcl.has(_ppxKey(it));
    });
    if(!inc.length) return '';
    window._apxBandEmitted = true;   // S372.5: this path always emits the Photo Appendix band
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
            +'<img src="'+it.src+'" style="width:100%;height:100%;object-fit:cover;display:block;"></div>';
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
          +'<img src="'+it.src+'" style="width:100%;height:100%;object-fit:cover;display:block;"></div>'
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
          +'<img src="'+it.src+'" style="width:100%;height:100%;object-fit:contain;display:block;"></div>'
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
    var _rdOrderG=(typeof _GAUGE_READINGS!=='undefined'?_GAUGE_READINGS:[]);
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
          +'<img src="'+it.src+'" style="width:100%;height:100%;object-fit:cover;display:block;"></div>'
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
/* ════ S328: EXPORT REPORT MODAL (FRT-language port, simplified) ════
   Distribution (Owner / Contractors / Other recipients) + Report Photos summary.
   Owner = pi-client. Contractors = contractors[] roster UNION the project-info
   contractor inputs (pi-contractor / pi-contractor-N). Other recipients are
   manually pooled and removable (×). Selected names persist to distribution[]
   (rides the existing save/autosave/CloudSync path) and print in the PDF header
   "Distribution:" line. Generate PDF persists then continues to _exportPDFGo. */
function _exportContractorNames(){
  var out=[], seen={};
  (contractors||[]).forEach(function(n){ n=(n||'').trim(); if(n&&!seen[n.toLowerCase()]){seen[n.toLowerCase()]=1;out.push(n);} });
  document.querySelectorAll('#contractor-fields input[type=text]').forEach(function(inp){
    var n=(inp.value||'').trim(); if(n&&!seen[n.toLowerCase()]){seen[n.toLowerCase()]=1;out.push(n);}
  });
  return out;
}
/* S498: the panel body lives inside the engine's SHADOW ROOT, so document-level
   lookups cannot see these nodes. _exmRoot is the body element handed over by
   the panel's build(); every helper scopes its queries to it. Null when closed. */
var _exmRoot=null;
function _exmQ(sel){ return _exmRoot ? _exmRoot.querySelector(sel) : null; }
function _exmQA(sel){ return _exmRoot ? _exmRoot.querySelectorAll(sel) : []; }
function _exportModalSelected(){
  var names=[];
  _exmQA('.exm-chip.on').forEach(function(c){ names.push(c.getAttribute('data-name')); });
  return names;
}
function _exportModalLine(){
  var dl=_exmQ('#exm-dl'); if(dl) dl.textContent=_exportModalSelected().join(', ')||'\u2014';
}
function _exportModalToggle(el){
  el.classList.toggle('on');
  el.querySelector('.exm-dot').textContent = el.classList.contains('on')?'\u2713':'';
  _exportModalLine();
}
function _exportAddRecipient(){
  var inp=_exmQ('#exm-newrec'); if(!inp) return;
  var n=(inp.value||'').trim(); if(!n) return;
  var pool=_exmQ('#exm-other'); if(!pool) return;
  // de-dupe against existing chips
  var dup=false; _exmQA('.exm-chip').forEach(function(c){ if((c.getAttribute('data-name')||'').toLowerCase()===n.toLowerCase()) dup=true; });
  if(dup){ inp.value=''; return; }
  var grp=_exmQ('#exm-other-grp'); if(grp) grp.style.display='';
  pool.insertAdjacentHTML('beforeend',_exmChip(n,'on',true));
  inp.value='';
  _exportModalLine();
}
// S366: per-recipient colours in the export modal — each owner/contractor gets a
// distinct, STABLE colour (same name → same colour every time), matching FRT's
// per-recipient colour treatment. Diesel stores contractors as plain name strings
// (no roster colour like FRT), so assign deterministically by name hash from a
// MUTED palette (no bright saturated hues — per ARENCON colour rule).
var _EXM_OWNER_C = '#3E4C66';   // steel — owner (mirrors FRT OWNER_C)
var _EXM_OTHER_C = '#8A7689';   // neutral grey — manually-pooled recipients (FRT ADDED_C)
var _EXM_CTR_PALETTE = ['#2C6E8F','#5B7A52','#8A5A7A','#9C6B3E','#4A6B8A','#6E5A8A','#5A7D6E','#8A6B4A','#436B6B','#7A5A5A'];
function _exmColorFor(name){
  var s = String(name||''); var h = 0;
  for(var i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) & 0x7fffffff; }
  return _EXM_CTR_PALETTE[h % _EXM_CTR_PALETTE.length];
}
function _exmChip(name,state,removable,color){
  var on=(state==='on');
  var c = color || _EXM_OTHER_C;
  return '<span class="exm-chip'+(on?' on':'')+'" data-name="'+_exmEsc(name)+'" style="--c:'+c+';" onclick="if(event.target.classList.contains(\'exm-rm\'))return;_exportModalToggle(this)">'
    +'<span class="exm-dot">'+(on?'\u2713':'')+'</span>'+_exmEsc(name)
    +(removable?'<span class="exm-rm" title="Remove recipient" onclick="this.parentNode.remove();_exportModalLine();">\u00D7</span>':'')
    +'</span>';
}
function _exmEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _exportModalOpen(){
  /* S498 batch 2a (Mark-approved demo): the hand-drawn #exm-ov overlay is
     retired in favour of the shared engine's panel family. The CONTENT is
     unchanged — same distribution chips, same live distribution line, same
     Report Photos summary — but the CHROME is now engine-owned: header wash +
     hairline, the ✕ (which this modal never had), Cancel forced leftmost,
     theming that follows data-theme, scroll lock, and Esc/✕ parity.
     Body padding is overridden to 24px so the layout does not tighten against
     the engine's 16px default (Mark, S498).
     Fail-safe DIFFERS from _aConfirm on purpose: blocking a delete costs
     nothing, but blocking an export strands an inspector with a dead Export
     button. If the engine is somehow absent we fall straight through to the
     PDF using the last SAVED distribution — a report still comes out. */
  var D = window.ArenconDlg;
  if(!D || !D.panel){
    try{ console.error('[Diesel] dialog engine not loaded \u2014 exporting with the last saved distribution'); }catch(_){}
    _exportPDFGo();
    return;
  }

  var owner=((document.getElementById('pi-client')||{}).value||'').trim();
  var ctrs=_exportContractorNames();
  // pre-select set: saved distribution[] if present, else owner + all contractors
  var saved=(distribution&&distribution.length)?distribution.slice():null;
  function on(n){ return saved ? (saved.indexOf(n)>=0) : true; }
  // 'other' recipients = saved names that are neither owner nor a contractor
  var roleSet={}; if(owner) roleSet[owner.toLowerCase()]=1; ctrs.forEach(function(c){roleSet[c.toLowerCase()]=1;});
  var others=(saved||[]).filter(function(n){ return !roleSet[(n||'').toLowerCase()]; });

  // report-photo count (appendix-eligible, minus current exclusions)
  var elig=(typeof _collectAllPhotos==='function')?_collectAllPhotos().filter(_appendixEligible):[];
  var incl=elig.filter(function(it){ return !_appendixExcl.has(_ppxKey(it)); }).length;
  var ptot=elig.length;

  var proj=getProjInfo();
  var subtitle=((proj.projno?proj.projno+' ':'')+(proj.projname||'')).trim()+' \u00B7 Diesel Fire Pump Commissioning Report';

  var ownerHtml = owner
    ? '<div class="exm-grp"><div class="exm-glbl">Owner</div><div class="exm-chips">'+_exmChip(owner,on(owner)?'on':'',false,_EXM_OWNER_C)+'</div></div>'
    : '';
  var ctrHtml = ctrs.length
    ? '<div class="exm-grp"><div class="exm-glbl">Contractors</div><div class="exm-chips">'+ctrs.map(function(c){return _exmChip(c,on(c)?'on':'',false,_exmColorFor(c));}).join('')+'</div></div>'
    : '';
  var otherHtml = '<div class="exm-grp" id="exm-other-grp"'+(others.length?'':' style="display:none;"')+'>'
    +'<div class="exm-glbl">Other recipients</div><div class="exm-chips" id="exm-other">'
    +others.map(function(n){return _exmChip(n,'on',true,_EXM_OTHER_C);}).join('')+'</div></div>';

  D.panel({
    title:'Export Report',
    sub:subtitle,
    icon:'\u2b07',
    accent:'info',
    width:760,
    build:function(bd){
      /* The engine owns chrome; these styles are CONTENT (chips, distribution
         line, photo row) and are scoped inside the panel body. Declared here so
         they travel with the markup into the engine's shadow root, where the
         host page's #exm-ov rules cannot reach. */
      var st=document.createElement('style');
      st.textContent=_EXM_BODY_CSS;
      bd.appendChild(st);
      var w=document.createElement('div');
      w.id='exm-ov';                 /* keeps _exportModalSelected/_exportModalLine selectors working */
      w.className='exm-panelbody';
      w.innerHTML=
         '<div class="exm-sec-lbl">Distribution</div>'
        +ownerHtml+ctrHtml+otherHtml
        +'<div class="exm-addrow"><input type="text" id="exm-newrec" placeholder="Add a recipient \u2014 e.g. base-building service contractor, construction PM\u2026" onkeydown="if(event.key===\'Enter\'){_exportAddRecipient();event.preventDefault();}"><button onclick="_exportAddRecipient()">+ Add to pool</button></div>'
        +'<div class="exm-dline"><div class="exm-dl-l">Distribution line</div><div class="exm-dl-v" id="exm-dl"></div></div>'
        +'<div class="exm-sec-lbl" style="margin-top:14px;">Report Photos</div>'
        +'<div class="exm-photos"><span class="exm-ph-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>'
          +'<span style="flex:1;"><b id="exm-photo-count" style="display:block;font-size:13.5px;">'+(ptot?(incl===ptot?('All '+ptot+' photo'+(ptot===1?'':'s')+' will print'):(incl+' of '+ptot+' photos will print')):'No report photos yet')+'</b>'
          +'<span class="exm-ph-sub">Included by default \u2014 review only if you want to exclude some</span></span>'
          +(ptot?'<button onclick="_prePrintFromMenu()">Review photos\u2026</button>':'')+'</div>';
      bd.appendChild(w);
      /* The panel body lives in a shadow root, so document.getElementById can no
         longer find these nodes. Hand the helpers a direct reference instead. */
      _exmRoot = w;
      _exportModalLine();
    },
    buttons:[
      { label:'Cancel', kind:'cancel' },
      { label:'\uD83D\uDCC4 Generate PDF', kind:'primary', onClick:function(api){
          _exportModalCommit();
          api.close('generate');
          _exportPDFGo();
          return false;   /* already closed above */
        } }
    ]
  }).then(function(){ _exmRoot=null; });
}
/* S498: content-only styles for the panel body. Chrome (card, header, footer,
   ✕, buttons) belongs to the engine and is deliberately NOT redeclared here.
   Colours reference the engine's own tokens so both modes come for free. */
var _EXM_BODY_CSS=
  '.exm-panelbody{padding:0 8px 4px;}'
 +'.exm-sec-lbl{font-size:11px;font-weight:700;letter-spacing:1.1px;color:var(--dlg-ink-3);text-transform:uppercase;margin:14px 0 8px;}'
 +'.exm-sec-lbl:first-child{margin-top:2px;}'
 +'.exm-grp{margin-bottom:10px;}'
 +'.exm-glbl{font-size:10.5px;font-weight:700;letter-spacing:1px;color:var(--dlg-ink-3);text-transform:uppercase;margin-bottom:6px;}'
 +'.exm-chips{display:flex;flex-wrap:wrap;gap:8px;}'
 +'.exm-chip{display:inline-flex;align-items:center;gap:7px;border-radius:18px;padding:7px 13px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--dlg-btn-line);background:var(--dlg-card-2);color:var(--dlg-ink);transition:background .12s,border-color .12s,color .12s;}'
 +'.exm-chip.on{background:var(--c,#5F8068);border-color:var(--c,#5F8068);color:#fff;}'
 +'.exm-chip .exm-dot{width:15px;height:15px;border-radius:50%;border:2px solid var(--c,var(--dlg-ink-3));display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:#fff;background:transparent;}'
 +'.exm-chip.on .exm-dot{background:#fff;border-color:#fff;color:var(--c,#5F8068);}'
 +'.exm-chip .exm-rm{margin-left:3px;color:var(--dlg-ink-3);font-weight:700;font-size:15px;line-height:1;padding:0 3px;border-radius:4px;}'
 +'.exm-chip.on .exm-rm{color:rgba(255,255,255,.8);}'
 +'.exm-chip .exm-rm:hover{color:var(--dlg-fail);background:color-mix(in srgb, var(--dlg-fail) 16%, transparent);}'
 +'.exm-addrow{display:flex;gap:8px;margin:10px 0 8px;}'
 +'.exm-addrow input{flex:1;background:var(--dlg-card-2);border:1px solid var(--dlg-btn-line);border-radius:8px;color:var(--dlg-ink);padding:10px 13px;font:14px Calibri,sans-serif;-webkit-appearance:none;appearance:none;outline:none;}'
 +'.exm-addrow input::placeholder{color:var(--dlg-ink-3);opacity:1;}'
 +'.exm-addrow input:focus{border-color:color-mix(in srgb, var(--acc) 55%, transparent);box-shadow:0 0 0 3px color-mix(in srgb, var(--acc) 16%, transparent);}'
 +'.exm-addrow button{background:var(--dlg-btn-face);color:var(--dlg-btn-ink);border:1px solid var(--dlg-btn-line);border-radius:8px;padding:0 16px;font:600 13px Calibri,sans-serif;cursor:pointer;white-space:nowrap;min-height:42px;}'
 +'.exm-addrow button:hover{border-color:color-mix(in srgb, var(--dlg-ink) 34%, transparent);}'
 +'.exm-dline{background:var(--dlg-card-2);border:1px solid var(--dlg-line);border-radius:9px;padding:11px 14px;}'
 +'.exm-dl-l{font-size:10.5px;font-weight:700;letter-spacing:1px;color:var(--dlg-ink-3);text-transform:uppercase;margin-bottom:4px;}'
 +'.exm-dl-v{font-size:13.5px;line-height:1.4;color:var(--dlg-ink);}'
 +'.exm-photos{display:flex;align-items:center;gap:14px;background:var(--dlg-card-2);border:1px solid var(--dlg-line);border-radius:9px;padding:13px 14px;}'
 +'.exm-photos .exm-ph-icon{flex:0 0 auto;display:inline-flex;color:var(--dlg-ink-2);}'
 +'.exm-photos .exm-ph-sub{font-size:12px;color:var(--dlg-ink-2);}'
 +'.exm-photos b{color:var(--dlg-ink);}'
 +'.exm-photos button{background:var(--dlg-btn-face);color:var(--dlg-btn-ink);border:1px solid var(--dlg-btn-line);border-radius:8px;padding:9px 16px;font:600 13px Calibri,sans-serif;cursor:pointer;white-space:nowrap;min-height:42px;}'
 +'.exm-photos button:hover{border-color:color-mix(in srgb, var(--dlg-ink) 34%, transparent);}'
 +'@media (pointer:coarse){.exm-chip{padding:10px 15px;font-size:14px;}.exm-addrow input{padding:12px 13px;font-size:15px;}}';
function _exportModalClose(){
  /* S498: the engine owns dismissal now. Kept because the name is referenced
     elsewhere and callers expect it to exist. The engine exposes no imperative
     close for an open panel, so we use the same Esc dispatch _tieredBack tier 2a
     uses — the engine's own key handler resolves the panel promise. */
  if(_exmRoot){
    try{ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); }catch(_){}
    _exmRoot=null;
  }
}
function _exportModalCommit(){
  distribution.length=0;
  _exportModalSelected().forEach(function(n){ distribution.push(n); });
  if(typeof saveState==='function') saveState();
  if(typeof debounceAutosave==='function') debounceAutosave();
}
function exportPDF(){ _exportModalOpen(); }   // S328: open Export Report modal (Distribution + Photos) then Generate PDF -> _exportPDFGo
function _prePrintFromMenu(){
  var all = (typeof _collectAllPhotos==='function') ? _collectAllPhotos().filter(_appendixEligible) : [];
  if(!all.length){ showToast('No report photos yet'); return; }
  _prePrintOpen(all);
}
function _prePrintOpen(all){
  // S316 (field report): full-screen overlay sat UNDER the sticky app header
  // ("header floating mid air"), thumbs too small, light text lost on light skin.
  // Rebuilt as a centered MODAL: explicit light card, dark backdrop above
  // everything, internal scroll, body scroll locked while open.
  _ppxClose();
  var CATS=[['records','Pump \u00B7 Placard \u00B7 Flow Charts'],['flow','Flow Test \u2014 Gauges & RPM']];
  var byCat={}; all.forEach(function(it){ (byCat[it.cat]||(byCat[it.cat]=[])).push(it); });
  var ov=document.createElement('div'); ov.id='ppx-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:99995;background:rgba(16,20,30,.62);display:flex;align-items:center;justify-content:center;padding:18px;font-family:Calibri,sans-serif;';
  var h='<div style="background:#FBFAFC;color:#1B1A22;border-radius:14px;max-width:1040px;width:100%;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.45);overflow:hidden;">'
    +'<div style="padding:16px 20px 10px;border-bottom:1px solid #E3E1E8;flex:0 0 auto;">'
    +'<div style="font-size:17px;font-weight:700;">Report Photos</div>'
    +'<div style="font-size:12.5px;color:#5E5B68;margin-top:2px;">Everything below prints in the Photo Appendix by default \u2014 tap a photo to exclude it. Saved with the report.</div></div>'
    +'<div id="ppx-body" style="flex:1 1 auto;overflow-y:auto;padding:4px 20px 16px;">';
  CATS.forEach(function(c){
    var items=byCat[c[0]]||[]; if(!items.length) return;
    h+='<div style="margin-top:14px;">'
      +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
      +'<span style="font-weight:700;font-size:14px;color:#1B1A22;">'+c[1]+'</span>'
      +'<span style="font-size:11.5px;color:#928E9C;" id="ppx-cnt-'+c[0]+'"></span>'
      +'<span style="flex:1;"></span>'
      +'<button onclick="_ppxCat(\''+c[0]+'\',true)" style="background:#ECEAF0;color:#1B1A22;border:1px solid #D8D5DE;border-radius:6px;padding:5px 12px;font:600 12px Calibri,sans-serif;cursor:pointer;">All</button>'
      +'<button onclick="_ppxCat(\''+c[0]+'\',false)" style="background:#ECEAF0;color:#1B1A22;border:1px solid #D8D5DE;border-radius:6px;padding:5px 12px;font:600 12px Calibri,sans-serif;cursor:pointer;">None</button>'
      +'</div><div style="display:flex;flex-wrap:wrap;gap:9px;">';
    items.forEach(function(it){
      var k=_ppxKey(it), ex=_appendixExcl.has(k), s2=it.src||'';
      h+='<div class="ppx-t" data-k="'+k+'" data-cat="'+(it.cat||'')+'" onclick="_ppxToggle(this)" '
        +'style="position:relative;width:112px;height:112px;border-radius:8px;overflow:hidden;background:#000;cursor:pointer;border:2px solid '+(ex?'#D8D5DE':'#5F8068')+';opacity:'+(ex?'.35':'1')+';">'
        +(s2?'<img src="'+s2+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">':'<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#777;font-size:10px;">no preview</div>')
        +'<span style="position:absolute;top:3px;right:3px;background:rgba(28,35,51,.8);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:7px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(it.badge||'')+'</span>'
        +'<span class="ppx-x" style="position:absolute;inset:0;display:'+(ex?'flex':'none')+';align-items:center;justify-content:center;color:#fff;font-size:30px;font-weight:700;background:rgba(0,0,0,.38);">\u2715</span>'
        +'</div>';
    });
    h+='</div></div>';
  });
  h+='</div>'
    +'<div style="flex:0 0 auto;display:flex;gap:10px;padding:12px 20px;background:#F2F0F5;border-top:1px solid #E3E1E8;">'
    +'<button onclick="_ppxClose()" class="_dsl-cancel">Cancel</button>'
    +'<span style="flex:1;display:flex;align-items:center;color:#5E5B68;font-size:12px;" id="ppx-total"></span>'
    +'<button onclick="_ppxDone()" style="background:#9C2742;color:#fff;border:none;border-radius:8px;padding:11px 26px;font:700 14px Calibri,sans-serif;cursor:pointer;">Done</button></div></div>';
  ov.innerHTML=h;
  document.body.appendChild(ov);
  ov._prevOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  _ppxCounts();
}
function _ppxClose(){
  var ov=document.getElementById('ppx-ov');
  if(ov){ document.body.style.overflow=ov._prevOverflow||''; ov.remove(); }
}
function _ppxDone(){
  if(typeof saveState==='function') saveState();
  if(typeof debounceAutosave==='function') debounceAutosave();
  _ppxClose();
  _exmRefreshPhotoCount();   // S329: if export modal still open behind, update its "All N will print" line
  showToast('Report photo selection saved');
}
function _exmRefreshPhotoCount(){
  var el=document.getElementById('exm-photo-count'); if(!el) return;
  var elig=(typeof _collectAllPhotos==='function')?_collectAllPhotos().filter(_appendixEligible):[];
  var tot=elig.length;
  var incl=elig.filter(function(it){ return !_appendixExcl.has(_ppxKey(it)); }).length;
  el.textContent = !tot ? 'No report photos yet'
    : (incl===tot ? ('All '+tot+' photo'+(tot===1?'':'s')+' will print')
                  : (incl+' of '+tot+' photos will print'));
}
function _ppxToggle(el){
  var k=el.getAttribute('data-k');
  if(_appendixExcl.has(k)){ _appendixExcl.delete(k); el.style.opacity='1'; el.style.borderColor='#5F8068'; el.querySelector('.ppx-x').style.display='none'; }
  else { _appendixExcl.add(k); el.style.opacity='.35'; el.style.borderColor='rgba(255,255,255,.15)'; el.querySelector('.ppx-x').style.display='flex'; }
  _ppxCounts();
  if(typeof debounceAutosave==='function') debounceAutosave();
}
function _ppxCat(cat,on){
  document.querySelectorAll('#ppx-ov .ppx-t[data-cat="'+cat+'"]').forEach(function(el){
    var k=el.getAttribute('data-k'), ex=_appendixExcl.has(k);
    if(on===ex) _ppxToggle(el);   // flip only the ones in the wrong state
  });
}
function _ppxCounts(){
  var tot=0, inc=0;
  document.querySelectorAll('#ppx-ov .ppx-t').forEach(function(el){ tot++; if(!_appendixExcl.has(el.getAttribute('data-k'))) inc++; });
  var t=document.getElementById('ppx-total'); if(t) t.textContent=inc+' of '+tot+' photos will print';
  ['records','flow','checklist','deficiency','general'].forEach(function(c){
    var n=0,m=0;
    document.querySelectorAll('#ppx-ov .ppx-t[data-cat="'+c+'"]').forEach(function(el){ m++; if(!_appendixExcl.has(el.getAttribute('data-k'))) n++; });
    var s=document.getElementById('ppx-cnt-'+c); if(s) s.textContent=n+'/'+m;
  });
}
function _ppxGenerate(){ _ppxDone(); }   // S296-era entry — INERT since S316, kept per S137
/* S316: the pump curves were MISSING from exported reports whenever the
   Performance tab hadn't been opened that session — chart3pt etc. are only
   instantiated when #panel-s4 first shows, and toBase64Image() of a chart in a
   display:none panel is blank anyway. Fix: make the panel measurable off-screen,
   force-init + resize + sync-render all four charts, snapshot, then restore. */
/* S508: PRINTED CHART TEXT SIZE — root cause and fix.
   The PDF captures the LIVE chart canvas and then scales that whole picture down to the
   ~6.96in the chart occupies on the page. Every mark on it — annotation labels, axis
   numbers, axis titles — shrinks by the same ratio, so the printed text size was a
   function of how wide the operator's chart happened to be on screen. At the usual
   1063px stage the 10px label printed at ~4.7pt, roughly half the report's 8.5pt table
   text and unreadable; a colleague on a narrower window got a different (larger) size
   from the same report. Nobody chose either.
   Fix: size every chart to the PRINTED proportions immediately before capture — one
   fixed width, each chart's own aspect preserved, so the printed page geometry is
   unchanged — then restore. Printed text then lands at a consistent size for every user
   on every screen: 10px label/tick -> ~7pt, 11-12px axis titles -> ~7.7-8.4pt, sitting
   just under the report's 8.5pt table text.
   Returns a restore function; the caller MUST call it. */
function _sizeChartsForPrint(){
  var PRINT_STAGE_W = 716;   // CSS px. Printed size of a 10px mark = 72*10*6.96/716 = 7.0pt.
  var PRINT_DPR     = 3;     // 716 x 3 = 2148px across 6.96in = ~308dpi, so the smaller canvas stays crisp.
  var saved=[];
  [chart3pt,netChart3pt,pldChart,pldNetChart].forEach(function(c){
    try{
      if(!c || !c.canvas) return;
      var stage=c.canvas.parentElement; if(!stage) return;
      var w=stage.clientWidth||0, h=stage.clientHeight||0; if(!w || !h) return;
      saved.push({c:c,stage:stage,style:stage.getAttribute('style'),
                  dpr:(c.options?c.options.devicePixelRatio:undefined)});
      stage.style.width  = PRINT_STAGE_W+'px';
      stage.style.height = Math.round(h*(PRINT_STAGE_W/w))+'px';   // same aspect => same printed height
      if(c.options) c.options.devicePixelRatio = PRINT_DPR;
      c.resize();
      (c.__origUpdate||c.update).call(c,'none');
    }catch(_){}
  });
  return function(){
    saved.forEach(function(s){
      try{
        if(s.style===null) s.stage.removeAttribute('style'); else s.stage.setAttribute('style',s.style);
        if(s.c.options){ if(s.dpr===undefined) delete s.c.options.devicePixelRatio; else s.c.options.devicePixelRatio=s.dpr; }
        s.c.resize();
        (s.c.__origUpdate||s.c.update).call(s.c,'none');
        // labels were positioned against the print-width chart — re-place them for the screen
        if(typeof renderChartAnnotations==='function' && s.c.canvas) renderChartAnnotations(s.c, s.c.canvas.id);
      }catch(_){}
    });
  };
}
function _ensureChartsForExport(){
  var panel=document.getElementById('panel-s4'), restored=null, printSized=null;
  try{
    if(panel && getComputedStyle(panel).display==='none'){
      restored=panel.getAttribute('style')||'';
      panel.setAttribute('style',(restored?restored+';':'')+'display:block;position:absolute;left:-12000px;top:0;width:1100px;');
    }
    if(!chart3pt && typeof initChart3pt==='function') initChart3pt();
    if(!netChart3pt && typeof initNetChart3pt==='function') initNetChart3pt();
    if(!pldChart && typeof initPldChart==='function') initPldChart();
    if(!pldNetChart && typeof initPldNetChart==='function') initPldNetChart();
    [chart3pt,netChart3pt,pldChart,pldNetChart].forEach(function(c){ try{ if(c){ c.resize(); c.update('none'); } }catch(_){} });
    if(typeof refreshAllCharts==='function') refreshAllCharts();
    printSized=_sizeChartsForPrint();   // S508: last, so it measures the settled stage
  }catch(e){ console.warn('[export] chart ensure failed', e); }
  return function(){
    try{
      if(printSized) printSized();      // S508: undo print sizing while the panel is still measurable
      if(panel && restored!==null){ if(restored) panel.setAttribute('style',restored); else panel.removeAttribute('style'); }
      [chart3pt,netChart3pt,pldChart,pldNetChart].forEach(function(c){ try{ if(c) c.resize(); }catch(_){} });
    }catch(_){}
  };
}
function _exportPDFGo() {
  window._apxBandEmitted = false;   // S372.5: reset per-export; _appendixHTML / flow-test / sketch set it true when the Photo Appendix band is emitted
  var _chartRestore=_ensureChartsForExport();   // S316
  // S503b: ORDER IS EVERYTHING. _ensureChartsForExport resizes the charts; a resize
  // fires each chart's patched update(), which CLEARS the annotation overlay and
  // reschedules it on an 80ms timeout. So warming/baking BEFORE that timeout fires was
  // pointless — the late render wiped it (and could wipe the baked canvas pixels too,
  // which is why the PDF kept coming out with no labels even after S503). Fix: wait for
  // the resize's async render to settle, THEN warm the overlay, THEN bake, THEN capture —
  // with nothing async able to run between bake and _realExportPDF's toBase64Image().
  var _chartPairs=[['chart3pt',chart3pt],['netChart3pt',netChart3pt],['pldChart',pldChart],['pldNetChart',pldNetChart]];
  setTimeout(function(){
    // S503d COLD-EXPORT FIX (harness-verified with a true cold start): on export from a
    // tab where the Performance panel was NEVER opened, the annotation overlay div does
    // not exist — hookChartAnnotations only runs when the panel first shows, and
    // renderChartAnnotations bails on its first line without an overlay. So every prior
    // warm/bake call was a silent no-op on the cold path and the PDF had no labels.
    // Sequence (all synchronous, nothing can interleave before capture):
    // 1) create the overlay if missing (idempotent) + first render — the render's own
    //    self-heal hooks the chart, captures formatters, disables Chart.js datalabels
    _chartPairs.forEach(function(p){ try{ if(p[1] && typeof initChartAnnotationOverlay==='function') initChartAnnotationOverlay(p[1],p[0]); }catch(_){} });
    _chartPairs.forEach(function(p){ try{ if(p[1] && typeof renderChartAnnotations==='function') renderChartAnnotations(p[1],p[0]); }catch(_){} });
    // 2) clean synchronous redraw via the UN-patched update: repaints the chart without
    //    the now-disabled plugin labels and schedules no deferred overlay wipe
    _chartPairs.forEach(function(p){ try{ if(p[1]) (p[1].__origUpdate||p[1].update).call(p[1],'none'); }catch(_){} });
    // 3) re-render the overlay from settled chart geometry, bake, capture — back-to-back
    _chartPairs.forEach(function(p){ try{ if(p[1] && typeof renderChartAnnotations==='function') renderChartAnnotations(p[1],p[0]); }catch(_){} });
    _chartPairs.forEach(function(p){ _bakeAnnotationsOntoCanvas(p[1],p[0]); });
    _realExportPDF();
    // Clear baked annotations from canvases by re-rendering
    setTimeout(function(){
      [chart3pt,netChart3pt,pldChart,pldNetChart].forEach(function(ci){
        if(ci) { var origUpd = ci.__origUpdate || ci.update; origUpd.call(ci,'none'); }
      });
      _chartRestore();   // S316: hide the panel again if we revealed it
    }, 300);
  }, 180);   // S503b: was 100 — the resize's overlay re-render fires ~80ms in; wait past it with margin before warm+bake+capture
}
function _realExportPDF() {
  try {
  const proj = getProjInfo();
  const b1tot = batData.b1.reduce((a,b)=>a+b,0);
  const b2tot = batData.b2.reduce((a,b)=>a+b,0);
  const cumTot = b1tot+b2tot;

  const statusLabel = s => s==='yes'?'YES ✓':s==='no'?'NO ✗':s==='na'?'N/A':'—';
  const statusColor = s => s==='yes'?'#5F8068':s==='no'?'#A85959':s==='na'?'#888':'#999';

  const clSection = (items, section) => {
    const allItems = [...items, ...(customItems[section]||[])];
    return allItems.map((item,idx)=>{
    const id=cid(section,idx), st=clState[id];
    const sc=st?.status, cm=st?.comment||'';
    const txt = (st?.customText || item.text).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const photos = (st?.photos||[]);
    // S366: pill status + comments inline; photos sit in a spanning row below.
    const pillCls = sc==='yes'?'yes':sc==='no'?'no':sc==='na'?'na':'';
    const pillTxt = sc==='yes'?'Yes':sc==='no'?'No':sc==='na'?'N/A':'—';
    const pill = pillCls ? `<span class="pill ${pillCls}">${pillTxt}</span>` : `<span style="color:#B08948;font-weight:700;">—</span>`;
    const rowCls = sc==='no'?' class="nd-flag"':'';
    const cmHtml = cm ? `<div style="font-size:8.5pt;font-style:italic;color:#555;margin-top:3px;">${cm}</div>` : '';
    const photosRow = photos.length ? `<tr class="ph-keep ${sc==='no'?'no-detail':''}"><td></td><td colspan="2" style="padding:2px 8px 7px;"><div class="nd-photos">${photos.map(p=>`<img src="${_phSrc(p)}" style="width:170px;height:128px;object-fit:cover;border:1px solid #ddd;border-radius:4px;">`).join('')}</div></td></tr>` : '';
    return `<tr${rowCls}>
      <td class="ctr" style="font-weight:600;color:#666;white-space:nowrap;font-size:9pt;width:34px;">${item.num}</td>
      <td>${txt}${cmHtml}</td>
      <td class="ctr" style="white-space:nowrap;width:90px;">${pill}</td>
    </tr>${photosRow}`;
    }).join('');
  };
  const chartImgA = chart3pt ? chart3pt.toBase64Image() : '';
  const chartImgD = netChart3pt ? netChart3pt.toBase64Image() : '';
  const chartImgB = pldChart ? pldChart.toBase64Image() : '';
  const chartImgC = pldNetChart ? pldNetChart.toBase64Image() : '';

  var _pdfSfn = window._csHubSfn || (proj.projnum||'') + ' ' + (proj.projname||'Diesel Pump Report');
  var _pdfRev = proj.revision || 'A01';
  var _pdfInstNum = 1; try{if(typeof CloudSync!=='undefined'&&CloudSync.instanceNumber)_pdfInstNum=CloudSync.instanceNumber;}catch(e){}
  var _pdfTitle = _pdfSfn.trim() + ' Diesel Pump Commissioning Report' + (_pdfInstNum>1?' #'+_pdfInstNum:'') + ' ' + _pdfRev;

  // ════ S317: cover Status Overview + Inspection Completion (approved demo).
  //      Donut = checklist outcomes across sections 1/2/3/5 incl. custom items;
  //      bars = answered/total overall and per section. Report palette only. ════
  var _ovHtml='';
  try{
    var _ovSecs=[[S1,'s1','1. Pre-Commissioning'],[S2,'s2','2. Visual Inspection'],[S3,'s3','3. Controller Tests'],[S5,'s5','5. FA & Signaling']];
    var _ovC={yes:0,no:0,na:0,ic:0,total:0}, _ovPer=[];
    _ovSecs.forEach(function(cfg){
      var items=cfg[0].concat(customItems[cfg[1]]||[]), ans=0;
      items.forEach(function(it,idx){
        var st=clState[cid(cfg[1],idx)], sc=st&&st.status;
        _ovC.total++;
        if(sc==='yes'){_ovC.yes++;ans++;}
        else if(sc==='no'){_ovC.no++;ans++;}
        else if(sc==='na'){_ovC.na++;ans++;}
        else _ovC.ic++;
      });
      _ovPer.push({name:cfg[2],ans:ans,tot:items.length});
    });
    var _C=2*Math.PI*44, _off=0, _arcs='';
    [['yes','#5F8068'],['no','#A85959'],['na','#888888'],['ic','#B08948']].forEach(function(seg){
      var n=_ovC[seg[0]]; if(!n||!_ovC.total) return;
      var len=_C*n/_ovC.total;
      _arcs+='<circle cx="60" cy="60" r="44" fill="none" stroke="'+seg[1]+'" stroke-width="17" stroke-dasharray="'+len.toFixed(2)+' '+(_C-len).toFixed(2)+'" stroke-dashoffset="'+(-_off).toFixed(2)+'" transform="rotate(-90 60 60)"/>';
      _off+=len;
    });
    function _leg(lbl,col,n){ var p=_ovC.total?Math.round(100*n/_ovC.total):0;
      return '<div style="display:flex;align-items:center;gap:7px;font-size:9pt;padding:2px 0;"><span style="width:9px;height:9px;border-radius:50%;background:'+col+';"></span><span style="flex:1;">'+lbl+'</span><b>'+n+'</b><span style="color:#888;width:34px;text-align:right;">'+p+'%</span></div>'; }
    var _ans=_ovC.yes+_ovC.no+_ovC.na, _ovPct=_ovC.total?Math.round(100*_ans/_ovC.total):0;
    function _bar(name,a,t){ var p=t?Math.round(100*a/t):0;
      return '<div style="display:flex;align-items:center;gap:9px;font-size:9pt;padding:3px 0;"><span style="flex:0 0 1.5in;">'+name+'</span><span style="flex:1;height:7px;border-radius:4px;background:#E8E6EC;overflow:hidden;"><span style="display:block;height:100%;width:'+p+'%;background:#9C2742;"></span></span><b style="width:44px;text-align:right;">'+a+'/'+t+'</b></div>'; }
    _ovHtml='<div style="display:flex;gap:14px;margin:14px 0 0;">'
      +'<div style="flex:1;border:1px solid #D8D5DE;border-radius:8px;padding:11px 14px;">'
        +'<div style="font-size:9.5pt;font-weight:700;margin-bottom:6px;">Status Overview</div>'
        +'<div style="display:flex;align-items:center;gap:14px;">'
          +'<svg width="106" height="106" viewBox="0 0 120 120">'+_arcs
            +'<text x="60" y="58" text-anchor="middle" font-size="26" font-weight="700" font-family="Calibri">'+_ovC.total+'</text>'
            +'<text x="60" y="74" text-anchor="middle" font-size="8.5" fill="#888" font-family="Calibri">CHECKLIST</text></svg>'
          +'<div style="flex:1;">'+_leg('Pass','#5F8068',_ovC.yes)+_leg('Fail','#A85959',_ovC.no)+_leg('N/A','#888888',_ovC.na)+_leg('Incomplete','#B08948',_ovC.ic)+'</div>'
        +'</div></div>'
      +'<div style="flex:1;border:1px solid #D8D5DE;border-radius:8px;padding:11px 14px;">'
        +'<div style="display:flex;font-size:9.5pt;font-weight:700;margin-bottom:6px;"><span style="flex:1;">Inspection Completion</span><span style="color:#9C2742;">'+_ovPct+'%</span></div>'
        +_bar('Overall',_ans,_ovC.total)
        +_ovPer.map(function(s){return _bar(s.name,s.ans,s.tot);}).join('')
      +'</div></div>';
  }catch(e){ console.warn('[pdf] overview build failed', e); }

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${_pdfTitle.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    @font-face{font-family:'BlairMdITC TT';src:url(data:font/truetype;base64,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AFcAWABZAFoAWwBcAF0AXgBfAGAAYQCeAJgAhACFAK0AkgDKAIYAjgCLAJMAmwCZANEAigDGAIMAkQDUANUAjQDhAIgAsQDHANMAlACcANcA1gDYAJcAnwC3ALUAoABiAGMAjwBkALkAZQC2ALgAvQC6ALsAvADLAGYAwAC+AL8AoQBnANIAkADDAMEAwgBoAM0AzwCJAGoAaQBrAG0AbABuAJUAbwBxAHAAcgBzAHUAdAB2AHcAzAB4AHoAeQB7AH0AfACqAJYAfwB+AIAAgQDOANAAqwDvANkA2gCiAKMAyADJAKwA2wDcAJoAxAD1AMYA8ADxAPIA9ADFAPMA6gDnAOEA5QAQAKQApQCoAKkAsgCmAKcAswCCALAAhwCdALQArgCvAOwAjADnAOIA6gDkAOMA0QCxAOgA3gDmAOkA3QDfAOAA6QDrAO0A7gAAAAAAAQAAKy4AAQcwADwACirkAAYAGv+yAAYAHP+9AAcAE//aAAcAGP/1AAcAGf/gAAcAG//zAAcAHP/NAAkAMv/XAAkAN/+NAAkAkP/XAA0AJP+bAA0AY/+bAA4AH//gAA4AIP/gAA4AYf/gAA4Anf/wAA8AFP+7AA8AFwALAA8AGv/dAA8ATQAQAA8Ap/9lAA8Aqf/1ABAAFf/gABAAFv/zABAAFwAZABAAGAAoABAAGQAwABAAGv+gABAAGwAdABAAJP/0ABAALf/IABAAMgAqABAANAArABAANv/rABAAN/93ABAAOAAfABAAOf/QABAAOgANABAAO/+0ABAAPP+hABAARP/YABAATf9oABAAVgALABAAV/+gABAAWf/nABAAW//IABAAXP/QABAAXf/gABAAY//0ABAAbv/YABAAkAAqABEAFP/bABEAF//IABEAGf/YABEAGv+vABEAp/90ABEAqf/0ABIAJP+UABIAJv/JABIALf+aABIAMv/PABIAY/+UABIAZP/JABIAkP/PABMAD/+wABMAEf+wABMAE//vABMAFP/rABMAFf/gABMAFv/bABMAGf/1ABMAGv+vABMAG//4ABMAHP/yABMAqf/QABQAD//OABQAEf/OABQAE//1ABQAFAARABQAFf/4ABQAGAApABQAGQAKABQAGwAQABQAHAAJABQApwAdABQAqf/tABUAEP/xABUAE//pABUAFv/vABUAF//yABUAGP/6ABUAGf/vABUAGv/PABUAG//pABUAHP/1ABYAD//AABYAEAAbABYAEf/IABYAE//uABYAFP/6ABYAFf/4ABYAF//0ABYAGAANABYAGf/0ABYAGv/LABYAG//5ABYAHP/yABYApwAXABYAqf/nABcAD/+rABcAEAAXABcAEf/gABcAFAAjABcAFQAIABcAFgAnABcAFwAvABcAGAAbABcAGv/IABcAGwAdABcAp//zABcAqf/DABgAD//QABgAEAAnABgAEf/YABgAE//eABgAFf/4ABgAFv/oABgAF//1ABgAGP/wABgAGf/kABgAGv+1ABgAG//iABgAHP/ZABgAp//sABgAqf/sABkAD//IABkAEAAfABkAEf/gABkAE//YABkAFf/xABkAFv/zABkAF//4ABkAGf/mABkAGv+qABkAHP/zABkAp//tABkAqf/VABoAD/8JABoAEP/IABoAEf73ABoAE//RABoAFAAoABoAFf/qABoAFv/gABoAF//EABoAGP/2ABoAGf/UABoAGgAYABoAG//dABoAHf+9ABoApwA9ABoAqQA9ABsAD//fABsAEAAaABsAEf/tABsAE//tABsAFAAMABsAGAAIABsAGQASABsAGv/MABsAGwAHABsAHP/wABsApwAQABsAqf/oABwACP/gABwAD/+gABwAEAAsABwAEf+YABwAE//yABwAFP/2ABwAFf/oABwAFv/QABwAF//vABwAGf/vABwAGv+8ABwAG//4ABwAHP/4ABwAqf/QAB4ATf/pAB8AIP/4AB8AQf/wAB8AYf/YAB8Arf/oACAAH//wACAAIP/wACAAIf/oACAAQf/wACAAX//4ACAAYf/IACAArf/oACEAH//4ACEAIP/4ACEAIQAYACEAYf/gACEArf/wACQADwAUACQAEP/1ACQAEQAtACQAHv/oACQAIv/FACQAJf/4ACQAJv/YACQAJ//4ACQAKf/4ACQAKv/3ACQAK//4ACQALP/4ACQALv/4ACQAL//4ACQAMP/4ACQAMf/4ACQAMv/mACQAM//4ACQANP/mACQANf/4ACQANv/WACQAN/+IACQAOP/nACQAOf+uACQAOv/hACQAPP94ACQAPQAIACQARAAzACQAVv/1ACQAV/91ACQAWP/sACQAWf/HACQAWv/tACQAXP+VACQAZP/YACQAbgAzACQAkP/mACQAp/9rACQAqf9jACUAD//XACUAEf/dACUAJP/nACUAKv/wACUALP/zACUALf/hACUAMv/2ACUANP/mACUANv/pACUAN//IACUAOf/jACUAO//oACUAPP++ACUAPf/0ACUARP/nACUARv/yACUAUv/yACUAVv/0ACUAV//4ACUAWP/6ACUAWv/4ACUAXP/WACUAY//nACUAbv/nACUAb//yACUAkP/2ACUAlv/yACUAp//QACUAqf/gACYAD//BACYAEf/OACYAJP/pACYAJv/KACYAKv/KACYAMv/QACYANP/QACYANv/ZACYAN/++ACYAOf/YACYAO//RACYAPP/GACYARP/ZACYARv/bACYASP/pACYAS//pACYATP/pACYATv/pACYAT//pACYAUv/bACYAVP/eACYAVf/zACYAVv/pACYAVwAJACYAWP/nACYAXP/YACYAXf/oACYAY//pACYAZP/KACYAbv/ZACYAb//bACYAkP/QACYAlv/bACYAp//2ACYAqf/uACcAD/9wACcAEf+eACcAHf/iACcAHv/hACcAJP/cACcAJv/jACcAKf/tACcALf/JACcANP/pACcANv/dACcAN/+QACcAOf/fACcAO/+8ACcAPP+xACcARP/cACcASP/6ACcATf/wACcAUv/0ACcAXP+1ACcAY//cACcAZP/jACcAbv/cACcAlv/0ACcAp//AACcAqf/RACgADwAQACgAEP+2ACgAEQAeACgAJAAXACgAJv/GACgAKv/NACgALf/gACgAL//sACgAMv/VACgANP+4ACgANv/eACgAOf/6ACgAOgAaACgAOwAPACgAPP/pACgAPQAmACgARP/3ACgARf/4ACgARv/MACgAR//4ACgASP/4ACgASv/LACgATP/4ACgATf/nACgAUv/LACgAU//4ACgAVP/QACgAWP/VACgAWf+PACgAWv/DACgAXP99ACgAYwAXACgAZP/GACgAbv/3ACgAb//MACgAkP/VACgAlv/LACgAqQAHACkAD/8LACkAEP+mACkAEf8AACkAHf+RACkAHv+RACkAJP+GACkAJf/xACkAJv+oACkAJ//xACkAKP/xACkAKf/xACkAKv++ACkAK//xACkALP/xACkALf8oACkALv/xACkAL//xACkAMP/xACkAMf/xACkAMv+9ACkAM//xACkANP+YACkANf/xACkANv+3ACkANwApACkAOP/xACkAOQAYACkAOgAyACkAOwATACkAPAAZACkAPf/6ACkARP9BACkASP/GACkASv+dACkATP/GACkAT//GACkAUP+KACkAUf+KACkAUv99ACkAVf/GACkAVv+YACkAV/+PACkAWP/GACkAWv+WACkAXP93ACkAY/+GACkAZP+oACkAbv9BACkAkP+9ACkAlv99ACkApwAHACkAqQAvACoAD/+OACoAEf+jACoAJP/fACoAJv/pACoALf/EACoANP/vACoANv/VACoAN/+jACoAOf/RACoAOv/0ACoAO//YACoAPP+bACoAPf/KACoARP/cACoASP/xACoAS//xACoATP/xACoATv/xACoAT//xACoAUv/1ACoAVf/xACoAV//kACoAWP/wACoAWf/nACoAXP+rACoAXf/dACoAY//fACoAZP/pACoAbv/cACoAlv/1ACoAp//AACoAqf/AACsAD//YACsAEf/YACsANP/xACsAN//xACsAOf/oACsAPP/YACsARP/mACsASv/6ACsAUv/6ACsAXP/KACsAbv/mACsAlv/6ACsAp//oACsAqf/gACwAD//EACwAEAAZACwAEf/kACwAJP/4ACwAJf/3ACwAK//3ACwALf/MACwAL//3ACwAMf/3ACwAMv/xACwAN//xACwAOf/4ACwAPP/oACwASv/6ACwAUv/6ACwAV//mACwAY//4ACwAkP/xACwAlv/6ACwAp//oAC0AD/+7AC0AEf+4AC0AJP/4AC0AOgAYAC0APP/wAC0ARP/WAC0AY//4AC0Abv/WAC0Ap//gAC4ADwAMAC4AEP++AC4AEQAHAC4AHf/zAC4AJAAUAC4AJv/UAC4AKv/DAC4ALf/QAC4AMv/CAC4ANP+yAC4ANv/VAC4AN//sAC4AOP/wAC4AOgAfAC4APP/uAC4APQAzAC4ARAAcAC4ASv/CAC4AUv/CAC4AVv/5AC4AV//JAC4AWP/cAC4AWv/HAC4AWwA0AC4AXP/GAC4AYwAUAC4AZP/UAC4AbgAcAC4AkP/CAC4Alv/CAC4Ap//tAC4AqQANAC8ADwAVAC8AEP8lAC8AEQAcAC8AJAAyAC8AJf/xAC8AJv/FAC8AJ//xAC8AKP/sAC8AKf/xAC8AKv/FAC8AK//xAC8ALP/xAC8ALf/wAC8ALv/xAC8AL//sAC8AMP/xAC8AMf/xAC8AMv/FAC8AM//xAC8ANP+2AC8ANf/xAC8ANv/FAC8AN/8iAC8AOP/xAC8AOf9fAC8AOv+2AC8APP8vAC8APQAkAC8ARAAlAC8ARv/KAC8AR//3AC8ASP/3AC8ASv/KAC8ATP/3AC8AUv/KAC8AVP/PAC8AV/99AC8AWP/UAC8AWf+NAC8AWv/CAC8AWwAlAC8AXP97AC8AXQAaAC8AYwAyAC8AZP/FAC8AbgAlAC8Ab//KAC8AkP/FAC8Alv/KAC8Ap/8PAC8Aqf8PADAAD//EADAAEf/cADAAJP/4ADAAN//xADAAOf/oADAAPP/XADAAUv/6ADAAXP/SADAAY//4ADAAlv/6ADAAp//oADEAD//EADEAEAAZADEAEf/cADEALP/3ADEALf/EADEAN//xADEAOf/oADEAPP/wADEASv/6ADEATf/wADEAUv/6ADEAXP/SADEAlv/6ADEAp//oADEAqf/qADIACf/hADIAD/+GADIAEAAqADIAEf+rADIAJP/GADIALf/TADIANv/xADIAN/+3ADIAOf/pADIAO/+/ADIAPP+1ADIAPf/EADIARP/OADIATf/zADIAVv/yADIAV//OADIAWgAUADIAW//aADIAXP/iADIAXf/nADIAY//GADIAbv/OADIAp//YADIAqf/IADMAD/8KADMAEAAQADMAEf7vADMAHf/qADMAJP+pADMAJv/1ADMAKv/dADMALf+AADMANP/6ADMANv/uADMAOgAjADMAO//lADMAPP/0ADMAPf/zADMARP+zADMAR//1ADMASAAJADMASf/1ADMATAAJADMATwAgADMAUv/xADMAVQAJADMAVv/sADMAVwAaADMAWAAaADMAWgAZADMAWwAOADMAY/+pADMAZP/1ADMAbv+zADMAlv/xADMApwASADMAqQAKADMA7f/1ADMA7v/1ADQAD/+iADQAEf+wADQAJP/mADQAOP/xADQAY//mADQAp//ZADQAqf/RADUAD//eADUAEf/gADUAJP/wADUALf/QADUANP/qADUANv/2ADUAN//OADUAOf/zADUAPP/UADUAPQASADUARP/jADUARv/sADUAUv/sADUAVP/sADUAVv/1ADUAWP/6ADUAXAAGADUAY//wADUAbv/jADUAb//sADUAlv/sADUAp//oADUAqf/qADYACf/yADYAD//SADYAEAAjADYAEf/fADYAJP/oADYAJv/mADYAKv/lADYALf/tADYAMv/sADYANP/tADYANv/nADYAN//BADYAOf/vADYAOv/yADYAPP/GADYAPf/yADYARP/nADYARv/4ADYAR//0ADYASP/0ADYAUv/4ADYAU//0ADYAVP/5ADYAVv/qADYAV/+cADYAWv/hADYAXP/EADYAY//oADYAZP/mADYAbv/nADYAb//4ADYAkP/sADYAlv/4ADYAp//IADYAqf/AADcAD/9fADcAEP9tADcAEf8/ADcAHf87ADcAHv88ADcAJP+IADcAJf/xADcAJv/EADcAJ//xADcAKP/xADcAKf/xADcAKv/EADcAK//xADcALP/xADcALf9AADcALv/xADcAL//xADcAMP/xADcAMf/xADcAMv+3ADcAM//xADcANP++ADcANf/xADcANv/GADcANwAmADcAOP/xADcAOQAeADcAOgAeADcAO//sADcAPAAIADcAPQAJADcARP9KADcARv9mADcASP/QADcASv9mADcAS//QADcATP/QADcAT/9yADcAUv9uADcAVf/QADcAVv+LADcAWP/QADcAWf9vADcAWv+2ADcAXP9dADcAXf9mADcAY/+IADcAZP/EADcAbv9KADcAb/9mADcAkP+3ADcAlv9uADcApwAeADcAqQAeADgAD/+2ADgAEAAfADgAEf/EADgAJP/mADgALf/KADgAMv/xADgAN//xADgAOf/YADgAO//gADgAPP/AADgAPf/fADgARP/SADgARv/6ADgASv/6ADgATf/1ADgAUv/6ADgAVv/1ADgAW//5ADgAXf/1ADgAY//mADgAbv/SADgAb//6ADgAkP/xADgAlv/6ADgAp//gADgAqf/gADkAD/8xADkAEP/GADkAEf8wADkAHf+pADkAHv+sADkAJP+sADkAJf/4ADkAJv/zADkAJ//4ADkAKP/4ADkAKf/4ADkAKv/KADkAK//oADkALP/4ADkALf+QADkAL//oADkAMP/oADkAMf/oADkAMv/pADkANv/tADkANwAeADkAOP/YADkAOgA4ADkAPAAPADkARP+tADkARv/FADkASP/sADkASv/EADkATP/pADkAUP/pADkAUf/pADkAUv/EADkAVf/sADkAVv/dADkAVwASADkAWP/vADkAWQAVADkAWgAUADkAWwAMADkAXAATADkAXQALADkAY/+sADkAZP/zADkAbv+tADkAb//FADkAkP/pADkAlv/EADkApwAXADkAqQA3ADoAD/+hADoAEAALADoAEf+wADoAHf/iADoAHv/jADoAJP/VADoAKAAIADoAKv/gADoALf/QADoANv/3ADoANwAeADoARP/FADoARv/oADoAR//1ADoASP/1ADoASv/nADoAS//1ADoATP/zADoATv/zADoAT//zADoAUP/zADoAUf/zADoAUv/oADoAVf/1ADoAVv/vADoAWP/5ADoAWwAXADoAXP/uADoAXQAVADoAY//VADoAbv/FADoAb//oADoAlv/oADoApwApADoAqQAhADsADwAYADsAEP+0ADsAEQAjADsAHv/YADsAJAAVADsAJv/bADsAKv+5ADsALf/gADsAMv+/ADsANP+/ADsAN//sADsAPAAvADsAPQAyADsARAAzADsARv/CADsAUv/CADsAV//uADsAXP/tADsAYwAVADsAZP/bADsAbgAzADsAb//CADsAkP+/ADsAlv/CADsAqQAdADwAD/80ADwAEP+iADwAEf8kADwAHf90ADwAHv+AADwAJP94ADwAJv+wADwAJ//oADwAKP/oADwAKv+wADwAK//gADwALP/nADwALf9QADwAMv+2ADwAM//oADwANv/XADwAOP+4ADwAOgA4ADwAPQAwADwARP92ADwARf/ZADwARv+cADwAR//ZADwASP+5ADwASv+bADwAS//ZADwATP+1ADwATv/VADwAT//VADwAUP/VADwAUf/VADwAUv+bADwAU//ZADwAVf/ZADwAVv+9ADwAWP/FADwAW//5ADwAXf/6ADwAY/94ADwAZP+wADwAbv92ADwAb/+cADwAkP+2ADwAlv+bADwApwANADwAqQANAD0ADwAfAD0AEP/QAD0AEQAmAD0AJAAvAD0AJv/oAD0AKP/wAD0AKv+1AD0AMv+8AD0ANv/WAD0AN//tAD0AOP/wAD0AOgAjAD0APQAuAD0ARAAvAD0ARv/UAD0AUv/UAD0AWP/dAD0AYwAvAD0AZP/oAD0AbgAvAD0Ab//UAD0AkP+8AD0Alv/UAEEAH//wAEEAQf/wAEEAYf/QAEEAnf/4AEEArf/oAEQAEP/oAEQAEQAVAEQAHf/6AEQAHv/yAEQARAALAEQARf/4AEQARv/nAEQAR//4AEQASP/4AEQASf/4AEQASv/nAEQAS//4AEQATP/4AEQATf/wAEQATv/4AEQAT//4AEQAUP/4AEQAUf/4AEQAUv/nAEQAU//4AEQAVP/nAEQAVf/4AEQAVv/sAEQAV/90AEQAWP/4AEQAWf/VAEQAWv/qAEQAXP+aAEQAbgALAEQAb//nAEQAlv/nAEQAp/+EAEQAqf90AEQA7f/4AEQA7v/4AEUAD//aAEUAEf/wAEUAHf/sAEUAHv/tAEUARP/5AEUATQAJAEUAV//DAEUAWf/zAEUAXP/YAEUAbv/5AEUAp//YAEUAqf/oAEYAD//jAEYAEf/oAEYAHf/lAEYAHv/pAEYARP/rAEYARv/gAEYASv/4AEYATf/YAEYAUv/vAEYAVP/tAEYAVv/0AEYAV//QAEYAXP/qAEYAXf/uAEYAbv/rAEYAb//gAEYAlv/vAEYAp//2AEYAqf/2AEcAD//NAEcAEf+7AEcAHf/qAEcAHv/qAEcARP/cAEcATf+/AEcAVv/6AEcAV/+oAEcAWf/gAEcAW//dAEcAXP/LAEcAXf/YAEcAbv/cAEcAp//CAEcAqf/KAEgADwAcAEgAEP+rAEgAEQAjAEgARP/2AEgARv/hAEgASf/0AEgASv/ZAEgATf/0AEgAUv/ZAEgAVP/WAEgAVv/nAEgAWP/0AEgAWgAcAEgAWwANAEgAXP/zAEgAXQAhAEgAbv/2AEgAb//hAEgAlv/ZAEgAqQAWAEgA7f/0AEgA7v/0AEkAD/8eAEkAEP+4AEkAEf8MAEkAHf/oAEkAHv/oAEkARP9yAEkARf/2AEkARv/IAEkAR//2AEkASP/2AEkASf/2AEkASv/OAEkAS//2AEkATP/2AEkATf9OAEkATv/2AEkAT//2AEkAUP/2AEkAUf/2AEkAUv/IAEkAU//2AEkAVP/HAEkAVf/2AEkAVv/SAEkAVwAVAEkAWP/oAEkAWQAMAEkAWgASAEkAXQAXAEkAbv9yAEkAb//IAEkAlv/IAEkApwAiAEkAqQAyAEkA7f/2AEkA7v/2AEoAD//IAEoAEf+1AEoAHf/dAEoAHv/dAEoARP/aAEoATf/EAEoAVv/wAEoAV/+4AEoAWf/iAEoAXP+/AEoAbv/aAEoAp//EAEoAqf/EAEsAD//rAEsAEf/jAEsAHf/yAEsAHv/yAEsARP/4AEsATf/4AEsAV//2AEsAWf/4AEsAXP/pAEsAXf/6AEsAbv/4AEsAp//4AEwAD//oAEwAEf/zAEwARP/4AEwATf/gAEwAV//2AEwAWf/4AEwAXP/pAEwAXf/6AEwAbv/4AE0AD//QAE0AEf/QAE0AHf/tAE0AHv/uAE0ARP/zAE0AV//2AE0AWAANAE0AWgAgAE0AXP/wAE0Abv/zAE0AqQAHAE4ADwAnAE4AEP/DAE4AEQAZAE4AHf/uAE4AHv/uAE4ARAAOAE4ARf/oAE4ARwAHAE4ASv/UAE4ATf/4AE4AUv/kAE4AVP/VAE4AV//sAE4AWP/wAE4AWv/zAE4AWwA3AE4AXP/yAE4AXQAsAE4AbgAOAE4Alv/kAE4AqQAYAE8ADwA7AE8AEP+YAE8AEQBLAE8ARAAKAE8ARf/2AE8ARv/hAE8AR//2AE8ASP/2AE8ASf/2AE8ASv/hAE8AS//2AE8ATP/2AE8ATf/4AE8ATv/2AE8AT//kAE8AUP/2AE8AUf/2AE8AUv/ZAE8AU//2AE8AVP/VAE8AVf/2AE8AVv/gAE8AV/9LAE8AWP/QAE8AWf+EAE8AWv/AAE8AWwAQAE8AXP9MAE8AbgAKAE8Ab//hAE8Alv/ZAE8Ap/9BAE8Aqf9BAE8A7f/2AE8A7v/2AFAAD//rAFAAEf/rAFAAHf/yAFAAHv/yAFAARP/4AFAATf/QAFAAV//2AFAAWf/4AFAAXP/oAFAAXf/6AFAAbv/4AFEAD//bAFEAEAAhAFEAEf/rAFEAHf/yAFEAHv/yAFEARP/4AFEATf/QAFEAV//2AFEAWf/4AFEAXP/ZAFEAXf/6AFEAbv/4AFEAp//gAFIAD/+1AFIAEAA0AFIAEf+yAFIARP/oAFIATf/aAFIAVv/2AFIAV/+8AFIAWf/oAFIAWgAGAFIAW//RAFIAXP+/AFIAXf/PAFIAbv/oAFIAp//YAFIAqf/bAFMAD/74AFMAEf7tAFMAHv/oAFMARP+2AFMATf/PAFMAVv/6AFMAV//2AFMAW//wAFMAXP/4AFMAbv+2AFMApwAgAFMAqQAoAFQAD/+wAFQAEf/IAFQARP/aAFQAbv/aAFQAp//YAFQAqf/YAFUAD//4AFUAEAAkAFUAEQALAFUAHf/1AFUAHv/1AFUARP/oAFUARgAHAFUATf/jAFUATwAIAFUAUv/3AFUAV//YAFUAWwAeAFUAXP/aAFUAXQASAFUAbv/oAFUAbwAHAFUAlv/3AFUAp//3AFYAD//iAFYAEAAbAFYAEf/oAFYAHf/eAFYAHv/dAFYARP/1AFYAUgAQAFYAV//BAFYAWf/3AFYAWv/6AFYAW//mAFYAXP++AFYAXf/1AFYAbv/1AFYAlgAQAFYAp//VAFYAqf/lAFcAD/9BAFcAEP93AFcAEf8xAFcAHf9tAFcAHv9uAFcARP90AFcARf/2AFcARv/RAFcAR//2AFcASP/2AFcASf/2AFcASv/RAFcAS//2AFcATP/2AFcATf9IAFcATv/2AFcAT//2AFcAUP/2AFcAUf/2AFcAUv/RAFcAU//2AFcAVP/QAFcAVf/2AFcAVv/YAFcAVwAVAFcAWP/2AFcAWQAgAFcAWgAhAFcAXAAQAFcAXQAkAFcAbv90AFcAb//RAFcAlv/RAFcApwAoAFcAqQAwAFcA7f/2AFcA7v/2AFgAD//IAFgAEAAlAFgAEf/NAFgAHf/nAFgAHv/oAFgARP/4AFgATf/gAFgAV//2AFgAWf/4AFgAWgAGAFgAXf/6AFgAbv/4AFgAp//zAFgAqf/rAFkAD/9ZAFkAEP/nAFkAEf9HAFkAHf/jAFkAHv/lAFkARP/RAFkARf/4AFkAR//4AFkASP/4AFkASf/mAFkASv/4AFkAS//4AFkATP/4AFkATf+oAFkATv/4AFkAT//4AFkAUP/4AFkAUf/4AFkAUv/oAFkAU//4AFkAVf/4AFkAVv/2AFkAVwAgAFkAWP/4AFkAWgAPAFkAXAAGAFkAXQAjAFkAbv/RAFkAlv/oAFkApwAvAFkAqQAfAFkA7f/mAFkA7v/mAFoAD/+eAFoAEAAaAFoAEf+lAFoAHf/wAFoAHv/yAFoARP/qAFoARgAgAFoATf/YAFoAUgAGAFoAVwAgAFoAbv/qAFoAbwAgAFoAlgAGAFoApwAzAFoAqQAzAFsAEP/HAFsAEQATAFsARP/6AFsARv/hAFsAUv/SAFsAVP/aAFsAXAAKAFsAbv/6AFsAb//hAFsAlv/SAFsApwAdAFsAqQAdAFwAD/8pAFwAEP/JAFwAEf9BAFwAHf/HAFwAHv/MAFwARP98AFwARf/pAFwARv/IAFwAR//pAFwASP/pAFwASf/pAFwASv/HAFwAS//pAFwATP/pAFwATf+XAFwATv/pAFwAT//pAFwAUP/oAFwAUv+/AFwAU//pAFwAVf/gAFwAVv/RAFwAbv98AFwAb//IAFwAlv+/AFwApwAVAFwAqQAtAFwA7f/pAFwA7v/pAF0ADwAhAF0AEP/YAF0AEQAgAF0ARP/5AF0ARf/6AF0ARv/wAF0AR//6AF0ASP/6AF0ASv/OAF0AT//6AF0AUv/OAF0AVv/kAF0AV//kAF0AWgAZAF0AXQAoAF0Abv/5AF0Ab//wAF0Alv/OAF0Ap//4AF0AqQAQAF8ADv/gAF8AH//oAF8AIP/wAF8AQf/wAF8AYf/YAF8Anf/wAF8Arf/wAGEADv/gAGEAH//QAGEAIP/wAGEAIf+oAGEAQf/IAGEAX//YAGEAmf/oAGEAnf/4AGEArf/YAGMADwAUAGMAEP/1AGMAEQAtAGMAHv/oAGMAIv/FAGMAJf/4AGMAJv/YAGMAJ//4AGMAKf/4AGMAKv/3AGMAK//4AGMALP/4AGMALv/4AGMAL//4AGMAMP/4AGMAMf/4AGMAMv/mAGMAM//4AGMANP/mAGMANf/4AGMANv/WAGMAN/+IAGMAOP/nAGMAOf+uAGMAOv/hAGMAPP94AGMAPQAIAGMARAAzAGMAVv/1AGMAV/91AGMAWP/sAGMAWf/HAGMAWv/tAGMAXP+VAGMAZP/YAGMAbgAzAGMAkP/mAGMAp/9rAGMAqf9jAGQAD//BAGQAEf/OAGQAJP/pAGQAJv/KAGQAKv/KAGQAMv/QAGQANP/QAGQANv/ZAGQAN/++AGQAOf/YAGQAO//RAGQAPP/GAGQARP/ZAGQARv/bAGQASP/pAGQAS//pAGQATP/pAGQATv/pAGQAT//pAGQAUv/bAGQAVP/eAGQAVf/zAGQAVv/pAGQAVwAJAGQAWP/nAGQAXP/YAGQAXf/oAGQAY//pAGQAZP/KAGQAbv/ZAGQAb//bAGQAkP/QAGQAlv/bAGQAp//2AGQAqf/uAG4AEP/oAG4AEQAVAG4AHf/6AG4AHv/yAG4ARAALAG4ARf/4AG4ARv/nAG4AR//4AG4ASP/4AG4ASf/4AG4ASv/nAG4AS//4AG4ATP/4AG4ATf/wAG4ATv/4AG4AT//4AG4AUP/4AG4AUf/4AG4AUv/nAG4AU//4AG4AVP/nAG4AVf/4AG4AVv/sAG4AV/90AG4AWP/4AG4AWf/VAG4AWv/qAG4AXP+aAG4AbgALAG4Ab//nAG4Alv/nAG4Ap/+EAG4Aqf90AG4A7f/4AG4A7v/4AG8AD//jAG8AEf/oAG8AHf/lAG8AHv/pAG8ARP/rAG8ARv/gAG8ASv/4AG8ATf/YAG8AUv/vAG8AVP/tAG8AVv/0AG8AV//QAG8AXP/qAG8AXf/uAG8Abv/rAG8Ab//gAG8Alv/vAG8Ap//2AG8Aqf/2AJAACf/hAJAAD/+GAJAAEAAqAJAAEf+rAJAAJP/GAJAALf/TAJAANv/xAJAAN/+3AJAAOf/pAJAAO/+/AJAAPP+1AJAAPf/EAJAARP/OAJAATf/zAJAAVv/yAJAAV//OAJAAWgAUAJAAW//aAJAAXP/iAJAAXf/nAJAAY//GAJAAbv/OAJAAp//YAJAAqf/IAJYAD/+1AJYAEAA0AJYAEf+yAJYARP/oAJYATf/aAJYAVv/2AJYAV/+8AJYAWf/oAJYAWgAGAJYAW//RAJYAXP+/AJYAXf/PAJYAbv/oAJYAp//YAJYAqf/bAJkAQf/4AJkAYf/YAJkAnf/oAJkArf/gAJ0AH//gAJ0AIP/wAJ0AIf/oAJ0AYf/QAJ0Anf/oAJ0Arf/gAKYAF/+QAKYAGAAgAKYAGQAGAKYAHAArAKYAJP9zAKYAJf/wAKYAJv+4AKYAJ//wAKYAKP/oAKYAKf/wAKYAKv/IAKYAK//oAKYALP/gAKYALf8gAKYALv/oAKYAMP/oAKYAMf/YAKYAMv/IAKYAM//gAKYANP/QAKYANf/wAKYANv/wAKYANwAlAKYAOP/YAKYAOQAYAKYAOgAiAKYAO//sAKYAPQAYAKYARP94AKYARv/AAKYASv+4AKYATf8gAKYATv/wAKYAUf/wAKYAUv/HAKYAU//4AKYAVP/IAKYAVv/oAKYAVwAoAKYAWP/wAKYAWQAkAKYAWgAoAKYAWwAQAKYAXAASAKYAXQAQAKYAY/9zAKYAZP+4AKYAbv94AKYAb//AAKYAkP/IAKYAlv/HAKgAF/+QAKgAGAAgAKgAGQAGAKgAHAArAKgAJP9zAKgAJv/QAKgAKP/gAKgAKf/gAKgAKv/AAKgAK//gAKgALf9wAKgAMv/IAKgAM//wAKgANP+wAKgANf/oAKgANv/gAKgANwAdAKgAOP/gAKgAOQAoAKgAOgAiAKgAOwAUAKgARP+YAKgARv/YAKgASv/gAKgATf9QAKgAUv/HAKgAVP/YAKgAVv/oAKgAVwAwAKgAWP/wAKgAWQA0AKgAWgAwAKgAWwAgAKgAXAAqAKgAXQAoAKgAY/9zAKgAZP/QAKgAbv+YAKgAb//YAKgAkP/IAKgAlv/HAKkAJv/oAKkAKv/YAKkALf9oAKkANwA4AKkAOP/YAKkAOQAgAKkARv/AAKkASv/YAKkAS//oAKkATf+4AKkAUv+4AKkAVP/YAKkAVv/gAKkAVwAYAKkAWP/QAKkAZP/oAKkAb//AAKkAlv+4AK0AH//QAK0AIP/wAK0AIf/wAK0AQf/wAK0AYf/IAK0Anf/oAK0Arf/wAO0AD//oAO0AEf/zAO0ARP/4AO0ATf/gAO0AV//2AO0AWf/4AO0AXP/pAO0AXf/6AO0Abv/4AO4ADwA7AO4AEP+YAO4AEQBLAO4ARAAKAO4ARf/2AO4ARv/hAO4AR//2AO4ASP/2AO4ASf/2AO4ASv/hAO4AS//2AO4ATP/2AO4ATf/4AO4ATv/2AO4AT//kAO4AUP/2AO4AUf/2AO4AUv/ZAO4AU//2AO4AVP/VAO4AVf/2AO4AVv/gAO4AV/9LAO4AWP/QAO4AWf+EAO4AWv/AAO4AWwAQAO4AXP9MAO4AbgAKAO4Ab//hAO4Alv/ZAO4Ap/9BAO4Aqf9BAO4A7f/2AO4A7v/2AAAAAAAQAAAA/AkOBQADAwMDBwkKCAEEBAUEAwUDBQgDCAgHCAgHCAgDAwcHBwcHCQoJCggICgoDBwkHCwoKCQoJCAgJCAsICAgEBQQHBQUICAgIBwcICAMGCAcKCAkICQgHBwgHCQcHBwQHBAYJCQkICgoJCAgICAgICAcHBwcDAwMDCAkJCQkJCAgICAQFBwcIBQkOAwcEBQUNCgcIBQULCQcDBwUHBwcDCQkKDgwICQUFAgIHBwgHBAQEBAMFDgkICQgIAwMDAwoKCgkJCQUFBQUIBwUKCAgHCQgHBwIFBQoJDAcHCAcFBgUFBQQGBwUCBwUFBgQDCg0DBQUFBQUFAwAAAAoQBQADAwQDCAkLCQIEBAYEBAUEBQkECAkICQkICQkEBAgIBwcICQsKCwkJCwsECAoIDAsLCgsKCQkLCQwJCQkFBQQIBQUICQkJCAgJCQMHCAcLCQkICQkICAkICggICAQIBAcJCQoJCwsLCAgICAgICQgICAgDAwMDCQkJCQkJCQkJCQUFCAcJBQkQBAgEBQUOCwgJBgYMCQcECAYHBwgDCQkLDw0ICgUFAwMICAkIBQUFBQQGEAkJCQkJBAQEBAsLCwsLCwUFBQUJCAULCQkICggICAMGBgsKDQgHCQgFBwUFBgUHCAUDCAUFBgUDCw8DBQUFBQUFAwAAAAsRBgADAwQDCAoNCgIFBQYEBAYEBgoECQkJCgoICgoEBAkJCAgJCgwMDAoKDAwECQsJDgwMCgwLCgkMCg0KCgoFBgUJBgYJCgoKCQgKCgQICQgMCgoJCgoJCAoJCwkJCAUJBAgKCgwKDAwMCQkJCQkJCgkJCQkEBAQECgoKCgoKCgoKCgUGCQgKBgoRBAkEBgYPDAkKBgcNCggECQYICAkDCgoMEQ4JCwYGAwMJCQoJBQUFBQQHEQoKCgoKBAQEBAwMDAwMDAYGBgYKCQYMCgoJCgkJCQMGBgwMDwkICggGCAYGBgUICQYDCAYGBwUDDBAEBgYGBgYGAwAAAAwTBgAEBAQECQsOCwIFBQcFBAYEBwsFCgoKCwsJCwsEBAkJCQkKCw0NDQsKDQ0ECQwKDw0NCw0MCwoNCw4LCwsFBwUJBgYKCwsLCgkLCwQICgkNCwsKCwsKCQsKDAoKCQUJBQkLCw0LDQ0NCgoKCgoKCwoKCgoEBAQECwsLCwsLCwsLCwUGCQkLBgsTBQoFBgYRDQoLBwcPCwkECgcJCQkECwsNEhAKDAYGAwMKCgsKBgYGBgQHEwsLCwsLBAQEBA0NDQ0NDQYGBgYLCgYNCwsKCwoKCgMHBw0NEAoJCwkHCQcHBwYJCgcDCQcHBwYEDRIEBgYGBgYGBAAAAA0VBwAEBAUECgwPDAIGBgcFBQcFBwwFCwsLCwwKDAwFBQoKCgkLDA4ODgwLDg4FCgwLEA4ODA4NDAsODA8MDAwGBwYKBwcLDAwMCwoMDAQJCwkODAwLDAwLCgwLDgsLCgUKBQkMDA4MDg4OCwsLCwsLDAsLCwsEBAQEDAwMDAwMDAwMDAYHCgoMBwwVBQsFBwcSDgsMBwgQDAkFCgcJCQoEDAwOFBELDQcHBAQLCwwKBgYGBgUIFAwMDAwMBQUFBQ4ODg4ODgcHBwcMCwcODAwLDAsLCwMHBw4OEgsJDAoHCQcHBwYJCwcECgcHCAYEDhMEBwcHBwcHBAAAAA4WBwAEBAUECw0QDQIGBggFBQcFCA0FDAwLDA0LDQwFBQsLCgoMDQ8PDw0MDw8FCw0LEQ8PDQ8ODQwPDRENDQwGCAYLBwcMDQ0NCwsNDQUKDAoPDQ0MDQ0LCw0MDwsMCwYLBgoNDQ8NDw8PDAwMDAwMDQsLCwsFBQUFDQ0NDQ0NDQ0NDQYHCwoNBw0WBQwGBwcUDwwNCAkRDQoFCwgKCgsEDQ0PFRIMDgcHBAQMDA0LBgYHBwUIFg0NDQ0NBQUFBQ8PDw8PDwcHBwcNCwcPDQ0MDQwMDAQICA8PEwsKDAsICggICAcKDAgECwgICQcEDxUFBwcHBwcHBAAAAA8YCAAFBQUFCw4RDgIGBwkGBQgFCA4GDQ0MDQ4LDQ0FBQwMCwsMDhAQEA4NEBAFDA4MExAQDhAPDg0QDhIODg0HCAcMCAgNDg4ODAwODgULDQsQDg4NDg0MCw4MEAwMDAYMBgsODhAOEBAQDQ0NDQ0NDgwMDAwFBQUFDg4ODg4ODg4ODgcIDAsOCA4YBgwGCAgVEAwOCAkSDgsFDAgLCwwFDg4QFxQNDwgIBAQMDA4MBwcHBwUJGA4ODg4OBQUFBRAQEBAQEAgICAgODAgQDg4MDg0MDAQICRAQFAwLDQwICwgICAcLDAgEDAgICQcEEBYFCAgICAgIBQAAABAZCAAFBQYFDA8SDwIHBwkGBggGCQ8GDQ4NDg8MDg4GBgwMDAwNDxEREQ8OEREGDQ8NFBESDxIQDw4RDxMPDw4HCQcNCAgODw4PDQwPDwULDgwRDw8NDw4NDA8NEQ0NDAcNBgsPDxEPERIRDg4ODg4ODg0NDQ0FBQUFDw8PDw8PDw8PDwcJDQwOCQ8ZBg0HCAgWEg0PCQoTDwwGDQkMDA0FDw8SGRUOEAgIBAQNDQ8NBwcIBwYJGQ8PDw8PBgYGBhISEhEREQgICAgPDQgRDw8NDw0NDQQJCRERFg0MDgwJCwkJCQgLDQkEDAkJCggFEhgFCAgICAgIBQAAABEbCQAFBQYFDRATEAMHBwoHBgkGCRAHDg8ODxANDw8GBg0NDQwOEBISEhAPExIGDRAOFRITEBMREA4SEBQQEA8ICQgNCQkOEA8QDg0QEAYMDgwSEBAOEA8ODQ8OEg4ODQcNBwwQEBIQEhMSDg4ODg4ODw4ODg4GBgYGEBAQEBAQDw8PDwgJDQwPCRAbBg4HCQkYEw4QCQoVEAwGDgkMDA0FEBATGhYOEQkJBQUODhAOCAgICAYKGxAQEBAQBgYGBhMTExISEgkJCQkQDgkSEBAOEA4ODgQJChISFw4MDw0JDAkJCggMDgkFDQkJCggFExkGCQkJCQkJBQAAABIcCQAFBQYFDhEVEQMICAoHBgoGChEHDw8PEBAOEBAGBg4ODQ0PERMTExEQFBMHDhEPFhMUERQSEQ8TERURERAICggOCQkPEBARDw4REQYNDw0TEREPERAPDhAPEw8PDgcOBw0RERMRExQTDw8PDw8PEA8PDw8GBgYGEREREREREBAQEAgKDg0QChEcBw8HCQkZFA8RCgsWEQ0GDgoNDQ4FEREUHBgPEgkJBQUPDxEOCAgJCAcLHBERERERBwcHBxQUFBMTEwkJCQkRDwkTEREPEQ8PDwUKChMTGA8NEA4KDQoKCgkNDwoFDgoKCwkFFBsGCQkJCQkJBQAAABMeCgAGBgcGDhIWEgMICAsHBwoHChIHEBAPEREPEREHBw8PDg4QEhQUFBIRFRQHDxIQGBQVEhUTEhAUEhcREhEJCggPCgoQEREREA8SEgYNEA4UEhIQEhEPDhEQFBAQDwgPCA4SEhQSFBUUEBAQEBAQERAQEBAGBgYGEhISEhISEREREQkKDw4RChIeBxAICgobFRASCwwXEg4HDwsODg8GEhIVHRkQEwoKBQUQEBIPCQkJCQcLHhISEhISBwcHBxUVFRQUFAoKCgoSDwoUERIQEhAQEAULCxQUGhAOEQ8KDgoKCwkOEAoFDwoKDAkGFRwGCgoKCgoKBgAAABQgCgAGBgcGDxMXEwMJCQwIBwsHCxMIEREQEhIPEhIHBxAQDw8RExUVFRMRFhUHEBMQGRUWExYUExEVExgSEhIJCwkQCgoREhISEA8TEwcOEQ8VExMRExIQDxIRFRARDwgQCA4TExUTFRYVEREREREREhAQEBAHBwcHExMTExMTEhISEgkLEA8SCxMgCBEICgocFhETCwwYEw8HEAsODhAGExMWHxoRFAoKBgYRERIQCQkKCQcMHxMTExMTBwcHBxYWFhUVFQoKCgoTEAoVEhIRExEREQULCxUVGxAPEg8LDgsLCwoOEAsFDwsLDAoGFh4HCgoKCgoKBgAAABUhCwAGBgcGEBQYFAMJCQwIBwsHCxQIEhIRExMQExMHCBAQEA8RFBYWFhQSFxYIERQRGhYXFBcVFBIWExkTExMJCwkRCwsSExMTERAUEwcPEg8XExQSFBMREBMRFhEREAkQCQ8UFBYUFhcWEhISEhISExEREREHBwcHExQUFBQUExMTEwkLEQ8TCxQhCBEJCwsdFxEUDA0aFA8HEQwPDxAGFBQXIBwSFAsLBgYRERMRCgoKCggMIRQUFBQUCAgICBcXFxYWFgsLCwsUEQsWExMRFBIREQUMDBYWHBEPExAMDwwMDAoPEQwGEAwMDQoGFx8HCwsLCwsLBgAAABYjCwAHBwgHERUZFQMKCg0JCAwIDBUIEhMSExQRFBQICBEREBASFRcXFxUTGBcIERUSGxcYFRgWFRMXFBoUFBQKDAoRCwsTFBQUEhEVFAcPExAYFBUSFRQSERQSFxISEQkRCRAVFRcVFxgXExMTExMTFBISEhIHBwcHFBUVFRUVFBQUFAoMERAUDBUjCBIJCwsfGBIVDA0bFRAIEQwQEBEHFRUYIh0TFQsLBgYSEhQSCgoKCggNIxUVFRUVCAgICBgYGBcXFwsLCwsVEgsXFBQSFRISEgYMDBcXHhIQFBEMEAwMDAsQEgwGEQwMDQsGGCEHCwsLCwsLBwAAABckDAAHBwgHEhYaFgQKCg0JCAwIDBUJExQTFBUSFRQICBISERETFhgYGBYUGRgIEhYTHBgZFhkXFhQYFRsVFRQKDAoSDAwTFRUVExIWFQgQFBEZFRYTFhUTERUTGBMTEgkSCRAWFhgWGBkYExMTExMTFRMTExMICAgIFRYWFhYWFRUVFQoMEhEVDBYkCRMJDAwgGRMWDQ4cFhEIEg0RERIHFhYZIx4TFgwMBgYTExUSCwsLCwgOJBYWFhYWCAgICBkZGRgYGAwMDAwWEwwYFRUTFhMTEwYNDRgYHxMRFBINEA0NDQsQEw0GEg0NDgsHGSIIDAwMDAwMBwAAABgmDAAHBwkHEhcbFwQKCg4JCQ0JDRYJFBUTFRYSFRUJCRMTEhEUFxkZGhcVGhkJExcUHhoaFxoYFxQZFhwWFhULDQsTDAwUFhYWFBIXFggRFBEaFhcUFxUUEhYUGRQUEgoTChEXFxkXGhoZFBQUFBQUFhQUFBQICAgIFhcXFxcXFhYWFgsNExIWDRcmCRQKDAwiGhQXDQ8dFxEJEw0RERMHFxcaJSAUFwwMBwcUFBYTCwsLCwkOJhcXFxcXCQkJCRoaGhkZGQwMDAwXFAwaFhYUFxQUFAYNDhoZIBQRFRINEQ0NDQwRFA0HEg0NDwwHGiQIDAwMDAwMBwAAAAABAuEB9AAFAAYCvAKKAAAAjwK8AooAAAHFADIBAwAAAAAFAAAAAAAAAAAAAAMAAAAAAAAAAAAAAABJVEMgAEAAIPACA8T/FAAAA8QA7AAAAAEAAAAAAAAAAQAAgAAAAAEsAmcAAGAAAtQCdUJsYWlyTWRJVEMgVCAgICD/////N////kJMQVIwMAEAAAAAAAABAAAAAQAAapLHTl8PPPUAAAPoAAAAALBFL9YAAAAAsEUv1v8L/xQGAgPEAAAAAwACAAEAAAAAAAEAAAPE/xQAAAYv/wv/CwYCAAEAAAAAAAAAAAAAAAAAAAD3AAEAAAD3AEwABwA1AAQAAgAIAEAACgAAALQBPwACAAE=) format('truetype');font-weight:normal;font-style:normal;}
    body{font-family:Calibri,sans-serif;font-size:9pt;color:#1C2333;background:#525659;margin:0;padding:56px 20px 20px;}
    .page{background:white;width:8.5in;max-width:8.5in;margin:20px auto;padding:0.5in 0.6in;box-shadow:0 2px 12px rgba(0,0,0,.3);min-height:11in;box-sizing:border-box;}
    .cover{padding:0;border-bottom:none;margin-bottom:0;}
    .cover-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
    .firm-info{text-align:right;font-size:7.5pt;color:#333;line-height:1.6;}
    .firm-subtitle{font-size:8pt;color:#555;font-style:italic;margin-bottom:2px;}
    .rpt-title{font-family:'BlairMdITC TT',Calibri,sans-serif;font-size:15pt;font-weight:400;margin-top:4px;color:#1C2333;letter-spacing:0.5px;}
    .form-meta{font-size:7.5pt;color:#888;margin-top:2px;}
    .proj-tbl{width:100%;border-collapse:collapse;margin-top:14px;}
    .proj-tbl td{padding:4px 8px;font-size:8.5pt;border-bottom:1px solid #EEE;}
    .proj-tbl .lbl{font-weight:bold;color:#666;width:140px;background:#F5F5F5;}
    h2{font-size:11pt;font-weight:bold;background:#9C2742;color:white;padding:6px 12px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px;page-break-inside:avoid;page-break-after:avoid;}
    h3{font-size:9.5pt;font-weight:bold;border-left:3px solid #C0392B;padding-left:6px;margin:14px 0 6px;color:#7d1f35;page-break-inside:avoid;page-break-after:avoid;}
    table.cl{width:100%;border-collapse:collapse;}
    table.cl th{background:#7d1f35;color:white;padding:5px 8px;text-align:left;font-size:8.5pt;}
    table.cl td{vertical-align:top;border-bottom:1px solid #EEE;}
    table.cl tr{page-break-inside:avoid;}
    table.dt{width:100%;border-collapse:collapse;margin-bottom:12px;}
    table.dt th{background:#EEF1F5;color:#2C3E50;border-bottom:2px solid #2C3E50;padding:5px 8px;text-align:center;font-size:8pt;font-weight:700;}
    table.dt td{padding:5px 8px;text-align:center;border-bottom:1px solid #EEE;font-size:8.5pt;}
    .defic{border-left:3px solid #C0392B;padding:8px 10px;margin-bottom:8px;background:#FFF9F9;page-break-inside:avoid;}
    .defic-lbl{font-size:7.5pt;color:#C0392B;font-weight:bold;text-transform:uppercase;}
    .iat{color:#C0392B;font-weight:bold;}
    .running-header{display:none;}
    @media print{
      @page{margin:0;size:letter;}
      body{background:white!important;padding:0!important;}
      .page{box-shadow:none!important;margin:0!important;padding:0.5in 0.6in!important;width:auto!important;max-width:none!important;min-height:auto!important;page-break-after:always;}
      .page:last-child{page-break-after:auto;}
    }
    /* ════════ S366: FRT-matched cover + running header (frt/js/export/pdf.js) ════════ */
    .ph{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:10px;margin-bottom:0;}
    .ph img{height:34px;image-rendering:-webkit-optimize-contrast;}
    .ph-addr{text-align:left;font-family:Arial,sans-serif;font-size:6pt;color:#1C2333;line-height:1.26;border-left:2px solid #9C2742;padding-left:10px;}
    .title-block{text-align:center;margin:12px 0 0;padding:14px 0 12px;line-height:0.85;}
    .title-block .tb-line1{font-family:'BlairMdITC TT','Times New Roman',serif;font-size:12pt;font-weight:400;color:#1C2333;letter-spacing:1px;margin-bottom:1px;}
    .title-block .tb-line2{font-family:'BlairMdITC TT','Times New Roman',serif;font-size:12pt;font-weight:400;color:#1C2333;margin-bottom:10px;}
    .title-block .tb-line4{font-family:Calibri,sans-serif;font-size:12pt;font-weight:700;color:#333;line-height:1.23;margin-bottom:2px;}
    .pi-list{margin-top:4px;padding:10px 0;border-top:2px solid #1C2333;border-bottom:2px solid #1C2333;}
    .pi-row{display:flex;gap:10px;margin-bottom:3px;font-family:Calibri,sans-serif;font-size:11pt;line-height:1.23;}.pi-row:last-child{margin-bottom:0;}
    .pi-label{min-width:145px;font-weight:400;color:#1C2333;}.pi-value{font-weight:400;color:#1C2333;}
    .compact-header{display:none;align-items:flex-end;justify-content:space-between;font-size:11pt;line-height:1.15;color:#000;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:12px;}
    .compact-header .ch-compact-left{font-size:11pt;color:#000;line-height:1.15;text-align:left;}
    .compact-header .ch-compact-right{font-size:11pt;color:#000;line-height:1.15;text-align:right;white-space:nowrap;}
    .page-label{display:none;text-align:right;font-size:8pt;color:#888;margin-top:6px;}
    @media screen{
      .compact-header{display:flex;}
      .page-label{display:block;}
    }
    @media print{
      .compact-header{display:flex!important;}
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    /* ════════ S366 PDF REDESIGN — Bold report layer (demo classes, slate #2C3E50) ════════ */
    .sh{background:#2C3E50;color:#fff;padding:7px 14px;font-weight:700;font-size:11pt;border-radius:6px 6px 0 0;margin:20px 0 0;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid;page-break-after:avoid;letter-spacing:.3px;}
    .sh .sh-note{font-weight:400;font-size:8.5pt;opacity:.85;}
    .sb{border:1px solid #DDE1E7;border-top:none;border-radius:0 0 6px 6px;padding:12px 14px;margin-bottom:14px;page-break-inside:avoid;}
    .sb.flush{padding:0;}
    /* sub-grouping INSIDE a section: light tinted header, NOT another filled box */
    .subhd{font-size:9.5pt;font-weight:700;color:#2C3E50;border-bottom:1.5px solid #2C3E50;padding:0 0 4px;margin:16px 0 8px;letter-spacing:.2px;}
    .subhd.lite{color:#54657A;border-bottom-color:#C3CAD4;font-size:9pt;margin-top:14px;}
    .sh3{font-size:9.5pt;font-weight:700;border-left:3px solid #2C3E50;padding-left:8px;margin:0 0 8px;color:#2C3E50;page-break-inside:avoid;page-break-after:avoid;}
    table.st{width:100%;border-collapse:collapse;}
    /* table column header is LIGHTER than the section band so the two don't blend */
    table.st th{background:#EEF1F5;color:#2C3E50;padding:5px 8px;text-align:left;font-size:8.5pt;font-weight:700;border-bottom:2px solid #2C3E50;}
    table.st th.ctr{text-align:center;}
    table.st td{vertical-align:top;border-bottom:1px solid #EEE;padding:5px 8px;font-size:9pt;}
    table.st td.ctr{text-align:center;}
    table.st tr{page-break-inside:avoid;}
    table.st .grp td{background:#F1EEE8;font-weight:700;color:#2C3E50;font-size:9.5pt;text-transform:uppercase;letter-spacing:.4px;}
    .pill{display:inline-block;font-size:8.5pt;font-weight:800;padding:2px 10px;border-radius:10px;border:1px solid;white-space:nowrap;}
    .pill.yes{background:#E7F0EA;color:#3E6B4F;border-color:#BcD3C2;}
    .pill.no{background:#F5E3E3;color:#A23A3A;border-color:#E0BcBc;}
    .pill.na{background:#ECEEF1;color:#5A6473;border-color:#CDD2DA;}
    .no-detail td{background:#FBF6F0;border-bottom:1px solid #EADfcf;}
    .nd-wrap{display:flex;gap:12px;align-items:flex-start;padding:2px 0 6px;}
    .nd-note{flex:1;font-size:8.5pt;line-height:1.45;}
    .nd-tag{display:inline-block;font-size:7.5pt;font-weight:800;color:#A23A3A;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;}
    .nd-photos{display:flex;flex-wrap:wrap;gap:6px;}
    .res-banner{margin:24px 0;padding:20px;border:3px solid;border-radius:10px;text-align:center;page-break-inside:avoid;}
    .res-banner .rb-label{font-size:22pt;font-weight:900;letter-spacing:3px;}
    .res-banner .rb-desc{font-size:9pt;margin-top:6px;color:#555;}
    .def-card{border:1px solid #DDE1E7;border-radius:6px;margin-bottom:10px;overflow:hidden;page-break-inside:avoid;}
    .def-head{background:#2C3E50;color:#fff;padding:6px 12px;font-weight:700;font-size:9pt;}
    .def-body{padding:9px 12px;}
    .def-title{font-size:9pt;font-weight:700;margin-bottom:2px;}
    .def-meta{font-size:8pt;color:#6B7B8C;}
    .resp-card{margin-top:8px;padding:8px;border-radius:5px;border:1px solid;border-left:3px solid;page-break-inside:avoid;}
    .resp-lbl{font-size:7.5pt;font-weight:800;margin-bottom:4px;}
    .curve-panel{border:1px solid #DDE1E7;border-radius:6px;padding:12px;margin-top:14px;text-align:center;page-break-inside:avoid;}
    .curve-tag{display:inline-block;font-size:9pt;font-weight:800;text-transform:uppercase;letter-spacing:.4px;padding:4px 12px;border-radius:5px;background:#2C3E50;color:#fff;margin-bottom:8px;}
    .cert-box{font-size:9.5pt;color:#5A6473;line-height:1.5;margin-bottom:14px;padding:11px 13px;background:#F7F8FA;border-radius:6px;border-left:3px solid #2C3E50;}
  </style></head><body>
  <div class="page">
  <div class="cover">
    <div class="ph">
      <div>
        <img src="${window.ARENCON_LOGO_B64||''}" alt="ARENCON Inc.">
      </div>
      <div class="ph-addr">1551 CATERPILLAR ROAD, SUITE 206<br>MISSISSAUGA, ON &nbsp;&nbsp; L4X 2Z6<br>CANADA<br><br>P: 905 615 1774<br>F: 905 615 9351<br>E: ${'mail'+'@'+'arencon.com'}</div>
    </div>
    <div class="title-block">
      <div class="tb-line1">Fire Protection Engineering</div>
      <div class="tb-line2">Diesel Fire Pump Commissioning Report #${_pdfInstNum}</div>
      <div class="tb-line4">${(proj.client||'—').replace(/</g,'&lt;')}${proj.addr?' - '+(proj.addr).replace(/</g,'&lt;'):''}</div>
      ${proj.projname?`<div class="tb-line4">${(proj.projname).replace(/</g,'&lt;')}</div>`:''}
    </div>
    <div class="pi-list">
      <div class="pi-row"><span class="pi-label">Date of Issue:</span><span class="pi-value">${new Date().toLocaleDateString('en-CA')}</span></div>
      <div class="pi-row"><span class="pi-label">Date of Test:</span><span class="pi-value">${proj.date||'—'}</span></div>
      <div class="pi-row"><span class="pi-label">Distribution:</span><span class="pi-value">${((distribution&&distribution.length)?distribution.join(', '):(proj.contractor||'—')).replace(/</g,'&lt;')}</span></div>
      <div class="pi-row"><span class="pi-label">Prepared By:</span><span class="pi-value">${(proj.prepby||'—').replace(/</g,'&lt;')}</span></div>
      <div class="pi-row"><span class="pi-label">Project No.:</span><span class="pi-value">${proj.projno||'—'}</span></div>
    </div>
    ${_ovHtml}
  </div>

  <div class="sh">1. Prior to Commissioning Date</div>
  <div class="sb flush"><table class="st"><thead><tr><th class="ctr" style="width:34px">#</th><th>Item</th><th class="ctr" style="width:90px">Status</th></tr></thead>
  <tbody>${clSection(S1,'s1')}</tbody></table></div>

  <div class="sh">2. Visual Inspection</div>
  <div class="sb flush"><table class="st"><thead><tr><th class="ctr" style="width:34px">#</th><th>Item</th><th class="ctr" style="width:90px">Status</th></tr></thead>
  <tbody>${clSection(S2,'s2')}</tbody></table></div>

  <div class="sh">3. Pump / Controller / Louver Tests</div>
  <div class="sb"><div class="sh3">Battery Start-Up Time Test</div>
  <table class="dt"><thead><tr><th>Battery #1 Test</th><th>Duration (s)</th><th>Battery #2 Test</th><th>Duration (s)</th></tr></thead>
  <tbody>${BAT_TESTS.map((t,i)=>`<tr><td class="left" style="text-align:left">${t}</td><td>${batData.b1[i].toFixed(2)}</td><td style="text-align:left">${t}</td><td>${batData.b2[i].toFixed(2)}</td></tr>`).join('')}
  <tr style="background:#EFF2F7;font-weight:700;"><td colspan="2">Battery #1 Subtotal: ${b1tot.toFixed(2)} s</td><td colspan="2">Battery #2 Subtotal: ${b2tot.toFixed(2)} s</td></tr>
  <tr style="background:${cumTot<=45?'#E8EFE7':'#F3E0DE'};font-weight:700;"><td colspan="4">Combined Total: ${cumTot.toFixed(2)} s — ${cumTot<=45?'✓ PASS (≤ 45s)':'✗ FAIL (> 45s) — Engine to run 5 min at full speed'}</td></tr>
  </tbody></table>
  <table class="st" style="margin-top:10px;"><thead><tr><th class="ctr" style="width:34px">#</th><th>Item</th><th class="ctr" style="width:90px">Status</th></tr></thead>
  <tbody>${clSection(S3,'s3')}</tbody></table></div>

  <div class="sh">4. Fire Pump Test Results</div>
  <div class="sb">
  ${(function(){
    var testType = 'std';
    var _ri = document.querySelector('input[name="pump-test-type"]:checked');
    if(_ri) { testType = _ri.value; }
    else { document.querySelectorAll('.pump-type-btns button').forEach(function(b){ if(b.classList.contains('on')) testType=b.dataset.ptype; }); }
    var gv=function(id){return (document.getElementById(id)||{}).value||'—';};
    var _isPld = (testType==='pld');
    var _np = _isPld
      ? {flow:'pm-rated-flow-pld',press:'pm-prv-pld',rpm:'pm-rpm-pld',relief:'pm-relief-pld',reducing:'pm-reducing-pld',pld:'pm-pld-setting',npsh:'npsh-psi-pld'}
      : {flow:'pm-rated-flow',press:'pm-prv',rpm:'pm-rpm',relief:'pm-relief',reducing:'pm-reducing',npsh:'npsh-psi'};
    var out='';
    out+='<table class="dt" style="max-width:400px;"><thead><tr><th class="left" style="text-align:left">Parameter</th><th>Value</th></tr></thead><tbody>';
    out+='<tr><td style="text-align:left">Rated Flow (gpm)</td><td>'+gv(_np.flow)+'</td></tr>';
    out+='<tr><td style="text-align:left">Rated Press. (psi)</td><td>'+gv(_np.press)+'</td></tr>';
    out+='<tr><td style="text-align:left">Pump Rated Speed (RPM)</td><td>'+gv(_np.rpm)+'</td></tr>';
    out+='<tr><td style="text-align:left">Pressure Relief Valve (psi)</td><td>'+gv(_np.relief)+'</td></tr>';
    out+='<tr><td style="text-align:left">Pressure Reducing Valve (psi)</td><td>'+gv(_np.reducing)+'</td></tr>';
    if(_isPld) out+='<tr><td style="text-align:left">PLD Setting (psi)</td><td>'+gv(_np.pld)+'</td></tr>';
    out+='<tr><td style="text-align:left">NPSH (psi)</td><td>'+gv(_np.npsh)+'</td></tr>';
    out+='<tr><td style="text-align:left">Equipment Used</td><td>'+(function(){var sel='input[name=equip3a]:checked';if(testType==='pld')sel='input[name=equip4b]:checked';var r=[];document.querySelectorAll(sel).forEach(function(c){var t=c.parentElement.textContent.trim();if(r.indexOf(t)<0)r.push(t)});return r.length?r.join(', '):'—'})()+'</td></tr>';
    out+='<tr><td style="text-align:left">Total Test Flow (US gpm)</td><td>'+(document.getElementById('pitot-total-3a')?.textContent||document.getElementById('pitot-total-4b')?.textContent||'—')+'</td></tr>';
    out+='</tbody></table>';
    // S317: Pressure Settings (jockey/fire pump cut-in/out) — per test type
    (function(){
      var sfx = _isPld ? '-pld' : '';
      function pv(id){ var el=document.getElementById(id+sfx); return (el&&el.value)?el.value:'\u2014'; }
      out+='<table class="dt" style="max-width:400px;margin-top:12px;"><thead><tr><th class="left" style="text-align:left">Pressure Settings</th><th>Designed (psi)</th><th>Field Setting (psi)</th></tr></thead><tbody>';
      [['Jockey Pump Cut-in','jci'],['Jockey Pump Cut-out','jco'],['Fire Pump Cut-in','fci'],['Fire Pump Cut-out','fco']].forEach(function(r){
        out+='<tr><td style="text-align:left">'+r[0]+'</td><td>'+pv('ps-'+r[1]+'-d')+'</td><td>'+pv('ps-'+r[1]+'-f')+'</td></tr>';
      });
      out+='</tbody></table>';
    })();
    // S320: Pump Nameplate Data — only rows that are filled; omitted entirely if empty
    (function(){
      var sfx = _isPld ? '-pld' : '';
      var rows=[['Manufacturer','np-mfr'],['Model No.','np-model'],['Pump Serial No.','np-serial'],['Size','np-size'],['No. of Stages','np-stages'],['Impeller Dia. (in)','np-impeller'],['BHP @ Rated','np-bhp'],['Max BHP','np-maxbhp'],['Driver MFG','np-drvmfg'],['Driver Serial No.','np-drvsn'],['Controller MFG','np-ctlmfg'],['Controller Serial No.','np-ctlsn']];
      var body='';
      rows.forEach(function(r){
        var el=document.getElementById(r[1]+sfx);
        var v=(el&&el.value)?(''+el.value).replace(/</g,'&lt;'):'';
        if(v) body+='<tr><td style="text-align:left">'+r[0]+'</td><td>'+v+'</td></tr>';
      });
      if(body) out+='<table class="dt" style="max-width:400px;margin-top:12px;"><thead><tr><th class="left" style="text-align:left">Pump Nameplate Data</th><th>Value</th></tr></thead><tbody>'+body+'</tbody></table>';
    })();

    // Standard 3-Point table (only if std)
    if(testType==='std'){
      out+='<div class="subhd">Standard Fire Pump Performance (w/o PLD) — 3-Point Test</div>';
      out+='<table class="dt"><thead><tr><th>Flow %</th><th>Flow (gpm)</th><th>Cutsheet (psi)</th><th>Placard (psi)</th><th>Suction (psi)</th><th>Discharge (psi)</th><th>Net (psi)</th><th>RPM</th><th>Result</th></tr></thead><tbody>';
      stdData.forEach(function(r){var c=_calcFlowPoint(r),net=c.net,pf=c.verdict==='na'?'—':(c.verdict==='pass'?'PASS':'FAIL');out+='<tr><td>'+r.pct+'</td><td>'+(r.flow||'—')+'</td><td>'+(r.cutsheet||'—')+'</td><td>'+(r.placard||'—')+'</td><td>'+(r.suction||'—')+'</td><td>'+(r.discharge||'—')+'</td><td>'+(net!=null?net.toFixed(1):'—')+'</td><td>'+(r.rpm||'—')+'</td><td style="font-weight:700;color:'+(pf==='PASS'?'#5F8068':pf==='FAIL'?'#A85959':'#999')+'">'+pf+'</td></tr>';});
      out+='</tbody></table>';
      // Water Supply & Demand — 3-Point
      out+='<div class="subhd lite">Water Supply &amp; Demand Data (3-Point)</div>';
      out+='<table class="dt" style="max-width:500px;"><thead><tr><th style="text-align:left">Point</th><th>Flow (US gpm)</th><th>Pressure (psi)</th></tr></thead><tbody>';
      out+='<tr><td style="text-align:left">Static</td><td>'+gv('ws-static-flow')+'</td><td>'+gv('ws-static-psi')+'</td></tr>';
      out+='<tr><td style="text-align:left">Residual</td><td>'+gv('ws-res-flow')+'</td><td>'+gv('ws-res-psi')+'</td></tr>';
      out+='</tbody></table>';
      out+='<table class="dt" style="max-width:500px;margin-top:8px;"><thead><tr><th style="text-align:left">Component</th><th>Flow (US gpm)</th><th>Pressure (psi)</th></tr></thead><tbody>';
      out+='<tr><td style="text-align:left">Sprinkler System Demand (SD) + Inside Hose</td><td>'+gv('dem-spr-flow')+'</td><td>'+gv('dem-spr-psi')+'</td></tr>';
      out+='<tr><td style="text-align:left">Outside Hose Allowance (OHL)</td><td>'+gv('dem-hose-flow')+'</td><td>—</td></tr>';
      var totalDemF=(parseFloat(gv('dem-spr-flow'))||0)+(parseFloat(gv('dem-hose-flow'))||0);
      out+='<tr style="font-weight:700;"><td style="text-align:left">Total System Demand</td><td>'+totalDemF.toLocaleString()+' gpm</td><td>'+gv('dem-spr-psi')+' psi</td></tr>';
      out+='</tbody></table>';
      // Chart
      if(chartImgA) out+='<div style="margin-top:14px;text-align:center;"><div style="font-size:9pt;font-weight:700;color:#2C3E50;margin-bottom:4px;">3-Point Fire Pump Performance Curve (w/o PRV &amp; PLD)</div><img src="'+chartImgA+'" style="width:100%;max-width:850px;border:1px solid #DDD;border-radius:6px;display:block;margin:0 auto;">'+_buildReadoutStripHtml3pt()+_safetyMarginPdf('')+'</div>';
      if(chartImgD) out+='<div style="margin-top:14px;text-align:center;"><div style="font-size:9pt;font-weight:700;color:#2C3E50;margin-bottom:4px;">3-Point Fire Pump Net Pressure Curve</div><img src="'+chartImgD+'" style="width:100%;max-width:850px;border:1px solid #DDD;border-radius:6px;display:block;margin:0 auto;"></div>';
    }

    // PLD 7-Point table (only if pld)
    if(testType==='pld'){
      out+='<div class="subhd">7-Point Performance Test — Fire Pump with PLD</div>';
      out+='<table class="dt"><thead><tr><th>Flow %</th><th>Flow (gpm)</th><th>Cutsheet (psi)</th><th>Placard (psi)</th><th colspan="2">w/o PRV &amp; PLD</th><th>RPM</th><th colspan="2">w/ PLD Enabled</th><th>RPM</th><th>Pass/Fail</th></tr><tr><th></th><th></th><th></th><th></th><th>Suction</th><th>Discharge</th><th></th><th>Suction</th><th>Discharge</th><th></th><th></th></tr></thead><tbody>';
      (typeof pldData!=='undefined'?pldData:[]).forEach(function(r,ri){var skip=(typeof PLD_NO_SKIP!=='undefined'&&PLD_NO_SKIP.has(ri));var c=updatePldVerdictObj?updatePldVerdictObj(r,ri):null;var pf=c?(c.verdict==='na'?'—':(c.verdict==='pass'?'PASS':'FAIL')):'—';out+='<tr><td>'+r.pct+'</td><td>'+(r.flow||'—')+'</td><td>'+(r.cutsheet||'—')+'</td><td>'+(r.placard||'—')+'</td><td>'+(skip?'—':(r.suc_no||'—'))+'</td><td>'+(skip?'—':(r.dis_no||'—'))+'</td><td>'+(skip?'—':(r.rpm_no||'—'))+'</td><td>'+(r.suc_w||'—')+'</td><td>'+(r.dis_w||'—')+'</td><td>'+(r.rpm_w||'—')+'</td><td style="font-weight:700;color:'+(pf==='PASS'?'#5F8068':pf==='FAIL'?'#A85959':'#999')+'">'+pf+'</td></tr>';});
      out+='</tbody></table>';
      // Water Supply & Demand — PLD
      out+='<div class="subhd lite">Water Supply &amp; Demand Data (7-Point PLD)</div>';
      out+='<table class="dt" style="max-width:500px;"><thead><tr><th style="text-align:left">Point</th><th>Flow (US gpm)</th><th>Pressure (psi)</th></tr></thead><tbody>';
      out+='<tr><td style="text-align:left">Static</td><td>'+gv('pld-ws-static-flow')+'</td><td>'+gv('pld-ws-static-psi')+'</td></tr>';
      out+='<tr><td style="text-align:left">Residual</td><td>'+gv('pld-ws-res-flow')+'</td><td>'+gv('pld-ws-res-psi')+'</td></tr>';
      out+='</tbody></table>';
      out+='<table class="dt" style="max-width:500px;margin-top:8px;"><thead><tr><th style="text-align:left">Component</th><th>Flow (US gpm)</th><th>Pressure (psi)</th></tr></thead><tbody>';
      out+='<tr><td style="text-align:left">Sprinkler System Demand (SD) + Inside Hose</td><td>'+gv('pld-dem-spr-flow')+'</td><td>'+gv('pld-dem-spr-psi')+'</td></tr>';
      out+='<tr><td style="text-align:left">Outside Hose Allowance (OHL)</td><td>'+gv('pld-dem-hose-flow')+'</td><td>—</td></tr>';
      var totalDemPld=(parseFloat(gv('pld-dem-spr-flow'))||0)+(parseFloat(gv('pld-dem-hose-flow'))||0);
      out+='<tr style="font-weight:700;"><td style="text-align:left">Total System Demand</td><td>'+totalDemPld.toLocaleString()+' gpm</td><td>'+gv('pld-dem-spr-psi')+' psi</td></tr>';
      out+='</tbody></table>';
      // Charts
      if(chartImgB) out+='<div style="margin-top:14px;text-align:center;"><div style="font-size:9pt;font-weight:700;color:#2C3E50;margin-bottom:4px;">7-Point Fire Pump Discharge Pressure, Water Supply &amp; System Demand Curve</div><img src="'+chartImgB+'" style="width:100%;max-width:850px;border:1px solid #DDD;border-radius:6px;display:block;margin:0 auto;">'+_safetyMarginPdf('pld-','pldChart')+'</div>';
      if(chartImgC) out+='<div style="margin-top:14px;text-align:center;"><div style="font-size:9pt;font-weight:700;color:#2C3E50;margin-bottom:4px;">7-Point Fire Pump Net Pressure Curve</div><img src="'+chartImgC+'" style="width:100%;max-width:850px;border:1px solid #DDD;border-radius:6px;display:block;margin:0 auto;"></div>';
    }
    return out;
  })()}
  <table class="st" style="margin-top:14px;"><thead><tr><th class="ctr" style="width:34px">#</th><th>Item</th><th class="ctr" style="width:90px">Status</th></tr></thead>
  <tbody>${clSection(S4_items,'s4')}</tbody></table>
  </div>

  <div class="sh">5. Fire Alarm &amp; Controller Signaling Tests</div>
  <div class="sb flush"><table class="st"><thead><tr><th class="ctr" style="width:34px">#</th><th>Item</th><th class="ctr" style="width:90px">Status</th></tr></thead>
  <tbody>${clSection(S5_mandatory,'s5m')}${clSection(S5,'s5')}</tbody></table></div>

  <div class="sh">Deficiency Summary</div>
  <div class="sb defic-summary-sb">
  ${(()=>{
    const allItems = contractors.flatMap(n => (deficiencies[n]||[]).map(d => ({...d, _name:n})));
    if (allItems.length === 0) return '<div style="background:#E8EFE7;border:1px solid #5F8068;padding:10px;border-radius:4px;color:#5F8068;font-weight:bold;">No deficiencies recorded.</div>';
    return contractors.map(n => {
      const items = deficiencies[n]||[];
      if (!items.length) return '';
      let out = '<div style="margin-bottom:18px;"><div style="background:#2C3E50;color:white;padding:6px 12px;font-weight:700;font-size:9pt;border-radius:4px 4px 0 0;">' + n + '</div>';
      items.forEach((d,i) => {
        const sc = d.status||'open', scCol = sc==='resolved'?'#5F8068':sc==='in-progress'?'#E67E22':'#A85959';
        out += '<div class="defic" style="border-top:1px solid #eee;">';
        var iarLabel = d.iarStatus ? '<span class="iat">IMMEDIATE ACTION REQUIRED</span> ' : '';
        out += '<div class="defic-lbl">#'+(i+1)+' '+iarLabel+' <span style="color:'+scCol+'">'+sc.toUpperCase()+'</span></div>';
        out += '<div style="font-size:9pt;margin-top:3px;font-weight:600;">'+(d.description||'(No description)')+'</div>';
        out += '<div style="font-size:8pt;color:#555;margin-top:2px;">Date: '+(d.date||'---')+'</div>';
        if (d.photos && d.photos.length) {
          out += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">';
          d.photos.forEach(p => { out += '<img src="'+_phSrc(p)+'" style="width:100%;max-width:250px;height:auto;object-fit:contain;border:1px solid #DDD;border-radius:3px;">'; });
          out += '</div>';
        }
        // Unified responses timeline
        var resps = d.responses || [];
        if (resps.length > 0) {
          resps.forEach(function(cr, ci) {
            var party = cr.party || 'contractor';
            var isC = party === 'contractor';
            var acCol = isC ? '#E67E22' : '#1565C0';
            var bgC = isC ? '#FFF8F0' : '#f0f4ff';
            var bdC = isC ? '#E8D060' : '#b0c4de';
            var lbl = isC ? 'CONTRACTOR' : 'CONSULTANT';
            out += '<div style="margin-top:8px;padding:8px;background:'+bgC+';border:1px solid '+bdC+';border-left:3px solid '+acCol+';border-radius:4px;page-break-inside:avoid;">';
            out += '<div style="font-size:7.5pt;font-weight:700;color:'+acCol+';margin-bottom:5px;">'+lbl+' RESPONSE #'+(ci+1)+'</div>';
            if(cr.date) out += '<div style="font-size:7pt;color:#888;margin-bottom:3px;">Date: '+cr.date+' | Status: '+(cr.status||'open').toUpperCase()+'</div>';
            out += '<div style="font-size:8.5pt;padding:5px;background:white;border:1px solid #EEE;border-radius:3px;">'+(cr.comment||'(No comment)')+'</div>';
            if (cr.photos && cr.photos.length) {
              out += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">';
              cr.photos.forEach(function(p){ out += '<img src="'+(_phSrc(p)||p)+'" style="width:100%;max-width:220px;height:auto;object-fit:contain;border:1px solid #DDD;border-radius:3px;">'; });
              out += '</div>';
            }
            out += '</div>';
          });
        }
        out += '</div>';
      });
      out += '</div>';
      return out;
    }).join('');
  })()}
  </div>
  ${(()=>{
    // S509: the printed verdict and the on-screen banner now come from the SAME
    // function (_dslVerdict). Before this they were two separate ladders with
    // different branches, so the sealed report could state a different result — and a
    // different reason — from the one the inspector saw on screen. The wording no
    // longer names "cutsheet criteria" or "IAR deficiencies": neither rule exists.
    var v = (typeof _dslVerdict==='function') ? _dslVerdict() : null;
    if(!v || v.status==='none') v = {status:'review',label:'NOT CONFIRMED',
      desc:'The overall result could not be determined from the recorded data.'};
    var col = v.status==='pass' ? '#5F8068' : v.status==='cond' ? '#D08B3C'
            : v.status==='fail' ? '#A85959' : '#78909C';
    var bg  = v.status==='pass' ? '#F0FFF4' : v.status==='cond' ? '#FFF8F0'
            : v.status==='fail' ? '#FFF5F5' : '#F4F6F7';
    return '<div class="nosplit keep-prev" style="margin:24px 0;padding:20px;border:3px solid '+col+';border-radius:8px;background:'+bg+';text-align:center;page-break-inside:avoid;">'
      +'<div style="font-size:22pt;font-weight:900;color:'+col+';letter-spacing:3px;">'+v.label+'</div>'
      +'<div style="font-size:9pt;margin-top:6px;color:#555;">'+v.desc+'</div>'
      +'</div>';
  })()}
  <div class="sh">Signature</div>
  <div class="sb">
  <div style="padding:12px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;">
    <div style="font-size:9pt;font-weight:700;color:#2C3E50;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Consultant Signature</div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:8px;table-layout:fixed;">
      <colgroup><col style="width:15%"><col style="width:35%"><col style="width:15%"><col style="width:35%"></colgroup>
      <tr><td style="font-weight:bold;color:#666;padding:3px 6px;">Consultant Name</td><td id="so-name-pdf"></td><td style="font-weight:bold;color:#666;padding:3px 6px;">Title</td><td id="so-title-pdf"></td></tr>
      <tr><td style="font-weight:bold;color:#666;padding:3px 6px;">Company</td><td id="so-company-pdf"></td><td style="font-weight:bold;color:#666;padding:3px 6px;">Date</td><td id="so-date-pdf"></td></tr>
    </table>
    <div id="sig-print-1"></div>
  </div>
  <div id="contractor-sigs-print"></div>
  <div id="witness-sigs-print"></div>
  <!-- photos are rendered inline at each checklist item -->
  </div>
  ${typeof _appendixHTML==='function' ? _appendixHTML() : ''}
  <div id="flow-test-photos-print"></div>
  <div id="sketches-print"></div>
  </div><!-- end .page -->
  
  <!-- Mobile page navigation -->
  <div id="mobile-page-nav" style="display:none;position:fixed;bottom:0;left:0;right:0;z-index:100;background:#2C3E50;border-top:3px solid #9C2742;padding:16px;box-shadow:0 -4px 12px rgba(0,0,0,.15);">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <button id="nav-prev" onclick="navPage(-1)" style="padding:12px 24px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:rgba(255,255,255,.08);color:white;font-size:16px;font-weight:600;cursor:pointer;transition:all .2s;font-family:Calibri,sans-serif;">◀ Prev</button>
      <span id="nav-label" style="font-size:13px;font-weight:600;color:#555;"></span>
      <button id="nav-next" onclick="navPage(1)" style="padding:12px 24px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:rgba(255,255,255,.08);color:white;font-size:16px;font-weight:600;cursor:pointer;transition:all .2s;font-family:Calibri,sans-serif;">Next ▶</button>
    </div>
  </div>
</body></html>`;

  const w = window.open('','_blank');
  if(!w||w.closed){showToast('Popup blocked — allow popups and try again');return;}
  w.document.write(html); w.document.close();
  // Fill in sign-off and signature fields after DOM is ready
  setTimeout(() => {
    try {
      const wd = w.document;
      const setT = (id, val) => { const el = wd.getElementById(id); if(el) el.textContent = val; };
      setT('so-name-pdf', document.getElementById('so-name')?.value||'—');
      setT('so-company-pdf', document.getElementById('so-company')?.value||'—');
      setT('so-title-pdf', document.getElementById('so-title')?.value||'—');
      setT('so-date-pdf', document.getElementById('so-date')?.value||'—');
      // Inspector signature
      const sigEl = wd.getElementById('sig-print-1');
      if (sigEl) {
        const canvas = document.getElementById('sig-canvas');
        const upload = document.getElementById('sig-upload-img-1');
        const src = (upload && upload.src && upload.style.display!=='none') ? upload.src : _sigPrintSrc(canvas ? canvas.id : '');
        if (src) sigEl.innerHTML = '<div style="font-size:8pt;color:#666;margin-bottom:3px;">Consultant Signature:</div><img src="'+src+'" style="height:55px;border-bottom:1.5px solid #333;display:block;">';
        else sigEl.innerHTML = '<div style="height:50px;border-bottom:1.5px solid #333;width:280px;margin-top:10px;"></div>';
      }
      // Contractor signatory rows
      const csPrint = wd.getElementById('contractor-sigs-print');
      if (csPrint) {
        let csHtml = '';
        contractorSignRows.forEach((row, i) => {
          const idx = i + 2;
          const canvas = document.getElementById('sig-canvas-c-' + idx);
          const upload = document.getElementById('sig-upload-img-' + idx);
          const src = (upload && upload.src && upload.style.display!=='none') ? upload.src : _sigPrintSrc(canvas ? canvas.id : '');
          csHtml += '<div style="padding:10px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;">'
            + '<div style="font-size:9pt;font-weight:700;color:#2C4770;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Contractor Signature</div>'
            + '<table style="width:100%;font-size:8.5pt;border-collapse:collapse;table-layout:fixed;"><colgroup><col style="width:15%"><col style="width:35%"><col style="width:15%"><col style="width:35%"></colgroup>'
            + '<tr><td style="font-weight:bold;color:#666;padding:3px 6px;">Name</td><td>'+(row.name||'—')+'</td>'
            + '<td style="font-weight:bold;color:#666;padding:3px 6px;">Title</td><td>'+(row.title||'—')+'</td></tr>'
            + '<tr><td style="font-weight:bold;color:#666;padding:3px 6px;">Company</td><td>'+(row.company||'—')+'</td>'
            + '<td style="font-weight:bold;color:#666;padding:3px 6px;">Date</td><td>'+(row.date||'—')+'</td></tr>'
            + '</table>'
            + (src ? '<div style="margin-top:6px;"><div style="font-size:8pt;color:#666;margin-bottom:2px;">Signature:</div><img src="'+src+'" style="height:45px;border-bottom:1.5px solid #333;display:block;"></div>'
                   : '<div style="height:40px;border-bottom:1.5px solid #333;width:240px;margin-top:8px;"></div>')
            + '</div>';
        });
        csPrint.innerHTML = csHtml;
      }
      // Witness signatory rows
      const wsPrint = wd.getElementById('witness-sigs-print');
      if (wsPrint) {
        let wsHtml = '';
        if (witnessSignRows.length > 0) {
          witnessSignRows.forEach((row, i) => {
            const idx = i + 100;
            const canvas = document.getElementById('sig-canvas-c-' + idx);
            const upload = document.getElementById('sig-upload-img-' + idx);
            const src = (upload && upload.src && upload.style.display!=='none') ? upload.src : _sigPrintSrc(canvas ? canvas.id : '');
            wsHtml += '<div style="padding:10px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;">'
              + '<div style="font-size:9pt;font-weight:700;color:#2C4770;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Witness Signature</div>'
              + '<table style="width:100%;font-size:8.5pt;border-collapse:collapse;table-layout:fixed;"><colgroup><col style="width:15%"><col style="width:35%"><col style="width:15%"><col style="width:35%"></colgroup>'
              + '<tr><td style="font-weight:bold;color:#666;padding:3px 6px;">Name</td><td>'+(row.name||'—')+'</td>'
              + '<td style="font-weight:bold;color:#666;padding:3px 6px;">Title</td><td>'+(row.title||'—')+'</td></tr>'
              + '<tr><td style="font-weight:bold;color:#666;padding:3px 6px;">Company</td><td>'+(row.company||'—')+'</td>'
              + '<td style="font-weight:bold;color:#666;padding:3px 6px;">Date</td><td>'+(row.date||'—')+'</td></tr>'
              + '</table>'
              + (src ? '<div style="margin-top:6px;"><div style="font-size:8pt;color:#666;margin-bottom:2px;">Signature:</div><img src="'+src+'" style="height:45px;border-bottom:1.5px solid #333;display:block;"></div>'
                     : '<div style="height:40px;border-bottom:1.5px solid #333;width:240px;margin-top:8px;"></div>')
              + '</div>';
          });
        }
        wsPrint.innerHTML = wsHtml;
      }
      // Flow test photos
      const ftPrint = wd.getElementById('flow-test-photos-print');
      if (ftPrint && flowTestPhotos && flowTestPhotos.length > 0) {
        // S372.5: if the appendix had no eligible photos, no "Photo Appendix" band
        // was emitted — add it here so flow-test charts sit under their own section
        // (and the paginator doesn't fold them into Signature).
        let ftHtml = '';
        if(!window._apxBandEmitted){ ftHtml += '<div class="sh apx-band" style="margin-top:26px;">Photo Appendix</div>'; window._apxBandEmitted = true; }
        // S372.7: keep the sub-header glued to its first chart (apx-keep ⇒ atomic),
        // so the header never strands at a page bottom. Remaining charts flow as
        // separate blocks and may break across pages.
        var _ftSub = '<div class="apx-subhead" data-subhead="Flow Test Charts" style="display:flex;align-items:center;gap:9px;padding:16px 0 6px;margin:0 0 11px;border-bottom:1px solid #D8DCE3;">'
          + '<span style="width:4px;height:15px;background:#9C2742;border-radius:2px;display:inline-block;flex:0 0 auto;"></span>'
          + '<span style="font:700 14px Calibri,sans-serif;color:#1C2333;letter-spacing:.3px;">Flow Test Charts</span></div>';
        var _ftCard = function(p){ return '<div style="width:228px;height:228px;background:#f2f2f2;border:1px solid #C9CDD4;border-radius:4px;overflow:hidden;"><img src="'+_phSrc(p)+'" style="width:100%;height:100%;object-fit:cover;display:block;"></div>'; };
        // first block = subhead + first chart (atomic); rest = 3-up rows that split freely
        ftHtml += '<div class="apx-keep">'+_ftSub+'<div style="display:flex;flex-wrap:wrap;gap:12px;">'+_ftCard(flowTestPhotos[0])+'</div></div>';
        for(var _fi=1; _fi<flowTestPhotos.length; _fi+=3){
          var _grp = flowTestPhotos.slice(_fi,_fi+3).map(_ftCard).join('');
          ftHtml += '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;">'+_grp+'</div>';
        }
        ftPrint.innerHTML = ftHtml;
      }
      // Photos now appear inline after each checklist item (removed appendix section)
      // Sketches
      const skPrint = wd.getElementById('sketches-print');
      if (skPrint && sketchEntries.length > 0) {
        let skHtml = '';
        if(!window._apxBandEmitted){ skHtml += '<div class="sh apx-band" style="margin-top:26px;">Photo Appendix</div>'; window._apxBandEmitted = true; }
        skHtml += '<div class="apx-subhead" style="display:flex;align-items:center;gap:9px;padding:16px 0 6px;margin:0 0 11px;border-bottom:1px solid #D8DCE3;">'
          + '<span style="width:4px;height:15px;background:#9C2742;border-radius:2px;display:inline-block;flex:0 0 auto;"></span>'
          + '<span style="font:700 14px Calibri,sans-serif;color:#1C2333;letter-spacing:.3px;">Site Sketches &amp; Photo Markups</span></div>';
        sketchEntries.filter(e=>document.getElementById('sketch-'+e.uid)).forEach((entry, dispIdx) => {
          var skUid = entry.uid;
          if(typeof _flattenSTL==='function') _flattenSTL(skUid);
          const sk = document.getElementById('sc-' + skUid);
          const mc = document.getElementById('mc-' + skUid);
          const bi = document.getElementById('markup-wrap-' + skUid)?.querySelector('.markup-base-img');
          const skSrc = sk ? sk.toDataURL() : '';
          const mcSrc = mc ? mc.toDataURL() : '';
          skHtml += '<div style="margin-bottom:14px;padding:12px;border:1px solid #ddd;border-radius:6px;page-break-inside:avoid;">';
          skHtml += '<div style="font-weight:700;font-size:9pt;margin-bottom:6px;">Sketch '+(dispIdx+1)+(entry.comment?': '+entry.comment.slice(0,60):'')+'</div>';
          skHtml += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
          if (skSrc) skHtml += '<div><div style="font-size:8pt;color:#666;margin-bottom:2px;">Freehand Sketch</div><img src="'+skSrc+'" style="max-width:280px;max-height:180px;border:1px solid #eee;border-radius:3px;"></div>';
          if (mcSrc && bi) skHtml += '<div><div style="font-size:8pt;color:#666;margin-bottom:2px;">Marked-up Photo</div><div style="position:relative;display:inline-block;"><img src="'+bi.src+'" style="max-width:280px;max-height:180px;display:block;"><img src="'+mcSrc+'" style="position:absolute;top:0;left:0;width:100%;height:100%;"></div></div>';
          skHtml += '</div>';
          if (entry.comment) skHtml += '<div style="font-size:8.5pt;font-style:italic;color:#555;margin-top:6px;">'+entry.comment+'</div>';
          skHtml += '</div>';
        });
        skPrint.innerHTML = skHtml;
      }
    } catch(err) { console.error('PDF fill error:', err); }
    // S319 FIX (field console): `const wd` above is BLOCK-scoped inside the try —
    // referencing it here threw "wd is not defined" on every export, killing the
    // style injection + image-decode wait below. Use w.document directly.
    var pdfStyle = w.document.createElement('style');
    pdfStyle.textContent = '.cl-unselected { background: #FFF3E0 !important; border-left: 4px solid #E65100 !important; } [id^=ann-toggle] { display:none !important; }';
    w.document.head.appendChild(pdfStyle);
    // Wait for all images (especially photos) to fully decode before printing
    const imgs = w.document.images;
    let toLoad = imgs.length;
  }, 600);
  // S503e: shared export chrome. The bespoke dark-blue top bar (+ its 400ms polling
  // resize timer) is retired; Diesel now mounts the SAME floating Export/Close cluster
  // FRT uses — lib/export/exportPreview.js :: mountExportChrome(). One implementation,
  // not a lookalike: the module is bridged onto window by the page's module shim.
  // Step 1 of the FRT convergence — the button still runs the browser print dialog;
  // the capture pipeline (real .pdf + text layer + photo links) lands in step 2.
  try {
    var _mec = (typeof window!=='undefined') && window.__mountExportChrome;
    if (typeof _mec === 'function') {
      _mec(w, w.document, { onExport: function(){ w.print(); } });
    } else {
      // Fallback: the shared module failed to load. Never leave the preview with no
      // way out — mount a minimal pill so export/close still work.
      var fb = w.document.createElement('div');
      fb.id = 'pdf-btn-cluster';
      fb.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;align-items:center;gap:8px;';
      var fbP = w.document.createElement('button');
      fbP.innerHTML = '\uD83D\uDCC4 Export PDF';
      fbP.style.cssText = 'padding:10px 18px;background:#2E9E72;color:#fff;border:none;border-radius:22px;font:700 14px Calibri,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);';
      fbP.onclick = function(){ w.print(); };
      fb.appendChild(fbP);
      var fbC = w.document.createElement('button');
      fbC.innerHTML = '\u2715';
      fbC.style.cssText = 'width:42px;height:42px;background:#455A64;color:#fff;border:none;border-radius:50%;font:700 16px Calibri,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);';
      fbC.onclick = function(){ try{ w.close(); }catch(_c){} };
      fb.appendChild(fbC);
      w.document.body.appendChild(fb);
      try{ console.warn('[Diesel] shared export chrome unavailable — fallback cluster mounted'); }catch(_lw){}
    }
    var hideStyle = w.document.createElement('style');
    hideStyle.textContent = '@media print { #pdf-btn-bar, #pdf-btn-cluster, #cap-status { display:none !important; } body { padding-top:0 !important; } }';
    w.document.head.appendChild(hideStyle);
  } catch(btnErr) { console.error('PDF btn error:', btnErr); }
  // ── PAGINATION ENGINE (Session 53) ──
  // After images load, paginate content into pages with compact headers
  setTimeout(function(){
    try {
      var wd = w.document;
      var PAGE_H = 912; // usable height per page (8.5x11 @ 96dpi minus padding)
      var origPage = wd.querySelector('.page');
      if(!origPage) return;
      // S372.4: the flow-test/sketch print divs are wrapper <div>s whose .sh band
      // + photos live INSIDE them (injected via innerHTML). The unit-grouper below
      // only inspects DIRECT children of .page, so a nested .sh is invisible and the
      // wrapper gets absorbed into the previous section (Signature) → photos print
      // under "Signature (cont.)". Unwrap these wrappers: promote their children to
      // be direct .page children, in place, so each inner .sh starts its own unit.
      ['flow-test-photos-print','sketches-print'].forEach(function(wid){
        var wrap = wd.getElementById(wid);
        if(!wrap || wrap.parentNode!==origPage) return;
        while(wrap.firstChild){ origPage.insertBefore(wrap.firstChild, wrap); }
        origPage.removeChild(wrap);
      });
      // Get project info for compact header
      var _chClient = (proj.client||'').replace(/</g,'&lt;');
      var _chAddr = (proj.addr||'').replace(/</g,'&lt;');
      var _chProjName = (proj.projname||'').replace(/</g,'&lt;');
      var _chTitle = 'Diesel Fire Pump Commissioning Report #' + _pdfInstNum + (_chProjName ? ' - ' + _chProjName : '');
      var _chProjNo = proj.projno||'';
      var _chRev = (proj.revision||formRevision||'');
      var _chDate = new Date().toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'});

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
        groups.forEach(function(grp){
          var firstOnPage = (tb.rows.length === 0);
          grp.forEach(function(r){ tb.appendChild(r); });   // place the whole group
          if(_overflow() && !firstOnPage){
            grp.forEach(function(r){ if(r.parentNode) r.parentNode.removeChild(r); }); // pull back the group
            tb = _shell(true);                                // continue on a fresh page
            grp.forEach(function(r){ tb.appendChild(r); });
          }
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
            var measured = false;
            if(firstBN){
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
            var prevNode = null;
            if(bn.classList.contains('keep-prev')){
              var lc = curPage.lastElementChild;
              // only pull a preceding content block, never the section band
              if(lc && !(lc.classList && lc.classList.contains('sh')) && curPage.children.length > 1){
                prevNode = lc; curPage.removeChild(prevNode);
              }
            }
            if(curPage.children.length > 1) _push();
            if(prevNode) curPage.appendChild(prevNode);
            curPage.appendChild(bn);
            // if the pair STILL overflows the fresh page, the sb is genuinely
            // oversized — release it back to splitting, keep verdict atomic after.
            if(prevNode && _overflow()){
              curPage.removeChild(bn); curPage.removeChild(prevNode);
              _splitGeneric(prevNode, head);
              if(_overflow() && curPage.children.length > 1) _push();
              curPage.appendChild(bn);
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
        parent.insertBefore(pg, wd.getElementById('mobile-page-nav'));
      });
    } catch(pgErr){ console.warn('Pagination error:', pgErr); }
  }, 1200);
  } catch(err) { console.error('PDF error:', err); showToast('PDF error: '+err.message, 5000); }
}
