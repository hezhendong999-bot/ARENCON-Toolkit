/* ═══════════════════════════════════════════════════════════════════════════
   ARENCON — SHARED ACCOUNT PANEL
   Reached by clicking your name in the header of any ARENCON tool.

   ONE IMPLEMENTATION (S478). Every tool opens this same panel; none of them
   draws headings, cards or a colour picker of its own.

   ── WHY THIS FILE WAS REBUILT (S652) ────────────────────────────────────────
   S630 shipped a version of this panel that had never been seen rendered. In
   the live Hub its colour picker collapsed into full-width coloured bars and
   the cards vanished. The cause was structural, not cosmetic: the panel body
   renders inside a SHADOW ROOT, page stylesheets do not cross that boundary,
   and the old design let the HOST pass in pre-built picker markup whose CSS
   lived in the page. The markup arrived; its styling could not follow.

   The rule that falls out of that, and the whole point of this rewrite:

       THE PANEL OWNS EVERY STYLE IT NEEDS. Hosts pass DATA, never markup.

   So the colour picker — grid, swatches, taken-state, badge and pin previews —
   is built and styled HERE. A host supplies the palette, who has taken what,
   the current colour and a save callback. Nothing a host hands over depends on
   a stylesheet this file cannot see.

   Design is DEMO_account_S631b.html, signed off by Mark 09 Aug ("This is
   perfect"): left-hand nav with your avatar, three sections, and the badge
   shown on a light AND a dark surface because one treatment cannot serve both.

   ── THE GROUPING IS THE COMMERCIAL BOUNDARY, NOT DECORATION ─────────────────
   PROFILE      who you are: name, email, role, initials (role and initials are
                Admin-set and read-only here)
   PREFERENCES  what affects only you: inspector colour, appearance, text size
   SECURITY     how you get in: password, lock PIN
   WORKSPACE    roles, active users, project access, other people's initials —
                NEVER in this panel. A section asking for that group is DROPPED
                rather than rendered. That line is what lets this be handed to
                another company one day.

   Update Password is NOT the panel's footer button. On the old profile panel
   it was, which made the most prominent control on a settings screen fire a
   credential change — a fat-finger hazard on a tablet. It now lives in its own
   section beside its own fields. The footer is a single Done.
   ═══════════════════════════════════════════════════════════════════════════ */

var GROUPS = [
  { id: 'profile',  label: 'Profile',     icon: '\uD83D\uDC64' },
  { id: 'prefs',    label: 'Preferences', icon: '\u2699' },
  { id: 'security', label: 'Security',    icon: '\uD83D\uDD12' }
];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

/* Every rule the panel body needs, injected INTO the shadow root. Nothing here
   may rely on a page stylesheet — that is the defect this file exists to fix. */
