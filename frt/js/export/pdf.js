/**
 * ARENCON FRT v2 — PDF Export
 * Ported from v1 _exportPDFWithCache — pixel-identical output.
 */

import { Model, isSiteRecordsName, SITE_RECORDS_LABEL } from '../data/model.js';
import { IDB } from '../data/idb.js';
import { R2 } from '../data/r2.js';
import { showAlert } from '../shared/dialogs.js';
import { toast } from '../shared/toast.js';
import { CARLITO_REG_B64 } from './carlitoReg.js';
import { CARLITO_BOLD_B64 } from './carlitoBold.js';

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// S154 Bug #4: closed-status now derived from Model.getEffectiveStatus
// instead of the persisted d.status. Pre-S119 pins where d.status='closed'
// was written before per-obs addressed flags existed will deserialize with
// obs.addressed=false; the minimap (reads d.status) and the pill (reads
// obs.addressed) would then disagree — green/dimmed pin with an
// "Outstanding" pill. Routing BOTH helpers through getEffectiveStatus
// gives the whole PDF one source of truth, and keeps the partition clean
// (every pin is exactly one of open/closed — never both, never neither).
function _deficIsOpen(d){return Model.getEffectiveStatus(d)==='open';}
function _deficIsClosed(d){return Model.getEffectiveStatus(d)==='closed';}
function _deficDesc(d){
  if(d.observations&&d.observations.length&&d.observations[0].text)return d.observations[0].text;
  if(d.entries&&d.entries.length&&d.entries[0].description)return d.entries[0].description;
  return d.description||'';
}

// S(this) — Mark: descriptions entered as manual bullet points were collapsing
// into a run-on paragraph (esc() drops the newlines/dashes the inspector typed).
// Render a real bulleted list when the text is clearly a list (≥2 segments split
// on newlines, or on inline " - " dash separators); otherwise plain escaped
// prose. Leading bullet glyphs/dashes are stripped from each item. Pure prose
// (no list markers) is untouched, so single-sentence items look exactly as before.
// S(this) — Mark (revised rule): a line becomes a bullet ONLY when it BEGINS
// with a dash (leading "- " on its own line). Mid-sentence dashes stay inline.
// Lines without a leading dash render as plain text (lead-in sentences, single
// paragraphs). Mixed content works: a non-dash lead-in line followed by several
// "- " lines renders the lead-in as text + the rest as a bullet list. Pure prose
// with no leading-dash line is returned untouched (escaped). Used by body AND
// appendix so bulleting is consistent.
function _descHtml(raw){
  var t=(raw==null?'':String(raw)).replace(/\r\n?/g,'\n').trim();
  if(!t)return '\u2014';
  if(t.indexOf('\n')<0){
    // single line: only a leading dash makes it a (one-item) bullet
    if(/^\s*-\s+\S/.test(t)) return '<ul class="dc-bul"><li>'+esc(t.replace(/^\s*-\s*/,''))+'</li></ul>';
    return esc(t);
  }
  var lines=t.split('\n');
  var out='';var inList=false;
  lines.forEach(function(ln){
    var raw=ln.replace(/\s+$/,'');
    if(/^\s*-\s+/.test(raw)){
      if(!inList){out+='<ul class="dc-bul">';inList=true;}
      out+='<li>'+esc(raw.replace(/^\s*-\s*/,'').trim())+'</li>';
    }else{
      if(inList){out+='</ul>';inList=false;}
      var s=raw.trim();
      if(s)out+='<div'+(out?' style="margin-top:3px;"':'')+'>'+esc(s)+'</div>';
    }
  });
  if(inList)out+='</ul>';
  return out||esc(t);
}

// S(this) — MINIMAP SPEED: cache decoded drawing Images keyed by dataURL so a
// drawing with N pins decodes ONCE instead of N times. Decoding a large drawing
// dataURL was the dominant cost (10 pins on one sheet = 10 full decodes). The
// decoded Image is read-only and reused across every pin/job. Map lives for the
// life of one export (the print window), then is GC'd with the window.
var _dwgImgCache=Object.create(null);
function _getDecodedDrawing(dataUrl){
  return new Promise(function(res,rej){
    var c=_dwgImgCache[dataUrl];
    if(c){ if(c.img){res(c.img);} else {c.waiters.push(res);} return; }
    var entry={img:null,waiters:[res]};_dwgImgCache[dataUrl]=entry;
    var img=new Image();
    img.onload=function(){entry.img=img;var ws=entry.waiters;entry.waiters=[];ws.forEach(function(w){w(img);});};
    img.onerror=function(){var ws=entry.waiters;entry.waiters=[];ws.forEach(function(w){w(null);});delete _dwgImgCache[dataUrl];};
    img.src=dataUrl;
  });
}
function _renderDrawingWithSinglePin(dwgDataUrl,pinData,callback,isSiteRecord){
  _getDecodedDrawing(dwgDataUrl).then(function(img){
    if(!img){callback(dwgDataUrl);return;}
    var cropFrac=0.291;
    var cropW=Math.max(img.width*cropFrac,529);var cropH=Math.max(img.height*cropFrac,397);
    var px=(pinData.pinX||0.5)*img.width;var py=(pinData.pinY||0.5)*img.height;
    cropW=Math.min(cropW,img.width);cropH=Math.min(cropH,img.height);
    var sx=Math.max(0,Math.min(px-cropW/2,img.width-cropW));
    var sy=Math.max(0,Math.min(py-cropH/2,img.height-cropH));
    var outW=Math.min(800,cropW);var outScale=outW/cropW;var outH=Math.round(cropH*outScale);
    var canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
    var ctx=canvas.getContext('2d');ctx.drawImage(img,sx,sy,cropW,cropH,0,0,outW,outH);
    var pinCX=(px-sx)*outScale;var pinCY=(py-sy)*outScale;
    var pinW=Math.max(49,outW*0.1215);
    _drawTeardropPin(ctx,pinCX,pinCY,pinW,pinData,isSiteRecord);
    callback(canvas.toDataURL('image/jpeg',0.92));
  });
}

function _renderDrawingWithPins(dwgDataUrl,pins,callback,pageSize){
  _getDecodedDrawing(dwgDataUrl).then(function(img){
    if(!img){callback(dwgDataUrl);return;}
    var MAX_PX=5000000;var scale=Math.min(1,Math.sqrt(MAX_PX/(img.width*img.height)));
    var w=Math.round(img.width*scale);var h=Math.round(img.height*scale);
    var canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    var ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);
    var _pinFrac=(pageSize==='24x36')?0.014:(pageSize==='11x17')?0.022:0.028;
    var pinW=Math.max(28,w*_pinFrac);
    pins.forEach(function(rr){
      var d=rr.d;if(d.pinX==null)return;
      var px=d.pinX*w;var py=d.pinY*h;
      var _isSr=isSiteRecordsName(rr.ctr);
      _drawTeardropPin(ctx,px,py,pinW,d,_isSr);
    });
    callback(canvas.toDataURL('image/jpeg',0.92));
  });
}

// S113 Push 12: teardrop pin matches the viewer's SVG path EXACTLY.
// Source of truth — viewer.js (HTML pin path): viewBox 32×42, anchor at
// (16, 40) which is the marker tip.
//   <path d="M16 1 C8.3 1, 2 7.3, 2 15 c0 10.5 14 25 14 25 s14-14.5 14-25 C30 7.3 23.7 1 16 1 z"/>
//   <circle cx=16 cy=14 r=9 fill=white/>
//   <text x=16 y=14.5/>
// S154 PIN-COLOUR-OVERHAUL: PDF pin colours now match the on-screen
// viewer.js/pins.js/pinsGL.js canon-compliant muted palette. The
// previous palette here was using the FORBIDDEN bright hex
// (#1A7A4A, #C0392B, #E67E22) while the live tool had already moved to
// muted equivalents — so the PDF and the tablet disagreed visually.
// Site Records ALSO now get their own colour (Mark, S154): indigo
// #6B6FA8, distinct from defic/rec/IAR so a Site Record pin is
// unambiguously "internal documentation, not a client deficiency"
// even at thumbnail size.
function _drawTeardropPin(ctx,anchorX,anchorY,pinW,d,isSiteRecord){
  var s=pinW/32;  // SVG width is 32; scale factor = pinW / 32
  // Anchor point in SVG is (16, 40). Map to (anchorX, anchorY).
  function P(svgX,svgY){return{x:anchorX+(svgX-16)*s,y:anchorY+(svgY-40)*s};}

  // Color resolution — Recommendation > Site Record > IAR > priority. Muted canon
  // palette matches viewer.js _renderPins / pinsGL.js exactly. S317: a rec pin
  // (d.isRecommendation) draws BROWN #5E5440 (matches the PDF .rec-chip family and
  // the on-screen/gallery rec colour — unified). Without this branch an Appendix B
  // rec pin fell through to priority and drew red.
  var pr=d.priority||'high';
  var fill;
  if(d.isRecommendation){
    fill='#5E5440'; // brown — Recommendation (S317, unified rec colour)
  }else if(isSiteRecord){
    fill='#6B6FA8'; // indigo — Site Records (S154)
  }else{
    fill=(pr==='low'||pr==='general')?'#B07F5A':'#A85959'; // S217: 'general' retired → reads as low (amber); high stays maroon
  }
  var isClosed=_deficIsClosed(d);
  // S346 (#3): a CLOSED item's teardrop reads GREEN + SOLID (not its priority
  // colour at 50% alpha). Matches the closed sage used by the appendix status
  // and .pill-c family — so a closed pin is unmistakably "done" on the drawing.
  if(isClosed)fill='#5F8068'; // muted sage — Closed
  var alpha=1; // S346 (#3): always solid; closed no longer fades to 0.5

  ctx.save();
  ctx.globalAlpha=alpha;

  // Outer pin path (white outline, matches viewer's outer path "M16 1 …")
  function buildOuterPath(){
    ctx.beginPath();
    var p0=P(16,1);ctx.moveTo(p0.x,p0.y);
    // C 8.3 1, 2 7.3, 2 15
    var c1a=P(8.3,1),c2a=P(2,7.3),e1=P(2,15);
    ctx.bezierCurveTo(c1a.x,c1a.y,c2a.x,c2a.y,e1.x,e1.y);
    // c 0 10.5 14 25 14 25 (relative; from (2,15) to (16,40))
    var c1b=P(2,25.5),c2b=P(16,40),e2=P(16,40);
    ctx.bezierCurveTo(c1b.x,c1b.y,c2b.x,c2b.y,e2.x,e2.y);
    // s 14 -14.5 14 -25 (smooth; from (16,40) to (30,15))
    // cp1 = reflection of previous cp2 over current point = (16,40)
    // cp2 = (30, 25.5), end = (30, 15)
    var c1c=P(16,40),c2c=P(30,25.5),e3=P(30,15);
    ctx.bezierCurveTo(c1c.x,c1c.y,c2c.x,c2c.y,e3.x,e3.y);
    // C 30 7.3, 23.7 1, 16 1
    var c1d=P(30,7.3),c2d=P(23.7,1),e4=P(16,1);
    ctx.bezierCurveTo(c1d.x,c1d.y,c2d.x,c2d.y,e4.x,e4.y);
    ctx.closePath();
  }

  // Layer 1: white outer halo (drop-shadow approximation)
  buildOuterPath();
  ctx.fillStyle='#fff';
  ctx.fill();
  // White stroke gives the pin its halo against any background
  ctx.lineWidth=Math.max(1,s*2);
  ctx.strokeStyle='#fff';
  ctx.stroke();

  // Layer 2: colored fill — EXACT viewer inner path (viewer.js line ~1658):
  //   M16 3 C9.4 3 4 8.4 4 15 c0 9.5 12 22 12 22 s12-12.5 12-22 C28 8.4 22.6 3 16 3 z
  // Start (16,3); left shoulder (4,15); tip (16,37); right shoulder (28,15).
  // Uses the SAME P() anchor mapping as the outer path so the inner fill sits
  // inside the white outline at every scale — no more 92%-scale approximation
  // (which mis-seated the tip and shoulders at large print sizes). This is the
  // S338 "match the viewer teardrop EXACTLY" fix.
  ctx.beginPath();
  var jp0=P(16,3);ctx.moveTo(jp0.x,jp0.y);
  // C 9.4 3, 4 8.4, 4 15
  var jc1a=P(9.4,3),jc2a=P(4,8.4),je1=P(4,15);
  ctx.bezierCurveTo(jc1a.x,jc1a.y,jc2a.x,jc2a.y,je1.x,je1.y);
  // c 0 9.5 12 22 12 22  (relative; from (4,15) to (16,37))
  var jc1b=P(4,24.5),jc2b=P(16,37),je2=P(16,37);
  ctx.bezierCurveTo(jc1b.x,jc1b.y,jc2b.x,jc2b.y,je2.x,je2.y);
  // s 12 -12.5 12 -22  (smooth; from (16,37) to (28,15); cp1 = reflection = (16,37))
  var jc1c=P(16,37),jc2c=P(28,24.5),je3=P(28,15);
  ctx.bezierCurveTo(jc1c.x,jc1c.y,jc2c.x,jc2c.y,je3.x,je3.y);
  // C 28 8.4, 22.6 3, 16 3
  var jc1d=P(28,8.4),jc2d=P(22.6,3),je4=P(16,3);
  ctx.bezierCurveTo(jc1d.x,jc1d.y,jc2d.x,jc2d.y,je4.x,je4.y);
  ctx.closePath();
  ctx.fillStyle=fill;
  ctx.fill();

  // Layer 3: white inner circle at SVG (16, 14) radius 9
  var cInner=P(16,14);
  ctx.beginPath();
  ctx.arc(cInner.x,cInner.y,9*s,0,Math.PI*2);
  ctx.fillStyle='#fff';
  ctx.globalAlpha=alpha*0.95;
  ctx.fill();

  // Layer 4: number text inside white circle, color = pin color
  ctx.globalAlpha=alpha;
  var numStr=String(d.num||'?');
  // S113 Push 15: bumped font sizes ~20% (14→17, 11→13, 9→11) so the
  // number reads clearly against the white circle at print + on-screen
  // PDF view sizes. Viewer uses font-size:14 in viewBox units; canvas
  // fillText with Calibri renders glyphs visibly smaller than SVG <text>
  // at the same numeric font-size, so a small bump compensates.
  var fs=Math.round(s*(numStr.length<=2?17:numStr.length===3?13:11));
  ctx.fillStyle=fill;
  ctx.font='900 '+fs+'px Calibri,Arial,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.fillText(numStr,cInner.x,cInner.y);

  ctx.restore();
}

// S343 (#4A) — downscale a photo for IN-REPORT embedding. The report grid shows
// each photo at ~200-350px wide; embedding the full-res original (3-5 MB phone
// JPEGs) is what made the PDF ~95 MB for 40 photos. Draw to a canvas capped at
// PDF_PHOTO_MAX px long edge at JPEG 0.8 -> ~150-250 KB each, still crisp in print.
// Returns a Promise<dataURL>; on any failure resolves the ORIGINAL src.
var PDF_PHOTO_MAX = 1000;
function _downscalePhotoForPDF(src){
  return new Promise(function(resolve){
    if(!src){resolve('');return;}
    var img=new Image();
    img.crossOrigin='anonymous';
    img.onload=function(){
      try{
        var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
        if(!w||!h){resolve(src);return;}
        var scale=Math.min(1, PDF_PHOTO_MAX/Math.max(w,h));
        if(scale>=1){resolve(src);return;}
        var cw=Math.round(w*scale), ch=Math.round(h*scale);
        var cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
        var cx=cv.getContext('2d');
        try{cx.imageSmoothingQuality='high';}catch(e){}
        cx.drawImage(img,0,0,cw,ch);
        var out=cv.toDataURL('image/jpeg',0.8);
        cv.width=0;cv.height=0;
        resolve(out||src);
      }catch(e){resolve(src);}
    };
    img.onerror=function(){resolve(src);};
    img.src=src;
  });
}

// S(this) — collect every synced photo's {r2Url -> R2 key} across the whole
// project, for tokenized-link minting (privacy fix). Mirrors the prefetch walk.
function _collectPhotoKeysForMint(p){
  var keyByUrl={};
  function _walk(defics){
    if(!defics)return;
    defics.forEach(function(d){
      function add(arr){(arr||[]).forEach(function(ph){
        if(ph&&ph.r2Url&&!keyByUrl[ph.r2Url]){var k=_betaKeyFromPhoto(ph);if(k)keyByUrl[ph.r2Url]=k;}
      });}
      add(d.photos);
      if(d.observations)d.observations.forEach(function(o){add(o.photos);});
      if(d.entries)d.entries.forEach(function(e){add(e.photos);});
      (d.activity||[]).forEach(function(a){add(a.photos);});
    });
  }
  (p.contractors||[]).forEach(function(c){_walk(c.deficiencies);});
  _walk(p.generalDeficiencies);
  (p.photos||[]).forEach(function(ph){
    if(ph&&ph.r2Url&&!keyByUrl[ph.r2Url]){var k=_betaKeyFromPhoto(ph);if(k)keyByUrl[ph.r2Url]=k;}
  });
  return keyByUrl;
}

function _prefetchR2PhotosForPDF(p,progressCb){
  var urls=[];
  function _collect(defics){
    if(!defics)return;
    defics.forEach(function(d){
      (d.photos||[]).forEach(function(ph){if(ph&&ph.r2Url)urls.push(ph.r2Url);});
      if(d.observations){d.observations.forEach(function(o){
        (o.photos||[]).forEach(function(ph){if(ph&&ph.r2Url)urls.push(ph.r2Url);});
      });}
      if(d.entries){d.entries.forEach(function(e){
        (e.photos||[]).forEach(function(ph){if(ph&&ph.r2Url)urls.push(ph.r2Url);});
      });}
      (d.activity||[]).forEach(function(a){
        (a.photos||[]).forEach(function(ph){if(ph&&ph.r2Url)urls.push(ph.r2Url);});
      });
    });
  }
  (p.contractors||[]).forEach(function(c){_collect(c.deficiencies);});
  _collect(p.generalDeficiencies);
  (p.photos||[]).forEach(function(ph){if(ph&&ph.r2Url)urls.push(ph.r2Url);});
  urls=urls.filter(function(u,i,a){return a.indexOf(u)===i;});
  // S343: also downscale dataUrl-only (unsynced) photos so they aren't full-res.
  var dataUrls=[];
  function _collectData(defics){
    if(!defics)return;
    defics.forEach(function(d){
      function add(arr){(arr||[]).forEach(function(ph){if(ph&&!ph.r2Url&&ph.dataUrl)dataUrls.push(ph.dataUrl);});}
      add(d.photos);
      if(d.observations)d.observations.forEach(function(o){add(o.photos);});
      if(d.entries)d.entries.forEach(function(e){add(e.photos);});
      (d.activity||[]).forEach(function(a){add(a.photos);});
    });
  }
  (p.contractors||[]).forEach(function(c){_collectData(c.deficiencies);});
  _collectData(p.generalDeficiencies);
  (p.photos||[]).forEach(function(ph){if(ph&&!ph.r2Url&&ph.dataUrl)dataUrls.push(ph.dataUrl);});
  dataUrls=dataUrls.filter(function(u,i,a){return a.indexOf(u)===i;});
  if(!urls.length&&!dataUrls.length)return Promise.resolve({});
  var cache={};var done=0;var total=urls.length+dataUrls.length;
  if(progressCb)progressCb(0,total);
  return Promise.all(urls.map(function(url){
    return fetch(url).then(function(res){if(!res.ok)throw new Error(res.status);return res.blob();})
    .then(function(blob){
      var ou=URL.createObjectURL(blob);
      cache[url]=ou;
      return _downscalePhotoForPDF(ou).then(function(small){cache['small:'+url]=small;});
    })
    .catch(function(){}).finally(function(){done++;if(progressCb)progressCb(done,total);});
  }).concat(dataUrls.map(function(du){
    return _downscalePhotoForPDF(du).then(function(small){cache['small:'+du]=small;})
      .catch(function(){}).finally(function(){done++;if(progressCb)progressCb(done,total);});
  }))).then(function(){
    // S351 never-bake: composite rotation + vector strokes for the LIVE HTML PDF
    // path. The HTML <img> can't rotate/composite vectors itself, and the stored
    // image is now CLEAN, so we pre-bake a render-time dataURL per photo that has
    // a rotation and/or strokes, keyed by photo id. _pdfPhotoSrc returns it.
    var photosToComp=[];
    function _collectPh(defics){
      if(!defics)return;
      defics.forEach(function(d){
        function add(arr){(arr||[]).forEach(function(ph){
          if(ph && typeof ph==='object'){
            var rot=(typeof ph.rotation==='number')?(((ph.rotation%360)+360)%360):0;
            if(rot || (ph._markupStrokes&&ph._markupStrokes.length)) photosToComp.push(ph);
          }
        });}
        add(d.photos);
        if(d.observations)d.observations.forEach(function(o){add(o.photos);});
        if(d.entries)d.entries.forEach(function(e){add(e.photos);});
        (d.activity||[]).forEach(function(a){add(a.photos);});
      });
    }
    (p.contractors||[]).forEach(function(c){_collectPh(c.deficiencies);});
    _collectPh(p.generalDeficiencies);
    (p.photos||[]).forEach(function(ph){
      if(ph && typeof ph==='object'){
        var rot=(typeof ph.rotation==='number')?(((ph.rotation%360)+360)%360):0;
        if(rot || (ph._markupStrokes&&ph._markupStrokes.length)) photosToComp.push(ph);
      }
    });
    if(!photosToComp.length) return cache;
    return Promise.all(photosToComp.map(function(ph){
      // pick the best already-cached source for this photo (the clean image)
      var src = (ph.r2Url&&cache['small:'+ph.r2Url]) || (ph.r2Url&&cache[ph.r2Url])
              || (ph.dataUrl&&cache['small:'+ph.dataUrl]) || ph.dataUrl || ph.r2Url || '';
      if(!src) return Promise.resolve();
      var rot=(typeof ph.rotation==='number')?(((ph.rotation%360)+360)%360):0;
      var strokes=(ph._markupStrokes&&ph._markupStrokes.length)?ph._markupStrokes:null;
      return _compositeRotatedMarkedURL(src, rot, strokes, ph._mkFrame||null).then(function(durl){
        if(durl && ph.id) cache['comp:'+ph.id]=durl;
      }).catch(function(){});
    })).then(function(){ return cache; });
  });
}

// S351: dataURL variant of the never-bake compositor for the HTML PDF path.
// Draws the photo rotated with vector strokes on top in the same rotated frame,
// using the persisted authoring frame (mkFrame) for deterministic stroke scale.
function _compositeRotatedMarkedURL(src, rot, strokes, mkFrame){
  return new Promise(function(resolve){
    try{
      var ME=(typeof window!=='undefined')?window.MarkupEngine:null;
      var img=new Image(); img.crossOrigin='anonymous';
      img.onload=function(){
        try{
          var nw=img.naturalWidth, nh=img.naturalHeight;
          if(!nw||!nh){ resolve(''); return; }
          var sideways=(rot===90||rot===270);
          var ow=sideways?nh:nw, oh=sideways?nw:nh;
          var cv=document.createElement('canvas'); cv.width=ow; cv.height=oh;
          var ctx=cv.getContext('2d');
          function applyRot(){
            if(rot===90){ ctx.translate(ow,0); ctx.rotate(Math.PI/2); }
            else if(rot===180){ ctx.translate(ow,oh); ctx.rotate(Math.PI); }
            else if(rot===270){ ctx.translate(0,oh); ctx.rotate(3*Math.PI/2); }
          }
          ctx.save(); applyRot(); ctx.drawImage(img,0,0,nw,nh); ctx.restore();
          if(strokes&&strokes.length&&ME&&ME.renderStrokesToContext){
            var fw=(mkFrame&&mkFrame.w)?mkFrame.w:nw, fh=(mkFrame&&mkFrame.h)?mkFrame.h:nh;
            ctx.save(); applyRot(); ctx.scale(nw/fw, nh/fh);
            try{ ME.renderStrokesToContext(ctx, strokes, fw, fh); }catch(_){}
            ctx.restore();
          }
          var out=cv.toDataURL('image/jpeg',0.9); cv.width=0; cv.height=0;
          resolve(out||'');
        }catch(e){ resolve(''); }
      };
      img.onerror=function(){ resolve(''); };
      img.src=src;
    }catch(e){ resolve(''); }
  });
}

function _pdfPhotoSrc(ph,r2Cache){
  if(!ph)return '';if(typeof ph==='string')return ph;
  if(r2Cache){
    // S351 never-bake: a pre-composited (rotated + vector strokes) render-time
    // dataURL takes precedence — it already reflects p.rotation + _markupStrokes.
    if(ph.id&&r2Cache['comp:'+ph.id])return r2Cache['comp:'+ph.id];
    if(ph.r2Url&&r2Cache['small:'+ph.r2Url])return r2Cache['small:'+ph.r2Url];
    if(!ph.r2Url&&ph.dataUrl&&r2Cache['small:'+ph.dataUrl])return r2Cache['small:'+ph.dataUrl];
    if(ph.r2Url&&r2Cache[ph.r2Url])return r2Cache[ph.r2Url];
  }
  return ph.dataUrl||ph.r2Url||'';
}
// S343 (#4B) — full-res link target (synced R2 original). '' when no shareable URL.
// S(this) — Mark privacy fix: photo links must NEVER be the raw R2 URL (it
// exposes the worker subdomain = personal account handle + bucket path).
// Links now resolve to opaque /p/{token} from _pdfLinkByUrl, minted before
// export. If a photo wasn't minted, it gets NO link (return '') rather than
// falling back to the exposed URL. Option A (Mark): privacy over clickability.
var _pdfLinkByUrl={};
// S360 — REPORT SNAPSHOTS (frozen, immutable, content-addressed). At export, each
// photo that has markup and/or rotation is composited at FULL RES (rotation + marks
// baked) and uploaded to R2 under a content-hash key:
//   photos/{pid}/frt/report-snapshots/{hash}/{photoId}.jpg
// The hash is over (rotation + strokes), so identical content => identical key =>
// no re-upload (cheap GET existence check). Any change => new hash => new key =>
// new snapshot + new link. Old reports keep pointing at their old hash (frozen).
// Both the in-PDF <img> AND the clickable /p/{token} link resolve to the SAME
// snapshot, so they match exactly. Clean, unrotated photos get NO snapshot — their
// link stays the clean original (which already matches). This does NOT violate
// never-bake: never-bake governs the LIVE editable store (still clean vectors);
// snapshots are export-time frozen deliverables (Report Immutability principle).
var _snapshotByPhotoId={};   // photoId -> { r2Url, r2Key }

