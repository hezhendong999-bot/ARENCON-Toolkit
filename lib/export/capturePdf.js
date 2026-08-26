/* ARENCON — SHARED CAPTURE EXPORT (preview -> real .pdf file)
   ============================================================================
   S511, Lane C. Lifted VERBATIM from frt/js/export/pdf.js (the live FRT engine,
   not the beta). Nothing here is FRT-specific: verified before extraction that
   the capture block references none of FRT's projects, deficiencies,
   contractors, pins, drawings or state — it photographs whatever `.page`
   elements exist in the preview document and assembles them into a PDF. That is
   why it ports: Diesel's preview builds the same `.page` structure.

   WHAT IT DOES. The old export called w.print(), which lets the BROWSER
   re-paginate and ignore the engine's page boundaries — orphaned band titles,
   blank sheets, and no control over what lands on paper. This photographs each
   `.page` div with html2canvas and drops it 1:1 onto a PDF page sized from that
   element, so the file matches the preview exactly. Any photo <a href> in the
   preview is re-created as a real PDF /Link /URI annotation, and a selectable
   text layer is laid over the image so the PDF is searchable.

   OWNERSHIP. FRT keeps running its own resident copy; this module is NOT wired
   into frt/** and no FRT file was touched to create it (Mark, S511 option A).
   That means two copies exist for now — deliberate, and the reason is that
   editing another lane's locked renderer to save a duplicate is the more
   dangerous trade. When Lane A is ready, FRT imports this and deletes its copy;
   until then, a fix made here must be considered for frt/js/export/pdf.js too.

   OFFLINE. FRT loads html2canvas and pdf-lib from CDNs at export time, so an
   export on a tablet with no signal fails. Both libraries are vendored into
   /vendor and loaded from there first; the CDN stays as a fallback only. Field
   tablets must be able to produce a report on a site with no bars.
   ========================================================================== */

/* S519 — MISSING CONSTANT THAT BROKE EVERY EXPORT.
   _captureExportPDF prints the engine build in its status line
   ("Loading export libraries… (PDF engine S501)"). In FRT that constant is
   declared on LINE 1 as `export var PDF_PIPELINE_BUILD='S501'`, and my
   extraction dependency scan matched `^function` / `^(var|const|let)` — the
   `export ` prefix made it invisible. So the module shipped referencing a name
   that does not exist here, and every Diesel export died with
   "PDF_PIPELINE_BUILD is not defined" the moment capture began.

   Worse, it failed in a way the caller could not catch: the throw happens
   inside the capture's own async IIFE, so pdfExport's try/catch fallback to
   the print dialog never fired — the user got an error banner and no PDF at
   all, rather than degrading to printing. The fallback gap is logged as a
   separate item; this constant is the actual defect.

   Value is this module's own build, not FRT's — the two copies are free to
   diverge and the status line should say which one is running. */
var PDF_PIPELINE_BUILD = 'S519-diesel';

/* ── Declarations the capture block needs, lifted with it ───────────────────
   S511. Extracted alongside the capture code because it reads them directly.
   Values are FRT's, unchanged.

   FONTS. The text layer embeds Carlito (metric-compatible with Calibri) so the
   PDF is selectable and searchable. Those TTFs live in frt/fonts/ and are
   referenced there rather than copied: duplicating 3.2MB of identical font
   files to satisfy a directory name would be the wrong trade, and reading a
   static asset does not touch Lane A's code. If the fetch fails the renderer
   degrades on its own — vector text → invisible-Helvetica search layer → image
   only — so a missing font can never break an export. When Lane A converts,
   move the fonts to a neutral /fonts/ as part of that work and update
   _TXT_FONT_FILES here.

   _txtCover is FRT's per-face glyph-coverage map, populated during its own
   export. Nothing populates it here, and null is the safe value: _txtCoversText
   treats "no map" as "assume covered", which is the same answer FRT gets before
   its map is built.
   _minimapsReady is FRT's drawing-minimap render promise. Diesel's report has
   no minimaps, so an already-resolved promise is correct — the capture simply
   does not wait for something that will never render.
   ────────────────────────────────────────────────────────────────────────── */
var _txtCover = null;
var _minimapsReady = Promise.resolve();
var _qTier = 'balanced';
var PDF_TIERS = {
  // S496 photoQ REVISED against measured evidence. Fieldwire's "optimized"
  // download (Ian/Shaun, S496) turned out to be 3060px -> 1200px re-encoded at
  // ~q97 with NO chroma subsampling — i.e. it spends 1.74x MORE bytes per pixel
  // than the full-res original. The lesson: CUT RESOLUTION, PROTECT QUALITY.
  // The first draft here did the opposite (q0.72) to pay for the extra pixels,
  // which is wrong for Shaun's actual complaint — low q shows as artifacts in
  // the flat wall/ceiling areas that dominate fire-protection photos, and a
  // PRINTED report has no photo hyperlink to fall back on.
  // S497 (Mark's queue item: print-size photo scaling). photoPx is now a
  // CEILING, not the target. The real driver is photoDpi — the print density
  // at the photo's PRINTED size. Every in-report photo prints in a 3-across
  // grid cell (~2.4in wide on the 7.3in Letter content area; .rphotos and
  // .dp-grid are both repeat(3,1fr)); embedding 1400-2200px into a 2.4in
  // cell buys nothing a printer can show. 300 DPI at that cell is ~720px —
  // the "≈700px" from the S496 Fieldwire analysis. Higher tiers raise the
  // print density (sharper under a loupe / on-screen zoom), not the waste.
  balanced: { photoPx:1400, photoQ:0.82, dpi:175, photoDpi:300 },
  high:     { photoPx:1800, photoQ:0.85, dpi:250, photoDpi:350 },
  max:      { photoPx:2200, photoQ:0.88, dpi:300, photoDpi:400 }
};
var PDF_PHOTO_CELL_IN = { w:2.4, h:1.8 };
var _TXT_FONT_FILES={
  r:'../../frt/fonts/Carlito-Regular.ttf', b:'../../frt/fonts/Carlito-Bold.ttf',
  i:'../../frt/fonts/Carlito-Italic.ttf', bi:'../../frt/fonts/Carlito-BoldItalic.ttf',
  // S499d: the report is set in exactly three families (verified by auditing
  // every font-family rule in the builder). Text was previously ALL redrawn
  // in Carlito regardless, so the cover title (wordmark font) and the address
  // block (Arial) were positioned with one font's letter widths and painted
  // with another's - words landed in slots too wide and only partly filled
  // them. Embedding the real faces makes the drawn text match the screen
  // exactly (measured: title line 1 was 190px short, now pixel-identical).
  // Blair has no GSUB; Liberation Sans is metrically identical to Arial.
  blair:'../../frt/fonts/Blair.ttf', arial:'../../frt/fonts/LiberationSans-Regular.ttf'
};
var _txtBytesCache={};
function _txtFetchFace(k){
  if(!_txtBytesCache[k]){
    var u=new URL(_TXT_FONT_FILES[k],import.meta.url).href;
    _txtBytesCache[k]=fetch(u).then(function(r){
      if(!r.ok)throw new Error('font '+k+' HTTP '+r.status);
      return r.arrayBuffer();
    });
    _txtBytesCache[k].catch(function(){ delete _txtBytesCache[k]; });
  }
  return _txtBytesCache[k];
}

function _txtSanitizeWinAnsi(s){
  s=String(s||'')
    .replace(/[\u2014\u2013]/g,'-').replace(/[\u2018\u2019\u02BC]/g,"'")
    .replace(/[\u201C\u201D]/g,'"').replace(/\u00B7/g,'.').replace(/\u2022/g,'*')
    .replace(/\u2192/g,'>').replace(/\u2190/g,'<').replace(/\u21A9/g,'<')
    .replace(/[\u2715\u00D7\u2716]/g,'x').replace(/\u2713|\u2714/g,'v')
    .replace(/\u00A0/g,' ');
  var out='';
  for(var i=0;i<s.length;i++){
    var c=s.charCodeAt(i);
    if((c>=32&&c<=126)||(c>=160&&c<=255)) out+=s[i];
  }
  return out.replace(/\s+/g,' ').trim();
}

function _qTierDef(){ return PDF_TIERS[_qTier] || PDF_TIERS.balanced; }

function _txtCoversText(s,famKey){
  var set=_txtCover&&_txtCover[famKey];
  if(!set)return true;                       // no map yet -> gate stays open
  s=String(s||'');
  for(var i=0;i<s.length;i++){
    var cp=s.codePointAt(i);
    if(cp>0xFFFF)i++;                        // surrogate pair consumed
    if(cp===9||cp===10||cp===13||cp===32)continue;
    if(!set.has(cp))return false;
  }
  return true;
}

function _applyTT(str,tt){
    if(!tt)return str;
    if(tt==='uppercase')return str.toUpperCase();
    if(tt==='lowercase')return str.toLowerCase();
    if(tt==='capitalize')return str.replace(/[A-Za-z0-9\u00C0-\u024F]+/g,function(w){return w.charAt(0).toUpperCase()+w.slice(1);});
    return str;
  }

