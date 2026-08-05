/**
 * ARENCON FRT v2 — AI Usage Tracking Dashboard
 * All users can view. Billing day editable by admin only.
 * Filter by PM, project, date range. CSV + PDF export.
 */

import { toast } from '../shared/toast.js';
import { lockScroll, unlockScroll } from '../../../lib/shared/scrollLock.js';

var SB_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';
var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';
var _overlay = null;
var _data = [];
var _billingDay = 20;
var _profileMap = {};   // lower(email) -> { num, init }

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Resolve an ai_usage_log row's user_email to { num, init } for display.
// Falls back gracefully when a profile has no number/initials set yet:
//  - num  : profiles.user_number, else '—'
//  - init : profiles.initials, else derived from the email prefix, else '—'
function _resolveUser(email) {
  var key = String(email || '').trim().toLowerCase();
  var p = _profileMap[key];
  var num = (p && p.num) ? p.num : '\u2014';
  var init = (p && p.init) ? p.init : _deriveInit(key);
  return { num: num, init: init };
}
function _deriveInit(email) {
  // Best-effort from the email local-part (e.g. "mhe" -> "MH" first+last char,
  // single char -> that char). Only used when no canonical initials are set.
  var local = String(email || '').split('@')[0].replace(/[^a-z]/gi, '');
  if (!local) return '\u2014';
  if (local.length >= 2) return (local.charAt(0) + local.charAt(local.length - 1)).toUpperCase();
  return local.toUpperCase();
}
function _loadProfiles(cb) {
  fetch(SB_URL + '/rest/v1/profiles?select=email,user_number,initials', { headers: _sbHeaders() })
  .then(function(r) { return r.ok ? r.json() : []; })
  .then(function(rows) {
    _profileMap = {};
    (rows || []).forEach(function(p) {
      if (!p || !p.email) return;
      _profileMap[String(p.email).trim().toLowerCase()] = { num: p.user_number || '', init: p.initials || '' };
    });
    if (cb) cb();
  })
  .catch(function() { if (cb) cb(); });  // non-fatal: fall back to derived
}
function _sbHeaders() {
  var h = { 'apikey': SB_ANON, 'Content-Type': 'application/json' };
  var t = localStorage.getItem('sb-access-token');
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}
function _isAdmin() {
  var role = localStorage.getItem('ARENCON_role') || '';
  return role === 'super_admin' || role === 'admin';
}

function open() {
  _ensureOverlay();
  if (!_overlay.classList.contains('open')) lockScroll();
  _overlay.classList.add('open');
  _loadBillingDay(function() { _setBillingCycleDates('current'); _fetchData(); });
}
function close() { if (_overlay && _overlay.classList.contains('open')) { unlockScroll(); _overlay.classList.remove('open'); } }

function _loadBillingDay(cb) {
  fetch(SB_URL + '/rest/v1/app_settings?key=eq.billing_day&select=value', { headers: _sbHeaders() })
  .then(function(r) { return r.json(); })
  .then(function(rows) {
    if (rows && rows.length > 0) _billingDay = parseInt(rows[0].value) || 20;
    var el = document.getElementById('ai-usage-bday');
    if (el) { el.value = _billingDay; el.disabled = !_isAdmin(); }
    if (cb) cb();
  }).catch(function() { if (cb) cb(); });
}

function _saveBillingDay(d) {
  if (!_isAdmin()) { toast('\u26A0 Only admins can change billing day'); return; }
  d = Math.max(1, Math.min(28, parseInt(d) || 20));
  _billingDay = d;
  fetch(SB_URL + '/rest/v1/app_settings?key=eq.billing_day', {
    method: 'PATCH', headers: _sbHeaders(),
    body: JSON.stringify({ value: String(d), updated_at: new Date().toISOString() })
  }).then(function(r) {
    toast(r.ok ? '\u2714 Billing day: ' + d + 'th' : '\u26A0 Failed');
  }).catch(function() { toast('\u26A0 Failed'); });
}