// Small, stable content hash of a photo's visual state (rotation + strokes).
function _snapHash(rot, strokes){
  var s = 'r'+(rot||0)+'|' + (strokes && strokes.length ? JSON.stringify(strokes) : '');
  // FNV-1a 32-bit — short, deterministic, dependency-free.
  var h = 0x811c9dc5;
  for (var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0; }
  return ('0000000'+h.toString(16)).slice(-8);
}

// Build frozen snapshots for every marked/rotated photo in the report. Returns a
// promise; on any per-photo failure that photo simply gets no snapshot (export
// never breaks). progressCb(done,total) optional.
function _buildReportSnapshots(p, r2Cache, progressCb){
  _snapshotByPhotoId = {};
  var pid = (p && (p.projectId || p.id)) || (Model.getProject && Model.getProject() && (Model.getProject().projectId||Model.getProject().id)) || '';
  if(!pid) return Promise.resolve(_snapshotByPhotoId);
  // Collect unique photos (by id) with marks/rotation.
  var seen={}, list=[];
  function add(arr){ (arr||[]).forEach(function(ph){
    if(!ph || typeof ph!=='object' || !ph.id || seen[ph.id]) return;
    var rot=(typeof ph.rotation==='number')?(((ph.rotation%360)+360)%360):0;
    var hasMk=(ph._markupStrokes&&ph._markupStrokes.length);
    if(rot || hasMk){ seen[ph.id]=1; list.push(ph); }
  });}
  function walk(defics){ (defics||[]).forEach(function(d){
    add(d.photos);
    if(d.observations) d.observations.forEach(function(o){add(o.photos);});
    if(d.entries) d.entries.forEach(function(e){add(e.photos);});
    (d.activity||[]).forEach(function(a){add(a.photos);});
  });}
  (p.contractors||[]).forEach(function(c){walk(c.deficiencies);});
  walk(p.generalDeficiencies);
  add(p.photos);

  var total=list.length, done=0;
  if(!total) return Promise.resolve(_snapshotByPhotoId);
  if(progressCb) progressCb(0,total);

  return Promise.all(list.map(function(ph){
    var rot=(typeof ph.rotation==='number')?(((ph.rotation%360)+360)%360):0;
    var strokes=(ph._markupStrokes&&ph._markupStrokes.length)?ph._markupStrokes:null;
    var hash=_snapHash(rot, strokes);
    var fname=ph.id+'.jpg';
    var r2Key='photos/'+pid+'/frt/report-snapshots/'+hash+'/'+fname;
    var r2Url=R2.WORKER_URL+'/'+r2Key;
    // Existence check: same content-hash key already in R2 => reuse, skip upload.
    return fetch(r2Url,{method:'GET'}).then(function(resp){
      if(resp && resp.ok){
        _snapshotByPhotoId[ph.id]={r2Url:r2Url,r2Key:r2Key};
        done++; if(progressCb)progressCb(done,total); return;
      }
      // Not present — composite at full res then upload.
      var src=(ph.r2Url&&r2Cache&&r2Cache[ph.r2Url]) || (ph.dataUrl&&!/^blob:/.test(ph.dataUrl)?ph.dataUrl:'') || ph.r2Url || '';
      if(!src){ done++; if(progressCb)progressCb(done,total); return; }
      return _compositeRotatedMarkedURL(src, rot, strokes, ph._mkFrame||null).then(function(durl){
        if(!durl){ done++; if(progressCb)progressCb(done,total); return; }
        return R2.upload(pid, 'report-snapshots/'+hash, durl, fname, 'image/jpeg').then(function(res){
          if(res&&res.r2Url){ _snapshotByPhotoId[ph.id]={r2Url:res.r2Url,r2Key:res.r2Key}; }
          done++; if(progressCb)progressCb(done,total);
        });
      });
    }).catch(function(){ done++; if(progressCb)progressCb(done,total); });
  })).then(function(){ return _snapshotByPhotoId; });
}

var _PDF_WORKER='https://files.arencon.app';
function _pdfPhotoFullHref(ph){
  if(!ph||typeof ph==='string')return '';
  // S360: prefer the frozen report snapshot's token (matches the in-PDF thumbnail).
  if(ph.id&&_snapshotByPhotoId[ph.id]){
    var su=_snapshotByPhotoId[ph.id].r2Url;
    if(su&&_pdfLinkByUrl[su])return _PDF_WORKER+'/p/'+_pdfLinkByUrl[su];
  }
  if(ph.r2Url&&_pdfLinkByUrl[ph.r2Url])return _PDF_WORKER+'/p/'+_pdfLinkByUrl[ph.r2Url];
  return '';
}

function _buildCSS(fontB64){
  var c='*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}';
  c+='body{font-family:Calibri,sans-serif;color:#1C2333;font-size:11pt;line-height:1.23;background:#525659;margin:0;padding:20px;}';
  if(fontB64){c+='@font-face{font-family:"BlairMdITC TT";src:url(data:font/truetype;base64,'+fontB64+') format("truetype");font-weight:normal;font-style:normal;}';}
  var blairFam=fontB64?'"BlairMdITC TT","Times New Roman",serif':'Calibri,sans-serif';
  c+='.page{width:8.5in;min-height:11in;background:white;margin:0 auto 24px;padding:0.5in 0.6in;box-shadow:0 2px 12px rgba(0,0,0,.3);position:relative;overflow:hidden;}';
  // S346: appendix sheets can take a larger landscape size. Body pages stay
  // Letter (default .page). These override only width/min-height; the named
  // @page rules below drive the actual printed paper size (mixed-size PDF).
  c+='.page.p11x17{width:17in;min-height:11in;}';
  c+='.page.p24x36{width:36in;min-height:24in;}';
  // S346: appendix split — drawing LEFT (flexes), deficiency list RIGHT at a
  // FIXED 5.4in width (identical column on every sheet size; 24x36 gives its
  // extra room to the drawing, not the list). List reuses the body .dc cards.
  c+='.app-split{display:flex;gap:14px;align-items:flex-start;}';
  c+='.app-split-dwg{flex:1 1 auto;min-width:0;}';
  c+='.app-split-dwg img{width:100%;height:auto;display:block;border:1px solid #DDE1E7;border-radius:4px;}';
  c+='.app-split-list{flex:0 0 4.6in;width:4.6in;min-width:0;display:flex;flex-direction:column;text-align:left;}';
  c+='.app-split-list .dc:first-child{border-top:1px solid #DDE1E7;border-radius:6px 6px 0 0;}';
  c+='.page-content{position:relative;}';
  c+='.ph{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:10px;margin-bottom:0;}';
  c+='.ph img{height:34px;}';
  c+='.ph-addr{text-align:left;font-family:Arial,sans-serif;font-size:6pt;color:#1C2333;line-height:1.26;border-left:2px solid #9C2742;padding-left:10px;}';
  c+='.ph-compact{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:12px;}';
  c+='.ph-compact-left{font-size:11pt;color:#000;line-height:1;}';
  c+='.ph-compact-right{font-size:11pt;color:#000;line-height:1;text-align:right;}';
  // (Historical: S118 made .ch a plain burgundy contractor banner with a
  // right-side count pill; S139 Phase 3 below re-tasks .ch as the taupe
  // contractor SUB-band under the navy trade band.)
  // S139 Phase 3: .ch is now the CONTRACTOR SUB-BAND nested under a navy
  // .th-band trade header — taupe #7B6F5A (canon PDF spec), no top radius
  // or top margin since it butts against the trade band above it.
  c+='.ch{background:#7B6F5A;color:white;padding:6px 14px;font-weight:700;font-size:10.5pt;border-radius:0;margin-top:0;margin-bottom:0;letter-spacing:.3px;display:flex;justify-content:space-between;align-items:center;}';
  c+='.th-band{background:#2A3A5C;color:#fff;padding:8px 14px;font-weight:700;font-size:12pt;border-radius:6px 6px 0 0;margin-top:18px;margin-bottom:0;letter-spacing:.3px;display:flex;justify-content:space-between;align-items:center;}';
  // S142 Batch 3-3 (Model 2 §4.4): pooled "Recommendations" section.
  // .th-band.recs = grey band (demo --grey #6B7280, distinct from the
  // navy trade bands); .rec-cap = the advisory caption row directly under
  // it; .rec-ctrchip = inline contractor chip shown ONLY on the rare
  // paid-to-contractor rec (muted, same family as the REC .rec-chip).
  // Replaces the removed S139 .th-band.sgr (the deleted "Site Records ·
  // Recommendations" band) — same colour, repurposed.
  c+='.th-band.recs{background:#6B7280;}';
  c+='.rec-cap{border:1px solid #DDE1E7;border-top:none;padding:9px 13px;font-size:9.5pt;color:#5A6473;background:#fff;line-height:1.35;}';
  c+='.rec-ctrchip{display:inline-block;background:#DCE0E6;color:#454E5C;font-size:8.5pt;font-weight:800;padding:2px 8px;border-radius:10px;letter-spacing:.5px;flex-shrink:0;}';
  c+='.rec-sub{background:#6B7280;color:#fff;padding:5px 14px;font-weight:700;font-size:9.5pt;border-radius:0;margin:0;letter-spacing:.3px;display:flex;justify-content:space-between;align-items:center;}';
  c+='.rec-chip{display:inline-block;background:#DDD8CB;color:#5E5440;font-size:8.5pt;font-weight:800;padding:2px 8px;border-radius:10px;letter-spacing:.5px;flex-shrink:0;}';
  // S154 round 2: initials chip becomes a true filled pill — subtle off-white bg
  // so it reads in the same family as .pill-h / .pill-c / .rec-chip. The per-inspector
  // color is still set inline via color/border-color; the bg is uniform so it doesn't
  // fight the colored border.
  c+='.dc-insp{display:inline-block;background:#F2F0EC;font-size:8.5pt;font-weight:800;padding:2px 7px;border:1px solid;border-radius:10px;letter-spacing:.4px;flex-shrink:0;}';
  c+='.rec-foot{font-size:9.5pt;font-style:italic;color:#5A6473;line-height:1.35;padding:8px 12px;border:1px solid #DDE1E7;border-top:none;background:#FAFAF9;border-radius:0 0 6px 6px;margin-bottom:10px;}';
  c+='.hirec-note{font-size:10pt;font-style:italic;color:#7B6F5A;margin-top:10px;line-height:1.35;}';
  c+='.rep-key{border:1px solid #DDE1E7;border-radius:6px;margin-top:10px;padding:0;overflow:hidden;break-inside:avoid;page-break-inside:avoid;}';
  c+='.rep-key-ttl{font-size:10.5pt;font-weight:700;background:#2A3A5C;color:#fff;padding:6px 12px;margin-bottom:0;letter-spacing:.3px;}';
  c+='.rep-key-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:22px;row-gap:4px;padding:8px 12px;}';
  c+='.rep-key-row{display:flex;align-items:center;gap:10px;margin:0;}';
  c+='.rep-key .rk-sw{font-size:8.5pt;padding:3px 10px;margin:0;border-radius:5px;min-width:96px;display:inline-flex;justify-content:flex-start;}';
  c+='.rep-key-gloss{font-size:9.5pt;color:#4A5568;}';
  c+='.ch-pill{background:rgba(0,0,0,0.18);color:white;font-weight:700;font-size:9.5pt;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;line-height:1;flex-shrink:0;}';
  c+='.ch-cont{font-weight:400;font-size:9.5pt;opacity:0.78;letter-spacing:0;margin-left:8px;font-style:italic;}';
  c+='.dc{border:1px solid #DDE1E7;border-top:none;padding:10px 12px;margin-bottom:0;background:white;}';
  c+='.dc:last-child{border-radius:0 0 6px 6px;margin-bottom:10px;}';
  c+='.dc-inner{display:flex;gap:12px;align-items:flex-start;}';
  c+='.dc-mini{flex-shrink:0;width:160px;height:auto;border-radius:6px;border:1px solid #DDE1E7;display:block;align-self:flex-start;}';
  c+='.dc-content{flex:1;min-width:0;}';
  // S118: card header — item# burgundy + merged status pill (color encodes priority)
  c+='.dc-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px;}';
  // S144 §3: card header split — left = #num only (identical to deficiency
  // cards); right cluster = inspector chip -> contractor chip -> REC ->
  // status pill. REC chip relocated out of the left group.
  c+='.dc-hdr-l{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;}';
  c+='.dc-hdr-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0;}';
  c+='.dc-itemnum{color:#9C2742;font-size:11pt;font-weight:700;line-height:1;}';
  c+='.item-sep{color:#B8BCC6;font-weight:400;margin:0 1px;font-size:11pt;line-height:1;}';/* S317 Option E middot — tightest (Mark: pin# closer to item#) */
  c+='.pinref-dark{color:#4A5568;font-size:9.5pt;font-weight:600;line-height:1;}';/* S317 Option E "Pin 3A" */
  c+='.dc-desc{font-size:11pt;line-height:1.4;}';
  // Contractor Response (Phase 1 preview) — B1 grammar, print values.
  c+='.crb{border:1px solid #C9C4D0;border-radius:6px;margin-top:12px;overflow:hidden;}';
  c+='.crb-hd{background:#EFEDF0;border-bottom:1px solid #C9C4D0;padding:6px 12px;font-size:9pt;font-weight:800;letter-spacing:.6px;color:#5E5B68;text-transform:uppercase;}';
  c+='.crb-bd{padding:6px 12px 13px;}';
  c+='.crb-seg .tr-row{padding:12px 0;}';
  c+='.crb-seg + .crb-seg .tr-row{border-top:1px solid #ECEAEF;}';
  c+='.item-contband{font-size:8.5pt;font-weight:700;color:#928E9C;font-style:italic;margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}';
  c+='.item-contband .dc-itemnum{font-style:normal;font-size:9.5pt;}';
  c+='.item-contband .pinref-dark{font-style:normal;}';
  c+='.item-contband .cont{opacity:.9;}';
  c+='.dc-mini-cont{flex-shrink:0;width:160px;}';
  c+='.tr-row{padding:9px 0;}';
  c+='.tr-row + .tr-row{border-top:1px solid #ECEAEF;}';
  c+='.tr-meta{font-size:8.5pt;color:#928E9C;font-weight:700;letter-spacing:.3px;margin-bottom:5px;}';
  c+='.tr-meta b{color:#5E5B68;}';
  c+='.claim{font-size:10pt;color:#3D3A46;line-height:1.45;}';
  c+='.claim .rep{color:#4A5568;font-weight:700;}';
  c+='.claim.cflex{display:flex;justify-content:space-between;align-items:baseline;gap:14px;}';
  c+='.claim.cflex .ctext{flex:1;}';
  c+='.claim.cflex .rep{white-space:nowrap;flex-shrink:0;}';
  c+='.rect-lbl{font-size:8pt;font-weight:700;color:#928E9C;margin:10px 0 5px;letter-spacing:.2px;}';
  c+='.rphotos{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:6px 0 2px;}';
  c+='.rphoto{width:100%;aspect-ratio:4/3;border:1px solid #DDE1E7;border-radius:4px;background:#F4F2F6 url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTUwIiB2aWV3Qm94PSIwIDAgMjAwIDE1MCI+CjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0idyIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPgo8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNkOWQ0Y2YiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNiOWIyYWEiLz48L2xpbmVhckdyYWRpZW50Pgo8bGluZWFyR3JhZGllbnQgaWQ9InAiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIwIj4KPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjM2EzYTNlIi8+PHN0b3Agb2Zmc2V0PSIwLjUiIHN0b3AtY29sb3I9IiM2YjZiNzAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMyZTJlMzIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz4KPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxNTAiIGZpbGw9InVybCgjdykiLz4KPHJlY3QgeD0iNzAiIHk9IjAiIHdpZHRoPSIyNiIgaGVpZ2h0PSIxNTAiIGZpbGw9InVybCgjcCkiLz4KPHJlY3QgeD0iNjAiIHk9IjM0IiB3aWR0aD0iNDYiIGhlaWdodD0iMTIiIHJ4PSIzIiBmaWxsPSIjYzg2MjJiIi8+CjxyZWN0IHg9IjYwIiB5PSI5NiIgd2lkdGg9IjQ2IiBoZWlnaHQ9IjEyIiByeD0iMyIgZmlsbD0iI2M4NjIyYiIvPgo8Y2lyY2xlIGN4PSIxNDAiIGN5PSI2NiIgcj0iMjYiIGZpbGw9IiNlY2VhZTYiIHN0cm9rZT0iIzhhOGE4YSIgc3Ryb2tlLXdpZHRoPSIzIi8+CjxjaXJjbGUgY3g9IjE0MCIgY3k9IjY2IiByPSIzIiBmaWxsPSIjMzMzIi8+CjxsaW5lIHgxPSIxNDAiIHkxPSI2NiIgeDI9IjEyOCIgeTI9IjUwIiBzdHJva2U9IiNiMjNiM2IiIHN0cm9rZS13aWR0aD0iMiIvPgo8cmVjdCB4PSIxNTAiIHk9IjEwNCIgd2lkdGg9IjM0IiBoZWlnaHQ9IjI2IiByeD0iMyIgZmlsbD0iI2M4NjIyYiIgb3BhY2l0eT0iMC44NSIvPgo8L3N2Zz4=") center/cover no-repeat;display:flex;align-items:flex-end;justify-content:flex-start;color:#fff;font-size:7.5pt;font-weight:700;padding:4px 6px;text-shadow:0 1px 3px rgba(0,0,0,.6);}';
  c+='.arv{border-left:2px solid #9C2742;padding-left:14px;margin-left:-6px;}';
  c+='.arv .tr-meta b{color:#9C2742;}';
  c+='.arv .pill{display:inline-flex;align-items:center;font-size:8.5pt;padding:3px 11px;line-height:1;vertical-align:middle;}';
  c+='.arv p{margin:5px 0 0;font-size:10pt;color:#3D3A46;line-height:1.45;}';
  c+='.rd-chip{display:inline-flex;align-items:center;gap:4px;font-size:8.5pt;font-weight:700;padding:3px 9px;border-radius:10px;border:1px solid;letter-spacing:.2px;}';
  c+='.rd-chip.r-g{color:#5E5B68;background:rgba(94,91,104,.10);border-color:rgba(94,91,104,.24);}';
  c+='.rd-chip.r-r{color:#A85959;background:rgba(168,89,89,.14);border-color:rgba(168,89,89,.42);}';
  c+='.rd-chip svg{display:block;}';
  c+='.cbrow{display:flex;gap:18px;flex-wrap:wrap;margin:6px 0 8px;}';
  c+='.cb{display:inline-flex;align-items:center;gap:7px;font-size:10pt;font-weight:600;color:#1B1A22;}';
  c+='.cb .bx{width:13px;height:13px;border:1.5px solid #4A5568;border-radius:2px;background:#EEF3FA;display:inline-block;}';
  c+='.flbl{font-size:8.5pt;font-weight:700;color:#5E5B68;margin-bottom:4px;}';
  c+='.ffield{width:100%;height:76px;border:1.5px solid #4A5568;border-radius:3px;background:#EEF3FA;}';
  c+='.closednote{font-size:9pt;color:#928E9C;font-style:italic;padding:9px 0 2px;}';
  c+='.dc-bul{margin:2px 0 0;padding-left:18px;}';
  c+='.dc-bul li{margin:0 0 3px;line-height:1.35;break-inside:avoid;page-break-inside:avoid;}';
  c+='.dc-footer{font-size:9pt;color:#607D8B;margin-top:6px;}';
  // S118 status pills — color encodes priority (red=Outstanding High, orange=Outstanding Low, green=Closed)
  // S154 round 2: bg + fg both nudged a step darker for more presence in the report.
  // Foreground ~15% darker, background tints ~5–8% darker. Weight 800 / padding 4px 14px / letter-spacing .5px kept from prior commit.
  c+='.pill-h{display:inline-block;background:#F4D6D6;color:#8E4444;font-size:9.5pt;font-weight:800;padding:4px 14px;border-radius:10px;letter-spacing:.5px;flex-shrink:0;}';
  c+='.pill-l{display:inline-block;background:#F5E2C8;color:#8E6240;font-size:9.5pt;font-weight:800;padding:4px 14px;border-radius:10px;letter-spacing:.5px;flex-shrink:0;}';
  c+='.pill-c{display:inline-block;background:#D2EBDC;color:#426B4F;font-size:9.5pt;font-weight:800;padding:4px 14px;border-radius:10px;letter-spacing:.5px;flex-shrink:0;}';
  // S154: Site Records pill — internal-use-only marker. Indigo to match the pin teardrop
  // colour (#6B6FA8). Replaces the Outstanding/Closed pill on Site Records items so
  // they're instantly identifiable in the internal report. Sized identical to .pill-h/l/c.
  c+='.pill-sr{display:inline-block;background:#DCDEF0;color:#3F4470;font-size:9.5pt;font-weight:800;padding:4px 14px;border-radius:10px;letter-spacing:.5px;flex-shrink:0;}';
  // S269: Recommendation status pill — muted tan, same family as .rec-chip
  // (#DDD8CB/#5E5440), sized like the other status pills. Used instead of an
  // "Outstanding" pill on open recommendations so a rec is never labelled
  // Outstanding (mutually-exclusive categories).
  c+='.pill-rec{display:inline-block;background:#DDD8CB;color:#5E5440;font-size:9.5pt;font-weight:800;padding:4px 14px;border-radius:10px;letter-spacing:.5px;flex-shrink:0;}';
  // S318: page-1 dashboard Report Legend (replaces Resolution Progress in the
  // right dashboard box — Mark-approved demo page1_dashboard_demo.html). Scoped
  // compact pills: same canon colours as .pill-h/.pill-l/.pill-c/.rec-chip but
  // slightly smaller (8.5pt, min-width 74px, centred) to fit the narrower column.
  // Scoped so the full-size standalone .pill-* (body cards) are untouched.
  c+='.dash-key{flex:1;display:flex;flex-direction:column;justify-content:center;}';
  c+='.dash-key-row{display:flex;align-items:center;gap:9px;margin:4px 0;font-size:9pt;color:#4A5568;}';
  // S336 (Mark-LOCKED): page-1 two-bar row (Project Resolution + This Visit).
  // Muted palette — green fill #5F8068 (closed/pass semantic), no bright tones.
  // Sized to match the live dashboard (no scale-up; bars are the only addition).
  c+='.p1-bars{display:flex;gap:14px;margin-top:12px;}';
  c+='.p1-barbox{flex:1;border:1px solid #DDE1E7;border-radius:6px;padding:9px 13px;}';
  c+='.p1-bt{font-size:9.5pt;font-weight:700;color:#2A3A5C;margin-bottom:7px;display:flex;justify-content:space-between;align-items:baseline;}';
  c+='.p1-bt-sub{font-weight:500;color:#8A90A0;font-size:8.5pt;}';
  c+='.p1-big{font-size:12pt;font-weight:800;color:#5F8068;}';
  c+='.p1-track{height:10px;border-radius:6px;background:#EDEAF0;overflow:hidden;}';
  c+='.p1-fill{height:100%;border-radius:6px;background:linear-gradient(90deg,#5F8068,#7BA98C);}';
  c+='.p1-subline{font-size:8.5pt;color:#6B7B8C;margin-top:6px;}';
  c+='.p1-delta{display:flex;gap:18px;align-items:center;}';
  c+='.p1-dstat{display:flex;align-items:baseline;gap:6px;}';
  c+='.p1-v{font-size:14pt;font-weight:800;}';
  c+='.p1-up{color:#A85959;}.p1-dn{color:#5F8068;}';
  c+='.p1-k{font-size:9pt;color:#4A5568;}';
  c+='.dash-key .dk-pill{border-radius:11px;padding:2px 11px;font-size:8.5pt;font-weight:700;flex:none;min-width:74px;text-align:center;letter-spacing:.3px;}';
  c+='.dash-key .dk-h{background:#F4D6D6;color:#8E4444;}';
  c+='.dash-key .dk-l{background:#F5E2C8;color:#8E6240;}';
  c+='.dash-key .dk-c{background:#D2EBDC;color:#426B4F;}';
  c+='.dash-key .dk-rec{background:#DDD8CB;color:#5E5440;}';
  // .so/.sc kept — used by summary tables / appendix. (IAR badge removed S444; feature retired S135.)
  c+='.so{color:#A85959;font-weight:700;font-size:11pt;}.sc{color:#5F8068;font-weight:700;font-size:11pt;}';
  // S118: 3-up photo grid (was 2-up flow with 160×160 tiles)
  c+='.dp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:6px 0;}';
  c+='.dp-grid a{display:block;width:100%;text-decoration:none;}';
  c+='.dp{width:100%;aspect-ratio:4/3;background-size:cover;background-position:center;background-repeat:no-repeat;border-radius:4px;border:1px solid #DDE1E7;display:block;}';
  // S118: follow-up section (replaces "General Activity") — compact rows, no bg colors
  c+='.fu-grp{font-size:9.5pt;font-weight:700;color:#4A5568;letter-spacing:0.4px;text-transform:uppercase;margin:10px 0 4px;display:flex;justify-content:space-between;border-bottom:0.5px solid #DDE1E7;padding-bottom:3px;}';
  c+='.fu-row{padding:3px 0;line-height:1.4;}';
  c+='.fu-row + .fu-row{border-top:0.5px dotted #E5E7EB;}';
  c+='.fu-meta{font-size:9.5pt;display:flex;gap:10px;align-items:baseline;}';
  c+='.fu-author-ctr{color:#B07F5A;font-weight:700;}';
  c+='.fu-author-arc{color:#5078A0;font-weight:700;}';
  c+='.fu-date{color:#6B7B8C;font-size:9pt;}';
  c+='.fu-body{font-size:10.5pt;color:#1C2333;margin-top:1px;}';
  c+='.st{width:100%;border-collapse:collapse;font-size:11pt;margin-top:0;}';
  c+='.st th{background:#2A3A5C;color:white;padding:6px 10px;text-align:left;font-size:11pt;font-weight:700;}';
  c+='.st td{padding:6px 10px;border-bottom:1px solid #DDE1E7;font-size:11pt;}';
  c+='.sh{background:#2A3A5C;color:white;padding:7px 14px;font-weight:700;font-size:12pt;border-radius:6px 6px 0 0;margin-top:16px;margin-bottom:0;letter-spacing:.3px;}';
  // S145 P1 (Mark): Recommendation section title = left-bar section card
  // (Option C). Reuses the report's existing appendix-title idiom
  // (#F7F8FA fill + 4px burgundy left bar, square corners) so it is
  // native to the report; navy title, muted italic sub-line. Full mode
  // only — emitted on a forced new page above the Recommendation Summary;
  // recs-only mode omits it (the page title already reads "Field Review
  // Report-Recommendation #N").
  // S145 P1 (Mark, FINAL): Option I — no box, bar, fill or rule. 15pt
  // navy title + left-aligned muted scope sentence beneath. Type-only
  // hierarchy; the Recommendation Summary follows with its own gap.
  c+='.rec-secttl{margin:0 0 14px;}';
  c+='.rec-secttl-ttl{font-size:15pt;font-weight:700;color:#2A3A5C;letter-spacing:.3px;line-height:1;}';
  c+='.rec-secttl-sub{font-size:10pt;font-weight:400;color:#5A6473;line-height:1.4;margin-top:5px;text-align:left;}';
  c+='.sb{border:1px solid #DDE1E7;border-top:none;padding:12px;border-radius:0 0 6px 6px;margin-bottom:0;}';
  c+='.app-dwg{margin-bottom:28px;}';
  c+='.app-dwg-title{font-weight:700;font-size:12pt;color:#1C2333;margin-bottom:8px;padding:6px 10px;background:#F7F8FA;border-radius:4px;border-left:3px solid #9C2742;}';
  c+='.app-dwg img{max-width:100%;height:auto;display:block;border:1px solid #DDE1E7;border-radius:4px;}';
  c+='.app-pin-table{width:100%;border-collapse:collapse;font-size:11pt;margin-top:8px;}';
  c+='.app-pin-table th{background:#F7F8FA;padding:4px 8px;text-align:left;vertical-align:top;border-bottom:1px solid #DDE1E7;font-size:11pt;}';
  c+='.app-pin-table td{padding:4px 8px;vertical-align:top;border-bottom:1px solid #F0F0F0;font-size:11pt;}';
  /* S146 (Mark): Pin # must stay on ONE row. Pin/Status/Contractor shrink to
     their content (width:1% + nowrap on auto table-layout); Description is
     the only unconstrained column so it absorbs the remaining width and the
     "#1-A" label can never break at the hyphen. */
  /* S317: cols are now Item|Pin|Description|Status|Contractor. Item(1) Pin(2)
     Status(4) Contractor(5) shrink-to-fit nowrap; Description(3) takes the slack. */
  c+='.app-pin-table th:nth-child(1),.app-pin-table td:nth-child(1),.app-pin-table th:nth-child(2),.app-pin-table td:nth-child(2){white-space:nowrap;width:1%;}';
  c+='.app-pin-table th:nth-child(4),.app-pin-table td:nth-child(4),.app-pin-table th:nth-child(5),.app-pin-table td:nth-child(5){white-space:nowrap;width:1%;}';
  c+='.title-block{text-align:center;margin:12px 0 0;padding:14px 0 12px;line-height:0.85;}';
  c+='.title-block .tb-line1{font-family:'+blairFam+';font-size:12pt;font-weight:400;color:#1C2333;letter-spacing:1px;margin-bottom:1px;}';
  c+='.title-block .tb-line2{font-family:'+blairFam+';font-size:12pt;font-weight:400;color:#1C2333;margin-bottom:10px;}';
  c+='.title-block .tb-line4{font-family:Calibri,sans-serif;font-size:12pt;font-weight:700;color:#333;line-height:1.23;margin-bottom:2px;}';
  c+='.pi-list{margin-top:4px;padding:10px 0;border-top:2px solid #1C2333;border-bottom:2px solid #1C2333;}';
  c+='.pi-row{display:flex;gap:10px;margin-bottom:3px;font-family:Calibri,sans-serif;font-size:11pt;line-height:1.23;}.pi-row:last-child{margin-bottom:0;}';
  c+='.pi-label{min-width:145px;font-weight:400;color:#1C2333;}.pi-value{flex:1;min-width:0;font-weight:400;color:#1C2333;overflow-wrap:break-word;}';
  c+='@media print{body{background:white!important;padding:0!important;margin:0!important;}.page{width:auto!important;min-height:auto!important;margin:0!important;padding:0.5in 0.6in!important;box-shadow:none!important;page-break-after:always;}.page:last-child{page-break-after:auto;}#pdf-btn-bar{display:none!important;}#pdf-progress-wrap{display:none!important;}.page.p11x17{page:tabloidpg;}.page.p24x36{page:archpg;}}';
  c+='@page{size:letter;margin:0;}';
  // S346: named page sizes for the mixed-size appendix. Body pages use the
  // default @page (letter); appendix sheets tagged .p11x17/.p24x36 map to these.
  c+='@page tabloidpg{size:17in 11in;margin:0;}';
  c+='@page archpg{size:36in 24in;margin:0;}';
  return c;
}

