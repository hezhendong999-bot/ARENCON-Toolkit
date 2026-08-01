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


function buildCutsheetLine3pt() {
  return stdData.filter(function(r){return r.flow!==null&&r.cutsheet;})
    .map(function(r){return {x:parseFloat(r.flow)||0, y:parseFloat(r.cutsheet)||0};})
    .sort(function(a,b){return a.x-b.x;});
}
function buildPlacardLine3pt() {
  return stdData.filter(function(r){return r.flow!==null&&r.placard;})
    .map(function(r){return {x:parseFloat(r.flow)||0, y:parseFloat(r.placard)||0};})
    .sort(function(a,b){return a.x-b.x;});
}

function updateChart3pt() {
  if(!chart3pt) return;
  // Discharge — ONLY from stdData (4a), never from pldData (4b)
  const stdDis = stdData.map(r=>{
    const f=rowFlow(r); var d=parseFloat(r.discharge);
    if(isNaN(f)||isNaN(d)) return null;
    return {x:f,y:d,pct:r.pct};
  }).filter(Boolean).sort((a,b)=>a.x-b.x);
  // Net pressure — ONLY from stdData (4a)
  const stdNet = stdData.map(r=>{
    const f=rowFlow(r);
    var d=parseFloat(r.discharge), s=parseFloat(r.suction);
    if(isNaN(f)) return null;
    if(isNaN(d)&&isNaN(s)) return null;
    var net=(d||0)-(s||0);
    return {x:f,y:parseFloat(net.toFixed(1))};
  }).filter(Boolean).sort((a,b)=>a.x-b.x);
  // Static & residual supply points
  const sf3 = parseFloat(document.getElementById('ws-static-flow')?.value)||0;
  const sp3 = parseFloat(document.getElementById('ws-static-psi')?.value);
  const rf3 = parseFloat(document.getElementById('ws-res-flow')?.value);
  const rp3 = parseFloat(document.getElementById('ws-res-psi')?.value);
  const staticPt = (!isNaN(sp3)&&sp3>0) ? [{x:sf3,y:sp3}] : [];
  const residualPt = (!isNaN(rf3)&&!isNaN(rp3)&&rf3>0) ? [{x:rf3,y:rp3}] : [];

  chart3pt.data.datasets[0].data = buildSupplyLine3pt();
  chart3pt.data.datasets[1].data = buildPumpCurveLine();
  chart3pt.data.datasets[2].data = stdDis;
  chart3pt.data.datasets[3].data = [];   // S226: net moved to dedicated netChart3pt; slot kept inert
  chart3pt.data.datasets[4].data = staticPt;
  chart3pt.data.datasets[5].data = residualPt;
  chart3pt.data.datasets[6].data = getSprDemLine3pt();
  chart3pt.data.datasets[7].data = getSprDemPoint3pt();
  chart3pt.data.datasets[8].data = getOhlLine3pt();
  chart3pt.data.datasets[9].data = getDemandPoint3pt();
  // S227: Rated Press. (ref) line REMOVED from performance chart (rated pressure is a design
  //        reference, not a limiter — golden curve already caps to relief/reducing). Slot 10 inert.
  // S227: Cutsheet (11) + Placard (12) MOVED to the 3-pt net-pressure chart. Slots kept inert.
  const allDis3 = stdDis;
  const maxFlow3 = allDis3.length ? Math.max(...allDis3.map(p=>p.x)) : 3000;
  chart3pt.data.datasets[10].data = [];
  chart3pt.data.datasets[11].data = [];
  chart3pt.data.datasets[12].data = [];
  // 13/14: cap lines — flat, extend to 150% of rated flow (S226). Fallback to max measured flow
  //        if rated flow not entered. (Legend hides the dataset; smCapVis drives the golden min().)
  var ratedFlow3 = parseFloat(document.getElementById('pm-rated-flow')?.value);
  var maxFlowCap3 = (!isNaN(ratedFlow3)&&ratedFlow3>0)
    ? ratedFlow3*1.5
    : (stdDis.length ? Math.max(maxFlow3, Math.max.apply(null,stdDis.map(function(p){return p.x;}))) : 3000);
  var redV3 = parseFloat(document.getElementById('pm-reducing')?.value);
  var relV3 = parseFloat(document.getElementById('pm-relief')?.value);
  chart3pt.data.datasets[13].data = (!isNaN(redV3)&&redV3>0) ? [{x:0,y:redV3},{x:maxFlowCap3,y:redV3}] : [];
  chart3pt.data.datasets[14].data = (!isNaN(relV3)&&relV3>0) ? [{x:0,y:relV3},{x:maxFlowCap3,y:relV3}] : [];
  // 15: golden actual-output curve = min(measured discharge, lowest active cap)
  chart3pt.data.datasets[15].data = _goldenCurve('');
  // Shift x-axis left when only 0% data
  var allX3 = stdDis.map(function(p){return p.x;});
  var maxX3 = allX3.length ? Math.max.apply(null,allX3) : 0;
  chart3pt.options.scales.x.min = (allX3.length>0 && maxX3===0) ? -50 : undefined;
  chart3pt.update('none');
  if(typeof refreshFig3pt==='function') refreshFig3pt();
}

