// ════════════════════════════════════════════════════════════════════════════
// lib/ui/deficiencies.js — v1.0.0 (S500)
// The Diesel Deficiencies screen, extracted VERBATIM from the monolith
// (post-flow-photo HEAD e36b30a; six ranges: response-timeline photo handlers,
// openDeficPhotoMarkup, renderDeficThumbs, gallery-reuse wrappers, the core
// panel [contractor tags, per-contractor + general deficiencies, priorities,
// IAR, checklist-findings roll-up, All-view + CSV export], photo removers).
// Classic script; every symbol below is intentionally GLOBAL — inline onclick=
// handlers and the host reach them by name, exactly as before the move.
//
// STATE OWNED HERE (declared, mutated in place, NEVER reassigned anywhere):
//   deficiencies{}, generalDeficiencies[], _deficViewMode, contractor tag list.
// HOST-OWNED (referenced, never defined here): clState, ArcPhoto.mint,
//   compressImage, _photoDateFromExif, _camBurst, _openPmuModal, _pmuState,
//   deletePhotoEverywhere, _openPhotoReusePicker, handleFiles, PANELS,
//   switchPanel, debounceAutosave, showToast, _isPhotoDeleted, _phSrc, escHtml.
// Locked design canon (contractor response grammar, priority colours, IAR flow)
// travels with the code UNCHANGED — relocation only, per LOCKED_* docs.
// DO NOT convert to an ES module — inline onclicks need these global names.
// ════════════════════════════════════════════════════════════════════════════
function deficRespTimelineDrop(ev, name, idx, ci) {
  ev.preventDefault();
  var files = ev.dataTransfer.files;
  if(!files.length) return;
  if(!deficiencies[name][idx].responses[ci].photos) deficiencies[name][idx].responses[ci].photos=[];
  Array.from(files).forEach(function(f) {
    if(!f.type.startsWith('image/')) return;
    var r = new FileReader();
    r.onload = function(ev2) { compressImage(ev2.target.result, 1600, 0.85, function(compressed){ deficiencies[name][idx].responses[ci].photos.push(ArcPhoto.mint(compressed,f.name)); renderDeficGroup(name); }); };
    r.readAsDataURL(f);
  });
}
function deficRespTimelineUpload(name, idx, ci) {
  var inp = document.createElement('input'); inp.type='file'; inp.accept='image/*,.pdf'; inp.multiple=true;
  inp.onchange = function() {
    if(!deficiencies[name][idx].responses[ci].photos) deficiencies[name][idx].responses[ci].photos=[];
    Array.from(inp.files).forEach(function(f) {
      var r = new FileReader();
      r.onload = function(ev) { compressImage(ev.target.result, 1600, 0.85, function(compressed){ deficiencies[name][idx].responses[ci].photos.push(ArcPhoto.mint(compressed,f.name)); renderDeficGroup(name); }); };
      r.readAsDataURL(f);
    });
  }; inp.click();
}
function _pfDeficResp(name, idx, ci, f){
  if(!deficiencies[name][idx].responses[ci].photos) deficiencies[name][idx].responses[ci].photos=[];
  if(!f || !f.type || f.type.indexOf('image/')!==0) return;
  var r = new FileReader();
  r.onload = function(ev) { compressImage(ev.target.result, 1600, 0.85, function(compressed){ deficiencies[name][idx].responses[ci].photos.push(ArcPhoto.mint(compressed,f.name)); renderDeficGroup(name); }); };
  r.readAsDataURL(f);
}
function deficRespTimelineCamera(name, idx, ci) {
  if(typeof _camBurst==='function'){ _camBurst(function(f){ _pfDeficResp(name, idx, ci, f); }); return; }
  deficRespTimelineCameraLegacy(name, idx, ci);
}
function deficRespTimelineCameraLegacy(name, idx, ci) {
  var inp = document.createElement('input'); inp.type='file'; inp.accept='image/*,.pdf'; inp.setAttribute('capture','environment');
  inp.onchange = function() {
    if(!deficiencies[name][idx].responses[ci].photos) deficiencies[name][idx].responses[ci].photos=[];
    var f = inp.files[0]; if(!f) return;
    var r = new FileReader();
    r.onload = function(ev) { compressImage(ev.target.result, 1600, 0.85, function(compressed){ deficiencies[name][idx].responses[ci].photos.push(ArcPhoto.mint(compressed,f.name)); renderDeficGroup(name); setTimeout(function(){inp.value='';inp.click();},300); }); };
    r.readAsDataURL(f);
  }; inp.click();
}

// ── photo markup entry (defic) ──

function openDeficPhotoMarkup(safe, itemIdx, photoIdx) {
  const photos = deficiencies[safe]?.[itemIdx]?.photos;
  if(!photos||!photos[photoIdx]) return;
  pmuState.photoRef = photos;
  pmuState.photoType = 'deficiency';
  pmuState.photoKey = safe;
  pmuState.photoItemIdx = itemIdx;
  pmuState.photoIdx = photoIdx;
  _openPmuModal(photos[photoIdx].d);
}

// ── defic thumbs ──

function renderDeficThumbs(safe, itemIdx) {
  const el=document.getElementById(`dpt-${safe}-${itemIdx}`);
  if(!el) return;
  const photos = deficiencies[safe]?.[itemIdx]?.photos||[];
  el.innerHTML = photos.map((p,j)=>`<div style="position:relative;display:inline-block;">
    <img src="${_phSrc(p)}" onclick="openLightbox(deficiencies['${safe}'][${itemIdx}].photos,${j})" style="cursor:zoom-in;width:72px;height:72px;object-fit:cover;border-radius:4px;border:2px solid #eee;" title="Click to enlarge">
    <button onclick="event.stopPropagation();removeDeficPhoto('${safe}',${itemIdx},${j})" style="position:absolute;top:-5px;right:-5px;background:#A85959;color:white;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:10px;padding:0;line-height:1;">✕</button>
    <button class="photo-markup-btn" onclick="event.stopPropagation();openLightboxMarkup(deficiencies['${safe}'][${itemIdx}].photos,${j})" title="Markup">✏</button>
  </div>`).join('');
}

// ── gallery-reuse wrappers (defic) ──

function _galleryReuseDefic(name, idx){
  var cur=(deficiencies[name]&&deficiencies[name][idx]&&deficiencies[name][idx].photos)||[];
  _openPhotoReusePicker(function(file){ handleFiles(name, [file], true); }, {excludeIds:cur.map(function(p){return p&&p.id;})});
}
function _galleryReuseDeficResp(name, idx, ci){
  var cur=(deficiencies[name]&&deficiencies[name][idx]&&deficiencies[name][idx].responses&&deficiencies[name][idx].responses[ci]&&deficiencies[name][idx].responses[ci].photos)||[];
  _openPhotoReusePicker(function(file){
    var r=new FileReader(); r.onload=function(ev){ compressImage(ev.target.result,1600,0.85,function(compressed){
      deficiencies[name][idx].responses[ci].photos.push(ArcPhoto.mint(compressed,file.name));
      renderDeficGroup(name); if(typeof debounceAutosave==='function')debounceAutosave();
    }); }; r.readAsDataURL(file);
  }, {excludeIds:cur.map(function(p){return p&&p.id;})});
}
function _galleryReuseGenDefic(idx){
  var cur=(generalDeficiencies[idx]&&generalDeficiencies[idx].photos)||[];
  _openPhotoReusePicker(function(file){
    var r=new FileReader(); r.onload=function(ev){ compressImage(ev.target.result,1600,0.85,function(compressed){
      if(!generalDeficiencies[idx].photos)generalDeficiencies[idx].photos=[];
      generalDeficiencies[idx].photos.push(ArcPhoto.mint(compressed,file.name));
      if(typeof renderDeficGroups==='function')renderDeficGroups(); if(typeof debounceAutosave==='function')debounceAutosave();
    }); }; r.readAsDataURL(file);
  }, {excludeIds:cur.map(function(p){return p&&p.id;})});
}
function _galleryReuseGenDeficResp(idx, ci){
  var cur=(generalDeficiencies[idx]&&generalDeficiencies[idx].responses&&generalDeficiencies[idx].responses[ci]&&generalDeficiencies[idx].responses[ci].photos)||[];
  _openPhotoReusePicker(function(file){
    var r=new FileReader(); r.onload=function(ev){ compressImage(ev.target.result,1600,0.85,function(compressed){
      if(!generalDeficiencies[idx].responses[ci].photos)generalDeficiencies[idx].responses[ci].photos=[];
      generalDeficiencies[idx].responses[ci].photos.push(ArcPhoto.mint(compressed,file.name));
      if(typeof renderDeficGroups==='function')renderDeficGroups(); if(typeof debounceAutosave==='function')debounceAutosave();
    }); }; r.readAsDataURL(file);
  }, {excludeIds:cur.map(function(p){return p&&p.id;})});
}

