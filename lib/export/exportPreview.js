// ─────────────────────────────────────────────────────────────────────────────
// lib/export/exportPreview.js — ARENCON shared export-preview module (S457)
//
// Two capabilities every tool's PDF export needs:
//
//  1. mountExportChrome(w, D, opts) — the floating Export/Close cluster.
//     Pinned bottom-right of the VISIBLE screen, counter-scaled so it keeps a
//     constant on-screen size at any zoom (desktop page zoom measured via
//     outerWidth/innerWidth; pinch via visualViewport), event-driven (no
//     polling). Close empties the heavy preview DOM before closing (mobile
//     tab-crash mitigation). opts: { onExport: function }.
//
//  2. createFlowLayout(env) — the position-sliced flow pagination engine.
//     Design locked with Mark (S457): a page fuller than FILL_OK may move a
//     non-fitting card whole (small gap acceptable); an emptier page must be
//     filled — the card starts there and flows across pages at natural seams
//     (thread rows, photo-grid rows, description paragraphs), never mid-line,
//     never a sliver (MIN_LAND). Breaks are decided from the browser's real
//     laid-out geometry — no height guessing, no magic thresholds beyond the
//     two named policy knobs. DOM-clone splitting guarantees balanced markup
//     by construction; a self-check verifies every page on every export.
//
//     env contract (the host tool wires its own page machinery):
//       w, D            : print window + its document
//       PAGE_H          : usable page height (px)
//       finalizePage()  : flush current page into the pages list
//       startPage()     : begin a new page (sets base used-height)
//       restamp()       : re-stamp active band context on a continued page
//       getUsed()/setUsed(v)   : current page used-height accessor
//       append(html)           : append html to the current page
//       getPages()/getOpenHtml(): for the structural self-check
//       bands: { getTrade(), setTrade(html), setCtr(html) }
//       selectors (optional)   : override card-structure selectors
//     Returns layoutBody(blocks) for blocks of
//       {type:'tradeHeader'|'ctrHeader'|'recHeader'|'defCard', html, htmlCont?}.
//
// Consumed by FRT today; Diesel / Electric / IST / OBC adopt by supplying
// their own env + selectors. Loaded as an ES module; also attached to
// window.ArenconExport for single-file (non-module) tools.
// ─────────────────────────────────────────────────────────────────────────────