// ══════════════════════════════════════════════════
// CHART D (3-pt): 3-Point Net Pressure Curve
// Datasets: 0=Measured Net (indigo), 1=Adjusted Net RPM-corrected (cyan), 2=Cutsheet (lilac), 3=Placard (slate-violet, S227)
// Adjusted net = recorded net × (rated/recorded RPM)²  — canonical affinity law (_ratedRpm / row.rpm)
// ══════════════════════════════════════════════════
function initNetChart3pt() {
  const canvas = document.getElementById('netChart3pt');
  if(!canvas) return;
  if(netChart3pt){ if(typeof Chart!=='undefined' && Chart.getChart && Chart.getChart(canvas)===netChart3pt) return; netChart3pt=null; }
  _destroyCanvasChart('netChart3pt');
  const labelOff = {display:false};
  netChart3pt = new Chart(canvas.getContext('2d'), {
    type:'scatter',
    plugins:[],
    data:{ datasets:[
      // 0: Measured Net — Ledger indigo, solid bold
      {label:'Measured Net',data:[],borderColor:'#6366F1',backgroundColor:'transparent',
        showLine:true,fill:false,tension:0,pointRadius:6,pointBorderColor:'#6366F1',pointBorderWidth:2.5,pointBackgroundColor:'#fff',borderWidth:2.6,datalabels:labelOff},
      // 1: Adjusted Net (RPM-corrected) — Ledger cyan, dash-dot
      {label:'Adjusted Net (RPM-corrected)',data:[],borderColor:'#21D3ED',backgroundColor:'transparent',
        showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:1.8,borderDash:[8,4,2,4],datalabels:labelOff},
      // 2: Cutsheet curve — Ledger lilac, dotted
      {label:'Cutsheet (Design)',data:[],borderColor:'#A78BFA',backgroundColor:'transparent',
        showLine:true,fill:false,borderDash:[2,3],pointRadius:2,borderWidth:1.4,datalabels:labelOff},
      // 3: Placard curve — slate-violet, dashed (S227: moved here from performance chart)
      {label:'Placard',data:[],borderColor:'#7D6F9C',backgroundColor:'transparent',
        showLine:true,fill:false,borderDash:[5,3],pointRadius:2,borderWidth:1.4,datalabels:labelOff},
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      layout:{ padding:{ top:26, right:window.innerWidth<=520?18:(window.innerWidth<=768?60:72), bottom:6, left:window.innerWidth<=520?4:(window.innerWidth<=768?6:10) } },
      plugins:{
        legend:{ display:false },
        datalabels:{clip:false},
        tooltip:{ enabled:true, callbacks:{ label:function(c){ var x=c.parsed.x, y=c.parsed.y; var lab=c.dataset.label||''; return lab+': '+Math.round(x).toLocaleString()+' gpm @ '+y+' psi'; } } }
      },
      scales:{
        x:{ type:'linear', min:0, title:{display:true,text:'Flow Rate (US gpm)',font:{size:11,weight:'600',family:'Calibri,sans-serif'}},
          grid:{color:_chartGrid()}, afterBuildTicks:hwTicks, ticks:{maxTicksLimit:14,callback:tickCb,font:{family:'Calibri,sans-serif',size:10}} },
        y:{ beginAtZero:true, afterDataLimits:function(axis){axis.max=Math.ceil(axis.max*1.15/10)*10;}, title:{display:true,text:'Net Pressure (psi)',font:{size:11,weight:'600',family:'Calibri,sans-serif'}},
          grid:{color:_chartGrid()}, min:0, ticks:{font:{family:'Calibri,sans-serif',size:10}} }
      }
    }
  });
}

function updateNetChart3pt() {
  if(!netChart3pt) return;
  var rated=_ratedRpm();
  // Measured net + adjusted net, both from stdData (4a). Adjusted falls back to measured when no rpm pair.
  var measured=[], adjusted=[];
  stdData.forEach(function(r){
    var f=rowFlow(r); var d=parseFloat(r.discharge), s=parseFloat(r.suction), rpm=parseFloat(r.rpm);
    if(isNaN(f)||f<0) return;
    if(isNaN(d)&&isNaN(s)) return;
    var net=(d||0)-(s||0);
    measured.push({x:f,y:parseFloat(net.toFixed(1))});
    var adj=(!isNaN(rpm)&&rpm>0&&rated)?net*Math.pow(rated/rpm,2):net;
    adjusted.push({x:f,y:parseFloat(adj.toFixed(1))});
  });
  measured.sort(function(a,b){return a.x-b.x;});
  adjusted.sort(function(a,b){return a.x-b.x;});
  netChart3pt.data.datasets[0].data = measured;
  netChart3pt.data.datasets[1].data = adjusted;
  netChart3pt.data.datasets[2].data = buildCutsheetLine3pt();
  netChart3pt.data.datasets[3].data = buildPlacardLine3pt();
  var allXn = measured.map(function(p){return p.x;});
  var maxXn = allXn.length ? Math.max.apply(null,allXn) : 0;
  netChart3pt.options.scales.x.min = (allXn.length>0 && maxXn===0) ? -50 : undefined;
  netChart3pt.update('none');
  if(typeof refreshFigNet3pt==='function') refreshFigNet3pt();
  else if(typeof renderFigLegendNet3pt==='function') renderFigLegendNet3pt();
}

// ══════════════════════════════════════════════════
// CHART B: 7-Point PLD Discharge Pressure Curve
// Datasets: 0=supply, 1=pumpCurve, 2=measuredDis,
//           3=sprDemLine, 4=sprDemPt, 5=ohlLine, 6=totalDemand
// ══════════════════════════════════════════════════
function initPldChart() {
  const canvas = document.getElementById('pldChart');
  if(!canvas) return;
  // S241: if our global already matches the chart Chart.js has on this canvas, keep it.
  // Otherwise the global is stale/orphaned — destroy whatever is really on the canvas
  // and rebuild so the global and the visible instance can never diverge.
  if(pldChart){ if(typeof Chart!=='undefined' && Chart.getChart && Chart.getChart(canvas)===pldChart) return; pldChart=null; }
  _destroyCanvasChart('pldChart');
  const labelOff = {display:false};
  pldChart = new Chart(canvas.getContext('2d'), {
    type:'scatter',
    plugins:[],
    data:{ datasets:[
      // 0: Available Supply — steel-blue, solid + fill (Scheme A)
      {label:'Available Supply',data:[],clip:10,borderColor:'#6E86B8',backgroundColor:'rgba(110,134,184,.09)',showLine:true,fill:true,tension:0,pointRadius:function(ctx){var d=ctx.dataset.data;return(ctx.dataIndex===0||ctx.dataIndex===d.length-1)?4:0;},borderWidth:2,datalabels:labelOff},
      // 1: Pump Curve — burgundy, long-dash (Scheme A)
      {label:'Pump Curve (Mfr.)',data:[],borderColor:'#9C2742',backgroundColor:'transparent',showLine:true,fill:false,borderDash:[10,5],pointRadius:0,borderWidth:1.8,datalabels:labelOff},
      // 2: Measured Discharge w/ PLD — sage, solid bold (Scheme A measured)
      {label:'Measured Discharge (w/ PLD)',data:[],borderColor:'#5F8068',backgroundColor:'transparent',
        showLine:true,fill:false,tension:0,pointRadius:6,pointBorderColor:'#5F8068',pointBorderWidth:2.5,pointBackgroundColor:'#fff',borderWidth:2.6,datalabels:labelOff},
      // 3: SD line — orange (day) / muted (dark), SOLID (Mark S335)
      {label:'Sprinkler Demand (SD)',data:[],borderColor:_chartLabelColor('#E67E22'),backgroundColor:'transparent',showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:1.8,datalabels:labelOff},
      // 4: SD point — orange
      {label:'_sprDemPtPld',data:[],borderColor:_chartLabelColor('#E67E22'),backgroundColor:_chartLabelColor('#E67E22'),pointStyle:'circle',pointRadius:6,showLine:false,datalabels:labelOff},
      // 5: OHL — purple (matches Total System Demand diamond), SOLID (Mark S335)
      {label:'Outside Hose Allow. (OHL)',data:[],borderColor:_chartLabelColor('#805AD5'),backgroundColor:'transparent',showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:2,datalabels:labelOff},
      // 6: Total System Demand diamond — purple (day) / muted (dark)
      {label:'Total System Demand',data:[],borderColor:_chartLabelColor('#805AD5'),backgroundColor:_chartLabelColor('#805AD5'),pointStyle:'rectRot',pointRadius:9,showLine:false,datalabels:labelOff},
      // 7: Static supply point — steel-blue
      {label:'_staticPtPld',data:[],borderColor:'#6E86B8',backgroundColor:'#6E86B8',pointStyle:'circle',pointRadius:5,showLine:false,datalabels:labelOff},
      // 8: Residual supply point — steel-blue
      {label:'_residualPtPld',data:[],borderColor:'#6E86B8',backgroundColor:'#fff',pointStyle:'triangle',pointRadius:6,pointBorderColor:'#6E86B8',pointBorderWidth:2,showLine:false,datalabels:labelOff},
      // 9: PRV Rating — muted maroon, dotted (Scheme A)
      {label:'PRV Rating',data:[],borderColor:'#A85959',backgroundColor:'transparent',showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:1.6,borderDash:[2,3],datalabels:labelOff},
      // 10: PLD Setting — muted plum, dotted (Scheme A)
      {label:'PLD Setting',data:[],borderColor:'#7D6F9C',backgroundColor:'transparent',showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:1.6,borderDash:[2,3],datalabels:labelOff},
      // 11: Pressure Reducing Valve cap — teal, flat dashed
      {label:'Pressure Reducing',data:[],borderColor:'#4A8C8C',backgroundColor:'transparent',showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:1.6,borderDash:[6,4],datalabels:labelOff},
      // 12: Pressure Relief Valve cap — mauve, flat dashed
      {label:'Pressure Relief',data:[],borderColor:'#B05A7A',backgroundColor:'transparent',showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:1.6,borderDash:[6,4],datalabels:labelOff},
      // 13: GOLDEN actual-output curve — gold, thick, drawn on top
      {label:'Actual Output (w/ limiters)',data:[],borderColor:'#D4A017',backgroundColor:'transparent',showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:4,order:-1,datalabels:labelOff},
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      layout:{ padding:{ top:26, right:window.innerWidth<=520?18:(window.innerWidth<=768?60:72), bottom:6, left:window.innerWidth<=520?4:(window.innerWidth<=768?6:10) } },
      plugins:{
        legend:{ display:false },
        datalabels:{clip:false}
      },
      scales:{
        x:{ type:'linear', min:0, title:{display:true,text:'Flow Rate (US gpm)',font:{size:12,weight:'600'}},
          grid:{color:_chartGrid()}, afterBuildTicks:hwTicks, ticks:{maxTicksLimit:14,callback:tickCb} },
        y:{ beginAtZero:true, afterDataLimits:function(axis){axis.max=Math.ceil(axis.max*1.15/10)*10;}, title:{display:true,text:'Discharge Pressure (psi)',font:{size:12,weight:'600'}},
          grid:{color:_chartGrid()}, min:0 }
      }
    }
  });
}

function updatePldChart() {
  if(!pldChart) return;
  const wPLDDis = pldData.map(r=>{
    const f=rowFlow(r); var d=parseFloat(r.dis_w);
    if(isNaN(f)||f<0||isNaN(d)) return null;
    return {x:f,y:d};
  }).filter(Boolean).sort((a,b)=>a.x-b.x);
  pldChart.data.datasets[0].data = buildSupplyLinePld();
  pldChart.data.datasets[1].data = buildPldPumpCurveLine();
  pldChart.data.datasets[2].data = wPLDDis;
  pldChart.data.datasets[3].data = getSprDemLinePld();
  pldChart.data.datasets[4].data = getSprDemPointPld();
  pldChart.data.datasets[5].data = getOhlLinePld();
  pldChart.data.datasets[6].data = getDemandPointPld();
  // Water supply static & residual points
  const sfPld = parseFloat(document.getElementById('pld-ws-static-flow')?.value)||0;
  const spPld = parseFloat(document.getElementById('pld-ws-static-psi')?.value);
  const rfPld = parseFloat(document.getElementById('pld-ws-res-flow')?.value);
  const rpPld = parseFloat(document.getElementById('pld-ws-res-psi')?.value);
  pldChart.data.datasets[7].data = (!isNaN(spPld)&&spPld>0) ? [{x:sfPld,y:spPld}] : [];
  pldChart.data.datasets[8].data = (!isNaN(rfPld)&&!isNaN(rpPld)&&rfPld>0) ? [{x:rfPld,y:rpPld}] : [];
  // PRV / PLD / cap lines — extend to 150% rated flow (S226). Fallback to max measured flow.
  // S227: PRV Rating (Rated Press. ref) line REMOVED — rated pressure is a design reference,
  //        not a limiter (golden curve already caps to relief/reducing/PLD). Slot 9 inert.
  const maxMeasPld = wPLDDis.length ? Math.max(...wPLDDis.map(p=>p.x), 100) : 3000;
  const ratedFlowPld = parseFloat(document.getElementById('pm-rated-flow-pld')?.value);
  const maxFlowPld = (!isNaN(ratedFlowPld)&&ratedFlowPld>0) ? ratedFlowPld*1.5 : maxMeasPld;
  pldChart.data.datasets[9].data = [];
  // PLD setting line
  var pldSet = parseFloat(document.getElementById('pm-pld-setting')?.value)||0;
  pldChart.data.datasets[10].data = pldSet>0 ? [{x:0,y:pldSet},{x:maxFlowPld,y:pldSet}] : [];
  // 11/12: cap lines (reducing/relief) — flat to 150% rated flow when entered
  var redVPld = parseFloat(document.getElementById('pm-reducing-pld')?.value);
  var relVPld = parseFloat(document.getElementById('pm-relief-pld')?.value);
  pldChart.data.datasets[11].data = (!isNaN(redVPld)&&redVPld>0) ? [{x:0,y:redVPld},{x:maxFlowPld,y:redVPld}] : [];
  pldChart.data.datasets[12].data = (!isNaN(relVPld)&&relVPld>0) ? [{x:0,y:relVPld},{x:maxFlowPld,y:relVPld}] : [];
  // 13: golden actual-output curve = min(measured discharge, lowest active cap incl. PLD)
  pldChart.data.datasets[13].data = _goldenCurve('pld-');
  // Shift x-axis left when only 0% data so points show on y-axis edge
  var allXpld = wPLDDis.map(function(p){return p.x;});
  var maxXpld = allXpld.length ? Math.max.apply(null,allXpld) : 0;
  pldChart.options.scales.x.min = (allXpld.length>0 && maxXpld===0) ? -50 : undefined;
  pldChart.update('none');
  if(typeof refreshFigPld==='function') refreshFigPld();
  else if(typeof renderFigLegendPld==='function') renderFigLegendPld();
}

// ══════════════════════════════════════════════════
// CHART C: netPerfChart is now hidden (net is in chart3pt)
// Keep stub so initNetPerfChart doesn't crash
// ══════════════════════════════════════════════════
function initNetPerfChart() {
  // net pressure now lives inside chart3pt as dataset 3
  // This function is a no-op but kept to avoid errors
}
function updateNetPerfChart() {}

// ══════════════════════════════════════════════════
// CHART D: 7-Point Fire Pump Net Pressure Curve (w/ PLD + w/o PLD + PRV line)
// Datasets: 0=net7wPLD, 1=net3noPLD, 2=cutsheet, 3=placard, 4=prvLine
// ══════════════════════════════════════════════════
let pldNetChart = null;
function initPldNetChart() {
  const canvas = document.getElementById('pldNetChart');
  if(!canvas) return;
  if(pldNetChart){ if(typeof Chart!=='undefined' && Chart.getChart && Chart.getChart(canvas)===pldNetChart) return; pldNetChart=null; }
  _destroyCanvasChart('pldNetChart');
  const labelOff = {display:false};
  pldNetChart = new Chart(canvas.getContext('2d'), {
    type:'scatter',
    plugins:[],
    data:{ datasets:[
      // 0: Measured Net w/o PLD — Ledger indigo, solid bold
      {label:'Measured Net (w/o PLD)',data:[],borderColor:'#6366F1',backgroundColor:'transparent',
        showLine:true,fill:false,tension:0,pointRadius:6,pointBorderColor:'#6366F1',pointBorderWidth:2.5,pointBackgroundColor:'#fff',borderWidth:2.6,datalabels:labelOff},
      // 1: Adjusted Net w/o PLD (RPM-corrected) — Ledger cyan, dash-dot
      {label:'Adjusted Net (w/o PLD)',data:[],borderColor:'#21D3ED',backgroundColor:'transparent',
        showLine:true,fill:false,tension:0,pointRadius:0,borderWidth:1.8,borderDash:[8,4,2,4],datalabels:labelOff},
      // 2: Cutsheet — Ledger lilac, dotted
      {label:'Cutsheet (Design)',data:[],borderColor:'#A78BFA',backgroundColor:'transparent',
        showLine:true,fill:false,borderDash:[2,3],pointRadius:2,borderWidth:1.4,datalabels:labelOff},
      // 3: Placard — slate-violet, dashed (S227: moved off performance chart)
      {label:'Placard',data:[],borderColor:'#7D6F9C',backgroundColor:'transparent',
        showLine:true,fill:false,borderDash:[5,3],pointRadius:2,borderWidth:1.4,datalabels:labelOff},
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      layout:{ padding:{ top:26, right:window.innerWidth<=520?18:(window.innerWidth<=768?60:72), bottom:6, left:window.innerWidth<=520?4:(window.innerWidth<=768?6:10) } },
      plugins:{
        legend:{ display:false },
        datalabels:{clip:false}
      },
      scales:{
        x:{ type:'linear', min:0, title:{display:true,text:'Flow Rate (US gpm) — Q¹·⁸⁵ spacing',font:{size:12,weight:'600'}},
          grid:{color:_chartGrid()}, afterBuildTicks:hwTicks, ticks:{maxTicksLimit:14,callback:tickCb} },
        y:{ beginAtZero:true, afterDataLimits:function(axis){axis.max=Math.ceil(axis.max*1.15/10)*10;}, title:{display:true,text:'Net Pressure (psi)',font:{size:12,weight:'600'}},
          grid:{color:_chartGrid()}, min:0 }
      }
    }
  });
}

function updatePldNetChart() {
  if(!pldNetChart) return;
  var ratedPld=_ratedRpmPld();
  // Measured + Adjusted net w/o PRV & PLD (only on 25/50/75/125% rows — PLD_NO_SKIP holds the skips)
  var measured=[], adjusted=[];
  pldData.forEach(function(r,i){
    if(PLD_NO_SKIP.has(i)) return;
    var f=rowFlow(r);
    var d=parseFloat(r.dis_no), s=parseFloat(r.suc_no), rpm=parseFloat(r.rpm_no);
    if(isNaN(f)||f<0) return;
    if(isNaN(d)&&isNaN(s)) return;
    var net=(d||0)-(s||0);
    measured.push({x:f,y:parseFloat(net.toFixed(1))});
    var adj=(!isNaN(rpm)&&rpm>0&&ratedPld)?net*Math.pow(ratedPld/rpm,2):net;
    adjusted.push({x:f,y:parseFloat(adj.toFixed(1))});
  });
  measured.sort(function(a,b){return a.x-b.x;});
  adjusted.sort(function(a,b){return a.x-b.x;});
  // Cutsheet — show even when value is at flow=0
  const cs = pldData.map(r=>{ var f=rowFlow(r),c=parseFloat(r.cutsheet); return (!isNaN(f)&&!isNaN(c))?{x:f,y:c}:null; }).filter(Boolean).sort((a,b)=>a.x-b.x);
  // Placard (S227: moved here from performance chart)
  const pl = pldData.map(r=>{ var f=rowFlow(r),p=parseFloat(r.placard); return (!isNaN(f)&&!isNaN(p))?{x:f,y:p}:null; }).filter(Boolean).sort((a,b)=>a.x-b.x);
  pldNetChart.data.datasets[0].data = measured;
  pldNetChart.data.datasets[1].data = adjusted;
  pldNetChart.data.datasets[2].data = cs;
  pldNetChart.data.datasets[3].data = pl;
  var allXnet = measured.map(function(p){return p.x;});
  var maxXnet = allXnet.length ? Math.max.apply(null,allXnet) : 0;
  pldNetChart.options.scales.x.min = (allXnet.length>0 && maxXnet===0) ? -50 : undefined;
  pldNetChart.update('none');
  if(typeof refreshFigPldNet==='function') refreshFigPldNet();
  else if(typeof renderFigLegendPldNet==='function') renderFigLegendPldNet();
}


// ── Master update functions ──
function updateChart() { updateChart3pt(); }
function refreshAllCharts() { updateChart3pt(); updateNetChart3pt(); updatePldChart(); updatePldNetChart(); }
// S241: ROOT CAUSE of blank charts — console proved `pldChart === instance on canvas: false`:
// the global chart var pointed at a DEAD/orphaned Chart instance while Chart.js had a
// different (empty) instance bound to the visible canvas. Caused by applyChartDarkMode()
// destroy+rAF-reinit racing the boot/refresh init paths, leaving a duplicate Chart on
// the same canvas. Fix: before ANY new Chart(), destroy whatever Chart.js actually has
// registered on that canvas (Chart.getChart = source of truth, not the global var).
function _destroyCanvasChart(id){
  try {
    var canvas = document.getElementById(id);
    if(!canvas) return;
    var existing = (typeof Chart!=='undefined' && Chart.getChart) ? Chart.getChart(canvas) : null;
    if(existing && typeof existing.destroy === 'function') existing.destroy();
  } catch(e){}
}
// S242: THE REAL ROOT CAUSE (proven by console: rect.top=2157, off-screen at init).
// Chart.js with responsive:true renders blank when its canvas is far outside the
// viewport at paint time, and only repaints on an incidental reflow — that's the
// "shows up after ~20s" (really: when you scroll it into view). Fix: watch each
// chart canvas; the moment it enters the viewport, sync the global var to whatever
// chart Chart.js actually has on that canvas (handles orphaning too) and force a
// render. This is independent of init order, dark-mode races, and tab state.
var _chartVizObserver = null;
function _installChartVisibilityObserver(){
  try {
    if(_chartVizObserver) _chartVizObserver.disconnect();
    if(typeof IntersectionObserver === 'undefined') return;
    var map = { 'chart3pt':'chart3pt', 'netChart3pt':'netChart3pt', 'pldChart':'pldChart', 'pldNetChart':'pldNetChart' };
    _chartVizObserver = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var id = en.target.id;
        var live = (typeof Chart!=='undefined' && Chart.getChart) ? Chart.getChart(en.target) : null;
        if(!live) return; // not created yet; init paths will handle it
        // Sync the global variable to the instance actually bound to this canvas.
        try {
          if(id==='chart3pt') chart3pt=live;
          else if(id==='netChart3pt') netChart3pt=live;
          else if(id==='pldChart') pldChart=live;
          else if(id==='pldNetChart') pldNetChart=live;
        } catch(e){}
        // Push current data + force a real repaint now that it's on-screen.
        try {
          if(id==='chart3pt' && typeof updateChart3pt==='function') updateChart3pt();
          else if(id==='netChart3pt' && typeof updateNetChart3pt==='function') updateNetChart3pt();
          else if(id==='pldChart' && typeof updatePldChart==='function') updatePldChart();
          else if(id==='pldNetChart' && typeof updatePldNetChart==='function') updatePldNetChart();
          live.resize(); live.render();
        } catch(e){}
      });
    }, { root:null, rootMargin:'200px', threshold:0.01 });
    Object.keys(map).forEach(function(id){
      var el = document.getElementById(id);
      if(el) _chartVizObserver.observe(el);
    });
  } catch(e){ console.warn('[chart-observer] install failed:', e); }
}
// S239: reliable paint for the Performance Test (s4) charts. The old bug: charts
// were update()'d while their canvas had zero measured size (panel not laid out at
// load time), so Chart.js drew nothing until an incidental reflow (re-typing a field,
// or 30-60s later). Fix: init if needed, update data, then resize AFTER layout has
// settled. Double rAF + a delayed resize fallback covers the slow-layout case.
function _refreshS4Charts() {
  var _ptype = 'std';
  document.querySelectorAll('.pump-type-btns button').forEach(function(b){ if(b.classList.contains('on')) _ptype = b.dataset.ptype; });
  // S240: console proved the real bug — after load, the chart objects DO hold the
  // correct data and scale, but the canvas pixels were never flushed (a Chart.js
  // repaint miss when update() runs in the same frame as init/layout). resize() is a
  // no-op when size is unchanged, so it never forced a redraw. The fix: call an
  // explicit .resize() THEN .render() to force the pixels to flush. render() repaints
  // from current data without touching it — exactly what re-typing a field did.
  function _flush(ch){ if(!ch) return; try { ch.resize(); ch.update('none'); ch.render(); } catch(e){} }
  // S241: a chart is "live" only if our global is the SAME instance Chart.js has on the
  // canvas. If not (orphaned), force a rebuild — init now reconciles + destroys orphans.
  function _live(globalChart, id){
    if(!globalChart) return false;
    var canvas = document.getElementById(id);
    if(!canvas) return false;
    return (typeof Chart!=='undefined' && Chart.getChart) ? (Chart.getChart(canvas)===globalChart) : true;
  }
  function paint() {
    if (_ptype === 'pld') {
      if (!_live(pldChart,'pldChart')) { pldChart=null; initPldChart(); setTimeout(hookChartAnnotations, 200); } else { updatePldChart(); if(!document.getElementById('pldChart-annotations')) setTimeout(hookChartAnnotations, 100); }
      if (!_live(pldNetChart,'pldNetChart')) { pldNetChart=null; initPldNetChart(); setTimeout(hookChartAnnotations, 200); } else { updatePldNetChart(); if(!document.getElementById('pldNetChart-annotations')) setTimeout(hookChartAnnotations, 100); }
      _flush(pldChart); _flush(pldNetChart);
    } else {
      if (!_live(chart3pt,'chart3pt')) { chart3pt=null; initChart3pt(); setTimeout(hookChartAnnotations, 200); } else { updateChart3pt(); if(!document.getElementById('chart3pt-annotations')) setTimeout(hookChartAnnotations, 100); }
      if (!_live(netChart3pt,'netChart3pt')) { netChart3pt=null; initNetChart3pt(); setTimeout(hookChartAnnotations, 200); } else { updateNetChart3pt(); if(!document.getElementById('netChart3pt-annotations')) setTimeout(hookChartAnnotations, 100); }
      updateChart3pt(); updateNetChart3pt();
      _flush(chart3pt); _flush(netChart3pt);
    }
  }
  // First paint next frame (panel display flip needs one frame to lay out)...
  requestAnimationFrame(function(){ requestAnimationFrame(paint); });
  // ...and a forced render a beat later in case layout was still settling on the first pass.
  setTimeout(function(){
    if (_ptype === 'pld') { _flush(pldChart); _flush(pldNetChart); }
    else { _flush(chart3pt); _flush(netChart3pt); }
  }, 350);
}