var PANEL_CSS = [
'.ap-scope{--ap-card:#FFFFFF;--ap-ink:#1B1A22;--ap-ink2:#5E5B68;--ap-ink3:#928E9C;',
'--ap-rule:#D2CEDB;--ap-brand:#9C2742;--ap-warn:#C98A4A;--ap-ok:#2E9E72;',
'--ap-chip:rgba(156,39,66,.06);--ap-navsel:rgba(156,39,66,.10);--ap-field:#F7F6F9;',
'font-family:Calibri,sans-serif;color:var(--ap-ink);font-size:15px}',
'.ap-scope.ap-dark{--ap-card:#17151c;--ap-ink:#f4f3f6;--ap-ink2:#a09aa8;--ap-ink3:#6b6674;',
'--ap-rule:rgba(255,255,255,.12);--ap-brand:#C9476A;--ap-warn:#E0A36A;--ap-ok:#3FD08A;',
'--ap-chip:rgba(201,71,106,.12);--ap-navsel:rgba(201,71,106,.16);--ap-field:#100e14}',
'.ap-scope *{box-sizing:border-box}',
'.ap-shell{display:grid;grid-template-columns:206px 1fr}',
'@media(max-width:760px){.ap-shell{grid-template-columns:1fr}}',
'.ap-side{border-right:1px solid var(--ap-rule);padding:14px 10px}',
'@media(max-width:760px){.ap-side{border-right:none;border-bottom:1px solid var(--ap-rule)}}',
'.ap-whoami{display:flex;align-items:center;gap:11px;padding:4px 6px 14px}',
'.ap-av{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;',
'justify-content:center;font-size:14px;font-weight:800;letter-spacing:-.3px;flex-shrink:0}',
'.ap-nm{font-size:14.5px;font-weight:700;line-height:1.2}',
'.ap-rl{font-size:11.5px;color:var(--ap-ink3);margin-top:2px}',
'.ap-nav{display:flex;align-items:center;gap:9px;width:100%;background:transparent;border:none;',
'border-radius:9px;padding:10px 11px;font-family:Calibri,sans-serif;font-size:14px;',
'color:var(--ap-ink2);cursor:pointer;text-align:left;min-height:44px;margin-bottom:2px}',
'.ap-nav:hover{background:var(--ap-chip)}',
'@media(pointer:coarse){.ap-nav:hover{background:transparent}}',
'.ap-nav.on{background:var(--ap-navsel);color:var(--ap-ink);font-weight:700}',
'.ap-nav .ic{width:18px;text-align:center;flex-shrink:0}',
'.ap-navnote{font-size:11.5px;color:var(--ap-ink3);line-height:1.45;padding:12px 11px 0;',
'border-top:1px solid var(--ap-rule);margin-top:12px}',
'.ap-main{padding:18px 20px 20px;min-height:460px}',
'.ap-sec{display:none}.ap-sec.on{display:block}',
'.ap-sechead{font-size:12px;letter-spacing:.9px;text-transform:uppercase;color:var(--ap-ink3);',
'font-weight:700;margin:0 0 3px}',
'.ap-secnote{font-size:13px;color:var(--ap-ink2);line-height:1.5;margin:0 0 16px}',
'.ap-block{border-top:1px solid var(--ap-rule);padding:16px 0}',
'.ap-block:first-of-type{border-top:none;padding-top:2px}',
'.ap-block h3{font-size:14.5px;font-weight:700;margin:0 0 3px}',
'.ap-note{font-size:12.5px;color:var(--ap-ink2);line-height:1.5;margin:0 0 11px}',
'.ap-idrow{display:flex;align-items:baseline;gap:14px;padding:9px 0;border-bottom:1px solid var(--ap-rule)}',
'.ap-idrow:last-child{border-bottom:none}',
'.ap-idlbl{font-size:12px;color:var(--ap-ink3);width:86px;flex-shrink:0}',
'.ap-idval{font-size:14px;font-weight:600;word-break:break-word}',
'.ap-idnote{font-size:11.5px;color:var(--ap-ink3);margin-top:3px;line-height:1.45}',
'.ap-lock{font-size:11px;color:var(--ap-ink3);border:1px solid var(--ap-rule);border-radius:5px;',
'padding:1px 6px;margin-left:8px;white-space:nowrap}',
'.ap-seg{display:inline-flex;border:1px solid var(--ap-rule);border-radius:10px;overflow:hidden}',
'.ap-seg button{background:transparent;border:none;border-right:1px solid var(--ap-rule);',
'color:var(--ap-ink2);font-family:Calibri,sans-serif;font-size:13.5px;font-weight:600;',
'padding:9px 17px;min-height:44px;cursor:pointer}',
'.ap-seg button:last-child{border-right:none}',
'.ap-seg button.on{background:var(--ap-chip);color:var(--ap-ink)}',
'.ap-field{margin-bottom:10px;max-width:340px}',
'.ap-field label{display:block;font-size:12px;color:var(--ap-ink3);margin-bottom:4px}',
'.ap-field input{width:100%;background:var(--ap-field);border:1px solid var(--ap-rule);',
'border-radius:9px;color:var(--ap-ink);font-family:Calibri,sans-serif;font-size:14px;',
'padding:10px 12px;min-height:44px}',
'.ap-btn{background:var(--ap-brand);color:#fff;border:none;border-radius:9px;padding:10px 18px;',
'font-family:Calibri,sans-serif;font-size:14px;font-weight:600;cursor:pointer;min-height:44px}',
'.ap-btn.ghost{background:transparent;color:var(--ap-ink2);border:1px solid var(--ap-rule);font-weight:400}',
'.ap-btn[disabled]{opacity:.45;cursor:default}',
'.ap-btnrow{display:flex;gap:9px;flex-wrap:wrap;margin-top:4px}',
'.ap-status{font-size:13px;color:var(--ap-ink2);margin-bottom:10px}',
'.ap-status b{color:var(--ap-warn)}.ap-status b.ok{color:var(--ap-ok)}',
'.ap-err{font-size:12.5px;color:var(--ap-brand);margin-top:6px;min-height:16px}',
'.ap-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:6px;max-width:540px}',
'@media(max-width:760px){.ap-grid{grid-template-columns:repeat(8,1fr)}}',
'.ap-sw{position:relative;aspect-ratio:1;border-radius:7px;cursor:pointer;border:2px solid transparent;',
'display:flex;align-items:center;justify-content:center;transition:transform .09s;padding:0}',
'.ap-sw:hover{transform:scale(1.13)}',
'@media(pointer:coarse){.ap-sw:hover{transform:none}}',
'.ap-sw.sel{border-color:var(--ap-ink);box-shadow:0 0 0 3px var(--ap-card),0 0 0 5px var(--ap-ink)}',
'.ap-sw.taken{cursor:not-allowed}',
'.ap-sw.taken::after{content:"";position:absolute;inset:0;border-radius:inherit;',
'background:rgba(255,255,255,.58);pointer-events:none}',
'.ap-dark .ap-sw.taken::after{background:rgba(0,0,0,.50)}',
'.ap-sw .ini{position:relative;z-index:1;font-size:11px;font-weight:800;color:#1B1A22;letter-spacing:-.2px}',
'.ap-dark .ap-sw .ini{color:#f4f3f6}',
'.ap-sw .ini.i3{font-size:9px;letter-spacing:-.6px}',
'.ap-legend{display:flex;gap:16px;margin-top:12px;font-size:12.5px;color:var(--ap-ink2);flex-wrap:wrap}',
'.ap-legend b{color:var(--ap-ink);font-weight:600}',
'.ap-prow{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--ap-rule)}',
'.ap-prow:last-child{border-bottom:none}',
'.ap-plbl{font-size:11.5px;color:var(--ap-ink3);width:104px;flex-shrink:0;line-height:1.3}',
'.ap-sheet{border-radius:8px;padding:7px 9px;display:flex;align-items:center;gap:7px;flex:1;',
'justify-content:center;min-height:58px}',
'.ap-pill{display:inline-block;background:var(--ap-chip);border:1px solid var(--ap-rule);',
'border-radius:12px;padding:3px 10px;font-size:12px;color:var(--ap-ink);margin:3px 4px 0 0}',
'.ap-who2{font-size:12.5px;color:var(--ap-ink2);margin-top:14px;padding-top:12px;',
'border-top:1px solid var(--ap-rule)}'
].join('');

