/* ═══════════════════════════════════════════════════════════════════════════
   diesel-app/js/part06c.js — CONTINUATION OF part06.js (S559 split)
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
function initMarkupDrawing(idx, canvas, baseImg) {
  const ctx = canvas.getContext('2d');
  let drawing = false, startX=0, startY=0, snapshot=null;

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const scX = canvas.width/r.width, scY = canvas.height/r.height;
    if(e.touches) return {x:(e.touches[0].clientX-r.left)*scX,y:(e.touches[0].clientY-r.top)*scY};
    return {x:(e.clientX-r.left)*scX, y:(e.clientY-r.top)*scY};
  };

  const startDraw = (e) => {
    const st = sketchState[idx];
    drawing = true;
    pushMarkupUndo(idx);
    const p = getPos(e);
    startX=p.x; startY=p.y;
    snapshot = ctx.getImageData(0,0,canvas.width,canvas.height);
    if(st.mtool==='pen'||st.mtool==='erase'||st.mtool==='highlight') { ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  };

  const doDraw = (e) => {
    if(!drawing) return;
    const st = sketchState[idx];
    const p = getPos(e);

    if(st.mtool==='highlight') {
      ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=0.35;
      ctx.strokeStyle=st.mcolor; ctx.lineWidth=st.msize*4; ctx.lineCap='round';
      ctx.lineTo(p.x,p.y); ctx.stroke();
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
    } else if(st.mtool==='pen') {
      ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
      ctx.strokeStyle=st.mcolor; ctx.lineWidth=st.msize; ctx.lineCap='round';
      ctx.lineTo(p.x,p.y); ctx.stroke();
    } else if(st.mtool==='erase') {
      ctx.clearRect(p.x-12,p.y-12,24,24);
    } else {
      ctx.putImageData(snapshot,0,0);
      ctx.strokeStyle=st.mcolor; ctx.lineWidth=st.msize;
      if(st.mtool==='rect') {
        ctx.strokeRect(startX,startY,p.x-startX,p.y-startY);
      } else if(st.mtool==='arrow') {
        ctx.beginPath(); ctx.moveTo(startX,startY); ctx.lineTo(p.x,p.y); ctx.stroke();
        // arrowhead
        const angle=Math.atan2(p.y-startY,p.x-startX);
        const hs=12;
        ctx.beginPath();
        ctx.moveTo(p.x,p.y);
        ctx.lineTo(p.x-hs*Math.cos(angle-Math.PI/6),p.y-hs*Math.sin(angle-Math.PI/6));
        ctx.lineTo(p.x-hs*Math.cos(angle+Math.PI/6),p.y-hs*Math.sin(angle+Math.PI/6));
        ctx.closePath(); ctx.fillStyle=st.mcolor; ctx.fill();
      }
    }
  };

  const endDraw = (e) => {
    if(!drawing) return;
    drawing = false;
    const st = sketchState[idx];
    if(st.mtool==='text') {
      const p = getPos(e);
      _aPrompt('Enter annotation text:','',function(txt){
        if(txt) {
          ctx.font=`bold ${st.msize*5+10}px Arial`;
          ctx.fillStyle=st.mcolor;
          ctx.fillText(txt, p.x, p.y);
        }
      });
    }
  };

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', doDraw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', ()=>{drawing=false;});
  canvas.addEventListener('touchstart', e=>{e.preventDefault();startDraw(e);},{passive:false});
  canvas.addEventListener('touchmove', e=>{e.preventDefault();doDraw(e);},{passive:false});
  canvas.addEventListener('touchend', e=>{endDraw(e);});
}

function setMarkupTool(idx, tool) {
  sketchState[idx].mtool = tool;
  ['pen','highlight','arrow','rect','text','erase'].forEach(t=>{
    const el=document.getElementById(`mtool-${t}-${idx}`);
    if(el) el.classList.toggle('active', t===tool);
  });
}
function setMarkupColor(idx, color, el) {
  sketchState[idx].mcolor = color;
  el.closest('.sketch-toolbar').querySelectorAll('.color-dot').forEach(d=>d.classList.remove('active'));
  el.classList.add('active');
}
function clearMarkupCanvas(idx) {
  const wrap = document.getElementById(`markup-wrap-${idx}`);
  const canvas = wrap.querySelector('.markup-canvas');
  if(canvas) canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
}

function removeSketchEntry(uid) {
  var el = document.getElementById('sketch-'+uid);
  if(el) el.remove();
  // Renumber all remaining entries from #1
  document.querySelectorAll('.sketch-entry').forEach(function(e,i){
    var n=e.querySelector('.sketch-entry-num');
    if(n) n.textContent='Sketch / Markup #'+(i+1);
  });
}


// ══════════════════════════════════════════════════
// INTERACTIVE DRAGGABLE CHART ANNOTATIONS
// ══════════════════════════════════════════════════
var chartAnnotations = {};

// Annotation undo stack (separate from edit undo)


// Unified keyboard handler: Ctrl+Z, Ctrl+Y, Delete
document.addEventListener('keydown', function(e) {
  var inInput = e.target.matches('input,textarea') || e.target.getAttribute('contenteditable')==='true';
  if(e.ctrlKey && e.key === 'z' && !inInput) { e.preventDefault(); globalUndo(); }
  if(e.ctrlKey && e.key === 'y' && !inInput) { e.preventDefault(); globalRedo(); }
  if((e.key==='Delete'||e.key==='Backspace') && _selectedAnnotationKey && !inInput) {
    e.preventDefault();
    _pushUndo();
    chartAnnotationsDeleted[_selectedAnnotationKey] = true;
    var ci = _selectedAnnotationChart==='chart3pt'?chart3pt:_selectedAnnotationChart==='pldChart'?pldChart:_selectedAnnotationChart==='netChart3pt'?netChart3pt:pldNetChart;
    if(ci) renderChartAnnotations(ci, _selectedAnnotationChart);
    _selectedAnnotationKey = null; _selectedAnnotationChart = null;
  }
});
// Auto-capture state on any input change
document.addEventListener('input', function() { _debouncePushUndo(); }, true);

var _selectedAnnotationKey = null;
var _selectedAnnotationChart = null; // { key: {offX, offY} } for dragged positions
var chartAnnotationsVisible = {chart3pt:true, pldChart:true, pldNetChart:true, netChart3pt:true};
var chartAnnotationsDeleted = {}; // { key: true } for individually deleted annotations
// S222: per-dataset annotation override (the per-legend "A" button).
// annDsForce[canvasId][dsIdx] === true  → force this dataset's labels ON (even if not in allow-list)
// annDsForce[canvasId][dsIdx] === false → force this dataset's labels OFF (even if in allow-list)
// undefined → fall back to the allow-list default.
var annDsForce = {chart3pt:{}, pldChart:{}, pldNetChart:{}, netChart3pt:{}};
function _annOn(canvasId, dsIdx, allowDefault){
  var m=annDsForce[canvasId]; if(!m) return allowDefault;
  var v=m[dsIdx];
  return (v===true) ? true : (v===false) ? false : allowDefault;
}
function toggleDsAnnotation(canvasId, dsIdx, allowDefault){
  if(!annDsForce[canvasId]) annDsForce[canvasId]={};
  var cur=_annOn(canvasId, dsIdx, allowDefault);
  annDsForce[canvasId][dsIdx] = !cur;   // flip current effective state
  var chart = canvasId==='chart3pt'?chart3pt:(canvasId==='pldChart'?pldChart:(canvasId==='netChart3pt'?netChart3pt:pldNetChart));
  if(chart && typeof renderChartAnnotations==='function') renderChartAnnotations(chart, canvasId);
  if(typeof debounceAutosave==='function') debounceAutosave();
}
 // { chartId: [{ dsIdx, ptIdx, x, y, offsetX, offsetY }] }


document.addEventListener('keydown', function(e) {
  if((e.key==='Delete'||e.key==='Backspace') && _selectedAnnotationKey && !e.target.matches('input,textarea') && e.target.getAttribute('contenteditable')!=='true') {
    e.preventDefault();
    _pushUndo();
    chartAnnotationsDeleted[_selectedAnnotationKey] = true;
    var ci = _selectedAnnotationChart==='chart3pt'?chart3pt:_selectedAnnotationChart==='pldChart'?pldChart:_selectedAnnotationChart==='netChart3pt'?netChart3pt:pldNetChart;
    if(ci) renderChartAnnotations(ci, _selectedAnnotationChart);
    _selectedAnnotationKey = null; _selectedAnnotationChart = null;
  }
});
document.addEventListener('click', function(e) {
  if(!e.target.closest('.chart-annotation-label')) {
    document.querySelectorAll('.chart-annotation-label._selected').forEach(function(el){ el.classList.remove('_selected'); el.style.outline=''; el.style.boxShadow=''; });
    _selectedAnnotationKey = null; _selectedAnnotationChart = null;
  }
});

function toggleAnnotations(canvasId) {
  chartAnnotationsVisible[canvasId] = !chartAnnotationsVisible[canvasId];
  var btn = document.getElementById('ann-toggle-'+canvasId);
  if(btn) btn.textContent = chartAnnotationsVisible[canvasId] ? '🏷 Hide Annotations' : '🏷 Show Annotations';
  // When turning ON, clear deleted set so all regenerate
  if(chartAnnotationsVisible[canvasId]) {
    Object.keys(chartAnnotationsDeleted).forEach(function(k){
      if(k.startsWith(canvasId+'_')) delete chartAnnotationsDeleted[k];
    });
    // Keep custom positions — do not reset on toggle
  }
  var overlay = document.getElementById(canvasId+'-annotations');
  if(overlay) overlay.style.display = chartAnnotationsVisible[canvasId] ? '' : 'none';
  // Re-render if turning on
  if(chartAnnotationsVisible[canvasId]) {
    var ci = canvasId==='chart3pt'?chart3pt:canvasId==='pldChart'?pldChart:canvasId==='netChart3pt'?netChart3pt:pldNetChart;
    if(ci) renderChartAnnotations(ci, canvasId);
  }
}

function initChartAnnotationOverlay(chartInstance, canvasId) {
  var canvas = document.getElementById(canvasId);
  if(!canvas) return;
  if(document.getElementById(canvasId + '-annotations')) { if(!chartAnnotations[canvasId]) chartAnnotations[canvasId] = []; return; }
  var wrap = canvas.parentElement;
  var overlay = document.createElement('div');
  overlay.id = canvasId + '-annotations';
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;';
  wrap.style.position = 'relative';
  wrap.appendChild(overlay);
  // Store reference
  if(!chartAnnotations[canvasId]) chartAnnotations[canvasId] = [];
}

function renderChartAnnotations(chartInstance, canvasId) {
  var overlay = document.getElementById(canvasId + '-annotations');
  if(!overlay) return;
  if(!chartAnnotationsVisible[canvasId]) return;
  var chart = chartInstance;
  if(!chart) return;
  // S369 SELF-HEAL: the PLD (7-point) charts can finish initialising AFTER
  // hookChartAnnotations() ran, so their update() was never monkey-patched and
  // their _storedFormatters were never captured — which is why 7pt annotations
  // silently stopped showing while 3pt (hooked in time) kept working. If this
  // chart is unhooked, hook it once here so both paths are truly identical.
  if(!chart._storedFormatters){
    try{
      _distinctifyChartColors(chart);
      chart._storedColors = chart._storedColors || {};
      chart._storedFormatters = {};
      chart.data.datasets.forEach(function(ds, di){
        chart._storedColors[di] = (ds.datalabels && ds.datalabels.color) || ds.borderColor || '#333';
        chart._storedFormatters[di] = (function(origFmt){
          return function(val, ctx){
            if(!val) return '';
            var t=''; if(origFmt) try{ t=origFmt(val,ctx); }catch(e){}
            if(t) return t;
            if(val.x !== undefined && val.y !== undefined) return val.x.toLocaleString()+' gpm\n@ '+val.y+' psi';
            return val.y ? val.y+' psi' : '';
          };
        })(ds.datalabels && ds.datalabels.formatter);
        if(ds.datalabels) ds.datalabels.display=false;
      });
      if(!chart.__origUpdate){
        var origUpdate = chart.update.bind(chart);
        chart.__origUpdate = origUpdate;
        chart.update = function(mode){ origUpdate(mode); setTimeout(function(){ renderChartAnnotations(chart, canvasId); }, 80); };
      }
    }catch(_e){}
  }
  overlay.innerHTML = '';
  var _annotationPositions = {}; // dedup tracker
  var svgLines = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svgLines.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  overlay.appendChild(svgLines);
  
  chart.data.datasets.forEach(function(ds, dsIdx) {
    // Use stored formatter if available (display was disabled for Chart.js but we render manually)
    var fmt = (chart._storedFormatters && chart._storedFormatters[dsIdx]) || (ds.datalabels && ds.datalabels.formatter);
    // S222: a dataset force-toggled ON via its legend "A" button has no formatter — let it
    // through and synthesize a label below. Without a force-on, keep the original fast bail.
    if(!fmt && annDsForce[canvasId] && annDsForce[canvasId][dsIdx]!==true) return;
    var dsColor = (chart._storedColors && chart._storedColors[dsIdx]) || (ds.datalabels && ds.datalabels.color) || ds.borderColor || '#333';
    // S368: ensure the label colour is readable on the dark chart background while
    // still matching its curve's hue. In light mode this is a no-op; in dark mode any
    // dark curve colour (Cutsheet navy, Pump-curve burgundy, etc.) is brightened.
    if(typeof _chartLabelColor === 'function') dsColor = _chartLabelColor(dsColor);
    ds.data.forEach(function(pt, ptIdx) {
      if(!pt) return;
      var meta = chart.getDatasetMeta(dsIdx);
      if(!meta || !meta.data[ptIdx]) return;
      var px = meta.data[ptIdx].x;
      var py = meta.data[ptIdx].y;
      // Get stored offset or use default
      var key = canvasId + '_' + dsIdx + '_' + ptIdx;
      var stored = chartAnnotations[key];
      var offX = stored ? stored.offX : 0;
      var offY = stored ? stored.offY : -30;
      // Get label text from formatter
      // Skip deleted annotations
      if(chartAnnotationsDeleted[key]) return;
      if(pt.x === 0 && pt.y === 0) return;
      if(ds.label && ds.label.startsWith('_') && !ds.label.startsWith('_sprDem')) return;
      // S221: annotation labels were stacking because EVERY curve labelled every flow point.
      // Switch to an explicit allow-list: only the PRIMARY pump curve (one per chart) plus the
      // demand/supply marker points carry per-point text. All reference/secondary lines
      // (Cutsheet, Placard, PRV, PLD, Net-pressure overlays, Available Supply line) are drawn
      // but un-labelled. This is robust to label wording, unlike the prior regex/pointRadius mix.
      var _lbl = ds.label || '';
      // S327 AUDIT: previously only the (blue) primary curves were labelled, which
      // is why Cutsheet/Sprinkler/Placard labels "didn't work" — they weren't in
      // the allowlist at all. Every meaningful curve now carries endpoint labels in
      // its OWN color. Marker datasets stay single-point.
      var _ANNOTATE_PRIMARY = {
        'Discharge Pressure (Measured)':1,   // 3-Point discharge primary
        'Actual Output (w/ limiters)':1,     // 3-Point actual-output curve
        'Measured Discharge (w/ PLD)':1,     // 7-Point discharge primary
        'Net Pressure (w/ PLD)':1,           // 7-Point net primary
        'Net Pressure (Discharge \u2212 Suction)':1, // 3-Point net
        'Measured Net':1,                    // 3-Point net-curve view primary
        'Adjusted Net (RPM-corrected)':1,    // net-curve adjusted
        'Cutsheet (Design)':1,               // S327: now labelled (was broken)
        'Placard':1,                         // S327: now labelled
        'Sprinkler Demand Line (SD)':1       // S327: now labelled (was broken)
        // S366: 'Available Supply' REMOVED from PRIMARY. As a primary it was labelling all
        // 25 interpolated hydraulic-curve points (the label smear in the 7-pt chart). It now
        // falls through to the endpoint-only branch below → labels ONLY the first + last
        // points = static and residual. The curve itself still draws through all 25 points.
      };
      var _ANNOTATE_POINTS = {               // marker datasets — single points, no stacking
        'Total System Demand':1, '_sprDemPt':1, '_sprDemPtPld':1,
        '_staticPt':1, '_residualPt':1, '_staticPtPld':1, '_residualPtPld':1
      };
      var _isPrimary = !!_ANNOTATE_PRIMARY[_lbl];
      var _isPoint   = !!_ANNOTATE_POINTS[_lbl];
      var _allowDefault = _isPrimary || _isPoint;
      // S222: per-legend "A" toggle can force ON (label a normally-silent curve) or force OFF.
      if(!_annOn(canvasId, dsIdx, _allowDefault)) return;
      // S223 FIX: a force-on, NON-primary, NON-marker line is a dense interpolated reference
      // curve (e.g. Available Supply = 25 pts, Net Pressure, Sprinkler Demand). Labelling every
      // sample point produces an unreadable horizontal smear. For such lines, label ENDPOINTS
      // ONLY (first + last visible point). Primary curves and marker datasets are unaffected.
      if(!_isPrimary && !_isPoint){
        var _lastIdx = ds.data.length - 1;
        if(ptIdx !== 0 && ptIdx !== _lastIdx) return;
      }
      // Skip annotations for zero-value points (0 gpm @ 0 psi)
      if(pt.x === 0 && pt.y === 0) return;
      // S366: the Total System Demand diamond and the OHL line END at the SAME coordinate
      // (sprinkler+hose flow @ sprinkler psi). When OHL exists it carries the richer label
      // ("1,750 gpm @ 100 psi (+250 gpm OHL)"), so the diamond's plain "1,750 gpm @ 100 psi"
      // is a redundant duplicate — suppress it. (If there's no OHL, the diamond keeps its label.)
      if(_lbl === 'Total System Demand'){
        try{
          var _tdp=(canvasId.indexOf('pld')>=0)?'pld-':'';
          var _ohf=parseFloat(document.getElementById(_tdp+'dem-hose-flow')?.value)||0;
          if(_ohf>0) return;   // OHL present → its endpoint label covers this point
        }catch(e){}
      }
      // S226: cap lines (PRV/PRdV/PLD) — device+setpoint label only (no flow), right endpoint only.
      // Cap extends to 150% rated flow; the right end is where the label reads cleanly.
      // S327: OHL gets a bespoke right-end label (total demand incl. OHL).
      var _CAP_LABEL = { 'Pressure Relief':'PRV', 'Pressure Reducing':'PRdV', 'PLD Setting':'PLD' };
      var text = '';   // single per-point text var (no hoisted leakage)
      if(_lbl==='Outside Hose Allow. (OHL)'){
        if(ptIdx !== (ds.data.length - 1)) return;   // right end only
        var _ohlTot=null, _ohlPsi=NaN, _ohlAdd=0;
        try{
          var _td=(canvasId.indexOf('pld')>=0)?'pld-':'';
          var _sd=parseFloat(document.getElementById(_td+'dem-spr-flow')?.value)||0;
          var _oh=parseFloat(document.getElementById(_td+'dem-hose-flow')?.value)||0;
          _ohlTot=_sd+_oh; _ohlAdd=_oh; _ohlPsi=parseFloat(document.getElementById(_td+'dem-spr-psi')?.value);
        }catch(e){}
        text=(_ohlTot!=null?_ohlTot.toLocaleString():Math.round(pt.x).toLocaleString())+' gpm @ '+(isNaN(_ohlPsi)?Math.round(pt.y):_ohlPsi)+' psi';
        if(_ohlAdd) text+='\n(+'+_ohlAdd.toLocaleString()+' gpm OHL)';
      } else if(_CAP_LABEL[_lbl]){
        if(ptIdx !== (ds.data.length - 1)) return;     // right endpoint only
        if(typeof pt.y === 'undefined') return;
        text = _CAP_LABEL[_lbl] + ' @ ' + Math.round(pt.y) + ' psi';
      }
      try {
        if(!text && typeof fmt === 'function') {
          text = fmt(pt, {dataIndex:ptIdx, dataset:ds, chart:chart, datasetIndex:dsIdx});
        }
      } catch(e) {}
      // S222: forced-on curves often have no datalabels formatter — synthesize a label.
      if(!text && pt && typeof pt.x!=='undefined' && typeof pt.y!=='undefined'){
        text = Math.round(pt.x).toLocaleString()+' gpm\n@ '+Math.round(pt.y)+' psi';
      }
      if(!text) return;
      // S223: smarter collision handling. Exact-pixel dedup missed near-but-not-identical
      // clusters (e.g. all the 0-gpm points, or the three 1,000-gpm overlaps). Now:
      //   • if the user has manually placed this label (stored offset), respect it as-is;
      //   • otherwise auto-FAN unpositioned labels that anchor near an already-placed one,
      //     stepping the vertical offset so they stack apart instead of overprinting.
      var labelX = px + offX;
      var labelY = py + offY;
      // S321 SMART LAYOUT v2 (field request: labels must NEVER overlap unless
      // manually placed). Three upgrades over the S223 fan:
      //  (a) identical text anchored within 14px of an already-placed identical
      //      label is a DUPLICATE (overlapping marker datasets) — skip it;
      //  (b) collision test uses real estimated label rectangles (width from
      //      longest line, height from line count), not a fixed radius;
      //  (c) candidate search tries above, below, right, left, then expanding
      //      vertical fan in both directions, and clamps inside the chart area.
      // Manually-dragged labels (stored offsets) are always respected verbatim.
      var _lines = (''+text).split('\n');
      var _w = 12 + 5.4*Math.max.apply(null,_lines.map(function(l){return l.length;}));
      var _h = 6 + 13*_lines.length;
      function _rect(cx, cy){ return {l:cx-_w/2, r:cx+_w/2, t:cy-_h, b:cy}; }   // translate(-50%,-100%)
      function _hits(rc){
        for(var _pk in _annotationPositions){
          var _p=_annotationPositions[_pk];
          if(_p.k===key) continue;
          if(rc.l < _p.r+3 && rc.r > _p.l-3 && rc.t < _p.b+3 && rc.b > _p.t-3) return _p;
        }
        return null;
      }
      // ════ S327 LOCKED annotation layout (annotation_engine_demo, approved) ════
      // RULES: (1) default anchor sits just above the point — NO vertical fanning
      // unless a collision forces it. (2) Never overlap: if a label would hit one
      // already placed, the NEW/moved label dodges; existing labels never move.
      // (3) Dodge prefers the SMALLEST displacement and stays in-bounds + near the
      // curve (spiral of growing offsets, all directions, not vertical-only).
      // (4) Manual drags (stored offsets) are honored, but still dodge others.
      // (5) Duplicate identical text on the same anchor is suppressed.
      var _cw=(chart.chartArea&&chart.chartArea.right)||overlay.clientWidth||600;
      var _cl=(chart.chartArea&&chart.chartArea.left)||0;
      var _ct=(chart.chartArea&&chart.chartArea.top)||0;
      var _cb=(chart.chartArea&&chart.chartArea.bottom)||overlay.clientHeight||400;
      function _clampXY(cx,cy){ return [ Math.min(Math.max(cx,_cl+_w/2+2),_cw-_w/2-2), Math.min(Math.max(cy,_ct+_h+2),_cb-2) ]; }
      if(!stored){
        // (5) duplicate suppression
        for(var _dk in _annotationPositions){
          var _d=_annotationPositions[_dk];
          if(_d.text===text && Math.abs(_d.ax-px)<14 && Math.abs(_d.ay-py)<14){ return; }
        }
      }
      // start position: manual offset if present, else just above the point
      var _cx0 = stored ? (px+offX) : px;
      var _cy0 = stored ? (py+offY) : (py-18);
      var _cc=_clampXY(_cx0,_cy0); var _cx=_cc[0], _cy=_cc[1];
      if(_hits(_rect(_cx,_cy))){
        // (3) spiral dodge — minimal first, widening; 8 directions per ring
        var _dirs=[[0,-1],[0.7,-0.7],[1,0],[0.7,0.7],[0,1],[-0.7,0.7],[-1,0],[-0.7,-0.7]];
        var _done=false;
        for(var _r=16;_r<=140 && !_done;_r+=16){
          for(var _di=0;_di<_dirs.length;_di++){
            var _t=_clampXY(_cx0+_dirs[_di][0]*_r, _cy0+_dirs[_di][1]*_r);
            if(!_hits(_rect(_t[0],_t[1]))){ _cx=_t[0]; _cy=_t[1]; _done=true; break; }
          }
        }
        // if still nothing free (very dense), keep clamped start — overlap is last resort
      }
      labelX=_cx; labelY=_cy; offX=_cx-px; offY=_cy-py;
      var _fr=_rect(labelX,labelY);
      _annotationPositions[key] = {k:key, x:labelX, y:labelY, l:_fr.l, r:_fr.r, t:_fr.t, b:_fr.b, text:text, ax:px, ay:py};

      // Create label div
      var label = document.createElement('div');
      label.className = 'chart-annotation-label';
      label.style.cssText = 'position:absolute;pointer-events:auto;cursor:grab;padding:2px 5px;' +
        'font-size:10px;font-weight:600;font-family:Calibri,sans-serif;' +
        'background:rgba(255,255,255,0.9);border-radius:3px;white-space:pre;line-height:1.3;' +
        'border:none' + ';color:' + dsColor + ';' +
        'left:' + labelX + 'px;top:' + labelY + 'px;transform:translate(-50%,-100%);user-select:none;z-index:5;';
      label.textContent = text;
      label.dataset.key = key;
      label.dataset.px = px;
      label.dataset.py = py;
      overlay.appendChild(label);
      
      // Leader line if offset > 35px
      var dist = Math.sqrt(offX*offX + offY*offY);
      if(dist > 35) {
        var line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.setAttribute('x1', px);
        line.setAttribute('y1', py);
        line.setAttribute('x2', labelX);
        line.setAttribute('y2', labelY);
        line.setAttribute('stroke', ds.borderColor||'#999');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '3,2');
        svgLines.appendChild(line);
      }
      
      // Make draggable
      var dragState = {dragging:false, startX:0, startY:0, startOffX:offX, startOffY:offY};
      // S267(D): annotation labels were mouse-only (label.onmousedown + document mousemove/up),
      // so on the field iPads they could not be repositioned — only the safety-factor chip, which
      // already had touch handlers, worked. Factor the start/move/end into coordinate-based helpers
      // and bind BOTH mouse and touch. Mouse path is unchanged; touch now mirrors it exactly.
      function _annStart(cx, cy){
        /* S513: this label announces itself as the active drag — the shared
           document handlers route to whichever label started the gesture, not
           to whichever label happened to render last. */
        var _r = document.__annDragReg;
        if(_r) _r.cur = { move:_annMove, end:_annEnd, state:dragState };
        dragState.dragging = true;
        dragState.startX = cx;
        dragState.startY = cy;
        dragState.startOffX = offX;
        dragState.startOffY = offY;
        label.style.cursor = 'grabbing';
        label.style.zIndex = '20';
      }
      function _annMove(cx, cy){
        if(!dragState.dragging) return;
        var dx = cx - dragState.startX;
        var dy = cy - dragState.startY;
        // S267(C v3): when the fullscreen view is rotated 90° (portrait phone showing a landscape
        // chart), screen axes no longer match the chart's axes. Convert the screen delta into the
        // chart's local delta so a finger-drag moves the label the way the eye expects.
        // For CSS rotate(90deg): localDx = screenDy, localDy = -screenDx.
        if(window._figFsRot === 90){
          var ldx = dy;
          var ldy = -dx;
          dx = ldx; dy = ldy;
        }
        offX = dragState.startOffX + dx;
        offY = dragState.startOffY + dy;
        label.style.left = (px + offX) + 'px';
        label.style.top = (py + offY) + 'px';
      }
      function _annEnd(){
        if(!dragState.dragging) return;
        dragState.dragging = false;
        label.style.cursor = 'grab';
        label.style.zIndex = '5';
        _pushUndo();
        chartAnnotations[key] = {offX: offX, offY: offY};
        // Re-render to update leader line
        renderChartAnnotations(chartInstance, canvasId);
      }
      label.onmousedown = function(ev) {
        ev.preventDefault();
        _annStart(ev.clientX, ev.clientY);
      };
      label.addEventListener('touchstart', function(ev){
        if(!ev.touches || !ev.touches[0]) return;
        ev.preventDefault();   // stop the chart pan/scroll from stealing the gesture
        _annStart(ev.touches[0].clientX, ev.touches[0].clientY);
      }, {passive:false});
      /* S513 — LISTENER LEAK, measured. These five document-level handlers were
         added PER LABEL PER RENDER (this block sits inside ds.data.forEach), and
         renderChartAnnotations runs on every panel show, resize and export
         (11 call sites). One afternoon of chart work stacked hundreds of live
         document drag handlers, every mousemove walking all of them — the
         "tablet slows down by end of day" mechanism. One shared set is kept in
         a registry keyed per document; each render tears down the previous
         set FIRST, so the count can never exceed five regardless of labels,
         datasets or renders. dragState is read via _annReg so the shared
         handlers always see the label currently being dragged. */
      var _annReg = document.__annDragReg || (document.__annDragReg = { bound:false, cur:null });
      if(!_annReg.bound){
        _annReg.bound = true;
        document.addEventListener('mousemove', function(ev){
          if(_annReg.cur) _annReg.cur.move(ev.clientX, ev.clientY);
        });
        document.addEventListener('touchmove', function(ev){
          var c=_annReg.cur; if(!c || !c.state.dragging) return;
          if(!ev.touches || !ev.touches[0]) return;
          ev.preventDefault();   // we own the gesture while dragging an annotation
          c.move(ev.touches[0].clientX, ev.touches[0].clientY);
        }, {passive:false});
        document.addEventListener('mouseup', function(){ if(_annReg.cur){ _annReg.cur.end(); _annReg.cur=null; } });
        document.addEventListener('touchend', function(){ if(_annReg.cur){ _annReg.cur.end(); _annReg.cur=null; } });
        document.addEventListener('touchcancel', function(){ if(_annReg.cur){ _annReg.cur.end(); _annReg.cur=null; } });
      }
      
      // Double-click to delete individual annotation
      label.ondblclick = function() {
        chartAnnotationsDeleted[key] = true;
        renderChartAnnotations(chartInstance, canvasId);
      };
    });
  });
}

