/* ═══════════════════════════════════════════════════════════════════════════
   ARENCON — SHARED ACCOUNT PANEL                                       (S630)
   ───────────────────────────────────────────────────────────────────────────
   Mark, S629: "I'd like to add a user setting option just like any other
   commercial app. They can access this from any tool by clicking on their name
   in the header... I think we may be able to commercialise it one day so I want
   you to think ahead."

   THE SPLIT THIS FILE ENFORCES — and the reason it exists at all:

     ACCOUNT      who you are and how you get in. Name, email, role, initials,
                  password, lock PIN.
     PREFERENCES  how the toolkit looks and behaves FOR YOU. Inspector colour,
                  light/dark, text size. Nothing here touches anyone else's
                  data, which is precisely why it is safe to let people change
                  it themselves without an administrator.
     WORKSPACE    roles, who is active, project access, everyone's initials.
                  NOT IN THIS PANEL, EVER. Admin only.

   That boundary is the commercial one: it is the line between what a customer's
   own user may change and what their administrator controls. Getting it wrong
   now means every future tenant inherits the mess, so the panel refuses to
   render a workspace-level control even if a host passes one — see GROUPS.

   ONE IMPLEMENTATION (S478). Every tool passes its own sections in; none of
   them re-draws the shell. The shell owns the grouping, the headings, the
   preference controls and the layout. A tool that wants a row adds a section;
   a tool that wants a different LOOK is wrong and should be fixed here.

   Theme and text size are already shared across the whole toolkit through
   localStorage (ARENCON_Dark, arencon-text-size), so the panel reads and
   writes them through host callbacks rather than owning the keys — the host
   still has to APPLY them to its own page, and only the host knows how.
   ═══════════════════════════════════════════════════════════════════════════ */

var PANEL_CSS = `
.ap-group{margin:0 0 18px}
.ap-group:last-child{margin-bottom:4px}
.ap-glabel{font-size:12px;letter-spacing:.9px;text-transform:uppercase;font-weight:700;
  color:var(--ap-ink3);margin:0 0 2px}
.ap-gnote{font-size:12.5px;color:var(--ap-ink2);line-height:1.45;margin:0 0 10px}
.ap-card{background:var(--ap-card);border:1px solid var(--ap-rule);border-radius:16px;
  padding:4px 15px;box-shadow:var(--ap-shadow)}
.ap-item{padding:12px 0;border-bottom:1px solid var(--ap-rule)}
.ap-item:last-child{border-bottom:none}
.ap-itemhead{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ap-itemtitle{font-size:14px;font-weight:700;color:var(--ap-ink);margin:0}
.ap-idrow{display:flex;align-items:baseline;gap:12px;padding:9px 0;border-bottom:1px solid var(--ap-rule)}
.ap-idrow:last-child{border-bottom:none}
.ap-idlabel{font-size:12px;color:var(--ap-ink3);width:92px;flex-shrink:0}
.ap-idval{font-size:14px;color:var(--ap-ink);font-weight:600;word-break:break-word}
.ap-idnote{font-size:11.5px;color:var(--ap-ink3);margin-top:3px;line-height:1.4}
.ap-seg{display:inline-flex;border:1px solid var(--ap-rule);border-radius:10px;overflow:hidden}
.ap-seg button{background:transparent;border:none;border-right:1px solid var(--ap-rule);
  color:var(--ap-ink2);font-family:Calibri,sans-serif;font-size:13.5px;font-weight:600;
  padding:9px 16px;min-height:44px;cursor:pointer}
.ap-seg button:last-child{border-right:none}
.ap-seg button.on{background:var(--ap-chip);color:var(--ap-ink)}
.ap-seg button:disabled{opacity:.5;cursor:default}
`;

/* Only these two groups may render. A host section asking for anything else is
   dropped on the floor rather than shown — the workspace boundary is not a
   suggestion, and a panel that quietly grows admin controls is exactly how a
   product ends up unable to be sold to a second customer. */
var GROUPS = [
  { id: 'account', label: 'Account',
    note: 'Who you are, and how you sign in.' },
  { id: 'prefs',   label: 'Preferences',
    note: 'How the toolkit looks and behaves for you. These only affect you.' }
];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
  });
}

/* The panel body lives in a shadow root, so page CSS does not reach it and the
   style element has to go inside. Tokens are defined here for both modes; the
   toolkit switches with body.dark-mode on the PAGE, which a shadow root cannot
   see — so the host tells us the mode and we set it as an attribute we own. */
function injectCss(root, dark) {
  try {
    var host = root.querySelector ? root : null;
    if (!host) return;
    if (!host.querySelector('#ap-style')) {
      var st = document.createElement('style');
      st.id = 'ap-style';
      st.textContent =
        ':host,.ap-scope{--ap-card:#FFFFFF;--ap-ink:#1B1A22;--ap-ink2:#5E5B68;--ap-ink3:#928E9C;'
        + '--ap-rule:#D2CEDB;--ap-chip:rgba(156,39,66,.08);--ap-shadow:0 6px 24px rgba(28,35,51,.10)}'
        + '.ap-scope.ap-dark{--ap-card:#17151c;--ap-ink:#f4f3f6;--ap-ink2:#a09aa8;--ap-ink3:#6b6674;'
        + '--ap-rule:rgba(255,255,255,.12);--ap-chip:rgba(201,71,106,.16);'
        + '--ap-shadow:0 8px 28px rgba(0,0,0,.55)}'
        + PANEL_CSS;
      host.appendChild(st);
    }
  } catch (e) { console.warn('[AccountPanel] style inject failed:', e); }
}