function _exportPDFWithCache(p,logo,isField,mode,r2Cache,ctrFilter,isFinalComm,showClosedSummary,fontB64,untaggedMode,includeRecs,recsMode,includeSiteRecords,recFooter,inspTag,drawingPageSize,internalMode){
var date=new Date().toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'});
// S(this): chosen appendix drawing-sheet size. Controls ONLY the appendix
// drawing sheets in the mixed-page renderer; report body always stays Letter
// portrait. Plumbing only this step — value is carried + validated but the
// appendix still renders Letter until the mixed-page render pass lands (step 2).
var _drawPageSize=(drawingPageSize==='11x17'||drawingPageSize==='24x36')?drawingPageSize:'letter';
// S139 Phase 3: untagged-trade routing.
//   _untaggedMode 'show'   -> untagged pins render in an "Other Trade Items"
//                              band, after all real trades.
//   _untaggedMode 'exclude'-> that whole band is omitted from the report.
var _untaggedMode=(untaggedMode==='exclude')?'exclude':'show';
// S142 Batch 3-2 (Model 2 §4.4): recommendations are no longer badged
// in-place. Every isRecommendation row is pulled OUT of the trade /
// contractor / Other-Trade-Items sections into ONE pooled
// "Recommendations" section emitted on a forced new page AFTER
// Previously Closed Items (disjoint — each rec appears exactly once).
//   _recsMode 'bottom'  -> pooled section at the end (default).
//   _recsMode 'exclude' -> recs dropped entirely (no pooled section).
//   _recsMode 'only'    -> recommendations-only report; finalized in
//                          Batch 3-4 with the modal radio. Treated as
//                          finalized in Batch 3-4 (this slice).
// Back-compat: if a caller still passes only the binary includeRecs,
// false => 'exclude', else 'bottom'.
var _recsMode=(recsMode==='exclude'||recsMode==='bottom'||recsMode==='only')
  ? recsMode : ((includeRecs===false)?'exclude':'bottom');
// Optional italic footer under the pooled Recommendations section.
// Default ON (Mark — demo default). Batch 3-4 wires the modal toggle.
var _recFooter=(recFooter!==false);
// Site Records (reserved no-contractor scope) stay excluded from the
// external report by default; Batch 3-4 activates this opt-in toggle.
var _includeSiteRecords=(includeSiteRecords===true);
var reportDefs=[];var rn=1;
var _ctrFilterId=ctrFilter||'__all__';var _ctrFilterName='';
// S(this) — multi-contractor: ctrFilter may now be a comma-joined set of
// contractor ids (e.g. "ctr_a,ctr_b") in addition to the sentinels '__all__'
// and '__general__' and a single id. Build a membership set + a flag. A single
// id still works (set of size 1). '__all__'/'__general__' keep their meaning.
var _ctrSet=null;
if(_ctrFilterId!=='__all__'&&_ctrFilterId!=='__general__'&&_ctrFilterId.indexOf(',')>=0){
  _ctrSet={};_ctrFilterId.split(',').forEach(function(id){id=id.trim();if(id)_ctrSet[id]=1;});
}
function _ctrIncluded(cid){
  if(_ctrFilterId==='__all__')return true;
  if(_ctrFilterId==='__general__')return false;
  if(_ctrSet)return !!_ctrSet[cid];
  return cid===_ctrFilterId;
}
// S119 hotfix: per-obs description (text) and status (addressed). Used by
// the per-drawing appendix table and the closed-summary table — without
// these helpers both tables show pin-level data identical for every obs row,
// which means a 2-obs pin renders as two duplicated rows (Mark report).
function _itemDesc(r){
  if(r.obs&&r.obs.text)return r.obs.text;
  return _deficDesc(r.d);
}
function _itemIsOpen(r){
  if(r.obs&&r.obs.addressed!==undefined)return !r.obs.addressed;
  return _deficIsOpen(r.d);
}
// S118: flatten observations — each obs becomes its own report item.
// Multi-obs pins render as multiple cards sharing the pin number (visible
// in the minimap teardrop). Pin editor still shows multi-obs UI; this
// flattening only applies to PDF rendering (Summary/Deficiency tabs in
// future S118 sessions). Legacy defics with no observations array fall
// through as a single-card item with obsIdx:0.
// S119: per-obs priority filter — skip individual general-priority obs
// rather than dropping the whole pin. A pin with mixed priorities now
// emits cards only for its non-general obs.
// S119 hotfix: per-obs contractor override. If obs.contractorId is set
// and matches a real contractor in p.contractors, use that contractor's
// name as the grouping key for this report item — so an obs assigned to
// a different contractor than its parent pin renders under the right
// section. Falls back to the pin's parent ctrName when the override is
// absent or points to an unknown id.
// S119 Push F: cross-contractor suffix. When a single pin's obs span more
// than one effective contractor, every obs of that pin gets a letter
// suffix on its display label (#4-A, #4-B, ...). Cross-references between
// the per-section cards and the appendix table stay unambiguous: the
// reader can find #4-A as a Vipond card and #4-B as a Site Records card,
// both pointing to the same physical pin teardrop on the drawing image.
// When all obs share one contractor, no suffix — labels stay as plain #N.
function _pushItems(d,ctrName){
  var obs=d.observations&&d.observations.length?d.observations:null;
  if(obs){
    // Pre-compute each obs's effective contractor so we can detect cross-
    // contractor pins (and reuse the lookup for the per-item r.ctr below).
    var obsEffCtrs=obs.map(function(o){
      if(o&&o.contractorId){
        var fc=(p.contractors||[]).find(function(c){return c.id===o.contractorId;});
        if(fc)return fc.name;
      }
      return ctrName;
    });
    // S121 Push 3: universal suffixing — every obs of a multi-obs pin
    // gets a letter suffix (#3-A, #3-B), regardless of contractor span.
    // Pre-S121 only cross-contractor pins got suffixes; same-contractor
    // multi-obs emitted duplicate labels (#3 / #3) which Mark flagged
    // as confusing. Cross-contractor still produces the same labels.
    var needsSuffix=obs.length>1;
    obs.forEach(function(o,oi){
      // S217: 'general' priority retired. The S119 skip that dropped
      // general obs from the report body is gone — migration moves true
      // general pins to Site Records (rendered via the __general__ path);
      // any stray 'general' now renders as a normal (low) item rather than
      // vanishing silently from the report.
      var label=needsSuffix?(d.num+String.fromCharCode(65+oi)):String(d.num||'?'); // S269: #2B (no dash)
      reportDefs.push({d:d,obs:o,obsIdx:oi,ctr:obsEffCtrs[oi],rn:rn++,numLabel:label});
    });
  }else{
    // S217: 'general' priority retired — no 0-obs general skip (see above).
    reportDefs.push({d:d,obs:null,obsIdx:0,ctr:ctrName,rn:rn++,numLabel:String(d.num||'?')});
  }
}
(p.contractors||[]).forEach(function(c){
  if(!_ctrIncluded(c.id))return;
  (c.deficiencies||[]).forEach(function(d){_pushItems(d,c.name);});
});
if(_ctrFilterId==='__all__'||_ctrFilterId==='__general__'){
  // S142 Batch 3-4 (Model 2 §4.1): a no-contractor general deficiency
  // that is NOT a recommendation is a Site Record — informational,
  // internal-only, EXCLUDED from external reports by default. It enters
  // the report only when the modal's "Include Site Records (internal)"
  // is on, OR the user explicitly filtered the export to Site Records
  // (in which case excluding everything would yield a confusing blank
  // report). Recommendations among the general defics are NEVER Site
  // Records — they always flow through to the pooled Recommendations
  // section (subject to _recsMode), so they are not gated here.
  var _srOptIn=_includeSiteRecords||_ctrFilterId==='__general__';
  (p.generalDeficiencies||[]).forEach(function(d){
    if(!_srOptIn&&!(d&&d.isRecommendation))return;
    _pushItems(d,SITE_RECORDS_LABEL);
  });
}
if(_ctrFilterId==='__general__')_ctrFilterName=SITE_RECORDS_LABEL;
// S(this) — multi-contractor subtitle/filename label. Single id -> that name;
// a set -> names joined " + " (in roster order, so the label is stable).
if(_ctrFilterId!=='__all__'&&_ctrFilterId!=='__general__'){
  var _selNames=(p.contractors||[]).filter(function(c){return _ctrIncluded(c.id);})
                 .map(function(c){return c.name||'Unnamed';});
  _ctrFilterName=_selNames.join(' + ');
}

var _curInst=p.currentFrtInstance||1;
// S119: per-observation status filter. An obs is included if:
//   - it's not addressed (still outstanding), OR
//   - it was addressed in the current FRT instance (so the report shows
//     "newly closed this round").
// Falls back to pin-level d.status / d.closedOnInstance for legacy obs that
// lack the per-obs addressed metadata. This replaces the pre-S119 filter
// that operated only on r.d.status, which would either include or exclude
// every obs of a given pin together regardless of per-obs state.
var mainBodyDefs=reportDefs.filter(function(r){
  var obs=r.obs;
  if(obs&&obs.addressed!==undefined){
    if(!obs.addressed)return true;
    var inst=obs.addressedOnInstance||r.d.closedOnInstance||1;
    return inst===_curInst;
  }
  // Legacy fallback (pre-S119 obs without addressed metadata)
  if(_deficIsOpen(r.d))return true;
  if(_deficIsClosed(r.d)&&(r.d.closedOnInstance||1)===_curInst)return true;
  return false;
});
// S142 Batch 3-2 (Model 2): only the 'exclude' mode strips recs from the
// body. For 'bottom' the rec rows stay in mainBodyDefs and the grouping
// loop diverts them into the pooled Recommendations section instead of
// the trade/contractor bands (disjoint — no in-place rec sub-bands, no
// "Site Records · Recommendations" band).
if(_recsMode==='exclude'){mainBodyDefs=mainBodyDefs.filter(function(r){return !(r.d&&r.d.isRecommendation);});}
// S118: renumber items sequentially after filter so r.rn is 1,2,3... with no gaps
mainBodyDefs.forEach(function(r,i){r.rn=i+1;});
// S119: closed-summary appendix — items addressed in any instance (per-obs aware)
// S155: recommendations have their own dedicated "Previously Closed
// Recommendations" section (built downstream via _prevClosedRecs at line ~852
// and rendered via _recPrevClosedHtml at line ~917). They must NEVER appear
// in this deficiency "Previously Closed Items" table — same exclusion the
// title-page summaryDefs filter already applies at line 577.
var closedSummaryDefs=reportDefs.filter(function(r){
  if(r.d&&r.d.isRecommendation)return false;
  var obs=r.obs;
  if(obs&&obs.addressed!==undefined)return !!obs.addressed;
  return _deficIsClosed(r.d);
});
var css=_buildCSS(fontB64);
var _rptNum=p.currentFrtInstance||1;
// S144 §5: report title base. Recs-only documents read
// "Field Review Report-Recommendation" (hyphen, no surrounding spaces,
// singular); all other modes "Field Review Report". A per-project
// override (p.info.reportTitleOverride — DATA, not code) wins when set,
// so a special client title ships with no redeploy. The report number
// is appended downstream as ' #N' and is NEVER part of the override
// (automatic, non-editable).
var _rptTitleOverride=(p.info&&p.info.reportTitleOverride&&String(p.info.reportTitleOverride).trim())||'';
var _rptTitleBase=_rptTitleOverride||((_recsMode==='only')?'Field Review Report-Recommendation':'Field Review Report');
var _rptRev=(p.info&&p.info.revision)||'A01';
var _ctrSubtitle='';
if(_ctrFilterId!=='__all__'&&_ctrFilterName)_ctrSubtitle=_ctrFilterName;

// Full header
// S391: internal Site-Records report — Option-B page-1 mark (thin top rule +
// corner tag) in the locked report ink #1C2333 (muted-only rule; not burgundy).
var _internalBanner = internalMode
  ? '<div style="position:relative;border-top:3px solid #1C2333;margin-bottom:8px;">'
    + '<div style="position:absolute;top:0;right:0;background:#1C2333;color:#fff;font-size:8pt;font-weight:700;letter-spacing:.5px;padding:3px 9px;border-bottom-left-radius:5px;text-transform:uppercase;">Internal \u2014 not for external issue</div>'
    + '</div>'
  : '';
var fullHeader=_internalBanner+'<div class="ph"><div><img src="'+logo+'" alt="ARENCON"></div>';
fullHeader+='<div class="ph-addr">1551 CATERPILLAR ROAD, SUITE 206<br>MISSISSAUGA, ON &nbsp;&nbsp; L4X 2Z6<br>CANADA<br><br>P: 905 615 1774<br>F: 905 615 9351<br>E: mail'+'@'+'arencon.com</div></div>';
var titleBlock='<div class="title-block"><div class="tb-line1">Fire Protection Engineering</div>';
titleBlock+='<div class="tb-line2">'+esc(_rptTitleBase)+' #'+_rptNum+'</div>';
var _tbCA=[];
if(p.info&&p.info.client)_tbCA.push(esc(p.info.client));
if(p.info&&p.info.address)_tbCA.push(esc(p.info.address));
if(_tbCA.length)titleBlock+='<div class="tb-line4">'+_tbCA.join(' - ')+'</div>';
if(p.info&&p.info.projectName)titleBlock+='<div class="tb-line4">'+esc(p.info.projectName)+'</div>';
titleBlock+='</div>';
fullHeader+=titleBlock;

// Project info
// S346 (#1, Mark): the Distribution line must reflect the export modal's actual
// selection — including manually-added "Other recipients" (e.g. CBRE). The modal
// saves that selection to p.distribution; use it as the source of truth. Only
// fall back to the old client+contractors derivation when no distribution was
// ever saved (legacy projects / direct export without opening the modal).
var _pdfDP=[];
if(internalMode){
  // Internal Site-Records report: never carries an external distribution line.
  _pdfDP.push('Internal \u2014 ARENCON only');
}else if(Array.isArray(p.distribution)&&p.distribution.length){
  p.distribution.forEach(function(n){if(n)_pdfDP.push(n);});
}else{
  if(p.info&&p.info.client)_pdfDP.push(p.info.client);
  if(_ctrSubtitle){if(_ctrSubtitle!==(p.info&&p.info.client))_pdfDP.push(_ctrSubtitle);}
  else{(p.contractors||[]).forEach(function(c){if(c.name!==(p.info&&p.info.client))_pdfDP.push(c.name);});}
}
var infoGrid='<div class="pi-list">';
[['Date of Issue:',(p.info&&p.info.dateOfIssue)||'\u2014'],
['Date of Site Review:',(p.info&&p.info.visitDate)||'\u2014'],
['Distribution:',_pdfDP.join(', ')||'\u2014'],
['Prepared By:',(p.info&&p.info.inspectorName)||'\u2014'],
['Project No.:',(p.info&&p.info.projectNumber)||'\u2014']].forEach(function(f){
  infoGrid+='<div class="pi-row"><span class="pi-label">'+f[0]+'</span><span class="pi-value">'+esc(f[1])+'</span></div>';
});
infoGrid+='</div>';

// Summary table
// S139 Phase 3 (D), KEPT under Model 2: count distinct High-priority
// recommendation pins in the main body. _recsMode='exclude' ⇒ recs
// already stripped ⇒ count 0 ⇒ note suppressed automatically. For
// 'bottom' the note points the reader to the pooled Recommendations
// section (which is titled exactly "Recommendations").
var _hiRecIds={};
mainBodyDefs.forEach(function(r){
  if(r.d&&r.d.isRecommendation){
    var _hp=(r.obs&&r.obs.priority)||r.d.priority||'high';
    if(_hp==='high')_hiRecIds[r.d.id]=1;
  }
});
var _hiRecCount=Object.keys(_hiRecIds).length;
// S119: per-obs aware Outstanding/Closed predicates (shared by the
// Deficiency Summary and the new Recommendation Summary).
function _rowOpen(r){
  if(r.obs&&r.obs.addressed!==undefined)return !r.obs.addressed;
  return _deficIsOpen(r.d);
}
function _rowClosed(r){
  if(r.obs&&r.obs.addressed!==undefined)return !!r.obs.addressed;
  return _deficIsClosed(r.d);
}
// S144 §1: the Deficiency Summary is now DEFICIENCIES ONLY — recs are
// filtered out (they get their own Recommendation Summary). Resolves the
// pre-S143 rec double-count where recs were tallied on both tables.
var summaryDefs=reportDefs.filter(function(r){return !(r.d&&r.d.isRecommendation);});

// S336 (Mark-LOCKED, page1_twobar_livesize_demo): two summary bars on page 1,
// inserted between the dashboard and the Deficiency Summary table. They add
// information the table does NOT carry, so they are not redundant:
//   Bar 1 — Project Resolution (CUMULATIVE, all visits): closedEver / totalEver
//     as a %. summaryDefs already spans every visit (reportDefs is built from
//     p.contractors[].deficiencies, not instance-filtered), so totalEver and
//     closedEver equal the summary table's Total and Closed columns exactly.
//   Bar 2 — This Visit (FRT #_curInst): "+N new found · -M prior closed" counts.
//     new      = notedOnInstance === _curInst (same basis as "New This Report")
//     priorCls = closed AND closedOnInstance === _curInst AND noted on an
//                EARLIER instance (items closed THIS visit that were raised in
//                a previous report — the genuinely new info the table omits).
// Deficiencies only (recs excluded, mirroring the summary table). Rendered only
// in full/deficiency mode; recs-'only' mode keeps its own summary untouched.
var _progressBarsHtml='';
if(summaryDefs.length){
  var _totalEver=summaryDefs.length;
  var _closedEver=summaryDefs.filter(_rowClosed).length;
  var _resPct=_totalEver?Math.round((_closedEver/_totalEver)*100):0;
  var _newThis=summaryDefs.filter(function(r){return (r.d.notedOnInstance||1)===_curInst;}).length;
  var _priorClosed=summaryDefs.filter(function(r){
    if(!_rowClosed(r))return false;
    var ci=(r.obs&&r.obs.addressed!==undefined)?(r.obs.addressedOnInstance||r.d.closedOnInstance||1):(r.d.closedOnInstance||1);
    var ni=(r.d.notedOnInstance||1);
    return ci===_curInst && ni<_curInst;
  }).length;
  _progressBarsHtml=''
    +'<div class="p1-bars">'
      +'<div class="p1-barbox">'
        +'<div class="p1-bt"><span>Project Resolution <span class="p1-bt-sub">(all visits)</span></span><span class="p1-big">'+_resPct+'%</span></div>'
        +'<div class="p1-track"><div class="p1-fill" style="width:'+_resPct+'%;"></div></div>'
        +'<div class="p1-subline">'+_closedEver+' of '+_totalEver+' deficiencies closed since project start</div>'
      +'</div>'
      +'<div class="p1-barbox">'
        +'<div class="p1-bt"><span>This Visit (FRT #'+_curInst+')</span></div>'
        +'<div class="p1-delta">'
          +'<div class="p1-dstat"><span class="p1-v p1-up">+'+_newThis+'</span><span class="p1-k">new found</span></div>'
          +'<div class="p1-dstat"><span class="p1-v p1-dn">−'+_priorClosed+'</span><span class="p1-k">prior closed</span></div>'
        +'</div>'
        +'<div class="p1-subline">Activity recorded during this site review</div>'
      +'</div>'
    +'</div>';
}
var _deficSummaryHtml='';
var _dashHtmlFull='',_dashHtmlCompact='';
if(summaryDefs.length){
  var ctrG={};summaryDefs.forEach(function(r){if(!ctrG[r.ctr])ctrG[r.ctr]=[];ctrG[r.ctr].push(r);});
  // S284 (Mark-approved rev C): COMPACT summary table — 10pt cells, 4px
  // vertical padding, 10px top gap (was default .st sizing + 16px). Inline
  // so the rec-summary table (shared .st class) keeps its original sizing.
  var _cTd='padding:4px 10px;font-size:10pt;';
  _deficSummaryHtml+='<div style="border:1px solid #DDE1E7;border-radius:6px;margin-top:10px;overflow:hidden;"><table class="st" style="font-size:10pt;"><thead><tr><th style="'+_cTd+'">Deficiency Summary</th><th style="'+_cTd+'text-align:center;">Total</th><th style="'+_cTd+'text-align:center;">New This Report</th><th style="'+_cTd+'text-align:center;">Outstanding</th><th style="'+_cTd+'text-align:center;">Closed</th></tr></thead><tbody>';
  Object.keys(ctrG).forEach(function(ctr){
    var gc=ctrG[ctr];
    _deficSummaryHtml+='<tr><td style="'+_cTd+'"><strong>'+esc(ctr)+'</strong></td><td style="'+_cTd+'text-align:center;">'+gc.length+'</td>';
    _deficSummaryHtml+='<td style="'+_cTd+'text-align:center;color:#1565C0;font-weight:700;">'+gc.filter(function(r){return(r.d.notedOnInstance||1)===_curInst;}).length+'</td>';
    _deficSummaryHtml+='<td style="'+_cTd+'text-align:center;color:#A85959;font-weight:700;">'+gc.filter(_rowOpen).length+'</td>';
    _deficSummaryHtml+='<td style="'+_cTd+'text-align:center;color:#5F8068;font-weight:700;">'+gc.filter(_rowClosed).length+'</td></tr>';
  });
  _deficSummaryHtml+='<tr style="border-top:2px solid #9C2742;font-weight:700;"><td style="'+_cTd+'">Total</td><td style="'+_cTd+'text-align:center;">'+summaryDefs.length+'</td>';
  _deficSummaryHtml+='<td style="'+_cTd+'text-align:center;color:#1565C0;">'+summaryDefs.filter(function(r){return(r.d.notedOnInstance||1)===_curInst;}).length+'</td>';
  _deficSummaryHtml+='<td style="'+_cTd+'text-align:center;color:#A85959;">'+summaryDefs.filter(_rowOpen).length+'</td>';
  _deficSummaryHtml+='<td style="'+_cTd+'text-align:center;color:#5F8068;">'+summaryDefs.filter(_rowClosed).length+'</td></tr>';
  _deficSummaryHtml+='</tbody></table></div>';
  // S341 (Mark): the closing "further deficiencies may be noted" note now sits
  // directly UNDER the Deficiency Summary table (page 1) instead of trailing the
  // body cards. Page 1 layout is settled and never sits at a precarious page
  // boundary, so the note can never be orphaned onto its own blank sheet (the
  // problem it had at the end of the body). It also reads better as a footnote
  // to the summary. Same gate as the old end-of-body placement: skip for
  // final-commissioning reports and recs-only mode.
  if(!isFinalComm&&_recsMode!=='only'){
    _deficSummaryHtml+='<div style="margin-top:8px;font-size:10pt;color:#555;font-style:italic;">Note: Further deficiencies may be noted in future field reports following final commissioning.</div>';
  }
  // ── S284 (Mark-approved rev C): page-1 dashboard — Status Overview two-ring
  // donut + Resolution Progress bars. Pure SVG (prints crisp, no canvas).
  // Numbers come from the SAME predicates as the summary table above
  // (notedOnInstance/_rowOpen/_rowClosed), so chart and table can never
  // disagree. Outer ring = status (red high / amber low / green closed);
  // inner thin ring = new-this-report (blue) vs carried-over (grey) — a 4th
  // outer slice would double-count, since a new item is also high/low/closed.
  // _dashHtmlCompact (overall bar only, no per-contractor rows) is the
  // auto-compact fallback applied at measure time when page 1 would overflow.
  (function(){
    var T=summaryDefs.length;
    var _isNewRow=function(r){return(r.d.notedOnInstance||1)===_curInst;};
    var N=summaryDefs.filter(_isNewRow).length;
    var CLn=summaryDefs.filter(_rowClosed).length;
    var _openRows=summaryDefs.filter(_rowOpen);
    var _isHighRow=function(r){return(((r.obs&&r.obs.priority)||r.d.priority||'high')==='high');};
    var HIn=_openRows.filter(_isHighRow).length;
    var LOn=_openRows.length-HIn;
    // S284 A3 (Mark-locked): new split by priority, OPEN rows only — one visit
    // per report means a new item is never closed on its own report (a
    // same-instance closure would be user error: it still counts in N and the
    // table, but draws no arc).
    var _newOpen=_openRows.filter(_isNewRow);
    var nHI=_newOpen.filter(_isHighRow).length;
    var nLO=_newOpen.length-nHI;
    var pct=T?Math.round(CLn/T*100):0;
    var CH='#A85959',CW='#C98A4A',CC='#5F8068',CN='#1565C0',CG='#C9CDD4';
    function _ring(r,sw,track,segs){
      var circ=2*Math.PI*r,off=0,s='<circle cx="50" cy="50" r="'+r+'" fill="none" stroke="'+track+'" stroke-width="'+sw+'"/>';
      segs.forEach(function(g){if(g.v<=0)return;var len=g.v/T*circ;
        s+='<circle cx="50" cy="50" r="'+r+'" fill="none" stroke="'+g.c+'" stroke-width="'+sw+'" stroke-dasharray="'+len.toFixed(1)+' '+circ.toFixed(1)+'" stroke-dashoffset="'+(-off).toFixed(1)+'"/>';off+=len;});
      return s;
    }
    // S284 A3 inner ring: blue arcs ALIGNED under the red/amber segments,
    // butt caps, no splitter (the carried remainder of each segment is the
    // separation). S336 (Mark): the old "hide when ALL items are new" guard was
    // wrong — on report #1 every outstanding item IS new, and the arcs sit under
    // the high/low segments (not as one full circle), so they correctly read
    // "these outstanding items are all new finds." Removed the N>=T suppression;
    // kept the (nHI+nLO)<=0 guard (no new OUTSTANDING items -> nothing to mark;
    // arcs never sit under green).
    function _innerA3(){
      var circ=2*Math.PI*29;
      if((nHI+nLO)<=0)return '';
      var s='<circle cx="50" cy="50" r="29" fill="none" stroke="#EDEAF0" stroke-width="5"/>';
      if(nHI>0)s+='<circle cx="50" cy="50" r="29" fill="none" stroke="'+CN+'" stroke-width="5" stroke-dasharray="'+((nHI/T)*circ).toFixed(1)+' '+circ.toFixed(1)+'"/>';
      if(nLO>0)s+='<circle cx="50" cy="50" r="29" fill="none" stroke="'+CN+'" stroke-width="5" stroke-dasharray="'+((nLO/T)*circ).toFixed(1)+' '+circ.toFixed(1)+'" stroke-dashoffset="'+(-((HIn/T)*circ)).toFixed(1)+'"/>';
      return s;
    }
    var _donut='<svg width="100" height="100" viewBox="0 0 100 100" style="transform:rotate(-90deg);flex:none;">'
      +_ring(43,12,'#EDEAF0',[{v:HIn,c:CH},{v:LOn,c:CW},{v:CLn,c:CC}])
      +_innerA3()
      +'</svg>';
    var _ctrLbl='<div style="position:relative;width:100px;height:100px;flex:none;">'+_donut
      +'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;"><div style="font-size:17pt;font-weight:700;color:#1C2333;line-height:1;font-variant-numeric:tabular-nums;">'+T+'</div><div style="font-size:7.5pt;color:#607D8B;letter-spacing:1px;margin-top:1px;">ITEMS</div></div></div>';
    function _leg(sw,nm,v){return '<div style="display:flex;align-items:center;gap:8px;font-size:9.5pt;color:#4A5568;margin:3px 0;">'+sw+'<span>'+nm+'</span><span style="margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;color:#1C2333;">'+v+' \u00b7 '+(T?Math.round(v/T*100):0)+'%</span></div>';}
    var _dot=function(c){return '<span style="width:9px;height:9px;border-radius:50%;background:'+c+';flex:none;display:inline-block;"></span>';};
    var _rg='<span style="width:9px;height:9px;border-radius:50%;border:2.5px solid '+CN+';box-sizing:border-box;flex:none;display:inline-block;"></span>';
    var _legHtml=_leg(_dot(CH),'Outstanding \u2014 high',HIn)+_leg(_dot(CW),'Outstanding \u2014 low',LOn)+_leg(_dot(CC),'Closed',CLn)+_leg(_rg,'New this report',N);
    function _hbar(p,c){return '<div style="flex:1;height:7px;border-radius:4px;background:#E9E6EC;overflow:hidden;"><div style="width:'+p+'%;height:100%;border-radius:4px;background:'+c+';"></div></div>';}
    var _ovr='<div style="display:flex;align-items:center;gap:8px;font-size:9pt;color:#4A5568;margin-bottom:6px;"><span style="width:84px;font-weight:700;color:#1C2333;flex:none;">Overall</span>'+_hbar(pct,'#9C2742')+'<span style="width:30px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#1C2333;flex:none;">'+pct+'%</span></div>';
    var _CAP=6,_ctrKeys=Object.keys(ctrG),_bars='';
    _ctrKeys.slice(0,_CAP).forEach(function(ctr){
      var gc=ctrG[ctr],cl=gc.filter(_rowClosed).length,tt=gc.length,pp=tt?Math.round(cl/tt*100):0;
      _bars+='<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:9pt;color:#4A5568;"><span style="width:84px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none;">'+esc(ctr)+'</span>'+_hbar(pp,CC)+'<span style="width:30px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:#1C2333;flex:none;">'+cl+'/'+tt+'</span></div>';
    });
    if(_ctrKeys.length>_CAP)_bars+='<div style="font-size:8.5pt;color:#90A0AC;margin-top:2px;">\u2026 and '+(_ctrKeys.length-_CAP)+' more \u2014 see Deficiency Summary below</div>';
    // S318: right dashboard box = compact Report Legend (replaces Resolution
    // Progress — Mark-approved demo). One pill per row, four rows, vertically
    // centred. Numbers lived in the summary table already; the bars duplicated
    // them, so they're gone. The standalone .rep-key band is now dropped from
    // full/compact assembly (still used in recs-'only' mode) to avoid a dup legend.
    var _dashKeyHtml='<div class="dash-key">'
      +'<div class="dash-key-row"><span class="dk-pill dk-h">Outstanding</span>Outstanding \u2014 high priority</div>'
      +'<div class="dash-key-row"><span class="dk-pill dk-l">Outstanding</span>Outstanding \u2014 low priority</div>'
      +'<div class="dash-key-row"><span class="dk-pill dk-c">Closed</span>Addressed &amp; closed</div>'
      +'<div class="dash-key-row"><span class="dk-pill dk-rec">REC</span>Recommendation \u2014 does not hold off sign-off</div>'
      +'</div>';
    function _wrap(){
      return '<div style="display:flex;gap:14px;margin-top:12px;align-items:stretch;">'
        +'<div style="flex:1.05;border:1px solid #DDE1E7;border-radius:6px;padding:7px 11px;display:flex;flex-direction:column;"><div style="font-size:9.5pt;font-weight:700;color:#2A3A5C;">Status Overview</div><div style="flex:1;display:flex;align-items:center;gap:12px;">'+_ctrLbl+'<div style="flex:1;">'+_legHtml+'</div></div></div>'
        +'<div style="flex:1.1;border:1px solid #DDE1E7;border-radius:6px;padding:7px 11px;display:flex;flex-direction:column;"><div style="font-size:9.5pt;font-weight:700;color:#2A3A5C;margin-bottom:4px;">Report Legend</div>'+_dashKeyHtml+'</div></div>';
    }
    // Full and compact now render the SAME right box (the legend); the
    // per-contractor bars and _ovr/_bars are retired from page 1.
    _dashHtmlFull=_wrap();
    _dashHtmlCompact=_wrap();
  })();
}
// S143/S144 Report Legend (corrected). Navy-filled title bar, 4 entries,
// 2-col grid. Emit order high, Closed, low, REC ⇒ LEFT col Outstanding
// high (top) / Outstanding low (bottom); RIGHT col Closed (top) / REC
// (bottom) — Mark flagged this order 3×; this is the truth. The S143
// .th-band.recs band-swatch row is removed; REC gloss capitalised.
// Inspector-initials row only when the picker turned tags on. Reuses
// literal report classes so the legend can never drift from output.
// Page-1 in full/deficiency mode; in 'only' mode it rides as the first
// rec-section block right after the Recommendation Summary.
var _legendHtml='<div class="rep-key"><div class="rep-key-ttl">Report Legend</div><div class="rep-key-grid">';
_legendHtml+='<div class="rep-key-row"><span class="pill-h">Outstanding</span><span class="rep-key-gloss">Outstanding \u2014 high priority</span></div>';
_legendHtml+='<div class="rep-key-row"><span class="pill-c">Closed</span><span class="rep-key-gloss">Addressed &amp; closed</span></div>';
_legendHtml+='<div class="rep-key-row"><span class="pill-l">Outstanding</span><span class="rep-key-gloss">Outstanding \u2014 low priority</span></div>';
_legendHtml+='<div class="rep-key-row"><span class="rec-chip">REC</span><span class="rep-key-gloss">Recommendations - do not hold off sign-off</span></div>';
if(inspTag==='initials')_legendHtml+='<div class="rep-key-row"><span class="dc-insp" style="color:#4A5568;border-color:#4A5568;">AB</span><span class="rep-key-gloss">Inspector initials \u2014 who logged the item</span></div>';
// S317 (Mark): the "1 · Pin N — Item number…" legend row is removed (Mark marked
// it off). The item#·Pin label is self-explanatory in the body; the legend row was
// redundant. (Other legend rows — Outstanding/Closed/REC — stay.)
_legendHtml+='</div></div>';
// S139 Phase 3 (D): italic high-priority-recommendation note. Full mode
// only (suppressed for 'only' — there the recs ARE the report).
// S317 (Mark): the "This report includes N high-priority recommendation(s)" note
// is removed — the tool has no high-priority-recommendation feature, so the note
// was misleading. Kept as an empty string so downstream assembly is untouched.
var _hiRecNoteHtml='';
// Assembled mode-aware just before pagination (after the Recommendation
// Summary is built — see _recSummaryHtml). Placeholder for now.
var summaryHtml='';

function _compactHeader(pgNum){
  var l1=esc((p.info&&p.info.client)||'');var l2=esc((p.info&&p.info.address)||'');
  var sp=(p.info&&p.info.projectName)?' - '+esc(p.info.projectName):'';
  var l3=esc(_rptTitleBase+' #'+_rptNum)+sp;
  var r1=esc(((p.info&&p.info.projectNumber)||'')+' '+_rptRev)+'&nbsp;&nbsp;Page '+pgNum;
  return '<div class="ph-compact"><div class="ph-compact-left">'+l1+'<br>'+l2+'<br>'+l3+'</div><div class="ph-compact-right">'+r1+'<br>&nbsp;<br>'+esc(date)+'</div></div>';
}

// S317: report-sequential Item # (Option E, LOCKED). Gapless running counter
// over RENDERED rows in body render order. Stamped on r as r._itemNo inside
// _buildDefCard (called exactly once per rendered row, in order). Reset to 0
// before the deficiency body and AGAIN before the rec section (recs restart at
// 1 — Mark-locked Option A: recs are an outside-scope separate document concern).
// The appendix Item column reads the same r._itemNo back off each row.
var _itemNo=0;
function _nextItem(){return ++_itemNo;}
// Contractor Response Phase 1 preview scaffold — sample B1 threads. Gated by
// window._frtCrbPreview (admin export-modal toggle). Remove when live
// responses[]/arenconReviews[] land. Grammar: LOCKED_CONTRACTOR_RESPONSE_SYSTEM §1.
var _CRB_FILL='<div class="cbrow" data-crbgroup="1"><span class="cb"><span class="bx" data-crbopt="Addressed"></span>Addressed</span><span class="cb"><span class="bx" data-crbopt="In Progress"></span>In Progress</span><span class="cb"><span class="bx" data-crbopt="Not in Scope"></span>Not in Scope</span><span class="cb"><span class="bx" data-crbopt="Other"></span>Other</span></div><div class="flbl">Contractor comments</div><div class="ffield" data-crbcomment="1"></div>';
var _CRB_FLAG='<svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor"><rect x="1" y="0" width="1.4" height="11" rx=".7"></rect><path d="M2.4 1h5.8L6.2 3.2 8.2 5.4H2.4z"></path></svg>';
var _CRB_SAMPLES_OPEN=[
  { chip:'', hd:'Contractor Response',
    body:'<div class="tr-row live"><div class="tr-meta"><b>ROUND 1 \u2014 RESPOND ON THIS REPORT</b></div>'+_CRB_FILL+'</div>' },
  { chip:'<span class="rd-chip r-g" title="Outstanding for 2 reports \u2014 first noted FRT #1">2nd rd</span>', hd:'Contractor Response \u2014 thread',
    body:'<div class="tr-row"><div class="tr-meta"><b>ROUND 1 \u00b7 FRT #1</b> \u00b7 Apex Fire Protection \u00b7 2026-06-18</div><div class="claim"><span class="rep">Reported \u00b7 Addressed</span> \u2014 Penetration sealed; ready for re-inspection.</div><div class="rect-lbl">RECTIFICATION PHOTOS \u2014 SUBMITTED BY CONTRACTOR, ADDED BY ARENCON</div><div class="rphotos"><div class="rphoto">Rect. 1</div><div class="rphoto">Rect. 2</div></div></div><div class="tr-row arv"><div class="tr-meta"><b>ARENCON REVIEW \u00b7 FRT #2</b> \u00b7 2026-07-02 &nbsp;<span class="pill pill-h">Outstanding</span></div><p>Sealant is not the listed system for this assembly. Reseal per the listed system and resubmit photos.</p></div><div class="tr-row live"><div class="tr-meta"><b>ROUND 2 \u2014 RESPOND ON THIS REPORT</b></div>'+_CRB_FILL+'</div>' },
  { chip:'<span class="rd-chip r-r" title="Outstanding for 3 reports \u2014 first noted FRT #1">'+_CRB_FLAG+'3rd rd</span>', hd:'Contractor Response \u2014 thread',
    body:'<div class="tr-row"><div class="tr-meta"><b>ROUNDS 1\u20132 \u00b7 FRT #1\u2013#2</b> \u2014 earlier exchange on record in FRT #2</div><div class="claim" style="color:#928E9C">Contractor reported Addressed then In Progress; ARENCON held the item Outstanding.</div></div><div class="tr-row"><div class="tr-meta"><b>ROUND 3 \u00b7 FRT #3</b> \u00b7 Apex Fire Protection \u00b7 2026-08-19</div><div class="claim"><span class="rep">Reported \u00b7 Addressed</span> \u2014 Listed system installed; labels applied. Photos attached.</div><div class="rect-lbl">RECTIFICATION PHOTOS</div><div class="rphotos"><div class="rphoto">Rect. 1</div><div class="rphoto">Rect. 2</div></div></div><div class="tr-row arv"><div class="tr-meta"><b>ARENCON REVIEW \u00b7 FRT #3</b> \u00b7 2026-08-30 &nbsp;<span class="pill pill-h">Outstanding</span></div><p>Label applied is for the wrong rating. Correct system label required \u2014 escalated to project meeting.</p></div><div class="tr-row live"><div class="tr-meta"><b>ROUND 4 \u2014 RESPOND ON THIS REPORT</b></div>'+_CRB_FILL+'</div>' }
];
var _CRB_SAMPLE_CLOSED={ chip:'', hd:'Contractor Response \u2014 record',
  body:'<div class="tr-row"><div class="tr-meta"><b>ROUND 1 \u00b7 FRT #1</b> \u00b7 Apex Fire Protection \u00b7 2026-06-18</div><div class="claim"><span class="rep">Reported \u00b7 Addressed</span> \u2014 Rectified per attached photos.</div><div class="rect-lbl">RECTIFICATION PHOTOS</div><div class="rphotos"><div class="rphoto">Rect. 1</div></div></div><div class="tr-row arv"><div class="tr-meta"><b>ARENCON REVIEW \u00b7 FRT #2</b> \u00b7 2026-07-02 &nbsp;<span class="pill pill-c">Closed</span></div><p>Verified on site review. Item closed.</p></div><div class="closednote">Closed items carry no fillable field. This item moves to Previously Closed on the next report.</div>' };
var _crbLongShown=false;
var _CRB_SAMPLE_LONG={ chip:'<span class="rd-chip r-r" title="Outstanding for 6 reports \u2014 first noted FRT #1">'+_CRB_FLAG+'6th rd</span>', hd:'Contractor Response \u2014 thread',
  body:'<div class="tr-row"><div class="tr-meta"><b>ROUND 1 · FRT #1</b> · Apex Fire Protection · 2026-06-18</div><div class="claim"><span class="rep">Reported · Addressed</span> — Penetration sealed with CP-25WB+ per attached photos. Ready for re-inspection.</div><div class="rect-lbl">RECTIFICATION PHOTOS</div><div class="rphotos"><div class="rphoto">Rect. 1</div><div class="rphoto">Rect. 2</div></div></div><div class="tr-row arv"><div class="tr-meta"><b>ARENCON REVIEW · FRT #2</b> · 2026-07-02 &nbsp;<span class="pill pill-h">Outstanding</span></div><p>Sealant used is not the listed system for this wall assembly. Reseal per the listed system and resubmit photos.</p></div><div class="tr-row"><div class="tr-meta"><b>ROUND 2 · FRT #2</b> · Apex Fire Protection · 2026-07-21</div><div class="claim"><span class="rep">Reported · In Progress</span> — Listed system material on order; installation scheduled week of Aug 3.</div></div><div class="tr-row arv"><div class="tr-meta"><b>ARENCON REVIEW · FRT #3</b> · 2026-08-01 &nbsp;<span class="pill pill-h">Outstanding</span></div><p>Not complete at time of review. Item remains outstanding — third report. Schedule confirmation required.</p></div><div class="tr-row"><div class="tr-meta"><b>ROUND 3 · FRT #3</b> · Apex Fire Protection · 2026-08-19</div><div class="claim"><span class="rep">Reported · Addressed</span> — Listed system installed at penetration; labels applied. Photos attached.</div><div class="rect-lbl">RECTIFICATION PHOTOS</div><div class="rphotos"><div class="rphoto">Rect. 1</div><div class="rphoto">Rect. 2</div></div></div><div class="tr-row arv"><div class="tr-meta"><b>ARENCON REVIEW · FRT #4</b> · 2026-08-30 &nbsp;<span class="pill pill-h">Outstanding</span></div><p>Label applied is for the wrong F-rating. Correct system label required — fourth report. Escalated to project meeting.</p></div><div class="tr-row"><div class="tr-meta"><b>ROUND 4 · FRT #4</b> · Apex Fire Protection · 2026-09-15</div><div class="claim"><span class="rep">Reported · In Progress</span> — Correct labels ordered from manufacturer; re-labelling scheduled next visit.</div></div><div class="tr-row arv"><div class="tr-meta"><b>ARENCON REVIEW · FRT #5</b> · 2026-09-28 &nbsp;<span class="pill pill-h">Outstanding</span></div><p>Labels still not applied at time of review. Fifth report — outstanding. Formal notice to follow.</p></div><div class="tr-row"><div class="tr-meta"><b>ROUND 5 · FRT #5</b> · Apex Fire Protection · 2026-10-12</div><div class="claim"><span class="rep">Reported · Addressed</span> — Correct F-rated system labels applied at all penetrations. Photos attached.</div><div class="rect-lbl">RECTIFICATION PHOTOS</div><div class="rphotos"><div class="rphoto">Rect. 1</div><div class="rphoto">Rect. 2</div></div></div><div class="tr-row arv"><div class="tr-meta"><b>ARENCON REVIEW · FRT #6</b> · 2026-10-25 &nbsp;<span class="pill pill-h">Outstanding</span></div><p>One penetration still missing a label; remainder acceptable. Complete the final label and resubmit.</p></div><div class="tr-row live"><div class="tr-meta"><b>ROUND 6 — RESPOND ON THIS REPORT</b></div>'+_CRB_FILL+'</div>' };
function _crbBox(cs){
  var _body=cs.body.replace(/<div class="claim"><span class="rep">([\s\S]*?)<\/span> \u2014 ([\s\S]*?)<\/div>/g,'<div class="claim cflex"><span class="ctext">$2</span><span class="rep">$1</span></div>');
  var rows=_body.split(/(?=<div class="tr-row)/).filter(Boolean);
  var segs=rows.map(function(r){return '<div class="dc-split crb-seg">'+r+'</div>';}).join('');
  return '<div class="crb"><div class="crb-hd">'+cs.hd+'</div><div class="crb-bd">'+segs+'</div></div>';
}

function _buildDefCard(r,hdrExtra){
  // S317: assign this rendered row its report-sequential item number.
  r._itemNo=_nextItem();
  // S118: each r is now a single observation item (flattened). r.obs is the
  // observation object (or null for legacy single-obs deficiencies).
  // r.obsIdx is the observation index within the parent pin (used for unique
  // minimap element IDs and pin-level vs obs-tied activity routing).
  var d=r.d;
  var hasDwg=isField&&d.drawingId&&d.pinX!=null;
  var entries=d.entries&&d.entries.length?d.entries:null;
  var po;
  if(r.obs){
    var t=(entries&&entries[r.obsIdx])?entries[r.obsIdx].description||'':r.obs.text||'';
    // S120: photos come from defic.photos[] pool filtered by the obs's
    // photoSelection (default = all pool, custom = explicit subset). The
    // PDF report card therefore shows only what the inspector intends to
    // attribute to this specific observation.
    var ph;
    if(typeof Model!=='undefined'&&Model.getEffectivePhotos){
      ph=Model.getEffectivePhotos(d,r.obsIdx);
    }else{
      ph=(entries&&entries[r.obsIdx])?entries[r.obsIdx].photos||[]:r.obs.photos||[];
    }
    po={text:t,photos:ph,addressed:!!r.obs.addressed,notedOnInstance:r.obs.notedOnInstance||(d.notedOnInstance||1),id:r.obs.id||null};
  }else{
    po={text:d.description||'',photos:d.photos||[],addressed:false,notedOnInstance:d.notedOnInstance||1,id:null};
  }
  // Status: per-obs addressed flag wins, else pin-level
  var pinClosed=_deficIsClosed(d);
  var thisClosed=po.addressed||pinClosed;
  // S119: pill color encodes the OBSERVATION's priority (was pin-level d.priority).
  // Each card represents one observation, so the priority signal should match
  // that observation's priority, not the aggregate pin priority. The minimap
  // teardrop, in contrast, still uses effective pin priority because it represents
  // the physical pin on the drawing.
  var pr=(r.obs&&r.obs.priority)||d.priority||'high';
  // S154: Site Records pill takes precedence over status pill on Site Records items.
  // Internal-use-only marker — Site Records items are excluded from contractor-facing
  // exports by the report filter, so this pill only ever appears in internal reports.
  // The Site Records identity is the primary signal for these items; the Outstanding/
  // Closed status reads as secondary noise in this context.
  var _isSrCard=isSiteRecordsName(r.ctr);
  var _isRec=!!(r.d&&r.d.isRecommendation);
  var pillCls,pillTxt;
  // S269: a card's status pill is EXACTLY ONE category — never both REC and
  // Outstanding (which is contradictory: a recommendation isn't "outstanding").
  // Precedence: Site Record (internal identity marker, persists even if closed) >
  // Closed (terminal) > Recommendation > Outstanding.
  if(_isSrCard){pillCls='pill-sr';pillTxt='Site Records';}
  else if(thisClosed){pillCls='pill-c';pillTxt='Closed';}
  else if(_isRec){pillCls='pill-rec';pillTxt='Recommendation';}
  else if(pr==='low'){pillCls='pill-l';pillTxt='Outstanding';}
  else{pillCls='pill-h';pillTxt='Outstanding';}
  // S284c (Mark): a rec is NEVER double-pilled. Since S142 every rec lives
  // exclusively in the pooled Recommendations section, so the section itself
  // carries the rec identity — the per-card REC chip is redundant in every
  // case: open rec → "Recommendation" pill; closed rec → "Closed" pill only
  // (previously REC+Closed, which Mark rejected: it's one or the other).
  // Chip permanently retired (variable kept inert, S137 discipline).
  var _showRecChip=false;
  // Contractor Response preview: pick a sample thread for this card (open
  // rotation vs closed record), and ride the rounds chip on the header.
  var _cs=null;
  if(window._frtCrbPreview && !_isSrCard && !_isRec){
    if(thisClosed){ _cs=_CRB_SAMPLE_CLOSED; }
    else if(!_crbLongShown){ _cs=_CRB_SAMPLE_LONG; _crbLongShown=true; }
    else { _cs=_CRB_SAMPLES_OPEN[((r._itemNo||1)-1)%_CRB_SAMPLES_OPEN.length]; }
    hdrExtra=(hdrExtra||'')+(_cs?_cs.chip:'');
  }
  // Activity: obs-tied for this obs, plus pin-level (no obsRef) on first-obs only
  var actArr=d.activity&&d.activity.length?d.activity.slice().filter(function(a){return !a.autoGenerated;}).sort(function(a,b){return(b.date||'').localeCompare(a.date||'');}):[];
  var fuActs;
  if(po.id){
    fuActs=actArr.filter(function(a){return a.obsRef===po.id;});
    if(r.obsIdx===0){fuActs=fuActs.concat(actArr.filter(function(a){return !a.obsRef;}));}
  }else{fuActs=actArr;}
  // Build card HTML
  var h='<div class="dc"><div class="dc-inner">';
  if(hasDwg)h+='<img class="dc-mini" id="mm-'+d.id+'-'+r.obsIdx+'" data-mm="'+d.id+'-'+r.obsIdx+'" src="" alt="drawing">';
  h+='<div class="dc-content">';
  // S143 (Phase 3 G/3.5): inspector initials chip in the PDF header.
  // Only when the picker selected "initials"; legacy/null createdBy
  // prints nothing (consistent with the Off-by-default clean-report intent).
  var _inspChip='';
  if(inspTag==='initials'&&po&&po.createdBy&&Model.resolveInspector){
    var _pi=Model.resolveInspector(po.createdBy);
    if(_pi&&_pi.initials&&_pi.initials!=='\u2014'){
      var _pic=_pi.color||'#6B7280';
      _inspChip='<span class="dc-insp" style="color:'+_pic+';border-color:'+_pic+';">'+esc(_pi.initials)+'</span>';
    }else{
      // S154 Bug #2: chip stays visible for traceability when createdBy is set
      // but the inspector profile isn't resolved (unfetched name / legacy id).
      _inspChip='<span class="dc-insp" style="color:#9CA3AF;border-color:#9CA3AF;opacity:.55;font-style:italic;" title="Logged by another inspector">?</span>';
    }
  }
  // S317 (Option E, LOCKED): "1 · Pin 3A" — report-sequential item # (burgundy
  // bold) · the word "Pin" + pin#/obs# (dark slate). Pin#/obs# is NOT dropped.
  var _pinRef='Pin '+esc(r.numLabel||r.rn);
  h+='<div class="dc-hdr"><span class="dc-hdr-l"><span class="dc-itemnum">'+r._itemNo+'</span><span class="item-sep">\u00b7</span><span class="pinref-dark">'+_pinRef+'</span></span><span class="dc-hdr-r">'+_inspChip+(hdrExtra||'')+(_showRecChip?'<span class="rec-chip">REC</span>':'')+'<span class="'+pillCls+'">'+esc(pillTxt)+'</span></span></div>';
  if(po.notedOnInstance!==_curInst){h+='<div style="font-size:9pt;color:#6B7B8C;margin-bottom:4px;">Noted in FRT #'+po.notedOnInstance+'</div>';}
  h+='<div class="dc-desc">'+_descHtml(po.text)+'</div>';
  if(po.photos&&po.photos.length){h+='<div class="dp-grid">';po.photos.forEach(function(ph){
    var _src=_pdfPhotoSrc(ph,r2Cache);
    var _href=_pdfPhotoFullHref(ph);
    // S395: a failed/404 photo yields an empty src. An <img src=""> corrupts the
    // html2canvas render (blank canvas -> NaN page size -> pdf-lib addPage throws).
    // Per canon "empty-src photos render a placeholder, never silently skipped",
    // emit a labeled placeholder tile instead of an empty <img>.
    if(!_src){
      h+='<div class="dp dp-missing" style="display:flex;align-items:center;justify-content:center;background:#F2F0EC;color:#928E9C;font-size:8pt;font-weight:600;text-align:center;line-height:1.3;padding:4px;">Photo\u00A0unavailable</div>';
    }else if(_href){h+='<a href="'+esc(_href)+'" target="_blank" rel="noopener" title="Open full-resolution photo"><div class="dp" style="background-image:url(\''+_src+'\')"></div></a>';}
    else{h+='<div class="dp" style="background-image:url(\''+_src+'\')"></div>';}
  });h+='</div>';}
  if(fuActs.length){
    h+='<div class="fu-grp"><span>Follow-up</span><span style="font-weight:500;color:#6B7B8C;">FRT #'+_curInst+'</span></div>';
    fuActs.forEach(function(a){
      var isCtr=(a.label||'').indexOf('Contractor')>=0;
      var authorCls=isCtr?'fu-author-ctr':'fu-author-arc';
      var authorTxt=isCtr?'Contractor':'ARENCON';
      var dateStr=a.date||'';
      var instTag=a.instance&&a.instance!==_curInst?' \u00b7 FRT #'+a.instance:'';
      var txt=(a.text||'\u2014').replace(/<[^>]*>/g,'');
      h+='<div class="fu-row"><div class="fu-meta"><span class="'+authorCls+'">'+authorTxt+'</span><span class="fu-date">'+esc(dateStr)+instTag+'</span></div><div class="fu-body">'+esc(txt)+'</div></div>';
    });
  }
  // Footer line — drawing name + noted/closed date (Pin # carried by minimap teardrop)
  var footerParts=[];
  if(hasDwg){var dObj=(p.drawings||[]).find(function(x){return x.id===d.drawingId;});if(dObj)footerParts.push('\uD83D\uDCD0 '+esc(dObj.name));}
  var _nD=d.notedDate||d.date||'';
  if(_nD&&po.notedOnInstance===_curInst)footerParts.push('Noted '+_nD);
  if(thisClosed){var ci=d.closedOnInstance||_curInst;var cd=d.closedDate||'';
    if(ci===_curInst&&cd)footerParts.push('Closed '+cd);
    else if(ci!==_curInst)footerParts.push('Closed in FRT #'+ci);}
  if(footerParts.length)h+='<div class="dc-footer">'+footerParts.join(' \u00b7 ')+'</div>';
  if(_cs)h+=_crbBox(_cs);
  h+='</div></div></div>';
  return h;
}

// Build content blocks — S139 Phase 3: Trade → Contractor → cards.
// Mirrors the Detailed view's grouping (deficiencies.js _renderDetailedView):
// a pin's trade = its FIRST observation's trade (Option 1, S137). Trade
// order = declared projectTrades first, then any extras seen, then the
// "Other Trade Items" band (untagged), then "Site Records · Recommendations"
// (untagged + no-contractor recs). Within a trade: real contractors in
// proj.contractors order (taupe sub-band) → no-contractor non-rec items
// directly under the trade band → no-contractor recs under a grey
// "Recommendations" sub-band + italic footer. REC chip is added in
// _buildDefCard, so it rides every rec card wherever it lands.
var _REC_FOOT='<div class="rec-foot">The above items were noted during this review and are provided as recommendations. They fall outside the specific scope of work and are not held against the sign-off letter.</div>';
// S142 Batch 3-1 (Model 2 §4.3): canonical trade derivation. Was
// obs[0].trade only — which disagreed with the on-screen Detailed view
// and made "Vipond assigned to Sprinkler still shows as Other Trade
// Items" happen. Now uses Model.derivePinTrade(defic, parentContractor):
// obs[0].trade -> parent contractor's SOLE declared trade -> ''. The
// parent contractor is the one whose .deficiencies[] holds the pin (NOT
// the per-obs r.ctr override); generalDeficiencies / Site Records pass
// null. PDF grouping and the Detailed view now agree.
var _parentCtrByDefId={};
(p.contractors||[]).forEach(function(c){
  ((c&&c.deficiencies)||[]).forEach(function(d){if(d&&d.id!=null)_parentCtrByDefId[d.id]=c;});
});
function _pinTrade(d){
  var pc=(d&&d.id!=null)?(_parentCtrByDefId[d.id]||null):null;
  return Model.derivePinTrade(d,pc)||'';
}
// S146 B1: plural companion. obs[0].trade -> [that]; else legacy
// defic.trade -> [that]; else ALL of the parent contractor's trades;
// else []. Used by the main deficiency body grouping AND (S147) the
// ACTIVE recommendation section body so an untagged pin on a multi-
// trade contractor fans out to every trade (matches the on-screen
// Detailed view + FRT "two rows"). ⚠ The Recommendation Summary
// scoreboard (_aByT) deliberately stays SINGLE-trade (_pinTrade,
// Option A) so its per-trade rows still sum to the Total row.
function _pinTrades(d){
  var pc=(d&&d.id!=null)?(_parentCtrByDefId[d.id]||null):null;
  return Model.derivePinTrades(d,pc)||[];
}
// S(this) — Mark: does this pin have its OWN trade tag, vs. inheriting the
// parent contractor's (multi-)trade list? An untagged pin on a multi-trade
// contractor was being FANNED OUT — emitted once under every trade — which
// produced phantom duplicate items (e.g. Sprinkler deficiencies re-appearing
// as orphan Fire Alarm / Electrical items). Untagged pins should appear ONCE
// in "Other Trade Items", not fan out. A pin is "self-tagged" only when its
// own obs[0].trade (or legacy defic.trade) is set.
function _pinHasOwnTrade(d){
  if(!d)return false;
  if(Array.isArray(d.observations)&&d.observations.length){
    var t0=d.observations[0]&&d.observations[0].trade;
    return !!(t0&&String(t0).trim());
  }
  return !!(d.trade&&String(d.trade).trim());
}
var _realCtrNames={};(p.contractors||[]).forEach(function(c){if(c&&c.name)_realCtrNames[c.name]=true;});
function _isRealCtr(nm){return !!_realCtrNames[nm]&&!isSiteRecordsName(nm);}
var _ctrIdxByName={};(p.contractors||[]).forEach(function(c,i){if(c&&c.name&&_ctrIdxByName[c.name]==null)_ctrIdxByName[c.name]=i;});
function _newTrade(nm){return{name:nm,total:0,real:{},realOrder:[],noctr:[]};}
function _pushReal(T,cn,r){if(!T.real[cn]){T.real[cn]=[];T.realOrder.push(cn);}T.real[cn].push(r);T.total++;}
var contentBlocks=[];_crbLongShown=false;
_itemNo=0; // S317: deficiency item #s start at 1 (render order, gapless)
// S142 Batch 3-2 (Model 2 §4.4): recommendations are pulled OUT of the
// trade/contractor/Other-Trade-Items sections entirely. Deficiency
// sections are deficiencies-only. Recs are pooled into recBlocks and
// emitted in ONE "Recommendations" section on a forced new page AFTER
// Previously Closed Items (see below). Each rec therefore appears
// exactly once — never both in a trade band and the pooled section.
var pooledRecs=[];
var recBlocks=[];
if(mainBodyDefs.length){
  var tradeMap={};var tradeSeen=[];
  var untagged=_newTrade('Other Trade Items');
  mainBodyDefs.forEach(function(r){
    // Model 2: any recommendation leaves the deficiency flow now.
    if(r.d&&r.d.isRecommendation){if(_recsMode!=='exclude')pooledRecs.push(r);return;}
    var tks=_pinTrades(r.d);
    var real=_isRealCtr(r.ctr);
    // S(this): only place the pin under real trade sections when it is SELF-tagged
    // (has its own trade). An untagged pin — even on a multi-trade contractor —
    // is genuinely uncategorised and belongs ONCE in "Other Trade Items", not
    // fanned out across every trade (which created phantom duplicate items).
    if(tks.length&&_pinHasOwnTrade(r.d)){
      tks.forEach(function(t){
        if(!tradeMap[t]){tradeMap[t]=_newTrade(t);tradeSeen.push(t);}
        var T=tradeMap[t];
        if(real)_pushReal(T,r.ctr,r);
        else{T.noctr.push(r);T.total++;}
      });
    }else{
      if(real)_pushReal(untagged,r.ctr,r);
      else{untagged.noctr.push(r);untagged.total++;}
    }
  });
  function _orderCtrNames(T){
    return T.realOrder.slice().sort(function(a,b){
      var ia=(_ctrIdxByName[a]==null)?1e9:_ctrIdxByName[a];
      var ib=(_ctrIdxByName[b]==null)?1e9:_ctrIdxByName[b];
      return ia-ib;
    });
  }
  function _emitTrade(title,T){
    contentBlocks.push({type:'tradeHeader',
      html:'<div class="th-band"><span>'+esc(title)+'</span><span class="ch-pill">'+T.total+'</span></div>',
      htmlCont:'<div class="th-band"><span>'+esc(title)+' <span class="ch-cont">(cont.)</span></span><span class="ch-pill">'+T.total+'</span></div>'});
    _orderCtrNames(T).forEach(function(cn){
      var rows=T.real[cn];
      contentBlocks.push({type:'ctrHeader',
        html:'<div class="ch"><span>'+esc(cn)+'</span><span class="ch-pill">'+rows.length+'</span></div>',
        htmlCont:'<div class="ch"><span>'+esc(cn)+' <span class="ch-cont">(cont.)</span></span><span class="ch-pill">'+rows.length+'</span></div>',ctr:cn});
      rows.forEach(function(r){contentBlocks.push({type:'defCard',html:_buildDefCard(r),defId:r.d.id,ctr:cn});});
    });
    T.noctr.forEach(function(r){contentBlocks.push({type:'defCard',html:_buildDefCard(r),defId:r.d.id,ctr:title});});
  }
  var orderedTrades=[];
  (p.projectTrades||[]).forEach(function(t){if(tradeMap[t]&&orderedTrades.indexOf(t)<0)orderedTrades.push(t);});
  tradeSeen.forEach(function(t){if(orderedTrades.indexOf(t)<0)orderedTrades.push(t);});
  // S142 Batch 3-4: 'only' (recommendations-only report) suppresses the
  // deficiency trade + Other-Trade sections entirely; the pooled
  // Recommendations blocks (built below) become the whole body.
  if(_recsMode!=='only'){
    orderedTrades.forEach(function(t){_emitTrade(t,tradeMap[t]);});
    if(_untaggedMode!=='exclude'&&untagged.total>0)_emitTrade('Other Trade Items',untagged);
  }
}

// S144 §1/§2 (SUPERSEDES the S142 grey pooled model): the rec section
// now uses the EXACT main-report grammar — navy .th-band trade -> taupe
// .ch contractor -> connected .dc cards (visually identical to the
// deficiency body; the only differentiators are the REC chip per card +
// the Recommendation Summary heading). The grey .th-band.recs / .rec-cap
// / .rec-sub / .rec-ctrchip path is dropped (CSS left in place — dead,
// tidy later). New first block = Recommendation Summary (scoreboard,
// counts ALL pooled recs incl. previously-closed); a rec closed in a
// PRIOR instance moves to a "Previously Closed Recommendations" table
// (mirrors the deficiency Previously Closed Items); footer always shown.
// S145 P1 (Mark): full mode forces a page break — the rec section starts
// a fresh page led by the Option C left-bar section-title card; recs-only
// mode omits the card (the page title already reads
// "Field Review Report-Recommendation #N") and the Rec Summary + Legend
// ride page 1 (assembled into summaryHtml below).
var _recSummaryHtml='';
var _recPrevClosedHtml='';
var _recFootHtml='<div class="rec-foot">Recommendation items noted during this review fall outside the contracted scope of work, and are not held against the engineer sign-off letter.</div>';
var _recSecTtlHtml='<div class="rec-secttl"><div class="rec-secttl-ttl">Recommendations</div><div class="rec-secttl-sub">The following items were noted during this review and fall outside the contracted scope of work. They are provided for information and are not held against the engineer sign-off letter.</div></div>';
_itemNo=0; // S317 Option A (LOCKED): recommendation item #s RESTART at 1
if(pooledRecs.length){
  function _recPrevClosed(r){return _deficIsClosed(r.d)&&((r.d.closedOnInstance||_curInst)<_curInst);}
  var _activeRecs=[],_prevClosedRecs=[];
  pooledRecs.forEach(function(r){(_recPrevClosed(r)?_prevClosedRecs:_activeRecs).push(r);});
  // (1) Recommendation Summary — ALL pooled recs (scoreboard; closed,
  //     incl. previously-closed, land in Closed). summary ≡ section.
  var _aByT={},_aSeen=[],_aNo=[];
  pooledRecs.forEach(function(r){var t=_pinTrade(r.d);if(t){if(!_aByT[t]){_aByT[t]=[];_aSeen.push(t);}_aByT[t].push(r);}else _aNo.push(r);});
  var _sumOrder=[];(p.projectTrades||[]).forEach(function(t){if(_aByT[t]&&_sumOrder.indexOf(t)<0)_sumOrder.push(t);});
  _aSeen.forEach(function(t){if(_sumOrder.indexOf(t)<0)_sumOrder.push(t);});
  function _recOpenN(g){var o=0;g.forEach(function(r){if(_itemIsOpen(r))o++;});return o;}
  function _recRow(label,g,tot){
    var T=g.length,O=_recOpenN(g),C=T-O,
      tr=tot?' style="border-top:2px solid #2A3A5C;font-weight:700;"':'',
      lc=tot?'<td>Total</td>':'<td><strong>'+esc(label)+'</strong></td>',
      em=tot?'':'font-weight:700;';
    return '<tr'+tr+'>'+lc+'<td style="text-align:center;">'+T+'</td>'
      +'<td style="text-align:center;color:#A85959;'+em+'">'+O+'</td>'
      +'<td style="text-align:center;color:#5F8068;'+em+'">'+C+'</td></tr>';
  }
  _recSummaryHtml='<div style="border:1px solid #DDE1E7;border-radius:6px;margin-top:16px;overflow:hidden;"><table class="st"><thead><tr><th>Recommendation Summary</th><th style="text-align:center;">Total</th><th style="text-align:center;">Open</th><th style="text-align:center;">Closed</th></tr></thead><tbody>';
  _sumOrder.forEach(function(t){_recSummaryHtml+=_recRow(t,_aByT[t],false);});
  if(_aNo.length)_recSummaryHtml+=_recRow('General',_aNo,false);
  _recSummaryHtml+=_recRow(null,pooledRecs,true);
  _recSummaryHtml+='</tbody></table></div>';
  // S409 (Mark): the Recommendations lead page mirrors the page-1 deficiency
  // dashboard — Status Overview donut + Resolution/This-Visit bars — in the
  // LOCKED rec palette (open brown #5E5440 / closed sage #5F8068 / new-this-
  // report inner arc #2C7FB8). Same SVG ring math as the page-1 IIFE (r=43
  // sw=12 outer, r=29 sw=5 inner, rotate -90), same p1-* bar classes, and the
  // SAME predicates as the Recommendation Summary table above (_recOpenN /
  // notedOnInstance), so chart and table can never disagree. Report Legend box
  // intentionally omitted — it is global and already lives on page 1.
  var _recDashHtml='';
  (function(){
    var T=pooledRecs.length; if(!T)return;
    var O=_recOpenN(pooledRecs), CL=T-O;
    var _rIsNew=function(r){return (r.d.notedOnInstance||1)===_curInst;};
    var Nn=pooledRecs.filter(_rIsNew).length;
    // Inner arc counts new OPEN recs only, aligned under the open segment
    // (arcs never sit under closed — same rule as page 1's A3 ring).
    var nOpen=pooledRecs.filter(function(r){return _rIsNew(r)&&_itemIsOpen(r);}).length;
    var _priorCls=pooledRecs.filter(function(r){
      if(_itemIsOpen(r))return false;
      var ci=(r.obs&&r.obs.addressed!==undefined)?(r.obs.addressedOnInstance||r.d.closedOnInstance||1):(r.d.closedOnInstance||1);
      return ci===_curInst&&(r.d.notedOnInstance||1)<_curInst;
    }).length;
    var pct=Math.round(CL/T*100);
    var CO='#5E5440',CC='#5F8068',CN='#2C7FB8';
    var s='',circ=2*Math.PI*43,off=0;
    s+='<circle cx="50" cy="50" r="43" fill="none" stroke="#EDEAF0" stroke-width="12"/>';
    [{v:O,c:CO},{v:CL,c:CC}].forEach(function(g){if(g.v<=0)return;var len=g.v/T*circ;
      s+='<circle cx="50" cy="50" r="43" fill="none" stroke="'+g.c+'" stroke-width="12" stroke-dasharray="'+len.toFixed(1)+' '+circ.toFixed(1)+'" stroke-dashoffset="'+(-off).toFixed(1)+'"/>';off+=len;});
    if(nOpen>0){
      var c2=2*Math.PI*29;
      s+='<circle cx="50" cy="50" r="29" fill="none" stroke="#EDEAF0" stroke-width="5"/>';
      s+='<circle cx="50" cy="50" r="29" fill="none" stroke="'+CN+'" stroke-width="5" stroke-dasharray="'+((nOpen/T)*c2).toFixed(1)+' '+c2.toFixed(1)+'"/>';
    }
    var _donut='<svg width="100" height="100" viewBox="0 0 100 100" style="transform:rotate(-90deg);flex:none;">'+s+'</svg>';
    var _ctrLbl='<div style="position:relative;width:100px;height:100px;flex:none;">'+_donut
      +'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;"><div style="font-size:17pt;font-weight:700;color:#1C2333;line-height:1;font-variant-numeric:tabular-nums;">'+T+'</div><div style="font-size:7.5pt;color:#607D8B;letter-spacing:1px;margin-top:1px;">RECS</div></div></div>';
    function _leg(sw,nm,v){return '<div style="display:flex;align-items:center;gap:8px;font-size:9.5pt;color:#4A5568;margin:3px 0;">'+sw+'<span>'+nm+'</span><span style="margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;color:#1C2333;">'+v+' \u00b7 '+Math.round(v/T*100)+'%</span></div>';}
    var _dot=function(cx){return '<span style="width:9px;height:9px;border-radius:50%;background:'+cx+';flex:none;display:inline-block;"></span>';};
    var _rg='<span style="width:9px;height:9px;border-radius:50%;border:2.5px solid '+CN+';box-sizing:border-box;flex:none;display:inline-block;"></span>';
    var _legHtml=_leg(_dot(CO),'Open',O)+_leg(_dot(CC),'Closed',CL)+_leg(_rg,'New this report',Nn);
    _recDashHtml='<div style="display:flex;gap:14px;margin-top:12px;align-items:stretch;">'
      +'<div style="flex:1.05;border:1px solid #DDE1E7;border-radius:6px;padding:7px 11px;display:flex;flex-direction:column;"><div style="font-size:9.5pt;font-weight:700;color:#2A3A5C;">Status Overview</div><div style="flex:1;display:flex;align-items:center;gap:12px;">'+_ctrLbl+'<div style="flex:1;">'+_legHtml+'</div></div></div>'
      +'<div style="flex:1.1;display:flex;flex-direction:column;gap:10px;justify-content:center;">'
        +'<div class="p1-barbox">'
          +'<div class="p1-bt"><span>Recommendation Resolution <span class="p1-bt-sub">(all visits)</span></span><span class="p1-big">'+pct+'%</span></div>'
          +'<div class="p1-track"><div class="p1-fill" style="width:'+pct+'%;background:#5E5440;"></div></div>'
          +'<div class="p1-subline">'+CL+' of '+T+' recommendations closed since project start</div>'
        +'</div>'
        +'<div class="p1-barbox">'
          +'<div class="p1-bt"><span>This Visit (FRT #'+_curInst+')</span></div>'
          +'<div class="p1-delta">'
            +'<div class="p1-dstat"><span class="p1-v p1-up">+'+Nn+'</span><span class="p1-k">new found</span></div>'
            +'<div class="p1-dstat"><span class="p1-v p1-dn">\u2212'+_priorCls+'</span><span class="p1-k">prior closed</span></div>'
          +'</div>'
          +'<div class="p1-subline">Activity recorded during this site review</div>'
        +'</div>'
      +'</div></div>';
  })();
  // Full mode: Option C section-title card + Rec Summary lead the
  // forced-new-page section (summary connects directly under the card —
  // drop its standalone 16px top gap). 'only' mode: no lead block; the
  // Rec Summary + Legend ride page 1 via summaryHtml.
  if(_recsMode!=='only'){
    recBlocks.push({type:'recLead',html:_recSecTtlHtml+_recDashHtml+_recSummaryHtml});
  }
  // (3) ACTIVE groups — main-report grammar (navy trade / taupe ctr / cards)
  // S147 B1 follow-up — rec body fan-out (Option A, Mark-approved). Uses
  // _pinTrades (plural) so a rec with no trade of its own on a multi-
  // trade contractor is listed under EVERY one of that contractor's
  // trades — identical idiom to the deficiency main body above
  // (var tks=_pinTrades(r.d)) and to the on-screen Detailed view.
  // ⚠ Option A: the Recommendation Summary scoreboard (_aByT, built
  // above) deliberately stays SINGLE-trade (_pinTrade) so its per-trade
  // rows still sum to the Total row. Do NOT switch _aByT to _pinTrades.
  var _rByT={},_rSeen=[],_rNo=[];
  _activeRecs.forEach(function(r){var tks=_pinTrades(r.d);if(tks.length){tks.forEach(function(t){if(!_rByT[t]){_rByT[t]=[];_rSeen.push(t);}_rByT[t].push(r);});}else _rNo.push(r);});
  var _rOrder=[];(p.projectTrades||[]).forEach(function(t){if(_rByT[t]&&_rOrder.indexOf(t)<0)_rOrder.push(t);});
  _rSeen.forEach(function(t){if(_rOrder.indexOf(t)<0)_rOrder.push(t);});
  function _emitRecTrade(label,rows){
    recBlocks.push({type:'tradeHeader',
      html:'<div class="th-band"><span>'+esc(label)+'</span><span class="ch-pill">'+rows.length+'</span></div>',
      htmlCont:'<div class="th-band"><span>'+esc(label)+' <span class="ch-cont">(cont.)</span></span><span class="ch-pill">'+rows.length+'</span></div>'});
    var byC={},cOrd=[],noC=[];
    rows.forEach(function(r){if(_isRealCtr(r.ctr)){if(!byC[r.ctr]){byC[r.ctr]=[];cOrd.push(r.ctr);}byC[r.ctr].push(r);}else noC.push(r);});
    cOrd.sort(function(a,b){var ia=(_ctrIdxByName[a]==null)?1e9:_ctrIdxByName[a];var ib=(_ctrIdxByName[b]==null)?1e9:_ctrIdxByName[b];return ia-ib;});
    cOrd.forEach(function(cn){
      recBlocks.push({type:'ctrHeader',
        html:'<div class="ch"><span>'+esc(cn)+'</span><span class="ch-pill">'+byC[cn].length+'</span></div>',
        htmlCont:'<div class="ch"><span>'+esc(cn)+' <span class="ch-cont">(cont.)</span></span><span class="ch-pill">'+byC[cn].length+'</span></div>',ctr:cn});
      byC[cn].forEach(function(r){recBlocks.push({type:'defCard',html:_buildDefCard(r),defId:r.d.id,ctr:cn});});
    });
    noC.forEach(function(r){recBlocks.push({type:'defCard',html:_buildDefCard(r),defId:r.d.id,ctr:label});});
  }
  _rOrder.forEach(function(t){_emitRecTrade(t,_rByT[t]);});
  if(_rNo.length)_emitRecTrade('General',_rNo);
  // (4) Previously Closed Recommendations — markup identical to the
  //     deficiency "Previously Closed Items".
  if(_prevClosedRecs.length){
    var _pcG={};_prevClosedRecs.forEach(function(r){var k=r.d.closedOnInstance||1;if(!_pcG[k])_pcG[k]=[];_pcG[k].push(r);});
    var _pcK=Object.keys(_pcG).map(Number).sort(function(a,b){return a-b;});
    _recPrevClosedHtml='<div style="border:1px solid #DDE1E7;border-radius:6px;overflow:hidden;margin-top:16px;"><table style="width:100%;border-collapse:collapse;font-size:10pt;">';
    _recPrevClosedHtml+='<thead><tr style="background:#2A3A5C;color:white;"><th colspan="5" style="padding:8px 12px;text-align:left;font-size:12pt;">Previously Closed Recommendations</th></tr>';
    _recPrevClosedHtml+='<tr style="background:#4A5568;font-weight:700;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:white;"><th style="padding:5px 10px;text-align:left;">Pin</th><th style="padding:5px 10px;text-align:left;">Description</th><th style="padding:5px 10px;text-align:left;">Contractor</th><th style="padding:5px 10px;text-align:left;">Noted</th><th style="padding:5px 10px;text-align:left;">Status</th></tr></thead><tbody>';
    _pcK.forEach(function(k){
      var it=_pcG[k],cd=it[0].d.closedDate||'';
      _recPrevClosedHtml+='<tr><td colspan="5" style="padding:6px 10px;background:#EEF2F4;font-weight:700;font-size:9.5pt;border-top:1.5px solid #DDE1E7;color:#4A5568;">Closed in FRT #'+k+(cd?' \u2014 '+cd:'')+' ('+it.length+' item'+(it.length!==1?'s':'')+')</td></tr>';
      it.forEach(function(r,ri){
        var _d2=_itemDesc(r);var _td=_d2.length>80?_d2.substring(0,80)+'\u2026':_d2;
        _recPrevClosedHtml+='<tr style="background:'+(ri%2===0?'#fff':'#fafafa')+';"><td style="padding:5px 10px;font-weight:700;color:#9C2742;">#'+(r.numLabel||r.d.num)+'</td><td style="padding:5px 10px;">'+esc(_td)+'</td><td style="padding:5px 10px;">'+esc(r.ctr)+'</td><td style="padding:5px 10px;">FRT #'+(r.d.notedOnInstance||1)+'</td><td style="padding:5px 10px;color:#3F6E55;font-weight:700;">'+esc(r.d.closedNote||'Addressed')+'</td></tr>';
      });
    });
    _recPrevClosedHtml+='</tbody></table></div>';
    recBlocks.push({type:'recPrev',html:_recPrevClosedHtml});
  }
  // (5) Footer note — ALWAYS (S144: no toggle; recFooter positional arg
  //     retained in the signature but no longer gates this).
  // S316 (Mark): rec footer removed — the same disclaimer already appears in the
  // Recommendations section header subtitle (_recSecTtlHtml). No duplicate footer.
  // recBlocks.push({type:'recFoot',html:_recFootHtml});
}

// S144 §1/§4 + S145 P1 + S284 rev C: assemble the page-1 summary block.
// Full mode = Dashboard (donut + bars) + Legend + COMPACT Deficiency Summary
// (+ hi-rec note). Legend sits ABOVE the table (S284, Mark): the table is the
// only block that can grow with contractor count, so this ordering structurally
// guarantees the legend can never be pushed off page 1. Recs-only mode is
// unchanged (Recommendation Summary + Legend; rec body flows on page 1+).
// _startPage() injects this on the first page; FULL_HEADER_H measures it.
summaryHtml=(_recsMode==='only')
  ? (_recSummaryHtml+_legendHtml)
  : (_dashHtmlFull+_progressBarsHtml+_deficSummaryHtml+_hiRecNoteHtml);

// Open popup
var w=window.open('','_blank');
if(!w){showAlert('Popup blocked. Allow popups for this site.');return;}
var _pdfSN=Model.getSmartFilename();
var _pdfSB=_pdfSN.replace(/\s+[A-Z]\d{2}([A-Z]\d{2})?$/,'');
// Filename label: full joined name unless it's long (multi-select), then a
// compact stand-in. The on-page subtitle keeps the full _ctrFilterName.
var _pdfCSName=_ctrFilterName;
if(_pdfCSName&&_pdfCSName.length>40)_pdfCSName='Selected contractors';
var _pdfCS=(_ctrFilterId!=='__all__'&&_pdfCSName)?' - '+_pdfCSName:'';
var _pdfTitle=_pdfSB+' FPE Field Rvw'+_pdfCS+' #'+_rptNum+' '+_rptRev;
// S329 (#32, Mark): the report and the Export/Close bar share ONE document again.
// The bar is position:fixed at the top and is kept at a CONSTANT on-screen size
// under Chrome PAGE zoom (the 250/500% control) by measuring the zoom factor via
// devicePixelRatio and applying an inverse transform:scale to the bar. Verified on
// Mark's Chrome (zoom 1.75/5.0 -> inverse 0.571/0.20, bar holds size). Prior attempts
// (fixed, in-flow, iframe) all failed because page zoom scales the whole tab; the
// ONLY fix that holds is to measure the zoom and counter it. Re-fit on resize (page
// zoom fires resize) + a 400ms safety interval, cleared when the window closes.
var docHtml='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(_pdfTitle)+'</title><style>'+css+'</style></head><body>';
docHtml+='<div id="measure-zone" style="position:absolute;left:-9999px;top:0;width:7.3in;visibility:hidden;"></div><div id="pages-container"></div></body></html>';
w.document.open();w.document.write(docHtml);w.document.close();w.document.title=_pdfTitle;
var D=w.document;

// Export bar — S329 (#32, Mark): FIXED WRAPPER + SCALED INNER.
// A CSS transform on a position:fixed element breaks `fixed` on mobile (it scrolls
// like absolute). So the OUTER wrapper is position:fixed with NO transform (stays
// genuinely pinned on phone + desktop), and the INNER child carries the zoom
// counter-scale. Wrapper height is set to the inner's scaled height so the blue
// strip is the right thickness. Verified on Mark's phone (holds size, stays pinned).
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
function _capLoad(win,src,glob){
  return new Promise(function(res,rej){
    if(win[glob])return res();
    var s=win.document.createElement('script');s.src=src;
    s.onload=function(){res();};s.onerror=function(){rej(new Error('load fail '+src));};
    win.document.head.appendChild(s);
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
  var bar=D.getElementById('pdf-btn-bar');
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
        var _sName=(D.title||'ARENCON_Report').replace(/[^\w.-]+/g,'_')+'.pdf';
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
      _capStatus(D,'Loading export libraries…');
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

      for(var i=0;i<pages.length;i++){
        _capStatus(D,'Rendering page '+(i+1)+' of '+pages.length+'…');
        var pageEl=pages[i];
        var ew=pageEl.offsetWidth, eh=pageEl.offsetHeight;
        // Fall back to a Letter element box if the element couldn't be measured
        // (auto-height appendix pages, off-screen pages, zero-size, etc.).
        if(!isFinite(ew)||ew<=0) ew=816;   // 8.5in @96dpi
        if(!isFinite(eh)||eh<=0) eh=1056;  // 11in  @96dpi
        var canvas=await h2c(pageEl,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false,width:ew,height:eh,windowWidth:ew,windowHeight:eh,scrollX:0,scrollY:0});
        // Size the PDF page from the ACTUAL canvas pixels (scale:2 -> /2 back to
        // CSS px -> 72/96 to points). canvas dims are always finite integers, so
        // this can never feed NaN into addPage. Fall back to Letter if somehow 0.
        var cssW=(canvas.width||ew*2)/2, cssH=(canvas.height||eh*2)/2;
        var pw=(cssW/96)*72, ph=(cssH/96)*72;
        if(!isFinite(pw)||pw<=0) pw=612;   // 8.5in in points
        if(!isFinite(ph)||ph<=0) ph=792;   // 11in  in points
        var png;
        try{ png=await pdfDoc.embedPng(canvas.toDataURL('image/png')); }
        catch(ep){ _capStatus(D,'Skipped a blank page ('+(i+1)+').'); continue; }
        var pg;
        var _pwN=Number(pw), _phN=Number(ph);
        if(!isFinite(_pwN)||_pwN<=0)_pwN=612;
        if(!isFinite(_phN)||_phN<=0)_phN=792;
        try{ pg=pdfDoc.addPage([_pwN,_phN]); }
        catch(eap){
          try{console.warn('[PDF] Skipped page '+(i+1)+' (render error):',eap&&eap.message);}catch(_){}
          _capStatus(D,'Skipped a page that failed to render ('+(i+1)+').');
          continue;
        }
        pg.drawImage(png,{x:0,y:0,width:pw,height:ph});
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
          // Contractor Response fillable AcroForm widgets (S43x minimal first pass):
          // live-round status = exclusive radio group, comment = text field. Plain look.
          try{
            var _form=pdfDoc.getForm();
            [].slice.call(pageEl.querySelectorAll('[data-crbgroup]')).forEach(function(gEl){
              _crbFieldIdx++;
              var _rg=_form.createRadioGroup('resp_'+_crbFieldIdx+'_status');
              [].slice.call(gEl.querySelectorAll('[data-crbopt]')).forEach(function(o){
                var rr=o.getBoundingClientRect(); if(rr.width<2||rr.height<2)return;
                var ox=(rr.left-pr.left)*sx, oy=(rr.top-pr.top)*sy, ow=rr.width*sx, oh=rr.height*sy;
                try{ _rg.addOptionToPage(o.getAttribute('data-crbopt'), pg, {x:ox,y:ph-(oy+oh),width:ow,height:oh}); }catch(_eo){}
              });
            });
            [].slice.call(pageEl.querySelectorAll('[data-crbcomment]')).forEach(function(cEl){
              var rr=cEl.getBoundingClientRect(); if(rr.width<2||rr.height<2)return;
              _crbFieldIdx++;
              var cx=(rr.left-pr.left)*sx, cy=(rr.top-pr.top)*sy, cw=rr.width*sx, chh=rr.height*sy;
              try{ _form.createTextField('resp_'+_crbFieldIdx+'_comment').addToPage(pg,{x:cx,y:ph-(cy+chh),width:cw,height:chh}); }catch(_ec){}
            });
          }catch(_cw){}
        }catch(e){}
      }
      _capStatus(D,'Saving PDF…');
      var bytes=await pdfDoc.save();
      var blob=new Blob([bytes],{type:'application/pdf'});
      var fname=(D.title||'ARENCON_Report').replace(/[^\w.-]+/g,'_')+'.pdf';
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
    }catch(err){
      if(bar) bar.style.display='';
      _capStatus(D,'Export error: '+(err&&err.message?err.message:err));
      try{console.error('[capture export]',err);}catch(e){}
    }
  })();
}
try{
  var barFix=D.createElement('div');barFix.id='pdf-btn-bar';
  barFix.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;overflow:hidden;background:#2C4770;box-shadow:0 2px 8px rgba(0,0,0,.3);';
  var bar=D.createElement('div');bar.id='pdf-btn-bar-inner';
  bar.style.cssText='transform-origin:top left;box-sizing:border-box;background:#2C4770;padding:10px 20px;display:flex;align-items:center;gap:12px;will-change:transform,width;';
  var pb=D.createElement('button');pb.innerHTML='\uD83D\uDCC4 Export PDF';
  pb.style.cssText='padding:8px 24px;background:#2E9E72;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;';
  pb.onclick=function(){_captureExportPDF(w,D);};bar.appendChild(pb);
  var ht=D.createElement('span');ht.textContent='Click to save the report as a PDF (matches this preview exactly).';
  ht.style.cssText='color:rgba(255,255,255,.7);font-size:13px;font-family:Calibri,sans-serif;flex:1;';bar.appendChild(ht);
  var cb=D.createElement('button');cb.innerHTML='\u2715 Close';
  cb.style.cssText='padding:8px 20px;background:#455A64;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;font-family:Calibri,sans-serif;';
  cb.onclick=function(){w.close();};bar.appendChild(cb);
  barFix.appendChild(bar);
  D.body.insertBefore(barFix,D.body.firstChild);D.body.style.paddingTop='56px';
  // S338 (#32): the page-zoom counter-scale is REMOVED. It tried to invert the
  // bar against zoom via devicePixelRatio, but Chrome's page-zoom control does
  // NOT move visualViewport.scale / devicePixelRatio in a way JS can read, so the
  // counter-scale never countered page zoom — it only added a 400ms interval +
  // transform/width thrash for no benefit (and could itself mis-size the strip).
  // Mark is fine with a consistent full-width banner (it carries Close, so a
  // compact cluster has nowhere to put it). Now a plain fixed banner: it scales
  // with page zoom like all page content, which is predictable. The bar never
  // appears in the actual PDF (@media print hides #pdf-btn-bar).
}catch(e){}

