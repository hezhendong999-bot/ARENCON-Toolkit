
    import { buildHeader2 } from '/lib/ui/headerEngine2.js';
    import { dieselHeaderConfig } from '/lib/ui/headerConfigs.js';
    import { openCameraBurst } from '/lib/ui/cameraBurst.js';
    /* S496: publish the shared IDB factory for the classic-script ADB module below.
       ADB.open() awaits window.ARENCON_IDB._ready (created during parse) rather than
       probing for the factory — a probe would always lose the race against this
       deferred module block and silently leave Diesel on its inline fallback. */
    import { createIDB } from '/lib/data/idb.js';
    import { createPhotoStore, dataUrlToBlob } from '/lib/data/photoStore.js';
    window.ARENCON_IDB = window.ARENCON_IDB || {};
    window.ARENCON_IDB.createIDB = createIDB;
    if (window.ARENCON_IDB._resolve) window.ARENCON_IDB._resolve(createIDB);
    /* S497 Phase 3 (Modal Unification Wave 3, design Mark-approved S488): the
       sealed dialog engine + shared toast/scrollLock/logo become THE
       implementations for Diesel. The classic-script host keeps its public
       names (_aConfirm/_aAlert/_aPrompt/_aTypeConfirm/showToast/_lockBodyScroll)
       as thin delegates — lib/ui/lightbox.js calls _aConfirm/showToast by name,
       so the names are load-bearing (host contract, protected_symbols.txt).
       All dialog/toast/scroll-lock calls are user-driven (click handlers), so
       this deferred module is always loaded before first use. */
    import Dlg from '/lib/ui/dialogEngine.js';
    import { dialogDefaults } from '/lib/ui/dialogConfigs.js';
    import { toast as _libToast } from '/lib/shared/toast.js';
    import { lockScroll as _libLock, unlockScroll as _libUnlock } from '/lib/shared/scrollLock.js';
    import { ARENCON_LOGO } from '/lib/assets/logo.js';
    window.ArenconDlg = Dlg;
    window.ArenconDlgDef = function(family){ return dialogDefaults('diesel', family); };
    /* S505: shared Help engine + Diesel's own help cards. The engine is locked
       (registered per-tool, never modified here); importing dieselHelpCards runs
       its registerHelp() once. openHelp()/_helpSetDot() live in the classic host
       (part06) and reach the engine through these window handles, exactly as the
       Hub does — a classic function can't see module imports directly. */
    import { mountHelp, hasUnseen, markSeen, hasCards, comingSoonHtml } from '/lib/ui/helpEngine.js';
    import '/lib/ui/dieselHelpCards.js';
    window._helpMount = mountHelp;
    window._helpHasUnseen = hasUnseen;
    window._helpMarkSeen = markSeen;
    window._helpHasCards = hasCards;
    window._helpComingSoon = comingSoonHtml;
    window.ArenconToast = _libToast;
    window.ArenconScroll = { lock: _libLock, unlock: _libUnlock };
    /* One logo, one source: lib/assets/logo.js (full data: prefix included).
       The PDF cover template literal reads this at export time (user-driven,
       long after module load). */
    window.ARENCON_LOGO_B64 = ARENCON_LOGO;
    /* S488 (Mark): FRT's burst camera wired to Diesel. Every camera function in
       this file already probes `typeof _camBurst === 'function'` and falls back
       to the legacy single-shot <input capture> — the hook was pre-built and
       nothing ever defined it. This adapter maps the shared contract
       (openCameraBurst() -> File[] | [] | null) onto the per-file callback the
       ~10 call sites expect: shoot-shoot-shoot-Done feeds each File through the
       caller's normal compress -> ArcPhoto.mint pipeline (which, as of
       photoMint v1.1.0, persists at birth — the pull-to-refresh loss fix). */
    /* S488 (Mark): the burst camera is a HARD REQUIREMENT, not an optional
       upgrade. Every camera fn here probes `typeof _camBurst === 'function'`
       and silently falls back to the one-shot <input capture> — which is why
       the ugly single-shot path ran for months without anyone noticing the
       module was simply never wired. A silent fallback hides a broken build;
       from here the ONLY thing that may fall back is a genuine device refusal
       (no camera / permission denied), and even that says so out loud. */
    window._camBurst = function(onFile){
      /* S488: remember this invocation so the Try-again button re-runs the exact
         same camera request instead of dumping the user back to the form. */
      window.__dslCamLastTarget = function(){ window._camBurst(onFile); };
      openCameraBurst().then(function(files){
        if (files === null){
          /* Genuine device-level refusal. Per the module contract we must NOT
             auto-click a fallback input — the user gesture is gone by now and
             Android Chrome gesture-gates capture inputs (S159). Tell the user
             what to do instead. */
          _dslCamProblem('Camera blocked by the device.',
            'Tap the padlock in the address bar \u2192 Site settings \u2192 Camera \u2192 Allow, then reload. ' +
            'Until then use the Upload or Gallery buttons.');
          return;
        }
        if (!files.length) return;                    /* cancelled — normal */
        files.forEach(function(f){ onFile(f); });     /* burst -> normal pipeline per shot */
      }).catch(function(err){
        _dslCamProblem('Camera failed to start.',
          'Reload the page (Ctrl+Shift+R). If it persists you are offline with a stale app copy \u2014 ' +
          'reconnect once so the app can update. Use Upload or Gallery meanwhile.');
        console.error('[camera] burst failed:', err);
      });
    };
    /* S488 (Mark: "add a refresh/reopen button… or do we have to close the app").
       A blanket Retry is misleading: it works for a stuck camera but does NOTHING
       when permission is permanently blocked, because the browser will not even
       prompt again. So we ASK the browser which case we are in
       (navigator.permissions) and offer only the action that can actually work.
       This is a PWA/browser permission model issue, not a PWA weakness per se —
       a native app hits the same wall; the difference is only where the setting
       lives. Nothing here requires closing the app: worst case is one reload. */
    async function _dslCamState(){
      try {
        if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
        var st = await navigator.permissions.query({ name: 'camera' });
        return st.state;          /* 'granted' | 'prompt' | 'denied' */
      } catch (e) { return 'unknown'; }
    }
    async function _dslCamProblem(title, what){
      /* S497 batch 1: engine panel (v1.2.0). Was a hand-drawn overlay — the ✕,
         theming, touch targets and Esc now come from the shared chrome. The
         three actions are unchanged: Try again (only when not hard-denied),
         Reload (autosave flush FIRST — a reload must never cost the inspector
         unsaved work), and the quiet "use Upload/Gallery instead" exit, which
         is also what Esc/✕ mean here. Module scope: engine imported directly. */
      console.error('[camera] ' + title + ' ' + what);
      var state = await _dslCamState();
      var blocked = (state === 'denied');
      function _escP(t){ var e=document.createElement('span'); e.textContent=String(t==null?'':t); return e.innerHTML; }
      var buttons = [];
      if (!blocked) buttons.push({ label: 'Try again', kind: 'primary', onClick: function(api){
        api.close('retry');
        if (window.__dslCamLastTarget) window.__dslCamLastTarget();
        return false;
      }});
      buttons.push({ label: 'Reload the app', onClick: function(){
        try { if (typeof window._flushAutosave === 'function') window._flushAutosave(); } catch(_){}
        setTimeout(function(){ window.location.reload(); }, 250);
        return false; /* page is going away; keep panel up so nothing flashes */
      }});
      buttons.push({ label: 'Use Upload / Gallery instead', kind: 'cancel' });
      Dlg.panel({
        title: title,
        icon: '\uD83D\uDCF7',
        accent: blocked ? 'fail' : 'warn',
        build: function(bd){
          var d = document.createElement('div');
          /* Trusted internal markup only (bold keywords); `what` is escaped. */
          d.innerHTML = blocked
            ? 'Camera access is <b>blocked</b> for this site, so the app cannot re-ask. ' +
              'Tap the padlock (or \u24D8) in the address bar \u2192 <b>Site settings</b> \u2192 <b>Camera</b> \u2192 <b>Allow</b>, then Reload. ' +
              'On the tablet app: Android <b>Settings \u2192 Apps \u2192 Project Hub \u2192 Permissions \u2192 Camera</b>.'
            : _escP(what) + '<br><br>Most often the camera is still held by another app or a previous shot \u2014 <b>Try again</b> usually clears it.';
          bd.appendChild(d);
        },
        buttons: buttons
      });
    }
    function call(n, ev){ var f = window[n]; if (typeof f === 'function') return f(ev); }
    var cfg = dieselHeaderConfig({
      logoSrc: ARENCON_LOGO,  /* S497: one logo, one source — lib/assets/logo.js */
      onBack: function(){ call('goBackToHub'); },
      onHome: function(){
        var hub = (typeof CloudSync !== 'undefined' && CloudSync.projectId);
        var href = hub ? '../ARENCON_Project_Hub.html' : '../index.html';
        /* S488: save-guard was a click intercept on #logo-link (_wireNavIntercepts) —
           unreachable through the sealed header, which would have silently dropped
           unsaved-work protection. It lives here now. */
        if (hub && typeof _showSaveLeaveModal === 'function'){ _showSaveLeaveModal(href); return; }
        window.location.href = href;
      },
      onUndo: function(){ call('globalUndo'); },
      onRedo: function(){ call('globalRedo'); },
      onInspector: function(){ call('_showInspectorModal'); },
      onAiReviewAll: function(){ if (window.AIAssist) AIAssist.reviewAll('rewrite'); },
      onAiUsage: function(){ if (window.AIUsage) AIUsage.open(); },
      onIssue: function(){ call('issueReport'); },
      onExportPDF: function(){ call('exportPDF'); },
      onDownloadJSON: function(){ call('downloadJSON'); },
      onExportDocs: function(){ call('exportProjectDocs'); },
      onImportJSON: function(){ call('importJSON'); },
      onResetPage: function(){ call('resetCurrentPage'); },
      onResetAll: function(){ call('resetAllPages'); },
      onReupload: function(){ call('_r2ReuploadAll'); },
      onR2Cleanup: function(){ call('_dslOrphanPanel'); },
      onDelDiag: function(){ call('dslDiag'); },
      onPhotoStore: function(){ call('_dslPhotoStoreCheck'); },
      onSaveLog:     function(){ call('_dslSaveLog'); },
      onHelp: function(){ call('openHelp'); },
      onQR: function(){ call('_openToolQR'); },
      onToggleTheme: function(){ call('toggleDarkMode'); },
      onTextSize: function(){ call('cycleTextSize'); },
      onSignout: function(){ call('signOutSession'); }
    });
    window.__dslHeaderCtl = buildHeader2(document.getElementById('hdr-mount'), cfg);
    /* S488: prove the burst module actually arrived. If this module script fails
       to load at all (offline first-run, bad deploy, cache miss on /lib/), the
       whole block including _camBurst never defines and every camera silently
       degrades to one-shot. Announce it instead. */
    if (typeof openCameraBurst !== 'function') {
      console.error('[camera] burst module missing — cameras will be single-shot');
    }

    /* ═══ S548 — the local photo store, built from the shared engine ═══
       Diesel supplies the three things only Diesel knows: its own database, how
       to list every photo in a diesel report, and where it keeps the inline
       copy. Everything else is the shared engine. The names below are the ones
       part06 has always called, so nothing downstream changes.

       ADB is defined in part06 (a classic script, so it exists before this
       module runs) and is read lazily on each call — never captured — because
       ADB.open() is single-flight and may not have completed yet. */
    var _dslPhotoStore = createPhotoStore({
      IDB: {
        get:    function (st, k)  { return window.ADB.get(st, k); },
        put:    function (st, r)  { return window.ADB.put(st, r); },
        getAll: function (st)     { return window.ADB.getAll(st); }
      },
      photoWalk: function () {
        if (typeof window._collectAllPhotos !== 'function') return [];
        return window._collectAllPhotos({ includeDeleted: true, includeBackups: true })
          .map(function (it) { return it && it.photo; })
          .filter(Boolean);
      },
      storeName: 'photoBlobs',
      bytesField: 'd',
      tag: '[S537]'
    });
    window._dslPhotoStore    = _dslPhotoStore;
    window._dataUrlToBlob    = dataUrlToBlob;
    window._stashRoomOk      = function ()   { return _dslPhotoStore.roomOk(); };
    window._stashPhotoBlobs  = function ()   { return _dslPhotoStore.sweep(); };
    window._dieselLocalBytes = function (id) { return _dslPhotoStore.localBytes(id); };
    window._photoStoreReport = function ()   { return _dslPhotoStore.report(); };
    /* S553: the resolver and the per-photo retirement test. Published now and
       used by _photoSrc; nothing is retired yet — the byte-consumers have to be
       routed through resolveSrc first, or they read an empty string. */
    window._dslPhotoResolve  = function (p)  { return _dslPhotoStore.resolveSrc(p); };
    window._dslPhotoRetirable= function (p)  { return _dslPhotoStore.retirable(p); };
    window._dslPhotoRelease  = function ()   { return _dslPhotoStore.release(); };
    window._dslPhotoRetire   = function (n)  { return _dslPhotoStore.retirePass(n); };
    window._dslPhotoHydrate  = function ()   { return _dslPhotoStore.hydratePass(); };

    /* ═══ S561 — R2 ORPHAN REPORT, ON SCREEN ═══
       The report itself (_dieselR2OrphanReport, part06d) is untouched — it
       already returns {bucket, orphans, missing}; it just had no face except
       the console, and the field tablets have no console. Read-only, same as
       the Photo Store Check: the PURGE stays a console operation on purpose.
       Deleting cloud objects is not reversible and belongs at a desk with the
       list in front of you, not behind a tap on site. */
    window._dslOrphanPanel = function () {
      Dlg.panel({
        title: 'Cloud Storage Check', icon: '\uD83E\uDDF9', accent: 'info',
        build: function (bd) {
          var d = document.createElement('div');
          d.innerHTML = 'Checking cloud storage for this project\u2026 this reads every folder and can take a few seconds.';
          bd.appendChild(d);
          var fn = window._dieselR2OrphanReport;
          if (typeof fn !== 'function') { d.innerHTML = '<b>The check is not available in this build.</b>'; return; }
          Promise.resolve(fn()).then(function (r) {
            if (!r) { d.innerHTML = '<b>This check needs the report opened from the Hub.</b><br><br>Standalone mode has no cloud folder to look in.'; return; }
            var orph = (r.orphans || []).length, miss = (r.missing || []).length, total = (r.bucket || []).length;
            var html = '';
            if (!orph && !miss) {
              html += '<b style="color:#2E9E72">Cloud storage is clean.</b><br><br>' +
                      'All <b>' + total + '</b> stored files belong to photos in this report, and every photo\u2019s file is where its record says it is.';
            } else {
              if (miss) {
                html += '<b style="color:#C0445F">' + miss + (miss === 1 ? ' photo record points' : ' photo records point') +
                        ' at a cloud file that is not there.</b><br>' +
                        '<span style="color:#5E5B68">Usually an upload that never finished. The rescue pass re-uploads these from a device that still holds the picture \u2014 if this number does not go down, tell Mark which photos.</span><br><br>';
              }
              if (orph) {
                html += '<b style="color:#C98A4A">' + orph + (orph === 1 ? ' stored file belongs' : ' stored files belong') +
                        ' to no photo in this report.</b><br>' +
                        '<span style="color:#5E5B68">Left behind by deletions and re-uploads. They cost storage, not correctness \u2014 nothing in the report is affected. Removing them is a desk operation, done from the console with the list in view; it is not reversible and is deliberately not a button here.</span><br><br>';
              }
              html += 'Files in cloud storage for this project: <b>' + total + '</b>';
            }
            html += '<br><br><span style="color:#5E5B68">Nothing on this screen changes anything \u2014 it only counts. The full lists are in the console for the desk.</span>';
            d.innerHTML = html;
          }).catch(function (e) {
            d.innerHTML = '<b style="color:#C0445F">The check could not run.</b>' +
                          (e && e.message ? '<br><br><span style="color:#928E9C">' + _esc(String(e.message)) + '</span>' : '');
          });
        },
        buttons: [{ label: 'Close', kind: 'cancel' }]
      });
    };
    /* S560: reconnect retired photos to their device files as soon as the
       report is up — before the first save would do it — otherwise a reload
       shows broken tiles offline for photos the device holds. Late and retried,
       same shape as the rescue kick: opening a report must never wait on it. */
    (function _kickHydrate(tries){
      tries = tries || 0;
      if (tries > 20) return;
      setTimeout(function () {
        var ready = false;
        try { ready = typeof window._collectAllPhotos === 'function' && window._collectAllPhotos().length; } catch(_) {}
        if (!ready) return _kickHydrate(tries + 1);
        try { _dslPhotoStore.hydratePass(); } catch(_) {}
      }, 2500);
    })();

    /* ═══ S555 — WHAT RECENT SAVES CHANGED, on screen ═══
       The 7155.40 wipe looked like every other save from the outside. This puts
       the record where an inspector or Mark can actually read it — on the
       tablet, no console — with anything that lost a lot at once called out.
       Read-only: it reports, it does not undo. */
    window._dslSaveLog = function () {
      Dlg.panel({
        title: 'Recent Saves', icon: '\uD83D\uDCDD', accent: 'info',
        build: function (bd) {
          var d = document.createElement('div');
          d.innerHTML = 'Reading\u2026';
          bd.appendChild(d);
          var J = window._dslJournal;
          if (!J) { d.innerHTML = '<b>No record available on this device yet.</b>'; return; }
          J.history(30).then(function (rows) {
            if (!rows.length) {
              d.innerHTML = '<b>Nothing recorded yet.</b><br><br>The first save after opening a report is the starting point; changes appear from the second save onward.';
              return;
            }
            var html = '';
            var lossy = rows.filter(function (r) { return r.losses && r.losses.length; });
            if (lossy.length) {
              html += '<div style="background:#FDECEF;border:1px solid #E8A9B6;border-radius:8px;padding:10px 12px;margin-bottom:14px;">' +
                      '<b style="color:#C0445F">' + lossy.length + (lossy.length === 1 ? ' save' : ' saves') +
                      ' removed a large amount at once.</b><br>' +
                      '<span style="color:#5E5B68">Marked below. This is the shape a wipe makes \u2014 worth checking those were deliberate.</span></div>';
            } else {
              html += '<div style="color:#2E9E72;font-weight:700;margin-bottom:14px;">No save has removed a large amount at once.</div>';
            }
            rows.forEach(function (r) {
              var t = new Date(r.at);
              var when = t.toLocaleDateString() + ' ' + t.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
              var bad = r.losses && r.losses.length;
              html += '<div style="border-left:3px solid ' + (bad ? '#C0445F' : '#D2CEDB') +
                      ';padding:6px 0 6px 10px;margin-bottom:9px;">' +
                      '<div style="font-size:13px;color:#5E5B68">' + when + (r.by ? ' \u00b7 ' + _esc(r.by) : '') +
                      (r.build ? ' \u00b7 ' + _esc(r.build) : '') + '</div>';
              r.changes.forEach(function (c) {
                var lost = c.from > c.to;
                var flagged = bad && r.losses.some(function (l) { return l.k === c.k; });
                html += '<div style="font-size:14px;' + (flagged ? 'color:#C0445F;font-weight:700' : '') + '">' +
                        _esc(c.k) + ': ' + c.from + ' \u2192 ' + c.to +
                        (flagged ? '  \u25c0 lost ' + (c.from - c.to) : (lost ? '' : '')) + '</div>';
              });
              html += '</div>';
            });
            html += '<div style="color:#5E5B68;font-size:13px;margin-top:10px;">Kept on this device only, most recent 400 saves. Nothing here changes anything.</div>';
            d.innerHTML = html;
          }).catch(function (e) {
            d.innerHTML = '<b style="color:#C0445F">Could not read the record.</b>' +
                          (e && e.message ? '<br><br><span style="color:#928E9C">' + _esc(String(e.message)) + '</span>' : '');
          });
        },
        buttons: [{ label: 'Close', kind: 'cancel' }]
      });
    };

    /* ═══ S549 — PHOTO STORE CHECK, ON SCREEN ═══
       The store keeps a real image file on this device for every photo in the
       report, and that file is the only thing that can put a photo back if its
       cloud copy goes missing. Before the report's own embedded copy is retired,
       somebody has to be able to SEE that the store is keeping up — on the
       tablet that took the photos, because the store is per-device and a desktop
       answers about the desktop.

       Read-only. It counts and reports; it never writes, deletes or uploads. */
    function _esc(t){ var e=document.createElement('span'); e.textContent=String(t==null?'':t); return e.innerHTML; }
    window._dslPhotoStoreCheck = function () {
      Dlg.panel({
        title: 'Photo Store Check',
        icon: '\uD83D\uDCBE',
        accent: 'info',
        build: function (bd) {
          var d = document.createElement('div');
          d.innerHTML = 'Checking this device\u2026';
          bd.appendChild(d);
          _dslPhotoStore.report().then(function (r) {
            /* S550: the honest version. The old panel compared the store against
               every photo in the report and called the rest "not backed up" —
               which read 1 of 223 on Mark's tablet and implied 222 photos were
               at risk. They were not: their pictures are in cloud storage, and a
               device that pulled the report down never had them to copy. */
            var held = r.held || 0, pending = r.pending || 0, cloud = r.cloudOnly || 0;
            var local = held + pending, total = r.inReport || 0;
            var body;
            if (total === 0) {
              body = '<b>This report has no photos yet.</b>';
            } else if (local === 0) {
              body = '<b style="color:#2E9E72">Nothing on this device is waiting.</b><br><br>' +
                     'All <b>' + total + '</b> photos in this report were taken on another device ' +
                     'and their pictures are in cloud storage. There is nothing for this tablet to hold.';
            } else if (pending === 0) {
              body = '<b style="color:#2E9E72">All ' + local + ' photos taken on this device are held here.</b>';
            } else {
              body = '<b style="color:#C98A4A">' + held + ' of ' + local +
                     ' photos taken on this device are held here.</b><br><br>' +
                     '<b>' + pending + '</b> still to copy.';
            }
            if (total > 0) {
              body += '<br><br>' +
                'Taken on this device: <b>' + local + '</b><br>' +
                '&nbsp;&nbsp;\u2022 held as image files here: <b>' + held + '</b><br>' +
                '&nbsp;&nbsp;\u2022 still to copy: <b>' + pending + '</b><br>' +
                'Pictures held only in cloud storage: <b>' + cloud + '</b>';
            }
            if (r.paused) {
              body += '<br><br><b style="color:#C98A4A">Paused \u2014 this device is low on storage.</b><br>' +
                      'Free some space and reopen the report and it will catch up.';
            } else if (pending > 0) {
              body += '<br><br>Copying happens as you work, a few photos at a time. ' +
                      'Carry on and check again shortly.';
            }
            body += '<br><br><span style="color:#5E5B68">Cloud-only photos are normal \u2014 a picture is ' +
                    'removed from the report once it is safely uploaded, which is why this number is ' +
                    'usually the large one. It is not a problem to fix.</span>';
            body += '<br><span style="color:#5E5B68">Nothing on this screen changes anything \u2014 it only counts.</span>';
            d.innerHTML = body;
          }).catch(function (e) {
            d.innerHTML = '<b style="color:#C0445F">The check could not run on this device.</b><br><br>' +
                          'This usually means the photo store did not start. Report photos are unaffected.' +
                          (e && e.message ? '<br><br><span style="color:#928E9C">' + _esc(String(e.message)) + '</span>' : '');
          });
        },
        buttons: [{ label: 'Close', kind: 'cancel' }]
      });
    };
    window.__dslHeaderCtl.setTheme(document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    try { var _ts = localStorage.getItem('ARENCON_TextSize');
      if (_ts) window.__dslHeaderCtl.setControlIcon('ts', _ts); } catch(e){}
    /* S505: paint the Help "?" unseen-dot AFTER the header exists (the button lives
       in the header's shadow root, so it can't be touched at parse time). */
    try { if (typeof _helpSetDot === 'function' && window._helpHasUnseen) _helpSetDot(window._helpHasUnseen('Diesel')); } catch(e){}
  