/**
 * ARENCON FRT v2 — AI Usage Tracking Dashboard
 * ══════════════════════════════════════════════
 * 
 * Admin-only dashboard showing AI usage by project, user, and date.
 * Queries ai_usage_log from Supabase.
 * CSV and PDF export.
 */

import { Auth } from '../shared/auth.js';
import { toast } from '../shared/toast.js';

var SB_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';
var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';
var _overlay = null;
var _data = [];
var _billingDay = 20;

function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function _sbHeaders() {
  var h = { 'apikey': SB_ANON, 'Content-Type': 'application/json' };
  var t = localStorage.getItem('sb-access-token');
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}

function _isAdmin() {
  var u = Auth.getUser();
  if (!u) return false;
  var role = localStorage.getItem('ARENCON_role') || '';
  return role === 'super_admin' || role === 'admin';
}

function open() {
  _ensureOverlay();
  _overlay.classList.add('open');
  _loadBillingDay(function() {
    _setBillingCycleDates('current');
    _fetchData();
  });
}

function close() {
  if (_overlay) _overlay.classList.remove('open');
}

function _loadBillingDay(cb) {
  fetch(SB_URL + '/rest/v1/app_settings?key=eq.billing_day&select=value', { headers: _sbHeaders() })
  .then(function(r) { return r.json(); })
  .then(function(rows) {
    if (rows && rows.length > 0) _billingDay = parseInt(rows[0].value) || 20;
    var el = document.getElementById('ai-usage-bday');
    if (el) el.value = _billingDay;
    if (cb) cb();
  }).catch(function() { if (cb) cb(); });
}

function _saveBillingDay(d) {
  d = Math.max(1, Math.min(28, parseInt(d) || 20));
  _billingDay = d;
  fetch(SB_URL + '/rest/v1/app_settings?key=eq.billing_day', {
    method: 'PATCH', headers: _sbHeaders(),
    body: JSON.stringify({ value: String(d), updated_at: new Date().toISOString() })
  }).then(function(r) {
    toast(r.ok ? '\u2714 Billing day saved: ' + d + 'th' : '\u26A0 Failed to save');
  }).catch(function() { toast('\u26A0 Failed to save'); });
}

function _billingCycleRange(offset) {
  var day = _billingDay;
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  var startM, startY, endM, endY;
  if (d >= day) { startM = m + offset; startY = y; endM = m + 1 + offset; endY = y; }
  else { startM = m - 1 + offset; startY = y; endM = m + offset; endY = y; }
  while (startM < 0) { startM += 12; startY--; }
  while (startM > 11) { startM -= 12; startY++; }
  while (endM < 0) { endM += 12; endY--; }
  while (endM > 11) { endM -= 12; endY++; }
  return { from: new Date(startY, startM, day), to: new Date(endY, endM, day - 1) };
}