export function mountExportChrome(w, D, opts){
  opts=opts||{};
  var _doClose=function(){
    try{var pc=D.getElementById('pages-container');if(pc)pc.innerHTML='';
        var mz=D.getElementById('measure-zone');if(mz)mz.innerHTML='';}catch(_e){}
    try{w.close();}catch(_e2){}
  };
  var cl=D.createElement('div');cl.id='pdf-btn-cluster';
  cl.style.cssText='position:fixed;z-index:99999;display:flex;align-items:center;gap:8px;transform-origin:bottom right;';
  var pb=D.createElement('button');pb.innerHTML='\uD83D\uDCC4 Export PDF';
  pb.title='Click to save the report as a PDF (matches this preview exactly).';
  pb.style.cssText='padding:10px 18px;background:#2E9E72;color:#fff;border:none;border-radius:22px;font:700 14px Calibri,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);';
  pb.onclick=function(){if(opts.onExport)opts.onExport();};cl.appendChild(pb);
  var cb=D.createElement('button');cb.innerHTML='\u2715';cb.title='Close preview';
  cb.style.cssText='width:42px;height:42px;background:#455A64;color:#fff;border:none;border-radius:50%;font:700 16px Calibri,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);';
  cb.onclick=_doClose;cl.appendChild(cb);
  D.body.appendChild(cl);
  var _zoom=function(){
    // S460 fix: on iOS Safari, innerWidth ALREADY tracks pinch zoom (it reports the
    // visual viewport in CSS px), so multiplying outer/inner by visualViewport.scale
    // DOUBLE-COUNTS the zoom (pill blown up ~3x at page-fit view). Only multiply the
    // vv scale in when the visual viewport is genuinely narrower than the layout
    // viewport (desktop pinch on touch laptops) - i.e. innerWidth is layout-sized.
    var pz=1;
    try{if(w.outerWidth&&w.innerWidth)pz=w.outerWidth/w.innerWidth;}catch(_z1){}
    if(!isFinite(pz)||pz<=0)pz=1;
    var z=pz;
    try{
      var vv=w.visualViewport;
      if(vv&&vv.scale&&vv.width&&vv.width < w.innerWidth-2){ z=pz*vv.scale; }
    }catch(_z2){}
    if(z<0.3)z=0.3;if(z>6)z=6;
    return Math.round(z*20)/20;
  };
  var _fit=function(){
    var s=1/_zoom();
    var vv=null; try{vv=w.visualViewport;}catch(_f0){}
    if(vv&&vv.width){
      // S460 fix: pin to the VISUAL viewport. position:fixed attaches to the LAYOUT
      // viewport, so right/bottom offsets drift under iOS pinch-zoom (the pill floats
      // over the page / off-screen). Deterministic left/top from visualViewport
      // offsets + the element's own layout size keeps it glued to the visible
      // bottom-right at any zoom, on any platform.
      var ow=cl.offsetWidth||0, oh=cl.offsetHeight||0;
      cl.style.right='auto'; cl.style.bottom='auto';
      cl.style.transformOrigin='top left';
      cl.style.transform='scale('+s+')';
      cl.style.left=(vv.offsetLeft+vv.width-(ow+14)*s)+'px';
      cl.style.top=(vv.offsetTop+vv.height-(oh+14)*s)+'px';
    }else{
      cl.style.left='auto'; cl.style.top='auto';
      cl.style.transformOrigin='bottom right';
      cl.style.transform='scale('+s+')';
      cl.style.right=(14*s)+'px';
      cl.style.bottom=(14*s)+'px';
    }
  };
  w.addEventListener('resize',_fit);
  try{w.visualViewport.addEventListener('resize',_fit);w.visualViewport.addEventListener('scroll',_fit);}catch(_f2){}
  _fit();setTimeout(_fit,300);
  return {cluster:cl,close:_doClose};
}