function _billingCycleRange(offset) {
  var day = _billingDay, now = new Date();
  var y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  var sM, sY, eM, eY;
  if (d >= day) { sM = m + offset; sY = y; eM = m + 1 + offset; eY = y; }
  else { sM = m - 1 + offset; sY = y; eM = m + offset; eY = y; }
  while (sM < 0) { sM += 12; sY--; } while (sM > 11) { sM -= 12; sY++; }
  while (eM < 0) { eM += 12; eY--; } while (eM > 11) { eM -= 12; eY++; }
  return { from: new Date(sY, sM, day), to: new Date(eY, eM, day - 1) };
}

function _setBillingCycleDates(period) {
  var fE = document.getElementById('ai-usage-from'), tE = document.getElementById('ai-usage-to');
  if (!fE || !tE) return;
  var now = new Date(), from, to;
  if (period === 'current' || period === 'last') { var r = _billingCycleRange(period === 'last' ? -1 : 0); from = r.from; to = r.to; }
  else if (period === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  else if (period === 'week') { from = new Date(now); from.setDate(now.getDate() - now.getDay()); to = new Date(now); }
  else if (period === 'today') { from = new Date(now); to = new Date(now); }
  else if (period === 'all') { from = new Date(2024, 0, 1); to = new Date(now); }
  if (from) fE.value = from.toISOString().split('T')[0];
  if (to) tE.value = to.toISOString().split('T')[0];
}

function _ensureOverlay() {
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.className = 'ai-usage-overlay';
  /* backdrop-click close disabled (accidental dismiss) */
  var adm = _isAdmin();
  _overlay.innerHTML = '<div class="ai-usage-modal" onclick="event.stopPropagation()">'
    + '<div class="ai-usage-hdr"><h3>\uD83D\uDCCA AI Usage Tracking</h3><div class="ai-usage-hdr-btns">'
    + '<button id="aiu-csv">\uD83D\uDCC4 CSV</button><button id="aiu-pdf">\uD83D\uDCC4 PDF</button><button id="aiu-close" style="font-size:16px;">\u2715</button></div></div>'
    + '<div class="ai-usage-filters" id="aiu-period-btns"></div>'
    + '<div class="ai-usage-filters" style="border-bottom:1px solid var(--border);flex-wrap:wrap;">'
    + '<label>From</label><input type="date" id="ai-usage-from">'
    + '<label>To</label><input type="date" id="ai-usage-to">'
    + '<button id="aiu-filter-btn">Apply</button>'
    + '</div>'
    + '<div class="ai-usage-filters" style="border-bottom:1px solid var(--border);flex-wrap:wrap;">'
    + '<label>PM</label><select id="ai-usage-user" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));min-width:140px;"><option value="all">All Users</option></select>'
    + '<label>Project</label><select id="ai-usage-project" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));min-width:140px;"><option value="all">All Projects</option></select>'
    + '<label>Tool</label><select id="ai-usage-tool" style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));min-width:120px;"><option value="all">All Tools</option></select>'
    + '<span style="margin-left:auto;font-size:calc(11px + var(--ts));color:var(--steel);">Billing day: <input type="number" id="ai-usage-bday" value="' + _billingDay + '" min="1" max="28"' + (adm ? '' : ' disabled') + ' style="width:40px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));padding:2px 4px;border:1px solid var(--border);border-radius:4px;"> of month' + (adm ? '' : ' \uD83D\uDD12') + '</span>'
    + '</div>'
    + '<div class="ai-usage-body" id="ai-usage-body"><div class="ai-usage-loading">Loading...</div></div></div>';
  document.body.appendChild(_overlay);
  _overlay.querySelector('#aiu-close').addEventListener('click', close);
  _overlay.querySelector('#aiu-csv').addEventListener('click', exportCSV);
  _overlay.querySelector('#aiu-pdf').addEventListener('click', exportPDF);
  _overlay.querySelector('#aiu-filter-btn').addEventListener('click', function() { _render(); });
  var bday = _overlay.querySelector('#ai-usage-bday');
  if (bday) bday.addEventListener('change', function() { _saveBillingDay(this.value); });
  // User/project dropdown changes trigger re-render
  _overlay.querySelector('#ai-usage-user').addEventListener('change', function() { _render(); });
  _overlay.querySelector('#ai-usage-project').addEventListener('change', function() { _render(); });
  _overlay.querySelector('#ai-usage-tool').addEventListener('change', function() { _render(); });
  // Period buttons
  [{ l: 'This Cycle', v: 'current', bg: '#1A7A4A' }, { l: 'Last Cycle', v: 'last' }, { l: 'This Month', v: 'month' }, { l: 'This Week', v: 'week' }, { l: 'Today', v: 'today' }, { l: 'All Time', v: 'all' }].forEach(function(p) {
    var btn = document.createElement('button');
    btn.textContent = p.l;
    if (p.bg) btn.style.background = p.bg;
    btn.addEventListener('click', function() { _setBillingCycleDates(p.v); _fetchData(); });
    _overlay.querySelector('#aiu-period-btns').appendChild(btn);
  });
}

function _fetchData() {
  var body = document.getElementById('ai-usage-body');
  if (body) body.innerHTML = '<div class="ai-usage-loading"><div class="ai-spinner" style="display:inline-block;width:20px;height:20px;border:3px solid #ddd;border-top-color:#9C2742;border-radius:50%;animation:ai-spin .6s linear infinite;"></div><br>Loading\u2026</div>';
  var from = document.getElementById('ai-usage-from').value;
  var to = document.getElementById('ai-usage-to').value;
  var q = '/rest/v1/ai_usage_log?select=*&order=created_at.desc';
  if (from) q += '&created_at=gte.' + from + 'T00:00:00Z';
  if (to) q += '&created_at=lte.' + to + 'T23:59:59Z';
  fetch(SB_URL + q, { headers: _sbHeaders() })
  .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(function(rows) { _data = rows || []; _loadProfiles(function() { _populateDropdowns(); _render(); }); })
  .catch(function(err) { if (body) body.innerHTML = '<div class="ai-usage-loading" style="color:#C62828;">\u26A0 ' + _esc(err.message) + '</div>'; });
}

function _populateDropdowns() {
  var users = {}, projs = {}, tools = {};
  _data.forEach(function(r) {
    if (r.user_email) users[r.user_email] = true;
    if (r.project_number) projs[r.project_number] = r.project_name || '';
    if (r.tool) tools[r.tool] = true;
  });
  var uSel = document.getElementById('ai-usage-user'), pSel = document.getElementById('ai-usage-project'), tSel = document.getElementById('ai-usage-tool');
  if (uSel) { var cv = uSel.value; uSel.innerHTML = '<option value="all">All Users</option>'; Object.keys(users).sort().forEach(function(e) { var ru = _resolveUser(e); uSel.innerHTML += '<option value="' + _esc(e) + '"' + (cv === e ? ' selected' : '') + '>' + _esc(ru.num + ' ' + ru.init) + '</option>'; }); }
  if (pSel) { var cv2 = pSel.value; pSel.innerHTML = '<option value="all">All Projects</option>'; Object.keys(projs).sort().forEach(function(n) { pSel.innerHTML += '<option value="' + _esc(n) + '"' + (cv2 === n ? ' selected' : '') + '>' + _esc(n + ' \u2014 ' + projs[n]) + '</option>'; }); }
  if (tSel) { var cv3 = tSel.value; tSel.innerHTML = '<option value="all">All Tools</option>'; Object.keys(tools).sort().forEach(function(t) { tSel.innerHTML += '<option value="' + _esc(t) + '"' + (cv3 === t ? ' selected' : '') + '>' + _esc(t) + '</option>'; }); }
}

function _filtered() {
  var uf = (document.getElementById('ai-usage-user') || {}).value || 'all';
  var pf = (document.getElementById('ai-usage-project') || {}).value || 'all';
  var tf = (document.getElementById('ai-usage-tool') || {}).value || 'all';
  return _data.filter(function(r) {
    if (uf !== 'all' && r.user_email !== uf) return false;
    if (pf !== 'all' && r.project_number !== pf) return false;
    if (tf !== 'all' && r.tool !== tf) return false;
    return true;
  });
}

function _render() {
  var body = document.getElementById('ai-usage-body');
  if (!body) return;
  var fd = _filtered();
  var from = (document.getElementById('ai-usage-from') || {}).value || '';
  var to = (document.getElementById('ai-usage-to') || {}).value || '';
  if (!fd.length) { body.innerHTML = '<div class="ai-usage-loading">No records found.</div>'; return; }

  var byProj = {}, byUser = {}, tCost = 0, tRev = 0, tFld = 0;
  fd.forEach(function(r) {
    var pk = (r.project_number || '(none)') + '|' + (r.project_name || '');
    if (!byProj[pk]) byProj[pk] = { num: r.project_number || '(none)', client: r.client_name || r.client || '', name: r.project_name || '', rev: 0, fld: 0, cost: 0, tools: {} };
    byProj[pk].rev++; byProj[pk].fld += (r.field_count || 0); byProj[pk].cost += (parseFloat(r.cost_usd) || 0); byProj[pk].tools[r.tool || '?'] = true;
    var uk = r.user_email || '?';
    if (!byUser[uk]) byUser[uk] = { email: uk, rev: 0, fld: 0, cost: 0 };
    byUser[uk].rev++; byUser[uk].fld += (r.field_count || 0); byUser[uk].cost += (parseFloat(r.cost_usd) || 0);
    tCost += (parseFloat(r.cost_usd) || 0); tRev++; tFld += (r.field_count || 0);
  });

  var h = '<div style="padding:8px 0;font-size:calc(12px + var(--ts));color:var(--steel);">' + fd.length + ' records \u00B7 ' + from + ' to ' + to + ' \u00B7 Total: <strong style="color:var(--fg);">$' + tCost.toFixed(4) + '</strong></div>';
  // Project table
  h += '<div class="ai-usage-section"><h4>Summary by Project</h4><table class="ai-usage-table"><tr><th style="min-width:80px;">Project #</th><th>Client</th><th>Project Name</th><th style="width:70px;">Tool(s)</th><th style="width:60px;text-align:right;">Reviews</th><th style="width:50px;text-align:right;">Fields</th><th style="width:80px;text-align:right;">Cost</th></tr>';
  Object.keys(byProj).sort().forEach(function(k) { var p = byProj[k]; h += '<tr><td>' + _esc(p.num) + '</td><td>' + _esc(p.client) + '</td><td>' + _esc(p.name) + '</td><td>' + _esc(Object.keys(p.tools).join(', ')) + '</td><td style="text-align:right;">' + p.rev + '</td><td style="text-align:right;">' + p.fld + '</td><td style="text-align:right;font-family:Courier New,monospace;">$' + p.cost.toFixed(4) + '</td></tr>'; });
  h += '<tr class="total-row"><td colspan="4"><strong>TOTAL</strong></td><td style="text-align:right;"><strong>' + tRev + '</strong></td><td style="text-align:right;"><strong>' + tFld + '</strong></td><td style="text-align:right;font-family:Courier New,monospace;"><strong>$' + tCost.toFixed(4) + '</strong></td></tr></table></div>';
  // User table
  h += '<div class="ai-usage-section"><h4>Summary by User</h4><table class="ai-usage-table"><tr><th style="width:90px;">User #</th><th style="width:60px;">Initials</th><th style="width:60px;text-align:right;">Reviews</th><th style="width:50px;text-align:right;">Fields</th><th style="width:80px;text-align:right;">Cost</th></tr>';
  Object.keys(byUser).sort().forEach(function(k) { var u = byUser[k]; var ru = _resolveUser(u.email); h += '<tr><td>' + _esc(ru.num) + '</td><td>' + _esc(ru.init) + '</td><td style="text-align:right;">' + u.rev + '</td><td style="text-align:right;">' + u.fld + '</td><td style="text-align:right;font-family:Courier New,monospace;">$' + u.cost.toFixed(4) + '</td></tr>'; });
  h += '</table></div>';
  // Detail log
  h += '<div class="ai-usage-section"><h4>Detail Log</h4><table class="ai-usage-table"><tr><th style="width:80px;">Date</th><th style="width:80px;">User #</th><th style="width:55px;">Initials</th><th style="width:80px;">Project #</th><th style="width:45px;">Tool</th><th style="width:45px;text-align:right;">Fields</th><th style="width:80px;text-align:right;">Cost</th></tr>';
  fd.forEach(function(r) { var ru = _resolveUser(r.user_email); h += '<tr><td>' + (r.created_at ? new Date(r.created_at).toLocaleDateString() : '?') + '</td><td>' + _esc(ru.num) + '</td><td>' + _esc(ru.init) + '</td><td>' + _esc(r.project_number || '-') + '</td><td>' + _esc(r.tool || '?') + '</td><td style="text-align:right;">' + (r.field_count || 0) + '</td><td style="text-align:right;font-family:Courier New,monospace;">$' + (parseFloat(r.cost_usd) || 0).toFixed(4) + '</td></tr>'; });
  h += '</table></div>';
  body.innerHTML = h;
}

function exportCSV() {
  var fd = _filtered();
  if (!fd.length) { toast('No data'); return; }
  var lines = ['Date,User #,Initials,Project Number,Project Name,Tool,Model,Fields,Cost USD'];
  fd.forEach(function(r) { var ru = _resolveUser(r.user_email); lines.push([r.created_at ? new Date(r.created_at).toISOString() : '', '"' + ru.num + '"', '"' + ru.init + '"', '"' + (r.project_number || '') + '"', '"' + (r.project_name || '') + '"', r.tool || '', r.model || '', r.field_count || 0, (parseFloat(r.cost_usd) || 0).toFixed(6)].join(',')); });
  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ARENCON_AI_Usage.csv'; a.click(); URL.revokeObjectURL(a.href);
  toast('\uD83D\uDCC4 CSV downloaded');
}

function exportPDF() {
  var fd = _filtered();
  if (!fd.length) { toast('No data'); return; }
  var from = (document.getElementById('ai-usage-from') || {}).value || '';
  var to = (document.getElementById('ai-usage-to') || {}).value || '';
  var uf = (document.getElementById('ai-usage-user') || {}).value || 'all';
  var pf = (document.getElementById('ai-usage-project') || {}).value || 'all';
  var byProj = {}, tCost = 0, tRev = 0;
  fd.forEach(function(r) { var pk = r.project_number || '(none)'; if (!byProj[pk]) byProj[pk] = { num: pk, name: r.project_name || '', rev: 0, fld: 0, cost: 0 }; byProj[pk].rev++; byProj[pk].fld += (r.field_count || 0); byProj[pk].cost += (parseFloat(r.cost_usd) || 0); tCost += (parseFloat(r.cost_usd) || 0); tRev++; });
  var desc = 'Billing cycle: ' + (from || '?') + ' to ' + (to || '?');
  if (uf !== 'all') { var ruf = _resolveUser(uf); desc += ' \u00B7 User: ' + ruf.num + ' ' + ruf.init; }
  if (pf !== 'all') desc += ' \u00B7 Project: ' + pf;

  var w = window.open('', '_blank', 'width=850,height=700');
  w.document.write('<!DOCTYPE html><html><head><title>ARENCON AI Usage Report</title><style>');
  // Export bar styles
  w.document.write('.export-bar{position:fixed;top:0;left:0;right:0;height:48px;background:#2C4770;display:flex;align-items:center;padding:0 16px;gap:10px;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.3);}');
  w.document.write('.export-bar button{border:none;border-radius:6px;padding:8px 18px;font-family:Calibri,sans-serif;font-size:14px;font-weight:700;cursor:pointer;}');
  w.document.write('.export-bar .btn-export{background:#1A7A4A;color:white;}.export-bar .btn-export:hover{background:#15693f;}');
  w.document.write('.export-bar .btn-close{background:#455A64;color:white;}.export-bar .btn-close:hover{background:#37474F;}');
  w.document.write('.export-bar .hint{flex:1;color:rgba(255,255,255,.6);font-size:12px;font-family:Calibri,sans-serif;}');
  // Page styles
  w.document.write('body{margin:0;padding:0;background:#525659;font-family:Calibri,sans-serif;}');
  w.document.write('.page{width:8.5in;min-height:11in;margin:60px auto 20px;padding:0.75in;background:white;box-shadow:0 2px 12px rgba(0,0,0,.3);box-sizing:border-box;color:#333;}');
  w.document.write('h1{color:#9C2742;font-size:20px;margin:0 0 4px;}h2{color:#9C2742;font-size:15px;border-bottom:2px solid #9C2742;padding-bottom:4px;margin:20px 0 8px;}');
  w.document.write('table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;}th{background:#f5f5f5;padding:6px 8px;text-align:left;border-bottom:2px solid #ccc;font-weight:700;}td{padding:5px 8px;border-bottom:1px solid #eee;}');
  w.document.write('.r{text-align:right;}.cost{text-align:right;font-family:Courier New,monospace;}.total td{font-weight:700;border-top:2px solid #999;background:#f5f5f5;}.meta{font-size:12px;color:#666;margin-bottom:16px;}');
  w.document.write('@media print{.export-bar{display:none!important;}.page{margin:0;padding:0.5in;box-shadow:none;min-height:auto;}}');
  w.document.write('</style></head><body>');

  // Export bar
  w.document.write('<div class="export-bar"><button class="btn-export" onclick="window.print()">\uD83D\uDCC4 Export PDF</button><span class="hint">Preview \u2014 click Export to save as PDF</span><button class="btn-close" onclick="window.close()">\u2715 Close</button></div>');

  // Page content
  w.document.write('<div class="page">');
  w.document.write('<h1>ARENCON Inc. \u2014 AI Usage Report</h1><div class="meta">' + desc + '<br>Generated: ' + new Date().toLocaleDateString() + '</div>');
  w.document.write('<h2>Summary by Project</h2><table><tr><th>Project #</th><th>Client</th><th>Project Name</th><th class="r">Reviews</th><th class="r">Fields</th><th class="cost">Cost</th></tr>');
  Object.keys(byProj).sort().forEach(function(k) { var p = byProj[k]; w.document.write('<tr><td>' + p.num + '</td><td>' + (p.client || '') + '</td><td>' + p.name + '</td><td class="r">' + p.rev + '</td><td class="r">' + p.fld + '</td><td class="cost">$' + p.cost.toFixed(4) + '</td></tr>'); });
  w.document.write('<tr class="total"><td colspan="3">TOTAL</td><td class="r">' + tRev + '</td><td></td><td class="cost">$' + tCost.toFixed(4) + '</td></tr></table>');
  w.document.write('<h2>Detail Log</h2><table><tr><th>Date</th><th>User #</th><th>Initials</th><th>Project #</th><th>Tool</th><th class="r">Fields</th><th class="cost">Cost</th></tr>');
  fd.forEach(function(r) { var ru = _resolveUser(r.user_email); w.document.write('<tr><td>' + (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') + '</td><td>' + ru.num + '</td><td>' + ru.init + '</td><td>' + (r.project_number || '') + '</td><td>' + (r.tool || '') + '</td><td class="r">' + (r.field_count || 0) + '</td><td class="cost">$' + (parseFloat(r.cost_usd) || 0).toFixed(4) + '</td></tr>'); });
  w.document.write('</table></div></body></html>');
  w.document.close();
}

export var AIUsage = { open: open, close: close, exportCSV: exportCSV, exportPDF: exportPDF };
window.AIUsage = AIUsage;
