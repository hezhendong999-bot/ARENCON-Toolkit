
// ══════════════════════════════════════════════════
// CHECKLIST DATA
// ══════════════════════════════════════════════════
const S1 = [
  { num:"1.1", text:"Coordinate with Building owner/authorized personnel, AHJ, contractor for test date and time. Coordinate alternate parking arrangement with Owner if required." },
  { num:"1.2", text:"Confirm with the Contractor that the suction pipe has been flushed prior to connecting to the fire pump. Written confirmation required." },
  { num:"1.3", text:"The following personnel shall attend the fire pump commissioning test: The sprinkler/fire pump installation contractor; The fire pump & controller test agent; TSSA inspector. Note: Sometimes the fire pump & controller testing agent is the TSSA inspector." },
  { num:"1.4", text:"Confirm hydrostatic test performed at 200 psi for minimum 2 hours." },
  { num:"1.5", text:"Contractors shall bring calibrated gauges (not older than 12 months) to replace the installed fire pump suction and discharge gauges during the pump test." },
  { num:"1.6", text:"Ask the Contractors to bring calibrated Hose Monsters (and paired flow chart) if possible, to minimize water damage to landscape. If not, play pipes are acceptable." },
  { num:"1.7", text:"The calibration standard is NIST. Ensure to take a photo of the calibration certificate." },
  { num:"1.8", text:"Confirm fire pump control wiring, fire alarm monitoring, ESA inspection and verification is complete." },
  { num:"1.9", text:"Ensure to bring ear protection and PPE." },
];

const S2 = [
  { num:"2.1", text:"Confirm fire pump components have been installed properly as per design drawings and are secure." },
  { num:"2.2", text:"Confirm the installation of concentric and eccentric increaser/reducer (eccentric — flat side up on suction)." },
  { num:"2.3", text:"If the fire pump is equipped with a 170 psi PLD: Confirm if any fittings/couplings/valves between the fire pump discharge outlet to the discharge control valve, including the test header, are rated for 300 psi or more." },
  { num:"2.4", text:"Confirm the calibrated gauges have been installed on the suction and discharge side of the fire pump. Check the calibration date tag on the back of the gauge is not older than 12 months." },
  { num:"2.5", text:"Conduct diesel tank, concrete containment and dike inspection. Confirm no cracks on the fire pump pad. Confirm net capacity of the concrete dike exceeds 10% of diesel tank capacity. Unit: 1 US gal = 0.161 ft³. FM requires additional 2\" freeboard in addition to the required dike height (normally 6\" to 8\")." },
  { num:"2.6", text:"If a floor drain is located within the containment, it shall be plugged or provided with curb to prevent fuel entering the drain." },
  { num:"2.7", text:"Any concrete surface (e.g. pads, tank support, floor etc.) within the containment footprint shall be treated with an impermeable coating (e.g. Epoxy) / fuel oil sealant as per CSA B139-19." },
  { num:"2.8", text:"Confirm tank diesel level at the level indicator on top of the diesel tank. Confirm the capacity of tank and tank type (double-wall) on the tank placard. The fuel tank shall be kept as full and maintained as practical at all times but never below 66% of tank capacity (pull the rod out and measure the length)." },
  { num:"2.9", text:"Confirm the diesel fuel tank supports (2\" sch 40 pipes) are enclosed in concrete (sona-tube or concrete footing)." },
  { num:"2.10", text:"Confirm all valve tags have been provided within the fire pump room." },
  { num:"2.11", text:"Confirm firestopping provided at each pump room penetration, except exterior wall. Any exposed pump room structural steel (not full height wall pump rooms) shall be treated with min. 1-hr F.R.R. fire spray. Interior door and frames shall be equipped with automatic door closure and rated for min. 45 minutes." },
  { num:"2.12", text:"Confirm if batteries and battery racks are provided." },
  { num:"2.13", text:"Confirm pump engine exhaust is equipped with a muffler to discharge fumes to exterior. The discharge point shall be minimum of 12 ft above any accessible level, and not closer than 5 ft from any building openings." },
  { num:"2.14", text:"The engine exhaust flex connection, exhaust pipe, long elbow and muffler shall be wrapped in high temperature insulation wrap and preferably c/w aluminum jacket within the pump room, regardless the height of the exhaust pipe." },
  { num:"2.15", text:"The exhaust flex connection shall be stainless steel, seamless or welded corrugated (not interlocked), not less than 12\" in length." },
  { num:"2.16", text:"The flex connection shall be mechanically guarded only, and shall not be wrapped." },
  { num:"2.17", text:"After the muffler, the exhaust pipe shall be a stainless-steel pressure chimney that complies with CSA B139. Black steel pipe as exhaust pipe discharge to exterior is commonly done but is not acceptable." },
  { num:"2.18", text:"The chimney outlet shall be minimum of 2 ft above roof line and maintain sufficient clearance to building air intake per OFC." },
  { num:"2.19", text:"Any ductwork, including intake and exhaust ducts, engine exhaust chimney that needs to travel within the building to roof after exiting the ceiling of pump room, shall be wrapped in min. 1-hr F.R.R. fire wrap. This is not required if the chimney discharges directly through the exterior wall of fire pump room." },
  { num:"2.20", text:"Confirm if TSSA certificate \"Fuel Oil Distributor Inspections Above Ground Tanks\" has been provided at the diesel fuel tank. The TSSA certificate shall state which CSA B139 yearly edition is used (2019)." },
  { num:"2.21", text:"Confirm no shut-off valves installed on the fire pump & jockey ½\" pressure sensing lines. The pressure sensing line shall be installed between the fire pump/jockey discharge check valve and control valve. It is not acceptable to install the pressure sensing lines on the upstream side of the discharge check valve." },
  { num:"2.22", text:"If any inverted U shape overhead piping is installed on the upstream side of the fire pump suction outlet, a ½\" automatic air relief valve shall be provided at the top of the suction pipe." },
  { num:"2.23", text:"Confirm min. 10× pipe diameter is provided on the suction side of the fire pump, if the suction pipe is running perpendicular to the fire pump." },
];

const S3 = [
  { num:"3.2", text:"Is the total combined battery start-up duration less than 45 seconds?" },
  { num:"3.3", text:"Confirm combustion air intake louver is powered to close, and opens upon loss of power. Confirm combustion air intake louver opens upon engine running. Open the pump controller door and ask electrician to unplug the air intake louver jumper terminal (connected/stacked to the pump engine running terminal). The air intake louver should open upon disconnect." },
  { num:"3.4", text:"Confirm air exhaust louver is connected to thermal stats and powered to close and loss of power to open. Turn down the thermal stats to activate exhaust louver and reset to original temperature. The air exhaust louver does not have to open upon pump running." },
  { num:"3.5", text:"Upon pump test completion, obtain results from contractor for 3 test points (0%, 100%, 150%) and compare results with manufacturer specifications. The results should meet or exceed the pump specs." },
  { num:"3.6", text:"Confirm fire pump packing is dripping water with or without pump operation. If water is spraying everywhere, ask the contractor to tighten the packing but not too tight. Confirm the packing is installed with a drain discharge to a floor drain. Water drip should be approximately 1 drip per second." },
  { num:"3.7", text:"Constantly touch the pump housing to ensure the fire pump is not overheating during operation. Immediately terminate the pump test if it overheats." },
  { num:"3.8", text:"The automatic pump shut-off setting on the pump controller shall be unchecked (disabled)." },
  { num:"3.9", text:"Confirm the following terminals are connected in the pump controller, and live test to ensure FACP receives minimum three signals: Pump engine running; Pump engine/controller/room trouble (combined via jumper wire); Controller main switch turned to off or manual position." },
];

const S4_items = [
  { num:"4.1", text:"Run the fire pump at churn pressure for at least 1 hour, including all foregoing tests." },
];

const S5_mandatory = [
  { key:"s5_engrun",    num:"5.1", text:"Fire pump engine running — signal received at FACP." },
  { key:"s5_trouble",   num:"5.2", text:"Pump engine/controller/room trouble/overpressure (combined via jumper wires) — signal received at FACP." },
  { key:"s5_mainsw",    num:"5.3", text:"Controller main switch turned to off or manual position (HOA) — signal received at FACP." },
];

const S5 = [
  { key:"s5_lowfuel",   num:"5.4", text:"Low fuel level (below 2/3 level) — measure the brass rod length such that the exposed rod is at least 2/3 of its total length." },
  { key:"s5_tankleak",  num:"5.5", text:"Fuel tank leak — disconnect wiring. Controller bell sounds and FACP receives signal." },
  { key:"s5_failstart", num:"5.6", text:"Fire pump failed to start — controller bell sounds and FACP receives signal." },
  { key:"s5_overpress", num:"5.7", text:"Fire pump overpressure (115% of PLD set pressure) — signal at FACP." },
  { key:"s5_battfail",  num:"5.8", text:"Battery failure or missing batteries (with or without the battery charger being energized). Close the battery power switch or disconnect the wiring for each battery — signal at FACP." },
  { key:"s5_chgfail",   num:"5.9", text:"Battery charger failure — visible indicator only." },
  { key:"s5_ecmsel",    num:"5.10", text:"ECM selector switch in alternate ECM position (if applicable)." },
  { key:"s5_overspeed", num:"5.11", text:"Engine overspeed." },
  { key:"s5_hightemp",  num:"5.12", text:"Engine high temperature." },
  { key:"s5_baddischsensor", num:"5.13", text:"Bad discharge sensor (disconnect PLD connection from engine instrument panel)." },
  { key:"s5_fuelmaint", num:"5.14", text:"Fuel maintenance needed (if automatic fuel maintenance system is provided)." },
  { key:"s5_lowcoolant",num:"5.15", text:"Engine low coolant temperature — signal at FACP." },
  { key:"s5_ecmwarn",   num:"5.16", text:"ECM warning (for engines with ECM control)." },
  { key:"s5_fuelinj",   num:"5.17", text:"Common alarm for fuel injection malfunction (for engines with ECM control)." },
  { key:"s5_lowair",    num:"5.18", text:"Low air or hydraulic pressure — signal at FACP." },
];

// ══════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════
const clState = {};  // { id: { status, comment, photos[], customText } }

// ── Defic response-timeline photo handlers → lib/ui/deficiencies.js (S500) ──



// ══════════════════════════════════════════════
// PHOTO MARKUP SYSTEM
// ══════════════════════════════════════════════
let pmuState = { tool:'pen', color:'#E53935', size:4, alpha:1, drawing:false, startX:0, startY:0, snapshot:null, strokePts:[], undoStack:[], photoRef:null, photoType:null, photoIdx:null, photoSubIdx:null };

function pmuSetTool(t) {
  pmuState.tool = t;
  ['pen','highlight','text','erase'].forEach(tt=>{
    const b = document.getElementById('pmu-btn-'+tt);
    if(b) b.style.background = tt===t ? '#A85959' : '#555';
  });
}

function openPhotoMarkup(id, photoIdx) {
  // For checklist item photos
  const photos = clState[id]?.photos;
  if(!photos||!photos[photoIdx]) return;
  pmuState.photoRef = photos;
  pmuState.photoType = 'checklist';
  pmuState.photoKey = id;
  pmuState.photoIdx = photoIdx;
  _openPmuModal(photos[photoIdx].d);
}

// ── openDeficPhotoMarkup → lib/ui/deficiencies.js (S500) ──

function _openPmuModal(src) {
  const modal = document.getElementById('photo-markup-modal');
  const wrap = document.getElementById('pmu-canvas-wrap');
  const canvas = document.getElementById('pmu-canvas');
  const ctx = canvas.getContext('2d');
  pmuState.undoStack = [];
  // Load image onto canvas at full original size
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    // Scale canvas display to fit in viewport
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 120;
    const scale = Math.min(1, Math.min(maxW/img.naturalWidth, maxH/img.naturalHeight));
    canvas.style.width = Math.round(img.naturalWidth * scale) + 'px';
    canvas.style.height = Math.round(img.naturalHeight * scale) + 'px';
    ctx.drawImage(img, 0, 0);
    modal.classList.add('open');
    pmuInitEvents(canvas, ctx);
  };
  img.src = src;
}

let pmuEventsInit = false;
function pmuInitEvents(canvas, ctx) {
  if(pmuEventsInit) return;
  pmuEventsInit = true;
  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const scX = canvas.width/r.width, scY = canvas.height/r.height;
    const src = e.touches ? e.touches[0] : e;
    return {x:(src.clientX-r.left)*scX, y:(src.clientY-r.top)*scY};
  };
  // Offscreen canvas for highlight
  const hlc = document.createElement('canvas');
  const drawHL = () => {
    const pts = pmuState.strokePts; if(!pts||pts.length<2) return;
    if(pmuState.snapshot) ctx.putImageData(pmuState.snapshot,0,0);
    hlc.width=canvas.width; hlc.height=canvas.height;
    const hx=hlc.getContext('2d');
    hx.clearRect(0,0,hlc.width,hlc.height);
    hx.strokeStyle=pmuState.color; hx.lineWidth=pmuState.size*2; hx.globalAlpha=1; hx.lineCap='round'; hx.lineJoin='round';
    hx.beginPath(); hx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++) hx.lineTo(pts[i].x,pts[i].y);
    hx.stroke();
    ctx.globalAlpha=pmuState.alpha*0.55; ctx.globalCompositeOperation='source-over';
    ctx.drawImage(hlc,0,0);
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  };
  const applyStyle = () => {
    const st=pmuState;
    if(st.tool==='erase'){ctx.globalCompositeOperation='destination-out';ctx.strokeStyle='rgba(0,0,0,1)';ctx.lineWidth=st.size*3;ctx.globalAlpha=1;}
    else{ctx.globalCompositeOperation='source-over';ctx.strokeStyle=st.color;ctx.lineWidth=st.tool==='highlight'?st.size*2:st.size;ctx.globalAlpha=st.alpha;}
    ctx.lineCap='round';ctx.lineJoin='round';
  };
  const start = (e) => {
    e.preventDefault();
    const p=getPos(e); const st=pmuState;
    st.drawing=true;
    pmuState.undoStack.push(ctx.getImageData(0,0,canvas.width,canvas.height));
    if(pmuState.undoStack.length>20) pmuState.undoStack.shift();
    if(st.tool==='text'){
      st.drawing=false;
      _aPrompt('Enter annotation text:','',function(txt){
        if(txt){
          ctx.globalCompositeOperation='source-over';
          ctx.font=`bold ${st.size*4+12}px Arial,sans-serif`;
          ctx.fillStyle=st.color; ctx.globalAlpha=st.alpha;
          ctx.fillText(txt,p.x,p.y);
          ctx.globalAlpha=1;
        }
      });
      return;
    }
    if(st.tool==='highlight'){st.snapshot=ctx.getImageData(0,0,canvas.width,canvas.height);st.strokePts=[{x:p.x,y:p.y}];}
    else{ctx.beginPath();ctx.moveTo(p.x,p.y);}
  };
  const move = (e) => {
    e.preventDefault();
    const st=pmuState; if(!st.drawing) return;
    const p=getPos(e);
    if(st.tool==='highlight'){st.strokePts.push({x:p.x,y:p.y});drawHL();}
    else{applyStyle();ctx.lineTo(p.x,p.y);ctx.stroke();}
  };
  const end = (e) => {
    const st=pmuState;
    if(st.tool==='highlight'&&st.strokePts&&st.strokePts.length>1) drawHL();
    st.drawing=false; st.strokePts=[]; st.snapshot=null;
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  };
  canvas.addEventListener('mousedown',start);
  canvas.addEventListener('mousemove',move);
  canvas.addEventListener('mouseup',end);
  canvas.addEventListener('mouseleave',end);
  canvas.addEventListener('touchstart',start,{passive:false});
  canvas.addEventListener('touchmove',move,{passive:false});
  canvas.addEventListener('touchend',end);
}

function pmuUndo() {
  const canvas=document.getElementById('pmu-canvas');
  const ctx=canvas.getContext('2d');
  if(pmuState.undoStack.length) ctx.putImageData(pmuState.undoStack.pop(),0,0);
}

function pmuSave() {
  const canvas=document.getElementById('pmu-canvas');
  const markedUpDataUrl = canvas.toDataURL('image/jpeg',0.95);
  // Save back to the photo object
  if(pmuState.photoRef && pmuState.photoIdx!=null) {
    pmuState.photoRef[pmuState.photoIdx].d = markedUpDataUrl;
    // Re-render thumbnails
    if(pmuState.photoType==='checklist') {
      const pg=document.getElementById('pg-'+pmuState.photoKey);
      if(pg) pg.innerHTML=renderThumbs(pmuState.photoKey);
    } else if(pmuState.photoType==='deficiency') {
      renderDeficThumbs(pmuState.photoKey, pmuState.photoItemIdx);
    }
  }
  pmuClose();
  showToast('✓ Photo markup saved');
  debounceAutosave();
}

