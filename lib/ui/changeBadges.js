/* ARENCON /lib/ — Change Badges (S590, Mark's spec, demo-approved 03 Aug 2026)
 *
 * Replaces the deleted cross-device conflict modal as the REVIEW surface.
 * The sync engine already applies the newest ENTRY automatically (S583/S590);
 * this module only tells the person what happened, at the exact field:
 *   • an amber count badge on any field another device changed;
 *   • tap → every incoming entry stacked newest-first (N editors — five
 *     inspectors on one field is still one badge with five rows), each with
 *     person/device, time, code path, and value;
 *   • "Keep current" dismisses; "Use <value>" adopts that entry (which
 *     restamps it as the newest entry, so it wins everywhere);
 *   • NOTHING IS EVER DELETED — every value stays in the cloud history
 *     regardless of the choice. The buttons only choose what is on screen.
 *
 * PURE OBSERVER: this module never touches the save path, the engine, or the
 * cloud. A bug here can cost a badge, never a reading. Badge state is
 * session-memory; the durable record is the tool_data_history table.
 */

export function createChangeBadges(cfg) {
  cfg = cfg || {};
  var resolveAnchor = cfg.resolveAnchor;   // (ev) → input element | null
  var labelFor      = cfg.labelFor || function (ev) { return ev.path; };
  var onAdopt       = cfg.onAdopt;         // (ev, entry) → set the field + autosave
  var whoFor        = cfg.whoFor  || function () { return null; };  // (devId) → display name | null

  var _stacks = {};      // path → [entry, ...] newest first
  var _openPath = null;
  _injectCss();

  function _devLabel(dev) {
    var who = null;
    try { who = whoFor(dev); } catch (_) {}
    var kind = /^and/.test(dev || '') ? 'Android phone'
             : /^ios/.test(dev || '') ? 'iPhone / iPad'
             : /^pc/.test(dev || '')  ? 'Computer' : 'Device';
    var short = (dev || '').split('-')[1] || '';
    return (who ? who + ' · ' : '') + kind + (short ? ' (' + short + ')' : '');
  }
  function _viaLabel(via) {
    return { save: 'while editing', autosave: 'auto-save', heartbeat: 'background sync',
             wake: 'on waking the app', reconnect: 'on reconnect', 'bg-sync': 'offline push (OS)' }[via] || (via || 'sync');
  }
  function _when(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' +
             d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return iso || ''; }
  }

  /** events: [{path, prev, next, dev, via, wroteAt, meta}] */
  function noteChanges(events) {
    (events || []).forEach(function (ev) {
      if (ev == null || !ev.path) return;
      var st = _stacks[ev.path] || (_stacks[ev.path] = []);
      st.unshift(ev);                       // newest first
      if (st.length > 12) st.length = 12;   // sane cap per field
    });
    _renderAll();
  }

  function _renderAll() {
    Object.keys(_stacks).forEach(function (path) {
      var st = _stacks[path];
      if (!st.length) return;
      var input = null;
      try { input = resolveAnchor(st[0]); } catch (_) {}
      if (!input || !input.parentElement) return;   // field not on screen — retry next render
      var host = input.parentElement;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      var b = host.querySelector(':scope > .acb-badge');
      if (!b) {
        b = document.createElement('button');
        b.type = 'button'; b.className = 'acb-badge';
        b.addEventListener('click', function (e) { e.stopPropagation(); _toggle(path); });
        host.appendChild(b);
      }
      b.textContent = String(st.length);
      b.title = st.length + ' change(s) from other devices — tap to review';
      input.classList.add('acb-flag');
    });
  }

  function _clear(path) {
    var input = null;
    try { input = _stacks[path] && _stacks[path][0] && resolveAnchor(_stacks[path][0]); } catch (_) {}
    if (input) {
      input.classList.remove('acb-flag');
      var b = input.parentElement && input.parentElement.querySelector(':scope > .acb-badge');
      if (b) b.remove();
    }
    delete _stacks[path];
    _closePop();
  }

  function _toggle(path) {
    if (_openPath === path) { _closePop(); return; }
    _closePop();
    var st = _stacks[path]; if (!st || !st.length) return;
    var input = null;
    try { input = resolveAnchor(st[0]); } catch (_) {}
    if (!input) return;
    _openPath = path;

    var pop = document.createElement('div');
    pop.className = 'acb-pop'; pop.id = 'acb-pop';
    var head = '<div class="acb-h">Changed on other devices</div>' +
      '<div class="acb-sub">' + labelFor(st[0]) + ' · current on screen: <b>' +
      _esc(_val(input)) + '</b></div>';
    var rows = st.map(function (ev, i) {
      return '<div class="acb-row">' +
        '<div class="acb-meta"><div class="acb-who">' + _esc(_devLabel(ev.dev)) + '</div>' +
        '<div class="acb-when">' + _esc(_when(ev.wroteAt)) + ' · ' + _esc(_viaLabel(ev.via)) + '</div></div>' +
        '<div class="acb-val">' + _esc(ev.next === '' ? '(cleared)' : String(ev.next)) + '</div>' +
        '<button type="button" class="acb-use" data-i="' + i + '">Use</button></div>';
    }).join('');
    var foot = '<div class="acb-actions"><button type="button" class="acb-keep">Keep current</button></div>' +
      '<div class="acb-note"><b>Nothing is deleted.</b> Every value stays in this report\u2019s cloud history either way.</div>';
    pop.innerHTML = head + rows + foot;

    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    pop.querySelector('.acb-keep').addEventListener('click', function () { _clear(path); });
    pop.querySelectorAll('.acb-use').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ev = st[parseInt(btn.getAttribute('data-i'), 10)];
        try { onAdopt && onAdopt(ev); } catch (e) { console.warn('[ChangeBadges] adopt failed:', e && e.message); }
        _clear(path);
      });
    });
    input.parentElement.appendChild(pop);
    setTimeout(function () {
      document.addEventListener('click', _closePop, { once: true });
    }, 0);
  }

  function _closePop() {
    _openPath = null;
    var p = document.getElementById('acb-pop');
    if (p) p.remove();
  }

  function _val(input) { return (input && 'value' in input) ? input.value : ''; }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function _injectCss() {
    if (document.getElementById('acb-css')) return;
    var s = document.createElement('style'); s.id = 'acb-css';
    s.textContent =
      '.acb-badge{position:absolute;top:-7px;right:-7px;min-width:18px;height:18px;border-radius:9px;' +
        'background:var(--warn,#C98A4A);color:#fff;font:700 11px Calibri,sans-serif;display:flex;' +
        'align-items:center;justify-content:center;padding:0 5px;cursor:pointer;z-index:30;' +
        'border:2px solid var(--card,#fff);box-shadow:0 2px 6px rgba(201,138,74,.5);}' +
      '.acb-badge:hover{transform:scale(1.12);}' +
      'input.acb-flag{border-color:var(--warn,#C98A4A)!important;box-shadow:0 0 0 2px rgba(201,138,74,.18)!important;}' +
      '.acb-pop{position:absolute;z-index:9000;top:calc(100% + 8px);right:-10px;width:300px;' +
        'background:var(--card,#fff);color:var(--ink,#1B1A22);border:1px solid rgba(27,26,34,.14);' +
        'border-radius:14px;box-shadow:0 10px 30px rgba(27,26,34,.22);padding:12px 14px;' +
        'font-family:Calibri,sans-serif;text-align:left;}' +
      '.acb-h{font-size:13px;font-weight:700;color:var(--warn,#C98A4A);}' +
      '.acb-sub{font-size:12px;color:var(--ink3,#928E9C);margin:2px 0 8px;}' +
      '.acb-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid rgba(27,26,34,.08);}' +
      '.acb-meta{flex:1;min-width:0;}' +
      '.acb-who{font-size:12.5px;font-weight:700;}' +
      '.acb-when{font-size:11px;color:var(--ink3,#928E9C);}' +
      '.acb-val{font-size:17px;font-weight:700;color:var(--warn,#C98A4A);}' +
      '.acb-use{padding:7px 12px;border-radius:9px;border:1px solid var(--warn,#C98A4A);background:var(--warn,#C98A4A);' +
        'color:#fff;font:700 12.5px Calibri;cursor:pointer;min-height:32px;}' +
      '.acb-actions{margin-top:8px;}' +
      '.acb-keep{width:100%;padding:9px 0;border-radius:9px;border:1px solid rgba(27,26,34,.16);background:transparent;' +
        'color:var(--ink2,#5E5B68);font:700 13px Calibri;cursor:pointer;min-height:36px;}' +
      '.acb-note{font-size:11px;color:var(--ink3,#928E9C);margin-top:8px;line-height:1.35;}' +
      '.acb-note b{color:var(--ok,#2E9E72);}' +
      '@media (pointer:coarse){.acb-badge{min-width:22px;height:22px;top:-9px;right:-9px;font-size:12px;}' +
        '.acb-use{min-height:40px;}.acb-keep{min-height:42px;}}';
    document.head.appendChild(s);
  }

  return { noteChanges: noteChanges, rerender: _renderAll, clearAll: function () {
    Object.keys(_stacks).forEach(_clear);
  } };
}
