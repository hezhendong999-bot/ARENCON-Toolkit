// lib/ui/hubHelpCards.js
// ─────────────────────────────────────────────────────────────────────────────
// ARENCON Project Hub — DASHBOARD guide (task-style, S509, Mark) + the Hub-page
// card set (S505f, unchanged pending its own pass).
//
// TWO SCOPES FROM ONE FILE (Mark's terms, never swap them): "Dashboard" is the
// page listing ALL projects; "Hub page" is the per-project page you land on
// after clicking a project. A Help panel shows ONE scope and never mixes.
//
// S509 REBUILD (Mark): the Dashboard set was 13 description-style cards with
// generic icon art. It is now 23 TASK-style cards — verb titles, steps in order
// — with drawings that REPLICATE THE REAL DASHBOARD (toolbar, project row,
// New Project box, select bar, Insights, admin panels), matching the standard
// set by FRT's guide.
//
// NO REAL DATA (Mark, absolute): every name, client and project number drawn
// here is INVENTED. The previous art carried real staff names, real clients and
// real project numbers; that is removed. The cast is declared once in C below —
// add to it rather than inventing new names ad hoc.
//
// SVG TEXT DOES NOT WRAP OR TRUNCATE. A label one character too long paints
// straight over its neighbour (this shipped once and looked like the drawing had
// exploded). Every string is fitted to a width budget by fit()/t({max}) before
// it is drawn, and tools/check_help_art.py measures every painted label in a
// real browser and fails on any overlap. Run it after touching any drawing.
// ─────────────────────────────────────────────────────────────────────────────
import { registerHelp } from '/lib/ui/helpEngine.js';

/* ════════════════════════════════════════════════════════════════════════
   INVENTED CAST — the single source for every name/number drawn below.
   Nothing here is a real person, client or project.
   ════════════════════════════════════════════════════════════════════════ */
var C = {
  you:  {name:'You',           ini:'YO', col:'#5B7B95'},
  dana: {name:'Dana Whitlow',  ini:'DW', col:'#6E6AA8'},
  paul: {name:'Paul Ferris',   ini:'PF', col:'#3E8E6E'},
  rita: {name:'Rita Okonjo',   ini:'RO', col:'#8A6E4B'},
  sam:  {name:'Sam Vance',     ini:'SV', col:'#5E5B68'}
};

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
   ART
   ════════════════════════════════════════════════════════════════════════ */
var ART={};

/* — the whole board, for orientation — */
ART.board = svg(300,190,
  toolbar(8)
  + r(16,28,42,15,{rx:7,f:PAPER,s:EDGE}) + t(37,38,'☑ Select',{s:6,f:INK2,a:'middle'})
  + pill(226,28,58,15,'+ New Project',BURG,'#fff',{s2:6})
  + t(16,56,'12 active projects · 3 never backed up',{s:6.5,f:INK3,max:200})
  + r(16,62,52,11,{rx:5,f:PAPER,s:EDGE}) + t(42,70,'8000–8999',{s:6,w:700,f:INK2,a:'middle',mono:true})
  + t(74,70,'4 projects',{s:6,f:INK3})
  + boardRow(78,{num:'8801.02',client:'Northgate Logistics',name:'Distribution Centre',tools:['frt','dfp'],stamp:'📥 Jul 12',who:C.you,star:true})
  + boardRow(112,{num:'8814.01',client:'Rivermill Properties',name:'Mezzanine Review',tools:['frt'],stamp:'⚠ Not backed up',stampF:AMBER,stampBold:true,who:C.dana})
  + boardRow(146,{num:'8823.07',client:'Halcyon Foods',name:'Bakery Line',tools:['frt','efp','ist'],stamp:'📥 Mar 04',stampF:RED,who:C.paul})
);

/* — anatomy of one row — */
ART.row = svg(300,190,
  r(16,18,268,46,{rx:6,f:PAPER,s:EDGE})
  + t(26,40,'☆',{s:12,f:INK3})
  + t(40,40,'8801.02',{s:10,w:700,f:INK,mono:true})
  + t(96,40,'Distribution Centre',{s:9,w:700,f:INK,max:110})
  + avatar(262,36,C.you)
  + t(40,56,'Northgate Logistics',{s:7,f:INK2,max:96})
  + pill(146,48,17,10,'FRT',TOOLC.frt,'#fff',{s2:5.5})
  + pill(165,48,17,10,'DFP',TOOLC.dfp,'#fff',{s2:5.5})
  + t(244,56,'📥 Jul 12',{s:7,f:INK3,a:'end',max:56})
  + t(26,84,'☆',{s:9,f:INK3}) + t(42,84,'star — yours alone, nobody else sees it',{s:7,f:INK2,max:230})
  + t(26,100,'8801.02',{s:7.5,w:700,f:INK,mono:true}) + t(76,100,'number + name — printed on every report',{s:7,f:INK2,max:196})
  + pill(24,110,17,10,'FRT',TOOLC.frt,'#fff',{s2:5.5}) + t(46,118,'tools switched on for this project',{s:7,f:INK2,max:226})
  + avatar(30,131,C.you) + t(46,134,'project manager’s initials',{s:7,f:INK2,max:226})
  + '<line x1="16" y1="143" x2="284" y2="143" stroke="'+LINE+'"/>'
  + t(16,156,'BACKUP STAMP — TINTS WITH AGE',{s:6.5,w:700,f:INK3})
  + t(16,170,'📥 Jul 12',{s:7,f:INK3}) + t(84,170,'under 30 days — quiet',{s:6.5,f:INK3,max:190})
  + t(16,183,'⚠ Not backed up',{s:7,w:700,f:RED}) + t(84,183,'90+ days or never — red',{s:6.5,f:INK3,max:190})
);

/* — new project modal — */
ART.newproj = svg(300,190,
  r(30,10,240,170,{rx:8,f:PAPER,s:EDGE})
  + t(42,28,'New Project',{s:11,w:700,f:INK})
  + t(42,46,'PROJECT NUMBER',{s:6,w:700,f:INK3})
  + r(42,50,100,15,{rx:5,f:SOFT,s:EDGE}) + t(48,60,'8801',{s:8,f:INK,mono:true})
  + r(146,50,112,32,{rx:5,f:'#FBEEF1',s:BURG,sw:.7})
  + t(152,61,'Clients used in 8801:',{s:5.5,w:700,f:BURG})
  + t(152,73,'Northgate Logistics · most used',{s:5.5,f:INK2})
  + t(42,96,'PROJECT NAME',{s:6,w:700,f:INK3})
  + r(42,100,216,15,{rx:5,f:SOFT,s:EDGE}) + t(48,110,'Distribution Centre Sprinklers',{s:7,f:INK})
  + t(42,130,'CLIENT',{s:6,w:700,f:INK3})
  + r(42,134,216,15,{rx:5,f:SOFT,s:EDGE}) + t(48,144,'North…',{s:7,f:INK})
  + r(90,149,110,12,{rx:4,f:PAPER,s:EDGE}) + t(96,158,'Northgate Logistics',{s:6,f:INK2})
  + pill(150,166,50,13,'Cancel',PAPER,INK2,{s2:6,s:EDGE})
  + pill(206,166,52,13,'Create Project',BURG,'#fff',{s2:6})
);

/* — select mode — */
ART.select = svg(300,190,
  toolbar(8)
  + r(16,30,268,17,{rx:7,f:'#FBEEF1',s:BURG,sw:.7})
  + t(24,42,'3',{s:8,w:700,f:BURG}) + t(36,42,'⭐  ☆  📦  📥  🗑  ✕',{s:8,f:INK2})
  + t(158,42,'All  ⭐ Starred  ⚠ Not backed up',{s:6,f:BURG,max:120})
  + boardRow(54,{check:true,num:'8801.02',client:'Northgate Logistics',name:'Distribution Centre',tools:['frt'],stamp:'⚠ Not backed up',stampF:AMBER,who:C.you})
  + boardRow(88,{check:true,num:'8814.01',client:'Rivermill Properties',name:'Mezzanine Review',tools:['frt'],stamp:'⚠ Not backed up',stampF:AMBER,who:C.dana})
  + boardRow(122,{check:true,num:'8823.07',client:'Halcyon Foods',name:'Bakery Line',tools:['efp'],stamp:'⚠ Not backed up',stampF:AMBER,who:C.paul})
  + t(16,172,'“⚠ Not backed up” ticked all three in one tap.',{s:6.5,f:INK3,max:250})
  + t(16,184,'📥 Export then backs up all three at once.',{s:6.5,f:INK3,max:250})
);