// Pagination
var PAGE_H=912;var measureZone=D.getElementById('measure-zone');var pagesContainer=D.getElementById('pages-container');
function _measure(html){measureZone.innerHTML=html;var h=measureZone.offsetHeight;measureZone.innerHTML='';return h;}
// S(this) FIX — title-detach bug: ALL pagination height measurements must run
// AFTER the embedded Blair/Carlito @font-face have decoded in this print window.
// Measuring earlier sizes the title block at fallback-font height; it then prints
// taller in the real font and overshoots the page, detaching the title. Preview
// looked fine only because fonts had settled by the time the user looked. Gating
// the whole measure+render pass on fonts.ready makes every measurement use the
// real printed font. Defensive: if fonts API is missing/never resolves, a 1500ms
// fallback still runs pagination so export can never hang.
var _fontsReady = (D.fonts && D.fonts.ready) ? D.fonts.ready : Promise.resolve();
var _pagRan=false;
function _runPaginationGated(){ if(_pagRan)return; _pagRan=true; _runPagination(); }
_fontsReady.then(_runPaginationGated, _runPaginationGated);
setTimeout(_runPaginationGated, 1500);
function _runPagination(){
var FULL_HEADER_H=_measure(fullHeader+infoGrid+summaryHtml);
// S284 auto-compact cascade: if the dashboard page would overflow the page
// budget (many contractors), swap in the compact dashboard (overall bar only,
// per-contractor rows deferred to the table) and re-measure. Deterministic —
// measured, never guessed.
if(_recsMode!=='only'&&_dashHtmlFull&&FULL_HEADER_H>PAGE_H){
  summaryHtml=_dashHtmlCompact+_progressBarsHtml+_deficSummaryHtml+_hiRecNoteHtml;
  FULL_HEADER_H=_measure(fullHeader+infoGrid+summaryHtml);
}
var COMPACT_HEADER_H=_measure(_compactHeader(2));
var pages=[];var curPageHtml='';var curUsed=0;var curPageNum=1;var isFirstPage=true;
function _startPage(){curPageHtml='';curUsed=0;if(isFirstPage){curPageHtml+=fullHeader+infoGrid+summaryHtml;curUsed+=FULL_HEADER_H;isFirstPage=false;}}
function _finalizePage(){if(curPageHtml.trim()){pages.push({html:curPageHtml,pageNum:curPageNum});curPageNum++;}}
_startPage();
// S284 (Mark-approved): page 1 is the summary dashboard; deficiency items
// ALWAYS start fresh on page 2 (compact header attaches at render for pn>1).
// Kills the page-1 gap problem outright — any card size fits a fresh page.
// Recs-only mode keeps its existing flow (rec body rides page 1).
if(_recsMode!=='only'&&_dashHtmlFull){_finalizePage();_startPage();}
var _aCtrHtml='';var _aTradeHtml='';
// S139 Phase 3: re-stamp the active Trade band (then Contractor/Rec band)
// at the top of a continued page so a section spanning pages keeps its
// full Trade -> Contractor context. Mirrors the pre-S139 _aCtrHtml restamp.
function _restamp(){if(_aTradeHtml){curPageHtml+=_aTradeHtml;curUsed+=_measure(_aTradeHtml);}if(_aCtrHtml){curPageHtml+=_aCtrHtml;curUsed+=_measure(_aCtrHtml);}}
// S142 Batch 3-2: extracted from `contentBlocks.forEach(...)` into a
// named function so the SAME pagination machinery (page-fit, restamp,
// dc-split) can flow the pooled Recommendations blocks on their own
// forced new page after Previously Closed Items. Behaviour identical for
// the main body — it is still `contentBlocks.forEach(_flowBlock)` below.
function _flowBlock(block){
  var blockH=_measure(block.html);var avail=PAGE_H-curUsed;
  if(block.type==='tradeHeader'){
    _aTradeHtml=block.htmlCont||block.html;_aCtrHtml='';
    // S148 D1 (Option #1): keep the whole trade together when it fits a
    // fresh page but not the space left here. _freshCap mirrors the
    // engine's existing "can this ever fit a page" ceiling (used ~line
    // 958 below) for consistency. curUsed>PAGE_H*0.15 reuses the
    // engine's own "don't waste a near-empty page" idiom (lines ~959/
    // 962) so this never fires at the top of a fresh page. recBlocks'
    // tradeHeaders have no _secH (||0) so this is inert for recs.
    var _secH=block._secH||0,_freshCap=PAGE_H-COMPACT_HEADER_H;
    // S341 (Mark): the keep-together rule was too aggressive — ANY trade section
    // that didn't fit the remaining space got pushed to a fresh page, leaving a
    // big blank gap at the bottom of the prior page (field report: Fire Alarm
    // page had a half-page gap because General Contracting jumped to a fresh
    // page). Mark's call: no blank gap is better than keeping every section
    // whole. So only keep a section together when it's SMALL enough that
    // splitting it would orphan an awkward sliver (≤ ~45% of a page). Larger
    // sections flow naturally and fill the space — they split across the page
    // boundary (the trade band re-stamps "(cont.)" on the next page, unchanged).
    var _keepTogetherCap=PAGE_H*0.45;
    if(_secH&&_secH<=_freshCap&&_secH<=_keepTogetherCap&&avail<_secH&&curUsed>PAGE_H*0.15){
      _finalizePage();_startPage();avail=PAGE_H-curUsed;
    }
    // S(this): keep the trade band with its contractor sub-band + first item so
    // the title never orphans at a page bottom. _keepH (stamped above) = sub-band
    // + first-item height. Fall back to the old +200 lookahead when no keep was
    // stamped or it can't fit a fresh page anyway.
    var _tKeep=block._keepH||0,_tCap=PAGE_H-COMPACT_HEADER_H;
    var _tNeed=(_tKeep&&_tKeep<=_tCap)?_tKeep:200;
    if(avail<blockH+_tNeed){_finalizePage();_startPage();}
    curPageHtml+=block.html;curUsed+=_measure(block.html);return;
  }
  if(block.type==='ctrHeader'||block.type==='recHeader'){
    // S118: use the pre-built (cont.) variant from the block — replaces the old "— continued" string concat
    _aCtrHtml=block.htmlCont||block.html;
    // S284 keep-with-next: a contractor band must never sit ITEM-LESS at a
    // page bottom (the "Vipond (cont.)" orphan — the band fit under the old
    // fixed +200 lookahead, but its first card didn't, so the generic branch
    // broke the page and _restamp re-emitted the band as "(cont.)" on the
    // next page). _keepH (stamped by the pre-pass below) = measured height
    // of the band's FIRST item block. Require band+first-item to fit here;
    // otherwise break BEFORE the band. Items too tall for even a fresh page
    // (they dc-split regardless) and band-with-no-item fall back to the old
    // +200 heuristic so an unsatisfiable keep never wastes a page.
    var _keepH=block._keepH||0,_keepCap=PAGE_H-COMPACT_HEADER_H;
    var _need=(_keepH&&_keepH<=_keepCap)?_keepH:200;
    if(avail<blockH+_need){_finalizePage();_startPage();if(_aTradeHtml){curPageHtml+=_aTradeHtml;curUsed+=_measure(_aTradeHtml);}}
    curPageHtml+=block.html;curUsed+=_measure(block.html);return;
  }
  if(blockH<=avail){curPageHtml+=block.html;curUsed+=blockH;}
  else if(blockH<=PAGE_H-COMPACT_HEADER_H){
    if(curUsed>PAGE_H*0.15){_finalizePage();_startPage();_restamp();}
    curPageHtml+=block.html;curUsed+=blockH;
  }else{
    if(curUsed>PAGE_H*0.15){_finalizePage();_startPage();_restamp();}
    var sp=block.html.split(/<div class="dc-split/);
    if(sp.length<=1){curPageHtml+=block.html;curUsed+=blockH;}
    else{
      var cH=sp[0];var _isCrbCard=/class="crb-bd"/.test(cH);var cF=_isCrbCard?'</div></div></div></div></div>':'</div></div></div>';
      var _cim=(cH.match(/<span class="dc-itemnum">([\s\S]*?)<\/span>/)||[])[1]||'';var _cpr=(cH.match(/<span class="pinref-dark">([\s\S]*?)<\/span>/)||[])[1]||'';var _hasMini=/dc-mini/.test(cH);
      var _contHead='<div class="dc"><div class="dc-inner">'+(_hasMini?'<div class="dc-mini-cont"></div>':'')+'<div class="dc-content"><div class="item-contband"><span class="dc-itemnum">'+_cim+'</span>'+(_cpr?' <span class="pinref-dark">'+_cpr+'</span>':'')+' <span class="cont">continued</span></div>'+(_isCrbCard?'<div class="crb"><div class="crb-hd">Contractor Response \u2014 thread (cont.)</div><div class="crb-bd">':'');
      curPageHtml+=cH;curUsed+=_measure(cH+cF);
      for(var si=1;si<sp.length;si++){
        var sH='<div class="dc-split'+sp[si];var sHt=_measure(sH);
        if(curUsed+sHt>PAGE_H&&si>1){
          curPageHtml+='<div style="font-size:8.5pt;color:#928E9C;font-weight:700;font-style:italic;text-align:right;margin-top:6px;">continues on next page \u2192</div>'+cF;
          _finalizePage();_startPage();_restamp();
          curPageHtml+=_contHead;
          curUsed+=_measure(_contHead+cF);
        }
        curPageHtml+=sH;curUsed+=sHt;
      }
      curPageHtml+=cF;
    }
  }
}
// S148 D1 (Option #1, Mark-approved): per-trade keep-together pre-pass.
// For each tradeHeader in the MAIN deficiency body, pre-measure the
// whole trade section = that header + every following block up to the
// next tradeHeader (or end), and stash the total on the header block as
// _secH. The tradeHeader branch of _flowBlock reads _secH to force a
// fresh page when an entire trade would otherwise start near a page
// bottom and break mid-section — but ONLY when the trade actually fits
// a fresh page (an over-page-length trade must still split, behaviour
// unchanged). This is a pure measurement pass over contentBlocks; it
// does NOT touch _flowBlock's own per-block measuring, the bin-pack,
// dc-split, go(pg), or recBlocks (recs flow separately and already get
// a forced fresh page as a whole section — intentionally untouched).
(function(){
  for(var i=0;i<contentBlocks.length;i++){
    if(contentBlocks[i].type!=='tradeHeader')continue;
    var s=_measure(contentBlocks[i].html);
    for(var j=i+1;j<contentBlocks.length&&contentBlocks[j].type!=='tradeHeader';j++){
      s+=_measure(contentBlocks[j].html);
    }
    contentBlocks[i]._secH=s;
  }
})();
// S284 keep-with-next pre-pass: stamp each ctrHeader/recHeader with the
// measured height of its FIRST following item block (_keepH), so the band
// branch above can refuse to start a band whose first card won't fit under
// it. A band immediately followed by another header (empty band) gets no
// stamp → falls back to the +200 heuristic. Pure measurement pass —
// _flowBlock's own per-block measuring, the bin-pack, dc-split, go(pg)
// are untouched (same discipline as the S148 _secH pass above).
function _stampKeepWithNext(blocks){
  for(var i=0;i<blocks.length;i++){
    var t=blocks[i].type;
    if(t!=='ctrHeader'&&t!=='recHeader'&&t!=='tradeHeader')continue;
    var nb=blocks[i+1];
    if(nb&&nb.type!=='tradeHeader'&&nb.type!=='ctrHeader'&&nb.type!=='recHeader'){
      blocks[i]._keepH=_measure(nb.html);
    }else if(nb&&(nb.type==='ctrHeader'||nb.type==='recHeader')){
      // S(this): a trade header is immediately followed by a contractor sub-band.
      // Keep the trade band, the sub-band, AND the sub-band's first item together
      // so a trade title can never sit alone at a page bottom (the floating
      // "Electrical"/"Fire Alarm" orphan). Stamp the trade header with the
      // sub-band height PLUS the sub-band's own _keepH (its first item).
      var sub=_measure(nb.html);var nn=blocks[i+2];
      var first=(nn&&nn.type!=='tradeHeader'&&nn.type!=='ctrHeader'&&nn.type!=='recHeader')?_measure(nn.html):0;
      blocks[i]._keepH=sub+first;
    }
  }
}
_stampKeepWithNext(contentBlocks);
contentBlocks.forEach(_flowBlock);
// S341 (Mark): the closing "further deficiencies may be noted" note was here at
// the end of the body, where it kept orphaning onto its own blank page before
// the appendix. It now lives directly under the Deficiency Summary table on
// page 1 (built above), so this end-of-body placement is removed.
_finalizePage();

// S317 BUGFIX: appendix image render jobs, shared between both _emitAppendices
// calls and the drawing-render pass further down. Declared here (S408: moved up
// from the pre-appendix position) so the FIRST call already sees live values —
// var assignment does not hoist, only the declaration does.
var _appendixImgJobs=[]; // { imgId, drawingId, pins:[r,...] }
// S402: minimap/appendix images are rendered by a fire-and-forget async chain
// (Promise.all -> nextJob -> _renderMinimaps -> per-img .src=). Capture used to
// screenshot before that chain finished, snapshotting empty src="" imgs as the
// "drawing" alt placeholder — the root cause of "PDF doesn't match preview".
// This promise resolves ONLY when every appendix img + per-card minimap has its
// real src assigned; _captureExportPDF awaits it before html2canvas.
var _minimapsReady=Promise.resolve();
var _minimapsReadyResolve=null;
function _armMinimapsReady(){ _minimapsReady=new Promise(function(res){_minimapsReadyResolve=res;}); }
function _signalMinimapsReady(){ if(_minimapsReadyResolve){var f=_minimapsReadyResolve;_minimapsReadyResolve=null;f();} }
// S408: appendix lettering state — hoisted OUT of _emitAppendices so the letter
// sequence spans both calls (A = deficiency appendix here, B = recommendation
// appendix after the Recommendations section; recs-only reports still get 'A').
var _appLetters='ABCDEFGH';
var _appIdx=0;
// S408 (LOCKED_REPORT_ITEM_NUMBER_S316 §4): Appendix A — Drawings with Pins
// (Deficiencies) — moves BEFORE Previously Closed Items and Recommendations.
// Target order: body → Appendix A → Previously Closed → Recommendations →
// Appendix B. _emitAppendices is declared further down; function declarations
// hoist across the whole function body, so this early call is safe.
_emitAppendices(['deficiency']);

// Closed summary
var _cp=window._frtCrbPreview,_csp=_cp?6:5;
if((showClosedSummary&&closedSummaryDefs.length||_cp)&&_recsMode!=='only'){
  var csG={};closedSummaryDefs.forEach(function(r){var i=r.d.closedOnInstance||1;if(!csG[i])csG[i]=[];csG[i].push(r);});
  var csI=Object.keys(csG).map(Number).sort(function(a,b){return a-b;});
  var cH2='<div style="border:1px solid #DDE1E7;border-radius:6px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:10pt;">';
  cH2+='<thead><tr style="background:#2A3A5C;color:white;"><th colspan="'+_csp+'" style="padding:8px 12px;text-align:left;font-size:12pt;">Previously Closed Items</th></tr>';
  cH2+='<tr style="background:#4A5568;font-weight:700;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:white;"><th style="padding:5px 10px;text-align:left;">Pin</th><th style="padding:5px 10px;text-align:left;">Description</th><th style="padding:5px 10px;text-align:left;">Contractor</th><th style="padding:5px 10px;text-align:left;">Noted</th><th style="padding:5px 10px;text-align:left;">Status</th>'+(_cp?'<th style="padding:5px 10px;text-align:center;">Rounds</th>':'')+'</tr></thead><tbody>';
  csI.forEach(function(inst){
    var items=csG[inst];var cd2=items[0].d.closedDate||'';
    cH2+='<tr><td colspan="'+_csp+'" style="padding:6px 10px;background:#EEF2F4;font-weight:700;font-size:9.5pt;border-top:1.5px solid #DDE1E7;color:#4A5568;">Closed in FRT #'+inst+(cd2?' \u2014 '+cd2:'')+' ('+items.length+' item'+(items.length!==1?'s':'')+')</td></tr>';
    items.forEach(function(r,ri){
      var desc=_itemDesc(r);var td=desc.length>80?desc.substring(0,80)+'\u2026':desc;
      var _rnd=Math.max(1,((r.d.closedOnInstance||1)-(r.d.notedOnInstance||1))+1);
      cH2+='<tr style="background:'+(ri%2===0?'#fff':'#fafafa')+';"><td style="padding:5px 10px;font-weight:700;color:#9C2742;">#'+(r.numLabel||r.d.num)+'</td><td style="padding:5px 10px;">'+esc(td)+'</td><td style="padding:5px 10px;">'+esc(r.ctr)+'</td><td style="padding:5px 10px;">FRT #'+(r.d.notedOnInstance||1)+'</td><td style="padding:5px 10px;color:#3F6E55;font-weight:700;">'+esc(r.d.closedNote||'Addressed')+'</td>'+(_cp?'<td style="padding:5px 10px;text-align:center;font-weight:700;color:#4A5568;">'+_rnd+'</td>':'')+'</tr>';
    });
  });
  if(_cp&&!csI.length){
    cH2+='<tr><td colspan="'+_csp+'" style="padding:6px 10px;background:#EEF2F4;font-weight:700;font-size:9.5pt;border-top:1.5px solid #DDE1E7;color:#4A5568;">Closed in FRT #2 \u2014 2026-07-02 (2 items)</td></tr>';
    cH2+='<tr style="background:#fff;"><td style="padding:5px 10px;font-weight:700;color:#9C2742;">#5</td><td style="padding:5px 10px;">Missing signage at fire pump room entry</td><td style="padding:5px 10px;">Apex Fire Protection</td><td style="padding:5px 10px;">FRT #1</td><td style="padding:5px 10px;color:#3F6E55;font-weight:700;">Addressed</td><td style="padding:5px 10px;text-align:center;font-weight:700;color:#4A5568;">2</td></tr>';
    cH2+='<tr style="background:#fafafa;"><td style="padding:5px 10px;font-weight:700;color:#9C2742;">#8</td><td style="padding:5px 10px;">Sprinkler escutcheon not flush at Level 3 corridor</td><td style="padding:5px 10px;">Classic Fire &amp; Life Safety</td><td style="padding:5px 10px;">FRT #1</td><td style="padding:5px 10px;color:#3F6E55;font-weight:700;">Addressed</td><td style="padding:5px 10px;text-align:center;font-weight:700;color:#4A5568;">3</td></tr>';
  }
  cH2+='</tbody></table></div>';
  _startPage();curPageHtml+=cH2;curUsed+=_measure(cH2);_finalizePage();
}

// S142 Batch 3-2 (Model 2 §4.4): pooled "Recommendations" section on a
// FORCED new page, AFTER Previously Closed Items. The prior block always
// _finalizePage()'d (main body, the closing note, or the Closed summary),
// so _startPage() here begins a guaranteed fresh page. Reset the restamp
// state so a continued rec page can't re-stamp a stale deficiency trade
// band; the first recBlock is the navy "Recommendations" band which then
// sets _aTradeHtml itself. Flowed through the SAME pagination machinery
// (_flowBlock) so a long rec list paginates correctly.
if(recBlocks.length){
  _aTradeHtml='';_aCtrHtml='';
  _startPage();
  _stampKeepWithNext(recBlocks); // S284: rec bands get the same keep-with-next
  recBlocks.forEach(_flowBlock);
  _finalizePage();
}

// S408: the recommendation appendix (Appendix B) is emitted HERE — after the
// pooled Recommendations section — while the deficiency appendix (Appendix A)
// was emitted earlier via the same _emitAppendices function (see the call
// after the main-body flow). Function declaration hoists; the shared
// declarations (_appendixImgJobs, _minimapsReady machinery, _appLetters/
// _appIdx) were moved up beside the first call so both calls and the
// drawing-render pass further down see live values.
_emitAppendices(['recommendation']);
// Appendix — S317: split into lettered Appendix A (deficiency pins) and
// Appendix B (recommendation pins). Each appendix shows ONLY its own pin type
// (legal separation — rec pins never land on deficiency drawings). Lettering:
// A = deficiencies (always, when defic pins on drawings exist); B = recs (only
// when recs are included AND rec pins exist on drawings). Pin table gains a
// leading Item column reading r._itemNo (body-order item #). LOCKED S316 spec.
// S408: wrapped as a function; _kindsWanted filters which lettered appendix
// this call emits. Lettering state persists ACROSS calls (hoisted _appIdx) so
// A/B assignment is unchanged, including the recs-only 'A' fallback.
function _emitAppendices(_kindsWanted){
if(isField&&p.drawings&&p.drawings.length){
  // S317 prior-closed predicate (mirrors the rec section's _recPrevClosed and
  // the deficiency Previously-Closed split): an item closed in a PRIOR instance
  // leaves the active flow → it must NOT appear in its appendix (it lives in the
  // Previously Closed section instead). Closed THIS instance stays (shown Closed).
  // S342: read the closing instance the SAME way mainBodyDefs does — prefer the
  // per-obs addressedOnInstance when the obs carries addressed metadata, else
  // fall back to pin-level closedOnInstance — so the appendix can never disagree
  // with the page-1 body about whether an item is current- vs prior-closed.
  function _appClosedInst(r){
    var obs=r.obs;
    if(obs&&obs.addressed!==undefined)return obs.addressedOnInstance||r.d.closedOnInstance||_curInst;
    return r.d.closedOnInstance||_curInst;
  }
  function _appPrevClosed(r){return _deficIsClosed(r.d)&&(_appClosedInst(r)<_curInst);}
  // Build the lettered list of appendices to emit, in order.
  var _appendixDefs=[];
  // Appendix A — deficiency drawings (non-rec pins). Suppressed in recs-only
  // mode (there are no deficiencies in the report, so no deficiency appendix).
  // S342 (N+1 rule fix): a deficiency closed in a PRIOR instance must NOT appear
  // here — neither as a drawing pin nor as a pin-table row. It leaves the active
  // flow and lives ONLY in the "Previously Closed Items" section (matching the
  // page-1 body, which already excludes prior-closed via mainBodyDefs, and the
  // recommendation appendix below, which already applies _appPrevClosed). Closed
  // THIS instance still shows (status "Closed"). Before this fix the deficiency
  // predicate was prev-closed-agnostic, so an item closed in report #2 wrongly
  // re-appeared on the drawing AND in the appendix table when viewing report #3.
  if(_recsMode!=='only'){
    _appendixDefs.push({kind:'deficiency',
      pred:function(r){return !(r.d&&r.d.isRecommendation)&&!_appPrevClosed(r);}});
  }
  // Recommendation appendix — gated on recs-included + active rec pins exist.
  // Takes the NEXT free letter: 'A' when it's the only appendix (recs-only or
  // no deficiency drawings), 'B' when it follows the deficiency appendix.
  if(_recsMode!=='exclude'){
    var _hasRecPin=reportDefs.some(function(r){return r.d&&r.d.isRecommendation&&!_appPrevClosed(r)&&r.d.drawingId!=null&&r.d.pinX!=null;});
    if(_hasRecPin)_appendixDefs.push({kind:'recommendation',
      pred:function(r){return !!(r.d&&r.d.isRecommendation)&&!_appPrevClosed(r);}});
  }
  // S408: emit only the appendix kinds this call asked for (letters hoisted).
  _appendixDefs=_appendixDefs.filter(function(def){return _kindsWanted.indexOf(def.kind)>=0;});
  // (img-render jobs collected into the hoisted _appendixImgJobs above)
  _appendixDefs.forEach(function(def){
    // Drawings that carry at least one pin matching this appendix's predicate.
    var dwP=p.drawings.filter(function(dw){return reportDefs.some(function(r){return def.pred(r)&&r.d.drawingId===dw.id&&r.d.pinX!=null;});});
    if(!dwP.length)return; // nothing to emit for this letter
    var _isRecAppendix=(def.kind==='recommendation');
    var _letter=_appLetters.charAt(_appIdx);_appIdx++;
    var _appTitle='Appendix '+_letter+' \u2014 Drawings with Pins ('+(_isRecAppendix?'Recommendations':'Deficiencies')+')';
    var _firstDrawingOfAppendix=true;
    dwP.forEach(function(dw){
      var dPins=reportDefs.filter(function(r){return def.pred(r)&&r.d.drawingId===dw.id&&r.d.pinX!=null;});
      // S327 (B4): appendix rows read in ascending body Item # order. reportDefs
      // is body render order (grouped by section/priority), so within one drawing
      // the _itemNo values can be non-monotonic — sort here so the Item column is
      // top-to-bottom. null/em-dash rows (prior-closed; shouldn't occur) sort last.
      dPins.sort(function(a,b){
        var ai=(a._itemNo!=null)?a._itemNo:Infinity, bi=(b._itemNo!=null)?b._itemNo:Infinity;
        return ai-bi;
      });
      // S346 card builder — one appendix .dc card (body-style, minus photo/follow-
      // up). Used for BOTH measuring (chunking) and emitting, so they never drift.
      function _appCard(r){var d=r.d;
        var rowOpen=_itemIsOpen(r);
        var pillCls,pillTxt;
        if(_isRecAppendix){
          if(rowOpen){pillCls='pill-rec';pillTxt='Recommendation';}
          else{pillCls='pill-c';pillTxt='Closed';}
        }else if(rowOpen){pillCls='pill-h';pillTxt='Outstanding';}
        else{pillCls='pill-c';pillTxt='Closed';}
        var _itm=(r._itemNo!=null)?r._itemNo:'\u2014';
        var _pinRef='Pin '+esc(r.numLabel||d.num);
        var h='<div class="dc">';
        h+='<div class="dc-hdr"><span class="dc-hdr-l"><span class="dc-itemnum">'+_itm+'</span><span class="item-sep">\u00b7</span><span class="pinref-dark">'+_pinRef+'</span></span><span class="dc-hdr-r"><span class="'+pillCls+'">'+esc(pillTxt)+'</span></span></div>';
        h+='<div class="dc-desc">'+_descHtml(_itemDesc(r))+'</div>';
        if(r.ctr)h+='<div class="dc-footer">'+esc(r.ctr)+'</div>';
        h+='</div>';
        return h;
      }
      // S346: LETTER keeps the ORIGINAL appendix layout — drawing on TOP (full
      // width) + the .app-pin-table below. Mark S346: keep this stacked layout
      // (NOT left/right), but CHUNK it — when the table overflows the page, split
      // to a new page that REPEATS the drawing with only that page's rows
      // (locked spec, same rule as landscape, stacked instead of side-by-side).
      if(_drawPageSize!=='11x17'&&_drawPageSize!=='24x36'){
        // Build one table-row's HTML (used for measuring AND emitting).
        function _appRow(r){var d=r.d;
          var rowOpen=_itemIsOpen(r);
          var statusTxt,statusCol;
          if(_isRecAppendix){
            if(rowOpen){statusTxt='Recommendation';statusCol='#5E5440';}
            else{statusTxt='Closed';statusCol='#5F8068';}
          }else if(rowOpen){statusTxt='Outstanding';statusCol='#A85959';}
          else{statusTxt='Closed';statusCol='#5F8068';}
          var _itm=(r._itemNo!=null)?('<strong style="color:#9C2742;">'+r._itemNo+'</strong>'):'<span style="color:#B8BCC6;">\u2014</span>';
          return '<tr><td>'+_itm+'</td><td><strong style="color:#9C2742;">#'+(r.numLabel||d.num)+'</strong></td><td>'+_descHtml(_itemDesc(r))+'</td><td style="color:'+statusCol+';font-weight:700;">'+statusTxt+'</td><td>'+esc(r.ctr)+'</td></tr>';
        }
        // Measure one row in a real .app-pin-table (the measureZone is 7.3in wide,
        // = the Letter content width, so the row wraps exactly as it will print).
        function _measureRow(rowHtml){
          return _measure('<table class="app-pin-table"><tbody>'+rowHtml+'</tbody></table>');
        }
        // Vertical budget for ROWS on a page = page content height minus the
        // title band, the drawing display height, the table header, and slack.
        // Drawing on Letter is max-width:100% (~7.3in wide); reserve its height
        // at the same px/in scale assuming a landscape-ish sheet (~1.45 ratio).
        var _PXPI_L=PAGE_H/10;                 // 91.2 px per usable inch
        var _dwgReserve=(7.3/1.45)*_PXPI_L;    // ~5in tall drawing
        var _titleBandHL=_measure('<div class="sh" style="margin-top:0;">'+esc(_appTitle)+'</div><div class="app-dwg-title">'+esc(dw.name)+'</div>');
        var _theadH=_measure('<table class="app-pin-table"><thead><tr><th>Item</th><th>Pin</th><th>Description</th><th>Status</th><th>Contractor</th></tr></thead></table>');
        var _rowsAvailH=PAGE_H-_titleBandHL-_dwgReserve-_theadH-24;
        if(_rowsAvailH<120)_rowsAvailH=120; // floor: always allow some rows

        var _chunksL=[]; var _curL=[]; var _curHL=0;
        dPins.forEach(function(r){
          var rh=_measureRow(_appRow(r));
          if(_curL.length && _curHL+rh>_rowsAvailH){_chunksL.push(_curL);_curL=[];_curHL=0;}
          _curL.push(r);_curHL+=rh;
        });
        if(_curL.length)_chunksL.push(_curL);
        if(!_chunksL.length)_chunksL.push([]);

        _chunksL.forEach(function(chunkPins,_ci){
          var aHL='';
          if(_firstDrawingOfAppendix){aHL+='<div class="sh" style="margin-top:0;">'+esc(_appTitle)+'</div>';_firstDrawingOfAppendix=false;}
          else{aHL+='<div class="sh" style="margin-top:0;">'+esc('Appendix '+_letter)+' <span class="ch-cont">(cont.)</span></div>';}
          aHL+='<div class="sb" style="padding:8px;"><div class="app-dwg">';
          var _pinCountTxtL=(_chunksL.length>1)
            ? (chunkPins.length+' pin'+(chunkPins.length>1?'s':'')+' (of '+dPins.length+')')
            : (dPins.length+' pin'+(dPins.length>1?'s':''));
          aHL+='<div class="app-dwg-title">'+esc(dw.name)+' \u2014 '+_pinCountTxtL+'</div>';
          var _imgIdL='app-dwg-'+_letter+'-'+dw.id+'-'+_ci;
          aHL+='<img class="app-dwg" id="'+_imgIdL+'" src="" alt="'+esc(dw.name)+'" style="max-width:100%;height:auto;display:block;border:1px solid #DDE1E7;border-radius:4px;">';
          _appendixImgJobs.push({imgId:_imgIdL,drawingId:dw.id,pins:chunkPins});
          aHL+='<table class="app-pin-table"><thead><tr><th>Item</th><th>Pin</th><th>Description</th><th>Status</th><th>Contractor</th></tr></thead><tbody>';
          chunkPins.forEach(function(r){aHL+=_appRow(r);});
          aHL+='</tbody></table></div></div>';
          pages.push({html:aHL,pageNum:curPageNum,isAppendix:true,appSize:_drawPageSize});curPageNum++;
        });
        return; // Letter path done for this drawing
      }
      // ===== LANDSCAPE (11x17 / 24x36) below: split + measured chunking =====
      // right column; the drawing occupies the left. When the list is taller than
      // the page, split into multiple pages — each repeats the SAME drawing
      // showing ONLY that page's pins (locked spec). Budget = page content height
      // minus the title band + sb padding. Measured via _measure() at the real
      // 4.6in list width (measureZone is 7.3in wide; we wrap in a fixed-width box).
      // _measure gives the card's rendered height in the export's own metrics, so
      // the split matches the printed page exactly.
      function _measureAppCard(html){
        return _measure('<div style="width:4.6in;">'+html+'</div>');
      }
      // Page content height for this sheet size (logical px, matching PAGE_H=912
      // = Letter content height). 11x17/24x36 are landscape: SHORTER than Letter
      // portrait content height per inch isn't true — content height = (paper
      // height - 1in vert padding) scaled the same way PAGE_H scales Letter's 10in.
      // PAGE_H(912) corresponds to Letter's 10in usable height -> 91.2 px/in.
      var _PXPI=PAGE_H/10; // px per usable inch (912/10)
      var _sheetUsableH = (_drawPageSize==='24x36') ? (24-1)*_PXPI
                        : (11-1)*_PXPI; // 11x17 (Letter returned early above)
      var _titleBandH=_measure('<div class="sh" style="margin-top:0;">'+esc(_appTitle)+'</div><div class="app-dwg-title">'+esc(dw.name)+'</div>');
      var _availH=_sheetUsableH-_titleBandH-24; // 24 = sb padding(8*2)+slack

      var _chunks=[]; var _cur=[]; var _curH=0;
      dPins.forEach(function(r){
        var ch=_measureAppCard(_appCard(r));
        if(_cur.length && _curH+ch>_availH){_chunks.push(_cur);_cur=[];_curH=0;}
        _cur.push(r);_curH+=ch;
      });
      if(_cur.length)_chunks.push(_cur);
      if(!_chunks.length)_chunks.push([]); // safety

      // Emit one page per chunk. Drawing repeats each page with that page's pins.
      _chunks.forEach(function(chunkPins,_ci){
        var aH='';
        if(_firstDrawingOfAppendix){aH+='<div class="sh" style="margin-top:0;">'+esc(_appTitle)+'</div>';_firstDrawingOfAppendix=false;}
        else{aH+='<div class="sh" style="margin-top:0;">'+esc('Appendix '+_letter)+' <span class="ch-cont">(cont.)</span></div>';}
        aH+='<div class="sb" style="padding:8px;">';
        var _pinCountTxt=(_chunks.length>1)
          ? (chunkPins.length+' pin'+(chunkPins.length>1?'s':'')+' (of '+dPins.length+')')
          : (dPins.length+' pin'+(dPins.length>1?'s':''));
        aH+='<div class="app-dwg-title">'+esc(dw.name)+' \u2014 '+_pinCountTxt+'</div>';
        aH+='<div class="app-split">';
        // S346: per-chunk image id so each page's drawing renders its OWN pins.
        var _imgId='app-dwg-'+_letter+'-'+dw.id+'-'+_ci;
        aH+='<div class="app-split-dwg"><img id="'+_imgId+'" src="" alt="'+esc(dw.name)+'"></div>';
        _appendixImgJobs.push({imgId:_imgId,drawingId:dw.id,pins:chunkPins});
        aH+='<div class="app-split-list">';
        chunkPins.forEach(function(r){aH+=_appCard(r);});
        aH+='</div>'; // .app-split-list
        aH+='</div>'; // .app-split
        aH+='</div>'; // .sb
        pages.push({html:aH,pageNum:curPageNum,isAppendix:true,appSize:_drawPageSize});curPageNum++;
      });
    });
  });
}
}

// Render pages
var allH='';
pages.forEach(function(pg,idx){
  // S346: appendix pages carry the chosen drawing-sheet size class (.p11x17 /
  // .p24x36). Body pages and 'letter' appendix pages stay default .page.
  var _pgCls='page';
  if(pg.isAppendix&&pg.appSize&&pg.appSize!=='letter')_pgCls+=' '+(pg.appSize==='11x17'?'p11x17':'p24x36');
  var pn=idx+1;allH+='<div class="'+_pgCls+'">';
  if(pn>1)allH+=_compactHeader(pn);
  allH+='<div class="page-content">'+pg.html+'</div></div>';
});
pagesContainer.innerHTML=allH;

// Drawing rendering
if(isField){
  // Load each drawing's dataUrl ONCE (keyed by drawing id), then render each
  // APPENDIX IMG JOB separately — a drawing in both A and B gets two images, each
  // with only its appendix's pins. The minimap teardrops (mm-*) are rendered from
  // the union of pins (each card's own minimap, appendix-agnostic).
  var dwgMap={};
  _appendixImgJobs.forEach(function(job){
    if(!dwgMap[job.drawingId]){var dObj=(p.drawings||[]).find(function(x){return x.id===job.drawingId;});
      if(dObj)dwgMap[job.drawingId]={dataUrl:dObj.dataUrl||null,r2Url:dObj.r2Url||null};}
  });
  // Also collect per-card minimap pins from ALL report rows (every body card with
  // a drawing pin has an mm-* image), independent of appendix membership.
  var _mmPins=[];
  reportDefs.forEach(function(r){if(r.d&&r.d.drawingId&&r.d.pinX!=null)_mmPins.push(r);});
  // Ensure every minimap drawing's dataUrl is loaded too (not just appendix drawings).
  _mmPins.forEach(function(r){if(!dwgMap[r.d.drawingId]){var dObj=(p.drawings||[]).find(function(x){return x.id===r.d.drawingId;});if(dObj)dwgMap[r.d.drawingId]={dataUrl:dObj.dataUrl||null,r2Url:dObj.r2Url||null};}});
  var dIds=Object.keys(dwgMap);
  _armMinimapsReady(); // S402: pending until the render chain below finishes
  if(!dIds.length){ _signalMinimapsReady(); }
  if(dIds.length){
    var fp=[];
    dIds.forEach(function(id){var info=dwgMap[id];if(info.dataUrl)return;
      fp.push(IDB.get('drawingBlobs',id).then(function(rec){
        if(rec&&rec.dataBlob&&rec.dataBlob.size>0){return new Promise(function(res){var rd=new FileReader();rd.onload=function(){info.dataUrl=rd.result;res();};rd.onerror=function(){res();};rd.readAsDataURL(rec.dataBlob);});}
        else if(info.r2Url){return fetch(info.r2Url).then(function(r){return r.blob();}).then(function(b){return new Promise(function(res){var rd=new FileReader();rd.onload=function(){info.dataUrl=rd.result;res();};rd.onerror=function(){res();};rd.readAsDataURL(b);});});}
      }).catch(function(){}));
    });
    Promise.all(fp).then(function(){
      // Render each appendix-img job with its own filtered pins.
      var jobs=_appendixImgJobs.filter(function(j){return dwgMap[j.drawingId]&&dwgMap[j.drawingId].dataUrl;});
      var qi=0;
      function nextJob(){
        if(qi>=jobs.length){_renderMinimaps();return;}
        var job=jobs[qi];var du=dwgMap[job.drawingId].dataUrl;
        _renderDrawingWithPins(du,job.pins,function(rendered){
          try{var ae=D.getElementById(job.imgId);if(ae)ae.src=rendered;}catch(x){}
          qi++;nextJob();
        },_drawPageSize);
      }
      // Per-card minimap teardrops (one image per obs row across the report body).
      function _renderMinimaps(){
        var mi=0;var _mmDone={};
        function nextMm(){
          if(mi>=_mmPins.length){_signalMinimapsReady();return;} // S402: chain complete
          var r=_mmPins[mi];
          var info=dwgMap[r.d.drawingId];
          var _mmKey=r.d.id+'-'+r.obsIdx;
          if(!info||!info.dataUrl||_mmDone[_mmKey]){mi++;nextMm();return;}
          _mmDone[_mmKey]=1;
          try{var els=D.querySelectorAll('[data-mm="'+_mmKey+'"]');
            var _isSr=isSiteRecordsName(r.ctr);
            if(els&&els.length){_renderDrawingWithSinglePin(info.dataUrl,r.d,function(su){try{for(var ei=0;ei<els.length;ei++){els[ei].src=su;}}catch(x){}mi++;nextMm();},_isSr);}
            else{mi++;nextMm();}
          }catch(x){mi++;nextMm();}
        }
        nextMm();
      }
      nextJob();
    });
  }
}
} // end _runPagination (font-ready gated)
}