function pmuClose() {
  document.getElementById('photo-markup-modal').classList.remove('open');
  pmuEventsInit = false; // allow re-init next time
  const canvas=document.getElementById('pmu-canvas');
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

// ── renderDeficThumbs → lib/ui/deficiencies.js (S500) ──

function showToast(msg, duration=2500) {
  /* S497: delegates to lib/shared/toast.js — one toast implementation across the
     toolkit (the S490d reconciled version with FRT's field-tuned motion). The
     name is load-bearing: lib/ui/lightbox.js calls showToast(msg) by name (host
     contract, protected_symbols.txt). Behaviour note: rapid successive toasts
     now stack briefly instead of replacing one element — this is the shared
     canon FRT already runs. Fail-safe: engine absent -> console, never thrown. */
  var t=window.ArenconToast;
  if(t){ t(msg, duration); return; }
  try{ console.log('[Diesel toast]', msg); }catch(_){ }
}
const pumpCurvePoints = [{ flow:'', psi:'' }];
// Independent pump curve points for 4b tab
const pldPumpCurvePoints = [{ flow:'', psi:'' }];

// ═══ S461: CHECKLIST ENGINE — shared module lib/ui/checklist.js ═══
// The whole S205/S367 checklist family (cid, schema migration, item walk,
// renderChecklist/buildItem, setStatus, detail toggle, thumbs) now lives in
// the shared module — fixed once, inherited by Diesel + Electric. This block
// binds the module to Diesel's existing global names so every caller and
// every inline on* attribute keeps working unchanged. State (clState,
// customItems, deletedItems) stays Diesel-owned, declared below as always.
var _CLENG = window.ArcChecklist.create({
  schemaVer: 2,
  // v1 → v2 (S367): ONLY the S5 array (prefix "s5_", never s5m_) changed —
  // removed old idx 7 (Accident register); inserted 3 new items at 7,8,9; so
  // old 8→10, 9→11, 10→12, 11→13, 12→14; idx 0–6 unchanged; 7 dropped.
  migrations: { 2: { re: /^s5_(\d+)$/, prefix: 's5_',
                     map: {0:0,1:1,2:2,3:3,4:4,5:5,6:6,8:10,9:11,10:12,11:13,12:14} } },
  sectionItems: function(sec){
    return {
      s1:(typeof S1!=='undefined'?S1:[]), s2:(typeof S2!=='undefined'?S2:[]),
      s3:(typeof S3!=='undefined'?S3:[]), s4:(typeof S4_items!=='undefined'?S4_items:[]),
      s4pld:(typeof S4_items!=='undefined'?S4_items:[]), s5:(typeof S5!=='undefined'?S5:[]),
      s5m:(typeof S5_mandatory!=='undefined'?S5_mandatory:[])
    }[sec];
  }
});
const CL_SCHEMA_VER = _CLENG.schemaVer;
function cid(section, idx) { return _CLENG.cid(section, idx); }
function _migrateClState(loaded, savedVer){ return _CLENG.migrate(loaded, savedVer); }

// ══════════════════════════════════════════════════
// RENDER CHECKLISTS
// ══════════════════════════════════════════════════
// Custom items added by user per section
const customItems = {}; // { section: [ {num,text,ref} ] }


var deletedItems = {}; // { section: Set of deleted built-in indices }

function renderChecklist(items, containerId, section) { return _CLENG.renderChecklist(items, containerId, section); }
function buildItem(id, item, section, idx, isCustom) { return _CLENG.buildItem(id, item, section, idx, isCustom); }
function toggleItemDetail(id){ return _CLENG.toggleItemDetail(id); }
function refreshItemPhotoUI(id){ return _CLENG.refreshItemPhotoUI(id); }

// ═══ S282 B8: DieselMarkup — non-destructive vector markup engine ═══
// Port of FRT's MarkupEngine, extended for Diesel's toolbar (square, triangle,
// per-stroke opacity, explicit font size). REPLACES the destructive bitmap
// markup (saveLbMarkup baked strokes into p.d with no original backup / no
// revert / no cloud copy). Strokes are stored as VECTORS on the photo
// (p.mk = {w,h,o:[...]}), coords in natural-image pixels, so the original
// binary (p.d / R2 original) is never touched and markup is fully reversible.
// Locked rules honoured: lineTo only (no quadraticCurveTo); no OffscreenCanvas
// (iPad/Safari); highlighter via per-stroke offscreen composite (no opacity
// stacking); tool stays active after a shape (no auto-select).
var DieselMarkup = (function(){
  'use strict';
  var E = {
    canvas:null, ctx:null, img:null,
    nw:0, nh:0,                       // natural pixel size (canvas backing store)
    strokes:[], redo:[],
    // S296: op-log undo/redo (add/del/mod/clear all undoable, LIFO-exact) + selection state
    ops:[], redoOps:[],
    selection:null, _selMode:null, _selStart:null, _selOrig:null, _selCenter:null, _selHandles:null,   // S296 single-select — INERT since S314
    selIds:[], _dragState:null, _rubberBand:null, _selDrag:false,   // S314 group selection (FRT port)
    // S344 Phase 2a — FRT S339 select sub-tool model. 'rubber' = Diesel's existing
    // tap-one-or-drag-box group select (default). 'tap' = two-phase: tap marks to
    // pick (toggle), then ✓ to collapse picks into one selection. Selection is sticky
    // in both modes; only ✗ (cancelSelect) or switching tools clears it.
    _selectSub:'rubber', _pickIds:[], _onSelChange:null, _grouped:false, _groupActiveId:null,
    // S344 Phase 2d: on-photo text box state (FRT port). Sticky colours persist across
    // boxes; the lightbox docked text bar drives the live controller via _onTextStart/End.
    _lastTextColor:null, _lastTextBg:'none', _textController:null, _textInput:null, _repositionTextBox:null,
    _onTextStart:null, _onTextEnd:null,
    _SIZE_STEPS:[12,14,16,20,24,28,32,40,48],
    _PALETTE:['#A85959','#E74C3C','#FF9800','#F1C40F','#2196F3','#1565C0','#4CAF50','#9C27B0','#1C2333','#607D8B','#FFFFFF'],
    _drawing:false, _curr:null,
    _styleFn:null, _onDirty:null, _bound:null,

    attach:function(canvasEl, imgEl, existingMk, styleFn, onDirty){
      this.detach();
      this.canvas = canvasEl; this.img = imgEl;
      this._styleFn = styleFn || function(){return {tool:'pen',color:'#FF0000',size:6,alpha:1,fontSize:24};};
      this._onDirty = onDirty || null;
      this.nw = imgEl.naturalWidth || imgEl.offsetWidth || 1;
      this.nh = imgEl.naturalHeight || imgEl.offsetHeight || 1;
      canvasEl.width = this.nw; canvasEl.height = this.nh;
      canvasEl.style.width = imgEl.offsetWidth + 'px';
      canvasEl.style.height = imgEl.offsetHeight + 'px';
      this.ctx = canvasEl.getContext('2d');
      this.strokes = []; this.redo = [];
      this.ops = []; this.redoOps = []; this.selection = null; this._selMode = null; this._selHandles = null;
      this.selIds = []; this._dragState = null; this._rubberBand = null; this._selDrag = false; this._pickIds=[]; this._grouped=false; this._selectSub=this._selectSub||"rubber";   // S314 + S344
      // Load existing markup (rescale if it was authored at a different natural size)
      if(existingMk && Array.isArray(existingMk.o)){
        var sx = (existingMk.w ? this.nw/existingMk.w : 1);
        var sy = (existingMk.h ? this.nh/existingMk.h : 1);
        this.strokes = existingMk.o.map(function(s){
          var c = JSON.parse(JSON.stringify(s));
          if(c.pts) c.pts = c.pts.map(function(p){return {x:p.x*sx, y:p.y*sy};});
          if(c.size) c.size = c.size*((sx+sy)/2);
          if(c.fontSize) c.fontSize = c.fontSize*((sx+sy)/2);
          if(c.eraserMask) c.eraserMask = c.eraserMask.map(function(m){   // S459: masks rescale with the geometry
            return { points:(m.points||[]).map(function(p){return {x:p.x*sx, y:p.y*sy};}),
                     size:(m.size||2)*((sx+sy)/2) };
          });
          return c;
        });
      }
      this._ensureIds();   // S314: legacy saved strokes get ids lazily
      this._bind();
      this.render();
    },

    detach:function(){
      if(this._bound && this.canvas){
        var c=this.canvas, b=this._bound;
        c.removeEventListener('mousedown', b.down); c.removeEventListener('mousemove', b.move);
        window.removeEventListener('mouseup', b.up);
        c.removeEventListener('touchstart', b.ts); c.removeEventListener('touchmove', b.tm);
        window.removeEventListener('touchend', b.te);
      }
      this._bound=null; this.canvas=null; this.ctx=null; this.img=null;
      this.strokes=[]; this.redo=[]; this._drawing=false; this._curr=null;
      this.ops=[]; this.redoOps=[]; this.selection=null; this._selMode=null; this._selHandles=null;
      this.selIds=[]; this._dragState=null; this._rubberBand=null; this._selDrag=false; this._pickIds=[]; this._grouped=false;   // S314 + S344
    },

    _pt:function(ev){
      var r=this.canvas.getBoundingClientRect();
      var sx=this.nw/r.width, sy=this.nh/r.height;
      var t=ev.touches?ev.touches[0]:ev;
      return {x:(t.clientX-r.left)*sx, y:(t.clientY-r.top)*sy};
    },

    _isShape:function(t){return t==='line'||t==='arrow'||t==='circle'||t==='square'||t==='triangle'||t==='square-fill'||t==='circle-fill'||t==='cloud';},

    _bind:function(){
      var self=this, c=this.canvas;
      function down(ev){
        ev.preventDefault();
        // S344 Phase 4 (FRT parity): if a text box is already open, swallow ALL canvas
        // presses — tapping empty space must not drop a second box or discard the open one.
        if(self._textInput){ return; }
        var st=self._styleFn(); var p=self._pt(ev);
        if(!st.tool) return;   // S295: no active tool (ESC-deactivated) — clicks draw nothing
        if(st.tool==='select'){ if(!self._selDown) return; self._drawing=true; self._selDrag=true; self._selDown(p, ev); return; }   // S314 group select (shared module, S459g)
        if(self.hasSel()) self.deselect();   // S314: drawing with any other tool drops the selection
        if(st.tool==='text'){
          // S344 Phase 4 (FRT parity): tapping an existing text mark re-opens it for editing
          // (editId) instead of dropping a new box on top.
          if(!self._promptText || !self._hitTextAt) return;   // shared modules missing (S459h guard)
          var hitText=self._hitTextAt(p);
          if(hitText){ self._promptText(p, st, hitText); return; }
          self._promptText(p, st); return;
        }
        if(st.tool==='erase'){
          // S459 eraser rewrite (drawing-viewer parity via lib/ui/markupEraser.js):
          // nothing is deleted during the drag — a grey drag path shows live; the
          // erase (pen split / mask carve) applies once at pointer-up. If the shared
          // module failed to load, fall back to the legacy per-move whole-delete.
          if(window.MarkupEraser){
            self._drawing=true;
            // VIEWER-EXACT (S459c): eraser width = (size)×3 in STROKE units (natural px,
            // the same units stroke sizes are stored in) — the drawing viewer's exact
            // formula, giving a fixed 3:1 eraser-to-stroke ratio at any zoom/resolution.
            // Do NOT make this screen-constant (×uiScale): that made the eraser k× fatter
            // relative to the strokes on hi-res photos and wiped chunks (S459b field report).
            self._curr={tool:'erase', pts:[p], size:(st.size||2), _ew:(st.size||2)*3};
            return;
          }
          self._drawing=true; self._eraseAtLegacy(p); return;
        }
        self._drawing=true; self.redo=[];
        self._curr={id:self._uid(), tool:st.tool, color:st.color, size:st.size, alpha:st.alpha,
                    pts: self._isShape(st.tool) ? [p,{x:p.x,y:p.y}] : [p]};   // S314: id at creation
      }
      function move(ev){
        if(!self._drawing) return;
        ev.preventDefault();
        var p=self._pt(ev);
        var st=self._styleFn();
        if(st.tool==='select'){ if(self._selMove) self._selMove(p); return; }   // S314 (shared module)
        if(st.tool==='erase'){
          if(!(window.MarkupEraser&&self._curr&&self._curr.tool==='erase')){ self._eraseAtLegacy(p); return; }
          // live drag path: append + render (grey preview drawn by _drawStroke)
        }
        if(!self._curr) return;
        if(self._isShape(self._curr.tool)){ self._curr.pts[1]=p; self.render(); return; }
        var last=self._curr.pts[self._curr.pts.length-1];
        if(Math.abs(p.x-last.x)+Math.abs(p.y-last.y) < 1) return;
        self._curr.pts.push(p); self.render();
      }
      function up(){
        if(!self._drawing) return;
        self._drawing=false;
        if(self._selDrag){ self._selDrag=false; if(self._selUp) self._selUp(); return; }   // S314 (shared module)
        if(self._curr){
          if(self._curr.tool==='erase'){
            // S459: commit the erase (viewer parity). Pen → split; highlight/shapes/
            // text → eraserMask carve. No-op guard: empty-space erase pushes nothing.
            var eps=self._curr.pts, ew=self._curr._ew||((self._curr.size||2)*3);
            self._curr=null;
            if(window.MarkupEraser && eps.length>1){
              var _before=JSON.stringify(self.strokes);
              var res=window.MarkupEraser.applyEraser(self.strokes, eps, ew, {
                toCanonical:(window.MarkupTools&&window.MarkupTools.toCanonical)||null,
                halfWidth:function(s){ return ((s.size||6)*3)/2; },   // Diesel highlight renders at size×3
                bbox:function(s){ return self._strokeBBox(s); },      // unrotated/local-frame bbox
                center:function(s){ return self._strokeCenter(s); },
                newId:function(){ return self._uid(); }
              });
              if(res.changed){
                self.strokes=res.strokes;
                self._pushOp({t:'erase', before:_before, after:JSON.stringify(self.strokes)});
                // drop selection/picks of anything the split removed
                var _alive={}; self.strokes.forEach(function(s){ _alive[s.id]=true; });
                self.selIds=self.selIds.filter(function(id){ return _alive[id]; });
                if(self._pickIds) self._pickIds=self._pickIds.filter(function(id){ return _alive[id]; });
                if(self._onDirty) self._onDirty();
              }
            }
            self.render(); return;
          }
          var ok;
          if(self._isShape(self._curr.tool)){
            var a=self._curr.pts[0], b=self._curr.pts[1];
            ok=(Math.abs(a.x-b.x)+Math.abs(a.y-b.y))>4;
          } else ok=self._curr.pts.length>1;
          if(ok){ self.strokes.push(self._curr); self._pushOp({t:'add'}); if(self._onDirty) self._onDirty(); }
        }
        self._curr=null; self.render();
      }
      function ts(ev){ down(ev); }
      function tm(ev){ move(ev); }
      function te(){ up(); }
      c.addEventListener('mousedown', down); c.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      c.addEventListener('touchstart', ts, {passive:false});
      c.addEventListener('touchmove', tm, {passive:false});
      window.addEventListener('touchend', te);
      this._bound={down:down, move:move, up:up, ts:ts, tm:tm, te:te};
    },

    // ── S296: op-log undo core ──
    _pushOp:function(op){ this.ops.push(op); if(this.ops.length>60) this.ops.shift(); this.redoOps=[]; },

    // ── S296: stroke geometry (unrotated bbox in natural coords; s.rot applied at render/hit) ──
    _strokeBBox:function(s){
      var pad=(s.size||6)/2 + (s.tool==='highlight'?(s.size||6):0);
      if(s.tool==='text'){
        var fp=s.fontSize||24, lines=String(s.text||'').split('\n');
        var maxLen=0; for(var i=0;i<lines.length;i++){ if(lines[i].length>maxLen) maxLen=lines[i].length; }
        var w=Math.max(10, maxLen*fp*0.55), lineH=fp*1.25, h=lineH*lines.length;
        return {x1:s.pts[0].x-4, y1:s.pts[0].y-fp, x2:s.pts[0].x+w+4, y2:s.pts[0].y-fp+h+fp*0.25};
      }
      var x1=1e15,y1=1e15,x2=-1e15,y2=-1e15;
      (s.pts||[]).forEach(function(q){ if(q.x<x1)x1=q.x; if(q.y<y1)y1=q.y; if(q.x>x2)x2=q.x; if(q.y>y2)y2=q.y; });
      if(x1>x2) return {x1:0,y1:0,x2:0,y2:0};
      return {x1:x1-pad, y1:y1-pad, x2:x2+pad, y2:y2+pad};
    },
    _strokeCenter:function(s){ var b=this._strokeBBox(s); return {x:(b.x1+b.x2)/2, y:(b.y1+b.y2)/2}; },
    _rotPt:function(q,c,a){ var dx=q.x-c.x, dy=q.y-c.y, ca=Math.cos(a), sa=Math.sin(a);
      return {x:c.x+dx*ca-dy*sa, y:c.y+dx*sa+dy*ca}; },

    // ── SELECTION ENGINE: extracted VERBATIM to lib/ui/markupSelection.js (S459g) ──
    // The S314 group API + S344 two-SET pick/group model + S459e/f chrome now install
    // from the shared module (window.MarkupSelection.install below the object). One
    // fix lands everywhere. Host surface it consumes: strokes/canvas/ctx/nw/render/
    // _findStroke/_strokeBBox/_strokeCenter/_rotPt/_uid/_pushOp (+ MarkupEraser for
    // mask-follow). Do NOT re-add selection methods here.

    // ── TEXT ENGINE: _promptText extracted VERBATIM to lib/ui/markupText.js (S459h) ──
    // The S344 Phase 2d/4 on-photo editor + docked-bar controller installs from the
    // shared module (window.MarkupText.install below the object). Paint delegates to
    // MarkupText.drawText with the local branch as fallback. Do NOT re-add it here.

    // S459: LEGACY whole-delete eraser — kept ONLY as the fallback when
    // lib/ui/markupEraser.js failed to load. The live path is the shared
    // MarkupEraser (drag path shown live; pen split / mask carve at commit).
    _eraseAtLegacy:function(p){
      var R=24, R2=R*R;
      function d2(px,py,ax,ay,bx,by){
        var dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
        if(l2===0){var ex=px-ax,ey=py-ay;return ex*ex+ey*ey;}
        var t=((px-ax)*dx+(py-ay)*dy)/l2; t=Math.max(0,Math.min(1,t));
        var qx=ax+t*dx,qy=ay+t*dy,fx=px-qx,fy=py-qy; return fx*fx+fy*fy;
      }
      var hit=-1;
      for(var i=this.strokes.length-1;i>=0;i--){
        var s=this.strokes[i], t=s.tool;
        if(t==='pen'||t==='highlight'){
          for(var j=0;j<s.pts.length-1;j++){ if(d2(p.x,p.y,s.pts[j].x,s.pts[j].y,s.pts[j+1].x,s.pts[j+1].y)<=R2){hit=i;break;} }
        } else if(t==='line'||t==='arrow'){
          if(d2(p.x,p.y,s.pts[0].x,s.pts[0].y,s.pts[1].x,s.pts[1].y)<=R2) hit=i;
        } else if(t==='square'){
          var x1=Math.min(s.pts[0].x,s.pts[1].x),y1=Math.min(s.pts[0].y,s.pts[1].y),
              x2=Math.max(s.pts[0].x,s.pts[1].x),y2=Math.max(s.pts[0].y,s.pts[1].y);
          if(d2(p.x,p.y,x1,y1,x2,y1)<=R2||d2(p.x,p.y,x2,y1,x2,y2)<=R2||
             d2(p.x,p.y,x2,y2,x1,y2)<=R2||d2(p.x,p.y,x1,y2,x1,y1)<=R2) hit=i;
        } else if(t==='triangle'){
          var ax=(s.pts[0].x+s.pts[1].x)/2, ay=s.pts[0].y, bx=s.pts[0].x, by=s.pts[1].y, cx2=s.pts[1].x, cy2=s.pts[1].y;
          if(d2(p.x,p.y,ax,ay,bx,by)<=R2||d2(p.x,p.y,bx,by,cx2,cy2)<=R2||d2(p.x,p.y,cx2,cy2,ax,ay)<=R2) hit=i;
        } else if(t==='circle'){
          var cx=(s.pts[0].x+s.pts[1].x)/2, cy=(s.pts[0].y+s.pts[1].y)/2,
              rx=Math.abs(s.pts[1].x-s.pts[0].x)/2, ry=Math.abs(s.pts[1].y-s.pts[0].y)/2;
          if(rx>0&&ry>0){ var nx=(p.x-cx)/rx,ny=(p.y-cy)/ry; if(Math.abs(Math.sqrt(nx*nx+ny*ny)-1)*Math.min(rx,ry)<=R) hit=i; }
        } else if(t==='text'){
          var tp=s.pts[0], fp=s.fontSize||24, w=(s.text||'').length*fp*0.55;
          if(p.x>=tp.x-6&&p.x<=tp.x+w+6&&p.y>=tp.y-fp-2&&p.y<=tp.y+6) hit=i;
        }
        if(hit>=0) break;
      }
      if(hit>=0){ var _er=this.strokes.splice(hit,1)[0]; this._pushOp({t:'del', idx:hit, stroke:_er}); if(this._onDirty) this._onDirty(); this.render(); }
    },

    // Draw one stroke onto ctx at given scale (sx,sy from natural -> target px)
    _drawStroke:function(ctx, s, sx, sy){
      // S459 eraser (viewer parity): live drag path — grey preview, never persisted
      if(s.tool==='erase'){
        sx=sx||1; sy=sy||1;
        if(!s.pts||s.pts.length<2) return;
        ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.strokeStyle=(window.MarkupEraser&&window.MarkupEraser.PREVIEW.color)||'#8a94b0';
        ctx.globalAlpha=0.85;
        ctx.lineWidth=(s._ew||((s.size||2)*3))*((sx+sy)/2);
        ctx.beginPath(); ctx.moveTo(s.pts[0].x*sx,s.pts[0].y*sy);
        for(var ei=1;ei<s.pts.length;ei++) ctx.lineTo(s.pts[ei].x*sx,s.pts[ei].y*sy);
        ctx.stroke(); ctx.restore(); return;
      }
      // S459: strokes carrying an eraserMask render via a per-object offscreen so
      // destination-out carves ONLY this stroke's pixels (never the photo or the
      // strokes beneath) — the viewer's _drawObjectMasked pattern. Highlights carve
      // on their scratch inside _drawHighlightLayer instead (S459d no-stack model).
      if(s.eraserMask && s.eraserMask.length && s.tool!=='highlight'){
        this._drawStrokeMasked(ctx, s, sx||1, sy||1); return;
      }
      this._drawStrokeRaw(ctx, s, sx, sy);
    },
    // S459: offscreen carve — draw the stroke raw, punch each mask path out
    // (destination-out) inside the SAME rotation frame the stroke rendered in
    // (masks are stored local-frame so they follow move/resize/rotate), composite.
    _drawStrokeMasked:function(ctx, s, sx, sy){
      var off=this._maskCanvas||(this._maskCanvas=document.createElement('canvas'));
      if(off.width!==ctx.canvas.width||off.height!==ctx.canvas.height){ off.width=ctx.canvas.width; off.height=ctx.canvas.height; }
      var oc=off.getContext('2d');
      oc.setTransform(1,0,0,1,0,0); oc.clearRect(0,0,off.width,off.height);
      this._drawStrokeRaw(oc, s, sx, sy);   // raw path — cannot re-route to masked
      oc.save();
      if(s.rot){ var rc=this._strokeCenter(s); oc.translate(rc.x*sx,rc.y*sy); oc.rotate(s.rot); oc.translate(-rc.x*sx,-rc.y*sy); }
      oc.globalCompositeOperation='destination-out';
      oc.lineCap='round'; oc.lineJoin='round'; oc.globalAlpha=1;
      for(var mi=0;mi<s.eraserMask.length;mi++){
        var m=s.eraserMask[mi];
        if(!m.points||m.points.length<2) continue;
        oc.lineWidth=(m.size||2)*((sx+sy)/2);
        oc.beginPath(); oc.moveTo(m.points[0].x*sx,m.points[0].y*sy);
        for(var mj=1;mj<m.points.length;mj++) oc.lineTo(m.points[mj].x*sx,m.points[mj].y*sy);
        oc.stroke();
      }
      oc.restore();
      ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(off,0,0); ctx.restore();
    },
    _drawStrokeRaw:function(ctx, s, sx, sy){
      sx=sx||1; sy=sy||1;
      ctx.save();
      if(s.rot){ var rc=this._strokeCenter(s); ctx.translate(rc.x*sx,rc.y*sy); ctx.rotate(s.rot); ctx.translate(-rc.x*sx,-rc.y*sy); }   // S296
      ctx.lineCap='round'; ctx.lineJoin='round';
      ctx.globalAlpha = (s.alpha==null?1:s.alpha);
      ctx.strokeStyle=s.color; ctx.fillStyle=s.color; ctx.lineWidth=(s.size||6)*((sx+sy)/2);
      // S459: shared shape geometry (lib/ui/markupTools.js) is the single source of
      // truth for square/circle/triangle/line (+ their fills). Names normalize via
      // aliases inside drawShape (square->rect, square-fill->rect-fill). ARROW stays
      // Diesel-local (filled arrowhead differs) and CLOUD stays Diesel-local (S344
      // rect-scallop, A3); pen/highlight/text are not shapes. Guarded: if MarkupTools
      // is absent (offline first-load) the local branches below run — markup can't break.
      // drawShape is pure and uses the ctx state already set above (stroke/fill/lineWidth/
      // alpha/rotation); _drawStroke opened a ctx.save(), so restore before the return.
      if(window.MarkupTools && s.tool!=='cloud' && s.tool!=='arrow' && s.tool!=='pen' && s.tool!=='highlight' && s.tool!=='text'){
        var _ms1=s.pts[0], _ms2=s.pts[1]||s.pts[0];
        if(window.MarkupTools.drawShape(ctx, s.tool, _ms1.x*sx, _ms1.y*sy, _ms2.x*sx, _ms2.y*sy)){ ctx.restore(); return; }
      }
      if(s.tool==='pen'){
        if(s.pts.length>=2){ ctx.beginPath(); ctx.moveTo(s.pts[0].x*sx,s.pts[0].y*sy);
          for(var i=1;i<s.pts.length;i++) ctx.lineTo(s.pts[i].x*sx,s.pts[i].y*sy); ctx.stroke(); }
      } else if(s.tool==='line'){
        ctx.beginPath(); ctx.moveTo(s.pts[0].x*sx,s.pts[0].y*sy); ctx.lineTo(s.pts[1].x*sx,s.pts[1].y*sy); ctx.stroke();
      } else if(s.tool==='arrow'){
        var x1=s.pts[0].x*sx,y1=s.pts[0].y*sy,x2=s.pts[1].x*sx,y2=s.pts[1].y*sy;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        var ang=Math.atan2(y2-y1,x2-x1), hd=Math.max(10,(s.size||6)*2)*((sx+sy)/2);
        ctx.beginPath(); ctx.moveTo(x2,y2);
        ctx.lineTo(x2-hd*Math.cos(ang-0.4), y2-hd*Math.sin(ang-0.4));
        ctx.lineTo(x2-hd*Math.cos(ang+0.4), y2-hd*Math.sin(ang+0.4));
        ctx.closePath(); ctx.fill();
      } else if(s.tool==='square'){
        var qx=Math.min(s.pts[0].x,s.pts[1].x)*sx, qy=Math.min(s.pts[0].y,s.pts[1].y)*sy;
        ctx.strokeRect(qx, qy, Math.abs(s.pts[1].x-s.pts[0].x)*sx, Math.abs(s.pts[1].y-s.pts[0].y)*sy);
      } else if(s.tool==='square-fill'){
        var fqx=Math.min(s.pts[0].x,s.pts[1].x)*sx, fqy=Math.min(s.pts[0].y,s.pts[1].y)*sy;
        ctx.fillRect(fqx, fqy, Math.abs(s.pts[1].x-s.pts[0].x)*sx, Math.abs(s.pts[1].y-s.pts[0].y)*sy);
      } else if(s.tool==='circle'){
        var ccx=(s.pts[0].x+s.pts[1].x)/2*sx, ccy=(s.pts[0].y+s.pts[1].y)/2*sy,
            crx=Math.abs(s.pts[1].x-s.pts[0].x)/2*sx||1, cry=Math.abs(s.pts[1].y-s.pts[0].y)/2*sy||1;
        ctx.beginPath();
        if(ctx.ellipse) ctx.ellipse(ccx,ccy,crx,cry,0,0,Math.PI*2); else ctx.arc(ccx,ccy,Math.max(crx,cry),0,Math.PI*2);
        ctx.stroke();
      } else if(s.tool==='circle-fill'){
        var fcx=(s.pts[0].x+s.pts[1].x)/2*sx, fcy=(s.pts[0].y+s.pts[1].y)/2*sy,
            frx=Math.abs(s.pts[1].x-s.pts[0].x)/2*sx||1, fry=Math.abs(s.pts[1].y-s.pts[0].y)/2*sy||1;
        ctx.beginPath();
        if(ctx.ellipse) ctx.ellipse(fcx,fcy,frx,fry,0,0,Math.PI*2); else ctx.arc(fcx,fcy,Math.max(frx,fry),0,Math.PI*2);
        ctx.fill();
      } else if(s.tool==='triangle'){
        var tx1=s.pts[0].x*sx,ty1=s.pts[0].y*sy,tx2=s.pts[1].x*sx,ty2=s.pts[1].y*sy;
        ctx.beginPath(); ctx.moveTo((tx1+tx2)/2,ty1); ctx.lineTo(tx1,ty2); ctx.lineTo(tx2,ty2); ctx.closePath(); ctx.stroke();
      } else if(s.tool==='cloud'){
        // S344 Phase 2b: revision-cloud — scalloped arcs around the drag bbox (FRT parity).
        var clx1=Math.min(s.pts[0].x,s.pts[1].x)*sx, cly1=Math.min(s.pts[0].y,s.pts[1].y)*sy,
            clx2=Math.max(s.pts[0].x,s.pts[1].x)*sx, cly2=Math.max(s.pts[0].y,s.pts[1].y)*sy;
        var cw=clx2-clx1, ch=cly2-cly1; if(cw<4||ch<4){ /* too small */ }
        var bump=Math.max(8,(s.size||6)*2.2)*((sx+sy)/2);
        var per=2*(cw+ch); var n=Math.max(8,Math.round(per/(bump*1.6))); var r=bump/2;
        ctx.beginPath();
        var pts=[]; var i2;
        // build perimeter points clockwise
        var nTop=Math.max(2,Math.round(cw/(bump*1.6))), nRt=Math.max(2,Math.round(ch/(bump*1.6)));
        for(i2=0;i2<nTop;i2++) pts.push({x:clx1+cw*(i2/nTop), y:cly1});
        for(i2=0;i2<nRt;i2++) pts.push({x:clx2, y:cly1+ch*(i2/nRt)});
        for(i2=0;i2<nTop;i2++) pts.push({x:clx2-cw*(i2/nTop), y:cly2});
        for(i2=0;i2<nRt;i2++) pts.push({x:clx1, y:cly2-ch*(i2/nRt)});
        for(i2=0;i2<pts.length;i2++){
          var a0=Math.atan2(pts[i2].y-((cly1+cly2)/2), pts[i2].x-((clx1+clx2)/2));
          ctx.moveTo(pts[i2].x+r, pts[i2].y);
          ctx.arc(pts[i2].x, pts[i2].y, r, 0, Math.PI*2);
        }
        ctx.stroke();
      } else if(s.tool==='text'){
        // S459h: shared paint (single source of truth incl. the S459f no-halo rule).
        // Local body below runs only if lib/ui/markupText.js failed to load.
        if(window.MarkupText && window.MarkupText.drawText(ctx, s, sx, sy)){ ctx.restore(); return; }
        if(s._editing){ /* the on-photo box is showing; don't double-draw */ }
        else {
          var fp=(s.fontSize||24)*((sx+sy)/2);
          ctx.font='bold '+fp+'px Calibri,Arial,sans-serif'; ctx.textBaseline='alphabetic';
          var lines=String(s.text||'').split('\n');
          var lineH=fp*1.25, tx=s.pts[0].x*sx, ty=s.pts[0].y*sy;
          // optional background pill behind the whole block
          if(s.bg && s.bg!=='none'){
            var maxw=0; for(var li=0;li<lines.length;li++){ var w=ctx.measureText(lines[li]).width; if(w>maxw)maxw=w; }
            var padX=fp*0.25, padY=fp*0.18;
            var blkH=lineH*lines.length;
            ctx.save(); ctx.globalAlpha=(s.alpha==null?1:s.alpha);
            ctx.fillStyle=s.bg;
            ctx.fillRect(tx-padX, ty-fp-padY, maxw+padX*2, blkH+padY*2);
            ctx.restore();
          }
          // S459f (Mark): NO dark halo/outline on text — it muddied the glyphs and made
          // them hard to read. Plain fill only; the optional bg pill remains available.
          for(var ln=0;ln<lines.length;ln++){
            var yy=ty+ln*lineH;
            ctx.fillStyle=s.color; ctx.fillText(lines[ln], tx, yy);
          }
        }
      }
      ctx.restore();
    },

    // S459d — VIEWER-EXACT highlight layer model (no-stack, cross-stroke):
    // per stroke: opaque spine + own mask carved on a SCRATCH canvas (isolated);
    // accumulate scratches onto ONE shared layer at full alpha (opaque overlap
    // stays flat — overlapping highlights never darken); composite the layer
    // ONCE per alpha group at that alpha. Replaces the old per-stroke 0.35
    // composite, which stacked across strokes (S459c field report).
    _drawHighlightLayer:function(ctx, hls, sx, sy){
      var self=this;
      var layer=this._hlLayer||(this._hlLayer=document.createElement('canvas'));
      var scr=this._hlScratch||(this._hlScratch=document.createElement('canvas'));
      if(layer.width!==ctx.canvas.width||layer.height!==ctx.canvas.height){ layer.width=ctx.canvas.width; layer.height=ctx.canvas.height; }
      if(scr.width!==ctx.canvas.width||scr.height!==ctx.canvas.height){ scr.width=ctx.canvas.width; scr.height=ctx.canvas.height; }
      var lx=layer.getContext('2d'), sc=scr.getContext('2d');
      // group by effective alpha (viewer opGroups)
      var groups={};
      hls.forEach(function(s){
        var a=(s.alpha==null?0.35:s.alpha), k=Math.round(a*100);
        if(!groups[k]) groups[k]={alpha:a, objs:[]};
        groups[k].objs.push(s);
      });
      Object.keys(groups).forEach(function(gk){
        var grp=groups[gk];
        lx.setTransform(1,0,0,1,0,0); lx.clearRect(0,0,layer.width,layer.height);
        grp.objs.forEach(function(s){
          if(!s.pts||s.pts.length<2) return;
          sc.setTransform(1,0,0,1,0,0); sc.clearRect(0,0,scr.width,scr.height);
          sc.save();
          if(s.rot){ var rc=self._strokeCenter(s); sc.translate(rc.x*sx,rc.y*sy); sc.rotate(s.rot); sc.translate(-rc.x*sx,-rc.y*sy); }   // S296
          sc.lineCap='round'; sc.lineJoin='round';
          sc.strokeStyle=s.color; sc.lineWidth=(s.size||6)*3*((sx+sy)/2); sc.globalAlpha=1;
          sc.beginPath(); sc.moveTo(s.pts[0].x*sx,s.pts[0].y*sy);
          for(var i=1;i<s.pts.length;i++) sc.lineTo(s.pts[i].x*sx,s.pts[i].y*sy);
          sc.stroke();
          if(s.eraserMask && s.eraserMask.length){   // carve this highlight's own mask on its scratch
            sc.globalCompositeOperation='destination-out';
            for(var mi=0;mi<s.eraserMask.length;mi++){
              var m=s.eraserMask[mi];
              if(!m.points||m.points.length<2) continue;
              sc.lineWidth=(m.size||2)*((sx+sy)/2);
              sc.beginPath(); sc.moveTo(m.points[0].x*sx,m.points[0].y*sy);
              for(var mj=1;mj<m.points.length;mj++) sc.lineTo(m.points[mj].x*sx,m.points[mj].y*sy);
              sc.stroke();
            }
          }
          sc.restore();
          lx.globalAlpha=1; lx.globalCompositeOperation='source-over';
          lx.drawImage(scr,0,0);
        });
        ctx.save(); ctx.setTransform(1,0,0,1,0,0);
        ctx.globalAlpha=grp.alpha; ctx.globalCompositeOperation='source-over';
        ctx.drawImage(layer,0,0); ctx.restore();
      });
    },

    _renderTo:function(ctx, sx, sy){
      var self=this;
      var all = this.strokes.concat(this._curr?[this._curr]:[]);
      // Pass 1: highlights (under) — shared-layer no-stack model (S459d)
      var hls = all.filter(function(s){ return s.tool==='highlight'; });
      if(hls.length) this._drawHighlightLayer(ctx, hls, sx||1, sy||1);
      // Pass 2: everything else on top
      all.forEach(function(s){ if(s.tool!=='highlight') self._drawStroke(ctx,s,sx,sy); });
    },

    render:function(){
      if(!this.ctx) return;
      // S290: opaqueBase mode — the markup canvas is created {alpha:false}
      // (machines that composite transparent canvases as white) and the photo
      // is painted as the base layer under the strokes instead of clearRect.
      if(this.opaqueBase && this.img && this.img.naturalWidth){
        try{ this.ctx.drawImage(this.img, 0, 0, this.nw, this.nh); }
        catch(_){ this.ctx.clearRect(0,0,this.nw,this.nh); }
      } else {
        this.ctx.clearRect(0,0,this.nw,this.nh);
      }
      this._renderTo(this.ctx, 1, 1);
      this._drawSelChrome(this.ctx);   // S296: selection box/handles — live canvas only, never composited
    },

    // Composite saved markup onto an arbitrary ctx whose canvas is dw x dh px.
    compositeOnto:function(ctx, dw, dh){
      var sx=dw/this.nw, sy=dh/this.nh;
      this._renderTo(ctx, sx, sy);
    },

    isDirty:function(){return this.strokes.length>0;},
    // S296: op-log undo/redo — strict LIFO, so every op's index is valid when replayed
    undo:function(){
      if(!this.ops.length) return;
      var op=this.ops.pop();
      var self=this;
      if(op.t==='add'){ op.stroke=this.strokes.pop(); }
      else if(op.t==='del'){ this.strokes.splice(op.idx,0,op.stroke); }
      else if(op.t==='mod'){ this.strokes[op.idx]=JSON.parse(op.before); }
      else if(op.t==='gmod'){ op.ids.forEach(function(id,i){ var j=self.strokes.findIndex(function(s){return s.id===id;}); if(j>=0) self.strokes[j]=JSON.parse(op.before[i]); }); }   // S314
      else if(op.t==='gdel'){ op.items.forEach(function(it){ self.strokes.splice(Math.min(it.idx,self.strokes.length),0,it.stroke); }); }   // S314 (items stored ascending)
      else if(op.t==='gadd'){ var addIds=op.items.map(function(it){return it.stroke.id;}); this.strokes=this.strokes.filter(function(s){return addIds.indexOf(s.id)===-1;}); }   // S344 Phase 2c: undo a clone
      else if(op.t==='clear'){ this.strokes=JSON.parse(op.all); }
      else if(op.t==='erase'){ this.strokes=JSON.parse(op.before); }   // S459: one drag = one entry
      this.redoOps.push(op);
      this.selection=null; this._selMode=null; this._selHandles=null;
      this.selIds=[]; this._dragState=null; this._rubberBand=null;
      this.render(); if(this._onDirty) this._onDirty();
    },
    redoOp:function(){
      if(!this.redoOps.length) return;
      var op=this.redoOps.pop();
      var self=this;
      if(op.t==='add'){ this.strokes.push(op.stroke); }
      else if(op.t==='del'){ this.strokes.splice(op.idx,1); }
      else if(op.t==='mod'){ this.strokes[op.idx]=JSON.parse(op.after); }
      else if(op.t==='gmod'){ op.ids.forEach(function(id,i){ var j=self.strokes.findIndex(function(s){return s.id===id;}); if(j>=0) self.strokes[j]=JSON.parse(op.after[i]); }); }   // S314
      else if(op.t==='gdel'){ var rmIds=op.items.map(function(it){return it.stroke.id;}); this.strokes=this.strokes.filter(function(s){return rmIds.indexOf(s.id)===-1;}); }   // S314
      else if(op.t==='gadd'){ op.items.forEach(function(it){ self.strokes.splice(Math.min(it.idx,self.strokes.length),0,it.stroke); }); }   // S344 Phase 2c: redo a clone
      else if(op.t==='clear'){ this.strokes=[]; }
      else if(op.t==='erase'){ this.strokes=JSON.parse(op.after); }   // S459
      this.ops.push(op);
      this.selection=null; this._selMode=null; this._selHandles=null;
      this.selIds=[]; this._dragState=null; this._rubberBand=null;
      this.render(); if(this._onDirty) this._onDirty();
    },
    clear:function(){
      if(this.strokes.length) this._pushOp({t:'clear', all:JSON.stringify(this.strokes)});
      this.strokes=[]; this.redo=[];
      this.selection=null; this._selMode=null; this._selHandles=null;
      this.selIds=[]; this._dragState=null; this._rubberBand=null;   // S314
      this.render(); if(this._onDirty) this._onDirty();
    },

    toMk:function(){
      if(!this.strokes.length) return null;
      return { w:this.nw, h:this.nh, o: JSON.parse(JSON.stringify(this.strokes)) };
    }
  };
  // Static compositor for thumbnails / display where no live attach exists.
  E.composite = function(ctx, mk, dw, dh){
    if(!mk || !Array.isArray(mk.o) || !mk.o.length) return;
    var tmp = Object.create(E);
    tmp.strokes = mk.o; tmp._curr = null;
    tmp._renderTo(ctx, dw/(mk.w||dw), dh/(mk.h||dh));
  };
  return E;
})();
if(typeof window!=='undefined') window.DieselMarkup = DieselMarkup;
// S459g: install the shared selection engine (canonical two-SET model). Selection is
// a hard shared dependency like the header engine — if the module failed to load the
// select tool is disabled (routing below guards), drawing/erasing keep working, and
// nothing can corrupt data.
if(typeof window!=='undefined'){
  if(window.MarkupSelection){ window.MarkupSelection.install(DieselMarkup); }
  else { console.error('[DieselMarkup] lib/ui/markupSelection.js missing — selection tool disabled'); }
  if(window.MarkupText){ window.MarkupText.install(DieselMarkup); }
  else { console.error('[DieselMarkup] lib/ui/markupText.js missing — text tool disabled'); }
}

// ═══ S283: DslLightbox — the FRT lightbox, ported wholesale ═══
// Replaces ALL prior Diesel lightbox generations (basic lightbox + bitmap
// markup + zoom wrapper + caption wrapper + nd-override), which are retired
// inert below. Architecture is FRT's frt/js/ui/lightbox.js adapted to Diesel:
//   - own DOM built once, re-parented to <body> (root stacking context),
//     z-index 10000, ids dlb-* so the inert legacy DOM can't collide
//   - VIEW mode: pan/zoom (wheel + pinch), swipe prev/next, double-tap/click
//     zoom, rotate, keyboard, counter, caption + date row (Diesel-specific)
//   - MARKUP mode: FRT pill toolbar (pen/highlight/line/rect/oval/arrow/text/
//     eraser, undo/redo, swatches, size, Save/Clear/Revert/Exit) driving the
//     DieselMarkup vector engine; saved markup persists as p.mk (non-
//     destructive) and is composited in view mode
//   - iOS body scroll lock (position:fixed pattern from the gauge-modal fix)
//   - S300: bake/download composite from a taint-free loader (local dataURL
//     or fetched blob); the displayed img loads plain, no crossOrigin
// ═══ S461: LIGHTBOX SHELL — shared module lib/ui/lightbox.js ═══
// The whole DslLightbox viewer chrome (S283–S459 lineage: canvas-stage paint,
// pan/zoom/swipe/rotate, FRT pill markup toolbar, non-destructive persist
// pipeline) was moved into the shared module VERBATIM — same pixels, same
// behavior; every field-proven quirk (S287 canvas paint, S300 taint-free
// bake, S301 onerror drop, S303/S305 persist gate) preserved. The module
// late-binds Diesel's globals (DieselMarkup, _photoSrc, _dslMarkupPersist,
// showToast, …) — see the host contract in lib/ui/lightbox.js.
var DslLightbox = window.LightboxShell.build();
if(typeof window!=='undefined') window.DslLightbox = DslLightbox;


function openLightbox(photos, idx, ctx) {
  // S283: delegates to DslLightbox — the FRT lightbox ported wholesale.
  // S293: the legacy #photo-lightbox DOM and its showLbPhoto/initLbMarkup
  // chain were removed outright (dead-code cleanup, Mark-directed).
  DslLightbox.open(photos, typeof idx === 'number' ? idx : 0, ctx || null);
}

// S344 Phase 3: open the upgraded lightbox at a photo and jump straight into markup.
// Replaces the retired destructive bitmap modal (openDeficPhotoMarkup/_openPmuModal) so
// every ✏ markup entry uses the FRT engine + non-destructive p.mk storage. The image
// decodes async, so enter markup on a short poll once the lightbox image is ready.
function openLightboxMarkup(photos, idx, ctx){
  openLightbox(photos, idx, ctx);
  var tries=0;
  (function waitReady(){
    tries++;
    var img=document.getElementById('dlb-image');
    if(window.DslLightbox && DslLightbox.isOpen && DslLightbox.isOpen() && img && img.naturalWidth){
      try{ DslLightbox.enterMarkup(); }catch(e){}
      return;
    }
    if(tries<40) setTimeout(waitReady, 50);
  })();
}

function closeLightbox() {
  // S283: delegates to DslLightbox. S293: legacy DOM/state removed.
  if(typeof DslLightbox!=='undefined') DslLightbox.close();
}

function renderThumbs(id) { return _CLENG.renderThumbs(id); }

function setStatus(id, status) { return _CLENG.setStatus(id, status); }

// ── PHOTO ──
let currentPhotoId = null;
// S280: every trigger clears ALL targets so a stale target from a prior
// (possibly cancelled) action can never hijack a fresh upload.
function _clearPhotoTargets(fi){
  currentPhotoId = null;
  deficPhotoTarget = null;
  if(fi) fi._target = null;
}
function triggerPhoto(id) { const fi = document.getElementById('global-file-input'); _clearPhotoTargets(fi); currentPhotoId = id; fi.removeAttribute('capture'); fi.multiple=true; fi.value=''; fi.click(); }
function triggerCamera(id) { if(typeof _camBurst==='function'){ _camBurst(function(f){ handleFiles(id, [f], false); }); return; } triggerCameraLegacy(id); }
function triggerCameraLegacy(id) { const fi = document.getElementById('global-file-input'); _clearPhotoTargets(fi); currentPhotoId = id; fi.value=''; fi.setAttribute('capture','environment'); fi.multiple=false; fi.click(); }

// S280: ONE authoritative change handler on #global-file-input.
// Previously TWO change listeners were bound to this same input (this block +
// a later "Patch global file handler" block). Both fired on a single change
// event, so one upload produced TWO photos — and a timing race on the shared
// currentPhotoId could auto-vivify a clState["null"] orphan. The second
// listener is now deleted; this handler absorbs every routing branch.
// A checklist key is only valid if it's a real, truthy, non-"null" string.
function _validClKey(k){ return typeof k === 'string' && k && k !== 'null' && k !== 'undefined'; }
document.getElementById('global-file-input').addEventListener('change', function(e){
  const fi = this;
  const wasCam = fi.hasAttribute('capture');
  const reset = function(){
    _clearPhotoTargets(fi);
    fi.removeAttribute('capture'); fi.multiple = true;
    if(wasCam){ setTimeout(function(){ fi.value=''; fi.setAttribute('capture','environment'); fi.multiple=false; fi.click(); }, 300); }
  };
  const files = e.target.files;
  if(!files || !files.length){ reset(); return; }

  // 1. Flow test photos (PLD) — flagged via fi._target
  if(fi._target === '__flowtestpld') {
    Array.from(files).forEach(function(f){
      if(!f.type.startsWith('image/')) return;
      const r=new FileReader();
      r.onload=ev=>{ flowTestPhotosPld.push(ArcPhoto.mint(ev.target.result,f.name)); renderFlowTestThumbsPld(); };
      r.readAsDataURL(f);
    });
    reset(); return;
  }

  // 2. Flow test photos (3-point) — flagged via currentPhotoId sentinel
  if(currentPhotoId === '__flowtest') {
    Array.from(files).forEach(function(f){
      if(!f.type.startsWith('image/')) return;
      const r=new FileReader();
      r.onload=ev=>{ flowTestPhotos.push(ArcPhoto.mint(ev.target.result,f.name)); renderFlowTestThumbs(); };
      r.readAsDataURL(f);
    });
    reset(); return;
  }

  // 3. Deficiency photos — routed via the live deficPhotoTarget {name, idx, type}
  if(deficPhotoTarget) {
    const t = deficPhotoTarget;
    if(t.type === 'response') {
      const f = files[0];
      if(f && f.type.startsWith('image/')) {
        const r=new FileReader();
        r.onload=ev=>{ deficiencies[t.name][t.idx].responsePhoto = ev.target.result; renderDeficGroup(t.name); };
        r.readAsDataURL(f);
      }
    } else {
      Array.from(files).forEach(function(f){
        if(!f.type.startsWith('image/')) return;
        // S371: EXIF capture date before compression.
        _photoDateFromExif(f).then(function(photoDate){
        const r=new FileReader();
        r.onload=ev=>{ compressImage(ev.target.result, 1600, 0.85, function(compressed){
          deficiencies[t.name][t.idx].photos.push(ArcPhoto.mint(compressed,f.name,{date:photoDate}));
          renderDeficGroup(t.name);
          if(typeof updateDeficSummary==='function') updateDeficSummary();
        }); };
        r.readAsDataURL(f);
        });
      });
    }
    reset(); return;
  }

  // 4. Checklist item photos — only for a real, validated key (guards the "null" orphan)
  if(_validClKey(currentPhotoId)) {
    const id = currentPhotoId;
    Array.from(files).forEach(function(f){
      if(!f.type.startsWith('image/')) return;
      // S371: EXIF capture date before compression.
      _photoDateFromExif(f).then(function(photoDate){
      const r=new FileReader();
      r.onload=ev=>{ compressImage(ev.target.result, 1600, 0.85, function(compressed){
        if(!clState[id]) return; // never auto-vivify; a real item always exists before upload
        clState[id].photos.push(ArcPhoto.mint(compressed,f.name,{date:photoDate}));
        var _pg=document.getElementById('pg-'+id); if(_pg) _pg.innerHTML = renderThumbs(id);
        var _id=document.getElementById('id-'+id); if(_id) _id.classList.add('open');
        var _pb=document.getElementById('pbtn-'+id); if(_pb) _pb.classList.add('open-ind');
        if(typeof refreshItemPhotoUI==='function') refreshItemPhotoUI(id);
      }); };
      r.readAsDataURL(f);
      });
    });
  }
  reset();
});
/* S496: SHARED PHOTO INPUT ENGINE mount (ns 'cl' — checklist items).
   lib/ui/checklist.js renders each item's photo zone via window.PhotoInput and
   otherwise prints "Photo input engine not loaded" — which is what live Diesel
   was showing, so checklist photos could not be attached AT ALL. Electric has
   mounted this since S492; Diesel never did.

   STORAGE STAYS DIESEL'S: the engine hands back File objects only. They go
   straight into handleFiles(id, files, false) — the existing, field-proven path
   (EXIF date → compress → ArcPhoto.mint → thumbs). No photo model change, no
   new save path. Only the INPUT SURFACE (drag-drop + Upload + Camera) is shared.

   Only ns 'cl' is mounted: Diesel keeps its own flow-test photo UI (it has no
   flow-test-zone-host elements — that is Electric's layout, not Diesel's).

   The retry loop mirrors Electric's: photoInput.js is a deferred module, so it
   is not present when this classic script runs during parse.

   S498 ROOT FIX (Mark, field-reported on diesel-app: "I can't attach photos"):
   the boot renderChecklist() calls above run DURING PARSE — before any deferred
   module executes — so every item's photo zone is baked with the "Photo input
   engine not loaded" hint, and NOTHING repainted them afterwards. Clicking NO
   merely reveals a zone that was baked wrong at boot. Electric never had this
   bug because its engine surfaces are painted AFTER the engine arrives
   (host.innerHTML = PhotoInput.html(...)) — the one property the S496 port did
   not carry over. The heal below uses the EXISTING S301 verb that re-renders
   every photo surface; renderChecklist rebuilds each container from scratch, so
   one call the moment the engine lands repaints every baked hint into a real
   zone. clState is already initialized by the boot render and the user cannot
   have interacted yet at module-execution time, so the rebuild is safe. */
(function _mountPhotoInput(){
  function go(){
    if(!window.PhotoInput){ setTimeout(go,50); return; }
    window.PhotoInput.mount({
      ns:'cl',
      onFiles:function(files,ctx){
        var id=ctx&&ctx['cl-id'];
        if(!id||!files||!files.length) return;
        if(typeof _validClKey==='function' && !_validClKey(id)) return;  // never auto-vivify a clState orphan
        handleFiles(id,files,false);
      },
      /* S496 fix: the first mount omitted onGallery entirely. The engine hides
         nothing — the Gallery button renders regardless and its click checks
         `if (h.onGallery)`, so with no callback the button was rendered DEAD.
         Routed to Diesel's existing site-photo reuse picker, same as the ✓
         host-contract symbol the shared checklist has always named. */
      onGallery:function(ctx){
        var id=ctx&&ctx['cl-id'];
        if(!id) return;
        if(typeof _validClKey==='function' && !_validClKey(id)) return;
        if(typeof _galleryReuseChecklist==='function') _galleryReuseChecklist(id);
      }
    });
    /* S498: heal the boot-baked hints (see block comment above). Existing verb,
       full repaint of every photo surface, exactly once, engine now present. */
    if(typeof _dslRefreshPhotoSurfaces==='function') _dslRefreshPhotoSurfaces();
  }
  go();
})();
function handleFiles(id, files, isDefic) {
  Array.from(files).forEach(f => {
    if(!f.type.startsWith('image/')) return;
    // S371: capture date from EXIF (original File, before compression strips it).
    _photoDateFromExif(f).then(function(photoDate){
    const r = new FileReader();
    r.onload = e => {
      compressImage(e.target.result, 1600, 0.85, function(compressed){
        if(isDefic) {
          // S369: guard the photos array — if deficiencies[id] exists but .photos
          // is undefined, the .push below throws silently inside this compress
          // callback and the captured photo vanishes (camera opened, shot taken,
          // nothing saved). Same guard the restore path at _restore already uses.
          if(!deficiencies[id]) return;
          if(!Array.isArray(deficiencies[id].photos)) deficiencies[id].photos=[];
          deficiencies[id].photos.push(ArcPhoto.mint(compressed,f.name,{date:photoDate}));
          renderDeficThumbs(id);
          updateDeficSummary();
        } else {
          // S369: same guard for checklist items. clState[id] may exist (item was
          // answered / loaded from cloud) without a .photos array, or the camera
          // may fire before toggleItemDetail initialized it. Without this, the
          // push throws silently and the photo never appears. (This is the exact
          // "camera opens, photo taken, nothing saves" bug.)
          if(!clState[id]) clState[id] = { status:null, comment:'', photos:[], customText:'' };
          if(!Array.isArray(clState[id].photos)) clState[id].photos=[];
          clState[id].photos.push(ArcPhoto.mint(compressed,f.name,{date:photoDate}));
          var _pg=document.getElementById('pg-'+id); if(_pg) _pg.innerHTML = renderThumbs(id);
          var _id=document.getElementById('id-'+id); if(_id) _id.classList.add('open');
          var _pb=document.getElementById('pbtn-'+id); if(_pb) _pb.classList.add('open-ind');
          refreshItemPhotoUI(id);
        }
      });
    };
    r.readAsDataURL(f);
    });
  });
}
function removePhoto(id,i){
  // S264: was an instant no-confirm splice that also left the gallery stale. Route
  // through the authoritative delete (confirm + both surfaces + R2 + save) by id.
  var p = clState[id] && clState[id].photos ? clState[id].photos[i] : null;
  if(!p){ return; }
  if(p.id){ deletePhotoEverywhere({photoId:p.id}); }
  else {
    // legacy photo with no id — confirm then splice directly (can't route by id)
    _aConfirm('Delete this photo? This cannot be undone.', function(){
      clState[id].photos.splice(i,1);
      var el=document.getElementById('pg-'+id); if(el) el.innerHTML=renderThumbs(id);
      refreshItemPhotoUI(id);
      if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
      if(typeof saveState==='function') saveState();
    },'Delete');
  }
}
function handleDragOver(e,id){ e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e,id){ e.currentTarget.classList.remove('drag-over'); }
function handleDrop(e,id){ e.preventDefault(); e.currentTarget.classList.remove('drag-over'); handleFiles(id,e.dataTransfer.files,false); }

// ── PROGRESS ──
function updateProgress() {
  let total=0, yes=0, no=0, na=0;
  for(const v of Object.values(clState)){
    total++;
    if(v.status==='yes') yes++;
    else if(v.status==='no') no++;
    else if(v.status==='na') na++;
  }
  const ans=yes+no+na;
  const pct = total ? Math.round(ans/total*100) : 0;
  document.getElementById('prog-fill').style.width = pct+'%';
  document.getElementById('prog-label').textContent = `${ans} / ${total} (${pct}%)`;
  document.getElementById('cnt-yes').textContent = `✓ ${yes}`;
  document.getElementById('cnt-no').textContent = `✗ ${no}`;
  document.getElementById('cnt-na').textContent = `— ${na}`;
  // S258: 5-tile stats. Fail = No answers + test FAIL. N/A = not applicable. I/C = incomplete (unanswered).
  // Reconciles: Pass + Fail + N/A + I/C = Checklist total.
  (function(){
    var sT=document.getElementById('sstat-total'); if(sT) sT.textContent=total;
    var sP=document.getElementById('sstat-pass'); if(sP) sP.textContent=yes;
    var sN=document.getElementById('sstat-na'); if(sN) sN.textContent=na;
    var sD=document.getElementById('sstat-defic');
    var failN=no;
    var tr=document.getElementById('test-result');
    if(tr && /fail/i.test(tr.value)) failN+=1;  // 3-Point / main test FAIL counts as a fail
    if(sD) sD.textContent=failN;
    var sIC=document.getElementById('sstat-ic');
    var inc=total-yes-no-na; if(inc<0) inc=0;
    if(sIC){ sIC.textContent=inc; }
    // S264: size the outcomes donut from the four shown values. Draw over their SUM
    // (denom), not `total` — failN may carry the +1 test-FAIL that isn't a checklist
    // item, so the ring closes exactly. Centre label stays `total` (set above).
    (function(){
      var C=364.4; // 2·π·58
      var denom=yes+failN+na+inc;
      var arcs=[
        {arc:'oc-arc-pass',pc:'ocpc-pass',n:yes},
        {arc:'oc-arc-fail',pc:'ocpc-fail',n:failN},
        {arc:'oc-arc-na',  pc:'ocpc-na',  n:na},
        {arc:'oc-arc-ic',  pc:'ocpc-ic',  n:inc}
      ];
      var off=0;
      arcs.forEach(function(a){
        var len = denom>0 ? (a.n/denom*C) : 0;
        var el=document.getElementById(a.arc);
        if(el){ el.setAttribute('stroke-dasharray', len.toFixed(1)+' '+C); el.setAttribute('stroke-dashoffset', (-off).toFixed(1)); }
        var p=document.getElementById(a.pc);
        if(p){ p.textContent = (denom>0 ? Math.round(a.n/denom*100) : 0)+'%'; }
        off+=len;
      });
    })();
  })();
  // Update tab dots for sections with unselected items
  var secCounts = {};
  for(var k in clState) {
    var sec = k.split('_')[0];
    if(!secCounts[sec]) secCounts[sec] = {total:0,done:0};
    secCounts[sec].total++;
    if(clState[k].status) secCounts[sec].done++;
  }
  // Merged Performance tab: the s4 dot reflects ONLY the active test's checklist
  // (3-Point uses s4 items; 7-Point uses s4pld items). The inactive test's unanswered
  // items must not keep the dot nagging.
  (function(){
    var _pt='std'; document.querySelectorAll('.pump-type-btns button').forEach(function(b){ if(b.classList.contains('on')) _pt=b.dataset.ptype; });
    if(_pt==='pld') secCounts['s4'] = secCounts['s4pld'] || {total:0,done:0};
  })();
  ['s1','s2','s3','s4','s5'].forEach(function(sec){
    var dot = document.getElementById('dot-'+sec);
    if(dot) {
      var c = secCounts[sec];
      dot.className = 'tab-dot' + (c && c.done < c.total ? ' visible' : '');
    }
  });
  var missing = total - ans;
  var missEl = document.getElementById('cnt-missing');
  if(missEl) missEl.textContent = missing > 0 ? '⚠ ' + missing + ' pending' : '';
  if(missEl) missEl.style.display = missing > 0 ? '' : 'none';
  updateDeficTabBadge();
  if(typeof updateCompletionOverview==='function') updateCompletionOverview();
}

// Live deficiency count on the Deficiencies tab (open/unresolved only)
function updateDeficTabBadge(){
  if(typeof updatePhaseFlags==='function') updatePhaseFlags();
  var el = document.getElementById('defic-tab-count');
  if(!el) return;
  var all = [];
  try { all = contractors.flatMap(function(n){ return deficiencies[n]||[]; }).concat(generalDeficiencies||[]); }
  catch(e){ return; }
  var open = all.filter(function(d){ return (d.status||'open') !== 'resolved'; }).length;
  var total = all.length;
  if(total === 0){ el.style.display='none'; return; }
  el.style.display = 'inline-block';
  if(open > 0){
    el.classList.remove('allclear');
    el.textContent = open;
    el.title = open + ' open of ' + total + ' deficiencies';
  } else {
    el.classList.add('allclear');
    el.textContent = '\u2713';
    el.title = 'All ' + total + ' deficiencies resolved';
  }
}

// ══════════════════════════════════════════════════
// COMPLETION OVERVIEW (Summary tab roll-up)
// ══════════════════════════════════════════════════
// Counts toward %: 4 checklists (s1/s2/s3/s5) + battery entered +
// 3-Point (all points entered AND result selected) + consultant signature.
// PLD = optional/"skipped" until any PLD field is touched, then required.
// Open deficiencies flag SEPARATELY (do NOT subtract from %).
function _ovChecklistStat(sec){
  var srcMap = {s1:(typeof S1!=='undefined'?S1:[]), s2:(typeof S2!=='undefined'?S2:[]), s3:(typeof S3!=='undefined'?S3:[]), s5:(typeof S5!=='undefined'?S5:[])};
  var items = srcMap[sec] || [];
  var total = items.length, done = 0;
  for(var i=0;i<items.length;i++){
    var id = (typeof cid==='function') ? cid(sec,i) : (sec+'_'+i);
    if(clState[id] && clState[id].status) done++;
  }
  return {total:total, done:done};
}
function _ovBatteryEntered(){
  try{
    var any = (batData.b1||[]).some(function(v){return +v>0;}) || (batData.b2||[]).some(function(v){return +v>0;});
    return any;
  }catch(e){ return false; }
}
function _ovThreePointStat(){
  // complete = every std row has suction AND discharge, AND test-result selected
  var rows = (typeof stdData!=='undefined') ? stdData : [];
  var withVals = rows.filter(function(r){
    return r && r.suction!=='' && r.suction!=null && r.discharge!=='' && r.discharge!=null;
  }).length;
  var allVals = rows.length>0 && withVals===rows.length;
  var resultEl = document.getElementById('test-result');
  var resultSel = !!(resultEl && resultEl.value);
  return {rows:rows.length, withVals:withVals, complete: allVals && resultSel, anyVals: withVals>0, resultSel:resultSel};
}
function _ovPldTouched(){
  var rows = (typeof pldData!=='undefined') ? pldData : [];
  return rows.some(function(r){
    if(!r) return false;
    return [r.cutsheet,r.placard,r.suc_no,r.dis_no,r.rpm_no,r.suc_w,r.dis_w,r.rpm_w].some(function(v){ return v!=='' && v!=null; });
  });
}
function _ovPldComplete(){
  // once touched: every non-skip row needs w/o-PLD + w/-PLD discharge; skip rows need w/-PLD only.
  var rows = (typeof pldData!=='undefined') ? pldData : [];
  if(rows.length===0) return false;
  return rows.every(function(r,i){
    var skip = (typeof PLD_NO_SKIP!=='undefined') && PLD_NO_SKIP.has(i);
    var hasW = r.suc_w!=='' && r.suc_w!=null && r.dis_w!=='' && r.dis_w!=null;
    if(skip) return hasW;
    var hasNo = r.suc_no!=='' && r.suc_no!=null && r.dis_no!=='' && r.dis_no!=null;
    return hasW && hasNo;
  });
}
function _ovSignaturePresent(){
  // ink on the consultant canvas, or an uploaded signature image
  var img = document.getElementById('sig-upload-img-1');
  if(img && img.src && img.src.indexOf('data:')===0 && img.style.display!=='none') return true;
  var c = document.getElementById('sig-canvas');
  if(c){
    try{
      var ctx = c.getContext('2d', {willReadFrequently:true});
      var d = ctx.getImageData(0,0,c.width,c.height).data;
      for(var p=3; p<d.length; p+=4){ if(d[p]!==0) return true; }
    }catch(e){}
  }
  return false;
}
function _ovDeficStat(){
  var all=[];
  try{ all = contractors.flatMap(function(n){ return deficiencies[n]||[]; }).concat(generalDeficiencies||[]); }
  catch(e){ return {open:0,total:0}; }
  var open = all.filter(function(d){ return (d.status||'open')!=='resolved'; }).length;
  return {open:open, total:all.length};
}
function updateCompletionOverview(){
  var rowsEl = document.getElementById('ov-rows');
  if(!rowsEl) return;
  var items=[]; // {phase, name, sub, state:'done|part|empty|skip', cnt, verdict, target}

  var s1=_ovChecklistStat('s1'), s2=_ovChecklistStat('s2'), s3=_ovChecklistStat('s3'), s5=_ovChecklistStat('s5');
  function clItem(phase,name,sec,stat,target){
    var st = stat.total===0 ? 'empty' : (stat.done===stat.total ? 'done' : (stat.done>0 ? 'part' : 'empty'));
    return {phase:phase, name:name, sub:'Checklist', state:st, cnt: stat.done+' / '+stat.total, target:target};
  }
  // SETUP
  items.push(clItem('Setup','1. Pre-Commissioning','s1',s1,'s1'));
  items.push(clItem('Setup','2. Visual Inspection','s2',s2,'s2'));
  // TESTS
  items.push(clItem('Tests','3. Controller Tests','s3',s3,'s3'));
  var batOk=_ovBatteryEntered();
  items.push({phase:'Tests', name:'Battery Start-Up', sub: batOk?'Test data entered':'No data yet', state: batOk?'done':'empty', cnt: batOk?'entered':'—', target:'s3'});
  var tp=_ovThreePointStat();
  items.push({phase:'Tests', name:'3-Point Test', sub: tp.complete?'All points entered · result selected':(tp.anyVals?(tp.resultSel?'Points incomplete':'Result not selected'):'Not started'), state: tp.complete?'done':(tp.anyVals?'part':'empty'), cnt:'', verdict: tp.complete?(document.getElementById('test-result')&&/fail/i.test(document.getElementById('test-result').value)?'FAIL':'PASS'):'', target:'s4'});
  var pldTouched=_ovPldTouched();
  if(pldTouched){
    var pldOk=_ovPldComplete();
    items.push({phase:'Tests', name:'PLD Test', sub: pldOk?'All points entered':'In progress', state: pldOk?'done':'part', cnt: pldOk?'complete':'partial', target:'s4'});
  } else {
    items.push({phase:'Tests', name:'PLD Test', sub:'Not started — optional until used', state:'skip', cnt:'skipped', skip:true, target:'s4'});
  }
  items.push(clItem('Tests','5. FA & Signaling','s5',s5,'s5'));
  // CLOSEOUT
  var sigOk=_ovSignaturePresent();
  items.push({phase:'Closeout', name:'Consultant Signature', sub: sigOk?'Signed':'Not yet signed', state: sigOk?'done':'empty', cnt: sigOk?'signed':'—', target:'sign'});

  // % = completed counting-items / total counting-items (skipped PLD excluded from denominator)
  var counting = items.filter(function(it){ return !it.skip; });
  var doneCount = counting.filter(function(it){ return it.state==='done'; }).length;
  var totalCount = counting.length;
  var pct = totalCount ? Math.round(doneCount/totalCount*100) : 0;

  document.getElementById('ov-pct').textContent = pct+'%';
  document.getElementById('ov-bar-fill').style.width = pct+'%';
  document.getElementById('ov-lbl-main').textContent = doneCount+' of '+totalCount+' items complete';

  // render grouped rows
  var ICON = {done:'\u2713', part:'!', empty:'\u25CB', skip:'\u2014'};
  var html='', lastPhase='';
  items.forEach(function(it){
    if(it.phase!==lastPhase){ html+='<div class="ov-phgroup">'+it.phase+'</div>'; lastPhase=it.phase; }
    var cntHtml;
    if(it.verdict){ cntHtml='<span class="ov-verdict'+(it.verdict==='FAIL'?' fail':'')+'">'+it.verdict+'</span>'; }
    else { cntHtml = it.cnt; }
    html+='<div class="ov-row" onclick="switchPanel(\''+it.target+'\')">'+
      '<div class="ov-ic '+it.state+'">'+ICON[it.state]+'</div>'+
      '<div class="ov-nm">'+it.name+'<span class="ov-s">'+it.sub+'</span></div>'+
      '<div class="ov-cnt'+(it.skip?' skip':'')+'">'+cntHtml+'</div>'+
      '<span class="ov-chev">\u203A</span></div>';
  });
  rowsEl.innerHTML = html;

  // deficiencies — separate strip, never subtracted from %
  var def=_ovDeficStat();
  var strip=document.getElementById('ov-attn-strip');
  var attnLbl=document.getElementById('ov-lbl-attn');
  if(def.open>0){
    strip.style.display='flex';
    document.getElementById('ov-attn-ic').textContent=def.open;
    document.getElementById('ov-attn-nm').innerHTML=def.open+' open deficienc'+(def.open===1?'y':'ies')+'<span class="ov-s">Reported, not yet resolved — does not block completion</span>';
    attnLbl.style.display=''; attnLbl.textContent=def.open+' deficienc'+(def.open===1?'y needs':'ies need')+' attention';
  } else {
    strip.style.display='none';
    attnLbl.style.display='none';
  }
}


// ══════════════════════════════════════════════════
const BAT_TESTS = ['Auto Test #1','Auto Test #2','Auto Test #3','Manual Test #1','Manual Test #2','Manual Test #3'];
const batData = { b1: BAT_TESTS.map(()=>0), b2: BAT_TESTS.map(()=>0) };

function renderBatTable(tbody_id, bKey) {
  const tbody = document.getElementById(tbody_id);
  tbody.innerHTML = '';
  BAT_TESTS.forEach((label, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td><td style="white-space:nowrap;"><input type="number" min="0" step="0.1" value="${batData[bKey][i]||''}" placeholder="0" style="width:70px;-moz-appearance:textfield;text-align:right;padding-right:4px;" oninput="this.value=this.value.replace(/^0+(\\d)/,'$1');batData['${bKey}'][${i}]=+this.value||0;updateBatTotals()"> <span style="font-size:12px;color:#888;">s</span></td>`;
    tbody.appendChild(tr);
  });
  // Total row
  const tot = document.createElement('tr');
  tot.className='total-row'; tot.id=`bat-tot-${bKey}`;
  tot.innerHTML = `<td><strong>Subtotal</strong></td><td id="bat-sub-${bKey}"><strong>0.00 s</strong></td>`;
  tbody.appendChild(tot);
}

function updateBatTotals() {
  const b1=batData.b1.reduce((a,b)=>a+b,0);
  const b2=batData.b2.reduce((a,b)=>a+b,0);
  document.getElementById('bat-sub-b1').innerHTML=`<strong>${b1.toFixed(2)} s</strong>`;
  document.getElementById('bat-sub-b2').innerHTML=`<strong>${b2.toFixed(2)} s</strong>`;
  const cum = b1+b2;
  document.getElementById('cum-total').textContent = cum.toFixed(2);
  const pfRow = document.getElementById('pf-row');
  if(cum <= 45){
    pfRow.innerHTML=`<span class="pass">✓ PASS — Total duration ${cum.toFixed(2)}s ≤ 45s</span>`;
    pfRow.style.background='var(--yes-bg)';
  } else {
    pfRow.innerHTML=`<span class="fail">✗ FAIL — Total duration ${cum.toFixed(2)}s exceeds 45s. Engine shall run 5 min at full speed for remaining tests.</span>`;
    pfRow.style.background='var(--no-bg)';
  }
  if(typeof updateCompletionOverview==='function') updateCompletionOverview();
}

// ── GLOBAL TABLE INPUT DELEGATION (prevents re-render / focus loss bug) ──
document.addEventListener('change', function(e){
  // S321: checkbox/select commits also autosave (input doesn't cover every case)
  var el=e.target;
  if(el && (el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA') && typeof debounceAutosave==='function') debounceAutosave();
});
document.addEventListener('input', function(e) {
  const el = e.target;
  // Remove leading zeros from number inputs globally
  if(el.type==='number' && el.value.length>1 && el.value[0]==='0' && el.value[1]!=='.') {
    el.value = el.value.replace(/^0+(?=\d)/, '');
  }
  // S321: EVERY edit autosaves — a typed value must never live only in the DOM.
  // (Field regression: residual supply flow typed 3000, visibly reverted to the
  // stale cloud 1500. Root causes: fields with no save hook + heartbeat merges
  // applying stale cloud scalars over live edits. This is fix half #1.)
  if(el && (el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT') && typeof debounceAutosave==='function') debounceAutosave();
  const tbl = el.dataset.tbl;
  const idx = parseInt(el.dataset.idx);
  const field = el.dataset.field;
  if(!tbl || isNaN(idx) || !field) return;
  if(tbl === 'std') {
    stdData[idx][field] = el.value;
    updateStdCalcCells(idx);
    if(['flow','suction','discharge','cutsheet'].includes(field)) {
      clearTimeout(stdChartTimer);
      stdChartTimer = setTimeout(() => { updateChart(); updateVerdict(); }, 120);
    }
  } else if(tbl === 'pld') {
    pldData[idx][field] = el.value;
    updatePldCalcCells(idx);
    // Debounce chart updates so rapid typing doesn't freeze
    clearTimeout(pldChartTimer);
    pldChartTimer = setTimeout(() => { refreshAllCharts(); }, 120);
    if(typeof updateCompletionOverview==='function') updateCompletionOverview();
  }
  debounceAutosave();
});
let pldChartTimer = null;
let stdChartTimer = null;

// Autosave on any other input change (non-table inputs)
document.addEventListener('change', function(e) {
  if (!e.target.dataset.tbl) debounceAutosave();
});

// ══════════════════════════════════════════════════
// PUMP PERFORMANCE TABLES
// ══════════════════════════════════════════════════
const STD_ROWS = [
  { pct:'0%', flow:0, label:'Churn' },
  { pct:'100%', flow:null, label:'Rated' },
  { pct:'150%', flow:null, label:'Overload' },
];
const PLD_ROWS = [
  {pct:'0%',   defaultFlow:0},
  {pct:'25%',  defaultFlow:500},
  {pct:'50%',  defaultFlow:1000},
  {pct:'75%',  defaultFlow:1500},
  {pct:'100%', defaultFlow:2000},
  {pct:'125%', defaultFlow:2500},
  {pct:'150%', defaultFlow:3000},
];

const stdData = STD_ROWS.map(r=>({...r, cutsheet:'', placard:'', suction:'', discharge:'', bfUp:'', bfDown:'', rpm:'', photos:[]}));
const pldData = PLD_ROWS.map((r,i)=>({...r, flow:i===0?0:'', cutsheet:'', placard:'', suc_no:'', dis_no:'', rpm_no:'', suc_w:'', dis_w:'', rpm_w:'', bfUp:'', bfDown:'', photos:[]}));
var npshPsi = ''; // Net Positive Suction Head (psi) — 3-Point tab; suction below this flags an advisory warning
var npshPsiPld = ''; // NPSH (psi) — 7-Point PLD tab (independent of npshPsi)


// Auto-fill flow ratings from rated flow — user can still overwrite
function autoFillStdFlows() {
  var rated = parseFloat(document.getElementById('pm-rated-flow').value);
  if(!rated || rated <= 0) return;
  // 0% = 0, 100% = rated, 150% = rated * 1.5
  var flows = [0, rated, rated * 1.5];
  flows.forEach(function(f, i) {
    if(stdData[i]) {
      stdData[i].flow = f;
    }
  });
  renderStdTable();
  updateChart3pt();
  debounceAutosave();
}

function autoFillPldFlows() {
  var rated = parseFloat(document.getElementById('pm-rated-flow-pld').value);
  if(!rated || rated <= 0) return;
  // 0%=0, 25%=0.25x, 50%=0.5x, 75%=0.75x, 100%=1x, 125%=1.25x, 150%=1.5x
  var pcts = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
  pcts.forEach(function(p, i) {
    if(pldData[i]) {
      pldData[i].flow = Math.round(rated * p);
    }
  });
  renderPldTable();
  updatePldChart();
  updatePldNetChart();
  debounceAutosave();
}

// ── Affinity-law flow-test math (shared by 4a cards) ──
// Adjusted net = recorded net × (rated RPM / recorded RPM)²  (NFPA affinity pressure law)
// Pass = adjusted net ≥ 95% × placard (NFPA 25). Hard fails: placard<cutsheet, adjusted<95%placard.
// Suction<NPSH and backflow<20 and churn over-pressure are ADVISORY flags, not fails.
function _ratedRpm(){ var v=parseFloat(document.getElementById('pm-rpm') && document.getElementById('pm-rpm').value); return (!isNaN(v)&&v>0)?v:null; }
function _ratedRpmPld(){ var e=document.getElementById('pm-rpm-pld'); var v=e?parseFloat(e.value):NaN; if(!isNaN(v)&&v>0) return v; return _ratedRpm(); }
function _sysRating(){ var v=parseFloat(document.getElementById('pm-sysrating') && document.getElementById('pm-sysrating').value); return (!isNaN(v)&&v>0)?v:null; }
// ════════════════════════════════════════════════════════════════════════════
// S366: FLOW-CHART PASS/FAIL — NFPA 20 ACCEPTANCE CRITERIA (replaces NFPA 25 95%-placard)
// Locked with Mark:
//  • Drop the old 95%-of-placard rule and the placard<cutsheet hard-fail entirely
//    (those were NFPA 25 periodic-ITM, not applicable to a commissioning/acceptance test).
//  • Verdict driven by three NFPA 20 numeric gates, on adjusted (rated-speed) net vs the
//    RATED net = placard pressure at the 100% row:
//        0%  churn : adj net ≤ 140% of rated  (else FAIL)
//        100% rated: adj net ≥ 100% of rated  (else FAIL)
//        150% peak : adj net ≥  65% of rated  (else FAIL)
//    25/50/75/125% are informational (no gate).
//  • §14.2.4.2 certified-curve check (ALL points): |adj net − that point's placard| within
//    ±1% (calibrated-gauge accuracy) → OK; outside ±1% → ⚑ FLAG ONLY (does NOT drive verdict).
//  • PLD device check (7-pt, points with a w/PLD discharge): dis_w vs PLD setting (pm-pld-setting):
//        ≤ setpoint → OK ; setpoint..+3 psi → ⚑ flag ; > setpoint+3 → FAIL (PLD not holding).
//  • 7-pt scores the w/o-PLD net (true pump capability); held w/PLD net is NOT scored.
//  • Manual override (dropdown per point): 'auto' (default), 'pass', 'fail', 'flag'. Effective
//    status = override if set else auto. Override is sticky + stored on the row (overStd/overPld),
//    persists through save/load/sync/PDF. Manual 'flag' counts as NOT-a-fail in rollup.
//  • Rollup: any EFFECTIVE-fail gated point → chart FAIL; all effective-pass → PASS; else N/A.
// ════════════════════════════════════════════════════════════════════════════

// Rated net = placard pressure on the 100% row of the given dataset.
function _ratedNetFrom(rows){
  if(!Array.isArray(rows)) return null;
  for(var i=0;i<rows.length;i++){ if(rows[i] && rows[i].pct==='100%'){ var p=parseFloat(rows[i].placard); return (!isNaN(p))?p:null; } }
  return null;
}
// Which points are the NFPA 20 acceptance gates.
function _isGatePct(pct){ return pct==='0%' || pct==='100%' || pct==='150%'; }
// Evaluate the NFPA 20 gate for one point. Returns 'pass'|'fail'|'na' (na = not a gate, or no data).
function _nfpa20Gate(pct, adjNet, ratedNet){
  if(!_isGatePct(pct)) return 'na';
  if(adjNet==null || isNaN(adjNet) || ratedNet==null || isNaN(ratedNet) || ratedNet<=0) return 'na';
  if(pct==='0%')   return (adjNet <= ratedNet*1.40) ? 'pass' : 'fail';   // churn ≤ 140% rated
  if(pct==='100%') return (adjNet >= ratedNet*1.00) ? 'pass' : 'fail';   // rated ≥ 100% rated
  if(pct==='150%') return (adjNet >= ratedNet*0.65) ? 'pass' : 'fail';   // peak  ≥  65% rated
  return 'na';
}
// §14.2.4.2 ±1% certified-curve deviation flag for one point (vs that point's OWN placard).
// Returns true if the point is OUTSIDE the ±1% calibrated-gauge band (→ ⚑ flag).
/* S499 CARVE: the maths now lives in lib/calc/pumpCurve.js and is pinned by
   tests/unit/pumpCurve.test.js (21 tests + a 9,800-case differential proving
   this delegate is behaviourally identical to the code it replaced).
   THIN DELEGATE, not a second implementation — the shared module owns the one
   copy. The inline fallback exists only so a failed module load cannot strand
   an inspector mid-commissioning. */
function _curveDevOver1pct(adjNet, pointPlacard){
  if(window.PumpCurve) return window.PumpCurve.curveDevOver1pct(adjNet, pointPlacard);
  if(adjNet==null || isNaN(adjNet) || isNaN(pointPlacard) || pointPlacard<=0) return false;
  return Math.abs(adjNet - pointPlacard) > pointPlacard*0.01;
}
// PLD device check. Returns {state:'ok'|'flag'|'fail', over:Number} for a w/PLD discharge vs setpoint.
function _pldDeviceCheck(disW, setpoint){
  if(isNaN(disW) || isNaN(setpoint) || setpoint<=0) return {state:'ok', over:0};
  var over = disW - setpoint;
  if(over <= 0)  return {state:'ok',   over:over};
  if(over <= 3)  return {state:'flag', over:over};
  return {state:'fail', over:over};
}
function _pldSetting(){ var e=document.getElementById('pm-pld-setting'); var v=e?parseFloat(e.value):NaN; return (!isNaN(v)&&v>0)?v:null; }
// Effective verdict = manual override if set, else the computed auto verdict.
// override values: undefined/'' /'auto' → use auto ; 'pass'|'fail'|'flag' → use override.
// For ROLLUP, 'flag' is treated as not-a-fail (neutral pass).
function _effVerdict(autoV, override){
  if(override==='pass') return 'pass';
  if(override==='fail') return 'fail';
  if(override==='flag') return 'flag';
  return autoV;
}
// Build the per-point override dropdown. canvasKey 'std'|'pld', idx = row index.
function _overrideDropdown(scope, idx, current){
  var cur = current||'auto';
  return '<select class="fp-override" data-scope="'+scope+'" data-idx="'+idx+'" onchange="_setVerdictOverride(\''+scope+'\','+idx+',this.value)" '
    + 'title="Auto = computed NFPA 20 verdict. Override to set this point by judgment (sticky).">'
    + '<option value="auto"'+(cur==='auto'?' selected':'')+'>Auto</option>'
    + '<option value="pass"'+(cur==='pass'?' selected':'')+'>PASS</option>'
    + '<option value="fail"'+(cur==='fail'?' selected':'')+'>FAIL</option>'
    + '<option value="flag"'+(cur==='flag'?' selected':'')+'>⚑ Flag</option>'
    + '</select>';
}
function _setVerdictOverride(scope, idx, val){
  var rows = (scope==='pld') ? pldData : stdData;
  if(!rows[idx]) return;
  rows[idx][scope==='pld'?'overPld':'overStd'] = (val==='auto'?'':val);
  if(scope==='pld'){ if(typeof updatePldCalcCells==='function') updatePldCalcCells(idx); if(typeof refreshFigPld==='function') refreshFigPld(); if(typeof refreshFigPldNet==='function') refreshFigPldNet(); }
  else { if(typeof updateStdCalcCells==='function') updateStdCalcCells(idx); if(typeof refreshFig3pt==='function') refreshFig3pt(); if(typeof refreshFigNet3pt==='function') refreshFigNet3pt(); }
  if(typeof debounceAutosave==='function') debounceAutosave();
}

function _calcFlowPoint(row){
  var suc=parseFloat(row.suction), dis=parseFloat(row.discharge), rpm=parseFloat(row.rpm);
  var plac=parseFloat(row.placard), bf=parseFloat(row.bfUp);
  var rated=_ratedRpm();
  var net=(!isNaN(suc)&&!isNaN(dis))?(dis-suc):null;
  // adjusted net needs recorded rpm AND rated rpm; if no rpm pair, adjusted falls back to recorded
  var adj=(net!=null&&!isNaN(rpm)&&rpm>0&&rated)?net*Math.pow(rated/rpm,2):net;
  // NFPA 20 gate (0/100/150% only), vs rated net = placard@100%
  var ratedNet=_ratedNetFrom(stdData);
  var gate=_nfpa20Gate(row.pct, adj, ratedNet);
  var autoVerdict = gate;   // 'pass'|'fail'|'na' (na on non-gate points or missing data)
  var effVerdict = _effVerdict(autoVerdict, row.overStd);
  // §14.2.4.2 ±1% certified-curve flag (all points, vs own placard) — flag only
  var curveFlag = _curveDevOver1pct(adj, plac);
  // advisory flags (do NOT drive verdict)
  var flags=[];
  if(curveFlag && adj!=null && !isNaN(plac)) flags.push('Curve match: adj net '+adj.toFixed(0)+' psi vs placard '+plac.toFixed(0)+' psi — outside \u00B11% gauge accuracy (NFPA 20 \u00A714.2.4.2)');
  var npsh=parseFloat(npshPsi);
  if(!isNaN(suc)&&!isNaN(npsh)&&npsh>0&&suc<npsh) flags.push('Suction &lt; NPSH ('+npsh+' psi) — supply/cavitation concern');
  if(!isNaN(bf)&&bf<20) flags.push('Backflow upstream &lt; 20 psi');
  var sr=_sysRating();
  if((row.pct==='0%')&&net!=null&&!isNaN(suc)&&sr&&(net+suc)>sr){
    flags.push('Churn over-pressure: net churn + suction ('+(net+suc).toFixed(0)+' psi) &gt; system rating ('+sr+' psi) — NFPA 20 \u00A74.7.7.1');
  }
  return {net:net, adj:adj, ratedNet:ratedNet, gate:gate, curveFlag:curveFlag,
          flags:flags, override:row.overStd||'', autoVerdict:autoVerdict, verdict:effVerdict};
}

function renderStdTable() {
  const host = document.getElementById('std-cards');
  if(!host) return;
  // banner
  var rated=_ratedRpm();
  var bn=document.getElementById('std-fp-banner');
  if(bn) bn.innerHTML = '<b>Rated speed: '+(rated?rated+' RPM':'set rated RPM above')+'</b> &nbsp;·&nbsp; '
    + 'Adjusted net = recorded net × (rated ÷ recorded RPM)² (NFPA affinity). '
    + 'NFPA 20 acceptance: churn (0%) \u2264 140% rated · rated (100%) \u2265 100% · peak (150%) \u2265 65% rated, vs placard net @ 100%. '
    + 'Each point also flagged (\u2691) if outside \u00B11% of its placard (\u00A714.2.4.2 gauge accuracy). '
    + 'Use the per-point dropdown to override a verdict by judgment.';
  host.innerHTML='';
  stdData.forEach((row, i) => {
    const r=_calcFlowPoint(row);
    const _eff=r.verdict;
    const vtxt=_eff==='pass'?'✓ PASS':_eff==='fail'?'✗ FAIL':_eff==='flag'?'⚑ FLAG':'—';
    const _manual=(r.override==='pass'||r.override==='fail'||r.override==='flag');
    const hasBF = (row.bfUp!==''&&row.bfUp!=null) || (row.bfDown!==''&&row.bfDown!=null);
    const flagsHtml='<div class="fp-flags" id="std-flags-'+i+'"'+(r.flags.length?'':' style="display:none;"')+'>'+
      (r.flags.length?r.flags.map(f=>'<div class="fp-flag">⚠ '+f+'</div>').join(''):'')+'</div>';
    // shared header: spine | segtag | Suct | Disch | RPM | end
    const header = `<div></div><div></div><div class="fp-hdr">Suct</div><div class="fp-hdr">Disch</div><div class="fp-hdr">RPM</div><div class="fp-hdr"></div>`;
    // single measured line (3-point is w/o-PLD by definition); governing = Net
    const measLine = `<div class="fp-spine wo"></div><div class="fp-segtag wo">Meas.</div>
         <input type="number" value="${row.suction||''}" placeholder="psi" data-field="suction" data-idx="${i}" data-tbl="std">
         <input type="number" value="${row.discharge||''}" placeholder="psi" data-field="discharge" data-idx="${i}" data-tbl="std">
         <input type="number" value="${row.rpm||''}" placeholder="RPM" data-field="rpm" data-idx="${i}" data-tbl="std">
         <div class="fp-endval gov" id="std-end-${i}"><span class="el">Net</span><span class="ev">—</span></div>`;
    const bfBlock = hasBF
      ? `<div class="fp-bf" id="std-bf-${i}">
           <div class="bfcell"><label>BF Up</label><input type="number" value="${row.bfUp||''}" placeholder="psi" data-field="bfUp" data-idx="${i}" data-tbl="std"></div>
           <div class="bfcell"><label>BF Down</label><input type="number" value="${row.bfDown||''}" placeholder="psi" data-field="bfDown" data-idx="${i}" data-tbl="std"></div>
           <button type="button" class="bftoggle bfremove" onclick="_stdHideBF(${i})" title="Remove backflow readings">✕</button>
         </div>`
      : `<div class="fp-bf" id="std-bf-${i}"><button type="button" class="bftoggle" onclick="_stdShowBF(${i})">+ Backflow readings</button></div>`;
    const d=document.createElement('div'); d.className='fp-card'; d.id='std-card-'+i;
    d.innerHTML=`
      <div class="fp-head">
        <div class="pt">${row.pct} Flow <small>${row.label} · ${row.flow!==null&&row.flow!==''?row.flow+' gpm':'— gpm'}</small></div>
        <div class="right">
          ${_flowPhotoIcon('std',i)}
          <span class="fp-verdict ${_eff}${_manual?' manual':''}" id="std-verdict-${i}"><span class="fp-v-txt">${vtxt}</span>${_overrideDropdown('std', i, r.override||'auto')}</span>
        </div>
      </div>
      <div class="fp-strip">
        <div class="fp-refline">
          <span class="ri"><b>Flow</b><input type="number" value="${row.flow!==null&&row.flow!==''?row.flow:''}" placeholder="gpm" data-field="flow" data-idx="${i}" data-tbl="std"></span>
          <span class="ri"><b>Cutsheet</b><input type="number" value="${row.cutsheet||''}" placeholder="psi" data-field="cutsheet" data-idx="${i}" data-tbl="std"></span>
          <span class="ri"><b>Placard</b><input type="number" value="${row.placard||''}" placeholder="psi" data-field="placard" data-idx="${i}" data-tbl="std"></span>
        </div>
        <div class="fp-grid">${header}${measLine}</div>
        ${bfBlock}
      </div>
      ${flagsHtml}`;
    host.appendChild(d);
    updateStdCalcCells(i);
  });
}
// S235: BF reveal/remove for 3-point flow points (render-only; clears data on remove)
function _stdShowBF(i){
  const bf=document.getElementById('std-bf-'+i); if(!bf) return;
  const row=stdData[i]||{};
  bf.innerHTML='<div class="bfcell"><label>BF Up</label><input type="number" value="'+(row.bfUp||'')+'" placeholder="psi" data-field="bfUp" data-idx="'+i+'" data-tbl="std"></div>'+
    '<div class="bfcell"><label>BF Down</label><input type="number" value="'+(row.bfDown||'')+'" placeholder="psi" data-field="bfDown" data-idx="'+i+'" data-tbl="std"></div>'+
    '<button type="button" class="bftoggle bfremove" onclick="_stdHideBF('+i+')" title="Remove backflow readings">✕</button>';
}
function _stdHideBF(i){
  if(stdData[i]){ stdData[i].bfUp=''; stdData[i].bfDown=''; }
  const bf=document.getElementById('std-bf-'+i); if(!bf) return;
  bf.innerHTML='<button type="button" class="bftoggle" onclick="_stdShowBF('+i+')">+ Backflow readings</button>';
  if(typeof updateStdCalcCells==='function') updateStdCalcCells(i);
}

// Set left offset for 2nd sticky column based on 1st column width
function fixStickyColumns(){
  document.querySelectorAll('.sticky-cols').forEach(function(tbl){
    var firstTh=tbl.querySelector('thead th:first-child');
    if(!firstTh||!firstTh.offsetWidth){
      // Table not visible yet — retry
      setTimeout(fixStickyColumns,200);
      return;
    }
    var w=firstTh.offsetWidth;
    tbl.querySelectorAll('thead th:nth-child(2),tbody td:nth-child(2)').forEach(function(cell){cell.style.left=w+'px';});
  });
}
window.addEventListener('resize',function(){setTimeout(fixStickyColumns,100);setTimeout(function(){if(typeof renderSafetyMargin3pt==='function')renderSafetyMargin3pt();if(typeof renderSafetyMarginPld==='function')renderSafetyMarginPld();},160);});

// ── Flow-photo modal → lib/ui/flowPhotoModal.js (S500). Shared with beta build; edit THERE. ──
// ════════════════════════════════════════════════════════════════════════════
// S366: SHARED "reuse an existing photo" picker — usable from ANY photo surface.
// Renders the report's photos in a standalone overlay; on pick, resolves the source
// photo's BYTES into a File (fetching from R2 if needed — GET is unauthenticated) and
// hands that File to the caller. The caller routes it through the surface's OWN existing
// add-file path (handleFiles / _recAddFile / ...), so the new photo gets its OWN id +
// OWN R2 key + IDB save via proven code — never borrows the source R2 URL (S155 rule).
// ════════════════════════════════════════════════════════════════════════════
function _photoBytesToFile(srcPhoto, cb){
  if(!srcPhoto){ cb(null); return; }
  function _toFile(dataUrl){
    try{
      var parts=dataUrl.split(','); var mime=(parts[0].match(/:(.*?);/)||[])[1]||'image/jpeg';
      var bin=atob(parts[1]); var n=bin.length; var u8=new Uint8Array(n);
      while(n--) u8[n]=bin.charCodeAt(n);
      var name=srcPhoto.n||('gallery_'+Date.now()+'.jpg');
      cb(new File([u8], name, {type:mime}));
    }catch(e){ cb(null); }
  }
  if(srcPhoto.d){ _toFile(srcPhoto.d); return; }
  if(srcPhoto.r2Url){
    fetch(srcPhoto.r2Url).then(function(r){return r.blob();}).then(function(b){
      var fr=new FileReader(); fr.onload=function(){ _toFile(fr.result); }; fr.readAsDataURL(b);
    }).catch(function(){ if(typeof showToast==='function') showToast('Could not load that photo'); cb(null); });
    return;
  }
  cb(null);
}
var _reusePickerCb=null, _reusePickerItems=[];
function _openPhotoReusePicker(onPickFile, opts){
  opts=opts||{};
  _closePhotoReusePicker();
  var all=(typeof _collectAllPhotos==='function')?_collectAllPhotos():[];
  // de-dupe by id; skip ids already on the excluded list (the target's current photos)
  var excl={}; (opts.excludeIds||[]).forEach(function(id){ if(id) excl[id]=1; });
  var seen={}, items=[];
  all.forEach(function(it){
    var p=it.photo; if(!p) return; var key=p.id||it.src; if(!key||seen[key]) return; seen[key]=1;
    if(p.id && excl[p.id]) return;
    if(!(p.d||p.r2Url)) return;
    items.push(it);
  });
  _reusePickerItems=items; _reusePickerCb=onPickFile;
  var ov=document.createElement('div'); ov.id='reuse-picker-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(16,20,30,.62);z-index:99994;display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;padding:18px;';
  var isDark=document.body.classList.contains('dark-mode');
  var bg=isDark?'#161420':'#fff', fg=isDark?'#f4f3f6':'#1B1A22', fg2=isDark?'#a09aa8':'#5E5B68';
  var h='<div style="background:'+bg+';color:'+fg+';border-radius:14px;max-width:720px;width:100%;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.45);overflow:hidden;">';
  h+='<div style="padding:16px 22px;border-bottom:1px solid '+(isDark?'rgba(255,255,255,.1)':'#E3E1E8')+';display:flex;align-items:center;gap:10px;">'
    +'<b style="font-size:16px;">Reuse a photo from this report</b>'
    +'<span style="flex:1;"></span>'
    +'<button onclick="_closePhotoReusePicker()" style="background:none;border:none;font-size:20px;cursor:pointer;color:'+fg2+';">✕</button></div>';
  h+='<div style="flex:1 1 auto;overflow-y:auto;padding:16px 22px;">';
  if(!items.length){ h+='<div style="text-align:center;color:'+fg2+';padding:40px 0;">No other photos in this report yet.</div>'; }
  else {
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;">';
    items.forEach(function(it,k){
      h+='<div onclick="_pickReusePhoto('+k+')" style="position:relative;cursor:pointer;border-radius:8px;overflow:hidden;border:1.5px solid '+(isDark?'rgba(255,255,255,.14)':'#D8D5DE')+';aspect-ratio:4/3;">'
        +'<img src="'+_phSrc(it.photo)+'" style="width:100%;height:100%;object-fit:cover;display:block;">'
        +(it.badge?'<span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.62);color:#fff;font-size:10px;font-weight:700;padding:2px 5px;">'+it.badge+'</span>':'')
        +'</div>';
    });
    h+='</div>';
  }
  h+='</div></div>';
  ov.innerHTML=h;
  document.body.appendChild(ov);
  _lockBodyScroll();
}
// S369 -> S497: the ref-counted body scroll lock now lives in
// lib/shared/scrollLock.js (the same module FRT's dialogs import). The host
// names stay as delegates so the two call sites (photo reuse picker) are
// untouched; the ref counter lives in the shared module, so a lock taken here
// and an unlock taken here always hit the same counter. Fail-safe: module
// absent -> no lock, page merely stays scrollable behind the overlay.
function _lockBodyScroll(){
  var s=window.ArenconScroll; if(s&&s.lock){ s.lock(); }
}
function _unlockBodyScroll(){
  var s=window.ArenconScroll; if(s&&s.unlock){ s.unlock(); }
}
function _closePhotoReusePicker(){ var ex=document.getElementById('reuse-picker-ov'); if(ex){ ex.remove(); _unlockBodyScroll(); } _reusePickerCb=null; _reusePickerItems=[]; }
function _pickReusePhoto(k){
  var it=_reusePickerItems[k]; var cb=_reusePickerCb;
  if(!it||!it.photo||!cb){ _closePhotoReusePicker(); return; }
  _photoBytesToFile(it.photo, function(file){
    _closePhotoReusePicker();
    if(file && typeof cb==='function') cb(file);
    else if(typeof showToast==='function') showToast('Could not copy that photo');
  });
}
// ── Per-surface "reuse from gallery" entry points — route a picked File through each
//    surface's EXISTING add path so copy/compress/own-id/own-R2-key all stay proven. ──
function _galleryReuseChecklist(id){
  var cur=(clState[id]&&clState[id].photos)||[];
  _openPhotoReusePicker(function(file){ handleFiles(id, [file], false); }, {excludeIds:cur.map(function(p){return p&&p.id;})});
}
function _galleryReuseRecord(kind){
  var cur=(typeof recordPhotos!=='undefined'?recordPhotos:[]).filter(function(p){return p&&p.kind===kind;});
  _openPhotoReusePicker(function(file){ _recAddFile(file, kind); }, {excludeIds:cur.map(function(p){return p&&p.id;})});
}
// S342: gallery-reuse for the flow-test evidence box (added Gallery parity; the
// flow box previously had only Camera + Upload).
function _galleryReuseFlowTest(isPld){
  _openPhotoReusePicker(function(file){
    if(isPld){ if(typeof _pfFlowTestPld==='function') _pfFlowTestPld(file); else if(typeof _pfFlowTest==='function') _pfFlowTest(file); }
    else { if(typeof _pfFlowTest==='function') _pfFlowTest(file); }
    if(typeof _renderRecordZones==='function') _renderRecordZones();
  }, {});
}
// ── Gallery-reuse defic wrappers → lib/ui/deficiencies.js (S500) ──
function _galleryReuseSketch(uid){
  _openPhotoReusePicker(function(file){
    var r=new FileReader(); r.onload=function(e){ _loadSketchMarkupImg(uid, e.target.result); }; r.readAsDataURL(file);
  }, {});
}
// ── Flow-photo modal (gallery/render/open/close) → lib/ui/flowPhotoModal.js (S500) ──

// ═══════════════════════════════════════════════════════════════════════════
// S355: FLOW CHART & CALIBRATED EQUIPMENT modal — same UX as the gauge/RPM modal
// but with 4 category pills and NO PLD toggle (equipment is the same regardless of
// PLD). Operates on the existing flowTestPhotos (3-pt) / flowTestPhotosPld (7-pt)
// arrays. Each photo carries a `tag` of: gauge | calib | equip | flow_chart.
// Legacy untagged flow photos are treated as 'flow_chart'. Markup uses the shared
// lightbox (no new engine). Canonical S354 deletion model applies throughout.
var _FLOWEQ_CATS=[
  {k:'gauge',      label:'Gauges',                  short:'Gauge', hint:'calibrated gauges (usually \u22653)'},
  {k:'calib',      label:'Calibration Certificate', short:'Calib', hint:'calibration cert / serial'},
  {k:'equip',      label:'Flow Test Equipment',     short:'Equip', hint:'play pipe / Hose Monster(s)'},
  {k:'flow_chart', label:'Paired Flow Chart',       short:'Flow',  hint:'mark up the pitot pressure flowed'}
];
var _FLOWEQ_COLORS={gauge:'var(--info)',calib:'var(--yes)',equip:'var(--warn)',flow_chart:'var(--gr-rpm)'};
function _floweqColor(k){ return _FLOWEQ_COLORS[k]||'var(--silver)'; }
function _floweqLabel(k){ for(var i=0;i<_FLOWEQ_CATS.length;i++){ if(_FLOWEQ_CATS[i].k===k) return _FLOWEQ_CATS[i].label; } return 'Paired Flow Chart'; }
function _floweqShort(k){ for(var i=0;i<_FLOWEQ_CATS.length;i++){ if(_FLOWEQ_CATS[i].k===k) return _FLOWEQ_CATS[i].short; } return 'Flow'; }
function _floweqIsCat(k){ for(var i=0;i<_FLOWEQ_CATS.length;i++){ if(_FLOWEQ_CATS[i].k===k) return true; } return false; }
// normalize a tag: anything not one of the 4 known cats → 'flow_chart' (legacy)
function _floweqTag(p){ var t=p&&p.tag; return _floweqIsCat(t)?t:'flow_chart'; }

var _flowEqTbl=null;            // 'std' | 'pld'
var _flowEqActiveCat='gauge';
function _flowEqArr(){ return _flowEqTbl==='pld' ? flowTestPhotosPld : flowTestPhotos; }
function _flowEqSetCat(k){ _flowEqActiveCat=k; _renderFlowEquipModal(); }

function _flowEqAddPhotoObj(dataUrl, name){
  var arr=_flowEqArr(); if(!arr) return;
  var _ph=ArcPhoto.mint(dataUrl, name||'photo.jpg', {extra:{tag:_flowEqActiveCat||'flow_chart', caption:''}});
  arr.push(_ph);
  if(typeof _renderRecordZones==='function') _renderRecordZones();
  _renderFlowEquipModal();
  if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
  if(typeof debounceAutosave==='function') debounceAutosave();
}
function _flowEqReadFile(file){
  if(!file || !file.type || file.type.indexOf('image/')!==0) return;
  var r=new FileReader();
  r.onload=function(ev){
    if(typeof compressImage==='function') compressImage(ev.target.result,1600,0.85,function(c){ _flowEqAddPhotoObj(c,file.name); });
    else _flowEqAddPhotoObj(ev.target.result,file.name);
  };
  r.readAsDataURL(file);
}
function _flowEqCamera(){ if(typeof _camBurst==='function'){ _camBurst(function(f){ _flowEqReadFile(f); }); return; } var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true; inp.onchange=function(){ Array.from(inp.files).forEach(_flowEqReadFile); }; inp.click(); }
function _flowEqUpload(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true; inp.onchange=function(){ Array.from(inp.files).forEach(_flowEqReadFile); }; inp.click(); }
function _flowEqGalleryReuse(){ _openPhotoReusePicker(function(file){ _flowEqReadFile(file); }, {}); }
function _flowEqDrop(e){ e.preventDefault(); var z=e.currentTarget; if(z)z.classList.remove('drag-over'); Array.from(e.dataTransfer.files).forEach(_flowEqReadFile); }
function _flowEqDelete(j){
  var arr=_flowEqArr(); if(!arr||!arr[j])return; var p=arr[j];
  if(p.id){ deletePhotoEverywhere({photoId:p.id}, function(){ _renderFlowEquipModal(); }); return; }
  _aConfirm('Move this photo to Recently Deleted? You can restore it for '+_TRASH_RETENTION_DAYS+' days.', function(){
    if(typeof _markPhotoDeleted==='function') _markPhotoDeleted(p, {force:true});
    if(typeof _renderRecordZones==='function') _renderRecordZones();
    _renderFlowEquipModal();
    if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
    if(typeof debounceAutosave==='function') debounceAutosave();
  },'Delete');
}
function _flowEqLightbox(j){ var arr=_flowEqArr(); if(!arr)return; openLightbox(arr, j, {renderer:_renderFlowEquipModal}); }
function _flowEqDownload(j){ var arr=_flowEqArr(); if(!arr||!arr[j])return; _dslDownloadPhoto(arr[j]); }
// ── reassign a photo to a different category ──
function _flowEqCloseReassign(){ var ex=document.getElementById('fpm-reassign'); if(ex) ex.remove(); }
function _flowEqSetTag(j, cat){
  var arr=_flowEqArr(); if(!arr||!arr[j])return;
  arr[j].tag=cat;
  _flowEqCloseReassign();
  _renderFlowEquipModal();
  if(typeof _renderRecordZones==='function') _renderRecordZones();
  if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
  if(typeof debounceAutosave==='function') debounceAutosave();
}
function _flowEqOpenReassign(j, btn){
  _flowEqCloseReassign();
  var card=btn.closest('.fpm-card'); if(!card) return;
  var pop=document.createElement('div'); pop.id='fpm-reassign'; pop.className='fpm-reassign';
  var h='';
  _FLOWEQ_CATS.forEach(function(c){
    h+='<button onclick="_flowEqSetTag('+j+',\''+c.k+'\')"><span class="rd-dot" style="background:'+_floweqColor(c.k)+'"></span>'+c.label+'</button>';
  });
  pop.innerHTML=h;
  card.appendChild(pop);
  var cr=card.getBoundingClientRect(), br=btn.getBoundingClientRect();
  pop.style.top=(br.bottom - cr.top + card.scrollTop + 4)+'px';
  pop.style.left=(Math.max(6, br.left - cr.left - 30))+'px';
}
function _renderFlowEquipModal(){
  var host=document.getElementById('flow-equip-modal'); if(!host) return;
  if(!_flowEqTbl){ host.style.display='none'; return; }
  var arr=_flowEqArr()||[];
  var ttl='Flow Chart &amp; Calibrated Equipment'+(_flowEqTbl==='pld'?' (7-pt)':' (3-pt)');
  var h='<div class="fpm-backdrop" onclick="closeFlowEquip()"></div>';
  h+='<div class="fpm-card" role="dialog" aria-label="Flow chart and calibrated equipment photos">';
  h+='<div class="fpm-head"><span>'+ttl+'</span><button type="button" class="fpm-x" onclick="event.stopPropagation();closeFlowEquip()" title="Close">✕</button></div>';
  // category selector pills
  h+='<div class="fpm-rdrow">';
  _FLOWEQ_CATS.forEach(function(c){
    var on=(_flowEqActiveCat===c.k), col=_floweqColor(c.k);
    h+='<button class="fpm-rd'+(on?' active':'')+'" '+(on?'style="background:'+col+'"':'')+' onclick="_flowEqSetCat(\''+c.k+'\')">'
      +'<span class="rd-dot" style="background:'+(on?'#fff':col)+'"></span>'+c.label+'</button>';
  });
  h+='</div>';
  // capture zone
  var activeHint=''; _FLOWEQ_CATS.forEach(function(c){ if(c.k===_flowEqActiveCat) activeHint=c.hint; });
  h+='<div class="photo-zone-compact fpm-zone ev-clickable" onclick="_boxUp(event,function(){_flowEqUpload()})" ondragover="event.preventDefault();this.classList.add(\'drag-over\');" ondragleave="this.classList.remove(\'drag-over\');" ondrop="_flowEqDrop(event)">';
  h+='<span>Drag &amp; drop — tagged <b>'+_floweqLabel(_flowEqActiveCat)+'</b>'+(activeHint?(' · '+activeHint):'')+'</span>';
  h+='<div class="pz-row"><button class="pz-camera" onclick="event.stopPropagation();_flowEqCamera()">📷 Camera</button><button class="pz-gallery" onclick="event.stopPropagation();_flowEqGalleryReuse()">🖼 Gallery</button></div>';
  h+='</div>';
  // grouped thumbs by category
  var live=arr.filter(function(p){return !_isPhotoDeleted(p);});
  if(live.length){
    _FLOWEQ_CATS.forEach(function(c){
      var col=_floweqColor(c.k);
      h+='<div class="fpm-grp"><div class="fpm-grp-hd" style="border-left-color:'+col+'"><span class="gh-dot" style="background:'+col+'"></span>'+c.label+'</div>';
      h+='<div class="fpm-thumbs">'; var any=false;
      arr.forEach(function(p,j){
        if(_isPhotoDeleted(p)) return;
        if(_floweqTag(p)!==c.k) return;
        any=true;
        h+='<div class="fpm-thumb"><img src="'+_photoSrc(p)+'" onclick="_flowEqLightbox('+j+')">'
          +'<button class="fpm-del" onclick="_flowEqDelete('+j+')" title="Remove">✕</button>'
          +'<button class="fpm-dl" onclick="event.stopPropagation();_flowEqDownload('+j+')" title="Download">⬇</button>'
          +'<button class="fpm-move" onclick="event.stopPropagation();_flowEqOpenReassign('+j+',this)" title="Move to another category">⇄</button></div>';
      });
      h+='</div>';
      if(!any){ h+='<div class="fpm-grp-empty">— no photos</div>'; }
      h+='</div>';
    });
  } else {
    h+='<div class="fpm-empty">No flow chart or equipment photos yet.</div>';
  }
  h+='</div>';
  host.innerHTML=h;
  host.style.display='block';
  document.body.classList.add('fpm-open');
  // S342d: guaranteed close binding (see flow-photo modal note).
  var _ex=host.querySelector('.fpm-x');
  if(_ex) _ex.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); closeFlowEquip(); });
  var _eb=host.querySelector('.fpm-backdrop');
  if(_eb) _eb.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); closeFlowEquip(); });
}
function openFlowEquipModal(tbl){
  _flowEqTbl = (tbl==='pld') ? 'pld' : 'std';
  _flowEqActiveCat='gauge';
  var host=document.getElementById('flow-equip-modal');
  if(!host){ host=document.createElement('div'); host.id='flow-equip-modal'; document.body.appendChild(host); }
  if(!document.body.classList.contains('fpm-open')){
    _fpmScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = (-_fpmScrollY) + 'px';
  }
  _renderFlowEquipModal();
  document.addEventListener('keydown', _flowEqEsc);
}
function _flowEqEsc(e){ if(e.key==='Escape'){ closeFlowEquip(); } }
function closeFlowEquip(){
  _flowEqCloseReassign();
  document.body.classList.remove('fpm-open');
  document.body.style.top='';
  window.scrollTo(0, _fpmScrollY||0);
  var host=document.getElementById('flow-equip-modal'); if(host){ host.style.display='none'; host.innerHTML=''; }
  document.removeEventListener('keydown', _flowEqEsc);
  _flowEqTbl=null;
}

// NPSH (psi) — 3-Point tab. Recalc std flow rows so suction<NPSH warnings refresh live.
function setNpsh(v){
  npshPsi = v;
  if(typeof stdData!=='undefined') stdData.forEach(function(_,i){ if(typeof updateStdCalcCells==='function') updateStdCalcCells(i); });
  if(typeof debounceAutosave==='function') debounceAutosave();
}
// NPSH (psi) — 7-Point PLD tab (independent value). Recalc pld flow rows only.
function setNpshPld(v){
  npshPsiPld = v;
  if(typeof pldData!=='undefined') pldData.forEach(function(_,i){ if(typeof updatePldCalcCells==='function') updatePldCalcCells(i); });
  if(typeof debounceAutosave==='function') debounceAutosave();
}
function updateStdCalcCells(i) {
  const row = stdData[i];
  if(!row) return;
  const r = _calcFlowPoint(row);
  const endEl = document.getElementById('std-end-'+i);
  const vEl   = document.getElementById('std-verdict-'+i);
  const flEl  = document.getElementById('std-flags-'+i);
  if(endEl){
    var netTxt = r.net!=null ? r.net.toFixed(0) : '\u2014';
    var adjTxt = r.adj!=null ? r.adj.toFixed(0) : '\u2014';
    // Readout now shows adjusted net vs the NFPA 20 gate target for this point (if it's a gate),
    // or just the adjusted net for informational points.
    var gateTxt='', okStd=true;
    if(r.ratedNet!=null && _isGatePct(row.pct)){
      if(row.pct==='0%'){ gateTxt='\u2264 '+(r.ratedNet*1.40).toFixed(0)+' (140%)'; okStd=(r.adj!=null&&r.adj<=r.ratedNet*1.40); }
      else if(row.pct==='100%'){ gateTxt='\u2265 '+(r.ratedNet*1.00).toFixed(0)+' (100%)'; okStd=(r.adj!=null&&r.adj>=r.ratedNet*1.00); }
      else if(row.pct==='150%'){ gateTxt='\u2265 '+(r.ratedNet*0.65).toFixed(0)+' (65%)'; okStd=(r.adj!=null&&r.adj>=r.ratedNet*0.65); }
    }
    endEl.innerHTML = '<span class="el">Net</span><span class="ev">'+netTxt+'</span>'+
      '<span class="ea" title="Adjusted net (speed-corrected) vs NFPA 20 acceptance gate">'+
      '<span class="ea-adj '+(okStd?'pass':'fail')+'">adj '+adjTxt+'</span>'+(gateTxt?'<span class="ea-req">req '+gateTxt+'</span>':'')+'</span>';
  }
  if(vEl){
    // verdict chip shows EFFECTIVE status + the override dropdown for manual control
    var eff=r.verdict;
    var vtxt = eff==='pass'?'\u2713 PASS':eff==='fail'?'\u2717 FAIL':eff==='flag'?'\u2691 FLAG':'\u2014';
    var manual = (r.override==='pass'||r.override==='fail'||r.override==='flag');
    vEl.className = 'fp-verdict '+eff+(manual?' manual':'');
    vEl.innerHTML = '<span class="fp-v-txt">'+vtxt+'</span>'+_overrideDropdown('std', i, r.override||'auto');
  }
  if(flEl){
    if(r.flags.length){ flEl.style.display=''; flEl.innerHTML = r.flags.map(f=>'<div class="fp-flag">⚠ '+f+'</div>').join(''); }
    else { flEl.style.display='none'; flEl.innerHTML=''; }
  }
}

// Rows that require w/o PLD testing (0%, 100%, 150% only per NFPA 20)
const PLD_NO_SKIP = new Set([1,2,3,5]); // indices of 25%, 50%, 75%, 125% — skip w/o PLD columns

// S227: Option B — one card per flow point, side-by-side segments (Reference | w/ PLD | w/o PLD).
// Replaces the old sticky-column table. Same data model / data-field names / calc-cell IDs, so the
// generic input writeback (data-tbl="pld"), updatePldCalcCells, charts, and photos are unchanged.
// w/o PLD is tested on 0/100/150% ONLY (rows NOT in PLD_NO_SKIP); skipped rows show a "not required" note.
function renderPldTable() {
  const host = document.getElementById('pld-cards');
  if(!host) return;
  // banner (mirrors the 3-pt std banner)
  var ratedB=_ratedRpmPld();
  var bn=document.getElementById('pld-fp-banner');
  if(bn) bn.innerHTML = '<b>Rated speed: '+(ratedB?ratedB+' RPM':'set rated RPM above')+'</b> &nbsp;·&nbsp; '
    + 'NFPA 20 acceptance on w/o-PLD adjusted net: churn (0%) \u2264 140% rated · rated (100%) \u2265 100% · peak (150%) \u2265 65% rated, vs placard net @ 100%. '
    + 'PLD device check: w/PLD discharge \u2264 PLD setting (\u2264+3 psi flagged, &gt;+3 psi fails). '
    + 'Each point flagged (\u2691) if outside \u00B11% of placard (\u00A714.2.4.2). Per-point dropdown overrides verdict. '
    + '<b>w/o PRV &amp; PLD</b> tested at 0%, 100%, 150% only; <b>w/ PLD</b> at all 7 points.';
  host.innerHTML='';
  pldData.forEach((row, i) => {
    const skipNoPLD = PLD_NO_SKIP.has(i); // skipped rows: no w/o PLD segment (25/50/75/125%)
    const v = updatePldVerdictObj(row, i);
    const _peff=v.verdict;
    const vtxt = _peff==='pass'?'✓ PASS':_peff==='fail'?'✗ FAIL':_peff==='flag'?'⚑ FLAG':'—';
    const _pmanual=(v.override==='pass'||v.override==='fail'||v.override==='flag');
    const labelTxt = i===0?'Churn':(row.pct==='150%'?'Peak':(row.pct==='100%'?'Rated':''));
    const flowTxt = (i===0)?'0 gpm':(row.flow!==''&&row.flow!=null?row.flow+' gpm':'— gpm');
    const hasBF = (row.bfUp!==''&&row.bfUp!=null) || (row.bfDown!==''&&row.bfDown!=null);
    // shared header row: spine | segtag | Suct | Disch | RPM | end
    const header = `<div></div><div></div><div class="fp-hdr">Suct</div><div class="fp-hdr">Disch</div><div class="fp-hdr">RPM</div><div class="fp-hdr"></div>`;
    // w/o PLD line (governing = Net) or skip note
    const woLine = skipNoPLD
      ? `<div class="fp-spine wo"></div><div class="fp-segtag wo">w/o<br>PLD</div><div class="fp-skip-note">Not required at ${row.pct} (0%, 100%, 150% only)</div>`
      : `<div class="fp-spine wo"></div><div class="fp-segtag wo">w/o<br>PLD</div>
         <input type="number" value="${row.suc_no||''}" placeholder="psi" data-field="suc_no" data-idx="${i}" data-tbl="pld">
         <input type="number" value="${row.dis_no||''}" placeholder="psi" data-field="dis_no" data-idx="${i}" data-tbl="pld">
         <input type="number" value="${row.rpm_no||''}" placeholder="RPM" data-field="rpm_no" data-idx="${i}" data-tbl="pld">
         <div class="fp-endval gov" id="pld-end-no-${i}"><span class="el">Net</span><span class="ev">—</span></div>`;
    // w/ PLD line (Discharge governing-styled; Net held)
    const wLine = `<div class="fp-spine w"></div><div class="fp-segtag w">w/<br>PLD</div>
         <input type="number" value="${row.suc_w||''}" placeholder="psi" data-field="suc_w" data-idx="${i}" data-tbl="pld">
         <input type="number" class="gov" value="${row.dis_w||''}" placeholder="psi" data-field="dis_w" data-idx="${i}" data-tbl="pld">
         <input type="number" value="${row.rpm_w||''}" placeholder="RPM" data-field="rpm_w" data-idx="${i}" data-tbl="pld">
         <div class="fp-held" id="pld-end-w-${i}"><span class="hl">Net held</span><span class="hv">—</span></div>`;
    // BF Up/Down: show inline only when populated; otherwise a small add toggle
    const bfBlock = hasBF
      ? `<div class="fp-bf" id="pld-bf-${i}">
           <div class="bfcell"><label>BF Up</label><input type="number" value="${row.bfUp||''}" placeholder="psi" data-field="bfUp" data-idx="${i}" data-tbl="pld"></div>
           <div class="bfcell"><label>BF Down</label><input type="number" value="${row.bfDown||''}" placeholder="psi" data-field="bfDown" data-idx="${i}" data-tbl="pld"></div>
           <button type="button" class="bftoggle bfremove" onclick="_pldHideBF(${i})" title="Remove backflow readings">✕</button>
         </div>`
      : `<div class="fp-bf" id="pld-bf-${i}"><button type="button" class="bftoggle" onclick="_pldShowBF(${i})">+ Backflow readings</button></div>`;
    const d=document.createElement('div'); d.className='fp-card'; d.id='pld-card-'+i;
    d.innerHTML=`
      <div class="fp-head">
        <div class="pt">${row.pct} Flow <small>${labelTxt?labelTxt+' · ':''}${flowTxt}</small></div>
        <div class="right">
          ${_flowPhotoIcon('pld',i)}
          <span class="fp-verdict ${_peff}${_pmanual?' manual':''}" id="pld-verdict-${i}"><span class="fp-v-txt">${vtxt}</span>${_overrideDropdown('pld', i, v.override||'auto')}</span>
        </div>
      </div>
      <div class="fp-strip">
        <div class="fp-refline">
          <span class="ri ri-flowtag" style="font-weight:700;color:var(--slate);">${i===0?'0':''}${i===0?' gpm':''}</span>
          <span class="ri"><b>Flow</b><input type="number" value="${i===0?'0':(row.flow||'')}" placeholder="gpm" data-field="flow" data-idx="${i}" data-tbl="pld" ${i===0?'readonly style="background:#eef0f4;color:#555;width:58px;"':''}></span>
          <span class="ri"><b>Cutsheet</b><input type="number" value="${row.cutsheet||''}" placeholder="psi" data-field="cutsheet" data-idx="${i}" data-tbl="pld"></span>
          ${skipNoPLD ? '' : `<span class="ri"><b>Placard</b><input type="number" value="${row.placard||''}" placeholder="psi" data-field="placard" data-idx="${i}" data-tbl="pld"></span>`}
        </div>
        <div class="fp-grid">${header}${woLine}${wLine}</div>
        ${bfBlock}
      </div>
      <div class="fp-flags" id="pld-pf-${i}" style="padding:0 14px 11px;">—</div>`;
    host.appendChild(d);
    updatePldCalcCells(i);
  });
}
// S234: which control device is capping the w/ PLD segment (for the held-pill tag)
function _pldCapDevice(){
  var pld=document.getElementById('pm-pld-setting');
  var prv=document.getElementById('pm-reducing-pld');   // pressure reducing valve (PRdV)
  var rel=document.getElementById('pm-relief-pld');      // pressure relief valve
  if(pld && pld.value!=='') return 'PLD';
  if(prv && prv.value!=='') return 'PRdV';
  if(rel && rel.value!=='') return 'PRV';
  return 'PLD';
}
// S234: reveal/remove BF inputs on demand for a flow point
function _pldShowBF(i){
  const bf=document.getElementById('pld-bf-'+i); if(!bf) return;
  const row=pldData[i]||{};
  bf.innerHTML='<div class="bfcell"><label>BF Up</label><input type="number" value="'+(row.bfUp||'')+'" placeholder="psi" data-field="bfUp" data-idx="'+i+'" data-tbl="pld"></div>'+
    '<div class="bfcell"><label>BF Down</label><input type="number" value="'+(row.bfDown||'')+'" placeholder="psi" data-field="bfDown" data-idx="'+i+'" data-tbl="pld"></div>'+
    '<button type="button" class="bftoggle bfremove" onclick="_pldHideBF('+i+')" title="Remove backflow readings">✕</button>';
}
function _pldHideBF(i){
  if(pldData[i]){ pldData[i].bfUp=''; pldData[i].bfDown=''; }
  const bf=document.getElementById('pld-bf-'+i); if(!bf) return;
  bf.innerHTML='<button type="button" class="bftoggle" onclick="_pldShowBF('+i+')">+ Backflow readings</button>';
  if(typeof updatePldCalcCells==='function') updatePldCalcCells(i);
}

// Shared PLD verdict computation — used by on-screen cells AND email export (one source of truth)
function updatePldVerdictObj(row, i){
  const skipNoPLD = (typeof PLD_NO_SKIP!=='undefined') && PLD_NO_SKIP.has(i);
  const netNo = skipNoPLD ? null : (parseFloat(row.dis_no)||0)-(parseFloat(row.suc_no)||0);
  const netW  = (parseFloat(row.dis_w)||0)-(parseFloat(row.suc_w)||0);
  const placard  = parseFloat(row.placard);
  const rated = _ratedRpmPld();
  // SCORED net = w/o-PLD (true pump capability). Skipped rows (25/50/75/125%) have no w/o-PLD
  // reading; they're informational only (not NFPA 20 gates anyway).
  const checkNet = skipNoPLD ? null : netNo;
  const checkRpm = parseFloat(row.rpm_no);
  const adjNet = (checkNet!=null && checkNet && !isNaN(checkRpm) && checkRpm>0 && rated) ? checkNet*Math.pow(rated/checkRpm,2) : checkNet;
  const ratedNet = _ratedNetFrom(pldData);
  // NFPA 20 gate (0/100/150% only) on the w/o-PLD adjusted net
  const gate = _nfpa20Gate(row.pct, adjNet, ratedNet);
  // PLD device check: w/PLD discharge vs PLD setting (every row that has a w/PLD discharge)
  const disW = parseFloat(row.dis_w);
  const pldSet = _pldSetting();
  const pldDev = (!isNaN(disW) && pldSet!=null) ? _pldDeviceCheck(disW, pldSet) : {state:'ok', over:0};
  // §14.2.4.2 ±1% certified-curve flag (vs this row's placard), on the scored adj net
  const curveFlag = _curveDevOver1pct(adjNet, placard);
  // AUTO verdict: gate fail OR PLD device fail → fail; gate pass → pass; else na.
  var autoVerdict = 'na';
  if(pldDev.state==='fail') autoVerdict='fail';
  else if(gate==='fail') autoVerdict='fail';
  else if(gate==='pass') autoVerdict='pass';
  // EFFECTIVE verdict via manual override (sticky, stored on row.overPld)
  var verdict = _effVerdict(autoVerdict, row.overPld);
  return {netNo:netNo, netW:netW, adjNet:adjNet, ratedNet:ratedNet, gate:gate,
          pldDev:pldDev, curveFlag:curveFlag, override:row.overPld||'',
          autoVerdict:autoVerdict, verdict:verdict};
}
function updatePldCalcCells(i) {
  const row = pldData[i];
  const v = updatePldVerdictObj(row, i);
  const noEl = document.getElementById('pld-end-no-'+i);
  const wEl = document.getElementById('pld-end-w-'+i);
  const pfEl = document.getElementById('pld-pf-'+i);
  const vchip = document.getElementById('pld-verdict-'+i);
  // w/o PLD governing chip: Net (recorded) + adjusted + NFPA 20 gate target
  if(noEl && v.netNo !== null){
    var netTxt = v.netNo ? v.netNo.toFixed(1) : '\u2014';
    var adjTxt = (v.adjNet!=null && !isNaN(v.adjNet)) ? v.adjNet.toFixed(1) : '\u2014';
    var gTxt='', okPld=true;
    if(v.ratedNet!=null && _isGatePct(row.pct)){
      if(row.pct==='0%'){ gTxt='\u2264 '+(v.ratedNet*1.40).toFixed(0)+' (140%)'; okPld=(v.adjNet!=null&&v.adjNet<=v.ratedNet*1.40); }
      else if(row.pct==='100%'){ gTxt='\u2265 '+(v.ratedNet*1.00).toFixed(0)+' (100%)'; okPld=(v.adjNet!=null&&v.adjNet>=v.ratedNet*1.00); }
      else if(row.pct==='150%'){ gTxt='\u2265 '+(v.ratedNet*0.65).toFixed(0)+' (65%)'; okPld=(v.adjNet!=null&&v.adjNet>=v.ratedNet*0.65); }
    }
    noEl.innerHTML = '<span class="el">Net</span><span class="ev">'+netTxt+'</span>'+
      '<span class="ea" title="w/o-PLD adjusted net (speed-corrected) vs NFPA 20 acceptance gate">'+
      '<span class="ea-adj '+(okPld?'pass':'fail')+'">adj '+adjTxt+'</span>'+(gTxt?'<span class="ea-req">req '+gTxt+'</span>':'')+'</span>';
  }
  // w/ PLD held pill: device tag + recorded Net (controlled — not scored)
  if(wEl){
    var heldTxt = v.netW ? v.netW.toFixed(1) : '\u2014';
    var dev = _pldCapDevice ? _pldCapDevice() : 'PLD';
    wEl.innerHTML = '<span class="ht">'+dev+'</span><span class="hl">Net held</span><span class="hv">'+heldTxt+'</span>';
  }
  // Card-head verdict chip + manual override dropdown (effective status)
  if(vchip){
    var eff=v.verdict;
    var manual=(v.override==='pass'||v.override==='fail'||v.override==='flag');
    var vtx = eff==='pass'?'\u2713 PASS':eff==='fail'?'\u2717 FAIL':eff==='flag'?'\u2691 FLAG':'\u2014';
    vchip.className = 'fp-verdict '+eff+(manual?' manual':'');
    vchip.innerHTML = '<span class="fp-v-txt">'+vtx+'</span>'+_overrideDropdown('pld', i, v.override||'auto');
  }
  // Advisory warnings (do NOT affect pass/fail) — shown in the flags row beneath the card
  var warns = [];
  // PLD device check result (flag at +1..3 psi over setpoint; >+3 is a FAIL handled by verdict)
  if(v.pldDev && v.pldDev.state==='flag') warns.push('PLD discharge '+v.pldDev.over.toFixed(1)+' psi over setpoint (within +3 psi tolerance) — verify PLD');
  if(v.pldDev && v.pldDev.state==='fail') warns.push('PLD discharge '+v.pldDev.over.toFixed(1)+' psi over setpoint (&gt; +3 psi) — PLD not holding');
  // §14.2.4.2 ±1% certified-curve flag
  if(v.curveFlag && v.adjNet!=null && !isNaN(parseFloat(row.placard))) warns.push('Curve match: adj net '+v.adjNet.toFixed(0)+' psi vs placard '+parseFloat(row.placard).toFixed(0)+' psi — outside \u00B11% gauge accuracy (\u00A714.2.4.2)');
  var bfUp = parseFloat(row.bfUp);
  if(!isNaN(bfUp) && bfUp < 20) warns.push('Backflow &lt; 20 psi');
  var skipNoPLD = (typeof PLD_NO_SKIP!=='undefined') && PLD_NO_SKIP.has(i);
  var sucCheck = parseFloat(skipNoPLD ? row.suc_w : row.suc_no);
  if(isNaN(sucCheck)) sucCheck = parseFloat(row.suc_w);
  var npsh = parseFloat(npshPsiPld);
  if(!isNaN(sucCheck) && !isNaN(npsh) && npsh>0 && sucCheck < npsh) warns.push('Suction &lt; NPSH');
  if(pfEl){
    if(warns.length){ pfEl.style.display=''; pfEl.innerHTML = warns.map(function(w){return '<div class="fp-flag">⚠ '+w+'</div>';}).join(''); }
    else { pfEl.style.display='none'; pfEl.innerHTML=''; }
  }
}

// ══════════════════════════════════════════════════
// PUMP CURVE POINTS
// ══════════════════════════════════════════════════
function renderPumpCurveTable() {
  const tbody = document.getElementById('pump-curve-tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  pumpCurvePoints.forEach((pt, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" value="${pt.flow}" placeholder="gpm" oninput="pumpCurvePoints[${i}].flow=+this.value||'';refreshAllCharts()"></td>
      <td><input type="number" value="${pt.psi}" placeholder="psi" oninput="pumpCurvePoints[${i}].psi=+this.value||'';refreshAllCharts()"></td>
      <td><button class="btn btn-danger btn-sm" onclick="removePumpCurvePoint(${i})" style="padding:3px 8px;font-size:11px;">✕</button></td>`;
    tbody.appendChild(tr);
  });
}
function removePumpCurvePoint(i) { pumpCurvePoints.splice(i,1); renderPumpCurveTable(); refreshAllCharts(); }

// ══════════════════════════════════════════════════
// CHART
// ══════════════════════════════════════════════════

function updateVerdict() {
  const el = document.getElementById('report-verdict');
  if (!el) return;

  // 1. Check all checklist sections
  var allSections = ['s1','s2','s3','s4','s4pld','s5'];
  var hasAnyNo = false;
  var hasAnyResponse = false;
  allSections.forEach(function(sec){
    var srcMap = {s1:S1,s2:S2,s3:S3,s5:S5};
    var items = srcMap[sec];
    if(!items) return;
    items.forEach(function(_,idx){
      var id = cid(sec,idx);
      var st = clState[id] && clState[id].status;
      if(st) hasAnyResponse = true;
      if(st === 'no') hasAnyNo = true;
    });
  });

  // 2. Check deficiencies
  var allDefs = contractors.flatMap(function(n){ return deficiencies[n]||[]; }).concat(generalDeficiencies);
  var hasDeficiencies = allDefs.length > 0;
  var openIAR = allDefs.some(function(d){ return d.iarStatus && d.status !== 'resolved'; });
  var hasNonIARDefic = allDefs.some(function(d){ return !d.iarStatus && d.status !== 'resolved'; });

  // 3. Get TCC selection
  var tccVal = (document.getElementById('test-result')||{}).value || '';

  // 4. Performance check — uses the same affinity+placard rule as the on-screen cards
  var perfResults = stdData.map(function(r){
    var c = _calcFlowPoint(r);
    return (c.verdict==='na') ? null : (c.verdict==='pass');
  }).filter(function(x){ return x !== null; });

  // Don't show verdict if nothing entered
  if(!hasAnyResponse && perfResults.length === 0 && !hasDeficiencies) {
    el.style.display = 'none';
    var _lbl0 = document.getElementById('report-verdict-label'); if(_lbl0) _lbl0.style.display='none';
    var _dot0 = document.getElementById('verdict-tab-dot'); if(_dot0) _dot0.className='verdict-dot';
    return;
  }

  var resultText, bgCol;

  // Rule: Any checklist 'No' -> downgrade to conditional pass at best
  if(hasAnyNo && openIAR) {
    resultText = '\u2717  OVERALL: FAIL \u2014 Checklist items marked NO + unresolved IAR deficiencies';
    bgCol = '#A85959';
  }
  else if(hasAnyNo && tccVal==='fail') {
    resultText = '\u2717  OVERALL: FAIL \u2014 Consultant selected FAIL';
    bgCol = '#A85959';
  }
  else if(hasAnyNo) {
    resultText = '\u26A0  OVERALL: CONDITIONAL PASS \u2014 One or more checklist items marked NO';
    bgCol = '#E67E22';
  }
  // Rule: Open IAR deficiency -> FAIL
  else if(openIAR) {
    resultText = '\u2717  OVERALL: FAIL \u2014 Unresolved IAR deficiencies';
    bgCol = '#A85959';
  }
  // Rule: All yes/NA, no deficiencies → PASS
  else if(!hasDeficiencies && !hasAnyNo && perfResults.length > 0 && perfResults.every(function(r){return r===true;})) {
    resultText = '\u2713  OVERALL: PASS \u2014 All performance points met, no deficiencies';
    bgCol = '#5F8068';
  }
  // Rule: Non-IAR deficiencies exist → consultant chooses from dropdown
  else if(hasNonIARDefic || hasDeficiencies) {
    if(tccVal === 'pass') {
      resultText = '\u2713  OVERALL: PASS \u2014 Deficiencies noted but not IAR, consultant approved';
      bgCol = '#5F8068';
    } else if(tccVal === 'conditional') {
      resultText = '\u26A0  OVERALL: CONDITIONAL PASS \u2014 Non-IAR deficiencies noted';
      bgCol = '#E67E22';
    } else if(tccVal === 'fail') {
      resultText = '\u2717  OVERALL: FAIL \u2014 Major deficiencies identified';
      bgCol = '#A85959';
    } else {
      resultText = '\u26A0  Select test result above \u2014 Non-IAR deficiencies require consultant decision';
      bgCol = '#78909C';
    }
  }
  // Rule: Performance not fully met
  else if(perfResults.length > 0 && !perfResults.every(function(r){return r===true;})) {
    if(tccVal === 'conditional') {
      resultText = '\u26A0  OVERALL: CONDITIONAL PASS \u2014 Performance data does not fully meet cutsheet';
      bgCol = '#E67E22';
    } else if(tccVal === 'fail') {
      resultText = '\u2717  OVERALL: FAIL \u2014 Performance requirements not met';
      bgCol = '#A85959';
    } else {
      resultText = '\u26A0  Review required \u2014 Performance data does not meet cutsheet';
      bgCol = '#E67E22';
    }
  }
  // Default: PASS
  else {
    resultText = '\u2713  OVERALL: PASS \u2014 All requirements met';
    bgCol = '#5F8068';
  }

  // S280: map bgCol -> semantic status class; CSS now owns all theming (light + dark),
  // replacing the old inline colour juggling. Logic above is unchanged.
  var statusCls = bgCol==='#5F8068' ? 'pass'
                : bgCol==='#E67E22' ? 'cond'
                : bgCol==='#A85959' ? 'fail'
                : 'review';
  // Split the leading glyph (icon) from the message text so the icon can be styled.
  var icon = '', msg = resultText;
  var m = resultText.match(/^(\S+)\s+(.*)$/);
  if(m){ icon = m[1]; msg = m[2]; }

  el.className = 'report-verdict ' + statusCls;
  el.style.display = 'flex';
  el.innerHTML = (icon ? '<span class="vicon">'+icon+'</span>' : '') + '<span>'+msg+'</span>';
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
function addCustomEquip(tab) {
  var key = '_'+tab.replace('-','');
  _customEquipCount[key] = (_customEquipCount[key]||0) + 1;
  var n = _customEquipCount[key];
  var container = document.getElementById('equip-custom-'+tab);
  if(!container) return;
  var name = tab === '3a' ? 'equip3a' : 'equip4b';
  var wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;grid-column:span 2;';
  wrap.innerHTML = '<input type="checkbox" name="'+name+'" checked>'
    + '<input type="text" placeholder="Custom equipment description" style="flex:1;padding:3px 7px;border:1px solid var(--border);border-radius:4px;font-size:12px;font-family:Calibri,sans-serif;">'
    + '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#A85959;cursor:pointer;font-size:13px;padding:0 4px;">✕</button>';
  container.appendChild(wrap);
  wrap.querySelector('input[type=text]').focus();
}
function addPitotRow(tab){
  if(pitotCounts[tab]>=8){showToast('Maximum 8 pitot rows');return;}
  pitotCounts[tab]++;var n=pitotCounts[tab];
  var c=document.getElementById('pitot-'+tab);if(!c)return;
  var row=document.createElement('div');row.id='pr-'+tab+'-'+n;
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
    cell.innerHTML='<div class="pct">'+row.pct+' · '+row.label+'</div>'
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
      document.addEventListener('mousemove', function(ev) {
        _annMove(ev.clientX, ev.clientY);
      });
      document.addEventListener('touchmove', function(ev) {
        if(!dragState.dragging) return;
        if(!ev.touches || !ev.touches[0]) return;
        ev.preventDefault();   // we own the gesture while dragging an annotation
        _annMove(ev.touches[0].clientX, ev.touches[0].clientY);
      }, {passive:false});
      document.addEventListener('mouseup', function() {
        _annEnd();
      });
      document.addEventListener('touchend', function() {
        _annEnd();
      });
      document.addEventListener('touchcancel', function() {
        _annEnd();
      });
      
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
          if(typeof addCustomEquip==='function') addCustomEquip(tab);
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
          addPitotRow(tab);
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
ADB.DB_VERSION = 3;
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
        };
        req.onsuccess = function(e){ ADB._db=e.target.result; resolve(ADB._db); };
        req.onerror = function(e){ reject(e); };
      });
    }
    if(!ADB._engine){
      ADB._engine = mk({
        dbName: ADB.DB_NAME,
        version: ADB.DB_VERSION,
        stores: [ { name:'state', keyPath:'k' } ]
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
      if (_csHubMode && typeof CloudSync !== 'undefined' && CloudSync.isInitialized && navigator.onLine) {
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
  if (_csHubMode && typeof CloudSync !== 'undefined' && CloudSync.isInitialized && navigator.onLine) {
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
    var json=JSON.stringify(collectState());
    _idbPut(key,json);
    updateIDBStorageBar();
  }catch(e){console.warn('saveState error:',e);}
}

function collectState() {
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
  var testType = 'std';
  document.querySelectorAll('.pump-type-btns button').forEach(function(b){ if(b.classList.contains('on')) testType=b.dataset.ptype; });
  // Equipment checkboxes
  const equipChecked = [];
  document.querySelectorAll('input[name="equip3a"]').forEach(function(cb,i){ if(cb.checked) equipChecked.push(i); });
  // S321: the 7-pt tab's equipment was NEVER persisted
  const equipChecked4b = [];
  document.querySelectorAll('input[name="equip4b"]').forEach(function(cb,i){ if(cb.checked) equipChecked4b.push(i); });
  // S321: pitot rows were NEVER persisted — readings lived only in the DOM
  const pitotRows = {};
  ['3a','4b'].forEach(function(tab){
    var rows=[];
    for(var n=1;n<=((typeof pitotCounts!=='undefined'&&pitotCounts[tab])||0);n++){
      var pp=document.getElementById('pp-'+tab+'-'+n), pf=document.getElementById('pf-'+tab+'-'+n), po=document.getElementById('po-'+tab+'-'+n);
      if(!pp&&!pf&&!po) continue;   // removed row
      rows.push({p:pp?pp.value:'', f:pf?pf.value:'', o:po?po.value:'1'});
    }
    pitotRows[tab]=rows;
  });
  // S321: custom equipment TEXT was never persisted (only its checkbox index)
  const customEquip = {};
  ['3a','4b'].forEach(function(tab){
    var arr=[];
    document.querySelectorAll('#equip-custom-'+tab+' label').forEach(function(w){
      var cb=w.querySelector('input[type=checkbox]'), tx=w.querySelector('input[type=text]');
      arr.push({t:tx?tx.value:'', c:cb?cb.checked:true});
    });
    customEquip[tab]=arr;
  });
  return {
    proj,
    testType,
    npshPsi,
    npshPsiPld,
    equipChecked,
    equipChecked4b,
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
    sigStrokes: (typeof _sigStrokes!=='undefined') ? JSON.parse(JSON.stringify(_sigStrokes)) : {},
    // Photos stored separately to keep main state lean
    batData: {b1:[...batData.b1], b2:[...batData.b2]},
    flowTestPhotosPld: flowTestPhotosPld.map(p=>({d:p.d,n:p.n,id:p.id||'',tag:p.tag||'',caption:p.caption||'',mk:p.mk||null,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''})),
    deletedItems: (function(){ var o={}; Object.keys(deletedItems).forEach(function(k){ o[k]=[...deletedItems[k]]; }); return o; })(),
    flowTestPhotos: flowTestPhotos.map(p=>({d:p.d,n:p.n,id:p.id||'',tag:p.tag||'',caption:p.caption||'',mk:p.mk||null,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''})),
    recordPhotos: recordPhotos.map(p=>({d:p.d,n:p.n,id:p.id,kind:p.kind,caption:p.caption||'',date:p.date||'',r2Key:p.r2Key||'',r2Status:p.r2Status||'',r2Url:p.r2Url||'',mk:p.mk||null,_annotated:p._annotated||false,_origBackupId:p._origBackupId||'',_isOrigBackup:p._isOrigBackup||false,_mkTs:p._mkTs||0,rotation:p.rotation||0,deleted:p.deleted||false,deletedDate:p.deletedDate||'',deletedBy:p.deletedBy||'',delState:p.delState||'',delAt:p.delAt||''})),
    sketchEntries: sketchEntries.map(e=>({comment:e.comment, markupImg:e.markupImg||null})),
    formRevision,
    formDateModified,
    appendixExcluded: (typeof _appendixExcl!=='undefined') ? Array.from(_appendixExcl) : [],   // S315 F1
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
    idx[p.id] = { badgeText: item.badge || '', badgeColor: _dslBadgeColorHex(item) };
  });
  function stampArr(arr){
    if(!Array.isArray(arr)) return;
    arr.forEach(function(p){
      if(!p || !p.id) return;
      var b = idx[p.id]; if(!b) return;
      p.badgeText = b.badgeText; p.badgeColor = b.badgeColor;
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
      if(b){ origSrc = b.d || b.r2Url || ''; }
    }
    if(p && p._annotated && !origSrc && p.id && typeof _r2FolderId!=='undefined' && _r2FolderId &&
       typeof R2Photos!=='undefined' && R2Photos.getUrl){
      try{ origSrc = R2Photos.getUrl(_r2FolderId, 'diesel', 'original', _r2Fname(p)); }catch(_e){}
    }

    var local = (!p._annotated && p.d) ? p.d : (origSrc && origSrc.indexOf('data:')===0 ? origSrc : '');
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
function _rehydratePhotoFromOutbox(p, entry){
  return new Promise(function(resolve){
    if(!p || p.d || !entry || !entry.blob){ resolve(false); return; }
    try{
      var fr = new FileReader();
      fr.onload = function(){ if(fr.result){ p.d = fr.result; resolve(true); } else resolve(false); };
      fr.onerror = function(){ resolve(false); };
      fr.readAsDataURL(entry.blob);
    }catch(e){ resolve(false); }
  });
}
function _r2ReconcilePhotos(){
  if(_r2ReconcileRunning) return Promise.resolve();
  if(!_csHubMode || !_r2FolderId || typeof R2Photos==='undefined') return Promise.resolve();
  if(typeof navigator!=='undefined' && !navigator.onLine) return Promise.resolve();
  _r2ReconcileRunning = true;
  var targets = [];
  _forEachLivePhoto(function(p){ if(p && p.r2Status!=='uploaded') targets.push(p); });
  if(!targets.length){ _r2ReconcileRunning=false; console.log('[Reconcile] nothing to settle'); return Promise.resolve(); }
  function _present(url){
    return fetch(url,{method:'GET'}).then(function(g){
      try{ if(g.body && g.body.cancel) g.body.cancel(); }catch(_){}
      return g.ok;
    }).catch(function(){ return false; });
  }
  var outboxKeys = {}, outboxByKey = {};
  var pre = (typeof R2Outbox!=='undefined')
    ? R2Outbox.getAll().then(function(es){ es.forEach(function(e){ if(e&&e.key){ outboxKeys[e.key]=1; outboxByKey[e.key]=e; } }); }).catch(function(){})
    : Promise.resolve();
  var nGreen=0, nRequeued=0, nOrphan=0, nSkipped=0, changed=false;
  return pre.then(function(){
    var chain = Promise.resolve();
    targets.forEach(function(p){
      chain = chain.then(function(){
        if(typeof navigator!=='undefined' && !navigator.onLine) return;
        if(p.r2Key && outboxKeys[p.r2Key]){
          // outbox owns the upload — but if cloud stripped p.d on reload, the
          // thumbnail is broken until the (possibly failing) upload verifies.
          // Restore display data from the blob we already hold. (S306 1b)
          if(!p.d && outboxByKey[p.r2Key]){
            return _rehydratePhotoFromOutbox(p, outboxByKey[p.r2Key]).then(function(did){ if(did) changed=true; nSkipped++; });
          }
          nSkipped++; return;
        }
        if(!p.r2Url){
          if(p.d){ _r2EnqueuePhoto(p); nRequeued++; changed=true; }     // never keyed — enqueue fresh
          else { nOrphan++; }                                           // no key, no binary — B9 territory
          return;
        }
        return _present(p.r2Url).then(function(ok){
          if(ok){ p.r2Status='uploaded'; nGreen++; changed=true; return; }
          if(p.d){ _r2EnqueuePhoto(p); nRequeued++; changed=true; return; }     // re-keys legacy names to {id}.jpg
          // R2 object absent AND no local data — try the outbox blob before
          // giving up (S306 1b: a failed PUT must not strand the photo without
          // display data). If we recover it, re-enqueue the upload too.
          var ob = p.r2Key && outboxByKey[p.r2Key];
          if(ob){
            return _rehydratePhotoFromOutbox(p, ob).then(function(did){
              if(did){ _r2EnqueuePhoto(p); nRequeued++; changed=true; }
              else if(p.r2Status!=='failed'){ p.r2Status='failed'; nOrphan++; changed=true; }
              else { nOrphan++; }
            });
          }
          if(p.r2Status!=='failed'){ p.r2Status='failed'; nOrphan++; changed=true; }
          else { nOrphan++; }
        });
      });
    });
    return chain;
  }).then(function(){
    _r2ReconcileRunning=false;
    console.log('[Reconcile] settled '+targets.length+' — green:'+nGreen+' requeued:'+nRequeued+' orphan/no-binary:'+nOrphan+' outbox-owned:'+nSkipped);
    if(changed && typeof _pgRepaintCloudSoon==='function') _pgRepaintCloudSoon();
    return {green:nGreen, requeued:nRequeued, orphans:nOrphan, skipped:nSkipped};
  }).catch(function(e){
    _r2ReconcileRunning=false;
    console.warn('[Reconcile] aborted:', e && e.message);
  });
}
// Console handle for device verification + future B9 reporting.
if(typeof window!=='undefined') window._dieselReconcile = _r2ReconcilePhotos;

// ═══ S282 B9: orphan report / purge / restore (report-first, reversible) ═══
// Console-driven, Mark-watching by design. _dieselOrphanReport() only inspects.
// _dieselOrphanPurge() without `true` is a DRY RUN; with `true` it first
// downloads a JSON backup of everything it is about to remove, then removes,
// then saves. _dieselOrphanRestore(backupObj) best-effort re-inserts.
// Orphan = photo record with no usable image anywhere (no local binary AND no
// cloud URL), or corrupt legacy records ([object Object] names/keys), or junk
// clState buckets keyed 'null'/'undefined'/''.
function _dieselOrphanReport(){
  var rep = {photos:[], clJunkKeys:[], total:0};
  var all = (typeof _collectAllPhotos==='function') ? _collectAllPhotos() : [];
  all.forEach(function(a){
    var p=a.photo||{}, reasons=[];
    if(!p.d && !p.r2Url) reasons.push('no local binary and no cloud URL');
    if(!p.d && p.r2Status==='failed') reasons.push('cloud object missing (reconcile-confirmed) and local binary gone');
    if(((''+(p.n||'')).indexOf('[object')>=0) || ((''+(p.r2Key||'')).indexOf('[object')>=0)) reasons.push('corrupt name/key ([object Object])');
    if(reasons.length) rep.photos.push({pid:p.id||('pg_'+a.section+'_'+a.idx), label:a.label, section:a.section, idx:a.idx, n:''+(p.n||''), r2Key:p.r2Key||'', r2Status:p.r2Status||'', reasons:reasons.join('; ')});
  });
  Object.keys(typeof clState==='undefined'?{}:clState).forEach(function(k){
    if(k==='null'||k==='undefined'||k===''){ rep.clJunkKeys.push(k); }
  });
  rep.total = rep.photos.length + rep.clJunkKeys.length;
  if(rep.photos.length && console.table) console.table(rep.photos);
  console.log('[Orphans] dead photo records: '+rep.photos.length+' | junk clState keys: '+JSON.stringify(rep.clJunkKeys));
  console.log('[Orphans] purge: _dieselOrphanPurge(true)  (dry run without true; backup JSON downloads first; restore: _dieselOrphanRestore(backupObj))');
  return rep;
}
function _dieselOrphanPurge(confirmFlag){
  var rep = _dieselOrphanReport();
  if(!rep.total){ console.log('[Orphans] nothing to purge'); return rep; }
  if(confirmFlag!==true){ console.warn('[Orphans] DRY RUN ONLY — call _dieselOrphanPurge(true) to execute'); return rep; }
  // 1. Backup everything we are about to remove, and download it.
  var backup = {ts:new Date().toISOString(), tool:'diesel', photos:[], clState:{}};
  rep.photos.forEach(function(r){
    var res = _pgResolveByPid(r.pid);
    if(res && res.item && res.item.photo) backup.photos.push({section:res.item.section, type:res.item.type, photo:JSON.parse(JSON.stringify(res.item.photo))});
  });
  rep.clJunkKeys.forEach(function(k){ backup.clState[k] = JSON.parse(JSON.stringify(clState[k]||null)); });
  try {
    var a=document.createElement('a');
    a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(backup,null,1));
    a.download='diesel_orphan_backup_'+Date.now()+'.json'; a.click();
  } catch(e){ console.error('[Orphans] backup download failed — ABORTING purge:', e); return rep; }
  // 2. Remove photos one at a time, re-resolving after each splice so indices
  //    stay valid (uses the same per-section remover the gallery delete uses,
  //    but WITHOUT R2 deletion — these records have no live cloud object).
  var removed=0;
  rep.photos.forEach(function(r){
    var res = _pgResolveByPid(r.pid);
    if(res && res.item && typeof _pgRemovePhoto==='function'){ try{ _pgRemovePhoto(res.item); removed++; }catch(e){ console.warn('[Orphans] remove failed for', r.pid, e); } }
  });
  // 3. Junk clState buckets.
  rep.clJunkKeys.forEach(function(k){ try{ delete clState[k]; }catch(_){} });
  // 4. Persist + repaint.
  if(typeof _renderPhotoGallery==='function') try{ _renderPhotoGallery(); }catch(_){}
  if(typeof debounceAutosave==='function') try{ debounceAutosave(); }catch(_){}
  if(typeof _csHubMode!=='undefined' && _csHubMode && typeof CloudSync!=='undefined' && CloudSync.save){
    try { CloudSync.save(_collectCloudState()); } catch(_){}
  }
  console.log('[Orphans] purged '+removed+' photo records + '+rep.clJunkKeys.length+' clState keys. Backup JSON downloaded — keep it until field-verified.');
  return {purged:removed, clKeys:rep.clJunkKeys.length, backup:backup};
}
function _dieselOrphanRestore(backup){
  if(!backup || !Array.isArray(backup.photos)){ console.warn('[Orphans] pass the parsed backup JSON object'); return; }
  var n=0;
  backup.photos.forEach(function(b){
    try{
      var s=b.section||'', p=b.photo; if(!p) return;
      if(s==='flowtest') flowTestPhotos.push(p);
      else if(s==='flowtestpld') flowTestPhotosPld.push(p);
      else if(s.indexOf('cl_')===0){ var id=s.slice(3); if(!clState[id]) clState[id]={photos:[]}; if(!clState[id].photos) clState[id].photos=[]; clState[id].photos.push(p); }
      else if(s.indexOf('rec_')===0) recordPhotos.push(p);
      else if(s.indexOf('gauge_std_')===0){ var ri=parseInt(s.slice(10),10); if(stdData[ri]){ if(!stdData[ri].photos) stdData[ri].photos=[]; stdData[ri].photos.push(p); } }
      else if(s.indexOf('gauge_pld_')===0){ var rj=parseInt(s.slice(10),10); if(pldData[rj]){ if(!pldData[rj].photos) pldData[rj].photos=[]; pldData[rj].photos.push(p); } }
      else if(s.indexOf('gdef_')===0){ var gi=parseInt(s.slice(5),10); if(generalDeficiencies[gi]){ if(!generalDeficiencies[gi].photos) generalDeficiencies[gi].photos=[]; generalDeficiencies[gi].photos.push(p); } }
      else if(s.indexOf('def_')===0 || s.indexOf('resp_')===0){
        // def_<ctr>_<di> / resp_<ctr>_<di>_<ri> — contractor names may contain '_',
        // so parse from the right.
        var parts=s.split('_'); var isResp=(parts[0]==='resp');
        var di=parseInt(isResp?parts[parts.length-2]:parts[parts.length-1],10);
        var ri2=isResp?parseInt(parts[parts.length-1],10):null;
        var ctr=parts.slice(1, isResp?parts.length-2:parts.length-1).join('_');
        var d=(deficiencies[ctr]||[])[di];
        if(d){ if(isResp){ var rr=(d.responses||[])[ri2]; if(rr){ if(!rr.photos) rr.photos=[]; rr.photos.push(p); } } else { if(!d.photos) d.photos=[]; d.photos.push(p); } }
      }
      else return;
      n++;
    }catch(e){ console.warn('[Orphans] restore skip:', e); }
  });
  Object.keys(backup.clState||{}).forEach(function(k){ clState[k]=backup.clState[k]; });
  if(typeof _renderPhotoGallery==='function') try{ _renderPhotoGallery(); }catch(_){}
  if(typeof debounceAutosave==='function') try{ debounceAutosave(); }catch(_){}
  console.log('[Orphans] restored '+n+' photo records (appended at end of their sections).');
}
if(typeof window!=='undefined'){
  window._dieselOrphanReport = _dieselOrphanReport;
  window._dieselOrphanPurge = _dieselOrphanPurge;
  window._dieselOrphanRestore = _dieselOrphanRestore;
}

/* ═══ S310: BURST CAMERA — ported VERBATIM from FRT frt/js/ui/cameraBurst.js (S284, Mark) ═══
 * Continuous in-app camera: shoot → shoot → shoot → Done, all photos returned
 * together. Replaces the single-shot <input type=file capture> round-trip that
 * forced re-opening the camera per photo. FRT is modular ES6 (export); Diesel is
 * single-file shared-scope, so the ONLY change from the FRT original is: the
 * `export function` becomes a global `window.openCameraBurst`. Body is byte-faithful.
 * Contract — openCameraBurst() resolves with:
 *   File[] (len>=1) photos taken → caller feeds its normal photo pipeline
 *   []              cancelled / Done with zero shots → caller no-ops
 *   null            unsupported / permission denied → caller informs the user
 * Capture: ImageCapture.takePhoto() w/ <canvas> frame-grab fallback. Plain canvas
 * only (OffscreenCanvas prohibited). Tracks always stopped on close. One overlay.
 *
 * _camBurst(perFileFn) is the REUSABLE standard every camera button uses: it
 * encodes FRT's exact null/[]/length handling ONCE, then runs each returned File
 * through that section's existing per-file processor. Any future camera feature in
 * any tool should call _camBurst(itsPerFileProcessor) — never a raw capture input. */
(function(){
  var _open = false;
  function openCameraBurst() {
    return new Promise(function(resolve) {
      if (_open) { resolve([]); return; }
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { resolve(null); return; }
      _open = true;
      // S342: cap stream to 1080p — 4096x3072 (12MP) crashed Android WebView (OOM).
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      }).then(function(stream) {
        _openUI(stream, function(r) { _open = false; resolve(r); });
      }).catch(function() {
        _open = false;
        resolve(null);
      });
    });
  }
  function _openUI(stream, done) {
    var shots = [];
    var urls = [];
    var overlay = document.createElement('div');
    overlay.id = 'cam-burst-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0a0d;display:flex;flex-direction:column;font-family:Calibri,sans-serif;';
    var vidWrap = document.createElement('div');
    vidWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#000;min-height:0;';
    var video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    video.srcObject = stream;
    vidWrap.appendChild(video);
    var counter = document.createElement('div');
    counter.style.cssText = 'position:absolute;top:14px;right:14px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:99px;padding:6px 14px;font-size:15px;font-weight:700;display:none;';
    vidWrap.appendChild(counter);
    var flash = document.createElement('div');
    flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .12s;';
    vidWrap.appendChild(flash);
    overlay.appendChild(vidWrap);
    var strip = document.createElement('div');
    strip.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding:8px 12px;background:#16141b;flex:none;';
    overlay.appendChild(strip);
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 22px calc(14px + env(safe-area-inset-bottom,0px));background:#16141b;border-top:1px solid rgba(255,255,255,.08);flex:none;';
    var btnCancel = document.createElement('button');
    btnCancel.id = 'cam-burst-cancel';
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = 'min-width:96px;min-height:52px;background:transparent;color:#a09aa8;border:1px solid rgba(255,255,255,.2);border-radius:12px;font-size:16px;font-family:Calibri,sans-serif;cursor:pointer;';
    var shutter = document.createElement('button');
    shutter.id = 'cam-burst-shutter';
    shutter.setAttribute('aria-label', 'Take photo');
    shutter.style.cssText = 'width:74px;height:74px;border-radius:50%;background:#fff;border:5px solid rgba(255,255,255,.35);cursor:pointer;flex:none;';
    var btnDone = document.createElement('button');
    btnDone.id = 'cam-burst-done';
    btnDone.textContent = 'Done';
    btnDone.style.cssText = 'min-width:96px;min-height:52px;background:#2E9E72;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;font-family:Calibri,sans-serif;cursor:pointer;opacity:.45;';
    bar.appendChild(btnCancel); bar.appendChild(shutter); bar.appendChild(btnDone);
    overlay.appendChild(bar);
    // S333: Library/files option INSIDE the burst UI, so the single "Upload
    // Photos" button still reaches existing photos (req A). Picked files merge
    // into the same shots[] and flow out the identical perFileFn path. This
    // also serves as the graceful path on devices where the camera frame is
    // unavailable. One hidden input, reused.
    var libInput = document.createElement('input');
    libInput.type = 'file'; libInput.accept = 'image/*'; libInput.multiple = true;
    libInput.style.display = 'none';
    overlay.appendChild(libInput);
    var btnLib = document.createElement('button');
    btnLib.id = 'cam-burst-library';
    btnLib.textContent = '\uD83D\uDDBC Library';
    btnLib.style.cssText = 'position:absolute;top:14px;left:14px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:99px;padding:8px 16px;font-size:14px;font-family:Calibri,sans-serif;cursor:pointer;z-index:2;';
    vidWrap.appendChild(btnLib);
    btnLib.addEventListener('click', function(){ libInput.value=''; libInput.click(); });
    libInput.addEventListener('change', function(){
      var fs = Array.prototype.slice.call(libInput.files||[]);
      fs.forEach(function(file){
        shots.push(file);
        var u = URL.createObjectURL(file); urls.push(u);
        var th = document.createElement('img'); th.src=u; th.style.cssText='height:56px;border-radius:8px;flex:none;';
        strip.appendChild(th);
      });
      strip.scrollLeft = strip.scrollWidth;
      _updateUI();
    });
    document.body.appendChild(overlay);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var track = stream.getVideoTracks()[0];
    var imgCap = (typeof window.ImageCapture === 'function' && track) ? new window.ImageCapture(track) : null;
    var busy = false;
    function _updateUI() {
      counter.textContent = shots.length + (shots.length === 1 ? ' photo' : ' photos');
      counter.style.display = shots.length ? 'block' : 'none';
      btnDone.textContent = 'Done' + (shots.length ? ' (' + shots.length + ')' : '');
      btnDone.style.opacity = shots.length ? '1' : '.45';
    }
    function _addShot(blob) {
      var f = new File([blob], 'camera_' + Date.now() + '_' + (shots.length + 1) + '.jpg', { type: blob.type || 'image/jpeg' });
      shots.push(f);
      var u = URL.createObjectURL(blob);
      urls.push(u);
      var th = document.createElement('img');
      th.src = u;
      th.style.cssText = 'height:56px;border-radius:8px;flex:none;';
      strip.appendChild(th);
      strip.scrollLeft = strip.scrollWidth;
      flash.style.opacity = '.7';
      setTimeout(function() { flash.style.opacity = '0'; }, 90);
      _updateUI();
    }
    function _grabFrame() {
      var vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
      var MAX = 1920; // S342: clamp grab so a single shot can't allocate a huge canvas
      var scale = Math.min(1, MAX / Math.max(vw, vh));
      var cw = Math.round(vw * scale), ch = Math.round(vh * scale);
      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      var ctx = cv.getContext('2d');
      try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
      ctx.drawImage(video, 0, 0, cw, ch);
      cv.toBlob(function(b) { if (b) _addShot(b); busy = false; cv.width = 0; cv.height = 0; }, 'image/jpeg', 0.9);
    }
    shutter.addEventListener('click', function() {
      if (busy) return;
      busy = true;
      // S342: takePhoto retired — it returned full-sensor (12MP) images on Android
      // ignoring the size cap, crashing the WebView. Clamped canvas grab instead.
      _grabFrame();
    });
    function _close(result) {
      try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
      urls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch (e) {} });
      document.body.style.overflow = prevOverflow;
      overlay.remove();
      document.removeEventListener('keydown', _esc);
      done(result);
    }
    function _esc(e) { if (e.key === 'Escape') _close([]); }
    document.addEventListener('keydown', _esc);
    btnCancel.addEventListener('click', function() { _close([]); });
    btnDone.addEventListener('click', function() { _close(shots.slice()); });
  }
  // Reusable standard — FRT's exact null/[]/length contract, applied once.
  // perFileFn receives one File at a time and runs the caller's normal pipeline.
  function _camBurst(perFileFn) {
    openCameraBurst().then(function(files) {
      if (files === null) {
        // S333: no camera (desktop / permission denied) — fall back to a direct
        // library/files picker so the single "Add Photos" button still works.
        var fb = document.createElement('input');
        fb.type='file'; fb.accept='image/*'; fb.multiple=true; fb.style.display='none';
        document.body.appendChild(fb);
        fb.addEventListener('change', function(){
          var fs = Array.prototype.slice.call(fb.files||[]);
          fs.forEach(function(f){ try { perFileFn(f); } catch(e){ console.warn('[burst-fallback] perFile failed:', e); } });
          fb.remove();
        });
        fb.click();
        return;
      }
      if (files && files.length) files.forEach(function(f) { try { perFileFn(f); } catch (e) { console.warn('[burst] perFile failed:', e); } });
    });
  }
  if (typeof window !== 'undefined') { window.openCameraBurst = openCameraBurst; window._camBurst = _camBurst; }
})();

