/**
 * ARENCON FRT v2 — PDF Export
 * Ported from v1 _exportPDFWithCache — pixel-identical output.
 */

import { Model, isSiteRecordsName, SITE_RECORDS_LABEL } from '../data/model.js';
import { IDB } from '../data/idb.js';
import { showAlert } from '../shared/dialogs.js';
import { toast } from '../shared/toast.js';

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

function _renderDrawingWithSinglePin(dwgDataUrl,pinData,callback,isSiteRecord){
  var img=new Image();
  img.onload=function(){
    // S118 design lock: tighter crop (0.25→0.22) and bigger pin teardrop. Mark's
    // "20% smaller than the v11 mockup, still legible" target = ~24px display
    // size on the 160px-wide dc-mini box. Canvas-to-display ratio is 5×, so
    // canvas pinW≈120 hits the target (was Math.max(28, outW*0.07)=56).
    var cropFrac=0.22;
    var cropW=Math.max(img.width*cropFrac,400);var cropH=Math.max(img.height*cropFrac,300);
    var px=(pinData.pinX||0.5)*img.width;var py=(pinData.pinY||0.5)*img.height;
    cropW=Math.min(cropW,img.width);cropH=Math.min(cropH,img.height);
    var sx=Math.max(0,Math.min(px-cropW/2,img.width-cropW));
    var sy=Math.max(0,Math.min(py-cropH/2,img.height-cropH));
    var outW=Math.min(800,cropW);var outScale=outW/cropW;var outH=Math.round(cropH*outScale);
    var canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
    var ctx=canvas.getContext('2d');ctx.drawImage(img,sx,sy,cropW,cropH,0,0,outW,outH);
    var pinCX=(px-sx)*outScale;var pinCY=(py-sy)*outScale;
    // S118: bumped from outW*0.07 (56px on 800-wide crop, ~11px display) to
    // outW*0.15 (120px on 800-wide crop, ~24px display). Floor 60 for tiny crops.
    var pinW=Math.max(60,outW*0.15);
    _drawTeardropPin(ctx,pinCX,pinCY,pinW,pinData,isSiteRecord);
    callback(canvas.toDataURL('image/jpeg',0.92));
  };
  img.src=dwgDataUrl;
}

function _renderDrawingWithPins(dwgDataUrl,pins,callback){
  var img=new Image();
  img.onload=function(){
    var MAX_PX=5000000;var scale=Math.min(1,Math.sqrt(MAX_PX/(img.width*img.height)));
    var w=Math.round(img.width*scale);var h=Math.round(img.height*scale);
    var canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    var ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);
    var pinW=Math.max(28,w*0.028);
    pins.forEach(function(rr){
      var d=rr.d;if(d.pinX==null)return;
      var px=d.pinX*w;var py=d.pinY*h;
      // S154 PIN-COLOUR-OVERHAUL: derive isSiteRecord per-pin so a Site
      // Record entry on the full-drawing overview gets the indigo teardrop
      // just like its dedicated minimap does.
      var _isSr=isSiteRecordsName(rr.ctr);
      _drawTeardropPin(ctx,px,py,pinW,d,_isSr);
    });
    callback(canvas.toDataURL('image/jpeg',0.92));
  };
  img.src=dwgDataUrl;
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

  // Color resolution — Site Record > IAR > priority. Muted canon palette
  // matches viewer.js _renderPins exactly.
  var pr=d.priority||'high';
  var fill;
  if(isSiteRecord){
    fill='#6B6FA8'; // indigo — Site Records (S154)
  }else if(d.iar){
    fill='#E91E8C'; // pink — IAR (unchanged canon)
  }else{
    fill=(pr==='low'||pr==='general')?'#B07F5A':'#A85959'; // S217: 'general' retired → reads as low (amber); high stays maroon
  }
  var isClosed=_deficIsClosed(d);
  var alpha=isClosed?0.5:1;

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

  // Layer 2: colored fill (slightly inset, matches viewer's inner path)
  // Inner path uses (4,15)/(28,15) shoulders instead of (2,15)/(30,15)
  // and goes to (16,37) instead of (16,40). Approximation: re-fill at
  // 92% scale around the same anchor — visually identical at print sizes.
  ctx.beginPath();
  var sInner=s*0.93;
  function PI(svgX,svgY){return{x:anchorX+(svgX-16)*sInner,y:anchorY+(svgY-40)*sInner+s*1};}
  var ip0=PI(16,1);ctx.moveTo(ip0.x,ip0.y);
  var ic1a=PI(8.3,1),ic2a=PI(2,7.3),ie1=PI(2,15);
  ctx.bezierCurveTo(ic1a.x,ic1a.y,ic2a.x,ic2a.y,ie1.x,ie1.y);
  var ic1b=PI(2,25.5),ic2b=PI(16,40),ie2=PI(16,40);
  ctx.bezierCurveTo(ic1b.x,ic1b.y,ic2b.x,ic2b.y,ie2.x,ie2.y);
  var ic1c=PI(16,40),ic2c=PI(30,25.5),ie3=PI(30,15);
  ctx.bezierCurveTo(ic1c.x,ic1c.y,ic2c.x,ic2c.y,ie3.x,ie3.y);
  var ic1d=PI(30,7.3),ic2d=PI(23.7,1),ie4=PI(16,1);
  ctx.bezierCurveTo(ic1d.x,ic1d.y,ic2d.x,ic2d.y,ie4.x,ie4.y);
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
  if(!urls.length)return Promise.resolve({});
  var cache={};var done=0;var total=urls.length;
  if(progressCb)progressCb(0,total);
  return Promise.all(urls.map(function(url){
    return fetch(url).then(function(res){if(!res.ok)throw new Error(res.status);return res.blob();})
    .then(function(blob){cache[url]=URL.createObjectURL(blob);})
    .catch(function(){}).finally(function(){done++;if(progressCb)progressCb(done,total);});
  })).then(function(){return cache;});
}