/* — backup ages — */
ART.backup = svg(300,190,
  t(16,18,'SORT: BACKUP NEEDED',{s:6.5,w:700,f:INK3})
  + boardRow(22,{num:'8830.11',client:'Beacon Health',name:'Oncology Wing',tools:['frt'],stamp:'⚠ Not backed up',stampF:RED,stampBold:true,who:C.rita})
  + boardRow(56,{num:'8823.07',client:'Halcyon Foods',name:'Bakery Line',tools:['efp'],stamp:'📥 Mar 04',stampF:RED,who:C.paul})
  + boardRow(90,{num:'8842.03',client:'Crestline Storage',name:'Loading Dock',tools:['frt','dd'],stamp:'📥 May 21',stampF:AMBER,who:C.sam})
  + boardRow(124,{num:'8801.02',client:'Northgate Logistics',name:'Distribution Centre',tools:['frt','dfp'],stamp:'📥 Jul 12',who:C.you})
  + t(16,174,'Never exported → ⚠ Not backed up',{s:7,f:RED,max:250})
  + t(16,186,'90+ days red · 30–89 amber · under 30 quiet',{s:7,f:INK3,max:250})
);

/* — export project docs — */
ART.export = svg(300,190,
  r(16,12,268,60,{rx:6,f:PAPER,s:EDGE})
  + t(28,30,'8801.02',{s:9,w:700,f:INK,mono:true})
  + t(80,30,'Distribution Centre Sprinklers',{s:8,w:700,f:INK})
  + t(28,46,'Northgate Logistics',{s:7,f:INK2})
  + r(240,20,30,20,{rx:5,f:'#DCEFEF',s:'#2E8C8C',sw:.8}) + t(255,34,'📦',{s:10,a:'middle'})
  + t(255,52,'Export',{s:5.5,f:'#1F7373',a:'middle',w:700})
  + '<path d="M150,78 v14 m-4,-4 l4,4 l4,-4" stroke="'+INK3+'" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
  + r(56,98,188,74,{rx:6,f:PAPER,s:EDGE})
  + t(68,114,'8801.02 Northgate DC.zip',{s:8,w:700,f:INK})
  + t(68,130,'📋 Field Review Report.pdf',{s:7,f:INK2})
  + t(68,142,'📄 Diesel Pump Report.pdf',{s:7,f:INK2})
  + t(68,154,'🖼 photos (48)   📐 drawings (6)',{s:7,f:INK2})
  + t(68,166,'📄 project data + README.txt',{s:7,f:INK2})
);

/* — duplicate numbers — */
ART.dup = svg(300,190,
  boardRow(14,{num:'8801.02',client:'Northgate Logistics',name:'Distribution Centre',tools:['frt'],stamp:'📥 Jul 12',who:C.you})
  + t(246,26,'created first',{s:6,f:GREEN,a:'end',max:70})
  + boardRow(52,{num:'8801.02',client:'Northgate Logistics',name:'Distribution Centre 2',tools:['frt'],stamp:'⚠ Not backed up',stampF:AMBER,who:C.dana,dup:true})
  + t(16,116,'One number = one project.',{s:8,w:700,f:INK,max:250})
  + t(16,132,'The amber Duplicate chip marks the one created second.',{s:7,f:INK2,max:262})
  + t(16,146,'Need a second report? Open the original and use',{s:7,f:INK2,max:262})
  + pill(16,154,62,13,'＋ New Report',PAPER,BURG,{s2:6,s:BURG,sw:.7})
  + t(84,164,'inside it — not a new project.',{s:7,f:INK2,max:190})
);

/* — star / archive — */
ART.star = svg(300,190,
  t(16,16,'☆ → ★ keeps a project at the top of YOUR board',{s:7,f:INK2,max:262})
  + boardRow(22,{num:'8801.02',client:'Northgate Logistics',name:'Distribution Centre',tools:['frt'],stamp:'📥 Jul 12',who:C.you,star:true})
  + boardRow(56,{num:'8814.01',client:'Rivermill Properties',name:'Mezzanine Review',tools:['frt'],stamp:'📥 Jun 30',who:C.dana})
  + t(16,104,'Nobody else sees your stars.',{s:7,f:INK3,max:262})
  + t(16,126,'ARCHIVE = filing, not deleting',{s:7,w:700,f:INK,max:262})
  + pill(16,134,36,14,'📋 Active',NAVY,'#fff',{s2:6})
  + pill(56,134,42,14,'📦 Archived',PAPER,INK2,{s2:6,s:EDGE})
  + pill(102,134,36,14,'🗑 Deleted',PAPER,INK3,{s2:6,s:EDGE})
  + t(16,166,'An archived project keeps every report, photo and',{s:7,f:INK2,max:262})
  + t(16,180,'drawing. It just leaves the Active board.',{s:7,f:INK2,max:262})
);

/* — client name correction — */
ART.crn = svg(300,190,
  r(16,12,268,58,{rx:6,f:PAPER,s:EDGE})
  + t(28,28,'Client name correction',{s:8.5,w:700,f:INK})
  + t(28,42,'Sam Vance suggests on 8842.03:',{s:7,f:INK2})
  + t(28,55,'“Crestline Strge”  →  “Crestline Storage”',{s:7.5,w:700,f:BURG})
  + pill(150,58,38,13,'Decline',PAPER,INK2,{s2:6,s:EDGE})
  + pill(192,58,38,13,'Review',PAPER,BLUE,{s2:6,s:BLUE,sw:.7})
  + pill(234,58,38,13,'Accept',GREEN,'#fff',{s2:6})
  + t(16,90,'REVIEW LETS YOU PICK PROJECT BY PROJECT',{s:6.5,w:700,f:INK3})
  + r(16,96,268,20,{rx:5,f:SOFT,s:EDGE})
  + t(26,110,'8842.03  Loading Dock Alterations',{s:7,f:INK2})
  + '<circle cx="262" cy="106" r="5.5" fill="'+GREEN+'"/><path d="M259.5,106 l2,2 l3.5,-3.5" stroke="#fff" stroke-width="1.2" fill="none"/>'
  + r(16,120,268,20,{rx:5,f:SOFT,s:EDGE})
  + t(26,134,'8842.09  Yard Hydrant Review',{s:7,f:INK2})
  + r(256,120,12,12,{rx:3,f:PAPER,s:EDGE,sw:.8}) + t(262,141,'skip',{s:5.5,f:INK3,a:'middle'})
  + t(16,164,'Your own projects change straight away.',{s:7,f:INK2})
  + t(16,178,'Everyone else is asked before theirs change.',{s:7,f:INK2})
);

/* — review client names (admin) — */
ART.rcn = svg(300,190,
  t(16,20,'ADMIN · REVIEW CLIENT NAMES',{s:6.5,w:700,f:INK3})
  + r(16,26,268,52,{rx:6,f:PAPER,s:EDGE})
  + r(16,26,3.5,52,{rx:2,f:AMBER})
  + t(30,42,'Series 8823',{s:8.5,w:700,f:INK,mono:true})
  + t(30,56,'3 spellings across 4 projects',{s:7,f:AMBER})
  + t(30,70,'“Halcyon Foods” · “Halcyon Foods Ltd” · “Halcyon”',{s:6.5,f:INK2})
  + pill(214,54,60,15,'Fix this series',BURG,'#fff',{s2:6})
  + r(16,86,268,46,{rx:6,f:SOFT,s:EDGE})
  + t(28,102,'8823.07  Bakery Line',{s:7,f:INK2}) + t(180,102,'Halcyon Foods',{s:7,f:INK2})
  + t(28,116,'8823.09  Freezer Addition',{s:7,f:INK2}) + t(180,116,'Halcyon Foods Ltd',{s:7,f:RED})
  + t(28,128,'8823.12  Dock Levellers',{s:7,f:INK2}) + t(180,128,'Halcyon',{s:7,f:RED})
  + t(16,152,'You see the real projects before anything changes.',{s:7,f:INK2})
  + t(16,166,'Projects you manage update immediately;',{s:7,f:INK2})
  + t(16,178,'other managers get asked.',{s:7,f:INK2})
);