// ── Dark Mode Chart Styling ──
function applyChartDarkMode() {
  try {
  var isDark = document.body.classList.contains('dark-mode');
  if(typeof Chart !== 'undefined') {
    Chart.defaults.color = isDark ? '#a0a8b8' : '#666';
    Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.05)';
  }
  // Destroy charts — they will be recreated with fresh colors when the tab is next visited
  if(chart3pt && typeof chart3pt.destroy === 'function') { chart3pt.destroy(); chart3pt = null; }
  if(netChart3pt && typeof netChart3pt.destroy === 'function') { netChart3pt.destroy(); netChart3pt = null; }
  if(pldChart && typeof pldChart.destroy === 'function') { pldChart.destroy(); pldChart = null; }
  if(pldNetChart && typeof pldNetChart.destroy === 'function') { pldNetChart.destroy(); pldNetChart = null; }
  // If currently on a chart tab, recreate immediately
  var curPanel = document.querySelector('.panel.active');
  var curId = curPanel ? curPanel.id.replace('panel-','') : '';
  if(curId === 's4') {
    var _pt='std'; document.querySelectorAll('.pump-type-btns button').forEach(function(b){ if(b.classList.contains('on')) _pt=b.dataset.ptype; });
    if(_pt==='pld'){
      requestAnimationFrame(function(){ if(!pldChart)initPldChart(); if(!pldNetChart)initPldNetChart(); updatePldChart(); updatePldNetChart(); setTimeout(hookChartAnnotations, 120); });
    } else {
      requestAnimationFrame(function(){ if(!chart3pt)initChart3pt(); if(!netChart3pt)initNetChart3pt(); updateChart3pt(); updateNetChart3pt(); setTimeout(hookChartAnnotations, 120); });
    }
  } else if(curId === 's4pld') { /* RETIRED S217 — merged into s4 */ }
  } catch(e) { /* silent — charts may not be initialized yet */ }
}