function identityHtml(rows) {
  if (!rows || !rows.length) return '';
  var h = '<div class="ap-item">';
  rows.forEach(function (r) {
    h += '<div class="ap-idrow"><div class="ap-idlabel">' + esc(r.label) + '</div>'
       + '<div><div class="ap-idval">' + esc(r.value || '\u2014') + '</div>'
       + (r.note ? '<div class="ap-idnote">' + esc(r.note) + '</div>' : '')
       + '</div></div>';
  });
  return h + '</div>';
}

function segHtml(id, options, current) {
  var h = '<div class="ap-seg" id="' + id + '">';
  options.forEach(function (o) {
    h += '<button type="button" data-val="' + esc(o.value) + '"'
       + (String(o.value) === String(current) ? ' class="on"' : '') + '>'
       + esc(o.label) + '</button>';
  });
  return h + '</div>';
}

function itemHtml(title, icon, body) {
  return '<div class="ap-item"><div class="ap-itemhead">'
       + (icon ? '<span>' + icon + '</span>' : '')
       + '<h4 class="ap-itemtitle">' + esc(title) + '</h4></div>' + body + '</div>';
}

/* ─── open ────────────────────────────────────────────────────────────────
   cfg = {
     dlg           the shared dialog engine (window.Dlg)
     dark          true when the host page is in dark mode
     identity      [{label, value, note}]        read-only Account rows
     sections      [{id, group:'account'|'prefs', title, icon, html, mount(root)}]
     theme         {current, options, set(v)}    optional built-in preference
     textSize      {current, options, set(v)}    optional built-in preference
     onBuild(bd, api, root)   host hook, runs BEFORE the body is written
     onClose()                host hook, runs after the panel closes
     toast(msg, kind)
   }
   Returns {close()}. */
export function openAccountPanel(cfg) {
  cfg = cfg || {};
  var D = cfg.dlg || (typeof window !== 'undefined' ? window.Dlg : null);
  var toast = cfg.toast || function () {};
  if (!D || !D.panel) { toast('Dialog engine not loaded \u2014 refresh the page', 'error'); return null; }

  var api = null;
  var sections = (cfg.sections || []).filter(function (s) {
    if (!s || !s.group) return false;
    var ok = GROUPS.some(function (g) { return g.id === s.group; });
    if (!ok) console.warn('[AccountPanel] section "' + s.id + '" asked for group "'
      + s.group + '" — only account/prefs render. Workspace controls belong in Admin.');
    return ok;
  });

  D.panel({
    title: 'Account', icon: '\uD83D\uDC64', accent: 'slate', width: 520,
    /* ONE footer action. The old profile panel made "Update Password" the
       panel's primary button, which meant the most prominent control on a
       settings screen fired a credential change — a fat-finger hazard on a
       tablet. Password now updates from its own section, next to its own
       fields, where the consequence is visible. */
    buttons: [{ label: 'Done', kind: 'cancel' }],
    build: function (bd, a) {
      api = a;
      var root = bd.getRootNode ? bd.getRootNode() : bd;
      injectCss(root, !!cfg.dark);
      if (cfg.onBuild) { try { cfg.onBuild(bd, a, root); } catch (e) { console.warn('[AccountPanel] onBuild:', e); } }

      var h = '<div class="ap-scope' + (cfg.dark ? ' ap-dark' : '') + '">';
      GROUPS.forEach(function (g) {
        var mine = sections.filter(function (s) { return s.group === g.id; });
        var body = '';
        if (g.id === 'account') body += identityHtml(cfg.identity);
        if (g.id === 'prefs') {
          if (cfg.theme) {
            body += itemHtml('Appearance', '\u25D1',
              segHtml('ap-theme', cfg.theme.options, cfg.theme.current)
              + '<div class="ap-idnote">Follows you to every ARENCON tool on this device. '
              + 'It never changes on its own \u2014 contrast must not shift under you mid-task.</div>');
          }
          if (cfg.textSize) {
            body += itemHtml('Text size', '\uD83D\uDD24',
              segHtml('ap-ts', cfg.textSize.options, cfg.textSize.current));
          }
        }
        mine.forEach(function (s) { body += itemHtml(s.title, s.icon, s.html || ''); });
        if (!body) return;
        h += '<div class="ap-group"><div class="ap-glabel">' + esc(g.label) + '</div>'
           + '<div class="ap-gnote">' + esc(g.note) + '</div>'
           + '<div class="ap-card">' + body + '</div></div>';
      });
      h += '</div>';
      bd.innerHTML = h;

      /* Built-in preference wiring. Both apply immediately — a settings change
         you cannot see is a settings change people make twice. */
      function wireSeg(id, pref) {
        if (!pref) return;
        var el = bd.querySelector('#' + id);
        if (!el) return;
        Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
          b.onclick = function () {
            var v = b.getAttribute('data-val');
            Array.prototype.forEach.call(el.querySelectorAll('button'), function (x) {
              x.classList.toggle('on', x === b);
            });
            try { pref.set(v); } catch (e) { console.warn('[AccountPanel] pref set:', e); }
            /* The page mode may have flipped under us — repaint our own scope. */
            var sc = bd.querySelector('.ap-scope');
            if (sc && id === 'ap-theme') sc.classList.toggle('ap-dark', v === 'dark');
          };
        });
      }
      wireSeg('ap-theme', cfg.theme);
      wireSeg('ap-ts', cfg.textSize);

      sections.forEach(function (s) {
        if (s.mount) { try { s.mount(bd); } catch (e) { console.warn('[AccountPanel] mount ' + s.id + ':', e); } }
      });
    }
  }).then(function () {
    api = null;
    if (cfg.onClose) { try { cfg.onClose(); } catch (e) { console.warn('[AccountPanel] onClose:', e); } }
  });

  return { close: function () { if (api) { var a = api; api = null; a.close(); } } };
}

export default { openAccountPanel: openAccountPanel };
