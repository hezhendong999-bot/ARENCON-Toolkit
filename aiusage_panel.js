/* ═══════════════════════════════════════════════════════════════════
   ARENCON SHARED AI USAGE & COSTS PANEL   (single source of truth)
   Loaded by the Hub and by every tool. The HOST supplies an adapter so
   the module never assumes a particular Supabase client style.

   USAGE (host side):
     AIUsagePanel.init({
       adapter: {
         // return Promise<array of rows> for a REST-ish select on `table`
         // opts: { order, gte, lte }  (caller maps to its own client)
         query: function(table, opts){ return Promise<rows[]>; },
         insert: function(table, obj){ return Promise<void>; },
         remove: function(table, matchObj){ return Promise<void>; },  // delete where match
       },
       isAdmin: function(){ return bool; },        // can edit billing day / mark billed
       toast: function(msg, isBad){ },             // host toast
       scopeProjectNumber: '7318.02' | null,       // null = all projects (Hub)
       mountInto: HTMLElement,                      // where to render
       currentUser: { id, email } | null
     });

   Billing status comes from ai_invoice_marks (project + period range).
   Periods run (billingDay+1)→billingDay, labeled by END month.
   Initials NEVER red. Each tool a unique colour.
   ═══════════════════════════════════════════════════════════════════ */
