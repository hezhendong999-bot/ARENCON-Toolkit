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
      setPumpTestType(s.testType);
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
    if(s.equipChecked) {
      var cbs = document.querySelectorAll('input[name="equip3a"]');
      cbs.forEach(function(cb){ cb.checked = false; });
      s.equipChecked.forEach(function(i){ if(cbs[i]) cbs[i].checked = true; });
    }
    if(s.equipChecked4b) {   // S321
      var cbs4 = document.querySelectorAll('input[name="equip4b"]');
      cbs4.forEach(function(cb){ cb.checked = false; });
      s.equipChecked4b.forEach(function(i){ if(cbs4[i]) cbs4[i].checked = true; });
    }
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
    if(s.sigStrokes && typeof _sigStrokes!=='undefined'){ Object.keys(_sigStrokes).forEach(function(k){delete _sigStrokes[k];}); Object.keys(s.sigStrokes).forEach(function(k){ _sigStrokes[k]=s.sigStrokes[k]; }); }
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
    var isDark = document.body.classList.contains('dark-mode');
    b.classList.toggle('on', isAct);
    b.style.background = isAct ? (isDark ? '#2a3a5c' : '#2C4770') : (isDark ? '#323a4e' : 'white');
    b.style.color = isAct ? 'white' : (isDark ? '#d4daf0' : '#666');
    b.style.borderColor = isAct ? (isDark ? '#3a4e78' : '#2C4770') : (isDark ? '#4a5570' : '#ccc');
    b.textContent = b.textContent.replace(/^[⦿○]/, isAct ? '⦿' : '○');
  });
  const note4a = document.getElementById('tab-type-note-4a');
  if(note4a) note4a.textContent = 'All sections below use the selected test type.';
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