function injectCss(root) {
  try {
    if (!root || !root.querySelector) return;
    if (root.querySelector('#ap-style')) return;
    var st = document.createElement('style');
    st.id = 'ap-style';
    st.textContent = PANEL_CSS;
    root.appendChild(st);
  } catch (e) { console.warn('[AccountPanel] style inject failed:', e); }
}

/* The badge is drawn DIFFERENTLY on a light and a dark surface, because one
   treatment cannot serve both (S631b). Light: solid colour, near-black
   initials, thin dark hairline so a pale colour still has an edge on a white
   card. Dark: tinted fill — a solid circle glares on a dark board. */
function badgeHtml(colour, initials, darkSurface) {
  var base = 'display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;'
    + 'border-radius:50%;font-family:Calibri,sans-serif;font-size:12px;font-weight:800;letter-spacing:-.2px;';
  if (darkSurface) {
    return '<span style="' + base + 'color:' + colour + ';'
      + 'background:color-mix(in srgb,' + colour + ' 16%,transparent);'
      + 'border:1px solid color-mix(in srgb,' + colour + ' 38%,transparent)">' + esc(initials) + '</span>';
  }
  return '<span style="' + base + 'color:#1B1A22;background:' + colour + ';'
    + 'border:1px solid rgba(27,26,34,.28)">' + esc(initials) + '</span>';
}

