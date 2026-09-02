
// ═══════════════════════════════════════════════════════
// PHOTO GALLERY, CAPTIONS, LIGHTBOX ZOOM, BULK OPS, REASSIGN
// ═══════════════════════════════════════════════════════

// ── Photo Gallery: collect all photos from all sections ──
var _pgSelected = new Set();
// S280: map a clState key (e.g. "s2_0") to the human item number (e.g. "2.1")
// for the gallery badge. Falls back to the raw key if it can't resolve.
function _clItemNum(id){ return _CLENG.itemNum(id); }
function _collectAllPhotos(opts){
  /* S683 — THE WALK IS DIESEL'S; WHO IS ALLOWED IN IS NOT.
     Every source below knows its own corner of a report and what to call what
     it finds — the badges, the labels, the section keys are this tool's
     personality and Electric's will differ. What is NOT ours is the rule
     deciding whether a photograph appears at all. That moved to
     lib/data/photoInventory.js, and it reaches this walk through `emit`:
     a source cannot forget to apply the filter because a source never sees it.

     The two ways that rule goes wrong are both on the record. Hard-code it
     live-only (S367) and the Recently Deleted list is permanently empty while
     Restore can never find a photograph — nothing errors, the photos are just
     invisible. Loosen the default and soft-deleted photos and internal backup
     duplicates leak into an issued client PDF. */
  var _src = function(p){ return _photoSrc(p); };
  return window.PhotoInventory.collect([
    // 1. Flow test photos (3-point) — S355: badge by category tag
    { name:'flowtest', each:function(emit){
      (flowTestPhotos||[]).forEach(function(p,i){
        var sh=(typeof _floweqShort==='function')?_floweqShort((typeof _floweqTag==='function')?_floweqTag(p):'flow_chart'):'Flow';
        emit(p,{type:'flowtest', cat:'flow', badge:'3\u00b7'+sh, label:_floweqLabel?_floweqLabel(_floweqTag(p)):'Flow Test (3-pt)', section:'flowtest', idx:i});
      });
    }},
    // 2. Flow test photos (PLD) — S355: badge by category tag
    { name:'flowtest-pld', each:function(emit){
      (flowTestPhotosPld||[]).forEach(function(p,i){
        var sh=(typeof _floweqShort==='function')?_floweqShort((typeof _floweqTag==='function')?_floweqTag(p):'flow_chart'):'Flow';
        emit(p,{type:'flowtest-pld', cat:'flow', badge:'7\u00b7'+sh, label:_floweqLabel?_floweqLabel(_floweqTag(p)):'Flow Test (PLD)', section:'flowtestpld', idx:i});
      });
    }},
    // 3. Checklist item photos
    { name:'checklist', each:function(emit){
      Object.keys(clState||{}).forEach(function(id){
        var st = clState[id];
        if(!st || !st.photos) return;
        st.photos.forEach(function(p,pi){
          emit(p,{type:'checklist', cat:'checklist', badge:_clItemNum(id), label:'Checklist '+_clItemNum(id), section:'cl_'+id, idx:pi});
        });
      });
    }},
    // 4. Deficiency photos (per contractor), and their response photos
    { name:'deficiency', each:function(emit){
      Object.keys(deficiencies||{}).forEach(function(ctr){
        (deficiencies[ctr]||[]).forEach(function(d,di){
          (d.photos||[]).forEach(function(p,pi){
            emit(p,{type:'deficiency', cat:'deficiency', badge:'D'+(di+1), label:ctr+' #'+(di+1), section:'def_'+ctr+'_'+di, idx:pi});
          });
          (d.responses||[]).forEach(function(r,ri){
            (r.photos||[]).forEach(function(p,pi){
              emit(p,{type:'response', cat:'deficiency', badge:'D'+(di+1)+'R', label:ctr+' #'+(di+1)+' Response', section:'resp_'+ctr+'_'+di+'_'+ri, idx:pi});
            });
          });
        });
      });
    }},
    // 5. General deficiency photos
    { name:'general-defic', each:function(emit){
      (generalDeficiencies||[]).forEach(function(d,di){
        (d.photos||[]).forEach(function(p,pi){
          emit(p,{type:'general-defic', cat:'general', badge:'G'+(di+1), label:'General #'+(di+1), section:'gdef_'+di, idx:pi});
        });
      });
    }},
    // 6. Site records (pump / placard / site)
    { name:'record', each:function(emit){
      (typeof recordPhotos==='undefined'?[]:recordPhotos).forEach(function(p,i){
        // S339: short, distinct badges — 3-pt photos are plain; 7-pt (PLD) photos
        // carry a "PLD" tag so the gallery tells the two pumps apart at a glance.
        var _k=p.kind||'site', kl, badge;
        if(_k==='pump'){ kl='General Pump Photos'; badge='3\u00b7Pump'; }
        else if(_k==='pump-pld'){ kl='General Pump Photos (PLD)'; badge='7\u00b7Pump'; }
        else if(_k==='placard'){ kl='Pump Placard & PLD Placard'; badge='3\u00b7Placard'; }
        else if(_k==='placard-pld'){ kl='Pump Placard & PLD Placard'; badge='7\u00b7Placard'; }
        else { kl='Site'; badge='Site'; }
        emit(p,{type:'record', cat:'records', badge:badge, label:'Record: '+kl, section:'rec_'+_k, idx:i});
      });
    }},
    // 7. Per-flow-point gauge photos (3-Point + 7-Point rows)
    { name:'gauge-std', each:function(emit){
      (typeof stdData==='undefined'?[]:stdData).forEach(function(row,ri){
        (row && row.photos ? row.photos : []).forEach(function(p,pi){
          emit(p,{type:'gauge', cat:'flow', badge:('3\u00b7'+(row.pct||(ri+''))+(p.tag&&_GAUGE_TAG_SHORT[p.tag]?('\u00b7'+_GAUGE_TAG_SHORT[p.tag]):'')), label:'Gauge (3-pt) '+(row.pct||'')+(p.tag&&_GAUGE_TAG_LABEL[p.tag]?(' \u00b7 '+_GAUGE_TAG_LABEL[p.tag]):''), section:'gauge_std_'+ri, idx:pi});
        });
      });
    }},
    { name:'gauge-pld', each:function(emit){
      (typeof pldData==='undefined'?[]:pldData).forEach(function(row,ri){
        (row && row.photos ? row.photos : []).forEach(function(p,pi){
          emit(p,{type:'gauge-pld', cat:'flow', badge:('7\u00b7'+(row.pct||(ri+''))+(p.tag&&_GAUGE_TAG_SHORT[p.tag]?('\u00b7'+_GAUGE_TAG_SHORT[p.tag]):'')+(p.mode==='pld'?'\u00b7PLD':'')), label:'Gauge (PLD) '+(row.pct||'')+(p.tag&&_GAUGE_TAG_LABEL[p.tag]?(' \u00b7 '+_GAUGE_TAG_LABEL[p.tag]):'')+(p.mode==='direct'?' \u00b7 without PLD':p.mode==='pld'?' \u00b7 with PLD':''), section:'gauge_pld_'+ri, idx:pi});
        });
      });
    }}
  ], {
    includeDeleted: !!(opts && opts.includeDeleted),
    includeBackups: !!(opts && opts.includeBackups),
    src: _src
  });
}

// ── Gallery state ──
var _pgFilter = 'all';
var _pgFilterOpen = false;
var _PG_CATS = [['all','All photos'],['checklist','Checklist'],['deficiency','Deficiencies'],['general','General'],['flow','Flow test'],['records','Site records']];