function _pdfPhotoSrc(ph,r2Cache){
  if(!ph)return '';if(typeof ph==='string')return ph;
  if(ph.r2Url&&r2Cache&&r2Cache[ph.r2Url])return r2Cache[ph.r2Url];
  return ph.dataUrl||ph.r2Url||'';
}

function _buildCSS(fontB64){
  var c='*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}';
  c+='body{font-family:Calibri,sans-serif;color:#1C2333;font-size:11pt;line-height:1.23;background:#525659;margin:0;padding:20px;}';
  if(fontB64){c+='@font-face{font-family:"BlairMdITC TT";src:url(data:font/truetype;base64,'+fontB64+') format("truetype");font-weight:normal;font-style:normal;}';}
  var blairFam=fontB64?'"BlairMdITC TT","Times New Roman",serif':'Calibri,sans-serif';
  c+='.page{width:8.5in;min-height:11in;background:white;margin:0 auto 24px;padding:0.5in 0.6in;box-shadow:0 2px 12px rgba(0,0,0,.3);position:relative;overflow:hidden;}';
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
  // Replaces the removed S139 .th-band.sgr (the deleted "Site General ·
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
  c+='.dc-mini{flex-shrink:0;width:160px;max-height:160px;object-fit:contain;border-radius:6px;border:1px solid #DDE1E7;display:block;align-self:flex-start;}';
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
  // Legacy IAR badge + .so/.sc kept — used by summary tables / appendix / older code paths
  c+='.iar{display:inline-block;background:#FF69B4;color:white;padding:1px 7px;border-radius:10px;font-size:9pt;font-weight:700;margin-left:4px;}';
  c+='.so{color:#A85959;font-weight:700;font-size:11pt;}.sc{color:#5F8068;font-weight:700;font-size:11pt;}';
  // S118: 3-up photo grid (was 2-up flow with 160×160 tiles)
  c+='.dp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:6px 0;}';
  c+='.dp{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;border:1px solid #DDE1E7;display:block;}';
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
  c+='.app-pin-table th{background:#F7F8FA;padding:4px 8px;text-align:left;border-bottom:1px solid #DDE1E7;font-size:11pt;}';
  c+='.app-pin-table td{padding:4px 8px;border-bottom:1px solid #F0F0F0;font-size:11pt;}';
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
  c+='.pi-label{min-width:145px;font-weight:400;color:#1C2333;}.pi-value{font-weight:400;color:#1C2333;}';
  c+='@media print{body{background:white!important;padding:0!important;margin:0!important;}.page{width:auto!important;min-height:auto!important;margin:0!important;padding:0.5in 0.6in!important;box-shadow:none!important;page-break-after:always;}.page:last-child{page-break-after:auto;}#pdf-btn-bar{display:none!important;}#pdf-progress-wrap{display:none!important;}}';
  c+='@page{size:letter;margin:0;}';
  return c;
}