/* — insights — */
ART.insights = svg(300,190,
  t(16,18,'BACKUP COVERAGE',{s:6.5,w:700,f:INK3})
  + r(16,24,268,12,{rx:6,f:'#EFEFF3'})
  + r(16,24,150,12,{rx:6,f:GREEN}) + r(166,24,70,12,{rx:0,f:AMBER}) + r(236,24,48,12,{rx:6,f:RED})
  + t(24,33,'fresh 8',{s:6.5,w:700,f:'#fff'}) + t(174,33,'30d+ 4',{s:6.5,w:700,f:'#fff'})
  + t(244,33,'90d+ 3',{s:6.5,w:700,f:'#fff'})
  + t(16,54,'ACTIVE PROJECTS PER PERSON',{s:6.5,w:700,f:INK3})
  + t(18,70,'You',{s:7,f:INK2}) + r(80,63,140,8,{rx:4,f:'#EFEFF3'}) + r(80,63,96,8,{rx:4,f:BLUE}) + t(230,70,'9',{s:7,w:700,f:INK})
  + t(18,86,'Dana W.',{s:7,f:INK2}) + r(80,79,140,8,{rx:4,f:'#EFEFF3'}) + r(80,79,62,8,{rx:4,f:BLUE}) + t(230,86,'6',{s:7,w:700,f:INK})
  + t(18,102,'Paul F.',{s:7,f:INK2}) + r(80,95,140,8,{rx:4,f:'#EFEFF3'}) + r(80,95,40,8,{rx:4,f:BLUE}) + t(230,102,'4',{s:7,w:700,f:INK})
  + t(18,118,'Rita O.',{s:7,f:INK2}) + r(80,111,140,8,{rx:4,f:'#EFEFF3'}) + r(80,111,24,8,{rx:4,f:BLUE}) + t(230,118,'2',{s:7,w:700,f:INK})
  + '<line x1="16" y1="132" x2="284" y2="132" stroke="'+LINE+'"/>'
  + t(16,148,'NEEDING A BACKUP',{s:6.5,w:700,f:INK3})
  + r(16,154,268,28,{rx:6,f:'#FDF0F3',s:RED,sw:.6}) + r(16,154,3.5,28,{rx:2,f:RED})
  + t(30,168,'8830.11  Oncology Wing  ·  Rita Okonjo',{s:7,f:INK2})
  + t(30,179,'8823.07  Bakery Line  ·  Paul Ferris',{s:7,f:INK2})
);

/* — deleting and restoring a project — */
ART.delrestore = svg(300,190,
  pill(16,12,34,14,'📋 Active',PAPER,INK2,{s2:6,s:EDGE})
  + pill(54,12,40,14,'📦 Archived',PAPER,INK2,{s2:6,s:EDGE})
  + pill(98,12,36,14,'🗑 Deleted',NAVY,'#fff',{s2:6})
  + r(16,36,268,58,{rx:6,f:PAPER,s:EDGE})
  + t(28,54,'8842.03',{s:9,w:700,f:INK,mono:true})
  + t(80,54,'Loading Dock Alterations',{s:8,w:700,f:INK})
  + t(28,68,'Crestline Storage',{s:7,f:INK2})
  + t(28,82,'Deleted 2026-07-14 by Sam Vance',{s:6.5,f:INK3})
  + pill(150,74,52,14,'purge-eligible in 12d',PAPER,AMBER,{s2:5,s:AMBER,sw:.6})
  + pill(208,74,32,14,'↩ Restore',PAPER,GREEN,{s2:5.5,s:GREEN,sw:.7})
  + pill(244,74,40,14,'🗑 Forever',PAPER,RED,{s2:5.5,s:RED,sw:.7})
  + t(16,116,'Deleting a project is reversible.',{s:8,w:700,f:INK})
  + t(16,132,'It moves to the Deleted view with everything intact.',{s:7,f:INK2})
  + t(16,146,'Anyone can restore it.',{s:7,f:INK2})
  + t(16,160,'After 90 days an administrator may clear it out',{s:7,f:INK2})
  + t(16,174,'for good — until then it is still recoverable.',{s:7,f:INK2})
);

/* — opening a project — */
ART.openproj = svg(300,190,
  boardRow(10,{num:'8801.02',client:'Northgate Logistics',name:'Distribution Centre',tools:['frt','dfp'],stamp:'📥 Jul 12',who:C.you})
  + '<path d="M150,50 v12 m-4,-4 l4,4 l4,-4" stroke="'+INK3+'" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
  + r(16,68,268,108,{rx:7,f:PAPER,s:EDGE})
  + t(28,86,'8801.02  Distribution Centre Sprinklers',{s:8.5,w:700,f:INK,max:244})
  + t(28,99,'Northgate Logistics · 1551 Caterpillar Rd',{s:6.5,f:INK3,max:244})
  + '<line x1="28" y1="106" x2="272" y2="106" stroke="'+LINE+'"/>'
  + t(28,120,'TOOLS &amp; REPORTS',{s:6,w:700,f:INK3})
  + r(28,126,244,22,{rx:5,f:SOFT,s:EDGE})
  + pill(34,131,16,11,'FRT',TOOLC.frt,'#fff',{s2:5.5})
  + t(56,140,'Field Review #1 · You · DRAFT',{s:6.5,f:INK2,max:150})
  + pill(212,131,54,11,'＋ New Report',PAPER,BURG,{s2:5.5,s:BURG,sw:.6})
  + r(28,152,244,20,{rx:5,f:SOFT,s:EDGE})
  + pill(34,156,16,11,'DFP',TOOLC.dfp,'#fff',{s2:5.5})
  + t(56,166,'Diesel Pump #1 · Dana Whitlow · ISSUED',{s:6.5,f:INK2,max:210})
);

/* ── compact 66×66 art: small pieces of the real screen, not generic icons ── */
function ic(inner){return '<svg viewBox="0 0 66 66" xmlns="http://www.w3.org/2000/svg">'+
  r(0,0,66,66,{rx:12,f:SOFT,s:EDGE})+inner+'</svg>';}
ART.search = ic(r(10,20,46,12,{rx:6,f:PAPER,s:EDGE})+t(16,29,'🔍 8801',{s:6,f:INK3})
  + r(10,36,46,8,{rx:4,f:PAPER,s:EDGE})+r(10,47,30,8,{rx:4,f:PAPER,s:EDGE}));
ART.views = ic(pill(8,20,22,11,'Active',NAVY,'#fff',{s2:5})+pill(32,20,26,11,'Archived',PAPER,INK2,{s2:5,s:EDGE})
  + pill(8,36,22,11,'Deleted',PAPER,INK3,{s2:5,s:EDGE})+t(36,45,'views,',{s:5.5,f:INK3})+t(36,53,'not actions',{s:5.5,f:INK3}));
ART.viewsort = ic(pill(8,18,24,11,'▤ Cards',NAVY,'#fff',{s2:5})+pill(34,18,24,11,'☰ List',PAPER,INK2,{s2:5,s:EDGE})
  + r(8,34,50,10,{rx:5,f:PAPER,s:EDGE})+t(12,42,'Sort: Backup ▾',{s:5,f:INK2})
  + r(8,48,50,8,{rx:4,f:PAPER,s:EDGE}));
ART.bands = ic(r(8,16,32,9,{rx:4,f:PAPER,s:EDGE})+t(24,23,'8000–8999',{s:4.5,w:700,f:INK2,a:'middle',mono:true})
  + r(8,28,50,7,{rx:3,f:PAPER,s:EDGE})+r(8,37,50,7,{rx:3,f:PAPER,s:EDGE})
  + r(8,48,32,9,{rx:4,f:PAPER,s:EDGE})+t(24,55,'9000–9999',{s:4.5,w:700,f:INK2,a:'middle',mono:true}));
