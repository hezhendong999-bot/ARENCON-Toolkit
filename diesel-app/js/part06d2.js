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
