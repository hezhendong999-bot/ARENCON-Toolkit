// ════════════════════════════════════════════════════════════════════════════
// lib/ui/flowPhotoModal.js — v1.0.0 (S500)
// Per-flow-point gauge/RPM photo modal, extracted VERBATIM from the Diesel
// monolith (S499 HEAD 89d7738, lines 5138-5228 + 5377-5556). Classic script;
// every function/var below is intentionally global — the host tool and inline
// onclick= handlers call them by name, exactly as before the move.
//
// HOST-OWNED (referenced, never defined here): stdData, pldData, ArcPhoto.mint,
// _phSrc, _photoSrc, _isPhotoDeleted, deletePhotoEverywhere, openLightbox,
// _camBurst, _aConfirm, _boxUp, showToast, renderStdTable, renderPldTable,
// _renderPhotoGallery, debounceAutosave, _collectAllPhotos,
// _openPhotoReusePicker (shared reuse picker stays in the host).
//
// DO NOT add imports/exports — converting to an ES module breaks every inline
// onclick that reaches these by global name.
// ════════════════════════════════════════════════════════════════════════════
// Per-flow-point photo icon (opens bucket popover — Step 2 wires the popover)
function _flowPhotoIcon(tbl, i){
  var arr = (tbl==='std'?stdData:pldData)[i];
  var n = (arr && arr.photos) ? arr.photos.filter(function(p){return !_isPhotoDeleted(p);}).length : 0;
  return '<button class="ph-icon '+(n?'has':'')+'" onclick="openFlowPhotos(\''+tbl+'\','+i+')" title="'+(n?n+' photo(s)':'Add gauge photos')+'">'
    + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
    + (n?'<span class="cnt">'+n+'</span>':'')
    + '</button>';
}
// Per-flow-point gauge photo capture (S222-Diesel) — mirrors _recAddFile pattern.
var _flowPhotoTbl=null, _flowPhotoIdx=null, _flowPhotoActiveReading='suction', _fpmScrollY=0;
// S345: 7-pt gauge photos are taken TWO ways at each flow point — With PLD and
// Without PLD (run direct). The mode is a SEPARATE field on each photo so the two
// never mix. 3-pt (std table) has no PLD dimension → mode stays null. Default 'pld'.
var _flowPhotoActiveMode='pld';
function _flowPhotoSetActiveMode(m){ _flowPhotoActiveMode=(m==='direct')?'direct':'pld'; if(_flowPhotoActiveMode==='pld' && _GAUGE_DIRECT_ONLY[_flowPhotoActiveReading]) _flowPhotoActiveReading='suction'; /* S347: PRV/PRdV vanish under With-PLD — fall back to a visible reading */ _renderFlowPhotoModal(); }
var _GAUGE_READINGS=[
  {k:'suction',  label:'Suction',  short:'S'},
  {k:'discharge',label:'Discharge',short:'D'},
  {k:'bf_in',    label:'BF-in',    short:'BFi'},
  {k:'bf_out',   label:'BF-out',   short:'BFo'},
  {k:'rpm',      label:'RPM',      short:'RPM'},
  {k:'prv',      label:'PRV',      short:'PRV'},
  {k:'prdv',     label:'PRdV',     short:'PRdV'}
];
// S346/S347: PRV (pressure-RELIEF valve, set at churn so discharge reads ~175)
// and PRdV (pressure-REDUCING valve) gauge photos. Available on every 3-pt flow
// point, and on 7-pt ONLY in the Without-PLD (direct-run) condition — you set the
// relief valve with PLD disconnected, never while PLD is actively limiting
// pressure. Typically captured at 0% (max pressure) only, but not enforced.
var _GAUGE_TAG_SHORT={suction:'S',discharge:'D',bf_in:'BFi',bf_out:'BFo',rpm:'RPM',prv:'PRV',prdv:'PRdV'};
var _GAUGE_TAG_LABEL={suction:'Suction',discharge:'Discharge',bf_in:'BF-in',bf_out:'BF-out',rpm:'RPM',prv:'PRV',prdv:'PRdV'};
// S347: readings that exist ONLY in the without-PLD (direct) condition. On the
// 7-pt table their pills hide under With-PLD, their photos are tagged mode:'direct',
// and they only render under the Without-PLD toggle.
var _GAUGE_DIRECT_ONLY={prv:true,prdv:true};
// S347: a direct-only reading is hidden when the 7-pt table is in With-PLD mode.
function _gaugeReadingVisible(k){ return !(_GAUGE_DIRECT_ONLY[k] && _flowPhotoTbl==='pld' && _flowPhotoActiveMode==='pld'); }
function _gaugeReadingColor(k){ return k==='rpm' ? 'var(--gr-rpm)' : (k==='suction'?'var(--info)':k==='discharge'?'var(--no)':k==='bf_in'?'var(--warn)':k==='bf_out'?'var(--yes)':k==='prv'?'var(--gr-prv)':k==='prdv'?'var(--gr-prdv)':'var(--silver)'); }
function _flowPhotoRow(tbl,i){ var src=(tbl==='std'?stdData:pldData); return (src&&src[i])?src[i]:null; }
function _flowPhotoAddFile(file){
  if(!file || !file.type || file.type.indexOf('image/')!==0) return;
  var row=_flowPhotoRow(_flowPhotoTbl,_flowPhotoIdx); if(!row) return;
  if(!row.photos) row.photos=[];
  var r=new FileReader();
  r.onload=function(ev){
    compressImage(ev.target.result, 1600, 0.85, function(c){
      var _ph=ArcPhoto.mint(c, file.name, {extra:{
               tag:_flowPhotoActiveReading||'suction',
               mode:(_flowPhotoTbl==='pld'?(_GAUGE_DIRECT_ONLY[_flowPhotoActiveReading]?'direct':_flowPhotoActiveMode):null),
               caption:''}});
      row.photos.push(_ph);
      if(typeof renderStdTable==='function') renderStdTable();
      if(typeof renderPldTable==='function') renderPldTable();
      _renderFlowPhotoModal();
      if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
      if(typeof debounceAutosave==='function') debounceAutosave();
    });
  };
  r.readAsDataURL(file);
}
function _flowPhotoUpload(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true; inp.onchange=function(){ Array.from(inp.files).forEach(_flowPhotoAddFile); }; inp.click(); }
function _flowPhotoCamera(){ if(typeof _camBurst==='function'){ _camBurst(function(f){ _flowPhotoAddFile(f); }); return; } _flowPhotoCameraLegacy(); }
function _flowPhotoCameraLegacy(){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.setAttribute('capture','environment'); inp.onchange=function(){ var f=inp.files[0]; if(f) _flowPhotoAddFile(f); }; inp.click(); }
function _flowPhotoDrop(e){ e.preventDefault(); var z=e.currentTarget; if(z)z.classList.remove('drag-over'); Array.from(e.dataTransfer.files).forEach(_flowPhotoAddFile); }
// ── Gallery picker: attach a COPY of an existing report photo, tagged with the active reading ──
function _flowPhotoAddFromSource(srcPhoto){
  var row=_flowPhotoRow(_flowPhotoTbl,_flowPhotoIdx); if(!row||!srcPhoto) return;
  if(!row.photos) row.photos=[];
  function _commit(dataUrl){
    var _ph=ArcPhoto.mint(dataUrl, (srcPhoto.n||'gallery.jpg'), {extra:{
             tag:_flowPhotoActiveReading||'suction',
             mode:(_flowPhotoTbl==='pld'?(_GAUGE_DIRECT_ONLY[_flowPhotoActiveReading]?'direct':_flowPhotoActiveMode):null),
             caption:''}});               // own key — never borrow source R2 URL
    row.photos.push(_ph);
    if(typeof renderStdTable==='function') renderStdTable();
    if(typeof renderPldTable==='function') renderPldTable();
    _flowPhotoCloseGallery();
    _renderFlowPhotoModal();
    if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
    if(typeof debounceAutosave==='function') debounceAutosave();
  }
  if(srcPhoto.d){ _commit(srcPhoto.d); return; }
  if(srcPhoto.r2Url){
    // fetch the binary from R2 (GET is unauthenticated) → dataUrl → own copy
    fetch(srcPhoto.r2Url).then(function(r){return r.blob();}).then(function(b){
      var fr=new FileReader(); fr.onload=function(){ _commit(fr.result); }; fr.readAsDataURL(b);
    }).catch(function(){ if(typeof showToast==='function') showToast('Could not load that photo'); });
    return;
  }
}