ART.theme = ic('<circle cx="24" cy="33" r="8" fill="'+AMBER+'"/>'
  + '<path d="M46,25 a9,9 0 1 0 6,15 a10,10 0 0 1 -6,-15 z" fill="'+NAVY+'"/>');
ART.portal = ic(pill(10,16,20,10,'FRT',TOOLC.frt,'#fff',{s2:5})+pill(34,16,20,10,'DFP',TOOLC.dfp,'#fff',{s2:5})
  + pill(10,30,20,10,'EFP',TOOLC.efp,'#fff',{s2:5})+pill(34,30,20,10,'IST',TOOLC.ist,'#fff',{s2:5})
  + pill(10,44,20,10,'OBC',TOOLC.obc,'#fff',{s2:5})+pill(34,44,20,10,'DD',TOOLC.dd,'#fff',{s2:5}));
ART.pin = ic('<rect x="22" y="30" width="22" height="18" rx="3" fill="'+PAPER+'" stroke="'+INK2+'" stroke-width="1.6"/>'
  + '<path d="M27,30 v-5 a6,6 0 0 1 12,0 v5" fill="none" stroke="'+INK2+'" stroke-width="1.6"/>'
  + '<circle cx="33" cy="39" r="2.4" fill="'+BURG+'"/>');
ART.r2 = ic('<path d="M20,38 a8,8 0 0 1 0,-16 a11,11 0 0 1 21,3 a7,7 0 0 1 -1,13 z" fill="#EDE9F2" stroke="'+INK2+'" stroke-width="1.2"/>'
  + r(18,44,30,7,{rx:3,f:'#EFEFF3'}) + r(18,44,19,7,{rx:3,f:BLUE})
  + t(33,58,'unused files',{s:5,f:INK3,a:'middle'}));
ART.users = ic('<circle cx="24" cy="26" r="7" fill="#EDE9F2" stroke="'+INK2+'"/>'
  + '<path d="M13,44 a11,9 0 0 1 22,0 z" fill="#EDE9F2" stroke="'+INK2+'"/>'
  + r(38,22,20,9,{rx:3,f:PAPER,s:EDGE})+t(48,29,'9971.00',{s:4.5,f:INK2,a:'middle',mono:true})
  + r(38,34,20,9,{rx:3,f:PAPER,s:EDGE})+t(48,41,'DW',{s:5,w:700,f:INK2,a:'middle'}));
ART.header = ic(r(6,16,54,14,{rx:5,f:NAVY})
  + '<circle cx="16" cy="23" r="4" fill="rgba(255,255,255,.18)"/>'
  + '<circle cx="27" cy="23" r="4" fill="rgba(255,255,255,.18)"/>'
  + '<circle cx="38" cy="23" r="4" fill="rgba(255,255,255,.18)"/>'
  + '<circle cx="49" cy="23" r="4" fill="'+AMBER+'"/><text x="49" y="26" font-family="Calibri" font-size="6" font-weight="700" fill="#1B1A22" text-anchor="middle">?</text>'
  + r(6,36,54,20,{rx:5,f:PAPER,s:EDGE})+t(12,48,'Insights · Tools',{s:5.5,f:INK2})+t(12,55,'☀/☾ · Lock · Sign out',{s:5.5,f:INK2}));
ART.tabs = ic(r(8,16,50,16,{rx:4,f:PAPER,s:EDGE})+t(13,26,'FRT #1',{s:5.5,f:INK2})
  + r(8,34,50,16,{rx:4,f:PAPER,s:EDGE,sd:'3,2'})+t(13,44,'FRT #1 again',{s:5.5,f:RED})
  + '<path d="M52,42 l6,-6 m0,6 l-6,-6" stroke="'+RED+'" stroke-width="1.6"/>');
ART.qr = ic(r(14,14,12,12,{rx:2,f:'none',s:INK,sw:2.2})+r(40,14,12,12,{rx:2,f:'none',s:INK,sw:2.2})
  + r(14,40,12,12,{rx:2,f:'none',s:INK,sw:2.2})+r(41,41,4,4,{rx:0,f:INK})+r(48,48,4,4,{rx:0,f:INK}));

/* ════════════════════════════════════════════════════════════════════════
   CARDS — task style: verb titles, steps in order.
   Existing ids and search terms preserved; new cards fill the gaps.
   ════════════════════════════════════════════════════════════════════════ */
/* ── art for the three cards that live on the HUB PAGE scope ───────────────
   These three (Tools & Reports, one tab per report, Deleted Reports) are filed
   under the Hub page, not the Dashboard. Their drawings are redrawn here with
   the invented cast only — the previous versions carried real staff names and
   real project numbers. Their wording is untouched; the Hub-page guide gets its
   own task-style pass next. */
ART.toolsrep = svg(300,190,
  r(16,12,268,166,{rx:7,f:PAPER,s:EDGE})
  + t(28,30,'8801.02  Distribution Centre Sprinklers',{s:8.5,w:700,f:INK,max:244})
  + '<line x1="28" y1="38" x2="272" y2="38" stroke="'+LINE+'"/>'
  + t(28,52,'TOOLS &amp; REPORTS',{s:6,w:700,f:INK3})
  + r(28,58,244,40,{rx:5,f:SOFT,s:EDGE})
  + pill(34,63,16,11,'FRT',TOOLC.frt,'#fff',{s2:5.5})
  + t(56,72,'Field Review #1 · You · DRAFT',{s:6.5,f:INK2,max:150})
  + pill(212,63,54,11,'＋ New Report',PAPER,BURG,{s2:5.5,s:BURG,sw:.6})
  + pill(34,80,16,11,'FRT',TOOLC.frt,'#fff',{s2:5.5})
  + t(56,89,'Field Review #2 · Dana Whitlow · ISSUED',{s:6.5,f:INK2,max:200})
  + r(28,104,244,24,{rx:5,f:SOFT,s:EDGE})
  + pill(34,110,16,11,'DFP',TOOLC.dfp,'#fff',{s2:5.5})
  + t(56,119,'Diesel Pump #1 · Paul Ferris · DRAFT',{s:6.5,f:INK2,max:200})
  + t(28,146,'TOOL ACTIVATION',{s:6,w:700,f:INK3})
  + r(28,152,244,18,{rx:5,f:PAPER,s:EDGE})
  + pill(34,156,16,10,'EFP',TOOLC.efp,'#fff',{s2:5})
  + pill(53,156,16,10,'IST',TOOLC.ist,'#fff',{s2:5})
  + pill(72,156,16,10,'OBC',TOOLC.obc,'#fff',{s2:5})
  + t(96,164,'switch a tool on to start reports with it',{s:6,f:INK3,max:170})
);
ART.trash = svg(300,190,
  t(16,20,'🗑 DELETED REPORTS',{s:6.5,w:700,f:INK3})
  + r(16,26,268,42,{rx:6,f:PAPER,s:EDGE}) + r(16,26,3.5,42,{rx:2,f:AMBER})
  + t(30,44,'Field Review Report #2',{s:8,w:700,f:INK,max:180})
  + t(30,58,'Deleted 2026-07-14 by Sam Vance · 25 noted',{s:6.5,f:INK3,max:180})
  + pill(214,38,60,15,'↩ Restore',PAPER,GREEN,{s2:6,s:GREEN,sw:.7})
  + r(16,76,268,42,{rx:6,f:PAPER,s:EDGE}) + r(16,76,3.5,42,{rx:2,f:RED})
  + t(30,94,'Diesel Pump Report #1',{s:8,w:700,f:INK,max:180})
  + t(30,108,'Deleted 2026-04-02 by Dana Whitlow',{s:6.5,f:INK3,max:180})
  + pill(214,88,60,15,'↩ Restore',PAPER,GREEN,{s2:6,s:GREEN,sw:.7})
  + t(16,140,'Deleting a report moves it here — nothing is destroyed.',{s:7,f:INK2,max:262})
  + t(16,154,'Anyone can restore it. Only an administrator can',{s:7,f:INK2,max:262})
  + t(16,168,'clear it for good, and only after 90 days.',{s:7,f:INK2,max:262})
);
ART.tabs = ic(r(8,14,50,16,{rx:4,f:PAPER,s:EDGE})+t(13,24,'FRT #1',{s:5.5,f:INK2,max:42})
  + r(8,34,50,16,{rx:4,f:PAPER,s:EDGE,sd:'3,2'})+t(13,44,'FRT #1 again',{s:5.5,f:RED,max:34})
  + '<path d="M50,40 l6,-6 m0,6 l-6,-6" stroke="'+RED+'" stroke-width="1.6"/>');

