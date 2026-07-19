/* ═══════════════════════════════════════════════════════════════════════════
   ARENCON FRT-NEXT — BETA PROJECT GATE            (S490c, Mark-approved)

   WHY THIS EXISTS
   frt-next/ and frt/ are the SAME ORIGIN (arencon.app). They share IndexedDB,
   the same Supabase project, the same R2 bucket and the same ?project=<uuid>
   deep links. A beta build is therefore NOT sandboxed: opening a real project
   in it reads and writes PRODUCTION records. A photo-path bug in beta is a
   photo-path bug in real reports (cf. S393 / S481 photo-loss lineage).

   This gate makes that mistake MECHANICALLY IMPOSSIBLE rather than unlikely.
   It is the gate, not the promise.

   BEHAVIOUR
   Runs BEFORE js/app.js (classic blocking script in <head>, so nothing can
   race it). Reads ?project= from the URL:
     - no project id            → standalone mode, nothing to corrupt → ALLOW
     - id on the allowlist      → ALLOW (a designated test project)
     - anything else            → BLOCK: replace the document, stop the boot

   Blocking is done by rewriting document.documentElement BEFORE app.js parses,
   and by throwing the boot away — no Model, no CloudSync, no IDB open, no R2
   call is ever reached. There is deliberately NO bypass button, NO URL param
   override and NO localStorage escape hatch: every one of those is a thing a
   tired person taps at 4pm on a tablet.

   ADDING A TEST PROJECT
   Create the project in the Hub as normal, copy its uuid out of the Hub URL,
   and add it to BETA_PROJECTS below with a comment naming it. Hardcoded on
   purpose — same rule as the index-portal tool list: permanent changes are
   made in the file, never through an in-app admin surface.

   NOT A SECURITY BOUNDARY. It is a fat-finger boundary, which is the actual
   risk here. Anyone with the repo can edit the list; nobody in the field can.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── The allowlist. Add test projects here, one per line, with a name. ──
  var BETA_PROJECTS = [
    // '00000000-0000-0000-0000-000000000000',  // e.g. 9999.99 BETA SANDBOX
  ];

  var pid = null;
  try { pid = new URLSearchParams(location.search).get('project'); } catch (_e) {}

  // Standalone mode (no ?project=) touches no cloud project — always allowed.
  if (!pid) { _badge('STANDALONE'); return; }

  var ok = false;
  for (var i = 0; i < BETA_PROJECTS.length; i++) {
    if (String(BETA_PROJECTS[i]).trim() === String(pid).trim()) { ok = true; break; }
  }

  if (ok) { _badge('BETA \u00B7 TEST PROJECT'); return; }

  // ── BLOCKED ──────────────────────────────────────────────────────────────
  // Wipe the document before app.js can parse. Everything downstream of this
  // point (Model, CloudSync, IDB, R2) is never constructed.
  try { window.stop && window.stop(); } catch (_e2) {}

  document.documentElement.innerHTML =
    '<head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Beta \u2014 project not permitted</title></head>' +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;' +
    'justify-content:center;background:#EFEDF0;font-family:Calibri,sans-serif;padding:24px;">' +
      '<div style="max-width:460px;background:#fff;border:1px solid #DDE1E7;' +
      'border-radius:16px;padding:26px 28px;box-shadow:0 6px 24px rgba(0,0,0,.10);">' +
        '<div style="display:inline-flex;align-items:center;gap:7px;font-size:11px;' +
        'font-weight:700;letter-spacing:.07em;color:#C0445F;border:1px solid rgba(192,68,95,.35);' +
        'background:rgba(192,68,95,.08);border-radius:999px;padding:3px 10px;margin-bottom:14px;">' +
        'BETA BUILD</div>' +
        '<div style="font-size:19px;font-weight:700;color:#1B1A22;margin-bottom:10px;">' +
        'This project can\u2019t be opened here</div>' +
        '<div style="font-size:14px;line-height:1.55;color:#5E5B68;margin-bottom:18px;">' +
        'The beta build only opens designated test projects. This one is a live project, ' +
        'and the beta shares its data with the real tool \u2014 so it stays closed here to ' +
        'keep your reports and photos safe.<br><br>' +
        'Open it in the normal Field Review Tool instead.</div>' +
        '<a href="../frt/index.html' + _q(pid) + '" ' +
        'style="display:inline-block;background:#9C2742;color:#fff;text-decoration:none;' +
        'border-radius:8px;padding:11px 22px;font-size:14px;font-weight:700;">' +
        'Open in Field Review Tool</a>' +
        '<div style="margin-top:16px;font-size:11.5px;color:#928E9C;word-break:break-all;">' +
        'Project ' + _esc(pid) + '</div>' +
      '</div></body>';

  // Halt this script's host document boot for good measure.
  throw new Error('[FRT-NEXT] Blocked: project ' + pid + ' is not on the beta allowlist.');

  // ── helpers ──
  function _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function _q(p) {
    return '?project=' + encodeURIComponent(String(p));
  }

  // Persistent corner badge so you can NEVER be unsure which build is on screen.
  function _badge(label) {
    function paint() {
      if (!document.body) { return setTimeout(paint, 30); }
      var b = document.createElement('div');
      b.id = 'frt-beta-badge';
      b.textContent = 'FRT-NEXT \u00B7 ' + label;
      b.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483647;' +
        'background:#C0445F;color:#fff;font-family:Calibri,sans-serif;font-size:10.5px;' +
        'font-weight:700;letter-spacing:.04em;padding:3px 9px;border-radius:999px;' +
        'pointer-events:none;opacity:.92;box-shadow:0 2px 8px rgba(0,0,0,.25);';
      document.body.appendChild(b);
    }
    paint();
  }
})();
