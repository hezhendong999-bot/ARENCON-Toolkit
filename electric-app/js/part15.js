
// Wrap CloudSync.save to stamp _cloudSyncedAt for self-trigger prevention
if(typeof _wrapCloudSyncSave==='function') setTimeout(_wrapCloudSyncSave, 2000);
/* ============ AI Text Review (S219) — diesel-adapted port of FRT assistant.js ============ */
/* Reuses the live worker arencon-ai-worker; context.tool='electric_pump'. Inline IIFE (single-file tool). */
var AIAssist = (function(){
  'use strict';
  var WORKER_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co/functions/v1/ai-proxy'; // S397: same Edge relay as placard scan (CORS fix)
  var _busy=false, _panel=null, _overlay=null;
  var _suggestions=[], _processed=0, _accepted=0, _fieldMap={};

  function _esc(s){ return _escHtml(s==null?'':String(s)); }
  function _getToken(){ return localStorage.getItem('sb-access-token') || null; }

  // ── Collect reviewable prose: contractor defics, general defics, checklist notes ──
  function _collectFields(){
    var fields=[]; _fieldMap={};
    // 1+2. Contractor deficiencies: description + per-contractor response comments
    try {
      (typeof contractors!=='undefined'?contractors:[]).forEach(function(name){
        var arr = (typeof deficiencies!=='undefined' && deficiencies[name]) ? deficiencies[name] : [];
        arr.forEach(function(d, di){
          var dn = 'D'+(di+1);
          if (d && d.description && d.description.trim()){
            var fid='c_'+name+'_'+di+'_desc';
            fields.push({ id:fid, label:name+' \u2192 '+dn+' Description', text:d.description.trim() });
            _fieldMap[fid]={ scope:'contractor', name:name, di:di, type:'desc', original:d.description.trim() };
          }
          (d && d.responses ? d.responses : []).forEach(function(r, ci){
            if (r && r.comment && r.comment.trim()){
              var rid='c_'+name+'_'+di+'_resp_'+ci;
              fields.push({ id:rid, label:name+' \u2192 '+dn+' Response '+(ci+1), text:r.comment.trim() });
              _fieldMap[rid]={ scope:'contractor', name:name, di:di, type:'resp', ci:ci, original:r.comment.trim() };
            }
          });
        });
      });
    } catch(e){ console.warn('[AIAssist] contractor collect',e); }
    // 3+4. General deficiencies: description + response comments
    try {
      (typeof generalDeficiencies!=='undefined'?generalDeficiencies:[]).forEach(function(d, di){
        var gn='G'+(di+1);
        if (d && d.description && d.description.trim()){
          var fid='g_'+di+'_desc';
          fields.push({ id:fid, label:'General \u2192 '+gn+' Description', text:d.description.trim() });
          _fieldMap[fid]={ scope:'general', di:di, type:'desc', original:d.description.trim() };
        }
        (d && d.responses ? d.responses : []).forEach(function(r, ci){
          if (r && r.comment && r.comment.trim()){
            var rid='g_'+di+'_resp_'+ci;
            fields.push({ id:rid, label:'General \u2192 '+gn+' Response '+(ci+1), text:r.comment.trim() });
            _fieldMap[rid]={ scope:'general', di:di, type:'resp', ci:ci, original:r.comment.trim() };
          }
        });
      });
    } catch(e){ console.warn('[AIAssist] general collect',e); }
    // 5. Checklist item notes
    try {
      if (typeof clState!=='undefined' && clState){
        Object.keys(clState).forEach(function(id){
          var s=clState[id];
          if (s && s.comment && s.comment.trim()){
            var fid='cl_'+id;
            fields.push({ id:fid, label:'Checklist \u2192 '+id, text:s.comment.trim() });
            _fieldMap[fid]={ scope:'checklist', clid:id, type:'note', original:s.comment.trim() };
          }
        });
      }
    } catch(e){ console.warn('[AIAssist] checklist collect',e); }
    return fields;
  }

  // ── Write accepted suggestion back into the data model + re-render + save ──
  function _writeBack(fm, newText){
    if (!fm) return;
    if (fm.scope==='contractor'){
      var arr=deficiencies[fm.name]; if(!arr||!arr[fm.di]) return;
      if (fm.type==='desc') arr[fm.di].description=newText;
      else if (fm.type==='resp'){ if(arr[fm.di].responses&&arr[fm.di].responses[fm.ci]) arr[fm.di].responses[fm.ci].comment=newText; }
      if (typeof renderDeficGroup==='function') renderDeficGroup(fm.name);
    } else if (fm.scope==='general'){
      if(!generalDeficiencies||!generalDeficiencies[fm.di]) return;
      if (fm.type==='desc') generalDeficiencies[fm.di].description=newText;
      else if (fm.type==='resp'){ if(generalDeficiencies[fm.di].responses&&generalDeficiencies[fm.di].responses[fm.ci]) generalDeficiencies[fm.di].responses[fm.ci].comment=newText; }
      if (typeof renderGeneralDeficGroup==='function') renderGeneralDeficGroup();
    } else if (fm.scope==='checklist'){
      if(!clState[fm.clid]) return;
      clState[fm.clid].comment=newText;
      // refresh the visible textarea in place if present
      var ta=document.querySelector('textarea[oninput*="clState[\''+fm.clid+'\']"]');
      if(ta) ta.value=newText;
    }
    fm.original=newText;
    if (typeof saveState==='function') saveState();
  }

  // ── Word-level diff (LCS) ──
  function _wordDiff(original, improved){
    if (original===improved) return { html:_esc(improved), changed:false };
    var a=original.split(/(\s+)/), b=improved.split(/(\s+)/), m=a.length, n=b.length;
    if (m>200||n>200) return { html:'<span class="ai-diff-del">'+_esc(original)+'</span> <span class="ai-diff-add">'+_esc(improved)+'</span>', changed:true };
    var dp=[],i,j;
    for(i=0;i<=m;i++){dp[i]=[];for(j=0;j<=n;j++)dp[i][j]=0;}
    for(i=1;i<=m;i++)for(j=1;j<=n;j++){ if(a[i-1]===b[j-1])dp[i][j]=dp[i-1][j-1]+1; else dp[i][j]=Math.max(dp[i-1][j],dp[i][j-1]); }
    var result=[]; i=m; j=n;
    while(i>0||j>0){
      if(i>0&&j>0&&a[i-1]===b[j-1]){ result.unshift({type:'same',text:a[i-1]}); i--; j--; }
      else if(j>0&&(i===0||dp[i][j-1]>=dp[i-1][j])){ result.unshift({type:'add',text:b[j-1]}); j--; }
      else { result.unshift({type:'del',text:a[i-1]}); i--; }
    }
    var html='';
    result.forEach(function(r){
      if(r.type==='same') html+=_esc(r.text);
      else if(r.type==='add') html+='<span class="ai-diff-add">'+_esc(r.text)+'</span>';
      else html+='<span class="ai-diff-del">'+_esc(r.text)+'</span>';
    });
    return { html:html, changed:true };
  }

  // ── Panel ──
  function _ensurePanel(){
    if(_panel) return;
    _overlay=document.createElement('div'); _overlay.className='ai-panel-overlay';
    _overlay.addEventListener('click', _closePanel); document.body.appendChild(_overlay);
    _panel=document.createElement('div'); _panel.className='ai-panel';
    _panel.addEventListener('click', function(e){ e.stopPropagation(); });
    _panel.innerHTML='<div class="ai-panel-hdr"><h3>\u2728 AI Review</h3><div class="ai-panel-hdr-btns">'
      +'<button class="ai-btn-accept-all" id="ai-accept-all">Accept All</button>'
      +'<button class="ai-btn-close">\u2715</button></div></div>'
      +'<div class="ai-panel-counter" id="ai-counter"></div>'
      +'<div class="ai-panel-body" id="ai-body"></div>';
    document.body.appendChild(_panel);
    _panel.querySelector('.ai-btn-close').addEventListener('click', _closePanel);
    _panel.querySelector('#ai-accept-all').addEventListener('click', _acceptAll);
  }
  function _openPanel(){ _ensurePanel(); requestAnimationFrame(function(){ _overlay.classList.add('open'); _panel.classList.add('open'); }); }
  function _closePanel(){
    if(_overlay)_overlay.classList.remove('open');
    if(_panel)_panel.classList.remove('open');
    _busy=false; _updateBtn(false);
  }
  function _updateCounter(){
    var el=document.getElementById('ai-counter'); if(!el)return;
    var total=_suggestions.length, remaining=total-_processed;
    if(remaining<=0) el.textContent='\u2714 All done \u2014 '+_accepted+' accepted, '+(total-_accepted)+' skipped';
    else el.textContent=(_processed+1)+' of '+total+' suggestions';
  }
  function _renderSuggestions(suggestions){
    _suggestions=suggestions.filter(function(s){ var fm=_fieldMap[s.id]; return fm && s.improved && s.improved!==fm.original; });
    _processed=0; _accepted=0;
    var body=document.getElementById('ai-body'); if(!body)return;
    body.innerHTML='';
    if(_suggestions.length===0){
      body.innerHTML='<div class="ai-panel-done">\u2714 All text looks good \u2014 no suggestions</div>';
      _updateCounter();
      var aaBtn=document.getElementById('ai-accept-all'); if(aaBtn)aaBtn.style.display='none';
      setTimeout(_closePanel, 3000); return;
    }
    var aaBtn2=document.getElementById('ai-accept-all'); if(aaBtn2)aaBtn2.style.display='';
    _suggestions.forEach(function(s, idx){
      var fm=_fieldMap[s.id]; if(!fm)return;
      var diff=_wordDiff(fm.original, s.improved);
      var div=document.createElement('div'); div.className='ai-suggestion'; div.id='ai-sug-'+idx;
      div.innerHTML='<div class="ai-field-label">'+_esc(fm.label)+'</div>'
        +'<div class="ai-text-box-label">Original</div><div class="ai-text-box">'+_esc(fm.original)+'</div>'
        +'<div class="ai-text-box-label">Suggested</div><div class="ai-text-box">'+diff.html+'</div>'
        +(s.changes && s.changes!=='no changes needed' ? '<div class="ai-changes-note">'+_esc(s.changes)+'</div>' : '')
        +'<div class="ai-suggestion-btns">'
        +'<button class="ai-btn-accept" data-sug-idx="'+idx+'">Accept</button>'
        +'<button class="ai-btn-skip" data-sug-idx="'+idx+'">Skip</button></div>';
      body.appendChild(div);
    });
    body.addEventListener('click', function(e){
      var btn=e.target.closest && e.target.closest('[data-sug-idx]'); if(!btn)return;
      var idx=parseInt(btn.getAttribute('data-sug-idx'),10);
      if(btn.classList.contains('ai-btn-accept')) _accept(idx);
      else if(btn.classList.contains('ai-btn-skip')) _skip(idx);
    });
    _updateCounter();
  }
  function _accept(idx){
    var s=_suggestions[idx]; if(!s)return; var fm=_fieldMap[s.id]; if(!fm)return;
    _writeBack(fm, s.improved);
    var el=document.getElementById('ai-sug-'+idx);
    if(el){ el.classList.add('processed'); var b=el.querySelector('.ai-suggestion-btns'); if(b)b.innerHTML='<span style="color:#5F8068;font-weight:600;">\u2714 Accepted</span>'; }
    _processed++; _accepted++; _updateCounter(); _scrollToNext(idx);
    if(_processed>=_suggestions.length) _finishReview();
  }
  function _skip(idx){
    var el=document.getElementById('ai-sug-'+idx);
    if(el){ el.classList.add('processed'); var b=el.querySelector('.ai-suggestion-btns'); if(b)b.innerHTML='<span style="color:#8A7689;">Skipped</span>'; }
    _processed++; _updateCounter(); _scrollToNext(idx);
    if(_processed>=_suggestions.length) _finishReview();
  }
  function _acceptAll(){ _suggestions.forEach(function(s, idx){ var el=document.getElementById('ai-sug-'+idx); if(el&&!el.classList.contains('processed')) _accept(idx); }); }
  function _scrollToNext(cur){ for(var i=cur+1;i<_suggestions.length;i++){ var el=document.getElementById('ai-sug-'+i); if(el&&!el.classList.contains('processed')){ el.scrollIntoView({behavior:'smooth',block:'start'}); return; } } }
  function _finishReview(){ _updateCounter(); setTimeout(_closePanel, 2500); }

  function _updateBtn(busy, mode){
    var btn=document.getElementById('btn-ai-review'); if(!btn)return;
    if(busy){ btn.disabled=true; btn.innerHTML='<span class="ai-spin-icon">\u2728</span> '+(mode==='quickfix'?'Checking':mode==='shorten'?'Shortening':'Rewriting')+'\u2026'; }
    else { btn.disabled=false; btn.innerHTML='\u2728 AI Review \u25BE'; }
  }

  // ── Field selector ──
  function _showFieldSelector(fields, mode){
    return new Promise(function(resolve){
      var existing=document.getElementById('ai-fs-overlay'); if(existing)existing.remove();
      var overlay=document.createElement('div'); overlay.id='ai-fs-overlay'; overlay.className='ai-fs-overlay';
      var modeLabel=_modeLabel(mode);
      var html='<div class="ai-fs-modal"><div class="ai-fs-header"><h3>\u2728 AI Review \u2014 Select Fields</h3><button class="ai-fs-x" title="Cancel">\u2715</button></div>';
      html+='<div class="ai-fs-subhdr"><span class="ai-fs-mode">'+_esc(modeLabel)+'</span><button class="ai-fs-toggle" data-state="all">Deselect All</button></div>';
      html+='<div class="ai-fs-body">';
      fields.forEach(function(f, i){
        var text=f.text||''; var preview=text.length>140?text.substring(0,140)+'\u2026':text;
        html+='<label class="ai-fs-row"><input type="checkbox" class="ai-fs-check" data-idx="'+i+'" checked><div class="ai-fs-info"><div class="ai-fs-label">'+_esc(f.label)+'</div><div class="ai-fs-preview">'+_esc(preview)+'</div></div></label>';
      });
      html+='</div><div class="ai-fs-footer"><span class="ai-fs-count">'+fields.length+' of '+fields.length+' selected</span><div class="ai-fs-btns"><button class="ai-fs-confirm">Review \u2192</button><button class="ai-fs-cancel">Cancel</button></div></div></div>';
      overlay.innerHTML=html; document.body.appendChild(overlay);
      requestAnimationFrame(function(){ overlay.classList.add('open'); });
      function updateCount(){
        var checks=overlay.querySelectorAll('.ai-fs-check'), cnt=0, k;
        for(k=0;k<checks.length;k++) if(checks[k].checked)cnt++;
        var span=overlay.querySelector('.ai-fs-count'); if(span)span.textContent=cnt+' of '+fields.length+' selected';
        var btn=overlay.querySelector('.ai-fs-confirm'); if(btn){ btn.disabled=cnt===0; btn.textContent='Review '+cnt+' \u2192'; }
        var toggle=overlay.querySelector('.ai-fs-toggle'); if(toggle){ var allOn=cnt===fields.length; toggle.textContent=allOn?'Deselect All':'Select All'; toggle.dataset.state=allOn?'all':'none'; }
      }
      overlay.addEventListener('change', function(e){ if(e.target.classList && e.target.classList.contains('ai-fs-check')) updateCount(); });
      overlay.querySelector('.ai-fs-toggle').addEventListener('click', function(){
        var checks=overlay.querySelectorAll('.ai-fs-check'), allOn=true, k;
        for(k=0;k<checks.length;k++) if(!checks[k].checked){ allOn=false; break; }
        for(k=0;k<checks.length;k++) checks[k].checked=!allOn; updateCount();
      });
      function cleanup(result){ overlay.classList.remove('open'); setTimeout(function(){ overlay.remove(); resolve(result); },150); }
      overlay.querySelector('.ai-fs-x').addEventListener('click', function(){ cleanup(null); });
      overlay.querySelector('.ai-fs-cancel').addEventListener('click', function(){ cleanup(null); });
      overlay.querySelector('.ai-fs-confirm').addEventListener('click', function(){
        var selected=[], checks=overlay.querySelectorAll('.ai-fs-check'), k;
        for(k=0;k<checks.length;k++){ if(checks[k].checked){ var idx=parseInt(checks[k].getAttribute('data-idx'),10); selected.push(fields[idx]); } }
        cleanup(selected.length>0?selected:null);
      });
      updateCount();
    });
  }

  function _modeLabel(mode){ return mode==='quickfix'?'Quick Fix (Haiku)':mode==='shorten'?'Shorten (Haiku)':'Full Rewrite (Sonnet)'; }

  // ── Send to worker ──
  function _doReview(fields, mode, token){
    _busy=true; _updateBtn(true, mode); _openPanel();
    var body=document.getElementById('ai-body'); var modeLabel=_modeLabel(mode);
    if(body) body.innerHTML='<div class="ai-panel-loading"><div class="ai-spinner"></div><br>'+modeLabel+'<br>Reviewing '+fields.length+' field'+(fields.length!==1?'s':'')+'\u2026</div>';
    var aaBtn=document.getElementById('ai-accept-all'); if(aaBtn)aaBtn.style.display='none';
    var ctr=document.getElementById('ai-counter'); if(ctr)ctr.textContent=modeLabel+' \u2014 Sending\u2026';
    var context={ tool:'electric_pump', projectNumber:_projNum(), projectName:_projName() };
    fetch(WORKER_URL, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({ fields:fields, context:context, mode:mode }) })
    .then(function(res){ if(!res.ok) return res.json().then(function(e){ throw new Error(e.error||'API error '+res.status); }); return res.json(); })
    .then(function(data){
      _busy=false; _updateBtn(false);
      if(!data.suggestions||!Array.isArray(data.suggestions)) throw new Error('Invalid response from AI');
      _renderSuggestions(data.suggestions);
      if(data.usage && data.usage.cost_usd!==undefined){ var c2=document.getElementById('ai-counter'); if(c2)c2.textContent+=(' \u00B7 Cost: $'+data.usage.cost_usd.toFixed(4)); }
    })
    .catch(function(err){
      _busy=false; _updateBtn(false); console.error('[AIAssist] Error:', err);
      var b2=document.getElementById('ai-body');
      if(b2){ b2.innerHTML='<div class="ai-panel-loading" style="color:#8a3a42;">\u26A0 '+_esc(err.message||'Failed to connect to AI service')+'<br><br><button class="ai-btn-skip" style="padding:8px 16px;">Close</button></div>'; b2.querySelector('.ai-btn-skip').addEventListener('click', _closePanel); }
      var c3=document.getElementById('ai-counter'); if(c3)c3.textContent='Error';
    });
  }

  function _projNum(){ try{ var el=document.getElementById('pi-projno'); return el?el.value||'':''; }catch(e){ return ''; } }
  function _projName(){ try{ var el=document.getElementById('pi-projname'); return el?el.value||'':''; }catch(e){ return ''; } }

  // ── Mode menu ──
  function toggleMenu(e){ if(e)e.stopPropagation(); if(typeof _closeOtherHeaderMenus==='function')_closeOtherHeaderMenus('ai'); var m=document.getElementById('ai-mode-menu'); if(m)m.classList.toggle('open'); }
  function closeMenu(){ var m=document.getElementById('ai-mode-menu'); if(m)m.classList.remove('open'); }
  document.addEventListener('click', function(e){ var w=document.getElementById('ai-review-wrap'); if(w && !w.contains(e.target)) closeMenu(); });

  // ── Entry ──
  function reviewAll(mode){
    closeMenu();
    if(_busy) return;
    if(!mode) mode='rewrite';
    if(!navigator.onLine){ showToast('\u26A0 AI Review needs an internet connection'); return; }
    var token=_getToken();
    if(!token){ showToast('\u26A0 AI Review requires cloud login'); return; }
    var allFields=_collectFields();
    if(allFields.length===0){ showToast('\u2714 No text to review yet'); return; }
    if(allFields.length===1){ _doReview(allFields, mode, token); return; }
    _showFieldSelector(allFields, mode).then(function(selected){ if(!selected||selected.length===0) return; _doReview(selected, mode, token); });
  }

  return { reviewAll:reviewAll, toggleMenu:toggleMenu };
})();
/* ============ end AI Text Review ============ */
/* ============ AI Usage Tracking (ported verbatim from FRT ai/usage.js, S226d) ============ */
/* Read-only dashboard over Supabase ai_usage_log. toast()->showToast(), --fg->--slate remaps. */
var AIUsage=(function(){'use strict';
/* ARENCON AI Usage — thin Diesel host for the SHARED panel (aiusage_panel.js).
   Keeps public open()/close(); mounts shared panel scoped to current project. */
var SB_URL='https://xsemvinxsyphjiaqgywv.supabase.co';
var SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';
var _overlay=null, _inited=false;

function _sbHeaders(){ var h={'apikey':SB_ANON,'Content-Type':'application/json'}; var t=localStorage.getItem('sb-access-token'); if(t)h['Authorization']='Bearer '+t; return h; }
function _isAdmin(){ var role=localStorage.getItem('ARENCON_role')||''; return role==='super_admin'||role==='admin'; }

/* Map shared-module adapter contract -> raw PostgREST fetch */
function _adapter(){
  return {
    query:function(table,opts){ opts=opts||{};
      var q='/rest/v1/'+table+'?select=*';
      if(opts.eq){ for(var k in opts.eq){ q+='&'+encodeURIComponent(k)+'=eq.'+encodeURIComponent(opts.eq[k]); } }
      if(opts.order){ q+='&order='+opts.order; }
      return fetch(SB_URL+q,{headers:_sbHeaders()}).then(function(r){ return r.ok?r.json():[]; });
    },
    insert:function(table,obj){
      return fetch(SB_URL+'/rest/v1/'+table,{method:'POST',headers:Object.assign({'Prefer':'return=minimal'},_sbHeaders()),body:JSON.stringify(obj)})
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); });
    },
    remove:function(table,match){
      var q='/rest/v1/'+table+'?'; var parts=[];
      for(var k in match){ parts.push(encodeURIComponent(k)+'=eq.'+encodeURIComponent(match[k])); }
      return fetch(SB_URL+q+parts.join('&'),{method:'DELETE',headers:_sbHeaders()})
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); });
    }
  };
}