function _txtBuildCover(faces){
  var out={};
  Object.keys(faces).forEach(function(k){
    var f=faces[k], fx=f&&f.embedder&&f.embedder.font;
    if(!fx)return;
    var key=(k==='blair'||k==='arial')?k:'cal';
    var set=out[key]||(out[key]=new Set());
    // cal is the INTERSECTION of the four Carlito faces: a character is only
    // safe if every weight/style we might pick can draw it.
    var cs=fx.characterSet||[];
    if(key==='cal'&&out._calSeen){
      var keep=new Set();
      cs.forEach(function(cp){ if(set.has(cp))keep.add(cp); });
      out[key]=keep;
    }else{
      cs.forEach(function(cp){ set.add(cp); });
      if(key==='cal')out._calSeen=1;
    }
  });
  delete out._calSeen;
  return out;
}

function _collectTextWords(pageEl){
  var doc=pageEl.ownerDocument||document;             // popup-realm correct (S498e)
  var win=doc.defaultView||window;
  var words=[], els=[], elSeen=[];
  var meta=new Map();                                  // element -> style meta | null=skip
  function elMeta(el){
    if(meta.has(el))return meta.get(el);
    var m=null;
    try{
      var cs=win.getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden'){ meta.set(el,null); return null; }
      // transformed subtrees (rotated chips, svg innards) stay raster —
      // their glyph geometry is not what Range rects report.
      var a=el;
      while(a&&a!==pageEl){
        if(win.getComputedStyle(a).transform!=='none'){ meta.set(el,null); return null; }
        a=a.parentElement;
      }
      var colm=/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(cs.color)||[0,0,0,0,1];
      var alpha=colm[4]===undefined?1:parseFloat(colm[4]);
      if(alpha<=0.01){ meta.set(el,null); return null; }   // already hidden (baked captions)
      var ls=cs.letterSpacing==='normal'?0:parseFloat(cs.letterSpacing)||0;
      // ═══ S499d REPRODUCIBILITY GATE ═══════════════════════════════════
      // The vector layer may only claim text it can reproduce EXACTLY. Two
      // ways it cannot: (a) the element is set in a family we have no face
      // for, so its measured word slots would be filled with the wrong
      // letter widths; (b) the text contains a character no embedded face
      // can draw (the report uses eight such symbols - ruler, checks,
      // warning, return arrow...), which painted as a "missing character"
      // box. Either way we return null: the element is never captured and
      // never hidden, so it stays in the page image and prints EXACTLY as
      // the browser drew it on this machine. True form by construction -
      // nothing is substituted or approximated.
      var _fam=String(cs.fontFamily||'').split(',')[0].replace(/["']/g,'').trim().toLowerCase();
      var _famKey = _fam.indexOf('blair')>=0 ? 'blair'
                  : _fam.indexOf('arial')>=0 ? 'arial'
                  : (!_fam||_fam.indexOf('calibri')>=0||_fam.indexOf('carlito')>=0
                     ||_fam.indexOf('sans-serif')>=0||_fam.indexOf('serif')>=0) ? 'cal'
                  : null;
      if(_famKey===null){ meta.set(el,null); return null; }
      // Blair and the Arial face ship regular only; bold/italic in those
      // families cannot be reproduced, so they stay raster too.
      var _isBold=(parseInt(cs.fontWeight,10)||400)>=600;
      var _isItal=/italic|oblique/.test(cs.fontStyle);
      if(_famKey!=='cal'&&(_isBold||_isItal)){ meta.set(el,null); return null; }
      if(_txtCover&&!_txtCoversText(el.textContent,_famKey)){ meta.set(el,null); return null; }
      m={fs:parseFloat(cs.fontSize)||11,
         famKey:_famKey,
         bold:_isBold,
         ital:_isItal,
         r:(+colm[1])/255,g:(+colm[2])/255,b:(+colm[3])/255,a:alpha,
         ls:ls,
         // S499c: capture text-transform. The browser RENDERS the transformed
         // text (and the measured rects are the transformed widths) but
         // node.nodeValue is the source text - drawing the source produced
         // lowercase where the screen shows UPPERCASE (.fu-grp, .crb-hd,
         // Previously-Closed table headers), at uppercase-width anchors.
         tt:(cs.textTransform&&cs.textTransform!=='none')?cs.textTransform:null,
         li:cs.display==='list-item'&&cs.listStyleType!=='none'};
    }catch(_e){ m=null; }
    meta.set(el,m); return m;
  }
  // S499c: mirror CSS text-transform so the PDF draws what the screen shows.
  function _applyTT(str,tt){
    if(!tt)return str;
    if(tt==='uppercase')return str.toUpperCase();
    if(tt==='lowercase')return str.toLowerCase();
    if(tt==='capitalize')return str.replace(/[A-Za-z0-9\u00C0-\u024F]+/g,function(w){return w.charAt(0).toUpperCase()+w.slice(1);});
    return str;
  }
  var walker=doc.createTreeWalker(pageEl,NodeFilter.SHOW_TEXT,{
    acceptNode:function(n){
      return (n.nodeValue&&n.nodeValue.trim()&&n.parentElement)
        ?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
    }});
  var node, liFirst=new Map();
  while((node=walker.nextNode())){
    var el=node.parentElement, m=elMeta(el);
    if(!m)continue;
    // the LI flag lives on the list-item ancestor, not necessarily on el
    var liEl=null, a2=el;
    while(a2&&a2!==pageEl){ var mm=elMeta(a2); if(mm&&mm.li){liEl=a2;break;} a2=a2.parentElement; }
    var text=node.nodeValue, re=/\S+/g, mt;
    while((mt=re.exec(text))){
      var rg=doc.createRange();
      try{ rg.setStart(node,mt.index); rg.setEnd(node,mt.index+mt[0].length); }catch(_e){ continue; }
      // S499b: a word that wraps mid-word (hyphenated "floor-level") spans
      // TWO line boxes; getBoundingClientRect() returns their union, whose
      // left/top is the PREVIOUS line's start - the word then overprints
      // whatever really lives there (pin-15: 'floor-level' stamped onto
      // 'specified' at identical x/y in the S498f/S499a exports). Guarded:
      // words in a single line box (all but wrapped ones) keep the exact
      // old path. Wrapped words are split into per-line-box fragments by
      // probing sub-ranges; each fragment carries its own true rect.
      var rl=null; try{ rl=rg.getClientRects(); }catch(_e){}
      var rlN=0, rli;
      if(rl){ for(rli=0;rli<rl.length;rli++){ if(rl[rli].width>=0.4&&rl[rli].height>=0.4) rlN++; } }
      if(rlN>1){
        var pos=mt.index, endAll=mt.index+mt[0].length, guard=0, first=true;
        while(pos<endAll&&guard++<40){
          var lo=1, hi=endAll-pos, best=1;
          while(lo<=hi){
            var mid=(lo+hi)>>1, sub=doc.createRange(), n1=0, sr, sj;
            try{ sub.setStart(node,pos); sub.setEnd(node,pos+mid); sr=sub.getClientRects(); }catch(_e2){ sr=null; }
            if(sr){ for(sj=0;sj<sr.length;sj++){ if(sr[sj].width>=0.4&&sr[sj].height>=0.4) n1++; } }
            if(n1<=1){ best=mid; lo=mid+1; } else { hi=mid-1; }
          }
          var fr=doc.createRange(), fRect=null;
          try{ fr.setStart(node,pos); fr.setEnd(node,pos+best); fRect=fr.getBoundingClientRect(); }catch(_e3){}
          if(fRect&&fRect.width>=0.4&&fRect.height>=0.4){
            var wf={t:_applyTT(text.slice(pos,pos+best),m.tt),l:fRect.left,top:fRect.top,w:fRect.width,h:fRect.height,
                   fs:m.fs,bold:m.bold,ital:m.ital,cr:m.r,cg:m.g,cb:m.b,ca:m.a,ls:m.ls,famKey:m.famKey,mk:false};
            if(first&&liEl&&!liFirst.get(liEl)){ wf.mk=true; liFirst.set(liEl,true);
              var lmf=elMeta(liEl)||m; wf.mr=lmf.r; wf.mg=lmf.g; wf.mb=lmf.b; }
            words.push(wf); first=false;
          }
          pos+=best;
        }
        continue;
      }
      var r=rg.getBoundingClientRect();
      if(r.width<0.4||r.height<0.4)continue;
      var w={t:_applyTT(mt[0],m.tt),l:r.left,top:r.top,w:r.width,h:r.height,
             fs:m.fs,bold:m.bold,ital:m.ital,cr:m.r,cg:m.g,cb:m.b,ca:m.a,ls:m.ls,famKey:m.famKey,mk:false};
      if(liEl&&!liFirst.get(liEl)){ w.mk=true; liFirst.set(liEl,true);
        var lm=elMeta(liEl)||m; w.mr=lm.r; w.mg=lm.g; w.mb=lm.b; }
      words.push(w);
    }
    if(elSeen.indexOf(el)<0){ elSeen.push(el); els.push(el); }
  }
  return {words:words,els:els};
}

// ============================================================================
// CAPTURE EXPORT (S384) — make the exported PDF match the on-screen preview
// EXACTLY. The old green button called w.print(), which lets the browser
// RE-PAGINATE and ignore the engine's .page boundaries (orphaned band titles,
// blank pages). Instead we photograph each .page div with html2canvas and drop
// it 1:1 onto a PDF page sized from that element. What you see in the preview
// is literally what lands in the PDF. Photo <a href> links are re-created as
// PDF link annotations so clickable photos still work. (POC-proven approach.)
// ============================================================================
var _CAP_H2C_CDN='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
var _CAP_PDFLIB_CDN='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
/* S511 — VENDORED FIRST, CDN ONLY AS FALLBACK.
   FRT's original loader took a single CDN URL, so an export attempted on a
   tablet with no signal failed at the first script tag. Both libraries now live
   in /vendor and are resolved relative to THIS module's own URL (import.meta.url)
   rather than the page's, so it works whether the caller is /diesel-app/ or a
   single-file build at the root. The CDN is kept as a second attempt only, for
   the case where the vendored copy is missing from a stale cache. */
var _CAP_LOCAL = {
  'html2canvas': new URL('../../vendor/html2canvas.min.js', import.meta.url).href,
  'PDFLib':      new URL('../../vendor/pdf-lib.min.js',     import.meta.url).href
};
function _capInject(win, src){
  return new Promise(function(res, rej){
    var s = win.document.createElement('script');
    s.src = src;
    s.onload = function(){ res(); };
    s.onerror = function(){ rej(new Error('load fail ' + src)); };
    win.document.head.appendChild(s);
  });
}
function _capLoad(win,src,glob){
  if (win[glob]) return Promise.resolve();
  var local = _CAP_LOCAL[glob];
  var first = local ? _capInject(win, local) : Promise.reject(new Error('no vendored copy'));
  return first.then(function(){
    if (win[glob]) return;
    throw new Error('vendored ' + glob + ' loaded but did not register');
  }).catch(function(e){
    try { console.warn('[capture export] vendored ' + glob + ' unavailable, trying CDN', e); } catch(_){}
    return _capInject(win, src);
  });
}
function _capStatus(D,txt){
  var s=D.getElementById('cap-status');
  if(!s){
    s=D.createElement('div');s.id='cap-status';
    s.style.cssText='position:fixed;top:56px;left:0;right:0;z-index:9998;background:#1A7A4A;color:#fff;font:13px Calibri,sans-serif;padding:6px 20px;';
    D.body.appendChild(s);
  }
  s.textContent=txt;s.style.display='block';
}
function _capHideStatus(D){var s=D.getElementById('cap-status');if(s)s.style.display='none';}
function _captureExportPDF(w,D){
  var bar=D.getElementById('pdf-btn-cluster'); // S457: banner retired; hide/restore the cluster during capture
  var _pickerSupported=(typeof w.showSaveFilePicker==='function');
  var _saveHandle=null;
  (async function(){
    try{
      // S400: ask for the Save-As location FIRST, on this fresh click, in the
      // popup window w that owns the activation. showSaveFilePicker needs a
      // recent user gesture; S399 called it AFTER the multi-second render →
      // activation stale → silent auto-download. Pick first, hold the handle
      // across the render, write at the end (proven in standalone repro).
      // Cancel = stop cleanly, no render, no download.
      if(_pickerSupported){
        var _sName=(D.title||'ARENCON Report').replace(/[^\w.-]+/g,' ').replace(/\s+/g,' ').trim()+'.pdf';
        try{
          _saveHandle=await w.showSaveFilePicker({
            suggestedName:_sName,
            types:[{description:'PDF document',accept:{'application/pdf':['.pdf']}}]
          });
        }catch(_pk){
          if(_pk&&(_pk.name==='AbortError'||_pk.code===20)){
            _capStatus(D,'Save cancelled.');
            setTimeout(function(){_capHideStatus(D);},2500);
            return;
          }
          _saveHandle=null;
        }
      }
      // S497e — pipeline self-identification. Tonight three fixes "shipped"
      // while Mark's device ran a stale copy of THIS file: the SW cache
      // installed a fresh app.js (badge looked right) next to a CDN-stale
      // pdf.js, so the badge vouched for a build that wasn't running. The
      // engine now announces its own version in the export status bar —
      // version skew is visible at the moment it matters, every export.
      // ── S509 (Mark): the issued/working question moves to BEFORE generation.
      // It used to be asked after pdfDoc.save() — by which point the file
      // already existed, so a working copy could never be watermarked and the
      // freeze rode along as a side effect of a modal at the end. Asking first
      // makes it a deliberate choice and lets a draft carry its DRAFT COPY
      // watermark in the actual PDF bytes.
      var _issuedCopy = await new Promise(function(res){
        try{
          var _iso=D.createElement('div');
          _iso.style.cssText='position:fixed;inset:0;background:rgba(27,26,34,.45);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;';
          _iso.innerHTML='<div style="background:#fff;border-radius:14px;max-width:460px;width:100%;padding:20px;font-family:Calibri,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25);">'
            +'<div style="font-size:17px;font-weight:700;color:#1B1A22;margin-bottom:8px;">Issued copy, or working copy?</div>'
            +'<div style="font-size:14px;color:#5E5B68;line-height:1.45;margin-bottom:16px;">An <b>issued copy</b> is the reviewed record: its thread comments soft-lock (any inspector can unlock and edit, with a warning). A <b>working copy</b> locks nothing and prints with a DRAFT COPY watermark across every page.</div>'
            +'<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">'
            +'<button id="frt-iss-no" style="padding:12px 18px;border:1px solid #d8d5dd;background:#fff;border-radius:10px;font-size:14px;color:#1B1A22;cursor:pointer;font-family:Calibri,sans-serif;">Working copy</button>'
            +'<button id="frt-iss-yes" style="padding:12px 18px;border:0;background:#9C2742;color:#fff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;">Issued copy</button>'
            +'</div></div>';
          D.body.appendChild(_iso);
          _iso.querySelector('#frt-iss-no').addEventListener('click',function(){_iso.remove();res(false);});
          _iso.querySelector('#frt-iss-yes').addEventListener('click',function(){_iso.remove();res(true);});
        }catch(_e){res(false);}   // if the ask itself fails, the SAFE answer is working copy — never freeze by accident
      });
      _capStatus(D,'Loading export libraries… (PDF engine '+PDF_PIPELINE_BUILD+')');
      await _capLoad(w,_CAP_H2C_CDN,'html2canvas');
      // S398: pdf-lib MUST instantiate in the MAIN window. Inside the
      // window.open('') popup realm, PDFDocument.create() yields a corrupt
      // page-tree Count (NaN) so every addPage throws "page ... type NaN".
      // Proven on-device: main-window addPage OK, popup addPage NaN. html2canvas
      // still runs against the popup DOM (it only reads nodes); the resulting
      // canvas dataURL is a plain string that crosses the window boundary fine.
      await _capLoad(window,_CAP_PDFLIB_CDN,'PDFLib');
      var h2c=w.html2canvas, PDFLib=window.PDFLib;
      _capStatus(D,'Waiting for fonts and photos…');
      try{ if(D.fonts&&D.fonts.ready) await D.fonts.ready; }catch(e){}
      // S402: block until the async minimap/appendix render chain has assigned
      // every real src (was fire-and-forget → capture screenshotted empty imgs).
      try{ await _minimapsReady; }catch(e){}
      var imgs=[].slice.call(D.querySelectorAll('.page img'));
      // Wait for every image to actually DECODE (not just "complete"). A failed
      // or still-empty img reports complete=true, naturalWidth=0 and its load
      // listener never fires again — so poll for real pixels with a bounded wait,
      // then force decode(). This is what makes the PDF match the preview.
      await Promise.all(imgs.map(function(im){
        return new Promise(function(resolve){
          var tries=0;
          (function check(){
            if(im.naturalWidth>0){
              if(im.decode){ im.decode().then(resolve).catch(resolve); } else { resolve(); }
              return;
            }
            if(!im.getAttribute('src')){ // src not assigned yet — keep waiting
              if(tries++>200){ resolve(); return; } // ~10s ceiling, never hang
              setTimeout(check,50); return;
            }
            // src present but not yet decoded: wait on load/error, re-check
            var done=false;
            function onEvt(){ if(done)return; done=true; setTimeout(check,0); }
            im.addEventListener('load',onEvt,{once:true});
            im.addEventListener('error',function(){ if(done)return; done=true; resolve(); },{once:true});
            if(tries++>200){ resolve(); return; }
            setTimeout(function(){ if(!done){ done=true; check(); } },200);
          })();
        });
      }));
      var pages=[].slice.call(D.querySelectorAll('.page'));var _crbFieldIdx=0;
      if(!pages.length){ _capStatus(D,'Nothing to export.'); return; }
      // S400: keep the export bar visible during render (was display:none, which
      // made the button vanish). The green status strip shows page progress; the
      // @media print rule hides #pdf-btn-bar in the actual PDF, so this is safe.
      var pdfDoc=await PDFLib.PDFDocument.create();
      // S395: pdf-lib 1.17.1 can load with a corrupt page-tree Count (returns NaN),
      // making every addPage throw a "'page' ... type NaN" internal error even on
      // valid dimensions. If the fresh doc's page count is not a clean 0, rebuild
      // the document so the page tree is sane before we add pages.
      try{
        var _pc=pdfDoc.getPageCount();
        if(typeof _pc!=='number'||!isFinite(_pc)){ pdfDoc=await PDFLib.PDFDocument.create(); }
      }catch(_shim){ try{ pdfDoc=await PDFLib.PDFDocument.create(); }catch(_s2){} }
      // S498d: one standard font for the invisible text layer (zero embed
      // bytes — Helvetica ships with every PDF viewer). Failure is loud, not
      // fatal: the export still produces a correct-looking PDF without the
      // search layer, and the console says exactly what was lost.
      // S498e: REAL text needs custom fonts (Carlito, metric-compatible with
      // Calibri) which need fontkit registered in PDFLib's realm (the MAIN
      // window — PDFLib comes from window, not the popup). Degrades in steps:
      // vector (real text) → search (S498d invisible Helvetica) → off.
      var _txtFont=null;
      var _txtMode='off', _txtFaces={};
      // S499c export text self-check accumulators (verifier runs after save).
      var _vfyStr={}, _vfyOverlap=0, _vfyOvSamp=[];
      try{
        await _capLoad(window,new URL('../../vendor/fontkit.umd.min.js',import.meta.url).href,'fontkit');
        pdfDoc.registerFontkit(window.fontkit);
        var _fkeys=['r','b','i','bi','blair','arial'];
        var _fbytes=await Promise.all(_fkeys.map(_txtFetchFace));
        // S499a: subset MUST stay false. fontkit's TrueType subsetter emits
        // corrupt glyph outlines for Carlito (measured: 84/97 glyphs
        // unparseable in the S498f field export; reproduced in Node with the
        // same vendored fontkit + the same TTFs - 42/59 corrupt). Viewers
        // reject the font and paint NO text; search/extract still work because
        // the ToUnicode map is intact, so the failure is invisible to
        // structural checks. subset:false embeds the shipped TTF byte-intact
        // (0 corrupt glyphs, pixel-verified).
        // S499d: ligatures off via pdf-lib's DOCUMENTED features option
        // (replaces the S499b font-table byte patch - same result, proven
        // identical across all faces and the full report vocabulary, but
        // supported API rather than surgery on the font). Without this,
        // fontkit joins t+i into one ligature glyph that has no codepoint,
        // so pdf-lib - which builds the PDF width table from the character
        // map - records no width for it and viewers guess ~2x too wide:
        // the half-character hole after every "ti" in the report.
        // S692 — ONE setting, read by BOTH the exporter and the self-check
        // below. Before this, each carried its own copy of the intent: the
        // exporter switched the joining off, the verifier measured the font
        // WITHOUT switching it off, and then reported the joining as active —
        // on every single export, to every inspector in the field. Nothing was
        // wrong with the file; the two halves were simply asking different
        // questions. Keep this as the single source of truth: a checker that
        // tests a different configuration than the one shipped is worse than
        // no checker, because it trains people to ignore a real warning.
        var _LIGA_OFF={liga:false,dlig:false,clig:false,rlig:false,hlig:false,ccmp:false,calt:false};
        for(var _fi=0;_fi<_fkeys.length;_fi++){
          _txtFaces[_fkeys[_fi]]=await pdfDoc.embedFont(_fbytes[_fi],
            {subset:false,features:_LIGA_OFF});
        }
        _txtCover=_txtBuildCover(_txtFaces);
        _txtMode='vector';
      }catch(_tf1){
        try{ console.warn('[PDF] real-text fonts unavailable ('+(_tf1&&_tf1.message)+') - falling back to invisible search layer'); }catch(_){}
        try{ _txtFont=await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica); _txtMode='search'; }
        catch(_tf0){ try{ console.warn('[PDF] text layer disabled - font embed failed:',_tf0&&_tf0.message); }catch(_){} }
      }
      // ascent/em per face for baseline placement (fontkit font object).
      function _txtAsc(f){ try{ return f.embedder.font.ascent/f.embedder.font.unitsPerEm; }catch(_e){ return 0.79; } }

      for(var i=0;i<pages.length;i++){
        _capStatus(D,'Rendering page '+(i+1)+' of '+pages.length+'…');
        var pageEl=pages[i];
        var ew=pageEl.offsetWidth, eh=pageEl.offsetHeight;
        // Fall back to a Letter element box if the element couldn't be measured
        // (auto-height appendix pages, off-screen pages, zero-size, etc.).
        if(!isFinite(ew)||ew<=0) ew=816;   // 8.5in @96dpi
        if(!isFinite(eh)||eh<=0) eh=1056;  // 11in  @96dpi
        // ── S497d PHOTO OVERLAYS — the actual fix for "preview crisp, PDF
        // blurry". Each .dp photo tile is loaded from its real source
        // (720-960px per tier), centre cover-cropped to the tile's aspect,
        // embedded as its OWN JPEG object, and later drawn over the page
        // raster at the tile's exact position (same rect→PDF-point mapping
        // the link annotations already use). Order matters for safety: the
        // tile is only blanked out of the raster AFTER its replacement is
        // successfully embedded — a photo that fails to load or embed keeps
        // its rastered look instead of leaving a grey hole.
        var _phOverlays=[];
        // S498b: tiles blanked for the overlay pass, with their original inline
        // styles, so the LIVE preview can be restored after the PDF is built.
        var _phRestore=[];
        // One restorer, called on EVERY exit from this page — success or the
        // two `continue` paths below. A page that fails to render must not
        // leave the preview's photos blanked (that is what made the export
        // look like it destroyed the photos).
        var _phPutBack=function(){
          if(!_phRestore.length) return;
          try{
            _phRestore.forEach(function(t){
              try{
                if(t.bg!==undefined)t.el.style.backgroundImage=t.bg||'';
                if(t.bc!==undefined)t.el.style.backgroundColor=t.bc||'';
                if(t.col!==undefined)t.el.style.color=t.col||'';
                if(t.bd!==undefined)t.el.style.borderColor=t.bd||'';
              }catch(_e1){}
            });
          }catch(_rs){}
          _phRestore=[];
        };
        try{
          // S497g — CRB thread photos (.rphoto) join the overlay path. Two
          // differences from .dp that the code must respect:
          //  1. CAPTIONS live INSIDE the tile as white text. The overlay would
          //     cover them, so a captioned tile keeps its text by drawing the
          //     photo FIRST and leaving the caption in the raster on top — we
          //     do that by NOT blanking captioned tiles' text, only their
          //     background image (textContent stays, so html2canvas still
          //     paints the caption over our JPEG).
          //  2. .rphoto has a decorative SVG PLACEHOLDER as its CSS background
          //     when no url exists. That is a data: URL and must never be
          //     upscaled into a "photo" — only tiles whose background is a real
          //     http(s)/blob/data-photo source are overlaid.
          var _tiles=[].slice.call(pageEl.querySelectorAll('.dp, .rphoto'));
          for(var _ti=0;_ti<_tiles.length;_ti++){
            var _tile=_tiles[_ti];
            var _bg=(_tile.style&&_tile.style.backgroundImage)||'';
            var _bm=/url\(["']?([^"')]+)["']?\)/.exec(_bg);
            if(!_bm||!_bm[1]) continue;             // placeholder tile — skip
            var _turl=_bm[1];
            // S497g: .rphoto's empty state is a decorative inline SVG. Never
            // treat it as a photograph — it would be upscaled into a blurry
            // "image" and would also replace the caption backdrop.
            if(/^data:image\/svg/i.test(_turl)) continue;
            var _tim=await new Promise(function(res){
              var im=new Image();
              if(!/^data:/.test(_turl)) im.crossOrigin='anonymous';
              im.onload=function(){res(im);}; im.onerror=function(){res(null);};
              im.src=_turl;
            });
            if(!_tim||!_tim.naturalWidth||!_tim.naturalHeight) continue;
            var _tr=_tile.getBoundingClientRect();
            /* ═══ S692 — MEASURE THE TILE AND ITS PAGE IN THE SAME BREATH. ═══
               getBoundingClientRect is measured from the VIEWPORT, not from the
               page. The tile was measured here, but the page it belongs to was
               measured much later, at draw time — and html2canvas scrolls the
               document while it rasterises. Any scrolling between the two
               readings became a straight offset in the placement: photographs
               landing below their card on one page and printed ON TOP of the
               paragraph text on another (7155.34 FRT #2, pages 4 and 5, sent
               to a client in that state).

               Storing the position as a FRACTION of the page, taken from a page
               reading in this same tick, makes the placement immune to whatever
               the document does afterwards — scrolling, zooming or reflowing.
               Never reintroduce a raw viewport rect here: it is only valid for
               the instant it was taken. */
            var _pprNow=pageEl.getBoundingClientRect();
            if(_tr.width<4||_tr.height<4) continue;
            var _tfx=(_tr.left-_pprNow.left)/(_pprNow.width||1);
            var _tfy=(_tr.top-_pprNow.top)/(_pprNow.height||1);
            var _tfw=_tr.width/(_pprNow.width||1);
            var _tfh=_tr.height/(_pprNow.height||1);
            var _tt=_qTierDef();
            // centre cover-crop the source to the tile's aspect
            var _ar=_tr.width/_tr.height, _sw=_tim.naturalWidth, _sh=_tim.naturalHeight;
            var _cw2,_ch2,_sx3,_sy3;
            if(_sw/_sh>_ar){ _ch2=_sh; _cw2=Math.max(1,Math.round(_sh*_ar)); _sx3=Math.round((_sw-_cw2)/2); _sy3=0; }
            else{ _cw2=_sw; _ch2=Math.max(1,Math.round(_sw/_ar)); _sx3=0; _sy3=Math.round((_sh-_ch2)/2); }
            // tier resolution at the printed cell; never upscale the source
            var _ow=Math.min(_cw2, Math.round(PDF_PHOTO_CELL_IN.w*(_tt.photoDpi||300)));
            var _oh=Math.max(1,Math.round(_ow/_ar));
            var _cv=document.createElement('canvas'); _cv.width=_ow; _cv.height=_oh;
            var _cx2=_cv.getContext('2d');
            _cx2.drawImage(_tim,_sx3,_sy3,_cw2,_ch2,0,0,_ow,_oh);
            // S497g: a CRB caption lives INSIDE the tile as white text. The
            // overlay would hide it and the raster can't be drawn on top (it
            // is opaque), so the caption is baked into the overlay itself,
            // mirroring .rphoto's styling: bold white, bottom-left, dark
            // scrim for legibility on bright photos. Scaled to the overlay's
            // own pixel size so it stays sharp at any tier.
            var _cap=(_tile.textContent||'').trim();
            if(_cap){ try{
              var _fpx=Math.max(9, Math.round(_oh*0.052));
              _cx2.font='700 '+_fpx+'px Calibri, sans-serif';
              _cx2.textBaseline='alphabetic';
              var _bh2=Math.round(_fpx*1.9);
              _cx2.fillStyle='rgba(0,0,0,0.42)';
              _cx2.fillRect(0,_oh-_bh2,_ow,_bh2);
              _cx2.fillStyle='#ffffff';
              _cx2.fillText(_cap, Math.round(_fpx*0.6), _oh-Math.round(_bh2*0.32), _ow-Math.round(_fpx*1.2));
            }catch(_cp){} }
            var _jb;
            try{ _jb=await pdfDoc.embedJpg(_cv.toDataURL('image/jpeg',_tt.photoQ||0.85)); }
            catch(_ej){ _cv.width=0;_cv.height=0; continue; }
            _cv.width=0;_cv.height=0;
            _phOverlays.push({rect:_tr,fx:_tfx,fy:_tfy,fw:_tfw,fh:_tfh,img:_jb});   // S692: fx/fy/fw/fh are page fractions
            // Blank ONLY the background image so the photo isn't rastered
            // twice, and hide the tile's own caption text — it now lives
            // inside the overlay JPEG, so leaving it here would double-print
            // it (raster copy sitting under the sharp baked copy).
            // S498b: remember the tile's ORIGINAL inline values first so the
            // live preview can be put back exactly as it was once the PDF is
            // built. Without this the preview keeps the blanked look until the
            // user reloads, which reads as "the export broke my photos"
            // (Mark reported exactly that). Restored in _phRestore below.
            _phRestore.push({
              el:_tile,
              bg:_tile.style.backgroundImage,
              bc:_tile.style.backgroundColor,
              col:_tile.style.color
            });
            _tile.style.backgroundImage='none';
            _tile.style.backgroundColor='#ECEAE6';
            if(_cap) _tile.style.color='transparent';
          }
        }catch(_po){ _phOverlays=[]; }
        // ── S498e: REAL-TEXT pre-capture pass ─────────────────────────────
        // Collect every word's position/style NOW (colors still real, photo
        // captions already transparent so they self-exclude), then hide the
        // glyphs from the raster. color:transparent is the only hiding h2c
        // honours (measured; -webkit-text-fill-color is ignored). Backgrounds
        // and borders keep rasterising; only glyph pixels move to the vector
        // pass after the fields. Restore rides _phPutBack on every exit.
        var _txtWords=null,_txtPr=null;
        if(_txtMode==='vector'){ try{
          var _tc=_collectTextWords(pageEl);
          _txtWords=_tc.words;
          _txtPr=pageEl.getBoundingClientRect();
          _txtPr={left:_txtPr.left,top:_txtPr.top,width:_txtPr.width,height:_txtPr.height};
          _tc.els.forEach(function(elh){
            _phRestore.push({el:elh,col:elh.style.color});
            elh.style.color='transparent';
          });
        }catch(_tw){ _txtWords=null;
          try{ console.warn('[PDF] text collect failed on page '+(i+1)+':',_tw&&_tw.message); }catch(_){} } }
        // ── S498e: CHECKBOX SQUARES leave the raster ──────────────────────
        // Root fix for the "two checkboxes side by side" report (Shaun, via
        // Mark, PDF-XChange): the raster carried the DOM's painted square AND
        // the AcroForm widget drew its own. Adobe/Chrome paint our widget
        // appearance exactly over the raster square so it looked single;
        // PDF-XChange substitutes its own widget appearance beside it —
        // BOTH visible. The widget is now the ONLY checkbox: the DOM square
        // is blanked out of the capture, so every viewer draws exactly one
        // box — its own. Restore rides _phPutBack.
        try{
          [].slice.call(pageEl.querySelectorAll('[data-crbopt]')).forEach(function(bxEl){
            _phRestore.push({el:bxEl,bc:bxEl.style.backgroundColor,bd:bxEl.style.borderColor});
            bxEl.style.backgroundColor='transparent';
            bxEl.style.borderColor='transparent';
          });
        }catch(_bx){}
        // S497b — THE actual photo-quality fix (Mark: "picked Max, PDF photos
        // still blurry, preview crisp"). Body pages export as whole-page
        // rasters, so photo sharpness is set by THIS scale, not by the photo
        // JPEGs embedded in the DOM: at scale 2 a 3-across cell is ~460 px
        // (~192 DPI printed) for every tier — the dropdown could not matter.
        // Photo-bearing Letter pages now raster at scale 3 (~288 DPI cell) and
        // encode as JPEG at the tier's photoQ: photographic pages in PNG were
        // also why 23 pages weighed 13 MB. Text-only and appendix pages keep
        // scale 2 + PNG (crisp line work, small, and no 24×36 scale-3 canvas
        // memory bomb — appendix sheets carry .app-dwg, not .dp-grid).
        // S497d — pages return to uniform scale-2 PNG. Two rounds of "raster
        // the page sharper" (S497b/c) proved the dead end: photos inside a
        // page screenshot can never match the preview, whatever the scale.
        // Photos are now drawn OVER the raster as their own tier-resolution
        // JPEG objects (see _phOverlays below), so the raster only needs to
        // carry crisp text — and the photo tiles are blanked before capture
        // so their pixels aren't paid for twice.
        var canvas=await h2c(pageEl,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false,width:ew,height:eh,windowWidth:ew,windowHeight:eh,scrollX:0,scrollY:0});
        var cssW=(canvas.width||ew*2)/2, cssH=(canvas.height||eh*2)/2;
        var pw=(cssW/96)*72, ph=(cssH/96)*72;
        if(!isFinite(pw)||pw<=0) pw=612;   // 8.5in in points
        if(!isFinite(ph)||ph<=0) ph=792;   // 11in  in points
        var png;
        try{ png=await pdfDoc.embedPng(canvas.toDataURL('image/png')); }
        catch(ep){ _phPutBack(); _capStatus(D,'Skipped a blank page ('+(i+1)+').'); continue; }
        var pg;
        var _pwN=Number(pw), _phN=Number(ph);
        if(!isFinite(_pwN)||_pwN<=0)_pwN=612;
        if(!isFinite(_phN)||_phN<=0)_phN=792;
        try{ pg=pdfDoc.addPage([_pwN,_phN]); }
        catch(eap){
          try{console.warn('[PDF] Skipped page '+(i+1)+' (render error):',eap&&eap.message);}catch(_){}
          _phPutBack();
          _capStatus(D,'Skipped a page that failed to render ('+(i+1)+').');
          continue;
        }
        pg.drawImage(png,{x:0,y:0,width:pw,height:ph});
        // S497g: photos over the raster (the raster is captured on an OPAQUE
        // white background, so it must go down first or it would erase every
        // photo). Captioned CRB tiles therefore need their caption re-drawn
        // ON TOP of the photo — handled below via o.cap.
        if(_phOverlays.length){ try{
          var _ppr=pageEl.getBoundingClientRect();
          var _psx=pw/(_ppr.width||cssW), _psy=ph/(_ppr.height||cssH);
          _phOverlays.forEach(function(o){
            /* S692 — placement comes from the fraction captured beside the
               tile's own page reading. The page rect above is no longer part
               of the photo maths: by this point html2canvas has run and the
               document may have scrolled, which is exactly how photographs
               ended up over the text. Older overlays with no fraction (none
               are produced now) fall back to the previous behaviour. */
            var _hasFr=(typeof o.fw==='number'&&o.fw>0);
            var _x0=_hasFr? o.fx*pw : (o.rect.left-_ppr.left)*_psx;
            var _yT=_hasFr? o.fy*ph : (o.rect.top-_ppr.top)*_psy;
            var _ww=_hasFr? o.fw*pw : o.rect.width*_psx;
            var _hh=_hasFr? o.fh*ph : o.rect.height*_psy;
            if(!isFinite(_x0)||!isFinite(_yT)||_ww<=0||_hh<=0) return;
            // S498 FIX: PDF coordinates are BOTTOM-UP; getBoundingClientRect is
            // TOP-DOWN. This flip was missing and the draw referenced an
            // undefined `_yB`, so EVERY photo overlay threw a ReferenceError on
            // the first tile, the forEach aborted, and the enclosing catch
            // swallowed it silently — every photo in every deficiency exported
            // as a grey placeholder while the preview looked correct. Same
            // conversion the link-annotation block below uses (yBottom).
            var _yB=ph-(_yT+_hh);
            if(!isFinite(_yB)) return;
            pg.drawImage(o.img,{x:_x0,y:_yB,width:_ww,height:_hh});
          });
        }catch(_od){} }
        // S498b: put the LIVE preview back exactly as it was. Outside the
        // draw's catch, so a draw failure can never strand the blanked state.
        _phPutBack();
        try{
          var pr=pageEl.getBoundingClientRect();
          var sx=pw/(pr.width||cssW), sy=ph/(pr.height||cssH);
          var links=[].slice.call(pageEl.querySelectorAll('a[href]'));
          links.forEach(function(a){
            var href=a.getAttribute('href')||'';
            if(!/^https?:\/\//i.test(href))return;
            var r=a.getBoundingClientRect();
            if(r.width<2||r.height<2)return;
            var x0=(r.left-pr.left)*sx, yTop=(r.top-pr.top)*sy, lw=r.width*sx, lh=r.height*sy;
            var yBottom=ph-(yTop+lh);
            var ctx=pdfDoc.context;
            var annot=ctx.obj({Type:'Annot',Subtype:'Link',Rect:[x0,yBottom,x0+lw,yBottom+lh],Border:[0,0,0],A:ctx.obj({Type:'Action',S:'URI',URI:PDFLib.PDFString.of(href)})});
            var ref=ctx.register(annot);
            var ex=pg.node.Annots&&pg.node.Annots();
            if(ex&&ex.push)ex.push(ref); else pg.node.set(PDFLib.PDFName.of('Annots'),ctx.obj([ref]));
          });
          // Contractor Response fillable AcroForm widgets (S451):
          // status = four SQUARE checkboxes (native square shape, matches preview),
          // made one-per-round via a MouseUp JavaScript action that clears siblings
          // (exclusive in Adobe/XChange; degrades to independent in JS-less viewers).
          // comment = multiline text field, fixed 10pt, shrink-only on overflow.
          // Blue-tinted look (#EEF3FA fill / #4A5568 border) per LOCKED_CONTRACTOR_RESPONSE §1.6.
          try{
            var _form=pdfDoc.getForm();
            var _ctx=pdfDoc.context;
            var _fFill=PDFLib.rgb(0.933,0.953,0.980);   // #EEF3FA
            var _fBord=PDFLib.rgb(0.290,0.333,0.408);   // #4A5568
            [].slice.call(pageEl.querySelectorAll('[data-crbgroup]')).forEach(function(gEl){
              _crbFieldIdx++;
              // S463: prefer stable item identity (obs.id stamped by the live
              // path) over the sequential counter; counter remains the fallback
              // for the sample-preview path (attribute still "1").
              var _gAttr=gEl.getAttribute('data-crbgroup');
              var _gi=(_gAttr&&_gAttr!=='1')?_gAttr:_crbFieldIdx;
              // Field name per option: resp_{obsId|idx}_status_{Option} (import-mappable).
              var _opts=[].slice.call(gEl.querySelectorAll('[data-crbopt]'));
              var _names=_opts.map(function(o){
                return 'resp_'+_gi+'_status_'+String(o.getAttribute('data-crbopt')||'').replace(/[^A-Za-z0-9]+/g,'_');
              });
              _opts.forEach(function(o,oi){
                var rr=o.getBoundingClientRect(); if(rr.width<2||rr.height<2)return;
                var ox=(rr.left-pr.left)*sx, oy=(rr.top-pr.top)*sy, ow=rr.width*sx, oh=rr.height*sy;
                try{
                  var _cb=_form.createCheckBox(_names[oi]);
                  _cb.addToPage(pg,{x:ox,y:ph-(oy+oh),width:ow,height:oh,backgroundColor:_fFill,borderColor:_fBord,borderWidth:1.5});
                  // MouseUp JS: when this box goes on, clear the other three.
                  var _others=_names.filter(function(_,j){return j!==oi;});
                  var _js="var me=this.getField('"+_names[oi]+"');"
                        + "if(me&&me.value!='Off'){"
                        + _others.map(function(n){return "var f=this.getField('"+n+"');if(f)f.checkThisBox(0,false);";}).join('')
                        + "}";
                  var _w=_cb.acroField.getWidgets()[0];
                  _w.dict.set(PDFLib.PDFName.of('AA'),_ctx.obj({U:_ctx.obj({S:PDFLib.PDFName.of('JavaScript'),JS:PDFLib.PDFString.of(_js)})}));
                }catch(_ecb){}
              });
            });
            [].slice.call(pageEl.querySelectorAll('[data-crbcomment]')).forEach(function(cEl){
              var rr=cEl.getBoundingClientRect(); if(rr.width<2||rr.height<2)return;
              _crbFieldIdx++;
              // S463: same identity rule as the status group above.
              var _cAttr=cEl.getAttribute('data-crbcomment');
              var _ci=(_cAttr&&_cAttr!=='1')?_cAttr:_crbFieldIdx;
              var cx=(rr.left-pr.left)*sx, cy=(rr.top-pr.top)*sy, cw=rr.width*sx, chh=rr.height*sy;
              try{
                var _tf=_form.createTextField('resp_'+_ci+'_comment');
                _tf.enableMultiline();
                _tf.addToPage(pg,{x:cx,y:ph-(cy+chh),width:cw,height:chh,backgroundColor:_fFill,borderColor:_fBord,borderWidth:1.5});
                // Option B (S455): fixed 10pt, shrink-ONLY on overflow. The old
                // setFontSize(0) was full auto-size AND was called before addToPage,
                // so it threw MissingDAEntry (swallowed) — the field had NO explicit
                // size and the reader auto-grew a 9-char comment to fill the box.
                // These MUST run AFTER addToPage (that's when the /DA entry exists).
                // Fixed 10pt (matches the printed .ffield 4-row @10pt art) holds steady
                // for normal comments; disableScrolling() lets a compliant reader
                // (Acrobat/XChange) auto-shrink ONLY if a long comment overflows the 4
                // rows — never grows above 10pt. Honors LOCKED_CONTRACTOR_RESPONSE §1.6.
                try{ _tf.setFontSize(10); }catch(_fs){}
                try{ _tf.disableScrolling(); }catch(_ds){}
              }catch(_ec){}
            });
          }catch(_cw){}
        }catch(e){}
        // ── S498e: TEXT for this page ─────────────────────────────────────
        // vector mode: draw every collected word VISIBLY in Carlito at its
        // measured position/size/color — the crisp glyphs Mark asked for.
        // search mode (font fallback): the S498d invisible Helvetica layer,
        // width-capped per run so selection can no longer reach into empty
        // space (Mark: header selection overshot). Failures COUNT and LOG.
        if(_txtMode==='vector'&&_txtWords&&_txtWords.length){ try{
          var _vsx=pw/(_txtPr.width||cssW), _vsy=ph/(_txtPr.height||cssH);
          // S498f (Shaun's broken export, root cause): POSITION mapping is a
          // fraction of the page rect, so any uniform visual scale on the page
          // (display scaling, fit-to-window, zoom counter-transforms) cancels
          // out. SIZE did NOT cancel: it multiplied LAYOUT px (computed
          // font-size) by VISUAL geometry (ph/rect.height), so a page shown at
          // scale s drew every word 1/s too large - words collided, ran into
          // photo strips, labels cramped ("SprinklerUpgrade"), while the
          // raster underneath stayed correct. Mark's machine (s=1, and his
          // export fell back to search mode anyway) never showed it. Fix:
          // size and letter-spacing convert layout px -> points DIRECTLY
          // (72/96 via pw/cssW), touching no visual geometry at all.
          var _vpt=pw/(cssW||816);
          var _vFail=0;
          // ═══ S499c SELF-CHECK (pin-15 family): no two words may occupy the
          // same spot. Sorted top-window scan; >70% mutual overlap in BOTH
          // axes = collector geometry error. Detection only - never blocks.
          try{
            var _ov=_txtWords.slice().sort(function(a,b){return a.top-b.top||a.l-b.l;});
            for(var _oa=0;_oa<_ov.length;_oa++){
              var _wA=_ov[_oa];
              for(var _ob=_oa+1;_ob<_ov.length;_ob++){
                var _wB=_ov[_ob];
                if(_wB.top>=_wA.top+_wA.h*0.7)break;
                var _ix=Math.min(_wA.l+_wA.w,_wB.l+_wB.w)-Math.max(_wA.l,_wB.l);
                var _iy=Math.min(_wA.top+_wA.h,_wB.top+_wB.h)-Math.max(_wA.top,_wB.top);
                if(_ix>0.7*Math.min(_wA.w,_wB.w)&&_iy>0.7*Math.min(_wA.h,_wB.h)){
                  _vfyOverlap++;
                  if(_vfyOvSamp.length<2)_vfyOvSamp.push(_wA.t+'~'+_wB.t);
                }
              }
            }
          }catch(_ovE){}
          _txtWords.forEach(function(wd){
            var _fk=(wd.famKey&&wd.famKey!=='cal')?wd.famKey
                    :((wd.bold?'b':'')+(wd.ital?'i':'')||'r');
            var face=_txtFaces[_fk]||_txtFaces.r;
            (_vfyStr[_fk]||(_vfyStr[_fk]=Object.create(null)))[wd.t]=1;
            var size=wd.fs*_vpt;
            if(!isFinite(size)||size<=0)return;
            var x=(wd.l-_txtPr.left)*_vsx;
            var yBase=ph-(((wd.top-_txtPr.top)*_vsy)+(wd.fs*_txtAsc(face)*_vpt));
            if(!isFinite(x)||!isFinite(yBase))return;
            var col=PDFLib.rgb(wd.cr,wd.cg,wd.cb);
            function draw(str,dx){
              pg.drawText(str,{x:x+dx,y:yBase,size:size,font:face,color:col,opacity:wd.ca});
            }
            function drawSafe(str,dx){
              try{ draw(str,dx); return true; }
              catch(_e1){
                var s2=_txtSanitizeWinAnsi(str);
                if(s2){ try{ draw(s2,dx); return true; }catch(_e2){} }
                _vFail++; return false;
              }
            }
            // synthesized bullet: ::marker died with the hide (inherits color,
            // measured) — draw a real \u2022 ending one space before the word,
            // exactly where Chrome lays the marker text.
            if(wd.mk){
              try{
                var mAdv=face.widthOfTextAtSize('\u2022 ',size);
                pg.drawText('\u2022',{x:Math.max(0,x-mAdv),y:yBase,size:size,font:face,
                  color:PDFLib.rgb(wd.mr!==undefined?wd.mr:wd.cr,wd.mg!==undefined?wd.mg:wd.cg,wd.mb!==undefined?wd.mb:wd.cb)});
              }catch(_mk){}
            }
            if(wd.ls>0.05){
              // letter-spaced label (e.g. CONTRACTOR RESPONSE): reproduce the
              // CSS tracking with the PDF's native character-spacing operator
              // (Tc) so the word remains ONE text object — per-character draws
              // broke word grouping and Ctrl+F could not find the label
              // (measured in pdfium, Chrome's engine). Falls back to per-char
              // placement only if this pdf-lib build lacks the operator.
              var lsPt=wd.ls*_vpt;   /* S498f: layout px -> pt, scale-immune */
              if(PDFLib.setCharacterSpacing){
                try{
                  pg.pushOperators(PDFLib.setCharacterSpacing(lsPt));
                  drawSafe(wd.t,0);
                }finally{
                  try{ pg.pushOperators(PDFLib.setCharacterSpacing(0)); }catch(_t0){}
                }
              }else{
                var cx=0;
                for(var ci=0;ci<wd.t.length;ci++){
                  var ch=wd.t[ci];
                  if(!drawSafe(ch,cx))break;
                  try{ cx+=face.widthOfTextAtSize(ch,size)+lsPt; }
                  catch(_wz){ cx+=size*0.55+lsPt; }
                }
              }
            }else{
              drawSafe(wd.t,0);
            }
          });
          if(_vFail){ try{ console.warn('[PDF] real-text: '+_vFail+' of '+_txtWords.length+' words failed on page '+(i+1)); }catch(_){} }
        }catch(_vt){ try{ console.warn('[PDF] real-text failed on page '+(i+1)+':',_vt&&_vt.message); }catch(_){} } }
        else if(_txtMode==='search'&&_txtFont){ try{
          var _tpr=pageEl.getBoundingClientRect();
          var _tsx=pw/(_tpr.width||cssW), _tsy=ph/(_tpr.height||cssH);
          var _truns=_collectTextWords(pageEl).words;
          var _tFail=0;
          _truns.forEach(function(run){
            var s=_txtSanitizeWinAnsi(run.t);
            if(!s)return;
            var fsPt=Math.max(4,Math.min(36,run.fs*(pw/(cssW||816))));   /* S498f: scale-immune */
            // width cap: never let invisible Helvetica overrun the word box
            try{ var hw=_txtFont.widthOfTextAtSize(s,fsPt), tw=run.w*_tsx;
                 if(hw>tw&&hw>0) fsPt=Math.max(3,fsPt*tw/hw); }catch(_wc){}
            var x=(run.l-_tpr.left)*_tsx;
            var y=ph-(((run.top-_tpr.top)+run.h*0.8)*_tsy);
            if(!isFinite(x)||!isFinite(y))return;
            try{ pg.drawText(s,{x:x,y:y,size:fsPt,font:_txtFont,opacity:0}); }
            catch(_td){ _tFail++; }
          });
          if(_tFail){ try{ console.warn('[PDF] text layer: '+_tFail+' of '+_truns.length+' runs failed on page '+(i+1)); }catch(_){} }
        }catch(_tl){ try{ console.warn('[PDF] text layer failed on page '+(i+1)+':',_tl&&_tl.message); }catch(_){} } }
      }
      _capStatus(D,'Saving PDF…');
      // ── S470: export identity stamp (re-import protection) ──────────────
      // A hidden, read-only text field carrying a unique id for THIS export.
      // The importer keys duplicate detection on (exportId, obsId) — so the
      // same PDF re-sent with MORE items filled imports the new items and
      // skips the already-imported ones, instead of silently duplicating
      // rounds. Hidden (/F 2) + read-only so fill apps carry it untouched.
      try{
        var _expId='exp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
        var _idForm=pdfDoc.getForm();
        var _idF=_idForm.createTextField('arencon_export_id');
        _idF.setText(_expId);
        _idF.enableReadOnly();
        var _pg0=pdfDoc.getPage(0);
        _idF.addToPage(_pg0,{x:1,y:1,width:1,height:1,borderWidth:0});
        try{
          var _idW=_idF.acroField.getWidgets()[0];
          _idW.dict.set(PDFLib.PDFName.of('F'),PDFLib.PDFNumber.of(2));   // hidden
        }catch(_ih){}
      }catch(_eid){}
      // ── S509 (Mark): DRAFT COPY watermark. A working copy must be
      // unmistakable if it ever escapes by email — large, grey, diagonal,
      // on EVERY page, drawn into the PDF bytes themselves (a CSS overlay
      // would not survive this capture pipeline). Issued copies get nothing.
      if(!_issuedCopy){
        try{
          var _wmFont=null;
          try{ _wmFont=(_txtFaces&&(_txtFaces.bold||_txtFaces.reg))||_txtFont||null; }catch(_wf){}
          if(!_wmFont){ try{ _wmFont=await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold); }catch(_wf2){} }
          if(_wmFont){
            var _wmTxt='DRAFT COPY';
            pdfDoc.getPages().forEach(function(_wp){
              var _pw=_wp.getWidth(),_ph=_wp.getHeight();
              var _ang=Math.atan2(_ph,_pw);                       // along the page diagonal
              var _sz=Math.min(_pw,_ph)*0.16;
              var _tw=_wmFont.widthOfTextAtSize(_wmTxt,_sz);
              var _diag=Math.sqrt(_pw*_pw+_ph*_ph);
              if(_tw>_diag*0.82){ _sz*= (_diag*0.82)/_tw; _tw=_wmFont.widthOfTextAtSize(_wmTxt,_sz); }
              var _cx=_pw/2,_cy=_ph/2;
              _wp.drawText(_wmTxt,{
                x:_cx-(_tw/2)*Math.cos(_ang)+(_sz*0.36)*Math.sin(_ang),
                y:_cy-(_tw/2)*Math.sin(_ang)-(_sz*0.36)*Math.cos(_ang),
                size:_sz,font:_wmFont,
                rotate:PDFLib.degrees(_ang*180/Math.PI),
                color:PDFLib.rgb(0.58,0.57,0.61),                 // grey (ink-2 family), per Mark
                opacity:0.22
              });
            });
          }
        }catch(_wm){try{console.error('[S509 watermark]',_wm);}catch(_w2){}}
      }
      var bytes=await pdfDoc.save();
      // ═══ S499c EXPORT TEXT SELF-CHECK ═══ Runs on EVERY export; never
      // blocks or alters the file. Catches the three defect families that
      // shipped invisible in S498f/S499a: (1) glyph substitution re-enabled
      // (the ti-ligature class - string length vs glyph count must be 1:1
      // with GSUB neutralized); (2) any drawn glyph missing from the
      // produced file's own /W width tables (the exact mechanism of the
      // half-character ti gaps - checked against the REAL bytes, not
      // pdf-lib's intentions); (3) characters the font cannot draw
      // (notdef -> tofu). Overlapping words (pin-15 family) are counted
      // during the page loop above. Any failure paints the status bar
      // burgundy and console.error's the specifics.
      if(_txtMode==='vector'){
        try{
          var _vErr=[], _vNotdef=Object.create(null), _vSub=0, _vMiss=Object.create(null), _vGlyphs=0;
          Object.keys(_vfyStr).forEach(function(fk){
            var f=_txtFaces[fk]; if(!f)return;
            var fx=f.embedder&&f.embedder.font; if(!fx||!fx.layout)return;
            // pdf-lib derives the PDF width table from the font's character
            // set (cmap): a glyph only gets a width entry if some codepoint
            // maps to it. The ti-ligature had no codepoint -> no width ->
            // half-character gaps. So the checkable invariant is REACHABILITY:
            // every glyph layout() emits must be the cmap target of a real
            // character. (The saved bytes can't be scanned - pdf-lib packs
            // dictionaries into compressed object streams.)
            var _reach=Object.create(null);
            try{ (fx.characterSet||[]).forEach(function(cp){
              try{ var g=fx.glyphForCodePoint(cp); if(g)_reach[g.id]=1; }catch(_g1){}
            }); }catch(_g0){}
            Object.keys(_vfyStr[fk]).forEach(function(s){
              var run=fx.layout(s,_LIGA_OFF), gl=(run&&run.glyphs)||[];   // S692: same setting the export used
              if(gl.length!==s.length)_vSub++;
              for(var gi=0;gi<gl.length;gi++){
                _vGlyphs++;
                if(gl[gi].id===0)_vNotdef[s.charAt(gi)||'?']=1;
                else if(!_reach[gl[gi].id])_vMiss[gl[gi].id]=1;
              }
            });
          });
          var _missK=Object.keys(_vMiss);
          if(_missK.length)_vErr.push(_missK.length+' glyph(s) with no width entry in the PDF (gid '+_missK.slice(0,5).join(',')+')');
          if(_vSub)_vErr.push(_vSub+' string(s) glyph-substituted \u2014 ligatures active again');
          var _nd=Object.keys(_vNotdef);
          if(_nd.length)_vErr.push('character(s) the PDF font cannot draw: '+_nd.slice(0,8).join(' '));
          if(_vfyOverlap)_vErr.push(_vfyOverlap+' overlapping word pair(s)'+(_vfyOvSamp.length?' e.g. '+_vfyOvSamp.join(', '):''));
          if(_vErr.length){
            try{ console.error('[PDF VERIFY] TEXT SELF-CHECK FAILED \u2014 '+_vErr.join(' | ')); }catch(_c){}
            _capStatus(D,'\u26A0 PDF text self-check flagged: '+_vErr.join(' | ')+' \u2014 report this to Mark');
            try{ var _sEl=D.getElementById('cap-status'); if(_sEl)_sEl.style.background='#9C2742'; }catch(_sc){}
          }else{
            try{ console.log('[PDF VERIFY] text self-check clean \u2014 '+_vGlyphs+' glyphs checked, all widths present, 0 overlaps, 0 unsupported chars'); }catch(_c2){}
          }
        }catch(_vfyE){ try{ console.warn('[PDF VERIFY] self-check errored (export unaffected):',_vfyE&&_vfyE.message); }catch(_c3){} }
      }
      var blob=new Blob([bytes],{type:'application/pdf'});
      var fname=(D.title||'ARENCON Report').replace(/[^\w.-]+/g,' ').replace(/\s+/g,' ').trim()+'.pdf';
      // S400: write to the handle already chosen at the top (fresh-click picker).
      // If we have a handle → write there (the folder/name the user picked). If
      // not (unsupported device, or picker errored non-cancel) → anchor download.
      var _savedViaPicker=false;
      if(_saveHandle){
        try{
          var _ws=await _saveHandle.createWritable();
          await _ws.write(blob);
          await _ws.close();
          _savedViaPicker=true;
        }catch(_wr){ _savedViaPicker=false; } // write failed → fall back to download
      }
      var _awaitingShare=false;
      if(!_savedViaPicker){
        // S43x: mobile can't reliably auto-download a generated file (iOS wants the
        // Share sheet, and the async capture already consumed the tap gesture). So on
        // touch devices we surface a Save/Open button that fires Web Share on a fresh
        // tap; desktop keeps the direct download.
        var _isTouch=(w.matchMedia&&w.matchMedia('(pointer:coarse)').matches);
        var _shareFile=null; try{ _shareFile=new (w.File||File)([blob],fname,{type:'application/pdf'}); }catch(_ff){}
        var _nav=w.navigator||navigator;
        var _canShare=!!(_shareFile&&_nav.canShare&&_nav.share&&_nav.canShare({files:[_shareFile]}));
        if(_isTouch&&_canShare){
          _awaitingShare=true;
          try{
            var sb=D.createElement('button');
            sb.textContent='\uD83D\uDCE5 Save / Open PDF';
            sb.style.cssText='padding:8px 22px;background:#2E9E72;color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;';
            sb.onclick=function(){ try{ _nav.share({files:[_shareFile],title:fname}).catch(function(){}); }catch(_s){} };
            if(bar){bar.appendChild(sb);} else {D.body.insertBefore(sb,D.body.firstChild);}
          }catch(_sb){}
        } else {
          var url=URL.createObjectURL(blob);
          var a=document.createElement('a');a.href=url;a.download=fname;
          document.body.appendChild(a);a.click();a.remove();
          setTimeout(function(){URL.revokeObjectURL(url);},4000);
        }
      }
      if(bar) bar.style.display='';
      _capStatus(D,_awaitingShare?'PDF ready — tap "Save / Open PDF" above to send it to Files or Adobe.':(_savedViaPicker?'Done — PDF saved. It matches this preview exactly.':'Done — PDF downloaded. It matches this preview exactly.'));
      setTimeout(function(){_capHideStatus(D);},4000);
      // ── S480/S509: EXPORT REGISTRY. The choice was made BEFORE generation
      // (see the pre-ask at the top of this function); here it is only
      // recorded. Issuing draws the issued line — a SOFT lock: any inspector
      // can unlock and edit afterwards, with a warning (Mark, S509). A working
      // copy registers as not-issued and its pages already carry the DRAFT
      // COPY watermark.
      try{
        if(typeof _expId==='string'&&_expId&&Model.registerExport){
          Model.registerExport(_expId,!!_issuedCopy);
          if(_issuedCopy){
            var _iin=((Model.getProject&&Model.getProject())||{}).currentFrtInstance||1;
            if(Model.stampThreadIssued) Model.stampThreadIssued(_iin,{});
          }
        }
      }catch(_er){try{console.error('[S480 registry]',_er);}catch(_e3){}}
    }catch(err){
      if(bar) bar.style.display='';
      _capStatus(D,'Export error: '+(err&&err.message?err.message:err));
      try{console.error('[capture export]',err);}catch(e){}
    }
  })();
}

/* Public surface. Bridged onto window by each host shell (Diesel's builds are
   classic scripts and cannot import an ES module directly). */
export function capturePdfFromPreview(w, D){ return _captureExportPDF(w, D); }
export var CAPTURE_BUILD = 'S511';