// ── CORE DEFICIENCIES PANEL ──

const deficiencies = {}; // { name: [{description,drawing,iarStatus,status,response,responseDate,responsePhoto,photos}] }
let deficPhotoTarget = null; // { name, idx, type }

function addContractorTag() {
  const inp = document.getElementById('new-contractor-input');
  const name = (inp.value || '').trim();
  if (!name) return;
  const tradeInp = document.getElementById('new-contractor-trade');
  const trade = tradeInp ? (tradeInp.value || '').trim() : '';
  if (contractors.find(c => c === name)) { inp.value = ''; if(trade) contractorTrades[name] = trade; if(tradeInp) tradeInp.value=''; renderContractorTags(); renderDeficGroups(); return; }
  contractors.push(name);
  if (trade) contractorTrades[name] = trade;
  deficiencies[name] = [];
  inp.value = ''; if (tradeInp) tradeInp.value = '';
  renderContractorTags();
  renderDeficGroups();
  updateDeficSummary();
}

function removeContractorTag(name) {
  const i = contractors.indexOf(name);
  if (i >= 0) contractors.splice(i, 1);
  delete deficiencies[name];
  delete contractorTrades[name];
  renderContractorTags();
  renderDeficGroups();
  updateDeficSummary();
}

function renderContractorTags() {
  const el = document.getElementById('contractor-tags');
  if (!el) return;
  el.innerHTML = contractors.map(name => {
    const safe = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return `<div style="display:inline-flex;align-items:center;gap:6px;background:#1C2333;color:white;border-radius:20px;padding:4px 12px;font-size:12.5px;font-weight:600;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      ${name}${contractorTrades[name] ? `<span style="background:rgba(255,255,255,.18);border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:600;">${contractorTrades[name]}</span>` : ''}
      <button onclick="removeContractorTag('${safe}')" style="background:rgba(255,255,255,.25);border:none;color:white;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:10px;padding:0;">✕</button>
    </div>`;
  }).join('');
}

// ═══ S297: FRT priority system (High/Low/General/Recommendation) ═══
// Colors are the FRT semantic set — same meaning across all tools; Recommendation
// uses the sanctioned rec-amber #D98A1E. Additive schema: d.priority, default 'high'.
function _deficPriColor(p){ return ({high:'#C0445F',low:'#C98A4A'})[p]||'#C98A4A'; }
// S501 (Mark): priority simplified to High/Low. Legacy 'general'/'recommendation'
// values are NOT rewritten in the data (silent-degrade, FRT S217 pattern) — they
// display as Low here so the row never renders with nothing selected.
function _deficPriNorm(p){ return (p==='high') ? 'high' : 'low'; }
function _deficPriRow(cur, handlerPrefix){
  var shown=_deficPriNorm(cur);
  var L=[['high','High'],['low','Low']];
  var h='<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center;">'
       +'<span style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-right:2px;">Priority</span>';
  L.forEach(function(x){
    var on=(shown===x[0]), col=_deficPriColor(x[0]);
    h+='<button onclick="'+handlerPrefix+'\''+x[0]+'\')" style="padding:4px 12px;border-radius:14px;font-size:calc(11.5px + var(--ts));font-weight:600;font-family:Calibri,sans-serif;cursor:pointer;border:1.5px solid '+col+';'
      +(on?('background:'+col+';color:#fff;'):('background:transparent;color:'+col+';'))+'">'+x[1]+'</button>';
  });
  return h+'</div>';
}
function setDeficPriority(name,i,pri){
  if(deficiencies[name]&&deficiencies[name][i]){ deficiencies[name][i].priority=pri; renderDeficGroup(name); if(typeof updateDeficSummary==='function') updateDeficSummary(); if(typeof debounceAutosave==='function') debounceAutosave(); }
}
function setGenDeficPriority(i,pri){
  if(generalDeficiencies[i]){ generalDeficiencies[i].priority=pri; renderGeneralDeficGroup(); if(typeof updateDeficSummary==='function') updateDeficSummary(); if(typeof debounceAutosave==='function') debounceAutosave(); }
}

function addDeficiencyForContractor(name) {
  if (!deficiencies[name]) deficiencies[name] = [];
  deficiencies[name].push({ description:'', date:'', iarStatus:false, status:'open', priority:'high', photos:[], responses:[] });
  renderDeficGroup(name);
  updateDeficSummary();
}

function removeDeficItem(name, idx) {
  if (deficiencies[name]) deficiencies[name].splice(idx, 1);
  renderDeficGroup(name);
  updateDeficSummary();
}

function renderDeficGroups() {
  const el = document.getElementById('defic-groups');
  if (!el) return;
  if (contractors.length === 0) {
    el.innerHTML = '<p style="color:#999;font-size:13px;padding:12px 0;text-align:center;">Add a contractor above to start recording deficiencies.</p>';
    return;
  }
  el.innerHTML = '';
  contractors.forEach(name => {
    const div = document.createElement('div');
    div.id = 'defic-group-' + name;
    el.appendChild(div);
    renderDeficGroup(name);
  });
}

function renderDeficGroup(name) {
  const el = document.getElementById('defic-group-' + name);
  if (!el) return;
  const items = deficiencies[name] || [];
  const safe = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  let html = `<div style="border:1.5px solid var(--border);border-radius:10px;margin-bottom:16px;overflow:hidden;">
    <div style="background:#1C2333;color:white;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-family:Calibri,sans-serif;font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px;">👷 ${name}${contractorTrades[name] ? `<span style="background:rgba(255,255,255,.18);border-radius:10px;padding:2px 9px;font-size:11px;font-weight:600;">${contractorTrades[name]}</span>` : ''}</span>
      <span style="font-size:12px;opacity:.7;">${items.length} item${items.length!==1?'s':''}</span>
    </div>`;
  if (items.length === 0) {
    html += '<p style="padding:12px 16px;color:#999;font-size:13px;font-style:italic;">No deficiencies for this contractor.</p>';
  } else {
    items.forEach((d, i) => { html += buildDeficItem(name, safe, d, i); });
  }
  html += `<div style="padding:10px 16px;border-top:1px solid #eee;">
    <button class="btn btn-outline btn-sm" onclick="addDeficiencyForContractor('${safe}')">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      + Add Deficiency
    </button>
  </div></div>`;
  el.innerHTML = html;
}