function _pgCloudIcon(p){
  if(!_csHubMode) return '';
  var st = p.r2Status || (p.r2Url?'uploaded':'');
  var color, title, glyph='';
  if(st==='uploaded'){ color='#5F8068'; title='Synced to cloud'; glyph='<path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; }
  else if(st==='failed'){ color='#A85959'; title='Upload failed — will retry'; }
  else if(st==='pending'){ color='#B07F5A'; title='Awaiting cloud upload'; glyph='<circle cx="12" cy="12" r="1.6" fill="#fff"/>'; }
  else { color='#94A3B8'; title='Local only'; }
  return '<span class="ph-cloud" title="'+title+'">'
    + '<svg width="18" height="14" viewBox="0 0 24 18" fill="'+color+'">'
    + '<path d="M19 16H6a4.5 4.5 0 010-9 5.5 5.5 0 0110.5-1A4.5 4.5 0 0119 16z"/>'+glyph
    + '</svg></span>';
}
// S264: debounced repaint of the gallery when photo sync-status changes (e.g. an
// outbox upload verifies). No-op unless the Photos panel is actually visible, so
// background upload churn never triggers needless re-renders elsewhere.
var _pgRepaintTimer = null;
function _pgRepaintCloudSoon(){
  if(_pgRepaintTimer) return;
  _pgRepaintTimer = setTimeout(function(){
    _pgRepaintTimer = null;
    var pg = document.getElementById('panel-photos');
    if(pg && pg.classList.contains('active') && typeof _renderPhotoGallery==='function'){
      _renderPhotoGallery();
    }
  }, 600);
}

function _pgDayKey(p){ return window.PhotoDate.dayKey(p); }

// S280: per-photo time-of-day (HH:MM) for the gallery card, from the same
// source _pgDayKey uses (addedDate/date, else the ms embedded in the id).
function _pgPhotoTime(p){ return window.PhotoDate.photoTime(p); }

function _pgSetFilter(mode){
  // S336: 'general' tile removed — map any stale/unknown filter to 'all'.
  var valid = {all:1,checklist:1,deficiency:1,flow:1,records:1};
  _pgFilter = valid[mode] ? mode : 'all';
  _pgFilterOpen=false; _renderPhotoGallery();
}
function _pgToggleFilterMenu(){ _pgFilterOpen=false; _renderPhotoGallery(); } /* S336: dropdown retired; tiles are the filter */

// ═══════════════════════════════════════════════════════════════════════════
// S337 — RECENTLY DELETED (soft-delete + restore). FRT photos.js port, adapted
// to Diesel's flat-array model (no pin/pool system, so no orphan-rehoming —
// restore is always in-place). Delete sets deleted:true + deletedDate and LEAVES
// the array slot + R2 object intact. The live gallery hides deleted photos; a
// "Recently Deleted" sub-tab surfaces them with a 90-day countdown, Restore, and
// an admin-gated "Delete forever". An auto-purge runs once per project on load.
// Merge-layer propagation (delete-wins) lives in _propagateDeletedFlag — without
// it a stale cloud snapshot would resurrect a cross-device delete.
// ═══════════════════════════════════════════════════════════════════════════
var _photoTab = 'all';            // 'all' = live gallery | 'trash' = Recently Deleted
var _TRASH_RETENTION_DAYS = 90;   // S371: raised 60→90 to match all-tools 90-day backup plan
var _pgPurgedForProject = null;   // run-once auto-purge guard (per project id)

// Live (non-deleted) photos for the gallery/filters. _collectAllPhotos stays the
// full walk (restore/purge/merge need to see deleted rows); everything user-facing
// filters through here.
// S353: a photo counts as DELETED only if it was deleted by an actual user action
// (deletedBy:'user'). A bare `deleted` flag with no marker is a phantom from a
// stale/glitched sync and is treated as LIVE everywhere — so the gallery, evidence
// tiles, Recently Deleted, counts, and the merge all agree. This is the single
// source of truth for deletion across the whole tool.
// ═══════════════════════════════════════════════════════════════════════════
// S354: CANONICAL PHOTO-DELETION MODEL (replaces all prior flag/marker patches)
// ───────────────────────────────────────────────────────────────────────────
// A photo's deletion state lives in ONE self-describing field:
//   delState: 'deleted'  + delAt: <ISO>  → soft-deleted by a person (restorable)
//   delState absent / 'live'             → live
// There is no bare-flag ambiguity. The merge arbitrates by newest delAt (a live
// photo has no delAt, so it can never lose to a phantom; a real delete has a real
// delAt and wins over a stale live copy). No intent gate, no freshness window, no
// scrubbing — last-writer-wins on an explicit timestamp, the standard correct way.
//
// The legacy `deleted`/`deletedDate`/`deletedBy` fields are kept MIRRORED so any
// reader not yet migrated still behaves; _normalizePhotoDel() converts old data to
// the canonical field on load (migration rule A: any old deleted:true → deleted).
function _isPhotoDeleted(p){ return window.PhotoLifecycle.isDeleted(p); }
// S341 (Bug 1 diag): ring buffer of recent soft-deletes, readable in-app via the
// diagnostics gesture — no desktop console needed (TWA can't open one). Each entry
// records the photo id, its creation→delete age, and the call stack that fired the
// delete. A delete within 10s of CREATION is the "phantom" signature (a fresh
// capture being deleted without a real user action) — it raises a loud, distinct
// toast so it's caught the moment it happens, with the firing caller captured.
window._dslDelDiag = window._dslDelDiag || [];
function _photoCreatedTs(ph){ return window.PhotoLifecycle.createdTs(ph); }
function _markPhotoDeleted(ph, opts){
  /* S681 — THE RULE IS SHARED; SAYING SO IS THIS TOOL'S JOB.
     The decision — is this photo already gone, is it too fresh for a delete
     nobody asked for, what gets written when it goes — now lives in
     lib/data/photoLifecycle.js, so Electric inherits it instead of receiving a
     copy that can drift. What stays here is the part that is Diesel's: the
     ring-buffer entry a field session can be asked to read back, and the
     toast that tells whoever is holding the tablet that a delete was refused.
     A refusal nobody can see is indistinguishable from a photo quietly
     disappearing, which is the whole reason the guard has a voice. */
  var res = window.PhotoLifecycle.markDeleted(ph, opts);
  if (res.reason === 'no-photo' || res.reason === 'already-deleted') return false;

  var _entry = null;
  try{
    var stack='';
    try{ stack=(new Error('del')).stack||''; }catch(_e){}
    var caller=stack.split('\n').slice(2,5).join(' \u00ab ').replace(/https?:\/\/[^ )]+\//g,'');
    _entry={ id:ph.id||'(no id)', name:ph.n||'', ageMs:res.ageMs, at:new Date().toISOString(), caller:caller, forced:res.forced };
    window._dslDelDiag.push(_entry);
    if(window._dslDelDiag.length>50) window._dslDelDiag.shift();
    console.warn('[del-diag]', _entry);
  }catch(_e){}

  if (res.blocked) {
    console.error('[del-diag] PHANTOM DELETE BLOCKED — fresh photo kept', _entry);
    if(_entry) _entry.blocked = true;
    if(typeof showToast==='function') showToast('\u26A0 Phantom delete blocked: kept '+(ph.n||ph.id||'photo')+' ('+(res.ageMs/1000).toFixed(1)+'s after capture). See Photo Delete Log.', 6000);
    return false;
  }
  return res.ok;
}
// S341 (Bug 1 diag): in-app viewer for the photo-delete ring buffer. Newest-first;
// phantom deletes (age < 10s) flagged red. Reachable from More ▸ Photo Delete Log
// so it works in the TWA with no console.
function dslDiag(){
  var buf=(window._dslDelDiag||[]).slice().reverse();
  var rows;
  if(!buf.length){
    rows='<div style="padding:10px;color:var(--silver);">No photo deletions recorded this session. Take/delete a photo and check again — or wait for a phantom toast.</div>';
  } else {
    rows=buf.map(function(e){
      var phantom=(e.ageMs>=0 && e.ageMs<10000);
      var age=e.ageMs<0?'unknown':(e.ageMs<60000?(e.ageMs/1000).toFixed(1)+'s':(e.ageMs/60000).toFixed(1)+'m');
      return '<div style="border-bottom:1px solid var(--border);padding:8px 4px;'+(phantom?'background:rgba(168,89,89,.14);':'')+'">'
        +'<div style="font-weight:700;font-size:12.5px;'+(phantom?'color:#C0445F;':'')+'">'+(phantom?'\u26A0 PHANTOM \u00b7 ':'')+_ddEsc(e.name||e.id)+'</div>'
        +'<div style="font-size:11px;color:var(--silver);">deleted '+age+' after capture \u00b7 '+(e.at||'').replace('T',' ').slice(0,19)+'</div>'
        +'<div style="font-size:10.5px;color:var(--silver);word-break:break-all;margin-top:2px;">'+_ddEsc(e.caller||'(no caller)')+'</div>'
        +'</div>';
    }).join('');
  }
  var html='<div style="max-width:520px;max-height:60vh;overflow:auto;text-align:left;">'
    +'<div style="font-weight:700;font-size:15px;margin-bottom:6px;">Photo Delete Log</div>'
    +'<div style="font-size:11.5px;color:var(--silver);margin-bottom:8px;">Last '+buf.length+' soft-delete(s) this session, newest first. A delete &lt;10s after capture is a PHANTOM. Show this to the developer.</div>'
    +rows+'</div>';
  if(typeof _aConfirmHtml==='function') _aConfirmHtml(html, null, 'Close');
  else if(typeof _aConfirm==='function') _aConfirm(html, function(){}, 'Close');
  else alert(JSON.stringify(buf,null,2));
}
function _ddEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function _markPhotoLive(ph){ return window.PhotoLifecycle.markLive(ph); }
// Migration A: normalize one photo's old flags into the canonical field, in place.
// Called for every photo on load. Idempotent.
function _normalizePhotoDel(p){ return window.PhotoLifecycle.normalize(p); }
// Walk every photo array in a state object and normalize. Safe to call repeatedly.
function _normalizeAllPhotoDel(s){ return window.PhotoLifecycle.normalizeAll(s); }
function _pgVisible(){
  // S372: include _isOrigBackup clean-original records so they render as their own
  // Site Record tiles alongside the marked photo (never-bake / FRT S363 parity).
  return _collectAllPhotos({includeBackups:true}).filter(function(a){ return !_isPhotoDeleted(a.photo); });
}
// Deleted photos for the trash view — same collected records, only the deleted ones,
// newest-deleted first.
function _pgGatherDeleted(){
  /* S684 — newest deletion first, so the photo somebody just removed by
     mistake is the one at the top when they come looking for it. */
  return window.PhotoRetention.trashOrder(
    _collectAllPhotos({includeDeleted:true}).filter(function(a){ return _isPhotoDeleted(a.photo); })
  );
}
// Whole days remaining before auto-purge (>=0). No date → full retention (defensive).
function _pgTrashDaysLeft(iso){ return window.PhotoLifecycle.trashDaysLeft(iso, _TRASH_RETENTION_DAYS); }
// Soft-delete a single photo object in place (idempotent). Returns true if it
// flipped live→deleted. S354: routes through the canonical writer.
// All callers are explicit user Delete actions (post-confirm gallery/bulk delete),
// so force defaults to true here — a user tapping Delete may legitimately remove a
// photo they just took. The phantom guard only protects against programmatic paths.
function _pgSoftDelete(ph, opts){
  return _markPhotoDeleted(ph, { force: !opts || opts.force !== false });
}
// Restore: return a soft-deleted photo to live. Routed by pid through the full list.
function _pgRestorePhoto(pid){
  var hit = _collectAllPhotos({includeDeleted:true}).filter(function(a){ return (a.photo.id||'')===pid; })[0];
  if(!hit || !_isPhotoDeleted(hit.photo)){ showToast('Photo not found'); return; }
  _markPhotoLive(hit.photo);
  if(typeof saveState==='function') saveState();
  if(typeof debounceAutosave==='function') debounceAutosave();
  _renderPhotoGallery();
  showToast('Photo restored');
}
// S337 fix: local admin check — the global _isAdmin lives inside the AIUsage IIFE
// and is NOT in this block's scope (caused a ReferenceError when opening Recently
// Deleted). Read the role directly, identical logic.
function _pgIsAdmin(){
  try{ var role = localStorage.getItem('ARENCON_role') || ''; return role==='super_admin' || role==='admin'; }
  catch(e){ return false; }
}
// Delete forever: the REAL removal — splice the source array + delete the R2 object.
// Admin-gated (super_admin / admin). Only acts on already-soft-deleted photos.
function _pgPurgePhoto(pid){
  if(!_pgIsAdmin()){ showToast('\u26A0 Only a principal can delete a photo permanently'); return; }
  var hit = _collectAllPhotos({includeDeleted:true}).filter(function(a){ return (a.photo.id||'')===pid; })[0];
  if(!hit || !hit.photo.deleted){ showToast('Photo not found'); return; }
  _aConfirm('Permanently delete this photo? This cannot be undone and removes it from cloud storage.', function(){
    var ph = hit.photo;
    _pgRemovePhoto(hit);   // real splice + surface re-render (the old hard-delete path)
    try {
      if(_csHubMode && _r2FolderId && ph && ph.id && typeof R2Photos!=='undefined' && R2Photos.remove){
        var _dm = (ph.r2Key||'').match(/\/diesel\/([^/]+)\/([^/]+)$/);
        var _dtype = _dm ? _dm[1] : 'original';
        var _dfname = _dm ? decodeURIComponent(_dm[2]) : (ph.id + '.jpg');
        R2Photos.remove(_r2FolderId, 'diesel', _dtype, _dfname).catch(function(e){
          console.warn('[purge] R2 remove failed (will orphan until sweep):', e && e.message);
        });
      }
    } catch(e){ console.warn('[purge] R2 remove threw:', e && e.message); }
    if(typeof saveState==='function') saveState();
    if(typeof debounceAutosave==='function') debounceAutosave();
    _renderPhotoGallery();
    showToast('Photo permanently deleted');
  }, 'Delete forever');
}
// 90-day auto-purge — run once per project on load. Permanently removes soft-deleted
// photos whose deletedDate is older than retention. Walks _collectAllPhotos in
// DESCENDING idx per source array so splices stay index-valid (same discipline as
// _pgDeleteSelected). Leaves R2 in place (the orphan purge / sweep reclaims later).
function _pgPurgeExpired(){
  /* S684 — THE ONLY IRREVERSIBLE THING THIS TOOL DOES.
     What may be destroyed, and the order it must be destroyed in, now live in
     lib/data/photoRetention.js. The order is the part that bites: photos are
     removed from arrays by position, so removing a low index first shifts
     every later one down and the next removal lands on a photograph nobody
     selected — permanently — while the one that was meant to go survives.
     expiredAmong() returns the eligible set ALREADY in removal order, so a
     caller cannot get the list without the ordering that makes using it safe. */
  var pid = (typeof _r2FolderId!=='undefined' && _r2FolderId) ? _r2FolderId : '_local';
  if(_pgPurgedForProject === pid) return 0;
  _pgPurgedForProject = pid;
  var expired = window.PhotoRetention.expiredAmong(
    _collectAllPhotos({includeDeleted:true}), { retentionDays: _TRASH_RETENTION_DAYS });
  if(!expired.length) return 0;
  expired.forEach(function(item){ try{ _pgRemovePhoto(item); }catch(e){ console.warn('[purge-expired]', e); } });
  if(typeof saveState==='function') saveState();
  if(typeof debounceAutosave==='function') debounceAutosave();
  console.info('[purge-expired] removed '+expired.length+' photo(s) past '+_TRASH_RETENTION_DAYS+'-day retention');
  return expired.length;
}
// Sub-tab switch (All Photos <-> Recently Deleted).
function _pgSetTab(tab){
  _photoTab = (tab==='trash') ? 'trash' : 'all';
  _renderPhotoGallery();
}
// Recently Deleted list HTML.
function _pgRenderTrashHtml(deleted){
  var h = '';
  if(!deleted.length){
    return '<p class="ph-empty">Nothing in Recently Deleted. Photos you delete from the gallery appear here and can be restored for '+_TRASH_RETENTION_DAYS+' days.</p>';
  }
  var adm = _pgIsAdmin();
  h += '<p class="ph-trash-note">Deleted photos are kept for '+_TRASH_RETENTION_DAYS+' days, then removed automatically. Restore brings a photo back where it was.'
    + (adm ? '' : ' Only a principal can delete a photo permanently.') + '</p>';
  h += '<div class="ph-trash-list">';
  deleted.forEach(function(item){
    var p = item.photo, pid = p.id||'';
    var days = _pgTrashDaysLeft(p.delAt||p.deletedDate);
    var dateLabel = '';
    if(p.deletedDate){
      var dt = new Date(p.deletedDate);
      if(dt.getTime()){
        dateLabel = dt.toLocaleDateString(undefined,{month:'short',day:'numeric'})
          + ' ' + dt.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
      }
    }
    var daysCls = days<=5 ? 'ph-trash-days urgent' : 'ph-trash-days';
    h += '<div class="ph-trash-item">';
    if(item.src){
      h += '<div class="ph-trash-thumb"><img src="'+item.src+'" loading="lazy" onerror="this.style.display=\'none\'"></div>';
    } else {
      h += '<div class="ph-trash-thumb ph-trash-noimg">\uD83D\uDCF7</div>';
    }
    h += '<div class="ph-trash-meta">';
    h += '<div class="ph-trash-label">'+(item.label||'Photo')+'</div>';
    if(dateLabel) h += '<div class="ph-trash-date">Deleted '+dateLabel+'</div>';
    h += '<div class="'+daysCls+'">'+days+' day'+(days===1?'':'s')+' left</div>';
    h += '</div>';
    h += '<div class="ph-trash-actions">';
    h += '<button class="ph-trash-restore" onclick="_pgRestorePhoto(\''+_pgJsq(pid)+'\')">Restore</button>';
    if(adm){
      h += '<button class="ph-trash-purge" onclick="_pgPurgePhoto(\''+_pgJsq(pid)+'\')">Delete forever</button>';
    } else {
      h += '<button class="ph-trash-purge disabled" disabled title="Only a principal can delete permanently">Delete forever</button>';
    }
    h += '</div></div>';
  });
  h += '</div>';
  return h;
}

// S282 B7: single source of truth for gallery grouping, shared by the renderer,
// the per-group select-all checkbox, and shift-click range selection so the
// three can never disagree about layout order. S294 (Mark): date grouping ONLY —
// the pinned Site Records section is gone; record photos (incl. "(original)"
// markup backups) land in the same date folder as everything else from that day.
function _pgGroupView(view){ return window.PhotoDate.groupByDay(view); }

// ── Site Records capture (pump / placard / site) ──
var _REC_KINDS = [
  ['pump','Pump Photo','📷','Photo of the fire pump unit'],
  ['placard','Placard Photo','🏷','Nameplate / rating placard'],
  ['site','Site Records','📁','Any other site record photo']
];
/* ══ S718 — THE PHOTO BUTTON ROW IS THE ENGINE'S, EVERYWHERE ═══════════════
   Mark, on the demo: option A. Six surfaces in this tool drew their own pair of
   Camera/Gallery buttons and left Upload out entirely — you could only upload by
   tapping the empty space in the box, which on a tablet in daylight with gloves
   is not a control at all. The standard is three ways in, always.

   Each of those surfaces keeps its OWN box: its border, its hint, its thumbnail
   grid, and — critically — its own field-proven drag/drop handler. The box is
   this tool's design and is not the engine's to replace. What was duplicated six
   times was the row of buttons, so the row is what the engine now owns
   (photoInput.js buttonsOnly, v1.2.0). One implementation, not six matching ones.

   Drag/drop is deliberately untouched: the engine's drop delegate keys off
   .obs-media-col, which none of these boxes have, so every existing drop path
   keeps running exactly as it did and nothing double-fires.

   STORAGE STAYS DIESEL'S, as always — the engine hands back File objects and
   they go into the same per-file processors the Camera button already used. */
function _dslPhotoBtns(ns, ctx){
  return (window.PhotoInput && window.PhotoInput.html)
    ? window.PhotoInput.html({ ns:ns, buttonsOnly:true, ctx:ctx })
    : '';   // engine not up yet at parse time — _dslRefreshPhotoSurfaces repaints on mount (S498)
}
/* A sketch entry's id comes back out of the DOM as TEXT. The sketch store matches
   it with ===, against a number. Hand it the string and the photo loads onto the
   canvas and is then never saved to the entry — the markup is lost on the next
   render with nothing on screen to say so. Coerce it back. */
function _dslSketchUid(ctx){
  var u = ctx && ctx.uid;
  if (u === null || u === undefined || u === '') return null;
  var n = Number(u);
  return isNaN(n) ? u : n;
}
(function _mountDslPhotoRows(){
  function go(){
    if(!window.PhotoInput){ setTimeout(go,50); return; }
    /* Site records + evidence tiles (pump / placard / site, 3-pt and 7-pt). */
    window.PhotoInput.mount({
      ns:'dsl-rec',
      onFiles:function(files,ctx){
        var kind=ctx&&ctx.kind; if(!kind||!files||!files.length) return;
        Array.prototype.forEach.call(files,function(f){ _recAddFile(f,kind); });
      },
      onGallery:function(ctx){
        var kind=ctx&&ctx.kind; if(!kind) return;
        if(typeof _galleryReuseRecord==='function') _galleryReuseRecord(kind);
      }
    });
    /* Flow-test evidence tiles. ctx.pld picks which of the two arrays a photo
       belongs to; the per-file processors are the ones the Camera button used. */
    window.PhotoInput.mount({
      ns:'dsl-flow',
      onFiles:function(files,ctx){
        var isPld=(ctx&&ctx.pld==='true'); if(!files||!files.length) return;
        Array.prototype.forEach.call(files,function(f){
          if(isPld){ if(typeof _pfFlowTestPld==='function') _pfFlowTestPld(f); }
          else     { if(typeof _pfFlowTest==='function')    _pfFlowTest(f); }
        });
      },
      onGallery:function(ctx){
        var isPld=(ctx&&ctx.pld==='true');
        if(typeof _galleryReuseFlowTest==='function') _galleryReuseFlowTest(isPld);
      }
    });
    /* Flow Chart & Calibrated Equipment modal. The category the photo is tagged
       with is global state the modal already owns, so there is no ctx to carry. */
    window.PhotoInput.mount({
      ns:'dsl-floweq',
      onFiles:function(files){
        if(!files||!files.length) return;
        Array.prototype.forEach.call(files,function(f){
          if(typeof _flowEqReadFile==='function') _flowEqReadFile(f);
        });
      },
      onGallery:function(){
        if(typeof _flowEqGalleryReuse==='function') _flowEqGalleryReuse();
      }
    });
    /* Sketch / photo markup placeholder. ctx.uid names which sketch entry the
       photo is being dropped into — there can be several open at once. */
    window.PhotoInput.mount({
      ns:'dsl-sketch',
      onFiles:function(files,ctx){
        var uid=_dslSketchUid(ctx); if(uid===null||!files||!files.length) return;
        /* Markup holds ONE base image, so the LAST shot wins — the same rule the
           camera button has always used (the one the inspector settled on). */
        var f=files[files.length-1];
        if(!f||!/^image\//.test(f.type||'')) return;
        var r=new FileReader();
        r.onload=function(e){
          if(typeof _loadSketchMarkupImg==='function') _loadSketchMarkupImg(uid, e.target.result);
        };
        r.readAsDataURL(f);
      },
      onGallery:function(ctx){
        var uid=_dslSketchUid(ctx); if(uid===null) return;
        if(typeof _galleryReuseSketch==='function') _galleryReuseSketch(uid);
      }
    });
    /* The Photo Gallery panel's drop zone is static markup in index.html and is
       never re-rendered, so it is painted once, here, the moment the engine lands. */
    var gb=document.getElementById('site-pz-btns');
    if(gb) gb.innerHTML=_dslPhotoBtns('dsl-rec',{kind:'site'});
  }
  go();
})();
function _recZoneHtml(kind){
  var def=null; _REC_KINDS.forEach(function(k){ if(k[0]===kind) def=k; });
  if(!def) return '';
  var title=def[1], icon=def[2], hint=def[3];
  var thumbs=(typeof recordPhotos==='undefined'?[]:recordPhotos).map(function(p,i){return {p:p,i:i};}).filter(function(o){return !_isPhotoDeleted(o.p) && (o.p.kind||'site')===kind;});
  var html='<div class="rec-zone-card" style="border:1.5px solid var(--border);border-radius:9px;padding:11px;background:var(--card-bg,var(--smoke));">';
  html+='<div style="font-size:calc(12px + var(--ts));font-weight:700;color:var(--slate);margin-bottom:7px;display:flex;align-items:center;gap:6px;">'+icon+' '+title+'</div>';
  html+='<div class="photo-zone-compact ev-clickable" onclick="_boxUp(event,function(){_recUpload(\''+kind+'\')})" ondragover="event.preventDefault();this.classList.add(\'drag-over\');" ondragleave="this.classList.remove(\'drag-over\');" ondrop="_recDrop(event,\''+kind+'\')">';
  html+='<span>Drag, drop or tap · '+hint+'</span>';
  html+=_dslPhotoBtns('dsl-rec',{kind:kind});
  html+='</div>';
  if(thumbs.length){
    html+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';
    thumbs.forEach(function(o){
      html+='<div style="position:relative;width:64px;height:64px;border-radius:6px;overflow:hidden;border:1.5px solid var(--border);">'
        +'<img src="'+_phSrc(o.p)+'" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in;" onclick="_recLightbox('+o.i+')" onerror="this.onerror=null;this.removeAttribute(\'src\');this.style.background=\'var(--smoke)\';">'
        +'<button onclick="event.stopPropagation();_recDownloadById(\''+(o.p.id||'')+'\')" title="Download" style="position:absolute;bottom:2px;left:2px;background:rgba(44,71,112,.92);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;line-height:18px;padding:0;cursor:pointer;">\u2193</button>'
        +'<button onclick="_recDelete('+o.i+')" title="Remove" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;line-height:18px;padding:0;cursor:pointer;">✕</button>'
        +'</div>';
    });
    html+='</div>';
  }
  html+='</div>';
  return html;
}
function _evTileHtml(kind){
  // S344: evidence boxes now render as a thumbnail GRID (checklist-style) instead
  // of a single "latest photo" tile — you see EVERY photo, tap any to open the
  // shared lightbox, and X-delete any one. An "+ Add" tile sits at the end of the
  // grid. Empty state keeps the dashed upload zone.
  var map={pump:['📷','General Pump Photos','tap / drop · camera'],'pump-pld':['📷','General Pump Photos','tap / drop · camera'],placard:['🏷','Pump Placard & PLD Placard','tap / drop · camera'],'placard-pld':['🏷','Pump Placard & PLD Placard','engine placard · control pressure'],flow:['📊','Flow Chart & Equipment','charts · gauges · calibration'],'flow-pld':['📊','Flow Chart & Equipment','charts · gauges · calibration']};   // S584 (Mark): card retitles
  var def=map[kind]; if(!def) return '';

  if(kind==='flow' || kind==='flow-pld'){
    var isPld = kind==='flow-pld';
    var fpAll=(isPld ? (flowTestPhotosPld||[]) : (flowTestPhotos||[]));
    var fp=fpAll.map(function(p,i){return {p:p,i:i};}).filter(function(o){return !_isPhotoDeleted(o.p);});
    var arrName = isPld ? 'flowTestPhotosPld' : 'flowTestPhotos';
    var trig = isPld ? 'triggerFlowTestPhotoPld()' : 'triggerFlowTestPhoto()';
    var drop = isPld ? 'handleFlowTestDropPld(event)' : 'handleFlowTestDrop(event)';
    if(!fp.length){
      return '<div class="ev-tile ev-clickable" onclick="_boxUp(event,function(){'+trig+';})" ondragover="event.preventDefault();this.classList.add(\'drag-over\');" ondragleave="this.classList.remove(\'drag-over\');" ondrop="event.preventDefault();this.classList.remove(\'drag-over\');'+drop+'">'
        +'<span class="i">'+def[0]+'</span><span class="l">'+def[1]+'</span><span class="s">'+def[2]+' · tap to add</span>'
        +_dslPhotoBtns('dsl-flow',{pld:(isPld?'true':'false')})
        +'</div>';
    }
    var fhtml='<div class="ev-grid-card ev-clickable" onclick="_boxUp(event,function(){'+trig+';})" ondragover="event.preventDefault();this.classList.add(\'drag-over\');" ondragleave="this.classList.remove(\'drag-over\');" ondrop="event.preventDefault();this.classList.remove(\'drag-over\');'+drop+'">';
    fhtml+='<div class="ev-grid-head">'+def[0]+' '+def[1]+'<span class="ev-grid-n">'+fp.length+'</span></div>';
    fhtml+='<div class="ev-grid">';
    fp.forEach(function(o){
      var p=o.p;
      fhtml+='<div class="ev-thumb">'
        +'<img src="'+_photoSrc(p)+'" onclick="if(typeof openLightbox===\'function\')openLightbox('+arrName+','+o.i+',{renderer:_renderRecordZones})" onerror="this.onerror=null;this.removeAttribute(\'src\');this.style.background=\'var(--smoke)\';">'
        +'<button class="ev-thumb-dl" title="Download this photo" onclick="event.stopPropagation();_recDownloadById(\''+(p.id||'')+'\')">\u2193</button>'
        +'<button class="ev-thumb-del" title="Delete this photo" onclick="event.stopPropagation();_recDeletePhotoById(\''+(p.id||'')+'\')">✕</button>'
        +'</div>';
    });
    fhtml+='</div>';
    fhtml+=_dslPhotoBtns('dsl-flow',{pld:(isPld?'true':'false')});
    fhtml+='</div>';
    return fhtml;
  }

  // record-backed kinds (pump / pump-pld / placard / placard-pld)
  var thumbs=(typeof recordPhotos==='undefined'?[]:recordPhotos).map(function(p,i){return {p:p,i:i};}).filter(function(o){return !_isPhotoDeleted(o.p) && (o.p.kind||'site')===kind;});
  if(!thumbs.length){
    return '<div class="ev-tile ev-clickable" onclick="_boxUp(event,function(){_recUpload(\''+kind+'\');})" ondragover="event.preventDefault();this.classList.add(\'drag-over\');" ondragleave="this.classList.remove(\'drag-over\');" ondrop="_recDrop(event,\''+kind+'\')">'
      +'<span class="i">'+def[0]+'</span><span class="l">'+def[1]+'</span><span class="s">'+def[2]+' · tap to add</span>'
      +_dslPhotoBtns('dsl-rec',{kind:kind})
      +'</div>';
  }
  var html='<div class="ev-grid-card ev-clickable" onclick="_boxUp(event,function(){_recUpload(\''+kind+'\');})" ondragover="event.preventDefault();this.classList.add(\'drag-over\');" ondragleave="this.classList.remove(\'drag-over\');" ondrop="_recDrop(event,\''+kind+'\')">';
  html+='<div class="ev-grid-head">'+def[0]+' '+def[1]+'<span class="ev-grid-n">'+thumbs.length+'</span></div>';
  html+='<div class="ev-grid">';
  thumbs.forEach(function(o){
    var p=o.p;
    html+='<div class="ev-thumb">'
      +'<img src="'+_phSrc(p)+'" onclick="_recLightbox('+o.i+')" onerror="this.onerror=null;this.removeAttribute(\'src\');this.style.background=\'var(--smoke)\';">'
      +'<button class="ev-thumb-dl" title="Download this photo" onclick="event.stopPropagation();_recDownloadById(\''+(p.id||'')+'\')">\u2193</button>'
      +'<button class="ev-thumb-del" title="Delete this photo" onclick="event.stopPropagation();_recDeletePhotoById(\''+(p.id||'')+'\')">✕</button>'
      +'</div>';
  });
  html+='</div>';
  html+=_dslPhotoBtns('dsl-rec',{kind:kind});
  html+='</div>';
  return html;
}
function _recTileHtml(kind){ return _evTileHtml(kind); }
// S339: X-delete on an evidence tile — soft-deletes the photo (→ Recently Deleted,
// restorable for 90 days) then refreshes the evidence zones. Routes through the
// shared delete path so it behaves exactly like deleting from the gallery.
function _recDeletePhotoById(pid){
  if(!pid){ showToast('Photo not found'); return; }
  if(typeof deletePhotoEverywhere==='function'){
    deletePhotoEverywhere({photoId:pid}, function(){
      if(typeof _renderRecordZones==='function') _renderRecordZones();
    });
  }
}
// S366: download an evidence-tile photo by id (records + flow-equip). Resolves the
// live photo object across all arrays, then routes through _dslDownloadPhoto so the
// saved file carries the badge-prefixed name like every other download path.
function _recDownloadById(pid){
  if(!pid){ showToast('Photo not found'); return; }
  var found=null;
  if(typeof _forEachLivePhoto==='function'){
    _forEachLivePhoto(function(p){ if(!found && p && p.id===pid) found=p; });
  }
  if(!found){ showToast('Photo not available'); return; }
  if(typeof _dslDownloadPhoto==='function') _dslDownloadPhoto(found);
}
function _renderRecordZones(){
  // Photos tab: general site records only (full zone style)
  var host=document.getElementById('record-zones');
  if(host) host.innerHTML=_recZoneHtml('site');
  // 4a/4b evidence: pump + placard + flow chart as prominent tiles
  var pp=document.getElementById('pump-placard-zones');
  if(pp) pp.innerHTML=_evTileHtml('pump')+_evTileHtml('placard')+_evTileHtml('flow');
  var pp2=document.getElementById('pump-placard-zones-4b');
  if(pp2) pp2.innerHTML=_evTileHtml('pump-pld')+_evTileHtml('placard-pld')+_evTileHtml('flow-pld');
}
// Placard OCR — wired in the next build. Placeholder keeps the button honest.
/* ════ S314: AI Placard Scan → rated-value autofill (preview-then-confirm) ════
   Calls arencon-ai-worker mode:'placard_read' (Sonnet vision, logs to ai_usage_log).
   NEVER writes silently: a preview card shows read vs current values with per-field
   checkboxes; only Apply (the technologist's explicit confirm) writes the fields.
   Applies to BOTH 3pt and 7pt rated fields — one pump, one rated point. */
var AI_WORKER_URL='https://xsemvinxsyphjiaqgywv.supabase.co/functions/v1/ai-proxy'; // S397: Supabase Edge relay — the CF worker's CORS header still names github.io, blocking arencon.app; the proxy relays server-side (no CORS) and the worker still validates the JWT.
function _placardPhotoData(p, cb){
  // Resolve the placard photo to {data(base64), media_type}. Order:
  //   1) in-memory local .d  (freshly captured this session — never fails)
  //   2) recover .d from the full-state IDB backup  (in-memory copy was stripped
  //      on a cloud reload, but the permanent IDB backup keeps the bytes)
  //   3) R2 public GET, iOS-safe: cache-buster + cache:'no-store' so Safari
  //      doesn't surface a cache-poisoned non-CORS entry as "Load failed".
  // This is why a freshly-shot 7pt placard scanned fine but a reloaded 3pt one
  // (bytes already stripped from memory) hit the bare R2 fetch and failed. (S369)
  function fromDataUrl(du){
    var m=/^data:([^;]+);base64,(.*)$/.exec(du||'');
    if(!m){ return false; }
    cb({ data:m[2], media_type:m[1] }); return true;
  }
  // 1) in-memory bytes
  if(p.d){ if(fromDataUrl(p.d)) return; }
  // 2) recover bytes from the permanent full-state IDB backup
  function tryR2(){
    var url = p.r2Url || _photoSrc(p) || '';
    if(!url){ cb(null); return; }
    var busted = url + (url.indexOf('?')>=0 ? '&' : '?') + 'cb=' + Date.now();
    fetch(busted, {cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('R2 '+r.status); return r.blob(); })
      .then(function(b){
        // S395: the worker serves everything as image/jpeg even when the stored
        // object is an HTML error page (that is how corrupt "jpg" files arose).
        // Validate real image magic bytes before handing to the model — reject a
        // disguised error page instead of scanning garbage. Worker-only host per
        // canonical architecture; survives a future arencon.app migration since the
        // resolved URL just follows whatever host _photoSrc returns.
        return Promise.resolve(
          (typeof _isRealImageBlob==='function') ? _isRealImageBlob(b) : true
        ).then(function(ok){
          if(!ok){ cb(null); return; }
          var fr=new FileReader(); fr.onload=function(){ if(!fromDataUrl(fr.result)) cb(null); }; fr.onerror=function(){ cb(null); }; fr.readAsDataURL(b);
        });
      })
      .catch(function(){ cb(null); });
  }
  if(!p.d && (p.id || p.r2Key)){
    var stKey = (typeof getProjectSaveKey==='function' ? getProjectSaveKey() : null);
    var recovered=false;
    function _scan(stObj){
      try{
        var arr = stObj && stObj.recordPhotos;
        if(!Array.isArray(arr)) return false;
        for(var i=0;i<arr.length;i++){
          var q=arr[i];
          if(q && q.d && ((p.id && q.id===p.id) || (p.r2Key && q.r2Key===p.r2Key))){
            return fromDataUrl(q.d);
          }
        }
      }catch(_e){}
      return false;
    }
    function _parse(v){
      if(!v) return null;
      try{ return (typeof v==='string') ? JSON.parse(v) : (v.state ? (typeof v.state==='string'?JSON.parse(v.state):v.state) : v); }catch(_e){ return null; }
    }
    Promise.resolve(stKey ? _idbGet(stKey) : null).then(function(v){
      if(_scan(_parse(v))){ recovered=true; return; }
      // CloudSync layer (Hub mode) stores under a different key/store
      if(typeof _idbKey==='function' && typeof _idbGet2==='function'){
        return _idbGet2(_idbKey()).then(function(v2){ if(_scan(_parse(v2))) recovered=true; });
      }
    }).then(function(){ if(!recovered) tryR2(); }).catch(function(){ tryR2(); });
    return;
  }
  // 3) no local bytes, no id to recover — go straight to R2
  tryR2();
}
// S352: salvage a placard-read result from a prose-wrapped model response. The AI
// worker returns 500 "AI returned invalid format" when the model answers with
// reasoning text + a ```json ... ``` block instead of bare JSON. The raw text is
// handed back in the error payload (e.raw / e.detail), so we pull the JSON object
// out of it client-side and proceed — no worker change needed. Returns the parsed
// object (with at least a nameplate or a rated field), or null if nothing usable.
function _salvagePlacardJson(payload){
  /* S684b — the salvage walk is shared; WHAT MAKES A PLACARD RESULT REAL is
     Diesel's. A parse that carries none of these keys is prose that happened
     to be valid JSON, and the shared walk skips it. */
  return window.VisionPrep.salvageJson(payload, {
    requiredKeys: ['nameplate','rated_flow_gpm','rated_pressure_psi','rated_speed_rpm']
  });
}
// S369: a large placard image (e.g. a full-res 3pt photo recovered from backup)
// makes the vision API reject the request with HTTP 400. Downscale every image
// to a safe envelope before sending: longest edge ≤ 1568px (vision-optimal),
// re-encoded JPEG q0.85. Keeps placard text legible while guaranteeing the
// payload is within limits. Resolves to a {data,media_type} object; on any
// failure it returns the original unchanged (never blocks the scan).
function _downscaleForVision(img){
  /* S684b — the vision-input rules moved to lib/data/visionPrep.js: normalise
     the media type (an R2-fetched blob can resolve to a type the service
     rejects with a bare 400), cap at 1568px, and NEVER send bytes the browser
     could not decode — mark them unreadable so the failure is said in words
     (S502/S509c). Electric's nameplate scan inherits all of it. */
  return window.VisionPrep.downscaleForVision(img);
}
// ── AI-scan auth pre-flight helpers (S395) ──
// Decode a Supabase access JWT's exp claim locally (no network). Returns true if
// the token is missing, unparseable, or within GRACE seconds of expiry. Pure
// client-side base64url math — host-agnostic, so it is unaffected by any future
// domain migration (e.g. arencon.app): the JWT structure and Supabase refresh
// flow are identical regardless of which origin serves the page.
function _jwtExpired(tok, graceSec){
  try{
    if(!tok) return true;
    var parts=String(tok).split('.');
    if(parts.length<2) return true;
    var b=parts[1].replace(/-/g,'+').replace(/_/g,'/');
    while(b.length%4) b+='=';
    var payload=JSON.parse(atob(b));
    if(!payload || !payload.exp) return true;                       // no exp → treat as stale
    var now=Math.floor(Date.now()/1000);
    return (payload.exp - now) <= (graceSec||30);
  }catch(_e){ return true; }
}
// Render an inline re-auth prompt directly under the Scan button. The "Sign in"
// action retries the SILENT refresh in place (stored refresh token, no re-typing),
// and on success auto-retries the scan. Falls back to a Hub message only if the
// refresh token itself is dead. Inline (not overlay) to keep the inspector in the
// scan flow on a field iPad.
function _placardAuthPrompt(btn, mode){
  try{
    if(!btn) return;
    var host=btn.parentNode; if(!host) return;
    var old=host.querySelector('.pl-auth-inline'); if(old) old.remove();
    var box=document.createElement('div');
    box.className='pl-auth-inline';
    box.style.cssText='margin-top:8px;font-family:Calibri,sans-serif;font-size:12.5px;line-height:1.45;color:var(--fail,#C0445F);display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
    var msg=document.createElement('span');
    msg.textContent='Session expired \u2014 sign in again to use AI scan.';
    var act=document.createElement('button');
    act.type='button';
    act.textContent='Sign in';
    act.style.cssText='font-family:Calibri,sans-serif;font-size:12.5px;font-weight:600;color:#fff;background:#9C2742;border:none;border-radius:8px;padding:5px 14px;cursor:pointer;';
    act.onclick=function(){
      act.disabled=true; act.textContent='Signing in\u2026';
      Promise.resolve(typeof _refreshAccessToken==='function'?_refreshAccessToken():null).then(function(nt){
        if(nt){ box.remove(); _placardScan(btn, mode); }               // refreshed → re-run scan
        else{
          msg.textContent='Couldn\u2019t refresh your session. Reopen this report from the Hub to sign in.';
          act.style.display='none';
        }
      });
    };
    box.appendChild(msg); box.appendChild(act);
    host.appendChild(box);
  }catch(_e){}
}
function _placardScan(btn, mode){
  // S338: 3-pt and 7-pt are SEPARATE PUMPS (3-pt=constant-speed, 7-pt=PLD/variable).
  // A scan launched from one tab reads ONLY that tab's placard photo(s) and writes
  // ONLY that tab's fields. mode: 'std' (3-pt) | 'pld' (7-pt). Default 'std' for
  // safety if an old caller omits it.
  mode = (mode==='pld') ? 'pld' : 'std';
  var rp=(typeof recordPhotos==='undefined'?[]:recordPhotos);
  // S338: 'placard' = the 3-pt (constant-speed) pump placard; 'placard-pld' = the
  // 7-pt engine/PLD placard. Each tab scans ONLY its own kind.
  // S369 ROOT CAUSE: scan sent the last FOUR placard photos in one request via
  // .slice(-4). When a tab held several placard shots, that meant 3–4 full images
  // in a single vision call — which the API rejects with HTTP 400 (too many /
  // payload too large). The 7pt tab usually held ONE photo, so it sent one image
  // and worked; the 3pt tab held several, so it 400'd. A placard read only needs
  // the single clearest placard — take the most recent one. Identical 1-image
  // request for both pumps now. (If a multi-photo placard is ever needed, cap at 1
  // here and revisit the worker's image limit deliberately.)
  var take = (mode==='pld')
    ? rp.filter(function(p){return (p.kind||'')==='placard-pld';}).slice(-1)
    : rp.filter(function(p){return (p.kind||'')==='placard';}).slice(-1);
  /* S562 (Mark): the scan used to look ONLY in its own Placard box and answer
     "Capture a placard photo first" while the inspector's placard shot sat in
     plain sight in the Pump box — filed under the wrong label, which is the
     commonest mis-file on site. Silently ignoring a visible photo reads as the
     tool being broken. Fall back to the MOST RECENT Pump-box photo and SAY SO,
     so a wrong guess is visible rather than silent — and the existing preview/
     confirm still gates every value before anything is written, so a photo of
     the pump body instead of its placard costs one worker call and produces an
     obviously-wrong preview, never a wrong report. The tab's own placard kind
     still wins whenever it exists (S338: each tab scans only its own pump). */
  if(!take.length){
    take = rp.filter(function(p){return (p.kind||'')==='pump' && !p.deleted;}).slice(-1);
    if(take.length){ showToast('No photo in the Placard box \u2014 scanning the latest Pump-box photo instead'); }
  }
  if(!take.length){ showToast(mode==='pld' ? 'Capture a PLD/engine placard photo first' : 'Capture a placard photo first'); return; }
  // AUTH PRE-FLIGHT (S395): decode the token's exp locally BEFORE calling the AI
  // worker. If missing/expired/near-expiry, attempt a SILENT refresh in place; on
  // failure show the inline "Sign in" prompt under the button. Catches the common
  // stale-session case without burning a failing worker request first. The 401/403
  // path below remains the fallback for a token that looks valid locally but the
  // worker rejects. Host-agnostic — survives a future arencon.app migration.
  var token=localStorage.getItem('sb-access-token');
  if(_jwtExpired(token, 30)){
    if(typeof _refreshAccessToken==='function'){
      _refreshAccessToken().then(function(nt){
        if(nt){ _placardScan(btn, mode); }                            // got a fresh token → re-run
        else { _placardAuthPrompt(btn, mode); }                       // refresh token dead → prompt
      });
    } else { _placardAuthPrompt(btn, mode); }
    return;
  }
  var origTxt=btn?btn.textContent:''; if(btn){ btn.disabled=true; btn.textContent='Reading '+take.length+' placard photo'+(take.length>1?'s':'')+'\u2026'; }
  function done(){ if(btn){ btn.disabled=false; btn.textContent=origTxt; } }
  var imgs=[], _unreadable=0, chain=Promise.resolve();
  take.forEach(function(p){
    chain=chain.then(function(){ return new Promise(function(res){
      _placardPhotoData(p,function(img){
        if(!img){ res(); return; }
        _downscaleForVision(img).then(function(small){
          if(small && small.__unreadable){ _unreadable++; }        // S509c: never queue undecodable bytes
          else imgs.push(small||img);
          res();
        });
      });
    }); });
  });
  chain.then(function(){
    if(!imgs.length){
      done();
      // S509c: distinguish "not synced yet" from "this file cannot be read at all".
      // Both used to print the sync message, which sent the inspector to wait for a
      // sync that would never fix anything.
      showToast(_unreadable
        ? 'This placard photo could not be read on this device \u2014 take a new photo of the placard and scan again.'
        : 'Placard photo not synced yet \u2014 reopen this report after it syncs, then scan.');
      return;
    }
    // S338: readUrlParams lives inside the CloudSync IIFE — call it via CloudSync so
    // projectNumber is actually populated (was bare readUrlParams() → undefined →
    // AI usage log showed '-' for project #).
    var up=(typeof CloudSync!=='undefined' && CloudSync.readUrlParams)?CloudSync.readUrlParams():{};
    var body=JSON.stringify({ mode:'placard_read', photos:imgs,
      context:{ tool:'diesel_pump', projectNumber:up.projectNumber||null, projectName:up.projectName||null } });
    function call(tok){
      return fetch(AI_WORKER_URL,{ method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok}, body:body });
    }
    // S341: one attempt = auth-aware fetch → parse. The AI worker occasionally
    // returns a malformed response ("invalid format"); a single retry almost
    // always succeeds, so we attempt twice before surfacing the error.
    function attempt(){
      return call(token).then(function(res){
        if((res.status===401||res.status===403)&&typeof _refreshAccessToken==='function'){
          return _refreshAccessToken().then(function(nt){ if(!nt) return res; return call(nt); });
        }
        return res;
      }).then(function(res){
        if(!res.ok) return res.json().then(function(e){
          // S342: capture the FULL worker error payload so we can see WHY the
          // model output was rejected (raw text, detail, etc.) instead of a
          // generic "invalid format". Logged to console for field diagnosis.
          console.warn('[placard scan] worker error payload:', e);
          var detail = e.detail || e.raw || e.message || '';
          var msg = e.error || ('AI error '+res.status);
          if(detail && String(detail).length < 240) msg += ' \u2014 ' + detail;
          var _err = new Error(msg); _err._payload = e; throw _err;
        });
        return res.json();
      });
    }
    attempt().catch(function(err1){
      // retry once after a short delay on ANY failure (transient worker/model issue)
      if(btn){ btn.textContent='Retrying\u2026'; }
      return new Promise(function(r){ setTimeout(r, 900); }).then(attempt).catch(function(err2){
        throw err2;   // both attempts failed → surface the second error
      });
    }).then(function(d){
      if(!d) return;   // (retry path resolved with no data — already handled)
      done(); _placardPreview(btn, d, imgs.length, mode);
    }).catch(function(err){
      // S352: before surfacing the error, try to salvage a JSON result the model
      // wrapped in prose (the worker 500s on that, but the raw text is usable).
      var salvaged = _salvagePlacardJson(err && err._payload);
      if(salvaged){
        try{ console.info('[placard scan] S352 salvaged JSON from prose-wrapped model output'); }catch(_e){}
        done(); _placardPreview(btn, salvaged, imgs.length, mode); return;
      }
      done();
      // S369: surface the worker's REAL reason on-screen (no desktop console on
      // field tablets). Include image count + per-image KB so a payload problem is
      // distinguishable from a worker-side/model error at a glance.
      var _p = err && err._payload;
      var _why = '';
      try{
        if(_p){ _why = _p.detail || _p.raw || _p.error || _p.message || ''; }
        if(!_why) _why = err.message || 'connection error';
      }catch(_e){ _why = err.message || 'connection error'; }
      var _sizes = imgs.map(function(im){ return Math.round((im.data?im.data.length:0)*0.75/1024)+'KB/'+(im.media_type||'?'); }).join(', ');
      try{ console.warn('[placard scan] FAIL', {mode:mode, nImgs:imgs.length, sizes:_sizes, why:_why, payload:_p}); }catch(_e){}
      showToast('Scan failed ('+imgs.length+' img · '+_sizes+'): '+String(_why).slice(0,300));
    });
  });
}
function _psPlacardCur(pct){
  var r=(typeof stdData!=='undefined'?stdData:[]).filter(function(x){return x.pct===pct;})[0];
  if(r&&r.placard!=='') return r.placard;
  var q=(typeof pldData!=='undefined'?pldData:[]).filter(function(x){return x.pct===pct;})[0];
  return (q&&q.placard!=='')?q.placard:'';
}
function _psSetPlacard(pct, v, mode){
  // S338: write the Placard (psi) column ONLY into the calling tab's flow table.
  var arr = (mode==='pld') ? (typeof pldData!=='undefined'?pldData:[]) : (typeof stdData!=='undefined'?stdData:[]);
  arr.forEach(function(r){ if(r.pct===pct) r.placard=String(v); });
}
// S356: live link — when the inspector types in "Rated Press. (psi)" (the placard
// rated value), mirror it into the 100% flow row's Placard (psi) field so the two
// stay in sync. One-way only (Rated Press -> 100% Placard): the per-row Placard
// column can legitimately be overridden per point, so we never write back the
// other direction and clobber the nameplate value.
function _linkRatedPressToPlacard(mode, val){
  var arr = (mode==='pld') ? (typeof pldData!=='undefined'?pldData:[]) : (typeof stdData!=='undefined'?stdData:[]);
  var idx = -1;
  arr.forEach(function(r,i){ if(r.pct==='100%') { r.placard = (val==null?'':String(val)); idx=i; } });
  if(idx>=0){
    // update the visible 100% Placard input in place (no full re-render = no focus loss)
    var inp = document.querySelector('input[data-tbl="'+mode+'"][data-field="placard"][data-idx="'+idx+'"]');
    if(inp) inp.value = (val==null?'':String(val));
    if(mode==='pld'){ if(typeof updatePldCalcCells==='function') updatePldCalcCells(idx); }
    else { if(typeof updateStdCalcCells==='function') updateStdCalcCells(idx); }
  }
  if(typeof debounceAutosave==='function') debounceAutosave();
}
function _npApplyNameplate(np, mode){
  // S338: write every non-empty nameplate string into ONLY the calling tab's fields.
  if(!np||typeof np!=='object') return 0;
  var sfx = (mode==='pld') ? '-pld' : '';
  var m={manufacturer:'np-mfr',model_no:'np-model',pump_serial_no:'np-serial',size:'np-size',no_of_stages:'np-stages',impeller_dia_in:'np-impeller',rated_bhp:'np-bhp',max_bhp:'np-maxbhp',driver_mfg:'np-drvmfg',driver_serial_no:'np-drvsn',controller_mfg:'np-ctlmfg',controller_serial_no:'np-ctlsn'};
  var n=0;
  Object.keys(m).forEach(function(k){
    var v=np[k]; if(v==null||v==='') return;
    var el=document.getElementById(m[k]+sfx); if(el){ el.value=v; n++; }
  });
  return n;
}
function _placardPreview(btn, d, nPhotos, mode){
  mode = (mode==='pld') ? 'pld' : 'std';
  var sfx = (mode==='pld') ? '-pld' : '';
  // S344: the worker sometimes leaves churn_pressure_psi AND max_allowable_discharge_psi null
  // in the structured JSON even though the prose `notes` states the placard's "Max p" value
  // (= churn / shutoff). Salvage that number from the notes so the Churn row fills. Conservative:
  // only fires when both structured fields are null, only accepts a plausible 0–600 psi value.
  function _salvageMaxP(notes){
    if(!notes) return null;
    var pats=[
      // "Max p (max allowable discharge) = 180.0 psi"  /  "Max p = 180 psi"
      /\bmax\s*p\b[^0-9]{0,40}?([0-9]{1,3}(?:\.[0-9]+)?)\s*psi/i,
      // "max allowable discharge ... 180 psi" / "max discharge pressure: 180 psi"
      /max(?:imum)?\s*(?:allowable\s*)?discharge[^0-9]{0,40}?([0-9]{1,3}(?:\.[0-9]+)?)\s*psi/i,
      // "churn ... 180 psi" / "shutoff ... 180 psi"
      /(?:churn|shut[\s-]?off)[^0-9]{0,40}?([0-9]{1,3}(?:\.[0-9]+)?)\s*psi/i
    ];
    for(var i=0;i<pats.length;i++){ var mm=notes.match(pats[i]); if(mm){ var n=parseFloat(mm[1]); if(isFinite(n)&&n>0&&n<=600) return n; } }
    return null;
  }
  if(d.churn_pressure_psi==null && d.max_allowable_discharge_psi==null){
    var sv=_salvageMaxP(d.notes);
    if(sv!=null){ d.max_allowable_discharge_psi=sv; try{ console.info('[placard scan] salvaged Max p/churn from notes:', sv); }catch(_s){} }
  }
  var old=document.getElementById('placard-scan-card'); if(old&&old.parentNode) old.parentNode.removeChild(old);
  function inputCur(id){ var el=document.getElementById(id); return el?el.value:''; }
  function curPlacard(pct){
    // S338: current Placard-column value from ONLY the calling tab's table.
    var arr = (mode==='pld') ? (typeof pldData!=='undefined'?pldData:[]) : (typeof stdData!=='undefined'?stdData:[]);
    var r=arr.filter(function(x){return x.pct===pct;})[0];
    return (r&&r.placard!=='')?r.placard:'';
  }
  // S338 field map — writes ONLY the calling tab (suffix sfx, table by mode).
  var fields=[
    { key:'flow',  label:'Rated Flow (gpm)',          val:d.rated_flow_gpm,     cur:inputCur('pm-rated-flow'+sfx),
      apply:function(v){ var el=document.getElementById('pm-rated-flow'+sfx); if(el) el.value=v; } },
    { key:'prv',   label:'Rated Pressure (psi)',      val:d.rated_pressure_psi, cur:inputCur('pm-prv'+sfx),
      apply:function(v){ var el=document.getElementById('pm-prv'+sfx); if(el) el.value=v; _psSetPlacard('100%',v,mode); } },
    { key:'rpm',   label:'Rated Speed (RPM)',         val:d.rated_speed_rpm,    cur:inputCur('pm-rpm'+sfx),
      apply:function(v){ var el=document.getElementById('pm-rpm'+sfx); if(el) el.value=v; } },
    { key:'churn', label:'Churn Pressure (psi @ 0%)', val:(d.churn_pressure_psi!=null?d.churn_pressure_psi:d.max_allowable_discharge_psi), cur:curPlacard('0%'),
      apply:function(v){ _psSetPlacard('0%',v,mode); } },
    { key:'p150',  label:'Pressure @ 150% (psi)',     val:d.pressure_at_150_psi,cur:curPlacard('150%'),
      apply:function(v){ _psSetPlacard('150%',v,mode); } },
    { key:'pldcp', label:'PLD Control Pressure (psi)',val:d.pld_control_pressure_psi, cur:inputCur('pm-pld-setting'),
      apply:function(v){ var el=document.getElementById('pm-pld-setting'); if(el) el.value=v; } }
  ];
  // S338: PLD control pressure is a 7-pt-only concept — hide it on a 3-pt scan.
  if(mode!=='pld') fields=fields.filter(function(f){ return f.key!=='pldcp'; });
  var any=fields.some(function(f){return f.val!=null;});
  var card=document.createElement('div'); card.id='placard-scan-card';
  card.style.cssText='margin:10px 16px 14px;border:1px solid #C9CDD4;border-radius:10px;background:rgba(63,110,156,.06);padding:12px 14px;font:13px Calibri,sans-serif;';
  var confCol=d.confidence==='high'?'#5F8068':(d.confidence==='low'?'#A85959':'#B08948');
  var html='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
    +'<b style="font-size:13.5px;">\u2726 Placard read</b>'
    +'<span style="font-size:11px;color:#5E5B68;">'+(nPhotos||1)+' photo'+((nPhotos||1)>1?'s':'')+' cross-referenced</span>'
    +'<span style="font-weight:700;color:'+confCol+';text-transform:uppercase;font-size:11px;letter-spacing:.4px;">'+_escHtml(d.confidence||'medium')+' confidence</span></div>';
  if(!any){
    html+='<div style="color:#A85959;">No values could be read from the photo(s).</div>';
  } else {
    html+='<div style="display:flex;flex-direction:column;gap:6px;">';
    fields.forEach(function(f){
      if(f.val==null){
        html+='<label style="display:flex;align-items:center;gap:8px;opacity:.5;"><input type="checkbox" disabled> '
          +f.label+': <i>not readable</i></label>';
        return;
      }
      var same = (f.cur!=='' && parseFloat(f.cur)===parseFloat(f.val));
      // S318 (Mark): never churn existing values for no reason — a matching value
      // is shown as confirmation, unchecked and disabled; only DIFFERENT or empty
      // fields arrive checked.
      if(same){
        html+='<label style="display:flex;align-items:center;gap:8px;opacity:.65;"><input type="checkbox" disabled> '
          +f.label+': <b>'+f.val+'</b> <span style="color:#5F8068;">matches current \u2014 no change</span></label>';
      } else if(f.cur===''){
        html+='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">'
          +'<input type="checkbox" checked data-pscan="'+f.key+'"> '
          +f.label+': <b>'+f.val+'</b> <span style="color:#5F8068;">(empty \u2014 will be filled)</span></label>';
      } else {
        html+='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">'
          +'<input type="checkbox" checked data-pscan="'+f.key+'"> '
          +f.label+': <b>'+f.val+'</b> <span style="color:#B08948;font-weight:600;">(currently '+_escHtml(f.cur)+' \u2014 will replace)</span></label>';
      }
    });
    html+='</div>';
  }
  // S320: nameplate details — one group row (model/serial/impeller/etc.)
  var npd=d.nameplate||{};
  var npKeys=Object.keys(npd).filter(function(k){ return npd[k]!=null && npd[k]!==''; });
  if(npKeys.length){
    var npSum=[];
    if(npd.model_no) npSum.push('Model '+npd.model_no);
    if(npd.pump_serial_no) npSum.push('S/N '+npd.pump_serial_no);
    if(npd.impeller_dia_in) npSum.push('Impeller '+npd.impeller_dia_in+'\u2033');
    var more=npKeys.length-npSum.length;
    html+='<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px;">'
      +'<input type="checkbox" checked data-pscan="nameplate"> '
      +'Nameplate details: <b>'+_escHtml(npSum.join(' \u00b7 ')||npKeys.length+' fields')+'</b>'
      +(more>0?' <span style="color:#5E5B68;">+'+more+' more</span>':'')+'</label>';
  }
  if(d.notes) html+='<div style="margin-top:8px;color:#5E5B68;font-size:12px;">'+_escHtml(d.notes)+'</div>';
  if(d.usage&&d.usage.cost_usd!=null) html+='<div style="margin-top:4px;color:#928E9C;font-size:11px;">Cost: $'+Number(d.usage.cost_usd).toFixed(4)+'</div>';
  html+='<div style="display:flex;gap:8px;margin-top:10px;">';
  if(any) html+='<button id="pscan-apply" style="background:#9C2742;color:#fff;border:none;border-radius:7px;padding:7px 16px;font:600 13px Calibri,sans-serif;cursor:pointer;">Apply selected</button>';
  html+='<button id="pscan-cancel" style="background:#455A64;color:#fff;border:none;border-radius:7px;padding:7px 16px;font:600 13px Calibri,sans-serif;cursor:pointer;">'+(any?'Cancel':'Close')+'</button></div>'
    +'<div style="margin-top:7px;color:#928E9C;font-size:11px;">AI-read values \u2014 verify against the physical placard before applying. Fills only the '+(mode==='pld'?'7-pt (PLD)':'3-pt')+' tab; churn/100%/150% land in this tab\u2019s Placard column rows.</div>';
  card.innerHTML=html;
  var panel=btn?btn.closest('.np-panel'):null;
  var host=document.getElementById('placard-ocr-host');
  if(panel){ panel.appendChild(card); }
  else if(host){ host.appendChild(card); }
  else { document.body.appendChild(card); }
  card.scrollIntoView({behavior:'smooth', block:'nearest'});
  var bC=card.querySelector('#pscan-cancel'); if(bC) bC.addEventListener('click',function(){ card.parentNode.removeChild(card); });
  var bA=card.querySelector('#pscan-apply');
  if(bA) bA.addEventListener('click',function(){
    var n=0;
    card.querySelectorAll('input[data-pscan]:checked').forEach(function(cb){
      var key=cb.getAttribute('data-pscan');
      if(key==='nameplate'){ n+=_npApplyNameplate(d.nameplate, mode); return; }   // S338
      var f=fields.filter(function(x){return x.key===key;})[0];
      if(f&&f.val!=null){ f.apply(f.val); n++; }
    });
    if(typeof autoFillStdFlows==='function') autoFillStdFlows();
    if(typeof autoFillPldFlows==='function') autoFillPldFlows();
    if(typeof updateChart==='function') updateChart();
    if(typeof updateNetChart3pt==='function') updateNetChart3pt();
    if(typeof updatePldChart==='function') updatePldChart();
    if(typeof updatePldNetChart==='function') updatePldNetChart();
    if(typeof renderStdTable==='function') renderStdTable();
    if(typeof renderPldTable==='function') renderPldTable();
    // ═══ S530 ROOT-CAUSE FIX — scanned values reverted to the old placard ═══
    // The nameplate/rated inputs are DOM-only (collectState() reads el.value at
    // save time; there is no model copy). _npApplyNameplate and every fields[].apply
    // set el.value PROGRAMMATICALLY, which fires no 'input' event — so the global
    // input listener never scheduled an autosave. saveState() here wrote IDB ONLY.
    // The cloud row therefore kept the OLD nameplate, and within one heartbeat tick
    // (~30s) _mergeCloudLocal — which treats cloud as authoritative for scalars, and
    // whose S321 edit-deferral only defers on an active input or a PENDING autosave
    // timer, neither of which existed — repainted the stale values straight back over
    // the scan. Next save then collected the old values off the DOM and made the
    // revert permanent. This is Franz's 7155.40 nameplate block (wrong pump, S525-S530 §2).
    // Fix: flush durably AND push to cloud in the same tick, so the cloud row carries
    // the scanned values before any pull can contradict them.
    if(typeof _flushAutosave==='function') _flushAutosave();
    else if(typeof saveState==='function') saveState();
    card.parentNode.removeChild(card);
    showToast(n?(n+' value'+(n>1?'s':'')+' applied \u2014 verify the tables & charts'):'Nothing selected');
  });
}

// ── S371 PORT (from FRT S367): EXIF capture-date ──────────────────────────
// Date a photo by when it was TAKEN (EXIF DateTimeOriginal), not when it was
// uploaded. Dependency-free: reads only the JPEG header (first 128KB) for the
// APP1/EXIF segment. Returns 'YYYY-MM-DD' or null. MUST run on the original File
// BEFORE compressImage (compression strips EXIF). Ported verbatim from FRT.
function _readExifCaptureDate(file){ return window.PhotoDate.exifCaptureDate(file); }
// Diesel stores `date` as full ISO; EXIF gives 'YYYY-MM-DD'. Convert the capture
// date to LOCAL-NOON ISO so it lands on the right calendar day in every timezone
// (midnight UTC could shift a day). No EXIF → upload-time ISO (unchanged behavior).
function _photoDateFromExif(file){
  /* S682 — the camera's date, read at NOON so a photo taken on the 21st is
     never filed on the 20th for anyone west of UTC. The rule lives in
     lib/data/photoDate.js now; Electric inherits it rather than copying it. */
  return window.PhotoDate.dateForNewPhoto(file);
}

function _recAddFile(file, kind){
  if(!file || !file.type || file.type.indexOf('image/')!==0) return;
  // S371: read capture date from the original File before compression strips EXIF.
  _photoDateFromExif(file).then(function(photoDate){
    var r=new FileReader();
    r.onload=function(ev){
      compressImage(ev.target.result, 1600, 0.85, function(c){
        var _ph=ArcPhoto.mint(c, file.name, {date:photoDate, extra:{kind:kind, caption:''}});
        recordPhotos.push(_ph);
        _renderRecordZones();
        if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
      });
    };
    r.readAsDataURL(file);
  });
}
// S342: click-the-box-to-upload. Photo zones already accept drag&drop; this makes
// the whole tile a click target equivalent to the old Upload button, so Upload
// buttons are removed tool-wide (Camera + Gallery kept). The helper ignores clicks
// that land on an interactive child (button, link, img/thumb, input, select) so
// Camera/Gallery/delete/zoom and thumbnails keep working — only "empty" clicks on
// the tile trigger upload. `fn` is the zone's existing upload trigger.
function _boxUp(e, fn){
  try{
    var t=e.target;
    // walk up from the click target to the bound box; if we pass an interactive
    // element first, this click was meant for that control, not the box.
    var box=e.currentTarget;
    var n=t;
    while(n && n!==box){
      var tag=(n.tagName||'').toLowerCase();
      if(tag==='button'||tag==='a'||tag==='img'||tag==='input'||tag==='select'||tag==='textarea'||tag==='label') return;
      if(n.getAttribute && (n.getAttribute('role')==='button' || n.hasAttribute('data-noupload'))) return;
      n=n.parentNode;
    }
    if(typeof fn==='function') fn();
  }catch(_e){ if(typeof fn==='function') fn(); }
}
function _recDrop(e, kind){ e.preventDefault(); var z=e.currentTarget; if(z)z.classList.remove('drag-over'); Array.from(e.dataTransfer.files).forEach(function(f){ _recAddFile(f,kind); }); }
function _recUpload(kind){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true; inp.onchange=function(){ Array.from(inp.files).forEach(function(f){ _recAddFile(f,kind); }); }; inp.click(); }
function _recCamera(kind){ if(typeof _camBurst==='function'){ _camBurst(function(f){ _recAddFile(f,kind); }); return; } _recCameraLegacy(kind); }
function _recCameraLegacy(kind){ var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.setAttribute('capture','environment'); inp.onchange=function(){ var f=inp.files[0]; if(f) _recAddFile(f,kind); }; inp.click(); }
function _recDelete(i){
  // S264: confirm + authoritative delete by id (both surfaces + R2 + save).
  var p = recordPhotos[i]; if(!p) return;
  if(p.id){ deletePhotoEverywhere({photoId:p.id}); }
  else {
    _aConfirm('Delete this photo? This cannot be undone.', function(){
      recordPhotos.splice(i,1); _renderRecordZones();
      if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
      if(typeof saveState==='function') saveState();
    },'Delete');
  }
}
// S264: confirm-delete helpers for the inline ✕ buttons that previously spliced with
// no confirmation. Route through the authoritative path by id when possible.
// ── Defic photo removers → lib/ui/deficiencies.js (S500) ──
function _recLightbox(i){ openLightbox(recordPhotos, i, {renderer:_renderRecordZones}); }

function _renderPhotoGallery(){
  var container = document.getElementById('photos-gallery');
  if(!container) return;
  var all = _pgVisible();   // S337: live gallery excludes soft-deleted photos
  var deleted = _pgGatherDeleted();

  // stat counts (always over ALL photos, not the filtered view)
  // S336: 'general' tile dropped — fold general-deficiency photos into Records
  // (Site Records) so they stay reachable; their G# badge still distinguishes them.
  var counts = {all:all.length, checklist:0, deficiency:0, general:0, flow:0, records:0};
  all.forEach(function(a){ if(counts[a.cat]!=null) counts[a.cat]++; });
  counts.records += counts.general;

  // stale selection cleanup
  var validIds = new Set(all.map(function(a){return a.photo.id||'';}));
  _pgSelected.forEach(function(id){ if(!validIds.has(id)) _pgSelected.delete(id); });

  // apply filter (S336: 'records' also catches folded-in 'general' photos)
  var view = _pgFilter==='all' ? all
    : _pgFilter==='records' ? all.filter(function(a){ return a.cat==='records' || a.cat==='general'; })
    : all.filter(function(a){ return a.cat===_pgFilter; });

  // S337: declare html (was an implicit global) + Recently Deleted sub-tab bar.
  var html = '';
  html += '<div class="ph-subtabs">'
    + '<button class="ph-subtab'+(_photoTab==='all'?' active':'')+'" onclick="_pgSetTab(\'all\')">All Photos <span class="ph-subtab-n">'+counts.all+'</span></button>'
    + '<button class="ph-subtab'+(_photoTab==='trash'?' active':'')+'" onclick="_pgSetTab(\'trash\')">\uD83D\uDDD1 Recently Deleted <span class="ph-subtab-n">'+deleted.length+'</span></button>'
    + '</div>';

  // S337: Recently Deleted view — short-circuits the normal gallery render.
  if(_photoTab==='trash'){
    html += _pgRenderTrashHtml(deleted);
    container.innerHTML = html;
    return;
  }

  // ── Toolbar (S336: tiles ARE the filter — FRT parity. Coloured numbers match
  //    badge colours; active tile highlighted; "General" dropped (Site Records
  //    covers it); gear/dropdown filter removed entirely). ──
  function _statTile(mode, num, color, lbl){
    var act = (_pgFilter===mode) ? ' ph-stat-active' : '';
    var col = color ? (' style="color:'+color+'"') : '';
    return '<div class="ph-stat'+act+'" onclick="_pgSetFilter(\''+mode+'\')">'
      + '<div class="ph-stat-num"'+col+'>'+num+'</div>'
      + '<div class="ph-stat-lbl">'+lbl+'</div></div>';
  }
  html += '<div class="ph-toolbar"><div class="ph-toolbar-left">';
  html += _statTile('all', counts.all, '', 'Total');
  html += _statTile('checklist', counts.checklist, '#5E7A8C', 'Checklist');
  html += _statTile('deficiency', counts.deficiency, 'var(--no)', 'Deficiencies');
  html += _statTile('flow', counts.flow, '#B07F5A', 'Flow test');
  html += _statTile('records', counts.records, '#6E6AA8', 'Site Records');
  html += '</div><div class="ph-toolbar-right">';
  var nSel = _pgSelected.size;
  if(nSel>0){
    html += '<span class="ph-sel-count">'+nSel+' selected</span>';
    html += '<button class="ph-btn" onclick="_pgDownloadSelected()">\u2193 Download</button>';
    html += '<button class="ph-btn" onclick="_pgReassignSelected()">\u2197 Move to\u2026</button>';
    html += '<button class="ph-btn" onclick="_pgReassignSelected(\'copy\')">\u29C9 Copy to\u2026</button>';
    html += '<button class="ph-btn ph-btn-danger" onclick="_pgDeleteSelected()">Delete '+nSel+'</button>';
    html += '<button class="ph-btn" onclick="_pgDeselectAll()">Clear</button>';
  } else {
    html += '<button class="ph-btn" onclick="_pgSelectAll()">Select all</button>';
  }
  html += '</div></div>';

  if(!view.length){
    html += '<p class="ph-empty">'+(all.length?'No photos in this category.':'No photos yet. Photos from checklists, flow tests, deficiencies, and general items appear here.')+'</p>';
    container.innerHTML = html;
    return;
  }

  // ── group via shared grouping (S282 B7: Site Records pinned section + date groups) ──
  var grouped = _pgGroupView(view);

  grouped.forEach(function(g){
    var k = g.key;
    // S270: per-date "folder" select box — selects/deselects every photo in this day group.
    // Compute checked/indeterminate from how many of this group's photos are currently selected.
    var grpIds = g.items.map(function(it){ var p=it.photo; return p.id||('pg_'+it.section+'_'+it.idx); });
    var grpSelCount = grpIds.filter(function(id){ return _pgSelected.has(id); }).length;
    var grpAll = grpSelCount>0 && grpSelCount===grpIds.length;
    var grpSome = grpSelCount>0 && grpSelCount<grpIds.length;
    html += '<div class="ph-date-header">'
      + '<input type="checkbox" class="ph-date-check" id="phdc-'+k+'"'+(grpAll?' checked':'')+' onclick="event.stopPropagation();_pgToggleDate(\''+k+'\')" title="Select all photos on this date" aria-label="Select all photos on this date">'
      + '<span class="ph-date-label">'+g.label+'</span>'
      + '<span class="ph-date-count">\u00B7 '+g.items.length+' photo'+(g.items.length===1?'':'s')+'</span></div>';
    html += '<div class="ph-grid">';
    g.items.forEach(function(item){
      var p=item.photo;
      var pid=p.id||('pg_'+item.section+'_'+item.idx);
      var sel=_pgSelected.has(pid)?' selected':'';
      var badgeCls='ph-badge-'+(item.cat||'checklist');
      var badgeStyle = (p && p.tag && typeof _gaugeReadingColor==='function') ? (' style="background:'+_gaugeReadingColor(p.tag)+'"') : '';
      html += '<div class="ph-card'+sel+'" data-pg-id="'+pid+'">';
      html += '<input type="checkbox" class="ph-check"'+(sel?' checked':'')+' onclick="event.stopPropagation();_pgToggleSelect(event,\''+pid+'\')">';
      html += '<span class="ph-badges"><span class="ph-badge '+badgeCls+'"'+badgeStyle+'>'+(item.badge||'?')+'</span>'+(p._annotated?'<span class="ph-badge" style="background:#5E5B68" title="Marked up — original kept in Site Records">\u270E</span>':'')+'</span>';
      if(item.src){ html += '<img src="'+item.src+'" loading="lazy" onclick="_pgOpenLightbox(\''+_pgJsq(pid)+'\')" onerror="this.onerror=null;console.warn(\'[gallery] thumb failed\',this.src&&this.src.slice(0,160));this.parentNode&&this.parentNode.insertBefore(Object.assign(document.createElement(\'div\'),{className:\'ph-noimg\',textContent:\'\uD83D\uDCF7\'}),this);this.remove();">'; }
      else { html += '<div class="ph-noimg">\uD83D\uDCF7</div>'; }
      // (time badge removed — FRT gallery thumbnails carry no timestamp)
      html += _pgCloudIcon(p);
      html += '<button class="ph-dl-btn" onclick="event.stopPropagation();_pgDownloadOne(\''+_pgJsq(pid)+'\')" title="Download">\u2193</button>';
      html += '<button class="ph-del-btn" onclick="event.stopPropagation();_pgDeleteOne(\''+_pgJsq(pid)+'\')" title="Delete">\u2715</button>';
      html += '</div>';
    });
    html += '</div>';
  });

  container.innerHTML = html;
  // set indeterminate state on any partially-selected date checkboxes (can't be done via HTML attr)
  grouped.forEach(function(g){
    var grpIds = g.items.map(function(it){ var p=it.photo; return p.id||('pg_'+it.section+'_'+it.idx); });
    var c = grpIds.filter(function(id){ return _pgSelected.has(id); }).length;
    var cb = document.getElementById('phdc-'+g.key);
    if(cb) cb.indeterminate = (c>0 && c<grpIds.length);
  });
}
// S270: select/deselect every photo in a date group. If all in the group are already selected,
// clicking clears them; otherwise it selects them all.
function _pgToggleDate(k){
  var view = _pgFilter==='all' ? _collectAllPhotos()
    : _pgFilter==='records' ? _collectAllPhotos().filter(function(a){ return a.cat==='records' || a.cat==='general'; })
    : _collectAllPhotos().filter(function(a){ return a.cat===_pgFilter; });
  var grp = _pgGroupView(view).filter(function(g){ return g.key===k; })[0];
  var grpIds = grp ? grp.items.map(function(it){ var p=it.photo; return p.id||('pg_'+it.section+'_'+it.idx); }) : [];
  var allSel = grpIds.length>0 && grpIds.every(function(id){ return _pgSelected.has(id); });
  grpIds.forEach(function(id){ if(allSel) _pgSelected.delete(id); else _pgSelected.add(id); });
  _renderPhotoGallery();
}

// S271: ordered list of photo ids exactly as the gallery lays them out (date groups newest-first,
// photos in group order). Used for shift-click range selection so "click A, shift-click B" selects
// the contiguous run between them — like Google Photos.
function _pgOrderedIds(){
  var view = _pgFilter==='all' ? _collectAllPhotos() : _collectAllPhotos().filter(function(a){ return a.cat===_pgFilter; });
  var ids=[];
  _pgGroupView(view).forEach(function(g){ g.items.forEach(function(it){ var p=it.photo; ids.push(p.id||('pg_'+it.section+'_'+it.idx)); }); });
  return ids;
}
var _pgAnchorPid = null; // last single-clicked photo, the anchor for a shift-range
function _pgToggleSelect(e, pid){
  // S271: shift-click selects the range between the anchor and this photo (in displayed order).
  if(e && e.shiftKey && _pgAnchorPid && _pgAnchorPid!==pid){
    var ids=_pgOrderedIds();
    var a=ids.indexOf(_pgAnchorPid), b=ids.indexOf(pid);
    if(a>-1 && b>-1){
      var lo=Math.min(a,b), hi=Math.max(a,b);
      // the anchor's current selected state decides whether the range is added or removed
      var add = _pgSelected.has(_pgAnchorPid);
      for(var i=lo;i<=hi;i++){ if(add) _pgSelected.add(ids[i]); else _pgSelected.delete(ids[i]); }
      _pgAnchorPid = pid; // move the anchor to the end of the range
      _renderPhotoGallery();
      return;
    }
  }
  // normal single toggle
  if(_pgSelected.has(pid)) _pgSelected.delete(pid);
  else _pgSelected.add(pid);
  _pgAnchorPid = pid; // this becomes the new anchor for a subsequent shift-click
  var el = document.querySelector('[data-pg-id="'+pid+'"]');
  if(el){
    el.classList.toggle('selected', _pgSelected.has(pid));
    var cb = el.querySelector('.ph-check');
    if(cb) cb.checked = _pgSelected.has(pid);
  }
  // refresh toolbar (selection count / actions)
  _renderPhotoGallery();
}
function _pgSelectAll(){
  var all = _pgVisible();   // S337: never select soft-deleted photos
  all.forEach(function(item){ _pgSelected.add(item.photo.id||''); });
  _renderPhotoGallery();
}
function _pgDeselectAll(){
  _pgSelected.clear();
  _renderPhotoGallery();
}

// ── Gallery lightbox ──
// S282 B3: cards used to bake a numeric index into onclick at RENDER time, but
// the photo list was rebuilt at CLICK time — any background cloud merge between
// render and tap shifted the list and the index opened (or DELETED) the wrong
// photo. All card actions now pass the photo's identity (id, or the synthetic
// section+idx pid for legacy id-less photos) and resolve it against the live
// collection at action time. Numeric refs still accepted for back-compat.
function _pgJsq(s){ return (''+s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function _pgResolveByPid(pid){
  // S372.4: include backups so a clean-original (_isOrigBackup) tile resolves;
  // match the gallery's visible set so the lightbox index lines up.
  var all = (typeof _pgVisible==='function') ? _pgVisible() : _collectAllPhotos();
  for(var i=0;i<all.length;i++){
    var it = all[i];
    var ipid = (it.photo && it.photo.id) || ('pg_'+it.section+'_'+it.idx);
    if(ipid===pid) return {item:it, idx:i, all:all};
  }
  return null;
}
function _pgResolveRef(ref){
  if(typeof ref==='number'){
    // S372.4: the gallery renders via _pgVisible() = _collectAllPhotos({includeBackups:true}),
    // so a numeric index must resolve against the SAME set (with backups) or the
    // indices shift and a clean-original tile resolves to the wrong photo / "not
    // found". Match the gallery's visible, non-deleted ordering exactly.
    var all=(typeof _pgVisible==='function') ? _pgVisible() : _collectAllPhotos();
    return all[ref] ? {item:all[ref], idx:ref, all:all} : null;
  }
  return _pgResolveByPid(ref);
}
function _pgOpenLightbox(ref){
  var r = _pgResolveRef(ref);
  if(!r){ showToast('Photo not found — it may have just been moved or deleted'); return; }
  var photos = r.all.map(function(a){ return a.photo; });
  openLightbox(photos, r.idx, {renderer: _renderPhotoGallery});
}

// ── Bulk download with JSZip ──
function _pgDownloadSelected(){
  var all = _collectAllPhotos();
  var selected = all.filter(function(a){ return _pgSelected.has(a.photo.id||''); });
  if(!selected.length){ showToast('No photos selected'); return; }
  _pgBulkDownload(selected);
}
function _pgDownloadOne(ref){
  var r = _pgResolveRef(ref);
  if(!r){ showToast('Photo not found'); return; }
  _pgBulkDownload([r.item]);
}
async function _pgBulkDownload(items){
  if(items.length === 1){
    // Single photo — fetch as a blob and download a real file. We must NOT just
    // set a.href to a cross-origin R2 URL: the `download` attribute is ignored
    // cross-origin, so the browser navigates to the image (opening a webpage)
    // instead of saving it. Fetching to a blob + object URL downloads reliably.
    var p = items[0].photo;
    var src = _photoSrc(p);
    var name = _dslBadgeFilename(p);
    if(!src){ showToast('Photo not available'); return; }
    try{
      if(src.startsWith('data:')){
        var a0 = document.createElement('a');
        a0.href = src; a0.download = name;
        document.body.appendChild(a0); a0.click(); a0.remove();
        return;
      }
      var resp = await fetch(src);
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      var blob = await resp.blob();
      // Validate by magic bytes — content-type from R2 is unreliable (always says
      // image/jpeg). If it's not a real image, don't save a corrupt file.
      if(!(await _isRealImageBlob(blob))){
        throw new Error('fetched content is not a valid image');
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    }catch(e){
      console.warn('[download] single failed', e);
      showToast('Download failed — photo not available');
    }
    return;
  }
  // Multiple — use JSZip
  showToast('Preparing download...');
  if(typeof JSZip === 'undefined'){
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    sc.onload = function(){ _pgZipDownload(items); };
    document.head.appendChild(sc);
  } else {
    _pgZipDownload(items);
  }
}
async function _pgZipDownload(items){
  try {
    var zip = new JSZip();
    var added = 0, skipped = 0, used = {};
    for(var i=0; i<items.length; i++){
      var p = items[i].photo;
      var src = _photoSrc(p);
      // S366: badge-prefixed name, same helper as single-download for consistency.
      var name = _dslBadgeFilename(p);
      // de-dupe filenames so generic camera names don't overwrite in the zip
      if(used[name]){ var dot=name.lastIndexOf('.'); name = (dot>0?name.slice(0,dot):name)+'_'+(i+1)+(dot>0?name.slice(dot):'.jpg'); }
      used[name]=1;
      if(!src){ skipped++; console.warn('[zip] no src for', p.id); continue; }
      if(src.startsWith('data:')){
        var parts = src.split(',');
        zip.file(name, parts[1], {base64:true});
        added++;
      } else {
        try {
          var resp = await fetch(src);
          if(!resp.ok) throw new Error('HTTP '+resp.status);
          var blob = await resp.blob();
          // Validate by magic bytes (R2 content-type is unreliable — always
          // image/jpeg). A failed fetch returns an HTML/JSON error body; zipping
          // that produced the corrupt, un-openable "jpg" files.
          if(!(await _isRealImageBlob(blob))){
            throw new Error('not a valid image');
          }
          zip.file(name, blob);
          added++;
        } catch(e){ skipped++; console.warn('[zip] skip', name, e&&e.message); }
      }
    }
    if(added === 0){ showToast('No downloadable photos (files unavailable)'); return; }
    var zblob = await zip.generateAsync({type:'blob'});
    var url = URL.createObjectURL(zblob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'photos_export_'+new Date().toISOString().substring(0,10)+'.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    showToast(skipped ? ('Downloaded '+added+' photos ('+skipped+' unavailable, skipped)') : ('Downloaded '+added+' photos'));
  } catch(e){
    console.error('Zip error:', e);
    showToast('Download error: '+e.message);
  }
}

// ═════════════════════════════════════════════════
// S371: EXPORT PROJECT DOCS (Fieldwire-parity, read-only)
// Spec: DESIGN_EXPORT_AND_SAFE_LOAD.md PART 1 (export half only).
// Builds a client-side ZIP: date-bucketed photos (original + -marked variant),
// the full re-loadable JSON (redundant by design), and a README that decodes
// the filename scheme + stamps export date/version. Reuses the proven gallery
// download machinery (_photoSrc / _isRealImageBlob / JSZip). Read-only: touches
// no live state, no save, no R2 writes. The 3-door safe-LOAD half is gated to a
// Mark-present session and is NOT built here.
// ─────────────────────────────────────────────────
var _EXPORT_TOOLCODE = 'DFP';              // Diesel Fire Pump
var _EXPORT_VERSION   = 'S462';            // stamped into README + JSON wrapper

function _expSanitize(s){
  // SHARED-ENGINE PARITY (Tier 2, matches /lib/export/projectDocs.js expSanitize):
  // Windows/Mac-safe, deterministic. SPACES PRESERVED (not collapsed to '_') —
  // this is the S483 spaces-not-underscores rule that FRT's export follows.
  return String(s==null?'':s)
    .replace(/[\/\\:*?"<>|\u0000-\u001F]/g,'-')  // illegal → hyphen
    .replace(/\s+/g,' ')                          // collapse runs of space
    .replace(/-+/g,'-')                           // collapse runs of hyphen
    .replace(/^[-.\s]+|[-.\s]+$/g,'')             // trim edge punctuation/space
    .trim();
}
function _expClientShort(){
  // ~8 char abbreviation of the client name. "Iron Mountain Canada Corp" → "IronMtn".
  var raw=''; try{ var el=document.getElementById('pi-client'); raw=el?el.value||'':''; }catch(e){}
  if(!raw) return 'Client';
  var words=raw.replace(/[^A-Za-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);
  var abbr='';
  if(words.length>=2){ abbr=words[0].slice(0,4); for(var i=1;i<words.length && abbr.length<8;i++){ abbr+=words[i].slice(0,2); } }
  else { abbr=raw.replace(/[^A-Za-z0-9]/g,''); }
  abbr=_expSanitize(abbr).slice(0,8);
  return abbr||'Client';
}
function _expProjNum(){ try{ var el=document.getElementById('pi-projno'); return _expSanitize(el?el.value||'':'')||'Project'; }catch(e){ return 'Project'; } }
function _expInstance(){ try{ return (typeof CloudSync!=='undefined' && CloudSync.instanceNumber) ? CloudSync.instanceNumber : 1; }catch(e){ return 1; } }
function _expDateISO(d){ try{ return (d?new Date(d):new Date()).toISOString().substring(0,10); }catch(e){ return new Date().toISOString().substring(0,10); } }
function _expFolderName(){
  // Spaces, not underscores (shared-engine parity).
  return _expProjNum()+' '+_expClientShort()+' '+_EXPORT_TOOLCODE+' '+_expInstance()+' '+_expDateISO();
}
function _expItemRef(item){
  // Diesel keeps its OWN vocabulary. Real records already arrive with a badge
  // (D1, G1, Checklist 1.3, 3·Placard, Pump, 3·Flow…); the badge wins. The map
  // below is only a fallback for a record with no badge, and uses DIESEL terms —
  // NOT FRT's "Obs" (Diesel has no observations; findings are Deficiencies D#).
  // Diesel is a single commissioning event: no FRT-style finding round/close
  // lifecycle, so NO status/round tag is applied (that data does not exist here).
  var ref = (item && item.badge) ? item.badge
          : (item && item.type) ? ({flowtest:'FlowTest','flowtest-pld':'FlowTest-PLD',checklist:'Checklist',deficiency:'Deficiency',response:'Response','general-defic':'General',record:'Record',placard:'Placard',pump:'Pump',gauge:'Gauge','gauge-pld':'Gauge'}[item.type]||item.type)
          : 'Photo';
  return _expSanitize(ref).slice(0,40)||'Photo';
}
function _expPhotoBucket(p){
  // Capture-date bucket → { key, label }. Diesel photo .date is a single editable
  // ISO-ish field (no FRT-style parent-inheritance chain — Diesel photos are not
  // nested under carried-forward findings). Bad/missing → "No date" (shared-engine
  // parity; FRT uses the same label).
  var raw=(p && p.date) ? String(p.date).trim() : '';
  if(!raw) return { key:'zzzz-no-date', label:'No date' };
  var dt;
  var dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(dateOnly){ dt=new Date(parseInt(dateOnly[1],10), parseInt(dateOnly[2],10)-1, parseInt(dateOnly[3],10)); }
  else { dt=new Date(raw); }
  if(isNaN(dt.getTime())) return { key:'zzzz-no-date', label:'No date' };
  var yy=dt.getFullYear(), mm=String(dt.getMonth()+1).padStart(2,'0'), dd=String(dt.getDate()).padStart(2,'0');
  return { key: yy+'-'+mm+'-'+dd, label: dt.toLocaleDateString('en-CA',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) };
}
// Marked variant URL for a photo (S366 model: marked baked into p.d when annotated,
// else R2 marked/marked_{id}.jpg in Hub mode). Returns '' if no distinct marked file.
function _expMarkedSrc(p){
  if(!p) return '';
  if(p._annotated && p.d) return p.d;   // strokes baked into the live data URL
  try{
    if(p.id && typeof _r2FolderId!=='undefined' && _r2FolderId && typeof R2Photos!=='undefined' && R2Photos.getUrl){
      return R2Photos.getUrl(_r2FolderId,'diesel','marked','marked_'+_r2Fname(p).replace(/\.jpg$/,'')+'.jpg');
    }
  }catch(_e){}
  return '';
}
async function _expAddImage(folder, src, name, usedNames){
  // De-dupe within the folder; fetch+validate the same way the gallery does so we
  // never zip a corrupt R2 error body as a fake .jpg. Spaces in the de-dupe suffix.
  if(!src) return false;
  var base=name, n=1;
  while(usedNames[folder.root+'/'+name]){ var dot=base.lastIndexOf('.'); name=(dot>0?base.slice(0,dot):base)+' '+(n++)+(dot>0?base.slice(dot):'.jpg'); }
  usedNames[folder.root+'/'+name]=1;
  try{
    if(src.startsWith('data:')){
      var parts=src.split(','); folder.zf.file(name, parts[1], {base64:true}); return true;
    }
    var resp=await fetch(src); if(!resp.ok) throw new Error('HTTP '+resp.status);
    var blob=await resp.blob();
    if(!(await _isRealImageBlob(blob))) throw new Error('not a valid image');
    folder.zf.file(name, blob); return true;
  }catch(e){ console.warn('[export] skip', name, e&&e.message); return false; }
}
function _expReadme(stats){
  var L=[];
  L.push('ARENCON — Diesel Fire Pump Commissioning — Project Export');
  L.push('========================================================');
  L.push('');
  L.push('Project #: '+_expProjNum());
  try{ var pn=document.getElementById('pi-projname'); if(pn&&pn.value) L.push('Project:   '+pn.value); }catch(e){}
  try{ var cl=document.getElementById('pi-client'); if(cl&&cl.value) L.push('Client:    '+cl.value); }catch(e){}
  L.push('Tool:      Diesel Fire Pump Commissioning (code DFP), instance '+_expInstance());
  L.push('Exported:  '+new Date().toLocaleString());
  L.push('Tool ver:  '+_EXPORT_VERSION);
  L.push('');
  L.push('CONTENTS');
  L.push('--------');
  L.push('  '+_expProjNum()+' ... data.json   Full re-loadable report data (photos embedded).');
  L.push('                              Load it back via ⚙️ More → Import JSON.');
  L.push('  photos/<date>/              Photos grouped by capture date.');
  L.push('  photos/No date/             Photos with no/odd capture date.');
  L.push('');
  L.push('PHOTO FILE NAMES');
  L.push('----------------');
  L.push('  <ItemRef> NN.jpg            original photo (NN = counter for that item)');
  L.push('  <ItemRef> NN-marked.jpg     same photo with on-site markup baked in');
  L.push('  ItemRef = where it lives in the report, e.g. Obs-1A (observation/deficiency),');
  L.push('            Checklist-1.3, Placard, Pump, FlowTest.');
  L.push('');
  L.push('TOOL CODES (across the ARENCON toolkit)');
  L.push('---------------------------------------');
  L.push('  FRT Field Review · DFP Diesel Fire Pump · EFP Electric Fire Pump');
  L.push('  IST Integrated Systems Test · OBC OBC Report · DDC DD Checklist');
  L.push('');
  L.push('SUMMARY');
  L.push('-------');
  L.push('  Photos written:  '+stats.added+(stats.skipped?(' (+'+stats.skipped+' unavailable, skipped)'):''));
  L.push('  JSON included:   yes');
  L.push('');
  L.push('Note: this is a snapshot. The JSON is the authoritative re-loadable copy;');
  L.push('the loose photos are a human-browsable convenience copy of the same data.');
  return L.join('\n');
}
function exportProjectDocs(){
  _aConfirm('Export this report as a ZIP (photos + JSON + README)? Nothing in your current work is changed.', function(){
    if(typeof JSZip==='undefined'){
      showToast('Loading exporter...');
      var sc=document.createElement('script');
      sc.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      sc.onload=function(){ _expGo(); };
      sc.onerror=function(){ showToast('Could not load exporter (offline?)'); };
      document.head.appendChild(sc);
    } else { _expGo(); }
  }, 'Export');
}
async function _expGo(){
  try{
    showToast('Building export…');
    var zip=new JSZip();
    var root=_expFolderName();
    var top=zip.folder(root);
    var used={};
    var stats={added:0, skipped:0};

    // 1) Photos — live only (deleted excluded), date-bucketed, original + marked.
    // Counter keyed on the item's SECTION (globally unique: def_<ctr>_<di>, cl_<id>,
    // etc.) — NOT the badge, which can repeat. SPACES in filenames (shared-engine
    // parity). Buckets sorted by date key so folders read chronologically.
    var all=(typeof _collectAllPhotos==='function')? _collectAllPhotos() : [];
    var live=all.filter(function(a){ return !(typeof _isPhotoDeleted==='function' && _isPhotoDeleted(a.photo)); });
    live=live.map(function(it,i){ it._ord=i; return it; }).sort(function(a,b){
      var ak=_expPhotoBucket(a.photo).key, bk=_expPhotoBucket(b.photo).key;
      if(ak<bk) return -1; if(ak>bk) return 1; return a._ord-b._ord;
    });
    var itemCount={};   // section → running NN
    for(var i=0;i<live.length;i++){
      var item=live[i], p=item.photo;
      var bk=_expPhotoBucket(p);
      var bucket=_expSanitize(bk.label)||'No date';
      var ref=_expItemRef(item);
      var sectionKey=(item.section||ref)+'';
      var nn=(itemCount[sectionKey]=(itemCount[sectionKey]||0)+1);
      var nnStr=(nn<10?'0':'')+nn;
      var folderPath=root+'/photos/'+bucket;
      var folder={ zf: top.folder('photos').folder(bucket), root: folderPath };
      var origSrc=_photoSrc(p);
      if(await _expAddImage(folder, origSrc, ref+' '+nnStr+'.jpg', used)) stats.added++; else stats.skipped++;
      var mkSrc=_expMarkedSrc(p);
      if(mkSrc && mkSrc!==origSrc){
        if(await _expAddImage(folder, mkSrc, ref+' '+nnStr+'-marked.jpg', used)) stats.added++;
      }
    }

    // 2) Full JSON (redundant by design — the machine-reloadable copy).
    try{
      var state=collectState();
      var wrapped={ _arenconExport:{ tool:'diesel', toolCode:_EXPORT_TOOLCODE, version:_EXPORT_VERSION,
                     exportedAt:new Date().toISOString(), project:_expProjNum(), instance:_expInstance() },
                    data: state };
      top.file(_expProjNum()+' '+_EXPORT_TOOLCODE+'-'+_expInstance()+' data.json', JSON.stringify(wrapped,null,2));
    }catch(e){ console.warn('[export] JSON failed', e&&e.message); top.file('JSON_EXPORT_FAILED.txt','collectState() failed: '+(e&&e.message)); }

    // 3) README.
    top.file('README.txt', _expReadme(stats));

    var zblob=await zip.generateAsync({type:'blob'});
    var url=URL.createObjectURL(zblob);
    var a=document.createElement('a');
    a.href=url; a.download=root+'.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
    showToast(stats.skipped ? ('Exported — '+stats.added+' photos ('+stats.skipped+' unavailable)') : ('Exported — '+stats.added+' photos + JSON'));
  }catch(e){
    console.error('[export] failed', e);
    showToast('Export failed: '+(e&&e.message||e));
  }
}

// ── Bulk delete ──
function _pgDeleteSelected(){
  var all = _collectAllPhotos();
  var selected = all.filter(function(a){ return _pgSelected.has(a.photo.id||''); });
  if(!selected.length){ showToast('No photos selected'); return; }
  // S264: one confirm for the whole batch (not N prompts). Each item still gets the
  // full treatment — source-array removal + surface re-render + R2 original cleanup.
  _aConfirm('Move '+selected.length+' selected photo(s) to Recently Deleted? You can restore them for '+_TRASH_RETENTION_DAYS+' days.', function(){
    // S337: SOFT delete — flag each in place (no splice, R2 intact). Order doesn't
    // matter since nothing is removed from the arrays; the gallery + origin cards
    // hide deleted photos on re-render.
    selected.forEach(function(item){
      _pgSoftDelete(item.photo);
      if(typeof _pgRerenderSurface==='function') _pgRerenderSurface(item);
    });
    _pgSelected.clear();
    _renderPhotoGallery();
    saveState();
    if(typeof debounceAutosave==='function') debounceAutosave();
    showToast('Moved '+selected.length+' photos to Recently Deleted');
  }, 'Delete');
}
function _pgDeleteOne(ref){
  // S282 B3: resolve by identity at click time — a stale render-time index here
  // could hand deletePhotoEverywhere the WRONG photo (its id-recheck would then
  // "correctly" delete the wrong one).
  var r = _pgResolveRef(ref);
  if(!r){ showToast('Photo not found'); return; }
  // S264: route through the single authoritative delete (confirm + both-surface
  // re-render + R2 cleanup + save). It re-renders the gallery itself.
  deletePhotoEverywhere(r.item);
}
function _pgRemovePhoto(item){
  if(item.type==='flowtest'){
    flowTestPhotos.splice(item.idx, 1);
    renderFlowTestThumbs();
  } else if(item.type==='flowtest-pld'){
    flowTestPhotosPld.splice(item.idx, 1);
    renderFlowTestThumbsPld();
  } else if(item.type==='checklist'){
    var id = item.section.replace('cl_','');
    if(clState[id] && clState[id].photos) clState[id].photos.splice(item.idx, 1);
    // S264: re-render the checklist thumb surface too, so a gallery delete doesn't
    // leave a ghost on the checklist item until the next heartbeat re-render.
    if(typeof refreshItemPhotoUI==='function') refreshItemPhotoUI(id);
    var _pgEl=document.getElementById('pg-'+id); if(_pgEl && typeof renderThumbs==='function') _pgEl.innerHTML=renderThumbs(id);
  } else if(item.type==='deficiency'){
    var parts = item.section.replace('def_','').split('_');
    var ctr = parts.slice(0,-1).join('_'), di = parseInt(parts[parts.length-1]);
    if(deficiencies[ctr] && deficiencies[ctr][di]) deficiencies[ctr][di].photos.splice(item.idx, 1);
    if(typeof renderDeficGroup==='function') renderDeficGroup(ctr);
  } else if(item.type==='response'){
    var parts = item.section.replace('resp_','').split('_');
    var ri = parseInt(parts.pop()), di = parseInt(parts.pop()), ctr = parts.join('_');
    if(deficiencies[ctr] && deficiencies[ctr][di] && deficiencies[ctr][di].responses[ri])
      deficiencies[ctr][di].responses[ri].photos.splice(item.idx, 1);
    if(typeof renderDeficGroup==='function') renderDeficGroup(ctr);
  } else if(item.type==='general-defic'){
    var di = parseInt(item.section.replace('gdef_',''));
    if(generalDeficiencies[di]) generalDeficiencies[di].photos.splice(item.idx, 1);
    if(typeof renderGeneralDeficGroup==='function') renderGeneralDeficGroup();
  } else if(item.type==='gauge'){
    var ri=parseInt(item.section.replace('gauge_std_',''));
    if(stdData[ri] && stdData[ri].photos) stdData[ri].photos.splice(item.idx,1);
    if(typeof renderStdTable==='function') renderStdTable();
  } else if(item.type==='gauge-pld'){
    var ri=parseInt(item.section.replace('gauge_pld_',''));
    if(pldData[ri] && pldData[ri].photos) pldData[ri].photos.splice(item.idx,1);
    if(typeof renderPldTable==='function') renderPldTable();
  } else if(item.type==='record'){
    // S280: record/site photos live in recordPhotos[] — this branch was MISSING,
    // so deleting a site/pump/placard photo from the gallery removed nothing and the
    // photo re-appeared on re-render. item.idx is the direct recordPhotos index.
    if(recordPhotos[item.idx]) recordPhotos.splice(item.idx, 1);
    if(typeof _renderRecordZones==='function') _renderRecordZones();
  }
}

// S337: render-only surface refresh (no splice) — used after a SOFT delete so the
// origin card drops the now-deleted thumb immediately, without removing the slot.
// Mirrors _pgRemovePhoto's re-render calls; the surface renderers themselves skip
// deleted photos (S337), so a plain re-render is enough to hide it.
function _pgRerenderSurface(item){
  try {
    if(item.type==='flowtest'){ if(typeof renderFlowTestThumbs==='function') renderFlowTestThumbs(); }
    else if(item.type==='flowtest-pld'){ if(typeof renderFlowTestThumbsPld==='function') renderFlowTestThumbsPld(); }
    else if(item.type==='checklist'){
      var id = item.section.replace('cl_','');
      if(typeof refreshItemPhotoUI==='function') refreshItemPhotoUI(id);
      var _pgEl=document.getElementById('pg-'+id); if(_pgEl && typeof renderThumbs==='function') _pgEl.innerHTML=renderThumbs(id);
    }
    else if(item.type==='deficiency' || item.type==='response'){
      var parts=item.section.replace(/^(def_|resp_)/,'').split('_');
      var ctr=(item.type==='response')?parts.slice(0,-2).join('_'):parts.slice(0,-1).join('_');
      if(typeof renderDeficGroup==='function') renderDeficGroup(ctr);
      else if(typeof renderDeficGroups==='function') renderDeficGroups();
    }
    else if(item.type==='general-defic'){ if(typeof renderGeneralDeficGroup==='function') renderGeneralDeficGroup(); }
    else if(item.type==='gauge'){ if(typeof renderStdTable==='function') renderStdTable(); }
    else if(item.type==='gauge-pld'){ if(typeof renderPldTable==='function') renderPldTable(); }
    else if(item.type==='record'){ if(typeof _renderRecordZones==='function') _renderRecordZones(); }
  } catch(e){ console.warn('[soft-delete] surface re-render', e); }
}

// ═══ S264: AUTHORITATIVE PHOTO DELETE — single path for EVERY ✕ ═══
// Every photo-delete entry point (gallery tile, checklist thumb, deficiency/response/
// general thumb, site-record tile, flow/gauge) routes through here. It (1) ALWAYS
// confirms, (2) finds the photo by its unique id (not a fragile positional index),
// (3) removes it from its source array AND re-renders both that surface and the gallery
// (no 30s ghost), (4) deletes the R2 original so it doesn't orphan, (5) forces a save.
// `target` may be a collected gallery item (has .type/.section/.idx/.photo) OR a
// {photoId} locator we resolve against _collectAllPhotos by id.
function deletePhotoEverywhere(target, afterFn){
  var item = null;
  var all = (typeof _collectAllPhotos==='function') ? _collectAllPhotos() : [];
  if(target && target.type && target.photo){
    // Re-resolve by id against the live list so .idx is current (guards against a
    // stale index if the arrays shifted since the click was wired).
    var tid = target.photo.id;
    item = tid ? all.filter(function(a){ return a.photo && a.photo.id===tid; })[0] : null;
    if(!item) item = target; // fall back to the passed item if id-match fails
  } else if(target && target.photoId){
    item = all.filter(function(a){ return a.photo && a.photo.id===target.photoId; })[0];
  }
  if(!item){ showToast('Photo not found'); return; }
  /* S616d — when the photo being deleted is a gallery COPY, say so: the
     inspector should know before tapping that the original elsewhere in the
     report is not affected. */
  var _copyNote = (item.photo && item.photo.via === 'gallery-copy')
    ? 'This is a copy placed from the gallery \u2014 the original photo elsewhere in this report is not affected. '
    : '';
  _aConfirm(_copyNote + 'Move this photo to Recently Deleted? You can restore it for '+_TRASH_RETENTION_DAYS+' days.', function(){
    var ph = item.photo;
    // S337: SOFT delete — flag in place, keep the array slot + R2 object intact.
    // The live gallery hides it; Recently Deleted surfaces it; auto-purge or an
    // admin "Delete forever" does the real removal later.
    _pgSoftDelete(ph);
    // re-render every surface that shows this photo so the thumb disappears now
    if(typeof _pgRerenderSurface==='function') _pgRerenderSurface(item);
    if(typeof _renderPhotoGallery==='function') _renderPhotoGallery();
    if(typeof saveState==='function') saveState();
    if(typeof debounceAutosave==='function') debounceAutosave();
    if(afterFn) afterFn();
  }, 'Delete');
}

// ── Photo reassign ──
function _pgReassignSelected(mode){
  /* S616d (Mark) — one button was doing two jobs. 'Move to…' (no arg) keeps the
     S533/S558 relocate semantics for MIS-FILED photos: one record, one stored
     file, relocated. 'Copy to…' (mode==='copy') is for PLACING a photo somewhere
     ADDITIONAL: a true duplicate with its own identity and its own stored file,
     so nothing that ever happens to the copy — deletion included — can reach
     the original. The field failure behind this: a photo "assigned" from the
     gallery into another checklist item was a MOVE, so deleting it at the new
     spot deleted the only record there was. */
  var _copyMode = (mode === 'copy');
  var all = _collectAllPhotos();
  var selected = all.filter(function(a){ return _pgSelected.has(a.photo.id||''); });
  if(!selected.length){ showToast('No photos selected'); return; }
  // Build destination list
  // S533: the three evidence boxes were NOT offered as destinations, so a photo
  // filed in the wrong box could only be fixed by picking the file again. They
  // are ordinary record photos distinguished by a `kind` label, so "moving" one
  // there is a relabel — no copy, no new stored file.
  var dests = ['Site Photos', 'General Pump Photos', 'Pump Placard & PLD Placard', 'PLD Placard (7-pt)',
               'Flow Test (3-pt)', 'Flow Test (PLD)'];
  var _RECDEST = { 'Site Photos':'site', 'General Pump Photos':'pump', 'Pump Placard & PLD Placard':'placard', 'PLD Placard (7-pt)':'placard-pld' };   // S584: labels follow the card retitles; PLD bucket disambiguated
  // S558 (Mark): checklist items were NOT offered as destinations. A photo taken
  // against the wrong checklist line — or filed into Site Photos when it belongs
  // to one — could be moved anywhere EXCEPT the place it usually belongs, which
  // is the commonest mis-file on a commissioning job. Same move semantics as
  // every other destination here: the same record object is relocated, so the
  // stored file never moves and nothing is duplicated.
  // Only items that actually exist in the checklist are offered, and the label
  // carries the item number so two lines can never be confused in the list.
  var _CLDEST = {};
  try{
    Object.keys(clState||{}).forEach(function(cid){
      var n = (typeof _clItemNum==='function') ? _clItemNum(cid) : cid;
      var lbl = 'Checklist ' + n;
      // Guard against two items resolving to the same visible label.
      if(_CLDEST[lbl]) lbl = 'Checklist ' + n + ' (' + cid + ')';
      _CLDEST[lbl] = cid;
      dests.push(lbl);
    });
  }catch(e){ console.warn('[S558] checklist destinations:', e && e.message); }
  Object.keys(deficiencies||{}).forEach(function(ctr){
    (deficiencies[ctr]||[]).forEach(function(d,di){
      dests.push(ctr+' Deficiency #'+(di+1));
    });
  });
  (generalDeficiencies||[]).forEach(function(d,di){
    dests.push('General Deficiency #'+(di+1));
  });
  // Simple modal with select
  var html = '<div style="padding:20px;max-width:400px;"><div style="font-weight:700;font-size:15px;margin-bottom:12px;">'+(_copyMode?'Copy':'Move')+' '+selected.length+' photo(s) to:</div>'
    + (_copyMode
        ? '<div style="font-size:12.5px;color:var(--ink-2,#5E5B68);margin:-6px 0 10px;">Each copy is its own photo — the original stays exactly where it is.</div>'
        : '<div style="font-size:12.5px;color:var(--ink-2,#5E5B68);margin:-6px 0 10px;">The photo is relocated — it leaves its current spot. Use Copy to\u2026 to keep it in both places.</div>')
    + '<select id="_pg_reassign_dest" style="width:100%;padding:8px;font-size:14px;border-radius:6px;border:1.5px solid var(--border);font-family:Calibri,sans-serif;">'
    + dests.map(function(d,i){ return '<option value="'+i+'">'+d+'</option>'; }).join('')
    + '</select></div>';
  _aConfirmHtml(html, function(){
    var destIdx = parseInt(document.getElementById('_pg_reassign_dest').value);
    var dest = dests[destIdx];
    /* ═══ S616d — COPY MODE: a true duplicate, never a shared record ═════════
       Each copy is minted as a brand-new photo: fresh bytes, its own id, and —
       because minting enqueues its own upload keyed by that id — its own
       stored file in the cloud. There is no object in common with the source,
       so no deletion, tombstone, purge or merge acting on the copy can ever
       reach the original. Placement mirrors the move path's destination table
       below rather than refactoring it: that path is field-proven and stays
       byte-identical (same rule as the S532/S616 engine mirrors).
       Bytes come from what the gallery tile itself displays (d, else the
       stored file) — identical source to the per-item Gallery button. If a
       photo's bytes cannot be reached (offline, upload never confirmed), that
       copy is REPORTED as failed, never minted empty. */
    if(_copyMode){
      var _q = selected.slice(), _copied = 0, _cfailed = 0;
      var _placeCopy = function(cp){
        var destKind = _RECDEST[dest];
        if(destKind){ cp.kind = destKind; recordPhotos.push(cp); return true; }
        if(dest === 'Flow Test (3-pt)'){ flowTestPhotos.push(cp); return true; }
        if(dest === 'Flow Test (PLD)'){ flowTestPhotosPld.push(cp); return true; }
        if(_CLDEST[dest]){
          var _cid = _CLDEST[dest];
          if(!clState[_cid]) clState[_cid] = {};
          if(!Array.isArray(clState[_cid].photos)) clState[_cid].photos = [];
          clState[_cid].photos.push(cp); return true;
        }
        if(dest.indexOf('General Deficiency') === 0){
          var gi = parseInt(dest.replace('General Deficiency #',''))-1;
          if(generalDeficiencies[gi]){ if(!generalDeficiencies[gi].photos) generalDeficiencies[gi].photos=[]; generalDeficiencies[gi].photos.push(cp); return true; }
          return false;
        }
        var _ok = false;
        Object.keys(deficiencies).forEach(function(ctr){
          (deficiencies[ctr]||[]).forEach(function(d,di){
            if(dest === ctr+' Deficiency #'+(di+1)){ if(!d.photos) d.photos=[]; d.photos.push(cp); _ok = true; }
          });
        });
        return _ok;
      };
      var _finishCopies = function(){
        if(typeof _renderRecordZones==='function') _renderRecordZones();
        _pgSelected.clear();
        _renderPhotoGallery();
        renderFlowTestThumbs();
        renderFlowTestThumbsPld();
        saveState();
        if(typeof debounceAutosave==='function') debounceAutosave();
        if(_cfailed) showToast('Copied '+_copied+' photo(s) \u00B7 '+_cfailed+' could not be copied');
        else showToast('Copied '+_copied+' photo(s) \u2014 originals untouched');
      };
      var _nextCopy = function(){
        if(!_q.length){ _finishCopies(); return; }
        var item = _q.shift(); var src = item && item.photo;
        var _mintAndPlace = function(dataUrl){
          if(!dataUrl){ _cfailed++; _nextCopy(); return; }
          var cp = ArcPhoto.mint(dataUrl, src.n||'photo.jpg',
            {date: src.date, extra:{caption: src.caption||'', via:'gallery-copy', srcOf: src.id||''}});
          if(_placeCopy(cp)) _copied++; else _cfailed++;
          _nextCopy();
        };
        if(!src){ _cfailed++; _nextCopy(); return; }
        if(src.d){ _mintAndPlace(src.d); return; }
        if(src.r2Url){
          fetch(src.r2Url).then(function(r){ return r.ok ? r.blob() : null; }).then(function(b){
            if(!b){ _mintAndPlace(null); return; }
            var fr = new FileReader();
            fr.onload = function(){ _mintAndPlace(fr.result); };
            fr.onerror = function(){ _mintAndPlace(null); };
            fr.readAsDataURL(b);
          }).catch(function(){ _mintAndPlace(null); });
          return;
        }
        _mintAndPlace(null);
      };
      _nextCopy();
      return;
    }
    // ═══ S533 ROOT-CAUSE FIX — reassign was not a move, it was a bad clone ═══
    // BEFORE: it deep-copied the record, gave the copy a NEW id while leaving the
    // ORIGINAL's r2Key/r2Url in place, then hard-spliced the source. Three faults,
    // each on its own capable of losing a photo:
    //   (a) two records pointed at ONE stored file — the doctrine violation that
    //       caused the 4380.24 loss; any cleanup that judged the old key unused
    //       could delete a file the report still needs.
    //   (b) the source was removed with NO deletion evidence, so another device
    //       still holding it re-introduced it on merge — the photo ends up in two
    //       places at once, one of them wrong.
    //   (c) _pgRemovePhoto splices by item.idx, captured BEFORE any move ran. Move
    //       three photos out of one array and the 2nd and 3rd splices hit whatever
    //       shifted into those slots — silently removing photos nobody selected.
    // AFTER: move the SAME record object. Identity, stored file, tag, caption and
    // markup all travel with it; there is only ever one record per file, so there
    // is nothing to orphan and nothing to resurrect. Source removal is by object
    // identity, so batch moves cannot hit the wrong slot.
    function _spliceRef(arr, ph){
      if(!Array.isArray(arr)) return false;
      var i = arr.indexOf(ph);
      if(i < 0) return false;
      arr.splice(i, 1);
      return true;
    }
    function _detachByRef(item, ph){
      // Mirror of _pgRemovePhoto's container walk, but splicing by identity.
      // recordPhotos is handled by the caller: a record→record move is a relabel.
      if(item.type==='flowtest')            return _spliceRef(flowTestPhotos, ph);
      if(item.type==='flowtest-pld')        return _spliceRef(flowTestPhotosPld, ph);
      if(item.type==='record')              return _spliceRef(recordPhotos, ph);
      if(item.type==='checklist'){
        var cid = item.section.replace('cl_','');
        return !!(clState[cid] && clState[cid].photos && _spliceRef(clState[cid].photos, ph));
      }
      if(item.type==='deficiency'){
        var p1 = item.section.replace('def_','').split('_');
        var c1 = p1.slice(0,-1).join('_'), d1 = parseInt(p1[p1.length-1]);
        return !!(deficiencies[c1] && deficiencies[c1][d1] && _spliceRef(deficiencies[c1][d1].photos, ph));
      }
      if(item.type==='response'){
        var p2 = item.section.replace('resp_','').split('_');
        var r2 = parseInt(p2.pop()), d2 = parseInt(p2.pop()), c2 = p2.join('_');
        return !!(deficiencies[c2] && deficiencies[c2][d2] && deficiencies[c2][d2].responses[r2]
                  && _spliceRef(deficiencies[c2][d2].responses[r2].photos, ph));
      }
      if(item.type==='general-defic'){
        var g1 = parseInt(item.section.replace('gdef_',''));
        return !!(generalDeficiencies[g1] && _spliceRef(generalDeficiencies[g1].photos, ph));
      }
      if(item.type==='gauge'){
        var s1 = parseInt(item.section.replace('gauge_std_',''));
        return !!(stdData[s1] && stdData[s1].photos && _spliceRef(stdData[s1].photos, ph));
      }
      if(item.type==='gauge-pld'){
        var s2 = parseInt(item.section.replace('gauge_pld_',''));
        return !!(pldData[s2] && pldData[s2].photos && _spliceRef(pldData[s2].photos, ph));
      }
      return false;
    }
    var _moved = 0, _failed = 0;
    selected.forEach(function(item){
      var ph = item.photo;
      if(!ph) return;
      var destKind = _RECDEST[dest];
      // 1) Record-box destination. A photo already in recordPhotos only needs its
      //    label changed — no detach, no re-add, so its stored file never moves.
      if(destKind){
        if(item.type==='record'){ ph.kind = destKind; _moved++; return; }
        if(!_detachByRef(item, ph)){ _failed++; return; }
        ph.kind = destKind;
        recordPhotos.push(ph);
        _moved++;
        return;
      }
      // 2) Every other destination: detach FIRST, and only place the photo if the
      //    detach actually found it. A failed detach must never leave the photo in
      //    two lists — that is how a "move" turns into a silent duplicate.
      if(!_detachByRef(item, ph)){ _failed++; return; }
      if(dest === 'Flow Test (3-pt)') flowTestPhotos.push(ph);
      else if(dest === 'Flow Test (PLD)') flowTestPhotosPld.push(ph);
      else if(_CLDEST[dest]){
        // S558: the detach above already succeeded, so the photo is currently in
        // NO list — it must land here or it is lost. Create the array if the item
        // has never held a photo before rather than dropping it on the floor.
        var _cid = _CLDEST[dest];
        if(!clState[_cid]) clState[_cid] = {};
        if(!Array.isArray(clState[_cid].photos)) clState[_cid].photos = [];
        clState[_cid].photos.push(ph);
      }
      else if(dest.indexOf('General Deficiency') === 0){
        var gi = parseInt(dest.replace('General Deficiency #',''))-1;
        if(generalDeficiencies[gi]){ if(!generalDeficiencies[gi].photos) generalDeficiencies[gi].photos=[]; generalDeficiencies[gi].photos.push(ph); }
      } else {
        Object.keys(deficiencies).forEach(function(ctr){
          (deficiencies[ctr]||[]).forEach(function(d,di){
            if(dest === ctr+' Deficiency #'+(di+1)){ if(!d.photos) d.photos=[]; d.photos.push(ph); }
          });
        });
      }
      _moved++;
    });
    if(typeof _renderRecordZones==='function') _renderRecordZones();
    _pgSelected.clear();
    _renderPhotoGallery();
    renderFlowTestThumbs();
    renderFlowTestThumbsPld();
    saveState();
    if(typeof debounceAutosave==='function') debounceAutosave();
    // S533: report what actually moved, not what was selected. A silent
    // discrepancy between the two is exactly how a lost photo goes unnoticed.
    if(_failed) showToast('Moved '+_moved+' photo(s) · '+_failed+' could not be located');
    else showToast('Moved '+_moved+' photo(s)');
  }, _copyMode ? 'Copy' : 'Move');
}




// ═══════════════════════════════════════════════════════════════════════════
// S533 — UNRENDERABLE PHOTO WATCH (the "photo silently ceased to exist" case)
// ---------------------------------------------------------------------------
// A photo record can survive while its IMAGE does not: the bytes were dropped
// from the cloud payload after an upload that never actually confirmed, the
// device that held the only copy stopped syncing, or an R2 object went missing.
// The record still counts in the badge and still occupies a tile, so nothing
// looks wrong — the loss is only discovered when the report is assembled, often
// weeks later. FRT surfaces this class through the shared engine's photo-attention
// hook; Diesel could NOT, because Diesel keeps its own upload queue and passes
// BinaryOutbox:null, so that sweep never runs here at all. This is Diesel's own
// equivalent, deliberately using the SAME resolver the UI uses to paint a photo
// (_photoSrc) rather than a second opinion about what "has an image" means — a
// separate rule would drift and produce false alarms, which is worse than none.
// Read-only: it counts and reports, it never deletes, repairs or uploads.
var _phWatchTimer = null, _phWatchDismissed = false;
function _phAttentionSweep(){
  try{
    if(typeof _collectAllPhotos!=='function' || typeof _photoSrc!=='function') return 0;
    var all = _collectAllPhotos();
    var n = 0;
    all.forEach(function(it){
      var p = it && it.photo;
      if(!p) return;
      if(!_photoSrc(p)) n++;
    });
    _phRenderBanner(n);
    return n;
  }catch(e){ console.warn('[S533] photo watch skipped:', e && e.message); return 0; }
}
function _phRenderBanner(n){
  var el = document.getElementById('dslPhotoAttention');
  if(!n || _phWatchDismissed){ if(el) el.style.display='none'; return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'dslPhotoAttention';
    // Inline styles only — this must render even if a stylesheet failed to load,
    // which is one of the states in which photos go missing in the first place.
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99998;'
      + 'background:#C98A4A;color:#fff;font-family:Calibri,sans-serif;font-size:14px;'
      + 'font-weight:700;padding:11px 46px 11px 16px;text-align:center;'
      + 'box-shadow:0 -3px 14px rgba(0,0,0,.30);';
    var x = document.createElement('button');
    x.textContent = '\u2715';
    x.title = 'Dismiss';
    x.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);'
      + 'background:transparent;border:none;color:#fff;font-size:17px;cursor:pointer;'
      + 'width:30px;height:30px;line-height:30px;padding:0;';
    x.onclick = function(){ _phWatchDismissed = true; el.style.display='none'; };
    el.appendChild(x);
    var txt = document.createElement('span');
    txt.id = 'dslPhotoAttentionTxt';
    el.insertBefore(txt, x);
    document.body.appendChild(el);
  }
  var t = document.getElementById('dslPhotoAttentionTxt');
  if(t) t.textContent = n + (n===1 ? ' photo in this report has no image on this device'
                                   : ' photos in this report have no image on this device')
                          + ' \u2014 do not delete them; check the device that took them is still syncing.';
  el.style.display = 'block';
}
function _phStartWatch(){
  if(_phWatchTimer) return;
  // First pass late enough that the initial load and any first cloud apply have
  // settled — an early pass would flag photos that simply have not arrived yet.
  setTimeout(function(){ _phAttentionSweep(); }, 20000);
  _phWatchTimer = setInterval(function(){ _phAttentionSweep(); }, 120000);
}
if(typeof window!=='undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _phStartWatch);
  else _phStartWatch();
}