// ═══ S309 B9 (Option A): REVERSE R2 sweep — REPORT ONLY, deletes nothing ═══
// The legacy _r2CleanupOrphans() (a) listed only the 'original/' folder so it
// could never see stranded 'marked/' objects, and (b) deleted on a confirm-by-
// count with no visibility of which keys, AND (c) its local-key set did not
// account for the fact that persisting markup OVERWRITES a record's r2Key with
// the marked key (line ~10225) — leaving each annotated photo's ORIGINAL object
// unreferenced. Run as-is it would have flagged every still-needed original as
// an orphan. This reporter fixes all three: lists all four type folders, builds
// a COMPLETE protected-key set (each record's stored r2Key PLUS the derived
// original AND marked keys for every photo id, plus drawings/markup), and only
// PRINTS the diff. No delete path here by design — verify on-device first.
async function _dieselR2OrphanReport(){
  if(!_csHubMode || !_r2FolderId || typeof R2Photos==='undefined'){
    console.warn('[R2Orphan] Hub mode + R2 folder required (open from the Hub).'); return null;
  }
  var pid=_r2FolderId, TYPES=['original','marked','drawings','markup'];
  // 1. Protected keys = everything any live record could legitimately own.
  var keep={};
  var keepDerived=function(id){ if(!id) return;
    keep['photos/'+pid+'/diesel/original/'+id+'.jpg']=true;          // base original
    keep['photos/'+pid+'/diesel/marked/marked_'+id+'.jpg']=true;     // annotated variant
  };
  var scan=function(arr){ if(!arr) return;
    arr.forEach(function(p){ if(!p) return;
      if(p.r2Key) keep[p.r2Key]=true;        // whatever the record points at now
      keepDerived(p.id);                      // + both deterministic variants
    });
  };
  if(typeof clState!=='undefined') Object.keys(clState).forEach(function(k){ scan(clState[k].photos); });
  if(typeof deficiencies!=='undefined') Object.keys(deficiencies).forEach(function(k){
    (deficiencies[k]||[]).forEach(function(d){ scan(d.photos); if(d.responses) d.responses.forEach(function(r){ scan(r.photos); }); });
  });
  if(typeof generalDeficiencies!=='undefined') generalDeficiencies.forEach(function(d){
    scan(d.photos); if(d.responses) d.responses.forEach(function(r){ scan(r.photos); });
  });
  if(typeof flowTestPhotos!=='undefined') scan(flowTestPhotos);
  if(typeof flowTestPhotosPld!=='undefined') scan(flowTestPhotosPld);
  if(typeof recordPhotos!=='undefined') scan(recordPhotos);
  if(typeof stdData!=='undefined') stdData.forEach(function(r){ if(r) scan(r.photos); });
  if(typeof pldData!=='undefined') pldData.forEach(function(r){ if(r) scan(r.photos); });
  // drawings / markup keys live on sketch entries
  if(typeof sketchEntries!=='undefined') sketchEntries.forEach(function(e){
    if(e&&e.r2Key) keep[e.r2Key]=true;
    if(e&&e.markupKey) keep[e.markupKey]=true;
  });
  // 2. List every type folder and diff.
  var bucket=[], orphans=[], missing=[];
  for(var t=0;t<TYPES.length;t++){
    try{
      var data=await R2Photos.list(pid,'diesel',TYPES[t]);
      (data.objects||[]).forEach(function(o){
        bucket.push({key:o.key, folder:TYPES[t], size:o.size||o.Size||''});
        if(!keep[o.key]) orphans.push({key:o.key, folder:TYPES[t], size:o.size||o.Size||''});
      });
    }catch(e){ console.warn('[R2Orphan] list '+TYPES[t]+' failed:', e&&e.message); }
  }
  // 3. Inverse check: records pointing at a key that is NOT in the bucket.
  var bucketKeys={}; bucket.forEach(function(b){ bucketKeys[b.key]=true; });
  Object.keys(keep).forEach(function(k){
    // only flag keys a record actually stores (not the speculative derived ones)
  });
  var liveKeys={};
  var noteLive=function(arr){ if(!arr) return; arr.forEach(function(p){ if(p&&p.r2Key) liveKeys[p.r2Key]=true; }); };
  if(typeof clState!=='undefined') Object.keys(clState).forEach(function(k){ noteLive(clState[k].photos); });
  if(typeof deficiencies!=='undefined') Object.keys(deficiencies).forEach(function(k){ (deficiencies[k]||[]).forEach(function(d){ noteLive(d.photos); if(d.responses) d.responses.forEach(function(r){ noteLive(r.photos); }); }); });
  if(typeof generalDeficiencies!=='undefined') generalDeficiencies.forEach(function(d){ noteLive(d.photos); if(d.responses) d.responses.forEach(function(r){ noteLive(r.photos); }); });
  if(typeof flowTestPhotos!=='undefined') noteLive(flowTestPhotos);
  if(typeof flowTestPhotosPld!=='undefined') noteLive(flowTestPhotosPld);
  Object.keys(liveKeys).forEach(function(k){ if(!bucketKeys[k]) missing.push({key:k}); });
  // 4. Print only — NO deletes.
  console.log('%c[R2Orphan] REPORT ONLY — nothing deleted','font-weight:bold');
  console.log('[R2Orphan] bucket objects: '+bucket.length+' | protected keys: '+Object.keys(keep).length);
  console.log('[R2Orphan] STRANDED bucket objects (no record owns them): '+orphans.length);
  if(orphans.length && console.table) console.table(orphans); else if(orphans.length) console.log(orphans);
  console.log('[R2Orphan] records pointing at a MISSING bucket object (failed uploads): '+missing.length);
  if(missing.length && console.table) console.table(missing); else if(missing.length) console.log(missing);
  console.log('[R2Orphan] To delete the stranded objects after verifying this list: _dieselR2OrphanPurge(true)  (dry run without true; NOT reversible).');
  return {bucket:bucket, orphans:orphans, missing:missing};
}
if(typeof window!=='undefined') window._dieselR2OrphanReport = _dieselR2OrphanReport;

