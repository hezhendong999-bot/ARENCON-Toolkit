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