/* ════════════════════════════════════════════════════════════════════════
   CARDS — task style (S509, Mark): every title is a job, every card is steps
   in order. Existing card ids, search terms and dates are carried over
   VERBATIM — the terms are the proven plain-language search vocabulary and
   the dates drive What's New and the unseen dot. New cards fill the features
   the old 13-card set never covered; they carry older dates deliberately so
   long-standing features do not flood What's New.

   The three ids filed under _HUBPAGE_IDS below (tools-reports, one-tab,
   deleted-reports) belong to the HUB PAGE scope and keep their existing
   wording; only their drawings were redrawn to remove real data.
   ════════════════════════════════════════════════════════════════════════ */
var CARDS = [

/* ═══ PROJECTS BOARD ═══ */
{
  id:'read-a-row', area:'Projects board', date:'2026-05-20',
  title:'Read a project row at a glance',
  pts:['<b>Star</b> is yours alone. <b>Number</b> and <b>name</b> are what every report prints on its cover.',
       'The coloured pills show which tools are switched on for that project.',
       'The backup stamp tints with age: quiet under 30 days, amber past 30, red past 90 or never.',
       'The circle on the right is the project manager’s initials. 📦 exports; 🗑 moves to the bin.'],
  chips:[['Everyone','c-where']],
  terms:'row card columns what does this mean read understand anatomy pills colours initials circle who is this stamp date under project meaning legend',
  art:ART.row
},
{
  id:'new-project', area:'Projects board', date:'2026-06-15',
  title:'Create a project',
  pts:['<b>+ New Project</b>, then type the number — the box suggests the <b>clients already used</b> in that series.',
       'The client field matches every client on record as you type, so spelling stays consistent.',
       'Number and name are required; client, address and manager can be filled in later.',
       'A number already in use is blocked at creation — one number, one project.'],
  chips:[['Everyone','c-where']],
  terms:'new project create project add project start make project set up client suggestion autocomplete number series project manager who owns',
  art:ART.newproj
},
{
  id:'open-project', area:'Projects board', date:'2026-05-18',
  title:'Open a project and reach its reports',
  pts:['Click anywhere on the row to open the project’s own page.',
       'Its reports are grouped by tool, newest first, with who wrote each one and its state.',
       '<b>＋ New Report</b> inside a tool’s group starts another report of that kind.',
       'A project can hold several reports per tool — a second visit does not need a second project.'],
  chips:[['Everyone','c-where']],
  terms:'open project click project where are my reports get into project go to project page find report inside project start work',
  art:ART.openproj
},
{
  id:'star-archive', area:'Projects board', date:'2026-06-20',
  title:'Star a project · file a finished one',
  pts:['Tap ☆ to star. Starred projects rise to the top of <b>your</b> board and nobody else’s.',
       'Archive when a job is finished — it leaves the Active board with everything intact.',
       'Use the Archived view to find it again, and Restore to bring it back.'],
  chips:[['Everyone','c-where']],
  terms:'star favourite favorite pin top bookmark important archive hide old finished complete done file away put away tidy clean board too many projects',
  art:ART.star
},
{
  id:'select-mode', area:'Projects board', date:'2026-06-18',
  title:'Act on several projects at once',
  pts:['Tap <b>☑ Select</b>, then tick the projects you want.',
       'Quick-pick buttons: All, ⭐ Starred, or <b>⚠ Not backed up</b> — that last one ticks every project never exported.',
       'Then act on the lot: star, archive, export, or move to the bin.',
       '📥 Export backs up every ticked project in one go — the fastest way to clear backup warnings.'],
  chips:[['Everyone','c-where']],
  terms:'select multiple bulk batch many at once mass tick check several all of them everything together group action',
  art:ART.select
},
{
  id:'duplicate-chip', area:'Projects board', date:'2026-07-05',
  title:'Sort out two projects sharing a number',
  pts:['If a number appears twice, the one created <b>second</b> carries an amber <b>Duplicate</b> chip.',
       'The first one is treated as the original — that is where the work should live.',
       'Move the work into the original by starting a <b>New Report</b> inside it, then archive or delete the duplicate.'],
  chips:[['Everyone','c-where']],
  terms:'duplicate same number twice two projects repeated number copy double entered again clash conflict number already exists',
  art:ART.dup
},
{
  id:'client-corrections', area:'Projects board', date:'2026-07-23', isNew:true,
  title:'Correct a client name across the firm',
  pts:['Rename a client on your project as usual — <b>everyone else keeps theirs</b> until they agree.',
       'They get a small card in the corner: <b>Accept</b>, <b>Review</b> or <b>Decline</b>.',
       'Review lets them accept it on some projects and leave others alone.',
       'This is why one client can never be silently renamed on somebody else’s job.'],
  chips:[['New','c-new'],['Everyone','c-where']],
  terms:'rename client change client name correction request someone changed my client approve accept decline notification suggest permission ask',
  art:ART.crn
},
{
  id:'delete-restore', area:'Projects board', date:'2026-05-15',
  title:'Delete a project — and get it back',
  pts:['🗑 on the row moves a project to the <b>Deleted</b> view. Nothing is destroyed.',
       'Everything comes with it — reports, photos, drawings.',
       'Anyone can <b>Restore</b> it from the Deleted view.',
       'After 90 days it becomes eligible for an administrator to clear permanently; until they do, it is still recoverable.'],
  chips:[['Everyone','c-where']],
  terms:'delete project remove project trash bin deleted gone by mistake restore project bring back recover undo purge forever permanent',
  art:ART.delrestore
},

/* ═══ BACKUPS & EXPORT ═══ */
{
  id:'backups', area:'Backups & export', date:'2026-07-10',
  title:'Spot a project that needs backing up',
  pts:['The stamp under each project is <b>when it was last exported</b>.',
       'Under 30 days it stays quiet. Past 30 it turns amber. Past 90 — or never exported — it turns red.',
       '<b>⚠ Not backed up</b> means no copy of that project has ever left the system.',
       'Sort: Backup needed brings the worst to the top; Select mode can tick them all at once.'],
  chips:[['Everyone','c-where']],
  terms:'backup back up save export protect copy download safe lost data old stale age never exported red amber warning colour risk losing',
  art:ART.backup
},
{
  id:'export-docs', area:'Backups & export', date:'2026-07-08',
  title:'Export a whole project as one ZIP',
  pts:['The <b>📦</b> button on any project builds one ZIP: every report as PDF, every photo, every drawing, the project data and a README.',
       'It is the copy you can hand to a client, keep offline, or file away.',
       'Exporting is also what <b>marks the project as backed up</b> and clears the warning.',
       'Several projects at once: Select mode, then 📥 Export.'],
  chips:[['Everyone','c-where']],
  terms:'export zip download bundle package send to client give to client all photos drawings archive copy off take with me offline share email deliver',
  art:ART.export
},

/* ═══ ADMIN ═══ */
{
  id:'review-client-names', area:'Admin', date:'2026-07-24', isNew:true,
  title:'Clean up a client spelled several ways',
  pts:['Admin panel → <b>Review Client Names</b> finds one client spelled two or three ways inside the same number series.',
       'It lists the real projects and their exact spellings before anything changes.',
       'Fix this series applies your choice; your own projects change immediately.',
       'Projects managed by someone else generate a request they can accept or decline.'],
  chips:[['New','c-new'],['Admin panel','c-where']],
  terms:'client name wrong spelling misspelled typo spelt inconsistent same client different name fix clean up clients variations series conflict mismatch',
  art:ART.rcn
},
{
  id:'r2-reclaim', area:'Admin', date:'2026-07-18',
  title:'Reclaim storage from unused photo files',
  pts:['Shows the nightly list of <b>photo files no longer referenced</b> by any report.',
       'An administrator can permanently reclaim exactly that list.',
       'Nothing outside the listed files is touched — this never reaches a photo a report still uses.'],
  chips:[['Admin only','c-admin']],
  terms:'storage space full disk usage photos cost cleanup purge reclaim orphan unused files R2 cloud size expensive bill',
  art:ART.r2, compact:true
},
{
  id:'admin-users', area:'Admin', date:'2026-05-10',
  title:'Add a person and set their number and initials',
  pts:['Admin panel → create the account, then set the person’s <b>firm number</b> and <b>initials</b>.',
       'Initials drive the circle on every project row and the names shown in Insights.',
       'A person with no initials set shows a dash — set them when you create the account.'],
  chips:[['Admin only','c-admin']],
  terms:'add user new staff member account create login invite person initials avatar circle user number firm number who is this letters set up someone',
  art:ART.users, compact:true
},

/* ═══ GETTING AROUND ═══ */
{
  id:'dash-orient', area:'Getting around', date:'2026-05-25',
  title:'Find your way around the Dashboard',
  pts:['This page lists <b>every project</b> you have access to. One row (or card) is one project.',
       'Top row: search, whose projects, which state, cards-or-list, sort, Select, + New Project.',
       'Under that: how many projects are active and how many have never been backed up.',
       'Click any project to open its own page, where its reports live.'],
  chips:[['Everyone','c-where']],
  terms:'dashboard board home page lost confused where am i what is this page overview start here first time new user getting started layout',
  art:ART.board
},
{
  id:'find-project', area:'Getting around', date:'2026-05-24',
  title:'Find one project fast',
  pts:['Type any part of the <b>number, name or client</b> in the search box — the board narrows as you type.',
       'My Projects / All Projects switches between the ones you manage and the whole firm.',
       'Still too many? Sort by Project #, Client, Last Updated or Backup needed.'],
  chips:[['Everyone','c-where']],
  terms:'search find project cant find looking for where is my project filter my projects all projects sort order too many projects locate',
  art:ART.search, compact:true
},
{
  id:'board-views', area:'Getting around', date:'2026-05-23',
  title:'Switch between Active, Archived and Deleted',
  pts:['These three are <b>views, not actions</b> — they change which projects the board shows.',
       '<b>Active</b> is the daily board. <b>Archived</b> holds finished work. <b>Deleted</b> is the recovery bin.',
       'If a project “disappeared”, check Archived first, then Deleted — it is almost never gone.'],
  chips:[['Everyone','c-where']],
  terms:'active archived deleted view missing project disappeared gone vanished cant see project where did it go old projects finished hidden',
  art:ART.views, compact:true
},
{
  id:'view-sort', area:'Getting around', date:'2026-05-22',
  title:'Choose cards or list, and sort the board',
  pts:['<b>Cards</b> shows fewer projects with more room; <b>List</b> shows many in aligned columns.',
       'Your choice sticks per device — your desktop and your tablet can differ.',
       'Sort: Backup needed pulls the projects most at risk to the top.'],
  chips:[['Everyone','c-where']],
  terms:'cards list view layout compact rows columns sort order arrange by number client updated backup change how it looks display',
  art:ART.viewsort, compact:true
},
{
  id:'bands', area:'Getting around', date:'2026-05-21',
  title:'Read the number bands',
  pts:['Projects are grouped into <b>thousand bands</b> — 8000–8999, 9000–9999 and so on.',
       'That is the firm’s filing order, so the board matches how jobs are numbered.',
       'Tap a band header to fold that whole group away.'],
  chips:[['Everyone','c-where']],
  terms:'bands groups headings 1000 series thousand grouping why are projects grouped collapse fold sections filing order numbering',
  art:ART.bands, compact:true
},
{
  id:'insights', area:'Getting around', date:'2026-07-21', isNew:true,
  title:'Check backup coverage and who is carrying what',
  pts:['Open <b>Insights</b> from the top bar.',
       'Backup coverage splits every active project into fresh, 30 days, 60 days, and 90-plus-or-never.',
       'Active projects per person shows the workload spread across the team.',
       'The flagged lists name the projects needing a backup and who manages each one.'],
  chips:[['New','c-new'],['Dashboard','c-where']],
  terms:'statistics stats numbers dashboard how many coverage who has workload chart graph metrics overview summary report card team load busy',
  art:ART.insights
},
{
  id:'theme', area:'Getting around', date:'2026-06-10',
  title:'Switch between light and dark',
  pts:['The ☀ / ☾ button in the top bar switches the whole Hub.',
       'It sticks per device, so your tablet and your desktop can be set differently.',
       'Field tools open light by default — dark screens wash out in daylight.'],
  chips:[['Everyone','c-where']],
  terms:'dark light night mode theme bright screen too bright dim eyes hurt sun glare outside cant see daylight black white switch appearance',
  art:ART.theme, compact:true
},
{
  id:'tools-portal', area:'Getting around', date:'2026-06-05',
  title:'Open another ARENCON tool',
  pts:['The <b>Tools</b> button lists every tool by category.',
       'Field Review, Diesel and Electric pump commissioning, IST, OBC, DD checklist — all from one place.',
       'To work on a specific project, open the project first and start the report from inside it.'],
  chips:[['Everyone','c-where']],
  terms:'tools apps other tools list of tools where is FRT diesel electric IST OBC checklist find tool open tool launcher portal menu everything',
  art:ART.portal, compact:true
},
{
  id:'pin-lock', area:'Getting around', date:'2026-06-01',
  title:'Lock the screen when you step away',
  pts:['Lock closes the screen <b>without signing you out</b>.',
       'Your session stays alive, so nothing you were doing is lost.',
       'Use it instead of signing out when you are leaving the desk for a few minutes.'],
  chips:[['Everyone','c-where']],
  terms:'lock pin security leave desk privacy step away screen lock protect shoulder someone looking away from computer',
  art:ART.pin, compact:true
},
{
  id:'header-tour', area:'Getting around', date:'2026-05-19',
  title:'Know what the top-bar buttons do',
  pts:['<b>Insights</b> — the numbers behind the board. <b>?</b> — this guide.',
       '<b>Tools</b> — every other ARENCON tool. <b>☀/☾</b> — light or dark.',
       'An amber dot on the <b>?</b> means something new has been written since you last looked.',
       'On a narrow screen these fold into the drawer menu — nothing is lost.'],
  chips:[['Everyone','c-where']],
  terms:'header top bar buttons icons what does this button do question mark help amber dot menu drawer hamburger three lines missing buttons',
  art:ART.header, compact:true
},

/* ═══ HUB PAGE scope (filed by _HUBPAGE_IDS below) — wording unchanged ═══ */
{
  id:'deleted-reports', area:'Reports', date:'2026-07-15',
  title:'Recover a deleted report',
  pts:['Deleting a report is <b>reversible</b> — it moves to the Deleted Reports section at the bottom of this page.',
       'Open that section and tap <b>↩ Restore</b> — the report returns with every photo and deficiency intact.',
       'Only an administrator can clear one for good, and only after 90 days.'],
  chips:[['Everyone','c-where']],
  terms:'deleted disappeared gone missing lost recover restore undo undelete trash recycle bin accidentally removed vanished cant find my report where did it go oops mistake',
  art:ART.trash
},
{
  id:'one-tab', area:'Reports', date:'2026-07-02',
  title:'Avoid two tabs on one report',
  pts:['Opening a report that is already open <b>focuses the existing tab</b> instead of making a second one.',
       'That is protection, not a limitation: two tabs on one report silently overwrite each other’s work.',
       'If you deliberately want a second window, Ctrl+click.'],
  chips:[['Everyone','c-where']],
  terms:'two tabs opened twice overwrite lost work my changes vanished someone overwrote conflict same report open twice duplicate window lost edits disappeared typing',
  art:ART.tabs, compact:true
},
{
  id:'tools-reports', area:'Reports', date:'2026-06-28',
  title:'Start a report — or another one',
  pts:['<b>Tools &amp; Reports</b> lists this project’s reports grouped by tool, with who wrote each and its state.',
       '<b>＋ New Report</b> inside a tool’s group starts another report of that kind — one project holds several per tool.',
       'A tool with no group yet is switched on in the Tool Activation row underneath.'],
  chips:[['Everyone','c-where']],
  terms:'new report create report add report start report tool activation turn on tool enable FRT diesel where do i make a report second report another report',
  art:ART.toolsrep
}
];