// ═══ S335 B9: gated purge of STRANDED R2 objects (report-confirmed) ═══
// Deletes bucket objects that no live record owns (the `orphans` set from the
// report above). Console-driven + Hub-gated by design.
//   _dieselR2OrphanPurge()       → DRY RUN: re-reports, prints what WOULD delete.
//   _dieselR2OrphanPurge(true)    → downloads a manifest of the doomed keys FIRST,
//                                   then DELETEs each via the same R2 path the rest
//                                   of the tool uses. 404 counts as already-gone.
// IMPORTANT: R2 bytes cannot be restored from the manifest — this is a record of
// WHAT was deleted, not a reversible backup. Stated plainly so nobody trusts a
// false undo. Run the report and eyeball the list before passing true.
async function _dieselR2OrphanPurge(confirmFlag){
  if(!_csHubMode || !_r2FolderId || typeof R2Photos==='undefined' || !R2Photos.remove){
    console.warn('[R2OrphanPurge] Hub mode + R2 folder required (open from the Hub).'); return null;
  }
  var rep = await _dieselR2OrphanReport();
  if(!rep) return null;
  var orphans = rep.orphans || [];
  if(!orphans.length){ console.log('[R2OrphanPurge] Nothing stranded — bucket is clean.'); return rep; }
  if(confirmFlag!==true){
    console.warn('[R2OrphanPurge] DRY RUN ONLY — '+orphans.length+' object'+(orphans.length===1?'':'s')+' would be deleted. Call _dieselR2OrphanPurge(true) to execute (NOT reversible).');
    return rep;
  }
  // Manifest download first (record of what we delete — not a restore point).
  try{
    var manifest={ when:new Date().toISOString(), project:_r2FolderId, tool:'diesel', deleted:orphans };
    var blob=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='diesel_r2_orphan_purge_'+Date.now()+'.json'; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },4000);
  }catch(e){ console.warn('[R2OrphanPurge] manifest download failed (continuing):', e&&e.message); }
  var ok=0, gone=0, fail=0, failures=[];
  for(var i=0;i<orphans.length;i++){
    var o=orphans[i];
    var fname=String(o.key).split('/').pop();
    try{
      await R2Photos.remove(_r2FolderId,'diesel',o.folder,decodeURIComponent(fname));
      ok++;
    }catch(e){
      // remove() already swallows 404 as success; a throw here is a real failure.
      fail++; failures.push({key:o.key, err:(e&&e.message)||String(e)});
    }
  }
  console.log('%c[R2OrphanPurge] DONE','font-weight:bold');
  console.log('[R2OrphanPurge] deleted: '+ok+' | failed: '+fail+' / '+orphans.length+' attempted');
  if(failures.length){ console.warn('[R2OrphanPurge] failures (left in bucket — safe to re-run):'); if(console.table) console.table(failures); else console.log(failures); }
  return {attempted:orphans.length, deleted:ok, failed:fail, failures:failures};
}
if(typeof window!=='undefined') window._dieselR2OrphanPurge = _dieselR2OrphanPurge;