function _resolveUser(cb){
  var token=localStorage.getItem('sb-access-token');
  if(!token){ cb({id:null,email:null}); return; }
  fetch(SB_URL+'/auth/v1/user',{headers:{'apikey':SB_ANON,'Authorization':'Bearer '+token}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(u){ cb(u?{id:u.id||null,email:u.email||null}:{id:null,email:null}); })
    .catch(function(){ cb({id:null,email:null}); });
}
function _currentProjectNumber(){
  try{ var p=new URLSearchParams(window.location.search); return p.get('pn')||null; }catch(e){ return null; }
}

function _ensureOverlay(){
  if(_overlay) return;
  _overlay=document.createElement('div');
  _overlay.className='ai-usage-overlay';
  _overlay.innerHTML='<div class="ai-usage-modal" style="max-width:1100px;width:94%;" onclick="event.stopPropagation()">'
    +'<div class="ai-usage-hdr"><h3>📊 AI Usage &amp; Costs</h3><div class="ai-usage-hdr-btns">'
    +'<button id="aiu-host-close" style="font-size:16px;">✕</button></div></div>'
    +'<div class="ai-usage-body" id="aiu-host-mount" style="padding:18px;overflow:auto;"></div></div>';
  document.body.appendChild(_overlay);
  _overlay.addEventListener('click', function(e){ if(e.target===_overlay) close(); });
  _overlay.querySelector('#aiu-host-close').addEventListener('click', close);
}

function open(){
  _ensureOverlay();
  _overlay.classList.add('open');
  if(!window.AIUsagePanel){
    document.getElementById('aiu-host-mount').innerHTML='<div style="padding:30px;color:var(--steel);">⚠ Usage panel module not loaded. Check aiusage_panel.js include.</div>';
    return;
  }
  // (re)initialize each open so data is fresh; resolve real user first
  _resolveUser(function(user){
    window.AIUsagePanel.init({
      adapter:_adapter(),
      isAdmin:_isAdmin,
      toast:function(m,bad){ if(typeof showToast==='function') showToast((bad?'⚠ ':'✔ ')+m); },
      scopeProjectNumber:_currentProjectNumber(),
      mountInto:document.getElementById('aiu-host-mount'),
      currentUser:user
    });
  });
  _inited=true;
}
function close(){ if(_overlay) _overlay.classList.remove('open'); }

return { open:open, close:close };
})();
window.AIUsage = AIUsage;
/* ============ end AI Usage Tracking ============ */

/* ============ end Markup Engine ============ */