window.AIUsagePanel = (function () {
  'use strict';

  var H = null;            // host config
  var _rows = [];          // normalized usage rows
  var _marks = [];
  var _billingDay = 22;
  var _profByEmail = {};   // email -> {num, init, name}
  var _projMeta = {};      // project_number -> {client, name}
  var _billFilter = 'all';
  var _cycleFilter = 'this';
  var _search = '';
  var _scope = null;       // project_number to lock to, or null
  var _scopeAll = false;   // when scoped, user toggled "all projects"

  var TOOL_CLASS = { diesel_pump:'t-diesel', frt:'t-frt', training:'t-train',
    ist:'t-ist', obc:'t-obc', dd:'t-dd', electric_pump:'t-elec', spatial:'t-obc' };
  function toolClass(t){ return TOOL_CLASS[t] || 't-default'; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function money(n){ return '$'+(Number(n)||0).toFixed(4); }

  /* ── period math: date -> {start,end,label,key}; end-month label ── */
  function periodFor(dateIso){
    var d=new Date(dateIso), y=d.getUTCFullYear(), m=d.getUTCMonth(), day=d.getUTCDate();
    var endY=y, endM=m;
    if(day>_billingDay){ endM=m+1; if(endM>11){endM=0;endY++;} }
    var end=new Date(Date.UTC(endY,endM,_billingDay,23,59,59));
    var sM=endM-1, sY=endY; if(sM<0){sM=11;sY--;}
    var start=new Date(Date.UTC(sY,sM,_billingDay+1,0,0,0));
    var label=end.toLocaleString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
    var key=endY+'-'+String(endM+1).padStart(2,'0');
    return {start:start,end:end,label:label,key:key};
  }
  function isBilled(row){
    if(!row.project_number) return false;
    var t=new Date(row.created_at).getTime();
    for(var i=0;i<_marks.length;i++){
      var mk=_marks[i];
      if(mk.project_number!==row.project_number) continue;
      var ps=new Date(mk.period_start).getTime(), pe=new Date(mk.period_end+'T23:59:59Z').getTime();
      if(t>=ps&&t<=pe) return true;
    }
    return false;
  }
  function activeScope(){ return (_scope && !_scopeAll) ? _scope : null; }

  function inCycle(row){
    if(_cycleFilter==='all') return true;
    var now=new Date(), cur=periodFor(now.toISOString()), t=new Date(row.created_at).getTime();
    if(_cycleFilter==='this') return t>=cur.start.getTime()&&t<=cur.end.getTime();
    if(_cycleFilter==='last'){ var le=new Date(cur.start.getTime()-1), last=periodFor(le.toISOString());
      return t>=last.start.getTime()&&t<=last.end.getTime(); }
    if(_cycleFilter==='month'){ var d=new Date(row.created_at);
      return d.getUTCFullYear()===now.getUTCFullYear()&&d.getUTCMonth()===now.getUTCMonth(); }
    return true;
  }
  function passes(row){
    var sc=activeScope();
    if(sc && row.project_number!==sc) return false;
    if(!inCycle(row)) return false;
    if(_billFilter==='billed'&&!isBilled(row)) return false;
    if(_billFilter==='unbilled'&&isBilled(row)) return false;
    if(_search){ var s=_search.toLowerCase();
      var hay=[row.project_number,row.client,row.project_name,row.user_number,row.initials,row.tool].join(' ').toLowerCase();
      if(hay.indexOf(s)===-1) return false; }
    return true;
  }

  /* ── load via host adapter ── */
  async function load(){
    try{ var bs=await H.adapter.query('app_settings',{eq:{key:'billing_day'}});
      if(bs&&bs[0]&&bs[0].value!=null) _billingDay=parseInt(bs[0].value,10)||22; }catch(e){ _billingDay=22; }
    try{ var profs=await H.adapter.query('profiles',{})||[]; _profByEmail={};
      profs.forEach(function(p){ if(p&&p.email) _profByEmail[String(p.email).trim().toLowerCase()]={num:p.user_number||'',init:p.initials||'',name:p.full_name||''}; }); }catch(e){ _profByEmail={}; }
    try{ var projs=await H.adapter.query('projects',{})||[]; _projMeta={};
      projs.forEach(function(p){ if(p&&p.project_number) _projMeta[p.project_number]={client:p.client||'',name:p.project_name||''}; }); }catch(e){ _projMeta={}; }
    try{ var logs=await H.adapter.query('ai_usage_log',{order:'created_at.desc'})||[];
      _rows=logs.map(function(l){
        var em=String(l.user_email||'').trim().toLowerCase(), pr=_profByEmail[em]||{}, pm=_projMeta[l.project_number]||{};
        return { id:l.id, created_at:l.created_at, tool:l.tool, project_number:l.project_number,
          project_name:l.project_name||pm.name||'', client:pm.client||l.client||'',
          user_number:pr.num||'—', initials:pr.init||deriveInit(em), full_name:pr.name||l.user_email||'—',
          field_count:l.field_count||0, cost_usd:parseFloat(l.cost_usd)||0 };
      }); }catch(e){ _rows=[]; }
    try{ _marks=await H.adapter.query('ai_invoice_marks',{})||[]; }catch(e){ _marks=[]; }
  }
  function deriveInit(email){ var lp=String(email||'').split('@')[0].replace(/[^a-z]/gi,'');
    if(!lp) return '—'; return lp.length>=2?(lp[0]+lp[lp.length-1]).toUpperCase():lp.toUpperCase(); }
  async function reloadMarks(){ try{ _marks=await H.adapter.query('ai_invoice_marks',{})||[]; }catch(e){ _marks=[]; } }

  function groupRows(){
    var g={};
    _rows.filter(passes).forEach(function(r){ var k=r.project_number||'__none__';
      if(!g[k]) g[k]={pn:r.project_number||'—',client:r.client||'(unassigned)',name:r.project_name||(r.project_number?'':'No project tagged'),rows:[]};
      g[k].rows.push(r); });
    return Object.keys(g).sort(function(a,b){ if(a==='__none__')return 1; if(b==='__none__')return -1; return a.localeCompare(b); }).map(function(k){return g[k];});
  }
  function metrics(){
    var p=_rows.filter(function(r){ var sc=activeScope(); if(sc&&r.project_number!==sc)return false; return inCycle(r); });
    var tot=0,bil=0,unb=0,fld=0,pj={};
    p.forEach(function(r){ tot+=r.cost_usd; fld+=r.field_count; if(r.project_number)pj[r.project_number]=1; if(isBilled(r))bil+=r.cost_usd; else unb+=r.cost_usd; });
    return {total:tot,billed:bil,unbilled:unb,fields:fld,projects:Object.keys(pj).length};
  }

  return {
    _state: function(){ return {rows:_rows,marks:_marks,billingDay:_billingDay}; },
    periodFor:periodFor, isBilled:isBilled, toolClass:toolClass, esc:esc, money:money,
    groupRows:groupRows, metrics:metrics, load:load, reloadMarks:reloadMarks,
    setBillFilter:function(b){_billFilter=b;}, getBillFilter:function(){return _billFilter;},
    setCycle:function(c){_cycleFilter=c;}, getCycle:function(){return _cycleFilter;},
    setSearch:function(s){_search=s;}, getBillingDay:function(){return _billingDay;},
    getRows:function(){return _rows;}, getMarks:function(){return _marks;},
    getScope:function(){return _scope;}, isScopedAll:function(){return _scopeAll;},
    setScopeAll:function(v){_scopeAll=v;}, _setScope:function(pn){_scope=pn;},
    _host:function(){return H;}, _setHost:function(h){H=h;}
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   SHARED PANEL — UI / RENDER / MARK / LEDGER / EXPORT / INIT
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  var P = window.AIUsagePanel;
  var E = P.esc, M = P.money;

  function host(){ return P._host(); }
  function mount(){ return host().mountInto; }
  function isAdmin(){ return host().isAdmin ? host().isAdmin() : false; }
  var _tt;
  function toast(m,bad){
    if(host().toast){ host().toast(m,bad); return; }
    var t=document.getElementById('aiu-toast'); if(!t) return;
    t.textContent=m; t.className='aiu-toast show'+(bad?' bad':'');
    clearTimeout(_tt); _tt=setTimeout(function(){ t.className='aiu-toast'; },1800);
  }

  function periodsForProject(pn){
    var seen={}, out=[];
    P.getRows().forEach(function(r){
      if(r.project_number!==pn) return;
      var p=P.periodFor(r.created_at);
      if(!seen[p.key]){ seen[p.key]={key:p.key,label:p.label,start:p.start.toISOString().slice(0,10),end:p.end.toISOString().slice(0,10),cost:0,fields:0}; out.push(seen[p.key]); }
      seen[p.key].cost+=r.cost_usd; seen[p.key].fields+=r.field_count;
    });
    out.sort(function(a,b){return b.key.localeCompare(a.key);});
    out.forEach(function(pp){ pp.billed=false; pp.mark=null;
      P.getMarks().forEach(function(mk){ if(mk.project_number!==pn) return;
        var ps=new Date(mk.period_start).getTime(), pe=new Date(mk.period_end+'T23:59:59Z').getTime();
        var mid=new Date(pp.end+'T12:00:00Z').getTime();
        if(mid>=ps&&mid<=pe){ pp.billed=true; pp.mark=mk; } });
    });
    return out;
  }

  function renderMetrics(){
    var m=P.metrics();
    return '<div class="aiu-metrics">'
      +'<div class="aiu-metric"><div class="l">Total this cycle</div><div class="v cost">'+M(m.total)+'</div></div>'
      +'<div class="aiu-metric click" data-act="qf-unbilled"><div class="l">Unbilled</div><div class="v unbilled">'+M(m.unbilled)+'</div></div>'
      +'<div class="aiu-metric click" data-act="qf-billed"><div class="l">Billed</div><div class="v billed">'+M(m.billed)+'</div></div>'
      +'<div class="aiu-metric"><div class="l">Fields</div><div class="v">'+m.fields+'</div></div>'
      +'<div class="aiu-metric"><div class="l">Projects</div><div class="v">'+m.projects+'</div></div>'
      +'</div>';
  }

  function renderLog(){
    var groups=P.groupRows();
    if(!groups.length) return '<div class="aiu-empty">No usage matches the current filters.</div>';
    var h='<table class="aiu-table"><thead><tr><th>Date</th><th>Project #</th><th>Client</th><th>Project Name</th><th>User #</th><th>Initials</th><th>Tool</th><th class="num">Fields</th><th class="num">Cost</th><th>Status</th></tr></thead><tbody>';
    groups.forEach(function(g){
      var sub=g.rows.reduce(function(s,r){return s+r.cost_usd;},0);
      var canMark=g.pn!=='—';
      h+='<tr class="aiu-group"><td colspan="10"><span class="gp-num">'+E(g.pn)+'</span> <span class="gp-meta">'+E(g.client)+(g.name?' · '+E(g.name):'')+'</span>'
        +'<span class="gp-right"><span class="gp-cost">'+M(sub)+'</span>'
        +(canMark?'<button class="gp-btn" data-act="mark" data-pn="'+E(g.pn)+'">Mark billed…</button><button class="gp-btn ghost" data-act="ledger" data-pn="'+E(g.pn)+'">Ledger</button>':'')
        +'</span></td></tr>';
      g.rows.forEach(function(r){
        var b=P.isBilled(r), d=new Date(r.created_at), ds=(d.getUTCMonth()+1)+'/'+d.getUTCDate()+'/'+d.getUTCFullYear();
        h+='<tr><td class="dim">'+ds+'</td><td class="tnum">'+E(r.project_number||'—')+'</td><td>'+E(r.client||'—')+'</td><td class="dim">'+E(r.project_name||'—')+'</td>'
          +'<td class="tnum">'+E(r.user_number)+'</td><td><span class="aiu-pill init"><span class="dot"></span>'+E(r.initials)+'</span></td>'
          +'<td><span class="aiu-pill '+P.toolClass(r.tool)+'"><span class="dot"></span>'+E(r.tool)+'</span></td>'
          +'<td class="num">'+r.field_count+'</td><td class="num cost">'+M(r.cost_usd)+'</td>'
          +'<td><span class="aiu-bchip '+(b?'billed':'unbilled')+'">'+(b?'✓ Billed':'Unbilled')+'</span></td></tr>';
      });
    });
    return h+'</tbody></table>';
  }

  function renderShell(){
    var scoped = P.getScope() && !P.isScopedAll();
    var scopeBtn = P.getScope() ? '<button class="aiu-exp" data-act="togglescope">'+(P.isScopedAll()?'Show only this project':'Show all projects')+'</button>' : '';
    return ''
      +'<div class="aiu-head">'
        +'<div class="aiu-title">AI Usage &amp; Costs'+(scoped?' <span class="aiu-scopetag">Project '+E(P.getScope())+'</span>':'')+'</div>'
        +'<div class="aiu-head-right">'+scopeBtn
          +'<button class="aiu-exp pdf" data-act="pdf">⬇ PDF</button>'
          +'<button class="aiu-exp" data-act="csv">⬇ CSV</button>'
        +'</div>'
      +'</div>'
      +'<div class="aiu-billing-note">Billing day '+P.getBillingDay()+' · periods labeled by closing month</div>'
      +'<div id="aiu-metrics-host"></div>'
      +'<div class="aiu-filterbar">'
        +'<div class="aiu-seg" id="aiu-cycleseg">'
          +'<button class="on" data-cyc="this">This Cycle</button><button data-cyc="last">Last Cycle</button><button data-cyc="month">This Month</button><button data-cyc="all">All Time</button>'
        +'</div>'
        +'<div class="aiu-seg bill" id="aiu-billseg">'
          +'<button class="on" data-bf="all">All</button><button data-bf="unbilled">Unbilled</button><button data-bf="billed">Billed</button>'
        +'</div>'
        +'<input type="search" class="aiu-search" placeholder="🔎 Search project, client, user, tool…">'
      +'</div>'
      +'<div class="aiu-logcard"><div id="aiu-log-host"></div></div>';
  }

  function refresh(){
    var mh=mount().querySelector('#aiu-metrics-host'); if(mh) mh.innerHTML=renderMetrics();
    var lh=mount().querySelector('#aiu-log-host'); if(lh) lh.innerHTML=renderLog();
    var bs=mount().querySelector('#aiu-billseg');
    if(bs) bs.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on',b.dataset.bf===P.getBillFilter()); });
  }

  /* ── delegated click handling within the mount ── */
  function wire(){
    var root=mount();
    root.addEventListener('click', function(e){
      var t=e.target.closest('[data-act]'); 
      if(t){
        var a=t.dataset.act;
        if(a==='qf-unbilled'){ P.setBillFilter('unbilled'); refresh(); }
        else if(a==='qf-billed'){ P.setBillFilter('billed'); refresh(); }
        else if(a==='mark'){ openMark(t.dataset.pn); }
        else if(a==='ledger'){ openLedger(t.dataset.pn); }
        else if(a==='pdf'){ exportPDF(); }
        else if(a==='csv'){ exportCSV(); }
        else if(a==='togglescope'){ P.setScopeAll(!P.isScopedAll()); rerenderShell(); }
        return;
      }
      var cyc=e.target.closest('[data-cyc]');
      if(cyc){ P.setCycle(cyc.dataset.cyc); root.querySelectorAll('#aiu-cycleseg button').forEach(function(b){b.classList.remove('on');}); cyc.classList.add('on'); refresh(); return; }
      var bf=e.target.closest('[data-bf]');
      if(bf){ P.setBillFilter(bf.dataset.bf); refresh(); return; }
    });
    root.addEventListener('input', function(e){
      if(e.target.classList.contains('aiu-search')){ P.setSearch(e.target.value); refresh(); }
    });
  }

  function rerenderShell(){ mount().innerHTML=renderShell(); refresh(); }

  /* ── mark modal (built into mount, scoped overlay) ── */
  function ensureModals(){
    if(document.getElementById('aiu-mark-modal')) return;
    var div=document.createElement('div'); div.innerHTML=
      '<div class="aiu-modal-overlay" id="aiu-mark-modal"><div class="aiu-modal"><h3>Mark billed</h3>'
      +'<p class="aiu-modal-proj" id="aiu-mark-proj"></p>'
      +'<p class="aiu-modal-hint">Default is a single month. To bill several months on one invoice, set From to the earliest and To to the latest.</p>'
      +'<div class="aiu-modal-fields"><label>From period<select id="aiu-mark-from"></select></label><label>To period<select id="aiu-mark-to"></select></label></div>'
      +'<div class="aiu-modal-actions"><button class="aiu-exp" id="aiu-mark-cancel">Cancel</button><button class="aiu-exp primary" id="aiu-mark-confirm">Mark billed</button></div></div></div>'
      +'<div class="aiu-modal-overlay" id="aiu-ledger-modal"><div class="aiu-modal wide"><h3 id="aiu-ledger-title">Billing ledger</h3>'
      +'<p class="aiu-modal-proj" id="aiu-ledger-sum"></p><div class="aiu-ledger-scroll"><table class="aiu-table"><thead><tr><th>Period</th><th>Range</th><th class="num">Fields</th><th class="num">Cost</th><th>Status</th><th></th></tr></thead><tbody id="aiu-ledger-body"></tbody></table></div>'
      +'<div class="aiu-modal-actions"><button class="aiu-exp" id="aiu-ledger-close">Close</button></div></div></div>'
      +'<div class="aiu-toast" id="aiu-toast"></div>';
    document.body.appendChild(div);
    document.getElementById('aiu-mark-cancel').onclick=closeMark;
    document.getElementById('aiu-mark-confirm').onclick=confirmMark;
    document.getElementById('aiu-ledger-close').onclick=closeLedger;
    // backdrop close ONLY on these (no data entry lost — selects only), but keep ledger closable
    [['aiu-mark-modal',closeMark],['aiu-ledger-modal',closeLedger]].forEach(function(pair){
      document.getElementById(pair[0]).addEventListener('click',function(e){ if(e.target.id===pair[0]) pair[1](); });
    });
  }

  var _markPn=null;
  function openMark(pn){ ensureModals(); _markPn=pn;
    var periods=periodsForProject(pn);
    var opts=periods.map(function(p){return '<option value="'+p.key+'" data-start="'+p.start+'" data-end="'+p.end+'">'+E(p.label)+(p.billed?' (already billed)':'')+'</option>';}).join('');
    document.getElementById('aiu-mark-proj').textContent='Project '+pn;
    document.getElementById('aiu-mark-from').innerHTML=opts;
    document.getElementById('aiu-mark-to').innerHTML=opts;
    document.getElementById('aiu-mark-modal').classList.add('show');
  }
  function closeMark(){ var m=document.getElementById('aiu-mark-modal'); if(m)m.classList.remove('show'); _markPn=null; }
  async function confirmMark(){
    if(!_markPn) return;
    var fs=document.getElementById('aiu-mark-from'), ts=document.getElementById('aiu-mark-to');
    var fo=fs.options[fs.selectedIndex], to=ts.options[ts.selectedIndex];
    var s1=fo.dataset.start,e1=to.dataset.end,s2=to.dataset.start,e2=fo.dataset.end;
    var ps=s1<=s2?s1:s2, pe=e1>=e2?e1:e2;
    var u=host().currentUser||{};
    try{ await host().adapter.insert('ai_invoice_marks',{project_number:_markPn,period_start:ps,period_end:pe,marked_by:u.id||null,marked_by_email:u.email||null});
      await P.reloadMarks(); closeMark(); refresh(); toast('Marked billed: '+ps.slice(0,7)+' → '+pe.slice(0,7));
    }catch(err){ toast('Failed: '+(err.message||err),true); }
  }

  var _ledgerPn=null;
  function openLedger(pn){ ensureModals(); _ledgerPn=pn;
    var periods=periodsForProject(pn);
    var tot=periods.reduce(function(s,p){return s+p.cost;},0), bil=periods.filter(function(p){return p.billed;}).reduce(function(s,p){return s+p.cost;},0);
    var rows=periods.map(function(p){
      return '<tr><td>'+E(p.label)+'</td><td class="dim">'+p.start+' → '+p.end+'</td><td class="num">'+p.fields+'</td><td class="num cost">'+M(p.cost)+'</td>'
        +'<td><span class="aiu-bchip '+(p.billed?'billed':'unbilled')+'">'+(p.billed?'✓ Billed':'Unbilled')+'</span></td>'
        +'<td>'+(p.billed?'<button class="gp-btn ghost" data-led-unmark="'+E(p.mark.id)+'">Un-mark</button>':'<button class="gp-btn" data-led-mark="'+p.start+'|'+p.end+'">Mark</button>')+'</td></tr>';
    }).join('');
    document.getElementById('aiu-ledger-title').textContent='Billing ledger — Project '+pn;
    document.getElementById('aiu-ledger-sum').innerHTML='Whole project: <b class="cost">'+M(tot)+'</b> total · <b class="billed">'+M(bil)+'</b> billed · <b class="unbilled">'+M(tot-bil)+'</b> unbilled';
    var body=document.getElementById('aiu-ledger-body');
    body.innerHTML=rows||'<tr><td colspan="6" class="dim">No usage for this project.</td></tr>';
    body.onclick=function(e){
      var um=e.target.closest('[data-led-unmark]'); if(um){ ledgerUnmark(um.getAttribute('data-led-unmark')); return; }
      var mk=e.target.closest('[data-led-mark]'); if(mk){ var sp=mk.getAttribute('data-led-mark').split('|'); ledgerMark(sp[0],sp[1]); return; }
    };
    document.getElementById('aiu-ledger-modal').classList.add('show');
  }
  function closeLedger(){ var m=document.getElementById('aiu-ledger-modal'); if(m)m.classList.remove('show'); _ledgerPn=null; }
  async function ledgerMark(s,e){ var u=host().currentUser||{};
    try{ await host().adapter.insert('ai_invoice_marks',{project_number:_ledgerPn,period_start:s,period_end:e,marked_by:u.id||null,marked_by_email:u.email||null});
      await P.reloadMarks(); refresh(); openLedger(_ledgerPn); toast('Marked billed'); }catch(err){ toast('Failed: '+(err.message||err),true); } }
  async function ledgerUnmark(id){ var pn=_ledgerPn;
    try{ await host().adapter.remove('ai_invoice_marks',{id:id}); await P.reloadMarks(); refresh(); if(pn)openLedger(pn); toast('Un-marked (now unbilled)'); }catch(err){ toast('Failed: '+(err.message||err),true); } }

  function exportCSV(){
    var groups=P.groupRows();
    var lines=[['Date','Project #','Client','Project Name','User #','Initials','Tool','Fields','Cost USD','Status'].join(',')];
    function c(s){s=String(s==null?'':s);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
    groups.forEach(function(g){g.rows.forEach(function(r){ var b=P.isBilled(r),d=new Date(r.created_at),ds=(d.getUTCMonth()+1)+'/'+d.getUTCDate()+'/'+d.getUTCFullYear();
      lines.push([ds,r.project_number||'',c(r.client),c(r.project_name),r.user_number,r.initials,r.tool,r.field_count,r.cost_usd.toFixed(6),b?'Billed':'Unbilled'].join(','));});});
    var blob=new Blob([lines.join('\n')],{type:'text/csv'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='ai_usage_'+new Date().toISOString().slice(0,10)+'.csv'; a.click(); toast('CSV exported');
  }
  function exportPDF(){
    var groups=P.groupRows(), m=P.metrics(), rows='';
    groups.forEach(function(g){ var sub=g.rows.reduce(function(s,r){return s+r.cost_usd;},0);
      rows+='<tr class="grp"><td colspan="9">'+E(g.pn)+' — '+E(g.client)+(g.name?' · '+E(g.name):'')+' <span style="float:right">'+M(sub)+'</span></td></tr>';
      g.rows.forEach(function(r){ var b=P.isBilled(r),d=new Date(r.created_at),ds=(d.getUTCMonth()+1)+'/'+d.getUTCDate()+'/'+d.getUTCFullYear();
        rows+='<tr><td>'+ds+'</td><td>'+E(r.project_number||'—')+'</td><td>'+E(r.client||'—')+'</td><td>'+E(r.user_number)+'</td><td>'+E(r.initials)+'</td><td>'+E(r.tool)+'</td><td style="text-align:right">'+r.field_count+'</td><td style="text-align:right">'+M(r.cost_usd)+'</td><td>'+(b?'Billed':'Unbilled')+'</td></tr>';});});
    var w=window.open('','_blank');
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>AI Usage &amp; Costs</title><style>body{font-family:Calibri,sans-serif;margin:0;background:#525659;color:#1a1a1a}.bar{position:fixed;top:0;left:0;right:0;background:#2C4770;display:flex;gap:10px;align-items:center;padding:8px 14px;z-index:9}.bar button{font-family:Calibri;font-size:13px;font-weight:700;padding:7px 13px;border:none;border-radius:6px;cursor:pointer}.bar .pdf{background:#1A7A4A;color:#fff}.bar .cl{background:#455A64;color:#fff}.bar .hint{flex:1;color:#cfd8e3;font-size:12px}.page{background:#fff;width:8.5in;min-height:11in;margin:54px auto 20px;padding:.6in;box-shadow:0 2px 12px rgba(0,0,0,.4)}h1{font-size:18px;margin:0 0 2px}.sub{color:#555;font-size:12px;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;border-bottom:2px solid #2C4770;padding:5px 6px;font-size:10px;text-transform:uppercase;color:#2C4770}td{padding:4px 6px;border-bottom:1px solid #e3e3e3}tr.grp td{background:#eef1f6;font-weight:700}@media print{.bar{display:none}.page{box-shadow:none;margin:0 auto}body{background:#fff}}</style></head><body><div class="bar"><button class="pdf" onclick="window.print()">📄 Export PDF</button><span class="hint">Use your browser\u2019s Save as PDF in the print dialog.</span><button class="cl" onclick="window.close()">✕ Close</button></div><div class="page"><h1>AI Usage &amp; Costs</h1><div class="sub">Generated '+new Date().toLocaleString()+' · Total '+M(m.total)+' · Unbilled '+M(m.unbilled)+' · Billed '+M(m.billed)+'</div><table><thead><tr><th>Date</th><th>Project #</th><th>Client</th><th>User #</th><th>Init</th><th>Tool</th><th style="text-align:right">Fields</th><th style="text-align:right">Cost</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table><div style="margin-top:14px;font-weight:700">Total: '+M(m.total)+'</div></div></body></html>');
    w.document.close();
  }

  /* ── public init: host calls this once ── */
  P.init = async function(cfg){
    P._setHost(cfg);
    if(cfg.scopeProjectNumber){ P._setScope(cfg.scopeProjectNumber); P.setScopeAll(false); }
    mount().innerHTML='<div class="aiu-empty">Loading usage…</div>';
    ensureModals();
    await P.load();
    rerenderShell();
    wire();
  };
})();