/* The same teardrop the drawing viewer paints. INNER 0.76 is the doubled ring
   shipped in S629b — this number and the renderer move together or the preview
   lies about what the inspector will see on a drawing. */
var INNER = 0.76, _uid = 0;
function pinSvg(ring, body, num, tip) {
  var path = 'M16 40 C16 40 3 24.5 3 15.5 C3 7.5 8.8 2 16 2 C23.2 2 29 7.5 29 15.5 C29 24.5 16 40 16 40 Z';
  var inner = 'translate(16,21) scale(' + INNER + ') translate(-16,-21)';
  var cid = 'apclip' + (++_uid);
  var h = '<svg width="30" height="39" viewBox="0 0 32 42" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">';
  if (tip) h += '<defs><clipPath id="' + cid + '"><path d="' + path + '" transform="' + inner + '"/></clipPath></defs>';
  h += '<path d="' + path + '" fill="' + ring + '"/><g transform="' + inner + '"><path d="' + path + '" fill="' + body + '"/></g>';
  if (tip) h += '<rect x="0" y="26" width="32" height="16" fill="' + tip + '" clip-path="url(#' + cid + ')"/>';
  h += '<circle cx="16" cy="14" r="11" fill="#fff" opacity=".95"/>'
    + '<text x="16" y="14" text-anchor="middle" dominant-baseline="central" font-family="Calibri,sans-serif" '
    + 'font-size="13" font-weight="700" fill="' + body + '">' + num + '</text></svg>';
  return h;
}
var HIGH = '#A85959', LOW = '#B07F5A', CLOSED = '#5F8068';
var T1 = '#3D8585', T2 = '#3D4D88', T3 = '#9E6B40';

function segHtml(id, options, current) {
  var h = '<div class="ap-seg" id="' + id + '">';
  (options || []).forEach(function (o) {
    h += '<button type="button" data-val="' + esc(o.value) + '"'
      + (String(o.value) === String(current) ? ' class="on"' : '') + '>' + esc(o.label) + '</button>';
  });
  return h + '</div>';
}

/* ─────────────────────────────────────────────────────────────────────────────
   openAccountPanel(cfg)

   cfg.identity  {name, email, role, initials}
   cfg.colour    {palette:[hex], taken:[{name,initials,colour}], current,
                  onSave(hex) -> Promise}          ← DATA ONLY, never markup
   cfg.theme     {current, options:[{value,label}], set(v)}
   cfg.textSize  {current, options:[{value,label}], set(v)}
   cfg.security  {hasPin, onPassword(pw) -> Promise, onPin()}
   cfg.sections  [{id, group:'profile'|'prefs'|'security', title, html, mount(bd)}]
                 optional host extras; a section asking for any other group is
                 dropped with a warning rather than rendered.
   ───────────────────────────────────────────────────────────────────────────── */