// ═══ S313 B9 REPAIR: clear DEAD photo references (report-then-confirm) ═══
// A "dead reference" = a photo record with NO local binary (.d) whose r2Url
// returns 404 (object genuinely gone) AND no recoverable blob in the outbox.
// These show the camera-placeholder tile and spam 404s on every gallery render
// (confirmed via outbox entries:0 + R2 404 on device). The existing orphan report
// missed them because it tested "no r2Url" — these HAVE an r2Url, it just 404s.
// _dieselDeadRefReport() GET-verifies each candidate (R2 GET is public, no auth)
// and PRINTS the confirmed-dead list. _dieselDeadRefRepair(true) backs the records
// up to JSON, then removes them via the authoritative _pgRemovePhoto path. Dry run
// without true. Restore: _dieselOrphanRestore(backupObj).
async function _dieselDeadRefReport(){
  var all = (typeof _collectAllPhotos==='function') ? _collectAllPhotos() : [];
  // candidates: no local binary, but a record that still claims an r2Url
  var cands = all.filter(function(a){ var p=a.photo||{}; return !p.d && p.r2Url; });
  // also include outbox keys so we never flag a record whose blob is still queued
  var outboxKeys = {};
  try { if(typeof R2Outbox!=='undefined'){ var es=await R2Outbox.getAll(); (es||[]).forEach(function(e){ if(e&&e.key) outboxKeys[e.key]=1; }); } } catch(e){}
  var dead = [];
  for(var i=0;i<cands.length;i++){
    var a=cands[i], p=a.photo;
    if(p.r2Key && outboxKeys[p.r2Key]) continue;   // blob still queued — recoverable, skip
    var ok=false;
    try{ var r=await fetch(p.r2Url,{method:'GET'}); try{ if(r.body&&r.body.cancel) r.body.cancel(); }catch(_){}; ok=r.ok; }catch(e){ ok=false; }
    if(!ok) dead.push({pid:p.id||'', label:a.label, section:a.section, idx:a.idx, type:a.type, r2Key:p.r2Key||'', n:p.n||''});
  }
  console.log('%c[DeadRef] REPORT ONLY \u2014 nothing removed','font-weight:bold');
  console.log('[DeadRef] candidates (no local binary, has r2Url): '+cands.length+' | confirmed DEAD (r2Url 404, not in outbox): '+dead.length);
  if(dead.length && console.table) console.table(dead); else if(dead.length) console.log(dead);
  console.log('[DeadRef] to clear: _dieselDeadRefRepair(true)  (dry run without true; backup JSON downloads first; restore via _dieselOrphanRestore)');
  return dead;
}
async function _dieselDeadRefRepair(confirmFlag){
  var dead = await _dieselDeadRefReport();
  if(!dead.length){ console.log('[DeadRef] nothing to repair'); return dead; }
  if(confirmFlag!==true){ console.warn('[DeadRef] DRY RUN ONLY \u2014 call _dieselDeadRefRepair(true) to execute'); return dead; }
  // 1. Backup the dead records (re-resolve live so indices are current).
  var backup = {ts:new Date().toISOString(), tool:'diesel', photos:[], clState:{}};
  dead.forEach(function(d){
    var res = (typeof _pgResolveByPid==='function') ? _pgResolveByPid(d.pid) : null;
    if(res && res.item && res.item.photo) backup.photos.push({section:res.item.section, type:res.item.type, photo:JSON.parse(JSON.stringify(res.item.photo))});
  });
  try{
    var a=document.createElement('a');
    a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(backup,null,1));
    a.download='diesel_deadref_backup_'+Date.now()+'.json'; a.click();
  }catch(e){ console.error('[DeadRef] backup download failed \u2014 ABORTING:', e); return dead; }
  // 2. Remove each dead record via the authoritative per-section remover,
  //    re-resolving by id each time so splices keep indices valid.
  var removed=0;
  dead.forEach(function(d){
    var res = (typeof _pgResolveByPid==='function') ? _pgResolveByPid(d.pid) : null;
    if(res && res.item && typeof _pgRemovePhoto==='function'){ try{ _pgRemovePhoto(res.item); removed++; }catch(e){ console.warn('[DeadRef] remove failed for', d.pid, e); } }
  });
  // 3. Persist + repaint.
  if(typeof _renderPhotoGallery==='function') try{ _renderPhotoGallery(); }catch(_){}
  if(typeof saveState==='function') try{ saveState(); }catch(_){}
  if(typeof debounceAutosave==='function') try{ debounceAutosave(); }catch(_){}
  console.log('[DeadRef] cleared '+removed+' dead photo reference(s). Backup JSON downloaded \u2014 keep until field-verified. 404 storm should stop on next render.');
  return {cleared:removed, backup:backup};
}
if(typeof window!=='undefined'){ window._dieselDeadRefReport = _dieselDeadRefReport; window._dieselDeadRefRepair = _dieselDeadRefRepair; }