/* ═══ HUB PAGE cards — task-style rebuild (S510, Mark) ════════════════════════
   "Hub page" is Mark's term for the per-project page you land on after clicking
   a project; "Dashboard" is the page listing ALL projects. NEVER swap the terms.
   One panel = one scope, never mixed (S505f standing rule).

   S510: same treatment the Dashboard got in S509 — verb titles, ordered steps,
   drawings that replicate the REAL project page (Project Info card, Tools &
   Reports, Project Photos with its filters, Cloud Storage, the action row, QR,
   Fold All). All names/numbers are the invented cast in C above — no real data.
   Existing ids, search terms and dates carried over verbatim. ═════════════════ */

/* — whole page, for orientation — */
ART.hpPage = svg(300,190,
  pill(16,10,74,13,'← Back to Dashboard',PAPER,INK2,{s2:5.5,s:EDGE})
  + t(16,38,'8801.02 — Distribution Centre Sprinklers',{s:9.5,w:700,f:INK,max:230})
  + t(252,38,'☆',{s:11,f:INK3})
  + t(16,51,'Northgate Logistics · created May 2026',{s:6.5,f:INK3,max:190})
  + pill(230,42,54,12,'▼ Fold All',PAPER,INK3,{s2:5.5,s:EDGE})
  + r(16,60,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,73,'📋 Project Info',{s:7,w:700,f:INK})
    + pill(196,64,58,12,'✏️ Edit Project',PAPER,INK2,{s2:5.5,s:EDGE}) + t(276,73,'▾',{s:7,f:INK3})
  + r(16,84,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,97,'🚀 Tools &amp; Reports',{s:7,w:700,f:INK}) + t(276,97,'▾',{s:7,f:INK3})
  + r(16,108,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,121,'📸 Project Photos',{s:7,w:700,f:INK}) + t(276,121,'▾',{s:7,f:INK3})
  + r(16,132,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,145,'☁️ Cloud Storage',{s:7,w:700,f:INK}) + t(276,145,'▾',{s:7,f:INK3})
  + pill(16,162,30,13,'📱 QR',PAPER,INK2,{s2:5.5,s:EDGE})
  + pill(50,162,44,13,'📦 Archive',PAPER,AMBER,{s2:5.5,s:AMBER,sw:.6})
  + pill(216,162,68,13,'🗑️ Delete Project',PAPER,RED,{s2:5.5,s:RED,sw:.6})
);