// ── (shared photo-reuse picker lives in the host between these two halves) ──

function _flowPhotoOpenGallery(){
  _flowPhotoCloseGallery();
  var card=document.querySelector('#flow-photo-modal .fpm-card'); if(!card) return;
  var all=(typeof _collectAllPhotos==='function')?_collectAllPhotos():[];
  // de-dupe by photo id; skip photos already on THIS row
  var row=_flowPhotoRow(_flowPhotoTbl,_flowPhotoIdx);
  var here={}; (row&&row.photos||[]).forEach(function(p){ if(p.id) here[p.id]=1; });
  var seen={}, items=[];
  all.forEach(function(it){
    var p=it.photo; if(!p) return; var key=p.id||it.src; if(!key||seen[key]) return; seen[key]=1;
    if(p.id && here[p.id]) return;
    if(!(p.d||p.r2Url)) return;
    items.push(it);
  });
  var ov=document.createElement('div'); ov.id='fpm-gallery'; ov.className='fpm-gallery';
  var h='<div class="fpm-gal-head"><span>Choose a photo from this report</span><button class="fpm-x" onclick="_flowPhotoCloseGallery()" title="Close">✕</button></div>';
  if(!items.length){ h+='<div class="fpm-empty">No other photos in this report yet.</div>'; }
  else {
    h+='<div class="fpm-gal-grid">';
    items.forEach(function(it,k){
      h+='<div class="fpm-gal-cell" onclick="_flowPhotoPickIdx('+k+')"><img src="'+_phSrc(it.photo)+'"><span class="fpm-gal-badge">'+(it.badge||'')+'</span></div>';
    });
    h+='</div>';
  }
  ov.innerHTML=h;
  card.appendChild(ov);
  // stash the resolved list for click handler
  _flowPhotoGalleryItems=items;
}
var _flowPhotoGalleryItems=[];
function _flowPhotoPickIdx(k){ var it=_flowPhotoGalleryItems[k]; if(it&&it.photo) _flowPhotoAddFromSource(it.photo); }
function _flowPhotoDelete(j){ var row=_flowPhotoRow(_flowPhotoTbl,_flowPhotoIdx); if(!row||!row.photos||!row.photos[j])return; var p=row.photos[j]; if(p.id){ deletePhotoEverywhere({photoId:p.id}, function(){ _renderFlowPhotoModal(); }); return; } _aConfirm('Delete this photo? This cannot be undone.', function(){ row.photos.splice(j,1); if(typeof renderStdTable==='function') renderStdTable(); if(typeof renderPldTable==='function') renderPldTable(); _renderFlowPhotoModal(); if(typeof _renderPhotoGallery==='function') _renderPhotoGallery(); if(typeof debounceAutosave==='function') debounceAutosave(); },'Delete'); }
function _flowPhotoLightbox(j){ var row=_flowPhotoRow(_flowPhotoTbl,_flowPhotoIdx); if(!row||!row.photos)return; openLightbox(row.photos, j, {renderer:_renderFlowPhotoModal}); }
function _flowPhotoSetActiveReading(r){ _flowPhotoActiveReading=r; _renderFlowPhotoModal(); }
function _flowPhotoSetReading(j, reading){
  var row=_flowPhotoRow(_flowPhotoTbl,_flowPhotoIdx); if(!row||!row.photos||!row.photos[j])return;
  row.photos[j].tag=reading;
  _flowPhotoCloseReassign();
  _renderFlowPhotoModal();
  if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
  if(typeof debounceAutosave==='function') debounceAutosave();
}
function _flowPhotoCloseReassign(){ var ex=document.getElementById('fpm-reassign'); if(ex) ex.remove(); }
// S342f: _flowPhotoCloseGallery was CALLED in 5 places (incl. closeFlowPhotos) but
// never DEFINED → every close threw "ReferenceError: _flowPhotoCloseGallery is not
// defined" on its first line and aborted, so the modal X / backdrop / Esc all
// silently failed. Define it to remove the gallery-picker overlay, mirroring
// _flowPhotoCloseReassign. THIS is the real fix; the prior tap-probe was a symptom chase.
function _flowPhotoCloseGallery(){ var ex=document.getElementById('fpm-gallery'); if(ex) ex.remove(); }
function _flowPhotoOpenReassign(j, btn){
  _flowPhotoCloseReassign();
  var card=btn.closest('.fpm-card'); if(!card) return;
  var pop=document.createElement('div'); pop.id='fpm-reassign'; pop.className='fpm-reassign';
  var h='';
  _GAUGE_READINGS.forEach(function(rd){
    if(!_gaugeReadingVisible(rd.k)) return;
    h+='<button onclick="_flowPhotoSetReading('+j+',\''+rd.k+'\')"><span class="rd-dot" style="background:'+_gaugeReadingColor(rd.k)+'"></span>'+rd.label+'</button>';
  });
  pop.innerHTML=h;
  card.appendChild(pop);
  // position relative to the card using the button's offset within the card
  var cr=card.getBoundingClientRect(), br=btn.getBoundingClientRect();
  pop.style.top=(br.bottom - cr.top + card.scrollTop + 4)+'px';
  pop.style.left=(Math.max(6, br.left - cr.left - 30))+'px';
  setTimeout(function(){ document.addEventListener('click', _flowPhotoReassignOutside, true); document.addEventListener('touchstart', _flowPhotoReassignOutside, true); },0);
}
function _flowPhotoReassignOutside(e){ var p=document.getElementById('fpm-reassign'); if(p && !p.contains(e.target)){ _flowPhotoCloseReassign(); document.removeEventListener('click', _flowPhotoReassignOutside, true); document.removeEventListener('touchstart', _flowPhotoReassignOutside, true); } }
function _renderFlowPhotoModal(){
  var host=document.getElementById('flow-photo-modal'); if(!host) return;
  var row=_flowPhotoRow(_flowPhotoTbl,_flowPhotoIdx);
  if(!row){ host.style.display='none'; return; }
  var pts=row.photos||[];
  var ttl='Gauge &amp; RPM Photos'+(row.pct?(' — '+row.pct):'')+(row.flow?(' · '+row.flow+' gpm'):'');
  var h='<div class="fpm-backdrop" onclick="closeFlowPhotos()"></div>';
  h+='<div class="fpm-card" role="dialog" aria-label="Gauge and RPM photos">';
  h+='<div class="fpm-head"><span>'+ttl+'</span><button type="button" class="fpm-x" onclick="event.stopPropagation();closeFlowPhotos()" title="Close">✕</button></div>';
  // S345: PLD mode toggle — only for the 7-pt (pld) table. A 3-pt test has no
  // PLD dimension, so the toggle is hidden and photos are captured unmoded.
  if(_flowPhotoTbl==='pld'){
    h+='<div class="fpm-modetoggle">'
      +'<button class="fpm-mode'+(_flowPhotoActiveMode==='pld'?' on':'')+'" onclick="_flowPhotoSetActiveMode(\'pld\')">With PLD</button>'
      +'<button class="fpm-mode direct'+(_flowPhotoActiveMode==='direct'?' on':'')+'" onclick="_flowPhotoSetActiveMode(\'direct\')">Without PLD</button>'
      +'</div>';
    h+='<div class="fpm-modehint">'+(_flowPhotoActiveMode==='pld'
        ? 'Tagging <b>With PLD</b> — readings with the pressure-limiting driver enabled.'
        : 'Tagging <b>Without PLD</b> — PLD disconnected, pump run direct.')+'</div>';
  }
  // reading selector
  h+='<div class="fpm-rdrow">';
  _GAUGE_READINGS.forEach(function(rd){
    if(!_gaugeReadingVisible(rd.k)) return;
    var on=(_flowPhotoActiveReading===rd.k);
    var col=_gaugeReadingColor(rd.k);
    h+='<button class="fpm-rd'+(on?' active':'')+'" '+(on?'style="background:'+col+'"':'')+' onclick="_flowPhotoSetActiveReading(\''+rd.k+'\')">'
      +'<span class="rd-dot" style="background:'+(on?'#fff':col)+'"></span>'+rd.label+'</button>';
  });
  h+='</div>';
  // shared capture zone — caption row on top, button row below (Upload · Camera · Gallery)
  h+='<div class="photo-zone-compact fpm-zone ev-clickable" onclick="_boxUp(event,function(){_flowPhotoUpload()})" ondragover="event.preventDefault();this.classList.add(\'drag-over\');" ondragleave="this.classList.remove(\'drag-over\');" ondrop="_flowPhotoDrop(event)">';
  h+='<span>Drag, drop or tap — tagged <b>'+(_GAUGE_TAG_LABEL[_flowPhotoActiveReading]||'Suction')+'</b></span>';
  h+='<div class="pz-row">';
  h+='<button class="pz-camera" onclick="event.stopPropagation();_flowPhotoCamera()">📷 Camera</button>';
  h+='<button class="pz-gallery" onclick="event.stopPropagation();_flowPhotoOpenGallery()">🖼 Gallery</button>';
  h+='</div>';
  h+='</div>';
  // grouped thumbs (by reading, in canonical order; legacy untagged → Unsorted)
  var ptsLive = pts.filter(function(p){return !_isPhotoDeleted(p);});
  if(ptsLive.length){
    _GAUGE_READINGS.forEach(function(rd){
      if(!_gaugeReadingVisible(rd.k)) return;
      var col=_gaugeReadingColor(rd.k);
      h+='<div class="fpm-grp"><div class="fpm-grp-hd" style="border-left-color:'+col+'"><span class="gh-dot" style="background:'+col+'"></span>'+rd.label+'</div>';
      var any=false;
      h+='<div class="fpm-thumbs">';
      pts.forEach(function(p,j){
        if(p&&p.deleted) return;   // S337: soft-deleted photos never render
        if((p.tag||'suction')!==rd.k) return;
        // S345: on the 7-pt (pld) table, show ONLY the active mode's photos so
        // With-PLD and Without-PLD never mix. Legacy unmoded photos default to
        // 'pld' so they don't disappear. The std (3-pt) table has no mode filter.
        // S347: PRV/PRdV are tagged mode:'direct', so the normal filter already
        // shows them under Without-PLD and hides them under With-PLD.
        if(_flowPhotoTbl==='pld' && (p.mode||'pld')!==_flowPhotoActiveMode) return;
        any=true;
        h+='<div class="fpm-thumb"><img src="'+_phSrc(p)+'" onclick="_flowPhotoLightbox('+j+')">'
          +'<button class="fpm-del" onclick="_flowPhotoDelete('+j+')" title="Remove">✕</button>'
          +'<button class="fpm-move" onclick="event.stopPropagation();_flowPhotoOpenReassign('+j+',this)" title="Move to another reading">⇄</button></div>';
      });
      h+='</div>';
      if(!any){ h+='<div class="fpm-grp-empty">— no photos</div>'; }
      h+='</div>';
    });
    // Unsorted: any photo whose tag is not a known reading
    var unsorted=pts.map(function(p,j){return {p:p,j:j};}).filter(function(o){ return !_isPhotoDeleted(o.p) && !_GAUGE_TAG_SHORT[o.p.tag||'suction']; });
    if(unsorted.length){
      h+='<div class="fpm-grp"><div class="fpm-grp-hd"><span class="gh-dot" style="background:var(--silver)"></span>Unsorted</div><div class="fpm-thumbs">';
      unsorted.forEach(function(o){
        h+='<div class="fpm-thumb"><img src="'+_phSrc(o.p)+'" onclick="_flowPhotoLightbox('+o.j+')">'
          +'<button class="fpm-del" onclick="_flowPhotoDelete('+o.j+')" title="Remove">✕</button>'
          +'<button class="fpm-move" onclick="event.stopPropagation();_flowPhotoOpenReassign('+o.j+',this)" title="Assign a reading">⇄</button></div>';
      });
      h+='</div></div>';
    }
  } else {
    h+='<div class="fpm-empty">No gauge photos yet for this flow point.</div>';
  }
  h+='</div>';
  host.innerHTML=h;
  host.style.display='block';
  document.body.classList.add('fpm-open');
  // S342d: the inline onclick on the X was failing to close the modal after deleting
  // a photo from it. Bind close directly to the X and backdrop here as a guaranteed
  // handler that can't be defeated by a stale inline attribute or lingering listener.
  var _fx=host.querySelector('.fpm-x');
  if(_fx) _fx.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); closeFlowPhotos(); });
  var _fb=host.querySelector('.fpm-backdrop');
  if(_fb) _fb.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); closeFlowPhotos(); });
}
function openFlowPhotos(tbl, i){
  _flowPhotoTbl=tbl; _flowPhotoIdx=i;
  var host=document.getElementById('flow-photo-modal');
  if(!host){ host=document.createElement('div'); host.id='flow-photo-modal'; document.body.appendChild(host); }
  if(!document.body.classList.contains('fpm-open')){
    _fpmScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = (-_fpmScrollY) + 'px';
  }
  _renderFlowPhotoModal();
  document.addEventListener('keydown', _flowPhotoEsc);
}
function _flowPhotoEsc(e){ if(e.key==='Escape'){ closeFlowPhotos(); } }
function closeFlowPhotos(){
  _flowPhotoCloseReassign();
  _flowPhotoCloseGallery();
  document.body.classList.remove('fpm-open');
  document.body.style.top = '';
  window.scrollTo(0, _fpmScrollY||0);
  var host=document.getElementById('flow-photo-modal'); if(host){ host.style.display='none'; host.innerHTML=''; }
  document.removeEventListener('keydown', _flowPhotoEsc);
  _flowPhotoTbl=null; _flowPhotoIdx=null;
}
