
/* S497 LIVE-BUG FIX (found by the Phase 4 split's tokenizer): the S496 Phase 2
   IIFE-removal stub above ended with its own closing script tag, but the ~8.9KB of host
   code that followed (More/Reports dropdown handlers, session soft-lock and
   sign-out timers, downloadJSON/importJSON — both PROTECTED symbols the sealed
   header engine calls by name — and the text-size cycler) was left OUTSIDE any
   script element, terminated by a now-orphaned closer. Browsers therefore
   rendered it as page text and none of it executed: every More-menu action
   silently no-oped in live since the Phase 2 push. Nothing caught it because
   node --check ran on regex-extracted spans that paired the stub's opener with
   the ORPHAN closer (parsing fine), while the browser pairs the stub's opener
   with the stub's closer. This opener re-encloses the block; the closer below
   is the original one. Region re-verified: single definitions (no later
   copies), node --check clean, and its four CloudSync calls (save /
   stopAutoSave / destroy / isInitialized) all exist on the S496 facade. */


// ═══ MORE DROPDOWN ═══
function _closeOtherHeaderMenus(except){
  // S226c: full mutual exclusion across all three header dropdowns (was partial → multiple open)
  if(except!=='more'){var m=document.getElementById('more-menu');if(m)m.classList.remove('open');}
  if(except!=='reports'){var r=document.getElementById('reports-menu');if(r)r.classList.remove('open');}
  if(except!=='ai'){var a=document.getElementById('ai-mode-menu');if(a)a.classList.remove('open');}
}
function toggleMoreMenu(e){
  if(e)e.stopPropagation();
  var m=document.getElementById('more-menu');if(!m)return;
  _closeOtherHeaderMenus('more'); // mutual exclusion with Reports + AI Review
  var isOpen=m.classList.contains('open');
  m.classList.toggle('open');
  if(!isOpen){document.addEventListener('click',_closeMoreOnClick,{once:true});}
}
function _closeMoreOnClick(){closeMoreMenu();}
function closeMoreMenu(){var m=document.getElementById('more-menu');if(m)m.classList.remove('open');}

// ═══ REPORTS DROPDOWN (Export PDF + Issue) ═══
function toggleReportsMenu(e){
  if(e)e.stopPropagation();
  var m=document.getElementById('reports-menu');if(!m)return;
  _closeOtherHeaderMenus('reports'); // mutual exclusion with More + AI Review
  var isOpen=m.classList.contains('open');
  m.classList.toggle('open');
  if(!isOpen){document.addEventListener('click',_closeReportsOnClick,{once:true});}
}
function _closeReportsOnClick(){closeReportsMenu();}
function closeReportsMenu(){var m=document.getElementById('reports-menu');if(m)m.classList.remove('open');}

// ═══ SIGN OUT ═══
// ═══ TIERED SESSION MANAGEMENT ═══
// Tier 1 — Soft lock:    20 min idle  → blur UI, show "Session Locked" overlay
// Tier 2 — Full sign-out: 8 hr idle  → clear token, redirect to Hub
var _softLockTimer = null;
var _hardSignOutTimer = null;
var _sessionLocked = false;
var SOFT_LOCK_MS  = 20 * 60 * 1000;   // 20 minutes
var HARD_SIGNOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

function _resetSessionTimers() {
  if (_sessionLocked) return;
  clearTimeout(_softLockTimer);
  clearTimeout(_hardSignOutTimer);
  _softLockTimer   = setTimeout(_triggerSoftLock,   SOFT_LOCK_MS);
  _hardSignOutTimer = setTimeout(_triggerHardSignOut, HARD_SIGNOUT_MS);
}