function _exportPDFWithCache(p,logo,isField,mode,r2Cache,ctrFilter,isFinalComm,showClosedSummary,fontB64,untaggedMode,includeRecs,recsMode,includeSiteRecords,recFooter,inspTag){
var date=new Date().toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'});
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
// reader can find #4-A as a Vipond card and #4-B as a Site General card,
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
  if(_ctrFilterId!=='__all__'&&_ctrFilterId!=='__general__'&&c.id!==_ctrFilterId)return;
  if(_ctrFilterId==='__general__')return;
  if(c.id===_ctrFilterId)_ctrFilterName=c.name;
  (c.deficiencies||[]).forEach(function(d){_pushItems(d,c.name);});
});
if(_ctrFilterId==='__all__'||_ctrFilterId==='__general__'){
  // S142 Batch 3-4 (Model 2 §4.1): a no-contractor general deficiency
  // that is NOT a recommendation is a Site Record — informational,
  // internal-only, EXCLUDED from external reports by default. It enters
  // the report only when the modal's "Include Site Records (internal)"
  // is on, OR the user explicitly filtered the export to Site General
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
// "Site General · Recommendations" band).
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
var fullHeader='<div class="ph"><div><img src="'+logo+'" alt="ARENCON"></div>';
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
var _pdfDP=[];
if(p.info&&p.info.client)_pdfDP.push(p.info.client);
if(_ctrSubtitle){if(_ctrSubtitle!==(p.info&&p.info.client))_pdfDP.push(_ctrSubtitle);}
else{(p.contractors||[]).forEach(function(c){if(c.name!==(p.info&&p.info.client))_pdfDP.push(c.name);});}
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
  // S317 (Mark): the "New This Report counts items… not additive" footnote rows
  // are removed from the client report (Mark marked them off — they read as clutter
  // under the table). The summary table speaks for itself.
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
    // separation). Hidden when nothing is new or when ALL items are new
    // (report #1 — a full circle says nothing). No arc under green, ever.
    function _innerA3(){
      var circ=2*Math.PI*29;
      if((nHI+nLO)<=0||N>=T)return '';
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
    function _wrap(rightInner){
      return '<div style="display:flex;gap:14px;margin-top:12px;align-items:stretch;">'
        +'<div style="flex:1.05;border:1px solid #DDE1E7;border-radius:6px;padding:7px 11px;display:flex;flex-direction:column;"><div style="font-size:9.5pt;font-weight:700;color:#2A3A5C;">Status Overview</div><div style="flex:1;display:flex;align-items:center;gap:12px;">'+_ctrLbl+'<div style="flex:1;">'+_legHtml+'</div></div></div>'
        +'<div style="flex:1.1;border:1px solid #DDE1E7;border-radius:6px;padding:7px 11px;display:flex;flex-direction:column;"><div style="font-size:9.5pt;font-weight:700;color:#2A3A5C;margin-bottom:4px;">Resolution Progress</div>'+rightInner+'</div></div>';
    }
    _dashHtmlFull=_wrap(_ovr+_bars);
    _dashHtmlCompact=_wrap(_ovr+'<div style="font-size:8.5pt;color:#90A0AC;margin-top:4px;">Per-contractor breakdown \u2014 see Deficiency Summary below</div>');
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
  // Activity: obs-tied for this obs, plus pin-level (no obsRef) on first-obs only
  var actArr=d.activity&&d.activity.length?d.activity.slice().filter(function(a){return !a.autoGenerated;}).sort(function(a,b){return(b.date||'').localeCompare(a.date||'');}):[];
  var fuActs;
  if(po.id){
    fuActs=actArr.filter(function(a){return a.obsRef===po.id;});
    if(r.obsIdx===0){fuActs=fuActs.concat(actArr.filter(function(a){return !a.obsRef;}));}
  }else{fuActs=actArr;}
  // Build card HTML
  var h='<div class="dc"><div class="dc-inner">';
  if(hasDwg)h+='<img class="dc-mini" id="mm-'+d.id+'-'+r.obsIdx+'" src="" alt="drawing">';
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
  h+='<div class="dc-desc">'+esc(po.text||'\u2014')+'</div>';
  if(po.photos&&po.photos.length){h+='<div class="dp-grid">';po.photos.forEach(function(ph){h+='<img class="dp" src="'+_pdfPhotoSrc(ph,r2Cache)+'">';});h+='</div>';}
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
  h+='</div></div></div>';
  return h;
}

// Build content blocks — S139 Phase 3: Trade → Contractor → cards.
// Mirrors the Detailed view's grouping (deficiencies.js _renderDetailedView):
// a pin's trade = its FIRST observation's trade (Option 1, S137). Trade
// order = declared projectTrades first, then any extras seen, then the
// "Other Trade Items" band (untagged), then "Site General · Recommendations"
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
var _realCtrNames={};(p.contractors||[]).forEach(function(c){if(c&&c.name)_realCtrNames[c.name]=true;});
function _isRealCtr(nm){return !!_realCtrNames[nm]&&!isSiteRecordsName(nm);}
var _ctrIdxByName={};(p.contractors||[]).forEach(function(c,i){if(c&&c.name&&_ctrIdxByName[c.name]==null)_ctrIdxByName[c.name]=i;});
function _newTrade(nm){return{name:nm,total:0,real:{},realOrder:[],noctr:[]};}
function _pushReal(T,cn,r){if(!T.real[cn]){T.real[cn]=[];T.realOrder.push(cn);}T.real[cn].push(r);T.total++;}
var contentBlocks=[];
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
    if(tks.length){
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
  // Full mode: Option C section-title card + Rec Summary lead the
  // forced-new-page section (summary connects directly under the card —
  // drop its standalone 16px top gap). 'only' mode: no lead block; the
  // Rec Summary + Legend ride page 1 via summaryHtml.
  if(_recsMode!=='only'){
    recBlocks.push({type:'recLead',html:_recSecTtlHtml+_recSummaryHtml});
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
  : (_dashHtmlFull+_legendHtml+_deficSummaryHtml+_hiRecNoteHtml);

// Open popup
var w=window.open('','_blank');
if(!w){showAlert('Popup blocked. Allow popups for this site.');return;}
var _pdfSN=Model.getSmartFilename();
var _pdfSB=_pdfSN.replace(/\s+[A-Z]\d{2}([A-Z]\d{2})?$/,'');
var _pdfCS=(_ctrFilterId!=='__all__'&&_ctrFilterName)?' - '+_ctrFilterName:'';
var _pdfTitle=_pdfSB+' FPE Field Rvw'+_pdfCS+' #'+_rptNum+' '+_rptRev;
var docHtml='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(_pdfTitle)+'</title><style>'+css+'</style></head><body>';
docHtml+='<div id="measure-zone" style="position:absolute;left:-9999px;top:0;width:7.3in;visibility:hidden;"></div><div id="pages-container"></div></body></html>';
w.document.write(docHtml);w.document.close();w.document.title=_pdfTitle;

// Export bar
try{
  var bar=w.document.createElement('div');bar.id='pdf-btn-bar';
  bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#2C4770;padding:10px 20px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.3);';
  var pb=w.document.createElement('button');pb.innerHTML='\uD83D\uDCC4 Export PDF';
  pb.style.cssText='padding:8px 24px;background:#1A7A4A;color:white;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;';
  pb.onclick=function(){w.print();};bar.appendChild(pb);
  var ht=w.document.createElement('span');ht.textContent='Click to save as PDF via your browser print dialog.';
  ht.style.cssText='color:rgba(255,255,255,.7);font-size:13px;font-family:Calibri,sans-serif;flex:1;';bar.appendChild(ht);
  var cb=w.document.createElement('button');cb.innerHTML='\u2715 Close';
  cb.style.cssText='padding:8px 20px;background:#455A64;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;font-family:Calibri,sans-serif;';
  cb.onclick=function(){w.close();};bar.appendChild(cb);
  w.document.body.insertBefore(bar,w.document.body.firstChild);w.document.body.style.paddingTop='56px';
  // S316 (Mark): keep the export bar a CONSTANT on-screen size even when the user
  // zooms into the drawing in the preview window. Browser zoom scales fixed
  // elements too, so we counter-scale the bar by the inverse of the page zoom
  // (visualViewport.scale) from the top-centre, and re-fit on every zoom/resize.
  try{
    var _fitBar=function(){
      var vv=w.visualViewport;
      var sc=(vv&&vv.scale)?vv.scale:1;
      var inv=sc>0?(1/sc):1;
      bar.style.transformOrigin='top center';
      bar.style.transform='scale('+inv+')';
      // width grows inversely so it still spans the viewport after counter-scale
      bar.style.width=(100*sc)+'%';
      bar.style.left='50%';
      bar.style.right='auto';
      bar.style.marginLeft=(-(50*sc))+'%';
    };
    if(w.visualViewport){
      w.visualViewport.addEventListener('resize',_fitBar);
      w.visualViewport.addEventListener('scroll',_fitBar);
    }
    w.addEventListener('resize',_fitBar);
    _fitBar();
  }catch(_ze){}
}catch(e){}

// Pagination
var PAGE_H=912;var measureZone=w.document.getElementById('measure-zone');var pagesContainer=w.document.getElementById('pages-container');
function _measure(html){measureZone.innerHTML=html;var h=measureZone.offsetHeight;measureZone.innerHTML='';return h;}
var FULL_HEADER_H=_measure(fullHeader+infoGrid+summaryHtml);
// S284 auto-compact cascade: if the dashboard page would overflow the page
// budget (many contractors), swap in the compact dashboard (overall bar only,
// per-contractor rows deferred to the table) and re-measure. Deterministic —
// measured, never guessed.
if(_recsMode!=='only'&&_dashHtmlFull&&FULL_HEADER_H>PAGE_H){
  summaryHtml=_dashHtmlCompact+_legendHtml+_deficSummaryHtml+_hiRecNoteHtml;
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
    if(_secH&&_secH<=_freshCap&&avail<_secH&&curUsed>PAGE_H*0.15){
      _finalizePage();_startPage();avail=PAGE_H-curUsed;
    }
    if(avail<blockH+200){_finalizePage();_startPage();}
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
      var cH=sp[0];var cF='</div></div></div>';
      curPageHtml+=cH;curUsed+=_measure(cH+cF);
      for(var si=1;si<sp.length;si++){
        var sH='<div class="dc-split'+sp[si];var sHt=_measure(sH);
        if(curUsed+sHt>PAGE_H&&si>1){
          curPageHtml+='<div style="font-size:9px;color:#888;font-style:italic;text-align:right;margin-top:4px;">[continued on next page]</div>'+cF;
          _finalizePage();_startPage();_restamp();
          curPageHtml+=cH+'<div style="font-size:9px;color:#888;font-style:italic;margin-bottom:4px;">[continued from previous page]</div>';
          curUsed+=_measure(cH+'<div style="font-size:9px;color:#888;font-style:italic;margin-bottom:4px;">[continued from previous page]</div>'+cF);
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
    if(t!=='ctrHeader'&&t!=='recHeader')continue;
    var nb=blocks[i+1];
    if(nb&&nb.type!=='tradeHeader'&&nb.type!=='ctrHeader'&&nb.type!=='recHeader'){
      blocks[i]._keepH=_measure(nb.html);
    }
  }
}
_stampKeepWithNext(contentBlocks);
contentBlocks.forEach(_flowBlock);
if(!isFinalComm&&mainBodyDefs.length&&_recsMode!=='only'){
  // S119 Push G: avoid orphaning the closing note onto a new page when the
  // previous page has just a bit of headroom. The note is one line of 11pt
  // text, so heavy top/bottom chrome (was margin-top:16px + padding:10px 0)
  // forced new-page splits whenever the previous page had <42px free.
  // Tighten to a minimal margin-top:6px (still visually separated from the
  // last card, but ~20px lighter). If even this compact form doesn't fit on
  // the current page, then spill — but that's rare now.
  var nH='<div style="margin-top:6px;font-size:11pt;color:#333;">Note: Further deficiencies may be noted in future field reports following final commissioning.</div>';
  if(curUsed+_measure(nH)>PAGE_H){_finalizePage();_startPage();}
  curPageHtml+=nH;curUsed+=_measure(nH);
}
_finalizePage();

// Closed summary
if(showClosedSummary&&closedSummaryDefs.length&&_recsMode!=='only'){
  var csG={};closedSummaryDefs.forEach(function(r){var i=r.d.closedOnInstance||1;if(!csG[i])csG[i]=[];csG[i].push(r);});
  var csI=Object.keys(csG).map(Number).sort(function(a,b){return a-b;});
  var cH2='<div style="border:1px solid #DDE1E7;border-radius:6px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:10pt;">';
  cH2+='<thead><tr style="background:#2A3A5C;color:white;"><th colspan="5" style="padding:8px 12px;text-align:left;font-size:12pt;">Previously Closed Items</th></tr>';
  cH2+='<tr style="background:#4A5568;font-weight:700;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:white;"><th style="padding:5px 10px;text-align:left;">Pin</th><th style="padding:5px 10px;text-align:left;">Description</th><th style="padding:5px 10px;text-align:left;">Contractor</th><th style="padding:5px 10px;text-align:left;">Noted</th><th style="padding:5px 10px;text-align:left;">Status</th></tr></thead><tbody>';
  csI.forEach(function(inst){
    var items=csG[inst];var cd2=items[0].d.closedDate||'';
    cH2+='<tr><td colspan="5" style="padding:6px 10px;background:#EEF2F4;font-weight:700;font-size:9.5pt;border-top:1.5px solid #DDE1E7;color:#4A5568;">Closed in FRT #'+inst+(cd2?' \u2014 '+cd2:'')+' ('+items.length+' item'+(items.length!==1?'s':'')+')</td></tr>';
    items.forEach(function(r,ri){
      // S119 hotfix: use per-obs text + per-obs contractor override (already
      // baked into r.ctr by _pushItems). Pre-S119 this used _deficDesc(r.d)
      // which returns obs[0].text — duplicating the same description across
      // every row of a multi-obs pin.
      var desc=_itemDesc(r);var td=desc.length>80?desc.substring(0,80)+'\u2026':desc;
      cH2+='<tr style="background:'+(ri%2===0?'#fff':'#fafafa')+';"><td style="padding:5px 10px;font-weight:700;color:#9C2742;">#'+(r.numLabel||r.d.num)+'</td><td style="padding:5px 10px;">'+esc(td)+'</td><td style="padding:5px 10px;">'+esc(r.ctr)+'</td><td style="padding:5px 10px;">FRT #'+(r.d.notedOnInstance||1)+'</td><td style="padding:5px 10px;color:#3F6E55;font-weight:700;">'+esc(r.d.closedNote||'Addressed')+'</td></tr>';
    });
  });
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

// Appendix — S317: split into lettered Appendix A (deficiency pins) and
// Appendix B (recommendation pins). Each appendix shows ONLY its own pin type
// (legal separation — rec pins never land on deficiency drawings). Lettering:
// A = deficiencies (always, when defic pins on drawings exist); B = recs (only
// when recs are included AND rec pins exist on drawings). Pin table gains a
// leading Item column reading r._itemNo (body-order item #). LOCKED S316 spec.
if(isField&&p.drawings&&p.drawings.length){
  // S317 prior-closed predicate (mirrors the rec section's _recPrevClosed and
  // the deficiency Previously-Closed split): an item closed in a PRIOR instance
  // leaves the active flow → it must NOT appear in its appendix (it lives in the
  // Previously Closed section instead). Closed THIS instance stays (shown Closed).
  function _appPrevClosed(r){return _deficIsClosed(r.d)&&((r.d.closedOnInstance||_curInst)<_curInst);}
  // Build the lettered list of appendices to emit, in order.
  var _appendixDefs=[];
  // Appendix A — deficiency drawings (non-rec pins). Suppressed in recs-only
  // mode (there are no deficiencies in the report, so no deficiency appendix).
  // Scope unchanged from pre-S317: ALL deficiency pins on the drawing show,
  // including prior-closed pins (which carry an em-dash Item #). The body's
  // "Previously Closed Items" table handles them in the narrative separately.
  if(_recsMode!=='only'){
    _appendixDefs.push({kind:'deficiency',
      pred:function(r){return !(r.d&&r.d.isRecommendation);}});
  }
  // Recommendation appendix — gated on recs-included + active rec pins exist.
  // Takes the NEXT free letter: 'A' when it's the only appendix (recs-only or
  // no deficiency drawings), 'B' when it follows the deficiency appendix.
  if(_recsMode!=='exclude'){
    var _hasRecPin=reportDefs.some(function(r){return r.d&&r.d.isRecommendation&&!_appPrevClosed(r)&&r.d.drawingId!=null&&r.d.pinX!=null;});
    if(_hasRecPin)_appendixDefs.push({kind:'recommendation',
      pred:function(r){return !!(r.d&&r.d.isRecommendation)&&!_appPrevClosed(r);}});
  }
  var _appLetters='ABCDEFGH';
  var _appIdx=0;
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
      // Appendix title band only on the FIRST drawing of the appendix; later
      // drawings stay under the same letter with an "(cont.)" band (S316 §5).
      var aH='';
      if(_firstDrawingOfAppendix){aH+='<div class="sh" style="margin-top:0;">'+esc(_appTitle)+'</div>';_firstDrawingOfAppendix=false;}
      else{aH+='<div class="sh" style="margin-top:0;color:#6B7B8C;font-size:11pt;">'+esc('Appendix '+_letter+' (cont.)')+'</div>';}
      aH+='<div class="sb" style="padding:8px;"><div class="app-dwg">';
      aH+='<div class="app-dwg-title">'+esc(dw.name)+' \u2014 '+dPins.length+' pin'+(dPins.length>1?'s':'')+'</div>';
      aH+='<img class="app-dwg" id="app-dwg-'+dw.id+'" src="" alt="'+esc(dw.name)+'" style="max-width:100%;height:auto;display:block;border:1px solid #DDE1E7;border-radius:4px;">';
      aH+='<table class="app-pin-table"><thead><tr><th>Item</th><th>Pin</th><th>Description</th><th>Status</th><th>Contractor</th></tr></thead><tbody>';
      dPins.forEach(function(r){var d=r.d;
        // S119 hotfix: per-obs status + description (r.ctr is already per-obs).
        var rowOpen=_itemIsOpen(r);
        var statusTxt,statusCol;
        // S317 correction: the recommendation appendix is two-state ONLY —
        // an OPEN rec is "Recommendation" (never "Outstanding"), a CLOSED-this-
        // instance rec is "Closed". Deficiency appendix keeps IAR/Outstanding/Closed.
        if(_isRecAppendix){
          if(rowOpen){statusTxt='Recommendation';statusCol='#5E5440';} // muted tan (rec family)
          else{statusTxt='Closed';statusCol='#5F8068';}                // muted sage
        }else if(d.iar){statusTxt='IAR';statusCol='#E91E8C';}
        else if(rowOpen){statusTxt='Outstanding';statusCol='#A85959';} // S154 muted maroon
        else{statusTxt='Closed';statusCol='#5F8068';}                  // S154 muted sage
        // S317: Item # is the body item number; rows with no body card (shouldn't
        // occur now that prior-closed are filtered out) show an em-dash, safe.
        var _itm=(r._itemNo!=null)?('<strong style="color:#9C2742;">'+r._itemNo+'</strong>'):'<span style="color:#B8BCC6;">\u2014</span>';
        aH+='<tr><td>'+_itm+'</td><td><strong style="color:#9C2742;">#'+(r.numLabel||d.num)+'</strong></td><td>'+esc(_itemDesc(r)||'\u2014')+'</td><td style="color:'+statusCol+';font-weight:700;">'+statusTxt+'</td><td>'+esc(r.ctr)+'</td></tr>';
      });
      aH+='</tbody></table></div></div>';
      // S317 correction: the recommendation appendix always starts its OWN page
      // (matches the Recommendations section living on its own page today). The
      // per-page model already forces a page break per appendix entry; the rec
      // appendix's first drawing therefore opens a fresh page after Appendix A.
      pages.push({html:aH,pageNum:curPageNum,isAppendix:true});curPageNum++;
    });
  });
}

// Render pages
var allH='';
pages.forEach(function(pg,idx){
  var pn=idx+1;allH+='<div class="page">';
  if(pn>1)allH+=_compactHeader(pn);
  allH+='<div class="page-content">'+pg.html+'</div></div>';
});
pagesContainer.innerHTML=allH;

// Drawing rendering
if(isField){
  var dwgMap={};
  reportDefs.forEach(function(r){var d=r.d;if(!d.drawingId||d.pinX==null)return;
    if(!dwgMap[d.drawingId]){var dObj=(p.drawings||[]).find(function(x){return x.id===d.drawingId;});
      if(dObj)dwgMap[d.drawingId]={dataUrl:dObj.dataUrl||null,r2Url:dObj.r2Url||null,pins:[]};}
    if(dwgMap[d.drawingId])dwgMap[d.drawingId].pins.push(r);
  });
  var dIds=Object.keys(dwgMap);
  if(dIds.length){
    var fp=[];
    dIds.forEach(function(id){var info=dwgMap[id];if(info.dataUrl)return;
      fp.push(IDB.get('drawingBlobs',id).then(function(rec){
        if(rec&&rec.dataBlob&&rec.dataBlob.size>0){return new Promise(function(res){var rd=new FileReader();rd.onload=function(){info.dataUrl=rd.result;res();};rd.onerror=function(){res();};rd.readAsDataURL(rec.dataBlob);});}
        else if(info.r2Url){return fetch(info.r2Url).then(function(r){return r.blob();}).then(function(b){return new Promise(function(res){var rd=new FileReader();rd.onload=function(){info.dataUrl=rd.result;res();};rd.onerror=function(){res();};rd.readAsDataURL(b);});});}
      }).catch(function(){}));
    });
    Promise.all(fp).then(function(){
      dIds=dIds.filter(function(id){return dwgMap[id].dataUrl;});if(!dIds.length)return;
      var qi=0;
      function next(){if(qi>=dIds.length)return;var id=dIds[qi];var info=dwgMap[id];
        _renderDrawingWithPins(info.dataUrl,info.pins,function(du){
          try{var ae=w.document.getElementById('app-dwg-'+id);if(ae)ae.src=du;}catch(x){}
          var pd=0;var tp=info.pins.length;if(!tp){qi++;setTimeout(next,50);return;}
          info.pins.forEach(function(r){try{var el=w.document.getElementById('mm-'+r.d.id+'-'+r.obsIdx);
            // S154 PIN-COLOUR-OVERHAUL: each card's individual minimap also gets per-pin isSiteRecord.
            var _isSr=isSiteRecordsName(r.ctr);
            if(el){_renderDrawingWithSinglePin(info.dataUrl,r.d,function(su){try{el.src=su;}catch(x){}pd++;if(pd>=tp){qi++;setTimeout(next,50);}},_isSr);}
            else{pd++;if(pd>=tp){qi++;setTimeout(next,50);}}}catch(x){pd++;if(pd>=tp){qi++;setTimeout(next,50);}}});
        });
      }
      setTimeout(next,200);
    });
  }
}
}

