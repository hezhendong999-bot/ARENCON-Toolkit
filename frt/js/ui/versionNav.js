/* ═══════════════════════════════════════════════════════════════════════════
   FRT — VERSION NAVIGATOR  (S726)
   Approved design: DEMO_version_navigator_v5_S726.html, per §11 of
   LOCKED_REPORT_VERSIONING.md.

   WHAT THIS IS. Two rows under the tab bar. Row 1 is the reports in this
   project; row 2 is the revisions of the report you are standing in. Every B
   stays visible; the A-drafts show only for the group being viewed and the
   other groups fold to a tappable count. One chip per number — issuing B01
   twice leaves two export records behind ONE chip, never two chips.

   WHAT THIS IS NOT, YET. This build DISPLAYS history. It does not open it.
   Loading a stored copy back onto the screen is a data path — done wrong it
   overwrites the live draft — and data-path work ships with Mark at a tablet
   (project rule). So historical chips render as markers, not buttons: nothing
   here can be tapped into, and nothing can therefore be lost. The folding
   count and the group switch are pure display and are live.

   §6 NOTE: withdrawal was removed from the ruling — delete replaced it. There
   is no withdrawn-but-kept state and NO struck-through chip. The v3 demo still
   shows one; it is stale and was not built from.

   Reads only. Never writes. If anything here throws, the header must still
   render — every caller wraps it. */

import { parseVersion } from '../data/versionSeq.js';

var MOUNT_ID = 'version-nav';

/* Live entries only. A tombstoned entry is a deleted number — it must not
   appear, which is exactly what makes the number available again (§3.1). */
function _liveEntries(ledger) {
  if (!Array.isArray(ledger)) return [];
  return ledger.filter(function (e) {
    return e && typeof e.v === 'string' && e.deleted !== true;
  });
}

/* Group the sequence by the B it belongs to. An issued copy opens its own
   group; its A-drafts fall in behind it. */
function _group(entries) {
  var groups = [], byKey = {};
  entries.forEach(function (e) {
    var p = parseVersion(e.v);
    if (!p) return;
    var key = p.issued ? e.v : (p.onIssue || p.letter + String(p.major));
    if (!byKey[key]) {
      byKey[key] = { key: key, issued: false, drafts: [], records: 0 };
      groups.push(byKey[key]);
    }
    if (p.issued) byKey[key].issued = true;
    else byKey[key].drafts.push(e.v);
  });
  return groups;
}

/* How many issued PDFs were recorded against a version. Issued-only, per
   Mark's ruling of 7 Sep — a working copy and the preview record nothing, so
   this count only ever counts copies that actually went out. */
function _recordCount(proj, version) {
  var recs = proj && proj.exportRecords;
  if (!Array.isArray(recs)) return 0;
  var n = 0;
  recs.forEach(function (r) { if (r && r.v === version) n++; });
  return n;
}

function _chip(label, cls) {
  var s = document.createElement('span');
  s.className = 'vchip' + (cls ? ' ' + cls : '');
  s.innerHTML = label;
  return s;
}

function _btn(label, cls, fn) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'vchip' + (cls ? ' ' + cls : '');
  b.innerHTML = label;
  b.addEventListener('click', fn);
  return b;
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/* Which group is unfolded, and the last thing we drew. Display state only —
   never saved, never synced, never read by anything but this file. There is no
   window.Model in this app, so the fold button re-renders from these instead of
   reaching for a global that does not exist. */
var _openGroup = null;
var _lastProj = null;
var _lastCurrent = '';

export function renderVersionNav(proj, current) {
  var mount = document.getElementById(MOUNT_ID);
  if (!mount) return;
  _lastProj = proj;
  _lastCurrent = current;
  mount.innerHTML = '';

  var entries = _liveEntries(proj && proj.versions);

  /* §11: collapses to nothing when there is only one revision — the common
     field case. An inspector on a first visit must not lose a strip of tablet
     height to a control with nothing in it. */
  if (entries.length < 2) { mount.style.display = 'none'; return; }
  mount.style.display = '';

  var groups = _group(entries);
  if (!_openGroup) {
    var curP = parseVersion(current);
    _openGroup = curP ? (curP.issued ? current : (curP.onIssue || null)) : null;
    if (!_openGroup && groups.length) _openGroup = groups[groups.length - 1].key;
  }

  var row = document.createElement('div');
  row.className = 'ver-row';
  var lab = document.createElement('span');
  lab.className = 'ver-lab';
  lab.textContent = 'Revisions';
  row.appendChild(lab);

  groups.forEach(function (g) {
    var recs = g.issued ? _recordCount(proj, g.key) : 0;
    var txt = _esc(g.key);
    if (g.issued) txt += ' <span class="lk">\uD83D\uDD12</span>';
    if (recs > 1) txt += ' <span class="vtag">' + recs + '\u00D7</span>';
    var isCur = (g.key === current);
    row.appendChild(_chip(txt, isCur ? 'active' : ''));

    if (g.key === _openGroup) {
      g.drafts.forEach(function (d) {
        var live = (d === current);
        row.appendChild(_chip(_esc(d), live ? 'live active' : ''));
      });
    } else if (g.drafts.length) {
      row.appendChild(_btn('\u22EF ' + g.drafts.length, 'fold', function () {
        _openGroup = g.key;
        renderVersionNav(_lastProj, _lastCurrent);
      }));
    }
  });

  mount.appendChild(row);
}