// Hook into chart updates
var _origUpdate3pt = null;
var _origUpdatePld = null;
var _origUpdateNet = null;

/* S321: no two labelled curves on one chart may share a color (field request).
   Curated muted palette; marker datasets (labels starting '_') keep their family
   color. _storedColors is refreshed so annotation text matches the final color. */
var _DISTINCT_PALETTE=['#E0B341','#5FA777','#6F8FD6','#C0445F','#9C6FD6','#46A5C5','#C98A4A','#7FA35C','#B5719C','#8A8F5C','#5C8F8A','#A87B5C'];
function _distinctifyChartColors(ci){
  try{
    var used={}, pi=0;
    function norm(c){ return (''+(c||'')).toLowerCase().replace(/\s/g,''); }
    function next(){ while(pi<_DISTINCT_PALETTE.length && used[norm(_DISTINCT_PALETTE[pi])]) pi++; return _DISTINCT_PALETTE[pi]||'#888'; }
    ci.data.datasets.forEach(function(ds, di){
      var lbl=ds.label||'';
      if(lbl.charAt(0)==='_') return;                 // marker/family datasets
      var c=norm(ds.borderColor);
      if(c && !used[c]){ used[c]=1; return; }         // first user of this color keeps it
      var nc=next(); used[norm(nc)]=1;
      ds.borderColor=nc;
      if(ds.pointBorderColor) ds.pointBorderColor=nc;
      if(ds.pointBackgroundColor && typeof ds.pointBackgroundColor==='string') ds.pointBackgroundColor=nc;
      if(ci._storedColors) ci._storedColors[di]=nc;   // annotations follow the curve
    });
  }catch(e){ console.warn('[charts] distinctify failed', e); }
}
function hookChartAnnotations() {
  // Hook into each chart to render draggable annotations after update.
  // S214: chart3pt (4a) re-added — it uses the draggable overlay to match 4b (7-point).
  [['chart3pt',chart3pt],['netChart3pt',netChart3pt],['pldChart',pldChart],['pldNetChart',pldNetChart]].forEach(function(pair){
    var cid=pair[0], ci=pair[1];
    if(!ci) return;
    _distinctifyChartColors(ci);   // S321: unique curve colors before labels snapshot them
    initChartAnnotationOverlay(ci, cid);
    // Store formatters then disable built-in datalabels
    ci.data.datasets.forEach(function(ds, di){
      ci._storedColors = ci._storedColors || {};
      ci._storedColors[di] = (ds.datalabels && ds.datalabels.color) || ds.borderColor || '#333';
      if(!ci._storedFormatters) ci._storedFormatters = {};
      ci._storedFormatters[di] = (function(origFmt){
        return function(val, ctx) {
          if(!val) return '';
          var t = '';
          if(origFmt) try { t = origFmt(val, ctx); } catch(e){}
          if(t) return t;
          if(val.x !== undefined && val.y !== undefined) return val.x.toLocaleString() + ' gpm\n@ ' + val.y + ' psi';
          return val.y ? val.y + ' psi' : '';
        };
      })(ds.datalabels && ds.datalabels.formatter);
      if(ds.datalabels) ds.datalabels.display = false;
    });
    ci.update('none');
    // Render initial annotations
    setTimeout(function(){ renderChartAnnotations(ci, cid); }, 150);
    // Monkey-patch update to re-render annotations
    var origUpdate = ci.update.bind(ci);
    ci.__origUpdate = origUpdate;
    ci.update = function(mode) {
      origUpdate(mode);
      setTimeout(function(){ renderChartAnnotations(ci, cid); }, 80);
    };
  });
}


// Simple QR Code generator (uses external API for simplicity)


// Mobile swipe-to-open-menu removed per user request
/* S488 BLANK-TOOL ROOT CAUSE (found via Playwright repro, line-exact): this
   was a TOP-LEVEL, UNGUARDED querySelector('.header-actions').addEventListener
   — that element lived inside the deleted inline header, so post-migration it
   returned null, the chained call threw, and the WHOLE remaining script block
   died: checklist never rendered, cloud data never applied, the tool painted
   "0 of 0" and then autosaved that blank over Mark's 1490.04 record. The
   handler itself is obsolete (the engine drawer closes on item tap natively);
   deleted, not guarded. Lesson encoded: the migration orphan sweep must catch
   querySelector chains, not only getElementById. */


// Mobile page navigation
function navPage(dir) {
  var cur = PANELS.findIndex(function(p){return document.getElementById('panel-'+p)&&document.getElementById('panel-'+p).classList.contains('active');});
  var next = cur + dir;
  if(next < 0 || next >= PANELS.length) return;
  switchPanel(PANELS[next]);
  updateNavButtons();
}
function updateNavButtons() {
  var cur = PANELS.findIndex(function(p){return document.getElementById('panel-'+p)&&document.getElementById('panel-'+p).classList.contains('active');});
  var prev = document.getElementById('nav-prev');
  var next = document.getElementById('nav-next');
  var label = document.getElementById('nav-label');
  if(prev) { prev.disabled = cur<=0; prev.style.opacity = cur<=0?'0.3':'1'; }
  if(next) { next.disabled = cur>=PANELS.length-1; next.style.opacity = cur>=PANELS.length-1?'0.3':'1'; }
  if(label) label.textContent = (cur+1) + ' / ' + PANELS.length;
}
// Show on mobile
if(window.innerWidth <= 768) {
  var mnav = document.getElementById('mobile-page-nav');
  if(mnav) mnav.style.display = 'block';
  updateNavButtons();
  document.body.style.paddingBottom = '52px';
}

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════
renderChecklist(S1,'cl-s1','s1');
renderChecklist(S2,'cl-s2','s2');
renderChecklist(S3,'cl-s3','s3');
renderChecklist(S4_items,'cl-s4','s4');
renderChecklist(S4_items,'cl-s4pld','s4pld');
renderChecklist(S5_mandatory,'cl-s5-mandatory','s5m');
renderChecklist(S5,'cl-s5','s5');

// Merged Performance tab: set initial section visibility (load() overrides with saved type)
if(typeof setPumpTestType==='function') setPumpTestType('std');
/* ── S582 (Mark) — THE TEST TYPE SHIPS UNSET ON NEW REPORTS ──────────────
   The team kept filling the wrong chart because the first decision on the page
   arrived pre-answered: 'std' was defaulted and looked chosen, so nobody chose.
   Now a NEW report opens with neither mode selected and the flow sections gated
   until a person picks. EXISTING reports are untouched — any saved testType
   counts as the choice already made, so nothing changes under an open job.
   MACHINERY IS UNCHANGED underneath: setPumpTestType('std') still runs at load
   (charts and tables need a live default), the gate is a VISUAL layer on top.
   That is deliberate — S575 proved this file executes code at load time, so the
   safe shape is additive flags, not moved initialisation. */
var _ttChosen = false;   // becomes true on user pick or on loading a saved testType
/* ═══ S622g — PUMP-TYPE HARD LOCK (Mark, standing queue item) ══════════════
   The type governs the whole report — flow points, charts, acceptance
   criteria and the PDF all differ — so switching it after readings exist is a
   decision, not a toggle. Before any performance data is entered, switching
   stays one tap: a fresh report must not nag. The moment a reading exists the
   choice LOCKS, and switching asks once first (shared dialog engine, one tap,
   never a browser dialog, never type-to-confirm).
   Nothing is deleted either way: the two types keep separate readings, so the
   other set is still there if the person switches back — the dialog says so,
   because a confirmation that overstates the damage teaches people to ignore
   confirmations. */