function buildDeficItem(name, safe, d, i) {
  var sc = d.status || 'open';
  var scCol = sc==='resolved' ? '#5F8068' : sc==='in-progress' ? '#E67E22' : '#A85959';
  var thumbsHtml = '';
  (d.photos || []).forEach(function(p, j) {
    if(p&&p.deleted) return;   // S337: soft-deleted photos never render
    thumbsHtml += '<div class="photo-thumb">'
      +'<img src="'+_phSrc(p)+'" onclick="openLightbox(deficiencies[\''+safe+'\']['+i+'].photos,'+j+')" style="cursor:zoom-in;width:86px;height:86px;object-fit:cover;border-radius:6px;border:2px solid #ddd;box-shadow:0 1px 3px rgba(0,0,0,0.1);" title="Click to view">'
      +'<button class="photo-remove" onclick="removeDeficPhoto(\''+safe+'\','+i+','+j+')">✕</button></div>';
  });

  // Build unified response timeline
  var resps = d.responses || [];
  var respHtml = '';
  resps.forEach(function(cr, ci) {
    var party = cr.party || 'contractor';
    var isContractor = party === 'contractor';
    var accentCol = isContractor ? '#E67E22' : '#1565C0';
    var bgCol = isContractor ? '#fffbf0' : '#f0f4ff';
    var borderCol = isContractor ? '#e8d060' : '#b0c4de';
    var icon = isContractor ? '⚡' : '🔍';
    var label = isContractor ? 'Contractor' : 'Consultant';
    var crSc = cr.status || 'open';
    var crScCol = crSc==='resolved'?'#5F8068':crSc==='in-progress'?'#E67E22':'#A85959';
    var crPhotosHtml = '';
    (cr.photos || []).forEach(function(rp, ri) {
      if(rp&&rp.deleted) return;   // S337
      crPhotosHtml += '<div style="position:relative;display:inline-block;">'
        +'<img src="'+(_phSrc(rp)||rp)+'" onclick="if(typeof openLightbox===\'function\')openLightbox(deficiencies[\''+safe+'\']['+i+'].responses['+ci+'].photos,'+ri+',{renderer:function(){renderDeficGroup(\''+name+'\');}})" style="width:86px;height:86px;object-fit:cover;border-radius:6px;border:2px solid #ddd;box-shadow:0 1px 3px rgba(0,0,0,0.1);cursor:zoom-in;">'
        +'<button onclick="event.stopPropagation();removeDeficRespPhoto(\''+safe+'\','+i+','+ci+','+ri+',\''+name+'\')" style="position:absolute;top:-4px;right:-4px;background:#A85959;color:white;border:none;border-radius:50%;width:14px;height:14px;cursor:pointer;font-size:9px;padding:0;">✕</button></div>';
    });
    respHtml += '<div style="margin-top:8px;padding:10px 12px;background:'+bgCol+';border:1px solid '+borderCol+';border-left:3px solid '+accentCol+';border-radius:6px;">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
      +'<div style="font-size:11px;font-weight:700;color:'+accentCol+';text-transform:uppercase;letter-spacing:.5px;">'+icon+' '+label+' Response #'+(ci+1)+'</div>'
      +'<button onclick="deficiencies[\''+safe+'\']['+i+'].responses.splice('+ci+',1);renderDeficGroup(\''+name+'\');" style="padding:2px 8px;border:1px solid #ddd;border-radius:4px;background:white;color:#999;font-size:10px;cursor:pointer;">✕ Remove</button></div>'
      +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">'
      +'<div><label style="font-size:11px;color:#666;">Date</label><input type="date" value="'+(cr.date||'')+'" oninput="deficiencies[\''+safe+'\']['+i+'].responses['+ci+'].date=this.value" style="display:block;padding:5px 8px;border:1.5px solid #ddd;border-radius:5px;font-size:12px;margin-top:2px;"></div>'
      +'<div><label style="font-size:11px;color:#666;">Status</label>'
      +(isContractor
        ?'<select style="display:block;padding:5px 8px;border:1.5px solid var(--border);border-radius:5px;font-size:12px;color:#E67E22;font-weight:600;margin-top:2px;" onchange="deficiencies[\''+safe+'\']['+i+'].responses['+ci+'].status=this.value;renderDeficGroup(\''+name+'\');"><option value="review" selected>● For Consultant Review</option></select>'
        :'<select style="display:block;padding:5px 8px;border:1.5px solid var(--border);border-radius:5px;font-size:12px;color:'+crScCol+';font-weight:600;margin-top:2px;" onchange="deficiencies[\''+safe+'\']['+i+'].responses['+ci+'].status=this.value;_checkConsultantClose(\''+safe+'\','+i+');renderDeficGroup(\''+name+'\');">'
        +'<option value="open" '+(crSc==='open'?'selected':'')+'>● Outstanding</option>'
        +'<option value="in-progress" '+(crSc==='in-progress'?'selected':'')+'>● In Progress</option>'
        +'<option value="resolved" '+(crSc==='resolved'?'selected':'')+'>● Addressed & Closed</option></select>')
      +'</div></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      +'<div><div style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Comment</div>'
      +'<textarea placeholder="'+label+' response..." style="width:100%;height:100px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;" oninput="deficiencies[\''+safe+'\']['+i+'].responses['+ci+'].comment=this.value">'+(cr.comment||'')+'</textarea></div>'
      +'<div><div style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Response Photos</div>'
      +'<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">'+crPhotosHtml+'</div>'
      +'<div class="photo-zone ev-clickable" onclick="_boxUp(event,function(){deficRespTimelineUpload(\''+safe+'\','+i+','+ci+')})" ondragover="event.preventDefault();this.style.borderColor=\'var(--red)\';" ondragleave="this.style.borderColor=\'var(--border)\';" ondrop="event.preventDefault();this.style.borderColor=\'var(--border)\';deficRespTimelineDrop(event,\''+safe+'\','+i+','+ci+')" style="padding:14px;min-height:80px;border:2px dashed var(--border);border-radius:8px;font-size:11px;color:var(--silver);text-align:center;background:var(--smoke);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">'
      +'<span>Drag, drop or tap</span>'
      +'<div style="display:flex;gap:5px;">'
      +'<button onclick="deficRespTimelineCamera(\''+safe+'\','+i+','+ci+')" style="padding:5px 10px;border:none;border-radius:5px;background:#5C7A65;color:white;font-size:calc(12.5px + var(--ts));cursor:pointer;">📷 Camera</button>'
      
      +'<button onclick="_galleryReuseDeficResp(\''+safe+'\','+i+','+ci+')" style="padding:5px 10px;border:none;border-radius:5px;background:#8A7689;color:white;font-size:calc(12.5px + var(--ts));cursor:pointer;">🖼 Gallery</button>'
      +'</div></div></div></div></div>';
  });

  // Two add buttons together
  respHtml += '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">'
    +'<button onclick="if(!deficiencies[\''+safe+'\']['+i+'].responses)deficiencies[\''+safe+'\']['+i+'].responses=[];deficiencies[\''+safe+'\']['+i+'].responses.push({party:\'contractor\',comment:\'\',date:\'\',status:\'open\',photos:[]});renderDeficGroup(\''+name+'\');" style="padding:6px 14px;border:1.5px dashed #E67E22;border-radius:5px;background:#fffbf0;color:#E67E22;font-size:12px;cursor:pointer;font-weight:600;">+ Add Contractor Response</button>'
    +'<button onclick="if(!deficiencies[\''+safe+'\']['+i+'].responses)deficiencies[\''+safe+'\']['+i+'].responses=[];deficiencies[\''+safe+'\']['+i+'].responses.push({party:\'consultant\',comment:\'\',date:\'\',status:\'open\',photos:[]});renderDeficGroup(\''+name+'\');" style="padding:6px 14px;border:1.5px dashed #1565C0;border-radius:5px;background:#f0f4ff;color:#1565C0;font-size:12px;cursor:pointer;font-weight:600;">+ Add Consultant Response</button>'
    +'</div>';

  return '<div style="border-top:1px solid var(--border);padding:14px 16px;">'
    +'<div style="display:flex;gap:10px;align-items:flex-start;">'
    +'<div title="'+(d.priority||'high')+' priority" style="min-width:28px;width:28px;height:28px;border-radius:50%;background:'+_deficPriColor(d.priority||'high')+';color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">'+(i+1)+'</div>'
    +'<div style="flex:1;min-width:0;">'
    +_deficPriRow(d.priority||'high', 'setDeficPriority(\''+safe+'\','+i+',')
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
    +'<div>'
    +'<div style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Describe Deficiency</div>'
    +'<textarea placeholder="Describe deficiency..." style="width:100%;height:150px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;" oninput="deficiencies[\''+safe+'\']['+i+'].description=this.value">'+(d.description||'')+'</textarea></div>'
    +'<div>'
    +'<div style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Evidence Photos</div>'
    +'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;" id="dpt-'+safe+'-'+i+'">'+thumbsHtml+'</div>'
    +'<div class="photo-zone ev-clickable" onclick="_boxUp(event,function(){deficUpload(\''+safe+'\','+i+')})" ondragover="handleDragOver(event,\'_d_'+safe+'_'+i+'\')" ondragleave="handleDragLeave(event,\'_d_'+safe+'_'+i+'\')" ondrop="deficDrop(event,\''+safe+'\','+i+')" style="padding:14px 12px;min-height:110px;border:2px dashed var(--border);border-radius:8px;font-size:11px;color:var(--silver);text-align:center;background:var(--smoke);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;">'
    +'<span>Drag, drop or tap here</span>'
    +'<div style="display:flex;gap:5px;">'
    +'<button onclick="event.stopPropagation();deficCamera(\''+safe+'\','+i+')" style="padding:5px 10px;border:none;border-radius:5px;background:#5C7A65;color:white;font-size:calc(12.5px + var(--ts));cursor:pointer;">📷 Camera</button>'
    
    +'<button onclick="event.stopPropagation();_galleryReuseDefic(\''+safe+'\','+i+')" style="padding:5px 10px;border:none;border-radius:5px;background:#8A7689;color:white;font-size:calc(12.5px + var(--ts));cursor:pointer;">🖼 Gallery</button></div></div></div></div>'
    +'<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:flex-end;">'
    +'<div><label style="font-size:11px;color:#666;display:block;margin-bottom:2px;">Date</label><input type="date" value="'+(d.date||'')+'" oninput="deficiencies[\''+safe+'\']['+i+'].date=this.value" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:5px;font-size:12px;"></div>'
    +'<div><label style="font-size:11px;color:#666;display:block;margin-bottom:2px;">Status</label><select style="padding:5px 8px;border:1.5px solid var(--border);border-radius:5px;font-size:12px;color:'+scCol+';font-weight:600;" onchange="deficiencies[\''+safe+'\']['+i+'].status=this.value;_checkDeficStatusChange(\''+safe+'\','+i+');updateDeficSummary();">'
    +'<option value="open" '+(sc==='open'?'selected':'')+'>● Outstanding</option>'
    +'<option value="in-progress" '+(sc==='in-progress'?'selected':'')+'>● In Progress</option>'
    +'<option value="resolved" '+(sc==='resolved'?'selected':'')+'>● Addressed & Closed</option></select></div>'
    +'<div><label style="font-size:11px;color:transparent;display:block;margin-bottom:2px;">.</label><button onclick="removeDeficItem(\''+safe+'\','+i+')" style="padding:5px 8px;border:1.5px solid #ddd;border-radius:5px;background:white;color:#aaa;font-size:11px;cursor:pointer;">✕ Remove</button></div></div>'
    +'</div></div>'
    + respHtml
    +'</div>';
}

