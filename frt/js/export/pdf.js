/**
 * ARENCON FRT v2 — PDF Export
 * Ported from v1 _exportPDFWithCache — pixel-identical output.
 */

import { Model } from '../data/model.js';
import { IDB } from '../data/idb.js';
import { showAlert } from '../shared/dialogs.js';
import { toast } from '../shared/toast.js';
import { getContractorColor } from '../ui/deficiencies.js';

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _deficIsOpen(d){return d.status==='open'||d.status==='Outstanding';}
function _deficIsClosed(d){return d.status==='closed'||d.status==='Addressed & Closed';}
function _deficDesc(d){
  if(d.observations&&d.observations.length&&d.observations[0].text)return d.observations[0].text;
  if(d.entries&&d.entries.length&&d.entries[0].description)return d.entries[0].description;
  return d.description||'';
}

function _renderDrawingWithSinglePin(dwgDataUrl,pinData,callback){
  var img=new Image();
  img.onload=function(){
    // Crop region centered on pin — show ~25% of drawing around pin
    var cropFrac=0.25;
    var cropW=Math.max(img.width*cropFrac,400);var cropH=Math.max(img.height*cropFrac,300);
    var px=(pinData.pinX||0.5)*img.width;var py=(pinData.pinY||0.5)*img.height;
    cropW=Math.min(cropW,img.width);cropH=Math.min(cropH,img.height);
    var sx=Math.max(0,Math.min(px-cropW/2,img.width-cropW));
    var sy=Math.max(0,Math.min(py-cropH/2,img.height-cropH));
    var outW=Math.min(800,cropW);var outScale=outW/cropW;var outH=Math.round(cropH*outScale);
    var canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
    var ctx=canvas.getContext('2d');ctx.drawImage(img,sx,sy,cropW,cropH,0,0,outW,outH);
    var pinCX=(px-sx)*outScale;var pinCY=(py-sy)*outScale;
    // S113 Push 15: minimap pin bumped from outW*0.05 (40px on 800-wide
    // crop) → outW*0.07 (56px). Better visibility in the small thumbnail
    // displayed in deficiency cards. Floor stays at 28 for tiny crops.
    var pinW=Math.max(28,outW*0.07);
    _drawTeardropPin(ctx,pinCX,pinCY,pinW,pinData);
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
      _drawTeardropPin(ctx,px,py,pinW,d);
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
// Color logic also matches viewer.js _renderPins: iar→pink, low→orange,
// general→green, high (default)→red, closed→0.5 alpha overlay.
function _drawTeardropPin(ctx,anchorX,anchorY,pinW,d){
  var s=pinW/32;  // SVG width is 32; scale factor = pinW / 32
  // Anchor point in SVG is (16, 40). Map to (anchorX, anchorY).
  function P(svgX,svgY){return{x:anchorX+(svgX-16)*s,y:anchorY+(svgY-40)*s};}

  // Color resolution — match viewer
  var pr=d.priority||'high';
  var fill=d.iar?'#E91E8C':(pr==='general'?'#1A7A4A':(pr==='low'?'#E67E22':'#C0392B'));
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
  // S117-C: contractor section header keeps the brand burgundy bar but
  // gains a 5px left-border accent that matches the in-app group header
  // color for that contractor. Inline style supplies the per-contractor
  // hex; the rule below sets up box geometry + the default accent.
  c+='.ch{background:#9C2742;color:white;padding:6px 14px 6px 12px;font-weight:700;font-size:11pt;border-radius:6px 6px 0 0;margin-top:14px;margin-bottom:0;letter-spacing:.3px;border-left:5px solid #9C2742;}';
  c+='.dc{border:1px solid #DDE1E7;border-top:none;padding:10px;margin-bottom:0;background:white;}';
  c+='.dc:last-child{border-radius:0 0 6px 6px;margin-bottom:10px;}';
  c+='.dc-inner{display:flex;gap:12px;align-items:flex-start;}';
  c+='.dc-mini{flex-shrink:0;width:160px;max-height:160px;object-fit:contain;border-radius:6px;border:1px solid #DDE1E7;display:block;align-self:flex-start;}';
  c+='.dc-content{flex:1;min-width:0;}';
  c+='.iar{display:inline-block;background:#FF69B4;color:white;padding:1px 7px;border-radius:10px;font-size:9pt;font-weight:700;margin-left:4px;}';
  c+='.so{color:#C0392B;font-weight:700;font-size:11pt;}.sc{color:#1A7A4A;font-weight:700;font-size:11pt;}';
  c+='.dp{width:160px;height:160px;object-fit:cover;border-radius:4px;border:1px solid #DDE1E7;}';
  c+='.st{width:100%;border-collapse:collapse;font-size:11pt;margin-top:0;}';
  c+='.st th{background:#9C2742;color:white;padding:6px 10px;text-align:left;font-size:11pt;font-weight:700;}';
  c+='.st td{padding:6px 10px;border-bottom:1px solid #DDE1E7;font-size:11pt;}';
  c+='.sh{background:#9C2742;color:white;padding:7px 14px;font-weight:700;font-size:12pt;border-radius:6px 6px 0 0;margin-top:16px;margin-bottom:0;letter-spacing:.3px;}';
  c+='.sb{border:1px solid #DDE1E7;border-top:none;padding:12px;border-radius:0 0 6px 6px;margin-bottom:0;}';
  c+='.app-dwg{margin-bottom:28px;}';
  c+='.app-dwg-title{font-weight:700;font-size:12pt;color:#1C2333;margin-bottom:8px;padding:6px 10px;background:#F7F8FA;border-radius:4px;border-left:3px solid #9C2742;}';
  c+='.app-dwg img{max-width:100%;height:auto;display:block;border:1px solid #DDE1E7;border-radius:4px;}';
  c+='.app-pin-table{width:100%;border-collapse:collapse;font-size:11pt;margin-top:8px;}';
  c+='.app-pin-table th{background:#F7F8FA;padding:4px 8px;text-align:left;border-bottom:1px solid #DDE1E7;font-size:9pt;}';
  c+='.app-pin-table td{padding:4px 8px;border-bottom:1px solid #F0F0F0;}';
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

function _exportPDFWithCache(p,logo,isField,mode,r2Cache,ctrFilter,isFinalComm,showClosedSummary,fontB64){
var date=new Date().toLocaleDateString('en-CA',{year:'numeric',month:'long',day:'numeric'});
var reportDefs=[];var rn=1;
var _ctrFilterId=ctrFilter||'__all__';var _ctrFilterName='';
(p.contractors||[]).forEach(function(c){
  if(_ctrFilterId!=='__all__'&&_ctrFilterId!=='__general__'&&c.id!==_ctrFilterId)return;
  if(_ctrFilterId==='__general__')return;
  if(c.id===_ctrFilterId)_ctrFilterName=c.name;
  (c.deficiencies||[]).forEach(function(d){if(d.priority==='general')return;reportDefs.push({d:d,ctr:c.name,rn:rn++});});
});
if(_ctrFilterId==='__all__'||_ctrFilterId==='__general__'){
  (p.generalDeficiencies||[]).forEach(function(d){if(d.priority==='general')return;reportDefs.push({d:d,ctr:'Site General',rn:rn++});});
}
if(_ctrFilterId==='__general__')_ctrFilterName='Site General';

var _curInst=p.currentFrtInstance||1;
var mainBodyDefs=reportDefs.filter(function(r){
  if(_deficIsOpen(r.d))return true;
  if(_deficIsClosed(r.d)&&(r.d.closedOnInstance||1)===_curInst)return true;
  return false;
});
var closedSummaryDefs=reportDefs.filter(function(r){return _deficIsClosed(r.d);});
var css=_buildCSS(fontB64);
var _rptNum=p.currentFrtInstance||1;
var _rptRev=(p.info&&p.info.revision)||'A01';
var _ctrSubtitle='';
if(_ctrFilterId!=='__all__'&&_ctrFilterName)_ctrSubtitle=_ctrFilterName;

// Full header
var fullHeader='<div class="ph"><div><img src="'+logo+'" alt="ARENCON"></div>';
fullHeader+='<div class="ph-addr">1551 CATERPILLAR ROAD, SUITE 206<br>MISSISSAUGA, ON &nbsp;&nbsp; L4X 2Z6<br>CANADA<br><br>P: 905 615 1774<br>F: 905 615 9351<br>E: mail'+'@'+'arencon.com</div></div>';
var titleBlock='<div class="title-block"><div class="tb-line1">Fire Protection Engineering</div>';
titleBlock+='<div class="tb-line2">'+esc('Field Review Report')+' #'+_rptNum+'</div>';
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
var summaryHtml='';
if(reportDefs.length){
  var ctrG={};reportDefs.forEach(function(r){if(!ctrG[r.ctr])ctrG[r.ctr]=[];ctrG[r.ctr].push(r);});
  summaryHtml+='<div style="border:1px solid #DDE1E7;border-radius:6px;margin-top:16px;overflow:hidden;"><table class="st"><thead><tr><th>Deficiency Summary</th><th style="text-align:center;">Total</th><th style="text-align:center;">New This Report</th><th style="text-align:center;">IAR</th><th style="text-align:center;">Outstanding</th><th style="text-align:center;">Closed</th></tr></thead><tbody>';
  Object.keys(ctrG).forEach(function(ctr){
    var gc=ctrG[ctr];
    summaryHtml+='<tr><td><strong>'+esc(ctr)+'</strong></td><td style="text-align:center;">'+gc.length+'</td>';
    summaryHtml+='<td style="text-align:center;color:#1565C0;font-weight:700;">'+gc.filter(function(r){return(r.d.notedOnInstance||1)===_curInst;}).length+'</td>';
    summaryHtml+='<td style="text-align:center;color:#FF69B4;font-weight:700;">'+gc.filter(function(r){return r.d.iar;}).length+'</td>';
    summaryHtml+='<td style="text-align:center;color:#C0392B;font-weight:700;">'+gc.filter(function(r){return _deficIsOpen(r.d);}).length+'</td>';
    summaryHtml+='<td style="text-align:center;color:#1A7A4A;font-weight:700;">'+gc.filter(function(r){return _deficIsClosed(r.d);}).length+'</td></tr>';
  });
  summaryHtml+='<tr style="border-top:2px solid #9C2742;font-weight:700;"><td>Total</td><td style="text-align:center;">'+reportDefs.length+'</td>';
  summaryHtml+='<td style="text-align:center;color:#1565C0;">'+reportDefs.filter(function(r){return(r.d.notedOnInstance||1)===_curInst;}).length+'</td>';
  summaryHtml+='<td style="text-align:center;color:#FF69B4;">'+reportDefs.filter(function(r){return r.d.iar;}).length+'</td>';
  summaryHtml+='<td style="text-align:center;color:#C0392B;">'+reportDefs.filter(function(r){return _deficIsOpen(r.d);}).length+'</td>';
  summaryHtml+='<td style="text-align:center;color:#1A7A4A;">'+reportDefs.filter(function(r){return _deficIsClosed(r.d);}).length+'</td></tr>';
  summaryHtml+='</tbody></table></div>';
}

function _compactHeader(pgNum){
  var l1=esc((p.info&&p.info.client)||'');var l2=esc((p.info&&p.info.address)||'');
  var sp=(p.info&&p.info.projectName)?' - '+esc(p.info.projectName):'';
  var l3=esc('Field Review Report #'+_rptNum)+sp;
  var r1=esc(((p.info&&p.info.projectNumber)||'')+' '+_rptRev)+'&nbsp;&nbsp;Page '+pgNum;
  return '<div class="ph-compact"><div class="ph-compact-left">'+l1+'<br>'+l2+'<br>'+l3+'</div><div class="ph-compact-right">'+r1+'<br>&nbsp;<br>'+esc(date)+'</div></div>';
}

function _pdfActLine(a){
  var isCtr=(a.label||'').indexOf('Contractor')>=0;var lC=isCtr?'#E67E22':'#1565C0';
  var instTag=a.instance?' (FRT #'+a.instance+')':'';
  var txt=(a.text||'\u2014').replace(/<[^>]*>/g,'');
  var h='<div style="margin-bottom:3px;padding:3px 6px;background:'+(isCtr?'#FEF3E2':'#EBF4FF')+';border-radius:3px;font-size:9.5pt;">';
  h+='<span style="color:'+lC+';font-weight:600;">'+esc(a.label||'Note')+instTag+'</span> <span style="color:#888;font-size:9pt;">'+(a.date||'')+'</span>';
  h+='<div style="margin-top:1px;">'+esc(txt)+'</div>';
  if(a.photos&&a.photos.length){h+='<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px;">';a.photos.forEach(function(ph){h+='<img class="dp" src="'+_pdfPhotoSrc(ph,r2Cache)+'" style="max-height:60px;width:auto;">';});h+='</div>';}
  h+='</div>';return h;
}

function _buildDefCard(r){
  var d=r.d;var hasDwg=isField&&d.drawingId&&d.pinX!=null;var isClosed=_deficIsClosed(d);
  var _nI=d.notedOnInstance||1;var _nD=d.notedDate||d.date||'';
  var obs=d.observations&&d.observations.length?d.observations:null;
  var entries=d.entries&&d.entries.length?d.entries:null;
  var actArr=d.activity&&d.activity.length?d.activity:null;
  var sortedAct=actArr?actArr.slice().filter(function(a){return !a.autoGenerated;}).sort(function(a,b){return(b.date||'').localeCompare(a.date||'');}):[];

  var h='<div class="dc"><div class="dc-inner">';
  if(hasDwg)h+='<img class="dc-mini" id="mm-'+d.id+'" src="" alt="drawing">';
  h+='<div class="dc-content">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><div><strong style="color:#9C2742;font-size:13pt;">#'+d.num+'</strong>';
  if(d.iar)h+='<span class="iar">IAR</span>';
  h+='</div><span class="'+(isClosed?'sc':'so')+'">'+(isClosed?'Closed':'Outstanding')+'</span></div>';
  if(_nI!==_curInst){h+='<div class="dc-split" style="font-size:9.5pt;color:#4A5568;margin-bottom:4px;">Noted: FRT #'+_nI+(_nD?' \u2014 '+_nD:'')+(r.ctr?' \u2014 '+esc(r.ctr):'')+'</div>';}
  else{h+='<div class="dc-split" style="font-size:9.5pt;color:#4A5568;margin-bottom:4px;">'+(_nD||'')+(r.ctr?' \u2014 '+esc(r.ctr):'')+'</div>';}
  if(isClosed){var ci=d.closedOnInstance||_curInst;var cd=d.closedDate||'';var cn=d.closedNote||'Addressed';
    if(ci!==_curInst){h+='<div class="dc-split" style="font-size:9.5pt;color:#1A7A4A;margin-bottom:6px;font-weight:600;">Closed: FRT #'+ci+(cd?' \u2014 '+cd:'')+' \u2014 '+esc(cn)+'</div>';}
    else{h+='<div class="dc-split" style="font-size:9.5pt;color:#1A7A4A;margin-bottom:6px;font-weight:600;">Closed'+(cd?' \u2014 '+cd:'')+' \u2014 '+esc(cn)+'</div>';}}

  var obsIds=obs?obs.map(function(o){return o.id;}):[];
  var pdfObs=[];
  if(obs){obs.forEach(function(o,oi){
    var t=(entries&&entries[oi])?entries[oi].description||'':o.text||'';
    var ph=(entries&&entries[oi])?entries[oi].photos||[]:o.photos||[];
    pdfObs.push({text:t,photos:ph,addressed:o.addressed,notedOnInstance:o.notedOnInstance,oi:oi,id:o.id});
  });}else if(entries){entries.forEach(function(en,ei){pdfObs.push({text:en.description||'',photos:en.photos||[],addressed:false,notedOnInstance:_nI,oi:ei,id:null});});}
  var hasMulti=pdfObs.length>1;
  if(pdfObs.length){
    pdfObs.forEach(function(po){
      var eLbl=hasMulti?String.fromCharCode(65+po.oi)+') ':'';
      var frtTag=(po.notedOnInstance&&po.notedOnInstance!==_nI)?' (FRT #'+po.notedOnInstance+')':'';
      var obsActs=po.id?sortedAct.filter(function(a){return a.obsRef===po.id;}):[];
      if(po.addressed){
        h+='<div class="dc-split" style="margin-bottom:6px;padding:6px 8px;border:1px solid #1A7A4A;border-left:3px solid #1A7A4A;border-radius:0 4px 4px 0;background:rgba(26,122,74,.03);">';
        h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;"><span style="font-size:10pt;font-weight:700;color:#1A7A4A;">\u2611 '+eLbl+'Observation'+frtTag+'</span><span style="font-size:9pt;color:#1A7A4A;font-weight:600;">Addressed</span></div>';
        h+='<div style="font-size:11pt;color:#4A5568;margin-bottom:3px;">'+esc(po.text||'\u2014')+'</div>';
      }else{
        var bdr=isClosed?'#1A7A4A':'#9C2742';var bg=isClosed?'rgba(26,122,74,.03)':'transparent';
        h+='<div class="dc-split" style="margin-bottom:6px;padding:6px 8px;border:1px solid '+(isClosed?'#1A7A4A':'#DDE1E7')+';border-left:3px solid '+bdr+';border-radius:0 4px 4px 0;background:'+bg+';">';
        if(hasMulti)h+='<div style="font-size:10pt;font-weight:700;color:'+bdr+';margin-bottom:2px;">'+eLbl+'Observation'+frtTag+'</div>';
        h+='<div style="font-size:11pt;margin-bottom:4px;"><strong>Description:</strong> '+esc(po.text||'\u2014')+'</div>';
      }
      if(po.photos&&po.photos.length){h+='<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';po.photos.forEach(function(ph){h+='<img class="dp" src="'+_pdfPhotoSrc(ph,r2Cache)+'">';});h+='</div>';}
      if(obsActs.length){h+='<div style="margin-top:4px;padding-top:4px;border-top:1px dashed #DDE1E7;">';obsActs.forEach(function(a){h+=_pdfActLine(a);});h+='</div>';}
      h+='</div>';
    });
  }else{
    h+='<div class="dc-split" style="margin-bottom:6px;"><strong>Description:</strong> '+esc(d.description||'')+'</div>';
    if((d.photos||[]).length){h+='<div class="dc-split" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">';(d.photos||[]).forEach(function(ph){h+='<img class="dp" src="'+_pdfPhotoSrc(ph,r2Cache)+'">';});h+='</div>';}
  }
  if(hasDwg){var dObj=(p.drawings||[]).find(function(x){return x.id===d.drawingId;});if(dObj)h+='<div style="font-size:9pt;color:#607D8B;margin-bottom:4px;">\uD83D\uDCD0 '+esc(dObj.name)+'</div>';}
  var gActs=sortedAct.filter(function(a){return !a.obsRef||obsIds.indexOf(a.obsRef)<0;});
  if(gActs.length){h+='<div class="dc-split" style="margin-top:4px;padding-top:4px;border-top:1px solid #DDE1E7;"><div style="font-size:9pt;font-weight:700;color:#4A5568;margin-bottom:2px;">General Activity:</div>';gActs.forEach(function(a){h+=_pdfActLine(a);});h+='</div>';}
  h+='</div></div></div>';return h;
}

// Build content blocks
var ctrG2={};mainBodyDefs.forEach(function(r){if(!ctrG2[r.ctr])ctrG2[r.ctr]=[];ctrG2[r.ctr].push(r);});
var contentBlocks=[];
if(mainBodyDefs.length){Object.keys(ctrG2).forEach(function(ctr){
  // S117-C: tint the contractor section header's left-border accent with
  // the same color the in-app deficiencies tab uses for this contractor's
  // group header. Helper sourced from deficiencies.js — single source of
  // truth so on-screen and printed colors match exactly.
  var _ctrCol=getContractorColor(ctr);
  var _ctrAccent=_ctrCol&&_ctrCol.accent?_ctrCol.accent:'#9C2742';
  contentBlocks.push({type:'ctrHeader',html:'<div class="ch" style="border-left-color:'+_ctrAccent+';">'+esc(ctr)+'</div>',ctr:ctr});
  ctrG2[ctr].forEach(function(r){contentBlocks.push({type:'defCard',html:_buildDefCard(r),defId:r.d.id,ctr:ctr});});
});}

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
}catch(e){}

// Pagination
var PAGE_H=912;var measureZone=w.document.getElementById('measure-zone');var pagesContainer=w.document.getElementById('pages-container');
function _measure(html){measureZone.innerHTML=html;var h=measureZone.offsetHeight;measureZone.innerHTML='';return h;}
var FULL_HEADER_H=_measure(fullHeader+infoGrid+summaryHtml);
var COMPACT_HEADER_H=_measure(_compactHeader(2));
var pages=[];var curPageHtml='';var curUsed=0;var curPageNum=1;var isFirstPage=true;
function _startPage(){curPageHtml='';curUsed=0;if(isFirstPage){curPageHtml+=fullHeader+infoGrid+summaryHtml;curUsed+=FULL_HEADER_H;isFirstPage=false;}}
function _finalizePage(){if(curPageHtml.trim()){pages.push({html:curPageHtml,pageNum:curPageNum});curPageNum++;}}
_startPage();
var _aCtrHtml='';
contentBlocks.forEach(function(block){
  var blockH=_measure(block.html);var avail=PAGE_H-curUsed;
  if(block.type==='ctrHeader'){
    _aCtrHtml=block.html.replace('</div>','')+' \u2014 continued</div>';
    if(avail<blockH+200){_finalizePage();_startPage();}
    curPageHtml+=block.html;curUsed+=_measure(block.html);return;
  }
  if(blockH<=avail){curPageHtml+=block.html;curUsed+=blockH;}
  else if(blockH<=PAGE_H-COMPACT_HEADER_H){
    if(curUsed>PAGE_H*0.15){_finalizePage();_startPage();if(_aCtrHtml){curPageHtml+=_aCtrHtml;curUsed+=_measure(_aCtrHtml);}}
    curPageHtml+=block.html;curUsed+=blockH;
  }else{
    if(curUsed>PAGE_H*0.15){_finalizePage();_startPage();if(_aCtrHtml){curPageHtml+=_aCtrHtml;curUsed+=_measure(_aCtrHtml);}}
    var sp=block.html.split(/<div class="dc-split/);
    if(sp.length<=1){curPageHtml+=block.html;curUsed+=blockH;}
    else{
      var cH=sp[0];var cF='</div></div></div>';
      curPageHtml+=cH;curUsed+=_measure(cH+cF);
      for(var si=1;si<sp.length;si++){
        var sH='<div class="dc-split'+sp[si];var sHt=_measure(sH);
        if(curUsed+sHt>PAGE_H&&si>1){
          curPageHtml+='<div style="font-size:9px;color:#888;font-style:italic;text-align:right;margin-top:4px;">[continued on next page]</div>'+cF;
          _finalizePage();_startPage();if(_aCtrHtml){curPageHtml+=_aCtrHtml;curUsed+=_measure(_aCtrHtml);}
          curPageHtml+=cH+'<div style="font-size:9px;color:#888;font-style:italic;margin-bottom:4px;">[continued from previous page]</div>';
          curUsed+=_measure(cH+'<div style="font-size:9px;color:#888;font-style:italic;margin-bottom:4px;">[continued from previous page]</div>'+cF);
        }
        curPageHtml+=sH;curUsed+=sHt;
      }
      curPageHtml+=cF;
    }
  }
});
if(!isFinalComm&&mainBodyDefs.length){
  var nH='<div style="margin-top:16px;padding:10px 0 0;font-size:11pt;color:#333;">Note: Further deficiencies may be noted in future field reports following final commissioning.</div>';
  if(curUsed+_measure(nH)>PAGE_H){_finalizePage();_startPage();}
  curPageHtml+=nH;curUsed+=_measure(nH);
}
_finalizePage();

// Closed summary
if(showClosedSummary&&closedSummaryDefs.length){
  var csG={};closedSummaryDefs.forEach(function(r){var i=r.d.closedOnInstance||1;if(!csG[i])csG[i]=[];csG[i].push(r);});
  var csI=Object.keys(csG).map(Number).sort(function(a,b){return a-b;});
  var cH2='<div style="border:1px solid #DDE1E7;border-radius:6px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:10pt;">';
  cH2+='<thead><tr style="background:#9C2742;color:white;"><th colspan="5" style="padding:8px 12px;text-align:left;font-size:12pt;">Previously Closed Items</th></tr>';
  cH2+='<tr style="background:#4A5568;font-weight:700;font-size:9pt;text-transform:uppercase;letter-spacing:.5px;color:white;"><th style="padding:5px 10px;text-align:left;">Pin</th><th style="padding:5px 10px;text-align:left;">Description</th><th style="padding:5px 10px;text-align:left;">Contractor</th><th style="padding:5px 10px;text-align:left;">Noted</th><th style="padding:5px 10px;text-align:left;">Status</th></tr></thead><tbody>';
  csI.forEach(function(inst){
    var items=csG[inst];var cd2=items[0].d.closedDate||'';
    cH2+='<tr><td colspan="5" style="padding:6px 10px;background:#e8e0e3;font-weight:700;font-size:9.5pt;border-top:1.5px solid #DDE1E7;color:#9C2742;">Closed in FRT #'+inst+(cd2?' \u2014 '+cd2:'')+' ('+items.length+' item'+(items.length!==1?'s':'')+')</td></tr>';
    items.forEach(function(r,ri){
      var desc=_deficDesc(r.d);var td=desc.length>80?desc.substring(0,80)+'\u2026':desc;
      cH2+='<tr style="background:'+(ri%2===0?'#fff':'#fafafa')+';"><td style="padding:5px 10px;font-weight:700;color:#9C2742;">#'+r.d.num+'</td><td style="padding:5px 10px;">'+esc(td)+'</td><td style="padding:5px 10px;">'+esc(r.ctr)+'</td><td style="padding:5px 10px;">FRT #'+(r.d.notedOnInstance||1)+'</td><td style="padding:5px 10px;color:#1A7A4A;font-weight:600;">'+esc(r.d.closedNote||'Addressed')+'</td></tr>';
    });
  });
  cH2+='</tbody></table></div>';
  _startPage();curPageHtml+=cH2;curUsed+=_measure(cH2);_finalizePage();
}

// Appendix
if(isField&&p.drawings&&p.drawings.length){
  var dwP=p.drawings.filter(function(dw){return reportDefs.some(function(r){return r.d.drawingId===dw.id&&r.d.pinX!=null;});});
  if(dwP.length){dwP.forEach(function(dw){
    var dPins=reportDefs.filter(function(r){return r.d.drawingId===dw.id&&r.d.pinX!=null;});
    var aH='<div class="sh" style="margin-top:0;">Appendix \u2014 Drawings with Pins</div><div class="sb" style="padding:8px;"><div class="app-dwg">';
    aH+='<div class="app-dwg-title">'+esc(dw.name)+' \u2014 '+dPins.length+' pin'+(dPins.length>1?'s':'')+'</div>';
    aH+='<img class="app-dwg" id="app-dwg-'+dw.id+'" src="" alt="'+esc(dw.name)+'" style="max-width:100%;height:auto;display:block;border:1px solid #DDE1E7;border-radius:4px;">';
    aH+='<table class="app-pin-table"><thead><tr><th>Pin</th><th>Description</th><th>Status</th><th>Contractor</th></tr></thead><tbody>';
    dPins.forEach(function(r){var d=r.d;var sc=_deficIsOpen(d)?'#C0392B':'#1A7A4A';
      var iarTag=d.iar?'<div style="margin-top:3px;"><span class="iar" style="margin-left:0;">IAR</span></div>':'';
      aH+='<tr><td><strong style="color:#9C2742;">#'+d.num+'</strong>'+iarTag+'</td><td>'+esc(_deficDesc(d)||'\u2014')+'</td><td style="color:'+sc+';font-weight:700;">'+(_deficIsOpen(d)?'Outstanding':'Closed')+'</td><td>'+esc(r.ctr)+'</td></tr>';
    });
    aH+='</tbody></table></div></div>';
    pages.push({html:aH,pageNum:curPageNum,isAppendix:true});curPageNum++;
  });}
}

// Render pages
var totalPages=pages.length;var allH='';
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
          info.pins.forEach(function(r){try{var el=w.document.getElementById('mm-'+r.d.id);
            if(el){_renderDrawingWithSinglePin(info.dataUrl,r.d,function(su){try{el.src=su;}catch(x){}pd++;if(pd>=tp){qi++;setTimeout(next,50);}});}
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
        _exportPDFWithCache(p,logo,isField,type,r2Cache,opts.ctrFilter||'__all__',!!opts.isFinalComm,!!opts.showClosedSummary,fontB64);
      });
    }).catch(function(e){
      try{var ov=document.getElementById('pdf-prefetch-overlay');if(ov)ov.remove();}catch(e2){}
      console.warn('[PDF] Error:',e);
      _exportPDFWithCache(p,'',isField,type,{},opts.ctrFilter||'__all__',!!opts.isFinalComm,!!opts.showClosedSummary,'');
    });
  }
};
