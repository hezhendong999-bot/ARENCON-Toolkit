/* ARENCON — Canonical AI Usage component (shared/ai-usage.js)
 * ===========================================================================
 * ONE shared module loaded identically by every tool page (Hub, FRT pages,
 * Training admin, future tools): <script src=".../shared/ai-usage.js"></script>
 * then call AIUsage.open(). Pairs with shared/ai-usage.css.
 *
 * Zero-contract drop-in (per TRAINING_CENTER_HANDOFF_03 §4):
 *  - Own SB_URL / anon key (no page globals needed)
 *  - Live sb-access-token read + sb-refresh-token 401-retry (no stale-token bug)
 *  - Own minimal toast (never touches a host page's #toast / toast())
 *  - Admin determined by reading the CALLER'S OWN profile role
 *  - Reads ai_usage_log + profiles (user#/initials) + app_settings (billing day)
 *
 * Detail Log columns are FIXED everywhere, this order (§4):
 *   Date · User # · Initial · Project # · Tool · Fields · Cost
 * Email is removed everywhere (display + CSV + PDF). "—" until a user_number
 * is entered (done later in the Hub admin panel — Part C).
 * Billing-cycle / CSV / PDF behaviour is faithful to the original
 * frt/js/ai/usage.js. Do NOT fork this file per tool.
 * ========================================================================= */
