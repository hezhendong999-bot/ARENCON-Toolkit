/* ============================================================================
 * ARENCON — Universal Auth Gate  (shared/auth-gate.js)   S331 #auth
 * ----------------------------------------------------------------------------
 * Blocks EVERY tool that includes it until a valid signed-in Supabase session
 * exists. No deep link, no URL, no bookmark gets a user into a tool's data
 * without authenticating first.
 *
 * Behaviour (locked with Mark):
 *   - Render an OPAQUE full-screen overlay synchronously on load, so no tool
 *     content/data is ever visible (even for a frame) before auth is confirmed.
 *   - ONLINE:  validate sb-access-token via /auth/v1/user. If expired, try the
 *     refresh token. On success → stamp "last validated = now" → reveal tool.
 *     On failure → show the in-place login card.
 *   - OFFLINE: if a token exists AND it last validated within the grace window
 *     (7 days) → reveal tool (lets field work continue with no signal). Else →
 *     show "sign-in requires a connection" gated state.
 *   - In-place login: email + password → Supabase password grant → store
 *     tokens → reload SAME url (so the original deep link now loads WITH a
 *     session). No bounce to the Hub.
 *
 * This is the CLIENT half. The real security boundary is Supabase RLS — anon
 * SELECT on tool_data/projects/profiles was dropped (S331), so a token that
 * doesn't belong to a real account returns nothing regardless of this gate.
 * This gate exists so an un-signed-in user sees "please sign in" instead of a
 * silent empty load.
 *
 * Self-contained: no dependency on any tool's internals. Include FIRST,
 * before the tool's own scripts:
 *     <script src="shared/auth-gate.js"></script>   (or ../shared/ for FRT)
 * ========================================================================== */