function _r2ReuploadAll(){
  if(!_csHubMode || !_r2FolderId || typeof R2Photos==='undefined'){ showToast('Must be in Hub mode', 2000); return; }
  var count = 0;
  function _enqAll(arr){
    if(!arr) return;
    arr.forEach(function(p){ if(p && p.d){ _r2EnqueuePhoto(p); count++; } });
  }
  // Checklist photos
  if(typeof clState!=='undefined'){ Object.keys(clState).forEach(function(k){ _enqAll(clState[k].photos); }); }
  // Deficiency photos
  if(typeof deficiencies!=='undefined'){ Object.keys(deficiencies).forEach(function(k){
    (deficiencies[k]||[]).forEach(function(d){
      _enqAll(d.photos);
      if(d.responses) d.responses.forEach(function(r){ _enqAll(r.photos); });
    });
  }); }
  // General deficiency photos
  if(typeof generalDeficiencies!=='undefined'){ generalDeficiencies.forEach(function(d){
    _enqAll(d.photos);
    if(d.responses) d.responses.forEach(function(r){ _enqAll(r.photos); });
  }); }
  // Flow test photos
  if(typeof flowTestPhotos!=='undefined') _enqAll(flowTestPhotos);
  if(typeof flowTestPhotosPld!=='undefined') _enqAll(flowTestPhotosPld);
  // Sketch entries
  if(typeof sketchEntries!=='undefined'){ sketchEntries.forEach(function(e){
    if(e.markupImg){
      var fakeObj = {d: e.markupImg, n: 'sketch_' + (e.uid||Date.now()) + '.jpg'};
      _r2EnqueuePhoto(fakeObj);
      count++;
    }
  }); }
  showToast('Re-uploading ' + count + ' photos to R2...', 3000);
}

// ═══ R2 PREFETCH — download photos from R2 URLs back into local state ═══
function _r2PrefetchPhotos(){
  if(!_csHubMode) return;
  var queue=[];
  function _scan(arr){if(!arr)return;arr.forEach(function(p){if(p&&p.r2Url&&!p.d)queue.push(p);});}
  if(typeof clState!=='undefined'){Object.keys(clState).forEach(function(k){_scan(clState[k].photos);});}
  if(typeof deficiencies!=='undefined'){Object.keys(deficiencies).forEach(function(k){(deficiencies[k]||[]).forEach(function(d){_scan(d.photos);if(d.responses)d.responses.forEach(function(r){_scan(r.photos);});});});}
  if(typeof generalDeficiencies!=='undefined'){generalDeficiencies.forEach(function(d){_scan(d.photos);if(d.responses)d.responses.forEach(function(r){_scan(r.photos);});});}
  if(typeof flowTestPhotos!=='undefined')_scan(flowTestPhotos);
  if(typeof flowTestPhotosPld!=='undefined')_scan(flowTestPhotosPld);
  if(!queue.length)return;
  var total=queue.length,done=0,fail=0;
  showToast('\uD83D\uDCE5 Caching for offline 0/'+total+'\u2026',60000);
  function _next(){
    if(!queue.length){
      if(done)showToast('\u2705 '+done+' item'+(done!==1?'s':'')+' offline ready'+(fail?' ('+fail+' failed)':''),3000);
      return;
    }
    var p=queue.shift();
    fetch(p.r2Url).then(function(r){if(!r.ok)throw new Error(r.status);return r.blob();}).then(function(blob){
      var reader=new FileReader();
      reader.onload=function(){p.d=reader.result;done++;showToast('\uD83D\uDCE5 Caching for offline '+done+'/'+total+'\u2026',60000);_next();};
      reader.onerror=function(){fail++;_next();};
      reader.readAsDataURL(blob);
    }).catch(function(){fail++;_next();});
  }
  for(var i=0;i<Math.min(3,queue.length);i++) _next();
}


// ═══ R2 ORPHAN CLEANUP — compare R2 files against local state ═══
async function _r2CleanupOrphans(){
  if(!_csHubMode || !_r2FolderId || typeof R2Photos==='undefined'){ showToast('Must be in Hub mode',2000); return; }
  try{
    var workerUrl='https://arencon-r2-worker.hezhendong999.workers.dev';
    var listUrl=workerUrl+'/list/'+_r2FolderId+'/diesel/original/';
    var resp=await fetch(listUrl,{headers:_authHeaders()}); // S343 SECURITY
    if(!resp.ok)throw new Error('R2 list failed: '+resp.status);
    var data=await resp.json();
    var r2Files=(data.objects||[]).map(function(o){return o.key;});
    if(!r2Files.length){ showToast('R2 storage is empty — nothing to clean',2000); return; }
    // S398 CROSS-REPORT SAFETY: the /list/ folder is shared by EVERY report of this
    // project. Comparing it against only THIS report's state made every sibling
    // report's photos look like "orphans" — running cleanup from one report would
    // delete the others' photos. Only files whose name carries THIS instance's
    // prefix ("{instanceId}__") are eligible; legacy unprefixed files and other
    // reports' files are never deletable from here.
    if(typeof _csInstanceId==='undefined' || !_csInstanceId){ showToast('Cleanup requires a report instance — reopen from the Hub',3000); return; }
    var _pre=_csInstanceId+'__';
    var _eligible=r2Files.filter(function(k){ var f=k.split('/').pop()||''; return f.indexOf(_pre)===0 || f.indexOf('marked_'+_pre)===0; });
    var _skipped=r2Files.length-_eligible.length;
    // Collect all local r2Keys
    var localKeys={};
    function _addKeys(arr){if(!arr)return;arr.forEach(function(p){if(p&&p.r2Key)localKeys[p.r2Key]=true;});}
    if(typeof clState!=='undefined'){Object.keys(clState).forEach(function(k){_addKeys(clState[k].photos);});}
    if(typeof deficiencies!=='undefined'){Object.keys(deficiencies).forEach(function(k){(deficiencies[k]||[]).forEach(function(d){_addKeys(d.photos);if(d.responses)d.responses.forEach(function(r){_addKeys(r.photos);});});});}
    if(typeof generalDeficiencies!=='undefined'){generalDeficiencies.forEach(function(d){_addKeys(d.photos);if(d.responses)d.responses.forEach(function(r){_addKeys(r.photos);});});}
    if(typeof flowTestPhotos!=='undefined')_addKeys(flowTestPhotos);
    if(typeof flowTestPhotosPld!=='undefined')_addKeys(flowTestPhotosPld);
    var orphans=_eligible.filter(function(k){return !localKeys[k];});
    if(!orphans.length){ showToast('R2 is clean — '+_eligible.length+' of this report\u2019s files match ('+_skipped+' other-report/legacy files untouched)',2500); return; }
    _aConfirm('Found '+orphans.length+' orphaned files belonging to THIS report (out of '+_eligible.length+' owned; '+_skipped+' other-report/legacy files are protected and untouched).\\n\\nDelete them?',async function(){
      var deleted=0;
      for(var i=0;i<orphans.length;i++){
        try{
          var dr=await fetch(workerUrl+'/upload',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:orphans[i]})});
          if(dr.ok)deleted++;
        }catch(e){console.warn('[R2Cleanup] delete failed:',orphans[i]);}
      }
      showToast('Deleted '+deleted+'/'+orphans.length+' orphan files',3000);
    },'Delete Orphans');
  }catch(e){ showToast('R2 cleanup error: '+e.message,3000); console.error('[R2Cleanup]',e); }
}

// ── Issue Report — S366: ported from FRT revision state machine ──
// Revision grammar (matches FRT exactly):
//   A##        = draft         e.g. A01, A02
//   B##        = issued        e.g. B01, B02
//   B##A##     = revision of an issued report  e.g. B01A01
// Any non-conforming legacy free-text value (e.g. R00/R01) is treated as an
// unissued draft, so the first Issue takes it to B01 — agreed S366, no migration.
function _dslParseRevision(rev){
  var m;
  m = rev.match(/^([B-Z])(\d{2,})A(\d{2,})$/);   // B##A## (revision of issued)
  if(m) return { issued:true, hasSuffix:true, letter:m[1], major:parseInt(m[2],10), suffixNum:parseInt(m[3],10) };
  m = rev.match(/^([B-Z])(\d{2,})$/);             // B## (issued)
  if(m) return { issued:true, hasSuffix:false, letter:m[1], major:parseInt(m[2],10), suffixNum:0 };
  m = rev.match(/^A(\d{2,})$/);                    // A## (draft)
  if(m) return { issued:false, hasSuffix:false, letter:'A', major:parseInt(m[1],10), suffixNum:0 };
  return { issued:false, hasSuffix:false, letter:'A', major:1, suffixNum:0 };  // legacy/unknown → draft
}
function _dslCalcIssueRevision(parsed){
  if(!parsed.issued) return 'B01';
  var next = parsed.major + 1;
  return parsed.letter + (next < 10 ? '0' : '') + next;
}
function _dslCalcRevertDraft(){
  var highest = 0;
  if(window._dslLastDraftNum) highest = window._dslLastDraftNum;
  else { var m = (_dslCurrentRevision()||'').match(/^A(\d+)$/); if(m) highest = parseInt(m[1],10); }
  var next = highest + 1;
  return 'A' + (next < 10 ? '0' : '') + next;
}
function _dslCurrentRevision(){
  var revEl = document.getElementById('pi-revision');
  var v = revEl && revEl.value ? revEl.value.trim() : '';
  if(v) return v;
  if(typeof formRevision === 'string' && formRevision.trim()) return formRevision.trim();
  return 'A01';
}
function _dslSetRevision(newRev){
  var revEl = document.getElementById('pi-revision');
  if(revEl) revEl.value = newRev;
  try { formRevision = newRev; } catch(e){}
}
function _dslSetStatusBadges(label, bg){
  var badge = document.getElementById('issue-status-badge');
  if(badge){ badge.textContent = label; badge.style.setProperty('background', bg, 'important'); badge.style.display = 'inline-block'; }
  var pbb = document.getElementById('pb-badge');
  if(pbb){ pbb.textContent = label; pbb.style.setProperty('background', bg, 'important'); }
}
// S366: derive badge label+colour from the revision string, matching FRT exactly
// (frt_app.js). DRAFT/REVISION = amber #E67E22, ISSUED = green #1A7A4A.
function _dslBadgeFromRevision(rev){
  var parsed = _dslParseRevision(rev || _dslCurrentRevision());
  var st = parsed.issued ? (parsed.hasSuffix ? 'REVISION' : 'ISSUED') : 'DRAFT';
  var colors = { DRAFT:'#E67E22', ISSUED:'#1A7A4A', REVISION:'#E67E22' };
  return { label: st, color: colors[st] || '#E67E22' };
}
function _dslSyncStatusBadges(){
  var b = _dslBadgeFromRevision();
  _dslSetStatusBadges(b.label, b.color);
}

function issueReport(){
  if(!_csHubMode || typeof CloudSync === 'undefined' || !CloudSync.isInitialized){
    showToast('Issue is only available when launched from the Hub', 3000);
    return;
  }
  var rev = _dslCurrentRevision();
  var parsed = _dslParseRevision(rev);
  var isDark = document.body.classList.contains('dark-mode');
  var bg  = isDark ? '#161420' : '#fff';
  var fg  = isDark ? '#f4f3f6' : '#1B1A22';
  var fg2 = isDark ? '#a09aa8' : '#5E5B68';

  var ov = document.createElement('div');
  ov.id = 'issue-modal-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(16,20,30,.62);z-index:99993;display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;padding:18px;';

  var okBg   = isDark ? 'rgba(63,208,138,.14)' : '#E2F0E9', okBd  = isDark ? 'rgba(63,208,138,.45)' : 'rgba(46,158,114,.4)', okTx = isDark ? '#3FD08A' : '#1d5e42';
  var wnBg   = isDark ? 'rgba(224,163,106,.14)' : '#F7ECD9', wnBd  = isDark ? 'rgba(224,163,106,.45)' : 'rgba(217,138,30,.4)', wnTx = isDark ? '#E0A36A' : '#7a4a14';
  var nuBg   = isDark ? 'rgba(70,197,232,.13)'  : '#E7EEF5', nuBd  = isDark ? 'rgba(70,197,232,.4)'  : 'rgba(44,127,184,.38)', nuTx = isDark ? '#46C5E8' : '#27506e';
  function rowBtn(act,target,icon,text,b,bd,tx){
    return '<button data-issue-action="'+act+'" data-rev="'+target+'" style="width:100%;margin-bottom:10px;text-align:left;padding:12px 16px;font-size:calc(14px + var(--ts));font-weight:700;font-family:Calibri,sans-serif;border:1px solid '+bd+';background:'+b+';color:'+tx+';border-radius:9px;cursor:pointer;">'
      + icon+' '+text+'<span style="float:right;font-weight:400;opacity:.85;">'+rev+' \u2192 <b>'+target+'</b></span></button>';
  }
  var html = '<div style="background:'+bg+';border-radius:14px;padding:26px 30px;max-width:430px;width:100%;box-shadow:0 18px 60px rgba(0,0,0,.45);color:'+fg+';">';
  html += '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">\uD83D\uDCCB Report Status</div>';
  html += '<div style="font-size:calc(13px + var(--ts));color:'+fg2+';margin-bottom:20px;">Current revision: <b style="color:'+fg+';">'+rev+'</b></div>';
  html += rowBtn('issue', _dslCalcIssueRevision(parsed), '\uD83D\uDCCB', 'Issue Report', okBg, okBd, okTx);
  if(parsed.issued && !parsed.hasSuffix){
    html += rowBtn('revise', rev + 'A01', '\u270F\uFE0F', 'Revise Issued Report', wnBg, wnBd, wnTx);
  }
  if(parsed.issued){
    html += rowBtn('revert', _dslCalcRevertDraft(), '\u21A9\uFE0F', 'Revert to Draft', nuBg, nuBd, nuTx);
  }
  html += '<button data-issue-action="cancel" style="width:100%;margin-top:4px;padding:11px 16px;font-size:calc(14px + var(--ts));font-weight:700;font-family:Calibri,sans-serif;border:1.5px solid '+(isDark?'rgba(224,128,128,.25)':'rgba(192,57,43,.25)')+';background:'+(isDark?'#2e1a1a':'rgba(192,57,43,.04)')+';color:'+(isDark?'#e08080':'#A85959')+';border-radius:9px;cursor:pointer;">Cancel</button>';
  html += '</div>';
  ov.innerHTML = html;

  ov.addEventListener('click', function(e){
    var btn = e.target.closest('[data-issue-action]');
    if(!btn) return;
    var act = btn.getAttribute('data-issue-action');
    var newRev = btn.getAttribute('data-rev') || '';
    ov.remove();
    if(act === 'issue') _dslDoIssue(newRev);
    else if(act === 'revise') _dslDoRevise(newRev);
    else if(act === 'revert') _dslDoRevertDraft(newRev);
  });
  document.body.appendChild(ov);
}

async function _dslPatchStatus(status){
  if(CloudSync.instanceId){
    await CloudSync.request('/rest/v1/tool_data?id=eq.' + CloudSync.instanceId, {
      method: 'PATCH',
      body: { status: status, updated_at: new Date().toISOString() }
    });
  }
}
async function _dslDoIssue(newRev){
  var curMatch = _dslCurrentRevision().match(/^A(\d+)$/);
  if(curMatch) window._dslLastDraftNum = parseInt(curMatch[1],10);
  _dslSetRevision(newRev);
  try {
    await CloudSync.save(_collectCloudState());
    await _dslPatchStatus('issued');
    _dslSyncStatusBadges();
    showToast('\u2713 Report issued as ' + newRev, 3000);
  } catch(e){ showToast('Failed to issue: ' + e.message, 3000); }
}
async function _dslDoRevise(newRev){
  _dslSetRevision(newRev);
  try {
    await CloudSync.save(_collectCloudState());
    await _dslPatchStatus('draft');
    _dslSyncStatusBadges();
    showToast('Revision started: ' + newRev, 3000);
  } catch(e){ showToast('Failed to start revision: ' + e.message, 3000); }
}
async function _dslDoRevertDraft(newRev){
  _dslSetRevision(newRev);
  try {
    await CloudSync.save(_collectCloudState());
    await _dslPatchStatus('draft');
    _dslSyncStatusBadges();
    showToast('Reverted to draft: ' + newRev, 3000);
  } catch(e){ showToast('Failed to revert: ' + e.message, 3000); }
}

