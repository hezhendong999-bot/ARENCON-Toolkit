
// S263: last-sync ticker — ported display from FRT ("last sync: Xm ago"), self-contained.
var _lastSyncTs = 0, _lastSyncTimer = null;
function _fmtSyncAgo(ms){
  var s = Math.floor((Date.now() - ms) / 1000);
  if(s < 10) return 'just now';
  if(s < 60) return s + 's ago';
  var m = Math.floor(s / 60);
  if(m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if(h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
function _renderLastSync(){
  var el = document.getElementById('last-sync-text');
  if(!el) return;
  if(!_lastSyncTs){ el.style.display = 'none'; return; }
  el.textContent = 'last sync: ' + _fmtSyncAgo(_lastSyncTs);
  el.style.display = '';
}
function _startLastSyncTicker(){
  if(_lastSyncTimer) return;
  _lastSyncTimer = setInterval(_renderLastSync, 30000);
}
// S265: inspector chip — ported from FRT. Identity = signed-in user (profiles.full_name),
// shared localStorage key 'ARENCON_FR_Inspector' so FRT and diesel show the SAME name.
var LS_INSPECTOR = 'ARENCON_FR_Inspector';
function getInspectorName(){ return localStorage.getItem(LS_INSPECTOR) || ''; }
function _updateInspectorChip(){
  var _c = window.__dslHeaderCtl;
  if(_c) _c.setInspector({ name: '\uD83D\uDC64 ' + (getInspectorName() || 'Set Name') });
}
window._dslInspectorLocked = false;
function _lockInspectorChip(name){
  /* S488: sealed header — the lock is a flag now (the chip's class lived in the
     light DOM). _showInspectorModal reads it below. */
  window._dslInspectorLocked = true;
}
// Hub mode: identity is auto-derived and locked. Standalone: free-form edit.
function _showInspectorModal(){
  if(window._dslInspectorLocked){
    var cur = getInspectorName();
    showToast('Inspector is set from your account: ' + (cur || 'unknown') + ' — sign out to change it', 2500);
    return;
  }
  var current = getInspectorName();
  var v = prompt('Inspector name:', current);
  if(v !== null){
    localStorage.setItem(LS_INSPECTOR, v.trim());
    _updateInspectorChip();
  }
}
// Derive the signed-in user's real name (profiles.full_name > user_metadata > email prefix),
// write the shared key, update + lock the chip. Mirrors FRT app.js exactly.
function _deriveInspectorIdentity(userId){
  if(!userId) return;
  CloudSync.request('/rest/v1/profiles?id=eq.' + userId + '&select=full_name,role').then(function(rows){
    // S365: also cache the role so the admin-gated "Delete forever" works. The
    // gate reads localStorage.ARENCON_role, which the Hub doesn't always write
    // on every device — so principals were wrongly blocked. Source it from the
    // logged-in user's own profile here.
    try{
      var role = (rows && rows[0] && rows[0].role) ? String(rows[0].role).trim() : '';
      if(role) localStorage.setItem('ARENCON_role', role);
    }catch(_e){}
    var fullName = (rows && rows[0] && rows[0].full_name) ? String(rows[0].full_name).trim() : '';
    if(fullName){ _applyInspectorName(fullName); return; }
    // Fallback: user_metadata.full_name, then email prefix
    CloudSync.request('/auth/v1/user').then(function(user){
      var meta = (user && user.user_metadata) || {};
      var nm = (meta.full_name || '').trim();
      if(!nm && user && user.email) nm = user.email.split('@')[0].toUpperCase();
      if(nm) _applyInspectorName(nm);
    }).catch(function(){});
  }).catch(function(){});
}
function _applyInspectorName(name){
  localStorage.setItem(LS_INSPECTOR, name);
  _updateInspectorChip();
  _lockInspectorChip(name);
}
function initDarkMode(){var s=localStorage.getItem('ARENCON_Dark');if(s==='1'||(s===null&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.body.classList.add('dark-mode');updateDarkToggleIcon();}
function toggleDarkMode(){document.body.classList.toggle('dark-mode');localStorage.setItem('ARENCON_Dark',document.body.classList.contains('dark-mode')?'1':'0');updateDarkToggleIcon();if(typeof applyChartDarkMode==='function')applyChartDarkMode();_refreshDarkButtons();}
/* S497: _DT_SUN/_DT_MOON deleted. Dead since S488 — the sealed header engine owns the sun/moon artwork (updateDarkToggleIcon delegates to __dslHeaderCtl.setTheme). Lib-grep before deletion: only a prose comment in lib/ui/headerEngine.js (v1) mentions them; Diesel runs headerEngine2. Two ~32KB base64 blobs removed. */
function updateDarkToggleIcon(){/* S488: sealed engine owns the sun/moon artwork (swaps on setTheme); shim keeps legacy call sites working. S497: also mirror the mode onto <html data-theme> — the sealed DIALOG engine reads documentElement[data-theme] (and follows live flips via MutationObserver), while Diesel historically only toggled body.dark-mode. Without the mirror every dialog would render light in dark mode. */var _dk=document.body.classList.contains('dark-mode');try{document.documentElement.setAttribute('data-theme',_dk?'dark':'light');}catch(_){}var c=window.__dslHeaderCtl;if(c&&c.setTheme)c.setTheme(_dk?'dark':'light');}
function _refreshDarkButtons(){
  // Re-apply pump test type buttons with correct dark/light colors
  var _ri=document.querySelector('input[name="pump-test-type"]:checked');
  var ptype=_ri?_ri.value:'std';
  if(!_ri){document.querySelectorAll('.pump-type-btns button').forEach(function(b){if(b.classList.contains('on'))ptype=b.dataset.ptype;});}
  // Guarded: if setPumpTestType throws, the sketch/signature repaints below
  // must still run (a thrown error here previously blocked signature recolour).
  try { if(typeof setPumpTestType==='function') setPumpTestType(ptype); } catch(e){ console.warn('setPumpTestType in dark toggle:',e); }
  // B3: sketch canvases paint their own background in _skRedraw, so a dark-mode
  // toggle must repaint every sketch or a stale white/dark fill persists.
  try { if(typeof _skStrokes!=='undefined'){ Object.keys(_skStrokes).forEach(function(uid){ if(typeof _skRedraw==='function') _skRedraw(uid); }); } } catch(e){}
  // B2 (Option B): signatures are stored as vector strokes — repaint them in the
  // new theme's ink colour so EXISTING signatures stay visible after a toggle.
  try { if(typeof _sigRepaintAll==='function') _sigRepaintAll(); } catch(e){}
}
initDarkMode();
// ── Custom modals — callback-based replacements for confirm/prompt/alert ──
// S341b: shared Cancel-button style — muted-burgundy ghost matching FRT's
// .btn-muted-cancel (Mark: all Cancel buttons consistent across tools). Light:
// faint burgundy fill, #A85959 text/ring. Dark: #2e1a1a fill, #e08080 text.
/* S497 batch 1: _acCancelStyle/_acOkStyle deleted (declared to the gate).
   They built inline button styles for the hand-drawn dialog chrome; every
   consumer is now on the sealed engine (the last, _aConfirmHtml, moved to
   the panel family), so the engine stylesheet owns button appearance
   everywhere. */
function _aConfirm(msg,onOk,okText){
  /* S497 (Modal Unification Wave 3, design Mark-approved S488): delegates to the
     sealed dialog engine — the host no longer draws dialog chrome. Signature is
     load-bearing: lib/ui/lightbox.js calls _aConfirm(msg,fn,okText) by name
     (host contract, protected_symbols.txt). The S341c intent-aware colour rule
     is preserved: the accent is derived from the button LABEL, so destructive
     actions stay the danger colour automatically. Fail-safe: if the engine is
     absent the action is BLOCKED, never auto-confirmed. */
  var D=window.ArenconDlg;
  if(!D){ try{ console.error('[Diesel] dialog engine not loaded \u2014 action blocked for safety:', msg); }catch(_){} return; }
  var t=String(okText||'').toLowerCase();
  var accent=/\b(delete|reset|revert|remove|clear|purge|discard|wipe|erase)\b/.test(t)?'fail'
            :/\b(save|confirm|apply|ok|yes|proceed|continue|create|add|done|submit|mark)\b/.test(t)?'ok':'info';
  var def=(window.ArenconDlgDef?window.ArenconDlgDef('confirm'):{icon:'?'});
  D.confirm({ title:'Confirm', icon:def.icon, accent:accent, message:msg,
              confirmText:(okText||'OK'), onConfirm:onOk });
}
// S341c → S497 batch 1: rich-HTML dialog for INTERNAL, pre-built markup
// (diagnostics, logs). Phase 3 left this host-drawn because the engine had no
// custom-body family; Mark ordered the modal migration, the engine gained
// panel (v1.2.0), and this became a thin delegate.
function _aConfirmHtml(htmlMsg, onOk, okText){
  /* S497 batch 1: thin delegate to the engine's panel family (v1.2.0) — the
     family whose absence kept this host-drawn in Phase 3. Trust contract
     unchanged: TRUSTED internal markup only (diagnostics, logs), never user
     input; the caller owns escaping. With this, the last producer of
     ._a-modal-ov is gone — tier 2b of _tieredBack matches zero elements and
     stays only as a harmless safety net. */
  var D=window.ArenconDlg;
  if(!D||!D.panel){ try{ console.error('[Diesel] dialog engine not loaded \u2014 diagnostics panel unavailable'); }catch(_){} return; }
  var buttons = onOk
    ? [{label:'Cancel', kind:'cancel'},
       {label:(okText||'OK'), kind:'primary', onClick:function(api){ api.close('ok'); onOk(); return false; }}]
    : [{label:(okText||'Close'), kind:'cancel'}];
  D.panel({
    title:'Details',
    icon:'\u2263', accent:'slate', width:640,
    build:function(bd){ var d=document.createElement('div'); d.innerHTML=htmlMsg; bd.appendChild(d); },
    buttons:buttons
  });
}
function _aPrompt(msg,defVal,onOk){
  /* S497: sealed-engine prompt. Behaviour note: the engine trims the submitted
     value (host version passed it raw) — both call sites are annotation text,
     where a trim is an improvement, not a change of meaning. */
  var D=window.ArenconDlg;
  if(!D){ try{ console.error('[Diesel] dialog engine not loaded \u2014 prompt unavailable'); }catch(_){} return; }
  var def=(window.ArenconDlgDef?window.ArenconDlgDef('prompt'):{icon:'\u270E',accent:'info'});
  D.prompt({ title:'Enter a value', icon:def.icon, accent:def.accent||'info',
             message:msg, value:(defVal||''), confirmText:'OK', onSubmit:onOk });
}
// S341b: TYPE-TO-CONFIRM modal for destructive mass actions (Mark's rule: no
// mass-delete without typing). Confirm stays disabled until the user types the
// required word (case-insensitive, trimmed). Reused later by the safe-load
// REPLACE door. Cancel uses the canonical muted-burgundy; confirm is destructive red.
function _aTypeConfirm(msg, requiredWord, onOk, okText){
  /* S497: sealed-engine typeToConfirm (guards the reset-all / reset-page mass
     wipes — Mark's S341b rule: no mass-delete without typing). Behaviour note:
     the engine matches the phrase EXACTLY (case-sensitive); the host version was
     case-insensitive. Both live call sites use the lowercase word 'reset', which
     the dialog itself displays, so the practical impact is nil — flagged in the
     handoff regardless. */
  var D=window.ArenconDlg;
  if(!D){ try{ console.error('[Diesel] dialog engine not loaded \u2014 action blocked for safety'); }catch(_){} return; }
  D.typeToConfirm({ title:'This cannot be undone', message:msg,
                    phrase:String(requiredWord||'reset'),
                    confirmText:(okText||'Confirm'), onConfirm:onOk });
}
function _aAlert(msg){
  /* S497: sealed-engine alert. Fail-safe: engine absent -> console, never lost. */
  var D=window.ArenconDlg;
  if(!D){ try{ console.error('[Diesel] dialog engine not loaded \u2014 alert:', msg); }catch(_){} return; }
  var def=(window.ArenconDlgDef?window.ArenconDlgDef('alert'):{icon:'i',accent:'info'});
  D.alert({ title:'Notice', icon:def.icon, accent:def.accent||'info', message:msg });
}
function _escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function _escAttr(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function openMobileMenu(){
  /* S488: Diesel's hand-built mobile menu is retired — the sealed engine drawer
     is the single implementation across all tools. */
  var _c=window.__dslHeaderCtl; if(_c){ _c.openDrawer(); return; }
  var ha=document.querySelector('.header-actions');
  var bd=document.getElementById('mobile-menu-backdrop');
  // S266: the drawer lives inside .app-header, which has backdrop-filter:blur + z-index:5000.
  // That ancestor creates a stacking context AND a containing block that traps the fixed-position
  // drawer (rendering it BEHIND the body). Move the drawer to <body> on open so it escapes the
  // trap and overlays everything; restore it on close so the desktop header is unchanged.
  if(ha){
    if(!ha._origParent){ ha._origParent=ha.parentNode; ha._origNext=ha.nextSibling; }
    document.body.appendChild(ha);
    ha.classList.add('mobile-open');
  }
  if(bd)bd.style.display='block';
}
function goBackToHub(){
  var pp=new URLSearchParams(window.location.search);
  var proj=pp.get('project');
  var hubUrl='../ARENCON_Project_Hub.html'+(proj?('?project='+proj):'');
  // S264: Hub mode → force a full save then navigate (no prompt). Standalone → just go.
  if(proj && typeof _saveThenLeave==='function'){ _saveThenLeave(hubUrl); }
  else { window.location.href=hubUrl; }
}

/* ═══ S332: TIERED BACK — swipe/back gesture peels one layer, never throws you out ═══
   The TWA/browser edge-swipe fires history-back, which used to unload the tool.
   We trap it: a guard history entry sits in front of the page, so the gesture
   pops the guard instead of leaving. _tieredBack() then closes the topmost open
   layer (modal → viewer → menu) and we re-push the guard. Only when nothing is
   open does back behave like the ← Back button (save → project detail).
   Layers are peeled outermost-priority first; each call closes exactly one. */
function _tieredBack(){
  // 1. Photo-selection modal (sits above export modal)
  var ppx=document.getElementById('ppx-ov');
  if(ppx){ if(typeof _ppxClose==='function')_ppxClose(); else ppx.remove(); return true; }
  // 2. S497: sealed-engine dialogs (Modal Unification Wave 3). The engine owns
  //    its own teardown (scrim animation + scroll unlock), so we must NEVER
  //    remove its host element directly — that would strand the scroll lock.
  //    Its Esc handler listens on document; a synthetic Escape closes it cleanly.
  //    S497 batch 1: NON-DISMISSABLE dialogs (card.no-x — the instance hard
  //    block, progress) are deliberately Esc-proof; dispatching Escape would do
  //    nothing and `return true` would swallow the back gesture forever. For
  //    those, fall THROUGH so back keeps its page-leave meaning. Shadow root
  //    is open-mode, so the card is inspectable from the host.
  var eng=document.querySelector('div[data-arencon-dialog]');
  if(eng){
    var _nx=false; try{ _nx=!!(eng.shadowRoot&&eng.shadowRoot.querySelector('.card.no-x')); }catch(_){}
    if(!_nx){ try{ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); }catch(_){ } return true; }
  }
  // 2b. Legacy _a-modal-ov modals (only _aConfirmHtml still draws these)
  var am=document.querySelectorAll('._a-modal-ov');
  if(am.length){ am[am.length-1].remove(); return true; }
  // 3. Export modal — S498: now an engine panel, so tier 2a above already
  // caught it (Esc dispatch) and this never matches. Kept as a harmless net
  // in case a stale cached copy of the old overlay is still in the DOM.
  var exm=document.getElementById('exm-ov');
  if(exm && exm.parentNode===document.body){ exm.remove(); return true; }
  // 3b. Issue/Report-Status modal (S366)
  var ism=document.getElementById('issue-modal-overlay');
  if(ism){ ism.remove(); return true; }
  // 3c. Photo reuse-picker (S366)
  var rpk=document.getElementById('reuse-picker-ov');
  if(rpk){ if(typeof _closePhotoReusePicker==='function')_closePhotoReusePicker(); else rpk.remove(); return true; }
  // 4. Flow-photo gallery
  var fpm=document.getElementById('fpm-gallery');
  if(fpm){ if(typeof _flowPhotoCloseGallery==='function')_flowPhotoCloseGallery(); else fpm.remove(); return true; }
  // 5. Lightbox / drawing viewer (owns its own internal tiering)
  try{ if(window.DslLightbox && DslLightbox.isOpen && DslLightbox.isOpen()){ return DslLightbox.handleBack(); } }catch(e){}
  // 6. Fullscreen chart
  if(typeof _figFsActive!=='undefined' && _figFsActive){ _closeChartFS(); return true; }
  // 7. Reports dropdown menu
  var rm=document.getElementById('reports-menu');
  if(rm && rm.classList.contains('open')){ if(typeof closeReportsMenu==='function')closeReportsMenu(); else rm.classList.remove('open'); return true; }
  // 8. Mobile hamburger drawer
  var ha=document.querySelector('.header-actions.mobile-open');
  if(ha){ if(typeof closeMobileMenu==='function')closeMobileMenu(); else ha.classList.remove('mobile-open'); return true; }
  // 9. S343: SUMMARY TIER — A-ladder (modal → Summary → Hub). If NOT already on the
  //    Summary (proj) tab, jump straight there in ONE step. No sideways tab-walking
  //    (the old S341 navPage(-1) marched through every sub-tab, which felt wrong).
  //    Only when already on Summary does back fall through to the leave-confirm.
  try{
    var _summaryActive = (function(){
      var el=document.getElementById('panel-proj');
      return el && el.classList.contains('active');
    })();
    if(!_summaryActive && typeof switchPanel==='function'){
      switchPanel('proj');   // collapse straight up to Summary
      return true;
    }
    // already on Summary → fall through to leave (handled in the popstate trap,
    // which now asks for confirmation before actually leaving the report)
  }catch(e){}
  return false; // nothing open AND already on Summary → leave (with confirm)
}
/* ═══ S332/S333: TIERED BACK — swipe/back gesture peels one layer, never throws you out ═══
   The TWA/browser edge-swipe fires history-back, which used to unload the tool.
   We trap it with a *buffer* of guard history entries: back pops a guard instead
   of leaving, _tieredBack() closes the topmost open layer, and we top the buffer
   back up. A single guard was not enough on the Android TWA — when the tool is the
   app's entry page, one back can reach the bottom of the stack where the TWA closes
   the app. So we keep a depth-3 buffer and re-arm after every pop. Only when nothing
   is open does back behave like the ← Back button (save → project detail). */
var _DSL_BACK_DEPTH = 3;
function _backTopUp(){
  try{
    // ensure at least _DSL_BACK_DEPTH guard entries sit in front of the page
    var have = (history.state && history.state._dslGuard) ? history.state._dslGuard : 0;
    while(have < _DSL_BACK_DEPTH){ have++; history.pushState({_dslGuard:have}, ''); }
  }catch(e){}
}
var _dslLeaving=false;
function _installBackTrap(){
  try{
    _backTopUp();
    window.addEventListener('popstate', function(e){
      var handled=_tieredBack();
      _backTopUp();
      if(!handled){
        if(_dslLeaving) return;      // S333: a leave is already in flight (async save) — don't double-navigate
        // S343: on Summary with nothing open → a swipe-back wants to LEAVE the
        // report. Confirm first so a fat-finger gesture can't yank you out of a
        // half-filled form (the OS swipe can't be distance-gated, so the confirm
        // is the deliberate-intent guard). Data is auto-saved either way.
        if(typeof _aConfirm==='function'){
          _aConfirm('Leave this report and return to the project hub? Your work is saved.', function(){
            _dslLeaving=true;
            goBackToHub();
          }, 'Leave');
          // user may cancel — stay put; guard buffer already re-armed above
        } else {
          _dslLeaving=true;
          goBackToHub();
        }
      }
    });
    window.addEventListener('pageshow', function(){ _backTopUp(); });
  }catch(e){}
}
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', _installBackTrap); }
else { _installBackTrap(); }
function closeMobileMenu(){
  var ha=document.querySelector('.header-actions');
  var bd=document.getElementById('mobile-menu-backdrop');
  if(ha){
    ha.classList.remove('mobile-open');
    // Restore the drawer to its original spot in the header (so desktop layout is unchanged).
    if(ha._origParent){
      if(ha._origNext) ha._origParent.insertBefore(ha, ha._origNext);
      else ha._origParent.appendChild(ha);
    }
  }
  if(bd)bd.style.display='none';
}
// S267(C) v3: fullscreen chart viewer — ALWAYS landscape. The chart must never be shown in portrait,
// so when the phone is held portrait we CSS-rotate the chart 90° to fill the screen sideways; when the
// phone is already landscape we show it upright. We rotate an inner "rotor" (not the stage) and size it
// so that after rotation it fills the stage. window._figFsRot (0|90) is read by the annotation drag math
// (_annMove) so dragging labels still moves them the way the eye expects while rotated.
var _figFsActive = null; // {wrap, origParent, origNext, origStyle, chartVar}
window._figFsRot = 0;     // current fullscreen rotation in degrees (0 or 90)
function _figChartByName(n){
  try{
    if(n==='chart3pt') return (typeof chart3pt!=='undefined')?chart3pt:null;
    if(n==='netChart3pt') return (typeof netChart3pt!=='undefined')?netChart3pt:null;
    if(n==='pldChart') return (typeof pldChart!=='undefined')?pldChart:null;
    if(n==='pldNetChart') return (typeof pldNetChart!=='undefined')?pldNetChart:null;
  }catch(e){}
  return null;
}
// Lay out the rotor for the current viewport orientation. Portrait → rotate 90°, rotor sized
// (stageH × stageW) so the rotated box fills the stage. Landscape → no rotation, rotor fills stage.
function _figFsLayout(){
  if(!_figFsActive) return;
  var stage=document.getElementById('fig-fs-stage');
  var rotor=document.getElementById('fig-fs-rotor');
  if(!stage||!rotor) return;
  var sw=stage.clientWidth, sh=stage.clientHeight;
  var portrait = sh >= sw; // taller than wide → rotate the chart to landscape
  if(portrait){
    window._figFsRot = 90;
    // rotor's pre-rotation size = swapped stage dims, centred, then rotated 90° clockwise
    rotor.style.width = sh+'px';
    rotor.style.height = sw+'px';
    rotor.style.position='absolute';
    rotor.style.left='50%'; rotor.style.top='50%';
    rotor.style.transform='translate(-50%,-50%) rotate(90deg)';
    rotor.style.transformOrigin='center center';
  } else {
    window._figFsRot = 0;
    rotor.style.position='absolute';
    rotor.style.width='100%'; rotor.style.height='100%';
    rotor.style.left='0'; rotor.style.top='0';
    rotor.style.transform='none';
  }
}
function _openChartFS(figId, chartVar){
  var ov=document.getElementById('fig-fs-overlay');
  var stage=document.getElementById('fig-fs-stage');
  var canvas=document.getElementById(chartVar);
  if(!ov||!stage||!canvas) return;
  var wrap=canvas.parentElement; // the position:relative;height:NNNpx wrapper
  if(!wrap) return;
  if(_figFsActive) _closeChartFS(); // only one at a time
  var titleTxt='';
  var fig=document.getElementById(figId);
  if(fig){ var t=fig.querySelector('.fig-t'); if(t) titleTxt=t.textContent; }
  var titleEl=document.getElementById('fig-fs-title'); if(titleEl) titleEl.textContent=titleTxt;
  _figFsActive={wrap:wrap, origParent:wrap.parentNode, origNext:wrap.nextSibling, origStyle:wrap.getAttribute('style')||'', chartVar:chartVar};
  // build a fresh rotor inside the stage and move the chart wrapper into it
  stage.innerHTML='';
  var rotor=document.createElement('div');
  rotor.id='fig-fs-rotor';
  stage.appendChild(rotor);
  wrap.setAttribute('style','position:absolute;inset:0;width:100%;height:100%;');
  rotor.appendChild(wrap);
  ov.classList.add('open');
  _figFsLayout();
  function _rs(){ var c=_figChartByName(chartVar); if(c){ try{ c.resize(); c.update('none'); c.render(); if(typeof renderChartAnnotations==='function') renderChartAnnotations(c, chartVar); }catch(e){} } }
  requestAnimationFrame(function(){ _figFsLayout(); _rs(); setTimeout(function(){ _figFsLayout(); _rs(); }, 220); });
}
function _closeChartFS(){
  var ov=document.getElementById('fig-fs-overlay');
  if(ov) ov.classList.remove('open');
  window._figFsRot = 0;
  if(_figFsActive && _figFsActive.wrap && _figFsActive.origParent){
    var w=_figFsActive.wrap;
    w.setAttribute('style', _figFsActive.origStyle); // restore original inline height
    if(_figFsActive.origNext) _figFsActive.origParent.insertBefore(w, _figFsActive.origNext);
    else _figFsActive.origParent.appendChild(w);
    var cv=_figFsActive.chartVar;
    _figFsActive=null;
    var stage=document.getElementById('fig-fs-stage'); if(stage) stage.innerHTML='';
    requestAnimationFrame(function(){ var c=_figChartByName(cv); if(c){ try{ c.resize(); c.update('none'); c.render(); if(typeof renderChartAnnotations==='function') renderChartAnnotations(c, cv); }catch(e){} } });
  } else {
    _figFsActive=null;
  }
}
// Re-layout + resize when the phone is rotated or the window changes while fullscreen is open.
function _figFsOnResize(){
  if(!_figFsActive) return;
  _figFsLayout();
  var c=_figChartByName(_figFsActive.chartVar);
  if(c){ try{ c.resize(); c.update('none'); c.render(); if(typeof renderChartAnnotations==='function') renderChartAnnotations(c, _figFsActive.chartVar); }catch(e){} }
}
window.addEventListener('resize', _figFsOnResize);
window.addEventListener('orientationchange', function(){ setTimeout(_figFsOnResize, 250); });
// Escape closes the fullscreen chart (desktop debug / external keyboards)
document.addEventListener('keydown', function(e){ if(e.key==='Escape' && _figFsActive) _closeChartFS(); });
  