function toggleIAR(name, idx) {
  deficiencies[name][idx].iarStatus = !deficiencies[name][idx].iarStatus;
  renderDeficGroup(name);
  updateDeficSummary();
}
function _checkConsultantClose(name, idx) {
  // When consultant selects "Addressed & Closed":
  // If the deficiency has IAR flagged, show confirmation to clear it
  var d = deficiencies[name] && deficiencies[name][idx];
  if(!d) return;
  var resps = d.responses || [];
  var lastConsultant = null;
  for(var ri=resps.length-1; ri>=0; ri--) {
    if(resps[ri].party==='consultant') { lastConsultant=resps[ri]; break; }
  }
  if(lastConsultant && lastConsultant.status==='resolved') {
    d.status = 'resolved';
    // S501: IAR is retired from the UI. The stored flag is silently cleared on
    // close (no dialog) so the legacy verdict logic in the host still reads
    // correctly until step 2 removes IAR from the verdict entirely.
    if(d.iarStatus) d.iarStatus = false;
  }
  renderDeficGroup(name);
  updateDeficSummary();
}

function _checkDeficStatusChange(name, idx) {
  // S501: IAR retired from UI. On close, silently clear the stored flag (no
  // dialog) so the host's legacy verdict logic still reads correctly until
  // step 2 removes IAR from the verdict.
  var d = deficiencies[name] && deficiencies[name][idx];
  if(!d) return;
  if(d.status === 'resolved' && d.iarStatus) d.iarStatus = false;
}

function deficUpload(name, idx) {
  deficPhotoTarget = { name, idx, type: 'evidence' };
  const fi = document.getElementById('global-file-input');
  fi.accept = 'image/*'; fi.multiple = true; fi.removeAttribute('capture'); fi.value = ''; fi.click();
}
function _pfDefic(name, idx, f){ if(!f||!f.type||f.type.indexOf('image/')!==0) return; _photoDateFromExif(f).then(function(_pd){var r=new FileReader();r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){deficiencies[name][idx].photos.push(ArcPhoto.mint(c,f.name,{date:_pd}));renderDeficGroup(name);if(typeof updateDeficSummary==='function')updateDeficSummary();});}; r.readAsDataURL(f);}); }
function deficCamera(name, idx) {
  if(typeof _camBurst==='function'){ _camBurst(function(f){ _pfDefic(name, idx, f); }); return; }
  deficCameraLegacy(name, idx);
}
function deficCameraLegacy(name, idx) {
  deficPhotoTarget = { name, idx, type: 'evidence' };
  const fi = document.getElementById('global-file-input');
  fi.accept = 'image/*'; fi.setAttribute('capture', 'environment'); fi.multiple = false; fi.value = ''; fi.click();
}
function deficDrop(e, name, idx) {
  e.preventDefault(); e.stopPropagation();
  Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => {
    const r = new FileReader();
    r.onload = ev => { compressImage(ev.target.result, 1600, 0.85, function(compressed){ deficiencies[name][idx].photos.push(ArcPhoto.mint(compressed,f.name)); renderDeficGroup(name); }); };
    r.readAsDataURL(f);
  });
}
function removeDeficPhoto(name, idx, j) {
  // S264: confirm + authoritative delete (both surfaces + R2 + save) by id.
  var p = (deficiencies[name] && deficiencies[name][idx] && deficiencies[name][idx].photos) ? deficiencies[name][idx].photos[j] : null;
  if(!p){ return; }
  if(p.id){ deletePhotoEverywhere({photoId:p.id}); }
  else {
    _aConfirm('Delete this photo? This cannot be undone.', function(){
      deficiencies[name][idx].photos.splice(j, 1);
      renderDeficGroup(name);
      if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
      if(typeof saveState==='function') saveState();
    },'Delete');
  }
}

