// lib/ui/dieselHelpCards.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON Diesel Fire Pump Commissioning — TASK-style guide (S510, Mark).
// Diesel's OWN cards, handed to the shared Help engine (lib/ui/helpEngine.js).
//
// S510 REBUILD: the S505 set was 13 description-style cards with glyph art.
// Titles are now JOBS (verb + steps in order) and the drawings REPLICATE THE
// REAL SCREENS — the gold Actual Output chart, the NFPA verdict rows, a flow
// point with its gauge photo, the nameplate row, the Summary tab, the checklist
// Yes/No/N-A row, Closeout. Every card id, search-term string and date carried
// over VERBATIM (terms are the proven search vocabulary; dates drive What's New).
//
// NO REAL DATA (Mark, absolute): every value drawn is representative
// (1000 gpm / 125 psi / "Crestway Pump Co." etc.) — no real project, client or
// staff data anywhere.
//
// SVG TEXT DOES NOT WRAP OR TRUNCATE — every label is fitted to a width budget
// (fit()/t({max})). tools/check_help_art.py measures every painted label in a
// real browser and fails on overlap; run it after touching any drawing.
// ─────────────────────────────────────────────────────────────────────────────
import { registerHelp } from '/lib/ui/helpEngine.js';

/* ── drawing helpers ──────────────────────────────────────────────────── */
var INK='#1B1A22', INK2='#5E5B68', INK3='#928E9C', LINE='#E2DFE8', PAPER='#fff',
    PAGE='#EFEDF0', BURG='#9C2742', NAVY='#1B2438', GREEN='#2E9E72', AMBER='#D98A1E',
    RED='#C0445F', BLUE='#2C7FB8', SOFT='#F8FAFC', EDGE='#E2E8F0';
var TOOLC={frt:'#9C2742',dfp:'#E65100',efp:'#1565C0',ist:'#C62828',obc:'#2E7D32',dd:'#5E35B1'};

/* ── text metrics ──────────────────────────────────────────────────────────
   SVG text does not wrap and does not truncate. Without a width budget a long
   client or project name simply paints straight over whatever is to its right
   — which is exactly what went wrong the first time. Every string below is
   fitted to its lane before it is drawn. */
function tw(s,size,mono){
  var w=0;
  for(var i=0;i<s.length;i++){
    var ch=s[i], c=ch.charCodeAt(0);
    if(c>0x2000) w+=1.15;                        /* emoji / symbols */
    else if(mono) w+=0.55;
    else if('ilj.,\'’:; '.indexOf(ch)>=0) w+=0.28;
    else if('mwMW'.indexOf(ch)>=0) w+=0.82;
    else if(ch>='A'&&ch<='Z') w+=0.60;
    else w+=0.50;
  }
  return w*size;
}
function fit(s,size,maxw,mono){
  if(tw(s,size,mono)<=maxw) return s;
  var out=s;
  while(out.length>1 && tw(out+'…',size,mono)>maxw) out=out.slice(0,-1);
  return out.replace(/[ ,]+$/,'')+'…';
}
function t(x,y,s,o){o=o||{};var sz=o.s||7.5;
  if(o.max) s=fit(String(s),sz,o.max,o.mono);
  return '<text x="'+x+'" y="'+y+'" font-family="'+(o.mono?'Consolas,monospace':'Calibri')+
  '" font-size="'+sz+'" font-weight="'+(o.w||400)+'" fill="'+(o.f||INK2)+'"'+
  (o.a?' text-anchor="'+o.a+'"':'')+'>'+s+'</text>';}
function r(x,y,w,h,o){o=o||{};return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+(o.rx==null?3:o.rx)+
  '" fill="'+(o.f||PAPER)+'"'+(o.s?' stroke="'+o.s+'"':'')+(o.sw?' stroke-width="'+o.sw+'"':'')+
  (o.sd?' stroke-dasharray="'+o.sd+'"':'')+'/>';}
function pill(x,y,w,h,label,fill,txtf,o){o=o||{};return r(x,y,w,h,{rx:h/2,f:fill,s:o.s,sw:o.sw})+
  t(x+w/2,y+h*0.72,label,{s:o.s2||6.5,w:700,f:txtf,a:'middle',max:w-4});}
function avatar(cx,cy,who){return '<circle cx="'+cx+'" cy="'+cy+'" r="7.5" fill="'+who.col+'"/>'+
  t(cx,cy+2.6,who.ini,{s:6.5,w:700,f:'#fff',a:'middle'});}
function svg(w,h,inner){return '<svg viewBox="0 0 '+w+' '+h+'" xmlns="http://www.w3.org/2000/svg">'+
  r(0,0,w,h,{rx:0,f:PAGE})+inner+'</svg>';}

/* one Dashboard project row, drawn on FIXED LANES so nothing can collide.
   Two lines, which is exactly how the real list row lays out on a tablet:
   line 1  ☆ · number · name · manager
   line 2  client · tool pills · backup stamp                                */
var LANE={star:22,num:31,name:68,nameW:150,avCx:274,
          client:31,clientW:92,pills:134,stamp:256,stampW:72};