export const initPDFExport={
  generate(type,options){
    var p=Model.getProject();if(!p){toast('No project loaded');return;}
    var opts=options||{};var isField=(type==='field');
    var pfOv=document.createElement('div');pfOv.id='pdf-prefetch-overlay';
    pfOv.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
    pfOv.innerHTML='<div style="background:white;border-radius:12px;padding:28px 36px;box-shadow:0 8px 32px rgba(0,0,0,.3);text-align:center;min-width:320px;"><div style="font-size:16px;font-weight:700;color:#1C2333;margin-bottom:12px;">Preparing PDF Export</div><div id="pf-label" style="font-size:13px;color:#4A5568;margin-bottom:10px;">Fetching photos... 0/0</div><div style="width:100%;height:8px;background:#EDF2F7;border-radius:4px;overflow:hidden;"><div id="pf-bar" style="width:0%;height:100%;background:#2E9E72;border-radius:4px;transition:width .15s;"></div></div><div style="margin-top:12px;font-size:11px;color:#A0AEC0;">This may take a moment for large reports</div></div>';
    document.body.appendChild(pfOv);
    Promise.all([
      fetch('../logo_base64.txt').then(function(r){return r.ok?r.text():'';}).catch(function(){return '';}),
      fetch('../Blaimim_base64.txt').then(function(r){return r.ok?r.text():'';}).catch(function(){return '';})
    ]).then(function(results){
      var logo=(results[0]||'').trim();
      var fontB64=(results[1]||'').trim();
      return _prefetchR2PhotosForPDF(p,function(done,total){
        try{var lbl=document.getElementById('pf-label');var bar=document.getElementById('pf-bar');
        if(lbl)lbl.textContent='Fetching photos... '+done+'/'+total;
        if(bar)bar.style.width=Math.round((done/Math.max(1,total))*100)+'%';}catch(e){}
      }).then(function(r2Cache){
        // S(this) — privacy: mint opaque /p/{token} links for every synced photo
        // BEFORE rendering. Populate _pdfLinkByUrl so _pdfPhotoFullHref emits
        // tokens (never the raw R2 URL). On any mint failure, links simply don't
        // appear — the raw account URL is never exposed.
        _pdfLinkByUrl={};
        try{var lbl2=document.getElementById('pf-label');if(lbl2)lbl2.textContent='Building report snapshots…';}catch(e){}
        // S360: build frozen, content-addressed snapshots for marked/rotated photos
        // FIRST. The clickable link + in-PDF thumbnail both resolve to these.
        return _buildReportSnapshots(p, r2Cache, function(d,t){
          try{var lbl3=document.getElementById('pf-label');var bar=document.getElementById('pf-bar');
          if(lbl3)lbl3.textContent='Building report snapshots… '+d+'/'+t;
          if(bar)bar.style.width=Math.round((d/Math.max(1,t))*100)+'%';}catch(e){}
        }).then(function(){
        try{var lbl2b=document.getElementById('pf-label');if(lbl2b)lbl2b.textContent='Securing photo links…';}catch(e){}
        var keyByUrl=_collectPhotoKeysForMint(p);
        // S360: also mint tokens for snapshot URLs (their bucket keys), so the
        // frozen link is opaque /p/{token} just like originals.
        Object.keys(_snapshotByPhotoId).forEach(function(pid){
          var s=_snapshotByPhotoId[pid];
          if(s&&s.r2Url&&s.r2Key&&!keyByUrl[s.r2Url]) keyByUrl[s.r2Url]=_toR2BucketKey(s.r2Key);
        });
        var keys=Object.keys(keyByUrl).map(function(u){return keyByUrl[u];});
        return _betaMintLinks(keys).then(function(tokenByKey){
          if(tokenByKey&&!tokenByKey.__noauth&&!tokenByKey.__err){
            Object.keys(keyByUrl).forEach(function(url){
              var k=keyByUrl[url];var variants=_betaKeyVariants(k);
              for(var i=0;i<variants.length;i++){if(tokenByKey[variants[i]]){_pdfLinkByUrl[url]=tokenByKey[variants[i]];break;}}
            });
          }
          try{var ov=document.getElementById('pdf-prefetch-overlay');if(ov)ov.remove();}catch(e){}
          _exportPDFWithCache(p,logo,isField,type,r2Cache,opts.ctrFilter||'__all__',!!opts.isFinalComm,!!opts.showClosedSummary,fontB64,opts.untaggedMode,(opts.includeRecs!==false),opts.recsMode,opts.includeSiteRecords,opts.recFooter,opts.inspTag||'off',opts.drawingPageSize||'letter',!!opts.internalMode);
        });
        });
      });
    }).catch(function(e){
      try{var ov=document.getElementById('pdf-prefetch-overlay');if(ov)ov.remove();}catch(e2){}
      console.warn('[PDF] Error:',e);
      _exportPDFWithCache(p,'',isField,type,{},opts.ctrFilter||'__all__',!!opts.isFinalComm,!!opts.showClosedSummary,'',opts.untaggedMode,(opts.includeRecs!==false),opts.recsMode,opts.includeSiteRecords,opts.recFooter,opts.inspTag||'off',opts.drawingPageSize||'letter',!!opts.internalMode);
    });
  }
};