(function () {
  'use strict';

  // Already gated on this page (double-include guard).
  if (window.__arenconAuthGate) return;
  window.__arenconAuthGate = true;

  var SB_URL  = 'https://xsemvinxsyphjiaqgywv.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';

  var TOK_KEY     = 'sb-access-token';
  var REFRESH_KEY = 'sb-refresh-token';
  var STAMP_KEY   = 'arencon-auth-validated';   // ms epoch of last successful server validation
  var GRACE_MS    = 7 * 24 * 60 * 60 * 1000;     // 7-day offline grace (Mark-approved)

  // ── Overlay: opaque, covers everything, blocks all interaction ──────────
  var DARK = false;
  try { DARK = localStorage.getItem('ARENCON_Dark') === '1' || document.body && document.body.classList.contains('dark-mode'); } catch (e) {}

  var ov = document.createElement('div');
  ov.id = 'arencon-auth-gate';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483600',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:24px', 'box-sizing:border-box',
    'font-family:Calibri,"Segoe UI",system-ui,sans-serif',
    'background:' + (DARK
      ? 'linear-gradient(160deg,#0F172A 0%,#1E293B 100%)'
      : 'linear-gradient(160deg,#243044 0%,#1a1a2e 40%,#2C4770 100%)')
  ].join(';');

  // Card
  var card = document.createElement('div');
  card.style.cssText = [
    'background:' + (DARK ? '#1b1922' : '#ffffff'),
    'color:' + (DARK ? '#f4f3f6' : '#1B1A22'),
    'border-radius:16px',
    'box-shadow:0 20px 60px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.05)',
    'padding:40px 36px', 'width:100%', 'max-width:400px',
    'text-align:center', 'position:relative', 'overflow:hidden',
    'box-sizing:border-box'
  ].join(';');
  card.innerHTML =
    '<div style="position:absolute;top:0;left:0;right:0;height:4px;' +
      'background:linear-gradient(90deg,#9C2742,#D4456A,#9C2742);"></div>' +
    '<h2 style="font-size:22px;font-weight:700;margin:6px 0 4px;letter-spacing:-.3px;">ARENCON</h2>' +
    '<p id="ag-sub" style="font-size:13px;color:' + (DARK ? '#a8a0b2' : '#5E5B68') +
      ';margin:0 0 22px;line-height:1.4;">Checking your session\u2026</p>' +
    '<div id="ag-spin" style="width:26px;height:26px;margin:8px auto 0;border:3px solid ' +
      (DARK ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)') +
      ';border-top-color:#9C2742;border-radius:50%;animation:agspin .9s linear infinite;"></div>' +
    '<div id="ag-form" style="display:none;text-align:left;">' +
      '<div id="ag-err" style="display:none;background:rgba(192,68,95,.12);color:#C0445F;' +
        'padding:9px 12px;border-radius:8px;font-size:13px;margin-bottom:14px;font-weight:600;"></div>' +
      '<label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;' +
        'letter-spacing:.6px;color:' + (DARK ? '#a8a0b2' : '#5E5B68') + ';margin-bottom:6px;">Email</label>' +
      '<input id="ag-email" type="email" autocomplete="email" placeholder="name@arencon.com" ' +
        'style="width:100%;box-sizing:border-box;padding:11px 13px;margin-bottom:16px;border-radius:8px;' +
        'border:1.5px solid ' + (DARK ? '#3a3e48' : '#D0D4DB') + ';font-size:15px;font-family:inherit;' +
        'background:' + (DARK ? '#231f2b' : '#F7F7F9') + ';color:inherit;outline:none;">' +
      '<label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;' +
        'letter-spacing:.6px;color:' + (DARK ? '#a8a0b2' : '#5E5B68') + ';margin-bottom:6px;">Password</label>' +
      '<input id="ag-pass" type="password" autocomplete="current-password" placeholder="Enter password" ' +
        'style="width:100%;box-sizing:border-box;padding:11px 13px;margin-bottom:20px;border-radius:8px;' +
        'border:1.5px solid ' + (DARK ? '#3a3e48' : '#D0D4DB') + ';font-size:15px;font-family:inherit;' +
        'background:' + (DARK ? '#231f2b' : '#F7F7F9') + ';color:inherit;outline:none;">' +
      '<button id="ag-btn" type="button" style="width:100%;padding:13px;border:none;border-radius:8px;' +
        'background:linear-gradient(135deg,#9C2742,#7d1f35);color:#fff;font-weight:700;font-size:15px;' +
        'font-family:inherit;cursor:pointer;letter-spacing:.2px;">Sign In</button>' +
    '</div>';
  ov.appendChild(card);

  var style = document.createElement('style');
  style.textContent = '@keyframes agspin{to{transform:rotate(360deg)}}' +
    '#arencon-auth-gate input:focus{border-color:#9C2742!important;box-shadow:0 0 0 3px rgba(156,39,66,.18);}' +
    '#arencon-auth-gate #ag-btn:disabled{opacity:.55;cursor:not-allowed;}';

  function mount() {
    if (document.body) { document.head.appendChild(style); document.body.appendChild(ov); }
    else { document.documentElement.appendChild(style); document.documentElement.appendChild(ov); }
  }
  mount();

  // ── helpers ─────────────────────────────────────────────────────────────
  function tok()        { try { return localStorage.getItem(TOK_KEY); } catch (e) { return null; } }
  function refreshTok() { try { return localStorage.getItem(REFRESH_KEY); } catch (e) { return null; } }
  function stampNow()   { try { localStorage.setItem(STAMP_KEY, String(Date.now())); } catch (e) {} }
  function lastStamp()  { try { return parseInt(localStorage.getItem(STAMP_KEY) || '0', 10) || 0; } catch (e) { return 0; } }

  function reveal(user) {
    // Remove the gate; let the tool boot exactly as it would have.
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    window.__arenconAuthOK = true;
    // Persist the display name so the badge can show it even offline next time.
    var nm = '';
    if (user) { nm = displayName(user); try { localStorage.setItem(NAME_KEY, nm); } catch (e) {} }
    else { try { nm = localStorage.getItem(NAME_KEY) || ''; } catch (e) {} }
    window.__arenconUser = nm;
    mountBadge(nm);
  }

  // ── Persistent "signed in as X · Sign out" badge ────────────────────────
  // Injected into every gated tool after auth. Makes WHOSE session you're in
  // visible (the "logged in as Mark" incident would have been caught at a
  // glance) and gives a one-tap sign-out to switch accounts.
  function mountBadge(name) {
    try {
      if (document.getElementById('arencon-auth-badge')) return;
      var dark = DARK;
      var b = document.createElement('div');
      b.id = 'arencon-auth-badge';
      b.style.cssText = [
        'position:fixed', 'z-index:2147483500',
        'bottom:max(10px,env(safe-area-inset-bottom))',
        'right:max(10px,env(safe-area-inset-right))',
        'display:flex', 'align-items:center', 'gap:7px',
        'padding:6px 10px 6px 11px', 'border-radius:18px',
        'font-family:Calibri,"Segoe UI",system-ui,sans-serif', 'font-size:12.5px', 'font-weight:600',
        'background:' + (dark ? 'rgba(27,25,34,.92)' : 'rgba(255,255,255,.94)'),
        'color:' + (dark ? '#f4f3f6' : '#1B1A22'),
        'box-shadow:0 3px 12px rgba(0,0,0,.22),0 0 0 1px ' + (dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'),
        'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
        'cursor:default', 'user-select:none', 'max-width:60vw'
      ].join(';');
      b.innerHTML =
        '<span style="width:8px;height:8px;border-radius:50%;background:#3FD08A;flex:0 0 auto;' +
          'box-shadow:0 0 0 3px rgba(63,208,138,.18);"></span>' +
        '<span id="ag-badge-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
          (name ? esc(name) : 'Signed in') + '</span>' +
        '<button id="ag-signout" title="Sign out" style="margin-left:4px;border:none;background:transparent;' +
          'color:' + (dark ? '#E0A36A' : '#9C2742') + ';font-family:inherit;font-size:12.5px;font-weight:700;' +
          'cursor:pointer;padding:2px 4px;white-space:nowrap;">Sign out</button>';
      (document.body || document.documentElement).appendChild(b);
      var so = b.querySelector('#ag-signout');
      if (so) so.addEventListener('click', signOut);
    } catch (e) {}
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function signOut() {
    try {
      localStorage.removeItem(TOK_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(STAMP_KEY);
      localStorage.removeItem(NAME_KEY);
    } catch (e) {}
    // Reload → the gate runs again with no session → shows the login card.
    location.reload();
  }

  function showForm(msg) {
    var spin = card.querySelector('#ag-spin');
    var form = card.querySelector('#ag-form');
    var sub  = card.querySelector('#ag-sub');
    if (spin) spin.style.display = 'none';
    if (sub)  sub.textContent = msg || 'Sign in with your ARENCON account';
    if (form) form.style.display = 'block';
    var email = card.querySelector('#ag-email');
    if (email) setTimeout(function () { try { email.focus(); } catch (e) {} }, 50);
  }

  function showErr(t) {
    var e = card.querySelector('#ag-err');
    if (e) { e.textContent = t; e.style.display = 'block'; }
  }

  function setBusy(b) {
    var btn = card.querySelector('#ag-btn');
    if (btn) { btn.disabled = b; btn.textContent = b ? 'Signing in\u2026' : 'Sign In'; }
  }

  var NAME_KEY = 'arencon-auth-name';   // cached display name (for offline badge)

  function displayName(user) {
    if (!user) return '';
    var meta = user.user_metadata || {};
    if (meta.full_name) return meta.full_name;
    if (user.email) return user.email.split('@')[0];
    return 'Signed in';
  }

  // GET /auth/v1/user with a token → returns user object or null.
  function validate(token) {
    return fetch(SB_URL + '/auth/v1/user', {
      headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + token }
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // Try the refresh token → new access token or null.
  function tryRefresh() {
    var rt = refreshTok();
    if (!rt) return Promise.resolve(null);
    return fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.access_token) {
          try {
            localStorage.setItem(TOK_KEY, data.access_token);
            if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
          } catch (e) {}
          return data.access_token;
        }
        return null;
      }).catch(function () { return null; });
  }

  function doLogin() {
    var email = (card.querySelector('#ag-email').value || '').trim();
    var pass  = card.querySelector('#ag-pass').value || '';
    var err   = card.querySelector('#ag-err');
    if (err) err.style.display = 'none';
    if (!email || !pass) { showErr('Enter your email and password.'); return; }
    if (!navigator.onLine) { showErr('No connection — signing in needs internet.'); return; }
    setBusy(true);
    fetch(SB_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pass })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d || !res.d.access_token) {
          setBusy(false);
          showErr((res.d && (res.d.error_description || res.d.msg || res.d.message)) || 'Sign-in failed. Check your details.');
          return;
        }
        try {
          localStorage.setItem(TOK_KEY, res.d.access_token);
          if (res.d.refresh_token) localStorage.setItem(REFRESH_KEY, res.d.refresh_token);
        } catch (e) {}
        stampNow();
        // Reload the SAME url so the original deep link now loads WITH a session.
        location.reload();
      }).catch(function () {
        setBusy(false);
        showErr('Network error — please try again.');
      });
  }

  function wireForm() {
    var btn = card.querySelector('#ag-btn');
    if (btn) btn.addEventListener('click', doLogin);
    [card.querySelector('#ag-email'), card.querySelector('#ag-pass')].forEach(function (inp) {
      if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    });
  }
  wireForm();

  // ── Gate decision ───────────────────────────────────────────────────────
  function decide() {
    var t = tok();

    if (!navigator.onLine) {
      // Offline: accept a recently-validated session within the grace window.
      if (t && (Date.now() - lastStamp()) <= GRACE_MS) { reveal(); return; }
      showForm(t ? 'Offline — sign in again when you have a connection.'
                 : 'Sign in with your ARENCON account (needs a connection).');
      return;
    }

    // Online: validate, refresh if needed.
    if (!t) { showForm('Sign in with your ARENCON account'); return; }
    validate(t).then(function (user) {
      if (user && user.id) { stampNow(); reveal(user); return; }
      // Token rejected → try refresh once.
      tryRefresh().then(function (nt) {
        if (!nt) { showForm('Your session expired — please sign in again.'); return; }
        validate(nt).then(function (u2) {
          if (u2 && u2.id) { stampNow(); reveal(u2); }
          else { showForm('Your session expired — please sign in again.'); }
        });
      });
    });
  }

  decide();
})();