export const initPDFExport={
  generate(type,options){
    var p=Model.getProject();if(!p){toast('No project loaded');return;}
    var opts=options||{};var isField=(type==='field');
    var pfOv=document.createElement('div');pfOv.id='pdf-prefetch-overlay';
    pfOv.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';
    pfOv.innerHTML='<div style="background:white;border-radius:12px;padding:28px 36px;box-shadow:0 8px 32px rgba(0,0,0,.3);text-align:center;min-width:320px;"><div style="font-size:16px;font-weight:700;color:#1C2333;margin-bottom:12px;">Preparing PDF Export</div><div id="pf-label" style="font-size:13px;color:#4A5568;margin-bottom:10px;">Fetching photos... 0/0</div><div style="width:100%;height:8px;background:#EDF2F7;border-radius:4px;overflow:hidden;"><div id="pf-bar" style="width:0%;height:100%;background:#1A7A4A;border-radius:4px;transition:width .15s;"></div></div><div style="margin-top:12px;font-size:11px;color:#A0AEC0;">This may take a moment for large reports</div></div>';
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
        try{var ov=document.getElementById('pdf-prefetch-overlay');if(ov)ov.remove();}catch(e){}
        _exportPDFWithCache(p,logo,isField,type,r2Cache,opts.ctrFilter||'__all__',!!opts.isFinalComm,!!opts.showClosedSummary,fontB64,opts.untaggedMode,(opts.includeRecs!==false),opts.recsMode,opts.includeSiteRecords,opts.recFooter,opts.inspTag||'off');
      });
    }).catch(function(e){
      try{var ov=document.getElementById('pdf-prefetch-overlay');if(ov)ov.remove();}catch(e2){}
      console.warn('[PDF] Error:',e);
      _exportPDFWithCache(p,'',isField,type,{},opts.ctrFilter||'__all__',!!opts.isFinalComm,!!opts.showClosedSummary,'',opts.untaggedMode,(opts.includeRecs!==false),opts.recsMode,opts.includeSiteRecords,opts.recFooter,opts.inspTag||'off');
    });
  }
};