function _triggerSoftLock() {
  if (_sessionLocked || !_csHubMode) return;
  _sessionLocked = true;
  // Auto-save before locking
  try { if(typeof CloudSync!=='undefined'&&CloudSync.isInitialized){var s=_collectCloudState();CloudSync.save(s);} } catch(e){}

  var userName = '';
  try { userName = localStorage.getItem('sb-user-name') || ''; } catch(e){}

  var overlay = document.createElement('div');
  overlay.id = 'soft-lock-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:19000;background:rgba(18,22,32,.88);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-family:Calibri,sans-serif;';

  overlay.innerHTML =
    '<div style="background:#1C2333;border-radius:16px;padding:32px 28px;max-width:400px;width:92%;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,.5);">'
    + '<div style="font-size:32px;margin-bottom:8px;">🔒</div>'
    + '<div style="font-size:19px;font-weight:700;color:white;margin-bottom:4px;">Session Locked</div>'
    + '<div style="font-size:calc(12px + var(--ts));color:rgba(255,255,255,.4);margin-bottom:20px;">Locked after 20 min of inactivity. Work has been saved.</div>'
    + (userName ? '<div style="background:rgba(156,39,66,.18);border:2px solid #9C2742;border-radius:12px;padding:14px 20px;margin-bottom:20px;display:flex;align-items:center;gap:12px;justify-content:center;">'
      + '<div style="width:40px;height:40px;border-radius:50%;background:#9C2742;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">👤</div>'
      + '<div style="text-align:left;"><div style="font-size:calc(11px + var(--ts));color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px;">Locked by</div>'
      + '<div style="font-size:17px;font-weight:700;color:white;">' + userName + '</div></div>'
      + '</div>' : '')
    + '<button id="soft-lock-resume-btn" onclick="window._softLockResume()" '
    + 'style="width:100%;padding:13px;background:#9C2742;color:white;border:none;border-radius:8px;font-size:calc(15px + var(--ts));font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;margin-bottom:16px;">'
    + 'Unlock & Continue' + (userName ? ' as ' + userName : '') + '</button>'
    + '<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;">'
    + '<button onclick="signOutSession()" style="background:none;border:none;color:rgba(255,255,255,.3);font-size:calc(12px + var(--ts));cursor:pointer;font-family:Calibri,sans-serif;">Sign Out</button>'
    + '</div></div>';

  document.body.appendChild(overlay);
  setTimeout(function(){ var btn=document.getElementById('soft-lock-resume-btn'); if(btn)btn.focus(); }, 50);

  var elapsed = Date.now() - (parseInt(localStorage.getItem('ARENCON_lastActivity'))||Date.now());
  var remaining = Math.max(60000, HARD_SIGNOUT_MS - elapsed);
  clearTimeout(_hardSignOutTimer);
  _hardSignOutTimer = setTimeout(_triggerHardSignOut, remaining);
}

window._softLockResume = function() { _dismissSoftLock(); };

function _dismissSoftLock() {
  _sessionLocked = false;
  var ov = document.getElementById('soft-lock-overlay');
  if (ov) ov.remove();
  _resetSessionTimers();
}

function _triggerHardSignOut() {
  try { if(typeof CloudSync!=='undefined'&&CloudSync.isInitialized){var s=_collectCloudState();CloudSync.save(s);} } catch(e){}
  showToast('Session expired — signing out', 2000);
  setTimeout(function(){
    _doSignOut();
  }, 1200);
}

function _doSignOut(){
  clearTimeout(_softLockTimer);
  clearTimeout(_hardSignOutTimer);
  if(window._syncHeartbeatTimer){clearInterval(window._syncHeartbeatTimer);window._syncHeartbeatTimer=null;}
  localStorage.removeItem('sb-access-token');
  localStorage.removeItem('sb-refresh-token');
  localStorage.removeItem('sb-user-name');
  localStorage.removeItem('sb-user-email');
  localStorage.removeItem('ARENCON_lastActivity');
  if(typeof CloudSync!=='undefined'&&CloudSync.isInitialized){
    try{CloudSync.stopAutoSave();CloudSync.destroy();}catch(e){}
  }
  sessionStorage.setItem('ARENCON_signed_out','1');
  window.location.href='ARENCON_Project_Hub.html';
}

function signOutSession(){
  _aConfirm('Sign out and return to Project Hub?',function(){
    _doSignOut();
  },'Sign Out');
}