function _ttHasPerfData(){
  try{
    var rows = [].concat(
      Array.isArray(typeof stdData!=='undefined'?stdData:null) ? stdData : [],
      Array.isArray(typeof pldData!=='undefined'?pldData:null) ? pldData : []);
    var FIELDS = ['flow','cutsheet','placard','suction','discharge','rpm','bfUp','bfDown'];
    for(var i=0;i<rows.length;i++){
      var r = rows[i]; if(!r || typeof r!=='object') continue;
      for(var j=0;j<FIELDS.length;j++){
        var v = r[FIELDS[j]];
        if(v!=null && String(v).trim()!=='') return true;
      }
    }
  }catch(_e){}
  return false;
}
function _ttLabel(t){ return t==='pld' ? '7-Point with PLD' : '3-Point Standard'; }
function _ttApplyLock(){
  try{
    var locked = _ttChosen && _ttHasPerfData();
    var wrap = document.querySelector('.pump-type-btns');
    if(wrap) wrap.classList.toggle('tt-locked', !!locked);
    /* Level 2 colour identity: ONE attribute on the body drives every tinted
       surface in CSS (rail, header, body wash, labels, %-chips). No per-element
       JS styling — the skin stays in the stylesheet where both themes see it. */
    var cur = 'std';
    document.querySelectorAll('.pump-type-btns button').forEach(function(b){
      if(b.classList.contains('on')) cur = b.dataset.ptype || 'std';
    });
    document.body.setAttribute('data-ptype', _ttChosen ? cur : '');
  }catch(_e){}
}
function _ttChoose(type){
  /* already the active choice → nothing to confirm, nothing to change */
  var curBtn = document.querySelector('.pump-type-btns button.on');
  var cur = curBtn && curBtn.dataset ? curBtn.dataset.ptype : null;
  if(_ttChosen && cur === type) return;
  if(_ttChosen && cur && _ttHasPerfData()){
    var Dlg = window.ArenconDlg;
    if(Dlg && typeof Dlg.confirm === 'function'){
      Dlg.confirm({
        title: 'Switch pump test type?',
        accent: 'warn',
        message: 'This report currently follows ' + _ttLabel(cur) + '. Switching to ' +
                 _ttLabel(type) + ' changes every performance section, the charts and the final report to the ' +
                 _ttLabel(type) + ' format.',
        detail: 'Nothing is deleted — the readings already entered stay saved and come back if you switch back.',
        confirmText: 'Switch',
        cancelText: 'Cancel — go back',
        onConfirm: function(){ _ttCommit(type); }
      });
      return;
    }
    /* engine unavailable: the safe default is to leave the report as it is
       rather than switch silently — never a browser confirm(). */
    return;
  }
  _ttCommit(type);
}
function _ttCommit(type){
  _ttChosen = true;
  setPumpTestType(type);
  _ttApplyGate();
  _ttApplyLock();
  if(typeof debounceAutosave==='function') debounceAutosave();
}
function _ttApplyGate(){
  try{
    var g=document.getElementById('tt-gate'), n=document.getElementById('tt-unset-note');
    var std=document.getElementById('perf-std'), pld=document.getElementById('perf-pld');
    /* 'on' is owned by setPumpTestType; the gate only strips it while unset so
       neither card looks pre-answered. */
    if(!_ttChosen) document.querySelectorAll('.pump-type-btns button').forEach(function(b){ b.classList.remove('on'); });
    if(_ttChosen){
      if(g) g.style.display='none';
      if(n) n.style.display='none';
      if(std) std.classList.remove('tt-gated');
      if(pld) pld.classList.remove('tt-gated');
    } else {
      if(g) g.style.display='block';
      if(n) n.style.display='block';
      if(std){ std.classList.add('tt-gated'); }
      if(pld){ pld.classList.add('tt-gated'); }
    }
  }catch(e){}
}

_ttApplyGate();
if(typeof _ttApplyLock==='function') _ttApplyLock();   // S622g: boot state

// Phase nav: initial render (Setup active, Summary panel active)
if(typeof switchPhase==='function'){
  _activePhase = 'setup';
  document.querySelectorAll('.phase-tab').forEach(function(t){ t.classList.remove('active'); });
  var _ps=document.getElementById('phase-setup'); if(_ps) _ps.classList.add('active');
  renderSubNav('setup');
}

// Global drag/drop visual feedback
document.addEventListener('dragover', function(e) {
  var zone = e.target.closest('.photo-zone,[ondragover]');
  if(zone) { e.preventDefault(); zone.classList.add('drag-over'); zone.style.borderColor='var(--red)'; }
});
document.addEventListener('dragleave', function(e) {
  var zone = e.target.closest('.photo-zone,[ondragover]');
  if(zone) { zone.classList.remove('drag-over'); zone.style.borderColor=''; }
});
document.addEventListener('drop', function(e) {
  document.querySelectorAll('.drag-over').forEach(function(el){ el.classList.remove('drag-over'); el.style.borderColor=''; });
});


// Edit mode undo stack (Ctrl+Z)
// removed
// removed

// Apply saved state in-place without page reload

// ══════════════════════════════════════════════════
// UNIFIED UNDO/REDO (Microsoft-style: Ctrl+Z / Ctrl+Y)
// ══════════════════════════════════════════════════
var _undoStack = [];
var _redoStack = [];
var _undoTimer = null;

function _pushUndo() {
  try {
    var snap = JSON.stringify(collectState());
    if(_undoStack.length > 0 && _undoStack[_undoStack.length-1] === snap) return;
    _undoStack.push(snap);
    if(_undoStack.length > 40) _undoStack.shift();
    _redoStack.length = 0;
  } catch(e){}
  _updateUndoButtons();
}
function _updateUndoButtons() {
  var _c = window.__dslHeaderCtl;
  if(_c) _c.setUndoRedo({ canUndo: !!_undoStack.length, canRedo: !!_redoStack.length });
}
function _debouncePushUndo() {
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(_pushUndo, 600);
}
function globalUndo() {
  if(_undoStack.length === 0) { showToast('Nothing to undo', 1500); return; }
  try { _redoStack.push(JSON.stringify(collectState())); } catch(e){}
  _applyStateInPlace(_undoStack.pop());
  _updateUndoButtons();
  showToast('\u21b6 Undo', 1200);
}
function globalRedo() {
  if(_redoStack.length === 0) { showToast('Nothing to redo', 1500); return; }
  try { _undoStack.push(JSON.stringify(collectState())); } catch(e){}
  _applyStateInPlace(_redoStack.pop());
  _updateUndoButtons();
  showToast('\u21b7 Redo', 1200);
}

function _applyStateInPlace(jsonStr) {
  try {
    var s = JSON.parse(jsonStr);
    // Project fields
    Object.entries(s.proj||{}).forEach(function(kv){
      var el = document.getElementById(kv[0]);
      if(el) el.value = kv[1];
    });
    if(s.testType) {
      /* S582: a saved report counts as chosen — either the person chose, or the
         report predates the unset gate and must not be re-gated underneath them.
         Only s.ttChosen===false (a new-era report saved before choosing) stays gated. */
      _ttChosen = (s.ttChosen===false) ? false : true;
      setPumpTestType(s.testType);
      if(typeof _ttApplyGate==='function') _ttApplyGate();
    }
    // S321: rebuild custom equipment rows BEFORE index-based checkbox restore
    // (saved indexes include custom rows in DOM order). Idempotent: clear first.
    if(s.customEquip){
      ['3a','4b'].forEach(function(tab){
        var c=document.getElementById('equip-custom-'+tab);
        if(c){ c.innerHTML=''; if(typeof _customEquipCount!=='undefined') _customEquipCount['_'+tab.replace('-','')]=0; }
        (s.customEquip[tab]||[]).forEach(function(r){
          if(typeof addCustomEquip==='function') addCustomEquip(tab, r.id);   // S540
          var rows=c?c.querySelectorAll('label'):[];
          var w=rows[rows.length-1]; if(!w) return;
          var tx=w.querySelector('input[type=text]'); if(tx) tx.value=r.t||'';
          var cb=w.querySelector('input[type=checkbox]'); if(cb) cb.checked=(r.c!==false);
        });
      });
    }
    // Restore equipment checkboxes
    /* S616c — prefer the identity-keyed answers. A report saved before this
       build carries only the old POSITION list; it is converted here against
       today's order, which is safe because that list of seven has never
       changed in the tool's history (verified against every revision of the
       shell). An id present in a save but no longer on screen is ignored
       rather than guessed at. */
    (function _restoreEquip(mapKey, legacyKey, sel){
      var cbs = document.querySelectorAll(sel);
      var map = s[mapKey];
      if(map && typeof map === 'object' && !Array.isArray(map)){
        cbs.forEach(function(cb,i){
          var e = map[cb.value || ('pos'+i)];
          cb.checked = !!(e && e.status === 'yes');
        });
        return;
      }
      if(Array.isArray(s[legacyKey])){
        cbs.forEach(function(cb){ cb.checked = false; });
        s[legacyKey].forEach(function(i){ if(cbs[i]) cbs[i].checked = true; });
      }
    })('equipState',   'equipChecked',   'input[name="equip3a"]');
    (function _restoreEquip4b(){
      var cbs4 = document.querySelectorAll('input[name="equip4b"]');
      var map = s.equipState4b;
      if(map && typeof map === 'object' && !Array.isArray(map)){
        cbs4.forEach(function(cb,i){
          var e = map[cb.value || ('pos'+i)];
          cb.checked = !!(e && e.status === 'yes');
        });
        return;
      }
      if(Array.isArray(s.equipChecked4b)){   // S321
        cbs4.forEach(function(cb){ cb.checked = false; });
        s.equipChecked4b.forEach(function(i){ if(cbs4[i]) cbs4[i].checked = true; });
      }
    })();
    // S321: rebuild pitot rows (idempotent — clear containers + counts first)
    if(s.pitotRows){
      ['3a','4b'].forEach(function(tab){
        var c=document.getElementById('pitot-'+tab);
        if(c) c.innerHTML='';
        if(typeof pitotCounts!=='undefined') pitotCounts[tab]=0;
        (s.pitotRows[tab]||[]).forEach(function(r){
          if(typeof addPitotRow!=='function') return;
          addPitotRow(tab, r.id);   // S540
          var n=pitotCounts[tab];
          var pp=document.getElementById('pp-'+tab+'-'+n); if(pp) pp.value=r.p||'';
          var pf=document.getElementById('pf-'+tab+'-'+n); if(pf) pf.value=r.f||'';
          var po=document.getElementById('po-'+tab+'-'+n); if(po) po.value=r.o||'1';
        });
        if((s.pitotRows[tab]||[]).length && typeof calcPitotTotal==='function') calcPitotTotal(tab);
      });
    }
    if(s.stdData) s.stdData.forEach(function(r,i){ if(stdData[i]) Object.assign(stdData[i],r); });
    if(s.pldData) s.pldData.forEach(function(r,i){ if(pldData[i]) Object.assign(pldData[i],r); });
    if(s.pumpCurvePoints) { pumpCurvePoints.length=0; s.pumpCurvePoints.forEach(function(p){pumpCurvePoints.push(p);}); }
    if(s.pldPumpCurvePoints) { pldPumpCurvePoints.length=0; s.pldPumpCurvePoints.forEach(function(p){pldPumpCurvePoints.push(p);}); }
    if(s.clState) { var _migCl=_migrateClState(s.clState, s.clSchemaVer); Object.keys(clState).forEach(function(k){delete clState[k];}); Object.assign(clState,_migCl); Object.keys(clState).forEach(function(k){ if(clState[k]) delete clState[k].timestamp; }); }
    if(s.customItems) { Object.keys(customItems).forEach(function(k){delete customItems[k];}); Object.assign(customItems,s.customItems); }
    if(s.contractors) { contractors.length=0; s.contractors.forEach(function(c){contractors.push(c);}); }
    if(Array.isArray(s.distribution)) { distribution.length=0; s.distribution.forEach(function(n){distribution.push(n);}); }   // S328
    if(s.contractorTrades) { contractorTrades = JSON.parse(JSON.stringify(s.contractorTrades)); }
    if(s.deficiencies) { Object.keys(deficiencies).forEach(function(k){delete deficiencies[k];}); Object.assign(deficiencies,s.deficiencies); }
    if(s.generalDeficiencies) { generalDeficiencies.length=0; s.generalDeficiencies.forEach(function(d){generalDeficiencies.push(d);}); }
    if(s.contractorSignRows) { contractorSignRows.length=0; s.contractorSignRows.forEach(function(r){contractorSignRows.push(r);}); }
    if(s.sigStrokes && typeof _sigStrokes!=='undefined'){ Object.keys(_sigStrokes).forEach(function(k){delete _sigStrokes[k];}); Object.keys(s.sigStrokes).forEach(function(k){ var v=s.sigStrokes[k]; _sigStrokes[k]=(v&&!Array.isArray(v)&&Array.isArray(v.s))?v.s:v; }); }   // S605: unwrap {s:[...]}; legacy bare arrays pass through
    if(s.batData) {
      if(s.batData.b1) batData.b1=s.batData.b1.map(Number);
      if(s.batData.b2) batData.b2=s.batData.b2.map(Number);
      renderBatTable('bat1-body','b1'); renderBatTable('bat2-body','b2'); updateBatTotals();
    }
    if(s.deletedItems) { Object.keys(deletedItems).forEach(function(k){delete deletedItems[k];}); Object.keys(s.deletedItems).forEach(function(k){deletedItems[k]=new Set(s.deletedItems[k]);}); }
    if(s.flowTestPhotosPld) { flowTestPhotosPld.length=0; s.flowTestPhotosPld.forEach(function(p){flowTestPhotosPld.push(p);}); renderFlowTestThumbsPld(); }
    if(s.flowTestPhotos) { flowTestPhotos.length=0; s.flowTestPhotos.forEach(function(p){flowTestPhotos.push(p);}); renderFlowTestThumbs(); }
    if(s.sketchEntries) { sketchEntries.length=0; s.sketchEntries.forEach(function(e){sketchEntries.push(e);}); }
    if(s.formRevision) formRevision=s.formRevision;
    if(s.formDateModified) formDateModified=s.formDateModified;
    if(s.smState){ Object.keys(smState).forEach(function(k){ if(s.smState[k]) Object.assign(smState[k], s.smState[k]); }); }
    if(s.smCapVis){ Object.keys(smCapVis).forEach(function(k){ if(s.smCapVis[k]) Object.assign(smCapVis[k], s.smCapVis[k]); }); }
    if(s.annDsForce){ Object.keys(annDsForce).forEach(function(k){ if(s.annDsForce[k]) annDsForce[k]=Object.assign({}, s.annDsForce[k]); }); }
    updateRevisionDisplay();
    // Re-render all
    renderStdTable(); renderPldTable(); renderPumpCurveTable(); renderPldPumpCurveTable();
    renderContractorTags(); renderDeficGroups(); renderGeneralDeficGroup(); updateDeficSummary();
    renderAllSignRows();
    calcTotalDemand3pt(); calcTotalDemandPld();
    syncAllFields(); refreshAllCharts();
    var _srcMap={s1:S1,s2:S2,s3:S3,s4:S4_items,s4pld:S4_items,s5m:S5_mandatory,s5:S5};
    var _contMap={s1:'cl-s1',s2:'cl-s2',s3:'cl-s3',s4:'cl-s4',s4pld:'cl-s4pld',s5m:'cl-s5-mandatory',s5:'cl-s5'};
    ['s1','s2','s3','s4','s4pld','s5m','s5'].forEach(function(sec){
      if(_srcMap[sec]) renderChecklist(_srcMap[sec],_contMap[sec],sec);
    });
    updateProgress(); updateVerdict();
    showToast('\u21b6 Undo applied',1500);
  } catch(err) { console.error('Undo apply error:',err); showToast('Undo failed: '+err.message,2000); }
}

// Old undo code removed — using unified system
var _origSetStatus = setStatus;
setStatus = function(id, status) { _pushUndo(); _origSetStatus(id, status); };

renderBatTable('bat1-body','b1');
renderBatTable('bat2-body','b2');

// Global drag/drop visual feedback
document.addEventListener('dragover', function(e) {
  var zone = e.target.closest('.photo-zone,[ondragover]');
  if(zone) { e.preventDefault(); zone.classList.add('drag-over'); zone.style.borderColor='var(--red)'; }
});
document.addEventListener('dragleave', function(e) {
  var zone = e.target.closest('.photo-zone,[ondragover]');
  if(zone) { zone.classList.remove('drag-over'); zone.style.borderColor=''; }
});
document.addEventListener('drop', function(e) {
  document.querySelectorAll('.drag-over').forEach(function(el){ el.classList.remove('drag-over'); el.style.borderColor=''; });
});
renderStdTable();
renderPldTable();
renderPumpCurveTable();
document.getElementById('pi-date').value = new Date().toISOString().slice(0,10);
document.getElementById('so-date').value = new Date().toISOString().slice(0,16);

// ── PUMP TEST TYPE TOGGLE ──
let flowTestPhotos = [];
let recordPhotos = []; // S-records: site records — {d,n,id,kind:'pump'|'placard'|'site',r2*,caption,date}
var _sigStrokes = {}; // signature vector strokes per canvas id — survives reload + recolours on theme toggle
function setPumpTestType(type) {
  // Stage-1 merge: 3-Point and 7-Point now live in one "4. Performance Test" tab.
  // 'both' is retired (one-or-the-other always); coerce any legacy value to a real type.
  if (type !== 'std' && type !== 'pld') type = 'std';
  const secStd = document.getElementById('perf-std');
  const secPld = document.getElementById('perf-pld');
  if (secStd) secStd.style.display = (type === 'pld') ? 'none' : '';
  if (secPld) secPld.style.display = (type === 'pld') ? '' : 'none';
  // Sync the toggle buttons + maintain the canonical `on` class (save reads `.on`)
  document.querySelectorAll('.pump-type-btns button').forEach(function(b) {
    var isAct = b.dataset.ptype === type;
    b.classList.toggle('on', isAct);   // canonical — collectState reads `.on`
    /* S582: the identity mode cards are styled entirely by CSS (.ts-mode.on).
       The old inline background/color/border writes are skipped for them —
       inline styles would override the card look in both skins. Legacy-shaped
       buttons (none remain in this shell, but PDF-template copies exist) keep
       the old path so nothing else changes appearance. */
    if(!b.classList.contains('ts-mode')){
      var isDark = document.body.classList.contains('dark-mode');
      b.style.background = isAct ? (isDark ? '#2a3a5c' : '#2C4770') : (isDark ? '#323a4e' : 'white');
      b.style.color = isAct ? 'white' : (isDark ? '#d4daf0' : '#666');
      b.style.borderColor = isAct ? (isDark ? '#3a4e78' : '#2C4770') : (isDark ? '#4a5570' : '#ccc');
      b.textContent = b.textContent.replace(/^[⦿○]/, isAct ? '⦿' : '○');
    }
  });
  const note4a = document.getElementById('tab-type-note-4a');
  if(note4a) note4a.textContent = 'All sections below use the selected test type.';
  /* S622g: every route into the type — a tap, a cloud load, a JSON restore —
     lands here, so the lock state and the colour identity are refreshed here
     rather than at each call site (that is how the choice went unrestored in
     the first place). */
  if(typeof _ttApplyLock==='function') _ttApplyLock();
  if(typeof updateProgress==='function') updateProgress();
  // S221: mirror water-supply/demand data between 3-Point and 7-Point on tab switch.
  // The field-level _syncSupply only ran on oninput, so values entered on one tab never
  // reached the other tab's fields — leaving the newly-shown chart's supply/demand lines
  // empty. _syncSupply picks source-of-truth by which section is visible, which is the
  // WRONG direction once the display has already flipped here. Instead, do a direction-safe
  // fill: copy a non-empty value into a blank counterpart, never overwrite an existing value.
  (function _mirrorSupplyBothWays(){
    var pairs = [
      ['ws-static-flow','pld-ws-static-flow'],['ws-static-psi','pld-ws-static-psi'],
      ['ws-res-flow','pld-ws-res-flow'],['ws-res-psi','pld-ws-res-psi'],
      ['dem-spr-flow','pld-dem-spr-flow'],['dem-spr-psi','pld-dem-spr-psi'],
      ['dem-hose-flow','pld-dem-hose-flow']
    ];
    pairs.forEach(function(p){
      var a=document.getElementById(p[0]), b=document.getElementById(p[1]);
      if(!a||!b) return;
      var av=(a.value||'').trim(), bv=(b.value||'').trim();
      if(av!=='' && bv==='') b.value=a.value;
      else if(bv!=='' && av==='') a.value=b.value;
    });
    if(typeof calcTotalDemand3pt==='function'){ try{calcTotalDemand3pt();}catch(e){} }
    if(typeof calcTotalDemandPld==='function'){ try{calcTotalDemandPld();}catch(e){} }
  })();
  // Init/refresh the charts for whichever section just became visible (must be on-screen first)
  if (document.getElementById('panel-s4')?.classList.contains('active')) {
    requestAnimationFrame(function(){
      try {
        if (type === 'pld') {
          if (typeof initPldChart==='function' && !pldChart) { initPldChart(); setTimeout(hookChartAnnotations, 200); }
          else if (typeof updatePldChart==='function') updatePldChart();
          if (typeof initPldNetChart==='function' && !pldNetChart) { initPldNetChart(); setTimeout(hookChartAnnotations, 200); }
          else if (typeof updatePldNetChart==='function') updatePldNetChart();
          if (pldChart) pldChart.resize();
          if (pldNetChart) pldNetChart.resize();
        } else {
          if (typeof initChart3pt==='function' && !chart3pt) { initChart3pt(); setTimeout(hookChartAnnotations, 200); }
          else if (typeof updateChart3pt==='function') updateChart3pt();
          if (typeof initNetChart3pt==='function' && !netChart3pt) { initNetChart3pt(); setTimeout(hookChartAnnotations, 200); }
          else if (typeof updateNetChart3pt==='function') updateNetChart3pt();
          if (chart3pt) chart3pt.resize();
          if (netChart3pt) netChart3pt.resize();
        }
      } catch(e){ console.error('setPumpTestType chart init:', e); }
    });
  }
  debounceAutosave();
}

