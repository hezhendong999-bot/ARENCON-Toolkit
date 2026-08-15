/* ═══════════════════════════════════════════════════════════════════════════
   ARENCON — HEADER IDENTITY  (S660)

   WHY THIS EXISTS. S653 unified the header by having headerConfigs read
   identity from `window.Auth`. On the live tools that is undefined: FRT holds
   Auth inside an ES module binding (never a window property), while Diesel and
   Electric sign in through shared/auth-gate.js, which defines no Auth object at
   all. So the lookup found nothing, every tool decided nobody was signed in,
   and the old Sign Out button stayed in the bar — visible in Mark's 14 Aug
   screenshots of both tools. The harness passed because it was handed an
   identity the real page never has. A test that supplies the missing thing
   cannot detect the missing thing.

   The fix is not to make three tools each expose an Auth object — that is the
   per-tool wiring the shared header exists to abolish, and the next tool would
   forget. Instead the ENGINE resolves identity from the one thing every tool
   genuinely shares: the stored Supabase session. One implementation, no tool
   config, nothing for a new tool to remember.

   ORDER MATTERS. The profile row needs a round trip, so the first paint cannot
   know who you are. The header therefore starts as it always did — Sign Out
   present, no avatar — and swaps once identity resolves. Never the reverse: a
   header that shows an avatar before it knows whose it is would show the wrong
   colour, and colour is how the toolkit says whose marks are whose.
   ═══════════════════════════════════════════════════════════════════════════ */

var SB_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';
var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkxNzMsImV4cCI6MjA4ODg1NTE3M30.1WhVv3kPeO0igzcZswbNT-u1tUvEKNP6lk1DivKoDHU';
var CACHE_KEY = 'arencon-hdr-identity';

/* The session is kept under a couple of different keys depending on which
   sign-in path a tool uses. Try each rather than assume one. */
function _token() {
  var keys = ['sb-access-token', 'arencon-access-token', 'supabase.auth.token'];
  for (var i = 0; i < keys.length; i++) {
    try {
      var v = localStorage.getItem(keys[i]);
      if (!v) continue;
      if (v.charAt(0) === '{') {
        var o = JSON.parse(v);
        var t = o.access_token || (o.currentSession && o.currentSession.access_token);
        if (t) return t;
        continue;
      }
      return v;
    } catch (e) { /* keep trying the next key */ }
  }
  return null;
}

/* Read the user id and email out of the token itself — no request needed, and
   it means a signed-in person gets *something* even if the profile fetch
   fails. */
function _claims(tok) {
  try {
    var p = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (p.length % 4) p += '=';
    var j = JSON.parse(decodeURIComponent(escape(atob(p))));
    if (j.exp && (j.exp * 1000) < Date.now()) return null;   // expired: not signed in
    return { id: j.sub, email: j.email || '' };
  } catch (e) { return null; }
}

function _initialsFrom(name, email) {
  var src = (name || '').trim();
  if (src) {
    var parts = src.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  var local = (email || '').split('@')[0];
  return local ? local.slice(0, 2).toUpperCase() : '?';
}

function _cached(id) {
  try {
    var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return (c && c.id === id) ? c : null;
  } catch (e) { return null; }
}

/* Resolve who is signed in. Returns null when nobody is — the caller must then
   leave the ordinary Sign Out button alone, or a signed-in person would be left
   with no way out of the app. */
export function resolveIdentity() {
  var tok = _token();
  if (!tok) return Promise.resolve(null);
  var who = _claims(tok);
  if (!who || !who.id) return Promise.resolve(null);

  var cached = _cached(who.id);
  var fetchFresh = fetch(SB_URL + '/rest/v1/profiles?id=eq.' + who.id
      + '&select=full_name,initials,ring_color,role', {
      headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + tok }
    })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rows) {
      var p = (rows && rows[0]) || {};
      var out = {
        id: who.id,
        email: who.email,
        name: p.full_name || who.email || '',
        initials: p.initials || _initialsFrom(p.full_name, who.email),
        colour: p.ring_color || '#888888',
        role: p.role === 'super_admin' ? 'Super Admin'
            : (p.role === 'admin' ? 'Admin' : 'Inspector')
      };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(out)); } catch (e) {}
      return out;
    })
    .catch(function () {
      /* Offline, or the profile row is unreachable. A cached identity is far
         better than pretending nobody is signed in — that would put the old
         Sign Out button back on a tablet in a basement. */
      return cached || {
        id: who.id, email: who.email, name: who.email || '',
        initials: _initialsFrom('', who.email), colour: '#888888', role: 'Inspector'
      };
    });

  return fetchFresh;
}