// ═══ DOWNLOAD JSON (backup) ═══
/* S497 (Mark, field-reported): the JSON backup downloaded as
   "149004_IMCC_610_Sprucewood..._backup.json" — two defects in one line.
   (1) The character filter had no '.' in its allow-list, so project number
       1490.04 was mangled to 149004. FRT's filter (frt/js/export/json.js)
       allows '.' — this was a stale copy that never got the fix. A wrong
       project number on a client deliverable is the serious half.
   (2) The name carried no report identity, so DFP #1 and DFP #2 of the same
       project produced the SAME filename and silently overwrote each other
       in the downloads folder.
   Fixed at root by reusing the identity the PDF cover ALREADY builds
   (_pdfTitle: smart filename + instance + revision). One naming rule per
   report, shared by both outputs, so JSON and PDF cannot disagree again. */
function _dslReportFilename(){
  var sfn = (window._csHubSfn || '').trim();
  if(!sfn){
    // Standalone / pre-Hub boot: rebuild from the fields on screen.
    var pn = (document.getElementById('projnum')||{}).value || '';
    var nm = (document.getElementById('projname')||{}).value || '';
    sfn = (pn + ' ' + nm).trim() || 'Diesel Pump Report';
  }
  var inst = 1;
  try{ if(typeof CloudSync!=='undefined' && CloudSync.instanceNumber) inst = CloudSync.instanceNumber; }catch(_){}
  var rev = '';
  try{ var r=(document.getElementById('revision')||{}).value; if(r) rev=' '+String(r).trim(); }catch(_){}
  var name = sfn + ' DFP#' + inst + rev;
  /* Allow-list matches FRT's json.js EXACTLY — note the '.' that was missing.
     Windows-illegal characters are still excluded. */
  return name.replace(/[^a-zA-Z0-9._\-# ]/g, '_').replace(/\s+/g, ' ').trim();
}
function downloadJSON(){
  _aConfirm('Download a JSON backup of this report?',function(){
    try{
      var state=collectState();
      var json=JSON.stringify(state,null,2);
      var blob=new Blob([json],{type:'application/json'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=_dslReportFilename()+' backup.json';
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }catch(e){showToast('Download failed: '+e.message,3000);}
  },'Download');
}
function importJSON(){
  var inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
  inp.onchange=function(){
    var f=inp.files[0];if(!f)return;
    _aConfirm('Import "'+f.name+'"? This will REPLACE all current data.',function(){
      var r=new FileReader();
      r.onload=function(ev){
        try{
          JSON.parse(ev.target.result); // validate
          _applyLoadedState(ev.target.result);
          showToast('Imported successfully',2000);
          debounceAutosave();
        }catch(e){showToast('Import failed: '+e.message,3000);}
      };
      r.readAsText(f);
    },'Import');
  };
  inp.click();
}
// ═══ TEXT SIZE S/M ═══
// S226c: match FRT exactly — two sizes only. S='Small' maps to text-m (--ts:2px),
// L='Large' maps to text-l (--ts:4px). FRT's "Small" is +2px, NOT the base 0px.
var _appTextSizes=['S','L'];
var _appTextClasses={'S':'text-m','L':'text-l'};
var _appTextLabels={'S':'Small','L':'Large'};
function cycleTextSize(){
  var cur=localStorage.getItem('arencon-text-size');
  if(_appTextSizes.indexOf(cur)<0)cur='S';
  var idx=_appTextSizes.indexOf(cur);
  var next=_appTextSizes[(idx+1)%_appTextSizes.length];
  applyTextSize(next);
  localStorage.setItem('arencon-text-size',next);
}
function applyTextSize(size){
  if(_appTextSizes.indexOf(size)<0)size='S';
  document.body.classList.remove('text-xs','text-m','text-l','text-xl');
  var cls=_appTextClasses[size];
  if(cls)document.body.classList.add(cls);
  var _c=window.__dslHeaderCtl;
  if(_c) _c.setControlIcon('ts', size);
  var mob=document.getElementById('mobile-text-size-btn');
  if(mob)mob.textContent='Text: '+_appTextLabels[size];
}
(function(){var s=localStorage.getItem('arencon-text-size');if(_appTextSizes.indexOf(s)<0)s='S';applyTextSize(s);})();