/* ============================================================================
 * BETA — pdf-lib linked-photo report renderer  (C2 Step 2, ADDITIVE)
 * ----------------------------------------------------------------------------
 * Parallel to the locked print renderer (_exportPDFWithCache). Touches NONE of
 * it. Produces a downloadable PDF with: embedded Carlito (selectable/searchable
 * text), photos drawn from the same r2Cache, and REAL /Link /URI annotations
 * over photos -> https://arencon-r2-worker.../p/{token}. Links survive any
 * viewer/re-save (the whole point of C2).
 *
 * Photo links: derives the R2 bucket key from each photo's r2Url, mints via
 * POST /mintlinks (user's Supabase JWT), bakes links it can; any photo whose
 * key can't be derived/minted is drawn WITHOUT a link (export never breaks).
 * The renderer reports a minted/total count so we learn key-derivation
 * reliability on live data.
 *
 * This is a FRESH layout (clean, on-brand) — NOT yet a pixel clone of the print
 * cascade. Labeled BETA in-UI. Layout-fidelity port is the next sessions.
 * ========================================================================== */

var BETA_WORKER='https://files.arencon.app';
// Carlito embedded as base64 (offline, no network font fetch). Decoded to bytes once.
function _betaB64ToBytes(b64){
  var bin=atob(b64);var arr=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  return arr;
}
var BETA_PDFLIB_CDN='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
var BETA_FONTKIT_CDN='https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';

