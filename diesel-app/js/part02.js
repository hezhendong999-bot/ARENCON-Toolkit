
    import { buildHeader2 } from '/lib/ui/headerEngine2.js';
    import { dieselHeaderConfig } from '/lib/ui/headerConfigs.js';
    import { openCameraBurst } from '/lib/ui/cameraBurst.js';
    /* S496: publish the shared IDB factory for the classic-script ADB module below.
       ADB.open() awaits window.ARENCON_IDB._ready (created during parse) rather than
       probing for the factory — a probe would always lose the race against this
       deferred module block and silently leave Diesel on its inline fallback. */
    import { createIDB } from '/lib/data/idb.js';
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
      console.error('[camera] ' + title + ' ' + what);
      var state = await _dslCamState();
      var ov = document.createElement('div');
      ov.id = 'dsl-cam-help';
      ov.style.cssText = 'position:fixed;inset:0;z-index:30000;background:rgba(20,18,26,.72);' +
        'display:flex;align-items:center;justify-content:center;padding:20px;font-family:Calibri,sans-serif;';
      var blocked = (state === 'denied');
      var body = blocked
        ? 'Camera access is <b>blocked</b> for this site, so the app cannot re-ask. ' +
          'Tap the padlock (or \u24D8) in the address bar \u2192 <b>Site settings</b> \u2192 <b>Camera</b> \u2192 <b>Allow</b>, then Reload. ' +
          'On the tablet app: Android <b>Settings \u2192 Apps \u2192 Project Hub \u2192 Permissions \u2192 Camera</b>.'
        : what + '<br><br>Most often the camera is still held by another app or a previous shot \u2014 <b>Try again</b> usually clears it.';
      ov.innerHTML =
        '<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:22px 22px 18px;box-shadow:0 12px 40px rgba(0,0,0,.4);">' +
          '<div style="font-size:17px;font-weight:700;color:#1B1A22;margin-bottom:8px;">\uD83D\uDCF7 ' + title + '</div>' +
          '<div style="font-size:13.5px;line-height:1.6;color:#5E5B68;margin-bottom:18px;">' + body + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            (blocked ? '' : '<button id="dcam-retry" style="padding:11px;border:none;border-radius:9px;background:#2E9E72;color:#fff;font:700 14px Calibri;cursor:pointer;">Try again</button>') +
            '<button id="dcam-reload" style="padding:11px;border:1px solid #D2CEDB;border-radius:9px;background:#EFEDF0;color:#1B1A22;font:600 13px Calibri;cursor:pointer;">Reload the app</button>' +
            '<button id="dcam-close" style="padding:9px;border:none;background:none;color:#928E9C;font:400 12.5px Calibri;cursor:pointer;">Use Upload / Gallery instead</button>' +
          '</div></div>';
      document.body.appendChild(ov);
      var kill = function(){ try { ov.remove(); } catch(_){} };
      var rt = ov.querySelector('#dcam-retry');
      if (rt) rt.addEventListener('click', function(){ kill(); if (window.__dslCamLastTarget) window.__dslCamLastTarget(); });
      ov.querySelector('#dcam-reload').addEventListener('click', function(){
        /* flush first — a reload must never cost the inspector unsaved work */
        try { _flushAutosave(); } catch(_){}
        setTimeout(function(){ window.location.reload(); }, 250);
      });
      ov.querySelector('#dcam-close').addEventListener('click', kill);
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
      onR2Cleanup: function(){ call('_dieselR2OrphanReport'); },
      onDelDiag: function(){ call('dslDiag'); },
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
    window.__dslHeaderCtl.setTheme(document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    try { var _ts = localStorage.getItem('ARENCON_TextSize');
      if (_ts) window.__dslHeaderCtl.setControlIcon('ts', _ts); } catch(e){}
  