function showSaveToast(msg, color) {
  let t = document.getElementById('save-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'save-toast';
    t.style.cssText = 'position:fixed;bottom:18px;right:18px;background:#5F8068;color:white;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;font-family:Calibri,sans-serif;letter-spacing:.5px;z-index:9999;transition:opacity .4s;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = color || '#5F8068';
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

function loadAutosave() {
  // Try IDB first, fall back to localStorage (migration path)
  var key = getProjectSaveKey();
  _idbGet(key).then(function(val){
    if(!val){
      // Try localStorage migration
      var lsVal = localStorage.getItem(key) || localStorage.getItem('arencon_pump_v10');
      if(lsVal){ _idbPut(key,lsVal); val=lsVal; }
    }
    if(val) _applyLoadedState(val);
    updateIDBStorageBar();
  }).catch(function(){
    // IDB unavailable — localStorage only
    var val=localStorage.getItem(key)||localStorage.getItem('arencon_pump_v10');
    if(val)_applyLoadedState(val);
  });
}
function _assignRowPreservePhotos(target, src){
  if(!target || !src) return;
  var localPhotos = Array.isArray(target.photos) ? target.photos.slice() : [];
  Object.assign(target, src);
  if(Array.isArray(target.photos)){
    // Re-attach local binary/pointers onto matching cloud photos (by id).
    target.photos.forEach(function(np){
      if(!np) return;
      var lp = localPhotos.filter(function(x){return x && np.id && x.id===np.id;})[0];
      if(lp){
        if(!np.d && lp.d) np.d = lp.d;                                  // keep local blob
        if(!np.r2Url && lp.r2Url){ np.r2Url=lp.r2Url; np.r2Key=lp.r2Key; }
        if(!np.tag && lp.tag) np.tag = lp.tag;                          // keep reading assignment
      }
    });
    // ROOT-CAUSE FIX (7-Point loss): a photo just captured on a secondary tab may
    // not yet exist in the cloud copy of this row when the merge runs (upload not
    // confirmed / save raced the merge). The old code iterated only cloud photos,
    // so a local-only capture was silently dropped. Union in any local photo whose
    // id is absent cloud-side AND that still holds usable bytes/pointer — never
    // lose an un-synced field capture. (Skip local rows already tombstoned.)
    var cloudIds = {};
    target.photos.forEach(function(np){ if(np && np.id) cloudIds[np.id]=1; });
    localPhotos.forEach(function(lp){
      if(!lp || !lp.id || cloudIds[lp.id]) return;
      if(lp.deleted || lp.delState==='deleted') return;                 // honor real deletes
      if(lp.d || lp.r2Url){ target.photos.push(lp); }                   // keep un-synced capture
    });
  } else if(localPhotos.length){
    target.photos = localPhotos;                                        // cloud sent none — keep local
  }
}
function _applyLoadedState(raw) {
  try {
    var raw2 = null;
    var embEl = document.getElementById('embedded-state');
    if(embEl) {
      var embText = embEl.textContent.trim();
      if(embText && embText !== '{}') raw2 = embText;
    }
    var raw_final = raw2 || raw;
    if (!raw_final) return;
    raw = raw_final; // use embedded if present (save-as HTML)
    const s = JSON.parse(raw);
    if(typeof _normalizeAllPhotoDel==='function') _normalizeAllPhotoDel(s); // S354: migrate photo deletion flags to canonical model on load
    if(Array.isArray(s.appendixExcluded) && typeof _appendixExcl!=='undefined'){ _appendixExcl = new Set(s.appendixExcluded); }   // S315 F1
    // Project fields
    // S264 fix: when Hub-launched, the project IDENTITY fields (proj no / name /
    // client / address) are authoritative from the URL params and were set readOnly
    // at boot. A saved blob can carry a DIFFERENT project's stale values for these
    // (observed: header showed 1490.04 from params while these fields showed 15230.01
    // from an old blob). Never let saved state overwrite a Hub-locked field — params
    // win. Once the correct values stand and the user saves, collectState() re-reads
    // the DOM and the blob self-heals. Non-Hub (standalone) load is unaffected.
    var _hubLockedIds = (typeof _csHubMode!=='undefined' && _csHubMode)
      ? {'pi-projno':1,'pi-projname':1,'pi-client':1,'pi-addr':1} : {};
    Object.entries(s.proj||{}).forEach(([id,val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (_hubLockedIds[id] && el.readOnly) return; // params authoritative — do not clobber
      el.value = val;
    });
    // Test type
    if (s.testType) {
      const r = document.querySelector(`input[name="pump-test-type"][value="${s.testType}"]`);
      if (r) { r.checked = true; setPumpTestType(s.testType); }
    }
    // stdData — assign fields, but preserve any local photo binary the incoming copy lacks
    if (s.stdData) s.stdData.forEach((r,i) => { if(stdData[i]) _assignRowPreservePhotos(stdData[i], r); });
    if (s.npshPsi !== undefined) { npshPsi = s.npshPsi; var _ne=document.getElementById('npsh-psi'); if(_ne) _ne.value = s.npshPsi||''; }
    if (s.npshPsiPld !== undefined) { npshPsiPld = s.npshPsiPld; var _nep=document.getElementById('npsh-psi-pld'); if(_nep) _nep.value = s.npshPsiPld||''; }
    // pldData
    if (s.pldData) s.pldData.forEach((r,i) => { if(pldData[i]) _assignRowPreservePhotos(pldData[i], r); });
    // safety margin per-chart state (on/off + chip offset)
    if (s.smState){ Object.keys(smState).forEach(function(k){ if(s.smState[k]) Object.assign(smState[k], s.smState[k]); }); }
    if (s.smCapVis){ Object.keys(smCapVis).forEach(function(k){ if(s.smCapVis[k]) Object.assign(smCapVis[k], s.smCapVis[k]); }); }
    if (s.annDsForce){ Object.keys(annDsForce).forEach(function(k){ if(s.annDsForce[k]) annDsForce[k]=Object.assign({}, s.annDsForce[k]); }); }
    // pumpCurvePoints
    if (s.pumpCurvePoints) {
      pumpCurvePoints.length = 0;
      s.pumpCurvePoints.forEach(p => pumpCurvePoints.push(p));
    }
    if (s.pldPumpCurvePoints) {
      pldPumpCurvePoints.length = 0;
      s.pldPumpCurvePoints.forEach(p => pldPumpCurvePoints.push(p));
    }
    // clState
    if (s.clState) { var _migCl2=_migrateClState(s.clState, s.clSchemaVer); Object.assign(clState, _migCl2); Object.keys(clState).forEach(function(k){ if(clState[k]) delete clState[k].timestamp; }); }
    // customItems
    if (s.customItems) Object.assign(customItems, s.customItems);
    // contractors + deficiencies
    if (s.contractors) {
      contractors.length = 0;
      s.contractors.forEach(c => contractors.push(c));
    }
    if (Array.isArray(s.distribution)) { distribution.length = 0; s.distribution.forEach(n => distribution.push(n)); }   // S328
    if (s.contractorTrades) contractorTrades = JSON.parse(JSON.stringify(s.contractorTrades));
    if (s.deficiencies) {
      Object.keys(deficiencies).forEach(k => delete deficiencies[k]);
      Object.assign(deficiencies, s.deficiencies);
    }
    if (s.generalDeficiencies) { generalDeficiencies.length=0; s.generalDeficiencies.forEach(function(d){generalDeficiencies.push(d);}); }
    // contractorSignRows
    if (s.contractorSignRows) {
      contractorSignRows.length = 0;
      s.contractorSignRows.forEach(r => contractorSignRows.push(r));
    }
    /* S496 audit fix: witnessSignRows was COLLECTED on every save but never
       RESTORED here — the only state key with that asymmetry. Round-trip damage:
       add a witness (AHJ / owner rep) row -> it saves to cloud -> reload -> the
       in-memory array is empty, the UI shows no witness rows, and the NEXT save
       pushes the empty array back, permanently erasing the witness signatures
       from the cloud as well. renderAllSignRows() below already rebuilds the
       witness container and restores witness signature ink (canvas c-100+); the
       array restore was the single missing link. */
    if (s.witnessSignRows) {
      witnessSignRows.length = 0;
      s.witnessSignRows.forEach(r => witnessSignRows.push(r));
    }
    if (s.sigStrokes && typeof _sigStrokes!=='undefined'){ Object.keys(_sigStrokes).forEach(function(k){delete _sigStrokes[k];}); Object.keys(s.sigStrokes).forEach(function(k){ _sigStrokes[k]=s.sigStrokes[k]; }); }
    // flowTestPhotos
    if (s.flowTestPhotosPld) { flowTestPhotosPld.length=0; s.flowTestPhotosPld.forEach(p=>flowTestPhotosPld.push(p)); renderFlowTestThumbsPld(); }
    // batData
    if (s.batData) {
      if(s.batData.b1) batData.b1 = s.batData.b1.map(Number);
      if(s.batData.b2) batData.b2 = s.batData.b2.map(Number);
      renderBatTable('bat1-body','b1');
      renderBatTable('bat2-body','b2');
      updateBatTotals();
    }
    // deletedItems
    if (s.deletedItems) {
      Object.keys(s.deletedItems).forEach(function(k){
        deletedItems[k] = new Set(s.deletedItems[k]);
      });
    }
    // flowTestPhotosPld
    if (s.flowTestPhotosPld) { flowTestPhotosPld.length=0; s.flowTestPhotosPld.forEach(function(p){flowTestPhotosPld.push(p);}); renderFlowTestThumbsPld(); }
    if (s.flowTestPhotos) {
      flowTestPhotos.length = 0;
      s.flowTestPhotos.forEach(p => flowTestPhotos.push(p));    }
    // recordPhotos (site records: pump / placard / site)
    if (s.recordPhotos) {
      recordPhotos.length = 0;
      s.recordPhotos.forEach(function(p){ recordPhotos.push(p); });
      if(typeof _renderRecordZones==='function') _renderRecordZones();
    }
    // sketchEntries
    if (s.sketchEntries) {
      sketchEntries.length = 0;
      s.sketchEntries.forEach(e => sketchEntries.push(e));
    }
    // Revision
    if (s.formRevision) { formRevision = s.formRevision; }
    if (s.formDateModified) { formDateModified = s.formDateModified; }
    updateRevisionDisplay();
    // Re-render
    renderStdTable();
    renderPldTable();
    renderPumpCurveTable();
    renderPldPumpCurveTable();
    renderFlowTestThumbs();
    renderContractorTags();
    renderDeficGroups();
    updateDeficSummary();
    renderAllSignRows();
    calcTotalDemand();
    calcTotalDemandPld();
    syncAllFields();
    refreshAllCharts();
    // S239: if the Performance Test tab is the active panel at load time, the plain
    // refreshAllCharts() above runs while the canvas may not be measured yet. Re-run
    // the deferred+resize path so the charts actually paint without needing a keystroke.
    if (document.getElementById('panel-s4') && document.getElementById('panel-s4').classList.contains('active')) {
      _refreshS4Charts();
    }
    // Re-render checklists
    /* S496 ROOT FIX (Mark's field repro: FA items 5.1-5.3 "won't stick"):
       this list omitted 's5m' (Mandatory FACP, S5_mandatory -> #cl-s5-mandatory),
       so after every load those three items kept their PRE-LOAD empty render while
       clState correctly held the loaded statuses. They always LOOKED unset; saves
       worked; the next load hid them again. Worse: tapping YES on an item that
       looked unset but internally held 'yes' hit the toggle-to-clear rule
       ((prev===status) ? null : status) and silently ERASED the saved answer.
       The heartbeat's own re-render map (L~11119) always included s5m — only this
       boot-apply list was short. Lists now identical. */
    ['s1','s2','s3','s4','s4pld','s5m','s5'].forEach(sec => {
      const cont = document.getElementById({s5m:'cl-s5-mandatory'}[sec] || ('cl-'+sec));
      if (!cont) return;
      const sMap = {s1:S1,s2:S2,s3:S3,s4:S4_items,s4pld:S4_items,s5m:S5_mandatory,s5:S5};
      if(sMap[sec]) renderChecklist(sMap[sec], {s5m:'cl-s5-mandatory'}[sec] || ('cl-'+sec), sec);
    });
    setTimeout(function(){ updateProgress(); updateVerdict(); try{ if(typeof _pgPurgeExpired==='function') _pgPurgeExpired(); }catch(_e){} try{ if(typeof _rebuildAllMkDisplays==='function') _rebuildAllMkDisplays(); }catch(_e){} }, 200);
  } catch(e) {
    console.error('Load error:', e);
  }
}

// ══════════════════════════════════════════════════
// RESET FUNCTIONS
// ══════════════════════════════════════════════════
function resetAllPages() {
  _aTypeConfirm('Reset ALL pages for this project? This permanently clears every entered value, photo reference, and deficiency across all pages. This cannot be undone.', 'reset', function(){
  if(_csHubMode && typeof CloudSync !== 'undefined'){
    // Cloud mode: will reload which triggers fresh load
  } else {
    localStorage.removeItem(SAVE_KEY);
    var _rkey=getProjectSaveKey();localStorage.removeItem(_rkey);
    _idbDelete(_rkey).catch(function(){});
  }
  location.reload();
  },'Reset all pages');
}



function resetCurrentPage() {
  _pushUndo();
  const active = PANELS.find(p => document.getElementById('panel-'+p)?.classList.contains('active'));
  if (!active) return;
  const label = {'proj':'Project Info','s1':'Pre-Commissioning','s2':'Visual Inspection','s3':'Controller Tests',
    's4':'Performance Test','s4pld':'Performance Test','s5':'FA & Signaling','defic':'Deficiencies','sign':'Signature','sketch':'Sketches'}[active]||active;
  _aTypeConfirm(`Reset "${label}" page? This permanently clears all data entered on this page. This cannot be undone.`, 'reset', function(){
  if (active === 'proj') {
    ['pi-projno','pi-client','pi-projname','pi-addr','pi-prepby','pi-date',
     'pi-contractor','pi-version'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = '';
    });
  } else if (active === 's4' || active === 's4pld') {
    // Reset stdData including flow
    stdData.forEach(function(r,i) { r.flow=(i===0?0:null); r.cutsheet='';r.placard='';r.suction='';r.discharge='';r.rpm='';r.photos=[]; });
    // Reset pldData including flow
    pldData.forEach(function(r) { r.flow='';r.cutsheet='';r.placard='';r.suc_no='';r.dis_no='';r.rpm_no='';r.suc_w='';r.dis_w='';r.rpm_w='';r.photos=[]; });
    // Reset all meta fields
    ['pm-prv','pm-rpm','pm-equip','pm-pitot','pm-pitotflow','pm-rated-flow',
     'pm-relief','pm-reducing','pm-relief-pld','pm-reducing-pld',
     'pm-prv-pld','pm-pld-setting','pm-rpm-pld','pm-pitot-pld','pm-pitotflow-pld','pm-rated-flow-pld',
     'ws-static-flow','ws-static-psi','ws-res-flow','ws-res-psi','dem-spr-flow','dem-spr-psi','dem-hose-flow',
     'dem-flow','dem-psi',
     'pld-ws-static-flow','pld-ws-static-psi','pld-ws-res-flow','pld-ws-res-psi',
     'pld-dem-spr-flow','pld-dem-spr-psi','pld-dem-hose-flow',
     'pld-dem-flow','pld-dem-psi'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = '';
    });
    // Reset pump curve points
    pumpCurvePoints.length = 0; pumpCurvePoints.push({flow:'',psi:''});
    pldPumpCurvePoints.length = 0; pldPumpCurvePoints.push({flow:'',psi:''});
    // Reset flow test photos
    flowTestPhotos.length = 0; renderFlowTestThumbs();
    flowTestPhotosPld.length = 0; renderFlowTestThumbsPld();
    // Re-render everything
    renderStdTable(); renderPldTable(); renderPumpCurveTable(); renderPldPumpCurveTable();
    calcTotalDemand3pt(); calcTotalDemandPld(); refreshAllCharts();
  } else if (active === 'defic') {
    contractors.length = 0;
    contractorTrades = {};
    Object.keys(deficiencies).forEach(k => delete deficiencies[k]);
    generalDeficiencies.length = 0;
    renderContractorTags(); renderDeficGroups(); renderGeneralDeficGroup(); updateDeficSummary();
  } else if (active === 'sign') {
    ['so-name','so-title','so-company','so-date'].forEach(id => { const el=document.getElementById(id);if(el)el.value=''; });
    contractorSignRows.length = 0; renderAllSignRows(); addContractorSignRow();
  } else if (active === 'sketch') {
    sketchEntries.length = 0;
    const sc = document.getElementById('sketch-container');
    if (sc) sc.innerHTML = '';
  } else {
    // Checklist section
    const srcMap = {s1:S1,s2:S2,s3:S3,s5:S5};
    const items = srcMap[active];
    if (items) {
      items.forEach(function(_,idx) {
        var cid2 = cid(active,idx);
        clState[cid2] = {status:null, comment:'', photos:[], customText:''};
      });
      delete customItems[active];
      renderChecklist(items, 'cl-'+active, active);
      /* S496 audit fix: the FA page is TWO checklist sections — the Mandatory
         FACP block (s5m, items 5.1–5.3) plus the regular s5 list (5.4+). This
         reset only cleared s5, so "Reset Current Page" on FA left 5.1–5.3
         holding their answers. Same missing-s5m family as the load-repaint bug. */
      if (active === 's5' && typeof S5_mandatory !== 'undefined') {
        S5_mandatory.forEach(function(_,idx) {
          clState[cid('s5m',idx)] = {status:null, comment:'', photos:[], customText:''};
        });
        delete customItems['s5m'];
        renderChecklist(S5_mandatory, 'cl-s5-mandatory', 's5m');
      }
    }
  }
  debounceAutosave();
  },'Reset');
}


// ═══ SAVE & LEAVE (Hub mode) ═══
// S264: per Mark, no leave PROMPT — the tool auto-saves and a Back/logo tap forces a
// full cloud save, then navigates. Mirrors FRT's auto-save (no Save button) model.
// The old 3-button modal is retired; _showSaveLeaveModal now performs the save+go
// directly so any existing caller keeps working without a dialog.
function _showSaveLeaveModal(destUrl) { _saveThenLeave(destUrl); }
async function _saveThenLeave(destUrl) {
  // Brief, non-blocking indicator (subtle, not a toast-spam) while the forced save runs.
  try {
    var _c = window.__dslHeaderCtl;
    if(_c) _c.setCloud({ visible:true, state:'sync', text:'Saving…' });
  } catch(e){}
  try {
    if(typeof CloudSync !== 'undefined' && CloudSync.projectId) {
      await CloudSync.save(JSON.stringify(_collectCloudState())); // force a full cloud save
    } else {
      saveState();
    }
  } catch(e) { /* network/quota — proceed; autosave + outbox will reconcile */ }
  window.location.href = destUrl;
}

// Intercept navigation links in Hub mode — save then go, no prompt.
// Back button uses its inline onclick=goBackToHub() (which now save-then-leaves);
// only the logo link needs an intercept here (it has no inline handler).
function _wireNavIntercepts() {
  /* S488: the logo lives inside the sealed header; its save-guard moved into the
     engine config's onHome handler. */
  if(true) return;
  if(typeof CloudSync === 'undefined' || !CloudSync.projectId) return;
  var logoLink = document.getElementById('logo-link');
  if(logoLink) {
    logoLink.addEventListener('click', function(e) {
      e.preventDefault();
      _saveThenLeave(logoLink.href);
    });
  }
}

// Fallback: browser beforeunload for accidental tab close (standalone mode only)
window.addEventListener('beforeunload', function(e) {
  if(new URLSearchParams(window.location.search).get('project')) return;
  e.preventDefault();
  e.returnValue = '';
});
window.addEventListener('load', () => {
  // ── Inactivity tracker — shared with Hub PIN lock ──
  var _actThrottle=0;
  function _stampActivity(){var n=Date.now();if(n-_actThrottle<30000)return;_actThrottle=n;try{localStorage.setItem('ARENCON_lastActivity',n.toString());}catch(e){} if(typeof _resetSessionTimers==='function')_resetSessionTimers();}
  document.addEventListener('click',_stampActivity,true);
  document.addEventListener('touchstart',_stampActivity,true);
  document.addEventListener('keydown',_stampActivity,true);
  _stampActivity();

  initChart3pt();
  initNetChart3pt();
  initPldChart();
  initPldNetChart();
  setTimeout(function(){ if(typeof applyChartDarkMode==='function') applyChartDarkMode(); }, 100);
  _installChartVisibilityObserver();
  initSig('sig-canvas');
  renderAllSignRows();
  addContractorSignRow();
  renderDeficGroups();
  updateDeficSummary();
  updateOfflineStatus();

  // ── CloudSync or Standalone Init ──
  function _cloudSyncInit(){
    /* S496 Phase 2: also wait for diesel-sync.js. It is a MODULE script, so it
       runs deferred — after this classic inline code. Without this guard the
       first _cloudSyncInit tick would see CloudSync undefined and throw. */
    if(!_idb_db || typeof CloudSync==='undefined'){ setTimeout(_cloudSyncInit, 50); return; }

    var params = CloudSync.readUrlParams();

    if(params.projectId){
      // REPORT ISOLATION (item C) — HARD BLOCK: a Hub launch with no ?instance=
      // used to fall through to the "latest row" for this project, so a stale
      // bookmark or old Hub build could silently load AND overwrite another
      // inspector's report. Every report must be independent. If we're in Hub mode
      // without an explicit instance, refuse to load or save any cloud data and
      // tell the user to open the report from the Hub (where the picker mints/loads
      // a specific ?instance=). Fixed overlay only — never touch .main-wrap.
      if(!params.instanceId){
        /* S497 batch 1: engine panel, dismissable:false — this is a HARD BLOCK,
           not a dialog. No ✕, no Esc, no scrim exit: the ONLY way forward is
           the Hub button, because dismissing it would let the user interact
           with a report the isolation rule refuses to load. Timing safe by
           construction: _cloudSyncInit self-defers until CloudSync (a module)
           exists, and modules run as a batch — if CloudSync is defined, the
           engine bridge is too. Fail-safe unchanged either way: the `return`
           below refuses cloud init whether or not anything renders. The plain
           fallback stays deliberately: a hard block that fails to RENDER must
           still visibly block — an invisible refusal over a dead report is
           worse than duplicated markup. */
        try{
          var _D=window.ArenconDlg;
          if(_D && _D.panel){
            _D.panel({
              title:'Open this report from the Project Hub',
              icon:'\u26D4', accent:'fail', dismissable:false,
              build:function(bd){
                var d=document.createElement('div');
                d.textContent='This link is missing a specific report. To keep each inspector\u2019s report separate, open the Diesel report from its project in the Hub \u2014 pick an existing report or create a new one.';
                bd.appendChild(d);
              },
              buttons:[{label:'Go to Project Hub', kind:'primary', onClick:function(){
                window.location.href='../ARENCON_Project_Hub.html'; return false;
              }}]
            });
          } else {
            var _ov=document.createElement('div');
            _ov.id='no-instance-block';
            _ov.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(11,10,13,.72);backdrop-filter:blur(6px);font-family:Calibri,sans-serif;padding:24px;';
            _ov.innerHTML='<div style="max-width:420px;background:#fff;border-radius:16px;padding:28px 26px;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center;">'
              +'<div style="font-size:15px;font-weight:700;color:#9C2742;margin-bottom:10px;">Open this report from the Project Hub</div>'
              +'<div style="font-size:13px;line-height:1.5;color:#5E5B68;margin-bottom:18px;">This link is missing a specific report. To keep each inspector\u2019s report separate, open the Diesel report from its project in the Hub \u2014 pick an existing report or create a new one.</div>'
              +'<a href="ARENCON_Project_Hub.html" style="display:inline-block;background:#9C2742;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 22px;border-radius:10px;">Go to Project Hub</a>'
              +'</div>';
            document.body.appendChild(_ov);
          }
        }catch(_e){}
        return;   // no cloud init, no autosave, no load — cannot clobber a shared row
      }
      // Hub mode: launched with ?project=<uuid>
      _csHubMode = true;
      _csProjectId = params.projectId;
      _r2FolderId = params.projectId;
      if(typeof R2Photos!=='undefined'){ R2Photos.init({}); }
      // Phase 2: durable outbox — resume any uploads interrupted by a prior
      // app kill, and mark photos 'uploaded' once R2 confirms the object.
      if(typeof R2Outbox!=='undefined'){
        R2Outbox.init();
        R2Outbox.setOnVerified(function(key){
          var changed=false;
          _forEachLivePhoto(function(p){ if(p && p.r2Key===key && p.r2Status!=='uploaded'){ p.r2Status='uploaded'; changed=true; } });
          // S264: the status field was flipping silently — the cloud icon stayed on
          // "pending" until the gallery was manually reopened. Debounce-repaint the
          // gallery (only if it's open) so the inspector sees photos go green live.
          if(changed) _pgRepaintCloudSoon();
        });
        setTimeout(function(){ R2Outbox.drive().then(function(){ if(typeof _r2ReconcilePhotos==='function') _r2ReconcilePhotos(); }); }, 2500);
        // S282 B5: the 2.5s pass can land before the async cloud load + B2 binary
        // merge finishes populating live photo arrays — re-run once after settle,
        // and on every reconnect (after the outbox's own online-drive at 1.2s).
        setTimeout(function(){ if(typeof _r2ReconcilePhotos==='function') _r2ReconcilePhotos(); }, 12000);
        // S306 (1a): one-shot duplicate-(original) cleanup after the cloud load +
        // binary merge has settled, so recordPhotos reflects merged truth.
        setTimeout(function(){ if(typeof _dedupeOrigBackups==='function') try{ _dedupeOrigBackups(); }catch(e){ console.warn('[DLB] dedupe pass failed', e); } }, 13000);
        window.addEventListener('online', function(){ setTimeout(function(){ if(typeof _r2ReconcilePhotos==='function') _r2ReconcilePhotos(); }, 4000); });
      }
      _csInstanceId = params.instanceId;

      // Show back button (goes to Hub with project detail open)
      {   /* S488: Back is engine-owned (setHubMode below); block kept for the project bar. */

      // Show project bar with smart filename
      var _pbEl=document.getElementById('project-bar');
      if(_pbEl)_pbEl.classList.add('visible');
      var _pbFn=document.getElementById('pb-filename');
      if(_pbFn){
        var _sfn=params.smartFilename||(params.projectNumber?params.projectNumber+' '+(params.projectName||''):'');
        _pbFn.textContent=_sfn;
        window._csHubSfn=_sfn;
      }
      var _pbBdg=document.getElementById('pb-badge');
      if(_pbBdg){
        // S342b: was hardcoded '#8A7689' (mauve) on load → badge showed the wrong
        // colour until a status change. Derive label+colour from the revision the
        // same way FRT does, so DRAFT is amber from first paint and never drifts.
        if(typeof _dslSyncStatusBadges==='function'){ _dslSyncStatusBadges(); }
        else { _pbBdg.textContent='DRAFT'; _pbBdg.style.setProperty('background','#E67E22','important'); }
      }

      }

      /* S488: hub-mode header state via the sealed engine's controller. hubOnly
         controls (Reports, R2 repair items) reveal themselves from config. */
      var _c = window.__dslHeaderCtl;
      if(_c){
        _c.setHubMode({ hub:true, backVisible:true,
          logoHref:'../ARENCON_Project_Hub.html', logoTitle:'Back to Project Hub' });
        _c.setControlHidden('signout', false);
        _c.setControlHidden('qr', false);
        _c.setCloud({ visible:true });
      }

      // Pre-fill project-level fields from URL params (read-only when Hub-launched)
      if(params.projectNumber){
        var el = document.getElementById('pi-projno');
        if(el){ el.value = params.projectNumber; el.readOnly = true; el.style.opacity = '0.7'; }
      }
      if(params.projectName){
        var el = document.getElementById('pi-projname');
        if(el){ el.value = params.projectName; el.readOnly = true; el.style.opacity = '0.7'; }
      }
      if(params.client){
        var el = document.getElementById('pi-client');
        if(el){ el.value = params.client; el.readOnly = true; el.style.opacity = '0.7'; }
      }
      if(params.address){
        var el = document.getElementById('pi-addr');
        if(el){ el.value = params.address; el.readOnly = true; el.style.opacity = '0.7'; }
      }

      // Initialize CloudSync
      CloudSync.init({
        projectId: _csProjectId,
        toolKey: 'diesel',
        instanceId: _csInstanceId,
        onStatusChange: function(status, msg){
          var _c = window.__dslHeaderCtl;
          if(_c) _c.setCloud({ visible:true,
            state: (status === 'synced' || status === 'saved') ? 'ok'
                 : (status === 'error' ? 'err' : (status === 'offline' ? 'off' : 'sync')),
            text: msg || (status === 'synced' ? 'Saved to cloud' : status) });
          // S263: last-sync display ported from FRT. Stamp on a successful cloud sync, then tick.
          if(status === 'synced' || status === 'saved'){ _lastSyncTs = Date.now(); _renderLastSync(); _startLastSyncTicker(); }
        }
      }).then(function(info){
        // S265: derive + lock inspector identity from the signed-in user (shared key with FRT).
        if(info && info.userId){ _updateInspectorChip(); _deriveInspectorIdentity(info.userId); }
        // Load data from cloud/IDB
        return CloudSync.load();
      }).then(async function(result){
        if(result && result.state){
          /* S488 ROOT FIX for Mark's field repro (photo -> pull-to-refresh -> gone,
             airplane AND online): the S281 B2 merge below is the right idea and the
             S335 union inside _mergeCloudLocal is fully capable of rescuing a
             local-only fresh capture — but this block fed it the WRONG LOCAL.
             `collectState()` at boot reads the not-yet-populated DOM: an EMPTY
             state. The merge ran faithfully against nothing and rescued nothing;
             the IDB autosave (where photoMint v1.1.0 durably saved the photo at
             birth) was never read at all on the hub path. And when CloudSync
             served its own cached copy (airplane mode), source !== 'cloud'
             skipped the merge entirely — applying a stripped snapshot raw.
             Now: local = the actual IDB autosave, merged on EVERY source
             (a cached CloudSync state is cloud-shaped and equally stripped).
             Canon holds: cloud owns structure, local owns binary — with the
             real local this time. */
          var _toApply = result.state;
          try {
            var _rawLocal = await _idbGet(getProjectSaveKey()).catch(function(){ return null; });
            var _localNow = _rawLocal ? JSON.parse(_rawLocal) : null;
            if(_localNow){ _toApply = _mergeCloudLocal(result.state, _localNow); }
          } catch(e){ console.warn('[S488] boot merge fallback (applying cloud raw):', e && e.message); _toApply = result.state; }
          _applyLoadedState(JSON.stringify(_toApply));
          showToast('Project loaded from ' + result.source, 2000);
          if(result.source==='cloud') setTimeout(_r2PrefetchPhotos, 800);
        }
        // Show status badge — S366: derive from the restored revision string with
        // FRT colours (ISSUED green #1A7A4A, DRAFT/REVISION amber #E67E22). Falls back to
        // the Supabase status only for 'review' (no revision-grammar equivalent).
        var badge = document.getElementById('issue-status-badge');
        if(badge){
          var _rowSt = (result && result.row && result.row.status) || 'draft';
          if(_rowSt === 'review'){
            badge.textContent = 'REVIEW'; badge.style.setProperty('background','#1565C0','important');
            var _pbR=document.getElementById('pb-badge'); if(_pbR){ _pbR.textContent='REVIEW'; _pbR.style.setProperty('background','#1565C0','important'); }
          } else {
            _dslSyncStatusBadges();
          }
          badge.style.display = 'inline-block';
        }
        // Start auto-save (30s)
        CloudSync.startAutoSave(_collectCloudState, 30000);
        // Start heartbeat sync (60s)
        _startHeartbeat();
        _wireNavIntercepts();
        _resetSessionTimers();
        updateProgress();
        updateIDBStorageBar();
      }).catch(function(e){
        console.error('CloudSync init error:', e);
        showToast('Cloud sync failed — working in local mode', 3000);
        loadAutosave();
      });

    } else {
      // Standalone mode: check for embedded state or load from IDB
      var embEl = document.getElementById('embedded-state');
      if(embEl){
        var embText = embEl.textContent.trim();
        if(embText && embText !== '{}'){
          _applyLoadedState(embText);
          updateProgress();
          return;
        }
      }
      loadAutosave();
      updateProgress();
    }
  }
  _cloudSyncInit();
});

updateProgress();

/* ──── QR Code Button (Hub mode only, lazy qrcodejs) ──── */
function _openToolQR(){
  /* S497 batch 1: engine panel (v1.2.0). Was a hand-drawn, display-toggled
     overlay whose Esc listener stayed installed forever; the engine now owns
     open/close/Esc/✕. The URL-cache that skipped QR regeneration is dropped:
     the panel rebuilds each open and the QR render is milliseconds — the cache
     only existed because the old overlay was reused instead of recreated.
     qrcodejs stays lazy-loaded (CDN). */
  var D=window.ArenconDlg;
  if(!D||!D.panel){ try{ console.error('[QR] dialog engine not loaded'); }catch(_){} return; }
  var url = window.location.href;
  D.panel({
    title:'Scan to open this tool',
    icon:'\u2317', accent:'info', width:360,
    build:function(bd){
      var box=document.createElement('div');
      box.style.cssText='text-align:center;';
      var qr=document.createElement('div');
      qr.style.cssText='display:inline-block;margin:2px 0 12px;background:#fff;padding:8px;border-radius:8px;';
      var u=document.createElement('div');
      u.style.cssText='font-size:11px;color:var(--dlg-ink-3,#928E9C);word-break:break-all;';
      u.textContent=url;
      box.appendChild(qr); box.appendChild(u); bd.appendChild(box);
      var draw=function(){ try{ new QRCode(qr,{text:url,width:200,height:200}); }catch(_){} };
      if(typeof QRCode==='undefined'){
        var sc=document.createElement('script');
        sc.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        sc.onload=draw; document.head.appendChild(sc);
      } else draw();
    }
  });
}

/* S505: Help & guide. Opens the shared, searchable Help engine inside Diesel's own
   sealed dialog (window.ArenconDlg.panel) — same engine the Hub uses, same cards
   schema, Diesel's own content registered from lib/ui/dieselHelpCards.js. The engine
   fns are published on window by the part02 module block. If Diesel's cards ever
   fail to register, the named coming-soon placeholder shows instead of a blank panel. */
var _HELP_ICON_PLAIN = '<span class="help-q">?</span><span class="wn-dot" style="display:none"></span>';
var _HELP_ICON_NEW   = '<span class="help-q">?</span><span class="wn-dot wn-pulse"></span>';
function _helpSetDot(on){
  try { window.__dslHeaderCtl.setControlIcon('help', on ? _HELP_ICON_NEW : _HELP_ICON_PLAIN); } catch(e){}
}
function openHelp(){
  var D = window.ArenconDlg;
  if(!D || !D.panel){ try{ console.error('[help] dialog engine not loaded'); }catch(_){} return; }
  D.panel({
    title:'Help & guide',
    icon:'?', accent:'slate', width:880,
    build:function(bd){
      if (window._helpHasCards && window._helpHasCards('Diesel')){
        window._helpMount(bd, { tab:'wn' });
        try { if (window._helpMarkSeen) window._helpMarkSeen(); } catch(_){}
        _helpSetDot(false);
      } else {
        bd.innerHTML = window._helpComingSoon
          ? window._helpComingSoon('Diesel Fire Pump Commissioning')
          : '<div class="help-soon"><div class="help-soon-title">Guide coming soon</div></div>';
      }
    }
  });
}

/* ──── Heartbeat Sync with Guards (Session 53 — FRT pattern) ──── */
var _heartbeatRunning = false;
var _syncLock = false;
var _cloudSyncedAt = null; // Timestamp of last cloud push — prevents self-triggering
function _startHeartbeat(){
  if(!_csHubMode || !_csProjectId) return;
  if(window._syncHeartbeatTimer) clearInterval(window._syncHeartbeatTimer);
  window._syncHeartbeatTimer = setInterval(_syncHeartbeat, 15000);
}
function _stopHeartbeat(){
  if(window._syncHeartbeatTimer){ clearInterval(window._syncHeartbeatTimer); window._syncHeartbeatTimer=null; }
}
async function _syncHeartbeat(){
  if(_syncLock || _heartbeatRunning) return;
  if(!_csHubMode || !_csProjectId || typeof CloudSync==='undefined' || !CloudSync.isInitialized) return;
  if(!navigator.onLine) return;
  _heartbeatRunning = true;
  try {
    /* S496 Phase 2 — THE 4TH HOST EDIT (missed in the first Phase 2 push, which
       ported only 3; Mark's two-window test caught it: nothing ever synced in).
       The old body here called CloudSync.load() and read row.row.data — but the
       facade's load() returns row METADATA only (id/status/updated_at, no data),
       so `!row.row.data` was true on every tick and the heartbeat silently
       no-oped forever. Pulls were dead; each window only ever saw itself.

       The periodic pull now runs through the SHARED engine:
       CloudSync.heartbeatTick() = cheap updated_at probe against the engine's
       last-seen concurrency token -> silent pull -> the facade's model routes
       the applied state through Diesel's protective merge (_mergeCloudLocal
       union + S25 empty-cloud guard) via _applyCloudSilent before any apply.
       S321 edit-deferral (active input OR pending autosave debounce) is
       enforced INSIDE the tick, before the pull. Pulling also refreshes the
       engine's If-Match token, so the next push preconditions correctly. */
    await CloudSync.heartbeatTick();
  } catch(e){ console.warn('[Heartbeat] Error:', e); }
  _heartbeatRunning = false;
}
// S25 guard: does a state object carry real report content?
// Conservative — any single content signal counts. On error, assume content
// (fail safe: never let a real inspection look "empty" and get overwritten).
function _stateHasContent(s){
  if(!s || typeof s!=='object') return false;
  try {
    if(Array.isArray(s.generalDeficiencies) && s.generalDeficiencies.length) return true;
    if(s.deficiencies && Object.keys(s.deficiencies).some(function(k){return Array.isArray(s.deficiencies[k]) && s.deficiencies[k].length;})) return true;
    if(Array.isArray(s.contractors) && s.contractors.length) return true;
    if(Array.isArray(s.customItems) && s.customItems.length) return true;
    if(Array.isArray(s.flowTestPhotos) && s.flowTestPhotos.length) return true;
    if(Array.isArray(s.flowTestPhotosPld) && s.flowTestPhotosPld.length) return true;
    if(Array.isArray(s.recordPhotos) && s.recordPhotos.length) return true;
    if(s.npshPsi!=null && String(s.npshPsi).trim()) return true;
    if(s.npshPsiPld!=null && String(s.npshPsiPld).trim()) return true;
    if(Array.isArray(s.sketchEntries) && s.sketchEntries.length) return true;
    if(s.clState && Object.keys(s.clState).some(function(k){var v=s.clState[k]; return v && typeof v==='object' && ((v.response!=null&&v.response!=='')||(v.status!=null&&v.status!=='')||(v.val!=null&&v.val!=='')||(v.comment&&String(v.comment).trim())||(Array.isArray(v.photos)&&v.photos.length));})) return true;
    if(s.proj && ((s.proj['pi-projname']&&String(s.proj['pi-projname']).trim())||(s.proj['pi-projno']&&String(s.proj['pi-projno']).trim())||(s.proj['pi-client']&&String(s.proj['pi-client']).trim()))) return true;
    if(s.batData && ((Array.isArray(s.batData.b1)&&s.batData.b1.some(function(x){return x!=null&&x!=='';}))||(Array.isArray(s.batData.b2)&&s.batData.b2.some(function(x){return x!=null&&x!=='';})))) return true;
    if(Array.isArray(s.stdData) && s.stdData.some(function(r){return r&&typeof r==='object'&&Object.keys(r).some(function(kk){return r[kk]!=null&&r[kk]!=='';});})) return true;
    if(Array.isArray(s.pldData) && s.pldData.some(function(r){return r&&typeof r==='object'&&Object.keys(r).some(function(kk){return r[kk]!=null&&r[kk]!=='';});})) return true;
  } catch(e){ return true; }
  return false;
}
// Merge: cloud owns structure, local owns binary/R2 data
function _mergeCloudLocal(cloud, local){
  // For pump tools: cloud is authoritative for all fields except photo blobs
  // Preserve local photo data URLs that cloud may have stripped
  if(cloud && local){
    // S282 B8: markup vectors (p.mk) are STRUCTURE — cloud is authoritative.
    // But cloud rows saved BEFORE this build lack the 'mk' key entirely; for
    // those, preserve local markup so a legacy cloud apply can't wipe it. Once
    // cloud carries the key (incl. null from a cross-device revert), cloud wins.
    // 'in' test (not truthy) so an explicit cloud null correctly clears markup.
    function _preserveMk(cp, lp){ if(cp && lp && !('mk' in cp) && lp.mk) cp.mk = lp.mk;
      if(cp && lp){
        if(!('_isOrigBackup' in cp) && lp._isOrigBackup) cp._isOrigBackup = lp._isOrigBackup;
        // S301: the annotation field-group {_annotated,_origBackupId,r2Key,r2Url,d}
        // is arbitrated by _mkTs. S292's key-presence guard never fired because the
        // strip mappers always emit the keys — so a stale cloud row (heartbeat
        // racing a save) silently reverted local annotation while keeping the
        // marked dataURL as the thumbnail. Newer timestamp wins, both directions.
        var lts = lp._mkTs||0, cts = cp._mkTs||0;
        if(lts > cts){
          // local annotation state is newer — carry the whole group forward
          cp._annotated = !!lp._annotated;
          cp._origBackupId = lp._origBackupId || '';
          cp._mkTs = lts;
          if(lp.r2Key) cp.r2Key = lp.r2Key;
          if(lp.r2Url) cp.r2Url = lp.r2Url;
          if(lp.r2Status) cp.r2Status = lp.r2Status;
          if(lp.d) cp.d = lp.d;
        } else if(cts > lts && !cp._annotated && lp._annotated){
          // cloud has a newer revert (other device): the local d is the marked
          // composite — drop it so the photo falls back to the restored original.
          if(cp.d && cp.d === lp.d) delete cp.d;
        }
      }
    }
    /* S496 item 10 — ONE photo-preserve implementation for the deficiency family.
       The identical 5-line body (preserve d, preserve r2Url+r2Key, _preserveMk)
       was hand-written FIVE times: contractor deficiency photos, contractor
       response photos, general-deficiency photos, general-deficiency response
       photos, and checklist-item photos. S314's own comment records that the
       general-deficiency copy was MISSING for months — every cloud apply wiped
       those photo binaries until someone noticed. Five hand-maintained copies of
       a photo-protection rule is a bug generator: the next photo location added
       will silently miss the pass the same way. All five now call this.
       PAIRING (S353 canon): match strictly by id when the cloud photo carries
       one — index pairing copied one photo's binary/markup onto another when two
       devices held the arrays in different orders. Photos minted before ids
       existed fall back to index so legacy binaries still rescue; an id-bearing
       photo can never cross-copy. */
    function _preservePhotoArr(cloudArr, localArr){
      if(!Array.isArray(cloudArr) || !Array.isArray(localArr)) return;
      var byId={};
      localArr.forEach(function(p){ if(p && p.id) byId[p.id]=p; });
      cloudArr.forEach(function(cp, pi){
        if(!cp) return;
        var lp = cp.id ? byId[cp.id] : localArr[pi];
        if(!lp) return;
        if(!cp.d && lp.d) cp.d = lp.d;
        if(!cp.r2Url && lp.r2Url){ cp.r2Url = lp.r2Url; cp.r2Key = lp.r2Key; }
        _preserveMk(cp, lp);
      });
    }
    // Preserve flow test photos (S353: match strictly by id — never by array
    // index. Index pairing copied one photo's binary/markup onto another when the
    // two devices held the arrays in different orders.)
    if(local.flowTestPhotos && cloud.flowTestPhotos){
      var _lmFT={}; local.flowTestPhotos.forEach(function(p){ if(p&&p.id) _lmFT[p.id]=p; });
      cloud.flowTestPhotos.forEach(function(cp){
        var lp = cp && cp.id ? _lmFT[cp.id] : null;
        if(lp && !cp.d && lp.d) cp.d = lp.d;
        if(lp && !cp.r2Url && lp.r2Url) cp.r2Url = lp.r2Url;
        if(lp && !cp.r2Key && lp.r2Key) cp.r2Key = lp.r2Key;
        _preserveMk(cp, lp);
      });
    }
    // S314 Gap A: flowTestPhotosPld had NO preserve pass — every cloud apply wiped
    // live 7-pt flow chart photo binaries (cloud strips .d by design). Mirror of
    // the flowTestPhotos pass above.
    if(local.flowTestPhotosPld && cloud.flowTestPhotosPld){
      var _lmFTP={}; local.flowTestPhotosPld.forEach(function(p){ if(p&&p.id) _lmFTP[p.id]=p; });
      cloud.flowTestPhotosPld.forEach(function(cp){
        var lp = cp && cp.id ? _lmFTP[cp.id] : null;
        if(lp && !cp.d && lp.d) cp.d = lp.d;
        if(lp && !cp.r2Url && lp.r2Url) cp.r2Url = lp.r2Url;
        if(lp && !cp.r2Key && lp.r2Key) cp.r2Key = lp.r2Key;
        _preserveMk(cp, lp);
      });
    }
    // Preserve site record photos — S353 ROOT FIX: match STRICTLY by id, never by
    // array index. The old index fallback copied one photo's identity (kind, .d,
    // deleted flag) onto a different photo's slot whenever the two devices held
    // recordPhotos in different orders — this is why a 7-pt placard kept showing
    // up as a Pump photo, and why deleted flags bled between photos. A cloud photo
    // with no id-match is simply a different photo and is left untouched.
    if(local.recordPhotos && cloud.recordPhotos){
      var _lmRP={}; local.recordPhotos.forEach(function(p){ if(p&&p.id) _lmRP[p.id]=p; });
      cloud.recordPhotos.forEach(function(cp){
        var lp = cp && cp.id ? _lmRP[cp.id] : null;
        if(lp && !cp.d && lp.d) cp.d = lp.d;
        if(lp && !cp.r2Url && lp.r2Url){ cp.r2Url=lp.r2Url; cp.r2Key=lp.r2Key; }
        _preserveMk(cp, lp);
      });
    }
    // Preserve deficiency photos — S496 item 10: routed through _preservePhotoArr
    if(local.deficiencies && cloud.deficiencies){
      Object.keys(cloud.deficiencies).forEach(function(ctr){
        if(!local.deficiencies[ctr]) return;
        (cloud.deficiencies[ctr]||[]).forEach(function(cd,di){
          var ld = (local.deficiencies[ctr]||[])[di];
          if(!ld) return;
          _preservePhotoArr(cd.photos, ld.photos);
          // Preserve response photos
          (cd.responses||[]).forEach(function(cr,ri){
            var lr = (ld.responses||[])[ri];
            if(!lr) return;
            _preservePhotoArr(cr.photos, lr.photos);
          });
        });
      });
    }
    // S314 Gap B: generalDeficiencies photos had NO preserve pass — every cloud
    // apply wiped live general-deficiency photo binaries. S496 item 10: routed
    // through _preservePhotoArr (the shared implementation exists precisely so
    // this omission cannot recur).
    if(local.generalDeficiencies && cloud.generalDeficiencies){
      (cloud.generalDeficiencies||[]).forEach(function(cd,di){
        var ld = (local.generalDeficiencies||[])[di];
        if(!cd||!ld) return;
        _preservePhotoArr(cd.photos, ld.photos);
        (cd.responses||[]).forEach(function(cr,ri){
          var lr = (ld.responses||[])[ri];
          if(!lr) return;
          _preservePhotoArr(cr.photos, lr.photos);
        });
      });
    }
    // Preserve checklist item photos
    // S281 B2: the checklist state object is `clState` (clState[id].photos),
    // NOT `checklistDetails` — that key never existed in collectState() output,
    // so this preserve pass was silently a no-op and checklist photo binaries
    // were lost on every cloud apply. Keyed on clState now.
    // S496 item 10: fifth copy of the same body — routed through _preservePhotoArr.
    if(local.clState && cloud.clState){
      Object.keys(cloud.clState).forEach(function(k){
        var cc=cloud.clState[k], lc=local.clState[k];
        if(!lc||!cc) return;
        _preservePhotoArr(cc.photos, lc.photos);
      });
    }
    // S239: Preserve local flow-test row edits (stdData/pldData/pump curves).
    // The heartbeat only applies cloud when cloud is >5s newer, but a value typed
    // locally in the last few seconds (not yet pushed) must not be clobbered.
    // Cloud owns row STRUCTURE (length); local keeps any non-empty field value it
    // holds that differs from cloud (last-write-wins favouring the visible local edit).
    function _preserveRows(cloudArr, localArr){
      if(!Array.isArray(cloudArr) || !Array.isArray(localArr)) return;
      cloudArr.forEach(function(cr, i){
        var lr = localArr[i];
        if(!cr || !lr) return;
        Object.keys(lr).forEach(function(k){
          if(k === 'photos') return; // photos handled by their own preserve pass
          var lv = lr[k];
          if(lv !== '' && lv != null && lv !== cr[k]) cr[k] = lv;
        });
      });
    }
    _preserveRows(cloud.stdData, local.stdData);
    _preserveRows(cloud.pldData, local.pldData);
    _preserveRows(cloud.pumpCurvePoints, local.pumpCurvePoints);
    _preserveRows(cloud.pldPumpCurvePoints, local.pldPumpCurvePoints);
    // Preserve gauge photo binaries on flow rows (cloud strips dataUrl; local owns the blob + R2 refs).
    function _preserveRowPhotos(cloudArr, localArr){
      if(!Array.isArray(cloudArr) || !Array.isArray(localArr)) return;
      cloudArr.forEach(function(cr, i){
        var lr = localArr[i];
        if(!cr || !lr || !Array.isArray(cr.photos) || !Array.isArray(lr.photos)) return;
        var _lmRow={}; lr.photos.forEach(function(x){ if(x&&x.id) _lmRow[x.id]=x; });
        cr.photos.forEach(function(cp){
          // S353: match strictly by id — never by index.
          var lp = cp && cp.id ? _lmRow[cp.id] : null;
          if(!lp) return;
          if(!cp.d && lp.d) cp.d = lp.d;
          if(!cp.r2Url && lp.r2Url){ cp.r2Url = lp.r2Url; cp.r2Key = lp.r2Key; }
          if(!cp.tag && lp.tag) cp.tag = lp.tag;
          _preserveMk(cp, lp);
        });
      });
    }
    _preserveRowPhotos(cloud.stdData, local.stdData);
    _preserveRowPhotos(cloud.pldData, local.pldData);
    // Preserve sketch images. S314 Gap C: this pass was keyed on 'sketches', a key
    // that never existed in collectState() output (the key is 'sketchEntries') —
    // silent no-op, same class as the S281 B2 checklistDetails bug. Cloud strips
    // markupImg to null on save; restore it from local. Legacy keys kept inert.
    if(local.sketchEntries && cloud.sketchEntries){
      (cloud.sketchEntries||[]).forEach(function(cs,si){
        var ls=(local.sketchEntries||[])[si];
        if(!ls) return;
        if(!cs.markupImg && ls.markupImg) cs.markupImg = ls.markupImg;
      });
    }
    if(local.sketches && cloud.sketches){   // legacy key — defined-but-inert (S137)
      (cloud.sketches||[]).forEach(function(cs,si){
        var ls=(local.sketches||[])[si];
        if(!ls) return;
        if(!cs.drawingData && ls.drawingData) cs.drawingData = ls.drawingData;
        if(!cs.markupData && ls.markupData) cs.markupData = ls.markupData;
        if(!cs.markupPhotoSrc && ls.markupPhotoSrc) cs.markupPhotoSrc = ls.markupPhotoSrc;
      });
    }
    // S301: "(original)" backup reconciliation — after the timestamp-arbitrated
    // photo passes, any merged photo that is annotated needs its backup record;
    // a stale cloud row won't have backups created locally moments ago. Union
    // them back in from local, keyed by _origBackupId. Gated on the MERGED
    // annotation state, so a genuine cross-device revert (photo no longer
    // annotated, backup removed from cloud) is NOT resurrected.
    (function _reconcileOrigBackups(){
      var needed = {};
      function scanArr(arr){ (arr||[]).forEach(function(p){ if(p && p._annotated && p._origBackupId) needed[p._origBackupId]=true; }); }
      Object.keys(cloud.clState||{}).forEach(function(k){ scanArr((cloud.clState[k]||{}).photos); });
      (cloud.stdData||[]).forEach(function(r){ scanArr(r&&r.photos); });
      (cloud.pldData||[]).forEach(function(r){ scanArr(r&&r.photos); });
      scanArr(cloud.flowTestPhotos); scanArr(cloud.flowTestPhotosPld);
      Object.keys(cloud.deficiencies||{}).forEach(function(ctr){
        (cloud.deficiencies[ctr]||[]).forEach(function(dd){ scanArr(dd&&dd.photos); (dd&&dd.responses||[]).forEach(function(r){ scanArr(r&&r.photos); }); });
      });
      (cloud.generalDeficiencies||[]).forEach(function(dd){ scanArr(dd&&dd.photos); (dd&&dd.responses||[]).forEach(function(r){ scanArr(r&&r.photos); }); });
      var have = {};
      cloud.recordPhotos = cloud.recordPhotos || [];
      cloud.recordPhotos.forEach(function(b){ if(b&&b.id) have[b.id]=true; });
      Object.keys(needed).forEach(function(bid){
        if(have[bid]) return;
        var lb = (local.recordPhotos||[]).filter(function(b){ return b && b.id===bid; })[0];
        if(lb){ cloud.recordPhotos.push(lb); console.info('[merge] restored (original) backup record', bid); }
        else console.warn('[merge] annotated photo references missing backup record', bid);
      });
    })();
    // ════ S314 MERGE INVARIANT: a local photo binary must never be lost through
    // a cloud merge. Cloud rows strip .d by design; whatever the targeted passes
    // above missed (or any future photo array added without its own pass), this
    // final walk restores .d from local BY ID. Id-keyed only — index-matching
    // id-less photos could attach the wrong binary, so the targeted passes stay
    // primary for those. Single exclusion: the S301 cross-device revert (newer
    // cloud _mkTs, annotation removed) where dropping the marked composite is
    // intentional. ════
    (function _s314BinaryInvariant(){
      function walk(s, cb){
        if(!s) return;
        (Array.isArray(s.flowTestPhotos)?s.flowTestPhotos:[]).forEach(cb);
        (Array.isArray(s.flowTestPhotosPld)?s.flowTestPhotosPld:[]).forEach(cb);
        (Array.isArray(s.recordPhotos)?s.recordPhotos:[]).forEach(cb);
        (Array.isArray(s.stdData)?s.stdData:[]).forEach(function(r){ ((r&&r.photos)||[]).forEach(cb); });
        (Array.isArray(s.pldData)?s.pldData:[]).forEach(function(r){ ((r&&r.photos)||[]).forEach(cb); });
        Object.keys(s.clState||{}).forEach(function(k){ var v=s.clState[k]; ((v&&v.photos)||[]).forEach(cb); });
        Object.keys(s.deficiencies||{}).forEach(function(ctr){ (s.deficiencies[ctr]||[]).forEach(function(d){
          if(!d) return; (d.photos||[]).forEach(cb);
          (d.responses||[]).forEach(function(r){ ((r&&r.photos)||[]).forEach(cb); });
        });});
        (Array.isArray(s.generalDeficiencies)?s.generalDeficiencies:[]).forEach(function(d){
          if(!d) return; (d.photos||[]).forEach(cb);
          (d.responses||[]).forEach(function(r){ ((r&&r.photos)||[]).forEach(cb); });
        });
      }
      try{
        var localById={};
        walk(local, function(p){ if(p && p.id && p.d) localById[p.id]=p; });
        var n=0;
        walk(cloud, function(cp){
          if(!cp || !cp.id || cp.d) return;
          var lp=localById[cp.id]; if(!lp) return;
          var lts=lp._mkTs||0, cts=cp._mkTs||0;
          if(cts>lts && !cp._annotated && lp._annotated) return;   // S301 revert — intentional
          cp.d=lp.d; n++;
        });
        if(n) console.info('[merge] S314 invariant restored '+n+' photo binaries');
      }catch(e){ console.warn('[merge] S314 invariant error', e); }
    })();
    // ════ S335 NEW-PHOTO UNION: the targeted passes and the S314 invariant only
    // ever ENRICH cloud rows that already exist by id — none of them ADD a local
    // photo the cloud copy lacks. So a photo captured locally and merged against a
    // cloud snapshot taken before its upload finished (classic: add placard →
    // AI scan/heartbeat pulls cloud → merge) was silently DROPPED. This pass unions
    // such photos back in.
    // SAFETY GATE: only rescue a FRESH capture — it must still hold its binary (.d)
    // AND not be a completed upload (r2Status !== 'uploaded'). A photo deleted on
    // another device was, by definition, an 'uploaded' photo before it could sync;
    // excluding 'uploaded' means we never resurrect a deliberate cross-device delete.
    // Matched by id only (id-less rows can't be safely de-duped).
    (function _s335NewPhotoUnion(){
      function isFresh(p){
        return p && p.id && p.d && p.r2Status !== 'uploaded' && !p.deleted;   // S337: never resurrect a soft-deleted photo
      }
      // Union local-only fresh photos from a local array into the matching cloud array.
      function unionArr(cloudArr, localArr, label){
        if(!Array.isArray(localArr)) return 0;
        if(!Array.isArray(cloudArr)) return 0;
        var have={}; cloudArr.forEach(function(p){ if(p&&p.id) have[p.id]=true; });
        var added=0;
        localArr.forEach(function(lp){
          if(!isFresh(lp) || have[lp.id]) return;
          cloudArr.push(lp); have[lp.id]=true; added++;
        });
        if(added) console.info('[merge] S335 union rescued '+added+' fresh photo(s) in '+label);
        return added;
      }
      try{
        var total=0;
        // Top-level photo arrays — ensure the cloud array exists so a wholly-new
        // local array (cloud had none) is still rescued.
        ['flowTestPhotos','flowTestPhotosPld','recordPhotos'].forEach(function(key){
          if(Array.isArray(local[key]) && local[key].some(isFresh)){
            if(!Array.isArray(cloud[key])) cloud[key]=[];
            total+=unionArr(cloud[key], local[key], key);
          }
        });
        // Per-row photo arrays (flow rows): match rows by index, union their photos.
        ['stdData','pldData'].forEach(function(key){
          var ca=cloud[key], la=local[key];
          if(!Array.isArray(ca)||!Array.isArray(la)) return;
          ca.forEach(function(cr,i){
            var lr=la[i];
            if(!cr||!lr||!Array.isArray(lr.photos)) return;
            if(!Array.isArray(cr.photos)) cr.photos=[];
            total+=unionArr(cr.photos, lr.photos, key+'['+i+']');
          });
        });
        // Checklist item photos (clState keyed by id).
        if(local.clState && cloud.clState){
          Object.keys(local.clState).forEach(function(k){
            var lc=local.clState[k], cc=cloud.clState[k];
            if(!lc||!cc||!Array.isArray(lc.photos)) return;
            if(!Array.isArray(cc.photos)) cc.photos=[];
            total+=unionArr(cc.photos, lc.photos, 'clState['+k+']');
          });
        }
        // Contractor deficiency photos + response photos (keyed by counter, then index).
        if(local.deficiencies && cloud.deficiencies){
          Object.keys(local.deficiencies).forEach(function(ctr){
            if(!cloud.deficiencies[ctr]) return;
            (cloud.deficiencies[ctr]||[]).forEach(function(cd,di){
              var ld=(local.deficiencies[ctr]||[])[di];
              if(!cd||!ld) return;
              if(Array.isArray(ld.photos)){ if(!Array.isArray(cd.photos)) cd.photos=[]; total+=unionArr(cd.photos, ld.photos, 'defic['+ctr+']['+di+']'); }
              (cd.responses||[]).forEach(function(cr,ri){
                var lr=(ld.responses||[])[ri];
                if(!cr||!lr||!Array.isArray(lr.photos)) return;
                if(!Array.isArray(cr.photos)) cr.photos=[];
                total+=unionArr(cr.photos, lr.photos, 'defic['+ctr+']['+di+'].resp['+ri+']');
              });
            });
          });
        }
        // General deficiency photos + response photos (index-matched).
        if(local.generalDeficiencies && cloud.generalDeficiencies){
          (cloud.generalDeficiencies||[]).forEach(function(cd,di){
            var ld=(local.generalDeficiencies||[])[di];
            if(!cd||!ld) return;
            if(Array.isArray(ld.photos)){ if(!Array.isArray(cd.photos)) cd.photos=[]; total+=unionArr(cd.photos, ld.photos, 'genDefic['+di+']'); }
            (cd.responses||[]).forEach(function(cr,ri){
              var lr=(ld.responses||[])[ri];
              if(!cr||!lr||!Array.isArray(lr.photos)) return;
              if(!Array.isArray(cr.photos)) cr.photos=[];
              total+=unionArr(cr.photos, lr.photos, 'genDefic['+di+'].resp['+ri+']');
            });
          });
        }
        if(total) console.info('[merge] S335 union rescued '+total+' fresh photo(s) total');
      }catch(e){ console.warn('[merge] S335 union error', e); }
    })();
  }
  // ════ S337 DELETED-FLAG PROPAGATION (Option A — cross-device delete safety) ════
  // The merge returns `cloud` enriched from `local`. Soft-delete lives in a per-photo
  // `deleted`/`deletedDate` flag, but none of the passes above reconcile it, so a
  // delete on device A could be undone when device B (holding a pre-delete snapshot)
  // syncs. Resolution rule, per photo id, across BOTH sides:
  //   • If EITHER side marks it deleted → it is deleted (delete-wins), UNLESS the
  //     other side cleared the flag with a STRICTLY NEWER action. We approximate
  //     "newer" with deletedDate: a side that is live (no deletedDate) but whose
  //     last-known delete is older loses to a fresher delete. A restore (live state)
  //     only wins if it happened after the delete it is undoing — represented by the
  //     live side carrying no deletedDate AND the deleted side's deletedDate being
  //     older than the merge's own cloud timestamp is NOT reliably knowable, so we
  //     take the conservative, data-safe stance: delete-wins on conflict. A restore
  //     propagates because BOTH sides converge to live only when neither is deleted.
  // This is intentionally conservative: a genuine restore that races a stale delete
  // may need a second restore. That is the safe direction (a photo is never silently
  // lost; at worst it stays in Recently Deleted one extra sync, fully restorable).
  (function _s337PropagateDeleted(){
    try{
      if(!cloud || !local) return;
      // S354: normalize BOTH sides to the canonical model first, so we always
      // compare delState/delAt (never bare legacy flags).
      _normalizeAllPhotoDel(local);
      _normalizeAllPhotoDel(cloud);
      // Capture local deletion state by id.
      var localState = {};
      (function walk(state){
        function visit(p){ if(p && p.id) localState[p.id] = { deleted: _isPhotoDeleted(p), delAt: p.delAt||p.deletedDate||'' }; }
        function arr(a){ if(Array.isArray(a)) a.forEach(visit); }
        arr(state.flowTestPhotos); arr(state.flowTestPhotosPld); arr(state.recordPhotos);
        if(Array.isArray(state.stdData)) state.stdData.forEach(function(r){ if(r&&Array.isArray(r.photos)) arr(r.photos); });
        if(Array.isArray(state.pldData)) state.pldData.forEach(function(r){ if(r&&Array.isArray(r.photos)) arr(r.photos); });
        if(state.clState) Object.keys(state.clState).forEach(function(k){ var v=state.clState[k]; if(v&&Array.isArray(v.photos)) arr(v.photos); });
        if(state.deficiencies) Object.keys(state.deficiencies).forEach(function(ctr){ (state.deficiencies[ctr]||[]).forEach(function(d){ if(Array.isArray(d.photos))arr(d.photos); (d.responses||[]).forEach(function(r){ if(Array.isArray(r.photos))arr(r.photos); }); }); });
        if(Array.isArray(state.generalDeficiencies)) state.generalDeficiencies.forEach(function(d){ if(Array.isArray(d.photos))arr(d.photos); (d.responses||[]).forEach(function(r){ if(Array.isArray(r.photos))arr(r.photos); }); });
      })(local);
      var n=0;
      // S354 RECONCILE: arbitrate deletion by NEWEST delAt across the two sides.
      // - A live photo has no delAt, so a real delete (with delAt) always wins over
      //   a stale live copy → genuine cross-device deletes propagate.
      // - A photo that was never deleted has no delAt on EITHER side, so it can
      //   never be flagged deleted by a phantom → no accidental loss.
      // - If one side restored (live, no delAt) and the other still shows a delete,
      //   the delete only wins if its delAt is newer; a restore is represented by
      //   clearing delAt, so a fresh restore (no delAt) ties→live. To let a restore
      //   beat an older delete we treat "live with NO delAt" as the most-recent
      //   intent only when the other side's delAt is older than this merge — which
      //   we approximate conservatively: an explicit delete (has delAt) wins unless
      //   THIS side is live AND has been re-saved since (no delAt present at all).
      function reconcile(p){
        if(!p || !p.id) return;
        var ls = localState[p.id];
        var cloudDel = _isPhotoDeleted(p);
        var localDel = ls ? ls.deleted : false;
        if(cloudDel === localDel) return;            // sides agree → nothing to do
        var cloudAt = p.delAt || p.deletedDate || '';
        var localAt = ls ? ls.delAt : '';
        // The side that is DELETED carries a delAt; the LIVE side carries none.
        // Whichever action is newer wins. With one side live (no timestamp), the
        // delete wins (a delete is an explicit action; a never-set live state has
        // no competing timestamp). A restore clears delAt AND sets delState:'live',
        // captured in localState as deleted:false — so a restored side that was
        // saved after the delete will already show delState 'live' here and we keep
        // it live below.
        if(cloudDel && !localDel){
          // cloud says deleted, local says live → honor the delete (propagate).
          _markPhotoDeleted(p);
          if(cloudAt) { p.delAt = cloudAt; p.deletedDate = cloudAt; }
          n++;
        } else if(localDel && !cloudDel){
          // local says deleted, cloud says live → propagate the delete onto cloud.
          _markPhotoDeleted(p);
          if(localAt){ p.delAt = localAt; p.deletedDate = localAt; }
          n++;
        }
      }
      function arrC(a){ if(Array.isArray(a)) a.forEach(reconcile); }
      arrC(cloud.flowTestPhotos); arrC(cloud.flowTestPhotosPld); arrC(cloud.recordPhotos);
      if(Array.isArray(cloud.stdData)) cloud.stdData.forEach(function(r){ if(r&&Array.isArray(r.photos)) arrC(r.photos); });
      if(Array.isArray(cloud.pldData)) cloud.pldData.forEach(function(r){ if(r&&Array.isArray(r.photos)) arrC(r.photos); });
      if(cloud.clState) Object.keys(cloud.clState).forEach(function(k){ var v=cloud.clState[k]; if(v&&Array.isArray(v.photos)) arrC(v.photos); });
      if(cloud.deficiencies) Object.keys(cloud.deficiencies).forEach(function(ctr){ (cloud.deficiencies[ctr]||[]).forEach(function(d){ if(Array.isArray(d.photos))arrC(d.photos); (d.responses||[]).forEach(function(r){ if(Array.isArray(r.photos))arrC(r.photos); }); }); });
      if(Array.isArray(cloud.generalDeficiencies)) cloud.generalDeficiencies.forEach(function(d){ if(Array.isArray(d.photos))arrC(d.photos); (d.responses||[]).forEach(function(r){ if(Array.isArray(r.photos))arrC(r.photos); }); });
      if(n) console.info('[merge] S354 reconciled '+n+' cross-device deletion(s) by delAt');
    }catch(e){ console.warn('[merge] S354 deletion reconcile error', e); }
  })();
  // S305: per-pull merge log removed (30s heartbeat spam); backup-restore and
  // error logs inside the merge still fire when something actually happens.
  return cloud || local;
}
// Stamp _cloudSyncedAt before pushing to prevent self-triggering
var _origCloudSyncSave = null;
function _wrapCloudSyncSave(){
  if(typeof CloudSync !== 'undefined' && CloudSync.save && !_origCloudSyncSave){
    _origCloudSyncSave = CloudSync.save.bind(CloudSync);
    CloudSync.save = async function(state){
      var result = await _origCloudSyncSave(state);
      _cloudSyncedAt = Date.now();
      return result;
    };
  }
}
var _skTextLabels = {};
var _stlId = 0;
function _createSketchTextLabel(uid, x, y, st) {
  if(!_skTextLabels[uid]) _skTextLabels[uid] = [];
  var wrap = document.getElementById('scw-'+uid);
  if(!wrap) return;
  var id = ++_stlId;
  var el = document.createElement('div');
  el.className = 'sketch-text-label';
  el.id = 'stl-'+id;
  el.contentEditable = 'true';
  el.style.left = x+'px'; el.style.top = Math.max(0,y-10)+'px';
  el.style.color = st.color||'#1C2333';
  el.style.fontSize = (st.fontSize||16)+'px';
  el.style.fontWeight = st.textBold ? 'bold' : 'normal';
  el.style.fontStyle = st.textItalic ? 'italic' : 'normal';
  el.style.textDecoration = st.textUnderline ? 'underline' : 'none';
  el.style.fontFamily = 'Arial, sans-serif';
  el.textContent = 'Text';
  wrap.appendChild(el);
  setTimeout(function(){
    el.focus();
    try { var r=document.createRange(); r.selectNodeContents(el.childNodes[0]||el);
      var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch(ex){}
  }, 30);
  var obj = {el:el, id:id};
  _skTextLabels[uid].push(obj);
  _makeSTLDraggable(uid, el, obj);
  el.addEventListener('keydown', function(ev){
    if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();el.blur();}
    if((ev.key==='Delete'||ev.key==='Backspace') && !el.textContent.trim()){
      ev.preventDefault(); _removeSTL(uid, id);
    }
  });
  el.addEventListener('blur', function(){
    if(!el.textContent.trim()) _removeSTL(uid, id);
  });
}
var _selectedSTL = null;
function _handleSTLDelete(ev) {
  if(ev.key==='Delete'||ev.key==='Backspace') {
    if(_selectedSTL) {
      var st3 = sketchState[_selectedSTL.uid];
      if(st3 && st3.tool==='select') {
        ev.preventDefault(); ev.stopPropagation();
        var uid2=_selectedSTL.uid, id2=_selectedSTL.id;
        _selectedSTL = null;
        _removeSTL(uid2, id2);
        return;
      }
    }
  }
}
document.addEventListener('keydown', _handleSTLDelete, true);
function _makeSTLDraggable(uid, el, obj) {
  var dragging=false, offX=0, offY=0;
  el.addEventListener('mousedown', function(ev) {
    var st=sketchState[uid];
    if(st && st.tool==='select') {
      ev.preventDefault(); ev.stopPropagation(); dragging=true;
      offX=ev.clientX-el.offsetLeft; offY=ev.clientY-el.offsetTop;
      el.classList.add('selected'); el.contentEditable='false';
      el.setAttribute('tabindex','-1'); el.focus();
      // Deselect others
      document.querySelectorAll('.sketch-text-label.selected').forEach(function(x){if(x!==el)x.classList.remove('selected');});
      _selectedSTL = {uid:uid, id:obj.id, el:el};
    }
  });
  document.addEventListener('mousemove', function(ev) {
    if(!dragging) return;
    el.style.left=(ev.clientX-offX)+'px'; el.style.top=(ev.clientY-offY)+'px';
  });
  document.addEventListener('mouseup', function() { if(dragging){dragging=false; var st2=sketchState[uid]; if(!st2||st2.tool!=='select'){el.contentEditable='true';}} });
  el.addEventListener('touchstart', function(ev) {
    var st=sketchState[uid];
    if(st && st.tool==='select') {
      var t=ev.touches[0]; dragging=true;
      offX=t.clientX-el.offsetLeft; offY=t.clientY-el.offsetTop;
      el.classList.add('selected'); el.contentEditable='false';
    }
  }, {passive:true});
  document.addEventListener('touchmove', function(ev) {
    if(!dragging) return; var t=ev.touches[0];
    el.style.left=(t.clientX-offX)+'px'; el.style.top=(t.clientY-offY)+'px';
  }, {passive:true});
  document.addEventListener('touchend', function() { if(dragging){dragging=false; var st2=sketchState[uid]; if(!st2||st2.tool!=='select'){el.contentEditable='true';}} });
}
function _removeSTL(uid, id) {
  if(!_skTextLabels[uid]) return;
  _skTextLabels[uid] = _skTextLabels[uid].filter(function(o){
    if(o.id===id){if(o.el&&o.el.parentNode)o.el.parentNode.removeChild(o.el);return false;} return true;
  });
}
function _flattenSTL(uid) {
  var labels = _skTextLabels[uid];
  if(!labels||!labels.length) return;
  var canvas = document.getElementById('sc-'+uid);
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  var r = canvas.getBoundingClientRect();
  var scX=canvas.width/r.width, scY=canvas.height/r.height;
  labels.forEach(function(obj){
    var el=obj.el; if(!el) return;
    var txt=el.innerText.replace('✕','').trim(); if(!txt) return;
    var cs=window.getComputedStyle(el);
    ctx.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
    ctx.fillStyle=cs.color; ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
    var px=el.offsetLeft*scX, py=(el.offsetTop+el.offsetHeight*0.75)*scY;
    ctx.fillText(txt, px, py);
    if(cs.textDecoration.indexOf('underline')!==-1){
      var w=ctx.measureText(txt).width;
      ctx.lineWidth=1.5;ctx.strokeStyle=cs.color;ctx.beginPath();ctx.moveTo(px,py+2);ctx.lineTo(px+w,py+2);ctx.stroke();
    }
  });
}

/* ──── Sketch Photo Drag & Drop + Camera ──── */
function _sketchPhotoDrop(ev, uid) {
  var files = ev.dataTransfer.files;
  if(!files.length) return;
  var f=files[0]; if(!f.type.startsWith('image/')) return;
  var r=new FileReader();
  r.onload=function(e){ _loadSketchMarkupImg(uid, e.target.result); };
  r.readAsDataURL(f);
}
function _sketchPhotoUpload(uid){
  var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=function(){ var f=inp.files&&inp.files[0]; if(!f)return; var r=new FileReader(); r.onload=function(e){ _loadSketchMarkupImg(uid, e.target.result); }; r.readAsDataURL(f); };
  inp.click();
}
function _sketchPhotoCamera(uid) {
  if(typeof _camBurst==='function'){
    // Sketch markup holds ONE base image. Burst still opens for a consistent
    // camera UX; the LAST shot taken becomes the markup base (what the user settled on).
    openCameraBurst().then(function(files){
      if(files===null){ if(typeof showToast==='function') showToast('Camera unavailable \u2014 use Upload instead',2500); return; }
      if(!files || !files.length) return;
      var f = files[files.length-1];
      var r=new FileReader(); r.onload=function(e){ _loadSketchMarkupImg(uid, e.target.result); }; r.readAsDataURL(f);
    });
    return;
  }
  _sketchPhotoCameraLegacy(uid);
}
function _sketchPhotoCameraLegacy(uid) {
  var inp=document.createElement('input');
  inp.type='file'; inp.accept='image/*,.pdf'; inp.setAttribute('capture','environment');
  inp.onchange=function(){
    var f=inp.files[0]; if(!f) return;
    var r=new FileReader();
    r.onload=function(e){ _loadSketchMarkupImg(uid, e.target.result); };
    r.readAsDataURL(f);
  };
  inp.click();
}
function _loadSketchMarkupImg(uid, dataUrl) {
  var wrap = document.getElementById('markup-wrap-'+uid);
  var placeholder = document.getElementById('markup-placeholder-'+uid);
  var toolbar = document.getElementById('markup-toolbar-'+uid);
  if(!wrap) return;
  if(placeholder) placeholder.style.display='none';
  if(toolbar) toolbar.style.display='block';
  var img = new Image();
  img.onload = function() {
    // Clear old
    var old = wrap.querySelector('.markup-base-img'); if(old) old.remove();
    var oldC = wrap.querySelector('.markup-canvas'); if(oldC) oldC.remove();
    img.className='markup-base-img';
    wrap.insertBefore(img, wrap.firstChild);
    var canvas = document.createElement('canvas');
    canvas.className='markup-canvas'; canvas.id='mc-'+uid;
    canvas.width=img.naturalWidth||img.width; canvas.height=img.naturalHeight||img.height;
    canvas.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair;touch-action:none;';
    wrap.style.position='relative';
    wrap.appendChild(canvas);
    sketchEntries.forEach(function(e){ if(e.uid===uid) e.markupImg=dataUrl; });
    initMarkupDrawing(uid, canvas, img);
  };
  img.src = dataUrl;
}

/* ─── Sketch Stroke Objects for Select/Move/Delete ─── */
var _skStrokes = {}; // uid -> [{points:[{x,y}], color, size, tool, alpha}]
var _skSelected = {}; // uid -> index or null
var _skDragStart = null;

function _skInitStrokes(uid) { if(!_skStrokes[uid]) _skStrokes[uid]=[]; }
function _skRedraw(uid) {
  var canvas = document.getElementById('sc-'+uid);
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle=document.body.classList.contains('dark-mode')?'rgba(255,255,255,.03)':'white'; ctx.fillRect(0,0,canvas.width,canvas.height);
  var strokes = _skStrokes[uid]||[];
  // Separate highlights from other strokes for non-stacking composite
  var highlights=[];
  var others=[];
  strokes.forEach(function(s,si){
    if(s.tool==='highlight') highlights.push({s:s,si:si});
    else others.push({s:s,si:si});
  });
  // Draw non-highlight strokes
  others.forEach(function(item) {
    var s=item.s;
    if(!s.points||s.points.length<2) return;
    ctx.save();
    if(s.tool==='erase') {
      ctx.globalCompositeOperation='destination-out'; ctx.globalAlpha=1;
    } else {
      ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=s.alpha||1;
    }
    ctx.strokeStyle=s.color||'#1C2333'; ctx.lineWidth=s.size||3;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y);
    for(var j=1;j<s.points.length;j++) ctx.lineTo(s.points[j].x, s.points[j].y);
    ctx.stroke();
    ctx.restore();
    if(_skSelected[uid]===item.si) {
      var bb = _skBBox(s);
      ctx.save(); ctx.strokeStyle='#2196F3'; ctx.lineWidth=1.5;
      ctx.setLineDash([4,4]); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
      ctx.strokeRect(bb.x-4, bb.y-4, bb.w+8, bb.h+8);
      ctx.restore();
    }
  });
  // Draw ALL highlights on offscreen canvas at full opacity, composite once
  if(highlights.length>0){
    if(!_skRedraw._hlc)_skRedraw._hlc=document.createElement('canvas');
    var hlc=_skRedraw._hlc;
    hlc.width=canvas.width;hlc.height=canvas.height;
    var hx=hlc.getContext('2d');
    hx.clearRect(0,0,hlc.width,hlc.height);
    highlights.forEach(function(item){
      var s=item.s;
      if(!s.points||s.points.length<2)return;
      hx.strokeStyle=s.color||'#F1C40F'; hx.lineWidth=s.size||20;
      hx.globalAlpha=1; hx.globalCompositeOperation='source-over';
      hx.lineCap='round'; hx.lineJoin='round';
      hx.beginPath(); hx.moveTo(s.points[0].x,s.points[0].y);
      for(var j=1;j<s.points.length;j++) hx.lineTo(s.points[j].x,s.points[j].y);
      hx.stroke();
    });
    ctx.save();
    ctx.globalAlpha=Math.min(highlights[0].s.alpha||0.4, 0.55);
    ctx.globalCompositeOperation='source-over';
    ctx.drawImage(hlc,0,0);
    ctx.restore();
    // Draw selection handles for selected highlight
    highlights.forEach(function(item){
      if(_skSelected[uid]===item.si) {
        var bb = _skBBox(item.s);
        ctx.save(); ctx.strokeStyle='#2196F3'; ctx.lineWidth=1.5;
        ctx.setLineDash([4,4]); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
        ctx.strokeRect(bb.x-4, bb.y-4, bb.w+8, bb.h+8);
        ctx.restore();
      }
    });
  }
}
function _skBBox(s) {
  var xs=s.points.map(function(p){return p.x;}), ys=s.points.map(function(p){return p.y;});
  var x=Math.min.apply(null,xs), y=Math.min.apply(null,ys);
  return {x:x, y:y, w:Math.max.apply(null,xs)-x, h:Math.max.apply(null,ys)-y};
}
function _skHitTest(uid, px, py) {
  var strokes=_skStrokes[uid]||[];
  var best=-1, bestDist=30;
  for(var i=strokes.length-1;i>=0;i--) {
    var s=strokes[i];
    for(var j=0;j<s.points.length;j++) {
      var dx=s.points[j].x-px, dy=s.points[j].y-py;
      var d=Math.sqrt(dx*dx+dy*dy);
      if(d<bestDist) { bestDist=d; best=i; }
    }
  }
  return best;
}
function _skMoveStroke(uid, si, dx, dy) {
  var s=(_skStrokes[uid]||[])[si]; if(!s) return;
  s.points.forEach(function(p){ p.x+=dx; p.y+=dy; });
}
function _skDeleteSelected(uid) {
  var si=_skSelected[uid]; if(si==null||si<0) return;
  (_skStrokes[uid]||[]).splice(si,1);
  _skSelected[uid]=null;
  _skRedraw(uid);
}


