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