// ══════════════════════════════════════════════════
// EXPORT TO EMAIL
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// DEFICIENCY TABLE (contractor-grouped)
// ══════════════════════════════════════════════════
const contractors = [];
var distribution = [];       // S328: selected report recipients (Owner+Contractors+Other); persists in saved state, feeds PDF header Distribution line
let contractorTrades = {};   // S298: roster trade designation, name -> trade (additive; deficiencies stay keyed by name)
// ── DEFICIENCIES PANEL (state+render+CSV) → lib/ui/deficiencies.js (S500). Shared with beta; edit THERE. ──

// ══════════════════════════════════════════════════
// SIGNATURE
// ══════════════════════════════════════════════════
// ═══ S461: SIGNATURE PAD — shared module lib/ui/signaturePad.js ═══
// The S220 vector-stroke pad engine (init/ink/repaint/repaintAll/printSrc)
// moved VERBATIM into the shared module — same pixels, same behavior. State
// stays at window._sigStrokes exactly as before (save/load untouched); the
// forced-dark-ink PDF rule and the hidden-tab zero-width fallback ride along.
function initSig(canvasId) { return SigPad.init(canvasId); }
function _sigInk(){ return SigPad.ink(); }
function _sigRepaint(canvasId){ return SigPad.repaint(canvasId); }
function _sigRepaintAll(){ return SigPad.repaintAll(); }
function _sigPrintSrc(canvasId){ return SigPad.printSrc(canvasId); }

function clearSig() {
  const c=document.getElementById('sig-canvas');
  c.getContext('2d').clearRect(0,0,c.width,c.height);
  if(typeof _sigStrokes!=='undefined') _sigStrokes['sig-canvas']=[];
  const img=document.getElementById('sig-upload-img-1');
  if(img) { img.src=''; img.style.display='none'; }
  setSigMode(1,'draw');
  if(typeof updateCompletionOverview==='function') updateCompletionOverview();
}
function setSigMode(num, mode) {
  const canvas = document.getElementById(`sig-canvas${num===1?'':''}`) || document.getElementById(`sig-canvas-c-${num}`);
  const uploadImg = document.getElementById(`sig-upload-img-${num}`);
  const drawBtn = document.getElementById(`sig-mode-draw-${num}`);
  const uploadBtn = document.getElementById(`sig-mode-upload-${num}`);
  if(mode==='draw') {
    if(canvas) canvas.style.display='block';
    if(uploadImg) uploadImg.style.display='none';
    if(drawBtn) { drawBtn.style.background='var(--red)'; drawBtn.style.color='white'; drawBtn.style.borderColor='var(--red)'; }
    if(uploadBtn) { uploadBtn.style.background=''; uploadBtn.style.color=''; uploadBtn.style.borderColor=''; }
  } else {
    // trigger file pick
    const fi = document.getElementById(`sig-file-${num}`);
    if(fi) fi.click();
    if(uploadBtn) { uploadBtn.style.background='var(--red)'; uploadBtn.style.color='white'; uploadBtn.style.borderColor='var(--red)'; }
    if(drawBtn) { drawBtn.style.background=''; drawBtn.style.color=''; drawBtn.style.borderColor=''; }
  }
}
function loadSigUpload(num, input) {
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const canvas = document.getElementById(num===1?'sig-canvas':('sig-canvas-c-'+num));
    if(canvas) canvas.style.display='none';
    // An uploaded image replaces any drawn strokes — drop them so a theme
    // toggle doesn't repaint old ink over the uploaded signature.
    if(typeof _sigStrokes!=='undefined'){ _sigStrokes[num===1?'sig-canvas':('sig-canvas-c-'+num)]=[]; }
    const uploadImg = document.getElementById(`sig-upload-img-${num}`);
    if(uploadImg) { uploadImg.src=ev.target.result; uploadImg.style.display='block'; }
    if(num===1 && typeof updateCompletionOverview==='function') updateCompletionOverview();
  };
  r.readAsDataURL(f);
}
// Contractor sign rows
// Unified sign-off rows: contractors and witnesses
const contractorSignRows = []; // kept for backward compat with save/load
const witnessSignRows = [];

function addSignRow(type) {
  const arr = type==='witness' ? witnessSignRows : contractorSignRows;
  arr.push({ name:'', title:'', company:'', date:'', type });
  _renderSignSection(type);
}
function removeSignRow(type, i) {
  const arr = type==='witness' ? witnessSignRows : contractorSignRows;
  arr.splice(i,1);
  _renderSignSection(type);
}
function _renderSignSection(type) {
  // Only rebuild the specific section, leaving other signatures untouched
  if(type==='witness') {
    var wc = document.getElementById('witness-sign-rows');
    if(wc) wc.innerHTML = buildSignRowHtml(witnessSignRows,'witness','witness-sign-rows');
    witnessSignRows.forEach(function(_,i){ setTimeout(function(){initSig('sig-canvas-c-'+(i+100));},40); });
  } else {
    var cc = document.getElementById('contractor-sign-rows');
    if(cc) cc.innerHTML = buildSignRowHtml(contractorSignRows,'contractor','contractor-sign-rows');
    contractorSignRows.forEach(function(_,i){ setTimeout(function(){initSig('sig-canvas-c-'+(i+2));},40); });
  }
}
function addContractorSignRow() { addSignRow('contractor'); } // legacy alias