// ── FLOW TEST PHOTO ──
let flowTestPhotoInput = document.getElementById('global-file-input');
// 4b independent flow test photo upload
let flowTestPhotosPld = [];
function triggerFlowTestPhotoPld() { openFlowEquipModal('pld'); }
function _pfFlowTestPld(f){ if(!f||!f.type||f.type.indexOf('image/')!==0) return; var r=new FileReader(); r.onload=function(ev){ flowTestPhotosPld.push(ArcPhoto.mint(ev.target.result,f.name)); renderFlowTestThumbsPld(); }; r.readAsDataURL(f); }
function triggerFlowTestCameraPld() {
  if(typeof _camBurst==='function'){ _camBurst(function(f){ _pfFlowTestPld(f); }); return; }
  const fi = document.getElementById('global-file-input');
  fi._target = '__flowtestpld';
  fi.value = ''; fi.setAttribute('capture','environment'); fi.multiple=false; fi.click();
}
function handleFlowTestDropPld(e) {
  e.preventDefault();
  Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/')).forEach(f=>{
    const r=new FileReader();
    r.onload=ev=>{ flowTestPhotosPld.push(ArcPhoto.mint(ev.target.result,f.name)); renderFlowTestThumbsPld(); };
    r.readAsDataURL(f);
  });
}
function renderFlowTestThumbsPld() {
  if(typeof _renderRecordZones==='function') _renderRecordZones();
  const el=document.getElementById('flow-test-thumbs-pld');
  if(!el) return;
  el.innerHTML = flowTestPhotosPld.map((p,i)=>({p:p,i:i})).filter(o=>!_isPhotoDeleted(o.p)).map(({p,i})=>`
    <div style="position:relative;">
      <img src="${_phSrc(p)}" onclick="openLightbox(flowTestPhotosPld,${i})" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:2px solid #ddd;cursor:zoom-in;">
      <button onclick="flowTestPhotosPld.splice(${i},1);renderFlowTestThumbsPld()" style="position:absolute;top:-5px;right:-5px;background:#A85959;color:white;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:10px;padding:0;">✕</button>
    </div>`).join('');
}
function triggerFlowTestPhoto() { openFlowEquipModal('std'); }
function _pfFlowTest(f){ if(!f||!f.type||f.type.indexOf('image/')!==0) return; var r=new FileReader(); r.onload=function(ev){ flowTestPhotos.push(ArcPhoto.mint(ev.target.result,f.name)); renderFlowTestThumbs(); }; r.readAsDataURL(f); }
function triggerFlowTestCamera() {
  if(typeof _camBurst==='function'){ _camBurst(function(f){ _pfFlowTest(f); }); return; }
  currentPhotoId = '__flowtest';
  deficPhotoTarget = null;
  sketchFileTarget = null;
  const fi = document.getElementById('global-file-input');
  fi.value = ''; fi.setAttribute('capture','environment'); fi.multiple=false; fi.click();
}
function handleFlowTestDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  Array.from(e.dataTransfer.files).forEach(f => {
    if(!f.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = ev => {
      flowTestPhotos.push(ArcPhoto.mint(ev.target.result,f.name));
      renderFlowTestThumbs();
    };
    r.readAsDataURL(f);
  });
}
function renderFlowTestThumbs() {
  // Flow-chart photos now live as an evidence tile in 4a/4b; refresh those.
  if(typeof _renderRecordZones==='function') _renderRecordZones();
  // legacy thumbs container (if ever present)
  const el = document.getElementById('flow-test-thumbs');
  if(!el) return;
  el.innerHTML = flowTestPhotos.map((p,i)=>({p:p,i:i})).filter(o=>!_isPhotoDeleted(o.p)).map(({p,i})=>`
    <div class="photo-thumb"><img src="${_phSrc(p)}">
    <button class="photo-remove" onclick="flowTestPhotos.splice(${i},1);renderFlowTestThumbs()">✕</button></div>`).join('');
}

// S280: second #global-file-input change listener REMOVED.
// It was the duplicate that caused one upload to save two photos (and the
// clState["null"] orphan via auto-vivify). All of its routing branches
// (__flowtest, deficPhotoTarget response/evidence, checklist, continuous
// camera) are now handled by the single authoritative listener defined above.

// sketch photo file handler
document.getElementById('sketch-file-input').addEventListener('change', function(e) {
  if(sketchFileTarget === null || !e.target.files[0]) return;
  const f = e.target.files[0];
  const r = new FileReader();
  r.onload = ev => { initMarkupCanvas(sketchFileTarget, ev.target.result); sketchFileTarget = null; };
  r.readAsDataURL(f);
});

// ══════════════════════════════════════════════════
// SYNC ALL SHARED FIELDS
// ══════════════════════════════════════════════════
function syncAllFields() {
  // Water supply is ONE logical site supply shared between the 3-Point and 7-Point
  // sections of the merged Performance tab. Sync is BIDIRECTIONAL so a value entered
  // in whichever section is visible propagates to the other and can never be stranded
  // when the inspector switches test type mid-job. 3-pt id is treated as canonical when
  // both sides hold different non-empty values.
  const pairs = [
    ['ws-static-flow','pld-ws-static-flow'],
    ['ws-static-psi', 'pld-ws-static-psi'],
    ['ws-res-flow',   'pld-ws-res-flow'],
    ['ws-res-psi',    'pld-ws-res-psi'],
    ['dem-spr-flow',  'pld-dem-spr-flow'],
    ['dem-spr-psi',   'pld-dem-spr-psi'],
    ['dem-hose-flow', 'pld-dem-hose-flow'],
  ];
  pairs.forEach(([a, b]) => {
    const ea = document.getElementById(a);
    const eb = document.getElementById(b);
    if (!ea || !eb) return;
    const va = (ea.value||'').trim();
    const vb = (eb.value||'').trim();
    if (va === vb) return;
    if (va !== '' && vb === '') { eb.value = ea.value; }       // 3pt → PLD (fill empty)
    else if (va === '' && vb !== '') { ea.value = eb.value; }  // PLD → 3pt (fill empty)
    else { eb.value = ea.value; }                              // both set & differ → 3pt canonical
  });
  // Recompute both demand totals so the visible section's total cell is correct
  if (typeof calcTotalDemand3pt === 'function') calcTotalDemand3pt();
  if (typeof calcTotalDemandPld === 'function') calcTotalDemandPld();
  // Update pld-dem-total display
  const tf = parseFloat(document.getElementById('dem-flow').value)||0;
  const tp = parseFloat(document.getElementById('dem-psi').value)||0;
  const ptfl = document.getElementById('pld-dem-total-flow');
  const ptps = document.getElementById('pld-dem-total-psi');
  if (ptfl) ptfl.textContent = tf > 0 ? tf.toLocaleString() + ' gpm' : '—';
  if (ptps) ptps.textContent = tp > 0 ? tp + ' psi' : '—';
}

// ══════════════════════════════════════════════════
// AUTOSAVE (localStorage)
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// BATCH 2 — SHARED FEATURES
// ══════════════════════════════════════════════════

// ── 5. Project-number based save key (auto-keyed, no prompt) ──
function getProjectSaveKey(){
  var el=document.getElementById('pi-projno');
  var pno=(el&&el.value.trim())?el.value.trim().replace(/[^a-zA-Z0-9._-]/g,'_'):'default';
  return 'diesel_'+pno;
}

// ── 6. Share/Export with Web Share API ──
// ── 7. Photo auto-compression (1600px / 85%) ──
function compressImage(dataUrl, maxWidth, quality, callback){
  maxWidth = maxWidth || 1600; quality = quality || 0.85;
  var img = new Image();
  img.onload = function(){
    var w=img.width, h=img.height;
    if(w > maxWidth){ h = Math.round(h * maxWidth / w); w = maxWidth; }
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    var compressed = canvas.toDataURL('image/jpeg', quality);
    callback(compressed.length < dataUrl.length ? compressed : dataUrl);
  };
  img.onerror = function(){ callback(dataUrl); };
  img.src = dataUrl;
}

// ── 9. Offline indicator ──
function updateOfflineStatus(){
  var banner=document.getElementById('offline-banner');
  if(banner)banner.style.display=navigator.onLine?'none':'flex';
  var offbar=document.getElementById('offline-bar');
  if(offbar)offbar.style.display=navigator.onLine?'none':'block';
  var dot=document.getElementById('net-dot');var lbl=document.getElementById('net-label');
  if(dot){dot.style.background=navigator.onLine?'#4CAF50':'#FF5722';dot.style.boxShadow=navigator.onLine?'0 0 4px #4CAF50':'0 0 4px #FF5722';}
  if(lbl)lbl.textContent=navigator.onLine?'Online':'Offline';
  // conn-dot removed — using cloud-dot pattern
}
window.addEventListener('online',updateOfflineStatus);
window.addEventListener('offline',updateOfflineStatus);
updateOfflineStatus();

// ══ ADB MODULE (IndexedDB Persistence Layer — Session 53; S496: shared engine) ══
/* S496 — ADB.open now delegates to the SHARED factory (lib/data/idb.js) instead of
   hand-rolling indexedDB.open. Same database, same version, same live store — this is
   a wiring change, not a data change, and it needs NO migration.

   WHY the shared factory could not be used before: it hardcoded keyPath 'id' for every
   store, but Diesel's `state` store keys on 'k'. A keyPath is fixed at creation and
   cannot be changed by reopening the DB, so pointing Diesel at the old factory would
   NOT have thrown — the store already exists, creation is skipped, and reads/writes
   then disagree about where the key lives. Silent wrong data on a field tablet. The
   factory gained per-store keyPath in S496 precisely so this adoption is safe.

   S496 (Mark approved): `projects`, `photos` and `pdfData` are NO LONGER DECLARED.
   All three were created in every tablet's database and had ZERO read/write call sites
   in the entire tool. Dropping them from the declaration does NOT delete them from
   existing databases — the factory never drops undeclared stores; verifyShape() reports
   them as `extra` and leaves them untouched. They simply stop being recreated on new
   devices. Nothing reads them, so nothing can miss them.

   What is deliberately NOT shared: ADB.put/get/delete/getAll keep their own thin
   promise wrappers below, because `state` records are shaped {k,v} and the rest of the
   tool calls ADB.* directly. The engine owns OPENING the database; Diesel keeps its
   field-proven read/write verbs. */
/* S496: the shared IDB factory is bridged onto window.ARENCON_IDB by the module
   block near the top of <body>. Module blocks are DEFERRED, but ADB.open() is
   called from a classic inline script during parse — so the engine is NOT yet
   present at first call. ADB.open() therefore AWAITS the bridge's ready promise
   rather than probing for it: probing would always lose the race and silently
   leave Diesel on the fallback forever, which is a no-op nobody would notice.
   Everything downstream already awaits ADB.open()'s promise, so waiting costs
   nothing. */
window.ARENCON_IDB = window.ARENCON_IDB || {};
window.ARENCON_IDB._ready = window.ARENCON_IDB._ready || new Promise(function(res){
  window.ARENCON_IDB._resolve = res;
});
var ADB = {};
ADB.DB_NAME = 'ARENCON_DIESEL';
ADB.DB_VERSION = 4;   // S537: +photoBlobs (see _stashPhotoBlobs)
ADB._db = null;
ADB._engine = null;
ADB._opening = null;
ADB.open = function(){
  if(ADB._db) return Promise.resolve(ADB._db);
  if(!window.indexedDB) return Promise.reject('IndexedDB not available');
  /* S496: single-flight guard. `_db` is only set once the open COMPLETES, so the
     original code let every call that arrived before then start its own
     indexedDB.open() — and Diesel makes 5 ADB.open() calls at boot. Extra
     connections keep a `versionchange` from ever completing, which is how an
     upgrade silently hangs. One in-flight promise, shared by every caller. */
  if(ADB._opening) return ADB._opening;
  ADB._opening = ADB._openInternal().then(function(db){
    ADB._opening = null; return db;
  }, function(e){ ADB._opening = null; throw e; });
  return ADB._opening;
};
ADB._openInternal = function(){
  /* Wait for the bridge, but never hang: if the module fails to load the timeout
     resolves null and we fall back to the original inline open. A missing shared
     module must never cost an inspector their report. */
  var guard = new Promise(function(res){ setTimeout(function(){ res(null); }, 4000); });
  return Promise.race([ window.ARENCON_IDB._ready, guard ]).then(function(mk){
    if(ADB._db) return ADB._db;
    if(!mk){
      console.warn('[ADB] shared IDB engine unavailable — using inline fallback.');
      return new Promise(function(resolve,reject){
        var req = indexedDB.open(ADB.DB_NAME, ADB.DB_VERSION);
        req.onupgradeneeded = function(e){
          var db = e.target.result;
          if(!db.objectStoreNames.contains('state')) db.createObjectStore('state',{keyPath:'k'});
          if(!db.objectStoreNames.contains('photoBlobs')) db.createObjectStore('photoBlobs',{keyPath:'id'});   // S537
        };
        req.onsuccess = function(e){ ADB._db=e.target.result; resolve(ADB._db); };
        req.onerror = function(e){ reject(e); };
      });
    }
    if(!ADB._engine){
      ADB._engine = mk({
        dbName: ADB.DB_NAME,
        version: ADB.DB_VERSION,
        stores: [ { name:'state', keyPath:'k' },
                  { name:'photoBlobs', keyPath:'id' } ]   // S537
      });
    }
    return ADB._engine.init().then(function(db){
      ADB._db = db;
      /* Adoption self-check: reads the REAL database and reports any keyPath that
         disagrees with what we declared. Logs only — never blocks the tool. */
      try {
        ADB._engine.verifyShape().then(function(r){
          if(r && !r.ok) console.error('[ADB] KEYPATH MISMATCH', r.mismatches);
          else if(r) console.log('[ADB] shared engine active. extra stores:', r.extra);
        }).catch(function(){});
      } catch(_){}
      return db;
    });
  });
};
ADB.put = function(store,data){
  return new Promise(function(resolve,reject){
    ADB.open().then(function(db){
      var tx=db.transaction(store,'readwrite');
      tx.objectStore(store).put(data);
      tx.oncomplete=function(){resolve();};
      tx.onerror=function(e){reject(e);};
    }).catch(reject);
  });
};
ADB.get = function(store,key){
  return new Promise(function(resolve,reject){
    ADB.open().then(function(db){
      var tx=db.transaction(store,'readonly');
      var req=tx.objectStore(store).get(key);
      req.onsuccess=function(){resolve(req.result||null);};
      req.onerror=function(e){reject(e);};
    }).catch(reject);
  });
};
ADB.delete = function(store,key){
  return new Promise(function(resolve,reject){
    ADB.open().then(function(db){
      var tx=db.transaction(store,'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete=function(){resolve();};
      tx.onerror=function(e){reject(e);};
    }).catch(reject);
  });
};
ADB.getAll = function(store){
  return new Promise(function(resolve,reject){
    ADB.open().then(function(db){
      var tx=db.transaction(store,'readonly');
      var req=tx.objectStore(store).getAll();
      req.onsuccess=function(){resolve(req.result||[]);};
      req.onerror=function(e){reject(e);};
    }).catch(reject);
  });
};
ADB.dataUrlToBlob = function(dataUrl){
  var parts=dataUrl.split(',');var mime=parts[0].match(/:(.*?);/)[1];
  var raw=atob(parts[1]);var arr=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
  return new Blob([arr],{type:mime});
};
ADB.blobToDataUrl = function(blob){
  return new Promise(function(resolve,reject){
    var r=new FileReader();r.onload=function(){resolve(r.result);};
    r.onerror=function(){reject('Blob read error');};r.readAsDataURL(blob);
  });
};
// Legacy compatibility wrappers
var _idb_db = null;
ADB.open().then(function(db){_idb_db=db;updateIDBStorageBar();}).catch(function(e){console.warn('ADB init error:',e);});
function _idbPut(key,val){return ADB.put('state',{k:key,v:val});}
function _idbGet(key){return ADB.get('state',key).then(function(r){return r?r.v:null;});}
function _idbDelete(key){return ADB.delete('state',key);}
function updateIDBStorageBar(){
  // S266: measure REAL total browser storage via navigator.storage.estimate(), matching FRT.
  // (The old ADB.getAll('state') sum read only one IDB store and ignored the CloudSync
  //  database + photo/pdf stores — so it always showed ~0MB in Hub mode.)
  if(!navigator.storage || !navigator.storage.estimate){
    var lbl0=document.querySelector('#storage-display .storage-label');
    if(lbl0)lbl0.textContent='IDB';
    return;
  }
  navigator.storage.estimate().then(function(est){
    var usedMB=Math.round((est.usage||0)/1024/1024);
    var totalMB=Math.round((est.quota||0)/1024/1024);
    var pct=totalMB>0?Math.round(usedMB/totalMB*100):0;
    var _c=window.__dslHeaderCtl;
    if(_c) _c.setStorage({ pct:pct, label:usedMB+'MB / '+totalMB+'MB ('+pct+'%)' });
  }).catch(function(){});
}
// ══ END ADB MODULE ══

// ══ CLOUDSYNC INTEGRATION ══
// CloudSync module is injected at end of file
var _csHubMode = false; // true when launched from Hub with ?project= param
var _csProjectId = null;
var _csInstanceId = null;
// ══ END CLOUDSYNC INTEGRATION ══

const SAVE_KEY = 'arencon_pump_v10';

// Revision system
let formRevision = 'R00';
let formDateModified = '';
function addContractorField() {
  const container = document.getElementById('contractor-fields');
  if(!container) return;
  const existing = container.querySelectorAll('input');
  const idx = existing.length;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
  wrap.innerHTML = `<input type="text" id="pi-contractor-${idx}" placeholder="Additional contractor company" style="flex:1;">
          <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()" style="padding:2px 8px;font-size:12px;">✕</button>`;
  container.appendChild(wrap);
}
function touchRevision() {
  // Revision is now manual — only auto-update the date-modified field
  updateRevisionDisplay();
}
function updateRevisionDisplay() {
  // Only update date-modified, not revision (revision is manual)
  formDateModified = new Date().toLocaleDateString('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'});
  const el2 = document.getElementById('pi-date-modified');
  if(el2) el2.value = formDateModified;
}
var _autosaveTimer = null;
/* ═══ S622k — TYPING SAVES; LEAVING A FIELD IS NOT A SAVE EVENT (Mark's four
   T1 scenarios, 07 Aug — together they proved the mechanism in one sitting).
   Rated Speed's own typing handler updated the chart but never triggered a
   save; like ~90 other fields, it saved only when the browser fired the
   leave-the-field event. Two consequences, both observed on-device:
     • a field never left = a value that never reached the cloud at all
       (his scenario 2: the iPhone's newer number invisible everywhere);
     • the entry stamp minted at BLUR time, so whoever left their field LAST
       won the race regardless of who TYPED last (his scenario 4).
   One delegated listener now routes every keystroke in a report field into
   the existing debounced autosave — the same keystroke-time stamp law the
   flow rows have had since S594, applied to the whole report. Capture phase
   so a field that stops propagation cannot opt out. Dialog and search
   inputs are excluded; the debounce and the change-scoped push keep the
   write volume identical to before. The ~90 inline handlers stay as they
   are — redundant calls into a debounce cost nothing. */
