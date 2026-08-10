
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
        clState[id].photos.push(ArcPhoto.mint(compressed,f.name,{date:photoDate}));clState[id]._ts=Date.now();   /* S641: a photo attach is an inspector edit — stamp the item (S594 doctrine) */
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
          clState[id].photos.push(ArcPhoto.mint(compressed,f.name,{date:photoDate}));clState[id]._ts=Date.now();   /* S641: a photo attach is an inspector edit — stamp the item (S594 doctrine) */
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
  /* ═══ S594 — ENTRY-TIME STAMP AT THE KEYSTROKE (Mark, the original ask) ════
     A reading's timestamp must record WHEN IT WAS NOTED IN THE FIELD, not when
     some device later happened to save or wake. Until now the stamp was
     INFERRED at save time by diffing the document against the last known
     cloud state — an inference that fails exactly when it matters: a device
     with no prior state (fresh boot, an inspector's second phone, a tablet
     asleep for days) cannot tell changed from unchanged, so it guessed. That
     guess put a fabricated 12:44 stamp on a days-old 250 psi and let it beat
     genuinely newer work. S593 stopped the fabrication; this removes the
     inference altogether.

     From here the stamp is written HERE, at the input event — the instant the
     person enters the value — and no later pass may touch it (S593 rule).
     Consequences that matter in the field: opening a report on any number of
     devices stamps nothing, so no device can win by merely waking up; and
     with 5 or 100 devices open, the reading entered last on site is the one
     that survives, because that is literally what the number records. */
  if(tbl === 'std') {
    stdData[idx][field] = el.value;
    if (stdData[idx]) stdData[idx]._ts = (window.ArcSyncNow ? window.ArcSyncNow() : Date.now());   // S622i: server-anchored
    updateStdCalcCells(idx);
    if(['flow','suction','discharge','cutsheet'].includes(field)) {
      clearTimeout(stdChartTimer);
      stdChartTimer = setTimeout(() => { updateChart(); updateVerdict(); }, 120);
    }
  } else if(tbl === 'pld') {
    pldData[idx][field] = el.value;
    if (pldData[idx]) pldData[idx]._ts = (window.ArcSyncNow ? window.ArcSyncNow() : Date.now());   // S594 entry-time, S622i server-anchored
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
// S533: 'change' fires when a field is COMMITTED (blur / picker close), not on
// every keystroke — so it is cheap, and it is the right moment to make the value
// durable. Previously this only started the 4-second autosave clock: leave a
// field, lock the tablet or lose the app inside those 4 seconds and the entry was
// gone, because the report is assembled by reading the screen and the screen had
// not been read yet. The nameplate and rated-value fields have no other home, so
// they were the most exposed. saveState() writes the device copy immediately;
// debounceAutosave() still handles the cloud push on its own schedule.
document.addEventListener('change', function(e) {
  if (!e.target.dataset.tbl) {
    try { if (typeof saveState === 'function') saveState(); } catch(_){}
    debounceAutosave();
  }
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
        <div class="pt">${_escHtml(row.pct)} Flow <small>${_escHtml(row.label)} · ${row.flow!==null&&row.flow!==''?_escHtml(row.flow)+' gpm':'— gpm'}</small></div>
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
  /* ═══ S626 — THE POINTER IS BORN WITH THE PHOTO (Lane B's audit, 08 Aug:
     58 of 58 flow-test photos all-time saved with r2Key/r2Url/r2Status blank,
     against 326 of 326 record photos correct; all 39 live ones ARE in R2).
     This creation path minted and pushed but NEVER enqueued — the upload the
     bytes actually got came later, from the S563 catch-up sweep, which sets
     the pointer on the in-memory object AFTER the first autosave has already
     shipped a blank to the cloud; the cloud's blank then kept winning. The
     cure is on the WRITE side, at birth, before any save can run — NOT the
     Hub's read-side key rebuild (S631), which exists only so old records can
     display: lean on that instead of saving the pointer and the defect
     becomes permanent and invisible, and the nightly sweep goes quiet for
     the wrong reason. _r2EnqueuePhoto is a no-op outside Hub mode or before
     the folder is known — exactly the window S563 still exists to cover. */
  if(typeof _r2EnqueuePhoto==='function'){ try{ _r2EnqueuePhoto(_ph); }catch(e){ console.warn('[FlowEq] enqueue at creation failed:', e&&e.message); } }
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
          /* S562 (Mark): this button was a ✕ titled "Remove" in the same viewer
             as the header's ✕ that means CLOSE — two identical glyphs, opposite
             meanings, one of them destructive. And "Remove" understated what it
             does: it is a project-wide soft delete (Recently Deleted, 7 days),
             not an unlink from this flow point. The bin glyph + honest title
             match the lightbox and the rest of the toolkit: 🗑 deletes, ✕
             closes, ⇄ moves. The confirm modal is unchanged. */
          +'<button class="fpm-del" onclick="_flowEqDelete('+j+')" title="Delete photo (moves to Recently Deleted)">\uD83D\uDDD1</button>'
          +'<button class="fpm-dl" onclick="event.stopPropagation();_flowEqDownload('+j+')" title="Download">⬇</button>'
          +'<button class="fpm-move" onclick="event.stopPropagation();_flowEqOpenReassign('+j+',this)" title="Move to another category (keeps the photo)">⇄</button></div>';
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

/* ════════ S509 — OVERALL VERDICT, ONE SOURCE OF TRUTH ════════
   Rules signed off by Mark against the S509 demo. First match wins:
     1  consultant set the test result to Fail            -> FAIL
     2  any OUTSTANDING deficiency                        -> FAIL
     3  any performance point missed its NFPA 20 gate     -> FAIL
     4  any checklist item answered No                    -> CONDITIONAL
     5  consultant set the test result to Conditional     -> CONDITIONAL
     6  otherwise                                         -> PASS
   OUTSTANDING = status !== 'resolved' AND NOT isRecommendation AND NOT isSiteRecord.
   Recommendations and Site Records are advisory: they are counted and named in the
   wording but can NEVER hold a report back (Mark, S509 Q1).
   IAR is retired from the verdict entirely (Mark, S509 Q2) — iarStatus is no longer read
   anywhere here. The dead helpers it left behind come out in their own commit.
   PERFORMANCE reads WHICHEVER test carries data. Before S509 both the banner and the PDF
   read stdData ONLY, so on a 7-Point job the pump's real results never reached the verdict:
   a 7-pt pump that met every gate printed "CONDITIONAL / FAIL", and worse, a consultant
   Pass printed PASS with no performance ever checked. 3-pt rows are scored by
   _calcFlowPoint and 7-pt rows by updatePldVerdictObj — the two are NEVER crossed
   (different field names; crossing them returns blank/wrong).
   Both the on-screen banner and the printed report call this. They must never diverge
   again — that is the whole point of the single function. */
function _dslVerdictFacts(){
  var f={outstanding:0,recs:0,records:0,perfTotal:0,perfMissed:0,perfRows:0,ratedNet:false,checklistNo:0,anyResponse:false,tcc:''};
  try{
    var allDefs=(typeof contractors!=='undefined'?contractors:[])
      .flatMap(function(n){ return (typeof deficiencies!=='undefined' && deficiencies[n])||[]; })
      .concat(typeof generalDeficiencies!=='undefined'?generalDeficiencies:[]);
    allDefs.forEach(function(d){
      if(!d || d.status==='resolved') return;
      if(d.isRecommendation){ f.recs++; return; }
      if(d.isSiteRecord){ f.records++; return; }
      f.outstanding++;
    });
  }catch(_e1){}
  try{
    if(typeof stdData!=='undefined' && typeof _calcFlowPoint==='function'){
      stdData.forEach(function(r){
        var c=_calcFlowPoint(r); if(!c || c.verdict==='na' || !c.verdict) return;
        f.perfTotal++; if(c.verdict!=='pass') f.perfMissed++;
      });
    }
  }catch(_e2){}
  try{
    if(typeof pldData!=='undefined' && typeof updatePldVerdictObj==='function'){
      pldData.forEach(function(r,i){
        var c=updatePldVerdictObj(r,i); if(!c || c.verdict==='na' || !c.verdict) return;
        f.perfTotal++; if(c.verdict!=='pass') f.perfMissed++;
      });
    }
  }catch(_e3){}
  try{
    ['s1','s2','s3','s4','s4pld','s5'].forEach(function(sec){
      var srcMap={s1:S1,s2:S2,s3:S3,s5:S5}, items=srcMap[sec]; if(!items) return;
      items.forEach(function(_it,idx){
        var st=clState[cid(sec,idx)] && clState[cid(sec,idx)].status;
        if(st) f.anyResponse=true;
        if(st==='no') f.checklistNo++;
      });
    });
  }catch(_e4){}
  // S509c: when nothing is scorable, say WHY. The verdict is unchanged by this —
  // it only decides which NOT CONFIRMED sentence the report prints. A tech who
  // recorded every reading but never entered the placard was previously told "no
  // performance points have been scored", which reads as "you recorded nothing".
  // The gates cannot be evaluated without the rated net (placard at the 100% row),
  // so name that instead of blaming the readings.
  try{
    if(typeof stdData!=='undefined') stdData.forEach(function(r){
      if(r && !isNaN(parseFloat(r.suction)) && !isNaN(parseFloat(r.discharge))) f.perfRows++;
    });
    if(typeof pldData!=='undefined') pldData.forEach(function(r){
      if(!r) return;
      var okNo=!isNaN(parseFloat(r.suc_no)) && !isNaN(parseFloat(r.dis_no));
      var okW =!isNaN(parseFloat(r.suc_w))  && !isNaN(parseFloat(r.dis_w));
      if(okNo||okW) f.perfRows++;
    });
    if(typeof _ratedNetFrom==='function'){
      var rnStd=(typeof stdData!=='undefined')?_ratedNetFrom(stdData):null;
      var rnPld=(typeof pldData!=='undefined')?_ratedNetFrom(pldData):null;
      f.ratedNet=(rnStd!=null)||(rnPld!=null);
    }
  }catch(_e6){}
  try{ f.tcc=(document.getElementById('test-result')||{}).value||''; }catch(_e5){}
  return f;
}