function _betaLoadScript(src){
  return new Promise(function(res,rej){
    if(src.indexOf('pdf-lib')>=0&&window.PDFLib)return res();
    if(src.indexOf('fontkit')>=0&&window.fontkit)return res();
    var s=document.createElement('script');s.src=src;
    s.onload=function(){res();};s.onerror=function(){rej(new Error('load fail '+src));};
    document.head.appendChild(s);
  });
}

function _betaFetchBytes(url){
  return fetch(url).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status+' '+url);return r.arrayBuffer();})
    .then(function(b){return new Uint8Array(b);});
}

/* The R2 object key the mint route hashes is the EXACT key FRT stored objects
 * under: photos/{projectId}/frt/{type}/{filename}. FRT already stores this on
 * the photo as ph.r2Key — use it directly. Fall back to parsing r2Url only if
 * r2Key is missing (older photos). */
// S(this) — convert the URL-form key the photo stores
//   photos/{slug}/{tool}/{type}/{fname}
// into the TRUE R2 bucket key the worker mints/resolves against
//   {slug}/photos/{tool}/{type}/{fname}
// (the worker's own urlPathToR2Key swaps `photos` and `{slug}`). Without this
// swap, mint hashes the wrong string and resolve's bucket.get() finds nothing
// → every contractor photo link returned "Not Found". Confirmed against the
// live worker source (KEY FORMAT MAPPING header).
function _toR2BucketKey(k){
  if(!k||typeof k!=='string')return '';
  var parts=k.split('/').filter(Boolean);
  if(parts.length<2)return k;
  if(parts[0]==='photos'){
    // photos/{slug}/{rest...} -> {slug}/photos/{rest...}
    return parts[1]+'/photos/'+parts.slice(2).join('/');
  }
  // already in {slug}/photos/... form (or unknown) — leave as-is
  return k;
}
function _betaKeyFromPhoto(ph){
  if(!ph)return '';
  if(ph.r2Key&&typeof ph.r2Key==='string')return _toR2BucketKey(ph.r2Key);
  var r2Url=ph.r2Url;
  if(!r2Url||typeof r2Url!=='string')return '';
  try{
    var m=r2Url.match(/^https?:\/\/[^/]+\/(.+)$/);
    var path=(m?m[1]:r2Url).split('?')[0].split('#')[0];
    var parts=path.split('/').filter(Boolean);
    if(parts.indexOf('photos')<0)return '';
    if(parts.length<4)return '';
    return _toR2BucketKey(path);
  }catch(e){return '';}
}