// ═══ S299: Checklist Findings — auto-aggregated view of every checklist item
// marked NO, shown at the top of the Deficiencies tab. The checklist stays the
// system of record (numbered NFPA 20 anchoring is the audit trail); this is a
// read-only roll-up with tap-through. No schema, purely derived. ═══
function _checklistFindings(){
  var srcMap = { s1:(typeof S1!=='undefined')?S1:null, s2:(typeof S2!=='undefined')?S2:null,
                 s3:(typeof S3!=='undefined')?S3:null, s5:(typeof S5!=='undefined')?S5:null };
  var out=[];
  Object.keys(clState||{}).forEach(function(id){
    var st=clState[id]; if(!st || st.status!=='no') return;
    var m=id.match(/^([a-z0-9]+)_(\d+)$/); if(!m) return;
    var sec=m[1], idx=parseInt(m[2],10);
    var base=srcMap[sec]||[];
    var all = base.concat((typeof customItems!=='undefined' && customItems[sec])||[]);
    var item = all[idx];
    var num = (item&&item.num) ? item.num : (sec.replace('s4pld','4b').replace('s5m','5').replace('s','')+'.'+(idx+1));
    var text = (item&&item.text) ? item.text : (st.customText||'(custom item)');
    out.push({id:id, num:num, text:text, photos:(st.photos||[]).filter(function(p){return !_isPhotoDeleted(p);}).length, comment:st.comment||''});
  });
  out.sort(function(a,b){ return a.id<b.id?-1:1; });
  return out;
}
function _jumpToChecklistItem(id){
  // S312: capture where we jumped FROM so the user can get back. The findings
  // roll-up lives on the Deficiencies panel; jumping to a checklist item navigated
  // away with no return path. Remember the origin panel and surface a Back pill.
  var origin = (typeof _currentActivePanel==='function') ? _currentActivePanel() : 'defic';
  var sec=(id.match(/^([a-z0-9]+)_/)||[])[1]||'';
  var panel = sec.indexOf('s4')===0 ? 's4' : sec.indexOf('s5')===0 ? 's5' : sec;
  window._jumpInProgress = true;
  if(typeof switchPanel==='function') switchPanel(panel);
  window._jumpInProgress = false;
  setTimeout(function(){
    var el=document.getElementById('ci-'+id);
    if(el){ el.scrollIntoView({behavior:'smooth',block:'center'});
      el.style.outline='2px solid #9C2742'; el.style.outlineOffset='2px';
      setTimeout(function(){ el.style.outline=''; el.style.outlineOffset=''; }, 2200); }
    _showJumpBackPill(origin);
  }, 280);
}
// Returns the id of the currently-active panel (the one we're leaving).
function _currentActivePanel(){
  var found='defic';
  (typeof PANELS!=='undefined'?PANELS:[]).forEach(function(p){
    var el=document.getElementById('panel-'+p);
    if(el && el.classList.contains('active')) found=p;
  });
  return found;
}
// Floating "Back" pill that returns to the origin panel. One at a time; auto-
// dismisses on its own click, on any other panel switch, or after 12s.
var _jumpBackTimer=null;
function _showJumpBackPill(originPanel){
  _removeJumpBackPill();
  var label = originPanel==='defic' ? 'Back to Deficiencies' : 'Back';
  var b=document.createElement('button');
  b.id='jump-back-pill';
  b.textContent='\u2190 '+label;
  b.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(70px + env(safe-area-inset-bottom,0px));z-index:10040;'
    +'background:#9C2742;color:#fff;border:none;border-radius:22px;padding:11px 20px;font-family:Calibri,sans-serif;'
    +'font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);min-height:44px;';
  b.onclick=function(){ if(typeof switchPanel==='function') switchPanel(originPanel); _removeJumpBackPill(); };
  document.body.appendChild(b);
  if(_jumpBackTimer) clearTimeout(_jumpBackTimer);
  _jumpBackTimer=setTimeout(_removeJumpBackPill, 12000);
}
function _removeJumpBackPill(){
  var ex=document.getElementById('jump-back-pill'); if(ex) ex.remove();
  if(_jumpBackTimer){ clearTimeout(_jumpBackTimer); _jumpBackTimer=null; }
}
function _renderChecklistFindings(){
  var el=document.getElementById('checklist-findings');
  if(!el) return;
  var rows=_checklistFindings();
  if(!rows.length){ el.innerHTML=''; el.style.display='none'; return; }
  el.style.display='';
  var h='<div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;">'
      +'<div style="background:#A85959;color:white;padding:9px 16px;display:flex;justify-content:space-between;align-items:center;">'
      +'<span style="font-family:Calibri,sans-serif;font-weight:700;font-size:14px;">\u2717 Checklist Findings</span>'
      +'<span style="font-size:11.5px;opacity:.8;">auto \u2014 items marked NO \u00b7 '+rows.length+'</span></div>';
  rows.forEach(function(r){
    var txt=(r.text||'').length>150 ? (r.text.slice(0,150)+'\u2026') : (r.text||'');
    h+='<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 16px;border-top:1px solid var(--border);font-size:13px;">'
      +'<span style="background:#A85959;color:#fff;border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px;">'+r.num+'</span>'
      +'<span style="flex:1;min-width:0;color:var(--slate);">'+txt
      +(r.comment?('<div style="font-size:11.5px;color:var(--steel);margin-top:2px;">\u270E '+(r.comment.length>120?r.comment.slice(0,120)+'\u2026':r.comment)+'</div>'):'')
      +'</span>'
      +(r.photos?('<span style="font-size:11.5px;color:var(--steel);flex-shrink:0;margin-top:2px;">\uD83D\uDCF7 '+r.photos+'</span>'):'')
      +'<button onclick="_jumpToChecklistItem(\''+r.id+'\')" style="flex-shrink:0;padding:3px 10px;border:1.5px solid var(--border);border-radius:6px;background:var(--smoke);color:var(--steel);font-size:11.5px;font-weight:600;font-family:Calibri,sans-serif;cursor:pointer;">View \u2192</button>'
      +'</div>';
  });
  el.innerHTML=h+'</div>';
}

