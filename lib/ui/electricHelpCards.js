// lib/ui/electricHelpCards.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON Electric Fire Pump Commissioning — first Help guide (S510, Mark).
// Electric's OWN cards, handed to the shared Help engine (lib/ui/helpEngine.js).
// Task-style from day one: verb titles, ordered steps, drawings replicating the
// real screens (ratings row, placard scan, 3/7-point toggle, checklist Yes/No/N-A,
// the shared photo surface).
//
// DELIBERATELY SMALL (8 cards): written only for surfaces VERIFIED in the live
// tool. Electric's photo pipeline is still pre-port, so there are no cloud-dot
// or markup-internals cards yet — a wrong card is worse than a missing one.
// Expand alongside the photo-architecture port.
//
// NO REAL DATA (Mark, absolute): every value drawn is representative.
// SVG TEXT DOES NOT WRAP OR TRUNCATE — labels are fitted via fit()/t({max});
// tools/check_help_art.py measures painted labels and fails on overlap.
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
   ART — drawings replicating the REAL Electric commissioning screens.
   Values are representative only — no real project, client or staff data
   (Mark's absolute rule).
   ════════════════════════════════════════════════════════════════════════ */
var ART = {};
var ELEC = '#1565C0';

ART.orient = svg(300,190,
  r(16,10,268,24,{rx:6,f:NAVY})
  + t(28,25,'Electric Fire Pump Commissioning',{s:7.5,w:700,f:'#fff',max:170})
  + '<circle cx="272" cy="22" r="7" fill="rgba(255,255,255,.14)"/>' + t(272,25,'?',{s:7,w:700,f:'#E0A36A',a:'middle'})
  + pill(16,42,50,14,'Summary',NAVY,'#fff',{s2:6})
  + pill(70,42,72,14,'Performance Test',PAPER,INK2,{s2:5.5,s:EDGE})
  + pill(146,42,50,14,'Checklists',PAPER,INK2,{s2:5.5,s:EDGE})
  + r(16,64,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,77,'Pump &amp; motor ratings — flow / pressure / volts / amps',{s:7,f:INK2,max:230})
  + r(16,88,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,101,'Flow table — churn / rated / 150%',{s:7,f:INK2,max:230})
  + r(16,112,268,34,{rx:5,f:SOFT,s:EDGE})
  + '<path d="M30,138 C90,130 150,126 270,118" fill="none" stroke="'+ELEC+'" stroke-width="2.2"/>'
  + t(26,124,'Discharge chart',{s:6.5,f:INK3,max:200})
  + t(16,164,'Summary rolls up completion; the test tab holds the',{s:7,f:INK2,max:262})
  + t(16,178,'readings and chart. The ? opens this guide anywhere.',{s:7,f:INK2,max:262})
);

ART.nameplate = svg(300,190,
  t(16,18,'RATINGS — drive the chart and the pass/fail math',{s:6.5,w:700,f:INK3,max:262})
  + r(16,24,268,44,{rx:6,f:PAPER,s:EDGE})
  + t(26,38,'Rated flow',{s:5.5,f:INK3}) + r(26,42,54,14,{rx:4,f:SOFT,s:EDGE}) + t(31,53,'750 gpm',{s:7,f:INK,mono:true})
  + t(90,38,'Rated pressure',{s:5.5,f:INK3}) + r(90,42,50,14,{rx:4,f:SOFT,s:EDGE}) + t(95,53,'110 psi',{s:7,f:INK,mono:true})
  + t(150,38,'Volts',{s:5.5,f:INK3}) + r(150,42,44,14,{rx:4,f:SOFT,s:EDGE}) + t(155,53,'600',{s:7,f:INK,mono:true})
  + t(204,38,'FLA',{s:5.5,f:INK3}) + r(204,42,44,14,{rx:4,f:SOFT,s:EDGE}) + t(209,53,'96 A',{s:7,f:INK,mono:true})
  + t(16,86,'MOTOR / CONTROLLER DETAILS · filled by the placard scan, editable',{s:6,w:700,f:INK3,max:262})
  + r(16,92,268,40,{rx:6,f:PAPER,s:EDGE})
  + t(26,106,'Manufacturer',{s:5.5,f:INK3}) + r(26,110,110,14,{rx:4,f:SOFT,s:EDGE}) + t(31,121,'Crestway Pump Co.',{s:7,f:INK,max:100})
  + t(150,106,'Model No.',{s:5.5,f:INK3}) + r(150,110,120,14,{rx:4,f:SOFT,s:EDGE}) + t(155,121,'CW-6x4x12E',{s:7,f:INK,mono:true,max:110})
  + t(16,152,'Get these right first — every verdict and the',{s:7,f:INK2,max:262})
  + t(16,166,'electrical readings are measured against them.',{s:7,f:INK2,max:262})
);

ART.placard = svg(300,190,
  r(16,14,120,86,{rx:6,f:'#3E4650'})
  + r(24,22,104,70,{rx:3,f:'#4A525C',s:'#5A626C'})
  + t(76,36,'FIRE PUMP',{s:7,w:700,f:'#E8E8E8',a:'middle'})
  + t(30,50,'GPM',{s:5.5,f:'#B8BEC6'}) + t(122,50,'750',{s:6.5,f:'#fff',a:'end',mono:true})
  + t(30,62,'PSI',{s:5.5,f:'#B8BEC6'}) + t(122,62,'110',{s:6.5,f:'#fff',a:'end',mono:true})
  + t(30,74,'VOLTS',{s:5.5,f:'#B8BEC6'}) + t(122,74,'600',{s:6.5,f:'#fff',a:'end',mono:true})
  + t(30,86,'MODEL',{s:5.5,f:'#B8BEC6'}) + t(122,86,'CW-6x4x12E',{s:6,f:'#fff',a:'end',mono:true})
  + '<path d="M148,54 h20 m-6,-6 l6,6 l-6,6" stroke="'+INK3+'" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
  + r(180,20,104,76,{rx:6,f:PAPER,s:EDGE})
  + t(190,34,'Manufacturer',{s:5.5,f:INK3}) + r(190,38,86,12,{rx:3,f:'#FBF3DC',s:'#D4A017',sw:.5}) + t(194,47,'Crestway Pump Co.',{s:6,f:INK,max:78})
  + t(190,60,'Model No.',{s:5.5,f:INK3}) + r(190,64,86,12,{rx:3,f:'#FBF3DC',s:'#D4A017',sw:.5}) + t(194,73,'CW-6x4x12E',{s:6,f:INK,mono:true,max:78})
  + t(190,86,'…filled for you, still editable',{s:5.5,f:INK3,max:88})
  + t(16,124,'Photograph the pump placard and the detail fields',{s:7,f:INK2,max:262})
  + t(16,138,'fill themselves from the photo.',{s:7,f:INK2,max:262})
  + t(16,154,'Everything stays editable — check the values against',{s:7,f:INK2,max:262})
  + t(16,168,'the plate; you are the verifier, not the scan.',{s:7,f:INK2,max:262})
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
  + r(16,140,268,14,{rx:4,f:SOFT,s:EDGE}) + t(24,150,'Voltage &amp; amps per point',{s:7,f:INK2,max:180}) + t(270,150,'recorded',{s:6,f:ELEC,a:'end'})
  + t(16,172,'One Performance Test tab holds both — the toggle switches.',{s:6.5,f:INK2,max:262})
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
  + t(28,104,'1.7  Controller nameplate matches motor',{s:7.5,f:INK,max:244})
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
  + pill(58,52,56,16,'⬆ Upload','#E3EAF2','#4F6B8A',{s2:6.5})
  + pill(120,52,56,16,'📷 Camera','#E2EAE5','#5C7A65',{s2:6.5})
  + pill(182,52,56,16,'🖼 Gallery','#EBE6EC','#8A7689',{s2:6.5})
  + t(16,102,'Every photo spot takes all three — drag &amp; drop,',{s:7,f:INK2,max:262})
  + t(16,116,'Upload, and Camera — plus Gallery for photos',{s:7,f:INK2,max:262})
  + t(16,130,'already on the device.',{s:7,f:INK2,max:262})
  + t(16,150,'Photos attach to checklist items and deficiencies',{s:7,f:INK2,max:262})
  + t(16,164,'as evidence.',{s:7,f:INK2,max:262})
);

ART.save = svg(300,190,
  r(16,14,268,26,{rx:6,f:NAVY})
  + pill(24,19,44,16,'← Back','rgba(255,255,255,.12)','#fff',{s2:6.5})
  + t(126,31,'Electric Fire Pump',{s:8,w:700,f:'#fff',max:110})
  + '<circle cx="244" cy="27" r="4" fill="'+GREEN+'"/>' + t(254,31,'Saved',{s:6.5,f:'#cfe9dd'})
  + t(16,66,'There is no save button to remember.',{s:8.5,w:700,f:INK,max:262})
  + t(16,82,'Every change is written as you make it.',{s:7,f:INK2,max:262})
  + r(16,96,268,40,{rx:6,f:SOFT,s:EDGE})
  + t(28,112,'Tapping ← Back saves first, then returns to the',{s:7,f:INK2,max:244})
  + t(28,126,'Hub — no prompt, nothing lost.',{s:7,f:INK2,max:244})
  + t(16,158,'The cloud indicator near the top shows the sync',{s:7,f:INK2,max:262})
  + t(16,172,'state as it writes.',{s:7,f:INK2,max:262})
);

/* ════════════════════════════════════════════════════════════════════════
   CARDS — task style (S510, Mark). Electric's FIRST guide: 8 cards, written
   only for surfaces verified in the live tool. Electric's photo pipeline is
   still the pre-port architecture, so no cloud-dot or markup-internals
   cards until that port lands — a wrong card is worse than a missing one.
   All values in the art are representative — no real data.
   ════════════════════════════════════════════════════════════════════════ */
var CARDS = [
{
  id:'elec-orient', area:'Getting around', date:'2026-07-27', isNew:true,
  title:'Find your way around the tool',
  pts:['<b>Summary</b> rolls up how complete everything is; tap a row to jump to it.',
       'The <b>Performance Test</b> tab holds the ratings, the flow table and the chart.',
       'Checklists follow, with deficiencies flagged from any No answer.',
       'The <b>?</b> in the header opens this guide from anywhere.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'lost confused where am i what is this overview start here first time new user getting started layout tabs sections tour',
  art:ART.orient
},
{
  id:'elec-nameplate', area:'Getting around', date:'2026-07-27', isNew:true,
  title:'Fill the ratings first',
  pts:['Rated flow, pressure, <b>voltage and full-load amps</b> sit at the top of the test.',
       'These drive the chart and the pass/fail math — get them right before recording readings.',
       'The motor and controller details live underneath, filled by the placard scan and editable.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'nameplate rated flow pressure voltage volts amps fla motor controller design values top row drives chart pass fail fill in first ratings',
  art:ART.nameplate
},
{
  id:'elec-placard', area:'Getting around', date:'2026-07-27', isNew:true,
  title:'Scan the placard instead of typing it',
  pts:['Photograph the pump placard and the <b>detail fields fill themselves</b> from the photo.',
       'Everything stays editable — check each value against the plate.',
       'The scan is a head start, not a verdict: you are the verifier, not the camera.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'placard scan photo nameplate autofill fill automatically read plate camera manufacturer model serial type it for me ocr',
  art:ART.placard
},
{
  id:'elec-save', area:'Getting around', date:'2026-07-27', isNew:true,
  title:'Leave without losing anything',
  pts:['There is <b>no save button to remember</b> — every change is written as you make it.',
       'Tapping ← Back saves first, then returns to the Hub. No prompt, nothing lost.',
       'The cloud indicator near the top shows the sync state as it writes.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'save saving autosave auto save leave back button exit lost data prompt do i need to save cloud sync where is save button',
  art:ART.save
},
{
  id:'elec-3pt-7pt', area:'Performance test', date:'2026-07-27', isNew:true,
  title:'Choose the 3-point or 7-point test',
  pts:['One <b>Performance Test</b> tab holds both — switch with the toggle at the top.',
       '3-point is the straight churn / rated / 150% run; 7-point adds the in-between readings and the PLD device test.',
       '<b>Voltage and amps are recorded at each point</b> alongside the pressures.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'3 point 7 point three seven flow test performance toggle switch which test pld device 25 50 75 125 rows churn rated 150 voltage amps difference',
  art:ART.tests
},
{
  id:'elec-checklist', area:'Checklists', date:'2026-07-27', isNew:true,
  title:'Answer a checklist item',
  pts:['Tap <b>Yes / No / N/A</b> — the selected answer takes full colour; unselected stays flat grey.',
       'A <b>No</b> can flag a deficiency, carrying its own evidence photos.',
       'Add a photo to any item to back the answer up.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'checklist yes no na answer item tick check flag deficiency question inspection confirm photo evidence how do i answer',
  art:ART.checklist
},
{
  id:'elec-photos', area:'Checklists', date:'2026-07-27', isNew:true,
  title:'Add a photo wherever you are',
  pts:['Every photo spot takes a <b>drag &amp; drop, an Upload button and a Camera button</b> — plus Gallery for photos already on the device.',
       'Photos attach to checklist items and deficiencies as evidence.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'photo add upload camera drag drop gallery attach checklist deficiency how to add picture image evidence',
  art:ART.photos
},
{
  id:'elec-deficiencies', area:'Checklists', date:'2026-07-27', isNew:true,
  title:'Record a deficiency',
  pts:['Flag a deficiency from a <b>No</b> answer or add one directly.',
       'Each deficiency holds its own description and evidence photos.',
       'Open deficiencies stay visible until they are resolved — they are findings, not notes.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'deficiency deficiencies flag finding issue problem record open resolve evidence photo list',
  art:ART.checklist
}
];

/* ── register ─────────────────────────────────────────────────────────────── */
registerHelp({
  tool: 'Electric',                       // MUST match hasCards('Electric') / comingSoon
  areas: ['Getting around','Performance test','Checklists'],
  cards: CARDS
});