function boardRow(y,o){
  var h=(o.dup?42:34), s='', dx=(o.check?15:0);
  s+='<line x1="16" y1="'+(y+h)+'" x2="284" y2="'+(y+h)+'" stroke="'+LINE+'"/>';
  if(o.check) s+='<circle cx="21" cy="'+(y+15)+'" r="5.5" fill="'+GREEN+'"/>'
    + '<path d="M18.5,'+(y+15)+' l2,2 l3.5,-3.5" stroke="#fff" stroke-width="1.2" fill="none"/>';
  s+=t(LANE.star+dx,y+14,o.star?'★':'☆',{s:9,f:o.star?AMBER:INK3});
  s+=t(LANE.num+dx,y+14,o.num,{s:8,w:700,f:INK,mono:true});
  s+=t(LANE.name+dx,y+14,o.name,{s:8,w:700,f:INK,max:LANE.nameW-dx});
  if(o.who) s+=avatar(LANE.avCx,y+11,o.who);
  s+=t(LANE.client+dx,y+27,o.client,{s:6.5,f:INK2,max:LANE.clientW-dx});
  var px=LANE.pills;(o.tools||[]).forEach(function(k){s+=pill(px,y+19,15,9,k.toUpperCase(),TOOLC[k],'#fff',{s2:5});px+=17;});
  s+=t(LANE.stamp,y+27,o.stamp,{s:6.5,w:o.stampBold?700:400,f:o.stampF||INK3,a:'end',max:LANE.stampW});
  if(o.dup) s+=pill(LANE.num+dx,y+32,34,9,'Duplicate','#FBEDD3',AMBER,{s2:5.5,s:AMBER,sw:.5});
  return s;
}
function toolbar(y){
  return r(16,y,86,15,{rx:7,f:PAPER,s:EDGE})+t(23,y+10,'🔍 Search projects…',{s:6,f:INK3})
    + pill(106,y,44,15,'My Projects',NAVY,'#fff',{s2:6})
    + pill(152,y,40,15,'All',PAPER,INK2,{s2:6,s:EDGE})
    + pill(200,y,32,15,'📋 Active',NAVY,'#fff',{s2:5.5})
    + pill(234,y,30,15,'📦 Arch',PAPER,INK2,{s2:5.5,s:EDGE})
    + pill(266,y,18,15,'🗑',PAPER,INK3,{s2:6,s:EDGE});
}

/* ════════════════════════════════════════════════════════════════════════
   ART — drawings replicating the REAL Diesel commissioning screens (S510).
   Every value shown is representative only — no real project, client or
   staff data appears anywhere (Mark's absolute rule).
   ════════════════════════════════════════════════════════════════════════ */
var ART = {};

/* — chart frame reused by the curve drawings — */
function chartFrame(){
  return '<line x1="34" y1="20" x2="34" y2="152" stroke="#CBD5E1"/>'
    + '<line x1="34" y1="152" x2="284" y2="152" stroke="#CBD5E1"/>'
    + t(14,90,'psi',{s:7,f:INK3})
    + t(150,164,'Flow (USgpm)',{s:7,f:INK3,a:'middle'});
}

ART.golden = svg(300,190,
  r(0,0,300,190,{rx:0,f:PAPER})
  + chartFrame()
  + '<path d="M46,56 C110,62 180,84 274,118" fill="none" stroke="#6366F1" stroke-width="1.5"/>'
  + '<line x1="46" y1="76" x2="274" y2="76" stroke="#B05A7A" stroke-width="1.3" stroke-dasharray="5,3"/>'
  + t(206,72,'PRV @ 175 psi',{s:7,f:'#B05A7A',max:74})
  + '<path d="M46,76 L152,76 C202,86 240,102 274,118" fill="none" stroke="#D4A017" stroke-width="4"/>'
  + pill(44,24,64,13,'— Actual Output','#FBF3DC','#8A6A10',{s2:6,s:'#D4A017',sw:.6})
  + pill(112,24,52,13,'— Measured',PAPER,'#6366F1',{s2:6,s:'#6366F1',sw:.5})
  + pill(168,24,54,13,'⏻ PRV cap',PAPER,'#B05A7A',{s2:6,s:'#B05A7A',sw:.5})
  + t(40,182,'Gold = what the system actually delivers.',{s:7,f:INK2,max:250})
);

ART.caps = svg(300,190,
  r(0,0,300,190,{rx:0,f:PAPER})
  + chartFrame()
  + '<path d="M46,52 C110,58 180,82 274,116" fill="none" stroke="#6366F1" stroke-width="1.5"/>'
  + '<line x1="46" y1="70" x2="274" y2="70" stroke="#B05A7A" stroke-width="1.3" stroke-dasharray="5,3"/>'
  + t(200,66,'PRV @ 175 psi',{s:7,f:'#B05A7A',max:80})
  + '<line x1="46" y1="94" x2="274" y2="94" stroke="#7A5AB0" stroke-width="1.3" stroke-dasharray="5,3"/>'
  + t(196,90,'PRDV @ 150 psi',{s:7,f:'#7A5AB0',max:84})
  + pill(44,24,54,13,'⏻ PRV cap','#F7E9EF','#B05A7A',{s2:6,s:'#B05A7A',sw:.6})
  + pill(102,24,58,13,'⏻ PRDV cap',PAPER,'#7A5AB0',{s2:6,s:'#7A5AB0',sw:.5})
  + t(40,180,'Legend pills switch each cap on and off.',{s:7,f:INK2,max:250})
);

ART.margin = svg(300,190,
  r(0,0,300,190,{rx:0,f:PAPER})
  + chartFrame()
  + '<path d="M46,70 L156,70 C206,80 244,98 274,114" fill="none" stroke="#D4A017" stroke-width="3.5"/>'
  + '<line x1="150" y1="152" x2="150" y2="60" stroke="#CBD5E1" stroke-dasharray="3,3"/>'
  + '<circle cx="150" cy="70" r="4" fill="#D4A017"/>'
  + '<circle cx="150" cy="120" r="4" fill="'+BLUE+'"/>'
  + t(158,124,'demand',{s:6.5,f:BLUE})
  + '<path d="M150,114 v-38 m-3,5 l3,-5 l3,5" stroke="'+GREEN+'" stroke-width="1.6" fill="none"/>'
  + pill(168,84,86,16,'ADEQUATE · +23 psi','#DCF1E8',GREEN,{s2:6.5,s:GREEN,sw:.7})
  + t(40,180,'Green ADEQUATE · amber TIGHT · red DEFICIT.',{s:7,f:INK2,max:250})
);