try {
  document.addEventListener('input', function (e) {
    var el = e && e.target;
    if (!el || !el.matches) return;
    if (!el.matches('input, textarea, select')) return;
    if (el.closest('.dlg-backdrop, dialog, .help-panel, .modal, [data-nosave]')) return;
    if (typeof debounceAutosave === 'function') debounceAutosave();
  }, true);
} catch (_) {}

function debounceAutosave() {
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    _autosaveTimer = null;   // S321: pending-edit detection for the heartbeat guard
    touchRevision(); saveState();
    // S239: also push to cloud during normal editing (debounced), so the cloud row
    // stays current and a refresh never reloads a stale value. Slightly longer delay
    // than the IDB write to batch rapid typing into fewer cloud writes.
    clearTimeout(_cloudPushTimer);
    _cloudPushTimer = setTimeout(() => {
      /* S617b (Mark's question exposed this): the navigator.onLine test here
         predates the sync layer knowing how to handle offline itself, and it
         BYPASSED the S617 edit-time stamping — a value typed offline never
         reached the layer that records WHEN it was typed, so it was still
         stamped at flush time despite the fix. The layer's own gate handles
         connectivity now: offline it writes the durable pending record and
         pins the edit's true moment, touching no network. */
      if (_csHubMode && typeof CloudSync !== 'undefined' && CloudSync.isInitialized) {
        try { CloudSync.save(JSON.stringify(_collectCloudState())); }
        catch (e) { console.warn('[autosave] cloud push failed:', e); }
      }
    }, 1500);
  }, 4000);
}
var _cloudPushTimer = null;
// Flush any pending autosave immediately (page hide / app-switch / refresh).
// Root cause of the S236 "typed value reverts on reload" bug: the 15s debounce
// timer never fired before unload, so the edit was never persisted. This commits it.
function _flushAutosave() {
  if (_autosaveTimer) { clearTimeout(_autosaveTimer); _autosaveTimer = null; }
  try { touchRevision(); saveState(); } catch (e) { console.warn('[flush] saveState failed:', e); }
  // S239: ROOT CAUSE of "value reverts to old number on refresh" — autosave only
  // wrote to IDB; the cloud row kept the stale value, and refresh reloads cloud.
  // Push the current state to cloud here so a typed value reaches the cloud row
  // before the page goes away. keepalive so the request survives unload.
  if (_csHubMode && typeof CloudSync !== 'undefined' && CloudSync.isInitialized) {
    /* S617b — same stale onLine guard as the debounce site above: offline, the
       sync layer must still be reached so the edit's moment is pinned before
       the page goes away. */
    try { CloudSync.save(JSON.stringify(_collectCloudState())); }
    catch (e) { console.warn('[flush] cloud push failed:', e); }
  }
}
// visibilitychange(hidden) covers iPad app-switch + tab background; pagehide covers
// refresh/close. Both fire synchronously enough to land the IDB write + cloud push.
document.addEventListener('visibilitychange', function(){
  if (document.visibilityState === 'hidden') _flushAutosave();
});
window.addEventListener('pagehide', _flushAutosave);

/* ═══ S488 AUTOSAVE WATCHDOG (Mark: "I need a safety net that is not a patch") ═══
   THE PROBLEM IT REPLACES: Diesel's edits are wired as inline HTML attributes —
   oninput="deficiencies[..].comment=this.value" — that write straight into state
   and never save. An audit found 18 such handlers with NO save at all: contractor
   response status / comment / date, deficiency description + status, signature
   rows, battery readings. Type, refresh, gone. Adding saveState() to those 18 is
   a patch: handler 19 forgets again. FRT never had this because saving lives in
   its MODEL layer, not in handlers — no handler can bypass it.
   THE FIX (FRT's structure, ported): one delegated listener at the document, so
   ANY input/change on ANY field — existing, or added years from now by anyone —
   marks state dirty and saves after typing settles. Nobody has to remember.
   Deliberately NOT debounced away to nothing: 700ms after the last keystroke,
   plus the hard flush already wired above for hide/refresh/close. */
var _wdTimer = null;
function _wdQueueSave() {
  if (_wdTimer) clearTimeout(_wdTimer);
  _wdTimer = setTimeout(function(){
    _wdTimer = null;
    try { touchRevision(); saveState(); }
    catch (e) { console.warn('[watchdog] save failed:', e); }
  }, 700);
}
function _wdIsFieldEvent(e) {
  var el = e && e.target;
  if (!el || !el.tagName) return false;
  var tag = el.tagName.toUpperCase();
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
  /* ignore transient UI that is not report data: file pickers (their own paths
     mint + persist), and search/filter boxes which never enter saved state. */
  if (el.type === 'file') return false;
  if (el.id && /^(dfx-|search|filter)/i.test(el.id)) return false;
  if (el.closest && el.closest('#hdr-mount')) return false;   /* sealed header chrome */
  return true;
}
document.addEventListener('input',  function(e){ if (_wdIsFieldEvent(e)) _wdQueueSave(); }, true);
document.addEventListener('change', function(e){ if (_wdIsFieldEvent(e)) _wdQueueSave(); }, true);
/* Android Chrome pull-to-refresh does not reliably fire pagehide (Mark's exact
   repro). 'freeze' covers the bfcache path; a dirty-timer flush covers the rest. */
window.addEventListener('freeze', _flushAutosave);
window.addEventListener('beforeunload', function(){ if (_wdTimer) _flushAutosave(); });
function saveState(){
  try{
    var key=getProjectSaveKey();
    var _st=collectState();
    var json=JSON.stringify(_st);
    _idbPut(key,json);
    /* S555: record WHAT this save changed. Records only — it does not block or
       alter the save. Reuses the state already collected above, so it costs one
       object walk and no second serialisation. */
    if (window._dslJournal) { try { window._dslJournal.record(_st, 'save'); } catch(e){} }
    /* S570: raise the quiet flag if a save was flagged. Fire-and-forget, fully
       guarded — never blocks, never delays, never fails the save. */
    if (typeof _dslCheckSaveFlag === 'function') { try { _dslCheckSaveFlag(); } catch(e){} }
    updateIDBStorageBar();
    // S548: the store engine is published by part02 (a module). If that module
    // ever fails to load, a save must still complete — a missing shared module
    // must never cost an inspector their report.
    if (typeof _stashPhotoBlobs === 'function') _stashPhotoBlobs();   // never blocks the save
    /* S553b: once a photo's own file is safely here AND its upload confirmed,
       drop the copy carried inside the report. Runs AFTER the stash so it can
       never retire something the store has not taken yet, and it only touches
       the in-memory report — this save has already been serialised, so the
       saving happens naturally on the next one. Small bites: it runs behind
       someone typing, same as the stash. */
    if (typeof window._dslPhotoRetire === 'function') { try { window._dslPhotoRetire(25); } catch(e){} }
  }catch(e){console.warn('saveState error:',e);}
}

// ═══════════════════════════════════════════════════════════════════════════
// S537 — DIESEL PHOTO STORE. Until now Diesel kept every photo's image INSIDE
// the report, as text. That is the root reason Diesel could not use the shared
// photo-durability engine: the rescue stage recovers a lost image from the
// device's own copy, and Diesel had no copy that was separate from the thing
// that just went wrong. One damaged report took its photos with it, because the
// report WAS the photos. It is also why Diesel reports run to a megabyte and a
// half and why the cloud payload has to haul image data around.
//
// This gives Diesel a real store, keyed by photo id, holding actual binary.
//
// WHY A SWEEP RATHER THAN A HOOK AT EVERY CAMERA/UPLOAD/GALLERY PATH: there are
// a dozen ways a photo enters a Diesel report and more will be added. A hook per
// path is a bug generator — S496 records the identical photo-preserve rule
// hand-written five times, and the general-deficiency copy being MISSING for
// months while every cloud apply silently wiped those photos. One idempotent
// sweep over whatever is actually in the report cannot be forgotten by a future
// path, and it doubles as the migration for photos that already exist.
//
// DELIBERATELY ADDITIVE. The inline copy stays for now — nothing reads from the
// store yet. This push only builds the second copy. Removing the inline copy is
// its own step, after the store has been proven to hold what it claims.
// ═══════════════════════════════════════════════════════════════════════════
/* ═══ S548 — THE LOCAL PHOTO STORE NOW LIVES IN lib/data/photoStore.js ═══
   124 lines of S537 moved out verbatim in behaviour. Diesel does not keep a
   copy: part02 builds the shared engine with Diesel's database, Diesel's photo
   walk and Diesel's inline field, and publishes it under the same names the
   rest of this file already calls. A second copy here would be the "matching
   copy" trap — two implementations, one of which quietly stops being
   maintained. Electric gets the same engine by supplying its own three pieces,
   not by inheriting a thousand lines of Diesel.

   Names still available globally, unchanged for every caller:
     _dataUrlToBlob  _stashPhotoBlobs  _stashRoomOk  _dieselLocalBytes
     _photoStoreReport
   See diesel-app/js/part02.js for the wiring. */

// ═══ S531 — stable ids for flow-test photos (prerequisite for per-item merge) ═══
// The timestamp/merge engine pairs items across devices by a stable key. Photos
// minted since ArcPhoto always carry an id, but pre-mint legacy entries do not,
// and those fall back to POSITION. Position is not stable across a splice: delete
// photo 2 on one device and every later photo shifts, so a merge can pair the
// wrong two photos and let one device's photo overwrite another's. Backfilling an
// id costs nothing, is idempotent, and makes the key stable for good. Runs on the
// live arrays at every collect, so every save/push path is covered by one call.
function _ensureFlowPhotoIds(){
  try{
    [ (typeof flowTestPhotos!=='undefined'?flowTestPhotos:null),
      (typeof flowTestPhotosPld!=='undefined'?flowTestPhotosPld:null) ].forEach(function(arr){
      if(!Array.isArray(arr)) return;
      arr.forEach(function(p){
        if(p && (!p.id || p.id==='')) p.id = 'ph_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
      });
    });
  }catch(e){ console.warn('[S531] flow photo id backfill skipped:', e && e.message); }
}
// ═══ S532 — permanent identities for deficiencies, responses and sketches ═══
// These were the last structures in the report with NO identity of their own.
// The only thing telling deficiency #3 from #4 was its position in the list, so
// two devices could never be merged item-by-item: insert one deficiency at the
// top on device A and every later entry shifts, and device B's edit to "the third
// one" lands on a different deficiency entirely. Position is not identity.
// Assigning a permanent id costs nothing, is idempotent, and migrates existing
// reports quietly the first time anyone opens and saves them — no DB rewrite.
// Runs at every collect, so every save/push path is covered from one call site.
function _lwwNewId(pfx){ return pfx+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).substr(2,6); }
function _ensureDeficIds(){
  try{
    function _stampOne(d, pfx){
      if(!d || typeof d!=='object') return;
      if(!d.id || d.id==='') d.id=_lwwNewId(pfx);
      if(Array.isArray(d.responses)) d.responses.forEach(function(r){
        if(r && typeof r==='object' && (!r.id || r.id==='')) r.id=_lwwNewId('resp');
      });
    }
    if(typeof deficiencies!=='undefined' && deficiencies && typeof deficiencies==='object'){
      Object.keys(deficiencies).forEach(function(ctr){
        if(Array.isArray(deficiencies[ctr])) deficiencies[ctr].forEach(function(d){ _stampOne(d,'def'); });
      });
    }
    if(typeof generalDeficiencies!=='undefined' && Array.isArray(generalDeficiencies)){
      generalDeficiencies.forEach(function(d){ _stampOne(d,'gdef'); });
    }
    // S540: contractorSignRows was ALREADY declared id-keyed in the sync spec,
    // but no row ever carried an id — so the S535 identity guard was (correctly)
    // skipping it and those rows had NO per-item protection at all, while the
    // spec claimed otherwise. Config promising coverage the data cannot support
    // is worse than no coverage. witnessSignRows is included for the same reason
    // before it is registered.
    [ (typeof contractorSignRows!=='undefined'?contractorSignRows:null),
      (typeof witnessSignRows!=='undefined'?witnessSignRows:null) ].forEach(function(arr){
      if(!Array.isArray(arr)) return;
      arr.forEach(function(r){
        if(r && typeof r==='object' && (!r.id || r.id==='')) r.id=_lwwNewId('sig');
      });
    });
    // S541: custom checklist items. A real in-memory structure (section -> rows),
    // unlike the DOM-derived rows in S540, so a plain backfill is enough.
    if(typeof customItems!=='undefined' && customItems && typeof customItems==='object'){
      Object.keys(customItems).forEach(function(sec){
        if(!Array.isArray(customItems[sec])) return;
        customItems[sec].forEach(function(r){
          if(r && typeof r==='object' && (!r.id || r.id==='')) r.id=_lwwNewId('ci');
        });
      });
    }
    if(typeof sketchEntries!=='undefined' && Array.isArray(sketchEntries)){
      sketchEntries.forEach(function(e){
        if(e && typeof e==='object' && (!e.id || e.id==='')) e.id=_lwwNewId('sk');
      });
    }
  }catch(e){ console.warn('[S532] deficiency id backfill skipped:', e && e.message); }
}
function collectState() {
  _ensureFlowPhotoIds();
  _ensureDeficIds();
  /* S605 — permanent ids for pump-curve rows so the engine can pair them by
     identity (S540 pattern); without ids the whole table merged last-save-wins. */
  [typeof pumpCurvePoints!=='undefined'?pumpCurvePoints:null, typeof pldPumpCurvePoints!=='undefined'?pldPumpCurvePoints:null].forEach(function(arr){
    if(!Array.isArray(arr)) return;
    arr.forEach(function(p){ if(p && !p.id) p.id='cv_'+Date.now().toString(36)+'_'+Math.random().toString(36).substr(2,6); });
  });
  const proj = {};
  ['pi-projno','pi-client','pi-projname','pi-addr','pi-prepby','pi-date',
   'pi-contractor','pi-version','pi-ref','pi-revision','pi-date-modified',
   'pm-prv','pm-rpm','pm-equip','pm-pitot','pm-pitotflow','pm-rated-flow',
   'pm-relief','pm-reducing','pm-relief-pld','pm-reducing-pld',
   'pm-pitot-pld','pm-pitotflow-pld','pm-rated-flow-pld',
   'ws-static-flow','ws-static-psi','ws-res-flow','ws-res-psi',
   'dem-spr-flow','dem-spr-psi','dem-hose-flow',
   'pld-ws-static-flow','pld-ws-static-psi','pld-ws-res-flow','pld-ws-res-psi',
   'pld-dem-spr-flow','pld-dem-spr-psi','pld-dem-hose-flow',
   'pm-prv-pld','pm-pld-setting','pm-rpm-pld',
   'ps-jci-d','ps-jci-f','ps-jco-d','ps-jco-f','ps-fci-d','ps-fci-f','ps-fco-d','ps-fco-f','ps-jci-d-pld','ps-jci-f-pld','ps-jco-d-pld','ps-jco-f-pld','ps-fci-d-pld','ps-fci-f-pld','ps-fco-d-pld','ps-fco-f-pld',
   'np-mfr','np-model','np-serial','np-size','np-stages','np-impeller','np-bhp','np-maxbhp','np-drvmfg','np-drvsn','np-ctlmfg','np-ctlsn','np-mfr-pld','np-model-pld','np-serial-pld','np-size-pld','np-stages-pld','np-impeller-pld','np-bhp-pld','np-maxbhp-pld','np-drvmfg-pld','np-drvsn-pld','np-ctlmfg-pld','np-ctlsn-pld',
   'so-name','so-title','so-company','so-date','test-result',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) proj[id] = el.value;
  });
  /* ═══ S622i — A DEFAULT THE PERSON NEVER CHOSE MUST NEVER LEAVE THE DEVICE
     (Mark's B2, 06 Aug: pick 7-Point on PC, sync to the phone, hard-refresh
     PC — and BOTH devices were back on 3-Point). The kill chain: if the boot
     restore fails to relight the buttons for any reason, this collect used to
     fall back to 'std', the engine saw 'std' vs the ledger's 'pld', minted it
     as a fresh entry, and the fabricated default beat the real choice on
     every device. The skeleton rule (S622, statusMaps) applies to this scalar
     too: no button lit and no choice made → the save simply OMITS testType,
     and absence never deletes — the cloud's real choice survives no matter
     what state this device's screen is in. */
  var testType;
  document.querySelectorAll('.pump-type-btns button').forEach(function(b){ if(b.classList.contains('on')) testType=b.dataset.ptype; });
  // S582: whether a person has actually chosen the test type. Legacy saves have
  // no field; the load path treats a present testType as chosen (see below).
  var ttChosen = (typeof _ttChosen!=='undefined') ? !!_ttChosen : true;
  if (testType === undefined) ttChosen = undefined;   // unset ships as absent, not as a claim
  // Equipment checkboxes
  /* ═══ S616c — EQUIPMENT ANSWERS GET IDENTITIES ═══════════════════════════
     These were stored as POSITIONS — "boxes 0, 3 and 5 are ticked" — with no
     record of WHICH equipment that was. Two consequences, both silent:
       • two inspectors in one report could not be reconciled, because a
         position means nothing across devices, so one person's equipment
         answers replaced the other's on whatever saved last;
       • the day anyone edits or reorders that list, every saved report shifts
         and reports equipment that was never used, with no error.
     Each answer is now its own record — this item, this answer, this time —
     the same shape the checklist uses, which the merge engine already
     arbitrates correctly. An absent key means never answered; 'no' means
     deliberately unticked and travels like any other answer.

     The legacy position array is STILL WRITTEN, deliberately. A tablet on a
     cached older build reads only that key, and would otherwise show a blank
     equipment list on a report someone else had filled in. It is derived
     output, never read back by this build (see the load path), so it cannot
     fight the stamped map. Drop it once every device is confirmed current. */
  const equipState = {};
  const equipChecked = [];
  document.querySelectorAll('input[name="equip3a"]').forEach(function(cb,i){
    var k = cb.value || ('pos'+i);
    equipState[k] = { status: cb.checked ? 'yes' : 'no' };
    if(cb.checked) equipChecked.push(i);
  });
  // S321: the 7-pt tab's equipment was NEVER persisted
  const equipState4b = {};
  const equipChecked4b = [];
  document.querySelectorAll('input[name="equip4b"]').forEach(function(cb,i){
    var k = cb.value || ('pos'+i);
    equipState4b[k] = { status: cb.checked ? 'yes' : 'no' };
    if(cb.checked) equipChecked4b.push(i);
  });
  // S321: pitot rows were NEVER persisted — readings lived only in the DOM
  const pitotRows = {};
  ['3a','4b'].forEach(function(tab){
    var rows=[];
    for(var n=1;n<=((typeof pitotCounts!=='undefined'&&pitotCounts[tab])||0);n++){
      var pp=document.getElementById('pp-'+tab+'-'+n), pf=document.getElementById('pf-'+tab+'-'+n), po=document.getElementById('po-'+tab+'-'+n);
      if(!pp&&!pf&&!po) continue;   // removed row
      // S540: carry the row's permanent name; mint for rows predating this change.
      var _pr=document.getElementById('pr-'+tab+'-'+n);
      var _pid=_pr?_pr.getAttribute('data-pid'):null;
      if(!_pid){ _pid='pt_'+Date.now().toString(36)+'_'+Math.random().toString(36).substr(2,6); if(_pr) _pr.setAttribute('data-pid',_pid); }
      rows.push({id:_pid, p:pp?pp.value:'', f:pf?pf.value:'', o:po?po.value:'1'});
    }
    pitotRows[tab]=rows;
  });
  // S321: custom equipment TEXT was never persisted (only its checkbox index)
  const customEquip = {};
  ['3a','4b'].forEach(function(tab){
    var arr=[];
    document.querySelectorAll('#equip-custom-'+tab+' label').forEach(function(w){
      var cb=w.querySelector('input[type=checkbox]'), tx=w.querySelector('input[type=text]');
      // S540: carry the row's permanent name; mint for rows predating this change.
      var _cid=w.getAttribute('data-cid');
      if(!_cid){ _cid='ce_'+Date.now().toString(36)+'_'+Math.random().toString(36).substr(2,6); w.setAttribute('data-cid',_cid); }
      arr.push({id:_cid, t:tx?tx.value:'', c:cb?cb.checked:true});
    });
    customEquip[tab]=arr;
  });
  return {
    proj,
    testType,
    ttChosen,
    npshPsi,
    npshPsiPld,
    equipChecked,
    equipChecked4b,
    equipState,
    equipState4b,
    pitotRows,
    customEquip,
    stdData: stdData.map(r=>({...r})),
    pldData: pldData.map(r=>({...r})),
    pumpCurvePoints: pumpCurvePoints.map(p=>({...p})),
    pldPumpCurvePoints: pldPumpCurvePoints.map(p=>({...p})),
    clState: JSON.parse(JSON.stringify(clState)),
    clSchemaVer: 2,
    customItems: JSON.parse(JSON.stringify(customItems)),
    contractors: [...contractors],
    contractorTrades: JSON.parse(JSON.stringify(contractorTrades)),
    deficiencies: JSON.parse(JSON.stringify(deficiencies)),
    generalDeficiencies: JSON.parse(JSON.stringify(generalDeficiencies)),
    contractorSignRows: contractorSignRows.map(r=>({...r})),
    witnessSignRows: witnessSignRows.map(r=>({...r})),
    /* S605 — wrapped {s:[...]} per canvas so the engine's per-key stamp
       survives JSON; bare arrays drop attached properties on serialize. */
    sigStrokes: (function(){ var o={}; if(typeof _sigStrokes!=='undefined') Object.keys(_sigStrokes).forEach(function(k){ o[k]={s:JSON.parse(JSON.stringify(_sigStrokes[k]||[]))}; }); return o; })(),
    // Photos stored separately to keep main state lean
    batData: {b1:[...batData.b1], b2:[...batData.b2]},
    flowTestPhotosPld: flowTestPhotosPld.map(p=>({d:p.d,n:p.n,id:p.id||'',tag:p.tag||'',caption:p.caption||'',mk:p.mk||null,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''})),
    deletedItems: (function(){ var o={}; Object.keys(deletedItems).forEach(function(k){ o[k]=[...deletedItems[k]]; }); return o; })(),
    flowTestPhotos: flowTestPhotos.map(p=>({d:p.d,n:p.n,id:p.id||'',tag:p.tag||'',caption:p.caption||'',mk:p.mk||null,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''})),
    recordPhotos: recordPhotos.map(p=>({d:p.d,n:p.n,id:p.id,kind:p.kind,caption:p.caption||'',date:p.date||'',r2Key:p.r2Key||'',r2Status:p.r2Status||'',r2Url:p.r2Url||'',mk:p.mk||null,_annotated:p._annotated||false,_origBackupId:p._origBackupId||'',_isOrigBackup:p._isOrigBackup||false,_mkTs:p._mkTs||0,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''})),
    sketchEntries: sketchEntries.map(e=>({id:e.id||'', comment:e.comment, markupImg:e.markupImg||null})),
    formRevision,
    formDateModified,
    appendixExcluded: (typeof _appendixExcl!=='undefined') ? Array.from(_appendixExcl) : [],   // S315 F1
    /* ═══ S616c — PUTTING A PHOTO BACK IN IS A DECISION, NOT AN ABSENCE ═════
       The exclusions were already keyed to each photo's own id, so identity
       was never the problem here. The problem was direction: only "excluded"
       was ever recorded, so re-including a photo looked exactly like never
       having touched it. Between two devices that made exclusion one-way —
       once anyone dropped a photo from the appendix, nobody could restore it,
       because their restore carried no evidence to beat the other device's
       exclusion. Both answers are now recorded with the time they were made,
       so the later decision wins whichever way it went.
       Only photos a person has actually ruled on appear here; the map is not
       pre-filled with every eligible photo. */
    appendixState: (function(){
      var out = {};
      try {
        if (typeof _appendixExcl !== 'undefined') _appendixExcl.forEach(function(k){ out[k] = { status:'out' }; });
        if (typeof _appendixIncl !== 'undefined') _appendixIncl.forEach(function(k){ if(!out[k]) out[k] = { status:'in' }; });
      } catch(_) {}
      return out;
    })(),
    distribution: [...distribution],   // S328: report recipients
    smState: JSON.parse(JSON.stringify(smState)),
    smCapVis: JSON.parse(JSON.stringify(smCapVis)),
    annDsForce: JSON.parse(JSON.stringify(annDsForce)),
  };
}



