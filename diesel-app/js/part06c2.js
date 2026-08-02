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
    var _st=collectState();
    var json=JSON.stringify(_st);
    _idbPut(key,json);
    /* S555: record WHAT this save changed. Records only — it does not block or
       alter the save. Reuses the state already collected above, so it costs one
       object walk and no second serialisation. */
    if (window._dslJournal) { try { window._dslJournal.record(_st, 'save'); } catch(e){} }
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
    sketchEntries: sketchEntries.map(e=>({id:e.id||'', comment:e.comment, markupImg:e.markupImg||null})),
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