ART.gates = svg(300,190,
  t(16,20,'NFPA 20 ACCEPTANCE',{s:6.5,w:700,f:INK3})
  + r(16,26,268,30,{rx:6,f:PAPER,s:EDGE}) + r(16,26,3.5,30,{rx:2,f:GREEN})
  + t(28,40,'Churn · 121% of rated',{s:7.5,f:INK,max:150}) + t(28,50,'needs ≤ 140%',{s:6.5,f:INK3,max:150})
  + pill(228,34,46,15,'PASS','#DCF1E8',GREEN,{s2:7})
  + r(16,60,268,30,{rx:6,f:PAPER,s:EDGE}) + r(16,60,3.5,30,{rx:2,f:GREEN})
  + t(28,74,'Rated · 103% net',{s:7.5,f:INK,max:150}) + t(28,84,'needs ≥ 100%',{s:6.5,f:INK3,max:150})
  + pill(228,68,46,15,'PASS','#DCF1E8',GREEN,{s2:7})
  + r(16,94,268,30,{rx:6,f:PAPER,s:EDGE}) + r(16,94,3.5,30,{rx:2,f:RED})
  + t(28,108,'150% · 61% of rated net',{s:7.5,f:INK,max:150}) + t(28,118,'needs ≥ 65% — short by 4%',{s:6.5,f:RED,max:150})
  + pill(228,102,46,15,'FAIL','#FBE3E9',RED,{s2:7})
  + t(16,146,'Each point is scored against the NFPA 20 gates.',{s:7,f:INK2,max:262})
  + t(16,160,'A miss turns red and names the threshold it needed.',{s:7,f:INK2,max:262})
  + t(16,174,'A manual override always leaves the final say with you.',{s:7,f:INK2,max:262})
);

ART.gauge = svg(300,190,
  t(16,18,'FLOW POINT · RATED (100%)',{s:6.5,w:700,f:INK3})
  + r(16,24,268,54,{rx:6,f:PAPER,s:EDGE})
  + t(28,42,'Discharge',{s:6.5,f:INK3}) + r(28,48,60,16,{rx:4,f:SOFT,s:EDGE}) + t(34,60,'142 psi',{s:8,f:INK,mono:true})
  + t(108,42,'Suction',{s:6.5,f:INK3}) + r(108,48,60,16,{rx:4,f:SOFT,s:EDGE}) + t(114,60,'38 psi',{s:8,f:INK,mono:true})
  + t(188,42,'RPM',{s:6.5,f:INK3}) + r(188,48,54,16,{rx:4,f:SOFT,s:EDGE}) + t(194,60,'2960',{s:8,f:INK,mono:true})
  + pill(248,48,28,16,'📷',PAPER,INK2,{s2:8,s:BLUE,sw:.7})
  + r(16,90,80,58,{rx:5,f:SOFT,s:EDGE})
  + '<circle cx="56" cy="114" r="16" fill="none" stroke="'+INK2+'" stroke-width="1.6"/>'
  + '<line x1="56" y1="114" x2="66" y2="104" stroke="'+RED+'" stroke-width="1.6"/>'
  + t(56,142,'142 psi gauge',{s:6,f:INK3,a:'middle',max:74})
  + t(106,104,'Pick the reading first, then shoot —',{s:7,f:INK2,max:178})
  + t(106,118,'the photo ties to that exact value.',{s:7,f:INK2,max:178})
  + t(106,136,'7-point keeps w/PLD and w/o-PLD',{s:7,f:INK2,max:178})
  + t(106,150,'shots separate.',{s:7,f:INK2,max:178})
  + t(16,172,'Every number on the chart can show the gauge behind it.',{s:6.5,f:INK3,max:262})
);

ART.tests = svg(300,190,
  pill(16,14,64,16,'3-Point',NAVY,'#fff',{s2:7})
  + pill(84,14,64,16,'7-Point',PAPER,INK2,{s2:7,s:EDGE})
  + t(16,48,'3-POINT — the straight run',{s:6.5,w:700,f:INK3})
  + r(16,54,268,14,{rx:4,f:SOFT,s:EDGE}) + t(24,64,'Churn 0%',{s:7,f:INK2}) + t(270,64,'✓',{s:8,f:GREEN,a:'end'})
  + r(16,70,268,14,{rx:4,f:SOFT,s:EDGE}) + t(24,80,'Rated 100%',{s:7,f:INK2}) + t(270,80,'✓',{s:8,f:GREEN,a:'end'})
  + r(16,86,268,14,{rx:4,f:SOFT,s:EDGE}) + t(24,96,'Overload 150%',{s:7,f:INK2}) + t(270,96,'✓',{s:8,f:GREEN,a:'end'})
  + t(16,118,'7-POINT — adds the in-betweens + PLD',{s:6.5,w:700,f:INK3})
  + r(16,124,268,14,{rx:4,f:SOFT,s:EDGE}) + t(24,134,'25 · 50 · 75 · 125% rows',{s:7,f:INK2,max:180}) + t(270,134,'chart only',{s:6,f:INK3,a:'end'})
  + r(16,140,268,14,{rx:4,f:SOFT,s:EDGE}) + t(24,150,'0 · 100 · 150%',{s:7,f:INK2,max:180}) + t(270,150,'NFPA scored',{s:6,f:GREEN,a:'end'})
  + t(16,172,'One Performance Test tab holds both — the toggle switches.',{s:6.5,f:INK2,max:262})
);