// ═══ BUILD SAVE HTML (used by email export) ═══
// ═══ CLOUD STATE — strips base64 photos from CloudSync payload ═══
function _collectCloudState(){
  var s=collectState();
  s._build=(typeof DIESEL_BUILD!=='undefined')?DIESEL_BUILD:'unknown';   // S302: which build wrote this row
  // S305: heartbeat log removed — pushes run every 15s and were flooding the
  // console (Mark). Event logs ([DLB], merge backup-restores, errors) remain.
  // RETENTION GUARD (B): only strip a photo's base64 bytes from the CLOUD payload
  // once R2 has CONFIRMED the upload (r2Status==='uploaded'). Until then, carry the
  // bytes so a device that only ever saw the cloud copy can still render/recover the
  // photo. This never bloats confirmed photos; it protects un-synced field captures
  // from vanishing on a save->load->merge round-trip. (IDB always keeps full bytes.)
  function _keepD(p){ return (p && p.r2Status==='uploaded') ? '' : (p && p.d ? p.d : ''); }
  // Strip base64 photo data from all photo arrays — R2 handles confirmed ones.
  function _stripPhotos(arr){if(!arr)return arr;return arr.map(function(p){return{d:_keepD(p),n:p.n||'',id:p.id||'',tag:p.tag||'',caption:p.caption||'',r2Key:p.r2Key||'',r2Status:p.r2Status||'',r2Url:p.r2Url||'',mk:p.mk||null,_annotated:p._annotated||false,_origBackupId:p._origBackupId||'',_mkTs:p._mkTs||0,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''};});}
  if(s.clState){Object.keys(s.clState).forEach(function(k){if(s.clState[k]&&s.clState[k].photos)s.clState[k].photos=_stripPhotos(s.clState[k].photos);});}
  if(s.deficiencies){Object.keys(s.deficiencies).forEach(function(k){if(Array.isArray(s.deficiencies[k]))s.deficiencies[k].forEach(function(d){
    if(d.photos)d.photos=_stripPhotos(d.photos);
    if(d.responsePhoto)d.responsePhoto=null;
    if(d.responses)d.responses.forEach(function(r){if(r.photos)r.photos=_stripPhotos(r.photos);});
  });});}
  if(s.generalDeficiencies){s.generalDeficiencies.forEach(function(d){
    if(d.photos)d.photos=_stripPhotos(d.photos);
    if(d.responses)d.responses.forEach(function(r){if(r.photos)r.photos=_stripPhotos(r.photos);});
  });}
  if(s.flowTestPhotos)s.flowTestPhotos=_stripPhotos(s.flowTestPhotos);
  function _stripGaugePhotos(arr){if(!arr)return arr;return arr.map(function(p){return{d:_keepD(p),n:p.n||'',id:p.id||'',tag:p.tag||'',mode:p.mode||null,caption:p.caption||'',date:p.date||'',r2Key:p.r2Key||'',r2Status:p.r2Status||'',r2Url:p.r2Url||'',mk:p.mk||null,_annotated:p._annotated||false,_origBackupId:p._origBackupId||'',_mkTs:p._mkTs||0,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''};});}
  if(Array.isArray(s.stdData))s.stdData.forEach(function(r){if(r&&r.photos)r.photos=_stripGaugePhotos(r.photos);});
  if(Array.isArray(s.pldData))s.pldData.forEach(function(r){if(r&&r.photos)r.photos=_stripGaugePhotos(r.photos);});
  if(s.recordPhotos)s.recordPhotos=s.recordPhotos.map(function(p){return{d:_keepD(p),n:p.n||'',id:p.id||'',kind:p.kind||'',caption:p.caption||'',date:p.date||'',r2Key:p.r2Key||'',r2Status:p.r2Status||'',r2Url:p.r2Url||'',mk:p.mk||null,_annotated:p._annotated||false,_origBackupId:p._origBackupId||'',_isOrigBackup:p._isOrigBackup||false,_mkTs:p._mkTs||0,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''};});
  if(s.flowTestPhotosPld)s.flowTestPhotosPld=_stripPhotos(s.flowTestPhotosPld);
  if(s.sketchEntries)s.sketchEntries.forEach(function(e){e.markupImg=null;});
  // Signatures: strip canvas data (toDataURL) — keep only metadata
  // B1 (S341): stamp badgeText + badgeColor so the Hub reads, never derives.
  try{ _stampDieselBadges(s); }catch(e){ /* never break a push */ }
  return s;
}