function updateDeficSummary() {
  if(typeof updateDeficTabBadge==='function') updateDeficTabBadge();
  if(typeof _renderChecklistFindings==='function') _renderChecklistFindings();   // S299
  const el = document.getElementById('defic-summary-table');
  if (!el) return;
  if (contractors.length === 0 && generalDeficiencies.length === 0) { el.innerHTML = '<p style="color:var(--silver);font-size:13px;">No contractors added yet.</p>'; return; }
  let totAll = 0, openAll = 0, resAll = 0;
  const rows = contractors.map(name => {
    const items = deficiencies[name] || [];
    const tot = items.length;
    const open = items.filter(d => !d.status || d.status === 'open').length;
    const res = items.filter(d => d.status === 'resolved').length;
    totAll += tot; openAll += open; resAll += res;
    return `<tr><td>${name}</td><td>${tot}</td><td style="color:${open?'var(--no)':'var(--silver)'}">${open}</td><td style="color:${res?'var(--yes)':'var(--silver)'}">${res}</td></tr>`;
  }).join('');
  var genRow = '';
  if(generalDeficiencies.length) {
    var gTot=generalDeficiencies.length, gOpen=generalDeficiencies.filter(function(d){return !d.status||d.status==='open';}).length, gRes=generalDeficiencies.filter(function(d){return d.status==='resolved';}).length;
    totAll+=gTot; openAll+=gOpen; resAll+=gRes;
    genRow = `<tr><td>General</td><td>${gTot}</td><td style="color:${gOpen?'var(--no)':'var(--silver)'}">${gOpen}</td><td style="color:${gRes?'var(--yes)':'var(--silver)'}">${gRes}</td></tr>`;
  }
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Contractor</th><th>Total</th><th>Outstanding</th><th>Addressed & Closed</th></tr></thead>
    <tbody>${rows}${genRow}
      <tr class="total-row"><td>TOTAL</td><td>${totAll}</td>
        <td style="color:${openAll?'var(--no)':'var(--silver)'}">${openAll}</td>
        <td style="color:${resAll?'var(--yes)':'var(--silver)'}">${resAll}</td>
      </tr>
    </tbody>
  </table>
  <p style="font-size:11px;color:var(--silver);margin-top:6px;">Status tracks contractor corrective action.</p>`;
  // Show/update All Deficiencies section if in that view
  if(_deficViewMode==='all') renderAllDeficTable();
  if(typeof updateCompletionOverview==='function') updateCompletionOverview();
}

// ═══ GENERAL DEFICIENCIES (not tied to a contractor) ═══
var generalDeficiencies = [];

function addGeneralDeficiency() {
  generalDeficiencies.push({ description:'', date:'', iarStatus:false, status:'open', priority:'high', photos:[], responses:[] });
  renderGeneralDeficGroup();
  updateDeficSummary();
}

function removeGeneralDeficItem(idx) {
  generalDeficiencies.splice(idx, 1);
  renderGeneralDeficGroup();
  updateDeficSummary();
}

function renderGeneralDeficGroup() {
  var el = document.getElementById('general-defic-group');
  if (!el) return;
  if (!generalDeficiencies.length) { el.innerHTML = ''; return; }
  var html = '<div style="border:1.5px solid var(--border);border-radius:10px;margin-bottom:16px;overflow:hidden;">';
  html += '<div style="background:#455A64;color:white;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">';
  html += '<span style="font-family:Calibri,sans-serif;font-weight:700;font-size:15px;">📋 General (No Contractor)</span>';
  html += '<span style="font-size:12px;opacity:.7;">'+generalDeficiencies.length+' item'+(generalDeficiencies.length!==1?'s':'')+'</span></div>';
  generalDeficiencies.forEach(function(d, i) { html += buildGeneralDeficItem(d, i); });
  html += '<div style="padding:10px 16px;border-top:1px solid #eee;"><button class="btn btn-outline btn-sm" onclick="addGeneralDeficiency()">+ Add Deficiency</button></div></div>';
  el.innerHTML = html;
}

function buildGeneralDeficItem(d, i) {
  var sc = d.status || 'open';
  var scCol = sc==='resolved' ? '#5F8068' : sc==='in-progress' ? '#E67E22' : '#A85959';
  var thumbsHtml = '';
  (d.photos || []).forEach(function(p, j) {
    if(p&&p.deleted) return;   // S337
    thumbsHtml += '<div class="photo-thumb"><img src="'+_phSrc(p)+'" onclick="openLightbox(generalDeficiencies['+i+'].photos,'+j+')" style="cursor:zoom-in;width:86px;height:86px;object-fit:cover;border-radius:6px;border:2px solid #ddd;box-shadow:0 1px 3px rgba(0,0,0,0.1);" title="Click to view"><button class="photo-remove" onclick="removeGenDeficPhoto('+i+','+j+')">✕</button></div>';
  });
  var respHtml = '';
  (d.responses || []).forEach(function(cr, ci) {
    var party = cr.party || 'contractor';
    var isContractor = party === 'contractor';
    var accentCol = isContractor ? '#E67E22' : '#1565C0';
    var bgCol = isContractor ? '#fffbf0' : '#f0f4ff';
    var borderCol = isContractor ? '#e8d060' : '#b0c4de';
    var label = isContractor ? 'Contractor' : 'Consultant';
    var crPhotosHtml = '';
    (cr.photos || []).forEach(function(rp, ri) {
      if(rp&&rp.deleted) return;   // S337
      crPhotosHtml += '<div style="position:relative;display:inline-block;"><img src="'+(_phSrc(rp)||rp)+'" onclick="if(typeof openLightbox===\'function\')openLightbox(generalDeficiencies['+i+'].responses['+ci+'].photos,'+ri+',{renderer:function(){renderGeneralDeficGroup();}})" style="width:86px;height:86px;object-fit:cover;border-radius:6px;border:2px solid #ddd;cursor:zoom-in;"><button onclick="event.stopPropagation();removeGenDeficRespPhoto('+i+','+ci+','+ri+')" style="position:absolute;top:-4px;right:-4px;background:#A85959;color:white;border:none;border-radius:50%;width:14px;height:14px;cursor:pointer;font-size:9px;padding:0;">✕</button></div>';
    });
    respHtml += '<div style="margin-top:8px;padding:10px 12px;background:'+bgCol+';border:1px solid '+borderCol+';border-left:3px solid '+accentCol+';border-radius:6px;">';
    respHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><div style="font-size:11px;font-weight:700;color:'+accentCol+';text-transform:uppercase;letter-spacing:.5px;">'+(isContractor?'⚡':'🔍')+' '+label+' Response #'+(ci+1)+'</div><button onclick="generalDeficiencies['+i+'].responses.splice('+ci+',1);renderGeneralDeficGroup();" style="padding:2px 8px;border:1px solid #ddd;border-radius:4px;background:white;color:#999;font-size:10px;cursor:pointer;">✕ Remove</button></div>';
    respHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    respHtml += '<div><div style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Comment</div><textarea placeholder="'+label+' response..." style="width:100%;height:100px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;" oninput="generalDeficiencies['+i+'].responses['+ci+'].comment=this.value">'+(cr.comment||'')+'</textarea></div>';
    respHtml += '<div><div style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Response Photos</div><div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">'+crPhotosHtml+'</div>';
    respHtml += '<div class="photo-zone ev-clickable" onclick="_boxUp(event,function(){genDeficRespUpload('+i+','+ci+')})" ondragover="event.preventDefault();this.style.borderColor=\'var(--red)\';" ondragleave="this.style.borderColor=\'var(--border)\';" ondrop="event.preventDefault();this.style.borderColor=\'var(--border)\';genDeficRespDrop(event,'+i+','+ci+')" style="padding:14px;min-height:80px;border:2px dashed var(--border);border-radius:8px;font-size:11px;color:var(--silver);text-align:center;background:var(--smoke);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">';
    respHtml += '<span>Drag, drop or tap</span><div style="display:flex;gap:5px;"><button onclick="genDeficRespCamera('+i+','+ci+')" style="padding:5px 10px;border:none;border-radius:5px;background:#5C7A65;color:white;font-size:calc(12.5px + var(--ts));cursor:pointer;">📷 Camera</button><button onclick="_galleryReuseGenDeficResp('+i+','+ci+')" style="padding:5px 10px;border:none;border-radius:5px;background:#8A7689;color:white;font-size:calc(12.5px + var(--ts));cursor:pointer;">🖼 Gallery</button></div></div></div></div></div>';
  });
  respHtml += '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">';
  respHtml += '<button onclick="generalDeficiencies['+i+'].responses.push({party:\'contractor\',comment:\'\',date:\'\',status:\'open\',photos:[]});renderGeneralDeficGroup();" style="padding:6px 14px;border:1.5px dashed #E67E22;border-radius:5px;background:#fffbf0;color:#E67E22;font-size:12px;cursor:pointer;font-weight:600;">+ Add Contractor Response</button>';
  respHtml += '<button onclick="generalDeficiencies['+i+'].responses.push({party:\'consultant\',comment:\'\',date:\'\',status:\'open\',photos:[]});renderGeneralDeficGroup();" style="padding:6px 14px;border:1.5px dashed #1565C0;border-radius:5px;background:#f0f4ff;color:#1565C0;font-size:12px;cursor:pointer;font-weight:600;">+ Add Consultant Response</button></div>';

  return '<div style="border-top:1px solid var(--border);padding:14px 16px;"><div style="display:flex;gap:10px;align-items:flex-start;"><div style="min-width:28px;width:28px;height:28px;border-radius:50%;background:'+_deficPriColor(d.priority||'high')+';color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;" title="'+(d.priority||'high')+' priority">G'+(i+1)+'</div><div style="flex:1;min-width:0;">'+_deficPriRow(d.priority||'high','setGenDeficPriority('+i+',')+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><div><div style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Describe Deficiency</div><textarea placeholder="Describe deficiency..." style="width:100%;height:150px;border:1.5px solid var(--border);border-radius:6px;padding:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;" oninput="generalDeficiencies['+i+'].description=this.value">'+(d.description||'')+'</textarea></div><div><div style="font-size:11px;font-weight:600;color:var(--steel);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Evidence Photos</div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">'+thumbsHtml+'</div><div class="photo-zone ev-clickable" onclick="_boxUp(event,function(){genDeficUpload('+i+')})" ondragover="event.preventDefault();this.classList.add(\'drag-over\');" ondragleave="this.classList.remove(\'drag-over\');" ondrop="event.preventDefault();this.classList.remove(\'drag-over\');genDeficDrop(event,'+i+')" style="padding:14px 12px;min-height:110px;border:2px dashed var(--border);border-radius:8px;font-size:11px;color:var(--silver);text-align:center;background:var(--smoke);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;"><span>Drag, drop or tap here</span><div style="display:flex;gap:5px;"><button onclick="event.stopPropagation();genDeficCamera('+i+')" style="padding:5px 10px;border:none;border-radius:5px;background:#5C7A65;color:white;font-size:calc(12.5px + var(--ts));cursor:pointer;">📷 Camera</button><button onclick="event.stopPropagation();_galleryReuseGenDefic('+i+')" style="padding:5px 10px;border:none;border-radius:5px;background:#8A7689;color:white;font-size:calc(12.5px + var(--ts));cursor:pointer;">🖼 Gallery</button></div></div></div></div>'
    +'<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:flex-end;">'
    +'<div><label style="font-size:11px;color:#666;display:block;margin-bottom:2px;">Date</label><input type="date" value="'+(d.date||'')+'" oninput="generalDeficiencies['+i+'].date=this.value" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:5px;font-size:12px;"></div>'
    +'<div><label style="font-size:11px;color:#666;display:block;margin-bottom:2px;">Status</label><select style="padding:5px 8px;border:1.5px solid var(--border);border-radius:5px;font-size:12px;color:'+scCol+';font-weight:600;" onchange="generalDeficiencies['+i+'].status=this.value;updateDeficSummary();renderGeneralDeficGroup();"><option value="open" '+(sc==='open'?'selected':'')+'>● Outstanding</option><option value="in-progress" '+(sc==='in-progress'?'selected':'')+'>● In Progress</option><option value="resolved" '+(sc==='resolved'?'selected':'')+'>● Addressed & Closed</option></select></div>'

    +'<div><label style="font-size:11px;color:transparent;display:block;margin-bottom:2px;">.</label><button onclick="removeGeneralDeficItem('+i+')" style="padding:5px 8px;border:1.5px solid #ddd;border-radius:5px;background:white;color:#aaa;font-size:11px;cursor:pointer;">✕ Remove</button></div></div></div></div>'+respHtml+'</div>';
}

// General deficiency photo handlers
function genDeficDrop(e, idx) { e.preventDefault(); Array.from(e.dataTransfer.files).filter(function(f){return f.type.startsWith('image/');}).forEach(function(f){ _photoDateFromExif(f).then(function(_pd){var r=new FileReader(); r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){generalDeficiencies[idx].photos.push(ArcPhoto.mint(c,f.name,{date:_pd}));renderGeneralDeficGroup();});}; r.readAsDataURL(f);}); }); }
function genDeficUpload(idx) { var inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.multiple=true;inp.onchange=function(){Array.from(inp.files).forEach(function(f){_photoDateFromExif(f).then(function(_pd){var r=new FileReader();r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){generalDeficiencies[idx].photos.push(ArcPhoto.mint(c,f.name,{date:_pd}));renderGeneralDeficGroup();});}; r.readAsDataURL(f);});});};inp.click(); }
function _pfGenDefic(idx, f){ if(!f||!f.type||f.type.indexOf('image/')!==0) return; _photoDateFromExif(f).then(function(_pd){var r=new FileReader();r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){generalDeficiencies[idx].photos.push(ArcPhoto.mint(c,f.name,{date:_pd}));renderGeneralDeficGroup();});}; r.readAsDataURL(f);}); }
function genDeficCamera(idx) { if(typeof _camBurst==='function'){ _camBurst(function(f){ _pfGenDefic(idx, f); }); return; } genDeficCameraLegacy(idx); }
function genDeficCameraLegacy(idx) { var inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.setAttribute('capture','environment');inp.onchange=function(){var f=inp.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){generalDeficiencies[idx].photos.push(ArcPhoto.mint(c,f.name));renderGeneralDeficGroup();setTimeout(function(){inp.value='';inp.click();},300);});}; r.readAsDataURL(f);};inp.click(); }
function genDeficRespDrop(e,idx,ci) { e.preventDefault(); if(!generalDeficiencies[idx].responses[ci].photos)generalDeficiencies[idx].responses[ci].photos=[]; Array.from(e.dataTransfer.files).filter(function(f){return f.type.startsWith('image/');}).forEach(function(f){_photoDateFromExif(f).then(function(_pd){var r=new FileReader();r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){generalDeficiencies[idx].responses[ci].photos.push(ArcPhoto.mint(c,f.name,{date:_pd}));renderGeneralDeficGroup();});}; r.readAsDataURL(f);});}); }
function genDeficRespUpload(idx,ci) { var inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.multiple=true;inp.onchange=function(){if(!generalDeficiencies[idx].responses[ci].photos)generalDeficiencies[idx].responses[ci].photos=[];Array.from(inp.files).forEach(function(f){_photoDateFromExif(f).then(function(_pd){var r=new FileReader();r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){generalDeficiencies[idx].responses[ci].photos.push(ArcPhoto.mint(c,f.name,{date:_pd}));renderGeneralDeficGroup();});}; r.readAsDataURL(f);});});};inp.click(); }
function _pfGenDeficResp(idx, ci, f){ if(!generalDeficiencies[idx].responses[ci].photos)generalDeficiencies[idx].responses[ci].photos=[]; if(!f||!f.type||f.type.indexOf('image/')!==0) return; _photoDateFromExif(f).then(function(_pd){var r=new FileReader();r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){generalDeficiencies[idx].responses[ci].photos.push(ArcPhoto.mint(c,f.name,{date:_pd}));renderGeneralDeficGroup();});}; r.readAsDataURL(f);}); }
function genDeficRespCamera(idx,ci) { if(typeof _camBurst==='function'){ _camBurst(function(f){ _pfGenDeficResp(idx, ci, f); }); return; } genDeficRespCameraLegacy(idx,ci); }
function genDeficRespCameraLegacy(idx,ci) { var inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.setAttribute('capture','environment');inp.onchange=function(){if(!generalDeficiencies[idx].responses[ci].photos)generalDeficiencies[idx].responses[ci].photos=[];var f=inp.files[0];if(!f)return;_photoDateFromExif(f).then(function(_pd){var r=new FileReader();r.onload=function(ev){compressImage(ev.target.result,1600,0.85,function(c){generalDeficiencies[idx].responses[ci].photos.push(ArcPhoto.mint(c,f.name,{date:_pd}));renderGeneralDeficGroup();});}; r.readAsDataURL(f);});};inp.click(); }

// ═══ DEFICIENCY VIEW TOGGLE ═══
var _deficViewMode = 'contractor';

function setDeficView(mode) {
  _deficViewMode = mode;
  var ctrView = document.getElementById('defic-view-contractor');
  var allView = document.getElementById('defic-view-all');
  var btnCtr = document.getElementById('dv-btn-contractor');
  var btnAll = document.getElementById('dv-btn-all');
  if(ctrView) ctrView.style.display = (mode==='contractor') ? '' : 'none';
  if(allView) allView.style.display = (mode==='all') ? '' : 'none';
  if(btnCtr) btnCtr.classList.toggle('active', mode==='contractor');
  if(btnAll) btnAll.classList.toggle('active', mode==='all');
  if(mode==='all') { renderAllDeficSummary(); renderAllDeficTable(); }
}

function _getAllDeficFlat() {
  var all = [];
  var num = 1;
  contractors.forEach(function(n) {
    (deficiencies[n]||[]).forEach(function(d, i) {
      all.push({d:d, ctr:n, idx:i+1, globalNum:num++});
    });
  });
  generalDeficiencies.forEach(function(d, i) {
    all.push({d:d, ctr:'General', idx:i+1, globalNum:num++});
  });
  return all;
}

function renderAllDeficSummary() {
  var el = document.getElementById('defic-summary-all');
  if(!el) return;
  var all = _getAllDeficFlat();
  if(!all.length) { el.innerHTML = ''; return; }
  var groups = {};
  all.forEach(function(r) {
    if(!groups[r.ctr]) groups[r.ctr] = {t:0, o:0, c:0};
    groups[r.ctr].t++;
    if(!r.d.status || r.d.status==='open') groups[r.ctr].o++;
    if(r.d.status==='resolved') groups[r.ctr].c++;
  });
  var tt=0, to=0, tc=0;
  var rows = Object.keys(groups).map(function(k) {
    var g = groups[k]; tt+=g.t; to+=g.o; tc+=g.c;
    return '<tr><td style="font-weight:600;">'+k+'</td><td>'+g.t+'</td><td style="color:'+(g.o?'#A85959':'inherit')+';font-weight:'+(g.o?'700':'400')+'">'+g.o+'</td><td style="color:'+(g.c?'#5F8068':'inherit')+';font-weight:'+(g.c?'700':'400')+'">'+g.c+'</td></tr>';
  }).join('');
  el.innerHTML = '<table class="all-defic-tbl"><thead><tr><th>Contractor</th><th>Total</th><th>Outstanding</th><th>Closed</th></tr></thead><tbody>'+rows+'<tr style="font-weight:800;background:var(--smoke);"><td>TOTAL</td><td>'+tt+'</td><td style="color:#A85959;">'+to+'</td><td style="color:#5F8068;">'+tc+'</td></tr></tbody></table>';
}

function renderAllDeficTable() {
  var wrap = document.getElementById('all-defic-table-wrap');
  if(!wrap) return;
  var all = _getAllDeficFlat();
  var searchEl = document.getElementById('all-defic-search');
  var q = searchEl ? searchEl.value.toLowerCase().trim() : '';
  if(q) {
    all = all.filter(function(r) {
      return (r.d.description||'').toLowerCase().indexOf(q)>=0 ||
             r.ctr.toLowerCase().indexOf(q)>=0 ||
             ('#'+r.globalNum).indexOf(q)>=0;
    });
  }
  if(!all.length) {
    wrap.innerHTML = '<p style="color:var(--silver);font-size:13px;text-align:center;padding:20px;">'+
      (q ? 'No deficiencies match "'+q+'"' : 'No deficiencies recorded yet. Switch to "By Contractor" to add deficiencies.') +'</p>';
    return;
  }
  var html = '<table class="all-defic-tbl"><thead><tr><th style="width:30px;">#</th><th>Contractor</th><th>Description</th><th>Date</th><th>Status</th><th>Response</th><th>Photos</th></tr></thead><tbody>';
  all.forEach(function(r) {
    var d = r.d;
    var scLbl = (d.status==='resolved')?'Closed':(d.status==='in-progress')?'In Progress':'Outstanding';
    var scCls = (d.status==='resolved')?'closed':'outstanding';
    var resps = d.responses||[];
    var hasCtr = resps.some(function(x){return x.party==='contractor';});
    var hasCon = resps.some(function(x){return x.party==='consultant';});
    var respBadge = '';
    if(hasCtr&&hasCon) respBadge = '<span class="defic-badge resp-both">Both</span>';
    else if(hasCtr) respBadge = '<span class="defic-badge resp-ctr">Contractor</span>';
    else if(hasCon) respBadge = '<span class="defic-badge resp-con">Consultant</span>';
    else respBadge = '<span style="color:var(--silver);">—</span>';
    var photoCount = (d.photos||[]).filter(function(p){return !_isPhotoDeleted(p);}).length;
    resps.forEach(function(x){ photoCount += (x.photos||[]).filter(function(p){return !_isPhotoDeleted(p);}).length; });
    var desc = ((d.description||'').substring(0,80)) || '<em style="color:var(--silver);">No description</em>';
    html += '<tr onclick="jumpToDeficiency(\''+r.ctr+'\','+r.idx+')">';
    html += '<td style="font-weight:800;color:#9C2742;">'+r.globalNum+'</td>';
    html += '<td style="font-weight:600;">'+r.ctr+'</td>';
    html += '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+desc+'</td>';
    html += '<td style="white-space:nowrap;">'+(d.date||'—')+'</td>';
    html += '<td><span class="defic-badge '+scCls+'">'+scLbl+'</span></td>';
    html += '<td>'+respBadge+'</td>';
    html += '<td>'+(photoCount?'📷 '+photoCount:'<span style="color:var(--silver);">—</span>')+'</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<p style="font-size:11px;color:var(--silver);margin-top:8px;">Click a row to jump to the deficiency in contractor view.</p>';
  wrap.innerHTML = html;
}

function jumpToDeficiency(ctrName, idx) {
  setDeficView('contractor');
  setTimeout(function(){
    var groupEl = document.getElementById('defic-group-' + ctrName);
    if(groupEl) groupEl.scrollIntoView({behavior:'smooth', block:'start'});
  }, 100);
}

function exportAllDeficCSV() {
  var all = _getAllDeficFlat();
  if(!all.length) { if(typeof showToast==='function') showToast('No deficiencies to export'); return; }
  var rows = [['#','Contractor','Description','Date','Status','IAR','Responses','Photos'].join(',')];
  all.forEach(function(r) {
    var d = r.d;
    var scLbl = (d.status==='resolved')?'Closed':(d.status==='in-progress')?'In Progress':'Outstanding';
    var resps = d.responses||[];
    var hasCtr = resps.some(function(x){return x.party==='contractor';});
    var hasCon = resps.some(function(x){return x.party==='consultant';});
    var respLbl = (hasCtr&&hasCon)?'Both':hasCtr?'Contractor':hasCon?'Consultant':'None';
    var photoCount = (d.photos||[]).filter(function(p){return !_isPhotoDeleted(p);}).length;
    resps.forEach(function(x){ photoCount += (x.photos||[]).filter(function(p){return !_isPhotoDeleted(p);}).length; });
    var desc = '"' + (d.description||'').replace(/"/g,'""') + '"';
    rows.push([r.globalNum, '"'+r.ctr+'"', desc, d.date||'', scLbl, d.iarStatus?'YES':'No', respLbl, photoCount].join(','));
  });
  var blob = new Blob([rows.join('\n')], {type:'text/csv'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'deficiencies_export.csv'; a.click();
  if(typeof showToast==='function') showToast('Exported '+all.length+' deficiencies to CSV');
}

// ── photo removers ──

function removeDeficRespPhoto(safe, i, ci, ri, dispName){
  var d=deficiencies[safe] && deficiencies[safe][i]; var r=d && d.responses && d.responses[ci];
  var p=r && r.photos ? r.photos[ri] : null; if(!p) return;
  if(p.id){ deletePhotoEverywhere({photoId:p.id}); }
  else { _aConfirm('Delete this photo? This cannot be undone.', function(){ r.photos.splice(ri,1); renderDeficGroup(dispName||safe); if(typeof _renderPhotoGallery==='function')_renderPhotoGallery(); if(typeof saveState==='function')saveState(); },'Delete'); }
}
function removeGenDeficPhoto(i, j){
  var d=generalDeficiencies[i]; var p=d && d.photos ? d.photos[j] : null; if(!p) return;
  if(p.id){ deletePhotoEverywhere({photoId:p.id}); }
  else { _aConfirm('Delete this photo? This cannot be undone.', function(){ d.photos.splice(j,1); renderGeneralDeficGroup(); if(typeof _renderPhotoGallery==='function')_renderPhotoGallery(); if(typeof saveState==='function')saveState(); },'Delete'); }
}
function removeGenDeficRespPhoto(i, ci, ri){
  var d=generalDeficiencies[i]; var r=d && d.responses ? d.responses[ci] : null;
  var p=r && r.photos ? r.photos[ri] : null; if(!p) return;
  if(p.id){ deletePhotoEverywhere({photoId:p.id}); }
  else { _aConfirm('Delete this photo? This cannot be undone.', function(){ r.photos.splice(ri,1); renderGeneralDeficGroup(); if(typeof _renderPhotoGallery==='function')_renderPhotoGallery(); if(typeof saveState==='function')saveState(); },'Delete'); }
}