ART.nameplate = svg(300,190,
  t(16,18,'NAMEPLATE — drives the chart and the pass/fail math',{s:6.5,w:700,f:INK3,max:262})
  + r(16,24,268,44,{rx:6,f:PAPER,s:EDGE})
  + t(26,38,'Rated flow',{s:5.5,f:INK3}) + r(26,42,54,14,{rx:4,f:SOFT,s:EDGE}) + t(31,53,'1000 gpm',{s:7,f:INK,mono:true})
  + t(90,38,'Rated pressure',{s:5.5,f:INK3}) + r(90,42,50,14,{rx:4,f:SOFT,s:EDGE}) + t(95,53,'125 psi',{s:7,f:INK,mono:true})
  + t(150,38,'Speed',{s:5.5,f:INK3}) + r(150,42,44,14,{rx:4,f:SOFT,s:EDGE}) + t(155,53,'2960',{s:7,f:INK,mono:true})
  + t(204,38,'PRV set',{s:5.5,f:INK3}) + r(204,42,44,14,{rx:4,f:SOFT,s:EDGE}) + t(209,53,'175',{s:7,f:INK,mono:true})
  + t(16,86,'NAMEPLATE DETAILS · filled by the placard scan, editable',{s:6,w:700,f:INK3,max:262})
  + r(16,92,268,40,{rx:6,f:PAPER,s:EDGE})
  + t(26,106,'Manufacturer',{s:5.5,f:INK3}) + r(26,110,110,14,{rx:4,f:SOFT,s:EDGE}) + t(31,121,'Crestway Pump Co.',{s:7,f:INK,max:100})
  + t(150,106,'Model No.',{s:5.5,f:INK3}) + r(150,110,120,14,{rx:4,f:SOFT,s:EDGE}) + t(155,121,'CW-8x6x14F',{s:7,f:INK,mono:true,max:110})
  + t(16,152,'Get these right first — every verdict is measured',{s:7,f:INK2,max:262})
  + t(16,166,'against them. NPSH is kept separately for the',{s:7,f:INK2,max:262})
  + t(16,180,'3-point and 7-point tests.',{s:7,f:INK2,max:262})
);

ART.placard = svg(300,190,
  r(16,14,120,86,{rx:6,f:'#3E4650'})
  + r(24,22,104,70,{rx:3,f:'#4A525C',s:'#5A626C'})
  + t(76,36,'FIRE PUMP',{s:7,w:700,f:'#E8E8E8',a:'middle'})
  + t(30,50,'GPM',{s:5.5,f:'#B8BEC6'}) + t(122,50,'1000',{s:6.5,f:'#fff',a:'end',mono:true})
  + t(30,62,'PSI',{s:5.5,f:'#B8BEC6'}) + t(122,62,'125',{s:6.5,f:'#fff',a:'end',mono:true})
  + t(30,74,'RPM',{s:5.5,f:'#B8BEC6'}) + t(122,74,'2960',{s:6.5,f:'#fff',a:'end',mono:true})
  + t(30,86,'MODEL',{s:5.5,f:'#B8BEC6'}) + t(122,86,'CW-8x6x14F',{s:6,f:'#fff',a:'end',mono:true})
  + '<path d="M148,54 h20 m-6,-6 l6,6 l-6,6" stroke="'+INK3+'" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
  + r(180,20,104,76,{rx:6,f:PAPER,s:EDGE})
  + t(190,34,'Manufacturer',{s:5.5,f:INK3}) + r(190,38,86,12,{rx:3,f:'#FBF3DC',s:'#D4A017',sw:.5}) + t(194,47,'Crestway Pump Co.',{s:6,f:INK,max:78})
  + t(190,60,'Model No.',{s:5.5,f:INK3}) + r(190,64,86,12,{rx:3,f:'#FBF3DC',s:'#D4A017',sw:.5}) + t(194,73,'CW-8x6x14F',{s:6,f:INK,mono:true,max:78})
  + t(190,86,'…filled for you, still editable',{s:5.5,f:INK3,max:88})
  + t(16,124,'Photograph the pump placard and the nameplate',{s:7,f:INK2,max:262})
  + t(16,138,'fields fill themselves from the photo.',{s:7,f:INK2,max:262})
  + t(16,154,'Everything stays editable — check the values',{s:7,f:INK2,max:262})
  + t(16,168,'against the plate; you are the verifier, not the scan.',{s:7,f:INK2,max:262})
);