/* — project info card with Edit Project — */
ART.hpInfo = svg(300,190,
  r(16,14,268,110,{rx:6,f:PAPER,s:EDGE})
  + t(28,32,'📋 Project Info',{s:8.5,w:700,f:INK})
  + pill(190,22,64,14,'✏️ Edit Project',PAPER,INK2,{s2:6,s:EDGE})
  + '<line x1="28" y1="42" x2="272" y2="42" stroke="'+LINE+'"/>'
  + t(28,58,'CLIENT',{s:5.5,w:700,f:INK3}) + t(28,70,'Northgate Logistics',{s:7.5,f:INK,max:110})
  + t(158,58,'ADDRESS',{s:5.5,w:700,f:INK3}) + t(158,70,'41 Harbourfield Rd',{s:7.5,f:INK,max:110})
  + t(28,90,'PROJECT MANAGER',{s:5.5,w:700,f:INK3}) + avatar(36,102,C.dana) + t(50,105,'Dana Whitlow',{s:7.5,f:INK,max:90})
  + t(158,90,'STATUS',{s:5.5,w:700,f:INK3}) + pill(158,95,34,13,'Active','#DCF1E8',GREEN,{s2:6})
  + t(16,146,'The number and name in the page title are what',{s:7,f:INK2,max:262})
  + t(16,160,'every report prints on its cover.',{s:7,f:INK2,max:262})
  + t(16,174,'Changes here apply to the project everywhere.',{s:7,f:INK2,max:262})
);

/* — project photos with filters + download — */
ART.hpPhotos = svg(300,190,
  r(16,12,268,166,{rx:7,f:PAPER,s:EDGE})
  + t(28,30,'📸 Project Photos',{s:8.5,w:700,f:INK})
  + pill(28,38,22,12,'All',NAVY,'#fff',{s2:5.5})
  + pill(52,38,24,12,'Site',PAPER,INK2,{s2:5.5,s:EDGE})
  + pill(78,38,42,12,'Deficiency',PAPER,INK2,{s2:5.5,s:EDGE})
  + pill(128,38,48,12,'☑ Select All',PAPER,INK2,{s2:5.5,s:EDGE})
  + pill(182,38,58,12,'⬇ Download all',PAPER,'#1F7373',{s2:5.5,s:'#2E8C8C',sw:.7})
  + r(28,58,56,42,{rx:4,f:SOFT,s:EDGE}) + '<circle cx="56" cy="79" r="8" fill="none" stroke="'+INK2+'" stroke-width="1.4"/>'
  + r(90,58,56,42,{rx:4,f:SOFT,s:EDGE}) + '<path d="M118,88 C118,88 112,80 112,75 a6,6 0 0 1 12,0 C124,80 118,88 118,88 z" fill="'+RED+'"/>'
  + r(152,58,56,42,{rx:4,f:SOFT,s:EDGE}) + '<circle cx="180" cy="79" r="8" fill="none" stroke="'+INK2+'" stroke-width="1.4"/>'
  + r(214,58,56,42,{rx:4,f:SOFT,s:EDGE}) + '<path d="M242,88 C242,88 236,80 236,75 a6,6 0 0 1 12,0 C248,80 242,88 242,88 z" fill="'+RED+'"/>'
  + t(28,116,'Every photo from every report on this project,',{s:7,f:INK2,max:244})
  + t(28,130,'in one place. Filter Site vs Deficiency.',{s:7,f:INK2,max:244})
  + t(28,146,'Download all builds a client-ready package.',{s:7,f:INK2,max:244})
  + t(28,162,'Empty? The reports have no photos yet, or they',{s:6.5,f:INK3,max:244})
  + t(28,174,'are still uploading from the field tablet.',{s:6.5,f:INK3,max:244})
);

/* — cloud storage — */
ART.hpStorage = svg(300,190,
  r(16,14,268,96,{rx:6,f:PAPER,s:EDGE})
  + t(28,32,'☁️ Cloud Storage',{s:8.5,w:700,f:INK})
  + t(28,52,'PHOTOS',{s:5.5,w:700,f:INK3}) + t(28,66,'48 files · 214 MB',{s:8,f:INK,max:110})
  + t(158,52,'DRAWINGS',{s:5.5,w:700,f:INK3}) + t(158,66,'6 files · 92 MB',{s:8,f:INK,max:110})
  + r(28,76,244,9,{rx:4,f:'#EFEFF3'}) + r(28,76,150,9,{rx:4,f:BLUE})
  + pill(28,92,50,13,'🔄 Refresh',PAPER,INK2,{s2:6,s:EDGE})
  + t(16,132,'Shows how much space this project uses in the cloud.',{s:7,f:INK2,max:262})
  + t(16,146,'The number is a snapshot — Refresh re-reads it live.',{s:7,f:INK2,max:262})
  + t(16,160,'Useful for checking a big photo set from the field',{s:7,f:INK2,max:262})
  + t(16,174,'actually landed.',{s:7,f:INK2,max:262})
);

