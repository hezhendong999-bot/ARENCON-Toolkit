/* ═══════════════════════════════════════════════════════════════════════════
   diesel-app/js/part06d.js — CONTINUATION OF part06.js (S559 split)
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
      // S529 (Mark, FRT field-loss investigation): commit + persist typed text
      // BEFORE the camera takes over the screen. Burst holds every shot in memory
      // until Done, so a long burst is the app's peak-memory moment and the most
      // likely point for Android to kill it. Diesel writes text into state on
      // every keystroke, but the durable write is 700ms behind; a hard OOM kill
      // fires no visibilitychange/pagehide/freeze, so that tail would be lost.
      // Flushing here makes the camera a save point instead of a risk window.
      try { if (typeof _flushAutosave === 'function') _flushAutosave(); } catch (_e) {}
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
  /* S518 — TOAST SPAM ON EVERY OPEN. This fired showToast() PER PHOTO with a
     60-SECOND duration, and toasts stack rather than replace: a report with
     eight cached photos put eight 60s banners on screen, which on a phone
     covers most of the tool every single time it opens. It also violates the
     standing rule — background operations get a subtle indicator, never
     toasts. The prefetch itself is correct and stays; only its reporting
     changes. One quiet header pill (the same surface sync already uses),
     removed when finished, and a single 3s toast ONLY if something actually
     failed — a failure is news, routine caching is not. */
  var _pillId='r2-prefetch-pill';
  function _pill(txt){
    try{
      var host=document.getElementById('cloud-status')||document.querySelector('.app-header');
      if(!host) return;
      var el=document.getElementById(_pillId);
      if(!txt){ if(el&&el.parentNode) el.parentNode.removeChild(el); return; }
      if(!el){
        el=document.createElement('span');
        el.id=_pillId;
        el.style.cssText='margin-left:8px;font:600 11px Calibri,sans-serif;color:var(--ink-3,#928E9C);'
          +'border:1px solid rgba(146,142,156,.35);border-radius:20px;padding:2px 8px;white-space:nowrap;opacity:.85;';
        host.appendChild(el);
      }
      el.textContent=txt;
    }catch(_){}
  }
  _pill('\u2193 offline 0/'+total);
  function _next(){
    if(!queue.length){
      if(done+fail>=total){
        _pill('');
        if(fail) showToast('\u26A0 '+fail+' photo'+(fail!==1?'s':'')+' could not be cached for offline use',3000);
      }
      return;
    }
    var p=queue.shift();
    fetch(p.r2Url).then(function(r){if(!r.ok)throw new Error(r.status);return r.blob();}).then(function(blob){
      var reader=new FileReader();
      reader.onload=function(){p.d=reader.result;done++;_pill('\u2193 offline '+done+'/'+total);_next();};
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
    /* S616c — prefer the per-photo decisions. Older reports carry only the
       one-way exclusion list and are read exactly as before, so nothing about
       an existing report changes on open. */
    if(s.appendixState && typeof s.appendixState==='object' && !Array.isArray(s.appendixState) && typeof _appendixExcl!=='undefined'){
      _appendixExcl = new Set();
      if(typeof _appendixIncl!=='undefined') _appendixIncl = new Set();
      Object.keys(s.appendixState).forEach(function(k){
        var e = s.appendixState[k];
        if(!e) return;
        if(e.status==='out') _appendixExcl.add(k);
        else if(e.status==='in' && typeof _appendixIncl!=='undefined') _appendixIncl.add(k);
      });
    }
    else if(Array.isArray(s.appendixExcluded) && typeof _appendixExcl!=='undefined'){ _appendixExcl = new Set(s.appendixExcluded); }   // S315 F1
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
      /* S582: saved reports count as chosen; only a new-era pre-choice save stays gated. */
      try{ _ttChosen = (s.ttChosen===false) ? false : true; if(typeof _ttApplyGate==='function') _ttApplyGate(); }catch(_e){}
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
    if (s.sigStrokes && typeof _sigStrokes!=='undefined'){ Object.keys(_sigStrokes).forEach(function(k){delete _sigStrokes[k];}); Object.keys(s.sigStrokes).forEach(function(k){ var v=s.sigStrokes[k]; _sigStrokes[k]=(v&&!Array.isArray(v)&&Array.isArray(v.s))?v.s:v; }); }   // S605: unwrap {s:[...]}; legacy bare arrays pass through
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
    /* S606 — the General (no-contractor) group, where recommendations and
       site records live, was the ONE section missing from this list: its data
       has synced since S605 but the screen never redrew it without a reload
       (Mark's "recommendation section doesn't sync at all"). */
    if (typeof renderGeneralDeficGroup === 'function') renderGeneralDeficGroup();
    updateDeficSummary();
    renderAllSignRows();
    /* S606 — repaint every signature pad from the just-applied strokes; the
       rebuilt rows repaint their own pads, the consultant pad needs this. */
    if (typeof _sigRepaintAll === 'function') setTimeout(_sigRepaintAll, 140);
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
  /* S582: a full reset is a NEW report — the test type returns to unset so the
     choice is made again deliberately, not inherited from whatever was there. */
  try{ _ttChosen=false; if(typeof _ttApplyGate==='function') _ttApplyGate(); }catch(_e){}
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
  /* S611 — this unconditional add ran on EVERY load, pushing an empty id-less
     row that collect then minted a DIFFERENT id per device; the merge unioned
     them all — one ghost contractor per device per session (21→32 rows in
     tool_data_history on 03-Aug). Starter row only when there are none. */
  if (!contractorSignRows.length) addContractorSignRow();
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

      /* ═══ S603 — BOOT WATCHDOG (correcting S602's overstated claim) ════════
         S602 moved the loop scheduling earlier — but still INSIDE this promise
         chain, so a startup that never returned (the Android hang) still meant
         no loop, ever. That claim ("nothing can kill it") was wrong upstream.
         init() itself can no longer hang (S603 time-bounds every step), and
         this watchdog is the independent backstop: 20 s after boot begins, if
         the engine has not reported started, arm the save and listening loops
         anyway. Both are idempotent and the tick self-guards, so on a healthy
         device this timer fires into already-running loops and does nothing. */
      setTimeout(function(){
        try {
          if (typeof CloudSync !== 'undefined' && !CloudSync.isInitialized) {
            console.warn('[S603] startup incomplete after 20s — arming sync loops in degraded mode');
            CloudSync.startAutoSave(_collectCloudState, 30000);
            _startHeartbeat();
          }
        } catch(e){ console.warn('[S603] boot watchdog failed:', e && e.message); }
      }, 20000);

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
        /* ═══ S602 — THE SYNC LOOP STARTS FIRST, NOT LAST ═══════════════════
           Until now the save loop and the cloud-listening loop were scheduled
           at the very END of boot: after the cloud load, the merge, the apply,
           the toast and the status badges. Any failure anywhere in that chain
           left a tab that loads, displays, accepts typing and pushes on demand
           — but never listens. A report rendering a badge is cosmetic; a
           device hearing another inspector is not. Scheduled here, in its own
           try/catch, nothing downstream can take it away. The calls at the end
           of the chain are left in place and are harmless: both stop the
           previous timer before starting a new one. */
        try {
          CloudSync.startAutoSave(_collectCloudState, 30000);
          _startHeartbeat();
        } catch(e){ console.warn('[S602] early sync-loop scheduling failed:', e && e.message); }
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
  /* S596 — if this launch was an update swap, put the inspector back on the
     panel and scroll position they were on. No-op on a normal launch. */
  try { setTimeout(function(){ if(typeof _arcRestoreAfterUpdate==='function') _arcRestoreAfterUpdate(); }, 600); } catch(_) {}
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
/* ── S570 — CHANGE JOURNAL, STAGE THREE (the safe half) ─────────────────────
   A save that removed a lot at once used to sit silently in a panel nobody
   opens. It now raises a quiet flag on the More button; opening Recent Saves
   clears it. Deliberately NOT a block, a prompt, or a delay: the threshold
   behind it has not been watched against real inspections, and a guard firing
   on an unwatched rule is how an inspector ends up unable to save on site. The
   server wipe guard remains the hard backstop; this is only a nudge to look.
   Reuses the existing What's-New dot artwork — no new visual language. */
var _DSL_MORE_PLAIN = '\u2699\uFE0F More \u25BE<span class="wn-dot" style="display:none"></span>';
var _DSL_MORE_FLAG  = '\u2699\uFE0F More \u25BE<span class="wn-dot wn-pulse"></span>';
function _dslSetSaveFlag(on){
  try {
    var ctl = window.__dslHeaderCtl;
    if (!ctl || !ctl.setControlIcon) return;
    ctl.setControlIcon('more', on ? _DSL_MORE_FLAG : _DSL_MORE_PLAIN);
  } catch(e){}
}
/* Called after each save records. Guarded end to end — a flag failure must
   never cost a save, and never throws into the save path. */
function _dslCheckSaveFlag(){
  try {
    var J = window._dslJournal;
    if (!J || !J.unreviewedLosses) return;
    J.unreviewedLosses().then(function(rows){
      if (rows && rows.length) _dslSetSaveFlag(true);
    }).catch(function(){});
  } catch(e){}
}
function openHelp(){
  var D = window.ArenconDlg;
  if(!D || !D.panel){ try{ console.error('[help] dialog engine not loaded'); }catch(_){} return; }
  D.panel({
    title:'Help & guide',
    icon:'?', accent:'slate', width:880,
    build:function(bd){
      /* S505d ROOT-CAUSE FIX: the dialog engine is a SEALED SHADOW DOM — host
         stylesheets can never reach this body, which is why the panel rendered
         completely unstyled (full-width giant SVGs, bare text chips). The
         panel's stylesheet must be linked INSIDE the shadow root. CSS custom
         properties still inherit through the boundary, so the host theme vars
         (--arencon/--white/--fg/…) keep light/dark tracking automatically. */
      try {
        var sr = bd.getRootNode();
        if (sr && sr.querySelector && !sr.querySelector('link[data-help-css]')){
          var lk = document.createElement('link');
          lk.rel = 'stylesheet';
          lk.href = '/lib/ui/helpPanel.css?v=505e';
          lk.setAttribute('data-help-css','1');
          sr.appendChild(lk);
        }
      } catch(e){}
      if (window._helpHasCards && window._helpHasCards('Diesel')){
        /* S505f (Mark, standing rule): one panel = one scope, never mixed.
           Diesel declares its scope explicitly rather than relying on only its
           own cards happening to be loaded. */
        window._helpMount(bd, { scope:'Diesel', tab:'wn' });
        try { if (window._helpMarkSeen) window._helpMarkSeen('Diesel'); } catch(_){}
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
  /* S618 — CADENCE. Pause while the tab is hidden and stretch the beat once
     nobody has typed for a while; snap straight back on return or on any
     keystroke. A device holding UNSENT work is exempt and keeps the full beat,
     so backgrounding the app can never strand an inspector's edits. Decides
     only WHEN to check — never what data wins. */
  try{ if(window.ArcSyncCadence && !ArcSyncCadence.shouldTick({hasPendingWork: (typeof CloudSync!=='undefined' && CloudSync.hasPendingSync)})) return; }catch(_){ }
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
        /* ═══ S604 — THE REVERT, caught on camera by tonight's telemetry ═══
           This pass took ANY non-empty local field over the cloud value with
           no stamp comparison — written in S239 to protect a value typed
           seconds ago, but running on EVERY apply. Sequence recorded at
           01:00:48Z on the phone: engine stamp-merge correctly chose cloud
           150 (newer entry); THIS pass put the screen's stale 200 back —
           including its old _ts — and the device then pushed that reverted
           row over the cloud's newer work. That is the 200-vs-150 stalemate.
           Now: when both rows carry entry stamps, the newer ENTRY wins the
           row, whichever side it is on — same doctrine as the engine merge
           it sits behind. Only unstamped legacy rows keep S239 behaviour. */
        var cts = Number(cr._ts)||0, lts = Number(lr._ts)||0;
        if(cts && lts && cts >= lts) return;   // cloud entry same-or-newer: cloud row stands
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



/* ═══════════════════════════════════════════════════════════════════════════
   S563 — PHOTOS TAKEN BEFORE THE PROJECT FOLDER WAS KNOWN GET UPLOADED
   ---------------------------------------------------------------------------
   Found while closing out the placard photo-loss scope. The loss itself was
   already fixed at S488 (ArcPhoto.mint saves and enqueues at birth, so a photo
   is durable the instant it is taken). What that fix could NOT cover is the
   window before the Hub folder is known: _r2EnqueuePhoto returns early when
   _r2FolderId is null, so a photo taken in those first seconds — or in
   standalone mode, before the report is later opened from the Hub — is saved
   locally and then never uploaded by anything.

   It is not lost: it is in the report and on the device. But it lives on ONE
   device, and the rescue pass cannot help it either — that pass only looks at
   photos which already have a cloud key (it verifies keys; a photo with none
   is invisible to it). So it stays a single copy indefinitely, which is the
   exact fragility the whole photo-store effort exists to remove.

   This is the manual "Re-upload All Photos" narrowed to the photos that need
   it and run automatically once the folder IS known. Deliberately narrow:
     - only photos with NO cloud key at all (never re-uploads a stored photo)
     - only photos that still carry their picture (a retired photo has its file
       on the device but no bytes here; it also, by definition, already has a
       confirmed upload, so it can never be in this set)
     - never deleted photos
   Read-then-enqueue only: it does not modify, move or remove anything.
   ═══════════════════════════════════════════════════════════════════════════ */
function _dslUploadUnsentPhotos(){
  if(!_csHubMode || !_r2FolderId || typeof R2Photos==='undefined') return 0;
  if(typeof _r2EnqueuePhoto!=='function') return 0;
  var n = 0;
  function _sweep(arr){
    if(!arr) return;
    arr.forEach(function(p){
      if(!p || p.deleted) return;
      if(p.r2Key) return;                 // already has a home in cloud storage
      if(!p.d) return;                    // no picture here to send
      _r2EnqueuePhoto(p);
      n++;
    });
  }
  try{
    if(typeof clState!=='undefined') Object.keys(clState).forEach(function(k){ if(clState[k]) _sweep(clState[k].photos); });
    if(typeof deficiencies!=='undefined') Object.keys(deficiencies).forEach(function(k){
      (deficiencies[k]||[]).forEach(function(d){
        if(!d) return;
        _sweep(d.photos);
        if(d.responses) d.responses.forEach(function(r){ if(r) _sweep(r.photos); });
      });
    });
    if(typeof generalDeficiencies!=='undefined') generalDeficiencies.forEach(function(d){
      if(!d) return;
      _sweep(d.photos);
      if(d.responses) d.responses.forEach(function(r){ if(r) _sweep(r.photos); });
    });
    if(typeof flowTestPhotos!=='undefined') _sweep(flowTestPhotos);
    if(typeof flowTestPhotosPld!=='undefined') _sweep(flowTestPhotosPld);
    if(typeof recordPhotos!=='undefined') _sweep(recordPhotos);
    if(typeof stdData!=='undefined') stdData.forEach(function(r){ if(r) _sweep(r.photos); });
    if(typeof pldData!=='undefined') pldData.forEach(function(r){ if(r) _sweep(r.photos); });
  }catch(e){ console.warn('[S563] unsent sweep:', e && e.message); return n; }
  if(n){
    console.log('[S563] queued ' + n + ' photo(s) that had never been uploaded (taken before the project folder was known)');
    try{ if(typeof saveState==='function') saveState(); }catch(_e){}
  }
  return n;
}
if(typeof window!=='undefined') window._dslUploadUnsentPhotos = _dslUploadUnsentPhotos;