ART.summary = svg(300,190,
  pill(16,12,54,15,'Summary',NAVY,'#fff',{s2:6.5})
  + pill(74,12,72,15,'Performance Test',PAPER,INK2,{s2:6,s:EDGE})
  + pill(150,12,50,15,'Checklists',PAPER,INK2,{s2:6,s:EDGE})
  + pill(204,12,48,15,'Closeout',PAPER,INK2,{s2:6,s:EDGE})
  + r(16,36,268,22,{rx:5,f:PAPER,s:EDGE}) + t(26,50,'Checklists',{s:7.5,f:INK})
    + r(150,44,100,7,{rx:3,f:'#EFEFF3'}) + r(150,44,82,7,{rx:3,f:GREEN}) + t(272,51,'82%',{s:7,w:700,f:INK,a:'end'})
  + r(16,62,268,22,{rx:5,f:PAPER,s:EDGE}) + t(26,76,'Flow tests',{s:7.5,f:INK})
    + r(150,70,100,7,{rx:3,f:'#EFEFF3'}) + r(150,70,100,7,{rx:3,f:GREEN}) + t(272,77,'100%',{s:7,w:700,f:INK,a:'end'})
  + r(16,88,268,22,{rx:5,f:PAPER,s:EDGE}) + t(26,102,'Signature',{s:7.5,f:INK})
    + r(150,96,100,7,{rx:3,f:'#EFEFF3'}) + t(272,103,'0%',{s:7,w:700,f:AMBER,a:'end'})
  + r(16,118,268,26,{rx:5,f:'#FDF0F3',s:RED,sw:.6}) + r(16,118,3.5,26,{rx:2,f:RED})
  + t(28,134,'⚑ 2 deficiencies open',{s:7.5,w:700,f:RED,max:200})
  + t(16,162,'Opens on Summary every time. Tap any row to jump',{s:7,f:INK2,max:262})
  + t(16,176,'to that section. Deficiencies never lower the %.',{s:7,f:INK2,max:262})
);

ART.save = svg(300,190,
  r(16,14,268,26,{rx:6,f:NAVY})
  + pill(24,19,44,16,'← Back','rgba(255,255,255,.12)','#fff',{s2:6.5})
  + t(120,31,'Diesel Fire Pump',{s:8,w:700,f:'#fff',max:100})
  + '<circle cx="238" cy="27" r="4" fill="'+GREEN+'"/>' + t(248,31,'Saved',{s:6.5,f:'#cfe9dd'})
  + t(16,66,'There is no save button to remember.',{s:8.5,w:700,f:INK,max:262})
  + t(16,82,'Every change is written as you make it.',{s:7,f:INK2,max:262})
  + r(16,96,268,40,{rx:6,f:SOFT,s:EDGE})
  + t(28,112,'Tapping ← Back or the logo does a full save',{s:7,f:INK2,max:244})
  + t(28,126,'first, then leaves — no prompt, nothing lost.',{s:7,f:INK2,max:244})
  + t(16,158,'The cloud dot near the top flashes “Saving…”',{s:7,f:INK2,max:262})
  + t(16,172,'whenever it syncs.',{s:7,f:INK2,max:262})
);

ART.checklist = svg(300,190,
  t(16,18,'CHECKLIST ITEM',{s:6.5,w:700,f:INK3})
  + r(16,24,268,54,{rx:6,f:PAPER,s:EDGE})
  + t(28,40,'1.4  Suction and discharge gauges installed',{s:7.5,f:INK,max:244})
  + pill(28,48,40,16,'Yes','#DCF1E8',GREEN,{s2:7,s:GREEN,sw:.7})
  + pill(72,48,40,16,'No',PAPER,INK2,{s2:7,s:EDGE})
  + pill(116,48,40,16,'N/A',PAPER,INK2,{s2:7,s:EDGE})
  + pill(200,48,72,16,'📷 Add photo',PAPER,'#2C4770',{s2:6,s:'#2C4770',sw:.6})
  + r(16,88,268,54,{rx:6,f:PAPER,s:EDGE})
  + t(28,104,'1.5  Relief valve discharges to drain',{s:7.5,f:INK,max:244})
  + pill(28,112,40,16,'Yes',PAPER,INK2,{s2:7,s:EDGE})
  + pill(72,112,40,16,'No','#FBE3E9',RED,{s2:7,s:RED,sw:.7})
  + pill(116,112,40,16,'N/A',PAPER,INK2,{s2:7,s:EDGE})
  + pill(200,112,72,16,'⚑ Deficiency','#FBE3E9',RED,{s2:6,s:RED,sw:.6})
  + t(16,162,'Selected = full colour; unselected stays flat grey.',{s:7,f:INK2,max:262})
  + t(16,176,'A No can flag a deficiency with photos attached.',{s:7,f:INK2,max:262})
);

ART.photos = svg(300,190,
  r(16,14,268,64,{rx:6,f:PAPER,s:'#2C7FB8',sd:'5,3'})
  + t(150,40,'Drop photos here',{s:8,f:'#2C7FB8',a:'middle'})
  + pill(70,52,56,16,'⬆ Upload','#E3EAF2','#4F6B8A',{s2:6.5})
  + pill(132,52,56,16,'📷 Camera','#E2EAE5','#5C7A65',{s2:6.5})
  + pill(194,52,56,16,'🖼 Gallery','#EBE6EC','#8A7689',{s2:6.5})
  + t(16,102,'Every photo spot takes all three — drag &amp; drop,',{s:7,f:INK2,max:262})
  + t(16,116,'Upload, and Camera. Use whichever suits.',{s:7,f:INK2,max:262})
  + t(16,134,'Camera opens burst mode; the Library button inside',{s:7,f:INK2,max:262})
  + t(16,148,'it pulls from the gallery instead.',{s:7,f:INK2,max:262})
  + t(16,166,'Photos attach to checklists, deficiencies, site',{s:7,f:INK2,max:262})
  + t(16,180,'records and each flow point.',{s:7,f:INK2,max:262})
);

