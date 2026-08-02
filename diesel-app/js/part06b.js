/* ═══════════════════════════════════════════════════════════════════════════
   diesel-app/js/part06b.js — CONTINUATION OF part06.js (S559 split)
   ---------------------------------------------------------------------------
   part06 had grown to 9,601 lines and 547KB: five times the next largest file
   in the tool and the single hardest thing in the codebase to work in safely.
   It is now four files, cut at top-level boundaries ONLY.

   THIS IS ONE SCRIPT IN FOUR PIECES, NOT FOUR MODULES. They are plain scripts
   sharing one global scope, loaded in order b → c → d immediately after
   part06.js. Nothing was renamed, exported, wrapped or moved between pieces:
   joining these four files back together reproduces the original file BYTE FOR
   BYTE, which is how the split was proven before it was pushed.

   CONSEQUENCES, both worth knowing:
     - LOAD ORDER IN diesel-app/index.html IS LOAD-BEARING. Change it and
       functions vanish for whoever runs first.
     - the symbol gate compares ONE file against ONE file, so it sees this as a
       mass deletion from part06.js. That was declared at the time. When editing
       here, gate this file against its own previous version.
   ═══════════════════════════════════════════════════════════════════════════ */
function _dslVerdict(){
  var f=_dslVerdictFacts();
  var plural=function(c,one,many){ return c+' '+(c===1?one:many); };
  // advisory tail — named so the reader knows they exist, never part of the decision
  var aside='';
  var bits=[];
  if(f.recs) bits.push(plural(f.recs,'recommendation','recommendations'));
  if(f.records) bits.push(plural(f.records,'site record','site records'));
  if(bits.length) aside=' Also recorded for information (no effect on the result): '+bits.join(', ')+'.';
  var perfLine = !f.perfTotal ? 'No pump performance points have been scored.'
    : f.perfTotal===1 ? 'The pump performance point met the NFPA 20 acceptance criteria.'
    : 'All '+f.perfTotal+' pump performance points met the NFPA 20 acceptance criteria.';
  if(!f.anyResponse && !f.perfTotal && !f.outstanding && !f.recs && !f.records)
    return {status:'none',label:'',desc:'',banner:'',icon:''};
  if(f.tcc==='fail')
    return {status:'fail',icon:'\u2717',label:'FAIL',
      banner:'OVERALL: FAIL \u2014 Consultant recorded the test result as Fail',
      desc:'The consultant recorded the test result as Fail.'+aside};
  if(f.outstanding)
    return {status:'fail',icon:'\u2717',label:'FAIL',
      banner:'OVERALL: FAIL \u2014 '+plural(f.outstanding,'outstanding deficiency','outstanding deficiencies'),
      desc:plural(f.outstanding,'outstanding deficiency remains','outstanding deficiencies remain')+' open. All deficiencies must be addressed and closed before this report can pass.'+aside};
  if(f.perfMissed)
    return {status:'fail',icon:'\u2717',label:'FAIL',
      banner:'OVERALL: FAIL \u2014 '+f.perfMissed+' of '+f.perfTotal+' performance points did not meet the NFPA 20 criteria',
      desc:f.perfMissed+' of '+f.perfTotal+' pump performance points did not meet the NFPA 20 acceptance criteria (churn \u2264 140%, rated \u2265 100%, 150% \u2265 65% of rated net).'+aside};
  // S509b (Mark): a report can never assert a result the pump was never tested for.
  // Until at least one performance point is scored, the overall result is NOT CONFIRMED
  // — not a pass, not a conditional pass. This sits BELOW the three fail rules on
  // purpose: an outstanding deficiency, a missed gate or a consultant Fail are all
  // conclusions the recorded data does support, and they still fail the report.
  if(!f.perfTotal)
    return {status:'review',icon:'\u26A0',label:'NOT CONFIRMED',
      banner:'Not confirmed \u2014 no pump performance points have been scored',
      desc:(!f.perfRows
             ? 'No pump performance readings have been recorded, so the pump\'s performance has not been assessed.'
             : !f.ratedNet
               ? 'Pump readings are recorded, but the rated pressure has not been entered from the pump placard at the 100% flow point. Without it the NFPA 20 acceptance criteria cannot be evaluated.'
               : 'Pump readings are recorded, but none of them fall on a scored flow point (0%, 100% or 150% of rated flow), so the NFPA 20 acceptance criteria cannot be evaluated.')
           +' The overall result cannot be confirmed until that is corrected.'+aside};
  if(f.checklistNo)
    return {status:'cond',icon:'\u26A0',label:'CONDITIONAL',
      banner:'OVERALL: CONDITIONAL \u2014 '+plural(f.checklistNo,'checklist item','checklist items')+' answered No',
      desc:plural(f.checklistNo,'checklist item was','checklist items were')+' answered No. '+perfLine+' All deficiencies are closed.'+aside};
  if(f.tcc==='conditional')
    return {status:'cond',icon:'\u26A0',label:'CONDITIONAL',
      banner:'OVERALL: CONDITIONAL \u2014 Consultant recorded the test result as Conditional',
      desc:'The consultant recorded the test result as Conditional. '+perfLine+' All deficiencies are closed.'+aside};
  return {status:'pass',icon:'\u2713',label:'PASS',
    banner:'OVERALL: PASS \u2014 '+(f.perfTotal?'All performance points met the NFPA 20 criteria, all deficiencies closed':'All recorded items complete, all deficiencies closed'),
    desc:perfLine+' All recorded deficiencies are closed.'+aside};
}
function updateVerdict() {
  const el = document.getElementById('report-verdict');
  if (!el) return;
  var v = _dslVerdict();
  if(v.status==='none'){
    el.style.display = 'none';
    var _lbl0 = document.getElementById('report-verdict-label'); if(_lbl0) _lbl0.style.display='none';
    var _dot0 = document.getElementById('verdict-tab-dot'); if(_dot0) _dot0.className='verdict-dot';
    return;
  }
  var statusCls = v.status;
  el.className = 'report-verdict ' + statusCls;
  el.style.display = 'flex';
  el.innerHTML = '<span class="vicon">'+v.icon+'</span><span>'+v.banner+'</span>';
  var lbl = document.getElementById('report-verdict-label');
  if(lbl) lbl.style.display = 'block';

  // S280: drive the Summary-tab status dot (only PASS/CONDITIONAL/FAIL; 'review' shows no dot)
  var tabDot = document.getElementById('verdict-tab-dot');
  if(tabDot){
    if(statusCls==='review'){ tabDot.className = 'verdict-dot'; }
    else { tabDot.className = 'verdict-dot show ' + statusCls; }
  }

  if(typeof updateCompletionOverview==='function') updateCompletionOverview();
}
function renderPldPumpCurveTable() {
  const tbody = document.getElementById('pld-pump-curve-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  pldPumpCurvePoints.forEach((pt, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" value="${pt.flow}" placeholder="gpm" oninput="pldPumpCurvePoints[${i}].flow=+this.value||'';updatePldChart();updatePldNetChart()"></td>
      <td><input type="number" value="${pt.psi}" placeholder="psi" oninput="pldPumpCurvePoints[${i}].psi=+this.value||'';updatePldChart();updatePldNetChart()"></td>
      <td><button class="btn btn-danger btn-sm" onclick="pldPumpCurvePoints.splice(${i},1);renderPldPumpCurveTable();updatePldChart()" style="padding:3px 8px;font-size:11px;">✕</button></td>`;
    tbody.appendChild(tr);
  });
}

// 3pt tab demand calc (independent)
function calcTotalDemand3pt() {
  const sf = parseFloat(document.getElementById('dem-spr-flow')?.value)||0;
  const sp = parseFloat(document.getElementById('dem-spr-psi')?.value)||0;
  const hf = parseFloat(document.getElementById('dem-hose-flow')?.value)||0;
  const tf = sf + hf;
  const dfEl = document.getElementById('dem-flow'); if(dfEl) dfEl.value = tf||'';
  const dpEl = document.getElementById('dem-psi');  if(dpEl) dpEl.value = sp||'';
  const tfl = document.getElementById('dem-total-flow');
  const tps = document.getElementById('dem-total-psi');
  if(tfl) tfl.textContent = tf>0 ? tf.toLocaleString()+' gpm' : '—';
  if(tps) tps.textContent = sp>0 ? sp+' psi' : '—';
  updateChart3pt();
}
// 4b tab demand calc (independent)
function calcTotalDemandPld() {
  const sf = parseFloat(document.getElementById('pld-dem-spr-flow')?.value)||0;
  const sp = parseFloat(document.getElementById('pld-dem-spr-psi')?.value)||0;
  const hf = parseFloat(document.getElementById('pld-dem-hose-flow')?.value)||0;
  const tf = sf + hf;
  const dfEl = document.getElementById('pld-dem-flow'); if(dfEl) dfEl.value = tf||'';
  const dpEl = document.getElementById('pld-dem-psi');  if(dpEl) dpEl.value = sp||'';
  const tfl = document.getElementById('pld-dem-total-flow');
  const tps = document.getElementById('pld-dem-total-psi');
  if(tfl) tfl.textContent = tf>0 ? tf.toLocaleString()+' gpm' : '—';
  if(tps) tps.textContent = sp>0 ? sp+' psi' : '—';
  updatePldChart(); updatePldNetChart();
}
// legacy alias
function calcTotalDemand() { calcTotalDemand3pt(); }

// Cross-fill the shared water-supply fields between the 3-Point and 7-Point sections
// WITHOUT triggering calc/chart work (those are called by the input's own oninput).
// Keeps one logical site supply; prevents stranded data when switching test type.
function _syncSupply() {
  const pairs = [
    ['ws-static-flow','pld-ws-static-flow'],['ws-static-psi','pld-ws-static-psi'],
    ['ws-res-flow','pld-ws-res-flow'],['ws-res-psi','pld-ws-res-psi'],
    ['dem-spr-flow','pld-dem-spr-flow'],['dem-spr-psi','pld-dem-spr-psi'],
    ['dem-hose-flow','pld-dem-hose-flow'],
  ];
  // Which section is visible determines the source of truth for this edit
  var pldVisible = false;
  var sp = document.getElementById('perf-pld');
  if (sp && sp.style.display !== 'none') pldVisible = true;
  pairs.forEach(function(p){
    var e3 = document.getElementById(p[0]);
    var ep = document.getElementById(p[1]);
    if (!e3 || !ep) return;
    if (pldVisible) { if (e3.value !== ep.value) e3.value = ep.value; }
    else { if (ep.value !== e3.value) ep.value = e3.value; }
  });
}

// ── Global Chart.js performance settings ──
if (typeof Chart !== 'undefined') {
  Chart.defaults.animation = false;
  Chart.defaults.animations = false;
  Chart.defaults.transitions = {};
}

// Helper: get flow from a table row, falling back to defaultFlow when user hasn't entered a value
// This ensures 0% (churn) rows with flow=0 are plotted even when the input is empty
function rowFlow(r) {
  const v = r.flow;
  if(v !== '' && v !== null && v !== undefined) {
    const n = parseFloat(v);
    if(!isNaN(n)) return n;
  }
  return (r.defaultFlow !== undefined) ? r.defaultFlow : NaN;
}

// Shared x-axis tick builder (hydraulic spacing)
const _hwRawTicks = [0,250,500,750,1000,1250,1500,1750,2000,2250,2500,2750,3000,3500,4000,4500,5000,6000,8000];
const hwTicks = (axis) => {
  // Find the data max across axis, add 12% padding, snap to the next tick
  const dataMax = axis.max || 3500;
  const target = dataMax * 1.05;
  let lastTick = _hwRawTicks[_hwRawTicks.length - 1];
  for (let i = 0; i < _hwRawTicks.length; i++) {
    if (_hwRawTicks[i] >= target) { lastTick = _hwRawTicks[i]; break; }
  }
  // Build ticks up to and including lastTick
  axis.ticks = _hwRawTicks.filter(q => q <= lastTick).map(q => ({ value: q }));
  // CRITICAL: force axis.max to exactly the last tick so grid lines reach the edge
  axis.max = lastTick;
  axis.min = 0;
};
const tickCb = v => Number.isInteger(v) ? v.toLocaleString() : Math.round(v).toLocaleString();

// Chart handles
let chart3pt = null;        // Chart A: 3-pt discharge w/o PRV & PLD
let pldChart = null;        // Chart B: 7-pt discharge + supply/demand overlays
let netPerfChart = null;    // Chart C: legacy stub — INERT (kept for back-compat, never rendered)
let netChart3pt = null;     // Chart D: 3-pt net pressure (measured + adjusted + cutsheet)

// Dark-mode-aware chart color helpers
function _chartStroke() { return document.body.classList.contains('dark-mode') ? 'rgba(34,37,45,0.95)' : 'white'; }
function _chartStrokeW() { return document.body.classList.contains('dark-mode') ? 3 : 4; }
function _chartGrid() { return document.body.classList.contains('dark-mode') ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.05)'; }
function _chartLabelColor(lightCol) {
  if(!document.body.classList.contains('dark-mode')) return lightCol;
  var map = {'#5F8068':'#5aca7a','#A85959':'#e08080','#0D47A1':'#60a0e0','#1565C0':'#60a0e0','#D35400':'#e8a050','#5B2D8E':'#b080e0','#E53935':'#f07070','#2C4770':'#7a9fc8','#9C27B0':'#c070d0','#E67E22':'#e8a050','#805AD5':'#b59ae0'};
  if(map[lightCol]) return map[lightCol];
  // S368: any curve colour not in the map still needs to be readable on the
  // dark (#0b0a0d) chart background. Brighten toward white until it clears a
  // luminance floor, preserving hue so the label still reads as "that curve".
  return _brightenForDark(lightCol);
}
// S368: hue-preserving brightener. Mixes the colour toward white until its
// perceived luminance is high enough to read on near-black. Returns the input
// unchanged if it can't be parsed.
function _brightenForDark(hex){
  try{
    var m = /^#?([0-9a-f]{6})$/i.exec((hex||'').trim());
    if(!m) return hex;
    var n = parseInt(m[1],16);
    var r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    function lum(rr,gg,bb){ return (0.2126*rr + 0.7152*gg + 0.0722*bb)/255; }
    var L = lum(r,g,b);
    var FLOOR = 0.62;               // target perceived brightness on black
    if(L >= FLOOR) return hex;      // already light enough
    // mix toward white by the amount needed to reach the floor
    var t = Math.min(0.85, (FLOOR - L) / (1 - L));
    r = Math.round(r + (255-r)*t);
    g = Math.round(g + (255-g)*t);
    b = Math.round(b + (255-b)*t);
    return '#' + [r,g,b].map(function(v){ return ('0'+v.toString(16)).slice(-2); }).join('');
  }catch(e){ return hex; }
}

// PLD row indices that are skipped in w/o PRV & PLD (only 0%,100%,150% = indices 0,4,6)
// PLD_NO_SKIP defined above near renderPldTable

// ══════════════════════════════════════════════════
// INDEPENDENT DATA BUILDERS — 3pt tab and 4b tab use separate input IDs
// ══════════════════════════════════════════════════

// Build supply line from ANY set of input IDs
function buildSupplyLineFrom(staticFlowId, staticPsiId, resFlowId, resPsiId) {
  const sf = parseFloat(document.getElementById(staticFlowId)?.value)||0;
  const sp = parseFloat(document.getElementById(staticPsiId)?.value);
  const rf = parseFloat(document.getElementById(resFlowId)?.value);
  const rp = parseFloat(document.getElementById(resPsiId)?.value);
  if(isNaN(sp)||isNaN(rf)||isNaN(rp)||rf<=0||rp<0) return [];
  const pts = [];
  const steps = 24;
  for(let i=0;i<=steps;i++){
    const q = sf + (rf - sf) * (i/steps);
    const ratio = rf > 0 ? Math.pow(Math.max(q,0)/rf, 1.85) : 0;
    const p = sp - (sp - rp) * ratio;
    if(p >= 0) pts.push({x:Math.round(q), y:parseFloat(p.toFixed(1))});
  }
  return pts;
}

// 3pt tab supply line
function buildSupplyLine3pt() {
  return buildSupplyLineFrom('ws-static-flow','ws-static-psi','ws-res-flow','ws-res-psi');
}
// 4b tab supply line (independent)
function buildSupplyLinePld() {
  return buildSupplyLineFrom('pld-ws-static-flow','pld-ws-static-psi','pld-ws-res-flow','pld-ws-res-psi');
}
// legacy alias
function buildSupplyLine() { return buildSupplyLine3pt(); }

// 3pt pump curve (shared pumpCurvePoints array)
function buildPumpCurveLine() {
  return pumpCurvePoints.filter(p=>p.flow!==''&&p.psi!=='').map(p=>({x:+p.flow,y:+p.psi})).sort((a,b)=>a.x-b.x);
}
// 4b independent pump curve
function buildPldPumpCurveLine() {
  return pldPumpCurvePoints.filter(p=>p.flow!==''&&p.psi!=='').map(p=>({x:+p.flow,y:+p.psi})).sort((a,b)=>a.x-b.x);
}

// Demand-geometry helpers. 3-Point uses dem-* ids, 7-Point uses pld-dem-* ids;
// the geometry is identical, so a single set of base functions takes the id prefix
// ('' for 3-Point, 'pld-' for 7-Point). Named wrappers below preserve every call site.
function _getDemandPoint(pfx) {
  const df = parseFloat(document.getElementById(pfx+'dem-flow')?.value);
  const dp = parseFloat(document.getElementById(pfx+'dem-psi')?.value);
  return (!isNaN(df)&&!isNaN(dp)&&df>0) ? [{x:df,y:dp}] : [];
}
function _getSprDemLine(pfx) {
  const sf = parseFloat(document.getElementById(pfx+'dem-spr-flow')?.value)||0;
  const sp = parseFloat(document.getElementById(pfx+'dem-spr-psi')?.value)||0;
  return (sf>0&&sp>0) ? [{x:0,y:0},{x:sf,y:sp}] : [];
}
function _getOhlLine(pfx) {
  const sf = parseFloat(document.getElementById(pfx+'dem-spr-flow')?.value)||0;
  const sp = parseFloat(document.getElementById(pfx+'dem-spr-psi')?.value)||0;
  const hf = parseFloat(document.getElementById(pfx+'dem-hose-flow')?.value)||0;
  if(hf<=0||sp<=0) return [];
  return [{x:sf,y:sp},{x:sf+hf,y:sp}];
}
// Sprinkler demand point only (endpoint of SD diagonal, shown separately)
function _getSprDemPoint(pfx) {
  const sf = parseFloat(document.getElementById(pfx+'dem-spr-flow')?.value)||0;
  const sp = parseFloat(document.getElementById(pfx+'dem-spr-psi')?.value)||0;
  return (sf>0&&sp>0) ? [{x:sf,y:sp}] : [];
}

// 3pt demand helpers (use dem-* ids)
function getDemandPoint3pt() { return _getDemandPoint(''); }
function getSprDemLine3pt() { return _getSprDemLine(''); }
function getOhlLine3pt() { return _getOhlLine(''); }
function getSprDemPoint3pt() { return _getSprDemPoint(''); }

// 4b demand helpers (use pld-dem-* ids)
function getDemandPointPld() { return _getDemandPoint('pld-'); }
function getSprDemLinePld() { return _getSprDemLine('pld-'); }
function getOhlLinePld() { return _getOhlLine('pld-'); }
function getSprDemPointPld() { return _getSprDemPoint('pld-'); }

// legacy aliases for any remaining code that uses old names
function getDemandPoint() { return getDemandPoint3pt(); }
function getSprDemLine() { return getSprDemLine3pt(); }
function getOhlLine() { return getOhlLine3pt(); }


// ── Pitot Pressure Rows ──
var pitotCounts={'3a':0,'4b':0};
// Custom equipment
var _customEquipCount = {_3a:0, _4b:0};
// S540: `id` carries a row's permanent name. These rows are rebuilt from the
// saved report on every load, so the name has to travel THROUGH the rebuild —
// it is stamped onto the element here and read back at collect time. Without
// that round trip a name assigned at save time would not survive a refresh,
// which is the same defect that lost the nameplate values.
function addCustomEquip(tab, id) {
  var key = '_'+tab.replace('-','');
  _customEquipCount[key] = (_customEquipCount[key]||0) + 1;
  var n = _customEquipCount[key];
  var container = document.getElementById('equip-custom-'+tab);
  if(!container) return;
  var name = tab === '3a' ? 'equip3a' : 'equip4b';
  var wrap = document.createElement('label');
  wrap.setAttribute('data-cid', id || ('ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2,6)));   // S540
  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;grid-column:span 2;';
  wrap.innerHTML = '<input type="checkbox" name="'+name+'" checked>'
    + '<input type="text" placeholder="Custom equipment description" style="flex:1;padding:3px 7px;border:1px solid var(--border);border-radius:4px;font-size:12px;font-family:Calibri,sans-serif;">'
    + '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#A85959;cursor:pointer;font-size:13px;padding:0 4px;">✕</button>';
  container.appendChild(wrap);
  wrap.querySelector('input[type=text]').focus();
}
function addPitotRow(tab, id){
  if(pitotCounts[tab]>=8){showToast('Maximum 8 pitot rows');return;}
  pitotCounts[tab]++;var n=pitotCounts[tab];
  var c=document.getElementById('pitot-'+tab);if(!c)return;
  var row=document.createElement('div');row.id='pr-'+tab+'-'+n;
  // S540: permanent name, stamped here and read back at collect. The DOM number
  // n is NOT identity — removing row 3 renumbers everything after it on the next
  // load, so two devices would pair different readings.
  row.setAttribute('data-pid', id || ('pt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2,6)));
  row.className='pcard';
  var outletOpts='';for(var o=1;o<=6;o++)outletOpts+='<option value="'+o+'">'+o+' outlet'+(o>1?'s':'')+'</option>';
  row.innerHTML='<div class="pn">Pitot #'+n+'<button class="px" onclick="removePitotRow(\''+tab+'\','+n+')" title="Remove">✕</button></div>'
    +'<input type="number" placeholder="Pressure (psi)" id="pp-'+tab+'-'+n+'">'
    +'<input type="number" placeholder="Flow (gpm)" id="pf-'+tab+'-'+n+'" oninput="calcPitotTotal(this.id.split(\'-\')[1])">'
    +'<select id="po-'+tab+'-'+n+'" onchange="calcPitotTotal(this.id.split(\'-\')[1])" title="Number of Outlets">'+outletOpts+'</select>';
  c.appendChild(row);
}
function removePitotRow(tab,n){var r=document.getElementById('pr-'+tab+'-'+n);if(r)r.remove();calcPitotTotal(tab);}
function calcPitotTotal(tab){
  var t=0;
  for(var i=1;i<=8;i++){
    var fe=document.getElementById('pf-'+tab+'-'+i);
    var oe=document.getElementById('po-'+tab+'-'+i);
    if(fe){var flow=parseFloat(fe.value)||0;var outlets=parseInt(oe?oe.value:'1')||1;t+=flow*outlets;}
  }
  var el=document.getElementById('pitot-total-'+tab);
  if(el) el.textContent='Combined Total Flow: '+t.toFixed(1)+' gpm';
}
// ══════════════════════════════════════════════════
// CHART A: 3-Point Combined Performance + Water Supply & Demand
// Datasets: 0=supply, 1=pumpCurve, 2=measuredDis, 3=netPressure,
//           4=staticPt, 5=residualPt, 6=sprDemLine, 7=sprDemPt, 8=ohlLine, 9=totalDemand

// ══════════════════════════════════════════════════
// S213 REDESIGN — edge-label plugin + framed-figure helpers (chart3pt / 4a)
// ══════════════════════════════════════════════════
var _edgeLabelsOn = { chart3pt:true, pldChart:true, pldNetChart:true, netChart3pt:true };
function toggleEdgeLabels(cid){
  _edgeLabelsOn[cid] = !_edgeLabelsOn[cid];
  var btn = document.getElementById('edgetog-'+cid);
  if(btn) btn.classList.toggle('on', _edgeLabelsOn[cid]);
  var ci = cid==='chart3pt'?chart3pt:cid==='pldChart'?pldChart:cid==='netChart3pt'?netChart3pt:pldNetChart;
  if(ci) ci.update();
}
// (S214: 4a edge-label / %-tag / per-curve-label apparatus removed — 4a now uses the
// draggable annotation overlay to match the 7-point chart. Labels live in annotations.)

// Build the interactive legend: tap a name to show/hide its curve. (No per-curve label
// tabs — 4a uses draggable annotations to match the 7-point chart.)
function renderFigLegend3pt(){
  var host=document.getElementById('figleg-chart3pt'); if(!host||!chart3pt) return;
  var ds=chart3pt.data.datasets;
  function has(i){return ds[i]&&ds[i].data&&ds[i].data.length;}
  // {i:dsIdx, c:color, kind, dash, t:label, also:idx?, cap:'reducing'|'relief'|'pld'?, primary:bool?}
  var defs=[];
  if(has(15)) defs.push({i:15,c:'#D4A017', kind:'line', dash:[],          t:'Actual Output'});
  if(has(2)) defs.push({i:2, c:'#5F8068', kind:'line', dash:[],          t:'Measured Discharge', primary:true});
  if(has(1)) defs.push({i:1, c:'#9C2742', kind:'line', dash:[10,5],      t:'Pump Curve'});
  if(has(0)) defs.push({i:0, c:'#6E86B8', kind:'line', dash:[],          t:'Available Supply'});
  if(has(6)) defs.push({i:6, c:_chartLabelColor('#E67E22'), kind:'line', dash:[],   t:'Sprinkler Demand'});
  if(has(8)) defs.push({i:8, c:_chartLabelColor('#805AD5'), kind:'line', dash:[],   t:'Outside Hose'});
  if(has(13)) defs.push({i:13,c:'#4A8C8C', kind:'line', dash:[6,4],      t:'Pressure Reducing', cap:'reducing'});
  if(has(14)) defs.push({i:14,c:'#B05A7A', kind:'line', dash:[6,4],      t:'Pressure Relief', cap:'relief'});
  // S227: Cutsheet/Placard moved to net chart; Rated Press. (ref) removed. Chips dropped here.
  if(has(9)) defs.push({i:9, c:_chartLabelColor('#805AD5'), kind:'dia',  dash:[],          t:'System Demand', primary:true});
  if(has(4)||has(5)) defs.push({i:4, c:'#6E86B8', kind:'dot', dash:[],   t:'Supply Points', also:5});
  function swatch(d){
    if(d.kind==='dia') return '<svg class="swc" viewBox="0 0 24 12"><rect x="7" y="2" width="8" height="8" transform="rotate(45 11 6)" fill="'+d.c+'"/></svg>';
    if(d.kind==='dot') return '<svg class="swc" viewBox="0 0 24 12"><circle cx="12" cy="6" r="5" fill="'+d.c+'"/></svg>';
    var da=d.dash&&d.dash.length?' stroke-dasharray="'+d.dash.join(',')+'"':'';
    return '<svg class="swc" viewBox="0 0 24 12"><line x1="1" y1="6" x2="23" y2="6" stroke="'+d.c+'" stroke-width="2"'+da+'/></svg>';
  }
  host.innerHTML='';
  defs.forEach(function(d){
    var meta=chart3pt.getDatasetMeta(d.i);
    var hidden=meta.hidden===true;
    var allowDef = !!d.primary;   // primary curve + system-demand are labelled by default
    var aOff = !_annOn('chart3pt', d.i, allowDef);
    var el=document.createElement('span');
    el.className='lg'+(hidden?' off':'');
    el.innerHTML='<span class="lg-main" data-i="'+d.i+'"'+(d.also!=null?' data-also="'+d.also+'"':'')+(d.cap?' data-cap="'+d.cap+'"':'')+'>'+swatch(d)+d.t+'</span>'
      +'<span class="lg-ann'+(aOff?' aoff':'')+'" data-i="'+d.i+'" data-def="'+(allowDef?1:0)+'" title="Toggle this curve\u2019s on-chart labels">A</span>';
    host.appendChild(el);
  });
  host.querySelectorAll('.lg-main').forEach(function(m){
    m.onclick=function(){
      var i=+m.dataset.i, also=m.dataset.also!=null?+m.dataset.also:null;
      var mt=chart3pt.getDatasetMeta(i); mt.hidden=!mt.hidden;
      if(also!=null) chart3pt.getDatasetMeta(also).hidden=mt.hidden;
      // S222: a cap pill toggled off leaves the golden min(); re-shape the golden curve.
      if(m.dataset.cap){ smCapVis.chart3pt[m.dataset.cap] = mt.hidden!==true; updateChart3pt(); }
      chart3pt.update(); renderFigLegend3pt();
    };
  });
  host.querySelectorAll('.lg-ann').forEach(function(a){
    a.onclick=function(e){
      e.stopPropagation();
      toggleDsAnnotation('chart3pt', +a.dataset.i, a.dataset.def==='1');
      a.classList.toggle('aoff', !_annOn('chart3pt', +a.dataset.i, a.dataset.def==='1'));
    };
  });
  _appendSafetyPill(host, 'chart3pt');
}
// S221: Safety Margin legend pill (toggles smState + connector, not a Chart.js dataset)
function _appendSafetyPill(host, chartKey){
  if(!host || !smState[chartKey]) return;
  var on=smState[chartKey].on;
  var el=document.createElement('span');
  el.className='lg'+(on?'':' off');
  el.innerHTML='<span class="lg-main lg-sm"><svg class="swc" viewBox="0 0 24 12"><line x1="12" y1="1" x2="12" y2="11" stroke="#3DBE6B" stroke-width="2.4" stroke-dasharray="2,3"/></svg>Safety Margin</span>';
  el.querySelector('.lg-sm').onclick=function(){ toggleSafetyMargin(chartKey); };
  host.appendChild(el);
}
// Shared pill-legend swatch builder (line / diamond / dot)
function _figSwatch(d){
  if(d.kind==='dia') return '<svg class="swc" viewBox="0 0 24 12"><rect x="7" y="2" width="8" height="8" transform="rotate(45 11 6)" fill="'+d.c+'"/></svg>';
  if(d.kind==='dot') return '<svg class="swc" viewBox="0 0 24 12"><circle cx="12" cy="6" r="5" fill="'+d.c+'"/></svg>';
  var da=d.dash&&d.dash.length?' stroke-dasharray="'+d.dash.join(',')+'"':'';
  return '<svg class="swc" viewBox="0 0 24 12"><line x1="1" y1="6" x2="23" y2="6" stroke="'+d.c+'" stroke-width="2"'+da+'/></svg>';
}
// Shared pill-legend builder — wires tap-to-toggle for the given chart instance.
// chartKey ('chart3pt'|'pldChart'|'pldNetChart') enables the per-pill annotation "A" button
// and cap-visibility wiring. defs entries may carry: primary:true (labelled by default),
// cap:'pld'|'reducing'|'relief' (toggling the pill removes it from the golden min()).
function _buildFigLegend(host, chart, defs, chartKey){
  if(!host||!chart) return;
  host.innerHTML='';
  defs.forEach(function(d){
    var ds0=chart.data.datasets[d.i];
    var hidden = ds0 ? (ds0.hidden===true) : false;
    var allowDef = !!d.primary;
    var aOff = chartKey ? !_annOn(chartKey, d.i, allowDef) : true;
    var el=document.createElement('span');
    el.className='lg'+(hidden?' off':'');
    var annBtn = chartKey ? ('<span class="lg-ann'+(aOff?' aoff':'')+'" data-i="'+d.i+'" data-def="'+(allowDef?1:0)+'" title="Toggle this curve\u2019s on-chart labels">A</span>') : '';
    el.innerHTML='<span class="lg-main" data-i="'+d.i+'"'+(d.also!=null?' data-also="'+d.also+'"':'')+(d.cap?' data-cap="'+d.cap+'"':'')+'>'+_figSwatch(d)+d.t+'</span>'+annBtn;
    host.appendChild(el);
  });
  host.querySelectorAll('.lg-main').forEach(function(m){
    m.onclick=function(){
      var i=+m.dataset.i, also=m.dataset.also!=null?+m.dataset.also:null;
      var d0=chart.data.datasets[i]; if(!d0) return;
      var nowHidden = !(d0.hidden===true);
      d0.hidden = nowHidden;
      if(also!=null && chart.data.datasets[also]) chart.data.datasets[also].hidden = nowHidden;
      // S222: cap pill toggled off leaves the golden min(); re-shape via the chart's update fn.
      if(chartKey && m.dataset.cap){
        smCapVis[chartKey][m.dataset.cap] = nowHidden!==true;
        if(chartKey==='pldChart' && typeof updatePldChart==='function') updatePldChart();
        else if(chartKey==='chart3pt' && typeof updateChart3pt==='function') updateChart3pt();
      }
      chart.update();
      m.closest('.lg').classList.toggle('off', nowHidden);
    };
  });
  if(chartKey){
    host.querySelectorAll('.lg-ann').forEach(function(a){
      a.onclick=function(e){
        e.stopPropagation();
        toggleDsAnnotation(chartKey, +a.dataset.i, a.dataset.def==='1');
        a.classList.toggle('aoff', !_annOn(chartKey, +a.dataset.i, a.dataset.def==='1'));
      };
    });
  }
}
// 4b — pldChart pill legend (datasets: 0 supply,1 pump,2 measured,3 SD line,4 SD pt,5 OHL,6 demand,7 static,8 residual,9 PRV,10 PLD)
function renderFigLegendPld(){
  var host=document.getElementById('figleg-pldChart'); if(!host||!pldChart) return;
  var ds=pldChart.data.datasets;
  function has(i){return ds[i]&&ds[i].data&&ds[i].data.length;}
  var defs=[];
  if(has(13))defs.push({i:13,c:'#D4A017', kind:'line', dash:[],          t:'Actual Output'});
  if(has(2)) defs.push({i:2, c:'#5F8068', kind:'line', dash:[],          t:'Measured Discharge (w/ PLD)', primary:true});
  if(has(1)) defs.push({i:1, c:'#9C2742', kind:'line', dash:[10,5],      t:'Pump Curve'});
  if(has(0)) defs.push({i:0, c:'#6E86B8', kind:'line', dash:[],          t:'Available Supply'});
  if(has(3)) defs.push({i:3, c:_chartLabelColor('#E67E22'), kind:'line', dash:[], t:'Sprinkler Demand'});
  if(has(5)) defs.push({i:5, c:_chartLabelColor('#805AD5'), kind:'line', dash:[], t:'Outside Hose'});
  if(has(10))defs.push({i:10,c:'#7D6F9C', kind:'line', dash:[2,3],       t:'PLD Setting', cap:'pld'});
  if(has(11))defs.push({i:11,c:'#4A8C8C', kind:'line', dash:[6,4],       t:'Pressure Reducing', cap:'reducing'});
  if(has(12))defs.push({i:12,c:'#B05A7A', kind:'line', dash:[6,4],       t:'Pressure Relief', cap:'relief'});
  // S227: Rated Press. (ref) chip removed (line deleted from chart).
  if(has(6)) defs.push({i:6, c:_chartLabelColor('#805AD5'), kind:'dia',  dash:[],        t:'System Demand', primary:true});
  if(has(7)||has(8)) defs.push({i:7, c:'#6E86B8', kind:'dot', dash:[],   t:'Supply Points', also:8});
  _buildFigLegend(host, pldChart, defs, 'pldChart');
  _appendSafetyPill(host, 'pldChart');
}
// 4b — pldNetChart pill legend (datasets: 0 measured net w/o PLD, 1 adjusted net w/o PLD, 2 cutsheet, 3 placard)
function renderFigLegendPldNet(){
  var host=document.getElementById('figleg-pldNetChart'); if(!host||!pldNetChart) return;
  var ds=pldNetChart.data.datasets;
  function has(i){return ds[i]&&ds[i].data&&ds[i].data.length;}
  var defs=[];
  if(has(0)) defs.push({i:0, c:'#6366F1', kind:'line', dash:[],          t:'Measured Net (w/o PLD)'});
  if(has(1)) defs.push({i:1, c:'#21D3ED', kind:'line', dash:[8,4,2,4],   t:'Adjusted Net (w/o PLD)'});
  if(has(2)) defs.push({i:2, c:'#A78BFA', kind:'line', dash:[2,3],       t:'Cutsheet'});
  if(has(3)) defs.push({i:3, c:'#7D6F9C', kind:'line', dash:[5,3],       t:'Placard'});
  _buildFigLegend(host, pldNetChart, defs, 'pldNetChart'); // S267(E): chartKey enables the per-curve "A" annotation toggle (engine already supports this chart)
}
// Readout strip (per-point %/psi/gpm/rpm + verdict) — uses the REAL _calcFlowPoint
function renderFigReadout3pt(){
  var host=document.getElementById('figro-chart3pt'); if(!host) return;
  host.innerHTML='';
  stdData.forEach(function(row){
    var r=_calcFlowPoint(row);
    var dis=parseFloat(row.discharge), flow=rowFlow(row);
    var vtxt=r.verdict==='pass'?'PASS':r.verdict==='fail'?'FAIL':'—';
    var cell=document.createElement('div'); cell.className='ro';
    cell.innerHTML='<div class="pct">'+_escHtml(row.pct)+' · '+_escHtml(row.label)+'</div>'
      +'<div class="val">'+(!isNaN(dis)?dis+' psi':'—')+'</div>'
      +'<div class="sub">@ '+(!isNaN(flow)?flow.toLocaleString()+' gpm':'— gpm')+(row.rpm?' · '+row.rpm+' rpm':'')+'</div>'
      +'<span class="chip '+r.verdict+'">'+vtxt+'</span>';
    host.appendChild(cell);
  });
}
// Compact supply + demand line (static / residual / system demand values)
function renderFigSupply3pt(){
  var host=document.getElementById('figsup-chart3pt'); if(!host) return;
  var parts=[];
  var sp=parseFloat(document.getElementById('ws-static-psi')?.value);
  var sf=parseFloat(document.getElementById('ws-static-flow')?.value)||0;
  var rf=parseFloat(document.getElementById('ws-res-flow')?.value);
  var rp=parseFloat(document.getElementById('ws-res-psi')?.value);
  if(!isNaN(sp)&&sp>0) parts.push('Static supply: <b>'+sp+' psi</b>'+(sf>0?' @ '+sf.toLocaleString()+' gpm':''));
  if(!isNaN(rf)&&!isNaN(rp)&&rf>0) parts.push('Residual supply: <b>'+rp+' psi @ '+rf.toLocaleString()+' gpm</b>');
  var df=parseFloat(document.getElementById('dem-flow')?.value);
  var dp=parseFloat(document.getElementById('dem-psi')?.value);
  if(!isNaN(df)&&!isNaN(dp)&&df>0) parts.push('System demand: <b>'+dp+' psi @ '+df.toLocaleString()+' gpm</b>');
  host.innerHTML = parts.join('<span style="color:var(--border);">|</span>');
}
function renderFigVerdict3pt(){
  var el=document.getElementById('figv-chart3pt'); if(!el) return;
  var verds=stdData.map(function(r){return _calcFlowPoint(r).verdict;});
  // effective verdicts: 'fail' fails the chart; 'flag' is NOT a fail; need ≥1 'pass' to assert PASS
  if(verds.some(function(v){return v==='fail';})){el.className='fig-verdict fail';el.textContent='✗ FAIL';}
  else if(verds.some(function(v){return v==='pass';})){el.className='fig-verdict pass';el.textContent='✓ PASS';}
  else {el.className='fig-verdict na';el.textContent='—';}
}
function refreshFig3pt(){ renderFigLegend3pt(); renderFigReadout3pt(); renderFigSupply3pt(); renderFigVerdict3pt(); if(typeof renderSafetyMargin3pt==='function') renderSafetyMargin3pt(); }

// ── 3-Point Net Pressure chart (netChart3pt) fig helpers ──
function renderFigLegendNet3pt(){
  var host=document.getElementById('figleg-netChart3pt'); if(!host||!netChart3pt) return;
  var ds=netChart3pt.data.datasets;
  function has(i){return ds[i]&&ds[i].data&&ds[i].data.length;}
  var defs=[];
  if(has(0)) defs.push({i:0, c:'#6366F1', kind:'line', dash:[],          t:'Measured Net'});
  if(has(1)) defs.push({i:1, c:'#21D3ED', kind:'line', dash:[8,4,2,4],   t:'Adjusted Net (RPM-corrected)'});
  if(has(2)) defs.push({i:2, c:'#A78BFA', kind:'line', dash:[2,3],       t:'Cutsheet'});
  if(has(3)) defs.push({i:3, c:'#7D6F9C', kind:'line', dash:[5,3],       t:'Placard'});
  _buildFigLegend(host, netChart3pt, defs, 'netChart3pt'); // S267(E): chartKey enables the per-curve "A" annotation toggle (engine already supports this chart)
}
function renderFigVerdictNet3pt(){
  var el=document.getElementById('figv-netChart3pt'); if(!el) return;
  var verds=stdData.map(function(r){return _calcFlowPoint(r).verdict;});
  if(verds.some(function(v){return v==='fail';})){el.className='fig-verdict fail';el.textContent='✗ FAIL';}
  else if(verds.some(function(v){return v==='pass';})){el.className='fig-verdict pass';el.textContent='✓ PASS';}
  else {el.className='fig-verdict na';el.textContent='—';}
}
function refreshFigNet3pt(){ renderFigLegendNet3pt(); renderFigVerdictNet3pt(); }

// ── S221: 7-Point discharge-chart fig twins (mirror the 3-Point bottom section) ──
// Uses pldData fields (dis_w/suc_w/rpm_w) and updatePldVerdictObj — NOT _calcFlowPoint,
// which reads 3-Point field names and would yield blank/wrong values for 7-Point rows.
function renderFigReadoutPld(){
  var host=document.getElementById('figro-pldChart'); if(!host) return;
  host.innerHTML='';
  (typeof pldData!=='undefined'?pldData:[]).forEach(function(row,i){
    var v=updatePldVerdictObj(row,i);
    var dis=parseFloat(row.dis_w);
    var flow=rowFlow(row);
    var rpm=parseFloat(row.rpm_w);
    var vtxt=v.verdict==='pass'?'PASS':v.verdict==='fail'?'FAIL':'—';
    var cell=document.createElement('div'); cell.className='ro';
    cell.innerHTML='<div class="pct">'+row.pct+'</div>'
      +'<div class="val">'+(!isNaN(dis)?dis+' psi':'—')+'</div>'
      +'<div class="sub">@ '+(!isNaN(flow)?flow.toLocaleString()+' gpm':'— gpm')+(!isNaN(rpm)&&rpm>0?' · '+rpm+' rpm':'')+'</div>'
      +'<span class="chip '+v.verdict+'">'+vtxt+'</span>';
    host.appendChild(cell);
  });
}
function renderFigSupplyPld(){
  var host=document.getElementById('figsup-pldChart'); if(!host) return;
  var parts=[];
  var sp=parseFloat(document.getElementById('pld-ws-static-psi')?.value);
  var sf=parseFloat(document.getElementById('pld-ws-static-flow')?.value)||0;
  var rf=parseFloat(document.getElementById('pld-ws-res-flow')?.value);
  var rp=parseFloat(document.getElementById('pld-ws-res-psi')?.value);
  if(!isNaN(sp)&&sp>0) parts.push('Static supply: <b>'+sp+' psi</b>'+(sf>0?' @ '+sf.toLocaleString()+' gpm':''));
  if(!isNaN(rf)&&!isNaN(rp)&&rf>0) parts.push('Residual supply: <b>'+rp+' psi @ '+rf.toLocaleString()+' gpm</b>');
  var df=parseFloat(document.getElementById('pld-dem-flow')?.value);
  var dp=parseFloat(document.getElementById('pld-dem-psi')?.value);
  if(!isNaN(df)&&!isNaN(dp)&&df>0) parts.push('System demand: <b>'+dp+' psi @ '+df.toLocaleString()+' gpm</b>');
  host.innerHTML = parts.join('<span style="color:var(--border);">|</span>');
}
function renderFigVerdictPld(){
  var el=document.getElementById('figv-pldChart'); if(!el) return;
  var verds=(typeof pldData!=='undefined'?pldData:[]).map(function(r,i){return updatePldVerdictObj(r,i).verdict;});
  if(verds.some(function(v){return v==='fail';})){el.className='fig-verdict fail';el.textContent='✗ FAIL';}
  else if(verds.some(function(v){return v==='pass';})){el.className='fig-verdict pass';el.textContent='✓ PASS';}
  else {el.className='fig-verdict na';el.textContent='—';}
}
function refreshFigPld(){ renderFigLegendPld(); renderFigReadoutPld(); renderFigSupplyPld(); renderFigVerdictPld(); if(typeof renderSafetyMarginPld==='function') renderSafetyMarginPld(); }

// ── S221: 7-Point NET-pressure chart readout (shows net pressure w/ PLD + PASS/FAIL per point) ──
function renderFigReadoutPldNet(){
  var host=document.getElementById('figro-pldNetChart'); if(!host) return;
  host.innerHTML='';
  (typeof pldData!=='undefined'?pldData:[]).forEach(function(row,i){
    var v=updatePldVerdictObj(row,i);
    var flow=rowFlow(row);
    var vtxt=v.verdict==='pass'?'PASS':v.verdict==='fail'?'FAIL':'—';
    var netVal=(v.netW!=null && !isNaN(v.netW) && v.netW!==0)?Math.round(v.netW)+' psi':'—';
    var cell=document.createElement('div'); cell.className='ro';
    cell.innerHTML='<div class="pct">'+row.pct+'</div>'
      +'<div class="val">'+netVal+'</div>'
      +'<div class="sub">net @ '+(!isNaN(flow)?flow.toLocaleString()+' gpm':'— gpm')+'</div>'
      +'<span class="chip '+v.verdict+'">'+vtxt+'</span>';
    host.appendChild(cell);
  });
}
function renderFigVerdictPldNet(){
  var el=document.getElementById('figv-pldNetChart'); if(!el) return;
  var verds=(typeof pldData!=='undefined'?pldData:[]).map(function(r,i){return updatePldVerdictObj(r,i).verdict;});
  if(verds.some(function(v){return v==='fail';})){el.className='fig-verdict fail';el.textContent='✗ FAIL';}
  else if(verds.some(function(v){return v==='pass';})){el.className='fig-verdict pass';el.textContent='✓ PASS';}
  else {el.className='fig-verdict na';el.textContent='—';}
}
function refreshFigPldNet(){ renderFigLegendPldNet(); renderFigReadoutPldNet(); renderFigVerdictPldNet(); }

// ── S222: GOLDEN "ACTUAL OUTPUT" CURVE + CAP MODEL ──
// The system can never deliver more than the lowest active+visible pressure cap. The golden
// curve = min(measured discharge, lowest active cap) across the full flow range. The safety
// margin measures to this golden line at the total demand flow.
//
// Cap inputs differ by chart. PLD only exists on 7-Point. Relief/Reducing on both.
//   3-Point ('') : pm-relief, pm-reducing            (no PLD field)
//   7-Point ('pld-'): pm-relief-pld, pm-reducing-pld, pm-pld-setting
// Each cap has a legend pill; turning the pill off removes that cap from the min().
// smCapVis[chartKey][capName] = true (visible/active) | false (legend toggled off).
var smCapVis = {
  chart3pt: {relief:true, reducing:true},
  pldChart: {relief:true, reducing:true, pld:true}
};
function _capInputs(pfx){
  if(pfx==='pld-') return [
    {name:'pld',      id:'pm-pld-setting'},
    {name:'reducing', id:'pm-reducing-pld'},
    {name:'relief',   id:'pm-relief-pld'}
  ];
  return [
    {name:'reducing', id:'pm-reducing'},
    {name:'relief',   id:'pm-relief'}
  ];
}
function _chartKeyForPfx(pfx){ return pfx==='pld-' ? 'pldChart' : 'chart3pt'; }
function _lowestActiveCap(pfx){
  var key=_chartKeyForPfx(pfx); var vis=smCapVis[key]||{};
  var lowest=null;
  _capInputs(pfx).forEach(function(c){
    if(vis[c.name]===false) return;
    var v=parseFloat(document.getElementById(c.id)?.value);
    if(isNaN(v)||v<=0) return;
    if(lowest===null||v<lowest) lowest=v;
  });
  return lowest;
}
/* S499 CARVE: the curve maths moved to lib/calc/curveData.js, pinned by
   tests/unit/curveData.test.js (21 tests + a 10,000-case differential proving
   these delegates are identical to the code they replaced). The GLOBAL and DOM
   reads stay here on purpose — that separation is what makes the maths
   testable. Inline fallback only for a failed module load. */
function _measuredDischargePts(pfx){
  var src = (pfx==='pld-') ? (typeof pldData!=='undefined'?pldData:[]) : (typeof stdData!=='undefined'?stdData:[]);
  if(window.CurveData) return window.CurveData.measuredDischargePts(src, pfx==='pld-', (typeof rowFlow==='function')?rowFlow:null);
  return src.map(function(r){
    var f = (typeof rowFlow==='function') ? rowFlow(r) : parseFloat(r.flow);
    var d = parseFloat(pfx==='pld-' ? (r.dis_w!=null?r.dis_w:r.discharge) : r.discharge);
    if(isNaN(f)||isNaN(d)) return null;
    return {x:f, y:d};
  }).filter(Boolean).sort(function(a,b){return a.x-b.x;});
}
/* S499 CARVE: see _curveDevOver1pct above. Maths owned by
   lib/calc/pumpCurve.js; this delegates. Fallback for a failed module load. */
function _interpCurve(curve, flow){
  if(window.PumpCurve) return window.PumpCurve.interpCurve(curve, flow);
  if(!curve||!curve.length) return null;
  if(flow<=curve[0].x) return curve[0].y;
  if(flow>=curve[curve.length-1].x) return curve[curve.length-1].y;
  for(var i=0;i<curve.length-1;i++){
    var a=curve[i], b=curve[i+1];
    if(flow>=a.x&&flow<=b.x){ var t=(b.x===a.x)?0:(flow-a.x)/(b.x-a.x); return a.y+t*(b.y-a.y); }
  }
  return curve[curve.length-1].y;
}
/* S499 CARVE: see _measuredDischargePts above. Cap lookup stays here (it reads
   the DOM); the clipping maths is owned by lib/calc/curveData.js. */
function _goldenCurve(pfx){
  var dis=_measuredDischargePts(pfx);
  if(!dis.length) return [];
  var cap=_lowestActiveCap(pfx);
  if(window.CurveData) return window.CurveData.goldenCurve(dis, cap);
  var pts=[];
  for(var i=0;i<dis.length;i++){
    var x=dis[i].x, y=dis[i].y;
    pts.push({x:x, y:(cap!=null)?Math.min(y,cap):y});
    if(cap!=null && i<dis.length-1){
      var x2=dis[i+1].x, y2=dis[i+1].y;
      if((y>cap)!==(y2>cap) && y!==y2){
        var t=(cap-y)/(y2-y); var xc=x+t*(x2-x);
        pts.push({x:xc, y:cap});
      }
    }
  }
  return pts.sort(function(a,b){return a.x-b.x;});
}
function _goldenAt(pfx, flow){
  var g=_goldenCurve(pfx);
  if(g.length) return _interpCurve(g, flow);
  return null;
}

// ── SAFETY MARGIN (S222 rewrite) ──
// margin = golden "actual output" pressure AT the total demand flow − total system demand
// pressure. Golden = min(measured discharge, lowest active cap). When no pump/discharge data
// exists, falls back to the raw water-supply hydraulic curve (pre-S222 behaviour).
// Returned in psi (+/−/0) and as a % of demand pressure. pfx: '' (3-Point) | 'pld-' (7-Point).
function _safetyMargin(pfx){
  var sf=parseFloat(document.getElementById(pfx+'ws-static-flow')?.value)||0;
  var sp=parseFloat(document.getElementById(pfx+'ws-static-psi')?.value);
  var rf=parseFloat(document.getElementById(pfx+'ws-res-flow')?.value);
  var rp=parseFloat(document.getElementById(pfx+'ws-res-psi')?.value);
  var demFlow=parseFloat(document.getElementById(pfx+'dem-flow')?.value);
  var demPsi =parseFloat(document.getElementById(pfx+'dem-psi')?.value);
  if(isNaN(demFlow)||isNaN(demPsi)||demFlow<0) return null;
  var avail, basis;
  // Preferred: golden "actual output" curve (pump + caps) read at the demand flow.
  var gold=_goldenAt(pfx, demFlow);
  if(gold!=null){
    avail=gold; basis='golden';
  } else {
    // No pump/discharge data → fall back to raw water-supply hydraulic 1.85 curve.
    if(isNaN(sp)||isNaN(rf)||isNaN(rp)||rf<=0) return null;
    var ratio = Math.pow(Math.max(demFlow,0)/rf, 1.85);
    avail = sp - (sp - rp) * ratio;
    basis='supply';
  }
  var marginPsi = avail - demPsi;
  var pct = demPsi>0 ? (marginPsi/demPsi*100) : null;
  return {avail:avail, demPsi:demPsi, demFlow:demFlow, psi:marginPsi, pct:pct, basis:basis};
}
// ── S221: on-chart Safety Margin connector + draggable chip ──
// State per chart: on/off (default ON) + chip drag offset. Saved per project via collectState.
var smState = {
  chart3pt: {on:true, x:0, y:0},
  pldChart: {on:true, x:0, y:0}
};
// Verdict colours match the golden-curve demo exactly.
// Amber (TIGHT) when margin < min(10 psi, 10% of available pressure at demand). Red ≤ 0.
function _smColor(margin, availPsi){
  if(margin <= 0.001) return {c:'#C25B5B', bg:'rgba(194,91,91,.16)', word:'DEFICIT'};
  var amber = Math.min(10, (availPsi||0)*0.10);
  if(margin < amber) return {c:'#D6A93E', bg:'rgba(214,169,62,.16)', word:'TIGHT'};
  return {c:'#3DBE6B', bg:'rgba(61,190,107,.16)', word:'ADEQUATE'};
}
// pull live data for color thresholds (needs residual psi)
function _smResidualPsi(pfx){ return parseFloat(document.getElementById(pfx+'ws-res-psi')?.value); }

function renderSafetyConnector(chartKey, chartObj, pfx){
  var ov=document.getElementById('smov-'+chartKey); if(!ov||!chartObj) return;
  ov.innerHTML='';
  var st=smState[chartKey]; if(!st||!st.on) return;
  var m=_safetyMargin(pfx); if(!m) return;
  var col=_smColor(m.psi, m.avail);
  var sign=m.psi>0?'+':'';
  var xs=chartObj.scales.x, ys=chartObj.scales.y; if(!xs||!ys) return;
  var px=xs.getPixelForValue(m.demFlow);
  var yDem=ys.getPixelForValue(m.demPsi);
  var yAvail=ys.getPixelForValue(m.avail);
  var top=Math.min(yDem,yAvail), bot=Math.max(yDem,yAvail), mid=(top+bot)/2;
  var plotRight=xs.getPixelForValue(xs.max);
  var placeLeft=(plotRight-px)<160;
  var svgNS='http://www.w3.org/2000/svg';
  var svg=document.createElementNS(svgNS,'svg');
  svg.setAttribute('style','position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;');
  // dashed vertical connector + end caps
  var ln=document.createElementNS(svgNS,'line');
  ln.setAttribute('x1',px);ln.setAttribute('x2',px);ln.setAttribute('y1',top);ln.setAttribute('y2',bot);
  ln.setAttribute('stroke',col.c);ln.setAttribute('stroke-width','2.4');ln.setAttribute('stroke-dasharray','2 4');ln.setAttribute('stroke-linecap','round');
  svg.appendChild(ln);
  [top,bot].forEach(function(y){var t=document.createElementNS(svgNS,'line');t.setAttribute('x1',px-6);t.setAttribute('x2',px+6);t.setAttribute('y1',y);t.setAttribute('y2',y);t.setAttribute('stroke',col.c);t.setAttribute('stroke-width','2.4');t.setAttribute('stroke-linecap','round');svg.appendChild(t);});
  // leader line (drawn if chip dragged away) — connects chip back to connector midpoint
  var leader=document.createElementNS(svgNS,'line'); leader.setAttribute('stroke',col.c);leader.setAttribute('stroke-width','1.2');leader.setAttribute('stroke-dasharray','3 3');leader.setAttribute('opacity','0.7');
  svg.appendChild(leader);
  ov.appendChild(svg);
  // chip
  var baseLeft = placeLeft ? null : px+12;
  var baseRight = placeLeft ? (plotRight-px+12) : null;
  var pctTxt = m.demPsi>0 ? (sign+(m.psi/m.demPsi*100).toFixed(0)+'%') : '0%';
  var chip=document.createElement('div');
  chip.className='sm-chip';
  chip.style.cssText='position:absolute;top:'+(mid+st.y)+'px;transform:translateY(-50%);'
    +(placeLeft?'right:'+(baseRight-st.x)+'px;':'left:'+(baseLeft+st.x)+'px;')
    +'display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;'
    +'background:'+col.bg+';border:1.5px solid '+col.c+';'
    +'border-radius:9px;padding:4px 9px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.35);'
    +'cursor:grab;pointer-events:auto;user-select:none;-webkit-user-select:none;touch-action:none;z-index:5;';
  // S321 (staff feedback): single-row chip — psi and % together, word beneath
  // only when it fits the same row budget. ~20% smaller overall.
  chip.innerHTML='<div style="font-size:calc(11.5px + var(--ts));font-weight:800;color:'+col.c+';letter-spacing:.2px;">'+sign+m.psi.toFixed(1)+' psi \u00b7 '+pctTxt+'</div>'
    +'<div style="font-size:calc(9px + var(--ts));font-weight:700;color:'+col.c+';letter-spacing:.5px;">'+col.word+'</div>';
  ov.appendChild(chip);
  // position leader after chip is laid out
  function updateLeader(){
    var ovr=ov.getBoundingClientRect(), cr=chip.getBoundingClientRect();
    var cx=(cr.left+cr.right)/2-ovr.left, cy=(cr.top+cr.bottom)/2-ovr.top;
    var dist=Math.hypot(cx-px, cy-mid);
    if(dist>46){ leader.setAttribute('x1',px);leader.setAttribute('y1',mid);leader.setAttribute('x2',cx);leader.setAttribute('y2',cy);leader.setAttribute('opacity','0.7'); }
    else leader.setAttribute('opacity','0');
  }
  updateLeader();
  // drag (mouse + touch), persisted in smState
  function startDrag(sx,sy){
    var ox=st.x, oy=st.y; chip.style.cursor='grabbing';
    function mv(cx,cy){ st.x = ox + (cx-sx); st.y = oy + (cy-sy);
      chip.style.top=(mid+st.y)+'px';
      if(placeLeft) chip.style.right=(baseRight-st.x)+'px'; else chip.style.left=(baseLeft+st.x)+'px';
      updateLeader(); }
    function mm(e){ mv(e.clientX,e.clientY); }
    function tm(e){ if(e.touches[0]) mv(e.touches[0].clientX,e.touches[0].clientY); }
    function up(){ chip.style.cursor='grab'; if(typeof debounceAutosave==='function') debounceAutosave();
      window.removeEventListener('mousemove',mm);window.removeEventListener('mouseup',up);
      window.removeEventListener('touchmove',tm);window.removeEventListener('touchend',up); }
    window.addEventListener('mousemove',mm);window.addEventListener('mouseup',up);
    window.addEventListener('touchmove',tm,{passive:false});window.addEventListener('touchend',up);
  }
  chip.addEventListener('mousedown',function(e){e.preventDefault();startDrag(e.clientX,e.clientY);});
  chip.addEventListener('touchstart',function(e){if(e.touches[0]){e.preventDefault();startDrag(e.touches[0].clientX,e.touches[0].clientY);}},{passive:false});
}
function renderSafetyMargin3pt(){ if(typeof chart3pt!=='undefined') renderSafetyConnector('chart3pt', chart3pt, ''); }
function renderSafetyMarginPld(){ if(typeof pldChart!=='undefined') renderSafetyConnector('pldChart', pldChart, 'pld-'); }
// PDF: safety-margin summary line — only when that chart's toggle is ON (so it never lands
// in a client report unless deliberately shown). The on-chart SVG overlay can't be captured
// by Chart.js toBase64Image, so the margin is reproduced here as text for the record.
function _safetyMarginPdf(pfx, chartKey){
  chartKey = chartKey || 'chart3pt';
  if(!smState[chartKey] || !smState[chartKey].on) return '';
  var m=_safetyMargin(pfx); if(!m) return '';
  var col=_smColor(m.psi, m.avail);
  var sign=m.psi>0?'+':'';
  var pctTxt=m.demPsi>0?(sign+(m.psi/m.demPsi*100).toFixed(0)+'%'):'—';
  return '<div style="margin-top:8px;text-align:center;font-size:9pt;color:#333;">'
    +'<span style="display:inline-block;border-left:4px solid '+col.c+';padding:4px 12px;background:#F7F7F7;border-radius:5px;">'
    +'<b style="color:#1a1a1a;">Safety Margin: </b>'
    +'<b style="color:'+col.c+';font-size:11pt;">'+sign+m.psi.toFixed(1)+' psi</b> '
    +'<span style="color:'+col.c+';font-weight:700;">('+pctTxt+' · '+col.word+')</span> '
    +'<span style="color:#666;">— actual output '+m.avail.toFixed(1)+' psi '+(m.basis==='golden'?'(pump w/ limiters)':'(water supply)')+' \u2212 demand '+m.demPsi.toFixed(0)+' psi @ '+m.demFlow.toLocaleString()+' gpm</span>'
    +'</span></div>';
}
function toggleSafetyMargin(chartKey){
  if(!smState[chartKey]) return;
  smState[chartKey].on=!smState[chartKey].on;
  if(chartKey==='chart3pt') renderSafetyMargin3pt(); else renderSafetyMarginPld();
  if(chartKey==='chart3pt' && typeof renderFigLegend3pt==='function') renderFigLegend3pt();
  if(chartKey==='pldChart' && typeof renderFigLegendPld==='function') renderFigLegendPld();
  if(typeof debounceAutosave==='function') debounceAutosave();
}

// Inline readout strip for the PDF report (string form, muted FRT palette)
function _buildReadoutStripHtml3pt(){
  var cells = stdData.map(function(row){
    var r=_calcFlowPoint(row);
    var dis=parseFloat(row.discharge), flow=rowFlow(row);
    var vtxt=r.verdict==='pass'?'PASS':r.verdict==='fail'?'FAIL':'—';
    var chipBg=r.verdict==='pass'?'#D2EBDC':r.verdict==='fail'?'#F4D6D6':'#eef0f4';
    var chipCol=r.verdict==='pass'?'#2f5740':r.verdict==='fail'?'#8E4444':'#A0AEC0';
    return '<td style="text-align:center;padding:6px 4px;border:1px solid #DDE1E7;">'
      +'<div style="font-size:7.5pt;font-weight:700;color:#A0AEC0;text-transform:uppercase;letter-spacing:.4px;">'+row.pct+' · '+row.label+'</div>'
      +'<div style="font-size:11pt;font-weight:700;color:#1C2333;">'+(!isNaN(dis)?dis+' psi':'—')+'</div>'
      +'<div style="font-size:7.5pt;color:#4A5568;">@ '+(!isNaN(flow)?flow.toLocaleString()+' gpm':'— gpm')+(row.rpm?' · '+row.rpm+' rpm':'')+'</div>'
      +'<span style="display:inline-block;font-size:7pt;font-weight:800;padding:1px 8px;border-radius:8px;margin-top:2px;background:'+chipBg+';color:'+chipCol+';">'+vtxt+'</span>'
      +'</td>';
  }).join('');
  return '<table style="width:100%;max-width:850px;margin:6px auto 0;border-collapse:collapse;table-layout:fixed;"><tr>'+cells+'</tr></table>';
}

function initChart3pt() {
  const canvas = document.getElementById('chart3pt');
  if(!canvas) return;
  if(chart3pt){ if(typeof Chart!=='undefined' && Chart.getChart && Chart.getChart(canvas)===chart3pt) return; chart3pt=null; }
  _destroyCanvasChart('chart3pt');
  // S213 redesign: muted FRT-family palette, edge labels (right axis) for measured discharge,
  // %-tags (0/100/150%) on measured only; all other on-canvas datalabels removed.
  // Marker/supply/demand values now live in the readout + supply strip beneath the figure.
  const labelOff = {display:false};
  chart3pt = new Chart(canvas.getContext('2d'), {
    type:'scatter',
    plugins:[],
    data:{ datasets:[
      // 0: Available Supply
      { label:'Available Supply', data:[], clip:10, borderColor:'#6E86B8', backgroundColor:'rgba(110,134,184,.09)',
        showLine:true, fill:true, tension:0, pointRadius:function(ctx){var d=ctx.dataset.data;return(ctx.dataIndex===0||ctx.dataIndex===d.length-1)?4:0;}, borderWidth:2, datalabels:labelOff},
      // 1: Pump Curve (Mfr.)
      { label:'Pump Curve (Mfr.)', data:[], borderColor:'#9C2742', backgroundColor:'transparent',
        showLine:true, fill:false, borderDash:[10,5], pointRadius:0, borderWidth:1.8, datalabels:labelOff},
      // 2: Discharge pressure (Measured)
      { label:'Discharge Pressure (Measured)', data:[], borderColor:'#5F8068', backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:6, pointBorderColor:'#5F8068', pointBorderWidth:2.5, pointBackgroundColor:'#fff', borderWidth:2.6,
        datalabels:labelOff},
      // 3: Net Pressure
      { label:'Net Pressure (Discharge \u2212 Suction)', data:[], borderColor:'#4A7BA8', backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:0, borderWidth:1.6, borderDash:[8,4,2,4], datalabels:labelOff},
      // 4: Static supply point
      { label:'_staticPt', data:[], borderColor:'#6E86B8', backgroundColor:'#6E86B8',
        pointStyle:'circle', pointRadius:5, showLine:false, datalabels:labelOff},
      // 5: Residual supply point
      { label:'_residualPt', data:[], borderColor:'#6E86B8', backgroundColor:'#fff',
        pointStyle:'triangle', pointRadius:6, pointBorderColor:'#6E86B8', pointBorderWidth:2, showLine:false, datalabels:labelOff},
      // 6: SD diagonal — orange, SOLID (Mark S335, matches 7-pt)
      { label:'Sprinkler Demand Line (SD)', data:[], borderColor:_chartLabelColor('#E67E22'), backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:0, borderWidth:1.8, datalabels:labelOff},
      // 7: SD point
      { label:'_sprDemPt', data:[], borderColor:_chartLabelColor('#E67E22'), backgroundColor:_chartLabelColor('#E67E22'),
        pointStyle:'circle', pointRadius:6, showLine:false, datalabels:labelOff},
      // 8: OHL — purple (matches Total Demand diamond), SOLID (Mark S335)
      { label:'Outside Hose Allow. (OHL)', data:[], borderColor:_chartLabelColor('#805AD5'), backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:0, borderWidth:2, datalabels:labelOff},
      // 9: Total demand diamond — purple, matches 4b (#805AD5)
      { label:'Total System Demand', data:[], borderColor:_chartLabelColor('#805AD5'), backgroundColor:_chartLabelColor('#805AD5'),
        pointStyle:'rectRot', pointRadius:9, showLine:false, datalabels:labelOff},
      // 10: PRV line
      { label:'PRV Rating', data:[], borderColor:'#A85959', backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:0, borderWidth:1.6, borderDash:[2,3], datalabels:labelOff},
      // 11: Cutsheet line
      { label:'Cutsheet (Design)', data:[], borderColor:'#4A7BA8', backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:2, borderWidth:1.4, borderDash:[2,3], datalabels:labelOff},
      // 12: Placard line
      { label:'Placard', data:[], borderColor:'#7D6F9C', backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:2, borderWidth:1.4, borderDash:[2,3], datalabels:labelOff},
      // 13: Pressure Reducing Valve cap — teal, flat dashed
      { label:'Pressure Reducing', data:[], borderColor:'#4A8C8C', backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:0, borderWidth:1.6, borderDash:[6,4], datalabels:labelOff},
      // 14: Pressure Relief Valve cap — mauve, flat dashed
      { label:'Pressure Relief', data:[], borderColor:'#B05A7A', backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:0, borderWidth:1.6, borderDash:[6,4], datalabels:labelOff},
      // 15: GOLDEN actual-output curve — gold, thick, drawn on top (lowest order = front)
      { label:'Actual Output (w/ limiters)', data:[], borderColor:'#D4A017', backgroundColor:'transparent',
        showLine:true, fill:false, tension:0, pointRadius:0, borderWidth:4, order:-1, datalabels:labelOff},
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      layout:{ padding:{ top:26, right:window.innerWidth<=520?18:(window.innerWidth<=768?60:72), bottom:6, left:window.innerWidth<=520?4:(window.innerWidth<=768?6:10) } },
      plugins:{
        legend:{ display:false },
        datalabels:{clip:false},
        tooltip:{ enabled:true, callbacks:{ label:function(c){ var x=c.parsed.x, y=c.parsed.y; var lab=c.dataset.label||''; if(lab.charAt(0)==='_') lab=lab.replace(/^_/,''); return lab+': '+Math.round(x).toLocaleString()+' gpm @ '+y+' psi'; } } }
      },
      scales:{
        x:{ type:'linear', min:0, title:{display:true,text:'Flow Rate (US gpm)',font:{size:11,weight:'600',family:'Calibri,sans-serif'}},
          grid:{color:_chartGrid()}, afterBuildTicks:hwTicks, ticks:{maxTicksLimit:14,callback:tickCb,font:{family:'Calibri,sans-serif',size:10}} },
        y:{ beginAtZero:true, afterDataLimits:function(axis){axis.max=Math.ceil(axis.max*1.15/10)*10;}, title:{display:true,text:'Pressure (psi)',font:{size:11,weight:'600',family:'Calibri,sans-serif'}},
          grid:{color:_chartGrid()}, min:0, ticks:{font:{family:'Calibri,sans-serif',size:10}} }
      }
    }
  });
}