// ═══ R2 PHOTO HELPERS ═══
var _r2FolderId = null; // set during Hub init
// S360: resolve the best image source for a photo, READ-ONLY (never mutates the
// photo). Order: local blob (.d) → saved r2Url → reconstruct from the photo id.
// The R2 object key is deterministic — photos/{projectId}/diesel/original/{id}.jpg
// — so even if a record lost its r2Key/r2Url (an upload whose pointer-write
// failed), we can still locate the file that's actually sitting in R2. This is
// pure string computation: worst case it returns '' exactly like before, so it
// cannot break the display. It also can't be clobbered by a stale device, because
// it derives the URL fresh each render instead of trusting the stored field.
function _photoSrc(p){
  if(!p) return '';
  // NEVER-BAKE (S372): composited display cache wins (clean p.d + p.mk rendered).
  if(p._mkDisplay) return p._mkDisplay;
  if(p.d) return p.d;
  /* S553: this device's own file, resolved ahead of cloud storage — it works
     with no signal, which is the case the store exists for. _localSrc is set by
     the resolver and is NEVER saved into the report; it is a live object URL. */
  if(p._localSrc) return p._localSrc;
  if(p.r2Url) return p.r2Url;
  if(p.id && _r2FolderId && typeof R2Photos!=='undefined' && R2Photos.getUrl){
    try{ return R2Photos.getUrl(_r2FolderId, 'diesel', 'original', _r2Fname(p)); }catch(_e){}
  }
  return '';
}
// S364: validate a fetched blob is a REAL image by its magic bytes — the R2 worker
// serves everything with content-type image/jpeg even when the stored object is an
// HTML error page (that's how corrupt "jpg" files got produced and re-uploaded).
// JPEG=FFD8FF, PNG=89504E47, GIF=474946, WEBP=52494646…WEBP, BMP=424D.
async function _isRealImageBlob(blob){
  try{
    if(!blob || blob.size < 4) return false;
    var buf = new Uint8Array(await blob.slice(0,16).arrayBuffer());
    if(buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return true;            // JPEG
    if(buf[0]===0x89 && buf[1]===0x50 && buf[2]===0x4E && buf[3]===0x47) return true; // PNG
    if(buf[0]===0x47 && buf[1]===0x49 && buf[2]===0x46) return true;            // GIF
    if(buf[0]===0x52 && buf[1]===0x49 && buf[2]===0x46 && buf[3]===0x46 &&
       buf[8]===0x57 && buf[9]===0x45 && buf[10]===0x42 && buf[11]===0x50) return true; // WEBP
    if(buf[0]===0x42 && buf[1]===0x4D) return true;                            // BMP
    return false;
  }catch(_e){ return false; }
}
// S365: ONE download helper for any photo, anywhere (gallery, flow-equip tiles,
// lightbox fallback). Resolves src via _photoSrc, fetches the bytes to a blob,
// validates it's a real image (R2 content-type is unreliable), and saves a real
// file — never window.open / cross-origin href (which just navigates to a page).
// ════ S366: badge-prefixed download filenames ════
// Every download (tiles, lightbox, flow-equip, gallery single + bulk) routes its
// filename through here so the saved file leads with the SAME short badge shown on
// the photo in the UI, then the original name. e.g. "3·Placard·(originalname).jpg",
// "7·25%·D·PLD·(originalname).jpg". Badge read from _collectAllPhotos() — single
// source of truth for on-screen badges — so filename ≡ what you see. Separator "·"
// (legal on Windows/macOS/Linux); "*" is NOT a legal filename char and was avoided.
function _dslSanitizeFilePart(s){
  return String(s||'').replace(/[\/\\:*?"<>|\u0000-\u001F]/g,'-').replace(/\s+/g,' ').trim();
}
function _dslPhotoBadge(p){
  if(!p) return '';
  try{
    var all = (typeof _collectAllPhotos==='function') ? _collectAllPhotos() : [];
    var hit = null;
    for(var i=0;i<all.length;i++){ if(all[i].photo===p){ hit=all[i]; break; } }
    if(!hit && p.id){ for(var j=0;j<all.length;j++){ if(all[j].photo && all[j].photo.id===p.id){ hit=all[j]; break; } } }
    return hit && hit.badge ? hit.badge : '';
  }catch(e){ return ''; }
}
// ════ B1: badge pass-through to the Hub (S341) ════
// The Hub photo gallery shows the EXACT badge text + colour the SOURCE tool
// assigns — it never derives. Diesel stamps badgeText + badgeColor (resolved
// HEX, not a CSS var — the Hub has its own stylesheet) onto each pushed photo,
// using _collectAllPhotos() as the single source of truth for badge text/cat
// (identical to the download-filename path). Theme-dependent colours are pinned
// to Diesel's DARK values because the Hub gallery renders Bold·Dark.
// cat → hex mirrors the .ph-badge-* CSS rules; gauge `tag` photos take the same
// per-reading colour the gallery paints inline via _gaugeReadingColor().
var _DSL_CAT_HEX = { checklist:'#5E7A8C', deficiency:'#A85959', general:'#6E86B8', flow:'#B07F5A', records:'#6E6AA8' };
var _DSL_GAUGE_HEX = { rpm:'#A593E0', suction:'#46C5E8', discharge:'#E26076', bf_in:'#E6A23C', bf_out:'#3FD08A', prv:'#3F7E78', prdv:'#9C6FA0' };
/* S615 — semantic badge category for the Hub gallery. Gauge readings report
   'gauge' (the reading itself is already in badgeText); everything else reports
   its own category. Values are stable strings the Hub can map to classes. */
function _dslBadgeType(item){
  try{
    var p = item && item.photo;
    if(p && p.tag && _DSL_GAUGE_HEX[p.tag]) return 'gauge';
    var c = item && item.cat;
    return (c==='deficiency'||c==='general') ? 'deficiency'
         : (c==='checklist') ? 'checklist'
         : (c==='flow') ? 'flow'
         : (c==='records') ? 'record' : 'record';
  }catch(e){ return 'record'; }
}
function _dslBadgeColorHex(item){
  try{
    var p = item && item.photo;
    if(p && p.tag && _DSL_GAUGE_HEX[p.tag]) return _DSL_GAUGE_HEX[p.tag];
    return _DSL_CAT_HEX[item && item.cat] || '#6E6AA8';
  }catch(e){ return '#6E6AA8'; }
}
// Build an id → {badgeText, badgeColor} index from the gallery's own walker,
// then stamp the matching (already-stripped) photo records in the push clone.
// Additive only; never throws into the push (caller try/catch-guards too).
function _stampDieselBadges(s){
  if(!s) return s;
  var idx = {};
  var all = (typeof _collectAllPhotos==='function') ? _collectAllPhotos() : [];
  all.forEach(function(item){
    var p = item && item.photo; if(!p || !p.id) return;
    /* S615 — badgeType added alongside badgeColor (Lane B ask). The Hub reads
       badgeText and picks its own class; a raw hex it cannot map. badgeType is
       the SEMANTIC category, so the Hub colours it in its own design system
       instead of inheriting Diesel's dark-mode palette. badgeColor stays for
       back-compat — additive only, nothing removed. */
    idx[p.id] = { badgeText: item.badge || '', badgeColor: _dslBadgeColorHex(item),
                  badgeType: _dslBadgeType(item) };
  });
  function stampArr(arr){
    if(!Array.isArray(arr)) return;
    arr.forEach(function(p){
      if(!p || !p.id) return;
      var b = idx[p.id]; if(!b) return;
      p.badgeText = b.badgeText; p.badgeColor = b.badgeColor; p.badgeType = b.badgeType;   // S615
    });
  }
  stampArr(s.flowTestPhotos); stampArr(s.flowTestPhotosPld); stampArr(s.recordPhotos);
  if(s.clState) Object.keys(s.clState).forEach(function(k){ if(s.clState[k]) stampArr(s.clState[k].photos); });
  if(s.deficiencies) Object.keys(s.deficiencies).forEach(function(k){ if(Array.isArray(s.deficiencies[k])) s.deficiencies[k].forEach(function(d){ stampArr(d.photos); if(d.responses) d.responses.forEach(function(r){ stampArr(r.photos); }); }); });
  if(Array.isArray(s.generalDeficiencies)) s.generalDeficiencies.forEach(function(d){ stampArr(d.photos); if(d.responses) d.responses.forEach(function(r){ stampArr(r.photos); }); });
  if(Array.isArray(s.stdData)) s.stdData.forEach(function(r){ if(r) stampArr(r.photos); });
  if(Array.isArray(s.pldData)) s.pldData.forEach(function(r){ if(r) stampArr(r.photos); });
  return s;
}
function _dslBadgeFilename(p){
  var orig = (p && p.n) ? p.n : ('photo_'+Date.now()+'.jpg');
  if(!/\.(jpe?g|png|webp|gif|bmp)$/i.test(orig)) orig += '.jpg';
  var badge = _dslSanitizeFilePart(_dslPhotoBadge(p));
  if(!badge) return _dslSanitizeFilePart(orig);
  return badge + '·' + _dslSanitizeFilePart(orig);
}

async function _dslDownloadPhoto(p){
  try{
    var src = _photoSrc(p);
    var name = _dslBadgeFilename(p);
    if(!src){ if(typeof showToast==='function') showToast('Photo not available'); return; }
    if(src.startsWith('data:')){
      var a0=document.createElement('a'); a0.href=src; a0.download=name;
      document.body.appendChild(a0); a0.click(); a0.remove(); return;
    }
    var resp = await fetch(src);
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    var blob = await resp.blob();
    if(!(await _isRealImageBlob(blob))) throw new Error('not a valid image');
    var url = URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 3000);
  }catch(e){
    console.warn('[download] failed', e);
    if(typeof showToast==='function') showToast('Download failed — photo not available');
  }
}

// Walk every live photo object across all report photo arrays.
function _forEachLivePhoto(cb){
  try{
    if(typeof flowTestPhotos!=='undefined' && Array.isArray(flowTestPhotos)) flowTestPhotos.forEach(cb);
    if(typeof flowTestPhotosPld!=='undefined' && Array.isArray(flowTestPhotosPld)) flowTestPhotosPld.forEach(cb);
    if(typeof stdData!=='undefined' && Array.isArray(stdData)) stdData.forEach(function(r){ if(r&&Array.isArray(r.photos)) r.photos.forEach(cb); });
    if(typeof pldData!=='undefined' && Array.isArray(pldData)) pldData.forEach(function(r){ if(r&&Array.isArray(r.photos)) r.photos.forEach(cb); });
    if(typeof recordPhotos!=='undefined' && Array.isArray(recordPhotos)) recordPhotos.forEach(cb);
    if(clState && typeof clState==='object') Object.keys(clState).forEach(function(k){ var v=clState[k]; if(v&&Array.isArray(v.photos)) v.photos.forEach(cb); });
    if(deficiencies && typeof deficiencies==='object') Object.keys(deficiencies).forEach(function(ctr){ (deficiencies[ctr]||[]).forEach(function(d){ if(Array.isArray(d.photos))d.photos.forEach(cb); (d.responses||[]).forEach(function(r){ if(Array.isArray(r.photos))r.photos.forEach(cb); }); }); });
    if(typeof generalDeficiencies!=='undefined' && Array.isArray(generalDeficiencies)) generalDeficiencies.forEach(function(d){ if(Array.isArray(d.photos))d.photos.forEach(cb); (d.responses||[]).forEach(function(r){ if(Array.isArray(r.photos))r.photos.forEach(cb); }); });
  }catch(e){ console.warn('[Outbox] photo walk error', e); }
}

// ════ S315 B5: reconcile self-healer ════
// Photos stuck on 'pending'/'failed' (or legacy: r2Key but no status) are
// GET-verified against R2 in the background; confirmed ones flip to 'uploaded'
// so the cloud badge turns green and tells the truth. GET-only verify (S266/S290
// proven pattern — never HEAD). 404 is deliberately left alone: the outbox drive
// owns re-upload and the dead-ref report owns true ghosts — this loop ONLY
// promotes to green, it never demotes.
var _reconBusy=false;
function _r2ReconcileSweep(){
  if(!_csHubMode || !_r2FolderId || !navigator.onLine || _reconBusy) return;
  var todo=[];
  _forEachLivePhoto(function(p){
    if(!p || !p.r2Url) return;
    var st=p.r2Status||'';
    if(st==='pending'||st==='failed'||(!st&&p.r2Key)) todo.push(p);
  });
  if(!todo.length) return;
  _reconBusy=true;
  var batch=todo.slice(0,6), changed=0, seq=Promise.resolve();   // throttle: 6/sweep
  batch.forEach(function(p){
    seq=seq.then(function(){
      return fetch(p.r2Url,{method:'GET'}).then(function(r){
        if(r.ok){ p.r2Status='uploaded'; changed++; }
      }).catch(function(){ /* network blip — next sweep retries */ });
    });
  });
  seq.then(function(){
    _reconBusy=false;
    if(changed){
      console.info('[reconcile] '+changed+' photo(s) verified in R2 \u2192 uploaded');
      if(typeof _pgRepaintCloudSoon==='function') _pgRepaintCloudSoon();
      saveState();
      if(typeof debounceAutosave==='function') debounceAutosave();
    }
  });
}
setInterval(_r2ReconcileSweep, 60000);   // no-op until Hub mode + folder ready
setTimeout(_r2ReconcileSweep, 8000);     // first sweep shortly after load

// ════ S315 N1: outbox visibility ════
// The 4-ghost loss died silently because nothing on screen said "photos are still
// waiting to upload". Two surfaces, both quiet (no toasts for background churn —
// canon): a small amber count pill beside the cloud-status dot whenever the
// durable outbox holds blobs, and ONE toast shortly after load if any outbox
// entry is older than 10 minutes (a genuinely stuck upload, not normal churn).
// Extends §S114-16 cloud-status visibility — never replaces it.
function _outboxPillUpdate(){
  if(typeof R2Outbox==='undefined') return;
  R2Outbox.getAll().then(function(es){
    /* S488: the outbox pill is a FIELD-SAFETY signal ("N photos still to
       upload — keep the app open"). It used to be injected next to the cloud
       span in the light DOM; it now rides the engine's R2 badge slot so it
       cannot be silently lost behind the seal. Same amber, same count. */
    var n=(es||[]).length;
    var _c=window.__dslHeaderCtl;
    if(!_c) return;
    if(!n){ _c.setR2Badge({ visible:false }); return; }
    _c.setR2Badge({ visible:true, text:n+' \u2B06', bg:'#B07F5A', color:'#fff' });
  }).catch(function(){});
}
setInterval(_outboxPillUpdate, 15000);
setTimeout(_outboxPillUpdate, 4000);
setTimeout(function(){
  if(typeof R2Outbox==='undefined') return;
  R2Outbox.getAll().then(function(es){
    var stale=(es||[]).filter(function(e){ return e && e.createdAt && (Date.now()-e.createdAt) > 600000; });
    if(stale.length && typeof showToast==='function'){
      showToast(stale.length+' photo'+(stale.length>1?'s':'')+' still awaiting cloud upload \u2014 keep the app open');
    }
  }).catch(function(){});
}, 12000);

// S398 R2 KEY ISOLATION: every NEW upload's filename is prefixed with this
// report's instanceId ("{uuid}__{photoId}.jpg") so R2 objects are provably owned
// by one report. Path depth is unchanged — the worker treats the filename as an
// opaque segment, so no worker change is needed. Legacy (unprefixed) objects keep
// loading via each photo's STORED r2Key/r2Url; reconstruction (pointer lost) uses
// p.r2v===2 to know which name shape to rebuild.
function _r2Fname(p){ return (p && p.r2v===2 && typeof _csInstanceId!=='undefined' && _csInstanceId ? (_csInstanceId+'__') : '') + p.id + '.jpg'; }
function _r2EnqueuePhoto(photoObj){
  if(!_csHubMode || !_r2FolderId || typeof R2Photos==='undefined') return;
  if(!photoObj || !photoObj.d) return;
  var blob = R2Photos.dataUrlToBlob(photoObj.d);
  if(!blob) return;
  // S281 B1: key the R2 object by the photo's UNIQUE id, never by the human
  // filename. Generic camera names (images.jpg, content.png) collided & overwrote
  // each other in R2 (older record's key → clobbered object → 404); object-valued
  // names stringified to "[object Object]". The id is guaranteed unique, so the
  // stored object name is {id}.jpg. The human filename is kept only as display
  // metadata on photoObj.n — it never enters the key/url again.
  photoObj.id = photoObj.id || ('ph_' + Date.now() + '_' + Math.random().toString(36).substr(2,6));
  if(typeof _csInstanceId!=='undefined' && _csInstanceId) photoObj.r2v = 2;   // S398: instance-owned key shape
  var fname = _r2Fname(photoObj);
  var r2Key = 'photos/' + _r2FolderId + '/diesel/original/' + fname;
  photoObj.r2Key = r2Key;
  photoObj.r2Status = 'pending';
  photoObj.r2Url = R2Photos.getUrl(_r2FolderId, 'diesel', 'original', fname);
  // Phase 2: persist blob to the durable outbox BEFORE uploading, then drive.
  // Blob survives app kill; removed only after R2 confirms (HEAD/GET) it's present.
  if(typeof R2Outbox!=='undefined'){
    R2Outbox.put({
      key: r2Key,
      projectId: _r2FolderId, tool: 'diesel', type: 'original', filename: fname,
      blob: blob, status: 'pending', attempts: 0, createdAt: Date.now()
    }).then(function(){ R2Outbox.drive(); }).catch(function(e){
      // Outbox write failed (private mode / quota) — fall back to in-memory queue
      console.warn('[Outbox] put failed, using in-memory queue:', e&&e.message);
      R2Photos.enqueue({ projectId:_r2FolderId, tool:'diesel', type:'original', filename:fname, blob:blob,
        onComplete:function(err){ photoObj.r2Status = err ? 'failed' : 'uploaded'; if(typeof _pgRepaintCloudSoon==='function') _pgRepaintCloudSoon(); } });
    });
  } else {
    R2Photos.enqueue({ projectId:_r2FolderId, tool:'diesel', type:'original', filename:fname, blob:blob,
      onComplete:function(err){ photoObj.r2Status = err ? 'failed' : 'uploaded'; if(typeof _pgRepaintCloudSoon==='function') _pgRepaintCloudSoon(); } });
  }
}

// ═══ S292: FRT markup-persistence semantics (port of FRT S115 _origBackupId flow) ═══
// On save: bake the original + strokes into a composite (CPU offscreen canvas —
// NEVER a displayed transparent canvas), swap the photo's display + R2 pointer to
// the marked version, and keep a clean "(original)" duplicate in Site Records.
// On revert: the duplicate is removed, the photo is restored to the unmarked
// original everywhere, and the marked R2 object is deleted. Matches FRT
// photos.js frt-markup-saved / frt-markup-reverted behavior exactly; the only
// internal difference is that the in-session editor stays the vector engine.
function _dslStampSiblings(photo, stampFn){
  // Diesel photos are single objects, but defensively stamp every reference
  // sharing the id (FRT sibling-stamping analog). S300: always stamp the
  // passed photo itself, and never id-match on a falsy id (undefined===undefined
  // would have stamped every id-less photo in the project).
  stampFn(photo);
  if(photo.id && typeof _collectAllPhotos==='function'){
    _collectAllPhotos().forEach(function(a){
      if(a.photo && a.photo!==photo && a.photo.id===photo.id) stampFn(a.photo);
    });
  }
}
// S300: load a guaranteed-taint-free Image for baking. Local dataURL first
// (never taints); else fetch the R2 object as a blob with a cache-buster
// (fresh CORS response, sidestepping Chrome's cache-poisoned non-CORS entries)
// and decode via an object URL (same-origin, never taints). The displayed
// lightbox <img> is NEVER used as a bake source again — that was the S292
// regression: a tainted canvas made toDataURL throw before anything persisted.
function _dslLoadBakeImage(p){
  return new Promise(function(res, rej){
    // S367b: for an ALREADY-annotated photo, p.d is the BAKED marked image — baking
    // the strokes onto it again double-stamps the markup (duplicates accumulate on
    // every re-save). Bake onto the CLEAN ORIGINAL instead, resolved the same way
    // re-entry editing does: backup record (_origBackupId) → its d / r2Url, else the
    // deterministic /original/ R2 key. Only annotated photos take this branch; a
    // first-ever markup still bakes onto p.d/r2Url as before.
    var origSrc = '';
    if(p && p._annotated && p._origBackupId && typeof recordPhotos!=='undefined'){
      var b = recordPhotos.filter(function(r){ return r && r.id===p._origBackupId; })[0];
      /* S560: the backup's own inline copy may itself be retired now — its
         device file (attached as _localSrc by hydrate/retire) is the same clean
         original and works offline, so it slots in ahead of the cloud URL. */
      if(b){ origSrc = b.d || b._localSrc || b.r2Url || ''; }
    }
    if(p && p._annotated && !origSrc && p.id && typeof _r2FolderId!=='undefined' && _r2FolderId &&
       typeof R2Photos!=='undefined' && R2Photos.getUrl){
      try{ origSrc = R2Photos.getUrl(_r2FolderId, 'diesel', 'original', _r2Fname(p)); }catch(_e){}
    }

    /* S560: a retired photo carries its picture as a blob: object URL
       (_localSrc) instead of inline text — both decode straight into an Image
       with no fetch, so both count as local. */
    var _pLocal = p.d || p._localSrc || '';
    var local = (!p._annotated && _pLocal) ? _pLocal
              : (origSrc && (origSrc.indexOf('data:')===0 || origSrc.indexOf('blob:')===0) ? origSrc : '');
    if(local){
      var im = new Image();
      im.onload = function(){ res({img:im, revoke:function(){}}); };
      im.onerror = function(){ rej(new Error('local image decode failed')); };
      im.src = local;
      return;
    }
    // cloud path: annotated → clean original URL; otherwise the photo's own r2Url
    var url = (p._annotated && origSrc) ? origSrc : (p.r2Url || origSrc || '');
    if(!url) return rej(new Error('photo has no local data and no cloud URL'));
    var busted = url + (url.indexOf('?')>=0 ? '&' : '?') + 'cb=' + Date.now();
    fetch(busted, {cache:'no-store'}).then(function(r){
      if(!r.ok) throw new Error('cloud fetch failed: HTTP '+r.status);
      return r.blob();
    }).then(function(b){
      var u = URL.createObjectURL(b), im = new Image();
      im.onload = function(){ res({img:im, revoke:function(){ try{URL.revokeObjectURL(u);}catch(_e){} }}); };
      im.onerror = function(){ try{URL.revokeObjectURL(u);}catch(_e){} rej(new Error('cloud image decode failed')); };
      im.src = u;
    }).catch(rej);
  });
}

// ═══ NEVER-BAKE DISPLAY LAYER (Diesel S372) ═══════════════════════════════
// Diesel historically BAKED markup into p.d (a flattened JPEG). Never-bake keeps
// p.d as the CLEAN original forever and treats p.mk (vectors) as the source of
// truth. Surfaces that show a photo as a plain <img src> can't composite vectors,
// so we keep a regenerable DISPLAY CACHE (p._mkDisplay): a composited data-URL
// rebuilt from the clean source + p.mk whenever markup changes. It is a derived
// cache only — never a backup, never the source of truth, stripped from cloud.
//
//   _phSrc(p)            → the right src for any <img>: display cache → clean → cloud
//   _rebuildMkDisplay(p) → regenerate p._mkDisplay from clean source + p.mk
//
// Already-baked legacy photos (p._annotated with no p.mk, or _nbBaked flag) keep
// their baked p.d untouched — _phSrc returns p.d for them, so nothing regresses.
// _phSrc delegates to _photoSrc (the single resolver), which now prefers the
// never-bake display cache. Kept as a thin alias so the thumbnail/PDF surfaces
// can read one short name.
function _phSrc(p){ return (typeof _photoSrc==='function') ? _photoSrc(p) : (p && (p._mkDisplay||p.d||p.r2Url) || ''); }

// NEVER-BAKE (S372): _mkDisplay is a derived cache, stripped from cloud/IDB on
// save. After a load, annotated photos have p.mk but no p._mkDisplay → they would
// render CLEAN (no marks) until re-saved. Walk every photo array and rebuild the
// display cache for any annotated photo missing it. Async + best-effort; surfaces
// re-render as each resolves. Legacy already-baked photos (annotated, no p.mk)
// are skipped — their clean p.d isn't available, so their existing baked p.d (if
// present) stays the display; _rebuildMkDisplay no-ops without mk.
function _rebuildAllMkDisplays(){
  try{
    var arrays = [];
    if(typeof recordPhotos!=='undefined') arrays.push(recordPhotos);
    if(typeof flowTestPhotos!=='undefined') arrays.push(flowTestPhotos);
    if(typeof flowTestPhotosPld!=='undefined') arrays.push(flowTestPhotosPld);
    function collectDefic(obj){ if(!obj) return; Object.keys(obj).forEach(function(k){
      var items = obj[k]; if(!Array.isArray(items)) items=[items];
      items.forEach(function(it){ if(it&&Array.isArray(it.photos)) arrays.push(it.photos);
        if(it&&Array.isArray(it.responses)) it.responses.forEach(function(r){ if(r&&Array.isArray(r.photos)) arrays.push(r.photos); }); });
    }); }
    if(typeof deficiencies!=='undefined') collectDefic(deficiencies);
    if(typeof generalDeficiencies!=='undefined' && Array.isArray(generalDeficiencies)){
      generalDeficiencies.forEach(function(d){ if(d&&Array.isArray(d.photos)) arrays.push(d.photos);
        if(d&&Array.isArray(d.responses)) d.responses.forEach(function(r){ if(r&&Array.isArray(r.photos)) arrays.push(r.photos); }); });
    }
    if(typeof clState!=='undefined') Object.keys(clState).forEach(function(k){ var c=clState[k]; if(c&&Array.isArray(c.photos)) arrays.push(c.photos); });

    var pending = [];
    arrays.forEach(function(arr){
      arr.forEach(function(p){
        var needsMk = p && p._annotated && p.mk && Array.isArray(p.mk.o) && p.mk.o.length;
        var needsRot = p && ((p.rotation||0)%360)!==0;   // S372: rotated photos also need the cache
        if((needsMk || needsRot) && !p._mkDisplay){
          pending.push(_rebuildMkDisplay(p));
        }
      });
    });
    if(pending.length){
      console.info('[NB] rebuilding '+pending.length+' display cache(s) after load');
      Promise.all(pending).then(function(){ if(typeof _dslRefreshPhotoSurfaces==='function') _dslRefreshPhotoSurfaces(); });
    }
  }catch(e){ console.warn('[NB] rebuildAll failed', e&&e.message); }
}
// Rebuild the display cache from the CLEAN source + current p.mk. Async (image
// decode). Resolves to the photo. No strokes → clears the cache (shows clean).
function _rebuildMkDisplay(p){
  return new Promise(function(resolve){
    try{
      if(!p){ resolve(p); return; }
      var hasMk = p.mk && Array.isArray(p.mk.o) && p.mk.o.length;
      var rot = ((p.rotation||0)%360+360)%360;   // S372: persisted display rotation
      // No marks AND no rotation → nothing to composite; show the clean photo as-is.
      if(!hasMk && !rot){ if(p._mkDisplay) delete p._mkDisplay; resolve(p); return; }
      // Load the CLEAN source the same taint-free way the (old) bake did.
      _dslLoadBakeImage(p).then(function(bake){
        try{
          var img=bake.img, nw=img.naturalWidth, nh=img.naturalHeight;
          if(!nw||!nh){ bake.revoke&&bake.revoke(); resolve(p); return; }
          // 1) clean photo + marks onto a natural-size buffer (markup is in natural coords)
          var buf=document.createElement('canvas'); buf.width=nw; buf.height=nh;
          var bx=buf.getContext('2d');
          bx.drawImage(img,0,0,nw,nh);
          if(hasMk && window.DieselMarkup) DieselMarkup.composite(bx, p.mk, nw, nh);
          // 2) rotate the composited buffer into the final display canvas
          var c, cx;
          if(rot===90||rot===270){ c=document.createElement('canvas'); c.width=nh; c.height=nw; }
          else { c=document.createElement('canvas'); c.width=nw; c.height=nh; }
          cx=c.getContext('2d');
          cx.save();
          cx.translate(c.width/2, c.height/2);
          cx.rotate(rot*Math.PI/180);
          cx.translate(-nw/2, -nh/2);
          cx.drawImage(buf,0,0,nw,nh);
          cx.restore();
          p._mkDisplay = c.toDataURL('image/jpeg', 0.9);
          bake.revoke&&bake.revoke();
        }catch(e){ console.warn('[NB] rebuild display failed', e&&e.message); }
        resolve(p);
      }).catch(function(e){ console.warn('[NB] rebuild load failed', e&&e.message); resolve(p); });
    }catch(e){ console.warn('[NB] rebuild error', e&&e.message); resolve(p); }
  });
}

async function _dslMarkupPersist(p, mk){
  if(!p || !mk) throw new Error('nothing to persist');
  if(!p.id) p.id = 'ph_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);   // S300: deterministic keys need an id
  var bake = await _dslLoadBakeImage(p);   // taint-free source (S300)
  var img = bake.img;
  var nw = img.naturalWidth, nh = img.naturalHeight;
  if(!nw || !nh){ bake.revoke(); throw new Error('bake image has no dimensions'); }
  console.info('[DLB] persist: bake source', p.d ? 'local dataURL' : 'cloud blob fetch', nw+'x'+nh);
  // ── Bake composite (offscreen, CPU — machine-safe) ──
  var c = document.createElement('canvas');
  c.width = nw; c.height = nh;
  var cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, nw, nh);
  // NEVER-BAKE (S372): capture the CLEAN source as a data-URL BEFORE compositing,
  // so the stamp can restore sp.d to clean (a re-saved legacy photo arrives with
  // a baked p.d). p.d must always hold the clean original under never-bake.
  var cleanD = '';
  try { cleanD = c.toDataURL('image/jpeg', 0.92); } catch(_e){ cleanD = ''; }
  DieselMarkup.composite(cx, mk, nw, nh);
  var markedD = c.toDataURL('image/jpeg', 0.9);
  bake.revoke();

  // ── Capture pre-markup state ──
  var preD = p.d || '', preKey = p.r2Key || '', preUrl = p.r2Url || '';
  var preStatus = p.r2Status || '', preDate = p.date || '';
  // FRT S115 P8: corrupted-state recovery — preKey already points at /marked/
  // (backup flags were lost earlier). Treat as no preKey so we don't back up a
  // marked file as the "original".
  if(preKey.indexOf('/marked/') >= 0){
    console.warn('[DLB] persist: preKey is /marked/ — corrupted-state recovery, treating as no preKey:', preKey);
    preKey = ''; preUrl = ''; preStatus = '';
  }
  var isReSave = !!p._origBackupId;
  // S306 (1a): annotated-but-backupless is a CORRUPTED state, not a first markup.
  // A sync race (heartbeat captured p.d=marked composite before _origBackupId/_mkTs
  // landed) leaves the photo annotated with an empty _origBackupId. Re-marking it
  // used to mint a fresh "(original)" — but preD is now the MARKED composite, so the
  // backup was a copy of the marked image (and repeated on every re-mark → the 3×
  // STAIR duplicates). Treat it as a re-save: bake the new strokes in place, create
  // NO backup. The true original for such a legacy photo was already lost in the
  // race; revert falls back to clear-flags-only. New photos are unaffected. The
  // preKey /marked/ test above only caught the cloud-key case; _annotated catches
  // the local-dataURL case it missed.
  var isCorruptReSave = !isReSave && (p._annotated || (preD && preD.length > 0 && !preKey && (typeof p.r2Url==='string' && p.r2Url.indexOf('/marked/')>=0)));
  if(isCorruptReSave){
    console.warn('[DLB] persist: annotated photo with no _origBackupId — corrupted-state re-save, suppressing backup (original unrecoverable for this legacy photo)', {id:p.id});
  }
  console.info('[DLB] persist', {id:p.id, isReSave:isReSave, isCorruptReSave:isCorruptReSave, preKey:preKey?preKey.slice(-40):'', hasPreD:!!preD});

  // ── Backup creation (first markup only) ──
  var backupId = p._origBackupId || null;
  if(!isReSave && !isCorruptReSave){
    // S372.4: the backup MUST be openable. preD is empty for cloud-loaded photos
    // (bytes live in R2, not p.d), and the marked stamp below repoints the live
    // photo's r2Key/r2Url to /marked/ — so a backup that only borrowed preKey could
    // end up pointing at a moved object → "Photo not found". Give the backup its OWN
    // resolvable bytes: use preD when present, else the cleanD data-URL we already
    // captured from the taint-free source. Upload it under the backup's own
    // /original/ key so it resolves from any device (FRT S363 parity).
    var backupBytes = preD || cleanD || '';
    if(backupBytes || preKey){
      var backupId2 = 'ph_orig_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
      var backup = {
        d: backupBytes, n: p.n || 'photo.jpg',
        id: backupId2,
        kind: 'site',
        caption: (p.caption ? (p.caption + ' (original)') : 'Original'),
        date: preDate || new Date().toISOString(),   // backup keeps ORIGINAL date
        r2Key: preKey, r2Url: preUrl, r2Status: preKey ? (preStatus || 'uploaded') : '',
        _isOrigBackup: true
      };
      if(typeof recordPhotos !== 'undefined') recordPhotos.push(backup);
      backupId = backup.id;
      // S372.4: guarantee the backup is openable. _r2EnqueuePhoto repoints the
      // record to its OWN /diesel/original/{id}.jpg key and uploads the bytes, so
      // the backup never depends on the live photo's key (which the stamp below
      // moves to /marked/). Call it whenever we have bytes — even if the photo had
      // a preKey — so the (original) copy gets its own durable object and the
      // "Photo not found" case can't happen. The local d also keeps it openable
      // offline immediately.
      if(backup.d && typeof _csHubMode!=='undefined' && _csHubMode){
        try { _r2EnqueuePhoto(backup); } catch(e){ console.warn('[DLB] persist: original backup upload enqueue failed', e); }
      }
      console.info('[DLB] persist: backup created', {backupId:backupId, hasD:!!backup.d, r2Key:backup.r2Key?backup.r2Key.slice(-40):''});
    } else {
      // FRT CASE 4: no original binary anywhere — markup persists but cannot revert.
      console.warn('[DLB] persist: no preKey and no local binary — markup will not be revertible');
    }
  }

  // ── Marked R2 location (deterministic key — stable across re-saves) ──
  var hub = (typeof _csHubMode!=='undefined' && _csHubMode && typeof _r2FolderId!=='undefined' && _r2FolderId);
  var markedFname = 'marked_' + _r2Fname(p).replace(/\.jpg$/,'') + '.jpg';
  var markedKey = hub ? ('photos/' + _r2FolderId + '/diesel/marked/' + markedFname) : '';
  var markedUrl = (hub && typeof R2Photos!=='undefined') ? R2Photos.getUrl(_r2FolderId, 'diesel', 'marked', markedFname) : '';

  // ── Stamp the photo (and any same-id references) ──
  var mkTs = Date.now();   // S301: annotation-state timestamp — merge arbitration
  var todayIso = new Date().toISOString();   // S372.4: FRT date model — marked photo → TODAY
  var stamp = function(sp){
    // NEVER-BAKE (S372): keep sp.d CLEAN (the original). The composited image goes
    // to sp._mkDisplay — a regenerable display cache that every <img> surface reads
    // via _phSrc(). p.mk (vectors) is the source of truth; sp.d is never overwritten
    // with a flattened image again. cleanD restores a re-saved legacy photo whose
    // arriving sp.d was the OLD baked composite.
    if(cleanD) sp.d = cleanD;
    sp._mkDisplay = markedD;
    sp._annotated = true;
    sp._mkTs = mkTs;
    if(backupId) sp._origBackupId = backupId;
    // S372.4 (FRT date model, ported): a MARKED photo carries TODAY's date so it
    // sorts into today's group in the gallery; the clean (original) backup keeps
    // the photo's ORIGINAL capture date (set on the backup record above). Revert /
    // erase-all rolls the marked photo back to the backup's original date.
    sp.date = todayIso;
    // p.mk holds the editable vectors for re-entry; deep-clone so siblings don't
    // share one mutable array.
    if(mk){ try{ sp.mk = JSON.parse(JSON.stringify(mk)); }catch(_e){ sp.mk = mk; } }
    if(hub){ sp.r2Key = markedKey; sp.r2Url = markedUrl; sp.r2Status = 'pending'; }
  };
  _dslStampSiblings(p, stamp);

  // ── Upload marked blob (durable outbox, same pattern as _r2EnqueuePhoto) ──
  if(hub && typeof R2Photos!=='undefined'){
    var blob = R2Photos.dataUrlToBlob(markedD);
    if(blob){
      if(typeof R2Outbox!=='undefined'){
        R2Outbox.put({ key: markedKey, projectId:_r2FolderId, tool:'diesel', type:'marked', filename:markedFname,
                       blob: blob, status:'pending', attempts:0, createdAt:Date.now()
        }).then(function(){ R2Outbox.drive(); }).catch(function(e){
          console.warn('[DLB] persist: marked outbox put failed, in-memory queue:', e&&e.message);
          R2Photos.enqueue({ projectId:_r2FolderId, tool:'diesel', type:'marked', filename:markedFname, blob:blob,
            onComplete:function(err){ if(p.r2Key===markedKey) p.r2Status = err ? 'failed' : 'uploaded'; if(typeof _pgRepaintCloudSoon==='function') _pgRepaintCloudSoon(); } });
        });
      } else {
        R2Photos.enqueue({ projectId:_r2FolderId, tool:'diesel', type:'marked', filename:markedFname, blob:blob,
          onComplete:function(err){ if(p.r2Key===markedKey) p.r2Status = err ? 'failed' : 'uploaded'; if(typeof _pgRepaintCloudSoon==='function') _pgRepaintCloudSoon(); } });
      }
    }
  }
  console.info('[DLB] persist OK', {id:p.id, backup:backupId||'(re-save)', markedKey:markedKey?markedKey.slice(-44):'(standalone)'});
  return { backupId: backupId, markedKey: markedKey };
}

// S301: re-render every surface that shows photo thumbnails. The checklist
// opens the lightbox without a renderer ctx, so its thumbs never refreshed
// after a markup save ("takes a bit to show up").
function _dslRefreshPhotoSurfaces(){
  try{
    if(typeof renderChecklist==='function'){
      if(typeof S1!=='undefined') renderChecklist(S1,'cl-s1','s1');
      if(typeof S2!=='undefined') renderChecklist(S2,'cl-s2','s2');
      if(typeof S3!=='undefined') renderChecklist(S3,'cl-s3','s3');
      if(typeof S4_items!=='undefined'){ renderChecklist(S4_items,'cl-s4','s4'); renderChecklist(S4_items,'cl-s4pld','s4pld'); }
      if(typeof S5_mandatory!=='undefined') renderChecklist(S5_mandatory,'cl-s5-mandatory','s5m');
      if(typeof S5!=='undefined') renderChecklist(S5,'cl-s5','s5');
    }
    if(typeof renderDeficGroups==='function') renderDeficGroups();
    if(typeof renderGeneralDeficGroup==='function') renderGeneralDeficGroup();
    if(typeof _renderRecordZones==='function') _renderRecordZones();
    if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
  }catch(e){ console.warn('[DLB] surface refresh failed', e); }
}

// S292: FRT-semantics revert (port of FRT frt-markup-reverted handler).
function _dslMarkupRevert(p){
  if(!p || !p._origBackupId) return false;
  var backup = (typeof recordPhotos!=='undefined') ?
    recordPhotos.filter(function(b){ return b && b.id === p._origBackupId; })[0] : null;
  if(!backup){
    console.warn('[DLB] revert: backup record not found — clearing flags only');
    delete p._origBackupId; delete p._annotated;
    return true;
  }
  var origKey = backup.r2Key || '', markedKey = p.r2Key || '';
  // FRT S115 P8 corruption guards — never delete the only remaining copy.
  if(origKey.indexOf('/marked/') >= 0){
    // S373: the backup's cloud key is corrupt (points at /marked/, a legacy state
    // from before the S372.4 persist guards). The OLD behavior abandoned revert
    // entirely. But the corrupt key only means the CLOUD object is unreliable — the
    // backup may still carry CLEAN local bytes (backup.d). Recover from those when
    // they are demonstrably NOT the marked image (i.e. distinct from the photo's
    // current marked display source). Only keep the marked version when there is no
    // distinct clean source anywhere — so we never restore the marked image as a
    // false "original" (the corruption this guard exists to prevent).
    var markedSrc = (p._mkDisplay || '') ;
    var cleanLocal = (backup.d && backup.d.indexOf('data:')===0 && backup.d !== markedSrc) ? backup.d : '';
    if(cleanLocal){
      console.warn('[DLB] revert: backup cloud key corrupt (/marked/) but clean local bytes present and distinct — recovering from backup.d, repointing to a fresh /original/ key.');
      var rvTsC = Date.now();
      var restoreC = function(sp){
        sp._mkTs = rvTsC;
        sp.d = cleanLocal;
        // drop the corrupt cloud reference; re-upload under a fresh /original/ key
        // so the recovered clean photo is durable across devices.
        sp.r2Key = ''; sp.r2Url = ''; sp.r2Status = '';
        if(backup.date) sp.date = backup.date;
        delete sp._annotated; delete sp._origBackupId; delete sp.mk; delete sp._mkDisplay;
      };
      _dslStampSiblings(p, restoreC);
      // give the recovered photo its own durable /original/ object (hub only)
      if(p.d && typeof _csHubMode!=='undefined' && _csHubMode && typeof _r2EnqueuePhoto==='function'){
        try{ _r2EnqueuePhoto(p); }catch(e){ console.warn('[DLB] revert: recovered-photo upload enqueue failed', e); }
      }
      var biC = recordPhotos.indexOf(backup); if(biC>=0) recordPhotos.splice(biC,1);
      if(typeof showToast==='function') showToast('Reverted — recovered the clean original from the local backup.');
      if(typeof saveState==='function') try{ saveState(); }catch(_e){}
      if(typeof debounceAutosave==='function') debounceAutosave();
      if(typeof _csHubMode!=='undefined' && _csHubMode && typeof CloudSync!=='undefined' && CloudSync.save && typeof _collectCloudState==='function'){ try{ CloudSync.save(_collectCloudState()); }catch(_e){} }
      if(typeof _dslRefreshPhotoSurfaces==='function') _dslRefreshPhotoSurfaces();
      return true;
    }
    console.error('[DLB] revert: CORRUPTED BACKUP — backup r2Key is /marked/ and no distinct clean bytes. Keeping marked version.');
    if(typeof showToast==='function') showToast('Cannot revert: the original backup is corrupted. Keeping the marked version.');
    delete p._origBackupId; delete p._annotated;
    var bi0 = recordPhotos.indexOf(backup); if(bi0>=0) recordPhotos.splice(bi0,1);
    return true;
  }
  if(markedKey && markedKey === origKey){
    console.error('[DLB] revert: CORRUPTED STATE — photo and backup share r2Key. Refusing.');
    if(typeof showToast==='function') showToast('Cannot revert: photo and backup share the same cloud file.');
    delete p._origBackupId; delete p._annotated;
    var bi1 = recordPhotos.indexOf(backup); if(bi1>=0) recordPhotos.splice(bi1,1);
    return true;
  }
  console.info('[DLB] revert', {id:p.id, backupId:backup.id, origKey:origKey?origKey.slice(-40):''});
  // ── Restore the photo (and same-id references) to the original ──
  var rvTs = Date.now();   // S301: revert is also an annotation-state change
  var restore = function(sp){
    sp._mkTs = rvTs;
    if(backup.d) sp.d = backup.d; else delete sp.d;
    sp.r2Key = origKey; sp.r2Url = backup.r2Url || '';
    sp.r2Status = origKey ? 'uploaded' : '';
    if(backup.date) sp.date = backup.date;   // S372.4: marking moves the photo to TODAY, so revert rolls it BACK to the backup's original capture date
    delete sp._annotated; delete sp._origBackupId; delete sp.mk;
    delete sp._mkDisplay;   // NEVER-BAKE (S372): drop the composited display cache → clean photo shows
  };
  _dslStampSiblings(p, restore);
  // ── Remove the backup record from Site Records ──
  var bi = recordPhotos.indexOf(backup); if(bi>=0) recordPhotos.splice(bi,1);
  // ── Delete the marked R2 object (background, orphan-safe) ──
  if(markedKey && markedKey !== origKey && markedKey.indexOf('/marked/')>=0 &&
     typeof _csHubMode!=='undefined' && _csHubMode && typeof _r2FolderId!=='undefined' && _r2FolderId &&
     typeof R2Photos!=='undefined' && R2Photos.remove){
    var fname = markedKey.split('/').pop();
    try { R2Photos.remove(_r2FolderId, 'diesel', 'marked', decodeURIComponent(fname)).catch(function(e){
      console.warn('[DLB] revert: marked R2 delete failed (orphan until purge):', e&&e.message);
    }); } catch(e){ console.warn('[DLB] revert: marked R2 delete threw:', e&&e.message); }
  }
  return true;
}

// S306 (1a cleanup): one-shot collapse of duplicate "(original)" Site backups.
// The pre-S306 persist path minted a fresh "(original)" record on every re-mark of
// an annotated-but-backupless photo (sync-race corruption), so a single photo could
// accumulate 3+ identical Site backups (the STAIR case: 3 copies / 8 photos / 4
// records reported S305). This folds same-source duplicates down to one survivor and
// re-points any annotated photos at it. Conservative: only _isOrigBackup records are
// touched; grouping is by caption + source signature so distinct originals are never
// merged. Idempotent — re-running after a clean state is a no-op.
function _dedupeOrigBackups(){
  if(typeof recordPhotos==='undefined' || !Array.isArray(recordPhotos)) return 0;
  // signature that identifies the SAME original content
  function _sig(b){
    var src = b.r2Key || b.r2Url || (b.d ? ('d:'+b.d.length+':'+b.d.slice(0,48)) : '');
    return (b.caption||'') + '|' + src;
  }
  var groups = {};
  recordPhotos.forEach(function(b){
    if(!b || !b._isOrigBackup) return;
    var k = _sig(b);
    (groups[k] = groups[k] || []).push(b);
  });
  // which backup ids are referenced by a live annotated photo
  var referenced = {};
  if(typeof _forEachLivePhoto==='function'){
    _forEachLivePhoto(function(p){ if(p && p._annotated && p._origBackupId) referenced[p._origBackupId]=true; });
  }
  var removeIds = {}, remap = {}, collapsed = 0;
  Object.keys(groups).forEach(function(k){
    var g = groups[k];
    if(g.length < 2) return;
    // survivor: prefer one already referenced by a photo, else the first
    var survivor = g.filter(function(b){ return referenced[b.id]; })[0] || g[0];
    g.forEach(function(b){
      if(b.id === survivor.id) return;
      removeIds[b.id] = true;
      remap[b.id] = survivor.id;   // re-point any photo that pointed at the dropped copy
      collapsed++;
    });
  });
  if(!collapsed) return 0;
  // re-point annotated photos whose backup was dropped
  if(typeof _forEachLivePhoto==='function'){
    _forEachLivePhoto(function(p){
      if(p && p._origBackupId && remap[p._origBackupId]) p._origBackupId = remap[p._origBackupId];
    });
  }
  // remove the dropped backup records
  for(var i=recordPhotos.length-1; i>=0; i--){
    if(recordPhotos[i] && removeIds[recordPhotos[i].id]) recordPhotos.splice(i,1);
  }
  console.info('[DLB] dedupeOrigBackups: collapsed '+collapsed+' duplicate (original) record(s)');
  try{
    if(typeof _dslRefreshPhotoSurfaces==='function') _dslRefreshPhotoSurfaces();
    if(typeof saveState==='function') saveState();
    if(typeof debounceAutosave==='function') debounceAutosave();
    if(typeof _csHubMode!=='undefined' && _csHubMode && typeof CloudSync!=='undefined' && CloudSync.save && typeof _collectCloudState==='function'){
      CloudSync.save(_collectCloudState());
    }
  }catch(e){ console.warn('[DLB] dedupeOrigBackups: post-cleanup refresh/save failed', e); }
  return collapsed;
}
if(typeof window!=='undefined') window._dedupeOrigBackups = _dedupeOrigBackups;

// S282 B5: reconcile self-healer — Diesel port of FRT's reconcileFailedAgainstR2
// (the mechanism that closed silent photo loss in FRT since S173). The outbox
// only heals entries still IN the outbox; photos stuck at pending/failed in live
// state (status flip lost before a save, outbox cleared, pre-B1 filename keys)
// were never settled. This walks every live photo not marked 'uploaded' and
// settles it against R2 truth:
//   object present  → mark 'uploaded' (badge goes green)
//   absent + local binary survives → re-enqueue via _r2EnqueuePhoto (also
//                     re-keys legacy filename keys to the id-based {id}.jpg)
//   absent + no binary → mark 'failed' (true orphan; B9's report will list it)
// Keys already queued in the outbox are skipped — the outbox driver owns them.
// Serialized GETs (Worker has no HEAD; body cancelled after headers), Hub-mode
// only, offline-safe, never runs concurrently.
var _r2ReconcileRunning = false;
// S306 (1b): re-hydrate a photo's local display data (p.d) from its surviving
// outbox blob. A failed R2 upload (e.g. the Worker 503 this session) leaves the
// blob durably in the outbox while cloud strips p.d on push — on reload the photo
// has r2Url pointing at a non-existent object and an empty p.d, so the gallery
// renders the camera-icon placeholder (the 2.2-photo symptom). INVARIANT R1/R6:
// the local binary is the permanent backup; a failed cloud upload must NEVER leave
// a photo without local display data. This restores it from the blob we still hold.