ART.markup = svg(300,190,
  r(16,14,128,86,{rx:5,f:SOFT,s:EDGE})
  + '<circle cx="60" cy="52" r="14" fill="none" stroke="'+INK2+'" stroke-width="1.4"/>'
  + '<ellipse cx="60" cy="76" rx="22" ry="8" fill="none" stroke="'+INK2+'" stroke-width="1.2"/>'
  + '<circle cx="96" cy="58" r="16" fill="none" stroke="#C0392B" stroke-width="2.2"/>'
  + '<path d="M112,44 l16,-14" stroke="#C0392B" stroke-width="2.2" stroke-linecap="round"/>'
  + t(80,110,'marked copy',{s:6.5,f:INK3,a:'middle'})
  + '<path d="M152,56 h20 m-6,-6 l6,6 l-6,6" stroke="'+INK3+'" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
  + r(184,14,100,86,{rx:5,f:SOFT,s:EDGE})
  + '<circle cx="222" cy="52" r="14" fill="none" stroke="'+INK2+'" stroke-width="1.4"/>'
  + '<ellipse cx="222" cy="76" rx="22" ry="8" fill="none" stroke="'+INK2+'" stroke-width="1.2"/>'
  + t(234,110,'original — always kept clean',{s:6.5,f:INK3,a:'middle',max:110})
  + t(16,134,'Draw on a photo to point out the problem.',{s:7,f:INK2,max:262})
  + t(16,148,'The clean original is kept underneath as its own copy,',{s:7,f:INK2,max:262})
  + t(16,162,'so erasing your marks rolls the photo back exactly',{s:7,f:INK2,max:262})
  + t(16,176,'as it was — no fuss.',{s:7,f:INK2,max:262})
);

ART.closeout = svg(300,190,
  t(16,18,'CLOSEOUT',{s:6.5,w:700,f:INK3}) + pill(76,10,44,14,'⚑ 2 open','#FBE3E9',RED,{s2:6,s:RED,sw:.6})
  + r(16,28,268,36,{rx:6,f:PAPER,s:EDGE}) + r(16,28,3.5,36,{rx:2,f:RED})
  + t(28,42,'D-1  Relief valve piped to floor, not drain',{s:7.5,f:INK,max:200})
  + t(28,56,'2 photos · contractor response pending',{s:6.5,f:INK3,max:200})
  + pill(236,36,40,16,'Open','#F1F5F9',INK2,{s2:6.5,s:EDGE})
  + r(16,70,268,36,{rx:6,f:PAPER,s:EDGE}) + r(16,70,3.5,36,{rx:2,f:GREEN})
  + t(28,84,'D-2  Missing coupling guard',{s:7.5,f:INK,max:200})
  + t(28,98,'1 photo · resolved on site',{s:6.5,f:INK3,max:200})
  + pill(236,78,40,16,'Closed','#DCF1E8',GREEN,{s2:6.5})
  + r(16,116,268,40,{rx:6,f:SOFT,s:EDGE})
  + t(28,132,'SIGNATURE',{s:6,w:700,f:INK3})
  + '<path d="M30,150 c14,-12 20,4 32,-6 c10,-8 16,6 30,-4" fill="none" stroke="'+INK+'" stroke-width="1.4"/>'
  + t(16,174,'Deficiencies, signature, sketches and photos in one',{s:7,f:INK2,max:262})
  + t(16,186,'place — with a ⚑ count of anything still open.',{s:7,f:INK2,max:262})
);

ART.cloud = svg(300,190,
  t(16,20,'PHOTO STATUS DOTS',{s:6.5,w:700,f:INK3})
  + r(16,28,60,44,{rx:5,f:SOFT,s:EDGE}) + '<circle cx="66" cy="38" r="6" fill="'+GREEN+'"/><path d="M63,38 l2,2 l4,-4" stroke="#fff" stroke-width="1.3" fill="none"/>'
  + r(84,28,60,44,{rx:5,f:SOFT,s:EDGE}) + '<circle cx="134" cy="38" r="6" fill="#8A6E4B"/>'
  + r(152,28,60,44,{rx:5,f:SOFT,s:EDGE}) + '<circle cx="202" cy="38" r="6" fill="'+RED+'"/>'
  + r(220,28,60,44,{rx:5,f:SOFT,s:EDGE}) + '<circle cx="270" cy="38" r="6" fill="#9AA0A8"/>'
  + t(46,88,'green ✓',{s:6.5,f:GREEN,a:'middle'}) + t(46,98,'uploaded',{s:6,f:INK3,a:'middle'})
  + t(114,88,'brown',{s:6.5,f:'#8A6E4B',a:'middle'}) + t(114,98,'uploading',{s:6,f:INK3,a:'middle'})
  + t(182,88,'red',{s:6.5,f:RED,a:'middle'}) + t(182,98,'failed',{s:6,f:INK3,a:'middle'})
  + t(250,88,'grey',{s:6.5,f:'#9AA0A8',a:'middle'}) + t(250,98,'this device only',{s:6,f:INK3,a:'middle',max:56})
  + t(16,126,'Dots turn green on their own as uploads finish —',{s:7,f:INK2,max:262})
  + t(16,140,'no need to refresh.',{s:7,f:INK2,max:262})
  + t(16,158,'Grey means the photo exists only on this tablet so far:',{s:7,f:INK2,max:262})
  + t(16,172,'get on Wi-Fi before wiping or swapping the device.',{s:7,f:INK2,max:262})
);