function _setBillingCycleDates(period) {
  var fromEl = document.getElementById('ai-usage-from');
  var toEl = document.getElementById('ai-usage-to');
  if (!fromEl || !toEl) return;
  var now = new Date();
  var from, to;
  if (period === 'current' || period === 'last') {
    var r = _billingCycleRange(period === 'last' ? -1 : 0);
    from = r.from; to = r.to;
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (period === 'week') {
    from = new Date(now); from.setDate(now.getDate() - now.getDay());
    to = new Date(now);
  } else if (period === 'today') {
    from = new Date(now); to = new Date(now);
  }
  if (from) fromEl.value = from.toISOString().split('T')[0];
  if (to) toEl.value = to.toISOString().split('T')[0];
}

function _ensureOverlay() {
  if (_overlay) return;
  _overlay = document.createElement('div');
  _overlay.className = 'ai-usage-overlay';
  _overlay.addEventListener('click', function(e) { if (e.target === _overlay) close(); });
  _overlay.innerHTML = '<div class="ai-usage-modal" onclick="event.stopPropagation()">'
    + '<div class="ai-usage-hdr"><h3>\uD83D\uDCCA AI Usage Tracking</h3><div class="ai-usage-hdr-btns">'
    + '<button id="aiu-csv">\uD83D\uDCC4 CSV</button>'
    + '<button id="aiu-pdf">\uD83D\uDCC4 PDF</button>'
    + '<button id="aiu-close" style="font-size:16px;">\u2715</button>'
    + '</div></div>'
    + '<div class="ai-usage-filters" id="aiu-period-btns"></div>'
    + '<div class="ai-usage-filters" style="border-bottom:1px solid var(--border,#ddd);">'
    + '<label>From</label><input type="date" id="ai-usage-from">'
    + '<label>To</label><input type="date" id="ai-usage-to">'
    + '<button id="aiu-filter-btn">Filter</button>'
    + '<span style="margin-left:auto;font-size:calc(11px + var(--ts));color:var(--steel,#607D8B);">Billing day: <input type="number" id="ai-usage-bday" value="' + _billingDay + '" min="1" max="28" style="width:40px;font-family:Calibri,sans-serif;font-size:calc(11px + var(--ts));padding:2px 4px;border:1px solid var(--border,#ccc);border-radius:4px;"> of month</span>'
    + '</div>'
    + '<div class="ai-usage-body" id="ai-usage-body"><div class="ai-usage-loading">Loading...</div></div></div>';
  document.body.appendChild(_overlay);

  // Wire buttons
  _overlay.querySelector('#aiu-close').addEventListener('click', close);
  _overlay.querySelector('#aiu-csv').addEventListener('click', exportCSV);
  _overlay.querySelector('#aiu-pdf').addEventListener('click', exportPDF);
  _overlay.querySelector('#aiu-filter-btn').addEventListener('click', _fetchData);
  _overlay.querySelector('#ai-usage-bday').addEventListener('change', function() { _saveBillingDay(this.value); });

  // Period buttons
  var periods = [
    { label: 'This Cycle', val: 'current', bg: '#1A7A4A' },
    { label: 'Last Cycle', val: 'last', bg: '' },
    { label: 'This Month', val: 'month', bg: '' },
    { label: 'This Week', val: 'week', bg: '' },
    { label: 'Today', val: 'today', bg: '' }
  ];
  var pbWrap = _overlay.querySelector('#aiu-period-btns');
  periods.forEach(function(p) {
    var btn = document.createElement('button');
    btn.textContent = p.label;
    if (p.bg) btn.style.background = p.bg;
    btn.addEventListener('click', function() { _setBillingCycleDates(p.val); _fetchData(); });
    pbWrap.appendChild(btn);
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
  .then(function(rows) { _data = rows || []; _render(); })
  .catch(function(err) {
    if (body) body.innerHTML = '<div class="ai-usage-loading" style="color:#C62828;">\u26A0 ' + _esc(err.message) + '</div>';
  });
}

function _render() {
  var body = document.getElementById('ai-usage-body');
  if (!body) return;
  if (!_data.length) { body.innerHTML = '<div class="ai-usage-loading">No AI usage records found.</div>'; return; }

  var byProj = {}, byUser = {}, totalCost = 0, totalReviews = 0, totalFields = 0;
  _data.forEach(function(r) {
    var pk = (r.project_number || '(none)') + '|' + (r.project_name || '');
    if (!byProj[pk]) byProj[pk] = { num: r.project_number || '(none)', name: r.project_name || '', reviews: 0, fields: 0, cost: 0, tools: {} };
    byProj[pk].reviews++; byProj[pk].fields += (r.field_count || 0); byProj[pk].cost += (parseFloat(r.cost_usd) || 0);
    byProj[pk].tools[r.tool || '?'] = true;
    var uk = r.user_email || 'unknown';
    if (!byUser[uk]) byUser[uk] = { email: uk, reviews: 0, fields: 0, cost: 0 };
    byUser[uk].reviews++; byUser[uk].fields += (r.field_count || 0); byUser[uk].cost += (parseFloat(r.cost_usd) || 0);
    totalCost += (parseFloat(r.cost_usd) || 0); totalReviews++; totalFields += (r.field_count || 0);
  });

  var html = '<div class="ai-usage-section"><h4>Summary by Project</h4><table class="ai-usage-table">';
  html += '<tr><th>Project #</th><th>Project Name</th><th>Tool(s)</th><th>Reviews</th><th>Fields</th><th class="cost">Cost</th></tr>';
  Object.keys(byProj).sort().forEach(function(k) {
    var p = byProj[k];
    html += '<tr><td>' + _esc(p.num) + '</td><td>' + _esc(p.name) + '</td><td>' + _esc(Object.keys(p.tools).join(', ')) + '</td><td>' + p.reviews + '</td><td>' + p.fields + '</td><td class="cost">$' + p.cost.toFixed(4) + '</td></tr>';
  });
  html += '<tr class="total-row"><td colspan="3">TOTAL</td><td>' + totalReviews + '</td><td>' + totalFields + '</td><td class="cost">$' + totalCost.toFixed(4) + '</td></tr></table></div>';

  html += '<div class="ai-usage-section"><h4>Summary by User</h4><table class="ai-usage-table">';
  html += '<tr><th>User</th><th>Reviews</th><th>Fields</th><th class="cost">Cost</th></tr>';
  Object.keys(byUser).sort().forEach(function(k) {
    var u = byUser[k];
    html += '<tr><td>' + _esc(u.email) + '</td><td>' + u.reviews + '</td><td>' + u.fields + '</td><td class="cost">$' + u.cost.toFixed(4) + '</td></tr>';
  });
  html += '</table></div>';

  html += '<div class="ai-usage-section"><h4>Detail Log</h4><table class="ai-usage-table">';
  html += '<tr><th>Date</th><th>User</th><th>Project #</th><th>Tool</th><th>Fields</th><th class="cost">Cost</th></tr>';
  _data.forEach(function(r) {
    var dt = r.created_at ? new Date(r.created_at).toLocaleDateString() : '?';
    html += '<tr><td>' + dt + '</td><td>' + _esc(r.user_email || '?') + '</td><td>' + _esc(r.project_number || '-') + '</td><td>' + _esc(r.tool || '?') + '</td><td>' + (r.field_count || 0) + '</td><td class="cost">$' + (parseFloat(r.cost_usd) || 0).toFixed(4) + '</td></tr>';
  });
  html += '</table></div>';
  body.innerHTML = html;
}

function exportCSV() {
  if (!_data.length) { toast('No data'); return; }
  var lines = ['Date,User,Project Number,Project Name,Tool,Model,Fields,Accepted,Input Tokens,Output Tokens,Cost USD'];
  _data.forEach(function(r) {
    lines.push([
      r.created_at ? new Date(r.created_at).toISOString() : '',
      '"' + (r.user_email || '') + '"',
      '"' + (r.project_number || '') + '"',
      '"' + (r.project_name || '') + '"',
      r.tool || '', r.model || '',
      r.field_count || 0, r.accepted_count || '',
      r.input_tokens || 0, r.output_tokens || 0,
      (parseFloat(r.cost_usd) || 0).toFixed(6)
    ].join(','));
  });
  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ARENCON_AI_Usage.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('\uD83D\uDCC4 CSV downloaded');
}

function exportPDF() {
  if (!_data.length) { toast('No data'); return; }
  var w = window.open('', '_blank', 'width=800,height=600');
  w.document.write('<!DOCTYPE html><html><head><title>ARENCON AI Usage Report</title>');
  w.document.write('<style>body{font-family:Calibri,sans-serif;padding:24px;color:#333;}h1{color:#9C2742;font-size:20px;}h2{color:#9C2742;font-size:15px;border-bottom:2px solid #9C2742;padding-bottom:4px;margin:20px 0 8px;}table{width:100%;border-collapse:collapse;font-size:12px;}th{background:#f5f5f5;padding:6px 8px;text-align:left;border-bottom:2px solid #ccc;}td{padding:5px 8px;border-bottom:1px solid #eee;}.cost{text-align:right;font-family:Courier New,monospace;}.total td{font-weight:700;border-top:2px solid #999;background:#f5f5f5;}@media print{body{padding:12px;}}</style>');
  w.document.write('</head><body><h1>ARENCON Inc. \u2014 AI Usage Report</h1>');
  w.document.write('<div style="font-size:12px;color:#666;">Generated: ' + new Date().toLocaleDateString() + '</div>');
  // Summary table
  var byProj = {};
  var totalCost = 0, totalReviews = 0;
  _data.forEach(function(r) {
    var pk = r.project_number || '(none)';
    if (!byProj[pk]) byProj[pk] = { num: pk, name: r.project_name || '', reviews: 0, fields: 0, cost: 0 };
    byProj[pk].reviews++; byProj[pk].fields += (r.field_count || 0); byProj[pk].cost += (parseFloat(r.cost_usd) || 0);
    totalCost += (parseFloat(r.cost_usd) || 0); totalReviews++;
  });
  w.document.write('<h2>Summary by Project</h2><table><tr><th>Project #</th><th>Name</th><th>Reviews</th><th>Fields</th><th class="cost">Cost</th></tr>');
  Object.keys(byProj).sort().forEach(function(k) {
    var p = byProj[k];
    w.document.write('<tr><td>' + p.num + '</td><td>' + p.name + '</td><td>' + p.reviews + '</td><td>' + p.fields + '</td><td class="cost">$' + p.cost.toFixed(4) + '</td></tr>');
  });
  w.document.write('<tr class="total"><td colspan="2">TOTAL</td><td>' + totalReviews + '</td><td></td><td class="cost">$' + totalCost.toFixed(4) + '</td></tr></table>');
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(function() { w.print(); }, 500);
}

export var AIUsage = { open: open, close: close, exportCSV: exportCSV, exportPDF: exportPDF };
window.AIUsage = AIUsage;