/* — archive / delete / restore action row — */
ART.hpActions = svg(300,190,
  r(16,14,268,32,{rx:6,f:PAPER,s:EDGE})
  + pill(24,22,32,16,'📱 QR',PAPER,INK2,{s2:6,s:EDGE})
  + pill(60,22,50,16,'📦 Archive',PAPER,AMBER,{s2:6,s:AMBER,sw:.7})
  + pill(196,22,80,16,'🗑️ Delete Project',PAPER,RED,{s2:6,s:RED,sw:.7})
  + t(16,66,'ARCHIVE',{s:6.5,w:700,f:AMBER})
  + t(16,80,'Files a finished project off the Active board.',{s:7,f:INK2,max:262})
  + t(16,93,'Everything stays; Restore brings it back.',{s:7,f:INK2,max:262})
  + t(16,114,'DELETE',{s:6.5,w:700,f:RED})
  + t(16,128,'Reversible — the project moves to the Dashboard’s',{s:7,f:INK2,max:262})
  + t(16,141,'Deleted view and anyone can restore it.',{s:7,f:INK2,max:262})
  + t(16,162,'Delete Forever is permanent, administrators only,',{s:7,f:INK2,max:262})
  + t(16,175,'and only offered after 90 days in the bin.',{s:7,f:INK2,max:262})
);

/* — QR to a tablet — */
ART.hpQr = svg(300,190,
  r(86,12,128,128,{rx:8,f:PAPER,s:EDGE})
  + t(150,32,'Open on Mobile',{s:8.5,w:700,f:INK,a:'middle'})
  + r(118,42,64,64,{rx:4,f:'none',s:INK,sw:1.4})
  + r(126,50,14,14,{rx:2,f:'none',s:INK,sw:2.2}) + r(160,50,14,14,{rx:2,f:'none',s:INK,sw:2.2})
  + r(126,84,14,14,{rx:2,f:'none',s:INK,sw:2.2}) + r(162,86,5,5,{rx:0,f:INK}) + r(154,92,5,5,{rx:0,f:INK})
  + r(146,70,8,8,{rx:0,f:INK})
  + t(150,124,'8801.02 · Distribution Centre',{s:6,f:INK3,a:'middle',max:120})
  + t(16,158,'Scan with a tablet camera to open THIS project',{s:7,f:INK2,max:262})
  + t(16,172,'on the device — no typing a project number.',{s:7,f:INK2,max:262})
);

/* — fold + back — */
ART.hpFold = svg(300,190,
  pill(16,12,74,13,'← Back to Dashboard',PAPER,INK2,{s2:5.5,s:EDGE})
  + pill(230,12,54,13,'▼ Fold All',PAPER,INK3,{s2:5.5,s:EDGE})
  + r(16,34,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,47,'📋 Project Info',{s:7,w:700,f:INK}) + t(276,47,'▸',{s:7,f:INK3})
  + r(16,58,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,71,'🚀 Tools &amp; Reports',{s:7,w:700,f:INK}) + t(276,71,'▾',{s:7,f:INK3})
  + r(16,82,268,28,{rx:5,f:SOFT,s:EDGE}) + t(26,99,'…open section content…',{s:6.5,f:INK3,max:220})
  + r(16,114,268,20,{rx:5,f:PAPER,s:EDGE}) + t(26,127,'📸 Project Photos',{s:7,w:700,f:INK}) + t(276,127,'▸',{s:7,f:INK3})
  + t(16,152,'Tap any section header to fold it; ▸ means folded.',{s:7,f:INK2,max:262})
  + t(16,166,'Fold All collapses the lot to see the whole page.',{s:7,f:INK2,max:262})
  + t(16,180,'★ beside the title stars this project.',{s:7,f:INK2,max:262})
);

var HUBPAGE_CARDS = [
{
  id:'hp-orient', area:'This project', date:'2026-05-26',
  title:'Find your way around a project’s page',
  pts:['This page is <b>one project</b>: its record, its reports, its photos, its storage.',
       'Sections top to bottom: Project Info, Tools &amp; Reports, Project Photos, Cloud Storage.',
       'The action row at the bottom holds QR, Archive and Delete.',
       '← Back to Dashboard returns to the full project list.'],
  chips:[['Everyone','c-where']],
  terms:'project page hub page what is this page overview lost where am i sections layout this project navigate around',
  art:ART.hpPage
},
{
  id:'hp-info', area:'This project', date:'2026-07-26',
  title:'Check and edit the project record',
  pts:['The <b>Project Info</b> card carries the client, address, manager and status.',
       '<b>✏️ Edit Project</b> sits in that card’s own header — changes apply to the project everywhere.',
       'The number and name in the page title are what every report prints on its cover.'],
  chips:[['Everyone','c-where']],
  terms:'project info client address edit project change details rename update record header card who is the client where do i edit',
  art:ART.hpInfo
},
{
  id:'hp-photos', area:'This project', date:'2026-07-26',
  title:'Browse and download every photo',
  pts:['<b>Project Photos</b> gathers every photo from every report on this project.',
       'Filter <b>Site</b> vs <b>Deficiency</b>; Select All then Download for a chosen set.',
       '<b>⬇ Download all</b> pulls the lot in one go — a ready client package.',
       'If it says none found, the reports have no photos yet or they are still uploading.'],
  chips:[['Everyone','c-where']],
  terms:'project photos gallery all photos download all bulk client package where are my pictures images none found empty',
  art:ART.hpPhotos
},
{
  id:'hp-storage', area:'This project', date:'2026-07-26',
  title:'Check this project’s cloud storage',
  pts:['<b>Cloud Storage</b> shows how much space this project’s photos and files use.',
       '<b>🔄 Refresh</b> re-reads it live — the number is a snapshot, not a running total.',
       'Use it to confirm a big photo set from the field actually landed.'],
  chips:[['Everyone','c-where']],
  terms:'cloud storage space used size r2 photos files refresh how big is this project sync check usage',
  art:ART.hpStorage
},
{
  id:'hp-actions', area:'This project', date:'2026-07-26',
  title:'Archive, delete or restore this project',
  pts:['<b>📦 Archive</b> files a finished project off the Active board — everything stays.',
       '<b>🗑️ Delete Project</b> is reversible: it moves to the Dashboard’s Deleted view.',
       'Anyone can restore either one. <b>Delete Forever</b> is permanent, administrators only, and only after 90 days.'],
  chips:[['Everyone','c-where']],
  terms:'archive delete project restore remove forever permanent trash finished closed put away bring back undo deleted recover',
  art:ART.hpActions
},
{
  id:'hp-qr', area:'This project', date:'2026-07-26',
  title:'Open this project on a tablet',
  pts:['<b>📱 QR</b> puts this project on screen as a code.',
       'Scan it with the tablet camera to open the same project there — no typing a number into a field device.',
       'It points at <b>this project</b>, not at a tool in general.'],
  chips:[['Everyone','c-where']],
  terms:'qr code scan open on tablet phone transfer project to device barcode send to field',
  art:ART.hpQr
},
{
  id:'hp-sections', area:'Getting around', date:'2026-07-26',
  title:'Fold the page and get back',
  pts:['Tap any <b>section header</b> to fold it — ▸ means folded, ▾ open. Handy on a tablet.',
       '<b>▼ Fold All</b> collapses everything so you can see the whole page at once.',
       '<b>← Back to Dashboard</b> returns to the project list; ★ beside the title stars this project.'],
  chips:[['Everyone','c-where']],
  terms:'fold unfold collapse expand sections tidy long page back to dashboard star favourite navigate scroll',
  art:ART.hpFold
}
];

var _HUBPAGE_IDS = { 'tools-reports':1, 'one-tab':1, 'deleted-reports':1 };
var _COMMON_IDS  = { 'theme':1, 'pin-lock':1, 'tools-portal':1 };

registerHelp({
  tool: 'Dashboard',
  areas: ['Projects board','Backups & export','Admin','Getting around'],
  cards: CARDS.filter(function(c){ return !_HUBPAGE_IDS[c.id]; })
});

registerHelp({
  tool: 'Hub page',
  areas: ['Reports','This project','Getting around'],
  cards: CARDS.filter(function(c){ return _HUBPAGE_IDS[c.id] || _COMMON_IDS[c.id]; })
              .concat(HUBPAGE_CARDS)
});