ART.orient = svg(300,190,
  r(16,10,268,24,{rx:6,f:NAVY})
  + t(28,25,'Diesel Fire Pump Commissioning',{s:7.5,w:700,f:'#fff',max:170})
  + '<circle cx="238" cy="22" r="4" fill="'+GREEN+'"/>' + t(246,25,'Saved',{s:6,f:'#cfe9dd'})
  + '<circle cx="272" cy="22" r="7" fill="rgba(255,255,255,.14)"/>' + t(272,25,'?',{s:7,w:700,f:'#E0A36A',a:'middle'})
  + pill(16,42,50,14,'Summary',NAVY,'#fff',{s2:6})
  + pill(70,42,72,14,'Performance Test',PAPER,INK2,{s2:5.5,s:EDGE})
  + pill(146,42,50,14,'Checklists',PAPER,INK2,{s2:5.5,s:EDGE})
  + pill(200,42,46,14,'Closeout',PAPER,INK2,{s2:5.5,s:EDGE})
  + r(16,64,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,77,'Nameplate — rated flow / pressure / speed',{s:7,f:INK2,max:230})
  + r(16,88,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,101,'Flow table — churn / rated / 150%',{s:7,f:INK2,max:230})
  + r(16,112,268,34,{rx:5,f:SOFT,s:EDGE})
  + '<path d="M30,138 C90,132 150,128 270,120" fill="none" stroke="#D4A017" stroke-width="2.5"/>'
  + t(26,124,'Chart — gold Actual Output',{s:6.5,f:INK3,max:200})
  + t(16,164,'Summary first, then the test tabs, checklists and',{s:7,f:INK2,max:262})
  + t(16,178,'Closeout. The ? opens this guide from anywhere.',{s:7,f:INK2,max:262})
);

/* ════════════════════════════════════════════════════════════════════════
   CARDS — task style (S510, Mark). Same rebuild as the Hub's Dashboard
   (S509): verb titles, ordered steps, drawings replicating the real
   screens. Every id, search-term string and date is carried over VERBATIM
   from the S505 set; two new cards (diesel-orient, diesel-placard) cover
   verified features the old set skipped, dated back so they do not flood
   What's New. All values in the art are representative — no real data.
   ════════════════════════════════════════════════════════════════════════ */