function buildSignRowHtml(arr, type, containerId) {
  const label = type==='witness' ? 'Witness' : 'Contractor';
  const accent = type==='witness' ? '#1A5276' : '#2C4770';
  if(!arr.length) return `<p style="font-size:12px;color:var(--silver);text-align:center;padding:12px;">No ${label.toLowerCase()}s added yet. Click "Add ${label}" above.</p>`;
  return arr.map((r,i)=>{
    const idx = (type==='witness' ? 100 : 2) + i;
    return `<div class="card" style="margin-bottom:12px;border:1.5px solid ${accent}22;">
      <div class="card-header" style="display:flex;justify-content:space-between;font-size:13px;padding:8px 14px;background:${accent}18;">
        <span style="font-weight:700;color:${accent};font-size:14px;">${label} ${i+1}</span>
        <button class="btn btn-outline btn-sm" style="font-size:11px;color:#A85959;border-color:#A85959;" onclick="removeSignRow('${type}',${i})">✕ Remove</button>
      </div>
      <div class="card-body" style="padding:12px 14px;">
        <div class="proj-grid" style="margin-bottom:10px;">
          <div class="field-group"><label>Name</label><input type="text" placeholder="Full name" value="${r.name}" oninput="${type==='witness'?'witnessSignRows':'contractorSignRows'}[${i}].name=this.value"></div>
          <div class="field-group"><label>Title / Role</label><input type="text" placeholder="${type==='witness'?'e.g. AHJ, Owner Rep':'e.g. Site Superintendent'}" value="${r.title}" oninput="${type==='witness'?'witnessSignRows':'contractorSignRows'}[${i}].title=this.value"></div>
          <div class="field-group"><label>Company / Organization</label><input type="text" placeholder="Company or organization" value="${r.company}" oninput="${type==='witness'?'witnessSignRows':'contractorSignRows'}[${i}].company=this.value"></div>
          <div class="field-group"><label>Date</label><input type="date" value="${r.date}" oninput="${type==='witness'?'witnessSignRows':'contractorSignRows'}[${i}].date=this.value"></div>
        </div>
        <div class="sig-wrap" id="sig-wrap-${idx}">
          <canvas class="sig-canvas" id="sig-canvas-c-${idx}" width="900" height="130" style="display:block;"></canvas>
          <img id="sig-upload-img-${idx}" src="" style="display:none;width:100%;height:130px;object-fit:contain;background:white;border-radius:6px;">
          <div class="sig-controls" style="flex-wrap:wrap;gap:6px;">
            <button class="btn btn-outline btn-sm" id="sig-mode-draw-${idx}" onclick="setSigMode(${idx},'draw')" style="background:var(--red);color:white;border-color:var(--red);">✏️ Draw</button>
            <button class="btn btn-outline btn-sm" id="sig-mode-upload-${idx}" onclick="setSigMode(${idx},'upload')">📁 Upload</button>
            <button class="btn btn-outline btn-sm" onclick="clearGenericSig(${idx})">🗑 Clear</button>
            <input type="file" id="sig-file-${idx}" accept="image/*" style="display:none" onchange="loadSigUpload(${idx},this)">
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}
function renderAllSignRows() {
  // Save existing signature data before destroying DOM
  var savedSigs = {};
  // Save consultant main signature
  var mainSigC = document.getElementById('sig-canvas');
  if(mainSigC) try { savedSigs['main'] = mainSigC.toDataURL(); } catch(e){}
  var mainSigImg = document.getElementById('sig-upload-img');
  if(mainSigImg && mainSigImg.src && mainSigImg.style.display!=='none') savedSigs['main-img'] = mainSigImg.src;
  // Save contractor sigs
  contractorSignRows.forEach(function(_,i) {
    var idx = i+2;
    var c = document.getElementById('sig-canvas-c-'+idx);
    if(c) try { savedSigs['c-'+idx] = c.toDataURL(); } catch(e){}
    var img = document.getElementById('sig-upload-img-'+idx);
    if(img && img.src && img.style.display!=='none') savedSigs['img-'+idx] = img.src;
  });
  // Save witness sigs
  witnessSignRows.forEach(function(_,i) {
    var idx = i+100;
    var c = document.getElementById('sig-canvas-c-'+idx);
    if(c) try { savedSigs['c-'+idx] = c.toDataURL(); } catch(e){}
    var img = document.getElementById('sig-upload-img-'+idx);
    if(img && img.src && img.style.display!=='none') savedSigs['img-'+idx] = img.src;
  });
  // Rebuild DOM
  var cc = document.getElementById('contractor-sign-rows');
  if(cc) cc.innerHTML = buildSignRowHtml(contractorSignRows,'contractor','contractor-sign-rows');
  var wc = document.getElementById('witness-sign-rows');
  if(wc) wc.innerHTML = buildSignRowHtml(witnessSignRows,'witness','witness-sign-rows');
  // Restore all signatures
  function restoreSig(canvasId, savedKey, imgKey) {
    setTimeout(function() {
      initSig(canvasId);
      // Prefer vector strokes: repaint in the current theme colour. This is what
      // survives a reload and recolours on dark-mode toggle. Bitmap is fallback.
      var strokes = (typeof _sigStrokes!=='undefined') ? _sigStrokes[canvasId] : null;
      if(strokes && strokes.length){
        _sigRepaint(canvasId);
      } else {
        var saved = savedSigs[savedKey];
        if(saved && saved.length > 100) {
          var c = document.getElementById(canvasId);
          if(c) { var im=new Image(); im.onload=function(){c.getContext('2d').drawImage(im,0,0);}; im.src=saved; }
        }
      }
      var savedI = savedSigs[imgKey];
      if(savedI) {
        var imgEl = document.getElementById(canvasId.replace('sig-canvas','sig-upload-img'));
        if(imgEl) { imgEl.src=savedI; imgEl.style.display='block'; }
      }
    }, 60);
  }
  contractorSignRows.forEach(function(_,i) { restoreSig('sig-canvas-c-'+(i+2), 'c-'+(i+2), 'img-'+(i+2)); });
  witnessSignRows.forEach(function(_,i) { restoreSig('sig-canvas-c-'+(i+100), 'c-'+(i+100), 'img-'+(i+100)); });
  // Restore consultant main sig — vector strokes first, bitmap fallback
  setTimeout(function() {
    var mStrokes = (typeof _sigStrokes!=='undefined') ? _sigStrokes['sig-canvas'] : null;
    if(mStrokes && mStrokes.length){
      _sigRepaint('sig-canvas');
    } else if(savedSigs['main'] && savedSigs['main'].length > 100) {
      var mc = document.getElementById('sig-canvas');
      if(mc) { var im=new Image(); im.onload=function(){mc.getContext('2d').drawImage(im,0,0);}; im.src=savedSigs['main']; }
    }
  }, 60);
  if(savedSigs['main-img']) {
    setTimeout(function() {
      var mi = document.getElementById('sig-upload-img');
      if(mi) { mi.src=savedSigs['main-img']; mi.style.display='block'; }
    }, 60);
  }
}
function clearGenericSig(idx) {
  const c = document.getElementById(`sig-canvas-c-${idx}`);
  if(c) c.getContext('2d').clearRect(0,0,c.width,c.height);
  if(typeof _sigStrokes!=='undefined') _sigStrokes[`sig-canvas-c-${idx}`]=[];
  const img = document.getElementById(`sig-upload-img-${idx}`);
  if(img) { img.src=''; img.style.display='none'; }
  setSigMode(idx,'draw');
}

// ══════════════════════════════════════════════════
// PANEL SWITCHING
// ══════════════════════════════════════════════════
const PANELS = ['proj','s1','s2','s3','s4','s5','defic','sign','sketch','photos'];
let _tabRendered = {};
function switchPanel(id) {
  // S312: a user-initiated panel switch dismisses any lingering jump-back pill,
  // but NOT the switch that is part of the jump itself (guarded by _jumpInProgress).
  if(typeof _removeJumpBackPill==='function' && !window._jumpInProgress) _removeJumpBackPill();
  PANELS.forEach(p => {
    document.getElementById('panel-'+p)?.classList.remove('active');
  });
  document.getElementById('panel-'+id)?.classList.add('active');
  // Phase-aware nav: ensure the panel's phase is active and its sub-nav is rendered
  if(typeof PHASES!=='undefined'){
    var ph = _phaseOf(id);
    if(ph!==_activePhase || !document.getElementById('tab-'+id)){
      _activePhase = ph;
      document.querySelectorAll('.phase-tab').forEach(function(t){ t.classList.remove('active'); });
      var pt = document.getElementById('phase-'+ph); if(pt) pt.classList.add('active');
      renderSubNav(ph);
    }
    document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.toggle('active', t.id==='tab-'+id); });
  }
  // Only do heavy work when actually needed
  try {
    if (id === 's4') {
      if (!_tabRendered.s4) { renderStdTable(); renderPumpCurveTable(); renderPldTable(); renderPldPumpCurveTable(); _tabRendered.s4 = true; _tabRendered.s4pld = true; }
      // Determine the active test type (the merged tab shows one section at a time)
      var _ptype = 'std';
      document.querySelectorAll('.pump-type-btns button').forEach(function(b){ if(b.classList.contains('on')) _ptype = b.dataset.ptype; });
      var _secStd = document.getElementById('perf-std');
      var _secPld = document.getElementById('perf-pld');
      if (_secStd) _secStd.style.display = (_ptype === 'pld') ? 'none' : '';
      if (_secPld) _secPld.style.display = (_ptype === 'pld') ? '' : 'none';
      _refreshS4Charts();
      setTimeout(fixStickyColumns,100);
      if(typeof _renderRecordZones==='function') _renderRecordZones();
    }
    if (id === 's4pld') { /* RETIRED S217: 7-Point merged into the s4 "Performance Test" tab. Inert per S137. */ }
    if (id === 'defic') { renderContractorTags(); renderDeficGroups(); renderGeneralDeficGroup(); updateDeficSummary(); }
    if (id === 'photos') { if(typeof _renderRecordZones==='function') _renderRecordZones(); if(typeof _renderPhotoGallery==='function') _renderPhotoGallery(); }
    if (id === 'sign') {
      // B1: the consultant pad is bound at boot while this tab is hidden; make
      // sure it (and any contractor/witness pads) are bound now that they're
      // laid out and reachable. initSig de-dupes, so this is safe to call again.
      if(typeof initSig==='function') initSig('sig-canvas');
    }
  updateNavButtons();
  } catch(err) { console.error('switchPanel chart error:', err); }
}

// ══════════════════════════════════════════════════
// PDF EXPORT
// ══════════════════════════════════════════════════
function getProjInfo() {
  return {
    projno: document.getElementById('pi-projno').value,
    client: document.getElementById('pi-client').value,
    projname: document.getElementById('pi-projname').value,
    addr: document.getElementById('pi-addr').value,
    prepby: document.getElementById('pi-prepby').value,
    date: document.getElementById('pi-date').value,
    contractor: document.getElementById('pi-contractor').value,
    version: document.getElementById('pi-version')?.value || '',
    revision: document.getElementById('pi-revision')?.value || formRevision,
    dateModified: document.getElementById('pi-date-modified')?.value || formDateModified,
  };
}

function _bakeAnnotationsOntoCanvas(ci, canvasId) {
  // S368: bake the LIVE annotation overlay onto the chart canvas so toBase64Image()
  // captures exactly what the inspector sees on screen. The prior version re-derived
  // labels from stored formatters only, which silently dropped every label drawn by
  // the S327 allow-list (Cutsheet / Placard / Sprinkler Demand / CAP lines / OHL /
  // force-toggled curves). Reading the overlay DOM is drift-proof: the overlay IS the
  // source of truth, produced by renderChartAnnotations.
  if(!ci) return;
  var _bakeWasDark = document.body.classList.contains('dark-mode');
  try {
    // 1) The PDF body is light/printable, so labels must be captured with the
    //    LIGHT-mode look (white pill + dark-readable per-curve text), never the
    //    dark chip. Temporarily drop dark-mode and RE-RENDER the overlay so the
    //    label colours resolve to their light-mode (un-brightened) curve colours.
    if(_bakeWasDark) document.body.classList.remove('dark-mode');
    if(typeof renderChartAnnotations === 'function' &&
       (typeof chartAnnotationsVisible==='undefined' || chartAnnotationsVisible[canvasId]!==false)){
      renderChartAnnotations(ci, canvasId);
    }
    var canvas = (typeof ci.canvas!=='undefined' && ci.canvas) || document.getElementById(canvasId);
    var overlay = document.getElementById(canvasId + '-annotations');
    if(!canvas || !overlay) return;
    var ctx = ci.ctx || canvas.getContext('2d');

    // Overlay is positioned inset:0 over the canvas, so its client box and the canvas
    // client box share an origin. Map overlay-pixel coords → canvas-bitmap coords using
    // the canvas' own client→bitmap scale (handles devicePixelRatio / CSS sizing).
    var cR = canvas.getBoundingClientRect();
    var oR = overlay.getBoundingClientRect();
    var sx = canvas.width  / (cR.width  || canvas.width);
    var sy = canvas.height / (cR.height || canvas.height);
    var dx = (oR.left - cR.left);   // overlay offset within canvas client box (≈0)
    var dy = (oR.top  - cR.top);

    ctx.save();
    // S503c FIX (root cause, harness-verified): Chart.js retinaScale leaves a persistent
    // setTransform(dpr,0,0,dpr,0,0) on the chart's context. The bake's own sx/sy already
    // map CSS->bitmap pixels, so painting through the chart transform double-scaled
    // everything (dpr^2): labels drifted right/down proportionally to position and drew
    // at 2x size on retina displays — the exact misplacement + giant pills seen in the
    // exported PDF. Neutralize to identity; ctx.restore() below reinstates Chart.js's.
    ctx.setTransform(1,0,0,1,0,0);

    // 2) Leader lines first (SVG <line> children), so labels paint over them.
    overlay.querySelectorAll('svg line').forEach(function(ln){
      var x1=parseFloat(ln.getAttribute('x1')), y1=parseFloat(ln.getAttribute('y1'));
      var x2=parseFloat(ln.getAttribute('x2')), y2=parseFloat(ln.getAttribute('y2'));
      if([x1,y1,x2,y2].some(isNaN)) return;
      ctx.strokeStyle = ln.getAttribute('stroke') || '#999';
      ctx.lineWidth = (parseFloat(ln.getAttribute('stroke-width'))||1) * Math.max(sx,sy);
      var da = (ln.getAttribute('stroke-dasharray')||'').split(/[ ,]+/).map(parseFloat).filter(function(n){return !isNaN(n);});
      ctx.setLineDash(da.length?da.map(function(n){return n*Math.max(sx,sy);}):[]);
      ctx.beginPath();
      ctx.moveTo((x1+dx)*sx, (y1+dy)*sy);
      ctx.lineTo((x2+dx)*sx, (y2+dy)*sy);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 3) Each label div. Position is its left/top with transform translate(-50%,-100%)
    //    → anchor = bottom-centre. Read color + text straight off the element.
    overlay.querySelectorAll('.chart-annotation-label').forEach(function(el){
      var lx = parseFloat(el.style.left), ly = parseFloat(el.style.top);
      if(isNaN(lx) || isNaN(ly)) return;
      var cs = getComputedStyle(el);
      var color = el.style.color || cs.color || '#333';
      var bg = cs.backgroundColor || 'rgba(255,255,255,0.9)';
      var hasBorder = cs.borderTopWidth && parseFloat(cs.borderTopWidth) > 0;
      var borderCol = cs.borderTopColor || 'rgba(0,0,0,0.12)';
      var text = el.textContent || '';
      if(!text) return;
      var lines = text.split('\n');
      // S503: match the on-screen label 1:1 — read the label's OWN computed font-size,
      // line-height and padding (cs already read above) and scale by the bitmap ratio.
      // window._annBump (default 1.0) is a live print-legibility multiplier: 1.0 = exact
      // screen match; >1 nudges labels up for the PDF's reduced chart width. (Prior S368
      // hardcoded 12.5/15.5 px = ~2.5× the 10px screen label → oversized/overlapping.)
      var _annBump = (typeof window!=='undefined' && +window._annBump) || 1;
      var _baseFont = parseFloat(cs.fontSize) || 10;
      var _baseLine = parseFloat(cs.lineHeight) || _baseFont * 1.25;
      var _basePadX = parseFloat(cs.paddingLeft); if(isNaN(_basePadX)) _basePadX = 5;
      var _basePadY = parseFloat(cs.paddingTop);  if(isNaN(_basePadY)) _basePadY = 1;
      var fpx = _baseFont * sy * _annBump;
      ctx.font = '600 ' + fpx.toFixed(1) + 'px Calibri, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      var lineH = _baseLine * sy * _annBump;
      var padX = _basePadX * sx, padY = _basePadY * sy;
      var maxW = 0;
      lines.forEach(function(l){ var w=ctx.measureText(l).width; if(w>maxW) maxW=w; });
      // anchor (bottom-centre) in bitmap space
      var ax = (lx + dx) * sx;
      var ay = (ly + dy) * sy;
      var boxW = maxW + padX*2;
      var boxH = lines.length*lineH + padY*2;
      var boxL = ax - boxW/2;
      var boxT = ay - boxH;          // grows upward from the anchor
      // background pill (matches the live label's computed background per mode)
      ctx.fillStyle = bg;
      var rr = 3*Math.min(sx,sy);
      if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(boxL, boxT, boxW, boxH, rr); ctx.fill(); if(hasBorder){ ctx.strokeStyle=borderCol; ctx.lineWidth=Math.max(sx,sy); ctx.stroke(); } }
      else { ctx.fillRect(boxL, boxT, boxW, boxH); }
      // text
      ctx.fillStyle = color;
      lines.forEach(function(l, li){
        var baseY = boxT + padY + (li+1)*lineH - (lineH - fpx)/2 - 1;
        ctx.fillText(l, ax, baseY);
      });
    });

    ctx.restore();
  } catch(e){ try{ console.warn('[bakeAnn] failed for '+canvasId, e); }catch(_){} }
  finally {
    // restore the inspector's mode + repaint the overlay for the screen
    if(_bakeWasDark){
      document.body.classList.add('dark-mode');
      try{ if(typeof renderChartAnnotations==='function') renderChartAnnotations(ci, canvasId); }catch(_){}
    }
  }
}

// ══════════════════════════════════════════════════


// ══════════════════════════════════════════════════
// SKETCH SYSTEM
// ══════════════════════════════════════════════════
const sketchEntries = [];
let sketchFileTarget = null;
let sketchUidCounter = 0;

function addSketchEntry() {
  const uid = sketchUidCounter++;
  sketchEntries.push({ comment:'', markupImg:null, uid:uid });
  const container = document.getElementById('sketch-entries');
  const displayNum = document.querySelectorAll('.sketch-entry').length + 1;

  const div = document.createElement('div');
  div.className = 'sketch-entry';
  div.id = `sketch-${uid}`;
  div.dataset.uid = uid;

  div.innerHTML = `
    <div class="sketch-entry-header">
      <div class="sketch-entry-num">Sketch / Markup #${displayNum}</div>
      <button class="btn btn-danger btn-sm" onclick="removeSketchEntry(${uid})">Remove</button>
    </div>
    <div class="sketch-entry-body" style="flex-direction:column;gap:0;display:flex;">
      <!-- TOP: freehand sketch canvas full width -->
      <div style="width:100%;">
        <div class="sketch-col-label">Freehand Sketch</div>
        <div class="sketch-canvas-wrap" id="scw-${uid}" style="overflow-x:auto;overflow-y:hidden;position:relative;">
          <canvas class="sketch-canvas" id="sc-${uid}" width="900" height="420" style="background:${document.body.classList.contains('dark-mode')?'rgba(255,255,255,.03)':'white'};display:block;"></canvas>
        </div>
        <!-- SKETCH TOOLBAR — full width -->
        <div class="sketch-toolbar" style="flex-wrap:wrap;gap:4px;margin-top:2px;">
          <!-- Tools row -->
          <div style="display:flex;align-items:center;gap:4px;width:100%;flex-wrap:wrap;padding-bottom:4px;border-bottom:1px solid var(--border);margin-bottom:4px;">
            <button class="tool-btn active" id="stool-pen-${uid}" onclick="setSketchTool(${uid},'pen')">✏️ Pen</button>
            <button class="tool-btn" id="stool-highlight-${uid}" onclick="setSketchTool(${uid},'highlight')">🟡 Highlight</button>
            <button class="tool-btn" id="stool-text-${uid}" onclick="setSketchTool(${uid},'text')">T Text</button>
            <button class="tool-btn" id="stool-select-${uid}" onclick="setSketchTool(${uid},'select')" title="Move text labels">☝ Select</button>
            <button class="tool-btn" id="stool-erase-${uid}" onclick="setSketchTool(${uid},'erase')">⬜ Erase</button>
            <span style="width:1px;height:20px;background:var(--border);margin:0 4px;"></span>
            <!-- Text formatting (shown when text tool active) -->
            <span id="stool-text-opts-${uid}" style="display:none;align-items:center;gap:4px;">
              <button class="tool-btn" id="stool-bold-${uid}" onclick="toggleSketchTextStyle(${uid},'bold')" title="Bold" style="font-weight:700;">B</button>
              <button class="tool-btn" id="stool-italic-${uid}" onclick="toggleSketchTextStyle(${uid},'italic')" title="Italic" style="font-style:italic;">I</button>
              <button class="tool-btn" id="stool-underline-${uid}" onclick="toggleSketchTextStyle(${uid},'underline')" title="Underline" style="text-decoration:underline;">U</button>
              <select id="stool-fontsize-${uid}" onchange="sketchState[${uid}].fontSize=+this.value" style="font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;">
                <option value="10">10</option><option value="12">12</option><option value="14">14</option><option value="16" selected>16</option>
                <option value="18">18</option><option value="20">20</option><option value="24">24</option><option value="28">28</option>
                <option value="32">32</option><option value="40">40</option><option value="48">48</option><option value="64">64</option>
              </select>
            </span>
            <span style="width:1px;height:20px;background:var(--border);margin:0 4px;"></span>
            <!-- Colors -->
            <div class="color-dot ${document.body.classList.contains('dark-mode')?'':'active'}" style="background:#1C2333;" data-color="#1C2333" onclick="setSketchColor(${uid},'#1C2333',this)"></div>
            <div class="color-dot" style="background:#A85959;" data-color="#A85959" onclick="setSketchColor(${uid},'#A85959',this)"></div>
            <div class="color-dot" style="background:#1A7A4A;" data-color="#1A7A4A" onclick="setSketchColor(${uid},'#1A7A4A',this)"></div>
            <div class="color-dot" style="background:#2196F3;" data-color="#2196F3" onclick="setSketchColor(${uid},'#2196F3',this)"></div>
            <div class="color-dot" style="background:#E67E22;" data-color="#E67E22" onclick="setSketchColor(${uid},'#E67E22',this)"></div>
            <div class="color-dot" style="background:#F1C40F;" data-color="#F1C40F" onclick="setSketchColor(${uid},'#F1C40F',this)"></div>
            <div class="color-dot ${document.body.classList.contains('dark-mode')?'active':''}" style="background:#ffffff;border-color:#888;" data-color="#ffffff" onclick="setSketchColor(${uid},'#ffffff',this)"></div>
          </div>
          <!-- Sliders row -->
          <div style="display:flex;align-items:center;gap:10px;width:100%;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:160px;">
              <span style="font-size:11px;color:var(--silver);white-space:nowrap;">Thickness:</span>
              <button onclick="var v=Math.max(1,sketchState[${uid}].size-1);sketchState[${uid}].size=v;document.getElementById('ssize-lbl-${uid}').textContent=v+'px';" style="background:var(--border,#ccc);border:none;width:26px;height:26px;border-radius:4px;cursor:pointer;font-size:14px;">−</button>
              <span id="ssize-lbl-${uid}" style="font-size:11px;min-width:28px;text-align:center;">3px</span>
              <button onclick="var v=Math.min(30,sketchState[${uid}].size+1);sketchState[${uid}].size=v;document.getElementById('ssize-lbl-${uid}').textContent=v+'px';" style="background:var(--border,#ccc);border:none;width:26px;height:26px;border-radius:4px;cursor:pointer;font-size:14px;">+</button>
            </div>
            <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:160px;" id="salpha-wrap-${uid}">
              <span style="font-size:11px;color:var(--silver);white-space:nowrap;">Opacity:</span>
              <button onclick="var e=document.getElementById('salpha-${uid}');var v=Math.max(10,+e.value-10);e.value=v;sketchState[${uid}].alpha=v/100;document.getElementById('salpha-lbl-${uid}').textContent=v+'%';" style="background:var(--border,#ccc);border:none;width:26px;height:26px;border-radius:4px;cursor:pointer;font-size:14px;">−</button>
              <input type="hidden" id="salpha-${uid}" value="100">
              <span id="salpha-lbl-${uid}" style="font-size:11px;min-width:32px;text-align:center;">100%</span>
              <button onclick="var e=document.getElementById('salpha-${uid}');var v=Math.min(100,+e.value+10);e.value=v;sketchState[${uid}].alpha=v/100;document.getElementById('salpha-lbl-${uid}').textContent=v+'%';" style="background:var(--border,#ccc);border:none;width:26px;height:26px;border-radius:4px;cursor:pointer;font-size:14px;">+</button>
            </div>
            <div style="display:flex;align-items:center;gap:4px;margin-left:auto;">
              <span style="font-size:11px;color:var(--silver);">Zoom:</span>
              <button class="tool-btn" onclick="sketchZoom(${uid},-1)" style="padding:2px 8px;font-size:14px;font-weight:700;">−</button>
              <span id="szoom-label-${uid}" style="font-size:11px;min-width:36px;text-align:center;font-weight:600;">100%</span>
              <button class="tool-btn" onclick="sketchZoom(${uid},1)" style="padding:2px 8px;font-size:14px;font-weight:700;">+</button>
              <button class="tool-btn" onclick="sketchZoomReset(${uid})" style="font-size:10px;padding:2px 6px;">↺</button>
              <span style="width:1px;height:20px;background:var(--border);margin:0 4px;"></span>
              <button class="tool-btn" onclick="undoSketch(${uid})" title="Undo">↩ Undo</button>
              <button class="tool-btn" onclick="clearSketchCanvas(${uid})" style="color:#A85959;">🗑 Clear</button>
            </div>
          </div>
        </div>
      </div>

      <!-- BOTTOM: photo markup -->
      <div style="width:100%;margin-top:12px;border-top:1.5px solid var(--border);padding-top:12px;">
        <div class="sketch-col-label">Photo Upload &amp; Markup</div>
        <div class="markup-canvas-wrap" id="markup-wrap-${uid}" style="max-width:100%;">
          <div class="markup-placeholder ev-clickable" id="markup-placeholder-${uid}" onclick="_boxUp(event,function(){_sketchPhotoUpload(${uid})})" ondragover="event.preventDefault();this.style.borderColor='var(--red)'" ondragleave="this.style.borderColor=''" ondrop="event.preventDefault();this.style.borderColor='';_sketchPhotoDrop(event,${uid})" style="border:2px dashed var(--border);border-radius:8px;padding:20px;min-height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:default;background:var(--smoke);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="13" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
            <div style="font-size:13px;color:#888;">Drag & drop a site photo here to annotate</div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" style="background:#5C7A65;color:white;border:none;border-radius:6px;cursor:pointer;" onclick="_sketchPhotoCamera(${uid})">📷 Camera</button>
              
              <button class="btn btn-sm" style="background:#8A7689;color:white;border:none;border-radius:6px;cursor:pointer;" onclick="_galleryReuseSketch(${uid})">🖼 Gallery</button>
            </div>
          </div>
        </div>
        <div id="markup-toolbar-${uid}" style="display:none;">
          <div class="sketch-toolbar" style="background:var(--smoke);border:1.5px solid var(--border);border-top:none;border-radius:0 0 8px 8px;flex-wrap:wrap;gap:4px;">
            <button class="tool-btn active" id="mtool-pen-${uid}" onclick="setMarkupTool(${uid},'pen')">✏️ Draw</button>
            <button class="tool-btn" id="mtool-highlight-${uid}" onclick="setMarkupTool(${uid},'highlight')">🟡 Highlight</button>
            <button class="tool-btn" id="mtool-arrow-${uid}" onclick="setMarkupTool(${uid},'arrow')">➡ Arrow</button>
            <button class="tool-btn" id="mtool-rect-${uid}" onclick="setMarkupTool(${uid},'rect')">⬛ Box</button>
            <button class="tool-btn" id="mtool-text-${uid}" onclick="setMarkupTool(${uid},'text')">T Text</button>
            <button class="tool-btn" id="mtool-erase-${uid}" onclick="setMarkupTool(${uid},'erase')">⬜ Erase</button>
            <div class="color-dot active" style="background:#A85959;" data-color="#A85959" onclick="setMarkupColor(${uid},'#A85959',this)"></div>
            <div class="color-dot" style="background:#E67E22;" data-color="#E67E22" onclick="setMarkupColor(${uid},'#E67E22',this)"></div>
            <div class="color-dot" style="background:#1C2333;" data-color="#1C2333" onclick="setMarkupColor(${uid},'#1C2333',this)"></div>
            <div class="color-dot" style="background:#2196F3;" data-color="#2196F3" onclick="setMarkupColor(${uid},'#2196F3',this)"></div>
            <div class="color-dot" style="background:#F1C40F;" data-color="#F1C40F" onclick="setMarkupColor(${uid},'#F1C40F',this)"></div>
            <div style="display:flex;align-items:center;gap:5px;margin-left:auto;">
              <span style="font-size:11px;color:var(--silver);">Size:</span>
              <button onclick="var e=document.getElementById('msize-${uid}');e.value=Math.max(1,+e.value-1);" style="background:var(--border,#ccc);border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">−</button>
              <input type="hidden" id="msize-${uid}" value="3">
              <button onclick="var e=document.getElementById('msize-${uid}');e.value=Math.min(20,+e.value+1);" style="background:var(--border,#ccc);border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">+</button>
              <span style="font-size:11px;color:var(--silver);margin-left:6px;">Opacity:</span>
              <button onclick="var e=document.getElementById('malpha-${uid}');var v=Math.max(10,+e.value-10);e.value=v;sketchState[${uid}].malpha=v/100;" style="background:var(--border,#ccc);border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">−</button>
              <input type="hidden" id="malpha-${uid}" value="100">
              <button onclick="var e=document.getElementById('malpha-${uid}');var v=Math.min(100,+e.value+10);e.value=v;sketchState[${uid}].malpha=v/100;" style="background:var(--border,#ccc);border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">+</button>
            </div>
            <button class="tool-btn" onclick="undoMarkup(${uid})">↩ Undo</button>
            <button class="tool-btn" onclick="clearMarkupCanvas(${uid})">🗑 Clear</button>
            <button class="btn btn-outline btn-sm" onclick="triggerSketchPhoto(${uid})" style="font-size:calc(12.5px + var(--ts));">📷 Change Photo</button>
          </div>
        </div>
      </div>
    </div>
    <!-- comment spans full width -->
    <div style="padding:0 16px 16px;">
      <div class="sketch-col-label">Comment / Notes</div>
      <textarea class="sketch-comment" placeholder="Describe what this sketch shows, location, issue noted, reference to deficiency number, etc." oninput="sketchEntries[${uid}].comment=this.value"></textarea>
    </div>`;

  container.appendChild(div);
  initSketchCanvas(uid);
}

// per-sketch state
const sketchState = {};
// Undo stacks: { idx: [ imageDataURL, ... ] }
const sketchUndoStack = {};
const markupUndoStack = {};

function pushSketchUndo(idx) {
  if(!sketchUndoStack[idx]) sketchUndoStack[idx] = [];
  const c = document.getElementById('sc-'+idx);
  if(c) sketchUndoStack[idx].push(c.toDataURL());
  if(sketchUndoStack[idx].length > 30) sketchUndoStack[idx].shift();
}
function undoSketch(idx) {
  const stack = sketchUndoStack[idx];
  if(!stack || !stack.length) return;
  const c = document.getElementById('sc-'+idx);
  const ctx = c.getContext('2d');
  const prev = stack.pop();
  const img = new Image();
  img.onload = () => { ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(img,0,0); };
  img.src = prev;
}
function pushMarkupUndo(idx) {
  if(!markupUndoStack[idx]) markupUndoStack[idx] = [];
  const c = document.getElementById('mc-'+idx);
  if(c) markupUndoStack[idx].push(c.toDataURL());
  if(markupUndoStack[idx].length > 30) markupUndoStack[idx].shift();
}
function undoMarkup(idx) {
  const stack = markupUndoStack[idx];
  if(!stack || !stack.length) return;
  const c = document.getElementById('mc-'+idx);
  const ctx = c.getContext('2d');
  const prev = stack.pop();
  const img = new Image();
  img.onload = () => { ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(img,0,0); };
  img.src = prev;
}

function initSketchCanvas(uid) {
  var _isDark = document.body.classList.contains('dark-mode');
  sketchState[uid] = {
    tool: 'pen', color: _isDark ? '#ffffff' : '#1C2333', size: 3, alpha: 1.0,
    fontSize: 16, textBold: false, textItalic: false, textUnderline: false,
    mtool: 'pen', mcolor: '#A85959', msize: 3, malpha: 1.0,
    drawing: false, startX:0, startY:0, snapshot:null,
    strokePts: [], // for highlight: accumulate all points in stroke
    zoomPct: 100
  };
  const canvas = document.getElementById(`sc-${uid}`);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = _isDark ? 'rgba(255,255,255,.03)' : 'white';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const getPos = (e, c) => {
    const r = c.getBoundingClientRect();
    const scX = c.width/r.width, scY = c.height/r.height;
    if(e.touches) return {x:(e.touches[0].clientX-r.left)*scX,y:(e.touches[0].clientY-r.top)*scY};
    return {x:(e.clientX-r.left)*scX,y:(e.clientY-r.top)*scY};
  };

  // Offscreen highlight canvas for this sketch panel (prevents opacity stacking)
  const hlCanvas = document.createElement('canvas');
  hlCanvas.width = canvas.width; hlCanvas.height = canvas.height;
  const hlCtx = hlCanvas.getContext('2d');

  const applySketchStyle = (ctx, st) => {
    if(st.tool==='erase') {
      ctx.globalCompositeOperation='destination-out';
      ctx.strokeStyle='rgba(0,0,0,1)'; ctx.lineWidth=Math.max(st.size||3,14); ctx.globalAlpha=1;
    } else if(st.tool==='highlight') {
      ctx.globalCompositeOperation='source-over';
      ctx.strokeStyle=st.color||'#F1C40F';
      ctx.lineWidth=st.size||20; ctx.globalAlpha=st.alpha!=null?Math.min(st.alpha,0.55):0.4;
    } else {
      ctx.globalCompositeOperation='source-over';
      ctx.strokeStyle=st.color; ctx.lineWidth=st.size||3; ctx.globalAlpha=st.alpha!=null?st.alpha:1;
    }
    ctx.lineCap='round'; ctx.lineJoin='round';
  };

  // Draw highlight stroke: render ALL points on offscreen canvas to avoid self-overlap,
  // then composite once onto the main canvas snapshot
  const drawHighlightStroke = (st) => {
    const pts = st.strokePts;
    if(!pts||pts.length<2) return;
    // Restore snapshot
    if(st.snapshot) ctx.putImageData(st.snapshot, 0, 0);
    // Draw entire stroke on offscreen canvas at opacity 1
    hlCtx.clearRect(0, 0, hlCanvas.width, hlCanvas.height);
    hlCtx.globalCompositeOperation = 'source-over';
    hlCtx.strokeStyle = st.color||'#F1C40F';
    hlCtx.lineWidth = st.size||20;
    hlCtx.globalAlpha = 1;
    hlCtx.lineCap = 'round';
    hlCtx.lineJoin = 'round';
    hlCtx.beginPath();
    hlCtx.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length;i++) hlCtx.lineTo(pts[i].x, pts[i].y);
    hlCtx.stroke();
    // Composite offscreen onto main at target alpha
    ctx.globalAlpha = st.alpha!=null ? Math.min(st.alpha,0.55) : 0.55;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(hlCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
  canvas.addEventListener('mousedown',e=>{
    const st=sketchState[uid];
    if(st.tool==='text') {
      var p2=getPos(e,canvas);
      var br=canvas.getBoundingClientRect();
      var pxX=p2.x*(br.width/canvas.width);
      var pxY=p2.y*(br.height/canvas.height);
      _createSketchTextLabel(uid, pxX, pxY, st);
      return;
    }
    if(st.tool==='select') {
      _skInitStrokes(uid);
      var sp=getPos(e,canvas);
      var hit=_skHitTest(uid, sp.x, sp.y);
      _skSelected[uid]=hit>=0?hit:null;
      if(hit>=0) { _skDragStart={x:sp.x, y:sp.y, uid:uid, si:hit}; }
      _skRedraw(uid);
      return;
    }
    st.drawing=true;
    pushSketchUndo(uid);
    _skInitStrokes(uid);
    st._curStroke = {points:[], color:st.color, size:st.tool==='highlight'?(st.size||20):(st.size||3), tool:st.tool, alpha:st.alpha!=null?st.alpha:1};
    const p=getPos(e,canvas);
    st._curStroke.points.push({x:p.x,y:p.y});
    if(st.tool==='highlight') {
      st.snapshot = ctx.getImageData(0,0,canvas.width,canvas.height);
      st.strokePts = [{x:p.x,y:p.y}];
    } else {
      ctx.beginPath(); ctx.moveTo(p.x,p.y);
    }
  });
  canvas.addEventListener('mousemove',e=>{
    const st=sketchState[uid];
    if(st.tool==='select' && _skDragStart && _skDragStart.uid===uid) {
      var sp=getPos(e,canvas);
      var dx=sp.x-_skDragStart.x, dy=sp.y-_skDragStart.y;
      _skMoveStroke(uid, _skDragStart.si, dx, dy);
      _skDragStart.x=sp.x; _skDragStart.y=sp.y;
      _skRedraw(uid);
      return;
    }
    if(!st.drawing) return;
    const p=getPos(e,canvas);
    if(st._curStroke) st._curStroke.points.push({x:p.x,y:p.y});
    if(st.tool==='highlight') {
      st.strokePts.push({x:p.x,y:p.y});
      drawHighlightStroke(st);
    } else {
      applySketchStyle(ctx, st);
      ctx.lineTo(p.x,p.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x,p.y);
    }
  });
  canvas.addEventListener('mouseup',()=>{
    const st=sketchState[uid];
    if(st.tool==='select') { _skDragStart=null; return; }
    st.drawing=false;
    if(st.tool==='highlight' && st.strokePts && st.strokePts.length>1) drawHighlightStroke(st);
    if(st._curStroke && st._curStroke.points.length>1) {
      _skInitStrokes(uid);
      _skStrokes[uid].push(st._curStroke);
    }
    st._curStroke=null; st.strokePts=[]; st.snapshot=null;
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  });
  canvas.addEventListener('mouseleave',()=>{
    const st=sketchState[uid];
    if(st.tool==='select') { _skDragStart=null; return; }
    st.drawing=false;
    if(st.tool==='highlight' && st.strokePts && st.strokePts.length>1) drawHighlightStroke(st);
    if(st._curStroke && st._curStroke.points.length>1) {
      _skInitStrokes(uid); _skStrokes[uid].push(st._curStroke);
    }
    st._curStroke=null; st.strokePts=[]; st.snapshot=null;
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  });
  canvas.addEventListener('touchstart',e=>{
    e.preventDefault(); const st=sketchState[uid];
    if(st.tool==='select') {
      _skInitStrokes(uid);
      var sp=getPos(e,canvas);
      var hit=_skHitTest(uid, sp.x, sp.y);
      _skSelected[uid]=hit>=0?hit:null;
      if(hit>=0) { _skDragStart={x:sp.x, y:sp.y, uid:uid, si:hit}; }
      _skRedraw(uid); return;
    }
    st.drawing=true;
    pushSketchUndo(uid);
    _skInitStrokes(uid);
    st._curStroke = {points:[], color:st.color, size:st.tool==='highlight'?(st.size||20):(st.size||3), tool:st.tool, alpha:st.alpha!=null?st.alpha:1};
    const p=getPos(e,canvas);
    st._curStroke.points.push({x:p.x,y:p.y});
    ctx.beginPath(); ctx.moveTo(p.x,p.y);
  },{passive:false});
  canvas.addEventListener('touchmove',e=>{
    e.preventDefault(); const st=sketchState[uid]; if(!st.drawing) return;
    const p=getPos(e,canvas);
    if(st.tool==='highlight') {
      st.strokePts.push({x:p.x,y:p.y});
      drawHighlightStroke(st);
    } else {
      applySketchStyle(ctx, st);
      ctx.lineTo(p.x,p.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x,p.y);
    }
  },{passive:false});
  canvas.addEventListener('touchend',()=>{
    const st=sketchState[uid]; st.drawing=false;
    if(st.tool==='highlight' && st.strokePts && st.strokePts.length>1) drawHighlightStroke(st);
    if(st._curStroke && st._curStroke.points.length>1) {
      _skInitStrokes(uid); _skStrokes[uid].push(st._curStroke);
    }
    st._curStroke=null; st.strokePts=[]; st.snapshot=null;
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  });
  // Keyboard: Delete/Backspace removes selected stroke
  document.addEventListener('keydown', function(ev) {
    if(ev.key==='Delete'||ev.key==='Backspace') {
      var st2=sketchState[uid];
      if(st2 && st2.tool==='select' && _skSelected[uid]!=null) {
        ev.preventDefault(); _skDeleteSelected(uid);
      }
    }
  });
}

function sketchZoom(idx, dir) {
  const st = sketchState[idx];
  if(!st) return;
  const levels = [50,75,100,125,150,200,250,300,400];
  const cur = Math.round(st.zoomPct||100);
  let ci = levels.findIndex(l=>l>=cur);
  if(ci<0) ci=2;
  ci = Math.max(0, Math.min(levels.length-1, ci+dir));
  st.zoomPct = levels[ci];
  applySketchZoom(idx);
}
function sketchZoomReset(idx) {
  if(sketchState[idx]) sketchState[idx].zoomPct = 100;
  applySketchZoom(idx);
}
function applySketchZoom(idx) {
  const pct = sketchState[idx] ? (sketchState[idx].zoomPct||100) : 100;
  const canvas = document.getElementById(`sc-${idx}`);
  if(!canvas) return;
  const baseW=600, baseH=340;
  canvas.style.width = Math.round(baseW*pct/100)+'px';
  canvas.style.height = Math.round(baseH*pct/100)+'px';
  const lbl = document.getElementById(`szoom-label-${idx}`);
  if(lbl) lbl.textContent = pct+'%';
}

function setSketchTool(idx, tool) {
  // Restore contentEditable on text labels when leaving select mode
  if(sketchState[idx] && sketchState[idx].tool==='select' && tool!=='select') {
    document.querySelectorAll('.sketch-text-label').forEach(function(el){ el.contentEditable='true'; el.classList.remove('selected'); });
    _selectedSTL=null;
  }
  sketchState[idx].tool = tool;
  ['pen','highlight','text','select','erase'].forEach(t => {
    const el = document.getElementById(`stool-${t}-${idx}`);
    if(el) el.classList.toggle('active', tool===t);
  });
  const textOpts = document.getElementById(`stool-text-opts-${idx}`);
  if(textOpts) textOpts.style.display = (tool==='text') ? 'flex' : 'none';
}
function toggleSketchTextStyle(idx, style) {
  const st = sketchState[idx];
  if(!st) return;
  st['text'+style.charAt(0).toUpperCase()+style.slice(1)] = !st['text'+style.charAt(0).toUpperCase()+style.slice(1)];
  const btn = document.getElementById(`stool-${style}-${idx}`);
  if(btn) btn.classList.toggle('active', st['text'+style.charAt(0).toUpperCase()+style.slice(1)]);
}
function setSketchColor(idx, color, el) {
  sketchState[idx].color = color;
  el.closest('.sketch-toolbar').querySelectorAll('.color-dot').forEach(d=>d.classList.remove('active'));
  el.classList.add('active');
}
function clearSketchCanvas(idx) {
  const c=document.getElementById(`sc-${idx}`);
  const ctx=c.getContext('2d');
  ctx.fillStyle=document.body.classList.contains('dark-mode')?'rgba(255,255,255,.03)':'white'; ctx.fillRect(0,0,c.width,c.height);
}

// ── MARKUP (photo annotation) ──
function triggerSketchPhoto(idx) {
  sketchFileTarget = idx;
  currentPhotoId = null;
  deficPhotoTarget = null;
  const fi = document.getElementById('sketch-file-input');
  fi.value = ''; fi.click();
}

function initMarkupCanvas(idx, imgSrc) {
  const wrap = document.getElementById(`markup-wrap-${idx}`);
  const placeholder = document.getElementById(`markup-placeholder-${idx}`);
  placeholder.style.display = 'none';

  // clear previous markup canvas if any
  const existing = wrap.querySelector('.markup-canvas');
  if(existing) existing.remove();
  const existingImg = wrap.querySelector('.markup-base-img');
  if(existingImg) existingImg.remove();

  const img = new Image();
  img.className = 'markup-base-img';
  img.src = imgSrc;
  img.onload = () => {
    wrap.insertBefore(img, wrap.firstChild);
    const canvas = document.createElement('canvas');
    canvas.className = 'markup-canvas';
    canvas.id = `mc-${idx}`;
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    canvas.style.position='absolute'; canvas.style.top='0'; canvas.style.left='0';
    canvas.style.width='100%'; canvas.style.height='100%';
    wrap.style.position='relative';
    wrap.appendChild(canvas);
    sketchEntries[sketchEntries.length-1].markupImg = imgSrc;
    document.getElementById(`markup-toolbar-${idx}`).style.display='';
    initMarkupDrawing(idx, canvas, img);
  };
}