(function () {
  'use strict';

  var SB_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';

  var _overlay = null;
  var _data = [];
  var _profById = {};      // user_id -> { num, ini, role }
  var _profLoaded = false;
  var _amAdmin = false;
  var _billingDay = 20;

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---- self-contained auth: live token + one-shot refresh-retry ---------- */
  function _liveTok() {
    try { return localStorage.getItem('sb-access-token') || null; }
    catch (e) { return null; }
  }
  function _refresh() {
    var rt = null;
    try { rt = localStorage.getItem('sb-refresh-token'); } catch (e) {}
    if (!rt) return Promise.resolve(false);
    return fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    }).then(function (r) {
      if (!r.ok) return false;
      return r.json().then(function (d) {
        if (!d || !d.access_token) return false;
        try {
          localStorage.setItem('sb-access-token', d.access_token);
          if (d.refresh_token) localStorage.setItem('sb-refresh-token', d.refresh_token);
        } catch (e) {}
        return true;
      });
    }).catch(function () { return false; });
  }
  function _hdr() {
    return {
      apikey: SB_ANON,
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (_liveTok() || SB_ANON)
    };
  }
  // GET/PATCH wrapper: on 401, refresh once and retry.
  function _sb(path, opts) {
    opts = opts || {};
    function go() { var o = { method: opts.method || 'GET', headers: _hdr() }; if (opts.body) o.body = opts.body; return fetch(SB_URL + path, o); }
    return go().then(function (r) {
      if (r.status !== 401) return r;
      return _refresh().then(function (ok) { return ok ? go() : r; });
    });
  }

  /* ---- own toast (independent of any host page) ------------------------- */
  function _toast(m) {
    var el = document.getElementById('aiu-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aiu-toast';
      el.className = 'aiu-toast';
      document.body.appendChild(el);
    }
    el.textContent = m;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 2200);
  }

  /* ---- profiles map: user# + initials (one-time per session) ----------- */
  function _initials(name) {
    name = String(name || '').trim();
    if (!name) return '';
    var p = name.split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase();
  }
  function _loadProfiles() {
    if (_profLoaded) return Promise.resolve();
    return _sb('/rest/v1/profiles?select=id,full_name,role,user_number')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        (rows || []).forEach(function (p) {
          _profById[p.id] = { num: p.user_number || '', ini: _initials(p.full_name), role: p.role || '' };
        });
        _profLoaded = true;
      })
      .catch(function () { _profLoaded = true; });
  }
  function _loadMe() {
    return _sb('/auth/v1/user')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (u) {
        if (!u || !u.id) { _amAdmin = false; return; }
        var p = _profById[u.id];
        if (p) { _amAdmin = (p.role === 'super_admin' || p.role === 'admin'); return; }
        return _sb('/rest/v1/profiles?id=eq.' + u.id + '&select=role')
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) {
            var role = (rows && rows[0] && rows[0].role) || '';
            _amAdmin = (role === 'super_admin' || role === 'admin');
          });
      })
      .catch(function () { _amAdmin = false; });
  }
  function _pnum(uid) { var p = _profById[uid]; return (p && p.num) ? p.num : '—'; }
  function _pini(uid) { var p = _profById[uid]; return (p && p.ini) ? p.ini : '—'; }

  /* ---- open / close ---------------------------------------------------- */
  function open() {
    _ensureOverlay();
    _overlay.classList.add('open');
    _loadProfiles().then(_loadMe).then(function () {
      _syncAdminUI();
      _loadBillingDay(function () { _setCycle('current'); _fetch(); });
    });
  }
  function close() { if (_overlay) _overlay.classList.remove('open'); }

  /* ---- billing day (FRT-faithful; admin-only edit) --------------------- */
  function _loadBillingDay(cb) {
    _sb('/rest/v1/app_settings?key=eq.billing_day&select=value')
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (rows && rows.length) _billingDay = parseInt(rows[0].value, 10) || 20;
        var el = document.getElementById('aiu-bday-input');
        if (el) { el.value = _billingDay; el.disabled = !_amAdmin; }
        if (cb) cb();
      })
      .catch(function () { if (cb) cb(); });
  }
  function _saveBillingDay(d) {
    if (!_amAdmin) { _toast('⚠ Only admins can change billing day'); return; }
    d = Math.max(1, Math.min(28, parseInt(d, 10) || 20));
    _billingDay = d;
    // Stored value is numeric in app_settings — keep the column type stable.
    _sb('/rest/v1/app_settings?key=eq.billing_day', {
      method: 'PATCH',
      body: JSON.stringify({ value: d, updated_at: new Date().toISOString() })
    }).then(function (r) {
      _toast(r.ok ? '✔ Billing day: ' + d + 'th' : '⚠ Failed');
    }).catch(function () { _toast('⚠ Failed'); });
  }
  function _cycleRange(offset) {
    var day = _billingDay, now = new Date();
    var y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    var sM, sY, eM, eY;
    if (d >= day) { sM = m + offset; sY = y; eM = m + 1 + offset; eY = y; }
    else { sM = m - 1 + offset; sY = y; eM = m + offset; eY = y; }
    while (sM < 0) { sM += 12; sY--; } while (sM > 11) { sM -= 12; sY++; }
    while (eM < 0) { eM += 12; eY--; } while (eM > 11) { eM -= 12; eY++; }
    return { from: new Date(sY, sM, day), to: new Date(eY, eM, day - 1) };
  }
  function _setCycle(period) {
    var fE = document.getElementById('aiu-from'), tE = document.getElementById('aiu-to');
    if (!fE || !tE) return;
    var now = new Date(), from, to;
    if (period === 'current' || period === 'last') { var r = _cycleRange(period === 'last' ? -1 : 0); from = r.from; to = r.to; }
    else if (period === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
    else if (period === 'week') { from = new Date(now); from.setDate(now.getDate() - now.getDay()); to = new Date(now); }
    else if (period === 'today') { from = new Date(now); to = new Date(now); }
    else if (period === 'all') { from = new Date(2024, 0, 1); to = new Date(now); }
    if (from) fE.value = from.toISOString().split('T')[0];
    if (to) tE.value = to.toISOString().split('T')[0];
  }
  function _syncAdminUI() {
    var el = document.getElementById('aiu-bday-input');
    if (el) el.disabled = !_amAdmin;
    var lk = document.getElementById('aiu-bday-lock');
    if (lk) lk.textContent = _amAdmin ? '' : ' 🔒';
  }

  /* ---- overlay markup -------------------------------------------------- */
  function _ensureOverlay() {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.className = 'ai-usage-overlay';
    _overlay.addEventListener('click', function (e) { if (e.target === _overlay) close(); });
    _overlay.innerHTML =
      '<div class="ai-usage-modal" onclick="event.stopPropagation()">'
      + '<div class="ai-usage-hdr"><h3>📊 AI Usage Tracking</h3><div class="ai-usage-hdr-btns">'
      + '<button id="aiu-csv">📄 CSV</button><button id="aiu-pdf">📄 PDF</button>'
      + '<button id="aiu-close" style="font-size:16px;">✕</button></div></div>'
      + '<div class="ai-usage-filters" id="aiu-period-btns"></div>'
      + '<div class="ai-usage-filters bd">'
      + '<label>From</label><input type="date" id="aiu-from">'
      + '<label>To</label><input type="date" id="aiu-to">'
      + '<button id="aiu-apply">Apply</button></div>'
      + '<div class="ai-usage-filters bd">'
      + '<label>User</label><select id="aiu-user" class="aiu-sel"><option value="all">All Users</option></select>'
      + '<label>Project</label><select id="aiu-project" class="aiu-sel"><option value="all">All Projects</option></select>'
      + '<label>Tool</label><select id="aiu-tool" class="aiu-sel"><option value="all">All Tools</option></select>'
      + '<span class="aiu-bday">Billing day: <input type="number" id="aiu-bday-input" value="' + _billingDay + '" min="1" max="28" disabled> of month<span id="aiu-bday-lock"> 🔒</span></span>'
      + '</div>'
      + '<div class="ai-usage-body" id="aiu-body"><div class="ai-usage-loading">Loading…</div></div>'
      + '</div>';
    document.body.appendChild(_overlay);
    _overlay.querySelector('#aiu-close').addEventListener('click', close);
    _overlay.querySelector('#aiu-csv').addEventListener('click', exportCSV);
    _overlay.querySelector('#aiu-pdf').addEventListener('click', exportPDF);
    _overlay.querySelector('#aiu-apply').addEventListener('click', function () { _render(); });
    _overlay.querySelector('#aiu-user').addEventListener('change', function () { _render(); });
    _overlay.querySelector('#aiu-project').addEventListener('change', function () { _render(); });
    _overlay.querySelector('#aiu-tool').addEventListener('change', function () { _render(); });
    var bd = _overlay.querySelector('#aiu-bday-input');
    if (bd) bd.addEventListener('change', function () { _saveBillingDay(this.value); });
    [{ l: 'This Cycle', v: 'current', bg: '#1A7A4A' }, { l: 'Last Cycle', v: 'last' },
     { l: 'This Month', v: 'month' }, { l: 'This Week', v: 'week' },
     { l: 'Today', v: 'today' }, { l: 'All Time', v: 'all' }].forEach(function (p) {
      var b = document.createElement('button');
      b.textContent = p.l;
      if (p.bg) b.style.background = p.bg;
      b.addEventListener('click', function () { _setCycle(p.v); _fetch(); });
      _overlay.querySelector('#aiu-period-btns').appendChild(b);
    });
  }

  /* ---- data ------------------------------------------------------------ */
  function _fetch() {
    var body = document.getElementById('aiu-body');
    if (body) body.innerHTML = '<div class="ai-usage-loading"><div class="ai-usage-spin"></div><br>Loading…</div>';
    var from = (document.getElementById('aiu-from') || {}).value || '';
    var to = (document.getElementById('aiu-to') || {}).value || '';
    var q = '/rest/v1/ai_usage_log?select=*&order=created_at.desc';
    if (from) q += '&created_at=gte.' + from + 'T00:00:00Z';
    if (to) q += '&created_at=lte.' + to + 'T23:59:59Z';
    _sb(q)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) { _data = rows || []; _populate(); _render(); })
      .catch(function (err) {
        if (body) body.innerHTML = '<div class="ai-usage-loading" style="color:#C62828;">⚠ ' + _esc(err.message) + '</div>';
      });
  }
  function _populate() {
    var users = {}, projs = {}, tools = {};
    _data.forEach(function (r) {
      if (r.user_id) users[r.user_id] = true;
      if (r.project_number) projs[r.project_number] = r.project_name || '';
      if (r.tool) tools[r.tool] = true;
    });
    var uSel = document.getElementById('aiu-user');
    var pSel = document.getElementById('aiu-project');
    var tSel = document.getElementById('aiu-tool');
    if (uSel) {
      var cu = uSel.value;
      var uOpts = Object.keys(users).map(function (id) {
        var num = _pnum(id), ini = _pini(id);
        return { id: id, label: (num !== '—' ? num + ' — ' : '') + ini, sort: (num !== '—' ? num : 'zzz') + ini };
      }).sort(function (a, b) { return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0; });
      uSel.innerHTML = '<option value="all">All Users</option>';
      uOpts.forEach(function (o) {
        uSel.innerHTML += '<option value="' + _esc(o.id) + '"' + (cu === o.id ? ' selected' : '') + '>' + _esc(o.label) + '</option>';
      });
    }
    if (pSel) {
      var cp = pSel.value;
      pSel.innerHTML = '<option value="all">All Projects</option>';
      Object.keys(projs).sort().forEach(function (n) {
        pSel.innerHTML += '<option value="' + _esc(n) + '"' + (cp === n ? ' selected' : '') + '>' + _esc(n + ' — ' + projs[n]) + '</option>';
      });
    }
    if (tSel) {
      var ct = tSel.value;
      tSel.innerHTML = '<option value="all">All Tools</option>';
      Object.keys(tools).sort().forEach(function (t) {
        tSel.innerHTML += '<option value="' + _esc(t) + '"' + (ct === t ? ' selected' : '') + '>' + _esc(t) + '</option>';
      });
    }
  }
  function _filtered() {
    var uf = (document.getElementById('aiu-user') || {}).value || 'all';
    var pf = (document.getElementById('aiu-project') || {}).value || 'all';
    var tf = (document.getElementById('aiu-tool') || {}).value || 'all';
    return _data.filter(function (r) {
      if (uf !== 'all' && r.user_id !== uf) return false;
      if (pf !== 'all' && r.project_number !== pf) return false;
      if (tf !== 'all' && (r.tool || '') !== tf) return false;
      return true;
    });
  }

  /* ---- render ---------------------------------------------------------- */
  function _render() {
    var body = document.getElementById('aiu-body');
    if (!body) return;
    var fd = _filtered();
    var from = (document.getElementById('aiu-from') || {}).value || '';
    var to = (document.getElementById('aiu-to') || {}).value || '';
    if (!fd.length) { body.innerHTML = '<div class="ai-usage-loading">No records found.</div>'; return; }

    var byProj = {}, byUser = {}, tCost = 0, tRev = 0, tFld = 0;
    fd.forEach(function (r) {
      var pk = (r.project_number || '(none)') + '|' + (r.project_name || '');
      if (!byProj[pk]) byProj[pk] = { num: r.project_number || '(none)', client: r.client_name || r.client || '', name: r.project_name || '', rev: 0, fld: 0, cost: 0, tools: {} };
      byProj[pk].rev++; byProj[pk].fld += (r.field_count || 0); byProj[pk].cost += (parseFloat(r.cost_usd) || 0); byProj[pk].tools[r.tool || '?'] = true;
      var uk = r.user_id || '?';
      if (!byUser[uk]) byUser[uk] = { num: _pnum(uk), ini: _pini(uk), rev: 0, fld: 0, cost: 0 };
      byUser[uk].rev++; byUser[uk].fld += (r.field_count || 0); byUser[uk].cost += (parseFloat(r.cost_usd) || 0);
      tCost += (parseFloat(r.cost_usd) || 0); tRev++; tFld += (r.field_count || 0);
    });

    var h = '<div style="padding:8px 0;font-size:calc(12px + var(--ts,0px));color:var(--steel,#5A6473);">'
      + fd.length + ' records · ' + _esc(from) + ' to ' + _esc(to)
      + ' · Total: <strong style="color:var(--fg,#1E293B);">$' + tCost.toFixed(4) + '</strong></div>';

    // Summary by Project (FRT-faithful columns)
    h += '<div class="ai-usage-section"><h4>Summary by Project</h4><table class="ai-usage-table">'
      + '<tr><th style="min-width:80px;">Project #</th><th>Client</th><th>Project Name</th>'
      + '<th style="width:90px;">Tool(s)</th><th class="num" style="width:60px;">Records</th>'
      + '<th class="num" style="width:50px;">Fields</th><th class="num" style="width:80px;">Cost</th></tr>';
    Object.keys(byProj).sort().forEach(function (k) {
      var p = byProj[k];
      h += '<tr><td>' + _esc(p.num) + '</td><td>' + _esc(p.client) + '</td><td>' + _esc(p.name) + '</td>'
        + '<td>' + _esc(Object.keys(p.tools).join(', ')) + '</td>'
        + '<td class="num">' + p.rev + '</td><td class="num">' + p.fld + '</td>'
        + '<td class="cost">$' + p.cost.toFixed(4) + '</td></tr>';
    });
    h += '<tr class="total-row"><td colspan="4"><strong>TOTAL</strong></td>'
      + '<td class="num"><strong>' + tRev + '</strong></td><td class="num"><strong>' + tFld + '</strong></td>'
      + '<td class="cost"><strong>$' + tCost.toFixed(4) + '</strong></td></tr></table></div>';

    // Summary by User — by User # / Initial (§4: email removed)
    h += '<div class="ai-usage-section"><h4>Summary by User</h4><table class="ai-usage-table">'
      + '<tr><th style="width:90px;">User #</th><th style="width:70px;">Initial</th>'
      + '<th class="num" style="width:60px;">Records</th><th class="num" style="width:50px;">Fields</th>'
      + '<th class="num" style="width:80px;">Cost</th></tr>';
    Object.keys(byUser).sort(function (a, b) {
      var A = byUser[a], B = byUser[b];
      var as = (A.num !== '—' ? A.num : 'zzz') + A.ini, bs = (B.num !== '—' ? B.num : 'zzz') + B.ini;
      return as < bs ? -1 : as > bs ? 1 : 0;
    }).forEach(function (k) {
      var u = byUser[k];
      h += '<tr><td>' + _esc(u.num) + '</td><td>' + _esc(u.ini) + '</td>'
        + '<td class="num">' + u.rev + '</td><td class="num">' + u.fld + '</td>'
        + '<td class="cost">$' + u.cost.toFixed(4) + '</td></tr>';
    });
    h += '</table></div>';

    // Detail Log — FIXED column order (§4): Date · User # · Initial · Project # · Tool · Fields · Cost
    h += '<div class="ai-usage-section"><h4>Detail Log</h4><table class="ai-usage-table">'
      + '<tr><th style="width:80px;">Date</th><th style="width:80px;">User #</th>'
      + '<th style="width:60px;">Initial</th><th style="width:80px;">Project #</th>'
      + '<th style="width:60px;">Tool</th><th class="num" style="width:45px;">Fields</th>'
      + '<th class="num" style="width:80px;">Cost</th></tr>';
    fd.forEach(function (r) {
      h += '<tr><td>' + (r.created_at ? new Date(r.created_at).toLocaleDateString() : '?') + '</td>'
        + '<td>' + _esc(_pnum(r.user_id)) + '</td><td>' + _esc(_pini(r.user_id)) + '</td>'
        + '<td>' + _esc(r.project_number || '-') + '</td><td>' + _esc(r.tool || '?') + '</td>'
        + '<td class="num">' + (r.field_count || 0) + '</td>'
        + '<td class="cost">$' + (parseFloat(r.cost_usd) || 0).toFixed(4) + '</td></tr>';
    });
    h += '</table></div>';
    body.innerHTML = h;
  }

  /* ---- CSV (FRT-faithful; email -> User #/Initial) --------------------- */
  function exportCSV() {
    var fd = _filtered();
    if (!fd.length) { _toast('No data'); return; }
    var lines = ['Date,User #,Initial,Project Number,Project Name,Tool,Model,Fields,Cost USD'];
    fd.forEach(function (r) {
      lines.push([
        r.created_at ? new Date(r.created_at).toISOString() : '',
        '"' + _pnum(r.user_id) + '"',
        '"' + _pini(r.user_id) + '"',
        '"' + (r.project_number || '') + '"',
        '"' + (r.project_name || '') + '"',
        r.tool || '',
        r.model || '',
        r.field_count || 0,
        (parseFloat(r.cost_usd) || 0).toFixed(6)
      ].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ARENCON_AI_Usage.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    _toast('📄 CSV downloaded');
  }

  /* ---- PDF (FRT-faithful; email -> User #/Initial) --------------------- */
  function exportPDF() {
    var fd = _filtered();
    if (!fd.length) { _toast('No data'); return; }
    var from = (document.getElementById('aiu-from') || {}).value || '';
    var to = (document.getElementById('aiu-to') || {}).value || '';
    var uf = (document.getElementById('aiu-user') || {}).value || 'all';
    var pf = (document.getElementById('aiu-project') || {}).value || 'all';
    var tf = (document.getElementById('aiu-tool') || {}).value || 'all';
    var byProj = {}, tCost = 0, tRev = 0;
    fd.forEach(function (r) {
      var pk = r.project_number || '(none)';
      if (!byProj[pk]) byProj[pk] = { num: pk, client: r.client_name || r.client || '', name: r.project_name || '', rev: 0, fld: 0, cost: 0 };
      byProj[pk].rev++; byProj[pk].fld += (r.field_count || 0); byProj[pk].cost += (parseFloat(r.cost_usd) || 0);
      tCost += (parseFloat(r.cost_usd) || 0); tRev++;
    });
    var desc = 'Billing cycle: ' + (from || '?') + ' to ' + (to || '?');
    if (uf !== 'all') desc += ' · User: ' + _pnum(uf) + ' / ' + _pini(uf);
    if (pf !== 'all') desc += ' · Project: ' + pf;
    if (tf !== 'all') desc += ' · Tool: ' + tf;

    var w = window.open('', '_blank', 'width=850,height=700');
    w.document.write('<!DOCTYPE html><html><head><title>ARENCON AI Usage Report</title><style>');
    w.document.write('.export-bar{position:fixed;top:0;left:0;right:0;height:48px;background:#2C4770;display:flex;align-items:center;padding:0 16px;gap:10px;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.3);}');
    w.document.write('.export-bar button{border:none;border-radius:6px;padding:8px 18px;font-family:Calibri,sans-serif;font-size:14px;font-weight:700;cursor:pointer;}');
    w.document.write('.export-bar .btn-export{background:#1A7A4A;color:white;}.export-bar .btn-export:hover{background:#15693f;}');
    w.document.write('.export-bar .btn-close{background:#455A64;color:white;}.export-bar .btn-close:hover{background:#37474F;}');
    w.document.write('.export-bar .hint{flex:1;color:rgba(255,255,255,.6);font-size:12px;font-family:Calibri,sans-serif;}');
    w.document.write('body{margin:0;padding:0;background:#525659;font-family:Calibri,sans-serif;}');
    w.document.write('.page{width:8.5in;min-height:11in;margin:60px auto 20px;padding:0.75in;background:white;box-shadow:0 2px 12px rgba(0,0,0,.3);box-sizing:border-box;color:#333;}');
    w.document.write('h1{color:#9C2742;font-size:20px;margin:0 0 4px;}h2{color:#9C2742;font-size:15px;border-bottom:2px solid #9C2742;padding-bottom:4px;margin:20px 0 8px;}');
    w.document.write('table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;}th{background:#f5f5f5;padding:6px 8px;text-align:left;border-bottom:2px solid #ccc;font-weight:700;}td{padding:5px 8px;border-bottom:1px solid #eee;}');
    w.document.write('.r{text-align:right;}.cost{text-align:right;font-family:Courier New,monospace;}.total td{font-weight:700;border-top:2px solid #999;background:#f5f5f5;}.meta{font-size:12px;color:#666;margin-bottom:16px;}');
    w.document.write('@media print{.export-bar{display:none!important;}.page{margin:0;padding:0.5in;box-shadow:none;min-height:auto;}}');
    w.document.write('</style></head><body>');
    w.document.write('<div class="export-bar"><button class="btn-export" onclick="window.print()">📄 Export PDF</button><span class="hint">Preview — click Export to save as PDF</span><button class="btn-close" onclick="window.close()">✕ Close</button></div>');
    w.document.write('<div class="page">');
    w.document.write('<h1>ARENCON Inc. — AI Usage Report</h1><div class="meta">' + _esc(desc) + '<br>Generated: ' + new Date().toLocaleDateString() + '</div>');
    w.document.write('<h2>Summary by Project</h2><table><tr><th>Project #</th><th>Client</th><th>Project Name</th><th class="r">Records</th><th class="r">Fields</th><th class="cost">Cost</th></tr>');
    Object.keys(byProj).sort().forEach(function (k) {
      var p = byProj[k];
      w.document.write('<tr><td>' + _esc(p.num) + '</td><td>' + _esc(p.client) + '</td><td>' + _esc(p.name) + '</td><td class="r">' + p.rev + '</td><td class="r">' + p.fld + '</td><td class="cost">$' + p.cost.toFixed(4) + '</td></tr>');
    });
    w.document.write('<tr class="total"><td colspan="3">TOTAL</td><td class="r">' + tRev + '</td><td></td><td class="cost">$' + tCost.toFixed(4) + '</td></tr></table>');
    w.document.write('<h2>Detail Log</h2><table><tr><th>Date</th><th>User #</th><th>Initial</th><th>Project #</th><th>Tool</th><th class="r">Fields</th><th class="cost">Cost</th></tr>');
    fd.forEach(function (r) {
      w.document.write('<tr><td>' + (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') + '</td><td>' + _esc(_pnum(r.user_id)) + '</td><td>' + _esc(_pini(r.user_id)) + '</td><td>' + _esc(r.project_number || '') + '</td><td>' + _esc(r.tool || '') + '</td><td class="r">' + (r.field_count || 0) + '</td><td class="cost">$' + (parseFloat(r.cost_usd) || 0).toFixed(4) + '</td></tr>');
    });
    w.document.write('</table></div></body></html>');
    w.document.close();
  }

  window.AIUsage = { open: open, close: close, exportCSV: exportCSV, exportPDF: exportPDF };
})();