function _betaGetJWT(){
  try{
    var t=localStorage.getItem('sb-access-token');
    if(t)return t;
  }catch(e){}
  return '';
}

/* Mint links. The worker HMACs the exact R2 key string. FRT stores keys as
 * photos/{pid}/frt/{type}/{fname}. Some worker builds key on a transposed
 * {pid}/photos/frt/{type}/{fname} form. We can't see the worker source, so we
 * send BOTH candidate forms per photo and accept whichever the worker mints.
 * Returns map {anyKeyForm -> token}. Tolerates failure. */
// S(this): key form is now known exactly (_toR2BucketKey produces the true R2
// bucket key the worker mints/resolves). No more dual-form guessing — return
// the single correct key so we mint exactly one KV entry and look it up cleanly.
function _betaKeyVariants(k){
  return k?[k]:[];
}

// S(this) — B (KV-write reduction): tokens are deterministic (same R2 key ->
// same token forever), so cache them locally. Only keys we've never minted get
// sent to the worker; cached keys skip the network + the KV write entirely.
// This stops the re-export write storm at the source on this device. Paired
// with worker-side skip-if-exists (A) for full device-independent protection.
var _PDF_TOKEN_CACHE_KEY='arencon_pdf_link_tokens_v1';
function _loadTokenCache(){
  try{var s=localStorage.getItem(_PDF_TOKEN_CACHE_KEY);return s?JSON.parse(s):{};}catch(e){return {};}
}
function _saveTokenCache(c){
  try{localStorage.setItem(_PDF_TOKEN_CACHE_KEY,JSON.stringify(c));}catch(e){}
}
function _betaMintLinks(keys){
  if(!keys.length)return Promise.resolve({});
  // de-dupe incoming keys
  var uniq={};keys.forEach(function(k){if(k)uniq[k]=1;});
  var allKeys=Object.keys(uniq);
  var cache=_loadTokenCache();
  var out={};var toMint=[];
  allKeys.forEach(function(k){
    if(cache[k])out[k]=cache[k];      // already minted before — reuse, no network, no KV write
    else toMint.push(k);
  });
  if(!toMint.length)return Promise.resolve(out); // everything cached — zero requests
  var jwt=_betaGetJWT();
  if(!jwt){ // no auth: return what we have cached; flag only if nothing at all
    return Promise.resolve(Object.keys(out).length?out:{__noauth:true});
  }
  return fetch(BETA_WORKER+'/mintlinks',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+jwt},
    body:JSON.stringify({keys:toMint})
  }).then(function(r){if(!r.ok)throw new Error('mint HTTP '+r.status);return r.json();})
    .then(function(j){
      var fresh=(j&&j.links)||{};
      Object.keys(fresh).forEach(function(k){out[k]=fresh[k];cache[k]=fresh[k];});
      _saveTokenCache(cache);
      return out;
    })
    .catch(function(e){
      // network/mint failed: still return any cached tokens we have
      return Object.keys(out).length?out:{__err:String(e&&e.message||e)};
    });
}

/* Flatten the project into report rows the BETA renderer draws.
 * Mirrors the data the print path uses, kept intentionally simple for BETA. */
function _betaCollectRows(p){
  var rows=[];
  function pushDefics(ctrName,defics){
    (defics||[]).forEach(function(d){
      var status=(Model&&Model.getEffectiveStatus)?Model.getEffectiveStatus(d):(d.status||'open');
      var text=_deficDesc(d);
      var photos=[];
      // effective photos if available, else pooled
      if(Model&&Model.getEffectivePhotos&&d.observations&&d.observations.length){
        d.observations.forEach(function(o,oi){
          var ph=Model.getEffectivePhotos(d,oi)||[];
          ph.forEach(function(x){photos.push(x);});
        });
      }else{
        (d.photos||[]).forEach(function(x){photos.push(x);});
      }
      rows.push({
        ctr:ctrName||'',
        itemText:text,
        priority:(d.priority||'high'),
        status:status,
        isRec:!!d.isRecommendation,
        pinRef:(d.drawingName||'')+(d.pinLabel?(' · '+d.pinLabel):''),
        photos:photos
      });
    });
  }
  (p.contractors||[]).forEach(function(c){pushDefics(c.name||c.contractor||'Contractor',c.deficiencies);});
  pushDefics('General',p.generalDeficiencies);
  return rows;
}

/* Collect every photo, derive its R2 key, map token-lookup back by r2Url. */
function _betaCollectPhotoKeys(rows){
  var seen={};var keys=[];var keyByUrl={};
  rows.forEach(function(r){
    (r.photos||[]).forEach(function(ph){
      if(!ph||!ph.r2Url)return;
      if(seen[ph.r2Url])return;seen[ph.r2Url]=1;
      var k=_betaKeyFromPhoto(ph);
      if(k){keyByUrl[ph.r2Url]=k;keys.push(k);}
    });
  });
  return {keys:keys,keyByUrl:keyByUrl};
}

/* fetch image bytes for a photo, preferring full-res cached blob, then small, then dataUrl. */
async function _betaImgBytes(ph,r2Cache){
  var candidates=[];
  if(ph.r2Url&&r2Cache&&r2Cache[ph.r2Url])candidates.push(r2Cache[ph.r2Url]);
  if(ph.r2Url&&r2Cache&&r2Cache['small:'+ph.r2Url])candidates.push(r2Cache['small:'+ph.r2Url]);
  if(ph.dataUrl&&r2Cache&&r2Cache['small:'+ph.dataUrl])candidates.push(r2Cache['small:'+ph.dataUrl]);
  if(ph.dataUrl)candidates.push(ph.dataUrl);
  if(ph.r2Url)candidates.push(ph.r2Url);
  for(var i=0;i<candidates.length;i++){
    try{
      var bytes = await _betaFetchBytes(candidates[i]);
      // S351 never-bake: if the photo carries a rotation and/or vector markup
      // (new model — image bytes are CLEAN + unrotated), composite them now so
      // the PDF matches the on-screen lightbox. Old-model photos (already-baked
      // marked binaries with no rotation/_markupStrokes) skip this untouched.
      var rot = (typeof ph.rotation==='number') ? (((ph.rotation%360)+360)%360) : 0;
      var strokes = (ph._markupStrokes && ph._markupStrokes.length) ? ph._markupStrokes : null;
      if (bytes && (rot || strokes)){
        try { var comp = await _compositeRotatedMarked(bytes, rot, strokes, ph._mkFrame||null); if (comp) return comp; }
        catch(_){ /* fall through to raw bytes */ }
      }
      return bytes;
    }catch(e){}
  }
  return null;
}

// S351 never-bake compositor. Inputs: raw CLEAN image bytes, rotation
// (0/90/180/270), vector strokes (authored in fit-logical px), and the EXACT
// authoring frame {w,h} those strokes were drawn in (persisted as ph._mkFrame).
// Returns JPEG bytes of the photo drawn rotated with strokes painted on top in
// the same rotated frame. Render-time only — pixels are never persistently
// merged. Deterministic: the frame removes all scaling guesswork. Plain canvas
// (no OffscreenCanvas — iOS).
function _compositeRotatedMarked(bytes, rot, strokes, mkFrame){
  return new Promise(function(resolve){
    try{
      var ME = (typeof window!=='undefined') ? window.MarkupEngine : null;
      var blob = new Blob([bytes]);
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function(){
        try{
          var nw = img.naturalWidth, nh = img.naturalHeight;
          if(!nw||!nh){ URL.revokeObjectURL(url); resolve(null); return; }
          var sideways = (rot===90||rot===270);
          var ow = sideways ? nh : nw, oh = sideways ? nw : nh;   // output dims
          var cv = document.createElement('canvas'); cv.width=ow; cv.height=oh;
          var ctx = cv.getContext('2d');
          function applyRot(){
            if(rot===90){ ctx.translate(ow,0); ctx.rotate(Math.PI/2); }
            else if(rot===180){ ctx.translate(ow,oh); ctx.rotate(Math.PI); }
            else if(rot===270){ ctx.translate(0,oh); ctx.rotate(3*Math.PI/2); }
          }
          // 1) rotated photo, filling output
          ctx.save(); applyRot(); ctx.drawImage(img,0,0,nw,nh); ctx.restore();
          // 2) strokes on top, SAME rotated frame, scaled from their authoring
          //    frame (mkFrame) to the natural photo space. Deterministic: we know
          //    the exact frame the strokes were drawn in.
          if(strokes && strokes.length && ME && ME.renderStrokesToContext){
            var fw = (mkFrame && mkFrame.w) ? mkFrame.w : nw;
            var fh = (mkFrame && mkFrame.h) ? mkFrame.h : nh;
            var sx = nw / fw, sy = nh / fh;     // fit→natural (uniform; aspect matches)
            ctx.save();
            applyRot();
            ctx.scale(sx, sy);
            // renderStrokesToContext draws at raw fit-px coords; the context scale
            // maps them onto the nw×nh photo, which applyRot maps into output.
            try { ME.renderStrokesToContext(ctx, strokes, fw, fh); } catch(_){}
            ctx.restore();
          }
          URL.revokeObjectURL(url);
          var outUrl = cv.toDataURL('image/jpeg', 0.9);
          cv.width=0; cv.height=0;
          var b64 = outUrl.split(',')[1];
          var bin = atob(b64); var arr = new Uint8Array(bin.length);
          for(var k=0;k<bin.length;k++) arr[k]=bin.charCodeAt(k);
          resolve(arr);
        }catch(e){ try{URL.revokeObjectURL(url);}catch(_){}; resolve(null); }
      };
      img.onerror=function(){ try{URL.revokeObjectURL(url);}catch(_){}; resolve(null); };
      img.src=url;
    }catch(e){ resolve(null); }
  });
}

async function _betaRender(p,r2Cache,linkByUrl,mintStats){
  var PDFLib=window.PDFLib;
  var reg=_betaB64ToBytes(CARLITO_REG_B64);
  var bold=_betaB64ToBytes(CARLITO_BOLD_B64);
  var doc=await PDFLib.PDFDocument.create();
  doc.registerFontkit(window.fontkit);
  var fReg=await doc.embedFont(reg,{subset:true});
  var fBold=await doc.embedFont(bold,{subset:true});

  var W=612,H=792,MX=43,MT=50;
  var burg=PDFLib.rgb(0.612,0.153,0.259);
  var ink=PDFLib.rgb(0.11,0.14,0.20);
  var ink2=PDFLib.rgb(0.42,0.45,0.50);
  var hair=PDFLib.rgb(0.6,0.6,0.6);
  var cardBd=PDFLib.rgb(0.87,0.88,0.91);

  var page=doc.addPage([W,H]);
  var y=MT; // y measured from top edge
  function newPage(){ page=doc.addPage([W,H]); y=MT; }
  function ensure(h){ if(y+h>H-MT){ newPage(); } }
  function text(t,x,size,font,color){ page.drawText(t||'',{x:x,y:H-y-size,size:size,font:font||fReg,color:color||ink}); }
  function line(thick,color){ ensure(1); page.drawLine({start:{x:MX,y:H-y},end:{x:W-MX,y:H-y},thickness:thick,color:color}); }
  function wrap(t,x,size,font,color,maxW){
    t=(t||'').replace(/\s+/g,' ').trim();if(!t){return;}
    var f=font||fReg;var words=t.split(' ');var ln='';
    words.forEach(function(w){
      var trial=ln?ln+' '+w:w;
      if(f.widthOfTextAtSize(trial,size)>maxW&&ln){ ensure(size+3); text(ln,x,size,f,color); y+=size+3; ln=w; }
      else ln=trial;
    });
    if(ln){ ensure(size+3); text(ln,x,size,f,color); y+=size+3; }
  }

  // ---- Page-1 header ----
  text('ARENCON — Field Review Report',MX,18,fBold,burg); y+=24;
  text('LINKED-PHOTO PDF · BETA',MX,9,fBold,ink2); y+=14;
  line(1,hair); y+=14;
  var proj=p.projectName||p.name||p.projectNo||'(untitled project)';
  text('Project: '+proj,MX,11,fBold,ink); y+=18;
  if(p.client){text('Client: '+p.client,MX,11,fReg,ink2);y+=16;}
  if(p.address){text('Address: '+p.address,MX,11,fReg,ink2);y+=16;}
  y+=6;

  var rows=_betaCollectRows(p);
  var itemNo=0;

  for(var ri=0;ri<rows.length;ri++){
    var r=rows[ri];
    itemNo++;
    ensure(46);
    text(r.ctr||'—',MX,9,fBold,ink2); y+=14;
    var pill=r.isRec?'Recommendation':(r.status==='closed'?'Closed':'Outstanding');
    var pillColor=r.isRec?PDFLib.rgb(0.37,0.33,0.25):(r.status==='closed'?PDFLib.rgb(0.26,0.42,0.31):(r.priority==='low'?PDFLib.rgb(0.56,0.38,0.25):PDFLib.rgb(0.56,0.27,0.27)));
    text(String(itemNo),MX,11,fBold,burg);
    if(r.pinRef){text('· '+r.pinRef,MX+18,10,fReg,PDFLib.rgb(0.29,0.33,0.41));}
    var pillW=fBold.widthOfTextAtSize(pill,9.5);
    page.drawText(pill,{x:W-MX-pillW,y:H-y-11,size:9.5,font:fBold,color:pillColor});
    y+=18;
    wrap(r.itemText||'—',MX,11,fReg,ink,W-2*MX);
    y+=4;

    // ---- photo grid (3-up) drawn inline so page ref is always current ----
    var photos=(r.photos||[]).filter(function(ph){return ph&&(ph.r2Url||ph.dataUrl);});
    if(photos.length){
      var gap=6, cols=3, cellW=(W-2*MX-gap*(cols-1))/cols, cellH=cellW*0.75;
      var col=0, rowTop=y;
      for(var pi2=0;pi2<photos.length;pi2++){
        var ph=photos[pi2];
        if(col===0){ ensure(cellH+8); rowTop=y; }
        var x=MX+col*(cellW+gap);
        var cellYpdf=H-(rowTop+cellH);
        // border
        page.drawRectangle({x:x,y:cellYpdf,width:cellW,height:cellH,borderWidth:1,borderColor:cardBd});
        // image
        var bytes=await _betaImgBytes(ph,r2Cache);
        if(bytes){
          try{
            var img=(bytes[0]===0x89&&bytes[1]===0x50)?await doc.embedPng(bytes):await doc.embedJpg(bytes);
            // S401: preserve aspect ratio — fit (contain) inside the cell and centre,
            // instead of stretching to cellW×cellH (was distorting portrait/wide photos).
            var _iw=img.width, _ih=img.height;
            var _sc=Math.min(cellW/_iw, cellH/_ih);
            var _dw=_iw*_sc, _dh=_ih*_sc;
            var _dx=x+(cellW-_dw)/2, _dy=cellYpdf+(cellH-_dh)/2;
            page.drawImage(img,{x:_dx,y:_dy,width:_dw,height:_dh});
          }catch(e){}
        }
        // link annotation
        var tok=ph.r2Url?linkByUrl[ph.r2Url]:null;
        if(tok){
          var ctx=doc.context;
          var link=ctx.obj({Type:'Annot',Subtype:'Link',Rect:[x,cellYpdf,x+cellW,cellYpdf+cellH],Border:[0,0,0],
            A:ctx.obj({Type:'Action',S:'URI',URI:PDFLib.PDFString.of(BETA_WORKER+'/p/'+tok)})});
          var ref=ctx.register(link);
          var ex=page.node.Annots();
          if(ex){ex.push(ref);}else{page.node.set(PDFLib.PDFName.of('Annots'),ctx.obj([ref]));}
          mintStats.linked++;
        }
        col++;
        if(col>=cols){col=0;y=rowTop+cellH+gap;}
      }
      if(col!==0){y=rowTop+cellH+gap;}
      y+=4;
    }

    line(0.5,cardBd); y+=12;
  }

  return await doc.save();
}

export const initPDFExportBeta={
  generate(){
    var p=Model.getProject();if(!p){toast('No project loaded');return;}
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
    ov.innerHTML='<div style="background:#fff;border-radius:12px;padding:26px 34px;box-shadow:0 8px 32px rgba(0,0,0,.3);text-align:center;min-width:320px;"><div style="font-size:16px;font-weight:700;color:#1C2333;margin-bottom:10px;">Building linked-photo PDF (BETA)</div><div id="beta-lbl" style="font-size:13px;color:#4A5568;">Loading…</div></div>';
    document.body.appendChild(ov);
    var lbl=function(t){var e=document.getElementById('beta-lbl');if(e)e.textContent=t;};

    var mintStats={linked:0,total:0,minted:0};

    Promise.all([_betaLoadScript(BETA_PDFLIB_CDN),_betaLoadScript(BETA_FONTKIT_CDN)])
    .then(function(){ lbl('Fetching photos…'); return _prefetchR2PhotosForPDF(p,function(d,t){lbl('Fetching photos… '+d+'/'+t);}); })
    .then(function(r2Cache){
      lbl('Minting photo links…');
      var rows=_betaCollectRows(p);
      var pk=_betaCollectPhotoKeys(rows);
      mintStats.total=0;rows.forEach(function(r){(r.photos||[]).forEach(function(ph){if(ph&&ph.r2Url)mintStats.total++;});});
      return _betaMintLinks(pk.keys).then(function(tokenByKey){
        var diag='';
        if(tokenByKey.__noauth){diag=' (not signed in — no links)';tokenByKey={};}
        else if(tokenByKey.__err){diag=' (mint error: '+tokenByKey.__err+')';tokenByKey={};}
        var linkByUrl={};
        Object.keys(pk.keyByUrl).forEach(function(url){
          var k=pk.keyByUrl[url];
          // accept whichever key-variant the worker minted
          var variants=_betaKeyVariants(k);var tok=null;
          for(var i=0;i<variants.length;i++){if(tokenByKey[variants[i]]){tok=tokenByKey[variants[i]];break;}}
          if(tok){linkByUrl[url]=tok;mintStats.minted++;}
        });
        mintStats._diag=diag;
        lbl('Rendering…');
        return _betaRender(p,r2Cache,linkByUrl,mintStats);
      });
    })
    .then(function(bytes){
      try{ov.remove();}catch(e){}
      var blob=new Blob([bytes],{type:'application/pdf'});
      var url=URL.createObjectURL(blob);
      var name=((p.projectName||p.name||'ARENCON_Report').replace(/[^\w\-]+/g,'_'))+'_LINKED_BETA.pdf';
      var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
      toast('Linked PDF · '+mintStats.linked+'/'+mintStats.total+' photos linked'+(mintStats._diag||''));
    })
    .catch(function(e){
      try{ov.remove();}catch(e2){}
      console.error('[PDF BETA]',e);
      showAlert('BETA PDF failed','The linked-photo PDF could not be built: '+(e&&e.message||e)+'\n\nYour normal PDF export is unaffected.');
    });
  }
};