export function openAccountPanel(cfg) {
  cfg = cfg || {};
  var D = cfg.dlg || (typeof window !== 'undefined' ? window.Dlg : null);
  var toast = cfg.toast || function () {};
  if (!D || !D.panel) { toast('Dialog engine not loaded \u2014 refresh the page', 'error'); return null; }

  var id = cfg.identity || {};
  var col = cfg.colour || null;
  var sec = cfg.security || {};
  var api = null;

  var extras = (cfg.sections || []).filter(function (s) {
    if (!s || !s.group) return false;
    var ok = GROUPS.some(function (g) { return g.id === s.group; });
    if (!ok) console.warn('[AccountPanel] section "' + s.id + '" asked for group "' + s.group
      + '" \u2014 only profile/prefs/security render. Workspace controls belong in Admin.');
    return ok;
  });
  function extrasFor(group) {
    return extras.filter(function (s) { return s.group === group; })
      .map(function (s) {
        return '<div class="ap-block"><h3>' + esc(s.title || '') + '</h3>' + (s.html || '') + '</div>';
      }).join('');
  }

  D.panel({
    title: 'Account', icon: '\uD83D\uDC64', accent: 'slate', width: 760,
    buttons: [{ label: 'Done', kind: 'cancel' }],
    build: function (bd, a) {
      api = a;
      injectCss(bd.getRootNode ? bd.getRootNode() : bd);

      var dark = !!cfg.dark;
      var current = (col && col.current) || '#888888';
      var pending = null;
      function cur() { return pending || current; }
      var takenMap = {};
      ((col && col.taken) || []).forEach(function (t) { takenMap[String(t.colour).toUpperCase()] = t; });

      var h = '<div class="ap-scope' + (dark ? ' ap-dark' : '') + '"><div class="ap-shell">';

      h += '<div class="ap-side"><div class="ap-whoami"><div class="ap-av" id="ap-av">'
        + esc(id.initials || '?') + '</div><div><div class="ap-nm">' + esc(id.name || '')
        + '</div><div class="ap-rl">' + esc(id.role || '') + '</div></div></div>';
      GROUPS.forEach(function (g, i) {
        h += '<button type="button" class="ap-nav' + (i === 0 ? ' on' : '') + '" data-sec="' + g.id + '">'
          + '<span class="ic">' + g.icon + '</span> ' + esc(g.label) + '</button>';
      });
      h += '<div class="ap-navnote">Roles, active users and everyone\u2019s initials are set in '
        + '<b>Admin</b>, not here.</div></div>';

      h += '<div class="ap-main">';

      h += '<div class="ap-sec on" id="ap-sec-profile"><div class="ap-sechead">Profile</div>'
        + '<p class="ap-secnote">Who you are across every project and every device.</p><div class="ap-block">'
        + '<div class="ap-idrow"><div class="ap-idlbl">Name</div><div class="ap-idval">' + esc(id.name || '\u2014') + '</div></div>'
        + '<div class="ap-idrow"><div class="ap-idlbl">Email</div><div class="ap-idval">' + esc(id.email || '\u2014') + '</div></div>'
        + '<div class="ap-idrow"><div class="ap-idlbl">Role</div><div><div class="ap-idval">'
        + esc(id.role || '\u2014') + ' <span class="ap-lock">Admin\u2011set</span></div></div></div>'
        + '<div class="ap-idrow"><div class="ap-idlbl">Initials</div><div><div class="ap-idval">'
        + esc(id.initials || '\u2014') + ' <span class="ap-lock">Admin\u2011set</span></div>'
        + '<div class="ap-idnote">These label your colour for everyone else, so they are not yours to change.</div>'
        + '</div></div></div>' + extrasFor('profile') + '</div>';

      h += '<div class="ap-sec" id="ap-sec-prefs"><div class="ap-sechead">Preferences</div>'
        + '<p class="ap-secnote">How the toolkit looks and behaves for you. '
        + 'None of this touches anyone else\u2019s work.</p>';
      if (col) {
        h += '<div class="ap-block"><h3>My inspector colour</h3>'
          + '<p class="ap-note">The ring around your pins on a drawing, and your badge everywhere else. '
          + 'It follows you to every project and every device.</p>'
          + '<div class="ap-grid" id="ap-grid"></div>'
          + '<div class="ap-legend"><span><b>' + ((col.palette || []).length) + '</b> colours available</span>'
          + '<span>Faded + initials = <b>already taken</b> by a colleague</span></div>'
          + '<div style="margin-top:14px">'
          + '<div class="ap-prow"><div class="ap-plbl">Your badge</div>'
          + '<div class="ap-sheet" id="ap-blight" style="background:#e8eaed"></div>'
          + '<div class="ap-sheet" id="ap-bdark" style="background:#1a1a1a"></div></div>'
          + '<div class="ap-prow"><div class="ap-plbl">Your pins</div>'
          + '<div class="ap-sheet" id="ap-plight" style="background:#e8eaed"></div>'
          + '<div class="ap-sheet" id="ap-pdark" style="background:#1a1a1a"></div></div>'
          + '<div class="ap-prow"><div class="ap-plbl">With a contractor tip</div>'
          + '<div class="ap-sheet" id="ap-clight" style="background:#e8eaed"></div>'
          + '<div class="ap-sheet" id="ap-cdark" style="background:#1a1a1a"></div></div></div>'
          + '<div class="ap-btnrow" style="margin-top:12px">'
          + '<button type="button" class="ap-btn" id="ap-csave" disabled>Save my colour</button>'
          + '<button type="button" class="ap-btn ghost" id="ap-ccancel">Cancel</button></div>'
          + '<div class="ap-err" id="ap-cerr"></div>'
          + '<div class="ap-who2"><b style="color:var(--ap-ink)">Taken by colleagues</b>'
          + '<div id="ap-whol"></div></div></div>';
      }
      if (cfg.theme) {
        h += '<div class="ap-block"><h3>Appearance</h3><p class="ap-note">Follows you to every ARENCON '
          + 'tool on this device. It never changes on its own \u2014 contrast must not shift under you '
          + 'mid\u2011task.</p>' + segHtml('ap-theme', cfg.theme.options, cfg.theme.current) + '</div>';
      }
      if (cfg.textSize) {
        h += '<div class="ap-block"><h3>Text size</h3><p class="ap-note">Larger text on a tablet in '
          + 'daylight, at the cost of fitting less on screen.</p>'
          + segHtml('ap-ts', cfg.textSize.options, cfg.textSize.current) + '</div>';
      }
      h += extrasFor('prefs') + '</div>';

      h += '<div class="ap-sec" id="ap-sec-security"><div class="ap-sechead">Security</div>'
        + '<p class="ap-secnote">How you get in, and how this device locks itself when you put it down.</p>'
        + '<div class="ap-block"><h3>Password</h3>'
        /* Copy corrected S652: sign-out now revokes centrally and sessions have
           a ceiling, so the old "other devices keep working" line was wrong. */
        + '<p class="ap-note">Minimum 8 characters. Signing out now ends the session everywhere, '
        + 'and every session has a time limit \u2014 so a device you no longer have cannot keep working '
        + 'indefinitely.</p>'
        + '<div class="ap-field"><label>New password</label>'
        + '<input type="password" id="ap-pw1" placeholder="Min 8 characters" autocomplete="new-password"></div>'
        + '<div class="ap-field"><label>Confirm password</label>'
        + '<input type="password" id="ap-pw2" placeholder="Re-enter password" autocomplete="new-password"></div>'
        + '<div class="ap-btnrow"><button type="button" class="ap-btn" id="ap-pwbtn">Update password</button></div>'
        + '<div class="ap-err" id="ap-pwerr"></div></div>'
        + '<div class="ap-block"><h3>Lock PIN</h3>'
        /* Copy corrected S652: a PIN is mandatory as of S650 and cannot be
           removed — removing one would switch that user's automatic sign-out
           off, since the sign-out clock only runs while the screen is locked. */
        + '<p class="ap-note">Your PIN locks the screen after 4 hours idle, so a tablet left on a '
        + 'mechanical room floor does not hand over a client\u2019s report. It works with no signal. '
        + 'A PIN is required and cannot be removed \u2014 you can change it.</p>'
        + '<div class="ap-status">Current status: <b class="' + (sec.hasPin ? 'ok' : '') + '">'
        + (sec.hasPin ? 'PIN set' : 'No PIN set') + '</b></div>'
        + '<div class="ap-btnrow"><button type="button" class="ap-btn ghost" id="ap-pinbtn">'
        + (sec.hasPin ? 'Change PIN' : 'Set PIN') + '</button></div></div>'
        + extrasFor('security') + '</div>';

      h += '</div></div></div>';
      bd.innerHTML = h;

      var $ = function (s) { return bd.querySelector(s); };

      Array.prototype.forEach.call(bd.querySelectorAll('.ap-nav'), function (b) {
        b.onclick = function () {
          Array.prototype.forEach.call(bd.querySelectorAll('.ap-nav'), function (x) {
            x.classList.toggle('on', x === b);
          });
          var want = 'ap-sec-' + b.getAttribute('data-sec');
          Array.prototype.forEach.call(bd.querySelectorAll('.ap-sec'), function (s) {
            s.classList.toggle('on', s.id === want);
          });
        };
      });

      function paint() {
        var c = cur();
        var scope = bd.querySelector('.ap-scope');
        var av = $('#ap-av');
        if (av) {
          if (scope && scope.classList.contains('ap-dark')) {
            av.style.color = c;
            av.style.background = 'color-mix(in srgb,' + c + ' 16%,transparent)';
            av.style.border = '1px solid color-mix(in srgb,' + c + ' 38%,transparent)';
          } else {
            av.style.color = '#1B1A22';
            av.style.background = c;
            av.style.border = '1px solid rgba(27,26,34,.28)';
          }
        }
        if (!col) return;
        var ini = id.initials || '?';
        if ($('#ap-blight')) $('#ap-blight').innerHTML = badgeHtml(c, ini, false);
        if ($('#ap-bdark')) $('#ap-bdark').innerHTML = badgeHtml(c, ini, true);
        var plain = function () { return pinSvg(c, HIGH, '7') + pinSvg(c, LOW, '8') + pinSvg(c, CLOSED, '9'); };
        var tipped = function () {
          return pinSvg(c, HIGH, '7', T1) + pinSvg(c, LOW, '8', T2) + pinSvg(c, CLOSED, '9', T3);
        };
        if ($('#ap-plight')) $('#ap-plight').innerHTML = plain();
        if ($('#ap-pdark')) $('#ap-pdark').innerHTML = plain();
        if ($('#ap-clight')) $('#ap-clight').innerHTML = tipped();
        if ($('#ap-cdark')) $('#ap-cdark').innerHTML = tipped();
      }

      function drawGrid() {
        var g = $('#ap-grid'); if (!g) return;
        g.innerHTML = '';
        (col.palette || []).forEach(function (hex) {
          var owner = takenMap[String(hex).toUpperCase()];
          var d = document.createElement('button');
          d.type = 'button';
          d.className = 'ap-sw' + (owner ? ' taken' : '')
            + (String(hex).toUpperCase() === String(cur()).toUpperCase() ? ' sel' : '');
          d.style.background = hex;
          d.title = owner ? (owner.name + ' \u2014 ' + hex) : hex;
          if (owner) {
            d.disabled = true;
            d.innerHTML = '<span class="ini' + ((owner.initials || '').length > 2 ? ' i3' : '') + '">'
              + esc(owner.initials || '') + '</span>';
          } else {
            d.onclick = function () {
              pending = hex; drawGrid(); paint();
              $('#ap-csave').disabled = false;
              $('#ap-cerr').textContent = '';
            };
          }
          g.appendChild(d);
        });
      }

      function whoList() {
        var el = $('#ap-whol'); if (!el) return;
        var list = ((col && col.taken) || []).slice().sort(function (x, y) {
          return String(x.name).localeCompare(String(y.name));
        });
        el.innerHTML = list.map(function (s) {
          return '<span class="ap-pill"><span style="display:inline-block;width:9px;height:9px;'
            + 'border-radius:50%;background:' + s.colour + ';margin-right:6px;vertical-align:middle"></span>'
            + esc(s.name) + '</span>';
        }).join('');
      }

      if (col) {
        drawGrid(); whoList();
        $('#ap-ccancel').onclick = function () {
          pending = null; $('#ap-csave').disabled = true; $('#ap-cerr').textContent = '';
          drawGrid(); paint();
        };
        $('#ap-csave').onclick = function () {
          var btn = this, chosen = cur();
          if (!col.onSave) return;
          btn.disabled = true; btn.textContent = 'Saving\u2026';
          Promise.resolve(col.onSave(chosen)).then(function () {
            current = chosen; pending = null;
            btn.textContent = '\u2713 Saved';
            setTimeout(function () { btn.textContent = 'Save my colour'; }, 1400);
            drawGrid(); paint();
          })['catch'](function (e) {
            /* The colour identifies this inspector's marks on every drawing, so
               a silent failure here is worse than a loud one. */
            btn.disabled = false; btn.textContent = 'Save my colour';
            $('#ap-cerr').textContent = 'Could not save: '
              + ((e && e.message) ? e.message : 'check your connection and try again');
          });
        };
      }
      paint();

      function wireSeg(selector, pref, isTheme) {
        if (!pref) return;
        var el = $(selector); if (!el) return;
        Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
          b.onclick = function () {
            var v = b.getAttribute('data-val');
            Array.prototype.forEach.call(el.querySelectorAll('button'), function (x) {
              x.classList.toggle('on', x === b);
            });
            try { pref.set(v); } catch (e) { console.warn('[AccountPanel] pref set:', e); }
            if (isTheme) {
              /* Repaint our own scope: the page flipped, but this body lives in
                 a shadow root the page stylesheet cannot reach. */
              var scope = bd.querySelector('.ap-scope');
              if (scope) scope.classList.toggle('ap-dark', v === 'dark');
              paint();
            }
          };
        });
      }
      wireSeg('#ap-theme', cfg.theme, true);
      wireSeg('#ap-ts', cfg.textSize, false);

      if ($('#ap-pwbtn')) {
        $('#ap-pwbtn').onclick = function () {
          var a1 = $('#ap-pw1').value, a2 = $('#ap-pw2').value, err = $('#ap-pwerr');
          err.textContent = '';
          if (a1.length < 8) { err.textContent = 'Password must be at least 8 characters'; return; }
          if (a1 !== a2) { err.textContent = 'Those do not match'; return; }
          if (!sec.onPassword) return;
          var btn = this; btn.disabled = true; btn.textContent = 'Updating\u2026';
          Promise.resolve(sec.onPassword(a1)).then(function () {
            $('#ap-pw1').value = ''; $('#ap-pw2').value = '';
            btn.textContent = '\u2713 Updated';
            setTimeout(function () { btn.disabled = false; btn.textContent = 'Update password'; }, 1600);
          })['catch'](function (e) {
            btn.disabled = false; btn.textContent = 'Update password';
            err.textContent = 'Could not update: ' + ((e && e.message) ? e.message : 'try again');
          });
        };
      }
      if ($('#ap-pinbtn') && sec.onPin) {
        $('#ap-pinbtn').onclick = function () { try { sec.onPin(); } catch (e) { console.warn(e); } };
      }

      extras.forEach(function (s) {
        if (s.mount) { try { s.mount(bd); } catch (e) { console.warn('[AccountPanel] mount ' + s.id + ':', e); } }
      });
      if (cfg.onBuild) { try { cfg.onBuild(bd, a); } catch (e) { console.warn('[AccountPanel] onBuild:', e); } }
    }
  }).then(function () {
    api = null;
    if (cfg.onClose) { try { cfg.onClose(); } catch (e) { console.warn('[AccountPanel] onClose:', e); } }
  });

  return { close: function () { if (api) { var a = api; api = null; a.close(); } } };
}

export default { openAccountPanel: openAccountPanel };