export function createFlowLayout(env){
  var w=env.w,D=env.D,PAGE_H=env.PAGE_H;
  var SEL=Object.assign({
    split:'.dc-split',grid:'.dp-grid',desc:'.dc-desc',
    content:'.dc-content',inner:'.dc-inner',
    itemNum:'.dc-itemnum',pinRef:'.pinref-dark',
    mini:'[class*="dc-mini"]',miniContClass:'dc-mini-cont',
    crb:'.crb',crbHd:'.crb-hd',
    crbContTitle:'Contractor Response \u2014 thread (cont.)'
  },env.selectors||{});
  var FILL_OK=0.72;   // page-fullness above which a whole-card move is acceptable
  var MIN_LAND=110;   // px: minimum meaningful landing (header + one content block)

  function _cardMeta(el){
    var num=(el.querySelector(SEL.itemNum)||{}).innerHTML||'';
    var pin=(el.querySelector(SEL.pinRef)||{}).innerHTML||'';
    return{
      num:num,pin:pin,
      hasMini:!!el.querySelector(SEL.mini),
      contBand:'<div class="item-contband"><span class="dc-itemnum">'+num+'</span>'+(pin?' <span class="pinref-dark">'+pin+'</span>':'')+' <span class="cont">continued</span></div>',
      breakNote:'<div style="font-size:8.5pt;color:#928E9C;font-weight:700;font-style:italic;text-align:right;margin-top:6px;">continues on next page \u2192</div>'
    };
  }
  function _breakCandidates(el){
    var base=el.getBoundingClientRect().top;var out=[];
    function push(n){var y=n.getBoundingClientRect().top-base;if(y>=MIN_LAND)out.push({node:n,y:y});}
    var th=el.querySelectorAll(SEL.split);
    for(var i=0;i<th.length;i++){
      // S465: the FIRST split row inside a .crb box is NOT a seam. The box
      // header sits before it in the markup, so splitting there strands the
      // header as an empty stub at a page bottom while the (cont.) head
      // re-prints it on the next page (the 1490.04 Pin 4 stub). Seams between
      // rounds 2+ remain valid; a box with one row simply isn't splittable.
      if(!th[i].previousElementSibling){
        var _crbHost=th[i].parentElement;
        var _inCrb=false,_p=_crbHost;
        while(_p&&_p!==el){if(_p.matches&&_p.matches(SEL.crb)){_inCrb=true;break;}_p=_p.parentElement;}
        if(_inCrb)continue;
      }
      push(th[i]);
    }
    // S466: the boundary BEFORE a .crb box IS a natural seam (the replacement
    // for the first-row seam S465 removed). Splitting here moves the box whole
    // to the next page carrying its OWN header — no stub, no (cont.) title —
    // while the page above fills through photos, follow-ups and footer. Without
    // this, cards with photos + a response box only offered photo-row seams and
    // everything after the photos was pushed over, leaving the large page-bottom
    // gaps observed on 1490.04 Pins 3/5.
    var cb=el.querySelectorAll(SEL.crb);
    for(var cbi=0;cbi<cb.length;cbi++)push(cb[cbi]);
    var gs=el.querySelectorAll(SEL.grid);
    for(var g=0;g<gs.length;g++){
      var prev=null,ch=gs[g].children;
      for(var c=0;c<ch.length;c++){
        var t=ch[c].getBoundingClientRect().top;
        if(prev===null||t>prev+1){push(ch[c]);prev=t;}
      }
    }
    var ds=el.querySelectorAll(SEL.desc);
    for(var d2=0;d2<ds.length;d2++){var ks=ds[d2].children;for(var k2=1;k2<ks.length;k2++)push(ks[k2]);}
    out.sort(function(a,b){return a.y-b.y;});
    var seen=[],ded=[];
    for(var q=0;q<out.length;q++){if(seen.indexOf(out[q].node)===-1){seen.push(out[q].node);ded.push(out[q]);}}
    return ded;
  }
  function _splitDomBefore(srcEl,node,meta){
    var path=[];var n=node;
    while(n!==srcEl){var p=n.parentElement,ix=0,s=n;while((s=s.previousElementSibling))ix++;path.unshift(ix);n=p;}
    function at(root){var e=root;for(var i=0;i<path.length;i++)e=e.children[path[i]];return e;}
    var A=srcEl.cloneNode(true),B=srcEl.cloneNode(true);
    var nA=at(A),nB=at(B);
    var c=nA;
    while(c!==A){var pa=c.parentElement;while(c.nextElementSibling)pa.removeChild(c.nextElementSibling);c=pa;}
    nA.parentElement.removeChild(nA);
    c=nB;
    while(c!==B){var pb2=c.parentElement;while(c.previousElementSibling)pb2.removeChild(c.previousElementSibling);c=pb2;}
    var host=A.querySelector(SEL.content)||A;
    var bn=srcEl.ownerDocument.createElement('div');bn.innerHTML=meta.breakNote;host.appendChild(bn.firstChild);
    var bc=B.querySelector(SEL.content)||B;
    var cb2=srcEl.ownerDocument.createElement('div');cb2.innerHTML=meta.contBand;bc.insertBefore(cb2.firstChild,bc.firstChild);
    if(meta.hasMini&&!B.querySelector(SEL.mini)){
      var inr=B.querySelector(SEL.inner);
      if(inr){var sp=srcEl.ownerDocument.createElement('div');sp.className=SEL.miniContClass;inr.insertBefore(sp,inr.firstChild);}
    }
    var crb=B.querySelector(SEL.crb);
    if(crb&&!crb.querySelector(SEL.crbHd)){
      var hd=srcEl.ownerDocument.createElement('div');hd.className=SEL.crbHd.replace(/^\./,'');
      hd.innerHTML=SEL.crbContTitle;crb.insertBefore(hd,crb.firstChild);
    }
    return{aHtml:A.outerHTML,bEl:B};
  }

  return function layoutBody(blocks){
    if(!blocks.length)return;
    var host=D.createElement('div');
    host.style.cssText='position:absolute;left:-99999px;top:0;width:7.3in;visibility:hidden;';
    var counts=[];var tpl=D.createElement('template');var all='';
    for(var i=0;i<blocks.length;i++){
      tpl.innerHTML=blocks[i].html;
      counts.push(Math.max(1,tpl.content?tpl.content.childElementCount:1));
      all+=blocks[i].html;
    }
    host.innerHTML=all;D.body.appendChild(host);
    var kids=host.children;var hostTop=host.getBoundingClientRect().top;
    var G=[];var cursor=0;var firstEls=[];
    for(var b2=0;b2<blocks.length;b2++){
      var first=kids[cursor];var last=kids[Math.min(cursor+counts[b2]-1,kids.length-1)];
      G.push({
        t:first.getBoundingClientRect().top-hostTop,
        b:last.getBoundingClientRect().bottom-hostTop,
        mT:parseFloat(w.getComputedStyle(first).marginTop)||0
      });
      firstEls.push(first);
      cursor+=counts[b2];
    }
    function extent(f,k){return (G[k].b-G[f].t)+G[f].mT;}
    function isBand(t){return t==='tradeHeader'||t==='ctrHeader'||t==='recHeader';}
    function keepEnd(k){
      if(!isBand(blocks[k].type))return k+1;
      var j=k+1;
      if(j<blocks.length&&(blocks[j].type==='ctrHeader'||blocks[j].type==='recHeader'))j++;
      if(j<blocks.length&&blocks[j].type==='defCard')j++;
      return j;
    }
    function note(b){
      if(b.type==='tradeHeader'){env.bands.setTrade(b.htmlCont||b.html);}
      else if(b.type==='ctrHeader'||b.type==='recHeader'){env.bands.setCtr(b.htmlCont||b.html);}
    }
    function realH(frag){
      var p=D.createElement('div');
      p.style.cssText='position:absolute;left:-99999px;top:0;width:7.3in;visibility:hidden;';
      p.innerHTML=frag;D.body.appendChild(p);
      var h=p.getBoundingClientRect().height;D.body.removeChild(p);return h;
    }
    var anchor=-1,pageBase=0,pageHasBody=false,groupOpen=false;
    function newPage(){env.finalizePage();env.startPage();env.restamp();anchor=-1;pageHasBody=false;}
    function newPageForBand(t){
      env.finalizePage();env.startPage();
      anchor=-1;pageHasBody=false;
      var tr=env.bands.getTrade();
      if(t!=='tradeHeader'&&tr){env.append(tr);env.setUsed(env.getUsed()+realH(tr));}
    }
    function placeBlock(k){
      if(anchor===-1){anchor=k;pageBase=env.getUsed();}
      env.append(blocks[k].html);
      env.setUsed(pageBase+extent(anchor,k));
      pageHasBody=true;
    }
    function flowCard(idx0){
      var meta=_cardMeta(firstEls[idx0]);
      var cur=firstEls[idx0].cloneNode(true);
      var probe=D.createElement('div');
      probe.style.cssText='position:absolute;left:-99999px;top:0;width:7.3in;visibility:hidden;';
      D.body.appendChild(probe);
      var guard=0;var triedFresh=false;
      for(;;){
        if(++guard>200){probe.appendChild(cur);env.append(cur.outerHTML);env.setUsed(env.getUsed()+cur.getBoundingClientRect().height);pageHasBody=true;break;}
        probe.appendChild(cur);
        var h=cur.getBoundingClientRect().height;
        var lim=PAGE_H-env.getUsed();
        if(h<=lim){env.append(cur.outerHTML);env.setUsed(env.getUsed()+h);pageHasBody=true;anchor=-1;break;}
        var cands=_breakCandidates(cur);
        var pick=null;
        for(var q=cands.length-1;q>=0;q--){if(cands[q].y<=lim){pick=cands[q];break;}}
        if(!pick){
          if(!triedFresh){probe.removeChild(cur);newPage();triedFresh=true;continue;}
          if(cands.length)pick=cands[0];
          else{env.append(cur.outerHTML);env.setUsed(env.getUsed()+h);pageHasBody=true;anchor=-1;break;}
        }
        var sp=_splitDomBefore(cur,pick.node,meta);
        probe.removeChild(cur);
        env.append(sp.aHtml);env.setUsed(env.getUsed()+realH(sp.aHtml));pageHasBody=true;anchor=-1;
        newPage();
        cur=sp.bEl;triedFresh=true;
      }
      if(probe.parentNode)D.body.removeChild(probe);
    }
    var idx=0;
    while(idx<blocks.length){
      var avail=PAGE_H-env.getUsed();
      if(isBand(blocks[idx].type)){
        var end=keepEnd(idx);
        var gReq=extent(idx,end-2>=idx?end-2:idx);
        if(end-1>idx&&blocks[end-1].type==='defCard'){
          var cExt=extent(end-1,end-1);
          var cLand=cExt;
          var cc=_breakCandidates(firstEls[end-1]);
          if(cc.length&&cc[0].y<cExt)cLand=cc[0].y;
          gReq=(G[end-1].b-G[idx].t)+G[idx].mT-(cExt-cLand);
        }
        if(gReq>avail&&pageHasBody)newPageForBand(blocks[idx].type);
        while(idx<end&&isBand(blocks[idx].type)){placeBlock(idx);note(blocks[idx]);idx++;}
        groupOpen=(idx<end);
        continue;
      }
      var ext=extent(idx,idx);
      if(ext<=PAGE_H-env.getUsed()){placeBlock(idx);groupOpen=false;idx++;continue;}
      if(!groupOpen&&env.getUsed()>=PAGE_H*FILL_OK){
        newPage();
        if(ext<=PAGE_H-env.getUsed()){placeBlock(idx);groupOpen=false;idx++;continue;}
      }
      flowCard(idx);
      groupOpen=false;idx++;
    }
    D.body.removeChild(host);
    // structural self-check on every export
    try{
      var _bad=[];
      var _chk=function(html,label){
        var d2=0,mn=0;var re2=/<div\b|<\/div>/g;var m2;
        while((m2=re2.exec(html))){d2+=(m2[0]==='<div')?1:-1;if(d2<mn)mn=d2;}
        if(d2!==0||mn<0)_bad.push(label+' (net '+d2+', min '+mn+')');
      };
      var pgs=env.getPages();
      for(var pv=0;pv<pgs.length;pv++)_chk(pgs[pv].html||pgs[pv],'page '+(pv+1));
      var open=env.getOpenHtml();
      if(open)_chk(open,'open page');
      if(_bad.length){
        console.error('[export self-check] STRUCTURE FAULT:',_bad.join('; '));
        var _bn=D.createElement('div');
        _bn.style.cssText='position:fixed;top:48px;left:0;right:0;z-index:99999;background:#C0445F;color:#fff;font:700 11pt Calibri,sans-serif;padding:10px 16px;text-align:center;';
        _bn.textContent='EXPORT CHECK FAILED \u2014 page structure fault detected ('+_bad.length+'). Do not issue this report. Note the project and tell Mark.';
        D.body.appendChild(_bn);
      }
    }catch(_ve){}
  };
}

// single-file (non-module) tools: window global
try{if(typeof window!=='undefined')window.ArenconExport={mountExportChrome:mountExportChrome,createFlowLayout:createFlowLayout};}catch(_g){}