var CARDS = [

/* ─ GETTING AROUND ─ */
{
  id:'diesel-orient', area:'Getting around', date:'2026-06-20',
  title:'Find your way around the tool',
  pts:['<b>Summary</b> opens first — a roll-up of how complete everything is. Tap a row to jump to it.',
       'The <b>Performance Test</b> tab holds the nameplate, the flow table and the chart.',
       'Checklists and <b>Closeout</b> (deficiencies + signature) follow.',
       'The <b>?</b> in the header opens this guide from anywhere.'],
  chips:[['Everyone','c-where']],
  terms:'lost confused where am i what is this overview start here first time new user getting started layout tabs sections tour',
  art:ART.orient
},
{
  id:'diesel-summary-tab', area:'Getting around', date:'2026-07-15',
  title:'Read the Summary and jump to work',
  pts:['The tool opens on <b>Summary</b> every time — completion across checklists, battery, flow tests and signature.',
       'Tap any row to jump straight to that section.',
       'Open deficiencies show in their own strip and are <b>not</b> subtracted from the completion %.'],
  chips:[['Everyone','c-where']],
  terms:'summary tab overview completion percent roll up progress how much done landing page open on jump to section deficiency strip flag',
  art:ART.summary
},
{
  id:'diesel-nameplate', area:'Getting around', date:'2026-06-28',
  title:'Fill the nameplate first',
  pts:['Rated flow, pressure, speed and the valve settings sit in <b>one nameplate row</b> at the top of each test.',
       'These drive the chart and the pass/fail math — get them right before recording readings.',
       'NPSH is recorded here too, kept separately for the 3-point and 7-point tests.'],
  chips:[['Everyone','c-where']],
  terms:'nameplate rated flow pressure speed rpm relief reducing valve npsh design values top row drives chart pass fail setpoint fill in first',
  art:ART.nameplate
},
{
  id:'diesel-placard', area:'Getting around', date:'2026-06-26',
  title:'Scan the placard instead of typing it',
  pts:['Photograph the pump placard and the <b>Nameplate Details fill themselves</b> from the photo.',
       'Everything stays editable — check each value against the plate.',
       'The scan is a head start, not a verdict: you are the verifier, not the camera.'],
  chips:[['Everyone','c-where']],
  terms:'placard scan photo nameplate autofill fill automatically read plate camera manufacturer model serial type it for me ocr',
  art:ART.placard
},
{
  id:'diesel-save-leave', area:'Getting around', date:'2026-07-18',
  title:'Leave without losing anything',
  pts:['There is <b>no save button to remember</b> — every change is written as you make it.',
       'Tapping ← Back or the logo does a full save first, then leaves. No prompt, nothing lost.',
       'The cloud dot near the top flashes “Saving…” whenever it syncs.'],
  chips:[['Everyone','c-where']],
  terms:'save saving autosave auto save leave back button logo exit lost data prompt do i need to save cloud dot sync where is save button',
  art:ART.save
},
{
  id:'diesel-cloud-status', area:'Getting around', date:'2026-06-25',
  title:'Check a photo made it to the cloud',
  pts:['A <b>green cloud with a check</b> means the photo is safely uploaded; brown means it is still going up.',
       'Red means an upload failed; grey means it exists only on this device so far.',
       'Dots turn green on their own as uploads finish — no need to refresh. Get grey ones on Wi-Fi before wiping or swapping the tablet.'],
  chips:[['Everyone','c-where']],
  terms:'cloud status dot green check brown pending red failed grey local only upload photo sync where is my photo safe backed up uploading colour',
  art:ART.cloud
},

/* ─ PERFORMANCE TEST ─ */
{
  id:'diesel-3pt-7pt', area:'Performance test', date:'2026-07-12',
  title:'Choose the 3-point or 7-point test',
  pts:['One <b>Performance Test</b> tab holds both — switch with the toggle at the top.',
       '3-point is the straight churn / rated / 150% run; 7-point adds the in-between readings and the PLD device test.',
       'On 7-point the 25/50/75/125% rows are for the chart only — NFPA scores the 0/100/150% points.'],
  chips:[['Everyone','c-where']],
  terms:'3 point 7 point three seven flow test performance toggle switch which test pld device 25 50 75 125 rows churn rated 150 difference',
  art:ART.tests
},
{
  id:'diesel-gauge-photos', area:'Performance test', date:'2026-07-24',
  title:'Back every reading with a gauge photo',
  pts:['<b>Pick the reading first, then shoot</b> — the photo is tied to that exact discharge, suction or RPM value.',
       'Later you can see which gauge photo backs up every number on the chart.',
       'The 7-point test keeps its w/PLD and w/o-PLD shots separate so they never get mixed up.'],
  chips:[['Everyone','c-where']],
  terms:'gauge photo rpm photo reading pick then shoot flow point evidence which number came from tag pld w/o proof needle psi capture',
  art:ART.gauge
},
{
  id:'diesel-golden-curve', area:'Performance test', date:'2026-07-25', isNew:true,
  title:'Read the gold “Actual Output” curve',
  pts:['The thick gold line is the <b>pressure the system actually delivers</b> — the number that matters.',
       'It follows your measured readings until a relief or reducing valve caps it, then runs flat at the cap.',
       'Turn any cap on or off with its legend pill and the gold line reshapes on the spot.'],
  chips:[['New','c-new'],['Both flow tests','c-where']],
  terms:'golden curve gold line actual output delivered pressure cap relief reducing valve prv flat clamp what the pump really gives headline chart performance discharge',
  art:ART.golden
},
{
  id:'diesel-caps', area:'Performance test', date:'2026-07-10',
  title:'Show or hide the pressure caps',
  pts:['Relief and reducing valve settings draw as <b>flat dashed cap lines</b> and feed the gold curve.',
       'Each cap has a legend pill — turn it off to see what the pump would do without it.',
       'Caps are labelled with the device and setpoint only, e.g. “PRV @ 175 psi”.'],
  chips:[['Everyone','c-where']],
  terms:'pressure cap relief reducing valve prv prdv pld setting dashed line setpoint limit legend pill toggle 150 percent flow flat line clamp golden',
  art:ART.caps
},
{
  id:'diesel-verdicts', area:'Performance test', date:'2026-07-22', isNew:true,
  title:'See why a point passed or failed',
  pts:['Each point is scored against the <b>NFPA 20 acceptance gates</b> — churn ≤ 140%, rated ≥ 100%, 150% ≥ 65% of rated net.',
       'When a reading misses, the readout turns red and tells you the threshold it needed.',
       'You always have the final say: a <b>manual override</b> lets you set the verdict yourself.'],
  chips:[['New','c-new'],['Both flow tests','c-where']],
  terms:'pass fail verdict nfpa 20 acceptance churn 140 rated 100 150 65 percent net threshold override manual set red miss needs meets certification gate',
  art:ART.gates
},
{
  id:'diesel-safety-margin', area:'Performance test', date:'2026-07-20',
  title:'Check the safety margin at a demand',
  pts:['Drag the chip along the discharge chart to see <b>how much pressure is left over</b> above what the system demands.',
       'Green ADEQUATE, amber TIGHT, red DEFICIT — read at a glance.',
       'It uses the gold “actual output” at the demand flow, not the raw gauge reading.'],
  chips:[['Everyone','c-where']],
  terms:'safety margin chip adequate tight deficit spare pressure headroom demand available drag chip green amber red how much left over',
  art:ART.margin
},

/* ─ PHOTOS ─ */
{
  id:'diesel-photos-everywhere', area:'Photos', date:'2026-07-08',
  title:'Add a photo wherever you are',
  pts:['Every photo spot takes a <b>drag &amp; drop, an Upload button and a Camera button</b> — use whichever suits.',
       'Camera opens burst mode; a Library button inside it lets you pull from the gallery instead.',
       'Photos attach to checklists, deficiencies, site records and each flow point.'],
  chips:[['Everyone','c-where']],
  terms:'photo add upload camera drag drop burst library gallery attach checklist deficiency site record flow point how to add picture image evidence',
  art:ART.photos
},
{
  id:'diesel-markup', area:'Photos', date:'2026-07-05',
  title:'Mark up a photo without losing the original',
  pts:['Draw on a photo to point out a problem — the <b>original is always kept clean underneath</b>.',
       'The clean copy is saved as its own file, so you can always get back to it.',
       'Erasing your marks rolls the photo back with no fuss.'],
  chips:[['Everyone','c-where']],
  terms:'markup mark up draw annotate photo arrow circle highlight original clean copy backup erase revert undo point out problem sketch on image',
  art:ART.markup
},

/* ─ CLOSEOUT ─ */
{
  id:'diesel-deficiencies', area:'Closeout', date:'2026-07-02',
  title:'Record a deficiency and close the job',
  pts:['Closeout gathers <b>deficiencies, signature, sketches and photos</b> in one place.',
       'The Closeout tab carries a ⚑ count of anything still open.',
       'Each deficiency holds its own evidence photos and a contractor response.'],
  chips:[['Everyone','c-where']],
  terms:'deficiency deficiencies closeout close out signature sketch flag open count evidence photo contractor response finding issue problem list',
  art:ART.closeout
}
];

/* ── register ─────────────────────────────────────────────────────────────── */
registerHelp({
  tool: 'Diesel',                         // MUST match hasCards('Diesel') / comingSoon
  areas: ['Getting around','Performance test','Photos','Closeout'],
  cards: CARDS
});