/* ═══ S668 — THE SAME TREATMENT FOR THE TOOLS' HEADERS ══════════════════════
   The Hub's Account panel is fully wired; in FRT, Diesel and Electric the same
   avatar opened a panel with a blank name and no colour picker, because those
   tools handed it nothing. Wiring each tool is the per-tool duplication the
   shared header exists to remove — and the fourth tool would be wired wrong.
   So the data the panel needs lives HERE, next to the identity that feeds it,
   and the engine hands it over. A new tool gets a working Account panel by
   doing nothing.

   The palette is the Hub's canonical 48 (copied verbatim, S629b). It has to be
   the same list everywhere or two people could pick colours that look alike on
   a busy drawing — the one thing the picker exists to prevent. */
export var RING_PALETTE = ["#FF4D4D", "#C9A5A5", "#F07C65", "#FF670F", "#FFAF75", "#C9832C", "#E8C799", "#C99F04", "#C9B255", "#F7D10F", "#DBE04C", "#86941B", "#CFF018", "#A1BA73", "#BFE87D", "#8DE805", "#7EBA29", "#90F77C", "#46D136", "#27FF24", "#52A358", "#ABD1B0", "#95F0B3", "#1ABA52", "#0FFF7F", "#28E097", "#44B295", "#51F0E8", "#6CB5BA", "#4DE1FF", "#3C9FC9", "#9ED5FF", "#5EA8F7", "#99A0BA", "#6B84FF", "#B4A8FF", "#B972F7", "#E6C5F0", "#F419FF", "#FFB2FE", "#D171CE", "#FF75FA", "#FF24D7", "#C985B3", "#F740A2", "#E86BA1", "#FF4D79", "#F799A9"];

/* Who holds which colour. The panel fades these and stamps the owner's
   initials on them, so a colour cannot be taken twice. */
export function loadRoster() {
  var tok = _token();
  if (!tok) return Promise.resolve([]);
  return fetch(SB_URL + '/rest/v1/profiles?select=id,full_name,initials,ring_color'
      + '&ring_color=not.is.null&is_active=eq.true', {
      headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + tok }
    })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      return (rows || []).map(function (p) {
        return { id: p.id, name: p.full_name || '', initials: p.initials || '',
                 colour: p.ring_color };
      });
    })
    .catch(function () { return []; });
}

/* Filters BEFORE the write — PostgREST patches whatever the query selects, so
   a missing filter would rewrite the whole table. The id is always pinned. */
export function saveColour(userId, hex) {
  var tok = _token();
  if (!tok) return Promise.reject(new Error('not signed in'));
  if (!userId) return Promise.reject(new Error('no user'));
  return fetch(SB_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + tok,
               'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ ring_color: hex })
  }).then(function (r) {
    if (!r.ok) throw new Error('save failed (' + r.status + ')');
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.id === userId) { c.colour = hex; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); }
    } catch (e) {}
    return true;
  });
}

export function changePassword(pw) {
  var tok = _token();
  if (!tok) return Promise.reject(new Error('not signed in'));
  return fetch(SB_URL + '/auth/v1/user', {
    method: 'PUT',
    headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + tok,
               'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  }).then(function (r) {
    if (!r.ok) return r.json().then(function (j) {
      throw new Error((j && (j.msg || j.error_description || j.message)) || ('failed (' + r.status + ')'));
    });
    return true;
  });
}

export default { resolveIdentity: resolveIdentity, loadRoster: loadRoster,
                 saveColour: saveColour, changePassword: changePassword,
                 RING_PALETTE: RING_PALETTE };
